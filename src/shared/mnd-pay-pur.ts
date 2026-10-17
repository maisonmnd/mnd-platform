/* ══ MND PAY, LES RÈGLES — 16 octobre 2026 ══════════════════════════════
   Maquette UigU1Rr5… validée (« construis »). Une seule caisse, et le
   paiement qui se confirme tout seul : la caissière DEMANDE, la cliente
   valide sur son propre téléphone, FedaPay CONFIRME, le Trône le voit.

   Ses choix, lus en base le 16 octobre (maquette/mnd-pay) :
     · FedaPay au comptoir ; KkiaPay garde le site et Ma Couronne ;
     · les frais sont AJOUTÉS au montant de la cliente ;
     · pourboire en montant libre ;
     · la carte par un QR au comptoir (aucun terminal relié au Bénin) ;
     · le reçu part seul sur son WhatsApp ;
     · Vente & Caisse encaisse, la direction seule rembourse ;
     · Zelle se note à la main (comptes américains, dollars, rien à brancher).

   Tout ce qui se calcule vit ici, sans magasin ni React :
   `scripts/verifie-mnd-pay` le rejoue. Le serveur (`mnd-pay`,
   `mnd-pay-webhook`) seul écrit les demandes ; le Trône les LIT, et c'est lui
   qui inscrit le règlement sur la pièce, comme il le fait pour tout argent. */

import type { Invoice, InvoicePayment } from './finance';

/** La caisse où dort l'argent reçu par MND PAY, jusqu'au reversement de
    FedaPay sur le compte de la Maison : ce n'est pas le tiroir. */
export const CAISSE_MND_PAY = 'MND PAY';
/** La caisse de Zelle : un compte aux États-Unis, en dollars. */
export const CAISSE_ZELLE = 'Zelle';
export const MOYEN_ZELLE = 'Zelle';

/** Ce que la caissière choisit. `au_choix` : la page de paiement de FedaPay,
    où la cliente prend mobile money ou carte (le lien envoyé à distance). */
export type MoyenMndPay = 'mtn' | 'moov' | 'celtiis' | 'carte' | 'au_choix' | 'tapgo';
export const MOYENS_AU_TELEPHONE: readonly MoyenMndPay[] = ['mtn', 'moov', 'celtiis'];
export const estAuTelephone = (m: MoyenMndPay): boolean => MOYENS_AU_TELEPHONE.includes(m);

export type StatutMndPay = 'en_attente' | 'payee' | 'refusee' | 'annulee' | 'expiree';

export type DemandeMndPay = {
  id: string;
  branchId: string;
  /** Au comptoir, la pièce n'existe pas encore (le ticket se finit quand
      l'argent est là) ; à distance, elle existe et le lien la règle. */
  genre: 'comptoir' | 'lien';
  moyen: MoyenMndPay;
  /** Ce qui règle la pièce : le reste dû, ou la part choisie. */
  montantXof: number;
  /** Le pourboire, pour l'équipe : jamais dans la pièce. */
  pourboireXof?: number;
  /** Les frais du prestataire, ajoutés pour la cliente (sa décision). */
  fraisXof: number;
  /** Ce que FedaPay demande : montant + pourboire + frais. */
  totalXof: number;
  /** La pièce réglée (comptoir : l'identifiant réservé pour le ticket). */
  pieceId: string;
  pieceNumero?: string;
  clientId?: string;
  telephone?: string;
  libelle: string;
  statut: StatutMndPay;
  fedapayId?: number;
  reference?: string;
  /** La page de paiement (QR au comptoir, lien à distance). */
  url?: string;
  /** Le mode que la cliente a réellement pris (mtn_open, moov, card…). */
  modeReel?: string;
  /** La commission que FedaPay retient, quand elle la dit. */
  commissionXof?: number;
  creeLe: string;
  creePar?: string;
  payeeLe?: string;
  raison?: string;
};

