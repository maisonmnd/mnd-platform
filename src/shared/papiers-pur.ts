/* LES PAPIERS DE LA MAISON, LE PUR — 6 octobre 2026.

   « Je veux stocker des documents dans le Trône : mon IFU, le RCCM, les
   certificats de résidence, la carte d'identité de chaque entreprise »
   (Yéman). Maquette FBNmp7Q5PPrS9gpd1r613D validée, quatre choix au
   sélecteur : papiers d'une personne vus de Yéman et Brice ; marque
   obligatoire sur les copies d'une personne ; champ « Original » ; alerte
   30 jours, 60 pour un passeport.

   Ici, rien que des fonctions : le catalogue des papiers, l'état d'une pièce
   à une date, ce qui manque à un titulaire, les modèles de dossier, le texte
   de la marque. Le harnais `verifie-les-papiers` les éprouve. */

/* ══ LES LIGNES ══════════════════════════════════════════════════════ */

/** Une page d'une pièce : un fichier du compartiment privé `papiers`. */
export type Page = { chemin: string; nom: string; type: string; taille: number };

/** Une version remplacée : gardée, barrée, jamais effacée par un remplacement. */
export type Version = {
  pages: Page[];
  numero: string;
  delivreLe: string;
  expireLe: string;
  deposeLe: string;
  deposePar: string;
  remplaceeLe: string;
};

/** Une ligne du journal d'une pièce : qui l'a vue, à qui elle a été remise. */
export type Trace = { quand: string; qui: string; quoi: string };

/** Le titulaire : `ent:mnd`, `ent:acia`, `ent:<entreprise du secrétariat>`,
    ou `pers:<personne>`. */
export type Titulaire = string;

export type Papier = {
  id: string; // `pap-…`
  genre: 'papier';
  branchId: string;
  titulaire: Titulaire;
  type: string; // clé de TYPES
  /** Le nom libre d'un papier « Autre ». */
  titre?: string;
  numero: string;
  delivreLe: string; // aaaa-mm-jj ou ''
  expireLe: string; // aaaa-mm-jj ou '' (sans expiration)
  /** Où se trouve l'original papier (choix du 6 octobre). */
  original: string;
  note: string;
  pages: Page[];
  versions: Version[];
  deposeLe: string;
  deposePar: string;
  journal: Trace[];
};

export type Personne = { id: string; genre: 'personne'; branchId: string; nom: string; qualite: string };

export type LignePapiers = Papier | Personne;

export const estEntreprise = (t: Titulaire): boolean => t.startsWith('ent:');
export const estPersonne = (t: Titulaire): boolean => t.startsWith('pers:');

/* ══ LE CATALOGUE ════════════════════════════════════════════════════ */

/** La durée proposée d'un papier : des mois après la délivrance, sa date de
    fin à taper (`fin`), ou pas d'expiration (`sans`). Une PROPOSITION : la
    vraie date est celle écrite sur le papier, et c'est elle qu'on garde. */
export type Duree = { mois: number } | 'fin' | 'sans';

export type TypePapier = {
  cle: string;
  titre: string;
  pour: 'entreprise' | 'personne';
  duree: Duree;
  /** Attendu de tout titulaire de ce genre : compté dans « ce qui manque ». */
  attendu: boolean;
  /** Prévenir combien de jours avant l'expiration (30 par défaut). */
  alerte?: number;
};

export const ALERTE_PAR_DEFAUT = 30;

