import { pourClaude, prenomEtInitiale, sansCoordonnees, type Personne } from './ia-anonymise-pur';
import type { ChantierIa, UsageIa } from './ia-maison-pur';

/* ══ LA FICHE DU JOUR, SES RÈGLES — 19 octobre 2026 ═══════════════════════
   Chantier 7 des huit (maquette NKQMiMMY…, « Tout me va »), le texte validé
   par Yéman : « Awa K. · 10 h · Entretien · Maître : Brice. "Avant de la
   recevoir" : 4e entretien ; racines serrées la dernière fois, soin hydratant
   conseillé. / Elle a parlé de vacances en décembre 2026 : proposer une date
   avant le départ. / Reste 5 000 F sur son rituel du 2 octobre 2026. Tiré de
   son historique, de ses bilans et de ses messages. Trois lignes, jamais
   plus : où en sont ses locks, ce qu'il faut lui dire, ce qu'elle doit
   encore. Pour le maître et pour l'accueil. »

   SA DÉCISION : « En ouvrant le rendez-vous : écrite à ce moment-là, gardée
   pour la journée. Rien ne tourne la nuit. » Aucune liste du matin, aucune
   tâche de nuit. Accès : la direction, la Clientèle, l'Atelier (la matrice
   `DEPARTEMENTS_PAR_CHANTIER` de ia-maison-pur).

   CE FICHIER NE TOUCHE À RIEN : ni magasin, ni réseau, ni écran. Il
   rassemble et ANONYMISE la matière (prénom et initiale, jamais un numéro,
   jamais une adresse, jamais les papiers de la famille ; toute date avec
   son année), écrit la consigne, dit la forme attendue, RELIT ce qui revient
   (on ne fait jamais confiance à la sortie de Claude), et juge si une fiche
   gardée vaut encore. Le banc `verifie-la-fiche-du-jour` l'éprouve ;
   l'écran (FicheDuJour.tsx) et le magasin (ia-fiche-du-jour.ts) le suivent. */

/* ── LES CONSTANTES ──────────────────────────────────────────────────── */
export const CHANTIER_FICHE_DU_JOUR: ChantierIa = 'fiche-du-jour';
/** Un texte court : le modèle rapide (« fin-photos », sélecteur du 19 octobre). */
export const USAGE_FICHE_DU_JOUR: UsageIa = 'texte';
/** Le document synchronisé qui garde les fiches, par identifiant de rendez-vous. */
export const CLE_DES_FICHES_DU_JOUR = 'mnd_ia_fiches_du_jour';
/** « Trois lignes, jamais plus. » */
export const LIGNES_MAX = 3;
export const MOTS_MAX_PAR_LIGNE = 20;
/** La borne de la relecture : une ligne de vingt mots tient largement ici. */
export const SIGNES_MAX_PAR_LIGNE = 180;
/** Ce qu'on donne à lire : les 6 derniers rituels, les 3 derniers bilans,
    les 6 derniers messages (Entre deux séances et WhatsApp reçus), 3 restes dus. */
export const RITUELS_RETENUS = 6;
export const BILANS_RETENUS = 3;
export const MESSAGES_RETENUS = 6;
export const RESTES_RETENUS = 3;
/** Une fiche de plus de sept jours s'efface à l'ouverture suivante. */
export const GARDE_DES_FICHES_JOURS = 7;
/** Trois lignes de vingt mots : quatre cents jetons suffisent. */
export const JETONS_DE_LA_FICHE = 400;
/** La ligne que la Maison écrit elle-même, sans appel, quand il n'y a rien à lire. */
export const LIGNE_PREMIERE_VENUE = 'Première venue : rien à préparer, l’accueillir.';

/* ── LES DATES, TOUJOURS AVEC L'ANNÉE ────────────────────────────────── */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2 octobre 2026 », « 1er janvier 2027 » : la règle de la Maison sur toute
    date de cliente. Une date illisible rend une chaîne vide, jamais une
    invention. */
