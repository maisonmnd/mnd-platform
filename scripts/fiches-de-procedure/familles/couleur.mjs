import { C, L, M, P, fiche } from '../outils.mjs';
import { REFS } from '../refs.mjs';
import { REGARD_AVANT, CUIR_CHEVELU_SAIN, SECHAGE, NOTER_LA_FICHE, POSER_LA_SUITE } from '../communs.mjs';

/* LA COULEUR — YÈKPÈ™ et La Transformation. Le Laboratoire de la Maison écrit
   les trois pâtes végétales et le fixateur (température, délai d'emploi,
   gants, test 48 h, fixateur 5 minutes) : tout cela est repris tel quel. Il ne
   donne pas le temps de pose des pâtes : la fiche le signale, avec le repère
   d'une notice de coloration végétale. Pour la décoloration et l'oxydation,
   la Maison n'a écrit ni produit ni notice : les précautions viennent de
   l'étiquetage européen et d'organismes professionnels, référencés. */

const SUITE_D_APRES_COULEUR = M('La suite d’après couleur de la Maison : GBÌGBÌ™ à deux semaines (J+14), DÀNDÀN™ à un mois (J+30), WÈWÈ™ à J+45, puis YÈKPÈ™ Éclat à J+56, hors forfait.');

const vegetale = (id, titre, particularite = []) => fiche(id, titre, {
  objectif: [
    C('Une couleur 100 % végétale : henné, indigo, plantes africaines. Sans ammoniaque.'),
  ],
  public: [
    C('La cliente qui veut une couleur végétale. Le test colorimétrique sur mèche est obligatoire.'),
    P('Enfant, ou déficit en G6PD (favisme) connu : le henné est à éviter.', { ref: REFS.HENNE_G6PD, v: 'À décider par la Maison : poser la question du déficit en G6PD, et à partir de quel âge la couleur végétale se fait.' }),
    P('Sur des locks décolorées, une couleur végétale peut virer au vert, au bleu ou au violet : ne rien promettre sans test de mèche.', { ref: REFS.HENNE_NOTICE }),
    P('Cheveux blancs : l’indigo ne se pose pas directement, il vire au vert ou au bleu. Il faut deux temps.', { ref: REFS.HENNE_NOTICE }),
  ],
  produits: [
    L('Pâte Noir Ébène : indigo, cassia, reng.', { d: 'CLR-NE' }),
    L('Pâte Brun Chocolat : henné, cassia, indigo, reng.', { d: 'CLR-BC' }),
    L('Pâte Roux Feu : henné pur, reng.', { d: 'CLR-RF' }),
    L('Fixateur Acide Post-Couleur : après toutes les teintes. Se prépare à la minute.', { d: 'CLR-FIX' }),
    L('Gants obligatoires : la pâte tache tout de suite. Thermomètre.'),
  ],
  arrivee: [
    L('Test patch 48 h avant la première application sur une cliente : vérifier sur sa fiche qu’il a été fait, et sans réaction.'),
    C('Test colorimétrique sur mèche : fait, et la teinte choisie avec elle.'),
    REGARD_AVANT,
    CUIR_CHEVELU_SAIN,
    P('Demander la date de la dernière couleur ou décoloration, faite ici ou ailleurs.', { ref: REFS.COULEUR_SUR_LOCKS }),
  ],
  etapes: [
    L('Préparer la pâte de la teinte choisie : poudres mélangées à sec, eau à 35 °C (jamais plus de 38 °C, cela détruit les pigments), consistance d’un yaourt épais qui tient au dos de la main sans couler.'),
    L('L’appliquer dans les 30 minutes qui suivent sa préparation. Ne pas la préparer à l’avance, ne pas la garder.'),
    P('Appliquer lock par lock, en pâte bien lisse et sans surcharger : ce qui entre dans la lock doit en ressortir au rinçage.', { ref: REFS.HENNE_SUR_LOCKS }),
    C('Temps de pose.', { ref: REFS.HENNE_NOTICE, v: 'Le Laboratoire ne donne pas le temps de pose des pâtes : à fixer par teinte. Repère relevé : de 30 minutes à 2 heures selon le test de mèche (notice d’une coloration végétale).' }),
    P('Rincer à l’eau tiède jusqu’à ce que l’eau soit claire, en pressant chaque lock : la pâte sort lentement d’une lock.', { ref: REFS.HENNE_NOTICE }),
    L('Fixateur Acide Post-Couleur sur toutes les longueurs, en massant légèrement. Ne jamais l’oublier : c’est lui qui fait tenir la couleur.', { d: '5 minutes' }),
    L('Rincer à l’eau froide pure.'),
    C('DÀNDÀN™ post couleur : compris, voir sa fiche.'),
    SECHAGE,
    C('Styling signature de sortie.'),
    ...particularite,
  ],
  conseils: [
    L('La teinte finit de se révéler dans les 48 heures : le Noir Ébène paraît bleu-vert tant qu’il est humide, puis noircit.'),
    P('Pas de shampoing pendant 24 heures.', { ref: REFS.HENNE_NOTICE }),
    P('Pas de décoloration par-dessus une couleur végétale sans en parler à la Maison : c’est déconseillé.', { ref: REFS.HENNE_NOTICE }),
    P('Rougeur, démangeaison ou gonflement dans les jours qui suivent : rincer et consulter.', { ref: REFS.REACTION_AUX_COLORANTS }),
  ],
  suivi: [
    C(`Durée au catalogue : ${cat_.dureeParLongueur(id)}.`),
    C('Compris : le DÀNDÀN™ post couleur, la carte colorimétrique personnelle, le styling signature de sortie.'),
    SUITE_D_APRES_COULEUR,
    NOTER_LA_FICHE,
    POSER_LA_SUITE,
  ],
});

