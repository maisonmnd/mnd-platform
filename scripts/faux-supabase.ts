/* UN FAUX SUPABASE, EN MÉMOIRE — pour éprouver la VRAIE synchronisation
   (`bindCollection`, `bindDocument`) sans réseau. 4 octobre 2026, la file
   d'attente durable.

   Il remplace `src/shared/supabase.ts` au moment de la construction du
   harnais (esbuild). La base, l'état du réseau, la session et les canaux
   vivent sur `globalThis.__faux` : deux « séances » (deux chargements du
   module de synchro) voient la même base, comme deux ouvertures du Trône
   voient le même serveur.

   Ce qu'il sait faire, exactement ce que la synchro demande : lire par pages
   (`select('id,data').order().limit().gt()`), lire les heures
   (`select('id,updated_at').in()`), écrire (`upsert`, `delete().in()`), les
   documents (`eq('key').maybeSingle()`), la session, et le canal temps réel
   qui renvoie chaque écriture à tous les abonnés (l'écho compris). Réseau
   coupé : chaque requête répond « Failed to fetch ». */

type Ligne = { id: string; branch_id?: string | null; data: unknown; updated_at: string };
type Ecoute = (payload: Record<string, unknown>) => void;
type Faux = {
  base: Map<string, Map<string, Ligne>>;
  enLigne: boolean;
  session: unknown;
  ecoutes: Set<Ecoute>;
  /* L'horloge du serveur : chaque écriture prend une heure strictement
     croissante, pour que les comparaisons soient nettes. */
  horloge: number;
  ecritures: number;
};
const g = globalThis as unknown as { __faux?: Faux };
export const faux: Faux = g.__faux ??= {
  base: new Map(), enLigne: true, session: { user: { id: 'u1' }, access_token: 't' }, ecoutes: new Set(), horloge: Date.now(), ecritures: 0,
};
/* LA BASE SURVIT AU PROCESSUS (le harnais lance une « séance » par processus,
   comme on ferme et rouvre le Trône) : `FAUX_ETAT` nomme le dossier, et
   `FAUX_RESEAU=0` coupe le réseau de cette séance. */
const dossier = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FAUX_ETAT;
const fs = dossier ? (await import('node:fs')) : null;
if (dossier && fs && fs.existsSync(`${dossier}/base.json`)) {
  const brut = JSON.parse(fs.readFileSync(`${dossier}/base.json`, 'utf8')) as { horloge: number; tables: Record<string, Ligne[]> };
  faux.horloge = brut.horloge;
  faux.base = new Map(Object.entries(brut.tables).map(([t, ls]) => [t, new Map(ls.map((l) => [l.id, l]))]));
}
if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FAUX_RESEAU === '0') faux.enLigne = false;
export const sauveLaBase = (): void => {
  if (!dossier || !fs) return;
  fs.writeFileSync(`${dossier}/base.json`, JSON.stringify({
    horloge: faux.horloge,
    tables: Object.fromEntries([...faux.base].map(([t, m]) => [t, [...m.values()]])),
  }));
};
/* LE VRAI SERVEUR, EN QUATRE TRAITS (17 octobre 2026, le conflit du Wi-Fi) :
   `FAUX_AVANCE_MS` met son horloge en avance sur celle du poste, `FAUX_ECHO_MS`
   retarde l'écho temps réel, `FAUX_LATENCE_MS` retarde chaque réponse, et
   `FAUX_JSONB=1` range les champs d'un document comme jsonb (par longueur,
   puis par ordre) : notre écho revient alors avec un autre texte. */
const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const AVANCE_MS = Number(env('FAUX_AVANCE_MS') ?? 0);
const ECHO_MS = Number(env('FAUX_ECHO_MS') ?? 5);
const LATENCE_MS = Number(env('FAUX_LATENCE_MS') ?? 1);
const JSONB = env('FAUX_JSONB') === '1';
/* `FAUX_LECTURE_TOT=1` : une lecture lit la base À LA DEMANDE et répond après
   la latence, comme le vrai serveur ; la réponse peut alors être plus vieille
   qu'un envoi arrivé pendant qu'elle voyageait. */
