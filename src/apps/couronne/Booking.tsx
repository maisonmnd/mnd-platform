import { asset } from '../../shared/asset';
import { useMemo, useRef, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { depositForServices, depositPctFor, useSettings } from '../../shared/settings';
import { appointmentsStore, useAppointments, type Appointment } from '../../shared/agenda';
import { askNotifyPermission, downloadIcs, notifyLocal, type IcsEvent } from '../../shared/ics';
import { enablePush, pushNotify, pushNotifyStaff } from '../../shared/push';
import { uid } from '../../shared/store';
import { kkiapayEnabled, payWithKkiapay, verifyDeposit } from '../../shared/kkiapay';
import { useAuth } from '../../shared/auth';
import { priceModeOf, type Service } from '../../shared/catalog';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, personalDurationMin, isPersonalized, servesBand, bandForService } from '../../shared/pricing';
import {
  DOW_LETTERS,
  MONTHS,
  PALIERS,
  QUATRE_TEMPS,
  dayLabelIso,
  ensureClient,
  fmtDuration,
  freeSlots,
  pad2,
  todayIso,
  useClient,
  useClientId,
  useVisibleCatalog,
  type BookingPrefill,
} from './lib';

/* RÉSERVER EN 7 TEMPS
   objectif → palier → prestations → créneau → récapitulatif → acompte → confirmé
   L'acompte suit le taux de la Maison (Paramètres du Trône), non figé. */

const TITLES = ['Votre objectif.', 'Le palier.', 'Les prestations.', 'Le créneau.', 'Récapitulatif.', 'L’acompte.', 'Confirmé.'];
const EYEBROWS = [
  'Réserver · 1 décision',
  'Réserver · palier d’expérience',
  'Réserver · prestations',
  'Réserver · disponibilité',
  'Réserver · les quatre temps',
  'Réserver · Mobile Money',
  'Réserver · scellé',
];

const PAY_METHODS = [
  { k: 'mtn', n: 'MTN MoMo' },
  { k: 'moov', n: 'Moov Money' },
] as const;
type PayKey = (typeof PAY_METHODS)[number]['k'];

type Props = {
  prefill?: BookingPrefill;
  onClose: () => void;
  toast: (msg: string) => void;
};

