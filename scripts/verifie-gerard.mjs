import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* GERARD, EPROUVE — 26 octobre 2026.
   `node scripts/verifie-gerard.mjs` : le banc, dans un
   processus fils (le paquet s'ecrit sous node_modules/.cache et s'efface
   dans un finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-gerard');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-gerard.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/gerard-pur.ts';
const ECRAN = 'src/apps/trone/routes/clients/Gerard.tsx';
const DONNEES = 'src/apps/trone/routes/clients/gerard-donnees.ts';
const PANNES = [
  ['garder un RDV pris la veille', PUR, '>= GARDER_SI_POSE_DEPUIS)', '>= 0)'],
  ['l anniversaire fete deux fois', PUR, "&& (f.birthdayGiftAt ?? '').slice(0, 4) !== A.slice(0, 4)", ''],
  ['une envie chaque semaine', PUR, 'export const ENVIE_TOUS_LES_JOURS = 30;', 'export const ENVIE_TOUS_LES_JOURS = 7;'],
  ['une envie sans accord', PUR, "  return f.accord && f.telephone ? 'whatsapp' : null;", "  return f.telephone ? 'whatsapp' : null;"],
  ['la meme envie deux fois', PUR, 'candidates.find((e) => e !== derniere && !refusee(e))', 'candidates.find((e) => !refusee(e))'],
  ['une envie refusee revient', PUR, '&& !refusee(e))', ')'],
  ['tout combiner sur un RDV pose', PUR, 'if (avantCadence === COMBINER_AVANT && !c.posee) {', 'if (avantCadence === COMBINER_AVANT) {'],
  ['les remises sans plafond', PUR, 'const remises = Math.min(manque, reste);', 'const remises = manque;'],
  ['le plan donne trop de remises', PUR, 'if (n > 0 && semaine > 0) {', 'if (semaine > -99) {'],
  ['relancer toutes les semaines', PUR, 'export const RELANCE_TOUS_LES_JOURS = 28;', 'export const RELANCE_TOUS_LES_JOURS = 7;'],
  ['une seule venue en retard', PUR, 'if (venues >= 2 && c && !c.posee && ecartJours(c.iso, A) >= RELANCE_APRES_CADENCE) {', 'if (c && !c.posee && ecartJours(c.iso, A) >= RELANCE_APRES_CADENCE) {'],
  ['l endormie sans fin', PUR, 'if (fois.length >= ENDORMIE_FOIS_MAX) return null;', ''],
  ['Noel avec un code', PUR, "return fait('noel', 'noel', [f.appel, A.slice(0, 4)], pourquoiDuFil);", "return fait('noel', 'noel', [f.appel, A.slice(0, 4)], pourquoiDuFil, { code: { mot: 'CREUX', pct: 15, jusquau: A } });"],
  ['la date sans annee', PUR, "${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;", "${MOIS[d.getUTCMonth()]}`;"],
  ['la question franche sourde', PUR, '|\\bje parle (à|a) qui\\b', ''],
  ['la signature redevient Gerard', PUR, "export const SIGNATURE = 'Maison MND';", "export const SIGNATURE = 'Gérard, Maison MND';"],
  ['l ecran lit le cycle suivant', DONNEES, 'cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso', 'cad.iso'],
  ['les fetes au rythme ordinaire', PUR, "export const ENVIE_TOUS_LES_JOURS_EN_FETES = 21;", "export const ENVIE_TOUS_LES_JOURS_EN_FETES = 30;"],
  ['les relances des fetes a quatre semaines', PUR, "export const RELANCE_TOUS_LES_JOURS_EN_FETES = 14;", "export const RELANCE_TOUS_LES_JOURS_EN_FETES = 28;"],
  ['Noel au 1er decembre', PUR, "export const NOEL_DU = '11-15';", "export const NOEL_DU = '12-01';"],
  ['le passage la nuit', PUR, '&& heureCotonou >= HEURE_DU_PASSAGE_DE && heureCotonou < HEURE_DU_PASSAGE_A;', ';'],
  ['le passage deux fois par jour', PUR, "r.mode !== 'eteint' && r.dernierPassage !== aujourdhui", "r.mode !== 'eteint'"],
  ['une ligne ecartee comptee', PUR, "if (e.statut === 'écarté' || e.statut === 'périmé' || e.statut === 'échec') continue;", ''],
  ['WhatsApp avant Ma Couronne', PUR, "if (EST_UN_SERVICE[genre]) return f.couronne ? 'couronne' : f.telephone ? 'whatsapp' : null;", "if (EST_UN_SERVICE[genre]) return f.telephone ? 'whatsapp' : f.couronne ? 'couronne' : null;"],
  ['le passage depose WhatsApp aussi', DONNEES, "if (s.canal !== 'couronne' || !servie(r, s.clientId)) continue;", 'if (!servie(r, s.clientId)) continue;'],
  ['l ecran oublie ses envois', DONNEES, 'traces: traces.get(c.id) ?? [],', 'traces: [],'],
  ['un souci ouvert ne fait plus taire', PUR, '  if (f.souciOuvert) return null;\n', ''],
  ['la fiche oublie le souci ouvert', DONNEES, '        souciOuvert: souciOuvertDe(signalements.filter((s) => s.clientId === c.id)),\n', ''],
  ['l ecran cache Entre deux seances', ECRAN, '      <GerardEntreDeux />\n', ''],
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
