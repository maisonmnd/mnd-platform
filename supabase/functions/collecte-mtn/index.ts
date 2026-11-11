// collecte-mtn - regler par MTN : le compte de collecte de la Maison, par le relais.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

/* ═══════════════════════════════════════════════════════════════════
   COLLECTE-MTN · 11 novembre 2026, maquette « Régler par MTN, QR »
   (AdAaYXGStQetsXHFkZzUW5), « construis » de Yéman.

   LOT A : AUCUN ARGENT NE BOUGE. La direction lit le compte de collecte
   de la Maison chez MTN : le jeton Collection, le solde, et un numéro
   vérifié (actif, nom du titulaire). Rien n'est demandé à personne.

   LOT B : LA DEMANDE DE PAIEMENT (Request to Pay), ÉTEINTE tant que la
   direction ne l'ouvre pas (réglage `collecte_mtn_reglage`, 0200), ce
   qu'elle ne peut faire qu'après un essai de 100 F REÇU par MTN.
   · La cliente tape son numéro MTN : au comptoir (le QR fixe, son rendez-vous
     du jour retrouvé par son numéro), ou sur la page « Régler » de son
     rendez-vous (son jeton). Le MONTANT EST CELUI DU SERVEUR : le reste de
     SA pièce, relue à l'instant ; seul le merci pour l'équipe vient d'elle.
   · La référence (X-Reference-Id) est écrite au registre AVANT l'appel ;
     MTN refuse une référence déjà reçue (409) : une demande ne part qu'une
     fois, même renvoyée.
   · Rien n'est « réglé » avant la réponse SUCCESSFUL de MTN, relue ici : ni
     sur le retour de la page, ni sur le rappel de MTN (mtn-momo-rappel ne
     fait que demander une relecture).
   · Reçu : le versement mtn-<référence> se pose sur la pièce ET le
     rendez-vous, caisse « MTN Collection » (née au premier règlement), la
     trace du règlement aussi (le Trône en tire l'annonce, le merci partagé
     selon les parts, le reçu WhatsApp, comme pour KkiaPay) ; les frais de
     MTN (1,2 %) vont en dépense de la Maison. La pièce réglée entre-temps,
     ou un reste qui a baissé : l'argent reste au registre, « à rapprocher ».

   PAR LE RELAIS, SEULEMENT, comme `paie-mtn` (dont rien n'est touché) :
   chaque appel va à MOMO_RELAIS_URL avec l'en-tête X-Relais-Cle, et le
   relais le transmet tel quel à MTN, depuis l'adresse fixe autorisée.

   LE COMPTE DE COLLECTE N'EST PAS LE COMPTE DE PAIE : ses clés sont les
   siennes. Son numéro et son nom de compte ne s'écrivent jamais dans le
   dépôt, qui est public : ils se lisent dans deux réglages du serveur,
   facultatifs ; sans eux, le Trône dit « numéro à poser ».

   QUI APPELLE.
   · Tout le monde : GET, ou { action: 'sante' } : la version, ce qui est
     posé (oui / non, jamais une valeur), et si le règlement est ouvert ;
     'comptoir', 'demander', 'statut' (sous limite de débit, et seulement
     interrupteur ouvert pour les deux premières).
   · La direction (souverain, gérant), avec son jeton : 'solde', 'essai',
     'essai-paiement', 'interrupteur', 'relire'.
   · Toute personne du personnel, avec son jeton : 'demander-trone' (le
     « Payer par MTN » de la fenêtre Encaisser, 11 novembre 2026), sous
     interrupteur ouvert, sur un rendez-vous qui porte sa pièce.
   · Le passage de la base (cron) et le rappel de MTN, par la clé de
     service : la relecture des demandes vivantes, rien d'autre.
   Verify JWT : ÉTEINT ; la direction se vérifie ici, action par action.

   LES CLÉS NE SORTENT PAS : ni l'utilisateur d'API, ni sa clé, ni la clé
   d'abonnement, ni le jeton, ni la clé du relais ne figurent dans une
   réponse ou un journal.

   SECRETS : MOMO_PROD_COLLECTION_USER, MOMO_PROD_COLLECTION_KEY,
   MOMO_PROD_COLLECTION_SUBSCRIPTION, MOMO_TARGET_ENV (mtnbenin),
   MOMO_RELAIS_URL, MOMO_RELAIS_CLE ; facultatifs, pour l'affichage :
   MOMO_PROD_COLLECTION_NUMERO (le numéro de collecte), MOMO_PROD_COLLECTION_COMPTE
   (le nom du compte chez MTN). SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
   sont posés d'office.
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-11-11-c';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const PROJET = () => env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE = () => env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
/** Les clés de service posées : le passage de la base présente l'une d'elles. */
const CLES_DE_SERVICE = () => [env('SERVICE_KEY'), env('CLE_SERVICE'), env('SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean);
const DIRECTION = new Set(['souverain', 'gerant']);

// ── DEBUT copie de shared/regler-la-seance-pur.ts (collecte-copie-serveur la réécrit, verifie-collecte-mtn la compare)
export const DECALAGE_DE_COTONOU_MS = 3_600_000;

export type LienDeReglement = {
  jeton: string;
  creeLe: string;
  /** Le message parti (le Trône l'écrit quand WhatsApp l'a pris). */
  envoyeLe?: string;
  /** Première ouverture de la page par la cliente (écrite par le serveur). */
  ouvertLe?: string;
  /** Le dernier règlement reçu par ce lien. */
  payeLe?: string;
  /** Tap & Go proposé à côté, tant que le reste n'a pas bougé. */
  tapgo?: { resteXof: number; parametre: string; totalXof: number };
};

export type ReglementEnLigne = {
  id: string;
  transactionId: string;
  payeLe: string;
  montantXof: number;
  pourboireXof: number;
  fraisXof: number;
  moyen?: string;
  partsLe?: string;
  recuLe?: string;
};

export type LigneLue = { label?: string; qty?: number; unitXof?: number; discountPct?: number; discountXof?: number };

export type VersementLu = { id: string; amountXof: number; date?: string; method?: string; cashbox?: string; time?: string; note?: string; invoiceId?: string };

export type PieceLue = {
  id: string; kind?: string; status?: string; number?: string; date?: string;
  clientId?: string; forClientId?: string; clientName?: string; apptId?: string;
  lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number;
  payments?: VersementLu[]; payment?: string; cashbox?: string; time?: string;
  tipXof?: number; reglementsEnLigne?: ReglementEnLigne[];
};

export type RdvLu = {
  id: string; clientId?: string; clientName?: string; date?: string; time?: string;
  master?: string; status?: string; payments?: VersementLu[]; paidXof?: number;
  lienDeReglement?: LienDeReglement;
  lienDuFoyer?: LienDuFoyer;
  /** Elle a déclaré avoir terminé (6 novembre 2026, terminer-et-regler-pur.ts) :
      sa pièce se prépare au Trône, la page l'attend au lieu de renoncer. */
  termineParElle?: { le?: string } | null;
};

export type LienDuFoyer = {
  jeton: string;
  /** Les rendez-vous que le lien règle ensemble, tels que le Trône les a cochés. */
  apptIds: string[];
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  payeLe?: string;
};

export const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';

export const LONGUEUR_DU_JETON = 14;

export const estUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

export const jourDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);

export const heureDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(11, 16);

const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);

export const netDeLaLigne = (l: LigneLue): number =>
  Math.max(0, n(l.qty) * n(l.unitXof) * (1 - n(l.discountPct) / 100) - n(l.discountXof));

export const totalDeLaPiece = (p: PieceLue): number => {
  const sub = (p.lines ?? []).reduce((s, l) => s + netDeLaLigne(l), 0);
  return Math.max(0, Math.round(sub * (1 - n(p.globalDiscountPct) / 100)) - n(p.globalDiscountXof));
};

export const regleDeLaPiece = (p: PieceLue): number => {
  if (p.payments && p.payments.length > 0) return p.payments.reduce((s, v) => s + n(v.amountXof), 0);
  return p.status === 'payée' ? totalDeLaPiece(p) : 0;
};

export const resteDeLaPiece = (p: PieceLue): number => Math.max(0, totalDeLaPiece(p) - regleDeLaPiece(p));

export function laPieceDuRdv(pieces: readonly PieceLue[], rdvId: string): PieceLue | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPiece(b) > 0 ? 1 : 0) - (resteDeLaPiece(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}

export function rdvRegle(r: RdvLu, v: VersementLu, pieceId: string, parLeFoyer = false): RdvLu {
  if ((r.payments ?? []).some((x) => x.id === v.id)) return r;
  const payes = r.payments?.length ? r.payments.reduce((s, x) => s + n(x.amountXof), 0) : n(r.paidXof);
  const payeLe = `${v.date}T${v.time ?? '00:00'}`;
  return {
    ...r,
    paidXof: payes + n(v.amountXof),
    payments: [...(r.payments ?? []), { id: v.id, amountXof: v.amountXof, date: v.date, method: v.method, cashbox: v.cashbox, invoiceId: pieceId }],
    ...(!parLeFoyer && r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe } } : {}),
    ...(parLeFoyer && r.lienDuFoyer ? { lienDuFoyer: { ...r.lienDuFoyer, payeLe } } : {}),
  };
}
// ── FIN copie de shared/regler-la-seance-pur.ts

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul
    l'écrit). `pieceLe` : un poste du Trône a réservé l'écriture de sa pièce
    (une écriture conditionnelle, un seul poste la fait). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
