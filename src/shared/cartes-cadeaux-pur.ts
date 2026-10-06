import type { CreditMovement } from './finance';

/* ══ LA CARTE CADEAU — 2 octobre 2026 ════════════════════════════════════
   « Sur le site j'aimerais brancher KkiaPay pour offrir les cartes cadeaux »
   (Yéman). Maquette « La carte cadeau en ligne » validée (« construis »), avec
   ses quatre arbitrages :
     - seul le MONTANT LIBRE se règle en ligne ; un geste se commande, et la
       Maison le règle avec l'acheteur (le site n'écrit aucun prix) ;
     - deux portes : « Régler maintenant », ou « je règle à la Maison » ;
     - la carte et son code à l'écran tout de suite, et la Maison l'envoie
       aussi sur WhatsApp ;
     - un code, qui à la première visite devient l'AVOIR de la bénéficiaire.

   CE FICHIER EST PUR : le site, le Trône et les harnais le lisent. Il
   n'importe aucun magasin (le type de `finance` s'efface à la construction).

   L'ARGENT N'EST COMPTÉ QU'UNE FOIS. Le jour du paiement, la carte devient
   un DÉPÔT D'AVOIR que porte la carte elle-même (`holderType: 'carte'`), dans
   la caisse qui a reçu l'argent (KkiaPay, ou celle de la Maison) : il entre
   dans le tiroir ce jour-là, comme tout avoir versé. À la première visite, ce
   MÊME dépôt change de porteur, de la carte à la fiche de la bénéficiaire :
   même montant, même date, même caisse. Rien n'est encaissé deux fois, et
   la caisse comme le rendez-vous savent déjà dépenser un avoir. */

export const TABLE_CARTES = 'cartes_cadeaux';

/** Les bornes du montant libre réglé en ligne. La base les tient aussi
    (migration 0112) : un dépôt hors bornes est refusé, quoi qu'envoie le
    navigateur. Au-delà, la Maison prépare la carte à la main. */
export const MONTANT_MIN_XOF = 5000;
export const MONTANT_MAX_XOF = 500000;

/** Une carte vaut un an à compter du jour où elle est réglée. */
export const VALIDITE_MOIS = 12;

/** L'ALPHABET DU CODE : ni 0, O, 1, I ni L, qu'on confond en les lisant au
    comptoir. 31 signes, huit tirés : 850 milliards de codes. Recopié à
    l'identique dans `kkiapay-verify` et `kkiapay-webhook` (une fonction Edge
    ne peut rien importer d'ici) ; le harnais compare les copies. */
export const ALPHABET_DU_CODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export type ModeleDeCarte = 'medaillon' | 'allover' | 'ivoire';
export type StatutDeCarte = 'a-regler' | 'reglee' | 'rattachee' | 'annulee';

export type CarteCadeau = {
  id: string;
  branchId: string;
  creeLe: string;
  /** Par où elle est née : le site pour payer en ligne, le site pour régler
      à la Maison, ou le Trône. */
  origine: 'en-ligne' | 'maison' | 'trone';
  objet: 'montant' | 'geste';
  /** Écrit à la création pour un montant (c'est LUI que le serveur relit
      pour contrôler le paiement) ; posé par la Maison à l'encaissement d'un
      geste. */
  montantXof?: number;
  geste?: string;
  modele: ModeleDeCarte;
  pour: string;
  de: string;
  mot?: string;
  remise: 'numerique' | 'imprimee';
  /** Le numéro de l'ACHETEUR, celui à qui la Maison écrit. */
  telephone: string;
  statut: StatutDeCarte;
  /** Né au règlement, jamais avant : une commande à régler n'a pas de code. */
  code?: string;
  valableJusquau?: string;
  payeLe?: string;
  transactionId?: string;
  /** La caisse qui a reçu l'argent, et le moyen. */
  cashbox?: string;
  methode?: string;
  /** Le dépôt d'avoir que porte la carte, puis la bénéficiaire. */
  creditId?: string;
  /** Remise à l'acheteur (envoyée ou retirée), à la main au Trône. */
  remiseLe?: string;
  clientId?: string;
  rattacheeLe?: string;
  rattacheePar?: string;
  annuleeLe?: string;
  motif?: string;
  /** Les codes qu'elle a portés avant d'être remplacée (carte perdue). */
  anciensCodes?: string[];
};

/** Tire un code MND-XXXX-XXXX. `alea` rend huit entiers (crypto au Trône,
    au serveur ; fixe dans les harnais). */
