import { LanceurAvantLeFauteuil, usePassageAvantLeFauteuilDu } from './avant-le-fauteuil-donnees';

/* ═══ LE PASSAGE D'« AVANT LE FAUTEUIL » — 31 octobre 2026 ═══
   « Credo vient le 13 novembre, il faut que je me souvienne de relire notre
   conversation » (Yéman). Monté au tableau de bord, à côté du passage de
   Gérard, et au Carnet : le soir dès 18 h 50 pour les têtes de demain, le
   matin dès 6 h 45 pour celles d'aujourd'hui, la direction reçoit sur son
   téléphone « Demain, 3 têtes » ou « Aujourd'hui, 1 tête », une fois.
   La lecture des fiches ne tourne QUE si un passage est dû. La clé remonte
   le lanceur quand le passage change (du soir au matin), pour qu'il reparte
   d'une mémoire neuve. */
export function PassageAvantLeFauteuil() {
  const du = usePassageAvantLeFauteuilDu();
  return du ? <LanceurAvantLeFauteuil key={du} quand={du} /> : null;
}
