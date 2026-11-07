/* LE RENDEZ-VOUS DU SITE, REGLER ET DEPLACER, EPROUVE : `node scripts/verifie-le-rdv-du-site.mjs`
   (et `--prouve`).

   7 novembre 2026, la page maisonmnd.com/rdv/?v= :
   - « Permettre a la cliente de REGLER son RDV directement sur le site »
     (Yeman) : « Regler des maintenant », avant le jour du rituel ;
   - « DEPLACER son RDV depuis le site, ouvrir le calendrier et changer de
     date » (Yeman) : jusqu'a 24 h avant, aussitot, WhatsApp de confirmation,
     equipe prevenue.
   Les VRAIES fonctions demande-submit (places, deplacer) et
   terminer-et-regler (billet, regler) tournent ici contre une base, un Meta
   et une horloge SIMULES : le mercredi 11 novembre 2026, 10 h a Cotonou.
   Chaque attente est ecrite a la main, d'apres la regle. Tetes, numeros,
   montants INVENTES. Aucun paiement ne part ; rien ne touche la vraie base.
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import { apptIdDuJeton, jetonDuRendezVous, referenceDuRendezVous } from '../src/shared/lien-du-rdv-pur';
import { DELAI_POUR_DEPLACER_MS, arriveeRecevable, deplacementPermis, instantDuRdvDuSite } from '../src/shared/deplacer-du-site-pur';
import { jourDeLaFin } from '../src/shared/terminer-et-regler-pur';
import {
  PHRASE_REGLER_AU_COMPTOIR, PHRASE_REGLER_DES_MAINTENANT, PHRASE_REGLER_LE_JOUR_VENU, REGLEMENT_EN_PANNE, REGLER_DES_MAINTENANT,
  billetDeLaPageLu, billetLu, refusDit, reglementDuBillet, reglerLue,
} from '../src/apps/revelateur/billet-du-rdv-pur';
import {
  MOTS_DU_DEPLACEMENT, deplacementLu, leBoutonDeplacer, placesLues, refusDuDeplacementDit, suiteDuDeplacementDite,
} from '../src/apps/revelateur/deplacer-du-site-pur';
import { etatDuJour, moisDeLHorizon } from '../src/apps/revelateur/calendrier-du-site-pur';

declare const __PANNE__: [string, string[], string, string] | null;
const PANNE = __PANNE__;

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};
/** Un fichier lu, sous la panne en cours (la panne se plante en memoire). */
const lis = (f: string): string => {
  let s = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  if (PANNE && PANNE[1].includes(f)) {
    if (s.split(PANNE[2]).length !== 2) throw new Error(`PANNE INTROUVABLE : ${PANNE[0]} (${f})`);
    s = s.replace(PANNE[2], () => PANNE[3]);
  }
  return s;
};
/** Les francs se disent avec une espace insecable entre les milliers (`francsDits`). */
const nb = (s: string): string => s.replace(/(\d) (\d)/g, '$1 $2');
const sansCommentaires = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const entre = (src: string, nom: string): string | null => {
  const o = `/* ⟨${nom}⟩ */\n`; const f = `\n/* ⟨/${nom}⟩ */`;
  const i = src.indexOf(o); const k = src.indexOf(f, i);
  return i < 0 || k < 0 ? null : src.slice(i + o.length, k);
};

/* ── L'horloge : le mercredi 11 novembre 2026, 10 h a Cotonou. Elle ne bouge pas. ── */
const REEL = Date;
let T0 = REEL.parse('2026-11-11T10:00:00+01:00');
class Horloge extends REEL {
  constructor(...a: unknown[]) { if (a.length === 0) super(T0); else super(...(a as [number])); }
  static now() { return T0; }
}
(globalThis as any).Date = Horloge;

/* ── La base simulee : des lignes { id, branch_id, updated_at, data }, ce que les fonctions
   demandent a supabase-js. Une ecriture fait avancer `updated_at`, comme le declencheur de la base. ── */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
let TIC = 0;
let SEQ = 0;
/** Une main qui ecrit entre la lecture et l'ecriture de la fonction (une seule fois). */
let ENTRE_DEUX: (() => void) | null = null;
function valeur(l: Ligne, col: string): unknown {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (!m) return l[col];
  let v: any = l.data;
  for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
  v = v?.[m[2]];
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [alias, chemin] = brut.includes(':') ? brut.split(':') : [brut.replace(/^data->>/, ''), brut];
    r[alias] = structuredClone(valeur(l, chemin));
  }
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
  private cols = '*';
  private rendre = false;
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule: 'non' | 'peut-etre' | 'oui' = 'non';
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*', o: { count?: string; head?: boolean } = {}) {
    if (this.mode === 'select') { this.cols = cols; this.tete = !!o.head; } else { this.rendre = true; this.cols = cols; }
    return this;
  }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') < String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (valeur(l, c) ?? null) === v); return this; }
  limit(k: number) { this.plafond = k; return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.tri = [c, o.ascending !== false]; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  single() { this.seule = 'oui'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  delete() { this.mode = 'delete'; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any; count?: number } {
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of ([] as any[]).concat(this.charge)) {
        const l: Ligne = { at: new Date().toISOString(), ...structuredClone(brut) };
        if (l.id === undefined && this.t !== 'documents') l.id = ++SEQ;
        if (this.t === 'appointments' && l.updated_at === undefined) l.updated_at = `t${++TIC}`;
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.mode === 'update' && this.t === 'appointments' && ENTRE_DEUX) { const f = ENTRE_DEUX; ENTRE_DEUX = null; f(); }
    let vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) { Object.assign(l, structuredClone(this.charge)); if (this.t === 'appointments') l.updated_at = `t${++TIC}`; }
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.mode === 'delete') {
      for (const l of vues) lignes.splice(lignes.indexOf(l), 1);
      return { data: null, error: null };
    }
    if (this.tri) { const [c, asc] = this.tri; vues = [...vues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c))) * (asc ? 1 : -1)); }
    const compte = vues.length;
    vues = vues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = vues.map((l) => projette(l, this.cols));
    if (this.seule !== 'non') return { data: data[0] ?? null, error: this.seule === 'oui' && !data[0] ? { message: 'aucune ligne' } : null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}
/** `creneaux_occupes` : jour, maitre, debut, duree de chaque rendez-vous vivant (ni annule). */
const RPC: Record<string, (a: any) => unknown> = {
  creneaux_occupes: ({ p_branch, p_du, p_au }) => table('appointments')
    .filter((l) => l.branch_id === p_branch && l.data.status !== 'annulé' && l.data.date >= p_du && l.data.date <= p_au)
    .map((l) => ({ jour: l.data.date, maitre: l.data.master ?? '', debut: l.data.time, duree: l.data.dureeMin ?? 60 })),
};
/** L'agenda illisible : la lecture des creneaux pris echoue, ou rend une tranche de mille (qui cacherait un rendez-vous). */
let PANNE_AGENDA: 'erreur' | 'mille' | null = null;
const client = {
  from: (t: string) => new Requete(t),
  rpc: async (nom: string, args: unknown) => {
    if (nom === 'creneaux_occupes' && PANNE_AGENDA === 'erreur') return { data: null, error: { message: 'panne de banc' } };
    if (nom === 'creneaux_occupes' && PANNE_AGENDA === 'mille') return { data: Array.from({ length: 1000 }, () => ({ jour: '2030-01-01', maitre: 'X', debut: '09:00', duree: 60 })), error: null };
    return RPC[nom] ? { data: RPC[nom](args), error: null } : { data: null, error: { message: 'rpc absente du banc' } };
  },
  storage: { from: () => ({}) },
};

/* ── Deno, Meta, la tache de fond ── */
const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234', WA_TEMPLATE_CONF_LIENS: 'confirmation_rdv_liens',
  VAPID_PUBLIC: 'public-de-banc', VAPID_PRIVATE: 'prive-de-banc',
};
const SECRET = ENV.SUPABASE_SERVICE_ROLE_KEY as string;
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const EN_FOND: Promise<unknown>[] = [];
const META: { modele: string; composants: any[]; to: string }[] = [];
let REPONSES_META: { status: number; corps: unknown }[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).__push = [];
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { EN_FOND.push(p); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    META.push({ modele: corps.template?.name, composants: corps.template?.components ?? [], to: corps.to });
    const r = REPONSES_META.shift() ?? { status: 200, corps: { messages: [{ id: `wamid.banc${++numeroWa}` }] } };
    return new Response(JSON.stringify(r.corps), { status: r.status });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};
const attendsLeFond = async () => { while (EN_FOND.length) await Promise.allSettled(EN_FOND.splice(0)); };

/* ── Les fixtures : la Maison, ses jours, ses maitres, ses clientes (inventees) ── */
const HEURES = ['mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h', close: '19h', closed: false }))
  .concat(['dim', 'lun'].map((key) => ({ key, open: '09h', close: '19h', closed: true })));
