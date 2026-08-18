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

   REFONDER PLUTÔT QUE PUBLIER — MND_REFONDE=1, 18 août 2026.

   Publier ajoute un commit : la version en ligne devient la bonne, mais les
   anciennes restent lisibles dans l'historique de `gh-pages`. Le 18 août on a
   découvert qu'une maquette portant des noms de clientes y était servie depuis
   des jours ; la retirer ne suffisait pas, il fallait que les commits d'avant ne
   la portent plus.

   MND_REFONDE=1 reconstruit donc la branche À NEUF — un dépôt vierge, un seul
   commit, une poussée en force. Les mêmes garde-fous s'appliquent : la
   vérification par empreinte précède la poussée, et un écart annule tout.

   C'est destructeur pour l'HISTORIQUE, jamais pour le site : `gh-pages` ne
   contient que du construit, entièrement reproductible depuis `dist-sites/`.

   Usage : node scripts/publie.mjs trone couronne
           node scripts/publie.mjs            (les quatre)
           MND_REFONDE=1 node scripts/publie.mjs   (histoire remise à zéro) */

const racine = path.resolve(import.meta.dirname, '..');
const source = path.join(racine, 'dist-sites');
const SITES = ['trone', 'couronne', 'lokaa', 'mnd-platform'];
/** Refonder : une branche neuve, un seul commit, poussée en force. */
const REFONDE = !!process.env.MND_REFONDE;

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

