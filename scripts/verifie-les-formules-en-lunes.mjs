import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES FORMULES EN LUNES, ÉPROUVÉES (lot 2) — 10 octobre 2026.
   `node scripts/verifie-les-formules-en-lunes.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 2 : les sept formules en lunes, le Foyer, les portes,
   la pause d'une lune non réglée, la règle des 2 et 3 fois. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-formules-en-lunes-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-formules-en-lunes.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      /* Le moteur des prix tire des magasins : un stockage et un navigateur
         d'opérette, et pas de serveur (même banc que verifie-prix). */
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };` },
    }).then(() => spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' }))
      .finally(() => rmSync(dossier, { recursive: true, force: true }));
  } catch (e) {
    rmSync(dossier, { recursive: true, force: true });
    throw e;
  }
}

const PANNES = [
  ['le Carnet de Six compte six visites payees', 'src/shared/formules-en-lunes-pur.ts', "    validityDays: 270, priceXof: 140000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 5), supplementLongueur: longueurFois(5), discountPct: 17,", "    validityDays: 270, priceXof: 140000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 6), supplementLongueur: longueurFois(5), discountPct: 17,"],
  ['l Annee n offre plus que la huitieme', 'src/shared/formules-en-lunes-pur.ts', "    validityDays: 365, priceXof: 168000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 6), supplementLongueur: longueurFois(6), discountPct: 25,", "    validityDays: 365, priceXof: 168000, prixParCalibre: parCalibre(VENUE_ESSENTIEL_COURT, 7), supplementLongueur: longueurFois(6), discountPct: 25,"],
  ['le Foyer arrondit vers le bas', 'src/shared/formules-en-lunes-pur.ts', '  return Math.min(prixXof, Math.ceil((valeurCarteXof * (1 - total)) / 500) * 500);', '  return Math.min(prixXof, Math.floor((valeurCarteXof * (1 - total)) / 500) * 500);'],
  ['le Foyer oublie le plafond', 'src/shared/formules-en-lunes-pur.ts', '  const total = Math.min(sien + 0.15, 0.25);', '  const total = sien + 0.15;'],
  ['le Foyer joue a la quatrieme tete', 'src/shared/formules-en-lunes-pur.ts', 'export const leFoyerJoue = (rang: number): boolean => rang === 2 || rang === 3;', 'export const leFoyerJoue = (rang: number): boolean => rang >= 2;'],
  ['la porte ignore sa cle', 'src/shared/formules-en-lunes-pur.ts', '  return contratsDeLaTete.find((s) => plans.find((p) => p.id === s.planId)?.uneFoisParTete === plan.uneFoisParTete);', '  return contratsDeLaTete[0];'],
  ['le soin de la lune tourne au mauvais pas', 'src/shared/formules-en-lunes-pur.ts', '  return soins[Math.floor(jours / 30) % soins.length];', '  return soins[Math.floor(jours / 31) % soins.length];'],
  ['un paquet se met en pause', 'src/shared/formules-en-lunes-pur.ts', "): boolean => !!plan && plan.mode !== 'pack' && !!sub.nextIso", "): boolean => !!plan && !!sub.nextIso"],
  ['deux fois seulement au-dela de 100 000', 'src/shared/echeancier.ts', '  totalXof >= SEUIL_TROIS_FOIS_XOF ? [2, 3] : totalXof >= SEUIL_ECHELONNEMENT_XOF ? [2] : [];', '  totalXof >= SEUIL_TROIS_FOIS_XOF ? [2, 3] : totalXof > SEUIL_ECHELONNEMENT_XOF ? [2] : [];'],
  ['le lien fait sauter la lune', 'src/shared/abonnements.ts', '  if (a.subId) { if (a.subId !== sub.id) return false; }\n  else if (a.clientId !== sub.clientId) return false;', '  if (a.subId) return a.subId === sub.id;\n  if (a.clientId !== sub.clientId) return false;'],
  ['le soin de la lune n entre pas au contenu', 'src/shared/abonnements.ts', '  return soin && !base.some((i) => i.serviceId === soin) ? [...base, { serviceId: soin, qty: 1 }] : base;', '  return soin ? base : base;'],
  ['les formules avant les masques', 'src/shared/formules-en-lunes.ts', '      if (!(await masquee())) return;                           // ③\n      posees();\n      marque();', '      posees();\n      if (!(await masquee())) return;                           // ③\n      marque();'],
  ['sans la carte du lot 1', 'src/shared/formules-en-lunes.ts', '      if (!formulesChargees() || !carteDuLot1()) return;        // ② ④', '      if (!formulesChargees()) return;        // ② ④'],
  ['la porte se repasse au comptoir', 'src/apps/trone/routes/equipe/Abonnements.tsx', '    if (dejaPrise) {\n      toast(', '    if (false) {\n      toast('],
  ['le Foyer ne se pose pas', 'src/apps/trone/routes/equipe/Abonnements.tsx', '    return prixConvenuSaisi() ?? foyerDeLaVente()?.prixXof\n', '    return prixConvenuSaisi()\n'],
  ['la pause n empeche rien', 'src/apps/trone/routes/clients/_shared.tsx', '  const canCover = !pauseDeLaLune && coverageRows.length > 0', '  const canCover = coverageRows.length > 0'],
  ['le Trone ne lance pas les formules', 'src/apps/trone/main.tsx', 'migreLesFormulesEnLunes();\n', 'void 0;\n'],
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
