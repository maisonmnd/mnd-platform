import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA BANQUE DE SCENARIOS, EPROUVEE - 30 octobre 2026.
   `node scripts/verifie-la-banque.mjs` : le harnais (verifie-la-banque.harnais.ts).
   `--prouve` : chaque panne est posee EN MEMOIRE (le module pur par un greffon
   d esbuild, les ecrans par le texte que lit le harnais), jamais sur le
   disque : l arbre partage ne bouge pas. Le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/shared/banque-scenarios-pur.ts';
const CONV = 'src/apps/trone/routes/clients/LesConversations.tsx';
const ECRAN = 'src/apps/trone/routes/clients/BanqueDeScenarios.tsx';

const PANNES = [
  ['la rafale ne se joint plus', PUR, '      if (tour && t - tour.dernier <= RAFALE_MS) {', '      if (false) {'],
  ['un signe de trop passe', PUR, "  for (const s of lu.signes) if (!a.has(s)) e.push(`lit « ${signeDit(s)} » en trop`);\n", ''],
  ['qui repond ne se compare plus', PUR, '  if (attendu.qui !== lu.qui) e.push', '  if (false) e.push'],
  ['les numeros restent', PUR, '  return sansCoordonnees(String(brut ?? \'\'))', '  return (String(brut ?? \'\'))'],
  ['un doublon entre', PUR, '    if (ids.has(id)) continue;\n', ''],
  ['l iPhone ne se lit plus', PUR, ' ?? DEBUT_IPHONE.exec(ligne)', ''],
  ['la suite d un message se perd', PUR, "      if (out.length > 0 && ligne.trim()) out[out.length - 1].texte += `\\n${ligne.trim()}`;\n", ''],
  ['la cliente du fichier est ignoree', PUR, '  if (duFichier && qui.includes(duFichier)) return duFichier;\n', ''],
  ['un cas casse passe pour juste', PUR, '      if (e.length === 0) out.justes += 1;\n      else out.casses.push({ cas: c, ecarts: e });', '      out.justes += 1;'],
  ['un media ouvre un tour', PUR, "        tour = { textes: texte && !SANS_TEXTE.test(texte) ? [texte] : [], debut: t, dernier: t, ouvre };", "        tour = { textes: texte ? [texte] : [], debut: t, dernier: t, ouvre };"],
  ['mauvaise reponse sur toutes les bulles', CONV, "{m.sens === 'sortant' && (x.auteur === 'automate' || x.auteur === 'assistant') && (", '{m.sens === \'sortant\' && ('],
  ['le personnel valide', ECRAN, '{direction && !enReprise && (', '{!enReprise && ('],
];

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-banque-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const greffon = {
      name: 'panne-en-memoire',
      setup(b) {
        if (!panne || !panne.fichier.endsWith('.ts') || panne.fichier.endsWith('.tsx')) return;
        const cible = path.join(racine, panne.fichier).replace(/\\/g, '/');
        b.onLoad({ filter: /banque-scenarios-pur\.ts$/ }, (args) => {
          if (args.path.replace(/\\/g, '/') !== cible) return undefined;
          return { contents: readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').replace(panne.avant, panne.apres), loader: 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-banque.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon],
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8',
      env: { ...process.env, ...(panne ? { BANQUE_PANNE: JSON.stringify(panne) } : {}) },
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (!prouve) process.exit(0);

let muettes = 0;
for (const [nom, fichier, avant, apres] of PANNES) {
  const texte = readFileSync(path.join(racine, fichier), 'utf8').replace(/\r\n/g, '\n');
  if (texte.split(avant).length !== 2) { muettes += 1; console.log(`MUETTE introuvable : ${nom}`); continue; }
  const r = await lance({ fichier, avant, apres });
  if (r.status === 0) { muettes += 1; console.log(`MUETTE ${nom}`); } else console.log(`CRIE  ${nom}`);
}
console.log(muettes === 0 ? `\nLa preuve tient : ${PANNES.length} pannes, le banc crie a chacune.` : `\n${muettes} panne(s) muette(s).`);
process.exit(muettes ? 1 : 0);
