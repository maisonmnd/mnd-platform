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

/* CHAQUE SŒUR SA SESSION (14 août). Les sites vivent sur la MÊME origine :
   sans ceci, Le Trône et Ma Couronne partagent le même tiroir de session —
   connecté au Trône, on ne pouvait plus OUVRIR Ma Couronne dans le même
   navigateur (l'écran « Ce compte tient le Trône » revenait à chaque
   reconnexion au Trône, sans fin). `VITE_AUTH_SCOPE` (posé par
   build-sites.mjs pour le site couronne) donne à Ma Couronne son propre
   tiroir : l'admin au Trône et une cliente sur Ma Couronne cohabitent dans
   le même navigateur. En développement (une origine, pas de scope), tout
   reste partagé — c'est le confort voulu. */
const scope = import.meta.env.VITE_AUTH_SCOPE as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          ...(scope ? { storageKey: `sb-mnd-${scope}` } : {}),
        },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

/** Vrai quand un backend distant est configuré ; sinon la Maison tourne en local. */
export const isRemote = supabase !== null;
