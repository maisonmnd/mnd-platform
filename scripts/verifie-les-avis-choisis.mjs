import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES AVIS GOOGLE CHOISIS PAR LA MAISON, ÉPROUVÉS — 10 octobre 2026.
   `node scripts/verifie-les-avis-choisis.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-avis-choisis-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-avis-choisis.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    }).then(() => spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' }))
      .finally(() => rmSync(dossier, { recursive: true, force: true }));
  } catch (e) {
    rmSync(dossier, { recursive: true, force: true });
    throw e;
  }
}

const PANNES = [
  ['le choix n est jamais suivi', 'src/shared/avis-google-pur.ts', "if (retenus.length > 0) return { avis: retenus, mode: 'choix' };", "if (false) return { avis: retenus, mode: 'choix' };"],
  ['pas de retour a Google quand plus rien n est renvoye', 'src/shared/avis-google-pur.ts', "if (retenus.length > 0) return { avis: retenus, mode: 'choix' };", "if (liste.length > 0) return { avis: retenus, mode: 'choix' };"],
  ['l ordre de Google au lieu de celui de la Maison', 'src/shared/avis-google-pur.ts', "if (retenus.length > 0) return { avis: retenus, mode: 'choix' };", "if (retenus.length > 0) return { avis: tous.filter((a) => retenus.includes(a)), mode: 'choix' };"],
  ['la cle garde le nom de l auteur', 'src/shared/avis-google-pur.ts', 'return `av-${h.toString(36)}`;', 'return `av-${h.toString(36)}-${net(a.auteur)}`;'],
  ['la cle depend des espaces', 'src/shared/avis-google-pur.ts', "const net = (s: unknown): string => String(s ?? '').replace(/\\s+/g, ' ').trim();", "const net = (s: unknown): string => String(s ?? '');"],
  ['un avis en double', 'src/shared/avis-google-pur.ts', 'if (a && !vus.has(c)) { vus.add(c); retenus.push(a); }', 'if (a) { vus.add(c); retenus.push(a); }'],
  ['la mention du choix change', 'src/shared/avis-google-pur.ts', "? 'Avis choisis par la Maison parmi ceux laissés sur Google.'", "? 'Nos meilleurs avis.'"],
  ['deplacer sort de la liste', 'src/shared/avis-google-pur.ts', 'if (i < 0 || j < 0 || j >= liste.length) return liste;', 'if (i < 0) return liste;'],
  ['le site ne dit plus la mention', 'src/apps/revelateur/ilots/Avis.tsx', '{mentionDuTri(vue.mode)}', "{''}"],
  ['le site affiche encore tous les avis de Google', 'src/apps/revelateur/ilots/Avis.tsx', '{vue.avis.map((a, i) => (', '{avis.avis.map((a, i) => ('],
  ['le Trone ecrit sous un autre nom', 'src/apps/trone/routes/clients/VitrineSite.tsx', 'avisChoisis: liste }', 'avisChoisi: liste }'],
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