/** La marque posée au règlement : le serveur passe « honoré », un poste du
    Trône réserve les suites (`suitesLe`) et les fait, comme au comptoir. */
export type MarqueDeLHonneur = { le: string; suitesLe?: string };
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DE_LA_FIN_MS = 3_600_000;
export const jourDeLaFin = (ms: number): string => new Date(ms + DECALAGE_DE_LA_FIN_MS).toISOString().slice(0, 10);

/** HONORÉ QUAND ELLE A RÉGLÉ. Rend la marque à poser, ou null : elle n'a
    rien déclaré (le chemin d'avant ne bouge pas), le rendez-vous n'est plus
    « confirmé », il reste à régler, ou le rituel est à venir. Un reste
    illisible n'honore jamais. */
export function honneurAuReglement(o: {
  rdv: { status?: string; date?: string; termineParElle?: MarqueDeLaFin | null } | null;
  resteXof: number;
  maintenantMs: number;
}): MarqueDeLHonneur | null {
  const r = o.rdv;
  if (!r || !r.termineParElle || !r.termineParElle.le) return null;
  if (r.status !== 'confirmé') return null;
  const reste = Number(o.resteXof);
  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;
  const jour = String(r.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > jourDeLaFin(o.maintenantMs)) return null;
  return { le: new Date(o.maintenantMs).toISOString() };
}
/* ⟨/honneur-au-reglement⟩ */

/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */

/* ⟨collecte-mtn⟩ */
/** Un numéro mobile du Bénin, tel que MTN l'attend : 229, puis 01, puis huit chiffres. */
const RE_MSISDN_DU_BENIN = /^22901\d{8}$/;

/** LES PRÉFIXES DE MTN BÉNIN (les deux chiffres après « 01 », numérotation à
    dix chiffres du 30 novembre 2024 ; liste de l'ARCEP Bénin, à revoir si
    MTN reçoit de nouvelles tranches). Ils ne servent qu'à proposer MTN
    d'abord : MTN refuse lui-même un numéro qui n'est pas chez lui, et la
    page offre alors KkiaPay. */
const PREFIXES_MTN_DU_BENIN: readonly string[] = ['42', '46', '50', '51', '52', '53', '54', '56', '57', '59', '61', '62', '66', '67', '69', '90', '91', '96', '97'];

/** Le numéro tapé, en 22901XXXXXXXX, ou null. Un numéro à huit chiffres
    (l'ancien format) ne se complète pas : une demande au mauvais numéro
    sonnerait chez quelqu'un d'autre. */
function msisdnDe(saisi: unknown): string | null {
  let c = String(saisi ?? '').replace(/\D/g, '');
  if (c.startsWith('00229')) c = c.slice(2);
  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;
  return RE_MSISDN_DU_BENIN.test(c) ? c : null;
}

/** Un numéro de chez MTN Bénin (d'après ses préfixes). */
const estUnNumeroMtn = (msisdn: unknown): boolean => {
  const m = msisdnDe(msisdn);
  return !!m && PREFIXES_MTN_DU_BENIN.includes(m.slice(5, 7));
};

/** Le numéro dit par paires : « 01 », puis quatre paires. */
const numeroDitMtn = (msisdn: unknown): string => {
  const m = msisdnDe(msisdn);
  return m ? m.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ') : '';
};

/** « 01 97 •• •• 56 » : ce que le Trône montre d'un numéro de cliente. */
const numeroMasque = (msisdn: unknown): string => {
  const d = numeroDitMtn(msisdn);
  return d ? `${d.slice(0, 5)} •• •• ${d.slice(-2)}` : '';
};

/** Ce que MTN rend d'un titulaire (basicuserinfo) ou d'un compte (balance). */
type FicheDeMtn = { given_name?: unknown; family_name?: unknown; name?: unknown; availableBalance?: unknown } | null | undefined;

/** Le nom que MTN rend pour un numéro (basicuserinfo). */
const nomDeMtnCollecte = (c: FicheDeMtn): string | null => {
  const n = [c?.given_name, c?.family_name].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' ').trim();
  return n || (typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : null);
};

