import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* SON PROCHAIN RITUEL, ÉPROUVÉ (2 novembre 2026).
   `node scripts/verifie-le-prochain-rituel.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la mémoire du bundle (un greffon
   d'esbuild remplace le texte lu), ou dans une copie que le harnais lit à la
   place du vrai fichier : jamais dans le dépôt, le banc se prouve sans rien
   toucher de l'arbre partagé. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = path.join(racine, 'src/shared/prochain-rituel-pur.ts');
const AGENDA = path.join(racine, 'src/shared/agenda.ts');
/* Lus par le harnais (readFileSync), pas importés : la panne passe par une copie. */
const LUS = {
  [path.join(racine, 'src/apps/trone/routes/vente/SonProchainRituel.tsx')]: 'PROCHAIN_BLOC',
  [path.join(racine, 'src/apps/trone/routes/vente/Caisse.tsx')]: 'PROCHAIN_CAISSE',
  [path.join(racine, 'src/apps/trone/routes/clients/_shared.tsx')]: 'PROCHAIN_FENETRE',
};
const BLOC = path.join(racine, 'src/apps/trone/routes/vente/SonProchainRituel.tsx');
const CAISSE = path.join(racine, 'src/apps/trone/routes/vente/Caisse.tsx');
const FENETRE = path.join(racine, 'src/apps/trone/routes/clients/_shared.tsx');

const PANNES = [
  /* ── le rythme ── */
  { nom: 'le rythme lu sur les seuls rituels identiques', fichier: PUR,
    avant: 'const porteuses = lues.filter((v) => rituel.ids.every((id) => v.r.ids.includes(id)));',
    apres: "const porteuses = lues.filter((v) => [...v.r.ids].sort().join('|') === [...rituel.ids].sort().join('|'));" },
  { nom: 'la moyenne au lieu de la médiane', fichier: PUR,
    avant: '? [Math.max(PLANCHER_DU_RYTHME_JOURS, medianInt(ecarts)), \'rituel\']',
    apres: "? [Math.max(PLANCHER_DU_RYTHME_JOURS, Math.round(ecarts.reduce((s, g) => s + g, 0) / ecarts.length)), 'rituel']" },
  { nom: 'pas de plancher de deux semaines', fichier: PUR,
    avant: '? [Math.max(PLANCHER_DU_RYTHME_JOURS, medianInt(ecarts)), \'rituel\']', apres: "? [medianInt(ecarts), 'rituel']" },
  { nom: 'une seule venue se croit mesurée', fichier: PUR,
    avant: '= ecarts.length > 0\n', apres: '= ecarts.length >= 0\n' },
  { nom: 'la cadence générale oubliée', fichier: PUR,
    avant: ": cadence ? [cadence, 'cadence'] : [RYTHME_PAR_DEFAUT_JOURS, 'defaut'];", apres: ": [RYTHME_PAR_DEFAUT_JOURS, 'defaut'];" },
  { nom: 'le défaut à trente jours', fichier: PUR,
    avant: 'export const RYTHME_PAR_DEFAUT_JOURS = 28;', apres: 'export const RYTHME_PAR_DEFAUT_JOURS = 30;' },
  { nom: 'une date visée dans le passé', fichier: PUR,
    avant: 'vers: attendu < demain ? demain : attendu,', apres: 'vers: attendu,' },
  { nom: 'la date visée depuis la première venue', fichier: PUR,
    avant: 'const derniere = jours[jours.length - 1] ?? rituel.date;', apres: 'const derniere = jours[0] ?? rituel.date;' },
  { nom: 'le paiement du jour oublié', fichier: PUR,
    avant: "    siennes.push({ clientId: o.clientId, date: paye.date.slice(0, 10), time: '23:59', status: 'honoré', serviceIds: [...paye.serviceIds] });\n",
    apres: '' },
  { nom: 'une séance de suite comptée comme une venue', fichier: PUR,
    avant: 'a.clientId === o.clientId && !(a.seriesIndex && a.seriesIndex > 1)', apres: 'a.clientId === o.clientId' },
  { nom: 'le successeur oublié', fichier: PUR,
    avant: 'proposable: o.proposable, successeur: o.successeur, estCreation: o.estCreation };',
    apres: 'proposable: o.proposable, successeur: undefined, estCreation: o.estCreation };' },
  { nom: 'le maître vide de Ma Couronne retenu', fichier: PUR,
    avant: "maitre: [...porteuses].reverse().find((v) => !!v.a.master?.trim())?.a.master?.trim() ?? '',",
    apres: "maitre: porteuses[porteuses.length - 1]?.a.master ?? ''," },
  { nom: 'le plus tard choisi d office', fichier: PUR,
    avant: 'if (mieux < 0 || r.vers < rituels[mieux].vers) mieux = i;', apres: 'if (mieux < 0 || r.vers > rituels[mieux].vers) mieux = i;' },
  { nom: 'une venue unique passe devant le rythme mesuré', fichier: PUR,
    avant: "    if (mesure && r.source !== 'rituel') return;\n", apres: '' },
  /* ── les places ── */
  { nom: 'les places partent d aujourd hui, pas de la date visée', fichier: PUR,
    avant: '    aujourdhui: debut,\n    placesDe: o.placesDe,', apres: '    aujourdhui: o.aujourdhui,\n    placesDe: o.placesDe,' },
  { nom: 'aucune place avant la date visée', fichier: PUR,
    avant: 'const avant = addDaysISO(o.vers, -JOURS_AVANT_LA_DATE);', apres: 'const avant = o.vers;' },
  { nom: 'une place le jour même', fichier: PUR,
    avant: "  const demain = addDaysISO(o.aujourdhui, 1);\n  const avant = addDaysISO(o.vers, -JOURS_AVANT_LA_DATE);",
    apres: "  const demain = o.aujourdhui;\n  const avant = addDaysISO(o.vers, -JOURS_AVANT_LA_DATE);" },
  { nom: 'les places dans le désordre', fichier: PUR,
    avant: "    .sort((a, b) => a.iso.localeCompare(b.iso) || minutes(a.heure) - minutes(b.heure));", apres: ';' },
  { nom: 'sa date glissée sans le dire', fichier: PUR,
    avant: "pourquoi: p.iso === vers ? 'Le jour où son rythme la ramène.' : `Son rythme tombe le ${o.jourDit(vers)}, ${o.placesDe(vers).ferme ? 'jour de fermeture' : 'complet'} : la place suivante.` }",
    apres: "pourquoi: 'Le jour où son rythme la ramène.' }" },
  /* ── le maître, la fiche ── */
  { nom: 'un SÍNSIN chez son maître habituel', fichier: PUR,
    avant: '  if (o.noms.some(estUnSinsin) && o.maitres.includes(MAITRE_DES_SINSIN)) return MAITRE_DES_SINSIN;\n', apres: '' },
  { nom: 'un maître que la branche ne porte plus', fichier: PUR,
    avant: 'if (o.habituel && maitresPermis(o.noms, o.maitres).includes(o.habituel)) return o.habituel;', apres: 'if (o.habituel) return o.habituel;' },
  { nom: 'une formule posée sans sa fiche', fichier: PUR,
    avant: "  if (c.formule) return 'Elle a une formule en cours : sa séance se rattache à son contrat dans sa fiche';\n", apres: '' },
  { nom: 'la remise famille oubliée', fichier: PUR,
    avant: "  if ((c.remiseFamillePct ?? 0) > 0) return", apres: '  if (false) return' },
  /* ── le rendez-vous, l'écriture ── */
  { nom: 'posé en attente', fichier: PUR, avant: "    status: 'confirmé',\n    source: 'trone',", apres: "    status: 'en attente',\n    source: 'trone'," },
  { nom: 'la confirmation décochée', fichier: PUR, avant: "    status: 'confirmé',\n    source: 'trone',", apres: "    status: 'confirmé',\n    source: 'trone',\n    sansConfirmation: true," },
  { nom: 'posé comme venu du site', fichier: PUR, avant: "    status: 'confirmé',\n    source: 'trone',", apres: "    status: 'confirmé',\n    source: 'site'," },
  { nom: 'la phrase sans l année', fichier: PUR,
    avant: '`Posé, confirmé : ${momentDuMessage(date, heure)}.`', apres: '`Posé, confirmé : ${date} à ${heure}.`' },
  { nom: 'la pose sans estampille', fichier: AGENDA,
    avant: 'const avec = [...prev, estampilleLaPose(rdv), ...estampilleLesPoses(o.suites ?? [])];', apres: 'const avec = [...prev, rdv, ...(o.suites ?? [])];' },
  { nom: 'les séances incluses perdues', fichier: AGENDA,
    avant: 'const avec = [...prev, estampilleLaPose(rdv), ...estampilleLesPoses(o.suites ?? [])];', apres: 'const avec = [...prev, estampilleLaPose(rdv)];' },
  { nom: 'la série jamais rattachée', fichier: AGENDA,
    avant: 'return o.attache ? o.attache(avec) : avec;', apres: 'return avec;' },
  /* ── le câblage : le bloc ── */
  { nom: 'posé sans relire la place', fichier: BLOC,
    avant: "    if (!laPlaceTient(fraiches, p.heure)) {\n      setIssue({ pose: false, texte: `La place du ${jourDit(p.iso)} à ${heureDuMessage(p.heure)} vient de partir.`, detail: 'Les places sont relues : touchez-en une autre.' });\n      return;\n    }\n",
    apres: '' },
  { nom: 'relu sur le carnet du rendu, pas celui du moment', fichier: BLOC,
    avant: 'const fraiches = placesDe(appointmentsStore.get(), blocagesStore.get(), tarif.dureeMin, maitre)(p.iso);',
    apres: 'const fraiches = placesDe(tous, blocages, tarif.dureeMin, maitre)(p.iso);' },
  { nom: 'écrit à côté du geste de la fenêtre', fichier: BLOC,
    avant: 'const pose = poseUnRendezVous(rdv);', apres: 'appointmentsStore.set((prev) => [...prev, rdv]); const pose = rdv;' },
  { nom: 'un rituel qui demande sa fiche posé quand même', fichier: BLOC,
    avant: '    if (casAPart(p.iso)) {\n      onALaMain({ clientId, serviceIds: rituel.ids, date: p.iso, time: p.heure, master: maitre });\n      return;\n    }\n', apres: '' },
  { nom: '« Pas maintenant » pose quand même', fichier: BLOC,
    avant: 'onClick={() => setFerme(true)}>Pas maintenant</Button>',
    apres: 'onClick={() => { setFerme(true); if (places[0]) toucheLaPlace(places[0]); }}>Pas maintenant</Button>' },
  { nom: 'la Caisse oublie les successeurs', fichier: BLOC, avant: '    successeur: (id) => SUCCESSEURS[id],\n', apres: '' },
  { nom: 'la Caisse oublie le paiement du jour', fichier: BLOC, avant: '    payeAujourdhui: { date: jour, serviceIds },\n', apres: '' },
  { nom: 'la cadence lue avec un rendez-vous à venir', fichier: BLOC,
    avant: 'const c = predictNextVisit(sesVenues, clients, clientId, aujourdhui);', apres: 'const c = predictNextVisit(siens, clients, clientId, aujourdhui);' },
  { nom: 'tarifé sans la longueur du jour', fichier: BLOC,
    avant: 'const t = tarifsDuRituel({ serviceIds: [...ids], longueur }, {', apres: 'const t = tarifsDuRituel({ serviceIds: [...ids] }, {' },
  { nom: 'les fauteuils oubliés', fichier: BLOC, avant: '      bloques: plagesBloquees(murs, branch.id, iso, qui),\n      sieges,\n', apres: '      bloques: plagesBloquees(murs, branch.id, iso, qui),\n' },
  { nom: 'un annulé occupe un fauteuil', fichier: BLOC,
    avant: ".filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé')", apres: '.filter((a) => a.branchId === branch.id && a.date === iso)' },
  { nom: 'la confirmation coupée à la Caisse', fichier: BLOC,
    avant: '      numeroAPrevenir: numero,\n    });', apres: '      numeroAPrevenir: numero,\n    });\n    rdv.sansConfirmation = true;' },
  { nom: 'un tiret long à l écran', fichier: BLOC,
    avant: '>Rien de posé. Perle le lui proposera avant sa date de cadence.<', apres: '>Rien de posé — Perle le lui proposera.<' },
  /* ── le câblage : la Caisse et la fenêtre ── */
  { nom: 'la Caisse ne monte pas le bloc', fichier: CAISSE,
    avant: '                    jour={reussite.jour}\n', apres: '' },
  { nom: 'le jour de la vente perdu', fichier: CAISSE, avant: '      jour: dateVente,\n      longueur,\n    });', apres: '      jour: todayIso(),\n      longueur,\n    });' },
  { nom: 'la fenêtre écrit à part', fichier: FENETRE,
    avant: '      poseUnRendezVous(created, {\n        suites,\n        attache: estSuite ? (avec) => attacheSeance(avec, created.id, suiteDe) : undefined,\n      });',
    apres: '      appointmentsStore.set((prev) => {\n        const avec = [...prev, estampilleLaPose(created), ...estampilleLesPoses(suites)];\n        return estSuite ? attacheSeance(avec, created.id, suiteDe) : avec;\n      });' },
];

/* Le décor du navigateur que les magasins attendent (localStorage, window,
   document), comme le banc de la revue clients-coeur ; l'horloge reste vraie. */
const DECOR = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k), key: () => null, length: 0 };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
const __ecoutes = new Map();
globalThis.window = {
  addEventListener(t, f) { if (!__ecoutes.has(t)) __ecoutes.set(t, []); __ecoutes.get(t).push(f); },
  dispatchEvent(e) { for (const f of __ecoutes.get(e.type) ?? []) f(e); return true; },
  location: { href: '', hash: '' }, setTimeout: () => 0,
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-prochain-rituel-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne || LUS[path.normalize(panne.fichier)]) return;
        const cible = path.normalize(panne.fichier);
        b.onLoad({ filter: /(prochain-rituel-pur|agenda)\.ts$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          const t = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
          if (t.split(panne.avant).length !== 2) throw new Error(`panne introuvable (ou double) : ${panne.nom}`);
          return { contents: t.replace(panne.avant, () => panne.apres), loader: 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-prochain-rituel.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: { js: DECOR },
      plugins: [greffon],
    });
    const env = { ...process.env };
    const lu = panne && LUS[path.normalize(panne.fichier)];
    if (lu) {
      const t = readFileSync(panne.fichier, 'utf8').replace(/\r\n/g, '\n');
      if (t.split(panne.avant).length !== 2) throw new Error(`panne introuvable (ou double) : ${panne.nom}`);
      const copie = path.join(dossier, path.basename(panne.fichier));
      writeFileSync(copie, t.replace(panne.avant, () => panne.apres));
      env[lu] = copie;
    }
    return spawnSync(process.execPath, [sortie], { cwd: racine, env, encoding: 'utf8' });
  } finally {
    setTimeout(() => rmSync(dossier, { recursive: true, force: true }), 0);
  }
};

const prouve = process.argv.includes('--prouve');
const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stderr.write(net.stderr); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const r = await lance(p);
    const crie = r.status !== 0;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
