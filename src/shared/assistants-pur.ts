/* LES ASSISTANTS RELIÉS — 31 octobre 2026. Maquette TtHPKpjCqovrn8nookJ7eu
   (public/maquette-assistants-relies.html), huit choix tranchés au sélecteur.

   Chaque personne de la direction a SON assistant (Opale pour Yéman, Onyx pour
   Brice) : une session de Claude Code sur son ordinateur, qui lit le WhatsApp
   Web de son téléphone et répond dans sa voix. Les assistants ne se parlent
   jamais entre machines : ils se parlent par le Trône, où vivent leur état
   (table `assistants`), leurs relais (`assistants_relais`) et les décisions
   qu'ils laissent à leur porteur (`assistants_decisions`). Une seule porte
   vers la base : la fonction Edge `assistants-maison`, qui reconnaît chaque
   assistant à l'empreinte de son jeton d'appareil (modèle de la Dictée).

   Ce module est PUR (ni Supabase, ni DOM) : il est partagé par la fonction,
   l'écran « Les assistants » du Trône et le banc `verifie-les-assistants`.
   Rien ici ne porte un texte de message privé : des faits de la Maison. */

/* ── Qui ─────────────────────────────────────────────────────────────── */

/** Les deux assistants connus à la naissance du chantier. La table `assistants`
    fait foi ; cette liste ne sert qu'à nommer et à amorcer. */
export const ASSISTANTS_DE_LA_MAISON = [
  { id: 'opale', nom: 'Opale', porteurTeamId: 'st-5qduae5jef', porteurPrenom: 'Yéman' },
  { id: 'onyx', nom: 'Onyx', porteurTeamId: 'st-d4t24p6inh', porteurPrenom: 'Brice' },
] as const;

export type Controles = { chrome: boolean; lie: boolean; nonLus: boolean };

export type EtatAssistant = 'eveille' | 'endormi' | 'empeche' | 'sans-jeton';

export type Assistant = {
  id: string;
  nom: string;
  porteurTeamId?: string | null;
  porteurUserId?: string | null;
  appareil?: string | null;
  aUnJeton: boolean;
  /** Dernier passage noté par la fonction (ISO UTC). */
  vuLe?: string | null;
  /** Depuis quand la série de passages tient sans trou (ISO UTC). */
  eveilleDepuis?: string | null;
  etat: {
    controles?: Controles;
    empeche?: string | null;
    version?: string;
    /** Messages traités aujourd'hui (un compteur, jamais un nom). */
    traites?: number;
    /** Quand le porteur a été prévenu du sommeil en cours (ISO UTC). */
    dortPrevenuLe?: string | null;
  };
};

/* ── Les réglages (mnd_settings.assistants) ───────────────────────────── */

export type ReglagesAssistants = {
  /** Minutes entre deux passages. */
  rythmeMin?: number;
  /** Heures de Cotonou entre lesquelles un assistant veille. */
  veilleDe?: number;
  veilleA?: number;
  /** Minutes de silence après lesquelles le Trône prévient le porteur. */
  silenceMin?: number;
  /** Heures ouvrées pendant lesquelles une place tenue attend son toucher. */
  tenueHeures?: number;
};

export const REGLAGES_PAR_DEFAUT: Required<ReglagesAssistants> = {
  rythmeMin: 10, veilleDe: 8, veilleA: 20, silenceMin: 30, tenueHeures: 2,
};

export const reglagesComplets = (r?: ReglagesAssistants | null): Required<ReglagesAssistants> => {
  const n = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : d;
  return {
    rythmeMin: n(r?.rythmeMin, REGLAGES_PAR_DEFAUT.rythmeMin, 5, 60),
    veilleDe: n(r?.veilleDe, REGLAGES_PAR_DEFAUT.veilleDe, 0, 23),
    veilleA: n(r?.veilleA, REGLAGES_PAR_DEFAUT.veilleA, 1, 24),
    silenceMin: n(r?.silenceMin, REGLAGES_PAR_DEFAUT.silenceMin, 15, 240),
    tenueHeures: n(r?.tenueHeures, REGLAGES_PAR_DEFAUT.tenueHeures, 1, 12),
  };
};

/** Deux tours et une marge : au-delà, l'assistant dort. */
export const SEUIL_SOMMEIL_MIN = 25;

