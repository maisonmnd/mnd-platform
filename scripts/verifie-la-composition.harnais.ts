/* VOIR LA COMPOSITION, EPROUVE · 8 novembre 2026.
   `node scripts/verifie-la-composition.mjs` (et `--prouve`).
   « Besoin de voir leur composition pour pouvoir acheter » (Yéman) : un forfait
   et une formule se lisent en entier, sur les cartes et la fiche d'achat de Ma
   Couronne, sans changer aucun prix. Personnes et dates inventées. */
import { readFileSync } from 'node:fs';
import { compositionDeLaFormule, compositionDuForfait, type LigneDeForfait } from '../src/shared/composition-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const nom = (l: LigneDeForfait) => (l.productId ? 'Un soin' : l.categoryId ? 'Un atelier' : ({ r: 'Reprise', d: 'Hydratation', s: 'Sortie' } as Record<string, string>)[l.serviceId] ?? '?');

/* ── 1. Un forfait à cadence : le Trimestriel ── */
const tri: LigneDeForfait[] = [
  { serviceId: 'r', afterWeeks: 0 }, { serviceId: 'd' }, { serviceId: 'r', afterWeeks: 4 },
  { serviceId: 'd', afterWeeks: 6 }, { serviceId: 'r', afterWeeks: 8 }, { serviceId: 's', afterWeeks: 12 },
];
const g1 = compositionDuForfait(tri, nom);
dit('un seul groupe, sans venue', [undefined], g1.map((g) => g.venue));
dit('trois reprises réunies en une ligne', 3, g1[0].lignes.find((l) => l.quoi === 'Reprise')?.fois);
dit('... avec leurs semaines dans l ordre', [0, 4, 8], g1[0].lignes.find((l) => l.quoi === 'Reprise')?.semaines);
dit('une ligne par prestation, dans l ordre où elles paraissent', ['Reprise', 'Hydratation', 'Sortie'], g1[0].lignes.map((l) => l.quoi));
dit('une ligne sans semaine n en dit pas', [6], g1[0].lignes.find((l) => l.quoi === 'Hydratation')?.semaines);
dit('un forfait sans lignes ne dit rien', [], compositionDuForfait(undefined, nom));

/* ── 2. Les semaines désordonnées se rangent ── */
const g2 = compositionDuForfait([{ serviceId: 'r', afterWeeks: 8 }, { serviceId: 'r', afterWeeks: 0 }, { serviceId: 'r', afterWeeks: 4 }], nom);
dit('les semaines se trient', [0, 4, 8], g2[0].lignes[0].semaines);

/* ── 3. L'offert ne se confond pas avec le payé ── */
const g3 = compositionDuForfait([{ serviceId: 'd' }, { serviceId: 'd', offert: true }], nom);
dit('la même prestation, offerte et payée : deux lignes', [false, true], g3[0].lignes.map((l) => l.offert));

/* ── 4. Le Moment en quatre venues : rangé venue par venue ── */
const quatre: LigneDeForfait[] = [
  { serviceId: 'r', venue: 1 }, { serviceId: 'd', venue: 1 }, { serviceId: 'r', venue: 2 },
  { serviceId: 's', venue: 3 }, { serviceId: 'r', venue: 3 }, { serviceId: 'r' },
];
const g4 = compositionDuForfait(quatre, nom);
dit('une ligne sans venue est de la première', [1, 2, 3], g4.map((g) => g.venue));
dit('la venue 1 reçoit la ligne sans venue : deux reprises', 2, g4[0].lignes.find((l) => l.quoi === 'Reprise')?.fois);
const g4b = compositionDuForfait([{ serviceId: 'r', venue: 3 }, { serviceId: 'r', venue: 1 }, { serviceId: 'r', venue: 2 }], nom);
dit('les venues se rangent dans l ordre', [1, 2, 3], g4b.map((g) => g.venue));

/* ── 5. Une formule : quotas, à volonté ── */
const f1 = compositionDeLaFormule([{ serviceId: 'r', qty: 4 }, { serviceId: 'd', qty: null }], (id) => ({ r: 'Reprise', d: 'Hydratation' } as Record<string, string>)[id] ?? '?');
dit('un quota se dit, le sans-limite est null', [4, null], f1.map((l) => l.qty));
const f2 = compositionDeLaFormule([{ serviceId: 'r', qty: 2 }, { serviceId: 'r', qty: 3 }], () => 'Reprise');
dit('deux lignes de la même prestation s additionnent', [5], f2.map((l) => l.qty));
const f3 = compositionDeLaFormule([{ serviceId: 'r', qty: 2 }, { serviceId: 'r', qty: null }], () => 'Reprise');
dit('à volonté l emporte sur un nombre', [null], f3.map((l) => l.qty));
dit('une formule sans lignes ne dit rien', [], compositionDeLaFormule(undefined, () => ''));

/* ── 6. Le câblage : trois endroits, un seul composant ── */
const lis = (f: string) => readFileSync(f, 'utf8');
const compose = lis('src/apps/couronne/Compose.tsx');
const achat = lis('src/apps/couronne/AchatFormule.tsx');
const vue = lis('src/apps/couronne/VoirLaComposition.tsx');
dit('la carte de forfait montre sa composition', true, /^\s*<CompositionDuForfait groupes=\{compositionDuForfait\(lignes, nomInclus\)\} \/>/m.test(compose));
dit('la carte de formule montre sa composition', true, /^\s*<CompositionDeLaFormule lignes=\{compositionDeLaFormule\(pl\.included/m.test(compose));
dit('la fiche d achat montre la composition de la formule', true, /^\s*<CompositionDeLaFormule lignes=\{compositionDeLaFormule\(plan\.included/m.test(achat));
dit('la composition se replie : un details et sa phrase, forfait et formule', 2, (vue.match(/<details className="cma-compo">\s*<summary>\{t\('Voir la composition'\)\}<\/summary>/g) ?? []).length);
dit('aucun prix dans la composition', false, /prix\(|currency|priceXof/.test(vue));
dit('l anglais de la phrase existe', true, /'Voir la composition':/.test(lis('src/apps/couronne/i18n/en-composition.ts')));
dit('l anglais de l à volonté existe', true, /'à volonté':/.test(lis('src/apps/couronne/i18n/en-composition.ts')));
dit('le dictionnaire réunit le fichier', true, /\.\.\.EN_COMPOSITION/.test(lis('src/apps/couronne/i18n/en.ts')));

console.log(ko === 0 ? '\nLa composition tient.' : `\n${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
