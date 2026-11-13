/* ══ LE DEVIS, CÔTÉ CLIENTE — 13 novembre 2026 (la Consultation, lot 4) ═════
   Maquette, livrable 9 : « Accepter, Valider ». Ce que Ma Couronne montre à
   la cliente de ses devis, et le seul geste qu'elle peut faire sur chacun :

     estimé                 → « Faire confirmer » : il passe « à valider »
                              par la Maison (la Maison relit, confirme) ;
     à valider (maison)     → rien : « En vérification par la Maison » ;
     à valider (cliente)    → « Valider le devis » : il devient « acceptée » ;
     envoyée                → « Accepter le devis » : « acceptée » (comme avant) ;
     acceptée, confirmé     → rien : la Maison prépare, puis le rendez-vous.

   La Maison seule CONFIRME (le rendez-vous naît là, lot 1). Le brouillon ne
   se montre jamais, une pièce payée sort de la cloche. MODULE PUR. */

export type EtatDuDevis = 'brouillon' | 'estimé' | 'à valider' | 'envoyée' | 'acceptée' | 'confirmé' | 'payée';
export type DevisLu = { status: EtatDuDevis; aValiderPar?: 'maison' | 'cliente' };
export type GesteDeLaCliente = 'faire-confirmer' | 'valider' | 'accepter';

/** Les devis qu'elle voit dans sa cloche. */
export const visiblePourElle = (d: DevisLu): boolean =>
  d.status === 'estimé' || d.status === 'à valider' || d.status === 'envoyée' || d.status === 'acceptée' || d.status === 'confirmé';

/** Le geste qu'elle peut faire, ou rien. */
export function gesteDeLaCliente(d: DevisLu): GesteDeLaCliente | null {
  if (d.status === 'estimé') return 'faire-confirmer';
  if (d.status === 'à valider' && d.aValiderPar === 'cliente') return 'valider';
  if (d.status === 'envoyée') return 'accepter';
  return null;
}

/** Ce que son geste écrit sur la pièce : jamais plus que l'état. */
export function apresLeGeste(d: DevisLu, g: GesteDeLaCliente): Pick<DevisLu, 'status' | 'aValiderPar'> | null {
  if (gesteDeLaCliente(d) !== g) return null;
  if (g === 'faire-confirmer') return { status: 'à valider', aValiderPar: 'maison' };
  return { status: 'acceptée', aValiderPar: undefined };
}

/** Le devis attend-il quelque chose d'elle ? (la pastille de la cloche) */
export const attendElle = (d: DevisLu): boolean => {
  const g = gesteDeLaCliente(d);
  return g === 'valider' || g === 'accepter';
};

/** La phrase de la cloche, en français (la clé de `t()`), selon l'état. */
export function motPourElle(d: DevisLu): string {
  switch (d.status) {
    case 'estimé': return 'Votre estimation, issue de votre consultation. Faites-la confirmer par la Maison.';
    case 'à valider': return d.aValiderPar === 'cliente'
      ? 'Votre devis ferme est prêt : validez-le pour réserver votre rituel.'
      : 'La Maison vérifie votre estimation. Elle vous écrit dès qu’elle est confirmée.';
    case 'envoyée': return 'La maison vous propose un devis, à accepter pour sceller le rituel.';
    case 'acceptée': return 'Devis accepté, la maison prépare votre rituel.';
    case 'confirmé': return 'Devis confirmé : votre rendez-vous est pris.';
    default: return '';
  }
}

/** Le bouton de son geste, en français (la clé de `t()`). */
export const boutonDuGeste: Record<GesteDeLaCliente, string> = {
  'faire-confirmer': 'Faire confirmer',
  valider: 'Valider le devis',
  accepter: 'Accepter le devis',
};

/* ── L'ACOMPTE DU RENDEZ-VOUS NÉ D'UN DEVIS CONFIRMÉ ─────────────────────
   Chaque ligne du devis reconnue au catalogue (par son nom) compte à SON
   taux d'acompte, au prix ÉCRIT SUR LE DEVIS (pas celui du catalogue), la
   remise en % répercutée. Une ligne non reconnue ne demande rien. */
export function acompteDuDevis(
  lignes: readonly { label: string; unitXof: number; qty: number; discountPct?: number }[],
  idDuNom: (nom: string) => string | undefined,
  tauxDe: (serviceId: string) => number,
  remisePct = 0,
): number {
  const f = 1 - (remisePct || 0) / 100;
  let n = 0;
  for (const l of lignes) {
    const id = idDuNom(l.label);
    if (!id) continue;
    const net = Math.max(0, l.unitXof) * Math.max(1, l.qty) * (1 - (l.discountPct || 0) / 100);
    n += net * f * Math.max(0, Math.min(1, tauxDe(id)));
  }
  return Math.round(n);
}
