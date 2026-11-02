import { supabase } from './supabase';
import type { Geste } from './journal';
import {
  ACTIONS_DU_SOUVERAIN, DECALAGE_COTONOU_MIN, MARGE_DE_SOMMEIL_MIN, PORTE_ASSISTANT, aCotonou, heureRondeDite,
  type Assistant, type ChoixDeDecision, type Decision, type FaitsDeLaCarte, type GenreDeDecision, type GenreDeRelais,
  type PriveDeLaCarte, type Relais, type ReglagesAssistants,
} from './assistants-pur';
import { CLES_DES_COMPTEURS } from './maison-intelligente-pur';

/* ══ LES ASSISTANTS RELIÉS, CÔTÉ TRÔNE : 31 octobre 2026 ═══════════════════
   Maquette TtHPKpjCqovrn8nookJ7eu, section « L'écran Les assistants ».

   Ce module lit ce que la fonction `assistants-maison` écrit (l'état des
   assistants, leurs relais, les décisions laissées au porteur, le journal du
   jour) et porte les quatre gestes du souverain (donner ou retirer un jeton,
   trancher une décision, trancher une place tenue). Il ne pose jamais un
   rendez-vous : un assistant le fait par sa porte, sous prise.

   LECTURE PAR LE CLIENT SUPABASE, SOUS RLS : `assistants` et `assistants_relais`
   se lisent par un souverain ; `assistants_decisions` par le porteur seul
   (migration 0149). Les relais ne portent aucun nom de contact privé : la
   fonction refuse un mot qui en contiendrait un.

   2 NOVEMBRE 2026, LE SOCLE DE LA MAISON INTELLIGENTE (0151) : le mode « Je
   suis loin » (`loin_depuis`), les cartes de tous les genres avec leurs
   `faits`, et, pour le porteur seul, le contact et son message (`prive`),
   effacés dès la décision et au plus tard sept jours après. Les lectures
   prennent toute la ligne (`*`) : avant 0151, les colonnes nouvelles
   manquent sans faire tomber l'écran. Le livre des crédits lit les
   compteurs des fonctions dans `documents`. */

export const FONCTION_DES_ASSISTANTS = 'assistants-maison';

/* ── Les lignes de la base, en français ───────────────────────────────── */

type LigneAssistant = {
  id: string; nom: string; porteur_team_id: string | null; porteur_user_id: string | null; appareil: string | null;
  empreinte: string | null; jeton_pose_le: string | null; vu_le: string | null; eveille_depuis: string | null;
  etat: Assistant['etat'] | null;
  loin_depuis?: string | null;
};
type LigneRelais = {
  id: string; de: string; pour: string; genre: string; numero_cle: string | null; client_id: string | null; rdv_id: string | null;
  mot: string | null; quand: string; perime_le: string | null; lu_le: string | null; traite_le: string | null;
};
type LigneDecision = {
  id: string; assistant: string; genre: string; numero_cle: string | null; client_id: string | null; rdv_id: string | null;
  resume: string; proposition: string | null; choix: unknown; echeance: string | null; tranchee: string | null;
  tranchee_le: string | null; tranchee_par: string | null; texte_modifie: string | null; executee_le: string | null; cree_le: string;
  faits?: unknown; prive?: unknown; prive_efface_le?: string | null;
};

