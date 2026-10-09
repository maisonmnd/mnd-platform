import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* DE MAIN EN MAIN, EPROUVE (9 octobre 2026).

   `node scripts/verifie-les-douze-lunes.mjs`           les douze regles
   `node scripts/verifie-les-douze-lunes.mjs --prouve`  puis chaque panne

   Le juge vit dans verifie-les-douze-lunes.harnais.ts (empaquete ici par
   esbuild, comme verifie-le-parrainage). Une PANNE est une mutation du
   texte d'un fichier du depot : `avant` devient `apres`. Elle s'injecte de
   deux facons, sans jamais toucher au disque :
     - a la construction, pour un module que le harnais empaquete (le juge
       pur, le moteur) : un greffon esbuild `onLoad` sert le texte mute ;
     - a la lecture, pour un texte que le harnais lit (le crochet, Ma
       Couronne, l'Edge, une migration, une page generee) : la banniere
       remplace `fs.readFileSync` dans le processus du harnais.
   Chaque panne fait tourner SA regle seule, dans un processus a part, et
   doit la faire crier. Une mutation introuvable (ou sans effet) fait
   echouer le harnais : une panne qui ne s'applique plus ne prouve rien.
   Genere d'abord le site (genere-revelateur.mjs) : la regle du site lit les
   pages ecrites. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const cle = (p) => path.resolve(racine, p).split(path.sep).join('/').toLowerCase();

/** `avant` devient `apres`, partout ; `null` si `avant` est introuvable.
    Un fichier aux fins de ligne CRLF reçoit la meme mutation en CRLF. */
function applique(texte, m) {
  const formes = [[m.avant, m.apres]];
  if (texte.includes('\r\n') && m.avant.includes('\n')) formes.unshift([m.avant.split('\n').join('\r\n'), m.apres.split('\n').join('\r\n')]);
  for (const [avant, apres] of formes) if (texte.includes(avant)) return texte.split(avant).join(apres);
  return null;
}

/** Dans le processus du harnais : les lectures des fichiers mutes rendent
    le texte mute (DOUZE_LUNES_MUTATION, une liste { cle, avant, apres }). */
function lecturesMutees(req, appliqueLa) {
  const brut = process.env.DOUZE_LUNES_MUTATION;
  if (!brut) return;
  const fs = req('fs');
  const chemin = req('path');
  const url = req('url');
  const mutations = JSON.parse(brut);
  const cleDe = (p) => chemin.resolve(String(p)).split(chemin.sep).join('/').toLowerCase();
  const lecture = fs.readFileSync;
  fs.readFileSync = function (p, ...reste) {
    const r = lecture.call(this, p, ...reste);
    if (typeof p !== 'string' && !(p instanceof URL)) return r;
    const c = cleDe(p instanceof URL ? url.fileURLToPath(p) : p);
    const miennes = mutations.filter((m) => m.cle === c);
    if (!miennes.length) return r;
    let t = typeof r === 'string' ? r : r.toString('utf8');
    for (const m of miennes) { const s = appliqueLa(t, m); if (s !== null) t = s; }
    return typeof r === 'string' ? t : Buffer.from(t, 'utf8');
  };
  req('module').syncBuiltinESMExports();
}

const BANNIERE = `import { createRequire as __creeRequire } from 'node:module';
const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
(${lecturesMutees.toString()})(__creeRequire(import.meta.url), ${applique.toString()});`;

async function construis(sortie, mutations = []) {
  const parFichier = new Map();
  for (const m of mutations) {
    const c = cle(m.fichier);
    if (!parFichier.has(c)) parFichier.set(c, []);
    parFichier.get(c).push(m);
  }
  return build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-douze-lunes.harnais.ts')],
    absWorkingDir: racine,
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    metafile: true,
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: { js: BANNIERE },
    plugins: [{
      name: 'pannes',
      setup(b) {
        b.onLoad({ filter: /\.(?:m?js|tsx?)$/ }, (args) => {
          const miennes = parFichier.get(cle(args.path));
          if (!miennes) return undefined;
          let src = readFileSync(args.path, 'utf8');
          for (const m of miennes) {
            const s = applique(src, m);
            if (s === null) throw new Error(`mutation introuvable dans ${m.fichier}`);
            src = s;
          }
          const ext = path.extname(args.path).slice(1);
          return { contents: src, loader: ext === 'tsx' ? 'tsx' : ext === 'ts' ? 'ts' : 'js' };
        });
      },
    }],
  });
}

const lance = (fichier, env = {}) => spawnSync(process.execPath, [fichier], {
  cwd: racine, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});

const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-douze-lunes-'));
let ko = 0;
let pannes = 0;
try {
  const base = path.join(dossier, 'harnais.mjs');
  const resultat = await construis(base);
  const empaquetes = new Set(Object.keys(resultat.metafile.inputs).map((p) => cle(p)));
  const r = lance(base);
  process.stdout.write(r.stdout);
  if (r.stderr) process.stdout.write(r.stderr);
  if (r.status !== 0) ko += 1;

  if (prouve) {
    console.log('\n-- la preuve : chaque panne doit faire crier sa regle --');
    const liste = JSON.parse(lance(base, { DOUZE_LUNES_LISTE: '1' }).stdout);
    for (const regle of liste) {
      for (const panne of regle.pannes) {
        pannes += 1;
        const manque = panne.mute.filter((m) => {
          const f = path.join(racine, m.fichier);
          if (!existsSync(f)) return true;
          const t = readFileSync(f, 'utf8');
          const s = applique(t, m);
          return s === null || s === t;
        });
        if (manque.length) {
          ko += 1;
          console.log(`RATE  mutation introuvable ou sans effet : « ${panne.nom} » (${regle.id}) dans ${manque.map((m) => m.fichier).join(', ')}`);
          continue;
        }
        let fichier = base;
        if (panne.mute.some((m) => empaquetes.has(cle(m.fichier)))) {
          fichier = path.join(dossier, `panne-${pannes}.mjs`);
          try { await construis(fichier, panne.mute); } catch (e) {
            ko += 1;
            console.log(`RATE  la panne « ${panne.nom} » (${regle.id}) ne se construit pas : ${String(e?.message ?? e).split('\n')[0]}`);
            continue;
          }
        }
        const p = lance(fichier, {
          DOUZE_LUNES_REGLE: regle.id,
          DOUZE_LUNES_MUTATION: JSON.stringify(panne.mute.map((m) => ({ ...m, cle: cle(m.fichier) }))),
        });
        if (p.status !== 0 && p.stdout.includes(`RATE  ${regle.id} `)) {
          const pourquoi = p.stdout.split(/\r?\n/).find((l) => l.startsWith('      - ')) ?? '';
          console.log(`OK    crie : ${panne.nom} (${regle.id})${pourquoi ? `\n${pourquoi.slice(0, 200)}` : ''}`);
        } else {
          ko += 1;
          console.log(`RATE  muet devant « ${panne.nom} » (${regle.id})`);
          if (p.stderr) console.log(p.stderr.split('\n').slice(0, 6).join('\n'));
        }
      }
    }
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

console.log(ko === 0
  ? (prouve ? `\nTout tient, et chacune des ${pannes} pannes fait crier sa regle.` : '\nTout tient.')
  : `\n${ko} RATE.`);
if (ko) process.exit(1);
