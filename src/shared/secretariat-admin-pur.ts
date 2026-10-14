/* ══ LE SECRÉTARIAT ADMINISTRATIF, CE QUI NE DÉPEND DE RIEN — 14 octobre 2026 ══

   Maquette TChByryYz3fpTZQ7RELK6x validée (« construis »), et ses quatre
   choix lus dans la page : un rôle « Secrétariat » ; le courrier en photo,
   le papier au classeur ; les rappels dans À faire et en notification ;
   tout en une seule mise en ligne.

   Six genres neufs de la table `secretariat` (0129) : courrier, échéance,
   contrat, démarche, contact, clôture. La BASE tient qui voit quoi ; les
   prédicats d'ici n'en sont que le miroir, pour que l'écran ne montre pas un
   bouton que la base refuserait. Rien ici ne lit le réseau ni l'horloge :
   tout reçoit « aujourd'hui » en paramètre, et se prouve au banc. */

export type Fichier = { chemin: string; nom: string; type: string; taille: number };

type Base = {
  id: string;
  branchId: string;
  /** Toujours la Maison : le privé se dit par `prive`, comme en 0122. */
  entite: 'mnd';
  /** Réservé à la direction (la base le tient, 0122 et 0129). */
  prive?: boolean;
  creeLe: string;
  creePar: string;
  majLe?: string;
};

export type Sens = 'arrive' | 'depart';
export type EtatArrive = 'a-traiter' | 'repondu' | 'classe';
export type EtatDepart = 'prepare' | 'envoye' | 'accuse';
export type Moyen = 'main-propre' | 'whatsapp' | 'courriel' | 'poste' | 'autre';

export type Courrier = Base & {
  genre: 'courrier';
  sens: Sens;
  /** A-2026-001 à l'arrivée, D-2026-001 au départ : il s'écrit au crayon sur l'original. */
  numero: string;
  /** Reçu le, ou envoyé le. */
  date: string;
  correspondant: string;
  contactId?: string;
  objet: string;
  /** Le compte à qui il est confié : lui seul, hors secrétariat, le voit (0129). */
  traitePar?: string;
  reponseAvant?: string;
  etat: EtatArrive | EtatDepart;
  moyen?: Moyen;
  fichiers: Fichier[];
  /** La lettre de la Maison : la réponse écrite, ou ce qui part. */
  pieceId?: string;
  repondA?: string;
  demarcheId?: string;
  contratId?: string;
  /** L'original est rangé au classeur, sous son numéro (choix du 14 octobre). */
  auClasseur?: boolean;
  note?: string;
};

export type TypeEcheance = 'impots' | 'social' | 'loyer' | 'contrat' | 'papier' | 'demarche' | 'autre';
export type Recurrence = 'aucune' | 'mensuelle' | 'trimestrielle' | 'annuelle';
export type Faite = { pour: string; le: string; par: string };

export type Echeance = Base & {
  genre: 'echeance';
  titre: string;
  type: TypeEcheance;
  /** Absente : « à dater » (une date que le comptable doit encore donner). */
  date?: string;
  recurrence: Recurrence;
  traitePar?: string;
  contratId?: string;
  demarcheId?: string;
  note?: string;
  faites: Faite[];
  terminee?: boolean;
};

export type TypeContrat = 'bail' | 'fournisseur' | 'abonnement' | 'service' | 'assurance' | 'autre';
export type Devise = 'XOF' | 'USD' | 'EUR';
export type Periodicite = 'mois' | 'trimestre' | 'an' | 'unique' | 'usage';

export type Contrat = Base & {
  genre: 'contrat';
  titre: string;
  type: TypeContrat;
  avecQui: string;
  contactId?: string;
  debut?: string;
  fin?: string;
  renouvellement: 'tacite' | 'manuel' | 'aucun';
  preavisJours?: number;
  montant?: number;
  devise: Devise;
  periodicite: Periodicite;
  fichiers: Fichier[];
  etat: 'en-cours' | 'resilie' | 'termine';
  note?: string;
};