export type ReglagesMndPay = {
  /** MND PAY s'allume ici, une fois le compte FedaPay ouvert et les clés posées. */
  actif?: boolean;
  /** Les frais ajoutés pour la cliente, en pourcentage du montant. 1,8 % est
      la grille affichée par FedaPay pour MTN et Moov au Bénin (16 octobre 2026). */
  tauxMobilePct?: number;
  /** Le taux de la carte, à recopier de son contrat FedaPay. */
  tauxCartePct?: number;
  /** Les codes de FedaPay pour la demande directe (à corriger si le premier
      essai dit autre chose : la documentation n'est pas d'accord avec elle-même). */
  modes?: Partial<Record<'mtn' | 'moov' | 'celtiis', string>>;
  /** Zelle, noté à la main : le compte américain qui le reçoit. */
  zelle?: { actif?: boolean; adresse?: string; titulaire?: string };
  /** TAP & GO (17 octobre 2026) : le code USSD de la Maison chez FedaPay.
      Allumé par défaut avec MND PAY ; `code` est le code marchand à cinq
      chiffres de la page Tap & Go, `tauxPct` sa commission. */
  tapgo?: { actif?: boolean; code?: string; tauxPct?: number };
};

export const TAUX_MOBILE_DEFAUT = 1.8;
/* ══ TAP & GO — 17 octobre 2026 ═════════════════════════════════════════
   « Intègre Tap and Go de FedaPay » (Yéman, captures de sa page Tap & Go).
   Le terminal virtuel de FedaPay : la cliente compose elle-même
   *601*14*<code de la Maison>*<montant># sur son téléphone, n'importe quel
   réseau, même sans internet. Aucune transaction n'est créée par MND PAY :
   elle naît chez FedaPay quand la cliente valide.

   LE COMPTOIR L'ATTEND, LE MONTANT LA RECONNAÎT. La caissière affiche le
   code avec le montant déjà écrit dedans ; le Trône pose une attente (moyen
   `tapgo`) ; quand FedaPay annonce un paiement que MND PAY n'a pas créé, le
   serveur cherche l'attente du même montant, posée dans la demi-heure, et la
   passe « payée ». Une seule attente : c'est elle. Aucune, ou plusieurs du
   même montant : on ne devine pas, l'argent va « À rattacher », où un geste
   lui fait sa pièce. On ne perd jamais un franc reçu.

   La commission de Tap & Go est de 1,6 % sur le mobile money (FAQ FedaPay,
   17 octobre 2026) ; les frais restent ajoutés pour la cliente, sa décision
   du 16 octobre. Le code marchand est public par nature : FedaPay le fait
   imprimer sur les affiches. */
export const TAUX_TAPGO_DEFAUT = 1.6;
export const CODE_TAPGO_DEFAUT = '51166';
export const PREFIXE_USSD_TAPGO = '*601*14*';
/** Une attente vit une demi-heure : au-delà, ce n'est plus le même passage. */
export const DELAI_TAPGO_MS = 30 * 60_000;
/** Les horloges du téléphone et de FedaPay ne sont pas d'accord à la seconde. */
export const AVANCE_TAPGO_MS = 2 * 60_000;

/** LE SERVEUR SAIT-IL TAP & GO ? La tuile n'apparaît qu'une fois `mnd-pay`
    recollé (version 2026-10-17-a ou après) : avant, la demande serait refusée
    (« moyen inconnu »). Les versions se comparent comme des dates. */
export const saitTapGo = (version: string | undefined): boolean => !!version && version >= '2026-10-17-a';
/** Le code marchand posé, ou celui de la page Tap & Go de la Maison. */
export const codeTapGo = (r: ReglagesMndPay | undefined): string => {
  const c = String(r?.tapgo?.code ?? '').replace(/\D/g, '');
  return c || CODE_TAPGO_DEFAUT;
};
/* ══ LE NUMÉRO PART SUR SON WHATSAPP — 17 octobre 2026 ═════════════════
   « Quand le code USSD s'affiche, est-ce possible de l'envoyer sur le
   téléphone de la cliente instantanément ? » puis « automatique ». Dès que
   le numéro s'affiche au comptoir, un lien part sur son WhatsApp : la page
   `payer.html?tg=CODE-TOTAL` compose le numéro d'un geste (Android) ou le
   donne à copier (iPhone). Dans la fenêtre de 24 heures, un mot libre ;
   hors fenêtre, le modèle Meta `paiement_en_attente` (Utilitaire), dont le
   bouton « Composer » porte ce même paramètre. (Le premier nom,
   `paiement_a_composer`, a été rangé par Meta en Marketing, et Meta ne
   change jamais la catégorie d'un modèle : d'où ce nom neuf, 17 octobre.) Le message ne contient PAS le
   numéro : WhatsApp mettrait en gras ce qui est entre deux étoiles. Et
   jamais le mot « code » (Meta le classerait en authentification). */
