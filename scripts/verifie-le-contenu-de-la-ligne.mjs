import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE CONTENU DE LA LIGNE, EPROUVE — 31 octobre 2026.
   `node scripts/verifie-le-contenu-de-la-ligne.mjs`

   La piece MND-2026-0165 portait un `detail` chaine et faisait tomber
   l'ecran Factures (« .map is not a function »). Le banc
   (`verifie-le-contenu-de-la-ligne.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const D = 'src/apps/trone/routes/vente/pdf-de-la-piece.ts';
const F = 'src/apps/trone/routes/vente/Factures.tsx';
const M = 'supabase/migrations/0148_le_contenu_de_la_ligne_en_tableau.sql';

const FAUTES = [
  /* #1 : le tableau garde ses vides. */
  { n: 1, fichier: D, avant: "return detail.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);", apres: 'return detail as string[];' },
  /* #2 : la chaine n'est plus mise en tableau (la panne de MND-2026-0165), ou l'ecrit passe nu. */
  { n: 2, fichier: D, avant: "  if (typeof detail === 'string') {\n    const t = detail.trim();\n    return t ? [t] : [];\n  }\n", apres: '' },
  { n: 2, fichier: D, avant: '  const porte = detailPorte(l.detail);\n  if (porte.length > 0) return porte;', apres: '  if (l.detail?.length) return l.detail;' },
  /* #3 : le forfait du meme nom ne se retrouve plus. */
  { n: 3, fichier: D, avant: 'const forfait = s.services.find((sv) => sv.name === l.label && (sv.includes?.length ?? 0) > 0);', apres: 'const forfait = undefined as Service | undefined;' },
  /* #4 : le contrat ne se retrouve plus, ou une piece a plusieurs lignes le prend. */
  { n: 4, fichier: D, avant: 'const abo = s.abonnes.find((a) => a.invoiceId === piece.id);', apres: 'const abo = s.abonnes.find((a) => a.invoiceId !== piece.id);' },
  { n: 4, fichier: D, avant: 'if (!abo || piece.lines.length !== 1) return [];', apres: 'if (!abo) return [];' },
  /* #5 : l'ecran relit l.detail nu. */
  { n: 5, fichier: F, avant: "{detailPorte(l.detail).join(' · ')}", apres: "{l.detail!.join(' · ')}" },
  { n: 5, fichier: D, avant: '  const contenuDeLaLigne = (piece: Invoice, l: InvoiceLine): string[] =>\n    contenuDUneLigne(piece, l, {', apres: '  const contenuDeLaLigne = (piece: Invoice, l: InvoiceLine): string[] => l.detail ?? contenuDUneLigne(piece, l, {' },
  /* #6 : le serveur retombe sur le texte. */
  { n: 6, fichier: M, avant: '  v_detail    jsonb;', apres: '  v_detail    text;' },
  { n: 6, fichier: M, avant: "      select jsonb_agg(\n               case when public.abo_num(i->'qty') is null then coalesce(cs.data->>'name', i->>'serviceId') || ' · à volonté'", apres: "      select string_agg(\n               case when public.abo_num(i->'qty') is null then coalesce(cs.data->>'name', i->>'serviceId') || ' (à volonté)'" },
  { n: 6, fichier: M, avant: "      where jsonb_typeof(l->'detail') = 'string');", apres: "      where jsonb_typeof(l->'detail') = 'array');" },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-contenu-de-la-ligne-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-contenu-de-la-ligne.harnais.ts')],
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
