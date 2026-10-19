/* LE PLAFOND DES AGENTS — 11 octobre 2026.

   Choix de Yéman au sélecteur : les agents appellent Claude d'eux-mêmes
   (briefing du matin, lundi, vendredi, rapport du mois), « avec un plafond
   mensuel », 10 $ par mois. Au-delà, ils s'arrêtent et le disent.

   UNE ESTIMATION PRUDENTE. Le coût se calcule ici à partir des jetons que
   Claude rend à chaque appel, avec des prix RELEVÉS VERS LE HAUT : le
   compteur atteint le plafond avant la vraie facture, jamais après. La
   facture réelle se lit dans la console d'Anthropic.

   Le mois se compte à l'heure de Cotonou. MODULE PUR, copié entre repères
   dans la fonction `centre-de-commande`. */

export const PLAFOND_PAR_DEFAUT_USD = 10;

/** Dollars par million de jetons, entrée et sortie. Un modèle inconnu se
    compte au prix le plus haut de la table. */
export const PRIX_PAR_MILLION: Record<string, { entree: number; sortie: number }> = {
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
  'claude-haiku-4-5-20251001': { entree: 1, sortie: 5 },
  /* Le rapide des huit chantiers (ia-maison, 19 octobre 2026), au prix du
     haiku 4.5 : sans cette ligne, il se compterait au prix le plus haut. */
  'claude-haiku-5-5': { entree: 1, sortie: 5 },
  'claude-opus-5-5': { entree: 15, sortie: 75 },
  'claude-opus-4-8': { entree: 15, sortie: 75 },
};

const LE_PLUS_CHER = Object.values(PRIX_PAR_MILLION).reduce(
  (m, p) => ({ entree: Math.max(m.entree, p.entree), sortie: Math.max(m.sortie, p.sortie) }),
  { entree: 0, sortie: 0 },
);

/** Le coût d'un appel, en dollars, arrondi au centième de cent supérieur. */
export function coutDeLAppel(modele: string, jetonsEntree: number, jetonsSortie: number): number {
  const p = PRIX_PAR_MILLION[modele] ?? LE_PLUS_CHER;
  const brut = (Math.max(0, jetonsEntree) * p.entree + Math.max(0, jetonsSortie) * p.sortie) / 1_000_000;
  return Math.ceil(brut * 10_000) / 10_000;
}

/** « 2026-10 » : le mois à Cotonou. */
export function moisACotonou(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
  } catch {
    return d.toISOString().slice(0, 7);
  }
}

export type LigneDuCompteur = { usd: number; appels: number; entree: number; sortie: number };
export type Compteur = Record<string, LigneDuCompteur>;

export const depenseDuMois = (c: Compteur | null | undefined, mois: string): number => c?.[mois]?.usd ?? 0;

/** Un appel peut-il partir ? Le plafond se lit avant l'appel : à 10 $ pile,
    plus rien ne part. Un plafond absent ou abîmé vaut celui par défaut. */
export function peutAppeler(c: Compteur | null | undefined, mois: string, plafondUsd?: number): { oui: boolean; reste: number; plafond: number } {
  const plafond = Number.isFinite(plafondUsd) && (plafondUsd as number) > 0 ? (plafondUsd as number) : PLAFOND_PAR_DEFAUT_USD;
  const depense = depenseDuMois(c, mois);
  const reste = Math.max(0, Math.round((plafond - depense) * 10_000) / 10_000);
  return { oui: depense < plafond, reste, plafond };
}

/** Le compteur après un appel : une ligne par mois, rien d'autre ne bouge. */
export function compteurApres(c: Compteur | null | undefined, mois: string, modele: string, entree: number, sortie: number): Compteur {
  const avant = c?.[mois] ?? { usd: 0, appels: 0, entree: 0, sortie: 0 };
  return {
    ...(c ?? {}),
    [mois]: {
      usd: Math.round((avant.usd + coutDeLAppel(modele, entree, sortie)) * 10_000) / 10_000,
      appels: avant.appels + 1,
      entree: avant.entree + Math.max(0, entree),
      sortie: avant.sortie + Math.max(0, sortie),
    },
  };
}