/* ── L'heure de Cotonou (UTC+1, sans heure d'été) ─────────────────────── */

export const DECALAGE_COTONOU_MIN = 60;

/** L'heure (0-23) et le jour de la semaine (0 = dimanche) à Cotonou. */
export function aCotonou(ms: number): { heure: number; minute: number; jour: number; dateISO: string } {
  const d = new Date(ms + DECALAGE_COTONOU_MIN * 60_000);
  return {
    heure: d.getUTCHours(), minute: d.getUTCMinutes(), jour: d.getUTCDay(),
    dateISO: d.toISOString().slice(0, 10),
  };
}

/** « demain 10 h », « samedi 10 h », « le 13 nov. 20 h » : l'heure d'un
    rendez-vous telle qu'une notification la dit, sans nom. */
export function heureDite(dateISO: string, time: string, maintenantMs: number): string {
  const h = String(time ?? '').replace(/^(\d{1,2}):(\d{2})$/, (_m, hh: string, mm: string) =>
    mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`);
  const aujourdhui = aCotonou(maintenantMs).dateISO;
  const demain = aCotonou(maintenantMs + 86_400_000).dateISO;
  if (dateISO === aujourdhui) return `aujourd'hui ${h}`;
  if (dateISO === demain) return `demain ${h}`;
  const d = new Date(`${dateISO}T12:00:00Z`);
  const ecartJours = Math.round((d.getTime() - new Date(`${aujourdhui}T12:00:00Z`).getTime()) / 86_400_000);
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  if (ecartJours > 0 && ecartJours < 7) return `${JOURS[d.getUTCDay()]} ${h}`;
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `le ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${h}`;
}

/* ── L'état d'un assistant ────────────────────────────────────────────── */

export function empecheDit(c: Controles | undefined | null): string | null {
  if (!c) return null;
  if (c.chrome === false) return 'Chrome ne répond pas';
  if (c.lie === false) return 'WhatsApp Web délié : le code QR est à l\'écran';
  if (c.nonLus === false) return 'la liste des non-lus ne se charge pas';
  return null;
}

export function etatDe(a: Pick<Assistant, 'aUnJeton' | 'vuLe' | 'etat'>, maintenantMs: number, seuilMin = SEUIL_SOMMEIL_MIN)
  : { etat: EtatAssistant; detail: string } {
  if (!a.aUnJeton) return { etat: 'sans-jeton', detail: 'aucun jeton : l\'assistant n\'a jamais été relié' };
  const vu = Date.parse(a.vuLe ?? '');
  if (!Number.isFinite(vu)) return { etat: 'endormi', detail: 'jamais passé' };
  const ecartMin = Math.floor((maintenantMs - vu) / 60_000);
  if (ecartMin > seuilMin) return { etat: 'endormi', detail: `endormi depuis ${dureeDite(ecartMin)}` };
  const empeche = a.etat?.empeche ?? empecheDit(a.etat?.controles);
  if (empeche) return { etat: 'empeche', detail: `empêché : ${empeche}` };
  return { etat: 'eveille', detail: `dernier passage il y a ${dureeDite(ecartMin)}` };
}

export const dureeDite = (min: number): string => {
  if (min < 1) return 'moins d\'une minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  if (h < 48) return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  return `${Math.floor(h / 24)} jours`;
};

/** Le chien de garde du Trône prévient le porteur : entre les heures de veille,
    après `silenceMin` de silence, une seule fois par sommeil. */
export function doitPrevenirDuSommeil(
  a: Pick<Assistant, 'aUnJeton' | 'vuLe' | 'etat'>,
  maintenantMs: number,
  r: Required<ReglagesAssistants>,
): boolean {
  if (!a.aUnJeton) return false;
  const vu = Date.parse(a.vuLe ?? '');
  if (!Number.isFinite(vu)) return false;
  if (maintenantMs - vu < r.silenceMin * 60_000) return false;
  const { heure } = aCotonou(maintenantMs);
  if (heure < r.veilleDe || heure >= r.veilleA) return false;
  const prevenu = Date.parse(a.etat?.dortPrevenuLe ?? '');
  return !(Number.isFinite(prevenu) && prevenu >= vu);
}

/* ── Les cercles d'un contact (gardés sur l'ordinateur du porteur) ────── */

export const CERCLES = ['cliente', 'proche', 'famille', 'fournisseur', 'inconnu'] as const;
export type Cercle = typeof CERCLES[number];

/** Ce qu'un assistant peut faire selon le cercle. Tranché le 31 octobre 2026 :
    aux proches et à la famille, une réponse proposée dans la voix du porteur,
    mais jamais de rendez-vous, de relais ni de trace au Trône. */
export const CERCLE_PEUT: Record<Cercle, { repondre: boolean; rdv: boolean; relais: boolean; journal: boolean }> = {
  cliente: { repondre: true, rdv: true, relais: true, journal: true },
  proche: { repondre: true, rdv: false, relais: false, journal: false },
  famille: { repondre: true, rdv: false, relais: false, journal: false },
  fournisseur: { repondre: true, rdv: false, relais: false, journal: false },
  inconnu: { repondre: true, rdv: false, relais: false, journal: false },
};

export const CERCLE_DIT: Record<Cercle, string> = {
  cliente: 'une cliente', proche: 'un proche', famille: 'la famille', fournisseur: 'un fournisseur', inconnu: 'un inconnu',
};

/* ── Le numéro, clé de la cliente ─────────────────────────────────────── */

/** Les chiffres d'un numéro international, sans +, 00 ni espaces : la clé par
    laquelle deux assistants reconnaissent la même personne, quel que soit le
    nom qu'elle porte dans leurs contacts. `null` si ce n'est pas un numéro. */
export function numeroCle(texte: string | null | undefined): string | null {
  const chiffres = String(texte ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length < 8 || chiffres.length > 15) return null;
  return chiffres;
}

/* ── Les relais ───────────────────────────────────────────────────────── */

export const GENRES_DE_RELAIS = [
  'rdv-pose-pour-toi', 'rdv-deplace', 'rdv-annule',
  'place-tenue', 'place-confirmee', 'place-refusee',
  'fil-ouvert', 'hermine-a-prevenir', 'envie-lue', 'argent-a-trancher', 'assistant-endormi',
] as const;
export type GenreDeRelais = typeof GENRES_DE_RELAIS[number];

export const RELAIS_DIT: Record<GenreDeRelais, string> = {
  'rdv-pose-pour-toi': 'Rendez-vous posé pour toi',
  'rdv-deplace': 'Rendez-vous déplacé',
  'rdv-annule': 'Rendez-vous annulé',
  'place-tenue': 'Place tenue, à confirmer',
  'place-confirmee': 'Place confirmée',
  'place-refusee': 'Place refusée',
  'fil-ouvert': 'La même personne écrit aux deux : je réponds',
  'hermine-a-prevenir': 'Tresses posées : Hermine à prévenir',
  'envie-lue': 'Une envie lue, posée en Note du carnet',
  'argent-a-trancher': 'Une question d\'argent à trancher',
  'assistant-endormi': 'L\'autre assistant dort',
};

/** Les relais qui demandent un geste à l'autre porteur : ils partent aussi en
    notification sur son téléphone. */
export const RELAIS_QUI_DEMANDE_UN_GESTE: readonly GenreDeRelais[] = ['place-tenue', 'hermine-a-prevenir', 'argent-a-trancher', 'fil-ouvert'];

export type Relais = {
  id: string;
  de: string;
  pour: string;
  genre: GenreDeRelais;
  numeroCle?: string | null;
  clientId?: string | null;
  rdvId?: string | null;
  /** Le seul champ libre : cent caractères au plus, passés au filtre `motEstPropre`. */
  mot?: string | null;
  quand: string;
  perimeLe?: string | null;
  luLe?: string | null;
  traiteLe?: string | null;
};

export const estGenreDeRelais = (g: unknown): g is GenreDeRelais => typeof g === 'string' && (GENRES_DE_RELAIS as readonly string[]).includes(g);

export const relaisPerime = (r: Pick<Relais, 'perimeLe'>, maintenantMs: number): boolean => {
  const p = Date.parse(r.perimeLe ?? '');
  return Number.isFinite(p) && p <= maintenantMs;
};

/* ── Le mot d'un relais : des faits, jamais une phrase privée ─────────── */

export const MOT_AU_PLUS = 100;

/** Les mots qu'un relais peut porter en plus du catalogue et des prénoms de
    la fiche visée : les jours, les heures, les liens de famille, les gestes
    de la Maison. Tout autre mot de trois lettres ou plus fait refuser le
    relais : c'est ce qui force à écrire un fait et non une confidence. */
export const MOTS_DU_RELAIS = new Set([
  // le temps
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  'janv', 'févr', 'avr', 'juil', 'sept', 'oct', 'nov', 'déc',
  'aujourd', 'hui', 'demain', 'hier', 'matin', 'midi', 'soir', 'semaine', 'prochaine', 'prochain', 'avant', 'après', 'vers', 'entre', 'heure', 'heures', 'min',
  // les personnes, par leur lien
  'sœur', 'soeur', 'frère', 'frere', 'mère', 'mere', 'père', 'pere', 'maman', 'papa', 'parent', 'enfant', 'fille', 'fils', 'mari', 'femme', 'amie', 'ami', 'cliente', 'client', 'madame', 'monsieur', 'mme',
  // les gestes de la Maison
  'rdv', 'rendez', 'vous', 'place', 'tenue', 'tenir', 'confirme', 'confirmer', 'confirmée', 'refusée', 'annule', 'annuler', 'annulé', 'déplacer', 'déplacé', 'décaler', 'décalé', 'poser', 'posé', 'posée', 'pose',
  'création', 'creation', 'consultation', 'devis', 'retwist', 'racines', 'soin', 'coiffure', 'tresses', 'nattes', 'couleur', 'longueur', 'locks', 'calibre', 'repousse', 'reprise',
  'prix', 'acompte', 'tarif', 'carnet', 'formule', 'séance', 'séances', 'reste', 'doit', 'payé', 'payer', 'espèces', 'momo', 'carte',
  'retard', 'absente', 'absent', 'venue', 'venir', 'viendra', 'passe', 'passera', 'avec', 'pour', 'chez', 'sans', 'ensemble', 'aussi', 'seule', 'seul',
  'envie', 'photo', 'photos', 'vidéo', 'vidéos', 'lien', 'modèle', 'note', 'fiche', 'dossier', 'documents',
  'hermine', 'prévenir', 'prévenue', 'prévenu', 'écrit', 'répond', 'réponds', 'réponse', 'demande', 'demandé', 'question', 'dit', 'veut', 'voudrait', 'préfère', 'plutôt', 'autre', 'même', 'déjà', 'encore', 'puis', 'donc', 'mais', 'oui', 'non', 'ok',
  'yéman', 'yeman', 'brice', 'opale', 'onyx', 'maison', 'mnd', 'trône', 'trone', 'fauteuil',
  // les petits mots
  'une', 'des', 'les', 'est', 'sont', 'son', 'ses', 'leur', 'elle', 'lui', 'moi', 'toi', 'nous', 'qui', 'que', 'quoi', 'dans', 'sur', 'par', 'pas', 'plus', 'tout', 'tous', 'toute', 'cette', 'ces', 'cet', 'aux', 'ici', 'là',
]);

const retireLesAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const motsDe = (texte: string | null | undefined): string[] =>
  String(texte ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Le vocabulaire permis d'un relais : les mots du relais, ceux du catalogue
    (prestations, catégories, noms fon), les prénoms de la fiche visée. */
export function vocabulairePermis(catalogue: readonly string[], prenoms: readonly string[]): Set<string> {
  const v = new Set<string>();
  for (const m of MOTS_DU_RELAIS) { v.add(m); v.add(retireLesAccents(m)); }
  for (const source of [catalogue, prenoms]) for (const texte of source) for (const m of motsDe(texte)) { v.add(m); v.add(retireLesAccents(m)); }
  return v;
}

export function motEstPropre(
  mot: string | null | undefined,
  permis: Set<string>,
): { ok: true } | { ok: false; motif: string } {
  const t = String(mot ?? '').trim();
  if (!t) return { ok: true };
  if (t.length > MOT_AU_PLUS) return { ok: false, motif: `plus de ${MOT_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: 'des guillemets : un relais ne cite jamais' };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ''))) return { ok: false, motif: 'un numéro : la clé du numéro a son champ' };
  for (const m of motsDe(t)) {
    if (/^\d+$/.test(m) || m.length < 3) continue;
    if (m.endsWith('h') && /^\d+h$/.test(m)) continue;
    if (permis.has(m) || permis.has(retireLesAccents(m))) continue;
    return { ok: false, motif: `un mot hors des faits de la Maison : « ${m} »` };
  }
  return { ok: true };
}

/* ── Les décisions laissées au porteur ────────────────────────────────── */

export const GENRES_DE_DECISION = ['reponse', 'place-tenue', 'note', 'argent', 'cercle'] as const;
export type GenreDeDecision = typeof GENRES_DE_DECISION[number];

export type ChoixDeDecision = 'envoyer' | 'modifier' | 'non' | 'confirmer' | 'autre-heure' | Cercle;

export const CHOIX_PAR_GENRE: Record<GenreDeDecision, readonly ChoixDeDecision[]> = {
  reponse: ['envoyer', 'modifier', 'non'],
  'place-tenue': ['confirmer', 'autre-heure', 'non'],
  note: ['envoyer', 'modifier', 'non'],
  argent: ['envoyer', 'modifier', 'non'],
  cercle: [...CERCLES],
};

export const CHOIX_DIT: Record<string, string> = {
  envoyer: 'Envoyer', modifier: 'Modifier', non: 'Non', confirmer: 'Confirmer', 'autre-heure': 'Autre heure',
  cliente: 'Cliente', proche: 'Proche', famille: 'Famille', fournisseur: 'Fournisseur', inconnu: 'Inconnu',
};

export type Decision = {
  id: string;
  assistant: string;
  genre: GenreDeDecision;
  numeroCle?: string | null;
  clientId?: string | null;
  rdvId?: string | null;
  /** Ce qu'il faut savoir pour choisir, sans nom et sans citation. */
  resume: string;
  /** La réponse ou la note proposée par l'assistant (ses mots à lui). */
  proposition?: string | null;
  choix: readonly ChoixDeDecision[];
  echeance?: string | null;
  tranchee?: ChoixDeDecision | null;
  trancheeLe?: string | null;
  trancheePar?: string | null;
  texteModifie?: string | null;
  executeeLe?: string | null;
  creeLe: string;
};

export const RESUME_AU_PLUS = 160;

export const estGenreDeDecision = (g: unknown): g is GenreDeDecision => typeof g === 'string' && (GENRES_DE_DECISION as readonly string[]).includes(g);

export function resumeEstPropre(resume: string | null | undefined): { ok: true } | { ok: false; motif: string } {
  const t = String(resume ?? '').trim();
  if (!t) return { ok: false, motif: 'un résumé vide' };
  if (t.length > RESUME_AU_PLUS) return { ok: false, motif: `plus de ${RESUME_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: 'des guillemets : un résumé ne cite jamais' };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ''))) return { ok: false, motif: 'un numéro dans le résumé' };
  return { ok: true };
}

