import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* L'ARRONDI DES REMISES EN POURCENTAGE, EPROUVE — 7 novembre 2026.
   `node scripts/verifie-arrondi-des-remises.mjs`

   Le banc (`verifie-arrondi-des-remises.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const R = 'src/shared/arrondi-des-remises-pur.ts';
const PR = 'src/shared/pricing.ts';
const CA = 'src/apps/trone/routes/vente/Caisse.tsx';
const FA = 'src/apps/trone/routes/vente/Factures.tsx';
const TI = 'src/apps/trone/routes/vente/encaissement-pur.ts';
const SH = 'src/apps/trone/routes/clients/_shared.tsx';
const PL = 'src/apps/trone/routes/clients/places-au-trone-pur.ts';
const CO = 'src/apps/couronne/places-pure.ts';
const BO = 'src/apps/couronne/Booking.tsx';
const CT = 'src/apps/trone/routes/vente/Catalogue.tsx';

const FAUTES = [
  /* #1 : l'arrondi descend, ou au mauvais palier. */
  { n: 1, fichier: R, avant: 'return Math.ceil(v / PALIER_DES_REMISES_XOF - 1e-9) * PALIER_DES_REMISES_XOF;', apres: 'return Math.floor(v / PALIER_DES_REMISES_XOF) * PALIER_DES_REMISES_XOF;' },
  { n: 1, fichier: R, avant: 'export const PALIER_DES_REMISES_XOF = 500;', apres: 'export const PALIER_DES_REMISES_XOF = 1000;' },
  { n: 1, fichier: R, avant: 'return Math.ceil(v / PALIER_DES_REMISES_XOF - 1e-9) * PALIER_DES_REMISES_XOF;', apres: 'return (Math.floor(v / PALIER_DES_REMISES_XOF) + 1) * PALIER_DES_REMISES_XOF;' },
  /* #2 : les bornes. */
  { n: 2, fichier: R, avant: 'return Math.min(plein, arrondiAuCinqCents(exact));', apres: 'return arrondiAuCinqCents(exact);' },
  { n: 2, fichier: R, avant: 'if (plein === 0 || p === 0) return plein;', apres: 'if (plein === 0) return plein; if (p === 0) return arrondiAuCinqCents(plein);' },
  { n: 2, fichier: R, avant: 'if (p >= 100) return 0;', apres: 'if (p >= 100) return plein;' },
  { n: 2, fichier: R, avant: 'String(jourIso).slice(0, 10) >= LE_JOUR_DE_L_ARRONDI;', apres: "String(jourIso).slice(0, 10) >= '2026-01-01';" },
  /* #3 : la regle sur la plage (l'arrondi du ticket de l'ecran du Catalogue). */
  { n: 3, fichier: R, avant: 'const exact = plein - (plein * p) / 100;', apres: 'const exact = plein - (plein * p) / 100 + 1;' },
  /* #4 : le forfait du Catalogue ne passe plus par la regle. */
  { n: 4, fichier: PR, avant: 'return prixApresRemisePct(somme, remise);', apres: 'return Math.max(0, Math.round(somme * (1 - remise / 100)));' },
  /* #5 : le passe bouge. */
  { n: 5, fichier: R, avant: 'if (avant && nombre(avant.discountPct) === pct && nombre(avant.unitXof) === nombre(l.unitXof) && nombre(avant.qty) === nombre(l.qty)) return l;', apres: '' },
  { n: 5, fichier: R, avant: 'if (gpct > 0 && !(avant && nombre(avant.globalDiscountPct) === gpct && lignes.every((l, i) => l === p.lines[i]))) {', apres: 'if (gpct > 0) {' },
  /* #6 : la piece neuve garde un pourcentage, ou perd l'ordre des remises. */
  { n: 6, fichier: R, avant: "return { ...l, discountPct: 0, discountXof:", apres: "return { ...l, discountXof:" },
  { n: 6, fichier: R, avant: 'const sous = lignes.reduce((s, l) => s + Math.max(0, nombre(l.qty) * nombre(l.unitXof) * (1 - nombre(l.discountPct) / 100) - nombre(l.discountXof)), 0);', apres: 'const sous = lignes.reduce((s, l) => s + nombre(l.qty) * nombre(l.unitXof), 0);' },
  /* #7 : le ticket. */
  { n: 7, fichier: TI, avant: 'const resteApresPct = prixApresRemisePct(Math.round(sous - sans), pctEff);', apres: 'const resteApresPct = Math.round((sous - sans) * (1 - pctEff / 100));' },
  { n: 7, fichier: TI, avant: 'const enFrancs = pctEff > 0;', apres: 'const enFrancs = sans > 0 && pctEff > 0;' },
  { n: 7, fichier: TI, avant: 'const partPctXof = sous - sans > 0 ? Math.round((remisePctXof * Math.max(0, prest - sans)) / (sous - sans)) : 0;', apres: 'const partPctXof = 0;' },
  /* #8 : la fenetre du Carnet et Ma Couronne. */
  { n: 8, fichier: PL, avant: 'const pctXof = e.arrondi ? remiseEnFrancsArrondie(base, pct) : Math.round(base * (pct / 100));', apres: 'const pctXof = Math.round(base * (pct / 100));' },
  { n: 8, fichier: PL, avant: 'enFrancs: (sans > 0 || !!e.arrondi) && pctXof > 0 };', apres: 'enFrancs: sans > 0 && pctXof > 0 };' },
  { n: 8, fichier: PL, avant: 'pct > 0 ? remiseEnFrancsArrondie(baseDeLaRemiseFamille(lignes), pct) : 0;', apres: 'pct > 0 ? Math.round(baseDeLaRemiseFamille(lignes) * (pct / 100)) : 0;' },
  { n: 8, fichier: CO, avant: 'const remiseOffre = remiseEnFrancsArrondie(base, pctOffre);', apres: 'const remiseOffre = base - Math.round(base * (1 - pctOffre / 100));' },
  { n: 8, fichier: CO, avant: 'const remiseFamille = pctFamille > 0 ? remiseEnFrancsArrondie(baseFamille, pctFamille) : 0;', apres: 'const remiseFamille = pctFamille > 0 ? Math.round(baseFamille * (pctFamille / 100)) : 0;' },
  /* #9 : le cablage des ecrans. */
  { n: 9, fichier: SH, avant: 'arrondi: !(appt && (appt.discountPct ?? 0) === discountPct),', apres: 'arrondi: false,' },
  { n: 9, fichier: SH, avant: 'arrondi: !(appt && (appt.discountPct ?? 0) === discountPct),', apres: 'arrondi: true,' },
  { n: 9, fichier: CA, avant: 'lines: lines.map((l) => figeLaLigne(ligneFacture(l.n, l.unit, l.qty, l.discEff), null)),', apres: 'lines: lines.map((l) => ligneFacture(l.n, l.unit, l.qty, l.discEff)),' },
  { n: 9, fichier: CA, avant: 'const netXof = prixApresRemisePct(unit * v.qty, discEff);', apres: 'const netXof = unit * v.qty * (1 - discEff / 100);' },
  { n: 9, fichier: FA, avant: 'const d = figeLesRemisesDeLaPiece(dBrut,', apres: 'const d = (<T,>(x: T, _a?: unknown) => x)(dBrut,' },
  { n: 9, fichier: FA, avant: 'const apercu = editing\n    ? figeLesRemisesDeLaPiece(editing.draft,', apres: 'const apercu = editing\n    ? ((x: Invoice, _a?: unknown) => x)(editing.draft,' },
  { n: 9, fichier: BO, avant: '? { discountXof: chiffre.remiseOffre }', apres: '? (chiffre.sansRemiseXof > 0 ? { discountXof: chiffre.remiseOffre } : { discountPct: chiffre.pctOffre })' },
  { n: 9, fichier: CT, avant: 'prixApresRemisePct(inclusValeur, remisePct)', apres: 'Math.round(inclusValeur * (1 - remisePct / 100))' },
  { n: 9, fichier: CT, avant: 'prix: prixApresRemisePct(compo, remisePct)', apres: 'prix: Math.round(compo * (1 - remisePct / 100))' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-arrondi-des-remises-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-arrondi-des-remises.harnais.ts')],
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
