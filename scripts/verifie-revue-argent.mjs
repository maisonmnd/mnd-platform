import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « ARGENT », EPROUVEE —
   `node scripts/verifie-revue-argent.mjs`

   Le banc (`verifie-revue-argent.harnais.ts`) tourne dans un PROCESSUS FILS,
   fuseau du Benin (TZ=Africa/Lagos, UTC+1) : la date de la carte cadeau se
   joue entre minuit et une heure. Le dossier temporaire s'efface dans un
   `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   plusieurs equipes y ecrivent en meme temps, et une faute posee sur le
   disque, meme une seconde, serait lue par leur `tsc` ou leur serveur de
   developpement. Elle est servie a esbuild au chargement du fichier, et au
   banc quand il lit une source ; l'empreinte md5 de chaque fichier est
   comparee avant et apres, pour prouver que rien n'a bouge. Une faute dont
   le texte ne se trouve plus (exactement une fois) dans le fichier fait
   echouer la preuve : elle ne prouverait plus rien. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const FAUTES = [
  { n: 39, fichier: 'src/shared/receipts.ts',
    avant: "|| !(e.amountXof > 0) || sensDe(e) !== 'entree') continue;", apres: '|| !(e.amountXof > 0)) continue;' },
  { n: 40, fichier: 'src/shared/finance.ts',
    avant: 'expensesStore.set((prev) => sansLesInteretsDeLEcheance(prev, emprunt, rang));',
    apres: 'expensesStore.set((prev) => prev.filter((d) => !(d.branchId === emprunt.branchId && d.category === CATEGORIE_INTERETS && d.label.includes(emprunt.preteur) && d.label.includes(marque))));' },
  { n: 40, fichier: 'src/shared/finance.ts',
    avant: 'return i < 0 ? depenses : [...depenses.slice(0, i), ...depenses.slice(i + 1)];',
    apres: 'return depenses.filter((d) => !(!d.empruntId && d.label === libelle));' },
  { n: 42, fichier: 'src/apps/trone/routes/finances/tiroirs.tsx',
    avant: '      + horsActiviteDeCaisse(name, keep);', apres: '      + 0;' },
  { n: 42, fichier: 'src/apps/trone/routes/finances/tiroirs.tsx',
    avant: '...lesTransferts, ...horsDuTiroir]', apres: '...lesTransferts]' },
  { n: 42, fichier: 'src/shared/caisse-du-soir-pur.ts',
    avant: '(c.livreAvecHorsActivite ? c.livreXof : c.livreXof + Math.round(horsActiviteJusquASonJourXof))', apres: '(c.livreXof)' },
  { n: 42, fichier: 'src/apps/trone/routes/finances/ClotureDuTiroir.tsx',
    avant: 'livreXof: livreDeLaCloture(derniereBrute, caisses.horsActiviteJusquAu(box.name, derniereBrute.date)) }',
    apres: 'livreXof: derniereBrute.livreXof }' },
  { n: 43, fichier: 'src/apps/trone/routes/finances/BasculeDOctobre.tsx',
    avant: 'faite && planDeLaBasculeFaite(toutes, branch.id, lisLesLots(branch.id), faite.plans))',
    apres: 'faite && planPropose(toutes.filter((c) => !c.creeeParLaBascule), branch.id, currency))' },
  { n: 43, fichier: 'src/apps/trone/routes/finances/bascule.ts',
    avant: "basculeDesCaisses: plan.etape === 'ouvrir'", apres: 'basculeDesCaisses: false' },
  { n: 43, fichier: 'src/shared/bascule-des-caisses-pur.ts',
    avant: "if (c.avantLaBascule) destins[c.name] = { sort: 'garder'", apres: "if (!c) destins[c.name] = { sort: 'garder'" },
  /* REPRISE (relecture du 10 octobre 2026). */
  { n: 39, fichier: 'src/shared/caisse-du-soir-pur.ts',
    avant: 'for (const m of o.horsActivite ?? [])', apres: 'for (const m of [] as NonNullable<typeof o.horsActivite>)' },
  { n: 39, fichier: 'src/apps/trone/routes/finances/ClotureDuTiroir.tsx',
    avant: '    horsActivite,\n  })), [branch.id, jour', apres: '  })), [branch.id, jour' },
  { n: 39, fichier: 'src/apps/trone/routes/finances/LaVeilleAValider.tsx',
    avant: '    horsActivite,\n  }), [branch.id, veille', apres: '  }), [branch.id, veille' },
  { n: 40, fichier: 'src/shared/finance.ts',
    avant: 'findIndex((d) => !d.empruntId && d.branchId', apres: 'findIndex((d) => d.branchId' },
  { n: 43, fichier: 'src/shared/bascule-des-caisses-pur.ts',
    avant: 'const enregistre = enregistres?.[branchId];', apres: 'const enregistre = Object.values(enregistres ?? {})[0];' },
  { n: 43, fichier: 'src/shared/bascule-des-caisses-pur.ts',
    avant: 'if (!caisses.some((c) => c.branchId === branchId && (c.avantLaBascule || c.creeeParLaBascule))) return undefined;', apres: '' },
  { n: 43, fichier: 'src/apps/trone/routes/finances/bascule.ts',
    avant: 'plans: { ...faite.plans, [branchId]:', apres: 'plans: { [branchId]:' },
  { n: 44, fichier: 'src/shared/depart-des-caisses-pur.ts',
    avant: 'c.branchId === branchId && !c.jusquAu && !c.archiveeLe;', apres: 'c.branchId === branchId;' },
  { n: 44, fichier: 'src/shared/depart-des-caisses-pur.ts',
    avant: '? { ...c, openingXof: 0, ouvertureAvantDepart: c.openingXof }', apres: '? { ...c, openingXof: 0 }' },
  { n: 45, fichier: 'src/apps/trone/routes/finances/objectifs.tsx',
    avant: 'const balance = soldeDuCoffre(moves, reglages);', apres: 'const balance = coffreBalance(moves);' },
  { n: 45, fichier: 'src/shared/finance.ts',
    avant: 'const depart = reglages.basculeDesCaisses ? reglages.caissesDepuis : undefined;', apres: 'const depart = undefined as string | undefined;' },
  { n: 46, fichier: 'src/shared/caisse-du-soir-pur.ts',
    avant: '/esp[eè]ces|cash|liquide/i.test(`${box.name}', apres: '/./.test(`${box.name}' },
  { n: 46, fichier: 'src/apps/trone/routes/finances/ClotureDuTiroir.tsx',
    avant: 'const coche = versement ?? versementParDefaut(box);', apres: 'const coche = versement ?? true;' },
  { n: 48, fichier: 'src/shared/caisse-du-soir-pur.ts',
    avant: "b.name !== 'KkiaPay' && !b.horsBilan);", apres: "b.name !== 'KkiaPay');" },
  { n: 48, fichier: 'src/apps/trone/routes/finances/LaVeilleAValider.tsx',
    avant: '    seComptent: new Set(tiroirsQuiSeComptent(boxes, branch.id).map((b) => b.name)),', apres: '' },
  { n: 49, fichier: 'src/apps/trone/routes/finances/SalonFoyer.tsx',
    avant: 'debut: todayISO() })', apres: 'debut: new Date().toISOString().slice(0, 10) })' },
  { n: 54, fichier: 'src/apps/trone/routes/vente/cartes-actions.ts',
    avant: 'date: jourLocal(), code });', apres: 'date: maintenant, code });' },
  { n: 54, fichier: 'src/apps/trone/routes/finances/tiroirs.tsx',
    avant: 'const jour = (m: { date: string }) => m.date.slice(0, 10);', apres: 'const jour = (m: { date: string }) => m.date;' },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

/* Le banc, bati avec ou sans une faute, joue dans un fils. */
async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-argent-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const substitue = { fait: 0 };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-revue-argent.harnais.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: sortie,
      logLevel: 'error',
      loader: { '.css': 'empty' },
      plugins: faute ? [{
        name: 'la-faute-remise',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            substitue.fait++;
            const contents = readFileSync(args.path, 'utf8').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
        __FAUTE__: JSON.stringify(faute ?? null),
      },
      banner: {
        /* Une horloge reglable (le 10 octobre 2026 a midi UTC), un stockage
           en memoire, une fenetre et un document sans navigateur. */
        js: `import { createRequire as __creeRequire } from 'node:module';
const require = __creeRequire(import.meta.url);
const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.__horloge = Date.parse('2026-10-10T12:00:00Z');
const __D = Date;
globalThis.Date = class extends __D {
  constructor(...a) { a.length ? super(...a) : super(globalThis.__horloge); }
  static now() { return globalThis.__horloge; }
};
globalThis.document = {
  body: { dataset: {}, appendChild() {} }, addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }),
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0 };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    const r = spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8', env: { ...process.env, TZ: 'Africa/Lagos' },
    });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}`, substitue: substitue.fait };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  let tiennent = 0;
  for (const f of FAUTES) {
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const crie = new RegExp(`^ECHEC #${f.n} `, 'm').test(r.sortie);
        /* Le fichier fautif est lu par esbuild (code) ou par le banc (source) :
           l'un des deux suffit, la faute a donc bien ete servie. */
        verdict = r.status !== 0 && crie
          ? `crie (${r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `)).slice(0, 110)})`
          : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} dans ${f.fichier} : ${verdict}`);
  }
  console.log(tiennent === FAUTES.length
    ? `\nLa preuve tient : ${tiennent} fautes remises, ${tiennent} cris, aucun fichier du depot touche (md5 identiques).`
    : `\nLA PREUVE NE TIENT PAS : ${FAUTES.length - tiennent} faute(s) sur ${FAUTES.length}.`);
  process.exitCode = tiennent === FAUTES.length ? 0 : 1;
}
