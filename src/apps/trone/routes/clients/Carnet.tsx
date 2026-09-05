import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { monthTitle } from '../finances/_shared';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useCategories, useServices, useProducts, MAISONS, type Maison } from '../../../../shared/catalog';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { useStaff as useMyStaff } from '../../../../shared/auth';
import { staffAccessStore } from '../equipe/data';
import { useStore } from '../../../../shared/store';
import { voitLesPrix } from '../index';
import { type Service } from '../../../../shared/catalog';
import {
  Avatar, PayStatusPill, RdvModal, ReminderBell, SourceBadge, StatusPill, type RdvInitial,
  addDaysISO, apptLabel, apptNetXof, apptPayState, apptTotalXof, apptDueXof, apptDepositCreditXof, frDay, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  tarifsDuRituel,
} from './_shared';
import { factureAEnvoyer, honorAppointment, PayAppointmentModal } from './actions';
import { SerieModal } from './SerieModal';

/* Le Carnet — le registre des rendez-vous : multi-services, duplication, statuts. */

const GRID = '96px 90px 1.3fr 1.6fr 0.9fr 232px';

/* ---------- LES VUES DU CARNET ----------
   Ce qu'on vient chercher au comptoir, en une question : « les impayés », « ce
   qui arrive », « ce qui reste à confirmer ». Deux natures s'y mêlent — l'état
   du RITUEL et celui de son RÈGLEMENT — parce que c'est ainsi qu'on les
   demande, jamais comme deux axes à croiser.

   L'état de règlement se lit par `apptPayState`, le même juge que la pastille
   de la ligne : un filtre qui ne dirait pas la même chose que la colonne d'à
   côté ne servirait qu'à faire douter.

   UN RITUEL ANNULÉ N'EST PAS UN IMPAYÉ. `apptPayState` ne regarde que l'argent,
   et un rendez-vous annulé sans règlement lui paraît donc impayé — ce qu'il est
   comptablement, et ce qu'il n'est pas dans la vie : personne ne l'encaissera
   jamais. Le laisser dans la liste des impayés, c'est y mettre une dette qui
   n'existe pas, et faire chercher au comptoir un argent que la Maison n'attend
   pas. Les trois vues d'argent l'écartent donc. La pastille de la ligne, elle,
   continue de dire l'état comptable — c'est son rôle. */
type VueCarnet = '' | 'avenir' | 'impaye' | 'partiel' | 'paye' | 'attente' | 'confirme' | 'honore' | 'annule';

const VUES: Record<VueCarnet, {
  label: string;
  garde: (a: Appointment, byId: Map<string, Service>, aVenir: (a: Appointment) => boolean) => boolean;
}> = {
  '':         { label: 'Tout',        garde: () => true },
  avenir:     { label: 'À venir',     garde: (a, _b, aVenir) => aVenir(a) },
  impaye:     { label: 'Impayés',     garde: (a, b) => a.status !== 'annulé' && apptPayState(a, b) === 'impayé' },
  partiel:    { label: 'Partiels',    garde: (a, b) => a.status !== 'annulé' && apptPayState(a, b) === 'partiel' },
  paye:       { label: 'Payés',       garde: (a, b) => a.status !== 'annulé' && apptPayState(a, b) === 'payé' },
  attente:    { label: 'En attente',  garde: (a) => a.status === 'en attente' },
  confirme:   { label: 'Confirmés',   garde: (a) => a.status === 'confirmé' },
  honore:     { label: 'Honorés',     garde: (a) => a.status === 'honoré' },
  annule:     { label: 'Annulés',     garde: (a) => a.status === 'annulé' },
};

/* Une pastille de filtre — la même dans les deux rangées, pour que le Carnet
   n'ait qu'une seule façon de dire « ceci est actif ». */
