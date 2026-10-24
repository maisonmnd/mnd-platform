import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA PHRASE ENTIERE, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-phrase-de-rendez-vous.mjs`

   Le banc (`verifie-la-phrase-de-rendez-vous.harnais.ts`) tourne dans un PROCESSUS
   FILS ; son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const P = 'src/shared/phrase-de-rendez-vous-pur.ts';

const FAUTES = [
  /* #1 : « 3h de l'apres-midi » reste a 3 h du matin. */
  { n: 1, fichier: P, avant: '    if (apresMidi && hh >= 1 && hh < 8) hh += 12;\n', apres: '' },
  /* #2 : un samedi dont l'heure est passee, ou « samedi prochain », reste aujourd'hui. */
  { n: 2, fichier: P, avant: '      if (m[2] || passee) ecart = 7;', apres: '' },
  /* #3 : une date passee de l'annee ne va pas a l'annee suivante. */
  { n: 3, fichier: P, avant: '  return valide(a + 1, m, j);', apres: '  return ici;' },
  /* #5 : un mot qui en designe deux choisit le premier. */
  { n: 5, fichier: P, avant: '    else doutes.push({ mot, ids: gagnants.map((p) => p.id) });', apres: '    else if (gagnants[0] && !choisies.includes(gagnants[0].id)) choisies.push(gagnants[0].id);' },
  /* #6 : deux homonymes, la premiere seulement ; le numero oublie. */
  { n: 6, fichier: P, avant: '    for (const [id, n] of scoreCliente) if (n === meilleur) clientes.set(id, n);', apres: '    for (const [id, n] of scoreCliente) if (n === meilleur) { clientes.set(id, n); break; }' },
  { n: 6, fichier: P, avant: '  if (chiffres.length >= 8) {', apres: '  if (chiffres.length >= 20) {' },
  /* #7 : n'importe quel mot apres « avec » devient un maitre. */
  { n: 7, fichier: P, avant: "    const trouve = (o.maitres ?? []).find((x) => { const c = clefDeRecherche(x); return c === suivant || (suivant.length >= 3 && c.split(' ')[0].startsWith(suivant)); });",
    apres: '    const trouve = suivant.length >= 3 ? suivant : undefined;' },
  /* #10 : le nom en francais oublie, le lexique oublie, l habitude qui ne departage plus. */
  { n: 10, fichier: P, avant: "clefDeRecherche(`${p.name} ${nomEnFrancaisWa(p.name).francais}`)", apres: 'clefDeRecherche(p.name)' },
  { n: 10, fichier: P, avant: "const correspond = (mot: string, w: string) => correspondUn(mot, w) || (LEXIQUE[mot] ?? []).some((x) => correspondUn(x, w));", apres: 'const correspond = (mot: string, w: string) => correspondUn(mot, w);' },
  { n: 10, fichier: P, avant: '    if (ici.length === 1) {', apres: '    if (ici.length === 99) {' },
  /* #9 : la case du Trone ne propose plus de tout poser ; le site et Ma Couronne perdent leur case. */
  { n: 9, fichier: 'src/apps/trone/routes/clients/_shared.tsx', avant: '              phrase: optionsDeLaPhrase,\n', apres: '' },
  { n: 9, fichier: 'src/apps/revelateur/ilots/Reserver.tsx', avant: '          <PhraseDuSite onLire={lisLaPhrase} />\n', apres: '' },
  { n: 9, fichier: 'src/apps/couronne/Booking.tsx', avant: '        {!expressDispo && vue === premierEcran && <PhraseDeLaCouronne onLire={lisLaPhrase} enTete />}\n', apres: '' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-phrase-de-rendez-vous-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-phrase-de-rendez-vous.harnais.ts')],
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
