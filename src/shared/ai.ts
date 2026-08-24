import { supabase, isRemote } from './supabase';

/* IA de la maison — suggestions à la création d'une fiche cliente.

   La clé Anthropic ne vit PAS ici : Le Trône est un paquet statique, tout ce
   qu'il embarque est lisible par n'importe qui. L'appel passe par la fonction
   Edge `suggest-client`, qui garde la clé et vérifie que l'appelant est bien du
   personnel. Sans backend, la suggestion est simplement indisponible. */

export type Suggestion = {
  personaId: string;
  segments: string[];
  why: string;
};

export type SuggestInput = {
  name: string;
  city?: string;
  email?: string;
  phone?: string;
  crownStyle?: string;
  lockCount?: number;
  crownSince?: string;
  birthday?: string;
  country?: string;
  note?: string;
};

/** L'IA est-elle joignable ? (backend configuré) */
export const aiEnabled = (): boolean => isRemote;

/** Propose un persona et des segments pour une fiche en cours de saisie.
    Lève une erreur lisible : l'appelant l'affiche telle quelle. */
export async function suggestClient(
  fiche: SuggestInput,
  personas: { id: string; name: string; essence: string }[],
  segments: string[],
): Promise<Suggestion> {
  if (!supabase) throw new Error('Backend non configuré.');
  const { data, error } = await supabase.functions.invoke('suggest-client', {
    body: { fiche, personas, segments },
  });
  if (error) throw new Error(aiMessage(error));
  const d = data as Partial<Suggestion> & { error?: string };
  if (d?.error) throw new Error(aiMessage(d.error));
  return {
    personaId: d?.personaId ?? '',
    segments: Array.isArray(d?.segments) ? d.segments : [],
    why: d?.why ?? '',
  };
}

/** Traduit les échecs de la fonction en messages pour la maîtresse de maison. */
function aiMessage(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (raw.includes('forbidden')) return 'Réservé au personnel connecté.';
  if (raw.includes('refusal')) return 'L’IA a préféré ne pas répondre, renseignez la fiche à la main.';
  if (raw.includes('upstream') || raw.includes('502')) return 'L’IA est injoignable, réessayez dans un instant.';
  if (raw.includes('bad request')) return 'Créez d’abord un persona et un segment.';
  return 'Suggestion impossible, renseignez la fiche à la main.';
}