export type TypeDemarche = 'administration' | 'achat' | 'juridique' | 'banque' | 'autre';
export type EtatDemarche = 'en-cours' | 'en-attente' | 'terminee' | 'abandonnee';
export type Etape = { id: string; texte: string; faiteLe?: string };
export type Frais = { libelle: string; montant: number; devise: Devise; le: string };

export type Demarche = Base & {
  genre: 'demarche';
  titre: string;
  type: TypeDemarche;
  aupres: string;
  contactId?: string;
  etapes: Etape[];
  prochaine?: string;
  prochaineLe?: string;
  etat: EtatDemarche;
  /** Les documents du registre qui en font partie. */
  pieceIds: string[];
  /** Pour mémoire : la dépense s'inscrit aux Finances, jamais ici. */
  frais: Frais[];
  fichiers: Fichier[];
  termineeLe?: string;
  note?: string;
};

export type CategorieContact = 'administration' | 'conseil' | 'banque' | 'maison' | 'fournisseur' | 'autre';

export type Contact = Base & {
  genre: 'contact';
  nom: string;
  categorie: CategorieContact;
  personne?: string;
  telephone?: string;
  courriel?: string;
  adresse?: string;
  site?: string;
  note?: string;
};

export type Cloture = Base & { genre: 'cloture'; annee: number; closeLe: string; closePar: string };

export type LigneAdministrative = Courrier | Echeance | Contrat | Demarche | Contact | Cloture;
export const GENRES_ADMINISTRATIFS = ['courrier', 'echeance', 'contrat', 'demarche', 'contact', 'cloture'] as const;

/* ══ LES MOTS ════════════════════════════════════════════════════════ */

export const ETATS_ARRIVE: Record<EtatArrive, string> = { 'a-traiter': 'À traiter', repondu: 'Répondu', classe: 'Classé' };
export const ETATS_DEPART: Record<EtatDepart, string> = { prepare: 'Prêt, pas envoyé', envoye: 'Envoyé', accuse: 'Accusé reçu' };
export const MOYENS: Record<Moyen, string> = { 'main-propre': 'En main propre', whatsapp: 'WhatsApp', courriel: 'Courriel', poste: 'Poste', autre: 'Autre' };
export const TYPES_ECHEANCE: Record<TypeEcheance, string> = {
  impots: 'Impôts', social: 'Social', loyer: 'Loyer', contrat: 'Contrat', papier: 'Papier', demarche: 'Démarche', autre: 'Autre',
};
export const RECURRENCES: Record<Recurrence, string> = { aucune: 'Une fois', mensuelle: 'Chaque mois', trimestrielle: 'Chaque trimestre', annuelle: 'Chaque année' };
export const TYPES_CONTRAT: Record<TypeContrat, string> = {
  bail: 'Bail', fournisseur: 'Fournisseur', abonnement: 'Abonnement', service: 'Service', assurance: 'Assurance', autre: 'Autre',
};
export const PERIODICITES: Record<Periodicite, string> = { mois: 'par mois', trimestre: 'par trimestre', an: 'par an', unique: 'une fois', usage: 'à l’usage' };
export const RENOUVELLEMENTS: Record<Contrat['renouvellement'], string> = { tacite: 'Se renouvelle seul', manuel: 'À renouveler', aucun: 'Sans renouvellement' };
export const ETATS_CONTRAT: Record<Contrat['etat'], string> = { 'en-cours': 'En cours', resilie: 'Résilié', termine: 'Terminé' };
export const TYPES_DEMARCHE: Record<TypeDemarche, string> = {
  administration: 'Administration', achat: 'Achat', juridique: 'Juridique', banque: 'Banque', autre: 'Autre',
};
export const ETATS_DEMARCHE: Record<EtatDemarche, string> = { 'en-cours': 'En cours', 'en-attente': 'En attente', terminee: 'Terminée', abandonnee: 'Abandonnée' };
export const CATEGORIES_CONTACT: Record<CategorieContact, string> = {
  administration: 'Administrations', conseil: 'Conseils', banque: 'Banques', maison: 'La maison', fournisseur: 'Fournisseurs', autre: 'Autres',
};

