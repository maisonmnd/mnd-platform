/* LA CLÉ D'UNE PORTE, ÉPROUVÉE — `node scripts/verifie-la-cle-du-cron.mjs`.

   17 novembre 2026 (revue de code). Dix fonctions du serveur ne s'ouvrent qu'à
   une clé. Ce banc prouve trois choses :
     A. la règle (src/shared/cle-du-cron-pur.ts) : la comparaison dit vrai et
        faux comme `===`, une clé vide ne vaut jamais, et le refus n'écrit au
        journal que des longueurs ;
     B. les dix fonctions portent le bloc, caractère pour caractère, s'en
        servent à leur porte, et ne rendent plus aucune longueur ;
     C. plus aucune d'elles ne compare sa clé avec `===`.

   Le même jour, toutes les autres portes. Le banc tient désormais chaque
   porte de la plateforme, pas seulement les dix premières :
     B. les vingt-deux fonctions DIRECTES qui portent le bloc, NOMMÉES une à
        une (en retirer une de la table de terminer-copie-serveur fait crier),
        chacune avec son genre : celles qui REFUSENT notent leur refus à leur
        nom ; celles qui RECONNAISSENT seulement la clé service (le rôle, avant
        la session, ou la liste noire d'une session) comparent par memeCle et
        ne notent rien ;
     D. les quatre fonctions REGROUPÉES (assistant-maison, conseil-du-matin,
        reception-wa, tri-des-messages) : leur source importe la règle, et le
        fichier regroupé en porte une seule memeCle et une seule noteLeRefus,
        celles de l'original au signe près (au renommage d'esbuild près),
        à jour avec sa source ;
     E. LE BALAYAGE : chaque supabase/functions/<f>/index.ts et chaque
        scripts/serveur/<f>.ts, sans liste : aucune valeur lue dans la
        requête ne se compare plus à un secret de l'environnement sans
        memeCle, aucune réponse ne porte la longueur d'une clé
        (scripts/verifie-la-cle-du-cron.balayage.mjs dit comment il suit
        les valeurs). Une fonction NEUVE à la porte naïve le fait crier,
        sans qu'on ait à l'ajouter nulle part. Seules exceptions, nommées
        une à une avec leur raison : les contrôles de santé (SANTE) ; et le
        préfixe « Bearer » se retire partout par /^Bearer\s+/i (il manquait
        l'antislash dans collecte-mtn, corrigé le même jour) ;
     F. LES TÉMOINS : l'arbre de c67620eb (avant la revue), relu par git,
        doit être refusé par le balayage, porte par porte, et rien d'autre.
        C'est la preuve que le balayage voit ce qu'il prétend voir. Sans
        git (une copie sans .git), le banc le dit et échoue.

   `--prouve` : chaque panne est posée EN MÉMOIRE (le banc lit tous ses
   fichiers par une seule fonction, qui rend le texte fautif à sa place),
   jamais sur le disque : la preuve tourne sans danger même dans l'arbre
   commun. Le banc doit crier à chacune. Empreintes comparées à la fin.
   Aucun framework de test : un échec sort en code 1. Sortie ASCII. */
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { balaie } from './verifie-la-cle-du-cron.balayage.mjs';

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const lf = (s) => s.replace(/\r\n/g, '\n');
const ascii = (v) => (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const PUR = 'src/shared/cle-du-cron-pur.ts';
const TABLE = 'scripts/terminer-copie-serveur.mjs';
const fonction = (nom) => `supabase/functions/${nom}/index.ts`;
const nomDe = (f) => f.split('/').at(-2);

/* ── LES TABLES ──────────────────────────────────────────────────────── */

/** Les fonctions directes qui portent le bloc ⟨cle-du-cron⟩, NOMMÉES, et le
    genre de leur porte. « refuse » : la porte refuse, et note son refus à
    son nom (noteLeRefus). « reconnait » : la clé service n'y est qu'un rôle
    reconnu avant la session, ou la liste noire d'une session ; une autre
    clé passe au chemin de la session, sans refus à noter (17 novembre 2026). */
const DIRECTES = {
  'avis-google': 'refuse',
  'confirmation-rdv': 'refuse',
  'rappels-j1': 'refuse',
  'sauvegarde-nuit': 'refuse',
  'envois-partent': 'refuse',
  'fete-de-couronne': 'refuse',
  'rappels-d-echeance': 'refuse',
  'relances-factures': 'refuse',
  'whatsapp-automate': 'refuse',
  'whatsapp-webhook': 'refuse',
  'terminer-et-regler': 'refuse',
  'mtn-momo-essais': 'refuse',
  'avis-google-releve': 'refuse',
  'avis-google-pont': 'refuse',
  'kkiapay-webhook': 'refuse',
  'cloture-du-jour': 'reconnait',
  'modeles-meta': 'reconnait',
  'push-notify': 'reconnait',
  'collecte-mtn': 'reconnait',
  'paie-mtn': 'reconnait',
  'ia-maison': 'reconnait',
  'centre-de-commande': 'reconnait',
};
/** Les dix premières (a9d5903b) : leur refus du cron est un 401 « réservé ». */
const LES_DIX = ['avis-google', 'confirmation-rdv', 'rappels-j1', 'sauvegarde-nuit', 'envois-partent', 'fete-de-couronne',
  'rappels-d-echeance', 'relances-factures', 'whatsapp-automate', 'whatsapp-webhook'];
/** Les fonctions regroupées qui portent la règle (importée, puis regroupée par esbuild). Toutes refusent. */
const REGROUPEES = ['assistant-maison', 'conseil-du-matin', 'reception-wa', 'tri-des-messages'];

/** LA LISTE PERMISE, courte, chaque entrée avec sa raison.
    Les contrôles de santé (GET) disent leurs secrets EN LONGUEURS : c'est
    voulu (src/shared/cle-du-cron-pur.ts, « ce qui ne change pas ») et l'outil
    de mise en ligne les lit. Chacun est nommé par la condition exacte de son
    `if` : une longueur rendue ailleurs dans la même fonction (un refus, une
    autre branche GET) n'y entre pas. */
const SANTE = [
  { fichier: fonction('fete-de-couronne'), get: "req.method === 'GET'", raison: 'le contrôle de santé : secrets: { CLE_SERVICE, WA_TOKEN… } en longueurs' },
  { fichier: fonction('rappels-d-echeance'), get: "req.method === 'GET'", raison: 'le contrôle de santé : secrets: { … } en longueurs' },
  { fichier: fonction('relances-factures'), get: "req.method === 'GET'", raison: 'le contrôle de santé : secrets: { … } en longueurs' },
  { fichier: fonction('whatsapp-automate'), get: "req.method === 'GET'", raison: 'le contrôle de santé : lg(\'CLE_SERVICE\'), lg(\'WA_TOKEN\')…' },
  { fichier: fonction('whatsapp-webhook'), get: "req.method === 'GET' && !new URL(req.url).searchParams.get('hub.mode')",
    raison: 'le contrôle de santé, un GET SANS hub.mode (la poignée de main de Meta, elle, n\'y entre pas)' },
  { fichier: fonction('whatsapp-envoi'), get: "req.method === 'GET' && new URL(req.url).searchParams.has('sonde')",
    raison: 'la sonde du 14 septembre 2026 : cleDeService « posée (N signes) »' },
];
/** Les comparaisons permises hors de memeCle : AUCUNE aujourd'hui. Le
    balayage suit aussi les empreintes (HMAC calculé avec un secret) ; celles
    de la Maison se comparent déjà à temps constant (memeEmpreinte de
    whatsapp-webhook, signatureValide de mnd-pay-webhook, apptIdDuJeton des
    liens signés), il n'en voit donc aucune. Une entrée se pose ici avec sa
    raison : { fichier, texte, raison }. */
const COMPARAISONS_PERMISES = [];

/** LES TÉMOINS : l'arbre d'avant la revue. */
const AVANT = 'c67620eb';
/** À c67620eb, les fichiers dont la porte comparait naïvement. La revue du
    17 novembre les a tous durcis, et le balayage doit les trouver tous, et
    rien d'autre (centre-de-commande, avis-google-releve, avis-google-pont et
    kkiapay-webhook comparaient déjà à temps constant, par une copie locale). */
const NAIVES_A_C67620EB = [
  'scripts/serveur/assistant-maison.ts', 'scripts/serveur/conseil-du-matin.ts', 'scripts/serveur/reception-wa.ts', 'scripts/serveur/tri-des-messages.ts',
  ...['assistant-maison', 'avis-google', 'cloture-du-jour', 'collecte-mtn', 'confirmation-rdv', 'conseil-du-matin', 'envois-partent',
    'fete-de-couronne', 'ia-maison', 'modeles-meta', 'mtn-momo-essais', 'paie-mtn', 'push-notify', 'rappels-d-echeance', 'rappels-j1',
    'reception-wa', 'relances-factures', 'sauvegarde-nuit', 'terminer-et-regler', 'tri-des-messages', 'whatsapp-webhook'].map(fonction),
].sort();
/** À c67620eb, les réponses qui rendaient les longueurs des clés : les dix premières. */
const LONGUEURS_A_C67620EB = LES_DIX.map(fonction).sort();
/** Trois témoins dits ligne à ligne : la porte la plus simple, la porte par un paramètre, la porte par une liste. */
const TEMOINS = [
  { fichier: fonction('rappels-j1'), constats: ['comparaison 1235 cleRecue !== service', 'longueur 1240 attendueLg: service.length', 'longueur 1240 recueLg: cleRecue.length'] },
  { fichier: fonction('cloture-du-jour'), constats: ['comparaison 1326 cle === service'] },
  { fichier: fonction('push-notify'), constats: ['comparaison 403 cle.trim() === recu'] },
];

/** LES PANNES de --prouve : [nom, fichier, avant, après], posées en mémoire
    (`avant` doit s'y trouver une fois et une seule, sinon ABSENTE). `avant`
    à null : un fichier NEUF, `après` est tout son texte, et le banc doit le
    trouver seul. */
const NEUVE = 'supabase/functions/porte-neuve/index.ts';
const PANNES = [
  // la règle
  ['memeCle accepte une cle vide', PUR, '  return diff === 0 && x.length > 0;', '  return diff === 0;'],
  ['le refus ecrit la cle recue au journal', PUR, '{ attendueLg: attendue.length, recueLg: recue.length }', '{ attendueLg: attendue.length, recueLg: recue.length, recue }'],
  // les copies et la table
  ['une copie du bloc retouchee (kkiapay-webhook)', fonction('kkiapay-webhook'), '  return diff === 0 && x.length > 0;', '  return diff === 0;'],
  ['une cible retiree de la table (push-notify)', TABLE, "    'supabase/functions/push-notify/index.ts',\n", ''],
  ['une porte qui refuse ne note plus son refus (avis-google-pont)', fonction('avis-google-pont'), "    noteLeRefus('avis-google-pont', JETON, jetonRecu);\n", ''],
  // une comparaison naïve remise dans une fonction directe
  ['rappels-j1 compare de nouveau avec !==', fonction('rappels-j1'), '  if (!service || !memeCle(cleRecue, service)) {', '  if (!service || cleRecue !== service) {'],
  ['cloture-du-jour reconnait le cron avec ===', fonction('cloture-du-jour'), "  if (service && memeCle(cle, service)) return 'cron';", "  if (service && cle === service) return 'cron';"],
  ['collecte-mtn reconnait le passage par includes', fonction('collecte-mtn'), '  return !!jwt && CLES_DE_SERVICE().some((cle) => memeCle(jwt, cle));', '  return !!jwt && CLES_DE_SERVICE().includes(jwt);'],
  ['la poignee de main de Meta compare avec ===', fonction('whatsapp-webhook'), 'memeCle(recu, attendu) && defi', 'recu === attendu && defi'],
  ['la signature de Meta comparee avec ===', fonction('whatsapp-webhook'), '  const okOctets = memeEmpreinte(parOctets, recue);', '  const okOctets = parOctets === recue;'],
  // puis dans une source regroupée, et dans un fichier regroupé
  ['reception-wa (source) compare de nouveau avec !==', 'scripts/serveur/reception-wa.ts', '  if (!service || !memeCle(cleRecue, service)) {', '  if (!service || cleRecue !== service) {'],
  ['tri-des-messages (source) reconnait l automate avec ===', 'scripts/serveur/tri-des-messages.ts', '    if (jeton && memeCle(jeton, service)) return avecCors(', '    if (jeton && jeton === service) return avecCors('],
  ['assistant-maison (source) remplace la regle par une copie naive', 'scripts/serveur/assistant-maison.ts',
    "import { memeCle, noteLeRefus } from '../../src/shared/cle-du-cron-pur';",
    "const memeCle = (a: string, b: string): boolean => a === b;\nconst noteLeRefus = (p: string, a: string, r: string): void => { console.error(p, a.length, r.length); };"],
  ['conseil-du-matin (regroupe) reconnait le cron avec ===', fonction('conseil-du-matin'), '  if (service && memeCle(cle, service)) return "cron";', '  if (service && cle === service) return "cron";'],
  ['tri-des-messages (regroupe) : memeCle accepte une cle vide', fonction('tri-des-messages'), '  return diff === 0 && x.length > 0;', '  return diff === 0;'],
  ['assistant-maison (regroupe) porte une seconde memeCle', fonction('assistant-maison'), '\nvar noteLeRefus = (', '\nvar memeCle = (a, b) => a === b;\nvar noteLeRefus = ('],
  // une longueur remise dans une réponse
  ['mtn-momo-essais rend de nouveau les longueurs', fonction('mtn-momo-essais'), "      return json({ erreur: 'clé du projet attendue' }, 401);", "      return json({ erreur: 'clé du projet attendue', attendueLg: ANON.length, recueLg: jeton.length }, 401);"],
  ['avis-google-pont glisse la longueur dans son message', fonction('avis-google-pont'), "    return refus(403, 'jeton', 'Jeton refusé.');", "    return refus(403, 'jeton', `Jeton refusé (${JETON.length} signes attendus).`);"],
  ['la poignee de main de Meta rend la longueur attendue', fonction('whatsapp-webhook'), "    return new Response(JSON.stringify({ erreur: 'jeton refusé' }), { status: 403 });", "    return new Response(JSON.stringify({ erreur: 'jeton refusé', lg: attendu.length }), { status: 403 });"],
  ['tri-des-messages (source) rend la longueur de la cle service', 'scripts/serveur/tri-des-messages.ts', "auJournal(json({ ok: false, motif: 'porte', version: VERSION }, 401))", "auJournal(json({ ok: false, motif: 'porte', version: VERSION, lg: service.length }, 401))"],
  ['le prefixe Bearer ne se retire plus (mtn-momo-essais)', fonction('mtn-momo-essais'), ".replace(/^Bearer\\s+/i, '').trim();", ".replace(/^Bearers+/i, '').trim();"],
  ['la sonde de whatsapp-envoi sort du GET', fonction('whatsapp-envoi'), "  if (req.method === 'GET' && new URL(req.url).searchParams.has('sonde')) {", "  if (new URL(req.url).searchParams.has('sonde')) {"],
  // une fonction neuve, à la porte naïve, que personne n'a ajoutée nulle part
  ['une fonction neuve compare le jeton du corps avec !==', NEUVE, null, [
    'Deno.serve(async (req) => {',
    "  const attendu = (Deno.env.get('JETON_DU_PARTENAIRE') ?? '').trim();",
    '  const { jeton } = await req.json();',
    "  if (jeton !== attendu) return new Response(JSON.stringify({ erreur: 'refusé' }), { status: 403 });",
    "  return new Response('ok');",
    '});',
  ].join('\n')],
  ['une fonction neuve compare l adresse par startsWith, a travers deux fonctions', NEUVE, null, [
    "const cleAttendue = () => (Deno.env.get('CRON_SECRET') ?? '').trim();",
    "const cleDe = (r: Request) => new URL(r.url).searchParams.get('cle') ?? '';",
    'Deno.serve(async (req) => {',
    "  if (!cleDe(req).startsWith(cleAttendue())) return new Response('non', { status: 401 });",
    "  return new Response('ok');",
    '});',
  ].join('\n')],
  ['une fonction neuve rend la longueur de sa cle', NEUVE, null, [
    'Deno.serve(async (req) => {',
    "  const cle = (Deno.env.get('CLE_SERVICE') ?? '').trim();",
    "  const recue = (req.headers.get('authorization') ?? '').replace(/^Bearer\\s+/i, '').trim();",
    '  const diag = { attendu: cle.length };',
    "  if (!recue) return new Response(JSON.stringify(diag), { status: 401 });",
    "  return new Response('ok');",
    '});',
  ].join('\n')],
];

/* ── LES LECTURES ────────────────────────────────────────────────────── */
const surDisque = new Map();
const lisDisque = (f) => {
  if (!surDisque.has(f)) surDisque.set(f, existsSync(path.join(racine, f)) ? lf(readFileSync(path.join(racine, f), 'utf8')) : null);
  return surDisque.get(f);
};
const dossierTemp = mkdtempSync(path.join(tmpdir(), 'verifie-la-cle-du-cron-'));
process.on('exit', () => { try { rmSync(dossierTemp, { recursive: true, force: true }); } catch { /* déjà parti */ } });

/** La table des copies, chargée depuis le texte que le banc lit (une panne peut y retirer une cible). */
const tables = new Map();
async function laTable(texte) {
  if (!tables.has(texte)) {
    const f = path.join(dossierTemp, `table-${tables.size}.mjs`);
    writeFileSync(f, texte);
    tables.set(texte, await import(pathToFileURL(f).href));
  }
  return tables.get(texte);
}
/** La règle elle-même, transpilée depuis le texte que le banc lit. */
const regles = new Map();
async function laRegle(texte) {
  if (!regles.has(texte)) {
    /* `charset: 'utf8'`, comme les générateurs : sans lui, esbuild écrit « é » en \xE9. */
    const { code } = await transform(texte, { loader: 'ts', format: 'esm', charset: 'utf8' });
    regles.set(texte, { code, module: await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) });
  }
  return regles.get(texte);
}
/** Ce que chaque générateur fabrique depuis le dépôt (sur le disque : une panne en mémoire ne le change pas). */
const generes = new Map();
async function leFichierAttendu(nom) {
  if (!generes.has(nom)) generes.set(nom, await (await import(`./${nom}-serveur.mjs`)).fichierAttendu(racine));
  return generes.get(nom);
}
/** L'arbre d'avant la revue, relu par git (une seule fois). */
let arbreAvant;
function lArbreAvant() {
  if (arbreAvant !== undefined) return arbreAvant;
  arbreAvant = null;
  const ls = spawnSync('git', ['ls-tree', '-r', '--name-only', AVANT, '--', 'supabase/functions', 'scripts/serveur'], { cwd: racine, encoding: 'utf8' });
  if (ls.status !== 0) return arbreAvant;
  const chemins = ls.stdout.split('\n').filter((f) => /^supabase\/functions\/[^/]+\/index\.ts$|^scripts\/serveur\/[^/]+\.ts$/.test(f));
  const lot = spawnSync('git', ['cat-file', '--batch'], { cwd: racine, input: `${chemins.map((f) => `${AVANT}:${f}`).join('\n')}\n`, maxBuffer: 1 << 28 });
  if (lot.status !== 0) return arbreAvant;
  const brut = lot.stdout;
  const textes = new Map();
  let pos = 0;
  for (const f of chemins) {
    const fin = brut.indexOf(10, pos);
    const taille = Number(brut.subarray(pos, fin).toString().split(' ')[2]);
    if (!Number.isFinite(taille)) return arbreAvant;
    textes.set(f, lf(brut.subarray(fin + 1, fin + 1 + taille).toString('utf8')));
    pos = fin + 1 + taille + 1;
  }
  arbreAvant = textes;
  return arbreAvant;
}
const lesFonctionsDuDepot = () => readdirSync(path.join(racine, 'supabase/functions')).map(fonction).filter((f) => existsSync(path.join(racine, f)));
const lesSourcesRegroupees = () => readdirSync(path.join(racine, 'scripts/serveur')).filter((f) => f.endsWith('.ts')).map((f) => `scripts/serveur/${f}`);