table('branches').push({ id: 'br-1', data: { masters: ['Team', 'Expert'], flagship: true, seats: 2 } });
table('documents').push(
  { key: 'mnd_settings', data: { hours: HEURES } },
  { key: 'mnd_horaires_exceptions', data: [{ date: '2026-11-25', closed: true }] },
  { key: 'mnd_vitrine_config', data: {} },
);
table('catalog_services').push(
  { id: 'sv-retwist', data: { name: 'Retwist', categoryId: 'cat-ent', durationMin: 120 } },
  { id: 'sv-shampoing', data: { name: 'Shampoing', categoryId: 'cat-ent', durationMin: 60 } },
);
table('catalog_categories').push({ id: 'cat-ent', data: {} });
table('services').push({ id: 'sv-retwist', data: { name: 'Retwist' } }, { id: 'sv-shampoing', data: { name: 'Shampoing' } });
table('clients').push(
  { id: 'cl-anne', branch_id: 'br-1', data: { name: 'Anne Marie EXEMPLE', civilite: 'madame', phone: '+229 01 00 00 00 01' } },
  { id: 'cl-sol', branch_id: 'br-1', data: { name: 'Sol EXEMPLE', phone: '+229 01 00 00 00 04', passeAuComptoir: true } },
);
table('demandes').push({ id: 'dm-site', data: { apptId: 'ap-site', prenom: 'Sena', civilite: 'mademoiselle', telephone: '+2290100000003' } });
table('blocages').push(
  { id: 'bl-expert', data: { branchId: 'br-1', date: '2026-11-27', master: 'Expert' } },
  { id: 'bl-team', data: { branchId: 'br-1', date: '2026-11-28', master: 'Team' } },
);
table('staff').push({ id: 'st-1', user_id: 'u-1' });
table('push_subscriptions').push({ id: 'ps-1', endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', client_id: 'u-1' });
const rdv = (id: string, date: string, time: string, plus: Record<string, unknown> = {}) => {
  table('appointments').push({
    id, branch_id: 'br-1', updated_at: `t${++TIC}`,
    data: {
      id, branchId: 'br-1', clientId: 'cl-anne', clientName: 'Anne Marie EXEMPLE', serviceIds: ['sv-retwist', 'sv-shampoing'], date, time, dureeMin: 180,
      master: 'Expert', status: 'confirmé', priceXof: 47000, source: 'site', ...plus,
    },
  });
};
/* Celui qu'on deplace, et ceux qui lui font de l'ombre (jamais un vrai nom). */
rdv('ap-a', '2026-11-20', '10:00', { autreMomentDemandeLe: '2026-11-09T08:00:00.000Z', note: 'Fictif' });
rdv('ap-b', '2026-11-24', '10:00', { clientId: '', clientName: 'Autre', dureeMin: 120 });
rdv('ap-c', '2026-11-26', '14:00', { clientId: '', clientName: 'Autre', dureeMin: 60, master: 'Team' });
rdv('ap-lim', '2026-11-12', '10:00', { dureeMin: 120 });
rdv('ap-lim2', '2026-11-12', '10:30', { dureeMin: 60 });
rdv('ap-tot', '2026-11-12', '09:00', { dureeMin: 60, master: 'Team' });
rdv('ap-passe', '2026-11-11', '08:00', { dureeMin: 60 });
rdv('ap-honore', '2026-11-01', '09:00', { status: 'honoré' });
rdv('ap-annule', '2026-11-30', '10:00', { status: 'annulé' });
rdv('ap-attente', '2026-12-01', '10:00', { status: 'en attente', dureeMin: 60 });
rdv('ap-d', '2026-12-08', '10:00', { dureeMin: 60 });
rdv('ap-parent', '2026-12-09', '10:00', { dureeMin: 60, numeroAPrevenir: '+229 01 00 00 00 02' });
rdv('ap-site', '2026-12-10', '10:00', { clientId: '', clientName: 'Sena', dureeMin: 60 });
rdv('ap-sans-prix', '2026-12-02', '10:00', { priceXof: undefined });
rdv('ap-formule', '2026-12-03', '10:00', { coveredBySub: true });
rdv('ap-comptoir', '2026-12-04', '10:00', { clientId: 'cl-sol', priceXof: 20000 });
rdv('ap-acompte', '2026-12-05', '10:00', { priceXof: 30000, depositXof: 10000, depositConfirmed: false });
rdv('ap-regle', '2026-12-06', '10:00', { payments: [{ amountXof: 47000 }] });
rdv('ap-jour', '2026-11-11', '09:00', { priceXof: 12000, dureeMin: 60 });
rdv('ap-r', '2026-12-07', '10:00', { dureeMin: 60 });
rdv('ap-frein', '2026-12-11', '10:00', { dureeMin: 60 });
rdv('ap-frein2', '2026-12-12', '10:00', { dureeMin: 60 });
rdv('ap-frein3', '2026-12-14', '10:00', { dureeMin: 60 });
rdv('ap-pas-de-numero', '2026-12-15', '10:00', { clientId: '', clientName: 'Sans Numero', dureeMin: 60 });

/* Les fonctions, dans cet ordre : demande-submit, puis terminer-et-regler. */
const demande = await import('../supabase/functions/demande-submit/index.ts') as any;
await import('../supabase/functions/terminer-et-regler/index.ts');
const [servirDemande, servirFin] = SERVIS;
let ipN = 0;
const ipNeuve = (): string => `10.${Math.floor(++ipN / 250) + 1}.${ipN % 250}.1`;
const post = (servir: (r: Request) => Promise<Response>, url: string) => async (corps: unknown, ip: string = ipNeuve()) => {
  const r = await servir(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(corps) }));
  return { statut: r.status, corps: await r.json() as any };
};
const appelleD = post(servirDemande, 'http://faux.local/functions/v1/demande-submit');
const appelleT = post(servirFin, 'http://faux.local/functions/v1/terminer-et-regler');
const jeton = (id: string) => jetonDuRendezVous(SECRET, id);
const donnees = (id: string): any => structuredClone(table('appointments').find((l) => l.id === id)!.data);
const miseAJour = (id: string): string => table('appointments').find((l) => l.id === id)!.updated_at;
const AUJOURDHUI = jourDeLaFin(T0);

/* ══ 1. LA REGLE DES 24 HEURES ═════════════════════════════════════════════ */
{
  const v = (status: string, date: string, time: string) => deplacementPermis({ status, date, time }, T0);
  dit('R1 plus de 24 h : permis ; 24 h pile : trop tard ; 23 h : trop tard ; l heure venue : passe',
    ['permis', 'trop-tard', 'trop-tard', 'passe'], [v('confirmé', '2026-11-12', '10:30'), v('confirmé', '2026-11-12', '10:00'), v('confirmé', '2026-11-12', '09:00'), v('confirmé', '2026-11-11', '08:00')]);
  dit('R2 annule se dit annule ; honore ou clos se dit passe ; en attente se deplace ; un statut inconnu ne se deplace pas',
    ['annule', 'passe', 'permis', 'passe'], [v('annulé', '2026-12-01', '10:00'), v('honoré', '2026-12-01', '10:00'), v('en attente', '2026-12-01', '10:00'), v('absent', '2026-12-01', '10:00')]);
  dit('R3 une date ou une heure illisible : illisible, jamais permis', ['illisible', 'illisible', 'illisible'],
    [v('confirmé', '2026-13-45', '10:00'), v('confirmé', '2026-12-01', '25h'), deplacementPermis(null, T0)]);
  dit('R4 la place d arrivee a plus de 24 h aussi : 24 h pile et 23 h refusees, 24 h 30 acceptee', ['creneau_trop_proche', 'creneau_trop_proche', null, 'creneau_invalide'],
    [arriveeRecevable({ date: '2026-11-12', time: '10:00' }, T0), arriveeRecevable({ date: '2026-11-12', time: '09:00' }, T0), arriveeRecevable({ date: '2026-11-12', time: '10:30' }, T0), arriveeRecevable({ date: 'x', time: '10:00' }, T0)]);
  dit('R5 l heure est celle de Cotonou, UTC+1 : 10 h a Cotonou, 9 h UTC', [REEL.parse('2026-11-12T09:30:00Z'), DELAI_POUR_DEPLACER_MS], [instantDuRdvDuSite('2026-11-12', '10:30'), 86_400_000]);
}