const LECTURE_TOT = env('FAUX_LECTURE_TOT') === '1';
const rangeCommeJsonb = (v: unknown): unknown => {
  if (!JSONB || !v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((k) => [k, o[k]]));
};
export const heureServeur = (): string => { faux.horloge = Math.max(faux.horloge + 1, Date.now() + AVANCE_MS); return new Date(faux.horloge).toISOString(); };
const table = (t: string): Map<string, Ligne> => {
  let m = faux.base.get(t);
  if (!m) { m = new Map(); faux.base.set(t, m); }
  return m;
};
/** Écrit au serveur comme le ferait un AUTRE poste (et prévient le canal). */
export function ecritAilleurs(t: string, id: string, data: unknown): Ligne {
  /* Un document porte sa clé, comme dans la vraie table : c'est elle que le
     canal distribue. */
  const l = { id, ...(t === 'documents' ? { key: id } : {}), data, updated_at: heureServeur(), branch_id: (data as { branchId?: string })?.branchId ?? null } as Ligne;
  table(t).set(id, l);
  sauveLaBase();
  diffuse(t, 'UPDATE', l);
  return l;
}
const diffuse = (t: string, eventType: string, l: Ligne | { id: string }): void => {
  const payload = { table: t, eventType, new: eventType === 'DELETE' ? {} : { ...l }, old: { id: l.id } };
  setTimeout(() => { for (const f of faux.ecoutes) f(payload); }, ECHO_MS);
};
const horsLigne = { data: null, error: { message: 'TypeError: Failed to fetch' } };

class Requete {
  private op: 'select' | 'upsert' | 'delete' = 'select';
  private cols = '*';
  private filtres: [string, string, unknown][] = [];
  private lim = 1000;
  private seul = false;
  private charge: unknown = null;
  constructor(private t: string) {}
  select(c = '*') { this.cols = c; return this; }
  order() { return this; }
  limit(n: number) { this.lim = n; return this; }
  gt(col: string, v: unknown) { this.filtres.push(['gt', col, v]); return this; }
  in(col: string, v: unknown) { this.filtres.push(['in', col, v]); return this; }
  eq(col: string, v: unknown) { this.filtres.push(['eq', col, v]); return this; }
  maybeSingle() { this.seul = true; return this; }
  single() { this.seul = true; return this; }
  upsert(rows: unknown) { this.op = 'upsert'; this.charge = rows; return this; }
  /* Le journal des gestes insère sans attendre de réponse : on l'accepte sans le garder. */
  insert() { this.op = 'select'; this.filtres.push(['eq', '__jamais', true]); return this; }
  delete() { this.op = 'delete'; return this; }
  then<A, B>(ok?: (v: { data: unknown; error: unknown }) => A, ko?: (e: unknown) => B) {
    if (LECTURE_TOT && this.op === 'select') {
      const lu = this.execute();
      return new Promise<{ data: unknown; error: unknown }>((r) => setTimeout(() => r(lu), LATENCE_MS)).then(ok, ko);
    }
    return new Promise<{ data: unknown; error: unknown }>((r) => setTimeout(() => r(this.execute()), LATENCE_MS)).then(ok, ko);
  }
  private garde(l: Ligne & { key?: string }): boolean {
    return this.filtres.every(([op, col, v]) => {
      const x = (l as Record<string, unknown>)[col];
      if (op === 'gt') return String(x) > String(v);
      if (op === 'in') return (v as unknown[]).includes(x);
      return x === v;
    });
  }
  private execute(): { data: unknown; error: unknown } {
    if (!faux.enLigne) return horsLigne;
    const m = table(this.t);
    if (this.op === 'upsert' && (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FAUX_REFUS === this.t) {
      return { data: null, error: { message: 'new row violates row-level security policy' } };
    }
    if (this.op === 'upsert') {
      const rows = (Array.isArray(this.charge) ? this.charge : [this.charge]) as (Ligne & { key?: string })[];
      for (const r of rows) {
        const id = r.id ?? r.key!;
        const l = { ...r, id, data: rangeCommeJsonb(r.data), updated_at: heureServeur() } as Ligne;
        m.set(id, l);
        faux.ecritures += 1;
        diffuse(this.t, 'UPDATE', l);
      }
      sauveLaBase();
      return { data: null, error: null };
    }
    if (this.op === 'delete') {
      for (const l of [...m.values()]) if (this.garde(l)) { m.delete(l.id); faux.ecritures += 1; diffuse(this.t, 'DELETE', l); }
      sauveLaBase();
      return { data: null, error: null };
    }
    const lignes = [...m.values()].map((l) => ({ ...l, key: l.id })).filter((l) => this.garde(l))
      .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, this.lim);
    const champs = this.cols === '*' ? null : this.cols.split(',').map((c) => c.trim());
    const rendu = champs ? lignes.map((l) => Object.fromEntries(champs.map((c) => [c, (l as Record<string, unknown>)[c]]))) : lignes;
    if (this.seul) return { data: rendu[0] ?? null, error: null };
    return { data: rendu, error: null };
  }
}

