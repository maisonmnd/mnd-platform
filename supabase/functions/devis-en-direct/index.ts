import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* devis-en-direct — le devis de la consultation, sur son téléphone
 * (22 novembre 2026).
 *
 * « Le même système de connexion automatique entre le Trône et les portables
 * de nos clients pour faire les devis […] des devis instantanés, avec
 * Valider, Oui j'accepte le devis, Oui je confirme ma place, prendre son
 * rendez-vous » (Yéman). Maquette FCTFNSr748gq1ecEHxhDMj, lot 1. La passation
 * est mnd-passation-sceau-et-devis.
 *
 * LA PIÈCE EST LA SEULE VÉRITÉ, ET ELLE RESTE AU SERVEUR. Le maître compose
 * l'offre dans la fenêtre de son rendez-vous : les modèles déjà chiffrés (ses
 * calibres, sa longueur), les options du catalogue à leur prix, la
 * consultation déjà réglée s'il y en a une, et les places que son agenda
 * propose. La page cliente ne reçoit que cela, et ne renvoie JAMAIS un
 * montant : elle renvoie un identifiant de modèle, des identifiants
 * d'options, puis un jour et une heure qui sont dans la liste. La fonction
 * recalcule les lignes à partir de l'offre (`lignesDuChoix`) : un prix forgé
 * ne sort pas de la Maison.
 *
 * TROIS GESTES, DANS L'ORDRE, ET RIEN NE RECULE :
 *   valider   — elle arrête ses choix ; la pièce reçoit ses lignes ;
 *   accepter  — « Oui, j'accepte le devis » ; le devis est accepté ;
 *   confirmer — « Oui, je confirme ma place » ; la place choisie est écrite
 *               sur la pièce, prise parmi celles que la Maison a proposées.
 * Chacun est idempotent : une page rouverte ne rejoue rien, et un geste
 * arrivé deux fois ne réécrit pas la pièce.
 *
 * L'ARGENT N'EST PAS ICI. L'acompte se règle par son lien de règlement
 * (`regler-la-seance`), qui sait déjà poser un versement sur une pièce : le
 * lot 2 du devis l'appellera. Cette fonction-ci ne connaît pas KkiaPay.
 *
 * CE QU'IL FAUT POUR LA DÉPLOYER : SUPABASE_URL et SERVICE_KEY (déjà posés
 * sur le projet), rien de plus. `verify_jwt` reste allumé : la cliente n'a
 * pas de compte, mais elle n'appelle que les trois gestes, et le jeton du
 * lien les protège — la fonction ne rend jamais rien d'autre que sa page.
 */

const VERSION = '2026-11-22-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(obj as object) }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ipOf = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

/** LE FREIN PAR ADRESSE, celui des autres pages de la Maison. Une table
    absente ne bloque personne : on ne prend pas une page cliente en otage
    pour un compteur. */
async function permis(ip: string, seau: string, plafond: number): Promise<boolean> {
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', depuis);
  if (error) return true;
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

// ── DEBUT copie de shared/devis-en-direct.ts (verifie-le-devis-en-direct la compare, mot pour mot)
/* ══ LE DEVIS EN DIRECT — 22 novembre 2026 ═══════════════════════════════
   « Le même système de connexion automatique entre le Trône et les portables
   de nos clients pour faire les devis ou les demandes de modèles de
   coiffures […] des devis instantanés, avec « Valider », « Oui, j'accepte le
   devis », « Oui, je confirme ma place », prendre son rendez-vous et faire
   le paiement en ligne si possible » (Yéman). Maquette jouable
   `FCTFNSr748gq1ecEHxhDMj` (version 2), lot 1 : le devis de la consultation
   en direct, les trois oui, la place. La passation est
   `mnd-passation-sceau-et-devis`.

   CE QUI EST TRANCHÉ PAR ELLE, ET NE SE ROUVRE PAS :
   · en consultation, elle reçoit son devis sur son téléphone : nombre de
     locks, longueur, modèle à choisir, options, suppléments ;
   · les options et les suppléments viennent du CATALOGUE du Trône, jamais
     inventés ;
   · les trois confirmations, à ces mots exacts : « Valider », « Oui,
     j'accepte le devis », « Oui, je confirme ma place » ;
   · elle prend elle-même son rendez-vous, et règle en ligne « si possible » ;
   · une demande par page, jamais deux mêlées.

   CE FICHIER EST PUR (aucun magasin, aucun React) : le banc
   `scripts/verifie-le-devis-en-direct.mjs --prouve` l'éprouve sans écran.
   Les calibres lui sont DONNÉS (ceux de `pricing.ts` à l'écran), jamais
   recalculés ici : une seule table les porte, et elle se règle aux
   Paramètres.

   LE TÉLÉPHONE NE DÉCIDE D'AUCUN MONTANT. Ce module calcule ce que la
   MAISON propose ; la page cliente reçoit des lignes déjà chiffrées, et la
   fonction du devis les recalcule au serveur avant de les lui montrer. Un
   prix qu'elle aurait pu forger ne sort jamais de la Maison. */

/** Le type d'une longueur, celui du catalogue (`LongueurId`), sans importer
    `catalog.ts` — qui porte des magasins. */
export type LongueurDuDevis = 'court' | 'mi-long' | 'long';
export const LONGUEURS_DU_DEVIS: readonly { id: LongueurDuDevis; nom: string; dit: string }[] = [
  { id: 'court', nom: 'Courtes', dit: 'jusqu’aux épaules' },
  { id: 'mi-long', nom: 'Mi-longues', dit: 'des épaules aux omoplates' },
  { id: 'long', nom: 'Longues', dit: 'au-delà des omoplates' },
];
export const rangDeLaLongueur = (id: unknown): number => (id === 'long' ? 2 : id === 'mi-long' ? 1 : 0);

/* ── LE CALIBRE, LU SUR LE NOMBRE DE LOCKS ──────────────────────────────
   La Maison parle en calibres (Jumbo, Medium, Mini…), pas en tranches : le
   maître tape le nombre de locks, le Trône lit le calibre, et le prix du
   modèle suit son coefficient. Les bornes et les coefficients viennent des
   Paramètres (`MODEL_BANDS_SEED` de `pricing.ts`). */
export type BandeLue = { id?: string; name?: string; maxLocks: number | null; coef: number; durCoef: number };
export type CalibreLu = { nom: string; min: number; max: number | null; coef: number; durCoef: number };

export function calibreDuNombreDeLocks(nLocks: unknown, bands: readonly BandeLue[]): CalibreLu | null {
  const locks = Math.floor(Number(nLocks));
  if (!(locks >= 1) || !bands.length) return null;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.maxLocks === null || locks <= b.maxLocks) {
      const min = i === 0 ? 1 : Number(bands[i - 1].maxLocks ?? 0) + 1;
      return { nom: String(b.name ?? '').trim() || `Calibre ${i + 1}`, min, max: b.maxLocks, coef: Number(b.coef) || 1, durCoef: Number(b.durCoef) || 1 };
    }
  }
  return null;
}

