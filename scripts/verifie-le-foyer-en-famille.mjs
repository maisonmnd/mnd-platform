import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE FOYER EN FAMILLE, ÉPROUVÉ (lot 3) — 10 octobre 2026.
   `node scripts/verifie-le-foyer-en-famille.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 3 : la remise famille pour toutes les têtes, la
   Cagnotte du Foyer, les gestes quand on vient ensemble. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-foyer-en-famille-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-foyer-en-famille.harnais.ts')],
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
  ['le bareme reste aux enfants', 'src/shared/clients.ts', "  if (regle === 'foyer') return baremeDuFoyer(nombreDeTetesDuFoyer(f, clients));", "  void baremeDuFoyer;"],
  ['le payeur ne compte pas', 'src/shared/clients.ts', '  if (f.payerClientId) tetes.add(f.payerClientId);', '  void 0;'],
  ['une archivee compte', 'src/shared/clients.ts', '  const tetes = new Set(clients.filter((c) => c.familyId === f.id && !c.archived).map((c) => c.id));', '  const tetes = new Set(clients.filter((c) => c.familyId === f.id).map((c) => c.id));'],
  ['trois tetes donnent 10 %', 'src/shared/clients.ts', 'export const baremeDuFoyer = (tetes: number): number => (tetes >= 3 ? 15 : tetes === 2 ? 10 : 0);', 'export const baremeDuFoyer = (tetes: number): number => (tetes >= 4 ? 15 : tetes >= 2 ? 10 : 0);'],
  ['Ma Couronne passe a la regle du foyer', 'src/apps/couronne/Booking.tsx', "remiseFamillePct(familleDeLaTete, tousClients, todayIso(), 'mineurs')", 'remiseFamillePct(familleDeLaTete, tousClients, todayIso())'],
  ['la Cagnotte oublie le plafond', 'src/shared/cagnotte-pur.ts', '  const taux = Math.min(palier.ajoutPct / 100, plafond);', '  const taux = palier.ajoutPct / 100;'],
  ['l arrondi flottant revient', 'src/shared/cagnotte-pur.ts', '  return Math.floor((palier.verseXof * taux) / 500 + 1e-9) * 500;', '  return Math.floor((palier.verseXof * taux) / 500) * 500;'],
  ['l ajout se pose deux fois', 'src/shared/cagnotte-pur.ts', '  if (!e.complete || e.ajoutPose || c.ajoutXof <= 0) return null;', '  if (!e.complete || c.ajoutXof <= 0) return null;'],
  ['l ajout compte comme verse', 'src/shared/cagnotte-pur.ts', "  const verse = siens.filter((m) => m.kind === 'depot' && !m.abondement).reduce((t, m) => t + m.amountXof, 0);", "  const verse = siens.filter((m) => m.kind === 'depot').reduce((t, m) => t + m.amountXof, 0);"],
  ['l ajout devient une recette', 'src/shared/receipts.ts', '    if (m.abondement) continue;', '    void 0;'],
  ['le versement n est pas marque', 'src/apps/trone/routes/finances/Comptes.tsx', "      ...(cagnotte && kind === 'depot' ? { cagnotteId: cagnotte.id, note: corps.note ?? 'Cagnotte du Foyer · versement' } : {}),", '      ...{},'],
  ['Venez a deux le samedi', 'src/shared/ensemble-pur.ts', '  return (mois === 2 || mois === 7 || mois === 8) && jour >= 2 && jour <= 4;', '  return (mois === 2 || mois === 7 || mois === 8) && jour >= 2;'],
  ['le KLOKLO Kids offert sans parent', 'src/shared/ensemble-pur.ts', '  if (adultes.length >= 1) {', '  if (true) {'],
  ['RdvFoyer cumule geste et remise famille', 'src/apps/trone/routes/clients/RdvFoyer.tsx', '    const famXof = !g && famPct > 0', '    const famXof = famPct > 0'],
  ['RdvFoyer remise sur les forfaits', 'src/apps/trone/routes/clients/RdvFoyer.tsx', 'Math.max(0, l.prixXof - l.forfaitXof)', 'Math.max(0, l.prixXof)'],
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
