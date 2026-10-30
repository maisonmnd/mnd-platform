import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LA COULEUR SUR LE SITE, EPROUVEE - 30 octobre 2026.
   `node scripts/verifie-la-couleur-du-site.mjs` : le harnais tourne.
   `--prouve` : chaque panne est posee EN MEMOIRE (les modules par un greffon
   d esbuild, les fichiers lus en texte par COULEUR_PANNE), jamais sur le
   disque. Le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const PUR = 'src/apps/revelateur/couleur-pure.ts';
const AGENDA = 'src/apps/revelateur/agenda.ts';
const RES = 'src/apps/revelateur/ilots/Reserver.tsx';
const CONTENU = 'src/apps/revelateur/contenu.ts';
const GEN = 'scripts/genere-revelateur.mjs';

const PANNES = [
  ['la Lumiere ne se dit plus couleur', PUR, "(items.some(estUnGesteDeLaCouleur) && !/couleur|color/i.test(label) ?", '(false ?'],
  ['la famille n est plus reconnue', AGENDA, 'couleur: items.some(estUnGesteDeLaCouleur) }', 'couleur: false }'],
  ['la couleur apportee entre', PUR, 'avec votre (?:produit|couleur)/i', 'avec votre produit/i'],
  ['l ancien geste en double', PUR, 'if (vus.has(g)) return false; ', ''],
  ['l ancien passe devant le nomme', PUR, ' || sansNom(a) - sansNom(b)', ''],
  ['la grille des longueurs oubliee', PUR, 'grille.length > 0 ? grille : ', ''],
  ['un prix masque se dit', PUR, "const muet = s.hidePrice || s.priceMode === 'devis';", 'const muet = false;'],
  ['un geste masque au site se montre', PUR, ' && reservableSurLeSite(s, cats, agenda.masques)', ''],
  ['la porte dit ses gestes en desordre', PUR, '    .sort((a, b) => (ORDRE.indexOf(a) < 0 ? 9 : ORDRE.indexOf(a)) - (ORDRE.indexOf(b) < 0 ? 9 : ORDRE.indexOf(b)))\n', ''],
  ['la porte de la reservation disparait', RES, '{groupeDeLaCouleur && (', '{false && ('],
  ['l adresse famille=couleur ignoree', RES, ".get('famille') === 'couleur'", ".get('famille') === 'jamais'"],
  ['le bouton de la page n ouvre pas la couleur', CONTENU, ", famille: 'couleur' }", ' }'],
  ['le lien perd la famille', GEN, 'versLaReservation(p.besoin, p.cta.famille)', 'versLaReservation(p.besoin)'],
  ['la carte de l accueil disparait', CONTENU, "{ titre: 'Couleur végétale', pour: 'Ma couleur'", "{ titre: 'Couleur', pour: 'Ma couleur'"],
].map(([nom, fichier, avant, apres]) => ({ nom, fichier, avant, apres }));

const greffon = (panne) => ({
  name: 'panne-en-memoire',
  setup(b) {
    if (!panne || !/\.tsx?$/.test(panne.fichier)) return;
    const cible = path.join(racine, panne.fichier).replace(/\\/g, '/');
    b.onLoad({ filter: /\.tsx?$/ }, (args) => {
      if (args.path.replace(/\\/g, '/') !== cible) return undefined;
      return { contents: readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').replace(panne.avant, panne.apres), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
});

async function lance(panne) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-couleur-du-site-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-couleur-du-site.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' }, plugins: [greffon(panne)],
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }), 'import.meta.dirname': JSON.stringify(path.join(racine, 'scripts')) },
      banner: { js: 'globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.window = { addEventListener() {}, location: { href: \'\' } };' },
    });
    return spawnSync(process.execPath, [sortie], {
      cwd: racine, encoding: 'utf8',
      env: { ...process.env, ...(panne ? { COULEUR_PANNE: JSON.stringify(panne) } : {}) },
    });
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const net = await lance(null);
process.stdout.write(net.stdout);
if (net.status !== 0) { process.stdout.write(net.stderr ?? ''); process.exit(1); }
if (prouve) {
  let muettes = 0;
  for (const p of PANNES) {
    const t = readFileSync(path.join(racine, p.fichier), 'utf8').replace(/\r\n/g, '\n');
    if (!t.includes(p.avant)) { console.log(`INTROUVABLE  ${p.nom}`); muettes += 1; continue; }
    const r = await lance(p);
    const crie = r.status !== 0;
    if (!crie) muettes += 1;
    console.log(`${crie ? 'OK    crie' : 'MUETTE    '} : ${p.nom}`);
  }
  console.log(muettes === 0 ? `\nChacune des ${PANNES.length} pannes fait crier le banc.` : `\n${muettes} panne(s) muette(s).`);
  process.exit(muettes === 0 ? 0 : 1);
}
