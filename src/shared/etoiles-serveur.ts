/* LE BOUTON « DONNER MES ÉTOILES » PARLE À LA MAISON — 22 novembre 2026.
   La cliente n'a pas de compte : la fonction Edge `avis-google` reconnaît le
   jeton de son bouton, note le toucher sur sa demande et rend le lien d'avis
   de la Maison, le seul qu'elle rende jamais. Voir etoiles-pur.ts. */

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** Le toucher : le lien de Google (en https, sinon rien), ou pourquoi il manque. */
export async function toucheLesEtoiles(jeton: string): Promise<{ lien?: string; erreur?: string }> {
  if (!URL_PROJET) return { erreur: 'hors_ligne' };
  try {
    const r = await fetch(`${URL_PROJET}/functions/v1/avis-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLE_ANON, Authorization: `Bearer ${CLE_ANON}` },
      body: JSON.stringify({ action: 'etoiles', jeton }),
    });
    const j = (await r.json().catch(() => ({}))) as { lien?: unknown; erreur?: unknown };
    const lien = typeof j.lien === 'string' && j.lien.startsWith('https://') ? j.lien : '';
    return lien ? { lien } : { erreur: typeof j.erreur === 'string' ? j.erreur : `http_${r.status}` };
  } catch {
    return { erreur: 'reseau' };
  }
}
