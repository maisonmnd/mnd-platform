import { C, M, P, fiche } from '../outils.mjs';
import { REFS } from '../refs.mjs';
import { REGARD_AVANT, CUIR_CHEVELU_SAIN, SECHAGE, NOTER_LA_FICHE, BONNET_LA_NUIT, SECHER_A_LA_MAISON, SANS_TENSION, POSER_LA_SUITE } from '../communs.mjs';

/* LES LOCKS — le Regard (KÒKÒ™), la Naissance (VÈKPÈ™), les reprises
   (SÍNSIN™), la Renaissance (FÍNFÍN™, ÀLÀLÀ™) et le Dénouement (GBÀTÀ™).

   Le catalogue dit ce que chaque rituel est, pour qui, ce qu'il comprend et
   quand il revient. Il ne dit pas la MÉTHODE de la Maison (crochet, torsion,
   interlocking) : la fiche la laisse « à valider » plutôt que de la supposer.
   Les repères de traction viennent des dermatologues ; les intervalles et les
   durées de pose, de la profession (aucune source médicale ne les chiffre). */

const TRACTION = P('Trop serré se reconnaît : douleur, picotements, petits boutons au contour, cuir chevelu soulevé. Aucun antalgique ne doit être nécessaire après la séance.', { ref: REFS.TRACTION });
const METHODE = (quoi) => C(quoi, { v: 'La méthode de la Maison (crochet, torsion, interlocking) et ses outils ne sont écrits nulle part : à inscrire.' });
const SI_CA_TIRE = P('Si ça tire, fait mal ou donne des petits boutons au contour dans les jours qui suivent : revenir, on desserre. Une traction qui dure fait tomber le cheveu, parfois pour de bon.', { ref: REFS.CHEVEU_AFRO_BAD });

const CALIBRES = [
  ['sv-atl-i-jum', 'VÈKPÈ™ Création Jumbo · La Racine Libre', 'jusqu’à 80 locks larges', 'Le format le plus rapide, idéal pour une première expérience. Crochet ou torsion selon la texture.', []],
  ['sv-atl-i-med', 'VÈKPÈ™ Création Medium · Naissance Classique', 'de 81 à 150 locks', 'L’équilibre entre volume et facilité d’entretien : le choix le plus fréquent.', []],
  ['sv-atl-i-min', 'VÈKPÈ™ Création Mini · La Naissance Fine', 'de 151 à 250 locks', 'Pose de précision, lock par lock : définition élevée, tombé fluide.', ['sinsin']],
  ['sv-atl-i-mic', 'VÈKPÈ™ Création Micro · La Haute Précision', 'de 251 à 350 locks', 'Travail sur 2 jours. Réservé aux clientes diagnostiquées aptes au KÒKÒ™ Origine.', ['gbigbi', 'apte']],
  ['sv-atl-i-nan', 'VÈKPÈ™ Création Nano · La Très Haute Précision', 'de 351 à 450 locks ultra fines', 'Travail sur 2 jours. L’engagement d’entretien est expliqué et validé avant la pose.', ['gbigbi', 'sinsin', 'apte', 'engagement']],
  ['sv-atl-i-pic', 'VÈKPÈ™ Création Pico et Galaxy · Le sommet de la création MND', 'de 451 à 600 locks', 'Le degré le plus fin que la Maison pose. Trois séances de travail, lock par lock, sur diagnostic KÒKÒ™ Origine et engagement d’entretien validé avant la pose.', ['gbigbi', 'sinsin', 'apte', 'engagement']],
];

