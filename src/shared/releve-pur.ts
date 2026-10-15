import { nombreEnChiffres } from './lettres';
import { PARCOURS_MND, type ParcoursMND } from './parcours';

/* ══ LA RELÈVE MND — 15 octobre 2026 ═════════════════════════════════
   « Les jeunes filles arrêtent l'école en 6e ou en 4e, font trois ou cinq
   ans d'atelier, obtiennent un diplôme et restent incompétentes sur le
   marché… La Maison MND est une marque premium : nous recherchons et
   formons des élites » (Yéman). Maquette `maquette-les-apprenties.html`
   (DPakEb4g…), choix cochés le 15 octobre 2026 : le nom « La Relève MND »,
   la page sur le site de l'Académie, deux ans avec une expérience ou trois
   ans pour une débutante, le CEP au moins, une promotion de quatre, la
   rentrée d'avril 2027, une allocation de 15 000, 25 000 puis 35 000 F, une
   proposition d'embauche sans obligation, pas de photos, et le public
   « jeunes femmes de 18 à 23 ans » DIT dans l'annonce, jamais appliqué
   d'office : l'article 4 du Code du travail interdit de tenir compte du sexe
   ou de l'âge pour embaucher ou former (l'article 1 l'applique aux
   apprentis). Le questionnaire ne demande donc pas le sexe, et l'âge s'y
   dit sans rien refuser.

   CE FICHIER EST PUR : le site de l'Académie, le Trône et le banc lisent
   les mêmes règles. La base (0131) tient sa propre garde, plus large.

   D'ABORD UN PARCOURS PAYANT (15 octobre 2026, au sélecteur) : « comme une
   inscription dans une école, elle est d'abord payante » (Yéman). Le
   dossier, l'appel et l'entretien sont gratuits ; les candidates retenues à
   l'entretien suivent la FONDATION de l'Académie, payante, qui remplace la
   semaine d'immersion, et l'essai pratique la clôt. Pendant l'apprentissage
   lui-même, l'apprentie ne paie rien : la Maison lui verse l'allocation. */

export const NOM_DE_LA_RELEVE = 'La Relève MND';
/** Le parcours payant d'abord : la Fondation (Palier I), lue dans la semence des parcours, son prix compris. */
export const PARCOURS_D_ENTREE = 'fondation';
export const parcoursDEntree = (): ParcoursMND | undefined => PARCOURS_MND.find((p) => p.id === PARCOURS_D_ENTREE);
/** La boîte où le site dépose un dossier : écriture seule, jamais relue du
    public (0131). Le Trône la vide dans le Recrutement. */
export const TABLE_DE_LA_RELEVE = 'releve_candidatures';

export type Promotion = { cle: string; dit: string; rentree: string; jusquau: string; places: number };
/** La promotion ouverte. Changer de promotion : une ligne ici, et le site
    se reconstruit. */
export const PROMOTION: Promotion = { cle: '2027-04', dit: 'avril 2027', rentree: '2027-04-05', jusquau: '2027-01-31', places: 4 };
/** Le public visé, DIT dans l'annonce (art. 4 : jamais une condition). */
export const AGE_VISE = { min: 18, max: 23 } as const;

export const CLASSES = ['CI à CM2', '6e', '5e', '4e', '3e', '2nde', '1ère', 'Terminale', 'Université', 'Formation professionnelle'] as const;
/** Le CEP au moins (choix du 15 octobre 2026) : « Aucun » ne part pas. */
export const DIPLOMES = ['CEP', 'BEPC', 'BAC', 'Licence ou plus', 'CQM ou CQP', 'Autre', 'Aucun'] as const;
export const DIPLOME_INSUFFISANT = 'Aucun';
export const LANGUES = ['Français', 'Fon', 'Yoruba', 'Mina', 'Anglais'] as const;
export const GESTES_DEJA = ['Shampoing et soins', 'Tresses et nattes', 'Tissage', 'Entretien de locks', 'Création de locks', 'Coloration', 'Rien encore'] as const;
export const SOURCES_DE_LA_RELEVE = ['Instagram', 'Facebook', 'Une cliente', 'Une personne de la Maison', 'Autre'] as const;

