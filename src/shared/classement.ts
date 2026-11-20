import { useMemo } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { CATEGORIES_DE_DEPART, categoriesLues, criteresEnVigueur, type CategorieDeLaMaison, type CriteresDuClassement } from './classement-pur';

/* ══ LE CLASSEMENT, CÔTÉ TRÔNE — 20 novembre 2026 ═════════════════════════
   Un seul document, `mnd_classement` : les critères que la Maison règle et
   ses catégories (étapes et marques, avec leurs critères). Le calcul vit dans
   `classement-pur`. Au premier poste qui s'ouvre, le serveur reçoit la
   semence (bindDocument amorce un document absent) ; ensuite, il fait foi.
   Les choix posés dans le dossier d'une cliente vivent sur sa fiche
   (`Client.parcours`), pas ici. */

export type ReglagesDuClassement = {
  criteres: Partial<CriteresDuClassement>;
  categories: CategorieDeLaMaison[];
  modifieLe?: string;
  modifiePar?: string;
};

export const CLE_DU_CLASSEMENT = 'mnd_classement';
export const classementStore = createStore<ReglagesDuClassement>(CLE_DU_CLASSEMENT, { criteres: {}, categories: CATEGORIES_DE_DEPART });
bindDocument(classementStore, CLE_DU_CLASSEMENT);

/** Les réglages, toujours sûrs à lire, et la porte pour les écrire. */
export function useClassement(): [{ criteres: CriteresDuClassement; categories: CategorieDeLaMaison[]; modifieLe?: string; modifiePar?: string }, (fn: (r: ReglagesDuClassement) => ReglagesDuClassement, par?: string) => void] {
  const [brut] = useStore(classementStore);
  const r = useMemo(() => ({
    criteres: criteresEnVigueur(brut?.criteres),
    categories: categoriesLues(brut?.categories),
    modifieLe: brut?.modifieLe,
    modifiePar: brut?.modifiePar,
  }), [brut]);
  const ecris = (fn: (r: ReglagesDuClassement) => ReglagesDuClassement, par?: string) =>
    classementStore.set((avant) => ({
      ...fn({ criteres: { ...(avant?.criteres ?? {}) }, categories: categoriesLues(avant?.categories) }),
      modifieLe: new Date().toISOString(),
      ...(par ? { modifiePar: par } : {}),
    }));
  return [r, ecris];
}
