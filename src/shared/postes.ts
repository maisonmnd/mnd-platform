/* ══ LES FICHES DE POSTE — 6 septembre 2026 ══════════════════════════

   « Crée les fiches de poste associées aux postes requis pour bien travailler
   à MND » (Yéman).

   UNE FICHE DE POSTE DIT CE QU'ON ATTEND, PAS CE QU'ON INTERDIT. Le règlement
   intérieur dit les règles ; la fiche dit le métier. Les mêler ferait un
   document que personne ne lit et qui ne sert ni à recruter, ni à évaluer, ni
   à défendre une sanction.

   CINQ RUBRIQUES, TOUJOURS LES MÊMES, et c'est ce qui les rend comparables :
   · LA MISSION en une phrase, celle qu'on répète à l'embauche ;
   · CE QU'ELLE FAIT au quotidien ;
   · CE QUI SE MESURE, parce qu'un poste sans mesure ne se discute qu'à
     l'humeur, et c'est là que les injustices commencent ;
   · CE QU'ELLE NE FAIT PAS, la rubrique la plus utile : les conflits d'atelier
     naissent presque toujours d'une frontière que personne n'avait tracée ;
   · À QUI ELLE REND COMPTE.

   AUCUN SALAIRE N'EST ÉCRIT. Les montants n'existent nulle part dans le
   logiciel, et en poser un serait annoncer une rémunération que personne n'a
   décidée. Ils vivent sur la fiche de la personne, pas sur celle du poste.

   LES POSTES SUIVENT `FONCTIONS_DEFAUT` (equipe/data.ts) : une fiche pour un
   poste que la Maison ne connaît pas ne servirait à rien, et un poste sans
   fiche se verrait tout de suite. */

export type FicheDePoste = {
  /** Le nom du poste, tel qu'il s'écrit sur une fiche de personnel. */
  poste: string;
  /** Les autres écritures du même poste — le féminin, le masculin. Un poste
      n'a qu'une fiche, quelle que soit la personne qui l'occupe. */
  aussi?: string[];
  /** Touche-t-elle une tête ? C'est ce qui commissionne, et ce qui impose les
      protocoles d'hygiène. */
  auFauteuil?: boolean;
  mission: string;
  fait: string[];
  mesure: string[];
  neFaitPas: string[];
  rendCompteA: string;
};