/* ══ 2. REGLER DES MAINTENANT ══════════════════════════════════════════════ */
const billetDe = async (id: string) => (await appelleT({ action: 'billet', v: await jeton(id) })).corps;
const pageDe = async (id: string) => reglementDuBillet(billetDeLaPageLu(await billetDe(id))!, AUJOURDHUI);
{
  const b = await billetDe('ap-r');
  dit('G1 avant le jour, la porte d avance est ouverte : le billet le dit, avec le reste du serveur', [true, { ouverte: true, raison: 'ouverte' }, 47000, 'confirme'],
    [b.ok, b.billet?.avance, b.billet?.resteXof, b.billet?.etat]);
  dit('G2 la page : « A regler », 47 000 F, le bouton « Regler des maintenant » et sa phrase',
    { sur: 'À régler', montant: nb('47 000 F'), phrase: PHRASE_REGLER_DES_MAINTENANT, bouton: 'Régler dès maintenant', leJourMeme: false }, await pageDe('ap-r'));
  const sans = async (id: string) => { const p = await pageDe(id); return [p?.montant ?? null, p?.bouton ?? null, p?.phrase ?? null]; };
  dit('G3 sans prix fige : ni bouton ni montant, UNE phrase calme', [null, null, PHRASE_REGLER_LE_JOUR_VENU], await sans('ap-sans-prix'));
  dit('G4 couvert par une formule : ni bouton ni montant, et la phrase juste de toujours (rien a regler : la formule le couvre)', [null, null, 'Il n’y a rien à régler pour ce rendez-vous.'], await sans('ap-formule'));
  dit('G5 « Passe au comptoir » : le montant se dit, pas de bouton, la phrase du comptoir', [nb('20 000 F'), null, PHRASE_REGLER_AU_COMPTOIR], await sans('ap-comptoir'));
  dit('G6 un acompte demande, pas verifie : le montant se dit, pas de bouton, la phrase du comptoir', [nb('30 000 F'), null, PHRASE_REGLER_AU_COMPTOIR], await sans('ap-acompte'));
  const reglee = await pageDe('ap-regle');
  dit('G7 deja regle : « Deja regle », jamais de bouton', ['Déjà réglé', undefined], [reglee?.sur, reglee?.bouton]);
  const jour = await billetDe('ap-jour');
  dit('G8 le jour meme, le rituel commence : plus d « avance » (le bouton « Terminer et regler » prend la place)', [undefined, 'Terminer et régler'],
    [jour.billet?.avance, (await pageDe('ap-jour'))?.bouton]);
  dit('G9 la page ne garde un « avance » que bien forme', [undefined, undefined, undefined, { ouverte: false, raison: 'comptoir' }], [
    billetLu({ ...b.billet, avance: { ouverte: 'oui', raison: 'ouverte' } })?.avance, billetLu({ ...b.billet, avance: { ouverte: true } })?.avance,
    billetLu({ ...b.billet, avance: 'ouverte' })?.avance, billetLu({ ...b.billet, avance: { ouverte: false, raison: 'comptoir' } })?.avance]);
  dit('G10 un billet d une ancienne fonction (sans « avance ») garde la phrase d avant, sans bouton',
    { sur: 'À régler', montant: nb('47 000 F'), phrase: 'Le jour de votre rituel, dès son heure, le bouton « Terminer et régler » paraît ici : vous réglez depuis votre téléphone.', leJourMeme: false },
    reglementDuBillet({ ...billetDeLaPageLu(b)!, avance: undefined }, AUJOURDHUI));
}
{
  const avant = JSON.stringify(donnees('ap-r'));
  const argentAvant = JSON.stringify([table('invoices'), donnees('ap-r').payments ?? null, donnees('ap-r').paidXof ?? null]);
  const r = await appelleT({ action: 'regler', v: await jeton('ap-r'), montant: 1, resteXof: 1 });
  const jetonDuLien = String(donnees('ap-r').lienDeReglement?.jeton ?? '');
  dit('H1 « regler » ouvre la page « Regler » : l adresse de la Maison, le reste ENTIER du serveur (la page n envoie aucun montant, un montant glisse est ignore)',
    [true, 'a-regler', `https://maisonmnd.com/trone/payer.html?tg=r-${jetonDuLien}`, 47000, 'avance'], [r.corps.ok, r.corps.etat, r.corps.adresse, r.corps.resteXof, r.corps.quand]);
  dit('H2 la page relit cette reponse (reglerLue) et n accepte que cette adresse', { etat: 'a-regler', adresse: r.corps.adresse }, reglerLue(r.corps, r.statut));
  dit('H3 le lien se pose sur le rendez-vous, signe « site », la marque que la page « Regler » lit', [true, 'avance', 'site', 14], [
    /^r-/.test(`r-${jetonDuLien}`), donnees('ap-r').lienDeReglement?.depuisLaCouronne?.quand, donnees('ap-r').lienDeReglement?.depuisLaCouronne?.par, jetonDuLien.length]);
  dit('H4 aucun argent ne bouge : ni piece, ni versement, ni paidXof ; le rendez-vous reste confirme au meme prix', [argentAvant, 'confirmé', 47000], [
    JSON.stringify([table('invoices'), donnees('ap-r').payments ?? null, donnees('ap-r').paidXof ?? null]), donnees('ap-r').status, donnees('ap-r').priceXof]);
  dit('H5 hors le lien, rien d autre n a bouge sur le rendez-vous', JSON.parse(avant), (() => { const d = donnees('ap-r'); delete d.lienDeReglement; return d; })());
  const r2 = await appelleT({ action: 'regler', v: await jeton('ap-r') });
  dit('H6 un second toucher rend le MEME lien (le jeton se garde)', [r.corps.adresse, 'a-regler'], [r2.corps.adresse, r2.corps.etat]);
  const fermees = async (id: string) => { const x = await appelleT({ action: 'regler', v: await jeton(id) }); return [x.corps.ok, x.corps.etat, x.corps.adresse ?? null, donnees(id).lienDeReglement ?? null]; };
  dit('H7 sans prix fige : « sans-prix », aucun lien pose', [true, 'sans-prix', null, null], await fermees('ap-sans-prix'));
  dit('H8 couvert par une formule : « couvert », aucun lien', [true, 'couvert', null, null], await fermees('ap-formule'));
  dit('H9 « Passe au comptoir » : « comptoir », aucun lien', [true, 'comptoir', null, null], await fermees('ap-comptoir'));
  dit('H10 un acompte pas verifie : « comptoir », aucun lien', [true, 'comptoir', null, null], await fermees('ap-acompte'));
  dit('H11 deja regle : « deja-regle », aucun lien', [true, 'deja-regle', null, null], await fermees('ap-regle'));
  dit('H12 le jour meme, le rituel commence : « pas-le-moment » (la porte d avance est celle d avant l heure), aucun lien', [true, 'pas-le-moment', null, null], await fermees('ap-jour'));
  dit('H13 annule : « annule », aucun lien', [true, 'annule', null, null], await fermees('ap-annule'));
  dit('H14 en attente (pas confirme) : « pas-confirme », aucun lien', [true, 'pas-confirme', null, null], await fermees('ap-attente'));
  dit('H15 un jeton forge, ou d une autre signature, ou rien : « lien », aucun lien pose', [{ ok: false, error: 'lien' }, { ok: false, error: 'lien' }, { ok: false, error: 'lien' }], [
    (({ ok, error }) => ({ ok, error }))((await appelleT({ action: 'regler', v: 'ap-frein.AAAAAAAAAAAAAAAAAAAAAA' })).corps),
    (({ ok, error }) => ({ ok, error }))((await appelleT({ action: 'regler', v: await jetonDuRendezVous(ENV.CLE_SERVICE as string, 'ap-frein') })).corps),
    (({ ok, error }) => ({ ok, error }))((await appelleT({ action: 'regler' })).corps)]);
  dit('... et rien n a ete pose sur le rendez-vous vise', null, donnees('ap-frein').lienDeReglement ?? null);
  dit('H16 une adresse venue d ailleurs n est jamais crue : un autre domaine, http, un jeton trop court, un jeton avec une majuscule', [
    { etat: 'panne' }, { etat: 'panne' }, { etat: 'panne' }, { etat: 'panne' }], [
    reglerLue({ ok: true, etat: 'a-regler', adresse: `https://autre.example/trone/payer.html?tg=r-${jetonDuLien}` }),
    reglerLue({ ok: true, etat: 'a-regler', adresse: `http://maisonmnd.com/trone/payer.html?tg=r-${jetonDuLien}` }),
    reglerLue({ ok: true, etat: 'a-regler', adresse: 'https://maisonmnd.com/trone/payer.html?tg=r-123' }),
    reglerLue({ ok: true, etat: 'a-regler', adresse: `https://maisonmnd.com/trone/payer.html?tg=r-${jetonDuLien.slice(0, 13)}A` })]);
  dit('H17 une porte restee fermee se dit en une phrase, jamais un code', [
    PHRASE_REGLER_LE_JOUR_VENU, 'Pour votre règlement, l’équipe vous attend au comptoir.', 'Ce rendez-vous est déjà réglé. Merci.'], [
    refusDit('pas-le-moment'), refusDit('comptoir'), refusDit('deja-regle')]);
}

