import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA NOUVELLE GRILLE, ÉPROUVÉE (lot 1) — 10 octobre 2026.
   `node scripts/verifie-la-nouvelle-grille.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 1 : la carte est une donnée, posée une fois depuis
   le Trône ; maintenant ne monte aucun prix ; les nouveautés attendent janvier. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-nouvelle-grille-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-nouvelle-grille.harnais.ts')],
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
  ['le juge touche une ligne changee a la main', 'src/shared/nouvelle-grille-pur.ts', '    if (i < 0 || deja(l[i], r.pose) || !porte(l[i], r.si)) continue;', '    if (i < 0 || deja(l[i], r.pose)) continue;'],
  ['un champ a effacer reste pose', 'src/shared/nouvelle-grille-pur.ts', '    if (v === undefined) delete g[k]; else g[k] = v;', '    g[k] = v;'],
  ['une archivee sans date', 'src/shared/nouvelle-grille-pur.ts', '  if (pose.archived === true && !g.archivedLe) g.archivedLe = jour;', '  void jour;'],
  ['l egalite depend de l ordre des cles', 'src/shared/nouvelle-grille-pur.ts', '  if (a === b) return true;', '  if (a === b) return true;\n  if (JSON.stringify(a) !== JSON.stringify(b)) return false;'],
  ['une naissance se repete', 'src/shared/nouvelle-grille-pur.ts', '    if (l.some((x) => x.id === n.fiche.id)) continue;', '    if (false) continue;'],
  ['une phrase absente se compte comme faite', 'src/shared/nouvelle-grille-pur.ts', "    if (typeof d !== 'string' || !d.includes(p.avant)) continue;", "    if (typeof d !== 'string') continue;"],
  ['janvier ne demasque pas', 'src/shared/nouvelle-grille-pur.ts', ': caches.filter((i) => !ids.includes(i));', ': caches;'],
  ['une hausse glissee dans maintenant', 'src/shared/nouvelle-grille-pur.ts', "{ prixParLongueur: { court: 110000, 'mi-long': 150000, long: 180000 } }", "{ prixParLongueur: { court: 110000, 'mi-long': 150000, long: 210000 } }"],
  ['une nouveaute visible avant janvier', 'src/shared/nouvelle-grille-pur.ts', "  .filter((n) => n.quoi === 'service').map((n) => n.fiche.id);", "  .filter((n) => n.quoi === 'service' && n.fiche.id !== 'sv-le-moment').map((n) => n.fiche.id);"],
  ['la ligne offerte se paie', 'src/shared/pricing.ts', '    if (inc.offert) continue;', '    void 0;'],
  ['une archivee reste proposee', 'src/shared/pricing.ts', '  sv.archived !== true\n  && (servesBand(sv, bandForService(sv, p)) || !calibreConnu(p))', '  true\n  && (servesBand(sv, bandForService(sv, p)) || !calibreConnu(p))'],
  ['Ma Couronne montre les archivees', 'src/shared/bridges.ts', 's.archived !== true && catOk(s.categoryId)', 'catOk(s.categoryId)'],
  ['le defaisage vivant n est plus reconnu', 'src/shared/catalog.ts', '  s.categoryId === CATEGORIE_GBATA || s.categoryId === CATEGORIE_GBATA_VIVANTE;', '  s.categoryId === CATEGORIE_GBATA;'],
  ['la carte passe avant les masques', 'src/shared/nouvelle-grille.ts', '      if (!(await masquee())) return;                               // ③\n      posee();\n      marque();', '      posee();\n      if (!(await masquee())) return;                               // ③\n      marque();'],
  ['sans session on ecrit quand meme', 'src/shared/nouvelle-grille.ts', '      if (!(await sb.auth.getSession()).data.session) return;   // ①', '      void 0;'],
  ['les masques sur une vitrine non relue', 'src/shared/nouvelle-grille.ts', ".eq('key', 'mnd_vitrine_config')", ".eq('key', 'autre')"],
  ['le Trone ne lance pas la grille', 'src/apps/trone/main.tsx', 'migreLaNouvelleGrille();\n', 'void 0;\n'],
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