/** Le solde que MTN rend (account/balance), en francs entiers, ou null. */
const soldeDeMtnCollecte = (c: FicheDeMtn): number | null => {
  if (c?.availableBalance === undefined || c?.availableBalance === null || c?.availableBalance === '') return null;
  const n = Number(c.availableBalance);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

/** CE QUE LE SERVEUR DIT DU COMPTE, en clair, pour le bandeau de la
    direction : rien quand tout va, sinon une phrase. Jamais un code nu. */
function souciDuCompte(o: { pret: boolean; jetonHttp?: number; soldeHttp?: number }): string | null {
  if (!o.pret) return 'Les clés de collecte MTN ou le relais ne sont pas encore posés dans Supabase.';
  const j = Number(o.jetonHttp ?? 0);
  if (j === 0) return 'Le relais MTN ne répond pas : le serveur de la Maison est-il allumé ?';
  if (j === 403) return 'Le relais refuse l’appel : la clé du relais posée dans Supabase n’est pas la bonne.';
  if (j === 401) return 'MTN refuse les clés de collecte (utilisateur, clé ou abonnement) : à revoir dans Supabase.';
  if (j !== 200) return `MTN n’a pas donné de jeton (réponse ${j}).`;
  const s = Number(o.soldeHttp ?? 0);
  if (s === 200) return null;
  if (s === 0) return 'Le solde n’a pas pu être lu : le relais n’a pas répondu.';
  if (s === 401 || s === 403) return 'MTN refuse la lecture du solde : l’adresse du relais est-elle autorisée pour la collecte ?';
  return `MTN n’a pas rendu le solde (réponse ${s}).`;
}

/** « il y a 12 s », « il y a 3 min », « à l’instant ». */
function ilYaDit(depuisMs: number): string {
  const s = Math.max(0, Math.round(depuisMs / 1000));
  if (s < 2) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h`;
}

/* ══ LOT B : LA DEMANDE DE PAIEMENT (Request to Pay) ════════════════════
   ÉTEINTE tant que la direction ne l'ouvre pas (réglage en base, 0200),
   et la direction ne peut l'ouvrir qu'après un essai de 100 F REÇU. */

/** La Maison garde les frais de MTN (1,2 % de l'encaissé, contrat du 28 octobre 2026). */
const TAUX_DES_FRAIS_MTN = 0.012;
/** La caisse des règlements par MTN, et le moyen inscrit sur le versement. */
const CAISSE_MTN_COLLECTION = 'MTN Collection';
/** Ce que l'annonce du comptoir et la pièce disent du moyen. */
const MOYEN_MTN_DIT = 'MTN';
/** Le versement posé sur la pièce et le rendez-vous : mtn-<référence>. */
const PREFIXE_DU_VERSEMENT_MTN = 'mtn-';
const MONTANT_ESSAI_MTN = 100;
const MONTANT_ESSAI_MTN_MAX = 500;
const POURBOIRE_MTN_MAX = 100_000;
const MONTANT_MTN_MAX = 2_000_000;
/** Une demande « en vol » depuis moins que cela retient le rendez-vous : pas deux demandes à la fois. */
const DEMANDE_EN_COURS_MS = 3 * 60_000;
/** Une demande écrite mais pas encore confirmée par MTN se relit après ce délai (l'appel peut encore voler). */
const DEMANDE_EN_VOL_MS = 30_000;
/** Deux lectures chez MTN pour la même demande : pas plus d'une toutes les quatre secondes. */
const RELECTURE_MIN_MS = 4_000;
/** Une demande que MTN ne connaît pas se renvoie, sous la même référence, trois fois au plus. */
const MAX_TENTATIVES_MTN = 3;
/** La référence que MTN attend (X-Reference-Id) : un UUID version 4. */
const RE_REFERENCE_MTN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EtatDeLaCollecte = 'demande' | 'attente' | 'sans-reponse' | 'recu' | 'refuse';
type GenreDeCollecte = 'reglement' | 'essai';
type OrigineDeCollecte = 'lien' | 'comptoir' | 'essai';
/** Une ligne du registre `collectes_mtn` (0200), telle que la base la rend. */
type CollecteMtn = {
  reference: string;
  genre: GenreDeCollecte;
  origine: OrigineDeCollecte;
  rdv_id: string | null;
  piece_id: string | null;
  branch_id: string | null;
  msisdn: string;
  montant_xof: number;
  reste_xof: number;
  pourboire_xof: number;
  frais_xof?: number | null;
  etat: EtatDeLaCollecte;
  demande_par: string;
  demande_le?: string;
  relu_le?: string | null;
  repondu_le?: string | null;
  transaction_mtn?: string | null;
  raison?: string | null;
  tentatives?: number | null;
  pose_le?: string | null;
  a_rapprocher?: string | null;
};
const ETATS_VIVANTS: readonly EtatDeLaCollecte[] = ['demande', 'attente', 'sans-reponse'];
const estVivante = (e: unknown): boolean => ETATS_VIVANTS.includes(e as EtatDeLaCollecte);

/** Les frais que MTN retient sur un encaissement : 1,2 %, au franc près. */
const fraisDeMtn = (montantXof: number): number => Math.max(0, Math.round((Number(montantXof) || 0) * TAUX_DES_FRAIS_MTN));

/** Le merci tapé : un entier de 0 à 100 000 F ; rien quand il n'est pas permis. */
function pourboireLu(x: unknown, permis: boolean): number {
  const v = Math.floor(Number(x));
  if (!permis || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(POURBOIRE_MTN_MAX, v);
}

/** LA DEMANDE D'UN RÈGLEMENT, vérifiée champ par champ : ce que le serveur
    écrit au registre AVANT d'appeler MTN. Le reste vient du serveur (la
    pièce relue à l'instant) ; seul le merci vient de la cliente. */
function demandeDeReglement(o: {
  reference: string; origine: 'lien' | 'comptoir'; rdvId: string; pieceId: string; branchId: string | null;
  msisdn: unknown; resteXof: number; pourboireXof: number;
}): CollecteMtn | string {
  if (!RE_REFERENCE_MTN.test(o.reference)) return 'référence illisible';
  const msisdn = msisdnDe(o.msisdn);
  if (!msisdn) return 'numero';
  const reste = Math.round(Number(o.resteXof));
  if (!Number.isInteger(reste) || reste < 1) return 'deja_reglee';
  const pourboire = pourboireLu(o.pourboireXof, true);
  if (reste + pourboire > MONTANT_MTN_MAX) return 'montant';
  if (!o.rdvId || !o.pieceId) return 'sans_piece';
  return {
    reference: o.reference.toLowerCase(), genre: 'reglement', origine: o.origine,
    rdv_id: o.rdvId, piece_id: o.pieceId, branch_id: o.branchId ?? null,
    msisdn, montant_xof: reste + pourboire, reste_xof: reste, pourboire_xof: pourboire,
    etat: 'demande', demande_par: o.origine === 'comptoir' ? 'la cliente, au comptoir' : 'la cliente, par son lien',
  };
}

/** L'ESSAI DE 100 F de la direction, depuis son propre numéro (500 F au plus). */
function demandeDEssai(o: { reference: string; msisdn: unknown; montantXof?: unknown; par: string }): CollecteMtn | string {
  if (!RE_REFERENCE_MTN.test(o.reference)) return 'référence illisible';
  const msisdn = msisdnDe(o.msisdn);
  if (!msisdn) return 'numero';
  const m = o.montantXof === undefined || o.montantXof === null || o.montantXof === '' ? MONTANT_ESSAI_MTN : Math.floor(Number(o.montantXof));
  if (!Number.isInteger(m) || m < 1 || m > MONTANT_ESSAI_MTN_MAX) return 'montant';
  return {
    reference: o.reference.toLowerCase(), genre: 'essai', origine: 'essai', rdv_id: null, piece_id: null, branch_id: null,
    msisdn, montant_xof: m, reste_xof: 0, pourboire_xof: 0, etat: 'demande', demande_par: String(o.par || 'La direction').slice(0, 80),
  };
}

/** Ce que MTN répond à la demande (POST requesttopay), en un état du registre. */
function issueDeLaDemande(http: number, corps: { code?: unknown; reason?: unknown } | null | undefined): { etat: EtatDeLaCollecte; raison?: string } {
  if (http === 202 || http === 200 || http === 201) return { etat: 'attente' };
  /* 409 : MTN a déjà cette référence. La demande est partie une fois ; on la relira. */
  if (http === 409) return { etat: 'attente' };
  if (http === 0 || http >= 500) return { etat: 'sans-reponse' };
  if (http === 401 || http === 403) return { etat: 'refuse', raison: 'ACCES_REFUSE' };
  return { etat: 'refuse', raison: String(corps?.code ?? corps?.reason ?? `HTTP_${http}`) };
}

/** CE QUE MTN DIT D'UNE DEMANDE RELUE (GET requesttopay/{référence}). Seul
    « SUCCESSFUL » vaut reçu ; `renvoie` : MTN ne la connaît pas, elle se
    renvoie sous la même référence (MTN refuse un doublon, 409). */
function issueDuStatut(http: number, corps: { status?: unknown; reason?: unknown; financialTransactionId?: unknown } | null | undefined, etatAvant: EtatDeLaCollecte, tentatives: number):
  { etat: EtatDeLaCollecte; raison?: string; transaction?: string; renvoie?: boolean } {
  if (http === 200) {
    const s = String(corps?.status ?? '').toUpperCase();
    if (s === 'SUCCESSFUL') return { etat: 'recu', ...(corps?.financialTransactionId ? { transaction: String(corps.financialTransactionId) } : {}) };
    if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(s)) {
      const r = corps?.reason as { code?: unknown } | string | undefined;
      return { etat: 'refuse', raison: String((r && typeof r === 'object' ? r.code : r) ?? s) };
    }
    return { etat: 'attente' };
  }
  if (http === 404) {
    /* Acceptée par MTN (202) puis inconnue : on la relit, on ne renvoie pas. */
    if (etatAvant === 'attente') return { etat: 'attente' };
    if (tentatives < MAX_TENTATIVES_MTN) return { etat: etatAvant, renvoie: true };
    return { etat: 'refuse', raison: 'INCONNU_CHEZ_MTN' };
  }
  return { etat: etatAvant === 'demande' ? 'sans-reponse' : etatAvant };
}

/** Une demande à relire chez MTN maintenant : vivante, pas en vol, et pas relue il y a moins de quatre secondes. */
function aRelire(c: Pick<CollecteMtn, 'etat' | 'demande_le' | 'relu_le'>, maintenantMs: number): boolean {
  if (!estVivante(c.etat)) return false;
  const nee = Date.parse(String(c.demande_le ?? ''));
  if (c.etat === 'demande' && Number.isFinite(nee) && maintenantMs - nee < DEMANDE_EN_VOL_MS) return false;
  const lue = Date.parse(String(c.relu_le ?? ''));
  return !Number.isFinite(lue) || maintenantMs - lue >= RELECTURE_MIN_MS;
}

/** Une demande encore vivante et récente retient le rendez-vous : la page le dit. */
const demandeEnCours = (collectes: readonly Pick<CollecteMtn, 'etat' | 'demande_le' | 'rdv_id'>[], rdvId: string, maintenantMs: number): boolean =>
  collectes.some((c) => c.rdv_id === rdvId && estVivante(c.etat) && maintenantMs - (Date.parse(String(c.demande_le ?? '')) || 0) < DEMANDE_EN_COURS_MS);

/** LE PARTAGE À LA CONFIRMATION : la pièce relue doit encore AU MOINS le
    reste demandé ; alors le versement est ce reste, et le merci est celui
    qu'elle a choisi. Réglée entre-temps, ou un reste qui a baissé :
    l'argent reste au registre, « à rapprocher » par la direction. On ne
    devine jamais un pourboire. */
function partageConfirme(demande: { resteXof: number; pourboireXof: number }, resteActuelXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'reste_change' } {
  const actuel = Math.round(Number(resteActuelXof) || 0);
  const demandeXof = Math.round(Number(demande.resteXof) || 0);
  if (actuel <= 0) return { ok: false, raison: 'deja_reglee' };
  if (demandeXof <= 0 || actuel < demandeXof) return { ok: false, raison: 'reste_change' };
  return { ok: true, versementXof: demandeXof, pourboireXof: Math.max(0, Math.round(Number(demande.pourboireXof) || 0)) };
}

const idDuVersementMtn = (reference: string): string => `${PREFIXE_DU_VERSEMENT_MTN}${String(reference).toLowerCase()}`;

/** LE VERSEMENT POSÉ SUR LA PIÈCE ET LE RENDEZ-VOUS (même identifiant), caisse « MTN Collection ». */
function versementMtn(o: { reference: string; montantXof: number; quand: Date; msisdn: string; transaction?: string | null }): VersementLu {
  return {
    id: idDuVersementMtn(o.reference),
    date: jourDeCotonou(o.quand),
    time: heureDeCotonou(o.quand),
    amountXof: Math.round(Number(o.montantXof) || 0),
    method: CAISSE_MTN_COLLECTION,
    cashbox: CAISSE_MTN_COLLECTION,
    note: `Réglé par MTN depuis le ${numeroMasque(o.msisdn)}${o.transaction ? ` · transaction ${o.transaction}` : ''} · référence ${String(o.reference).toLowerCase()}`,
  };
}

/** LA TRACE DU RÈGLEMENT sur la pièce : la forme de `ReglementEnLigne`
    (le Trône en tire l'annonce, le partage du merci et le reçu WhatsApp),
    et ce que la direction lit en plus : la référence MTN, le numéro masqué. */
type TraceMtn = ReglementEnLigne & { referenceMtn: string; numeroMasque: string; caisse: string };
function traceMtn(o: { v: VersementLu; reference: string; transaction?: string | null; quand: Date; pourboireXof: number; fraisXof: number; msisdn: string }): TraceMtn {
  return {
    id: o.v.id, transactionId: o.transaction ? String(o.transaction) : String(o.reference).toLowerCase(), payeLe: o.quand.toISOString(),
    montantXof: o.v.amountXof, pourboireXof: Math.round(o.pourboireXof), fraisXof: Math.round(o.fraisXof), moyen: MOYEN_MTN_DIT,
    referenceMtn: String(o.reference).toLowerCase(), numeroMasque: numeroMasque(o.msisdn), caisse: CAISSE_MTN_COLLECTION,
  };
}

/** LA PIÈCE APRÈS LE RÈGLEMENT PAR MTN : le versement, le statut qui suit
    l'argent, le merci à part (tipXof), la trace. La forme de `pieceReglee`
    (regler-la-seance-pur.ts), la caisse « MTN Collection » en plus. */
function pieceRegleeParMtn(p: PieceLue, v: VersementLu, pourboireXof: number, trace: TraceMtn): PieceLue {
  const payments = [...(p.payments ?? []), v];
  const suivante: PieceLue = { ...p, payments };
  const solde = resteDeLaPiece(suivante) <= 0;
  return {
    ...suivante,
    status: solde ? 'payée' : p.status,
    payment: p.payment ?? CAISSE_MTN_COLLECTION,
    cashbox: p.cashbox ?? CAISSE_MTN_COLLECTION,
    time: p.time ?? v.time,
    ...(pourboireXof > 0 ? { tipXof: (Number(p.tipXof) || 0) + Math.round(pourboireXof) } : {}),
    reglementsEnLigne: [...(p.reglementsEnLigne ?? []).filter((r) => r.id !== trace.id), trace],
  };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE : le même versement (`rdvRegle`), puis
    l'honneur si elle avait déclaré avoir terminé et que tout est réglé
    (`honneurAuReglement`, la règle de regler-la-seance). */
function rdvApresMtn(avant: RdvLu, v: VersementLu, pieceId: string, resteApresXof: number, maintenantMs: number): RdvLu {
  const regle = rdvRegle(avant, v, pieceId);
  const honneur = honneurAuReglement({ rdv: regle as unknown as Parameters<typeof honneurAuReglement>[0]['rdv'], resteXof: resteApresXof, maintenantMs });
  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;
}

/** LES FRAIS DE MTN, EN FRAIS DE LA MAISON : une dépense par règlement,
    payée par la caisse « MTN Collection » (son solde suit celui de MTN). */
function depenseDesFraisMtn(o: { reference: string; branchId: string; fraisXof: number; jour: string; qui?: string }) {
  return {
    id: `exp-mtn-${String(o.reference).toLowerCase()}`,
    branchId: o.branchId,
    label: `Frais MTN (1,2 %)${o.qui ? ` · ${o.qui}` : ''}`,
    amountXof: Math.round(o.fraisXof),
    date: o.jour,
    cashbox: CAISSE_MTN_COLLECTION,
    category: 'Frais bancaires',
    subcategory: 'Commissions Mobile Money',
    laMaisonAPaye: true,
  };
}

/** LA CAISSE « MTN Collection » de la branche, née au premier règlement. */
const caisseMtnNeuve = (branchId: string) => ({
  id: `cb-mtn-collection-${branchId}`, branchId, name: CAISSE_MTN_COLLECTION, sub: 'Règlements par MTN, compte de collecte', glyph: '◈', openingXof: 0,
});

/** CE QUE LA PAGE VOIT D'UNE DEMANDE : son état et son montant, rien d'autre. */
function statutPourLaPage(c: Pick<CollecteMtn, 'etat' | 'montant_xof' | 'raison'>): { etat: 'attente' | 'recu' | 'refuse'; montantXof: number; raison?: string } {
  const etat = c.etat === 'recu' ? 'recu' : c.etat === 'refuse' ? 'refuse' : 'attente';
  return { etat, montantXof: Math.round(Number(c.montant_xof) || 0), ...(etat === 'refuse' ? { raison: raisonDiteALaCliente(c.raison) } : {}) };
}

const RAISONS_MTN: Record<string, string> = {
  APPROVAL_REJECTED: 'la demande a été refusée sur le téléphone',
  EXPIRED: 'la demande a expiré avant d’être validée',
  TIMEOUT: 'la demande a expiré avant d’être validée',
  NOT_ENOUGH_FUNDS: 'le solde MTN ne suffit pas',
  PAYER_LIMIT_REACHED: 'le plafond du compte MTN est atteint',
  PAYER_NOT_FOUND: 'ce numéro n’a pas de compte MTN Mobile Money',
  PAYEE_NOT_ALLOWED_TO_RECEIVE: 'MTN refuse pour l’instant les paiements vers la Maison',
  NOT_ALLOWED: 'MTN a refusé la demande',
  INVALID_CALLBACK_URL_HOST: 'MTN a refusé l’adresse de rappel de la Maison',
  INTERNAL_PROCESSING_ERROR: 'MTN a eu une erreur interne',
  SERVICE_UNAVAILABLE: 'le service MTN était indisponible',
  COULD_NOT_PERFORM_TRANSACTION: 'MTN n’a pas pu faire le paiement',
  TRANSACTION_CANCELED: 'la demande a été annulée chez MTN',
  ACCES_REFUSE: 'MTN a refusé l’accès de la Maison',
  INCONNU_CHEZ_MTN: 'MTN n’a pas reçu la demande',
};
/** La raison d'un refus, en clair ; un code inconnu se dit tel quel. */
function raisonDiteALaCliente(code?: string | null): string {
  const c = String(code ?? '').trim();
  if (!c) return 'MTN n’a pas dit pourquoi';
  return RAISONS_MTN[c.toUpperCase()] ?? `MTN dit ${c}`;
}

const ETAT_DE_LA_COLLECTE_DIT: Record<EtatDeLaCollecte, string> = {
  demande: 'Demande MTN envoyée',
  attente: 'En attente de sa validation',
  'sans-reponse': 'MTN n’a pas encore répondu',
  recu: 'Confirmé par MTN',
  refuse: 'Refusé par MTN',
};

/* ── LE COMPTOIR : un numéro, le rendez-vous du jour ─────────────────── */

/** La clé d'un numéro : ses huit derniers chiffres (le format d'avant, et
    celui d'après sans « 01 », se rejoignent). */
const cleDuNumeroMtn = (brut: unknown): string => {
  const d = String(brut ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : '';
};

/** « Paulette K. » : le prénom d'usage, et l'initiale du nom. Rien de plus pour un anonyme. */
function prenomEtInitiale(fiche: { name?: unknown; prenomUsage?: unknown } | null, repli?: unknown): string {
  const prenom = prenomDUsage(fiche, repli);
  const nom = String(fiche?.name ?? repli ?? '').trim().replace(/\s+/g, ' ').replace(/ ?- ?/g, '-');
  /* L'initiale est celle du NOM : après le prénom que le nom porte (deviné),
     même quand la fiche note un autre prénom d'usage. */
  const devine = prenomDUsage({ name: nom });
  const reste = devine && nom.toLowerCase().startsWith(devine.toLowerCase()) ? nom.slice(devine.length).trim() : nom.split(' ').slice(1).join(' ');
  const initiale = (reste.match(/\p{L}/u) ?? [''])[0].toUpperCase();
  return [prenom, initiale ? `${initiale}.` : ''].filter(Boolean).join(' ');
}

type RdvDuComptoir = { rdv: RdvLu & { numeroAPrevenir?: string }; fiche: { name?: unknown; prenomUsage?: unknown; phone?: unknown; phone2?: unknown } | null; piece: PieceLue | null };
type TrouveAuComptoir = { rdvId: string; pieceId: string | null; prenom: string; etat: 'a-regler' | 'reglee' | 'sans-piece'; resteXof: number; pourboire: boolean };

/** LES RENDEZ-VOUS DU JOUR DE CE NUMÉRO : celui à prévenir, ou ceux de la
    fiche ; jamais un annulé ; dans l'ordre de l'heure ; trois au plus. */
function rdvsDuNumero(o: { msisdn: unknown; jour: string; rdvs: readonly RdvDuComptoir[] }): TrouveAuComptoir[] {
  const cle = cleDuNumeroMtn(msisdnDe(o.msisdn));
  if (!cle) return [];
  return o.rdvs
    .filter((x) => String(x.rdv.date ?? '').slice(0, 10) === o.jour && x.rdv.status !== 'annulé')
    .filter((x) => [x.rdv.numeroAPrevenir, x.fiche?.phone, x.fiche?.phone2].some((n) => cleDuNumeroMtn(n) === cle))
    .sort((a, b) => `${a.rdv.time ?? ''} ${a.rdv.id}`.localeCompare(`${b.rdv.time ?? ''} ${b.rdv.id}`))
    .slice(0, 3)
    .map((x) => {
      const reste = x.piece ? resteDeLaPiece(x.piece) : 0;
      return {
        rdvId: x.rdv.id, pieceId: x.piece?.id ?? null, prenom: prenomEtInitiale(x.fiche, x.rdv.clientName),
        etat: !x.piece ? 'sans-piece' : reste > 0 ? 'a-regler' : 'reglee',
        resteXof: Math.round(reste), pourboire: !!x.piece && !((Number(x.piece.tipXof) || 0) > 0),
      };
    });
}

/** CE QUE LA PAGE DU COMPTOIR REÇOIT : un rang, un prénom et une initiale,
    un état, un reste. Ni identifiant, ni lignes, ni numéro. */
const pageDuComptoir = (trouves: readonly TrouveAuComptoir[]) =>
  trouves.map((t, n) => ({ n, prenom: t.prenom, etat: t.etat, resteXof: t.resteXof, pourboire: t.pourboire }));

/* ── LE TRÔNE ────────────────────────────────────────────────────────── */

/** L'interrupteur ne s'ouvre qu'après un essai REÇU par MTN. */
const peutOuvrirLaCollecte = (collectes: readonly Pick<CollecteMtn, 'genre' | 'etat'>[]): boolean =>
  collectes.some((c) => c.genre === 'essai' && c.etat === 'recu');

/** Le jour de Cotonou d'une ligne du registre (sa réponse, sinon sa demande). */
const jourDeLaCollecte = (c: Pick<CollecteMtn, 'repondu_le' | 'demande_le'>): string => {
  const ms = Date.parse(String(c.repondu_le ?? c.demande_le ?? ''));
  return Number.isFinite(ms) ? jourDeCotonou(new Date(ms)) : '';
};

/** LES RÈGLEMENTS MTN D'UN JOUR, les plus récents d'abord, et leurs totaux
    (seul ce que MTN a confirmé compte). */
function reglementsMtnDuJour<C extends CollecteMtn>(collectes: readonly C[], jour: string): { lignes: C[]; recuXof: number; fraisXof: number; recus: number } {
  const lignes = collectes.filter((c) => c.genre === 'reglement' && jourDeLaCollecte(c) === jour)
    .sort((a, b) => String(b.repondu_le ?? b.demande_le ?? '').localeCompare(String(a.repondu_le ?? a.demande_le ?? '')));
  const recues = lignes.filter((c) => c.etat === 'recu');
  return {
    lignes,
    recuXof: recues.reduce((s, c) => s + c.montant_xof, 0),
    fraisXof: recues.reduce((s, c) => s + (Number(c.frais_xof) || fraisDeMtn(c.montant_xof)), 0),
    recus: recues.length,
  };
}

/** Une trace de pièce posée par MTN (la direction y lit la référence). */
const estUneTraceMtn = (r: unknown): r is TraceMtn =>
  !!r && typeof r === 'object' && typeof (r as { referenceMtn?: unknown }).referenceMtn === 'string';
/* ⟨/collecte-mtn⟩ */

/* ── La base, par la clé de service ── */
const enTetesBase = () => ({ apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'Content-Type': 'application/json' });
async function base(chemin: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; corps: any }> {
  try {
    const r = await fetch(`${PROJET()}/rest/v1/${chemin}`, { ...init, headers: { ...enTetesBase(), ...(init.headers ?? {}) } });
    const t = await r.text().catch(() => '');
    let corps: any = null;
    try { corps = t ? JSON.parse(t) : null; } catch { corps = t; }
    return { ok: r.ok, status: r.status, corps };
  } catch {
    return { ok: false, status: 0, corps: null };
  }
}
const premiere = (r: { ok: boolean; corps: any }): any => (r.ok && Array.isArray(r.corps) ? r.corps[0] ?? null : null);
const enc = encodeURIComponent;

/* ── MTN, par le relais ── */
const cles = () => ({
  utilisateur: env('MOMO_PROD_COLLECTION_USER'),
  cle: env('MOMO_PROD_COLLECTION_KEY'),
  abonnement: env('MOMO_PROD_COLLECTION_SUBSCRIPTION'),
  relais: env('MOMO_RELAIS_URL').replace(/\/$/, ''),
  relaisCle: env('MOMO_RELAIS_CLE'),
  cible: env('MOMO_TARGET_ENV') || 'mtnbenin',
});
const pret = () => { const k = cles(); return !!(k.utilisateur && k.cle && k.abonnement && k.relais && k.relaisCle); };

async function mtn(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ http: number; corps: any }> {
  const k = cles();
  try {
    const r = await fetch(`${k.relais}${chemin}`, {
      method: init.method ?? 'GET',
      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },
      body: init.body,
      signal: AbortSignal.timeout(20_000),
    });
    const t = await r.text().catch(() => '');
    let corps: any = null;
    try { corps = t ? JSON.parse(t) : null; } catch { corps = null; }
    return { http: r.status, corps };
  } catch {
    return { http: 0, corps: null };
  }
}
let jetonDuPassage: { jeton: string | null; http: number } | null = null;
async function jeton(): Promise<{ jeton: string | null; http: number }> {
  if (jetonDuPassage) return jetonDuPassage;
  const k = cles();
  const r = await mtn('/collection/token/', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${k.utilisateur}:${k.cle}`)}` } });
  jetonDuPassage = { jeton: r.http === 200 && typeof r.corps?.access_token === 'string' ? r.corps.access_token : null, http: r.http };
  return jetonDuPassage;
}
async function mtnAuth(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const j = await jeton();
  if (!j.jeton) return { http: j.http === 200 ? 401 : j.http, corps: { code: 'ACCES_REFUSE' } };
  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, 'X-Target-Environment': cles().cible, ...(init.headers ?? {}) } });
}

/** Le solde du compte de collecte, et ce que MTN a répondu. */
async function leSolde(): Promise<{ soldeXof: number | null; devise: string | null; jetonHttp: number; soldeHttp: number }> {
  const j = await jeton();
  if (!j.jeton) return { soldeXof: null, devise: null, jetonHttp: j.http, soldeHttp: 0 };
  const r = await mtnAuth('/collection/v1_0/account/balance');
  return {
    soldeXof: r.http === 200 ? soldeDeMtnCollecte(r.corps) : null,
    devise: r.http === 200 && typeof r.corps?.currency === 'string' ? r.corps.currency : null,
    jetonHttp: j.http, soldeHttp: r.http,
  };
}

/** Le numéro et le nom du compte de collecte, lus dans leurs réglages : jamais écrits dans le dépôt. */
const leCompte = () => ({
  numero: numeroDitMtn(env('MOMO_PROD_COLLECTION_NUMERO')) || null,
  compte: env('MOMO_PROD_COLLECTION_COMPTE').slice(0, 60) || null,
});

/* ── Qui appelle ── */
/** LE PERSONNEL, QUEL QUE SOIT SON RÔLE (11 novembre 2026) : la fenêtre
    Encaisser du Trône demande au téléphone de la cliente. Même lecture que
    la direction, sans exiger le rôle. */
async function personnel(req: Request): Promise<{ par: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearers+/i, '').trim();
  if (!jwt || CLES_DE_SERVICE().includes(jwt)) return null;
  const u = await fetch(`${PROJET()}/auth/v1/user`, { headers: { apikey: SERVICE(), Authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!u || !u.ok) return null;
  const uid = (await u.json().catch(() => null))?.id;
  if (typeof uid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const s = await base(`staff?user_id=eq.${uid}&select=role,name&limit=1`);
  const moi = Array.isArray(s.corps) ? s.corps[0] : null;
  if (!moi) return null;
  return { par: String(moi.name ?? '').trim() || 'L’équipe' };
}
async function direction(req: Request): Promise<{ par: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || CLES_DE_SERVICE().includes(jwt)) return null;
  const u = await fetch(`${PROJET()}/auth/v1/user`, { headers: { apikey: SERVICE(), Authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!u || !u.ok) return null;
  const uid = (await u.json().catch(() => null))?.id;
  if (typeof uid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const s = await base(`staff?user_id=eq.${uid}&select=role,name&limit=1`);
  const moi = Array.isArray(s.corps) ? s.corps[0] : null;
  if (!moi || !DIRECTION.has(String(moi.role))) return null;
  return { par: String(moi.name ?? '').trim() || 'La direction' };
}
const estLePassage = (req: Request) => {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return !!jwt && CLES_DE_SERVICE().includes(jwt);
};

/* ── L'interrupteur (0200) : illisible ou absent, il est FERMÉ ── */
async function leReglage(): Promise<{ ouverte: boolean; rappel: boolean; lu: boolean }> {
  const l = premiere(await base('collecte_mtn_reglage?id=eq.1&select=ouverte,rappel&limit=1'));
  if (!l) return { ouverte: false, rappel: false, lu: false };
  return { ouverte: l.ouverte === true, rappel: l.rappel !== false, lu: true };
}

/* ── La limite de débit, la table des demandes du site (0007) ── */
const ipOf = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
async function permis(req: Request, seau: string, plafond: number): Promise<boolean> {
  const ip = ipOf(req);
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const r = await base(`edge_rate_limits?select=at&bucket=eq.${enc(seau)}&ip=eq.${enc(ip)}&at=gte.${enc(depuis)}&limit=${plafond}`);
  if (!r.ok || !Array.isArray(r.corps)) return true; // table absente : ne pas bloquer un règlement
  if (r.corps.length >= plafond) return false;
  await base('edge_rate_limits', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bucket: seau, ip }) });
  return true;
}

/* ── Le registre (0200) ── */
async function ecrisLaCollecte(reference: string, patch: Record<string, unknown>, siEtat?: string): Promise<CollecteMtn | null> {
  const filtre = `reference=eq.${reference}${siEtat ? `&etat=eq.${siEtat}` : ''}`;
  const r = await base(`collectes_mtn?${filtre}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  return r.ok && Array.isArray(r.corps) && r.corps.length === 1 ? r.corps[0] as CollecteMtn : null;
}
const laCollecte = async (reference: string): Promise<CollecteMtn | null> =>
  premiere(await base(`collectes_mtn?reference=eq.${reference}&select=*&limit=1`)) as CollecteMtn | null;

