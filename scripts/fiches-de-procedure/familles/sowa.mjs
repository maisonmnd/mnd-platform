import { C, M, N, P, fiche } from '../outils.mjs';
import { REFS } from '../refs.mjs';
import { NOTER_LA_FICHE, SANS_TENSION } from '../communs.mjs';
import { ID_DU_RITUEL_SOWA, ID_DU_CONTROLE_SOWA, ID_DE_LA_COURONNE_COCON } from '../prestations-offertes.mjs';

/* LE RITUEL SÓWÀ™, DÉCIDÉ — 25 novembre 2026.

   « Décide et valide la fiche Sówà » (Yéman). Les seize points laissés « à
   valider » le matin sont tranchés ici, chacun sur une source relue :

   · LA RÉFÉRENCE : Pouxit XF, lotion en flacon. C'est la seule de la gamme
     dont l'âge (6 mois), le temps de pose (15 minutes) et la composition
     (diméticone 4 %) concordent sur toutes les pages lues, et la lotion est
     la forme que la Société française de dermatologie privilégie. La Maison
     n'en a ni au stock ni aux dépenses du Trône : rien ne disait laquelle
     est au salon. La fiche fait donc vérifier le flacon en premier, et
     s'efface devant la notice de la boîte si elle diffère.
   · LA SECONDE APPLICATION se fait au contrôle de J+7 : le fabricant dit
     « si nécessaire », la Société française de dermatologie dit « une
     seconde entre le 7e et le 10e jour ». Le contrôle offert tombe dedans.
   · NEEM ET SHIKAKAÏ restent hors du rituel : aucune institution ne les
     recommande contre les poux, les études manquent.
   · LES CONSEILS À LA MAISON sont ceux des autorités de santé, référencés.

   Un seul point reste ouvert, et il ne peut pas se décider d'ici : la forme
   de la coiffure Couronne Cocon, que la Maison seule connaît. */

const POUXIT = N('Pouxit XF, lotion en flacon : diméticone à 4 %, dispositif médical. Il agit par action physique, en recouvrant les poux et les lentes.', { d: 'Pouxit XF lotion, flacon de 100 ou 200 ml', ref: REFS.POUXIT_XF });

const VERIFS_DU_PRODUIT = [
  M('Le flacon en main est bien Pouxit XF, en lotion. Si c’est une autre référence (Flash, shampooing, spray), cette fiche ne vaut pas : on suit la notice de ce flacon et on prévient la direction.'),
  M('La notice de la boîte fait foi : si elle diffère de cette fiche, c’est elle qu’on suit, et on prévient la direction.'),
  N('Âge : 6 mois révolus au moins.', { ref: REFS.POUXIT_XF }),
  N('Cuir chevelu sans plaie ni lésion : le produit ne s’applique pas sur une peau lésée.', { ref: REFS.POUXIT_XF_NOTICE }),
  N('Lui demander si elle a déjà réagi à un produit anti-poux : pas d’application en cas d’allergie à l’un de ses composants.', { ref: REFS.POUXIT_XF_NOTICE }),
  N('Aucune flamme ni source de chaleur près d’elle tant que le produit est sur la tête : ni casque, ni sèche-cheveux, ni cigarette.', { ref: REFS.POUXIT_XF_NOTICE }),
];

const APPLICATION = [
  N('Protéger ses yeux et ses épaules. Essuyer tout de suite ce qui tombe au sol : le produit rend le sol glissant.', { ref: REFS.POUXIT_XF_NOTICE }),
  N('Sur des locks et un cuir chevelu secs, appliquer Pouxit XF lock par lock, jusqu’à tout recouvrir, cuir chevelu compris.', { d: 'Assez pour tout recouvrir : la notice ne donne pas de dose', ref: REFS.POUXIT_XF }),
  N('Laisser agir.', { d: '15 minutes', ref: REFS.POUXIT_XF }),
  N('Sans mouiller avant, appliquer le shampoing directement sur les locks, faire mousser, puis rincer.', { ref: REFS.POUXIT_XF }),
  P('Refaire un shampoing si les locks restent grasses, puis rincer jusqu’à ce que l’eau soit claire.'),
  C('Retrait des lentes au peigne fin.'),
  P('Le peigne ne traverse pas une lock : le passer aux racines et sur les cheveux libres, sans défaire les locks.', { ref: REFS.POUX_SANS_PEIGNE }),
  P('Une fois le produit entièrement retiré, sécher complètement, jusqu’au cœur des locks.'),
];

