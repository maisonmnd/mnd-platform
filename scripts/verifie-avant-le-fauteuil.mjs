import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* AVANT LE FAUTEUIL, EPROUVE — 31 octobre 2026.
   `node scripts/verifie-avant-le-fauteuil.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

/* LE JUGE RESTE PUR : la fonction serveur de la notification du soir
   l'emportera ; un magasin, la synchronisation, React ou les reglages du
   navigateur dans son paquet la casseraient au serveur. Et il n'importe rien
   d'agenda.ts, qui lui emprunte un type. */
const IMPURS = /(^|\/)(store|sync|settings|supabase|auth|branches|agenda)\.tsx?$|node_modules\/react/;
async function lectureImpure() {
  const r = await build({
    entryPoints: [path.join(racine, 'src/shared/avant-le-fauteuil-pur.ts')],
    bundle: true, format: 'esm', platform: 'neutral', write: false, metafile: true, logLevel: 'silent',
  });
  return Object.keys(r.metafile.inputs).filter((f) => IMPURS.test(f.replace(/\\/g, '/')));
}

async function lanceLeBanc() {
  const impurs = await lectureImpure().catch((e) => [`construction impossible : ${String(e?.message ?? e).slice(0, 200)}`]);
  if (impurs.length) return { status: 1, stdout: `ECHEC le juge Avant le fauteuil tire : ${impurs.join(', ')}
`, stderr: '' };
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-avant-le-fauteuil');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-avant-le-fauteuil.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/avant-le-fauteuil-pur.ts';
const AGENDA = 'src/shared/agenda.ts';
const PANNES = [
  ['le juge tire les reglages du navigateur', PUR, "/* ── LES RÈGLES CHOISIES", "import { openingForIso } from './settings';\nvoid openingForIso;\n/* ── LES RÈGLES CHOISIES"],
  ['le juge importe agenda.ts', PUR, "/* ── LES RÈGLES CHOISIES", "import { apptPaidXof } from './agenda';\nvoid apptPaidXof;\n/* ── LES RÈGLES CHOISIES"],
  ['le rendez-vous perd ses pieces', AGENDA, '  pieces?: PieceEnvoyee[];\n', ''],
  ['la dette ne previent plus', PUR, 'if (duXof > 0) attention.push(`Elle doit', 'if (duXof > 1_000_000) attention.push(`Elle doit'],
  ['l enfant a dix-huit ans', PUR, 'export const ENFANT_MOINS_DE_ANS = 16;', 'export const ENFANT_MOINS_DE_ANS = 0;'],
  ['les tresses oubliees', PUR, "  if (rdv.serviceIds.some((id) => e.prestationsTresses(id))) attention.push('Tresses : prévenir Hermine, coiffeuse externe.');\n", ''],
  ['la fin de seance apres la fermeture passe', PUR, 'debut < ouv.openMin || debut + duree > ouv.closeMin', 'debut < ouv.openMin'],
  ['le jour ferme passe', PUR, 'if (ouv.closed || (debut !== null', 'if ((debut !== null'],
  ['le numero francais pris pour local', PUR, "return !/^(\\+?229|0)/.test(net);", 'return false;'],
  ['le comptage a un an', PUR, 'export const COMPTAGE_APRES_JOURS = 120;', 'export const COMPTAGE_APRES_JOURS = 365;'],
  ['la premiere venue sans comptage', PUR, "  if (premiereVenue) attention.push('Première venue : compter les locks avant le prix.');\n  else if", '  if'],
  ['l enfant avant la dette', PUR, "  if (duXof > 0) attention.push(`Elle doit ${francs(duXof)} à la Maison : à régler avant de partir.`);\n  const age = ageA(e.cliente?.birthday, rdv.date);\n  if (age !== undefined && age < ENFANT_MOINS_DE_ANS) attention.push('Enfant : prévenir le parent au numéro à prévenir.');\n",
    "  const age = ageA(e.cliente?.birthday, rdv.date);\n  if (age !== undefined && age < ENFANT_MOINS_DE_ANS) attention.push('Enfant : prévenir le parent au numéro à prévenir.');\n  if (duXof > 0) attention.push(`Elle doit ${francs(duXof)} à la Maison : à régler avant de partir.`);\n"],
  ['la seance couverte dite hors carnet', PUR, 'if (carnet && rdv.coveredBySub) {\n    const reste', 'if (carnet && !rdv.coveredBySub) {\n    const reste'],
  ['hors carnet sans le dire', PUR, '    horsCarnet = true;\n', ''],
  ['la note du carnet apres les messages', PUR, "  for (const m of entrants) elleADit.push({ texte: coupe(m.texte), quand: m.quand, source: 'conversations' });\n",
    "  for (const m of entrants) elleADit.push({ texte: coupe(m.texte), quand: m.quand, source: 'conversations' });\n  elleADit.sort((x, y) => (x.source === 'note' ? 1 : 0) - (y.source === 'note' ? 1 : 0));\n"],
  ['les messages sortants lus', PUR, "m.sens === 'entrant' && ", ''],
  ['les messages de toute l annee', PUR, 'export const FIL_JOURS = 30;', 'export const FIL_JOURS = 365;'],
  ['dix messages au lieu de trois', PUR, 'export const FIL_MESSAGES_MAX = 3;', 'export const FIL_MESSAGES_MAX = 10;'],
  ['le message entier, sans coupe', PUR, 'export const COUPE_A = 160;', 'export const COUPE_A = 10_000;'],
  ['la derniere note d un rendez-vous annule', PUR, "a.id !== rdv.id && a.status === 'honoré' && a.date < rdv.date", 'a.id !== rdv.id && a.date < rdv.date'],
  ['les pieces regardees a l heure pile', PUR, 'export const REGARDER_AVANT_MIN = 15;', 'export const REGARDER_AVANT_MIN = 0;'],
  ['rien a relire malgre les pieces', PUR, 'aRelire: elleADit.length > 0 || pieces.length > 0,', 'aRelire: elleADit.length > 0,'],
  ['le resume oublie rien sur WhatsApp', PUR, "  else fragments.push('rien sur WhatsApp');\n", ''],
  ['la notification sans rendez-vous parle', PUR, '  if (tetes.length === 0) return null;\n', ''],
  ['demain dit aujourd hui', PUR, "e.quand === 'soir' ? 'Demain' : 'Aujourd’hui'", "e.quand === 'matin' ? 'Demain' : 'Aujourd’hui'"],
  ['la notification sans fin', PUR, 'export const NOTIFICATION_MAX = 300;', 'export const NOTIFICATION_MAX = 30_000;'],
  ['la notification oublie les pieces', PUR, '    phrases.push(np > 0\n', '    phrases.push(np > 99\n'],
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
