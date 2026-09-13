/* LES PARCOURS DE L'ACADÉMIE, ÉPROUVÉS — `node scripts/verifie-parcours.mjs`.

   Poser deux fois les neuf parcours en ferait dix-huit, dont neuf jumeaux, et
   il faudrait les démêler un par un dans une liste qui porte déjà des
   inscriptions. */
import {
  PARCOURS_MND, parcoursParId, parcoursAPoser, completeLaFiche,
} from '../src/shared/parcours';

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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
