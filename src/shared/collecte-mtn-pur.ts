/* ══ RÉGLER PAR MTN, LE COMPTE DE COLLECTE · 11 novembre 2026 ═══════════
   Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), « construis »
   de Yéman le 11 novembre 2026 au soir, sur les quatre propositions :
   · un QR fixe au comptoir, qui ouvre la page où la cliente tape son numéro
     MTN et retrouve SON rendez-vous du jour ; et « Payer par MTN » sur le
     lien personnel de chaque rendez-vous (regler.html) ;
   · la Maison garde les 1,2 % de MTN : la cliente paie le juste reste,
     aucun frais ajouté ; les frais vont en frais de la Maison ;
   · MTN d'abord pour un numéro MTN ; KkiaPay pour Moov, Celtiis et la carte ;
   · un merci libre pour l'équipe sur la même demande, partagé selon les parts.

   Le serveur, c'est la fonction `collecte-mtn` : elle seule parle à MTN
   (Collection), PAR LE RELAIS de la Maison, comme `paie-mtn`. Le compte de
   collecte n'est PAS le compte de paie : ses clés sont les siennes
   (MOMO_PROD_COLLECTION_*), et son numéro ne s'écrit jamais dans ce dépôt,
   qui est public : il se lit au serveur (MOMO_PROD_COLLECTION_NUMERO).

   Ce fichier est PUR. La fonction en porte une copie, caractère pour
   caractère, entre ses repères (scripts/collecte-copie-serveur.mjs la
   réécrit, le banc verifie-collecte-mtn la compare), avec les règles qu'il
   emprunte, recopiées elles aussi : la pièce et le versement de
   regler-la-seance-pur.ts, l'honneur au règlement de terminer-et-regler-pur.ts,
   le prénom d'usage de civilite.ts. */
import {
  heureDeCotonou, jourDeCotonou, rdvRegle, resteDeLaPiece,
  type PieceLue, type RdvLu, type ReglementEnLigne, type VersementLu,
} from './regler-la-seance-pur';
import { honneurAuReglement } from './terminer-et-regler-pur';
import { prenomDUsage } from './civilite';

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

export type {
  FicheDeMtn, EtatDeLaCollecte, GenreDeCollecte, OrigineDeCollecte, CollecteMtn, TraceMtn, RdvDuComptoir, TrouveAuComptoir,
};
export {
  RE_MSISDN_DU_BENIN, PREFIXES_MTN_DU_BENIN, msisdnDe, estUnNumeroMtn, numeroDitMtn, numeroMasque,
  nomDeMtnCollecte, soldeDeMtnCollecte, souciDuCompte, ilYaDit,
  TAUX_DES_FRAIS_MTN, CAISSE_MTN_COLLECTION, MOYEN_MTN_DIT, PREFIXE_DU_VERSEMENT_MTN, MONTANT_ESSAI_MTN, MONTANT_ESSAI_MTN_MAX,
  POURBOIRE_MTN_MAX, MONTANT_MTN_MAX, DEMANDE_EN_COURS_MS, DEMANDE_EN_VOL_MS, RELECTURE_MIN_MS, MAX_TENTATIVES_MTN, RE_REFERENCE_MTN,
  ETATS_VIVANTS, estVivante, fraisDeMtn, pourboireLu, demandeDeReglement, demandeDEssai, issueDeLaDemande, issueDuStatut,
  aRelire, demandeEnCours, partageConfirme, idDuVersementMtn, versementMtn, traceMtn, pieceRegleeParMtn, rdvApresMtn,
  depenseDesFraisMtn, caisseMtnNeuve, statutPourLaPage, raisonDiteALaCliente, ETAT_DE_LA_COLLECTE_DIT,
  cleDuNumeroMtn, prenomEtInitiale, rdvsDuNumero, pageDuComptoir, peutOuvrirLaCollecte, jourDeLaCollecte,
  reglementsMtnDuJour, estUneTraceMtn,
};
