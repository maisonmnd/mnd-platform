import { C, L, P } from './outils.mjs';

/* LES LIGNES QUI REVIENNENT d'une fiche à l'autre. Écrites une fois : deux
   fiches qui disent le même geste le disent avec les mêmes mots, et une
   correction se fait à un seul endroit. Aucune ne porte de chiffre. */

/** Avant tout soin : on regarde, on le dit, on le note. */
export const REGARD_AVANT = P('Regarder le cuir chevelu et les locks avant de commencer : irritation, plaie, pellicules, résidus, lock amincie à la racine. Le dire à la cliente et le noter sur sa fiche.');

/** Un cuir chevelu abîmé arrête un acte technique. */
export const CUIR_CHEVELU_SAIN = P('Cuir chevelu irrité, blessé ou brûlé : on ne fait pas cet acte aujourd’hui, on le dit à la cliente et on prévient la direction.');

/** Les préparations du Laboratoire se gardent peu. */
export const FLACONS_DU_LABORATOIRE = L('Les préparations du Laboratoire : étiquette lisible, encore dans leur délai de garde, aucune odeur rance.');

export const SECHAGE = P('Sécher complètement, jusqu’au cœur des locks : une lock restée humide prend une odeur et peut moisir.');

export const SECHER_A_LA_MAISON = P('À la maison, après chaque lavage, sécher les locks complètement avant de les attacher ou de se coucher.');

export const BONNET_LA_NUIT = L('Dormir avec un bonnet en satin ou en soie.');

/** La fiche cliente du Trône se met à jour à chaque venue (SÍNSIN™, au catalogue). */
export const NOTER_LA_FICHE = C('Mettre à jour la fiche cliente : ce qui a été fait, ce qui a été vu.');

export const SANS_TENSION = P('Aucune tension à la racine : si la cliente dit que ça tire, on desserre tout de suite.');

/** Avant le départ, la venue suivante. */
export const POSER_LA_SUITE = P('Poser avec elle le rendez-vous suivant avant son départ.');
