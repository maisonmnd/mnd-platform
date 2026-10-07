/* LE DOSSIER DE BOURSE SCOLAIRE, LE PUR — 7 octobre 2026.

   « Chaque année je remplis un dossier de bourse pour les enfants et ça me
   prend un temps fou, parfois 2 à 3 semaines. Maximum 15 minutes » (Yéman).
   Maquette W7LtTpMSnosdu6zuk8esaL validée (« construis »), dépôt au plus
   tard le 30 janvier 2027 à la section consulaire de Cotonou.

   L'IDÉE : ce qui ne change pas se saisit une fois (les constantes), ce qui
   change tient en quelques champs (l'année), ce qui arrive au fil des mois
   se range quand ça arrive (les rappels), et la machine fait avancer seule
   l'année de campagne, les classes et les dates des quittances.

   Ici, rien que des fonctions : le catalogue des champs, la campagne, les
   classes, le calendrier, l'état des pièces, les textes des documents. Le
   harnais `verifie-la-bourse` les éprouve. Un champ vide ne s'invente
   jamais : il s'écrit entre crochets, et un document entre crochets ne se
   signe pas (règle du Secrétariat). */

/* ══ LES CHAMPS ══════════════════════════════════════════════════════ */

export type Groupe = 'demandeur' | 'parent2' | 'enfants' | 'foyer' | 'tiers' | 'annee';

export type Champ = {
  cle: string;
  libelle: string;
  groupe: Groupe;
  /** Ce qu'on écrit quand rien n'est saisi (jamais une valeur inventée). */
  defaut?: string;
  aide?: string;
  type?: 'texte' | 'date' | 'montant' | 'choix';
  choix?: string[];
};

/** Les classes, dans l'ordre : une année de plus, un cran de plus. */
export const CLASSES = ['PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', '2de', '1re', 'Tle'];

/* Les valeurs par défaut sont génériques. LE DÉPÔT EST PUBLIC : aucune date
   de naissance, aucune adresse de la famille n'est écrite ici. Elles vivent
   dans le dossier privé (ligne `bourse-famille`, direction seule), remplies
   depuis les documents de Yéman par un script posé sur son bureau, jamais
   versé au dépôt. */
