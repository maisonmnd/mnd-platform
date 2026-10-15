import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { supabase } from './supabase';
import { COMPARTIMENT_DES_PHOTOS, TABLE_DES_REPONSES, TABLE_DES_SIGNALEMENTS, type Signalement } from './entre-deux-pur';

/* ══ ENTRE DEUX SÉANCES, CÔTÉ TRÔNE — 15 octobre 2026 ══════════════════
   Les signalements (0132) et les réponses de la Maison, en direct. Ce module
   n'est lu QUE par le Trône : il lie les tables au magasin et réécrit par
   `upsert`, ce que le personnel a le droit de faire. Ma Couronne passe par
   `entre-deux-couronne.ts`, qui dépose et relit les siens, sans plus. */

export type ReponseEntreDeux = {
  id: string; // la clé du souci
  branchId?: string;
  /** Le texte en cours, brouillon ou validé. */
  texte: string;
  /** Le texte que les clientes reçoivent : le dernier validé. Une retouche
      ne le remplace qu'à la validation suivante. */
  texteValide?: string;
  valideeLe?: string;
  validePar?: string;
};

const enListe = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object') : []);

export const signalementsStore = createStore<Signalement[]>('mnd_signalements', []);
bindCollection(signalementsStore, TABLE_DES_SIGNALEMENTS);
export const useSignalements = (): Signalement[] => enListe<Signalement>(useStore(signalementsStore)[0]);

export const reponsesEntreDeuxStore = createStore<ReponseEntreDeux[]>('mnd_entre_deux_reponses', []);
bindCollection(reponsesEntreDeuxStore, TABLE_DES_REPONSES);
export const useReponsesEntreDeux = (): ReponseEntreDeux[] => enListe<ReponseEntreDeux>(useStore(reponsesEntreDeuxStore)[0]);

export function retoucheLeSignalement(s: Signalement, patch: Partial<Signalement>): void {
  signalementsStore.set((prev) => enListe<Signalement>(prev).map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
}
export function ajouteUnSignalement(s: Signalement): void {
  signalementsStore.set((prev) => [s, ...enListe<Signalement>(prev).filter((x) => x.id !== s.id)]);
}
export function poseLaReponse(r: ReponseEntreDeux): void {
  reponsesEntreDeuxStore.set((prev) => {
    const l = enListe<ReponseEntreDeux>(prev);
    return l.some((x) => x.id === r.id) ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r];
  });
}

/** Une adresse de lecture d'une heure pour la photo d'un signalement. */
export async function adresseDeLaPhoto(chemin: string): Promise<string | null> {
  if (!supabase || !chemin) return null;
  const { data, error } = await supabase.storage.from(COMPARTIMENT_DES_PHOTOS).createSignedUrl(chemin, 3600);
  return error ? null : data?.signedUrl ?? null;
}