export type DejaApprentie = 'non' | 'en-cours' | 'termine';
export type DossierReleve = {
  prenom: string; nom: string; naissance: string; quartier: string; telephone: string; email?: string; source?: string;
  classe: string; diplome: string; arretLe?: string; langues: string[]; pourquoiArret?: string;
  deja: DejaApprentie | ''; dureeExperience?: string; ou?: string; gestes: string[]; autreTravail?: string;
  motivations: { coiffure: string; maison: string; cinqAns: string };
  raisons: { qualite: string; difficulte: string };
  /** Pour combien de temps elle est disponible (15 octobre 2026 : deux ans ou trois ans, rien d'autre). */
  disponibilite: 'deux-ans' | 'trois-ans' | '';
  lettre: string;
  engagements: { tenue: boolean; lettre: boolean; garde: boolean };
};

export const dossierVide = (): DossierReleve => ({
  prenom: '', nom: '', naissance: '', quartier: '', telephone: '', classe: '', diplome: '', langues: [],
  deja: '', gestes: [], motivations: { coiffure: '', maison: '', cinqAns: '' }, raisons: { qualite: '', difficulte: '' },
  disponibilite: '', lettre: '', engagements: { tenue: false, lettre: false, garde: false },
});

/** Les signes demandés au moins : quelques phrases, pas un mot. */
export const MINIMA = { coiffure: 80, maison: 80, cinqAns: 60, qualite: 60, difficulte: 60 } as const;
export const LETTRE = { min: 150, max: 400 } as const;
export const PAS_DU_DOSSIER = ['Vous', 'Parcours', 'Expérience', 'Motivations', 'Pourquoi vous', 'Lettre'] as const;
/** Combien de temps la Maison garde un dossier (dit dans le consentement). */
export const GARDE_DU_DOSSIER_MOIS = 12;

export const motsDe = (t: string | undefined): number => (String(t ?? '').match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
const signes = (t: string | undefined): number => String(t ?? '').trim().length;

/** L'âge révolu à une date (AAAA-MM-JJ) ; null si la date de naissance ne se lit pas. */
export function ageAu(naissance: string, jour: string): number | null {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance ?? '');
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour ?? '');
  if (!n || !j) return null;
  let a = Number(j[1]) - Number(n[1]);
  if (Number(j[2]) < Number(n[2]) || (j[2] === n[2] && Number(j[3]) < Number(n[3]))) a -= 1;
  return a;
}
export const ageALaRentree = (naissance: string, p: Promotion = PROMOTION): number | null => ageAu(naissance, p.rentree);

/** Ce que l'écran dit de l'âge : une information, JAMAIS un refus (art. 4). */
export function ditLAge(naissance: string, p: Promotion = PROMOTION): string {
  const a = ageALaRentree(naissance, p);
  if (a === null) return '';
  if (a >= AGE_VISE.min && a <= AGE_VISE.max) return `Vous aurez ${a} ans à la rentrée, en ${p.dit}.`;
  return `Vous aurez ${a} ans à la rentrée, en ${p.dit}. La Relève s’adresse surtout aux 18 à 23 ans ; votre dossier sera lu.`;
}

/** Une date de naissance plausible : 14 ans au moins (art. 66), pas plus de 60. */
const naissancePlausible = (naissance: string, p: Promotion): boolean => {
  const a = ageALaRentree(naissance, p);
  return a !== null && a >= 14 && a <= 60;
};

export const candidaturesOuvertes = (jour: string, p: Promotion = PROMOTION): boolean => !!jour && jour <= p.jusquau;
export const telephoneSuffit = (t: string): boolean => String(t ?? '').replace(/\D/g, '').length >= 8;

