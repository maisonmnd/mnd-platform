import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* REMPLACER UNE PRESTATION SUR SES PIECES, EPROUVE — 26 octobre 2026.
   `node scripts/verifie-remplacer-une-prestation.mjs`

   Le banc (`verifie-remplacer-une-prestation.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). La faute ne s'ecrit jamais dans le depot :
   elle est servie a esbuild au chargement du fichier ; l'empreinte md5 de
   chaque fichier est comparee avant et apres, dans un `finally`. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/clients/remplacer-une-prestation-pur.ts';
const OUTIL = 'src/apps/trone/routes/clients/RemplacerUnePrestation.tsx';
const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';

const FAUTES = [
  /* #2 : le prix consenti n'absorbe plus l'ecart (la remise de ligne le fait a sa place). */
  { n: 2, fichier: P, avant: '      if (iA >= 0) {', apres: '      if (iA >= 0 && false) {' },
  /* #2 : sans prix consenti, plus de remise sur la nouvelle ligne. */
  { n: 2, fichier: P, avant: "discountXof: (l.discountXof ?? 0) + ecart", apres: 'discountXof: l.discountXof ?? 0' },
  /* #3 : defaire garde les nouvelles lignes. */
  { n: 3, fichier: P, avant: '    lines: dernier.lines,', apres: '    lines: p.lines,' },
  /* #4 : la prestation part en fin de liste : mains et remises se decalent. */
  { n: 4, fichier: P, avant: 'ids.map((x) => (x === o.deId ? o.versId : x))', apres: '[...ids.filter((x) => x !== o.deId), o.versId]' },
  /* #4 : un rendez-vous annule change aussi. */
  { n: 4, fichier: P, avant: "a.status !== 'annulé' && ", apres: '' },
  /* #1 : un devis est remplace aussi. */
  { n: 1, fichier: P, avant: "if (p.kind === 'devis' || ", apres: 'if (' },
  /* #5 : l'outil applique aussi les pieces qui ne retombent pas pile. */
  { n: 5, fichier: OUTIL, avant: ', invoiceTotal, le).filter((c) => c.ok);', apres: ', invoiceTotal, le);' },
  /* #5 : la fiche ouvre l'outil a tout le monde. */
  { n: 5, fichier: FICHE, avant: "{estDirection && documents.some((o) => o.kind !== 'devis') && (", apres: "{documents.some((o) => o.kind !== 'devis') && (" },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-remplacer-une-prestation-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-remplacer-une-prestation.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: {
        __FAUTE__: JSON.stringify(faute ?? null),
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
      },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
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
