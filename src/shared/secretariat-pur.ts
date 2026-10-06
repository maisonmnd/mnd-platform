/* LE SECRÉTARIAT, SES RÈGLES — 6 octobre 2026.

   « Can I have an editor for documents on the Trône? » (Yéman). Maquette
   « Le secrétariat » (StpDQGL3HE1nHyyjSRNU9r), validée. Choix au sélecteur :
   chacun ne pose que SA signature ; pas d'assistant ; modèles juridiques
   rédigés par la Maison et marqués « à faire relire » ; lettres
   personnelles visibles de Yéman et Brice (la direction).

   CE FICHIER NE TOUCHE À RIEN : ni magasin, ni réseau. Il dit ce qu'est un
   document, comment il se numérote, où se posent signature et tampon. Le
   harnais l'éprouve ; l'écran, le PDF et la base le suivent.

   QUATRE RÈGLES TIENNENT LE RESTE :
   — UNE ENTITÉ, UN MONDE : en-tête, pied, tampon, encre et série suivent
     l'entité choisie ; ACIA 1 ne porte jamais rien de Maison MND ;
   — SIGNÉ, C'EST FIGÉ : dès la première signature, le texte ne bouge plus ;
     une correction est un nouveau document qui dit lequel il remplace ;
   — CHACUN SA SIGNATURE : on ne pose que celle de son propre compte ;
   — LA ZONE DE SIGNATURE SUIT LE TEXTE : signatures, nom du signataire et
     tampon se placent dans une zone ancrée juste après la formule de
     politesse, jamais à un endroit absolu de la page. L'aperçu et le PDF
     tombent ainsi au même endroit, même quand la lettre passe sur deux
     pages. */

export type Entite = 'mnd' | 'acia' | 'autre' | 'perso';
export type Genre = 'piece' | 'entreprise' | 'signataire' | 'profil';
export type EtatPiece = 'brouillon' | 'a-signer' | 'signe' | 'annule';
export type Cadre = 'libre' | 'droite' | 'centre' | 'gauche';

/** Une signature ou un tampon posé dans la zone, en millimètres depuis le
    coin haut-gauche de la zone. `image` n'existe qu'une fois signé. */
export type Pose = {
  cle: string; // `sig:<userId>` | `sig:entreprise` | 'tampon'
  x: number;
  y: number;
  image?: string; // data:image/png — gardée dans le document signé
  signeLe?: string;
  signePar?: string; // userId de qui a posé
};

export type SignataireDuDoc = { userId: string; nom: string; qualite: string };

export type Piece = {
  id: string;
  genre: 'piece';
  branchId: string;
  entite: Entite;
  entrepriseId?: string;
  /** Le compte qui a créé le document. */
  auteurId: string;
  modele: string;
  titre: string;
  numero?: string; // donné à la signature complète
  lieu: string;
  date: string; // AAAA-MM-JJ
  destinataire: string; // plusieurs lignes
  objet: string;
  appel: string;
  corps: string; // paragraphes séparés par une ligne vide
  cloture: string;
  signataires: SignataireDuDoc[];
  poses: Pose[];
  tampon?: string; // clé d'un tampon (TAMPONS) ou 'auto' (autre entreprise)
  cadre: Cadre;
  etat: EtatPiece;
  remplace?: string;
  aRelire?: boolean; // modèle juridique non encore relu
  creeLe: string;
  signeLe?: string;
};

export type Entreprise = {
  id: string;
  genre: 'entreprise';
  branchId: string;
  entite: 'autre';
  nom: string;
  mentions: string; // RCCM, IFU, adresse, courriel
  telephone: string;
  signataire: string; // « Le Gérant, Nom »
  /** La signature de son signataire, dessinée ou importée (PNG). */
  signature?: string;
  creeLe: string;
};

export type Signataire = {
  id: string; // `sig-<userId>`
  genre: 'signataire';
  branchId: string;
  entite: 'mnd';
  userId: string;
  nom: string;
  qualite: string;
  aSaSignature: boolean;
};

