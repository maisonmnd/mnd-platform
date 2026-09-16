/* LES PARCOURS DE L'ACADÉMIE, ÉPROUVÉS — `node scripts/verifie-parcours.mjs`.

   Poser deux fois les neuf parcours en ferait dix-huit, dont neuf jumeaux, et
   il faudrait les démêler un par un dans une liste qui porte déjà des
   inscriptions. */
import {
  PARCOURS_MND, parcoursParId, parcoursAPoser, completeLaFiche, dureeDite, competencesDesModules,
  maitriseDe, texteDuCertificat,
} from '../src/shared/parcours';
import { depositAmountFor, depositLabelOf, seancesDuProgramme, datesDesSeances, lignesDuPlan } from '../src/apps/trone/routes/equipe/academy';
import type { Formation } from '../src/apps/trone/routes/equipe/data';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① LES NEUF SONT LÀ, ET COMPLETS ───────────────────────────────
   Un champ vide ne se voit qu'une fois le certificat imprimé. */
dit('neuf parcours', 9, PARCOURS_MND.length);
dit('aucun creux', 0, PARCOURS_MND.filter((p) => !p.id || !p.titre || !p.niveau || !p.duree
  || !p.competences || !p.semaines || !p.seances).length);
dit('des identifiants uniques', 9, new Set(PARCOURS_MND.map((p) => p.id)).size);
dit('des titres uniques', 9, new Set(PARCOURS_MND.map((p) => p.titre)).size);
dit('les trois paliers y sont', 3,
  PARCOURS_MND.filter((p) => p.niveau.startsWith('Palier')).length);
dit('on retrouve un parcours par son nom', 'Affirmation', parcoursParId('affirmation')?.titre);
dit('un identifiant inconnu ne rend rien', undefined, parcoursParId('x'));

/* ── ② ON NE POSE QUE CE QUI MANQUE ────────────────────────────────
   Reposer les neuf sur une Académie qui en porte trois en ferait douze. */
dit('sur une Académie vide, les neuf', 9, parcoursAPoser([]).length);
dit('celle qui est là ne se repose pas', 8,
  parcoursAPoser([{ name: 'Affirmation' }]).length);
dit('… et c’est bien celle-là qui manque en moins', false,
  parcoursAPoser([{ name: 'Affirmation' }]).some((p) => p.id === 'affirmation'));
dit('toutes posées, plus rien à faire', 0,
  parcoursAPoser(PARCOURS_MND.map((p) => ({ name: p.titre }))).length);

/* LA COMPARAISON SE FAIT SUR LE NOM APLATI. La Maison a pu écrire « L'Oeuvre »
   là où la référence dit « L'Œuvre » : deux graphies d'un même parcours restent
   un seul parcours, et le reposer en ferait un doublon. */
dit('l’apostrophe droite ne trompe pas', false,
  parcoursAPoser([{ name: "Maitre MND" }]).some((p) => p.id === 'maitre'));
dit('la casse non plus', false,
  parcoursAPoser([{ name: 'AFFIRMATION' }]).some((p) => p.id === 'affirmation'));
dit('les espaces autour non plus', false,
  parcoursAPoser([{ name: '  Fondation  ' }]).some((p) => p.id === 'fondation'));
/* LA LIGATURE, OUBLIÉE JUSQU'AU 13 SEPTEMBRE 2026 : « Œ » ne se décompose pas,
   et « L'Oeuvre » restait un autre parcours, au contraire de la promesse. */
dit('la ligature ne trompe plus : L’Oeuvre est L’Œuvre', false,
  parcoursAPoser([{ name: "L'Oeuvre" }]).some((p) => p.id === 'oeuvre'));
/* UNE FORMATION MAISON NE BLOQUE RIEN : elle ne porte aucun de ces noms. */
dit('une formation à elle ne gêne pas', 9,
  parcoursAPoser([{ name: 'Atelier du samedi' }]).length);

/* ── ③ LE CONTENU — 13 septembre 2026 ──────────────────────────────
   Les modules sont les unités du Suivi : chacun se valide à 70 avant le jury.
   Un programme qui ne tombe pas juste sur ses séances ment à la candidate ; un
   nom de module répété fondrait deux progressions en une. */