/** Ce qui manque à un pas du questionnaire ; '' s'il est complet. */
export function manqueAuPas(d: DossierReleve, pas: number, p: Promotion = PROMOTION): string {
  if (pas === 0) {
    if (!d.prenom.trim() || !d.nom.trim()) return 'Écrivez votre prénom et votre nom.';
    if (!d.naissance) return 'Il nous faut votre date de naissance.';
    if (!naissancePlausible(d.naissance, p)) return 'Vérifiez votre date de naissance.';
    if (!d.quartier.trim()) return 'Dites-nous où vous habitez.';
    if (!telephoneSuffit(d.telephone)) return 'Il nous faut votre numéro WhatsApp pour vous répondre.';
    return '';
  }
  if (pas === 1) {
    if (!d.classe || !d.diplome) return 'Choisissez votre dernière classe et votre diplôme le plus haut.';
    if (d.diplome === DIPLOME_INSUFFISANT) return 'La Relève demande le CEP au moins. Le jour où vous l’aurez, votre candidature sera la bienvenue.';
    return '';
  }
  if (pas === 2) return d.deja ? '' : 'Dites-nous si vous avez déjà appris chez une coiffeuse.';
  if (pas === 3) {
    const m = d.motivations;
    return signes(m.coiffure) < MINIMA.coiffure || signes(m.maison) < MINIMA.maison || signes(m.cinqAns) < MINIMA.cinqAns
      ? 'Une réponse est encore trop courte : quelques phrases pour chacune.' : '';
  }
  if (pas === 4) {
    if (signes(d.raisons.qualite) < MINIMA.qualite || signes(d.raisons.difficulte) < MINIMA.difficulte) return 'Une réponse est encore trop courte : quelques phrases pour chacune.';
    if (!d.disponibilite) return 'Dites-nous pour combien de temps vous êtes disponible.';
    if (!d.engagements.tenue) return 'Cochez l’engagement pour continuer.';
    return '';
  }
  if (pas === 5) {
    const n = motsDe(d.lettre);
    if (n < LETTRE.min) return `Votre lettre fait ${n} mots : ${LETTRE.min} au moins.`;
    if (n > LETTRE.max) return `Votre lettre fait ${n} mots : ${LETTRE.max} au plus.`;
    if (!d.engagements.lettre || !d.engagements.garde) return 'Cochez les deux cases pour envoyer.';
    return '';
  }
  return '';
}
/** Le premier manque du dossier entier ; '' : il peut partir. */
export const manqueAuDossier = (d: DossierReleve, p: Promotion = PROMOTION): string =>
  PAS_DU_DOSSIER.map((_, i) => manqueAuPas(d, i, p)).find(Boolean) ?? '';

/* ── LE DOSSIER, NETTOYÉ ──
   Ce qui part au serveur, et ce que le Trône relit d'une boîte publique :
   des chaînes bornées, des listes connues. Une ligne qui ne se lit pas
   rend null. */