export const MODELE_TAPGO = 'paiement_en_attente';
export const LIEN_TAPGO = 'https://maisonmnd.com/trone/payer.html?tg=';
/** Le paramètre du lien et du bouton : « 51166-25400 », un seul mot, que la
    fonction d'envoi accepte (lettres, chiffres, tiret). */
export const parametreTapGo = (totalXof: number, r: ReglagesMndPay | undefined): string =>
  `${codeTapGo(r)}-${Math.max(0, Math.round(Number(totalXof) || 0))}`;
/** Les deux variables du modèle : son appel, et le montant dit. */
export const variablesTapGo = (appel: string, montant: string): string[] => [appel, montant];
/** Le mot libre, dans la fenêtre de 24 heures. */
export const motTapGo = (appel: string, montant: string, lien: string): string =>
  `Bonjour ${appel}, pour régler ${montant}, touchez ce lien : votre téléphone compose le numéro, montant compris. Confirmez ensuite le paiement sur votre téléphone.\n${lien}`;

/** Tap & Go s'offre avec MND PAY, sauf s'il est éteint dans les réglages. */
export const tapGoOuvert = (r: ReglagesMndPay | undefined): boolean => r?.tapgo?.actif !== false;
/** LE CODE À COMPOSER, montant compris : c'est lui que la cliente tape. */
export function codeUssdTapGo(totalXof: number, r: ReglagesMndPay | undefined): string {
  return `${PREFIXE_USSD_TAPGO}${codeTapGo(r)}*${Math.max(0, Math.round(Number(totalXof) || 0))}#`;
}

// ── DEBUT instantDe (même texte dans supabase/functions/mnd-pay et mnd-pay-webhook)
/** UN INSTANT DE FEDAPAY EN MILLISECONDES. Ses dates portent six décimales
    (« 2026-10-17T08:12:03.000000Z ») ou un espace au lieu du T ; sans fuseau,
    c'est l'heure universelle. NaN quand rien ne se lit. */
function instantDe(s: unknown): number {
  const brut = String(s ?? '').trim();
  if (!brut) return NaN;
  let iso = brut.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += 'Z';
  return Date.parse(iso);
}
// ── FIN instantDe
export { instantDe };

// ── DEBUT rapprocheTapGo (même texte dans supabase/functions/mnd-pay et mnd-pay-webhook, relu par scripts/verifie-mnd-pay)
/** QUELLE ATTENTE CE PAIEMENT RÈGLE-T-IL ? Une attente Tap & Go, encore en
    attente, sans transaction, du même montant à un franc près, posée au plus
    une demi-heure avant le paiement (deux minutes d'avance tolérées pour les
    horloges). Une seule : c'est elle. Plusieurs : on ne choisit pas au hasard. */
function rapprocheTapGo(
  paiement: { montantXof: number; quandMs: number },
  attentes: readonly { id: string; moyen?: string; statut?: string; fedapayId?: number; totalXof?: number; creeLe?: string }[],
): { sorte: 'une'; id: string } | { sorte: 'aucune' } | { sorte: 'plusieurs'; ids: string[] } {
  const montant = Math.round(Number(paiement.montantXof) || 0);
  if (montant <= 0) return { sorte: 'aucune' };
  const ids = attentes.filter((a) => {
    if (a.moyen !== 'tapgo' || a.statut !== 'en_attente' || a.fedapayId) return false;
    if (Math.abs(Math.round(Number(a.totalXof) || 0) - montant) > 1) return false;
    const t = Date.parse(String(a.creeLe ?? ''));
    if (!Number.isFinite(t) || !Number.isFinite(paiement.quandMs)) return false;
    const ecart = paiement.quandMs - t;
    return ecart >= -2 * 60_000 && ecart <= 30 * 60_000;
  }).map((a) => a.id);
  if (ids.length === 1) return { sorte: 'une', id: ids[0] };
  return ids.length === 0 ? { sorte: 'aucune' } : { sorte: 'plusieurs', ids };
}
// ── FIN rapprocheTapGo
export { rapprocheTapGo };
export const MODES_DEFAUT: Record<'mtn' | 'moov' | 'celtiis', string> = { mtn: 'mtn_open', moov: 'moov', celtiis: 'sbin' };

const f = (x: number): number => Math.max(0, Math.round(Number.isFinite(x) ? x : 0));

