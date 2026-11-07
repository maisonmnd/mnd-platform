import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* MONTER OU DESCENDRE UNE LIGNE DU FORFAIT, EPROUVE : `node scripts/verifie-l-ordre-des-lignes.mjs [--prouve]`
   (7 novembre 2026, « mets-moi des onglets up and down », Y.). Le harnais tient
   la regle pure et que le Catalogue la branche (une fleche haut, une bas,
   eteintes au bord). `--prouve` : chaque faute est remise une a une (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc doit
   crier a chacune. */
const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-l-ordre-des-lignes');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({ entryPoints: [path.join(racine, 'scripts/verifie-l-ordre-des-lignes.harnais.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/ordre-des-lignes-pur.ts';
const CAT = 'src/apps/trone/routes/vente/Catalogue.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  ['la fleche du haut descend', PUR, 'const j = i + sens;', 'const j = i - sens;'],
  ['le haut de liste ne tient plus', PUR, 'j < 0 || j >= neuf.length', 'j >= neuf.length'],
  ['le bas de liste ne tient plus', PUR, 'j < 0 || j >= neuf.length', 'j < 0'],
  ['la liste passee est modifiee', PUR, 'const neuf = [...lignes];', 'const neuf = lignes as T[];'],
  ['le Catalogue ne branche plus la fleche du haut', CAT, 'deplaceLaLigne(svcForm.includes, i, -1)', 'svcForm.includes'],
  ['le Catalogue ne branche plus la fleche du bas', CAT, 'deplaceLaLigne(svcForm.includes, i, 1)', 'svcForm.includes'],
  ['la premiere ligne garde sa fleche du haut', CAT, 'disabled={i === 0}', 'disabled={false}'],
  ['la derniere ligne garde sa fleche du bas', CAT, 'disabled={i === svcForm.includes.length - 1}', 'disabled={false}'],
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
