/* ══ LES PRÉVISIONS REFAITES, CE QUE L'ÉCRAN MONTRE — 11 novembre 2026 ═══
   « L'UI/l'UX des prévisions est médiocre. Refais-moi une belle et
   professionnelle » (Y.), maquette PYPe8AbTyxytSBxZLDiMZ7 validée par
   « construis ». Les règles du calcul vivent toujours dans
   `shared/previsions-pur.ts` et ne changent pas : ce module ne décide que de
   l'AFFICHAGE (quelle vue, quelle part de la jauge, quel levier d'abord, quel
   panneau ouvert, quel ton pour un jour). Pur, sans React, pour que le banc
   `scripts/verifie-les-previsions-refaites.mjs` le tienne. */
import type { Levier } from '../../../../shared/previsions-pur';

/** LA VUE, à part de l'horizon : avant, les cinq boutons étaient mêlés. */
export type VueDesPrevisions = 'avenir' | 'passe' | 'francs';
export const VUES_DES_PREVISIONS: readonly { cle: VueDesPrevisions; nom: string }[] = [
  { cle: 'avenir', nom: 'À venir' },
  { cle: 'passe', nom: '12 derniers mois' },
  { cle: 'francs', nom: 'En francs' },
];

/** L'adresse choisit la vue : `?vue=francs` (le lien du tableau de bord),
    `?vue=passe` ; tout le reste ouvre « À venir ». */
export const vueDeLAdresse = (v: string | null): VueDesPrevisions => (v === 'francs' ? 'francs' : v === 'passe' ? 'passe' : 'avenir');

/** LE REMPLISSAGE : les prévus sur le plafond, sans puis avec le marketing.
    Pas borné : au-dessus de 100 %, la Maison dépasse ce qu'elle a déjà fait. */
export function remplissage(prevision: number, marketing: number, plafond: number): { sans: number | null; avec: number | null } {
  if (!(plafond > 0)) return { sans: null, avec: null };
  return { sans: Math.max(0, prevision) / plafond, avec: Math.max(0, prevision + marketing) / plafond };
}

/** LA JAUGE : posés, attendus, marketing, puis le libre, en parts de la
    largeur. Bornée à 100 % : si la prévision dépasse le plafond, c'est la
    somme qui fait la largeur entière, jamais plus. */
export type PartsDeLaJauge = { poses: number; attendus: number; marketing: number; libres: number };
export function partsDeLaJauge(o: { poses: number; attendus: number; marketing: number; plafond: number }): PartsDeLaJauge {
  const poses = Math.max(0, o.poses); const attendus = Math.max(0, o.attendus); const marketing = Math.max(0, o.marketing);
  const total = Math.max(o.plafond, poses + attendus + marketing, 0);
  if (!(total > 0)) return { poses: 0, attendus: 0, marketing: 0, libres: 0 };
  const p = Math.min(1, poses / total);
  const a = Math.min(1 - p, attendus / total);
  const m = Math.min(1 - p - a, marketing / total);
  return { poses: p, attendus: a, marketing: m, libres: Math.max(0, 1 - p - a - m) };
}

/** LES LEVIERS, du plus rentable au moins rentable : les RDV à gagner
    d'abord ; à égalité, le mesuré, puis l'inclus, puis l'« à mesurer ».
    Une copie : la liste du calcul n'est jamais touchée. */
const RANG_DE_L_ETAT: Record<Levier['etat'], number> = { mesure: 0, inclus: 1, 'a-mesurer': 2 };
export function leviersParGain<T extends Pick<Levier, 'rdv' | 'etat'>>(leviers: readonly T[]): T[] {
  return [...leviers].sort((a, b) => b.rdv - a.rdv || RANG_DE_L_ETAT[a.etat] - RANG_DE_L_ETAT[b.etat]);
}

/** LE DÉTAIL REPLIÉ : une seule clé ouverte, donc un seul panneau. Toucher la
    ligne ouverte la referme ; toucher une autre ligne referme la première. */
export type PanneauDuDetail = 'prevision' | 'plafond' | 'marketing';
export const PANNEAU_OUVERT_AU_DEPART: PanneauDuDetail = 'prevision';
export const basculeLePanneau = (ouvert: PanneauDuDetail | null, cle: PanneauDuDetail): PanneauDuDetail | null => (ouvert === cle ? null : cle);

/** UNE CASE DES 14 JOURS : fermée, creuse (le verdict du Carnet), pleine
    (autant de posés que l'ordinaire, ou plus), ou ordinaire. */
export type TonDuJour = 'ferme' | 'creux' | 'plein' | 'ordinaire';
export function tonDuJour(j: { ferme: boolean; creux: boolean; poses: number; ordinaire: number }): TonDuJour {
  if (j.ferme) return 'ferme';
  if (j.creux) return 'creux';
  if (j.poses > 0 && j.poses >= j.ordinaire) return 'plein';
  return 'ordinaire';
}
/** Sous le chiffre : « sur N » (l'ordinaire), ou le manque en négatif. */
export const sousTexteDuJour = (j: { ferme: boolean; creux: boolean; ordinaire: number; manque: number }): string =>
  (j.ferme ? 'fermé' : j.creux ? `−${j.manque}` : `sur ${j.ordinaire}`);