export const FICHES_DE_POSTE: FicheDePoste[] = [
  {
    poste: 'Maître fondateur', auFauteuil: true,
    mission: 'Porter la méthode de la Maison, la transmettre, et répondre de ce qui sort de l’atelier.',
    fait: [
      'Exécute les rituels les plus exigeants et les têtes difficiles.',
      'Tranche les cas où le protocole ne suffit pas : cuir chevelu abîmé, reprise ratée ailleurs, refus de service.',
      'Forme les praticiens au fauteuil et valide leur passage en autonomie.',
      'Arbitre les gestes de la Maison : ce qui entre au catalogue, ce qui en sort.',
    ],
    mesure: [
      'La tenue des têtes qu’il suit, dans la durée.',
      'Le nombre de praticiens qu’il a rendus autonomes.',
      'Les reprises et les réclamations sur les rituels qu’il a conduits.',
    ],
    neFaitPas: [
      'La caisse au quotidien, ni les commandes de la Gamme.',
      'Le planning des autres, qui appartient à la gérance.',
    ],
    rendCompteA: 'à la direction de la Maison.',
  },
  {
    poste: 'Maître', aussi: ['Maîtresse'], auFauteuil: true,
    mission: 'Conduire un rituel complet de bout en bout et répondre de la tête qu’on lui confie.',
    fait: [
      'Reçoit la tête, constate son état, annonce ce qui sera fait et ce que cela coûte.',
      'Conduit le rituel selon les quatre temps : purifier, nourrir, sceller, couronner.',
      'Renseigne la fiche : longueur travaillée, comptage, mèche témoin, ce qu’il a observé.',
      'Remet le bilan de séance et pose la prochaine venue.',
    ],
    mesure: [
      'Le comptage et la longueur renseignés sur les têtes qu’il a servies.',
      'La cadence tenue de ses têtes : reviennent-elles quand elles doivent.',
      'La satisfaction et les retours des clientes.',
    ],
    neFaitPas: [
      'Il ne remise pas de sa propre autorité : une remise se décide, elle ne s’accorde pas au fauteuil.',
      'Il ne modifie pas le catalogue ni les prix.',
    ],
    rendCompteA: 'au maître fondateur, et à la gérance pour le planning.',
  },
  {
    poste: 'Praticien', aussi: ['Praticienne'], auFauteuil: true,
    mission: 'Exécuter les gestes de la Maison sous la conduite d’un maître, et devenir autonome.',
    fait: [
      'Lave, hydrate, resserre et coiffe selon le protocole, sans l’adapter de son côté.',
      'Prépare le poste, le matériel et la tête avant l’arrivée du maître.',
      'Appelle un maître dès qu’une tête sort du cas ordinaire, plutôt que d’essayer.',
      'Renseigne ce qu’il a fait sur la fiche, geste par geste.',
    ],
    mesure: [
      'La régularité du geste, constatée par le maître qui le suit.',
      'Les fiches renseignées après ses rituels.',
      'Le passage des étapes d’autonomie du référentiel.',
    ],
    neFaitPas: [
      'Il ne conduit pas seul un rituel qu’il n’a pas encore validé.',
      'Il n’annonce pas un prix ni une durée : cela appartient au maître ou à l’accueil.',
    ],
    rendCompteA: 'au maître qui le suit.',
  },
  {
    poste: 'Formateur', aussi: ['Formatrice'],
    mission: 'Conduire un parcours de l’Académie, du premier module au jury.',
    fait: [
      'Anime les séances selon le programme du parcours, et tient la fiche de chacune.',
      'Fait pratiquer sur tête, corrige le geste, consigne ce qui progresse et ce qui bloque.',
      'Évalue les modules et prépare le passage devant le jury.',
      'Prévient la Maison dès qu’une apprenante décroche : l’assiduité se rattrape tôt, jamais tard.',
    ],
    mesure: [
      'Les fiches de séance validées, et à l’heure.',
      'Le taux d’apprenantes présentées au jury, et certifiées.',
      'Ce que les apprenantes disent de leur parcours.',
    ],
    neFaitPas: [
      'Il ne certifie pas seul : la certification appartient au jury.',
      'Il n’encaisse pas les règlements de formation.',
    ],
    rendCompteA: 'au maître fondateur, pour l’Académie.',
  },
  {
    poste: 'Accueil',
    mission: 'Être le premier et le dernier visage de la Maison, et tenir le carnet.',
    fait: [
      'Reçoit, installe, propose à boire, prévient d’une attente avant qu’on la subisse.',
      'Prend les rendez-vous, les déplace, rappelle celles qui n’ont pas confirmé.',
      'Encaisse, remet le reçu, et tient la caisse du jour.',
      'Renseigne ce qui manque sur une fiche pendant que la tête est là : e-mail, téléphone, anniversaire.',
    ],
    mesure: [
      'Les créneaux perdus, et les têtes qui ne sont pas venues sans prévenir.',
      'Les fiches complétées.',
      'Le compte de caisse, qui doit tomber juste chaque soir.',
    ],
    neFaitPas: [
      'Il ne pose pas de diagnostic ni ne promet un résultat : cela appartient au fauteuil.',
      'Il n’accorde pas de remise de sa propre autorité.',
    ],
    rendCompteA: 'à la gérance.',
  },
  {
    poste: 'Gérant·e',
    mission: 'Faire que la Maison tourne : les heures, l’argent, le matériel et les gens.',
    fait: [
      'Tient le planning et l’ouverture, et couvre les absences.',
      'Suit la caisse, les dépenses, les impayés et les créances.',
      'Commande la Gamme et le consommable, et surveille l’étagère.',
      'Conduit les entretiens, applique le règlement, et prépare la paie.',
    ],
    mesure: [
      'Le taux d’occupation des fauteuils.',
      'Les impayés et les écarts de caisse.',
      'Les ruptures de stock.',
    ],
    neFaitPas: [
      'Elle ne tranche pas un geste technique : cela appartient au maître fondateur.',
      'Elle ne modifie pas seule les prix de la Maison.',
    ],
    rendCompteA: 'à la direction.',
  },
  {
    poste: 'Assistant·e',
    mission: 'Rendre au fauteuil le temps qu’il perd ailleurs.',
    fait: [
      'Prépare les postes, le linge, les mélanges et le matériel avant chaque tête.',
      'Nettoie et désinfecte entre deux rituels.',
      'Assiste le maître pendant le geste : rinçage, sections, passage du matériel.',
      'Range la réserve et signale ce qui manque avant que cela manque.',
    ],
    mesure: [
      'Le poste prêt à l’heure, avant l’arrivée de la tête.',
      'La propreté constatée entre deux rituels.',
      'Les alertes de stock passées à temps.',
    ],
    neFaitPas: [
      'Il ne touche pas une tête sans qu’un maître le lui demande.',
      'Il n’encaisse pas.',
    ],
    rendCompteA: 'au maître de service, et à la gérance.',
  },
  {
    poste: 'Agent d’entretien',
    mission: 'Tenir la Maison dans l’état où une cliente aime entrer.',
    fait: [
      'Nettoie les sols, les sanitaires, les bacs et les vitres, selon le tour de la journée.',
      'Sort les déchets et sépare ce qui doit l’être.',
      'Signale ce qui casse, fuit ou s’use, le jour même.',
      'Réapprovisionne le consommable des sanitaires et des bacs.',
    ],
    mesure: [
      'Le tour de nettoyage fait et signé.',
      'Les sanitaires, à toute heure de la journée.',
      'Les signalements passés avant qu’une cliente ne le voie.',
    ],
    neFaitPas: [
      'Il ne déplace ni ne jette le matériel de soin sans l’accord d’un maître.',
      'Il n’entre pas dans la réserve de la Gamme.',
    ],
    rendCompteA: 'à la gérance.',
  },
  {
    poste: 'Sécurité',
    mission: 'Veiller sur les personnes, les biens et le calme de la Maison.',
    fait: [
      'Tient l’entrée, oriente, et veille sur le stationnement.',
      'Ouvre et ferme, et vérifie que tout est clos avant de partir.',
      'Intervient calmement sur tout incident et prévient la gérance aussitôt.',
      'Tient le cahier des entrées et des incidents.',
    ],
    mesure: [
      'Les incidents et leur suite.',
      'La fermeture vérifiée chaque soir.',
      'Le cahier tenu.',
    ],
    neFaitPas: [
      'Il ne discute pas d’une cliente ni de ce qu’elle paie.',
      'Il ne quitte pas son poste sans passer la main.',
    ],
    rendCompteA: 'à la gérance.',
  },
  {
    poste: 'Chauffeur',
    mission: 'Conduire les personnes et les choses de la Maison, à l’heure et sans risque.',
    fait: [
      'Conduit la direction et les équipes selon le programme du jour.',
      'Entretient le véhicule : niveaux, pneus, propreté, papiers à jour.',
      'Tient le carnet des trajets et du carburant.',
      'Prévient dès qu’un retard devient probable, pas quand il est arrivé.',
    ],
    mesure: [
      'Les trajets à l’heure.',
      'Le carnet et les justificatifs de carburant.',
      'L’état du véhicule.',
    ],
    neFaitPas: [
      'Il ne prend pas de course personnelle avec le véhicule de la Maison.',
      'Il ne transporte pas de valeurs sans consigne écrite.',
    ],
    rendCompteA: 'à la gérance.',
  },
  {
    poste: 'Coursier',
    mission: 'Porter ce qui doit arriver ailleurs, et rapporter ce qui doit revenir.',
    fait: [
      'Livre les commandes de la Gamme et les documents.',
      'Retire les achats chez les fournisseurs et rapporte les pièces.',
      'Fait signer ce qui doit l’être et rapporte les justificatifs le jour même.',
      'Rend la monnaie et les reçus sans délai.',
    ],
    mesure: [
      'Les courses faites dans le délai annoncé.',
      'Les justificatifs rapportés, tous.',
      'Les écarts d’espèces, qui doivent être nuls.',
    ],
    neFaitPas: [
      'Il n’engage pas une dépense sans accord.',
      'Il ne garde pas d’espèces d’un jour sur l’autre.',
    ],
    rendCompteA: 'à la gérance.',
  },
  {
    poste: 'Jardinier',
    mission: 'Tenir les abords, parce qu’une cliente juge la Maison avant d’y entrer.',
    fait: [
      'Entretient les plantes, la cour et les abords.',
      'Arrose, taille, et remplace ce qui meurt.',
      'Tient les extérieurs nets à l’ouverture.',
      'Signale ce qui s’abîme dehors.',
    ],
    mesure: [
      'Les abords à l’ouverture.',
      'L’état des plantes dans la durée.',
    ],
    neFaitPas: [
      'Il n’entre pas dans les espaces de soin en tenue de jardin.',
    ],
    rendCompteA: 'à la gérance.',
  },
];

const aPlat = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'·]/g, '').toLowerCase().trim();

/** LA FICHE D'UNE FONCTION, quelle que soit l'écriture. « Maîtresse » et
    « Maître » sont un seul poste : deux fiches pour un métier finiraient par
    dire deux choses différentes du même travail. */
export const ficheDuPoste = (fonction: string): FicheDePoste | undefined => {
  const f = aPlat(fonction);
  return FICHES_DE_POSTE.find((p) => aPlat(p.poste) === f || (p.aussi ?? []).some((a) => aPlat(a) === f));
};

/** LES FONCTIONS SANS FICHE. Un poste que la Maison a créé et que personne n'a
    décrit : il se recrute à l'aveugle et s'évalue à l'humeur. */
export const fonctionsSansFiche = (fonctions: readonly string[]): string[] =>
  fonctions.filter((f) => f.trim() && !ficheDuPoste(f));
