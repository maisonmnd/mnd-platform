/* ══ LE SOLDE KKIAPAY, LU CHEZ KKIAPAY — 26 novembre 2026 ═════════════════

   « Je veux lire mon solde KkiaPay directement sur le Trône, comme on a fait
   pour MTN MoMo, pour avoir mon solde depuis leur plateforme » (Yéman).

   KkiaPay ne documente AUCUNE route de solde : ses SDK serveur ne savent que
   vérifier, rembourser et programmer un reversement. Son tableau de bord,
   lui, lit les soldes par `POST /merchant/me` sur api.kkiapay.me : la
   réponse porte `developerAccounts`, et chaque compte ses trois soldes —
   ceux que le tableau de bord affiche :
     · `wallet_balance`                  le solde TOTAL ;
     · `payment_wallet.availableBalance` le solde D'OPÉRATION (les paiements
       en attente : le jour même pour le mobile money, 72 h pour la carte) ;
     · `payout_wallet.availableBalance`  le DISPONIBLE, celui qu'on reverse.
   Le tableau de bord ne garde que les comptes qui ont leurs deux portefeuilles.

   La fonction `kkiapay-solde` pose la même question avec les clés API de la
   Maison (celles de `kkiapay-tpe`) ; ce module lit la réponse et dit le souci
   en clair. Recopié tel quel entre ses repères dans la fonction
   (`scripts/kkiapay-solde-copie-serveur.mjs`) ; `verifie-le-solde-kkiapay`
   compare. Pur : aucun import. */

/* ⟨kkiapay-solde⟩ */
/** Un compte KkiaPay et ses trois soldes, en francs entiers. */
export type CompteKkiapay = { id: string; nom: string; totalXof: number | null; operationXof: number | null; disponibleXof: number | null };

/** Ce que la Maison retient d'une lecture : les comptes, leurs sommes, et le souci s'il y en a un. */
export type SoldeKkiapay = {
  comptes: CompteKkiapay[];
  totalXof: number | null;
  operationXof: number | null;
  disponibleXof: number | null;
  /** Les clés de la réponse quand rien ne s'y lit (jamais leurs valeurs) : de quoi comprendre sans rien exposer. */
  forme?: string[];
};

/** Un montant de KkiaPay (nombre ou texte « 12 500 », « 12500.00 ») en francs entiers, ou null. */
export function francsDeKkiapay(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x) : null;
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const somme = (xs: readonly (number | null)[]): number | null => {
  const lus = xs.filter((x): x is number => typeof x === 'number');
  return lus.length ? lus.reduce((s, x) => s + x, 0) : null;
};

/** La réponse de `/merchant/me` lue comme le tableau de bord la lit. Les
    comptes sans leurs deux portefeuilles sont écartés, comme chez KkiaPay. */
export function soldeDeKkiapay(corps: unknown): SoldeKkiapay {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const dedans = (c.data && typeof c.data === 'object' ? c.data : c) as Record<string, unknown>;
  const liste = Array.isArray(dedans.developerAccounts) ? dedans.developerAccounts : [];
  const comptes: CompteKkiapay[] = [];
  for (const brut of liste) {
    if (!brut || typeof brut !== 'object') continue;
    const a = brut as Record<string, unknown>;
    const paiement = a.payment_wallet as Record<string, unknown> | null | undefined;
    const reversement = a.payout_wallet as Record<string, unknown> | null | undefined;
    if (!paiement || typeof paiement !== 'object' || !reversement || typeof reversement !== 'object') continue;
    const nom = String(a.label ?? a.name ?? a.business_name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    comptes.push({
      id: String(a.id ?? '').slice(0, 64),
      nom: nom || 'Compte KkiaPay',
      totalXof: francsDeKkiapay(a.wallet_balance),
      operationXof: francsDeKkiapay(paiement.availableBalance),
      disponibleXof: francsDeKkiapay(reversement.availableBalance),
    });
  }
  return {
    comptes,
    totalXof: somme(comptes.map((x) => x.totalXof)),
    operationXof: somme(comptes.map((x) => x.operationXof)),
    disponibleXof: somme(comptes.map((x) => x.disponibleXof)),
    ...(comptes.length === 0 ? { forme: Object.keys(dedans).map((k) => k.slice(0, 40)).slice(0, 30) } : {}),
  };
}

/** Le souci d'une lecture, dit en clair ; null quand le solde est lu. */
export function souciDuSoldeKkiapay(http: number, lu: Pick<SoldeKkiapay, 'comptes'> | null): string | null {
  if (http === 200 && lu && lu.comptes.length > 0) return null;
  if (http === 200) return 'KkiaPay répond, mais sans aucun compte lisible.';
  if (http === 0) return 'KkiaPay ne répond pas. Réessayez dans un instant.';
  if (http === 401 || http === 403) return 'KkiaPay refuse les clés de la Maison pour lire le solde : il ne le montre qu’à son tableau de bord, connecté.';
  if (http === 404) return 'KkiaPay ne connaît pas cette route du solde.';
  if (http === 429) return 'KkiaPay demande d’attendre un peu avant de relire.';
  return `KkiaPay n’a pas rendu le solde (réponse ${http}).`;
}
/* ⟨/kkiapay-solde⟩ */