dit('chaque programme tombe juste sur ses séances', [],
  PARCOURS_MND.filter((p) => p.programme.reduce((n, m) => n + m.seances, 0) !== p.seances).map((p) => p.id));
dit('quatre modules évaluables par parcours', [],
  PARCOURS_MND.filter((p) => p.programme.length !== 4).map((p) => p.id));
dit('des noms de modules uniques dans un parcours', [],
  PARCOURS_MND.filter((p) => new Set(p.programme.map((m) => m.nom)).size !== p.programme.length).map((p) => p.id));
dit('aucune rubrique vide', [],
  PARCOURS_MND.filter((p) => !p.accroche || !p.pourQui || !p.pourEntrer || !p.tetesReelles
    || p.sait.length === 0 || p.programme.some((m) => !m.nom || !m.contenu || m.seances < 1)).map((p) => p.id));

/* LES DEUX PUBLICS NE SE MÉLANGENT PAS : trois paliers pour les débutantes,
   tout le reste pour les professionnelles. */
dit('les débutantes ont les trois paliers', ['fondation', 'affirmation', 'oeuvre'],
  PARCOURS_MND.filter((p) => p.public === 'debutante').map((p) => p.id));
dit('les professionnelles ont les six autres', 6,
  PARCOURS_MND.filter((p) => p.public === 'professionnelle').length);

/* LES PRIX, DEMANDÉS PAR LA MAISON : un sur chacun, rond au millier. */
dit('un prix sur chacun, rond au millier', [],
  PARCOURS_MND.filter((p) => !(p.prixXof > 0) || p.prixXof % 1000 !== 0).map((p) => p.id));
dit('le cursus des débutantes vaut Maître MND', parcoursParId('maitre')?.prixXof,
  ['fondation', 'affirmation', 'oeuvre'].reduce((n, id) => n + (parcoursParId(id)?.prixXof ?? 0), 0));
dit('L’Œuvre et Maître MND ne disent plus la même chose', false,
  parcoursParId('oeuvre')?.competences === parcoursParId('maitre')?.competences);
/* LE CERTIFICAT N'IMPRIME PAS DE TIRET CADRATIN : la phrase suit « démontré
   devant le maître loctician ». */
dit('aucune phrase de certificat à tiret cadratin', [],
  PARCOURS_MND.filter((p) => p.competences.includes('—')).map((p) => p.id));

/* ── ④ COMPLÉTER SANS ÉCRASER ──────────────────────────────────────
   Les neuf sont déjà posées dans l'Académie, avec les quatre temps pour
   programme. Leur apporter le contenu validé ne doit rien reprendre de ce
   que la Maison a écrit. */
const TEMPS = ['Purifier', 'Nourrir', 'Sceller', 'Couronner'];
const O = { modulesParDefaut: TEMPS, inscrites: 0 };
const fondation = parcoursParId('fondation')!;
const nomsFondation = fondation.programme.map((m) => m.nom);
const posee = { name: 'Fondation', priceXof: 0, description: fondation.competences, modules: [...TEMPS] };

const c1 = completeLaFiche(posee, O);
dit('une fiche posée reçoit tout',
  ['public', 'accroche', 'pour qui', 'pour entrer', 'ce qu’elle sait', 'têtes réelles', 'prix', 'programme'], c1.rubriques);
dit('le programme remplace les quatre temps', nomsFondation, c1.fiche.modules);
dit('chaque module reçoit ses séances', [1, 1, 2, 2], c1.fiche.programme?.map((m) => m.seances));
dit('le prix proposé se pose', 150000, c1.fiche.priceXof);
dit('le public se pose', 'debutante', c1.fiche.public);
dit('repasser ne change plus rien', [], completeLaFiche(c1.fiche, O).rubriques);

dit('un prix posé à la main reste', 180000, completeLaFiche({ ...posee, priceXof: 180000 }, O).fiche.priceXof);
dit('une accroche écrite à la main reste', 'La nôtre.',
  completeLaFiche({ ...posee, accroche: 'La nôtre.' }, O).fiche.accroche);

