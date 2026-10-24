import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA SYNTHESE EN GRAPHES, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-synthese-en-graphes.mjs`

   Le banc (`verifie-la-synthese-en-graphes.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/finances/synthese-graphes-pur.ts';
const PAGE = 'src/apps/trone/routes/finances/Synthese.tsx';
const GRAPHES = 'src/apps/trone/routes/finances/SyntheseGraphes.tsx';

const FAUTES = [
  /* #1 : l'axe ne part plus de zero. */
  { n: 1, fichier: P, avant: '  const bas = Math.min(0, min);', apres: '  const bas = min;' },
  /* #2 : un resultat negatif perd son signe sur l'axe. */
  { n: 2, fichier: P, avant: "  const signe = v < 0 ? MOINS : '';", apres: "  const signe = '';" },
  /* #3 : une cinquieme teinte inventee au lieu de « Autres ». */
  { n: 3, fichier: P, avant: '    if (r !== undefined && r < places) nommees.push(', apres: '    if (r !== undefined && r < 99) nommees.push(' },
  /* #3 : le rang ne suit plus le total de l'historique (les teintes passent a d'autres choses). */
  { n: 3, fichier: P, avant: '    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], \'fr\'));', apres: '    .sort((a, b) => a[0].localeCompare(b[0], \'fr\'));' },
  /* #4 : les pourcentages arrondis chacun a part ne font plus 100. */
  { n: 4, fichier: P, avant: '  for (const { i } of ordre) { if (manque <= 0) break; bas[i] += 1; manque -= 1; }', apres: '' },
  /* #5 : le morceau seul a 100 % ne se dessine plus. */
  { n: 5, fichier: P, avant: '  if (a1 - a0 >= 2 * Math.PI - 1e-6) {', apres: '  if (false) {' },
  /* #6 : une hausse des depenses passe pour une bonne nouvelle. */
  { n: 6, fichier: P, avant: "bon: sens === 'stable' ? null : (sens === 'hausse') === hausseEstBonne", apres: "bon: sens === 'stable' ? null : sens === 'hausse'" },
  /* #7 : la ligne sans valeur disparait du groupement. */
  { n: 7, fichier: P, avant: "    const nom = (l.dims?.[cle] ?? '').trim() || 'Non précisé';", apres: "    const nom = (l.dims?.[cle] ?? '').trim();" },
  /* #8 : la tuile des depenses juge une hausse bonne ; l'anneau des caisses prend le rang du mois ;
     le resultat sur une seconde echelle ; une teinte echangee. */
  { n: 8, fichier: PAGE, avant: 'ecart={ecartAuMois(spent, prevSpent, false)}', apres: 'ecart={ecartAuMois(spent, prevSpent)}' },
  { n: 8, fichier: PAGE, avant: 'n: c.count })), rangs.caisses);', apres: 'n: c.count })), rangsStables(new Map(byCashbox.map((c) => [c.name, c.value]))));' },
  { n: 8, fichier: GRAPHES, avant: "points={mois.map((m, i) => `${cx(i).toFixed(1)},${y(m.net).toFixed(1)}`).join(' ')}", apres: "points={mois.map((m, i) => `${cx(i).toFixed(1)},${yNet(m.net).toFixed(1)}`).join(' ')}" },
  { n: 8, fichier: P, avant: "export const TEINTES = ['#3B4BA0', '#BE7526', '#4E86D9', '#008E7F'] as const;", apres: "export const TEINTES = ['#1E2150', '#BE7526', '#4E86D9', '#008E7F'] as const;" },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-synthese-en-graphes-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-synthese-en-graphes.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: { __FAUTE__: JSON.stringify(faute ?? null) },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : ${verdict}`);
  }
  console.log(`${tiennent}/${FAUTES.length} fautes font crier le banc.`);
  if (tiennent !== FAUTES.length) process.exitCode = 1;
}
