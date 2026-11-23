/* LA FENÊTRE DE PAIEMENT KKIAPAY, SEULE — 2 octobre 2026.

   Sortie de `kkiapay.ts` pour la carte cadeau du site : une page publique
   n'emporte pas les magasins de l'ERP (`finance`, la synchronisation) pour
   ouvrir un paiement. Ce module ne dépend de RIEN. `kkiapay.ts` le
   réexporte : Ma Couronne, l'Académie et la Consultation n'ont pas bougé.

   La règle d'or reste la même : le retour du widget NE PROUVE RIEN, seule
   la fonction Edge `kkiapay-verify` dit qu'un paiement est reçu. */

export const PUBLIC_KEY = ((import.meta.env.VITE_KKIAPAY_PUBLIC_KEY as string | undefined) ?? '').trim();
export const SANDBOX = (import.meta.env.VITE_KKIAPAY_SANDBOX as string | undefined) === 'true';

const SCRIPT_URL = 'https://cdn.kkiapay.me/k.js';

/* ══ QUAND KKIAPAY NE PEUT PAS S'OUVRIR — 12 novembre 2026 ═══════════════
   Le choix du moyen, lot C : sur la page « Régler », FedaPay prend le relais
   quand KkiaPay est EN PANNE : pas de clé publique, son script injoignable,
   le widget absent ou qui lève, ou un échec sans motif de la cliente. Jamais
   quand elle annule, ni quand l'opérateur refuse (solde, numéro, fraude), ni
   hors ligne : FedaPay n'y ferait rien de mieux. L'erreur le porte
   (`panne`) ; son message reste celui d'avant. */
export class PanneDeKkiapay extends Error {
  readonly panne = true as const;
}
/** L'échec vient-il de KkiaPay lui-même (et non d'elle ou de son opérateur) ? */
export const estUnePanneDeKkiapay = (e: unknown): boolean =>
  e instanceof PanneDeKkiapay || (!!e && typeof e === 'object' && (e as { panne?: unknown }).panne === true);
/** KkiaPay peut-il seulement s'ouvrir ici ? (sa clé publique est posée au build) */
export const kkiapayPeutSOuvrir = (): boolean => PUBLIC_KEY !== '';

/* ══ LA FENÊTRE REFERMÉE SANS PAYER — 23 novembre 2026 ═══════════════════
   « Quand on choisit un mode de paiement, exemple carte, on ne peut plus
   revenir en arrière et modifier. C'est toujours paiement en cours » (Yéman,
   pendant l'essai du Sceau). La promesse ne se résolvait QUE sur un paiement
   abouti : refermer la fenêtre la laissait en attente pour toujours, et la
   page « Régler », qui fige ses moyens pendant un paiement, restait figée.

   KkiaPay DIT qu'on referme sa fenêtre (`addKkiapayCloseListener`). Une page
   qui le demande (`rendLaMainALaFermeture`) voit alors sa promesse se
   REJETER d'une `FenetreFermee` : ni une panne, ni un refus, elle a
   seulement renoncé. Les autres pages gardent leur attente d'avant, avec
   leur propre porte de sortie. */
export class FenetreFermee extends Error {
  readonly fermee = true as const;
}
/** A-t-elle seulement refermé la fenêtre (ou renoncé depuis la page) ? */
export const estUneFenetreFermee = (e: unknown): boolean =>
  e instanceof FenetreFermee || (!!e && typeof e === 'object' && (e as { fermee?: unknown }).fermee === true);
const PAIEMENT_ANNULE = 'Paiement annulé.';

type SuccessResponse = { transactionId?: string } | string;
type KkiapayWindow = Window & {
  openKkiapayWidget?: (opts: Record<string, unknown>) => void;
  closeKkiapayWidget?: () => void;
  addSuccessListener?: (cb: (r: SuccessResponse) => void) => void;
  addFailedListener?: (cb: (r: unknown) => void) => void;
  addKkiapayCloseListener?: (cb: () => void) => void;
};

let scriptPromise: Promise<void> | null = null;

/** Charge le widget une seule fois, à la demande — jamais au démarrage : une
    cliente qui ne réserve pas n'a pas à payer le poids d'un script de paiement. */
