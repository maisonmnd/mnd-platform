/* LES OBJECTIFS DES FAUTEUILS, ÉPROUVÉS — 26 octobre 2026.
   `node scripts/verifie-les-objectifs-des-fauteuils.mjs` (et `--prouve`).

   « Des objectifs atteignables avec des prévisions atteignables, pas des
   chiffres faits au hasard » (Yéman). Le banc éprouve la règle sur une
   histoire fabriquée dont on connaît les réponses, puis l'écran du Carnet. */
import { readFileSync } from 'node:fs';
import {
  ajouteJours, bilanDuMois, calculDuJour, chargeSurObjectif, jourDeSemaine, rdvParJour, reperesDe, reperesParJour, JOURS_MIN,
} from '../src/shared/objectifs-des-fauteuils-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── 1. Compter ── */
const compte = rdvParJour([
  { date: '2026-10-06', status: 'honoré' }, { date: '2026-10-06', status: 'confirmé' }, { date: '2026-10-06', status: 'annulé' },
  { date: '2026-10-07', status: 'en attente' }, { date: 'n/a', status: 'honoré' },
]);
dit('compter : les annulés ne comptent pas, une date illisible non plus', [['2026-10-06', 2], ['2026-10-07', 1]], [...compte.entries()]);

/* ── 2. Les repères, sur une histoire connue ──
   Aujourd'hui : mardi 27 octobre 2026. La Maison ouvre du mardi au samedi.
   Les mardis des 26 dernières semaines font, dans l'ordre : 0,1,2,…,
   cycliques sur 0..5 ; le lundi est fermé, mais un rendez-vous y a été posé
   une fois (il compte). Le dimanche est fermé et vide. */
const AUJ = '2026-10-27';
const ouvertLe = (j: string) => { const s = jourDeSemaine(j); return s >= 2 && s <= 6; };
const parJour = new Map<string, number>();
let k = 0;
for (let j = '2025-01-01'; j < AUJ; j = ajouteJours(j, 1)) {
  const s = jourDeSemaine(j);
  if (s === 2) { parJour.set(j, k % 6); k += 1; }
  if (s === 3) parJour.set(j, 3);
  if (s === 6 && j >= '2026-05-01') parJour.set(j, 8);
}
parJour.set('2026-10-19', 2);
const R = reperesParJour({ parJour, aujourdhui: AUJ, ouvertLe });
const recentsMardi = [...parJour.entries()].filter(([j]) => jourDeSemaine(j) === 2 && j >= ajouteJours(AUJ, -182) && j < AUJ).map(([, n]) => n).sort((a, b) => a - b);
const med = recentsMardi[Math.ceil(0.5 * recentsMardi.length) - 1];
const p75 = recentsMardi[Math.ceil(0.75 * recentsMardi.length) - 1];
dit('mardi : 26 jours lus, ordinaire = médiane, objectif = 3e quartile, record = 5, atteint compté',
  [26, med, p75, 5, recentsMardi.filter((n) => n >= p75).length], [R[2].jours, R[2].ordinaire, R[2].objectif, R[2].record, R[2].atteint]);
dit('mercredi, toujours 3 : ordinaire, objectif et record à 3', [3, 3, 3], [R[3].ordinaire, R[3].objectif, R[3].record]);
dit('un jour ouvert sans rendez-vous compte pour zéro (le jeudi, jamais rempli)', [0, 0, 26], [R[4].ordinaire, R[4].objectif, R[4].jours]);
dit('samedi : la Maison d aujourd hui, pas celle de janvier 2025 (8 depuis mai)', [8, 8], [R[6].ordinaire, R[6].objectif]);
dit('lundi fermé : seul le jour où un rendez-vous a été posé compte ; trop peu vu, il se lit sur toute l histoire', [1, 2, '2025-01-01'], [R[1].jours, R[1].objectif, R[1].depuis]);
dit('dimanche fermé et vide : aucun repère', [0, 0], [R[0].jours, R[0].objectif]);
dit('le seuil de lecture récente reste à six jours', 6, JOURS_MIN);

/* ── 3. La barre d'un jour ── */
dit('la barre : plein à l objectif, creux sous l ordinaire, sans repère sans histoire', ['plein', 'normal', 'creux', 'sans'],
  [chargeSurObjectif(p75, R[2]).ton, chargeSurObjectif(med, R[2]).ton, chargeSurObjectif(Math.max(0, med - 1), R[2]).ton, chargeSurObjectif(3, R[0]).ton]);
dit('... la part = posés / objectif', 0.5, chargeSurObjectif(4, { ...R[6], objectif: 8 }).part);
dit('la bulle dit le calcul', true, /^2 posés sur un objectif de \d : un mardi ordinaire en fait \d, l'objectif a été atteint \d+ mardis sur 26 ouverts depuis le \d\d\/\d\d\/\d{4}, le record est de 5\.$/.test(calculDuJour(R[2], 2)));
dit('reperesDe lit le bon jour', 2, reperesDe(R, '2026-10-27').jour);

/* ── 4. Le mois ── */
const futur = new Map(parJour);
futur.set('2026-10-28', 5);
futur.set('2026-10-31', 2);
const b = bilanDuMois({ mois: '2026-10', aujourdhui: AUJ, parJour: futur, ouvertLe, reperes: R });
const ouvertsOct = [...Array(31)].map((_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter((j) => ouvertLe(j) || (futur.get(j) ?? 0) > 0);
const objOct = ouvertsOct.reduce((s, j) => s + reperesDe(R, j).objectif, 0);
const realOct = ouvertsOct.filter((j) => j < AUJ).reduce((s, j) => s + (futur.get(j) ?? 0), 0);
const restOct = ouvertsOct.filter((j) => j >= AUJ).reduce((s, j) => s + Math.max(futur.get(j) ?? 0, reperesDe(R, j).ordinaire), 0);
dit('le mois : objectif = somme des objectifs des jours ouverts ; prévision = déjà fait + au plus grand de posés et ordinaire',
  [objOct, realOct, realOct + restOct, ouvertsOct.length, 5], [b.objectif, b.realise, b.prevision, b.joursOuverts, b.joursRestants]);
dit('... le 28 posé à 5 dépasse l ordinaire du mercredi (3) : il compte 5 ; le 31 posé à 2 sous l ordinaire du samedi (8) : il compte 8', true,
  restOct === Math.max(futur.get('2026-10-27') ?? 0, R[2].ordinaire) + 5 + 0 + 0 + 8);

/* ── 5. Le Carnet ── */
const carnet = sansCommentaires(readFileSync('src/apps/trone/routes/clients/Carnet.tsx', 'utf8'));
dit('le Carnet lit les repères sur TOUTE l histoire de la branche et la barre se dit en rendez-vous', [true, true, true, false],
  [/reperesParJour\(\{ parJour: comptesParJour, aujourdhui: today, ouvertLe: estOuvertLe \}\)/.test(carnet),
    /bilanDuMois\(\{ mois: k, aujourdhui: today, parJour: comptesParJour, ouvertLe: estOuvertLe, reperes \}\)/.test(carnet),
    /\{n\} \/ \{c\.objectif\} RDV/.test(carnet) || /`\$\{n\} \/ \$\{c\.objectif\} RDV`/.test(carnet),
    /fauteuils <i aria-hidden="true">/.test(carnet)]);
dit('pas de tiret cadratin dans ce que la règle dit', false, /—/.test(sansCommentaires(readFileSync('src/shared/objectifs-des-fauteuils-pur.ts', 'utf8'))));

console.log(ko === 0 ? '\nLes objectifs des fauteuils tiennent.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