/* ══ 3. LES PLACES ═════════════════════════════════════════════════════════ */
const places = (await appelleD({ rdv: 'places', v: await jeton('ap-a') })).corps;
{
  const jours: Record<string, string[]> = places.jours ?? {};
  dit('P1 les places de SON rendez-vous : de demain a la borne (28 fevrier 2027), 3 h, sa date en pointilles', [true, true, '2026-11-12', '2027-02-28', 180, { date: '2026-11-20', heure: '10:00' }],
    [places.ok, places.deplacable, places.du, places.au, places.dureeMin, places.actuel]);
  const fin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + 180;
  const horsOuverture = Object.entries(jours).flatMap(([j, hs]) => hs.filter((h) => h < '09:00' || fin(h) > 19 * 60).map((h) => `${j} ${h}`));
  dit('P2 chaque heure tient la duree dans l ouverture (9 h a 19 h)', [], horsOuverture);
  const dimLun = Object.keys(jours).filter((j) => [0, 1].includes(new REEL(`${j}T12:00:00Z`).getUTCDay()));
  dit('P3 jamais un dimanche ni un lundi (fermes), ni la fermeture exceptionnelle du 25 novembre ; ils se disent « fermes »', [[], true, true, true],
    [dimLun, !('2026-11-25' in jours), places.fermes?.includes('2026-11-25'), places.fermes?.includes('2026-11-15')]);
  dit('P4 sa propre place est rendue libre : le 20 novembre, toute la journee SAUF 10 h (sa date)', ['09:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], jours['2026-11-20']);
  dit('P5 un autre rituel du meme jour ferme les heures qui le chevauchent : le 24 (Expert, 10 h a 12 h), le 26 (Team, 14 h : un seul rituel a la fois en ligne)',
    [['12:00', '13:00', '14:00', '15:00', '16:00'], ['09:00', '10:00', '11:00', '15:00', '16:00']], [jours['2026-11-24'], jours['2026-11-26']]);
  dit('P6 « le meme maitre » : Expert bloque le 27 (aucune place), Team bloque le 28 (Expert garde toute sa journee)', [false, 8], ['2026-11-27' in jours, (jours['2026-11-28'] ?? []).length]);
  dit('P7 jamais une place a moins de 24 h : le 12 novembre, rien avant 12 h (les rendez-vous du jour sont la), et jamais 10 h pile', [['12:00', '13:00', '14:00', '15:00', '16:00'], false],
    [jours['2026-11-12'], Object.values(jours).some((hs) => hs.length === 0)]);
  dit('P8 jamais au-dela de la borne, et ni le jour meme', [false, false], [Object.keys(jours).some((j) => j > '2027-02-28'), AUJOURDHUI in jours]);
  const lues = placesLues(places);
  dit('P9 la page relit ces places', true, lues.etat === 'pret');
  const mois = moisDeLHorizon(places.du, places.au);
  dit('P10 la grille de la reservation les lit : 4 mois (novembre a fevrier), un jour libre, complet, ferme', [['2026-11', '2026-12', '2027-01', '2027-02'], 'libre', 'complet', 'ferme'], [mois, ...[
    etatDuJour({ iso: '2026-11-21', du: places.du, au: places.au, ferme: places.fermes.includes('2026-11-21'), heures: jours['2026-11-21']?.length ?? 0 }).etat,
    etatDuJour({ iso: '2026-11-27', du: places.du, au: places.au, ferme: places.fermes.includes('2026-11-27'), heures: jours['2026-11-27']?.length ?? 0 }).etat,
    etatDuJour({ iso: '2026-11-25', du: places.du, au: places.au, ferme: places.fermes.includes('2026-11-25'), heures: 0 }).etat]]);
  dit('P11 les places ne portent aucune remise, aucun prix, aucun nom', [false, false], [/remise|prix|price|xof|Anne|EXEMPLE|0100/i.test(JSON.stringify(places)), 'remise' in places]);
  const refus = async (id: string) => (({ ok, deplacable, raison }) => ({ ok, deplacable, raison }))((await appelleD({ rdv: 'places', v: await jeton(id) })).corps);
  dit('P12 a 24 h ou moins : « trop_tard » ; annule ; passe ; honore', [
    { ok: true, deplacable: false, raison: 'trop_tard' }, { ok: true, deplacable: false, raison: 'trop_tard' }, { ok: true, deplacable: false, raison: 'annule' },
    { ok: true, deplacable: false, raison: 'passe' }, { ok: true, deplacable: false, raison: 'passe' }],
    [await refus('ap-lim'), await refus('ap-tot'), await refus('ap-annule'), await refus('ap-passe'), await refus('ap-honore')]);
  dit('P13 un jeton forge ne lit rien', { ok: false, error: 'lien' }, (await appelleD({ rdv: 'places', v: 'ap-a.AAAAAAAAAAAAAAAAAAAAAA' })).corps);
  dit('P14 un jeton d un autre rendez-vous (signature d ap-b sur ap-a) ne lit rien', { ok: false, error: 'lien' },
    (await appelleD({ rdv: 'places', v: `ap-a.${(await jeton('ap-b')).split('.')[1]}` })).corps);
  const efface = await appelleD({ rdv: 'places', v: await jeton('ap-efface') });
  dit('P15 un rendez-vous efface : introuvable', { ok: false, error: 'introuvable' }, efface.corps);
  const lecture = (x: unknown, s?: number) => placesLues(x, s);
  const MAL = [
    { ...places, du: '2026-13-01' }, { ...places, au: 'x' }, { ...places, jours: { '12 novembre': ['10:00'] } }, { ...places, jours: 'rien' },
    { ...places, actuel: null }, { ...places, du: '2027-03-01', au: '2026-11-12' }, { ok: true, deplacable: 'oui' },
    { ...places, jours: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [new REEL(REEL.UTC(2026, 10, 12 + i)).toISOString().slice(0, 10), ['10:00']])) },
  ];
  dit('P16 des places mal formees ne se croient pas (dates, jours, nombre de jours, forme)', MAL.map(() => 'panne'), MAL.map((x) => lecture(x).etat));
  dit('P17 les refus se lisent : trop tard, annule, passe ; le frein ; un lien', ['ferme:trop_tard', 'ferme:annule', 'ferme:passe', 'trop', 'trop', 'lien', 'lien', 'panne'], [
    ...['trop_tard', 'annule', 'passe'].map((r) => { const l = lecture({ ok: true, deplacable: false, raison: r }) as any; return `${l.etat}:${l.raison}`; }),
    lecture({ error: 'rate_limited' }, 429).etat, lecture({ error: 'rate_limited' }).etat, lecture({ ok: false, error: 'lien' }).etat, lecture({ ok: false, error: 'introuvable' }).etat, lecture(null).etat]);
}

{
  /* LES 24 HEURES D'ARRIVEE : a 16 h le mercredi 11, la place du jeudi 12 a 16 h (24 h pile) et celles d avant,
     libres pourtant, ne se proposent pas ; 17 h et 18 h (la derniere, une heure avant la fermeture) oui. */
  rdv('ap-s', '2026-12-13', '10:00', { dureeMin: 60 });
  const garde = T0;
  T0 = REEL.parse('2026-11-11T16:00:00+01:00');
  const soir = (await appelleD({ rdv: 'places', v: await jeton('ap-s') })).corps;
  T0 = garde;
  dit('P18 a 16 h le mercredi, le jeudi 12 : jamais a moins de 24 h (9 h, 11 h a 16 h libres mais refusees), 17 h et 18 h proposees', [['17:00', '18:00'], true], [soir.jours?.['2026-11-12'], soir.jours?.['2026-11-13']?.[0] === '09:00']);
}

