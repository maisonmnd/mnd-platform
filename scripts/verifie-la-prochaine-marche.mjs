import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* VOTRE PROCHAINE MARCHE, ÉPROUVÉE (lot 5) — 11 octobre 2026.
   `node scripts/verifie-la-prochaine-marche.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 5 : la carte de Ma Couronne, son ordre, ses
   variantes, son silence avant janvier et sa langue vers la Maison. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-prochaine-marche-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-prochaine-marche.harnais.ts')],
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
  ['les Premieres Lunes au-dela de 30 jours', 'src/shared/prochaine-marche-pur.ts', 'if (!o.formule && depuis((v) => v.serviceIds.some(o.estCreation), 30))', 'if (!o.formule && depuis((v) => v.serviceIds.some(o.estCreation), 60))'],
  ['une formule deja prise se repropose', 'src/shared/prochaine-marche-pur.ts', 'if (o.enVente.has(id) && !o.dejaPrises.has(id)) return id;', 'if (o.enVente.has(id)) return id;'],
  ['une formule hors vente se propose', 'src/shared/prochaine-marche-pur.ts', 'if (o.enVente.has(id) && !o.dejaPrises.has(id)) return id;', 'if (!o.dejaPrises.has(id)) return id;'],
  ['la Signature ignoree', 'src/shared/prochaine-marche-pur.ts', 'const variante = signature && base !== PREMIERES_LUNES ? `${base}-sig` : base;', 'const variante = base;'],
  ['la Cure au-dela de 14 jours', 'src/shared/prochaine-marche-pur.ts', "if (depuis((v) => v.serviceIds.some((id) => COULEURS.includes(id)), 14)", "if (depuis((v) => v.serviceIds.some((id) => COULEURS.includes(id)), 30)"],
  ['la Cure reproposee apres la Cure', 'src/shared/prochaine-marche-pur.ts', "    && !honorees.some((v) => v.serviceIds.includes(CURE_DE_LUMIERE))) {", '    ) {'],
  ['l ancienne Couleur oubliee', 'src/shared/prochaine-marche-pur.ts', "export const COULEURS: readonly string[] = ['sv-atl-iii-cou-c', 'sv-atl-iii-cou-l'];", "export const COULEURS: readonly string[] = ['sv-atl-iii-cou-c'];"],
  ['une formule a cinq venues pousse la suivante', 'src/shared/prochaine-marche-pur.ts', "o.formule.restantes > 2) return null;", "o.formule.restantes > 9) return null;"],
  ['le Carnet de Six mene au Six', 'src/shared/prochaine-marche-pur.ts', "'pl-lune-six': CARNET_DE_L_ANNEE,", "'pl-lune-six': CARNET_DE_SIX,"],
  ['l anniversaire sans fenetre', 'src/shared/prochaine-marche-pur.ts', 'if (ecart >= -7 && ecart <= 30)', 'if (ecart >= -7 && ecart <= 60)'],
  ['un Regard seul fait une couronne nee ailleurs', 'src/shared/prochaine-marche-pur.ts', "    || v.serviceIds.some((id) => !REGARDS.includes(id)));", '    || v.serviceIds.length > 0);'],
  ['l Accueil ne dit pas nee ailleurs', 'src/shared/prochaine-marche-pur.ts', 'const neeAilleurs = !creee && honorees.some((v) => v.serviceIds.includes(REGARD_ACCUEIL)', 'const neeAilleurs = !creee && honorees.some((v) => false'],
  ['deux visites font le Carnet de Six', 'src/shared/prochaine-marche-pur.ts', '.length >= 3) {', '.length >= 2) {'],
  ['une seance de suite compte', 'src/shared/prochaine-marche-pur.ts', "v.status === 'honoré' && (v.seriesIndex ?? 1) <= 1 && v.date.slice(0, 10) <= o.jour", "v.status === 'honoré' && v.date.slice(0, 10) <= o.jour"],
  ['un rendez-vous a venir compte', 'src/shared/prochaine-marche-pur.ts', "v.status === 'honoré' && (v.seriesIndex ?? 1) <= 1 && v.date.slice(0, 10) <= o.jour", "v.status === 'honoré' && (v.seriesIndex ?? 1) <= 1"],
  ['la creation reproposee a qui l a reservee', 'src/shared/prochaine-marche-pur.ts', 'if (!creee && !o.creationAVenir && depuis(', 'if (!creee && depuis('],
  ['la carte parle avant janvier', 'src/apps/couronne/ProchaineMarche.tsx', "if (!client || (!apercu && phaseDeLaGrille(jour) !== 'janvier')) return null;", 'if (!client) return null;'],
  ['le message part en anglais', 'src/apps/couronne/ProchaineMarche.tsx', 'encodeURIComponent(`Bonjour, je voudrais parler de « ${sujetFr} ».`)', "encodeURIComponent(t('Bonjour, je voudrais parler de « {sujet} ».', { sujet: sujetFr }))"],
  ['les masques de la vitrine ignores', 'src/apps/couronne/ProchaineMarche.tsx', 'formulesVisiblesPour({ cfg, masques: client.vitrineMasques, plans })', 'plans'],
  ['une Cure masquee se reserve', 'src/apps/couronne/ProchaineMarche.tsx', 'servicesVisibles.some((s) => s.id === CURE_DE_LUMIERE)', 'services.some((s) => s.id === CURE_DE_LUMIERE)'],
  ['le prix de reference au lieu du sien', 'src/apps/couronne/ProchaineMarche.tsx', "prixDeLaFormule(plan, 'mensuel', maTete, calibresAbo)", "prixDeLaFormule(plan, 'mensuel', {}, calibresAbo)"],
  ['l accueil ne montre pas la carte', 'src/apps/couronne/Tabs.tsx', '<ProchaineMarche appts={clientAppts} onOpenBooking={onOpenBooking} goFormule={goFormule} />', ''],
  ['l app ne donne pas l onglet', 'src/apps/couronne/App.tsx', "            goFormule={visibleTabs.some((t) => t.id === 'formule') ? () => setTab('formule') : undefined}\n", ''],
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
