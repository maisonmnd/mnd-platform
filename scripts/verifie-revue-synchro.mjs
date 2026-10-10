import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE LOT « SYNCHRO » DE LA REVUE, EPROUVE — `node scripts/verifie-revue-synchro.mjs`.

   10 octobre 2026. Le banc (`verifie-revue-synchro.harnais.ts`) joue une
   scene par processus fils, sur la VRAIE synchronisation et un faux serveur.
   Le dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute, une a une, et exige que le banc CRIE :
     - dans le code construit, la faute est substituee au chargement par
       esbuild (rien n'est ecrit dans le depot : d'autres equipes y
       travaillent en meme temps) ;
     - pour les deux controles qui lisent la source sur le disque (le texte
       de la coquille, la garde du merci), le fichier est copie, la faute
       ecrite, le banc lance, et le fichier RESTAURE dans un `finally`.
   Avant et apres, l'empreinte md5 de chaque fichier du lot doit etre la
   meme : la preuve ne laisse rien derriere elle. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-synchro-'));

const SCENES = ['appels', 'purge', 'purge-hors-ligne', 'relecture-ratee', 'laissez-passer', 'realignement-faux',
  'relecture-depassee', 'supprimee-ailleurs', 'remise-a-blanc', 'traces', 'merci', 'tirets',
  /* La reprise apres relecture (10 octobre 2026). */
  'verrou-hors-ligne', 'reprise-sans-session', 'poussee-sans-geste', 'conflit-supprime'];

const LOT = [
  'src/shared/appels-en-attente.ts', 'src/shared/sync.ts', 'src/shared/store.ts', 'src/shared/file-d-attente.ts',
  'src/shared/auth.ts', 'src/shared/traces.ts', 'src/shared/whatsapp.ts', 'src/shared/ecriture-automatique.ts',
  'src/apps/trone/houseReset.ts', 'src/apps/trone/shell/Shell.tsx', 'src/apps/trone/shell/useParrainageVivant.ts',
  'src/apps/trone/routes/systeme/QuiFaitQuoi.tsx',
];

/* LES FAUTES, UNE PAR CORRECTION : le code d'avant, remis a sa place.
   `disque` : le controle lit la source sur le disque. */
