/* ══ LE DOSSIER DE BOURSE — 6 octobre 2026 ═══════════════════════════════

   « Ça me prend un temps fou, parfois deux à trois semaines. Maximum quinze
   minutes » (Yéman). Le dossier de bourse scolaire de l'Ambassade de France
   se dépose chaque année en février ; la liste des pièces ne bouge presque
   pas, le formulaire est le même, et le temps part dans la chasse aux
   papiers et l'attente des tiers.

   CE MODULE EST PUR : il ne connaît ni l'écran, ni le coffre, ni le réseau.
   Il dit ce qu'un dossier contient, à quel rythme chaque pièce arrive, ce qui
   expire, ce qui manque, et il rédige les lettres depuis une fiche. Le
   harnais `verifie-bourse` l'éprouve sans navigateur.

   IL NE PORTE AUCUN NOM, AUCUNE DATE DE NAISSANCE, AUCUN NUMÉRO : le dépôt
   est public. Tout ce qui désigne la famille vit dans la FICHE, saisie à
   l'écran et rangée au coffre de la direction (`bourse-coffre.ts`), jamais
   dans le code. Le harnais le vérifie en lisant ce fichier. */

/* ── Les rythmes ──────────────────────────────────────────────────────────
   Une pièce du dossier arrive à l'un de quatre rythmes, et c'est le rythme
   qui dit quand s'en occuper : jamais le jour du dépôt. */
export type Rythme = 'permanent' | 'mensuel' | 'janvier' | 'redige';

export const MOT_DU_RYTHME: Record<Rythme, string> = {
  permanent: 'Permanent · scanné une fois, jamais refait',
  mensuel: 'Mensuel · rangé le mois où il arrive',
  janvier: 'Janvier · n’existe qu’en janvier, se commande le 5',
  redige: 'Rédigé · modèle prêt, daté le jour du dépôt',
};

/** Les lettres que le Trône sait rédiger lui-même depuis la fiche. */
export type GenreDeLettre = 'demande' | 'employeur' | 'hebergement' | 'honneur' | 'avantages' | 'quittance';

export type Rubrique = {
  /** Le numéro du sous-dossier, dans l'ordre de la liste de l'Ambassade. */
  n: string;
  libelle: string;
  rythme: Rythme;
  /** La lettre que le Trône rédige pour cette rubrique, s'il y en a une. */
  lettre?: GenreDeLettre;
  /** Où l'obtenir, et le piège. */
  note: string;
  /** La rubrique ne vaut que pour une situation (famille, salarié, indépendant…). */
  section: 'tous' | 'famille' | 'salarie' | 'independant' | 'patrimoine';
};

/** LA LISTE DE L'AMBASSADE, réduite à ses rubriques et numérotée. L'ordre
    est celui du dossier déposé : c'est lui que suit l'assemblage. */
export const RUBRIQUES: readonly Rubrique[] = [
  { n: '01', libelle: 'Lettre de demande de bourse', rythme: 'redige', lettre: 'demande', section: 'tous', note: 'Rédigée depuis la fiche ; mise à jour : classes, année, situation.' },
  { n: '02', libelle: 'Formulaire de demande, complété et signé', rythme: 'redige', section: 'tous', note: 'Le même formulaire chaque année : se recopie depuis la fiche. Télécharger la version de l’année en décembre.' },
  { n: '03', libelle: 'Livret de famille', rythme: 'permanent', section: 'tous', note: 'Toutes les pages écrites.' },
  { n: '04', libelle: 'Passeports de tous les membres de la famille', rythme: 'permanent', section: 'tous', note: 'Page d’identité. La date d’expiration se surveille ici.' },
  { n: '05', libelle: 'Justificatif de domicile : trois derniers mois', rythme: 'mensuel', lettre: 'quittance', section: 'tous', note: 'Factures d’électricité et d’eau, quittances de loyer ou de charges. Hébergé à titre gracieux : l’attestation de l’hébergeant, sa pièce d’identité, une facture à son nom.' },
  { n: '06', libelle: 'Attestation de l’employeur : participation ou non aux frais de scolarité', rythme: 'redige', lettre: 'employeur', section: 'tous', note: 'Une par parent salarié, avec le salaire annuel brut et net. Rédigée ici ; signée et cachetée par l’employeur.' },
  { n: '07', libelle: 'Certificat de radiation ou de non-paiement de la CAF', rythme: 'janvier', section: 'tous', note: 'Sans objet pour une famille qui n’a jamais résidé en France. Sinon, délai long : demander en octobre.' },
  { n: '08', libelle: 'Carte grise du ou des véhicules', rythme: 'permanent', section: 'tous', note: 'Recto verso. À refaire seulement si le véhicule change.' },
  { n: '09', libelle: 'Certificat scolaire', rythme: 'janvier', section: 'tous', note: 'Seulement pour un enfant scolarisé hors de l’établissement français homologué.' },
  { n: '10', libelle: 'Plan d’accès au domicile', rythme: 'permanent', section: 'tous', note: 'Une page : carte, trois repères, les téléphones du foyer.' },
  { n: '11', libelle: 'Jugement de divorce, de garde, acte de décès', rythme: 'permanent', section: 'famille', note: 'S’il y a lieu.' },
  { n: '12', libelle: 'Attestation sur l’honneur de non-concubinage', rythme: 'redige', lettre: 'honneur', section: 'famille', note: 'Seulement pour un parent qui déclare vivre seul avec les enfants.' },
  { n: '13', libelle: 'Avis d’imposition sur les bénéfices, ou déclaration des résultats visée', rythme: 'janvier', section: 'independant', note: 'Pour un revenu d’activité indépendante. DGI, le 5 janvier.' },
  { n: '14', libelle: 'Statuts de la société, extrait du registre du commerce', rythme: 'permanent', section: 'independant', note: 'Pour l’activité indépendante déclarée.' },
  { n: '15', libelle: 'Compte d’exploitation et bilan visés par un comptable agréé', rythme: 'janvier', section: 'independant', note: 'Le chemin critique d’un indépendant : prévenir en octobre, commander le 5 janvier, relancer le 20.' },
  { n: '16', libelle: 'Relevés bancaires des trois derniers mois, chaque compte', rythme: 'mensuel', section: 'tous', note: 'Téléchargés en PDF le 5 de chaque mois. Douze mois rangés : on en donne trois ou douze.' },
  { n: '17', libelle: 'Avis d’imposition sur les revenus', rythme: 'janvier', section: 'tous', note: 'Pour tous. DGI, demandé le 5 janvier : la pièce la plus lente du dossier.' },
  { n: '18', libelle: 'Bulletins de salaire de l’année de référence', rythme: 'mensuel', section: 'salarie', note: 'Douze bulletins rangés au fil de l’année ; à défaut, l’attestation de salaire annuel du n° 06.' },
  { n: '19', libelle: 'Attestation d’avantages en nature', rythme: 'redige', lettre: 'avantages', section: 'patrimoine', note: 'S’il y a lieu : logement, véhicule, téléphone, personnel de service, chiffrés.' },
  { n: '20', libelle: 'Relevé récent de chaque compte d’épargne ou de titres', rythme: 'mensuel', section: 'patrimoine', note: 'Couvert par le n° 16 si tous les comptes sont téléchargés chaque mois.' },
  { n: '21', libelle: 'Actes de propriété, taxe foncière, tableau d’amortissement', rythme: 'permanent', section: 'patrimoine', note: 'S’il y a lieu. Le tableau d’amortissement vaut jusqu’au terme du prêt.' },
  { n: '22', libelle: 'Justificatifs de cotisations sociales, pension alimentaire versée', rythme: 'mensuel', section: 'tous', note: 'Attestation de paiement ou quittances rangées au fil de l’année.' },
];

