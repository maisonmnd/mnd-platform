/* LES PRÉVISIONS, ÉPROUVÉES — 26 octobre 2026.
   `node scripts/verifie-les-previsions.mjs` (et `--prouve`).

   « Savoir le nombre de fauteuils qu'on pourrait remplir, de façon
   atteignable, si on met en place un système marketing » (Yéman). Le banc
   éprouve chaque part sur une histoire fabriquée dont on connaît les
   réponses, puis l'écran, la barre et la porte du Marketing. */
import { readFileSync } from 'node:fs';
import { ajouteJours, jourDeSemaine, rdvParJour, reperesParJour } from '../src/shared/objectifs-des-fauteuils-pur';
import {
  bornesDeLHorizon, calculeLesPrevisions, estUneVenue, honneurDesDouzeMois, mesureDesEnvois, moisDuPasse, nomDeLHorizon, nouvellesClientes, placeDeLaCliente,
  premierMoisJugeLisibleLe, rdvsConnusLe, rejoueLeMois, resumeDuRejeu, seJuge, ENVOIS_POUR_MESURER, JOURS_PAR_MOIS, type MoisRejoue, type RdvDesPrevisions,
} from '../src/shared/previsions-pur';
import type { EnvoiLu } from '../src/shared/envois';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const proche = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AUJ = '2026-10-26'; // un lundi, jour fermé
const ouvertLe = (j: string) => { const s = jourDeSemaine(j); return s >= 2 && s <= 6; };

/* ── 1. Les horizons ── */
const h4 = bornesDeLHorizon('4s', AUJ);
dit('4 semaines : du jour même, quatre colonnes de sept jours', ['2026-10-26', '2026-11-22', ['26 oct.', '2 nov.', '9 nov.', '16 nov.'], '2026-11-16|2026-11-22'],
  [h4.debut, h4.fin, h4.colonnes.map((c) => c.nom), `${h4.colonnes[3].debut}|${h4.colonnes[3].fin}`]);
dit('... la durée en mois = jours ÷ 30,4375', true, proche(h4.mois, 28 / JOURS_PAR_MOIS));
const hm = bornesDeLHorizon('mois', AUJ);
dit('le mois, après le 15 : le mois suivant entier, semaine par semaine', ['2026-11-01', '2026-11-30', 'Novembre 2026, semaine par semaine', 5, '2026-11-29|2026-11-30'],
  [hm.debut, hm.fin, hm.titre, hm.colonnes.length, `${hm.colonnes[4].debut}|${hm.colonnes[4].fin}`]);
const hm10 = bornesDeLHorizon('mois', '2026-10-10');
dit('le mois, jusqu au 15 : ce qu il reste du mois en cours', ['2026-10-10', '2026-10-31'], [hm10.debut, hm10.fin]);
const h3 = bornesDeLHorizon('3m', AUJ);
dit('3 mois : les trois mois qui s ouvrent, mois par mois', ['2026-11-01', '2027-01-31', ['Novembre', 'Décembre', 'Janvier']], [h3.debut, h3.fin, h3.colonnes.map((c) => c.nom)]);
dit('le bouton du mois dit son nom', ['4 semaines', 'Novembre', '3 mois', 'Octobre'], [nomDeLHorizon('4s', AUJ), nomDeLHorizon('mois', AUJ), nomDeLHorizon('3m', AUJ), nomDeLHorizon('mois', '2026-10-10')]);

/* ── 2. L'honneur ── */
const hon: RdvDesPrevisions[] = [
  ...Array.from({ length: 18 }, (_, i) => ({ clientId: `h${i}`, date: ajouteJours(AUJ, -10 - i), status: 'honoré' })),
  { clientId: 'x1', date: ajouteJours(AUJ, -3), status: 'annulé' }, { clientId: 'x2', date: ajouteJours(AUJ, -4), status: 'annulé' },
  { clientId: 'v', date: ajouteJours(AUJ, -400), status: 'annulé' }, { clientId: 'f', date: ajouteJours(AUJ, 3), status: 'annulé' },
];
const H = honneurDesDouzeMois(hon, AUJ);
dit('honneur : venues sur rendez-vous passés, annulés compris, douze mois seulement', [18, 20, 2, 0.9, false], [H.venus, H.passes, H.annules, H.taux, H.parDefaut]);
const H2 = honneurDesDouzeMois([...hon,
  { clientId: 'e1', date: ajouteJours(AUJ, -5), status: 'confirmé', encaisse: true },
  { clientId: 'e2', date: ajouteJours(AUJ, -6), status: 'confirmé', facture: true },
  { clientId: 'e3', date: ajouteJours(AUJ, -7), status: 'confirmé' }], AUJ);
