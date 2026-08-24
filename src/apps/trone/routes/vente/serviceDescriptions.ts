/* Descriptions signées des prestations — voix de la Maison, les quatre temps
   (Purifier · Nourrir · Sceller · Couronner). Données de migration, séparées du
   composant. Clés = ids réels du catalogue.

   • FILL_DESCRIPTIONS : posées UNIQUEMENT si la description est vide (18 prestations
     qui n'en avaient aucune).
   • REWRITE_DESCRIPTIONS : réécriture UNE FOIS (via `descRev`) des 63 prestations
     qui avaient déjà une description. Après passage, `descRev = DESC_REV` : la
     migration ne les touche plus, et vos retouches manuelles sont préservées. */

export const DESC_REV = 2;

export const FILL_DESCRIPTIONS: Record<string, string> = {
  'sv-rituel-mr6p76kx': 'Des twists montés sur mèches naturelles : une coiffure protectrice qui prolonge la couronne et la met en valeur, sans jamais contraindre la fibre.',
  'sv-rituel-mpje8apm': 'Mains et pieds réunis en un seul soin, on prend soin de vous jusqu’au bout des doigts, pendant que la couronne se façonne.',
  '47noorddot': 'Le sérum fortifiant à 5 % : un allié quotidien pour densifier la racine et soutenir la pousse, entre deux passages à la Maison. À appliquer selon le protocole remis au fauteuil.',
  'sv-reprise-locks': 'On reprend une couronne fragilisée mèche par mèche : locks affaiblies, racines relâchées, pointes ouvertes, chacune est renforcée, refermée, remise droite. La réparation qui redonne de l’assise.',
  'sv-style-conseil': 'Le lavage fondateur de la Maison : purifier le cuir chevelu, libérer chaque lock, préparer la fibre à recevoir le soin. Le premier des quatre temps.',
  'sv-coiffure-event': 'Un lavage tout en douceur, pensé pour les cuirs chevelus sensibles : on nettoie sans agresser, on apaise et on rafraîchit. La propreté sans la sécheresse.',
  'sv-bain-vapeur': 'Le soin qui rend la couronne souple et docile : on nourrit la fibre en profondeur pour dénouer les tensions et retrouver un mouvement naturel. Nourrir, le deuxième temps.',
  'zebpkpg6ar': 'La grande purification : on débarrasse locks et cuir chevelu des résidus accumulés, produits, poussière, dépôts, pour repartir sur une base nette et légère.',
  'sv-entretien-complet': 'L’entretien intégral de la couronne : resserrage des racines, lavage, soin et remise en forme. Le rendez-vous régulier qui garde vos locks impeccables, tout, en une séance.',
  'sv-resserrage': 'On reprend la repousse à la racine, lock par lock : la couronne retrouve sa netteté et sa tenue. Le geste d’entretien essentiel, à intervalle régulier.',
  'sv-rituel-mp2ln2i4': 'Le premier regard : on lit votre cheveu, votre cuir chevelu et vos attentes pour dessiner le projet de votre future couronne. Le point de départ de toute création.',
  'hldnt5bhtq': 'Avant de créer : on évalue la densité, la longueur et la nature de votre cheveu, on choisit la méthode et on projette le rendu. La consultation qui fonde votre couronne sur mesure.',
  'fff106cwgo': 'Pour une couronne déjà installée : on examine l’état des locks et on définit le plan, resserrage, réparation, densification, pour les mener au niveau supérieur.',
  'sv-rituel-mr3szmso': 'L’examen d’une couronne fragilisée : on identifie ce qui doit être réparé ou renforcé et on trace le chemin de la remise en état, avant toute intervention.',
  'sv-locks-moyennes': 'La grande création : jusqu’à 350 locks installées mèche après mèche pour une couronne dense et majestueuse. Une œuvre d’ampleur, pensée pour durer et porter haut.',
  'sv-locks-fines': 'La couronne signée : jusqu’à 250 locks pour un équilibre parfait entre densité et finesse. Le grand classique de la Maison, monté avec patience.',
  'mx8npm3zn9': 'La couronne d’exception, entièrement sur mesure : nombre, taille et rendu définis avec vous, sans aucune limite. Le tarif s’établit après la consultation, selon l’ampleur du projet.',
  'sv-rituel-mq3ln93q': 'L’éclaircissement maîtrisé : on prépare la fibre et on décolore avec précaution pour révéler une nouvelle intensité, sans brutaliser la couronne. La base d’une couleur lumineuse.',
};