/** LE TAUX DE CE MOYEN. Le lien laisse la cliente choisir sur la page de
    FedaPay : le montant s'écrit avant son choix, il prend donc le plus haut
    des deux (sinon une carte passerait au tarif du mobile money). Sans taux
    de carte posé, la carte reste au taux du mobile money et l'écran le dit. */
export function tauxDe(moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const mobile = Math.max(0, Number(r?.tauxMobilePct ?? TAUX_MOBILE_DEFAUT) || 0);
  const carte = Math.max(0, Number(r?.tauxCartePct ?? 0) || 0) || mobile;
  if (moyen === 'tapgo') {
    const t = Number(r?.tapgo?.tauxPct ?? TAUX_TAPGO_DEFAUT);
    return Number.isFinite(t) && t >= 0 ? t : TAUX_TAPGO_DEFAUT;
  }
  if (moyen === 'carte') return carte;
  if (moyen === 'au_choix') return Math.max(mobile, carte);
  return mobile;
}

/** LES FRAIS AJOUTÉS, au franc supérieur : la Maison doit recevoir au moins
    ce qu'elle demande, un arrondi vers le bas lui ferait perdre un franc par
    paiement. Zéro pour un montant nul. */
export function fraisPour(baseXof: number, moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const base = f(baseXof);
  if (base <= 0) return 0;
  const pct = tauxDe(moyen, r);
  return pct > 0 ? Math.ceil((base * pct) / 100 - 1e-9) : 0;
}

/** Ce que la cliente paie, et ce que chaque part devient. */
export function compteDeLaDemande(e: { montantXof: number; pourboireXof?: number; moyen: MoyenMndPay; reglages?: ReglagesMndPay }): {
  montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number;
} {
  const montantXof = f(e.montantXof);
  const pourboireXof = f(e.pourboireXof ?? 0);
  /* Les frais portent sur tout ce qui passe chez FedaPay, pourboire compris :
     il traverse le même tuyau, il en paie la même commission. */
  const fraisXof = fraisPour(montantXof + pourboireXof, e.moyen, e.reglages);
  return { montantXof, pourboireXof, fraisXof, totalXof: montantXof + pourboireXof + fraisXof };
}

/** Le code FedaPay de la demande directe au téléphone. */
export const modeFedaPay = (m: 'mtn' | 'moov' | 'celtiis', r: ReglagesMndPay | undefined): string =>
  (r?.modes?.[m] ?? '').trim() || MODES_DEFAUT[m];

/** LE STATUT DE FEDAPAY, DANS NOS MOTS. Les statuts « payés » sont ceux du
    SDK officiel (`Transaction::$PAID_STATUS`) : un paiement remboursé ensuite
    a bien été reçu d'abord. */
export function statutDepuisFedaPay(s: string | undefined | null): StatutMndPay {
  const v = String(s ?? '').toLowerCase();
  if (['approved', 'transferred', 'refunded', 'approved_partially_refunded', 'transferred_partially_refunded'].includes(v)) return 'payee';
  if (v === 'declined') return 'refusee';
  if (v === 'canceled' || v === 'cancelled') return 'annulee';
  if (v === 'expired') return 'expiree';
  return 'en_attente';
}

/** Une demande qui ne bougera plus. */
export const estFinie = (s: StatutMndPay): boolean => s !== 'en_attente';

/** LE MOYEN INSCRIT SUR LA PIÈCE : celui que la cliente a vraiment pris, dans
    les mots de la caisse (les tuiles du journal comptent « MTN MoMo » et
    « Moov »). Le mode réel prime sur ce qui était demandé : un lien « au
    choix » payé en Moov est un paiement Moov. */
export function moyenDeLaPiece(d: Pick<DemandeMndPay, 'moyen' | 'modeReel'>): string {
  const m = String(d.modeReel ?? '').toLowerCase();
  if (m.startsWith('mtn')) return 'MTN MoMo';
  if (m.startsWith('moov')) return 'Moov';
  if (m === 'sbin' || m.startsWith('celtiis')) return 'Celtiis';
  if (m && /card|visa|master|carte/.test(m)) return 'Carte';
  if (d.moyen === 'mtn') return 'MTN MoMo';
  if (d.moyen === 'moov') return 'Moov';
  if (d.moyen === 'celtiis') return 'Celtiis';
  if (d.moyen === 'carte') return 'Carte';
  return 'MND PAY';
}