/* DES INSCRITES : leurs modules validés se retrouvent par leur nom. */
const avecInscrites = completeLaFiche(posee, { ...O, inscrites: 2 });
dit('des inscrites gardent leurs modules', TEMPS, avecInscrites.fiche.modules);
dit('… mais la fiche reçoit le reste', fondation.accroche, avecInscrites.fiche.accroche);
dit('les mêmes noms reçoivent leurs séances, même avec des inscrites', [1, 1, 2, 2],
  completeLaFiche({ ...posee, modules: [...nomsFondation] }, { ...O, inscrites: 3 }).fiche.programme?.map((m) => m.seances));

dit('un programme fait main reste', ['Atelier A', 'Atelier B'],
  completeLaFiche({ ...posee, modules: ['Atelier A', 'Atelier B'] }, O).fiche.modules);
dit('des modules vidés exprès restent vides', [],
  completeLaFiche({ ...posee, modules: [] }, O).fiche.modules);

/* LES PHRASES QUI NE DISAIENT PAS LA BONNE CHOSE se remplacent quand on les
   retrouve telles quelles ; une phrase écrite par la Maison reste. */
dit('la phrase commune de L’Œuvre est remplacée', parcoursParId('oeuvre')?.competences,
  completeLaFiche({ name: "L'Oeuvre", priceXof: 0, modules: [...TEMPS],
    description: 'la maîtrise d’œuvre du soin des locks, la conduite d’atelier et la transmission de la méthode' }, O).fiche.description);
dit('l’ancienne phrase à tiret de Fondation est remplacée', fondation.competences,
  completeLaFiche({ ...posee, description: 'les gestes fondateurs de la Maison — purifier, nourrir, sceller et couronner la mèche' }, O).fiche.description);
dit('une description écrite à la main reste', 'Notre phrase.',
  completeLaFiche({ ...posee, description: 'Notre phrase.' }, O).fiche.description);
dit('une formation de la Maison seule ne bouge pas', [],
  completeLaFiche({ name: 'Atelier du samedi', priceXof: 0 }, O).rubriques);

/* ── ⑤ L'ACOMPTE, EN FRANCS OU EN POURCENTAGE — 13 septembre 2026 ──────
   « J'aimerais avoir la main pour corriger l'acompte des formations » (Yéman). */
const fo = (x: Partial<Formation>) => x as Formation;
dit('sans réglage, quarante pour cent', 60000, depositAmountFor(150000, fo({})));
dit('un pourcentage posé s’applique', 75000, depositAmountFor(150000, fo({ depositPct: 50 })));
dit('un montant en francs l’emporte sur le pourcentage', 50000, depositAmountFor(150000, fo({ depositPct: 40, depositXof: 50000 })));
dit('il ne dépasse jamais le prix convenu', 120000, depositAmountFor(120000, fo({ depositXof: 180000 })));
dit('un montant à zéro rend la main au pourcentage', 60000, depositAmountFor(150000, fo({ depositXof: 0 })));
dit('un prix nul ne doit rien', 0, depositAmountFor(0, fo({ depositXof: 50000 })));
dit('l’écran dit le pourcentage', '40 %', depositLabelOf(fo({})));
dit('ou le montant fixe', 'montant fixe', depositLabelOf(fo({ depositXof: 50000 })));

/* ── ⑥ LES DATES DES SÉANCES — 13 septembre 2026 ───────────────────────
   « Poser les dates des séances en même temps pour chaque module » (Yéman). */
dit('les séances suivent le programme, module par module',
  [{ sessionNumber: 1, moduleIndex: 0 }, { sessionNumber: 2, moduleIndex: 1 }, { sessionNumber: 3, moduleIndex: 1 }],
  seancesDuProgramme(fo({ modules: ['A', 'B'], programme: [{ seances: 1 }, { seances: 2 }], sessions: 3 })));
dit('sans séances au programme, une par module', [0, 1, 2],
  seancesDuProgramme(fo({ modules: ['A', 'B', 'C'], sessions: 6 })).map((x) => x.moduleIndex));
dit('sans module, le nombre de séances', 4, seancesDuProgramme(fo({ modules: [], sessions: 4 })).length);
dit('sans formation, rien', [], seancesDuProgramme(undefined));
/* Le 14 septembre 2026 est un lundi, le 12 un samedi. Lundi = 0, dimanche = 6. */
dit('une par semaine, le même jour', ['2026-09-14', '2026-09-21', '2026-09-28'],
  datesDesSeances(3, '2026-09-14', 'hebdo'));
