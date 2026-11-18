import { useMemo } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { ENVIES_DE_DEPART, enviesSures, type ReglagesDesEnvies } from './envies-pur';

/* ══ VOS ENVIES, CÔTÉ TRÔNE — 17 novembre 2026 (la consultation en affiches) ══
   Un seul document, `mnd_envies`, que la direction corrige au Trône
   (Système › Besoins et règles › Vos envies) : ses envies, le groupe de
   chacune (Rituel, Visio, Consultation privée) et son rituel, les
   restrictions, et les deux parcours à part (sans locks encore, des locks à
   défaire). Le site le lit comme il lit `mnd_besoins` (0231) ; les règles
   vivent dans `envies-pur`. Au premier poste de la direction qui s'ouvre, le
   serveur reçoit la semence (bindDocument amorce un document absent) ;
   ensuite, le serveur fait foi pour tous les postes. Tant que le document
   n'existe pas, le site lit la même semence. */

export const CLE_DES_ENVIES = 'mnd_envies';
/* La clé du magasin s'écrit en toutes lettres : `verifie-cles-uniques` lit chaque `createStore` (une clé, un magasin). */
export const enviesStore = createStore<ReglagesDesEnvies>('mnd_envies', ENVIES_DE_DEPART());
bindDocument(enviesStore, CLE_DES_ENVIES);

/** Le document, toujours sûr à lire, même s'il arrive incomplet du serveur. */
export function useEnvies(): [ReglagesDesEnvies, (fn: (r: ReglagesDesEnvies) => ReglagesDesEnvies, par?: string) => void] {
  const [brut] = useStore(enviesStore);
  const r = useMemo(() => enviesSures(brut), [brut]);
  /* Un geste refusé (un nom déjà pris, une restriction en double) rend le
     document tel quel : rien ne s'écrit, la signature ne bouge pas. */
  const ecris = (fn: (r: ReglagesDesEnvies) => ReglagesDesEnvies, par?: string) =>
    enviesStore.set((avant) => {
      const sur = enviesSures(avant);
      const neuf = fn(sur);
      return neuf === sur ? avant : { ...neuf, modifieLe: new Date().toISOString(), ...(par ? { modifiePar: par } : {}) };
    });
  return [r, ecris];
}
