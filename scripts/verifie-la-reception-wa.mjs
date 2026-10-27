import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CIBLE, fichierAttendu } from './reception-wa-serveur.mjs';

/* LA RECEPTION WHATSAPP, EPROUVEE - 27 octobre 2026 (sur le modele de
   verifie-l-assistant-au-serveur).
   `node scripts/verifie-la-reception-wa.mjs` : le fichier a coller doit etre
   a jour avec le depot (sinon : node scripts/reception-wa-serveur.mjs), puis
   les regles pures et la fonction, regroupee depuis les sources du moment,
   tournent contre une base et un Claude simules
   (verifie-la-reception-wa.harnais.ts).
   `--prouve` : chaque faute est remise une a une dans le vrai fichier
   source, et le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-reception-wa');
  mkdirSync(dossier, { recursive: true });
  try {
    const fonction = path.join(dossier, 'reception-wa.ts');
    writeFileSync(fonction, await fichierAttendu(racine));
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-reception-wa.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: { ...process.env, RECEPTION_FONCTION: fonction } });
  } catch (e) {
    return { status: 1, stdout: `ECHEC construction : ${String(e?.message ?? e).slice(0, 300)}\n`, stderr: '' };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const SERVEUR = 'scripts/serveur/reception-wa.ts';
const PUR = 'src/shared/reception-wa-pur.ts';
const PANNES = [
  ['une cle quelconque acceptee', SERVEUR, 'if (!service || cleRecue !== service) return json(', 'if (!service) return json('],
  ['le plafond du numero oublie', SERVEUR, 'if ((count ?? 0) >= RECEPTIONS_PAR_JOUR) {', 'if (false) {'],
  ['les prix des calibres oublies', SERVEUR, '      if (prix && prix > 0) prixParPalier.push({ palier: p.palier, prixXof: prix });\n', ''],
  ['le calibre touche oublie', SERVEUR, "const declare = touche && touche !== 'inconnu' ? touche.locks : Number(f.lockCountDeclare ?? 0) || 0;", 'const declare = Number(f.lockCountDeclare ?? 0) || 0;'],
  ['pas de repli sur Sonnet', SERVEUR, '      if (modeleInconnu(r.status, r.corps)) continue;\n', ''],
  ['le compte du mois oublie', SERVEUR, '    await compteLAppel(sb, lu.modele, lu.corps.usage, maintenantMs);\n', ''],
  ['les juges passent tout', PUR, '  if (montants.some((n) => !montantsPermis.has(n))) return null;\n', ''],
  ['un prix de creation passe', PUR, "  if ((suite === 'creation' || suite === 'reparation' || suite === 'calibre') && montants.length > 0) return null;\n", ''],
  ['la consigne garde « tu proposes »', PUR, "  for (const [avant, apres] of REPERES_DE_LA_CONSIGNE) c = c.replace(avant, apres);\n", ''],
  ['les calibres dans le desordre', PUR, '  const paliers = paliersDeLocks(bandes);\n  const nomDe', '  const paliers = paliersDeLocks(bandes).reverse();\n  const nomDe'],
  ['l adresse oubliee', PUR, '    `- Adresse : ${ADRESSE_DE_LA_MAISON}.`,\n', ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!prouve) {
  let present = '';
  try { present = readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
  const aJour = present === await fichierAttendu(racine);
  console.log(aJour ? 'OK    le fichier a coller est a jour avec le depot' : `ECHEC le fichier a coller a pris du retard : node scripts/reception-wa-serveur.mjs`);
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