const ch = (v: unknown, max: number): string => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const liste = (v: unknown, connus: readonly string[]): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter((x) => connus.includes(x)))] : [];
export function dossierNettoye(brut: unknown): DossierReleve | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as Record<string, unknown>;
  const m = (b.motivations ?? {}) as Record<string, unknown>;
  const r = (b.raisons ?? {}) as Record<string, unknown>;
  const e = (b.engagements ?? {}) as Record<string, unknown>;
  const d: DossierReleve = {
    prenom: ch(b.prenom, 60), nom: ch(b.nom, 60), naissance: /^\d{4}-\d{2}-\d{2}$/.test(String(b.naissance ?? '')) ? String(b.naissance) : '',
    quartier: ch(b.quartier, 120), telephone: ch(b.telephone, 30),
    ...(ch(b.email, 120) ? { email: ch(b.email, 120) } : {}),
    ...(ch(b.source, 60) ? { source: ch(b.source, 60) } : {}),
    classe: ch(b.classe, 40), diplome: ch(b.diplome, 40),
    ...(ch(b.arretLe, 10) ? { arretLe: ch(b.arretLe, 10) } : {}),
    langues: liste(b.langues, LANGUES),
    ...(ch(b.pourquoiArret, 1000) ? { pourquoiArret: ch(b.pourquoiArret, 1000) } : {}),
    deja: b.deja === 'non' || b.deja === 'en-cours' || b.deja === 'termine' ? b.deja : '',
    ...(ch(b.dureeExperience, 60) ? { dureeExperience: ch(b.dureeExperience, 60) } : {}),
    ...(ch(b.ou, 160) ? { ou: ch(b.ou, 160) } : {}),
    gestes: liste(b.gestes, GESTES_DEJA),
    ...(ch(b.autreTravail, 1000) ? { autreTravail: ch(b.autreTravail, 1000) } : {}),
    motivations: { coiffure: ch(m.coiffure, 1500), maison: ch(m.maison, 1500), cinqAns: ch(m.cinqAns, 1500) },
    raisons: { qualite: ch(r.qualite, 1500), difficulte: ch(r.difficulte, 1500) },
    disponibilite: b.disponibilite === 'deux-ans' || b.disponibilite === 'trois-ans' ? b.disponibilite : '',
    lettre: ch(b.lettre, 6000),
    engagements: { tenue: e.tenue === true, lettre: e.lettre === true, garde: e.garde === true },
  };
  return d.prenom && d.nom && telephoneSuffit(d.telephone) ? d : null;
}
export const nomEntierDuDossier = (d: Pick<DossierReleve, 'prenom' | 'nom'>): string => `${d.prenom.trim()} ${d.nom.trim()}`.trim();

/* ── LA GRILLE DE SÉLECTION, SUR 100 ── */
export type CleDeNote = 'dossier' | 'appel' | 'entretien' | 'fondation' | 'essai';
export const GRILLE: readonly { cle: CleDeNote; dit: string; sur: number }[] = [
  { cle: 'dossier', dit: 'Le dossier en ligne', sur: 20 },
  { cle: 'appel', dit: 'L’appel', sur: 10 },
  { cle: 'entretien', dit: 'L’entretien et l’écrit', sur: 25 },
  { cle: 'fondation', dit: 'La Fondation à l’Académie', sur: 20 },
  { cle: 'essai', dit: 'L’essai pratique, qui clôt la Fondation', sur: 25 },
];
export const SEUIL_DE_LA_RELEVE = 70;
export type Notes = Partial<Record<CleDeNote, number>>;
const borne = (n: unknown, sur: number): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(sur, Math.max(0, n)) : null;
export const totalDeLaGrille = (notes: Notes | undefined): number =>
  GRILLE.reduce((t, g) => t + (borne(notes?.[g.cle], g.sur) ?? 0), 0);
export const grilleComplete = (notes: Notes | undefined): boolean => GRILLE.every((g) => borne(notes?.[g.cle], g.sur) !== null);
export const seuilDe = (r?: { seuil?: number }): number =>
  typeof r?.seuil === 'number' && r.seuil > 0 && r.seuil <= 100 ? r.seuil : SEUIL_DE_LA_RELEVE;
/** Le contrat ne se prépare qu'une grille complète, au seuil ou au-dessus. */
export const contratPossible = (notes: Notes | undefined, seuil: number = SEUIL_DE_LA_RELEVE): boolean =>
  grilleComplete(notes) && totalDeLaGrille(notes) >= seuil;

/** Deux ans avec une expérience terminée ou un CQM, trois pour une débutante : une PROPOSITION, la direction tranche. */
export const parcoursPropose = (d: Pick<DossierReleve, 'deja' | 'diplome'>): 2 | 3 =>
  d.deja === 'termine' || d.diplome === 'CQM ou CQP' ? 2 : 3;

