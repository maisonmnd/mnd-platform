import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES FORMULES FERMÉES À LA VENTE, ÉPROUVÉES — 10 octobre 2026.
   `node scripts/verifie-les-formules-fermees.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, 10 octobre 2026 : « Fermer aujourd'hui » les six
   formules à 0 F ; une formule fermée ne se vend plus, ses contrats continuent. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-formules-fermees-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-formules-fermees.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    }).then(() => spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' }))
      .finally(() => rmSync(dossier, { recursive: true, force: true }));
  } catch (e) {
    rmSync(dossier, { recursive: true, force: true });
    throw e;
  }
}

const PANNES = [
  ['une formule jamais touchee passe pour fermee', 'src/shared/formules-fermees-pur.ts', 'export const estOuverteALaVente = (p: { fermee?: boolean }): boolean => p.fermee !== true;', 'export const estOuverteALaVente = (p: { fermee?: boolean }): boolean => p.fermee === false;'],
  ['le menu perd la formule deja choisie', 'src/shared/formules-fermees-pur.ts', '): T[] => plans.filter((p) => estOuverteALaVente(p) || p.id === choisie);', '): T[] => plans.filter((p) => estOuverteALaVente(p));'],
  ['le menu laisse passer toutes les fermees', 'src/shared/formules-fermees-pur.ts', '): T[] => plans.filter((p) => estOuverteALaVente(p) || p.id === choisie);', '): T[] => plans.filter((p) => p.id !== undefined || p.id === choisie);'],
  ['rouvrir efface au lieu d ecrire false', 'src/shared/formules-fermees-pur.ts', '    : { ...p, fermee: false, fermeeLe: undefined };', '    : { ...p, fermee: undefined, fermeeLe: undefined };'],
  ['la fermeture d office referme une formule rouverte', 'src/shared/formules-fermees-pur.ts', "    if (!six.has(p.id) || p.fermee !== undefined || !sansPrix(p)) return p;", "    if (!six.has(p.id) || p.fermee === true || !sansPrix(p)) return p;"],
  ['la fermeture d office ferme une formule qui a recu un prix', 'src/shared/formules-fermees-pur.ts', "    if (!six.has(p.id) || p.fermee !== undefined || !sansPrix(p)) return p;", "    if (!six.has(p.id) || p.fermee !== undefined) return p;"],
  ['la fermeture d office ferme toute formule a 0 F', 'src/shared/formules-fermees-pur.ts', "    if (!six.has(p.id) || p.fermee !== undefined || !sansPrix(p)) return p;", "    if (p.fermee !== undefined || !sansPrix(p)) return p;"],
  ['un prix par calibre a 0 compte pour un prix', 'src/shared/formules-fermees-pur.ts', '  && !Object.values(p.prixParCalibre ?? {}).some((v) => Number(v) > 0);', '  && !Object.values(p.prixParCalibre ?? {}).some((v) => Number(v) >= 0);'],
  ['une des six mal recopiee', 'src/shared/formules-fermees-pur.ts', "  'mlaZXBKRR4to793TZ47U', // KÚNDO™ Annuel · Pack Prestige", "  'mlaZXBKRR4to793TZ47V', // KÚNDO™ Annuel · Pack Prestige"],
  ['Ma Couronne propose encore les fermees', 'src/shared/abonnements.ts', '  const ouvertes = ouvertesALaVente(plans);', '  const ouvertes = plans.slice();'],
  ['le comptoir vend encore les fermees', 'src/apps/trone/routes/equipe/Abonnements.tsx', '                {choixDeVente(plans, subForm.planId).map((p) => {', '                {plans.map((p) => {'],
  ['la nouvelle vente part d une fermee', 'src/apps/trone/routes/equipe/Abonnements.tsx', "    setSubForm({ clientId: '', planId: premiereOuverte(plans)?.id ?? '',", "    setSubForm({ clientId: '', planId: plans[0]?.id ?? '',"],
  ['la carte de la Maison fait defiler les fermees', 'src/apps/carte/App.tsx', '            plans={gardeSurLaCarte(ouvertesALaVente(plans), reglages.formulesMasquees)}', '            plans={gardeSurLaCarte(plans, reglages.formulesMasquees)}'],
  ['le Trone ne lance pas la fermeture', 'src/apps/trone/main.tsx', 'migreLesFormulesAZero();\n', 'void 0;\n'],
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
  let muettes = 0;
  for (const [nom, fichier, a, b] of PANNES) {
    const p = path.join(racine, fichier);
    const brut = readFileSync(p, 'utf8');
    try {
      const s = brut.replace(/\r\n/g, '\n');
      if (s.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const faute = s.replace(a, b);
      writeFileSync(p, brut.includes('\r\n') ? faute.replace(/\n/g, '\r\n') : faute);
      const r = await lanceLeBanc();
      const crie = r.status !== 0 && /ECHEC/.test(r.stdout || '');
      console.log(`${crie ? 'CRIE ' : 'MUET '} ${nom}`);
      if (!crie) muettes++;
    } finally {
      writeFileSync(p, brut);
    }
  }
  const apres = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const identiques = fichiers.every((f) => avant[f] === apres[f]);
  console.log(identiques ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier differe apres la preuve.');
  console.log(muettes === 0 && identiques ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exitCode = muettes === 0 && identiques ? 0 : 1;
}
