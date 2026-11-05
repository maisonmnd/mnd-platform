import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import type { ArretDAvance, PauseDuModele } from './arret-d-avance-pur';

/* ══ CE QUI VA PARTIR, AU TRÔNE — 5 novembre 2026 ═══════════════════════
   La règle vit dans `arret-d-avance-pur.ts` (la clé d'un message, la porte
   d'avance) et `ce-qui-va-partir-pur.ts` (la prévision des sept jours). Ici,
   ce que le Trône lit et écrit de la base (0158) :
     · LES MESSAGES ARRÊTÉS D'AVANCE (`envois_arretes`) : « Ne pas envoyer »
       pose `arreteLe` ; « Remettre » pose `remisLe`. Rien ne s'efface : la
       ligne dit toujours qui a arrêté et quand ;
     · LES MODÈLES EN PAUSE (`modeles_en_pause`) : l'interrupteur
       « En service / En pause ». Opale y écrit aussi, par le serveur, quand
       un modèle revient « non remis » cinq fois de suite.
   La base n'accepte l'écriture que de la direction (souverain ou gérant) ;
   l'écran ne montre les gestes qu'à elle (`useEstDirection`). */

export type ArretDuTrone = ArretDAvance & { id: string; branchId?: string; cle: string; quoi?: string };
export type PauseDuTrone = PauseDuModele & { id: string; branchId?: string; modele: string };

export const arretsStore = createStore<ArretDuTrone[]>('mnd_envois_arretes', []);
export const useArrets = () => useStore(arretsStore);
bindCollection(arretsStore, 'envois_arretes');

export const pausesStore = createStore<PauseDuTrone[]>('mnd_modeles_en_pause', []);
export const usePauses = () => useStore(pausesStore);
bindCollection(pausesStore, 'modeles_en_pause');

/** « NE PAS ENVOYER » : la clé arrêtée, par qui, quand ; `quoi` dit le message (sans nom). */
export function arreteLeMessage(o: { cle: string; par: string; quoi?: string; branchId?: string; maintenantIso?: string }): void {
  const le = o.maintenantIso ?? new Date().toISOString();
  arretsStore.set((prev) => {
    const avant = prev.find((a) => a.id === o.cle);
    const neuf: ArretDuTrone = {
      ...(avant ?? {}), id: o.cle, cle: o.cle, arreteLe: le, arretePar: o.par,
      ...(o.quoi ? { quoi: o.quoi } : {}), ...(o.branchId ? { branchId: o.branchId } : {}),
    };
    delete (neuf as { remisLe?: string }).remisLe;
    delete (neuf as { remisPar?: string }).remisPar;
    return [...prev.filter((a) => a.id !== o.cle), neuf];
  });
}

/** « REMETTRE » : l'arrêt reste écrit, `remisLe` le lève. */
export function remetLeMessage(o: { cle: string; par: string; maintenantIso?: string }): void {
  const le = o.maintenantIso ?? new Date().toISOString();
  arretsStore.set((prev) => prev.map((a) => (a.id === o.cle ? { ...a, remisLe: le, remisPar: o.par } : a)));
}

/** L'INTERRUPTEUR D'UN MODÈLE : en pause, ou repris. */
export function basculeLeModele(o: { modele: string; enPause: boolean; par: string; motif?: string; maintenantIso?: string }): void {
  const le = o.maintenantIso ?? new Date().toISOString();
  pausesStore.set((prev) => {
    const avant = prev.find((p) => p.id === o.modele);
    const neuf: PauseDuTrone = o.enPause
      ? { ...(avant ?? {}), id: o.modele, modele: o.modele, enPause: true, par: o.par, le, parOpale: false, ...(o.motif ? { motif: o.motif } : {}) }
      : { ...(avant ?? { id: o.modele, modele: o.modele }), id: o.modele, modele: o.modele, enPause: false, reprisPar: o.par, reprisLe: le };
    return [...prev.filter((p) => p.id !== o.modele), neuf];
  });
}
