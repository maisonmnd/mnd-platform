/* LA RÉCEPTION WHATSAPP, ÉPROUVÉE — 27 octobre 2026.
   `node scripts/verifie-la-reception-wa.mjs` (et `--prouve`).

   ① Les règles pures (shared/reception-wa-pur) : la consigne partagée et
      ses repères, la lecture de ce que Claude écrit (montants du catalogue
      seuls, aucun prix de création, ni numéro ni le mot banni), les calibres
      de la grille à toucher, le contexte (adresse, heures, première réponse).
   ② Le VRAI fichier à coller (`supabase/functions/reception-wa/index.ts`)
      tourne contre une base et un Claude simulés : la porte, le plafond du
      numéro, les prix de chaque calibre, le calibre touché, les juges, le
      repli sur Sonnet, Claude absent, le compte du mois. Les clientes sont
      des initiales ; aucun numéro ne part chez Claude. */
import { readFileSync } from 'node:fs';
import {
  REPERES_DE_LA_CONSIGNE, calibreDuChoix, consigneDeLaReception, contexteDeLaReception, lectureDeLaReception, listeDesCalibres, montantsDe,
} from '../src/shared/reception-wa-pur';
import { consigneDeLaReponse } from '../src/shared/ia-reponse-wa-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── ① LES RÈGLES PURES ── */
const partagee = consigneDeLaReponse();
dit('chaque repere de la consigne partagee existe la-bas', REPERES_DE_LA_CONSIGNE.map(() => true), REPERES_DE_LA_CONSIGNE.map(([avant]) => partagee.includes(avant)));
const c = consigneDeLaReception();
dit('la consigne de la reception : elle repond elle-meme, dit qu elle est l assistant, et la suite', [true, false, true, true, true],
  [c.includes('Tu es l’assistant de la Maison MND'), c.includes('tu PROPOSES'), c.includes('"suite"'), c.includes('« l’assistant de la Maison »'), c.includes('Une création de locks ou une réparation commence TOUJOURS par une consultation')]);
/* L'essai du 28 octobre 2026, 0 h 41 : sur « Bonjour », Claude s'est excusé
   d'un ancien message et a passé la main, la Maison fermée. */
dit('la consigne : un ancien message ni la Maison fermee ne passent la main ; un bonjour ouvre la liste ; equipe jamais pour un rendez-vous', [true, true, true],
  [c.includes('Ni ce retard ni la Maison fermée ne sont une raison de passer la main'), c.includes('Un simple bonjour, sans autre demande : accueille-la en une phrase, sans question ; suite "reserver"'),
    c.includes('Jamais pour un bonjour, un rendez-vous, un prix, les heures ou l’adresse')]);
const PERMIS = new Set([35000, 40000, 50000, 15000]);
dit('les montants d un texte', [35000, 40000, 15000], montantsDe('De 35 000 F à 40000 FCFA, et 15 000 francs.'));
dit('une reponse sure passe telle quelle', { texte: 'Avec plaisir, Madame Naffi. Pour votre calibre, le resserrage est à 40 000 F.', suite: 'rien' },
  lectureDeLaReception({ texte: 'Avec plaisir, Madame Naffi. Pour votre calibre, le resserrage est à 40 000 F.', suite: 'rien' }, PERMIS));
