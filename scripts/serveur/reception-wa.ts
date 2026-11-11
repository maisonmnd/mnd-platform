/* ══ LA SOURCE DE LA FONCTION « reception-wa » — 27 octobre 2026 ══════════
   Ce fichier n'est PAS collé tel quel : `node scripts/reception-wa-serveur.mjs`
   le regroupe avec la voix et les règles pures du dépôt (esbuild) dans
   `supabase/functions/reception-wa/index.ts`, le fichier entier à coller.
   `verifie-la-reception-wa` refait le regroupement et crie si le fichier
   collé a pris du retard sur le dépôt.

   QUI L'APPELLE : `whatsapp-automate` seul, quand son juge se tait sur un
   numéro que la réception sert (`laReceptionPeutParler`). LA PORTE :
   `Authorization: Bearer <CLE_SERVICE>`.

   CE QU'ELLE FAIT, à chaque appel :
     ① le plafond : vingt réponses au plus par numéro en vingt-quatre
        heures (une boucle avec un autre robot ne coûte rien) ;
     ② relit le fil (les douze derniers messages, dont seuls ceux des
        48 dernières heures vont à Claude), la fiche (son nombre de
        locks), le catalogue et la grille tarifaire (les prix de chaque
        calibre, avec `prix-calibre`, la copie pure que tient verifie-prix),
        les heures de la Maison ;
     ③ demande à Claude sa réponse et la suite, avec la consigne partagée de
        « Proposer une réponse » ;
     ④ juge ce qu'il a écrit (`lectureDeLaReception`) : rien ne part qui
        porte un numéro, le mot banni, un montant hors catalogue, un prix de
        création ou de réparation ;
     ⑤ rend `{ ok, texte, suite, lignes? }` ; `ok: false` : l'automate envoie
        son mot de secours et passe la main.
   Elle écrit son compte (`mnd_assistant_wa_compte`) ; les messages partent
   par l'automate, qui les trace.

   LA PAROLE EN CONTEXTE (2 novembre 2026, lot 3 de Perle) : quand la
   cliente répond en mots à un message de Perle de moins de 48 heures, ou
   parle d'un rendez-vous qui vit, la réception offre à Claude les gestes que
   ce contexte permet (garder-oui, deplacer, garder-non, locks-defaits,
   envie : shared/reception-wa-pur). Un geste jugé bon s'écrit ICI, au
   Trône, sous verrou (`updated_at`) : le rendez-vous ou la fiche, puis la
   ligne d'envoi de Perle, puis le journal (porte « assistant », par Perle).
   Une écriture refusée (modifié entre temps) : `ok: false`, le secours part,
   et rien ne dit « c'est noté ». La réponse porte `geste` et, pour un
   rendez-vous, `rdvId` ; `deplacer` est la suite que l'automate ouvre en
   déplacement (morceau C).

   AUCUN SECRET ICI : CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY),
   SUPABASE_URL et ANTHROPIC_API_KEY viennent de l'environnement.

   GET sans clé : la version, et si la clé de Claude est posée (oui ou non). */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  RECEPTIONS_PAR_JOUR, calibreDuChoix, connaitLeLieuDe, consigneDeLaReception, contexteDeLaParole, contexteDeLaReception,
  dernierMotDePerle, ecrituresDuGeste, filDeLaFenetre, gestesPermis, lectureDeLaParole, listeDesCalibres, pieceDuGeste,
  accordApresLeOui, rdvDuGeste, rdvVivant, reponseSelonLeLieu, schemaDeLaParole, PAR_LA_PAROLE, type EnsuiteDeLaReception,
  type Calibre, type ContexteDeLaParole, type MessageDuFilBrut, type RdvDeLaParole,
} from '../../src/shared/reception-wa-pur';
import {
  lignesDuCataloguePourClaude, paliersDeLocks, type MessageDuFilPourClaude, type PrestationPourClaude, type PrixDuPalier,
} from '../../src/shared/ia-reponse-wa-pur';
import { prixSelonLeCalibre, type Bande, type PrestationTarifee } from '../../src/apps/revelateur/prix-calibre';
import { prixDuCatalogue } from '../../src/shared/automate-wa';
import type { ExceptionDHoraire, HeureDeLaSemaine } from '../../src/shared/agenda-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const VERSION = '2026-11-12-a';
/** Haïku d'abord (rapide, sur les crédits inclus) ; Sonnet si l'identifiant n'est pas reconnu. */
const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
/** Le prix d'un million de jetons, en dollars, pour le compte du mois. */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-haiku-5-5': { entree: 1, sortie: 5 },
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
};
const CLE_DU_COMPTE = 'mnd_assistant_wa_compte';
const DELAI_CLAUDE_MS = 20_000;