const creation = (cat, [id, titre, nombre, promesse, plus]) => fiche(id, titre, {
  objectif: [
    C(`La création ${nombre}.`),
    C(promesse),
  ],
  public: [
    C('La cliente qui a fait son KÒKÒ™ Origine : la méthode et le calibre y ont été choisis.'),
    ...(plus.includes('apte') ? [C('Seulement si le KÒKÒ™ Origine l’a dite apte à ce calibre.')] : []),
    ...(plus.includes('engagement') ? [C('Seulement si l’engagement d’entretien lui a été expliqué et qu’elle l’a validé.')] : []),
    P('Plus les locks sont fines et longues, plus chaque racine porte de poids : le dire avant un calibre fin, surtout si le contour est déjà clairsemé.', { ref: REFS.TRACTION }),
  ],
  produits: [
    METHODE('Outils de la création, selon la méthode retenue au KÒKÒ™ Origine.'),
    C('Les produits de la préparation (Prélude) et du DÀNDÀN™ post pose : voir leurs fiches.'),
  ],
  arrivee: [
    C('Relire le KÒKÒ™ Origine sur sa fiche : méthode, calibre, nombre de locks, quadrillage.'),
    REGARD_AVANT,
    CUIR_CHEVELU_SAIN,
    P('Lui demander tout acte chimique récent (défrisage, couleur, décoloration) : un cheveu fragilisé ne supporte pas la même tension.', { ref: REFS.CHEVEU_AFRO_BAD }),
    P('Lui redire les étapes de la journée et les pauses prévues.'),
  ],
  etapes: [
    C('Préparation : le Prélude, si nécessaire.'),
    P('Tracer le quadrillage décidé au KÒKÒ™ Origine, section par section, et le lui montrer avant de poser.'),
    METHODE('Poser les locks, lock par lock.'),
    SANS_TENSION,
    TRACTION,
    C(`DÀNDÀN™ post pose${plus.includes('gbigbi') ? ' et GBÌGBÌ™ post pose' : ''} : compris, voir ${plus.includes('gbigbi') ? 'leurs fiches' : 'sa fiche'}.`),
    C('La sortie, comprise.'),
    C('Compter les locks posées et l’inscrire sur sa fiche.'),
  ],
  conseils: [
    P('Lui dire à quoi s’attendre : des locks qui prennent visiblement en 3 à 6 mois, mûres en 12 à 24 mois.', { ref: REFS.CREATION }),
    C('Premier lavage.', { ref: REFS.METHODES, v: 'À fixer par la Maison selon sa méthode. Repères relevés : 4 à 6 semaines après des vanilles ou des torsions, tout de suite après un crochet ou un interlocking (blogs spécialisés).' }),
    BONNET_LA_NUIT,
    SI_CA_TIRE,
    P('Ne pas tordre ni resserrer soi-même entre deux venues.'),
  ],
  suivi: [
    C(`Durée au catalogue : ${cat.duree(id)}${(cat.sv(id).sessions ?? 1) > 1 ? `, en ${cat.sv(id).sessions} séances` : ''}.`),
    C('Compris : la préparation, le DÀNDÀN™ post pose, la sortie.'),
    C('La Retouche à 4 semaines, posée d’office.'),
    ...(plus.includes('sinsin') ? [C('Un SÍNSIN™ Essentiel offert à 6 semaines.')] : []),
    ...cat.comprisDans(id),
    NOTER_LA_FICHE,
    POSER_LA_SUITE,
  ],
});

