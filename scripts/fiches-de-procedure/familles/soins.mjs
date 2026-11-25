import { C, L, M, P, fiche } from '../outils.mjs';
import { REFS } from '../refs.mjs';
import { REGARD_AVANT, SECHAGE, NOTER_LA_FICHE, BONNET_LA_NUIT, SECHER_A_LA_MAISON, FLACONS_DU_LABORATOIRE, POSER_LA_SUITE } from '../communs.mjs';

/* LES SOINS — hydrater, purifier, reconstruire, vivifier. Le catalogue dit ce
   que chaque soin est et pour qui ; les Protocoles de la Maison disent quand
   il revient ; le Laboratoire donne le bain détox et le masque reconstituant.
   Les compositions exactes du DÀNDÀN™ et du VÍVÍVÓ™ ne sont écrites nulle
   part : la fiche le signale. */

const HUILES_ESSENTIELLES = (quoi) => P(`${quoi} contient des huiles essentielles : demander à la cliente si elle y est allergique, si elle est enceinte ou allaite.`, {
  ref: REFS.HE_GROSSESSE,
  v: 'À décider par la Maison : la règle pour la femme enceinte et pour l’enfant. Repères relevés : avis médical d’abord pendant la grossesse (Tisserand Institute) ; ni camphre, ni eucalyptol, ni menthol avant 3 ans (ANSM).',
});

