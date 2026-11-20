import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* DEUX POSTES SUR LA MÊME FICHE, ÉPROUVÉ — `node scripts/verifie-les-deux-postes.mjs [--prouve]`.

   20 novembre 2026. Yéman corrige le nom et l'anniversaire d'une cliente sur
   son téléphone ; le Mac du comptoir, resté sur la fiche d'avant, y fait
   signer l'autorisation de droit à l'image et renvoie la fiche ENTIÈRE : le
   nom et l'anniversaire reculent. La synchronisation pèse désormais champ par
   champ (`shared/fusion-des-champs.ts`) : à l'envoi, au direct, et quand la
   file se rejoue au retour du réseau.

   La séance (`verifie-les-deux-postes.harnais.ts`) fait tourner la VRAIE
   synchronisation sur le faux serveur. `--prouve` la rejoue sur la synchro et
   la file d'avant ce chantier (`git show <BASE>:…`, sans rien écrire dans le
   dépôt) : le banc doit y crier. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
/* Le tronc d'avant la fusion des champs, épinglé : après le commit, HEAD porte
   déjà le correctif. */
const BASE = 'fc98887b';
const travail = mkdtempSync(path.join(tmpdir(), 'deux-postes-'));
let ko = 0;
const dit = (nom, attendu, obtenu) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

let substitutions = 0;
async function construis(sortie, dAvant) {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-deux-postes.harnais.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://faux', VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/trone/' }) },
    plugins: [{
      name: 'faux-supabase',
      setup(b) {
        b.onResolve({ filter: /\/supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) || a.importer.includes('/src/')
          ? { path: path.join(racine, 'scripts/faux-supabase.ts') } : undefined));
        if (dAvant) {
          b.onLoad({ filter: /[\\/]src[\\/]shared[\\/](sync|file-d-attente)\.ts$/ }, (a) => {
            substitutions += 1;
            const nom = a.path.endsWith('sync.ts') ? 'sync' : 'file-d-attente';
            return { contents: dAvant[nom], loader: 'ts', resolveDir: path.join(racine, 'src/shared') };
          });
        }
      },
    }],
  });
}
const lance = (seance, env) => {
  const sortie = execFileSync(process.execPath, [seance], {
    env: { ...process.env, FAUX_LATENCE_MS: '20', FAUX_ECHO_MS: '5', ...env },
    encoding: 'utf8', timeout: 90_000,
  });
  const ligne = sortie.split('\n').find((l) => l.startsWith('RESULTAT '));
  if (!ligne) throw new Error(`séance sans résultat :\n${sortie}`);
  return JSON.parse(ligne.slice(9));
};

const lesDeux = { nom: 'Audrey', anniv: '1988-02-20', accord: 'signé' };
try {
  const seance = path.join(travail, prouve ? 'avant.mjs' : 'seance.mjs');
  const dAvant = prouve ? {
    sync: execFileSync('git', ['show', `${BASE}:src/shared/sync.ts`], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
    'file-d-attente': execFileSync('git', ['show', `${BASE}:src/shared/file-d-attente.ts`], { cwd: racine, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  } : null;
  await construis(seance, dAvant);
  if (prouve && substitutions < 2) throw new Error('la synchro d’avant ne s’est pas substituée : la preuve ne prouverait rien');

  if (!prouve) {
    const p = lance(seance, { ETAPE: 'pur' });
    dit('la règle : nous la signature, eux le nom, les deux restent', { id: 'x', nom: 'Audrey', tel: '1', accord: 'signé' }, p.deuxChamps);
    dit('le même champ, notre geste plus récent : le nôtre, une dispute, rien de perdu',
      [{ id: 'x', nom: 'Chadé', tel: '1' }, ['nom'], []], [p.disputeGagnee.ligne, p.disputeGagnee.disputes, p.disputeGagnee.perdus]);
    dit('le même champ, le leur plus récent : le leur, et le nôtre dit perdu',
      [{ id: 'x', nom: 'Audrey', tel: '1' }, ['nom']], [p.disputePerdue.ligne, p.disputePerdue.perdus]);
    dit('la même valeur des deux côtés n’est pas une dispute', [], p.memeValeur);
    dit('un champ que nous retirons part, leur champ neuf reste', { id: 'x', nom: 'Shadé', anniv: 'a' }, p.retraits);
    dit('un champ qu’ils retirent part, notre champ neuf reste', { id: 'x', nom: 'Shadé', accord: 'signé' }, p.retraitsLeur);
    dit('sans base, notre ligne part telle quelle', { id: 'x', nom: 'Shadé', tel: '1', accord: 'signé' }, p.sansBase);
    dit('des champs rangés autrement ne sont pas un changement', { a: { x: 1, y: 2 }, b: 3 }, p.ordre);
    dit('l’arbitre de la file : deux champs, fusionnés, à envoyer, sans conflit, l’entrée réécrite',
      { items: [{ id: 'x', nom: 'Audrey', tel: '1', accord: 'signé' }], aPousser: ['x'], conflits: 0, reecrite: { id: 'x', nom: 'Audrey', tel: '1', accord: 'signé' } },
      p.arbitreDeuxChamps);
    dit('l’arbitre : le même champ, le serveur plus récent : son nom, notre signature, un conflit sur le nom seul',
      { items: [{ id: 'x', nom: 'Audrey', tel: '1', accord: 'signé' }], conflits: [['nom']] }, p.arbitreDispute);
    dit('l’arbitre : une entrée sans base se tranche comme avant (ligne contre ligne)', { aPousser: [], conflits: 1 }, p.arbitreSansBase);
  }

  const r = lance(seance, {});
  dit('A. une copie d’avant fait signer : le serveur garde le nom et l’anniversaire de l’autre poste', lesDeux, r.A.serveur);
  dit('A. … et l’écran les reçoit, sans conflit', [lesDeux, []], [r.A.ecran, r.A.conflits]);
  dit('B. hors ligne, l’écriture de l’autre arrive en direct : l’écran porte les deux tout de suite', lesDeux, r.B.pendant);
  dit('B. … au retour du réseau, le serveur aussi, sans conflit', [lesDeux, lesDeux, []], [r.B.serveur, r.B.ecran, r.B.conflits]);
  dit('C. hors ligne, l’autre écrit sans que le direct le dise : la file rejouée garde les deux', [lesDeux, lesDeux, []], [r.C.serveur, r.C.ecran, r.C.conflits]);
  dit('D. le même champ des deux côtés : le plus récent gagne le nom, notre signature reste, un conflit sur le nom seul',
    [{ nom: 'Audrey', anniv: null, accord: 'signé' }, { nom: 'Audrey', anniv: null, accord: 'signé' }, [['nom']]],
    [r.D.serveur, r.D.ecran, r.D.conflits]);
} finally {
  rmSync(travail, { recursive: true, force: true });
}

if (prouve) {
  console.log(ko > 0 ? `PROUVÉ : la synchro d'avant fait crier le banc (${ko} échec(s)).` : 'NON PROUVÉ : la synchro d’avant passe le banc.');
  process.exit(ko > 0 ? 0 : 1);
}
console.log(ko ? `${ko} échec(s).` : 'Deux postes sur la même fiche : chacun garde ses champs, et seul un champ disputé se tranche.');
process.exit(ko ? 1 : 0);
