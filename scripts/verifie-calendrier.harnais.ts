/* LE CALENDRIER DE LA MAISON, ÉPROUVÉ — `node scripts/verifie-calendrier.mjs`.

   Une grille de mois fausse d'un seul jour décale silencieusement tout un
   carnet : on clique sur la case du mardi et l'on pose le mercredi, sans que
   rien ne l'annonce. C'est la faute la plus discrète et la plus coûteuse de
   tout ce champ, et elle vient presque toujours du même endroit : JavaScript
   fait commencer la semaine le DIMANCHE, le Bénin le lundi. */
import {
  jourDeSemaineLundi, grilleDuMois, moisVoisin,
  anneesPossibles, retardEnJours, correctionsPossibles,
} from '../src/shared/calendrier';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-12';   // un samedi

/* ── ① LA SEMAINE COMMENCE LE LUNDI ────────────────────────────────
   JavaScript rend 0 pour dimanche ; la Maison compte à partir du lundi. */
dit('lundi vaut zéro', 0, jourDeSemaineLundi('2026-09-07'));
dit('samedi vaut cinq', 5, jourDeSemaineLundi('2026-09-12'));
dit('dimanche vaut six, pas zéro', 6, jourDeSemaineLundi('2026-09-13'));

/* ── ② LA GRILLE — quarante-deux cases, toujours ────────────────────
   Une grille dont la hauteur change d'un mois à l'autre fait sauter les
   boutons sous le doigt : on clique sur la mauvaise date en visant la bonne. */
const sept = grilleDuMois(2026, 9);
dit('quarante-deux cases', 42, sept.length);
dit('la première case est un lundi', 0, jourDeSemaineLundi(sept[0].iso));
dit('la dernière est un dimanche', 6, jourDeSemaineLundi(sept[41].iso));
/* Septembre 2026 commence un MARDI : la grille doit donc s'ouvrir sur le
   31 août, grisé. Si elle s'ouvrait au 1er septembre, tout glisserait d'un
   jour et l'on poserait les rendez-vous la veille. */
dit('le mois s’ouvre sur le lundi d’avant', { iso: '2026-08-31', jour: 31, horsMois: true }, sept[0]);
dit('le 1er septembre suit', { iso: '2026-09-01', jour: 1, horsMois: false }, sept[1]);
dit('le mois compte ses trente jours', 30, sept.filter((c) => !c.horsMois).length);

/* FÉVRIER D'UNE ANNÉE BISSEXTILE — le piège classique. 2028 en est une. */
dit('février 2028 a vingt-neuf jours', 29,
  grilleDuMois(2028, 2).filter((c) => !c.horsMois).length);
dit('février 2027 n’en a que vingt-huit', 28,
  grilleDuMois(2027, 2).filter((c) => !c.horsMois).length);

/* UN MOIS QUI COMMENCE UN LUNDI ne doit PAS s'ouvrir sur une semaine vide en
   tête : juin 2026 commence un lundi, sa première case est le 1er juin. */
dit('un mois qui commence un lundi n’a pas de semaine vide',
  { iso: '2026-06-01', horsMois: false }, (({ iso, horsMois }) => ({ iso, horsMois }))(grilleDuMois(2026, 6)[0]));

/* ── ③ LES MOIS VOISINS — l'année se franchit sans y penser ─────────── */
dit('décembre plus un donne janvier suivant', { annee: 2027, mois: 1 }, moisVoisin(2026, 12, 1));
dit('janvier moins un donne décembre précédent', { annee: 2025, mois: 12 }, moisVoisin(2026, 1, -1));
dit('septembre plus un, sans surprise', { annee: 2026, mois: 10 }, moisVoisin(2026, 9, 1));
dit('douze mois en arrière font une année', { annee: 2025, mois: 9 }, moisVoisin(2026, 9, -12));

/* ── ④ L'ANNÉE QUI MANQUE ──────────────────────────────────────────
   LE DÉFAUT CORRIGÉ : la liste ne regardait que le passé. En décembre, poser
   un rituel de janvier n'avait AUCUNE bonne réponse. */
dit('un jour déjà passé vise l’an prochain', [2027, 2026, 2028],
  anneesPossibles('03-09', '2026-12-20', 'avant'));
dit('un jour encore devant reste cette année', [2026, 2027, 2025],
  anneesPossibles('12-25', AUJ, 'avant'));
/* UN ANNIVERSAIRE REGARDE DERRIÈRE, et c'est l'autre moitié de la règle :
   proposer 2027 pour une date de naissance n'aurait aucun sens. */
dit('un anniversaire regarde derrière', [2026, 2025, 2024],
  anneesPossibles('03-09', AUJ, 'arriere'));
/* LE JOUR MÊME N'EST PAS PASSÉ : un rituel posé pour aujourd'hui est le cas
   le plus fréquent du comptoir, et l'envoyer à l'an prochain serait absurde. */
dit('aujourd’hui même reste cette année', [2026, 2027, 2025],
  anneesPossibles('09-12', AUJ, 'avant'));

/* ── ⑤ CE QUI EST DERRIÈRE NOUS ────────────────────────────────────
   Rien ne prévenait : le rendez-vous se créait, disparaissait du carnet, et
   personne ne le voyait avant que la cliente se présente. */
dit('quarante jours de retard se comptent', 40, retardEnJours('2026-08-03', AUJ));
dit('aujourd’hui n’est pas en retard', 0, retardEnJours(AUJ, AUJ));
dit('demain non plus', 0, retardEnJours('2026-09-13', AUJ));
dit('une date vide ne l’est pas davantage', 0, retardEnJours('', AUJ));

/* ── ⑥ CE QU'ELLE VOULAIT DIRE ─────────────────────────────────────
   La correction par ÉCHANGE est la réponse au piège du calendrier anglais :
   « 3/9 » lu 9 mars au lieu du 3 septembre. La proposer, c'est refermer le
   piège devant celle qui vient d'y tomber. */
/* MON ÉPREUVE ÉTAIT FAUSSE, PAS LE CODE. J'attendais « 2026-03-08 » sans
   voir que le 8 mars 2026 est DERRIÈRE NOUS : une correction qui laisse la
   date dans le passé ne corrige rien, et la fonction a raison de la porter à
   l'année suivante. C'est exactement la règle que j'avais écrite deux lignes
   plus haut, et que ma main n'a pas suivie. */
dit('le 3 août propose l’an prochain et l’échange',
  ['2027-08-03', '2027-03-08'], correctionsPossibles('2026-08-03', AUJ));
/* L'ÉCHANGE DOIT RESTER DEVANT : le 8 mars 2026 est passé, on offre donc le
   8 mars 2027 plutôt qu'une date qui ne corrige rien. */
dit('un échange déjà passé glisse à l’an prochain',
  ['2027-02-03', '2027-03-02'], correctionsPossibles('2026-02-03', AUJ));
/* UN QUANTIÈME AU-DELÀ DE DOUZE NE PEUT PAS ÊTRE UN MOIS : on se tait plutôt
   que de proposer un vingt-septième mois. */
dit('le 27 mars n’a pas d’échange', ['2027-03-27'], correctionsPossibles('2026-03-27', AUJ));
/* ET LE 31 AVRIL N'EXISTE PAS : offrir une date impossible ferait douter de
   tout le reste de l'écran. */
dit('un échange impossible ne s’offre pas', ['2027-01-31'], correctionsPossibles('2026-01-31', AUJ));
dit('une date à venir n’a rien à corriger', [], correctionsPossibles('2026-12-25', AUJ));
dit('une date vide non plus', [], correctionsPossibles('', AUJ));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} épreuve(s) en échec.`);
