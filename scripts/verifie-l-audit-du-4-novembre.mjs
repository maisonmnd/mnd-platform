import { build, transformSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* L'AUDIT DU 4 NOVEMBRE, TENU ENSEMBLE — `node scripts/verifie-l-audit-du-4-novembre.mjs`
   (17 novembre 2026, revue de l'audit).

   L'audit a retourné la porte et fermé l'amorçage du fondateur. Ce banc lit
   les vrais fichiers et tient ensemble ce qui en est sorti :
     · LA PORTE. Avec un backend, la connexion est exigée par défaut
       (`requireAuth`, shared/auth.ts) ; VITE_ALLOW_OPEN=true seul l'efface,
       VITE_REQUIRE_AUTH ne s'écrit plus nulle part. Le module est chargé
       pour de bon, sous plusieurs environnements.
     · LA CONSTRUCTION. build-sites.mjs épingle VITE_ALLOW_OPEN à 'false',
       en dernier, pour tous les sites ; et CHAQUE lancement de Vite d'un
       script de scripts/ qui a un backend nomme VITE_ALLOW_OPEN dans son
       env, après toute recopie. Le détecteur est générique : un banc écrit
       demain qui oublie le verrou fait crier celui-ci. Un lancement qu'il ne
       sait pas lire (commande dans une variable, Vite appelé en programme,
       env qui n'est pas un objet écrit sur place) crie aussi : mieux vaut
       l'écrire lisiblement que le laisser passer.
     · LE FONDATEUR. Plus rien n'appelle ni ne crée `provision_first_staff` ;
       apply_auth.sql la supprime ; une seule migration la supprime, 0213 ; le
       gabarit d'apply_rls_prod.sql s'arrête quand l'adresse n'a pas de
       compte. La porte du Trône (AuthGate) ne promet plus de fonder la
       Maison.
     · LE TIROIR DE SESSION. Ma Couronne a le sien partout : la portée vient
       de VITE_AUTH_SCOPE, sinon de la balise de couronne.html (et d'aucune
       autre page). La fonction pure est éprouvée, puis le module chargé
       sous de vraies pages (le texte de couronne.html et de trone.html).
     · L'ÉCHAPPEMENT. Une seule copie de `escHtml`, shared/echappe-html-pur.
     · docs/BACKEND.md dit ce qui est vrai.

   La clé des fonctions Edge n'est PAS de ce banc : il ne lit rien sous
   supabase/functions/.

   Le paquet s'écrit dans un dossier temporaire du système, jamais dans
   node_modules (le node_modules d'un worktree est une jonction vers celui du
   dépôt). Sortie ASCII : la console de Windows.

   `--prouve` : chaque faute est posée à son tour dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées) ; un fichier
   neuf est retiré, un fichier renommé reprend son nom. Le banc doit crier à
   chacune, ET PAR L'ÉPREUVE QUI LA GARDE : une faute qui ne fait tomber
   qu'une autre épreuve compte comme ratée. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const MOI = 'scripts/verifie-l-audit-du-4-novembre.mjs';

/* ── Les épreuves, nommées une fois (les fautes de --prouve les visent) ─ */
const E = {
  porteTexte: 'porte : requireAuth = isRemote && VITE_ALLOW_OPEN !== \'true\' (le texte)',
  porteModule: 'porte : le module charge, la connexion exigee par defaut, seul \'true\' l\'efface',
  requireAuth: 'porte : VITE_REQUIRE_AUTH ne s\'ecrit plus (src/, scripts/, docs/BACKEND.md, .env.example)',
  envExemple: 'porte : .env.example n\'ouvre jamais (VITE_ALLOW_OPEN=true en commentaire seulement)',
  appel: 'fondateur : rien dans src/ n\'appelle provision_first_staff (ni ensureFounder)',
  applyAuth: 'fondateur : apply_auth.sql supprime provision_first_staff et ne la cree jamais',
  uneMigration: 'fondateur : une seule migration la supprime, 0213_fermer_provision_first_staff.sql',
  numero: 'fondateur : 0213 existe et est seule a son numero',
  plusDe0153: 'fondateur : plus de fichier 0153_fermer_provision_first_staff.sql',
  personneNeCree: 'fondateur : hors des migrations passees (0001 a 0212), aucun .sql de supabase/ ne la cree',
  gabarit: 'fondateur : le gabarit d\'apply_rls_prod.sql s\'arrete quand aucun compte ne porte l\'adresse',
  sitesVerrou: 'build-sites : VITE_ALLOW_OPEN \'false\', pose en dernier dans l\'env de chaque site',
  sitesEvalue: 'build-sites : ni l\'environnement du poste ni l\'env d\'un site ne le levent (env evalue)',
  sitesAucun: 'build-sites : aucun site ne nomme VITE_ALLOW_OPEN dans son env',
  bancs: 'bancs : chaque construction Vite avec un backend nomme VITE_ALLOW_OPEN, apres toute recopie',
  lisible: 'bancs : chaque lancement de Vite se lit (appel reconnu, env ecrit sur place)',
  detecteur: 'bancs : le detecteur voit build-sites, au moins 20 bancs avec backend, banc-c-est-regle sans',
  portee: 'tiroir : porteeDeSession, l\'env d\'abord, la page ensuite, sinon rien',
  douteuse: 'tiroir : une valeur de page hors [a-z0-9-] est ignoree, pas nettoyee',
  tiroir: 'tiroir : le module charge sous de vraies pages, cleDeSession et le client lisent le meme tiroir',
  balise: 'pages : couronne.html porte la balise mnd-auth-scope "couronne"',
  seule: 'pages : aucune autre page d\'entree ne porte la balise',
  memePortee: 'pages : le site couronne publie et la page disent la meme portee',
  nomMort: 'AuthGate : plus d\'etat name mort ni de champ Votre nom, signUpEmail a deux arguments',
  phrase: 'AuthGate : la phrase d\'inscription ne promet plus de fonder la Maison',
  mode: 'AuthGate : le mode \'fondation\' a disparu, \'inscription\' le remplace',
  uneCopie: 'echappement : escHtml, une seule definition dans src/ (shared/echappe-html-pur.ts)',
  cinq: 'echappement : cinq caracteres, l\'apostrophe comprise, une valeur absente donne \'\'',
  importe: 'echappement : QrCodes et la carte de marraine l\'importent, sans copie locale',
  titre: 'echappement : le code de la carte de marraine passe par escHtml dans le titre',
  bloquante: 'BACKEND.md : bloquante par defaut',
  seulMoyen: 'BACKEND.md : VITE_ALLOW_OPEN=true seul moyen d\'ouvrir, les sites publies l\'epinglent a \'false\'',
  migration0213: 'BACKEND.md : provision_first_staff supprimee par la migration 0213 (jamais 0153)',
  avant: 'BACKEND.md : le fondateur cree son compte AVANT l\'insertion',
};

/* ── Les fautes de --prouve ──────────────────────────────────────────────
   { nom, fichier, avant, apres }  : remplace un texte (présent une seule fois) ;
   { nom, fichier, nouveau }       : pose un fichier neuf, retiré ensuite ;
   { nom, fichier, renomme }       : renomme un fichier, puis le lui rend.
   `cle` : l'épreuve qui doit crier. */
const AUTH = 'src/shared/auth.ts';
const SUPA = 'src/shared/supabase.ts';
const GATE = 'src/apps/trone/auth/AuthGate.tsx';
const QR = 'src/apps/trone/routes/clients/QrCodes.tsx';
const CARTE = 'src/apps/trone/routes/clients/CarteDeMarrainePanneau.tsx';
const ECHAPPE = 'src/shared/echappe-html-pur.ts';
const SITES = 'scripts/build-sites.mjs';
const DOC = 'docs/BACKEND.md';
const M0213 = 'supabase/migrations/0213_fermer_provision_first_staff.sql';
const PANNES = [
  { nom: 'la porte revient a VITE_REQUIRE_AUTH', cle: E.porteTexte, fichier: AUTH,
    avant: "export const requireAuth = isRemote && import.meta.env.VITE_ALLOW_OPEN !== 'true';",
    apres: "export const requireAuth = isRemote && import.meta.env.VITE_REQUIRE_AUTH === 'true';" },
  { nom: 'la porte ouverte tant que rien n est dit', cle: E.porteModule, fichier: AUTH,
    avant: "import.meta.env.VITE_ALLOW_OPEN !== 'true';", apres: "import.meta.env.VITE_ALLOW_OPEN === 'false';" },
  { nom: 'VITE_REQUIRE_AUTH revient dans un commentaire de banc', cle: E.requireAuth, fichier: 'scripts/banc-ce-qui-va-partir.mjs',
    avant: 'VITE_ALLOW_OPEN=false VITE_BUILD_ID=banc', apres: 'VITE_REQUIRE_AUTH=true VITE_BUILD_ID=banc' },
  { nom: '.env.example ouvre le Trone', cle: E.envExemple, fichier: '.env.example',
    avant: '# VITE_ALLOW_OPEN=true', apres: 'VITE_ALLOW_OPEN=true' },
  { nom: 'le Trone rappelle provision_first_staff', cle: E.appel, fichier: AUTH,
    avant: "/** Inscription d'un compte personnel.",
    apres: "void supabase?.rpc('provision_first_staff', { display_name: '' });\n/** Inscription d'un compte personnel." },
  { nom: 'apply_auth.sql ne la supprime plus', cle: E.applyAuth, fichier: 'supabase/apply_auth.sql',
    avant: 'drop function if exists public.provision_first_staff(text);', apres: '' },
  { nom: 'apply_auth.sql la recree', cle: E.applyAuth, fichier: 'supabase/apply_auth.sql',
    avant: 'drop function if exists public.provision_first_staff(text);',
    apres: "drop function if exists public.provision_first_staff(text);\ncreate or replace function public.provision_first_staff(display_name text)\nreturns text language sql security definer as $$ select 'exists' $$;" },
  { nom: 'la migration 0213 ne supprime plus rien', cle: E.uneMigration, fichier: M0213,
    avant: 'drop function if exists public.provision_first_staff(text);', apres: 'select 1;' },
  { nom: 'la migration reprend le numero 0153', cle: E.numero, fichier: M0213,
    renomme: 'supabase/migrations/0153_fermer_provision_first_staff.sql' },
  { nom: 'une autre migration prend aussi 0213', cle: E.numero, fichier: 'supabase/migrations/0213_un_autre_chantier_temoin.sql',
    nouveau: '-- un autre chantier sur le meme numero\nselect 1;\n' },
  { nom: 'une copie 0153 reste a cote', cle: E.plusDe0153, fichier: 'supabase/migrations/0153_fermer_provision_first_staff.sql',
    nouveau: '-- copie oubliee\nselect 1;\n' },
  { nom: 'un script de reparation recree la fonction', cle: E.personneNeCree, fichier: 'supabase/repare_le_fondateur_temoin.sql',
    nouveau: "create or replace function public.provision_first_staff(display_name text)\nreturns text language sql security definer as $$ select 'founder' $$;\n" },
  { nom: 'le gabarit inscrit sans compte', cle: E.gabarit, fichier: 'supabase/apply_rls_prod.sql',
    avant: '  if combien = 0 then', apres: '  if combien < 0 then' },
  { nom: 'le verrou de build-sites avant l env du site', cle: E.sitesVerrou, fichier: SITES,
    avant: "...(site.env ?? {}), VITE_ALLOW_OPEN: 'false' }", apres: "VITE_ALLOW_OPEN: 'false', ...(site.env ?? {}) }" },
  { nom: 'build-sites laisse le poste decider', cle: E.sitesEvalue, fichier: SITES,
    avant: "...(site.env ?? {}), VITE_ALLOW_OPEN: 'false' }", apres: "...(site.env ?? {}), VITE_ALLOW_OPEN: process.env.VITE_ALLOW_OPEN ?? 'false' }" },
  { nom: 'le site couronne s ouvre', cle: E.sitesAucun, fichier: SITES,
    avant: "    env: { VITE_AUTH_SCOPE: 'couronne' },", apres: "    env: { VITE_AUTH_SCOPE: 'couronne', VITE_ALLOW_OPEN: 'true' }," },
  { nom: 'un banc oublie le verrou', cle: E.bancs, fichier: 'scripts/banc-trone-hors-ligne.mjs',
    avant: "VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc'", apres: "VITE_SUPABASE_ANON_KEY: 'faux', VITE_BUILD_ID: 'banc'" },
  { nom: 'un banc pose le verrou avant la recopie du poste', cle: E.bancs, fichier: 'scripts/banc-de-gerard.mjs',
    avant: "env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false',",
    apres: "env: { VITE_ALLOW_OPEN: 'false', ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux'," },
  { nom: 'un banc sans backend en herite un', cle: E.bancs, fichier: 'scripts/banc-c-est-regle.mjs',
    avant: "VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: ''", apres: "VITE_SUPABASE_ANON_KEY: ''" },
  { nom: 'un banc neuf, ecrit autrement, oublie le verrou', cle: E.bancs, fichier: 'scripts/banc-temoin-de-l-audit.mjs',
    nouveau: "import { spawnSync } from 'node:child_process';\nspawnSync('npx', ['vite', 'build', '--outDir', 'x'], {\n  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux' },\n});\n" },
  { nom: 'un banc neuf lance Vite par une variable', cle: E.lisible, fichier: 'scripts/banc-temoin-illisible.mjs',
    nouveau: "import { execSync } from 'node:child_process';\nconst commande = 'npx vite build';\nexecSync(commande, { env: { ...process.env, VITE_ALLOW_OPEN: 'false' } });\n" },
  { nom: 'la page passe devant l env', cle: E.portee, fichier: SUPA,
    avant: '  if (deLEnvironnement) return deLEnvironnement;', apres: '  if (deLEnvironnement && !deLaPage) return deLEnvironnement;' },
  { nom: 'une valeur de page douteuse acceptee', cle: E.douteuse, fichier: SUPA,
    avant: '/^[a-z0-9-]+$/.test(deLaPage)', apres: '/\\S/.test(deLaPage)' },
  { nom: 'le module cherche une autre balise', cle: E.tiroir, fichier: SUPA,
    avant: "document.querySelector('meta[name=\"mnd-auth-scope\"]')", apres: "document.querySelector('meta[name=\"mnd-portee\"]')" },
  { nom: 'le client oublie le tiroir de la portee', cle: E.tiroir, fichier: SUPA,
    avant: '          ...(tiroirDeLaPortee ? { storageKey: tiroirDeLaPortee } : {}),\n', apres: '' },
  { nom: 'couronne.html perd sa balise', cle: E.balise, fichier: 'couronne.html',
    avant: '    <meta name="mnd-auth-scope" content="couronne" />\n', apres: '' },
  { nom: 'trone.html prend une balise', cle: E.seule, fichier: 'trone.html',
    avant: '    <meta charset="UTF-8" />', apres: '    <meta charset="UTF-8" />\n    <meta name="mnd-auth-scope" content="trone" />' },
  { nom: 'le site couronne publie une autre portee', cle: E.memePortee, fichier: SITES,
    avant: "    env: { VITE_AUTH_SCOPE: 'couronne' },", apres: "    env: { VITE_AUTH_SCOPE: 'cliente' }," },
  { nom: 'l etat name revient', cle: E.nomMort, fichier: GATE,
    avant: "  const [mode, setMode] = useState<Mode>('connexion');",
    apres: "  const [mode, setMode] = useState<Mode>('connexion');\n  const [name, setName] = useState('');" },
  { nom: 'la phrase promet de nouveau la fondation', cle: E.phrase, fichier: GATE,
    avant: "'Créez votre compte d’équipe : il s’ouvre une fois rattaché à votre fiche par la direction. Vous êtes cliente ? C’est dans Ma Couronne.'",
    apres: "'Créez votre compte d’équipe. Le tout premier fonde la Maison ; les suivants attendent qu’un souverain les autorise. Vous êtes cliente ? C’est dans Ma Couronne.'" },
  { nom: 'le mode fondation revient', cle: E.mode, fichier: GATE,
    avant: "type Mode = 'connexion' | 'inscription' |", apres: "type Mode = 'connexion' | 'fondation' | 'inscription' |" },
  { nom: 'une deuxieme definition d escHtml', cle: E.uneCopie, fichier: 'src/shared/echappe-html-temoin.ts',
    nouveau: "export const escHtml = (s: string): string => s.replace(/</g, '&lt;');\n" },
  { nom: 'l apostrophe ne s echappe plus', cle: E.cinq, fichier: ECHAPPE,
    avant: "String(s ?? '').replace(/[&<>\"']/g", apres: "String(s ?? '').replace(/[&<>\"]/g" },
  { nom: 'QrCodes reprend sa copie', cle: E.importe, fichier: QR,
    avant: "import { escHtml } from '../../../../shared/echappe-html-pur';",
    apres: "const escHtml = (s: string): string =>\n  s.replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c] as string));" },
  { nom: 'le code de marraine nu dans le titre', cle: E.titre, fichier: CARTE,
    avant: '${escHtml(d.code)}', apres: '${d.code}' },
  { nom: 'BACKEND.md redit non bloquante', cle: E.bloquante, fichier: DOC,
    avant: '**Bloquante par défaut**', apres: '**Non bloquante par défaut**' },
  { nom: 'BACKEND.md ne dit plus le seul moyen', cle: E.seulMoyen, fichier: DOC,
    avant: '`VITE_ALLOW_OPEN=true` est le seul moyen', apres: '`VITE_ALLOW_OPEN=true` est un moyen' },
  { nom: 'BACKEND.md redit 0153', cle: E.migration0213, fichier: DOC,
    avant: 'est supprimée par la migration 0213', apres: 'est supprimée par la migration 0153' },
  { nom: 'BACKEND.md ne dit plus avant', cle: E.avant, fichier: DOC,
    avant: '3. **Créer le compte du fondateur, AVANT toute insertion**', apres: '3. **Créer le compte du fondateur**' },
];

const absolu = (f) => path.join(racine, f);
const md5 = (f) => createHash('md5').update(readFileSync(absolu(f))).digest('hex');

if (prouve) {
  const lance = () => spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const propre = lance();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  /* Gardés : les fichiers qu'une faute réécrit ou renomme. Neufs : les
     chemins qu'une faute crée ; un chemin déjà occupé au départ n'est jamais
     ni écrasé ni retiré (sa faute est sautée, et comptée comme ratée). */
  const gardes = new Map([...new Set(PANNES.filter((p) => 'avant' in p || p.renomme).map((p) => p.fichier))]
    .map((f) => [f, readFileSync(absolu(f))]));
  const empreintes = new Map([...gardes.keys()].map((f) => [f, md5(f)]));
  const neufs = [...new Set(PANNES.map((p) => (p.nouveau !== undefined ? p.fichier : p.renomme)).filter(Boolean))];
  const occupes = new Set(neufs.filter((f) => existsSync(absolu(f))));
  let criees = 0;
  try {
    for (const p of PANNES) {
      if (p.nouveau !== undefined || p.renomme) {
        const cible = p.nouveau !== undefined ? p.fichier : p.renomme;
        if (occupes.has(cible)) { console.log(`ABSENTE  ${p.nom} (${cible} existe deja)`); continue; }
      }
      let r;
      if (p.nouveau !== undefined) {
        writeFileSync(absolu(p.fichier), p.nouveau);
        try { r = lance(); } finally { unlinkSync(absolu(p.fichier)); }
      } else if (p.renomme) {
        renameSync(absolu(p.fichier), absolu(p.renomme));
        try { r = lance(); } finally { renameSync(absolu(p.renomme), absolu(p.fichier)); }
      } else {
        const brut = gardes.get(p.fichier).toString('utf8');
        const crlf = brut.includes('\r\n');
        const texte = brut.replace(/\r\n/g, '\n');
        const fois = texte.split(p.avant).length - 1;
        if (fois !== 1) { console.log(`ABSENTE  ${p.nom} (le texte a remplacer est ${fois} fois dans ${p.fichier})`); continue; }
        const neuf = texte.replace(p.avant, () => p.apres);
        writeFileSync(absolu(p.fichier), crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
        try { r = lance(); } finally { writeFileSync(absolu(p.fichier), gardes.get(p.fichier)); }
      }
      const echecs = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('ECHEC'));
      const parSaGarde = echecs.some((l) => l.includes(p.cle));
      if (r.status === 0) console.log(`MUETTE   ${p.nom}`);
      else if (!parSaGarde) console.log(`AILLEURS ${p.nom} (attendue par : ${p.cle})${echecs.length ? '' : `\n         ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join('\n         ')}`}`);
      else { console.log(`CRIEE    ${p.nom}`); criees++; }
    }
  } finally {
    for (const p of PANNES.filter((x) => x.renomme)) {
      if (!existsSync(absolu(p.fichier)) && existsSync(absolu(p.renomme)) && !occupes.has(p.renomme)) renameSync(absolu(p.renomme), absolu(p.fichier));
    }
    for (const [f, b] of gardes) writeFileSync(absolu(f), b);
    for (const f of neufs) if (!occupes.has(f) && existsSync(absolu(f))) unlinkSync(absolu(f));
  }
  const intacts = [...empreintes].every(([f, h]) => existsSync(absolu(f)) && md5(f) === h)
    && neufs.every((f) => occupes.has(f) || !existsSync(absolu(f)));
  console.log(`\n${criees}/${PANNES.length} fautes criees, chacune par son epreuve${intacts ? ', fichiers rendus intacts' : ', FICHIERS ALTERES'}.`);
  process.exit(criees === PANNES.length && intacts ? 0 : 1);
}

/* ── Les outils ───────────────────────────────────────────────────────── */
let ko = 0;
let n = 0;
const ascii = (v) =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, attendu, obtenu) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* Les textes se lisent avec des fins de ligne Unix : l'arbre est en CRLF
   sous Windows (core.autocrlf), en LF ailleurs. Une seule lecture par
   fichier : src/ et scripts/ sont parcourus plusieurs fois, et le disque
   synchronisé (OneDrive) lit lentement. */