/* ══ 4. DEPLACER ═══════════════════════════════════════════════════════════ */
const ligneEnvoi = (id: string) => table('envois').find((e) => e.id === id)?.data;
const poussees = () => (globalThis as any).__push as { title: string; body: string; url: string }[];
const jetonDeA = await jeton('ap-a');
const avantA = donnees('ap-a');
META.length = 0;
poussees().length = 0;
const d1 = await appelleD({ rdv: 'deplacer', v: jetonDeA, date: '2026-11-21', time: '10:00' });
await attendsLeFond();
{
  const apres = donnees('ap-a');
  dit('D1 deplace AUSSITOT : la nouvelle place, la meme reference MND-XXXX, « Mme Anne Marie » (le prenom d usage, jamais le premier mot), mêmes soins, meme duree',
    [200, true, 'deplace', { reference: referenceDuRendezVous('ap-a'), date: '2026-11-21', heure: '10:00', dureeMin: 180, gestes: ['Retwist', 'Shampoing'], appel: 'Mme Anne Marie', statut: 'a-venir' }],
    [d1.statut, d1.corps.ok, d1.corps.verdict, d1.corps.rdv]);
  const attendu = { ...avantA, date: '2026-11-21', time: '10:00', deplaceLe: new REEL(T0).toISOString(), deplacePar: 'site', deplaceDe: { date: '2026-11-20', time: '10:00' } };
  delete (attendu as any).autreMomentDemandeLe;
  dit('D2 sur la ligne : la date et l heure, la marque du deplacement (de quand, par le site, d ou), la marque « autre moment demande » levee, RIEN d autre (ni le maitre, ni la duree, ni les soins, ni le statut, ni le prix, ni la fiche)', attendu, apres);
  dit('D3 aucune remise : le prix reste fige et aucune ligne de remise n est ajoutee', [47000, false, false], [apres.priceXof, 'remisesLignes' in apres, 'discountPct' in apres]);
  dit('D4 le MEME jeton relit le rendez-vous a sa nouvelle place', { ok: true, rdv: d1.corps.rdv }, (await appelleD({ rdv: 'lire', v: jetonDeA })).corps);
  const ref = referenceDuRendezVous('ap-a');
  const corps = META[0]?.composants?.[0]?.parameters?.map((p: { text: string }) => p.text);
  dit('D5 UN seul WhatsApp, au numero de la fiche, le modele de la confirmation a liens : « Mme Anne Marie », la nouvelle date avec son annee, la meme reference',
    [1, 'confirmation_rdv_liens', '2290100000001', ['Mme Anne Marie', 'samedi 21 novembre 2026 à 10 h', ref]], [META.length, META[0]?.modele, META[0]?.to, corps]);
  dit('D6 ses deux boutons portent le meme jeton signe du meme rendez-vous', ['ap-a', 'ap-a'], await Promise.all((META[0]?.composants ?? []).slice(1).map((b: any) => apptIdDuJeton(SECRET, b.parameters?.[0]?.text))));
  const l = ligneEnvoi('depl-ap-a-202611211000-site');
  dit('D7 le journal des envois : une ligne par deplacement, sa cle d unicite, envoyee, d ou et par quelle porte', ['envoyé', { de: { date: '2026-11-20', time: '10:00' }, par: 'site' }, ref, 'confirmation_rdv_liens'],
    [l?.statut, l?.deplacement, l?.reference, l?.modele]);
  dit('D8 le fil de la Maison dit ce qui est parti', true, table('messages_wa').some((m) => String(m.data?.texte).includes(`Votre référence : ${ref}`) && String(m.data?.texte).includes('samedi 21 novembre 2026')));
  dit('D9 l equipe est prevenue, une fois, avec les deux dates dites avec leur annee', [1, 'Rendez-vous déplacé depuis le site', true, '/trone/#/calendrier'],
    [poussees().length, poussees()[0]?.title, /Mme Anne Marie, du vendredi 20 novembre 2026 à 10 h au samedi 21 novembre 2026 à 10 h/.test(String(poussees()[0]?.body)), poussees()[0]?.url]);
  const jg = table('journal_gestes').find((g) => g.id === 'geste-site-depl-ap-a-202611211000');
  dit('D10 le journal du Trone garde le deplacement, avec ses champs avant et apres', [true, [{ champ: 'Date', avant: '2026-11-20', apres: '2026-11-21' }, { champ: 'Heure', avant: '10:00', apres: '10:00' }], 'appointments'],
    [!!jg, jg?.data?.champs, jg?.data?.table]);
  /* UN REJEU, UN DOUBLE TOUCHER : rien ne repart. */
  META.length = 0; poussees().length = 0;
  const d1bis = await appelleD({ rdv: 'deplacer', v: jetonDeA, date: '2026-11-21', time: '10:00' });
  await attendsLeFond();
  dit('D11 le meme appel rejoue : « deja », la meme reponse, aucun second WhatsApp, aucune seconde alerte, aucune ecriture', [200, 'deja', 'deja', 0, 0, JSON.stringify(apres)],
    [d1bis.statut, d1bis.corps.verdict, d1bis.corps.confirmation, META.length + table('envois').filter((e) => /^depl-ap-a-/.test(e.id)).length - 1, poussees().length, JSON.stringify(donnees('ap-a'))]);
  const direct1 = await demande.confirmeLeDeplacement({ apptId: 'ap-a', branchId: 'br-1', clientId: 'cl-anne', appel: 'Mme Anne Marie', numero: '2290100000001', date: '2026-11-21', time: '10:00', de: { date: '2026-11-20', time: '10:00' } });
  dit('D12 meme appele directement, la ligne deja reservee : « deja », rien ne part', ['deja', 0], [direct1, META.length]);
}
{
  /* DEUX TOUCHERS EN MEME TEMPS sur un rendez-vous neuf : une seule confirmation. */
  META.length = 0;
  const j = await jeton('ap-d');
  const [x, y] = await Promise.all([
    appelleD({ rdv: 'deplacer', v: j, date: '2026-12-16', time: '10:00' }), appelleD({ rdv: 'deplacer', v: j, date: '2026-12-16', time: '10:00' })]);
  await attendsLeFond();
  dit('D13 deux touchers au meme instant : deplace une fois, UN seul WhatsApp, une seule ligne d envoi', [true, true, 1, 1, '2026-12-16'],
    [x.corps.ok, y.corps.ok, META.length, table('envois').filter((e) => /^depl-ap-d-/.test(e.id)).length, donnees('ap-d').date]);
}
{
  /* Un rendez-vous neuf par refus : le frein par jeton (huit par dix minutes) ne doit pas les confondre. */
  let Z = 0;
  const neuf = (): string => { const id = `ap-z${++Z}`; rdv(id, '2026-12-02', '10:00', { dureeMin: 180 }); return id; };
  const refuse = async (id: string, date: string, time: string, erreur: string, nom: string, extra: () => unknown = () => null) => {
    const avant = JSON.stringify(donnees(id)); const tic = miseAJour(id); META.length = 0; poussees().length = 0; const envoisAvant = table('envois').length;
    const r = await appelleD({ rdv: 'deplacer', v: await jeton(id), date, time });
    await attendsLeFond();
    dit(nom, [200, false, erreur, avant, tic, 0, 0, envoisAvant, extra()], [r.statut, r.corps.ok, r.corps.error, JSON.stringify(donnees(id)), miseAJour(id), META.length, poussees().length, table('envois').length, extra()]);
  };
  await refuse('ap-lim', '2026-11-21', '10:00', 'trop_tard', 'E1 un rendez-vous a 24 h pile : « trop_tard », rien ne bouge, rien ne part');
  await refuse('ap-tot', '2026-11-21', '10:00', 'trop_tard', 'E2 a 23 h : « trop_tard »');
  await refuse('ap-annule', '2026-12-17', '10:00', 'annule', 'E3 un rendez-vous annule : « annule »');
  await refuse('ap-passe', '2026-12-17', '10:00', 'passe', 'E4 une heure deja venue : « passe »');
  await refuse('ap-honore', '2026-12-17', '10:00', 'passe', 'E5 un rendez-vous honore : « passe »');
  await refuse(neuf(), '2026-11-12', '09:00', 'creneau_trop_proche', 'E6 une place d arrivee a 23 h : « creneau_trop_proche »');
  await refuse(neuf(), '2026-11-12', '10:00', 'creneau_trop_proche', 'E7 une place d arrivee a 24 h pile : « creneau_trop_proche »');
  await refuse(neuf(), '2026-11-11', '16:00', 'creneau_hors_fenetre', 'E8 le jour meme : « creneau_hors_fenetre »');
  await refuse(neuf(), '2027-03-01', '10:00', 'creneau_hors_fenetre', 'E9 au-dela de la borne (28 fevrier 2027) : « creneau_hors_fenetre »');
  await refuse(neuf(), '2026-11-22', '10:00', 'creneau_ferme', 'E10 un dimanche : « creneau_ferme »');
  await refuse(neuf(), '2026-11-25', '10:00', 'creneau_ferme', 'E11 une fermeture exceptionnelle : « creneau_ferme »');
  await refuse(neuf(), '2026-11-21', '17:00', 'creneau_hors_ouverture', 'E12 une heure qui deborde la fermeture (3 h a 17 h) : « creneau_hors_ouverture »');
  await refuse(neuf(), '2026-12-02', '10:00', 'meme_place', 'E13 la place qu il occupe deja : « meme_place »');
  await refuse(neuf(), 'demain', '10:00', 'creneau_invalide', 'E14 une date mal formee : « creneau_invalide »');
  await refuse(neuf(), '2026-11-21', '25h', 'creneau_invalide', 'E15 une heure mal formee : « creneau_invalide »');
  await refuse(neuf(), '2026-11-24', '10:00', 'creneau_pris', 'E16 une place prise (Expert, 10 h a 12 h le 24) : « creneau_pris »');
  await refuse(neuf(), '2026-11-24', '11:00', 'creneau_pris', 'E17 ... aussi par un chevauchement');
  await refuse(neuf(), '2026-11-26', '12:00', 'creneau_pris', 'E18 une place prise par l autre maitre : un seul rituel a la fois en ligne');
  await refuse(neuf(), '2026-11-27', '10:00', 'creneau_pris', 'E19 le maitre de SON rendez-vous est bloque ce jour-la (Expert le 27) : « creneau_pris »');
  /* Un jeton qui n est pas le sien. */
  const avantA2 = JSON.stringify(donnees('ap-a'));
  const forge = await appelleD({ rdv: 'deplacer', v: `ap-a.${(await jeton('ap-b')).split('.')[1]}`, date: '2026-12-18', time: '10:00' });
  dit('E20 le jeton d une autre tete (la signature d ap-b sur ap-a) ne deplace rien', [{ ok: false, error: 'lien' }, avantA2], [{ ok: forge.corps.ok, error: forge.corps.error }, JSON.stringify(donnees('ap-a'))]);
  const sien = await appelleD({ rdv: 'deplacer', v: await jeton('ap-b'), date: '2026-12-18', time: '10:00' });
  dit('E21 et le sien ne deplace QUE le sien : ap-b bouge, ap-a pas', [true, '2026-12-18', avantA2], [sien.corps.ok, donnees('ap-b').date, JSON.stringify(donnees('ap-a'))]);
  dit('E22 un rendez-vous efface : introuvable, rien ne part', { ok: false, error: 'introuvable' }, (await appelleD({ rdv: 'deplacer', v: await jeton('ap-efface'), date: '2026-12-18', time: '10:00' })).corps);
}
{
  /* LA PLACE QU'ELLE QUITTE EST LIBEREE, la sienne ne la bloque pas, et la derniere heure de son jour. */
  const r = await appelleD({ rdv: 'deplacer', v: await jeton('ap-a'), date: '2026-11-21', time: '11:00' });
  dit('F1 il peut glisser sur sa propre journee (sa propre place est rendue libre) : 21 novembre, de 10 h a 11 h', [true, '11:00', 'deplace'], [r.corps.ok, donnees('ap-a').time, r.corps.verdict]);
  dit('F2 la place quittee se libere pour les autres : le 20 novembre, 10 h redevient libre pour la suivante', true, (await appelleD({ rdv: 'places', v: await jeton('ap-d') })).corps.jours?.['2026-11-20']?.includes('10:00'));
  META.length = 0;
  const arrivee = await appelleD({ rdv: 'deplacer', v: await jeton('ap-sans-prix'), date: '2026-11-13', time: '09:00' });
  await attendsLeFond();
  dit('F3 une place d arrivee a plus de 24 h (le 13 a 9 h) passe ; le sans-prix se deplace aussi (son prix ne se devine pas, il ne change pas)', [true, undefined], [arrivee.corps.ok, donnees('ap-sans-prix').priceXof]);
  META.length = 0;
  const att = await appelleD({ rdv: 'deplacer', v: await jeton('ap-attente'), date: '2026-12-16', time: '15:00' });
  await attendsLeFond();
  dit('F4 un rendez-vous « en attente » se deplace, reste « en attente », n est pas dit confirme : aucun WhatsApp, la page dit que la Maison confirmera', [true, 'plus-tard', 'en attente', 0, undefined, 'La Maison est prévenue et vous confirme cette nouvelle date sur WhatsApp. Votre référence ne change pas : ' + referenceDuRendezVous('ap-attente') + '.'],
    [att.corps.ok, att.corps.confirmation, donnees('ap-attente').status, META.length, ligneEnvoi('depl-ap-attente-202612161500-site'), suiteDuDeplacementDite({ confirmation: 'plus-tard', reference: referenceDuRendezVous('ap-attente') })]);
  META.length = 0;
  await appelleD({ rdv: 'deplacer', v: await jeton('ap-parent'), date: '2026-12-17', time: '10:00' });
  await attendsLeFond();
  dit('F5 un rendez-vous pris par un parent : le message va au numero a prevenir, pas a la fiche', ['2290100000002'], META.map((m) => m.to));
  META.length = 0;
  await appelleD({ rdv: 'deplacer', v: await jeton('ap-site'), date: '2026-12-17', time: '12:00' });
  await attendsLeFond();
  dit('F6 une reservation du site sans fiche : le numero et la civilite de sa demande (« Mlle Sena »)', [['2290100000003'], 'Mlle Sena'], [META.map((m) => m.to), META[0]?.composants?.[0]?.parameters?.[0]?.text]);
  META.length = 0;
  const sansNum = await appelleD({ rdv: 'deplacer', v: await jeton('ap-pas-de-numero'), date: '2026-12-17', time: '14:00' });
  await attendsLeFond();
  dit('F7 aucun numero connu : le rendez-vous est deplace, rien ne part, la page dit seulement que la Maison est prevenue', [true, 0, 'sans', 'La Maison est prévenue. Votre référence ne change pas : ' + referenceDuRendezVous('ap-pas-de-numero') + '.'],
    [sansNum.corps.ok, META.length, deplacementLu(sansNum.corps).etat === 'deplace' ? (deplacementLu(sansNum.corps) as any).confirmation : 'x', suiteDuDeplacementDite({ confirmation: 'sans', reference: referenceDuRendezVous('ap-pas-de-numero') })]);
  /* Meta refuse : le rendez-vous reste deplace, le journal dit l'echec, rien ne repart. */
  rdv('ap-meta', '2026-12-21', '10:00', { dureeMin: 60 });
  META.length = 0;
  REPONSES_META = [{ status: 400, corps: { error: { code: 131026, message: 'refus de banc' } } }];
  const refusMeta = await appelleD({ rdv: 'deplacer', v: await jeton('ap-meta'), date: '2026-12-22', time: '10:00' });
  await attendsLeFond();
  dit('F8 Meta refuse (numero hors WhatsApp) : le rendez-vous est quand meme deplace, la ligne dit « échec », un seul essai', [true, '2026-12-22', 1, 'échec', 131026], [
    refusMeta.corps.ok, donnees('ap-meta').date, META.length, ligneEnvoi('depl-ap-meta-202612221000-site')?.statut, ligneEnvoi('depl-ap-meta-202612221000-site')?.codeMeta]);
  /* Meta refuse le modele a liens : l'ancien part, une seule fois. */
  rdv('ap-meta2', '2026-12-23', '10:00', { dureeMin: 60 });
  META.length = 0;
  REPONSES_META = [{ status: 400, corps: { error: { code: 132001, message: 'modele refuse' } } }];
  await appelleD({ rdv: 'deplacer', v: await jeton('ap-meta2'), date: '2026-12-24', time: '10:00' });
  await attendsLeFond();
  dit('F9 Meta refuse le modele a liens (#132001) : l ancienne confirmation part dans la meme seconde, deux variables', [['confirmation_rdv_liens', 'confirmation_rdv'], 2, 'envoyé'],
    [META.map((m) => m.modele), META[1]?.composants?.[0]?.parameters?.length, ligneEnvoi('depl-ap-meta2-202612241000-site')?.statut]);
}
{
  /* UNE LIGNE QUI A BOUGE ENTRE LA LECTURE ET L'ECRITURE : relue, rejugee, jamais ecrasee. */
  rdv('ap-ecrit', '2026-12-28', '10:00', { dureeMin: 60 });
  ENTRE_DEUX = () => { const l = table('appointments').find((x) => x.id === 'ap-ecrit')!; l.data = { ...l.data, note: 'ecrit par le Trone' }; l.updated_at = `t${++TIC}`; };
  const r = await appelleD({ rdv: 'deplacer', v: await jeton('ap-ecrit'), date: '2026-12-29', time: '10:00' });
  await attendsLeFond();
  dit('C1 le Trone ecrit entre-temps : la fonction relit, rejuge, et ecrit SANS effacer ce que le Trone venait d ecrire', [true, '2026-12-29', 'ecrit par le Trone'], [r.corps.ok, donnees('ap-ecrit').date, donnees('ap-ecrit').note]);
  rdv('ap-annule-entre', '2026-12-28', '14:00', { dureeMin: 60 });
  ENTRE_DEUX = () => { const l = table('appointments').find((x) => x.id === 'ap-annule-entre')!; l.data = { ...l.data, status: 'annulé' }; l.updated_at = `t${++TIC}`; };
  META.length = 0;
  const r2 = await appelleD({ rdv: 'deplacer', v: await jeton('ap-annule-entre'), date: '2026-12-29', time: '14:00' });
  await attendsLeFond();
  dit('C2 annule entre-temps : rejuge, « annule », la date ne bouge pas, rien ne part', [false, 'annule', '2026-12-28', 0], [r2.corps.ok, r2.corps.error, donnees('ap-annule-entre').date, META.length]);
  rdv('ap-pris-entre', '2026-12-28', '16:00', { dureeMin: 60 });
  ENTRE_DEUX = () => { rdv('ap-vole', '2026-12-30', '10:00', { clientId: '', dureeMin: 60 }); const l = table('appointments').find((x) => x.id === 'ap-pris-entre')!; l.updated_at = `t${++TIC}`; };
  const r3 = await appelleD({ rdv: 'deplacer', v: await jeton('ap-pris-entre'), date: '2026-12-30', time: '10:00' });
  dit('C3 la place est prise entre la lecture et l ecriture : rejugee sur un agenda FRAIS, « creneau_pris », la date ne bouge pas', [false, 'creneau_pris', '2026-12-28'], [r3.corps.ok, r3.corps.error, donnees('ap-pris-entre').date]);
  dit('C4 la page dit « place prise » calmement, sans rien promettre, et le rendez-vous n a pas bouge', ['place_prise', 'Cette place vient d’être prise. Choisissez-en une autre, votre rendez-vous n’a pas bougé.'],
    [(deplacementLu(r3.corps) as any).raison, refusDuDeplacementDit('place_prise')]);
}
{
  /* Regler d'avance, puis deplacer : le paiement suit le rendez-vous. */
  const j = await jeton('ap-r');
  const lien = donnees('ap-r').lienDeReglement;
  const r = await appelleD({ rdv: 'deplacer', v: j, date: '2026-12-18', time: '14:00' });
  await attendsLeFond();
  dit('K1 un rendez-vous dont le lien de reglement est pose garde « Deplacer » ; le lien (donc le paiement) le SUIT, intact', [true, lien, '2026-12-18'], [r.corps.ok, donnees('ap-r').lienDeReglement, donnees('ap-r').date]);
  const b = await billetDe('ap-r');
  dit('K2 le billet, a sa nouvelle date, dit toujours la porte d avance ouverte et le meme reste', [true, 47000], [b.billet?.avance?.ouverte, b.billet?.resteXof]);
}

