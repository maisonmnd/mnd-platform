/* LES TONS DES PAGES — 8 octobre 2026. « Il n'y a pas de transition entre les
   pages de maisonmnd ; on ne sait pas quand une page se termine ; regarde
   leafandflower.com, les pages passent en douceur avec les couleurs
   ajustées » (Yéman). Le ton d'une page est ce qui est sous la barre du
   navigateur à l'arrivée (theme-color) et la toile de la page (data-ton sur
   <body>) : trois familles que l'œil distingue, l'ivoire, l'argile (le sable
   sous le voile cuivre) et l'indigo pâle (indigo-50 des jetons). Le harnais
   verifie-la-lumiere garde SA propre table : il ne déduit pas son attente
   d'ici. */
export const TONS = { maison: '#F6F1E7', parcours: '#E7D7C2', offres: '#EDEEF4' } as const;
export type Ton = keyof typeof TONS;

/** Les îlots d'action prolongent le parcours (lin) ; ceux de la vente et du
    cercle sont des offres (sable). */
const ILOTS_DU_PARCOURS = new Set(['reserver', 'demande', 'triage', 'testeuse']);
const ILOTS_DES_OFFRES = new Set(['offres', 'offrir', 'parrainer']);

/** La famille d'une page : forcée par `ton`, sinon déduite de ce qu'elle
    porte. Une page de service (cta ou pas) est un parcours ; sans rien de
    tout cela, c'est la Maison. */
export function tonDe(p: { cta?: unknown; pas?: unknown; ilot?: string; ton?: Ton }): Ton {
  if (p.ton) return p.ton;
  if (p.cta || p.pas || ILOTS_DU_PARCOURS.has(p.ilot ?? '')) return 'parcours';
  if (ILOTS_DES_OFFRES.has(p.ilot ?? '')) return 'offres';
  return 'maison';
}
