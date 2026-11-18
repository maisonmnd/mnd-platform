import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE GESTE CONFIRMÉ NE RECULE PAS, ÉPROUVÉ — `node scripts/verifie-le-direct-pendant-la-lecture.mjs [--prouve]`.

   17 novembre 2026, revue de la salle d'attente des envois. « Retenir » se
   voyait tout de suite (15 novembre), puis la relecture d'une minute, partie
   juste AVANT le geste et revenue juste après, remettait le message « en
   attente » : une lecture de toute la table prend sa photo au départ. Et la
   réponse d'une écriture, arrivée APRÈS un direct plus récent, remettait
   l'écran en arrière.

   Le premier correctif « recouvrait » la lecture de tout ce que le direct
   apportait pendant son vol : la revue du correctif l'a pris en faute (un
   écho en retard d'une frappe d'avant la photo est plus VIEUX qu'elle :
   l'écran reculait, puis la frappe suivante renvoyait l'ancien texte au
   serveur). L'étape `echo` le garde.

   La séance (`verifie-le-direct-pendant-la-lecture.harnais.ts`) fait tourner
   la VRAIE synchronisation sur le faux serveur, dont les lectures répondent
   tard avec une photo prise au départ. `--prouve` la rejoue sur la synchro
   d'avant ce chantier (`git show c67620eb:src/shared/sync.ts`, sans rien
   écrire dans le dépôt) : le banc doit y crier. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
/* La synchro d'avant la revue du 17 novembre 2026, épinglée : après le
   commit, HEAD porte déjà le correctif. */
const BASE = 'c67620eb';
const travail = mkdtempSync(path.join(tmpdir(), 'direct-lecture-'));
const LATENCE = 400;
let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

let substitutions = 0;
async function construis(sortie, syncDAvant) {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-direct-pendant-la-lecture.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://faux', VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/trone/' }) },
    plugins: [{
      name: 'faux-supabase',
      setup(b) {
        b.onResolve({ filter: /\/supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) || a.importer.includes('/src/')
          ? { path: path.join(racine, 'scripts/faux-supabase.ts') } : undefined));
        if (syncDAvant) {
          b.onLoad({ filter: /[\\/]src[\\/]shared[\\/]sync\.ts$/ }, () => { substitutions += 1; return { contents: syncDAvant, loader: 'ts', resolveDir: path.join(racine, 'src/shared') }; });
        }
      },
    }],
  });
}
const lance = (seance, env) => {
  const sortie = execFileSync(process.execPath, [seance], {
    env: { ...process.env, FAUX_LECTURE_TOT: '1', FAUX_LATENCE_MS: String(LATENCE), FAUX_ECHO_MS: '5', LATENCE: String(LATENCE), ...env },
    encoding: 'utf8', timeout: 60_000,
  });
  const ligne = sortie.split('\n').find((l) => l.startsWith('RESULTAT '));
  if (!ligne) throw new Error(`séance sans résultat :\n${sortie}`);
  return JSON.parse(ligne.slice(9));
};

try {
  const seance = path.join(travail, prouve ? 'avant.mjs' : 'seance.mjs');
  const avant = prouve ? execFileSync('git', ['show', `${BASE}:src/shared/sync.ts`], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : null;
  await construis(seance, avant);
  if (prouve && substitutions === 0) throw new Error('la synchro d’avant ne s’est pas substituée : la preuve ne prouverait rien');

  const r = lance(seance, {});
  dit('la séance lit le serveur', ['en-attente', 'en-attente', 'en-attente'], r.hydrate);
  /* `--prouve` : sous la synchro d'avant, `confirmee` n'existe pas ; B4 n'y
     a rien à compter, il peut passer, les autres crient. */
  dit('pendant le vol d’une lecture, la ligne confirmée s’applique', 'retenu', r.pendant);
  dit('B. la lecture partie avant elle ne la défait pas', 'retenu', r.apres);
  dit('D. la réponse d’une écriture se tait quand le direct a dit plus récent', ['en-envoi', false], [r.apresVieilleReponse, r.tue]);
  dit('… et s’applique quand il n’a rien dit depuis', ['envoyé', true], [r.apresReponseFraiche, r.neuve]);
  dit('D2. l’écho en retard de l’état d’avant ne la fait pas taire', ['en-attente', true], [r.apresEchoDAvant, r.echoDAvant]);
  dit('… ni l’écho de notre propre écriture', ['écarté', true], [r.apresNotreEcho, r.notreEcho]);
  dit('B3. une réponse devancée par le direct rend dépassée la lecture en vol : le direct plus récent reste', ['en-envoi', false], [r.apresDevancee, r.devancee]);
  dit('B4. vingt confirmations pendant une lecture : au plus deux lectures de la table, toutes les lignes au magasin',
    true, r.lecturesPendantLaRafale <= 2 && r.rafaleAuMagasin === 20);
  console.log(`       (${r.lecturesPendantLaRafale} lecture(s) pendant la rafale, ${r.rafaleAuMagasin}/20 au magasin)`);
  dit('B2. une ligne confirmée pendant la première lecture d’un magasin reste', 'retenu', r.premiereLectureApres);
  dit('E. une lecture sans geste pendant son vol s’applique comme avant', 'écarté', r.lectureSeule);

  const e = lance(seance, { ETAPE: 'echo', FAUX_ECHO_MS: '1350' });
  dit('écho en retard d’une première frappe pendant la lecture : l’écran et le serveur finissent sur la seconde',
    { hydrate: 'A', ecran: 'C', serveur: 'C' }, e);
} finally {
  rmSync(travail, { recursive: true, force: true });
}

if (prouve) {
  console.log(ko > 0 ? `PROUVÉ : la synchro d'avant fait crier le banc (${ko} échec(s)).` : 'NON PROUVÉ : la synchro d’avant passe le banc.');
  process.exit(ko > 0 ? 0 : 1);
}
console.log(ko ? `${ko} échec(s).` : 'Le geste confirmé ne recule pas : ni sous une lecture partie avant lui, ni sous un direct plus vieux, et l’écho en retard ne fait rien perdre.');
process.exit(ko ? 1 : 0);
