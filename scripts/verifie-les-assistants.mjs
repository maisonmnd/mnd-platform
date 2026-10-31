import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './assistants-maison-serveur.mjs';

/* LES ASSISTANTS RELIES, EPROUVES - 31 octobre 2026, sur le modele de verifie-la-dictee.mjs.
   `node scripts/verifie-les-assistants.mjs` : le fichier de la fonction assistants-maison
   doit etre a jour avec le depot, puis le harnais (verifie-les-assistants.harnais.ts)
   tourne, la fonction regroupee depuis les sources du moment.
   `--prouve` : chaque panne est posee EN MEMOIRE (les modules par un greffon
   d esbuild, les fichiers lus par le texte que lit le harnais), jamais sur le
   disque : l arbre partage ne bouge pas. Le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/shared/assistants-pur.ts';
const SERVEUR = 'scripts/serveur/assistants-maison.ts';

const PANNES = [
  // le cerveau pur
  ['une citation passe le filtre du mot', PUR, "  if (/[«»\"“”„]/.test(t)) return { ok: false, motif: 'des guillemets : un relais ne cite jamais' };\n", ''],
  ['un numero passe le filtre du mot', PUR, "  if (/\\d{8,}/.test(t.replace(/[\\s.-]/g, ''))) return { ok: false, motif: 'un numéro : la clé du numéro a son champ' };\n", ''],
  ['un mot hors des faits passe', PUR, '    return { ok: false, motif: `un mot hors des faits de la Maison : « ${m} »` };', '    continue;'],
  ['l echeance ouvree compte le dimanche', PUR, '    if (!h.joursOuverts.includes(c.jour) || minuteDuJour >= ferme) {', '    if (minuteDuJour >= ferme) {'],
  ['un assistant ne dort jamais', PUR, '  if (ecartMin > seuilMin) return', '  if (false) return'],
  ['le chien de garde previent a chaque passage', PUR, '  return !(Number.isFinite(prevenu) && prevenu >= vu);', '  return true;'],
  ['l heure dite oublie demain', PUR, '  if (dateISO === demain) return `demain ${h}`;\n', ''],
  ['les tournures interdites passent', PUR, '  for (const x of TOURNURES_INTERDITES) if (t.includes(retireLesAccents(x))) return x;\n', ''],
  ['l empreinte ne lit plus le jeton', PUR, "new TextEncoder().encode(String(jeton ?? '').trim())", "new TextEncoder().encode('')"],
  ['une tresse n est plus reconnue', PUR, '  return /tresse/.test(r) || /tresse|natte|vanille/.test(p);', '  return false;'],
  // la fonction
  ['sans porte, la fonction repond quand meme', SERVEUR, "    if (!porte) return refus('reserve-aux-assistants', 403);", "    if (!porte) return refus('reserve-aux-assistants', 200);"],
  ['la mauvaise porte passe', SERVEUR, "    if (porte.genre !== exige) return refus('mauvaise-porte', 403);", "    if (false) return refus('mauvaise-porte', 403);"],
  ['un jeton inconnu ouvre quand meme', SERVEUR, ".eq('empreinte', empreinte).maybeSingle()", '.limit(1).maybeSingle()'],
  ['l empeche est prevenu a chaque passage', SERVEUR, '    if (!(Number.isFinite(prevenu) && prevenu >= Date.parse(eveilleDepuis))) {', '    if (true) {'],
  ['le mot du relais n est plus filtre', SERVEUR, "    if (!juge.ok) return refus('mot-refuse', 400, { detail: juge.motif });", "    if (false) return refus('mot-refuse', 400, { detail: juge.motif });"],
  ['la tournure interdite passe dans une decision', SERVEUR, "  if (tournure) return refus('proposition-refusee', 400, { tournure });", "  if (false) return refus('proposition-refusee', 400, { tournure });"],
  ['une fiche inconnue est posee quand meme', SERVEUR, "  if (!fiche) return refus('fiche-inconnue', 404);", "  if (!fiche) fiche = { id: 'inconnue' };"],
  ['la meme pose se rejoue', SERVEUR, "    if (dejaLa?.rdv_id) return rendu({ verdict: 'deja', rdvId: dejaLa.rdv_id });", "    if (false) return rendu({ verdict: 'deja', rdvId: dejaLa?.rdv_id });"],
  ['la prise du jour de l autre est ignoree', SERVEUR, '    if (tenuePar && tenuePar.assistant !== moi.id) {', '    if (false) {'],
  ['un rendez-vous a venir n arrete plus la pose', SERVEUR, '    if (dejaUn) {', '    if (false) {'],
  ['la pose ne passe plus par le verrou de la base', SERVEUR, '  if (dansLaFenetre) {', '  if (false) {'],
  ['une place tenue nait confirmee', SERVEUR, "    status: tenue ? 'en attente' : 'confirmé', source: 'assistant',", "    status: 'confirmé', source: 'assistant',"],
  ['les tresses d Onyx ne previennent plus Opale', SERVEUR, "  if (tresses && moi.id !== 'opale') {", '  if (false) {'],
  ['le verrou optimiste ne compare plus', SERVEUR, '  if (Date.parse(ligne.updated_at) !== Date.parse(updatedAt)) return', '  if (false) return'],
  ['le jeton s ecrit en base a la place de l empreinte', SERVEUR, '  const empreinte = await empreinteDuJetonAssistant(jeton);', '  const empreinte = jeton;'],
  ['confirmer une place ne la confirme pas', SERVEUR, "    ? { ...rdv, status: 'confirmé', sansConfirmation: false, tenue: { ...rdv.tenue, confirmeeLe: maintenant } }", '    ? { ...rdv, tenue: { ...rdv.tenue, confirmeeLe: maintenant } }'],
  ['la confirmation officielle ne part plus', SERVEUR, "  if (choix === 'confirmer') deposes = await s.deposeLaConfirmationOfficielle(apres, maintenantMs);", '  if (false) deposes = await s.deposeLaConfirmationOfficielle(apres, maintenantMs);'],
  ['le journal passe par la mauvaise porte', SERVEUR, 'parNom, porte: PORTE_ASSISTANT,', "parNom, porte: 'trone',"],
  ['le journal porte le nom de la cliente', SERVEUR, "piece: `Rendez-vous ${heure}${prestation ? `, ${prestation}` : ''}`, branchId });", "piece: `Rendez-vous ${heure}, ${fiche.name ?? ''}`, branchId });"],
  ['la notification au porteur porte le mot du relais', SERVEUR, 'this.notifieLePorteur(r.pour, r.genre, r.heure ? { heure: r.heure } : undefined)', 'this.notifieLePorteur(r.pour, r.genre, { heure: `${r.heure ?? \'\'} ${r.mot ?? \'\'}` })'],
];

const greffon = (panne) => ({
  name: 'panne-en-memoire',
  setup(b) {
    if (!panne || !panne.fichier.endsWith('.ts')) return;
    const cible = path.join(racine, panne.fichier).replace(/\\/g, '/');
    b.onLoad({ filter: /\.ts$/ }, (args) => {
      if (args.path.replace(/\\/g, '/') !== cible) return undefined;
      return { contents: readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').replace(panne.avant, panne.apres), loader: 'ts' };
    });
  },
});

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-assistants-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  const fonction = path.join(dossier, 'assistants-maison.js');
  try {
    const f = await build({
      entryPoints: [path.join(racine, SERVEUR)],
      bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
      external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent', mainFields: ['module', 'main'], plugins: [greffon(panne)],
    });
    writeFileSync(fonction, f.outputFiles[0].text);
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-assistants.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon(panne)],
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8',
      env: { ...process.env, ASSISTANTS_FONCTION: fonction, ...(panne ? { ASSISTANTS_PANNE: JSON.stringify(panne) } : {}) },
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const present = (() => { try { return readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } })();
if (present !== await fichierAttendu(racine)) {
  console.log(`ECHEC ${CIBLE} a pris du retard sur le depot : node scripts/assistants-maison-serveur.mjs`);
  process.exit(1);
}
const net = await lance(null);
process.stdout.write(net.stdout ?? '');
if (net.status !== 0) { process.stderr.write(net.stderr ?? ''); process.exit(1); }
if (!prouve) process.exit(0);

let muettes = 0;
for (const [nom, fichier, avant, apres] of PANNES) {
  const texte = readFileSync(path.join(racine, fichier), 'utf8').replace(/\r\n/g, '\n');
  if (texte.split(avant).length !== 2) { muettes += 1; console.log(`MUETTE introuvable : ${nom}`); continue; }
  const r = await lance({ fichier, avant, apres });
  if (r.status === 0) { muettes += 1; console.log(`MUETTE ${nom}`); } else console.log(`CRIE  ${nom}`);
}
console.log(muettes === 0 ? `\nLa preuve tient : ${PANNES.length} pannes, le banc crie a chacune.` : `\n${muettes} panne(s) muette(s).`);
process.exit(muettes ? 1 : 0);
