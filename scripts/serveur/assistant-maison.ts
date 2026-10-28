/* ══ LA SOURCE DE LA FONCTION « assistant-maison » — 27 octobre 2026 ══════
   Ce fichier n'est PAS collé tel quel : `node scripts/assistant-maison-serveur.mjs`
   le regroupe avec la lecture et le cerveau purs du dépôt (esbuild) dans
   `supabase/functions/assistant-maison/index.ts`, le fichier entier à coller.
   `verifie-gerard` refait le regroupement et crie si le fichier collé a
   pris du retard sur le dépôt.

   CE QU'ELLE FAIT, à chaque réveil du cron (toutes les quinze minutes) :
     ① dit qu'elle vit (`documents`, clé `mnd_assistant_serveur`) : tant
        qu'elle parle, le Trône ne refait plus le passage ;
     ② fabrique les remises à son nom des lignes PARTIES (le facteur a dit
        « envoyé ») : jamais avant le départ réel, une seule par ligne
        (la ligne se réserve par une écriture conditionnelle) ;
     ③ le premier réveil après 8 h (heure du salon), une fois par jour, si
        l'Assistant est Actif : relit fiches, RDV, envois, pièces, foyers,
        cartes, remises, soucis et abonnées, refait le plan du jour avec la
        MÊME lecture que le Trône, et dépose ses lignes dans la salle
        d'attente, seulement celles qui n'y sont pas encore.
   Le facteur `envois-partent` porte les lignes, jamais pendant les heures
   calmes. AUCUN SECRET ICI : la clé service vient de l'environnement.

   GET sans clé : la version seule (la sonde des fonctions). */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ouvertureDuJour, type ExceptionDHoraire, type HeureDeLaSemaine } from '../../src/shared/agenda-pur';
import { reglesDepuis } from '../../src/shared/salle-des-envois';
import { lisLAssistant, codeDeLaSituation } from '../../src/shared/assistant-lecture-pur';
import { CLE_DU_SERVEUR, lignesDuPassage, lignesNeuves, remisesAFabriquer, type EtatDuServeur } from '../../src/shared/assistant-passage-pur';
import { HEURE_DU_PASSAGE_A, HEURE_DU_PASSAGE_DE, planDuJour, reglagesLus } from '../../src/shared/gerard-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const VERSION = '2026-10-28-c';

type Ligne = { id: string; branch_id?: string | null; data: Record<string, unknown> };
// deno-lint-ignore no-explicit-any
type Base = any;

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

/** Le jour et l'heure du salon (Cotonou, UTC+1 sans heure d'été). */
const jourDuSalon = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);
const heureDuSalon = (ms: number): number => { const d = new Date(ms + 3_600_000); return d.getUTCHours() + d.getUTCMinutes() / 60; };

