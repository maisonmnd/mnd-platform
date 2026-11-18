import { build, transformSync } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* L'AUDIT DU 4 NOVEMBRE, TENU ENSEMBLE — `node scripts/verifie-l-audit-du-4-novembre.mjs`
   (17 novembre 2026, revue de l'audit ; renforcé le 18 novembre 2026 après
   trois relectures sceptiques).

   L'audit a retourné la porte et fermé l'amorçage du fondateur. Ce banc lit
   les vrais fichiers et tient ensemble ce qui en est sorti :
     · LA PORTE. Avec un backend, la connexion est exigée par défaut
       (`requireAuth`, shared/auth.ts) ; VITE_ALLOW_OPEN=true seul l'efface,
       VITE_REQUIRE_AUTH ne s'écrit plus nulle part, .env.example ne l'écrit
       qu'en commentaire (ni `export`, ni `CLE: valeur`). Le module est chargé
       pour de bon, sous plusieurs environnements.
     · LA CONSTRUCTION. build-sites.mjs construit tous les sites par UN seul
       lancement, écrit `npx vite build`, qui épingle en dernier
       VITE_ALLOW_OPEN à 'false' et VITE_AUTH_SCOPE (« couronne » pour Ma
       Couronne, vide pour tout autre site) ; vite.config ne les redéfinit
       pas. Et CHAQUE lancement de Vite d'un script de scripts/ qui a un
       backend nomme VITE_ALLOW_OPEN dans son env, après toute recopie.
       Le détecteur reconnaît Vite en programme sous toutes les tournures
       décrites plus bas (« LES LANCEMENTS DE VITE »), pas seulement
       `vite build` : le serveur nu (`npx vite --port …`), le binaire de
       node_modules, un script de package.json lancé par npm, yarn, pnpm ou
       bun. Ce qu'il ne sait pas lire CRIE au lieu de passer (épreuve
       `lisible`) : commande dans une variable, Vite appelé en programme,
       env qui n'est pas un objet écrit sur place ou qu'une recopie suit,
       variable VITE_ posée dans la commande, commande composée avant le
       programme, script hors de Node. Sa limite, dite : il lit les scripts
       de scripts/, pas ce qu'un humain tape (`npm run dev`, qui lit
       .env.local, est fait pour ça), et il prend pour ce qu'elle dit une
       expression placée APRÈS le programme dans une commande (un dossier
       de sortie).
     · LE FONDATEUR. Plus rien n'appelle ni ne crée `provision_first_staff` ;
       apply_auth.sql la supprime, et se refuse d'abord sur un projet qui a
       passé 0109 ; une seule migration la supprime, 0213, dont l'en-tête dit
       que la clé de service ne passe pas `staff_guard`. Le gabarit
       d'apply_rls_prod.sql la supprime aussi, s'arrête quand l'adresse n'a
       pas de compte, et n'inscrit qu'UNE ligne : un souverain, toutes les
       rubriques que lui donnait l'ancienne fonction (0003), toutes les
       branches ; l'en-tête fait passer 0213 avant le premier compte sur un
       projet rejoué. La porte du Trône (AuthGate) ne promet plus de fonder
       la Maison.
     · LE TIROIR DE SESSION. Ma Couronne a le sien partout : la portée vient
       de VITE_AUTH_SCOPE, sinon de la balise de couronne.html (et d'aucune
       autre page) ; une portée vide compte pour absente. La fonction pure
       est éprouvée, puis le module chargé sous de vraies pages (le texte de
       couronne.html et de trone.html).
     · L'ÉCHAPPEMENT. Une seule copie de `escHtml`, shared/echappe-html-pur,
       et aucun autre échappement HTML dans src/ que les deux laissés chez
       eux à dessein.
     · docs/BACKEND.md dit ce qui est vrai (le code à 6 chiffres, le cas
       d'une table sans souverain).

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
  envExemple: 'porte : .env.example n\'ouvre jamais (VITE_ALLOW_OPEN=true en commentaire seulement, ni export ni deux-points)',
  appel: 'fondateur : rien dans src/ n\'appelle provision_first_staff (ni ensureFounder)',
  applyAuth: 'fondateur : apply_auth.sql supprime provision_first_staff et ne la cree jamais',
  refus: 'fondateur : apply_auth.sql se refuse d\'abord, sur un projet qui a passe 0109',
  uneMigration: 'fondateur : une seule migration la supprime, 0213_fermer_provision_first_staff.sql',
  numero: 'fondateur : 0213 existe et est seule a son numero',
  plusDe0153: 'fondateur : plus de fichier 0153_fermer_provision_first_staff.sql',
  personneNeCree: 'fondateur : hors des migrations passees (0001 a 0212), aucun .sql de supabase/ ne la cree',
  cleDeService: 'fondateur : l\'en-tete de 0213 dit que la cle de service ne passe pas staff_guard',
  gabarit: 'fondateur : le gabarit supprime la fonction, s\'arrete sans compte, n\'inscrit qu\'un souverain (rubriques de 0003, toutes branches)',
  ordre: 'fondateur : sur un projet rejoue, l\'en-tete d\'apply_rls_prod.sql fait passer 0213 avant le premier compte',
  sitesVerrou: 'build-sites : un seul lancement, npx vite build, VITE_ALLOW_OPEN \'false\' pose en dernier, rien d\'illisible',
  sitesEvalue: 'build-sites : ni l\'environnement du poste ni l\'env d\'un site ne le levent (env evalue)',
  sitesAucun: 'build-sites : aucun site ne nomme VITE_ALLOW_OPEN dans son env',
  sitesPortee: 'build-sites : VITE_AUTH_SCOPE epingle en dernier, couronne garde la sienne, tout autre site \'\' (tiroir par defaut)',
  config: 'vite.config : ne nomme ni VITE_ALLOW_OPEN, ni VITE_AUTH_SCOPE, ni import.meta.env, ni envPrefix, ni envDir',
  bancs: 'bancs : chaque construction Vite avec un backend nomme VITE_ALLOW_OPEN, apres toute recopie',
  lisible: 'bancs : chaque lancement de Vite se lit (appel reconnu, env ecrit sur place et rien apres, commande nue)',
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
  uneCopie: 'echappement : escHtml, une seule definition dans src/, et aucun autre echappement que les deux laisses chez eux',
  cinq: 'echappement : cinq caracteres, l\'apostrophe comprise, une valeur absente donne \'\'',
  importe: 'echappement : QrCodes et la carte de marraine l\'importent, sans copie locale',
  titre: 'echappement : le code de la carte de marraine passe par escHtml dans le titre',
  bloquante: 'BACKEND.md : bloquante par defaut',
  seulMoyen: 'BACKEND.md : VITE_ALLOW_OPEN=true seul moyen d\'ouvrir, les sites publies l\'epinglent a \'false\'',
  migration0213: 'BACKEND.md : provision_first_staff supprimee par la migration 0213 (jamais 0153)',
  avant: 'BACKEND.md : le fondateur cree son compte AVANT l\'insertion',
  code6: 'BACKEND.md : avec Confirm email, le fondateur saisit le code a 6 chiffres (pas un lien)',
  sansSouverain: 'BACKEND.md : le cas staff non vide sans souverain est dit (un SQL unique, ecrit par la session)',
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
const RLS = 'supabase/apply_rls_prod.sql';
/* Un env de banc AVEC backend et SANS verrou, pour les bancs témoins. */
const ENV_OUVERT = "{ ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux' }";
const ENV_FERME = "{ ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false' }";
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
  { nom: '.env.example ouvre le Trone par export', cle: E.envExemple, fichier: '.env.example',
    avant: '# VITE_ALLOW_OPEN=true', apres: '# VITE_ALLOW_OPEN=true\nexport VITE_ALLOW_OPEN=true' },
  { nom: '.env.example ouvre le Trone par deux-points', cle: E.envExemple, fichier: '.env.example',
    avant: '# VITE_ALLOW_OPEN=true', apres: '# VITE_ALLOW_OPEN=true\nVITE_ALLOW_OPEN: true' },
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
  { nom: 'apply_auth.sql ne se refuse plus', cle: E.refus, fichier: 'supabase/apply_auth.sql',
    avant: "    raise exception 'apply_auth.sql refusé", apres: "    raise notice 'apply_auth.sql refusé" },
  { nom: 'apply_auth.sql cree avant de se refuser', cle: E.refus, fichier: 'supabase/apply_auth.sql',
    avant: "-- ---------- Le refus d'un projet qui a passé 0109 (18 novembre 2026) ----------",
    apres: "create table if not exists public.staff_temoin (id int);\n-- ---------- Le refus d'un projet qui a passé 0109 (18 novembre 2026) ----------" },
  { nom: '0213 redit que la cle de service ecrit tout', cle: E.cleDeService, fichier: M0213,
    avant: 'la clé de service contourne la RLS, mais PAS `staff_guard`', apres: 'la clé de service, qui contourne la RLS, peut tout écrire de toute façon' },
  { nom: 'le gabarit inscrit sans compte', cle: E.gabarit, fichier: RLS,
    avant: '  if combien = 0 then', apres: '  if combien < 0 then' },
  { nom: 'le gabarit inscrit un gerant', cle: E.gabarit, fichier: RLS,
    avant: "values (fondateur, nom, 'souverain',", apres: "values (fondateur, nom, 'gerant'," },
  { nom: 'le gabarit oublie les branches', cle: E.gabarit, fichier: RLS,
    avant: '  insert into public.staff_branches(user_id, branch_id)\n  select fondateur, b.id from public.branches b\n  on conflict do nothing;\n', apres: '' },
  { nom: 'le gabarit ne donne qu une branche', cle: E.gabarit, fichier: RLS,
    avant: '  select fondateur, b.id from public.branches b\n', apres: "  select fondateur, b.id from public.branches b where b.id = 'cotonou'\n" },
  { nom: 'le gabarit oublie une rubrique', cle: E.gabarit, fichier: RLS,
    avant: "'equipe','academie','systeme']", apres: "'equipe','systeme']" },
  { nom: 'le gabarit insere en silence (zero ligne possible)', cle: E.gabarit, fichier: RLS,
    avant: "  select id into fondateur from auth.users where lower(email) = lower(trim(courriel));\n  insert into public.staff(user_id, name, role, rubrics)\n  values (fondateur, nom, 'souverain',\n          array['pilotage','clients','vente','finances','equipe','academie','systeme']);",
    apres: "  insert into public.staff(user_id, name, role, rubrics)\n  select id, nom, 'souverain', array['pilotage','clients','vente','finances','equipe','academie','systeme'] from auth.users where email = courriel;\n  select id into fondateur from auth.users where lower(email) = lower(trim(courriel));" },
  { nom: 'le gabarit ne supprime plus la fonction', cle: E.gabarit, fichier: RLS,
    avant: 'drop function if exists public.provision_first_staff(text);\n\ndo $$', apres: 'do $$' },
  { nom: 'l en-tete ne fait plus passer 0213 d abord', cle: E.ordre, fichier: RLS,
    avant: 'Passez donc 0213 à part, AVANT de créer le moindre compte', apres: 'Passez 0213 quand vous le pourrez' },
  { nom: 'le verrou de build-sites avant l env du site', cle: E.sitesVerrou, fichier: SITES,
    avant: "...(site.env ?? {}), VITE_ALLOW_OPEN: 'false', VITE_AUTH_SCOPE:", apres: "VITE_ALLOW_OPEN: 'false', ...(site.env ?? {}), VITE_AUTH_SCOPE:" },
  { nom: 'build-sites laisse le poste decider', cle: E.sitesEvalue, fichier: SITES,
    avant: "...(site.env ?? {}), VITE_ALLOW_OPEN: 'false', VITE_AUTH_SCOPE:", apres: "...(site.env ?? {}), VITE_ALLOW_OPEN: process.env.VITE_ALLOW_OPEN ?? 'false', VITE_AUTH_SCOPE:" },
  { nom: 'build-sites construit un second site, sans verrou', cle: E.sitesVerrou, fichier: SITES,
    avant: "const out = path.join(root, 'dist-sites');",
    apres: "const out = path.join(root, 'dist-sites');\nexecSync('npx vite --mode production build --outDir dist-sites/couronne-bis', { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_APPS: 'couronne', VITE_BASE: '/couronne-bis/' } });" },
  { nom: 'build-sites compose sa commande devant Vite', cle: E.sitesVerrou, fichier: SITES,
    avant: "  execSync('npx vite build', {", apres: "  execSync(`${site.prefixe ?? ''}npx vite build`, {" },
  { nom: 'build-sites recopie des options apres env', cle: E.sitesVerrou, fichier: SITES,
    avant: "?? '' },\n  });", apres: "?? '' },\n    ...(site.options ?? {}),\n  });" },
  { nom: 'build-sites ne pose plus la portee', cle: E.sitesPortee, fichier: SITES,
    avant: ", VITE_AUTH_SCOPE: site.env?.VITE_AUTH_SCOPE ?? '' }", apres: ' }' },
  { nom: 'build-sites laisse le poste choisir la portee', cle: E.sitesPortee, fichier: SITES,
    avant: "VITE_AUTH_SCOPE: site.env?.VITE_AUTH_SCOPE ?? ''", apres: "VITE_AUTH_SCOPE: process.env.VITE_AUTH_SCOPE ?? site.env?.VITE_AUTH_SCOPE ?? ''" },
  { nom: 'vite.config definit VITE_ALLOW_OPEN', cle: E.config, fichier: 'vite.config.ts',
    avant: '  base,\n  plugins: [react()],', apres: "  base,\n  define: { 'import.meta.env.VITE_ALLOW_OPEN': JSON.stringify('true') },\n  plugins: [react()]," },
  { nom: 'vite.config lit ses .env ailleurs', cle: E.config, fichier: 'vite.config.ts',
    avant: '  base,\n  plugins: [react()],', apres: "  base,\n  envDir: 'reglages',\n  plugins: [react()]," },
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
  /* Les tournures que le détecteur du 17 novembre ne voyait pas (relecture
     du 18 novembre) : chacune, avec un backend et sans verrou, doit crier. */
  { nom: 'un banc neuf lance le serveur de Vite nu', cle: E.bancs, fichier: 'scripts/banc-temoin-serveur.mjs',
    nouveau: `import { spawn } from 'node:child_process';\nspawn('npx', ['vite', '--port', '5199'], { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf lance Vite avec --mode avant build', cle: E.bancs, fichier: 'scripts/banc-temoin-mode.mjs',
    nouveau: `import { spawnSync } from 'node:child_process';\nspawnSync('npx', ['vite', '--mode', 'banc', 'build'], { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf lance le binaire de node_modules', cle: E.bancs, fichier: 'scripts/banc-temoin-binaire.mjs',
    nouveau: `import { spawnSync } from 'node:child_process';\nimport path from 'node:path';\nspawnSync(path.join('node_modules', '.bin', 'vite'), ['build'], { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf lance npx vite --port en commande', cle: E.bancs, fichier: 'scripts/banc-temoin-port.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nexecSync('npx vite --port 5199 --strictPort', { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf lance npm run-script build', cle: E.bancs, fichier: 'scripts/banc-temoin-npm.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nexecSync('npm run-script build', { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf lance yarn build en arguments', cle: E.bancs, fichier: 'scripts/banc-temoin-yarn.mjs',
    nouveau: `import { spawnSync } from 'node:child_process';\nspawnSync('yarn', ['build'], { env: ${ENV_OUVERT} });\n` },
  { nom: 'un banc neuf ouvre par la commande', cle: E.lisible, fichier: 'scripts/banc-temoin-prefixe.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nexecSync('VITE_ALLOW_OPEN=true npx vite build', { shell: 'bash', env: ${ENV_FERME} });\n` },
  { nom: 'un banc neuf pose son backend dans la commande', cle: E.lisible, fichier: 'scripts/banc-temoin-backend.mjs',
    nouveau: "import { execSync } from 'node:child_process';\nexecSync('VITE_SUPABASE_URL=http://127.0.0.1:9 npx vite build', { shell: 'bash', env: { ...process.env, VITE_SUPABASE_URL: '' } });\n" },
  { nom: 'un banc neuf recopie des options apres env', cle: E.lisible, fichier: 'scripts/banc-temoin-recopie.mjs',
    nouveau: "import { execSync } from 'node:child_process';\nconst autre = {};\nexecSync('npx vite build', { env: { ...process.env, VITE_SUPABASE_URL: '' }, ...autre });\n" },
  { nom: 'un banc neuf compose sa commande devant Vite', cle: E.lisible, fichier: 'scripts/banc-temoin-compose.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nconst prefixe = '';\nexecSync(\`\${prefixe}npx vite build\`, { env: ${ENV_FERME} });\n` },
  { nom: 'un banc neuf concatene sa commande devant Vite', cle: E.lisible, fichier: 'scripts/banc-temoin-concatene.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nconst prefixe = '';\nexecSync(prefixe + 'npx vite build', { env: ${ENV_FERME} });\n` },
  { nom: 'un banc neuf passe env en raccourci', cle: E.lisible, fichier: 'scripts/banc-temoin-raccourci.mjs',
    nouveau: `import { execSync } from 'node:child_process';\nconst env = ${ENV_FERME};\nexecSync('npx vite build', { env });\n` },
  { nom: 'un banc neuf appelle Vite en programme', cle: E.lisible, fichier: 'scripts/banc-temoin-programme.mjs',
    nouveau: "import { build } from 'vite';\nawait build({ mode: 'production' });\n" },
  { nom: 'un script shell lance Vite', cle: E.lisible, fichier: 'scripts/banc-temoin.sh',
    nouveau: '#!/bin/sh\nnpx vite --port 5199\n' },
  { nom: 'banc-c-est-regle prend un backend', cle: E.detecteur, fichier: 'scripts/banc-c-est-regle.mjs',
    avant: "VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: ''", apres: "VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: ''" },
  { nom: 'la page passe devant l env', cle: E.portee, fichier: SUPA,
    avant: '  if (deLEnvironnement) return deLEnvironnement;', apres: '  if (deLEnvironnement && !deLaPage) return deLEnvironnement;' },
  { nom: 'une portee vide compte pour une portee', cle: E.portee, fichier: SUPA,
    avant: '  if (deLEnvironnement) return deLEnvironnement;', apres: "  if (typeof deLEnvironnement === 'string') return deLEnvironnement;" },
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
  { nom: 'une copie d escHtml exportee sous son nom par un renommage', cle: E.uneCopie, fichier: 'src/shared/echappe-html-renomme.ts',
    nouveau: "const e = (s: string): string => s.replace(/</g, '&lt;');\nexport { e as escHtml };\n" },
  { nom: 'un echappement sous un autre nom', cle: E.uneCopie, fichier: 'src/shared/echappe-html-autre.ts',
    nouveau: "export function escHTML(s: string): string { return s.replace(/</g, '&lt;'); }\n" },
  { nom: 'QrCodes garde un echappement local a cote de l import', cle: E.uneCopie, fichier: QR,
    avant: "import { escHtml } from '../../../../shared/echappe-html-pur';",
    apres: "import { escHtml } from '../../../../shared/echappe-html-pur';\nexport const echappeLocal = (s: string): string => s.replace(/</g, '&lt;');" },
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
  { nom: 'BACKEND.md redit le lien de confirmation', cle: E.code6, fichier: DOC,
    avant: 'saisit le code à 6 chiffres reçu par e-mail', apres: 'doit cliquer le lien de confirmation' },
  { nom: 'BACKEND.md ne dit plus le cas sans souverain', cle: E.sansSouverain, fichier: DOC,
    avant: "Si `staff` n'est pas vide mais ne compte plus aucun souverain", apres: "Si `staff` n'est pas vide" },
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
/* Les morceaux d'un texte délimité — `(…)`, `[…]`, `{…}` — coupés aux
   virgules du premier niveau, chacun avec sa position dans ce texte. */
function morceauxDe(enferme) {
  const dedans = enferme.slice(1, -1);
  const coupes = [];
  let debut = 0;
  let i = 0;
  while (i < dedans.length) {
    const c = dedans[i];
    if (c === '"' || c === "'") { i = finDeChaine(dedans, i); continue; }
    if (c === '`') { i = finDeGabarit(dedans, i); continue; }
    if (c === '(' || c === '[' || c === '{') { const f = apparie(dedans, i); i = f < 0 ? dedans.length : f + 1; continue; }
    if (c === ',') { coupes.push([debut, i]); debut = i + 1; }
    i++;
  }
  coupes.push([debut, dedans.length]);
  return coupes.map(([a, b]) => {
    const brut = dedans.slice(a, b);
    return { texte: brut.trim(), debut: 1 + a + (brut.length - brut.trimStart().length) };
  }).filter((m) => m.texte);
}
/* Les entrées d'un objet écrit sur place : `...recopie`, `CLE: valeur`.
   `valeurDebut` : où commence la valeur, dans le texte de l'objet. */
function entreesDe(objet) {
  return morceauxDe(objet).map(({ texte: t, debut }) => {
    if (t.startsWith('...')) return { recopie: true, texte: t, debut };
    const m = /^(?:(["'])([\w$]+)\1|([\w$]+))\s*:\s*([\s\S]+)$/.exec(t);
    if (m) return { cle: m[2] ?? m[3], valeur: m[4].trim(), debut, valeurDebut: debut + t.length - m[4].length };
    if (/^[\w$]+$/.test(t)) return { cle: t, valeur: t, debut, valeurDebut: debut };
    return { recopie: true, texte: t, debut }; // une clé calculée peut tout écraser
  });
}
/* Les chaînes et les gabarits d'un code, avec leur place (un gabarit va de
   son accent grave ouvrant au fermant, ses `${…}` compris). */
function litterauxDe(t) {
  const out = [];
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '"' || c === "'") { const f = finDeChaine(t, i); out.push({ debut: i, fin: f, gabarit: false }); i = f; continue; }
    if (c === '`') { const f = finDeGabarit(t, i); out.push({ debut: i, fin: f, gabarit: true }); i = f; continue; }
    i++;
  }
  return out;
}
const litteral = (v) => {
  const m = /^(["'])((?:\\.|(?!\1).)*)\1$/s.exec(v) ?? /^`([^`$\\]*)`$/.exec(v);
  return m ? m[m.length - 1] : null;
};
const objetEcrit = (v) => v.startsWith('{') && apparie(v, 0) === v.length - 1;

/* ══ LES LANCEMENTS DE VITE DANS scripts/ ══════════════════════════════
   (relu le 18 novembre 2026 : le détecteur du 17 ne connaissait que
   `vite build|preview|dev|serve` écrit d'un bloc, ['vite', 'build'] côte à
   côte, vite/bin/vite.js et `npm run build|dev`. `npx vite --port 5199`,
   ['vite', '--mode', 'banc', 'build'], node_modules/.bin/vite ou
   `npm run-script build` passaient sans être vus.)

   CE QUI EST UN LANCEMENT, dans le code sans ses commentaires :
     · « vite » EN PROGRAMME : une chaîne qui vaut 'vite' (ou 'vite.js',
       '.cmd'…), un argument ou un morceau de chemin ; une chaîne qui
       COMMENCE par « vite » et une espace ; « vite » après un lanceur (npx,
       pnpx, bunx, yarn, pnpm, bun, exec, dlx, options comprises), après un
       séparateur de commandes (&&, ||, ;, |) ou après une barre de chemin
       (node_modules/.bin/vite, vite/bin/vite.js) ;
     · Vite IMPORTÉ : `from 'vite'`, `import('vite')`, `require('vite')` ;
     · un SCRIPT DE package.json qui lance Vite (lus dans package.json :
       dev, build, preview le 18 novembre), appelé par npm, pnpm, yarn ou
       bun, avec ou sans `run` / `run-script`, en commande ou en arguments.
   Le « vite » de la prose (« à très vite », « plus vite ») n'est rien de
   cela, ni « vite.config.ts ».

   CE QUI SE LIT, pour chaque lancement : l'appel de processus qui
   l'enferme (execSync, spawn, …), son objet d'options écrit sur place, et
   dans cet objet la clé `env`, objet écrit sur place. Tout le reste CRIE
   (épreuve `lisible`) :
     · un lancement hors d'un appel reconnu (commande dans une variable,
       chemin bâti hors de l'appel, Vite appelé en programme) ;
     · `env` qui n'est pas un objet écrit sur place (`{ env }`, `env: ENV`),
       `env` deux fois, ou `env` ailleurs que dans l'objet d'options ;
     · une recopie (`...autre`) ou une clé calculée APRÈS `env` dans l'objet
       d'options : elle pourrait le remplacer ;
     · une variable VITE_ posée dans la commande (`VITE_X=… npx vite`,
       `set`, `export`, `cross-env`, `$env:`) : l'env se dit dans `env` ;
     · une commande COMPOSÉE devant le programme (`${prefixe}npx vite`,
       `prefixe + 'npx vite'`) : on ne sait pas ce qui la précède ;
     · un script hors de Node (shell, Python, …) qui lance Vite.
   Ce qu'il prend pour ce qu'il dit : une expression placée APRÈS le
   programme dans la commande (le dossier de sortie des bancs).

   Le backend : VITE_SUPABASE_URL écrite vide ('') et rien de recopié
   après elle → aucun ; écrite non vide → oui ; absente, ou recopiable
   après → hérité (de l'environnement du poste ou de .env.local, que Vite
   lit) : c'est un backend aussi. */
const EXT = String.raw`(?:\.(?:js|mjs|cjs|cmd|exe|ps1))?`;
const FIN = String.raw`(?=[\s"'\x60;&|)]|$)`;
const OPTIONS = String.raw`(?:[ \t]+-{1,2}[\w-]+(?:=\S+)?)*`;
const Q = String.raw`["'\x60]`;
const SCRIPTS_VITE = Object.entries(JSON.parse(lire('package.json')).scripts ?? {})
  .filter(([, corps]) => new RegExp(String.raw`(?:^|&&|\|\||[;|])\s*(?:(?:npx|pnpx|bunx|exec)${OPTIONS}[ \t]+)?(?:\S*[\\/])?vite${EXT}${FIN}`).test(String(corps)))
  .map(([nom]) => nom);
const NOMS = SCRIPTS_VITE.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)';
/* Neufs à chaque lecture : ils sont globaux (lastIndex). */
const motifsDeVite = () => [
  new RegExp(String.raw`(${Q})vite${EXT}\1`, 'g'),
  new RegExp(String.raw`${Q}[ \t]*vite${EXT}[ \t]`, 'g'),
  new RegExp(String.raw`\b(?:npx|pnpx|bunx|yarn|pnpm|bun|exec|dlx)${OPTIONS}[ \t]+vite${EXT}${FIN}`, 'g'),
  new RegExp(String.raw`(?:&&|\|\||[;|])[ \t]*vite${EXT}[ \t]`, 'g'),
  new RegExp(String.raw`[\\/]vite${EXT}${FIN}`, 'g'),
  /\bfrom\s*["']vite(?:\/[^"']*)?["']|\b(?:import|require)\s*\(\s*["']vite(?:\/[^"']*)?["']\s*\)/g,
  new RegExp(String.raw`\b(?:npm|pnpm|yarn|bun)${OPTIONS}(?:[ \t]+(?:run|run-script|rum|urn)${OPTIONS})?[ \t]+(?:${NOMS})${FIN}`, 'g'),
  new RegExp(String.raw`${Q}(?:run|run-script|rum|urn)${Q}\s*,\s*(?:${Q}-{1,2}[\w-]+(?:=[^"'\x60]*)?${Q}\s*,\s*)*${Q}(?:${NOMS})${Q}`, 'g'),
  new RegExp(String.raw`${Q}(?:npm|pnpm|yarn|bun)(?:\.cmd)?${Q}\s*,\s*\[\s*(?:${Q}-{1,2}[\w-]+(?:=[^"'\x60]*)?${Q}\s*,\s*)*${Q}(?:${NOMS})${Q}`, 'g'),
];
/* Hors de Node, la ligne qui commence par le programme compte aussi. */
const motifsHorsDeNode = () => [...motifsDeVite(), new RegExp(String.raw`^[ \t]*(?:\$\(|\x60)?vite${EXT}(?=[ \t]|$)`, 'gm')];
const jetonsDe = (texte, motifs) => motifs.flatMap((m) => [...texte.matchAll(m)].map((x) => ({ index: x.index, texte: x[0] })));
const APPELS = /\b(?:execSync|execFileSync|spawnSync|execFile|exec|spawn|fork|execa|execaSync|execaCommand|execaCommandSync)\s*\(/g;
const SCRIPT_TEXTE = (rel) => TEXTE.test(rel) || /\.(?:ps1|bat|cmd|bash|zsh|fish)$/i.test(rel) || !/\.[^/]+$/.test(rel);
const lancements = [];
const illisibles = [];
{
  const scripts = tousLesFichiers('scripts', (rel, dossier) => dossier || (SCRIPT_TEXTE(rel) && rel !== MOI));
  for (const f of scripts) {
    const brut = lire(f);
    if (!/vite|\b(?:npm|pnpm|yarn|bun)\b/.test(brut)) continue;
    if (!/\.(?:mjs|cjs|js|ts|mts)$/.test(f)) {
      /* Un script hors de Node (shell, Python…) : le banc ne lit pas son env. */
      const vus = jetonsDe(brut, motifsHorsDeNode());
      if (vus.length) illisibles.push(`${f} : lancement hors de Node (« ${vus[0].texte.trim()} »)`);
      continue;
    }
    let c;
    try { c = code(f, brut); } catch (e) { illisibles.push(`${f} : esbuild ne le lit pas (${String(e.message).split('\n')[0]})`); continue; }
    const jetons = jetonsDe(c, motifsDeVite());
    if (!jetons.length) continue;
    const appels = [];
    APPELS.lastIndex = 0;
    for (let m; (m = APPELS.exec(c));) {
      const ouvre = m.index + m[0].length - 1;
      appels.push({ ouvre, ferme: apparie(c, ouvre) });
    }
    /* Chaque jeton à l'appel qui l'enferme au plus près. */
    const parAppel = new Map();
    for (const j of jetons) {
      const enferme = appels.filter((a) => a.ouvre < j.index && a.ferme > j.index).sort((a, b) => b.ouvre - a.ouvre)[0];
      if (!enferme) { illisibles.push(`${f} : « ${j.texte.trim()} » hors d'un appel reconnu`); continue; }
      if (!parAppel.has(enferme.ouvre)) parAppel.set(enferme.ouvre, { enferme, positions: [] });
      parAppel.get(enferme.ouvre).positions.push(j.index - enferme.ouvre);
    }
    for (const { enferme, positions } of [...parAppel.values()].sort((a, b) => a.enferme.ouvre - b.enferme.ouvre)) {
      const appel = c.slice(enferme.ouvre, enferme.ferme + 1);
      const extrait = appel.replace(/\s+/g, ' ').slice(0, 70);
      const crie = (quoi) => illisibles.push(`${f} : ${quoi}, dans ${extrait}`);
      const args = morceauxDe(appel);
      /* L'objet d'options : un argument de l'appel, objet écrit sur place,
         qui porte la clé `env` au premier niveau. */
      const cles = args.filter((a) => objetEcrit(a.texte)).flatMap((o) => {
        const tout = entreesDe(o.texte);
        return tout.map((e, j) => ({ ...e, objet: o, apres: tout.slice(j + 1) }));
      });
      const envs = cles.filter((e) => e.cle === 'env');
      const ecrits = [...appel.matchAll(/\benv\s*:/g)].length;
      if (envs.length > 1 || ecrits > 1) { crie('plusieurs env'); continue; }
      if (!envs.length && ecrits) { crie('env ailleurs que dans l\'objet d\'options de l\'appel'); continue; }
      let env = null;
      let horsEnv = appel;
      if (envs.length) {
        const e = envs[0];
        if (!objetEcrit(e.valeur)) { crie('env qui n\'est pas un objet ecrit sur place'); continue; }
        if (e.apres.some((x) => x.recopie)) { crie('une recopie apres env dans les options'); continue; }
        env = e.valeur;
        const ici = e.objet.debut + e.valeurDebut;
        horsEnv = appel.slice(0, ici) + ' '.repeat(env.length) + appel.slice(ici + env.length);
      }
      const posee = /\bVITE_\w+(?=\s*=(?!=))/.exec(horsEnv);
      if (posee) { crie(`la commande pose ${posee[0]}`); continue; }
      const textes = litterauxDe(appel);
      const compose = positions.some((p) => {
        const s = textes.find((x) => x.debut <= p && p < x.fin);
        return !!s && ((s.gabarit && appel.slice(s.debut, p).includes('${')) || /\+\s*$/.test(appel.slice(0, s.debut)));
      });
      if (compose) { crie('commande composee devant le programme'); continue; }
      if (!env) { lancements.push({ fichier: f, extrait, backend: 'herite', verrou: null, env: null, entrees: [], commande: args[0]?.texte ?? null }); continue; }
      const entrees = entreesDe(env);
      const dernierIndex = (cle) => entrees.map((e) => e.cle).lastIndexOf(cle);
      const recopieApres = (k) => entrees.some((e, j) => j > k && e.recopie);
      const iUrl = dernierIndex('VITE_SUPABASE_URL');
      const backend = iUrl < 0 || recopieApres(iUrl) ? 'herite' : (litteral(entrees[iUrl].valeur) === '' ? 'aucun' : 'oui');
      const iOuvert = dernierIndex('VITE_ALLOW_OPEN');
      const verrou = iOuvert < 0 ? null : { valeur: litteral(entrees[iOuvert].valeur), dernier: !recopieApres(iOuvert) };
      lancements.push({ fichier: f, extrait, backend, verrou, env, entrees, commande: args[0]?.texte ?? null });
    }
  }
}

/* ══ LA PORTE (src/shared/auth.ts) ═════════════════════════════════════ */
dit(E.porteTexte, true,
  /export\s+const\s+requireAuth\s*=\s*isRemote\s*&&\s*import\.meta\.env\.VITE_ALLOW_OPEN\s*!==\s*["']true["']\s*;/.test(code(AUTH)));

/* Gardés pour l'épreuve de build-sites : la vraie fonction de la portée, et
   ce que dit la balise de trone.html. */
let porteeLue = null;
let porteeDeTrone = null;
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
  porteeLue = p;
  porteeDeTrone = pageDe(htmlDe('trone.html')).querySelector('meta[name="mnd-auth-scope"]')?.getAttribute('content') ?? null;
  /* Une portée VIDE compte pour absente (build-sites la pose vide pour tout
     site autre que Ma Couronne, 18 novembre 2026) : la page décide. */
  dit(E.portee, ['couronne', 'couronne', 'couronne', null, null, 'couronne', null, 'Env.Libre', 'mnd-2'],
    [p('couronne', null), p(undefined, 'couronne'), p('couronne', 'autre'), p(undefined, undefined), p(null, null), p('', 'couronne'), p('', null), p('Env.Libre', null), p(undefined, 'mnd-2')]);
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
    ['VITE_AUTH_SCOPE vide, trone.html (le Trone publie)', { ...BACKEND, VITE_AUTH_SCOPE: '' }, pageDe(htmlDe('trone.html')), DEFAUT],
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
  /* Les trois formes que lit dotenv : `CLE=…`, `export CLE=…`, `CLE: …`.
     Vite ne charge jamais .env.example ; le risque est la copie faite vers
     .env.local. */
  const exemple = lire('.env.example');
  dit(E.envExemple, [false, true], [/^[ \t]*(?:export[ \t]+)?VITE_ALLOW_OPEN[ \t]*[=:]/m.test(exemple), /^#[ \t]*VITE_ALLOW_OPEN=true[ \t]*$/m.test(exemple)]);
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
  /* Le refus (18 novembre 2026) : le PREMIER geste du fichier, avant toute
     création, regarde si 0109 est passée et lève une exception qui nomme
     0213. Un Run est une seule transaction : rien d'autre ne passe. */
  const refus = /\bdo\s+\$\$\s*begin\s+if\s+exists\s*\(\s*select\s+1\s+from\s+pg_proc\s+p\s+join\s+pg_namespace\s+n\s+on\s+n\.oid\s*=\s*p\.pronamespace\s+where\s+n\.nspname\s*=\s*'public'\s+and\s+p\.proname\s+in\s*\(\s*'fiche_qui_mattend'\s*,\s*'rattacher_mon_compte'\s*\)\s*\)\s*then\s+raise\s+exception\s+'(?:[^']|'')*0213(?:[^']|'')*'\s*;\s*end\s+if\s*;\s*end\s*\$\$\s*;/i.exec(auth);
  dit(E.refus, { refus: true, premier: true }, { refus: !!refus, premier: !!refus && auth.slice(0, refus.index).trim() === '' });

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

  /* L'en-tête de 0213, lu comme une prose (les `--` retirés, les lignes
     jointes) : la clé de service ne passe pas `staff_guard`. */
  const prose = (t) => t.split('\n').map((l) => l.replace(/^\s*--\s?/, '').trim()).join(' ').replace(/\s+/g, ' ');
  const entete0213 = prose(lire(M0213).split('\n').filter((l) => /^\s*--/.test(l)).join('\n'));
  dit(E.cleDeService, [true, true, false], [
    entete0213.includes('la clé de service contourne la RLS, mais PAS `staff_guard`'),
    entete0213.includes("n'écrit donc `staff` que tant que la table est vide"),
    /peut tout écrire de toute façon/.test(entete0213),
  ]);

  /* Le gabarit du fondateur : un bloc /* … *\/ en tête du fichier, qu'on
     colle à la main. Il doit rester un commentaire (un Run du fichier entier
     ne l'exécute pas), supprimer `provision_first_staff`, s'arrêter avant
     toute insertion quand l'adresse n'a pas de compte, et n'inscrire
     qu'UNE ligne (18 novembre 2026) : `values (fondateur, …)`, qui inscrit
     une ligne ou lève, jamais zéro en silence ; `fondateur` choisi par la
     même condition que le compte ; le rôle 'souverain' ; les rubriques que
     donnait l'ancienne fonction (0003, migration passée qui ne bouge plus) ;
     toutes les branches, sans filtre. */
  const rls = lire(RLS);
  const bloc = /^\/\*[ \t]*\n([\s\S]*?)^\*\/[ \t]*$/m.exec(rls)?.[1] ?? '';
  const g = sqlSansCommentaires(bloc);
  const insere = g.search(/insert\s+into\s+public\.staff\s*\(/i);
  const avantInsertion = (re) => { const i = g.search(re); return i >= 0 && insere >= 0 && i < insere; };
  const rubriquesDe = (t) => [...(t ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
  const de0003 = rubriquesDe(/values\s*\(\s*auth\.uid\(\)[\s\S]*?array\s*\[([^\]]*)\]/i.exec(sqlSansCommentaires(lire('supabase/migrations/0003_auth.sql')))?.[1]);
  const ins = /insert\s+into\s+public\.staff\s*\(\s*user_id\s*,\s*name\s*,\s*role\s*,\s*rubrics\s*\)\s*values\s*\(\s*fondateur\s*,\s*nom\s*,\s*'souverain'\s*,\s*array\s*\[([^\]]*)\]\s*\)\s*;/i.exec(g);
  const choisi = /select\s+id\s+into\s+fondateur\s+from\s+auth\.users\s+where\s+lower\(\s*email\s*\)\s*=\s*lower\(\s*trim\(\s*courriel\s*\)\s*\)\s*;/i;
  dit(E.gabarit, {
    bloc: true, horsDuRun: true, supprime: true, compte: true, aucun: true, plusieurs: true, pasVide: true, garde: true,
    fondateur: true, souverain: true, rubriques: true, branches: true, uneInsertion: true,
  }, {
    bloc: /\bdo\s+\$\$/.test(g),
    horsDuRun: !/courriel/.test(sqlSansCommentaires(rls)),
    supprime: avantInsertion(SUPPRIME),
    compte: /select\s+count\(\*\)\s+into\s+combien\s+from\s+auth\.users\s+where\s+lower\(\s*email\s*\)\s*=\s*lower\(\s*trim\(\s*courriel\s*\)\s*\)/i.test(g),
    aucun: avantInsertion(/if\s+combien\s*=\s*0\s+then\s+raise\s+exception/i),
    plusieurs: avantInsertion(/elsif\s+combien\s*>\s*1\s+then\s+raise\s+exception/i),
    pasVide: avantInsertion(/if\s+exists\s*\(\s*select\s+1\s+from\s+public\.staff\s*\)\s+then\s+raise\s+exception/i),
    garde: /if\s*\(\s*select\s+count\(\*\)\s+from\s+public\.staff\s*\)\s*=\s*0\s+then\s+raise\s+exception/i.test(sqlSansCommentaires(rls)),
    fondateur: avantInsertion(choisi) && g.search(choisi) > g.search(/elsif\s+combien\s*>\s*1/i),
    souverain: !!ins,
    rubriques: de0003.length > 0 && JSON.stringify(rubriquesDe(ins?.[1])) === JSON.stringify(de0003),
    branches: /insert\s+into\s+public\.staff_branches\s*\(\s*user_id\s*,\s*branch_id\s*\)\s*select\s+fondateur\s*,\s*b\.id\s+from\s+public\.branches\s+b\s+on\s+conflict\s+do\s+nothing\s*;/i.test(g),
    uneInsertion: (g.match(/insert\s+into\s+public\.staff\s*\(/gi) ?? []).length === 1
      && (g.match(/insert\s+into\s+public\.staff_branches\b/gi) ?? []).length === 1
      && !/\b(?:update|delete\s+from)\s+public\.staff/i.test(g),
  });

  /* L'ordre sur un projet rejoué (18 novembre 2026) : 0003 y crée encore la
     fonction, et 0006 s'arrête tant que `staff` est vide ; l'en-tête doit
     faire passer 0213 à part AVANT le premier compte. */
  const entete = prose(rls.slice(0, Math.max(0, rls.indexOf('\n/*\n'))));
  const etape0 = entete.search(/0\. FERMEZ D'ABORD LA FONCTION/);
  dit(E.ordre, { etape0: true, rejoue: true, avantLeCompte: true }, {
    etape0: etape0 >= 0 && etape0 < entete.search(/1\. CRÉEZ ENSUITE VOTRE COMPTE/),
    rejoue: /REJOUANT LES MIGRATIONS DANS L'ORDRE/.test(entete) && entete.includes('0003 crée encore `provision_first_staff`'),
    avantLeCompte: entete.includes('Passez donc 0213 à part, AVANT de créer le moindre compte'),
  });
}

/* ══ LA CONSTRUCTION (build-sites.mjs, les bancs) ══════════════════════ */
{
  /* build-sites : UN seul lancement, et rien d'illisible dans le fichier (un
     second build écrit autrement, une commande composée, une recopie après
     env : tout fait crier ici, 18 novembre 2026). La commande, lue telle
     quelle : `npx vite build`, sans rien devant ni derrière. */
  const sites = lancements.filter((l) => l.fichier === SITES);
  const s = sites[0];
  dit(E.sitesVerrou, { lancements: 1, illisibles: [], commande: 'npx vite build', verrou: 'false', dernier: true }, {
    lancements: sites.length,
    illisibles: illisibles.filter((x) => x.startsWith(`${SITES} :`)),
    commande: litteral(s?.commande ?? '') ?? s?.commande ?? null,
    verrou: s?.verrou?.valeur ?? null,
    dernier: s?.verrou?.dernier ?? null,
  });
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

  /* LA PORTÉE ÉPINGLÉE (18 novembre 2026). Un poste qui porte
     VITE_AUTH_SCOPE=x (environnement ou .env.local, que l'environnement du
     processus écrase) : le Trône reçoit '', Ma Couronne 'couronne', un site
     dont l'env ne dit rien de la portée ''. Et '' sur les pages du Trône
     donne bien le tiroir par défaut, par la vraie `porteeDeSession` et la
     vraie balise (absente) de trone.html. */
  let portee;
  try {
    const iPortee = (s?.entrees ?? []).map((e) => e.cle).lastIndexOf('VITE_AUTH_SCOPE');
    const fabrique = new Function('process', 'site', 'BUILD_ID', `return (${s?.env ?? 'null'});`);
    const poste = { env: { VITE_AUTH_SCOPE: 'x', VITE_SUPABASE_URL: 'https://exemple.test', VITE_SUPABASE_ANON_KEY: 'x' } };
    const trone = fabrique(poste, { base: '/trone/', apps: 'trone' }, 'b')?.VITE_AUTH_SCOPE;
    portee = {
      dernier: iPortee >= 0 && !s.entrees.some((e, j) => j > iPortee && e.recopie),
      trone,
      couronne: fabrique(poste, { base: '/couronne/', apps: 'couronne', env: { VITE_AUTH_SCOPE: 'couronne' } }, 'b')?.VITE_AUTH_SCOPE,
      autre: fabrique(poste, { base: '/', apps: 'revelateur', env: { VITE_LINK_COURONNE: '/couronne/' } }, 'b')?.VITE_AUTH_SCOPE,
      tiroirDuTrone: typeof porteeLue === 'function' ? porteeLue(trone, porteeDeTrone) : 'porteeDeSession non chargee',
    };
  } catch (e) { portee = `l'env ne s'evalue pas : ${e.message}`; }
  dit(E.sitesPortee, { dernier: true, trone: '', couronne: 'couronne', autre: '', tiroirDuTrone: null }, portee);

  /* vite.config : rien n'y redéfinit la porte ni la portée. Un `define` de
     `import.meta.env.*` passerait devant l'épingle de build-sites ; envDir
     ou envPrefix changeraient ce que Vite lit. Toutes les configurations que
     Vite chercherait (vite.config.js passe devant .ts). */
  const configs = readdirSync(racine).filter((f) => /^vite\.config\.(?:[cm]?[jt]s)$/.test(f)).sort();
  dit(E.config, { existe: true, fautes: [] }, {
    existe: configs.includes('vite.config.ts'),
    fautes: configs.flatMap((f) => {
      const cc = code(f);
      return [
        /VITE_ALLOW_OPEN/.test(cc) && `${f} : VITE_ALLOW_OPEN`,
        /VITE_AUTH_SCOPE/.test(cc) && `${f} : VITE_AUTH_SCOPE`,
        /import\.meta\.env/.test(cc) && `${f} : import.meta.env`,
        /\benvPrefix\b/.test(cc) && `${f} : envPrefix`,
        /\benvDir\b/.test(cc) && `${f} : envDir`,
      ].filter(Boolean);
    }),
  });

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
  /* Une définition, sous son nom ou exportée sous lui par un renommage
     (`export { e as escHtml }`). Et, quel que soit le nom (18 novembre
     2026) : aucun fichier de src/ ne produit l'entité « &lt; » hors des
     trois qui le font à dessein, celle-ci et les deux laissées chez elles
     (voir l'en-tête de shared/echappe-html-pur). */
  const DEFINIT = /\b(?:const|let|var|function)\s+escHtml\b|\bas\s+escHtml\b/;
  const SRC = tousLesFichiers('src', (rel, d) => d || /\.(?:ts|tsx)$/.test(rel));
  const ECHAPPEMENTS = [ECHAPPE, 'src/apps/trone/routes/finances/lettres-du-pret.ts', 'src/shared/secretariat-tampons.ts'].sort();
  dit(E.uneCopie, { definitions: [ECHAPPE], echappements: ECHAPPEMENTS }, {
    definitions: SRC.filter((f) => /escHtml/.test(lire(f)) && DEFINIT.test(code(f))),
    echappements: SRC.filter((f) => /&lt;/.test(lire(f)) && /(["'`])&lt;\1/.test(code(f))),
  });
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
  /* Lu comme une prose : les lignes jointes, le retour à la ligne n'y
     change rien (18 novembre 2026). */
  const proseDoc = doc.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ');
  dit(E.code6, [true, false], [proseDoc.includes('le fondateur saisit le code à 6 chiffres reçu par e-mail'), /lien de confirmation/.test(proseDoc)]);
  dit(E.sansSouverain, [true, true], [
    proseDoc.includes("Si `staff` n'est pas vide mais ne compte plus aucun souverain"),
    proseDoc.includes('Le recours est un SQL unique, écrit par la session'),
  ]);
}

console.log(ko ? `\n${ko} ECHEC(S) sur ${n} epreuves.` : `\nTout tient : ${n} epreuves.`);
process.exit(process.exitCode ?? 0);
