/* L'ASSISTANT AU SERVEUR, ÉPROUVÉ — 27 octobre 2026.
   `node scripts/verifie-l-assistant-au-serveur.mjs` (et `--prouve`).

   Le VRAI fichier à coller (`supabase/functions/assistant-maison/index.ts`)
   tourne ici contre une base simulée : la version au GET, le refus sans
   clé, la pause, le passage du matin (Ma Couronne, WhatsApp approuvé
   seulement), un seul passage par jour, jamais une ligne réécrite, la
   remise fabriquée au départ réel et une seule fois, le jour creux passé
   sans remise, les heures de la Maison introuvables. Les clientes sont des
   initiales. */
import { readFileSync } from 'node:fs';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── LA BASE SIMULÉE ── */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db: Record<string, Row[]> = {};
const lit = (r: Row, c: string): unknown => {
  const m = /^data->>(.+)$/.exec(c);
  if (m) { const v = r.data?.[m[1]]; return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  return r[c];
};
class Requete {
  filtres: ((r: Row) => boolean)[] = []; mode: 'select' | 'update' | 'upsert' = 'select'; valeur: any = null; options: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  de = 0; a = Infinity; lim = Infinity; seul = false; rendre = false; ordre: string | null = null;
  constructor(public table: string) {}
  select() { this.rendre = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') === String(v)); return this; }
  is(c: string, v: null) { this.filtres.push((r) => lit(r, c) === v); return this; }
  gt(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') > String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.map(String).includes(String(lit(r, c)))); return this; }
  order(c: string) { this.ordre = c; return this; }
  range(de: number, a: number) { this.de = de; this.a = a; return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  update(o: any) { this.mode = 'update'; this.valeur = o; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  upsert(o: any, opt: any = {}) { this.mode = 'upsert'; this.valeur = o; this.options = opt; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  then(ok: (x: any) => any, ko2?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, ko2); } // eslint-disable-line @typescript-eslint/no-explicit-any
  fais(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = (db[this.table] ??= []);
    const cle = this.table === 'documents' ? 'key' : 'id';
    if (this.mode === 'upsert') {
      for (const row of Array.isArray(this.valeur) ? this.valeur : [this.valeur]) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i < 0) t.push(structuredClone(row));
        else if (!this.options.ignoreDuplicates) t[i] = structuredClone(row);
      }
      return { error: null };
    }
    const lus = t.filter((r) => this.filtres.every((f) => f(r)));
    if (this.mode === 'update') {
      for (const r of lus) Object.assign(r, structuredClone(this.valeur));
      return { data: this.rendre ? lus.map((r) => ({ id: r.id })) : null, error: null };
    }
    let data = structuredClone(lus);
    if (this.ordre) data.sort((x: Row, y: Row) => String(x[this.ordre!]).localeCompare(String(y[this.ordre!])));
    data = data.slice(this.de, Math.min(this.a + 1, this.de + this.lim));
    return { data: this.seul ? (data[0] ?? null) : data, error: null };
  }
}
const base = { from: (t: string) => new Requete(t) };

/* ── LE VRAI FICHIER, sans sa ligne d'import ── */
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const source = readFileSync(process.env.ASSISTANT_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', source)(() => base, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
let maintenant = Date.parse('2026-10-28T08:00:00Z'); // mercredi 28 octobre 2026, 9 h au salon
const vraiNow = Date.now;
Date.now = () => maintenant;
const appelle = async (o: { get?: boolean; cle?: string } = {}) => {
  const r = await handler!(new Request('http://f/assistant-maison', o.get ? { method: 'GET' } : { method: 'POST', headers: { authorization: `Bearer ${o.cle ?? 'service'}` } }));
  return { status: r.status, corps: await r.json() as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/* ── LA MAISON SIMULÉE ── */
const J = (n: number) => new Date(Date.parse('2026-10-28T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const HEURES = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '09h00', close: '19h00', closed: key === 'dim' || key === 'lun' }));
const accord = { oui: true, le: '2026-01-01', par: 'comptoir' };
const tete = (id: string, o: Row = {}) => ({ id, branch_id: 'b', data: { id, branchId: 'b', name: `${id.toUpperCase()} X.`, phone: `+229 01 51 00 00 ${String(10 + id.length)}`, nouvelles: accord, segments: [], ...o } });
const rituel = (id: string, clientId: string, date: string) => ({ id, branch_id: 'b', data: { id, branchId: 'b', clientId, serviceIds: ['s1'], date, time: '10:00', status: 'honoré', master: 'Aimée' } });
const remplis = (gerard: Row | null = { mode: 'ouvert', approuves: ['gerard_envie'] }) => {
  for (const k of Object.keys(db)) delete db[k];
  db.documents = [{ key: 'mnd_settings', data: { hours: HEURES } }, { key: 'mnd_auto_config', data: {} }];
  if (gerard) db.documents.push({ key: 'mnd_gerard', data: gerard });
  db.branches = [{ id: 'b', data: { id: 'b', seats: 2 } }];
  db.clients = [
    tete('cou', { authUserId: 'u-cou' }),           // Ma Couronne : une envie, en notification
    tete('wa'),                                     // WhatsApp, modèle approuvé : part seul
    tete('ann', { birthday: '1990-10-28', phone: '' }), // anniversaire, Ma Couronne seule (sans numéro) : sa carte et l'attention, remise à faire
    tete('arc', { archived: true }),                // archivée : jamais lue
  ];
  db.appointments = ['cou', 'wa', 'ann', 'arc'].flatMap((c) => [rituel(`${c}-1`, c, J(-100)), rituel(`${c}-2`, c, J(-30))]);
  db.catalog_services = [{ id: 's1', data: { id: 's1', name: 'SÍNSIN™ Essentiel · La Reprise', durationMin: 120 } }];
  db.push_subscriptions = [{ endpoint: 'e1', client_id: 'u-cou' }, { endpoint: 'e2', client_id: 'ann' }];
  for (const t of ['signalements', 'envois', 'messages_wa', 'invoices', 'blocages', 'families', 'cartes_cadeaux', 'codes_promo']) db[t] = [];
};
const lignes = () => (db.envois ?? []).map((r) => r.data);
const etat = () => db.documents.find((d) => d.key === 'mnd_assistant_serveur')?.data;

/* 1. Les portes. */
remplis();
const g = await appelle({ get: true });
dit('GET : la version seule, sans rien lire', [200, 'assistant-maison', true, 0], [g.status, g.corps.fonction, /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(g.corps.version), lignes().length]);
dit('sans la clé service : refusé', 401, (await appelle({ cle: 'autre' })).status);

/* 2. En pause, il vit mais ne dépose rien. */
remplis({ mode: 'eteint' });
const p = await appelle();
dit('en pause : il dit qu il vit, ne dépose rien', [200, 'pause', 0, true], [p.status, p.corps.mode, lignes().length, typeof etat()?.vuLe === 'string']);

/* 3. Le passage du matin. */
remplis();
const m1 = await appelle();
const par = (id: string) => lignes().filter((l) => l.clientId === id);
dit('le passage du matin : Ma Couronne pour cou et ann, WhatsApp approuvé pour wa, rien pour l archivée', [['push'], ['whatsapp'], ['push'], []],
  [par('cou').map((l) => l.canal), par('wa').map((l) => l.canal), par('ann').map((l) => l.canal), par('arc').map((l) => l.canal)]);
const lwa = par('wa')[0];
dit('... la ligne WhatsApp : en attente, au numéro de Meta, le modèle gerard_envie et ses quatre variables, signée Assistant Maison au fil', ['en-attente', '2290151000012', 'gerard_envie', 4, 'Assistant Maison', true],
  [lwa?.statut, lwa?.colis?.numero, lwa?.colis?.modele, lwa?.colis?.composants?.[0]?.parameters?.length, lwa?.colis?.parQui, /Maison MND$/.test(lwa?.colis?.texteAuFil ?? '')]);
dit('... la notification va au compte Ma Couronne (u-cou), titre Maison MND', ['u-cou', 'Maison MND'], [par('cou')[0]?.colis?.clientId, par('cou')[0]?.colis?.titre]);
const lann = par('ann')[0];
dit('... l anniversaire porte sa remise À FAIRE, aucune remise fabriquée au dépôt', ['anniversaire', 'ANNIV', undefined, 0], [lann?.genre, lann?.codeAFaire?.mot, lann?.codePromo, db.codes_promo.length]);
dit('... le passage est noté, une fois par jour', ['2026-10-28', 3], [etat()?.passageLe, etat()?.deposees]);
dit('... ids du jour, comme au Trône', ['gerard-2026-10-28-cou-push', 'gerard-2026-10-28-wa-whatsapp'], [par('cou')[0]?.id, lwa?.id]);

/* 4. Un seul passage par jour ; jamais une ligne réécrite. */
db.envois.find((r) => r.id === lwa.id)!.data.statut = 'envoyé';
maintenant += 15 * 60_000;
const m2 = await appelle();
dit('un second réveil le même jour : pas de second passage', ['pas maintenant', 3], [m2.corps.passage, lignes().length]);
dit('... et aucune remise tant que la ligne d anniversaire attend en salle', 0, db.codes_promo.length);
etat()!.passageLe = '2026-10-27';
await appelle();
dit('... et même rejoué, rien n est déposé deux fois ni remis en attente', [3, 'envoyé'], [lignes().length, lignes().find((l) => l.id === lwa.id)?.statut]);

/* 4 bis. Une ligne RETENUE à la main ne repart jamais, même rejouée. */
db.envois.find((r) => r.id === par('cou')[0].id)!.data.statut = 'écarté';
etat()!.passageLe = '2026-10-27';
await appelle();
dit('une notification retenue (écartée) dans la salle reste écartée au passage suivant', ['écarté', 3],
  [lignes().find((l) => l.clientId === 'cou')?.statut, lignes().length]);

/* 5. La remise naît au départ réel, une fois. */
db.envois.find((r) => r.id === lann.id)!.data.statut = 'envoyé';
const m3 = await appelle();
const code = db.codes_promo[0]?.data;
dit('le message d anniversaire parti : sa remise naît, à son nom, signée Assistant Maison, et la ligne la porte', [1, 1, 'ann', 'Assistant Maison', 10, code?.code],
  [m3.corps.remises, db.codes_promo.length, code?.clientId, code?.parQui, code?.remisePct, lignes().find((l) => l.id === lann.id)?.codePromo]);
await appelle();
dit('... un réveil de plus : pas de seconde remise', 1, db.codes_promo.length);
db.envois.push({ id: 'gerard-2026-10-20-cou-push', branch_id: 'b', data: { id: 'gerard-2026-10-20-cou-push', type: 'gerard', statut: 'envoyé', clientId: 'cou', genre: 'creux', branchId: 'b', codeAFaire: { mot: 'CREUX', pct: 15, jusquau: '2026-10-24', jour: '2026-10-24' } } });
await appelle();
dit('un jour creux passé : pas de remise, la ligne le dit', [1, '', 'jour passé, pas de remise'],
  [db.codes_promo.length, lignes().find((l) => l.id === 'gerard-2026-10-20-cou-push')?.codePromo, lignes().find((l) => l.id === 'gerard-2026-10-20-cou-push')?.detailRemise]);

/* 5 bis. Un modèle pas encore approuvé chez Meta attend un toucher au Trône. */
remplis({ mode: 'ouvert', approuves: [] });
maintenant = Date.parse('2026-10-28T08:00:00Z');
await appelle();
dit('sans approbation de Meta : rien sur WhatsApp, Ma Couronne part quand même', [[], ['push']], [par('wa').map((l) => l.canal), par('cou').map((l) => l.canal)]);

/* 6. Les heures de la Maison introuvables : rien ne se devine. */
remplis();
db.documents = db.documents.filter((d) => d.key !== 'mnd_settings');
const sansHeures = await appelle();
dit('sans les heures de la Maison : rien déposé, le passage n est pas noté, l erreur est dite', [0, undefined, true],
  [lignes().length, etat()?.passageLe, /heures de la Maison introuvables/.test(JSON.stringify(sansHeures.corps.passage))]);

/* 7. La nuit, il vit mais ne passe pas. */
remplis();
maintenant = Date.parse('2026-10-28T20:30:00Z'); // 21 h 30 au salon
dit('à 21 h 30 au salon : pas de passage', ['pas maintenant', 0], [(await appelle()).corps.passage, lignes().length]);

/* 8. Deux parents (27 octobre 2026) : « garder son RDV » part au parent qui
   a pris le rendez-vous, comme la confirmation et le rappel de la veille ;
   sans numéro retenu, au premier numéro de la fiche. */
remplis({ mode: 'ouvert', approuves: ['gerard_envie', 'gerard_garder'] });
maintenant = Date.parse('2026-10-28T08:00:00Z');
db.clients.push(tete('gar', { phone: '+229 01 51 00 00 31', phone2: '+229 01 97 00 00 32' }), tete('ga1', { phone: '+229 01 51 00 00 41', phone2: '+229 01 97 00 00 42' }));
for (const [c, num] of [['gar', '+229 01 97 00 00 32'], ['ga1', '']] as const) {
  db.appointments.push(rituel(`${c}-1`, c, J(-60)), { id: `${c}-g`, branch_id: 'b', data: { id: `${c}-g`, branchId: 'b', clientId: c, serviceIds: ['s1'], date: J(2), time: '10:00', status: 'confirmé', master: 'Aimée', ...(num ? { numeroAPrevenir: num } : {}) } });
}
await appelle();
dit('deux parents : « garder » part au parent qui a pris le RDV, sinon au premier numéro', [['garder', '2290197000032'], ['garder', '2290151000041']],
  [[par('gar')[0]?.genre, par('gar')[0]?.colis?.numero], [par('ga1')[0]?.genre, par('ga1')[0]?.colis?.numero]]);

/* 9. LA CARTE D'ANNIVERSAIRE, À TOUTES (27 octobre 2026) : l'enfant du
   foyer au numéro du parent payeur, la cliente sans accord à son numéro,
   la carte en en-tête image ; sans approbation de Meta, rien ne part seul. */
const foyer = (approuves: string[]) => {
  remplis({ mode: 'ouvert', approuves });
  maintenant = Date.parse('2026-10-28T08:00:00Z');
  db.families = [{ id: 'f1', data: { id: 'f1', branchId: 'b', name: 'Famille P.', payerClientId: 'par' } }];
  db.clients.push(tete('par', { familyId: 'f1' }), tete('enf', { familyId: 'f1', birthday: '2016-10-28', phone: '' }), tete('adu', { birthday: '1985-10-28', nouvelles: undefined }));
};
foyer(['gerard_carte_foyer', 'gerard_carte_anniversaire']);
await appelle();
const lenf = par('enf')[0]; const ladu = par('adu')[0];
dit('la carte de l enfant part seule au numéro du parent payeur, au modèle du foyer, l image en tête, son prénom en variable', ['whatsapp', '2290151000013', 'gerard_carte_foyer', ['header', 'body', 'button'], 'https://maisonmnd.com/trone/assets/cartes/carte-anniversaire.png', ['PAR', 'ENF'], 'par', 'gerard-2026-10-28-enf-whatsapp'],
  [lenf?.canal, lenf?.colis?.numero, lenf?.colis?.modele, (lenf?.colis?.composants ?? []).map((k: Row) => k.type), lenf?.colis?.composants?.[0]?.parameters?.[0]?.image?.link,
    (lenf?.colis?.composants?.[1]?.parameters ?? []).map((x: Row) => x.text), lenf?.pourId, lenf?.id]);
dit('... la cliente sans accord des nouvelles reçoit sa carte seule, sans remise à faire ; le parent, lui, n a rien en son nom', ['whatsapp', 'gerard_carte_anniversaire', undefined, 0],
  [ladu?.canal, ladu?.colis?.modele, ladu?.codeAFaire, par('par').filter((l) => l.genre === 'anniversaire').length]);
foyer([]);
await appelle();
dit('... sans approbation de Meta, aucune carte ne part seule : elle attend un toucher au Trône', [0, 0], [par('enf').length, par('adu').length]);

Date.now = vraiNow;
console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nL'Assistant tient au serveur (${n} controles).`);
if (ko) process.exitCode = 1;