const FAUTES = [
  { n: 5, nom: 'vidage d avant (sans verrou, retrait apres l envoi, file lue une fois)', fichier: 'src/shared/appels-en-attente.ts', scenes: ['appels'], subs: [
    ['verrous && typeof verrous.request === \'function\' ? await verrous.request(VERROU(), videSousVerrou) : await videSousVerrou()', 'await videSousVerrou()'],
    ['  for (;;) {\n    const a = lisLesAppels()[0];\n    if (!a || vus.has(a.id)) break;\n    vus.add(a.id);\n    ecris(lisLesAppels().filter((x) => x.id !== a.id));\n', '  for (const a of lisLesAppels()) {\n'],
    ['    if (issue === \'coupure\') { ecris([a, ...lisLesAppels().filter((x) => x.id !== a.id)]); break; }\n    if (issue !== \'parti\') noteUnRefus(a, issue);\n    else partis += 1;\n',
      '    if (issue === \'coupure\') break;\n    if (issue !== \'parti\') noteUnRefus(a, issue);\n    else partis += 1;\n    ecris(lisLesAppels().filter((x) => x.id !== a.id));\n'],
  ] },
  { n: 6, nom: 'le refus du stockage avale', fichier: 'src/shared/appels-en-attente.ts', scenes: ['appels'], subs: [
    ['catch { tenu = false; }', 'catch { /* stockage refuse */ }'],
  ] },
  { n: 32, nom: 'document : la purge s inscrit comme un geste', fichier: 'src/shared/sync.ts', scenes: ['purge', 'purge-hors-ligne'], subs: [
    ['    if (estUnePurge(store.key)) {\n      if (timer) { clearTimeout(timer); timer = undefined; }\n      syncMark.ok(`doc:${key}`);', '    if (false) {\n      if (timer) { clearTimeout(timer); timer = undefined; }\n      syncMark.ok(`doc:${key}`);'],
  ] },
  { n: 32, nom: 'collection : la purge s inscrit comme un geste', fichier: 'src/shared/sync.ts', scenes: ['purge-hors-ligne'], subs: [
    ['    if (estUnePurge(store.key)) {\n      if (timer) { clearTimeout(timer); timer = undefined; }\n      lu = false;', '    if (false) {\n      if (timer) { clearTimeout(timer); timer = undefined; }\n      lu = false;'],
  ] },
  { n: 84, nom: 'secretariat et bilans hors de la purge', fichier: 'src/shared/auth.ts', scenes: ['purge'], subs: [
    ["  'mnd_secretariat', 'mnd_bilans', 'mnd_notes_de_seance',\n", ''],
  ] },
  { n: 33, nom: 'relecture ratee prise pour le serveur vide', fichier: 'src/shared/sync.ts', scenes: ['relecture-ratee'], subs: [
    ['        if (lecture) { syncMark.fail(table, lecture.message); return false; }\n        const items2', '        const items2'],
  ] },
  { n: 33, nom: 'laissez-passer perdu sur une coupure', fichier: 'src/shared/sync.ts', scenes: ['laissez-passer'], subs: [
    ['        if (error && purgeVoulue && estPassager(error.message)) purgesAutorisees.add(table);\n', ''],
  ] },
  { n: 33, nom: 'le realignement rend vrai', fichier: 'src/shared/sync.ts', scenes: ['realignement-faux'], subs: [
    ['        if (aPousser) planifiePoussee();\n        return false;', '        if (aPousser) planifiePoussee();\n        return true;'],
  ] },
  { n: 35, nom: 'la lecture depassee s applique', fichier: 'src/shared/sync.ts', scenes: ['relecture-depassee'], subs: [
    ['    if (lu && pousseesEnVol > 0) { relectureDue = true; return; }\n', ''],
    ['    if (generation !== generationAuDepart || pousseesEnVol > 0 || timer) {', '    if (false) {'],
  ] },
  { n: 72, nom: 'arbitre : la ligne connue absente repart', fichier: 'src/shared/file-d-attente.ts', scenes: ['supprimee-ailleurs'], subs: [
    ['      if (!s && e.connue) {', '      if (false) {'],
  ] },
  { n: 72, nom: 'direct : le geste local tient contre la suppression', fichier: 'src/shared/sync.ts', scenes: ['supprimee-ailleurs'], subs: [
    ["const supprimeeAilleurs = payload.eventType === 'DELETE' && enAttente.op === 'set' && enAttente.connue === true;", 'const supprimeeAilleurs = false;'],
  ] },
  { n: 72, nom: 'le conflit de la ligne supprimee se cache', fichier: 'src/shared/file-d-attente.ts', scenes: ['supprimee-ailleurs'], subs: [
    ["  if (c.leur === 'null') {", '  if (false) {'],
  ] },
  { n: 36, nom: 'une seule page de trace', fichier: 'src/shared/traces.ts', scenes: ['traces'], subs: [
    ['pagesAuPlus: number = PAGES_DE_TRACES_AU_PLUS', 'pagesAuPlus: number = 1'],
  ] },
  { n: 37, nom: 'la file survit a la remise a blanc', fichier: 'src/apps/trone/houseReset.ts', scenes: ['remise-a-blanc'], subs: [
    ["(estCleDeLaMaison(k) || k.includes('::file::'))", 'estCleDeLaMaison(k)'],
  ] },
  { n: 34, nom: 'gardeLEcriture muette en pause', fichier: 'src/shared/ecriture-automatique.ts', scenes: ['merci'], subs: [
    ['      if (!peutEcrireSeul(nom)) return false;\n      magasin.set(...a);\n      return true;', '      if (peutEcrireSeul(nom)) magasin.set(...a);\n      return true;'],
  ] },
  { n: 34, nom: 'le merci part sans recompense ecrite', fichier: 'src/apps/trone/shell/useParrainageVivant.ts', disque: true, scenes: ['merci'], subs: [
    ['      if (!recompensesEcrites) return;\n', ''],
  ] },
  { n: 79, nom: 'la cle d unicite ne voyage pas', fichier: 'src/shared/whatsapp.ts', scenes: ['merci'], subs: [
    ['    ...(e.cleUnique ? { cleUnique: e.cleUnique } : {}),\n', ''],
  ] },
  /* ── LA REPRISE APRES RELECTURE ── */
  { n: 32, nom: 'reprise : la relecture rejoue la file sans session', fichier: 'src/shared/sync.ts', scenes: ['verrou-hors-ligne'], subs: [
    ['    if (attente.size > 0 && !(await sb.auth.getSession()).data.session) return;\n', ''],
  ] },
  { n: 32, nom: 'reprise : un refus anonyme vide la file (collection)', fichier: 'src/shared/sync.ts', scenes: ['reprise-sans-session'], subs: [
    ['          if (await refusSansSession()) return false;\n          syncMark.horsPortee(table); refuseeAuxDroits(tranche', '          syncMark.horsPortee(table); refuseeAuxDroits(tranche'],
  ] },
  { n: 32, nom: 'reprise : une suppression muette part sans session', fichier: 'src/shared/sync.ts', scenes: ['reprise-sans-session'], subs: [
    ['        if (await refusSansSession()) { if (purgeVoulue) purgesAutorisees.add(table); return false; }\n', ''],
  ] },
  { n: 32, nom: 'reprise : un refus anonyme vide la file (document)', fichier: 'src/shared/sync.ts', scenes: ['reprise-sans-session'], subs: [
    ['      if (await refusSansSession()) return;\n', ''],
  ] },
  { n: 35, nom: 'reprise : la poussee reussie n avance pas le compteur', fichier: 'src/shared/sync.ts', scenes: ['poussee-sans-geste'], subs: [
    ['        sortDeLaFile(recus(attente, next));\n        generation += 1;\n', '        sortDeLaFile(recus(attente, next));\n'],
  ] },
  { n: 6, nom: 'reprise : tout refus du stockage parle d une piece trop lourde', fichier: 'src/shared/appels-en-attente.ts', scenes: ['appels'], subs: [
    ['  return place && piece ? TROP_LOURD_POUR_ATTENDRE : APPAREIL_PLEIN_POUR_ATTENDRE;', '  return TROP_LOURD_POUR_ATTENDRE;'],
  ] },
  { n: 72, nom: 'reprise : null lu comme une ligne { valeur: null }', fichier: 'src/shared/file-d-attente.ts', scenes: ['conflit-supprime'], subs: [
    ["  if (j === null || j === 'null') return null;", '  if (j === null) return null;'],
  ] },
  { n: 72, nom: 'reprise : Ce qui differe detaille une suppression', fichier: 'src/apps/trone/shell/Shell.tsx', disque: true, scenes: ['conflit-supprime'], subs: [
    ['              if (c.notre === null || supprimee || champs.length === 0) return null;', '              if (c.notre === null || champs.length === 0) return null;'],
  ] },
  { n: 72, nom: 'reprise : la suppression datee de notre geste', fichier: 'src/apps/trone/shell/Shell.tsx', disque: true, scenes: ['conflit-supprime'], subs: [
    ["{supprimee ? `Gardée · supprimée ailleurs · constatée le ${heure(c.vuLe)}` : `${notreGagne ? 'Écartée' : 'Gardée'} · ailleurs · ${heure(c.leurAt)}`}", "{notreGagne ? 'Écartée' : 'Gardée'} · ailleurs · {heure(c.leurAt)}"],
  ] },
  { n: 38, nom: 'tiret cadratin pour une valeur absente', fichier: 'src/apps/trone/shell/Shell.tsx', disque: true, scenes: ['tirets'], subs: [
    ["if (v === undefined || v === null || v === '') return 'vide';", "if (v === undefined || v === null || v === '') return '—';"],
  ] },
];