/** LA DEMANDE À MTN : sous sa référence, déjà au registre. Le rappel (si le
    réglage le permet) vise l'adresse déclarée chez MTN ; il ne fait que
    demander une relecture. */
async function demandeAMtn(c: CollecteMtn, rappel: boolean): Promise<CollecteMtn> {
  const r = await mtnAuth('/collection/v1_0/requesttopay', {
    method: 'POST',
    headers: {
      'X-Reference-Id': c.reference, 'Content-Type': 'application/json',
      ...(rappel ? { 'X-Callback-Url': `${PROJET()}/functions/v1/mtn-momo-rappel/collection` } : {}),
    },
    body: JSON.stringify({
      amount: String(c.montant_xof), currency: 'XOF', externalId: c.reference,
      payer: { partyIdType: 'MSISDN', partyId: c.msisdn },
      payerMessage: 'Maison MND', payeeNote: c.genre === 'essai' ? 'Essai Maison MND' : 'Reglement Maison MND',
    }),
  });
  const issue = issueDeLaDemande(r.http, r.corps);
  const maintenant = new Date().toISOString();
  const ecrite = await ecrisLaCollecte(c.reference, {
    etat: issue.etat, ...(issue.raison ? { raison: issue.raison, repondu_le: maintenant } : {}),
  });
  return ecrite ?? { ...c, etat: issue.etat, ...(issue.raison ? { raison: issue.raison } : {}) };
}

