import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE PARENT QUI A PRIS LE RENDEZ-VOUS, EPROUVE — 27 octobre 2026.
   `node scripts/verifie-le-numero-a-prevenir.mjs`

   Le banc (`verifie-le-numero-a-prevenir.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/shared/numero-a-prevenir-pur.ts';
const FENETRE = 'src/apps/trone/routes/clients/_shared.tsx';
const CONF = 'supabase/functions/confirmation-rdv/index.ts';
const RAPP = 'supabase/functions/rappels-j1/index.ts';

const FAUTES = [
  /* #1 : le meme numero ecrit deux fois compte pour deux. */
  { n: 1, fichier: P, avant: ' && chiffres(f.phone2) !== chiffres(f.phone)', apres: '' },
  /* #2 : le choix touche est ignore ; le plus ancien RDV l'emporte sur le dernier ; une fiche a un numero retient quand meme. */
  { n: 2, fichier: P, avant: '  if (choisi) return choisi;\n', apres: '' },
  { n: 2, fichier: P, avant: '.sort((a, b) => `${b.date} ${b.time ?? \'\'}`.localeCompare(`${a.date} ${a.time ?? \'\'}`))[0];', apres: '.sort((a, b) => `${a.date} ${a.time ?? \'\'}`.localeCompare(`${b.date} ${b.time ?? \'\'}`))[0];' },
  { n: 2, fichier: P, avant: '  if (!f || numerosDeLaFiche(f).length < 2) return undefined;', apres: '  if (!f) return undefined;' },
  /* #3 : on ecrit toujours au premier numero. */
  { n: 3, fichier: P, avant: "  (a.numeroAPrevenir ?? '').trim() || (fiche?.phone ?? '').trim();", apres: "  (fiche?.phone ?? '').trim();" },
  /* #4 : la creation oublie le numero ; la confirmation relit le premier numero ; la copie de rappels-j1 diverge. */
  { n: 4, fichier: FENETRE, avant: '        serviceIds,\n        /* Le parent qui a pris le rendez-vous (fiche à deux numéros). */\n        numeroAPrevenir: numeroRetenu,', apres: '        serviceIds,' },
  { n: 4, fichier: CONF, avant: '    const tel = numeroIntl(telDuRdv(a, fiche));', apres: '    const tel = numeroIntl(fiche?.phone);' },
  { n: 4, fichier: RAPP, avant: "  (a.numeroAPrevenir ?? '').trim() || (fiche?.phone ?? '').trim();", apres: "  (fiche?.phone ?? '').trim() || (a.numeroAPrevenir ?? '').trim();" },
];

const md5 =(rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-numero-a-prevenir-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-numero-a-prevenir.harnais.ts')],
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