function loadWidget(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const w = window as KkiapayWindow;
    if (w.openKkiapayWidget) { resolve(); return; }
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.onload = () => { wireListeners(); resolve(); };
    el.onerror = () => { scriptPromise = null; reject(new PanneDeKkiapay('Le service de paiement est injoignable.')); };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/* Les écouteurs de KkiaPay sont GLOBAUX : en enregistrer un par paiement les
   empilerait et rejouerait les anciens. On en pose donc un seul, qui aiguille
   vers le paiement en cours. */
let pending: { resolve: (r: { transactionId: string }) => void; reject: (e: Error) => void; rendLaMain: boolean } | null = null;
let wired = false;

function wireListeners(): void {
  if (wired) return;
  const w = window as KkiapayWindow;
  w.addSuccessListener?.((r) => {
    const id = typeof r === 'string' ? r : r?.transactionId;
    const p = pending;
    pending = null;
    if (!p) return;
    if (id) p.resolve({ transactionId: String(id) });
    else p.reject(new Error('Paiement sans référence, contactez la Maison.'));
  });
  w.addFailedListener?.((r) => {
    const p = pending;
    pending = null;
    const message = failureMessage(r);
    /* Un échec que rien ne nomme (ni elle, ni son opérateur) est une panne de KkiaPay. */
    p?.reject(message === ECHEC_SANS_MOTIF ? new PanneDeKkiapay(message) : new Error(message));
  });
  /* Elle referme la fenêtre : la page qui l'a demandé reprend la main. Après
     un paiement abouti il n'y a plus rien en attente, et rien ne se passe. */
  w.addKkiapayCloseListener?.(() => {
    const p = pending;
    if (!p || !p.rendLaMain) return;
    pending = null;
    p.reject(new FenetreFermee(PAIEMENT_ANNULE));
  });
  wired = true;
}

/** ELLE RENONCE DEPUIS LA PAGE (« Changer de moyen ») : la fenêtre se ferme
    si elle est là, et le paiement en attente rend la main, même si la
    fenêtre ne s'est jamais montrée. */
export function abandonneLePaiementKkiapay(): void {
  const p = pending;
  pending = null;
  try { (window as KkiapayWindow).closeKkiapayWidget?.(); } catch { /* elle n'était pas ouverte */ }
  p?.reject(new FenetreFermee(PAIEMENT_ANNULE));
}

/* Codes relevés sur le banc d'essai (le motif arrive dans `reason.message`) —
   traduits pour la cliente, qui n'a pas à lire de l'anglais technique. */
function failureMessage(r: unknown): string {
  const raw = JSON.stringify(r ?? '').toLowerCase();
  if (raw.includes('invalid_number')) return 'Ce numéro Mobile Money n’est pas valide, vérifiez le pays et le numéro.';
  if (raw.includes('insufficient')) return 'Solde insuffisant sur le compte débité.';
  if (raw.includes('declined')) return 'Paiement refusé par l’opérateur.';
  if (raw.includes('fraud')) return 'Paiement bloqué par l’opérateur.';
  if (raw.includes('cancel')) return 'Paiement annulé.';
  return ECHEC_SANS_MOTIF;
}
const ECHEC_SANS_MOTIF = 'Le paiement n’a pas abouti, réessayez ou envoyez l’acompte vous-même.';

export type PayRequest = {
  /** Montant à débiter, en XOF (la Maison encaisse en XOF). */
  amountXof: number;
  /** NOTRE référence : l'id du rendez-vous. Elle relie le paiement à la
      réservation côté serveur, sans avoir à croire le navigateur. */
  partnerId: string;
  /** Voyage dans `data` et revient au webhook dans `stateData` : sans elle, un
      paiement dont le rendez-vous n'existe pas encore ignore sa maison. */
  branchId: string;
  clientId?: string;
  phone?: string;
  name?: string;
  email?: string;
  /** Les moyens que la fenêtre propose : `momo` (MTN, Moov, Celtiis) ou
      `card`. Sans lui, tous — comme avant. (23 novembre 2026 : sur la page
      « Régler », le moyen qu'elle a choisi ouvre SA fenêtre, pas le menu.) */
  moyens?: readonly ('momo' | 'card')[];
  /** La promesse se rejette (`FenetreFermee`) quand elle referme la fenêtre
      sans payer, au lieu d'attendre pour toujours. */
  rendLaMainALaFermeture?: boolean;
};

/** Ouvre le widget et attend la fin. La promesse ne se résout QUE sur un
    paiement abouti ; si la cliente ferme le widget, elle reste en attente —
    l'écran garde donc toujours une porte de sortie (« j'enverrai moi-même »).
    Depuis le 23 novembre 2026, une page peut demander la main à la fermeture
    (`rendLaMainALaFermeture`) : la promesse se rejette alors d'une
    `FenetreFermee`. */
/** Le message dit à la cliente quand le réseau manque (4 octobre 2026). */
export const KKIAPAY_HORS_LIGNE = 'Hors ligne : le paiement en ligne demande le réseau. Réessayez dès qu’il revient, ou réglez à la Maison.';

export function payWithKkiapay(req: PayRequest): Promise<{ transactionId: string }> {
  /* UN PAIEMENT EN LIGNE NE S'ATTEND PAS (« hors ligne », temps 3) : sans
     réseau, rien ne s'ouvre, et la cliente lit pourquoi. Le comptant et le
     Mobile Money déclaré au comptoir restent possibles. */
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new Error(KKIAPAY_HORS_LIGNE));
  /* Sans clé publique, le widget ne s'ouvrirait que pour dire une erreur (12 novembre 2026). */
  if (!kkiapayPeutSOuvrir()) return Promise.reject(new PanneDeKkiapay('Le service de paiement est injoignable.'));
  return loadWidget().then(() => new Promise<{ transactionId: string }>((resolve, reject) => {
    const w = window as KkiapayWindow;
    if (!w.openKkiapayWidget) { reject(new PanneDeKkiapay('Le service de paiement est injoignable.')); return; }
    pending?.reject(new Error('Paiement remplacé.'));
    pending = { resolve, reject, rendLaMain: req.rendLaMainALaFermeture === true };
    try {
      w.openKkiapayWidget({
        amount: Math.round(req.amountXof),
        key: PUBLIC_KEY,
        sandbox: SANDBOX,
        position: 'center',
        theme: '#B97A4A', // cuivre de la Maison
        partnerId: req.partnerId,
        ...(req.moyens?.length ? { paymentMethods: [...req.moyens] } : {}),
        ...(req.phone ? { phone: req.phone.replace(/\D/g, '') } : {}),
        ...(req.name ? { name: req.name } : {}),
        ...(req.email ? { email: req.email } : {}),
        data: JSON.stringify({ partnerId: req.partnerId, branchId: req.branchId, clientId: req.clientId }),
      });
    } catch {
      /* Le widget lève en s'ouvrant : une panne de KkiaPay (12 novembre 2026). */
      pending = null;
      reject(new PanneDeKkiapay('Le service de paiement est injoignable.'));
    }
  }));
}

