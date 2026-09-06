/* ══ LES PARCOURS DE L'ACADÉMIE — 6 septembre 2026 ═══════════════════

   « Pourrions-nous retrouver toutes les formations de l'Académie ? Et les
   remettre dans le logiciel ? » (Yéman).

   ELLES N'ÉTAIENT PAS PERDUES, ELLES ÉTAIENT AILLEURS. Les neuf parcours
   vivaient en dur dans l'app `certificat`, et le magasin de l'Académie n'avait
   jamais été rempli : sa graine est vide par doctrine, « Maison neuve, coquille
   vierge, tout naît de l'usage ».

   DEUX VÉRITÉS POUR UNE NOTION, donc, et le défaut qu'on a corrigé trois fois
   cette semaine. Un certificat délivré depuis l'Académie aurait nommé un
   parcours absent de la liste du certificat, et l'inverse aussi.

   LA LISTE VIT ICI, ET ELLE EST LA RÉFÉRENCE. Le certificat la lit ; l'Académie
   s'en sert pour poser ses formations, une fois, à la demande.

   ELLE NE PORTE AUCUN PRIX. Les montants n'ont jamais été écrits nulle part :
   les inventer serait poser un tarif que personne n'a décidé, et il finirait
   par être annoncé à une apprenante. La Maison les pose à la création. */

export type ParcoursMND = {
  id: string;
  titre: string;
  /** « Palier II · L'Affirmation » — la place dans le référentiel. */
  niveau: string;
  /** La durée telle qu'elle s'écrit sur un certificat, en toutes lettres :
      un papier de cérémonie n'écrit pas « 8 sem. ». */
  duree: string;
  /** Les mêmes, en nombres, pour l'Académie qui compte des séances. */
  semaines: number;
  seances: number;
  competences: string;
};

/** LES NEUF PARCOURS, alignés sur la logique de palier du référentiel :
    L'Initiation · L'Affirmation · L'Œuvre. */
export const PARCOURS_MND: ParcoursMND[] = [
  {
    id: 'fondation', titre: 'Fondation', niveau: 'Palier I · L’Initiation',
    duree: 'quatre semaines · six séances', semaines: 4, seances: 6,
    competences: 'les gestes fondateurs de la Maison — purifier, nourrir, sceller et couronner la mèche',
  },
  {
    id: 'affirmation', titre: 'Affirmation', niveau: 'Palier II · L’Affirmation',
    duree: 'huit semaines · dix séances', semaines: 8, seances: 10,
    competences: 'la reprise de racines, le resserrage de précision et la conduite d’un rituel de soin complet',
  },
  {
    id: 'oeuvre', titre: 'L’Œuvre', niveau: 'Palier III · L’Œuvre',
    duree: 'trois mois · douze séances', semaines: 12, seances: 12,
    competences: 'la maîtrise d’œuvre du soin des locks, la conduite d’atelier et la transmission de la méthode',
  },
  {
    id: 'initiation', titre: 'Initiation au soin des locks', niveau: 'Parcours I · L’Initiation',
    duree: 'trois jours · douze heures · quatre séances', semaines: 1, seances: 4,
    competences: 'les gestes fondateurs du soin des locks — lavage doux, hydratation et protection de la fibre',
  },
  {
    id: 'praticien', titre: 'Praticien MND', niveau: 'Parcours II · L’Affirmation',
    duree: 'une semaine · trente heures · cinq séances', semaines: 1, seances: 5,
    competences: 'la maîtrise du diagnostic, de la création, de la reprise de racines et du rituel de soin complet',
  },
  {
    id: 'maitre', titre: 'Maître MND', niveau: 'Parcours III · L’Œuvre',
    duree: 'trois mois · quatre-vingt-dix heures · douze séances', semaines: 12, seances: 12,
    competences: 'la maîtrise d’œuvre du soin des locks, la conduite d’atelier et la transmission de la méthode',
  },
  {
    id: 'resserrage', titre: 'Resserrage & soin des racines', niveau: 'Parcours technique',
    duree: 'deux semaines · vingt heures · six séances', semaines: 2, seances: 6,
    competences: 'le resserrage de précision, la santé du cuir chevelu et la protection de la longueur acquise',
  },
  {
    id: 'laboratoire', titre: 'Le Laboratoire · formulation capillaire', niveau: 'Parcours spécial',
    duree: 'une semaine · vingt-quatre heures · quatre séances', semaines: 1, seances: 4,
    competences: 'la formulation des soins de la gamme — origines des ingrédients, protocoles et substitutions',
  },
  {
    id: 'referentiel', titre: 'Certification Référentiel MND', niveau: 'Certifiant · Pro',
    duree: 'dix séances · sur dossier', semaines: 10, seances: 10,
    competences: 'le référentiel complet de la Maison, appliqué et démontré devant le jury de l’Académie',
  },
];

export const parcoursParId = (id: string): ParcoursMND | undefined =>
  PARCOURS_MND.find((p) => p.id === id);

const aPlat = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').toLowerCase().trim();

/** CE QU'IL RESTE À POSER. Les formations déjà créées ne se doublent pas :
    reposer les neuf sur une Académie qui en porte trois en ferait douze, dont
    trois jumelles, et il faudrait les démêler à la main.

    LA COMPARAISON SE FAIT SUR LE NOM APLATI — sans accent ni apostrophe : la
    Maison a pu écrire « L'Oeuvre » là où la référence dit « L'Œuvre », et deux
    graphies d'un même parcours restent un seul parcours. */
export function parcoursAPoser(
  dejaLa: readonly { name: string }[],
): ParcoursMND[] {
  const vus = new Set(dejaLa.map((f) => aPlat(f.name)));
  return PARCOURS_MND.filter((p) => !vus.has(aPlat(p.titre)));
}
