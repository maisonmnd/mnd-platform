import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA BASCULE DU 1er JANVIER 2027, ÉPROUVÉE (lot 5) — 11 octobre 2026.
   `node scripts/verifie-la-bascule-de-janvier.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 5 : le gel des rendez-vous pris, les prix tenus
   trois mois, le premier renouvellement à l'ancien prix, la création par
   tranches, la carte et les masques de janvier, l'ordre du lanceur. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-bascule-de-janvier-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-bascule-de-janvier.harnais.ts')],
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
  /* Les formules */
  ['une formule rouverte se referme', 'src/shared/bascule-de-janvier-pur.ts', '!ANCIENNES_FORMULES.includes(p.id) || p.fermee !== undefined', '!ANCIENNES_FORMULES.includes(p.id) || p.fermee === true'],
  ['la fermeture ne se marque pas', 'src/shared/bascule-de-janvier-pur.ts', "fermee: true, fermeeLe: jour, fermeeParLaBascule: true }", "fermee: true, fermeeLe: jour }"],
  ['le renouvellement se reprend sans fin', 'src/shared/bascule-de-janvier-pur.ts', '  return avant && !apres;', '  return avant;'],
  ['une formule fermee a la main se reprend', 'src/shared/bascule-de-janvier-pur.ts', "plan.fermee !== true || plan.fermeeParLaBascule !== true", "plan.fermee !== true"],
  ['le debut ignore le jour de la vente', 'src/shared/bascule-de-janvier-pur.ts', "(s.startIso ?? s.sinceIso ?? '')", "(s.startIso ?? '')"],
  /* Le gel */
  ['la veille se fige', 'src/shared/bascule-de-janvier-pur.ts', "  a.date.slice(0, 10) >= BASCULE\n", "  a.date.slice(0, 10) >= '2026-12-01'\n"],
  ['un honore se fige', 'src/shared/bascule-de-janvier-pur.ts', "&& a.status !== 'honoré' && a.status !== 'annulé'", "&& a.status !== 'annulé'"],
  ['un prix deja pose se refige', 'src/shared/bascule-de-janvier-pur.ts', "  && typeof a.priceXof !== 'number'\n", "  && true\n"],
  ['une seance de suite se fige', 'src/shared/bascule-de-janvier-pur.ts', '  && (a.seriesIndex ?? 1) <= 1\n  && !a.forfait', '  && !a.forfait'],
  ['un rendez-vous couvert se fige', 'src/shared/bascule-de-janvier-pur.ts', '  && !a.forfait && !a.coveredBySub\n', '  && !a.forfait\n'],
  ['un rendez-vous pose apres se fige', 'src/shared/bascule-de-janvier-pur.ts', '(!a.creeLe || !(Date.parse(a.creeLe) >= instant))', 'true'],
  ['l instant est minuit UTC', 'src/shared/bascule-de-janvier-pur.ts', "Date.parse('2027-01-01T00:00:00+01:00')", "Date.parse('2027-01-01T00:00:00Z')"],
  ['un prix illisible fige zero', 'src/shared/bascule-de-janvier-pur.ts', "if (typeof prix !== 'number' || !Number.isFinite(prix) || prix < 0) return a;", "if (false) return a;"],
  ['la raison du gel ne s ecrit pas', 'src/shared/bascule-de-janvier-pur.ts', '{ ...a, priceXof: prix, prixFigeParLaBascule: prix }', '{ ...a, priceXof: prix }'],
  ['une reprise recopie le prix de la bascule', 'src/shared/reprise-nue.ts', "  'prixFigeParLaBascule',\n", ''],
  /* La visite de reference et les prix tenus */
  ['une creation sert de visite', 'src/shared/bascule-de-janvier-pur.ts', '&& a.serviceIds.length > 0 && !a.serviceIds.some(estCreation)', '&& a.serviceIds.length > 0'],
  ['une visite de plus d un an compte', 'src/shared/bascule-de-janvier-pur.ts', "&& a.date.slice(0, 10) >= depuis && a.date.slice(0, 10) < bascule)", "&& a.date.slice(0, 10) < bascule)"],
  ['la plus ancienne visite sert', 'src/shared/bascule-de-janvier-pur.ts', '.sort((x, y) => y.date.localeCompare(x.date));', '.sort((x, y) => x.date.localeCompare(y.date));'],
  ['10 % pile se tient', 'src/shared/bascule-de-janvier-pur.ts', 'totalApres <= totalAvant * (1 + HAUSSE_TENUE)', 'totalApres < totalAvant * (1 + HAUSSE_TENUE)'],
  ['le seuil passe a 20 %', 'src/shared/bascule-de-janvier-pur.ts', 'export const HAUSSE_TENUE = 0.10;', 'export const HAUSSE_TENUE = 0.30;'],
  ['l archivee ne trouve pas son successeur', 'src/shared/bascule-de-janvier-pur.ts', "{ 'sv-atl-iii-cou-l': 'sv-atl-iii-cou-c' }", '{}'],
  ['une ligne qui ne monte pas se tient', 'src/shared/bascule-de-janvier-pur.ts', 'if ((l.n as number) > (l.a as number) && tenus[l.neuf] === undefined)', 'if (tenus[l.neuf] === undefined)'],
  ['les prix tenus durent toujours', 'src/shared/bascule-de-janvier-pur.ts', "t && jour.slice(0, 10) <= t.jusquau && ", "t && "],
  ['le prix tenu ecrase le prix ferme', 'src/shared/bascule-de-janvier-pur.ts', '{ ...actifs, ...(prixFixes ?? {}) }', '{ ...(prixFixes ?? {}), ...actifs }'],
  ['pricingOf ignore les prix tenus', 'src/shared/pricing.ts', '  prixFixes: avecLesPrixTenus(client?.prixFixes, client?.prixTenus, jour ?? jourLocal()),', '  prixFixes: client?.prixFixes,'],
  ['le tarif de la tete lit aujourd hui', 'src/apps/trone/routes/clients/_shared.tsx', 'pricingOf(ctx.client, ctx.bands, ctx.sets, ctx.cats, appt.date?.slice(0, 10))', 'pricingOf(ctx.client, ctx.bands, ctx.sets, ctx.cats)'],
  /* La creation par tranches */
  ['les tranches s ignorent', 'src/shared/pricing.ts', '? Math.max(locksAuTarif(sv, p.lockCount, p.longueur as LongueurId, tarifLong), plancherLong ?? 0)', '? Math.max(p.lockCount * tarifLong, plancherLong ?? 0)'],
  ['le seuil compte au tarif fin', 'src/shared/pricing.ts', '|| locks <= fin.seuil) return locks * tarif;', '|| locks < fin.seuil) return locks * tarif;\n  if (locks === fin.seuil) return locks * tarifFin;'],
  ['le tarif fin pour tous les locks', 'src/shared/pricing.ts', '  return fin.seuil * tarif + (locks - fin.seuil) * tarifFin;', '  return locks * tarifFin;'],
  ['le des du Mini depasse son premier lock', 'src/shared/nouvelle-grille-pur.ts', "prixParLongueur: { court: 170000, 'mi-long': 200000, long: 230000 }", "prixParLongueur: { court: 175000, 'mi-long': 200000, long: 230000 }"],
  ['le plancher du Jumbo baisse', 'src/shared/nouvelle-grille-pur.ts', "auDelaDesLocks: AU_DELA_DE_250, prixParLongueur: { court: 80000, 'mi-long': 100000, long: 120000 } },", "auDelaDesLocks: AU_DELA_DE_250, prixParLongueur: { court: 80000, 'mi-long': 100000, long: 100000 } },"],
  ['le tarif de base reste celui d avant', 'src/shared/nouvelle-grille-pur.ts', "export const TARIF_DE_BASE = { court: 1150, 'mi-long': 1350, long: 1550 };", "export const TARIF_DE_BASE = { court: 1100, 'mi-long': 1350, long: 1550 };"],
  ['la Nano ne bascule pas', 'src/shared/nouvelle-grille-pur.ts', "SV('sv-atl-i-nan', { tarifLockParLongueur: TARIF_D_AVANT_FIN,", "SV('sv-atl-i-nan', { tarifLockParLongueur: undefined,"],
  /* La grille de janvier */
  ['la marche Kids reste a 250', 'src/shared/nouvelle-grille-pur.ts', "{ paliersDeLocks: [{ auDela: 150, prixXof: 20000 }] }", "{ paliersDeLocks: [{ auDela: 250, prixXof: 20000 }] }"],
  ['la naissance Kids garde son prix unique', 'src/shared/nouvelle-grille-pur.ts', "{ priceXof: 0, forfaitRemisePct: 10 }", "{ priceXof: 150000, forfaitRemisePct: 10 }"],
  ['la Cure VIVIVO reste masquee', 'src/shared/nouvelle-grille-pur.ts', "export const DEMASQUEES_EN_JANVIER: readonly string[] = ['sv-plt-30-cur'];", 'export const DEMASQUEES_EN_JANVIER: readonly string[] = [];'],
  ['janvier demasque tout le site', 'src/shared/nouvelle-grille-pur.ts', ": site.filter((i) => !montrees.includes(i));", ": [];"],
  ['la grille bascule un jour trop tard', 'src/shared/nouvelle-grille-pur.ts', "export const BASCULE_DE_JANVIER = '2027-01-01';", "export const BASCULE_DE_JANVIER = '2027-01-02';"],
  /* Le lanceur et les ecrans */
  ['la bascule tourne avant janvier', 'src/apps/trone/shell/bascule-de-janvier.ts', 'if (isoDuJour(new Date()) < BASCULE || Date.now() > FIN', 'if (Date.now() > FIN'],
  ['la carte passe avant le gel', 'src/apps/trone/shell/bascule-de-janvier.ts', "        await figeLesRendezVousPris();                                         // ①\n        poseLesPrixTenus(carte.services as unknown as Service[]);              // ②\n        categoriesStore.set(carte.categories as unknown as CatalogCategory[]); // ③\n        servicesStore.set(carte.services as unknown as Service[]);\n", "        categoriesStore.set(carte.categories as unknown as CatalogCategory[]); // ③\n        servicesStore.set(carte.services as unknown as Service[]);\n        await figeLesRendezVousPris();                                         // ①\n        poseLesPrixTenus(carte.services as unknown as Service[]);              // ②\n"],
  ['un second poste refige au nouveau prix', 'src/apps/trone/shell/bascule-de-janvier.ts', '      if (carte) {\n', '      {\n'],
  ['les masques avant les formules', 'src/apps/trone/shell/bascule-de-janvier.ts', "      if (formules) plansStore.set(formules.plans as Plan[]);                  // ④\n      if (!(await demasquee())) return;                                        // ⑤\n", "      if (!(await demasquee())) return;                                        // ⑤\n      if (formules) plansStore.set(formules.plans as Plan[]);                  // ④\n"],
  ['sans session on bascule', 'src/apps/trone/shell/bascule-de-janvier.ts', '      if (!(await sb.auth.getSession()).data.session) return;\n', ''],
  ['les rendez-vous non attendus', 'src/apps/trone/shell/bascule-de-janvier.ts', 'plans: false, appointments: false, clients: false', 'plans: false, clients: false'],
  ['la vitrine non relue', 'src/apps/trone/shell/bascule-de-janvier.ts', ".eq('key', 'mnd_vitrine_config')", ".eq('key', 'autre')"],
  ['le Trone ne lance pas la bascule', 'src/apps/trone/main.tsx', '\nmigreLaBasculeDeJanvier();\n', '\n'],
  ['la vente oublie le renouvellement', 'src/apps/trone/routes/equipe/Abonnements.tsx', '|| peutReprendreSonAncienne(p, subForm.clientId, subs)).map(', ').map('],
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