/** LES DURÉES DE CONSERVATION, dites et jamais appliquées seules : à la fin,
    la direction décide (rien ne s'efface tout seul). */
export const DUREES_DE_CONSERVATION: { duree: string; quoi: string; source: string }[] = [
  { duree: '10 ans', quoi: 'Pièces comptables : factures, reçus, relevés', source: 'Droit comptable OHADA, à confirmer avec le comptable' },
  { duree: 'Fin + 5 ans', quoi: 'Contrats et leurs avenants', source: 'Proposition de la maquette' },
  { duree: '5 ans', quoi: 'Courrier ordinaire, arrivé et départ', source: 'Proposition de la maquette' },
  { duree: 'Toujours', quoi: 'Papiers officiels : chaque version reste', source: 'Règle des Papiers, depuis le 6 octobre 2026' },
];

/* ══ CE QUI TOMBE ════════════════════════════════════════════════════
   LE MÊME CALCUL À L'ÉCRAN ET DANS LA FONCTION push-notify : le bloc
   ci-dessous y est recopié À L'IDENTIQUE (une fonction Edge n'importe rien),
   et le banc refuse une copie qui diverge. Il ne connaît que des lignes
   brutes : ce que la base rend, sans les types de l'écran. */
/* ⟨ce-qui-tombe⟩ */
/** Une date ISO décalée de n jours, à midi UTC : aucun fuseau ne fait sauter le jour. */
export const ajouteJours = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Le nombre de jours de `de` à `a` (négatif si `a` est passé). */
export const ecartEnJours = (de: string, a: string): number =>
  Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
export type Tombe = { cle: string; genre: string; id: string; titre: string; date: string; prive: boolean; traitePar?: string };
type Brut = { [k: string]: unknown };
const texteDe = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const dateDe = (v: unknown): string => (typeof v === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(v) ? v.slice(0, 10) : '');
/** Tout ce qui a une date à tenir : les échéances, les réponses attendues,
    la prochaine action d'une démarche, le préavis et la fin d'un contrat. */
export function ceQuiTombe(lignes: readonly Brut[]): Tombe[] {
  const out: Tombe[] = [];
  for (const l of lignes) {
    const id = texteDe(l.id);
    const genre = texteDe(l.genre);
    const prive = l.prive === true;
    const traitePar = texteDe(l.traitePar) || undefined;
    const pousse = (suffixe: string, titre: string, date: string): void => {
      if (date) out.push({ cle: `${id}:${suffixe}:${date}`, genre, id, titre, date, prive, traitePar });
    };
    if (genre === 'echeance' && l.terminee !== true) {
      pousse('date', texteDe(l.titre) || 'Une échéance', dateDe(l.date));
    } else if (genre === 'courrier' && l.sens === 'arrive' && l.etat === 'a-traiter') {
      pousse('reponse', `Répondre à ${texteDe(l.correspondant) || 'un courrier'} (${texteDe(l.numero)})`, dateDe(l.reponseAvant));
    } else if (genre === 'demarche' && (l.etat === 'en-cours' || l.etat === 'en-attente')) {
      pousse('prochaine', `${texteDe(l.titre) || 'Une démarche'} : ${texteDe(l.prochaine) || 'la prochaine étape'}`, dateDe(l.prochaineLe));
    } else if (genre === 'contrat' && l.etat === 'en-cours') {
      const fin = dateDe(l.fin);
      const preavis = typeof l.preavisJours === 'number' && l.preavisJours > 0 ? Math.round(l.preavisJours) : 0;
      const titre = texteDe(l.titre) || 'un contrat';
      if (fin && preavis) pousse('preavis', `Dernier jour du préavis : ${titre}`, ajouteJours(fin, -preavis));
      if (fin) pousse('fin', `${l.renouvellement === 'tacite' ? 'Renouvellement' : 'Fin'} : ${titre}`, fin);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));
}
/** Les deux rappels envoyés par notification (choix du 14 octobre) : J-7 et J-1. */
export const JOURS_DE_NOTIFICATION = [7, 1];
/* ⟨/ce-qui-tombe⟩ */

