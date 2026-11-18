import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE « OUI » DE PERLE QUI RÉSERVE, ÉPROUVÉ : `node scripts/verifie-le-oui-de-perle.mjs`.

   18 novembre 2026, l'agent des rendez-vous, lot 3 (choix de Yéman : « un
   toucher, rien à choisir »). Le harnais (verifie-le-oui-de-perle.harnais.ts)
   importe la règle de Perle (src/shared/gerard-pur.ts) et la VRAIE fonction
   whatsapp-automate : esbuild remplace ses imports `npm:` par des faux, comme
   le banc d'Opale. Un échec sort en code 1. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-le-oui-de-perle.harnais.ts');

const faux = {
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^npm:/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: a.path.startsWith('npm:@supabase/supabase-js')
        ? 'export const createClient = () => ({});'
        : a.path.startsWith('npm:@anthropic-ai/sdk')
          ? 'export default class Anthropic { constructor() { this.messages = { create: async () => ({}) }; } }'
          : 'export default {};',
    }));
  },
};

const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-oui-de-perle-'));
const sortie = path.join(dossier, 'harnais.mjs');
try {
  await build({
    entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
    outfile: sortie, logLevel: 'error', plugins: [faux], loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  });
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}`);
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
