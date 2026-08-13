import { useEffect, useMemo, useState } from 'react';
import { asset } from '../../../../shared/asset';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom } from '../../../../shared/identite';
import { clientsStore, segmentsStore, useSegments, usePersonas, useFamilies, ensureInitiePersona, estDePassage, estCouronnee, estVisiteur, estDeLaMaison, joursAvantAnniversaire, remiseFamillePct, type Client } from '../../../../shared/clients';
import { useCredits, creditBalanceOf } from '../../../../shared/finance';
import { holderOf, payerClientIdOf } from '../../../../shared/accounts';
import { appointmentsStore, apptPayeurId, venuesHonorees, tetesVenues, type Appointment } from '../../../../shared/agenda';
import { QUATRE_TEMPS, useClientTemps, tempsOf, tempsDone, nextTemps, setTemps } from '../../../../shared/temps';
import { useProducts, useServices, LONGUEURS } from '../../../../shared/catalog';
import { bandOf, useModelBands } from '../../../../shared/pricing';
import { envieLabel } from '../../../../shared/quiz';
import {
  enAttente, nomPropose, refuserEnfant, useEnfantsDeclares, validerEnfant, type EnfantDeclare,
} from '../../../../shared/enfants';
import { ageDe, estMineur, tetesPortees } from '../../../../shared/accounts';
import { SIGNAL_NOMS, litObservation, type SignalCle } from '../../../../shared/persona';
import { aiEnabled, suggestClient } from '../../../../shared/ai';
import { useInvoices, invoiceTotal, type Invoice } from '../../../../shared/finance';
import { usePointsHistory, cercleSeuilStore, estDuCercle, pointsEnabledStore } from '../../../../shared/offers';
import { dernierBilanDe, useBilans } from '../../../../shared/bilans';
import { BilanModal } from './BilanModal';
import { useClientSessions, isOnline } from '../../../../shared/activity';
import { uid, useStore } from '../../../../shared/store';
import { pushToClient } from '../../../../shared/push';
import { PayAppointmentModal } from './actions';
import { useSubscribers, usePlans, activeSubscriberOf } from '../equipe/data';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import {
  Avatar, Drawer, RdvModal, StatusPill, readImageDownscaled, type RdvInitial,
  addDaysISO, apptDueXof, apptLabel, apptNetXof, cadenceLabel, frLong, frShort, frDay,
  fromISO, predictNextVisit, relDays, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  type Cadence,
} from './_shared';
import './clients.css';
import { splitNotes, serializeNotes, ConsultCards, EditConsultModal, type ConsultBlock } from './consultNotes';

/* Customers — le CRM 360 : recherche, tri, indicateurs, segments, persona attribué,
   prochain RDV prédit, fiche complète (finances, présence Ma Couronne, commandes,
   rendez-vous à venir, fidélité, historique) et ajout d'une cliente. */

const GRID = '2.1fr 1fr 0.95fr 0.9fr 0.5fr 96px 84px';

type SortKey = 'nom' | 'visite' | 'depense' | 'points' | 'anniversaire';

/* LES INDICATEURS SONT DES PORTES. Ils annonçaient trois chiffres sans donner
   les noms qui les composent : « 3 anniversaires sous 30 j » n'aide personne si
   retrouver les trois têtes demande de fouiller le carnet une fiche à la fois.

   Un focus IGNORE les registres et les segments, et compte sur la même
   population que la carte. C'est ce qui garantit que le chiffre annoncé et le
   nombre de lignes affichées sont le même nombre — un compteur qui ne mène pas
   exactement à ce qu'il compte fait douter des autres. */
type Focus = 'aucun' | 'nouvelles' | 'anniversaires' | 'enligne';
const FOCUS_LABEL: Record<Exclude<Focus, 'aucun'>, string> = {
  nouvelles: 'Nouvelles ce mois',
  anniversaires: 'Anniversaires sous 30 j',
  enligne: 'En ligne · Ma Couronne',
};

/* ---------- La file des enfants déclarés ----------
   Le parent a écrit un prénom et une date de naissance depuis Ma Couronne. Il
   n'a désigné personne : rien dans sa demande ne pointe une fiche existante.
   C'est ici, et seulement ici, qu'une tête naît — et avec elle l'accès du
   parent à son suivi.

   ON MONTRE CE QU'ON S'APPRÊTE À CRÉER. Valider sans voir le nom complet, l'âge
   et le compte qui va s'ouvrir, c'est signer sans lire. */
function FileEnfants({ onClose }: { onClose: () => void }) {
  const { branch } = useBranch();
  const [declarations] = useEnfantsDeclares();
  const clients = useBranchClients();
  const [familles] = useFamilies();
  const today = todayISO();
  const [refusFor, setRefusFor] = useState<string | null>(null);
  const [motif, setMotif] = useState('');
  /* Le nom tel qu'il sera écrit sur la fiche. Le parent l'a donné, le comptoir
     le relit — une faute de frappe sur un nom d'enfant le suit partout. */
  const [noms, setNoms] = useState<Record<string, string>>({});

  const file = enAttente(declarations, branch.id);
  const parentDe = (d: EnfantDeclare) => clients.find((c) => c.id === d.clientId);

  return (
    <Modal title="Enfants déclarés" onClose={onClose} width={620}>
      <div className="mnd-muted" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.55 }}>
        Un parent ne peut pas créer une fiche : il dépose un prénom et une date de naissance.
        C’est vous qui ouvrez la tête — et c’est ce geste qui lui donne accès au suivi de son enfant.
      </div>

      {file.length === 0 && <div className="trc-empty">Plus rien n’attend.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {file.map((d) => {
          const parent = parentDe(d);
          const nomComplet = noms[d.id] ?? nomPropose(d);
          const age = ageDe(d.birthday, today);
          const fam = parent?.familyId ? familles.find((f) => f.id === parent.familyId) : undefined;
          return (
            <div
              key={d.id}
              style={{
                border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)',
                borderRadius: 3, background: 'var(--surface-card)', padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  {/* LE NOM SE RELIT AVANT D'ÊTRE ÉCRIT. L'enfant porte le nom de
                      son père, et la maman est souvent inscrite sous son nom de
                      jeune fille : rien ne se déduit d'elle. */}
                  <Input
                    value={nomComplet}
                    onChange={(e) => setNoms((p) => ({ ...p, [d.id]: e.target.value }))}
                    style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}
                  />
                  <div className="trc-sub" style={{ marginTop: 5 }}>
                    {age !== undefined ? `${age} an${age > 1 ? 's' : ''} · née le ${frShort(d.birthday)}` : frShort(d.birthday)}
                    {' · déclaré par '}{parent?.name ?? 'une cliente inconnue'}
                    {' le '}{frShort(d.declareLe)}
                  </div>
                </div>
                <span className="trc-src">En attente</span>
              </div>

              <div className="trc-sub" style={{ marginTop: 10, lineHeight: 1.55 }}>
                {fam
                  ? <>Rejoindra <b style={{ fontWeight: 600 }}>{fam.name}</b>{fam.payerClientId === parent?.id ? '' : ' — attention, le parent payeur de ce compte est quelqu’un d’autre'}.</>
                  : <>Ouvrira un compte famille au nom de <b style={{ fontWeight: 600 }}>{parent?.name ?? '—'}</b>, qui en sera le payeur.</>}
                {' '}Fiche sans e-mail ni mot de passe — un mineur n’a pas de compte.
              </div>

              {refusFor === d.id ? (
                <div style={{ marginTop: 12 }}>
                  <Field label="Pourquoi ce refus ? (le parent le lira)">
                    <Input
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                      placeholder="Sa fiche existe déjà au comptoir…"
                    />
                  </Field>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button size="sm" variant="copper" onClick={() => { refuserEnfant(d, motif, today); setRefusFor(null); setMotif(''); }}>
                      Confirmer le refus
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRefusFor(null); setMotif(''); }}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    variant="indigo"
                    onClick={() => {
                      const r = validerEnfant(d, today, nomComplet);
                      if (!r.ok) window.alert(r.erreur ?? 'Impossible de valider cette demande.');
                    }}
                  >
                    Ouvrir sa fiche
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRefusFor(d.id)}>Refuser</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* Prédiction du prochain rendez-vous — le juge vit dans `shared/cadence.ts`
   (via `_shared`) : le tableau de bord et l'accueil de Ma Couronne le lisent
   aussi, et deux copies finiraient par dire deux dates pour la même tête. */

/** Chiffres seulement — pour wa.me et la recherche téléphone. */
const digitsOf = (s: string) => s.replace(/\D/g, '');

/* ----- Registre Diaspora — la liste à part du CRM (clientes vivant à l'étranger).
   Porté par le segment « Diaspora » (une seule vérité : la fiche), mais servi
   comme un registre de premier rang : bascule La Maison / Diaspora au-dessus
   de la liste, ajout par recherche, retrait d'un geste sur la ligne. */
const DIASPORA = 'Diaspora';
const isDiaspora = (c: Client) => c.segments.some((s) => s.trim().toLowerCase() === 'diaspora');
/** Href téléphone — garde le + international. */
const telHref = (s: string) => `tel:${s.replace(/[^+\d]/g, '')}`;

/** Logo WhatsApp (monochrome, prend la couleur du texte). */
const WaGlyph = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
    <path d="M17.5 14.4c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.29-.76.96-.93 1.16-.17.2-.34.22-.63.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.18-.24-.57-.48-.5-.66-.5l-.56-.01c-.2 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.42s1.05 2.8 1.19 3c.15.2 2.06 3.14 4.99 4.4.7.3 1.24.48 1.66.62.7.22 1.34.19 1.84.11.56-.08 1.75-.71 1.99-1.4.25-.69.25-1.28.17-1.4-.07-.12-.26-.19-.55-.34zM12.03 21.3a9.2 9.2 0 0 1-4.68-1.28l-.34-.2-3.48.91.93-3.39-.22-.35a9.15 9.15 0 0 1-1.4-4.87 9.19 9.19 0 0 1 9.2-9.17 9.14 9.14 0 0 1 9.17 9.19 9.19 9.19 0 0 1-9.18 9.16zm7.82-16.99A11.1 11.1 0 0 0 12.02.99C5.94.99 1 5.93.99 12a11 11 0 0 0 1.47 5.5L.9 23.2l5.84-1.53a11.1 11.1 0 0 0 5.28 1.35h.01c6.07 0 11.02-4.94 11.02-11.01a10.94 10.94 0 0 0-3.2-7.7z" />
  </svg>
);

/** Durée éditoriale : « 45 min », « 3 h 20 min ». */
const fmtDur = (sec: number): string => {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} h ${r} min` : `${h} h`;
};

/** Âge éditorial de la couronne : « 24 j », « 8 mois », « 2 ans 3 mois ». */
const crownAge = (iso: string): string => {
  const days = Math.max(0, Math.round((Date.now() - fromISO(iso).getTime()) / 86400000));
  if (days < 30) return `${days} j`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))} mois`;
  const years = Math.floor(days / 365);
  const months = Math.round((days % 365) / 30);
  const y = `${years} an${years > 1 ? 's' : ''}`;
  return months > 0 ? `${y} ${months} mois` : y;
};

/** Anniversaire — date longue « 12 mars 1990 ». */
const frBirthday = (iso: string) =>
  fromISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Âge révolu + jours avant le prochain anniversaire (fenêtre discrète des
    14 j). Le compte des jours vient du juge partagé (`joursAvantAnniversaire`,
    shared/clients) — le même que le rappel de Ce qui presse. */
function bdayInfo(iso: string): { age: number; daysUntil: number; soon: boolean } {
  const b = fromISO(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hadThisYear =
    today.getMonth() > b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() >= b.getDate());
  const age = today.getFullYear() - b.getFullYear() - (hadThisYear ? 0 : 1);
  const daysUntil = joursAvantAnniversaire(iso);
  return { age, daysUntil, soon: daysUntil >= 0 && daysUntil <= 14 };
}

/* Consultations (parsing / sérialisation / rendu / édition) : module partagé ./consultNotes */

/** Cellule « nombre de locks » (modèle) éditable À MÊME LA LISTE — c'est ce qui
    pilote le prix personnalisé (barème par tranches). Validation au blur / Entrée
    (le brouillon reste local pendant la frappe) ; clic capté pour ne pas ouvrir la
    fiche ; une valeur venue d'ailleurs (synchro) rafraîchit la case hors focus. */
function LocksCell({ client }: { client: Client }) {
  const asText = (n?: number) => (n != null ? String(n) : '');
  const [draft, setDraft] = useState(asText(client.lockCount));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(asText(client.lockCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.lockCount, focused]);
  const commit = () => {
    setFocused(false);
    const raw = draft.replace(/[^0-9]/g, '');
    const v = raw === '' ? undefined : Math.max(0, parseInt(raw, 10));
    if (v !== client.lockCount) {
      clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, lockCount: v } : c)));
    }
  };
  return (
    <input
      className="mnd-input"
      inputMode="numeric"
      value={draft}
      placeholder="—"
      title="Nombre de locks (modèle) — pilote le prix personnalisé"
      aria-label={`Nombre de locks de ${client.name}`}
      onClick={(e) => e.stopPropagation()}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width: '100%', maxWidth: 84, textAlign: 'center', padding: '5px 6px', fontSize: 13 }}
    />
  );
}