/** « Medium · 81 à 150 locks », « Galaxy · 551 locks et plus ». */
export const calibreDit = (c: CalibreLu | null): string =>
  !c ? '' : c.max === null ? `${c.nom} · ${c.min} locks et plus` : `${c.nom} · ${c.min} à ${c.max} locks`;

/* ── LES PRIX ───────────────────────────────────────────────────────────── */
/** Le prix d'un modèle se dit au demi-millier, jamais au franc près : la
    Maison ne vend pas 26 437 F. */
export const ARRONDI_DU_DEVIS_XOF = 500;
export const arrondiDuDevis = (x: number): number => Math.round((Number(x) || 0) / ARRONDI_DU_DEVIS_XOF) * ARRONDI_DU_DEVIS_XOF;

/** Le prix d'un modèle de consultation : sa base × le coefficient du calibre. */
export const prixDuModele = (baseXof: number, coef: number): number => arrondiDuDevis((Number(baseXof) || 0) * (Number(coef) || 1));

/** Sa durée : celle du catalogue, allongée par le calibre (au quart d'heure). */
export const dureeDuModele = (minutes: number, durCoef: number): number =>
  Math.max(0, Math.round(((Number(minutes) || 0) * (Number(durCoef) || 1)) / 15) * 15);

/** La durée dite : « 3 h 30 », « 45 min ». */
export function dureeDite(minutes: number): string {
  const t = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(t / 60); const m = t % 60;
  if (!h) return m ? `${m} min` : '—';
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Le prix d'une option du catalogue, pour SA longueur. Une option qu'il ne
    vend pas à cette longueur ne se propose pas. */
export function prixDeLOption(prix: number | readonly number[] | undefined, longueur: LongueurDuDevis): number | null {
  if (prix === undefined || prix === null) return null;
  if (Array.isArray(prix)) {
    const v = prix[rangDeLaLongueur(longueur)];
    return v === undefined ? null : Math.round(Number(v) || 0);
  }
  return Math.round(Number(prix) || 0);
}

/* ── LES LIGNES ET LE TOTAL ─────────────────────────────────────────────── */
export type LigneDuDevisEnDirect = {
  /** Le libellé que la cliente lit, tel qu'il partira sur la pièce. */
  label: string;
  xof: number;
  /** Une ligne de la Maison (le modèle), une option qu'elle a cochée, un
      supplément qu'on lui inclut, la consultation déduite. */
  genre: 'modele' | 'option' | 'supplement' | 'consultation';
};

/** La consultation déjà réglée se déduit UNE fois, et seulement si elle a
    été payée. C'est une ligne négative, dite « déduite ». */
export function ligneDeLaConsultationDejaReglee(paidXof: number, label: string): LigneDuDevisEnDirect | null {
  const x = Math.round(Number(paidXof) || 0);
  return x > 0 ? { label, xof: -x, genre: 'consultation' } : null;
}

/** Le total : jamais sous zéro. */
export const totalDuDevis = (lignes: readonly LigneDuDevisEnDirect[]): number =>
  Math.max(0, lignes.reduce((s, l) => s + (Math.round(Number(l.xof) || 0)), 0));

/** L'acompte : le taux réglé au Trône (`depositPctFor`, 30 % par défaut). */
export const acompteDuDevisEnDirect = (totalXof: number, pct: number): number =>
  Math.max(0, Math.round((Math.max(0, Math.round(Number(totalXof) || 0)) * Math.max(0, Math.min(100, Number(pct) || 0))) / 100));

/* ── LES TROIS OUI ────────────────────────────────────────────────────────
   « Trois confirmations, à ces mots exacts » (Yéman). Un seul geste par
   page : le devis, puis « Valider » ; la relecture, puis « Oui, j'accepte le
   devis » ; le calendrier, puis « Oui, je confirme ma place ». */
export type EtapeDuDevisEnDirect = 'devis' | 'valide' | 'accepte' | 'place' | 'scelle';
export const ETAPES_DU_DEVIS_EN_DIRECT: readonly EtapeDuDevisEnDirect[] = ['devis', 'valide', 'accepte', 'place', 'scelle'];

export type GesteDuDevisEnDirect = 'valider' | 'accepter' | 'confirmer';

export const LES_TROIS_OUI: Record<GesteDuDevisEnDirect, string> = {
  valider: 'Valider',
  accepter: 'Oui, j’accepte le devis',
  confirmer: 'Oui, je confirme ma place',
};

/** Ce que le geste fait à l'état, et ce qu'il exige. Le geste d'une étape
    passée ne se rejoue pas : une page rouverte ne reclique pas deux fois. */
export function apresLeGeste(etape: EtapeDuDevisEnDirect, geste: GesteDuDevisEnDirect): EtapeDuDevisEnDirect | null {
  if (etape === 'devis' && geste === 'valider') return 'valide';
  if (etape === 'valide' && geste === 'accepter') return 'accepte';
  if (etape === 'accepte' && geste === 'confirmer') return 'place';
  return null;
}

/** Le geste que la page attend, à cette étape — et rien après « place ». */
export const gesteAttendu = (etape: EtapeDuDevisEnDirect): GesteDuDevisEnDirect | null =>
  etape === 'devis' ? 'valider' : etape === 'valide' ? 'accepter' : etape === 'accepte' ? 'confirmer' : null;

/** L'étape où il en est, à partir de l'état de la pièce au Trône. La pièce
    (`Invoice`) garde ses états ; ce module ne les réécrit pas. */
export function etapeDeLaPiece(status: string | undefined, aSaPlace: boolean, payee: boolean): EtapeDuDevisEnDirect {
  if (payee) return 'scelle';
  if (aSaPlace || status === 'confirmé') return 'place';
  if (status === 'acceptée') return 'accepte';
  if (status === 'envoyée') return 'valide';
  return 'devis';
}

/* ── LA PLACE ───────────────────────────────────────────────────────────── */
/** Une place est TENUE dès qu'elle est choisie, et CONFIRMÉE quand l'argent
    est arrivé (ou qu'elle a dit qu'elle réglerait à l'accueil : le Trône le
    pose). Sans acompte, elle se libère — au bout de combien de temps, c'est
    une question posée à Yéman, pas une règle de ce fichier. */
export type EtatDeLaPlace = 'tenue' | 'confirmee' | 'liberee';
export const placeDite = (e: EtatDeLaPlace): string =>
  e === 'confirmee' ? 'confirmée' : e === 'liberee' ? 'libérée' : 'tenue';

/** Ce que la Maison dit d'un devis qui part : ses trois mots, et la phrase
    qui les annonce. */
export function motDUneEtape(etape: EtapeDuDevisEnDirect): string {
  if (etape === 'devis') return 'Voici votre devis. Lisez-le, et validez ce qui vous plaît.';
  if (etape === 'valide') return 'Vos choix sont arrêtés. Il reste à accepter le devis.';
  if (etape === 'accepte') return 'Choisissez votre place : la Maison vous y attend.';
  if (etape === 'place') return 'Votre place est tenue. L’acompte la confirme.';
  return 'Merci.';
}

/** LES SALUTATIONS DU DERNIER ÉCRAN — « Merci. », signé « Maison MND ». */
export const MERCI_DU_DEVIS = 'Merci.';
export const SIGNATURE_DU_DEVIS = 'Maison MND';

/* ══ LE DEVIS EN DIRECT, CÔTÉ PIÈCE — 22 novembre 2026 ═══════════════════
   Le devis que le maître compose au fauteuil, et que la cliente reçoit sur
   son téléphone. Les règles de calcul sont dans `devis-en-direct-pur.ts` ;
   ici, ce qui vit SUR LA PIÈCE et ce que la page a le droit de lire.

   LA PIÈCE PORTE L'OFFRE, PAS ENCORE LES LIGNES. Trois modèles proposés ne
   sont pas trois lignes de facture : une pièce qui les porterait tous
   vaudrait trois fois le devis. L'offre se range donc dans `devisDuFauteuil`
   (les modèles chiffrés, les options et leur état), et `lines` reste VIDE
   jusqu'à ce qu'elle valide : c'est son choix, et lui seul, qui devient la
   pièce. Une pièce est ainsi toujours une facture vraie de ce qu'elle doit.

   LE TÉLÉPHONE NE COMPOSE RIEN. Il reçoit des modèles déjà chiffrés (le
   Trône les a calculés avec les calibres et le catalogue), choisit, et
   renvoie un identifiant de modèle et des identifiants d'options. La
   fonction vérifie que ces identifiants sont bien dans l'offre, et
   recalcule les lignes : un prix forgé ne sort jamais de la Maison.

   Ce fichier est PUR : le banc `verifie-le-devis-en-direct.mjs` l'éprouve
   sans écran, et la fonction `devis-en-direct` en porte la copie. */
/* LE FICHIER N'IMPORTE RIEN, EXPRÈS : la fonction `devis-en-direct` en porte
   la copie mot pour mot (scripts/devis-en-direct-copie-serveur.mjs), et une
   copie qui emporterait des imports emporterait la moitié du dépôt. Les deux
   constantes du jeton et le libellé de la consultation sont donc recopiés
   ici — et le banc `verifie-le-devis-en-direct` vérifie qu'ils sont
   IDENTIQUES à ceux de `regler-la-seance-pur` et de `devis-remis-pur`. */

/** Les quatorze signes sans ambiguïté de la Maison (ni 0/o, ni 1/l/i). */
const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';
const LONGUEUR_DU_JETON = 14;
const devoileUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

/** Un jeton neuf, tiré de quatorze aléas (crypto.getRandomValues). */
function jetonDe(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON; i++) t += ALPHABET_DU_JETON[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % ALPHABET_DU_JETON.length];
  return t;
}