export function dateDite(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '').trim());
  if (!m) return '';
  const jour = Number(m[3]);
  const mois = MOIS[Number(m[2]) - 1];
  if (!mois || jour < 1 || jour > 31) return '';
  return `${jour === 1 ? '1er' : jour} ${mois} ${m[1]}`;
}

/** « 10 h », « 14 h 30 ». */
export function heureDite(hhmm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return '';
  return m[2] === '00' ? `${h} h` : `${h} h ${m[2]}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Le jour local de l'appareil, « AAAA-MM-JJ » : le rendez-vous est écrit
    dans le jour de Cotonou, pas en UTC. */
export const jourLocal = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** Le jour d'un instant ISO (ou d'un jour déjà court). */
export const jourDe = (iso: string | null | undefined): string => String(iso ?? '').slice(0, 10);
export function jourPlus(isoJour: string, n: number): string {
  const d = new Date(`${jourDe(isoJour)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ── CE QU'ON DONNE À LIRE : LA MATIÈRE ──────────────────────────────── */

/** La fiche, réduite à ce qui sert : son nom (pour en tirer prénom et
    initiale, et reconnaître son nom dans les textes) et son arrivée. On
    accepte une fiche entière ; on n'en LIT que ces deux champs. */
export type TeteDeLaFiche = { name: string; since?: string };
export type RituelPourLaFiche = {
  date: string;
  time?: string;
  status?: string;
  prestations: readonly string[];
  /** Le prénom du maître, déjà résolu par l'écran. */
  maitre?: string;
  /** La note du carnet, déjà débarrassée des fragments de machine. */
  note?: string;
};
export type BilanPourLaFiche = {
  date: string;
  prestation?: string;
  diagnostic?: string;
  sens?: string;
  solutions?: string;
  points?: readonly string[];
  resume?: string;
  prochaineVisite?: string;
};
export type MessagePourLaFiche = {
  canal: 'entre-deux' | 'whatsapp';
  /** L'instant ISO (ou le jour). */
  quand: string;
  texte?: string;
  /** Les soucis touchés dans « Entre deux séances », déjà dits en mots. */
  soucis?: readonly string[];
  /** « Tout va bien » : une réponse, pas un souci. */
  bien?: boolean;
};
export type ResteDuPourLaFiche = { xof: number; rituelDu: string };
export type ProchainPourLaFiche = { date: string; time?: string; prestations: readonly string[]; maitre?: string };

/** CE QUI PART CHEZ CLAUDE. Construit champ par champ, jamais par copie
    d'une fiche : un champ ajouté demain (un numéro de plus, les papiers
    d'une bourse) ne partira jamais par mégarde. */
export type MatiereDeLaFiche = {
  tete: { prenom: string; depuis?: string; venues: number };
  prochain: { le: string; heure?: string; prestations: string[]; maitre?: string };
  rituels: { le: string; prestations: string[]; maitre?: string; note?: string }[];
  bilans: { le: string; prestation?: string; vu?: string; sens?: string; propose?: string; points: string[]; prochaineVisite?: string }[];
  messages: { le: string; canal: 'Entre deux séances' | 'WhatsApp'; texte: string }[];
  reste: { xof: number; rituelDu: string }[];
};

/** Les formes de son nom qu'il faut reconnaître dans un texte libre : le
    nom entier derrière le prénom, puis chaque nom seul. Toutes deviennent
    prénom et initiale par `nomsEnInitiales` (« Awa K. », « K. », « D. »). */
export function personnesDe(name: string): Personne[] {
  const mots = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return [];
  const prenom = mots[0];
  const noms = mots.slice(1);
  const formes: Personne[] = [{ prenom, nom: noms.join(' ') }];
  for (const n of noms) if (n.length > 1) formes.push({ nom: n });
  return formes;
}

/** « Awa K. » : le prénom et l'initiale de ce qui suit, la règle de
    `prenomEtInitiale` (la même que dans les textes, pour qu'elle porte un
    seul nom chez Claude). Sans nom, le prénom seul ; sans rien, « la cliente ». */
export function prenomDeLaFiche(name: string): string {
  const mots = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return 'la cliente';
  return prenomEtInitiale({ prenom: mots[0], nom: mots.slice(1).join(' ') }) || 'la cliente';
}

const trie = <T extends { date: string; time?: string }>(l: readonly T[]): T[] =>
  [...l].sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));

