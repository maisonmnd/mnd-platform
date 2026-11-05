import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './assistants-maison-serveur.mjs';

/* UNE CONSIGNE AUX ASSISTANTS, EPROUVEE - 5 novembre 2026 (lot 1), sur le modele de verifie-les-assistants.mjs.
   `node scripts/verifie-les-consignes.mjs` : le fichier de la fonction assistants-maison doit etre a
   jour avec le depot, puis le harnais (verifie-les-consignes.harnais.ts) tourne : le module pur, la
   fonction regroupee depuis les sources du moment contre une base simulee, la ligne de commande, le
   guetteur lance pour de vrai contre un serveur local, le cablage.
   `--prouve` : chaque panne est posee EN MEMOIRE (les modules par un greffon d esbuild, les textes lus
   par le harnais, les scripts lances par une copie hors de l arbre), jamais sur le disque du depot.
   Le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/shared/consignes-pur.ts';
const CONTRAT = 'src/shared/assistants-pur.ts';
const SERVEUR = 'scripts/serveur/assistants-maison.ts';
const CLI = 'scripts/assistants-maison.mjs';
const GUET = 'scripts/guetteur-des-consignes.mjs';
const SQL = 'supabase/migrations/0162_les_consignes_aux_assistants.sql';
const ECRAN = 'src/apps/trone/routes/pilotage/Assistants.tsx';
const CARTE = 'src/apps/trone/routes/pilotage/ConsigneAuxAssistants.tsx';
const CSS = 'src/apps/trone/routes/pilotage/consignes.css';
const CHARTE = 'docs/ASSISTANTS.md';
const MAQUETTE = 'public/maquette-consigne-aux-assistants.html';

const PANNES = [
  // le cerveau pur
  ['une consigne lue redevient nouvelle', PUR, "export const STATUTS_NOUVEAUX: readonly StatutDeConsigne[] = ['envoyee', 'passee'];", "export const STATUTS_NOUVEAUX: readonly StatutDeConsigne[] = ['envoyee', 'passee', 'lue'];"],
  ['defaire tient deux heures', PUR, 'export const DEFAIRE_PENDANT_MS = 60 * 60_000;', 'export const DEFAIRE_PENDANT_MS = 120 * 60_000;'],
  ['un defaire deja fait se refait', PUR, "  if (c.statut !== 'faite' || c.defaiteLe) return false;", "  if (c.statut !== 'faite') return false;"],
  ['le deplacement revient sans regarder ou il est', PUR, "      if (lu.date !== g.apres.date || lu.time !== g.apres.time) {", '      if (false) {'],
  ['la note perd toutes ses lignes', PUR, '    lignes.splice(i, 1);', '    lignes.splice(0, lignes.length);'],
  ['un rendez-vous absent passe pour defait', PUR, "    if (!lu) { pourquoi.push('le rendez-vous n’est pas encore sur ce poste : relisez le Carnet, puis recommencez'); continue; }", '    if (!lu) continue;'],
  ['un genre de geste inconnu passe', PUR, "    return { ok: false, motif: 'un genre de geste inconnu' };", '    continue;'],
  ['defaire avec un oui passe', PUR, "  if (d.gestes.length && (statut !== 'faite' || o.actuel === 'oui-attendu')) return", "  if (d.gestes.length && statut !== 'faite') return"],
  ['une consigne faite se rouvre', PUR, "  const ouvert = (STATUTS_OUVERTS as readonly string[]).includes(o.actuel);", "  const ouvert = o.actuel !== 'oui-attendu';"],
  ['le oui attendu sans sa carte passe', PUR, "  if (statut === 'oui-attendu' && !decisionId) return", "  if (false) return"],
  ['une consigne faite se passe', PUR, "export const STATUTS_OUVERTS: readonly StatutDeConsigne[] = ['envoyee', 'passee', 'lue', 'en-attente'];", "export const STATUTS_OUVERTS: readonly StatutDeConsigne[] = ['envoyee', 'passee', 'lue', 'en-attente', 'faite'];"],
  ['le guetteur reste frais dix minutes', PUR, 'export const GUETTEUR_FRAIS_MS = 3 * 60_000;', 'export const GUETTEUR_FRAIS_MS = 10 * 60_000;'],
  ['l assistant pas relie ne le dit plus', PUR, '`${p.nom} n’est pas encore ${accorde(p.id, \'relié\')}, sa consigne attend.`', '`${p.nom} attend.`'],
  ['la date entiere perd son annee', PUR, ' ${MOIS_LONGS[d.getUTCMonth()]} ${d.getUTCFullYear()} à ${h}`;', ' ${MOIS_LONGS[d.getUTCMonth()]} à ${h}`;'],
  ['la ligne du guetteur change de forme', PUR, 'export const ligneDuGuetteur = (c: { id: string; pour: string; texte: string }): string => `consigne ${c.id} pour ${c.pour} : ${debutDuTexte(c.texte)}`;', 'export const ligneDuGuetteur = (c: { id: string; pour: string; texte: string }): string => `consigne ${c.id} : ${debutDuTexte(c.texte)}`;'],
  ['les statuts des consignes oublient en-attente', PUR, "export const STATUTS_DE_CONSIGNE = ['envoyee', 'lue', 'faite', 'oui-attendu', 'passee', 'en-attente'] as const;", "export const STATUTS_DE_CONSIGNE = ['envoyee', 'lue', 'faite', 'oui-attendu', 'passee'] as const;"],
  // le contrat
  ['le contrat oublie consigne.passer', CONTRAT, "  'consigne.lire', 'consigne.repondre', 'consigne.passer',", "  'consigne.lire', 'consigne.repondre',"],
  // la fonction
  ['la fonction garde son ancienne version', SERVEUR, "const VERSION = '2026-11-05-a · une consigne", "const VERSION = '2026-11-03-a · une consigne"],
  ['regarder marque quand meme', SERVEUR, '  const marquer = d.marquer !== false;', '  const marquer = true;'],
  ['lire rend les consignes des autres', SERVEUR, ".from('assistants_consignes').select('*').eq('pour', moi.id).in('statut', [...STATUTS_A_LIRE])", ".from('assistants_consignes').select('*').in('statut', [...STATUTS_A_LIRE])"],
  ['le guetteur n est plus note', SERVEUR, "  try { await s.sb.from('assistants').update({ guette_le: maintenant }).eq('id', moi.id); } catch { /* la colonne manque avant 0162 */ }", ''],
  ['repondre a la consigne d un autre', SERVEUR, "  if (c.pour !== moi.id) return refus('pas-a-toi', 403);\n  const juge = reponseDeConsigne(", '  const juge = reponseDeConsigne('],
  ['la carte d un autre assistant passe', SERVEUR, "    if ((dec as { assistant?: string }).assistant !== moi.id) return refus('pas-ta-carte', 403);\n", ''],
  ['le oui attendu ne notifie plus', SERVEUR, "  if (r.statut === 'oui-attendu' && !c.notifie_le) {", '  if (false) {'],
  ['une consigne faite notifie aussi', SERVEUR, "  if (r.statut === 'oui-attendu' && !c.notifie_le) {", '  if (!c.notifie_le) {'],
  ['la notification sonne la nuit', SERVEUR, '    if (!notificationPermise(aCotonou(maintenantMs).heure)) nuit = true;', '    if (false) nuit = true;'],
  ['l auteur n est plus prevenu', SERVEUR, '      const comptes = [...new Set([moi.porteur_user_id, c.de_user_id].filter((x): x is string => !!x))];', '      const comptes = [moi.porteur_user_id].filter((x): x is string => !!x);'],
  ['la notification porte le texte', SERVEUR, '      const { titre, corps } = notificationDuOui(moi.nom);', '      const { titre } = notificationDuOui(moi.nom); const corps = c.texte;'],
  ['passer a soi-meme', SERVEUR, "  const pourId = chaine(d.pour).toLowerCase();\n  if (!pourId || pourId === moi.id) return refus('pour-invalide');", "  const pourId = chaine(d.pour).toLowerCase();\n  if (!pourId) return refus('pour-invalide');"],
  ['passer garde la lecture de l ancien', SERVEUR, "passee_mot: mot || null, lue_le: null,", 'passee_mot: mot || null,'],
  ['le deplacement ne rend plus son defaire', SERVEUR, ', defaire: defaireDuDeplacement(v.ligne.id, { date: avant.date, time: avant.time }, { date, time }) });', ' });'],
  ['la pose ne rend plus son defaire', SERVEUR, ", defaire: defaireDeLaPose(rdvId) });", ' });'],
  ['la note ne rend plus son defaire', SERVEUR, '  return rendu({ rdvId, defaire: defaireDeLaNote(rdvId, ajout) });', '  return rendu({ rdvId });'],
  ['le journal de la fonction porte le texte', SERVEUR, "  dis('consigne', { par: moi.id, statut: r.statut, gestes: r.gestes.length, notifie });", "  dis('consigne', { par: moi.id, statut: r.statut, texte: c.texte });"],
  // la ligne de commande et le guetteur
  ['la ligne de commande marque en regardant', CLI, "      return options.regarder === true ? { action: 'consigne.lire', marquer: false } : { action: 'consigne.lire' };", "      return { action: 'consigne.lire' };"],
  ['l aide oublie consigne repondre', CLI, '  consigne repondre --id <id> --statut faite|oui-attendu|en-attente --reponse "..."', '  consigne repondre --id <id>'],
  ['le guetteur marque', GUET, "      body: JSON.stringify({ action: 'consigne.lire', marquer: false }),", "      body: JSON.stringify({ action: 'consigne.lire' }),"],
  ['le guetteur se repete', GUET, '        if (vues.has(cle)) continue;\n', ''],
  ['le guetteur dit aussi les consignes lues', GUET, '        if (!c || c.nouvelle !== true || typeof c.id !== \'string\') continue;', "        if (!c || typeof c.id !== 'string') continue;"],
  ['le guetteur ecrit le jeton', GUET, "const sortie = (ligne) => process.stdout.write(`${masque(ligne)}\\n`);", "const sortie = (ligne) => process.stdout.write(`${ligne} ${jetonLu}\\n`);"],
  ['le guetteur crie a chaque tour de panne', GUET, '      if (enPanne !== r.motif) souci(', '      if (true) souci('],
  // la base
  ['la table sans RLS', SQL, 'alter table public.assistants_consignes enable row level security;\n', ''],
  ['ecrire au nom d un autre', SQL, '    and de_user_id = auth.uid()\n', ''],
  ['la base oublie un statut', SQL, "    'envoyee', 'lue', 'faite', 'oui-attendu', 'passee', 'en-attente')),", "    'envoyee', 'lue', 'faite', 'oui-attendu', 'passee')),"],
  ['une consigne s efface', SQL, '-- Pas de politique DELETE : une consigne ne s\'efface pas.', "create policy assistants_consignes_effacer on public.assistants_consignes for delete to authenticated using (public.is_souverain());"],
  ['la colonne du guetteur manque', SQL, 'alter table public.assistants add column if not exists guette_le timestamptz;', ''],
  // l ecran, la charte, la maquette
  ['la carte n est plus sur l ecran', ECRAN, '      {(!monProfil || estSouverain) && <ConsigneAuxAssistants decisions={decisions} ouvrirLaCarte={ouvrirLaCarte} />}', ''],
  ['la carte ouverte a tous', ECRAN, '      {(!monProfil || estSouverain) && <ConsigneAuxAssistants', '      {<ConsigneAuxAssistants'],
  ['defaire par la fonction', CARTE, '      setAppts((prev) => prev.map((a) => {', '      void appelleLaPorteDuSouverain; setAppts((prev) => prev.map((a) => {'],
  ['un vert sur la carte', CSS, '.csg-pastille.est-fait { background: var(--indigo-50, #E7E8F2); color: var(--color-indigo); }', '.csg-pastille.est-fait { background: #0A7A6C; color: white; }'],
  ['la charte oublie le guetteur', CHARTE, 'node <dépôt>/scripts/guetteur-des-consignes.mjs', 'node <dépôt>/scripts/guetteur.mjs'],
  ['la maquette n est plus marquee construite', MAQUETTE, '<span class="sourcil">Maquette construite, lot 1 · Direction', '<span class="sourcil">Maquette · Direction'],
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-consignes-'));
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
      entryPoints: [path.join(racine, 'scripts/verifie-les-consignes.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon(panne)],
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, CONSIGNES_FONCTION: fonction, ...(panne ? { CONSIGNES_PANNE: JSON.stringify(panne) } : {}) },
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