const enAssistant = (l: LigneAssistant): Assistant => ({
  id: l.id, nom: l.nom, porteurTeamId: l.porteur_team_id, porteurUserId: l.porteur_user_id, appareil: l.appareil,
  /* L'empreinte ne sort pas de ce module : seul le fait qu'un jeton existe. */
  aUnJeton: !!l.empreinte, vuLe: l.vu_le, eveilleDepuis: l.eveille_depuis, etat: l.etat ?? {},
  loinDepuis: l.loin_depuis ?? null,
});
const enRelais = (l: LigneRelais): Relais => ({
  id: l.id, de: l.de, pour: l.pour, genre: l.genre as GenreDeRelais, numeroCle: l.numero_cle, clientId: l.client_id, rdvId: l.rdv_id,
  mot: l.mot, quand: l.quand, perimeLe: l.perime_le, luLe: l.lu_le, traiteLe: l.traite_le,
});
const enDecision = (l: LigneDecision): Decision => ({
  id: l.id, assistant: l.assistant, genre: l.genre as GenreDeDecision, numeroCle: l.numero_cle, clientId: l.client_id, rdvId: l.rdv_id,
  resume: l.resume, proposition: l.proposition,
  choix: Array.isArray(l.choix) ? (l.choix.filter((c) => typeof c === 'string') as ChoixDeDecision[]) : [],
  echeance: l.echeance, tranchee: (l.tranchee ?? null) as ChoixDeDecision | null, trancheeLe: l.tranchee_le, trancheePar: l.tranchee_par,
  texteModifie: l.texte_modifie, executeeLe: l.executee_le, creeLe: l.cree_le,
  faits: l.faits && typeof l.faits === 'object' ? (l.faits as FaitsDeLaCarte) : null,
  prive: priveLu(l.prive),
  priveEffaceLe: l.prive_efface_le ?? null,
});

/** Le privé d'une carte tel que la base le rend : un contact et un message,
    ou rien. Ni l'un ni l'autre ne sort de ce module autrement que vers
    l'écran du porteur. */
function priveLu(v: unknown): PriveDeLaCarte | null {
  if (!v || typeof v !== 'object') return null;
  const contact = typeof (v as { contact?: unknown }).contact === 'string' ? (v as { contact: string }).contact : '';
  const message = typeof (v as { message?: unknown }).message === 'string' ? (v as { message: string }).message : '';
  return contact || message ? { contact, message } : null;
}

/* ── Le temps, à Cotonou ──────────────────────────────────────────────── */

/** Minuit de ce jour à Cotonou, en ISO UTC : la borne du « jour » de l'écran. */
export function minuitCotonouISO(maintenantMs: number): string {
  const { dateISO } = aCotonou(maintenantMs);
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) - DECALAGE_COTONOU_MIN * 60_000).toISOString();
}

/** « 18 h 52 », « 9 h » : l'heure d'un instant ISO, à Cotonou. Vide si l'instant ne se lit pas. */
export function heureCotonouDite(iso: string | null | undefined): string {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '';
  const c = aCotonou(ms);
  return c.minute ? `${c.heure} h ${String(c.minute).padStart(2, '0')}` : `${c.heure} h`;
}

/** L'heure, précédée du jour quand ce n'est pas aujourd'hui : « hier 18 h 52 », « le 29 oct. 9 h ». */
export function quandDit(iso: string | null | undefined, maintenantMs: number): string {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return '';
  const h = heureCotonouDite(iso);
  const jour = aCotonou(ms).dateISO;
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  if (jour === aujourdhui) return h;
  if (jour === aCotonou(maintenantMs - 86_400_000).dateISO) return `hier ${h}`;
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const d = new Date(`${jour}T12:00:00Z`);
  return `le ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${h}`;
}

/* ── Les mots de l'écran ──────────────────────────────────────────────── */

export const GENRE_DE_DECISION_DIT: Record<GenreDeDecision, string> = {
  reponse: 'réponse', 'place-tenue': 'place tenue', note: 'note du carnet', argent: 'argent', cercle: 'contact nouveau',
  rdv: 'rendez-vous', depense: 'dépense', publication: 'publication', planning: 'planning', acces: 'accès',
};

