import { useEffect, useRef } from 'react';
import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { demandeAClaude } from './ia-maison';
import {
  BROUILLONS_PAR_OUVERTURE, JETONS_DE_LA_REPONSE, SCHEMA_DE_LA_REPONSE, consigneDeLaReponse, idDeLAvis, lectureDeLaReponse,
  messagePourLAvis, prochainsAFaire, type AvisAvecReponse, type BrouillonDAvis, type BrouillonsDAvis,
} from './ia-avis-pur';

/* ══ LES BROUILLONS DE RÉPONSE AUX AVIS, CÔTÉ TRÔNE — 19 octobre 2026 ═══
   Les règles vivent dans `ia-avis-pur` ; ici le document synchronisé et
   les gestes. Un seul document, `mnd_ia_avis_brouillons`, par identifiant
   d'avis (la clé du choix du site) : la proposition, sa langue, quand, par
   quel modèle ; « écartée », « collée », le verrou doux, le dernier échec.

   À L'OUVERTURE DE L'ÉCRAN DES AVIS, les avis sans réponse et sans
   brouillon reçoivent leur proposition : UN appel à la fois, cinq par
   ouverture au plus, jamais deux fois le même identifiant (le verrou
   `enCours` est posé dans le document AVANT l'appel : un autre poste ouvert
   en même temps le voit et passe). Rien ne part vers Google : la Maison
   copie, puis colle elle-même. */

export const brouillonsDAvisStore = createStore<BrouillonsDAvis>('mnd_ia_avis_brouillons', {});
bindDocument(brouillonsDAvisStore, 'mnd_ia_avis_brouillons');
export const useBrouillonsDAvis = () => useStore(brouillonsDAvisStore);

const maintenant = () => new Date().toISOString();

/** Changer un brouillon : les champs à `undefined` disparaissent (le
    document reste propre, sans clés vides). */
function touche(id: string, champs: Partial<BrouillonDAvis>): void {
  brouillonsDAvisStore.set((prev) => {
    const avant = prev[id] ?? {};
    const apres: BrouillonDAvis = { ...avant };
    for (const [k, v] of Object.entries(champs) as [keyof BrouillonDAvis, unknown][]) {
      if (v === undefined) delete apres[k];
      else (apres as Record<string, unknown>)[k] = v;
    }
    return { ...prev, [id]: apres };
  });
}

export type ResultatDeProposition = { ok: true } | { ok: false; erreur: string; message: string };

/** DEMANDER UNE PROPOSITION À CLAUDE pour un avis, et la garder si elle
    tient la relecture. Le verrou se pose avant l'appel, tombe après. */
export async function proposeUneReponse(avis: AvisAvecReponse): Promise<ResultatDeProposition> {
  const id = idDeLAvis(avis);
  touche(id, { enCours: maintenant() });
  const r = await demandeAClaude<{ langue?: unknown; reponse?: unknown }>({
    chantier: 'avis',
    usage: 'texte',
    systeme: consigneDeLaReponse(),
    messages: [{ role: 'user', content: messagePourLAvis(avis) }],
    schema: SCHEMA_DE_LA_REPONSE,
    maxTokens: JETONS_DE_LA_REPONSE,
  });
  if (!r.ok) {
    touche(id, { enCours: undefined, echoueLe: maintenant() });
    return { ok: false, erreur: r.erreur, message: r.message };
  }
  const lu = lectureDeLaReponse(r.data, avis);
  if (!lu) {
    touche(id, { enCours: undefined, echoueLe: maintenant() });
    return { ok: false, erreur: 'lecture', message: 'La proposition de Claude n’a pas tenu la relecture (un prix, « salon », ou trop longue) : demandez-en une autre.' };
  }
  touche(id, { reponse: lu.reponse, langue: lu.langue, le: maintenant(), modele: r.modele, enCours: undefined, echoueLe: undefined, ecarte: undefined });
  return { ok: true };
}

/** Elle retouche le texte avant de le copier : c'est sa réponse. */
export const changeLeBrouillon = (id: string, reponse: string): void => touche(id, { reponse });
/** « Écarter » : pas de réponse à celui-ci ; l'avis reste compté sans réponse. */
export const ecarteLeBrouillon = (id: string): void => touche(id, { ecarte: true, reponse: undefined, langue: undefined, le: undefined, modele: undefined });
export const reprendsLeBrouillon = (id: string): void => touche(id, { ecarte: undefined, echoueLe: undefined });
/** « J'ai collé la réponse sur Google » : l'avis sort des « sans réponse ».
    C'est elle qui le dit ; le Trône ne le vérifie pas chez Google. */
export const marqueCollee = (id: string): void => touche(id, { publieeLe: maintenant() });
export const annuleCollee = (id: string): void => touche(id, { publieeLe: undefined });

/** PRÉPARER LES BROUILLONS À L'OUVERTURE : un appel à la fois, cinq par
    ouverture (par montage de l'écran), jamais deux fois le même identifiant
    tant que la page n'est pas rechargée. Un refus de la porte (budget,
    fonction absente, hors ligne) vaut pour tous les avis : on s'arrête. */
const demandesDeCettePage = new Set<string>();
export function usePrepareLesBrouillons(avis: readonly AvisAvecReponse[] | null, actif: boolean): void {
  const faites = useRef(0);
  useEffect(() => {
    if (!actif || !avis || avis.length === 0) return;
    let vivant = true;
    void (async () => {
      const reste = BROUILLONS_PAR_OUVERTURE - faites.current;
      if (reste <= 0) return;
      const ids = prochainsAFaire(avis, brouillonsDAvisStore.get(), Date.now(), reste).filter((id) => !demandesDeCettePage.has(id));
      for (const id of ids) {
        if (!vivant) return;
        const a = avis.find((x) => idDeLAvis(x) === id);
        if (!a) continue;
        demandesDeCettePage.add(id);
        faites.current += 1;
        const r = await proposeUneReponse(a);
        if (!r.ok && r.erreur !== 'lecture' && r.erreur !== 'claude') break;
      }
    })();
    return () => { vivant = false; };
  }, [avis, actif]);
}