const borne = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t);

/** RASSEMBLER ET ANONYMISER. Les six derniers rituels honorés avant le
    rendez-vous, les trois derniers bilans, les six derniers messages (Entre
    deux séances et WhatsApp reçus, confondus, les plus récents d'abord), le
    reste dû avec la date de son rituel. Chaque texte libre passe par
    `pourClaude` : son nom devient prénom et initiale, un numéro ou une
    adresse glissés dans une note disparaissent. Toute date porte l'année. */
export function matiere(
  client: TeteDeLaFiche,
  rendezVousPasses: readonly RituelPourLaFiche[],
  bilans: readonly BilanPourLaFiche[],
  messagesEntreDeuxSeances: readonly MessagePourLaFiche[],
  reste: readonly ResteDuPourLaFiche[],
  prochain: ProchainPourLaFiche,
): MatiereDeLaFiche {
  const personnes = personnesDe(client.name);
  const propre = (t: string | null | undefined, max: number): string =>
    borne(pourClaude(String(t ?? ''), personnes).replace(/\s+/g, ' ').trim(), max);
  const liste = (l: readonly string[] | undefined, n: number, max: number): string[] =>
    (l ?? []).map((x) => propre(x, max)).filter(Boolean).slice(0, n);
  const avec = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

  const annee = /^\d{4}/.exec(String(client.since ?? ''))?.[0];
  /* Les rituels : honorés, avant le jour du rendez-vous. Un rendez-vous
     annulé, en attente ou à venir n'est pas un rituel qu'elle a vécu. */
  const passes = trie(rendezVousPasses.filter((r) => (r.status === undefined || r.status === 'honoré') && dateDite(r.date) !== '' && r.date < prochain.date));
  const rituels = passes.slice(0, RITUELS_RETENUS).map((r) => avec({
    le: dateDite(r.date),
    prestations: liste(r.prestations, 6, 80),
    maitre: propre(r.maitre, 40) || undefined,
    note: propre(r.note, 300) || undefined,
  }));
  const bilansLus = trie(bilans.filter((b) => dateDite(b.date) !== '')).slice(0, BILANS_RETENUS).map((b) => avec({
    le: dateDite(b.date),
    prestation: propre(b.prestation, 80) || undefined,
    vu: propre(b.diagnostic, 400) || undefined,
    sens: propre(b.sens, 300) || undefined,
    propose: propre(b.solutions, 300) || undefined,
    points: liste(b.points, 3, 200),
    prochaineVisite: propre(b.prochaineVisite, 120) || undefined,
  }));
  const messages = [...messagesEntreDeuxSeances]
    .filter((m) => dateDite(jourDe(m.quand)) !== '')
    .sort((a, b) => String(b.quand).localeCompare(String(a.quand)))
    .map((m) => {
      const soucis = (m.soucis ?? []).map((s) => propre(s, 60)).filter(Boolean);
      const corps = propre(m.texte, 300);
      const texte = m.canal === 'entre-deux'
        ? [m.bien ? 'Tout va bien.' : '', soucis.length ? `Soucis : ${soucis.join(', ')}.` : '', corps].filter(Boolean).join(' ')
        : corps;
      return { le: dateDite(jourDe(m.quand)), canal: m.canal === 'entre-deux' ? 'Entre deux séances' as const : 'WhatsApp' as const, texte };
    })
    .filter((m) => m.texte)
    .slice(0, MESSAGES_RETENUS);
  const restes = [...reste]
    .filter((r) => Number.isFinite(r.xof) && r.xof > 0 && dateDite(r.rituelDu) !== '')
    .sort((a, b) => b.rituelDu.localeCompare(a.rituelDu))
    .slice(0, RESTES_RETENUS)
    .map((r) => ({ xof: Math.round(r.xof), rituelDu: dateDite(r.rituelDu) }));

  return {
    tete: avec({ prenom: prenomDeLaFiche(client.name), depuis: annee, venues: passes.length }),
    prochain: avec({
      le: dateDite(prochain.date),
      heure: heureDite(prochain.time) || undefined,
      prestations: liste(prochain.prestations, 6, 80),
      maitre: propre(prochain.maitre, 40) || undefined,
    }),
    rituels,
    bilans: bilansLus,
    messages,
    reste: restes,
  };
}