/** Le prénom d'un membre de l'équipe : le premier mot de son nom. */
export const prenomDe = (nom: string | null | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/** La ligne des réglages, telle que la maquette la dit, avec la veille du
    2 novembre 2026 : « Veille de 6 h à minuit · un tour toutes les 10 min,
    toutes les 30 min dès 18 h · silence de 45 min = le porteur est prévenu
    · une place tenue dure 2 h ouvrées ». Un silence plus court que le plus
    long rythme et sa marge dit ce que le chien de garde attend vraiment. */
export function reglagesDits(r: Required<ReglagesAssistants>): string {
  const jour = Math.min(r.soirDe, r.veilleA) > r.veilleDe;
  const soir = r.veilleA > Math.max(r.soirDe, r.veilleDe);
  const veille = !jour && !soir
    ? 'Aucune heure de veille : la fin vient avant le début'
    : `Veille de ${heureRondeDite(r.veilleDe)} à ${heureRondeDite(r.veilleA)} · ${jour && soir
      ? `un tour toutes les ${r.rythmeMin} min, toutes les ${r.rythmeSoirMin} min dès ${heureRondeDite(r.soirDe)}`
      : `un tour toutes les ${jour ? r.rythmeMin : r.rythmeSoirMin} min`}`;
  const plancher = Math.max(jour ? r.rythmeMin : 0, soir ? r.rythmeSoirMin : 0) + MARGE_DE_SOMMEIL_MIN;
  const silence = r.silenceMin >= plancher
    ? `silence de ${r.silenceMin} min = le porteur est prévenu`
    : `silence de ${r.silenceMin} min = le porteur est prévenu (${plancher} min aux heures du rythme le plus lent)`;
  return `${veille} · ${silence} · une place tenue dure ${r.tenueHeures} h ouvrée${r.tenueHeures > 1 ? 's' : ''}`;
}

/** L'état d'un relais, en un mot : traité, lu, périmé, ou en attente. */
export function etatDuRelaisDit(r: Pick<Relais, 'traiteLe' | 'luLe' | 'perimeLe'>, maintenantMs: number): string {
  if (r.traiteLe) return `traité ${quandDit(r.traiteLe, maintenantMs)}`;
  const p = Date.parse(r.perimeLe ?? '');
  if (Number.isFinite(p) && p <= maintenantMs) return 'périmé';
  if (r.luLe) return `lu ${quandDit(r.luLe, maintenantMs)}`;
  return 'en attente';
}

/* ── La lecture ───────────────────────────────────────────────────────── */

export type LectureDesAssistants = {
  assistants: Assistant[];
  relais: Relais[];
  decisions: Decision[];
  journal: Geste[];
  /** Les compteurs des fonctions qui appellent Claude (le livre des crédits), par clé. */
  compteurs: Record<string, unknown>;
  luLe: string;
  /** La table n'est pas encore en ligne (migration 0148 à passer) : l'écran le dit. */
  tablesAbsentes: boolean;
};

const tableAbsente = (e: { message?: string; code?: string } | null): boolean =>
  !!e && (e.code === '42P01' || /does not exist|schema cache|not find the table/i.test(e.message ?? ''));

export async function litLesAssistants(): Promise<{ assistants: Assistant[]; absente: boolean }> {
  if (!supabase) return { assistants: [], absente: false };
  const { data, error } = await supabase
    .from('assistants')
    .select('*')
    .order('id');
  if (error) return { assistants: [], absente: tableAbsente(error) };
  return { assistants: ((data ?? []) as LigneAssistant[]).map(enAssistant), absente: false };
}

export async function litLesRelais(limite = 30): Promise<Relais[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assistants_relais')
    .select('id, de, pour, genre, numero_cle, client_id, rdv_id, mot, quand, perime_le, lu_le, traite_le')
    .order('quand', { ascending: false })
    .limit(limite);
  if (error) return [];
  return ((data ?? []) as LigneRelais[]).map(enRelais);
}

/** Les décisions encore ouvertes : la politique de la table ne rend que celles du porteur connecté. */
export async function litLesDecisionsEnAttente(): Promise<Decision[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('assistants_decisions')
    .select('*')
    .is('tranchee', null)
    .order('cree_le', { ascending: false })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as LigneDecision[]).map(enDecision);
}

/** Les gestes du jour entrés par la porte des assistants (même table que le Journal, `systeme/Journal.tsx`). */
export async function litLeJournalDesAssistants(depuisIso: string): Promise<Geste[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('journal_gestes')
    .select('data')
    .eq('data->>porte', PORTE_ASSISTANT)
    .gte('data->>quand', depuisIso)
    .order('data->>quand', { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []).map((r) => (r as { data: Geste }).data);
}

/** Les compteurs du livre des crédits (`documents`, écrits par les fonctions seules). */
export async function litLesCompteursDuLivre(): Promise<Record<string, unknown>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('documents').select('key, data').in('key', [...CLES_DES_COMPTEURS]);
  if (error) return {};
  const lus: Record<string, unknown> = {};
  for (const r of (data ?? []) as { key: string; data: unknown }[]) lus[r.key] = r.data;
  return lus;
}

