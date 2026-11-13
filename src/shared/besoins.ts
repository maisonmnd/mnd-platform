import { useMemo } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { BESOINS_DE_DEPART, reglagesSurs, type ReglagesDesBesoins } from './besoins-pur';
import type { Service } from './catalog';

/* ══ LES BESOINS, CÔTÉ TRÔNE — 13 novembre 2026 (la Consultation, lot 1) ═══
   Un seul document, `mnd_besoins`, que la direction corrige au Trône
   (Système › Besoins et règles) : les besoins, leurs points, leurs
   prestations, les seuils des paliers, la valeur des preuves. Le calcul vit
   dans `besoins-pur`. Au premier poste qui s'ouvre, le serveur reçoit la
   semence (bindDocument amorce un document absent) ; ensuite, le serveur
   fait foi pour tous les postes. */

export const CLE_DES_BESOINS = 'mnd_besoins';
export const besoinsStore = createStore<ReglagesDesBesoins>('mnd_besoins', BESOINS_DE_DEPART());
bindDocument(besoinsStore, 'mnd_besoins');

/** Le document, toujours sûr à lire, même s'il arrive incomplet du serveur. */
export function useBesoins(): [ReglagesDesBesoins, (fn: (r: ReglagesDesBesoins) => ReglagesDesBesoins, par?: string) => void] {
  const [brut] = useStore(besoinsStore);
  const r = useMemo(() => reglagesSurs(brut), [brut]);
  const ecris = (fn: (r: ReglagesDesBesoins) => ReglagesDesBesoins, par?: string) =>
    besoinsStore.set((avant) => ({
      ...fn(reglagesSurs(avant)),
      modifieLe: new Date().toISOString(),
      ...(par ? { modifiePar: par } : {}),
    }));
  return [r, ecris];
}

/** Le prix d'appel d'une prestation pour son palier : le prix catalogue, sinon
    le plus bas de ses prix par longueur ; inconnu sinon (comptage, forfait
    composé, sur devis), et l'inconnu se range au palier le plus haut. */
export const prixDAppelDe = (services: readonly Service[]) => {
  const parId = new Map(services.map((s) => [s.id, s]));
  return (id: string): number | undefined => {
    const s = parId.get(id);
    if (!s) return undefined;
    if (s.priceXof > 0) return s.priceXof;
    const longueurs = Object.values(s.prixParLongueur ?? {}).filter((n): n is number => typeof n === 'number' && n > 0);
    return longueurs.length ? Math.min(...longueurs) : undefined;
  };
};

/** Ce qu'une prestation est devenue, pour la santé du document. */
export const etatDe = (services: readonly Service[]) => {
  const parId = new Map(services.map((s) => [s.id, s]));
  return (id: string): 'vendue' | 'archivee' | 'inconnue' => {
    const s = parId.get(id);
    return !s ? 'inconnue' : s.archived ? 'archivee' : 'vendue';
  };
};
