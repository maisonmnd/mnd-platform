import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import {
  avecLaNote, estUnNomDeModeleMeta, etatDuModeleMeta, etatsConnus, modelesMetaLus,
  type DocumentDesModelesMeta, type EtatDuModeleMeta, type ModelesMetaLus,
} from './modeles-meta-pur';

export { ETATS_DU_MODELE, type EtatDuModeleMeta, type NoteDuModele } from './modeles-meta-pur';

/* ══ LE REGISTRE DES MODÈLES META · 27 octobre 2026, lot 3 ══════════════════
   Spécification de l'Assistant Maison (§5.5, « Qui écrit seul » et « Ses
   modèles chez Meta ») : l'état d'un modèle WhatsApp (déposé, approuvé,
   refusé) n'existait nulle part dans le dépôt ; Meta ne le dit à aucune
   fonction. La direction le NOTE ici, à la main, le jour où elle le lit dans
   le gestionnaire WhatsApp. Un modèle jamais noté est « à déposer » : c'est
   la vérité par défaut, jamais une promesse.

   Un seul document, `mnd_modeles_meta`, lié comme les autres réglages de la
   Maison (`bindDocument`) : chaque poste le lit, la direction l'écrit. Pour
   les huit modèles de l'Assistant, « approuvé » a une conséquence de plus :
   `mnd_gerard.approuves` (gerard.ts, `marqueLeModeleApprouve`) fait partir
   le modèle seul au passage du matin. L'écran qui note l'état écrit les
   deux, pour qu'une seule vérité gouverne le départ.

   LES DEUX FORMES ENSEMBLE (18 novembre 2026) : le même document porte aussi
   la liste que rend Meta à « Relire chez Meta » (fonction `modeles-meta`).
   Une note s'AJOUTE à cette liste, elle ne la remplace plus ; un état se lit
   de l'une ou de l'autre, la plus récente disant vrai. La règle est dans
   `modeles-meta-pur.ts`, recopiée dans les deux fonctions qui lisent ou
   écrivent ce document. */

export const ETAT_DU_MODELE_DIT: Record<EtatDuModeleMeta, string> = {
  'a-deposer': 'à déposer', depose: 'déposé', approuve: 'approuvé', refuse: 'refusé',
};

/** Le document tel qu'il s'écrit ; il peut arriver d'avant sous une autre forme, d'où `unknown` à la lecture. */
export type RegistreDesModelesMeta = DocumentDesModelesMeta;
export const REGISTRE_VIDE: RegistreDesModelesMeta = {};

export const modelesMetaStore = createStore<RegistreDesModelesMeta>('mnd_modeles_meta', REGISTRE_VIDE);
export const useModelesMeta = () => useStore(modelesMetaStore);
bindDocument(modelesMetaStore, 'mnd_modeles_meta');

/** Le document lu sans confiance, ses deux formes ensemble (la liste de Meta, les notes). */
export const registreLu = (brut: unknown): ModelesMetaLus => modelesMetaLus(brut);

/** L'état d'un modèle : lu chez Meta ou noté, le plus récent ; sinon « à déposer ». */
export const etatDuModele = (registre: ModelesMetaLus, nom: string): EtatDuModeleMeta => etatDuModeleMeta(registre, nom);

/** Ce que le compte (`quiEcritSeul`, rapporte-pur) lit : nom → état connu.
    Un « à déposer » n'y figure pas, le compte le tient pour non approuvé. */
export const etatsNotes = (registre: ModelesMetaLus): Partial<Record<string, 'depose' | 'approuve' | 'refuse'>> => etatsConnus(registre);

/** La direction note l'état d'un modèle, le jour où elle le lit chez Meta. La
    note s'ajoute au document : la liste de Meta et les autres notes restent.
    « À déposer » efface la note de ce modèle. */
export function noteLeModele(nom: string, etat: EtatDuModeleMeta, parQui: string): void {
  if (!estUnNomDeModeleMeta(nom)) return;
  const le = new Date().toISOString();
  modelesMetaStore.set((prev) => avecLaNote(prev, nom, etat, parQui, le));
}