function FiltreChip({ actif, onClick, children, compte }: {
  actif: boolean; onClick: () => void; children: React.ReactNode; compte?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      style={{
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 11.5,
        letterSpacing: '.04em',
        padding: '7px 13px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        border: `1px solid ${actif ? 'var(--copper-600)' : 'var(--line)'}`,
        background: actif ? 'var(--copper-600)' : 'transparent',
        color: actif ? '#fff' : 'var(--ink-soft)',
      }}
    >
      {children}
      {compte !== undefined && (
        <span style={{ marginLeft: 6, opacity: actif ? 0.85 : 0.6 }}>{compte}</span>
      )}
    </button>
  );
}

export default function Carnet() {
  /* UN MAÎTRE NE LIT PAS L'ARGENT DE LA MAISON. Il ouvre le Carnet pour savoir
     qui vient, avec quel rituel et à quelle heure — pas pour connaître le
     montant, la remise ou ce qui reste dû. La colonne se vide, le solde
     disparaît, l'encaissement se ferme, et la fiche s'ouvre sans prix.

     MÊME JUGE QUE LE CALENDRIER : `voitLesPrix`, une seule règle pour toute la
     Maison. Et ce n'est pas le rôle qui trance mais le domaine ouvert —
     Gerard tient le secrétariat ET le fauteuil, il encaisse. */
  const moiCarnet = useMyStaff();
  const mesDomainesCarnet = useStore(staffAccessStore)[0][moiCarnet?.user_id ?? ''] ?? {};
  const sansPrix = !voitLesPrix(moiCarnet?.role, mesDomainesCarnet);

  const { currency, branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [categories] = useCategories();
  /* Ce qu'il faut pour tarifer au calibre et au lock : le meme attelage que
     l'ecran des factures. */
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [services] = useServices();
  const [produits] = useProducts();
  const today = todayISO();

  const [modal, setModal] = useState<{ initial?: RdvInitial; title?: string; appt?: Appointment } | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null); // encaissement (partiel / total / pourboire)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /* LA SAISIE EN SÉRIE vit ici, à côté de « + RDV passé » — arbitrage du
     5 septembre : c'est là qu'on va quand on pense à l'historique. */
  const [serieOuverte, setSerieOuverte] = useState(false);
  const navigate = useNavigate();
  /* ÉMETTRE LA FACTURE D'UN RITUEL IMPAYÉ (15 août) — la pièce naît « envoyée »
     dans Factures & devis, où elle s'imprime, se télécharge en PDF et
     s'adresse par WhatsApp. On y va aussitôt : émettre une pièce sans la voir
     n'apprend rien à personne. */
  const emettreFacture = (a: Appointment) => {
    /* LE TARIF DE LA TETE, PAS CELUI DE LA VITRINE — 4 septembre 2026. La piece
       naissait au prix catalogue : une reprise a 40 000 F pour une Nano de 427
       locks s'ecrivait 20 000 F, et l'ecart s'evaporait. Le Carnet passe donc
       son contexte tarifaire, comme le fait deja l'ecran des factures. */
    const t = tarifsDuRituel(a, {
      client: clients.find((c) => c.id === a.clientId),
      bands, sets, cats: categories, byId, tousServices: services, produits,
    });
    const r = factureAEnvoyer(a, byId, branch.id, t.prixPlein);
    setMenuFor(null);
    if (!r.ok) { window.alert(r.erreur); return; }
    navigate(`/factures?id=${r.inv.id}`);
  };
  /* La recherche peut arriver par l'adresse — c'est ainsi qu'un chiffre du
     Catalogue ouvre le rendez-vous qui le compose quand aucune facture n'y est
     rattachee : on ne peut pas ouvrir une piece qui n'existe pas, on ouvre donc
     le rituel. */
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [maison, setMaison] = useState<Maison | ''>('');
  /* CE QU'ON CHERCHE DANS LE CARNET. Deux natures se mêlent ici — l'état du
     rituel (confirmé, honoré, annulé) et celui de son règlement (payé,
     partiel, impayé) — parce que c'est ainsi qu'on les cherche au comptoir :
     « les impayés » est une question, pas une combinaison d'axes.
     Le regroupement à venir / passés reste au-dessus : filtrer sur les impayés
     montre donc d'abord ceux qui arrivent, ce qui est l'ordre utile. */
  const [vue, setVue] = useState<VueCarnet>('');

  /* Ferme le menu ⋯ à un clic hors menu (le bouton et le menu stoppent la propagation). */
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const clientOf = (id: string) => clients.find((c) => c.id === id);

  const { upcoming, past, comptes, totaux } = useMemo(() => {
    /* Recherche par nom de cliente — taper les premières lettres suffit
       (insensible aux accents : « agnes » trouve « Agnès ») ; le nom porté par
       le RDV sert de repli pour les têtes de passage sans fiche. */
    const qn = normName(query);
    const nameOf = (a: Appointment) => clients.find((c) => c.id === a.clientId)?.name ?? a.clientName ?? '';
    /* LA MAISON D'UN RENDEZ-VOUS NE SE STOCKE PAS — elle se lit des prestations.
       L'Atelier MND™ et le Studio ACƆ™ partagent une branche, une caisse et un
       plateau : seul le geste les distingue. Une visite mixte (un resserrage
       PUIS des tresses) appartient donc aux deux, et se montre sous les deux
       filtres — la couper en deux fabriquerait un rendez-vous qui n'a pas eu
       lieu. Les prestations du plateau technique, qui n'ont pas de maison, ne
       tranchent rien : elles ne suffisent pas à ranger une visite d'un côté. */
    const maisonDe = (sid: string) => categories.find((c) => c.id === byId.get(sid)?.categoryId)?.maison;
    const estDeLaMaison = (a: Appointment) =>
      maison === '' || a.serviceIds.some((sid) => maisonDe(sid) === maison);
    const match = (a: Appointment) =>
      (qn === '' || normName(nameOf(a)).includes(qn)) && estDeLaMaison(a);
    const aVenir = (a: Appointment) => a.date >= today && a.status !== 'honoré' && a.status !== 'annulé';

    /* La base : ce que la recherche et la maison laissent passer. Les compteurs
       se lisent DESSUS, pas sur le résultat filtré — sinon chaque vue
       afficherait son propre total et n'annoncerait plus rien. */
    const base = appts.filter(match);
    const comptes = {} as Record<VueCarnet, number>;
    for (const v of Object.keys(VUES) as VueCarnet[]) {
      comptes[v] = base.filter((a) => VUES[v].garde(a, byId, aVenir)).length;
    }

    /* LES DEUX TOTAUX NE SE MÉLANGENT PAS. Ce qu'une cliente doit pour un rituel
       DÉJÀ RENDU est une créance : cet argent aurait dû être encaissé. Ce
       qu'annonce un rendez-vous à venir n'est rien encore — le geste n'a pas eu
       lieu, elle peut annuler, et le montant peut changer au fauteuil. Les
       additionner ferait un chiffre que personne ne pourrait aller chercher.

       Les annulés sortent des deux : personne n'encaissera jamais un rituel qui
       n'a pas eu lieu. */
    const vivants = base.filter((a) => a.status !== 'annulé');
    const rendus = vivants.filter((a) => !aVenir(a));
    const totaux = {
      creanceN: rendus.filter((a) => apptDueXof(a, byId) > 0).length,
      creanceXof: rendus.reduce((n, a) => n + apptDueXof(a, byId), 0),
      avenirN: vivants.filter(aVenir).length,
      avenirXof: vivants.filter(aVenir).reduce((n, a) => n + apptNetXof(a, byId), 0),
    };

    const garde = (a: Appointment) => VUES[vue].garde(a, byId, aVenir);
    const upcoming = base
      .filter((a) => aVenir(a) && garde(a))
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
    /* « À venir » vide la section des passés : c'est tout l'intérêt de le
       demander. */
    const past = vue === 'avenir' ? [] : base
      .filter((a) => !aVenir(a) && garde(a))
      .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(b.time) - timeToMin(a.time));
    return { upcoming, past, comptes, totaux };
  }, [appts, today, query, clients, maison, categories, byId, vue]);

  const setStatus = (id: string, status: Appointment['status']) =>
    appointmentsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

  /* Suppression définitive d'un rendez-vous (depuis le menu ⋯) — confirmation requise. */
  const deleteAppt = (a: Appointment) => {
    if (!window.confirm('Supprimer définitivement ce rendez-vous ? Cette action est irréversible.')) return;
    appointmentsStore.set((prev) => prev.filter((x) => x.id !== a.id));
  };

  const duplicateLast = (clientId: string) => {
    const last = appts
      .filter((a) => a.clientId === clientId && a.status !== 'annulé')
      .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(b.time) - timeToMin(a.time))[0];
    if (!last) return;
    setModal({
      title: 'Dupliquer le dernier rendez-vous.',
      initial: {
        clientId: last.clientId,
        serviceIds: [...last.serviceIds],
        master: last.master,
        time: last.time,
        date: addDaysISO(last.date > today ? last.date : today, 7),
      },
    });
  };

  /* Chiffres seulement — ce qu'attend wa.me. Un numéro vide rend '' et la
     pastille ne s'affiche pas : mieux vaut rien qu'un lien mort. */
  const tel = (s?: string) => String(s ?? '').replace(/\D/g, '');

  /* ── LE CARNET SE LIT PAR MOIS (26 août) ──────────────────────────
     « Organise mes RDV passés et à venir par mois avec un total mensuel, comme
     ça je fais de meilleures prévisions » (Yéman). Quatre cent trente lignes à
     la file ne se prévoient pas : elles se comptent. Chaque mois s'annonce donc
     avec son nombre de rituels et ce qu'il pèse, et l'œil compare août à
     septembre sans additionner à la main. */
  const parMois = (liste: Appointment[]) => {
    const stats = new Map<string, { n: number; xof: number }>();
    for (const a of liste) {
      const k = a.date.slice(0, 7);
      const cur = stats.get(k) ?? { n: 0, xof: 0 };
      cur.n += 1;
      cur.xof += apptNetXof(a, byId);
      stats.set(k, cur);
    }
    const out: ReactNode[] = [];
    let mois = '';
    for (const a of liste) {
      const k = a.date.slice(0, 7);
      if (k !== mois) {
        mois = k;
        const s = stats.get(k)!;
        out.push(
          <div key={`mois-${k}`} className="trc-carnet-mois">
            <span className="trc-carnet-mois__nom">{monthTitle(k)}</span>
            <span className="trc-carnet-mois__n">{s.n} rituel{s.n > 1 ? 's' : ''}</span>
            {!sansPrix && <span className="trc-carnet-mois__xof">{fmtMoney(s.xof, currency)}</span>}
          </div>,
        );
      }
      out.push(renderRow(a));
    }
    return out;
  };

  const renderRow = (a: Appointment) => {
    const c = clientOf(a.clientId);
    const canConfirm = a.status === 'en attente';
    const canHonor = a.status === 'confirmé';
    const canCancel = a.status === 'confirmé' || a.status === 'en attente';
    const isSeriesIncluded = !!(a.seriesIndex && a.seriesIndex > 1); // séance 2..N : valeur 0, non encaissable seule
    const dueX = apptDueXof(a, byId);
    const partlyPaid = (a.paidXof ?? 0) > 0 || apptDepositCreditXof(a) > 0;
    // Impayé à signaler : solde restant dû sur un RDV déjà réglé en partie, ou passé/du jour.
    const showReste = !isSeriesIncluded && dueX > 0 && (partlyPaid || a.date <= today);
    const canEncaisser = a.status !== 'annulé' && !isSeriesIncluded;
    return (
      <div
        className="trc-sheet__row"
        style={{ gridTemplateColumns: GRID, cursor: 'pointer' }}
        key={a.id}
        onClick={() => setModal({ appt: a })}
        title="Modifier ce rendez-vous"
      >
        <span className="trc-date">{frDay(a.date)}</span>
        <span className="trc-time">{a.time}</span>
        <span className="trc-carnet__client" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {c && <Avatar client={c} size={30} />}
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="trc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c?.name ?? a.clientName ?? 'Cliente de passage'}
            </span>
            {/* LE TÉLÉPHONE, AU CARNET. C'est ici qu'on cherche à joindre quelqu'un
                — pour prévenir d'un retard, confirmer une venue, relancer un
                impayé — et il n'y figurait pas : il fallait quitter le Carnet,
                ouvrir Clientes, retrouver la fiche. Un clic ouvre WhatsApp ;
                `stopPropagation` empêche d'ouvrir le rendez-vous au passage. */}
            {tel(c?.phone) && (
              <a
                className="trc-wa"
                href={`https://wa.me/${tel(c?.phone)}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Écrire sur WhatsApp`}
                style={{ alignSelf: 'flex-start' }}
              >
                <span className="trc-wa__num">{c?.phone}</span>
              </a>
            )}
          </span>
        </span>
        <span className="trc-carnet__svc" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{apptLabel(a, byId)}</span>
          {a.serviceIds.length > 1 && <span className="trc-src trc-src--indigo">{a.serviceIds.length} services</span>}
          {/* LE GESTE SE VOIT AU CARNET. Un rituel offert lu sans sa mention
              donne une cliente qui semble ne jamais payer. */}
          {a.offertPar && (
            <span
              className="trc-src"
              style={{ background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
              title={`Réglé par ${clientOf(a.offertPar)?.name ?? 'une autre cliente'}, la dépense et les points lui reviennent`}
            >
              offert par {clientOf(a.offertPar)?.name?.split(' ')[0] ?? 'une autre'}
            </span>
          )}
          <SourceBadge source={a.source} />
        </span>
        <span className="trc-carnet__amount" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {a.coveredBySub ? (
            <span
              className="trc-serie-chip"
              style={{ background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
              title={a.coverKind === 'forfait'
                ? 'Séance promise par un forfait déjà réglé, rien à facturer'
                : 'Rituel couvert par l’abonnement, rien à facturer, décompté du quota du cycle'}
            >
              {/* Un abonnement mensuel et un forfait vendu d'un coup ne sont pas
                  la même formule : les confondre au comptoir empêchait de savoir
                  ce que chacune rapporte. L'historique n'a pas le champ — il
                  n'existait alors qu'un seul mécanisme, l'abonnement. */}
              ★ Inclus · {a.coverKind === 'forfait' ? 'forfait' : 'abonnement'}
            </span>
          ) : a.seriesIndex && a.seriesIndex > 1 ? (
            <span className="trc-serie-incluse">
              Séance {a.seriesIndex}/{a.seriesTotal ?? a.seriesIndex} · incluse
            </span>
          ) : (
            <>
              {!sansPrix && (
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
                  {fmtMoney(apptTotalXof(a, byId), currency)}
                </span>
              )}
              {(a.seriesTotal ?? 0) > 1 && <span className="trc-serie-chip">Séance 1/{a.seriesTotal}</span>}
              {showReste && !sansPrix && (
                <span
                  className="trc-serie-chip"
                  style={{ background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
                  title="Solde restant dû, encaissez via le menu ⋯"
                >
                  reste {fmtMoney(dueX, currency)}
                </span>
              )}
            </>
          )}
        </span>
        <span className="trc-carnet__status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <PayStatusPill a={a} byId={byId} />
          <StatusPill status={a.status} />
          <ReminderBell appt={a} client={c} byId={byId} />
          <span className="trc-menuwrap" onClick={(e) => e.stopPropagation()}>
            <button
              className="trc-dots"
              aria-label="Actions"
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === a.id ? null : a.id); }}
            >
              ⋯
            </button>
            {menuFor === a.id && (
              <div className="trc-menu">
                {canEncaisser && !sansPrix && (
                  <button onClick={() => { setPayAppt(a); setMenuFor(null); }}>
                    Encaisser {dueX > 0 ? `· reste ${fmtMoney(dueX, currency)}` : '(pourboire)'}
                  </button>
                )}
                {/* ══ UNE PIÈCE À ZÉRO EST UNE ATTESTATION — 4 septembre 2026
                    « Je ne vois toujours pas le bouton sur le RDV. La facture ne
                    peut pas être émise » (Yéman).

                    LE GESTE SE CACHAIT SOUS `dueX > 0`. Un rituel couvert par un
                    abonnement, ou offert, ne doit rien : le bouton disparaissait
                    donc entièrement, et la cliente restait sans papier pour ce
                    qu'elle avait reçu. On ne réclame pas ce qu'on n'attend pas,
                    mais on ATTESTE toujours ce qu'on a fait. */}
                {canEncaisser && !sansPrix && (
                  <button onClick={() => emettreFacture(a)}>
                    {dueX > 0
                      ? `Émettre la facture · ${fmtMoney(dueX, currency)} dû`
                      : 'Éditer la pièce · rien à régler'}
                  </button>
                )}
                {/* POSER LA SÉANCE SUIVANTE (15 août) — « je dois choisir la
                    date du prochain rituel ; là c'est une date fixe ». Le
                    rattachement se faisait depuis la modale du rendez-vous
                    NOUVEAU, qu'il fallait d'abord créer et re-remplir. On part
                    du rituel qui porte le soin : ses prestations sont reprises,
                    la série est déjà nouée, il ne reste que LA DATE à choisir.
                    SEULEMENT CE QUI Y DONNE DROIT (20 août) : le geste ne se
                    propose que si le rituel contient une prestation à
                    plusieurs séances, et ne reprend QUE celles-là — le
                    shampoing d'une séance n'a rien à faire dans une suite. */}
                {a.status !== 'annulé' && (a.seriesIndex ?? 1) <= 1
                  && a.serviceIds.some((id) => (byId.get(id)?.sessions ?? 1) > 1) && (
                  <button
                    onClick={() => {
                      setModal({
                        initial: {
                          clientId: a.clientId,
                          serviceIds: a.serviceIds.filter((id) => (byId.get(id)?.sessions ?? 1) > 1),
                          master: a.master,
                          date: todayISO(),
                          suiteDe: a.id,
                        },
                      });
                      setMenuFor(null);
                    }}
                  >
                    ＋ Poser la séance suivante
                  </button>
                )}
                <button onClick={() => { setModal({ appt: a }); setMenuFor(null); }}>Modifier le rendez-vous</button>
                {canConfirm && (
                  <button onClick={() => { setStatus(a.id, 'confirmé'); setMenuFor(null); }}>Confirmer le rendez-vous</button>
                )}
                {canHonor && (
                  <button onClick={() => { honorAppointment(a, byId); setMenuFor(null); }}>Marquer honoré</button>
                )}
                <button onClick={() => { duplicateLast(a.clientId); setMenuFor(null); }}>
                  ⟳ Dupliquer le dernier RDV {c ? `de ${c.name.split(' ')[0]}` : ''}
                </button>
                {canCancel && (
                  <button className="is-danger" onClick={() => { setStatus(a.id, 'annulé'); setMenuFor(null); }}>
                    Annuler le rendez-vous
                  </button>
                )}
                <button className="is-danger" onClick={() => { deleteAppt(a); setMenuFor(null); }}>
                  Supprimer définitivement
                </button>
              </div>
            )}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Le Carnet · Agenda"
        title="Rendez-vous."
        actions={
          <>
            <Button variant="ghost" onClick={() => setModal({ initial: { date: addDaysISO(today, -1) }, title: 'Rendez-vous passé.' })}>
              + RDV passé
            </Button>
            <Button variant="ghost" onClick={() => setSerieOuverte(true)}>Saisir en série</Button>
            <Button variant="copper" onClick={() => setModal({})}>+ Nouveau RDV</Button>
          </>
        }
      />

      <div className="trc-toolbar">
        <div className="trc-searchwrap">
          <Search size={17} aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un rendez-vous par cliente…"
            aria-label="Rechercher un rendez-vous par cliente"
          />
        </div>
        {/* LA BASCULE DES DEUX MAISONS. Le 3 août 2026, un rendez-vous du
            Studio saisi depuis l'Atelier restait introuvable : il était au bon
            endroit — une seule branche — mais rien ne permettait de le
            retrouver par sa maison. */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="group" aria-label="Filtrer par maison">
          {([['', 'Tout'], ...MAISONS.map((m) => [m.k, m.fon] as const)] as ReadonlyArray<readonly [string, string]>).map(
            ([id, label]) => {
              const actif = maison === id;
              return (
                <FiltreChip key={id || 'tout'} actif={actif} onClick={() => setMaison(id as Maison | '')}>
                  {label}
                </FiltreChip>
              );
            },
          )}
        </div>
      </div>

      {/* CE QU'ON VIENT CHERCHER. Chaque pastille porte son compte : on voit
          combien d'impayés il y a AVANT de cliquer, et le comptoir sait s'il a
          du travail sans avoir à explorer. Les comptes se lisent sur ce que la
          recherche et la maison laissent passer — pas sur le filtre courant,
          qui ferait dire à chaque vue son propre total.

          Un maître ne voit pas les vues d'argent : elles n'ont pas de sens pour
          quelqu'un à qui les montants se taisent. */}
      <div
        className="trc-toolbar"
        style={{ marginTop: -6, marginBottom: 14, flexWrap: 'wrap', gap: 6 }}
        role="group"
        aria-label="Filtrer les rendez-vous"
      >
        {(Object.keys(VUES) as VueCarnet[])
          .filter((v) => !sansPrix || !['impaye', 'partiel', 'paye'].includes(v))
          .map((v) => (
            <FiltreChip key={v || 'tout'} actif={vue === v} onClick={() => setVue(v)} compte={comptes[v]}>
              {VUES[v].label}
            </FiltreChip>
          ))}
      </div>

      {/* LES DEUX CHIFFRES QU'ON VIENT CHERCHER, sous les yeux sans cliquer.
          Ils se lisent sur ce que la recherche et la maison laissent passer —
          comme les comptes des pastilles — et non sur le filtre courant : un
          total qui changerait à chaque vue n'annoncerait plus rien.

          Ils ne s'additionnent pas, et c'est voulu. Une créance est un argent
          qui aurait dû être encaissé ; un rendez-vous à venir n'est rien encore
          — le geste n'a pas eu lieu, elle peut annuler, le montant peut changer
          au fauteuil. Les mettre dans le même chiffre, c'est annoncer une somme
          que personne ne peut aller chercher. */}
      {!sansPrix && (
        <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 12, marginBottom: 14 } as CSSProperties}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Reste à encaisser · rituels rendus</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--copper-700)', lineHeight: 1.1 }}>
              {fmtMoney(totaux.creanceXof, currency)}
            </div>
            <div className="trc-sub">
              {totaux.creanceN === 0
                ? 'Rien à recouvrer, tout est réglé.'
                : `sur ${totaux.creanceN} rituel${totaux.creanceN > 1 ? 's' : ''} déjà rendu${totaux.creanceN > 1 ? 's' : ''}`}
            </div>
          </div>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-indigo)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
            <div className="trc-microlabel" style={{ margin: 0 }}>Attendu · rendez-vous à venir</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--color-indigo)', lineHeight: 1.1 }}>
              {fmtMoney(totaux.avenirXof, currency)}
            </div>
            <div className="trc-sub">
              {totaux.avenirN === 0
                ? 'Le carnet est libre.'
                : `sur ${totaux.avenirN} rendez-vous, rien n’est encore acquis`}
            </div>
          </div>
        </div>
      )}

      <div className="trc-sheet trc-carnet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Date</span>
          <span>Heure</span>
          <span>Cliente</span>
          <span>Services</span>
          <span>{sansPrix ? '' : 'Montant'}</span>
          <span style={{ textAlign: 'right' }}>Statut</span>
        </div>

        {/* UN VIDE DOIT DIRE POURQUOI. « Le carnet est libre » sous un filtre
            actif est un mensonge : ce n'est pas le carnet qui est vide, c'est la
            question qui ne rend rien. */}
        <div className="trc-sheet__group">Rendez-vous à venir ({upcoming.length})</div>
        {upcoming.length === 0 && (
          <div className="trc-empty">
            {vue !== '' ? `Aucun rendez-vous à venir dans « ${VUES[vue].label} »${query.trim() ? ` pour « ${query.trim()} »` : ''}.`
              : query.trim() ? `Aucun rendez-vous à venir pour « ${query.trim()} ».`
              : 'Le carnet est libre, la maison respire.'}
          </div>
        )}
        {parMois(upcoming)}

        {/* La vue « À venir » masque les passés — c'est ce qu'on lui demande.
            Afficher « Rendez-vous passés (0) » ferait croire qu'il n'y en a pas. */}
        {vue !== 'avenir' && (
          <>
            <div className="trc-sheet__group">Rendez-vous passés ({past.length})</div>
            {past.length === 0 && (
              <div className="trc-empty">
                {vue !== '' ? `Aucun rendez-vous passé dans « ${VUES[vue].label} »${query.trim() ? ` pour « ${query.trim()} »` : ''}.`
                  : query.trim() ? `Aucun rendez-vous passé pour « ${query.trim()} ».`
                  : 'Aucun rendez-vous passé sur cette branche.'}
              </div>
            )}
            {parMois(past)}
          </>
        )}
      </div>

      {/* ENCAISSER DEPUIS LA FICHE OUVERTE. Le bouton existait dans la modale et
          etait branche au Calendrier et au Bilan, pas ici — alors que le Carnet
          est l'ecran ou l'on ouvre un rendez-vous pour le regler. Il fallait le
          refermer et repasser par le menu ⋯. La meme modale sert a solder ou a
          poser un acompte : le montant se saisit librement. */}
      {modal && (
        <RdvModal
          onClose={() => setModal(null)}
          initial={modal.initial}
          appt={modal.appt}
          title={modal.title}
          sansPrix={sansPrix}
          onEncaisser={sansPrix ? undefined : (a) => { setModal(null); setPayAppt(a); }}
        />
      )}
      {/* L'ENCAISSEMENT NE S'OUVRE PAS AU FAUTEUIL. Fermer le bouton ne
          suffisait pas : la modale s'ouvre aussi depuis la fiche du rituel. */}
      {/* Le retour REND la fiche du rituel : l'encaissement l'avait refermée
          derrière lui, et corriger une prestation obligeait à repasser par le
          carnet. On relit le rituel dans le magasin — celui qu'on tient en
          main date de son ouverture, et le versement qu'on vient d'inscrire
          l'a déjà fait vieillir. */}
      {serieOuverte && <SerieModal onClose={() => setSerieOuverte(false)} />}

      {payAppt && !sansPrix && (
        <PayAppointmentModal
          appt={payAppt}
          onClose={() => setPayAppt(null)}
          onRetour={() => {
            const frais = appointmentsStore.get().find((x) => x.id === payAppt.id) ?? payAppt;
            setPayAppt(null);
            setModal({ appt: frais });
          }}
        />
      )}
    </div>
  );
}