/* LA DATE EN CLAIR — MOIS · JOUR · ANNÉE (13 août, demande de Yéman). Le champ
   natif s'affiche dans l'ordre de la LANGUE DU NAVIGATEUR : sur un poste en
   anglais, « 05/07/1990 » se lisait 7 mai quand la main croyait écrire un
   5 juillet — et rien ne disait quel nombre était le mois. Ici le mois
   s'écrit EN TOUTES LETTRES, l'ordre est celui que la Maison a demandé, et
   l'ISO ne s'écrit que quand la date est complète et réelle. */
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function DateEnClair({ value, onChange, ariaLabel }: {
  value?: string;
  onChange: (iso: string | undefined) => void;
  ariaLabel?: string;
}) {
  const decompose = (iso?: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    return m ? { mois: m[2], jour: String(Number(m[3])), annee: m[1] } : { mois: '', jour: '', annee: '' };
  };
  const [p, setP] = useState(() => decompose(value));
  useEffect(() => { setP(decompose(value)); }, [value]);
  const maj = (patch: Partial<typeof p>) => {
    const n = { ...p, ...patch };
    setP(n);
    if (!n.mois && !n.jour.trim() && !n.annee.trim()) { onChange(undefined); return; }
    const a = parseInt(n.annee, 10);
    const j = parseInt(n.jour, 10);
    if (!n.mois || !Number.isFinite(a) || n.annee.trim().length !== 4 || a < 1900 || a > 2100 || !Number.isFinite(j) || j < 1) return;
    /* Le jour se borne au mois réel — un 31 février devient le 28/29. */
    const jMax = new Date(a, Number(n.mois), 0).getDate();
    const jOk = Math.min(j, jMax);
    onChange(`${a}-${n.mois}-${String(jOk).padStart(2, '0')}`);
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Select
        value={p.mois}
        onChange={(e) => maj({ mois: e.target.value })}
        style={{ flex: '1 1 120px', minWidth: 0 }}
        aria-label={ariaLabel ? `${ariaLabel} — mois` : 'Mois'}
      >
        <option value="">— mois —</option>
        {MOIS_FR.map((nom, i) => (
          <option key={nom} value={String(i + 1).padStart(2, '0')}>{nom}</option>
        ))}
      </Select>
      <Input
        inputMode="numeric"
        value={p.jour}
        onChange={(e) => maj({ jour: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
        placeholder="jour"
        style={{ width: 58, textAlign: 'right', flex: 'none' }}
        aria-label={ariaLabel ? `${ariaLabel} — jour` : 'Jour'}
      />
      <Input
        inputMode="numeric"
        value={p.annee}
        onChange={(e) => maj({ annee: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
        placeholder="année"
        style={{ width: 74, textAlign: 'right', flex: 'none' }}
        aria-label={ariaLabel ? `${ariaLabel} — année` : 'Année'}
      />
    </div>
  );
}

/* LE CHAMP « STYLE DE COURONNE » EST RETIRÉ (13 août, décision de Yéman) :
   le calibre se COMPTE — il se déduit du nombre de locks par le barème
   (`calibreDe`), il ne se choisit plus dans une liste. `Client.crownStyle`
   reste porté par les fiches anciennes, il ne s'écrit plus. */

export default function Customers() {
  const { branch, currency } = useBranch();
  const clients = useBranchClients();
  const appts = useBranchAppointments();
  const [invoices] = useInvoices();
  const [sessions] = useClientSessions();
  const byId = useServicesById();
  const [personas] = usePersonas();
  const today = todayISO();

  const [seg, setSeg] = useState('Tous');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('nom');
  const [focus, setFocus] = useState<Focus>('aucun');
  /* Un second clic sur la même carte referme — sinon il faudrait chercher par où
     revenir. Et les anniversaires se rangent d'office du plus proche au plus
     lointain : sur cette liste-là, c'est la seule question qu'on se pose. Le
     tri reste visible dans le sélecteur, donc modifiable. */
  const ouvrirFocus = (f: Exclude<Focus, 'aucun'>) => {
    setFocus((prev) => (prev === f ? 'aucun' : f));
    if (f === 'anniversaires' && focus !== 'anniversaires') setSort('anniversaire');
    else if (focus === 'anniversaires' && sort === 'anniversaire') setSort('nom');
  };
  const [selId, setSelId] = useState<string | null>(null);
  /* `?id=` ouvre une fiche précise depuis ailleurs — la recherche globale
     (Trouver), demain d'autres écrans. On réagit au CHANGEMENT du paramètre,
     jamais à chaque rendu : les clics de la liste gardent la main, et une
     nouvelle navigation vers le même écran rouvre bien la fiche demandée. */
  const [params] = useSearchParams();
  useEffect(() => {
    const pid = params.get('id');
    if (pid) setSelId(pid);
  }, [params]);
  const [rdvFor, setRdvFor] = useState<Client | null>(null);
  const [intake, setIntake] = useState(false);
  /* La file des enfants declares depuis Ma Couronne, en attente de la Maison. */
  const [fileEnfants, setFileEnfants] = useState(false);
  const [declarations] = useEnfantsDeclares();
  const aValider = enAttente(declarations, branch.id);

  /* ----- Registres — La Maison, la Diaspora, les clientes de passage ----- */
  const [view, setView] = useState<'maison' | 'diaspora' | 'passage' | 'visiteur'>('maison');
  const [diaQ, setDiaQ] = useState('');

  /* Le segment « Diaspora » doit exister dans la liste proposée aux fiches et à la
     nouvelle cliente — garanti au premier GESTE (ouverture du registre, ajout),
     jamais au montage, pour ne pas écraser une hydratation en cours. */
  const ensureDiasporaSegment = () =>
    segmentsStore.set((prev) => (prev.some((s) => s.trim().toLowerCase() === 'diaspora') ? prev : [...prev, DIASPORA]));
  const openDiaspora = () => { ensureDiasporaSegment(); setView('diaspora'); };
  const addToDiaspora = (c: Client) => {
    ensureDiasporaSegment();
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id && !isDiaspora(x) ? { ...x, segments: [...x.segments, DIASPORA] } : x)));
  };
  const removeFromDiaspora = (c: Client) =>
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, segments: x.segments.filter((s) => s.trim().toLowerCase() !== 'diaspora') } : x)));

  /* LES REGISTRES SONT DISJOINTS : une cliente Diaspora quitte entièrement la
     liste de La Maison (nom compris) — elle ne vit que dans son registre. Une
     cliente de passage aussi, et pour une raison plus forte encore : elle n'est
     pas une relation, et tant qu'elle figure parmi les têtes de la Maison, tout
     ce qui se compte par tête ment un peu plus à chaque venue.

     LA MARQUE PRIME SUR LA DIASPORA — une passante étrangère est d'abord une
     passante ; l'inverse la ferait relancer comme une cliente installée. */
  const passageClients = useMemo(() => clients.filter(estDePassage), [clients]);
  /* LES VISITEURS — un compte ouvert sur Ma Couronne, aucune venue. Ils ne sont
     pas des clientes : les laisser dans « La Maison » gonflait les têtes
     couronnées à chaque inscription et écrasait la rétention (11 août). Ils ont
     leur registre, et deviennent des têtes le jour où ils s'assoient. */
  const venues = useMemo(() => tetesVenues(appts), [appts]);
  const visiteurClients = useMemo(() => clients.filter((c) => estVisiteur(c, venues)), [clients, venues]);
  /* LA MAISON = les couronnées ET les membres de famille pas encore assis
     (les enfants déclarés — Ezra, Togni, Tobi… — disparaissaient chez les
     Visiteurs, 12 août). Le compteur des têtes couronnées, lui, ne bouge pas. */
  const maisonClients = useMemo(
    () => clients.filter((c) => estDeLaMaison(c, venues) && !isDiaspora(c)),
    [clients, venues],
  );
  const passageCount = passageClients.length;
  const visiteurCount = visiteurClients.length;
  /* Mémoïsés — deux filtres de plus sur toute la base à chaque frappe de la
     recherche ne payaient que deux compteurs. */
  const { tetesCount, diasporaCount } = useMemo(() => ({
    tetesCount: clients.filter((c) => estCouronnee(c, venues)).length,
    diasporaCount: clients.filter((c) => isDiaspora(c) && estCouronnee(c, venues)).length,
  }), [clients, venues]);

  /* Candidates à l'ajout : clientes de la maison PAS encore dans la liste. */
  const diaCandidates = useMemo(() => {
    const t = diaQ.trim().toLowerCase();
    if (!t) return [];
    const td = digitsOf(t);
    return clients
      .filter((c) => !isDiaspora(c) && !estDePassage(c))
      .filter((c) => c.name.toLowerCase().includes(t) || (td !== '' && digitsOf(c.phone).includes(td)))
      .slice(0, 8);
  }, [clients, diaQ]);

  /* Recherche vivante — légèrement différée pour rester fluide sur les grandes maisons. */
  useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim().toLowerCase()), 180);
    return () => window.clearTimeout(t);
  }, [query]);

  /* La présence Ma Couronne se rafraîchit toute seule (battement de 30 s). */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? 'À classer';

  const apptsOf = (id: string) => appts.filter((a) => a.clientId === id);

  const predictNext = (id: string): Cadence => predictNextVisit(appts, clients, id, today);

  /* Chiffres de la maison par cliente : dépense à vie (rituels honorés au net
     + factures payées hors règlements de RDV, pour ne rien compter deux fois)
     et dernière visite. */
  const stats = useMemo(() => {
    const linked = new Set<string>();
    for (const a of appts) if (a.invoiceId) linked.add(a.invoiceId);
    const m = new Map<string, { spend: number; lastISO: string | null }>();
    for (const c of clients) m.set(c.id, { spend: 0, lastISO: null });
    for (const a of appts) {
      if (a.status !== 'honoré') continue;
      /* LA DÉPENSE SUIT L'ARGENT, LA VISITE SUIT LA TÊTE. Un rituel offert
         compte dans la dépense de celle qui l'a payé, mais la dernière venue
         reste celle de la cliente qui s'est assise — c'est son parcours. */
      const paye = m.get(apptPayeurId(a));
      if (paye) paye.spend += apptNetXof(a, byId);
      const vue = m.get(a.clientId);
      if (vue && (!vue.lastISO || a.date > vue.lastISO)) vue.lastISO = a.date;
    }
    for (const inv of invoices) {
      const s = m.get(inv.clientId);
      if (!s) continue;
      if (inv.kind === 'facture' && inv.status === 'payée' && !linked.has(inv.id)
        && !inv.lines.some((l) => l.label.startsWith('Règlement ·'))) {
        s.spend += invoiceTotal(inv);
      }
    }
    return m;
  }, [clients, appts, invoices, byId]);

  /* Qui est sur Ma Couronne en ce moment. */
  const onlineIds = useMemo(() => {
    void tick;
    const set = new Set<string>();
    for (const s of sessions) if (isOnline(s)) set.add(s.clientId);
    return set;
  }, [sessions, tick]);

  /* Indicateurs de tête de page. Ils comptent des TÊTES : les clientes de
     passage en sont exclues, sans quoi « Nouvelles ce mois » monterait à chaque
     inconnue reçue et ne dirait plus rien de ce que la Maison a gagné. Leur
     argent et leur travail comptent ailleurs — Synthèse, Bilan, production. */
  const monthKey = today.slice(0, 7);
  const tetes = useMemo(() => clients.filter((c) => estCouronnee(c, venues)), [clients, venues]);
  /* UNE SEULE SOURCE POUR LE CHIFFRE ET POUR LA LISTE. La carte compte, le clic
     filtre : si les deux s'écrivaient séparément, ils finiraient par diverger, et
     un compteur qui ne mène pas exactement à ce qu'il compte fait douter de tous
     les autres. On garde donc les TÊTES, pas leur nombre. */
  const tetesNouvelles = useMemo(
    () => tetes.filter((c) => (c.since ?? '').slice(0, 7) === monthKey),
    [tetes, monthKey],
  );
  const tetesAnniversaire = useMemo(
    () => tetes.filter((c) => c.birthday && bdayInfo(c.birthday).daysUntil <= 30),
    [tetes],
  );
  const tetesEnLigne = useMemo(() => clients.filter((c) => onlineIds.has(c.id)), [clients, onlineIds]);
  const newThisMonth = tetesNouvelles.length;
  const bdaySoonCount = tetesAnniversaire.length;
  const onlineCount = tetesEnLigne.length;
  const passageThisMonth = passageClients.filter((c) => (c.since ?? '').slice(0, 7) === monthKey).length;

  /* Chips de segments de La Maison : comptées HORS Diaspora (registres disjoints). */
  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of maisonClients) for (const s of c.segments) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [{ label: 'Tous', count: maisonClients.length }, ...[...counts].map(([label, count]) => ({ label, count }))];
  }, [maisonClients]);

  const filtered = useMemo(() => {
    /* LE FOCUS PASSE AVANT LES REGISTRES. Il reprend exactement la population de
       la carte cliquée — sans quoi « 3 anniversaires » afficherait deux lignes
       parce que la troisième est de la Diaspora, et le chiffre mentirait. */
    const base = focus === 'nouvelles'
      ? tetesNouvelles
      : focus === 'anniversaires'
        ? tetesAnniversaire
        : focus === 'enligne'
          ? tetesEnLigne
          : view === 'passage'
            ? passageClients
            : view === 'visiteur'
              ? visiteurClients
              : view === 'diaspora'
                ? clients.filter((c) => isDiaspora(c) && estCouronnee(c, venues))
                : maisonClients;
    let list = focus === 'aucun' && view === 'maison' && seg !== 'Tous'
      ? base.filter((c) => c.segments.includes(seg))
      : base;
    if (q) {
      const qd = digitsOf(q);
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) || (qd !== '' && digitsOf(c.phone).includes(qd)),
      );
    }
    const st = (id: string) => stats.get(id);
    const arr = [...list];
    if (sort === 'nom') arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    else if (sort === 'visite') arr.sort((a, b) => (st(b.id)?.lastISO ?? '').localeCompare(st(a.id)?.lastISO ?? ''));
    else if (sort === 'depense') arr.sort((a, b) => (st(b.id)?.spend ?? 0) - (st(a.id)?.spend ?? 0));
    else if (sort === 'points') arr.sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0));
    /* Le plus proche d'abord : sur une liste d'anniversaires, c'est la seule
       question qu'on se pose. Une tête sans date part à la fin. */
    else if (sort === 'anniversaire') {
      arr.sort((a, b) => (a.birthday ? bdayInfo(a.birthday).daysUntil : 9999)
        - (b.birthday ? bdayInfo(b.birthday).daysUntil : 9999));
    }
    return arr;
  }, [clients, maisonClients, passageClients, tetesNouvelles, tetesAnniversaire, tetesEnLigne,
    focus, seg, q, sort, stats, view]);

  const selected = clients.find((c) => c.id === selId) ?? null;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="CRM · Le Suivi"
        title="Têtes couronnées."
        actions={<Button variant="indigo" onClick={() => setIntake(true)}>+ Nouvelle cliente</Button>}
      />

      {/* LES ENFANTS QUI ATTENDENT. Un parent a déclaré depuis Ma Couronne ; tant
          que la Maison n'a pas regardé, l'enfant n'existe pas et n'ouvre aucun
          accès. Une file qu'on ne voit pas est une file qu'on ne traite pas —
          elle s'annonce donc en haut de l'écran des clientes, pas dans un tiroir. */}
      {aValider.length > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 14, flexWrap: 'wrap', marginBottom: 16,
            background: 'var(--copper-50)', border: '1px solid var(--copper-300)',
            borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)',
            padding: '13px 16px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
              {aValider.length === 1
                ? 'Un enfant déclaré attend votre accord.'
                : `${aValider.length} enfants déclarés attendent votre accord.`}
            </div>
            <div className="trc-sub" style={{ marginTop: 2 }}>
              Tant que vous n’avez pas regardé, aucune fiche n’est créée et le parent n’a accès à rien.
            </div>
          </div>
          <Button variant="copper" size="sm" onClick={() => setFileEnfants(true)}>Examiner</Button>
        </div>
      )}
      {fileEnfants && <FileEnfants onClose={() => setFileEnfants(false)} />}

      {/* Indicateurs de la maison */}
      <div className="trc-kpis">
        <div className="trc-kpi"><b>{tetesCount}</b><span>Têtes couronnées</span></div>
        {/* TROIS INDICATEURS SONT DES PORTES. Ils annonçaient un chiffre sans
            donner les noms : « 3 anniversaires sous 30 j » n'aide personne si
            retrouver les trois têtes demande de fouiller le carnet. Un clic
            ouvre la liste exacte, un second la referme. « Têtes couronnées »
            reste un total — c'est déjà ce que le carnet montre au repos. */}
        <button
          type="button"
          className={`trc-kpi trc-kpi--porte ${focus === 'nouvelles' ? 'is-on' : ''}`}
          aria-pressed={focus === 'nouvelles'}
          title={focus === 'nouvelles' ? 'Revenir au carnet entier' : 'Voir les têtes ouvertes ce mois'}
          onClick={() => ouvrirFocus('nouvelles')}
        >
          <b>{newThisMonth}</b><span>Nouvelles ce mois</span>
        </button>
        <button
          type="button"
          className={`trc-kpi trc-kpi--porte ${focus === 'anniversaires' ? 'is-on' : ''}`}
          aria-pressed={focus === 'anniversaires'}
          title={focus === 'anniversaires' ? 'Revenir au carnet entier' : 'Voir qui fête bientôt, du plus proche au plus lointain'}
          onClick={() => ouvrirFocus('anniversaires')}
        >
          <b>{bdaySoonCount}</b><span>{'Anniversaires sous 30 j'}</span>
        </button>
        <button
          type="button"
          className={`trc-kpi trc-kpi--porte ${onlineCount > 0 ? 'trc-kpi--live' : ''} ${focus === 'enligne' ? 'is-on' : ''}`}
          aria-pressed={focus === 'enligne'}
          title={focus === 'enligne' ? 'Revenir au carnet entier' : 'Voir qui est sur Ma Couronne en ce moment'}
          onClick={() => ouvrirFocus('enligne')}
        >
          <b>{onlineCount}</b><span>En ligne · Ma Couronne</span>
        </button>
      </div>

      {/* CE QU'ON REGARDE SE DIT, ET SE REFERME. Une liste filtrée qui ne
          s'annonce pas se prend pour le carnet entier — et on croit avoir perdu
          des clientes. */}
      {focus !== 'aucun' && (
        <div className="trc-focus">
          <span>
            {FOCUS_LABEL[focus]} · <b style={{ fontWeight: 600 }}>{filtered.length}</b>
            {filtered.length > 1 ? ' têtes' : ' tête'}
            {q ? ', recherche en cours' : ''} — registres et segments mis de côté.
          </span>
          <button type="button" className="trc-focus__x" onClick={() => setFocus('aucun')}>
            Voir tout le carnet
          </button>
        </div>
      )}

      {/* Registres — la Maison, la Diaspora, et celles qui ne font que passer. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          className={`trc-chip ${view === 'maison' ? 'is-active' : ''}`}
          onClick={() => setView('maison')}
          style={{ fontSize: 12, padding: '9px 18px' }}
        >
          La Maison <span className="count">{maisonClients.length}</span>
        </button>
        <button
          className={`trc-chip ${view === 'diaspora' ? 'is-active' : ''}`}
          onClick={openDiaspora}
          style={{ fontSize: 12, padding: '9px 18px' }}
        >
          Diaspora <span className="count">{diasporaCount}</span>
        </button>
        <button
          className={`trc-chip ${view === 'passage' ? 'is-active' : ''}`}
          onClick={() => setView('passage')}
          style={{ fontSize: 12, padding: '9px 18px' }}
        >
          De passage <span className="count">{passageCount}</span>
        </button>
        {/* LE REGISTRE DES VISITEURS ne paraît que s'il y en a : une Maison
            sans inscription en ligne n'a pas à lire un compteur à zéro. */}
        {visiteurCount > 0 && (
          <button
            className={`trc-chip ${view === 'visiteur' ? 'is-active' : ''}`}
            onClick={() => setView('visiteur')}
            style={{ fontSize: 12, padding: '9px 18px' }}
          >
            Visiteurs <span className="count">{visiteurCount}</span>
          </button>
        )}
      </div>

      {view === 'visiteur' && (
        <div className="trc-passage-banner">
          Une fiche sans aucune venue à ce jour — le plus souvent un compte ouvert seul sur Ma Couronne,
          parfois une tête déclarée qui n’est pas encore passée. Ils ne comptent ni dans les têtes
          couronnées, ni dans la rétention — la Maison ne les a pas encore couronnés. Rien à faire :
          le jour où l’un d’eux s’assied, il rejoint La Maison de lui-même. Les fiches créées au comptoir,
          elles, naissent « de passage » et vivent dans leur registre.
        </div>
      )}

      {view === 'passage' && (
        <div className="trc-passage-banner">
          Elles sont venues une fois. Leur rituel compte au chiffre d’affaires et
          à la production du maître ; elles restent hors des têtes couronnées, de
          la rétention et des relances. La marque se lève d’elle-même à leur
          2ᵉ venue — ou d’un geste sur leur fiche.
          {passageThisMonth > 0 && ` ${passageThisMonth} reçue${passageThisMonth > 1 ? 's' : ''} ce mois-ci.`}
        </div>
      )}

      {/* Recherche & tri */}
      <div className="trc-toolbar">
        <div className="trc-searchwrap">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une cliente (nom, téléphone)…"
            aria-label="Rechercher une cliente"
          />
        </div>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ width: 200, flex: 'none' }} aria-label="Trier les clientes">
          <option value="nom">Tri · Nom</option>
          <option value="visite">Tri · Dernière visite</option>
          <option value="depense">Tri · Dépensé</option>
          <option value="points">Tri · Points</option>
          <option value="anniversaire">Tri · Anniversaire</option>
        </Select>
      </div>

      {view === 'maison' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {segments.map((s) => (
            <button key={s.label} className={`trc-chip ${seg === s.label ? 'is-active' : ''}`} onClick={() => setSeg(s.label)}>
              {s.label} <span className="count">{s.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Registre Diaspora : constituer la liste par recherche, sans ouvrir les fiches. */}
      {view === 'diaspora' && (
        <div style={{ marginBottom: 18 }}>
          <div className="trc-searchwrap" style={{ maxWidth: 480 }}>
            <Input
              value={diaQ}
              onChange={(e) => setDiaQ(e.target.value)}
              placeholder="Ajouter une cliente à la liste Diaspora (nom, téléphone)…"
              aria-label="Ajouter une cliente à la liste Diaspora"
            />
          </div>
          {diaCandidates.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {diaCandidates.map((c) => (
                <button
                  key={c.id}
                  className="trc-chip"
                  onClick={() => addToDiaspora(c)}
                  title={`Ajouter ${c.name} à la liste Diaspora`}
                >
                  + {c.name}
                </button>
              ))}
            </div>
          )}
          {diaQ.trim() !== '' && diaCandidates.length === 0 && (
            <div className="trc-sub" style={{ marginTop: 10 }}>
              Aucune cliente hors Diaspora ne répond à cette recherche.
            </div>
          )}
        </div>
      )}

      <div className="trc-sheet trc-crm-sheet">
        <div className="trc-sheet__head" style={{ gridTemplateColumns: GRID }}>
          <span>Cliente</span>
          <span>Prochain RDV</span>
          <span>Dernière visite</span>
          <span>Dépensé</span>
          <span>Points</span>
          <span style={{ textAlign: 'center' }}>Locks</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <div className="trc-empty">
            {view === 'passage'
              ? q
                ? `Aucune cliente de passage ne répond à « ${query.trim()} ».`
                : 'Aucune cliente de passage — elles s’enregistrent au fauteuil ou à la caisse, en deux champs.'
              : view === 'diaspora'
              ? q
                ? `Aucune cliente Diaspora ne répond à « ${query.trim()} ».`
                : 'La liste Diaspora est vide — cherchez une cliente ci-dessus et ajoutez-la d’un geste.'
              : clients.length === 0
                ? 'Aucune tête couronnée — ajoutez la première.'
                : q
                  ? `Aucune cliente ne répond à « ${query.trim()} ».`
                  : 'Aucune tête couronnée sur ce segment.'}
          </div>
        )}
        {filtered.map((c) => {
          const next = predictNext(c.id);
          const st = stats.get(c.id);
          const online = onlineIds.has(c.id);
          const bd = c.birthday ? bdayInfo(c.birthday) : null;
          return (
            <div className="trc-sheet__row" style={{ gridTemplateColumns: GRID, cursor: 'pointer' }} key={c.id} onClick={() => setSelId(c.id)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className="trc-avatarwrap">
                  <Avatar client={c} size={36} />
                  {online && <span className="trc-dot-online" title="En ligne sur Ma Couronne" />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span className="trc-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {estDePassage(c) && <span className="trc-passage-tag">De passage</span>}
                    {/* UN PRIX CONVENU SE VOIT DE LOIN. Il commande de l'argent
                        à chaque venue ; l'apprendre en ouvrant le Profil, c'est
                        l'apprendre après avoir annoncé le mauvais prix. */}
                    {Object.keys(c.prixFixes ?? {}).length > 0 && (
                      <span className="trc-passage-tag" title="Des prix convenus avec elle — fiche → Profil → Ses prix fermes">
                        Prix convenus
                      </span>
                    )}
                    {/* Le JUSTE PRIX est l'autre prix préférentiel — un
                        coefficient sur TOUS ses prix. Il se règle dans
                        Finances → Le Juste Prix ; ici on le voit. */}
                    {(c.priceCoef ?? 1) > 0 && (c.priceCoef ?? 1) !== 1 && (
                      <span className="trc-passage-tag" title="Tous ses prix sont modulés — Finances → Le Juste Prix">
                        Juste Prix ×{String(c.priceCoef).replace('.', ',')}
                      </span>
                    )}
                    {bd && bd.daysUntil <= 30 && (
                      <span className="trc-bday-chip">{bd.daysUntil === 0 ? 'Anniv. aujourd’hui' : `Anniv. J−${bd.daysUntil}`}</span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minWidth: 0 }}>
                    <span style={{ flex: 'none', borderRadius: 999, padding: '2px 9px', background: 'var(--indigo-50)', fontSize: 10, letterSpacing: '.02em', color: 'var(--indigo-600)' }}>
                      {personaName(c.persona)}
                    </span>
                    {c.phone && digitsOf(c.phone) ? (
                      <a
                        className="trc-wa"
                        href={`https://wa.me/${digitsOf(c.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Écrire à ${c.name.split(' ')[0]} sur WhatsApp`}
                      >
                        <WaGlyph />
                        <span className="trc-wa__num">{c.phone}</span>
                      </a>
                    ) : (
                      <span className="trc-sub">—</span>
                    )}
                  </span>
                </span>
              </span>
              <span style={{ fontSize: 13, color: next.predicted ? 'var(--copper-600)' : 'var(--color-indigo)', fontStyle: next.predicted ? 'italic' : 'normal' }}>
                {next.iso ? (next.predicted ? `≈ ${frShort(next.iso)}` : frShort(next.iso)) : '—'}
              </span>
              <span className="trc-sub">{st?.lastISO ? relDays(st.lastISO) : 'jamais venue'}</span>
              <span className="trc-money">{st && st.spend > 0 ? fmtMoney(st.spend, currency) : '—'}</span>
              <span className="trc-sub">{c.loyaltyPoints ?? 0}</span>
              {/* Nombre de locks (modèle) — renseigné directement dans la liste. */}
              <span style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <LocksCell client={c} />
              </span>
              <span className="trc-rowacts" style={view === 'diaspora' ? { flexDirection: 'column', alignItems: 'flex-end', gap: 4 } : undefined}>
                <button
                  type="button"
                  className="trc-rowact trc-rowact--rdv"
                  onClick={(e) => { e.stopPropagation(); setRdvFor(c); }}
                  title={`Proposer un rendez-vous à ${c.name}`}
                >
                  + RDV
                </button>
                {view === 'diaspora' && (
                  <button
                    type="button"
                    className="trc-rowact"
                    onClick={(e) => { e.stopPropagation(); removeFromDiaspora(c); }}
                    title={`Retirer ${c.name} de la liste Diaspora (la fiche est conservée)`}
                  >
                    Retirer
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {selected && (
        <Customer360
          client={selected}
          personaName={personaName(selected.persona)}
          onClose={() => setSelId(null)}
          onOpen={setSelId}
          appts={apptsOf(selected.id)}
          byId={byId}
          predicted={predictNext(selected.id)}
        />
      )}

      {rdvFor && (
        <RdvModal
          onClose={() => setRdvFor(null)}
          initial={{ clientId: rdvFor.id }}
          title={`Rendez-vous · ${rdvFor.name.split(' ')[0]}.`}
        />
      )}

      {intake && <IntakeModal onClose={() => setIntake(false)} personas={personas} />}
    </div>
  );
}

/* ---------- Fiche 360 ---------- */
type C360Tab = 'apercu' | 'profil' | 'parcours' | 'docs';
const C360_TABS: { k: C360Tab; l: string }[] = [
  { k: 'apercu', l: 'Aperçu' },
  { k: 'profil', l: 'Profil' },
  { k: 'parcours', l: 'Parcours' },
  { k: 'docs', l: 'Documents' },
];

function Customer360({
  client, personaName, onClose, onOpen, appts, byId, predicted,
}: {
  client: Client;
  personaName: string;
  onClose: () => void;
  /** Passer à la fiche d'un autre membre du compte sans refermer le tiroir. */
  onOpen: (id: string) => void;
  appts: ReturnType<typeof useBranchAppointments>;
  byId: ReturnType<typeof useServicesById>;
  predicted: Cadence;
}) {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const [personas] = usePersonas();
  const [products] = useProducts();
  /* SES PRIX FERMES — le catalogue entier, pour en désigner un. */
  const [tousServices] = useServices();
  /* Le barème des tranches — pour dire le CALIBRE que son comptage donne. */
  const [bands] = useModelBands();
  const [fixSvc, setFixSvc] = useState('');
  const [fixMontant, setFixMontant] = useState('');
  /* Le prix ferme en cours de correction — édité EN PLACE, comme partout :
     retirer puis reposer faisait deux gestes (et un trou entre les deux). */
  const [fixEdit, setFixEdit] = useState<null | { sid: string; montant: string }>(null);
  const [invoices] = useInvoices();
  const [pointsHistory] = usePointsHistory();
  const [sessions] = useClientSessions();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  /* Abonnement actif de la cliente — distingué sur la fiche. */
  const membership = activeSubscriberOf(subs, client.id);
  const membershipPlan = membership ? plans.find((p) => p.id === membership.planId) : undefined;
  /* Compte & avoir — porté par le compte famille (parent payeur) ou la cliente. */
  const [families] = useFamilies();
  const [credits] = useCredits();
  const clientFamily = client.familyId ? families.find((f) => f.id === client.familyId) : undefined;
  const avoirBal = creditBalanceOf(credits, holderOf(client, families));
  const clientPayerName = clientFamily
    ? clientsStore.get().find((c) => c.id === payerClientIdOf(client, families))?.name ?? 'le parent'
    : client.name;
  /* Navigation par onglets — la fiche 360 était un seul long défilement chargé de
     boutons ; on la range en quatre panneaux focalisés, faciles à parcourir. */
  const [tab, setTab] = useState<C360Tab>('apercu');
  const [bookOpen, setBookOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [adjust, setAdjust] = useState<RdvInitial | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  const [pickPersona, setPickPersona] = useState(false);
  const [allTemps] = useClientTemps();
  const myTemps = tempsOf(allTemps, client.id);
  const today = todayISO();

  /* Identité éditable — nom, téléphone, ville, segment principal. État local,
     enregistré en un geste ; réinitialisé quand on change de cliente. */
  const [segmentList] = useSegments();
  const [idName, setIdName] = useState(client.name);
  const [idPhone, setIdPhone] = useState(client.phone);
  const [idEmail, setIdEmail] = useState(client.email ?? '');
  const [idCity, setIdCity] = useState(client.city);
  useEffect(() => {
    setIdName(client.name);
    setIdPhone(client.phone);
    setIdEmail(client.email ?? '');
    setIdCity(client.city);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  /* Confirmer la date prédite en un geste : un vrai RDV, duplicata du dernier rituel
     (mêmes prestations, même maître, même heure) posé à la date anticipée. */
  const confirmPredicted = () => {
    if (!predicted.iso || !predicted.template) return;
    const t = predicted.template;
    const created: Appointment = {
      id: uid(),
      branchId: branch.id,
      clientId: client.id,
      serviceIds: [...t.serviceIds],
      date: predicted.iso,
      time: t.time,
      master: t.master,
      status: 'confirmé',
      source: 'trone',
    };
    appointmentsStore.set((prev) => [...prev, created]);
  };

  /* Ajuster avant de confirmer : ouvre la modale pré-remplie du duplicata. */
  const adjustPredicted = () => {
    const t = predicted.template;
    setAdjust({
      clientId: client.id,
      serviceIds: t ? [...t.serviceIds] : undefined,
      date: predicted.iso ?? undefined,
      time: t?.time,
      master: t?.master,
    });
  };

  /* La couronne — persistance immédiate ; ce bloc alimente le statut dans Ma Couronne. */
  const patch = (p: Partial<Client>) =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, ...p } : c)));

  /* Photo de profil — réduite avant d'être écrite (voir readImageDownscaled).
     Le portrait suit la cliente partout : listes, carnet, factures, Ma Couronne. */
  const onPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      patch({ photo: await readImageDownscaled(file) });
    } catch {
      window.alert('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.');
    } finally {
      setPhotoBusy(false);
    }
  };

  /* Enregistrement de l'identité — le nom ne peut pas être vidé ; le segment
     principal remplace le premier segment (ou le retire si laissé vide). */
  const idDirty =
    idName !== client.name || idPhone !== client.phone || idCity !== client.city
    || idEmail !== (client.email ?? '');
  /* UN ENREGISTREMENT MUET SE LIT COMME UNE PANNE. L'écriture se faisait bien,
     mais rien ne le disait : le bouton se grisait, et l'on croyait que le clic
     n'avait servi à rien. On le dit donc, brièvement. */
  const [idSaved, setIdSaved] = useState(false);
  useEffect(() => {
    if (!idSaved) return;
    const t = window.setTimeout(() => setIdSaved(false), 2600);
    return () => window.clearTimeout(t);
  }, [idSaved]);
  const saveIdentity = () => {
    patch({ name: idName.trim() || client.name, phone: idPhone.trim(), email: idEmail.trim() || undefined, city: idCity.trim() });
    setIdSaved(true);
  };

  /* Segments — multi-sélection depuis la liste gérée (Paramètres), persistée immédiatement. */
  const toggleSegment = (seg: string) =>
    patch({ segments: client.segments.includes(seg) ? client.segments.filter((s) => s !== seg) : [...client.segments, seg] });
  const addSegment = () => {
    const name = window.prompt('Nom du nouveau segment :')?.trim();
    if (!name) return;
    segmentsStore.set((prev) => (prev.some((s) => s.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]));
    if (!client.segments.some((s) => s.toLowerCase() === name.toLowerCase())) patch({ segments: [...client.segments, name] });
  };

  /* Cadeau anniversaire — pousse une notification à la cliente + garde une trace au Trône. */
  const [giftBusy, setGiftBusy] = useState(false);
  const giftedThisYear = !!client.birthdayGiftAt && client.birthdayGiftAt.slice(0, 4) === todayISO().slice(0, 4);
  const giftBirthday = async () => {
    setGiftBusy(true);
    const first = client.name.split(' ')[0];
    const n = await pushToClient(
      client.id,
      `Joyeux anniversaire — ${maisonNom()}`,
      `${first}, une séance vous est offerte pour votre anniversaire. La Maison vous attend pour la célébrer.`,
      '/couronne/',
      client.email,
    );
    patch({ birthdayGiftAt: todayISO() });
    setGiftBusy(false);
    window.alert(
      n > 0
        ? `Cadeau envoyé — notification reçue sur le téléphone de ${first}.`
        : `Cadeau enregistré côté Trône. ${first} n'a pas activé les notifications sur Ma Couronne — rien poussé sur son téléphone.`,
    );
  };

  /* Note de la maison — texte libre éditable, consultations préservées à part. */
  const parsedNotes = splitNotes(client.notes);
  const [consultOpen, setConsultOpen] = useState(false);
  const [noteText, setNoteText] = useState(parsedNotes.free);
  const noteDirty = noteText.trim() !== parsedNotes.free;
  const saveNote = () => {
    const merged = [noteText.trim(), parsedNotes.consultRaw].filter(Boolean).join('\n\n');
    patch({ notes: merged || undefined });
  };

  /* Modifier / supprimer une consultation enregistrée (depuis la fiche 360). */
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const editBlock = editIdx != null ? parsedNotes.blocks[editIdx] ?? null : null;
  const persistBlocks = (blocks: ConsultBlock[]) => {
    patch({ notes: serializeNotes(noteText, blocks) || undefined });
    setEditIdx(null);
  };
  const saveConsult = (updated: ConsultBlock) => {
    if (editIdx == null) return;
    persistBlocks(parsedNotes.blocks.map((b, i) => (i === editIdx ? updated : b)));
  };
  const deleteConsult = () => {
    if (editIdx == null) return;
    if (!window.confirm('Supprimer définitivement cette consultation ?')) return;
    persistBlocks(parsedNotes.blocks.filter((_, i) => i !== editIdx));
  };

  const bday = client.birthday ? bdayInfo(client.birthday) : null;
  const phoneDigits = digitsOf(client.phone);

  /* Itinéraire vers la cliente : position GPS précise (partagée à la livraison)
     si disponible, sinon recherche par ville. */
  const itineraireHref = client.geo
    ? `https://www.google.com/maps/dir/?api=1&destination=${client.geo.lat},${client.geo.lng}`
    : client.city.trim()
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(client.city.trim())}`
      : null;

  /* Amène un champ d'identité à l'œil et le met en saisie (Appeler/Itinéraire sans info). */
  const focusField = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.focus(), 250);
  };

  /* ----- Fiche financière ----- */
  const honored = appts.filter((a) => a.status === 'honoré');
  /* VENUES, PAS LIGNES — deux rituels le même jour font une seule visite. C'est
     ce que compte `usePassageVivant` pour lever la marque ; la fiche doit dire
     le même chiffre, sinon le comptoir voit « 2 séances » et s'étonne qu'elle
     soit encore de passage. */
  const venues = venuesHonorees(appts, client.id);
  /* Le Cercle, lui, compte par la PAYEUSE — la même clé que les points. Il faut
     donc TOUT le carnet de la branche : un rituel qu'elle a offert à une autre
     ne figure pas dans `appts`, qui ne porte que ceux où elle s'est assise. */
  const branchAppts = useBranchAppointments();
  const [seuilCercle] = useStore(cercleSeuilStore);
  const [pointsOn] = useStore(pointsEnabledStore);
  const venuesCercle = venuesHonorees(branchAppts, client.id, true);
  const myInvoices = invoices.filter((i) => i.clientId === client.id);

  /* Bilan de séance — le Carnet de Suivi se RÉDIGE et se REMET depuis la
     modale (BilanModal) : la remise s'enregistre au registre, la cliente le
     lit sur Ma Couronne, l'impression reste. L'ancien lien direct vers la
     papeterie amnésique est parti avec elle. */
  const [bilanOpen, setBilanOpen] = useState(false);
  const [tousBilans] = useBilans();
  const dernierBilan = dernierBilanDe(tousBilans, client.id);
  const linkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of appts) if (a.invoiceId) set.add(a.invoiceId);
    return set;
  }, [appts]);
  /* Factures payées hors règlements de RDV (produits, POS) — évite le double comptage. */
  const paidExtras = myInvoices.filter((i) =>
    i.kind === 'facture' && i.status === 'payée' && !linkedIds.has(i.id)
    && !i.lines.some((l) => l.label.startsWith('Règlement ·')),
  );
  /* CE QU'ELLE A DÉPENSÉ, ET NON CE QU'ELLE A REÇU. Un rituel qu'on lui a
     offert ne compte pas dans sa dépense ; un rituel qu'elle a offert à une
     autre, si — et il ne figure pas dans `appts`, qui ne contient que ses
     rendez-vous à elle. On relit donc tout le carnet de la branche. */
  const carnetBranche = useBranchAppointments();
  const tetesBranche = useBranchClients();
  /* Les têtes qu'elle porte — ses mineurs, si elle est le parent payeur. */
  const [famillesFiche] = useFamilies();
  const portees = tetesPortees(client, tetesBranche, famillesFiche, todayISO());
  const nomTete = (id: string | undefined) => tetesBranche.find((c) => c.id === id)?.name ?? 'une cliente';

  /* ----- LE COMPTE FAMILLE, TEL QUE FINANCES LE TIENT -----
     Le rattachement se décide dans Comptes & Avoirs, mais il se lit ici : c'est
     sur la fiche qu'on se demande qui règle pour qui. On montre donc le compte
     entier — tous ses membres, pas seulement les mineurs — avec le parent
     payeur et l'avoir du compte, et chaque membre s'ouvre d'un clic. */
  const membresDuCompte = useMemo(() => {
    if (!clientFamily) return [] as Client[];
    const payeur = clientFamily.payerClientId;
    return tetesBranche
      .filter((c) => c.familyId === clientFamily.id && c.id !== client.id)
      .sort((a, b) => {
        /* Le payeur d'abord — c'est lui qui explique le compte. Puis les aînés :
           un foyer se lit du plus grand au plus petit. */
        if (a.id === payeur) return -1;
        if (b.id === payeur) return 1;
        return (a.birthday ?? '').localeCompare(b.birthday ?? '');
      });
  }, [clientFamily, tetesBranche, client.id]);
  const estLePayeur = clientFamily?.payerClientId === client.id;
  const avoirDuCompte = clientFamily
    ? creditBalanceOf(credits, { type: 'family', id: clientFamily.id })
    : 0;

  /* LES FACTURES DU COMPTE. Tout est réglé par le parent, mais chaque pièce
     reste au nom de celle qu'elle concerne : la facture d'un enfant ne
     figurait donc nulle part sur la fiche du parent, alors que c'est lui qui
     l'a payée — et qui vient la réclamer. */
  const documentsDuCompte = useMemo(() => {
    if (membresDuCompte.length === 0) return [];
    const ids = new Set(membresDuCompte.map((m) => m.id));
    return invoices
      .filter((i) => ids.has(i.clientId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, membresDuCompte]);
  const payesParElle = carnetBranche.filter((a) => a.status === 'honoré' && apptPayeurId(a) === client.id);
  const offertsAElle = honored.filter((a) => a.offertPar && a.offertPar !== client.id);
  const offertsParElle = payesParElle.filter((a) => a.clientId !== client.id);
  const spend = payesParElle.reduce((s, a) => s + apptNetXof(a, byId), 0)
    + paidExtras.reduce((s, i) => s + invoiceTotal(i), 0);
  const basketCount = payesParElle.length + paidExtras.length;
  const basket = basketCount > 0 ? Math.round(spend / basketCount) : 0;

  /* Solde dû — tout RDV non annulé dont il reste à encaisser. */
  const owing = appts
    .filter((a) => a.status !== 'annulé' && apptDueXof(a, byId) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const due = owing.reduce((s, a) => s + apptDueXof(a, byId), 0);

  const myPoints = pointsHistory.filter((e) => e.clientId === client.id).slice(0, 4);

  /* ----- Présence Ma Couronne ----- */
  const mySessions = sessions.filter((s) => s.clientId === client.id);
  const onlineNow = mySessions.some((s) => isOnline(s));
  const lastSeenISO = mySessions.reduce<string | null>(
    (acc, s) => (!acc || s.lastSeenAt > acc ? s.lastSeenAt : acc), null,
  );
  const totalSec = mySessions.reduce((s, x) => s + (x.durationSec || 0), 0);
  const lastScreen = mySessions
    .slice()
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0]?.screen;

  /* ----- Factures & devis — tous ses documents, du plus récent au plus ancien.
     Chacun s'ouvre depuis la fiche : la maison n'a plus à quitter la cliente
     pour retrouver une pièce. ----- */
  const documents = [...myInvoices].sort((a, b) => b.date.localeCompare(a.date));

  /* ----- Rendez-vous ----- */
  const history = [...appts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const upcomingAll = appts
    .filter((a) => a.date >= today && a.status !== 'annulé' && a.status !== 'honoré')
    .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time));
  const upcoming = upcomingAll[0];

  /* CHOISIR À LA MAIN, C'EST FIGER. La lecture automatique (shared/persona.ts)
     relit l'archétype à chaque mouvement du carnet ; sans ce verrou, elle
     effacerait le lendemain le jugement porté ici. */
  const setPersona = (persona: string) => {
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, persona, personaFige: true } : c)));
    setPickPersona(false);
  };

  /* Rendre la fiche à la lecture automatique — le prochain mouvement du carnet
     la reclassera. */
  const libererPersona = () =>
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, personaFige: undefined } : c)));

  /* Retrait doux — la cliente disparaît des listes sans quitter la Maison. */
  const archiveClient = () => {
    if (!window.confirm(`Archiver ${client.name} ? Elle sortira des listes sans être supprimée.`)) return;
    patch({ archived: true });
    onClose();
  };

  /* Suppression définitive — les rendez-vous restent au carnet. */
  const deleteClient = () => {
    const warn = appts.length > 0 ? ' Ses rendez-vous resteront au carnet.' : '';
    if (!window.confirm(`Supprimer définitivement ${client.name} ?${warn} Cette action est irréversible.`)) return;
    clientsStore.set((prev) => prev.filter((c) => c.id !== client.id));
    onClose();
  };

  const orderStatusClass = (s: Invoice['status']) =>
    s === 'payée' || s === 'acceptée' ? 'trc-src' : 'trc-src trc-src--indigo';

  return (
    <Drawer onClose={onClose}>
      <div className="trc-drawer__cover">
        <button className="trc-drawer__close" onClick={onClose} aria-label="Fermer">✕</button>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, width: '100%', minWidth: 0 }}>
          <span className="trc-avatarwrap">
            {/* La photo s'ajoute et se change ici même : un clic sur le portrait
                ouvre le sélecteur de fichier. Le badge appareil le signale. */}
            <label className="trc-avatar-edit" title={photoBusy ? 'Traitement…' : client.photo ? 'Changer la photo' : 'Ajouter une photo'}>
              <Avatar client={client} size={64} />
              <span className="trc-avatar-edit__badge" aria-hidden>{photoBusy ? '…' : <Camera size={12} strokeWidth={1.6} aria-hidden />}</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={photoBusy} onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
            {onlineNow && <span className="trc-dot-online" title="En ligne sur Ma Couronne" />}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 26, color: 'var(--color-ivoire)', lineHeight: 1 }}>{client.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 6 }}>{personaName} · {client.city}</div>
            {/* LA MARQUE SE VOIT AVANT TOUT LE RESTE. Une fiche qui ne compte pas
                comme les autres doit le DIRE : sinon on cherche pendant des mois
                pourquoi le total du CRM ne tombe pas juste. */}
            {estDePassage(client) && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '.04em', color: 'var(--color-ivoire)', background: 'rgba(185,122,74,.28)', border: '1px solid var(--copper-300)', borderRadius: 2, padding: '3px 11px' }}>
                De passage · hors têtes actives et relances
              </div>
            )}
            {Object.keys(client.prixFixes ?? {}).length > 0 && (
              <div
                style={{ marginTop: 8, marginLeft: estDePassage(client) ? 8 : 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '.04em', color: 'var(--color-ivoire)', background: 'rgba(185,122,74,.28)', border: '1px solid var(--copper-300)', borderRadius: 2, padding: '3px 11px' }}
                title="Le détail se lit et se corrige au Profil, bloc « Ses prix fermes »."
              >
                Prix convenus · {Object.keys(client.prixFixes ?? {}).length} geste{Object.keys(client.prixFixes ?? {}).length > 1 ? 's' : ''}
              </div>
            )}
            {(client.priceCoef ?? 1) > 0 && (client.priceCoef ?? 1) !== 1 && (
              <div
                style={{ marginTop: 8, marginLeft: estDePassage(client) || Object.keys(client.prixFixes ?? {}).length > 0 ? 8 : 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, letterSpacing: '.04em', color: 'var(--color-ivoire)', background: 'rgba(185,122,74,.28)', border: '1px solid var(--copper-300)', borderRadius: 2, padding: '3px 11px' }}
                title="Tous ses prix sont modulés par ce coefficient — il se règle dans Finances → Le Juste Prix."
              >
                Juste Prix ×{String(client.priceCoef).replace('.', ',')} · tous ses prix
              </div>
            )}
            {membership && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: 'var(--color-ivoire)', background: 'rgba(185,122,74,.28)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '3px 11px' }}>
                ★ Abonnée · {membershipPlan?.name ?? 'formule'} · {membership.cycle ?? 'mensuel'}
              </div>
            )}
            {/* En-tête : contact rapide seulement. Le reste des actions vit dans
                les onglets, pour une carte nette. Info manquante → le bouton mène
                au champ d'identité (onglet Profil) pour la renseigner d'un geste. */}
            <div className="trc-cover-acts">
              {client.phone ? (
                <a className="trc-cover-act" href={telHref(client.phone)}>Appeler</a>
              ) : (
                <button type="button" className="trc-cover-act trc-cover-act--off" title="Ajoutez un numéro dans l’identité" onClick={() => { setTab('profil'); focusField('c360-phone'); }}>Appeler</button>
              )}

              {client.phone && phoneDigits ? (
                <a className="trc-cover-act" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer">WhatsApp</a>
              ) : (
                <button type="button" className="trc-cover-act trc-cover-act--off" title="Ajoutez un numéro dans l’identité" onClick={() => { setTab('profil'); focusField('c360-phone'); }}>WhatsApp</button>
              )}

              {itineraireHref ? (
                <a
                  className="trc-cover-act"
                  href={itineraireHref}
                  target="_blank"
                  rel="noreferrer"
                  title={client.geo ? 'Position GPS précise partagée par la cliente' : 'Itinéraire vers la ville renseignée'}
                >
                  Itinéraire
                </a>
              ) : (
                <button type="button" className="trc-cover-act trc-cover-act--off" title="Ajoutez une ville dans l’identité" onClick={() => { setTab('profil'); focusField('c360-city'); }}>Itinéraire</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="trc-c360-tabs" role="tablist">
        {C360_TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={tab === t.k}
            className={`trc-c360-tab ${tab === t.k ? 'is-on' : ''}`}
            onClick={() => setTab(t.k)}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="trc-c360-panel">
        {tab === 'apercu' && (
        <>
        {/* Prochain RDV — réel, ou prédit avec confirmation en un geste */}
        <div className="trc-next">
          <div className="trc-next__eyebrow">{upcoming ? 'Prochain rendez-vous' : 'Prochain rendez-vous · prédit'}</div>
          <div className="trc-next__date">
            {upcoming ? `${frLong(upcoming.date)} · ${upcoming.time}` : predicted.iso ? `≈ ${frLong(predicted.iso)}` : 'À reconquérir'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--indigo-100)', marginTop: 6 }}>
            {upcoming
              ? `${apptLabel(upcoming, byId)} · ${upcoming.master}`
              : predicted.template
                ? `${apptLabel(predicted.template, byId)} · ${predicted.template.master}`
                : 'La maison anticipe sa cadence — proposez le fauteuil.'}
          </div>

          {/* Analyse de la cadence — visible seulement sur une prédiction */}
          {!upcoming && predicted.iso && (
            <div className="trc-next__cadence">
              {predicted.avgDays
                ? <>Revient {cadenceLabel(predicted.avgDays)}{predicted.sample >= 1 ? ` · d’après ${predicted.sample + 1} visites` : ''}{predicted.confidence ? ` · confiance ${predicted.confidence}` : ''}.</>
                : 'Première cadence estimée — à confirmer.'}
              {predicted.overdueDays > 0 && <span className="trc-next__overdue">En retard de {predicted.overdueDays} j</span>}
            </div>
          )}

          <div className="trc-next__acts">
            {!upcoming && predicted.iso && predicted.template ? (
              <>
                <Button variant="copper" size="sm" onClick={confirmPredicted}>Confirmer ce rendez-vous</Button>
                <Button variant="ghost-invert" size="sm" onClick={adjustPredicted}>Ajuster la date</Button>
              </>
            ) : (
              <Button variant="copper" size="sm" onClick={() => setBookOpen(true)}>+ Proposer un rendez-vous</Button>
            )}
          </div>
        </div>

        {/* Rendez-vous à venir — la liste complète, cliquable pour modifier */}
        {upcomingAll.length > 0 && (
          <div>
            <span className="trc-microlabel">Rendez-vous à venir · {upcomingAll.length}</span>
            <div className="trc-upcoming">
              {upcomingAll.map((a) => (
                <button key={a.id} type="button" className="trc-upcoming__row" onClick={() => setEditAppt(a)} title="Modifier ce rendez-vous">
                  <span className="trc-upcoming__date">{frShort(a.date)} · {a.time}</span>
                  <span className="trc-upcoming__svc">
                    {apptLabel(a, byId)} · {a.master}
                    {a.seriesIndex && a.seriesTotal ? <span className="trc-serie-chip" style={{ marginLeft: 6 }}>{a.seriesIndex}/{a.seriesTotal}</span> : null}
                  </span>
                  <StatusPill status={a.status} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fiche financière */}
        <div>
          <span className="trc-microlabel">Fiche financière</span>
          <div className="trc-finrow">
            <div className="trc-ministat"><b>{fmtMoney(spend, currency)}</b><span>Total dépensé</span></div>
            <div className="trc-ministat"><b>{basket > 0 ? fmtMoney(basket, currency) : '—'}</b><span>Panier moyen</span></div>
            <div className="trc-ministat"><b>{honored.length}</b><span>Séances</span></div>
            {/* Les points ne paraissent que si le programme est ALLUMÉ : un zéro
                d'un programme éteint se lit comme une panne — l'absence est une
                décision, pas un oubli. */}
            {pointsOn && <div className="trc-ministat"><b>{client.loyaltyPoints ?? 0}</b><span>Points cercle</span></div>}
          </div>
          {/* LES DEUX CÔTÉS DU GESTE. Sans ces lignes, la fiche d'Ahmed montre
              une séance sans dépense — on la croit impayée — et celle de Rhanda
              une dépense sans séance — on la croit fausse. */}
          <div className="trc-finrow" style={{ display: 'block' }}>
            {offertsAElle.length > 0 && (
              <div className="trc-sub" style={{ lineHeight: 1.55 }}>
                {offertsAElle.length === 1 ? 'Un rituel lui a été offert' : `${offertsAElle.length} rituels lui ont été offerts`} —{' '}
                {offertsAElle.map((a) => `${nomTete(a.offertPar)} · ${frShort(a.date)}`).join(' · ')}.
                Ces montants comptent dans la dépense de qui les a réglés, pas dans la sienne.
              </div>
            )}
            {offertsParElle.length > 0 && (
              <div className="trc-sub" style={{ lineHeight: 1.55, marginTop: offertsAElle.length > 0 ? 6 : 0 }}>
                Elle a offert {offertsParElle.length === 1 ? 'une séance' : `${offertsParElle.length} séances`} —{' '}
                {offertsParElle.map((a) => `${nomTete(a.clientId)} · ${frShort(a.date)}`).join(' · ')}.
                Compté dans sa dépense et ses points.
              </div>
            )}
          </div>
          {due > 0 && (
            <div className="trc-due">
              <div>
                <span className="trc-due__label">Solde dû · {owing.length} rituel{owing.length > 1 ? 's' : ''}</span>
                <span className="trc-due__amount">{fmtMoney(due, currency)}</span>
              </div>
              <Button variant="copper" size="sm" onClick={() => setPayAppt(owing[0])}>Encaisser</Button>
            </div>
          )}
          {/* LE COMPTE S'OUVRE D'ICI. La carte annonçait un compte et un avoir
              sans y mener : pour verser un avoir, changer le payeur ou rattacher
              une tête, il fallait deviner que tout cela vit dans Finances. */}
          {(clientFamily || avoirBal > 0) && (
            <button
              type="button"
              title={clientFamily ? `Ouvrir ${clientFamily.name} dans Comptes & Avoirs` : 'Ouvrir Comptes & Avoirs'}
              onClick={() => navigate(clientFamily ? `/comptes?famille=${clientFamily.id}` : '/comptes')}
              className="trc-compte-lien"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '10px 13px' }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-indigo)' }}>
                  {clientFamily ? `Compte ${clientFamily.name}` : 'Avoir de la cliente'}
                  <span aria-hidden style={{ color: 'var(--copper-700)', marginLeft: 6 }}>→</span>
                </span>
                <span className="trc-sub" style={{ fontSize: 11 }}>
                  {clientFamily ? `Réglé par ${clientPayerName}` : 'crédit prépayé'} · avoir disponible
                  {clientFamily && membresDuCompte.length > 0 && ` · ${membresDuCompte.length + 1} membres`}
                </span>
              </span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: avoirBal > 0 ? 'var(--copper-700)' : 'var(--ink-soft)', flex: 'none' }}>{fmtMoney(avoirBal, currency)}</span>
            </button>
          )}
        </div>

        {/* Présence Ma Couronne — ligne discrète */}
        <div>
          <span className="trc-microlabel">Présence Ma Couronne</span>
          <div className={`trc-presence ${onlineNow ? 'is-online' : ''}`}>
            <span className="trc-presence__dot" />
            <span>
              {mySessions.length === 0
                ? 'Jamais connectée à Ma Couronne.'
                : onlineNow
                  ? `En ligne maintenant${lastScreen ? ` · ${lastScreen}` : ''}${totalSec > 0 ? ` · ${fmtDur(totalSec)} au total` : ''}`
                  : `Vue ${lastSeenISO ? relDays(lastSeenISO.slice(0, 10)) : '—'}${totalSec > 0 ? ` · ${fmtDur(totalSec)} au total` : ''}`}
            </span>
          </div>
        </div>

        <div className="trc-c360-actions">
          <button className="trc-c360-linkbtn" onClick={() => setBilanOpen(true)} title="Rédiger le bilan, l'enregistrer au registre, l'imprimer">
            {dernierBilan ? `Bilan de séance · dernier remis ${frShort(dernierBilan.remisLe)} →` : 'Bilan de séance · rédiger & remettre →'}
          </button>
        </div>
        {bilanOpen && (
          <BilanModal client={client} honored={honored} byId={byId} branchId={client.branchId} onClose={() => setBilanOpen(false)} />
        )}
        </>
        )}

        {tab === 'profil' && (
        <>
        {/* Identité — éditable */}
        <div>
          <span className="trc-microlabel">Identité</span>
          <div className="trc-crown__grid">
            <Field label="Nom complet">
              <Input value={idName} onChange={(e) => setIdName(e.target.value)} placeholder="Nom et prénom" />
            </Field>
            <Field label="Téléphone">
              <Input id="c360-phone" value={idPhone} onChange={(e) => setIdPhone(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Adresse e-mail">
              <Input type="email" value={idEmail} onChange={(e) => setIdEmail(e.target.value)} placeholder="—" autoComplete="email" />
            </Field>
            <Field label="Ville">
              <Input id="c360-city" value={idCity} onChange={(e) => setIdCity(e.target.value)} placeholder="—" />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            <span className="trc-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              Cliente depuis {client.since ? frLong(client.since) : '—'}
              {client.photo && (
                <button type="button" className="trc-c360-linkbtn trc-c360-linkbtn--muted" onClick={() => patch({ photo: null })}>Retirer la photo</button>
              )}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {idSaved && !idDirty && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--trv-success, var(--color-indigo))' }}>
                  Identité enregistrée.
                </span>
              )}
              <Button variant="indigo" size="sm" disabled={!idDirty} onClick={saveIdentity}>Enregistrer l’identité</Button>
            </span>
          </div>
          <div className="trc-bday">
            <div className="trc-bday__field">
              <Field label="Anniversaire">
                <DateEnClair value={client.birthday} onChange={(iso) => patch({ birthday: iso })} ariaLabel="Anniversaire" />
              </Field>
            </div>
            {client.birthday && bday && (
              <div className="trc-bday__info">
                <span className="trc-bday__age">{frBirthday(client.birthday)} · {bday.age} ans</span>
                {bday.soon && <span className="trc-bday-chip">Anniversaire bientôt</span>}
              </div>
            )}
          </div>
          {client.birthday && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
              <span className="trc-sub">
                {giftedThisYear
                  ? `Séance anniversaire offerte le ${frShort(client.birthdayGiftAt!)}`
                  : 'Offrez-lui une séance pour son anniversaire (notification sur son téléphone).'}
              </span>
              <Button variant="copper" size="sm" disabled={giftBusy} onClick={() => void giftBirthday()}>
                {giftBusy ? 'Envoi…' : giftedThisYear ? 'Renvoyer le cadeau' : 'Offrir une séance anniversaire'}
              </Button>
            </div>
          )}
        </div>

        {/* La couronne — partagé avec Ma Couronne.

            L'EN-TÊTE RÉSUMÉ EST PARTI (11 août). Il répétait les champs du
            dessous — « Style à définir », « 114 locks », « naissance à
            renseigner » disaient trois fois ce que les cellules montrent
            déjà — et comme il vivait à dix centimètres des champs, l'œil le
            prenait pour un AUTRE bloc, jamais à jour du premier. La carte ne
            garde que ce que les champs ne disent pas : le calibre que le
            comptage donne, et l'envie qu'elle a déclarée. */}
        <div>
          <span className="trc-microlabel">La couronne · statut Ma Couronne</span>
          <div className="trc-crown">
            {/* LE CALIBRE, LU DU COMPTAGE — c'est LA réponse que la saisie des
                locks produit : elle se dit ici, sinon remplir le champ semble
                ne rien faire. */}
            {client.lockCount ? (
              <div className="trc-crown__meta">
                {(() => {
                  const b = bandOf(client.lockCount, bands);
                  return b?.name
                    ? `Calibre ${b.name} · ${client.lockCount} locks — c'est lui qui choisit ses créations et son barème.`
                    : `${client.lockCount} locks — comptage inscrit, il pilote son prix personnalisé.`;
                })()}
              </div>
            ) : client.lockCountDeclare ? (
              /* ELLE A DÉCLARÉ AU TUNNEL — la réservation en tient la durée,
                 mais le prix attend le comptage : la ligne le rappelle pour que
                 le fauteuil compte à sa prochaine venue. */
              <div className="trc-crown__meta">
                {(() => {
                  const b = bandOf(client.lockCountDeclare, bands);
                  return `Elle se déclare ${b?.name ? `calibre ${b.name}` : `à ${client.lockCountDeclare} locks`} — durée de créneau seulement. Compter au fauteuil pour ouvrir son prix.`;
                })()}
              </div>
            ) : (
              <div className="trc-crown__meta">Locks à compter — sans eux, les prix s’annoncent « dès ».</div>
            )}
            {/* CE QU'ELLE EST VENUE CHERCHER, dit par elle au quiz de Ma Couronne.
                En lecture seule : une envie se déclare, elle ne se corrige pas
                depuis le comptoir. */}
            {client.envie && (
              <div className="trc-crown__meta" style={{ color: 'var(--copper-700)' }}>
                Son envie · {envieLabel(client.envie)}
                {client.envieAt ? ` · dite le ${frShort(client.envieAt)}` : ''}
              </div>
            )}
            {/* LE STYLE À LA MAIN EST RETIRÉ (13 août) : le calibre se COMPTE
                — il se lit juste au-dessus, déduit du nombre de locks. */}
            <div className="trc-crown__grid">
              <Field label="Nombre de locks">
                <Input
                  type="number"
                  min={0}
                  value={client.lockCount ?? ''}
                  onChange={(e) => patch({ lockCount: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
                  placeholder="—"
                />
              </Field>
              {/* SA LONGUEUR PAR DÉFAUT (11 août) — c'est elle qui donne ses
                  VRAIS prix sur Ma Couronne, où il n'y a pas de sélecteur.
                  Chaque rendez-vous fige toujours la sienne ; ici c'est le
                  point de départ, à tenir à jour quand elle pousse. */}
              <Field label="Longueur travaillée · par défaut">
                <Select
                  value={client.longueur ?? ''}
                  onChange={(e) => patch({ longueur: (e.target.value || undefined) as Client['longueur'] })}
                >
                  <option value="">— à constater —</option>
                  {LONGUEURS.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.hint}</option>)}
                </Select>
              </Field>
              <Field label="Couronne depuis">
                <DateEnClair value={client.crownSince} onChange={(iso) => patch({ crownSince: iso })} ariaLabel="Couronne depuis" />
              </Field>
              {/* « MAÎTRE PRÉFÉRÉ(E) » RETIRÉ DU STATUT (13 août, demande de
                  Yéman) : la préférence est À ELLE — elle se dit dans le
                  Profil de Ma Couronne (`preferredMaster` vit toujours, la
                  reco et la réservation le lisent). */}
              <Field label="Produit recommandé · son Carnet de Suivi">
                <Select value={client.recoProductId ?? ''} onChange={(e) => patch({ recoProductId: e.target.value || undefined })}>
                  <option value="">— aucun —</option>
                  {products.slice().sort((a, b) => a.order - b.order).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {fmtMoney(p.priceXof, currency)}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>
        </>
        )}

        {tab === 'parcours' && (
        <>
        {/* Les quatre temps — où en est sa couronne dans le protocole. */}
        <div>
          <span className="trc-microlabel">
            Les quatre temps · {tempsDone(myTemps)}/4
            {nextTemps(myTemps) ? ` · en cours : ${nextTemps(myTemps)!.name}` : ' · couronne complète'}
          </span>
          <div className="trc-temps">
            {QUATRE_TEMPS.map((t) => {
              const on = !!myTemps[t.key];
              return (
                <div key={t.key} className={`trc-temps__step ${on ? 'is-on' : ''}`}>
                  <button
                    type="button"
                    className="trc-temps__mark"
                    title={on ? `Fait le ${frShort(myTemps[t.key]!)} — cliquer pour retirer` : 'Marquer ce temps aujourd’hui'}
                    aria-pressed={on}
                    onClick={() => setTemps(client.id, t.key, on ? '' : today)}
                  >
                    {t.no}
                  </button>
                  <div className="trc-temps__body">
                    <div className="trc-temps__name">{t.name}</div>
                    <div className="trc-temps__essence">{t.essence}</div>
                    {on && (
                      <input
                        type="date"
                        className="trc-temps__date"
                        value={myTemps[t.key]}
                        max={today}
                        onChange={(e) => setTemps(client.id, t.key, e.target.value)}
                        aria-label={`Date du temps ${t.name}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </>
        )}

        {tab === 'profil' && (
        <>
        {/* Persona & segments — deux colonnes sur le panneau élargi */}
        <div className="tr-grid tr-grid--2">
          <div>
            <span className="trc-microlabel">Persona attribué</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 13px', background: 'var(--surface-card)' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{personaName}</span>
              <button style={{ background: 'none', border: '1px solid var(--color-argile)', borderRadius: 2, cursor: 'pointer', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-indigo)', padding: '7px 12px' }} onClick={() => setPickPersona((v) => !v)}>
                Changer ▾
              </button>
            </div>
            {pickPersona && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {personas.map((p) => (
                  <button key={p.id} className={`trc-chip ${p.id === client.persona ? 'is-active' : ''}`} onClick={() => setPersona(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            {/* LES TÊTES QU'ELLE PORTE. Elles n'apparaissent que si elle est le
                PARENT PAYEUR du compte : un membre de la famille qui ne règle
                pas ne porte personne. Et un enfant en sort le jour de ses
                dix-huit ans — ses données lui appartiennent alors. */}
            {/* LE RATTACHEMENT SE FAIT AILLEURS, ET ON LE DIT. Les enfants
                s'accrochent au compte famille, dans Finances › Comptes & Avoirs.
                Rien ne l'indiquait ici — or c'est ici qu'on les cherche. Le lien
                ouvre directement le bon compte, ou en prépare un neuf avec elle
                comme parent payeur. */}
            {/* LE COMPTE FAMILLE NE PARAÎT QUE S'IL EXISTE. Il s'affichait sur
                TOUTES les fiches, avec sa phrase « elle n'est rattachée à aucun
                compte » et son bouton d'ouverture : cent soixante-dix-huit
                fiches portaient donc un bloc qui ne concernait presque personne,
                et proposaient un compte à des clientes qui n'ont pas de foyer à
                tenir. Le rattachement se fait là où il se décide — Finances ›
                Comptes & Avoirs — et se LIT ici quand il existe. */}
            {clientFamily && (
            <div style={{ marginTop: 14 }}>
              <span className="trc-microlabel">
                {clientFamily.name}
                {membresDuCompte.length ? ` · ${membresDuCompte.length + 1} membres` : ''}
              </span>

              <div style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-indigo)', borderRadius: 3, background: 'var(--surface-card)' }}>
                  {/* CE QUE FINANCES EN SAIT, dit ici : qui règle, et ce qui
                      reste d'avance sur le compte. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderBottom: '1px solid var(--hairline)' }}>
                    <span className="trc-sub">
                      Parent payeur · <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>
                        {estLePayeur ? 'elle-même' : (nomTete(clientFamily.payerClientId) || 'à désigner')}
                      </b>
                    </span>
                    <span className="trc-sub" style={{ flex: 'none' }}>
                      Avoir · <b style={{ fontWeight: 600, color: avoirDuCompte > 0 ? 'var(--copper-700)' : 'var(--ink-soft)' }}>{fmtMoney(avoirDuCompte, currency)}</b>
                    </span>
                  </div>

                  {/* L'AVANTAGE DU COMPTE — la remise famille se lit ici même,
                      pas seulement dans Finances › Comptes : c'est sur cette
                      fiche qu'on prend le rendez-vous qui la portera. */}
                  <div className="trc-sub" style={{ padding: '10px 13px', borderBottom: '1px solid var(--hairline)', lineHeight: 1.5 }}>
                    {remiseFamillePct(clientFamily) > 0 ? (
                      <>Remise famille · <b style={{ fontWeight: 600, color: 'var(--copper-700)' }}>−{remiseFamillePct(clientFamily)}%</b> — posée d'office sur les rendez-vous des membres.</>
                    ) : (
                      <>Remise famille · <b style={{ fontWeight: 600 }}>aucune</b> — ce compte n'en porte pas (réglable dans Finances › Comptes).</>
                    )}
                  </div>

                  {membresDuCompte.length === 0 && (
                    <div className="trc-sub" style={{ padding: '10px 13px' }}>
                      Elle est seule sur ce compte pour l’instant.
                    </div>
                  )}

                  {/* CHAQUE MEMBRE S'OUVRE. Un compte qu'on ne peut pas parcourir
                      oblige à refermer la fiche et à chercher le nom à la main. */}
                  {membresDuCompte.map((m) => {
                    const a = ageDe(m.birthday, todayISO());
                    const mineur = estMineur(m, todayISO());
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => onOpen(m.id)}
                        title={`Ouvrir la fiche de ${m.name}`}
                        style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          borderBottom: '1px solid var(--hairline)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 10, padding: '9px 13px', font: 'inherit',
                        }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: 'var(--color-indigo)', display: 'block' }}>{m.name}</span>
                          <span className="trc-sub">
                            {a !== undefined ? `${a} an${a > 1 ? 's' : ''}` : 'naissance à renseigner'}
                            {m.lockCount ? ` · ${m.lockCount} locks` : ''}
                          </span>
                        </span>
                        <span className="trc-src" style={{ flex: 'none' }}>
                          {m.id === clientFamily.payerClientId ? 'Payeur' : mineur ? 'Mineur' : 'Membre'}
                        </span>
                      </button>
                    );
                  })}
                </div>

              {portees.length > 0 && (
                <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
                  Elle les retrouve dans Ma Couronne et réserve pour eux. Un seul règlement, un seul
                  avoir, et un seul compteur du Cercle pour tout le foyer.
                </div>
              )}
              {/* LA MINORITÉ NE SE PRÉSUME PAS. Sans date de naissance, la base
                  refuse au parent l'accès à son espace — et on ne le voit nulle
                  part si on ne le dit pas ici. */}
              {clientFamily && estLePayeur && membresDuCompte.some((m) => !m.birthday) && (
                <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5, color: 'var(--copper-700)' }}>
                  {membresDuCompte.filter((m) => !m.birthday).length} membre(s) sans date de naissance —
                  elle ne les verra pas dans Ma Couronne tant qu’elle manque.
                </div>
              )}

              <button
                type="button"
                className="trc-c360-linkbtn"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/comptes?famille=${clientFamily.id}`)}
              >
                Modifier le compte · rattacher →
              </button>
            </div>
            )}

            {/* CE QUE LA MAISON OBSERVE D'ELLE. Le carnet dit ce qu'elle a pris ;
                ceci dit comment elle l'a pris — et ce qu'on y lit s'affiche,
                pour que la phrase se corrige quand la lecture se trompe. */}
            <div style={{ marginTop: 14 }}>
              <span className="trc-microlabel">Ce que la maison observe d’elle</span>
              <Textarea
                value={client.observation ?? ''}
                onChange={(e) => patch({ observation: e.target.value || undefined })}
                placeholder="Comment elle réagit au prix, son rythme pendant le rituel, ce qu’elle annonce pour la suite…"
                style={{ minHeight: 76, resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
              />
              {(() => {
                const lu = Object.entries(litObservation(client.observation));
                if (!client.observation?.trim()) {
                  /* Le champ vide n'a pas besoin d'un mode d'emploi : le
                     placeholder du dessus donne déjà les exemples. Une ligne
                     dit l'essentiel, le survol garde le reste. */
                  return (
                    <div
                      className="trc-sub"
                      style={{ marginTop: 6, lineHeight: 1.5 }}
                      title="La maison y lira le rapport au prix, la hâte, les séjours, un grand jour à venir, une fibre fragile — et en tiendra compte pour son archétype."
                    >
                      Phrases libres — la maison en tient compte pour son archétype.
                    </div>
                  );
                }
                return (
                  <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
                    {lu.length === 0
                      ? 'La maison n’y lit aucun signal — reformulez si vous en attendiez un.'
                      : <>La maison y lit : {lu.map(([k]) => SIGNAL_NOMS[k as SignalCle]).join(' · ')}.</>}
                  </div>
                );
              })()}
            </div>

            {/* D'OÙ VIENT CET ARCHÉTYPE — figé par la Maison, ou relu au carnet.
                Un rangement dont on ignore l'origine ne se corrige jamais. */}
            <div className="trc-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {client.personaFige ? (
                <>
                  Choisi par la Maison — la lecture automatique ne le corrige plus.{' '}
                  <button
                    type="button"
                    className="tre-link-btn"
                    onClick={libererPersona}
                  >
                    Rendre à la lecture du carnet
                  </button>
                </>
              ) : (
                'Relu à chaque mouvement du carnet — choisir ci-dessus le fige.'
              )}
            </div>
          </div>

          {/* CE QU'ELLE EST POUR LA MAISON — une relation, ou un passage.
              Distinct de l'archétype juste au-dessus : le persona dit son GOÛT,
              ceci dit son STATUT. Les confondre reviendrait à choisir entre
              savoir ce qu'elle aime et savoir si elle revient. */}
          <div>
            <span className="trc-microlabel">Sa place à la Maison</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* TROIS PLACES, DONT UNE QUI NE SE CHOISIT PAS.
                  « Visiteur » n'est pas un réglage : c'est ce que dit le carnet
                  quand personne ne s'est encore assis. On l'affiche pour que la
                  fiche explique d'elle-même pourquoi elle ne compte pas dans les
                  têtes — mais on ne le rend pas cliquable : il n'y aurait rien à
                  écrire, et un bouton qui ne fait rien se lit comme une panne. */}
              <button
                type="button"
                className={`trc-chip ${!estDePassage(client) && venues >= 1 ? 'is-active' : ''}`}
                disabled={venues === 0}
                title={venues === 0 ? 'Elle ne s’est pas encore assise — c’est sa venue qui la couronnera.' : undefined}
                style={venues === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                onClick={() => patch({ dePassage: undefined })}
              >
                Tête couronnée
              </button>
              <button
                type="button"
                className={`trc-chip ${!estDePassage(client) && venues === 0 ? 'is-active' : ''}`}
                disabled
                title="Constat du carnet, pas un réglage : aucune venue à ce jour."
                style={{ opacity: !estDePassage(client) && venues === 0 ? 1 : 0.4, cursor: 'not-allowed' }}
              >
                Visiteur
              </button>
              {/* LA MARQUE NE TIENDRAIT PAS SUR UNE TÊTE DÉJÀ REVENUE.
                  `usePassageVivant` la RETIRE dès deux venues honorées, et il
                  tourne à chaque mouvement du carnet : la poser ici serait
                  défait dans la seconde, sans un mot — le clic aurait l'air
                  mort. On l'interdit donc, et on dit pourquoi. */}
              <button
                type="button"
                className={`trc-chip ${estDePassage(client) ? 'is-active' : ''}`}
                disabled={!estDePassage(client) && venues >= 2}
                title={!estDePassage(client) && venues >= 2
                  ? 'Elle est revenue — la marque serait retirée aussitôt.'
                  : undefined}
                style={!estDePassage(client) && venues >= 2 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                onClick={() => patch({ dePassage: true })}
              >
                De passage
              </button>
            </div>
            {/* UNE LIGNE, PAS UN PARAGRAPHE (retour de Yéman, 11 août — « trop
                de texte »). L'état se dit en une phrase ; la doctrine complète
                vit au survol, pour qui la cherche. */}
            <div
              className="trc-sub"
              style={{ marginTop: 8, lineHeight: 1.5 }}
              title={estDePassage(client)
                ? 'Son argent et son travail comptent (chiffre, production, primes) ; elle reste hors des têtes couronnées, de la rétention et des relances.'
                : venues === 0
                  ? 'Elle reste hors des têtes couronnées et de la rétention, sans rien à faire : sa première venue honorée l’y fera entrer d’elle-même.'
                  : 'Têtes couronnées, rétention, relances — tout ce qui compte des relations la compte.'}
            >
              {estDePassage(client)
                ? `De passage — la marque se lève à sa 2ᵉ venue (${venues} à ce jour).`
                : venues === 0
                  ? 'Aucune venue — c’est sa première qui la couronnera.'
                  : venues >= 2
                    ? `Une relation — revenue ${venues} fois. « De passage » se lèverait aussitôt.`
                    : 'Elle compte comme relation.'}
            </div>
            <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
              {estDuCercle(venuesCercle, seuilCercle)
                ? `Du Cercle · ${(client.loyaltyPoints ?? 0).toLocaleString('fr-FR')} points.`
                : `Cercle au ${seuilCercle}ᵉ passage — elle en a ${venuesCercle}.`}
            </div>
          </div>

          {/* SES PRIX FERMES — un montant convenu avec elle, geste par geste.
              Le Juste Prix est un COEFFICIENT : il multiplie ce que rend le
              barème, donc il ne sait pas dire « elle paie 20 000 F, quoi
              qu'annonce le catalogue », et il s'applique à TOUTES ses
              prestations à la fois. Ici le montant est ferme : il passe avant
              le calibre, le tarif au lock, le plancher et le coefficient. */}
          <div>
            <span
              className="trc-microlabel"
              title="Ni son nombre de locks ni une révision du catalogue ne le déplaceront — au fauteuil comme sur Ma Couronne, c’est ce montant qui sort."
            >
              Ses prix fermes
            </span>
            <div className="trc-sub" style={{ marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
              Un montant convenu avec elle, geste par geste — rien ne le déplace.
            </div>

            {Object.entries(client.prixFixes ?? {}).map(([sid, montant]) => {
              const sv = tousServices.find((x) => x.id === sid);
              const enEdition = fixEdit?.sid === sid;
              const editNum = enEdition ? (parseInt(fixEdit.montant.replace(/[^0-9]/g, ''), 10) || 0) : 0;
              return (
                /* Pas de `trf-tally` ici : la classe vit dans finances.css, que
                   les écrans Clientes ne chargent pas — la ligne s'affichait
                   sans espacement, nom et prix collés. Le style se porte
                   lui-même, comme les pastilles de la modale RDV. */
                <div
                  key={sid}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '9px 0', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)', minWidth: 0 }}>
                    {/* Une prestation disparue du catalogue garde son accord : on
                        le dit plutôt que d'afficher une ligne muette. */}
                    {sv?.name ?? 'Prestation retirée du catalogue'}
                  </span>
                  {enEdition ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <Input
                        inputMode="numeric"
                        value={fixEdit.montant}
                        onChange={(e) => setFixEdit({ sid, montant: e.target.value })}
                        style={{ width: 120, textAlign: 'right' }}
                        aria-label={`Prix ferme — ${sv?.name ?? sid}`}
                      />
                      <Button
                        variant="indigo"
                        size="sm"
                        disabled={editNum <= 0}
                        onClick={() => {
                          if (editNum <= 0) return;
                          patch({ prixFixes: { ...(client.prixFixes ?? {}), [sid]: editNum } });
                          setFixEdit(null);
                        }}
                      >
                        Enregistrer
                      </Button>
                      <button className="trc-c360-linkbtn trc-c360-linkbtn--muted" onClick={() => setFixEdit(null)}>
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500, color: 'var(--color-indigo)' }}>
                        {fmtMoney(montant, currency)}
                      </span>
                      <button
                        className="trc-c360-linkbtn"
                        onClick={() => setFixEdit({ sid, montant: String(montant) })}
                      >
                        Modifier
                      </button>
                      <button
                        className="trc-c360-linkbtn trc-c360-linkbtn--muted"
                        onClick={() => {
                          const reste = { ...(client.prixFixes ?? {}) };
                          delete reste[sid];
                          patch({ prixFixes: Object.keys(reste).length ? reste : undefined });
                        }}
                      >
                        Retirer
                      </button>
                    </span>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
              <Select value={fixSvc} onChange={(e) => setFixSvc(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                <option value="">— choisir une prestation —</option>
                {tousServices
                  .filter((sv) => !(client.prixFixes ?? {})[sv.id])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                  .map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
              </Select>
              <Input
                inputMode="numeric"
                value={fixMontant}
                onChange={(e) => setFixMontant(e.target.value)}
                placeholder={`Prix (${currency})`}
                style={{ width: 140, textAlign: 'right' }}
              />
              <Button
                variant="indigo"
                size="sm"
                disabled={!fixSvc || !(parseInt(fixMontant.replace(/[^0-9]/g, ''), 10) > 0)}
                onClick={() => {
                  const n = parseInt(fixMontant.replace(/[^0-9]/g, ''), 10) || 0;
                  if (!fixSvc || n <= 0) return;
                  patch({ prixFixes: { ...(client.prixFixes ?? {}), [fixSvc]: n } });
                  setFixSvc('');
                  setFixMontant('');
                }}
              >
                Poser le prix
              </Button>
            </div>
          </div>

          <div>
            <span className="trc-microlabel">Segments</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {[...new Set([...segmentList, ...client.segments])].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`trc-chip ${client.segments.includes(s) ? 'is-active' : ''}`}
                  onClick={() => toggleSegment(s)}
                >
                  {s}
                </button>
              ))}
              <button type="button" className="trc-chip" style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }} onClick={addSegment}>
                + Segment
              </button>
            </div>
          </div>
        </div>
        </>
        )}

        {tab === 'docs' && (
        <>
        {/* Factures & devis — tous ses documents, chacun ouvrable */}
        <div>
          <span className="trc-microlabel">Factures & devis · {documents.length}</span>
          {documents.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun document — ses factures et devis apparaîtront ici.</div>
          )}
          {documents.length > 0 && (
            <div className="trc-orders">
              {documents.map((o) => (
                <button type="button" className="trc-order trc-order--btn" key={o.id} title={`Ouvrir ${o.kind === 'devis' ? 'le devis' : 'la facture'} ${o.number}`} onClick={() => navigate(`/factures?id=${o.id}`)}>
                  <span className="trc-order__id">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{o.number}</span>
                    <span className="trc-sub" style={{ marginLeft: 8 }}>{o.kind === 'devis' ? 'Devis' : 'Facture'} · {frDay(o.date)}</span>
                  </span>
                  <span className="trc-order__total">{fmtMoney(invoiceTotal(o), currency)}</span>
                  <span className={orderStatusClass(o.status)}>{o.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LES PIÈCES DU RESTE DU COMPTE. Chaque facture reste au nom de celle
            qu'elle concerne — c'est juste — mais elle est réglée par le parent,
            et c'est lui qui vient la réclamer. Elle ne figurait nulle part chez
            lui. Elles s'ouvrent d'ici comme les siennes. */}
        {documentsDuCompte.length > 0 && (
          <div>
            <span className="trc-microlabel">
              Factures du compte · {documentsDuCompte.length}
            </span>
            <div className="trc-sub" style={{ marginBottom: 6, lineHeight: 1.5 }}>
              Au nom des autres membres{estLePayeur ? ', réglées par elle' : ''}.
            </div>
            <div className="trc-orders">
              {documentsDuCompte.map((o) => (
                <button
                  type="button"
                  className="trc-order trc-order--btn"
                  key={o.id}
                  title={`Ouvrir ${o.kind === 'devis' ? 'le devis' : 'la facture'} ${o.number}`}
                  onClick={() => navigate(`/factures?id=${o.id}`)}
                >
                  <span className="trc-order__id">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{o.number}</span>
                    <span className="trc-sub" style={{ marginLeft: 8 }}>{nomTete(o.clientId)} · {frDay(o.date)}</span>
                  </span>
                  <span className="trc-order__total">{fmtMoney(invoiceTotal(o), currency)}</span>
                  <span className={orderStatusClass(o.status)}>{o.status}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="trc-microlabel">Points cercle · {client.loyaltyPoints ?? 0}</span>
          {myPoints.length > 0 ? (
            <div className="trc-ptlog">
              {myPoints.map((e) => (
                <div className="trc-ptlog__row" key={e.id}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                  <span className="trc-sub" style={{ flex: 'none' }}>{frDay(e.at.slice(0, 10))}</span>
                  <span className="trc-ptlog__pts">{e.pts > 0 ? `+${e.pts}` : e.pts} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun mouvement de points.</div>
          )}
        </div>
        </>
        )}

        {tab === 'parcours' && (
        <>
        {/* Historique — chaque passage s'ouvre : le RDV dans sa modale, et s'il a
            été encaissé, sa facture d'un second geste. */}
        <div>
          <span className="trc-microlabel">Historique du carnet</span>
          {history.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun passage enregistré.</div>}
          <div className="trc-timeline" style={{ flexDirection: 'column', gap: 0 }}>
            {history.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="trc-timeline__rail">
                  <span className="trc-timeline__dot" style={{ background: a.status === 'honoré' ? 'var(--color-copper)' : 'var(--indigo-200)' }} />
                  {i < history.length - 1 && <span className="trc-timeline__line" />}
                </div>
                <button type="button" className="trc-timeline__open" onClick={() => setEditAppt(a)} title="Ouvrir ce rendez-vous">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{frDay(a.date)} · {a.time}</span>
                    <StatusPill status={a.status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>
                    {apptLabel(a, byId)} · {a.master}
                    {a.invoiceId && <span className="trc-timeline__inv"> · facture</span>}
                  </div>
                </button>
                {a.invoiceId && (
                  <button
                    type="button"
                    className="trc-timeline__facbtn"
                    title="Ouvrir la facture"
                    onClick={() => navigate(`/factures?id=${a.invoiceId}`)}
                  >
                    Facture →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Consultations — repliable pour alléger la fiche */}
        {parsedNotes.blocks.length > 0 && (
          <div>
            <button
              type="button"
              className="trc-consult-toggle"
              onClick={() => setConsultOpen((v) => !v)}
              aria-expanded={consultOpen}
            >
              <span className="trc-microlabel">Consultations · {parsedNotes.blocks.length}</span>
              <span className="trc-consult-toggle__chev">{consultOpen ? 'Masquer ▲' : 'Afficher ▼'}</span>
            </button>
            {consultOpen && <ConsultCards blocks={parsedNotes.blocks} onEdit={(i) => setEditIdx(i)} />}
          </div>
        )}
        </>
        )}

        {tab === 'profil' && (
        <>
        {/* Note de la maison — texte libre éditable */}
        <div>
          <span className="trc-microlabel">Note de la maison</span>
          <textarea
            className="trc-dossier-notes"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Une attention, une préférence, un détail du rituel…"
            rows={3}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="indigo" size="sm" disabled={!noteDirty} onClick={saveNote}>Enregistrer</Button>
          </div>
        </div>

        {/* Retrait de la Maison — archive (doux) ou suppression définitive */}
        <div className="trc-danger">
          <span className="trc-microlabel">Retirer de la Maison</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={archiveClient}>
              Archiver la cliente
            </Button>
            <button type="button" className="trc-danger__btn" onClick={deleteClient}>
              Supprimer la cliente
            </button>
          </div>
          <p className="trc-danger__note">
            L’archivage la retire des listes sans l’effacer. La suppression est définitive.
          </p>
        </div>
        </>
        )}
      </div>

      {bookOpen && <RdvModal onClose={() => setBookOpen(false)} initial={{ clientId: client.id }} title={`Rendez-vous · ${client.name.split(' ')[0]}.`} />}
      {adjust && <RdvModal onClose={() => setAdjust(null)} initial={adjust} title={`Rendez-vous · ${client.name.split(' ')[0]}.`} />}
      {editAppt && <RdvModal onClose={() => setEditAppt(null)} appt={editAppt} />}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
      {editBlock && (
        <EditConsultModal block={editBlock} onSave={saveConsult} onDelete={deleteConsult} onClose={() => setEditIdx(null)} />
      )}
    </Drawer>
  );
}

/* ---------- Ajout d'une cliente ---------- */
function IntakeModal({ onClose, personas }: { onClose: () => void; personas: ReturnType<typeof usePersonas>[0] }) {
  const { branch } = useBranch();
  const [segmentList] = useSegments();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(branch.dial + ' ');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState(branch.city);
  /* Toute nouvelle tête couronnée entre « Initiée » — la maison la nommera
     autrement quand elle la connaîtra. Le persona d'accueil est créé au besoin
     (idempotent) : ici on est au Trône, donc côté personnel, seul habilité à
     écrire les personas. */
  const [persona, setPersona] = useState('');
  useEffect(() => { setPersona(ensureInitiePersona()); }, []);
  const [birthday, setBirthday] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [lockCount, setLockCount] = useState('');
  const [crownSince, setCrownSince] = useState('');
  const [preferredMaster, setPreferredMaster] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  /* L'IA propose, la maison dispose : la suggestion remplit les champs, elle ne
     valide rien. Rien n'est écrit tant que le maître n'a pas enregistré. */
  const suggest = async () => {
    if (!name.trim()) { setError('Donnez d’abord un nom — l’IA n’a rien à lire.'); return; }
    setError(null);
    setWhy(null);
    setThinking(true);
    try {
      /* ON N'ENVOIE QUE CE QUI SERT AU CLASSEMENT. Le nom, l'e-mail, le
         telephone et l'anniversaire partaient vers l'API du prestataire
         d'intelligence artificielle — hors du territoire — alors qu'aucune
         regle du prompt ne les utilise. Le rangement en persona et en segments
         se decide sur le style, la densite et l'anciennete. */
      const s = await suggestClient(
        {
          name: '',
          city: city.trim(),
          /* Le style est retiré du système : le classement se décide sur la
             densité (locks) et l'ancienneté. */
          crownStyle: '',
          lockCount: lockCount === '' ? undefined : Number(lockCount),
          crownSince,
          country: branch.country,
        },
        personas.map((p) => ({ id: p.id, name: p.name, essence: p.essence })),
        segmentList,
      );
      if (s.personaId) setPersona(s.personaId);
      if (s.segments.length) setSegments(s.segments);
      setWhy(s.why || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggestion impossible.');
    } finally {
      setThinking(false);
    }
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    try {
      setPhoto(await readImageDownscaled(file));
    } catch {
      setError('Cette image n’a pas pu être lue. Essayez une photo JPEG ou PNG.');
    }
  };

  const toggleSeg = (s: string) => setSegments((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const save = () => {
    if (!name.trim()) { setError('Donnez un nom à la tête couronnée.'); return; }
    const client: Client = {
      id: uid(),
      branchId: branch.id,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      city: city.trim() || branch.city,
      persona,
      since: todayISO(),
      photo,
      segments,
      priceCoef: 1.0,
      loyaltyPoints: 0,
      birthday: birthday || undefined,
      diaspora: branch.country !== 'Bénin' && branch.country !== "Côte d’Ivoire",
      lockCount: lockCount === '' ? undefined : Math.max(0, Number(lockCount)),
      crownSince: crownSince || undefined,
      preferredMaster: preferredMaster || undefined,
      /* UNE FICHE DU COMPTOIR NAÎT « DE PASSAGE » (décision de Yéman, 11 août).
         Sans la marque, une tête créée avant sa première venue tombait dans le
         registre des VISITEURS — pensé pour les comptes auto-inscrits sur Ma
         Couronne, avec un bandeau qui le prétendait. La relation, elle, se
         PROUVE : la marque se lève d'elle-même à la 2ᵉ venue honorée
         (usePassageVivant), rien à entretenir. */
      dePassage: true,
    };
    clientsStore.set((prev) => [...prev, client]);
    onClose();
  };

  return (
    <Modal title="Nouvelle tête couronnée." onClose={onClose} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {photo ? (
            <img src={photo} alt="" className="trc-avatar" style={{ width: 64, height: 64 }} />
          ) : (
            <span className="trc-avatar" style={{ width: 64, height: 64, fontSize: 24 }}>{name.trim() ? name.trim()[0] : '＋'}</span>
          )}
          <label style={{ cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--copper-600)', border: '1px dashed var(--copper-500)', borderRadius: 2, padding: '9px 14px' }}>
            Ajouter une photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </label>
        </div>

        <Field label="Nom complet">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom et prénom" />
        </Field>

        <div className="tr-grid tr-grid--2">
          <Field label="Téléphone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Adresse e-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" />
          </Field>
          <Field label="Ville">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>

        <div className="tr-grid tr-grid--2">
          <Field label="Persona de départ">
            <Select value={persona} onChange={(e) => setPersona(e.target.value)}>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Anniversaire">
            <DateEnClair value={birthday || undefined} onChange={(iso) => setBirthday(iso ?? '')} ariaLabel="Anniversaire" />
          </Field>
        </div>

        {/* L'IA lit ce qui est saisi et propose persona + segments. Elle remplit
            les champs, elle ne valide rien : le maître garde la main. */}
        {aiEnabled() && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, flexWrap: 'wrap', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)', padding: '10px 12px', background: 'var(--copper-50)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>
                {why ?? 'La maison peut lire cette fiche et proposer un persona et des segments.'}
              </div>
            </div>
            <Button variant="ghost" disabled={thinking} onClick={() => void suggest()}>
              {thinking ? 'La maison réfléchit…' : 'Suggérer'}
            </Button>
          </div>
        )}

        <div>
          <span className="trc-microlabel">La couronne · partagé avec Ma Couronne</span>
          <div className="tr-grid tr-grid--2">
            <Field label="Nombre de locks">
              <Input type="number" min={0} value={lockCount} onChange={(e) => setLockCount(e.target.value)} placeholder="—" />
            </Field>
            <Field label="Couronne depuis">
              <DateEnClair value={crownSince || undefined} onChange={(iso) => setCrownSince(iso ?? '')} ariaLabel="Couronne depuis" />
            </Field>
            <Field label="Maître préféré(e)">
              <Select value={preferredMaster} onChange={(e) => setPreferredMaster(e.target.value)}>
                <option value="">—</option>
                {branch.masters.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
        </div>

        <div>
          <span className="trc-microlabel">Segments</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {segmentList.map((s) => (
              <button key={s} className={`trc-chip ${segments.includes(s) ? 'is-active' : ''}`} onClick={() => toggleSeg(s)}>{s}</button>
            ))}
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>}

        <div className="trc-sub" style={{ lineHeight: 1.5 }}>
          Elle naît « de passage » : son argent et son travail comptent dès aujourd’hui, et sa
          2ᵉ venue honorée la fera tête couronnée d’elle-même.
        </div>
        <Button variant="indigo" onClick={save}>Enregistrer la cliente</Button>
      </div>
    </Modal>
  );
}