export type Profil = {
  id: string; // `prof-<userId>`
  genre: 'profil';
  branchId: string;
  entite: 'perso';
  userId: string;
  nom: string;
  adresse: string;
  telephone: string;
};

export type LigneSecretariat = Piece | Entreprise | Signataire | Profil;

/* ══ LES FORMULES, PRÉ-REMPLIES ══════════════════════════════════════ */

export const APPELS = [
  'Madame, Monsieur,', 'Madame,', 'Monsieur,', 'Madame la Directrice,', 'Monsieur le Directeur,',
  'Madame la Directrice générale,', 'Monsieur le Directeur général,', 'Chère Madame,', 'Cher Monsieur,', 'Bonjour,',
] as const;

const CLOTURES = [
  { nous: 'Nous vous prions d’agréer, {appel}, l’expression de nos salutations distinguées.', je: 'Je vous prie d’agréer, {appel}, l’expression de mes salutations distinguées.' },
  { nous: 'Nous vous prions d’agréer, {appel}, l’expression de notre haute considération.', je: 'Je vous prie d’agréer, {appel}, l’expression de ma haute considération.' },
  { nous: 'Veuillez agréer, {appel}, l’assurance de nos sentiments respectueux.', je: 'Veuillez agréer, {appel}, l’assurance de mes sentiments respectueux.' },
  { nous: 'Dans l’attente de votre retour, nous vous prions d’agréer, {appel}, nos sincères salutations.', je: 'Dans l’attente de votre retour, je vous prie d’agréer, {appel}, mes sincères salutations.' },
  { nous: 'Nous vous remercions de l’attention portée à notre demande et restons à votre disposition.', je: 'Je vous remercie de l’attention portée à ma demande et reste à votre disposition.' },
  { nous: 'Avec nos remerciements, bien cordialement.', je: 'Avec mes remerciements, bien cordialement.' },
  { nous: 'Cordialement.', je: 'Cordialement.' },
] as const;

/** La politesse reprend l'appel choisi (« Monsieur le Directeur ») ; elle
    parle en « je » sur une lettre personnelle, en « nous » pour une
    entreprise. « Bonjour » ne se répète pas dans une formule. */
export function clotures(appel: string, entite: Entite): string[] {
  const a = appel.replace(/,\s*$/, '').trim();
  const dansLaFormule = !a || /^bonjour$/i.test(a) ? 'Madame, Monsieur' : a;
  const personne = entite === 'perso' ? 'je' : 'nous';
  return CLOTURES.map((c) => c[personne].replace('{appel}', dansLaFormule));
}

/* ══ LA NUMÉROTATION : UNE SÉRIE PAR NOM ═════════════════════════════ */

const MOTS_VIDES = /^(sarl|sa|sas|sasu|suarl|ei|et|de|du|la|le|les|des|d|l)$/i;

/** « Nouvelle Société SARL » → « NS ». Deux à quatre lettres, jamais vide. */
export function sigle(nom: string): string {
  const mots = (nom.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-z0-9]+/g) ?? []).filter((m) => !MOTS_VIDES.test(m));
  const s = mots.map((m) => m[0].toUpperCase()).join('').slice(0, 4);
  return s.length >= 2 ? s : (mots[0] ?? 'XX').slice(0, 3).toUpperCase().padEnd(2, 'X');
}

/** Le préfixe de la série d'un document. Elles ne se mêlent jamais. */
export function prefixeDeSerie(p: Pick<Piece, 'entite' | 'entrepriseId'>, o: { entreprise?: Pick<Entreprise, 'nom'>; auteurNom?: string }): string {
  if (p.entite === 'mnd') return 'MND-DOC';
  if (p.entite === 'acia') return 'ACIA';
  if (p.entite === 'autre') return sigle(o.entreprise?.nom ?? 'XX');
  return `PERSO-${sigle(o.auteurNom ?? 'XX').slice(0, 2)}`;
}

/** Le prochain numéro de la série, ancré : « MND-DOC-2026-012 ». Un numéro
    d'une autre série ou d'une autre année ne nourrit jamais le compteur. */
