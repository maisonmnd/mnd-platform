import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE KIT DE JANVIER, ÉPROUVÉ (0127) — 11 octobre 2026.
   `node scripts/verifie-le-kit-de-janvier.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, 0127 : la souscription en ligne aux règles du
   comptoir, la liste blanche, le compte du foyer, le signal des trois fois. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-kit-de-janvier-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-kit-de-janvier.harnais.ts')],
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
  ['trois fois avant le signal', 'src/shared/echeancier.ts', "  if (typeof cfg.seuilTroisFoisXof !== 'number') return deuxFoisPossible(totalXof, cfg.seuilDeuxFoisXof) ? [1, 2] : [1];\n", ''],
  ['deux fois au-dessus seulement apres le signal', 'src/shared/echeancier.ts', '...(totalXof >= s2 ? [2 as const] : [])', '...(totalXof > s2 ? [2 as const] : [])'],
  ['trois fois sous le seuil des deux fois', 'src/shared/echeancier.ts', 'const s3 = Math.max(s2, Math.round(cfg.seuilTroisFoisXof));', 'const s3 = Math.round(cfg.seuilTroisFoisXof);'],
  ['le taux pose ignore', 'src/shared/clients.ts', "  if (Number.isFinite(p)) return Math.max(0, Math.min(100, Math.round(p)));\n  return baremeDuFoyer(tetes);", '  return baremeDuFoyer(tetes);'],
  ['le serveur refuse trois fois', 'supabase/migrations/0127_la_bascule_de_janvier.sql', 'if p_parts not in (1, 2, 3) then', 'if p_parts not in (1, 2) then'],
  ['deux fois au-dessus du seuil au serveur', 'supabase/migrations/0127_la_bascule_de_janvier.sql', 'if p_parts = 2 and v_prix < v_seuil2 then', 'if p_parts = 2 and v_prix <= v_seuil2 then'],
  ['trois fois sans seuil au serveur', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "  if p_parts = 3 and v_prix < v_seuil3 then\n    return jsonb_build_object('erreur', 'seuil_non_atteint', 'seuil', v_seuil3);\n  end if;\n", ''],
  ['la troisieme echeance oubliee', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "jsonb_build_object('numero', 3, 'dueIso', to_char(v_today + 60, 'YYYY-MM-DD'), 'amountXof', v_base)", "jsonb_build_object('numero', 3, 'dueIso', to_char(v_today + 30, 'YYYY-MM-DD'), 'amountXof', v_base)"],
  ['une formule fermee se souscrit', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "      return jsonb_build_object('erreur', 'formule_fermee');\n", "      null;\n"],
  ['toute fermee se reprend', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "      coalesce((v_plan.data->>'fermeeParLaBascule')::boolean, false)\n      and exists", "      true\n      and exists"],
  ['la reprise sans fin', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "                     and coalesce(s.data->>'startIso', s.data->>'sinceIso', '') >= '2027-01-01')\n", "                     and false)\n"],
  ['une fois par tete oubliee', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "    return jsonb_build_object('erreur', 'deja_prise');\n", "    null;\n"],
  ['les Premieres Lunes sans creation', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "and (a.data->>'date')::date >= v_today - 30", "and (a.data->>'date')::date >= v_today - 3650"],
  ['un paquet epuise bloque encore', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "not in ('churn', 'exhausted')", "not in ('churn')"],
  ['la liste blanche perd une cle', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "    'mnd_avis_google',\n    'mnd_site_publie',\n", "    'mnd_site_publie',\n"],
  ['les interrupteurs restent caches', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "    'mnd_cercle_actif',\n    'mnd_foyer_actif'\n", "    'mnd_cercle_actif'\n"],
  ['le compte ouvert a tous', 'supabase/migrations/0127_la_bascule_de_janvier.sql', 'grant execute on function public.nombre_de_tetes_de_mon_foyer() to authenticated;', 'grant execute on function public.nombre_de_tetes_de_mon_foyer() to anon, authenticated;'],
  ['le compte rend des noms', 'supabase/migrations/0127_la_bascule_de_janvier.sql', 'create or replace function public.nombre_de_tetes_de_mon_foyer()\nreturns int', 'create or replace function public.nombre_de_tetes_de_mon_foyer()\nreturns setof text'],
  ['le signal ecrase un reglage pose', 'supabase/migrations/0127_la_bascule_de_janvier.sql', "   and not (coalesce(data, '{}'::jsonb) ? 'seuilTroisFoisXof');", ';'],
  ['l achat garde l ancienne regle', 'src/apps/couronne/AchatFormule.tsx', '  const offertes = decoupesEnLigne(total, cfg);', '  const offertes: (1 | 2 | 3)[] = [1, 2];'],
  ['un refus du serveur se tait', 'src/apps/couronne/AchatFormule.tsx', "  deja_prise: 'Cette formule ne se prend qu’une fois, et vous l’avez déjà prise.',\n", ''],
  ['le compte d une erreur fait zero', 'src/apps/couronne/lib.ts', "tetesDuFoyerLues = !error && typeof data === 'number' ? data : null;", "tetesDuFoyerLues = typeof data === 'number' ? data : 0;"],
  ['la reservation garde les mineurs', 'src/apps/couronne/Booking.tsx', '  const famPctCompte = tetesDuFoyer !== null && familleDeLaTete', '  const famPctCompte = false && familleDeLaTete'],
  ['le profil garde les mineurs', 'src/apps/couronne/Tabs.tsx', '  const famPctProfil = tetesDuFoyerProfil !== null && familleProfil', '  const famPctProfil = false && familleProfil'],
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