/** Une fonction telle qu'esbuild l'imprime, ses noms locaux rendus neutres
    (esbuild renomme `a` en `a2` quand le nom est déjà pris dans le paquet). */
function formeDe(texte, nom) {
  const sf = ts.createSourceFile('x.js', texte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  let init = null;
  const cherche = (n) => {
    if (!init && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === nom && n.initializer) init = n.initializer;
    if (!init) ts.forEachChild(n, cherche);
  };
  cherche(sf);
  if (!init) return null;
  const locaux = [];
  const declare = (n) => {
    if ((ts.isParameter(n) || ts.isVariableDeclaration(n)) && ts.isIdentifier(n.name) && !locaux.includes(n.name.text)) locaux.push(n.name.text);
    ts.forEachChild(n, declare);
  };
  declare(init);
  const scan = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, init.getText(sf));
  const jetons = [];
  for (let k = scan.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scan.scan()) {
    const t = scan.getTokenText();
    jetons.push(k === ts.SyntaxKind.Identifier && locaux.includes(t) ? `$${locaux.indexOf(t)}` : t);
  }
  return jetons.join(' ');
}
const definitionsDe = (texte, nom) => (texte.match(new RegExp(`(?:^|[\\s;])(?:var|let|const)\\s+${nom}\\s*=|function\\s+${nom}\\s*\\(`, 'gm')) ?? []).length;

