import { useMemo } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import {
  copieDuContenu, ficheAllegee, fichesSures, valideLaFiche,
  type ContenuDeFiche, type FicheDeProcedure, type LesFiches, type LesFichesGardees,
} from './fiches-de-procedure-pur';

/* ══ LES FICHES DE PROCÉDURE, CÔTÉ TRÔNE — 25 novembre 2026 ══════════════
   Un seul document, `mnd_fiches_de_procedure` : une fiche par prestation du
   catalogue, sa version validée et, quand la direction corrige, son
   brouillon. Toute l'équipe le LIT (la fenêtre du rendez-vous, « Voir le
   protocole ») ; la direction seule l'ÉCRIT, et la base le garantit (0244) :
   un poste de l'équipe ne peut ni corriger une fiche ni en valider une, même
   par un Trône resté ouvert.

   LE DOCUMENT NAÎT VIDE et se remplit par les réglages de
   `scripts/fiches-de-procedure/` (les fiches écrites, relues et validées par
   la direction), puis par ce qu'elle corrige ici. Il se garde au plus léger
   (`ficheAllegee`) : chaque poste le porte en mémoire. Les règles vivent dans
   `fiches-de-procedure-pur`. */

export const CLE_DES_FICHES_DE_PROCEDURE = 'mnd_fiches_de_procedure';
/* La clé du magasin s'écrit en toutes lettres : `verifie-cles-uniques` lit chaque `createStore` (une clé, un magasin). */
export const fichesDeProcedureStore = createStore<LesFichesGardees>('mnd_fiches_de_procedure', {});
bindDocument(fichesDeProcedureStore, CLE_DES_FICHES_DE_PROCEDURE);

/** Les fiches, toujours sûres à lire, même si le document arrive incomplet. */
export function useFichesDeProcedure(): LesFiches {
  const [brut] = useStore(fichesDeProcedureStore);
  return useMemo(() => fichesSures(brut), [brut]);
}

/** Ce que le document garde : chaque fiche au plus léger. */
const aGarder = (fiches: LesFiches): LesFichesGardees =>
  Object.fromEntries(Object.entries(fiches).map(([id, f]) => [id, ficheAllegee(f)]));

/** ENREGISTRER LE BROUILLON d'une fiche (la direction). La version validée,
    elle, ne bouge pas : l'équipe continue de lire ce qui a été validé. */
export function enregistreLeBrouillon(
  fiche: FicheDeProcedure, contenu: ContenuDeFiche, titre: string, par: string,
): void {
  fichesDeProcedureStore.set((avant) => {
    const sures = fichesSures(avant);
    const enPlace = sures[fiche.serviceId];
    return aGarder({
      ...sures,
      [fiche.serviceId]: {
        ...(enPlace ?? fiche),
        ...(fiche.code ? { code: fiche.code } : {}),
        titre: titre.trim() || fiche.titre,
        brouillon: copieDuContenu(contenu),
        brouillonLe: new Date().toISOString(),
        ...(par.trim() ? { brouillonPar: par.trim() } : {}),
      },
    });
  });
}

/** VALIDER la fiche telle qu'elle est enregistrée. Rend le refus, ou rien. */
export function valideLaFicheEnregistree(serviceId: string, par: string): string | null {
  const fiche = fichesSures(fichesDeProcedureStore.get())[serviceId];
  if (!fiche) return 'Cette fiche n’est pas encore enregistrée.';
  const r = valideLaFiche(fiche, par, new Date().toISOString());
  if ('refus' in r) return r.refus;
  fichesDeProcedureStore.set((avant) => aGarder({ ...fichesSures(avant), [serviceId]: r.fiche }));
  return null;
}
