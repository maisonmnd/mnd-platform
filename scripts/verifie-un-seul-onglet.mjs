import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* UN SEUL ONGLET DU TRÔNE TIENT LA MAIN, ÉPROUVÉ — `node scripts/verifie-un-seul-onglet.mjs`.

   20 novembre 2026, le choix « A » de Yéman : comme WhatsApp Web. Le 18
   novembre, deux onglets du même Chrome avaient fait revenir « confirmé » un
   rendez-vous annulé. Un seul onglet travaille désormais ; l'autre se met en
   pause, n'écrit plus rien (ni magasin, ni file d'attente, ni conflit), et
   rend la main par « Utiliser ici ».

   La séance (`verifie-un-seul-onglet.harnais.ts`) tourne sur le faux stockage
   (`faux-stockage`, `faux-session`) et le faux serveur (`faux-supabase`), avec
   la VRAIE synchronisation. */

const racine = path.resolve(import.meta.dirname, '..');
const travail = mkdtempSync(path.join(tmpdir(), 'un-seul-onglet-'));
let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const seance = path.join(travail, 'seance.mjs');
await build({
  entryPoints: [path.join(racine, 'scripts/verifie-un-seul-onglet.harnais.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: seance, logLevel: 'error',
  loader: { '.css': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://faux', VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/trone/' }) },
  plugins: [{
    name: 'faux-supabase',
    setup(b) {
      b.onResolve({ filter: /\/supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) || a.importer.includes('/src/')
        ? { path: path.join(racine, 'scripts/faux-supabase.ts') } : undefined));
    },
  }],
});
const lance = (env) => {
  const sortie = execFileSync(process.execPath, [seance], { env: { ...process.env, FAUX_LATENCE_MS: '5', ...env }, encoding: 'utf8', timeout: 60_000 });
  const ligne = sortie.split('\n').find((l) => l.startsWith('RESULTAT '));
  if (!ligne) throw new Error(`séance sans résultat :\n${sortie}`);
  return JSON.parse(ligne.slice(9));
};

try {
  const m = lance({ ETAPE: 'main' });
  dit('cet onglet prend la main en s’ouvrant', true, m.prise);
  dit('tant qu’il la tient, il écrit', { pause: false, magasin: 'avant' }, m.avant);
  dit('un autre onglet la prend : celui-ci se met en pause, le note dans sa session, se recharge une fois',
    { pause: true, session: '1', rechargements: 1 }, m.pendant);
  dit('en pause, le magasin n’écrit plus, ni en mémoire ni au disque', ['avant', 'avant'], [m.magasinApres, m.disqueApres]);
  dit('en pause, la file d’attente commune n’est pas réécrite, et aucun conflit ne se note', [true, 0], [m.fileIntacte, m.conflits]);
  dit('un second avis ne recharge pas deux fois', 1, m.rechargementsFin);

  const c = lance({ ETAPE: 'course' });
  dit('deux onglets à la même seconde : la case porte notre identifiant, on garde la main', { pause: false, rechargements: 0 }, c);

  const r = lance({ ETAPE: 'retour' });
  dit('l’avis perdu : au retour sur l’onglet, la case le dit, pause', { sansEvenement: false, auRetour: true, rechargements: 1 }, r);

  const p = lance({ ETAPE: 'rechargé', FAUX_PAUSE: '1' });
  dit('rechargé en pause : il ne prend pas la main', [true, false], [p.pause, p.prisLaMain]);
  dit('… ne lit rien au serveur, ne se branche à rien, n’envoie rien, n’inscrit aucun geste, même quand l’autre onglet écrit',
    { lectures: 0, branche: 0, ecritures: 0, file: 0 }, { lectures: p.lectures, branche: p.branche, ecritures: p.ecritures, file: p.file });
  dit('« Utiliser ici » retire la pause et recharge', { session: null, rechargements: 1 }, p.apresUtiliserIci);
  /* LE TÉMOIN : le même onglet, hors pause, lit le serveur, et renvoie ce que
     l'autre onglet a posé dans le stockage comme un geste à lui — la panne du
     18 novembre. Sans lui, les zéros d'au-dessus ne prouveraient rien. */
  const t = lance({ ETAPE: 'rechargé' });
  dit('témoin hors pause : il lit le serveur et renvoie l’écriture de l’autre onglet (la panne du 18 novembre)',
    [false, true, true], [t.pause, t.lectures > 0, t.ecritures > 0]);

  /* LE TRÔNE, ET LUI SEUL, PREND LA MAIN — et l'onglet en pause n'affiche que l'écran de pause. */
  const main = readFileSync(path.join(racine, 'src/apps/trone/main.tsx'), 'utf8');
  dit('main.tsx : la main prise au démarrage, sauf en pause ; rien ne migre en pause ; l’écran de pause seul',
    [true, true, true],
    [/const enPause = ongletEnPause\(\);\s*if \(!enPause\) prendsLaMain\(/.test(main),
      /if \(!enPause\) \{[\s\S]*migreLeNomDeLaMaison\(\);[\s\S]*applyPendingReplace\(\);\s*\}/.test(main),
      /\{enPause \? \(\s*<OngletEnPause \/>\s*\) : \(\s*<AuthGate>/.test(main)]);
  const ailleurs = ['src/apps/couronne', 'src/apps/consultation', 'src/apps/lokaa'].filter((d) => {
    try { return execFileSync('git', ['grep', '-l', 'prendsLaMain', '--', d], { cwd: racine, encoding: 'utf8' }).trim() !== ''; } catch { return false; }
  });
  dit('aucune autre surface ne prend la main', [], ailleurs);
} finally {
  rmSync(travail, { recursive: true, force: true });
}

console.log(ko ? `${ko} échec(s).` : 'Un seul onglet tient la main : l’autre se tait, et la rend d’un geste.');
process.exit(ko ? 1 : 0);
