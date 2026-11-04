/* ══ LA SOURCE DE LA FONCTION « conseil-du-matin », 2 novembre 2026 ═══════
   Saphir, version simple : le Conseil du matin de la Maison intelligente
   (maquette CrtJrZzF8E6K39dbPeHwwt, le socle). Ce fichier n'est PAS déployé
   tel quel : `node scripts/conseil-du-matin-serveur.mjs` le regroupe avec les
   modules purs (`shared/conseil-du-matin-pur`, `shared/maison-intelligente-pur`,
   `shared/assistants-pur`) dans `supabase/functions/conseil-du-matin/index.ts`.

   QUI L'APPELLE :
     - le cron `conseil-du-matin` (0151), à 6 h UTC, 7 h à Cotonou, par
       `appelle_fonction_edge` armé de la clé service : la page s'écrit, puis
       UNE notification part à chaque souverain (le nombre de points qui
       pressent, jamais un nom) ;
     - l'écran « Les assistants », avec la session d'un souverain
       (« Écrire maintenant ») : la page se réécrit, rien ne part.
   Relancée le même jour, elle réécrit la page sans renotifier : l'heure de la
   notification (`notifieLe`) passe d'une écriture à l'autre.

   CE QU'ELLE LIT, avec la clé service : le registre (`assistants`), les cartes
   en attente, les relais d'hier, les bilans, le journal d'hier (par porte),
   les rendez-vous du jour, l'équipe, les dépenses à valider, les tâches de la
   nuit en échec (`conseil_taches_en_echec`), les compteurs de crédits et
   `mnd_settings` (assistants, livreDesCredits, conseil) ; le lundi, les
   clientes actives à 90 jours. Toujours par pages de mille lignes. Ce qu'elle
   n'a pas pu lire, la page le dit.

   CE QU'ELLE ÉCRIT : une ligne de `conseil_du_matin` par jour de Cotonou.
   Aucun appel à Claude, aucun secret ici : SUPABASE_URL et CLE_SERVICE (ou
   SUPABASE_SERVICE_ROLE_KEY) viennent de l'environnement. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aCotonou } from '../../src/shared/assistants-pur';
import { CLES_DES_COMPTEURS } from '../../src/shared/maison-intelligente-pur';
import { ecrisLeConseil, type FaitsDuConseil, type PageDuConseil } from '../../src/shared/conseil-du-matin-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const VERSION = '2026-11-04-a';
const ADRESSE = '/trone/#/assistants';
const ETIQUETTE = 'mnd-conseil';
/** Un appel à push-notify ne pend jamais au-delà. */
const ENVOI_MAX_MS = 8_000;
/** Mille lignes par page : le plafond de Supabase. Au-delà de vingt pages, on s'arrête. */
const PAGE = 1000;
const PAGES_AU_PLUS = 20;

// deno-lint-ignore no-explicit-any
type Base = any;
type Ligne = { id?: string; key?: string; data?: Record<string, unknown> | null; [k: string]: unknown };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const dis = (quoi: string, plus: Record<string, unknown> = {}) => console.log(JSON.stringify({ fonction: 'conseil-du-matin', quoi, ...plus }));

