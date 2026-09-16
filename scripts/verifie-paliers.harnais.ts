/* LES TROIS PALIERS, ÉPROUVÉS — `node scripts/verifie-paliers.mjs`.

   « Comment je peux mieux l'exploiter dans le Trône et faire une vraie
   distinction et un vrai usage, et que le tout soit très clair » (Yéman,
   16 septembre 2026). Maquette `maquette-les-trois-paliers.html`, validée.

   UN PALIER FAUX SE DIT À LA CLIENTE. « Votre couronne est en Souveraineté »
   à qui vient pour la deuxième fois, ou « Fondation » à qui a trois ans de
   couronne, se lit sur son téléphone. Ce harnais tient les quatre arbitrages :
   elle monte par son carnet, jamais à la main ; le premier des deux seuils ;
   sans date, rien ne se compte ; elle ne redescend jamais. */
import {
  palierDeLaCliente, palierDuCarnet, pasSuivant, repartitionDesPaliers, rituelsDuMoisParPalier,
  seuilsPropres, moisEntre, plusDesMois, palierSuivant, plusHautDes, SEUILS_DEFAUT,
  type Palier,
} from '../src/shared/paliers';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-16';
const F: Palier = 'Fondation';
const E: Palier = 'Élévation';
const S: Palier = 'Souveraineté';
const h = (date: string, ...paliers: Palier[]) => ({ date, paliers });
const lit = (honores: { date: string; paliers: Palier[] }[], crownSince?: string, seuils?: Partial<typeof SEUILS_DEFAUT>) =>
  palierDeLaCliente({ honores, crownSince, aujourdhui: AUJ, seuils });

/* ── ① LES SEUILS ─────────────────────────────────────────────────── */
dit('les seuils du 16 septembre', { elevationRituels: 3, elevationMois: 6, souveraineteMois: 18 }, SEUILS_DEFAUT);
dit('un seuil à zéro retombe sur le défaut', 3, seuilsPropres({ elevationRituels: 0 }).elevationRituels);
dit('un seuil illisible retombe sur le défaut', 6, seuilsPropres({ elevationMois: Number('six') }).elevationMois);
dit('un seuil réglé se respecte', 4, seuilsPropres({ elevationRituels: 4 }).elevationRituels);

/* ── ② LES DATES ──────────────────────────────────────────────────── */
dit('onze mois révolus', 11, moisEntre('2025-10-10', AUJ));
dit('… dix seulement si le jour n’est pas atteint', 10, moisEntre('2025-10-20', AUJ));
dit('… le jour du mois doit être atteint', 10, moisEntre('2025-10-31', '2026-09-16'));
dit('six mois après le 31 mars tombent le 30 septembre', '2026-09-30', plusDesMois('2026-03-31', 6));
dit('l’échelle monte de marche en marche', [E, S, null], [palierSuivant(F), palierSuivant(E), palierSuivant(S)]);
dit('le plus haut de deux paliers', S, plusHautDes(E, S));
dit('… et de rien', E, plusHautDes(null, E));

/* ── ③ RIEN AVANT LE PREMIER RITUEL ───────────────────────────────── */
dit('sans rituel honoré, pas de palier', null, lit([]).palier);
dit('… même avec trois ans de couronne', null, lit([], '2023-01-01').palier);
dit('un rituel à venir ne compte pas', null, lit([h('2026-12-01', F)]).palier);
dit('une date illisible ne compte pas', null, lit([h('bientôt', F)]).palier);

/* ── ④ FONDATION, DÈS LE PREMIER ──────────────────────────────────── */
const premiere = lit([h('2026-09-10', F)]);
dit('un premier rituel pose la Fondation', F, premiere.palier);
dit('… depuis ce jour-là', '2026-09-10', premiere.depuis);
dit('… et le dit', 'son premier rituel honoré', premiere.motif);
dit('… deux rituels, encore Fondation', F, lit([h('2026-08-01', F), h('2026-09-01', E)]).palier);