dit('... un montant hors catalogue, un prix de creation, un prix avec la question des locks : rien', [null, null, null], [
  lectureDeLaReception({ texte: 'Le resserrage est à 42 000 F.', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Une création est à 15 000 F.', suite: 'creation' }, PERMIS),
  lectureDeLaReception({ texte: 'C’est 35 000 F ; combien de locks portez-vous ?', suite: 'calibre' }, PERMIS),
]);
dit('... le mot banni, un numero, rien d ecrit : rien ; une suite inconnue devient rien', [null, null, null, 'rien'], [
  lectureDeLaReception({ texte: `Bienvenue au ${'sal' + 'on'}.`, suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Appelez le 01 51 99 77 99.', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: '   ', suite: 'rien' }, PERMIS),
  lectureDeLaReception({ texte: 'Avec plaisir.', suite: 'danser' }, PERMIS)?.suite,
]);
dit('... le tiret long devient une virgule', 'Avec plaisir, la Maison vous attend.', lectureDeLaReception({ texte: 'Avec plaisir — la Maison vous attend.', suite: 'rien' }, PERMIS)?.texte);
const BANDES = [{ id: 'medium', name: 'Medium', maxLocks: 150 }, { id: 'jumbo', name: 'Jumbo', maxLocks: 80 }, { id: 'galaxy', name: 'Galaxy', maxLocks: null }];
dit('les calibres de la grille, du plus large au plus fin, puis je ne sais pas', [['Jumbo', 'jusqu’à 80 locks'], ['Medium', '81 à 150 locks'], ['Galaxy', 'plus de 150 locks'], ['Je ne sais pas', 'La Maison les comptera avec vous']],
  listeDesCalibres(BANDES).map((l) => [l.titre, l.description]));
dit('le calibre touche se lit sous ses deux formes', [{ locks: 150, palier: '81 à 150 locks' }, 'inconnu', null, { locks: 80, palier: 'jusqu’à 80 locks' }],
  [calibreDuChoix('MND:7:calibre:medium', BANDES), calibreDuChoix('calibre:inconnu', BANDES), calibreDuChoix('MND:7:besoin:entretien', BANDES), calibreDuChoix('calibre:jumbo', BANDES)]);
const SEMAINE = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '08h00', close: '20h30', closed: key === 'dim' || key === 'lun' }));
const lundiSoir = Date.parse('2026-10-26T22:00:00Z');
const ctx = contexteDeLaReception({
  fil: [{ sens: 'entrant', texte: 'Bonsoir' }], fiche: null, catalogue: [], aujourdhui: '2026-10-26',
  semaine: SEMAINE, exceptions: [], maintenantMs: lundiSoir, premiereReponse: true,
});
dit('le contexte : l adresse, les heures, la Maison fermee et quand elle repond, la premiere reponse', [true, true, true, true],
  [ctx.includes('Ilot 130-F, Maison 88, Portail Marron'), /Heures d’ouverture : .*08h00 à 20h30/.test(ctx), /la Maison est fermée, et tu réponds pour elle ; si la suite revient à l’équipe, une personne lui répondra demain/.test(ctx), ctx.includes('présente-toi comme l’assistant de la Maison')]);

/* ── ② LE VRAI FICHIER, CONTRE UNE BASE ET UN CLAUDE SIMULÉS ── */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const db: Record<string, Row[]> = {};
const lit = (r: Row, col: string): unknown => {
  const m = /^data->>(.+)$/.exec(col);
  if (m) { const v = r.data?.[m[1]]; return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  return r[col];
};
class Requete {
  filtres: ((r: Row) => boolean)[] = []; mode: 'select' | 'upsert' = 'select'; valeur: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  compte = false; tete = false; de = 0; a = Infinity; lim = Infinity; seul = false; ordre: string | null = null; desc = false; cols = '';
  constructor(public table: string) {}
  select(cols = '', o: { count?: string; head?: boolean } = {}) { this.cols = cols; this.compte = !!o.count; this.tete = !!o.head; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') === String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => String(lit(r, c) ?? '') >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.map(String).includes(String(lit(r, c)))); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.ordre = c; this.desc = o.ascending === false; return this; }
  range(de: number, a: number) { this.de = de; this.a = a; return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  upsert(o: any) { this.mode = 'upsert'; this.valeur = o; return this; } // eslint-disable-line @typescript-eslint/no-explicit-any
  then(ok: (x: any) => any, ko2?: (e: any) => any) { return Promise.resolve(this.fais()).then(ok, ko2); } // eslint-disable-line @typescript-eslint/no-explicit-any
  fais(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = (db[this.table] ??= []);
    const cle = this.table === 'documents' ? 'key' : 'id';
    if (this.mode === 'upsert') {
      for (const row of Array.isArray(this.valeur) ? this.valeur : [this.valeur]) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i < 0) t.push(structuredClone(row)); else t[i] = structuredClone(row);
      }
      return { error: null };
    }
    let lus = structuredClone(t.filter((r) => this.filtres.every((f) => f(r))));
    if (this.compte && this.tete) return { count: lus.length, data: null, error: null };
    if (this.ordre) { const o = this.ordre; lus.sort((x: Row, y: Row) => String(lit(x, o)).localeCompare(String(lit(y, o)))); if (this.desc) lus.reverse(); }
    lus = lus.slice(this.de, Math.min(this.a + 1, this.de + this.lim));
    return { data: this.seul ? (lus[0] ?? null) : lus, error: null };
  }
}
const base = { from: (t: string) => new Requete(t) };

/* Claude, simulé : ce qu'il reçoit est gardé, ce qu'il rend est choisi par l'épreuve. */
type Envoi = { model: string; system: string; messages: { role: string; content: string }[] };
const recus: Envoi[] = [];
let reponseDeClaude: (corps: Envoi) => { status: number; corps: unknown } = () => ({ status: 200, corps: {} });
const outil = (texte: string, suite: string) => ({ status: 200, corps: { content: [{ type: 'tool_use', name: 'reponds', input: { texte, suite } }], usage: { input_tokens: 2000, output_tokens: 100 } } });
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`appel inattendu : ${url}`);
  const corps = JSON.parse(init.body) as Envoi;
  recus.push(corps);
  const r = reponseDeClaude(corps);
  return { status: r.status, text: async () => JSON.stringify(r.corps) };
};

