import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/* PUBLIE LES SITES CONSTRUITS SUR GITHUB PAGES — en vérifiant avant de pousser.

   POURQUOI CE SCRIPT EXISTE. Le 9 août 2026, une publication du Trône est partie
   incomplète : `dist-sites/` vit dans OneDrive, qui verrouille un fichier le temps
   de le synchroniser, et la copie a échoué sur UN morceau partagé — celui que
   presque tous les autres importent. La copie a continué, la publication est
   partie, et le site est resté cassé en ligne sans qu'aucune commande n'ait
   signalé d'erreur.

   C'est le pire genre de panne : silencieuse. La publication efface d'abord tout
   (`git rm -r .`), donc un fichier manquant à la copie disparaît aussi de la
   version en ligne. Il n'y a pas de version précédente pour rattraper.

   D'où les deux garde-fous :
     ① la copie RÉESSAIE quand le fichier est verrouillé, au lieu de renoncer ;
     ② rien n'est poussé avant que chaque fichier ait été comparé par empreinte à
        sa source. Un seul écart, et le site n'est pas publié du tout.

   Aucun nom de domaine ici : le compte GitHub est lu depuis le dépôt lui-même,
   pour que changer de compte ne demande aucune modification.

   Usage : node scripts/publie.mjs trone couronne
           node scripts/publie.mjs            (les quatre) */

const racine = path.resolve(import.meta.dirname, '..');
const source = path.join(racine, 'dist-sites');
const SITES = ['trone', 'couronne', 'lokaa', 'mnd-platform'];

const git = (args, cwd = racine) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Le compte GitHub, lu depuis l'origine du dépôt — jamais écrit en dur. */
function compte() {
  const url = git(['remote', 'get-url', 'origin']);
  const m = url.match(/[/:]([^/:]+)\/[^/]+?(?:\.git)?$/);
  if (!m) throw new Error(`Impossible de lire le compte GitHub depuis « ${url} ».`);
  return m[1];
}

/** Tous les fichiers d'un dossier, chemins relatifs, en ignorant `.git`. */
export function fichiers(dossier, base = dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

const empreinte = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/* OneDrive relâche le verrou en une poignée de secondes ; on lui laisse le temps
   plutôt que d'abandonner un fichier en silence. */
function copieObstinee(de, vers) {
  for (let essai = 1; essai <= 6; essai++) {
    try {
      cpSync(de, vers, { recursive: true, force: true });
      return;
    } catch (err) {
      if (essai === 6) throw err;
      console.log(`   fichier verrouillé (${err.code ?? err.message}) — nouvel essai dans 5 s (${essai}/5)`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
  }
}

/** Compare le publié à la source, fichier par fichier. Rend la liste des écarts. */
export function ecarts(dist, clone) {
  const attendus = fichiers(dist);
  const presents = new Set(fichiers(clone));
  const liste = [];
  for (const f of attendus) {
    const cible = path.join(clone, f);
    if (!presents.has(f)) liste.push(`ABSENT    ${f}`);
    else if (empreinte(path.join(dist, f)) !== empreinte(cible)) liste.push(`DIFFÉRENT ${f}`);
    presents.delete(f);
  }
  for (const f of presents) liste.push(`EN TROP   ${f}`);
  return liste;
}

function principal() {
  const demandes = process.argv.slice(2).length ? process.argv.slice(2) : SITES;
  const inconnus = demandes.filter((d) => !SITES.includes(d));
  if (inconnus.length) {
    console.error(`Site inconnu : ${inconnus.join(', ')}. Connus : ${SITES.join(', ')}.`);
    process.exit(1);
  }

  const proprietaire = compte();
  const sha = git(['rev-parse', '--short', 'HEAD']);
  const nomAuteur = (() => { try { return git(['config', 'user.name']); } catch { return 'MND'; } })();
  const mailAuteur = (() => { try { return git(['config', 'user.email']); } catch { return 'noreply@maisonmnd'; } })();
  const message = process.env.MND_MESSAGE ?? `Publication @ ${sha}`;

  let echecs = 0;
  for (const site of demandes) {
    const dist = path.join(source, site);
    if (!existsSync(dist) || !statSync(dist).isDirectory()) {
      console.error(`\n${site} : rien à publier — lance d'abord node scripts/build-sites.mjs`);
      echecs++;
      continue;
    }
    console.log(`\n═══ ${site} ═══`);
    const clone = mkdtempSync(path.join(os.tmpdir(), `mnd-${site}-`));
    try {
      git(['clone', '--depth', '1', '--branch', 'gh-pages', '-q',
        `https://github.com/${proprietaire}/${site}.git`, clone]);
      git(['config', 'user.name', nomAuteur], clone);
      git(['config', 'user.email', mailAuteur], clone);
      git(['rm', '-rq', '.'], clone);
      copieObstinee(dist, clone);

      const liste = ecarts(dist, clone);
      if (liste.length) {
        /* RIEN N'EST POUSSÉ. Un site incomplet en ligne est pire qu'un site pas
           republié : l'ancienne version, elle, fonctionnait. */
        console.error(`   ${liste.length} écart(s) — PUBLICATION ANNULÉE, la version en ligne reste intacte :`);
        for (const l of liste.slice(0, 20)) console.error(`     ${l}`);
        if (liste.length > 20) console.error(`     … et ${liste.length - 20} autre(s)`);
        echecs++;
        continue;
      }

      git(['add', '-A'], clone);
      if (git(['status', '--porcelain'], clone) === '') {
        console.log('   déjà à jour, rien à pousser.');
        continue;
      }
      git(['commit', '-q', '-m', message], clone);
      git(['push', '-q', 'origin', 'gh-pages'], clone);
      console.log(`   ${fichiers(dist).length} fichiers vérifiés, publié @ ${sha}.`);
    } catch (err) {
      console.error(`   échec : ${err.stderr?.toString().trim() || err.message}`);
      echecs++;
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  }

  if (echecs) {
    console.error(`\n${echecs} site(s) non publié(s).`);
    process.exit(1);
  }
  console.log('\nPublié et vérifié.');
}

/* Le corps ne s'exécute que si le script est LANCÉ. L'importer sert à éprouver
   la vérification sur des dossiers fabriqués — sans cloner ni publier quoi que
   ce soit. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) principal();