/** Une ligne lue sur une pièce (la même forme que `LigneLue` de
    `regler-la-seance-pur`). */
type LigneLue = { label?: string; qty?: number; unitXof?: number; discountPct?: number; discountXof?: number };

/** Le libellé de la consultation déduite : celui de `devis-remis-pur`. */
const LIBELLE_DE_LA_CONSULTATION_DEDUITE = 'Consultation privée, déduite';

/** Un jeton de devis : les mêmes quatorze signes sans ambiguïté que le lien
    de règlement — un seul alphabet dans la Maison. */
export const PREFIXE_DU_PARAMETRE_DU_DEVIS = 'd-';

export const parametreDuDevis = (jeton: string): string => `${PREFIXE_DU_PARAMETRE_DU_DEVIS}${jeton}`;

/** Le jeton d'un paramètre « d-… », ou null. */
export function jetonDuParametreDuDevis(tg: unknown): string | null {
  const s = String(tg ?? '');
  if (!s.startsWith(PREFIXE_DU_PARAMETRE_DU_DEVIS)) return null;
  const j = s.slice(PREFIXE_DU_PARAMETRE_DU_DEVIS.length);
  return devoileUnJeton(j) ? j : null;
}

export const jetonDuDevis = (aleas: ArrayLike<number>): string => jetonDe(aleas);

