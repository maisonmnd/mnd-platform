import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LIRE NE RELIT PLUS LE DISQUE, EPROUVE.

   Un magasin garde sa valeur en memoire et ne redemande sa case au navigateur
   que si quelqu'un d'autre a pu y ecrire. Le harnais lui donne un disque qui
   COMPTE ses lectures, et une fenetre qui porte de vrais evenements : les
   trois portes (autre onglet, purge, ecriture directe annoncee) s'eprouvent
   comme elles arrivent.

   `MAGASIN=chemin/vers/un/store.ts` eprouve une AUTRE version du magasin :
   c'est ainsi qu'on voit le harnais crier sur celle d'avant le 1er octobre. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-lecture-du-magasin-'));
const sortie = path.join(dossier, 'harnais.mjs');
const autre = process.env.MAGASIN ? path.resolve(process.env.MAGASIN) : null;

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-lecture-du-magasin.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    /* Une autre version du magasin peut vivre hors du depot : ses imports se resolvent ici. */
    nodePaths: [path.join(racine, 'node_modules')],
    plugins: autre ? [{
      name: 'autre-magasin',
      setup(b) { b.onResolve({ filter: /shared\/store$/ }, () => ({ path: autre })); },
    }] : [],
    banner: {
      js: `const __disque = globalThis.__disque = { lus: 0, refuse: new Set(), donnees: new Map() };
globalThis.localStorage = {
  getItem: (k) => { __disque.lus += 1; return __disque.donnees.has(k) ? __disque.donnees.get(k) : null; },
  setItem: (k, v) => { if (__disque.refuse.has(k)) throw new Error('QuotaExceededError'); __disque.donnees.set(k, String(v)); },
  removeItem: (k) => { __disque.donnees.delete(k); },
};
__disque.donnees.set('mnd_reset_v5', '1');
globalThis.window = new EventTarget();
globalThis.document = { body: { dataset: { surface: 'trone' } } };
const __warn = console.warn; console.warn = (...a) => { if (!String(a[0]).startsWith('[mnd-store]')) __warn(...a); };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
