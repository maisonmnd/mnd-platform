import { LanceurDeGerard, usePassageDu } from './gerard-donnees';

/* ═══ LE PASSAGE DE GÉRARD AU TABLEAU DE BORD — 26 octobre 2026 ═══
   « On commence immédiatement. » Le Trône n'a pas de réveil au serveur
   pour Gérard : son passage du jour se fait quand la direction ouvre le
   tableau de bord (ou sa rubrique), une fois par jour, entre 8 h et 20 h.
   La lecture des fiches ne tourne QUE si le passage est dû. */
export function PassageDeGerard() {
  const du = usePassageDu();
  return du ? <LanceurDeGerard /> : null;
}