/** LE LIEN DU DEVIS, posé sur la pièce par le maître quand il envoie. */
export type LienDuDevis = {
  jeton: string;
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  valideLe?: string;
  accepteLe?: string;
  placeLe?: string;
  place?: { jour: string; heure: string };
  /** L'ACOMPTE — 23 novembre 2026 (PaiementDuDevis). C'est lui qui
      CONFIRME la place ; sans lui, elle se libère au bout de vingt-quatre
      heures (placeEncoreTenue). */
  paiement?: PaiementDuDevis;
};

/** UN MODÈLE PROPOSÉ : son nom, son prix pour SA tête, sa durée, et le
    conseil de la Maison (un seul modèle conseillé). */
export type ModeleDuDevis = { id: string; nom: string; xof: number; dureeMin?: number; maison?: string; image?: string };
/** UNE OPTION DU CATALOGUE : son prix pour SA longueur, et son état. */
export type OptionDuDevis = { id: string; nom: string; xof: number; etat: 'proposee' | 'incluse'; dureeMin?: number };

export type OffreDuDevis = {
  modeleConseille?: string;
  modeles: ModeleDuDevis[];
  options: OptionDuDevis[];
  /** La longueur et les locks qui ont servi à chiffrer (dits à la cliente). */
  locks?: number;
  calibre?: string;
  longueur?: string;
  /** Le mot du maître, sous le devis. */
  mot?: string;
  /** LES PLACES QUE LA MAISON PROPOSE (22 novembre 2026). Le Trône les lit
      dans son agenda au moment d'envoyer le devis — jours ouverts, heures
      libres, la durée du rituel — et les pose ici. Le téléphone ne choisit
      que parmi elles : il n'invente ni un jour ni une heure. À la
      confirmation, la fonction vérifie que le choix y est encore. */
  places?: { jour: string; heure: string }[];
  /** La consultation déjà réglée, déduite de la pièce (un montant, une fois). */
  deductionXof?: number;
  /** L'ACOMPTE DE LA RÉSERVATION — 23 novembre 2026. Le taux réglé au Trône
      (`depositPctFor`, 30 % par défaut) est posé ici quand le devis part :
      la fonction le relit pour dire ce qu'elle doit, sans lire les réglages.
      0 : aucun acompte, la place se confirme à l'accueil. */
  acomptePct?: number;
};

/** L'ACOMPTE RÉGLÉ (ou déclaré à l'accueil). `accueil` : elle a dit qu'elle
    paierait au comptoir ; la place est confirmée sans argent. */
export type PaiementDuDevis = { le: string; montantXof: number; moyen: 'en-ligne' | 'accueil'; transactionId?: string };

export type ChoixDeLaCliente = { modele?: string; options?: string[]; valideLe?: string };

export type DevisLuEnDirect = {
  id: string; kind?: string; status?: string; date?: string;
  /** La maison de la pièce : KkiaPay la reçoit avec le paiement. */
  branchId?: string;
  clientId?: string; forClientId?: string; clientName?: string; apptId?: string;
  master?: string;
  lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number;
  remisLe?: string;
  auFauteuil?: { le: string; par?: string };
  lienDuDevis?: LienDuDevis;
  devisDuFauteuil?: OffreDuDevis;
  choixDeLaCliente?: ChoixDeLaCliente;
};

/* ── CE QUE LA PAGE PEUT LIRE ───────────────────────────────────────────── */

export type EtatDuDevisEnDirect = 'introuvable' | 'brouillon' | 'devis' | 'valide' | 'accepte' | 'a-payer' | 'place';

/** L'état de la page, lu sur la marque du lien puis sur la pièce. */
export function etatDuDevisEnDirect(d: DevisLuEnDirect | null, maintenant = Date.now()): EtatDuDevisEnDirect {
  if (!d) return 'introuvable';
  const l = d.lienDuDevis;
  if (!l) return 'brouillon';
  /* LA PLACE CHOISIE — 23 novembre 2026. Tenue, elle attend l'acompte
     (« a-payer ») ; l'acompte réglé (en ligne ou à l'accueil) la confirme
     (« place ») ; passées vingt-quatre heures sans l'un ni l'autre, elle
     s'est libérée et elle choisit à nouveau (« accepte »). */
  if (l.place?.jour) {
    if (l.paiement?.le) return 'place';
    return placeEncoreTenue({ placeLe: l.placeLe, payee: false, maintenant }) ? 'a-payer' : 'accepte';
  }
  if (d.status === 'payée') return 'place';
  if (l.accepteLe || d.status === 'acceptée') return 'accepte';
  /* LES CHOIX ARRÊTÉS NE SE REMODÈLENT PAS (maquette, « valide ») : après son
     « Valider », elle relit et accepte — elle ne choisit plus. */
  if (l.valideLe) return 'valide';
  if (d.status === 'envoyée') return 'devis';
  return 'brouillon';
}

/** Son choix, tel qu'il est valable : un modèle qui est dans l'offre, des
    options qui y sont, et les options « incluses » d'office. Rend `null` si
    le choix ne tient pas (un modèle retiré depuis, par exemple). */
export function choixValable(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined):
  { modele: ModeleDuDevis; options: OptionDuDevis[] } | null {
  if (!o || !o.modeles?.length) return null;
  const m = o.modeles.find((x) => x.id === c?.modele) ?? o.modeles.find((x) => x.id === o.modeleConseille) ?? o.modeles[0];
  if (!m) return null;
  const voulues = new Set(c?.options ?? []);
  const options = (o.options ?? []).filter((x) => x.etat === 'incluse' || voulues.has(x.id));
  return { modele: m, options };
}

