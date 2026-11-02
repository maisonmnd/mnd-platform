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
   Les dictées du banc sont inventées : aucun vrai message ici.
   ④ Un jeton par ordinateur (2 novembre 2026) : un poste ouvre la porte, le
      bureau aussi, un poste retiré non ; la liste bornée, à l'ajout comme à
      la lecture ; le fichier qui part, à la lettre la fonction éprouvée ; et
      Paramètres qui demande le nom par la question de la Maison. */
import { readFileSync } from 'node:fs';
import {
  DICTEES_PAR_MOIS, ID_DU_BUREAU, MOTS_DE_LA_MAISON, NOM_DU_BUREAU, NOM_DU_POSTE_AU_PLUS, POSTES_AU_PLUS, ajouteUnPoste, auPropreIci,
  consigneDeLaDictee, empreinteDuJeton, empreintesDesPostes, jourDuPoste, litLaCommandeDeMode, motsDuTexte, motsPropres, nettoieLaReponse,
  nomDuPoste, nomDuPosteDe, nouveauJeton, nouvelIdDePoste, postesDeLaDictee, retireUnPoste, type IssueDuPoste, type PosteDictee,
  type ReglagesDictee,
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

/* ── ④ UN JETON PAR ORDINATEUR, LE CERVEAU PUR ── */
const b0 = { empreinte: e1, poseLe: '2026-10-31' };
const posteDe = async (i: number, nom = `Poste ${i}`): Promise<PosteDictee> =>
  ({ id: `p${i}`, nom, empreinte: await empreinteDuJeton(`dictee-p${i}`), poseLe: '2026-11-02' });
const motif = (x: IssueDuPoste): string => (x.ok ? 'ok' : x.motif);
const recus0: ReglagesDictee = { bureau: b0, mots: ['Teckle'] };
const gele = JSON.stringify(recus0);
const a1 = ajouteUnPoste(recus0, await posteDe(1, '  Le   Mac  '));
dit('un poste s ajoute : son nom au propre, le bureau et les mots restent, les réglages reçus intacts', [true, 'Le Mac', JSON.stringify(b0), ['Teckle'], gele], [
  a1.ok, a1.ok ? a1.poste.nom : '', a1.ok ? JSON.stringify(a1.reglages.bureau) : '', a1.ok ? a1.reglages.mots : null, JSON.stringify(recus0),
]);
const avecMac: ReglagesDictee = a1.ok ? a1.reglages : {};
dit(`le nom du poste : ${NOM_DU_POSTE_AU_PLUS} signes au plus, sans blanc en trop ; vide, ou déjà porté (le PC compris), refusé`, [NOM_DU_POSTE_AU_PLUS, 'a b', 'nom', 'meme-nom', 'meme-nom'], [
  nomDuPoste('M'.repeat(60)).length, nomDuPoste('  a \n b  '),
  motif(ajouteUnPoste({}, await posteDe(2, '   '))),
  motif(ajouteUnPoste(avecMac, await posteDe(3, 'le mac'))),
  motif(ajouteUnPoste({ bureau: b0 }, await posteDe(4, NOM_DU_BUREAU))),
]);
let rempli: ReglagesDictee = { bureau: b0 };
const issues: string[] = [];
for (let i = 1; i <= POSTES_AU_PLUS + 1; i += 1) {
  const x = ajouteUnPoste(rempli, await posteDe(i));
  issues.push(motif(x));
  if (x.ok) rempli = x.reglages;
}
const huitBruts: ReglagesDictee = { bureau: b0, postes: await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map((i) => posteDe(i))) };
dit(`la liste est bornée : ${POSTES_AU_PLUS} postes au plus, le suivant refusé ; à la lecture aussi, le bureau en plus`,
  [[...Array(POSTES_AU_PLUS).fill('ok'), 'plein'], POSTES_AU_PLUS, POSTES_AU_PLUS + 1, false], [
    issues, postesDeLaDictee(huitBruts).length, empreintesDesPostes(huitBruts).length,
    empreintesDesPostes(huitBruts).includes(huitBruts.postes?.[POSTES_AU_PLUS]?.empreinte ?? ''),
  ]);
const p1 = await posteDe(1); const p2 = await posteDe(2); const p3 = await posteDe(3); const p4 = await posteDe(4);
const deuxPostes: ReglagesDictee = { bureau: b0, postes: [p1, p2] };
const sansP1 = retireUnPoste(deuxPostes, 'p1');
const sansPc = retireUnPoste(deuxPostes, ID_DU_BUREAU);
dit('retirer un poste : les autres et le bureau restent ; retirer le PC : les postes restent ; les réglages reçus intacts', [['p2'], true, false, ['p1', 'p2'], 2], [
  postesDeLaDictee(sansP1).map((p) => p.id), !!sansP1.bureau, !!sansPc.bureau, postesDeLaDictee(sansPc).map((p) => p.id), deuxPostes.postes?.length,
]);
const malFormes: ReglagesDictee = { bureau: b0, postes: [p1, { ...p2, empreinte: 'pas-une-empreinte' }, { ...p3, empreinte: e1 }, { ...p4, id: 'p1' }, { ...p4, id: ID_DU_BUREAU }] };
dit('les empreintes qui ouvrent : le bureau d abord, puis chaque poste ; mal formée, en double ou sous un id pris, rien', [[e1, p1.empreinte, p2.empreinte], [e1, p1.empreinte], NOM_DU_BUREAU, 'Poste 2', ''], [
  empreintesDesPostes(deuxPostes), empreintesDesPostes(malFormes), nomDuPosteDe(deuxPostes, e1), nomDuPosteDe(deuxPostes, p2.empreinte), nomDuPosteDe(deuxPostes, 'f'.repeat(64)),
]);
dit('un id de poste neuf, et la date du poste avec l année', [true, true, '2 novembre 2026', '1er novembre 2026'], [
  /^poste-[0-9a-f]{12}$/.test(nouvelIdDePoste()), nouvelIdDePoste() !== nouvelIdDePoste(), jourDuPoste('2026-11-02'), jourDuPoste('2026-11-01'),
]);

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