/** LE VERSEMENT QUE LA PIÈCE REÇOIT. Son identifiant EST celui de la demande :
    deux postes qui l'inscrivent en même temps écrivent la même ligne, et une
    seconde inscription se reconnaît. Le jour est celui où FedaPay a confirmé. */
export function versementDeLaDemande(d: DemandeMndPay, encaissePar?: string): InvoicePayment {
  const quand = d.payeeLe ?? d.creeLe;
  const heure = quand.length >= 16 ? new Date(quand) : null;
  return {
    id: d.id,
    date: jourLocal(quand),
    amountXof: f(d.montantXof),
    method: moyenDeLaPiece(d),
    cashbox: CAISSE_MND_PAY,
    ...(heure && !Number.isNaN(heure.getTime())
      ? { time: `${String(heure.getHours()).padStart(2, '0')}:${String(heure.getMinutes()).padStart(2, '0')}` }
      : {}),
    note: `MND PAY${d.reference ? ` · réf. ${d.reference}` : ''}${d.fraisXof > 0 ? ` · frais ${f(d.fraisXof)} F payés par la cliente` : ''}`,
    ...(encaissePar ? { encaissePar } : {}),
  };
}

/** Le jour LOCAL d'un instant ISO (le jour de caisse, pas celui de Greenwich). */
export function jourLocal(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Les identifiants de versement déjà inscrits sur les pièces. */
export const versementsInscrits = (pieces: readonly Pick<Invoice, 'payments'>[]): Set<string> =>
  new Set(pieces.flatMap((p) => (p.payments ?? []).map((x) => x.id)));

type PieceLue = Pick<Invoice, 'id' | 'status' | 'payments' | 'payment'>;

/** LES PIÈCES QUE LES LIENS PAYÉS RÈGLENT. Une demande « lien » payée dont la
    pièce existe et ne porte pas encore son versement : on l'y inscrit, la
    pièce passe « payée » quand plus rien ne reste. Rien d'autre ne bouge. Les
    demandes du comptoir ne se rattachent pas ici : c'est le ticket qui les
    inscrit en se fermant (sinon elles iraient « À rattacher »). */
export function piecesReglees<T extends PieceLue>(
  pieces: readonly T[],
  demandes: readonly DemandeMndPay[],
  resteDe: (p: T) => number,
): { changees: T[]; inscrits: string[] } {
  const deja = versementsInscrits(pieces);
  const changees: T[] = [];
  const inscrits: string[] = [];
  const parId = new Map(pieces.map((p) => [p.id, p]));
  const touchees = new Map<string, T>();
  for (const d of demandes) {
    if (d.genre !== 'lien' || d.statut !== 'payee' || deja.has(d.id)) continue;
    const base = touchees.get(d.pieceId) ?? parId.get(d.pieceId);
    if (!base) continue;
    const v = versementDeLaDemande(d);
    const payments = [...(base.payments ?? []), v];
    const suivante = { ...base, payments } as T;
    const reste = resteDe(suivante);
    const finale = (reste <= 0 ? { ...suivante, status: 'payée', payment: base.payment ?? v.method } : suivante) as T;
    touchees.set(d.pieceId, finale);
    inscrits.push(d.id);
  }
  for (const p of touchees.values()) changees.push(p);
  return { changees, inscrits };
}

/** CE QUI ATTEND D'ÊTRE RATTACHÉ : un argent reçu par MND PAY qu'aucune pièce
    ne porte. Au comptoir, on laisse au ticket le temps de se fermer (cinq
    minutes) ; passé ce délai, le ticket a été abandonné et l'argent attend
    qu'on le range. On ne perd jamais un franc reçu. */
export const DELAI_DU_TICKET_MS = 5 * 60_000;
export function aRattacher(
  demandes: readonly DemandeMndPay[],
  pieces: readonly Pick<Invoice, 'id' | 'payments'>[],
  maintenant: number,
): DemandeMndPay[] {
  const deja = versementsInscrits(pieces);
  const ids = new Set(pieces.map((p) => p.id));
  return demandes.filter((d) => {
    if (d.statut !== 'payee' || deja.has(d.id)) return false;
    if (d.genre === 'lien') return !ids.has(d.pieceId);
    const t = Date.parse(d.payeeLe ?? d.creeLe);
    return Number.isFinite(t) ? maintenant - t > DELAI_DU_TICKET_MS : true;
  });
}

/** LE NUMÉRO POUR FEDAPAY : « +229 » et les dix chiffres du Bénin (01… depuis
    novembre 2024). Un ancien numéro à huit chiffres reçoit son « 01 ». Un
    numéro étranger complet (+33…, +1…) passe tel quel. */
export function numeroPourFedaPay(tel: string | undefined): { number: string; country: string } | null {
  const brut = String(tel ?? '').trim();
  if (!brut) return null;
  const chiffres = brut.replace(/\D/g, '');
  if (!chiffres) return null;
  let local = chiffres;
  if (brut.startsWith('+') || chiffres.startsWith('00')) {
    const sans = chiffres.replace(/^00/, '');
    if (!sans.startsWith('229')) return sans.length >= 8 ? { number: `+${sans}`, country: 'bj' } : null;
    local = sans.slice(3);
  } else if (chiffres.startsWith('229') && chiffres.length >= 11) {
    local = chiffres.slice(3);
  }
  /* Un ancien numéro (huit chiffres, sans zéro devant) reçoit son « 01 » ;
     huit chiffres qui commencent par 0 sont un numéro neuf tronqué : refusé,
     plutôt que de faire sonner le téléphone d'un inconnu. */
  if (local.length === 8 && !local.startsWith('0')) local = `01${local}`;
  if (local.length !== 10) return null;
  return { number: `+229${local}`, country: 'bj' };
}

/** Le numéro tel qu'on le montre : « 01 97 •• •• 12 ». */
export function numeroMasque(tel: string | undefined): string {
  const n = numeroPourFedaPay(tel);
  if (!n) return '';
  const l = n.number.startsWith('+229') ? n.number.slice(4) : n.number.replace(/^\+/, '');
  if (l.length !== 10) return n.number;
  return `${l.slice(0, 2)} ${l.slice(2, 4)} •• •• ${l.slice(8, 10)}`;
}

/** Ce que l'écran dit d'une demande. */
export function ditLeStatut(d: Pick<DemandeMndPay, 'statut' | 'moyen' | 'raison'>): string {
  switch (d.statut) {
    case 'payee': return 'Payé';
    case 'refusee': return d.raison ? `Refusé : ${d.raison}` : 'Refusé par l’opérateur ou la banque';
    case 'annulee': return 'Annulé';
    case 'expiree': return 'Expiré sans paiement';
    default: return estAuTelephone(d.moyen) ? 'En attente de son code…' : d.moyen === 'tapgo' ? 'Elle compose le code…' : 'En attente du paiement…';
  }
}

/** UN TICKET RÉGLÉ EN PLUSIEURS FOIS (sa décision : plusieurs moyens par
    ticket). Ce que la caisse a déjà reçu sur ce ticket, et ce qui reste. */
export type ReglementDuTicket = {
  id: string;
  methode: string;
  montantXof: number;
  caisse?: string;
  /** Une part MND PAY : confirmée par le prestataire, elle ne s'efface pas. */
  mndPayId?: string;
  note?: string;
  fx?: { code: string; rate: number; amount: number };
};
export function resteDuTicket(aPayerXof: number, reglements: readonly ReglementDuTicket[]): number {
  return Math.max(0, f(aPayerXof) - reglements.reduce((n, r) => n + f(r.montantXof), 0));
}

/** LES VERSEMENTS DES PARTS DÉJÀ REÇUES, dans la forme de la pièce. Une part
    MND PAY garde l'identifiant de sa demande (c'est ce qui la rattache). */
export function versementsDesParts(
  parts: readonly ReglementDuTicket[],
  v: { date: string; time?: string; encaissePar?: string; demandes: readonly DemandeMndPay[] },
): InvoicePayment[] {
  return parts.filter((p) => f(p.montantXof) > 0).map((p) => {
    if (p.mndPayId) {
      const d = v.demandes.find((x) => x.id === p.mndPayId);
      if (d) return { ...versementDeLaDemande(d, v.encaissePar), amountXof: f(p.montantXof) };
    }
    return {
      id: p.id, date: v.date, amountXof: f(p.montantXof), method: p.methode,
      ...(p.caisse ? { cashbox: p.caisse } : {}),
      ...(v.time ? { time: v.time } : {}),
      ...(v.encaissePar ? { encaissePar: v.encaissePar } : {}),
      ...(p.note ? { note: p.note } : {}),
      ...(p.fx ? { fx: p.fx } : {}),
    };
  });
}
