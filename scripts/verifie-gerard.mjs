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

/* LA LECTURE RESTE PURE (27 octobre 2026) : la fonction serveur
   assistant-maison l'emporte ; un magasin, la synchronisation, React ou les
   reglages du navigateur dans son paquet la casseraient au serveur. */
const IMPURS = /(^|\/)(store|sync|settings|supabase|auth|branches)\.tsx?$|node_modules\/react/;
async function lectureImpure() {
  const r = await build({
    entryPoints: [path.join(racine, 'src/shared/assistant-lecture-pur.ts')],
    bundle: true, format: 'esm', platform: 'neutral', write: false, metafile: true, logLevel: 'silent',
  });
  return Object.keys(r.metafile.inputs).filter((f) => IMPURS.test(f.replace(/\\/g, '/')));
}

async function lanceLeBanc() {
  const impurs = await lectureImpure().catch((e) => [`construction impossible : ${String(e?.message ?? e).slice(0, 200)}`]);
  if (impurs.length) return { status: 1, stdout: `ECHEC la lecture de l Assistant tire : ${impurs.join(', ')}
`, stderr: '' };
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
const DERNIER = 'src/shared/dernier-message-pur.ts';
const ENVOIS = 'src/shared/envois.ts';
const OREILLE = 'src/shared/assistant-reponses-pur.ts';
const WEBHOOK = 'supabase/functions/whatsapp-webhook/index.ts';
const ECRAN = 'src/apps/trone/routes/clients/Gerard.tsx';
const DONNEES = 'src/apps/trone/routes/clients/gerard-donnees.ts';
const LECTURE = 'src/shared/assistant-lecture-pur.ts';
const PASSAGE = 'src/shared/assistant-passage-pur.ts';
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
  ['Noel avec un code', PUR, "return fait('noel', 'fetes', [f.appel, A.slice(0, 4)], pourquoiDuFil);", "return fait('noel', 'fetes', [f.appel, A.slice(0, 4)], pourquoiDuFil, { code: { mot: 'CREUX', pct: 15, jusquau: A } });"],
  ['la date sans annee', PUR, "${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;", "${MOIS[d.getUTCMonth()]}`;"],
  ['la question franche sourde', OREILLE, '|\\bje parle (à|a) qui\\b', ''],
  ['la signature redevient Gerard', PUR, "export const SIGNATURE = 'Maison MND';", "export const SIGNATURE = 'Gérard, Maison MND';"],
  ['l ecran lit le cycle suivant', LECTURE, 'cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso', 'cad.iso'],
  ['les fetes au rythme ordinaire', PUR, "export const ENVIE_TOUS_LES_JOURS_EN_FETES = 21;", "export const ENVIE_TOUS_LES_JOURS_EN_FETES = 30;"],
  ['les relances des fetes a quatre semaines', PUR, "export const RELANCE_TOUS_LES_JOURS_EN_FETES = 14;", "export const RELANCE_TOUS_LES_JOURS_EN_FETES = 28;"],
  ['Noel au 1er decembre', PUR, "export const NOEL_DU = '11-15';", "export const NOEL_DU = '12-01';"],
  ['le passage la nuit', PUR, '&& heureCotonou >= HEURE_DU_PASSAGE_DE && heureCotonou < HEURE_DU_PASSAGE_A;', ';'],
  ['le passage deux fois par jour', PUR, "r.mode !== 'eteint' && r.dernierPassage !== aujourdhui", "r.mode !== 'eteint'"],
  ['une ligne ecartee comptee', PUR, "if (e.statut === 'écarté' || e.statut === 'périmé' || e.statut === 'échec' || e.statut === 'sans-abonnement') continue;", ''],
  ['WhatsApp avant Ma Couronne', PUR, "if (EST_UN_SERVICE[genre]) return f.couronne ? 'couronne' : f.telephone ? 'whatsapp' : null;", "if (EST_UN_SERVICE[genre]) return f.telephone ? 'whatsapp' : f.couronne ? 'couronne' : null;"],
  ['WhatsApp part sans approbation de Meta', PASSAGE, "} else if (s.canal === 'whatsapp' && partSeulSurWhatsApp(r, s.modele)) {", "} else if (s.canal === 'whatsapp') {"],
  ['le passage ecrit en pause', PASSAGE, "  if (r.mode === 'eteint') return [];\n", ''],
  ['la remise fabriquee au depot', PASSAGE, "if (e.type !== 'gerard' || e.statut !== 'envoyé' || !e.codeAFaire", "if (e.type !== 'gerard' || !e.codeAFaire"],
  ['la remise refabriquee', PASSAGE, '|| !e.codeAFaire || e.codePromo || !e.id', '|| !e.codeAFaire || !e.id'],
  ['les lignes deja la reecrites', PASSAGE, 'lignes.filter((l) => !existantes.has(l.id));', 'lignes.filter(() => true);'],
  ['le serveur toujours tenu pour vivant', PASSAGE, 'return Number.isFinite(t) && maintenantMs - t < SERVEUR_TU_APRES_H * 3_600_000;', 'return true;'],
  ['le Trone double le serveur dans le doute', DONNEES, '      if (tue !== true) return;\n', '      if (tue === false) return;\n'],
  ['l ecran oublie ses envois', LECTURE, 'traces: traces.get(c.id) ?? [],', 'traces: [],'],
  ['un souci ouvert ne fait plus taire', PUR, '  if (f.souciOuvert) return null;\n', ''],
  ['la fiche oublie le souci ouvert', LECTURE, '      souciOuvert: souciOuvertDe(sesSignalements),\n', ''],
  ['l ecran cache Entre deux seances', ECRAN, '      <GerardEntreDeux />\n', ''],
  /* Maquette v4, lot 1 : une panne par regle nouvelle. */
  ['une relance redevient service', PUR, "garder: true, combiner: false, retard: false, 'une-venue': false,", "garder: true, combiner: false, retard: true, 'une-venue': false,"],
  ['une dette ne fait plus taire', PUR, '  if ((f.resteDu ?? 0) > 0) return null;\n', ''],
  ['la reponse due oubliee', PUR, '  if (f.attendUneReponse) return null;\n', ''],
  ['la relance de facture oubliee', PUR, '  if (f.derniereRelanceLe && ecartJours(f.derniereRelanceLe, A) < 7) return null;\n', ''],
  ['un enfant du foyer ecrit', PUR, 'if (f.ecartee || f.enfantDuFoyer) return null;', 'if (f.ecartee) return null;'],
  ['les autres voix ignorees', PUR, 'const recemment = [siens, f.dernierMessageHorsService]', 'const recemment = [siens]'],
  ['deux remises a la fois', PUR, 'const aDejaUneRemise = (f.codesVivants ?? 0) > 0;', 'const aDejaUneRemise = false;'],
  ['Noel malgre la carte cadeau', PUR, '&& !f.carteVivante) {', ') {'],
  ['l anniversaire hors plafond', PUR, '&& !aDejaUneRemise && ctx.remisesRestantes > 0 && !traceDe', '&& !aDejaUneRemise && !traceDe'],
  ['le plan oublie l anniversaire', PUR, '    if (!s.code) { out.push(s); continue; }', "    if (s.genre !== 'creux') { out.push(s); continue; }"],
  ['les francs ne bornent plus', PUR, 'const restantes = francs >= o.plafondFrancs ? 0 : ', 'const restantes = '],
  ['un code mort coute', PUR, 'else if (c.expireLe > o.maintenantIso) francs +=', 'else francs +='],
  ['la pause ecrit', PUR, 'export const servie = (r: ReglagesDuPassage, _clientId: string): boolean => estActif(r);', 'export const servie = (r: ReglagesDuPassage, _clientId: string): boolean => true;'],
  ['un pourcentage dans le corps', PUR, 'et ce jour-là la Maison vous fait une remise sur votre ${f.soinDit}.', 'et ce jour-là votre ${f.soinDit} est à −15 %.'],
  ['un service compte dans les 14 jours', DERNIER, "if (estUnService(e) || PAS_PARTI.has(e.statut ?? '')) continue;", "if (PAS_PARTI.has(e.statut ?? '')) continue;"],
  ['les WhatsApp sortants oublies', DERNIER, "  for (const w of messages) if (w.sens === 'sortant') pose(w.clientId, w.quand);\n", ''],
  ['la reponse due sans fin', DERNIER, 'maintenantMs - t < 48 * 3_600_000', 'true'],
  ['le jour lu en UTC', DERNIER, 'new Date(t + 3_600_000)', 'new Date(t)'],
  ['la fiche oublie la dette', LECTURE, '      resteDu: resteDu.get(c.id) ?? 0,\n', ''],
  ['le plafond ne compte que l Assistant', LECTURE, 'codes: codes.filter((k) => k.branchId === e.branche.id), lundi', "codes: codes.filter((k) => k.branchId === e.branche.id && k.parQui === 'Gérard'), lundi"],
  ['la lecture oublie l enfant du foyer', LECTURE, 'return !!payeur && payeur !== c.id && !(c.birthday && !estMineur(c, today));', 'return false;'],
  ['la lecture oublie la carte cadeau', LECTURE, '      carteVivante: carteSurSaFiche.has(c.id),\n', ''],
  ['la lecture oublie la remise vivante', LECTURE, '      codesVivants: codesVivantsDe(codes, c.id, maintenantIso).length,\n', ''],
  ['la lecture oublie la reponse due', LECTURE, '      attendUneReponse: attend.has(c.id),\n', ''],
  ['la lecture oublie la relance de facture', LECTURE, '      derniereRelanceLe: derniereRelance.get(c.id),\n', ''],
  ['la lecture oublie les autres voix', LECTURE, '      dernierMessageHorsService: dernierHorsService.get(c.id),\n', ''],
  ['la lecture ouvre les jours fermes', LECTURE, 'iso, aujourdhui: today, maintenantMin: 0, ouverture: e.ouverture(iso), durationMin: duree,', "iso, aujourdhui: today, maintenantMin: 0, ouverture: { closed: false, openMin: 540, closeMin: 1140 }, durationMin: duree,"],
  ['le code signe Gerard', LECTURE, "parQui: 'Assistant Maison', note: GENRE_DIT[s.genre],", "parQui: 'Gérard', note: GENRE_DIT[s.genre],"],
  ['les eteintes perdues en route', LECTURE, 'ctx: { aujourdhui: today, creux, remisesRestantes, placesDe, eteintes: rg.eteintes },', 'ctx: { aujourdhui: today, creux, remisesRestantes, placesDe },'],
  ['une situation eteinte ecrit encore', PUR, '    if (ctx.eteintes?.includes(genre) || f.jamais?.includes(genre)) return null;\n', "    if (f.jamais?.includes(genre)) return null;\n"],
  ['jamais pour elle oublie', PUR, '    if (ctx.eteintes?.includes(genre) || f.jamais?.includes(genre)) return null;\n', "    if (ctx.eteintes?.includes(genre)) return null;\n"],
  ['une situation inconnue gardee', PUR, "return [...new Set(x.filter((g): g is GenreDeMessage => typeof g === 'string' && g in PRIORITE))];", "return [...new Set(x as GenreDeMessage[])];"],
  ['la reponse perdue', PUR, '...(reponse ? { reponse } : {}) };', '};'],
  ['la fiche oublie jamais pour elle', LECTURE, '      jamais: rg.jamais[c.id] ?? [],\n', ''],
  ['l Assistant pris pour l equipe', ENVOIS, " || /^(assistant maison|g[ée]rard)$/i.test((parQui ?? '').trim());", ';'],
  ['la lecture tire les reglages du navigateur', LECTURE, "import { deuxPlaces } from './processus-pur';", "import { deuxPlaces } from './processus-pur';\nimport { openingForIso } from './settings';\nvoid openingForIso;"],
  ['un merci compte pour un oui', OREILLE, "g === 'NON' ? 'non' : g === 'MERCI' ? undefined : 'oui';", "g === 'NON' ? 'non' : 'oui';"],
  ['STOP au milieu d une phrase', OREILLE, '/^\\s*(stop|arr[eê]t(ez|er)?', '/\\b(stop|arr[eê]t(ez|er)?'],
  ['un bouton etranger pris pour l Assistant', OREILLE, '/^GERARD:(gerard-\\d{4}', '/GERARD:(gerard-\\d{4}'],
  ['les boutons sans leur ligne', PUR, "parameters: [{ type: 'payload' as const, payload: charge(idDeLaLigne(o.aujourdhui, s.clientId, 'whatsapp'), b) }],", "parameters: [{ type: 'payload' as const, payload: b }],"],
  ['la copie du webhook en retard', WEBHOOK, "export const ACCUSE_DU_STOP = 'C’est noté : la Maison ne vous enverra plus ses nouvelles. Les rappels de vos rendez-vous continuent.';", "export const ACCUSE_DU_STOP = 'C’est noté.';"],
  ['STOP pris par l automate', WEBHOOK, "        if (!e.bouton && (estUnStop(e.texte) || estUneQuestionFranche(e.texte))) continue;\n", ''],
  ['la franchise repond a la place d une personne', WEBHOOK, "    if (!partiSeul || !jetonMeta || !phoneIdMeta) continue;", "    if (!jetonMeta || !phoneIdMeta) continue;"],
  ['l ecran perd le plafond en francs', ECRAN, '                onChange={(e) => setFrancs(e.target.value)} onBlur={posePlafond} />', '                onChange={(e) => setFrancs(e.target.value)} />'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
  /* --sans-ecran : l'ecran est en chantier chez une autre session ; ses fautes attendent (aucune ecriture dans Gerard.tsx). */
  const choisies = process.argv.includes('--sans-ecran') ? PANNES.filter((p) => p[1] !== ECRAN) : PANNES;
  const fichiers = [...new Set(choisies.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of choisies) {
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
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${choisies.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && intacts ? 0 : 1;
}