/* ── Poser l'argent : la pièce, le rendez-vous, la caisse, les frais ── */

/** Le rendez-vous suit sa pièce, relu à l'instant, sous condition (le Trône
    écrit les mêmes lignes). Rend son nom et s'il est désormais honoré. */
async function suisLeRdv(rdvId: string, v: VersementLu, pieceId: string, resteApresXof: number, quandMs: number): Promise<{ honore: boolean; nom: string }> {
  for (let essai = 0; essai < 3; essai++) {
    const l = premiere(await base(`appointments?id=eq.${enc(rdvId)}&select=id,data,updated_at&limit=1`));
    if (!l) return { honore: false, nom: '' };
    const avant = { ...(l.data ?? {}), id: l.id } as RdvLu;
    const apres = rdvApresMtn(avant, v, pieceId, resteApresXof, quandMs);
    const nom = String(avant.clientName ?? '');
    const honore = !!(apres as { honoreAuReglement?: { le?: string } }).honoreAuReglement?.le;
    if (apres === avant) return { honore, nom };
    const w = await base(`appointments?id=eq.${enc(rdvId)}${l.updated_at ? `&updated_at=eq.${enc(l.updated_at)}` : ''}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: apres }),
    });
    if (w.ok && Array.isArray(w.corps) && w.corps.length === 1) return { honore, nom };
  }
  return { honore: false, nom: '' };
}

/** La caisse « MTN Collection » de la branche : née au premier règlement, jamais deux fois. */
async function laCaisse(branchId: string): Promise<void> {
  if (!branchId) return;
  const r = await base(`cashboxes?branch_id=eq.${enc(branchId)}&select=id,data&limit=200`);
  if (!r.ok || !Array.isArray(r.corps)) return;
  if (r.corps.some((b: any) => b?.data?.name === CAISSE_MTN_COLLECTION)) return;
  const c = caisseMtnNeuve(branchId);
  await base('cashboxes', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: c.id, branch_id: branchId, data: c }) });
}

/** POSER UN RÈGLEMENT REÇU. Seul celui qui a écrit « reçu » au registre
    (écriture conditionnelle) l'appelle, ou le passage pour un règlement reçu
    resté sans pose (une panne entre les deux). Un rejeu ne double rien : le
    versement porte la référence. */
async function poser(c: CollecteMtn): Promise<{ pose: boolean; honore: boolean; raison?: string }> {
  if (c.genre !== 'reglement' || !c.piece_id || !c.rdv_id || c.etat !== 'recu') return { pose: false, honore: false };
  const quand = new Date(Date.parse(String(c.repondu_le ?? '')) || Date.now());
  const idV = idDuVersementMtn(c.reference);
  for (let essai = 0; essai < 3; essai++) {
    const lu = await base(`invoices?id=eq.${enc(c.piece_id)}&select=id,branch_id,data,updated_at&limit=1`);
    if (!lu.ok) return { pose: false, honore: false, raison: 'lecture' };
    const ligne = premiere(lu);
    if (!ligne || ligne.data?.status === 'annulée') {
      await ecrisLaCollecte(c.reference, { a_rapprocher: 'piece_introuvable' });
      return { pose: false, honore: false, raison: 'piece_introuvable' };
    }
    const piece = { ...(ligne.data ?? {}), id: ligne.id } as PieceLue;
    const deja = (piece.payments ?? []).find((x) => x.id === idV);
    if (deja) {
      /* UN REJEU : l'argent est sur la pièce ; le rendez-vous le suit s'il ne l'a pas encore. */
      const s = await suisLeRdv(c.rdv_id, deja, piece.id, resteDeLaPiece(piece), quand.getTime());
      await ecrisLaCollecte(c.reference, { pose_le: new Date().toISOString() });
      return { pose: true, honore: s.honore };
    }
    const partage = partageConfirme({ resteXof: c.reste_xof, pourboireXof: c.pourboire_xof }, resteDeLaPiece(piece));
    if (!partage.ok) {
      await ecrisLaCollecte(c.reference, { a_rapprocher: partage.raison });
      return { pose: false, honore: false, raison: partage.raison };
    }
    const frais = fraisDeMtn(c.montant_xof);
    const v = versementMtn({ reference: c.reference, montantXof: partage.versementXof, quand, msisdn: c.msisdn, transaction: c.transaction_mtn });
    const trace = traceMtn({ v, reference: c.reference, transaction: c.transaction_mtn, quand, pourboireXof: partage.pourboireXof, fraisXof: frais, msisdn: c.msisdn });
    const neuve = pieceRegleeParMtn(piece, v, partage.pourboireXof, trace);
    const w = await base(`invoices?id=eq.${enc(piece.id)}${ligne.updated_at ? `&updated_at=eq.${enc(ligne.updated_at)}` : ''}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: neuve }),
    });
    if (!w.ok) return { pose: false, honore: false, raison: 'ecriture' };
    /* La pièce a bougé entre la lecture et l'écriture : on relit, on rejuge. */
    if (!Array.isArray(w.corps) || w.corps.length !== 1) continue;
    const s = await suisLeRdv(c.rdv_id, v, piece.id, resteDeLaPiece(neuve), quand.getTime());
    const branche = String(ligne.branch_id ?? c.branch_id ?? '');
    await laCaisse(branche);
    if (frais > 0 && branche) {
      const d = depenseDesFraisMtn({ reference: c.reference, branchId: branche, fraisXof: frais, jour: jourDeCotonou(quand), qui: prenomEtInitiale(null, s.nom) });
      await base('expenses', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ id: d.id, branch_id: branche, data: d }) });
    }
    await ecrisLaCollecte(c.reference, { pose_le: new Date().toISOString(), frais_xof: frais });
    console.log('[collecte-mtn] posé', { reference: c.reference.slice(0, 8), versementXof: partage.versementXof, pourboireXof: partage.pourboireXof });
    return { pose: true, honore: s.honore };
  }
  return { pose: false, honore: false, raison: 'ecriture' };
}

