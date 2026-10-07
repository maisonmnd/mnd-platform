/* LE DICTIONNAIRE ANGLAIS DE MA COURONNE — 3 octobre 2026.
   La clé est la phrase française EXACTE passée à `t()` ; la valeur, son
   anglais, relu par Yéman avant l'ouverture (page de relecture). Un fichier
   par écran, réunis ici. */
import { EN_COMMUN } from './en-commun';
import { EN_TABS } from './en-tabs';
import { EN_BOOKING } from './en-booking';
import { EN_PARCOURS } from './en-parcours';
import { EN_FORMULE } from './en-formule';
import { EN_RDV } from './en-rdv';

export const EN: Record<string, string> = {
  ...EN_COMMUN,
  ...EN_TABS,
  ...EN_BOOKING,
  ...EN_PARCOURS,
  ...EN_FORMULE,
  ...EN_RDV,
};