{
  /* UNE LECTURE QUI MANQUE REFUSE : croire l agenda vide, c etait poser un rendez-vous sur un autre. */
  for (const panne of ['erreur', 'mille'] as const) {
    const id = `ap-panne-${panne}`;
    rdv(id, '2026-12-22', '10:00', { dureeMin: 60 });
    const avant = JSON.stringify(donnees(id));
    PANNE_AGENDA = panne;
    META.length = 0;
    const p = await appelleD({ rdv: 'places', v: await jeton(id) });
    const d = await appelleD({ rdv: 'deplacer', v: await jeton(id), date: '2026-12-23', time: '10:00' });
    PANNE_AGENDA = null;
    dit(`L1 agenda illisible (${panne === 'erreur' ? 'la lecture echoue' : 'une tranche de mille creneaux'}) : ni places ni deplacement, « agenda_illisible », rien ne bouge, rien ne part`,
      [{ ok: false, error: 'agenda_illisible' }, { ok: false, error: 'agenda_illisible' }, avant, 0],
      [{ ok: p.corps.ok, error: p.corps.error }, { ok: d.corps.ok, error: d.corps.error }, JSON.stringify(donnees(id)), META.length]);
    dit('... la page le dit en panne, jamais « place prise »', ['panne', 'panne'], [placesLues(p.corps).etat, (deplacementLu(d.corps) as any).raison]);
  }
}

