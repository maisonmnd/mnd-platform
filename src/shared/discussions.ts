import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { enPermanence, finDePermanence, texteDuMessage, type MessageDuChat, type Permanence } from './chat-du-site-pur';

/* ══ LES DISCUSSIONS AU TRÔNE — 19 octobre 2026 ══════════════════════════
   Les règles vivent dans `chat-du-site-pur` ; ici, la lecture, l'écoute
   et les gestes de l'équipe.

   L'ÉCOUTE EST DIRECTE, PAS PAR LA SYNCHRO DES MAGASINS (comme MND PAY) :
   les discussions sont écrites par la fonction `discussion` et par les
   réponses de l'équipe, jamais poussées depuis un magasin. On lit les
   discussions des 90 derniers jours, puis on écoute les trois tables en
   temps réel : le message d'une visiteuse arrive à l'écran à l'instant.

   UNE RÉPONSE NE PART JAMAIS EN DIFFÉRÉ. Sans réseau, on le dit : une
   réponse arrivée une heure plus tard à une visiteuse partie ne répond à
   rien, il vaut mieux lui écrire sur WhatsApp. */

export type Discussion = {
  id: string; branch_id?: string | null; civilite?: string | null; prenom?: string | null; nom?: string | null;
  telephone?: string | null; page?: string | null; etat: 'ouverte' | 'close'; dernier_de?: 'visiteuse' | 'maison' | null;
  derniere_le: string; client_id?: string | null; cree_le: string;
};
export type MessageAuTrone = MessageDuChat & { discussion_id: string; par?: string | null };
export type PermanenceAuTrone = Permanence & { nom?: string | null };

const COLONNES = 'id, branch_id, civilite, prenom, nom, telephone, page, etat, dernier_de, derniere_le, client_id, cree_le';

type Etat = {
  discussions: Discussion[];
  messages: Record<string, MessageAuTrone[]>;
  permanences: PermanenceAuTrone[];
  pret: boolean;
  erreur: string | null;
};
let etat: Etat = { discussions: [], messages: {}, permanences: [], pret: false, erreur: null };
const abonnes = new Set<() => void>();
const pose = (p: Partial<Etat>) => { etat = { ...etat, ...p }; for (const f of abonnes) f(); };
const abonne = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const lis = () => etat;

const trie = (ds: Discussion[]): Discussion[] => [...ds].sort((a, b) => Date.parse(b.derniere_le) - Date.parse(a.derniere_le));
function poseDiscussion(d: Discussion | undefined | null): void {
  if (!d?.id) return;
  const i = etat.discussions.findIndex((x) => x.id === d.id);
  pose({ discussions: trie(i >= 0 ? etat.discussions.map((x, k) => (k === i ? { ...x, ...d } : x)) : [d, ...etat.discussions]) });
}
function poseMessage(m: MessageAuTrone | undefined | null): void {
  if (!m?.id || !m.discussion_id) return;
  const fil = etat.messages[m.discussion_id];
  if (!fil || fil.some((x) => x.id === m.id)) return;
  pose({ messages: { ...etat.messages, [m.discussion_id]: [...fil, m].sort((a, b) => a.id - b.id) } });
}

/** Ce que l'écran dit quand la base refuse : la table manque tant que 0136
    n'est pas collée. */
const motDeLErreur = (message: string, code?: string): string =>
  (code === 'PGRST205' || code === '42P01' || /does not exist|schema cache/i.test(message)
    ? 'Les discussions ne sont pas encore en place : la migration 0136 attend d’être collée dans Supabase.'
    : `Les discussions ne se lisent pas : ${message}`);

let ecoute = false;

async function relisLesPermanences(): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  const { data } = await sb.from('discussion_permanence').select('user_id, nom, jusqua');
  pose({ permanences: (data ?? []) as PermanenceAuTrone[] });
}

