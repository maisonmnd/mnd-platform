import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LES CORRECTIONS DE LA GRILLE, ÉPROUVÉES (lot 4) — 10 octobre 2026.
   `node scripts/verifie-les-corrections-de-la-grille.mjs` : le banc, dans un processus fils
   (le dossier temporaire s'efface dans un finally).
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune.
   La genèse des prix, lot 4 : la Retouche comprise et le SÍNSIN™ promis, une
   seule horloge de fidélité, 50 % et 100 % à la direction, le Regard déduit
   sous 30 jours, le socle de la création. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-les-corrections-de-la-grille-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    return build({
      entryPoints: [path.join(racine, 'scripts/verifie-les-corrections-de-la-grille.harnais.ts')],
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
  /* La Retouche comprise, puis la venue */
  ['la creation rappelle une creation', 'src/shared/retouche-comprise-pur.ts', '  if (!creation) return null;\n  const retouche', '  if (creation || !creation) return null;\n  const retouche'],
  ['la Retouche comprise se paie', 'src/shared/retouche-comprise-pur.ts', '    remisesLignes: [{ pct: 100 }], retoucheComprise: true,', '    retoucheComprise: true,'],
  ['apres la Retouche, encore une Retouche', 'src/shared/retouche-comprise-pur.ts', '    const venue = vivante(kids ? VENUE_KIDS : VENUE_ADULTE);', '    const venue = vivante(kids ? RETOUCHE_KIDS : RETOUCHE_ADULTE);'],
  ['une archivee s impose', 'src/shared/retouche-comprise-pur.ts', '  const vivante = (id: string) => catalogue.find((s) => s.id === id && s.archived !== true);', '  const vivante = (id: string) => catalogue.find((s) => s.id === id);'],
  ['le SINSIN promis s oublie', 'src/shared/retouche-comprise-pur.ts', '  const promis = !kids && rituel.serviceIds.some((id) => prometLeSinsin(id, rituel.date));', '  const promis = false;'],
  ['le SINSIN promis se paie', 'src/shared/retouche-comprise-pur.ts', '(i.offert || i.serviceId === SINSIN_ESSENTIEL ? { pct: 100 } : null)', '(i.offert ? { pct: 100 } : null)'],
  ['la Micro promet a tort', 'src/shared/retouche-comprise-pur.ts', "['sv-atl-i-nan', 'sv-atl-i-pic'];", "['sv-atl-i-mic', 'sv-atl-i-nan', 'sv-atl-i-pic'];"],
  ['la Mini promet encore en 2027', 'src/shared/retouche-comprise-pur.ts', "(date ?? '').slice(0, 10) < MINI_SANS_SINSIN_DES", 'true'],
  ['la Mini de 2026 perd sa promesse', 'src/shared/retouche-comprise-pur.ts', "|| (serviceId === CREATION_MINI && (date ?? '').slice(0, 10) < MINI_SANS_SINSIN_DES);", ';'],
  ['Nano et Pico ne promettent plus', 'src/shared/retouche-comprise-pur.ts', '  CREATIONS_AU_SINSIN_OFFERT.includes(serviceId)\n  ||', '  false\n  ||'],
  ['la reprise recopie le Regard', 'src/shared/reprise-nue.ts', "'retoucheComprise', 'sinsinOffert', 'regardDeduit', 'deduitSur',", "'retoucheComprise', 'sinsinOffert',"],
  ['la reprise suit le rythme avant la Retouche', 'src/apps/trone/routes/clients/actions.tsx', '  if (imposee) {\n    const gardeI', '  if (false && imposee) {\n    const gardeI'],
  ['la promesse ne passe pas a la Retouche posee', 'src/apps/trone/routes/clients/actions.tsx', '      sinsinOffert: imposee.sinsinOffert,\n', ''],
  /* Une seule horloge de fidelite */
  ['le Cercle ferme reconnait encore', 'src/shared/accounts.ts', '  const membreCercle = cercleOuvert && !convenu', '  const membreCercle = !convenu'],
  ['le Foyer ferme reconnait encore', 'src/shared/accounts.ts', '  const foyerAtteint = foyerOuvert && foyer &&', '  const foyerAtteint = foyer &&'],
  ['estDuCercle ignore l interrupteur', 'src/shared/offers.ts', '  actif && venues >= Math.max(1, seuil);', '  venues >= Math.max(1, seuil);'],
  ['le Cercle ouvert par defaut', 'src/shared/offers.ts', "createStore<boolean>('mnd_cercle_actif', false)", "createStore<boolean>('mnd_cercle_actif', true)"],
  ['les sceaux ouverts par defaut', 'src/shared/offers.ts', "createStore<boolean>('mnd_foyer_actif', false)", "createStore<boolean>('mnd_foyer_actif', true)"],
  ['les sceaux se posent Foyer ferme', 'src/apps/trone/shell/useParrainageVivant.ts', "if (foyerActifStore.get() && documentDescendu('mnd_foyer_tiers')", "if (documentDescendu('mnd_foyer_tiers')"],
  ['Ma Couronne ignore les interrupteurs', 'src/apps/couronne/Tabs.tsx', 'statutFidelite(client, clients, families, appts, seuil, seuilFoyer, cercleOuvert, foyerOuvert)', 'statutFidelite(client, clients, families, appts, seuil, seuilFoyer)'],
  ['la fiche ignore les interrupteurs', 'src/apps/trone/routes/clients/Customers.tsx', 'statutFidelite(client, clientsBranche, families, branchAppts, seuilCercle, seuilFoyer, cercleOuvert, foyerOuvert)', 'statutFidelite(client, clientsBranche, families, branchAppts, seuilCercle, seuilFoyer)'],
  ['la carte du Cercle se donne Cercle ferme', 'src/apps/trone/routes/clients/CarteModal.tsx', "c.cle !== 'cercle' || cercleActifStore.get()", "c.cle !== 'cercle' || true"],
  ['aux portes d un Cercle ferme', 'src/apps/trone/routes/equipe/Cercle.tsx', '.filter((c) => cercleOuvert && eligibleCercle(c)', '.filter((c) => eligibleCercle(c)'],
  ['plus d interrupteur du Cercle', 'src/apps/trone/routes/equipe/Parrainages.tsx', 'setCercleOuvert(!cercleOuvert);', 'void 0;'],
  ['plus d interrupteur des sceaux', 'src/apps/trone/routes/equipe/Parrainages.tsx', 'setFoyerOuvert(!foyerOuvert);', 'void 0;'],
  /* Les paliers */
  ['l Academie fait monter', 'src/shared/paliers.ts', " && !String(sv.categoryId ?? '').startsWith('aca-');", ';'],
  ['Portes closes fait monter', 'src/shared/paliers.ts', " && sv.categoryId !== 'cat-souverain'", ''],
  ['une privatisation fait monter', 'src/shared/paliers.ts', '  !!sv && !sv.privatise && ', '  !!sv && '],
  ['une visite sans prestation comptee compte', 'src/shared/paliers.ts', '    if (a.serviceIds.length > 0 && comptes.length === 0) continue;\n', ''],
  /* 50 % et 100 % : la direction */
  ['l equipe voit 50 et 100', 'src/shared/pricing.ts', '  TAUX_DE_REMISE.filter((p) => estDirection || p < SEUIL_DE_LA_DIRECTION_PCT);', '  [...TAUX_DE_REMISE];'],
  ['l equipe tape 100 %', 'src/shared/pricing.ts', '(estDirection ? 100 : SEUIL_DE_LA_DIRECTION_PCT - 1)', '(estDirection ? 100 : 100)'],
  ['l equipe remise tout en francs', 'src/shared/pricing.ts', 'Math.max(0, Math.floor((baseXof * (SEUIL_DE_LA_DIRECTION_PCT - 1)) / 100))', 'baseXof'],
  ['la fiche montre tous les taux', 'src/apps/trone/routes/clients/_shared.tsx', '{tauxPermis(estDirection).map((p) => (', '{TAUX_DE_REMISE.map((p) => ('],
  ['la fiche ne plafonne pas le %', 'src/apps/trone/routes/clients/_shared.tsx', 'Math.min(plafondDeRemisePct(estDirection), ', 'Math.min(100, '],
  ['la fiche ne plafonne pas les francs', 'src/apps/trone/routes/clients/_shared.tsx', 'Math.min(plafondDeRemiseXof(estDirection, effGross), ', 'Math.min(Infinity, '],
  ['la Caisse montre tous les taux', 'src/apps/trone/routes/vente/Caisse.tsx', '{[0, ...tauxPermis(estDirection)].map((pct) => (', '{[0, ...TAUX_DE_REMISE].map((pct) => ('],
  ['la remise gamme montre tous les taux', 'src/apps/trone/routes/vente/Caisse.tsx', '{[0, ...tauxPermis(estDirection)].map((taux) => (', '{[0, ...TAUX_DE_REMISE].map((taux) => ('],
  ['la Caisse ne plafonne pas les francs', 'src/apps/trone/routes/vente/Caisse.tsx', 'Math.min(plafondDeRemiseXof(estDirection, subXof), ', 'Math.min(Infinity, '],
  ['la serie montre tous les taux', 'src/apps/trone/routes/clients/SerieModal.tsx', '{tauxPermis(estDirection).map((pct) => (', '{TAUX_DE_REMISE.map((pct) => ('],
  ['les factures montrent tous les taux', 'src/apps/trone/routes/vente/Factures.tsx', 'DISC_OPTIONS.filter((v) => estDirection || v < 50 || v === l.discountPct)', 'DISC_OPTIONS.filter((v) => true || v === l.discountPct)'],
  /* Le Regard deduit sous 30 jours */
  ['le Regard au-dela de 30 jours', 'src/shared/regard-deduit-pur.ts', 'jours(a.date, rdv.date) <= JOURS_DU_REGARD', 'jours(a.date, rdv.date) <= 365'],
  ['un Regard deduit deux fois', 'src/shared/regard-deduit-pur.ts', '(!a.deduitSur || a.deduitSur === rdv.id)', 'true'],
  ['un Regard non regle se deduit', 'src/shared/regard-deduit-pur.ts', '    if (xof > 0) return', '    if (xof >= 0) return'],
  ['un Regard annule se deduit', 'src/shared/regard-deduit-pur.ts', " && a.status === 'honoré'", ''],
  ['le Regard au-dela de son prix', 'src/shared/regard-deduit-pur.ts', 'Math.min(Math.max(0, o.payeXof(a)), Math.max(0, o.prixDuRegard(regard)))', 'Math.max(0, o.payeXof(a))'],
  ['l Accueil cherche l Origine', 'src/shared/regard-deduit-pur.ts', 'index = i; regard = REGARD_ACCUEIL;', 'index = i; regard = REGARD_ORIGINE;'],
  ['la restauration oubliee', 'src/shared/regard-deduit-pur.ts', '    if (RESTAURATIONS.includes(id)) { index = i; regard = REGARD_ACCUEIL; return true; }\n', ''],
  ['la deduction sur la mauvaise ligne', 'src/shared/regard-deduit-pur.ts', 'if (o.estCreation(id)) { index = i;', 'if (o.estCreation(id)) { index = 0;'],
  ['la remise de ligne perd ses francs', 'src/shared/regard-deduit-pur.ts', 'xof: (remise?.xof ?? 0) + xof', 'xof'],
  ['le Regard ne se marque que d un cote', 'src/apps/trone/routes/clients/_shared.tsx', '    if (x.id === d.kokoId) return { ...x, deduitSur: acteId };\n', ''],
  ['la creation oublie de marquer', 'src/apps/trone/routes/clients/_shared.tsx', '      if (deduction) marqueLaDeduction(created.id, deduction);\n', ''],
  /* Le socle de la creation */
  ['une creation sans le socle', 'src/shared/nouvelle-grille-pur.ts', "{ id: 'sv-atl-i-pic', temps: 'maintenant', avant: 'Inclus : DÀNDÀN", "{ id: 'sv-atl-i-pic-x', temps: 'maintenant', avant: 'Inclus : DÀNDÀN"],
  ['la Kofi revient au socle', 'src/shared/nouvelle-grille-pur.ts', "apres: 'Inclus : la préparation, le DÀNDÀN™ post pose, la sortie signature, et La Retouche", "apres: 'Inclus : la préparation, le DÀNDÀN™ post pose, la sortie signature, huile Kòfí™ 100 ml, et La Retouche"],
  ['la carte ne rejoue pas le socle', 'src/shared/nouvelle-grille.ts', "'mnd_nouvelle_grille_2026_10_maintenant_v2'", "'mnd_nouvelle_grille_2026_10_maintenant'"],
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