/** Toutes les lignes d'une table, par pages de mille (Supabase plafonne là). */
async function toutes(sb: Base, table: string, filtre?: (q: Base) => Base, colonnes = 'id, branch_id, data'): Promise<Ligne[]> {
  const out: Ligne[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(table).select(colonnes).order('id', { ascending: true }).range(de, de + 999);
    if (filtre) q = filtre(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...((data ?? []) as Ligne[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function document<T>(sb: Base, cle: string): Promise<T | null> {
  const { data, error } = await sb.from('documents').select('data').eq('key', cle).maybeSingle();
  if (error) throw new Error(`documents ${cle} : ${error.message}`);
  return (data?.data ?? null) as T | null;
}

/** Les comptes abonnés aux notifications (fiche ou compte Ma Couronne). */
async function abonnes(sb: Base): Promise<Set<string>> {
  const ids = new Set<string>();
  let apres = '';
  for (;;) {
    let q = sb.from('push_subscriptions').select('endpoint, client_id').order('endpoint', { ascending: true }).limit(1000);
    if (apres) q = q.gt('endpoint', apres);
    const { data, error } = await q;
    if (error) throw new Error(`push_subscriptions : ${error.message}`);
    const rangs = (data ?? []) as { endpoint: string; client_id: string | null }[];
    for (const r of rangs) if (r.client_id) ids.add(r.client_id);
    if (rangs.length < 1000) break;
    apres = rangs[rangs.length - 1].endpoint;
  }
  return ids;
}

/** ② LES REMISES DES LIGNES PARTIES. */
async function fabriqueLesRemises(sb: Base, maintenantMs: number): Promise<number> {
  const parties = await toutes(sb, 'envois', (q) => q.eq('data->>type', 'gerard').eq('data->>statut', 'envoyé'));
  const aFaire = remisesAFabriquer(parties.map((l) => l.data));
  if (aFaire.length === 0) return 0;
  const codes = (await toutes(sb, 'codes_promo')).map((l) => l.data) as never[];
  const aujourdhui = jourDuSalon(maintenantMs);
  let faites = 0;
  for (const l of aFaire) {
    const ligne = parties.find((p) => p.id === l.id);
    if (!ligne) continue;
    /* Un jour creux passé ne se remise plus : la ligne le dit, sans code. */
    if (l.codeAFaire.jusquau < aujourdhui) {
      await sb.from('envois').update({ data: { ...ligne.data, codePromo: '', detailRemise: 'jour passé, pas de remise' } })
        .eq('id', l.id).is('data->>codePromo', null);
      continue;
    }
    const { data: fiche } = await sb.from('clients').select('data').eq('id', l.clientId).maybeSingle();
    const code = codeDeLaSituation({ clientId: l.clientId, genre: l.genre, code: l.codeAFaire },
      { branchId: l.branchId, nom: String((fiche?.data as { name?: string } | undefined)?.name ?? ''), maintenantMs }, codes);
    if (!code) continue;
    /* LA LIGNE SE RÉSERVE D'ABORD : deux réveils simultanés ne fabriquent pas deux remises. */
    const { data: prise } = await sb.from('envois').update({ data: { ...ligne.data, codePromo: code.code } })
      .eq('id', l.id).is('data->>codePromo', null).select('id');
    if ((prise ?? []).length === 0) continue;
    const { error } = await sb.from('codes_promo').upsert({ id: code.id, branch_id: code.branchId, data: code });
    if (error) console.error('assistant-maison: remise', error.message);
    else { faites++; codes.push(code as never); }
  }
  return faites;
}

/** ③ LE PASSAGE DU MATIN, branche par branche. */
async function passage(sb: Base, maintenantMs: number, reglagesGerard: unknown): Promise<{ deposees: number; plan: number; erreurs: string[] }> {
  const aujourdhui = jourDuSalon(maintenantMs);
  const reglages = await document<{ hours?: HeureDeLaSemaine[] }>(sb, 'mnd_settings');
  if (!Array.isArray(reglages?.hours) || reglages!.hours.length === 0) {
    return { deposees: 0, plan: 0, erreurs: ['heures de la Maison introuvables (mnd_settings.hours) : rien déposé'] };
  }
  const exceptions = (await document<ExceptionDHoraire[]>(sb, 'mnd_horaires_exceptions')) ?? [];
  const regles = reglesDepuis(await document<Record<string, unknown>>(sb, 'mnd_auto_config'));
  const ouverture = (iso: string) => ouvertureDuJour(iso, reglages!.hours!, exceptions);

  const [branches, clients, rdvs, prestations, signalements, envois, messages, pieces, blocages, familles, cartes, codes, abonnees] = await Promise.all([
    toutes(sb, 'branches'), toutes(sb, 'clients'), toutes(sb, 'appointments'), toutes(sb, 'catalog_services'), toutes(sb, 'signalements'),
    toutes(sb, 'envois'), toutes(sb, 'messages_wa'), toutes(sb, 'invoices'), toutes(sb, 'blocages'), toutes(sb, 'families'),
    toutes(sb, 'cartes_cadeaux'), toutes(sb, 'codes_promo'), abonnes(sb),
  ]);
  const d = <T>(l: Ligne[]) => l.map((x) => x.data as T);
  const existantes = new Set(envois.map((e) => e.id));
  let deposees = 0; let plan = 0;
  const erreurs: string[] = [];
  for (const b of d<{ id: string; seats?: number }>(branches)) {
    const cerveau = lisLAssistant({
      aujourdhui, maintenantMs, branche: { id: b.id, seats: b.seats },
      clients: d<never>(clients).filter((c: { branchId?: string; archived?: boolean }) => c.branchId === b.id && !c.archived),
      rdvs: d<never>(rdvs).filter((a: { branchId?: string }) => a.branchId === b.id),
      prestations: new Map(d<{ id: string }>(prestations).map((s) => [s.id, s as never])),
      signalements: d(signalements), abonnes: abonnees, envois: d(envois), messages: d(messages), pieces: d(pieces),
      blocages: d(blocages), familles: d(familles), cartes: d(cartes), codes: d(codes), reglagesGerard, ouverture,
    });
    const leurPlan = planDuJour(cerveau.fiches, cerveau.ctx);
    plan += leurPlan.length;
    const neuves = lignesNeuves(lignesDuPassage({ cerveau, plan: leurPlan, reglagesGerard, maintenantMs, branchId: b.id, regles }), existantes);
    if (neuves.length === 0) continue;
    /* Jamais une ligne existante réécrite : un second passage ne remet rien « en attente ». */
    const { error } = await sb.from('envois').upsert(neuves.map((l) => ({ id: l.id, branch_id: l.branchId, data: l })), { onConflict: 'id', ignoreDuplicates: true });
    if (error) erreurs.push(`envois : ${error.message}`);
    else { deposees += neuves.length; for (const l of neuves) existantes.add(l.id); }
  }
  return { deposees, plan, erreurs };
}

Deno.serve(async (req) => {
  if (req.method === 'GET') return json({ fonction: 'assistant-maison', version: VERSION });
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const cleRecue = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!service || cleRecue !== service) return json({ erreur: 'réservé au cron', version: VERSION }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', service);
  const maintenantMs = Date.now();
  const maintenant = new Date(maintenantMs).toISOString();
  const aujourdhui = jourDuSalon(maintenantMs);
  try {
    /* ① JE VIS. */
    const avant = (await document<EtatDuServeur>(sb, CLE_DU_SERVEUR)) ?? {};
    await sb.from('documents').upsert({ key: CLE_DU_SERVEUR, data: { ...avant, vuLe: maintenant, version: VERSION } });

    /* ② LES REMISES DES LIGNES PARTIES, à chaque réveil. */
    const remises = await fabriqueLesRemises(sb, maintenantMs);

    /* ③ LE PASSAGE DU MATIN, une fois par jour, Actif, entre 8 h et 20 h. */
    const brut = await document<unknown>(sb, 'mnd_gerard');
    const r = reglagesLus(brut as Parameters<typeof reglagesLus>[0]);
    const h = heureDuSalon(maintenantMs);
    const du = r.mode !== 'eteint' && avant.passageLe !== aujourdhui && h >= HEURE_DU_PASSAGE_DE && h < HEURE_DU_PASSAGE_A;
    let rapport: { deposees: number; plan: number; erreurs: string[] } | null = null;
    if (du) {
      rapport = await passage(sb, maintenantMs, brut);
      if (rapport.erreurs.length === 0) {
        await sb.from('documents').upsert({ key: CLE_DU_SERVEUR, data: { ...avant, vuLe: maintenant, version: VERSION, passageLe: aujourdhui, deposees: rapport.deposees, remises } });
      }
    }
    return json({ version: VERSION, mode: r.mode === 'eteint' ? 'pause' : 'actif', remises, passage: rapport ?? (du ? null : 'pas maintenant') });
  } catch (e) {
    console.error('assistant-maison', String(e));
    return json({ version: VERSION, erreur: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
