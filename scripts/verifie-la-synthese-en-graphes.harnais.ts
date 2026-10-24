/* LA SYNTHESE EN GRAPHES, EPROUVEE — 24 octobre 2026.
   `node scripts/verifie-la-synthese-en-graphes.mjs` (et `--prouve`).

   « Refais une vraie page de synthese et bilan. De vrais graphes qui
   ressemblent aux captures » (Yeman). Les regles :
   src/apps/trone/routes/finances/synthese-graphes-pur.ts. TOUS LES ATTENDUS
   SONT ECRITS A LA MAIN. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TEINTES, graduations, chiffreCourt, rangsStables, partsDeLAnneau, pourcents, cheminDuMorceau, anglesDesMorceaux, ecartAuMois, groupePar,
} from '../src/apps/trone/routes/finances/synthese-graphes-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 230)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 230)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

/* == #1 -- L AXE PART DE ZERO, en nombres ronds, et descend sous zero ==
   Un mois a 1 755 000 F : 0, 500 k, 1 M, 1,5 M, 2 M. Un resultat negatif :
   l axe passe sous zero. Rien du tout : un seul trait, le zero. */
dit(1, 'graduations : de 0 a 2 M par 500 k ; sous zero quand le resultat l est ; rien = [0]',
  [[0, 500000, 1000000, 1500000, 2000000], [-500000, 0, 500000, 1000000, 1500000], [0], [0, 25000, 50000, 75000, 100000]],
  [graduations(0, 1755000), graduations(-300000, 1200000), graduations(0, 0), graduations(300000, 100000 - 1)].map((t) => t));

/* == #2 -- LE CHIFFRE COURT DE L AXE ==
   NB : toLocaleString('fr-FR') met une espace insecable fine dans 1 500 : on
   compare donc des chiffres sans separateur de milliers. */
dit(2, 'chiffreCourt : 1,5 M ; 500 k ; le vrai signe moins ; 750',
  ['1,5 M', '500 k', '−250 k', '750', '0', '2 M'],
  [chiffreCourt(1500000), chiffreCourt(500000), chiffreCourt(-250000), chiffreCourt(750), chiffreCourt(0), chiffreCourt(2000000)]);

/* == #3 -- LA COULEUR SUIT LA CHOSE, PAS SON RANG DU MOIS ==
   Sur tout l historique : Rituels (900), Real Money (500), MoMo (300),
   KkiaPay (200), ACIA1 (100), BIIC (50). En octobre, MoMo passe devant :
   il garde sa teinte (2), ACIA1 et BIIC vont dans Autres, et l ordre de
   l anneau suit les teintes, Autres en dernier. */
{
  const rangs = rangsStables(new Map([['BIIC', 50], ['MoMo', 300], ['Rituels', 900], ['KkiaPay', 200], ['Real Money', 500], ['ACIA1', 100], ['Vide', 0]]));
  const octobre = partsDeLAnneau([
    { nom: 'MoMo', valeur: 400 }, { nom: 'ACIA1', valeur: 90 }, { nom: 'Rituels', valeur: 100 }, { nom: 'BIIC', valeur: 10 }, { nom: 'Zero', valeur: 0 },
  ], rangs);
  dit(3, 'rangs sur l historique ; en octobre MoMo garde la teinte 2 ; ACIA1 et BIIC dans Autres ; rien de nul',
    [[['Rituels', 0], ['Real Money', 1], ['MoMo', 2], ['KkiaPay', 3], ['ACIA1', 4], ['BIIC', 5]],
      [['Rituels', 0, 100], ['MoMo', 2, 400], ['Autres', null, 100]], ['ACIA1', 'BIIC']],
    [[...rangs.entries()], octobre.map((p) => [p.nom, p.teinte, p.valeur]), octobre.at(-1)?.membres]);
  const novembre = partsDeLAnneau([{ nom: 'KkiaPay', valeur: 50 }, { nom: 'MoMo', valeur: 10 }], rangs);
  dit(3, 'un autre mois, les memes choses gardent leurs teintes ; jamais une cinquieme teinte',
    [[['MoMo', 2], ['KkiaPay', 3]], true],
    [novembre.map((p) => [p.nom, p.teinte]), [...octobre, ...novembre].every((p) => p.teinte === null || (p.teinte >= 0 && p.teinte < TEINTES.length))]);
}

/* == #4 -- DES POURCENTAGES QUI FONT 100 == */
dit(4, 'pourcents : trois tiers font 34 + 33 + 33 ; un zero reste a zero ; rien = zeros',
  [[34, 33, 33], [50, 0, 50], [0, 0], 100],
  [pourcents([1, 1, 1]), pourcents([5, 0, 5]), pourcents([0, 0]), pourcents([66.6, 13.2, 20.2]).reduce((s, v) => s + v, 0)]);

