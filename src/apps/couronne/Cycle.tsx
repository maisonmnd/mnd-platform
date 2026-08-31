import { useMemo, useState } from 'react';
import { asset } from '../../shared/asset';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { uid } from '../../shared/store';
import { useAuth } from '../../shared/auth';
import { appointmentsStore, useAppointments, type Appointment } from '../../shared/agenda';
import { pushNotifyStaff } from '../../shared/push';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, personalDurationMin, servesBand, bandForService } from '../../shared/pricing';
import { useServices, useProducts, useCategories, type Service, type ServiceInclus } from '../../shared/catalog';
import {
  dateOfIso, dayLabelIso, ensureClient, fmtDuration, isoOf, todayIso, freeSlots, useCreneauxOccupes, useClient, useClientId,
} from './lib';

/* ═══ LE CYCLE — un forfait de plusieurs séances, scellé d'un geste ═══
   (16 août, demande de Yéman : « pourquoi demander ce forfait ? Je veux
   passer au paiement directement. Le paiement en 2 fois. La réservation
   automatique des dates selon les fréquences prédéfinies. Le client ne fait
   que modifier ou confirmer. Ne jamais choisir les dimanches ou lundi. »)

   LA CADENCE NE S'INVENTE PAS : elle est déjà au Catalogue. Chaque ligne d'un
   forfait porte son `afterWeeks` — « dans combien de semaines après la visite
   d'ouverture ». Les lignes qui tombent la MÊME semaine font UNE séance : le
   Trimestriel donne 5 séances (semaines 0 · 4 · 6 · 8 · 12), YÈKPÈ™ × 3 en
   donne 7. Un produit de la Gamme ne devient pas un rendez-vous — il se remet
   au comptoir.

   LES JOURS FERMÉS SE TIENNENT TOUT SEULS. `freeSlots` lit les heures du salon
   (lundi et dimanche fermés), les journées exceptionnelles, les créneaux
   bloqués et le plafond du jour : un jour fermé ne rend AUCUN créneau. La
   proposition avance donc de jour en jour jusqu'à en trouver un — elle ne peut
   pas poser un dimanche même si elle le voulait.

   L'ARGENT, DIT COMME IL EST. Aucun rail ne débite en ligne aujourd'hui (ni
   clé KkiaPay, ni MoMo Open API) : l'écran ne fait donc PAS semblant. Elle
   envoie sa 1ʳᵉ tranche par Mobile Money et l'annonce ; le comptoir vérifie
   avant de créditer. La 2ᵉ tranche est portée par la séance du milieu, où elle
   sera de toute façon au fauteuil. */

const PAY_METHODS = [
  { k: 'mtn', n: 'MTN MoMo' },
  { k: 'moov', n: 'Moov Money' },
] as const;
type PayKey = (typeof PAY_METHODS)[number]['k'];