export function prochainNumero(prefixe: string, annee: number, existants: readonly (string | undefined)[]): string {
  const motif = new RegExp(`^${prefixe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${annee}-(\\d+)$`);
  let max = 0;
  for (const n of existants) {
    const m = motif.exec(n ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefixe}-${annee}-${String(max + 1).padStart(3, '0')}`;
}

/* ══ LA ZONE DE SIGNATURE ════════════════════════════════════════════ */

/** La zone : toute la largeur utile, 46 mm de haut, juste après la politesse. */
export const ZONE = { largeur: 174, hauteur: 46 } as const;
export const SIGNATURE_MM = { largeur: 42, hauteur: 16 } as const;
export const TAMPON_MM = 34;

/** Les cadres : un clic range signatures, nom et tampon. */
export function rangeDansLeCadre(cadre: Cadre, cles: readonly string[]): Pose[] {
  const debut = cadre === 'gauche' ? 0 : cadre === 'centre' ? 46 : 92; // le cadre fait 82 mm
  const signatures = cles.filter((c) => c.startsWith('sig:'));
  const n = signatures.length;
  /* PLUSIEURS SIGNATAIRES : une colonne chacun, son nom dessous (vu le
     6 octobre : décalées de 22 mm, deux signatures de 42 mm se couvraient).
     La première colonne recule pour que la dernière tienne dans la zone. */
  const pas = n > 1 ? Math.min(COLONNE, (ZONE.largeur - SIGNATURE_MM.largeur) / (n - 1)) : COLONNE;
  const x0 = Math.max(0, Math.min(debut + 2, ZONE.largeur - SIGNATURE_MM.largeur - (n - 1) * pas));
  const poses: Pose[] = signatures.map((cle, i) => ({ cle, x: x0 + i * pas, y: 2 }));
  if (cles.includes('tampon')) {
    /* Seul, le tampon ferme le cadre à droite. À plusieurs, il se met à
       côté des colonnes, jamais sur un nom : après la dernière, sinon avant
       la première. */
    let x = debut + 82 - TAMPON_MM - 2;
    if (n > 1) {
      const apres = x0 + (n - 1) * pas + COLONNE;
      const avant = x0 - TAMPON_MM - 4;
      x = apres + TAMPON_MM <= ZONE.largeur ? apres : avant >= 0 ? avant : x0 + (n - 1) * pas + 8;
    }
    poses.push({ cle: 'tampon', x: Math.min(x, ZONE.largeur - TAMPON_MM), y: 4 });
  }
  return poses;
}

/** Une pose déplacée à la main reste dans la zone. */
export const borneDansLaZone = (p: Pose): Pose => {
  const w = p.cle === 'tampon' ? TAMPON_MM : SIGNATURE_MM.largeur;
  const h = p.cle === 'tampon' ? TAMPON_MM : SIGNATURE_MM.hauteur;
  return { ...p, x: Math.min(Math.max(0, p.x), ZONE.largeur - w), y: Math.min(Math.max(0, p.y), ZONE.hauteur - h) };
};

/** Le nom du signataire, sous la zone : à gauche du cadre choisi. */
export const xDuNom = (cadre: Cadre): number => (cadre === 'gauche' ? 2 : cadre === 'centre' ? 48 : 94);

/** La largeur d'une colonne de signataire, nom compris. */
export const COLONNE = 46;
/** Les noms s'écrivent à 26 mm du haut de la zone. */
export const Y_DES_NOMS = 26;

/** OÙ S'ÉCRIT CHAQUE NOM. Plusieurs signataires : chacun sous SA signature,
    en colonnes. Un seul : sous le cadre choisi (ou sous la signature, posée
    à la main). L'aperçu et le PDF lisent tous deux cette réponse. */
export function nomsDansLaZone(
  p: Pick<Piece, 'poses' | 'cadre' | 'signataires'>,
  noms: readonly { nom: string; qualite: string }[],
): { colonnes: boolean; noms: { nom: string; qualite: string; x: number }[]; xEntite: number } {
  const borne = (x: number) => Math.max(0, Math.min(x, ZONE.largeur - 40));
  if (noms.length > 1 && p.signataires.length === noms.length) {
    const places = noms.map((n, i) => {
      const q = p.poses.find((x) => x.cle === `sig:${p.signataires[i].userId}`);
      return { ...n, x: borne(q?.x ?? i * COLONNE) };
    });
    return { colonnes: true, noms: places, xEntite: Math.min(...places.map((x) => x.x)) };
  }
  const premiere = p.poses.filter((q) => q.cle.startsWith('sig:')).sort((a, b) => a.x - b.x)[0];
  const x = p.cadre === 'libre' ? borne(premiere?.x ?? xDuNom('droite')) : xDuNom(p.cadre);
  return { colonnes: false, noms: noms.map((n) => ({ ...n, x })), xEntite: x };
}

/* ══ LA VIE D'UN DOCUMENT ════════════════════════════════════════════ */

/** Le texte est-il encore modifiable ? Non dès la première signature. */
export const modifiable = (p: Pick<Piece, 'etat'>): boolean => p.etat === 'brouillon';

/** Qui doit encore signer. */
export const restentASigner = (p: Pick<Piece, 'signataires' | 'poses'>): SignataireDuDoc[] =>
  p.signataires.filter((s) => !p.poses.some((q) => q.cle === `sig:${s.userId}` && q.image));

/** Ce compte peut-il poser une signature ? Seulement la sienne, et seulement
    s'il est attendu et ne l'a pas déjà posée. */
export function peutSigner(p: Pick<Piece, 'signataires' | 'poses' | 'etat'>, userId: string | undefined): boolean {
  if (!userId || p.etat === 'signe' || p.etat === 'annule') return false;
  return restentASigner(p).some((s) => s.userId === userId);
}

/** Pose la signature de `userId` (et rien d'autre). Rend le document mis à
    jour : « a-signer » tant qu'il en manque, « signe » quand tout y est. */
export function signe(p: Piece, userId: string, image: string, quand: string): Piece {
  if (!peutSigner(p, userId)) return p;
  const cle = `sig:${userId}`;
  const ici = p.poses.find((q) => q.cle === cle) ?? rangeDansLeCadre(p.cadre === 'libre' ? 'droite' : p.cadre, [cle])[0];
  const poses = [...p.poses.filter((q) => q.cle !== cle), { ...ici, cle, image, signeLe: quand, signePar: userId }];
  const suite: Piece = { ...p, poses };
  const complet = restentASigner(suite).length === 0;
  return { ...suite, etat: complet ? 'signe' : 'a-signer', signeLe: complet ? quand : p.signeLe };
}

/** Un document sans signataire se finalise sans signature (une note). */
export const finalisableSansSignature = (p: Pick<Piece, 'signataires' | 'etat'>): boolean =>
  p.signataires.length === 0 && p.etat === 'brouillon';

/** Annuler les signatures : le document redevient un brouillon, sans images. */
export const retireLesSignatures = (p: Piece): Piece => ({
  ...p, etat: 'brouillon', signeLe: undefined, numero: undefined,
  poses: p.poses.map(({ image: _i, signeLe: _s, signePar: _p, ...reste }) => reste),
});

/** Le paragraphe du corps : une ligne vide sépare les paragraphes. */
export const paragraphes = (corps: string): string[] =>
  corps.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** « 2026-10-06 » → « 6 octobre 2026 ». */
export function dateDite(iso: string): string {
  const [a, m, j] = (iso ?? '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !j) return iso;
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
}

/* ══ L'EN-TÊTE DE CHAQUE ENTITÉ ══════════════════════════════════════

   UNE ENTITÉ, UN MONDE. ACIA 1 ne porte ni le verrou, ni la devise, ni le
   nom de Maison MND (Bureau / ACIA 1, choix du 6 octobre). La lettre
   personnelle n'a ni en-tête d'entreprise ni pied : les coordonnées de
   son auteur, en haut à gauche. */
export type EnTete = {
  entite: Entite;
  nom: string;
  /** Le verrou couché de Maison MND en tête. */
  verrou: boolean;
  /** Les mentions sous le nom (ACIA 1, autre entreprise). */
  lignes: string[];
  /** Les coordonnées de l'expéditeur (lettre personnelle). */
  expediteur: string[];
  pied: string[];
  /** La devise de la Maison en pied (Maison MND seulement). */
  devise: boolean;
  encre: string;
  ville: string;
};

export const ACIA = {
  nom: 'ACIA 1',
  rccm: 'RB/COT/12 A 14509',
  adresse: 'Quartier Suru-Léré, 06 BP 2076, Cotonou, Bénin',
  telephone: '+229 01 51 99 77 99',
  courriel: 'direction@maisonmnd.com',
} as const;

export function enTeteDe(
  entite: Entite,
  o: { nomMaison: string; entreprise?: Pick<Entreprise, 'nom' | 'mentions' | 'telephone'>; profil?: Pick<Profil, 'nom' | 'adresse' | 'telephone'> },
): EnTete {
  if (entite === 'mnd') {
    return {
      entite, nom: o.nomMaison, verrou: true, lignes: [], expediteur: [], devise: true, encre: '#1E2150', ville: 'Cotonou',
      pied: [`${o.nomMaison} · Cotonou, Bénin · +229 01 51 99 77 99 · direction@maisonmnd.com`],
    };
  }
  if (entite === 'acia') {
    return {
      entite, nom: ACIA.nom, verrou: false, devise: false, encre: '#1F3F7A', ville: 'Cotonou', expediteur: [],
      lignes: [`RCCM ${ACIA.rccm} · ${ACIA.adresse}`, `Tél. ${ACIA.telephone} · ${ACIA.courriel}`],
      pied: [`${ACIA.nom} · RCCM ${ACIA.rccm} · Cotonou, Bénin`],
    };
  }
  if (entite === 'autre') {
    const e = o.entreprise ?? { nom: 'Entreprise', mentions: '', telephone: '' };
    const mentions = [e.mentions.trim(), e.telephone.trim() ? `Tél. ${e.telephone.trim()}` : ''].filter(Boolean).join(' · ');
    return {
      entite, nom: e.nom.trim() || 'Entreprise', verrou: false, devise: false, encre: '#23262B', expediteur: [],
      ville: villeDe(e.mentions) || 'Cotonou',
      lignes: mentions ? [mentions] : [], pied: [[e.nom.trim(), mentions].filter(Boolean).join(' · ')],
    };
  }
  const p = o.profil ?? { nom: '', adresse: '', telephone: '' };
  return {
    entite, nom: p.nom.trim(), verrou: false, devise: false, encre: '#23262B', lignes: [], pied: [],
    ville: villeDe(p.adresse) || 'Cotonou',
    expediteur: [p.nom.trim(), p.adresse.trim(), p.telephone.trim() ? `Tél. ${p.telephone.trim()}` : ''].filter(Boolean),
  };
}

/** « Quartier X, Cotonou, Bénin » → « Cotonou ». */
export function villeDe(adresse: string): string {
  const morceaux = (adresse ?? '').split(/[,·]/).map((m) => m.trim()).filter(Boolean)
    .filter((m) => !/^(bénin|benin|\d.*bp.*|.*\bbp\b.*|quartier.*|ilot.*|rccm.*|ifu.*|.*@.*)$/i.test(m));
  return morceaux.pop() ?? '';
}

/** La taille d'un tampon dans la zone (mm), selon sa forme : rond ou carré
    à 34 mm ; un cachet en longueur prend plus de large, moins de haut. */
export function dimsDuTampon(ratio: number): { l: number; h: number } {
  if (ratio <= 1.05) return { l: TAMPON_MM, h: TAMPON_MM };
  const l = Math.min(TAMPON_MM * 1.45, ZONE.largeur);
  return { l, h: l / ratio };
}

/** La mise en page commune à l'écran et au PDF (mm, page A4). */
export const PAGE = {
  largeur: 210, hauteur: 297, marge: 18, utile: 174,
  corpsPt: 10.5, ligne: 5.2, xDestinataire: 105, basDuTexte: 268, piedY: 282,
} as const;