export default (cat) => [
  /* ── KÒKÒ™ · Le Regard ─────────────────────────────────────────────── */
  fiche('sv-koko-ori', 'KÒKÒ™ Origine · Première couronne', {
    objectif: [
      C('Le tout premier rendez-vous, avant la création : lire le cheveu et le cuir chevelu, choisir la méthode, projeter la future couronne.'),
    ],
    public: [C('Toute personne qui veut créer ses locks à la Maison. C’est le point de départ obligé d’une création.')],
    produits: [C('Aucun produit. La fiche cliente du Trône, un peigne à queue, un miroir.')],
    arrivee: [
      P('La recevoir à l’écart, cheveux détachés, sans rien avoir appliqué.'),
    ],
    etapes: [
      C('Analyser la texture, le cuir chevelu, la morphologie.'),
      C('Reprendre avec elle son historique capillaire.'),
      P('Lui demander la date du dernier défrisage, de la dernière couleur ou décoloration.', { ref: REFS.CHEVEU_AFRO_BAD }),
      P('Regarder le contour et les tempes : un contour déjà clairsemé oriente vers des locks plus épaisses.', { ref: REFS.TRACTION }),
      C('Choisir avec elle la méthode et le calibre, et projeter la couronne : nombre de locks, quadrillage, tombé.'),
      P('Lui annoncer les phases : des locks qui prennent visiblement en 3 à 6 mois, mûres en 12 à 24 mois, et le rythme d’entretien que son calibre demande.', { ref: REFS.CREATION }),
      C('Si elle hésite entre deux calibres : proposer VÈKPÈ™ L’Essai, 2 à 3 locks témoins portées quelques jours.'),
      C('Tout inscrire sur sa fiche : texture, cuir chevelu, méthode, calibre, et si elle est apte aux calibres fins.'),
    ],
    conseils: [
      P('D’ici la création : ni défrisage ni décoloration, et un cheveu propre et démêlé le jour venu.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-koko-ori')}.`),
      C('Le VÍVÍVÓ™ est offert avec ce KÒKÒ™ pour le calibre Jumbo.'),
      C('Les calibres Micro, Nano, Pico et Galaxy ne se posent que sur une cliente dite apte ici.'),
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-koko-sui', 'KÒKÒ™ Accueil · pour des locks nées ailleurs', {
    objectif: [
      C('Accueillir des locks créées ailleurs : évaluer leur calibre, leur densité et leur état, ouvrir la fiche cliente MND, orienter vers l’Atelier approprié.'),
      C('Pour des locks en souffrance (collées, cassantes, après chimie, longue absence) : un bilan écrit, un pronostic, un protocole rédigé.'),
    ],
    public: [
      C('Toute cliente dont les locks n’ont pas été créées à la Maison.'),
      C('Obligatoire avant tout devis de restauration (FÍNFÍN™, ÀLÀLÀ™).'),
    ],
    produits: [C('Aucun produit. La fiche cliente du Trône, un miroir, de quoi photographier.')],
    arrivee: [P('La recevoir à l’écart, locks détachées.')],
    etapes: [
      C('Évaluer le calibre, la densité et l’état des locks.'),
      P('Lui demander comment elles ont été créées et entretenues : méthode, rythme, produits, actes chimiques.'),
      P('Chercher, lock en main : racines amincies, locks collées entre elles, locks ouvertes ou cassantes, résidus, odeur.', { ref: REFS.INTERLOCKING }),
      P('Regarder le contour et les tempes : c’est là que la traction se voit d’abord.', { ref: REFS.TRACTION }),
      C('Ouvrir sa fiche cliente : comptage, calibre, état.'),
      C('L’orienter vers l’Atelier approprié.'),
      C('Locks en souffrance : rédiger le bilan, le pronostic et le protocole.'),
    ],
    conseils: [
      P('Lui dire sans détour ce qui se rattrape et ce qui ne se rattrape pas, et en combien de venues.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-koko-sui')}.`),
      C('Le devis de restauration ne se fait qu’après ce bilan.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-koko-bilan', 'KÒKÒ™ Bilan · la lecture de votre couronne', {
    objectif: [C('Lire la couronne : mèche témoin, longueur, cuir chevelu, et dire le soin dont elle a besoin.')],
    public: [
      C('La cliente de la Maison qui veut savoir où en est sa couronne.'),
      M('Il ferme le programme de pousse : après le WÈWÈ™ de J+84, on remesure, comptage et mèche témoin.'),
    ],
    produits: [C('Aucun produit. La fiche cliente du Trône, de quoi mesurer la mèche témoin.')],
    arrivee: [P('Relire sur sa fiche le bilan précédent : la longueur de la mèche témoin, le comptage, ce qui avait été conseillé.')],
    etapes: [
      C('Mesurer la mèche témoin, la même qu’au bilan précédent.'),
      C('Mesurer la longueur.'),
      C('Regarder le cuir chevelu.'),
      P('Regarder les racines et les pointes : amincissement, casse, locks qui s’ouvrent.'),
      C('Lui dire le soin dont sa couronne a besoin.'),
      C('Inscrire les mesures sur sa fiche, à côté des précédentes.'),
    ],
    conseils: [P('Lui montrer l’écart avec le bilan précédent : ce qui a poussé, et ce qui a été gardé.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-koko-bilan')}.`),
      POSER_LA_SUITE,
    ],
  }),

  fiche('svc-doto-conseil', 'KÒKÒ™ Conseil · enfant, cheveu naturel', {
    objectif: [C('Un temps pour lire la couronne et tracer sa route : routine, gestes à la maison, produits justes. Le conseil qui prolonge le rituel entre deux venues.')],
    public: [C('Les enfants, et les cheveux naturels.')],
    produits: [C('Aucun produit.')],
    arrivee: [P('Pour un enfant : le recevoir avec le parent qui s’occupe de ses cheveux, c’est lui qui fera les gestes.')],
    etapes: [
      C('Lire la couronne : cheveu, cuir chevelu.'),
      P('Demander la routine d’aujourd’hui : lavage, démêlage, coiffures, produits.'),
      C('Tracer la routine : les gestes à la maison et les produits justes.'),
      P('Montrer les gestes, cheveu en main : démêler mouillé, avec un soin sans rinçage, aux doigts ou au peigne à dents larges, des pointes vers la racine.', { ref: REFS.DEMELAGE }),
      P('Pour un enfant : des coiffures lâches, pas de chignon serré tous les jours, et un temps de repos entre deux coiffures protectrices.', { ref: REFS.ENFANT }),
    ],
    conseils: [P('Lui laisser la routine par écrit.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('svc-doto-conseil')}.`),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── VÈKPÈ™ · La Naissance ─────────────────────────────────────────── */
  ...CALIBRES.map((c) => creation(cat, c)),

  /* ── SÍNSIN™ · Les reprises de racines ─────────────────────────────── */
  fiche('sv-atl-ii-e', 'SÍNSIN™ Essentiel · La Reprise', {
    objectif: [C('Le resserrage seul, net et efficace : diagnostic KÒKÒ™ intégré, resserrage lock par lock, contrôle d’uniformité.')],
    public: [
      C('Toute cliente en entretien. La venue se tient toutes les six semaines.'),
      P('Pas plus souvent que nécessaire : un resserrage trop fréquent ou trop serré amincit la racine et casse la lock.', { ref: REFS.RETWIST }),
    ],
    produits: [METHODE('Outils du resserrage.')],
    arrivee: [
      C('Diagnostic KÒKÒ™ : cuir chevelu, racines, état des locks.'),
      P('Mesurer la repousse : trop courte, on ne resserre pas.', { ref: REFS.INTERLOCKING }),
      P('Repérer les racines amincies : on ne les resserre pas comme les autres, on le dit et on le note.', { ref: REFS.INTERLOCKING }),
      P('Locks propres et sèches avant de resserrer : sinon, le lavage d’abord.'),
    ],
    etapes: [
      METHODE('Resserrer lock par lock, en suivant le quadrillage.'),
      SANS_TENSION,
      TRACTION,
      C('Contrôle d’uniformité : toutes les racines reprises, aucune oubliée, aucune fusionnée avec sa voisine.'),
      C('Styling de sortie, compris : chignon, demi-attache ou détaché structuré.'),
      C('Mise à jour de la fiche cliente.'),
    ],
    conseils: [
      SI_CA_TIRE,
      P('Ne pas tordre ni resserrer soi-même entre deux venues.'),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-atl-ii-e')}.`),
      C('Compris : le styling de sortie.'),
      ...cat.comprisDans('sv-atl-ii-e'),
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-atl-ii-l', 'SÍNSIN™ Signature · La Reprise Longue Durée', {
    objectif: [C('Une reprise plus minutieuse, au scellement renforcé, à la tenue prolongée : elle espace les visites.')],
    public: [
      C('La cliente qui veut espacer ses venues.'),
      P('Pas sur des racines amincies : un scellement renforcé y ajoute de la contrainte.', { ref: REFS.INTERLOCKING }),
    ],
    produits: [METHODE('Outils du resserrage et du scellement renforcé.')],
    arrivee: [
      C('Diagnostic KÒKÒ™ : cuir chevelu, racines, état des locks.'),
      P('Mesurer la repousse et repérer les racines amincies.', { ref: REFS.INTERLOCKING }),
      P('Locks propres et sèches avant de resserrer.'),
    ],
    etapes: [
      METHODE('Resserrer lock par lock, plus minutieusement que l’Essentiel.'),
      C('Scellement renforcé.', { v: 'Ce qui distingue le scellement renforcé du resserrage Essentiel : à décrire.' }),
      SANS_TENSION,
      TRACTION,
      C('Contrôle d’uniformité.'),
      C('Styling de sortie, compris.'),
      C('Mise à jour de la fiche cliente.'),
    ],
    conseils: [
      C('La tenue est prolongée : la prochaine venue peut s’espacer.', { v: 'De combien : à dire par la Maison.' }),
      SI_CA_TIRE,
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-atl-ii-l')}.`),
      C('Compris : le styling de sortie.'),
      ...cat.comprisDans('sv-atl-ii-l'),
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-retouches-post-reprise', 'La Retouche · contours et racines', {
    objectif: [C('Reprendre le contour et les tempes seuls, entre deux resserrages complets.')],
    public: [
      C('La cliente dont le contour a bougé avant la date de sa reprise.'),
      P('Le contour est la zone la plus exposée à la traction : c’est là qu’on serre le moins.', { ref: REFS.TRACTION }),
    ],
    produits: [METHODE('Outils du resserrage.')],
    arrivee: [
      P('Regarder le contour et les tempes : cheveu clairsemé, petits boutons, racines fines.', { ref: REFS.TRACTION }),
      P('Contour déjà clairsemé : on ne reprend pas, on laisse reposer et on le dit.', { ref: REFS.CHEVEU_AFRO_BAD }),
    ],
    etapes: [
      C('Reprendre le contour et les tempes, lock par lock. Le reste de la tête ne se touche pas.'),
      SANS_TENSION,
    ],
    conseils: [
      P('Ne pas attacher serré vers l’arrière les jours qui suivent : c’est le contour qui porte.', { ref: REFS.CHEVEU_AFRO_BAD }),
      SI_CA_TIRE,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-retouches-post-reprise')}.`),
      ...cat.comprisDans('sv-retouches-post-reprise'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-gbeji-sublimation', 'Sublimation · Le Renfort Durable', {
    objectif: [C('Renforcer durablement et remettre en forme les cheveux qui sortent de la lock, avec un brossage de la lock si la cliente le souhaite.')],
    public: [C('Les locks dont des cheveux s’échappent le long de la tige.')],
    produits: [METHODE('Outils de la remise en forme.')],
    arrivee: [
      REGARD_AVANT,
      C('Lui demander si elle souhaite le brossage de la lock.'),
      P('Lock amincie ou fragile : la remettre en forme sans la travailler en force.', { ref: REFS.INTERLOCKING }),
    ],
    etapes: [
      METHODE('Rentrer dans la lock les cheveux qui en sortent, lock par lock.'),
      C('Brossage de la lock, si elle le souhaite.'),
      P('Vérifier, lock en main, que rien n’a été aminci ni troué.'),
    ],
    conseils: [BONNET_LA_NUIT],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-gbeji-sublimation')}.`),
      ...cat.comprisDans('sv-gbeji-sublimation'),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── FÍNFÍN™ · La Renaissance ──────────────────────────────────────── */
  fiche('sv-finfin-legere', 'FÍNFÍN™ Légère · La Réparation Douce', {
    objectif: [C('Une réparation vraiment légère de la lock : le premier soin, avant que le mal ne s’installe.')],
    public: [C('Quelques locks qui commencent à s’abîmer : une racine qui s’affine, une lock qui s’ouvre.')],
    produits: [METHODE('Outils de réparation.')],
    arrivee: [
      REGARD_AVANT,
      P('Compter et montrer à la cliente les locks à reprendre. Au-delà de quelques-unes, c’est un FÍNFÍN™ Essentiel, après un KÒKÒ™ Accueil.'),
    ],
    etapes: [
      METHODE('Reprendre les locks repérées, une à une.'),
      P('Une lock amincie peut se renforcer en la reliant à une voisine saine.', { ref: REFS.INTERLOCKING }),
      SANS_TENSION,
    ],
    conseils: [
      P('Ménager les locks reprises : pas de coiffure qui tire dessus.'),
      SI_CA_TIRE,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-finfin-legere')}.`),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-atl-iv-gbe-c', 'FÍNFÍN™ Essentiel · La Reconstruction', {
    objectif: [C('Reconstruire des locks fragilisées ou abîmées par la chimie, mais récupérables. Deux phases : WÈWÈ™ puis GBÌGBÌ™, et le resserrage des zones critiques.')],
    public: [
      C('Locks fragilisées ou post chimiques, récupérables.'),
      C('Après un KÒKÒ™ Accueil : le bilan, le pronostic et le protocole y sont rédigés.'),
    ],
    produits: [
      C('Ceux du WÈWÈ™ et du GBÌGBÌ™ : voir leurs fiches.'),
      METHODE('Outils du resserrage.'),
    ],
    arrivee: [
      C('Relire le bilan et le protocole du KÒKÒ™ Accueil.'),
      REGARD_AVANT,
      CUIR_CHEVELU_SAIN,
    ],
    etapes: [
      C('Phase 1 : WÈWÈ™. Voir sa fiche.'),
      C('Phase 2 : GBÌGBÌ™. Voir sa fiche.'),
      C('Resserrage des zones critiques seulement.'),
      SANS_TENSION,
      C('Rédiger le plan de soin sur 3 mois.'),
    ],
    conseils: [
      C('Lui remettre son plan de soin sur 3 mois et le lire avec elle.'),
      P('Aucun acte chimique pendant la reconstruction.', { ref: REFS.ACTES_CHIMIQUES }),
      SI_CA_TIRE,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-atl-iv-gbe-c')}, en 2 séances.`),
      C('Compris : le plan de soin sur 3 mois, et une Retouche FÍNFÍN™ offerte à 4 semaines.'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-atl-iv-gbp-c', 'FÍNFÍN™ Profond · La Reconstruction Intensive', {
    objectif: [C('Reconstruire des locks très abîmées : fermeture des locks ouvertes, anti-casse intensif, sur plusieurs séances.')],
    public: [
      C('Locks très abîmées.'),
      C('Après un KÒKÒ™ Accueil : le bilan écrit fixe le protocole et le nombre de séances.'),
    ],
    produits: [
      C('Ceux du GBÌGBÌ™ : voir sa fiche.'),
      METHODE('Outils de fermeture des locks ouvertes.'),
    ],
    arrivee: [
      C('Relire le bilan écrit et la séance où elle en est.'),
      REGARD_AVANT,
      CUIR_CHEVELU_SAIN,
    ],
    etapes: [
      METHODE('Fermer les locks ouvertes, une à une.'),
      C('Soin anti-casse intensif.', { v: 'Le produit et son temps de pose : à inscrire.' }),
      P('Une lock cassée se rattache au crochet, en tresse ou en enroulage, sans ligne de démarcation visible.', { ref: REFS.REPARATION }),
      SANS_TENSION,
      C('Mettre le bilan écrit à jour.'),
    ],
    conseils: [
      P('Aucun acte chimique pendant la reconstruction.', { ref: REFS.ACTES_CHIMIQUES }),
      P('Pas de coiffure serrée entre les séances.'),
      SI_CA_TIRE,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-atl-iv-gbp-c')}. Le prix est celui de la séance 1.`),
      C('Compris : le bilan écrit, 2 Retouches FÍNFÍN™ sur 6 semaines, un DÀNDÀN™ offert entre les séances.'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-plt-50-ret-r-c', 'FÍNFÍN™ · La Retouche', {
    objectif: [C('Après un rituel FÍNFÍN™ : contrôler les zones reconstruites, resserrer ce qui le demande, ajuster.')],
    public: [C('La cliente qui a fait un FÍNFÍN™ il y a 4 à 6 semaines.')],
    produits: [METHODE('Outils du resserrage.')],
    arrivee: [
      C('Relire sur sa fiche les zones reconstruites.'),
      REGARD_AVANT,
    ],
    etapes: [
      C('Contrôler chaque zone reconstruite, lock en main.'),
      C('Resserrage ciblé : seulement ce qui a bougé.'),
      SANS_TENSION,
      C('Ajuster, et noter ce qui tient et ce qui ne tient pas.'),
    ],
    conseils: [SI_CA_TIRE],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-plt-50-ret-r-c')}.`),
      C('Offerte ou comprise dans les rituels FÍNFÍN™, selon le rituel.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-atl-iv-ala-c', 'ÀLÀLÀ™ · Repose partielle et reconstruction complète', {
    objectif: [C('Le rituel le plus complet : séparer et démêler les locks collées, reconstruire totalement, reposer en partie si nécessaire. En deux séances.')],
    public: [
      C('Locks collées entre elles, à reconstruire entièrement.'),
      C('Après un KÒKÒ™ Accueil : bilan, pronostic et protocole rédigés.'),
    ],
    produits: [
      C('Ceux du GBÌGBÌ™ et du DÀNDÀN™ : voir leurs fiches.'),
      METHODE('Outils de séparation, de reconstruction et de repose.'),
      C('Cheveux naturels pour la repose partielle, de la Gamme.', { v: 'Quelle référence du stock pour quelle texture : à écrire.' }),
    ],
    arrivee: [
      C('Relire le bilan, le protocole, et la séance où elle en est.'),
      REGARD_AVANT,
      CUIR_CHEVELU_SAIN,
      P('Lui redire le déroulé des deux séances et les pauses.'),
    ],
    etapes: [
      C('Séparer et démêler les locks collées.'),
      P('Séparer à la racine sans arracher : ce qui a fusionné depuis longtemps se sépare lentement, lock par lock.'),
      C('Reconstruction totale.'),
      C('Repose partielle, si nécessaire.'),
      P('Des rallonges en cheveux humains se posent au crochet, sans tirer sur la racine ; à éviter si le contour est déjà aminci.', { ref: REFS.EXTENSIONS }),
      C('Un GBÌGBÌ™ et un DÀNDÀN™ à chaque séance : voir leurs fiches.'),
      C('Séance 2 : coiffure signature de sortie.'),
      C('Rédiger le plan de soin sur 6 mois.'),
    ],
    conseils: [
      C('Lui remettre son plan de soin sur 6 mois et le lire avec elle.'),
      P('Aucun acte chimique pendant la reconstruction.', { ref: REFS.ACTES_CHIMIQUES }),
      SI_CA_TIRE,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.dureeParLongueur('sv-atl-iv-ala-c')}, en 2 séances.`),
      C('Compris : un GBÌGBÌ™ et un DÀNDÀN™ à chaque séance, le plan de soin sur 6 mois, 2 Retouches FÍNFÍN™ aux semaines 4 et 10, la coiffure signature de sortie.'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),

  fiche('sv-fft-iv-01', 'Cure GBÌGBÌ™ Profond × 3 · La Reconstruction Suivie', {
    objectif: [C('Trois séances de GBÌGBÌ™ Profond espacées de 3 semaines, ouvertes par un WÈWÈ™.')],
    public: [C('Locks très abîmées, après un KÒKÒ™ Accueil.')],
    produits: [C('Ceux du WÈWÈ™ et du FÍNFÍN™ Profond : voir leurs fiches.')],
    arrivee: [
      C('Relire sur sa fiche la séance où elle en est.'),
      C('Puis les vérifications du rituel du jour : voir sa fiche.'),
    ],
    etapes: [
      C('Séance d’ouverture : WÈWÈ™, puis le premier GBÌGBÌ™ Profond.'),
      C('Séances suivantes : GBÌGBÌ™ Profond, voir la fiche FÍNFÍN™ Profond.'),
      C('Dernière séance : coiffure signature de clôture.'),
    ],
    conseils: [C('Lui remettre son plan de soin sur 6 mois.'), POSER_LA_SUITE],
    suivi: [
      C('Trois séances, espacées de 3 semaines.'),
      C('Compris : un WÈWÈ™ en ouverture, le plan de soin sur 6 mois, une Retouche FÍNFÍN™, une coiffure signature de clôture.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-fft-iv-02', 'FÍNFÍN™ × GBÈJÍ™ · La Renaissance + 6 Mois d’Entretien', {
    objectif: [C('L’ÀLÀLÀ™ complet, puis six mois d’entretien : 6 SÍNSIN™ Essentiel mensuels, 3 DÀNDÀN™, une coiffure signature de clôture.')],
    public: [C('La cliente de l’ÀLÀLÀ™ qui s’engage sur six mois d’entretien.')],
    produits: [C('Ceux de chaque rituel compris : voir leurs fiches.')],
    arrivee: [
      C('Relire sur sa fiche ce qui a été rendu et ce qui reste dans la formule.'),
      C('Puis les vérifications du rituel du jour : voir sa fiche.'),
    ],
    etapes: [
      C('D’abord l’ÀLÀLÀ™ complet : voir sa fiche.'),
      C('Puis, chaque mois, un SÍNSIN™ Essentiel au calibre.'),
      C('Trois DÀNDÀN™, un par trimestre.'),
      C('À la fin : la coiffure signature de clôture.'),
    ],
    conseils: [C('Ceux du rituel rendu ce jour.'), POSER_LA_SUITE],
    suivi: [
      C('10 séances au catalogue. Créneau prioritaire pendant 6 mois.'),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── GBÀTÀ™ · Le Dénouement ────────────────────────────────────────── */
  fiche('sv-plt-45-std', 'GBÀTÀ™ Essentiel · Le Défaisage', {
    objectif: [C('Défaire les locks à l’aiguille, lock par lock, pour préserver la fibre.')],
    public: [C('Locks récentes ou larges, de moins de 2 ans.')],
    produits: [
      C('Aiguilles de défaisage.'),
      P('Eau tiède et un soin glissant pour saturer chaque lock avant de la défaire.', { ref: REFS.DEFAISAGE }),
      C('Ceux du KLƆKLƆ™ et de l’hydratation de sortie : voir leurs fiches.'),
    ],
    arrivee: [
      P('Lui demander l’âge des locks, leur méthode de création, et tout acte chimique.'),
      P('Lui dire avant de commencer ce qu’elle verra : beaucoup de cheveux dans le peigne. Ce sont ceux qui sont tombés naturellement depuis la création et sont restés dans la lock.', { ref: REFS.CHUTE_NORMALE }),
      P('Lui annoncer la durée et les pauses.'),
      REGARD_AVANT,
    ],
    etapes: [
      C('Équipe de 2 à 3 prestataires.'),
      P('Saturer la lock d’eau et de soin glissant.', { ref: REFS.DEFAISAGE }),
      C('Défaire à l’aiguille, lock par lock.'),
      P('Partir de la pointe et remonter vers la racine, par petites longueurs, sans jamais tirer.', { ref: REFS.DEFAISAGE }),
      P('Mettre en vanille chaque mèche défaite, pour qu’elle ne se renoue pas.', { ref: REFS.DEFAISAGE }),
      C('KLƆKLƆ™ et hydratation en sortie, compris : voir leurs fiches.'),
    ],
    conseils: [
      P('Le cheveu retrouvé est fragile : le démêler mouillé, avec un soin, aux doigts ou au peigne à dents larges.', { ref: REFS.DEMELAGE }),
      P('Pas d’acte chimique dans les semaines qui suivent.', { ref: REFS.ACTES_CHIMIQUES }),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-45-std')}. Prix variable.`),
      C('Compris : le KLƆKLƆ™ et l’hydratation de sortie.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-plt-45-int', 'GBÀTÀ™ Intégral · Le Défaisage', {
    objectif: [C('Défaire des locks anciennes, fines ou très denses, mèche par mèche, puis reconstruire et soigner le cheveu retrouvé.')],
    public: [
      C('Locks anciennes, fines ou très denses.'),
      C('Une consultation précède : vérifier qu’elle a eu lieu.'),
    ],
    produits: [
      C('Aiguilles de défaisage.'),
      P('Eau tiède et un soin glissant pour saturer chaque lock avant de la défaire.', { ref: REFS.DEFAISAGE }),
      C('Les produits de la reconstruction et du soin du cheveu retrouvé.', { v: 'Lesquels : à inscrire.' }),
    ],
    arrivee: [
      C('Relire la consultation : ce qui a été annoncé, en combien de séances.'),
      P('Lui redire ce qu’elle verra : beaucoup de cheveux dans le peigne, ceux qui sont tombés naturellement depuis des années et sont restés dans la lock.', { ref: REFS.CHUTE_NORMALE }),
      P('Lui annoncer la durée et les pauses.'),
      REGARD_AVANT,
    ],
    etapes: [
      C('Équipe de 4 prestataires.'),
      P('Saturer la lock d’eau et de soin glissant.', { ref: REFS.DEFAISAGE }),
      C('Défaire mèche par mèche.'),
      P('Partir de la pointe et remonter vers la racine, par petites longueurs, sans jamais tirer.', { ref: REFS.DEFAISAGE }),
      P('Mettre en vanille chaque mèche défaite.', { ref: REFS.DEFAISAGE }),
      C('Reconstruction et soin du cheveu retrouvé, compris.'),
    ],
    conseils: [
      P('Le cheveu retrouvé est fragile : le démêler mouillé, avec un soin, aux doigts ou au peigne à dents larges.', { ref: REFS.DEMELAGE }),
      P('Pas d’acte chimique dans les semaines qui suivent.', { ref: REFS.ACTES_CHIMIQUES }),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-45-int')}, en 2 séances.`),
      C('Compris : la reconstruction et le soin du cheveu retrouvé.'),
      NOTER_LA_FICHE,
      POSER_LA_SUITE,
    ],
  }),
];