const plusJours = (iso: string, n: number): string => {
  const d = dateOfIso(iso);
  return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

/** LES SEMAINES D'UN FORFAIT — donc ses séances. Le juge de vérité, et NON le
    champ `sessions` : les deux se contredisent au catalogue (« Forfait VÈKPÈ™
    Initiation » annonce 1 séance quand sa cadence en dessine 3 ; l'Abonnement
    Annuel en annonce 24 pour 19 semaines distinctes). La cadence est ce que la
    cliente vivra vraiment — c'est elle qui commande. Un produit de la Gamme ne
    fait pas une séance : il se remet au comptoir. */
export const semainesDuForfait = (f: Service, services: readonly Service[]): number[] => {
  const w = new Set<number>();
  for (const inc of f.includes ?? []) {
    if (inc.productId) continue;
    const existe = inc.categoryId
      ? services.some((x) => x.categoryId === inc.categoryId)
      : services.some((x) => x.id === inc.serviceId);
    if (existe) w.add(inc.afterWeeks ?? 0);
  }
  return [...w].sort((a, b) => a - b);
};

type Seance = {
  semaine: number;
  serviceIds: string[];
  noms: string[];
  dureeMin: number;
};

type Props = {
  forfait: Service;
  /** Revenir à la liste des forfaits. */
  onClose: () => void;
  /** Tout refermer — une fois le cycle scellé. */
  onFini: () => void;
  toast: (msg: string) => void;
};

export default function Cycle({ forfait, onClose, onFini, toast }: Props) {
  const { branch, currency } = useBranch();
  const { session } = useAuth();
  const client = useClient();
  const clientId = useClientId();
  const [appts] = useAppointments();
  /* CE QUE LE SALON A DÉJÀ PRIS — 31 août 2026. Même raison qu'à la
     réservation : la RLS ne laisse lire à une cliente que SES rendez-vous, et
     un cycle proposé contre un agenda vide tombe sur des heures occupées. La
     fenêtre couvre six mois, un cycle se posant loin devant. Voir la migration
     0079 et le commentaire de `freeSlots`. */
  const fenetreCycle = useMemo(() => {
    const d = new Date();
    const fin = new Date(d.getFullYear(), d.getMonth() + 6, 0);
    return { du: isoOf(d), au: isoOf(fin) };
  }, []);
  const occupes = useCreneauxOccupes(branch.id, fenetreCycle.du, fenetreCycle.au);
  /* LE CATALOGUE ENTIER : la composition d'un forfait ne dépend pas de ce
     qu'on montre à cette cliente-là (règle du 15–16 août). */
  const [tousServices] = useServices();
  const [produits] = useProducts();
  const [cats] = useCategories();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const pricing = pricingOf(client ?? undefined, bands, sets, cats);

  /* ---- La composition, résolue en prestations réelles ---- */
  const svcDe = (inc: ServiceInclus): Service | undefined => {
    if (inc.productId) return undefined;
    /* Une ligne « au choix dans l'atelier » se résout au calibre de la tête —
       même règle qu'à la réservation (les créations existent par calibre). */
    if (inc.categoryId) {
      return tousServices.find((x) => x.categoryId === inc.categoryId && servesBand(x, bandForService(x, pricing)));
    }
    return tousServices.find((x) => x.id === inc.serviceId);
  };

  const seances: Seance[] = useMemo(() => {
    const parSemaine = new Map<number, Service[]>();
    for (const inc of forfait.includes ?? []) {
      const s = svcDe(inc);
      if (!s) continue;
      const w = inc.afterWeeks ?? 0;
      parSemaine.set(w, [...(parSemaine.get(w) ?? []), s]);
    }
    return [...parSemaine.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([semaine, liste]) => ({
        semaine,
        serviceIds: liste.map((s) => s.id),
        noms: liste.map((s) => s.name),
        dureeMin: liste.reduce((n, s) => n + personalDurationMin(s, pricing), 0) || 60,
      }));
  }, [forfait, tousServices, pricing]);

  /* Le maître du forfait, ou celui de sa première prestation. */
  const master = forfait.master || tousServices.find((s) => s.id === seances[0]?.serviceIds[0])?.master || '';

  /* ---- LES DATES PROPOSÉES — une fois, à l'ouverture ----
     Deux jours de battement avant la première séance, puis chaque séance à sa
     semaine, décalée au premier jour qui a VRAIMENT un créneau libre. Une date
     ne recule jamais derrière la précédente. */
  const proposer = (): { iso: string; time: string }[] => {
    const out: { iso: string; time: string }[] = [];
    let plancher = plusJours(todayIso(), 2);
    let depart = '';
    seances.forEach((s, i) => {
      const vise = i === 0 ? plancher : plusJours(depart, s.semaine * 7);
      let iso = vise < plancher ? plancher : vise;
      let pose = false;
      for (let k = 0; k < 120 && !pose; k += 1) {
        const libres = freeSlots(iso, master, s.dureeMin, appts, tousServices, branch.id, occupes);
        if (libres.length) {
          out.push({ iso, time: libres[0] });
          if (i === 0) depart = iso;
          plancher = plusJours(iso, 1);
          pose = true;
        } else {
          iso = plusJours(iso, 1);
        }
      }
      if (!pose) out.push({ iso: '', time: '' });
    });
    return out;
  };
  const [dates, setDates] = useState<{ iso: string; time: string }[]>(proposer);
  /* La séance qu'on est en train de déplacer — index, ou null. */
  const [retouche, setRetouche] = useState<number | null>(null);
  const [jourRetouche, setJourRetouche] = useState<string | null>(null);

  const complet = dates.length === seances.length && dates.every((d) => d.iso && d.time);

  /* ---- L'argent ---- */
  const total = personalPriceXof(forfait, pricing, tousServices, produits);
  const base = useMemo(
    () => (forfait.includes ?? []).reduce((n, inc) => {
      if (inc.productId) return n + (produits.find((p) => p.id === inc.productId)?.priceXof ?? 0);
      const s = svcDe(inc);
      return n + (s ? personalPriceXof(s, pricing, tousServices, produits) : 0);
    }, 0),
    [forfait, tousServices, produits, pricing],
  );
  /* 50 / 50 — l'arrondi va à la première tranche, la Maison ne perd pas le franc. */
  const tranche1 = Math.ceil(total / 2);
  const tranche2 = total - tranche1;
  /* LA 2ᵉ TRANCHE TOMBE À LA SÉANCE DU MILIEU (décision de Yéman) : elle sera
     au fauteuil ce jour-là, la Maison n'a personne à relancer. */
  const milieu = Math.max(1, Math.ceil(seances.length / 2) - 1);

  const [pay, setPay] = useState<PayKey | null>(null);
  const [scelle, setScelle] = useState(false);

  /* ---- Les jours ouvrables des huit prochaines semaines, pour la retouche ---- */
  const joursOuverts = useMemo(() => {
    if (retouche === null) return [];
    const s = seances[retouche];
    const out: string[] = [];
    let iso = plusJours(todayIso(), 1);
    for (let k = 0; k < 70 && out.length < 24; k += 1) {
      if (freeSlots(iso, master, s.dureeMin, appts, tousServices, branch.id, occupes).length) out.push(iso);
      iso = plusJours(iso, 1);
    }
    return out;
  }, [retouche, seances, master, appts, tousServices, branch.id]);

  const heuresDuJour = retouche !== null && jourRetouche
    ? freeSlots(jourRetouche, master, seances[retouche].dureeMin, appts, tousServices, branch.id, occupes)
    : [];

  const poser = (i: number, iso: string, time: string) => {
    setDates((prev) => prev.map((d, k) => (k === i ? { iso, time } : d)));
    setRetouche(null);
    setJourRetouche(null);
  };

  /* ---- SCELLER : les N séances entrent au carnet, liées en série ---- */
  const sceller = () => {
    if (!complet || scelle) return;
    if (!pay) { toast('Choisissez votre moyen d’envoi.'); return; }
    ensureClient(clientId, session?.user?.email, branch.id);
    const clientName = client?.name
      ?? (session?.user?.email ? session.user.email.split('@')[0] : undefined)
      ?? 'Cliente Ma Couronne';
    const moyen = PAY_METHODS.find((p) => p.k === pay)?.n ?? 'Mobile Money';
    const seriesId = uid();
    const nouveaux: Appointment[] = seances.map((s, i) => {
      const notes = [`Forfait · ${forfait.name}`, `Séance ${i + 1}/${seances.length}`];
      if (i === 0) notes.push(`1ʳᵉ tranche ${fmtMoney(tranche1, currency)} annoncée · ${moyen}`);
      if (i === milieu) notes.push(`2ᵉ tranche ${fmtMoney(tranche2, currency)} à régler ce jour`);
      return {
        id: uid(),
        branchId: branch.id,
        clientId,
        clientName,
        serviceIds: [...s.serviceIds],
        date: dates[i].iso,
        time: dates[i].time,
        master,
        status: 'en attente',
        /* LE FORFAIT VAUT POUR TOUT LE CYCLE, porté par la séance 1 : les
           séances 2+ valent 0 (règle des séries, `apptNetXof`). Le cycle ne
           se compte donc qu'UNE fois dans le chiffre. */
        ...(i === 0
          ? {
            forfait: { nom: forfait.name, totalXof: total, baseXof: base, poseAt: todayIso() },
            depositXof: tranche1,
          }
          : {}),
        ...(pricing.longueur ? { longueur: pricing.longueur } : {}),
        source: 'couronne',
        note: notes.join(' · '),
        seriesId,
        seriesIndex: i + 1,
        seriesTotal: seances.length,
      };
    });
    appointmentsStore.set((prev) => [...prev, ...nouveaux]);
    void pushNotifyStaff(
      'Forfait réservé · Ma Couronne',
      `${clientName} · ${forfait.name} · ${seances.length} séances · ${fmtMoney(total, currency)} · 1ʳᵉ tranche ${fmtMoney(tranche1, currency)} annoncée`,
      '/trone/#/calendrier',
    );
    setScelle(true);
    toast('Cycle transmis, la Maison confirme vos créneaux.');
  };

  /* ═══════════════ SCELLÉ ═══════════════ */
  if (scelle) {
    return (
      <div className="mc-overlayscreen mc-slide">
        <div className="mc-confirm mc-rise" style={{ margin: 'auto 0', padding: '0 24px' }}>
          <img src={asset('/assets/monograms/mono-copper.png')} alt="" style={{ width: 46, opacity: 0.92 }} />
          <h2 style={{ marginTop: 18 }}>Votre cycle est posé.</h2>
          <p>
            {seances.length} séances sont entrées au carnet de la Maison. Elle vérifie votre
            1ʳᵉ tranche et confirme vos créneaux, vous les retrouvez dans « Mes rendez-vous ».
          </p>
          <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
            <div className="mc-recapcard__name">{forfait.name}</div>
            <div className="mc-recapcard__meta">{seances.length} séances · {fmtMoney(total, currency)}</div>
            <div className="mc-hairline" />
            {dates.map((d, i) => (
              <div key={i} className="mc-recapcard__line">
                <span>Séance {i + 1}</span>
                <span>{dayLabelIso(d.iso)} · {d.time}</span>
              </div>
            ))}
            <div className="mc-hairline" />
            <div className="mc-recapcard__line"><span>1ʳᵉ tranche · annoncée</span><span>{fmtMoney(tranche1, currency)}</span></div>
            <div className="mc-recapcard__line"><span>2ᵉ tranche · séance {milieu + 1}</span><span>{fmtMoney(tranche2, currency)}</span></div>
          </div>
          <button className="mc-cta mc-cta--indigo" style={{ marginTop: 22 }} onClick={onFini}>
            Revenir à l’accueil
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════ LE CYCLE ═══════════════ */
  return (
    <div className="mc-overlayscreen mc-slide">
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          <button className="mc-linkback" onClick={onClose}>← Retour</button>
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        <div className="mc-micro-eyebrow" style={{ marginTop: 8 }}>Votre cycle · {seances.length} séances</div>
        <h1 className="mc-flowhead__h1">{forfait.name}</h1>
      </div>

      <div className="mc-scroll mc-flowbody" style={{ paddingBottom: 8 }}>
        <div className="mc-packintro">
          Vos dates sont déjà posées, à la cadence de la Maison. Changez celles qui ne vous vont
          pas, le salon est fermé le lundi et le dimanche, ces jours ne se proposent jamais.
        </div>

        {seances.map((s, i) => {
          const d = dates[i];
          const ouvert = retouche === i;
          return (
            <div key={i} className={`mc-seance ${ouvert ? 'is-open' : ''}`}>
              <div className="mc-seance__head">
                <span className="mc-seance__no">Séance {i + 1}</span>
                <span className="mc-seance__quand">
                  {d?.iso ? `${dayLabelIso(d.iso)} · ${d.time}` : 'aucun créneau trouvé'}
                </span>
              </div>
              <div className="mc-seance__quoi">{s.noms.join(' · ')}</div>
              <div className="mc-seance__meta">
                {fmtDuration(s.dureeMin)}
                {s.semaine > 0 ? ` · à ${s.semaine} semaine${s.semaine > 1 ? 's' : ''} du départ` : ' · la visite d’ouverture'}
                {i === milieu ? ` · 2ᵉ tranche ${fmtMoney(tranche2, currency)}` : ''}
              </div>
              <button
                className="mc-textbtn mc-seance__btn"
                onClick={() => { setRetouche(ouvert ? null : i); setJourRetouche(null); }}
              >
                {ouvert ? 'Garder cette date' : 'Changer cette date →'}
              </button>

              {ouvert && (
                <div className="mc-fade" style={{ marginTop: 10 }}>
                  <div className="mc-micro-eyebrow" style={{ marginBottom: 8 }}>Le jour</div>
                  <div className="mc-jours">
                    {joursOuverts.map((iso) => (
                      <button
                        key={iso}
                        type="button"
                        className={`mc-jour ${jourRetouche === iso ? 'is-on' : ''}`}
                        onClick={() => setJourRetouche(iso)}
                      >
                        {dayLabelIso(iso)}
                      </button>
                    ))}
                    {joursOuverts.length === 0 && (
                      <span className="mc-emptyline">Aucun jour libre dans les deux mois, la Maison vous rappellera.</span>
                    )}
                  </div>
                  {jourRetouche && (
                    <>
                      <div className="mc-micro-eyebrow mc-stepkicker">L’heure</div>
                      <div className="mc-jours">
                        {heuresDuJour.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="mc-jour"
                            onClick={() => poser(i, jourRetouche, t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ---- LE RÈGLEMENT, EN DEUX TRANCHES ---- */}
        <div className="mc-sectionlabel">Le règlement · en deux fois</div>
        <div className="mc-recapcard">
          <div className="mc-recapcard__line"><span>Le cycle entier</span><span>{fmtMoney(total, currency)}</span></div>
          <div className="mc-recapcard__line"><span>1ʳᵉ tranche · maintenant</span><span>{fmtMoney(tranche1, currency)}</span></div>
          <div className="mc-recapcard__line">
            <span>2ᵉ tranche · séance {milieu + 1}{dates[milieu]?.iso ? ` (${dayLabelIso(dates[milieu].iso)})` : ''}</span>
            <span>{fmtMoney(tranche2, currency)}</span>
          </div>
        </div>

        {/* DIRE VRAI : rien ne débite ici. Elle envoie, elle annonce, le
            comptoir vérifie — un écran de paiement ne s'affiche que s'il
            débite vraiment. */}
        <div className="mc-sectionlabel">Comment envoyer la 1ʳᵉ tranche</div>
        <div className="mc-recapcard" style={{ textAlign: 'left' }}>
          <div className="mc-recapcard__line"><span>1 · Envoyez</span><span>{fmtMoney(tranche1, currency)}</span></div>
          <div className="mc-recapcard__line"><span>2 · Au numéro de la Maison</span><span>{branch.phone || 'communiqué sur WhatsApp'}</span></div>
          <div className="mc-recapcard__line"><span>3 · Puis annoncez l’envoi</span><span>bouton ci-dessous</span></div>
        </div>
        <div className="mc-sectionlabel">Envoyé par</div>
        <div className="mc-stack">
          {PAY_METHODS.map((pm) => (
            <button key={pm.k} className={`mc-paycard ${pay === pm.k ? 'is-on' : ''}`} onClick={() => setPay(pm.k)}>
              <span>{pm.n}</span>
              <span className="mc-paycard__dot" />
            </button>
          ))}
        </div>
        <div className="mc-footnote">
          La Maison vérifie la réception avant votre première venue. La 2ᵉ tranche se règle au
          fauteuil, le jour de la séance {milieu + 1}.
        </div>
      </div>

      <div className="mc-cmfooter">
        <div className="mc-cmfooter__total">
          <span>{seances.length} séances · {complet ? 'dates posées' : 'dates à compléter'}</span>
          <strong>{fmtMoney(tranche1, currency)}<em> maintenant</em></strong>
        </div>
        <button
          className={`mc-cta ${complet && pay ? 'mc-cta--copper' : 'mc-cta--locked'}`}
          disabled={!complet || !pay || scelle}
          onClick={sceller}
        >
          J’ai envoyé · sceller le cycle
        </button>
      </div>
    </div>
  );
}