/* ── LES CONTRÔLES ───────────────────────────────────────────────────── */
async function controles(lis, ajoutes, dit) {
  /* ── A. LA RÈGLE ───────────────────────────────────────────────────── */
  const { code: regleImprimee, module: regle } = await laRegle(lis(PUR));
  const { memeCle, noteLeRefus } = regle;
  const CLE = 'sb_secret_Exemple-de-cle_0123456789abcdefgh';
  dit('la meme cle ouvre', true, memeCle(CLE, CLE));
  dit('une cle differente, plus courte, plus longue, ou d un seul signe : refusee', [false, false, false, false],
    [memeCle('sb_secret_Autre-cle-de-la-meme-longueur_0123456', CLE), memeCle(CLE.slice(0, -1), CLE), memeCle(`${CLE}x`, CLE), memeCle(`${CLE.slice(0, -1)}H`, CLE)]);
  dit('une cle vide ne vaut jamais, meme contre une cle vide (secret pas pose)', [false, false, false], [memeCle('', CLE), memeCle(CLE, ''), memeCle('', '')]);
  dit('les accents et les signes hors ASCII se comparent en octets', [true, false], [memeCle('clé-é', 'clé-é'), memeCle('clé-é', 'cle-e')]);
  /* Elle dit exactement ce que `===` disait, sur mille paires tirees au sort. */
  let ecarts = 0;
  let graine = 20261117;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const mot = () => Array.from({ length: 1 + Math.floor(hasard() * 6) }, () => 'ab'[Math.floor(hasard() * 2)]).join('');
  for (let i = 0; i < 1000; i += 1) { const a = mot(); const b = mot(); if (memeCle(a, b) !== (a === b)) ecarts += 1; }
  dit('mille paires au hasard : le meme verdict que ===', 0, ecarts);

  const ecrits = [];
  const garde = console.error;
  console.error = (...a) => { ecrits.push(a); };
  try { noteLeRefus('une-fonction', CLE, 'eyJ-mauvaise'); } finally { console.error = garde; }
  const journal = JSON.stringify(ecrits);
  dit('le refus s ecrit au journal : la porte et les deux longueurs', [1, true, { attendueLg: CLE.length, recueLg: 12 }],
    [ecrits.length, String(ecrits[0]?.[0]).startsWith('une-fonction'), ecrits[0]?.[1]]);
  dit('... jamais une valeur', [false, false], [journal.includes(CLE), journal.includes('eyJ-mauvaise')]);

  /* ── B. LES FONCTIONS DIRECTES ─────────────────────────────────────── */
  const { COPIES, entre } = await laTable(lis(TABLE));
  const cibles = COPIES.find((c) => c.bloc === 'cle-du-cron')?.cibles ?? [];
  dit('les fonctions directes qui portent le bloc sont celles-ci, nommees une a une', Object.keys(DIRECTES).map(fonction).sort(), [...cibles].sort());
  const original = entre(lis(PUR), 'cle-du-cron');
  dit('chaque copie est l original, caractere pour caractere', [],
    cibles.filter((f) => { const t = lis(f); return t === null || original === null || entre(t, 'cle-du-cron') !== original; }));
  dit('le bloc n importe ni n exporte rien (il vit dans une fonction Edge)', [false, false], [/^\s*import\s/m.test(original ?? ''), /^\s*export\s/m.test(original ?? '')]);

  const sansLeBloc = (f) => {
    const t = lis(f) ?? '';
    const bloc = entre(t, 'cle-du-cron') ?? '';
    return bloc ? t.replace(bloc, '') : t;
  };
  const genre = (f) => DIRECTES[nomDe(f)];
  dit('chaque porte compare par memeCle', [], cibles.filter((f) => !sansLeBloc(f).includes('memeCle(')));
  dit('celles qui refusent notent leur refus a leur nom', [],
    cibles.filter((f) => genre(f) === 'refuse' && !sansLeBloc(f).includes(`noteLeRefus('${nomDe(f)}',`)));
  dit('celles qui reconnaissent seulement la cle service ne notent rien', [],
    cibles.filter((f) => genre(f) === 'reconnait' && sansLeBloc(f).includes('noteLeRefus(')));
  dit('aucune reponse ne porte plus de longueur de cle', [], cibles.filter((f) => /attendueLg|recueLg/.test(sansLeBloc(f))));
  dit('une seule definition de memeCle et de noteLeRefus par fonction', [],
    cibles.filter((f) => definitionsDe(lis(f) ?? '', 'memeCle') !== 1 || definitionsDe(lis(f) ?? '', 'noteLeRefus') !== 1));

  /* ── C. PLUS DE `===` SUR UNE CLÉ (le vieux contrôle, gardé) ────────── */
  dit('aucune ne compare plus sa cle avec === ou !==', [],
    cibles.filter((f) => /(cleRecue|recue|recu)\s*[!=]==\s*(service|attendu)\b|(service|attendu)\s*[!=]==\s*(cleRecue|recue|recu)\b/.test(sansLeBloc(f))));
  dit('le refus du cron des dix premieres reste un 401 qui dit seulement « reserve »', [],
    LES_DIX.map(fonction).filter((f) => nomDe(f) !== 'whatsapp-webhook' && !/erreur: 'réservé au (cron|webhook)' \}(\), \{ status: 401 \}|, 401)/.test(sansLeBloc(f))));
  dit('la poignee de main de Meta refuse en 403, sans longueur', true,
    /JSON\.stringify\(\{ erreur: 'jeton refusé' \}\), \{ status: 403 \}/.test(sansLeBloc(fonction('whatsapp-webhook'))));

  /* ── D. LES FONCTIONS REGROUPÉES ───────────────────────────────────── */
  const regroupees = lesFonctionsDuDepot().filter((f) => (lis(f) ?? '').includes('fichier REGROUPÉ, ne pas modifier à la main'));
  dit('les fichiers regroupes qui portent la regle sont ceux-ci, nommes', REGROUPEES.map(fonction),
    regroupees.filter((f) => (lis(f) ?? '').includes('// src/shared/cle-du-cron-pur.ts')).sort());
  dit('les sources qui importent la regle (../../src/shared/cle-du-cron-pur) sont celles-ci, nommees', REGROUPEES.map((g) => `scripts/serveur/${g}.ts`),
    lesSourcesRegroupees().filter((f) => (lis(f) ?? '').includes("import { memeCle, noteLeRefus } from '../../src/shared/cle-du-cron-pur';")).sort());
  dit('chaque fichier regroupe porte une seule memeCle et une seule noteLeRefus', [],
    REGROUPEES.map(fonction).filter((f) => definitionsDe(lis(f) ?? '', 'memeCle') !== 1 || definitionsDe(lis(f) ?? '', 'noteLeRefus') !== 1));
  const formes = { memeCle: formeDe(regleImprimee, 'memeCle'), noteLeRefus: formeDe(regleImprimee, 'noteLeRefus') };
  dit('... celles de l original, signe pour signe (au renommage d esbuild pres)', [],
    REGROUPEES.map(fonction).filter((f) => !formes.memeCle || formeDe(lis(f) ?? '', 'memeCle') !== formes.memeCle || formeDe(lis(f) ?? '', 'noteLeRefus') !== formes.noteLeRefus));
  dit('chaque source compare par memeCle et note son refus a son nom', [],
    REGROUPEES.filter((g) => { const t = lis(`scripts/serveur/${g}.ts`) ?? ''; return !t.includes('memeCle(') || !t.includes(`noteLeRefus('${g}',`); }));
  const enRetard = [];
  for (const g of REGROUPEES) if (lis(fonction(g)) !== await leFichierAttendu(g)) enRetard.push(fonction(g));
  dit('chaque fichier regroupe est a jour avec sa source', [], enRetard);

  /* ── E. LE BALAYAGE ────────────────────────────────────────────────── */
  const fichiers = [...lesFonctionsDuDepot(), ...ajoutes.filter((f) => f.startsWith('supabase/')), ...lesSourcesRegroupees()];
  const textes = new Map(fichiers.map((f) => [f, lis(f) ?? '']));
  dit('chaque fonction du depot ouvre sa porte par Deno.serve (le balayage y suit la requete)', [],
    fichiers.filter((f) => f.startsWith('supabase/') && !textes.get(f).includes('Deno.serve(')));
  /* La clé reçue elle-même : sans l'antislash, `/^Bearers+/i` ne retire
     rien, « Bearer » reste collé au jeton, et aucune comparaison ne peut
     plus le reconnaître (collecte-mtn, personnel(), de fbfa0321 au
     17 novembre 2026). */
  dit('le prefixe « Bearer » se retire partout par /^Bearer\\s+/i', [],
    fichiers.flatMap((f) => [...textes.get(f).matchAll(/\/\^Bearer[^/\n]*\/[a-z]*/g)].filter((m) => m[0] !== '/^Bearer\\s+/i').map((m) => `${f} : ${m[0]}`)));
  const constats = balaie(textes);
  const permise = (c) => COMPARAISONS_PERMISES.some((p) => p.fichier === c.fichier && p.texte === c.texte);
  const deSante = (c) => SANTE.some((s) => s.fichier === c.fichier && s.get === c.get);
  const dits = (l) => l.map((c) => `${c.fichier}:${c.ligne} ${c.texte}`);
  const naives = constats.filter((c) => c.genre === 'comparaison' && !permise(c));
  dit('aucune fonction ne compare une valeur recue a un secret sans memeCle', [], dits(naives.filter((c) => c.fichier.startsWith('supabase/'))));
  dit('aucune source regroupee non plus', [], dits(naives.filter((c) => c.fichier.startsWith('scripts/'))));
  dit('aucune reponse ne porte la longueur d une cle (hors des controles de sante nommes)', [], dits(constats.filter((c) => c.genre === 'longueur' && !deSante(c))));
  dit('chaque entree de la liste permise sert encore', [],
    [...SANTE.filter((s) => !constats.some((c) => c.genre === 'longueur' && c.fichier === s.fichier && c.get === s.get)).map((s) => `${s.fichier} : ${s.get}`),
      ...COMPARAISONS_PERMISES.filter((p) => !constats.some((c) => c.genre === 'comparaison' && c.fichier === p.fichier && c.texte === p.texte)).map((p) => `${p.fichier} : ${p.texte}`)]);

  /* ── F. LES TÉMOINS : l'arbre d'avant la revue ─────────────────────── */
  const avant = lArbreAvant();
  dit(`l arbre de ${AVANT} se relit par git`, true, !!avant);
  if (avant) {
    const vus = balaie(avant);
    dit(`${AVANT} : le balayage refuse chaque porte naive que la revue a durcie, et elles seules`, NAIVES_A_C67620EB,
      [...new Set(vus.filter((c) => c.genre === 'comparaison').map((c) => c.fichier))].sort());
    dit(`${AVANT} : ... et chaque reponse qui rendait les longueurs des cles`, LONGUEURS_A_C67620EB,
      [...new Set(vus.filter((c) => c.genre === 'longueur' && !deSante(c)).map((c) => c.fichier))].sort());
    for (const t of TEMOINS) {
      dit(`${AVANT} : ${nomDe(t.fichier)}, porte par porte`, t.constats, vus.filter((c) => c.fichier === t.fichier && !deSante(c)).map((c) => `${c.genre} ${c.ligne} ${c.texte}`));
    }
  }
}

