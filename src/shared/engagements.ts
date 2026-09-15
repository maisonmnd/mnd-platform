import { createStore, useStore, uid } from './store';
import { bindCollection } from './sync';
import { signatureInvalide, type SignatureTracee } from './contrats';
import { nombreEnLettres, nombreEnChiffres } from './lettres';
import type { Expense, PieceJointe } from './finance';

/* ══ LES ENGAGEMENTS — 15 septembre 2026 ═════════════════════════════════

   « Un prestataire menuisier veut me réaliser un devis immobilier pour le
   salon de coiffure. Où stocker mes devis, mes validations et les avances
   reçues avec signature et décharge. Réserve un espace pour télécharger la
   carte d'identité » (Yéman). Maquette `public/maquette-les-engagements.html`,
   validée.

   LE TRÔNE SAVAIT TRÈS BIEN CE QUI ENTRE, et rien de ce qui SORT vers un
   prestataire n'avait de dossier. Le devis vivait dans un téléphone, l'avance
   dans une dépense sans nom, la décharge sur un papier qu'on ne retrouverait
   pas. Un engagement, c'est ces trois choses ensemble.

   TOUT PRESTATAIRE QUI ENGAGE LA MAISON (décision du 15 septembre) : le
   menuisier, l'imprimeur, le photographe, l'électricien. Le besoin est le
   même à chaque fois — un devis, un oui, des avances, une décharge — et un
   dossier par métier se serait multiplié.

   CE FICHIER EST PUR. Il juge : ce qui est retenu, ce qui est versé, ce qui
   reste, ce qui manque. Le coffre des pièces vit à part
   (`engagements-coffre.ts`), parce qu'un fichier qui se dépose n'a rien à
   faire dans un harnais qui éprouve des sommes.

   AUCUN ÉTAT DE L'ARGENT N'EST STOCKÉ. « Soldé », « reste à payer »,
   « dépassement » se DÉRIVENT des devis et des versements. Un « soldé » écrit
   à côté de ses versements finit toujours par les contredire — la Maison a
   déjà payé cette leçon sur l'échéancier des abonnements. */

/* ══ LES FORMES ══════════════════════════════════════════════════════════ */

/** Une pièce rangée au dossier : qui l'a déposée, et quand. */
export type PieceDuDossier = PieceJointe & { deposeLe: string; deposePar?: string };

export type Engagement = {
  id: string;
  branchId: string;
  /** ENG-2026-004 — posé à la création, jamais réécrit. */
  numero: string;
  /** La fiche fournisseur, quand il en a une. Absente = un nom seul. */
  fournisseurId?: string;
  /** Le nom du prestataire, tel qu'il signera la décharge. */
  prestataire: string;
  /** « menuisier », « imprimeur » — il s'écrit dans la décharge. */
  metier?: string;
  /** « agencement du salon » — ce que la Maison commande. */
  objet: string;
  creeLe: string;
  creePar?: string;
  note?: string;
  /** Un dossier abandonné ne se solde jamais ; il se ferme. */
  abandonneLe?: string;
  /** LA PIÈCE D'IDENTITÉ — direction seule, dans le coffre. Voir
      `effacementDeLIdentite` : on la garde parce qu'elle sert, et pas plus. */
  identite?: PieceDuDossier;
  /** CE QU'ON RANGE À CÔTÉ : une attestation, un plan, les photos du chantier.
      Le devis et la décharge papier ont leur place à eux, sur leur ligne. */
  pieces?: PieceDuDossier[];
};

export type EtatDevis = 'recu' | 'retenu' | 'ecarte' | 'remplace';

/** UNE LIGNE DU DEVIS — « description, quantité et prix avec un calcul
    total » (Yéman, 15 septembre). « 2 madriers à 25 000 » se lit, se compare
    et se conteste ; « 90 000 » tout court, non. */
export type LigneDeDevis = {
  description: string;
  /** Décimale permise : 3,5 m² de contreplaqué se commandent. */
  quantite: number;
  /** Négatif permis : une remise est une ligne comme une autre. */
  prixUnitaireXof: number;
};

