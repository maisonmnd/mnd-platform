/* LA REMISE SUIT SA PRESTATION — 26 septembre 2026.

   « Sur le Trône, quand tu fais une remise sur une ligne et ensuite tu déplaces
   le service et remonte un autre service, l'autre service prend la remise. La
   remise est figée à la ligne et non au service. » (Yéman)

   Elle l'était. Les prestations d'un rituel sont tenues dans PLUSIEURS TABLEAUX
   ALIGNÉS : les identifiants, les mains qui exécutent, les remises de ligne.
   Les boutons Monter, Descendre et Retirer déplaçaient les deux premiers et
   oubliaient le troisième, arrivé après ; poser un rituel habituel remettait
   les mains à zéro et laissait les remises collées à leurs positions. Le
   déplacement était écrit quatre fois, et la remise n'était dans aucune.

   CE HARNAIS TIENT LA RÈGLE, PAS LE CAS DU JOUR :

     ① `rangeeBougee` échange, retire, et refuse une position hors du tableau ;
     ② une remise posée sur une prestation la suit quand la ligne monte,
        descend, ou qu'une voisine s'en va — mesurée sur le NET facturé, pas
        sur le tableau ;
     ③ tout tableau que le code déclare « parallèle à serviceIds » est déplacé
        par `bougeLaLigne` ET remis à zéro par `poseLesPrestations` : c'est ce
        contrôle qui attrapera le QUATRIÈME tableau, celui que personne n'a
        encore écrit ;
     ④ et plus aucun déplacement ne s'écrit à la main ailleurs.

   Lancer : node scripts/verifie-la-remise-suit-sa-prestation.mjs */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rangeeBougee, svcNetForAppt, apptTotalXof } from '../src/apps/trone/routes/clients/_shared';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko += 1; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LA FONCTION QUI DÉPLACE ────────────────────────────────────── */
dit('échanger deux positions', ['b', 'a', 'c'], rangeeBougee(['a', 'b', 'c'], 0, 1));
dit('… dans l’autre sens aussi', ['a', 'c', 'b'], rangeeBougee(['a', 'b', 'c'], 2, 1));
dit('retirer une position', ['a', 'c'], rangeeBougee(['a', 'b', 'c'], 1, null));
dit('une position hors du tableau ne bouge rien', ['a', 'b'], rangeeBougee(['a', 'b'], 5, 0));
dit('… une cible hors du tableau non plus', ['a', 'b'], rangeeBougee(['a', 'b'], 0, 9));
dit('… et une position négative non plus', ['a', 'b'], rangeeBougee(['a', 'b'], -1, null));

/* ── ② LA RÈGLE, MESURÉE SUR L'ARGENT ─────────────────────────────────
   On ne regarde pas le tableau des remises : on regarde ce que chaque
   prestation COÛTE une fois la ligne déplacée. C'est le seul endroit où le
   défaut se voyait, et c'est donc là qu'on le guette. */
const sv = (id: string, priceXof: number): Service => ({
  id, name: id, categoryId: 'c', order: 1, priceXof, durationMin: 30,
} as unknown as Service);
const CATALOGUE = new Map<string, Service>([
  ['tresses', sv('tresses', 20000)],
  ['lavage', sv('lavage', 10000)],
  ['soin', sv('soin', 6000)],
]);
const rdv = (ids: string[], remises: ({ pct?: number; xof?: number } | null)[]): Appointment => ({
  id: 'r', branchId: 'b', clientId: 'c', date: '2026-09-26', time: '09:00',
  status: 'done', serviceIds: ids, remisesLignes: remises,
} as unknown as Appointment);

/** Ce que coûte CHAQUE prestation, nommée, une fois les remises appliquées.

    LES CLEFS SONT TRIÉES, et c'est le nerf du banc. Un premier jet comparait
    les objets tels quels : l'ordre des clefs suit celui des prestations, donc
    il changeait à chaque déplacement, et le banc criait sur un résultat juste.
    Ce qu'on éprouve ici, c'est que CHAQUE geste garde son prix — pas l'ordre
    dans lequel on les lit, qui est justement ce qu'on déplace. */
const netParPrestation = (a: Appointment): Record<string, number> => Object.fromEntries(
  a.serviceIds.map((id, i): [string, number] => [id, svcNetForAppt(a, CATALOGUE.get(id)!, i)])
    .sort((x, y) => x[0].localeCompare(y[0])));