export const CHAMPS: Champ[] = [
  /* Le demandeur */
  { cle: 'demandeur', libelle: 'Nom et prénom du demandeur', groupe: 'demandeur', defaut: 'BOYA épouse AHOUANSOU Yéman' },
  { cle: 'naissanceDemandeur', libelle: 'Date de naissance', groupe: 'demandeur', type: 'date' },
  { cle: 'lieuDemandeur', libelle: 'Lieu et pays de naissance', groupe: 'demandeur', defaut: 'Cotonou, Bénin' },
  { cle: 'numic', libelle: 'N° d’inscription au registre des Français (NUMIC)', groupe: 'demandeur', aide: 'Sur la carte consulaire' },
  { cle: 'nationalite', libelle: 'Nationalité', groupe: 'demandeur' },
  { cle: 'lien', libelle: 'Lien avec les enfants', groupe: 'demandeur', defaut: 'Mère' },
  { cle: 'adresse', libelle: 'Adresse postale complète', groupe: 'demandeur', aide: 'Celle du formulaire, avec la boîte postale' },
  { cle: 'telephone', libelle: 'Téléphone', groupe: 'demandeur' },
  { cle: 'courriel', libelle: 'Adresse électronique', groupe: 'demandeur' },
  { cle: 'arrivee', libelle: 'Date d’arrivée dans le pays', groupe: 'demandeur', aide: 'Une date, ou « née au Bénin »' },
  { cle: 'adresseFrance', libelle: 'Dernière adresse en France', groupe: 'demandeur', defaut: 'néant' },
  { cle: 'caf', libelle: 'N° d’allocataire CAF · organisme payeur', groupe: 'demandeur', defaut: 'néant' },
  { cle: 'poste', libelle: 'Votre poste chez NYM SARL', groupe: 'demandeur' },
  { cle: 'entree', libelle: 'Date d’entrée chez NYM SARL', groupe: 'demandeur', type: 'date' },
  /* Le second parent */
  { cle: 'p2Nom', libelle: 'Nom', groupe: 'parent2', defaut: 'AHOUANSOU' },
  { cle: 'p2Prenoms', libelle: 'Prénoms', groupe: 'parent2', defaut: 'Brice Ariel Laurent' },
  { cle: 'p2Naissance', libelle: 'Date de naissance', groupe: 'parent2', type: 'date' },
  { cle: 'p2Lieu', libelle: 'Lieu et pays de naissance', groupe: 'parent2' },
  { cle: 'p2Profession', libelle: 'Profession', groupe: 'parent2' },
  { cle: 'p2Employeur', libelle: 'Employeur', groupe: 'parent2', aide: 'Ou « sans emploi depuis le … »' },
  /* Les enfants (trois ; la classe est celle de la rentrée 2027, elle avance seule) */
  ...[1, 2, 3].flatMap((n) => [
    { cle: `e${n}Prenom`, libelle: `Enfant ${n} · prénom(s)`, groupe: 'enfants' as const },
    { cle: `e${n}Naissance`, libelle: `Enfant ${n} · date de naissance`, groupe: 'enfants' as const, type: 'date' as const },
    { cle: `e${n}Immat`, libelle: `Enfant ${n} · n° d’immatriculation consulaire`, groupe: 'enfants' as const },
    { cle: `e${n}Classe2027`, libelle: `Enfant ${n} · classe à la rentrée 2027`, groupe: 'enfants' as const, type: 'choix' as const, choix: CLASSES,
      defaut: ['CE2', 'CM2', '4e'][n - 1] },
  ]),
  { cle: 'ecole', libelle: 'Établissement', groupe: 'enfants', defaut: 'École française Montaigne, Cotonou' },
  { cle: 'cases', libelle: 'Bourses demandées (cases)', groupe: 'enfants', defaut: 'S' , aide: 'S, SA, D, V, E… comme sur le formulaire' },
  { cle: 'raisons', libelle: 'Raisons des frais parascolaires', groupe: 'enfants', aide: 'Obligatoire si D ou V : travail des parents, éloignement' },
  /* Le foyer */
  { cle: 'logement', libelle: 'Adresse du logement', groupe: 'foyer', aide: 'Écrite pour la phrase, avec « au » devant' },
  { cle: 'superficie', libelle: 'Superficie du logement (m²)', groupe: 'foyer' },
  { cle: 'pieces', libelle: 'Nombre de pièces', groupe: 'foyer' },
  { cle: 'occupants', libelle: 'Nombre d’occupants', groupe: 'foyer', defaut: '5' },
  { cle: 'distance', libelle: 'Distance domicile · école (km)', groupe: 'foyer' },
  { cle: 'vehicule', libelle: 'Véhicule : modèle, date d’achat, valeur', groupe: 'foyer' },
  { cle: 'comptes', libelle: 'Comptes bancaires du dossier', groupe: 'foyer', aide: 'Type · banque, pour chacun' },
  { cle: 'personnel', libelle: 'Personnel de service', groupe: 'foyer', defaut: 'néant' },
  { cle: 'voyages', libelle: 'Clubs · voyages hors du pays (2 ans)', groupe: 'foyer', defaut: 'néant' },
  { cle: 'autreAide', libelle: 'Autre aide à la scolarisation', groupe: 'foyer', defaut: 'non' },
  /* Les tiers */
  /* L'HÉBERGEANT, NOMMÉ PAR VOUS (7 octobre 2026) : « Je remplirai moi-même
     le nom de la personne qui nous fait les lettres » (Yéman). Aucun nom
     n'est écrit dans le code ; vide, son attestation et ses quittances ne se
     préparent pas. Les valeurs gardées sous d'anciens noms reprennent les leurs (`aJour`). */
  { cle: 'hebergeant', libelle: 'Nom de l’hébergeant', groupe: 'tiers', aide: 'Nom à remplir, avec M. ou Mme : il signe l’attestation et les quittances' },
  { cle: 'hebergeantAdresse', libelle: 'Adresse de l’hébergeant', groupe: 'tiers', aide: 'Écrite pour la phrase, avec « au » devant' },
  { cle: 'hebergeantTel', libelle: 'Téléphone de l’hébergeant', groupe: 'tiers' },
  { cle: 'hebergeDepuis', libelle: 'Hébergés depuis (année)', groupe: 'tiers' },
  { cle: 'hebergeantSigne', libelle: 'L’hébergeant signe', groupe: 'tiers', type: 'choix', choix: ['P/O par vous', 'Lui-même'], defaut: 'P/O par vous' },
  /* L'année (revenus de l'année de référence) */
  { cle: 'brut', libelle: 'Votre salaire brut annuel (NYM SARL)', groupe: 'annee', type: 'montant', aide: 'Somme des douze bulletins' },
  { cle: 'net', libelle: 'Votre salaire net annuel', groupe: 'annee', type: 'montant' },
  { cle: 'cnss', libelle: 'CNSS, part salariale de l’année', groupe: 'annee', type: 'montant' },
  { cle: 'impot', libelle: 'Impôt sur le revenu de l’année', groupe: 'annee', type: 'montant', aide: 'Avis d’imposition' },
  { cle: 'revenusP2', libelle: 'Revenus bruts du second parent', groupe: 'annee', type: 'montant', defaut: '0' },
  { cle: 'valeurLocative', libelle: 'Valeur locative du logement, par mois', groupe: 'annee', type: 'montant' },
  { cle: 'charges', libelle: 'Charges payées à l’hébergeant, par mois', groupe: 'annee', type: 'montant', defaut: '60000' },
  { cle: 'soldes', libelle: 'Soldes des comptes au dépôt', groupe: 'annee', aide: 'Un par compte' },
  { cle: 'depot', libelle: 'Date du dépôt', groupe: 'annee', type: 'date', aide: 'Au plus tard le 30 janvier' },
];

export const champ = (cle: string): Champ | undefined => CHAMPS.find((c) => c.cle === cle);

/* LES ANCIENS NOMS DES CHAMPS (avant le 7 octobre au soir) : une valeur
   gardée sous l'un d'eux reprend son nom d'aujourd'hui, sans rien perdre. */
const ANCIENS_NOMS: Record<string, string> = {
  thomasAdresse: 'hebergeantAdresse', thomasTel: 'hebergeantTel', thomasDepuis: 'hebergeDepuis', thomasSigne: 'hebergeantSigne',
};
export function aJour(v: Valeurs): Valeurs {
  const out: Valeurs = { ...v };
  for (const [ancien, neuf] of Object.entries(ANCIENS_NOMS)) {
    if (out[ancien] !== undefined && !(out[neuf] ?? '').trim()) out[neuf] = out[ancien];
    delete out[ancien];
  }
  return out;
}
export function membresAJour(m: Membres & Record<string, string | undefined>): Membres {
  const { thomas: ancien, ...reste } = m;
  return { ...reste, hebergeant: reste.hebergeant ?? ancien };
}