/* ══ LES DATES ═══════════════════════════════════════════════════════ */

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 14 oct. 2026 » : toujours l'année (règle de la Maison). */
export const dateCourte = (iso?: string): string => {
  if (!iso || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(iso)) return '';
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return `${j} ${MOIS_COURTS[m - 1]} ${a}`;
};

/** Ajouter des mois sans déborder : le 31 janvier plus un mois, c'est le 28
    (ou 29) février, jamais le 3 mars. */
export function ajouteMois(iso: string, n: number): string {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const annee = Math.floor(total / 12);
  const mois = total % 12;
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return `${annee}-${String(mois + 1).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`;
}

export const prochaineDate = (date: string, r: Recurrence): string | undefined =>
  r === 'mensuelle' ? ajouteMois(date, 1) : r === 'trimestrielle' ? ajouteMois(date, 3) : r === 'annuelle' ? ajouteMois(date, 12) : undefined;

/** FAIRE UNE ÉCHÉANCE : elle se note faite ; si elle revient, sa prochaine
    date se pose d'elle-même, sinon elle se termine. */
export function marqueFaite(e: Echeance, le: string, par: string): Echeance {
  const faites = [...e.faites, { pour: e.date ?? le.slice(0, 10), le, par }];
  const suite = e.date ? prochaineDate(e.date, e.recurrence) : undefined;
  return suite ? { ...e, faites, date: suite } : { ...e, faites, terminee: true };
}

/** Ce que dit un rappel, d'après l'écart en jours. */
export function rappelDit(date: string, jour: string): { mot: string; urgent: boolean } {
  const n = ecartEnJours(jour, date);
  if (n < 0) return { mot: `dépassé de ${-n} jour${n < -1 ? 's' : ''}`, urgent: true };
  if (n === 0) return { mot: 'aujourd’hui', urgent: true };
  if (n === 1) return { mot: 'demain', urgent: true };
  return { mot: `dans ${n} jours`, urgent: n <= 7 };
}

/** Ce que « À faire » montre : ce qui tombe sous 30 jours, et ce qui est dépassé. */
export const sousTrenteJours = (t: readonly Tombe[], jour: string): Tombe[] => t.filter((x) => ecartEnJours(jour, x.date) <= 30);

/* ══ LE COURRIER ═════════════════════════════════════════════════════ */

/** Le numéro suivant de l'année : A-2026-015. Les numéros d'une autre année,
    d'un autre sens ou mal formés ne comptent pas. */
export function prochainNumeroDuCourrier(sens: Sens, annee: number, numeros: readonly string[]): string {
  const prefixe = `${sens === 'arrive' ? 'A' : 'D'}-${annee}-`;
  const max = numeros.reduce((m, n) => {
    if (!n.startsWith(prefixe)) return m;
    const k = parseInt(n.slice(prefixe.length), 10);
    return Number.isFinite(k) && k > m ? k : m;
  }, 0);
  return `${prefixe}${String(max + 1).padStart(3, '0')}`;
}

/* LE TAMPON « REÇU LE » SUR LA PHOTO (maquette, lot 1). La photo d'un
   courrier arrivé reçoit le tampon de la Maison, daté du jour d'arrivée, en
   haut à droite, là où l'on tamponne la marge d'une lettre : un quart de la
   largeur (environ 5 cm sur une feuille A4), jamais plus haut que le quart
   de la photo. Un départ ne se tamponne pas ; un PDF part tel quel. */
export const recuLeDe = (c: Pick<Courrier, 'sens' | 'date'>): string | undefined =>
  c.sens === 'arrive' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(c.date) ? c.date : undefined;

export function placeDuRecu(largeur: number, hauteur: number, ratio: number): { x: number; y: number; l: number; h: number } {
  let l = Math.round(largeur * 0.26);
  let h = Math.round(l / ratio);
  const hMax = Math.round(hauteur * 0.25);
  if (h > hMax) { h = hMax; l = Math.round(h * ratio); }
  const marge = Math.round(Math.min(largeur, hauteur) * 0.03);
  return { x: largeur - l - marge, y: marge, l, h };
}

