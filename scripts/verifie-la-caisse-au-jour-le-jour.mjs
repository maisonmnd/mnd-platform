import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA CAISSE AU JOUR LE JOUR, EPROUVEE - 5 novembre 2026 (sur le modele de verifie-la-carte-du-prochain-rituel).
   `node scripts/verifie-la-caisse-au-jour-le-jour.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-caisse-au-jour-le-jour');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-caisse-au-jour-le-jour.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/remise-a-zero-pur.ts';
const CAISSES = 'src/apps/trone/routes/finances/Caisses.tsx';
const FINANCE = 'src/shared/finance.ts';
const REGISTRE = 'src/apps/trone/routes/finances/ARegulariser.tsx';
const PANNES = [
  ['le reste ne s ecrit pas a regulariser', PUR, 'export const aRegulariserDeLaRemise = (livreXof: number, d: Destinations): number => livreXof - somme(d);', 'export const aRegulariserDeLaRemise = (livreXof: number, d: Destinations): number => 0 * livreXof * somme(d);'],
  ['la remise se date dans l avenir', PUR, "  if (o.date > o.aujourdhui) return 'La remise ne se date pas dans l’avenir.';\n", ''],
  ['une remise glissee avant une cloture', PUR, 'if (o.derniereClotureLe && o.date < o.derniereClotureLe) {', 'if (false) {'],
  ['deux remises le meme jour', PUR, 'if (o.derniereRemiseLe && o.date <= o.derniereRemiseLe) {', 'if (o.derniereRemiseLe && o.date < o.derniereRemiseLe) {'],
  ['plus que le livre passe', PUR, '  if (r < 0) return', '  if (r < -1e15) return'],
  ['un versement sans sa caisse', PUR, "if (d.banque > 0 && !o.banqueVers) return", "if (false) return"],
  ['une remise qui ne sort rien', PUR, "  if (somme(d) - d.reste === 0 && r === 0) return 'Rien ne sort : le tiroir garde tout ce que dit le livre.';\n", ''],
  ['les mois ne tombent pas sur le livre', PUR, '    avant = f.xof;', '    avant = 0;'],
  ['le reste d avant oublie', PUR, "  if (depart.xof !== 0) parts.push({ mois: depart.mois ?? fins[0]?.mois ?? '', xof: depart.xof, reste: true });\n", ''],
  ['le debut de mois propose le jour meme', PUR, '  if (j <= 10) return iso(new Date(a, m - 1, 0, 12));', '  if (j <= 0) return iso(new Date(a, m - 1, 0, 12));'],
  ['une part plus grande que le reste', PUR, 'if (o.xof > o.resteXof) return', 'if (o.xof > o.resteXof * 2) return'],
  ['une part datee apres la remise', PUR, 'if (o.date > o.remiseLe.slice(0, 10)) return', 'if (false) return'],
  ['la regularisation vide le tiroir une seconde fois', PUR, 'return { ...m, amountXof: m.amountXof - r.xof, ', 'return { ...m, amountXof: m.amountXof, '],
  ['le reste compte un autre motif', PUR, "m.sens === 'sortie' && m.motif === MOTIF_A_REGULARISER;", "m.sens === 'sortie';"],
  ['une remise regularisee se defait', PUR, '!!m.remise && (m.remise.regularisations ?? []).length === 0;', '!!m.remise;'],
  ['la derniere remise prend un autre tiroir', PUR, 'm.branchId === branchId && m.cashbox === cashbox && estARegulariser(m)', 'm.branchId === branchId && estARegulariser(m)'],
  ['le jour oublie les mouvements a l heure', PUR, 'x.date.slice(0, 10) === jour', 'x.date === jour'],
  ['la cloture reprise dit l ancien compte', PUR, ".sort((x, y) => (x.le ?? '').localeCompare(y.le ?? '')).at(-1);", ".sort((x, y) => (x.le ?? '').localeCompare(y.le ?? '')).at(0);"],
  ['la remise ouverte a toute l equipe', CAISSES, '{estDirection && visible && boxCur === currency && !gardeToutSonPasse(c) && bal > 0 && (', '{visible && boxCur === currency && !gardeToutSonPasse(c) && bal > 0 && ('],
  ['le motif absent du modele', FINANCE, "  'À régulariser',\n  'Autre',\n] as const;", "  'Autre',\n] as const;"],
  ['la depense nee sort d un autre tiroir', REGISTRE, 'cashbox: m.cashbox, category: form.categorie', "cashbox: 'Autre', category: form.categorie"],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
