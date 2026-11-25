import { C, P, fiche } from '../outils.mjs';
import { REFS } from '../refs.mjs';
import { REGARD_AVANT, SECHAGE, NOTER_LA_FICHE, BONNET_LA_NUIT, SANS_TENSION, POSER_LA_SUITE } from '../communs.mjs';

/* MND KIDS, LE STUDIO (cheveu naturel, grands jours) ET LA BEAUTÉ DES MAINS
   ET DES PIEDS. Le catalogue est bref sur ces prestations : la fiche reprend
   ses mots et signale ce qu'il ne dit pas. Les précautions pour l'enfant
   viennent de dermatologues pédiatriques et de l'ANSM ; l'hygiène des mains
   et des pieds, d'organismes de santé au travail. */

const ENFANT_SANS_TENSION = P('Chez l’enfant, on serre moins encore : sections larges, rien qui tire, pas de chignon serré.', { ref: REFS.ENFANT });
const ENFANT_PAUSES = P('Prévoir des pauses, et arrêter si l’enfant a mal : une séance ne se finit pas en forçant.');
const PARENT = P('Le parent reste là pendant le soin. Lui demander ce que l’enfant supporte, et toute allergie connue.');
const SANS_TERPENES = P('Avant 3 ans : aucun produit qui contient du menthol, du camphre ou de l’eucalyptol.', { ref: REFS.HE_ENFANT, v: 'Le stock porte un shampoing mentholé : écrire quels produits de la Maison sont permis aux petits.' });

const OUTILS_PROPRES = P('Outils lavés au savon, puis trempés 10 minutes dans le désinfectant, rincés et rangés dans une boîte fermée. La boîte à UV ne désinfecte pas.', { ref: REFS.ONGLES_OUTILS });
const JETABLES = P('Limes en carton, bâtonnets et cotons : jetés après chaque cliente.', { ref: REFS.ONGLES_OUTILS });
const MAINS = P('Se laver les mains avant et après, et porter des gants.', { ref: REFS.ONGLES_OUTILS });
const CUTICULES = P('Les cuticules se repoussent en douceur : on ne les coupe pas, on ne force pas.', { ref: REFS.ONGLES_AAD });
const PEAU_SAINE = P('Plaie, cloque, piqûre ou peau infectée sur la zone : on ne fait pas le soin aujourd’hui.', { ref: REFS.BAC_DE_PEDICURE });