export default function Booking({ prefill, onClose, toast }: Props) {
  const { branch, currency } = useBranch();
  const { cats, services } = useVisibleCatalog();
  const [appts] = useAppointments();
  const clientId = useClientId();
  const client = useClient();
  const { session } = useAuth();

  const prefService = prefill ? services.find((s) => s.id === prefill.serviceId) ?? null : null;

  const [step, setStep] = useState(prefService ? 3 : 0);
  const [catId, setCatId] = useState<string | null>(prefService?.categoryId ?? null);
  const [palier, setPalier] = useState<Service['palier'] | null>(prefService?.palier ?? null);
  /* Sélection multiple : une réservation peut réunir plusieurs prestations. */
  const [selectedIds, setSelectedIds] = useState<string[]>(prefService ? [prefService.id] : []);
  const [monthIdx, setMonthIdx] = useState(0);
  const [selIso, setSelIso] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  /* Séries multi-séances : chaque séance choisie (date + heure), dans l'ordre. */
  const [sessionDates, setSessionDates] = useState<{ iso: string; time: string }[]>([]);
  const [pay, setPay] = useState<PayKey | null>(null);
  const [paying, setPaying] = useState(false);
  /* Voie choisie à l'écran d'acompte : régler en ligne (défaut quand les rails
     KkiaPay sont branchés) ou envoyer soi-même le Mobile Money. */
  const [manualDeposit, setManualDeposit] = useState(false);
  /* Identifiant de la séance 1 réservé avant le paiement (voir payOnline). */
  const onlineApptId = useRef<string | null>(null);
  /* Issue du règlement en ligne, pour que l'écran de confirmation dise la
     vérité : reçu (vérifié par le serveur), payé mais pas encore vérifié, ou
     rien du tout (voie manuelle). */
  const [onlinePaid, setOnlinePaid] = useState<{ ok: boolean; ref: string } | null>(null);

  const discountPct = prefill?.discountPct ?? 0;
  const offerLabel = prefill?.offerLabel;

  /* ---- Prestations retenues (dans l'ordre du catalogue) et agrégats ---- */
  const selected = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds]
  );
  /* SON prix, SA durée : le modèle de la cliente (nombre de locks, barème par
     tranches) et son Juste Prix personnalisent le tarif ET le créneau. */
  const [bands] = useModelBands();
  /* Les barèmes par atelier : VÈKPÈ™ a les siens, la création ne progresse pas
     comme le resserrage. */
  const [sets] = useBandSets();
  const pricing = pricingOf(client ?? undefined, bands, sets);
  const personalized = isPersonalized(pricing);
  const totalDuration = selected.reduce((n, s) => n + personalDurationMin(s, pricing), 0);
  /* Nombre de séances à programmer : le maximum parmi les prestations retenues. */
  const totalSessions = selected.reduce((n, s) => Math.max(n, s.sessions), 1);
  const knownTotal = selected.filter((s) => !s.hidePrice).reduce((n, s) => n + personalPriceXof(s, pricing), 0);
  const anyHidden = selected.some((s) => s.hidePrice);
  const allHidden = selected.length > 0 && selected.every((s) => s.hidePrice);
  /* Maître : commun si toutes le partagent, sinon celui de la première prestation. */
  const master = selected[0]?.master ?? '';
  const masterVaries = selected.length > 1 && !selected.every((s) => s.master === master);
  const summaryLabel = selected.length === 1 ? selected[0].name : `${selected.length} prestations`;

  /* Prix effectif (offre appliquée sur le total). */
  useSettings(); // re-rend quand les taux d'acompte changent au Trône
  const price = Math.round(knownTotal * (1 - discountPct / 100));
  /* Acompte UNIQUEMENT sur les prestations qui l'exigent, CHACUNE à son propre
     taux (Paramètres du Trône). Aucune → pas d'étape acompte, réservation directe. */
  const priced = selected.filter((s) => !s.hidePrice);
  /* L'acompte se calcule sur les prix PERSONNALISÉS — le pourcentage de la
     maison s'applique à ce que la cliente paiera vraiment. */
  const deposit = depositForServices(priced.map((s) => ({ id: s.id, priceXof: personalPriceXof(s, pricing) })), discountPct);
  const hasDeposit = deposit > 0;
  /* Les taux pouvant différer d'une prestation à l'autre, on n'annonce un
     pourcentage que s'il est unique — sinon le montant parle seul. */
  const depositRates = [...new Set(priced.map((s) => depositPctFor(s.id)).filter((p) => p > 0))];
  const depositPct = depositRates.length === 1 ? depositRates[0] : null;
  /* Base réellement soumise à l'acompte (≠ total : seules certaines prestations). */
  const depositBase = Math.round(
    priced.filter((s) => depositPctFor(s.id) > 0).reduce((n, s) => n + personalPriceXof(s, pricing), 0) * (1 - discountPct / 100),
  );

  /* CE QUI LA CONCERNE, ELLE. Les créations existent en cinq versions, une par
     calibre : montrer les cinq à une cliente dont on connaît le modèle ne lui
     donne pas le choix, ça lui donne l'occasion de réserver le mauvais. On ne
     retient donc que les prestations de SON calibre — et tant qu'elle n'a pas
     de modèle au dossier, `servesBand` laisse tout passer, comme avant.

     `selected` (plus haut) lit toujours le catalogue entier : une prestation
     déjà choisie ne doit pas s'évaporer d'un panier parce que le modèle a
     changé entre-temps. */
  const offre = services.filter((s) => servesBand(s, bandForService(s, pricing)));

  /* Catégories réservables : au moins une prestation visible. */
  const bookableCats = cats.filter((c) => offre.some((s) => s.categoryId === c.id));
  const catServices = offre.filter((s) => s.categoryId === catId);
  const stepServices = catServices.filter((s) => s.palier === palier);

  const toggleService = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /* ---- Calendrier : mois courant + suivant, disponibilité sur la durée TOTALE ---- */
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1].map((k) => {
      const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);

  const month = months[monthIdx];
  const calCells = useMemo(() => {
    if (!selected.length) return [];
    const first = new Date(month.y, month.m, 1);
    const daysIn = new Date(month.y, month.m + 1, 0).getDate();
    const today = todayIso();
    const cells: { key: string; day: number | null; iso?: string; free: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: `b${i}`, day: null, free: false });
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${month.y}-${pad2(month.m + 1)}-${pad2(d)}`;
      const past = iso < today;
      const free = !past && freeSlots(iso, master, totalDuration, appts, services, branch.id).length > 0;
      cells.push({ key: iso, day: d, iso, free });
    }
    return cells;
  }, [month, selected.length, master, totalDuration, appts, services, branch.id]);

  const dayTimes = selIso && selected.length
    ? freeSlots(selIso, master, totalDuration, appts, services, branch.id)
    : [];

  /* ---- Navigation ---- */
  const back = () => {
    if (paying) return;
    if (step === 0) { onClose(); return; }
    /* Depuis le récapitulatif : revenir programmer la dernière séance. */
    if (step === 4) {
      setSessionDates((prev) => prev.slice(0, -1));
      setSelIso(null); setTime(null);
      setStep(3);
      return;
    }
    if (step === 3) {
      /* Séance déjà posée dans la série : dépiler pour la reprendre. */
      if (sessionDates.length > 0) {
        setSessionDates((prev) => prev.slice(0, -1));
        setSelIso(null); setTime(null);
        return;
      }
      setSelIso(null); setTime(null);
      setStep(2);
      return;
    }
    setStep(step - 1);
  };

  /* ---- Écriture dans l'agenda partagé ----
     `online` n'est renseigné que si l'acompte vient d'être RÉGLÉ par KkiaPay et
     VÉRIFIÉ par le serveur : `confirmed` est alors le reflet d'un verdict
     serveur, jamais une décision de cet écran. La preuve, elle, vit dans la
     table `payments` (écrite par la fonction Edge) — c'est elle que le comptoir
     doit croire en cas de doute. */
  const settle = (online?: { apptId: string; transactionId: string; confirmed: boolean }) => {
    if (hasDeposit && !online && !pay) { toast('Choisissez votre moyen d’envoi.'); return; }
    if (!selected.length || sessionDates.length < totalSessions) return;
    const finalize = () => {
      const baseNotes: string[] = [];
      if (offerLabel) baseNotes.push(`Offre instantanée · ${offerLabel}`);
      if (masterVaries) baseNotes.push(`Maîtres multiples · ${selected.map((s) => s.master).join(', ')}`);
      /* Le comptoir doit savoir COMMENT la cliente annonce avoir envoyé l'acompte —
         il le vérifiera avant de le créditer (depositConfirmed). */
      if (hasDeposit && online) {
        baseNotes.push(`Acompte ${fmtMoney(deposit, currency)} réglé en ligne · KkiaPay · réf. ${online.transactionId}`);
      } else if (hasDeposit) {
        baseNotes.push(`Acompte ${fmtMoney(deposit, currency)} annoncé · ${payMethodName}`);
      }
      /* Garantit la fiche cliente sur LA MÊME branche que le RDV, sous la session
         authentifiée (l'écriture Supabase passe alors le RLS et remonte au Trône). */
      ensureClient(clientId, session?.user?.email, branch.id);
      const clientName =
        client?.name ??
        (session?.user?.email ? session.user.email.split('@')[0] : undefined) ??
        'Cliente Ma Couronne';
      /* Série liée : un identifiant commun quand il y a plusieurs séances. */
      const seriesId = totalSessions > 1 ? uid() : undefined;
      const newAppts: Appointment[] = sessionDates.map((sd, i) => {
        const notes = [...baseNotes];
        if (totalSessions > 1) notes.push(`Séance ${i + 1}/${totalSessions}`);
        return {
          /* La séance 1 porte l'identifiant RÉSERVÉ avant l'ouverture du widget :
             c'est lui qui a voyagé chez KkiaPay en `partnerId`, et par lui que le
             serveur relie le paiement à cette réservation. */
          id: i === 0 && online ? online.apptId : uid(),
          branchId: branch.id,
          clientId,
          clientName,
          serviceIds: [...selectedIds],
          date: sd.iso,
          time: sd.time,
          master,
          /* Un acompte ENCAISSÉ ET VÉRIFIÉ tient le créneau : le rendez-vous
             naît confirmé, le comptoir n'a plus à le valider à la main. Sans
             paiement prouvé, il reste « en attente » — la Maison décide. */
          status: online?.confirmed ? 'confirmé' : 'en attente',
          /* L'acompte ne s'applique qu'à la première séance (et seulement s'il y en a un). */
          depositXof: i === 0 && hasDeposit ? deposit : undefined,
          /* Un acompte n'est « reçu » que sur verdict serveur — sinon il reste
             annoncé, et le comptoir le vérifie comme aujourd'hui. */
          ...(i === 0 && online?.confirmed ? { depositConfirmed: true } : {}),
          /* PRIX PERSONNALISÉ FIGÉ dès la réservation (modèle + Juste Prix) : le
             comptoir facturera EXACTEMENT ce que la cliente a vu — le barème
             pourra bouger, pas son prix. Porté par la séance 1 (les suivantes
             valent 0, règle des séries) ; jamais figé si un prix est masqué ou
             variable (le montant se fixe au fauteuil). L'offre éventuelle est
             portée par discountPct — le net retombe sur le total annoncé. */
          ...(i === 0 && personalized && !anyHidden && !anyVariable
            ? { priceXof: knownTotal, ...(discountPct > 0 ? { discountPct } : {}) }
            : {}),
          source: 'couronne',
          note: notes.length ? notes.join(' · ') : undefined,
          ...(totalSessions > 1 ? { seriesId, seriesIndex: i + 1, seriesTotal: totalSessions } : {}),
        };
      });
      appointmentsStore.set((prev) => [...prev, ...newAppts]);
      /* Alerte le personnel du Trône (Web Push), même Le Trône fermé. */
      void pushNotifyStaff(
        online?.confirmed ? 'Réservation payée · Ma Couronne' : 'Nouvelle réservation · Ma Couronne',
        `${clientName} · ${summaryLabel}${online?.confirmed ? ` · acompte ${fmtMoney(deposit, currency)} reçu` : ''}`,
        '/trone/#/calendrier',
      );
      setPaying(false);
      setStep(6);
      /* Le bon moment pour proposer les notifications : juste après une réservation
         réussie. Web Push si possible (arrive même app fermée) ; sinon notif locale. */
      const first = sessionDates[0];
      const url = `${import.meta.env.BASE_URL}#/suivi`;
      void enablePush(clientId).then((subbed) => {
        if (!first) return;
        const body = `${summaryLabel} · ${dayLabelIso(first.iso)} à ${first.time} — la maison confirmera.`;
        if (subbed) void pushNotify(clientId, 'Réservation transmise', body, url);
        else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Réservation transmise', body); });
      });
    };

    /* Voie MANUELLE : rien n'est débité ici. La cliente envoie elle-même son
       Mobile Money et l'annonce ; l'acompte reste « annoncé » jusqu'à
       vérification au salon. Aucun théâtre de paiement — jamais. */
    setPaying(true);
    finalize();
  };

  /* ---- Acompte réglé EN LIGNE (KkiaPay) ----
     Trois temps, dans cet ordre précis : on paie, le serveur vérifie, PUIS la
     réservation s'écrit. Vérifier avant d'écrire garantit qu'un paiement abouti
     est déjà au registre (avec sa référence) même si la cliente ferme l'app à
     la seconde suivante — la Maison peut alors le rapprocher, plutôt que de
     découvrir un virement sans réservation. */
  const payOnline = async () => {
    if (paying) return;
    if (!selected.length || sessionDates.length < totalSessions) return;
    /* Identifiant réservé AVANT l'ouverture du widget : il part chez KkiaPay en
       `partnerId` et deviendra celui de la séance 1. Conservé d'une tentative à
       l'autre pour qu'un second essai retombe sur la même réservation. */
    const apptId = onlineApptId.current ?? uid();
    onlineApptId.current = apptId;
    setPaying(true);
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: deposit,
        partnerId: apptId,
        branchId: branch.id,
        clientId,
        phone: client?.phone,
        name: client?.name,
        email: session?.user?.email ?? undefined,
      });
      let confirmed = false;
      try {
        const v = await verifyDeposit({ transactionId, apptId, expectedXof: deposit, branchId: branch.id, clientId });
        confirmed = v.ok;
      } catch (e) {
        /* Le paiement a eu lieu ; seule la vérification a échoué. On réserve
           quand même, acompte « annoncé » — on ne perd ni la cliente ni sa
           référence. */
        toast(e instanceof Error ? e.message : 'Vérification impossible — la Maison vérifiera.');
      }
      setOnlinePaid({ ok: confirmed, ref: transactionId });
      settle({ apptId, transactionId, confirmed });
    } catch (e) {
      setPaying(false);
      toast(e instanceof Error ? e.message : 'Le paiement n’a pas abouti.');
    }
  };

  /* ---- Rappel fiable : le calendrier natif du téléphone (un événement par séance) ---- */
  const addToCalendar = () => {
    const names = selected.map((s) => s.name).join(' + ') || 'Rituel de la maison';
    const events: IcsEvent[] = sessionDates.map((sd, i) => ({
      title: `Maison MND · ${names}`,
      description:
        totalSessions > 1 ? `Séance ${i + 1}/${totalSessions} · avec ${master}` : `Avec ${master}`,
      location: branch.name,
      dateIso: sd.iso,
      time: sd.time,
      durationMin: totalDuration,
      alarmMin: 120,
    }));
    downloadIcs(events, 'rituel-maison-mnd.ics');
    toast('Fichier calendrier téléchargé — votre téléphone vous rappellera 2 h avant.');
  };

  const priceLabel = (s: Service, pct = 0) => {
    const mode = priceModeOf(s);
    if (mode === 'devis') return 'Prix en salon';
    /* Le prix affiché est LE SIEN — modèle + Juste Prix — pas celui du catalogue. */
    const amount = fmtMoney(Math.round(personalPriceXof(s, pricing) * (1 - pct / 100)), currency);
    return mode === 'variable' ? `à partir de ${amount}` : amount;
  };

  /* Total lisible : « Prix en salon » si tout est masqué, sinon montant (+ salon si mixte). */
  /* Un rituel à prix VARIABLE ne peut pas annoncer un total ferme : chaque ligne
     dit « à partir de », le total doit le dire aussi. */
  const anyVariable = selected.some((s) => priceModeOf(s) === 'variable');
  const totalLabel = allHidden ? 'Prix en salon' : `${anyVariable ? 'à partir de ' : ''}${fmtMoney(price, currency)}`;

  const payMethodName = PAY_METHODS.find((p) => p.k === pay)?.n ?? 'Mobile Money';

  return (
    <div className="mc-overlayscreen mc-slide">
      {/* -------- entête + progression -------- */}
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          {step < 6 ? (
            <button className="mc-linkback" onClick={back}>{step === 0 ? '← Annuler' : '← Retour'}</button>
          ) : <span />}
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <div className="mc-progress"><div style={{ width: `${((step + 1) / 7) * 100}%` }} /></div>
        <div className="mc-flowhead__titles">
          <div>
            <div className="mc-micro-eyebrow">{EYEBROWS[step]}</div>
            <h1 className="mc-flowhead__h1">{TITLES[step]}</h1>
          </div>
          <span className="mc-flowhead__count">{step + 1} / 7</span>
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">

        {/* -------- 1 · objectif -------- */}
        {step === 0 && (
          bookableCats.length > 0 ? (
            <div className="mc-stack mc-fade">
              {bookableCats.map((c) => (
                <button
                  key={c.id}
                  className="mc-rowcard"
                  onClick={() => {
                    /* Un seul palier peuplé → on saute l'étape : « Fondation/Élévation/
                       Souveraineté » est notre taxonomie, pas un choix que la cliente
                       doit deviner quand il n'y a rien à choisir. */
                    const paliers = [...new Set(offre.filter((s) => s.categoryId === c.id).map((s) => s.palier))];
                    setCatId(c.id); setSelectedIds([]);
                    if (paliers.length === 1) { setPalier(paliers[0]); setStep(2); }
                    else { setPalier(null); setStep(1); }
                  }}
                >
                  <div>
                    <div className="mc-rowcard__fon">{c.fon}</div>
                    <div className="mc-rowcard__sub">{c.label}</div>
                  </div>
                  <span className="mc-rowcard__arrow">→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mc-emptyzone">
              <div className="mc-emptyzone__glyph">✦</div>
              <div className="mc-emptyzone__t">L’offre se prépare.</div>
              <div className="mc-emptyzone__s">
                La maison compose en ce moment ses rituels. Revenez très bientôt — votre couronne sera reçue comme il se doit.
              </div>
              <button className="mc-cta mc-cta--outline" style={{ marginTop: 22 }} onClick={onClose}>
                Revenir à l’accueil
              </button>
            </div>
          )
        )}

        {/* -------- 2 · palier -------- */}
        {step === 1 && (
          <div className="mc-stack mc-fade" style={{ gap: 12 }}>
            {PALIERS.map((p) => {
              const n = catServices.filter((s) => s.palier === p.key).length;
              return (
                <button
                  key={p.key}
                  className={`mc-paliercard ${n === 0 ? 'is-off' : ''}`}
                  disabled={n === 0}
                  onClick={() => { setPalier(p.key); setSelectedIds([]); setStep(2); }}
                >
                  <span className="mc-paliercard__filet" />
                  <div className="mc-paliercard__name">{p.key}</div>
                  <div className="mc-paliercard__sub">
                    {n === 0 ? 'Aucune prestation à ce palier pour cet objectif.' : p.sub}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* -------- 3 · prestations (sélection multiple) -------- */}
        {step === 2 && (
          <div className="mc-fade">
            <div className="mc-stack">
              {stepServices.map((s) => {
                const on = selectedIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    className={`mc-svccard ${on ? 'is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleService(s.id)}
                  >
                    <div className="mc-svccard__top">
                      <div className="mc-svccard__name">{s.name}</div>
                      <span className="mc-svccard__box" aria-hidden />
                    </div>
                    <div className="mc-svccard__meta">
                      {priceLabel(s)} · {fmtDuration(s.durationMin)} · {s.sessions} séance{s.sessions > 1 ? 's' : ''} · avec {s.master}
                    </div>
                    {s.description && <div className="mc-svccard__meta">{s.description}</div>}
                    {s.sessions > 1 && (
                      <span className="mc-pillseal">Série · {s.sessions} séances · prix unique</span>
                    )}
                  </button>
                );
              })}
            </div>

            {stepServices.length > 0 && (
              <div className="mc-multibar">
                <div className="mc-multibar__info">
                  <span className="mc-multibar__count">
                    {selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}
                  </span>
                  <span className="mc-multibar__meta">
                    {selectedIds.length
                      ? `${totalLabel} · ${fmtDuration(totalDuration)}`
                      : 'Choisissez une ou plusieurs prestations.'}
                  </span>
                </div>
                <button
                  className="mc-cta mc-cta--indigo mc-multibar__cta"
                  disabled={selectedIds.length === 0}
                  onClick={() => { setSessionDates([]); setSelIso(null); setTime(null); setMonthIdx(0); setStep(3); }}
                >
                  Continuer
                </button>
              </div>
            )}
          </div>
        )}

        {/* -------- 4 · créneau -------- */}
        {step === 3 && selected.length > 0 && (
          <div className="mc-fade">
            {(discountPct > 0 || prefService) && (
              <div className="mc-prefillnote">
                {summaryLabel}
                {discountPct > 0 ? ` · ${offerLabel ?? 'offre appliquée'} · −${discountPct} %` : ` · avec ${master}`}
              </div>
            )}
            {totalSessions > 1 && (
              <div className="mc-sessionhead">
                <div className="mc-sessionhead__row">
                  <span className="mc-sessionhead__k">Séance {sessionDates.length + 1} sur {totalSessions}</span>
                  <span className="mc-sessionhead__steps" aria-hidden="true">
                    {Array.from({ length: totalSessions }, (_, i) => (
                      <i key={i} className={i < sessionDates.length ? 'is-done' : i === sessionDates.length ? 'is-now' : ''} />
                    ))}
                  </span>
                </div>
                <span className="mc-sessionhead__s">Choisissez la date et l’heure de cette séance.</span>
                {sessionDates.length > 0 && (
                  <div className="mc-sessionchips">
                    {sessionDates.map((sd, i) => (
                      <button
                        key={i}
                        className="mc-sessionchip mc-sessionchip--btn"
                        aria-label={`Reprendre la séance ${i + 1} — ${dayLabelIso(sd.iso)} à ${sd.time}`}
                        onClick={() => {
                          setSessionDates((prev) => prev.filter((_, k) => k !== i));
                          setSelIso(null);
                          setTime(null);
                        }}
                      >
                        S{i + 1} · {dayLabelIso(sd.iso)} · {sd.time}
                        <span className="mc-sessionchip__x" aria-hidden="true">✕</span>
                      </button>
                    ))}
                  </div>
                )}
                {sessionDates.length > 0 && (
                  <span className="mc-sessionhead__hint">Touchez une séance pour la reprendre.</span>
                )}
                <span className="mc-sessionhead__note">
                  La prestation est réglée une fois — les séances suivantes sont incluses.
                </span>
              </div>
            )}
            <div className="mc-calnav">
              <button onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0}>‹</button>
              <span>{month.label}</span>
              <button onClick={() => setMonthIdx(Math.min(months.length - 1, monthIdx + 1))} disabled={monthIdx === months.length - 1}>›</button>
            </div>
            <div className="mc-calgrid mc-calgrid--dows">
              {DOW_LETTERS.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mc-calgrid">
              {calCells.map((c) =>
                c.day === null ? (
                  <span key={c.key} />
                ) : (
                  <button
                    key={c.key}
                    className={`mc-calday ${c.iso === selIso ? 'is-sel' : ''} ${c.free ? 'is-free' : 'is-off'}`}
                    onClick={() => {
                      if (!c.free) { toast('Aucune disponibilité ce jour.'); return; }
                      setSelIso(c.iso!); setTime(null);
                    }}
                  >
                    {c.day}
                    {c.free && c.iso !== selIso && <i />}
                  </button>
                )
              )}
            </div>
            <div className="mc-callegend">
              <span />Jours avec créneaux libres · {fmtDuration(totalDuration)} · maître {master}{masterVaries ? ' +' : ''}
            </div>

            {selIso && (
              <div className="mc-fade" style={{ marginTop: 20 }}>
                <div className="mc-micro-eyebrow" style={{ marginBottom: 10 }}>{dayLabelIso(selIso)} · heures libres</div>
                <div className="mc-stack">
                  {dayTimes.map((t) => (
                    <button
                      key={t}
                      className="mc-slotcard"
                      onClick={() => {
                        if (!selIso) return;
                        const next = [...sessionDates, { iso: selIso, time: t }];
                        setSessionDates(next);
                        setTime(t);
                        if (next.length < totalSessions) {
                          setSelIso(null); setTime(null); setMonthIdx(0);
                        } else {
                          setStep(4);
                        }
                      }}
                    >
                      <div>
                        <div className="mc-slotcard__time">{t}</div>
                        <div className="mc-slotcard__who">avec {master}{masterVaries ? ' +' : ''} · {fmtDuration(totalDuration)}</div>
                      </div>
                      <span className="mc-slotcard__free">Libre</span>
                    </button>
                  ))}
                  {dayTimes.length === 0 && <div className="mc-emptyline">Plus de créneau ce jour — choisissez un autre jour.</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* -------- 5 · récapitulatif -------- */}
        {step === 4 && selected.length > 0 && selIso && time && (
          <div className="mc-fade">
            <div className="mc-recapcard">
              {selected.map((s) => (
                <div key={s.id} className="mc-recapcard__svcline">
                  <div>
                    <div className="mc-recapcard__svcname">{s.name}</div>
                    <div className="mc-recapcard__svcsub">{fmtDuration(s.durationMin)} · avec {s.master}</div>
                  </div>
                  <div className="mc-recapcard__svcprice">{priceLabel(s, discountPct)}</div>
                </div>
              ))}
              {discountPct > 0 && knownTotal > 0 && (
                <div className="mc-recapcard__deal">
                  {offerLabel ?? 'Offre instantanée'} · −{discountPct} % <s>{fmtMoney(knownTotal, currency)}</s>
                </div>
              )}
              <div className="mc-hairline" />
              <div className="mc-recapcard__total">
                <span>Total{anyHidden && !allHidden ? ' connu' : ''}</span>
                <span>{totalLabel}</span>
              </div>
              <div className="mc-recapcard__meta">
                {selected.length} prestation{selected.length > 1 ? 's' : ''} · {fmtDuration(totalDuration)} · avec {master}{masterVaries ? ' +' : ''}
              </div>
              {personalized && pricing.band && client?.lockCount ? (
                <div className="mc-recapcard__meta" style={{ color: 'var(--copper-700, #7C4C2C)' }}>
                  Vos prix — établis pour votre couronne de {client.lockCount} locks.
                </div>
              ) : null}
              {anyHidden && !allHidden && (
                <div className="mc-recapcard__meta">Une prestation se règle en salon.</div>
              )}
              <div className="mc-hairline" />
              {sessionDates.map((sd, i) => (
                <div key={i} className="mc-recapcard__line">
                  <span>{totalSessions > 1 ? `Séance ${i + 1}/${totalSessions}` : 'Créneau'}</span>
                  <span>{dayLabelIso(sd.iso)} · {sd.time}</span>
                </div>
              ))}
              {totalSessions > 1 && (
                <div className="mc-recapcard__meta">
                  Série liée · la prestation est réglée une fois — les séances 2 à {totalSessions} sont incluses{hasDeposit ? ' · acompte sur la 1ʳᵉ' : ''}.
                </div>
              )}
              <div className="mc-recapcard__line"><span>Maison</span><span>{branch.name}</span></div>
            </div>

            <div className="mc-sectionlabel">Les quatre temps</div>
            {QUATRE_TEMPS.map((t) => (
              <div key={t.no} className="mc-temps">
                <span className="mc-temps__no">{t.no}</span>
                <div>
                  <div className="mc-temps__n">{t.n}</div>
                  <div className="mc-temps__g">{t.g}</div>
                </div>
              </div>
            ))}

            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 6 }} onClick={() => (hasDeposit ? setStep(5) : settle())} disabled={paying}>
              {hasDeposit ? 'Continuer · acompte' : 'Confirmer la réservation'}
            </button>
          </div>
        )}

        {/* -------- 6 · acompte (taux de la Maison) --------
            DIRE VRAI, dans les deux voies. Rails KkiaPay branchés : la cliente
            paie POUR DE BON, et l'acompte n'est réputé reçu qu'après vérification
            serveur. Rails éteints (pas de clé publique au build) : elle envoie
            elle-même son Mobile Money et l'annonce, le salon vérifie avant de
            créditer. L'écran d'origine, lui, SIMULAIT un paiement (« paiement
            sécurisé », fausse demande poussée au téléphone) : trahison de
            confiance assurée au premier passage en salon. Ne jamais le remettre —
            un écran de paiement ne s'affiche que s'il débite vraiment. */}
        {step === 5 && selected.length > 0 && (
          <div className="mc-fade">
            <div className="mc-depositcard">
              <div className="mc-depositcard__label">{depositPct !== null && depositPct >= 100 ? 'Prestation à régler d’avance' : 'Acompte à envoyer'}</div>
              <div className="mc-depositcard__amount">{allHidden ? 'Au salon' : fmtMoney(deposit, currency)}</div>
              <div className="mc-depositcard__sub">
                {allHidden
                  ? 'Acompte réglé au salon'
                  : depositPct !== null && depositPct >= 100
                    ? 'Montant intégral de la prestation'
                    : `${depositPct !== null ? `${depositPct} % de ${fmtMoney(depositBase, currency)}` : 'Acompte des prestations concernées'} · ${anyHidden ? 'reste' : 'solde'} au salon`}
              </div>
            </div>
            {/* VOIE EN LIGNE — n'apparaît que si les rails KkiaPay sont branchés
                (clé publique au build). Sans eux, l'écran reste exactement celui
                d'avant : le mode d'emploi Mobile Money, honnête. */}
            {!allHidden && kkiapayEnabled() && !manualDeposit ? (
              <>
                <div className="mc-sectionlabel">Régler maintenant</div>
                <div className="mc-recapcard" style={{ textAlign: 'left' }}>
                  <div className="mc-recapcard__line"><span>Mobile Money · carte</span><span>{fmtMoney(deposit, currency)}</span></div>
                  <div className="mc-recapcard__line"><span>Reste au salon</span><span>{anyHidden ? 'à convenir' : fmtMoney(Math.max(0, knownTotal - deposit), currency)}</span></div>
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={payOnline} disabled={paying}>
                  {paying ? 'Paiement en cours…' : `Payer l’acompte · ${fmtMoney(deposit, currency)}`}
                </button>
                <button
                  className="mc-textbtn"
                  style={{ marginTop: 12 }}
                  onClick={() => setManualDeposit(true)}
                  disabled={paying}
                >
                  J’enverrai l’acompte moi-même
                </button>
                <div className="mc-footnote">Votre acompte est crédité dès la confirmation du paiement.</div>
              </>
            ) : (
              <>
                {!allHidden && (
                  <>
                    <div className="mc-sectionlabel">Comment faire</div>
                    <div className="mc-recapcard" style={{ textAlign: 'left' }}>
                      <div className="mc-recapcard__line"><span>1 · Envoyez</span><span>{fmtMoney(deposit, currency)}</span></div>
                      <div className="mc-recapcard__line"><span>2 · Au numéro de la Maison</span><span>{branch.phone || 'communiqué sur WhatsApp'}</span></div>
                      <div className="mc-recapcard__line"><span>3 · Puis annoncez l’envoi</span><span>bouton ci-dessous</span></div>
                    </div>
                  </>
                )}
                <div className="mc-sectionlabel">Envoyé par</div>
                <div className="mc-stack">
                  {PAY_METHODS.map((pm) => (
                    <button
                      key={pm.k}
                      className={`mc-paycard ${pay === pm.k ? 'is-on' : ''}`}
                      onClick={() => setPay(pm.k)}
                    >
                      <span>{pm.n}</span>
                      <span className="mc-paycard__dot" />
                    </button>
                  ))}
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={() => settle()} disabled={paying}>
                  {allHidden ? 'Confirmer la réservation' : `J’ai envoyé l’acompte · ${fmtMoney(deposit, currency)}`}
                </button>
                {!allHidden && kkiapayEnabled() && (
                  <button className="mc-textbtn" style={{ marginTop: 12 }} onClick={() => setManualDeposit(false)} disabled={paying}>
                    ← Régler en ligne plutôt
                  </button>
                )}
                <div className="mc-footnote">La Maison vérifie la réception avant votre passage.</div>
              </>
            )}
          </div>
        )}

        {/* -------- 7 · confirmé -------- */}
        {step === 6 && selected.length > 0 && selIso && time && (
          <div className="mc-confirm mc-rise">
            <div className="mc-confirm__seal"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
            <h2>Votre rituel est scellé.</h2>
            <p>
              {onlinePaid?.ok
                ? 'Votre acompte est reçu, votre créneau est tenu. '
                : 'La Maison confirme votre créneau très vite. '}
              Ajoutez le rituel à votre calendrier : c’est lui qui vous rappellera sur votre
              téléphone, même l’app fermée.
            </p>
            <div className="mc-recapcard" style={{ textAlign: 'left' }}>
              <div className="mc-recapcard__name">{summaryLabel}</div>
              <div className="mc-recapcard__meta">
                {totalSessions > 1 ? `${totalSessions} séances liées` : `${dayLabelIso(selIso)} · ${time}`} · {fmtDuration(totalDuration)} · avec {master}{masterVaries ? ' +' : ''}
              </div>
              <div className="mc-hairline" />
              {totalSessions > 1 &&
                sessionDates.map((sd, i) => (
                  <div key={i} className="mc-recapcard__line">
                    <span>Séance {i + 1}/{totalSessions}</span>
                    <span>{dayLabelIso(sd.iso)} · {sd.time}</span>
                  </div>
                ))}
              {/* DIRE VRAI ici aussi : annoncer « à vérifier » à une cliente qui
                  vient de payer en ligne détruit exactement la confiance que le
                  paiement venait d'acheter. Trois issues, trois phrases. */}
              <div className="mc-recapcard__line">
                <span>Acompte</span>
                <span>
                  {!hasDeposit
                    ? 'Au salon'
                    : onlinePaid?.ok
                      ? `${fmtMoney(deposit, currency)} · reçu`
                      : onlinePaid
                        ? `${fmtMoney(deposit, currency)} · payé · vérification en cours`
                        : `${fmtMoney(deposit, currency)} · à vérifier par la Maison`}
                </span>
              </div>
              {onlinePaid && (
                <div className="mc-recapcard__line"><span>Référence</span><span>{onlinePaid.ref}</span></div>
              )}
              <div className="mc-recapcard__line">
                <span>Statut</span>
                <span>{onlinePaid?.ok ? 'Confirmé' : 'En attente de la maison'}</span>
              </div>
            </div>
            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 20 }} onClick={addToCalendar}>
              Ajouter au calendrier
            </button>
            <button className="mc-quietbtn" onClick={onClose}>Revenir à l’accueil</button>
          </div>
        )}
      </div>
    </div>
  );
}
