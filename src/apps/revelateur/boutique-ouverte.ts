/* LA BOUTIQUE EST-ELLE OUVERTE ? — 22 octobre 2026.
   Le lien « La Boutique » est écrit dans le menu de chaque page, caché : on
   le révèle ici le jour où la Boutique ouvre. Une lecture, par simple fetch
   (la bibliothèque Supabase ne se charge pas pour un lien de menu), du seul
   champ `boutique` du document public `mnd_vitrine_config`, gardée dix
   minutes dans la session pour ne pas relire à chaque page.

   La règle est celle de shared/boutique-pur.ts (`boutiqueOuverte` : une date
   posée ET passée), recopiée en une ligne pour ne pas embarquer le
   catalogue des articles dans chaque page du site. */

const ADRESSE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const CLEF = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const CLE = 'mnd_boutique_ouverture';
const DIX_MINUTES = 10 * 60 * 1000;

const passee = (ouverture: string | undefined): boolean => {
  const t = Date.parse(ouverture ?? '');
  return Number.isFinite(t) && t <= Date.now();
};

export async function boutiqueEstOuverte(): Promise<boolean> {
  try {
    const gardee = JSON.parse(sessionStorage.getItem(CLE) ?? 'null') as { ouverture?: string; lu: number } | null;
    if (gardee && Date.now() - gardee.lu < DIX_MINUTES) return passee(gardee.ouverture);
  } catch { /* pas de session : on lit */ }
  if (!ADRESSE || !CLEF) return false;
  const delai = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(6000) : undefined;
  const r = await fetch(`${ADRESSE}/rest/v1/documents?select=boutique:data->boutique&key=eq.mnd_vitrine_config`, {
    headers: { apikey: CLEF, Authorization: `Bearer ${CLEF}` }, signal: delai,
  });
  if (!r.ok) return false;
  const lignes = (await r.json()) as { boutique?: { ouverture?: string } | null }[];
  const ouverture = lignes[0]?.boutique?.ouverture;
  try { sessionStorage.setItem(CLE, JSON.stringify({ ouverture, lu: Date.now() })); } catch { /* tant pis */ }
  return passee(ouverture);
}