/** RELIRE UNE DEMANDE CHEZ MTN. Seul « SUCCESSFUL » vaut reçu, et seul celui
    qui gagne l'écriture conditionnelle pose l'argent. */
async function relis(c: CollecteMtn): Promise<CollecteMtn> {
  const maintenant = new Date().toISOString();
  const r = await mtnAuth(`/collection/v1_0/requesttopay/${c.reference}`);
  const issue = issueDuStatut(r.http, r.corps, c.etat, Number(c.tentatives ?? 0));
  if (issue.renvoie) {
    const prise = await ecrisLaCollecte(c.reference, { etat: 'demande', tentatives: Number(c.tentatives ?? 0) + 1, relu_le: maintenant }, c.etat);
    if (!prise) return (await laCollecte(c.reference)) ?? c;
    const reglage = await leReglage();
    return await demandeAMtn(prise, reglage.rappel);
  }
  if (issue.etat === 'recu') {
    const recue = await ecrisLaCollecte(c.reference, {
      etat: 'recu', repondu_le: maintenant, relu_le: maintenant, frais_xof: fraisDeMtn(c.montant_xof),
      ...(issue.transaction ? { transaction_mtn: issue.transaction } : {}),
    }, c.etat);
    if (recue && recue.genre === 'reglement') await poser(recue);
    return (await laCollecte(c.reference)) ?? c;
  }
  if (issue.etat === 'refuse') {
    return (await ecrisLaCollecte(c.reference, { etat: 'refuse', raison: issue.raison ?? null, repondu_le: maintenant, relu_le: maintenant }, c.etat))
      ?? (await laCollecte(c.reference)) ?? c;
  }
  return (await ecrisLaCollecte(c.reference, { relu_le: maintenant, ...(issue.etat !== c.etat ? { etat: issue.etat } : {}) }, c.etat))
    ?? (await laCollecte(c.reference)) ?? c;
}

