import { useMemo } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import {
  FICHES_DE_DEPART, copieDuContenu, fichesSures, valideLaFiche,
  type ContenuDeFiche, type FicheDeProcedure, type LesFiches,
} from './fiches-de-procedure-pur';

/* ══ LES FICHES DE PROCÉDURE, CÔTÉ TRÔNE — 25 novembre 2026 ══════════════
   Un seul document, `mnd_fiches_de_procedure` : une fiche par prestation du
   catalogue, son brouillon et sa version validée. Toute l'équipe le LIT (la
   fenêtre du rendez-vous, « Voir le protocole ») ; la direction seule
   l'ÉCRIT, et la base le garantit (0244) : un poste de l'équipe ne peut ni
   corriger une fiche ni en valider une, même par un Trône resté ouvert.

   Au premier poste de la direction qui s'ouvre, le serveur reçoit la semence
   (bindDocument amorce un document absent) : la fiche Sówà, en brouillon.
   Les règles vivent dans `fiches-de-procedure-pur`. */

export const CLE_DES_FICHES_DE_PROCEDURE = 'mnd_fiches_de_procedure';
/* La clé du magasin s'écrit en toutes lettres : `verifie-cles-uniques` lit chaque `createStore` (une clé, un magasin). */
export const fichesDeProcedureStore = createStore<LesFiches>('mnd_fiches_de_procedure', FICHES_DE_DEPART());
bindDocument(fichesDeProcedureStore, CLE_DES_FICHES_DE_PROCEDURE);

/** Les fiches, toujours sûres à lire, même si le document arrive incomplet. */
export function useFichesDeProcedure(): LesFiches {
  const [brut] = useStore(fichesDeProcedureStore);
  return useMemo(() => fichesSures(brut), [brut]);
}

/** ENREGISTRER LE BROUILLON d'une fiche (la direction). La version validée,
    elle, ne bouge pas : l'équipe continue de lire ce qui a été validé. */
export function enregistreLeBrouillon(
  fiche: FicheDeProcedure, contenu: ContenuDeFiche, titre: string, par: string,
): void {
  fichesDeProcedureStore.set((avant) => {
    const sures = fichesSures(avant);
    const enPlace = sures[fiche.serviceId];
    return {
      ...sures,
      [fiche.serviceId]: {
        ...(enPlace ?? fiche),
        ...(fiche.code ? { code: fiche.code } : {}),
        titre: titre.trim() || fiche.titre,
        brouillon: copieDuContenu(contenu),
        brouillonLe: new Date().toISOString(),
        ...(par.trim() ? { brouillonPar: par.trim() } : {}),
      },
    };
  });
}

/** VALIDER la fiche telle qu'elle est enregistrée. Rend le refus, ou rien. */
export function valideLaFicheEnregistree(serviceId: string, par: string): string | null {
  const fiche = fichesSures(fichesDeProcedureStore.get())[serviceId];
  if (!fiche) return 'Cette fiche n’est pas encore enregistrée.';
  const r = valideLaFiche(fiche, par, new Date().toISOString());
  if ('refus' in r) return r.refus;
  fichesDeProcedureStore.set((avant) => ({ ...fichesSures(avant), [serviceId]: r.fiche }));
  return null;
}