/** Rien à lire : ni rituel, ni bilan, ni message, ni reste. La Maison écrit
    alors « première venue » elle-même, sans dépenser un appel. */
export const matiereVide = (m: MatiereDeLaFiche): boolean =>
  m.rituels.length === 0 && m.bilans.length === 0 && m.messages.length === 0 && m.reste.length === 0;

/* ── LA CONSIGNE ─────────────────────────────────────────────────────── */
export function consigneDeLaFiche(): string {
  return [
    'Vous préparez, pour le maître et pour l’accueil de la Maison MND (locks et soins du cheveu, à Cotonou), la fiche « Avant de la recevoir » d’une cliente qui a rendez-vous. Vous lisez la matière donnée en JSON : sa tête, le rendez-vous qui vient, ses derniers rituels, ses derniers bilans de séance, ses derniers messages, ce qu’elle doit encore.',
    `Vous rendez de une à trois lignes, JAMAIS plus de trois, chacune de ${MOTS_MAX_PAR_LIGNE} mots au plus, dans cet ordre : 1) où en sont ses locks ; 2) ce qu’il faut lui dire ; 3) ce qu’elle doit encore.`,
    `N’inventez rien : chaque ligne vient de la matière, et de rien d’autre. Si la matière manque pour une ligne, rendez une ligne de moins. Si elle vient pour la première fois (aucun rituel, aucun bilan), une seule ligne : « ${LIGNE_PREMIERE_VENUE} »`,
    'JAMAIS de prix ni de montant, sauf le reste dû tel qu’il est donné dans la matière : le montant exact en F et la date du rituel, avec l’année. Si rien n’est dû, ne parlez pas d’argent.',
    'Aucun avis ni conseil médical, aucun diagnostic : un signe qui inquiète se dit « à regarder à la séance », rien de plus.',
    'Écrivez « la Maison », jamais le mot « salon ». Pas de tiret cadratin (—) : une virgule. Toute date porte son année. La cliente se nomme par le prénom et l’initiale donnés, rien d’autre. Vouvoiement, français simple, sans emoji.',
    'Répondez par l’outil, avec la forme { lignes: string[] }.',
  ].join('\n');
}

/** La forme attendue : la fonction la donne à Claude comme un outil. Ni
    longueur ni bornes dans le schéma (l'appel ne les accepte pas) : c'est la
    relecture qui borne. */
export const SCHEMA_DE_LA_FICHE: Record<string, unknown> = {
  type: 'object',
  properties: {
    lignes: {
      type: 'array',
      items: { type: 'string' },
      description: 'De une à trois lignes, dans l’ordre : où en sont ses locks, ce qu’il faut lui dire, ce qu’elle doit encore.',
    },
  },
  required: ['lignes'],
};

/* ── RELIRE CE QUI REVIENT ───────────────────────────────────────────── */

/** La voix de la Maison, tenue à la sortie aussi : un tiret long devient une virgule. */
export const sansTiretLong = (s: string): string =>
  String(s ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/,\s*,/g, ',').trim();

