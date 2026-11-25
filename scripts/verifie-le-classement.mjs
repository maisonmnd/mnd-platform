import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE CLASSEMENT DES CLIENTES, ÉPROUVÉ (20 novembre 2026).
   `node scripts/verifie-le-classement.mjs` lance le harnais ;
   `--prouve` le relance sur chaque panne ci-dessous, et chaque panne doit le
   faire crier par une épreuve. Les pannes vivent dans la mémoire du bundle
   (un greffon d'esbuild remplace le texte lu) ou dans une copie hors du dépôt
   pour les fichiers que le harnais LIT : rien de l'arbre partagé ne bouge. */

const racine = path.resolve(import.meta.dirname, '..');
const PUR = 'src/shared/classement-pur.ts';
const ECRAN = 'src/apps/trone/routes/clients/Classement.tsx';
const INDEX = 'src/apps/trone/routes/index.tsx';
const CLIENTES = 'src/apps/trone/routes/clients/Customers.tsx';

const PANNES = [
  { nom: 'le +1 ne distingue plus le Canada', fichier: PUR, r: [['CANADA.has(intl.slice(1, 4))', 'false']] },
  { nom: 'la ville de la fiche oubliée', fichier: PUR, r: [["else if (f.lieuSaisi && f.lieuSaisi !== 'non-reconnue') {", 'else if (false) {']] },
  { nom: 'le choix de la Maison ignoré', fichier: PUR, r: [['const etape = c.etape && toutes.includes(c.etape) ? c.etape : etapeAuto;', 'const etape = etapeAuto;']] },
  { nom: 'annule souvent au-delà du seuil seulement', fichier: PUR, r: [[">= p.annule_nb) m.push('annule-souvent');", "> p.annule_nb) m.push('annule-souvent');"]] },
  { nom: 'la ville déduite deux fois', fichier: PUR, r: [["if (String(c.city ?? '').trim() || c.villeDeduiteLe) return null;", "if (String(c.city ?? '').trim()) return null;"]] },
  { nom: 'le STOP lu comme un non', fichier: PUR, r: [["c.nouvelles.par === 'stop' ? 'stop' : ", '']] },
  { nom: 'les catégories d étape de la Maison ignorées', fichier: PUR, r: [["if (pr) { e = pr.id; raison = 'ses critères'; }", '']] },
  { nom: 'les absences comptent toujours', fichier: PUR, r: [['...(p.annulee_absences ? f.absences : [])', '...f.absences']] },
  { nom: 'une formule échue reste active', fichier: PUR, r: [["(a.statut === 'active' || a.statut === 'new' || a.statut === 'risk') && (!a.fin || a.fin >= aujourdhui)", "(a.statut === 'active' || a.statut === 'new' || a.statut === 'risk')"]] },
  { nom: 'deux rendez-vous le même jour comptent deux visites', fichier: PUR, r: [["Array.from(new Set(siens.filter((r) => r.status === 'honoré').map((r) => r.date.slice(0, 10))))", "siens.filter((r) => r.status === 'honoré').map((r) => r.date.slice(0, 10))"]] },
  { nom: 'une catégorie sans critère prend tout le monde', fichier: PUR, r: [['cat.criteres.length > 0 && cat.criteres.every', 'cat.criteres.every']] },
  { nom: 'l écran ne date plus la ville déduite', fichier: ECRAN, r: [['villeDeduiteLe: aujourdhui', 'villeDeduiteLe: undefined']] },
  { nom: 'le classement n est plus un onglet des Clientes', fichier: INDEX, r: [["{ path: '/classement', label: 'Le classement' }, ", '']] },
  { nom: 'le profil sans la liste des villes', fichier: CLIENTES, r: [['list={ID_DES_VILLES} value={idCity}', 'value={idCity}']] },
  /* Qui y entre (25 novembre 2026) */
  { nom: 'une categorie de la Maison tait ses criteres', fichier: PUR, r: [["Elle y entre si tous ses critères tiennent : ${criteres.join(' ; ')}.", 'Elle y entre si ses critères tiennent.']] },
  { nom: 'la liste ne dit plus qui y entre', fichier: ECRAN, r: [['{definition ? (', '{false ? (']] },
  { nom: 'Modifier ne vise plus la carte', fichier: ECRAN, r: [['key={key} id={key}>', 'key={key}>']] },
  /* Les cinq catégories (25 novembre 2026) */
  { nom: 'une fiche sans visite se range comme une cliente', fichier: PUR, r: [["else if (f.visites === 0) { e = 'hors';", "else if (false) { e = 'hors';"]] },
  { nom: 'la Dormante oublie son seuil', fichier: PUR, r: [["} else if (d <= p.dormante_jours) { e = 'reguliere';", "} else if (d <= 120) { e = 'reguliere';"]] },
  { nom: 'le rythme annuel rangé en dormante', fichier: PUR, r: [['if (rj != null && rj >= p.annuelle_rythme) {', 'if (false) {']] },
  { nom: 'la Diaspora passe avant l Annulée', fichier: PUR, r: [["if (!e && p.diaspora_remplace && groupe === 'diaspora') {", "if (p.diaspora_remplace && groupe === 'diaspora') {"]] },
  { nom: 'la diaspora remplace toujours', fichier: PUR, r: [["if (!e && p.diaspora_remplace && groupe === 'diaspora') {", "if (!e && groupe === 'diaspora') {"]] },
  { nom: 'la Régulière dit un chiffre fige', fichier: PUR, r: [['date de ${p.dormante_jours} jours au plus. Celle', 'date de 120 jours au plus. Celle']] },
  { nom: 'une ancienne catégorie revient', fichier: PUR, r: [["  { cle: 'diaspora', nom: 'La Diaspora' },\n", "  { cle: 'diaspora', nom: 'La Diaspora' },\n  { cle: 'couronne', nom: 'La Couronne' },\n"]] },
  { nom: 'les catégories de la Maison reviennent', fichier: PUR, r: [['export const CATEGORIES_DE_DEPART: CategorieDeLaMaison[] = [];', "export const CATEGORIES_DE_DEPART: CategorieDeLaMaison[] = [{ id: 'a-definir', nom: 'À définir', regle: '', type: 'etape', criteres: [], ordre: 1 }];"]] },
  { nom: 'la colonne garde le lieu', fichier: ECRAN, r: [['      <div className="trc-cl-axe">Les catégories</div>\n', '      <div className="trc-cl-axe">Les catégories</div>\n      <div className="trc-cl-axe">Le lieu</div>\n']] },
  { nom: 'une carte manque aux critères', fichier: ECRAN, r: [["const REGLES = ['privilegiee', 'hors', 'annulee', 'diaspora', 'dormante', 'reguliere'];", "const REGLES = ['privilegiee', 'hors', 'annulee', 'diaspora', 'dormante'];"]] },
  { nom: 'Sans catégorie remonte en tête', fichier: ECRAN, r: [["...ETAPES.filter((e) => e.cle !== 'hors'), ", '...ETAPES, '], [", ...ETAPES.filter((e) => e.cle === 'hors'),\n", ',\n']] },
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
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-classement-'));
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
      entryPoints: [path.join(racine, 'scripts/verifie-le-classement.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      plugins: [greffon],
    });
    const env = { ...process.env };
    delete env.CLASSEMENT_PANNE_FICHIER;
    delete env.CLASSEMENT_PANNE_COPIE;
    if (panne) {
      const copie = path.join(dossier, 'copie', panne.fichier);
      mkdirSync(path.dirname(copie), { recursive: true });
      writeFileSync(copie, texte);
      env.CLASSEMENT_PANNE_FICHIER = panne.fichier;
      env.CLASSEMENT_PANNE_COPIE = copie;
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
    const epreuve = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ECHEC'));
    const crie = r.status !== 0 && !!epreuve;
    if (!crie) muettes++;
    console.log(`${crie ? 'CRIE ' : 'MUETTE'} ${p.nom}${epreuve ? `  (${epreuve.slice(6).split(' -> ')[0].trim()})` : r.status !== 0 ? '  (le harnais tombe)' : ''}`);
  }
  if (muettes) { console.log(`\n${muettes} panne(s) muette(s) : le banc ne voit pas tout.`); process.exit(1); }
  console.log(`\nLes ${PANNES.length} pannes crient.`);
}