/* ── ⑤ ÉLÉVATION : LE TROISIÈME RITUEL, OU SIX MOIS ───────────────── */
const troisieme = lit([h('2026-07-01', F), h('2026-08-01', F), h('2026-09-01', F)]);
dit('au troisième rituel, Élévation', E, troisieme.palier);
dit('… depuis le jour du troisième', '2026-09-01', troisieme.depuis);
dit('… par les rituels', '3 rituels honorés', troisieme.motif);
const ancienne = lit([h('2026-09-01', F)], '2025-12-15');
dit('un seul rituel mais neuf mois de couronne : Élévation', E, ancienne.palier);
dit('… par l’ancienneté', '6 mois de couronne', ancienne.motif);
/* L'ANCIENNETÉ NE FAIT MONTER QU'À PARTIR DU PREMIER RITUEL : une couronne
   née ailleurs ne vaut rien tant qu'on ne l'a pas vue. */
dit('… mais jamais avant le premier rituel vu', '2026-09-01', ancienne.depuis);
dit('à cinq mois de couronne, encore Fondation', F, lit([h('2026-09-01', F)], '2026-04-10').palier);
dit('LE PREMIER DES DEUX : le troisième rituel avant les six mois', '2026-05-20',
  lit([h('2026-03-01', F), h('2026-04-10', F), h('2026-05-20', F)], '2026-01-01').depuis);
dit('… ou les six mois avant le troisième rituel', '2026-07-01',
  lit([h('2026-02-01', F), h('2026-08-01', F), h('2026-09-10', F)], '2026-01-01').depuis);
dit('un seuil réglé à deux rituels monte plus tôt', E, lit([h('2026-08-01', F), h('2026-09-01', F)], undefined, { elevationRituels: 2 }).palier);

/* ── ⑥ SOUVERAINETÉ : L'ACTE, OU DIX-HUIT MOIS ───────────────────── */
const parActe = lit([h('2026-02-01', F), h('2026-09-01', S)]);
dit('un acte de Souveraineté honoré la pose en Souveraineté', S, parActe.palier);
dit('… depuis ce jour-là', '2026-09-01', parActe.depuis);
dit('… et le dit', 'un acte de Souveraineté honoré', parActe.motif);
dit('un acte de Souveraineté à VENIR ne la pose pas', F, lit([h('2026-09-01', F), h('2026-10-01', S)]).palier);
const parAge = lit([h('2024-06-01', F)], '2024-01-01');
dit('dix-huit mois de couronne : Souveraineté', S, parAge.palier);
dit('… depuis le jour des dix-huit mois', '2025-07-01', parAge.depuis);
dit('… par l’ancienneté', '18 mois de couronne', parAge.motif);
dit('à dix-sept mois, Élévation (par l’ancienneté)', E, lit([h('2025-06-01', F)], '2025-04-10').palier);
/* ELLE NE REDESCEND JAMAIS : le palier est le plus haut que le carnet
   justifie, quels que soient les rituels d'après. */
dit('des rituels de Fondation après un acte de Souveraineté ne la font pas redescendre', S,
  lit([h('2026-01-01', S), h('2026-05-01', F), h('2026-09-01', F)]).palier);
dit('le plus haut acte vécu se garde', S, lit([h('2026-01-01', S), h('2026-05-01', F)]).plusHautActe);
dit('le résumé dit les rituels et la couronne', '7 rituels honorés · 11 mois de couronne',
  lit(Array.from({ length: 7 }, (_, i) => h(`2026-0${(i % 8) + 1}-1${i}`, F)), '2025-10-01').resume);