export const decisionEnAttente = (d: Pick<Decision, 'tranchee' | 'echeance'>, maintenantMs: number): boolean => {
  if (d.tranchee) return false;
  const e = Date.parse(d.echeance ?? '');
  return !(Number.isFinite(e) && e <= maintenantMs);
};

/* ── La place tenue : une échéance en heures ouvrées ──────────────────── */

export type HeuresOuvrees = { ouvreDe: number; fermeA: number; joursOuverts: readonly number[] };

/** La Maison : fermée dimanche et lundi ; les heures de veille le reste. */
export const HEURES_OUVREES_PAR_DEFAUT: HeuresOuvrees = { ouvreDe: 8, fermeA: 20, joursOuverts: [2, 3, 4, 5, 6] };

/** L'instant (ISO UTC) où `heures` heures ouvrées se seront écoulées depuis
    `depuisMs`, à Cotonou. Hors des heures ouvertes, le compte ne court pas. */
export function echeanceOuvree(depuisMs: number, heures: number, h: HeuresOuvrees = HEURES_OUVREES_PAR_DEFAUT): string {
  let reste = Math.max(0, heures) * 60;
  let t = depuisMs;
  for (let garde = 0; garde < 24 * 14 && reste > 0; garde++) {
    const c = aCotonou(t);
    const minuteDuJour = c.heure * 60 + c.minute;
    const ouvre = h.ouvreDe * 60; const ferme = h.fermeA * 60;
    if (!h.joursOuverts.includes(c.jour) || minuteDuJour >= ferme) {
      // au lendemain, à l'ouverture
      const lendemain = new Date(t + DECALAGE_COTONOU_MIN * 60_000);
      lendemain.setUTCDate(lendemain.getUTCDate() + 1);
      lendemain.setUTCHours(h.ouvreDe, 0, 0, 0);
      t = lendemain.getTime() - DECALAGE_COTONOU_MIN * 60_000;
      continue;
    }
    if (minuteDuJour < ouvre) { t += (ouvre - minuteDuJour) * 60_000; continue; }
    const dispo = ferme - minuteDuJour;
    const pris = Math.min(dispo, reste);
    t += pris * 60_000; reste -= pris;
  }
  return new Date(t).toISOString();
}

