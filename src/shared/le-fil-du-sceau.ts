/* ══ LE FIL DU SCEAU, CÔTÉ TÉLÉPHONE — 22 novembre 2026 ══════════════════
   La page « Régler » d'une cliente n'a pas de compte : elle écoute le canal
   temps réel de SON jeton (`sceau-<jeton>`, voir shared/le-sceau-pur.ts) et
   ne reçoit qu'un mot, « relis ». À ce mot, elle relit sa note au serveur.

   LE CANAL NE PORTE RIEN. Pas un nom, pas un montant, pas un numéro : un
   téléphone inconnu qui connaîtrait le jeton n'apprendrait que l'existence
   d'une page. C'est la règle de la passation, et `signalDuSceau` la tient par
   construction (une charge vide, gelée).

   LE CLIENT SUPABASE EST CHARGÉ À LA DEMANDE. La page de paiement est
   ouverte au téléphone, sur le réseau de Cotonou : elle ne paie pas 40 ko de
   client temps réel pour afficher une note. Le module arrive quand le fil
   s'ouvre, ce que Vite découpe à part.

   SANS CLÉ, SANS RÉSEAU, OU SI LE CANAL TOMBE : la page relit d'elle-même,
   à son rythme (`useLeSceau`). Le fil est un accélérateur, jamais une
   dépendance. */
import { filDuSceau, SIGNAL_DU_SCEAU } from './le-sceau-pur';

const URL_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const CLE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** Écoute le fil d'un jeton. Rend de quoi couper (démontage de la page). */
export function ecouteLeFilDuSceau(jeton: string, onRelis: () => void): () => void {
  if (!jeton || !URL_PROJET || !CLE_ANON) return () => {};
  let vivant = true;
  let canal: { unsubscribe: () => unknown } | null = null;
  void (async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      if (!vivant) return;
      /* SA PROPRE SESSION, JAMAIS CELLE DU POSTE : une page cliente ouverte
         dans le navigateur de la Maison ne doit pas hériter du compte du
         personnel, et ne rien écrire dans son tiroir. */
      const sb = createClient(URL_PROJET, CLE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 2 } },
      });
      const c = sb.channel(filDuSceau(jeton), { config: { broadcast: { self: false } } });
      c.on('broadcast', { event: SIGNAL_DU_SCEAU }, () => { if (vivant) onRelis(); });
      c.subscribe();
      canal = c as unknown as { unsubscribe: () => unknown };
    } catch {
      /* Le fil ne s'ouvre pas : la page relit d'elle-même. Rien à dire. */
    }
  })();
  return () => {
    vivant = false;
    const c = canal;
    canal = null;
    if (c) void c.unsubscribe();
  };
}