/** Un contrat à revoir : son préavis ou sa fin tombe sous 60 jours, ou sa
    fin est passée alors qu'il est encore « en cours ». */
export function aRevoir(c: Contrat, jour: string): boolean {
  if (c.etat !== 'en-cours' || !c.fin) return false;
  const butee = c.preavisJours ? ajouteJours(c.fin, -c.preavisJours) : c.fin;
  return ecartEnJours(jour, butee) <= 60;
}

/** Un document qui attend MA signature (forme minimale, pour ne pas lier ce
    module au registre). */
export const attendMaSignature = (p: { etat: string; signataires: { userId: string }[]; poses: { cle: string; image?: string }[] }, moi: string): boolean =>
  (p.etat === 'brouillon' || p.etat === 'a-signer') && p.signataires.some((s) => s.userId === moi)
    && !p.poses.some((q) => q.cle === `sig:${moi}` && !!q.image);

/* ══ QUI VOIT QUOI : le miroir de 0129 ═══════════════════════════════ */

export type Qui = { direction: boolean; titulaire: boolean; moi: string };
export const tientLeSecretariat = (q: Qui): boolean => q.direction || q.titulaire;

export function voit(l: { genre: string; prive?: boolean; traitePar?: string }, q: Qui): boolean {
  if (l.prive && !q.direction) return false;
  if (l.genre === 'echeance' || l.genre === 'contrat' || l.genre === 'demarche' || l.genre === 'cloture') return tientLeSecretariat(q);
  if (l.genre === 'courrier') return tientLeSecretariat(q) || (!!q.moi && l.traitePar === q.moi);
  return true;
}

export function peutEcrire(l: { genre: string; prive?: boolean; traitePar?: string }, q: Qui, neuf: boolean): boolean {
  if (l.prive && !q.direction) return false;
  if (l.genre === 'cloture') return q.direction;
  if (l.genre === 'courrier') return tientLeSecretariat(q) || (!neuf && !!q.moi && l.traitePar === q.moi);
  if (l.genre === 'echeance' || l.genre === 'contrat' || l.genre === 'demarche' || l.genre === 'contact') return tientLeSecretariat(q);
  return true;
}

/* ══ LES ARCHIVES ════════════════════════════════════════════════════ */

export const anneesCloses = (lignes: readonly { genre: string; annee?: unknown }[]): number[] =>
  lignes.filter((l) => l.genre === 'cloture' && typeof l.annee === 'number').map((l) => l.annee as number).sort((a, b) => b - a);

/** Une ligne d'une année close ne bouge plus, sauf pour la direction (0129). */
export function estFige(l: LigneAdministrative, closes: readonly number[], direction: boolean): boolean {
  if (direction) return false;
  const quand = l.genre === 'courrier' ? l.date : l.genre === 'demarche' ? l.termineeLe : undefined;
  return !!quand && closes.includes(parseInt(quand.slice(0, 4), 10));
}

/** Les années qu'on peut voir aux archives : celles où un courrier a été
    reçu ou envoyé, ou une démarche terminée, et l'année en cours. */
export function anneesDesArchives(lignes: readonly LigneAdministrative[], jour: string): number[] {
  const s = new Set<number>([parseInt(jour.slice(0, 4), 10)]);
  for (const l of lignes) {
    if (l.genre === 'courrier' && l.date) s.add(parseInt(l.date.slice(0, 4), 10));
    if (l.genre === 'demarche' && l.termineeLe) s.add(parseInt(l.termineeLe.slice(0, 4), 10));
  }
  return [...s].filter(Number.isFinite).sort((a, b) => b - a);
}

/** Un montant dans SA devise (2 140 USD reste 2 140 USD : rien n'est converti). */
export const montantDit = (montant: number | undefined, devise: Devise): string => {
  if (typeof montant !== 'number' || !Number.isFinite(montant)) return '';
  const n = montant.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return devise === 'XOF' ? `${n} F` : `${n} ${devise}`;
};
