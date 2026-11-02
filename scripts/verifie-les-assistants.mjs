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
const DEP = 'src/shared/assistants-depenses-pur.ts';
const FIC = 'src/shared/assistants-fiches-pur.ts';
const PUSH = 'supabase/functions/push-notify/index.ts';
const CHARTE = 'docs/ASSISTANTS.md';
const ONYX = 'scripts/onyx-installe.sh';
const SQL_SOIR = 'supabase/reglage_soir_des_assistants_20261102.sql';
const ECRAN = 'src/apps/trone/routes/pilotage/Assistants.tsx';
const SQL51 = 'supabase/migrations/0151_la_maison_intelligente.sql';

const PANNES = [
  // le cerveau pur
  ['une citation passe le filtre du mot', PUR, "  if (/[«»\"“”„]/.test(t)) return { ok: false, motif: 'des guillemets : un relais ne cite jamais' };\n", ''],
  ['un numero passe le filtre du mot', PUR, "  if (/\\d{8,}/.test(t.replace(/[\\s.-]/g, ''))) return { ok: false, motif: 'un numéro : la clé du numéro a son champ' };\n", ''],
  ['un mot hors des faits passe', PUR, '    return { ok: false, motif: `un mot hors des faits de la Maison : « ${m} »` };', '    continue;'],
  ['l echeance ouvree compte le dimanche', PUR, '    if (!h.joursOuverts.includes(c.jour) || minuteDuJour >= ferme) {', '    if (minuteDuJour >= ferme) {'],
  ['un assistant ne dort jamais', PUR, '  if (ecartMin > seuilDeSommeilMin(vu, maintenantMs, r)) {', '  if (false) {'],
  ['le chien de garde previent a chaque passage', PUR, '  return !(Number.isFinite(prevenu) && prevenu >= depuis);', '  return true;'],
  // la veille des reglages (2 novembre 2026)
  ['le seuil du sommeil redevient une constante', PUR, '  return (plusLong || Math.max(r.rythmeMin, r.rythmeSoirMin)) + MARGE_DE_SOMMEIL_MIN;', '  return 25;'],
  ['le soir prend le rythme du jour', PUR, '  return Math.floor(heure) >= r.soirDe ? r.rythmeSoirMin : r.rythmeMin;', '  return r.rythmeMin;'],
  ['la veille commence une heure trop tot', PUR, '  return h >= r.veilleDe && h < r.veilleA;', '  return h >= r.veilleDe - 1 && h < r.veilleA;'],
  ['la veille deborde apres minuit', PUR, '  return h >= r.veilleDe && h < r.veilleA;', '  return (h >= r.veilleDe && h < r.veilleA) || h === 0;'],
  ['le chien de garde oublie la grace du matin', PUR, '  const depuis = Math.max(vu, debutDeLaVeilleMs(maintenantMs, r));', '  const depuis = vu;'],
  ['le chien de garde crie entre deux tours du soir', PUR, '  const silenceMin = Math.max(r.silenceMin, seuilDeSommeilMin(depuis, maintenantMs, r));', '  const silenceMin = r.silenceMin;'],
  ['le chien de garde se tait au matin d une nuit deja prevenue', PUR, '  return !(Number.isFinite(prevenu) && prevenu >= depuis);', '  return !(Number.isFinite(prevenu) && prevenu >= vu);'],
  ['les cles du soir ne sont plus bornees', PUR, '    soirDe: n(r?.soirDe, REGLAGES_PAR_DEFAUT.soirDe, 0, 24),', '    soirDe: n(r?.soirDe, REGLAGES_PAR_DEFAUT.soirDe, -100, 100),'],
  ['le rythme du soir n est plus borne', PUR, '    rythmeSoirMin: n(r?.rythmeSoirMin, REGLAGES_PAR_DEFAUT.rythmeSoirMin, 5, 60),', '    rythmeSoirMin: n(r?.rythmeSoirMin, REGLAGES_PAR_DEFAUT.rythmeSoirMin, 0, 600),'],
  ['le defaut oublie le soir', PUR, 'soirDe: 18, rythmeSoirMin: 30, silenceMin: 45', 'soirDe: 24, rythmeSoirMin: 10, silenceMin: 45'],
  ['une tache de veille tombe sur l heure ronde', PUR, '    if (!m.includes(0) && !m.includes(30)) return m;', '    return m;'],
  ['la tache du soir ignore les heures reglees', PUR, 'champDesHeures(debutDuSoir, r.veilleA)', 'champDesHeures(18, 24)'],
  ['la nuit se dit endormie comme le jour', PUR, "      : { etat: 'endormi', detail: `au repos jusqu'à ${heureRondeDite(r.veilleDe)}, comme chaque nuit` };", "      : { etat: 'endormi', detail: `endormi depuis ${dureeDite(ecartMin)}` };"],
  ['la copie du chien de garde dans push-notify derive', PUSH, '  const depuis = Math.max(vu, debutDeLaVeilleMs(maintenantMs, r));', '  const depuis = vu;'],
  ['push-notify garde son ancienne version', PUSH, "const VERSION = '2026-11-02-a';", "const VERSION = '2026-10-31-a';"],
  ['l heure dite oublie demain', PUR, '  if (dateISO === demain) return `demain ${h}`;\n', ''],
  ['les tournures interdites passent', PUR, '  for (const x of TOURNURES_INTERDITES) if (t.includes(retireLesAccents(x))) return x;\n', ''],
  ['l empreinte ne lit plus le jeton', PUR, "new TextEncoder().encode(String(jeton ?? '').trim())", "new TextEncoder().encode('')"],
  ['une tresse n est plus reconnue', PUR, '  return /tresse/.test(r) || /tresse|natte|vanille/.test(p);', '  return false;'],
  // la fonction
  ['sans porte, la fonction repond quand meme', SERVEUR, "    if (!porte) return refus('reserve-aux-assistants', 403);", "    if (!porte) return refus('reserve-aux-assistants', 200);"],
  ['la mauvaise porte passe', SERVEUR, "    if (porte.genre !== exige) return refus('mauvaise-porte', 403);", "    if (false) return refus('mauvaise-porte', 403);"],
  ['un jeton inconnu ouvre quand meme', SERVEUR, ".eq('empreinte', empreinte).maybeSingle()", '.limit(1).maybeSingle()'],
  ['l empeche est prevenu a chaque passage', SERVEUR, '    if (!(Number.isFinite(prevenu) && prevenu >= Date.parse(eveilleDepuis))) {', '    if (true) {'],
  ['la serie du soir se rompt a chaque tour', SERVEUR, 'seuilDeSommeilMin(precedent, maintenantMs, reglages) * 60_000', '25 * 60_000'],
  ['l etat de l autre ignore les reglages', SERVEUR, 'etatDe(assistantDe(a), maintenantMs, reglages)', 'etatDe(assistantDe(a), maintenantMs)'],
  ['le passage ne rend plus les crons', SERVEUR, 'crons: cronsDeLaVeille(reglages) }', 'crons: [] }'],
  ['la version de la fonction ne bouge pas', SERVEUR, "const VERSION = '2026-11-02-b · le socle : cartes de tous les genres, Je suis loin, bilan du matin';", "const VERSION = '2026-11-02-a';"],
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
  // les dépenses du jour et la recherche d'une fiche (1er novembre 2026)
  ['un montant nul passe', DEP, '  if (!Number.isFinite(montant) || montant <= 0) return', '  if (!Number.isFinite(montant)) return'],
  ['une date future passe', DEP, "    if (d.date > aujourdhui) return { ok: false, motif: 'date-future' };\n", ''],
  ['une caisse rangee sert encore', DEP, "String(c.branchId ?? '') === branchId && !c.archiveeLe", "String(c.branchId ?? '') === branchId"],
  ['un porteur inconnu devient un second porteur', DEP, '  return parPrenom.length === 1 ? parPrenom[0] : null;', '  return parPrenom[0] ?? nom;'],
  ['un prestataire passe en depense', DEP, '    if (premier && mots.has(premier)) return nom;', '    if (false) return nom;'],
  ['une depense refusee compte encore comme doublon', DEP, "    if (e.validation?.etat === 'refusee') continue;\n", ''],
  ['le doublon ignore le montant', DEP, '    if (Math.round(Number(e.amountXof ?? -1)) !== n.amountXof) continue;\n', ''],
  ['l identifiant ne tient plus a la cle du geste', DEP, "encode(`${assistantId}|${String(idempotence ?? '').trim()}`)", 'encode(`${assistantId}|${Math.random()}`)'],
  ['un recu trop lourd passe', DEP, 'export const RECU_AU_PLUS_OCTETS = 5 * 1024 * 1024;', 'export const RECU_AU_PLUS_OCTETS = 500 * 1024 * 1024;'],
  ['le recu part ailleurs que dans les pieces jointes', DEP, "export const COMPARTIMENT_DES_RECUS = 'fil';", "export const COMPARTIMENT_DES_RECUS = 'recus';"],
  ['des initiales seules cherchent', FIC, '  if (lettres < 2 || !mots.some((m) => m.length >= 2)) return', '  if (lettres < 1) return'],
  ['plus de cinq fiches sortent', FIC, 'export const FICHES_AU_PLUS = 5;', 'export const FICHES_AU_PLUS = 50;'],
  ['un rendez-vous annule sort', FIC, "r.date >= aujourdhui && r.status !== 'annulé'", 'r.date >= aujourdhui'],
  ['un rendez-vous passe sort', FIC, "r.date >= aujourdhui && r.status !== 'annulé'", "r.status !== 'annulé'"],
  ['les accents empechent de trouver', FIC, "replace(/[aeiouycn]/g, '_')", "replace(/[q]/g, '_')"],
  ['la fiche rend sa note', FIC, '    numeros, rdvs: avenir,\n  };', '    numeros, rdvs: avenir, ...(d.note ? { note: d.note } : {}),\n  };'],
  ['la depense nait acquise', SERVEUR, "{ etat: 'attente', soumisLe: maintenant, soumisPar: moi.nom }, fichier);", "{ etat: 'validee', soumisLe: maintenant, soumisPar: moi.nom }, fichier);"],
  ['le meme geste se rejoue', SERVEUR, "  if (dejaLa) return rendu({ verdict: 'deja', id });", "  if (false) return rendu({ verdict: 'deja', id });"],
  ['le doublon n est plus cherche', SERVEUR, '  if (!v.autre) {', '  if (false) {'],
  ['le journal de la depense porte l objet', SERVEUR, 'piece: pieceDuJournal(v.montantXof, categorie), branchId });', 'piece: `${pieceDuJournal(v.montantXof, categorie)} ${v.objet}`, branchId });'],
  ['une fiche rangee sort', SERVEUR, 'trouvees.filter((r) => r.data?.archived !== true)', 'trouvees.filter(() => true)'],
  // les textes de la veille (2 novembre 2026), lus par le harnais
  ['la charte remet un /loop', CHARTE, '**jamais par `/loop`**', '`/loop 10m`'],
  ['la charte oublie les crons par defaut', CHARTE, 'Pour les réglages par défaut : `3-59/10 6-17 * * *` et `7,37 18-23 * * *`.', 'Pour les réglages par défaut : `*/10 6-17 * * *`.'],
  ['la charte garde sa version d hier', CHARTE, '*Version du 2 novembre 2026', '*Version du 1er novembre 2026'],
  ['la charte continue sur un autre fuseau', CHARTE, 'ne pose AUCUNE tâche de veille et ne fais pas ton passage', 'continue'],
  ['la charte pose sans CronList', CHARTE, "**Avant d'en poser, `CronList`**", '**Pose**'],
  ['la charte oublie la garde de l heure', CHARTE, "1. **La garde de l'heure, d'abord.**", '1. **Le tour.**'],
  ['la charte croit que le tour suivant part sous le selecteur', CHARTE, '7. **Le sélecteur tient la session.**', '7. Le tour suivant repart quand même.'],
  ['le lanceur d Onyx remet /loop', ONYX, 'jamais /loop).', '/loop 10m).'],
  ['le CLAUDE.md d Onyx ne renvoie plus a la charte', ONYX, 'puis pose la veille comme le disent les sections 3 et 14 de la charte : des tâches cron', 'puis commence la veille : des tâches cron'],
  ['le SQL du soir remplace au lieu de fusionner', SQL_SOIR, "coalesce(data->'assistants','{}'::jsonb) || '{\"soirDe\":18,\"rythmeSoirMin\":30}'::jsonb", "'{\"soirDe\":18,\"rythmeSoirMin\":30}'::jsonb"],
  ['la copie de repli du soir sans RLS', SQL_SOIR, 'alter table public.repli_mnd_settings_20261102_soir enable row level security;\n', ''],
  ["l ecran oublie le rythme du soir", ECRAN, "  { cle: 'rythmeSoirMin', libelle: 'Rythme du soir', unite: 'min', min: 5, max: 60 },\n", ''],
  ["l ecran juge l etat sans les reglages", ECRAN, 'const e = etatDe(a, maintenant, r);', 'const e = etatDe(a, maintenant);'],
  ['la recherche ne plafonne plus', SERVEUR, '  if ((lues ?? []).length >= LECTURES_PAR_JOUR) return', '  if (false) return'],
  ['la lecture n est plus tracee', SERVEUR, "  await s.journalise(moi.nom, { verbe: 'lit',", "  if (false) await s.journalise(moi.nom, { verbe: 'lit',"],
  ['le journal de la lecture porte le nom cherche', SERVEUR, 'piece: pieceDeLaLecture(fiches.length),', 'piece: `${pieceDeLaLecture(fiches.length)} ${chaine(d.nom)}`,'],
  // le socle de la Maison intelligente (2 novembre 2026)
  ['la notification du tour part la nuit', PUR, 'export const notificationPermise = (heureCotonou: number): boolean => heureCotonou >= NOTIFICATIONS_DE && heureCotonou < NOTIFICATIONS_A;', 'export const notificationPermise = (heureCotonou: number): boolean => true;'],
  ['le passage notifie sans regarder l heure', SERVEUR, 'if (mode.loin && cartesNouvelles > 0 && notificationPermise(aCotonou(maintenantMs).heure)) {', 'if (mode.loin && cartesNouvelles > 0) {'],
  ['le tour notifie aussi quand le porteur est la', SERVEUR, 'if (mode.loin && cartesNouvelles > 0 && notificationPermise(', 'if (cartesNouvelles > 0 && notificationPermise('],
  ['deux passages du meme tour notifient deux fois', SERVEUR, '    if (!(Number.isFinite(dejaPrevenu) && maintenantMs - dejaPrevenu < UN_TOUR_AU_MOINS_MS)) {', '    if (true) {'],
  ['le passage ne dit plus le mode', SERVEUR, 'veille, mode, notifieCartes, relais', 'veille, notifieCartes, relais'],
  ['un passage efface le mode loin', SERVEUR, ".update({ vu_le: maintenant, eveille_depuis: eveilleDepuis, etat }).eq('id', moi.id);", ".update({ vu_le: maintenant, eveille_depuis: eveilleDepuis, etat, loin_depuis: null }).eq('id', moi.id);"],
  ['loin, chaque carte notifie', SERVEUR, '  if (d.notifier === true && !mode.loin) sent =', '  if (d.notifier === true) sent ='],
  ['le prive passe hors du mode loin', SERVEUR, "    if (!mode.loin) return refus('prive-hors-loin', 409,", "    if (false) return refus('prive-hors-loin', 409,"],
  ['le prive trop long passe', PUR, '  if (message.length > PRIVE_MESSAGE_AU_PLUS) return', '  if (false) return'],
  ['le prive survit a la decision', SERVEUR, 'texte_modifie: texte, ...effaceLePrive(dec, maintenant),', 'texte_modifie: texte,'],
  ['le passage rend le prive', SERVEUR, "  faits: (l.faits ?? null) as Decision['faits'],\n});", "  faits: (l.faits ?? null) as Decision['faits'], prive: l.prive,\n} as Decision);"],
  ['une carte de rendez-vous sans numero passe', PUR, "      if (!cle) return { ok: false, motif: 'le numéro de la cliente' };\n", ''],
  ['une carte de depense sans cle passe', PUR, "      if (!cle) return { ok: false, motif: 'la clé du message' };\n", ''],
  ['les faits de la carte ne sont plus relus', SERVEUR, '  let faits = (lusFaits.faits ?? null) as Corps | null;', '  let faits = (d.faits ?? null) as Corps | null;'],
  ['la carte de depense n est plus controlee au depot', SERVEUR, '    if (!c.ok) return c.refus;\n    faits = {', '    faits = {'],
  ['la depense de la carte nait a valider', SERVEUR, "const validation = { etat: 'validee', soumisLe: maintenant, soumisPar: sien.nom, decidePar: qui.nom, decideLe: maintenant };", "const validation = { etat: 'attente', soumisLe: maintenant, soumisPar: sien.nom };"],
  ['la depense de la carte est decidee par l assistant', SERVEUR, 'soumisPar: sien.nom, decidePar: qui.nom,', 'soumisPar: sien.nom, decidePar: sien.nom,'],
  ['la meme depense se pose deux fois par deux cartes', SERVEUR, '  const id = await idDeLaDepense(sien.id, f.cle);', '  const id = await idDeLaDepense(sien.id, `${f.cle}:${dec.id}`);'],
  ['un refus tranche quand meme la carte', SERVEUR, '  const c = await controleLaDepense(s, sien, lue.v);\n  if (!c.ok) return c.refus;', '  const c = await controleLaDepense(s, sien, lue.v);\n  if (!c.ok) { await trancheLaCarte(); return c.refus; }'],
  ['corriger ignore la correction', SERVEUR, "  const lus = faitsDeLaCarte('depense', { ...avant, ...corrections });", "  const lus = faitsDeLaCarte('depense', { ...avant });"],
  ['non pose quand meme la depense', SERVEUR, "  if (choix === 'non') { await trancheLaCarte(); return rendu({ id: dec.id, choix }); }\n", ''],
  ['loin bascule les assistants des autres', SERVEUR, '    return a.porteur_user_id === qui.userId && !!p && passeAuTrone(p);', '    return !!p && passeAuTrone(p);'],
  ['loin bascule une fonction', SERVEUR, '    return a.porteur_user_id === qui.userId && !!p && passeAuTrone(p);', '    return a.porteur_user_id === qui.userId;'],
  ['loin touche une seconde fois remet l heure', SERVEUR, 'const depuis = loin ? (modeDe(a.loin_depuis).loinDepuis ?? maintenant) : null;', 'const depuis = loin ? maintenant : null;'],
  ['le bilan accepte demain', SERVEUR, '  if (lu.bilan.jour > aujourdhui || lu.bilan.jour < plusAncien) return', '  if (lu.bilan.jour < plusAncien) return'],
  ['le bilan double au lieu de remplacer', SERVEUR, 'const id = `${moi.id}:${lu.bilan.jour}`;', 'const id = `${moi.id}:${lu.bilan.jour}:${Math.random()}`;'],
  ['le bilan accepte un compte inconnu', PUR, "    if (!(COMPTES_DU_BILAN as readonly string[]).includes(k)) return { ok: false, motif: `un compte inconnu : ${k.slice(0, 20)}` };\n", ''],
  ['le mot du bilan cite', PUR, '    const r = resumeEstPropre(mot);\n    if (!r.ok) return { ok: false, motif: r.motif };\n', ''],
  ['la migration oublie un genre de carte', SQL51, "  'rdv', 'depense', 'publication', 'planning', 'acces'));", "  'rdv', 'depense', 'publication', 'planning'));"],
  ['la migration oublie le relais signal', SQL51, "  'signal', 'a-faire'));", "  'a-faire'));"],
  ['les bilans sans RLS', SQL51, 'alter table public.assistants_bilans enable row level security;\n', ''],
  ['le prive sans borne en base', SQL51, "and coalesce(length(prive->>'message'), 0) <= 1200));", 'and true));'],
  ['le prive n est plus efface la nuit', SQL51, "and (tranchee is not null or cree_le < now() - interval '7 days');", "and false;"],
  ['la charte oublie le bilan du matin', CHARTE, 'bilan deposer --jour 2026-11-01 --lus 12', 'bilan --jour 2026-11-01 --lus 12'],
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
