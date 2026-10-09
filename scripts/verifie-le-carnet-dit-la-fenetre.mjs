import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE CARNET DIT LA FENETRE, EPROUVE — `node scripts/verifie-le-carnet-dit-la-fenetre.mjs`.

   9 octobre 2026, le cas K. K. : sa reprise du 19 decembre 2026, posee sans
   prix a la cloture du 9 octobre, disait 28 000 F au Carnet (le prix de
   vitrine) et 40 000 F dans la fenetre du rendez-vous (le tarif de sa tete).
   La caisse lisait le Carnet. Le banc rejoue le recit sur le VRAI code.

   `--prouve` rejoue le meme banc sur le code d'AVANT la correction, lu par
   `git show 00e6c379` sans rien ecrire dans le depot : le banc doit y echouer
   sur « 28000 au lieu de 40000 », sinon il ne prouve rien. Le commit de base
   est fixe, la preuve reste rejouable apres le commit de la correction. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const BASE = '00e6c379';
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-carnet-dit-la-fenetre-'));
const sortie = path.join(dossier, 'harnais.mjs');

/* Le code d'avant, servi a esbuild a la place des deux fichiers corriges. */
/* `\x5c` est la barre oblique inverse des chemins Windows. Chaque fichier
   substitue se compte : une preuve batie sur le code d'apres ne prouverait
   rien, et le lanceur refuse alors de conclure. */
const substitues = new Set();
const codeDAvant = {
  name: 'code-d-avant',
  setup(b) {
    b.onLoad({ filter: /routes[/\x5c]clients[/\x5c](_shared|actions)\.tsx$/ }, (args) => {
      const rel = path.relative(racine, args.path).split(path.sep).join('/');
      substitues.add(rel);
      const contents = execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: racine, encoding: 'utf8', maxBuffer: 64e6 });
      return { contents, loader: 'tsx', resolveDir: path.dirname(args.path) };
    });
  },
};

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-carnet-dit-la-fenetre.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    plugins: prouve ? [codeDAvant] : [],
    define: {
      'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
      __PROUVE__: prouve ? 'true' : 'false',
    },
    banner: {
      /* Une horloge reglable (midi UTC : la meme date locale de -11 a +11), un
         document qui supporte les bandeaux de `toast`, et une fenetre qui
         transmet VRAIMENT ses evenements : un magasin previent ses abonnes par
         elle, et la lecture du tarif s'efface sur cet avis (sans lui, une
         fiche modifiee se relirait a l'ancien prix). */
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.__horloge = Date.parse('2026-10-09T12:00:00Z');
const __D = Date;
globalThis.Date = class extends __D {
  constructor(...a) { a.length ? super(...a) : super(globalThis.__horloge); }
  static now() { return globalThis.__horloge; }
};
globalThis.__bandeaux = [];
globalThis.document = {
  body: { dataset: {}, appendChild(el) { globalThis.__bandeaux.push(el.textContent); } },
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }),
  querySelectorAll: () => [],
};
const __ecoutes = new Map();
globalThis.window = {
  addEventListener(t, f) { if (!__ecoutes.has(t)) __ecoutes.set(t, []); __ecoutes.get(t).push(f); },
  dispatchEvent(e) { for (const f of __ecoutes.get(e.type) ?? []) f(e); return true; },
  location: { href: '', hash: '' }, setTimeout: () => 0,
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  if (!prouve) {
    /* DANS UN PROCESSUS FILS, LUI AUSSI (9 octobre 2026, relecture). Importe
       ici, le banc finissait par `process.exit` et tuait le lanceur avant son
       `finally` : le dossier temporaire, et ses quelques Mo, restaient dans
       %TEMP% a chaque passage. */
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, stdio: 'inherit' });
    process.exitCode = r.status ?? 1;
  } else {
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    const sortieDuFils = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    process.stdout.write(sortieDuFils);
    console.log(`\nCode d'avant (${BASE}) substitue pour : ${[...substitues].sort().join(', ') || 'AUCUN FICHIER'}`);
    const tient = substitues.size === 2 && r.status !== 0
      && /ECHEC Carnet, reprise du 19 dec\. 2026 -> 28000\r?\n\s+attendu 40000/.test(sortieDuFils);
    console.log(tient
      ? "\nLa preuve tient : le code d'avant echoue (28000 au lieu de 40000)."
      : '\nLA PREUVE NE TIENT PAS : le code d avant n echoue pas comme attendu.');
    process.exitCode = tient ? 0 : 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
