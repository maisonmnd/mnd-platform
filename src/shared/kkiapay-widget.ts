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

type SuccessResponse = { transactionId?: string } | string;
type KkiapayWindow = Window & {
  openKkiapayWidget?: (opts: Record<string, unknown>) => void;
  addSuccessListener?: (cb: (r: SuccessResponse) => void) => void;
  addFailedListener?: (cb: (r: unknown) => void) => void;
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
    el.onerror = () => { scriptPromise = null; reject(new Error('Le service de paiement est injoignable.')); };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/* Les écouteurs de KkiaPay sont GLOBAUX : en enregistrer un par paiement les
   empilerait et rejouerait les anciens. On en pose donc un seul, qui aiguille
   vers le paiement en cours. */
let pending: { resolve: (r: { transactionId: string }) => void; reject: (e: Error) => void } | null = null;
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
    p?.reject(new Error(failureMessage(r)));
  });
  wired = true;
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
  return 'Le paiement n’a pas abouti, réessayez ou envoyez l’acompte vous-même.';
}

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
};

/** Ouvre le widget et attend la fin. La promesse ne se résout QUE sur un
    paiement abouti ; si la cliente ferme le widget, elle reste en attente —
    l'écran garde donc toujours une porte de sortie (« j'enverrai moi-même »). */
/** Le message dit à la cliente quand le réseau manque (4 octobre 2026). */
export const KKIAPAY_HORS_LIGNE = 'Hors ligne : le paiement en ligne demande le réseau. Réessayez dès qu’il revient, ou réglez à la Maison.';

export function payWithKkiapay(req: PayRequest): Promise<{ transactionId: string }> {
  /* UN PAIEMENT EN LIGNE NE S'ATTEND PAS (« hors ligne », temps 3) : sans
     réseau, rien ne s'ouvre, et la cliente lit pourquoi. Le comptant et le
     Mobile Money déclaré au comptoir restent possibles. */
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new Error(KKIAPAY_HORS_LIGNE));
  return loadWidget().then(() => new Promise<{ transactionId: string }>((resolve, reject) => {
    const w = window as KkiapayWindow;
    if (!w.openKkiapayWidget) { reject(new Error('Le service de paiement est injoignable.')); return; }
    pending?.reject(new Error('Paiement remplacé.'));
    pending = { resolve, reject };
    w.openKkiapayWidget({
      amount: Math.round(req.amountXof),
      key: PUBLIC_KEY,
      sandbox: SANDBOX,
      position: 'center',
      theme: '#B97A4A', // cuivre de la Maison
      partnerId: req.partnerId,
      ...(req.phone ? { phone: req.phone.replace(/\D/g, '') } : {}),
      ...(req.name ? { name: req.name } : {}),
      ...(req.email ? { email: req.email } : {}),
      data: JSON.stringify({ partnerId: req.partnerId, branchId: req.branchId, clientId: req.clientId }),
    });
  }));
}