dit('... la règle du Carnet : un passé encaissé ou facturé est venu, un passé resté « confirmé » sans rien ne l est pas', [20, 23, true], [H2.venus, H2.passes, Math.abs(H2.taux - 20 / 23) < 1e-12]);
dit('une venue : honorée, ou passée, non annulée, encaissée ou facturée ; pas un à venir payé d avance', [true, true, false, false, false],
  [estUneVenue({ date: '2026-11-01', status: 'honoré' }, AUJ), estUneVenue({ date: '2026-10-20', status: 'confirmé', facture: true }, AUJ),
    estUneVenue({ date: '2026-10-20', status: 'annulé', encaisse: true }, AUJ), estUneVenue({ date: '2026-10-28', status: 'confirmé', encaisse: true }, AUJ),
    estUneVenue({ date: '2026-10-20', status: 'en attente' }, AUJ)]);
dit('... sous dix rendez-vous passés, 90 % par défaut, dit', [0.9, true], [honneurDesDouzeMois(hon.slice(0, 3).map((r) => ({ ...r, status: 'annulé' })), AUJ).taux, honneurDesDouzeMois(hon.slice(0, 3), AUJ).parDefaut]);

/* ── 3. Les nouvelles ── */
const nouv: RdvDesPrevisions[] = [
  { clientId: 'A', date: '2026-03-10', status: 'honoré' }, { clientId: 'A', date: '2026-06-10', status: 'honoré' },
  { clientId: 'B', date: '2025-06-01', status: 'honoré' }, { clientId: 'B', date: '2026-05-01', status: 'honoré' },
  { clientId: 'C', date: '2026-09-01', status: 'honoré' },
  { clientId: 'D', date: '2026-11-03', status: 'confirmé' },
  { clientId: 'E', date: '2026-02-01', status: 'honoré' }, { clientId: 'E', date: '2026-11-05', status: 'confirmé' },
  { clientId: 'G', date: '2026-11-06', status: 'annulé' },
  { clientId: 'K', date: '2026-08-01', status: 'annulé' }, { clientId: 'K', date: '2026-12-20', status: 'confirmé' },
];
const N = nouvellesClientes(nouv, (id) => id === 'A', AUJ, h4);
dit('nouvelles : première venue dans les douze mois (A, C, E), dont une filleule ; jamais venue et posée dans l horizon (D)', [3, 1, 1], [N.douzeMois, N.filleules, N.dejaPosees]);

