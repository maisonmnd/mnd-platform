import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { demandeAClaude } from './ia-maison';
import {
  CHANTIER_FICHE_DU_JOUR, CLE_DES_FICHES_DU_JOUR, JETONS_DE_LA_FICHE, SCHEMA_DE_LA_FICHE, USAGE_FICHE_DU_JOUR,
  consigneDeLaFiche, fichesPurgees, lectureDeLaFiche,
  type FicheGardee, type FichesDuJour, type MatiereDeLaFiche,
} from './ia-fiche-du-jour-pur';

/* ══ LA FICHE DU JOUR, CÔTÉ TRÔNE — 19 octobre 2026 ═══════════════════════
   Les règles vivent dans `ia-fiche-du-jour-pur` ; ici, le magasin et
   l'appel. Les fiches écrites vivent dans UN document synchronisé
   (`mnd_ia_fiches_du_jour`, table `documents`, ouverte au personnel par
   0130) : le Carnet d'un poste et le Calendrier d'un autre lisent la même
   fiche, et personne ne paie deux fois la même journée.

   « Écrite à ce moment-là, gardée pour la journée. Rien ne tourne la nuit. »
   Ce module n'a ni minuterie ni réveil : il ne fait quelque chose que quand
   une fiche de rendez-vous s'ouvre. */

export const fichesDuJourStore = createStore<FichesDuJour>(CLE_DES_FICHES_DU_JOUR, {});
bindDocument(fichesDuJourStore, CLE_DES_FICHES_DU_JOUR);
export const useFichesDuJour = () => useStore(fichesDuJourStore);

export function gardeLaFiche(apptId: string, f: FicheGardee): void {
  fichesDuJourStore.set((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [apptId]: f }));
}

/** À l'ouverture : les fiches de plus de sept jours s'en vont. Rien à
    purger, rien n'est écrit. */
export function purgeLesFiches(aujourdhui: string): void {
  const avant = fichesDuJourStore.get();
  const apres = fichesPurgees(avant, aujourdhui);
  if (apres !== avant) fichesDuJourStore.set(apres);
}

export type ReponseDeLaFiche =
  | { ok: true; lignes: string[]; modele: string }
  | { ok: false; message: string };

/** UN SEUL APPEL À LA FOIS PAR RENDEZ-VOUS. Deux fiches du même rendez-vous
    ouvertes en même temps (le Carnet et le Calendrier, un « Refaire » pressé
    deux fois) partagent la même promesse : le verrou vit ici, hors de
    l'écran, pour tenir même quand l'écran se ferme et se rouvre. */
const enCours = new Map<string, Promise<ReponseDeLaFiche>>();
export const ficheEnCours = (apptId: string): boolean => enCours.has(apptId);

export function demandeLaFiche(apptId: string, m: MatiereDeLaFiche): Promise<ReponseDeLaFiche> {
  const deja = enCours.get(apptId);
  if (deja) return deja;
  const p = (async (): Promise<ReponseDeLaFiche> => {
    const r = await demandeAClaude<{ lignes?: unknown }>({
      chantier: CHANTIER_FICHE_DU_JOUR,
      usage: USAGE_FICHE_DU_JOUR,
      systeme: consigneDeLaFiche(),
      messages: [{ role: 'user', content: JSON.stringify(m) }],
      schema: SCHEMA_DE_LA_FICHE,
      maxTokens: JETONS_DE_LA_FICHE,
    });
    if (!r.ok) return { ok: false, message: r.message };
    /* Ce qui revient est RELU : le reste dû donné est le seul prix admis. */
    return { ok: true, lignes: lectureDeLaFiche(r.data, m.reste.map((x) => x.xof)), modele: r.modele };
  })().finally(() => { enCours.delete(apptId); });
  enCours.set(apptId, p);
  return p;
}
