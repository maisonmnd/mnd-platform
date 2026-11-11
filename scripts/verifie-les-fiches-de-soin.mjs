import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES FICHES DE SOIN, EPROUVEES : `node scripts/verifie-les-fiches-de-soin.mjs [--prouve]`
   (11 novembre 2026, « ranger les fiches de M. G. », Y.). `--prouve` :
   chaque faute est remise une a une, et le banc doit crier a chacune. */
const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-fiches-de-soin');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({ entryPoints: [path.join(racine, 'scripts/verifie-les-fiches-de-soin.harnais.ts')], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/fiches-de-soin-pur.ts';
const COMP = 'src/apps/trone/routes/clients/FichesDeSoin.tsx';
const SQL = 'supabase/migrations/0199_les_fiches_de_soin_en_pdf.sql';
const FICHE = 'src/apps/trone/routes/clients/Customers.tsx';
/* [nom, fichier, chaine exacte, remplacement] : chaque panne doit faire crier le banc. */
const PANNES = [
  ['le dossier laisse passer un chemin', PUR, "replace(/[^A-Za-z0-9_-]/g, '')", "replace(/x^/g, '')"],
  ['le nom garde ses accents', PUR, ".replace(/[\\u0300-\\u036f]/g, '')", ''],
  ['le nom perd son .pdf', PUR, "return `${sans || 'Fiche'}.pdf`;", "return sans || 'Fiche';"],
  ['le titre garde son numero', PUR, ".replace(/^\\d+\\s*-\\s*/, '')", ''],
  ['un marqueur de dossier passe pour une fiche', PUR, '/\\.pdf$/i.test(String(nom', '/./i.test(String(nom'],
  ['le coffre ne prend pas le PDF', SQL, "array['application/pdf']", "array['image/gif']"],
  ['l adresse vaut un jour', COMP, '3600);', '86400);'],
  ['un depot ecrase une fiche', COMP, "contentType: 'application/pdf', upsert: false", "contentType: 'application/pdf', upsert: true"],
  ['la fiche ne montre plus le bloc', FICHE, '        <FichesDeSoin clientId={client.id} />\n', ''],
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
