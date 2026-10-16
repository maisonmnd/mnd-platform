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
export type MoyenMndPay = 'mtn' | 'moov' | 'celtiis' | 'carte' | 'au_choix';
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
};

export const TAUX_MOBILE_DEFAUT = 1.8;
export const MODES_DEFAUT: Record<'mtn' | 'moov' | 'celtiis', string> = { mtn: 'mtn_open', moov: 'moov', celtiis: 'sbin' };

const f = (x: number): number => Math.max(0, Math.round(Number.isFinite(x) ? x : 0));

/** LE TAUX DE CE MOYEN. Le lien laisse la cliente choisir sur la page de
    FedaPay : le montant s'écrit avant son choix, il prend donc le plus haut
    des deux (sinon une carte passerait au tarif du mobile money). Sans taux
    de carte posé, la carte reste au taux du mobile money et l'écran le dit. */
export function tauxDe(moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const mobile = Math.max(0, Number(r?.tauxMobilePct ?? TAUX_MOBILE_DEFAUT) || 0);
  const carte = Math.max(0, Number(r?.tauxCartePct ?? 0) || 0) || mobile;
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
    default: return estAuTelephone(d.moyen) ? 'En attente de son code…' : 'En attente du paiement…';
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