/* ── Les clés : prise d'un jour, idempotence d'un geste ───────────────── */

/** Une seule pose par cliente et par jour, tous assistants confondus. */
export const cleDeJour = (numero: string, dateISO: string): string => `jour:${numero}:${dateISO}`;

/** Un message rejoué après un redémarrage ne pose rien deux fois. */
export const cleDeGeste = (assistant: string, numero: string, heureMessageIso: string): string =>
  `geste:${assistant}:${numero}:${String(heureMessageIso ?? '').slice(0, 16)}`;

/* ── Le jeton d'appareil ──────────────────────────────────────────────── */

const hex = (o: Uint8Array) => Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');

export function nouveauJetonAssistant(id: string): string {
  const o = new Uint8Array(24);
  globalThis.crypto.getRandomValues(o);
  return `assistant-${id}-${hex(o)}`;
}

export async function empreinteDuJetonAssistant(jeton: string): Promise<string> {
  const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(jeton ?? '').trim()));
  return hex(new Uint8Array(h));
}

export const EN_TETE_DU_JETON_ASSISTANT = 'x-jeton-assistant';

/* ── Le journal et les notifications ──────────────────────────────────── */

export const PORTE_ASSISTANT = 'assistant';

/** Le corps d'une notification au porteur : jamais un nom, jamais un extrait. */
export function corpsDeNotification(genre: GenreDeRelais | 'decision' | 'sommeil' | 'empeche', detail?: { heure?: string; nom?: string; depuis?: string; empeche?: string }): { titre: string; corps: string } {
  const qui = detail?.nom ?? 'Votre assistant';
  switch (genre) {
    case 'place-tenue': return { titre: 'Une place tenue pour vous', corps: `${detail?.heure ?? 'Une place'} : confirmez d'un toucher dans Les assistants.` };
    case 'place-confirmee': return { titre: 'Place confirmée', corps: `${detail?.heure ?? 'La place'} est confirmée par l'autre fauteuil.` };
    case 'place-refusee': return { titre: 'Place refusée', corps: `${detail?.heure ?? 'La place'} n'est pas tenue : une autre heure est à proposer.` };
    case 'rdv-pose-pour-toi': return { titre: 'Rendez-vous posé pour vous', corps: detail?.heure ?? 'Un rendez-vous vous attend au Trône.' };
    case 'rdv-deplace': return { titre: 'Rendez-vous déplacé', corps: detail?.heure ?? 'Un de vos rendez-vous a bougé.' };
    case 'rdv-annule': return { titre: 'Rendez-vous annulé', corps: detail?.heure ?? 'Un de vos rendez-vous est annulé.' };
    case 'hermine-a-prevenir': return { titre: 'Tresses posées', corps: 'Hermine est à prévenir depuis votre fil.' };
    case 'argent-a-trancher': return { titre: 'Une question d\'argent', corps: 'Un relais vous attend au Trône.' };
    case 'fil-ouvert': return { titre: 'La même personne vous écrit à tous les deux', corps: 'L\'autre assistant répond ; un relais le dit.' };
    case 'envie-lue': return { titre: 'Une envie notée', corps: 'Une Note du carnet a été posée sur un rendez-vous.' };
    case 'assistant-endormi': return { titre: 'L\'autre assistant dort', corps: 'Des fils attendent de son côté.' };
    case 'decision': return { titre: 'Une décision vous attend', corps: `${qui} a laissé une proposition dans Les assistants.` };
    case 'sommeil': return { titre: `${qui} dort`, corps: `Aucun passage depuis ${detail?.depuis ?? 'un moment'}. Relancez-le d'un clic.` };
    case 'empeche': return { titre: `${qui} est empêché`, corps: detail?.empeche ?? 'Un contrôle a échoué au dernier passage.' };
  }
}

