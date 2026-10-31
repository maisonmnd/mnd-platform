/* ══ LA SOURCE DE LA FONCTION « dictee-au-propre » — 31 octobre 2026 ═════
   Ce fichier n'est PAS déployé tel quel : `node scripts/dictee-au-propre-serveur.mjs`
   le regroupe avec le module pur (`shared/dictee-pur`) dans
   `supabase/functions/dictee-au-propre/index.ts`, le fichier entier qui part
   (`node scripts/mise-en-ligne.mjs fonction dictee-au-propre --jwt non`).

   QUI L'APPELLE : l'écran « Dictée MND » du Trône (téléphone, ordinateur),
   et la Dictée du bureau (C:\Users\…\Dictee\dictee.py). LA PORTE : une
   session du personnel (`is_staff`, demandé à la base avec le jeton de
   l'appelant), ou le jeton de la Dictée du bureau dont l'empreinte est dans
   les réglages (Paramètres › Dictée).

   CE QU'ELLE FAIT : lit les réglages de la Dictée (mots, mode, modèle), les
   prestations du catalogue et les prénoms de l'équipe ; choisit le mode (dit
   par l'écran, ou dit en parlant « mode message », ou celui par défaut) ;
   Claude met le texte au propre ; le compte du mois s'écrit
   (`mnd_dictee_compte`). Elle rend `{ ok, propre, mode, modele }`. Le texte
   n'est pas gardé, et rien n'est anonymisé : c'est la personne qui dicte,
   ses mots lui appartiennent.

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE (ou
   SUPABASE_SERVICE_ROLE_KEY) et ANTHROPIC_API_KEY viennent de
   l'environnement. GET sans clé : la version, et si la clé de Claude est
   posée. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  DICTEES_PAR_MOIS, EN_TETE_DU_JETON, MODELES_DICTEE, MODELE_PAR_DEFAUT, MOTS_DE_LA_MAISON, TEXTE_AU_PLUS,
  consigneDeLaDictee, empreinteDuJeton, estMode, estModele, litLaCommandeDeMode, motsPropres, nettoieLaReponse,
  type ModeDictee, type ReglagesDictee,
} from '../../src/shared/dictee-pur';
import { prenomSeul } from '../../src/shared/civilite';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const VERSION = '2026-10-31-a';
/** Le prix d'un million de jetons, en dollars, pour le compte du mois. */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10 },
};
const CLE_DU_COMPTE = 'mnd_dictee_compte';
const DELAI_CLAUDE_MS = 20_000;
/** Au-delà, la consigne grossit pour rien : les prestations les plus courantes suffisent. */
const PRESTATIONS_AU_PLUS = 150;

