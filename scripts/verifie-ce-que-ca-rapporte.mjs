import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* CE QUE CA RAPPORTE, EPROUVE - 26 octobre 2026.
   `node scripts/verifie-ce-que-ca-rapporte.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Sortie ASCII (console Windows). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-ce-que-ca-rapporte');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-ce-que-ca-rapporte.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/rapporte-pur.ts';
/* Les neuf pannes de la carte de construction (lot 3, vue 5), puis deux de
   plus que la specification interdit en toutes lettres. */
const PANNES = [
  ['une venue comptee deux fois', PUR, '    dejaGagnes.add(gagne.rdv.id);\n', ''],
  ['un taux chiffre sous 20 envois', PUR, 'const assez = b.envoyes >= ENVOIS_POUR_MESURER;', 'const assez = true;'],
  ['un RDV sans creeLe compte par sa date', PUR, "(a.creeLe && Number.isFinite(Date.parse(a.creeLe)) ? a.creeLe : null);", "(a.creeLe && Number.isFinite(Date.parse(a.creeLe)) ? a.creeLe : `${a.date}T00:00:00.000Z`);"],
  ['une ligne en attente comptee partie', PUR, "=> !attendEncore(e) && PARTI.has(devenuDe(e));", '=> PARTI.has(devenuDe(e));'],
  ['quand pris pour le depot', PUR, '    pose(e.clientId, e.deposeLe ?? e.quand);\n', '    pose(e.clientId, e.quand);\n'],
  ['parChantier lu comme un mois', PUR, "if (k === 'parChantier' || !/^\\d{4}-\\d{2}$/.test(k) || !estUneLigne(v)) continue;", 'if (!estUneLigne(v)) continue;'],
  ['deux voix sur sept jours non vues', PUR, 'export const JOURS_D_UNE_SEMAINE = 7;', 'export const JOURS_D_UNE_SEMAINE = 1;'],
  ['un service compte hors service', PUR, '    if (estUnService(e) || !estParti(e)) continue;\n', '    if (!estParti(e)) continue;\n'],
  ['le mois lu en UTC', PUR, '  const mois = moisACotonou(o.quand);', '  const mois = o.quand.toISOString().slice(0, 7);'],
  ['un tarif Meta invente', PUR, '      else b.metaInconnu = true;\n', '      else b.coutMetaXof = (b.coutMetaXof ?? 0) + 25;\n'],
  ['un service gagne une venue', PUR, '.filter((e) => !!e.clientId && estParti(e) && !estUnService(e) && Number.isFinite(Date.parse(e.quand)))', '.filter((e) => !!e.clientId && estParti(e) && Number.isFinite(Date.parse(e.quand)))'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
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
