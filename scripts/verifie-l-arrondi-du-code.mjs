import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* L'ARRONDI DU CODE ET LA REMISE GAMME, EPROUVES — 23 octobre 2026.
   `node scripts/verifie-l-arrondi-du-code.mjs`

   Le banc (`verifie-l-arrondi-du-code.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/apps/trone/routes/vente/encaissement-pur.ts';
const C = 'src/apps/trone/routes/vente/Caisse.tsx';
const S = 'src/apps/trone/routes/clients/_shared.tsx';
const D = 'src/apps/trone/routes/vente/pdf-de-la-piece.ts';
const F = 'src/shared/pdf.ts';

const FAUTES = [
  /* #1 : pas d'arrondi, ou au mauvais palier. */
  { n: 1, fichier: P, avant: 'const arrondi = brut > 0 ? Math.min(brut,', apres: 'const arrondi = brut < 0 ? Math.min(brut,' },
  { n: 1, fichier: P, avant: 'export const PALIER_DU_CODE_XOF = 1000;', apres: 'export const PALIER_DU_CODE_XOF = 500;' },
  { n: 1, fichier: P, avant: 'const promoXof = cumul.codeConsomme ? brut - arrondi : 0;', apres: 'const promoXof = cumul.codeConsomme ? brut : 0;' },
  /* #2 : le code se compare avant son arrondi. */
  { n: 2, fichier: P, avant: 'const cumul = laMeilleureEnFrancs(dejaPose, brut - arrondi, e.nomDuCode);', apres: 'const cumul = laMeilleureEnFrancs(dejaPose, brut, e.nomDuCode);' },
  /* #3 : l'arrondi qui mange le code se tait. */
  { n: 3, fichier: P, avant: 'codeMangeParLArrondi: brut > 0 && arrondi === brut,', apres: 'codeMangeParLArrondi: false,' },
  { n: 3, fichier: C, avant: '{!refusDuCode && ticket.codeMangeParLArrondi && (', apres: '{false && (' },
  /* #5 : la remise gamme touche les prestations, ou s'empile. */
  { n: 5, fichier: P, avant: "return genre === 'product' ? Math.max(ligne, Math.max(0, Math.min(100, remiseGammePct || 0))) : ligne;", apres: 'return Math.max(ligne, Math.max(0, Math.min(100, remiseGammePct || 0)));' },
  { n: 5, fichier: P, avant: "return genre === 'product' ? Math.max(ligne, Math.max(0, Math.min(100, remiseGammePct || 0))) : ligne;", apres: "return genre === 'product' ? Math.min(100, ligne + Math.max(0, remiseGammePct || 0)) : ligne;" },
  /* #6 : la Caisse ne cable pas la remise gamme, ou le code mord sur la gamme. */
  { n: 6, fichier: C, avant: 'ligneFacture(l.n, l.unit, l.qty, l.discEff)', apres: 'ligneFacture(l.n, l.unit, l.qty, l.disc)' },
  { n: 6, fichier: C, avant: 'const netXof = unit * v.qty * (1 - discEff / 100);', apres: 'const netXof = unit * v.qty * (1 - v.disc / 100);' },
  { n: 6, fichier: C, avant: '    setRemiseGamme(0);\n', apres: '' },
  { n: 6, fichier: C, avant: "  const lignesRemisables = lines\n    .filter((l) => l.kind === 'service')", apres: "  const lignesRemisables = lines\n    .filter((l) => l.kind !== 'formation')" },
  /* #7 : le rendez-vous reserve avec un code ne s'arrondit pas, ou le passe bouge. */
  { n: 7, fichier: S, avant: '  const lu = totalLuXof(a, byId);\n  return lu + arrondiDuCodeAuRdv(a, byId, lu);', apres: '  return totalLuXof(a, byId);' },
  { n: 7, fichier: S, avant: "  if (a.status === 'honoré' || apptPaidXof(a) > 0) return 0;\n", apres: '' },
  { n: 7, fichier: S, avant: 'return arrondiDuCodeAuRdv(a, byId) > 0 ? splitByWeights(apptTotalXof(a, byId), poids) : poids;', apres: 'return poids;' },
  { n: 7, fichier: S, avant: 'return Math.min(remise, reste === 0 ? 0 : PALIER_DU_CODE_XOF - reste);', apres: 'return reste === 0 ? 0 : PALIER_DU_CODE_XOF - reste;' },
  /* #8 : le libelle ne dit plus « hors gamme », ou le papier melange les remises. */
  { n: 8, fichier: P, avant: "% hors gamme` : 'sur les prestations, hors gamme'}", apres: "%` : ''}" },
  { n: 8, fichier: D, avant: "if (lignes > 0) out.push({ label: 'Remises sur les lignes',", apres: "if (false) out.push({ label: 'Remises sur les lignes'," },
  { n: 8, fichier: C, avant: '        remises: remisesDuPapier(inv, (n) => fmtMoney(n, currency)),\n', apres: '' },
  { n: 8, fichier: F, avant: '  if (d.remises?.length) for (const r of d.remises) row(r.label, r.value, false, COPPER);\n  else if (d.discount)', apres: '  if (d.discount)' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-arrondi-du-code-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-arrondi-du-code.harnais.ts')],
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
