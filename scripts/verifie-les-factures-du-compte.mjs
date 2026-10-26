import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LES FACTURES D'UN COMPTE FAMILLE, EPROUVEES — 26 octobre 2026.
   `node scripts/verifie-les-factures-du-compte.mjs`

   Le banc (`verifie-les-factures-du-compte.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/clients/factures-du-compte-pur.ts';
const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';

const FAUTES = [
  /* #1 : l'enfant revoit toutes les pieces du compte (l'ancienne rubrique). */
  { n: 1, fichier: P, avant: '(o.estLePayeur || pourQui(p, o.clienteDuRdv) === o.moi)', apres: '(true)' },
  /* #1 : la piece d'un de ses rituels, sans soignee nommee, n'est plus reconnue. */
  { n: 1, fichier: P, avant: '(piece.apptId ? clienteDuRdv.get(piece.apptId) : undefined) || ', apres: '' },
  /* #2 : le payeur ne voit plus que ce qui le concerne lui-meme. */
  { n: 2, fichier: P, avant: '(o.estLePayeur || pourQui(p, o.clienteDuRdv) === o.moi)', apres: '(pourQui(p, o.clienteDuRdv) === o.moi)' },
  /* #2 : la plus recente n'est plus en tete. */
  { n: 2, fichier: P, avant: '    .sort((a, b) => b.date.localeCompare(a.date));\n}', apres: '    ;\n}' },
  /* #4 : la fiche se croit toujours chez le payeur ; l'enfant ne lit plus « Reglees par le compte ». */
  { n: 4, fichier: FICHE, avant: 'estLePayeur, clienteDuRdv,\n', apres: 'estLePayeur: true, clienteDuRdv,\n' },
  { n: 4, fichier: FICHE, avant: "{estLePayeur ? 'Factures du compte' : 'Réglées par le compte'}", apres: "{'Factures du compte'}" },
];

const md5 =(rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-factures-du-compte-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-factures-du-compte.harnais.ts')],
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