export const TYPES: TypePapier[] = [
  /* Une entreprise */
  { cle: 'rccm', titre: 'RCCM (registre du commerce)', pour: 'entreprise', duree: 'sans', attendu: true },
  { cle: 'ifu', titre: 'IFU, attestation d’immatriculation', pour: 'entreprise', duree: 'sans', attendu: true },
  { cle: 'statuts', titre: 'Statuts', pour: 'entreprise', duree: 'sans', attendu: true },
  { cle: 'arf', titre: 'Attestation de régularité fiscale', pour: 'entreprise', duree: { mois: 12 }, attendu: true },
  { cle: 'cnss', titre: 'Attestation CNSS', pour: 'entreprise', duree: 'fin', attendu: true },
  { cle: 'bail', titre: 'Bail commercial', pour: 'entreprise', duree: 'fin', attendu: false },
  { cle: 'autorisation', titre: 'Autorisation, licence, carte professionnelle', pour: 'entreprise', duree: 'fin', attendu: false },
  { cle: 'pv', titre: 'Procès-verbal, nomination du gérant', pour: 'entreprise', duree: 'sans', attendu: false },
  { cle: 'rib', titre: 'RIB', pour: 'entreprise', duree: 'sans', attendu: false },
  { cle: 'assurance', titre: 'Police d’assurance', pour: 'entreprise', duree: 'fin', attendu: false },
  { cle: 'oapi', titre: 'Dépôt OAPI (marque)', pour: 'entreprise', duree: { mois: 120 }, attendu: false },
  { cle: 'autre-ent', titre: 'Autre papier', pour: 'entreprise', duree: 'fin', attendu: false },
  /* Une personne */
  { cle: 'cni', titre: 'Carte d’identité, CIP', pour: 'personne', duree: 'fin', attendu: true },
  { cle: 'passeport', titre: 'Passeport', pour: 'personne', duree: 'fin', attendu: true, alerte: 60 },
  { cle: 'residence', titre: 'Certificat de résidence', pour: 'personne', duree: { mois: 3 }, attendu: true },
  { cle: 'casier', titre: 'Casier judiciaire (bulletin n° 3)', pour: 'personne', duree: { mois: 3 }, attendu: true },
  { cle: 'naissance', titre: 'Acte de naissance', pour: 'personne', duree: 'sans', attendu: false },
  { cle: 'nationalite', titre: 'Certificat de nationalité', pour: 'personne', duree: 'sans', attendu: false },
  { cle: 'photo', titre: 'Photo d’identité', pour: 'personne', duree: 'sans', attendu: false },
  { cle: 'autre-pers', titre: 'Autre papier', pour: 'personne', duree: 'fin', attendu: false },
];

export const typeDe = (cle: string): TypePapier | undefined => TYPES.find((t) => t.cle === cle);
export const typesPour = (t: Titulaire): TypePapier[] => TYPES.filter((x) => x.pour === (estPersonne(t) ? 'personne' : 'entreprise'));
export const titreDuPapier = (p: Pick<Papier, 'type' | 'titre'>): string =>
  (p.type.startsWith('autre') && p.titre?.trim()) || typeDe(p.type)?.titre || 'Papier';

/* ══ LES DATES ═══════════════════════════════════════════════════════ */

const estDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Les jours entre deux dates (b − a), à midi pour fuir les changements d'heure. */
export const joursEntre = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

/** La date d'expiration PROPOSÉE à partir de la délivrance : '' quand le type
    n'a pas de durée connue (la date de fin se tape) ou pas d'expiration. */
export function expirationProposee(type: string, delivreLe: string): string {
  const t = typeDe(type);
  if (!t || typeof t.duree !== 'object' || !estDate(delivreLe)) return '';
  const [a, m, j] = delivreLe.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + t.duree.mois, j));
  /* Un 31 qui tombe dans un mois de trente jours recule au dernier jour. */
  if (d.getUTCDate() !== j) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/* ══ L'ÉTAT D'UNE PIÈCE ══════════════════════════════════════════════ */

export type Etat = 'ok' | 'bientot' | 'expire';

export const alerteDe = (type: string): number => typeDe(type)?.alerte ?? ALERTE_PAR_DEFAUT;

/** À jour, expire bientôt (dans le délai d'alerte du type), ou expirée. Une
    pièce sans date d'expiration est à jour. */
