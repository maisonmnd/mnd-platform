import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './assistant-maison-serveur.mjs';

/* L'ASSISTANT AU SERVEUR, EPROUVE — 27 octobre 2026.
   `node scripts/verifie-l-assistant-au-serveur.mjs` : le fichier a coller
   doit etre a jour avec le depot (sinon : node scripts/assistant-maison-serveur.mjs),
   puis la fonction, regroupee depuis les sources du moment, tourne contre
   une base simulee (verifie-l-assistant-au-serveur.harnais.ts).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier
   source (copie gardee, restauration dans un finally, empreintes
   comparees), et le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-l-assistant-au-serveur');
  mkdirSync(dossier, { recursive: true });
  try {
    const fonction = path.join(dossier, 'assistant-maison.ts');
    writeFileSync(fonction, await fichierAttendu(racine));
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-l-assistant-au-serveur.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, ASSISTANT_FONCTION: fonction } });
  } catch (e) {
    return { status: 1, stdout: `ECHEC construction : ${String(e?.message ?? e).slice(0, 300)}\n`, stderr: '' };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const SERVEUR = 'scripts/serveur/assistant-maison.ts';
const PASSAGE = 'src/shared/assistant-passage-pur.ts';
const PANNES = [
  ['le GET lit la base', SERVEUR, "  if (req.method === 'GET') return json({ fonction: 'assistant-maison', version: VERSION });\n", ''],
  ['une cle quelconque acceptee', SERVEUR, 'if (!service || cleRecue !== service) return json(', 'if (!service) return json('],
  ['deux passages le meme jour', SERVEUR, "r.mode !== 'eteint' && avant.passageLe !== aujourdhui && h >= HEURE_DU_PASSAGE_DE", "r.mode !== 'eteint' && h >= HEURE_DU_PASSAGE_DE"],
  ['le passage la nuit', SERVEUR, '&& h >= HEURE_DU_PASSAGE_DE && h < HEURE_DU_PASSAGE_A;', ';'],
  /* Les deux gardes (lignesNeuves et ignoreDuplicates) suffisent chacune : la faute les retire ensemble. */
  ['une ligne retenue repart', SERVEUR, `    const neuves = lignesNeuves(lignesDuPassage({ cerveau, plan: leurPlan, reglagesGerard, maintenantMs, branchId: b.id, regles }), existantes);
    if (neuves.length === 0) continue;
    /* Jamais une ligne existante réécrite : un second passage ne remet rien « en attente ». */
    const { error } = await sb.from('envois').upsert(neuves.map((l) => ({ id: l.id, branch_id: l.branchId, data: l })), { onConflict: 'id', ignoreDuplicates: true });`,
  `    const neuves = lignesDuPassage({ cerveau, plan: leurPlan, reglagesGerard, maintenantMs, branchId: b.id, regles });
    if (neuves.length === 0) continue;
    const { error } = await sb.from('envois').upsert(neuves.map((l) => ({ id: l.id, branch_id: l.branchId, data: l })), { onConflict: 'id' });`],
  ['le jour creux passe remise quand meme', SERVEUR, 'if (l.codeAFaire.jusquau < aujourdhui) {', 'if (false) {'],
  ['les heures devinees', SERVEUR, 'if (!Array.isArray(reglages?.hours) || reglages!.hours.length === 0) {', 'if (false) {'],
  ['le passage note malgre une erreur', SERVEUR, 'if (rapport.erreurs.length === 0) {', 'if (true) {'],
  ['WhatsApp part sans approbation de Meta', PASSAGE, "} else if (s.canal === 'whatsapp' && partSeulSurWhatsApp(r, s.modele)) {", "} else if (s.canal === 'whatsapp') {"],
  ['la notification au mauvais compte', PASSAGE, 'compte: o.cerveau.compteDe(s.clientId),', 'compte: s.clientId,'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  let present = '';
  try { present = readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
  const aJour = present === await fichierAttendu(racine);
  console.log(aJour ? 'OK    le fichier a coller est a jour avec le depot' : `ECHEC le fichier a coller a pris du retard : node scripts/assistant-maison-serveur.mjs`);
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = aJour && r.status === 0 ? 0 : 1;
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