/** LA PIÈCE DE SON CHOIX : une ligne pour le modèle, une par option, et la
    consultation déduite à part — elle n'est PAS une ligne (une ligne à zéro
    ne dirait rien), c'est la remise de la pièce (`globalDiscountXof`), une
    seule fois. C'est ce que la fonction écrit au moment du « Valider » : la
    pièce devient vraie à cet instant. */
export function lignesDuChoix(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined, consultationRegleeXof = 0):
  { lignes: LigneDuDevisEcrit[]; deductionXof: number } {
  const v = choixValable(o, c);
  if (!v) return { lignes: [], deductionXof: 0 };
  const lignes: LigneDuDevisEcrit[] = [{ label: v.modele.maison ? `${v.modele.nom} · ${v.modele.maison}` : v.modele.nom, qty: 1, unitXof: Math.max(0, Math.round(v.modele.xof)), discountPct: 0 }];
  for (const x of v.options) {
    lignes.push({ label: x.nom, qty: 1, unitXof: Math.max(0, Math.round(x.xof)), discountPct: x.etat === 'incluse' ? 100 : 0 });
  }
  const brut = lignes.reduce((s, l) => s + l.unitXof * l.qty * (1 - (l.discountPct || 0) / 100), 0);
  const deduite = Math.min(Math.max(0, Math.round(brut)), Math.max(0, Math.round(Number(consultationRegleeXof) || 0)));
  return { lignes, deductionXof: deduite };
}

/** Le libellé de la consultation déduite : celui de `devis-remis-pur`, une
    seule source dans la Maison. */
export const LIBELLE_DE_LA_CONSULTATION = LIBELLE_DE_LA_CONSULTATION_DEDUITE;

/** Une ligne telle qu'elle s'écrit sur la pièce. */
export type LigneDuDevisEcrit = { label: string; qty: number; unitXof: number; discountPct: number; discountXof?: number };

/** LE TOTAL DE L'OFFRE, tel qu'elle le lit avant de valider : le modèle
    qu'elle a choisi (ou le conseillé), plus les options qu'elle a cochées,
    plus celles qu'on lui inclut (comptées, puis offertes), moins la
    consultation déjà réglée. Jamais sous zéro. */
export function totalDeLOffre(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined): number {
  const v = choixValable(o, c);
  if (!v) return 0;
  const brut = Math.round(v.modele.xof) + v.options.reduce((s, x) => s + Math.round(x.xof), 0);
  return Math.max(0, brut - Math.max(0, Math.round(Number(o?.deductionXof) || 0)));
}

/** La durée : le modèle, plus les options qu'elle paie ou qu'on lui inclut. */
export function dureeDeLOffre(o: OffreDuDevis | undefined, c: ChoixDeLaCliente | undefined): number {
  const v = choixValable(o, c);
  if (!v) return 0;
  return Math.max(0, Math.round(Number(v.modele.dureeMin) || 0) + v.options.reduce((s, x) => s + (Number(x.dureeMin) || 0), 0));
}

/* ── LA PLACE TENUE, ET L'ACOMPTE — 23 novembre 2026 ──────────────────────
   LA RÉPONSE DE YÉMAN, ce matin, à la question de la passation : « Une place
   choisie mais pas payée se libère au bout de VINGT-QUATRE HEURES. » Et « Je
   règle à l'accueil » reste une autre voie que l'acompte en ligne, tant que
   le comptoir existe.

   La place se choisit sur le téléphone, elle est TENUE à cet instant, et
   elle se CONFIRME par l'argent — en ligne, ou déclaré à l'accueil. Passé
   vingt-quatre heures sans l'un ni l'autre, la place se libère : la cliente
   retrouve le calendrier, et quelqu'un d'autre peut la prendre. La fonction
   le vérifie à chaque lecture, jamais une page ouverte dans un téléphone. */
export const DELAI_DE_LA_PLACE_MS = 24 * 3_600_000;

/** La place est-elle encore tenue ? `payee` couvre l'acompte en ligne ET le
    « je règle à l'accueil » : une fois l'un ou l'autre, elle ne s'ouvre
    plus. Sans heure connue, on ne libère pas (on ne prend pas une place à
    une cliente pour une marque manquante). */
export function placeEncoreTenue(o: { placeLe?: string; payee: boolean; maintenant: number }): boolean {
  if (o.payee) return true;
  const ms = Date.parse(String(o.placeLe ?? ''));
  if (!Number.isFinite(ms)) return true;
  return o.maintenant - ms < DELAI_DE_LA_PLACE_MS;
}

/** Le moment où elle se libérerait, en clair : « aujourd'hui à 16 h 40 »,
    « demain à 9 h 05 ». Ce que la page dit quand il reste peu de temps. */
export function quandLaPlaceSeLibere(placeLe: string | undefined): string {
  const ms = Date.parse(String(placeLe ?? ''));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + DELAI_DE_LA_PLACE_MS + 3_600_000);
  const h = `${d.getUTCHours()} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${h}`;
}

/** LE TOTAL DE LA PIÈCE, la même lecture qu'`invoiceTotal` : les lignes
    nettes, la remise de ligne, la remise de la pièce. C'est LUI qui fait foi
    au moment de l'acompte — l'offre a servi à la composer, la pièce décide. */
export function totalDeLaPieceDuDevis(lignes: readonly { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number }[], remisePct = 0, remiseXof = 0): number {
  const sous = (lignes ?? []).reduce((s, l) => s + Math.max(0, Math.round(Number(l.qty) || 0) * Math.round(Number(l.unitXof) || 0) * (1 - (Number(l.discountPct) || 0) / 100) - Math.max(0, Math.round(Number(l.discountXof) || 0))), 0);
  return Math.max(0, Math.round(sous * (1 - (Number(remisePct) || 0) / 100)) - Math.max(0, Math.round(Number(remiseXof) || 0)));
}

/** L'ACOMPTE ATTENDU, calculé au serveur : le taux posé à l'envoi du devis,
    borné, sur le total de la pièce. Zéro taux : aucun acompte, la place
    s'achète à l'accueil. */
