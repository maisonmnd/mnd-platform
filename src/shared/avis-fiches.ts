import { createStore, useStore } from './store';
import { bindDocument, documentDescendu } from './sync';
import { CLE_DES_LIENS, type LienDAvis, type LiensDesAvis } from './avis-fiches-pur';

/* ══ LES LIENS AVIS ↔ FICHE, CÔTÉ TRÔNE — 20 octobre 2026 ═══════════════
   Les règles vivent dans `avis-fiches-pur` ; ici le document synchronisé
   et les trois gestes : « C'est elle » (relier), « Aucune fiche », « Ce
   n'est pas elle » (délier). Un seul document, `mnd_avis_fiches`, par
   identifiant d'avis (la clé du choix du site et des brouillons).

   ON ATTEND QUE LE DOCUMENT SOIT DESCENDU, comme les brouillons : sur un
   poste neuf, le magasin vaut `{}` tant que le serveur n'a pas parlé, et
   le document s'écrit en entier (dernier geste gagnant) ; un lien posé
   avant la descente effacerait au serveur ceux des autres postes. */

/* La clé s'écrit EN TOUTES LETTRES (garde verifie-cles-uniques : deux
   magasins sur une même clé n'en font qu'un) ; le banc vérifie qu'elle est
   bien `CLE_DES_LIENS`. */
export const liensDesAvisStore = createStore<LiensDesAvis>('mnd_avis_fiches', {});
bindDocument(liensDesAvisStore, 'mnd_avis_fiches');
export const useLiensDesAvis = () => useStore(liensDesAvisStore);

/** Le geste a-t-il pu se poser ? Non tant que le document n'est pas descendu. */
export type IssueDuLien = 'fait' | 'attente';

function pose(id: string, lien: LienDAvis | undefined): IssueDuLien {
  if (!documentDescendu(CLE_DES_LIENS)) return 'attente';
  liensDesAvisStore.set((prev) => {
    const suivant = { ...prev };
    if (lien) suivant[id] = lien;
    else delete suivant[id];
    return suivant;
  });
  return 'fait';
}

/** « C'est elle » : l'avis est relié à cette fiche. */
export const relieLAvis = (id: string, clientId: string, par: string): IssueDuLien =>
  pose(id, { clientId, ...(par ? { par } : {}), le: new Date().toISOString() });
/** « Aucune fiche » : la Maison dit qu'aucune cliente ne correspond. */
export const marqueSansFiche = (id: string, par: string): IssueDuLien =>
  pose(id, { sansFiche: true, ...(par ? { par } : {}), le: new Date().toISOString() });
/** « Ce n'est pas elle » : le lien tombe, l'avis redevient à relier. */
export const delieLAvis = (id: string): IssueDuLien => pose(id, undefined);
