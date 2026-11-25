import { C, L, P, fiche } from '../outils.mjs';
import { REGARD_AVANT, SECHAGE, NOTER_LA_FICHE, BONNET_LA_NUIT, SECHER_A_LA_MAISON, FLACONS_DU_LABORATOIRE } from '../communs.mjs';

/* LES LAVAGES RITUELS — KLƆKLƆ™. Tout vient du catalogue (ce que chaque
   lavage est, pour qui) et du Laboratoire de la Maison (les formules SH-ESS,
   SH-SIG, SH-PRE, leur ordre, leurs délais de garde). Les gestes de lavage
   eux-mêmes sont la pratique courante, sans chiffre. */

export default (cat) => [
  fiche('sv-plt-05-ess-c', 'KLƆKLƆ™ Essentiel · Le Souffle', {
    objectif: [
      C('Un lavage doux : nettoyer le cuir chevelu et les longueurs, emporter les résidus du quotidien, sans brusquer les locks.'),
      C('À la sortie : des locks nettes et légères, un cuir chevelu frais et confortable.'),
    ],
    public: [
      C('Des locks déjà propres, entretenues régulièrement, à garder en beauté entre deux rituels.'),
      C('Si les locks demandent un vrai nettoyage, proposer KLƆKLƆ™ Signature ; si des résidus ou des odeurs sont installés, WÈWÈ™.'),
    ],
    produits: [
      L('Shampoing Doux Essentiel, sans sulfate : le shampoing principal.', { d: 'SH-ESS-P1' }),
      L('Masque Hydratant Léger Essentiel : le voile hydratant des longueurs, après le shampoing.', { d: 'SH-ESS-P2' }),
      L('Au réfrigérateur : le shampoing se garde 5 jours au plus après ouverture, le masque 3 jours.'),
    ],
    arrivee: [REGARD_AVANT, FLACONS_DU_LABORATOIRE],
    etapes: [
      P('Mouiller abondamment à l’eau tiède, jusqu’au cœur des locks.'),
      L('Shampoing Doux Essentiel.'),
      P('Masser le cuir chevelu du bout des doigts, puis presser la mousse le long des locks, sans les frotter entre elles.'),
      P('Rincer jusqu’à ce que l’eau soit claire : aucun reste de mousse dans la lock.'),
      L('Masque Hydratant Léger Essentiel, en voile sur les longueurs.', { v: 'Le Laboratoire ne donne pas de temps de pose pour ce masque : à fixer.' }),
      P('Rincer, puis presser les locks dans la serviette, sans tordre.'),
      SECHAGE,
    ],
    conseils: [SECHER_A_LA_MAISON, BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-plt-05-ess-c')}.`),
      ...cat.comprisDans('sv-plt-05-ess-c'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-05-sig-c', 'KLƆKLƆ™ Signature · L’Ancrage', {
    objectif: [
      C('Un lavage approfondi, plus poussé que l’entretien courant : double shampoing frictionné sur le cuir chevelu et les longueurs, démêlant hydratant, séchage soigné.'),
      C('À la sortie : des locks propres et souples, un cuir chevelu net.'),
    ],
    public: [
      C('Des locks qui demandent un vrai nettoyage, un cran au-dessus d’un simple entretien, sans résidus blancs à traiter.'),
      C('S’il y a des résidus blancs, de la poussière ancrée ou des odeurs : proposer WÈWÈ™.'),
    ],
    produits: [
      L('Shampoing Argileux Purifiant Signature (argile verte) : le premier shampoing, la purification.', { d: 'SH-SIG-P1' }),
      L('Shampoing Nourrissant Karité Signature : le deuxième shampoing, la nutrition.', { d: 'SH-SIG-P2' }),
      L('Masque Hydratant Profond Signature : après les shampoings.', { d: 'SH-SIG-P3' }),
      L('Au réfrigérateur : l’Argileux et le Masque se gardent 3 jours, le Karité 5 jours. Agiter l’Argileux s’il s’est légèrement séparé.'),
    ],
    arrivee: [
      REGARD_AVANT,
      FLACONS_DU_LABORATOIRE,
      L('Le Shampoing Argileux contient de l’huile essentielle de lavande vraie.', { v: 'À décider : demander à la cliente si elle y est sensible, et que faire pour un enfant ou une femme enceinte.' }),
    ],
    etapes: [
      P('Mouiller abondamment à l’eau tiède, jusqu’au cœur des locks.'),
      L('Premier shampoing : l’Argileux Purifiant, frictionné sur le cuir chevelu puis sur les longueurs.'),
      P('Rincer jusqu’à ce que l’eau soit claire.'),
      L('Deuxième shampoing : le Nourrissant Karité.'),
      P('Rincer jusqu’à ce que l’eau soit claire : aucun reste de mousse dans la lock.'),
      L('Masque Hydratant Profond Signature sur les longueurs.', { d: '12 minutes' }),
      P('Rincer, puis presser les locks dans la serviette, sans tordre.'),
      SECHAGE,
    ],
    conseils: [SECHER_A_LA_MAISON, BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-plt-05-sig-c')}.`),
      ...cat.comprisDans('sv-plt-05-sig-c'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-05-pre-c', 'KLƆKLƆ™ Prestige · La Dépose', {
    objectif: [
      C('Le rituel de lavage complet : double lavage, massage prolongé, masque posé sous chaleur douce, séchage et coiffage de sortie.'),
      C('À la sortie : des locks propres et douces au toucher, une vraie détente.'),
    ],
    public: [
      C('Quand une date compte, ou que la cliente ne veut rien négliger dans son lavage.'),
    ],
    produits: [
      L('Bain Détox Pré-Shampoing Prestige (bicarbonate, citrate de sodium, huile de neem) : le trempage avant les shampoings. Se prépare à la minute, ne se garde pas.', { d: 'SH-PRE-P0', v: 'Le Laboratoire prévoit ce bain avant le double lavage ; la description du catalogue ne le mentionne pas. À trancher : fait-il toujours partie de La Dépose ?' }),
      L('Shampoing Argileux Prestige : le premier shampoing, qui purifie et neutralise le bain.', { d: 'SH-PRE-P1' }),
      L('Shampoing Nourrissant Royal Prestige : le deuxième shampoing.', { d: 'SH-PRE-P2' }),
      L('Masque Reconstituant & Scellement Prestige (kératine, protéines de soie, karité) : le masque final.', { d: 'SH-PRE-P3' }),
      L('Au réfrigérateur : l’Argileux et le Masque se gardent 5 jours, le Nourrissant Royal 7 jours.'),
      L('Bol de trempage en inox ou en verre, jamais en aluminium avec le bicarbonate. Thermomètre.'),
    ],
    arrivee: [
      REGARD_AVANT,
      FLACONS_DU_LABORATOIRE,
      L('Les Shampoings Argileux contiennent de l’huile essentielle de lavande vraie, le bain de l’huile de neem.', { v: 'À décider : ce qu’on demande à la cliente, et que faire pour un enfant ou une femme enceinte.' }),
    ],
    etapes: [
      L('Préparer le Bain Détox : eau à 38 °C, poudres entièrement dissoutes, huile de neem en dernier.'),
      L('Immerger les longueurs. Surveiller sans s’éloigner et demander son confort à la cliente toutes les 5 minutes.', { d: '10 à 15 minutes, jamais plus' }),
      L('Rincer abondamment à l’eau tiède. Ne jamais terminer sur le bain seul : le shampoing suivant est obligatoire, il neutralise le bain.'),
      L('Premier shampoing : l’Argileux Prestige.'),
      P('Rincer jusqu’à ce que l’eau soit claire.'),
      L('Deuxième shampoing : le Nourrissant Royal.'),
      C('Massage prolongé du cuir chevelu.', { v: 'Durée du massage : à fixer.' }),
      L('Masque Reconstituant & Scellement, posé sous chaleur douce.', { v: 'Temps de pose sous chaleur : le Laboratoire ne le dit pas. À fixer.' }),
      P('Rincer, puis presser les locks dans la serviette, sans tordre.'),
      SECHAGE,
      C('Coiffage de sortie.'),
    ],
    conseils: [SECHER_A_LA_MAISON, BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-plt-05-pre-c')}.`),
      C('Compris : le coiffage de sortie.'),
      ...cat.comprisDans('sv-plt-05-pre-c'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-dds-shp-e', 'KLƆKLƆ™ avec votre produit · shampoing apporté', {
    objectif: [
      C('Le lavage KLƆKLƆ™ du niveau choisi, réalisé avec le shampoing de la cliente.'),
    ],
    public: [
      C('La cliente qui apporte son propre shampoing.'),
    ],
    produits: [
      C('Le shampoing apporté par la cliente.', { v: 'Rien n’est écrit sur ce qu’on fait d’un produit inadapté aux locks (résidus, après-shampoing épais). À décider.' }),
      C('Les autres produits du niveau KLƆKLƆ™ correspondant : voir sa fiche.'),
    ],
    arrivee: [
      REGARD_AVANT,
      P('Lire l’étiquette du produit avec la cliente : ce que c’est, son mode d’emploi, sa date. Lui demander si elle l’a déjà utilisé sans réaction.'),
    ],
    etapes: [
      C('Suivre les étapes du niveau KLƆKLƆ™ correspondant, le shampoing de la cliente à la place de celui de la Maison.'),
      P('Rincer jusqu’à ce que l’eau soit claire : aucun reste de produit dans la lock.'),
      SECHAGE,
    ],
    conseils: [SECHER_A_LA_MAISON, BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-dds-shp-e')}.`),
      C('Le prix est celui du niveau, moins la part produit.'),
      NOTER_LA_FICHE,
    ],
  }),
];
