/* LA RAISON D'UN REFUS DU SERVEUR, LUE POUR DE BON — 10 octobre 2026.

   `demande-submit` refuse en non-2xx : `rate_limited` en 429, `telephone` en
   400, `creneau_pris` et ses frères en 409, et la raison est dans le CORPS,
   `{ error: '…' }`. Or `supabase.functions.invoke` rend alors `data = null`
   et une erreur dont le message est toujours le même (« Edge Function returned
   a non-2xx status code ») : le corps n'est lisible que par `error.context`,
   la réponse elle-même. Jusqu'à la revue de code du 10 octobre, Réserver et
   Offrir lisaient `data.error`, toujours vide : deux clientes visaient la même
   heure, la seconde lisait « L'envoi n'a pas abouti » au lieu de « Cette
   heure vient d'être prise », et la liste n'était pas rafraîchie.

   Même lecture que `motifDuRefus` (src/shared/whatsapp.ts), qui ne s'importe
   pas d'ici : il tire le client du Trône. Ce module est PUR, le harnais
   `verifie-revue-couronne-site` l'éprouve avec une fausse réponse. */

export async function raisonDuRefus(
  data: unknown,
  error: unknown,
): Promise<string> {
  const dansLesDonnees = (data as { error?: unknown } | null | undefined)?.error;
  if (typeof dansLesDonnees === 'string' && dansLesDonnees) return dansLesDonnees;
  const generique = (error as { message?: string } | null | undefined)?.message ?? '';
  const reponse = (error as { context?: { json?: () => Promise<unknown> } } | null | undefined)?.context;
  if (!reponse || typeof reponse.json !== 'function') return generique;
  try {
    const corps = (await reponse.json()) as { error?: unknown; erreur?: unknown } | null;
    const dit = corps?.error ?? corps?.erreur;
    return typeof dit === 'string' && dit ? dit : generique;
  } catch {
    return generique;
  }
}