/** « au lot 12 » → « lot 12 » : l'adresse écrite pour la phrase, rendue à l'enveloppe. */
export const sansPreposition = (adresse: string): string => adresse.replace(/^(au|aux|à la|à l’|à l'|à)\s+/i, '');

export type Valeurs = Record<string, string>;

/** La valeur saisie, sinon le défaut, sinon le libellé entre crochets. */
export function lis(v: Valeurs, cle: string): string {
  const saisi = (v[cle] ?? '').trim();
  if (saisi) return saisi;
  const c = champ(cle);
  if (c?.defaut !== undefined && c.defaut !== '') return c.defaut;
  const lib = c?.libelle ?? cle;
  return `[${lib.charAt(0).toLowerCase()}${lib.slice(1)}]`;
}

/** Les champs encore vides (sans défaut), groupe par groupe. */
export function aSaisir(v: Valeurs, groupe?: Groupe): Champ[] {
  return CHAMPS.filter((c) => (!groupe || c.groupe === groupe) && !(v[c.cle] ?? '').trim() && (c.defaut === undefined || c.defaut === ''));
}

/* ══ LA CAMPAGNE ═════════════════════════════════════════════════════ */

export type Campagne = { cle: string; rentree: number; reference: number; depot: string };

/** Le dépôt se fait en janvier pour la rentrée de septembre suivante. Dès
    juin, on prépare la campagne suivante. */
export function campagneDe(aujourdhui: string, depotSaisi?: string): Campagne {
  const [a, m] = aujourdhui.split('-').map((x) => parseInt(x, 10));
  const rentree = m >= 6 ? a + 1 : a;
  const depot = depotSaisi && /^\d{4}-\d{2}-\d{2}$/.test(depotSaisi) ? depotSaisi : `${rentree}-01-30`;
  return { cle: `${rentree}-${rentree + 1}`, rentree, reference: rentree - 1, depot };
}

/** La classe d'un enfant à une rentrée, depuis sa classe à la rentrée 2027. */
export function classeA(classe2027: string, rentree: number): string {
  const i = CLASSES.indexOf(classe2027);
  if (i < 0) return classe2027 || '[classe]';
  const j = i + (rentree - 2027);
  return j < 0 ? '[classe]' : j >= CLASSES.length ? 'études supérieures' : CLASSES[j];
}

/* ══ LES DATES ═══════════════════════════════════════════════════════ */

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n: number) => String(n).padStart(2, '0');

/** « 2027-01 » + n mois. */
export function moisPlus(mois: string, n: number): string {
  const [a, m] = mois.split('-').map((x) => parseInt(x, 10));
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export const nomDuMois = (mois: string): string => `${MOIS[parseInt(mois.slice(5, 7), 10) - 1]} ${mois.slice(0, 4)}`;
/** « d’avril 2026 », « de mai 2026 ». */
export const deMois = (mois: string): string => { const n = nomDuMois(mois); return /^[aeiouéo]/i.test(n) ? `d’${n}` : `de ${n}`; };
export const dernierJour = (mois: string): number => {
  const [a, m] = mois.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
/** « 13 avril 1981 » (l'année toujours, règle du 6 octobre). */
export function dateEnLettres(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const j = parseInt(iso.slice(8, 10), 10);
  return `${j === 1 ? '1er' : j} ${MOIS[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
}
/** « 13/04/1981 », comme sur le formulaire. */
export const dateCourte = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Les trois mois de quittances : ceux qui finissent par le mois du dépôt
    quand le dépôt tombe après le 20 (la quittance du mois se date le 25),
    sinon par le mois d'avant. */
export function moisDesQuittances(depot: string): string[] {
  const mois = depot.slice(0, 7);
  const fin = parseInt(depot.slice(8, 10), 10) >= 26 ? mois : moisPlus(mois, -1);
  return [moisPlus(fin, -2), moisPlus(fin, -1), fin];
}

/** La date d'une quittance : le 5 du mois suivant, ou le 25 du mois même
    quand c'est celui du dépôt (elle doit exister avant le guichet). */
export function dateDeLaQuittance(mois: string, depot: string): string {
  if (mois === depot.slice(0, 7)) return `${mois}-25`;
  return `${moisPlus(mois, 1)}-05`;
}

/** Les trois derniers mois COMPLETS avant le dépôt, pour les relevés. */
export function moisDesReleves(depot: string): string[] {
  const avant = moisPlus(depot.slice(0, 7), -1);
  return [moisPlus(avant, -2), moisPlus(avant, -1), avant];
}

/* ══ LES MONTANTS EN LETTRES ═════════════════════════════════════════ */

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function moinsDeCent(n: number): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) return `${d === 7 ? 'soixante' : 'quatre-vingt'}${u === 1 && d === 7 ? '-et-' : '-'}${moinsDeCent(10 + u)}`;
  if (d === 8) return u === 0 ? 'quatre-vingts' : `quatre-vingt-${UNITES[u]}`;
  if (u === 0) return DIZAINES[d];
  return `${DIZAINES[d]}${u === 1 ? '-et-un' : `-${UNITES[u]}`}`;
}
function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const tete = c === 0 ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 ? 's' : ''}`;
  return [tete, r ? moinsDeCent(r) : ''].filter(Boolean).join(' ');
}
/** 60000 → « soixante mille » (orthographe traditionnelle, sans tirets entre centaines). */
export function enLettres(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  n = Math.round(n);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;
  const morceaux: string[] = [];
  if (millions) morceaux.push(`${millions === 1 ? 'un' : moinsDeMille(millions)} million${millions > 1 ? 's' : ''}`);
  if (milliers) morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers).replace(/cents$/, 'cent').replace(/vingts$/, 'vingt')} mille`);
  if (reste) morceaux.push(moinsDeMille(reste));
  return morceaux.join(' ');
}
/** « 60 000 F CFA » (espace fine insécable). */
export const enChiffres = (n: number): string => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} F CFA`;
export const montant = (v: Valeurs, cle: string): number | null => {
  const s = (v[cle] ?? champ(cle)?.defaut ?? '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : null;
};

/* ══ LES PAPIERS DU DOSSIER ══════════════════════════════════════════ */

/** Les membres de la famille, reliés aux personnes du classeur des Papiers. */
export type Membres = { yeman?: string; brice?: string; e1?: string; e2?: string; e3?: string; hebergeant?: string };

/** Le minimum d'un papier que lit ce module (le classeur en donne plus). */
export type PapierLu = { titulaire: string; type: string; delivreLe: string; expireLe: string };

export type EtatPiece = 'pret' | 'attente' | 'manque' | 'alerte';
export type LigneDuBordereau = { n: string; titre: string; qui: string; etat: EtatPiece; dit: string };

const titulaire = (id?: string) => (id ? `pers:${id}` : '');
const aUn = (pp: readonly PapierLu[], t: string, type: string, mois?: string) =>
  !!t && pp.some((p) => p.titulaire === t && p.type === type && (!mois || p.delivreLe.slice(0, 7) === mois));

/** Les pièces 3 à 13 du bordereau, d'après le classeur ; 1, 2, 5a, 5c, 6
    viennent des documents générés et se disent à part. */
export function piecesDuClasseur(pp: readonly PapierLu[], m: Membres, c: Campagne, aujourdhui: string): LigneDuBordereau[] {
  const y = titulaire(m.yeman);
  const lignes: LigneDuBordereau[] = [];
  const passe = (fait: boolean, attendu: boolean): EtatPiece => (fait ? 'pret' : attendu ? 'manque' : 'attente');
  /* 3 · livret de famille */
  lignes.push({ n: '3', titre: 'Livret de famille, toutes les pages écrites', qui: 'Photocopie', etat: passe(aUn(pp, y, 'livret'), true), dit: aUn(pp, y, 'livret') ? 'rangé' : 'à ranger une fois' });
  /* 4 · passeports, et ceux qui expirent avant le dépôt */
  const membres = [m.yeman, m.brice, m.e1, m.e2, m.e3].filter((x): x is string => !!x);
  const passeports = membres.map((id) => pp.find((p) => p.titulaire === `pers:${id}` && p.type === 'passeport'));
  const manquent = (5 - membres.length) + passeports.filter((p) => !p).length;
  const expirent = passeports.filter((p) => p && p.expireLe && p.expireLe < c.depot).length;
  lignes.push({ n: '4', titre: 'Passeports des cinq membres', qui: 'Photocopie',
    etat: expirent ? 'alerte' : manquent ? 'manque' : 'pret',
    dit: expirent ? `${expirent} expire${expirent > 1 ? 'nt' : ''} avant le dépôt` : manquent ? `${manquent} à ranger` : 'rangés, à jour au dépôt' });
  /* 5b · pièce de l'hébergeant + facture de moins de 3 mois au dépôt */
  const t = titulaire(m.hebergeant);
  const facture = pp.find((p) => p.titulaire === t && p.type === 'facture');
  const factureFraiche = !!facture && !!facture.delivreLe && joursEntre(facture.delivreLe, c.depot) <= 90;
  const identite = aUn(pp, t, 'cni') || aUn(pp, t, 'cip') || aUn(pp, t, 'passeport');
  lignes.push({ n: '5b', titre: 'Pièce d’identité de l’hébergeant et facture de moins de 3 mois', qui: 'L’hébergeant',
    etat: identite && factureFraiche ? 'pret' : identite ? 'attente' : 'manque',
    dit: !identite ? 'sa pièce d’identité à ranger' : factureFraiche ? 'rangées' : 'facture à ranger en janvier' });
  /* 7 · activité du second parent */
  lignes.push({ n: '7', titre: 'Justificatif d’activité du second parent', qui: 'Employeur ou comptable', etat: passe(aUn(pp, titulaire(m.brice), 'activite'), true), dit: aUn(pp, titulaire(m.brice), 'activite') ? 'rangé' : 'à ranger' });
  /* 8, 9 · carte grise, plan */
  lignes.push({ n: '8', titre: 'Carte grise du ou des véhicules', qui: 'Photocopie', etat: passe(aUn(pp, y, 'carte-grise'), true), dit: aUn(pp, y, 'carte-grise') ? 'rangée' : 'à ranger une fois' });
  lignes.push({ n: '9', titre: 'Plan d’accès au domicile', qui: 'Vous', etat: passe(aUn(pp, y, 'plan-acces'), true), dit: aUn(pp, y, 'plan-acces') ? 'rangé' : 'à ranger une fois' });
  /* 10 · douze bulletins de l'année de référence */
  const moisRef = Array.from({ length: 12 }, (_, i) => `${c.reference}-${pad(i + 1)}`);
  const bulletins = moisRef.filter((mo) => aUn(pp, y, 'bulletin', mo)).length;
  const dusBulletins = moisRef.filter((mo) => `${moisPlus(mo, 1)}-05` <= aujourdhui).length;
  lignes.push({ n: '10', titre: `Douze bulletins de salaire NYM SARL de ${c.reference}`, qui: 'NYM SARL',
    etat: bulletins === 12 ? 'pret' : bulletins < dusBulletins ? 'manque' : 'attente', dit: `${bulletins} sur 12` });
  /* 11 · avis d'imposition */
  const avis = pp.some((p) => p.titulaire === y && p.type === 'avis-impot' && p.delivreLe >= `${c.reference + 1}-01-01`);
  lignes.push({ n: '11', titre: `Avis d’imposition ${c.reference}`, qui: 'DGI', etat: avis ? 'pret' : aujourdhui >= `${c.reference + 1}-01-05` ? 'manque' : 'attente', dit: avis ? 'rangé' : 'à demander le 5 janvier' });
  /* 12 · relevés des trois derniers mois complets */
  const releves = moisDesReleves(c.depot);
  const faits = releves.filter((mo) => aUn(pp, y, 'releve', mo)).length;
  const dus = releves.filter((mo) => `${moisPlus(mo, 1)}-05` <= aujourdhui).length;
  lignes.push({ n: '12', titre: 'Relevés bancaires des trois derniers mois, chaque compte', qui: 'Banque en ligne',
    etat: faits === 3 ? 'pret' : faits < dus ? 'manque' : 'attente', dit: `${faits} sur 3 (${releves.map(nomDuMois).join(', ')})` });
  /* 13 · CNSS */
  const cnss = pp.some((p) => p.titulaire === y && p.type === 'cnss-pers' && p.delivreLe >= `${c.reference}-12-01`);
  lignes.push({ n: '13', titre: 'Justificatif de cotisations sociales (CNSS)', qui: 'Attestation annuelle', etat: cnss ? 'pret' : aujourdhui >= `${c.reference + 1}-01-05` ? 'manque' : 'attente', dit: cnss ? 'rangé' : 'attestation en janvier' });
  return lignes;
}

function joursEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/* ══ LE CALENDRIER ═══════════════════════════════════════════════════ */

export type Rappel = { quand: string; titre: string; volet: 'etat' | 'constantes' | 'annee' | 'documents' | 'deposer'; fait: boolean };

/** Les gestes de la campagne, chacun à son jour, et s'il est déjà fait. */
export function calendrier(c: Campagne, pp: readonly PapierLu[], m: Membres, v: Valeurs): Rappel[] {
  const y = titulaire(m.yeman);
  const r: Rappel[] = [];
  const debut = `${c.reference}-10-01`;
  r.push({ quand: debut, titre: 'Saisir les constantes, une seule fois', volet: 'constantes', fait: aSaisir(v).filter((x) => x.groupe !== 'annee').length === 0 });
  r.push({ quand: debut, titre: 'Ranger les papiers permanents : livret, passeports, carte grise, plan, pièce d’identité de l’hébergeant', volet: 'etat',
    fait: aUn(pp, y, 'livret') && aUn(pp, y, 'carte-grise') && aUn(pp, y, 'plan-acces') });
  /* Les bulletins déjà parus quand la campagne s'ouvre font UN geste ; les
     suivants, un par mois, le 5. */
  const tous = Array.from({ length: 12 }, (_, i) => `${c.reference}-${pad(i + 1)}`);
  const parus = tous.filter((mo) => `${moisPlus(mo, 1)}-05` <= debut);
  if (parus.length) {
    r.push({ quand: debut, titre: `Ranger les bulletins de salaire de ${nomDuMois(parus[0]).replace(/ \d{4}$/, '')} à ${nomDuMois(parus[parus.length - 1])}`,
      volet: 'etat', fait: parus.every((mo) => aUn(pp, y, 'bulletin', mo)) });
  }
  for (const mo of tous.filter((x) => !parus.includes(x))) {
    r.push({ quand: `${moisPlus(mo, 1)}-05`, titre: `Ranger le bulletin de salaire ${deMois(mo)}`, volet: 'etat', fait: aUn(pp, y, 'bulletin', mo) });
  }
  for (const mo of moisDesReleves(c.depot)) {
    r.push({ quand: `${moisPlus(mo, 1)}-05`, titre: `Ranger les relevés bancaires ${deMois(mo)}`, volet: 'etat', fait: aUn(pp, y, 'releve', mo) });
  }
  for (const mo of moisDesQuittances(c.depot)) {
    const d = dateDeLaQuittance(mo, c.depot);
    const veille = mo === c.depot.slice(0, 7) ? `${mo}-20` : `${moisPlus(mo, 1)}-01`;
    r.push({ quand: veille, titre: `Préparer la quittance ${deMois(mo)}, datée au plus tard le ${dateEnLettres(d)}`, volet: 'documents', fait: false });
  }
  const jan = `${c.reference + 1}-01`;
  r.push({ quand: `${jan}-05`, titre: `Demander l’avis d’imposition ${c.reference} à la DGI, et l’attestation CNSS de l’année`, volet: 'etat',
    fait: pp.some((p) => p.titulaire === y && p.type === 'avis-impot' && p.delivreLe >= `${jan}-01`) });
  r.push({ quand: `${jan}-10`, titre: 'Ranger une facture récente au nom de l’hébergeant (eau ou électricité)', volet: 'etat',
    fait: pp.some((p) => p.titulaire === titulaire(m.hebergeant) && p.type === 'facture' && p.delivreLe && joursEntre(p.delivreLe, c.depot) <= 90) });
  const quinze = ajouteJours(c.depot, -5);
  r.push({ quand: quinze, titre: `Les quinze minutes : l’année ${c.reference}, relire, signer, assembler, déposer avant le ${dateEnLettres(c.depot)}`, volet: 'deposer', fait: false });
  return r.sort((a, b) => a.quand.localeCompare(b.quand));
}

export function ajouteJours(iso: string, n: number): string {
  const d = new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Ce qui demande un geste maintenant : échu et pas fait, ou à moins de trois jours. */
export const aFaireMaintenant = (rs: readonly Rappel[], aujourdhui: string): Rappel[] =>
  rs.filter((x) => !x.fait && x.quand <= ajouteJours(aujourdhui, 3));

/* ══ LES TEXTES DES DOCUMENTS ════════════════════════════════════════ */

export type TexteDuDocument = { cle: string; titre: string; objet: string; destinataire: string; appel: string; corps: string; cloture: string };

const SECTION = 'Monsieur le Consul\nSection consulaire de l’Ambassade de France au Bénin\nCotonou';

export function enfantsEnLigne(v: Valeurs, c: Campagne, avecNaissance: boolean): string[] {
  return [1, 2, 3].map((n) => {
    const nom = `${lis(v, `e${n}Prenom`)} AHOUANSOU`;
    const ne = avecNaissance ? `, né(e) le ${dateEnLettres(lis(v, `e${n}Naissance`))}` : '';
    return `${nom}${ne}, en ${classeA(lis(v, `e${n}Classe2027`), c.rentree)}`;
  });
}

/** 03 · La lettre de demande, signée des deux parents. */
export function lettreDeDemande(v: Valeurs, c: Campagne): TexteDuDocument {
  const enfants = enfantsEnLigne(v, c, false);
  return {
    cle: '03', titre: 'Lettre de demande de bourses scolaires',
    objet: `Demande de bourses scolaires, campagne ${c.cle} (renouvellement)`,
    destinataire: SECTION, appel: 'Monsieur le Consul,',
    corps: [
      `Nous avons l’honneur de solliciter le renouvellement des bourses scolaires de nos trois enfants, scolarisés à l’${lis(v, 'ecole')}, pour l’année scolaire ${c.cle} :`,
      enfants.map((e) => `· ${e} ;`).join('\n'),
      `Vous trouverez ci-joint le formulaire de demande dûment complété et signé, accompagné des pièces justificatives énumérées au bordereau, sur la base de nos ressources de l’année ${c.reference}.`,
      'Nous restons à la disposition de la section consulaire pour tout renseignement complémentaire, ainsi que pour une éventuelle visite à domicile.',
    ].join('\n\n'),
    cloture: 'Nous vous prions d’agréer, Monsieur le Consul, l’expression de notre haute considération.',
  };
}

/** 04 · L'attestation de l'employeur NYM SARL, signée par un mandataire. */
export function attestationEmployeur(v: Valeurs, c: Campagne, signataire: string): TexteDuDocument {
  const brut = montant(v, 'brut');
  const net = montant(v, 'net');
  const prenoms = [1, 2, 3].map((n) => `${lis(v, `e${n}Prenom`)} AHOUANSOU`).join(', ');
  return {
    cle: '04', titre: 'Attestation de l’employeur',
    objet: 'Participation aux dépenses de scolarisation et rémunération annuelle',
    destinataire: '', appel: '',
    corps: [
      `Je soussigné(e), ${signataire}, agissant pour le compte de la société NYM SARL, immatriculée au registre du commerce et du crédit mobilier de Cotonou sous le numéro RB/COT/09 B 4639 (ancien n° 14.205-B), atteste par la présente que :`,
      `· Mme Yéman BOYA épouse AHOUANSOU, née le ${dateEnLettres(lis(v, 'naissanceDemandeur'))} à Cotonou, est employée au sein de notre société en qualité de ${lis(v, 'poste')} depuis le ${dateEnLettres(lis(v, 'entree'))} ;`,
      `· sa rémunération au titre de l’année ${c.reference} s’est élevée à ${brut !== null ? `${enLettres(brut)} (${enChiffres(brut)})` : '[salaire brut annuel]'} brut et ${net !== null ? `${enLettres(net)} (${enChiffres(net)})` : '[salaire net annuel]'} net, versée mensuellement ;`,
      `· la société NYM SARL ne participe à aucune dépense de scolarisation de ses enfants, ${prenoms}.`,
      'Le formulaire de demande le requérant, il est précisé que l’intéressée est la fille de la gérante de la société, Mme Praxede BOYA : le lien familial entre l’employée et la société est ainsi porté à la connaissance de l’administration.',
      'La présente attestation est délivrée à l’intéressée, à sa demande, pour servir et valoir ce que de droit auprès du Conseil consulaire des bourses scolaires de l’Ambassade de France au Bénin.',
    ].join('\n\n'),
    cloture: '',
  };
}

/** Le nom de l'hébergeant, ou vide s'il n'est pas encore saisi. */
export const hebergeantSaisi = (v: Valeurs): string => (v.hebergeant ?? '').trim();
export const signeHebergeant = (v: Valeurs): string => {
  const nom = lis(v, 'hebergeant');
  return lis(v, 'hebergeantSigne') === 'Lui-même' ? nom : `P/O ${nom}`;
};

/** 05 · L'attestation d'hébergement à titre gracieux. */
export function attestationHebergement(v: Valeurs, c: Campagne): TexteDuDocument {
  const vl = montant(v, 'valeurLocative');
  const enfants = [1, 2, 3].map((n) => `${lis(v, `e${n}Prenom`)} AHOUANSOU, né(e) le ${dateEnLettres(lis(v, `e${n}Naissance`))}`).join(' ; ');
  return {
    cle: '05', titre: 'Attestation d’hébergement à titre gracieux',
    objet: '', destinataire: '', appel: '',
    corps: [
      `Je soussigné(e), ${lis(v, 'hebergeant')}, demeurant ${lis(v, 'hebergeantAdresse')}, certifie sur l’honneur héberger à titre gracieux, depuis ${lis(v, 'hebergeDepuis')}, dans le logement dont je suis propriétaire, situé ${lis(v, 'logement')} :`,
      `· Mme Yéman BOYA épouse AHOUANSOU, née le ${dateEnLettres(lis(v, 'naissanceDemandeur'))} à Cotonou ;\n· son époux, M. ${lis(v, 'p2Prenoms')} ${lis(v, 'p2Nom')}, né le ${dateEnLettres(lis(v, 'p2Naissance'))} ;\n· ainsi que leurs enfants : ${enfants}.`,
      `Ce logement est mis à leur disposition sans contrepartie de loyer ; les occupants s’acquittent des seules charges courantes, dont les quittances sont jointes au dossier. Sa valeur locative est estimée à ${vl !== null ? enChiffres(vl) : '[valeur locative par mois]'} par mois, soit ${vl !== null ? enChiffres(vl * 12) : '[valeur locative par an]'} par an, montant déclaré au titre des avantages en nature pour l’année ${c.reference}.`,
      'En foi de quoi, la présente attestation leur est délivrée pour servir et valoir ce que de droit.',
      'Pièces jointes : copie de ma pièce d’identité ; une facture d’électricité ou d’eau de moins de trois mois établie à mon nom.',
    ].join('\n\n'),
    cloture: '',
  };
}

/** 06 à 08 · La quittance des charges d'un mois. */
export function quittance(v: Valeurs, mois: string, n: string): TexteDuDocument {
  const ch = montant(v, 'charges');
  const somme = ch !== null ? `${enLettres(ch)} (${enChiffres(ch)})` : '[montant des charges]';
  return {
    cle: n, titre: `Quittance des charges · ${nomDuMois(mois)}`,
    objet: '', destinataire: `M. et Mme Brice AHOUANSOU\n${sansPreposition(lis(v, 'logement'))}\nHébergés à titre gracieux`, appel: '',
    corps: [
      `Je soussigné(e), ${lis(v, 'hebergeant')}, propriétaire du logement situé ${lis(v, 'logement')}, déclare avoir reçu de M. et Mme Brice AHOUANSOU, occupants de ce logement, la somme de ${somme} au titre des charges courantes (eau, électricité, entretien) pour la période du 1er ${nomDuMois(mois).replace(/ \d{4}$/, '')} au ${dernierJour(mois)} ${nomDuMois(mois)}.`,
      `Loyer : néant, hébergement à titre gracieux.\nCharges courantes : ${ch !== null ? enChiffres(ch) : '[montant]'}.\nTotal reçu : ${ch !== null ? enChiffres(ch) : '[montant]'}.`,
      'Cette quittance est délivrée sous réserve d’encaissement et ne vaut pas reçu des périodes antérieures.',
    ].join('\n\n'),
    cloture: '',
  };
}

/** Les six documents signés d'une campagne, avec leur date. */
export function documentsDeLaCampagne(v: Valeurs, c: Campagne, signataireNym: string): (TexteDuDocument & { date: string; qui: 'parents' | 'nym' | 'hebergeant' })[] {
  const depot = c.depot;
  const avant = (d: string) => (d < depot ? d : ajouteJours(depot, -2));
  const qs = moisDesQuittances(depot);
  return [
    { ...lettreDeDemande(v, c), date: avant(ajouteJours(depot, -3)), qui: 'parents' },
    { ...attestationEmployeur(v, c, signataireNym), date: avant(ajouteJours(depot, -3)), qui: 'nym' },
    { ...attestationHebergement(v, c), date: avant(ajouteJours(depot, -3)), qui: 'hebergeant' },
    ...qs.map((mo, i) => ({ ...quittance(v, mo, `0${6 + i}`), date: dateDeLaQuittance(mo, depot), qui: 'hebergeant' as const })),
  ];
}

/* ══ LE BORDEREAU ET LES RÉPONSES ════════════════════════════════════ */

export function lignesDuBordereau(c: Campagne): { n: string; piece: string; qui: string }[] {
  const qs = moisDesQuittances(c.depot).map((m) => nomDuMois(m).replace(/ \d{4}$/, ''));
  return [
    { n: '1', piece: 'Lettre de demande de bourses scolaires', qui: 'Les deux parents' },
    { n: '2', piece: 'Formulaire de demande de bourses, complété et signé', qui: 'Les deux parents' },
    { n: '3', piece: 'Livret de famille (toutes les pages écrites)', qui: 'Photocopie' },
    { n: '4', piece: 'Passeports de tous les membres de la famille', qui: 'Photocopie' },
    { n: '5a', piece: 'Attestation d’hébergement à titre gracieux', qui: 'L’hébergeant' },
    { n: '5b', piece: 'Pièce d’identité de l’hébergeant et facture récente à son nom', qui: 'L’hébergeant' },
    { n: '5c', piece: `Quittances des charges : ${qs.join(', ')}`, qui: 'L’hébergeant' },
    { n: '6', piece: 'Attestation de l’employeur NYM SARL', qui: 'NYM SARL' },
    { n: '7', piece: 'Justificatif d’activité du second parent', qui: 'Employeur ou comptable' },
    { n: '8', piece: 'Carte grise du ou des véhicules', qui: 'Photocopie' },
    { n: '9', piece: 'Plan d’accès au domicile', qui: 'Famille' },
    { n: '10', piece: `Douze bulletins de salaire NYM SARL de ${c.reference}`, qui: 'NYM SARL' },
    { n: '11', piece: `Avis d’imposition ${c.reference} sur l’ensemble des revenus`, qui: 'DGI' },
    { n: '12', piece: 'Relevés bancaires des trois derniers mois, chaque compte', qui: 'Banque' },
    { n: '13', piece: 'Justificatifs de cotisations sociales (CNSS)', qui: 'CNSS' },
  ];
}

/** Le formulaire de l'AEFE, rubrique par rubrique, à recopier tel quel. */
export function reponsesAuFormulaire(v: Valeurs, c: Campagne): { page: string; lignes: [string, string][] }[] {
  const vl = montant(v, 'valeurLocative');
  const enfant = (n: number): [string, string] => [`Enfant ${n}`,
    `AHOUANSOU ${lis(v, `e${n}Prenom`)} · ${dateCourte(lis(v, `e${n}Naissance`))} · française · Cotonou · ${lis(v, `e${n}Immat`)}`];
  const boursier = (n: number): [string, string] => [`Enfant ${n}`,
    `AHOUANSOU ${lis(v, `e${n}Prenom`)} · ${lis(v, 'ecole')} · ${classeA(lis(v, `e${n}Classe2027`), c.rentree)} · cases : ${lis(v, 'cases')}`];
  const m = (cle: string) => { const x = montant(v, cle); return x !== null ? enChiffres(x) : lis({}, cle); };
  return [
    { page: 'Page 1 · le demandeur', lignes: [
      ['Année scolaire · type de demande', `${c.cle.replace('-', '/')} · Renouvellement`],
      ['Nom et prénom du demandeur', lis(v, 'demandeur')],
      ['N° d’inscription au registre des Français', lis(v, 'numic')],
      ['Nationalité', lis(v, 'nationalite')],
      ['Lien familial avec les enfants', lis(v, 'lien')],
      ['Adresse', lis(v, 'adresse')],
      ['Téléphone · adresse électronique', `${lis(v, 'telephone')} · ${lis(v, 'courriel')}`],
      ['Date d’arrivée dans le pays', lis(v, 'arrivee')],
      ['Dernière adresse en France', lis(v, 'adresseFrance')],
      ['N° d’allocataire CAF · organisme payeur', lis(v, 'caf')],
    ] },
    { page: 'Page 1 · la famille', lignes: [
      ['Situation familiale', 'Marié(e)'],
      ['Parent 1', `${lis(v, 'demandeur')} · ${dateCourte(lis(v, 'naissanceDemandeur'))} · ${lis(v, 'lieuDemandeur')}`],
      ['Parent 2', `${lis(v, 'p2Nom')} · ${lis(v, 'p2Prenoms')} · ${dateCourte(lis(v, 'p2Naissance'))} · ${lis(v, 'p2Lieu')}`],
      enfant(1), enfant(2), enfant(3),
    ] },
    { page: 'Page 2 · le foyer', lignes: [
      ['Enfant handicapé à charge', 'Néant'],
      ['Logement : propriétaire ?', `Non · loyer : néant (hébergement à titre gracieux par ${lis(v, 'hebergeant')})`],
      ['Superficie · pièces · occupants', `${lis(v, 'superficie')} m² · ${lis(v, 'pieces')} pièces · ${lis(v, 'occupants')} personnes`],
      ['Profession · employeur, parent 1', `${lis(v, 'poste')} · NYM SARL`],
      ['Profession · employeur, parent 2', `${lis(v, 'p2Profession')} · ${lis(v, 'p2Employeur')}`],
      ['Lien avec l’employeur ?', 'Oui, familial : NYM SARL est gérée par Mme Praxede BOYA, mère de la demanderesse'],
      ['Avantages en nature (à chiffrer)', `Logement mis à disposition par la famille : ${vl !== null ? enChiffres(vl * 12) : '[valeur locative annuelle]'} par an. Autres lignes : néant`],
      ['Véhicules personnels', `${lis(v, 'vehicule')} · moto, bateau, autre : néant`],
      ['Autre aide à la scolarisation', lis(v, 'autreAide')],
      ['Clubs · voyages hors du pays (2 ans)', lis(v, 'voyages')],
      ['Personnel de service', lis(v, 'personnel')],
    ] },
    { page: 'Page 3 · les enfants et les bourses', lignes: [
      boursier(1), boursier(2), boursier(3),
      ['Raisons des frais parascolaires', lis(v, 'raisons')],
      ['Je, soussigné · fait le · à', `${lis(v, 'demandeur')} · ${dateCourte(lis(v, 'depot'))} · Cotonou`],
    ] },
    { page: `Page 4 · ressources et patrimoine ${c.reference} (zéro si néant)`, lignes: [
      ['Revenus bruts parent 1 · parent 2', `${m('brut')} · ${m('revenusP2')}`],
      ['Pension reçue · mobiliers · immobiliers', 'Zéro · zéro · zéro'],
      ['Aide familiale · avantages en nature', `zéro · ${vl !== null ? enChiffres(vl * 12) : '[valeur locative annuelle]'}`],
      ['Charges : cotisations · impôts · pension versée', `${m('cnss')} · ${m('impot')} · zéro`],
      ['Patrimoine immobilier · mobilier', 'Zéro sur chaque ligne'],
      ['Avoirs sur comptes bancaires', `${lis(v, 'comptes')} : ${lis(v, 'soldes')}`],
    ] },
  ];
}