dit('un jour fermé glisse au lendemain ouvert', ['2026-09-15', '2026-09-22'],
  datesDesSeances(2, '2026-09-14', 'hebdo', [0]));
dit('les jours qui se suivent sautent la fermeture', ['2026-09-12', '2026-09-15', '2026-09-16'],
  datesDesSeances(3, '2026-09-12', 'quotidien', [6, 0]));
dit('une semaine toute fermée ne bloque rien', ['2026-09-14', '2026-09-15'],
  datesDesSeances(2, '2026-09-14', 'quotidien', [0, 1, 2, 3, 4, 5, 6]));
dit('l’année se franchit sans y penser', ['2026-12-28', '2027-01-04'], datesDesSeances(2, '2026-12-28', 'hebdo'));
dit('sans premier jour, des dates vides', ['', ''], datesDesSeances(2, '', 'hebdo'));
dit('aucune séance, aucune date', [], datesDesSeances(0, '2026-09-14', 'hebdo'));

/* ── ⑦ AJOUTER DES SÉANCES AU BESOIN — 13 septembre 2026 ────────────── */
const basePlan = [{ sessionNumber: 1, moduleIndex: 0 }, { sessionNumber: 2, moduleIndex: 1 }];
const avecAjout = lignesDuPlan(basePlan, [{ cle: 'x', moduleIndex: 0 }], true);
dit('une séance ajoutée se range dans son module, et tout se renumérote',
  [[1, 0, false], [2, 0, true], [3, 1, false]], avecAjout.map((l) => [l.sessionNumber, l.moduleIndex, l.ajoutee]));
dit('chaque ligne garde sa clé quand les numéros bougent', ['p1', 'x', 'p2'], avecAjout.map((l) => l.cle));
dit('une séance sans module va en fin de liste', [3],
  lignesDuPlan(basePlan, [{ cle: 'y' }], true).filter((l) => l.ajoutee).map((l) => l.sessionNumber));
dit('un dossier qui a déjà des séances ne renumérote rien', [[5, 1, false], [6, 0, true]],
  lignesDuPlan([{ sessionNumber: 5, moduleIndex: 1 }], [{ cle: 'z', moduleIndex: 0 }], false, 4).map((l) => [l.sessionNumber, l.moduleIndex, l.ajoutee]));
dit('sans séance du programme, les ajouts suivent la dernière faite', [7, 8],
  lignesDuPlan([], [{ cle: 'a' }, { cle: 'b' }], false, 6).map((l) => l.sessionNumber));


/* ── ⑦ CE QUE LE CERTIFICAT DIT (16 septembre) ───────────────────────────
   Le certificat imprime la formation VIVANTE de l'Académie : sa durée en
   lettres et ses modules en une phrase, pas la semence. */
dit('la durée se dit en lettres, semaines et séances', 'quatre semaines · seize séances', dureeDite(4, 16));
dit('douze semaines se disent trois mois', 'trois mois · douze séances', dureeDite(12, 12));
dit('huit semaines se disent deux mois', 'deux mois · huit séances', dureeDite(8, 8));
dit('six semaines restent des semaines', 'six semaines · dix séances', dureeDite(6, 10));
dit('une semaine, une séance : au féminin, au singulier', 'une semaine · une séance', dureeDite(1, 1));
dit('vingt et une séances, au féminin', 'trois semaines · vingt et une séances', dureeDite(3, 21));
dit('les modules se lisent en une phrase, le point médian tombé, l’initiale baissée',
  'la naissance VÈKPÈ™, la restauration FÍNFÍN™, la couleur végétale YÈKPÈ™, ainsi que le défaisage GBÀTÀ™',
  competencesDesModules(['La naissance · VÈKPÈ™', 'La restauration · FÍNFÍN™', 'La couleur végétale · YÈKPÈ™', 'Le défaisage · GBÀTÀ™']));
