import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA CAISSE DU COMPTOIR, FLUIDE, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-caisse-fluide.mjs`

   Le banc (`verifie-la-caisse-fluide.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/vente/caisse-fluide-pur.ts';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';

const FAUTES = [
  /* #1 : la liste prend ce qui n'a pas commence, ou perd son ordre. */
  { n: 1, fichier: P, avant: '\n      && minutesDe(a.time) <= e.maintenantMin && !e.dejaSaPiece(a)', apres: '\n      && !e.dejaSaPiece(a)' },
  { n: 1, fichier: P, avant: '.sort((a, b) => minutesDe(a.time) - minutesDe(b.time));', apres: ';' },
  /* #2 : l'acompte et l'avoir comptent comme un moyen. */
  { n: 2, fichier: P, avant: "if (!p.method || p.method === 'Acompte' || p.method === 'Avoir' || !ok.has(p.method)) continue;", apres: 'if (!p.method) continue;' },
  /* #3 : un billet sous le du, une monnaie a l'envers. */
  { n: 3, fichier: P, avant: 'Math.ceil(du / 5_000) * 5_000', apres: 'Math.floor(du / 5_000) * 5_000 + 1' },
  { n: 3, fichier: P, avant: '{ renduXof: donne - du, manqueXof: 0 }', apres: '{ renduXof: du - donne, manqueXof: 0 }' },
  /* #4 : l'offre se propose par-dessus un code tape. */
  { n: 4, fichier: P, avant: 'if (e.codeTape.trim() || !lignes.length) return null;', apres: 'if (!lignes.length) return null;' },
  /* #5 : un moyen d'avance pour toutes, l'encaissement sans moyen, l'habitude qui ecrase la main. */
  { n: 5, fichier: C, avant: "const [pay, setPay] = useState<PaymentMethod>('');", apres: "const [pay, setPay] = useState<PaymentMethod>(methods[0] ?? 'Espèces');" },
  { n: 5, fichier: C, avant: '    if (!mndPay && resteApresParts > 0 && (!pay || especesCourtes)) return;\n', apres: '' },
  { n: 5, fichier: C, avant: "if (!payTouche.current) setPay(habituel ?? '');", apres: "setPay(habituel ?? '');" },
  /* #6 : les trois defauts reviennent. */
  { n: 6, fichier: C, avant: ' || (pay !== MND && resteApresParts > 0 && !traceDuMoyenOk)}', apres: '}' },
  { n: 6, fichier: C, avant: 'venteGamme(l.key.slice(2), l.qty, inv.number, dateVente, branch.id)', apres: 'venteGamme(l.key.slice(2), l.qty, inv.number, todayIso(), branch.id)' },
  { n: 6, fichier: C, avant: '{fxOnEff\n                  ? `Aucune caisse en', apres: '{fxOn\n                  ? `Aucune caisse en' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-caisse-fluide-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-caisse-fluide.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
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
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: { js: BANNIERE },
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
