import { supabase } from './supabase';
import { RITUEL_SEED } from './bilans';
import { INGREDIENTS } from '../apps/revelateur/communaute';
import { brouillonRelu, type BrouillonDeBilan, type ContexteDuBilan } from './bilan-assistant-pur';

/* L'ASSISTANT DES BILANS, CÔTÉ TRÔNE — 4 octobre 2026.

   Le patron de `ai.ts` : la clé Anthropic vit dans la fonction Edge
   `bilan-redige`, qui vérifie que l'appelant est du personnel. Ici on
   prépare ce qui part (le minimum, voir `contexteDuBilan`) et on RELIT ce
   qui revient (`brouillonRelu`) : une prestation retirée du catalogue entre
   l'appel et la remise ne devient jamais un bouton « Réserver » orphelin. */

export type DemandeAuBilan = 'rediger' | 'reformuler' | 'raccourcir';

export type ListesDeLaMaison = {
  prestations: { id: string; nom: string }[];
  formules: string[];
  produits: string[];
};

/** Les sept ingrédients, avec leur rôle et le mot de l'atelier : c'est ce
    qui fait la routine « à partir des ingrédients de la Maison ». */
export const INGREDIENTS_DU_BILAN = INGREDIENTS.map((i) => ({ slug: i.slug, nom: i.nom, role: i.role, note: i.note }));

/** Le nom d'un ingrédient, pour l'écran et le PDF. */
export const nomDeLIngredient = (slug: string): string =>
  INGREDIENTS.find((i) => i.slug === slug)?.nom ?? slug;

export async function redigeLeBilan(o: {
  demande: DemandeAuBilan;
  contexte: ContexteDuBilan;
  listes: ListesDeLaMaison;
  actuel?: BrouillonDeBilan;
}): Promise<BrouillonDeBilan> {
  if (!supabase) throw new Error('L’assistant demande le serveur de la Maison.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Hors ligne : l’assistant demande le réseau.');
  const { data, error } = await supabase.functions.invoke('bilan-redige', {
    body: {
      demande: o.demande,
      contexte: o.contexte,
      listes: { ...o.listes, ingredients: INGREDIENTS_DU_BILAN },
      ...(o.actuel ? { actuel: o.actuel } : {}),
    },
  });
  if (error) throw new Error(await messageDeLAssistant(error));
  const d = data as { brouillon?: unknown; error?: string };
  if (d?.error) throw new Error(await messageDeLAssistant(d.error));
  return brouillonRelu(d?.brouillon, {
    prestations: o.listes.prestations,
    ingredients: INGREDIENTS_DU_BILAN.map((i) => i.slug),
    rituelDefaut: RITUEL_SEED,
  });
}

/** Les échecs, dits pour le maître. Une fonction pas encore collée rend un
    404 : on le dit en clair, c'est le cas le plus probable au premier jour. */
async function messageDeLAssistant(e: unknown): Promise<string> {
  let raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.status === 'number') {
    if (ctx.status === 404) return 'L’assistant n’est pas encore installé : la fonction « bilan-redige » est à coller dans Supabase.';
    try { raw += ' ' + (await ctx.clone().text()).toLowerCase(); } catch { /* corps illisible */ }
  }
  /* UNE FONCTION ABSENTE NE REND PAS UN 404 LISIBLE — 4 octobre 2026 : la
     question préalable du navigateur (CORS) tombe sur un 404 sans en-têtes,
     et supabase-js ne dit que « Failed to send a request ». En ligne, c'est
     presque toujours la fonction pas encore collée : on le dit en clair. */
  if ((e as { name?: string })?.name === 'FunctionsFetchError' || raw.includes('failed to send')) {
    return 'L’assistant ne répond pas : la fonction « bilan-redige » n’est pas encore collée dans Supabase (dossier du bureau « A recoller - bilan de la seance »).';
  }
  if (raw.includes('forbidden')) return 'Réservé au personnel connecté.';
  if (raw.includes('refusal')) return 'L’assistant a préféré ne pas rédiger ce bilan, écrivez-le à la main.';
  if (raw.includes('bad request')) return 'Il manque le catalogue ou la note pour rédiger.';
  if (raw.includes('upstream') || raw.includes('502')) return 'L’assistant est injoignable, réessayez dans un instant.';
  return 'Le bilan n’a pas pu être rédigé, réessayez ou écrivez-le à la main.';
}
