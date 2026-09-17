/* PLUSIEURS GESTES DANS UNE MÊME VENUE, ÉPROUVÉ — `node scripts/verifie-plusieurs-gestes.mjs`.

   « J'aimerais avoir la possibilité de réserver plusieurs services à la fois.
   Aussi quand je réserve un entretien je veux les lavage et la reprise de
   racines » (Yéman, 18 septembre 2026).

   DEUX CHOSES SE JUGENT ICI. D'abord l'ORDRE des familles : il suivait leur
   TAILLE, si bien que les huit soins et les huit couleurs passaient devant
   les quatre lavages et les quatre reprises. Ensuite le PLAFOND : six gestes,
   parce que `demande-submit` en retire le septième sans un mot.

   ON RECONNAÎT PAR LE NOM, jamais par l'identifiant : la leçon du 17
   septembre, où le site cherchait une catégorie que la Maison avait renommée
   et rendait une page vide. Une famille renommée perd sa priorité, jamais sa
   place. */
import { groupesDePrestations, PLAFOND_GESTES, type AgendaDeLaMaison, type PrestationPublique } from '../src/apps/revelateur/agenda';
import { dureeDesPrestations } from '../src/shared/agenda-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* La porte Entretien telle qu'elle est en base : quatre familles, et les
   deux que la visiteuse vient chercher sont les DEUX PLUS PETITES. */
const CATEGORIES = [
  { id: 'c-soin', label: 'Hydrater, purifier, reconstruire' },
  { id: 'c-coul', label: 'Coloration' },
  { id: 'c-lav', label: 'Les lavages rituels' },
  { id: 'c-rac', label: 'Les reprises de racines' },
];

const agendaAvec = (categories: { id: string; label: string }[]): AgendaDeLaMaison =>
  ({ categories } as unknown as AgendaDeLaMaison);

const gestes = (categoryId: string, combien: number, duree = 60): PrestationPublique[] =>
  Array.from({ length: combien }, (_, i) => ({
    id: `${categoryId}-${i}`, name: `${categoryId} ${i}`, categoryId, durationMin: duree,
  }));

/* L'ordre de déclaration met exprès les grosses familles en tête : c'est
   ainsi que la base les rend, et c'est ce qui trompait l'écran. */
const PRESTATIONS = [
  ...gestes('c-soin', 8),
  ...gestes('c-coul', 8),
  ...gestes('c-lav', 4),
  ...gestes('c-rac', 4),
];

const titres = (besoin: 'entretien' | 'inconnu', cats = CATEGORIES) =>
  groupesDePrestations(agendaAvec(cats), PRESTATIONS, besoin).map((g) => g.titre);

/* ── L'ordre suit l'intention ───────────────────────────────────── */
dit('① la porte Entretien ouvre le lavage et la reprise, malgré leur taille',
  ['Les lavages rituels', 'Les reprises de racines', 'Hydrater, purifier, reconstruire', 'Coloration'],
  titres('entretien'));

dit('② sans porte connue, la plus fournie reste en tête, comme avant',
  ['Hydrater, purifier, reconstruire', 'Coloration', 'Les lavages rituels', 'Les reprises de racines'],
  titres('inconnu'));

dit('③ seules les familles de la porte sont marquées',
  [true, true, false, false],
  groupesDePrestations(agendaAvec(CATEGORIES), PRESTATIONS, 'entretien').map((g) => g.deLaPorte));

dit('④ aucune famille n’est marquée quand la porte n’en désigne pas',
  [false, false, false, false],
  groupesDePrestations(agendaAvec(CATEGORIES), PRESTATIONS, 'inconnu').map((g) => g.deLaPorte));

/* ── La Maison renomme, le site tient ───────────────────────────── */
const RENOMMEES = [
  { id: 'c-soin', label: 'Hydrater, purifier, reconstruire' },
  { id: 'c-coul', label: 'Coloration' },
  { id: 'c-lav', label: 'Les shampoings de la Maison' },
  { id: 'c-rac', label: 'Les reprises de racines' },
];
dit('⑤ un lavage rebaptisé shampoing garde sa priorité',
  'Les shampoings de la Maison', titres('entretien', RENOMMEES)[0]);

const MUETTES = [
  { id: 'c-soin', label: 'Hydrater, purifier, reconstruire' },
  { id: 'c-coul', label: 'Coloration' },
  { id: 'c-lav', label: 'Le bain de la couronne' },
  { id: 'c-rac', label: 'Les reprises de racines' },
];
dit('⑥ une famille méconnaissable perd sa priorité, jamais sa place',
  4, titres('entretien', MUETTES).length);
dit('⑦ et elle reste bien présente dans la liste',
  true, titres('entretien', MUETTES).includes('Le bain de la couronne'));

/* ── Une catégorie sans nom ne fait pas tomber l'écran ──────────── */
dit('⑧ une catégorie absente du référentiel se dit quand même',
  true, groupesDePrestations(agendaAvec([]), PRESTATIONS, 'entretien')
    .every((g) => g.titre === 'Les autres gestes'));

/* ── Le plafond, et la durée cumulée ────────────────────────────── */
dit('⑨ le plafond vaut six, comme le slice du serveur', 6, PLAFOND_GESTES);

dit('⑩ deux gestes cochés font la somme de leurs durées',
  90, dureeDesPrestations(['a', 'b'], [{ id: 'a', durationMin: 30 }, { id: 'b', durationMin: 60 }]));

dit('⑪ six gestes d’une heure font six heures, et le serveur le verra pareil',
  360, dureeDesPrestations(
    ['a', 'b', 'c', 'd', 'e', 'f'],
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, durationMin: 60 })),
  ));

dit('⑫ un seul geste court garde le plancher d’une heure du serveur',
  60, dureeDesPrestations(['a'], [{ id: 'a', durationMin: 30 }]));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