/* La faute, appliquee a un texte : chaque motif doit y etre UNE fois, sinon
   la preuve refuse de conclure (une faute qui ne s'applique pas ne prouve rien). */
const appliqueLaFaute = (texte, subs) => {
  let t = texte.replace(/\r\n/g, '\n');
  for (const [avant, apres] of subs) {
    const n = t.split(avant).length - 1;
    if (n !== 1) throw new Error(`motif trouve ${n} fois : ${avant.slice(0, 70)}`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const fauxSupabase = {
  name: 'faux-supabase',
  setup(b) {
    b.onResolve({ filter: /\/supabase$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) || a.importer.includes('/src/')
      ? { path: path.join(racine, 'scripts/faux-supabase.ts') } : undefined));
  },
};
const fauteEnMemoire = (faute) => ({
  name: 'faute-en-memoire',
  setup(b) {
    const cible = path.join(racine, faute.fichier);
    b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
      if (path.resolve(a.path) !== cible) return undefined;
      return { contents: appliqueLaFaute(readFileSync(cible, 'utf8'), faute.subs), loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(cible) };
    });
  },
});

const construis = async (faute) => {
  const plugins = [fauxSupabase, ...(faute && !faute.disque ? [fauteEnMemoire(faute)] : [])];
  const commun = {
    bundle: true, format: 'esm', platform: 'node', logLevel: 'error', loader: { '.css': 'empty' }, plugins,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://faux', VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/trone/' }) },
  };
  await build({ ...commun, entryPoints: [path.join(racine, 'scripts/verifie-revue-synchro.harnais.ts')], outfile: path.join(dossier, 'banc.mjs') });
  /* Deux onglets : deux copies du module des appels, un seul stockage. */
  for (const o of ['a', 'b']) {
    await build({ ...commun, entryPoints: [path.join(racine, 'src/shared/appels-en-attente.ts')], outfile: path.join(dossier, `onglet-${o}.mjs`) });
  }
};

