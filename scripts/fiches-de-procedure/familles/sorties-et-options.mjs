import { C, P, fiche } from '../outils.mjs';
import { REGARD_AVANT, SANS_TENSION, NOTER_LA_FICHE, BONNET_LA_NUIT } from '../communs.mjs';

/* LES SORTIES, LES OPTIONS ET LES PORTES CLOSES. Presque tout vient du
   catalogue. Là où le catalogue n'a pas de description (les Préludes, le
   démontage, le supplément de longueur), la fiche ne devine pas : elle dit
   ce que le nom annonce et signale le reste « à valider ». */

const PRODUITS_DE_COIFFAGE = C('Huile parfumée, élastiques, pinces. Les ornements viennent de la Gamme.', { v: 'Référence de l’huile parfumée utilisée au salon : à inscrire.' });

export default (cat) => [
  /* ── La sortie ─────────────────────────────────────────────────────── */
  fiche('sv-plt-50-sty-e', 'La sortie soignée · coiffure quotidien', {
    objectif: [C('Une coiffure de sortie simple et nette : chignon, demi-attache ou détaché structuré, avec huile parfumée.')],
    public: [C('Toute cliente, à la suite d’un SÍNSIN™ ou d’un soin.')],
    produits: [PRODUITS_DE_COIFFAGE],
    arrivee: [
      P('Demander à la cliente laquelle des trois sorties elle veut, et ce qu’elle fait de sa journée.'),
      P('Locks sèches avant d’attacher : on n’attache pas des locks humides.'),
    ],
    etapes: [
      C('Huile parfumée sur les longueurs, en petite quantité.'),
      C('Chignon, demi-attache ou détaché structuré, au choix de la cliente.'),
      SANS_TENSION,
    ],
    conseils: [
      P('Défaire l’attache le soir : une coiffure serrée gardée jour et nuit fatigue les racines.'),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-50-sty-e')}.`),
      ...cat.comprisDans('sv-plt-50-sty-e'),
    ],
  }),

  fiche('sv-plt-50-sty-s', 'La sortie Signature · coiffure élaborée', {
    objectif: [C('Une coiffure de sortie travaillée : volume, séparation nette, finition longue tenue.')],
    public: [C('La cliente qui veut une coiffure élaborée en sortant du rituel.')],
    produits: [PRODUITS_DE_COIFFAGE],
    arrivee: [
      P('S’accorder avec la cliente sur la coiffure, photo à l’appui si elle en a une.'),
      P('Locks sèches avant de coiffer.'),
      P('Regarder les racines : sur une racine amincie ou une zone dégarnie, pas de coiffure qui tire.'),
    ],
    etapes: [
      C('Séparations nettes, puis construction du volume.'),
      C('Finition longue tenue.'),
      SANS_TENSION,
    ],
    conseils: [
      P('Si la coiffure tire, gêne ou donne mal à la tête, la desserrer ou la défaire : elle ne doit pas faire mal.'),
      BONNET_LA_NUIT,
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-50-sty-s')}.`),
      ...cat.comprisDans('sv-plt-50-sty-s'),
      P('Durée de port conseillée.', { v: 'À fixer par la Maison : combien de jours garder une sortie Signature.' }),
    ],
  }),

  fiche('sv-plt-50-eve-c', 'La sortie de grand jour · coiffure exception', {
    objectif: [C('Un attaché sophistiqué, avec un ornement au choix (dorures, foulard, perles), qui tient toute la journée et la soirée.')],
    public: [C('La cliente qui a un événement le jour même ou le lendemain.')],
    produits: [
      PRODUITS_DE_COIFFAGE,
      C('Ornements au choix : dorures, foulard, perles.'),
    ],
    arrivee: [
      P('Demander l’heure et la durée de l’événement, la tenue, et l’ornement choisi.'),
      P('Locks sèches avant de coiffer.'),
      P('Regarder les racines : sur une racine amincie ou une zone dégarnie, pas de coiffure qui tire.'),
    ],
    etapes: [
      C('Attaché sophistiqué, construit pour tenir la journée et la soirée.'),
      C('Pose de l’ornement choisi.'),
      SANS_TENSION,
      P('Faire bouger la tête à la cliente avant qu’elle parte : rien ne doit glisser ni tirer.'),
    ],
    conseils: [
      P('Défaire la coiffure après l’événement : elle n’est pas faite pour être gardée plusieurs jours.'),
      P('Si elle tire ou donne mal à la tête, la desserrer sans attendre.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-plt-50-eve-c')}.`),
      ...cat.comprisDans('sv-plt-50-eve-c'),
    ],
  }),

  /* ── Préparation et options ────────────────────────────────────────── */
  fiche('sv-sup-01', 'Prélude Express · cheveu prêt à travailler', {
    objectif: [C('La préparation d’un cheveu déjà prêt à travailler, avant une création ou une coiffure.')],
    public: [C('Un cheveu propre, démêlé, sans ancienne coiffure à défaire.')],
    produits: [C('Produits de préparation.', { v: 'Le catalogue ne décrit pas ce Prélude : produits à inscrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Vérifier que le cheveu est bien propre et démêlé. Sinon, c’est un Prélude Complet ou Intensif.'),
    ],
    etapes: [C('Préparer le cheveu pour le travail qui suit.', { v: 'Les gestes exacts du Prélude Express ne sont pas écrits : à décrire par la Maison.' })],
    conseils: [C('Aucun conseil propre : le Prélude prépare la prestation qui suit.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-sup-01')}. Sans supplément de prix.`),
      C('Compris dans les créations VÈKPÈ™ : « la préparation, Prélude si nécessaire ».'),
    ],
  }),

  fiche('sv-sup-02-l', 'Prélude Complet · cheveux lisses, bouclés 3A à 3C', {
    objectif: [C('La préparation complète des cheveux lisses ou bouclés (3A à 3C), avant une création ou une coiffure.')],
    public: [C('Cheveux lisses, ou bouclés de 3A à 3C.')],
    produits: [C('Produits de préparation.', { v: 'Le catalogue ne décrit pas ce Prélude : produits à inscrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Confirmer la texture avec la cliente : elle décide de la méthode de création qui suit.'),
    ],
    etapes: [
      P('Démêler par sections, des pointes vers la racine, sans arracher.'),
      C('Préparer le cheveu pour le travail qui suit.', { v: 'Lavage, séchage, étirage : les gestes exacts du Prélude Complet ne sont pas écrits. À décrire par la Maison.' }),
    ],
    conseils: [C('Aucun conseil propre : le Prélude prépare la prestation qui suit.')],
    suivi: [C(`Durée au catalogue : ${cat.dureeParLongueur('sv-sup-02-l')}.`)],
  }),

  fiche('sv-sup-03-c', 'Prélude Intensif · très emmêlé, transition, cheveu lisse', {
    objectif: [C('La préparation d’un cheveu très emmêlé, en transition, ou lisse, avant une création ou une coiffure.')],
    public: [C('Cheveu très emmêlé, cheveu en transition, cheveu lisse.')],
    produits: [C('Produits de démêlage et de préparation.', { v: 'Le catalogue ne décrit pas ce Prélude : produits à inscrire.' })],
    arrivee: [
      REGARD_AVANT,
      P('Mesurer l’emmêlement avec la cliente et lui dire le temps que cela prendra.'),
      P('En transition : repérer la limite entre la repousse et les longueurs traitées, c’est là que le cheveu casse.'),
    ],
    etapes: [
      P('Démêler par petites sections, aux doigts puis au peigne à dents larges, des pointes vers la racine. Ne jamais tirer sur un nœud.'),
      C('Préparer le cheveu pour le travail qui suit.', { v: 'Lavage, soin, séchage : les gestes exacts du Prélude Intensif ne sont pas écrits. À décrire par la Maison.' }),
    ],
    conseils: [C('Aucun conseil propre : le Prélude prépare la prestation qui suit.')],
    suivi: [C(`Durée au catalogue : ${cat.dureeParLongueur('sv-sup-03-c')}.`)],
  }),

  fiche('sv-sup-20-c', 'Démontage ancienne coiffure', {
    objectif: [C('Défaire l’ancienne coiffure de la cliente avant la prestation du jour.')],
    public: [C('La cliente qui arrive avec une coiffure à défaire : tresses, vanilles, tissage.')],
    produits: [C('Outils de démontage, vaporisateur, démêlant.', { v: 'Le catalogue ne décrit pas cette prestation : produits à inscrire.' })],
    arrivee: [
      P('Demander depuis combien de temps la coiffure est portée.'),
      REGARD_AVANT,
    ],
    etapes: [
      P('Défaire tresse par tresse, de la pointe vers la racine. Couper les rajouts bien en dessous de la longueur du cheveu de la cliente.'),
      P('Défaire aux doigts l’amas de cheveux tombés et de résidus à la racine avant de mouiller : mouillé, il se resserre en nœud.'),
      P('Démêler section par section avant tout lavage.'),
    ],
    conseils: [P('Dire à la cliente que les cheveux qui tombent au démontage sont ceux qui seraient tombés chaque jour pendant le port : ce n’est pas une chute.')],
    suivi: [C(`Durée au catalogue : ${cat.dureeParLongueur('sv-sup-20-c')}.`)],
  }),

  fiche('sv-sup-30', 'VÈKPÈ™ L’Essai · essai de calibre', {
    objectif: [C('Poser 2 à 3 locks témoins dans le calibre envisagé, portées quelques jours pour valider le choix avant la création VÈKPÈ™.')],
    public: [C('La cliente qui hésite entre deux calibres avant sa création.')],
    produits: [C('Les outils de la création VÈKPÈ™ : voir sa fiche.')],
    arrivee: [
      C('Le calibre envisagé a été discuté au KÒKÒ™ Origine.'),
      REGARD_AVANT,
    ],
    etapes: [
      P('Choisir avec elle un endroit discret pour les locks témoins.'),
      C('Poser 2 à 3 locks témoins dans le calibre envisagé.'),
      P('Les lui montrer au miroir, et noter leur calibre et leur place sur sa fiche.'),
    ],
    conseils: [
      C('Porter les locks témoins quelques jours avant de décider.'),
      P('Ne pas les défaire ni les mouiller inutilement d’ici la décision.'),
    ],
    suivi: [
      C(`Durée au catalogue : ${cat.duree('sv-sup-30')}.`),
      C('Déductible de la création si elle est réalisée sous 45 jours.'),
      NOTER_LA_FICHE,
    ],
  }),

  fiche('sv-sup-40', 'Supplément longueur XXL', {
    objectif: [C('Le temps supplémentaire que demande une très grande longueur.')],
    public: [C('Les très grandes longueurs.', { v: 'Le catalogue ne dit pas à partir de quelle longueur ce supplément s’applique : à fixer.' })],
    produits: [C('Ceux de la prestation qu’il accompagne : voir sa fiche.')],
    arrivee: [P('Mesurer la longueur avec la cliente et lui annoncer le supplément avant de commencer.')],
    etapes: [C('Suivre la fiche de la prestation qu’il accompagne : ce supplément n’ajoute que du temps.')],
    conseils: [C('Ceux de la prestation qu’il accompagne.')],
    suivi: [C(`Durée au catalogue : ${cat.duree('sv-sup-40')} de plus.`)],
  }),

  fiche('sv-sup-50', 'Option Nuage · sans nœud', {
    objectif: [C('Une pose sans nœud à la racine. S’ajoute à toute prestation Coiffer.')],
    public: [
      C('Les clientes de l’atelier Coiffer (tresses).'),
      P('À proposer d’abord aux cuirs chevelus sensibles et aux racines fragiles : sans nœud, la tresse pèse et tire moins à la racine.'),
    ],
    produits: [C('Les mèches de la prestation Coiffer.')],
    arrivee: [REGARD_AVANT],
    etapes: [
      P('Commencer la tresse avec le cheveu de la cliente seul, puis introduire les mèches peu à peu, sans faire de nœud à la racine.'),
      SANS_TENSION,
    ],
    conseils: [P('Si une tresse tire ou fait apparaître des petits boutons à la racine, revenir la faire desserrer.')],
    suivi: [C('Option : elle s’ajoute au prix et à la durée de la prestation Coiffer.')],
  }),

  fiche('sv-sup-60', 'Option Tout inclus · mèches premium fournies', {
    objectif: [C('La Maison fournit les mèches. S’ajoute à toute prestation Coiffer.')],
    public: [C('Les clientes de l’atelier Coiffer qui n’apportent pas leurs mèches.')],
    produits: [C('Mèches de la Gamme, à sortir du stock.', { v: 'Quelles mèches pour quelle coiffure, et combien de paquets : à écrire.' })],
    arrivee: [P('Choisir la teinte et la longueur avec la cliente avant de sortir les mèches du stock.')],
    etapes: [
      P('Sortir les mèches du stock et les noter au rendez-vous, pour que le stock suive.'),
      C('Puis suivre la fiche de la prestation Coiffer.'),
    ],
    conseils: [C('Ceux de la prestation Coiffer.')],
    suivi: [C('Option : elle s’ajoute au prix de la prestation Coiffer.')],
  }),

  fiche('x1e5usbmzc', 'Prestation sur mesure · MND', {
    objectif: [C('Une prestation qui n’est pas au catalogue, composée pour une cliente, sur devis.')],
    public: [C('La cliente dont la demande ne correspond à aucune prestation du catalogue.')],
    produits: [C('Ceux que le devis nomme.')],
    arrivee: [
      C('Le devis accepté : ce qui a été promis, à quel prix.'),
      REGARD_AVANT,
    ],
    etapes: [C('Suivre le devis, ligne par ligne. Ce qui n’y est pas ne se fait pas sans l’accord de la direction.')],
    conseils: [C('Ceux que le devis prévoit.')],
    suivi: [
      C('Prix sur devis.'),
      NOTER_LA_FICHE,
    ],
  }),

  /* ── Portes closes ─────────────────────────────────────────────────── */
  ...[
    ['sv-souv-1h', 'Portes closes · une heure', 'La Maison ferme ses portes une heure durant et n’ouvre que pour elle.'],
    ['sv-souv-2h', 'Portes closes · deux heures', 'Deux heures de salon fermé, à elle seule et à qui l’accompagne.'],
    ['sv-souv-rep', 'Portes closes · la Réparation intensive', 'Le salon fermé pour la durée d’une réparation intensive : le calme que ce travail demande.'],
    ['sv-souv-crea', 'Portes closes · la Création', 'La journée entière : la Maison n’ouvre pour personne d’autre le temps de sa création.'],
  ].map(([id, titre, promesse]) => fiche(id, titre, {
    objectif: [C(promesse)],
    public: [C('La cliente qui a réservé la Maison pour elle seule. Deux têtes au plus.')],
    produits: [C('Ceux des prestations rendues pendant la privatisation : voir leurs fiches.')],
    arrivee: [
      C('Le carnet : aucun autre rendez-vous ne tient sur la durée de la privatisation.'),
      P('Le salon rangé et la porte fermée avant son arrivée.'),
    ],
    etapes: [
      P('Fermer la porte à son arrivée : personne d’autre n’entre, ni cliente, ni livraison.'),
      C('Rendre les prestations du rendez-vous, chacune selon sa fiche.'),
      P('Rouvrir seulement après son départ.'),
    ],
    conseils: [C('Ceux des prestations rendues.')],
    suivi: [
      C(`Durée au catalogue : ${cat.duree(id)}.`),
      C('La privatisation s’ajoute aux prestations : elle ne les remplace pas.'),
    ],
  })),
];