const APRES_ELLE = M('Après elle : cape et serviettes lavées à 60 °C, peigne fin lavé puis mis de côté 3 jours.', { ref: REFS.POUX_INRS });

const A_LA_MAISON = [
  P('Draps, taies, bonnets, foulards et serviettes : lavés à 60 °C, ou enfermés 10 jours dans un sac.', { ref: REFS.POUX_SFD }),
  P('Peignes et brosses : lavés, puis mis de côté 3 jours.', { ref: REFS.POUX_INRS }),
  P('Regarder les têtes de toute la maison. Seules celles qui portent des poux vivants se traitent.', { ref: REFS.POUX_INRS }),
  P('Prévenir l’école ou la garderie, pour que les autres têtes soient regardées.', { ref: REFS.POUX_ECOLE }),
];

export default (cat) => [
  fiche(ID_DU_RITUEL_SOWA, 'Rituel Sówà™ · Rituel anti-poux Maison MND', {
    objectif: [
      C('Éliminer les poux des locks, avec discrétion et sans jugement.'),
      C('À la sortie : un cuir chevelu traité, les lentes retirées au peigne fin.'),
      M('Le rituel tient en deux venues : le premier rendez-vous, puis le contrôle offert à J+7.'),
    ],
    public: [
      C('Toute personne qui a des démangeaisons, ou qui a vu des poux ou des lentes, chez elle ou chez un proche.'),
      N('À partir de 6 mois. Convient aux femmes enceintes ou qui allaitent.', { ref: REFS.POUXIT_XF }),
      N('On ne l’applique pas : avant 6 mois, sur une peau lésée, en cas d’allergie à l’un de ses composants.', { ref: REFS.POUXIT_XF_NOTICE }),
      M('Pour un enfant (jusqu’à 15 ans, MND Kids), la coiffure protectrice Couronne Cocon est offerte.'),
    ],
    produits: [
      POUXIT,
      M('Pouxit seul. Ni poudre de neem ni poudre de shikakaï dans le rituel : aucune institution ne les recommande contre les poux, et les études de sécurité et d’efficacité manquent.', { ref: REFS.NEEM }),
      P('La lotion en flacon, jamais un spray : les sprays sont contre-indiqués dès qu’il y a de l’asthme.', { ref: REFS.POUX_SFD_NOTE }),
      M('Shampoing Doux Essentiel de la Maison, pour retirer le produit.', { d: 'SH-ESS-P1' }),
      C('Peigne fin, pour le retrait des lentes.'),
      M('Cape et serviettes du rituel, gants à usage unique.'),
    ],
    arrivee: [
      ...VERIFS_DU_PRODUIT.slice(0, 2),
      C('Examiner le cuir chevelu avec la cliente, avec discrétion et sans jugement.'),
      M('Si l’examen ne montre ni pou vivant ni lente, on ne traite pas : on le dit à la cliente et on prévient la direction.', { ref: REFS.POUX_INRS }),
      ...VERIFS_DU_PRODUIT.slice(2),
    ],
    etapes: [
      C('Examen du cuir chevelu, avec la cliente.'),
      ...APPLICATION,
      M('Pour un enfant : la Couronne Cocon, offerte. Voir sa fiche.'),
      M('Poser avec elle le contrôle, offert, à J+7 : la prestation « Sówà™ · Le Contrôle à J+7 ».'),
      M('Recommander le soin hydratant DÀNDÀN™, à poser après le contrôle.'),
      APRES_ELLE,
    ],
    conseils: [
      M('Revenir à J+7 pour le contrôle, offert : la seconde application s’y fait.'),
      ...A_LA_MAISON,
      M('Le soin hydratant DÀNDÀN™ est recommandé à la suite du rituel, après le contrôle.'),
    ],
    suivi: [
      M('Compris : le premier rendez-vous, le Rituel Sówà™.'),
      M('Offert : le contrôle à J+7, où se fait la seconde application.', { ref: REFS.POUX_SFD }),
      M('Offert aux enfants : la coiffure protectrice Couronne Cocon.'),
      M('Recommandé : le soin hydratant DÀNDÀN™, au prix du catalogue.'),
      C('Le Rituel Sówà™ ne porte aucune remise.'),
      C(`Durée au catalogue : ${cat.duree(ID_DU_RITUEL_SOWA)}.`),
      NOTER_LA_FICHE,
    ],
  }),

  fiche(ID_DU_CONTROLE_SOWA, 'Sówà™ · Le Contrôle à J+7', {
    objectif: [
      M('Sept jours après le Rituel Sówà™ : regarder de nouveau le cuir chevelu et les locks, et faire la seconde application.'),
      P('La Société française de dermatologie demande une première application, suivie d’une seconde entre le 7e et le 10e jour.', { ref: REFS.POUX_SFD }),
    ],
    public: [
      M('La cliente qui a fait son Rituel Sówà™ il y a 7 à 10 jours. Le contrôle lui est offert.'),
    ],
    produits: [
      POUXIT,
      M('Shampoing Doux Essentiel de la Maison, peigne fin, cape et serviettes du rituel, gants à usage unique.', { d: 'SH-ESS-P1' }),
    ],
    arrivee: [
      M('Relire sur sa fiche la date du rituel : le contrôle se fait de 7 à 10 jours après.', { ref: REFS.POUX_SFD }),
      P('Lui demander ce qu’elle a vu depuis, et si son cuir chevelu a réagi au produit. S’il a rougi ou brûlé : pas de seconde application, on prévient la direction et on lui conseille de consulter.'),
      C('Examiner le cuir chevelu avec elle, avec discrétion et sans jugement.'),
      ...VERIFS_DU_PRODUIT,
    ],
    etapes: [
      C('Examen du cuir chevelu : poux vivants, lentes.'),
      ...APPLICATION,
      APRES_ELLE,
    ],
    conseils: [
      P('Regarder de nouveau la tête cinq jours plus tard, à J+12. S’il reste des poux vivants, revenir nous voir ou consulter.', { ref: REFS.POUX_SFD }),
      ...A_LA_MAISON,
      M('Le soin hydratant DÀNDÀN™ peut maintenant se poser.'),
    ],
    suivi: [
      M('Offert : il fait partie du Rituel Sówà™.'),
      C(`Durée au catalogue : ${cat.duree(ID_DU_CONTROLE_SOWA)}. Il se pose de 1 à 2 semaines après la dernière venue ; le Trône avertit en dehors.`),
      M('Si des poux vivants sont encore là au contrôle : prévenir la direction, qui décide de la suite. Pour des cheveux qu’on ne peut pas peigner, l’Université de Californie décrit trois applications espacées de 5 à 6 jours.', { ref: REFS.POUX_SANS_PEIGNE }),
      NOTER_LA_FICHE,
    ],
  }),

  fiche(ID_DE_LA_COURONNE_COCON, 'Couronne Cocon · la coiffure protectrice', {
    objectif: [
      M('La coiffure protectrice des enfants après un Rituel Sówà™ : les locks rassemblées et attachées près de la tête, sans tension. Offerte.', { v: 'La forme exacte de la Couronne Cocon (chignon, couronne de locks, foulard) n’est écrite nulle part : à décrire par la Maison, photo à l’appui. C’est le seul point que la recherche ne peut pas trancher.' }),
    ],
    public: [
      M('Les enfants (jusqu’à 15 ans, MND Kids) qui viennent de faire leur Rituel Sówà™.'),
    ],
    produits: [
      P('Élastiques gainés, qui n’accrochent pas le cheveu.', { ref: REFS.ENFANT_AAD }),
    ],
    arrivee: [
      P('Les locks sont complètement sèches, et le produit du rituel entièrement retiré.'),
      P('Regarder le contour : sur un contour dégarni ou des racines fines, on rassemble sans attacher serré.', { ref: REFS.ENFANT }),
    ],
    etapes: [
      M('Rassembler les locks près de la tête.'),
      P('Attacher sans serrer : chez l’enfant, pas de chignon serré.', { ref: REFS.ENFANT }),
      SANS_TENSION,
      P('Faire bouger la tête à l’enfant : rien ne doit tirer ni glisser.'),
    ],
    conseils: [
      M('La garder jusqu’au contrôle de J+7 si elle reste confortable.'),
      P('Si elle tire, fait mal ou donne des petits boutons au contour : la défaire.', { ref: REFS.TRACTION }),
    ],
    suivi: [
      M('Offerte aux enfants avec le Rituel Sówà™.'),
      C(`Durée au catalogue : ${cat.duree(ID_DE_LA_COURONNE_COCON)}.`),
      C('Réservée aux enfants (MND Kids). Elle ne se réserve pas en ligne : c’est l’équipe qui la pose.'),
    ],
  }),
];