/* ══ 5. LES FREINS : par adresse ET par jeton ══════════════════════════════ */
{
  const rafale = async (corps: () => Promise<unknown>, nb: number, ipFixe?: string) => {
    const s: number[] = [];
    for (let i = 0; i < nb; i++) s.push((await (ipFixe ? appelleT(await corps(), ipFixe) : appelleT(await corps()))).statut);
    return s;
  };
  void rafale;
  const statuts = async (appelle: typeof appelleD, corps: () => Promise<unknown>, nb: number, ipFixe?: string) => {
    const s: number[] = [];
    for (let i = 0; i < nb; i++) s.push((await appelle(await corps(), ipFixe)).statut);
    return s;
  };
  const inconnu = async () => ({ action: 'regler', v: 'ap-frein.AAAAAAAAAAAAAAAAAAAAAA' });
  const a = await statuts(appelleT, inconnu, 21, '10.200.0.1');
  dit('M1 regler : vingt appels par adresse en dix minutes (comme terminer), le vingt et unieme attend', [200, 429], [a[19], a[20]]);
  const par = await statuts(appelleT, async () => ({ action: 'regler', v: await jeton('ap-frein') }), 13);
  dit('M2 regler : douze appels par jeton, d ou qu ils viennent ; le treizieme attend', [200, 429], [par[11], par[12]]);
  const pl = await statuts(appelleD, async () => ({ rdv: 'places', v: 'x' }), 31, '10.200.0.2');
  dit('M3 places : trente appels par adresse, la trente et unieme attend', [200, 429], [pl[29], pl[30]]);
  const plj = await statuts(appelleD, async () => ({ rdv: 'places', v: await jeton('ap-frein2') }), 41);
  dit('M4 places : quarante appels par jeton, le quarante et unieme attend', [200, 429], [plj[39], plj[40]]);
  const de = await statuts(appelleD, async () => ({ rdv: 'deplacer', v: 'x' }), 11, '10.200.0.3');
  dit('M5 deplacer : dix appels par adresse, le onzieme attend', [200, 429], [de[9], de[10]]);
  const dej = await statuts(appelleD, async () => ({ rdv: 'deplacer', v: await jeton('ap-frein3'), date: 'x', time: 'x' }), 9);
  dit('M6 deplacer : huit appels par jeton, le neuvieme attend', [200, 429], [dej[7], dej[8]]);
  dit('M7 le frein dit « rate_limited » et la page le lit : « trop »', ['rate_limited', 'trop', 'trop'], [(await appelleD({ rdv: 'deplacer', v: 'x' }, '10.200.0.3')).corps.error, placesLues({ error: 'rate_limited' }, 429).etat, deplacementLu({ error: 'rate_limited' }, 429).etat]);
  dit('M8 les seaux sont separes : lire son rendez-vous n est pas freine par les places', true, (await appelleD({ rdv: 'lire', v: 'x' }, '10.200.0.2')).statut === 200);
}

/* ══ 6. LA PAGE : les boutons, les mots, la lecture ═══════════════════════ */
{
  const r = (date: string, heure: string, statut: 'a-venir' | 'passe' | 'annule' = 'a-venir') => leBoutonDeplacer({ statut, date, heure }, T0);
  dit('B1 Deplacer ouvre le calendrier a plus de 24 h, ecrit a la Maison a 24 h ou moins, ne parait pas pour un passe ou un annule',
    ['ouvert', 'ecrire', 'ecrire', 'rien', 'rien', 'rien'], [r('2026-11-12', '10:30'), r('2026-11-12', '10:00'), r('2026-11-11', '16:00'), r('2026-11-11', '08:00'), r('2026-12-01', '10:00', 'annule'), r('2026-12-01', '10:00', 'passe')]);
  const phrases = [
    ...Object.values(MOTS_DU_DEPLACEMENT), PHRASE_REGLER_AU_COMPTOIR, PHRASE_REGLER_DES_MAINTENANT, PHRASE_REGLER_LE_JOUR_VENU, REGLEMENT_EN_PANNE, REGLER_DES_MAINTENANT,
    ...(['place_prise', 'trop_tard', 'annule', 'passe', 'meme_place', 'lien', 'modifie', 'panne'] as const).map(refusDuDeplacementDit),
    suiteDuDeplacementDite({ confirmation: 'envoyee', reference: 'MND-KA7J' }), suiteDuDeplacementDite({ confirmation: 'sans', reference: 'MND-KA7J' }),
    ...['pas-le-moment', 'sans-prix', 'couvert', 'comptoir', 'deja-regle', 'annule', 'en-preparation'].map(refusDit),
  ];
  dit('B2 jamais de « — », jamais « salon », jamais « maitre/maitresse » dans ce que lit une cliente', [[], [], []], [
    phrases.filter((p) => /—/.test(p)), phrases.filter((p) => /salon/i.test(p)), phrases.filter((p) => /ma[iî]tre/i.test(p))]);
  dit('B3 le vouvoiement : aucun « tu », « ton », « ta » dans ces phrases', [], phrases.filter((p) => /\b(tu|ton|ta|tes|te)\b/i.test(p)));
  dit('B4 l ecran « Rendez-vous deplace » : la reponse du serveur se lit (appel, date, reference) ; la reponse sans verdict, sans reference ou d un rendez-vous passe ne se croit pas',
    [{ etat: 'deplace', appel: 'Mme Anne Marie', confirmation: 'envoyee' }, 'refus', 'refus', 'refus'], (() => {
      const bon = deplacementLu({ ...d1.corps, confirmation: 'envoyé' }) as any;
      return [{ etat: bon.etat, appel: bon.rdv?.appel, confirmation: bon.confirmation }, deplacementLu({ ...d1.corps, verdict: undefined }).etat,
        deplacementLu({ ...d1.corps, rdv: { ...d1.corps.rdv, reference: 'faux' } }).etat, deplacementLu({ ...d1.corps, rdv: { ...d1.corps.rdv, statut: 'passe' } }).etat];
    })());
  const raisons: [string, string][] = [['creneau_pris', 'place_prise'], ['creneau_plafond', 'place_prise'], ['creneau_ferme', 'place_prise'], ['creneau_trop_proche', 'place_prise'], ['trop_tard', 'trop_tard'], ['annule', 'annule'], ['passe', 'passe'], ['meme_place', 'meme_place'], ['modifie', 'modifie'], ['lien', 'lien'], ['panne', 'panne']];
  dit('B5 chaque refus du serveur se dit d une phrase', raisons.map(([, d]) => d), raisons.map(([e]) => (deplacementLu({ ok: false, error: e }) as any).raison));
}