const lus = new Map();
const lire = (f) => {
  if (!lus.has(f)) lus.set(f, readFileSync(absolu(f), 'utf8').replace(/\r\n/g, '\n'));
  return lus.get(f);
};
const posix = (p) => p.split(path.sep).join('/');
function tousLesFichiers(dossier, garde = () => true) {
  const out = [];
  const marche = (d) => {
    for (const e of readdirSync(absolu(d), { withFileTypes: true })) {
      const rel = posix(path.join(d, e.name));
      if (e.isDirectory()) { if (garde(rel, true)) marche(rel); } else if (garde(rel, false)) out.push(rel);
    }
  };
  marche(dossier);
  return out.sort();
}
const TEXTE = /\.(?:ts|tsx|js|mjs|cjs|mts|css|html|md|json|txt|svg|sh|py|sql)$/i;

/* LE CODE SANS SES COMMENTAIRES, par esbuild : il lit le TypeScript et le
   JSX comme le fait la construction, rend le code réimprimé (guillemets
   doubles, types effacés, JSX gardé). Les motifs ci-dessous acceptent donc
   les deux guillemets. */
const code = (f, texte = lire(f)) => {
  const loader = f.endsWith('.tsx') ? 'tsx' : /\.(?:ts|mts)$/.test(f) ? 'ts' : 'js';
  return transformSync(texte, { loader, jsx: 'preserve', charset: 'utf8', legalComments: 'none', target: 'esnext' }).code;
};