// deno-lint-ignore no-explicit-any
type Base = any;
type CorpsAnthropic = {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${EN_TETE_DU_JETON}`,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const dis = (quoi: string, o: Record<string, unknown> = {}) => console.log(`dictee-au-propre · ${quoi} · ${JSON.stringify(o)}`);
const moisDeLaMaison = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 7);

async function appelleClaude(cle: string, corps: Record<string, unknown>): Promise<{ status: number; corps: CorpsAnthropic }> {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_CLAUDE_MS);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: arret.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(corps),
    });
    const texte = await r.text();
    let lu: CorpsAnthropic;
    try { lu = JSON.parse(texte) as CorpsAnthropic; } catch { lu = { error: { message: texte.slice(0, 200) } }; }
    return { status: r.status, corps: lu };
  } finally {
    clearTimeout(minuterie);
  }
}

const modeleInconnu = (status: number, c: CorpsAnthropic): boolean =>
  (status === 404 || status === 400) && /model/i.test(String(c.error?.message ?? ''));

type Ligne = { id?: string; data?: Record<string, unknown> | null };
const lignesDe = (rows: Ligne[] | null | undefined): Record<string, unknown>[] => (rows ?? []).map((r) => ({ id: r.id, ...(r.data ?? {}) }));
const chaine = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ fonction: 'dictee-au-propre', version: VERSION, claude: cleClaude ? 'oui' : 'non' });
  if (req.method !== 'POST') return json({ ok: false, motif: 'POST seulement', version: VERSION }, 405);

  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const jetonDuBureau = (req.headers.get(EN_TETE_DU_JETON) ?? '').trim();
  if (!url || !anon || !service) return json({ ok: false, motif: 'environnement', version: VERSION }, 500);
  if (!cleClaude) return json({ ok: false, motif: 'cle-claude-absente', version: VERSION });

  const sb: Base = createClient(url, service);
  try {
    /* LES RÉGLAGES D'ABORD : la porte du bureau se juge sur l'empreinte qu'ils portent. */
    const { data: luReglages } = await sb.from('documents').select('data').eq('key', 'mnd_settings').maybeSingle();
    const reglages = ((luReglages?.data as { dictee?: ReglagesDictee } | null)?.dictee ?? {}) as ReglagesDictee;

    /* LA PORTE : le personnel connecté, ou la Dictée du bureau avec son jeton. */
    let porte: 'personnel' | 'bureau' | null = null;
    if (jetonDuBureau && reglages.bureau?.empreinte && (await empreinteDuJeton(jetonDuBureau)) === reglages.bureau.empreinte) porte = 'bureau';
    if (!porte && jeton) {
      const commeAppelant: Base = createClient(url, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
      const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
      if (!errStaff && estPersonnel === true) porte = 'personnel';
    }
    if (!porte) return json({ ok: false, motif: 'reserve-au-personnel', version: VERSION }, 403);

    let d: { texte?: unknown; mode?: unknown; source?: unknown } = {};
    try { d = await req.json(); } catch { return json({ ok: false, motif: 'demande-illisible', version: VERSION }, 400); }
    let texte = (typeof d.texte === 'string' ? d.texte : '').trim().slice(0, TEXTE_AU_PLUS);
    if (!texte) return json({ ok: false, motif: 'texte', version: VERSION }, 400);

    /* LE MODE : celui que l'écran dit, sinon celui dit en parlant, sinon celui par défaut. */
    const commande = litLaCommandeDeMode(texte);
    let mode: ModeDictee = estMode(d.mode) ? d.mode : 'note';
    if (commande.mode) { mode = commande.mode; texte = commande.reste.trim() || texte; }
    else if (!estMode(d.mode) && estMode(reglages.modeParDefaut)) mode = reglages.modeParDefaut;
    if (!texte) return json({ ok: false, motif: 'texte', version: VERSION }, 400);

    const maintenant = Date.now();
    const mois = moisDeLaMaison(maintenant);
    /* LE PLAFOND DU MOIS. */
    const { data: lu } = await sb.from('documents').select('data').eq('key', CLE_DU_COMPTE).maybeSingle();
    const compte = (lu?.data ?? {}) as Record<string, { appels?: number; entree?: number; sortie?: number; usd?: number }>;
    if ((compte[mois]?.appels ?? 0) >= DICTEES_PAR_MOIS) { dis('plafond du mois'); return json({ ok: false, motif: 'plafond', version: VERSION }); }

    /* CE QUE LA MAISON SAIT : ses mots, ses prestations, son équipe. Une base qui se tait ne bloque pas la dictée. */
    const [services, categories, equipe] = await Promise.all([
      sb.from('catalog_services').select('id, data').limit(1000).then((r: { data?: Ligne[] | null }) => lignesDe(r.data)).catch(() => []),
      sb.from('catalog_categories').select('id, data').limit(1000).then((r: { data?: Ligne[] | null }) => lignesDe(r.data)).catch(() => []),
      sb.from('team').select('id, data').limit(1000).then((r: { data?: Ligne[] | null }) => lignesDe(r.data)).catch(() => []),
    ]);
    const prestations = motsPropres([
      ...categories.flatMap((c) => [chaine(c.fon), chaine(c.label)]),
      ...services.filter((s) => s.archived !== true).map((s) => chaine(s.name)),
    ]).slice(0, PRESTATIONS_AU_PLUS);
    const prenoms = motsPropres(equipe.filter((m) => !chaine(m.archiveeLe)).map((m) => prenomSeul(chaine(m.name))));
    const mots = motsPropres([...MOTS_DE_LA_MAISON, ...(Array.isArray(reglages.mots) ? reglages.mots : [])]);

    const prefere = estModele(reglages.modele) ? reglages.modele : MODELE_PAR_DEFAUT;
    const modeles = [prefere, ...MODELES_DICTEE.map((m) => m.id).filter((m) => m !== prefere)];
    let rendu: { status: number; corps: CorpsAnthropic } | null = null;
    let modele = modeles[0];
    for (const m of modeles) {
      modele = m;
      rendu = await appelleClaude(cleClaude, {
        model: m, max_tokens: 1500,
        system: consigneDeLaDictee({ mode, mots, prestations, equipe: prenoms }),
        messages: [{ role: 'user', content: texte }],
      });
      if (modeleInconnu(rendu.status, rendu.corps)) continue;
      break;
    }
    if (!rendu || rendu.status < 200 || rendu.status >= 300) {
      dis('claude refuse', { status: rendu?.status ?? 0, genre: rendu?.corps.error?.type ?? '' });
      return json({ ok: false, motif: 'claude', version: VERSION });
    }
    const propre = nettoieLaReponse(rendu.corps.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? '');

    const t = TARIFS[modele] ?? TARIFS[MODELE_PAR_DEFAUT];
    const e = Number(rendu.corps.usage?.input_tokens ?? 0);
    const so = Number(rendu.corps.usage?.output_tokens ?? 0);
    const m0 = compte[mois] ?? {};
    await sb.from('documents').upsert({
      key: CLE_DU_COMPTE,
      data: { ...compte, [mois]: {
        appels: (m0.appels ?? 0) + 1, entree: (m0.entree ?? 0) + e, sortie: (m0.sortie ?? 0) + so,
        usd: Math.round(((m0.usd ?? 0) + (e * t.entree + so * t.sortie) / 1_000_000) * 10_000) / 10_000,
      } },
    });
    dis('dictee', { porte, mode, modele, caracteres: texte.length, source: chaine(d.source) || 'trone' });
    if (!propre) return json({ ok: false, motif: 'modele', version: VERSION });
    return json({ ok: true, propre, mode, modele, version: VERSION });
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: 'erreur', version: VERSION });
  }
});