export type DevisRecu = {
  id: string;
  branchId: string;
  engagementId: string;
  /** SON NUMÉRO À LUI, celui qu'il cite dans ses relances. */
  numeroPrestataire?: string;
  recuLe: string;
  /** UN DEVIS EXPIRE. L'apprendre au moment de commander coûte une
      renégociation. */
  valableJusquau?: string;
  montantXof: number;
  description?: string;
  /** CE QU'IL COMPREND, ligne à ligne. Présentes, elles FONT le montant :
      un total écrit à côté de ses lignes finirait par les contredire. */
  lignes?: LigneDeDevis[];
  etat: EtatDevis;
  retenuLe?: string;
  retenuPar?: string;
  /** LA DERNIÈRE CORRECTION — le jour et la main. Ce qu'il disait avant, la
      trace de la base le garde (0092) : l'écran ne montre que le fait. */
  corrigeLe?: string;
  corrigePar?: string;
  /** UN AVENANT S'AJOUTE, il ne remplace pas. Le menuisier annonce
      200 000 F de plus en cours de route : c'est un devis de plus dans le
      même dossier, et le retenu devient la somme des deux. */
  avenant?: boolean;
  fichier?: PieceJointe;
};

/** LA DÉCHARGE — deux façons de la tenir, décidées le 15 septembre. */
export type Decharge =
  /** Il signe au doigt sur la tablette, au moment où il reçoit l'argent. */
  | { mode: 'ecran'; signature: SignatureTracee }
  /** Elle revient signée au stylo, et on la photographie. */
  | { mode: 'papier'; photo: PieceJointe; recueLe: string; recuePar?: string };

export type Versement = {
  id: string;
  branchId: string;
  engagementId: string;
  /** « avance à la commande », « solde à la livraison ». */
  libelle: string;
  montantXof: number;
  /** L'échéance convenue, quand il y en a une. */
  prevuLe?: string;
  /** ABSENT = PRÉVU, PAS ENCORE VERSÉ. C'est ce champ, et lui seul, qui dit
      qu'un franc est sorti. */
  verseLe?: string;
  versePar?: string;
  method?: string;
  cashbox?: string;
  /** LA DÉPENSE QUI PORTE CET ARGENT. Le dossier tient la preuve ; la dépense
      tient la comptabilité. Deux registres pour un même argent finiraient par
      ne plus dire la même chose. */
  expenseId?: string;
  decharge?: Decharge;
};

/* ══ LES DATES, DITES COMME SUR UN PAPIER ════════════════════════════════ */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 12 septembre 2026 ». Une décharge porte l'année : elle se relit dans
    trois ans, devant quelqu'un qui conteste. */
export const jourLongDit = (iso: string | undefined): string => {
  const [a, m, j] = (iso ?? '').slice(0, 10).split('-').map(Number);
  if (!a || !m || !j) return iso ?? '';
  return `${j} ${MOIS[m - 1]} ${a}`;
};

