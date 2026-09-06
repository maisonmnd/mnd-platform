/* ══ LES RÉGLAGES DES CONTRATS — 7 septembre 2026 ════════════════════

   « Dans les textes de la Maison il manque les contrats et identité » (Yéman).

   TROIS CONTRATS, TROIS NOMBRES QUE LA MAISON DÉCIDE. Le reste de chaque texte
   est écrit et se relit à l'écran ; ce qui se règle vraiment tient en peu de
   chiffres, et ce sont eux qu'on m'a demandés jusqu'ici :
   · le droit à l'image et sa DURÉE (cinq ans, décidée le 6 septembre) ;
   · le contrat prestataire, son NON-DÉMARCHAGE et son DÉLAI DE RÈGLEMENT ;
   · le contrat de formation et le DÉLAI AVANT LA LICENCE D'ENSEIGNER.

   UN CONTRAT NE SE RAPPELLE PAS, CONTRAIREMENT AU RÈGLEMENT. C'est la
   différence qui compte ici, et l'écran doit la dire : un règlement est imposé
   par une seule partie, donc le modifier oblige à faire resigner tout le monde
   ; un contrat est signé par deux, il est exécuté, et la Maison ne peut pas en
   changer les termes après coup. Publier une version ne touche donc QUE les
   contrats à venir. Les autres gardent la leur, ce que la signature prouve.

   CHACUN SA VERSION. Trois états séparés : changer le délai de règlement d'un
   prestataire n'a aucune raison de renuméroter le droit à l'image d'une
   cliente, et une version qui bouge sans que son texte change ne veut plus
   rien dire.

   TOUT CE QUI JUGE EST PUR, et éprouvé par `verifie-contrats`. */

import { createStore, useStore } from './store';
import { type Publie, type Versionne } from './textes';
import { MOIS_DE_VALIDITE, VERSION_DU_TEXTE } from './droit-image';
import {
  JOURS_DE_REGLEMENT, MOIS_NON_DEMARCHAGE, VERSION_PRESTATAIRE,
} from './contrat-prestataire';
import { MOIS_AVANT_LICENCE, VERSION_FORMATION } from './contrat-formation';

export type ReglageImage = { mois: number };
export type ReglagePrestataire = { moisNonDemarchage: number; joursDeReglement: number };
export type ReglageFormation = { moisAvantLicence: number };

export type EtatDesContrats = {
  image: Versionne<ReglageImage>;
  prestataire: Versionne<ReglagePrestataire>;
  formation: Versionne<ReglageFormation>;
};

/** CE QUE LA MAISON A DÉCIDÉ JUSQU'ICI — la v1 de chaque contrat, celle qui
    est déjà signée par des gens. Elle sert de secours quand le magasin est
    vide : un contrat sans terme ne se signe pas. */
export const IMAGE_V1: Publie<ReglageImage> = {
  version: VERSION_DU_TEXTE, leIso: '2026-09-06', mois: MOIS_DE_VALIDITE,
};
export const PRESTATAIRE_V1: Publie<ReglagePrestataire> = {
  version: VERSION_PRESTATAIRE, leIso: '2026-09-06',
  moisNonDemarchage: MOIS_NON_DEMARCHAGE, joursDeReglement: JOURS_DE_REGLEMENT,
};
export const FORMATION_V1: Publie<ReglageFormation> = {
  version: VERSION_FORMATION, leIso: '2026-09-06', moisAvantLicence: MOIS_AVANT_LICENCE,
};

/* UN DOCUMENT-OBJET, comme les fiches et le règlement : après une
   réinitialisation totale, les collections repartent vides, et la Maison
   n'aurait plus de terme à porter sur un contrat. */
export const contratsStore = createStore<EtatDesContrats>('mnd_reglages_contrats', {
  image: { publies: [IMAGE_V1] },
  prestataire: { publies: [PRESTATAIRE_V1] },
  formation: { publies: [FORMATION_V1] },
});

export const useReglagesContrats = () => useStore(contratsStore);

/** ══ CE QU'UN NOMBRE NE PEUT PAS ÊTRE ═══════════════════════════════
    Ces bornes ne sont pas de la coquetterie de saisie. Un droit à l'image de
    quatre-vingt-dix-neuf ans ne vaut rien devant un juge : un consentement
    sans terme réel n'est pas un consentement. Un non-démarchage de cinq ans
    empêche quelqu'un de gagner sa vie, et ce qui est excessif tombe en entier
    plutôt que d'être réduit — la Maison perdrait la protection qu'elle
    croyait acheter. L'écran refuse donc, et dit pourquoi. */
export const BORNES = {
  /* Dix ans est déjà très long pour l'image d'une personne. */
  imageMois: { min: 6, max: 120 },
  /* Au-delà de deux ans, un non-démarchage cesse d'être proportionné. */
  nonDemarchageMois: { min: 0, max: 24 },
  /* Payer un prestataire à plus de soixante jours n'est plus un délai, c'est
     une avance de trésorerie qu'on lui demande. */
  reglementJours: { min: 0, max: 60 },
  licenceMois: { min: 0, max: 60 },
} as const;

const horsBornes = (v: number, b: { min: number; max: number }): boolean =>
  !Number.isFinite(v) || v < b.min || v > b.max;

export const pourquoiImageImpossible = (r: ReglageImage): string | undefined => {
  if (horsBornes(r.mois, BORNES.imageMois)) {
    return `La durée du droit à l’image se compte entre ${BORNES.imageMois.min} et ${BORNES.imageMois.max} mois. `
      + 'Un consentement sans terme réel n’est pas un consentement.';
  }
  return undefined;
};

export const pourquoiPrestataireImpossible = (r: ReglagePrestataire): string | undefined => {
  if (horsBornes(r.moisNonDemarchage, BORNES.nonDemarchageMois)) {
    return `Le non-démarchage se compte entre ${BORNES.nonDemarchageMois.min} et ${BORNES.nonDemarchageMois.max} mois. `
      + 'Au-delà, il empêche quelqu’un de gagner sa vie, et ce qui est excessif tombe en entier.';
  }
  if (horsBornes(r.joursDeReglement, BORNES.reglementJours)) {
    return `Le délai de règlement se compte entre ${BORNES.reglementJours.min} et ${BORNES.reglementJours.max} jours.`;
  }
  return undefined;
};

export const pourquoiFormationImpossible = (r: ReglageFormation): string | undefined => {
  if (horsBornes(r.moisAvantLicence, BORNES.licenceMois)) {
    return `Le délai avant la licence se compte entre ${BORNES.licenceMois.min} et ${BORNES.licenceMois.max} mois.`;
  }
  return undefined;
};

/** ══ CE QU'UNE NOUVELLE VERSION NE FAIT PAS ═════════════════════════
    Rendu à l'écran de publication. On le dit parce que c'est exactement
    l'inverse du règlement, et que confondre les deux ferait soit rappeler des
    gens pour rien, soit croire qu'un terme signé s'est allongé tout seul. */
export const CE_QUE_LA_VERSION_NE_FAIT_PAS =
  'Les contrats déjà signés gardent leur version et leurs termes. Un contrat est signé par '
  + 'deux parties : la Maison ne peut pas en changer les termes après coup, et personne n’est '
  + 'à faire resigner. Seuls les contrats établis à partir d’aujourd’hui porteront celle-ci.';