export async function litLesAssistantsRelies(maintenantMs = Date.now()): Promise<LectureDesAssistants> {
  const [a, relais, decisions, journal, compteurs] = await Promise.all([
    litLesAssistants(), litLesRelais(30), litLesDecisionsEnAttente(), litLeJournalDesAssistants(minuitCotonouISO(maintenantMs)),
    litLesCompteursDuLivre(),
  ]);
  return { assistants: a.assistants, relais, decisions, journal, compteurs, luLe: new Date(maintenantMs).toISOString(), tablesAbsentes: a.absente };
}

/* ── La porte du souverain ────────────────────────────────────────────── */

export type ActionDuSouverain = typeof ACTIONS_DU_SOUVERAIN[number];

export type IssueDesAssistants =
  | { ok: true; reponse: Record<string, unknown> }
  | { ok: false; motif: string; erreur: string };

const DIT_DU_MOTIF: Record<string, string> = {
  /* Les motifs que rend la fonction assistants-maison (scripts/serveur/assistants-maison.ts), dits en français. */
  'hors-ligne': 'Hors ligne : ce geste demande le réseau.',
  'pas-de-maison': 'Pas de connexion à la Maison.',
  'pas-en-ligne': 'La fonction assistants-maison n’est pas encore en ligne.',
  'reserve-aux-assistants': 'Réservé aux assistants et à la direction connectée.',
  'mauvaise-porte': 'Ce geste n’est pas ouvert par cette porte.',
  'action-inconnue': 'La fonction ne connaît pas ce geste.',
  'assistant-inconnu': 'Cet assistant n’existe pas dans la table.',
  'decision-inconnue': 'Cette décision n’existe plus.',
  'pas-ta-decision': 'Cette décision n’est pas la vôtre.',
  'pas-ton-assistant': 'Le jeton de cet assistant se donne depuis le compte de son porteur.',
  'deja-tranchee': 'Cette décision est déjà tranchée.',
  'choix-inconnu': 'Ce choix n’est pas proposé pour cette décision.',
  'decision-ou-rdv': 'Il faut dire la décision ou le rendez-vous.',
  'pas-une-place-tenue': 'Ce rendez-vous n’est pas une place tenue.',
  'rdv-inconnu': 'Le rendez-vous n’existe plus.',
  'modifie-entre-temps': 'Le rendez-vous a été modifié entre temps : relisez et recommencez.',
  'verrou': 'Le rendez-vous a été modifié entre temps : relisez et recommencez.',
  'updated-at': 'Il manque l’heure de dernière modification du rendez-vous.',
  'date-invalide': 'La date est à écrire AAAA-MM-JJ.',
  'heure-invalide': 'L’heure est à écrire HH:MM.',
  'pour-invalide': 'L’assistant visé n’existe pas.',
  'pour-maitre': 'Il faut dire pour quel maître.',
  'fiche-inconnue': 'Aucune fiche ne porte ce numéro : la fiche s’ouvre au Trône d’abord.',
  'plusieurs-fiches': 'Plusieurs fiches portent ce numéro : il faut dire pour qui.',
  'pris': 'L’autre assistant tient déjà cette cliente ce jour-là.',
  'deja-un-rdv': 'Elle a déjà un rendez-vous à venir.',
  'pose-refusee': 'La base a refusé la pose.',
  'prestations': 'Il faut au moins une prestation.',
  'numero-invalide': 'Ce numéro n’est pas un numéro.',
  'id-invalide': 'Cet identifiant n’est pas valable.',
  'idempotence': 'Il manque la clé du geste.',
  'genre-inconnu': 'Ce genre n’existe pas.',
  'mot-refuse': 'Le mot du relais porte autre chose que des faits de la Maison.',
  'resume-refuse': 'Le résumé porte une citation ou un numéro.',
  'proposition-refusee': 'La réponse proposée porte une tournure d’assistant.',
  'note-refusee': 'La note dépasse ou porte une citation.',
  'relais-inconnu': 'Ce relais n’existe plus.',
  'porteur-sans-compte': 'Le porteur n’a pas encore de compte relié : rien n’est parti sur son téléphone.',
  'push-notify': 'La notification n’a pas pu partir.',
  'branche-inconnue': 'La branche de la Maison est introuvable.',
  'demande-illisible': 'La demande n’a pas pu être lue.',
  /* 2 novembre 2026, le socle : les cartes, le mode loin, la dépense validée d'un toucher. */
  'faits-refuses': 'Les faits de la carte ne se lisent pas.',
  'prive-refuse': 'Le message du contact dépasse ou ne se lit pas.',
  'prive-hors-loin': 'Le message d’un contact ne vient au Trône qu’en mode « Je suis loin ».',
  'pas-d-assistant': 'Aucun assistant ne vous est relié sur un ordinateur.',
  prestataire: 'L’objet nomme un prestataire : sa mission naît du rituel honoré, son paiement fait la dépense.',
  'categorie-inconnue': 'Cette catégorie de dépense n’existe pas au Trône.',
  'caisse-inconnue': 'Cette caisse n’existe pas au Trône.',
  'porteur-inconnu': 'Ce porteur de l’argent n’est pas dans la liste de la Maison.',
  doublon: 'Une dépense du même jour, du même montant et d’un objet voisin est déjà au Trône.',
  montant: 'Le montant ne se lit pas.',
  'montant-hors-borne': 'Le montant sort des bornes : à saisir à l’écran Dépenses.',
  'date-ancienne': 'La date est trop ancienne : à saisir à l’écran Dépenses.',
  'date-future': 'La date est dans l’avenir.',
  objet: 'Il manque l’objet de la dépense.',
  categorie: 'Il manque la catégorie.',
  ecriture: 'La dépense n’a pas pu s’écrire au Trône.',
  id: 'Il manque l’identifiant.',
  environnement: 'La fonction manque d’un réglage côté serveur.',
  erreur: 'La fonction a rencontré une erreur.',
  serveur: 'La fonction n’a pas répondu. Réessayez dans un instant.',
};

