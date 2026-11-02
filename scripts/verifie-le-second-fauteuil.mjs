import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE SECOND FAUTEUIL EN LIGNE, EPROUVE (2 novembre 2026).
   `node scripts/verifie-le-second-fauteuil.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier. Les pannes vivent dans la memoire du bundle (un greffon
   d'esbuild remplace le texte lu) ou dans une copie hors du depot pour les
   fichiers que le harnais LIT (la migration, les fonctions Edge, les
   ecrans) : le banc se prouve sans rien toucher de l'arbre partage. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/agenda-pur.ts';
const LIB = 'src/apps/couronne/lib.ts';
const SITE = 'src/apps/revelateur/agenda.ts';
const PAGE = 'src/apps/revelateur/ilots/Reserver.tsx';
const SQL = 'supabase/migrations/0152_le_second_fauteuil_en_ligne.sql';
const DS = 'supabase/functions/demande-submit/index.ts';

/* Chaque panne : un fichier, une ou plusieurs paires [avant, apres]. */
const PANNES = [
  { nom: 'le samedi a 2 (la regle pure)', fichier: PUR,
    r: [['export const JOURS_DU_SECOND_FAUTEUIL: readonly number[] = [1, 2, 3, 4];', 'export const JOURS_DU_SECOND_FAUTEUIL: readonly number[] = [1, 2, 3, 4, 5];']] },
  { nom: 'le samedi a 2 (la base)', fichier: SQL,
    r: [['when (select i from le_jour) between 1 and 4', 'when (select i from le_jour) between 1 and 5']] },
  { nom: 'un seul au fauteuil qui ouvre 2 (la regle pure)', fichier: PUR,
    r: [['return auFauteuil >= 2 ? PLACES_EN_LIGNE_AU_PLUS : PLACES_EN_LIGNE;', 'return auFauteuil >= 1 ? PLACES_EN_LIGNE_AU_PLUS : PLACES_EN_LIGNE;']] },
  { nom: 'un seul au fauteuil qui ouvre 2 (la base)', fichier: SQL,
    r: [['and (select n from au_fauteuil) >= 2', 'and (select n from au_fauteuil) >= 1']] },
  { nom: 'plus que les fauteuils (la regle pure)', fichier: PUR,
    r: [['if (fauteuils < PLACES_EN_LIGNE_AU_PLUS) return PLACES_EN_LIGNE;', '']] },
  { nom: 'plus que les fauteuils (les portes)', fichier: PUR,
    r: [['return Math.min(n, plafond);', 'return n;']] },
  { nom: 'plus que les fauteuils (la base)', fichier: SQL,
    r: [['            and (select n from les_fauteuils) >= 2\n', '']] },
  { nom: 'le repli perdu quand l appel echoue (les portes)', fichier: PUR,
    r: [['Number.isInteger(lue) && lue >= 1 ? lue : PLACES_EN_LIGNE;', 'Number.isInteger(lue) && lue >= 1 ? lue : PLACES_EN_LIGNE_AU_PLUS;']] },
  { nom: 'le repli perdu quand l appel echoue (Ma Couronne garde une seconde place oubliee)', fichier: LIB,
    r: [['    else delete carte[iso];\n', '']] },
  { nom: 'le repli perdu quand l appel echoue (Ma Couronne retient une panne)', fichier: LIB,
    r: [['.then(({ data, error }) => (error ? null : data as unknown), () => null);', '.then(({ data }) => data as unknown, () => [] as unknown);']] },
  { nom: 'le repli perdu quand l appel echoue (le site rejette)', fichier: SITE,
    r: [['return r.ok ? carteDesPlaces(await r.json()) : {};', "if (!r.ok) throw new Error('places');\n      return carteDesPlaces(await r.json());"]] },
  { nom: 'le repli perdu quand l appel echoue (demande-submit)', fichier: DS,
    r: [['? Math.min(lues, PLACES_EN_LIGNE_AU_PLUS) : PLACES_EN_LIGNE;', '? Math.min(lues, PLACES_EN_LIGNE_AU_PLUS) : PLACES_EN_LIGNE_AU_PLUS;']] },
  { nom: 'le repli perdu sur une date illisible (le garde)', fichier: SQL,
    r: [['  exception when others then\n    places := null;', '  exception when others then\n    places := 2;']] },
  { nom: 'un SINSIN sur le fauteuil d Expert (le site)', fichier: SITE,
    r: [['const maitres = sinsin ? [MAITRE_DES_SINSIN]', 'const maitres = sinsin ? agenda.maitres']] },
  { nom: 'un SINSIN sur le fauteuil d Expert (la base)', fichier: SQL,
    r: [["if dessous > 0 and maitre <> 'Team'", 'if dessous > 0 and false']] },
  { nom: 'la migration qui garde sieges := 1', fichier: SQL,
    r: [['  begin\n    sieges := public.places_en_ligne(branche, jour::date);\n  exception when others then\n    sieges := null;\n  end;\n  sieges := greatest(1, coalesce(sieges, 1));', '  sieges := 1;']] },
  { nom: 'une RPC qui rend des noms', fichier: SQL,
    r: [['returns table (jour text, places int)', 'returns table (jour text, places int, equipe text)'],
      ["select to_char(d::date, 'YYYY-MM-DD'), public.places_en_ligne(p_branch, d::date)",
        "select to_char(d::date, 'YYYY-MM-DD'), public.places_en_ligne(p_branch, d::date), (select string_agg(t.data->>'name', ', ') from public.team t)"]] },
  { nom: 'places_en_ligne (le jour) ouvert aux clientes', fichier: SQL,
    r: [['revoke all on function public.places_en_ligne(text, date) from public, anon, authenticated;', 'grant execute on function public.places_en_ligne(text, date) to anon;']] },
  { nom: 'le garde double un maitre', fichier: SQL,
    r: [['if dessous > 0 and meme_maitre then', 'if false then']] },
  { nom: 'Ma Couronne oublie les places', fichier: LIB,
    r: [['capSimultane: placesEnLigneDe(branchId, dateIso),', 'capSimultane: 1,']] },
  { nom: 'le site oublie les places', fichier: PAGE,
    r: [['heuresLibres({ agenda, dateIso: iso, serviceIds, occupes, places: placesParJour })', 'heuresLibres({ agenda, dateIso: iso, serviceIds, occupes })']] },
  { nom: 'demande-submit juge a une place', fichier: DS,
    r: [['laPlaceTient({ ...agenda, sieges: places }', 'laPlaceTient({ ...agenda, sieges: PLACES_EN_LIGNE }']] },
  { nom: 'le miroir oublie le modele', fichier: PUR,
    r: [['return dans(semaine) || dans(modele);', 'return dans(semaine);']] },
  { nom: 'une fiche partie compte encore', fichier: PUR,
    r: [['    && (!f.archiveeLe || f.archiveeLe > iso)\n', '']] },
];

const lisLF = (rel) => readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
const applique = (panne) => {
  let t = lisLF(panne.fichier);
  for (const [avant, apres] of panne.r) {
    if (!t.includes(avant)) throw new Error(`panne introuvable : ${panne.nom} (${avant.slice(0, 60)})`);
    t = t.replace(avant, () => apres);
  }
  return t;
};

const lance = async (panne) => {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-second-fauteuil-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    const texte = panne ? applique(panne) : null;
    const cible = panne ? path.normalize(path.join(racine, panne.fichier)) : null;
    const greffon = {
      name: 'panne',
      setup(b) {
        if (!panne) return;
        b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
          if (path.normalize(args.path) !== cible) return undefined;
          return { contents: texte, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
        });
      },
    };
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-second-fauteuil.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
      banner: {
        js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
      },
      plugins: [greffon],
    });
    /* Le fichier LU par le harnais (readFileSync) : une copie hors du depot. */
    const env = { ...process.env };
    delete env.SECOND_FAUTEUIL_PANNE_FICHIER;
    delete env.SECOND_FAUTEUIL_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.SECOND_FAUTEUIL_PANNE_FICHIER = panne.fichier;
      env.SECOND_FAUTEUIL_PANNE_COPIE = copie;
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
    /* Une panne crie par une ÉPREUVE, jamais par un harnais qui tombe : un
       plantage ne prouverait rien de la règle. */
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