export function acompteAttendu(o: { lignes: readonly { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number }[]; remisePct?: number; remiseXof?: number; pct?: number }): number {
  const total = totalDeLaPieceDuDevis(o.lignes, o.remisePct, o.remiseXof);
  const pct = Math.max(0, Math.min(100, Number(o.pct) || 0));
  return Math.max(0, Math.round((total * pct) / 100));
}

/** CE QUE LE TÉLÉPHONE REÇOIT, et rien de plus qu'elle : ni nom de famille,
    ni numéro, ni le prix des modèles qu'elle n'a pas choisis. */
export function pageDuDevisEnDirect(o: {
  devis: DevisLuEnDirect | null;
  prenom?: string;
  maintenant: Date;
}) {
  const d = o.devis;
  const etat = etatDuDevisEnDirect(d);
  if (!d || etat === 'introuvable') return { etat: 'introuvable' as const };
  const offre = d.devisDuFauteuil;
  const choix = d.choixDeLaCliente;
  const v = choixValable(offre, choix);
  return {
    etat,
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' ') || String(d.clientName ?? '').trim().split(/\s+/)[0] || '',
    maitre: String(d.master ?? '').trim(),
    /* L'offre telle qu'elle se touche : ses modèles et leurs prix, ses
       options et leur état. Rien d'autre. */
    modeles: (offre?.modeles ?? []).map((m) => ({ id: m.id, nom: m.nom, xof: Math.round(m.xof), dureeMin: Math.round(Number(m.dureeMin) || 0), ...(m.maison ? { maison: m.maison } : {}), ...(offre?.modeleConseille === m.id ? { conseille: true } : {}) })),
    options: (offre?.options ?? []).map((x) => ({ id: x.id, nom: x.nom, xof: Math.round(x.xof), etat: x.etat, dureeMin: Math.round(Number(x.dureeMin) || 0) })),
    ...(offre?.locks ? { locks: Math.round(offre.locks) } : {}),
    ...(offre?.calibre ? { calibre: offre.calibre } : {}),
    ...(offre?.longueur ? { longueur: offre.longueur } : {}),
    ...(offre?.mot ? { mot: offre.mot } : {}),
    ...(choix?.modele ? { choisi: choix.modele } : {}),
    ...(choix?.options ? { prises: choix.options } : {}),
    /* CE QU'ELLE PEUT AJOUTER ELLE-MÊME POUR VOIR SON TOTAL BOUGER : les prix
       reçus, et la déduction. Ce n'est pas un montant qu'elle décide — la
       fonction recalcule tout au « Valider ». */
    deductionXof: Math.max(0, Math.round(Number(offre?.deductionXof) || 0)),
    totalXof: totalDeLOffre(offre, choix),
    dureeMin: dureeDeLOffre(offre, choix),
    ...(v ? { modele: v.modele.id } : {}),
    places: (offre?.places ?? []).map((p) => ({ jour: p.jour, heure: p.heure })),
    /* L'ACOMPTE ET LA PLACE (23 novembre 2026) : ce qu'elle doit pour
       confirmer sa place, et si elle l'a déjà fait. */
    reference: `dev-${d.id}`,
    /* La maison part avec le paiement : sans elle, un paiement dont le devis
       n'existe pas encore au registre ignore sa maison. */
    branchId: String(d.branchId ?? ''),
    acompteXof: acompteAttendu({ lignes: d.lines ?? [], remisePct: d.globalDiscountPct, remiseXof: d.globalDiscountXof, pct: offre?.acomptePct ?? 0 }),
    acomptePct: Math.max(0, Math.min(100, Number(offre?.acomptePct) || 0)),
    ...(d.lienDuDevis?.paiement ? { paiement: d.lienDuDevis.paiement } : {}),
    ...(d.lienDuDevis?.placeLe && !d.lienDuDevis.paiement ? { placeTientJusqua: quandLaPlaceSeLibere(d.lienDuDevis.placeLe) } : {}),
    ...(d.lienDuDevis?.place ? { place: d.lienDuDevis.place } : {}),
  };
}
// ── FIN copie de shared/devis-en-direct.ts

const FORME_DU_JETON = /^[23456789abcdefghjkmnpqrstuvwxyz]{14}$/;

type Ligne = { id: string; branch_id: string; data: Record<string, unknown> };

/** La pièce du jeton : une seule, sinon personne. */
async function laPieceDuJeton(jeton: string): Promise<Ligne | null> {
  const { data, error } = await admin.from('invoices').select('id,branch_id,data')
    .eq('data->lienDuDevis->>jeton', jeton).limit(2);
  if (error) throw new Error(error.message);
  const lues = (data ?? []) as Ligne[];
  return lues.length === 1 ? lues[0] : null;
}

const devisDe = (p: Ligne): DevisLuEnDirect => ({ ...(p.data ?? {}), id: p.id, branchId: p.branch_id } as unknown as DevisLuEnDirect);

async function ecris(p: Ligne, data: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('invoices').update({ data }).eq('id', p.id);
  if (error) throw new Error(error.message);
}

const page = (d: DevisLuEnDirect) => pageDuDevisEnDirect({ devis: d, maintenant: new Date() });

/** LIRE — la page, et la marque d'ouverture (une fois). */
async function lire(req: Request, b: Record<string, unknown>, noterLOuverture: boolean) {
  if (!(await permis(ipOf(req), 'devis-lire', 60))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!FORME_DU_JETON.test(jeton)) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ ok: true, page: { etat: 'introuvable' } });
  let d = devisDe(piece);
  /* LA PLACE TOMBÉE SE DIT À LA LECTURE (23 novembre 2026) : vingt-quatre
     heures sans acompte, elle s'efface — une fois, au serveur. */
  d = await libereLaPlaceSiTropTard(piece, d);
  if (noterLOuverture && d.lienDuDevis && !d.lienDuDevis.ouvertLe) {
    const lien = { ...d.lienDuDevis, ouvertLe: new Date().toISOString() };
    await ecris(piece, { ...(piece.data ?? {}), lienDuDevis: lien });
    return json({ ok: true, page: page({ ...d, lienDuDevis: lien }) });
  }
  return json({ ok: true, page: page(d) });
}