/** Ce que la fonction ajoute à un refus et qui se dit : la dépense déjà au
    Trône d'un doublon, ou le détail d'un motif (« plus de 160 caractères »). */
export function precisionDuRefus(plus: Record<string, unknown> | undefined): string {
  if (!plus) return '';
  const deja = plus.deja as { label?: unknown; amountXof?: unknown; saisiePar?: unknown } | undefined;
  if (deja && typeof deja === 'object') {
    const montant = typeof deja.amountXof === 'number' ? `${String(Math.round(deja.amountXof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F` : '';
    const morceaux = [typeof deja.label === 'string' ? deja.label : '', montant, typeof deja.saisiePar === 'string' && deja.saisiePar ? `saisie par ${deja.saisiePar}` : ''].filter(Boolean);
    if (morceaux.length) return ` Déjà là : ${morceaux.join(', ')}.`;
  }
  if (typeof plus.detail === 'string' && plus.detail) return ` (${plus.detail})`;
  return '';
}

const refus = (motif: string, plus?: Record<string, unknown>): IssueDesAssistants =>
  ({ ok: false, motif, erreur: `${DIT_DU_MOTIF[motif] ?? `La fonction a refusé : ${motif}.`}${precisionDuRefus(plus)}` });

/** Le motif que porte une réponse non 2xx de la fonction (et ce qu'elle y
    ajoute), ou un motif générique. Un 404 de la fonction elle-même porte un
    motif (« decision-inconnue ») ; un 404 de la plateforme n'en porte pas. */
async function motifDeLErreur(e: unknown): Promise<{ motif: string; plus?: Record<string, unknown> }> {
  const rep = (e as { context?: Response })?.context;
  const statut = typeof rep?.status === 'number' ? rep.status : undefined;
  const brut = String((e as { message?: string })?.message ?? e);
  if (rep && typeof rep.json === 'function') {
    try {
      const corps = await rep.json() as { motif?: string };
      if (corps && typeof corps.motif === 'string') return { motif: corps.motif, plus: corps as Record<string, unknown> };
    } catch { /* un corps vide : le statut dira */ }
  }
  if (statut === 404 || /404|not found/i.test(brut)) return { motif: 'pas-en-ligne' };
  if (statut === 403) return { motif: 'reserve-aux-assistants' };
  return { motif: 'serveur' };
}