export const rubriqueDe = (n: string): Rubrique | undefined => RUBRIQUES.find((r) => r.n === n);
export const RUBRIQUES_MENSUELLES = RUBRIQUES.filter((r) => r.rythme === 'mensuel');
export const RUBRIQUES_PERMANENTES = RUBRIQUES.filter((r) => r.rythme === 'permanent');

/* ── Ce que le magasin partagé tient : le calendrier, jamais les noms ─────
   Les réglages du Trône vivent dans la table `documents`, que tout le
   personnel lit. Un dossier de bourse dit une famille, des enfants, des
   salaires : son contenu ne s'y range pas. Le magasin ne garde que la
   campagne, sa date de dépôt et l'état de la collecte, ce qu'il faut pour
   sonner le rappel au démarrage. Les pièces et la fiche vivent au coffre. */
export type Collecte = Record<string, { faite: boolean; le?: string }>;

export type Campagne = {
  id: string;
  /** « 2027-2028 ». */
  anneeScolaire: string;
  /** L'année dont on justifie les revenus : celle qui précède le dépôt. */
  anneeReference: number;
  /** La date limite de dépôt, en ISO, quand l'Ambassade l'a publiée. */
  dateDepot?: string;
  /** Mois ISO (« 2026-11 ») → la collecte est faite. */
  collecte: Collecte;
  /** Le mois dont le rappel a déjà été vu sur ce poste. */
  rappelVu?: string;
};

export type DossierDeBourse = { campagnes: Campagne[]; courante?: string };
export const DOSSIER_VIDE: DossierDeBourse = { campagnes: [] };

/* ── Ce que le coffre tient : les pièces et la fiche ──────────────────── */
export type Piece = {
  id: string;
  /** Le numéro de rubrique (« 05 »). */
  rubrique: string;
  nom: string;
  /** Le chemin au coffre, ou vide pour une pièce notée mais pas déposée. */
  chemin: string;
  type: string;
  taille: number;
  deposeLe: string;
  /** Le mois ISO qu'une pièce mensuelle couvre. */
  mois?: string;
  /** Pour une pièce permanente qui expire : passeport, carte grise. */
  expireLe?: string;
  note?: string;
};

export type Enfant = { prenom: string; nom: string; naissance: string; etablissement: string; classe: string; immatriculation: string; sexe: 'f' | 'm' | '' };
export type Parent = { nom: string; prenom: string; naissance: string; lieu: string; nationalite: string; numic: string };
export type Emploi = {
  /** 1 ou 2 : le parent concerné. */
  parent: 1 | 2;
  statut: 'salarie' | 'independant' | 'sans-emploi' | '';
  /** « maison » : l'employeur est la Maison elle-même ; l'attestation sort alors avec son identité. */
  employeur: string;
  estLaMaison: boolean;
  poste: string;
  depuis: string;
  salaireBrut: string;
  salaireNet: string;
  participeAuxFrais: boolean;
  /** Le signataire de l'attestation et sa qualité. */
  signataire: string;
  qualite: string;
  lienFamilial: string;
  rccm: string;
  ifu: string;
  siege: string;
  telephone: string;
  sansEmploiDepuis: string;
};
export type Hebergeant = { nom: string; naissance: string; lieu: string; adresse: string; telephone: string; depuis: string };
export type Logement = {
  statut: 'proprietaire' | 'locataire' | 'heberge' | '';
  adresse: string;
  loyer: string;
  charges: string;
  valeurLocative: string;
  superficie: string;
  pieces: string;
  hebergeant: Hebergeant;
};

export type Fiche = {
  demandeur: 1 | 2;
  parent1: Parent;
  parent2: Parent;
  situation: 'marie' | 'divorce' | 'concubin' | 'celibataire' | 'veuf' | 'separe' | 'pacs' | '';
  adresse: string;
  boitePostale: string;
  telephone: string;
  courriel: string;
  enfants: Enfant[];
  logement: Logement;
  emplois: Emploi[];
  jamaisResideEnFrance: boolean;
  /** La distance et le motif des frais parascolaires demandés. */
  parascolaire: string;
  /** Les rubriques déclarées sans objet à la main, par leur numéro. */
  sansObjet: string[];
  modifieeLe: string;
};