/** VALIDER — ses choix sont arrêtés, et la pièce reçoit ses lignes. */
async function valider(req: Request, b: Record<string, unknown>) {
  if (!(await permis(ipOf(req), 'devis-valider', 30))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!FORME_DU_JETON.test(jeton)) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ error: 'lien_introuvable' }, 404);
  const d = devisDe(piece);
  if (!d.lienDuDevis) return json({ error: 'lien_introuvable' }, 404);
  if (d.lienDuDevis.valideLe) return json({ ok: true, deja: true, page: page(d) });
  /* UN DEVIS DÉJÀ ACCEPTÉ NE SE REMODÈLE PAS : ses choix sont arrêtés. */
  if (d.lienDuDevis.accepteLe) return json({ error: 'deja_accepte' }, 409);
  const choix = {
    modele: String(b.modele ?? '').trim(),
    options: Array.isArray(b.options) ? (b.options as unknown[]).map((x) => String(x)).slice(0, 20) : [],
  };
  if (!choixValable(d.devisDuFauteuil, choix)) return json({ error: 'choix' }, 400);
  const { lignes, deductionXof } = lignesDuChoix(d.devisDuFauteuil, choix, Number(d.devisDuFauteuil?.deductionXof) || 0);
  if (!lignes.length) return json({ error: 'choix' }, 400);
  const quand = new Date().toISOString();
  const neuve: Record<string, unknown> = {
    ...(piece.data ?? {}),
    status: 'envoyée',
    lines: lignes.map((l, i) => ({
      id: `dv-${jeton.slice(0, 8)}-${i + 1}`, label: l.label, qty: l.qty, unitXof: l.unitXof,
      discountPct: l.discountPct ?? 0, discountXof: l.discountXof ?? 0,
    })),
    globalDiscountPct: 0,
    globalDiscountXof: deductionXof,
    choixDeLaCliente: { modele: choix.modele, options: choix.options, valideLe: quand },
    lienDuDevis: { ...d.lienDuDevis, valideLe: quand },
  };
  await ecris(piece, neuve);
  return json({ ok: true, page: page({ ...(neuve as unknown as DevisLuEnDirect), id: piece.id }) });
}

/** ACCEPTER — « Oui, j'accepte le devis ». */
async function accepter(req: Request, b: Record<string, unknown>) {
  if (!(await permis(ipOf(req), 'devis-accepter', 30))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!FORME_DU_JETON.test(jeton)) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ error: 'lien_introuvable' }, 404);
  const d = devisDe(piece);
  if (!d.lienDuDevis) return json({ error: 'lien_introuvable' }, 404);
  if (d.lienDuDevis.accepteLe) return json({ ok: true, deja: true, page: page(d) });
  if (!d.lienDuDevis.valideLe) return json({ error: 'pas_valide' }, 409);
  const neuve: Record<string, unknown> = {
    ...(piece.data ?? {}),
    status: 'acceptée',
    lienDuDevis: { ...d.lienDuDevis, accepteLe: new Date().toISOString() },
  };
  await ecris(piece, neuve);
  return json({ ok: true, page: page({ ...(neuve as unknown as DevisLuEnDirect), id: piece.id }) });
}

/** CONFIRMER — « Oui, je confirme ma place », parmi celles proposées. */
async function confirmer(req: Request, b: Record<string, unknown>) {
  if (!(await permis(ipOf(req), 'devis-confirmer', 30))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!FORME_DU_JETON.test(jeton)) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ error: 'lien_introuvable' }, 404);
  const d = devisDe(piece);
  if (!d.lienDuDevis) return json({ error: 'lien_introuvable' }, 404);
  const jour = String(b.jour ?? '').trim();
  const heure = String(b.heure ?? '').trim();
  /* LA PLACE SE PREND PARMI CELLES QUE LA MAISON A PROPOSÉES. Le téléphone
     ne fabrique ni un jour ni une heure : une place qui n'est pas dans
     l'offre est refusée, même si elle est libre par ailleurs. */
  const proposees = d.devisDuFauteuil?.places ?? [];
  if (!proposees.some((x) => x.jour === jour && x.heure === heure)) return json({ error: 'place' }, 400);
  if (d.lienDuDevis.place) return json({ ok: true, deja: true, page: page(d) });
  if (!d.lienDuDevis.accepteLe) return json({ error: 'pas_accepte' }, 409);
  const quand = new Date().toISOString();
  const neuve: Record<string, unknown> = {
    ...(piece.data ?? {}),
    status: 'confirmé',
    lienDuDevis: { ...d.lienDuDevis, place: { jour, heure }, placeLe: quand },
  };
  await ecris(piece, neuve);
  return json({ ok: true, page: page({ ...(neuve as unknown as DevisLuEnDirect), id: piece.id }) });
}

/* ══ LA PLACE LIBÉRÉE, L'ACOMPTE — 23 novembre 2026 ════════════════════
   La réponse de Yéman : une place choisie mais pas payée SE LIBÈRE AU BOUT
   DE VINGT-QUATRE HEURES, et « Je règle à l'accueil » reste une autre voie.
   La fonction juge à chaque lecture ; une page laissée ouverte dans un
   téléphone ne décide rien. */
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

