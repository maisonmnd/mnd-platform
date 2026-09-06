/* ══ LE RÈGLEMENT INTÉRIEUR — 6 septembre 2026 ═══════════════════════

   « Crée également le règlement intérieur » (Yéman).

   IL DIT LES RÈGLES ; LA FICHE DE POSTE DIT LE MÉTIER. Les mêler ferait un
   document que personne ne lit, qui ne sert ni à recruter ni à sanctionner.

   QUATRE SUJETS TRANCHÉS À LA DEMANDE DE LA MAISON, et ce sont les quatre qui
   font les disputes d'un salon :
   · LE PARTAGE DES POURBOIRES, qui n'était qu'une coutume ;
   · LA CLIENTÈLE PERSONNELLE au fauteuil de la Maison ;
   · LE TÉLÉPHONE ET LES RÉSEAUX ;
   · LA CAISSE ET LES VALEURS, celui qu'on regrette le plus de n'avoir pas
     écrit.

   ET UNE ÉCHELLE DE SANCTIONS À QUATRE DEGRÉS (arbitrage). Écrite, elle
   protège les deux côtés : la Maison ne peut plus être accusée d'arbitraire, et
   la personne sait ce qu'elle risque AVANT, pas après. C'est aussi ce qu'un
   conseil de prud'hommes demande en premier.

   CE N'EST PAS UN AVIS JURIDIQUE. Le Code du travail béninois encadre le
   règlement intérieur — son contenu, son affichage, son dépôt. À relire par
   quelqu'un qui le connaît avant de l'afficher. */

import { entreLesParties, enFrancais, numerote, piedDuContrat, type Contrat } from './contrats';

export const VERSION_REGLEMENT = 'v1 · 6 septembre 2026';

/** L'échelle, du plus léger au plus grave. Elle se lit dans cet ordre et ne se
    saute pas, sauf faute grave — ce que le texte dit. */
export const DEGRES_DE_SANCTION = [
  'le rappel oral, dit en tête-à-tête et noté au dossier',
  'l’avertissement écrit, remis en main propre contre décharge',
  'la mise à pied disciplinaire, d’un à trois jours',
  'le licenciement, dans les formes prévues par la loi',
];

export type ReglementInterieur = {
  /** La personne à qui il est remis. */
  nom: string;
  /** Sa fonction, telle qu'elle figure sur sa fiche. */
  fonction?: string;
  jourIso: string;
};

