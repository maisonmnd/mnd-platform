import { supabase } from './supabase';
import { cashboxesStore } from './finance';

/* KkiaPay — les rails de paiement de la Maison (Mobile Money, carte, Wave).

   TROIS RÈGLES, dans l'ordre d'importance :

   ① Seule la clé PUBLIQUE vit ici. Ma Couronne est un paquet statique : tout ce
     qu'il embarque est lisible par n'importe qui. Les clés privée et secrète ne
     quittent jamais les fonctions Edge (`kkiapay-verify`, `kkiapay-webhook`).

   ② Le retour du widget NE PROUVE RIEN. `addSuccessListener` s'appelle depuis la
     console du navigateur en trois lignes. Un acompte n'est réputé reçu QUE
     lorsque le serveur a revérifié la transaction auprès de KkiaPay et contrôlé
     le montant. C'est la fonction Edge qui pose `depositConfirmed`, jamais cet
     écran — l'invariant « acompte demandé ≠ acompte reçu » tient par là.

   ③ Sans clé publique, tout ceci est INERTE et l'écran d'acompte reste celui
     qu'il est aujourd'hui : le mode d'emploi Mobile Money honnête. Même couture
     que `aiEnabled()` — pas de backend, pas de bouton. */

/** Moyen de paiement inscrit sur la facture quand la cliente a réglé en ligne. */
export const KKIAPAY_METHOD = 'KkiaPay';
/** Caisse dédiée : l'argent est sur le compte KkiaPay, PAS dans le tiroir. */
export const KKIAPAY_CASHBOX = 'KkiaPay';

/* LES FRAIS SONT À LA CHARGE DE LA CLIENTE — 1,9 % en Mobile Money, 4 % par
   carte (grille KkiaPay). La Maison reçoit le montant demandé, entier : la
   commission n'est donc NI une dépense, NI une retenue sur son encaissement.
   Le champ `feesXof` du paiement n'est conservé que pour la trace — ce que la
   cliente a payé en plus, à KkiaPay, jamais à la Maison. Ne pas le transformer
   en dépense : ce serait sortir d'une caisse un argent qui n'y est jamais entré. */

const PUBLIC_KEY = ((import.meta.env.VITE_KKIAPAY_PUBLIC_KEY as string | undefined) ?? '').trim();
const SANDBOX = (import.meta.env.VITE_KKIAPAY_SANDBOX as string | undefined) === 'true';

/** Les rails sont-ils branchés ? (clé publique fournie au build) */
export const kkiapayEnabled = (): boolean => PUBLIC_KEY !== '' && !!supabase;
/** Bac à sable — aucun franc réel ne bouge. */
export const kkiapaySandbox = (): boolean => SANDBOX;

/** Idempotent : garantit la caisse KkiaPay de la branche. L'argent encaissé en
    ligne N'EST PAS dans le tiroir — il dort sur le compte KkiaPay jusqu'au
    versement. Lui donner sa caisse est la seule façon que la Synthèse n'annonce
    pas des billets que personne ne peut compter. À appeler au montage des
    Dépenses (le magasin est déjà peuplé : la graine ne suffirait pas — même
    leçon que `ensureStarterServices`). L'identifiant est déterministe, donc un
    second passage, même sur un autre appareil, ne crée pas de doublon.
    NB : le moyen de paiement « KkiaPay » n'est PAS ajouté ici — la liste des
    moyens est un document LWW, l'écrire au montage écraserait une hydratation
    en cours (leçon `ensureDiasporaSegment`). Le comptoir l'ajoute d'un geste
    dans Paramètres, la liste est faite pour ça. */
export function ensureKkiapayCashbox(branchId: string): void {
  if (!kkiapayEnabled() || !branchId) return;
  const boxes = cashboxesStore.get();
  if (boxes.some((b) => b.branchId === branchId && b.name === KKIAPAY_CASHBOX)) return;
  cashboxesStore.set((prev) => [
    ...prev,
    {
      id: `cb-kkiapay-${branchId}`,
      branchId,
      name: KKIAPAY_CASHBOX,
      sub: 'Paiements en ligne',
      glyph: '◈',
      openingXof: 0,
    },
  ]);
}

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
export function payWithKkiapay(req: PayRequest): Promise<{ transactionId: string }> {
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

export type VerifiedPayment = {
  ok: boolean;
  amountXof: number;
  feesXof: number;
  method?: string;
};

/** Fait revérifier la transaction par le serveur — SEUL verdict qui compte.
    Le serveur enregistre le paiement, confirme l'acompte du rendez-vous et
    inscrit la commission en dépense. Lève une erreur lisible. */
export async function verifyDeposit(input: {
  transactionId: string;
  apptId: string;
  expectedXof: number;
  branchId: string;
  clientId?: string;
}): Promise<VerifiedPayment> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { data, error } = await supabase.functions.invoke('kkiapay-verify', { body: input });
  if (error) throw new Error(verifyMessage(error));
  const d = data as Partial<VerifiedPayment> & { error?: string };
  if (d?.error) throw new Error(verifyMessage(d.error));
  return {
    ok: d?.ok === true,
    amountXof: Number(d?.amountXof ?? 0),
    feesXof: Number(d?.feesXof ?? 0),
    method: d?.method,
  };
}

function verifyMessage(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (raw.includes('amount')) return 'Le montant reçu ne correspond pas à l’acompte attendu, la Maison vous contacte.';
  if (raw.includes('not_found') || raw.includes('404')) return 'Transaction introuvable chez KkiaPay, gardez votre référence.';
  if (raw.includes('failed')) return 'Le paiement n’a pas abouti.';
  return 'Vérification impossible pour l’instant, votre référence est conservée, la Maison vérifiera.';
}