/** Lit et écoute les discussions (idempotent). */
export function ecouteLesDiscussions(): void {
  const sb = supabase;
  if (ecoute) return;
  if (!sb) { pose({ pret: true, erreur: 'Le Trône est hors ligne : les discussions se lisent avec le réseau.' }); return; }
  ecoute = true;
  const depuis = new Date(Date.now() - 90 * 86_400_000).toISOString();
  void sb.from('discussions').select(COLONNES).gte('derniere_le', depuis)
    .order('derniere_le', { ascending: false }).limit(300)
    .then(({ data, error }) => {
      if (error) { ecoute = false; pose({ pret: true, erreur: motDeLErreur(error.message, error.code) }); return; }
      const deja = new Map(etat.discussions.map((d) => [d.id, d]));
      const lues = ((data ?? []) as Discussion[]).filter((d) => !deja.has(d.id));
      pose({ discussions: trie([...deja.values(), ...lues]), pret: true, erreur: null });
    });
  void relisLesPermanences();
  sb.channel('discussions-du-site')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'discussions' },
      (brut: unknown) => {
        const p = brut as { eventType?: string; new?: Discussion; old?: { id?: string } };
        if (p.eventType === 'DELETE') { pose({ discussions: etat.discussions.filter((d) => d.id !== p.old?.id) }); return; }
        const { jeton_hash: _j, alerte_le: _a, ...d } = (p.new ?? {}) as Discussion & { jeton_hash?: string; alerte_le?: string };
        poseDiscussion(d as Discussion);
      })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discussion_messages' },
      (brut: unknown) => poseMessage((brut as { new?: MessageAuTrone }).new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_permanence' },
      () => { void relisLesPermanences(); })
    .subscribe();
}

/** Les messages d'une discussion, lus à son ouverture puis tenus en direct. */
export async function chargeLesMessages(id: string): Promise<void> {
  const sb = supabase;
  if (!sb || !id) return;
  const { data, error } = await sb.from('discussion_messages').select('id, discussion_id, de, texte, cree_le, genre, par')
    .eq('discussion_id', id).order('id', { ascending: true }).limit(500);
  if (error) return;
  const deja = etat.messages[id] ?? [];
  const vus = new Set((data ?? []).map((m) => (m as MessageAuTrone).id));
  pose({ messages: { ...etat.messages, [id]: [...((data ?? []) as MessageAuTrone[]), ...deja.filter((m) => !vus.has(m.id))].sort((a, b) => a.id - b.id) } });
}

export function useDiscussions(): Etat {
  useEffect(() => { ecouteLesDiscussions(); }, []);
  return useSyncExternalStore(abonne, lis, lis);
}

export function useMessagesDe(id: string | null): MessageAuTrone[] {
  const e = useSyncExternalStore(abonne, lis, lis);
  useEffect(() => { if (id) void chargeLesMessages(id); }, [id]);
  return id ? e.messages[id] ?? [] : [];
}

/* ── LES GESTES ─────────────────────────────────────────────────────── */

/** Répondre au nom de la Maison. `null` : c'est parti ; sinon, pourquoi pas. */
export async function repondre(discussionId: string, brut: string, uid: string): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne : écrivez-lui sur WhatsApp.';
  const texte = texteDuMessage(brut);
  if (!texte) return 'Le message est vide.';
  const { data, error } = await sb.from('discussion_messages')
    .insert({ discussion_id: discussionId, de: 'maison', texte, par: uid })
    .select('id, discussion_id, de, texte, cree_le, genre, par').single();
  if (error) return `La réponse n’est pas partie : ${error.message}`;
  poseMessage(data as MessageAuTrone);
  return null;
}

export async function changeLEtat(id: string, etatVoulu: 'ouverte' | 'close'): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const { error } = await sb.from('discussions').update({ etat: etatVoulu }).eq('id', id);
  if (error) return error.message;
  const d = etat.discussions.find((x) => x.id === id);
  if (d) poseDiscussion({ ...d, etat: etatVoulu });
  return null;
}

export async function relieALaFiche(id: string, clientId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from('discussions').update({ client_id: clientId }).eq('id', id);
  const d = etat.discussions.find((x) => x.id === id);
  if (d) poseDiscussion({ ...d, client_id: clientId });
}

/** Effacer pour de bon (la direction ; la base le garde aussi). */
export async function effaceLaDiscussion(id: string): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const { error } = await sb.from('discussions').delete().eq('id', id);
  if (error) return error.message;
  const { [id]: _, ...reste } = etat.messages;
  pose({ discussions: etat.discussions.filter((d) => d.id !== id), messages: reste });
  return null;
}

/** Prendre la permanence pour une journée de travail ; la rendre. */
export async function prendsLaPermanence(uid: string, nom: string): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const { error } = await sb.from('discussion_permanence').upsert({ user_id: uid, nom, jusqua: finDePermanence(Date.now()) }, { onConflict: 'user_id' });
  if (error) return error.message;
  await relisLesPermanences();
  return null;
}

export async function rendsLaPermanence(uid: string): Promise<string | null> {
  const sb = supabase;
  if (!sb) return 'Le Trône est hors ligne.';
  const { error } = await sb.from('discussion_permanence').delete().eq('user_id', uid);
  if (error) return error.message;
  await relisLesPermanences();
  return null;
}

/** Qui est de permanence, maintenant. */
export const presents = (ps: readonly PermanenceAuTrone[]): PermanenceAuTrone[] =>
  enPermanence(ps, Date.now()) as PermanenceAuTrone[];