export const REWRITE_DESCRIPTIONS: Record<string, string> = {
  /* ÀGBÀ™ · Tresses & extras */
  'sv-rituel-mpskliuh': 'Un renfort d’actifs pour les longueurs : on nourrit la fibre sur toute sa hauteur, jusqu’aux pointes, pour une couronne dense et souple. Le temps du Nourrir, poussé jusqu’au bout.',
  'sv-rituel-mpdjbdm5': 'La coiffure pensée pour vous seule : on sculpte la couronne selon votre allure et l’occasion. Le temps du Couronner, taillé sur mesure.',
  'sv-rituel-mpdj8t99': 'La grande coiffure : un travail de style élaboré, tenu et précis, pour les jours où la couronne doit parler la première. Couronner, sans retenue.',
  'sv-rituel-mpdj61e5': 'Un geste de style tout simple pour remettre la couronne en ordre : rapide, net, tête haute. Le Couronner du quotidien.',
  'sv-rituel-mpdjcyh0': 'Des twists nets qui structurent et protègent la couronne le temps d’une saison. Un Sceller léger, un Couronner discret.',
  'sv-rituel-mqkoruz9': 'La touche GBÀTA™ Ivoire : une finition claire et lumineuse qui habille la couronne d’une lumière douce. Le temps du Couronner, en nuance.',
  'sv-rituel-mqkoqjub': 'La touche GBÀTA™ Métis : une finition chaude, entre miel et châtaigne, pour réchauffer la couronne. Couronner, dans la nuance.',
  'sv-rituel-mpskkhyn': 'Le lavage adapté aux grandes longueurs : on purifie le cuir chevelu et on libère chaque mèche sur toute sa hauteur. Le temps du Purifier, jusqu’aux pointes.',
  'sv-rituel-mpdjn3qx': 'Un supplément de temps au fauteuil, quand la couronne en demande davantage, pour ne rien précipiter et bien sceller l’ouvrage.',
  'sv-rituel-mpdji3sm': 'Le temps long, offert à une couronne exigeante : on prend la mesure qu’il faut pour purifier, nourrir et sceller sans hâte.',
  'sv-rituel-mpje726f': 'On prend soin de vos mains pendant que la couronne se façonne, un soin délicat, jusqu’au bout des doigts.',
  'sv-rituel-mpje7ji7': 'Le soin des pieds, pour être soignée de la tête aux orteils pendant que le rituel opère, un vrai moment de repos.',
  'sv-rituel-mq70pqmk': 'Une touche finale d’éclat : on ravive la lumière de la couronne et on scelle la brillance. Le Couronner qui fait chanter la mèche.',
  'sv-rituel-mq70mpw7': 'Un supplément d’hydratation, là où la fibre a soif : on nourrit en profondeur pour retrouver souplesse et douceur. Le Nourrir, en renfort.',
  'sv-rituel-mpdikoo2': 'Le rituel réalisé avec vos propres produits : la Maison met son geste et son savoir-faire au service de ce que vous avez choisi.',

  /* ÐÓTÓ™ · Consultation & conseil */
  'svc-doto-conseil': 'Un temps rien qu’à vous pour lire votre couronne et tracer sa route : routine, gestes maison, produits justes. Le conseil qui prolonge le rituel entre deux venues.',
  'svc-doto-creation': 'Le tout premier rendez-vous, avant la création : on lit le cheveu et le cuir chevelu, on choisit la méthode et on projette votre future couronne. Le point de départ de toute œuvre.',
  'svc-doto-reparation': 'Le diagnostic d’une couronne fragilisée : on repère ce qui doit être purifié, nourri ou resserré, et on trace le plan de sa remise en état.',

  /* FÍNFÍN™ · Réparation profonde */
  'sv-rituel-mp2qnjwa': 'La sublimation ÀLÀLÀ™ : un soin qui révèle la couronne, on purifie, on nourrit en profondeur et on scelle l’éclat pour une fibre qui respire. Trois temps en un.',
  'sv-gbigbi-essentiel': 'Le premier degré de la réparation profonde : on réveille une fibre fatiguée, on la purifie et on la nourrit pour lui rendre force et souplesse.',
  'sv-gbigbi-profond': 'La réparation en profondeur : mèche après mèche, on reconstruit la fibre abîmée, purifier, nourrir, sceller, jusqu’à ce que la couronne retrouve son assise.',
  'sv-alala': 'Le grand œuvre de la réparation : une couronne très éprouvée est ramenée à la vie, temps après temps, purifiée, nourrie, scellée, couronnée. La renaissance, rien de moins.',
  'sv-rituel-mpdjh1fz': 'Un temps de conseil dédié à la réparation : on évalue l’état de la fibre et on bâtit le protocole de soin qui la remettra droite.',
  'sv-sos-restauration': 'L’intervention d’urgence pour une couronne en détresse, casse, relâchement, dégâts profonds : on purifie, on nourrit, on reconstruit et on scelle pour tout sauver. Le grand secours, établi sur devis.',

  /* GBÈJÍ™ · Entretien des locks */
  'sv-dandan': 'Le soin qui étanche la soif de la couronne : on nourrit la fibre en profondeur et on scelle l’hydratation pour des locks souples et vivantes. Le Nourrir, à l’honneur.',
  'sv-rituel-mp1lproe': 'L’entretien essentiel : on purifie le cuir chevelu et on rafraîchit chaque lock. Le premier des quatre temps, à intervalle régulier.',
  'sv-rituel-mpdgup11': 'L’entretien Prestige : lavage soigné, soin nourrissant et remise en forme, la couronne repart nette, souple et scellée.',
  'sv-rituel-mpf69yj3': 'L’entretien signé de la Maison : on purifie, on nourrit, on scelle, le rituel complet qui garde une couronne impeccable.',
  'sv-rituel-mpdgwgqc': 'L’entretien Suprême : le plus complet des soins d’entretien, purifier, nourrir, sceller, couronner, sans rien laisser au hasard.',
  'sv-rituel-mpdqjycc': 'L’ancrage des racines : on reprend la repousse et on scelle chaque lock à sa base pour une couronne qui tient droit. Le temps du Sceller, à la racine.',
  'sv-rituel-mpdkjmvq': 'Le resserrage élaboré : un travail minutieux, lock par lock, pour une couronne parfaitement nette et durablement scellée.',
  'sv-sinsin': 'Le resserrage essentiel : on reprend la repousse à la racine pour rendre à la couronne sa netteté et sa tenue. Le geste d’entretien fondateur.',
  'sv-rituel-mpxrsfv3': 'Le resserrage essentiel : racine après racine, on remet la couronne au propre et on scelle sa tenue. Le rendez-vous régulier de l’entretien.',
  'sv-rituel-mq6wbusw': 'Le réveil de la ligne frontale : on resserre et on remet en ordre l’avant de la couronne, là où le regard se pose d’abord.',
  'sv-rituel-mq6zu12s': 'Le réveil frontal prolongé d’un modèle sur mesure : on resserre l’avant de la couronne et on dessine la ligne qui vous ressemble. Sceller et Couronner d’un même geste.',
  'sv-vivivo': 'Le soin qui appelle la pousse : on nourrit la racine et on stimule la fibre pour une couronne qui grandit, saine et forte. Nourrir, à la source.',
  'sv-wewe': 'La grande purification WÈWÈ™ : on débarrasse locks et cuir chevelu des résidus accumulés pour repartir sur une base nette et légère. Le Purifier, en profondeur.',

  /* GBÈZÀ™ · Entretien & shampoing */
  'p7yz5g079a': 'Le lavage Prestige : un shampoing soigné qui purifie le cuir chevelu et libère chaque lock, prélude parfait au soin. Le premier temps, le Purifier.',
  '2eu81u7qnv': 'Le lavage Suprême : purification en profondeur et soin en un même rituel, la couronne ressort nette, nourrie et scellée.',
  'sv-rituel-quatre-temps': 'Le soin hydratant dans sa version la plus complète : les quatre temps réunis, purifier, nourrir, sceller, couronner, pour une couronne comblée.',

  /* VÈKPÈ™ · Créations variables (haut de gamme) */
  'sv-rituel-mpks9wbd': 'La couronne haute couture : une création d’exception, façonnée mèche après mèche sans compromis. Les quatre temps portés à leur sommet, l’œuvre d’une vie.',
  'sv-rituel-mpjcxbef': 'Une création hors normes : densité, longueur et finition pensées comme une pièce unique. Purifier, nourrir, sceller, couronner, jusqu’à l’exception.',
  'sv-rituel-mp78jdyc': 'La couronne de distinction : une création ample et raffinée, montée avec patience pour porter haut. L’œuvre qui se remarque sans un mot.',
  'sv-vekpe-signature': 'La grande création essentielle : une couronne dense et équilibrée, née de vos cheveux et scellée pour durer. Les quatre temps, du premier au dernier.',
  'sv-vekpe-prestige': 'La création Prestige : une couronne d’ampleur, généreuse et majestueuse, façonnée pour traverser les saisons la tête haute.',
  'sv-rituel-mpmej91v': 'La couronne signée : une création à l’équilibre parfait entre densité et finesse. Le classique de la Maison, purifié, nourri, scellé, couronné.',
  'sv-rituel-mpkcygev': 'La couronne souveraine : la plus haute des créations, sans aucune limite, une œuvre absolue où chaque temps est porté à sa perfection. Le règne, en cheveux.',
  'sv-rituel-mp1ldfj2': 'La création Suprême : ampleur, tenue et finition d’exception pour une couronne qui impose le respect. L’ouvrage des grands jours.',

  /* VÈKPÈ™ · Création de couronne */
  'svc-vekpe-crochet': 'Des locks structurées dès la première séance, montées au crochet : un rendu net et immédiat. On purifie, on installe, on scelle, la couronne sans attendre. Tarif selon la quantité et la longueur.',
  'svc-vekpe-traditionnelles': 'Les locks classiques, nées de vos cheveux : vrillées, nourries puis scellées mèche après mèche. Les quatre temps, à l’ancienne. Tarif selon la longueur et le volume.',
  'svc-vekpe-microlocks': 'La couronne d’exception : des centaines de microlocks fines posées une à une. Le grand œuvre, purifier, nourrir, sceller, couronner, établi sur mesure après consultation.',
  'svc-vekpe-fauxlocks': 'Le style protecteur : des locks temporaires posées en extensions, pour essayer la couronne ou traverser une saison. On purifie, on protège, on couronne, retrait compris.',
  'sv-vekpe-essentiel': 'La création de locks courtes : une couronne nette et vive, idéale pour un premier engagement. Les quatre temps, en format court.',
  'sv-microlocks': 'La création essentielle : jusqu’à 150 locks montées avec soin pour une couronne équilibrée et facile à vivre. Purifier, nourrir, sceller, couronner.',
  'sv-rituel-mpmeljvy': 'La création sur cheveux longs : une couronne généreuse qui met la longueur en majesté. Les quatre temps, jusqu’aux pointes.',
  'sv-rituel-mpl2rty1': 'La grande transformation : on change tout, mèche après mèche, pour révéler une couronne neuve. Purifier, nourrir, sceller, couronner, la métamorphose.',
  'sv-rituel-mpmeio39': 'La création mi-longue : le juste équilibre entre mouvement et tenue, pour une couronne qui suit tous les jours. Les quatre temps, taille intermédiaire.',
  'sv-rituel-mpl3brcs': 'Le réveil de la création : une reprise qui redonne forme et éclat à une couronne installée. On purifie, on nourrit, on scelle, la couronne, ravivée.',

  /* YÈKPÈ™ · Colorations */
  'sv-rituel-mpbpz23b': 'La couleur posée avec soin : on habille la couronne d’une teinte nouvelle sans brutaliser la fibre. On nourrit, on colore, on scelle l’éclat.',
  'sv-yekpe-couleur': 'La couleur signée YÈKPÈ™ : une teinte franche et lumineuse, déposée sur une fibre préparée et scellée pour tenir. Couronner, en couleur.',
  'sv-rituel-mq6vpu7d': 'Le noir profond YÈKPÈ™ Ébène : une couleur dense et lumineuse qui rehausse la couronne d’un éclat de nuit. Sceller la profondeur.',
  'sv-yekpe-lumiere': 'Les reflets de lumière : on éclaire la couronne de nuances subtiles pour lui donner du relief et du mouvement. Le Couronner, en clair-obscur.',
  'sv-yekpe-sublimation': 'La sublimation par la couleur : un travail d’exception qui transforme la couronne en œuvre lumineuse, préparée, nourrie, colorée, scellée. Les quatre temps, en couleur.',
};