/* Départ : la remise de 50 % est sur le lavage, au milieu. */
const DEPART = rdv(['tresses', 'lavage', 'soin'], [null, { pct: 50 }, null]);
const ATTENDU = { lavage: 5000, soin: 6000, tresses: 20000 };
dit('au départ, la remise est sur le lavage', ATTENDU, netParPrestation(DEPART));

/** Déplace la ligne `de` comme le fait l'écran : TOUS les tableaux ensemble. */
const commeALEcran = (a: Appointment, de: number, vers: number | null): Appointment => rdv(
  rangeeBougee(a.serviceIds, de, vers),
  rangeeBougee(a.serviceIds.map((_, k) => a.remisesLignes?.[k] ?? null), de, vers));

dit('le lavage remonte : sa remise monte avec lui', ATTENDU,
  netParPrestation(commeALEcran(DEPART, 1, 0)));
dit('… il descend : elle descend aussi', ATTENDU,
  netParPrestation(commeALEcran(DEPART, 1, 2)));
dit('… la prestation du dessus s’en va : la remise reste au lavage',
  { lavage: 5000, soin: 6000 }, netParPrestation(commeALEcran(DEPART, 0, null)));
dit('… et le total du rituel ne bouge pas d’un franc',
  apptTotalXof(DEPART, CATALOGUE), apptTotalXof(commeALEcran(DEPART, 1, 0), CATALOGUE));

/* ── ③ TOUT TABLEAU PARALLÈLE EST DÉPLACÉ, ET REMIS À ZÉRO ────────────
   Ici est le contrôle qui vaut : il ne connaît ni les mains ni les remises, il
   connaît la RÈGLE. Le jour où quelqu'un ajoutera un quatrième tableau aligné
   sur `serviceIds` — les durées, les notes de ligne, ce qu'on voudra — et le
   déclarera tel, ce contrôle exigera qu'il bouge avec les autres. C'est
   exactement ce qui a manqué quand les remises sont arrivées après les mains. */
const src = readFileSync(path.join(process.cwd(), 'src/apps/trone/routes/clients/_shared.tsx'), 'utf8');
/* Les déclarations d'état précédées d'un commentaire qui les dit parallèles.
   L'accent est facultatif : le code en porte des deux sortes. */
const paralleles = [...src.matchAll(
  /parall[eè]le[^\n]*`serviceIds`[\s\S]{0,400}?const \[\w+, (set\w+)\] = useState/g)]
  .map((m) => m[1]);
dit('le code déclare bien ses tableaux parallèles', ['setMains', 'setRemisesL'], paralleles);

const corpsDe = (nom: string): string => {
  const i = src.indexOf(`const ${nom} = (`);
  return i < 0 ? '' : src.slice(i, src.indexOf('\n  };', i));
};
const bouge = corpsDe('bougeLaLigne');
const pose = corpsDe('poseLesPrestations');
dit('… et chacun est déplacé par bougeLaLigne', [],
  paralleles.filter((s) => !bouge.includes(s)));
dit('… et remis à zéro par poseLesPrestations', [],
  paralleles.filter((s) => !pose.includes(s)));
dit('… qui déplacent aussi les prestations elles-mêmes', [true, true],
  [bouge.includes('setServiceIds'), pose.includes('setServiceIds')]);

/* ── ④ PLUS AUCUN DÉPLACEMENT ÉCRIT À LA MAIN ─────────────────────────
   Le défaut n'est pas né d'une faute de calcul mais d'une RÉPÉTITION : le même
   geste écrit quatre fois, corrigé trois fois. On interdit donc la répétition,
   pas la faute. */
const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const appels = [...sansCommentaires.matchAll(/setServiceIds\(/g)].length;
dit('setServiceIds n’est appelé que par les deux fonctions et l’ajout', 3, appels);
dit('… et plus personne n’échange deux positions à la main', 0,
  [...sansCommentaires.matchAll(/\[n\[pos[^\]]*\], n\[pos[^\]]*\]\] = /g)].length);

console.log(ko === 0 ? '\nLa remise suit sa prestation.' : `\n${ko} contrôle(s) en échec.`);
process.exit(ko === 0 ? 0 : 1);