export function genereCode(alea: (n: number) => number[]): string {
  const t = alea(8).map((x) => ALPHABET_DU_CODE[Math.abs(Math.trunc(x)) % ALPHABET_DU_CODE.length]).join('');
  return `MND-${t.slice(0, 4)}-${t.slice(4)}`;
}

/** Le hasard du navigateur, pour `genereCode`. */
export const aleaDuNavigateur = (n: number): number[] => Array.from(crypto.getRandomValues(new Uint32Array(n)));

/** Le code tel qu'on le tape au comptoir (minuscules, espaces, sans tirets,
    avec ou sans « MND ») ramené à sa forme écrite, ou `null` s'il ne peut
    pas en être un. On ne devine pas une lettre à la place du comptoir. */
export function normaliseCode(saisi: string): string | null {
  const brut = saisi.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MND(?=.{8}$)/, '');
  if (brut.length !== 8) return null;
  if ([...brut].some((c) => !ALPHABET_DU_CODE.includes(c))) return null;
  return `MND-${brut.slice(0, 4)}-${brut.slice(4)}`;
}

/** Les chiffres d'un montant tapé, ou 0. */
export const montantTape = (s: string): number => Number(String(s).replace(/\D/g, '')) || 0;

/** Pourquoi ce montant ne se règle pas en ligne, en une phrase, ou `null`. */
export function montantRefuse(xof: number): string | null {
  if (!Number.isFinite(xof) || xof <= 0) return 'Écrivez le montant que vous offrez.';
  if (xof < MONTANT_MIN_XOF) return `En ligne, une carte commence à ${MONTANT_MIN_XOF.toLocaleString('fr-FR')} F CFA. Pour moins, commandez-la : la Maison la prépare avec vous.`;
  if (xof > MONTANT_MAX_XOF) return `En ligne, une carte va jusqu’à ${MONTANT_MAX_XOF.toLocaleString('fr-FR')} F CFA. Au-delà, commandez-la : la Maison la prépare avec vous.`;
  return null;
}

/** La date de fin de validité (AAAA-MM-JJ) d'une carte réglée ce jour-là. */
export function valableJusquau(payeLeISO: string): string {
  const d = new Date(payeLeISO);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + VALIDITE_MOIS, d.getUTCDate()));
  return fin.toISOString().slice(0, 10);
}

export const estEchue = (c: Pick<CarteCadeau, 'valableJusquau'>, aujourdhui: string): boolean =>
  !!c.valableJusquau && c.valableJusquau < aujourdhui.slice(0, 10);

/** L'ÉTAT LISIBLE D'UNE CARTE, celui que le registre affiche. Une carte
    réglée attend d'abord d'être remise (envoyée ou retirée), puis la visite
    de la bénéficiaire. */
export type EtatDeCarte = 'a-regler' | 'a-envoyer' | 'a-remettre' | 'attend-sa-visite' | 'sur-sa-fiche' | 'echue' | 'annulee';

export function etatDeLaCarte(c: CarteCadeau, aujourdhui: string): EtatDeCarte {
  if (c.statut === 'annulee') return 'annulee';
  if (c.statut === 'a-regler') return 'a-regler';
  if (c.statut === 'rattachee') return 'sur-sa-fiche';
  if (estEchue(c, aujourdhui)) return 'echue';
  if (!c.remiseLe) return c.remise === 'imprimee' ? 'a-remettre' : 'a-envoyer';
  return 'attend-sa-visite';
}

export const ETAT_DIT: Record<EtatDeCarte, string> = {
  'a-regler': 'À régler',
  'a-envoyer': 'À envoyer',
  'a-remettre': 'À remettre',
  'attend-sa-visite': 'Attend sa visite',
  'sur-sa-fiche': 'Sur sa fiche',
  echue: 'Échue',
  annulee: 'Annulée',
};

/** Ce que la carte offre, en mots : « 25 000 F CFA à la Maison », ou le geste. */
export function objetDeLaCarte(c: Pick<CarteCadeau, 'objet' | 'montantXof' | 'geste'>): string {
  if (c.objet === 'geste' && c.geste) return c.geste;
  return c.montantXof ? `${c.montantXof.toLocaleString('fr-FR')} F CFA à la Maison` : 'Un montant à la Maison';
}

/** LE DÉPÔT D'AVOIR D'UNE CARTE RÉGLÉE, que porte la carte jusqu'à la
    visite. Son identifiant se déduit de la carte : rejouer le règlement (le
    serveur, puis son filet) ne peut pas créer deux dépôts. */
export const idDuCredit = (carteId: string): string => `cre-${carteId}`;