/* ── La voix : ce qu'un assistant n'écrit jamais ──────────────────────── */

/** Les tournures d'assistant, repérées par Yéman le 31 octobre 2026 : un
    message qui en porte une n'est pas dans la voix du porteur. */
export const TOURNURES_INTERDITES = [
  'c\'est noté', 'c\'est bien noté', 'n\'hésite pas', 'n\'hésitez pas', 'belle journée', 'bonne continuation',
  'à très vite', 'a très vite', 'je la garde dans ton dossier', 'je te réserve la place', 'merci pour ton message',
  'merci pour votre message', 'je reste disponible', 'bien à toi', 'bien à vous', 'au plaisir', 'cordialement',
  'en tant qu\'assistant', 'je suis un assistant', 'je suis une ia',
];

export function tournureInterdite(texte: string | null | undefined): string | null {
  const t = retireLesAccents(String(texte ?? '').toLowerCase()).replace(/[’]/g, '\'');
  for (const x of TOURNURES_INTERDITES) if (t.includes(retireLesAccents(x))) return x;
  return null;
}

/* ── Les actions de la fonction `assistants-maison` ───────────────────── */

/** Porte A : le jeton d'un assistant. Porte B : le JWT d'un souverain, depuis
    l'écran « Les assistants ». */
export const ACTIONS_DU_JETON = [
  'passage', 'relais.deposer', 'relais.traiter', 'decision.deposer', 'decision.executee',
  'rdv.poser', 'rdv.deplacer', 'rdv.annuler', 'note.poser', 'notifier',
] as const;
export const ACTIONS_DU_SOUVERAIN = ['jeton.donner', 'jeton.retirer', 'decision.trancher', 'place.trancher'] as const;

