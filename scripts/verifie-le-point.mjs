import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE POINT FINANCIER D'UNE CLIENTE, EPROUVE - 21 novembre 2026.
   `node scripts/verifie-le-point.mjs` : le banc, dans un processus fils.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier, et le
   banc doit crier a chacune. Deux lecons du 21 novembre : le paquet s ecrit
   dans un dossier PAR LANCEMENT (deux copies du depot partagent node_modules),
   et chaque ecriture reessaie cinq secondes (OneDrive tient parfois un
   fichier) ; une restauration ratee se crie avec son remede. */

process.env.TZ = 'Asia/Shanghai';
const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-le-point-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-point.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', external: ['esbuild'],
      loader: { '.css': 'empty', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.woff2': 'empty', '.webp': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', hash: '' }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
globalThis.document = { body: { dataset: {} }, documentElement: { dataset: {}, style: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/le-point-pur.ts';
const REL = 'src/shared/relances-pur.ts';
const PAGE = 'src/apps/trone/routes/clients/LePoint.tsx';
const DONNEES = 'src/apps/trone/routes/clients/le-point-donnees.ts';
const ROUTES = 'src/apps/trone/routes/index.tsx';
const PANNES = [
  ['un versement partiel se dit regle', PUR, "  return o.verseXof > 0 ? 'partiel' : 'du';", "  return 'regle';"],
  ['une ligne a venir se coche', PUR, "export const seCoche = (l: { etat: EtatDuReglement }): boolean => l.etat === 'du' || l.etat === 'partiel';", 'export const seCoche = (l: { etat: EtatDuReglement }): boolean => l.etat !== \'annule\';'],
  ['l accuse de Meta ne compte plus', PUR, "  if (e.etat === 'lu') return 'lu';\n", ''],
  ['un point se dit une fois par piece', PUR, '    const cle = `${p.partieLe}|${p.modele ?? \'\'}`;', '    const cle = `${p.partieLe}|${p.id}`;'],
  ['le suivi prend les envois d un autre type', PUR, "    if (e.type !== 'relance-facture' || !e.quand) continue;", '    if (!e.quand) continue;'],
  ['un jour saute se dit prochaine', PUR, "      if (sautes.has(jour)) return { jour, etat: 'sautee' };\n", ''],
  ['un plan arrete garde sa prochaine', PUR, "      if (jour < aujourdhui || (plan.arreteLe && jour >= aujourdhui)) return { jour, etat: 'sans-depart' };", "      if (jour < aujourdhui) return { jour, etat: 'sans-depart' };"],
  ['un identifiant de plan porte un nom', PUR, "if (!jours.length || !/^[a-z0-9-]{4,40}$/.test(o.id)) return null;", 'if (!jours.length) return null;'],
  ['retirer une ligne laisse sa remise a la voisine', PUR, '  x.serviceIds.splice(i, 1); x.remisesLignes.splice(i, 1); x.mains.splice(i, 1);', '  x.serviceIds.splice(i, 1); x.mains.splice(i, 1);'],
  ['la derniere ligne se retire', PUR, '  if (x.serviceIds.length <= 1 || i < 0 || i >= x.serviceIds.length) return propres(x);', '  if (i < 0 || i >= x.serviceIds.length) return propres(x);'],
  ['une remise de ligne depasse 100 %', PUR, "(unite === '%' ? { pct: Math.min(100, n) } : { xof: n })", "(unite === '%' ? { pct: n } : { xof: n })"],
  ['une remise ajoutee depasse le reste', PUR, '  return Math.max(0, Math.min(brute, Math.max(0, Math.round(plafondXof))));', '  return Math.max(0, brute);'],
  ['de l argent recu laisse changer les prestations', PUR, "  if (o.argentRecu) return o.resteXof > 0 ? 'ajout' : 'fenetre';", "  if (o.argentRecu && o.resteXof <= 0) return 'fenetre';"],
  ['un devis se change sur la page', PUR, "  if (o.prixLibre) return 'fenetre';\n", ''],
  ['un rendez-vous a venir change ses prestations sur la page', PUR, "  if (o.aVenir) return 'remises';\n", ''],
  ['le groupe de jours differents part sans le modele', PUR, '  !modelePoint && new Set(datesDesPieces).size > 1;', '  false;'],
  ['un dimanche entre dans le plan', REL, '    const j = horsDuDimanche(jourPlusR(debut, k * p));', '    const j = jourPlusR(debut, k * p);'],
  ['un plan depasse quatre relances', REL, '  const n = p > 0 ? RELANCES_PROGRAMMEES_AU_PLUS : 1;', '  const n = p > 0 ? 10 : 1;'],
  ['un jour saute part quand meme', REL, " && !(p.sautes ?? []).includes(aujourdhui);", ';'],
  ['un plan arrete part quand meme', REL, '  !!p && !p.arreteLe && !estUnDimanche(aujourdhui)', '  !!p && !estUnDimanche(aujourdhui)'],
  ['decaler se pose sur un jour deja prevu', REL, '  if (jour <= aujourdhui || (p.jours.includes(jour) && jour !== prochaine)) return p;', '  if (jour <= aujourdhui) return p;'],
  ['la piece du reste se retarife apres un versement', PUR, "  if (!estUnePieceDuReste(p) || (p.payments?.length ?? 0) > 0) return null;", '  if (!estUnePieceDuReste(p)) return null;'],
  ['un rituel paye en partie recoit une piece au prix entier', PAGE, '      if (l.verseXof > 0) {', '      if (false) {'],
  ['la piece du reste ne suit plus la remise', PAGE, '          const r = resteAJour(i, du);', '          const r = null as typeof i | null;'],
  ['le tarif n est plus celui de sa tete', PAGE, 'const ctx = point.ctxDe(point.ficheDe(appt.clientId));', 'const ctx = point.ctxDe(undefined);'],
  ['la facture ne suit plus le rituel', PAGE, '    if (maj) alignerFacturesDuRituel(maj, point.byId, tarifsFinaux.prixPlein, point.produits, tarifsFinaux.gesteDe, { argent: f, lockCount: tarifsFinaux.pricing.lockCount });\n', ''],
  ['le reste ne borne plus la remise', PAGE, "const plafond = geste === 'ajout' && ligne.verseXof > 0 ? apptDueXof(appt, point.byId) : netSans;", 'const plafond = netSans;'],
  ['les lignes s ecrivent sans avoir change', PAGE, '...(change ? { serviceIds: lignes.serviceIds, remisesLignes: lignes.remisesLignes, mains: lignes.mains, priceXof } : {}),', '...{ serviceIds: lignes.serviceIds, remisesLignes: lignes.remisesLignes, mains: lignes.mains, priceXof },'],
  ['la remise remplace celles du rituel', PAGE, '...(ajout > 0 ? { discountXof: (x.discountXof ?? 0) + ajout } : {}),', '...(ajout > 0 ? { discountXof: ajout } : {}),'],
  ['la page oublie d avertir pour le modele', PAGE, '{attend && <p className="trp-point__alerte">', '{false && <p className="trp-point__alerte">'],
  ['la piece d une formule se coche', DONNEES, ' && !piecesDesFormules.has(i.id) && ', ' && '],
  ['un plan a deux numeros se perd', PUR, " ?? parPlanEtJour.get(`${plan.plan}|${jour}`);", ';'],
  ['le modele du point ne se lit plus qu au reglage', DONNEES, 'modelePoint: modeleVu ?? settings.relances?.modelePoint === true,', 'modelePoint: settings.relances?.modelePoint === true,'],
  ['le jour suit le poste', DONNEES, 'const aujourdhui = momentDuSalon().jour;', 'const aujourdhui = new Date().toISOString().slice(0, 10);'],
  ['les montants ne sont plus ceux du Carnet', DONNEES, 'const reste = annule ? 0 : apptDueXof(a, byId);', 'const reste = annule ? 0 : apptNetXof(a, byId);'],
  ['la page sort de Vente & Caisse', ROUTES, "      { path: '/point', horsMenu: true, label: 'Le point d’une cliente', icon: HandCoins, Component: lazy(() => import('./clients/LePoint')) },\n", ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ecris = (f, contenu) => {
  let derniere;
  for (let i = 0; i < 25; i++) {
    try { writeFileSync(path.join(racine, f), contenu); return; } catch (e) { derniere = e; pause(200); }
  }
  throw derniere;
};

if (!prouve) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, () => b);
      ecris(fichier, crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = await lanceLeBanc();
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        ecris(fichier, gardes[fichier]);
      }
    }
  } finally {
    for (const f of fichiers) {
      try { ecris(f, gardes[f]); } catch { console.log(`RESTAURATION RATEE de ${f} : la panne y est peut-etre restee. Remede : git checkout -- ${f}`); }
    }
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