const canal = () => {
  let ecoute: Ecoute | null = null;
  const c = {
    on(_type: string, _filtre: unknown, f: Ecoute) { ecoute = f; return c; },
    subscribe(cb?: (statut: string) => void) { if (ecoute) faux.ecoutes.add(ecoute); setTimeout(() => cb?.('SUBSCRIBED'), 1); return c; },
    unsubscribe() { if (ecoute) faux.ecoutes.delete(ecoute); return Promise.resolve('ok'); },
    send() { return Promise.resolve('ok'); },
  };
  return c;
};

const reponse = async () => ({ data: {}, error: null });
/* LE JETON SE RENOUVELLE (17 octobre 2026) : supabase-js annonce
   « TOKEN_REFRESHED » toutes les heures, et chaque document se relit alors au
   serveur. C'est pendant une de ces relectures, en pleine frappe, que le nom
   du Wi-Fi est tombé en conflit. */
const ecoutesDeSession = new Set<(evenement: string, session: unknown) => void>();
export const annonceLaSession = (evenement: string): void => { for (const f of ecoutesDeSession) f(evenement, faux.session); };
export const supabase = {
  from: (t: string) => new Requete(t),
  auth: new Proxy({
    getSession: async () => ({ data: { session: faux.session }, error: null }),
    onAuthStateChange: (f: (evenement: string, session: unknown) => void) => {
      ecoutesDeSession.add(f);
      return { data: { subscription: { unsubscribe() { ecoutesDeSession.delete(f); } } } };
    },
  } as Record<string, unknown>, { get: (o, k: string) => o[k] ?? reponse }),
  channel: () => canal(),
  removeChannel: async (c: { unsubscribe: () => Promise<unknown> }) => { await c.unsubscribe(); return 'ok'; },
  realtime: { connectionState: () => 'open' },
  rpc: reponse,
  /* LES FONCTIONS (temps 3) : coupé, la requête ne part pas (« Failed to
     fetch », comme supabase-js) ; `FAUX_REFUS_FONCTION` fait refuser le
     serveur ; sinon l'appel est REÇU et noté dans la table « __appels ». */
  functions: {
    invoke: async (nom: string, opts?: { body?: unknown }) => {
      await new Promise((r) => setTimeout(r, 1));
      if (!faux.enLigne) return { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: { message: 'TypeError: Failed to fetch' } } };
      const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
      if (env?.FAUX_REFUS_FONCTION === nom) {
        /* `FAUX_MOTIF` : la fonction dit pourquoi, dans le corps, comme la
           vraie ; supabase-js le porte sous `context` (29 octobre 2026). */
        return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code',
          ...(env.FAUX_MOTIF ? { context: new Response(JSON.stringify({ erreur: env.FAUX_MOTIF }), { status: 400 }) } : {}) } };
      }
      const id = `recu-${table('__appels').size + 1}`;
      table('__appels').set(id, { id, data: { nom, corps: opts?.body ?? null }, updated_at: heureServeur() });
      sauveLaBase();
      return { data: { ok: true, id }, error: null };
    },
  },
  storage: { from: () => ({ upload: reponse, createSignedUrl: reponse, remove: reponse }) },
};
export const isRemote = true;
export const adresseDesFonctions = null;
export const cleAnonyme = null;
export const cleDeSession = 'sb-faux-auth-token';
