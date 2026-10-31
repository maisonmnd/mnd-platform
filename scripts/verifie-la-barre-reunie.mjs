import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA BARRE REUNIE, `node scripts/verifie-la-barre-reunie.mjs` (14 octobre 2026).

   Quatorze rubriques fondues dans d'autres, les prets au personnel aux
   Ressources humaines, les acces tenus onglet par onglet. Le harnais tient
   le compte de la barre, qui voit quel onglet, et l'ecran des prets coupe
   en deux.

   27 octobre 2026 (lot 3 de l'Assistant Maison) : la barre passe a 28. Le
   banc tourne dans un processus fils (le paquet s'ecrit sous
   node_modules/.cache et s'efface dans un finally).
   `--prouve` : chaque faute est remise une a une dans routes/index.tsx
   (copie gardee, restauration dans un finally, empreintes comparees), et le
   banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-barre-reunie');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-barre-reunie.harnais.ts')],
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
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const INDEX = 'src/apps/trone/routes/index.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  ['un hote retire perd ses onglets (le retrait juge avant la reunion, l ordre d avant)', INDEX,
    '      if (!r) return retire ? { ...it, horsMenu: true } : it;\n',
    '      if (!r || retire) return retire ? { ...it, horsMenu: true } : it;\n'],
  ['un hote retire reste dans la barre', INDEX,
    'horsMenu: retire || it.horsMenu, Component: EcranReuni }',
    'horsMenu: it.horsMenu, Component: EcranReuni }'],
  ['une rubrique retiree revient dans la barre', INDEX, "'/analytics', '/a-faire', '/juste-prix',", "'/analytics', '/juste-prix',"],
  ['l Audience n est plus un onglet des Clientes', INDEX, "{ path: '/audience', label: 'Audience' }, ", ''],
  ['les prestations quittent la Synthese', INDEX, ", { path: '/chiffre-des-prestations', label: 'Les prestations' }", ''],
  ['les prestataires quittent les Ressources humaines', INDEX, ", { path: '/prestataires', label: 'Les prestataires' }", ''],
  ['les QR reprennent leur ancien nom', INDEX, "label: 'QR de la Maison'", "label: 'QR Codes'"],
  ['le Foyer remontre le mot banni', INDEX, "label: 'Maison & Foyer'", "label: 'Salon & Foyer'"],
  /* 31 octobre 2026 : la liste finit par /dictee et /assistants ; l'aiguille suit. */
  ['l Audience oubliee des ecrans nes apres', INDEX, "'/previsions', '/gerard', '/audience', '/dictee', '/assistants'];", "'/previsions', '/gerard', '/dictee', '/assistants'];"],
  ['Entre deux seances retire en ecrivant horsMenu dans sa ligne', INDEX,
    "{ path: '/entre-deux', label: 'Entre deux séances'", "{ path: '/entre-deux', horsMenu: true, label: 'Entre deux séances'"],
  ['les Ambassadrices retournent au Marketing', INDEX,
    "      { path: '/parrainages', horsMenu: true, label: 'Ambassadrices', icon: HeartHandshake, Component: lazy(() => import('./equipe/Parrainages')) },\n      /* GÉRARD",
    "      /* GÉRARD"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
