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
   reconnexion au Trône, sans fin). Ma Couronne a donc son propre tiroir,
   « sb-mnd-couronne » : l'admin au Trône et une cliente sur Ma Couronne
   cohabitent dans le même navigateur.

   LA PORTÉE SE LIT À DEUX ENDROITS, dans cet ordre (17 novembre 2026) :
     1. `VITE_AUTH_SCOPE`, posé à la construction : build-sites.mjs le pose
        pour le site couronne ;
     2. à défaut, la balise `<meta name="mnd-auth-scope">` de la page :
        couronne.html la porte, aucune autre page.
   Sans l'un ni l'autre, aucune portée : le tiroir par défaut de supabase-js,
   celui du Trône, de LOKAA et de toutes les autres pages.

   POURQUOI LA PAGE LE DIT AUSSI. Jusqu'au 17 novembre 2026, seul le site
   publié séparait les tiroirs : en développement et dans un `npm run build`
   ordinaire, tout restait partagé, et c'était un confort tant que la
   connexion n'était pas exigée. Depuis l'audit du 4 novembre, elle l'est par
   défaut (`requireAuth`, auth.ts) : Ma Couronne demandait alors une session,
   la seule du tiroir commun était celle du personnel ouverte au Trône, et Ma
   Couronne refuse un compte du personnel. Le conflit du 14 août revenait
   partout où build-sites.mjs ne passe pas. La page de Ma Couronne a
   maintenant son tiroir PARTOUT.

   RIEN NE CHANGE POUR LES SITES PUBLIÉS : les pages du site du Trône ne
   portent pas la balise (même tiroir qu'hier, personne n'est déconnecté), et
   le site couronne se construit déjà avec VITE_AUTH_SCOPE=couronne (même
   tiroir, « sb-mnd-couronne »). */

/** LA PORTÉE DE LA SESSION, décidée en un seul endroit (pure : le banc
    l'éprouve sans navigateur). L'environnement d'abord, la balise de la page
    ensuite, sinon `null` (aucune portée).

    De la page, on n'accepte que des minuscules, des chiffres et le tiret :
    une balise ne peut pas donner au tiroir un autre nom que
    « sb-mnd-<portée> ». Une valeur qui porte autre chose (une majuscule, une
    espace, un point) est ignorée tout entière, elle n'est pas nettoyée.
    L'environnement, lui, vient de la construction : il est pris tel quel,
    comme avant. */
export function porteeDeSession(
  deLEnvironnement: string | null | undefined,
  deLaPage: string | null | undefined,
): string | null {
  if (deLEnvironnement) return deLEnvironnement;
  return typeof deLaPage === 'string' && /^[a-z0-9-]+$/.test(deLaPage) ? deLaPage : null;
}

/* Ce que dit la page. HORS D'UN NAVIGATEUR, IL N'Y A PAS DE PAGE : les bancs
   chargent ce module sous Node, sans `document` ou avec un `document` de
   façade qui n'a pas de `querySelector`. Rien ne doit y tomber. */
function porteeDeLaPage(): string | null {
  try {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null;
    return document.querySelector('meta[name="mnd-auth-scope"]')?.getAttribute('content') ?? null;
  } catch {
    return null;
  }
}

const scope = porteeDeSession(import.meta.env.VITE_AUTH_SCOPE as string | undefined, porteeDeLaPage());

/* LE NOM DU TIROIR D'UNE PORTÉE, écrit UNE fois : le client ci-dessous et
   `cleDeSession` plus bas le lisent ici, ils ne le recomposent pas. */
const tiroirDeLaPortee: string | null = scope ? `sb-mnd-${scope}` : null;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          ...(tiroirDeLaPortee ? { storageKey: tiroirDeLaPortee } : {}),
          /* LES CLÉS D'ACCÈS (16 octobre 2026, entrer par l'empreinte) : encore
             « en essai » chez supabase-js, d'où ce drapeau ; le banc
             verifie-l-empreinte surveille qu'il reste posé. */
          experimental: { passkey: true },
        },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null;

/** Vrai quand un backend distant est configuré ; sinon la Maison tourne en local. */
export const isRemote = supabase !== null;

/** LE TIROIR DE LA SESSION sur l'appareil — celui que supabase-js écrit
    (son nom par défaut, ou celui de la portée : la même valeur que le client
    ci-dessus). Le Trône hors ligne le relit pour s'ouvrir sans réseau
    (4 octobre 2026, `shared/hors-ligne`). */
export const cleDeSession: string | null = url
  ? (tiroirDeLaPortee ?? `sb-${new URL(url).hostname.split('.')[0]}-auth-token`)
  : null;

/* ══ JOINDRE UNE FONCTION QUAND L'ONGLET SE FERME — 14 sept. 2026 ════

   Un message retenu huit secondes doit PARTIR si l'on ferme l'onglet avant la
   fin du compte : un message qu'on croit envoyé et qui n'est jamais parti est
   pire qu'un message qu'on aurait voulu retenir.

   `functions.invoke` ne suffit pas là : le navigateur annule les requêtes en
   vol d'une page qui se ferme. Seul `keepalive` les laisse finir — c'est
   fait pour cela, et cela vaut aussi pour une tablette qu'on met en veille.

   `sendBeacon` ne convenait pas : il ne porte aucun en-tête, donc pas le
   jeton de session, et la porte de Supabase refuserait. */
export const adresseDesFonctions = url ? `${url.replace(/\/$/, '')}/functions/v1` : null;

/** Les réglages PUBLICS du serveur de connexion (ce qu'il sait faire) : lus avec la clé publique.
    Entrer par l'empreinte (16 octobre 2026) y lit si les clés d'accès sont allumées. */
export async function reglagesDeLaConnexion(): Promise<Record<string, unknown> | null> {
  if (!url || !anonKey) return null;
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anonKey } });
    return r.ok ? await r.json() as Record<string, unknown> : null;
  } catch { return null; }
}
export const cleAnonyme = anonKey ?? null;
