import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* GERARD SAIT « ENTRE DEUX SEANCES », EPROUVE — 26 octobre 2026.
   `node scripts/verifie-gerard-entre-deux.mjs`

   Le banc (`verifie-gerard-entre-deux.harnais.ts`) tourne dans un
   PROCESSUS FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). La faute ne s'ecrit jamais dans le depot :
   elle est servie a esbuild au chargement du fichier ; l'empreinte md5 de
   chaque fichier est comparee avant et apres, dans un `finally`. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/shared/gerard-entre-deux-pur.ts';
const CARTE = 'src/apps/trone/routes/clients/GerardEntreDeux.tsx';

const FAUTES = [
  /* #1 : les noms restent dans leurs mots. */
  { n: 1, fichier: P, avant: '  if (motsDeNoms.length) {', apres: '  if (false) {' },
  /* #1 : les numeros restent. */
  { n: 1, fichier: P, avant: "let t = sansCoordonnees(String(texte ?? ''))", apres: "let t = String(texte ?? '')" },
  /* #2 : une rubrique Sante prend une reponse ecrite. */
  { n: 2, fichier: P, avant: "reponse: r.niveau === 'sante' ? ACCUSE_SANTE : (validee || null),", apres: 'reponse: validee || null,' },
  /* #2 : il relit tout, sans les 60 jours. */
  { n: 2, fichier: P, avant: "const lus = o.signalements.filter((s) => (s.quand ?? '').slice(0, 10) >= depuis);", apres: 'const lus = [...o.signalements];' },
  /* #3 : un souci A voir ne previent plus l'equipe. */
  { n: 3, fichier: P, avant: "prevenirLEquipe: niveau !== 'conseil',", apres: "prevenirLEquipe: niveau === 'sante'," },
  /* #4 : un simple conseil fait taire Gerard. */
  { n: 4, fichier: P, avant: "if (ouverts.includes('voir')) return 'a-voir';", apres: "if (ouverts.length) return 'a-voir';" },
  /* #5 : la consigne oublie la regle du silence. */
  { n: 5, fichier: P, avant: 'tu ne lui proposes ni envie ni remise', apres: 'tu peux tout lui proposer' },
  /* #6 : la carte lit les brouillons. */
  { n: 6, fichier: CARTE, avant: "reponses.filter((r) => (r.texteValide ?? '').trim()).map((r) => [r.id, r.texteValide as string])", apres: 'reponses.map((r) => [r.id, r.texte])' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-gerard-entre-deux-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-gerard-entre-deux.harnais.ts')],
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