export function texteReglementInterieur(o: ReglementInterieur & {
  maison: string; raison?: string; ville?: string; version?: string;
}): Contrat {
  return {
    titre: 'Règlement intérieur',
    sousTitre: o.fonction,
    entete: [
      ...entreLesParties({
        maison: o.maison, raison: o.raison, ville: o.ville,
        autre: o.nom, qualiteAutre: 'le ou la membre de l’équipe',
      }),
      'Le présent règlement s’applique à toute personne travaillant dans les lieux de la '
      + 'Maison, quel que soit son contrat. Il est affiché au salon et remis à chacun.',
    ],
    articles: numerote([
      {
        titre: 'Les heures',
        lignes: [
          'Chacun est à son poste à l’heure d’ouverture affichée, prêt à recevoir, et non en '
          + 'train de se préparer.',
          'Un retard ou une absence se prévient dès qu’on le sait, et non le matin même : une '
          + 'tête déplacée pour rien ne revient pas toujours.',
          'Une absence pour maladie se justifie dans les quarante-huit heures.',
          'Les heures de départ suivent les têtes en cours : on ne laisse pas un rituel commencé.',
        ],
      },
      {
        titre: 'L’hygiène et la sécurité',
        lignes: [
          'Le matériel se désinfecte entre deux têtes, sans exception et sans raccourci.',
          'Le poste se laisse net pour celui qui suit.',
          'Tout incident sur une tête, même léger, se signale immédiatement et se note.',
          'Les produits se rangent fermés, étiquetés, hors de portée des enfants.',
          'Il est interdit de travailler sous l’effet de l’alcool ou d’un produit qui altère le '
          + 'geste. Les mains de la Maison touchent des cuirs chevelus.',
        ],
      },
      {
        titre: 'La tenue et la tenue de soi',
        lignes: [
          'Tenue propre, sobre, chaussures fermées. La blouse de la Maison, quand elle est '
          + 'remise, se porte et s’entretient.',
          'Ongles courts et nets, pas de bagues ni de bracelets qui accrochent une lock.',
          'Pas de parfum lourd : un cuir chevelu qui vient d’être travaillé est sensible.',
          'Ses propres cheveux sont soignés. C’est la première chose qu’une tête regarde chez '
          + 'qui va la coiffer.',
        ],
      },
      {
        /* LE SUJET QUI FAIT LES PLUS GROSSES DISPUTES D'UN SALON. Il était une
           coutume ; écrit, il cesse d'être contestable. */
        titre: 'Les pourboires',
        lignes: [
          'Les pourboires appartiennent à l’équipe et se partagent entre TOUS, y compris ceux '
          + 'qui n’ont pas touché la tête ce jour-là : l’accueil, l’assistance et l’entretien '
          + 'font partie de ce qu’une cliente a aimé.',
          'Le partage se fait par parts. Une part par personne, sauf part différente décidée par '
          + 'la Maison et connue de tous.',
          'Un pourboire ne se garde pas dans sa poche, ne se demande pas, et ne se laisse pas '
          + 'entendre. Une cliente qui se sent obligée ne revient pas.',
          'Le pourboire remis par un moyen de paiement suit la même règle que celui remis en '
          + 'main propre.',
        ],
      },
      {
        titre: 'La caisse et les valeurs',
        lignes: [
          'Seules les personnes désignées encaissent et ouvrent le tiroir. Nul ne le fait à la '
          + 'place d’une autre, même pour rendre service.',
          'Toute somme reçue entre en caisse immédiatement, et un reçu est remis à la cliente. '
          + 'Aucun encaissement ne se fait de la main à la main.',
          'La caisse se compte à l’ouverture et à la fermeture, par la personne qui la tient.',
          'Un écart, dans un sens comme dans l’autre, se déclare le jour même. Un écart déclaré '
          + 'est une erreur ; un écart découvert est une faute.',
          'Les avances, les prêts et les prélèvements sur caisse n’existent pas sans écrit de la '
          + 'gérance.',
          'Les effets personnels des clientes ne se touchent pas. Ce qui est oublié se dépose à '
          + 'l’accueil et se note.',
        ],
      },
      {
        titre: 'La clientèle de la Maison',
        lignes: [
          'Les têtes reçues au salon sont la clientèle de la Maison. On ne les démarche pas pour '
          + 'son compte, ni pour celui d’un tiers.',
          'On ne coiffe personne à son compte dans les lieux de la Maison, ni avec son matériel, '
          + 'ni sur ses heures, même gratuitement, même un proche : ce qui se fait sur ce '
          + 'fauteuil passe par le carnet.',
          'Une prestation rendue à un proche se pose au carnet comme les autres, avec le geste '
          + 'que la Maison décide.',
          'Les coordonnées des clientes ne sortent pas du logiciel et ne servent à rien d’autre '
          + 'qu’au travail de la Maison.',
        ],
      },
      {
        titre: 'Le téléphone et les réseaux',
        lignes: [
          'Le téléphone personnel reste hors du fauteuil. Il se consulte en pause, hors de la '
          + 'vue des clientes.',
          'On ne photographie ni ne filme une tête sans son accord, et la Maison seule publie.',
          'Aucune photographie prise au salon ne se publie sur un compte personnel sans accord '
          + 'écrit de la Maison, et sans que la personne photographiée y ait consenti.',
          'Ce qu’on dit publiquement de la Maison, de ses clientes ou de ses équipes engage la '
          + 'Maison. Un différend se règle à l’intérieur, jamais en ligne.',
        ],
      },
      {
        titre: 'La discrétion',
        lignes: [
          'Ce qu’on apprend d’une cliente au salon ne sort pas du salon : son état capillaire, '
          + 'ce qu’elle paie, ce qu’elle confie.',
          'Il en va de même des prix d’achat, des marges, des fournisseurs et des méthodes de la '
          + 'Maison.',
          'Cet engagement n’a pas de terme et survit au départ.',
        ],
      },
      {
        titre: 'Le respect entre nous',
        lignes: [
          'Aucune violence, aucune insulte, aucune moquerie, ni entre nous ni envers une cliente.',
          'Le harcèlement, moral comme sexuel, est interdit et ne se règle pas à l’amiable : il '
          + 'se signale à la direction, qui doit agir.',
          'Une personne qui signale un fait de bonne foi ne peut en être inquiétée.',
          'Les désaccords de travail se disent en tête-à-tête ou en réunion, jamais devant une '
          + 'cliente.',
        ],
      },
      {
        /* L'ÉCHELLE (arbitrage). Elle protège les deux côtés : plus d'arbitraire
           possible d'un côté, plus de surprise de l'autre. */
        titre: 'Les sanctions',
        lignes: [
          'Un manquement au présent règlement expose, selon sa gravité et sa répétition, à :',
          ...DEGRES_DE_SANCTION.map((d, i) => `· ${i + 1}. ${d} ;`),
          'Les degrés se suivent dans cet ordre. La Maison peut en sauter un en cas de faute '
          + 'grave, notamment vol, violence, harcèlement, mise en danger d’une tête, ou travail '
          + 'sous l’effet de l’alcool.',
          'Aucune sanction n’est prise sans que la personne ait été entendue et ait pu s’expliquer.',
          'Toute sanction est écrite, motivée, et versée au dossier. Une sanction non écrite '
          + 'n’existe pas.',
        ],
      },
      {
        titre: 'Ce que la Maison doit en retour',
        lignes: [
          'Des heures connues à l’avance et un planning tenu.',
          'Le matériel, les produits et la tenue nécessaires au travail demandé.',
          'Une rémunération versée à la date dite, et un bulletin qui l’explique.',
          'Une formation continue aux gestes de la Maison.',
          'Un lieu sûr, et une direction qui écoute avant de trancher.',
        ],
      },
      {
        titre: 'Entrée en vigueur',
        lignes: [
          'Le présent règlement est affiché au salon et remis à chacun contre décharge.',
          'Il peut être modifié : toute version nouvelle est remise et affichée avant de '
          + 's’appliquer.',
          'Il est régi par le droit béninois. En cas de difficulté, les parties chercheront '
          + 'd’abord une solution amiable.',
          `Remis le ${enFrancais(o.jourIso)}.`,
        ],
      },
    ]),
    pied: piedDuContrat({
      maison: o.maison, ville: o.ville, version: o.version ?? VERSION_REGLEMENT,
    }),
  };
}
