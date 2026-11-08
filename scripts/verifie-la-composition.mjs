import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* VOIR LA COMPOSITION, EPROUVE - 8 novembre 2026.
   `node scripts/verifie-la-composition.mjs` : le banc, dans un processus fils
   (le paquet s'ecrit sous node_modules/.cache et s'efface).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const PUR = 'src/shared/composition-pur.ts';
const VUE = 'src/apps/couronne/VoirLaComposition.tsx';
const COM = 'src/apps/couronne/Compose.tsx';
const ACH = 'src/apps/couronne/AchatFormule.tsx';
const EN = 'src/apps/couronne/i18n/en-composition.ts';
const PANNES = [
  ['une prestation repetee n est plus comptee', PUR, '      deja.fois += 1;', '      deja.fois += 0;'],
  ['les semaines perdent leur ordre', PUR, 'semaines: [...x.semaines].sort((a, b) => a - b) })', 'semaines: [...x.semaines] })'],
  ['la ligne offerte se paie', PUR, 'semaines: semaine !== undefined ? [semaine] : [], offert: !!l.offert });', 'semaines: semaine !== undefined ? [semaine] : [], offert: false });'],
  ['une prestation offerte se confond avec la meme payee', PUR, "${l.offert ? 'offert' : 'paye'}`;", "paye`;"],
  ['les venues perdent leur ordre', PUR, '    .sort((a, b) => a - b)\n', ''],
  ['le a volonte devient un nombre', PUR, 'deja.qty = deja.qty === null || i.qty === null ? null : deja.qty + i.qty;', 'deja.qty = (deja.qty ?? 0) + (i.qty ?? 0);'],
  ['la carte de forfait sans composition', COM, '                  <CompositionDuForfait groupes={compositionDuForfait(lignes, nomInclus)} />\n', ''],
  ['la carte de formule sans composition', COM, '                    <CompositionDeLaFormule lignes={compositionDeLaFormule(pl.included', '                    {false && <CompositionDeLaFormule lignes={compositionDeLaFormule(pl.included'],
  ['la fiche d achat sans composition', ACH, '                <CompositionDeLaFormule lignes={compositionDeLaFormule(plan.included', '                {false && <CompositionDeLaFormule lignes={compositionDeLaFormule(plan.included'],
  ['la composition ne se replie plus', VUE, '    <details className="cma-compo">\n      <summary>{t(\'Voir la composition\')}</summary>\n      {groupes.map', '    <div className="cma-compo">\n      <summary>{t(\'Voir la composition\')}</summary>\n      {groupes.map'],
  ['une phrase neuve sans son anglais', EN, "  'à volonté': 'unlimited',\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-composition');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-composition.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

const r = await lanceLeBanc();
process.stdout.write(r.stdout ?? '');
if (r.stderr) process.stdout.write(r.stderr);
process.exit(r.status ?? 1);
