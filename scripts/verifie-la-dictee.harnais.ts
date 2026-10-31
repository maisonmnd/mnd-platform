/* LA DICTÉE MND, ÉPROUVÉE · 31 octobre 2026.
   `node scripts/verifie-la-dictee.mjs` (et `--prouve`).

   ① Le cerveau pur : la commande de mode dite en parlant, les mots propres,
      la consigne que Claude suit, ce qu'il rend mis au net, la mise au propre
      de secours, le jeton du bureau et son empreinte.
   ② La fonction `dictee-au-propre`, regroupée depuis le dépôt, contre une
      base et un Claude simulés : la porte (personnel, jeton du bureau), le
      mode (dit par l'écran, dit en parlant, celui par défaut), le modèle
      réglé, les prestations et les prénoms lus dans la base, le compte et le
      plafond du mois, Claude qui refuse.
   ③ Le câblage : la route hors menu et nommée parmi les écrans nés après,
      ouverte à toute l'équipe ; le bouton « Dicter » de la barre du haut ; la
      tuile et le panneau de Paramètres ; le réglage dans Settings ; le
      raccourci du téléphone ; l'écran qui ne garde rien ; l'appel qui refuse
      hors ligne.
   Les dictées du banc sont inventées : aucun vrai message ici. */
import { readFileSync } from 'node:fs';
import {
  DICTEES_PAR_MOIS, MOTS_DE_LA_MAISON, auPropreIci, consigneDeLaDictee, empreinteDuJeton, litLaCommandeDeMode, motsDuTexte, motsPropres,
  nettoieLaReponse, nouveauJeton,
} from '../src/shared/dictee-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko += 1; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
/* La panne de `--prouve`, posée en mémoire sur le texte lu, jamais sur le disque. */
const PANNE = process.env.DICTEE_PANNE ? JSON.parse(process.env.DICTEE_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};

/* ── ① LE CERVEAU PUR ── */
dit('« mode message, bonjour madame » : le mode, et la commande ne s écrit pas', { mode: 'message', reste: 'bonjour madame' }, litLaCommandeDeMode('Mode message, bonjour madame'));
dit('« en anglais » au début : le mode anglais', { mode: 'anglais', reste: 'bonjour' }, litLaCommandeDeMode('en anglais bonjour'));
dit('« mode liste : lait, pain »', { mode: 'liste', reste: 'lait, pain' }, litLaCommandeDeMode('Mode liste : lait, pain'));
dit('« la mode est belle » n est pas une commande', { mode: null, reste: 'la mode est belle' }, litLaCommandeDeMode('la mode est belle'));
dit('les mots propres : sans blanc, sans doublon, sans commentaire', ['Kèliji', 'Teckle'], motsPropres(['Kèliji', ' kèliji ', '', '# un commentaire', 'Teckle']));
dit('un mot par ligne, la virgule sépare aussi', ['a', 'b', 'c', 'd'], motsDuTexte('a\nb, c;d'));
const consigne = consigneDeLaDictee({ mode: 'liste', mots: ['KLƆKLƆ'], prestations: ['Retwist'], equipe: ['Gérard'] });
dit('la consigne : le mode, les mots, les prestations, l équipe, les règles de la Maison', [true, true, true, true, true, true],
  ['MODE LISTE', 'KLƆKLƆ', 'Retwist', 'Gérard', 'jamais de tiret long', 'civilité jamais supposée'].map((m) => consigne.includes(m)));
dit('ce que Claude rend, mis au net : sans guillemets autour, sans tiret long, sans trou', ['Bonjour, madame', 'Bonjour', 'a\n\nb'],
  [nettoieLaReponse('« Bonjour — madame »'), nettoieLaReponse('"Bonjour"'), nettoieLaReponse('a\n\n\n\nb')]);
dit('la mise au propre de secours : les hésitations tombent, « à la ligne » fait une ligne, la majuscule revient',
  'Bonjour madame\nOn vous attend, vite', auPropreIci('euh bonjour madame euh à la ligne on vous attend — vite'));
const e1 = await empreinteDuJeton('dictee-test');
dit('l empreinte du jeton : 64 caractères hexadécimaux, toujours la même, jamais le jeton', [64, true, true, false],
  [e1.length, /^[0-9a-f]+$/.test(e1), e1 === await empreinteDuJeton(' dictee-test '), e1.includes('dictee-test')]);
dit('un jeton neuf : la forme, et jamais deux fois le même', [true, true], [/^dictee-[0-9a-f]{48}$/.test(nouveauJeton()), nouveauJeton() !== nouveauJeton()]);

