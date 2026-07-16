import { createStore, useStore } from './store';
import { bindDocument } from './sync';

/* Les quatre temps — le protocole de la Maison, et son suivi cliente par cliente.

   Les noms et l'ordre font foi ici : le tunnel de La Consultation compose son
   protocole à partir d'un diagnostic (`protocoleTemps`), le Certificat les grave,
   Le Trône suit qui en est où. Ce module ne porte QUE le suivi — pas la
   recommandation produit, qui dépend du diagnostic et reste à la Consultation.

   Suivi = document `mnd_client_temps`, réservé au personnel : la RLS de
   production n'ouvre à la cliente qu'une liste blanche de clés, celle-ci n'en
   fait pas partie. C'est voulu — le suivi est un regard de la maison. */

export type TempsKey = 'purifier' | 'nourrir' | 'sceller' | 'couronner';

export type Temps = { no: string; key: TempsKey; name: string; essence: string };

/** Les quatre temps, dans l'ordre rituel. */
export const QUATRE_TEMPS: Temps[] = [
  { no: '01', key: 'purifier', name: 'Purifier', essence: 'Laver, clarifier, préparer un terrain sain.' },
  { no: '02', key: 'nourrir', name: 'Nourrir', essence: 'Hydrater la fibre, fortifier la racine.' },
  { no: '03', key: 'sceller', name: 'Sceller', essence: 'Fixer le soin, verrouiller l’hydratation.' },
  { no: '04', key: 'couronner', name: 'Couronner', essence: 'Définir, protéger, faire rayonner la mèche.' },
];

/** Date ISO (AAAA-MM-JJ) du dernier passage par chaque temps. Absent = pas encore. */
export type TempsProgress = Partial<Record<TempsKey, string>>;

export const clientTempsStore = createStore<Record<string, TempsProgress>>('mnd_client_temps', {});
bindDocument(clientTempsStore, 'mnd_client_temps');
export const useClientTemps = () => useStore(clientTempsStore);

/** Suivi d'une cliente (jamais nul — une fiche sans passage rend un objet vide). */
export const tempsOf = (all: Record<string, TempsProgress>, clientId: string): TempsProgress =>
  all[clientId] ?? {};

/** Marque un temps à une date, ou le retire si `date` est vide. */
export function setTemps(clientId: string, key: TempsKey, date: string): void {
  if (!clientId) return;
  clientTempsStore.set((prev) => {
    const cur: TempsProgress = { ...(prev[clientId] ?? {}) };
    if (date) cur[key] = date;
    else delete cur[key];
    /* On ne garde pas de coquille vide : une fiche sans aucun temps disparaît
       du document plutôt que d'y laisser un objet mort. */
    if (Object.keys(cur).length === 0) {
      const { [clientId]: _drop, ...rest } = prev;
      return rest;
    }
    return { ...prev, [clientId]: cur };
  });
}

/** Nombre de temps franchis (0–4). */
export const tempsDone = (p: TempsProgress): number =>
  QUATRE_TEMPS.reduce((n, t) => n + (p[t.key] ? 1 : 0), 0);

/** Le temps en cours : le premier non franchi, ou null si la couronne est complète. */
export const nextTemps = (p: TempsProgress): Temps | null =>
  QUATRE_TEMPS.find((t) => !p[t.key]) ?? null;