let cat_;

export default (cat) => {
  cat_ = cat;
  return [
    vegetale('sv-atl-iii-cou-c', 'YÈKPÈ™ Couleur · La Révélation Végétale', [C('Remettre à la cliente sa carte colorimétrique personnelle.')]),
    vegetale('sv-atl-iii-cou-l', 'YÈKPÈ™ Couleur', [C('Remettre à la cliente sa carte colorimétrique personnelle.', { v: 'Cette prestation et « YÈKPÈ™ Couleur · La Révélation Végétale » portent la même description, à deux prix. À dire : ce qui les distingue.' })]),

    fiche('sv-atl-iii-ecl-c', 'YÈKPÈ™ Éclat · Le Raviveur de Couleur', {
      objectif: [
        C('Un rappel de couleur végétale entre deux colorations : henné et plantes, sans ammoniaque, sur une couleur déjà posée. Il ravive le ton et referme la cuticule.'),
      ],
      public: [
        C('La cliente dont la couleur végétale est déjà posée et commence à ternir.'),
        M('Les Protocoles de la Maison le posent à J+56 : « la couleur ternit vers la sixième semaine ».'),
        P('Enfant, ou déficit en G6PD (favisme) connu : le henné est à éviter.', { ref: REFS.HENNE_G6PD, v: 'À décider par la Maison, comme pour YÈKPÈ™ Couleur.' }),
      ],
      produits: [
        L('La pâte de la teinte déjà posée (Noir Ébène, Brun Chocolat ou Roux Feu).', { v: 'À confirmer : le raviveur emploie-t-il la même pâte, en pose plus courte, ou une préparation à part ?' }),
        L('Fixateur Acide Post-Couleur.', { d: 'CLR-FIX' }),
        L('Gants obligatoires.'),
      ],
      arrivee: [
        P('Relire sur sa fiche la teinte posée, sa date, et son test patch.'),
        REGARD_AVANT,
        CUIR_CHEVELU_SAIN,
      ],
      etapes: [
        L('Préparer la pâte : eau à 35 °C, jamais plus de 38 °C ; l’appliquer dans les 30 minutes.'),
        P('Appliquer lock par lock, en pâte lisse, sans surcharger.', { ref: REFS.HENNE_SUR_LOCKS }),
        C('Temps de pose du raviveur.', { v: 'À fixer : il n’est écrit nulle part.' }),
        P('Rincer à l’eau tiède jusqu’à ce que l’eau soit claire, en pressant chaque lock.', { ref: REFS.HENNE_NOTICE }),
        L('Fixateur Acide Post-Couleur, puis rinçage à l’eau froide pure.', { d: '5 minutes' }),
        C('DÀNDÀN™ post couleur : compris, voir sa fiche.'),
        SECHAGE,
        C('Styling de sortie.'),
      ],
      conseils: [
        P('Pas de shampoing pendant 24 heures.', { ref: REFS.HENNE_NOTICE }),
        L('Le ton finit de se révéler dans les 48 heures.'),
      ],
      suivi: [
        C(`Durée au catalogue : ${cat.duree('sv-atl-iii-ecl-c')}.`),
        C('Compris : le DÀNDÀN™ post couleur et le styling de sortie.'),
        NOTER_LA_FICHE,
      ],
    }),

    fiche('sv-atl-iii-lum-c', 'YÈKPÈ™ Lumière · La Brillance Signature', {
      objectif: [
        C('Lisser la cuticule pour un effet miroir : protéines de soie, finition à l’huile. Tenue de 3 à 4 semaines.'),
      ],
      public: [
        C('Les locks ternes, avec ou sans couleur.'),
        C('Revient chaque mois dans le cycle YÈKPÈ™ × 3.'),
      ],
      produits: [
        C('Soin aux protéines de soie, huile de finition.', { v: 'Références à inscrire : le Laboratoire n’a pas de formule au nom de YÈKPÈ™ Lumière.' }),
      ],
      arrivee: [
        REGARD_AVANT,
        P('Locks propres avant le soin.'),
        P('Demander la date du dernier soin protéiné : trop rapprochés, ils rendent la fibre raide et cassante.', { ref: REFS.EXCES_DE_PROTEINES }),
      ],
      etapes: [
        C('Appliquer le soin aux protéines de soie sur les longueurs, lock par lock.'),
        C('Temps de pose.', { v: 'À fixer.' }),
        P('Rincer jusqu’à ce que l’eau soit claire, en pressant les locks.'),
        C('Séchage, compris.'),
        C('Finition à l’huile, en petite quantité.'),
        C('Styling personnalisé, compris.'),
      ],
      conseils: [
        C('La brillance tient 3 à 4 semaines.'),
        P('Peu d’huile à la maison : l’excès ternit et charge la lock.'),
      ],
      suivi: [
        C(`Durée au catalogue : ${cat.duree('sv-atl-iii-lum-c')}.`),
        C('Compris : le séchage et le styling personnalisé.'),
        ...cat.comprisDans('sv-atl-iii-lum-c'),
        NOTER_LA_FICHE,
      ],
    }),

    fiche('sv-dds-col-c', 'YÈKPÈ™ avec votre couleur · couleur apportée', {
      objectif: [
        C('Appliquer la coloration fournie par la cliente. Le geste technique, la protection, le temps de pose et le rinçage restent dus.'),
      ],
      public: [
        C('La cliente qui apporte sa coloration.'),
        P('Coloration d’oxydation : pas avant 16 ans, c’est écrit sur son emballage.', { ref: REFS.ETIQUETTE_EUROPEENNE }),
      ],
      produits: [
        C('La coloration de la cliente, sa notice, son oxydant.'),
        P('Gants, crème ou protection du contour du visage.'),
      ],
      arrivee: [
        C('Décharge de responsabilité sur le résultat : signée avant de commencer.'),
        P('Lire la notice avec la cliente : test d’allergie demandé, temps de pose, précautions.'),
        P('Le test d’allergie demandé par la notice a été fait, au moins 48 heures avant, sans réaction.', { ref: REFS.TEST_D_ALLERGIE, v: 'À décider par la Maison : qui fait ce test, quand, et où on le note.' }),
        P('On ne colore pas : éruption sur le visage, cuir chevelu sensible, irrité ou abîmé, réaction passée à une coloration ou à un tatouage au henné noir.', { ref: REFS.ETIQUETTE_EUROPEENNE }),
        P('Demander la date de la dernière couleur ou décoloration.', { ref: REFS.COULEUR_SUR_LOCKS }),
      ],
      etapes: [
        P('Protéger le contour du visage et les vêtements, mettre les gants.'),
        C('Préparer et appliquer la coloration selon sa notice.', { d: 'Selon la notice du produit, jamais au-delà' }),
        P('Rincer jusqu’à ce que l’eau soit claire, en pressant chaque lock : rien ne doit rester dans la lock.'),
        SECHAGE,
      ],
      conseils: [
        P('Rougeur, démangeaison ou gonflement dans les trois jours : rincer et consulter.', { ref: REFS.REACTION_AUX_COLORANTS }),
        P('Proposer la suite d’après couleur : la fibre vient d’être ouverte.'),
      ],
      suivi: [
        C(`Durée au catalogue : ${cat.duree('sv-dds-col-c')}.`),
        SUITE_D_APRES_COULEUR,
        NOTER_LA_FICHE,
      ],
    }),

    fiche('sv-atl-iii-sub-c', 'La Transformation · décoloration et oxydation', {
      objectif: [
        C('La double technique complète : décoloration intégrale à la poudre décolorante, puis coloration d’oxydation complète sur l’ensemble de la chevelure.'),
      ],
      public: [
        C('La cliente qui veut une couleur que le végétal ne donne pas.'),
        P('Pas avant 16 ans : c’est la mention obligatoire des colorants d’oxydation.', { ref: REFS.ETIQUETTE_EUROPEENNE }),
        P('Femme enceinte : les études rassurent, mais elle peut préférer attendre la fin du premier trimestre. Le lui dire, et travailler dans une pièce aérée.', { ref: REFS.COULEUR_ET_GROSSESSE }),
        P('Locks fragiles, amincies ou déjà décolorées récemment : on ne décolore pas.', { ref: REFS.COULEUR_SUR_LOCKS, v: 'Délai à fixer par la Maison entre deux actes chimiques. Repère relevé : rien si une couleur date de moins de 6 à 8 semaines (loctitienne citée par la presse).' }),
      ],
      produits: [
        C('Poudre décolorante et oxydant, de 10 à 40 volumes selon le diagnostic.', { ref: REFS.DECOLORATION_NOTICE, v: 'Marque et notice du décolorant de la Maison : à inscrire. Point à trancher : la notice relevée (Wella Blondor) limite l’oxydant à 6 %, soit 20 volumes, sur le cuir chevelu.' }),
        C('Coloration d’oxydation.', { v: 'Marque et notice : à inscrire. Le stock porte « Revlon Colorsilk ».' }),
        C('Protection du cuir chevelu.', { v: 'Produit à inscrire.' }),
        P('Gants, minuteur.'),
      ],
      arrivee: [
        P('Test d’allergie fait au moins 48 heures avant, noté et signé, sans réaction.', { ref: REFS.TEST_D_ALLERGIE, v: 'À décider par la Maison : qui fait ce test, quand, et où on le note.' }),
        P('On ne fait pas l’acte : éruption sur le visage, cuir chevelu sensible, irrité ou abîmé, réaction passée à une coloration ou à un tatouage au henné noir.', { ref: REFS.ETIQUETTE_EUROPEENNE }),
        REGARD_AVANT,
        P('Demander tout ce qui a été fait aux locks : couleur végétale, défrisage, décoloration, et quand.', { ref: REFS.ACTES_CHIMIQUES }),
        P('Essayer sur une lock avant de traiter toute la tête.', { ref: REFS.COULEUR_SUR_LOCKS }),
      ],
      etapes: [
        C('Protéger le cuir chevelu.'),
        C('Décoloration intégrale, à l’oxydant choisi au diagnostic.', { d: 'Selon la notice du décolorant, jamais au-delà', ref: REFS.DECOLORATION_NOTICE, v: 'Temps de pose maximal à recopier de la notice du produit de la Maison. Repère relevé : 50 minutes au plus (Wella Blondor).' }),
        P('Surveiller sans s’éloigner. Si la cliente dit que ça brûle, on rince tout de suite.'),
        P('Rincer très longuement, en pressant chaque lock : aucun produit ne doit rester au cœur de la lock.'),
        C('Coloration d’oxydation complète.', { d: 'Selon la notice de la coloration' }),
        P('Rincer de nouveau jusqu’à ce que l’eau soit claire, en pressant chaque lock.'),
        SECHAGE,
      ],
      conseils: [
        P('Rougeur, démangeaison ou gonflement dans les trois jours : rincer et consulter.', { ref: REFS.REACTION_AUX_COLORANTS }),
        P('Aucun autre acte chimique d’ici le soin reconstructeur : un seul à la fois.', { ref: REFS.ACTES_CHIMIQUES }),
        P('Manipuler les locks avec douceur : une fibre décolorée casse plus facilement.'),
      ],
      suivi: [
        C(`Durée au catalogue : ${cat.dureeParLongueur('sv-atl-iii-sub-c')}.`),
        C('Compris : la protection du cuir chevelu, et le soin reconstructeur protéiné (GBÌGBÌ™ Protéiné) à 2 semaines.'),
        SUITE_D_APRES_COULEUR,
        NOTER_LA_FICHE,
        POSER_LA_SUITE,
      ],
    }),
  ];
};