/** LE PASSAGE : les demandes vivantes relues, et les règlements reçus restés sans pose. */
async function passage(references?: string[]) {
  const bilan = { relues: 0, recues: 0, refusees: 0, posees: 0, note: '' };
  if (!pret()) return { ...bilan, note: 'Les clés de collecte MTN ne sont pas posées.' };
  const filtre = references?.length ? `&reference=in.(${references.filter((x) => RE_REFERENCE_MTN.test(x)).join(',')})` : '';
  if (references && !filtre) return bilan;
  const lus = await base(`collectes_mtn?select=*&etat=in.(demande,attente,sans-reponse)${filtre}&order=demande_le.asc&limit=100`);
  const maintenant = Date.now();
  for (const c of (Array.isArray(lus.corps) ? lus.corps : []) as CollecteMtn[]) {
    if (!aRelire(c, maintenant)) continue;
    const apres = await relis(c);
    bilan.relues++;
    if (apres.etat === 'recu') bilan.recues++;
    if (apres.etat === 'refuse') bilan.refusees++;
  }
  /* Reçus mais pas posés depuis plus d'une minute : une panne entre les deux. */
  const avant = new Date(maintenant - 60_000).toISOString();
  const aPoser = await base(`collectes_mtn?select=*&etat=eq.recu&genre=eq.reglement&pose_le=is.null&a_rapprocher=is.null&repondu_le=lt.${enc(avant)}${filtre}&limit=50`);
  for (const c of (Array.isArray(aPoser.corps) ? aPoser.corps : []) as CollecteMtn[]) {
    if ((await poser(c)).pose) bilan.posees++;
  }
  return bilan;
}

/* ── Le rendez-vous et sa pièce ── */
type Ligne = { id: string; branch_id: string | null; data: any; updated_at?: string };
async function leRdvDuJeton(jeton: string): Promise<Ligne | null> {
  const r = await base(`appointments?select=id,branch_id,data&data->lienDeReglement->>jeton=eq.${enc(jeton)}&limit=2`);
  return r.ok && Array.isArray(r.corps) && r.corps.length === 1 ? r.corps[0] as Ligne : null;
}
async function laPieceDe(rdvId: string): Promise<PieceLue | null> {
  const r = await base(`invoices?select=id,branch_id,data&data->>apptId=eq.${enc(rdvId)}&limit=20`);
  const lignes = (r.ok && Array.isArray(r.corps) ? r.corps : []) as Ligne[];
  return laPieceDuRdv(lignes.map((l) => ({ ...(l.data ?? {}), id: l.id })), rdvId);
}
/** Les rendez-vous du jour, leurs fiches et leurs pièces : ce que le comptoir trie. */
async function leJourDuComptoir(jour: string, msisdn: string): Promise<{ trouves: TrouveAuComptoir[]; lignes: Map<string, Ligne> }> {
  const r = await base(`appointments?select=id,branch_id,data&data->>date=eq.${jour}&limit=400`);
  const lignes = (r.ok && Array.isArray(r.corps) ? r.corps : []) as Ligne[];
  const ids = [...new Set(lignes.map((l) => String(l.data?.clientId ?? '')).filter((x) => /^[A-Za-z0-9_-]{1,120}$/.test(x)))];
  const fiches = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 80) {
    const f = await base(`clients?select=id,data&id=in.(${ids.slice(i, i + 80).join(',')})`);
    for (const x of (f.ok && Array.isArray(f.corps) ? f.corps : [])) fiches.set(String(x.id), x.data ?? null);
  }
  /* Le tri d'abord sans les pièces (le numéro), puis les pièces des trouvés seulement. */
  const sansPiece = rdvsDuNumero({ msisdn, jour, rdvs: lignes.map((l) => ({ rdv: { ...(l.data ?? {}), id: l.id }, fiche: fiches.get(String(l.data?.clientId ?? '')) ?? null, piece: null })) });
  const rdvs: RdvDuComptoir[] = [];
  for (const t of sansPiece) {
    const l = lignes.find((x) => x.id === t.rdvId)!;
    rdvs.push({ rdv: { ...(l.data ?? {}), id: l.id }, fiche: fiches.get(String(l.data?.clientId ?? '')) ?? null, piece: await laPieceDe(l.id) });
  }
  return { trouves: rdvsDuNumero({ msisdn, jour, rdvs }), lignes: new Map(lignes.map((l) => [l.id, l])) };
}

/* ── Les actions de la page ── */
async function demander(req: Request, corps: any) {
  if (!(await permis(req, 'collecte-demander', 12))) return json({ erreur: 'trop' }, 429);
  const reglage = await leReglage();
  if (!reglage.ouverte) return json({ erreur: 'fermee' }, 503);
  if (!pret()) return json({ erreur: 'indisponible' }, 503);
  let rdv: Ligne | null = null;
  let origine: 'lien' | 'comptoir' = 'lien';
  let msisdn: unknown = corps.msisdn;
  if (corps.jeton !== undefined) {
    const jeton = String(corps.jeton ?? '').trim();
    if (!estUnJeton(jeton)) return json({ erreur: 'lien' }, 400);
    rdv = await leRdvDuJeton(jeton);
    if (!rdv) return json({ erreur: 'lien' }, 404);
  } else {
    origine = 'comptoir';
    msisdn = corps.comptoir?.numero;
    const m = msisdnDe(msisdn);
    const rang = Math.floor(Number(corps.comptoir?.n ?? 0));
    if (!m || !Number.isInteger(rang) || rang < 0 || rang > 2) return json({ erreur: 'numero' }, 400);
    const jour = jourDeCotonou(new Date());
    const j = await leJourDuComptoir(jour, m);
    const t = j.trouves[rang];
    if (!t) return json({ erreur: 'introuvable' }, 404);
    rdv = j.lignes.get(t.rdvId) ?? null;
    if (!rdv) return json({ erreur: 'introuvable' }, 404);
  }
  return demandePourLeRdv(rdv, msisdn, origine, corps, reglage.rappel);
}

/** LA DEMANDE, UNE FOIS LE RENDEZ-VOUS TROUVÉ : par le lien, au comptoir, ou
    depuis la fenêtre Encaisser du Trône (`par` : qui l'a envoyée). */
async function demandePourLeRdv(rdv: Ligne, msisdn: unknown, origine: 'lien' | 'comptoir', corps: any, rappel: boolean, par?: string) {
  if (!msisdnDe(msisdn)) return json({ erreur: 'numero' }, 400);
  if (rdv.data?.status === 'annulé') return json({ erreur: 'annule' }, 409);
  const piece = await laPieceDe(rdv.id);
  if (!piece) return json({ erreur: 'sans_piece' }, 409);
  const reste = resteDeLaPiece(piece);
  if (reste <= 0) return json({ erreur: 'deja_reglee' }, 409);
  const vivantes = await base(`collectes_mtn?select=etat,demande_le,rdv_id&rdv_id=eq.${enc(rdv.id)}&etat=in.(demande,attente,sans-reponse)&limit=20`);
  if (demandeEnCours((Array.isArray(vivantes.corps) ? vivantes.corps : []) as CollecteMtn[], rdv.id, Date.now())) return json({ erreur: 'en_cours' }, 409);
  const c = demandeDeReglement({
    reference: crypto.randomUUID(), origine, rdvId: rdv.id, pieceId: piece.id, branchId: rdv.branch_id ?? null,
    msisdn, resteXof: reste, pourboireXof: pourboireLu(corps.pourboireXof, !((Number(piece.tipXof) || 0) > 0)),
  });
  if (typeof c === 'string') return json({ erreur: c }, 400);
  if (par) c.demande_par = `${par}, au Trône`.slice(0, 80);
  /* LA RÉFÉRENCE AU REGISTRE AVANT L'APPEL. */
  const ins = await base('collectes_mtn', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(c) });
  if (!ins.ok) return json({ erreur: 'registre' }, 503);
  const apres = await demandeAMtn(c, rappel);
  console.log('[collecte-mtn] demande', { reference: c.reference.slice(0, 8), origine, trone: !!par, etat: apres.etat });
  return json({ ok: true, reference: c.reference, ...statutPourLaPage(apres) });
}

/** « PAYER PAR MTN » DANS LA FENÊTRE ENCAISSER (11 novembre 2026, « il faut
    mettre Payer par MTN », Yéman) : le personnel envoie la demande au numéro
    MTN de la cliente, pour CE rendez-vous. Mêmes gardes que la page :
    interrupteur ouvert, pièce émise, reste figé au serveur, une demande
    vivante à la fois. L'argent se pose sur la pièce à la réponse de MTN. */
