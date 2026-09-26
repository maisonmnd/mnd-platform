import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { origineDuCompte } from './origine-des-pages.mjs';

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
const SITES = ['trone', 'couronne', 'lokaa', 'academie', 'revelateur', 'revelateur-renvoi', 'mnd-platform'];

/* OÙ VA CHAQUE SITE — 24 septembre 2026. Jusqu'ici, un site allait toujours
   au dépôt de son nom, branche gh-pages, sous /<nom>/. Deux exceptions
   depuis que la vitrine vit à la racine du domaine : elle va au dépôt
   PRINCIPAL du compte (<compte>.github.io, branche main, chemin vide), et
   l'ancien site-projet `revelateur` reçoit les pages de renvoi. Une table,
   un seul endroit, exportée pour que le harnais la lise. */
export function destinationDuSite(site, proprietaire) {
  if (site === 'revelateur') return { depot: `${proprietaire}.github.io`, branche: 'main', chemin: '' };
  if (site === 'revelateur-renvoi') return { depot: 'revelateur', branche: 'gh-pages', chemin: '/revelateur' };
  return { depot: site, branche: 'gh-pages', chemin: `/${site}` };
}

/* LE DIST NE PEUT PAS ÊTRE PLUS VIEUX QUE LA SOURCE, 23 septembre 2026. Ce
   script n'a jamais rien construit : il envoie dist-sites/<site> tel quel et
   compare le servi à ce dossier. Ce jour-là, une vignette retouchée APRÈS le
   dernier build-sites est partie avec son ancien contenu, et « publié,
   vérifié, et servi » restait vrai, puisque c'est vrai du dossier. Le nom du
   fichier n'avait pas changé ; seuls les octets servis l'ont dit. Désormais,
   si un fichier source est plus récent que le version.json du dist (écrit à
   la fin de chaque construction), on refuse et on nomme le fichier. Aucun
   contournement : le remède est toujours de reconstruire, et il ne coûte que
   des minutes. `revelateur/` (généré) n'est pas une source. `docs/` n'en est
   pas une non plus, SAUF `docs/site-revelateur/journal` : c'est de là que le
   générateur lit les dix articles, leurs titres et leurs vignettes
   (le-trone-35, même soir : dix en-têtes retouchés après une construction
   seraient partis dans leur version d'avant). Le reste de docs/ reste
   dehors, sinon chaque note de reprise bloquerait une publication. */
export const SOURCES = ['src', 'public', 'docs/site-revelateur/journal', 'vite.config.ts', 'scripts/build-sites.mjs',
  /* renvoi.mjs fabrique les pages de renvoi de l'ancien chemin : une
     retouche après construction rendrait le dist périmé sans que rien ne
     le dise, la panne de journal-4 à un fichier près (remarque du pair). */
  'scripts/genere-revelateur.mjs', 'scripts/renvoi.mjs', ...readdirSync(racine).filter((f) => f.endsWith('.html'))].map((s) => path.join(racine, s));

/** Le fichier le plus récent sous `chemin` (fichier ou dossier), ou null. */
export function plusRecent(chemin) {
  if (!existsSync(chemin)) return null;
  const st = statSync(chemin);
  if (!st.isDirectory()) return { fichier: chemin, mtimeMs: st.mtimeMs };
  let pire = null;
  for (const f of readdirSync(chemin)) {
    if (f === 'node_modules' || f === '.git') continue;
    const r = plusRecent(path.join(chemin, f));
    if (r && (!pire || r.mtimeMs > pire.mtimeMs)) pire = r;
  }
  return pire;
}

/** Null si le dist est au moins aussi récent que toutes ses sources ; sinon
    le fichier source le plus récent, avec les deux instants. */
export function distPerime(dist, sources = SOURCES) {
  const version = path.join(dist, 'version.json');
  if (!existsSync(version)) return null;
  const construit = statSync(version).mtimeMs;
  let pire = null;
  for (const s of sources) {
    const r = plusRecent(s);
    if (r && r.mtimeMs > construit && (!pire || r.mtimeMs > pire.mtimeMs)) pire = r;
  }
  return pire ? { fichier: pire.fichier, modifie: new Date(pire.mtimeMs), construit: new Date(construit) } : null;
}
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

/* UN FIL COUPÉ N'EST PAS UN REFUS — 25 septembre 2026. Le clone du Trône est
   tombé sur « RPC failed; curl 56 schannel: server closed abruptly », puis
   « fatal: fetch-pack: invalid index-pack output ». La publication a compté un
   échec et continué sans lui : les six autres sites sont partis, le Trône est
   resté à l'ancienne version, et le correctif de connexion qu'on venait de
   pousser n'a jamais été servi. Le Trône est le plus gros dépôt, donc celui
   dont le clone dure le plus longtemps, donc celui qui perdra le plus souvent
   à ce jeu. C'est un incident de réseau, pas une décision : on renoue.

   Le dossier est VIDÉ avant chaque essai. `git clone` refuse un dossier non
   vide, et un clone interrompu en laisse un : sans cela, le réessai échouerait
   pour une raison différente de la première, ce qui est la meilleure façon de
   rendre une panne incompréhensible. */
const ESSAIS_DE_CLONE = 4;

