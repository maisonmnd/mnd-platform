import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA VISIO RELUE AVANT DE PARTIR, ET SA CONSULTATION, EPROUVEES - 18 novembre 2026.
   `node scripts/verifie-la-visio-relue.mjs` : le banc
   (verifie-la-visio-relue.harnais.ts), dans un processus fils. Il rejoue la
   regle pure, le VRAI facteur envois-partent (esbuild remplace ses imports
   `npm:` par une base, un Meta et un Deno simules) et la file A du Trone.
   Rien ne touche la vraie base, aucun message ne part.

   `--prouve` : chaque faute est posee une a une dans le vrai fichier (dans
   l'original ET dans sa copie quand la regle est recopiee), copie gardee,
   restauration dans un finally, empreintes comparees ; le banc doit crier a
   chacune. Les deux defauts des essais du 18 novembre 2026 y reviennent : le
   lien d'une visio annulee ou deplacee qui part a 8 h, et la consultation
   d'une visio refusee laissee « a relire ». */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-la-visio-relue.harnais.ts');

const fauxModules = {
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^(npm:|https:\/\/esm\.sh)/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: /supabase-js/.test(a.path)
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default {};',
    }));
  },
};

async function lanceLeBanc() {
  const dossier = path.join(racine, 'node_modules', '.cache', `verifie-la-visio-relue-${process.pid}`);
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', timeout: 300_000 });
  } catch (e) {
    return { status: 3, stdout: '', stderr: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PORTE = 'src/shared/porte-des-modeles-pur.ts';
const EP = 'supabase/functions/envois-partent/index.ts';
/** La regle recopiee : l'original et sa copie dans le facteur, ensemble. */
const REGLE = [PORTE, EP];
const A_RELIRE = 'src/shared/consultation-a-relire-pur.ts';
const FILE_A = 'src/apps/trone/routes/clients/ConsultationsGratuites.tsx';

/** [ce qui casse, le ou les fichiers, le texte juste, le texte faux] */
const PANNES = [
  ['le facteur ne relit pas la visio', EP, '    if (l.data.type === TYPE_DE_LA_VISIO) {', '    if (false) {'],
  ['la relecture oublie l annulation', REGLE, "  if (v.statut === 'annulée') return 'la visio a été annulée';\n", ''],
  ['la relecture oublie le deplacement', REGLE, "  if (aCotonou.slice(0, 10) !== (l.dateRdv ?? '') || aCotonou.slice(11, 16) !== (l.heure ?? '')) return 'la visio a été déplacée';\n", ''],
  ['la relecture oublie le retour a la meme heure', REGLE, "  if (Number.isFinite(deplacee) && Number.isFinite(depot) && deplacee > depot) return 'la visio a été déplacée depuis le dépôt';\n", ''],
  ['la relecture lit l heure de Londres', REGLE, '  const aCotonou = new Date(debut + DECALAGE_DE_COTONOU_MS).toISOString();', '  const aCotonou = new Date(debut).toISOString();'],
  ['la visio disparue part', REGLE, "  if (!v) return 'la visio n’existe plus';", '  if (!v) return null;'],
  ['la visio finie part', REGLE, "  if (Number.isFinite(fin) && fin <= maintenantMs) return 'l’heure de la visio est passée';\n", ''],
  ['une visio illisible perd son message', EP, "data: { ...l.data, statut: 'en-attente', partA: new Date(Date.now() + 60_000).toISOString(), detail: 'la visio n’a pas pu être relue", "data: { ...l.data, statut: 'échec', partA: new Date(Date.now() + 60_000).toISOString(), detail: 'la visio n’a pas pu être relue"],
  ['la file A garde la consultation d une visio refusee', A_RELIRE, ' && !visioSansSuite(o);', ';'],
  ['la file A oublie qu une visio a ete demandee', A_RELIRE, "  o.answers?.rendezVous === 'visio' && !o.visio;", '  false;'],
  ['l ecran de la file A filtre a la main', FILE_A, 'const aRelire = queue.filter(estARelire)', "const aRelire = queue.filter((o) => o.modalite === 'auto' && o.status !== 'fermée' && !(o.paidXof > 0))"],
];

const fichiersDe = (x) => (Array.isArray(x) ? x : [x]);
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!process.argv.includes('--prouve')) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.flatMap((p) => fichiersDe(p[1])))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, cibles, a, b] of PANNES) {
      let introuvable = '';
      for (const f of fichiersDe(cibles)) {
        const brut = gardes[f].toString('utf8');
        const crlf = brut.includes('\r\n');
        const texte = brut.replace(/\r\n/g, '\n');
        if (texte.split(a).length !== 2) { introuvable = f; break; }
        const casse = texte.replace(a, () => b);
        writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      }
      try {
        if (introuvable) { console.log(`INTROUVABLE ${nom} (${introuvable})`); muettes++; continue; }
        const r = await lanceLeBanc();
        const premier = ((r.stdout ?? '').match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 90);
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE   ${nom}${premier ? ` (${premier})` : r.stderr ? ` (${String(r.stderr).split('\n')[0].slice(0, 80)})` : ''}`);
      } finally {
        for (const f of fichiersDe(cibles)) writeFileSync(path.join(racine, f), gardes[f]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