/* ── ④ UN JETON PAR ORDINATEUR, À LA PORTE DE LA FONCTION ── */
claude = () => texteDeClaude('Bonjour.');
const ouvre = async (jeton: string) => {
  const r = await appelle({ 'x-jeton-dictee': jeton }, { texte: 'bonjour', mode: 'note' });
  return r.corps.ok === true ? 'ouvre' : String(r.corps.motif);
};
const mac: PosteDictee = { id: 'poste-mac', nom: 'Le Mac', empreinte: await empreinteDuJeton('dictee-mac'), poseLe: '2026-11-02' };
const accueil: PosteDictee = { id: 'poste-accueil', nom: 'L’ordinateur de l’accueil', empreinte: await empreinteDuJeton('dictee-accueil'), poseLe: '2026-11-02' };
const r1 = ajouteUnPoste({ bureau: b0 }, mac);
const r2 = r1.ok ? ajouteUnPoste(r1.reglages, accueil) : r1;
const avecDeux: ReglagesDictee = r2.ok ? r2.reglages : { bureau: b0 };
reglages(avecDeux);
dit('un poste ouvre la porte avec son jeton, l autre poste aussi, sans session', ['ouvre', 'ouvre'], [await ouvre('dictee-mac'), await ouvre('dictee-accueil')]);
dit('le bureau l ouvre toujours, à côté des postes ; un faux jeton non', ['ouvre', 'reserve-au-personnel'], [await ouvre('dictee-test'), await ouvre('dictee-faux')]);
reglages(retireUnPoste(avecDeux, mac.id));
dit('un poste retiré n ouvre plus ; l autre poste et le bureau, si', ['reserve-au-personnel', 'ouvre', 'ouvre'], [
  await ouvre('dictee-mac'), await ouvre('dictee-accueil'), await ouvre('dictee-test'),
]);
reglages(huitBruts);
dit(`au-delà de ${POSTES_AU_PLUS} postes, une ligne écrite à la main n ouvre rien`, ['ouvre', 'ouvre', 'reserve-au-personnel'], [
  await ouvre('dictee-p1'), await ouvre(`dictee-p${POSTES_AU_PLUS}`), await ouvre(`dictee-p${POSTES_AU_PLUS + 1}`),
]);
reglages({ bureau: b0 });
dit('le bureau seul, comme le 31 octobre : son jeton ouvre toujours', 'ouvre', await ouvre('dictee-test'));

/* LE FICHIER QUI PART : à la lettre la fonction regroupée du dépôt (sans
   panne), le module pur recopié dedans et non importé. */
const CIBLE = 'supabase/functions/dictee-au-propre/index.ts';
const deploye = lit(CIBLE);
const attendu = readFileSync(process.env.DICTEE_ATTENDU as string, 'utf8').replace(/\r\n/g, '\n');
dit('le fichier qui part : la fonction du dépôt à la lettre, la porte des postes et le module pur recopiés, rien d importé du dépôt', [true, true, true, true, false], [
  deploye === attendu, deploye.includes('function postesDeLaDictee('), deploye.includes('var empreintesDesPostes = '),
  deploye.includes('if (empreintesDesPostes(reglages).includes(lue)) {'), /from ["'][^"']*(?:src\/shared|dictee-pur)/.test(deploye),
]);

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

const carte = lit('src/apps/trone/routes/systeme/CarteDictee.tsx');
dit('Paramètres › Dictée : « Donner un jeton à un autre ordinateur », le nom demandé par la question de la Maison, jamais par le navigateur', [true, true, false], [
  carte.includes('Donner un jeton à un autre ordinateur'), carte.includes('    const nom = await demandeUnTexte({'), /\bwindow\.prompt\b|(?<![\w.])prompt\(/.test(carte),
]);
dit('… le jeton fabriqué comme celui du bureau, montré une fois, l empreinte seule rangée ; chaque ordinateur a son « Retirer » ; le bureau garde ses gestes', [true, true, true, true, true, true, true, true], [
  carte.includes('const jeton = nouveauJeton();\n    const poste: PosteDictee = {\n      id: nouvelIdDePoste(), nom, empreinte: await empreinteDuJeton(jeton), poseLe: aujourdhui,'),
  carte.includes('const i = ajouteUnPoste(s.dictee, issue.poste);'),
  carte.includes('setJetonMontre({ jeton, id: issue.poste.id, nom: issue.poste.nom });'),
  carte.includes('dictee: retireUnPoste(s.dictee, o.id)'),
  carte.includes('{ordinateurs.map((o) => ('),
  carte.includes('onClick={() => void retireUnOrdinateur(o)}>Retirer</button>'),
  carte.includes('>Donner un jeton au bureau</button>'),
  carte.includes('>Refaire un jeton</button>'),
]);
const composant = carte.slice(carte.indexOf('export function CarteDictee()'));
const premierRetour = composant.search(/\n {2}(?:if \([^\n]*\) )?return\b/);
const crochets = [...composant.matchAll(/\buse[A-Z]\w*(?:<[^>\n]*>)?\(/g)].map((m) => m.index ?? 0);
dit('… les crochets React avant tout retour', true, premierRetour > 0 && crochets.length >= 5 && Math.max(...crochets) < premierRetour);

console.log(ko === 0 ? '\nLa Dictée tient.' : `\n${ko} ECHEC.`);
process.exit(ko ? 1 : 0);