/** La transaction, relue chez KkiaPay : le retour du widget ne prouve rien. */
async function transaction(transactionId: string): Promise<{ status?: string; amount?: number; failureMessage?: string }> {
  const res = await fetch(`${KKIA_BASE}${KKIA_VERIFY_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('KKIAPAY_PUBLIC_KEY') ?? '',
      'x-private-key': Deno.env.get('KKIAPAY_PRIVATE_KEY') ?? '',
      'x-secret-key': Deno.env.get('KKIAPAY_SECRET_KEY') ?? '',
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'transaction_introuvable' : `kkiapay_${res.status} ${detail.slice(0, 160)}`);
  }
  return (await res.json()) as { status?: string; amount?: number; failureMessage?: string };
}

const jourDeCotonou = (d: Date): string => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
const heureDeCotonou = (d: Date): string => new Date(d.getTime() + 3_600_000).toISOString().slice(11, 16);

/** LA PLACE TOMBÉE : vingt-quatre heures sans acompte, elle s'efface et le
    devis attend qu'elle en choisisse une autre. Écrit une fois, à la
    lecture — la page, comme le Trône, voit la même chose. */
async function libereLaPlaceSiTropTard(piece: Ligne, d: DevisLuEnDirect): Promise<DevisLuEnDirect> {
  const l = d.lienDuDevis;
  if (!l?.place || l.paiement?.le) return d;
  if (placeEncoreTenue({ placeLe: l.placeLe, payee: false, maintenant: Date.now() })) return d;
  const { place: _place, placeLe: _placeLe, ...sans } = l;
  const lien = { ...sans, libereLe: new Date().toISOString() };
  const neuve = { ...(piece.data ?? {}), status: 'acceptée', lienDuDevis: lien };
  await ecris(piece, neuve as Record<string, unknown>);
  return { ...(neuve as unknown as DevisLuEnDirect), id: piece.id };
}

/** PAYER — l'acompte, en ligne. Le montant ne vient pas du téléphone : il se
    calcule sur la pièce (le taux posé à l'envoi), et la transaction se relit
    chez KkiaPay avant d'être écrite. */
async function payer(req: Request, b: Record<string, unknown>) {
  if (!(await permis(ipOf(req), 'devis-payer', 20))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  const transactionId = String(b.transactionId ?? '').trim();
  if (!FORME_DU_JETON.test(jeton) || !transactionId) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ error: 'lien_introuvable' }, 404);
  const d = await libereLaPlaceSiTropTard(piece, devisDe(piece));
  const l = d.lienDuDevis;
  if (!l) return json({ error: 'lien_introuvable' }, 404);
  if (l.paiement?.le) return json({ ok: true, deja: true, page: page(d) });
  if (!l.accepteLe) return json({ error: 'pas_accepte' }, 409);
  if (!l.place) return json({ error: 'pas_place' }, 409);
  const tx = await transaction(transactionId);
  if (String(tx.status ?? '').toUpperCase() !== 'SUCCESS') return json({ error: 'echec', detail: tx.failureMessage ?? tx.status ?? '' }, 402);
  const attendu = acompteAttendu({
    lignes: d.lines ?? [], remisePct: d.globalDiscountPct, remiseXof: d.globalDiscountXof,
    pct: d.devisDuFauteuil?.acomptePct ?? 0,
  });
  const paye = Math.round(Number(tx.amount) || 0);
  if (attendu > 0 && paye + 1 < attendu) return json({ error: 'montant', attendu }, 402);
  const quand = new Date();
  const montant = attendu > 0 ? Math.min(paye, attendu) : paye;
  const versement = {
    id: `kkia-${transactionId}`, date: jourDeCotonou(quand), time: heureDeCotonou(quand),
    amountXof: montant, method: 'KkiaPay', cashbox: 'KkiaPay', note: `Acompte du devis · transaction ${transactionId}`,
  };
  const neuve = {
    ...(piece.data ?? {}),
    status: 'confirmé',
    payments: [...((piece.data?.payments as unknown[]) ?? []), versement],
    lienDuDevis: { ...l, paiement: { le: quand.toISOString(), montantXof: montant, moyen: 'en-ligne', transactionId } },
  };
  await ecris(piece, neuve as Record<string, unknown>);
  return json({ ok: true, paiementXof: montant, page: page({ ...(neuve as unknown as DevisLuEnDirect), id: piece.id }) });
}

/** JE RÈGLE À L'ACCUEIL — l'autre voie, tant que le comptoir existe. La place
    est confirmée sans argent ; le Trône voit l'acompte à encaisser. */
async function aLAccueil(req: Request, b: Record<string, unknown>) {
  if (!(await permis(ipOf(req), 'devis-accueil', 20))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!FORME_DU_JETON.test(jeton)) return json({ error: 'lien' }, 400);
  const piece = await laPieceDuJeton(jeton);
  if (!piece) return json({ error: 'lien_introuvable' }, 404);
  const d = await libereLaPlaceSiTropTard(piece, devisDe(piece));
  const l = d.lienDuDevis;
  if (!l) return json({ error: 'lien_introuvable' }, 404);
  if (l.paiement?.le) return json({ ok: true, deja: true, page: page(d) });
  if (!l.accepteLe) return json({ error: 'pas_accepte' }, 409);
  if (!l.place) return json({ error: 'pas_place' }, 409);
  const attendu = acompteAttendu({
    lignes: d.lines ?? [], remisePct: d.globalDiscountPct, remiseXof: d.globalDiscountXof,
    pct: d.devisDuFauteuil?.acomptePct ?? 0,
  });
  const neuve = {
    ...(piece.data ?? {}),
    lienDuDevis: { ...l, paiement: { le: new Date().toISOString(), montantXof: attendu, moyen: 'accueil' } },
  };
  await ecris(piece, neuve as Record<string, unknown>);
  return json({ ok: true, attendu, page: page({ ...(neuve as unknown as DevisLuEnDirect), id: piece.id }) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ fonction: 'devis-en-direct', ok: true, secrets: { service: !!SERVICE_KEY } });
  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (b.action === 'lire') return await lire(req, b, true);
    if (b.action === 'valider') return await valider(req, b);
    if (b.action === 'accepter') return await accepter(req, b);
    if (b.action === 'confirmer') return await confirmer(req, b);
    if (b.action === 'payer') return await payer(req, b);
    if (b.action === 'accueil') return await aLAccueil(req, b);
    return json({ error: 'action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
