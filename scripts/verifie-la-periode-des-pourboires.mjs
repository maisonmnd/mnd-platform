import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA PERIODE DES POURBOIRES, EPROUVEE (8 novembre 2026).
   « Les pourboires du 6 au 4 du mois suivant sont payes le 5. »
   `node scripts/verifie-la-periode-des-pourboires.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chacune doit le
   faire crier. LES PANNES VIVENT EN MEMOIRE (greffon d'esbuild + variable
   PANNE_TEXTE), jamais dans le depot ; l'empreinte de chaque fichier est
   comparee avant et apres, et une panne dont le texte ne se trouve pas
   exactement une fois fait echouer la preuve. */

const racine = path.resolve(import.meta.dirname, '..');
const J = 'src/shared/periode-des-pourboires-pur.ts';
const P = 'src/shared/pourboires-de-l-equipe-pur.ts';
const E = 'src/apps/trone/routes/equipe/';

const PANNES = [
  { nom: 'le juge compte au mois civil', fichier: J, avant: '  if (jour >= JOUR_DEBUT_PERIODE) return `${m[1]}-${m[2]}`;', apres: '  if (jour >= 1) return `${m[1]}-${m[2]}`;' },
  { nom: 'la periode commence le 5', fichier: J, avant: 'export const JOUR_DEBUT_PERIODE = 6;', apres: 'export const JOUR_DEBUT_PERIODE = 5;' },
  { nom: 'la periode commence le 7', fichier: J, avant: 'export const JOUR_DEBUT_PERIODE = 6;', apres: 'export const JOUR_DEBUT_PERIODE = 7;' },
  { nom: 'janvier ne retombe pas sur decembre', fichier: J, avant: 'return mois === 1 ? `${a - 1}-12` :', apres: 'return mois === 1 ? `${a}-12` :' },
  { nom: 'la date illisible entre dans une periode', fichier: J, avant: "  if (!m) return '';", apres: "  if (!m) return '0000-00';" },
  { nom: 'la periode d avant saute un mois', fichier: J, avant: 'const t = a * 12 + (m - 1) - n;', apres: 'const t = a * 12 + (m - 1) - n * 2;' },
  { nom: 'le paiement se dit le 6', fichier: J, avant: 'export const JOUR_DE_PAIE = 5;', apres: 'export const JOUR_DE_PAIE = 6;' },
  { nom: 'la fin de periode se dit le 5', fichier: J, avant: '${JOUR_DEBUT_PERIODE - 2} ${nomCourt', apres: '${JOUR_DEBUT_PERIODE - 1} ${nomCourt' },
  { nom: 'decembre ne passe pas a janvier dans les mots', fichier: J, avant: '(Number(periode.slice(5, 7)) % 12) + 1', apres: 'Number(periode.slice(5, 7)) % 12' },
  { nom: 'pourboiresDuMois revient au mois civil', fichier: 'src/shared/les-paiements-pur.ts', avant: 'periodeDesPourboires(p.date) === periode', apres: "String(p.date ?? '').slice(0, 7) === periode" },
  { nom: 'la paie revient au mois civil', fichier: `${E}variables-du-mois.ts`, avant: 'periodeDesPourboires(t.date) === o.period', apres: 'duMois(t.date, o.period)' },
  { nom: 'une prime suit la periode', fichier: `${E}variables-du-mois.ts`, avant: "const duMois = (date: string | undefined, period: string): boolean => (date ?? '').slice(0, 7) === period;", apres: "const duMois = (date: string | undefined, period: string): boolean => periodeDesPourboires(date) === period;" },
  { nom: 'le Personnel revient au mois civil', fichier: `${E}Personnel.tsx`, avant: 't.staffId === id && periodeDesPourboires(t.date) === month', apres: 't.staffId === id && t.date.slice(0, 7) === month' },
  { nom: 'les totaux de l equipe reviennent au mois civil', fichier: P, avant: "export const moisDe = (d: string | undefined): string => periodeDesPourboires(d);", apres: "export const moisDe = (d: string | undefined): string => String(d ?? '').slice(0, 7);" },
  { nom: 'le mois en cours est le mois civil', fichier: P, avant: '  const mois = moisDe(aujourdhui);\n  const avant = moisAvant(mois);', apres: '  const mois = aujourdhui.slice(0, 7);\n  const avant = moisAvant(mois);' },
  { nom: 'Mes pourboires redit le mois', fichier: `${E}MesPourboires.tsx`, avant: 'Mes pourboires · {periodeDite(mes.mois)}, {payesLeDit(mes.mois)}', apres: 'Mes pourboires · {moisDit(mes.mois)}' },
  { nom: 'la case d avant redit le mois', fichier: `${E}MesPourboires.tsx`, avant: '<span>{pourboiresDuDit(mes.moisPrecedent)}</span>', apres: '<span>{moisTitre(mes.moisPrecedent)}</span>' },
  { nom: 'Cette semaine change de mot', fichier: `${E}MesPourboires.tsx`, avant: '<span>Cette semaine</span>', apres: '<span>Ce mois</span>' },
  { nom: 'la direction redit le mois en colonne', fichier: `${E}Pourboires.tsx`, avant: '>{periodeTitre(c)}</button>', apres: '>{moisTitre(c)}</button>' },
  { nom: 'le fil de la direction oublie le jour du paiement', fichier: `${E}Pourboires.tsx`, avant: '`${pourboiresDuDit(moisChoisi)}, ${payesLeDit(moisChoisi)}`', apres: '`${pourboiresDuDit(moisChoisi)}`' },
  { nom: 'le Tableau de bord redit le mois', fichier: 'src/apps/trone/routes/pilotage/Dashboard.tsx', avant: 'l: pourboiresDuDit(periodeDesPourboires(today))', apres: 'l: `Pourboires ${nomDuMois(today.slice(0, 7))}`' },
  { nom: 'la ligne de la direction oublie la periode', fichier: 'src/apps/trone/routes/pilotage/Dashboard.tsx', avant: '{pourboiresDuDit(periodeDesPourboires(today))} (équipe)', apres: 'Pourboires (équipe)' },
  { nom: 'Les paiements oublient le jour du paiement', fichier: `${E}LesPaiements.tsx`, avant: '{pourboiresDuDit(periode)} · espèces, {payesLeDit(periode)}', apres: 'Pourboires du mois · espèces le 5' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-periode-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-periode-des-pourboires.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => { __m.set(k, String(v)); }, removeItem: (k) => __m.delete(k), key: (i) => [...__m.keys()][i] ?? null, get length() { return __m.size; } };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
      plugins: panne ? [{
        name: 'panne',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== panne.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(panne.avant).join(panne.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
    });
    const env = { ...process.env, ...(panne ? { PANNE_TEXTE: JSON.stringify({ fichier: panne.fichier, avant: panne.avant, apres: panne.apres }) } : {}) };
    if (!panne) delete env.PANNE_TEXTE;
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const texte = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(p.avant).length - 1;
    const avant = md5(p.fichier);
    let verdict;
    if (fois !== 1) verdict = `INTROUVABLE (${fois} fois)`;
    else {
      const r = await lance(p);
      verdict = r.status !== 0 ? 'CRIE ' : 'MUETTE';
    }
    if (md5(p.fichier) !== avant) verdict = `LE FICHIER A CHANGE (${verdict})`;
    if (verdict !== 'CRIE ') muettes++;
    console.log(`${verdict} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) ou introuvable(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
