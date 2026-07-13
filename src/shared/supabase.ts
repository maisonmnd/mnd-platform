import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Client Supabase — activé uniquement si les clés d'environnement sont présentes.
   Sans clés, `supabase` vaut null et toute la plateforme fonctionne en localStorage
   (mode hors-ligne). Dès que les clés arrivent, la couche `sync` bascule en distant.

   Variables (fichier `.env.local`, jamais commité) :
     VITE_SUPABASE_URL       — URL du projet (https://xxxx.supabase.co)
     VITE_SUPABASE_ANON_KEY  — clé publique « anon »
*/

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

/** Vrai quand un backend distant est configuré ; sinon la Maison tourne en local. */
export const isRemote = supabase !== null;