/* ── ⑦ LE CARNET DU TRÔNE ─────────────────────────────────────────── */
const parId = new Map<string, { palier: Palier }>([['sv-f', { palier: F }], ['sv-e', { palier: E }], ['sv-s', { palier: S }]]);
const rdvs = [
  { clientId: 'c1', status: 'honoré', date: '2026-07-01', serviceIds: ['sv-f'], branchId: 'b1' },
  { clientId: 'c1', status: 'honoré', date: '2026-08-01', serviceIds: ['sv-f', 'sv-e'], branchId: 'b1' },
  { clientId: 'c1', status: 'annulé', date: '2026-09-01', serviceIds: ['sv-s'], branchId: 'b1' },
  { clientId: 'c2', status: 'honoré', date: '2026-09-02', serviceIds: ['sv-s'], branchId: 'b1' },
  { clientId: 'c3', status: 'prévu', date: '2026-09-20', serviceIds: ['sv-f'], branchId: 'b1' },
];
dit('le carnet ne compte que l’honoré de cette tête', F, palierDuCarnet({ id: 'c1' }, rdvs, parId, AUJ).palier);
dit('… deux rituels honorés', 2, palierDuCarnet({ id: 'c1' }, rdvs, parId, AUJ).rituels);
dit('un acte de Souveraineté honoré, une autre tête', S, palierDuCarnet({ id: 'c2' }, rdvs, parId, AUJ).palier);
dit('une tête sans rituel honoré n’a pas de palier', null, palierDuCarnet({ id: 'c3' }, rdvs, parId, AUJ).palier);

/* ── ⑧ LE PAS SUIVANT ─────────────────────────────────────────────── */
const catalogue = [
  { id: 'sv-f', name: 'Pose', palier: F, order: 1 },
  { id: 'sv-e', name: 'Resserrage', palier: E, order: 2 },
  { id: 'sv-e2', name: 'Couleur', palier: E, order: 3 },
  { id: 'sv-s', name: 'Restauration', palier: S, order: 4 },
];
dit('en Fondation, le pas suivant est un acte d’Élévation', 'Resserrage', pasSuivant(F, catalogue, new Set())?.name);
dit('… qu’elle n’a pas déjà vécu', 'Couleur', pasSuivant(F, catalogue, new Set(['sv-e']))?.name);
dit('en Élévation, un acte de Souveraineté', 'Restauration', pasSuivant(E, catalogue, new Set())?.name);
dit('en Souveraineté, on approfondit', 'Restauration', pasSuivant(S, catalogue, new Set())?.name);
dit('… ou rien, quand tout est vécu', undefined, pasSuivant(S, catalogue, new Set(['sv-s']))?.name);
dit('sans palier, un acte de Fondation', 'Pose', pasSuivant(null, catalogue, new Set())?.name);

/* ── ⑨ LA MAISON, PALIER PAR PALIER ───────────────────────────────── */
const lectures = [
  lit([h('2026-09-10', F)]),
  lit([h('2026-07-01', F), h('2026-08-01', F), h('2026-09-01', F)]),
  lit([h('2026-02-01', F), h('2026-08-20', S)]),
  lit([]),
];
const rep = repartitionDesPaliers(lectures, '2026-09');
dit('la répartition compte chaque palier', { Fondation: 1, 'Élévation': 1, 'Souveraineté': 1 }, rep.parPalier);
dit('… et les têtes sans palier', 1, rep.sansPalier);
dit('… et les montées du mois', { Fondation: 1, 'Élévation': 1, 'Souveraineté': 0 }, rep.monteesDuMois);
dit('les rituels du mois, par palier de l’acte', { Fondation: 0, 'Élévation': 0, 'Souveraineté': 1 },
  rituelsDuMoisParPalier(rdvs, parId, '2026-09', 'b1'));
dit('… un rituel mixte compte à son plus haut palier', { Fondation: 0, 'Élévation': 1, 'Souveraineté': 0 },
  rituelsDuMoisParPalier(rdvs, parId, '2026-08', 'b1'));

console.log(ko === 0 ? '\nLes trois paliers tiennent.' : `\n${ko} épreuve(s) en échec.`);