const joue = (scene) => {
  const r = spawnSync(process.execPath, [path.join(dossier, 'banc.mjs')], {
    cwd: racine, encoding: 'utf8', timeout: 90_000,
    env: { ...process.env, SCENE: scene, ONGLET_A: path.join(dossier, 'onglet-a.mjs'), ONGLET_B: path.join(dossier, 'onglet-b.mjs'), FAUX_ETAT: '' },
  });
  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).filter((l) => /^(OK|ECHEC)/.test(l) || /^\s+attendu/.test(l)).join('\n');
  return { status: r.status, sortie };
};

const empreintes = () => Object.fromEntries(LOT.map((f) => [f, createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex')]));

try {
  if (!prouve) {
    await construis(null);
    let ko = 0;
    for (const s of SCENES) {
      const r = joue(s);
      console.log(`-- scene ${s}\n${r.sortie}`);
      if (r.status !== 0 || !r.sortie) ko += 1;
    }
    console.log(ko === 0 ? '\nLe lot synchro tient : douze constats et la reprise, chacun eprouve.' : `\n${ko} scene(s) en echec.`);
    process.exitCode = ko === 0 ? 0 : 1;
  } else {
    const avant = empreintes();
    let tiennent = 0;
    for (const faute of FAUTES) {
      const cible = path.join(racine, faute.fichier);
      const copie = faute.disque ? readFileSync(cible) : null;
      let crie = false;
      let detail = '';
      try {
        if (faute.disque) writeFileSync(cible, appliqueLaFaute(copie.toString('utf8'), faute.subs));
        await construis(faute);
        for (const s of faute.scenes) {
          const r = joue(s);
          const echecs = r.sortie.split('\n').filter((l) => l.startsWith('ECHEC'));
          if (r.status !== 0 && echecs.length) { crie = true; detail = echecs[0]; }
        }
      } catch (e) {
        detail = `LA FAUTE NE S APPLIQUE PAS : ${e.message}`;
        crie = false;
      } finally {
        if (copie) writeFileSync(cible, copie);
      }
      if (crie) tiennent += 1;
      console.log(`${crie ? 'CRIE ' : 'MUET '} #${faute.n} ${faute.nom}\n       ${detail}`);
    }
    const apres = empreintes();
    const memes = LOT.every((f) => avant[f] === apres[f]);
    console.log(`\nEmpreintes md5 du lot identiques avant et apres la preuve : ${memes ? 'oui' : 'NON'}`);
    for (const f of LOT) console.log(`  ${apres[f]}  ${f}`);
    const tient = memes && tiennent === FAUTES.length;
    console.log(tient
      ? `\nLa preuve tient : les ${FAUTES.length} fautes remises font crier le banc.`
      : `\nLA PREUVE NE TIENT PAS : ${FAUTES.length - tiennent} faute(s) muette(s).`);
    process.exitCode = tient ? 0 : 1;
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