/* == #5 -- UN MORCEAU SEUL A 100 % SE DESSINE ==
   Un arc dont le debut et la fin se confondent ne trace rien : le tour
   complet s ecrit en deux moitiés (quatre arcs avec l interieur). */
{
  const angles = anglesDesMorceaux([30, 70]);
  const plein = cheminDuMorceau(86, 86, 84, 60, 0, 2 * Math.PI);
  const moitie = cheminDuMorceau(86, 86, 84, 60, angles[1].a0, angles[1].a1);
  dit(5, 'tour complet en quatre arcs ; 70 % prend le grand arc ; les angles font un tour',
    [4, ' 0 1 1 ', true],
    [(plein.match(/ A /g) ?? []).length, moitie.slice(moitie.indexOf(' A 84 84') + 8, moitie.indexOf(' A 84 84') + 15), Math.abs(angles[1].a1 - 2 * Math.PI) < 1e-9]);
}

/* == #6 -- UNE HAUSSE DES DEPENSES N EST PAS UNE BONNE NOUVELLE == */
dit(6, 'ecart : revenus en hausse = bon ; depenses en hausse = mauvais ; mois d avant a zero = pas de pourcentage',
  [[10, 'hausse', true], [10, 'hausse', false], [-48, 'baisse', false], [null, 'hausse', null], [-4, 'baisse', true]],
  [ecartAuMois(110, 100), ecartAuMois(110, 100, false), ecartAuMois(910000, 1755000), ecartAuMois(5, 0), ecartAuMois(612000, 635000, false)].map((e) => [e.pct, e.sens, e.bon]));

/* == #7 -- VOIR PAR : rien ne disparait du total == */
{
  const lignes = [
    { amount: 100, dims: { Caisse: 'Real Money' } }, { amount: 50, dims: { Caisse: 'MoMo' } },
    { amount: 30, dims: { Caisse: 'Real Money' } }, { amount: 20, dims: { Caisse: '' } }, { amount: 5 },
  ];
  const g = groupePar(lignes, 'Caisse');
  dit(7, 'groupes par caisse, la ligne sans caisse sous Non precise ; la somme des groupes = le total',
    [[['Real Money', 130, 2], ['MoMo', 50, 1], ['Non précisé', 25, 2]], 205],
    [g.map((x) => [x.nom, x.total, x.n]), g.reduce((s, x) => s + x.total, 0)]);
}

/* == #8 -- LE CABLAGE : la page lit ces regles ==
   Les teintes des anneaux viennent du rang de l historique ; la tuile des
   depenses juge une hausse mauvaise ; le graphe n a qu une echelle ; les
   teintes sont celles eprouvees. */
{
  const page = source('src/apps/trone/routes/finances/Synthese.tsx');
  const graphes = source('src/apps/trone/routes/finances/SyntheseGraphes.tsx');
  const pur = source('src/apps/trone/routes/finances/synthese-graphes-pur.ts');
  dit(8, 'anneaux au rang de l historique ; rangs sans le mois ; tuile des depenses ; quatre anneaux et quatre tuiles', [true, true, true, [4, 4]], [
    page.includes('partsDeLAnneau(byCashbox.map((c) => ({ nom: c.name, valeur: c.value, n: c.count })), rangs.caisses)')
      && page.includes('partsDeLAnneau(byMethod.map((m) => ({ nom: m.name, valeur: m.value, n: m.count })), rangs.modes)'),
    /const rangs = useMemo\(\(\) => \{[\s\S]*?\}, \[invoices, appts, apprenants, expenses, branch\.id, byId\]\);/.test(page),
    page.includes('ecart={ecartAuMois(spent, prevSpent, false)}'),
    [(page.match(/<Anneau\b/g) ?? []).length, (page.match(/<TuileDuMois\b/g) ?? []).length],
  ]);
  dit(8, 'une seule echelle : la ligne du resultat et les colonnes lisent le meme y ; une seule graduation', [true, 1], [
    graphes.includes("points={mois.map((m, i) => `${cx(i).toFixed(1)},${y(m.net).toFixed(1)}`).join(' ')}")
      && graphes.includes('y(Math.max(0, m.rev))') && graphes.includes('y(Math.max(0, m.exp))'),
    (graphes.match(/graduations\(/g) ?? []).length,
  ]);
  dit(8, 'les quatre teintes eprouvees, dans leur ordre', ["['#3B4BA0', '#BE7526', '#4E86D9', '#008E7F']"], [
    (pur.match(/export const TEINTES = (\[[^\]]*\])/) ?? [])[1],
  ]);
}

console.log(ko === 0 ? 'La synthese dessine juste.' : `${ko} constat(s) en echec.`);
