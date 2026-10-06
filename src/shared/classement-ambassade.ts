import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { ClassementAmbassade } from './parrainage-pur';

/* LE CLASSEMENT DES AMBASSADRICES — 28 septembre 2026. Écrit par le Trône
   (useParrainageVivant), lu par Ma Couronne : un prénom, un rang, des
   nombres, dix lignes au plus. La migration 0111 le rend lisible aux seules
   clientes connectées (jamais au site public) ; il reste vide tant que la
   Maison n'a pas allumé « Classement visible dans Ma Couronne ». */
export const CLASSEMENT_VIDE: ClassementAmbassade = { mois: '', lignes: [] };
export const classementStore = createStore<ClassementAmbassade>('mnd_classement_ambassade', CLASSEMENT_VIDE);
export const useClassement = () => useStore(classementStore);
bindDocument(classementStore, 'mnd_classement_ambassade');
