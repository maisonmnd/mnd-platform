import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBilans } from '../../../../shared/bilans';
import { manquesDeLaTete } from '../../../../shared/afaire';
import { PageHead } from '../_ui';
import { gammeTouteReglee } from '../../../../shared/gamme';
import { useLaGammePayeeRegravee } from './gamme-payee';
import { chiffreAttenduDuJour } from './chiffre-du-jour-pur';
import { ChampDeDate } from '../../../../ds/dates';
import { Button, Input, alerte, refus, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { monthTitle } from '../finances/_shared';
import { appointmentsStore, apptPaidXof, type Appointment } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { laPieceDuRdv, resteDeLaPiece, type PieceLue } from '../../../../shared/regler-la-seance-pur';
import { marqueDeLaFinAuCarnet, type PieceAuCarnet } from '../../../../shared/terminer-et-regler-pur';
import { useCategories, useServices, useProducts, MAISONS, type Maison } from '../../../../shared/catalog';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { tauxDit } from '../../../../shared/agents-maison-pur';
import { bilanDuMois, calculDuJour, chargeSurObjectif, rdvParJour, reperesDe, reperesParJour } from '../../../../shared/objectifs-des-fauteuils-pur';
import {
  ancienneteDesCreances, ceQuiPresse, comprendsLaPhrase, dettesParCliente, estAVenir, gardeSelonLaPhrase, gesteDuRdv,
  historiqueParCliente, jourEnClair, probable, signauxDuRdv, tauxDHonneur,
  type CleQuiPresse, type RdvLu, type Signal,
} from './carnet-intelligent-pur';
import { useStaff as useMyStaff } from '../../../../shared/auth';
import { staffAccessStore } from '../equipe/data';
import { useStore } from '../../../../shared/store';
import { voitLesPrix } from '../index';
import { type Service } from '../../../../shared/catalog';
import {
  Avatar, PayStatusPill, RdvModal, ReminderBell, SourceBadge, type RdvInitial,
  addDaysISO, apptLabel, apptNetXof, apptGammeXof, apptPayState, montantDuCarnet, apptDueXof, apptDepositCreditXof, apptDurationMin, frDay, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  tarifsDuRituel, PortesWhatsApp, DrillModal, type Drill,
} from './_shared';
import { cancelAppointmentPayment, deshonoreLeRituel, factureAEnvoyer, honoreSansEncaisser, PayAppointmentModal, piecesDuFoyer, prenomsDuFoyer } from './actions';
import { FenetreDuProchainRituel } from '../vente/SonProchainRituel';
import { laCarteSOuvreApresLHonneur, sonProchainDejaPose } from '../../../../shared/carte-du-prochain-rituel';
import { momentDuMessage } from '../../../../shared/salle-des-envois';
import { rdvsDuFoyerLeJour } from '../../../../shared/facture-du-foyer-pur';
import { quiAnnuler } from './foyer-gestes';
import { SerieModal } from './SerieModal';
import { RattraperUnCahier } from './RattraperUnCahier';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { useEnvoiDeLaPiece } from '../vente/envoi-de-la-piece';
import { ditLaPiecePartie, pieceDejaPartie } from '../../../../shared/une-piece-un-message-pur';
import { BoutonDuPoint, FenetreDuPoint } from '../vente/FenetreDuPoint';
import { rituelDeLaRepriseEffacee } from '../../../../shared/reprise-nue';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { PassageAvantLeFauteuil } from './PassageAvantLeFauteuil';
import { AvantLeFauteuil } from './AvantLeFauteuil';

/* Le Carnet — le registre des rendez-vous : multi-services, duplication, statuts. */

/* LE CARNET LISIBLE EN DEUX SECONDES — 4 novembre 2026 (maquette
   JsrKf8QF9e4Z5Txqz524T3, « construis »). La cliente d'abord, son rituel
   dessous, l'heure dans sa colonne, le prix et le statut à droite. La date
   quitte la ligne : chaque jour a son en-tête. */
const GRID = '76px minmax(0, 1.9fr) minmax(0, 0.9fr) auto';

/* Le statut se lit à sa couleur : honoré vert, confirmé indigo, en attente
   cuivre, annulé rouge. Les mêmes classes que la pastille des autres écrans. */
const CLASSE_DU_STATUT: Record<Appointment['status'], string> = {
  'confirmé': 'trc-pill--confirme',
  'en attente': 'trc-pill--attente',
  'honoré': 'trc-pill--honore',
  'annulé': 'trc-pill--annule',
};
const dureeDite = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}` : `${min} min`);
/* Un rendez-vous passé ou du jour, encore confirmé ou en attente, attend son statut. */
const estAClore = (a: Appointment, aujourdhui: string) => a.date <= aujourdhui && (a.status === 'confirmé' || a.status === 'en attente');

/* ══ LE MENU QUI NE S'ÉCHAPPE PLUS — 4 novembre 2026 ═══════════════════════
   « Le menu déroulant pour changer le statut est peu intuitif, il ne doit pas
   disparaître de façon frustrante » (Yéman). Il vivait DANS la feuille : sous
   900 px la feuille défile de côté et le rognait, et un clic n'importe où le
   fermait. Il se pose désormais par-dessus l'écran, sous son bouton (au-dessus
   près du bas), suit le défilement, et ne se ferme que sur un choix, Échap ou
   un toucher ailleurs. Il reste l'enfant de sa ligne pour React : ses clics
   s'arrêtent avant d'ouvrir la fenêtre du rendez-vous. */
function MenuFlottant({ ancre, onClose, children }: { ancre: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const ferme = useRef(onClose);
  ferme.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const m = ref.current;
      if (!m || !ancre.isConnected) return;
      const b = ancre.getBoundingClientRect();
      const r = m.getBoundingClientRect();
      const top = window.innerHeight - b.bottom < r.height + 12 && b.top > r.height + 12 ? b.top - r.height - 6 : b.bottom + 6;
      const left = Math.min(Math.max(12, b.right - r.width), window.innerWidth - r.width - 12);
      setPos({ top: Math.max(8, top), left: Math.max(8, left) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [ancre]);
  useEffect(() => {
    const dehors = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || ancre.contains(t)) return;
      ferme.current();
    };
    const touche = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { ferme.current(); ancre.focus(); } };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', touche); };
  }, [ancre]);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, []);
  const fleches = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Tab') ferme.current();
  };
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="trc-menu trc-menu--fixed trc-menu--flottant"
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, right: 'auto', visibility: pos ? 'visible' : 'hidden' }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={fleches}
    >
      {children}
    </div>,
    document.body,
  );
}

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
type VueCarnet = '' | 'avenir' | 'aclore' | 'impaye' | 'partiel' | 'paye' | 'attente' | 'confirme' | 'honore' | 'annule';

const VUES: Record<VueCarnet, {
  label: string;
  garde: (a: Appointment, byId: Map<string, Service>, aVenir: (a: Appointment) => boolean) => boolean;
}> = {
  '':         { label: 'Tout',        garde: () => true },
  avenir:     { label: 'À venir',     garde: (a, _b, aVenir) => aVenir(a) },
  /* Ce qui est passé ou du jour et attend encore Honoré ou Annulé (4 novembre 2026). */
  aclore:     { label: 'À clore',     garde: (a) => estAClore(a, todayISO()) },
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

/** Au-delà, les mois passés se replient. En dessous, la liste tient à l'écran
    et se montre entière : c'est le cas d'une recherche ou d'un filtre. */
export const SEUIL_DE_REPLI = 120;

export default function Carnet() {
  /* La Gamme payée à la Caisse se regrave une fois par séance (24 octobre 2026). */
  useLaGammePayeeRegravee();
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
  /* LES TOTAUX SUIVENT LE TARIF DE LA TÊTE — 9 octobre 2026. Un rendez-vous à
     venir sans prix se lit au tarif de sa tête (`apptTotalXof`) : un calibre,
     un barème d'atelier, un produit ou un réglage qui change doit refaire les
     totaux, pas seulement les fiches et le catalogue. Les réglages ne servent
     que de clef (barème suspendu). */
  const [reglages] = useSettings();
  const today = todayISO();

  const [modal, setModal] = useState<{ initial?: RdvInitial; title?: string; appt?: Appointment } | null>(null);
  /* Le détail d'une tuile (24 octobre 2026, « rendre cliquables les attendus »). */
  const [detail, setDetail] = useState<Drill | null>(null);
  /* LE JOUR DE LA TUILE « ATTENDU » — 26 octobre 2026 (« est-ce que je peux
     changer la date et interroger un autre jour ? ») : aujourd'hui par défaut,
     la veille et le lendemain d'une flèche, n'importe quel jour au calendrier. */
  const [jourVu, setJourVu] = useState(() => todayISO());
  const [payAppt, setPayAppt] = useState<Appointment | null>(null); // encaissement (partiel / total / pourboire)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /* LE POINT DU COMPTE (28 octobre 2026) : la tête dont on ouvre le point. */
  const [pointDe, setPointDe] = useState<string | null>(null);
  /* La facture à régler part seule chez elle (17 octobre 2026). */
  const envoiDeLaPiece = useEnvoiDeLaPiece();
  /* LA SAISIE EN SÉRIE vit ici, à côté de « + RDV passé » — arbitrage du
     5 septembre : c'est là qu'on va quand on pense à l'historique. */
  const [serieOuverte, setSerieOuverte] = useState(false);
  /* LE CAHIER PAPIER RATTRAPÉ (19 octobre 2026, chantier « cahier ») : le
     bouton se montre quand la fonction ia-maison est posée ET que son
     département le permet (direction, Clientèle, Finances). */
  const saitIaMaison = useSaitIaMaison();
  const peutRattraperUnCahier = saitIaMaison === true && peutDemander(moiCarnet?.role, 'cahier', mesDomainesCarnet);
  const [cahierOuvert, setCahierOuvert] = useState(false);
  const navigate = useNavigate();

  /* ══ CE QU'IL FAUT LUI DEMANDER, PAR TÊTE — 6 septembre 2026 ═══════
     Calculé une fois pour tout le carnet : le faire par ligne relirait
     trois cents bilans à chaque rendu, et le carnet est la page la plus
     ouverte de la Maison.

     LES MOTS SONT COURTS, ils tiennent dans une infobulle : « mèche »,
     « son e-mail ». On ne raconte pas, on nomme. */
  const [bilansTous] = useBilans();
  const manquesDuJour = useMemo(() => {
    const parTete = new Map<string, number>();
    for (const b of bilansTous) parTete.set(b.clientId, (parTete.get(b.clientId) ?? 0) + 1);
    const MOT: Record<string, string> = {
      meche: 'mèche témoin', bilan: 'un bilan', cadence: 'sa cadence',
      longueur: 'sa longueur', email: 'son e-mail', locks: 'son comptage',
    };
    const sortie = new Map<string, string[]>();
    for (const c of clients) {
      if (c.archived) continue;
      const m = manquesDeLaTete({ tete: c, bilans: parTete.get(c.id) ?? 0 });
      if (m.length > 0) sortie.set(c.id, m.map((k) => MOT[k] ?? k));
    }
    return sortie;
  }, [clients, bilansTous]);
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
    const r = factureAEnvoyer(a, byId, branch.id, t.prixPlein, t.gesteDe);
    setMenuFor(null);
    if (!r.ok) { refus(r.erreur); return; }
    navigate(`/factures?id=${r.inv.id}`);
  };
  /* RENVOYER LA FACTURE D'UN RITUEL HONORÉ QUI DOIT ENCORE — 26 octobre 2026
     (sa décision : « Oui, un bouton d'envoi »), même des jours après : sa pièce
     (ou celle qui naît ici, au tarif de la tête), sur son WhatsApp. */
  const renvoieLaFacture = (a: Appointment) => {
    const t = tarifsDuRituel(a, {
      client: clients.find((c) => c.id === a.clientId),
      bands, sets, cats: categories, byId, tousServices: services, produits,
    });
    const r = factureAEnvoyer(a, byId, branch.id, t.prixPlein, t.gesteDe);
    setMenuFor(null);
    if (!r.ok) { refus(r.erreur); return; }
    void envoiDeLaPiece.aRegler(r.inv.id, a.date, { memePasse: true, renvoi: true });
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
  /* CE QUI PRESSE, EN COMPTEURS QUI FILTRENT — 25 octobre 2026 (Carnet plus
     intelligent, maquette VJ5PJEGU… vue 8). Un compteur touché garde ses
     rendez-vous dans la liste ; les comptes des vues ne bougent pas. */
  const [presse, setPresse] = useState<CleQuiPresse | ''>('');

  /* Le menu se pose sous son bouton, la pastille du statut (4 novembre 2026) ;
     il se ferme lui-même sur un choix, Échap ou un toucher ailleurs. */
  const [menuAncre, setMenuAncre] = useState<HTMLElement | null>(null);
  const fermeLeMenu = () => setMenuFor(null);
  /* UN GESTE SE DÉFAIT — 4 novembre 2026 : Honoré ou Annulé d'un toucher se
     voit aussitôt, et un bandeau garde six secondes de quoi revenir en
     arrière. Pas de retour quand un message est parti : il ne se rattrape pas. */
  const [defaire, setDefaire] = useState<{ dit: string; fn?: () => void } | null>(null);
  /* SON PROCHAIN RITUEL APRÈS « HONORÉ » — 4 novembre 2026 : la carte de
     « C'est réglé », proposée, validée d'un toucher (rien d'office). */
  const [prochainPour, setProchainPour] = useState<string | null>(null);
  useEffect(() => {
    if (!defaire) return;
    const t = setTimeout(() => setDefaire(null), 6000);
    return () => clearTimeout(t);
  }, [defaire]);
  /* La barre de recherche reste en haut de la liste ; les en-têtes de jour
     collent juste sous elle, quelle que soit sa hauteur. */
  const barreRef = useRef<HTMLDivElement>(null);
  const [hautBarre, setHautBarre] = useState(0);
  useLayoutEffect(() => {
    const el = barreRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHautBarre(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* UNE FICHE SE TROUVE PAR SON IDENTIFIANT (1er octobre 2026). Chaque ligne
     relisait la liste des fiches pour trouver la sienne : mille rendez-vous
     fois cinq cents fiches, à chaque affichage. */
  const ficheParId = useMemo(() => new Map(clients.map((c) => [c.id, c] as const)), [clients]);
  const clientOf = (id: string) => ficheParId.get(id);

  /* ══ LE CARNET PLUS INTELLIGENT — 25 octobre 2026 ═══════════════════
     « Make this page more intelligent » (Yéman). Les règles vivent dans
     `carnet-intelligent-pur.ts` ; ici, chaque rendez-vous est lu UNE fois,
     chiffré (net, reste, durée), et les signaux se calculent dessus : ce
     qu'elle doit d'avant, l'acompte qui manque à 48 h, le risque d'absence
     sur son historique, les têtes au-delà des fauteuils, l'anniversaire. */
  /* Les rendez-vous qui portent une facture : un passé encaissé ou facturé
     est une venue, même jamais cliqué « honoré » (26 octobre 2026). */
  const [pieces] = usePiecesDeLaMaison();
  const rdvsFactures = useMemo(() => new Set(pieces
    .filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string)), [pieces]);
  /* La pièce d'un rendez-vous qu'elle a terminé elle-même (6 novembre 2026) :
     son reste et ses versements, null tant qu'elle n'est pas écrite. C'est
     la pièce, soldée par un versement en ligne, qui dit « Réglée en ligne » :
     jamais les seules marques du rendez-vous. */
  const saPiece = (rdvId: string): PieceAuCarnet | null => {
    const p = laPieceDuRdv(pieces as unknown as PieceLue[], rdvId);
    return p ? { resteXof: resteDeLaPiece(p), versements: p.payments ?? [] } : null;
  };
  const lus = useMemo(() => appts.map((a): RdvLu => ({
    id: a.id, clientId: a.clientId, date: a.date, time: a.time, status: a.status, master: a.master,
    depositXof: a.depositXof, depositConfirmed: a.depositConfirmed, creeLe: a.creeLe,
    dureeMin: apptDurationMin(a, byId), netXof: apptNetXof(a, byId), resteXof: apptDueXof(a, byId),
    encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || rdvsFactures.has(a.id),
  })), [appts, byId, bands, sets, produits, reglages, rdvsFactures]);
  const luDe = useMemo(() => new Map(lus.map((l) => [l.id, l] as const)), [lus]);
  /* ══ LES OBJECTIFS DES FAUTEUILS — 26 octobre 2026 ═══════════════════
     « Le pourcentage des fauteuils calcule dans le vide. Prends tous les RDV
     de 2025 et 2026 : des objectifs atteignables, des prévisions
     atteignables, pas des chiffres au hasard » (Yéman). La barre ne rapporte
     plus les minutes aux fauteuils × heures d'ouverture : elle dit les
     rendez-vous posés sur l'OBJECTIF du jour, le troisième quartile de ce
     même jour de la semaine sur les six derniers mois ouverts (déjà atteint
     un jour sur quatre). Les règles : `objectifs-des-fauteuils-pur`. Les
     comptes portent sur TOUTE la branche, pas sur la liste filtrée. */
  const estOuvertLe = (j: string) => !openingForIso(j).closed;
  const comptesParJour = useMemo(() => rdvParJour(lus), [lus]);
  const reperes = useMemo(() => reperesParJour({ parJour: comptesParJour, aujourdhui: today, ouvertLe: estOuvertLe }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comptesParJour, today, reglages]);
  const signaux = useMemo(() => {
    const dettes = dettesParCliente(lus, today);
    const historiques = historiqueParCliente(lus, today);
    const parJour = new Map<string, RdvLu[]>();
    for (const l of lus) { const j = parJour.get(l.date); if (j) j.push(l); else parJour.set(l.date, [l]); }
    const ctx = {
      aujourdhui: today, sieges: Math.max(0, branch.seats ?? 0), dettes, historiques, sansPrix,
      duJour: (iso: string) => parJour.get(iso) ?? [],
      anniversaireDe: (id: string) => { const b = ficheParId.get(id)?.birthday; return b && /^\d{4}-\d{2}-\d{2}/.test(b) ? b.slice(5, 10) : undefined; },
    };
    const parRdv = new Map<string, Signal[]>();
    for (const l of lus) if (estAVenir(l, today)) parRdv.set(l.id, signauxDuRdv(l, ctx));
    return { dettes, parRdv, honneur: tauxDHonneur(lus, today) };
  }, [lus, today, branch.seats, ficheParId, sansPrix]);
  const maitresConnus = useMemo(() => [...new Set(appts.map((a) => a.master).filter(Boolean))], [appts]);
  /* LA RECHERCHE QUI COMPREND UNE PHRASE : « impayés de septembre », « Team
     samedi », « sans acompte cette semaine ». Ce qui reste est un nom. */
  /* Les noms des clientes : un prénom de maître qui est aussi celui d'une
     cliente garde les deux (25 octobre 2026). */
  const clientesConnues = useMemo(() => [...new Set([...ficheParId.values()].map((c) => c.name).filter(Boolean))], [ficheParId]);
  const phrase = useMemo(() => comprendsLaPhrase(query, { aujourdhui: today, maitres: maitresConnus, clientes: clientesConnues }), [query, today, maitresConnus, clientesConnues]);

  const { upcoming, past, comptes, totaux } = useMemo(() => {
    /* Recherche par nom de cliente — taper les premières lettres suffit
       (insensible aux accents : « agnes » trouve « Agnès ») ; le nom porté par
       le RDV sert de repli pour les têtes de passage sans fiche. */
    const qn = normName(query);
    const nameOf = (a: Appointment) => ficheParId.get(a.clientId)?.name ?? a.clientName ?? '';
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
    const match = (a: Appointment) => {
      const l = luDe.get(a.id);
      const parLaPhrase = l
        ? gardeSelonLaPhrase(l, phrase, { payeDe: () => apptPayState(a, byId), nomDe: () => nameOf(a), aujourdhui: today })
        : (qn === '' || normName(nameOf(a)).includes(qn));
      return parLaPhrase && estDeLaMaison(a);
    };
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
      /* LA JOURNÉE, À PART — 24 octobre 2026 : rituels du jour et Gamme posée,
         le même calcul qu'au tableau de bord (chiffre-du-jour-pur). */
      jour: chiffreAttenduDuJour(vivants.map((a) => ({
        date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme,
      })), jourVu),
      /* CE QUE CHAQUE TUILE COMPTE, pour l'ouvrir (24 octobre 2026) : les
         mêmes rendez-vous que ses chiffres, dans l'ordre de l'agenda. */
      listes: {
        creance: rendus.filter((a) => apptDueXof(a, byId) > 0)
          .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(a.time) - timeToMin(b.time)),
        jour: vivants.filter((a) => a.date === jourVu)
          .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
        avenir: vivants.filter(aVenir)
          .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time)),
      },
    };

    const dansCeQuiPresse = (a: Appointment) => presse === ''
      || (presse === 'remplir' ? aVenir(a) && manquesDuJour.has(a.clientId) : !!signaux.parRdv.get(a.id)?.some((x) => x.cle === presse));
    const garde = (a: Appointment) => VUES[vue].garde(a, byId, aVenir) && dansCeQuiPresse(a);
    const upcoming = base
      .filter((a) => aVenir(a) && garde(a))
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
    /* « À venir » vide la section des passés : c'est tout l'intérêt de le
       demander. */
    const past = vue === 'avenir' ? [] : base
      .filter((a) => !aVenir(a) && garde(a))
      .sort((a, b) => b.date.localeCompare(a.date) || timeToMin(b.time) - timeToMin(a.time));
    return { upcoming, past, comptes, totaux };
  }, [appts, today, query, ficheParId, maison, categories, byId, vue, bands, sets, produits, reglages, luDe, phrase, presse, signaux, manquesDuJour, jourVu]);

  /* ══ LES MOIS PASSÉS SE REPLIENT — 1er octobre 2026 ═════════════════
     « Quand je clique dans la barre de navigation du Trône, c'est lent »
     (Yéman). Le banc (`scripts/banc-de-la-barre.mjs`) a désigné le Carnet :
     il dessinait ses mille quarante rendez-vous d'un seul bloc, et les
     redessinait TOUS à chaque geste, ouvrir une fiche, taper une lettre,
     recevoir une écriture d'un autre poste. Le coût grandissait d'une ligne
     par rendez-vous pris : la Maison ralentissait d'avoir travaillé.

     Ce qui vient reste entièrement ouvert, c'est le travail du jour. Les
     passés gardent leur en-tête de mois, avec le nombre de rituels et le
     total (c'est ce qui sert aux prévisions), et seul le mois le plus récent
     montre ses lignes. Un mois se déplie d'un geste sur son en-tête. Quand
     une recherche ou un filtre ramène peu de lignes, tout s'ouvre : on ne
     replie pas ce qui tient à l'écran. */
  const [moisBascules, setMoisBascules] = useState<ReadonlySet<string>>(() => new Set());
  const passesRepliables = past.length > SEUIL_DE_REPLI;
  const moisRecent = past[0]?.date.slice(0, 7) ?? '';
  const moisOuvert = (k: string) => !passesRepliables || ((k === moisRecent) !== moisBascules.has(k));
  const basculeLeMois = (k: string) => setMoisBascules((avant) => {
    const apres = new Set(avant);
    if (apres.has(k)) apres.delete(k); else apres.add(k);
    return apres;
  });

  const setStatus = (id: string, status: Appointment['status']) =>
    appointmentsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

  /* Honorer sans encaisser émet la facture (4 octobre 2026) ; « Terminer la
     séance » l'envoie sur son WhatsApp (25 octobre). Un seul chemin pour le
     menu et pour le toucher direct (4 novembre 2026). */
  const termineLaSeance = (a: Appointment, envoyer: boolean) => {
    const h = honoreSansEncaisser(a, byId, tarifsDuRituel(a, {
      client: clients.find((c) => c.id === a.clientId),
      bands, sets, cats: categories, byId, tousServices: services, produits,
    }));
    if (envoyer && h.facture && !h.deja) void envoiDeLaPiece.aRegler(h.facture.id, a.date, { memePasse: true });
    /* La reprise n'est plus posée d'office : la carte la propose quand ce
       rituel est le moment de la suite (le dernier, récent, rien de posé). */
    if (h.honore && laCarteSOuvreApresLHonneur(a.id)) setProchainPour(a.id);
    return h;
  };
  /* HONORÉ ET ANNULÉ D'UN TOUCHER — 4 novembre 2026. Le jour même, honorer
     termine la séance comme le menu : le reste dû part sur son WhatsApp. Un
     rendez-vous passé s'honore sans prévenir (sa règle du 26 octobre 2026 :
     l'envoi d'un passé reste un geste exprès, au menu). */
  const honoreDuDoigt = (a: Appointment) => {
    const envoyer = a.date === today;
    const h = termineLaSeance(a, envoyer);
    if (!h.honore) return;
    const qui = clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente de passage';
    /* Son prochain déjà posé se dit ici : la carte ne s'ouvre pas pour lui. */
    const suite = sonProchainDejaPose(a.id);
    const sonProchain = suite ? `, son prochain rendez-vous : ${momentDuMessage(suite.date, suite.time)}` : '';
    setDefaire(envoyer
      ? { dit: `${qui} · ${a.time} : honoré${h.facture && !h.deja ? ', le reste part sur son WhatsApp' : ''}${sonProchain}` }
      : { dit: `${qui} · ${a.time} : honoré, sans message${sonProchain}`, fn: () => { void deshonoreLeRituel(a, byId); } });
  };
  /* LES DEUX, OU SEULEMENT ELLE ? — 4 novembre 2026 (le parcours du foyer,
     arbitrage 2). Un rendez-vous du foyer pose la question (shared/foyer-pur,
     `questionDAnnulation`) ; hors foyer, le toucher annule comme avant.
     « Défaire » rend à chacune son statut d'avant. */
  const annuleDuDoigt = async (a: Appointment) => {
    const r = await quiAnnuler(a);
    if (!r) return;
    const avant = new Map(appointmentsStore.get().filter((x) => r.ids.includes(x.id)).map((x) => [x.id, x.status] as const));
    appointmentsStore.set((prev) => prev.map((x) => (avant.has(x.id) && x.status !== 'annulé' && x.status !== 'honoré' ? { ...x, status: 'annulé' } : x)));
    const qui = clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente de passage';
    setDefaire({
      dit: r.ids.length > 1 ? `${qui} · ${a.time} : le foyer est annulé (${r.ids.length} rendez-vous)` : `${qui} · ${a.time} : annulé`,
      fn: () => appointmentsStore.set((prev) => prev.map((x) => (avant.has(x.id) ? { ...x, status: avant.get(x.id)! } : x))),
    });
  };

  /* Suppression définitive d'un rendez-vous (depuis le menu ⋯) — confirmation requise. */
  const aEteEncaisse = (a: Appointment) => (a.paidXof ?? 0) > 0 || (a.payments ?? []).length > 0 || !!a.invoiceId;
  const deleteAppt = async (a: Appointment) => {
    /* UN RENDEZ-VOUS ENCAISSÉ EMPORTE SES FACTURES PAYÉES (4 novembre 2026,
       règle 5 de la clôture de Grenat) : la direction seule l'efface. */
    if (moiCarnet?.role !== 'souverain' && ((a.paidXof ?? 0) > 0 || (a.payments ?? []).some((p) => (p.amountXof ?? 0) > 0))) {
      toast('Un rendez-vous encaissé ne s’efface que par la direction : ses factures payées partiraient avec lui.');
      return;
    }
    if (!await demande({
      quoi: 'Suppression définitive',
      titre: 'Supprimer ce rendez-vous ?',
      dit: 'Il quitte le carnet et le calendrier, avec ce qui y était noté.',
      suite: aEteEncaisse(a) ? 'Son encaissement est annulé avec lui : ses factures partent, et l’avoir utilisé revient sur le compte.' : undefined,
      scelle: 'Rien ne pourra le rétablir, sauf une sauvegarde antérieure à aujourd’hui.',
      accepter: 'Supprimer le rendez-vous',
      refuser: 'Garder le rendez-vous',
      dur: true,
    })) return;
    /* UN RENDEZ-VOUS ENCAISSÉ EMPORTE SON ENCAISSEMENT (3 octobre 2026) : sa
       facture restait seule, et l'avoir qu'elle avait consommé ne revenait
       plus jamais, même en la supprimant ensuite. */
    if (aEteEncaisse(a)) cancelAppointmentPayment(a);
    /* UNE REPRISE EFFACÉE À LA MAIN NE REVIENT PAS (2 octobre 2026) : son
       rituel en garde la marque, sinon la prochaine sauvegarde la reposait. */
    const marque = rituelDeLaRepriseEffacee(a);
    appointmentsStore.set((prev) => prev
      .filter((x) => x.id !== a.id)
      .map((x) => (x.id === marque ? { ...x, repriseRetiree: true } : x)));
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
  const parMois = (liste: Appointment[], repliable = false) => {
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
    let jourVu = '';
    for (const a of liste) {
      const k = a.date.slice(0, 7);
      if (k !== mois) {
        mois = k;
        const s = stats.get(k)!;
        const pliable = repliable && passesRepliables;
        out.push(
          <div
            key={`mois-${k}`}
            className={`trc-carnet-mois${pliable ? ' trc-carnet-mois--pliable' : ''}`}
            {...(pliable ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': moisOuvert(k),
              title: moisOuvert(k) ? 'Replier ce mois' : 'Déplier ce mois',
              onClick: () => basculeLeMois(k),
              onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculeLeMois(k); }
              },
            } : {})}
          >
            {pliable && <span className="trc-carnet-mois__pli" aria-hidden="true">{moisOuvert(k) ? '▾' : '▸'}</span>}
            <span className="trc-carnet-mois__nom">{monthTitle(k)}</span>
            <span className="trc-carnet-mois__n">{s.n} rituel{s.n > 1 ? 's' : ''}</span>
            {k >= today.slice(0, 7) && (() => {
              /* Le mois en cours et ceux qui viennent : l'objectif (la somme des
                 objectifs de ses jours ouverts) et la prévision (déjà fait, puis
                 chaque jour à venir au plus grand de posés et de l'ordinaire). */
              const b = bilanDuMois({ mois: k, aujourdhui: today, parJour: comptesParJour, ouvertLe: estOuvertLe, reperes });
              if (b.objectif <= 0) return null;
              return (
                <span className="trc-carnet-mois__n" title={`Objectif : la somme des objectifs de ses ${b.joursOuverts} jours ouverts. Prévision : ${b.realise} déjà faits, puis ${b.joursRestants} jours à venir comptés chacun au plus grand de ce qui est posé (${b.poses} en tout) et de l'ordinaire de ce jour.`}>
                  {`objectif ${b.objectif} RDV · prévision ${b.prevision}`}
                </span>
              );
            })()}
            {!sansPrix && <span className="trc-carnet-mois__xof">{fmtMoney(s.xof, currency)}</span>}
          </div>,
        );
      }
      /* Un mois passé replié ne montre que son en-tête. */
      if (repliable && !moisOuvert(k)) continue;
      /* LES JOURS DISENT LEUR CHARGE (25 octobre 2026) : sous le mois, chaque
         jour à venir s'annonce avec ses rendez-vous, son montant et la part
         des fauteuils occupée.
         CHAQUE JOUR A SON EN-TÊTE, PASSÉS COMPRIS — 4 novembre 2026 : « il doit
         être absolument évident quand on passe d'un jour à l'autre » (Yéman).
         Le jour se dit en entier, avec l'année ; il colle en haut de la liste
         tant qu'on le parcourt, et ce qui reste à clore s'y compte. */
      if (a.date === jourVu) continue;
      jourVu = a.date;
      const duJour = liste.filter((x) => x.date === a.date)
        .sort((x, y) => timeToMin(x.time) - timeToMin(y.time));
      const n = comptesParJour.get(a.date) ?? 0;
      const r = reperesDe(reperes, a.date);
      const c = chargeSurObjectif(n, r);
      const aClore = duJour.filter((x) => estAClore(x, today)).length;
      const moment = a.date === today ? 'Aujourd’hui' : a.date === addDaysISO(today, 1) ? 'Demain' : a.date === addDaysISO(today, -1) ? 'Hier' : '';
      out.push(
        <div key={`jour-${a.date}`} className={`trc-carnet-jour${a.date === today ? ' est-aujourdhui' : a.date < today ? ' est-passe' : ''}`}>
          <span className="trc-carnet-jour__nom">{jourEnClair(a.date).replace(/^./, (c) => c.toUpperCase())}</span>
          {moment && <span className="trc-carnet-jour__moment">{moment}</span>}
          <span className="trc-carnet-jour__infos">
            <span>{duJour.length} rendez-vous</span>
            {!sansPrix && <span className="trc-carnet-jour__xof">{fmtMoney(duJour.reduce((n, x) => n + apptNetXof(x, byId), 0), currency)}</span>}
            {aClore > 0 && <b className="trc-carnet-jour__clore">{aClore} à clore</b>}
            {a.date >= today && c.ton !== 'sans' && (
              <span className={`trc-carnet-jour__charge${c.ton === 'plein' ? ' est-plein' : c.ton === 'creux' ? ' est-creux' : ''}`} title={calculDuJour(r, n)}>
                objectif <i aria-hidden="true"><b style={{ width: `${Math.min(100, Math.round(c.part * 100))}%` }} /></i> {`${n} / ${c.objectif} RDV`}
              </span>
            )}
          </span>
        </div>,
      );
      /* UNE CARTE PAR CLIENTE — 4 novembre 2026 : ses rendez-vous du jour sous
         son nom, dans l'ordre des heures ; on voit où sa fiche commence et où
         elle finit. Une cliente de passage a sa carte par rendez-vous. */
      const cartes: Appointment[][] = [];
      for (const x of duJour) {
        const sienne = x.clientId ? cartes.find((g) => g[0].clientId === x.clientId) : undefined;
        if (sienne) sienne.push(x); else cartes.push([x]);
      }
      for (const g of cartes) {
        if (g.length === 1) {
          out.push(<div key={`carte-${g[0].id}`} className="trc-carte-rdv">{renderRow(g[0])}</div>);
          continue;
        }
        const cl = clientOf(g[0].clientId);
        const vivants = g.filter((x) => x.status !== 'annulé');
        out.push(
          <div key={`carte-${g[0].id}`} className="trc-carte-rdv est-groupe">
            <div className="trc-carte-rdv__tete" style={{ gridTemplateColumns: GRID }}>
              <span />
              <span className="trc-rdv__nom">
                {cl && <Avatar client={cl} size={30} />}
                <span className="trc-name">{cl?.name ?? g[0].clientName ?? 'Cliente de passage'}</span>
                <span onClick={(e) => e.stopPropagation()}><PortesWhatsApp phone={cl?.phone} /></span>
              </span>
              <span className="trc-carte-rdv__total">
                {g.length} rendez-vous{!sansPrix ? ` · ${fmtMoney(vivants.reduce((s, x) => s + apptNetXof(x, byId), 0), currency)}` : ''}
              </span>
              <span />
            </div>
            {g.map((x) => renderRow(x, false))}
          </div>,
        );
      }
    }
    return out;
  };

  const renderRow = (a: Appointment, avecNom = true) => {
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
      /* ══ AVANT LE FAUTEUIL — 31 octobre 2026 ═══════════════════════════
         « Credo vient le 13 novembre, il faut que je me souvienne de relire
         notre conversation » (Yéman). Sous chaque rendez-vous à venir, le
         briefing d'Opale, en frère de la rangée : la grille de la rangée ne
         sait pas accueillir une ligne pleine largeur, et le bloc arrête ses
         clics avant qu'ils n'ouvrent la fenêtre du rendez-vous. */
      <Fragment key={a.id}>
      <div
        className={`trc-sheet__row trc-rdv est-${CLASSE_DU_STATUT[a.status].replace('trc-pill--', '')}`}
        style={{ gridTemplateColumns: GRID, cursor: 'pointer' }}
        onClick={() => setModal({ appt: a })}
        title="Modifier ce rendez-vous"
      >
        {/* LE JOUR DE LA SEMAINE SE LIT AU CARNET — 6 septembre 2026. Depuis le
            4 novembre 2026, il se lit dans l'en-tête de chaque jour, en entier ;
            la ligne garde l'heure, dans sa colonne, et la durée dessous. */}
        <span className="trc-rdv__heure">
          <span className="trc-time">{a.time}</span>
          <small>{dureeDite(apptDurationMin(a, byId))}</small>
        </span>
        <span className="trc-carnet__client">
          {avecNom && (
          <span className="trc-rdv__nom">
            {c && <Avatar client={c} size={30} />}
            <span className="trc-name">
              {c?.name ?? a.clientName ?? 'Cliente de passage'}
            </span>
            {/* LE TÉLÉPHONE, AU CARNET. C'est ici qu'on cherche à joindre quelqu'un
                — pour prévenir d'un retard, confirmer une venue, relancer un
                impayé — et il n'y figurait pas : il fallait quitter le Carnet,
                ouvrir Clientes, retrouver la fiche. Un clic ouvre SA CONVERSATION
                DANS LE TRÔNE (14 septembre 2026, « ne sors pas du Trône ») :
                elle menait à `wa.me`, donc à un message écrit ailleurs, dont la
                Maison ne gardait aucune trace. `stopPropagation` empêche
                d'ouvrir le rendez-vous au passage. */}
            {/* LES DEUX PORTES — un seul composant, partagé avec Clientes
                (15 septembre 2026, « exactement comme sur Carnet »). Recopier
                le dessin ferait diverger les deux écrans au premier réglage. */}
            <PortesWhatsApp phone={c?.phone} />
          </span>
          )}
        <span className="trc-carnet__svc">
          <span className="trc-rdv__rituel">{apptLabel(a, byId)}</span>
          {a.serviceIds.length > 1 && <span className="trc-src trc-src--indigo">{a.serviceIds.length} services</span>}
          {/* CE QU'ELLE EMPORTE SE VOIT AU CARNET — 5 septembre 2026. Une
              Gamme posee a la reservation et invisible ici serait une promesse
              qui ne tient qu'a la memoire de celle qui l'a prise. Le montant
              est a part : un flacon n'est pas un geste, il ne paie pas de
              mains. */}
          {/* ══ CE QU'IL FAUT LUI DEMANDER — 6 septembre 2026 ═══════════
              « Dès qu'un rendez-vous arrive et que cette tête est dans cette
              liste, il faut nous demander de remplir cette information »
              (Yéman).

              LA LISTE DES MANQUES NE SE TRAVAILLE PAS DEPUIS UNE PAGE : elle
              se travaille AU MOMENT OÙ LA TÊTE EST LÀ. C'est le seul instant
              où l'on peut constater sa longueur, mesurer sa mèche, ou lui
              demander son e-mail sans la déranger un autre jour.

              SEULEMENT SUR CE QUI VIENT. Le retard d'une tête servie l'an
              dernier n'a rien à faire sur une ligne d'historique : on ne peut
              plus rien lui demander. */}
          {manquesDuJour.get(a.clientId) && a.status !== 'annulé' && a.date >= todayISO() && (
            <button
              type="button"
              className="trc-src"
              style={{
                background: 'var(--copper-50)', color: 'var(--copper-700)',
                borderColor: 'var(--copper-300)', cursor: 'pointer',
              }}
              title={`À remplir : ${manquesDuJour.get(a.clientId)!.join(' · ')}`}
              onClick={() => navigate('/a-faire')}
            >
              {manquesDuJour.get(a.clientId)!.length} à remplir
            </button>
          )}
          {/* LA PASTILLE DIT OÙ EN EST LA GAMME — 7 septembre 2026. Elle
              disait « à régler » à vie, même encaissée : on courait après un
              argent déjà entré. Réglée, elle se lit apaisée. */}
          {(a.gamme?.length ?? 0) > 0 && (
            <span
              className="trc-src"
              style={gammeTouteReglee(a.gamme)
                ? { color: 'var(--ink-soft)' }
                : { background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
              title={gammeTouteReglee(a.gamme)
                ? 'La Gamme de ce rendez-vous est réglée, sa pièce la porte'
                : 'La Gamme posée à la réservation, à régler au comptoir avec le rituel'}
            >
              {gammeTouteReglee(a.gamme) ? 'Gamme ' : '+ Gamme '}{fmtMoney(apptGammeXof(a), currency)}
              {gammeTouteReglee(a.gamme) ? ' · réglée' : ''}
            </span>
          )}
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
          {/* ELLE A TERMINÉ ELLE-MÊME (6 novembre 2026, Terminer et régler) :
              « A terminé · règlement en cours », puis « Réglée en ligne · Départ
              sans caisse ». Rien pour un rendez-vous qu'elle n'a pas terminé. */}
          {(() => {
            const marque = a.termineParElle ? marqueDeLaFinAuCarnet(a, saPiece(a.id)) : null;
            return marque && (
              <span
                className={marque.etat === 'reglee-en-ligne' ? 'trc-src trc-src--indigo' : 'trc-src'}
                style={marque.etat === 'reglee-en-ligne' ? undefined : { background: 'var(--copper-50)', color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
                title={marque.sous}
              >
                {marque.dit}
              </span>
            );
          })()}
          {/* CE QUE LE TRÔNE VOIT (25 octobre 2026) : chaque signal porte son
              calcul en infobulle. Sur ce qui vient seulement. */}
          {(signaux.parRdv.get(a.id) ?? []).map((s) => (
            <span key={s.cle} className={`trc-src trc-signal${s.alerte ? ' est-alerte' : ''}`} title={s.pourquoi}>{s.dit}</span>
          ))}
          <SourceBadge source={a.source} />
        </span>
        </span>
        <span className="trc-carnet__amount">
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
              {/* LE CHIFFRE DU BANDEAU DE LA FENÊTRE — 9 octobre 2026, décision
                  de la direction : le prix APRÈS remise, l'ancien barré à côté
                  quand il diffère. La colonne disait le prix avant toute
                  remise, la fenêtre le prix remisé : deux nombres pour le même
                  rendez-vous. Voir `montantDuCarnet`. */}
              {!sansPrix && (() => {
                const m = montantDuCarnet(a, byId);
                return (
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>
                    {m.barre !== undefined && (
                      <s style={{ color: 'var(--ink-soft)', fontSize: 13, marginRight: 6 }}>{fmtMoney(m.barre, currency)}</s>
                    )}
                    {fmtMoney(m.montant, currency)}
                  </span>
                );
              })()}
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
          {/* UN SEUL GESTE PROPOSÉ, dans l'ordre de ce qui presse. */}
          {(() => {
            const l = luDe.get(a.id);
            const g = l ? gesteDuRdv(l, signaux.parRdv.get(a.id) ?? [], today, sansPrix) : null;
            if (!g) return null;
            const chiffres = tel(c?.phone);
            if (g.cle === 'appeler' && chiffres) {
              return <a className="trc-geste" href={`tel:+${chiffres}`} onClick={(e) => e.stopPropagation()}>{g.dit} ›</a>;
            }
            return (
              <button type="button" className="trc-geste" onClick={(e) => {
                e.stopPropagation();
                if (g.cle === 'ancien') { const d = signaux.dettes.get(a.clientId); if (d) setPayAppt(appts.find((x) => x.id === d.plusAncien.id) ?? null); }
                else if (g.cle === 'encaisser') setPayAppt(a);
                else if (g.cle === 'confirmer') setStatus(a.id, 'confirmé');
                else if (g.cle === 'acompte' && cheminDeLaConversation(c?.phone)) navigate(cheminDeLaConversation(c?.phone)!);
                else setModal({ appt: a });
              }}>{g.dit} ›</button>
            );
          })()}
        </span>
        <span className="trc-carnet__status">
          <span className="trc-rdv__pastilles">
          <PayStatusPill a={a} byId={byId} />
          <ReminderBell appt={a} client={c} byId={byId} />
          {/* LA PASTILLE EST LE BOUTON — 4 novembre 2026 : le statut se lit à sa
              couleur et s'ouvre d'un toucher sur le menu du rendez-vous. */}
          <span className="trc-menuwrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`trc-pill trc-statut ${CLASSE_DU_STATUT[a.status]}`}
              aria-haspopup="menu"
              aria-expanded={menuFor === a.id}
              aria-label={`Statut : ${a.status}. Changer le statut ou agir sur ce rendez-vous`}
              title="Changer le statut, encaisser, envoyer la facture"
              onClick={(e) => {
                e.stopPropagation();
                if (menuFor === a.id) { fermeLeMenu(); return; }
                setMenuAncre(e.currentTarget);
                setMenuFor(a.id);
              }}
            >
              {a.status}<span className="trc-statut__chevron" aria-hidden="true">▾</span>
            </button>
            {menuFor === a.id && menuAncre && (
              <MenuFlottant ancre={menuAncre} onClose={fermeLeMenu}>
                <div className="trc-menu__titre">Statut</div>
                {canConfirm && (
                  <button onClick={() => { setStatus(a.id, 'confirmé'); setMenuFor(null); }}>Confirmer le rendez-vous</button>
                )}
                {canHonor && (() => {
                  /* UN RENDEZ-VOUS PASSÉ A DEUX GESTES (26 octobre 2026, sa
                     décision) : « envoyer la facture » part exprès, « Honorer
                     sans prévenir » ne dit rien. */
                  const termine = (envoyer: boolean) => {
                    termineLaSeance(a, envoyer);
                    setMenuFor(null);
                  };
                  return a.date === todayISO() ? (
                    <button onClick={() => termine(true)}>Terminer la séance · le reste part sur son WhatsApp</button>
                  ) : (
                    <>
                      <button onClick={() => termine(true)}>Terminer la séance · envoyer la facture</button>
                      <button onClick={() => termine(false)}>Honorer sans prévenir</button>
                    </>
                  );
                })()}
                {canCancel && (
                  <button className="is-danger" onClick={() => { setMenuFor(null); void annuleDuDoigt(a); }}>
                    Annuler le rendez-vous
                  </button>
                )}
                {a.status === 'honoré' && (
                  <button className="is-danger" onClick={() => { void deshonoreLeRituel(a, byId); setMenuFor(null); }}>
                    Dés-honorer le rituel
                  </button>
                )}
                {a.status === 'annulé' && (
                  <button onClick={() => { setStatus(a.id, 'confirmé'); setMenuFor(null); }}>Rétablir le rendez-vous</button>
                )}
                <div className="trc-menu__filet" role="separator" />
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
                {/* LE CHEMIN INVERSE — 13 septembre 2026. L'annulation
                    d'encaissement y renvoyait depuis août, et il n'existait pas. */}
                {a.status === 'honoré' && apptDueXof(a, byId) > 0 && (() => {
                  /* UNE PIÈCE, UN SEUL WHATSAPP — 1er novembre 2026 : la pièce 0166
                     est partie deux fois, à 14 h 37 puis à 22 h 08 depuis un autre
                     poste. Quand le papier est déjà parti, le bouton le dit et
                     s'appelle « Renvoyer » : le geste reste exprès, mais plus
                     personne ne croit envoyer pour la première fois. La pièce se
                     choisit comme `factureAEnvoyer` : celle du rituel, pas payée. */
                  const piece = pieces.find((p) => p.apptId === a.id && p.kind === 'facture' && p.status !== 'payée');
                  const partie = !!piece && pieceDejaPartie(piece);
                  return (
                    <button onClick={() => renvoieLaFacture(a)}>
                      {partie && piece ? `Renvoyer la facture · déjà ${ditLaPiecePartie(piece)}` : 'Envoyer la facture sur son WhatsApp'}
                    </button>
                  );
                })()}
                {/* LA FACTURE DU FOYER — 27 octobre 2026 : les rendez-vous du même
                    compte ou du même numéro, ce jour-là, en une facture et un
                    message, avec le total. Chaque tête garde sa facture. */}
                {a.status !== 'annulé' && a.date <= todayISO() && (() => {
                  const duJour = rdvsDuFoyerLeJour(a, appts, clients);
                  if (duJour.length < 2) return null;
                  const tarifsDe = (x: Appointment) => tarifsDuRituel(x, {
                    client: clients.find((c) => c.id === x.clientId),
                    bands, sets, cats: categories, byId, tousServices: services, produits,
                  });
                  const qui = prenomsDuFoyer(duJour, clients);
                  const dus = duJour.filter((x) => x.status === 'honoré' && apptDueXof(x, byId) > 0);
                  const envoie = (terminer: boolean) => {
                    setMenuFor(null);
                    void envoiDeLaPiece.foyer(piecesDuFoyer(duJour, byId, tarifsDe, { terminer }), a.date, { renvoi: !terminer });
                  };
                  if (duJour.some((x) => x.status !== 'honoré')) {
                    return <button onClick={() => envoie(true)}>Terminer les séances de {qui} · une facture du foyer</button>;
                  }
                  return dus.length >= 2 ? (
                    <button onClick={() => envoie(false)}>
                      Envoyer la facture du foyer · {qui} · {fmtMoney(dus.reduce((n, x) => n + apptDueXof(x, byId), 0), currency)}
                    </button>
                  ) : null;
                })()}
                {/* LE POINT DU COMPTE — 28 octobre 2026 : toutes les factures que
                    son compte doit encore, en un PDF et un lien, au payeur. */}
                <BoutonDuPoint
                  teteId={a.clientId} className="" libelle="Envoyer le point du compte"
                  onOpen={(id) => { setMenuFor(null); setPointDe(id); }}
                />
                <button onClick={() => { duplicateLast(a.clientId); setMenuFor(null); }}>
                  ⟳ Dupliquer le dernier RDV {c ? `de ${c.name.split(' ')[0]}` : ''}
                </button>
                <button className="is-danger" onClick={() => { deleteAppt(a); setMenuFor(null); }}>
                  Supprimer définitivement
                </button>
              </MenuFlottant>
            )}
          </span>
          </span>
          {/* HONORÉ OU ANNULÉ D'UN TOUCHER — 4 novembre 2026 : sur ce qui est passé
              ou du jour et attend encore son statut, sans ouvrir le menu. */}
          {estAClore(a, today) && (
            <span className="trc-rdv__vite" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="trc-vite trc-vite--oui"
                onClick={() => honoreDuDoigt(a)}
                title={a.date === today ? 'Terminer la séance : le reste dû part sur son WhatsApp' : 'Honorer sans prévenir'}
              >
                ✓ Honoré
              </button>
              <button type="button" className="trc-vite trc-vite--non" onClick={() => { void annuleDuDoigt(a); }} title="Annuler le rendez-vous">
                Annulé
              </button>
            </span>
          )}
        </span>
      </div>
      {/* Replié par défaut ; ouvert d'office le jour même quand il y a quelque
          chose à relire. Seulement sur ce qui vient : on ne se prépare pas à
          un rendez-vous passé, honoré ni annulé (le passage du soir ne les
          compte pas non plus). */}
      {a.status !== 'annulé' && a.status !== 'honoré' && a.date >= today && <AvantLeFauteuil appt={a} />}
      </Fragment>
    );
  };

  /* ══ LES TUILES S'OUVRENT — 24 octobre 2026 ═══════════════════════════
     « Rendre cliquables les attendus » (Yéman). Chaque tuile ouvre les
     rendez-vous qu'elle compte, avec leur montant ; le total de la liste est
     celui de la tuile, et une ligne ouvre son rendez-vous. */
  const nomDe = (a: Appointment) => clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente de passage';
  const ouvreLeRdv = (a: Appointment) => () => { setDetail(null); setModal({ appt: a }); };
  const ouvreLaCreance = () => setDetail({
    title: 'Reste à encaisser · rituels rendus',
    sub: 'Les rituels déjà rendus qui attendent encore un règlement, du plus récent au plus ancien.',
    rows: totaux.listes.creance.map((a) => ({
      who: nomDe(a), sub: `${a.time} · ${apptLabel(a, byId)} · reste à régler`, date: a.date,
      amount: apptDueXof(a, byId), onOpen: ouvreLeRdv(a),
    })),
    total: totaux.creanceXof,
  });
  /** Le jour de la tuile, en clair : aujourd'hui, demain, hier, ou le jour avec l'année. */
  const jourDeLaTuile = jourVu === today ? 'aujourd’hui' : jourVu === addDaysISO(today, 1) ? 'demain'
    : jourVu === addDaysISO(today, -1) ? 'hier' : jourEnClair(jourVu);
  const ouvreLeJour = () => setDetail({
    title: `Attendu · ${jourDeLaTuile}`,
    sub: `Rituels du jour et Gamme posée · déjà encaissé ${fmtMoney(totaux.jour.encaisseXof, currency)} · reste ${fmtMoney(totaux.jour.resteXof, currency)}`,
    rows: totaux.listes.jour.map((a) => {
      const j = chiffreAttenduDuJour([{ date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme }], a.date);
      return {
        who: nomDe(a),
        sub: `${a.time} · ${apptLabel(a, byId)}${j.gammeXof > 0 ? ` · dont Gamme ${fmtMoney(j.gammeXof, currency)}` : ''} · ${j.resteXof > 0 ? `reste ${fmtMoney(j.resteXof, currency)}` : 'réglé'}`,
        amount: j.attenduXof, onOpen: ouvreLeRdv(a),
      };
    }),
    total: totaux.jour.attenduXof,
  });
  const ouvreLAvenir = () => setDetail({
    title: 'Attendu · rendez-vous à venir',
    sub: 'Chaque rendez-vous à venir à sa valeur entière ; rien n’est encore acquis.',
    rows: totaux.listes.avenir.map((a) => ({
      who: nomDe(a), sub: `${a.time} · ${apptLabel(a, byId)}${apptDueXof(a, byId) < apptNetXof(a, byId) ? ` · reste ${fmtMoney(apptDueXof(a, byId), currency)}` : ''}`, date: a.date,
      amount: apptNetXof(a, byId), onOpen: ouvreLeRdv(a),
    })),
    total: totaux.avenirXof,
  });

  return (
    <div className="mnd-rise">
      {/* « AVANT LE FAUTEUIL » (31 octobre 2026) : le Carnet ouvert à 19 h ou
          à 7 h fait partir la notification du soir ou du matin, comme le
          tableau de bord. Une fois par passage, par la direction seule. */}
      <PassageAvantLeFauteuil />
      <PageHead
        eyebrow="Le Carnet · Agenda"
        title="Rendez-vous."
        actions={
          <>
            <Button variant="ghost" onClick={() => setModal({ initial: { date: addDaysISO(today, -1) }, title: 'Rendez-vous passé.' })}>
              + RDV passé
            </Button>
            <Button variant="ghost" onClick={() => setSerieOuverte(true)}>Saisir en série</Button>
            {peutRattraperUnCahier && (
              <Button variant="ghost" onClick={() => setCahierOuvert(true)}>Rattraper un cahier</Button>
            )}
            <Button variant="copper" onClick={() => setModal({})}>+ Nouveau RDV</Button>
          </>
        }
      />

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
      {/* LES CHIFFRES ET LEUR CALCUL — 25 octobre 2026 (« des démonstrations
          de calculs, avec des totaux », même soir) : le reste à encaisser par
          ancienneté, le probable à venir (posé × venues honorées), et ce qui
          est à surveiller. Les tuiles s'ouvrent toujours sur leurs rendez-vous. */}
      {!sansPrix && (() => {
        const anciennete = ancienneteDesCreances(totaux.listes.creance.map((a) => ({ date: a.date, resteXof: apptDueXof(a, byId) })), today);
        const honneur = signaux.honneur;
        const aVenirLus = totaux.listes.avenir.map((a) => luDe.get(a.id)).filter((l): l is RdvLu => !!l);
        const enRisque = aVenirLus.filter((l) => signaux.parRdv.get(l.id)?.some((x) => x.cle === 'risque'));
        const sansAcompte = aVenirLus.filter((l) => signaux.parRdv.get(l.id)?.some((x) => x.cle === 'acompte'));
        const enJeu = new Set([...enRisque, ...sansAcompte]);
        /* LE NOMBRE VA AVEC SON LIBELLÉ, LE MONTANT RESTE SEUL — 25 octobre
           2026 (« le 1 est à côté du montant 100 F, on a l'impression que
           c'est 1 100 F »). Deux colonnes collées faisaient lire un seul
           chiffre ; le nombre se dit désormais en mots, à gauche
           (« 0 à 7 jours · 1 rituel »), et la colonne de droite ne porte
           qu'un montant (ou le nombre seul, quand la ligne n'a pas de montant). */
        const nDit = (k: number, un: string, plusieurs: string) => `${k}\u00a0${k > 1 ? plusieurs : un}`;
        const L = ({ g, n, d, total, alerte }: { g: string; n?: string; d: string; total?: boolean; alerte?: boolean }) => (
          <span className={`trc-calc${total ? ' est-total' : ''}${alerte ? ' est-alerte' : ''}`}>
            <span>{g}{n && d ? <span className="trc-calc__n"> · {n}</span> : null}</span>
            <span>{d || n || ''}</span>
          </span>
        );
        return (
          <div className="tr-cols" style={{ '--cols': '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 } as CSSProperties}>
            <button type="button" className="trc-tuile" onClick={ouvreLaCreance} title="Voir les rituels à recouvrer" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <div className="trc-microlabel" style={{ margin: 0 }}>Reste à encaisser · rituels rendus ›</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--copper-700)', lineHeight: 1.1 }}>
                {fmtMoney(totaux.creanceXof, currency)}
              </div>
              <span className="trc-calcs">
                {anciennete.tranches.map((t) => <L key={t.cle} g={t.nom} n={nDit(t.n, 'rituel', 'rituels')} d={fmtMoney(t.xof, currency)} alerte={t.cle === '+' && t.n > 0} />)}
                <L g={`${anciennete.n} rituel${anciennete.n > 1 ? 's' : ''}`} d={fmtMoney(anciennete.xof, currency)} total />
              </span>
            </button>
            <div className="trc-tuile trc-tuile--jour" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-indigo)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <div className="trc-jour-nav">
                <button type="button" className="trc-jour-pas" onClick={() => setJourVu(addDaysISO(jourVu, -1))} aria-label="Le jour d’avant" title="Le jour d’avant">‹</button>
                <ChampDeDate compact value={jourVu} onChange={(v) => { if (v) setJourVu(v); }} ariaLabel="Le jour attendu" style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="trc-jour-pas" onClick={() => setJourVu(addDaysISO(jourVu, 1))} aria-label="Le jour d’après" title="Le jour d’après">›</button>
              </div>
              {jourVu !== today && <button type="button" className="trc-jour-auj" onClick={() => setJourVu(today)}>Revenir à aujourd’hui</button>}
            <button type="button" className="trc-tuile__corps" onClick={ouvreLeJour} title="Voir les rendez-vous de ce jour">
              {/* La date est dans le champ juste au-dessus : l'étiquette ne la répète pas. */}
              <div className="trc-microlabel" style={{ margin: 0 }}>Attendu · {['aujourd’hui', 'demain', 'hier'].includes(jourDeLaTuile) ? jourDeLaTuile : 'ce jour'} ›</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--color-indigo)', lineHeight: 1.1 }}>
                {fmtMoney(totaux.jour.attenduXof, currency)}
              </div>
              <span className="trc-calcs">
                <L g="Rendez-vous" n={String(totaux.jour.nombre)} d="" />
                <L g="Déjà encaissé" d={fmtMoney(totaux.jour.encaisseXof, currency)} />
                {totaux.jour.gammeXof > 0 && <L g="dont Gamme" d={fmtMoney(totaux.jour.gammeXof, currency)} />}
                <L g="Reste" d={fmtMoney(totaux.jour.resteXof, currency)} total />
              </span>
            </button>
            </div>
            <button type="button" className="trc-tuile" onClick={ouvreLAvenir} title="Voir les rendez-vous à venir" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-indigo)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <div className="trc-microlabel" style={{ margin: 0 }}>À venir · probable ›</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--color-indigo)', lineHeight: 1.1 }}>
                {fmtMoney(probable(totaux.avenirXof, honneur.taux), currency)}
              </div>
              <span className="trc-calcs">
                <L g="Posés" n={nDit(totaux.avenirN, 'RDV', 'RDV')} d={fmtMoney(totaux.avenirXof, currency)} />
                <L g={honneur.peuDHistoire ? '× venues (par défaut)' : '× venues honorées, 12 mois'} d={tauxDit(honneur.taux)} />
                <L g="Probable" d={fmtMoney(probable(totaux.avenirXof, honneur.taux), currency)} total />
              </span>
            </button>
            <button type="button" className="trc-tuile" onClick={() => setPresse(presse === 'risque' ? '' : 'risque')} title="Garder dans la liste les rendez-vous à risque" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--alarme, #A3402B)', borderRadius: 'var(--radius-md)', padding: '14px 18px' }}>
              <div className="trc-microlabel" style={{ margin: 0 }}>À surveiller ›</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, color: 'var(--color-indigo)', lineHeight: 1.1 }}>
                {enJeu.size} rendez-vous
              </div>
              <span className="trc-calcs">
                <L g="Risque d’absence" n={nDit(enRisque.length, 'RDV', 'RDV')} d={fmtMoney(enRisque.reduce((n, l) => n + l.netXof, 0), currency)} />
                <L g={'Sans acompte à 48\u00a0h'} n={nDit(sansAcompte.length, 'RDV', 'RDV')} d={fmtMoney(sansAcompte.reduce((n, l) => n + l.netXof, 0), currency)} />
                <L g="En jeu" d={fmtMoney([...enJeu].reduce((n, l) => n + l.netXof, 0), currency)} total />
              </span>
            </button>
          </div>
        );
      })()}

      {/* CE QUI PRESSE, EN COMPTEURS — un compteur touché filtre la liste. */}
      {(() => {
        const aVenirLus = totaux.listes.avenir.map((a) => luDe.get(a.id)).filter((l): l is RdvLu => !!l);
        const remplir = new Set(totaux.listes.avenir.filter((a) => manquesDuJour.has(a.clientId)).map((a) => a.clientId)).size;
        const lignes = ceQuiPresse(aVenirLus.map((l) => ({ a: l, signaux: signaux.parRdv.get(l.id) ?? [] })), remplir)
          .filter((x) => x.n > 0 && (!sansPrix || x.cle !== 'dette'));
        return (
          <div className="trc-presse" role="group" aria-label="Ce qui presse">
            <span className="trc-microlabel" style={{ margin: 0 }}>Ce qui presse</span>
            {lignes.length === 0 && <span className="trc-sub">Rien ne presse sur ce qui vient.</span>}
            {lignes.map((x) => (
              <button key={x.cle} type="button" aria-pressed={presse === x.cle}
                className={`trc-presse__puce${x.alerte ? ' est-alerte' : ''}${presse === x.cle ? ' is-on' : ''}`}
                onClick={() => setPresse(presse === x.cle ? '' : x.cle)}>
                <b>{x.n}</b> {x.dit}{x.xof > 0 && !sansPrix ? <span> · {fmtMoney(x.xof, currency)}</span> : null}
              </button>
            ))}
            {presse && <button type="button" className="trc-presse__effacer" onClick={() => setPresse('')}>Tout montrer</button>}
          </div>
        );
      })()}

      {/* 7 novembre 2026 (Y.) : « mettre la barre de recherche juste au-dessus de Rendez-vous à venir, en dessous de ce qui presse ». */}
      <div className="trc-toolbar trc-carnet-barre" ref={barreRef}>
        <div className="trc-searchwrap">
          <Search size={17} aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Une cliente, ou une phrase : « impayés de septembre », « Team samedi »…"
            aria-label="Rechercher un rendez-vous, par cliente ou par une phrase"
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

      {query.trim() && phrase.compris.length > 0 && (
        <div className="trc-compris" role="status">
          <span className="trc-compris__dit">Le Carnet comprend :</span>
          {phrase.compris.map((x) => <span key={x} className="trc-compris__puce">{x}</span>)}
          <span className="trc-compris__dit">· {upcoming.length + past.length} rendez-vous</span>
        </div>
      )}

      <div className="trc-sheet trc-carnet" style={{ '--carnet-barre': `${hautBarre}px` } as CSSProperties}>
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Heure</span>
          <span>Cliente et rituel</span>
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
            {passesRepliables && (
              <div className="trc-carnet-repli">
                Seul le mois le plus récent montre ses lignes. Touchez un mois pour le déplier.
              </div>
            )}
            {parMois(past, true)}
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
      {defaire && (
        <div className="trc-defaire" role="status">
          <span>{defaire.dit}</span>
          {defaire.fn && (
            <button type="button" onClick={() => { defaire.fn?.(); setDefaire(null); }}>Défaire</button>
          )}
        </div>
      )}
      {detail && <DrillModal drill={detail} onClose={() => setDetail(null)} />}
      {serieOuverte && <SerieModal onClose={() => setSerieOuverte(false)} />}
      {pointDe && <FenetreDuPoint teteId={pointDe} onClose={() => setPointDe(null)} />}
      {cahierOuvert && peutRattraperUnCahier && <RattraperUnCahier onClose={() => setCahierOuvert(false)} />}

      {prochainPour && <FenetreDuProchainRituel rituelId={prochainPour} onClose={() => setProchainPour(null)} />}
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