/* ── 4. La mesure d'un levier ── */
const envoi = (i: number, o: Partial<EnvoiLu> = {}): EnvoiLu => ({ id: `e${i}`, type: 'reprise-j3', canal: 'whatsapp', statut: 'envoyé', quand: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T09:00:00.000Z`, clientId: `c${i}`, ...o });
const envois: EnvoiLu[] = Array.from({ length: 25 }, (_, i) => envoi(i));
const repondus: RdvDesPrevisions[] = Array.from({ length: 10 }, (_, i) => ({ clientId: `c${i}`, date: '2026-10-20', status: 'confirmé', creeLe: `2026-09-${String(1 + (i % 28) + 3).padStart(2, '0')}T10:00:00.000Z` }));
repondus.push({ clientId: 'c11', date: '2026-10-28', status: 'confirmé', creeLe: '2026-10-05T10:00:00.000Z' }); // 24 jours après : non
repondus.push({ clientId: 'c12', date: '2026-10-28', status: 'annulé', creeLe: '2026-09-15T10:00:00.000Z' }); // annulé : non
repondus.push({ clientId: 'c13', date: '2026-10-28', status: 'confirmé' }); // sans date de prise : non
envois.push(envoi(0, { id: 'double', quand: '2026-09-01T15:00:00.000Z' })); // même tête, même jour
envois.push(envoi(40, { statut: 'retenu' }), envoi(41, { statut: 'écarté' }), envoi(42, { quand: '2026-10-20T09:00:00.000Z' }), envoi(43, { clientId: undefined }), envoi(44, { quand: '2025-09-01T09:00:00.000Z' }));
const M = mesureDesEnvois(envois, repondus, AUJ);
dit('mesure : 25 têtes parties (la retenue, l écartée, la trop récente, la sans fiche, la trop vieille, le doublon du jour ne comptent pas), 10 revenues', [25, 10, 0.4], [M.envois, M.revenues, M.taux]);
dit('... sous vingt envois, pas de taux : à mesurer', [ENVOIS_POUR_MESURER, 19, null], [20, mesureDesEnvois(envois.slice(0, 19), repondus, AUJ).envois, mesureDesEnvois(envois.slice(0, 19), repondus, AUJ).taux]);

/* ── 5. Le calcul ── */
const histoire: RdvDesPrevisions[] = [];
const PARJOUR: Record<number, number> = { 2: 4, 3: 3, 4: 5, 5: 6, 6: 8 };
for (let j = '2025-01-01'; j < AUJ; j = ajouteJours(j, 1)) {
  const n = PARJOUR[jourDeSemaine(j)] ?? 0;
  for (let k = 0; k < n; k++) histoire.push({ clientId: `p${k}`, date: j, status: k === 0 && jourDeSemaine(j) === 6 ? 'annulé' : 'honoré' });
}
/* Les samedis perdent un annulé : leur compte non annulé est 7. */
const futurs: RdvDesPrevisions[] = [
  { clientId: 'f1', date: '2026-10-26', status: 'honoré' },
  ...['2026-10-27', '2026-10-27', '2026-11-04', '2026-11-04', '2026-11-04', '2026-11-18', '2026-11-18', '2026-11-18', '2026-11-18'].map((date, i) => ({ clientId: `f${i + 2}`, date, status: 'confirmé' })),
  { clientId: 'fz', date: '2026-11-05', status: 'annulé' },
  { clientId: 'fy', date: '2026-12-02', status: 'confirmé' },
];
const rdvs = [...histoire, ...futurs];
const parJour = rdvParJour(rdvs);
const reperes = reperesParJour({ parJour, aujourdhui: AUJ, ouvertLe });
dit('le plafond d un jour = son neuvième décile (constant ici : 4, 3, 5, 6, 7)', [4, 3, 5, 6, 7], [2, 3, 4, 5, 6].map((s) => reperes[s].plafond));
const cyc = new Map<string, number>();
let k = 0;
for (let j = '2026-04-01'; j < AUJ; j = ajouteJours(j, 1)) if (jourDeSemaine(j) === 2) { cyc.set(j, k % 10); k++; }
const Rc = reperesParJour({ parJour: cyc, aujourdhui: AUJ, ouvertLe });
const triesMardi = [...cyc.entries()].filter(([j]) => j >= ajouteJours(AUJ, -182)).map(([, n]) => n).sort((a, b) => a - b);
dit('... sur des mardis variés : le rang du neuvième décile, au-dessus de l objectif', [triesMardi[Math.ceil(0.9 * triesMardi.length) - 1], true], [Rc[2].plafond, Rc[2].plafond >= Rc[2].objectif]);

const entree = {
  aujourdhui: AUJ, bornes: h4, rdvs, parJour, ouvertLe, reperes,
  reprises: [{ iso: '2026-10-30' }, { iso: '2026-11-12' }, { iso: '2026-12-15' }],
  justesse: 0.5,
  nouvelles: { douzeMois: 24, filleules: 3, dejaPosees: 1 },
  retard: 10, endormies: 50,
  relance: { envois: 25, revenues: 10, taux: 0.4 },
  reveil: { envois: 30, revenues: 3, taux: 0.1 },
  physique: { sieges: 2, dureeMoyenneMin: 120, ouverture: (j: string) => ({ closed: !ouvertLe(j), openMin: 540, closeMin: 1140 }) },
};
const P = calculeLesPrevisions(entree);
const t = honneurDesDouzeMois(rdvs, AUJ).taux;
dit('posés : 10 non annulés dans l horizon, l honoré du jour pour un, les neuf autres au taux d honneur', [10, 1, true], [P.poses.nombre, P.poses.honores, proche(P.poses.rdv, 1 + 9 * t)]);
dit('reprises : seules celles de l horizon, à la justesse', [2, 1], [P.reprises.nombre, P.reprises.rdv]);
const att = 2 * (28 / JOURS_PAR_MOIS);
dit('nouvelles : 2 par mois × durée, moins la déjà posée', [2, true], [P.nouvelles.parMois, proche(P.nouvelles.rdv, att - 1)]);
dit('la prévision est la somme des trois', true, proche(P.prevision, 1 + 9 * t + 1 + (att - 1)));
dit('... bas sous la prévision, haut au-dessus', [true, true], [P.bas < P.prevision, P.haut > P.prevision]);
dit('le plafond : vingt jours ouverts, chacun à son plafond, du mardi au samedi ; le lundi fermé au rendez-vous posé n a pas de ligne', [100, ['mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], [4, 4, 4, 4, 4], [16, 12, 20, 24, 28]],
  [P.plafond.total, P.plafond.jours.map((j) => j.nom), P.plafond.jours.map((j) => j.jours), P.plafond.jours.map((j) => j.rdv)]);
dit('... pour mémoire : 2 fauteuils × 600 minutes ÷ 120, vingt jours', 200, P.plafond.physique);
const lundiVecu = calculeLesPrevisions({ ...entree, reperes: reperes.map((r) => (r.jour === 1 ? { ...r, plafond: 2 } : r)) });
dit('un jour fermé ne porte son plafond que si un rendez-vous y est posé (le lundi du jour, pas les trois autres)', [102, 1],
  [lundiVecu.plafond.total, lundiVecu.plafond.jours.find((j) => j.nom === 'lundi')?.jours]);
dit('places libres = plafond moins prévision', true, proche(P.placesLibres, 100 - P.prevision));
dit('marketing : base × taux mesuré, relance 10 × 40 % et réveil 50 × 10 %', [4, 5, 9, 9], [P.leviers[0].rdv, P.leviers[1].rdv, P.marketingBrut, P.marketing]);
dit('... le parrainage est déjà dans les nouvelles, l offre à mesurer', [['parrainage', 'inclus', 0], ['offre', 'a-mesurer', 0], true],
  [[P.leviers[2].cle, P.leviers[2].etat, P.leviers[2].rdv], [P.leviers[3].cle, P.leviers[3].etat, P.leviers[3].rdv], P.leviers[2].mesure.startsWith('3 filleules en douze mois')]);
const borne = calculeLesPrevisions({ ...entree, retard: 1000 });
dit('le marketing est borné aux places libres', [true, true], [proche(borne.marketing, borne.placesLibres), borne.marketingBrut > borne.placesLibres]);
const sansMesure = calculeLesPrevisions({ ...entree, relance: { envois: 7, revenues: 5, taux: null } });
dit('un levier sans mesure compte zéro et le dit', [0, 'a-mesurer', true], [sansMesure.leviers[0].rdv, sansMesure.leviers[0].etat, /il en faut 20/.test(sansMesure.leviers[0].mesure)]);
const somme = (f: (c: (typeof P.colonnes)[number]) => number) => P.colonnes.reduce((s, c) => s + f(c), 0);
dit('les colonnes du dessin recomposent les totaux', [true, true, true, 100],
  [proche(somme((c) => c.poses), P.poses.rdv), proche(somme((c) => c.attendus), P.reprises.rdv + P.nouvelles.rdv), proche(somme((c) => c.marketing), P.marketing), somme((c) => c.plafond)]);
dit('... le marketing d une colonne ne dépasse pas ses places libres', true, P.colonnes.every((c) => c.marketing <= Math.max(0, c.plafond - c.poses - c.attendus) + 1e-9));

/* ── 6. Une cliente, une place ── */
const fin = h4.fin;
dit('une place par cliente', ['posee', 'attendue', 'plus-tard', 'retard', 'endormie', 'hors'], [
  placeDeLaCliente({ aUnRdvAVenir: true, predit: true, iso: '2026-11-01', retardJours: 3, dort: false, fin }),
  placeDeLaCliente({ aUnRdvAVenir: false, predit: true, iso: '2026-11-01', retardJours: 0, dort: false, fin }),
  placeDeLaCliente({ aUnRdvAVenir: false, predit: true, iso: '2027-01-10', retardJours: 0, dort: false, fin }),
  placeDeLaCliente({ aUnRdvAVenir: false, predit: true, iso: '2026-10-28', retardJours: 12, dort: false, fin }),
  placeDeLaCliente({ aUnRdvAVenir: false, predit: false, iso: null, retardJours: 0, dort: true, fin }),
  placeDeLaCliente({ aUnRdvAVenir: false, predit: false, iso: null, retardJours: 0, dort: false, fin }),
]);

/* ── 7. Et les mois passés ? La prévision rejouée ── */
const passe = moisDuPasse(AUJ);
dit('les douze mois entiers avant le mois en cours, du plus ancien au plus récent', [12, '2025-10', '2026-09'], [passe.length, passe[0], passe[11]]);
const savoir: RdvDesPrevisions[] = [
  { clientId: 'a', date: '2026-08-20', status: 'honoré' },
  { clientId: 'b', date: '2026-09-10', status: 'honoré', creeLe: '2026-08-25T10:00:00.000Z' },
  { clientId: 'c', date: '2026-09-12', status: 'annulé', creeLe: '2026-08-30T10:00:00.000Z' },
  { clientId: 'd', date: '2026-09-15', status: 'honoré' },
  { clientId: 'e', date: '2026-09-20', status: 'honoré', creeLe: '2026-09-05T10:00:00.000Z' },
];
dit('ce que le Trône savait le 1er : le passé tel quel, les rendez-vous déjà pris ramenés à « confirmé », rien d autre',
  [['a', 'honoré'], ['b', 'confirmé'], ['c', 'confirmé']], rdvsConnusLe(savoir, '2026-09-01').map((x) => [x.clientId, x.status]));

/* Septembre 2026 rejoué sur l'histoire du point 5 : ses jours, vécus sans date
   de prise, ne se savaient pas ; trois rendez-vous pris en août, si. */
const sept: RdvDesPrevisions[] = [...histoire,
  { clientId: 'x1', date: '2026-09-08', status: 'honoré', creeLe: '2026-08-20T09:00:00.000Z' },
  { clientId: 'x2', date: '2026-09-09', status: 'honoré', creeLe: '2026-08-21T09:00:00.000Z' },
  { clientId: 'x3', date: '2026-09-10', status: 'annulé', creeLe: '2026-08-22T09:00:00.000Z' },
];
const RS = rejoueLeMois({ mois: '2026-09', rdvs: sept, ouvertLe, reprises: [{ iso: '2026-09-15' }, { iso: '2026-10-02' }], justesse: 0.5, estFilleule: () => false });
const t1 = honneurDesDouzeMois(rdvsConnusLe(sept, '2026-09-01'), '2026-09-01').taux;
const duSept = sept.filter((a) => a.date >= '2026-09-01' && a.date <= '2026-09-30');
let plafSept = 0;
for (let j = '2026-09-01'; j <= '2026-09-30'; j = ajouteJours(j, 1)) if (ouvertLe(j)) plafSept += ({ 2: 4, 3: 3, 4: 5, 5: 6, 6: 7 } as Record<number, number>)[jourDeSemaine(j)];
dit('rejoué : trois posés connus au taux d alors, une reprise du mois à la justesse ; les jours vécus sans date de prise n y entrent pas',
  [3, true], [RS.posesConnus, Math.abs(RS.prevu - (3 * t1 + 0.5)) < 1e-9]);
dit('... le réalisé : les venues du mois, les annulés ; le plafond lu au 1er', [duSept.filter((a) => a.status === 'honoré').length, duSept.filter((a) => a.status === 'annulé').length, plafSept],
  [RS.venus, RS.annules, RS.plafond]);
dit('... l écart = venus moins prévu ; le nom du mois', [true, 'Septembre 2026', 'sept.'], [Math.abs(RS.ecart - (RS.venus - RS.prevu)) < 1e-9, RS.nom, RS.nomCourt]);
const nov: RdvDesPrevisions[] = [...histoire, ...Array.from({ length: 6 }, (_, i) => ({ clientId: `y${i}`, date: '2026-11-1' + String(i), status: 'confirmé', creeLe: '2026-10-20T09:00:00.000Z' }))];
const RN = rejoueLeMois({ mois: '2026-11', rdvs: nov, ouvertLe, reprises: [], justesse: 0.5, estFilleule: () => false });
dit('hors fourchette par le bas : six posés, aucun venu', [0, true, false], [RN.venus, Math.floor(RN.bas) >= 1, RN.dansLaFourchette]);
dit('un mois ne se juge que si ses posés du 1er se savaient : la date de prise est notée depuis le 5 septembre 2026', [false, false, true, '2026-11-01', false, true],
  [seJuge('2026-08'), seJuge('2026-09'), seJuge('2026-10'), premierMoisJugeLisibleLe(), RS.juge, rejoueLeMois({ mois: '2026-10', rdvs: sept, ouvertLe, reprises: [], justesse: 0.5, estFilleule: () => false }).juge]);
const fx = (o: Partial<MoisRejoue>): MoisRejoue => ({ mois: '2026-01', nom: '', nomCourt: '', prevu: 0, bas: 0, haut: 0, posesConnus: 0, venus: 0, annules: 0, plafond: 0, ecart: 0, dansLaFourchette: false, juge: true, ...o });
const R12 = resumeDuRejeu([fx({ venus: 10, prevu: 8, ecart: 2, plafond: 20, annules: 1, dansLaFourchette: true }), fx({ venus: 6, prevu: 9, ecart: -3, plafond: 20 }),
  fx({ venus: 30, prevu: 2, ecart: 28, plafond: 40, annules: 2, dansLaFourchette: true, juge: false })]);
dit('le résumé : l écart et la fourchette sur les mois jugés seuls ; le réalisé et le plafond sur tous', [3, 2, 2.5, 5 / 16, -1, 1, 17, 46, 3, 46 / 80],
  [R12.mois, R12.moisJuges, R12.ecartMoyen, R12.ecartPart, R12.ecartTotal, R12.dansLaFourchette, R12.prevu, R12.venus, R12.annules, R12.part]);

/* ── 8. L'écran, la barre, la porte du Marketing ── */
const ecran = sansCommentaires(readFileSync('src/apps/trone/routes/pilotage/Previsions.tsx', 'utf8'));
dit('l écran calcule par le module, une place par cliente, les deux mesures réelles', [true, true, true, true],
  [/calculeLesPrevisions\(\{/.test(ecran), /placeDeLaCliente\(\{/.test(ecran), /e\.type === 'reprise-j3'/.test(ecran), /c\.audience === 'dormantes'/.test(ecran)]);
dit('l écran compte les venues comme le Carnet, et rejoue chaque mois au 1er', [true, true, true, true],
  [ecran.includes('encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id),'), /rdvsConnusLe\(appts, premier\)/.test(ecran),
    /predictNextVisit\(siens, \[c\], c\.id, premier\)/.test(ecran), /rejoueLeMois\(\{ mois, rdvs, ouvertLe, reprises,/.test(ecran)]);
dit('... le quatrième bouton : 12 derniers mois', true, />\s*12 derniers mois\s*</.test(ecran));
dit('... « Préparer » ouvre une campagne adressée, sans rien envoyer', [true, false], [/navigate\('\/marketing\?ecrire=dormantes'\)/.test(ecran), /feuVert\(|envoisStore/.test(ecran)]);
const routes = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
const direction = routes.slice(routes.indexOf("group: 'Direction'"), routes.indexOf('group:', routes.indexOf("group: 'Direction'") + 10));
dit('la barre : Les prévisions en Direction, juste sous le Centre de commande, et nommée parmi les écrans nés après les départements', [true, true, true],
  [/path: '\/previsions', label: 'Les prévisions'/.test(direction),
    direction.indexOf("'/previsions'") > direction.indexOf("'/centre-de-commande'") && direction.indexOf("'/previsions'") < direction.indexOf("'/projets'"),
    /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/previsions'/.test(routes)]);
const marketing = sansCommentaires(readFileSync('src/apps/trone/routes/equipe/Marketing.tsx', 'utf8'));
dit('le Marketing ouvre la campagne demandée par ?ecrire=, une audience connue seulement', true,
  /params\.get\('ecrire'\)/.test(marketing) && /if \(estUneAudienceConnue\(aEcrire\)\) ecrireA\(aEcrire\);/.test(marketing));
dit('pas de tiret cadratin dans ce que l écran et la règle disent', [false, false],
  [/—/.test(ecran), /—/.test(sansCommentaires(readFileSync('src/shared/previsions-pur.ts', 'utf8')))]);

console.log(ko === 0 ? '\nLes prévisions tiennent.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