export type ReponseAssistants =
  | { ok: true; version: string; [k: string]: unknown }
  | { ok: false; motif: string; version?: string; [k: string]: unknown };

/** La porte qu'une action exige : le jeton d'un assistant, le JWT d'un
    souverain, ou aucune (action inconnue). La fonction et l'écran s'en servent. */
export const porteDeLAction = (action: unknown): 'jeton' | 'souverain' | null => {
  if (typeof action !== 'string') return null;
  if ((ACTIONS_DU_JETON as readonly string[]).includes(action)) return 'jeton';
  if ((ACTIONS_DU_SOUVERAIN as readonly string[]).includes(action)) return 'souverain';
  return null;
};

/* ── Ce que la fonction ajoute : la note, les tresses ─────────────────── */

export const NOTE_AU_PLUS = 200;

/** La Note du carnet posée par un assistant : deux cents caractères au plus,
    jamais une citation, jamais un numéro. La charte borne le reste (l'envie,
    la longueur, la couleur, les tresses, le retard) : ici, la forme. */
export function noteEstPropre(note: string | null | undefined): { ok: true } | { ok: false; motif: string } {
  const t = String(note ?? '').trim();
  if (!t) return { ok: false, motif: 'une note vide' };
  if (t.length > NOTE_AU_PLUS) return { ok: false, motif: `plus de ${NOTE_AU_PLUS} caractères` };
  if (/[«»"“”„]/.test(t)) return { ok: false, motif: 'des guillemets : une note ne cite jamais' };
  if (/\d{8,}/.test(t.replace(/[\s.-]/g, ''))) return { ok: false, motif: 'un numéro dans la note' };
  return { ok: true };
}

/** Une prestation de tresses se reconnaît à son nom ou à celui de sa
    rubrique : c'est elle qui fait prévenir Hermine (depuis le fil de Yéman
    seulement, d'où le relais quand Onyx pose). */
export const estUneTresse = (nomDePrestation: string | null | undefined, labelDeRubrique?: string | null): boolean => {
  const p = String(nomDePrestation ?? '').toLowerCase();
  const r = String(labelDeRubrique ?? '').toLowerCase();
  return /tresse/.test(r) || /tresse|natte|vanille/.test(p);
};
