import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LES DIX GESTES D UNE CONVERSATION, EPROUVES.

   Le juge vit dans src/shared/gestes-conversation.ts : quelle piece chaque
   bouton choisit, ce qu il ecrit, et pourquoi il s eteint.

   `--prouve` (27 octobre 2026) : chaque PANNE remet une faute dans la source,
   rejoue le banc, et exige qu il crie ; la source est restauree quoi qu il
   arrive (finally, md5 compare). Une panne qui ne crie pas est une panne
   mal plantee.
 */

const racine = path.resolve(import.meta.dirname, '..');

/* [nom, fichier, chaine exacte, remplacement] */
const PANNES = [
  ['le dixieme geste redevient « Promo flash »', 'src/shared/gestes-conversation.ts', "mot: 'Remise à son nom',", "mot: 'Promo flash',"],
];

async function joue() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-gestes-conversation-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-gestes-conversation.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    await import(pathToFileURL(sortie).href);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (process.argv.includes('--prouve')) {
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const texte = gardes[fichier].toString('utf8');
      if (!texte.includes(a)) { console.log(`?? panne mal plantee (chaine absente) : ${nom}`); muettes += 1; continue; }
      writeFileSync(path.join(racine, fichier), texte.replace(a, b));
      const r = spawnSync(process.execPath, [path.join(racine, 'scripts/verifie-gestes-conversation.mjs')], { cwd: racine, encoding: 'utf8' });
      writeFileSync(path.join(racine, fichier), gardes[fichier]);
      const crie = r.status !== 0;
      console.log(`${crie ? 'OK ' : '!! '} ${nom}${crie ? '' : ' : le banc n a pas crie'}`);
      if (!crie) muettes += 1;
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} faute(s), le banc crie a chacune.` : `\n${muettes} faute(s) sans cri${intacts ? '' : ' ; UNE SOURCE N EST PAS RESTAUREE'}.`);
  if (muettes || !intacts) process.exitCode = 1;
} else {
  await joue();
}