export function creditDeLaCarte(c: CarteCadeau, o: { montantXof: number; cashbox: string; methode: string; date: string; code: string }): CreditMovement {
  return {
    id: idDuCredit(c.id),
    branchId: c.branchId,
    holderType: 'carte',
    holderId: c.id,
    kind: 'depot',
    amountXof: o.montantXof,
    date: o.date,
    cashbox: o.cashbox,
    method: o.methode,
    note: `Carte cadeau ${o.code} · pour ${c.pour || '?'}, de la part de ${c.de || '?'}`,
  };
}

/** Pourquoi cette carte ne peut pas être rattachée aujourd'hui, ou `null`. */
export function pourquoiOnNeRattachePas(c: CarteCadeau | undefined, aujourdhui: string): string | null {
  if (!c) return 'Aucune carte ne porte ce code.';
  if (c.statut === 'annulee') return 'Cette carte a été annulée.';
  if (c.statut === 'a-regler') return 'Cette carte n’est pas encore réglée.';
  if (c.statut === 'rattachee') return 'Cette carte est déjà sur la fiche de sa bénéficiaire : son solde s’y dépense.';
  if (estEchue(c, aujourdhui)) return `Cette carte était valable jusqu’au ${c.valableJusquau}. La direction peut la prolonger.`;
  if (!c.creditId) return 'Cette carte n’a pas d’avoir enregistré : voyez la direction.';
  return null;
}

/** LE RATTACHEMENT : le dépôt de la carte passe à la fiche (ou au compte
    famille) qui paie. Seul le porteur change : montant, date, caisse et
    moyen restent ceux du jour du paiement, c'est ce qui empêche de compter
    l'argent deux fois. */
export function rattacheLeCredit(m: CreditMovement, porteur: { type: 'family' | 'client'; id: string }): CreditMovement {
  return { ...m, holderType: porteur.type, holderId: porteur.id };
}

/** Retrouve une carte par son code saisi (ou un ancien code remplacé, pour
    dire qu'il ne vaut plus). */
export function carteParCode(cartes: readonly CarteCadeau[], saisi: string): { carte?: CarteCadeau; ancien?: boolean } {
  const code = normaliseCode(saisi);
  if (!code) return {};
  const c = cartes.find((x) => x.code === code);
  if (c) return { carte: c };
  const a = cartes.find((x) => (x.anciensCodes ?? []).includes(code));
  return a ? { carte: a, ancien: true } : {};
}

/** Le mot que la Maison envoie à l'acheteur, prêt dans le fil WhatsApp. */
export function messageDeLaCarte(c: CarteCadeau, appel: string): string {
  const fin = c.valableJusquau
    ? new Date(`${c.valableJusquau}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  return [
    `Bonjour ${appel},`,
    `voici la carte cadeau pour ${c.pour || 'votre proche'} : ${objetDeLaCarte(c)}.`,
    `Son code : ${c.code ?? ''}${fin ? `, valable jusqu’au ${fin}` : ''}.`,
    c.remise === 'imprimee'
      ? 'La carte imprimée vous attend à la Maison.'
      : 'Il suffit de présenter ce code à la Maison : la carte se dépense en une ou plusieurs fois.',
  ].join('\n');
}

/** LA COMMANDE DÉPOSÉE PAR LE SITE. Le statut, l'absence de code et les
    bornes sont aussi tenus par la base (0112) : le site ne peut rien
    déposer d'autre qu'une commande à régler. */
export function commandeDuSite(o: {
  id: string; branchId: string; maintenant: string; origine: 'en-ligne' | 'maison';
  objet: 'montant' | 'geste'; montantXof?: number; geste?: string; modele: ModeleDeCarte;
  pour: string; de: string; mot?: string; remise: 'numerique' | 'imprimee'; telephone: string;
}): CarteCadeau {
  return {
    id: o.id,
    branchId: o.branchId,
    creeLe: o.maintenant,
    origine: o.origine,
    objet: o.objet,
    ...(o.objet === 'montant' && o.montantXof ? { montantXof: Math.round(o.montantXof) } : {}),
    ...(o.objet === 'geste' && o.geste ? { geste: o.geste } : {}),
    modele: o.modele,
    pour: o.pour.trim(),
    de: o.de.trim(),
    ...(o.mot?.trim() ? { mot: o.mot.trim().slice(0, 120) } : {}),
    remise: o.remise,
    telephone: o.telephone.trim(),
    statut: 'a-regler',
  };
}

/** Un identifiant de carte : `cc-` puis douze signes tirés. Le préfixe dit
    au filet KkiaPay que la référence est une carte. */
export const nouvelIdDeCarte = (alea: (n: number) => number[] = aleaDuNavigateur): string =>
  `cc-${alea(12).map((x) => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.abs(Math.trunc(x)) % 32]).join('')}`;
