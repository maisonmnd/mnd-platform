import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* « ENVOYER MAINTENANT », EPROUVE - 18 novembre 2026.
   `node scripts/verifie-envoyer-maintenant.mjs` : le banc, dans un processus
   fils (le paquet s'ecrit sous node_modules/.cache et s'efface dans un
   finally).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Jamais dans l'arbre commun : une copie propre
   detachee seulement (docs/MISE-EN-LIGNE.md). */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-envoyer-maintenant');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-envoyer-maintenant.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/envoyer-maintenant-pur.ts';
const GERARD = 'src/shared/gerard-pur.ts';
const ACCORD = 'src/shared/accord-whatsapp-pur.ts';
const PASSAGE = 'src/shared/assistant-passage-pur.ts';
const AUJOURDHUI = 'src/shared/assistant-aujourdhui-pur.ts';
const ECRAN = 'src/apps/trone/routes/clients/Gerard.tsx';
const DEPOT = 'src/apps/trone/routes/clients/envoyer-maintenant.ts';
const PANNES = [
  /* Le bouton n'apparait que sur une ligne qui attend son heure. */
  ['le bouton sur une ligne deja en salle', PUR, '  if (o.dejaUneLigne) return { bouton: false };\n', ''],
  ['le bouton sur un modele pas approuve chez Meta', PUR, '  if (!partSeule(s, r)) return { bouton: false };\n', ''],
  ['le bouton ouvert sans numero', PUR, '  if (!numeroWa(o.telephone)) return ferme(RAISON_DU_MAINTENANT.sansNumero);\n', ''],
  /* L'accord refuse ferme le bouton. */
  ['l accord refuse ignore', PUR, '  if (demandeLAccord(s.genre) && !o.fiche.accord) {', '  if (false) {'],
  ['le refus dit comme l absence', PUR, "o.nouvelles?.oui === false ? RAISON_DU_MAINTENANT.accordRefuse : RAISON_DU_MAINTENANT.sansAccord", 'RAISON_DU_MAINTENANT.sansAccord'],
  ['la carte demande l accord', PUR, "boolean => !EST_UN_SERVICE[genre] && genre !== 'anniversaire';", 'boolean => !EST_UN_SERVICE[genre];'],
  ['le stop ignore', PUR, '  if (!EST_UN_SERVICE[s.genre] && (o.fiche.stop || o.destinataire?.stop)) return ferme(RAISON_DU_MAINTENANT.stop);\n', ''],
  ['le stop du parent ignore', PUR, '(o.fiche.stop || o.destinataire?.stop)', '(o.fiche.stop)'],
  /* Le plafond des deux nouvelles par mois tient. */
  ['la promesse ignoree', PUR, '  if (!EST_UN_SERVICE[s.genre] && !promesseDe(o.fiche, o.aujourdhui).tenue) return ferme(RAISON_DU_MAINTENANT.promesse);\n', ''],
  ['la promesse ferme garder', PUR, '  if (!EST_UN_SERVICE[s.genre] && !promesseDe(o.fiche, o.aujourdhui).tenue)', '  if (!promesseDe(o.fiche, o.aujourdhui).tenue)'],
  ['la carte ne compte pas dans la promesse', ACCORD, "'avant', 'envie', 'place', 'anniversaire', 'carte', 'carte-foyer',", "'avant', 'envie', 'place', 'carte-foyer',"],
  /* La ligne : celle du passage, maintenant, malgre les heures calmes. */
  ['la ligne garde l heure du passage', PUR, '  const partie = envoieMaintenant(duPassage, o.maintenantMs);', '  const partie = duPassage;'],
  ['la ligne prend une autre cle', PUR, '  return { ...partie, parLaMain: true,', '  return { ...partie, id: `${partie.id}-maintenant`, parLaMain: true,'],
  ['la ligne sans signature', PUR, ", envoyeMaintenantPar: o.qui, envoyeMaintenantLe:", ", envoyeMaintenantPar: '', envoyeMaintenantLe:"],
  ['le geste du journal sans nom', PUR, '    parNom: qui.nom,', "    parNom: '',"],
  /* Le passage suivant ne la renvoie pas. */
  ['le passage redepose une cle deja au journal', PASSAGE, 'lignes.filter((l) => !existantes.has(l.id));', 'lignes.filter(() => true);'],
  ['une ligne en attente ne compte pas au lendemain', GERARD, "if (!pasMaintenant && (e.statut === 'écarté' ||", "if (!pasMaintenant && (e.statut === 'en-attente' || e.statut === 'écarté' ||"],
  ['la carte fetee deux fois', GERARD, "  if (traceDe(f, ['anniversaire']).some((t) => t.quand.slice(0, 4) === anniv.slice(0, 4))) return vu('deja');\n", ''],
  ['un echec compte comme parti', GERARD, "e.statut === 'périmé' || e.statut === 'échec' ||", "e.statut === 'périmé' ||"],
  /* L'ecran, le depot. */
  ['envoyee maintenant, la ligne dit le passage du matin', AUJOURDHUI, "  if (etat === 'en-salle' && e?.parLaMain) return quandIlPart(e, maintenantMs) || 'part à l’instant';\n", ''],
  ['l ecran oublie la ligne deja en salle', ECRAN, 'dejaUneLigne: !!l.envoi,', 'dejaUneLigne: false,'],
  ['l ecran montre le bouton sans la porte', ECRAN, '{porteMaintenant.bouton && (porteMaintenant.ouvert ? (', '{(porteMaintenant.bouton || true) && (porteMaintenant.bouton ? ('],
  ['l ecran tait la raison', ECRAN, 'Envoyer maintenant est fermé : {porteMaintenant.raison}.', 'Envoyer maintenant est fermé.'],
  ['la cle prise reste en plan', ECRAN, "        const v = await gesteDeLaSalle(id, 'envoyer', qui, regles);", "        const v = 'trop-tard' as 'fait' | 'trop-tard' | 'panne';"],
  ['le depot ecrase la ligne', DEPOT, ".from('envois').insert({ id, branch_id: ligne.branchId, data: ligne })", ".from('envois').upsert({ id, branch_id: ligne.branchId, data: ligne })"],
  ['le depot sans facteur', DEPOT, "  if (!facteurVivant((facteur?.data as { vuLe?: string } | null)?.vuLe, Date.now())) return { issue: 'facteur-muet', id };\n", ''],
  ['le depot sans journal', DEPOT, '  void inscrisLesGestes([gesteDuMaintenant(ligne, identiteCourante(), o.cerveau.nomDe(o.situation.clientId))]);\n', ''],
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