/* ── ② LA FONCTION ── */
type Ligne = { key?: string; id?: string; data: unknown };
const tables: Record<string, Ligne[]> = {
  documents: [],
  catalog_services: [
    { id: 's1', data: { name: 'Retwist', archived: false } },
    { id: 's2', data: { name: 'Archivée Ancienne', archived: true } },
  ],
  catalog_categories: [{ id: 'c1', data: { label: 'Reprise de racines', fon: 'KLƆKLƆ' } }],
  team: [
    { id: 't1', data: { name: 'Gérard Tolofon' } },
    { id: 't2', data: { name: 'Partie Depuis', archiveeLe: '2026-01-01' } },
  ],
};
const fabrique = (_url: string, _cle: string, o?: { global?: { headers?: { authorization?: string } } }) => {
  const jeton = String(o?.global?.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  return {
    rpc: async (n: string) => (n === 'is_staff' ? { data: jeton === 'staff', error: null } : { data: null, error: { message: n } }),
    from: (table: string) => {
      const filtres: [string, unknown][] = [];
      const lignes = () => (tables[table] ?? []).filter((d) => filtres.every(([c, v]) => (d as Record<string, unknown>)[c] === v));
      const q = {
        select: () => q,
        limit: () => q,
        eq: (c: string, v: unknown) => { filtres.push([c, v]); return q; },
        maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
        upsert: async (row: Ligne) => { const t = tables[table]; const i = t.findIndex((d) => d.key === row.key); if (i >= 0) t[i] = row; else t.push(row); return { error: null }; },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(res, rej),
      };
      return q;
    },
  };
};
let claude: () => { status: number; corps: unknown } = () => ({ status: 200, corps: {} });
const recus: { model: string; system: string; messages: { content: string }[] }[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error(`appel inattendu : ${url}`);
  recus.push(JSON.parse(init.body));
  const r = claude();
  return { status: r.status, text: async () => JSON.stringify(r.corps) };
};
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', SUPABASE_ANON_KEY: 'anon', CLE_SERVICE: 'service', ANTHROPIC_API_KEY: 'cle-de-test' };
const sourceF = readFileSync(process.env.DICTEE_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', sourceF)(fabrique, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });

type Reponse = { ok?: boolean; propre?: string; mode?: string; modele?: string; motif?: string };
const appelle = async (entetes: Record<string, string>, corps: unknown) => {
  const r = await handler!(new Request('http://f/dictee-au-propre', { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Reponse };
};
const staff = { authorization: 'Bearer staff' };
const texteDeClaude = (texte: string) => ({ status: 200, corps: { content: [{ type: 'text', text: texte }], usage: { input_tokens: 700, output_tokens: 60 } } });
const reglages = (dictee: unknown) => { tables.documents = tables.documents.filter((d) => d.key !== 'mnd_settings'); tables.documents.push({ key: 'mnd_settings', data: { dictee } }); };

const g = await handler!(new Request('http://f/dictee-au-propre', { method: 'GET' }));
dit('GET : la version, et si la clé de Claude est posée', ['dictee-au-propre', 'oui'], await g.json().then((x: { fonction?: string; claude?: string }) => [x.fonction, x.claude]));
claude = () => texteDeClaude('Bonjour madame.');
dit('sans session du personnel ni jeton : refusé, et Claude n est pas appelé', [403, 'reserve-au-personnel', 0],
  await appelle({ authorization: 'Bearer inconnu' }, { texte: 'euh bonjour madame', mode: 'note' }).then((r) => [r.status, r.corps.motif, recus.length]));
const ok = await appelle(staff, { texte: 'euh bonjour madame', mode: 'note' });
dit('le personnel : le texte propre, le mode, Sonnet par défaut', [true, 'Bonjour madame.', 'note', 'claude-sonnet-5-5'], [ok.corps.ok, ok.corps.propre, ok.corps.mode, ok.corps.modele]);
const s0 = recus[0]?.system ?? '';
dit('… la consigne porte le mode, les mots de la Maison, la prestation vivante, le fon de la rubrique, le prénom de l équipe, et rien d archivé ni de parti',
  [true, true, true, true, true, false, false, 'euh bonjour madame'],
  [s0.includes('MODE NOTE'), s0.includes(MOTS_DE_LA_MAISON[0]), s0.includes('Retwist'), s0.includes('KLƆKLƆ'), s0.includes('Gérard'), s0.includes('Archivée'), s0.includes('Partie'), recus[0]?.messages[0]?.content]);
const parle = await appelle(staff, { texte: 'mode liste lait pain' });
dit('« mode liste » dit en parlant : le mode, et la commande ne part pas à Claude', ['liste', 'lait pain', true], [parle.corps.mode, recus[1]?.messages[0]?.content, (recus[1]?.system ?? '').includes('MODE LISTE')]);
reglages({ modeParDefaut: 'message', modele: 'claude-haiku-5-5', mots: ['Teckle'] });
const defaut = await appelle(staff, { texte: 'bonjour' });
dit('les réglages : le mode par défaut, le modèle choisi, un mot de plus', ['message', 'claude-haiku-5-5', true], [defaut.corps.mode, recus[2]?.model, (recus[2]?.system ?? '').includes('Teckle')]);
dit('… mais le mode dit par l écran passe devant le mode par défaut', 'liste', (await appelle(staff, { texte: 'a b', mode: 'liste' })).corps.mode);
reglages({ bureau: { empreinte: await empreinteDuJeton('dictee-test'), poseLe: '2026-10-31' } });
dit('la Dictée du bureau : son jeton ouvre, un faux jeton non, sans session', [true, 403, 'reserve-au-personnel'], [
  (await appelle({ 'x-jeton-dictee': 'dictee-test' }, { texte: 'bonjour', mode: 'note' })).corps.ok,
  ...(await appelle({ 'x-jeton-dictee': 'dictee-faux' }, { texte: 'bonjour', mode: 'note' }).then((r) => [r.status, r.corps.motif])),
]);
const compte = (tables.documents.find((d) => d.key === 'mnd_dictee_compte')?.data ?? {}) as Record<string, { appels?: number; entree?: number }>;
const mois = Object.keys(compte)[0];
dit('le compte du mois : cinq dictées, leurs jetons', [5, 3500], [compte[mois]?.appels, compte[mois]?.entree]);
const avant = recus.length;
tables.documents = tables.documents.filter((d) => d.key !== 'mnd_dictee_compte');
tables.documents.push({ key: 'mnd_dictee_compte', data: { [mois]: { appels: DICTEES_PAR_MOIS } } });
dit('le plafond du mois : rien n est demandé à Claude', ['plafond', avant], await appelle(staff, { texte: 'bonjour', mode: 'note' }).then((r) => [r.corps.motif, recus.length]));
tables.documents = tables.documents.filter((d) => d.key !== 'mnd_dictee_compte');
claude = () => texteDeClaude('« Bonjour — madame »');
dit('ce que Claude rend passe au net', 'Bonjour, madame', (await appelle(staff, { texte: 'bonjour madame', mode: 'note' })).corps.propre);
claude = () => ({ status: 529, corps: { error: { type: 'overloaded_error' } } });
dit('Claude surchargé : le dit, sans texte', [false, 'claude'], await appelle(staff, { texte: 'bonjour', mode: 'note' }).then((r) => [r.corps.ok, r.corps.motif]));
dit('un texte vide : refusé avant Claude', 'texte', (await appelle(staff, { texte: '   ', mode: 'note' })).corps.motif);

/* ── ③ LE CÂBLAGE ── */
const routes = lit('src/apps/trone/routes/index.tsx');
const shell = lit('src/apps/trone/shell/Shell.tsx');
const parametres = lit('src/apps/trone/routes/systeme/Parametres.tsx');
const tuiles = lit('src/apps/trone/routes/systeme/parametres-pur.ts');
const settings = lit('src/shared/settings.ts');
const manifeste = lit('public/manifest.trone.webmanifest');
const ecran = lit('src/apps/trone/routes/equipe/Dictee.tsx');
const appel = lit('src/shared/dictee.ts');
dit('la route : hors menu, nommée parmi les écrans nés après, ouverte à toute l équipe', [true, true, true], [
  routes.includes("{ path: '/dictee', label: 'Dictée MND', icon: Mic, horsMenu: true, Component: lazy(() => import('./equipe/Dictee')) },"),
  /ECRANS_NES_APRES_LES_DEPARTEMENTS[^;]*'\/dictee'/.test(routes),
  /ROUTES_MAITRE_FERMABLES = \[[^\]]*'\/dictee'/.test(routes),
]);
dit('le bouton « Dicter » de la barre du haut, pour qui voit l écran', true, shell.includes("{peutVoir(role, '/dictee', mesDomaines) && <BoutonDictee />}"));
dit('Paramètres : la tuile et son panneau', [true, true], [tuiles.includes("{ id: 'dictee', nom: 'Dictée MND',"), parametres.includes("{ouverte === 'dictee' && <CarteDictee />}")]);
dit('le réglage vit dans Settings', true, settings.includes('dictee?: ReglagesDictee;'));
dit('le raccourci du téléphone mène à la Dictée', true, manifeste.includes('"url": "./#/dictee"'));
dit('l écran ne garde rien : ni mémoire du poste, ni magasin', [false, false], [ecran.includes('localStorage'), ecran.includes('createStore')]);
dit('l appel refuse hors ligne, tout de suite', true, appel.includes("if (typeof navigator !== 'undefined' && navigator.onLine === false) return refus('hors-ligne');"));

console.log(ko === 0 ? '\nLa Dictée tient.' : `\n${ko} ECHEC.`);
process.exit(ko ? 1 : 0);