export function etatDe(p: Pick<Papier, 'type' | 'expireLe'>, aujourdhui: string): Etat {
  if (!estDate(p.expireLe)) return 'ok';
  const reste = joursEntre(aujourdhui, p.expireLe);
  if (reste < 0) return 'expire';
  if (reste <= alerteDe(p.type)) return 'bientot';
  return 'ok';
}

/** « dans 12 j », « expirée », « à jour ». */
export function etatDit(p: Pick<Papier, 'type' | 'expireLe'>, aujourdhui: string): string {
  const e = etatDe(p, aujourdhui);
  if (e === 'expire') return 'expirée';
  if (e === 'bientot') return `dans ${joursEntre(aujourdhui, p.expireLe)} j`;
  return 'à jour';
}

/* ══ CE QUI MANQUE À UN TITULAIRE ═════════════════════════════════════ */

export function piecesDe(toutes: readonly Papier[], t: Titulaire): Papier[] {
  return toutes.filter((p) => p.titulaire === t);
}

/** Les types attendus d'un titulaire qui n'ont aucune pièce. */
export function manquantsDe(toutes: readonly Papier[], t: Titulaire): TypePapier[] {
  const la = new Set(piecesDe(toutes, t).map((p) => p.type));
  return typesPour(t).filter((x) => x.attendu && !la.has(x.cle));
}

/** « 4 sur 6 » : les attendus présents, sur les attendus. */
export function completude(toutes: readonly Papier[], t: Titulaire): { faits: number; attendus: number } {
  const attendus = typesPour(t).filter((x) => x.attendu);
  const la = new Set(piecesDe(toutes, t).map((p) => p.type));
  return { faits: attendus.filter((x) => la.has(x.cle)).length, attendus: attendus.length };
}

/** Ce qui demande un geste : expirées d'abord, puis bientôt, par échéance. */
export function aRenouveler(toutes: readonly Papier[], aujourdhui: string): Papier[] {
  return toutes
    .filter((p) => etatDe(p, aujourdhui) !== 'ok')
    .sort((a, b) => a.expireLe.localeCompare(b.expireLe));
}

/* ══ LES DOSSIERS À REMETTRE ═════════════════════════════════════════ */

export type ModeleDeDossier = { cle: string; titre: string; entreprise: string[]; personne: string[] };

export const DOSSIERS: ModeleDeDossier[] = [
  { cle: 'banque', titre: 'Dossier banque', entreprise: ['rccm', 'ifu', 'statuts', 'pv'], personne: ['cni', 'residence'] },
  { cle: 'oapi', titre: 'Dossier OAPI', entreprise: ['rccm', 'ifu', 'statuts'], personne: ['cni'] },
  { cle: 'impots', titre: 'Dossier impôts', entreprise: ['rccm', 'ifu', 'statuts', 'arf'], personne: [] },
  { cle: 'bail', titre: 'Dossier bail', entreprise: ['rccm', 'ifu'], personne: ['cni', 'residence'] },
  { cle: 'libre', titre: 'Dossier libre', entreprise: [], personne: [] },
];

export type LigneDuDossier = { type: string; titulaire: Titulaire; piece?: Papier; alerte?: 'manque' | 'expire' | 'bientot' };

/** Les lignes d'un dossier : chaque papier demandé, la pièce trouvée, et ce
    qui cloche AVANT d'être au guichet. */
export function lignesDuDossier(
  modele: string, entreprise: Titulaire | undefined, personne: Titulaire | undefined,
  toutes: readonly Papier[], aujourdhui: string,
): LigneDuDossier[] {
  const m = DOSSIERS.find((d) => d.cle === modele);
  if (!m) return [];
  const ligne = (type: string, titulaire: Titulaire): LigneDuDossier => {
    const piece = toutes.find((p) => p.titulaire === titulaire && p.type === type);
    if (!piece) return { type, titulaire, alerte: 'manque' };
    const e = etatDe(piece, aujourdhui);
    return { type, titulaire, piece, alerte: e === 'ok' ? undefined : e === 'expire' ? 'expire' : 'bientot' };
  };
  return [
    ...(entreprise ? m.entreprise.map((t) => ligne(t, entreprise)) : []),
    ...(personne ? m.personne.map((t) => ligne(t, personne)) : []),
  ];
}