export default (cat) => [
  fiche('sv-plt-10-m', 'DÀNDÀN™ · L’hydratation aux sept huiles', {
    objectif: [
      C('Nourrir les locks en profondeur : huiles végétales légères, huiles essentielles, beurres, puis un masque aux sept huiles, le tout à la vapeur.'),
      C('À la sortie : des locks souples, hydratées et nourries, pendant quelques jours.'),
    ],
    public: [
      C('Cheveux secs, fragiles, sans éclat, ou après une décoloration ou une coloration.'),
      M('Après une couleur, les Protocoles de la Maison le posent à un mois (J+30) ; dans le programme de pousse, à J+28.'),
    ],
    produits: [
      C('Huiles végétales légères, huiles essentielles, beurres.', { v: 'La liste et les références des produits du DÀNDÀN™ ne sont écrites ni au catalogue ni au Laboratoire : à inscrire.' }),
      C('Le masque aux sept huiles.', { v: 'Les sept huiles : à nommer.' }),
      C('Casque vapeur.'),
    ],
    arrivee: [
      REGARD_AVANT,
      P('Locks propres : sur des locks chargées de résidus, on lave ou on purifie d’abord (WÈWÈ™ + DÀNDÀN™ existe pour cela).'),
      HUILES_ESSENTIELLES('Le DÀNDÀN™'),
    ],
    etapes: [
      C('Huiles végétales légères sur les longueurs, lock par lock.'),
      C('Huiles essentielles et beurres.'),
      C('Masque aux sept huiles.'),
      C('Pose à la vapeur.', { ref: REFS.MASQUE, v: 'Temps sous vapeur : à fixer par la Maison. Repère relevé : 20 à 30 minutes pour un masque (dermatologue citée par Healthline).' }),
      P('Rincer ou non, et comment.', { v: 'À écrire : un soin gras mal rincé laisse des résidus dans la lock.' }),
      SECHAGE,
    ],
    conseils: [
      C('L’effet tient quelques jours.'),
      BONNET_LA_NUIT,
      P('À la maison, peu d’huile et jamais de cire ni de crème épaisse : ce qui reste dans la lock devient résidu.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-plt-10-m')}.`),
      ...cat.comprisDans('sv-plt-10-m'),
      C('Compris aussi dans les créations VÈKPÈ™ et les couleurs YÈKPÈ™, le jour même.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-10-l', 'DÀNDÀN™ Léger · L’hydratation douce', {
    objectif: [
      C('Hydrater et nourrir les locks tout en douceur, avec une sélection d’huiles.'),
      C('À la sortie : des locks souples, hydratées et nourries, pendant quelques jours.'),
    ],
    public: [C('Cheveux secs, fragiles, sans éclat, ou après une décoloration ou une coloration.')],
    produits: [C('Une sélection d’huiles.', { v: 'Lesquelles, et ce qui distingue le Léger du DÀNDÀN™ aux sept huiles (pas de masque ? pas de vapeur ?) : à écrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Locks propres avant le soin.'),
      HUILES_ESSENTIELLES('Si la sélection'),
    ],
    etapes: [
      C('Appliquer la sélection d’huiles sur les longueurs, lock par lock.', { v: 'Temps de pose, vapeur ou non, rinçage ou non : à écrire.' }),
      SECHAGE,
    ],
    conseils: [
      C('L’effet tient quelques jours.'),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-10-l')}.`),
      ...cat.comprisDans('sv-plt-10-l'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-20-c', 'WÈWÈ™ · Détox & Purification', {
    objectif: [
      C('Remettre les locks et le cuir chevelu à neutre : aller chercher ce qui s’est installé en profondeur (résidus, poussière, dépôts) et l’éliminer.'),
      C('À la sortie : des locks propres, beaucoup moins de résidus blancs, peu ou pas d’odeurs.'),
    ],
    public: [
      C('Résidus et poussière ancrés, depuis peu ou depuis longtemps ; odeurs ; cuir chevelu qui démange.'),
      M('Après une couleur, les Protocoles de la Maison le posent à J+45, « comme avant tout soin réparateur » ; il ferme le programme de pousse à J+84, avant de remesurer.'),
    ],
    produits: [
      L('Bain Détox Pré-Shampoing (bicarbonate, citrate de sodium, huile de neem). Se prépare à la minute, ne se garde pas.', { d: 'SH-PRE-P0', v: 'Le Laboratoire range ce bain au niveau Prestige des lavages. À confirmer : est-ce bien le bain du WÈWÈ™ ?' }),
      L('Shampoing Argileux Prestige : il purifie et neutralise le bain.', { d: 'SH-PRE-P1' }),
      L('Bol de trempage en inox ou en verre, jamais en aluminium avec le bicarbonate. Thermomètre.'),
    ],
    arrivee: [
      REGARD_AVANT,
      P('Cuir chevelu à vif ou blessé : pas de bain détox, il est alcalin et piquerait.'),
      FLACONS_DU_LABORATOIRE,
      P('Demander la date du dernier WÈWÈ™ ou d’une détox faite ailleurs.', { ref: REFS.DETOX, v: 'Fréquence maximale à fixer par la Maison. Repère relevé : 2 à 4 fois par an, jamais plus (blog spécialisé, aucune source médicale).' }),
    ],
    etapes: [
      L('Préparer le bain : eau à 38 °C, poudres entièrement dissoutes, huile de neem en dernier.'),
      L('Immerger les longueurs. Surveiller sans s’éloigner et demander son confort à la cliente toutes les 5 minutes.', { d: '10 à 15 minutes, jamais plus' }),
      L('Rincer abondamment à l’eau tiède. Ne jamais terminer sur le bain seul.'),
      L('Shampoing Argileux Prestige : obligatoire, il neutralise le bain.'),
      P('Rincer jusqu’à ce que l’eau soit claire, en pressant les locks.'),
      SECHAGE,
    ],
    conseils: [
      SECHER_A_LA_MAISON,
      P('Ni cire, ni crème épaisse, ni après-shampoing dans les locks : ce sont eux qui font les résidus.', { ref: REFS.LAVAGE_DES_LOCKS }),
      P('Proposer un DÀNDÀN™ à la suite : la détox assèche.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-20-c')}.`),
      ...cat.comprisDans('sv-plt-20-c'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-30-c', 'VÍVÍVÓ™ · Le Vivifiant', {
    objectif: [
      C('Stimuler la pousse et densifier les zones de faiblesse : ail noir, moringa, gingembre, cannelle, en massage crânien.'),
    ],
    public: [
      C('Les zones de faiblesse, les clientes qui veulent soutenir leur pousse.'),
      C('Pas tant que le cuir chevelu est irrité (c’est ainsi que Le Moment Cuir chevelu l’écarte).'),
      M('Il ouvre le programme de pousse de la Maison : DÀNDÀN™ à J+28, GBÌGBÌ™ à J+56, WÈWÈ™ à J+84, puis on remesure.'),
    ],
    produits: [
      C('Le soin VÍVÍVÓ™ : ail noir, moringa, gingembre, cannelle.', { v: 'Sa formule n’est pas au Laboratoire. À inscrire : sa composition exacte, et sous quelle forme sont le gingembre et la cannelle (poudre, macérat, huile essentielle).' }),
    ],
    arrivee: [
      REGARD_AVANT,
      C('Cuir chevelu irrité : pas de VÍVÍVÓ™ aujourd’hui.'),
      P('Demander à la cliente si elle est enceinte ou allaite.', { ref: REFS.HE_GROSSESSE, v: 'À décider par la Maison. Repère relevé : la fédération IFPA proscrit l’huile essentielle de cannelle écorce pendant la grossesse. Si le VÍVÍVÓ™ en contient, il ne se fait pas sur une femme enceinte.' }),
      P('Enfant : à ne pas faire sans règle écrite.', { ref: REFS.HE_ENFANT, v: 'À décider par la Maison : à partir de quel âge le VÍVÍVÓ™ se fait.' }),
    ],
    etapes: [
      C('Appliquer le soin sur le cuir chevelu, raie par raie.'),
      C('Massage crânien.', { d: '20 minutes' }),
      P('Demander à la cliente ce qu’elle ressent : une chaleur est attendue, une brûlure ou une démangeaison ne l’est pas. On arrête et on rince.'),
      C('Rinçage ou non après le massage.', { v: 'À écrire.' }),
    ],
    conseils: [
      P('Dire ce que le soin peut et ne peut pas : il entretient le cuir chevelu et la densité, il ne change pas la vitesse de pousse.', { ref: REFS.MASSAGE }),
      P('Si le cuir chevelu rougit ou démange dans les heures qui suivent, rincer et nous prévenir.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-30-c')}.`),
      C('Existe en cure de trois séances.'),
      ...cat.comprisDans('sv-plt-30-c'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-30-cur', 'VÍVÍVÓ™ · Cure de trois', {
    objectif: [C('Trois séances de l’activateur de pousse VÍVÍVÓ™.')],
    public: [C('Les clientes du VÍVÍVÓ™ qui s’engagent sur trois séances : voir sa fiche pour qui l’éviter.')],
    produits: [C('Ceux du VÍVÍVÓ™ : voir sa fiche.')],
    arrivee: [
      P('Relire sur la fiche cliente la séance où elle en est, et comment son cuir chevelu a réagi à la précédente.'),
      C('Puis les vérifications du VÍVÍVÓ™ : voir sa fiche.'),
    ],
    etapes: [C('Chaque séance se rend comme un VÍVÍVÓ™ : voir sa fiche.')],
    conseils: [C('Ceux du VÍVÍVÓ™.'), POSER_LA_SUITE],
    suivi: [
      C('Trois séances, à prix fixé.'),
      C('Rythme des trois séances.', { v: 'L’écart entre les séances n’est pas écrit : à fixer.' }),
      M('Il ouvre le programme de pousse de la Maison.'),
    ],
  }),

  fiche('sv-plt-40-m', 'GBÌGBÌ™ · Le Renfort', {
    objectif: [
      C('Le reconstituant de la Maison, en version modulaire : anti-casse, fermeture de fibre, renfort structurel.'),
    ],
    public: [
      C('Locks fragilisées, qui cassent ou s’ouvrent.'),
      M('Après une couleur, les Protocoles de la Maison le posent à deux semaines (J+14) : « la couleur ouvre la cuticule, on la referme avant qu’elle ne casse ». Dans le programme de pousse, à J+56.'),
    ],
    produits: [
      L('Masque Reconstituant & Scellement (kératine, protéines de soie, karité).', { d: 'SH-PRE-P3', v: 'Le Laboratoire écrit ce masque pour le lavage Prestige. À confirmer : est-ce le produit du GBÌGBÌ™ ? Sinon, inscrire le sien.' }),
    ],
    arrivee: [
      REGARD_AVANT,
      FLACONS_DU_LABORATOIRE,
      P('Demander la date du dernier soin protéiné : trop rapprochés, ils rendent la fibre raide et cassante.', { ref: REFS.EXCES_DE_PROTEINES }),
      P('Locks propres avant le soin.'),
    ],
    etapes: [
      C('Appliquer le reconstituant sur les longueurs, lock par lock, en insistant sur les zones qui cassent ou s’ouvrent.'),
      C('Temps de pose.', { v: 'À fixer : le Laboratoire ne le dit pas.' }),
      P('Rincer jusqu’à ce que l’eau soit claire, en pressant les locks.'),
      SECHAGE,
    ],
    conseils: [
      P('Manipuler les locks avec douceur les jours qui suivent : pas de coiffure serrée sur une fibre en reconstruction.'),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-40-m')}.`),
      C('Existe en cure de trois : trois renforts en six semaines.'),
      ...cat.comprisDans('sv-plt-40-m'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-atl-iv-gbp-prot', 'GBÌGBÌ™ Protéiné · Le Soin Reconstructeur post-technique', {
    objectif: [
      C('Un soin protéiné de reconstruction : il referme l’écaille, redonne du corps à la fibre et scelle le travail.'),
    ],
    public: [
      C('Deux semaines après une technique lourde (décoloration, oxydation).'),
      C('Inclus dans La Transformation.'),
    ],
    produits: [
      L('Masque Reconstituant & Scellement (kératine, protéines de soie, karité).', { d: 'SH-PRE-P3', v: 'À confirmer : est-ce le produit du GBÌGBÌ™ Protéiné ? Sinon, inscrire le sien et sa notice.' }),
    ],
    arrivee: [
      REGARD_AVANT,
      P('Relire sur la fiche cliente la technique faite et sa date : le soin se pose deux semaines après.'),
      P('Cuir chevelu encore irrité par la technique : on reporte le soin.'),
      FLACONS_DU_LABORATOIRE,
    ],
    etapes: [
      P('Laver d’abord : un soin protéiné se pose sur une fibre propre.'),
      C('Appliquer le soin protéiné sur les longueurs, lock par lock.'),
      C('Temps de pose.', { v: 'À fixer, d’après la notice du produit retenu.' }),
      P('Rincer jusqu’à ce que l’eau soit claire, en pressant les locks.'),
      SECHAGE,
    ],
    conseils: [
      P('Pas d’autre acte chimique sans en parler à la Maison : un seul à la fois.', { ref: REFS.ACTES_CHIMIQUES }),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-atl-iv-gbp-prot')}.`),
      M('La suite d’après couleur continue : DÀNDÀN™ à un mois, WÈWÈ™ à J+45.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('cwrt1r54mf', 'L’Épure · le nettoyage à l’aiguille', {
    objectif: [
      C('Nettoyer les locks à l’aiguille.', { v: 'Le catalogue n’a pas de description pour L’Épure. À écrire : ce qu’elle retire (peluches, résidus incrustés), et ce qu’elle promet.' }),
    ],
    public: [
      P('Les locks qui portent des peluches ou des résidus visibles que le lavage ne retire pas.'),
      P('Pas sur une lock amincie ou fragile : le travail à l’aiguille l’affine encore.', { ref: REFS.PELUCHES }),
    ],
    produits: [C('Aiguille ou crochet fin, bonne lumière.', { v: 'Outil exact de la Maison : à inscrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Montrer à la cliente, lock en main, ce qui peut partir et ce qui est trop profond pour être retiré sans abîmer.'),
    ],
    etapes: [
      P('Laver d’abord : une partie des résidus part au lavage, et on voit mieux ce qui reste.', { ref: REFS.PELUCHES }),
      P('Retirer les peluches une à une, à la pointe de l’outil, sans traverser la lock ni forcer.', { ref: REFS.PELUCHES }),
      P('S’arrêter sur une lock qui s’ouvre ou s’affine : mieux vaut un résidu qu’une lock trouée.', { ref: REFS.PELUCHES }),
    ],
    conseils: [
      P('Foulard ou bonnet en satin la nuit, serviette en microfibre : ce sont les tissus pelucheux qui chargent les locks.', { ref: REFS.PELUCHES }),
      P('Ni cire ni crème épaisse dans les locks.', { ref: REFS.PELUCHES }),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('cwrt1r54mf')}.`),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-dds-dec', 'WÈWÈ™ avec votre produit · décapant apporté', {
    objectif: [C('Appliquer le shampoing clarifiant ou décapant fourni par la cliente, sur locks longues.')],
    public: [C('La cliente aux locks longues qui apporte son propre clarifiant.')],
    produits: [C('Le shampoing clarifiant ou décapant de la cliente.', { v: 'Que fait-on d’un produit que la Maison juge trop agressif ? À décider.' })],
    arrivee: [
      REGARD_AVANT,
      P('Lire l’étiquette avec la cliente : ce que c’est, son mode d’emploi, son temps de pose, sa date. Lui demander si elle l’a déjà utilisé sans réaction.'),
      P('Cuir chevelu à vif ou blessé : pas de décapant aujourd’hui.'),
    ],
    etapes: [
      P('Mouiller abondamment à l’eau tiède, jusqu’au cœur des locks.'),
      C('Appliquer le produit de la cliente, selon son mode d’emploi.', { d: 'Selon l’étiquette du produit' }),
      P('Rincer jusqu’à ce que l’eau soit claire, en pressant les locks.'),
      SECHAGE,
    ],
    conseils: [SECHER_A_LA_MAISON, P('Proposer un DÀNDÀN™ à la suite : un décapant assèche.')],
    suivi: [C(`Durée au catalogue : ${cat.duree('sv-dds-dec')}.`), NOTER_LA_FICHE],
  }),

  fiche('sv-dds-soi-c', 'WÈWÈ™ avec votre produit · masque ou huile apportés', {
    objectif: [C('Appliquer le soin, le masque ou l’huile fourni par la cliente.')],
    public: [C('La cliente qui apporte son propre soin.')],
    produits: [C('Le soin, le masque ou l’huile de la cliente.', { v: 'Que fait-on d’un produit qui laisse des résidus dans les locks (cire, beurre épais) ? À décider.' })],
    arrivee: [
      REGARD_AVANT,
      P('Lire l’étiquette avec la cliente : ce que c’est, son mode d’emploi, son temps de pose, sa date. Lui demander si elle l’a déjà utilisé sans réaction.'),
      P('Locks propres avant le soin.'),
    ],
    etapes: [
      C('Appliquer le produit de la cliente sur les longueurs, lock par lock, selon son mode d’emploi.', { d: 'Selon l’étiquette du produit' }),
      P('Rincer si le mode d’emploi le demande, jusqu’à ce que l’eau soit claire.'),
      SECHAGE,
    ],
    conseils: [BONNET_LA_NUIT],
    suivi: [C(`Durée au catalogue : ${cat.duree('sv-dds-soi-c')}.`), NOTER_LA_FICHE],
  }),
];