const PARENT_VIDE: Parent = { nom: '', prenom: '', naissance: '', lieu: '', nationalite: '', numic: '' };
export const HEBERGEANT_VIDE: Hebergeant = { nom: '', naissance: '', lieu: '', adresse: '', telephone: '', depuis: '' };
export const EMPLOI_VIDE: Emploi = {
  parent: 1, statut: '', employeur: '', estLaMaison: false, poste: '', depuis: '', salaireBrut: '', salaireNet: '',
  participeAuxFrais: false, signataire: '', qualite: 'gérant(e)', lienFamilial: '', rccm: '', ifu: '', siege: '', telephone: '', sansEmploiDepuis: '',
};
export const ENFANT_VIDE: Enfant = { prenom: '', nom: '', naissance: '', etablissement: '', classe: '', immatriculation: '', sexe: '' };
export const FICHE_VIDE: Fiche = {
  demandeur: 1, parent1: { ...PARENT_VIDE }, parent2: { ...PARENT_VIDE }, situation: '', adresse: '', boitePostale: '',
  telephone: '', courriel: '', enfants: [], logement: { statut: '', adresse: '', loyer: '', charges: '', valeurLocative: '', superficie: '', pieces: '', hebergeant: { ...HEBERGEANT_VIDE } },
  emplois: [], jamaisResideEnFrance: true, parascolaire: '', sansObjet: [], modifieeLe: '',
};

/** Ce que le coffre range pour une campagne, en un seul fichier JSON. */
export type ContenuDuCoffre = { fiche: Fiche; pieces: Piece[]; modifieLe: string };
export const COFFRE_VIDE: ContenuDuCoffre = { fiche: FICHE_VIDE, pieces: [], modifieLe: '' };

/* ── Les dates ──────────────────────────────────────────────────────────── */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const jourIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const moisIso = (d: Date): string => jourIso(d).slice(0, 7);