/** Les montants qu'une ligne écrit en francs (« 5 000 F », « 15000 FCFA », « 3 000 francs »). */
export function montantsDits(ligne: string): number[] {
  const r = /(\d(?:[\d\s.  ]*\d)?)\s?(?:F\b|FCFA\b|F CFA\b|XOF\b|francs?\b)/gi;
  const montants: number[] = [];
  for (let m = r.exec(ligne); m; m = r.exec(ligne)) {
    const n = Number(m[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(n)) montants.push(n);
  }
  return montants;
}

function lignesBrutes(brut: unknown): unknown[] {
  if (brut === null || brut === undefined) return [];
  if (typeof brut === 'string') return brut.split(/\r?\n/);
  if (Array.isArray(brut)) return brut;
  if (typeof brut === 'object') {
    const l = (brut as { lignes?: unknown }).lignes;
    if (Array.isArray(l)) return l;
    if (typeof l === 'string') return l.split(/\r?\n/);
  }
  return [];
}

/** ON NE FAIT PAS CONFIANCE À LA SORTIE. De une à trois lignes ; une ligne
    vide ou illisible tombe ; une ligne qui dit « salon », qui porte un
    numéro ou une adresse, ou qui écrit un prix autre que le reste dû donné
    est REFUSÉE (pas corrigée : on ne devine pas ce qu'elle voulait dire) ;
    le tiret long devient une virgule ; une puce ou un numéro en tête
    s'efface ; une ligne trop longue est coupée. */
export function lectureDeLaFiche(brut: unknown, resteAutorise: readonly number[] = []): string[] {
  const sorties: string[] = [];
  for (const l of lignesBrutes(brut)) {
    if (typeof l !== 'string') continue;
    const t = sansTiretLong(sansCoordonnees(l))
      .replace(/^\s*(?:[-•*·]|\d+\s*[.)])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) continue;
    if (/\[numéro\]|\[adresse\]/.test(t)) continue;
    if (/\bsalons?\b/i.test(t)) continue;
    if (montantsDits(t).some((m) => !resteAutorise.includes(m))) continue;
    sorties.push(borne(t, SIGNES_MAX_PAR_LIGNE));
    if (sorties.length >= LIGNES_MAX) break;
  }
  return sorties;
}

/* ── LA GARDE : ÉCRITE À L'OUVERTURE, GARDÉE POUR LA JOURNÉE ─────────── */

export type FicheGardee = {
  /** Le jour du RENDEZ-VOUS qu'elle prépare : déplacé, elle ne vaut plus. */
  jour: string;
  lignes: string[];
  /** L'instant où elle a été écrite : elle vaut ce jour-là, pas le lendemain. */
  le: string;
  modele: string;
};
/** Par identifiant de rendez-vous. */
export type FichesDuJour = Record<string, FicheGardee>;

/** Une fiche vaut si elle prépare CE jour de rendez-vous et qu'elle a été
    écrite AUJOURD'HUI. D'un autre jour, elle est périmée : la prochaine
    ouverture la refait (un message a pu arriver entre-temps). */
export function ficheValable(f: FicheGardee | undefined, jourDuRendezVous: string, aujourdhui: string): boolean {
  if (!f || typeof f !== 'object' || !Array.isArray(f.lignes)) return false;
  return f.jour === jourDe(jourDuRendezVous) && jourDe(f.le) === jourDe(aujourdhui);
}

/** Les fiches de plus de sept jours s'en vont, et les entrées abîmées avec.
    Rien à purger : le MÊME objet revient, pour que le magasin ne réécrive
    rien (une écriture part en synchro). */
export function fichesPurgees(fiches: FichesDuJour | null | undefined, aujourdhui: string): FichesDuJour {
  const source = fiches && typeof fiches === 'object' ? fiches : {};
  const limite = jourPlus(aujourdhui, -GARDE_DES_FICHES_JOURS);
  const gardees = Object.entries(source).filter(([, f]) => f && typeof f === 'object' && Array.isArray(f.lignes) && jourDe(f.le) >= limite);
  return gardees.length === Object.keys(source).length ? source : Object.fromEntries(gardees);
}

/** Il n'y a rien à préparer pour un rituel passé, honoré ou annulé : la
    fiche ne se montre que pour un rendez-vous du jour ou à venir, qui
    attend encore la cliente. */
export const aPreparer = (rdv: { date: string; status?: string }, aujourdhui: string): boolean =>
  jourDe(rdv.date) >= jourDe(aujourdhui) && (rdv.status === undefined || rdv.status === 'confirmé' || rdv.status === 'en attente');