let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'service', ANTHROPIC_API_KEY: 'cle-de-test' };
const source = readFileSync(process.env.RECEPTION_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', source)(() => base, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
const appelle = async (o: { get?: boolean; cle?: string; corps?: unknown } = {}) => {
  const r = await handler!(new Request('http://f/reception-wa', o.get ? { method: 'GET' } : {
    method: 'POST', headers: { authorization: `Bearer ${o.cle ?? 'service'}`, 'content-type': 'application/json' }, body: JSON.stringify(o.corps ?? {}),
  }));
  return { status: r.status, corps: await r.json() as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const NUM = '2290197000001';
const maintenant = Date.now();
const il = (min: number) => new Date(maintenant - min * 60000).toISOString();
const remplis = () => {
  for (const k of Object.keys(db)) delete db[k];
  db.documents = [
    { key: 'mnd_settings', data: { hours: SEMAINE } },
    { key: 'mnd_model_bands', data: BANDES.map((b) => ({ ...b, coef: 1, durCoef: 1 })) },
  ];
  db.catalog_categories = [{ id: 'atl-ii', data: {} }, { id: 'atl-i-vekpe', data: {} }, { id: 'koko', data: {} }];
  db.catalog_services = [
    { id: 'sinsin-ess', data: { name: 'SÍNSIN™ Essentiel', categoryId: 'atl-ii', priceXof: 35000, tarifMode: 'calibre', priceFloors: { jumbo: 35000, medium: 40000, galaxy: 50000 } } },
    { id: 'vekpe-crea', data: { name: 'VÈKPÈ™ Création', categoryId: 'atl-i-vekpe', priceXof: 80000, consultationAvant: true } },
    { id: 'sv-koko-ori', data: { name: 'KÒKÒ™ Origine', categoryId: 'koko', priceXof: 15000 } },
  ];
  db.clients = [{ id: 'c-n', data: { id: 'c-n', name: 'N. M.' } }];
  db.messages_wa = [
    { id: 'm1', data: { numero: NUM, sens: 'entrant', texte: 'Bonsoir, combien pour refaire mes racines ?', quand: il(1), type: 'text' } },
  ];
};
const demande = { numero: NUM, clientId: 'c-n', fiche: { name: 'N. M.', civilite: 'madame' } };

remplis();
const g = await appelle({ get: true });
dit('GET : la version, et si la cle de Claude est posee, sans rien lire', [200, 'reception-wa', 'oui', 0], [g.status, g.corps.fonction, g.corps.claude, recus.length]);
dit('sans la cle service : refuse', 401, (await appelle({ cle: 'autre', corps: demande })).status);

reponseDeClaude = () => outil('Avec plaisir, Madame N. Pour un calibre de 81 à 150 locks, la reprise des racines est à 40 000 F.', 'rien');
const r1 = await appelle({ corps: demande });
const envoye = recus[recus.length - 1];
dit('une reponse sure : elle revient telle quelle, la suite avec', [true, 'rien', 'Avec plaisir, Madame N. Pour un calibre de 81 à 150 locks, la reprise des racines est à 40 000 F.'], [r1.corps.ok, r1.corps.suite, r1.corps.texte]);
dit('ce que Claude recoit : la consigne de la reception, Haiku d abord, le contexte de la Maison', ['claude-haiku-5-5', true, true, true],
  [envoye?.model, envoye?.system.includes('Tu es l’assistant de la Maison MND'), envoye?.messages[0]?.content.includes('Ilot 130-F'), envoye?.messages[0]?.content.includes('combien pour refaire mes racines')]);
dit('... les prix de chaque calibre, la creation sans prix, et jamais son numero', [true, true, false],
  [/SÍNSIN™ Essentiel, selon le nombre de locks : jusqu’à 80 locks, 35 000 F ; 81 à 150 locks, 40 000 F/.test(envoye?.messages[0]?.content ?? ''),
    /VÈKPÈ™ Création : consultation d’abord/.test(envoye?.messages[0]?.content ?? ''), JSON.stringify(envoye).includes(NUM)]);
dit('le compte du mois : un appel, ses jetons, son cout', [1, 2000, 100], (() => {
  const d = db.documents.find((x) => x.key === 'mnd_assistant_wa_compte')?.data ?? {};
  const m = Object.values(d)[0] as { appels?: number; entree?: number; sortie?: number } | undefined;
  return [m?.appels, m?.entree, m?.sortie];
})());

reponseDeClaude = () => outil('Une création de locks est à 80 000 F.', 'creation');
dit('un prix de creation : les juges l ecartent, rien ne part', [false, 'juges'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);
reponseDeClaude = () => outil('Le resserrage est à 42 000 F.', 'rien');
dit('un montant hors catalogue : ecarte', false, (await appelle({ corps: demande })).corps.ok);

reponseDeClaude = () => outil('Pour vous indiquer le juste prix, combien de locks portez-vous, approximativement ?', 'calibre');
const r2 = await appelle({ corps: demande });
dit('calibre : la liste des calibres de la grille suit', [true, 'calibre', ['Jumbo', 'Medium', 'Galaxy', 'Je ne sais pas']], [r2.corps.ok, r2.corps.suite, (r2.corps.lignes ?? []).map((l: { titre: string }) => l.titre)]);

reponseDeClaude = () => outil('Merci. Pour votre calibre, la reprise des racines est à 40 000 F.', 'rien');
await appelle({ corps: { ...demande, choixId: 'MND:4:calibre:medium' } });
dit('le calibre touche : son nombre de locks et son prix a elle partent chez Claude', [true, true],
  [/annoncé par elle : environ 150/.test(recus[recus.length - 1]?.messages[0]?.content ?? ''), /SÍNSIN™ Essentiel : 40 000 F pour elle/.test(recus[recus.length - 1]?.messages[0]?.content ?? '')]);

reponseDeClaude = (corps) => (corps.model === 'claude-haiku-5-5' ? { status: 404, corps: { error: { type: 'not_found_error', message: 'model: claude-haiku-5-5' } } } : outil('Avec plaisir.', 'rien'));
const avantRepli = recus.length;
const r3 = await appelle({ corps: demande });
dit('Haiku inconnu : Sonnet prend le relais', [true, ['claude-haiku-5-5', 'claude-sonnet-5-5']], [r3.corps.ok, recus.slice(avantRepli).map((x) => x.model)]);

reponseDeClaude = () => ({ status: 529, corps: { error: { type: 'overloaded_error', message: 'surcharge' } } });
dit('Claude ne repond pas : ok faux, l automate envoie son secours', [false, 'claude'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);

remplis();
for (let k = 0; k < 20; k++) db.messages_wa.push({ id: `r${k}`, data: { numero: NUM, sens: 'sortant', reception: true, texte: 'x', quand: il(10 + k) } });
const avantPlafond = recus.length;
const r4 = await appelle({ corps: demande });
dit('vingt reponses en vingt-quatre heures : le plafond, Claude n est pas appele', [false, 'plafond', avantPlafond], [r4.corps.ok, r4.corps.motif, recus.length]);

delete env.ANTHROPIC_API_KEY;
remplis();
dit('sans la cle de Claude : ok faux, rien n est lu', [false, 'cle-claude-absente'], [(await appelle({ corps: demande })).corps.ok, (await appelle({ corps: demande })).corps.motif]);

console.log(ko ? `\n${ko} echec(s) sur ${n}.` : `\nLa reception tient (${n} controles).`);
if (ko) process.exitCode = 1;