/** Minuit d'un jour de Cotonou (UTC+1), en ISO UTC. */
const minuitDe = (jourISO: string): string => new Date(Date.parse(`${jourISO}T00:00:00Z`) - 60 * 60_000).toISOString();
const moinsDesJours = (jourISO: string, n: number): string => new Date(Date.parse(`${jourISO}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Toutes les lignes d'une requête, par pages de mille (le plafond de Supabase). */
async function parPages(requete: (de: number, a: number) => PromiseLike<{ data: Ligne[] | null; error: unknown }>): Promise<Ligne[]> {
  const tout: Ligne[] = [];
  for (let i = 0; i < PAGES_AU_PLUS; i += 1) {
    const { data, error } = await requete(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(String((error as { message?: string })?.message ?? error));
    const lot = data ?? [];
    tout.push(...lot);
    if (lot.length < PAGE) break;
  }
  return tout;
}

/** Ce que Saphir lit, chaque lecture à part : une lecture manquée ne tue pas la page, elle se dit. */
async function litLesFaits(sb: Base, maintenantMs: number): Promise<FaitsDuConseil> {
  const lacunes: string[] = [];
  const essaie = async <T>(cle: string, defaut: T, f: () => Promise<T>): Promise<T> => {
    try { return await f(); } catch (e) { lacunes.push(cle); dis('lecture manquée', { cle, motif: String((e as Error)?.message ?? e).slice(0, 80) }); return defaut; }
  };
  const c = aCotonou(maintenantMs);
  const jour = c.dateISO;
  const hier = aCotonou(maintenantMs - 86_400_000).dateISO;
  const debutHier = minuitDe(hier);
  const debutJour = minuitDe(jour);
  const maintenant = new Date(maintenantMs).toISOString();

  const documents = await essaie('compteurs', {} as Record<string, unknown>, async () => {
    const { data, error } = await sb.from('documents').select('key, data').in('key', ['mnd_settings', ...CLES_DES_COMPTEURS]);
    if (error) throw new Error(error.message);
    return Object.fromEntries(((data ?? []) as Ligne[]).map((d) => [String(d.key), d.data ?? null]));
  });
  const reglages = (documents.mnd_settings ?? {}) as Record<string, unknown>;
  const compteurs = Object.fromEntries(CLES_DES_COMPTEURS.map((k) => [k, documents[k] ?? null]));

  const [assistants, cartes, relaisHier, relaisATraiter, bilans, gestes, rdvs, equipe, depenses, taches] = await Promise.all([
    essaie('assistants', [] as FaitsDuConseil['assistants'], async () => {
      const { data, error } = await sb.from('assistants').select('*').order('id');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Ligne[]).map((a) => ({
        id: String(a.id), nom: typeof a.nom === 'string' ? a.nom : null, aUnJeton: !!a.empreinte,
        vuLe: (a.vu_le as string | null) ?? null, etat: (a.etat as FaitsDuConseil['assistants'][number]['etat']) ?? {},
        loinDepuis: (a.loin_depuis as string | null) ?? null,
      }));
    }),
    essaie('cartes', [] as FaitsDuConseil['cartes'], async () => (await parPages((de, a) =>
      sb.from('assistants_decisions').select('id, assistant, genre, cree_le, echeance, tranchee').is('tranchee', null).order('id').range(de, a)))
      .map((d) => ({ assistant: String(d.assistant), genre: String(d.genre), creeLe: String(d.cree_le), echeance: (d.echeance as string | null) ?? null, tranchee: null }))),
    essaie('relais', 0, async () => (await parPages((de, a) =>
      sb.from('assistants_relais').select('id').gte('quand', debutHier).lt('quand', debutJour).order('id').range(de, a))).length),
    essaie('relais', 0, async () => (await parPages((de, a) =>
      sb.from('assistants_relais').select('id, perime_le').is('traite_le', null).order('id').range(de, a)))
      .filter((r) => !r.perime_le || String(r.perime_le) > maintenant).length),
    essaie('bilans', [] as FaitsDuConseil['bilans'], async () => {
      const { data, error } = await sb.from('assistants_bilans').select('assistant, jour, comptes').in('jour', [hier, jour]);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Ligne[]).map((b) => ({ assistant: String(b.assistant), jour: String(b.jour).slice(0, 10), comptes: (b.comptes as Record<string, unknown>) ?? {} }));
    }),
    essaie('journal', {} as Record<string, number>, async () => {
      const lignes = await parPages((de, a) =>
        sb.from('journal_gestes').select('id, data').gte('data->>quand', debutHier).lt('data->>quand', debutJour).order('id').range(de, a));
      const parPorte: Record<string, number> = {};
      for (const g of lignes) { const p = String(g.data?.porte ?? 'trone'); parPorte[p] = (parPorte[p] ?? 0) + 1; }
      return parPorte;
    }),
    essaie('rdv', [] as FaitsDuConseil['rdvDuJour'], async () => (await parPages((de, a) =>
      sb.from('appointments').select('id, data').eq('data->>date', jour).order('id').range(de, a)))
      /* Seuls l'heure, le maître et le statut sortent d'ici : jamais le nom de la cliente. */
      .map((r) => ({ time: r.data?.time, master: r.data?.master, status: r.data?.status }))),
    essaie('equipe', {} as Record<string, string>, async () => Object.fromEntries((await parPages((de, a) =>
      sb.from('team').select('id, data').order('id').range(de, a))).map((t) => [String(t.id), String(t.data?.name ?? '')]))),
    essaie('depenses', 0, async () => (await parPages((de, a) =>
      sb.from('expenses').select('id').eq('data->validation->>etat', 'attente').order('id').range(de, a))).length),
    essaie('taches', [] as FaitsDuConseil['tachesEnEchec'], async () => {
      const { data, error } = await sb.rpc('conseil_taches_en_echec', { depuis: new Date(maintenantMs - 86_400_000).toISOString() });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Ligne[]).map((t) => ({ tache: t.tache, echecs: t.echecs }));
    }),
  ]);

  /* Le lundi : les clientes distinctes avec un rituel honoré dans les 90 derniers jours. */
  let actives90: number | null = null;
  if (c.jour === 1) {
    actives90 = await essaie('actives', null as number | null, async () => {
      const lignes = await parPages((de, a) =>
        sb.from('appointments').select('id, data').eq('data->>status', 'honoré').gt('data->>date', moinsDesJours(jour, 90)).lte('data->>date', jour).order('id').range(de, a));
      return new Set(lignes.map((r) => String(r.data?.clientId ?? '')).filter(Boolean)).size;
    });
  }

  return {
    assistants, cartes, relais: { hier: relaisHier, aTraiter: relaisATraiter }, bilans, gestesHier: gestes, rdvDuJour: rdvs, equipe,
    depensesAValider: depenses, tachesEnEchec: taches, compteurs,
    reglagesAssistants: (reglages.assistants ?? null) as FaitsDuConseil['reglagesAssistants'],
    livre: (reglages.livreDesCredits ?? null) as FaitsDuConseil['livre'],
    conseil: (reglages.conseil ?? null) as FaitsDuConseil['conseil'],
    actives90,
    lacunes: [...new Set(lacunes)],
  };
}

/** Une notification à chaque souverain, sans nom : le nombre de points qui pressent. */
async function notifieLesSouverains(sb: Base, url: string, service: string, page: PageDuConseil): Promise<number> {
  const { data } = await sb.from('staff').select('user_id').eq('role', 'souverain');
  const ids = [...new Set(((data ?? []) as Ligne[]).map((s) => String(s.user_id ?? '')).filter(Boolean))];
  let envoyes = 0;
  for (const userId of ids) {
    try {
      const r = await fetch(`${url}/functions/v1/push-notify`, {
        method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
        body: JSON.stringify({ mode: 'to-staff', userId, title: page.notification.titre, body: page.notification.corps, url: ADRESSE, tag: ETIQUETTE }),
      });
      const lu = (await r.json().catch(() => ({}))) as { sent?: number };
      envoyes += Number(lu.sent ?? 0) || 0;
    } catch (e) {
      dis('notification en échec', { motif: String((e as Error)?.message ?? e).slice(0, 80) });
    }
  }
  return envoyes;
}

/** La porte : la clé service (le cron), ou la session d'un souverain. */
async function laPorte(sb: Base, req: Request, service: string): Promise<'cron' | 'souverain' | null> {
  const cle = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cle) return null;
  if (service && cle === service) return 'cron';
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from('staff').select('user_id, role').eq('user_id', uid).eq('role', 'souverain').maybeSingle();
  return staff ? 'souverain' : null;
}

/** Un ESSAI (2 novembre 2026) : la clé service avec le corps {"source":"essai"}
    écrit la page sans notifier, pour voir le premier Conseil sans réveiller
    la direction. Le cron envoie {"source":"cron"} : il notifie comme avant. */
async function laSourceDuCorps(req: Request): Promise<string> {
  try {
    const d = (await req.clone().json()) as { source?: unknown };
    return typeof d?.source === 'string' ? d.source : '';
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, fonction: 'conseil-du-matin', version: VERSION });
  if (req.method !== 'POST') return json({ ok: false, motif: 'POST seulement', version: VERSION }, 405);
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!url || !service) return json({ ok: false, motif: 'environnement', version: VERSION }, 500);
  const sb: Base = createClient(url, service);
  try {
    const porte = await laPorte(sb, req, service);
    if (!porte) return json({ ok: false, motif: 'reserve-au-cron-et-aux-souverains', version: VERSION }, 403);
    const source: 'cron' | 'souverain' | 'essai' = porte === 'cron' && (await laSourceDuCorps(req)) === 'essai' ? 'essai' : porte;

    const maintenantMs = Date.now();
    const faits = await litLesFaits(sb, maintenantMs);
    const page = ecrisLeConseil(faits, maintenantMs);

    /* Une notification par matin : relancée, la fonction garde l'heure de la première. */
    const { data: avant } = await sb.from('conseil_du_matin').select('page').eq('jour', page.jour).maybeSingle();
    let notifieLe: string | null = ((avant?.page ?? null) as PageDuConseil | null)?.notifieLe ?? null;
    let notifies = 0;
    if (source === 'cron' && !notifieLe) {
      notifies = await notifieLesSouverains(sb, url, service, page);
      notifieLe = new Date(maintenantMs).toISOString();
    }
    const ecrite: PageDuConseil = { ...page, notifieLe };
    const { error } = await sb.from('conseil_du_matin').upsert(
      { jour: page.jour, page: ecrite, version: VERSION, ecrit_le: page.ecritLe }, { onConflict: 'jour' });
    if (error) { dis('page non écrite', { motif: String(error.message ?? '').slice(0, 80) }); return json({ ok: false, motif: 'ecriture', version: VERSION }, 500); }
    dis('page écrite', { jour: page.jour, source, pressent: page.pressentEnTout, notifies, lacunes: faits.lacunes ?? [] });
    return json({ ok: true, version: VERSION, jour: page.jour, source, pressent: page.pressentEnTout, notifies, lacunes: faits.lacunes ?? [] });
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: 'erreur', version: VERSION }, 500);
  }
});