/* Le SQL sans ses commentaires : `--` jusqu'à la fin de la ligne, `/* … *\/`
   (imbriqués, comme chez Postgres) ; les chaînes '…' restent. */
function sqlSansCommentaires(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') { const j = src.indexOf('\n', i); const f = j < 0 ? src.length : j; out += ' '.repeat(f - i); i = f; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let profondeur = 0;
      let j = i;
      while (j < src.length) {
        if (src[j] === '/' && src[j + 1] === '*') { profondeur++; j += 2; continue; }
        if (src[j] === '*' && src[j + 1] === '/') { profondeur--; j += 2; if (profondeur === 0) break; continue; }
        j++;
      }
      out += src.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < src.length) { if (src[j] === "'" && src[j + 1] === "'") { j += 2; continue; } if (src[j] === "'") break; j++; }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const htmlSansCommentaires = (t) => t.replace(/<!--[\s\S]*?-->/g, '');

/* Apparier une parenthèse, un crochet ou une accolade, en sautant les
   chaînes et les gabarits (le code vient d'esbuild : pas de commentaire). */
function finDeChaine(t, i) { const q = t[i]; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; } return i + 1; }
function finDeGabarit(t, i) {
  i++;
  while (i < t.length) {
    const c = t[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && t[i + 1] === '{') { const f = apparie(t, i + 1); if (f < 0) return t.length; i = f + 1; continue; }
    i++;
  }
  return i;
}
function apparie(t, debut) {
  const FERME = { '(': ')', '[': ']', '{': '}' };
  const pile = [];
  let i = debut;
  while (i < t.length) {
    const c = t[i];
    if (c === '"' || c === "'") { i = finDeChaine(t, i); continue; }
    if (c === '`') { i = finDeGabarit(t, i); continue; }
    if (FERME[c]) pile.push(FERME[c]);
    else if (c === ')' || c === ']' || c === '}') { if (pile.pop() !== c) return -1; if (!pile.length) return i; }
    i++;
  }
  return -1;
}
/* Les entrées d'un objet écrit sur place : `...recopie`, `CLE: valeur`. */
function entreesDe(objet) {
  const dedans = objet.slice(1, -1);
  const morceaux = [];
  let debut = 0;
  let i = 0;
  while (i < dedans.length) {
    const c = dedans[i];
    if (c === '"' || c === "'") { i = finDeChaine(dedans, i); continue; }
    if (c === '`') { i = finDeGabarit(dedans, i); continue; }
    if (c === '(' || c === '[' || c === '{') { const f = apparie(dedans, i); i = f < 0 ? dedans.length : f + 1; continue; }
    if (c === ',') { morceaux.push(dedans.slice(debut, i)); debut = i + 1; }
    i++;
  }
  morceaux.push(dedans.slice(debut));
  return morceaux.map((m) => m.trim()).filter(Boolean).map((t) => {
    if (t.startsWith('...')) return { recopie: true, texte: t };
    const m = /^(?:(["'])([\w$]+)\1|([\w$]+))\s*:\s*([\s\S]+)$/.exec(t);
    if (m) return { cle: m[2] ?? m[3], valeur: m[4].trim() };
    if (/^[\w$]+$/.test(t)) return { cle: t, valeur: t };
    return { recopie: true, texte: t }; // une clé calculée peut tout écraser
  });
}
const litteral = (v) => {
  const m = /^(["'])((?:\\.|(?!\1).)*)\1$/s.exec(v) ?? /^`([^`$\\]*)`$/.exec(v);
  return m ? m[m.length - 1] : null;
};

/* ══ LES LANCEMENTS DE VITE DANS scripts/ ══════════════════════════════
   Un lancement : `vite build` (ou preview, dev, serve) dans une commande,
   ['vite', 'build'] en arguments, le binaire vite/bin/vite.js, Vite importé
   en programme, ou `npm run build` / `npm run dev` (qui lancent Vite avec
   l'environnement du poste). Pour chacun : l'appel qui l'enferme (execSync,
   spawnSync, …), puis l'objet `env` de cet appel.
   Le backend : VITE_SUPABASE_URL écrite vide ('') et rien de recopié
   après elle → aucun ; écrite non vide → oui ; absente, ou recopiable
   après → hérité (de l'environnement du poste ou de .env.local, que Vite
   lit) : c'est un backend aussi. */
const MOTIFS = [
  /\bvite\s+(?:build|preview|dev|serve)\b/g,
  /["'`]vite["'`]\s*,\s*["'`](?:build|preview|dev|serve)["'`]/g,
  /\bvite[\\/]+bin[\\/]+vite\.js\b/g,
  /["'`]bin["'`]\s*,\s*["'`]vite\.js["'`]/g,
  /\bfrom\s*["']vite["']|\b(?:import|require)\s*\(\s*["']vite["']\s*\)/g,
  /\bnpm\s+run\s+(?:build|dev)\b|["'`]run["'`]\s*,\s*["'`](?:build|dev)["'`]/g,
];
const APPELS = /\b(?:execSync|execFileSync|spawnSync|execFile|exec|spawn|fork|execa|execaSync|execaCommand|execaCommandSync)\s*\(/g;
const lancements = [];
const illisibles = [];
{
  const scripts = tousLesFichiers('scripts', (rel, dossier) => dossier || (TEXTE.test(rel) && rel !== MOI));
  for (const f of scripts) {
    const brut = lire(f);
    if (!MOTIFS.some((m) => { m.lastIndex = 0; return m.test(brut); })) continue;
    if (!/\.(?:mjs|cjs|js|ts|mts)$/.test(f)) {
      /* Un script hors de Node (shell, Python) : le banc ne lit pas son env. */
      if (/\bvite\s+(?:build|preview|dev|serve)\b|\bnpm\s+run\s+(?:build|dev)\b/.test(brut)) illisibles.push(`${f} : lancement hors de Node`);
      continue;
    }
    let c;
    try { c = code(f, brut); } catch (e) { illisibles.push(`${f} : esbuild ne le lit pas (${String(e.message).split('\n')[0]})`); continue; }
    const appels = [];
    APPELS.lastIndex = 0;
    for (let m; (m = APPELS.exec(c));) {
      const ouvre = m.index + m[0].length - 1;
      appels.push({ ouvre, ferme: apparie(c, ouvre) });
    }
    const vus = new Set();
    for (const motif of MOTIFS) {
      motif.lastIndex = 0;
      for (let m; (m = motif.exec(c));) {
        const enferme = appels.filter((a) => a.ouvre < m.index && a.ferme > m.index).sort((a, b) => b.ouvre - a.ouvre)[0];
        if (!enferme) { illisibles.push(`${f} : « ${m[0]} » hors d'un appel reconnu`); continue; }
        if (vus.has(enferme.ouvre)) continue;
        vus.add(enferme.ouvre);
        const appel = c.slice(enferme.ouvre, enferme.ferme + 1);
        const extrait = appel.replace(/\s+/g, ' ').slice(0, 70);
        const envs = [...appel.matchAll(/\benv\s*:\s*/g)];
        if (envs.length > 1) { illisibles.push(`${f} : plusieurs env dans ${extrait}`); continue; }
        if (!envs.length) { lancements.push({ fichier: f, extrait, backend: 'herite', verrou: null, env: null }); continue; }
        const debut = envs[0].index + envs[0][0].length;
        if (appel[debut] !== '{') { illisibles.push(`${f} : env qui n'est pas un objet ecrit sur place, dans ${extrait}`); continue; }
        const fin = apparie(appel, debut);
        if (fin < 0) { illisibles.push(`${f} : env mal ferme, dans ${extrait}`); continue; }
        const env = appel.slice(debut, fin + 1);
        const entrees = entreesDe(env);
        const dernierIndex = (cle) => entrees.map((e) => e.cle).lastIndexOf(cle);
        const recopieApres = (k) => entrees.some((e, j) => j > k && e.recopie);
        const iUrl = dernierIndex('VITE_SUPABASE_URL');
        const backend = iUrl < 0 || recopieApres(iUrl) ? 'herite' : (litteral(entrees[iUrl].valeur) === '' ? 'aucun' : 'oui');
        const iOuvert = dernierIndex('VITE_ALLOW_OPEN');
        const verrou = iOuvert < 0 ? null : { valeur: litteral(entrees[iOuvert].valeur), dernier: !recopieApres(iOuvert) };
        lancements.push({ fichier: f, extrait, backend, verrou, env });
      }
    }
  }
}

/* ══ LA PORTE (src/shared/auth.ts) ═════════════════════════════════════ */
dit(E.porteTexte, true,
  /export\s+const\s+requireAuth\s*=\s*isRemote\s*&&\s*import\.meta\.env\.VITE_ALLOW_OPEN\s*!==\s*["']true["']\s*;/.test(code(AUTH)));

const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-audit-du-4-novembre-'));
try {
  /* Les modules sont chargés pour de bon : `import.meta.env` devient un
     objet global, posé avant chaque chargement (une nouvelle évaluation par
     `?scenario=`). La porte tire store.ts, qui lit le localStorage : un
     faux, en mémoire. Le tiroir (supabase.ts) est chargé à part, sans rien
     de faux autour, sauf la page quand le scénario en donne une. */
  const paquet = async (nom, contenu, banniere = '') => {
    const sortie = path.join(dossier, `${nom}.mjs`);
    await build({
      stdin: { contents: contenu, resolveDir: racine, loader: 'ts' },
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': 'globalThis.__ENV_DE_L_AUDIT__' },
      banner: { js: banniere },
    });
    return pathToFileURL(sortie).href;
  };
  const porte = await paquet('porte', "export { requireAuth, authEnabled } from './src/shared/auth.ts';",
    `if (!globalThis.localStorage) { const __m = new Map(); globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k), clear: () => __m.clear(), key: (i) => [...__m.keys()][i] ?? null, get length() { return __m.size; } }; }`);
  const tiroir = await paquet('tiroir', "export { porteeDeSession, cleDeSession, supabase } from './src/shared/supabase.ts'; export { escHtml } from './src/shared/echappe-html-pur.ts';");
  let scenario = 0;
  const charge = async (url, env, page) => {
    globalThis.__ENV_DE_L_AUDIT__ = env;
    if (page === undefined) delete globalThis.document; else globalThis.document = page;
    try { return await import(`${url}?scenario=${++scenario}`); } finally { delete globalThis.document; }
  };

  const BACKEND = { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux' };
  const ENVS = [
    BACKEND,
    { ...BACKEND, VITE_ALLOW_OPEN: 'true' },
    { ...BACKEND, VITE_ALLOW_OPEN: 'false' },
    { ...BACKEND, VITE_ALLOW_OPEN: 'TRUE' },
    { ...BACKEND, VITE_ALLOW_OPEN: '1' },
    { ...BACKEND, VITE_REQUIRE_AUTH: 'false' }, // un .env.local d'avant l'audit
    {},
    { VITE_ALLOW_OPEN: 'false' },
  ];
  const portes = [];
  for (const env of ENVS) { const m = await charge(porte, env); portes.push([m.requireAuth, m.authEnabled]); }
  dit(E.porteModule,
    [[true, true], [false, true], [true, true], [true, true], [true, true], [true, true], [false, false], [false, false]], portes);

  /* ══ LE TIROIR DE SESSION (src/shared/supabase.ts, les pages) ═════════ */
  const pages = tousLesFichiers('.', (rel, estDossier) => !estDossier && /^[^/]+\.html$/.test(rel));
  const htmlDe = (f) => htmlSansCommentaires(lire(f));
  /* Une page de façade lue dans le vrai HTML : querySelector ne sait que
     `meta[name="…"]`, ce que le module demande. */
  const pageDe = (html) => ({
    querySelector(sel) {
      const m = /^meta\[name="([^"]+)"\]$/.exec(sel);
      if (!m) return null;
      for (const balise of html.match(/<meta\b[^>]*>/gi) ?? []) {
        if (/\bname\s*=\s*"([^"]*)"/i.exec(balise)?.[1] !== m[1]) continue;
        const contenu = /\bcontent\s*=\s*"([^"]*)"/i.exec(balise)?.[1] ?? null;
        return { getAttribute: (a) => (a === 'content' ? contenu : null) };
      }
      return null;
    },
  });
  const couronne = htmlDe('couronne.html');
  const t0 = await charge(tiroir, BACKEND);
  const p = t0.porteeDeSession;
  dit(E.portee, ['couronne', 'couronne', 'couronne', null, null, 'couronne', 'Env.Libre', 'mnd-2'],
    [p('couronne', null), p(undefined, 'couronne'), p('couronne', 'autre'), p(undefined, undefined), p(null, null), p('', 'couronne'), p('Env.Libre', null), p(undefined, 'mnd-2')]);
  dit(E.douteuse, [null, null, null, null, null, null, null, null, null],
    ['Couronne', 'a b', 'x.y', '', '../trone', 'couronne"', ' couronne', 'couronne\n', 42].map((v) => p(undefined, v)));

  const DEFAUT = 'sb-127-auth-token';
  const SCENARIOS = [
    ['sans page (Node)', BACKEND, undefined, DEFAUT],
    ['couronne.html', BACKEND, pageDe(couronne), 'sb-mnd-couronne'],
    ['trone.html', BACKEND, pageDe(htmlDe('trone.html')), DEFAUT],
    ['VITE_AUTH_SCOPE=couronne, sans page', { ...BACKEND, VITE_AUTH_SCOPE: 'couronne' }, undefined, 'sb-mnd-couronne'],
    ['VITE_AUTH_SCOPE=couronne, la page dit autre', { ...BACKEND, VITE_AUTH_SCOPE: 'couronne' }, pageDe('<meta name="mnd-auth-scope" content="autre" />'), 'sb-mnd-couronne'],
    ['VITE_AUTH_SCOPE vide, couronne.html', { ...BACKEND, VITE_AUTH_SCOPE: '' }, pageDe(couronne), 'sb-mnd-couronne'],
    ['une page a valeur douteuse', BACKEND, pageDe('<meta name="mnd-auth-scope" content="Couronne" />'), DEFAUT],
    ['une page qui jette', BACKEND, { querySelector() { throw new Error('page cassee'); } }, DEFAUT],
    ['une page sans querySelector', BACKEND, {}, DEFAUT],
  ];
  const vus = [];
  for (const [nom, env, page] of SCENARIOS) {
    const m = await charge(tiroir, env, page);
    vus.push([nom, m.cleDeSession, m.supabase?.auth?.storageKey ?? null]);
  }
  dit(E.tiroir, SCENARIOS.map(([nom, , , cle]) => [nom, cle, cle]), vus);
  const porteeDeLaCouronne = pageDe(couronne).querySelector('meta[name="mnd-auth-scope"]')?.getAttribute('content') ?? null;
  dit(E.balise, 'couronne', porteeDeLaCouronne);
  dit(E.seule, [], pages.filter((f) => f !== 'couronne.html' && /mnd-auth-scope/.test(htmlDe(f))));

  /* ══ L'ÉCHAPPEMENT ════════════════════════════════════════════════════ */
  dit(E.cinq, ['&lt;a title=&#39;x&#39; href=&quot;y&quot;&gt;&amp;&lt;/a&gt;', '', '', 'Maison MND'],
    [t0.escHtml('<a title=\'x\' href="y">&</a>'), t0.escHtml(null), t0.escHtml(undefined), t0.escHtml('Maison MND')]);
} finally {
  rmSync(dossier, { recursive: true, force: true });
  delete globalThis.__ENV_DE_L_AUDIT__;
}

{
  /* VITE_REQUIRE_AUTH : le texte brut, commentaires compris. */
  const OU = [
    ...tousLesFichiers('src', (rel, d) => d || TEXTE.test(rel)),
    ...tousLesFichiers('scripts', (rel, d) => d || (TEXTE.test(rel) && rel !== MOI)),
    DOC, '.env.example',
  ];
  dit(E.requireAuth, [], OU.filter((f) => /VITE_REQUIRE_AUTH/.test(lire(f))));
  const exemple = lire('.env.example');
  dit(E.envExemple, [false, true], [/^[ \t]*VITE_ALLOW_OPEN[ \t]*=/m.test(exemple), /^#[ \t]*VITE_ALLOW_OPEN=true[ \t]*$/m.test(exemple)]);
}

/* ══ LE FONDATEUR ══════════════════════════════════════════════════════ */
{
  const SRC = tousLesFichiers('src', (rel, d) => d || /\.(?:ts|tsx|js|mjs)$/.test(rel));
  dit(E.appel, [], SRC.filter((f) => /provision_first_staff|ensureFounder/.test(lire(f)))
    .filter((f) => /provision_first_staff|ensureFounder/.test(code(f))));

  const SUPPRIME = /drop\s+function\s+if\s+exists\s+(?:public\.)?provision_first_staff\s*\(\s*text\s*\)/i;
  const CREE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?provision_first_staff\b/i;
  const DONNE = /grant\s+execute\s+on\s+function\s+(?:public\.)?provision_first_staff\b/i;
  const auth = sqlSansCommentaires(lire('supabase/apply_auth.sql'));
  dit(E.applyAuth, [true, false, false], [SUPPRIME.test(auth), CREE.test(auth), DONNE.test(auth)]);

  /* Tout le SQL de supabase/, sauf supabase/functions/ (pas de ce banc). */
  const SQL = tousLesFichiers('supabase', (rel, d) => (d ? rel !== 'supabase/functions' : /\.sql$/i.test(rel)));
  const MIGRATIONS = SQL.filter((f) => /^supabase\/migrations\/[^/]+$/.test(f));
  const numero = (f) => Number(/^(\d{4})/.exec(path.basename(f))?.[1] ?? NaN);
  const sql = new Map(SQL.map((f) => [f, sqlSansCommentaires(lire(f))]));
  dit(E.uneMigration, [M0213], MIGRATIONS.filter((f) => SUPPRIME.test(sql.get(f))));
  const autres = MIGRATIONS.filter((f) => f !== M0213).map(numero).filter((x) => !Number.isNaN(x));
  /* Le numéro : 0213 réservé pour elle le 17 novembre 2026, au-dessus de
     0212, la dernière migration de main ce jour-là. Ce qui doit tenir pour
     toujours : elle existe sous ce nom, et elle est SEULE à porter 0213
     (deux branches avaient chacune leur 0153). Les suivantes (0214, 0228…,
     déjà promises à d'autres chantiers) ne la font pas crier. */
  dit(E.numero, { existe: true, seuleA0213: true },
    { existe: existsSync(absolu(M0213)), seuleA0213: MIGRATIONS.filter((f) => numero(f) === 213).length === 1 });
  dit(E.plusDe0153, [], SQL.filter((f) => /fermer_provision_first_staff/.test(f) && f !== M0213));
  const passee = (f) => MIGRATIONS.includes(f) && numero(f) >= 1 && numero(f) <= 212;
  dit(E.personneNeCree, [], SQL.filter((f) => !passee(f) && (CREE.test(sql.get(f)) || DONNE.test(sql.get(f)))));

  /* Le gabarit du fondateur : un bloc /* … *\/ en tête du fichier, qu'on
     colle à la main. Il doit rester un commentaire (un Run du fichier entier
     ne l'exécute pas) et s'arrêter avant toute insertion quand l'adresse n'a
     pas de compte. */
  const rls = lire('supabase/apply_rls_prod.sql');
  const bloc = /^\/\*[ \t]*\n([\s\S]*?)^\*\/[ \t]*$/m.exec(rls)?.[1] ?? '';
  const g = sqlSansCommentaires(bloc);
  const insere = g.search(/insert\s+into\s+public\.staff\s*\(/i);
  const avantInsertion = (re) => { const i = g.search(re); return i >= 0 && insere >= 0 && i < insere; };
  dit(E.gabarit, { bloc: true, horsDuRun: true, compte: true, aucun: true, plusieurs: true, pasVide: true, garde: true }, {
    bloc: /\bdo\s+\$\$/.test(g),
    horsDuRun: !/courriel/.test(sqlSansCommentaires(rls)),
    compte: /select\s+count\(\*\)\s+into\s+combien\s+from\s+auth\.users\s+where\s+lower\(\s*email\s*\)\s*=\s*lower\(\s*trim\(\s*courriel\s*\)\s*\)/i.test(g),
    aucun: avantInsertion(/if\s+combien\s*=\s*0\s+then\s+raise\s+exception/i),
    plusieurs: avantInsertion(/elsif\s+combien\s*>\s*1\s+then\s+raise\s+exception/i),
    pasVide: avantInsertion(/if\s+exists\s*\(\s*select\s+1\s+from\s+public\.staff\s*\)\s+then\s+raise\s+exception/i),
    garde: /if\s*\(\s*select\s+count\(\*\)\s+from\s+public\.staff\s*\)\s*=\s*0\s+then\s+raise\s+exception/i.test(sqlSansCommentaires(rls)),
  });
}

/* ══ LA CONSTRUCTION (build-sites.mjs, les bancs) ══════════════════════ */
{
  const sites = lancements.filter((l) => l.fichier === SITES);
  const s = sites[0];
  dit(E.sitesVerrou, [1, 'false', true], [sites.length, s?.verrou?.valeur ?? null, s?.verrou?.dernier ?? null]);
  /* L'env de build-sites évalué tel qu'il est écrit, contre un poste et un
     site qui demandent tous deux l'ouverture. */
  let evalue;
  try {
    const fabrique = new Function('process', 'site', 'BUILD_ID', `return (${s?.env ?? 'null'});`);
    const poste = { env: { VITE_ALLOW_OPEN: 'true', VITE_SUPABASE_URL: 'https://exemple.test', VITE_SUPABASE_ANON_KEY: 'x' } };
    evalue = [
      fabrique(poste, { base: '/trone/', apps: 'trone' }, 'b')?.VITE_ALLOW_OPEN,
      fabrique(poste, { base: '/couronne/', apps: 'couronne', env: { VITE_AUTH_SCOPE: 'couronne', VITE_ALLOW_OPEN: 'true' } }, 'b')?.VITE_ALLOW_OPEN,
      fabrique(poste, { base: '/couronne/', apps: 'couronne', env: { VITE_AUTH_SCOPE: 'couronne', VITE_ALLOW_OPEN: 'true' } }, 'b')?.VITE_AUTH_SCOPE,
    ];
  } catch (e) { evalue = `l'env ne s'evalue pas : ${e.message}`; }
  dit(E.sitesEvalue, ['false', 'false', 'couronne'], evalue);
  const cs = code(SITES);
  dit(E.sitesAucun, [1, false], [(cs.match(/\bVITE_ALLOW_OPEN\b/g) ?? []).length, /VITE_ALLOW_OPEN["']?\s*:\s*["'`]true/.test(cs)]);
  dit(E.memePortee, 'couronne', /name:\s*["']couronne["'][\s\S]*?env:\s*\{\s*VITE_AUTH_SCOPE:\s*["']([^"']+)["']/.exec(cs)?.[1] ?? null);

  const fautifs = lancements
    .filter((l) => l.backend !== 'aucun' && !(l.verrou && l.verrou.dernier && ['true', 'false'].includes(l.verrou.valeur)))
    .map((l) => `${l.fichier} (backend ${l.backend}) : ${!l.verrou ? 'pas de VITE_ALLOW_OPEN' : !l.verrou.dernier ? 'VITE_ALLOW_OPEN pose avant une recopie' : 'VITE_ALLOW_OPEN non litteral'} -- ${l.extrait}`);
  dit(E.bancs, [], fautifs);
  dit(E.lisible, [], illisibles);
  const avecBackend = lancements.filter((l) => l.backend !== 'aucun');
  dit(E.detecteur, [true, true, 'aucun'], [
    avecBackend.some((l) => l.fichier === SITES),
    new Set(avecBackend.filter((l) => /^scripts\/banc-/.test(l.fichier)).map((l) => l.fichier)).size >= 20,
    lancements.find((l) => l.fichier === 'scripts/banc-c-est-regle.mjs')?.backend ?? null,
  ]);
  console.log(`       (${lancements.length} lancements de Vite lus, dont ${avecBackend.length} avec un backend ; --detail les liste)`);
  if (process.argv.includes('--detail')) {
    for (const l of lancements) console.log(`       ${l.fichier} : backend ${l.backend}, VITE_ALLOW_OPEN ${l.verrou ? `'${l.verrou.valeur}'${l.verrou.dernier ? '' : ' (avant une recopie)'}` : 'absent'}`);
  }
}

/* ══ LA PORTE DU TRÔNE (AuthGate.tsx) ══════════════════════════════════ */
{
  const brut = lire(GATE);
  const c = code(GATE);
  dit(E.nomMort, [false, false, false, true], [
    /\bsetName\b/.test(c), /\[\s*name\s*,/.test(c), /Votre nom/.test(c), /\bsignUpEmail\(\s*email\s*,\s*password\s*\)/.test(c),
  ]);
  /* Le chapeau de la porte de connexion : le seul `tra-lede` qui suit le mode. */
  const lede = [...c.matchAll(/tra-lede[\s\S]*?<\/p>/g)].map((m) => m[0]).find((l) => /mode\s*===\s*["']inscription["']/.test(l)) ?? '';
  const phrase = /mode\s*===\s*["']inscription["']\s*\?\s*(["'])((?:(?!\1).)*)\1/.exec(lede)?.[2] ?? null;
  dit(E.phrase, { trouvee: true, fonde: false, premier: false, rattache: true },
    { trouvee: phrase !== null, fonde: /fond/i.test(phrase ?? ''), premier: /premier/i.test(phrase ?? ''), rattache: /rattach/i.test(phrase ?? '') });
  const type = /\btype\s+Mode\s*=\s*([^;]+);/.exec(brut)?.[1] ?? '';
  dit(E.mode, [false, true, false, true], [
    /['"]fondation['"]/.test(type), /['"]inscription['"]/.test(type), /["']fondation["']/.test(c), /setMode\(\(m\)\s*=>\s*m\s*===\s*["']connexion["']\s*\?\s*["']inscription["']/.test(c),
  ]);
}

/* ══ L'ÉCHAPPEMENT (une seule copie) ═══════════════════════════════════ */
{
  const DEFINIT = /\b(?:const|let|var|function)\s+escHtml\b/;
  const SRC = tousLesFichiers('src', (rel, d) => d || /\.(?:ts|tsx)$/.test(rel));
  dit(E.uneCopie, [ECHAPPE], SRC.filter((f) => /escHtml/.test(lire(f)) && DEFINIT.test(code(f))));
  const importe = (f) => {
    const c = code(f);
    return [/import\s*\{\s*escHtml\s*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/\.\.\/shared\/echappe-html-pur["']/.test(c), DEFINIT.test(c)];
  };
  dit(E.importe, [[true, false], [true, false]], [importe(QR), importe(CARTE)]);
  dit(E.titre, true, /<title>Carte de marraine \$\{escHtml\(d\.code\)\}<\/title>/.test(code(CARTE)));
}

/* ══ docs/BACKEND.md ═══════════════════════════════════════════════════ */
{
  const doc = lire(DOC);
  dit(E.bloquante, [true, false], [doc.includes('**Bloquante par défaut**'), /non bloquante/i.test(doc)]);
  dit(E.seulMoyen, [true, true], [
    doc.includes('`VITE_ALLOW_OPEN=true` est le seul moyen'),
    /Les sites publiés l'épinglent à `'false'`\s*\(`scripts\/build-sites\.mjs`, pour tous les sites\)/.test(doc),
  ]);
  dit(E.migration0213, [true, false], [/`provision_first_staff`[^.]*est supprimée par la migration 0213/.test(doc), /\b0153\b/.test(doc)]);
  const compte = doc.indexOf('Créer le compte du fondateur, AVANT toute insertion');
  const inscrire = doc.indexOf('L\'inscrire souverain');
  dit(E.avant, [true, true, true], [compte >= 0, inscrire > compte, /crée son compte, puis s'inscrit souverain/.test(doc)]);
}

console.log(ko ? `\n${ko} ECHEC(S) sur ${n} epreuves.` : `\nTout tient : ${n} epreuves.`);
process.exit(process.exitCode ?? 0);
