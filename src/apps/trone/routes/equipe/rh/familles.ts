import { useMemo } from 'react';
import { mondeDeCat, useCategories, type CatalogCategory } from '../../../../../shared/catalog';

/* LES FAMILLES DE GESTES — la grille des compétences (14 octobre 2026) se
   tient par les familles RACINES du catalogue de l'atelier et du studio :
   les vrais gestes de la Maison, pas une liste inventée. Le français d'abord,
   le nom fon ensuite (règle de la Maison). */

export type Famille = { id: string; nom: string; fon?: string };

export function famillesDesGestes(cats: readonly CatalogCategory[]): Famille[] {
  return cats
    .filter((c) => !c.parentId)
    .filter((c) => { const m = mondeDeCat(c, cats); return m === 'atelier' || m === 'studio'; })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({ id: c.id, nom: c.label || c.fon, fon: c.label && c.fon && c.fon !== c.label ? c.fon : undefined }));
}

/** La famille racine d'une catégorie (celle d'une prestation). */
export function familleDe(categoryId: string | undefined, cats: readonly Pick<CatalogCategory, 'id' | 'parentId'>[]): string | undefined {
  if (!categoryId) return undefined;
  let cur = cats.find((c) => c.id === categoryId);
  for (let i = 0; cur?.parentId && i < 8; i += 1) {
    const p = cats.find((c) => c.id === cur?.parentId);
    if (!p) break;
    cur = p;
  }
  return cur?.id;
}

export function useFamillesDesGestes(): Famille[] {
  const [cats] = useCategories();
  return useMemo(() => famillesDesGestes(Array.isArray(cats) ? cats : []), [cats]);
}