dit('un module qui commence par son nom fon garde ses majuscules', 'SÍNSIN™ le resserrage, ainsi que la pose', competencesDesModules(['SÍNSIN™ · le resserrage', 'La pose']));
dit('un seul module se dit seul', 'la tenue', competencesDesModules(['La tenue']));
dit('sans module, rien : le certificat retombe sur la semence', '', competencesDesModules(['', '   ']));
dit('la semence de l’Œuvre garde ses quatre modules', 4, parcoursParId('oeuvre')?.programme.length);


/* ── ⑧ LA PHRASE DU CERTIFICAT, VERSION CORRIGÉE (16 septembre) ─────────
   Chaque élément prend son article, « ainsi que » devant le dernier, les
   noms communs en minuscule, les noms fon en capitales. */
const MODULES_DE_L_OEUVRE = [
  'La racine et le cuir chevelu', 'La naissance · VÈKPÈ™',
  'Le resserrage SÍNSIN™ Essentiel et Élaboré', 'La reprise frontale',
  'La restauration · FÍNFÍN™', 'Les Soins et la couleur végétale · YÈKPÈ™', 'Le défaisage · GBÀTÀ™',
];
dit('chaque élément prend son article, « ainsi que » devant le dernier, « Soins » en minuscule',
  'de la racine et du cuir chevelu, de la naissance VÈKPÈ™, du resserrage SÍNSIN™ Essentiel et Élaboré, de la reprise frontale, de la restauration FÍNFÍN™, des soins et de la couleur végétale YÈKPÈ™, ainsi que du défaisage GBÀTÀ™',
  maitriseDe(competencesDesModules(MODULES_DE_L_OEUVRE)));
dit('la semence aussi prend ses articles', 'de la création VÈKPÈ™, de la restauration des locks en souffrance, de la couleur végétale YÈKPÈ™, ainsi que du défaisage GBÀTÀ™',
  maitriseDe('la création VÈKPÈ™, la restauration des locks en souffrance, la couleur végétale YÈKPÈ™, ainsi que le défaisage GBÀTÀ™'));
dit('une liste qui porte déjà ses « de » ne bouge pas', 'de la pose, ainsi que du resserrage', maitriseDe('de la pose, ainsi que du resserrage'));
dit('l’élision', 'de l’hygiène du cuir chevelu', maitriseDe('l’hygiène du cuir chevelu'));
dit('un nom fon sans article prend « du »', 'du SÍNSIN™, ainsi que du SÍNSIN™ Élaboré', maitriseDe('SÍNSIN™, ainsi que SÍNSIN™ Élaboré'));
dit('deux adjectifs liés par « et » restent ensemble', 'du resserrage SÍNSIN™ Essentiel et Élaboré', maitriseDe('le resserrage SÍNSIN™ Essentiel et Élaboré'));
dit('deux noms liés par « et » prennent chacun leur article', 'de la racine et du cuir chevelu', maitriseDe('la racine et le cuir chevelu'));
const phrase = texteDuCertificat({
  apprenant: 'Afi Dossou', titre: 'L’Œuvre', niveau: 'Palier III · L’Œuvre',
  duree: dureeDite(4, 16), competences: competencesDesModules(MODULES_DE_L_OEUVRE),
});
dit('la phrase du certificat, telle que corrigée',
  'Afi Dossou a accompli le Palier III · L’Œuvre (quatre semaines, seize séances, à l’atelier MND de Cotonou) et a démontré devant le Maître Locticien sa maîtrise de la racine et du cuir chevelu, de la naissance VÈKPÈ™, du resserrage SÍNSIN™ Essentiel et Élaboré, de la reprise frontale, de la restauration FÍNFÍN™, des soins et de la couleur végétale YÈKPÈ™, ainsi que du défaisage GBÀTÀ™, selon la méthode des quatre temps (Purifier · Nourrir · Sceller · Couronner) et les exigences de la Maison.',
  phrase.avant + phrase.gras + phrase.apres);
dit('« Maître Locticien » est ce qui se met en gras', 'Maître Locticien', phrase.gras);
dit('un niveau sans le titre nomme le parcours avant', true,
  texteDuCertificat({ apprenant: 'A', titre: 'La Tenue', niveau: 'Palier I', duree: 'une semaine · une séance', competences: 'la tenue' }).avant.startsWith('A a accompli le parcours La Tenue, Palier I (une semaine, une séance, '));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