/** La porte B : le JWT de la session part avec l'appel (`supabase.functions.invoke`). */
export async function appelleLaPorteDuSouverain(action: ActionDuSouverain, params: Record<string, unknown> = {}): Promise<IssueDesAssistants> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return refus('hors-ligne');
  if (!supabase) return refus('pas-de-maison');
  try {
    const { data, error } = await supabase.functions.invoke(FONCTION_DES_ASSISTANTS, { body: { action, ...params } });
    if (error) { const m = await motifDeLErreur(error); return refus(m.motif, m.plus); }
    const r = (data ?? null) as { ok?: boolean; motif?: string } | null;
    if (!r || r.ok !== true) return refus(r && typeof r.motif === 'string' ? r.motif : 'serveur', (r ?? undefined) as Record<string, unknown> | undefined);
    return { ok: true, reponse: r as Record<string, unknown> };
  } catch {
    return refus('serveur');
  }
}

/** Donner un jeton d'appareil à un assistant : la fonction le rend UNE fois ; la base n'en garde que l'empreinte. */
export async function donneUnJeton(id: string, extras: { nom?: string; porteurTeamId?: string; appareil?: string } = {})
  : Promise<{ ok: true; jeton: string } | { ok: false; erreur: string }> {
  const r = await appelleLaPorteDuSouverain('jeton.donner', { id, ...extras });
  if (!r.ok) return { ok: false, erreur: r.erreur };
  const jeton = r.reponse.jeton;
  if (typeof jeton !== 'string' || !jeton) return { ok: false, erreur: 'La fonction n’a pas rendu de jeton.' };
  return { ok: true, jeton };
}

export async function retireLeJeton(id: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await appelleLaPorteDuSouverain('jeton.retirer', { id });
  return r.ok ? { ok: true } : { ok: false, erreur: r.erreur };
}

/** Trancher une carte. `faits` : la dépense corrigée sur la carte (« Corriger »). */
export async function trancheLaDecision(id: string, choix: ChoixDeDecision, texte?: string, faits?: Record<string, unknown>)
  : Promise<{ ok: true; reponse: Record<string, unknown> } | { ok: false; erreur: string }> {
  const r = await appelleLaPorteDuSouverain('decision.trancher', { id, choix, ...(texte !== undefined ? { texte } : {}), ...(faits ? { faits } : {}) });
  return r.ok ? { ok: true, reponse: r.reponse } : { ok: false, erreur: r.erreur };
}

/** « Je suis loin » / « Je suis là » : le bouton du porteur. La fonction le
    pose sur ses assistants d'ordinateur (Opale pour Yéman, Onyx pour Brice) ;
    chacun le lit à son passage suivant. */
export async function basculeLeMode(loin: boolean): Promise<{ ok: true; reponse: Record<string, unknown> } | { ok: false; erreur: string }> {
  const r = await appelleLaPorteDuSouverain('loin.basculer', { loin });
  return r.ok ? { ok: true, reponse: r.reponse } : { ok: false, erreur: r.erreur };
}

export type ChoixDePlace = 'confirmer' | 'autre-heure' | 'non';

export async function trancheLaPlace(p: { decisionId?: string; rdvId?: string; choix: ChoixDePlace; date?: string; time?: string; mot?: string })
  : Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await appelleLaPorteDuSouverain('place.trancher', p);
  return r.ok ? { ok: true } : { ok: false, erreur: r.erreur };
}

/** GET sans rien envoyer : la version en ligne et le nombre d'assistants connus. */
export async function santeDesAssistants(): Promise<{ version: string; assistants: number } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke(FONCTION_DES_ASSISTANTS, { method: 'GET' });
    if (error) return null;
    const d = (data ?? {}) as { version?: string; assistants?: number };
    return { version: d.version ?? '', assistants: typeof d.assistants === 'number' ? d.assistants : 0 };
  } catch {
    return null;
  }
}
