import { LanceurDeGerard, useLesRemisesAuDepart, usePassageDu } from './gerard-donnees';

/* ═══ LE PASSAGE DE GÉRARD AU TABLEAU DE BORD — 26 octobre 2026 ═══
   « On commence immédiatement. » Le Trône n'a pas de réveil au serveur
   pour Gérard : son passage du jour se fait quand la direction ouvre le
   tableau de bord (ou sa rubrique), une fois par jour, entre 8 h et 20 h.
   La lecture des fiches ne tourne QUE si le passage est dû.

   27 OCTOBRE 2026 : la fonction serveur `assistant-maison` fait le passage
   et les remises ; le Trône ne les refait que si elle se tait depuis plus
   de 26 heures (`assistant-passage-pur.ts`). */
export function PassageDeGerard() {
  const du = usePassageDu();
  useLesRemisesAuDepart();
  return du ? <LanceurDeGerard /> : null;
}