/** « 2014-03-18 » → « 18 mars 2014 ». Une date vide ou mal formée reste telle quelle. */
export function dateEnLettres(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const j = Number(m[3]), mo = Number(m[2]);
  if (mo < 1 || mo > 12) return iso;
  return `${j === 1 ? '1er' : j} ${MOIS[mo - 1]} ${m[1]}`;
}
/** « 2026-11 » → « novembre 2026 ». */
export function moisEnLettres(mois: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mois ?? '');
  if (!m) return mois ?? '';
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${MOIS[mo - 1]} ${m[1]}` : mois;
}
/** « 2014-03-18 » → « 18/03/2014 », pour les cases du formulaire. */
export const dateCourte = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
};
const dateDe = (iso: string): Date => new Date(`${iso}T12:00:00`);
const plusJours = (iso: string, n: number): string => { const d = dateDe(iso); d.setDate(d.getDate() + n); return jourIso(d); };
const plusMois = (mois: string, n: number): string => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return moisIso(d);
};
export const joursEntre = (de: string, a: string): number => Math.round((dateDe(a).getTime() - dateDe(de).getTime()) / 86_400_000);
export const premierJourDuMois = (mois: string): string => `${mois}-01`;
export const dernierJourDuMois = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return jourIso(new Date(a, m, 0));
};

/* ── L'expiration ───────────────────────────────────────────────────────── */
export type EtatDExpiration = 'sans' | 'valide' | 'bientot' | 'expiree';
/** Trois mois avant l'échéance, on prévient : un passeport se renouvelle en semaines. */
export const PREAVIS_JOURS = 90;

export function etatDExpiration(expireLe: string | undefined, aujourdhui: string): EtatDExpiration {
  if (!expireLe) return 'sans';
  const j = joursEntre(aujourdhui, expireLe);
  if (j < 0) return 'expiree';
  if (j <= PREAVIS_JOURS) return 'bientot';
  return 'valide';
}
export const MOT_DE_L_EXPIRATION: Record<EtatDExpiration, string> = {
  sans: '', valide: 'valide', bientot: 'expire dans moins de trois mois', expiree: 'expirée',
};

/** Les pièces qui demandent un geste : expirées, ou qui expirent avant le dépôt. */
export function piecesAExpirer(pieces: readonly Piece[], aujourdhui: string, dateDepot?: string): Piece[] {
  return pieces.filter((p) => {
    if (!p.expireLe) return false;
    const e = etatDExpiration(p.expireLe, aujourdhui);
    if (e === 'expiree' || e === 'bientot') return true;
    return !!dateDepot && joursEntre(dateDepot, p.expireLe) < 0;
  });
}

/* ── La collecte mensuelle ─────────────────────────────────────────────── */
/** Le jour fixe de la collecte : le 5, quand les relevés et les factures du mois passé sont tous là. */
export const JOUR_DE_COLLECTE = 5;

export type LigneDeCollecte = { rubrique: Rubrique; fournie: boolean; pieces: Piece[] };
export type CollecteDuMois = {
  /** Le mois COLLECTÉ : celui qui précède le jour de collecte. */
  mois: string;
  /** Le jour où elle se fait. */
  echeance: string;
  lignes: LigneDeCollecte[];
  faite: boolean;
  enRetard: boolean;
};

/** Le 5 d'un mois, on range le mois précédent. */
export const moisACollecter = (aujourdhui: string): string => plusMois(aujourdhui.slice(0, 7), -1);
export const echeanceDeCollecte = (moisCollecte: string): string => `${plusMois(moisCollecte, 1)}-${String(JOUR_DE_COLLECTE).padStart(2, '0')}`;

export function collecteDuMois(
  campagne: Pick<Campagne, 'collecte'>, pieces: readonly Piece[], mois: string, aujourdhui: string, fiche?: Fiche,
): CollecteDuMois {
  const sansObjet = fiche ? rubriquesSansObjet(fiche) : new Set<string>();
  const lignes = RUBRIQUES_MENSUELLES.filter((r) => !sansObjet.has(r.n)).map((r) => {
    const siennes = pieces.filter((p) => p.rubrique === r.n && p.mois === mois);
    return { rubrique: r, fournie: siennes.length > 0, pieces: siennes };
  });
  const echeance = echeanceDeCollecte(mois);
  const faite = campagne.collecte[mois]?.faite === true || (lignes.length > 0 && lignes.every((l) => l.fournie));
  return { mois, echeance, lignes, faite, enRetard: !faite && joursEntre(echeance, aujourdhui) >= 0 };
}

/** LE RAPPEL DU JOUR, ou null. Il ne parle qu'à partir du 5, une fois par
    mois et par poste, et se tait quand la collecte est faite. */
export function rappelDu(campagne: Campagne, aujourdhui: string): { mois: string; message: string } | null {
  const jour = Number(aujourdhui.slice(8, 10));
  if (jour < JOUR_DE_COLLECTE) return null;
  const mois = moisACollecter(aujourdhui);
  if (campagne.collecte[mois]?.faite) return null;
  if (campagne.rappelVu === mois) return null;
  if (campagne.dateDepot && joursEntre(aujourdhui, campagne.dateDepot) < 0) return null;
  return {
    mois,
    message: `Dossier de bourse : la collecte de ${moisEnLettres(mois)} attend. Relevés, factures, quittances, bulletins, cinq minutes.`,
  };
}

/* ── Le rétro-planning ─────────────────────────────────────────────────── */
export type Etape = { date: string; quoi: string; duree: string };

/** Les rendez-vous avec soi-même, à rebours de la date de dépôt. Sans date
    publiée, on vise la fin février : c'est là qu'elle tombe chaque année. */
export function retroPlanning(aujourdhui: string, dateDepot?: string): Etape[] {
  const depot = dateDepot ?? `${Number(aujourdhui.slice(0, 4)) + (aujourdhui.slice(5, 7) >= '03' ? 1 : 0)}-02-26`;
  const etapes: Etape[] = [];
  const janvier = `${depot.slice(0, 4)}-01-05`;
  etapes.push({ date: aujourdhui, quoi: 'Classeur et dossier numérique ouverts ; le socle permanent scanné ; la fiche remplie.', duree: '2 h, une fois' });
  let m = plusMois(aujourdhui.slice(0, 7), 1);
  while (`${m}-05` < depot) {
    const quoi = m === janvier.slice(0, 7)
      ? 'Collecte de décembre, et les trois demandes du même jour : impôts, employeurs, comptable s’il y a lieu.'
      : `Collecte de ${moisEnLettres(plusMois(m, -1))} : relevés, factures, quittances, bulletins.`;
    etapes.push({ date: `${m}-05`, quoi, duree: m === janvier.slice(0, 7) ? '30 min' : '5 min' });
    m = plusMois(m, 1);
  }
  etapes.push({ date: plusJours(depot, -88), quoi: 'Dossier à blanc : tout ce qui existe, assemblé et chronométré. Ce qui manque doit être une pièce de janvier.', duree: '30 min' });
  etapes.push({ date: plusJours(depot, -80), quoi: 'La liste et le calendrier de l’Ambassade paraissent : comparer avec l’an dernier, prendre rendez-vous le jour même, télécharger le formulaire.', duree: '20 min' });
  etapes.push({ date: plusJours(depot, -36), quoi: 'Relancer ce qui n’est pas revenu : l’avis d’imposition d’abord.', duree: '10 min' });
  etapes.push({ date: plusJours(depot, -28), quoi: 'Le jour J : dater et signer les lettres, recopier le formulaire, assembler dans l’ordre, photocopier, garder l’original.', duree: '15 min' });
  etapes.push({ date: plusJours(depot, -14), quoi: 'Rendez-vous à la section consulaire et dépôt ; le reçu entre au classeur.', duree: 'le trajet' });
  etapes.push({ date: depot, quoi: 'Date limite de dépôt.', duree: '' });
  return etapes.sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Ce qui est sans objet, d'après la fiche ────────────────────────────── */
export function rubriquesSansObjet(fiche: Fiche): Set<string> {
  const s = new Set<string>(fiche.sansObjet);
  if (fiche.jamaisResideEnFrance) s.add('07');
  const independant = fiche.emplois.some((e) => e.statut === 'independant');
  const salarie = fiche.emplois.some((e) => e.statut === 'salarie');
  if (!independant) { s.add('13'); s.add('14'); s.add('15'); }
  if (!salarie) s.add('18');
  if (fiche.situation !== 'divorce' && fiche.situation !== 'separe' && fiche.situation !== 'veuf') s.add('11');
  if (['marie', 'concubin', 'pacs'].includes(fiche.situation)) s.add('12');
  if (fiche.logement.statut !== 'heberge' && !fiche.logement.valeurLocative) s.add('19');
  if (fiche.logement.statut !== 'proprietaire') s.add('21');
  return s;
}

/* ── L'état du dossier, rubrique par rubrique ───────────────────────────── */
export type EtatDeRubrique = 'fournie' | 'a-rediger' | 'manquante' | 'sans-objet' | 'expiree';
export type LigneDuDossier = { rubrique: Rubrique; etat: EtatDeRubrique; pieces: Piece[] };

/** Pour une pièce mensuelle, les trois mois qui précèdent le dépôt (ou aujourd'hui). */
export function moisAttendus(aujourdhui: string, dateDepot?: string): string[] {
  const ref = dateDepot ?? aujourdhui;
  const dernier = plusMois(ref.slice(0, 7), -1);
  return [plusMois(dernier, -2), plusMois(dernier, -1), dernier];
}

export function etatDuDossier(pieces: readonly Piece[], fiche: Fiche, aujourdhui: string, dateDepot?: string): LigneDuDossier[] {
  const sansObjet = rubriquesSansObjet(fiche);
  const attendus = moisAttendus(aujourdhui, dateDepot);
  return RUBRIQUES.map((r) => {
    const siennes = pieces.filter((p) => p.rubrique === r.n);
    if (sansObjet.has(r.n)) return { rubrique: r, etat: 'sans-objet' as const, pieces: siennes };
    if (siennes.some((p) => etatDExpiration(p.expireLe, aujourdhui) === 'expiree')) return { rubrique: r, etat: 'expiree' as const, pieces: siennes };
    if (r.rythme === 'mensuel') {
      const ok = attendus.every((m) => siennes.some((p) => p.mois === m)) || (r.lettre && siennes.length === 0 && fiche.logement.statut === 'heberge');
      return { rubrique: r, etat: ok ? (siennes.length ? 'fournie' : 'a-rediger') : 'manquante', pieces: siennes };
    }
    if (siennes.length > 0) return { rubrique: r, etat: 'fournie' as const, pieces: siennes };
    return { rubrique: r, etat: r.lettre ? 'a-rediger' as const : 'manquante' as const, pieces: siennes };
  });
}

export const MOT_DE_L_ETAT: Record<EtatDeRubrique, string> = {
  fournie: 'au coffre', 'a-rediger': 'rédigée par le Trône', manquante: 'manque', 'sans-objet': 'sans objet', expiree: 'pièce expirée',
};

/* ── Le nommage des fichiers ────────────────────────────────────────────── */
/** « 05 », « facture sbee.jpg », « 2026-10 » → « 05-facture-sbee-2026-10.jpg ».
    Le numéro, la nature, puis le mois : le tri alphabétique range le classeur. */
export function nomDeFichier(rubrique: string, nomOriginal: string, mois?: string): string {
  const point = nomOriginal.lastIndexOf('.');
  const ext = point > 0 ? nomOriginal.slice(point).toLowerCase() : '';
  const base = (point > 0 ? nomOriginal.slice(0, point) : nomOriginal)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'piece';
  return `${rubrique}-${base}${mois ? `-${mois}` : ''}${ext}`;
}

/* ── L'ordre d'assemblage ───────────────────────────────────────────────── */
export type ElementAAssembler =
  | { genre: 'bordereau' }
  | { genre: 'lettre'; lettre: GenreDeLettre; rubrique: string; mois?: string }
  | { genre: 'piece'; piece: Piece };

/** Le dossier déposé, dans l'ordre de la liste : le bordereau ouvre, puis
    chaque rubrique donne sa lettre rédigée s'il y en a une, puis ses pièces
    (les mensuelles du mois le plus ancien au plus récent). Les rubriques sans
    objet ne laissent rien. */
export function ordreDAssemblage(pieces: readonly Piece[], fiche: Fiche, aujourdhui: string, dateDepot?: string): ElementAAssembler[] {
  const sansObjet = rubriquesSansObjet(fiche);
  const ordre: ElementAAssembler[] = [{ genre: 'bordereau' }];
  const attendus = moisAttendus(aujourdhui, dateDepot);
  for (const r of RUBRIQUES) {
    if (sansObjet.has(r.n)) continue;
    const siennes = [...pieces.filter((p) => p.rubrique === r.n)].sort((a, b) => (a.mois ?? '').localeCompare(b.mois ?? '') || a.nom.localeCompare(b.nom));
    if (r.lettre === 'quittance') {
      if (fiche.logement.statut === 'heberge') {
        ordre.push({ genre: 'lettre', lettre: 'hebergement', rubrique: r.n });
        for (const m of attendus) if (!siennes.some((p) => p.mois === m)) ordre.push({ genre: 'lettre', lettre: 'quittance', rubrique: r.n, mois: m });
      }
    } else if (r.lettre === 'employeur') {
      fiche.emplois.filter((e) => e.statut === 'salarie').forEach(() => ordre.push({ genre: 'lettre', lettre: 'employeur', rubrique: r.n }));
    } else if (r.lettre) {
      ordre.push({ genre: 'lettre', lettre: r.lettre, rubrique: r.n });
    }
    for (const p of siennes) if (p.chemin) ordre.push({ genre: 'piece', piece: p });
  }
  return ordre;
}

/* ── Les lettres ─────────────────────────────────────────────────────────
   Chaque lettre est rendue en TEXTE STRUCTURÉ : l'écran la montre, le PDF la
   pose. Pas de mise en page ici. Les champs encore vides sortent entre
   crochets, pour qu'un oubli se voie avant d'être signé. */
export type Lettre = {
  entete: string[];
  destinataire?: string[];
  lieuDate: string;
  titre?: string;
  objet?: string;
  paragraphes: string[];
  signatures: string[];
  /** Vrai quand la Maison elle-même signe : monogramme, nom et devise. */
  deLaMaison?: boolean;
};

const ou = (v: string | undefined, champ: string): string => (v && v.trim() ? v.trim() : `[${champ}]`);
const nomComplet = (p: Parent): string => `${ou(p.prenom, 'prénom')} ${ou(p.nom, 'NOM')}`;
const civilite = (p: Parent, sexe: 'f' | 'm' | '' = ''): string => (sexe === 'm' ? 'M.' : 'Mme');
const accord = (e: Enfant, f: string, m: string): string => (e.sexe === 'm' ? m : e.sexe === 'f' ? f : `${m}(e)`);

const lieuDate = (fiche: Fiche, date?: string): string => {
  const ville = (fiche.adresse.split(',').pop() ?? '').trim() || 'Cotonou';
  return `${ville}, le ${date ? dateEnLettres(date) : '[date du dépôt]'}`;
};

export function texteLettreDeDemande(fiche: Fiche, campagne: Pick<Campagne, 'anneeScolaire' | 'anneeReference'>, date?: string): Lettre {
  const p1 = fiche.parent1, p2 = fiche.parent2;
  const deux = !!(p2.nom || p2.prenom);
  const enfants = fiche.enfants.map((e) => `${ou(e.prenom, 'prénom')} ${ou(e.nom, 'NOM')}, ${accord(e, 'née', 'né')} le ${e.naissance ? dateEnLettres(e.naissance) : '[date]'}, qui entrera en classe de ${ou(e.classe, 'classe')}`);
  const etablissements = [...new Set(fiche.enfants.map((e) => e.etablissement.trim()).filter(Boolean))];
  const nb = 2 + fiche.enfants.length - (deux ? 0 : 1);
  const emploiDe = (n: 1 | 2): string => {
    const e = fiche.emplois.find((x) => x.parent === n);
    if (!e || !e.statut) return '[situation professionnelle]';
    if (e.statut === 'salarie') return `est salarié(e) de ${ou(e.employeur, 'employeur')} en qualité de ${ou(e.poste, 'poste')}`;
    if (e.statut === 'independant') return `exerce ${ou(e.poste, 'activité')} au sein de ${ou(e.employeur, 'entreprise')}`;
    return `est sans emploi${e.sansEmploiDepuis ? ` depuis le ${dateEnLettres(e.sansEmploiDepuis)}` : ''}`;
  };
  const logement = fiche.logement.statut === 'heberge'
    ? `dans un logement mis à notre disposition à titre gracieux par ${ou(fiche.logement.hebergeant.nom, 'hébergeant')}, dont nous assumons les charges`
    : fiche.logement.statut === 'locataire' ? `dans un logement loué ${fiche.logement.loyer ? `${fiche.logement.loyer} francs CFA par mois` : '[loyer]'}`
      : fiche.logement.statut === 'proprietaire' ? 'dans un logement dont nous sommes propriétaires' : '[logement]';
  const paragraphes = [
    'Madame, Monsieur,',
    `Nous avons l’honneur de solliciter ${fiche.enfants.length > 1 ? 'le renouvellement de la bourse scolaire' : 'une bourse scolaire'} pour l’année ${campagne.anneeScolaire} au bénéfice de ${fiche.enfants.length > 1 ? `nos ${fiche.enfants.length} enfants` : 'notre enfant'}${etablissements.length ? `, scolarisé${fiche.enfants.length > 1 ? 's' : ''} à ${etablissements.join(' et ')}` : ''} : ${enfants.join(' ; ') || '[enfants]'}.`,
    `Notre foyer compte ${nb} personnes et réside ${logement}. ${civilite(p1)} ${nomComplet(p1)} ${emploiDe(1)}.${deux ? ` ${civilite(p2, 'm')} ${nomComplet(p2)} ${emploiDe(2)}.` : ''}`,
    `Au titre de l’année de référence ${campagne.anneeReference}, les revenus du foyer sont justifiés par les pièces jointes : bulletins de salaire ou comptes visés, attestations des employeurs, avis d’imposition et relevés bancaires.`,
  ];
  if (fiche.parascolaire.trim()) paragraphes.push(`Outre les frais de scolarité, nous sollicitons la prise en charge des frais parascolaires : ${fiche.parascolaire.trim()}`);
  paragraphes.push(
    'Vous trouverez ci-joint l’ensemble des pièces demandées, numérotées dans l’ordre du bordereau placé en tête du dossier. Nous nous tenons à votre disposition pour tout document complémentaire que l’instruction du dossier rendrait nécessaire.',
    'Nous vous prions d’agréer, Madame, Monsieur, l’expression de notre considération distinguée.',
  );
  return {
    entete: [
      `${civilite(p1)} ${nomComplet(p1)}`, ...(deux ? [`${civilite(p2, 'm')} ${nomComplet(p2)}`] : []),
      ou(fiche.adresse, 'adresse'), ...(fiche.boitePostale ? [fiche.boitePostale] : []),
      `Tél. ${ou(fiche.telephone, 'téléphone')} · ${ou(fiche.courriel, 'courriel')}`,
      `N° d’inscription au registre des Français établis hors de France : ${ou((fiche.demandeur === 2 ? p2 : p1).numic, 'NUMIC')}`,
    ],
    destinataire: ['À l’attention de Madame, Monsieur le Chef de la section consulaire', 'Ambassade de France au Bénin', 'Conseil consulaire des bourses scolaires'],
    lieuDate: lieuDate(fiche, date),
    objet: `Objet : demande de bourse scolaire, campagne ${campagne.anneeScolaire}`,
    paragraphes,
    signatures: deux ? [`${civilite(p1)} ${nomComplet(p1)}`, `${civilite(p2, 'm')} ${nomComplet(p2)}`] : [`${civilite(p1)} ${nomComplet(p1)}`],
  };
}

/** L'attestation de l'employeur. Quand l'employeur est la Maison, c'est elle
    qui signe : son nom, sa raison et sa ville viennent de l'identité, jamais
    de la fiche. */
export function texteAttestationEmployeur(
  fiche: Fiche, emploi: Emploi, campagne: Pick<Campagne, 'anneeReference'>,
  maison: { nom: string; raison: string; ville: string }, date?: string,
): Lettre {
  const parent = emploi.parent === 2 ? fiche.parent2 : fiche.parent1;
  const employeur = emploi.estLaMaison ? maison.nom : ou(emploi.employeur, 'employeur');
  const enfants = fiche.enfants.map((e) => `${ou(e.prenom, 'prénom')} ${ou(e.nom, 'NOM')}`).join(', ') || '[enfants]';
  const paragraphes = [
    `Je soussigné(e), ${ou(emploi.signataire, 'signataire')}, agissant en qualité de ${ou(emploi.qualite, 'qualité')} de ${employeur}${emploi.estLaMaison ? ` (${maison.raison})` : emploi.rccm ? `, immatriculée au registre du commerce sous le numéro ${emploi.rccm}${emploi.ifu ? ` (IFU ${emploi.ifu})` : ''}` : ''}, atteste par la présente que :`,
    `${civilite(parent, emploi.parent === 2 ? 'm' : '')} ${nomComplet(parent)}${parent.naissance ? `, ${emploi.parent === 2 ? 'né' : 'née'} le ${dateEnLettres(parent.naissance)}${parent.lieu ? ` à ${parent.lieu}` : ''}` : ''}, est employé(e) au sein de ${emploi.estLaMaison ? 'la Maison' : 'notre entreprise'} en qualité de ${ou(emploi.poste, 'poste')}${emploi.depuis ? ` depuis le ${dateEnLettres(emploi.depuis)}` : ' depuis le [date d’entrée]'} ;`,
    `sa rémunération au titre de l’année ${campagne.anneeReference} s’est élevée à ${ou(emploi.salaireBrut, 'montant')} francs CFA brut et ${ou(emploi.salaireNet, 'montant')} francs CFA net, versée mensuellement ;`,
    emploi.participeAuxFrais
      ? `${emploi.estLaMaison ? 'la Maison' : 'l’entreprise'} participe aux dépenses de scolarisation de ses enfants, ${enfants}, à hauteur de [montant] francs CFA par an.`
      : `${emploi.estLaMaison ? 'la Maison' : 'l’entreprise'} ne participe à aucune dépense de scolarisation de ses enfants, ${enfants}.`,
  ];
  if (emploi.lienFamilial.trim()) paragraphes.push(`Je précise, le formulaire de demande le requérant, le lien qui unit l’employé(e) à l’employeur : ${emploi.lienFamilial.trim()}.`);
  paragraphes.push('La présente attestation est délivrée à l’intéressé(e), à sa demande, pour servir et valoir ce que de droit auprès du Conseil consulaire des bourses scolaires de l’Ambassade de France au Bénin.');
  return {
    entete: emploi.estLaMaison
      ? [maison.nom, maison.raison, maison.ville]
      : [employeur, ...(emploi.siege ? [`Siège social : ${emploi.siege}`] : []), ...(emploi.rccm || emploi.ifu ? [[emploi.rccm ? `RCCM ${emploi.rccm}` : '', emploi.ifu ? `IFU ${emploi.ifu}` : ''].filter(Boolean).join(' · ')] : []), ...(emploi.telephone ? [`Tél. ${emploi.telephone}`] : [])],
    lieuDate: `${emploi.estLaMaison ? maison.ville : (emploi.siege.split(',').pop() ?? '').trim() || 'Cotonou'}, le ${date ? dateEnLettres(date) : '[date]'}`,
    titre: 'Attestation de l’employeur',
    objet: 'Participation aux dépenses de scolarisation et rémunération annuelle',
    paragraphes,
    signatures: ['Cachet', `${ou(emploi.signataire, 'signataire')}, ${ou(emploi.qualite, 'qualité')}`],
    deLaMaison: emploi.estLaMaison,
  };
}

export function texteAttestationHebergement(fiche: Fiche, date?: string): Lettre {
  const h = fiche.logement.hebergeant;
  const p1 = fiche.parent1, p2 = fiche.parent2;
  const deux = !!(p2.nom || p2.prenom);
  const enfants = fiche.enfants.map((e) => `${ou(e.prenom, 'prénom')} ${ou(e.nom, 'NOM')}, ${accord(e, 'née', 'né')} le ${e.naissance ? dateEnLettres(e.naissance) : '[date]'}`).join(', ');
  const paragraphes = [
    `Je soussigné(e), ${ou(h.nom, 'nom de l’hébergeant')}${h.naissance ? `, né(e) le ${dateEnLettres(h.naissance)}${h.lieu ? ` à ${h.lieu}` : ''}` : ''}, demeurant ${ou(h.adresse, 'adresse de l’hébergeant')}, certifie sur l’honneur héberger à titre gracieux${h.depuis ? `, depuis ${h.depuis},` : ''} dans le logement dont je suis propriétaire, situé ${ou(fiche.logement.adresse || fiche.adresse, 'adresse du logement')} :`,
    `${civilite(p1)} ${nomComplet(p1)}${p1.naissance ? `, née le ${dateEnLettres(p1.naissance)}${p1.lieu ? ` à ${p1.lieu}` : ''}` : ''} ;`,
    ...(deux ? [`${civilite(p2, 'm')} ${nomComplet(p2)}${p2.naissance ? `, né le ${dateEnLettres(p2.naissance)}${p2.lieu ? ` à ${p2.lieu}` : ''}` : ''} ;`] : []),
    `ainsi que ${fiche.enfants.length > 1 ? 'leurs enfants' : 'leur enfant'} ${enfants || '[enfants]'}.`,
    `Ce logement est mis à leur disposition sans contrepartie de loyer ; les occupants s’acquittent des seules charges courantes, dont les quittances sont jointes au dossier.${fiche.logement.valeurLocative ? ` Sa valeur locative est estimée à ${fiche.logement.valeurLocative} francs CFA par mois, montant déclaré au titre des avantages en nature.` : ''}`,
    'En foi de quoi, la présente attestation leur est délivrée pour servir et valoir ce que de droit.',
    'Pièces jointes : copie de ma pièce d’identité ; une facture d’électricité ou d’eau de moins de trois mois établie à mon nom pour ce logement.',
  ];
  return {
    entete: [ou(h.nom, 'nom de l’hébergeant'), ou(h.adresse, 'adresse'), `Tél. ${ou(h.telephone, 'téléphone')}`],
    lieuDate: lieuDate(fiche, date),
    titre: 'Attestation d’hébergement à titre gracieux',
    paragraphes,
    signatures: [ou(h.nom, 'nom de l’hébergeant')],
  };
}

export function texteQuittance(fiche: Fiche, mois: string, date?: string): Lettre {
  const h = fiche.logement.hebergeant;
  const occupants = `${civilite(fiche.parent1)} ${nomComplet(fiche.parent1)}${fiche.parent2.nom ? ` et ${civilite(fiche.parent2, 'm')} ${nomComplet(fiche.parent2)}` : ''}`;
  const charges = ou(fiche.logement.charges, 'montant des charges');
  return {
    entete: [ou(h.nom, 'bailleur'), ou(h.adresse, 'adresse du bailleur'), `Tél. ${ou(h.telephone, 'téléphone')}`],
    destinataire: ['Occupants :', occupants, ou(fiche.logement.adresse || fiche.adresse, 'adresse du logement'), 'Hébergés à titre gracieux'],
    lieuDate: lieuDate(fiche, date),
    titre: `Quittance des charges · ${moisEnLettres(mois)}`,
    paragraphes: [
      `Je soussigné(e), ${ou(h.nom, 'bailleur')}, propriétaire du logement situé ${ou(fiche.logement.adresse || fiche.adresse, 'adresse du logement')}, déclare avoir reçu de ${occupants}, occupants de ce logement, la somme de ${charges} francs CFA au titre des charges courantes (eau, électricité, entretien) pour la période du ${dateEnLettres(premierJourDuMois(mois))} au ${dateEnLettres(dernierJourDuMois(mois))}.`,
      `Loyer : néant, hébergement à titre gracieux. Charges courantes : ${charges} francs CFA. Total reçu : ${charges} francs CFA.`,
      'Cette quittance est délivrée sous réserve d’encaissement et ne vaut pas reçu des périodes antérieures.',
    ],
    signatures: [ou(h.nom, 'bailleur')],
  };
}

export function texteAttestationSurLHonneur(fiche: Fiche, date?: string): Lettre {
  const p = fiche.demandeur === 2 ? fiche.parent2 : fiche.parent1;
  const enfants = fiche.enfants.map((e) => ou(e.prenom, 'prénom')).join(', ') || '[prénoms]';
  return {
    entete: [`${civilite(p, fiche.demandeur === 2 ? 'm' : '')} ${nomComplet(p)}`, ou(fiche.adresse, 'adresse')],
    lieuDate: lieuDate(fiche, date),
    titre: 'Attestation sur l’honneur de non-concubinage',
    paragraphes: [
      `Je soussigné(e), ${nomComplet(p)}${p.naissance ? `, né(e) le ${dateEnLettres(p.naissance)}${p.lieu ? ` à ${p.lieu}` : ''}` : ''}, demeurant ${ou(fiche.adresse, 'adresse')}, atteste sur l’honneur vivre seul(e) avec ${fiche.enfants.length > 1 ? 'mes enfants' : 'mon enfant'} ${enfants} et ne pas vivre en concubinage.`,
      'J’ai connaissance des sanctions encourues en cas de fausse déclaration.',
    ],
    signatures: [nomComplet(p)],
  };
}

export function texteAttestationAvantages(fiche: Fiche, date?: string): Lettre {
  const h = fiche.logement.hebergeant;
  const p = fiche.demandeur === 2 ? fiche.parent2 : fiche.parent1;
  return {
    entete: [ou(h.nom, 'qui consent l’avantage'), ou(h.adresse, 'adresse')],
    lieuDate: lieuDate(fiche, date),
    titre: 'Attestation d’avantages en nature',
    paragraphes: [
      `Je soussigné(e), ${ou(h.nom, 'nom')}, atteste mettre à la disposition de ${nomComplet(p)} les avantages en nature suivants :`,
      `logement situé ${ou(fiche.logement.adresse || fiche.adresse, 'adresse')}, valeur locative estimée ${ou(fiche.logement.valeurLocative, 'montant')} francs CFA par mois.`,
      'Fait pour servir et valoir ce que de droit.',
    ],
    signatures: [ou(h.nom, 'nom')],
  };
}

/** Le texte d'une lettre du dossier, par son genre. `null` quand la fiche ne
    la justifie pas (pas d'hébergeant, pas d'emploi salarié…). */
export function lettreDuDossier(
  genre: GenreDeLettre, fiche: Fiche, campagne: Pick<Campagne, 'anneeScolaire' | 'anneeReference'>,
  maison: { nom: string; raison: string; ville: string }, o: { mois?: string; emploi?: Emploi; date?: string } = {},
): Lettre | null {
  switch (genre) {
    case 'demande': return texteLettreDeDemande(fiche, campagne, o.date);
    case 'employeur': {
      const e = o.emploi ?? fiche.emplois.find((x) => x.statut === 'salarie');
      return e ? texteAttestationEmployeur(fiche, e, campagne, maison, o.date) : null;
    }
    case 'hebergement': return fiche.logement.statut === 'heberge' ? texteAttestationHebergement(fiche, o.date) : null;
    case 'quittance': return fiche.logement.statut === 'heberge' && o.mois ? texteQuittance(fiche, o.mois, o.date) : null;
    case 'honneur': return texteAttestationSurLHonneur(fiche, o.date);
    case 'avantages': return texteAttestationAvantages(fiche, o.date);
  }
}

/** Ce qu'une lettre laisse encore entre crochets : les champs à remplir avant de signer. */
export const champsVides = (l: Lettre): string[] =>
  [...new Set([...l.entete, l.lieuDate, ...(l.destinataire ?? []), ...l.paragraphes, ...l.signatures].flatMap((s) => s.match(/\[([^\]]+)\]/g) ?? []))];

/* ── Le bordereau ───────────────────────────────────────────────────────── */
export type LigneDeBordereau = { n: string; piece: string; etat: string };

export function lignesDuBordereau(pieces: readonly Piece[], fiche: Fiche, aujourdhui: string, dateDepot?: string): LigneDeBordereau[] {
  return etatDuDossier(pieces, fiche, aujourdhui, dateDepot)
    .filter((l) => l.etat !== 'sans-objet')
    .map((l) => ({
      n: l.rubrique.n,
      piece: l.rubrique.libelle,
      etat: l.etat === 'fournie' ? `${l.pieces.length} pièce${l.pieces.length > 1 ? 's' : ''}` : MOT_DE_L_ETAT[l.etat],
    }));
}

/** Le nom de la campagne qui suit celle en cours, d'après la date : avant
    mars on dépose pour la rentrée de la même année civile, après pour la suivante. */
export function campagneSuivante(aujourdhui: string): { anneeScolaire: string; anneeReference: number } {
  const a = Number(aujourdhui.slice(0, 4));
  const rentree = aujourdhui.slice(5, 7) >= '03' ? a + 1 : a;
  return { anneeScolaire: `${rentree}-${rentree + 1}`, anneeReference: rentree - 1 };
}
