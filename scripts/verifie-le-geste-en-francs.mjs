import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE GESTE EN FRANCS, EPROUVE - 5 novembre 2026 (sur le modele de verifie-la-caisse-au-jour-le-jour).
   `node scripts/verifie-le-geste-en-francs.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-geste-en-francs');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-geste-en-francs.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
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

const PRICING = 'src/shared/pricing.ts';
const PARTAGE = 'src/apps/trone/routes/clients/_shared.tsx';
const ACTIONS = 'src/apps/trone/routes/clients/actions.tsx';
const CATALOGUE = 'src/apps/trone/routes/vente/Catalogue.tsx';
const PANNES = [
  ['la coche ne garde plus le geste', PRICING, '    if (g.fichesCochees && !p.rituelComplet) continue;\n', ''],
  ['le geste en francs devient un pourcentage arrondi', PRICING, '      const pct = (100 * xof) / prix;', '      const pct = Math.round((100 * xof) / prix);'],
  ['le geste depasse le prix', PRICING, '      const xof = Math.min(Math.round(francs), prix);', '      const xof = Math.round(francs);'],
  ['le geste en francs perd contre un plus petit', PRICING, '      if (pct > mieux.pct) mieux = { pct, xof };', '      if (mieux.pct === 0) mieux = { pct, xof };'],
  ['pricingOf oublie la coche', PRICING, '  rituelComplet: client?.remiseDuRituelComplet === true,', '  rituelComplet: false,'],
  ['le juge oublie ses francs', PRICING, '  Math.max(0, Math.round((juge as JugeDuGeste).xof?.(sv) ?? 0));', '  0 * Math.round((juge as JugeDuGeste).xof?.(sv) ?? 0);'],
  ['le contexte du rituel ne porte pas les francs', PARTAGE, '    xof: (sv: Service) => remiseGesteXof(sv, pricing, chosen),', '    xof: (sv: Service) => 0 * remiseGesteXof(sv, pricing, chosen),'],
  ['la piece du rituel ecrit un pourcentage arrondi', PARTAGE, '      if (gestesEnFrancs[i] > 0) return 0;\n', ''],
  ['la facture a envoyer ecrit un pourcentage', ACTIONS, '      if (fr > 0) return { nom: sv.name, pleinXof: prixPlein(sv), remisePct: 0, remiseXof: fr };\n', ''],
  ['le Catalogue perd les francs', CATALOGUE, '...(francs > 0 ? { xof: francs } : { pct: Math.max(1, Math.min(100, parseInt(g.pct, 10) || 100)) }),', 'pct: Math.max(1, Math.min(100, parseInt(g.pct, 10) || 100)),'],
  ['le Catalogue perd la coche', CATALOGUE, '              ...(g.fichesCochees ? { fichesCochees: true } : {}),\n', ''],
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