/* ══ 7. LES SOURCES : la page, la copie, la synchronisation, les 390 px ═══ */
{
  const ILOT = lis('src/apps/revelateur/ilots/MonRendezVous.tsx');
  const CAL = lis('src/apps/revelateur/ilots/DeplacerLeRendezVous.tsx');
  const CSS = lis('src/apps/revelateur/revelateur.css');
  const DEPL = lis('src/apps/revelateur/deplacer-du-site-pur.ts');
  const DS = lis('supabase/functions/demande-submit/index.ts');
  const REGLE = lis('src/shared/deplacer-du-site-pur.ts');
  dit('S1 « Regler des maintenant » ne demande au serveur que le jeton : jamais un montant', [true, false, false], [
    ILOT.includes("demandeALaFin({ action: 'regler', v: jeton })"), /action: 'regler'[^)]*(montant|resteXof|amount|prix)/i.test(sansCommentaires(ILOT)), /resteXof\s*[=+*-]/.test(sansCommentaires(ILOT))]);
  dit('... et mene a la page « Regler » par la seule adresse relue (reglerLue)', [true, 2], [
    ILOT.includes('const r = reglerLue(data, statut);') && ILOT.includes("if (r.etat === 'a-regler') { location.assign(r.adresse); return; }"), ILOT.split("if (r.etat === 'a-regler') { location.assign(r.adresse); return; }").length - 1]);
  dit('S2 le bouton « Regler des maintenant » appelle regler(), pas terminer()', true, ILOT.includes('void (reglement.bouton === REGLER_DES_MAINTENANT ? regle() : termine());'));
  dit('S3 « Deplacer » ouvre le calendrier dans la page jusqu a 24 h, sinon ecrit a la Maison ; Annuler reste un WhatsApp', [true, true, true], [
    ILOT.includes("{boutonDeplacer === 'ouvert' && !agendaSeul") && ILOT.includes('onClick={() => setCalendrierOuvert(true)}'),
    ILOT.includes('const boutonDeplacer = leBoutonDeplacer(r, Date.now());'), /motPourAnnuler\(quand, r\.reference\)\)\} target="_blank"/.test(ILOT)]);
  dit('S4 l ecran « Rendez-vous deplace » dit le prenom d usage du serveur et la reference qui ne change pas, avec « Ajouter a mon agenda » (le meme fichier .ics)', [true, true, true], [
    ILOT.includes("<h2>{nr.appel ? `${nr.appel}, c’est noté.` : 'C’est noté.'}</h2>"), ILOT.includes("const nr = { ...deplace.rdv, reference: deplace.rdv.reference || (apptId ? referenceDuRendezVous(apptId) : '') };"),
    ILOT.includes('download={nomDuFichierAgenda(nr.date)}>Ajouter à mon agenda</a>')]);
  dit('S5 le prenom ne se coupe jamais au premier mot (ni la page, ni le calendrier, ni la lecture, ni le serveur)', [], [
    ['ilot', ILOT], ['calendrier', CAL], ['lecture', DEPL],
    ['serveur', DS.slice(DS.indexOf('/* ⟨/deplacer-du-site⟩ */'), DS.indexOf('/* ══ LA CLIENTE QUI REVIENT'))],
  ].filter(([, s]) => /split\((' '|\/\\s\+\/)\)\s*\[0\]/.test(s)).map(([nom]) => nom));
  dit('S6 le calendrier reutilise la grille de la reservation : memes classes, memes regles pures, aucun calcul de calendrier a lui', [true, true, false], [
    ['className="mois-du-site"', 'mois-du-site__tete', 'mois-du-site__grille', 'mois-du-site__jour', 'mois-du-site__legende'].every((c) => CAL.includes(c)) && CAL.includes("from '../calendrier-du-site-pur'"),
    ['etatDuJour', 'grilleDuMois', 'moisDeLHorizon', 'sensDuGlisse', 'libelleDuJour'].every((f) => CAL.includes(f)), /new Date\(Date\.UTC\(/.test(CAL)]);
  dit('S7 un jour ferme ou complet ne se touche pas ; « Deplacer a ce moment » n est actif qu avec un jour ET une heure ; le serveur recoit la date et l heure, rien d autre ; une place prise garde le jour choisi et relit les places', [true, true, true, true], [
    CAL.includes('disabled={!libre}'), CAL.includes('disabled={!jour || !heure || enCours}'), CAL.includes("{ rdv: 'deplacer', v: jeton, date: jour, time: heure }"),
    CAL.includes("if (r.raison === 'place_prise') { setHeure(null); setEssai((n) => n + 1); }")]);
  dit('S8 le calendrier ne promet aucune remise : pas de remise, pas de prix, dans sa legende', [false, true], [/remise|prix|−\d|-15/i.test(CAL.replace(/\/\*[\s\S]*?\*\//g, '')), CAL.includes('votre date')]);
  dit('S9 le jeton se lit dans l adresse, jamais en texte a l ecran', [true, false], [CAL.includes("jetonDeLAdresse(typeof location === 'undefined' ? '' : location.search)"), /\{jeton\}|\{v\}/.test(CAL + ILOT)]);
  dit('S10 la copie de la regle des 24 heures dans demande-submit est celle de l original, caractere pour caractere', [true, true], [entre(REGLE, 'deplacer-du-site') !== null && entre(REGLE, 'deplacer-du-site') === entre(DS, 'deplacer-du-site'),
    (entre(DS, 'deplacer-du-site') ?? '').includes('export function deplacementPermis(')]);
  const graphe: string[] = JSON.parse(process.env.RDV_GRAPHE ?? '[]');
  dit('S11 vue du site, la page ne charge JAMAIS la synchronisation du Trone, l identite, l authentification ni les magasins', [], graphe.filter((f) => /src\/shared\/(identite|sync|auth|version|branches|store|clients|settings)\.ts$/.test(f)));
  dit('S12 ... elle charge bien le calendrier du site (sa regle pure) et le calendrier du deplacement', [true, true], [
    graphe.includes('src/apps/revelateur/calendrier-du-site-pur.ts'), graphe.includes('src/apps/revelateur/ilots/DeplacerLeRendezVous.tsx')]);
  /* 390 px : aucune regle neuve ne fixe une largeur plus grande que l ecran, la grille se rétrécit (minmax(0, 1fr)), rien ne force un defilement lateral. */
  const neuf = CSS.slice(CSS.indexOf('/* DÉPLACER AVEC LE CALENDRIER'), CSS.indexOf('.rdv-cherche .champ { max-width: 360px; }'));
  const largeurs = [...neuf.matchAll(/(?:^|[;{\s])(?:min-)?width:\s*(\d+)px/g)].map((m) => Number(m[1]));
  dit('S13 390 px : une regle neuve a bien ete ecrite, aucune largeur fixe au-dela de 390 px, rien de force en largeur', [true, [], false], [neuf.length > 200, largeurs.filter((w) => w > 390), /overflow-x:\s*scroll|white-space:\s*nowrap/.test(neuf)]);
  const grille = CSS.slice(CSS.indexOf('.mois-du-site__semaine, .mois-du-site__grille'), CSS.indexOf('.mois-du-site__semaine, .mois-du-site__grille') + 120);
  dit('S14 ... et la grille elle-meme se rétrécit : sept colonnes minmax(0, 1fr), la page sans debordement lateral (min-width: 0)', [true, true, true], [
    /repeat\(7, minmax\(0, 1fr\)\)/.test(grille), /\.rdv-page__deplacer \{[^}]*min-width: 0/.test(neuf), /\.rdv-page \{[^}]*min-width: 0/.test(CSS)]);
  const serviFin = await servirFin(new Request('http://f/', { method: 'GET' }));
  const versionFin = (await serviFin.json() as any).version as string;
  const serviDemande = await servirDemande(new Request('http://f/', { method: 'GET' }));
  const versionDemande = (await serviDemande.json() as any).version as string;
  dit('S15 les deux fonctions disent leur version : terminer-et-regler 2026-11-07-d, demande-submit 2026-11-07-a', [true, true], [/^2026-11-07-d · /.test(versionFin), /^2026-11-07-a · /.test(versionDemande)]);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? `, ${ko} en echec` : ''}.`);
if (ko) process.exitCode = 1;
