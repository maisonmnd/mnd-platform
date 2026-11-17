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
   se montre jamais, une pièce payée sort de la cloche.

   17 NOVEMBRE 2026 : ELLE NE VOIT QU'UN DEVIS REMIS. « Il ne faut pas
   permettre d'avoir des bilans sans prendre de RDV » (Yéman) : la Maison
   remet le devis au rendez-vous (`devis-remis-pur`, `peutEtreRemis`), et
   c'est sa marque (`remisLe`) qui l'ouvre ici. Un devis vaut quinze jours :
   périmé, il se dit, et n'offre plus de geste. MODULE PUR. */
import { estPerime, horsRegle, lisibleParElle } from './devis-remis-pur';

export type EtatDuDevis = 'brouillon' | 'estimé' | 'à valider' | 'envoyée' | 'acceptée' | 'confirmé' | 'payée';
export type DevisLu = {
  status: EtatDuDevis; aValiderPar?: 'maison' | 'cliente';
  /** Ce que lit la remise (`devis-remis-pur`) : absents, le devis n'est pas remis. */
  kind?: string; date?: string; remisLe?: string; boutique?: unknown;
};
export type GesteDeLaCliente = 'faire-confirmer' | 'valider' | 'accepter';

const lu = (d: DevisLu) => ({ kind: d.kind ?? 'devis', status: d.status, date: d.date ?? '', remisLe: d.remisLe, boutique: d.boutique });
/** Remis à elle, ou une commande de la Boutique (hors de la règle). */
const remisAElle = (d: DevisLu): boolean => horsRegle(lu(d)) || lisibleParElle(lu(d));
const perime = (d: DevisLu, aujourdhui?: string): boolean => !!aujourdhui && estPerime(lu(d), aujourdhui);

/** Les devis qu'elle voit dans sa cloche : ceux que la Maison lui a remis. */
export const visiblePourElle = (d: DevisLu): boolean =>
  (d.status === 'estimé' || d.status === 'à valider' || d.status === 'envoyée' || d.status === 'acceptée' || d.status === 'confirmé')
  && remisAElle(d);

/** Le geste qu'elle peut faire, ou rien. Sur un devis pas remis, ou périmé (`aujourdhui` donné), rien. */
export function gesteDeLaCliente(d: DevisLu, aujourdhui?: string): GesteDeLaCliente | null {
  if (!remisAElle(d) || perime(d, aujourdhui)) return null;
  if (d.status === 'estimé') return 'faire-confirmer';
  if (d.status === 'à valider' && d.aValiderPar === 'cliente') return 'valider';
  if (d.status === 'envoyée') return 'accepter';
  return null;
}

/** Ce que son geste écrit sur la pièce : jamais plus que l'état. */
export function apresLeGeste(d: DevisLu, g: GesteDeLaCliente, aujourdhui?: string): Pick<DevisLu, 'status' | 'aValiderPar'> | null {
  if (gesteDeLaCliente(d, aujourdhui) !== g) return null;
  if (g === 'faire-confirmer') return { status: 'à valider', aValiderPar: 'maison' };
  return { status: 'acceptée', aValiderPar: undefined };
}

/** Le devis attend-il quelque chose d'elle ? (la pastille de la cloche) */
export const attendElle = (d: DevisLu, aujourdhui?: string): boolean => {
  const g = gesteDeLaCliente(d, aujourdhui);
  return g === 'valider' || g === 'accepter';
};

/** La phrase d'un devis périmé (la clé de `t()`). */
export const MOT_DU_DEVIS_PERIME = 'Ce devis a dépassé ses quinze jours. Écrivez à la Maison : elle le renouvelle.';

/** La phrase de la cloche, en français (la clé de `t()`), selon l'état. */
export function motPourElle(d: DevisLu, aujourdhui?: string): string {
  if (perime(d, aujourdhui)) return MOT_DU_DEVIS_PERIME;
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
   taux d'acompte, au prix ÉCRIT SUR LE DEVIS (pas celui du catalogue). Une
   ligne non reconnue ne demande rien.

   17 NOVEMBRE 2026 : L'ACOMPTE SE COMPTE SUR CE QU'ELLE PAIERA. Les remises
   en francs étaient oubliées : celle de la ligne (`discountXof`), et celle
   de la pièce (`remiseXof` : la consultation privée déduite, un geste). Un
   devis de 100 000 F dont 15 000 F sont déduits demandait l'acompte de
   100 000 F. La remise de la pièce, en % puis en francs, se répartit sur
   les lignes au prorata de ce que chacune vaut, comme le total de la
   facture (`invoiceTotal`). */
export function acompteDuDevis(
  lignes: readonly { label: string; unitXof: number; qty: number; discountPct?: number; discountXof?: number }[],
  idDuNom: (nom: string) => string | undefined,
  tauxDe: (serviceId: string) => number,
  remisePct = 0,
  remiseXof = 0,
): number {
  const nets = lignes.map((l) => Math.max(0, Math.max(0, l.unitXof) * Math.max(1, l.qty) * (1 - (l.discountPct || 0) / 100) - Math.max(0, l.discountXof || 0)));
  const sous = nets.reduce((s, x) => s + x, 0);
  if (!(sous > 0)) return 0;
  const total = Math.max(0, sous * (1 - (remisePct || 0) / 100) - Math.max(0, remiseXof || 0));
  const f = total / sous;
  let n = 0;
  lignes.forEach((l, i) => {
    const id = idDuNom(l.label);
    if (!id) return;
    n += nets[i] * f * Math.max(0, Math.min(1, tauxDe(id)));
  });
  return Math.round(n);
}