/* ── L'ALLOCATION ── */
export const ALLOCATIONS_PROPOSEES: readonly [number, number, number] = [15000, 25000, 35000];
export function allocationsDe(r?: { allocations?: number[] }): [number, number, number] {
  const a = r?.allocations;
  return Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === 'number' && x > 0)
    ? [a[0], a[1], a[2]] : [...ALLOCATIONS_PROPOSEES];
}
export function allocationDite(a: readonly number[], duree: 2 | 3): string {
  const f = (x: number) => `${nombreEnChiffres(x)} F`;
  return duree === 2
    ? `${f(a[0])} par mois la première année, puis ${f(a[1])} la deuxième`
    : `${f(a[0])} par mois la première année, ${f(a[1])} la deuxième, puis ${f(a[2])} la troisième`;
}

/* ── LE CONTRAT, REMPLI DEPUIS LE DOSSIER ── */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 14 mars 2005 » : l'année toujours (règle de la Maison). */
export const dateLongue = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : iso;
};
export function remplisLeContratDApprentissage(texte: string, v: {
  nomEntier: string; naissance: string; domicile: string; duree: 2 | 3; allocations: readonly number[];
}): string {
  return (texte ?? '')
    .replace(/\[NOM ET PRÉNOMS DE L’APPRENTIE\]/g, v.nomEntier || '[NOM ET PRÉNOMS DE L’APPRENTIE]')
    .replace(/\[DATE DE NAISSANCE\]/g, v.naissance ? dateLongue(v.naissance) : '[DATE DE NAISSANCE]')
    .replace(/\[DOMICILE DE L’APPRENTIE\]/g, v.domicile || '[DOMICILE DE L’APPRENTIE]')
    .replace(/\[DURÉE\]/g, v.duree === 2 ? 'deux ans' : 'trois ans')
    .replace(/\[ALLOCATION\]/g, allocationDite(v.allocations, v.duree));
}

/* ── CE QUE LE TRÔNE GARDE D'UNE CANDIDATURE DE LA RELÈVE ── */
export type CleDePiece = 'casier' | 'naissance' | 'medical' | 'exemplaires';
/** Les pièces jointes à la demande de visa (art. 68). */
export const PIECES_DU_VISA: readonly { cle: CleDePiece; dit: string }[] = [
  { cle: 'casier', dit: 'Extrait du casier judiciaire du maître d’apprentissage, de moins de trois mois' },
  { cle: 'naissance', dit: 'Acte de naissance de l’apprentie, ou jugement supplétif' },
  { cle: 'medical', dit: 'Certificat médical d’aptitude de l’apprentie' },
  { cle: 'exemplaires', dit: 'Les quatre exemplaires du contrat, signés' },
];
export type ReleveDeLaCandidature = {
  promotion: string;
  dossier: DossierReleve;
  notes?: Notes;
  duree?: 2 | 3;
  contratId?: string;
  pieces?: Partial<Record<CleDePiece, boolean>>;
  deposeLe?: string;
  viseLe?: string;
};
/** L'identifiant posé depuis celui de la boîte : deux postes ouverts ne font pas deux candidatures. */
export const idDeLaCandidatureReleve = (idDeLaBoite: string): string => `rh-can-releve-${idDeLaBoite}`;
export const idDuPosteReleve = (p: Promotion = PROMOTION): string => `rh-pos-releve-${p.cle}`;
export const titreDuPosteReleve = (p: Promotion = PROMOTION): string => `${NOM_DE_LA_RELEVE} · promotion ${p.dit}`;

/** La ligne d'une fichette : l'âge à la rentrée, le diplôme, le total s'il y en a un. */
export function resumeDeLaReleve(r: Pick<ReleveDeLaCandidature, 'dossier' | 'notes'>, p: Promotion = PROMOTION): string {
  const a = ageALaRentree(r.dossier.naissance, p);
  const t = r.notes && Object.keys(r.notes).length ? ` · ${totalDeLaGrille(r.notes)} points` : '';
  return `${NOM_DE_LA_RELEVE} · ${a !== null ? `${a} ans · ` : ''}${r.dossier.diplome || 'diplôme non dit'}${t}`;
}