async function principal() {
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
  /* On pousse TOUT d'abord, on attend ENSUITE : sinon le dernier site
     patienterait derrière l'attente de tous les autres. */
  const aAttendre = [];
  for (const site of demandes) {
    const dist = path.join(source, site);
    if (!existsSync(dist) || !statSync(dist).isDirectory()) {
      console.error(`\n${site} : rien à publier — lance d'abord node scripts/build-sites.mjs`);
      echecs++;
      continue;
    }
    console.log(`\n═══ ${site} ═══`);
    const clone = mkdtempSync(path.join(os.tmpdir(), `mnd-${site}-`));
    const origine = `https://github.com/${proprietaire}/${site}.git`;
    try {
      if (REFONDE) {
        /* Rien n'est cloné : on repart d'un dépôt vierge, donc la branche
           poussée n'aura qu'un seul commit et aucun passé. */
        git(['init', '-q'], clone);
        git(['checkout', '-q', '-b', 'gh-pages'], clone);
        git(['remote', 'add', 'origin', origine], clone);
      } else {
        git(['clone', '--depth', '1', '--branch', 'gh-pages', '-q', origine, clone]);
      }
      git(['config', 'user.name', nomAuteur], clone);
      git(['config', 'user.email', mailAuteur], clone);
      if (!REFONDE) git(['rm', '-rq', '.'], clone);
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
      if (!REFONDE && git(['status', '--porcelain'], clone) === '') {
        console.log('   déjà à jour, rien à pousser.');
        /* ON VÉRIFIE QUAND MÊME. « Rien à pousser » ne veut pas dire « en
           ligne » : le dépôt peut déjà porter la bonne version alors que
           GitHub sert encore l'ancienne — c'est précisément ce qui est arrivé
           le 17 août, une reconstruction restée bloquée plus d'une heure.
           Annoncer « servi » sans regarder serait refaire la même faute. */
        aAttendre.push({ site, dist });
        continue;
      }
      git(['commit', '-q', '-m', message], clone);
      if (REFONDE) git(['push', '-q', '--force', 'origin', 'gh-pages'], clone);
      else git(['push', '-q', 'origin', 'gh-pages'], clone);
      console.log(`   ${fichiers(dist).length} fichiers vérifiés, ${REFONDE ? 'REFONDÉ' : 'publié'} @ ${sha}.`);
      aAttendre.push({ site, dist });
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
  /* ── ET MAINTENANT, EST-CE SERVI ? ──────────────────────────────
     On a poussé TOUS les sites d'abord, on attend ENSUITE : sinon le dernier
     patienterait derrière l'attente de tous les autres. */
  if (aAttendre.length > 0 && !process.env.MND_SANS_ATTENTE) {
    console.log('\n── Mise en ligne ──');
    let enRetard = 0;
    for (const { site, dist } of aAttendre) {
      process.stdout.write(`${site} : `);
      const ok = await attendLaMiseEnLigne(site, dist, proprietaire);
      if (ok === null) console.log('pas de version.json — rien à attendre.');
      if (ok === false) enRetard++;
    }
    if (enRetard > 0) {
      console.log(`\nPoussé et vérifié au dépôt. ${enRetard} site(s) pas encore servi(s) — ce n'est pas un échec, seulement un délai.`);
      return;
    }
  }
  console.log('\nPublié, vérifié, ET SERVI.');
}


/* ── EST-CE VRAIMENT EN LIGNE ? ────────────────────────────────────
   « Publié et vérifié » voulait dire : le dépôt a reçu les bons fichiers,
   empreinte par empreinte. Il ne voulait PAS dire que GitHub les sert. Le
   17 août, trois publications d'affilée ont été annoncées en ligne alors que
   l'adresse publique servait encore une version d'une heure et demie plus
   tôt — et Yéman a cherché un bouton qui n'existait pas encore chez elle.

   On interroge donc l'adresse PUBLIQUE jusqu'à ce qu'elle rende le `build`
   qu'on vient de pousser. Le domaine n'est jamais écrit en dur : un fichier
   CNAME dans le site l'emporte (domaine propre), sinon on le dérive du compte
   lu sur le dépôt — la même règle que partout ailleurs ici.

   L'échec n'est pas une erreur : la publication A eu lieu, seul le service qui
   la met en ligne traîne. On le DIT, au lieu de laisser croire que c'est vu. */
export async function attendLaMiseEnLigne(site, dist, proprietaire) {
  const versionLocale = path.join(dist, 'version.json');
  if (!existsSync(versionLocale)) return null;
  let attendu;
  try { attendu = JSON.parse(readFileSync(versionLocale, 'utf8')).build; } catch { return null; }
  if (!attendu) return null;

  const cname = path.join(dist, 'CNAME');
  const base = existsSync(cname)
    ? `https://${readFileSync(cname, 'utf8').trim()}`
    : `https://${proprietaire}.github.io/${site}`;

  /* Réglables — non pour le confort, mais pour que le chemin « pas encore
     servi » soit ÉPROUVABLE en quelques secondes au lieu de cinq minutes. Un
     chemin d'erreur qu'on ne peut pas essayer est un chemin qu'on ne connaît
     pas. */
  const ESSAIS = Number(process.env.MND_ATTENTE_ESSAIS ?? 20);
  const PAUSE_MS = Number(process.env.MND_ATTENTE_PAUSE_MS ?? 15_000);
  for (let n = 1; n <= ESSAIS; n++) {
    let servi = null;
    try {
      /* Paramètre anti-cache : sans lui, on relirait notre propre lecture. */
      const r = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) servi = (await r.json()).build;
    } catch { /* réseau capricieux : on retentera */ }
    if (servi === attendu) {
      console.log(`   en ligne et servi — build ${attendu}${n > 1 ? ` (après ${n} vérifications)` : ''}.`);
      return true;
    }
    if (n === ESSAIS) {
      console.log(`   ⚠ poussé, mais PAS ENCORE SERVI : l'adresse publique rend ${servi ?? 'rien'}, on attendait ${attendu}.`);
      console.log(`     Rien à refaire — GitHub reconstruit de son côté. Recharge ${base}/version.json dans quelques minutes.`);
      return false;
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return false;
}

/* Le corps ne s'exécute que si le script est LANCÉ. L'importer sert à éprouver
   la vérification sur des dossiers fabriqués — sans cloner ni publier quoi que
   ce soit. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await principal();