async function demanderDuTrone(req: Request, corps: any) {
  if (!(await permis(req, 'collecte-trone', 60))) return json({ erreur: 'trop' }, 429);
  const qui = await personnel(req);
  if (!qui) return json({ erreur: 'personnel' }, 403);
  const reglage = await leReglage();
  if (!reglage.ouverte) return json({ erreur: 'fermee' }, 503);
  if (!pret()) return json({ erreur: 'indisponible' }, 503);
  const rdvId = String(corps.rdvId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(rdvId)) return json({ erreur: 'introuvable' }, 400);
  const rdv = premiere(await base(`appointments?id=eq.${enc(rdvId)}&select=id,branch_id,data&limit=1`)) as Ligne | null;
  if (!rdv) return json({ erreur: 'introuvable' }, 404);
  return demandePourLeRdv(rdv, corps.numero, 'comptoir', { pourboireXof: corps.pourboireXof }, reglage.rappel, qui.par);
}

async function statut(req: Request, corps: any) {
  if (!(await permis(req, 'collecte-statut', 400))) return json({ erreur: 'trop' }, 429);
  const reference = String(corps.reference ?? '').toLowerCase();
  if (!RE_REFERENCE_MTN.test(reference)) return json({ erreur: 'reference' }, 400);
  let c = await laCollecte(reference);
  if (!c) return json({ erreur: 'introuvable' }, 404);
  if (pret() && aRelire(c, Date.now())) c = await relis(c);
  let honore = false;
  if (c.etat === 'recu' && c.genre === 'reglement' && c.pose_le && c.rdv_id) {
    const l = premiere(await base(`appointments?id=eq.${enc(c.rdv_id)}&select=data&limit=1`));
    honore = !!l?.data?.honoreAuReglement?.le && l?.data?.status === 'honoré';
  }
  return json({ ok: true, ...statutPourLaPage(c), ...(honore ? { honore: true } : {}) });
}

async function comptoir(req: Request, corps: any) {
  if (!(await permis(req, 'collecte-comptoir', 30))) return json({ erreur: 'trop' }, 429);
  const reglage = await leReglage();
  if (!reglage.ouverte) return json({ ok: true, ouverte: false, rdvs: [] });
  const m = msisdnDe(corps.numero);
  if (!m) return json({ erreur: 'numero' }, 400);
  const j = await leJourDuComptoir(jourDeCotonou(new Date()), m);
  return json({ ok: true, ouverte: true, rdvs: pageDuComptoir(j.trouves) });
}

const sante = () => {
  const k = cles();
  const c = leCompte();
  return {
    fonction: 'collecte-mtn', version: VERSION, pret: pret(), environnement: k.cible,
    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement, numero: !!c.numero, compte: !!c.compte },
    relais: !!(k.relais && k.relaisCle),
  };
};

async function repond(req: Request): Promise<Response> {
  jetonDuPassage = null;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ...sante(), ouverte: (await leReglage()).ouverte }); // la santé : sa version, ce qui est posé, l'interrupteur
  if (req.method !== 'POST') return json({ erreur: 'méthode' }, 405);

  const corps = await req.json().catch(() => ({})) as any;
  const action = String(corps?.action ?? '');

  /* Le passage de la base et le rappel de MTN : relire, rien d'autre. */
  if (estLePassage(req)) {
    const refs = corps?.source === 'rappel' && RE_REFERENCE_MTN.test(String(corps?.reference ?? '')) ? [String(corps.reference).toLowerCase()] : undefined;
    if (corps?.source === 'rappel' && !refs) return json({ passage: { relues: 0 } });
    return json({ passage: await passage(refs) });
  }

  if (action === 'sante') return json({ ...sante(), ouverte: (await leReglage()).ouverte });
  if (action === 'comptoir') return comptoir(req, corps);
  if (action === 'demander') return demander(req, corps);
  if (action === 'demander-trone') return demanderDuTrone(req, corps);
  if (action === 'statut') return statut(req, corps);

  if (['solde', 'essai', 'essai-paiement', 'interrupteur', 'relire'].includes(action)) {
    const qui = await direction(req);
    if (!qui) return json({ erreur: 'Seule la direction lit le compte de collecte.' }, 403);
    const le = new Date().toISOString();

    if (action === 'interrupteur') {
      const ouvrir = corps.ouvrir === true;
      if (ouvrir) {
        const essais = await base('collectes_mtn?select=genre,etat&genre=eq.essai&etat=eq.recu&limit=1');
        if (!peutOuvrirLaCollecte((Array.isArray(essais.corps) ? essais.corps : []) as CollecteMtn[])) {
          return json({ erreur: 'Faites d’abord l’essai de 100 F : le règlement par MTN ne s’ouvre qu’après un essai reçu par MTN.' }, 409);
        }
      }
      const patch: Record<string, unknown> = { ouverte: ouvrir, change_par: qui.par, change_le: le, updated_at: le };
      if (typeof corps.rappel === 'boolean') patch.rappel = corps.rappel;
      const r = await base('collecte_mtn_reglage?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      const l = premiere(r);
      if (!l) return json({ erreur: 'Le réglage n’a pas pu s’écrire (la migration 0200 est-elle passée ?).' }, 503);
      console.log('[collecte-mtn] interrupteur', { par: qui.par, ouverte: l.ouverte === true });
      return json({ ouverte: l.ouverte === true, rappel: l.rappel !== false });
    }

    if (!pret()) return json({ ...sante(), le, ...leCompte(), soldeXof: null, souci: souciDuCompte({ pret: false }) }, 503);

    if (action === 'solde') {
      const [s, reglage] = await Promise.all([leSolde(), leReglage()]);
      return json({
        le, ...leCompte(), soldeXof: s.soldeXof, devise: s.devise,
        souci: souciDuCompte({ pret: true, jetonHttp: s.jetonHttp, soldeHttp: s.soldeHttp }),
        reglement: { ouverte: reglage.ouverte, rappel: reglage.rappel, lu: reglage.lu },
      });
    }

    if (action === 'relire') return json({ passage: await passage() });

    if (action === 'essai-paiement') {
      /* L'ESSAI DE 100 F, depuis le numéro de la direction : interrupteur
         fermé ou non, c'est lui qui permet de l'ouvrir. */
      const c = demandeDEssai({ reference: crypto.randomUUID(), msisdn: corps.numero, montantXof: corps.montantXof, par: qui.par });
      if (typeof c === 'string') return json({ erreur: c === 'numero' ? 'Ce numéro ne se lit pas : dix chiffres, commençant par 01.' : 'Le montant d’un essai va de 1 à 500 F.' }, 400);
      const ins = await base('collectes_mtn', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(c) });
      if (!ins.ok) return json({ erreur: 'Le registre n’a pas pu s’écrire (la migration 0200 est-elle passée ?).' }, 503);
      const reglage = await leReglage();
      const apres = await demandeAMtn(c, reglage.lu ? reglage.rappel : true);
      console.log('[collecte-mtn] essai-paiement', { par: qui.par, montant: c.montant_xof, etat: apres.etat });
      return json({ reference: c.reference, ...statutPourLaPage(apres) });
    }

    /* L'ESSAI SANS ARGENT : le jeton, le solde, et un numéro vérifié chez
       MTN (actif, nom du titulaire). Rien n'est demandé à personne. */
    const s = await leSolde();
    const msisdn = msisdnDe(corps.numero);
    let verifie: { dit: string; mtn: boolean; actif: boolean | null; nom: string | null } | null = null;
    if (msisdn && s.jetonHttp === 200) {
      const a = await mtnAuth(`/collection/v1_0/accountholder/msisdn/${msisdn}/active`);
      const b = await mtnAuth(`/collection/v1_0/accountholder/msisdn/${msisdn}/basicuserinfo`);
      verifie = {
        dit: numeroDitMtn(msisdn), mtn: estUnNumeroMtn(msisdn),
        actif: a.http === 200 ? a.corps?.result === true || a.corps?.result === 'true' : null,
        nom: b.http === 200 ? nomDeMtnCollecte(b.corps) : null,
      };
    }
    console.log('[collecte-mtn] essai', { par: qui.par, jeton: s.jetonHttp, solde: s.soldeHttp, numero: !!verifie });
    return json({
      le, ...leCompte(),
      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp },
      solde: { xof: s.soldeXof, devise: s.devise, http: s.soldeHttp },
      verifie, ...(corps.numero && !msisdn ? { numeroIllisible: true } : {}),
      souci: souciDuCompte({ pret: true, jetonHttp: s.jetonHttp, soldeHttp: s.soldeHttp }),
    });
  }

  return json({ erreur: 'action inconnue' }, 400);
}

/* Une panne imprévue répond en clair, sans rien de ce que la Maison sait. */
Deno.serve(async (req) => {
  try {
    return await repond(req);
  } catch (e) {
    console.error('[collecte-mtn] panne', String((e as Error)?.message ?? e).slice(0, 160));
    return json({ erreur: 'serveur' }, 500);
  }
});