export function cloneObstine(origine, branche, clone) {
  for (let essai = 1; essai <= ESSAIS_DE_CLONE; essai++) {
    try {
      git(['clone', '--depth', '1', '--branch', branche, '-q', origine, clone]);
      return;
    } catch (err) {
      if (essai === ESSAIS_DE_CLONE) throw err;
      const quoi = (err.stderr?.toString() || err.message).trim().split(/\r?\n/)[0];
      console.log(`   clone interrompu (${quoi}) — nouvel essai dans 5 s (${essai}/${ESSAIS_DE_CLONE - 1})`);
      rmSync(clone, { recursive: true, force: true });
      mkdirSync(clone, { recursive: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
  }
}

/* LE DOMAINE NE SE PERD PAS DANS UNE PUBLICATION — 26 septembre 2026.

   CE QUI S'EST PASSÉ. Le nom de domaine vit dans un fichier `CNAME` à la
   racine du dépôt principal ; c'est lui, et lui seul, qui dit à GitHub Pages
   de servir le site sous `maisonmnd.com`. `build-sites` l'écrit d'après la
   configuration Pages, qu'il lit chez GitHub avec `gh`. Ce jour-là, la
   lecture a rendu vide — réseau, jeton, peu importe : elle rend vide SANS LE
   DIRE, et le commentaire d'à côté affirmait alors que « rien ne casse ».

   Tout cassait. La publication efface d'abord tout (`git rm -r .`) puis copie
   la construction : pas de CNAME dans la construction, pas de CNAME dans le
   dépôt. GitHub a retiré le domaine de sa configuration, et maisonmnd.com a
   rendu 404 sur TOUTES ses pages, pendant que la publication annonçait
   « en ligne et servi » — parce qu'elle vérifie l'origine github.io, qui,
   elle, marchait très bien.

   ET LA BOUCLE SE REFERMAIT : le domaine ayant disparu de la configuration,
   `gh` rendait vide pour de bon, donc la construction suivante ne pouvait
   plus l'écrire non plus. Il a fallu le remettre à la main.

   LA RÈGLE, MAINTENANT : une publication ne RETIRE jamais un CNAME qu'elle
   trouve. Si le dépôt en porte un et que la construction n'en a pas, on le
   reprend tel quel et on le dit tout haut. Le domaine ne se perd plus par
   accident ; il ne peut plus partir que si quelqu'un l'enlève exprès du
   dépôt. */
export function domaineDuDepot(clone) {
  const f = path.join(clone, 'CNAME');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
}

/** Compare le publié à la source, fichier par fichier. Rend la liste des écarts.

    `repris` nomme les fichiers que le dépôt garde alors que la construction ne
    les a pas écrits — aujourd'hui le seul CNAME. Sans cette porte, le fichier
    repris serait compté « EN TROP » et annulerait la publication : le garde-fou
    d'à côté se retournerait contre celui-ci. */
export function ecarts(dist, clone, repris = new Set()) {
  const attendus = fichiers(dist);
  const presents = new Set(fichiers(clone));
  for (const f of repris) presents.delete(f);
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
    const perime = distPerime(dist);
    if (perime) {
      const h = (d) => d.toLocaleTimeString('fr-FR');
      console.error(`\n${site} : dist-sites/${site} est plus vieux que la source. ${path.relative(racine, perime.fichier)} a été modifié à ${h(perime.modifie)}, le site construit à ${h(perime.construit)}. Relance node scripts/build-sites.mjs (il refait les six sites), puis republie.`);
      echecs++;
      continue;
    }
    console.log(`\n═══ ${site} ═══`);
    const clone = mkdtempSync(path.join(os.tmpdir(), `mnd-${site}-`));
    const { depot, branche } = destinationDuSite(site, proprietaire);
    const origine = `https://github.com/${proprietaire}/${depot}.git`;
    try {
      if (REFONDE) {
        /* Rien n'est cloné : on repart d'un dépôt vierge, donc la branche
           poussée n'aura qu'un seul commit et aucun passé. */
        git(['init', '-q'], clone);
        git(['checkout', '-q', '-b', branche], clone);
        git(['remote', 'add', 'origin', origine], clone);
      } else {
        cloneObstine(origine, branche, clone);
      }
      git(['config', 'user.name', nomAuteur], clone);
      git(['config', 'user.email', mailAuteur], clone);
      /* On lit le domaine AVANT d'effacer : après, il n'y a plus rien à lire. */
      const domaine = REFONDE ? '' : domaineDuDepot(clone);
      if (!REFONDE) git(['rm', '-rq', '.'], clone);
      copieObstinee(dist, clone);

      const repris = new Set();
      if (domaine && !existsSync(path.join(clone, 'CNAME'))) {
        writeFileSync(path.join(clone, 'CNAME'), `${domaine}\n`);
        repris.add('CNAME');
        console.log(`   domaine « ${domaine} » REPRIS du dépôt : la construction ne l'a pas `
          + 'écrit. Sans cela, GitHub retirerait le domaine et le site répondrait 404.');
      }

      const liste = ecarts(dist, clone, repris);
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
      if (REFONDE) git(['push', '-q', '--force', 'origin', branche], clone);
      else git(['push', '-q', 'origin', branche], clone);
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
    : `${origineDuCompte(proprietaire)}${destinationDuSite(site, proprietaire).chemin}`;

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
