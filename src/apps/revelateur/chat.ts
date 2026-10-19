import { CLE_DU_CHAT, GARDE_DES_DISCUSSIONS_JOURS, type ChatGarde, type MessageDuChat } from '../../shared/chat-du-site-pur';

/* ══ LE CHAT, CÔTÉ SITE — 19 octobre 2026 ═══════════════════════════════
   Une seule porte vers le serveur : la fonction `discussion`, appelée par
   un simple `fetch`. Pas la bibliothèque Supabase (210 Ko) : la bulle vit
   sur toutes les pages, et l'état « En ligne » se lit à chaque ouverture.

   La visiteuse n'a pas de compte : la fonction lui rend un jeton, seule
   clé de SA discussion, gardé sur son téléphone avec l'identifiant. Elle
   ferme la page et revient : la discussion l'attend. */

const URL_DU_PROJET = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const CLE_PUBLIQUE = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export type ReponseDuChat = {
  ok?: boolean; error?: string;
  enLigne?: boolean; etat?: string;
  id?: string; jeton?: string; appel?: string;
  messages?: MessageDuChat[];
};

/** Le chat est-il relié ? (Un site construit sans projet ne l'est pas.) */
export const chatRelie = (): boolean => !!URL_DU_PROJET && !!CLE_PUBLIQUE;

export async function appelleLeChat(corps: Record<string, unknown>): Promise<ReponseDuChat> {
  if (!chatRelie()) return { error: 'non_relie' };
  try {
    const r = await fetch(`${URL_DU_PROJET}/functions/v1/discussion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: CLE_PUBLIQUE, authorization: `Bearer ${CLE_PUBLIQUE}` },
      body: JSON.stringify(corps),
    });
    const donnees = await r.json().catch(() => ({})) as ReponseDuChat;
    return r.ok ? donnees : { ...donnees, error: donnees.error ?? `http_${r.status}` };
  } catch {
    return { error: 'reseau' };
  }
}

/** La discussion gardée sur ce téléphone, si elle a moins de 90 jours. */
export function chatGarde(): ChatGarde | null {
  try {
    const brut = localStorage.getItem(CLE_DU_CHAT);
    if (!brut) return null;
    const g = JSON.parse(brut) as ChatGarde;
    if (!g?.id || !g?.jeton) return null;
    if (Date.now() - (g.dernier || 0) > GARDE_DES_DISCUSSIONS_JOURS * 86_400_000) { oublieLeChat(); return null; }
    return g;
  } catch { return null; }
}

export function gardeLeChat(g: ChatGarde): void {
  try { localStorage.setItem(CLE_DU_CHAT, JSON.stringify(g)); } catch { /* navigation privée : la discussion vit le temps de la page */ }
}

export function oublieLeChat(): void {
  try { localStorage.removeItem(CLE_DU_CHAT); } catch { /* rien à oublier */ }
}

/** « En ligne » : quelqu'un a pris la permanence au Trône. `null` : on ne
    sait pas (serveur muet), et la bulle ne dit rien plutôt que de mentir. */
export async function quelquUnEstLa(): Promise<boolean | null> {
  const r = await appelleLeChat({ action: 'etat' });
  return typeof r.enLigne === 'boolean' ? r.enLigne : null;
}