export default (cat) => [
  /* ── MND Kids ──────────────────────────────────────────────────────── */
  fiche('sv-kids-kloklo', 'KLƆKLƆ™ Kids · Le Souffle · shampoing et lavage', {
    objectif: [C('Un lavage doux, un démêlage patient, un séchage léger.')],
    public: [C('Les enfants (MND Kids).')],
    produits: [
      C('Shampoing doux.', { v: 'Lequel pour les enfants : à inscrire (le Shampoing Doux Essentiel du Laboratoire, sans sulfate ?).' }),
      SANS_TERPENES,
    ],
    arrivee: [PARENT, REGARD_AVANT],
    etapes: [
      P('Mouiller à l’eau tiède, en protégeant ses yeux.'),
      C('Lavage doux.'),
      P('Rincer jusqu’à ce que l’eau soit claire.'),
      C('Démêlage patient.'),
      P('Démêler mouillé, aux doigts ou au peigne à dents larges, des pointes vers la racine.', { ref: REFS.ENFANT_AAD }),
      C('Séchage léger.'),
      P('Pour des locks : sécher complètement, jusqu’au cœur.'),
    ],
    conseils: [
      P('À la maison : coiffures lâches, élastiques gainés, peigne à dents larges sur cheveu mouillé.', { ref: REFS.ENFANT_AAD }),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-kloklo')}.`),
      ...cat.comprisDans('sv-kids-kloklo'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-kids-sinsin', 'SÍNSIN™ Kids · La Reprise', {
    objectif: [C('Le resserrage lock par lock sur une petite tête, le contrôle d’uniformité, le styling de sortie.')],
    public: [C('Les enfants (MND Kids) qui portent des locks.')],
    produits: [C('Outils du resserrage.', { v: 'La méthode de la Maison pour les enfants : à inscrire.' })],
    arrivee: [
      PARENT,
      REGARD_AVANT,
      P('Regarder le contour et les tempes : cheveu clairsemé ou petits boutons, on ne resserre pas là.', { ref: REFS.TRACTION }),
    ],
    etapes: [
      C('Resserrer lock par lock.'),
      ENFANT_SANS_TENSION,
      ENFANT_PAUSES,
      C('Contrôle d’uniformité.'),
      C('Styling de sortie, sans attache serrée.'),
    ],
    conseils: [
      P('Si l’enfant se plaint que ça tire, ou si des petits boutons paraissent au contour : revenir, on desserre.', { ref: REFS.TRACTION }),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-sinsin')}. Au-delà de 250 locks, la reprise demande plus de temps et un autre tarif.`),
      ...cat.comprisDans('sv-kids-sinsin'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-kids-vekpe', 'VÈKPÈ™ Kids · La Première Couronne', {
    objectif: [C('La création de 50 à 120 locks sur un enfant : une pose patiente, avec des pauses prévues.')],
    public: [
      C('Les enfants (MND Kids).'),
      P('Des locks plutôt épaisses : elles pèsent moins sur chaque racine.', { ref: REFS.ENFANT }),
    ],
    produits: [
      C('Le shampoing de préparation.'),
      C('Outils de la création.', { v: 'La méthode de la Maison pour les enfants : à inscrire.' }),
      SANS_TERPENES,
    ],
    arrivee: [
      PARENT,
      P('S’assurer avec le parent que c’est aussi le souhait de l’enfant, et qu’il sait que la séance est longue.'),
      REGARD_AVANT,
    ],
    etapes: [
      C('Shampoing de préparation, compris.'),
      P('Tracer des sections larges.', { ref: REFS.ENFANT }),
      C('Poser les locks, patiemment.'),
      ENFANT_SANS_TENSION,
      C('Les pauses prévues : les tenir, même si l’enfant ne les réclame pas.'),
      C('Styling de sortie, compris, sans attache serrée.'),
      C('Compter les locks posées et l’inscrire sur sa fiche.'),
    ],
    conseils: [
      P('À la maison : ne pas tordre ni resserrer, coiffures lâches, élastiques gainés.', { ref: REFS.ENFANT_AAD }),
      P('Si l’enfant se plaint que ça tire : revenir, on desserre.', { ref: REFS.TRACTION }),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-vekpe')}.`),
      C('Compris : le shampoing de préparation et le styling de sortie.'),
      C('Dans Les Premières Venues : deux Retouches aux semaines 2 et 4, une reprise à 8 semaines.'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-kids-retouche', 'La Retouche (Kids)', {
    objectif: [C('Reprendre ce qui a bougé depuis la pose, racine par racine, sans refaire toute la couronne.')],
    public: [C('Les enfants (MND Kids), dans les semaines qui suivent leur création.')],
    produits: [C('Outils du resserrage.')],
    arrivee: [PARENT, REGARD_AVANT],
    etapes: [
      C('Reprendre, racine par racine, seulement ce qui a bougé.'),
      ENFANT_SANS_TENSION,
      ENFANT_PAUSES,
    ],
    conseils: [P('Si l’enfant se plaint que ça tire : revenir, on desserre.', { ref: REFS.TRACTION })],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-retouche')}.`),
      C('Comprise dans Les Premières Venues, aux semaines 2 et 4.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-kids-gbigbi', 'GBÌGBÌ™ Kids · Le Renfort', {
    objectif: [C('L’anti-casse et la fermeture de fibre, pour une petite couronne.')],
    public: [C('Les enfants (MND Kids).')],
    produits: [
      C('Le soin reconstituant.', { v: 'Le produit du GBÌGBÌ™ Kids, et s’il est le même que celui des adultes : à inscrire.' }),
      SANS_TERPENES,
    ],
    arrivee: [PARENT, REGARD_AVANT, P('Locks propres avant le soin.')],
    etapes: [
      C('Appliquer le soin sur les longueurs, lock par lock.'),
      C('Temps de pose.', { v: 'À fixer.' }),
      P('Rincer jusqu’à ce que l’eau soit claire, en protégeant ses yeux.'),
      SECHAGE,
    ],
    conseils: [BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-gbigbi')}.`),
      ...cat.comprisDans('sv-kids-gbigbi'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-kids-yekpe', 'GBÌGBÌ™ Kids · L’Éclat', {
    objectif: [C('Brillance, parfum, anti-casse et fermeture de fibre : les deux gestes en un, pour une petite couronne.')],
    public: [C('Les enfants (MND Kids).')],
    produits: [
      C('Le soin reconstituant et le soin de brillance.', { v: 'Les produits de L’Éclat, et ce qui lui donne son parfum : à inscrire.' }),
      SANS_TERPENES,
    ],
    arrivee: [
      PARENT,
      P('Demander au parent si l’enfant réagit aux parfums.'),
      REGARD_AVANT,
      P('Locks propres avant le soin.'),
    ],
    etapes: [
      C('Anti-casse et fermeture de fibre : appliquer le soin sur les longueurs, lock par lock.'),
      C('Temps de pose.', { v: 'À fixer.' }),
      P('Rincer jusqu’à ce que l’eau soit claire, en protégeant ses yeux.'),
      SECHAGE,
      C('Brillance et parfum, en finition.'),
    ],
    conseils: [BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-kids-yekpe')}.`),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── RÉVÉLER · Le Cheveu Naturel Libre ─────────────────────────────── */
  fiche('sv-stu-b-eve-c', 'RÉVÉLER · Éveil', {
    objectif: [C('Le lavage, la définition des boucles et le styling du cheveu naturel.')],
    public: [C('Les cheveux naturels, non lockés.')],
    produits: [C('Shampoing, soin, produit de définition des boucles.', { v: 'Références à inscrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Lui demander sa routine et le rendu qu’elle veut.'),
    ],
    etapes: [
      C('Lavage.'),
      P('Démêler mouillé, avec un soin, aux doigts ou au peigne à dents larges, des pointes vers la racine. Jamais à sec.', { ref: REFS.DEMELAGE }),
      C('Définition des boucles, section par section.'),
      C('Styling.'),
      P('Séchage à chaleur douce.'),
    ],
    conseils: [
      P('Laver toutes les 1 à 3 semaines.', { ref: REFS.CHEVEU_AFRO_BAD }),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-stu-b-eve-c')}.`),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-stu-b-cpf-c', 'RÉVÉLER · Coupe et forme', {
    objectif: [C('Structurer, couper les pointes, mettre en forme.')],
    public: [C('Les cheveux naturels, non lockés.')],
    produits: [C('Ciseaux de coupe, peigne.')],
    arrivee: [
      P('S’accorder avec elle sur la forme et sur ce qu’elle accepte de perdre en longueur, miroir en main, avant le premier coup de ciseaux.'),
      REGARD_AVANT,
    ],
    etapes: [
      C('Structuration.'),
      C('Coupe des pointes.'),
      P('Lui montrer la longueur retirée avant d’aller plus loin.'),
      C('Mise en forme.'),
    ],
    conseils: [P('Dormir avec un bonnet en satin : la forme tient mieux et les pointes cassent moins.')],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-stu-b-cpf-c')}.`),
      C('Rythme de coupe conseillé.', { v: 'À fixer par la Maison : aucune source fiable ne le donne.' }),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── CÉLÉBRER · Les Grands Jours ───────────────────────────────────── */
  fiche('sv-stu-c-eve-c', 'CÉLÉBRER · Coiffure d’événement', {
    objectif: [C('La coiffure d’une cérémonie, d’un gala, d’une occasion : chignon ou styling sophistiqué.')],
    public: [C('La cliente qui a un événement.')],
    produits: [C('Épingles, élastiques, produits de finition, ornements.', { v: 'Références à inscrire.' })],
    arrivee: [
      P('Lui demander l’heure et la durée de l’événement, la tenue, et une photo de ce qu’elle veut.'),
      P('Cheveux ou locks propres et secs avant de coiffer.'),
      P('Regarder le contour : sur un contour clairsemé, pas de coiffure qui tire.', { ref: REFS.TRACTION }),
    ],
    etapes: [
      C('Chignon ou styling sophistiqué.'),
      SANS_TENSION,
      P('Lui faire bouger la tête : rien ne doit tirer ni glisser.'),
    ],
    conseils: [
      P('Défaire la coiffure après l’événement : elle n’est pas faite pour être gardée.'),
      P('Si elle tire ou donne mal à la tête, la desserrer sans attendre.', { ref: REFS.TRACTION }),
    ],
    suivi: [C(`Durée au catalogue : ${cat.dureeParLongueur('sv-stu-c-eve-c')}.`), ...cat.comprisDans('sv-stu-c-eve-c')],
  }),

  fiche('sv-stu-c-sik-1-c', 'CÉLÉBRER · Le Grand Jour Essentiel', {
    objectif: [C('La coiffure du jour J, en salon, sans essai préalable.')],
    public: [C('La mariée ou la cliente du grand jour qui n’a pas pris d’essai.')],
    produits: [C('Épingles, élastiques, produits de finition, ornements et voile s’il y en a.', { v: 'Références à inscrire.' })],
    arrivee: [
      P('Il n’y a pas eu d’essai : s’accorder sur la coiffure avant de commencer, photo à l’appui, et redire ce qui est faisable dans le temps prévu.'),
      P('Lui demander l’heure de la cérémonie, la tenue, les ornements.'),
      P('Cheveux ou locks propres et secs.'),
      P('Regarder le contour : sur un contour clairsemé, pas de coiffure qui tire.', { ref: REFS.TRACTION }),
    ],
    etapes: [
      C('Coiffure du jour J.'),
      P('Poser les ornements en dernier, et les lui montrer au miroir.'),
      SANS_TENSION,
      P('Lui faire bouger la tête : la coiffure doit tenir toute la journée sans tirer.'),
    ],
    conseils: [P('Défaire la coiffure le soir même ou le lendemain.')],
    suivi: [C(`Durée au catalogue : ${cat.dureeParLongueur('sv-stu-c-sik-1-c')}.`)],
  }),

  fiche('sv-stu-c-sik-2-c', 'CÉLÉBRER · Le Grand Jour Signature', {
    objectif: [C('Un essai en amont, puis la coiffure du jour J : les deux rendez-vous en salon.')],
    public: [C('La mariée ou la cliente du grand jour qui veut un essai.')],
    produits: [C('Épingles, élastiques, produits de finition, ornements et voile s’il y en a.', { v: 'Références à inscrire.' })],
    arrivee: [
      C('Relire sur sa fiche lequel des deux rendez-vous c’est : l’essai, ou le jour J.'),
      P('Le jour J : relire les photos et les notes de l’essai.'),
      P('Cheveux ou locks propres et secs.'),
      P('Regarder le contour : sur un contour clairsemé, pas de coiffure qui tire.', { ref: REFS.TRACTION }),
    ],
    etapes: [
      C('L’essai : construire la coiffure avec elle, ornements compris.'),
      P('À l’essai : photographier la coiffure sous plusieurs angles et noter chaque étape sur sa fiche.'),
      C('Le jour J : refaire la coiffure validée à l’essai.'),
      SANS_TENSION,
    ],
    conseils: [
      P('Après l’essai : lui dire dans quel état venir le jour J (cheveux lavés la veille, secs).'),
      P('Défaire la coiffure le soir même ou le lendemain.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-stu-c-sik-2-c')}, en 2 séances.`),
      POSER_LA_SUITE,
    ],
  }),

  /* ── Pendant le rituel · mains et pieds ────────────────────────────── */
  fiche('sv-plt-70-man-c', 'Pendant le rituel · manucure', {
    objectif: [C('Le soin des mains : limage, cuticules, pose de vernis.')],
    public: [C('Toute cliente, pendant son rituel.')],
    produits: [
      C('Limes, repousse-cuticules, vernis. Le semi-permanent est en supplément.', { v: 'Références et nom du désinfectant : à inscrire.' }),
      OUTILS_PROPRES,
      JETABLES,
    ],
    arrivee: [
      PEAU_SAINE,
      P('Ongle épaissi, jauni ou qui se décolle : on ne pose rien dessus, et on lui conseille de consulter.', { ref: REFS.ONGLES_AAD }),
      MAINS,
    ],
    etapes: [
      C('Limage.'),
      C('Cuticules.'),
      CUTICULES,
      C('Soin des mains.'),
      C('Pose du vernis.'),
    ],
    conseils: [P('Si une rougeur ou un gonflement paraît autour d’un ongle dans les jours qui suivent : consulter.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-70-man-c')}.`),
      C('Le semi-permanent est en supplément.'),
    ],
  }),

  fiche('sv-plt-70-ped-c', 'Pendant le rituel · pédicure', {
    objectif: [C('Le soin des pieds : bain, gommage, soin, pose de vernis.')],
    public: [
      C('Toute cliente, pendant son rituel.'),
      P('Diabète : pas de bain de pieds, on ne coupe ni cor ni callosité, ongles coupés droits. Dans le doute, on ne fait pas le soin.', { ref: REFS.PIED_DIABETIQUE }),
    ],
    produits: [
      C('Bac, gommage, limes, vernis. Le semi-permanent est en supplément.', { v: 'Références et nom du désinfectant : à inscrire.' }),
      OUTILS_PROPRES,
      JETABLES,
    ],
    arrivee: [
      P('Lui demander si elle est diabétique.', { ref: REFS.PIED_DIABETIQUE }),
      PEAU_SAINE,
      P('Lui demander si elle s’est rasé les jambes dans les dernières 24 heures : si oui, pas de bain.', { ref: REFS.ONGLES_AAD }),
      MAINS,
      P('Le bac a été vidé, savonné et désinfecté 10 minutes après la cliente précédente.', { ref: REFS.BAC_DE_PEDICURE }),
    ],
    etapes: [
      C('Bain.'),
      C('Gommage.'),
      C('Soin des pieds.'),
      P('Couper les ongles droits, sans arrondir les coins.', { ref: REFS.PIED_DIABETIQUE }),
      CUTICULES,
      C('Pose du vernis.'),
      P('Vider, savonner et désinfecter le bac 10 minutes avant la cliente suivante.', { ref: REFS.BAC_DE_PEDICURE }),
    ],
    conseils: [P('Si une rougeur, un gonflement ou une douleur paraît dans les jours qui suivent : consulter.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-70-ped-c')}.`),
      C('Le semi-permanent est en supplément.'),
    ],
  }),

  fiche('sv-plt-70-par', 'Pendant le rituel · manucure et pédicure', {
    objectif: [C('La manucure et la pédicure, réalisées en parallèle d’un long rituel d’Atelier, sans allonger la visite.')],
    public: [C('La cliente d’un long rituel d’Atelier.')],
    produits: [C('Ceux de la manucure et de la pédicure : voir leurs fiches.')],
    arrivee: [
      P('S’accorder avec la personne qui fait le rituel : qui travaille quand, pour que personne ne se gêne.'),
      C('Puis les vérifications de la manucure et de la pédicure : voir leurs fiches.'),
    ],
    etapes: [
      C('Pédicure : voir sa fiche.'),
      C('Manucure : voir sa fiche.'),
      P('Le vernis se pose à un moment où ses mains restent libres le temps du séchage.'),
    ],
    conseils: [C('Ceux de la manucure et de la pédicure.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-70-par')}, en parallèle du rituel.`),
      C('Remise de 20 % sur le soin choisi.'),
    ],
  }),

  fiche('x0ci24g7ya', 'Contour & Finitions MND', {
    objectif: [C('Le contour et les finitions.', { v: 'Le catalogue n’a pas de description pour cette prestation. À écrire : ce qu’elle comprend (tracé du contour, finition des racines, coiffage ?).' })],
    public: [C('À préciser avec la description.', { v: 'Pour qui : à écrire.' })],
    produits: [C('Outils du contour.', { v: 'Lesquels (tondeuse, rasoir, gel de contour) : à inscrire. Le stock porte un gel « Edge control ».' })],
    arrivee: [
      REGARD_AVANT,
      P('Regarder le contour : cheveu clairsemé, irritation, petits boutons. Sur un contour abîmé, on ne travaille pas.', { ref: REFS.TRACTION }),
    ],
    etapes: [C('Travailler le contour, puis les finitions.', { v: 'Les gestes : à décrire par la Maison.' })],
    conseils: [P('Ne pas tirer le contour vers l’arrière en coiffure serrée : c’est la zone la plus fragile.', { ref: REFS.TRACTION })],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('x0ci24g7ya')}.`),
      NOTER_LA_FICHE,
    ],
  }),
];