/** La date d'il y a, ou dans, N jours — en ISO, sans fuseau. */
export const decaleLeJour = (iso: string, jours: number): string => {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ══ LE NUMÉRO ═══════════════════════════════════════════════════════════ */

/** ENG-2026-005 — le suivant de l'année, jamais un trou comblé.

    ON NE RÉUTILISE PAS UN NUMÉRO : un dossier effacé laisse son numéro vide,
    et c'est tant mieux. Un numéro repris ferait croire, dans trois ans, que
    deux chantiers n'en étaient qu'un. */
export function numeroEngagementSuivant(
  engagements: readonly Pick<Engagement, 'numero'>[], annee: number,
): string {
  const prefixe = `ENG-${annee}-`;
  const max = engagements
    .map((e) => (e.numero.startsWith(prefixe) ? Number(e.numero.slice(prefixe.length)) : 0))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefixe}${String(max + 1).padStart(3, '0')}`;
}

/* ══ CE QUI EST RETENU ═══════════════════════════════════════════════════ */

/* ══ LES LIGNES D'UN DEVIS ═══════════════════════════════════════════════

   LE TOTAL SE CALCULE, IL NE SE TAPE PAS. « 25000*2 » écrit dans une case
   de texte n'était lu par personne : le Trône range désormais la quantité et
   le prix chacun à sa place, et fait la multiplication lui-même. */

/** LIRE UN NOMBRE TEL QU'ON LE TAPE : « 25 000 », « 3,5 », « -5 000 »,
    « 25 000 F ». Rend `NaN` pour ce qui n'est pas un nombre — et un calcul
    (« 25000*2 ») n'en est pas un : on ne devine pas ce qu'il voulait dire. */
export function lisLeNombre(saisie: string): number {
  const t = saisie
    .replace(/[\s  ]/g, '')
    .replace(/(fcfa|cfa|xof|f)$/i, '')
    .replace(',', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** « 3,5 », pas « 3.5 » : la quantité se lit à la française. */
export const quantiteDite = (q: number): string => String(q).replace('.', ',');

/** Le franc n'a pas de centimes : le total d'une ligne s'arrondit au franc. */
export const totalDeLaLigne = (l: LigneDeDevis): number =>
  (Number.isFinite(l.quantite) && Number.isFinite(l.prixUnitaireXof)
    ? Math.round(l.quantite * l.prixUnitaireXof)
    : 0);

export const totalDesLignes = (lignes: readonly LigneDeDevis[]): number =>
  lignes.reduce((s, l) => s + totalDeLaLigne(l), 0);

/** POURQUOI CETTE LIGNE NE VAUT PAS — la fin de phrase, ou `null`.
    L'écran la fait précéder de « Ligne 2 : ». */
export function pourquoiLaLigneNeVautPas(l: LigneDeDevis): string | null {
  if (!l.description.trim()) return 'nommez ce qu’elle comprend.';
  if (!Number.isFinite(l.quantite)) return 'la quantité ne se lit pas. Écrivez un nombre, sans calcul.';
  if (l.quantite <= 0) return 'la quantité doit dépasser zéro.';
  if (!Number.isFinite(l.prixUnitaireXof)) return 'le prix ne se lit pas. Écrivez un nombre, sans calcul.';
  if (l.prixUnitaireXof === 0) return 'la ligne n’a pas de prix.';
  return null;
}

/** UNE LIGNE TELLE QU'ON LA TAPE, avant d'être lue. */
export type LigneSaisie = { description: string; quantite: string; prix: string };

export const LIGNE_VIDE: LigneSaisie = { description: '', quantite: '1', prix: '' };

/** Une quantité laissée vide vaut un : on commande « une porte », on ne
    l'écrit pas. Le prix, lui, s'arrondit au franc dès la saisie. */
export const ligneDeLaSaisie = (s: LigneSaisie): LigneDeDevis => {
  const prix = lisLeNombre(s.prix);
  return {
    description: s.description.trim(),
    quantite: s.quantite.trim() === '' ? 1 : lisLeNombre(s.quantite),
    prixUnitaireXof: Number.isFinite(prix) ? Math.round(prix) : NaN,
  };
};

/** LES LIGNES REMPLIES. Une ligne sans description ni prix est une ligne
    ajoutée puis laissée : elle ne compte pas, et ne bloque rien. */
export const lignesDeLaSaisie = (saisies: readonly LigneSaisie[]): LigneDeDevis[] =>
  saisies.filter((s) => s.description.trim() || s.prix.trim()).map(ligneDeLaSaisie);

/** CE QUE LA MAISON A ACCEPTÉ DE PAYER : le devis de base retenu, plus ses
    avenants retenus. */
export const retenuXof = (devis: readonly DevisRecu[]): number =>
  devis.filter((d) => d.etat === 'retenu').reduce((s, d) => s + Math.max(0, d.montantXof), 0);

/** LE DEVIS DE BASE, celui qui a été choisi — sans les avenants. */
export const devisDeBase = (devis: readonly DevisRecu[]): DevisRecu | undefined =>
  devis.find((d) => d.etat === 'retenu' && !d.avenant);

/** LES TRAVAUX À VENIR — « besoin de voir les notes sur le devis, le résumé
    des travaux à venir » (Yéman, 15 septembre 2026).

    CE QUI VA SE FAIRE, C'EST CE QUI A ÉTÉ RETENU : le résumé du devis de base,
    puis ceux de ses avenants, dans l'ordre où ils sont arrivés. Un devis
    écarté ne dit pas ce qui va se faire ; il reste lisible dans sa ligne du
    tableau, et nulle part ailleurs. */
export const travauxAVenir = (devis: readonly DevisRecu[]): { devis: DevisRecu; texte: string }[] =>
  devis
    .filter((d) => d.etat === 'retenu' && (d.description ?? '').trim() !== '')
    .sort((a, b) => Number(!!a.avenant) - Number(!!b.avenant) || a.recuLe.localeCompare(b.recuLe))
    .map((d) => ({ devis: d, texte: (d.description as string).trim() }));

/** DE COMBIEN ON A DÉPASSÉ le devis de base. L'écran le dit : un dépassement
    qui ne se nomme pas passe pour le prix convenu. */
export const depassementXof = (devis: readonly DevisRecu[]): number => {
  const base = devisDeBase(devis);
  return base ? Math.max(0, retenuXof(devis) - base.montantXof) : 0;
};

/** UN DEVIS EXPIRÉ, qu'on n'a pas encore retenu. Un devis retenu n'expire
    plus : le oui a été donné pendant qu'il valait. */
export const devisExpire = (d: DevisRecu, aujourdhui: string): boolean =>
  d.etat === 'recu' && !!d.valableJusquau && aujourdhui > d.valableJusquau;

/** IL EXPIRE BIENTÔT — trois jours, comme la cloche d'un rendez-vous. */
export const devisExpireBientot = (d: DevisRecu, aujourdhui: string, jours = 3): boolean =>
  d.etat === 'recu' && !!d.valableJusquau
  && aujourdhui <= d.valableJusquau && decaleLeJour(aujourdhui, jours) >= d.valableJusquau;

/** POURQUOI CE DEVIS NE SE RETIENT PAS — la phrase, ou `null`. */
export function pourquoiOnNeRetientPas(o: {
  devis: DevisRecu;
  tous: readonly DevisRecu[];
  estDirection: boolean;
}): string | null {
  /* RETENIR ENGAGE LA MAISON (proposition validée le 15 septembre) : tout le
     personnel SAISIT un devis reçu, la direction seule le RETIENT. */
  if (!o.estDirection) return 'Retenir un devis engage la Maison : la direction seule le fait.';
  if (o.devis.etat === 'retenu') return 'Ce devis est déjà retenu.';
  if (o.devis.montantXof <= 0) return 'Un devis sans montant ne s’engage pas.';
  const memeDossier = o.tous.filter((d) => d.engagementId === o.devis.engagementId);
  if (o.devis.avenant && !devisDeBase(memeDossier)) {
    return 'Un avenant s’ajoute à un devis retenu : retenez d’abord le devis de base.';
  }
  return null;
}

/** CE QUE L'ÉCRAN DOIT DIRE AVANT DE RETENIR — sans l'empêcher. Un devis
    expiré peut encore être honoré par un prestataire de bonne foi : c'est à
    la main de le décider, pas au Trône. */
export const avertitAvantDeRetenir = (d: DevisRecu, aujourdhui: string): string | null =>
  (d.valableJusquau && aujourdhui > d.valableJusquau
    ? `Ce devis a expiré le ${jourLongDit(d.valableJusquau)}. Vérifiez qu’il tient toujours.`
    : null);

/** RETENIR UN DEVIS — et ce que ce oui fait aux autres.

    UN DEVIS DE BASE ÉCARTE LES AUTRES REÇUS, et REMPLACE celui qui était
    retenu avant lui : on a changé d'avis, et la trace doit le dire. UN
    AVENANT, LUI, NE TOUCHE À PERSONNE : il s'ajoute.

    RIEN NE S'EFFACE. Un devis écarté reste, c'est la preuve qu'on a comparé —
    et le jour où le retenu dérape, c'est vers l'autre qu'on se retourne. */
export function retenirLeDevis(
  tous: readonly DevisRecu[], id: string, par: string | undefined, maintenant: string,
): DevisRecu[] {
  const cible = tous.find((d) => d.id === id);
  if (!cible) return [...tous];
  return tous.map((d) => {
    if (d.engagementId !== cible.engagementId) return d;
    if (d.id === id) return { ...d, etat: 'retenu' as const, retenuLe: maintenant, retenuPar: par };
    if (cible.avenant || d.avenant) return d;
    if (d.etat === 'retenu') return { ...d, etat: 'remplace' as const };
    if (d.etat === 'recu') return { ...d, etat: 'ecarte' as const };
    return d;
  });
}

/* ══ CE QUI EST VERSÉ ════════════════════════════════════════════════════ */

export const estVerse = (v: Pick<Versement, 'verseLe'>): boolean => !!v.verseLe;

export const verseXof = (versements: readonly Versement[]): number =>
  versements.filter(estVerse).reduce((s, v) => s + Math.max(0, v.montantXof), 0);

/** CE QUI RESTE À PAYER. Jamais négatif : un trop-versé se dit à part. */
export const resteXof = (devis: readonly DevisRecu[], versements: readonly Versement[]): number =>
  Math.max(0, retenuXof(devis) - verseXof(versements));

/** CE QUI A ÉTÉ VERSÉ AU-DELÀ DU RETENU. Cela arrive — une avance consentie
    avant qu'un avenant à la baisse soit signé — et la Maison doit alors le
    récupérer ou le déduire. Le taire ferait perdre cet argent. */
export const tropVerseXof = (devis: readonly DevisRecu[], versements: readonly Versement[]): number =>
  Math.max(0, verseXof(versements) - retenuXof(devis));

/** POURQUOI CE VERSEMENT NE SE POSE PAS — la phrase, ou `null`. */
export function pourquoiOnNeVersePas(o: {
  montantXof: number;
  estDirection: boolean;
  retenuXof: number;
  cashbox?: string;
}): string | null {
  if (!o.estDirection) return 'Verser engage la Maison : la direction seule le fait.';
  if (!(o.montantXof > 0)) return 'Un versement sans montant ne se pose pas.';
  if (o.retenuXof <= 0) return 'Aucun devis n’est retenu : on ne verse pas avant d’avoir dit oui.';
  if (!(o.cashbox ?? '').trim()) return 'Nommez la caisse d’où sort l’argent.';
  return null;
}

/** CE QUE L'ÉCRAN DOIT DIRE AVANT DE VERSER — sans l'empêcher. */
export const avertitAvantDeVerser = (o: {
  montantXof: number; retenuXof: number; dejaVerseXof: number;
}): string | null => {
  const depasse = o.dejaVerseXof + o.montantXof - o.retenuXof;
  return depasse > 0
    ? `Ce versement dépasse le devis retenu de ${nombreEnChiffres(depasse)} F.`
    : null;
};

/* ══ LA DÉCHARGE ═════════════════════════════════════════════════════════

   UNE AVANCE SANS DÉCHARGE N'EST PAS UNE AVANCE. C'est la même doctrine que
   le droit à l'image — « sans signature, ce n'est pas un accord » : ici, sans
   décharge, c'est de l'argent sorti dont rien ne dit qu'il est arrivé. */

/** POURQUOI CETTE DÉCHARGE NE VAUT PAS — la phrase, ou `undefined`. */
export function dechargeInvalide(d: Decharge | undefined): string | undefined {
  if (!d) return 'Aucune décharge.';
  if (d.mode === 'ecran') return signatureInvalide(d.signature);
  if (!d.photo?.chemin) return 'La photo de la décharge manque.';
  if (!d.recueLe) return 'Le jour où la décharge est revenue manque.';
  return undefined;
}

/** LES VERSEMENTS PARTIS SANS DÉCHARGE VALABLE — ce que l'écran réclame. */
export const versementsSansDecharge = (versements: readonly Versement[]): Versement[] =>
  versements.filter((v) => estVerse(v) && !!dechargeInvalide(v.decharge));

/* LA PIÈCE D'IDENTITÉ FIGURE SUR CHAQUE DÉCHARGE — 15 septembre 2026.
   « Toujours inclure la photo de sa pièce sur la décharge » (Yéman).

   UNE DÉCHARGE DIT QUI A REÇU L'ARGENT ; SA PIÈCE LE MONTRE. Un nom écrit se
   conteste (« ce n'est pas moi qui ai signé »), un visage à côté de la
   signature, beaucoup moins.

   CE QUI EN DÉCOULE, ET QUI N'EST PAS UN DÉTAIL :
   · pas de décharge sans pièce déposée ;
   · c'est la DIRECTION qui fait la décharge, puisqu'elle seule ouvre la pièce
     (0099). Le personnel range encore la photo d'une décharge revenue signée :
     celle-là porte déjà la pièce, imprimée.

   UNE PHOTO, PAS UN PDF. Un PDF ne se pose pas dans un PDF, et le HEIC d'un
   iPhone ne se lit pas dans tous les navigateurs. */
export const FORMATS_DE_L_IDENTITE = 'image/jpeg,image/png,image/webp';

export function pourquoiLaDechargeNePeutPasSeFaire(o: {
  identite?: Pick<PieceJointe, 'type'>;
  estDirection: boolean;
}): string | null {
  if (!o.identite) return 'Sa pièce d’identité figure sur chaque décharge : déposez-la d’abord.';
  if (!o.estDirection) return 'La décharge porte sa pièce d’identité, que seule la direction ouvre : c’est la direction qui la fait.';
  /* Un type vide (une pièce ancienne) n'est pas refusé d'avance : c'est la
     lecture de l'image qui dira si elle se montre. */
  if (o.identite.type && !/^image\/(jpe?g|png|webp)$/i.test(o.identite.type)) {
    return 'Sa pièce d’identité n’est pas une photo que la décharge sait montrer : déposez-la en JPEG ou en PNG.';
  }
  return null;
}

/** LE TEXTE DE LA DÉCHARGE — le même à l'écran, sur le papier imprimé et dans
    le PDF signé.

    « JE SOUSSIGNÉ(E) » : la Maison ne présume pas du genre de qui signe.

    LA SOMME EN LETTRES AVANT LES CHIFFRES, entre parenthèses : c'est l'ordre
    d'un acte, et c'est la lettre qui fait foi quand les deux divergent. */
export function texteDeLaDecharge(o: {
  prestataire: string;
  metier?: string;
  maison: string;
  montantXof: number;
  libelle: string;
  objet?: string;
  devisNumero?: string;
  devisDate?: string;
}): string {
  const qui = o.metier?.trim() ? `${o.prestataire.trim()}, ${o.metier.trim()},` : `${o.prestataire.trim()},`;
  const libelle = o.libelle.trim();
  const titre = libelle ? libelle.charAt(0).toLowerCase() + libelle.slice(1) : 'versement';
  /* « À TITRE D'AVANCE », pas « à titre de avance » : le français élide devant
     une voyelle, et une décharge mal écrite a l'air d'un faux. */
  const de = /^[aeiouyhàâéèêîôû]/i.test(titre) ? 'd’' : 'de ';
  const devis = o.devisNumero
    ? ` sur le devis ${o.devisNumero}${o.devisDate ? ` du ${jourLongDit(o.devisDate)}` : ''}`
    : '';
  const objet = o.objet?.trim() ? `, pour « ${o.objet.trim()} »` : '';
  return `Je soussigné(e) ${qui} reconnais avoir reçu de ${o.maison} la somme de `
    + `${nombreEnLettres(o.montantXof)} francs CFA (${nombreEnChiffres(o.montantXof)} F), `
    + `à titre ${de}${titre}${devis}${objet}.`;
}

/* ══ L'ÉTAT DU DOSSIER — dérivé, jamais écrit ═══════════════════════════ */

export type EtatDossier = 'devis' | 'en-cours' | 'solde' | 'abandonne';

export const etatDuDossier = (
  e: Pick<Engagement, 'abandonneLe'>, devis: readonly DevisRecu[], versements: readonly Versement[],
): EtatDossier => {
  if (e.abandonneLe) return 'abandonne';
  if (retenuXof(devis) <= 0) return 'devis';
  return resteXof(devis, versements) === 0 ? 'solde' : 'en-cours';
};

export const ETAT_DIT: Record<EtatDossier, string> = {
  devis: 'devis à choisir',
  'en-cours': 'en cours',
  solde: 'soldé',
  abandonne: 'abandonné',
};

/** LE JOUR OÙ LE DOSSIER S'EST FERMÉ — le dernier franc versé, ou
    l'abandon. Dérivé, pour la même raison que tout l'état : un « soldé le »
    écrit à part mentirait dès le premier avenant. */
export function fermeLe(
  e: Pick<Engagement, 'abandonneLe'>, devis: readonly DevisRecu[], versements: readonly Versement[],
): string | undefined {
  if (e.abandonneLe) return e.abandonneLe;
  if (etatDuDossier(e, devis, versements) !== 'solde') return undefined;
  return versements.filter(estVerse).map((v) => v.verseLe as string).sort().pop();
}

/* ══ LA PIÈCE D'IDENTITÉ — gardée parce qu'elle sert, et pas plus ═══════

   Décision du 15 septembre : direction seule, gardée tant que le dossier
   vit, EFFACÉE UN AN APRÈS QU'IL EST FERMÉ. Une carte d'identité sert à
   savoir qui la Maison paie et à le prouver en cas de litige ; passé un an
   après le dernier franc, elle ne prouve plus rien d'utile et reste un
   risque. */
export const DELAI_DE_GARDE_DE_L_IDENTITE_JOURS = 365;

export function effacementDeLIdentite(
  e: Pick<Engagement, 'abandonneLe'>, devis: readonly DevisRecu[], versements: readonly Versement[],
): string | undefined {
  const f = fermeLe(e, devis, versements);
  return f ? decaleLeJour(f, DELAI_DE_GARDE_DE_L_IDENTITE_JOURS) : undefined;
}

export const identiteAEffacer = (
  e: Pick<Engagement, 'abandonneLe' | 'identite'>,
  devis: readonly DevisRecu[], versements: readonly Versement[], aujourdhui: string,
): boolean => {
  if (!e.identite) return false;
  const quand = effacementDeLIdentite(e, devis, versements);
  return !!quand && aujourdhui >= quand;
};

/* ══ LA DÉPENSE QUI PORTE UN VERSEMENT ═══════════════════════════════════

   L'ARGENT SORT PAR LA PORTE DES DÉPENSES, pas par une porte à part. Un
   versement à un prestataire EST une dépense : il prend sa caisse, son moyen
   de paiement, il entre au journal du jour et pèse sur le résultat du mois. */
/* LA CATÉGORIE EST CELLE DES DÉPENSES, pas une catégorie inventée ici. Une
   « Engagements & travaux » qui n'existerait qu'à cet endroit fausserait les
   budgets et la synthèse, qui ne la connaissent pas. L'agencement du salon
   est de l'Équipement, l'enseigne du Marketing : la direction range, l'écran
   propose. */
export const CATEGORIE_PROPOSEE = 'Équipement';

export const libelleDeLaDepense = (
  e: Pick<Engagement, 'numero' | 'prestataire'>, v: Pick<Versement, 'libelle'>,
): string => `${e.numero} · ${e.prestataire} · ${v.libelle}`;

export function depenseDuVersement(
  e: Pick<Engagement, 'numero' | 'prestataire' | 'fournisseurId' | 'branchId'>,
  v: Pick<Versement, 'libelle' | 'montantXof' | 'verseLe' | 'cashbox'>,
  rangement: { category: string; subcategory?: string },
): Expense {
  const sous = rangement.subcategory?.trim();
  return {
    id: `exp-eng-${uid()}`,
    branchId: e.branchId,
    label: libelleDeLaDepense(e, v),
    amountXof: Math.round(v.montantXof),
    date: v.verseLe as string,
    cashbox: v.cashbox ?? '',
    category: rangement.category.trim() || CATEGORIE_PROPOSEE,
    ...(sous ? { subcategory: sous } : {}),
    ...(e.fournisseurId ? { fournisseurId: e.fournisseurId } : {}),
  };
}

/* ══ CORRIGER UN DEVIS — 15 septembre 2026 ═══════════════════════════════

   « Modifier un devis accepté » (Yéman). Tranché le même jour : LA DIRECTION
   CORRIGE un devis retenu, et la trace de la base garde la version d'avant.

   C'EST UN RETOUR SUR UNE RÈGLE DE 0099, ET IL EST ASSUMÉ. 0099 figeait le
   montant d'un devis retenu pour tout le monde : un prix qui bouge devait
   passer par un avenant. C'est juste pour un prix qui CHANGE ; c'est absurde
   pour une faute de frappe, un madrier compté deux fois, un fichier oublié.
   0100 rend la correction à la direction, et la retire entièrement au reste
   du personnel — lignes comprises, qu'0099 ne connaissait pas.

   UN DEVIS PAS ENCORE RETENU se corrige par qui l'a saisi : ce n'est encore
   qu'une proposition rangée. */

export function pourquoiOnNeModifiePas(o: { devis: DevisRecu; estDirection: boolean }): string | null {
  if (o.devis.etat === 'retenu' && !o.estDirection) return 'Ce devis est retenu : la direction seule le corrige.';
  return null;
}

/** CE QUE LA CORRECTION FAIT À L'ARGENT — dit AVANT d'enregistrer.

    Corriger un devis retenu change ce que la Maison doit. Quand des avances
    sont déjà parties, baisser le devis peut faire qu'on a trop versé : c'est
    à ce moment-là qu'il faut le savoir, pas au solde. */
export function avertitAvantDeCorriger(o: {
  devis: DevisRecu;
  nouveauMontantXof: number;
  tous: readonly DevisRecu[];
  versements: readonly Versement[];
}): string | null {
  if (o.devis.etat !== 'retenu' || o.nouveauMontantXof === o.devis.montantXof) return null;
  const dossier = o.tous.filter((d) => d.engagementId === o.devis.engagementId);
  const apres = dossier.map((d) => (d.id === o.devis.id ? { ...d, montantXof: o.nouveauMontantXof } : d));
  const vs = o.versements.filter((v) => v.engagementId === o.devis.engagementId);
  const phrase = `Le retenu passe de ${nombreEnChiffres(retenuXof(dossier))} F à ${nombreEnChiffres(retenuXof(apres))} F.`;
  const trop = tropVerseXof(apres, vs);
  return trop > 0
    ? `${phrase} ${nombreEnChiffres(trop)} F auront été versés au-delà : à récupérer ou à déduire.`
    : `${phrase} Reste à payer : ${nombreEnChiffres(resteXof(apres, vs))} F.`;
}

export type ChampsDuDevis = Partial<Pick<DevisRecu,
  'numeroPrestataire' | 'recuLe' | 'valableJusquau' | 'montantXof' | 'lignes' | 'avenant' | 'fichier' | 'description'>>;

/** CORRIGER UN DEVIS — son contenu, JAMAIS son état. Un devis retenu reste
    retenu, par la même main et le même jour : corriger n'est pas redonner un
    oui. Un champ passé à `undefined` s'efface (une validité retirée). */
export function corrigeLeDevis(
  tous: readonly DevisRecu[], id: string, champs: ChampsDuDevis, par: string | undefined, quand: string,
): DevisRecu[] {
  return tous.map((d) => {
    if (d.id !== id) return d;
    return {
      ...d,
      ...champs,
      /* L'état et le oui ne passent pas par une correction. Un avenant ne
         devient pas un devis de base après coup, ni l'inverse : le retenu
         changerait de nature sans que personne l'ait décidé. */
      etat: d.etat,
      retenuLe: d.retenuLe,
      retenuPar: d.retenuPar,
      avenant: d.etat === 'retenu' || !('avenant' in champs) ? d.avenant : champs.avenant,
      corrigeLe: quand,
      corrigePar: par,
    };
  });
}

/* ══ LES DOSSIERS, LUS D'UN COUP ═════════════════════════════════════════

   UN SEUL LECTEUR POUR L'ÉCRAN, LA CLOCHE ET LE TABLEAU DE BORD. Trois écrans
   qui recalculeraient chacun leur « reste à payer » finiraient par annoncer
   trois sommes pour une seule dette. */

export type LectureDuDossier = {
  engagement: Engagement;
  devis: DevisRecu[];
  versements: Versement[];
  etat: EtatDossier;
  retenuXof: number;
  verseXof: number;
  resteXof: number;
  tropVerseXof: number;
  depassementXof: number;
  sansDecharge: Versement[];
  expirentBientot: DevisRecu[];
  expires: DevisRecu[];
};

/** EN COURS D'ABORD : c'est là qu'il reste de l'argent à sortir. Puis ce qui
    attend un choix, puis ce qui est fermé. */
const RANG_DE_L_ETAT: Record<EtatDossier, number> = { 'en-cours': 0, devis: 1, solde: 2, abandonne: 3 };

export function litLesDossiers(
  engagements: readonly Engagement[],
  devis: readonly DevisRecu[],
  versements: readonly Versement[],
  branchId: string,
  aujourdhui: string,
): LectureDuDossier[] {
  const devisDu = new Map<string, DevisRecu[]>();
  for (const d of devis) devisDu.set(d.engagementId, [...(devisDu.get(d.engagementId) ?? []), d]);
  const versementsDu = new Map<string, Versement[]>();
  for (const v of versements) versementsDu.set(v.engagementId, [...(versementsDu.get(v.engagementId) ?? []), v]);

  return engagements
    .filter((e) => e.branchId === branchId)
    .map((e) => {
      const ds = (devisDu.get(e.id) ?? []).slice().sort((a, b) => b.recuLe.localeCompare(a.recuLe));
      const vs = (versementsDu.get(e.id) ?? []).slice()
        .sort((a, b) => (a.verseLe ?? a.prevuLe ?? '9999').localeCompare(b.verseLe ?? b.prevuLe ?? '9999'));
      return {
        engagement: e,
        devis: ds,
        versements: vs,
        etat: etatDuDossier(e, ds, vs),
        retenuXof: retenuXof(ds),
        verseXof: verseXof(vs),
        resteXof: resteXof(ds, vs),
        tropVerseXof: tropVerseXof(ds, vs),
        depassementXof: depassementXof(ds),
        sansDecharge: versementsSansDecharge(vs),
        expirentBientot: e.abandonneLe ? [] : ds.filter((d) => devisExpireBientot(d, aujourdhui)),
        expires: e.abandonneLe ? [] : ds.filter((d) => devisExpire(d, aujourdhui)),
      };
    })
    .sort((a, b) => RANG_DE_L_ETAT[a.etat] - RANG_DE_L_ETAT[b.etat]
      || b.engagement.numero.localeCompare(a.engagement.numero));
}

/** CE QUE LE TABLEAU DE BORD ET LA CLOCHE EN DISENT.

    UNE AVANCE SANS DÉCHARGE COMPTE MÊME DANS UN DOSSIER ABANDONNÉ : l'argent
    est sorti, et c'est justement quand le chantier s'arrête qu'on a besoin de
    prouver ce qui a été versé. */
export function bilanDesEngagements(lectures: readonly LectureDuDossier[]): {
  enCours: number;
  resteXof: number;
  sansDecharge: number;
  devisQuiExpirent: { lecture: LectureDuDossier; devis: DevisRecu }[];
} {
  const enCours = lectures.filter((l) => l.etat === 'en-cours');
  return {
    enCours: enCours.length,
    resteXof: enCours.reduce((s, l) => s + l.resteXof, 0),
    sansDecharge: lectures.reduce((s, l) => s + l.sansDecharge.length, 0),
    devisQuiExpirent: lectures.flatMap((l) => l.expirentBientot.map((d) => ({ lecture: l, devis: d }))),
  };
}

/* ══ LES MAGASINS ════════════════════════════════════════════════════════ */

export const engagementsStore = createStore<Engagement[]>('mnd_engagements', []);
export const devisRecusStore = createStore<DevisRecu[]>('mnd_devis_recus', []);
export const versementsEngagementStore = createStore<Versement[]>('mnd_versements_engagement', []);

export const useEngagements = () => useStore(engagementsStore);
export const useDevisRecus = () => useStore(devisRecusStore);
export const useVersementsEngagement = () => useStore(versementsEngagementStore);

bindCollection(engagementsStore, 'engagements');
bindCollection(devisRecusStore, 'devis_recus');
bindCollection(versementsEngagementStore, 'versements_engagement');