/** La marque est OBLIGATOIRE dès qu'un papier d'une personne part (choix du
    6 octobre) ; pour les seuls papiers d'entreprise, elle est au choix. */
export const marqueObligatoire = (pieces: readonly Pick<Papier, 'titulaire'>[]): boolean =>
  pieces.some((p) => estPersonne(p.titulaire));

/** Le texte en travers de chaque page. Les polices standard du PDF ne portent
    que le latin : une lettre hors de leur jeu est retirée, jamais un carré. */
export function texteDeLaMarque(destinataire: string, jour: string, motif?: string): string {
  const latin = (s: string) => s.normalize('NFC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '').replace(/\s+/g, ' ').trim();
  const qui = latin(destinataire).toUpperCase() || 'DESTINATAIRE';
  const quoi = motif ? ` · ${latin(motif).toUpperCase()}` : '';
  return `COPIE REMISE À ${qui} · ${latin(jour).toUpperCase()}${quoi} · USAGE UNIQUE`;
}

/* ══ LES FICHIERS ════════════════════════════════════════════════════ */

export const TAILLE_MAX = 10 * 1024 * 1024;
export const TYPES_ACCEPTES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

/** LE TYPE D'UN FICHIER CHOISI AU TÉLÉPHONE — 6 octobre 2026. Android donne
    parfois un type vide (un PDF venu d'une autre application), l'iPhone un
    HEIC : on devine par l'extension, et une photo HEIC est acceptée pour
    être convertie en JPEG avant l'envoi (elle n'est jamais gardée telle
    quelle). Rend '' quand le fichier n'est ni un PDF ni une photo. */
export function typeDuFichier(nom: string, type: string): string {
  const t = (type || '').toLowerCase();
  if ((TYPES_ACCEPTES as readonly string[]).includes(t) || t === 'image/heic' || t === 'image/heif') return t;
  const ext = (nom.split('.').pop() || '').toLowerCase();
  return ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' } as Record<string, string>)[ext] ?? '';
}

/** Le chemin d'un fichier dans le compartiment : par titulaire et par pièce,
    sans espace ni accent (le stockage refuse les noms fantaisistes). */
export function cheminDuFichier(titulaire: Titulaire, papierId: string, n: number, ext: string, horodatage: number): string {
  const propre = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
  return `${propre(titulaire)}/${propre(papierId)}/${horodatage}-${n}.${propre(ext).toLowerCase() || 'bin'}`;
}

/** Garder le journal à taille humaine : les cent dernières lignes. */
export const JOURNAL_MAX = 100;
export const ajouteAuJournal = (journal: readonly Trace[], t: Trace): Trace[] => [t, ...journal].slice(0, JOURNAL_MAX);

/** Remplacer une pièce : l'état courant devient une version, gardée. */
export function remplace(p: Papier, neuf: { pages: Page[]; numero: string; delivreLe: string; expireLe: string }, qui: string, quand: string): Papier {
  const ancienne: Version = {
    pages: p.pages, numero: p.numero, delivreLe: p.delivreLe, expireLe: p.expireLe,
    deposeLe: p.deposeLe, deposePar: p.deposePar, remplaceeLe: quand,
  };
  return {
    ...p, ...neuf, deposeLe: quand, deposePar: qui,
    versions: [ancienne, ...p.versions],
    journal: ajouteAuJournal(p.journal, { quand, qui, quoi: 'nouvelle version déposée' }),
  };
}

/** L'IFU d'un Bénin compte treize chiffres : on prévient, on ne bloque pas. */
export const numeroDouteux = (type: string, numero: string): boolean =>
  type === 'ifu' && numero.trim() !== '' && !/^\d{13}$/.test(numero.replace(/\s/g, ''));