type Ligne = { id: string; data: Record<string, unknown> };
/** Une ligne avec sa garde : le verrou d'une écriture est son `updated_at`. */
type LigneGardee = { id: string; branch_id?: string | null; data: Record<string, unknown>; updated_at: string };
// deno-lint-ignore no-explicit-any
type Base = any;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const dis = (quoi: string, o: Record<string, unknown> = {}) => console.log(`reception-wa · ${quoi} · ${JSON.stringify(o)}`);
/** Le jour de la Maison (Cotonou, UTC+1 sans heure d'été). */
const jourDeLaMaison = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);

async function toutes(sb: Base, table: string): Promise<Ligne[]> {
  const out: Ligne[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(table).select('id, data').order('id', { ascending: true }).range(de, de + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...((data ?? []) as Ligne[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

type Demande = {
  numero: string;
  clientId?: string;
  fiche?: { name?: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean } | null;
  nomProfil?: string;
  prochainRdv?: { date: string; time?: string } | null;
  derniereVenue?: { date: string } | null;
  choixId?: string;
  /** Ce que l'automate qui appelle sait faire en plus (2 novembre 2026) :
      'accord' = il envoie `ensuite` (la question des nouvelles) après le mot. */
  sait?: string[];
};

type CorpsAnthropic = {
  content?: { type: string; name?: string; input?: unknown; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

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

/** Le modèle n'existe pas (encore) sous ce nom : on essaie le suivant. */
const modeleInconnu = (status: number, c: CorpsAnthropic): boolean =>
  (status === 404 || status === 400) && /model/i.test(String(c.error?.message ?? ''));

/** LES PRIX DE CHAQUE CALIBRE, avec la copie pure du site (`prix-calibre`). */
function prestationsAvecLeursPaliers(
  services: Ligne[], cats: { id: string; parentId?: string }[], bandes: Bande[], sets: Record<string, Bande[]>, baremeSuspendu: boolean, sesLocks: number,
): PrestationPourClaude[] {
  const paliers = paliersDeLocks(bandes);
  const tri = [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  const bandeDuCompte = (n: number): Bande | undefined => tri.find((b) => n <= (b.maxLocks ?? Infinity)) ?? tri[tri.length - 1];
  return services.map((l) => {
    const s = { ...l.data, id: l.id } as unknown as PrestationTarifee & PrestationPourClaude;
    const prixParPalier: PrixDuPalier[] = [];
    for (const p of paliers) {
      const bande = bandes.find((b) => b.id === p.id);
      const prix = prixSelonLeCalibre(s, { bande, lockCount: p.locks, sets, cats, baremeSuspendu });
      if (prix && prix > 0) prixParPalier.push({ palier: p.palier, prixXof: prix });
    }
    const pourElle = sesLocks > 0 ? prixSelonLeCalibre(s, { bande: bandeDuCompte(sesLocks), lockCount: sesLocks, sets, cats, baremeSuspendu }) : undefined;
    return { ...s, ...(prixParPalier.length ? { prixParPalier } : {}), ...(pourElle && pourElle > 0 ? { prixPourElle: pourElle } : {}) };
  });
}

async function compteLAppel(sb: Base, modele: string, usage: CorpsAnthropic['usage'], maintenantMs: number): Promise<void> {
  try {
    const mois = jourDeLaMaison(maintenantMs).slice(0, 7);
    const { data } = await sb.from('documents').select('data').eq('key', CLE_DU_COMPTE).maybeSingle();
    const avant = (data?.data ?? {}) as Record<string, { appels?: number; entree?: number; sortie?: number; usd?: number }>;
    const t = TARIFS[modele] ?? TARIFS['claude-sonnet-5-5'];
    const e = Number(usage?.input_tokens ?? 0); const so = Number(usage?.output_tokens ?? 0);
    const m = avant[mois] ?? {};
    const neuf = {
      appels: (m.appels ?? 0) + 1, entree: (m.entree ?? 0) + e, sortie: (m.sortie ?? 0) + so,
      usd: Math.round(((m.usd ?? 0) + (e * t.entree + so * t.sortie) / 1_000_000) * 10_000) / 10_000,
    };
    await sb.from('documents').upsert({ key: CLE_DU_COMPTE, data: { ...avant, [mois]: neuf } });
  } catch (e) {
    dis('compte non ecrit', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
  }
}

/** Le rendez-vous lu comme la parole le juge. */
const rdvDeLaLigne = (l: LigneGardee | null): RdvDeLaParole | null => {
  if (!l) return null;
  const d = l.data as { date?: unknown; time?: unknown; status?: unknown };
  return { id: l.id, date: String(d.date ?? ''), ...(typeof d.time === 'string' ? { time: d.time } : {}), ...(typeof d.status === 'string' ? { status: d.status } : {}) };
};

/** UNE ÉCRITURE SOUS VERROU : la ligne n'a pas bougé depuis sa lecture, sinon rien. */
async function ecrisSousVerrou(sb: Base, table: string, l: LigneGardee, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await sb.from(table).update({ data: { ...l.data, ...patch } }).eq('id', l.id).eq('updated_at', l.updated_at).select('id');
  if (error) { dis('ecriture refusee', { table, motif: String(error.message ?? '').slice(0, 100) }); return false; }
  return Array.isArray(data) && data.length > 0;
}

/** Le journal des gestes : porte « assistant », par Perle, un fait sans nom. */
async function journalise(sb: Base, g: { table: string; pieceId: string; piece: string; branchId?: string | null; champs: { champ: string; apres: string }[] }): Promise<void> {
  const id = `geste-${globalThis.crypto.randomUUID()}`;
  const geste = {
    id, ...(g.branchId ? { branchId: g.branchId } : {}), quand: new Date().toISOString(), parNom: PAR_LA_PAROLE, porte: 'assistant',
    verbe: 'modifie', table: g.table, ecran: 'WhatsApp de la Maison', pieceId: g.pieceId, piece: g.piece, champs: g.champs,
  };
  try { await sb.from('journal_gestes').insert({ id, branch_id: g.branchId ?? null, data: geste }); } catch { /* une trace manquée n'arrête pas le geste */ }
}

Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (req.method === 'GET') return json({ fonction: 'reception-wa', version: VERSION, claude: cleClaude ? 'oui' : 'non' });
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) return json({ ok: false, motif: 'porte', version: VERSION }, 401);
  if (!cleClaude) return json({ ok: false, motif: 'cle-claude-absente', version: VERSION });
  let d: Demande;
  try { d = await req.json() as Demande; } catch { return json({ ok: false, motif: 'demande-illisible', version: VERSION }, 400); }
  if (!d || typeof d.numero !== 'string' || !/^\d{8,15}$/.test(d.numero)) return json({ ok: false, motif: 'numero', version: VERSION }, 400);
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', service);
  const maintenantMs = Date.now();
  try {
    /* ① LE PLAFOND DU NUMÉRO. */
    const depuis = new Date(maintenantMs - 86_400_000).toISOString();
    const { count } = await sb.from('messages_wa').select('id', { count: 'exact', head: true })
      .eq('data->>numero', d.numero).eq('data->>reception', 'true').gte('data->>quand', depuis);
    if ((count ?? 0) >= RECEPTIONS_PAR_JOUR) { dis('plafond du numero'); return json({ ok: false, motif: 'plafond', version: VERSION }); }

    /* ② CE QU'ELLE SAIT. */
    const [msgs, docs, services, categories, fiche] = await Promise.all([
      sb.from('messages_wa').select('data').eq('data->>numero', d.numero).order('data->>quand', { ascending: false }).limit(12),
      sb.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_model_bands', 'mnd_model_band_sets', 'mnd_payment_methods']),
      toutes(sb, 'catalog_services'),
      toutes(sb, 'catalog_categories'),
      d.clientId ? sb.from('clients').select('data').eq('id', d.clientId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const doc = (k: string): unknown => ((docs.data ?? []) as { key: string; data: unknown }[]).find((x) => x.key === k)?.data;
    const reglages = (doc('mnd_settings') ?? {}) as { hours?: HeureDeLaSemaine[]; baremeSuspendu?: boolean; mndPay?: { actif?: boolean } };
    /* Les moyens de paiement des Paramètres (30 octobre 2026) : des mots, rien d'autre. */
    const modes = Array.isArray(doc('mnd_payment_methods')) ? (doc('mnd_payment_methods') as unknown[]) : [];
    const paiements = modes.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length < 40).map((x) => x.trim()).slice(0, 12);
    const exceptions = (doc('mnd_horaires_exceptions') ?? []) as ExceptionDHoraire[];
    const bandes = (Array.isArray(doc('mnd_model_bands')) ? doc('mnd_model_bands') : []) as Bande[];
    const sets = (doc('mnd_model_band_sets') ?? {}) as Record<string, Bande[]>;
    const cats = categories.map((c) => ({ ...(c.data as { parentId?: string }), id: c.id }));
    const bruts = ((msgs.data ?? []) as { data: Record<string, unknown> }[]).map((m) => m.data).filter(Boolean);
    const tout: (MessageDuFilPourClaude & { quand?: string })[] = [...bruts].reverse()
      .filter((m) => m && (m.sens === 'entrant' || m.sens === 'sortant'))
      .map((m) => ({
        sens: m.sens as 'entrant' | 'sortant', texte: String(m.texte ?? ''),
        ...(typeof m.type === 'string' ? { type: m.type } : {}), ...(typeof m.etat === 'string' ? { etat: m.etat } : {}),
        ...(typeof m.quand === 'string' ? { quand: m.quand } : {}),
      }));
    /* Les 48 dernières heures seules (31 octobre 2026) : un vieux vocal n'est
       plus une question qui attend. La première réponse se juge sur tout. */
    const fil: MessageDuFilPourClaude[] = filDeLaFenetre(tout, maintenantMs).map(({ quand: _q, ...m }) => m);
    /* ELLE CONNAÎT LE LIEU (1er novembre 2026) : déjà venue, ou l'adresse
       déjà partie dans ce fil : l'adresse sort du contexte, et la phrase qui
       la porterait quand même tombe (reception-wa-pur). */
    const connaitLeLieu = connaitLeLieuDe({ derniereVenue: d.derniereVenue, fil: tout });

    /* LA PAROLE EN CONTEXTE (2 novembre 2026) : le dernier mot de Perle, sa
       ligne d'envoi (par l'identifiant WhatsApp), le rendez-vous qu'il visait,
       le prochain rendez-vous vivant de la fiche. */
    const aujourdhui = jourDeLaMaison(maintenantMs);
    const mot = dernierMotDePerle(bruts as MessageDuFilBrut[], maintenantMs);
    let envoiDePerle: LigneGardee | null = null;
    if (mot?.waId) {
      const { data: e } = await sb.from('envois').select('id, branch_id, data, updated_at').eq('data->>waMessageId', mot.waId).limit(1);
      const l = ((e ?? []) as LigneGardee[])[0];
      if (l && (l.data as { type?: unknown }).type === 'gerard') envoiDePerle = l;
    }
    const clientDuGeste = String((envoiDePerle?.data as { clientId?: unknown } | undefined)?.clientId ?? '') || d.clientId || '';
    const apptVise = String((envoiDePerle?.data as { apptId?: unknown } | undefined)?.apptId ?? '');
    let rdvViseLigne: LigneGardee | null = null;
    if (mot && apptVise) {
      const { data: a } = await sb.from('appointments').select('id, branch_id, data, updated_at').eq('id', apptVise).limit(1);
      rdvViseLigne = ((a ?? []) as LigneGardee[])[0] ?? null;
    }
    let prochainLigne: LigneGardee | null = null;
    if (clientDuGeste) {
      const { data: a } = await sb.from('appointments').select('id, branch_id, data, updated_at')
        .eq('data->>clientId', clientDuGeste).gte('data->>date', aujourdhui).order('data->>date', { ascending: true }).limit(20);
      const vivants = ((a ?? []) as LigneGardee[]).filter((l) => rdvVivant(rdvDeLaLigne(l), aujourdhui))
        .sort((x, y) => `${String(x.data.date)} ${String(x.data.time ?? '')}`.localeCompare(`${String(y.data.date)} ${String(y.data.time ?? '')}`));
      prochainLigne = vivants[0] ?? null;
    }
    const parole: ContexteDeLaParole = {
      mot, rdvVise: rdvDeLaLigne(rdvViseLigne), prochainRdv: rdvDeLaLigne(prochainLigne), clientId: mot && clientDuGeste ? clientDuGeste : null,
    };
    const permis = gestesPermis(parole, aujourdhui);

    /* Son nombre de locks : compté à la Maison, annoncé par elle, ou le calibre qu'elle vient de toucher. */
    const f = ((fiche as { data?: { data?: Record<string, unknown> } | null }).data?.data ?? {}) as { lockCount?: number; lockCountDeclare?: number };
    const touche = calibreDuChoix(d.choixId, bandes as Calibre[]);
    const declare = touche && touche !== 'inconnu' ? touche.locks : Number(f.lockCountDeclare ?? 0) || 0;
    const compte = Number(f.lockCount ?? 0) || 0;
    const prestations = prestationsAvecLeursPaliers(services, cats, bandes, sets, reglages.baremeSuspendu === true, compte || declare);
    const catalogue = lignesDuCataloguePourClaude(prestations, cats);
    const permisMontants = new Set<number>();
    for (const p of prestations) {
      for (const x of p.prixParPalier ?? []) permisMontants.add(x.prixXof);
      if (p.prixPourElle) permisMontants.add(p.prixPourElle);
    }
    for (const v of Object.values(prixDuCatalogue(services.map((s) => ({ id: s.id, data: s.data }))))) if (v > 0) permisMontants.add(v);

    const contexteDeBase = contexteDeLaReception({
      fil, fiche: d.fiche ?? null, ...(d.nomProfil ? { nomProfil: d.nomProfil } : {}),
      prochainRdv: d.prochainRdv ?? null, derniereVenue: d.derniereVenue ?? null,
      catalogue, locks: { compte, declare }, aujourdhui: jourDeLaMaison(maintenantMs),
      semaine: Array.isArray(reglages.hours) ? reglages.hours : [], exceptions: Array.isArray(exceptions) ? exceptions : [],
      maintenantMs, premiereReponse: !tout.some((m) => m.sens === 'sortant'),
      paiements, paiementEnLigne: reglages.mndPay?.actif === true,
      connaitLeLieu,
    });
    const contexte = `${contexteDeBase}${contexteDeLaParole(parole, permis, maintenantMs, aujourdhui)}`;

    /* ③ CLAUDE. */
    const corps = {
      max_tokens: 700,
      system: consigneDeLaReception(),
      messages: [{ role: 'user', content: contexte }],
      tools: [{ name: 'reponds', description: 'Le message de la Maison, et la suite.', input_schema: schemaDeLaParole(permis) }],
      tool_choice: { type: 'tool', name: 'reponds' },
    };
    let lu: { modele: string; corps: CorpsAnthropic } | null = null;
    for (const modele of MODELES) {
      const r = await appelleClaude(cleClaude, { model: modele, ...corps });
      if (modeleInconnu(r.status, r.corps)) continue;
      if (r.status < 200 || r.status >= 300) { dis('claude refuse', { status: r.status, genre: r.corps.error?.type ?? '' }); return json({ ok: false, motif: 'claude', version: VERSION }); }
      lu = { modele, corps: r.corps };
      break;
    }
    if (!lu) return json({ ok: false, motif: 'modele', version: VERSION });
    await compteLAppel(sb, lu.modele, lu.corps.usage, maintenantMs);

    /* ④ LE JUGEMENT. */
    const entree = lu.corps.content?.find((c) => c.type === 'tool_use' && c.name === 'reponds')?.input;
    const lue = lectureDeLaParole(entree, permisMontants, permis);
    if (!lue) { dis('reponse ecartee par les juges'); return json({ ok: false, motif: 'juges', version: VERSION }); }
    const texte = reponseSelonLeLieu({ texte: lue.texte, suite: 'rien' }, connaitLeLieu).texte;

    /* ④ bis LE GESTE, ÉCRIT AU TRÔNE AVANT TOUT MOT (2 novembre 2026) : le
       rendez-vous ou la fiche sous verrou ; refusé, rien ne part qui dirait
       « c'est noté ». Puis la ligne d'envoi de Perle et le journal. */
    let rdvId: string | null = null;
    if (lue.geste) {
      const quand = new Date(maintenantMs).toISOString();
      const e = ecrituresDuGeste(lue.geste, quand, lue.envie);
      const rdv = rdvDuGeste(parole, aujourdhui);
      const ligneRdv = rdv ? (rdvViseLigne?.id === rdv.id ? rdvViseLigne : prochainLigne?.id === rdv.id ? prochainLigne : null) : null;
      if (e.rdv) {
        if (!ligneRdv || !(await ecrisSousVerrou(sb, 'appointments', ligneRdv, e.rdv))) {
          dis('geste refuse', { geste: lue.geste, pourquoi: ligneRdv ? 'modifie-entre-temps' : 'rdv-introuvable' });
          return json({ ok: false, motif: 'geste', version: VERSION });
        }
        rdvId = ligneRdv.id;
        await journalise(sb, {
          table: 'appointments', pieceId: ligneRdv.id, branchId: ligneRdv.branch_id ?? null, piece: pieceDuGeste(lue.geste, rdv),
          champs: Object.keys(e.rdv).filter((k) => e.rdv![k] !== undefined).map((k) => ({ champ: k, apres: quand.slice(0, 16) })),
        });
      }
      if (e.fiche) {
        const { data: f2 } = clientDuGeste
          ? await sb.from('clients').select('id, branch_id, data, updated_at').eq('id', clientDuGeste).limit(1)
          : { data: [] };
        const ligneFiche = ((f2 ?? []) as LigneGardee[])[0] ?? null;
        if (!ligneFiche || !(await ecrisSousVerrou(sb, 'clients', ligneFiche, e.fiche))) {
          dis('geste refuse', { geste: lue.geste, pourquoi: ligneFiche ? 'modifie-entre-temps' : 'fiche-introuvable' });
          return json({ ok: false, motif: 'geste', version: VERSION });
        }
        await journalise(sb, {
          table: 'clients', pieceId: ligneFiche.id, branchId: ligneFiche.branch_id ?? null, piece: pieceDuGeste(lue.geste),
          champs: [{ champ: 'locksDefaits', apres: 'oui' }],
        });
      }
      if (e.envoi && envoiDePerle) {
        const { error } = await sb.from('envois').update({ data: { ...envoiDePerle.data, ...e.envoi } }).eq('id', envoiDePerle.id);
        if (error) dis('ligne d envoi non ecrite', { motif: String(error.message ?? '').slice(0, 100) });
      }
    }

    /* ④ ter L'ACCORD DES NOUVELLES, après un « oui je viens » écrit
       (maquette « Nouvelles par WhatsApp ») : la fiche marquée sous verrou
       d'abord ; la marque refusée, la question ne part pas. */
    let ensuite: EnsuiteDeLaReception | null = null;
    if (lue.geste === 'garder-oui' && clientDuGeste) {
      const { data: f3 } = await sb.from('clients').select('id, branch_id, data, updated_at').eq('id', clientDuGeste).limit(1);
      const ligneFiche = ((f3 ?? []) as LigneGardee[])[0] ?? null;
      const question = accordApresLeOui({
        geste: lue.geste, sait: Array.isArray(d.sait) ? d.sait.map(String) : [], aujourdhui,
        fiche: ligneFiche ? (ligneFiche.data as Parameters<typeof accordApresLeOui>[0]['fiche']) : null,
      });
      if (question && ligneFiche && await ecrisSousVerrou(sb, 'clients', ligneFiche, { nouvellesDemandeesLe: new Date(maintenantMs).toISOString() })) {
        ensuite = question;
        await journalise(sb, {
          table: 'clients', pieceId: ligneFiche.id, branchId: ligneFiche.branch_id ?? null,
          piece: 'Accord des nouvelles demandé sur WhatsApp, après un oui je viens', champs: [{ champ: 'nouvellesDemandeesLe', apres: aujourdhui }],
        });
      }
    }

    /* ⑤ LA SUITE : les calibres de la grille, à toucher. Sans grille, la question reste écrite. */
    const lignes = lue.suite === 'calibre' ? listeDesCalibres(bandes as Calibre[]) : [];
    const suite = lue.suite === 'calibre' && lignes.length <= 1 ? 'rien' : lue.suite;
    dis('reponse', { suite, modele: lu.modele, lignes: lignes.length, connaitLeLieu, adresseOtee: texte !== lue.texte, geste: lue.geste ?? null, permis });
    return json({
      ok: true, texte, suite, ...(suite === 'calibre' ? { lignes } : {}),
      ...(lue.geste ? { geste: lue.geste } : {}), ...(rdvId ? { rdvId } : {}), ...(ensuite ? { ensuite } : {}), version: VERSION,
    });
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 160) });
    return json({ ok: false, motif: 'erreur', version: VERSION });
  }
});
