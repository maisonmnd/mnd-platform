/* ══ LES FRAIS DE LA CARTE — 21 novembre 2026 ══════════════════════════

   « Cliente Eliane, qui est là présentement, veut payer par carte, mais je
   dois rajouter les frais sur sa transaction, les frais de 4 %. » (Yéman),
   puis « construis ».

   CE QUE LA CARTE COÛTE, LA CLIENTE LE PAIE. Au terminal de la banque, la
   Maison ajoute 4 % à la part réglée par carte. L'écran d'encaissement le
   propose d'office (une case, cochée), le montant à passer au terminal se lit
   sous la part, et la caissière peut décocher.

   LES FRAIS VIVENT COMME LA GAMME : une LIGNE de plus sur la pièce du rituel,
   et un VERSEMENT à part, dans la même caisse que la carte. Jamais dans le
   prix du rituel : `paidXof`, le carnet, les mains, les primes et les
   commissions ne comptent que le rituel. Le chiffre d'affaires, lui, se lit
   sur la pièce : les frais y entrent.

   FedaPay n'est pas concerné : son panneau dit déjà ses propres frais, payés
   par la cliente (`fraisXof`). Seul le terminal de la banque (la tuile
   « carte ») porte ces 4 %.

   Pur : aucun import. La fonction Edge `cloture-du-jour` en recopie les deux
   reconnaissances (ligne et versement) ; `banc-des-frais-de-carte` vérifie
   que la copie dit la même chose. */

/** Le taux, en pour cent, que la Maison ajoute à une part réglée au terminal.
    2,3 % depuis le 22 novembre 2026 : « frais de carte est de 2.3 % pas 4 % »
    (Yéman, devant l'encaissement). Les pièces déjà faites gardent leur ligne
    « (4 %) », reconnue par son libellé. */
export const FRAIS_DE_CARTE_PCT = 2.3;

/** Un taux dit à la française : « 2,3 », jamais « 2.3 ». */
export const tauxDit = (pct: number): string => String(pct).replace('.', ',');

/** Le taux de la Maison, tel que l'écran le dit. */
export const FRAIS_DE_CARTE_DIT = tauxDit(FRAIS_DE_CARTE_PCT);

/** Le libellé de la ligne, sans le taux. */
export const LIBELLE_FRAIS_DE_CARTE = 'Frais de paiement par carte';

/** La note du versement des frais. Elle commence par « Frais de carte » :
    c'est par elle que le carnet, la conformité et la clôture du jour les
    écartent de l'argent du rituel, comme la note « Gamme, … ». */
export const NOTE_FRAIS_DE_CARTE = 'Frais de carte, payés par la cliente';

/** Les frais d'une part : le taux du montant, arrondis au franc SUPÉRIEUR (la
    banque ne prélève jamais moins que son taux). Zéro pour une part vide. */
export function fraisDeCarteXof(montantXof: number, pct: number = FRAIS_DE_CARTE_PCT): number {
  const m = Math.round(Number(montantXof) || 0);
  const p = Number(pct) || 0;
  if (m <= 0 || p <= 0) return 0;
  /* Les centimes de l'arithmétique flottante (4 % de 45 000 = 1800.0000000002)
     ne doivent pas faire monter d'un franc. */
  return Math.ceil(Math.round(m * p * 100) / 10000);
}

/** « Frais de paiement par carte (4 %) », l'espace insécable avant « % ». */
export const libelleDesFraisDeCarte = (pct: number = FRAIS_DE_CARTE_PCT): string =>
  `${LIBELLE_FRAIS_DE_CARTE} (${tauxDit(pct)} %)`;

/** Une ligne de pièce qui porte les frais : par son marqueur, ou par son
    libellé (une pièce relue sans le marqueur, au serveur). */
export const estLigneDeFraisDeCarte = (l: { label?: string; frais?: string } | null | undefined): boolean =>
  !!l && (l.frais === 'carte' || (l.label ?? '').startsWith(LIBELLE_FRAIS_DE_CARTE));

/** Un versement qui règle les frais, et non le rituel. */
export const estVersementDeFraisDeCarte = (v: { note?: string } | null | undefined): boolean =>
  !!v && /^Frais de carte\b/.test(v.note ?? '');

/** La ligne à poser sur la pièce : le marqueur `frais` dit ce qu'elle est,
    quel que soit son libellé. */
export function ligneDesFraisDeCarte(montantXof: number, id: string, pct: number = FRAIS_DE_CARTE_PCT): {
  id: string; label: string; qty: number; unitXof: number; discountPct: number; frais: 'carte';
} {
  return { id, label: libelleDesFraisDeCarte(pct), qty: 1, unitXof: Math.max(0, Math.round(montantXof)), discountPct: 0, frais: 'carte' };
}
