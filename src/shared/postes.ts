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

/** ══ CE QUI SE RETIRE SANS S'EFFACER — 6 septembre 2026 ═════════════
    La Maison modifie ses fiches depuis Paramètres. Supprimer une ligne déjà
    cochée dans un entretien signé rendrait cet entretien illisible : il
    afficherait des cases sans énoncé, et personne ne saurait plus à quoi la
    personne a dit oui. Une ligne retirée reste donc dans la fiche, et cesse
    seulement d'être proposée. */
export type Competence = { cle: string; mot: string; retiree?: boolean };
export type Objectif = { cle: string; mot: string; cible: string; retiree?: boolean };

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
  /** ══ CE QU'ELLE PEUT DÉCIDER — 6 septembre 2026 ═══════════════════
      « Rajoute les pouvoirs de décision de chaque fiche de poste : ce qu'il
      peut décider, et ce qui a besoin d'être approuvé avant de faire »
      (Yéman).

      C'EST LA RUBRIQUE QUI ÉVITE LES DEUX FAUTES SYMÉTRIQUES : celui qui
      n'ose rien trancher et fait attendre une cliente pour un geste à cent
      francs, et celui qui tranche tout et engage la Maison sans le savoir.
      « Ce qu'elle ne fait pas » trace la frontière du MÉTIER ; celle-ci trace
      la frontière de l'AUTORITÉ, et ce n'est pas la même chose : un maître a
      le droit d'arrêter un rituel, pas d'accorder une remise. */
  decide: string[];
  /** CE QUI S'APPROUVE AVANT, ET PAR QUI. Le nom de celui qui approuve est la
      moitié utile de la ligne : « demander l'accord » sans dire à qui se
      traduit au fauteuil par « demander à celui qui passe », et deux personnes
      finissent par accorder des choses contraires le même jour. */
  demandeAvant: { quoi: string; a: string }[];
  rendCompteA: string;
  /** ══ CE QUI SE COCHE — 6 septembre 2026 ═══════════════════════════
      « Des fiches de poste plus détaillées avec des cases à cocher, des
      objectifs mesurables et atteignables, des points forts » (Yéman).

      DES GESTES OBSERVABLES, jamais des qualités. « Ponctuel » ne se coche
      pas : ça se discute. « Prévient d'un retard avant le jour même » se
      coche, et les deux regards peuvent en convenir. */
  competences: Competence[];
  /** ══ CE QUI SE VISE ═══════════════════════════════════════════════
      Un standard du poste, ajustable par personne (arbitrage). La Maison
      n'invente rien à chaque embauche, et deux personnes du même poste sont
      jugées sur la même chose.

      LA CIBLE EST UN TEXTE, pas un nombre : « 7 têtes sur 10 » et « toutes »
      se lisent mieux qu'un pourcentage, et un objectif qu'on doit convertir de
      tête n'est pas un objectif qu'on a compris. */
  objectifs: Objectif[];
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
    decide: [
      'Refuser un service, ou arrêter un rituel commencé, quand la tête ne le supporte pas.',
      'Ce qui entre au catalogue de la Maison et ce qui en sort.',
      'Le passage d’un praticien en autonomie, et son retour en arrière.',
      'Reprendre sans frais un rituel que la Maison a manqué.',
    ],
    demandeAvant: [
      { quoi: 'Une dépense qui engage la Maison', a: 'la gérance, qui tient la caisse' },
      { quoi: 'Un tarif nouveau, ou une remise qui dure', a: 'la direction' },
      { quoi: 'Une embauche ou une fin de collaboration', a: 'la direction' },
    ],
    competences: [
      { cle: 'difficile', mot: 'Conduit une tête en mauvais état sans l’abîmer davantage' },
      { cle: 'refus', mot: 'Sait refuser un service, et l’expliquer à la cliente' },
      { cle: 'autonomie', mot: 'Rend un praticien autonome, et le prouve au fauteuil' },
      { cle: 'catalogue', mot: 'Arbitre ce qui entre au catalogue et ce qui en sort' },
      { cle: 'referentiel', mot: 'Tient le référentiel de la Maison à jour' },
    ],
    objectifs: [
      { cle: 'autonomes', mot: 'Praticiens rendus autonomes', cible: 'deux dans l’année' },
      { cle: 'reclam', mot: 'Réclamations sur ses propres rituels', cible: 'aucune' },
      { cle: 'cadence', mot: 'Têtes qu’il suit et qui tiennent leur cadence', cible: 'huit sur dix' },
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
    decide: [
      'Adapter le protocole à ce qu’il constate sur la tête, et le noter.',
      'Arrêter ou reporter un rituel qui abîmerait la tête, et l’expliquer à la cliente.',
      'Prendre le temps qu’il faut quand la tête en demande plus qu’annoncé.',
      'Appeler un maître fondateur sur un cas qu’il ne sent pas, sans se justifier.',
    ],
    demandeAvant: [
      { quoi: 'Toute remise, tout geste commercial, tout prix hors catalogue', a: 'la gérance' },
      { quoi: 'Reprendre un rituel sans frais', a: 'la gérance' },
      { quoi: 'Déplacer un rendez-vous déjà posé', a: 'l’accueil, qui tient le carnet' },
      { quoi: 'Ouvrir un produit de la Gamme pour l’usage du salon', a: 'la gérance' },
    ],
    competences: [
      { cle: 'rituel', mot: 'Conduit un rituel complet seul, du diagnostic à la coiffure' },
      { cle: 'prix', mot: 'Annonce un prix et une durée justes avant de commencer' },
      { cle: 'fiche', mot: 'Renseigne la fiche entièrement : longueur, comptage, mèche témoin' },
      { cle: 'bilan', mot: 'Rédige et remet un bilan de séance' },
      { cle: 'limite', mot: 'Reconnaît une tête qu’il ne faut pas travailler ce jour-là' },
    ],
    objectifs: [
      { cle: 'fiches', mot: 'Fiches renseignées après ses rituels', cible: 'toutes' },
      { cle: 'cadence', mot: 'Ses têtes qui reviennent quand elles doivent', cible: 'sept sur dix' },
      { cle: 'bilans', mot: 'Bilans remis', cible: 'un par tête et par trimestre' },
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
    decide: [
      'L’ordre de ses gestes dans le temps qui lui est donné.',
      'Demander l’aide d’un maître à tout moment, sans se justifier.',
      'Refuser d’exécuter un geste qu’il n’a pas encore validé.',
    ],
    demandeAvant: [
      { quoi: 'Tout geste hors de ce qu’il a validé', a: 'un maître' },
      { quoi: 'Annoncer un prix ou une durée à une cliente', a: 'un maître, ou l’accueil' },
      { quoi: 'Travailler une tête en mauvais état', a: 'un maître' },
    ],
    competences: [
      { cle: 'lavage', mot: 'Lave et hydrate selon le protocole, sans l’adapter' },
      { cle: 'resserrage', mot: 'Resserre une racine proprement, sans tirer' },
      { cle: 'poste', mot: 'Prépare un poste complet avant l’arrivée de la tête' },
      { cle: 'appel', mot: 'Appelle un maître au bon moment, plutôt que d’essayer' },
      { cle: 'trace', mot: 'Renseigne ce qu’il a fait, geste par geste' },
    ],
    objectifs: [
      { cle: 'etapes', mot: 'Étapes d’autonomie validées', cible: 'trois dans l’année' },
      { cle: 'reprises', mot: 'Rituels repris derrière lui par un maître', cible: 'moins d’un sur dix' },
      { cle: 'fiches', mot: 'Fiches renseignées après ses gestes', cible: 'toutes' },
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
    decide: [
      'La conduite de sa séance, à l’intérieur du programme du parcours.',
      'Faire refaire un module à une apprenante qui n’est pas prête.',
      'Alerter sur une apprenante qui décroche, sans attendre le jury.',
    ],
    demandeAvant: [
      { quoi: 'Présenter une apprenante au jury', a: 'la direction de l’Académie' },
      { quoi: 'Modifier le programme d’un parcours', a: 'le maître fondateur' },
      { quoi: 'Délivrer une attestation ou un certificat', a: 'la direction de l’Académie' },
    ],
    competences: [
      { cle: 'seance', mot: 'Anime une séance en suivant le programme' },
      { cle: 'correction', mot: 'Corrige un geste sans décourager' },
      { cle: 'evaluation', mot: 'Évalue un module avec la grille, et sait le justifier' },
      { cle: 'jury', mot: 'Prépare une apprenante au jury' },
      { cle: 'alerte', mot: 'Alerte dès qu’une apprenante décroche' },
    ],
    objectifs: [
      { cle: 'fichesSeance', mot: 'Fiches de séance validées le jour même', cible: 'toutes' },
      { cle: 'presentees', mot: 'Apprenantes présentées au jury', cible: 'huit sur dix' },
      { cle: 'certifiees', mot: 'Apprenantes certifiées', cible: 'sept sur dix' },
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
    decide: [
      'Poser, déplacer ou confirmer un rendez-vous dans le carnet.',
      'Faire patienter, réinstaller, offrir une boisson.',
      'Prévenir une cliente d’une attente avant qu’elle ne la subisse.',
    ],
    demandeAvant: [
      { quoi: 'Toute remise, tout report de règlement, tout paiement en plusieurs fois', a: 'la gérance' },
      { quoi: 'Sortir de l’argent de la caisse', a: 'la gérance, et par écrit' },
      { quoi: 'Annuler une facture déjà encaissée', a: 'la gérance' },
      { quoi: 'Ouvrir un créneau hors des heures affichées', a: 'la gérance' },
    ],
    competences: [
      { cle: 'recevoir', mot: 'Reçoit, installe, et prévient d’une attente avant qu’on la subisse' },
      { cle: 'carnet', mot: 'Tient le carnet sans trou : pose, déplace, confirme' },
      { cle: 'caisse', mot: 'Encaisse et remet le reçu, sans exception' },
      { cle: 'rappels', mot: 'Rappelle celles qui n’ont pas confirmé' },
      { cle: 'fiches', mot: 'Complète une fiche pendant que la tête est là' },
    ],
    objectifs: [
      { cle: 'caisseJuste', mot: 'Caisse juste à la fermeture', cible: 'tous les soirs' },
      { cle: 'absentes', mot: 'Têtes absentes sans avoir prévenu', cible: 'moins d’une sur vingt' },
      { cle: 'completees', mot: 'Fiches complétées par semaine', cible: 'dix' },
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
    decide: [
      'Le planning, les remplacements et les congés.',
      'Les remises et les gestes commerciaux sur une prestation.',
      'Les commandes courantes de la Gamme et du consommable.',
      'Le rappel oral et l’avertissement écrit.',
    ],
    demandeAvant: [
      { quoi: 'Une mise à pied ou un licenciement', a: 'la direction' },
      { quoi: 'Une embauche', a: 'la direction' },
      { quoi: 'Un tarif nouveau, ou un changement du catalogue', a: 'le maître fondateur, puis la direction' },
      { quoi: 'Une dépense exceptionnelle, hors du courant', a: 'la direction' },
    ],
    competences: [
      { cle: 'planning', mot: 'Tient un planning couvert, absences comprises' },
      { cle: 'argent', mot: 'Suit la caisse, les dépenses et les créances' },
      { cle: 'stock', mot: 'Commande à temps, sans rupture ni surstock' },
      { cle: 'entretien', mot: 'Conduit un entretien, et l’écrit' },
      { cle: 'reglement', mot: 'Applique le règlement, du rappel à la sanction écrite' },
    ],
    objectifs: [
      { cle: 'occupation', mot: 'Occupation des fauteuils', cible: 'sept sur dix' },
      { cle: 'ruptures', mot: 'Ruptures de stock dans le mois', cible: 'aucune' },
      { cle: 'impayes', mot: 'Impayés au-delà de trente jours', cible: 'moins de cinq pour cent' },
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
    decide: [
      'L’ordre de préparation des postes, selon le carnet du jour.',
      'Refaire un poste qui n’est pas propre, sans attendre qu’on le lui dise.',
      'Signaler ce qui manque, à tout moment et à qui travaille.',
    ],
    demandeAvant: [
      { quoi: 'Toucher une tête, même pour dépanner', a: 'un maître' },
      { quoi: 'Ouvrir un produit neuf de la réserve', a: 'la gérance' },
      { quoi: 'Répondre à une cliente sur un prix ou un délai', a: 'l’accueil' },
    ],
    competences: [
      { cle: 'preparation', mot: 'Prépare un poste complet sans qu’on le demande' },
      { cle: 'desinfection', mot: 'Désinfecte entre deux têtes, sans raccourci' },
      { cle: 'assistance', mot: 'Assiste un rituel : rinçage, sections, passage du matériel' },
      { cle: 'reserve', mot: 'Tient la réserve rangée et lisible' },
      { cle: 'alerte', mot: 'Signale ce qui manque avant que cela manque' },
    ],
    objectifs: [
      { cle: 'postes', mot: 'Postes prêts avant l’arrivée de la tête', cible: 'tous' },
      { cle: 'alertes', mot: 'Alertes de stock passées à temps', cible: 'toutes' },
      { cle: 'hygiene', mot: 'Remarques d’hygiène reçues', cible: 'aucune' },
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
    decide: [
      'L’ordre de ses tours dans la journée.',
      'Refaire ce qui n’est pas net, sans attendre qu’on le lui demande.',
      'Fermer un espace le temps de le remettre en état.',
    ],
    demandeAvant: [
      { quoi: 'Entrer dans un espace de soin pendant un rituel', a: 'la personne au fauteuil' },
      { quoi: 'Jeter ou déplacer du matériel', a: 'la gérance' },
      { quoi: 'Changer de produit d’entretien', a: 'la gérance' },
    ],
    competences: [
      { cle: 'tour', mot: 'Fait le tour complet de la journée' },
      { cle: 'sanitaires', mot: 'Tient les sanitaires à toute heure' },
      { cle: 'consommable', mot: 'Réapprovisionne avant la rupture' },
      { cle: 'signalement', mot: 'Signale ce qui casse, fuit ou s’use, le jour même' },
      { cle: 'produits', mot: 'Utilise et range les produits comme il faut' },
    ],
    objectifs: [
      { cle: 'tours', mot: 'Tours de nettoyage faits et signés', cible: 'tous les jours' },
      { cle: 'proprete', mot: 'Sanitaires nets à toute heure', cible: 'toujours' },
      { cle: 'avant', mot: 'Défauts signalés avant qu’une cliente les voie', cible: 'tous' },
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
    decide: [
      'Faire patienter, orienter, ou refuser l’entrée à qui n’a rien à faire là.',
      'Appeler les secours en cas de danger, sans attendre l’accord de personne.',
      'Fermer la porte le temps d’un incident.',
    ],
    demandeAvant: [
      { quoi: 'Laisser entrer hors des heures affichées', a: 'la gérance' },
      { quoi: 'Toucher aux affaires d’une cliente ou d’un membre de l’équipe', a: 'la gérance' },
      { quoi: 'Quitter son poste', a: 'la gérance' },
    ],
    competences: [
      { cle: 'entree', mot: 'Tient l’entrée et oriente sans brusquer' },
      { cle: 'ouverture', mot: 'Ouvre et ferme aux heures dites' },
      { cle: 'incident', mot: 'Gère un incident calmement et prévient aussitôt' },
      { cle: 'cahier', mot: 'Tient le cahier des entrées et des incidents' },
      { cle: 'fermeture', mot: 'Vérifie que tout est clos avant de partir' },
    ],
    objectifs: [
      { cle: 'fermetures', mot: 'Fermetures vérifiées', cible: 'toutes' },
      { cle: 'incidents', mot: 'Incidents consignés le jour même', cible: 'tous' },
      { cle: 'poste', mot: 'Poste quitté sans passer la main', cible: 'jamais' },
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
    decide: [
      'L’itinéraire, et l’heure de partir pour arriver à l’heure.',
      'Refuser de conduire un véhicule qu’il juge dangereux.',
      'S’arrêter quand la fatigue l’exige.',
    ],
    demandeAvant: [
      { quoi: 'Toute dépense sur le véhicule, y compris une réparation urgente', a: 'la gérance' },
      { quoi: 'Un trajet qui n’est pas au programme du jour', a: 'la gérance' },
      { quoi: 'Prêter le véhicule, ou le laisser conduire par un autre', a: 'la direction' },
    ],
    competences: [
      { cle: 'conduite', mot: 'Conduit sans risque et sans amende' },
      { cle: 'vehicule', mot: 'Entretient le véhicule : niveaux, pneus, papiers' },
      { cle: 'carnet', mot: 'Tient le carnet des trajets et du carburant' },
      { cle: 'retard', mot: 'Prévient d’un retard avant qu’il n’arrive' },
    ],
    objectifs: [
      { cle: 'heure', mot: 'Trajets à l’heure', cible: 'neuf sur dix' },
      { cle: 'justificatifs', mot: 'Justificatifs de carburant rapportés', cible: 'tous' },
      { cle: 'incidents', mot: 'Incidents de circulation', cible: 'aucun' },
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
    decide: [
      'L’ordre de ses courses, pour tenir les délais annoncés.',
      'Refuser de transporter ce qui n’est ni emballé ni identifié.',
    ],
    demandeAvant: [
      { quoi: 'Avancer de l’argent, ou régler un fournisseur', a: 'la gérance' },
      { quoi: 'Remettre un colis à quelqu’un d’autre que le destinataire', a: 'la gérance' },
      { quoi: 'Accepter une course pour un tiers', a: 'la gérance' },
    ],
    competences: [
      { cle: 'delai', mot: 'Livre et retire dans le délai annoncé' },
      { cle: 'signature', mot: 'Fait signer ce qui doit l’être' },
      { cle: 'justificatifs', mot: 'Rapporte tous les justificatifs' },
      { cle: 'monnaie', mot: 'Rend la monnaie et les reçus sans délai' },
    ],
    objectifs: [
      { cle: 'courses', mot: 'Courses faites dans le délai annoncé', cible: 'neuf sur dix' },
      { cle: 'papiers', mot: 'Justificatifs rapportés le jour même', cible: 'tous' },
      { cle: 'especes', mot: 'Écarts d’espèces', cible: 'aucun' },
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
    decide: [
      'Le moment d’arroser, de tailler, de traiter.',
      'Retirer une plante morte.',
    ],
    demandeAvant: [
      { quoi: 'Acheter des plantes ou des produits', a: 'la gérance' },
      { quoi: 'Changer la disposition des extérieurs', a: 'la direction' },
      { quoi: 'Traiter à proximité des espaces de soin', a: 'la gérance' },
    ],
    competences: [
      { cle: 'plantes', mot: 'Entretient les plantes et remplace ce qui meurt' },
      { cle: 'cour', mot: 'Tient la cour et les abords nets' },
      { cle: 'arrosage', mot: 'Arrose et taille au bon moment' },
      { cle: 'signalement', mot: 'Signale ce qui s’abîme dehors' },
    ],
    objectifs: [
      { cle: 'abords', mot: 'Abords nets à l’ouverture', cible: 'tous les jours' },
      { cle: 'remplacement', mot: 'Plantes mortes remplacées', cible: 'sous quinze jours' },
    ],
    rendCompteA: 'à la gérance.',
  },
];

const aPlat = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'·]/g, '').toLowerCase().trim();

/** LA FICHE D'UNE FONCTION, quelle que soit l'écriture. « Maîtresse » et
    « Maître » sont un seul poste : deux fiches pour un métier finiraient par
    dire deux choses différentes du même travail. */
export const ficheDuPoste = (
  fonction: string,
  /* LA LISTE SE PASSE, elle ne se suppose pas : la Maison modifie ses fiches
     depuis Paramètres, et lire ici la liste d'origine ferait travailler l'écran
     sur un texte que personne n'a plus sous les yeux. Sans liste, on retombe
     sur celle de la Maison — c'est ce que fait le harnais. */
  fiches: readonly FicheDePoste[] = FICHES_DE_POSTE,
): FicheDePoste | undefined => {
  const f = aPlat(fonction);
  return fiches.find((p) => aPlat(p.poste) === f || (p.aussi ?? []).some((a) => aPlat(a) === f));
};

/** CE QUI SE PROPOSE ENCORE. Une ligne retirée reste dans la fiche pour que les
    entretiens signés gardent leur énoncé, mais ne s'offre plus à cocher. */
export const enService = <T extends { retiree?: boolean }>(lignes: readonly T[]): T[] =>
  lignes.filter((l) => !l.retiree);

/** UNE CLÉ NEUVE, TIRÉE DU LIBELLÉ. C'est elle que portent les entretiens
    signés : elle naît une fois et ne bouge plus, même quand la phrase change. */
export const cleNeuve = (mot: string, prises: readonly string[]): string => {
  const base = aPlat(mot).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').split('-').slice(0, 2).join('-')
    || 'ligne';
  if (!prises.includes(base)) return base;
  let n = 2;
  while (prises.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/** LES FONCTIONS SANS FICHE. Un poste que la Maison a créé et que personne n'a
    décrit : il se recrute à l'aveugle et s'évalue à l'humeur. */
export const fonctionsSansFiche = (
  fonctions: readonly string[],
  fiches: readonly FicheDePoste[] = FICHES_DE_POSTE,
): string[] => fonctions.filter((f) => f.trim() && !ficheDuPoste(f, fiches));