/* ── LE BANC ─────────────────────────────────────────────────────────── */
const parleur = () => {
  let n = 0;
  let echecs = 0;
  const dit = (nom, attendu, obtenu) => {
    n += 1;
    const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
    if (!ok) echecs += 1;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
    if (!ok) console.log(`       attendu ${ascii(attendu)}`);
  };
  return { dit, bilan: () => ({ n, echecs }) };
};
const muet = () => {
  const cries = [];
  const dit = (nom, attendu, obtenu) => { if (JSON.stringify(attendu) !== JSON.stringify(obtenu)) cries.push(nom); };
  return { dit, cries };
};

if (!prouve) {
  const { dit, bilan } = parleur();
  await controles(lisDisque, [], dit);
  const { n, echecs } = bilan();
  console.log(`\n${n} verifications.`);
  console.log(echecs ? 'ECHEC : une porte laisse encore fuir quelque chose.' : 'TOUT VA BIEN : chaque porte de la plateforme compare sans rien laisser fuir.');
  process.exit(echecs ? 1 : 0);
}

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const touches = [...new Set(PANNES.map((p) => p[1]))].filter((f) => existsSync(path.join(racine, f)));
const empreintes = new Map(touches.map((f) => [f, md5(f)]));
const propre = muet();
await controles(lisDisque, [], propre.dit);
if (propre.cries.length) {
  console.log('Le banc ne passe pas sur le code propre :');
  for (const c of propre.cries) console.log(`  ${c}`);
  process.exit(1);
}
let muettes = 0;
let absentes = 0;
for (const [nom, fichier, avant, apres] of PANNES) {
  let lis = lisDisque;
  const ajoutes = [];
  if (avant === null) {
    if (lisDisque(fichier) !== null) { console.log(`ABSENTE  ${nom} (${fichier} existe deja)`); absentes += 1; continue; }
    ajoutes.push(fichier);
    lis = (f) => (f === fichier ? apres : lisDisque(f));
  } else {
    const texte = lisDisque(fichier);
    if (texte === null || texte.split(avant).length !== 2) { console.log(`ABSENTE  ${nom} (le texte a remettre n est pas une fois dans ${fichier})`); absentes += 1; continue; }
    const fautif = texte.replace(avant, () => apres);
    lis = (f) => (f === fichier ? fautif : lisDisque(f));
  }
  const m = muet();
  await controles(lis, ajoutes, m.dit);
  if (m.cries.length === 0) { console.log(`MUETTE   ${nom}`); muettes += 1; } else console.log(`CRIEE    ${nom}  (${m.cries.slice(0, 2).join(' ; ')}${m.cries.length > 2 ? ' ; ...' : ''})`);
}
const intacts = touches.every((f) => md5(f) === empreintes.get(f));
console.log(`\n${PANNES.length - muettes - absentes}/${PANNES.length} fautes criees${intacts ? ', fichiers rendus intacts' : ', FICHIERS ALTERES'}.`);
process.exit(muettes || absentes || !intacts ? 1 : 0);
