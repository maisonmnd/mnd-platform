/* ══ LES PARCOURS DE L'ACADÉMIE — 6 septembre 2026 ═══════════════════

   « Pourrions-nous retrouver toutes les formations de l'Académie ? Et les
   remettre dans le logiciel ? » (Yéman).

   ELLES N'ÉTAIENT PAS PERDUES, ELLES ÉTAIENT AILLEURS. Les neuf parcours
   vivaient en dur dans l'app `certificat`, et le magasin de l'Académie n'avait
   jamais été rempli : sa graine est vide par doctrine, « Maison neuve, coquille
   vierge, tout naît de l'usage ».

   DEUX VÉRITÉS POUR UNE NOTION, donc, et le défaut qu'on a corrigé trois fois
   cette semaine. Un certificat délivré depuis l'Académie aurait nommé un
   parcours absent de la liste du certificat, et l'inverse aussi.

   LA LISTE VIT ICI, ET ELLE EST LA RÉFÉRENCE. Le certificat la lit ; l'Académie
   s'en sert pour poser ses formations, une fois, à la demande.

   ══ LE CONTENU ET LES PRIX — 13 septembre 2026 ═══════════════════════
   « Bien remplir le contenu des formations de l'Académie », puis « je veux une
   distinction entre les professionnels et les débutants. Ajoute des prix à
   toutes les formations » (Yéman). Maquette `public/maquette-les-neuf-parcours.html`,
   validée (« construire avec ce contenu »).

   LES NEUF AFFICHAIENT LE MÊME PROGRAMME : les quatre temps, posés par défaut.
   Chacun porte désormais son public, son accroche, ses prérequis, ce que
   l'apprenante sait à la sortie, et QUATRE MODULES ÉVALUABLES. Quatre, pas
   douze : les modules sont les unités du Suivi, chacun se valide à 70 avant
   le jury, et une liste de séances n'est pas une liste d'épreuves.

   LES PRIX ÉTAIENT ABSENTS PAR DOCTRINE (« aucun prix n'est inventé ») ; la
   Maison les a demandés. Ils sont calés sur ceux du salon : Fondation vaut une
   création VÈKPÈ™ Medium (150 000 F), Affirmation dix SÍNSIN™ Medium. Ils ne se
   posent qu'à la main (« Compléter les fiches de la Maison ») et jamais sur un
   prix déjà écrit. */

/** DEUX PUBLICS QUI NE SE MÉLANGENT PAS. La débutante entre dans le métier ; la
    professionnelle y est déjà et ne refait pas le cursus. */
export type PublicDeFormation = 'debutante' | 'professionnelle';

export const PUBLIC_LABEL: Record<PublicDeFormation, string> = {
  debutante: 'Débutante',
  professionnelle: 'Professionnelle',
};

export type ModuleDeParcours = {
  /** Le nom du module : c'est lui que le Suivi évalue et que l'avancement suit. */
  nom: string;
  seances: number;
  contenu: string;
};

export type ParcoursMND = {
  id: string;
  titre: string;
  /** « Palier II · L'Affirmation » — la place dans le référentiel. */
  niveau: string;
  /** La durée telle qu'elle s'écrit sur un certificat, en toutes lettres :
      un papier de cérémonie n'écrit pas « 8 sem. ». */
  duree: string;
  /** Les mêmes, en nombres, pour l'Académie qui compte des séances. */
  semaines: number;
  seances: number;
  /** La phrase imprimée sur le certificat, après « démontré devant le maître
      loctician ». */
  competences: string;
  public: PublicDeFormation;
  accroche: string;
  pourQui: string;
  pourEntrer: string;
  sait: string[];
  programme: ModuleDeParcours[];
  tetesReelles: string;
  /** Le prix proposé le 13 septembre 2026, en francs CFA. */
  prixXof: number;
  /** Les heures, quand elles sont écrites (les formats professionnels). */
  heures?: number;
};

/** LES NEUF PARCOURS, alignés sur la logique de palier du référentiel :
    L'Initiation · L'Affirmation · L'Œuvre. */
export const PARCOURS_MND: ParcoursMND[] = [
  /* ── POUR LES DÉBUTANTES · une séance par semaine ─────────────────── */
  {
    id: 'fondation', titre: 'Fondation', niveau: 'Palier I · L’Initiation',
    duree: 'quatre semaines · six séances', semaines: 4, seances: 6,
    competences: 'les gestes fondateurs de la Maison : purifier, nourrir, sceller et couronner la mèche',
    public: 'debutante', prixXof: 150000,
    accroche: 'Poser les gestes justes avant d’aller vite : le soin de la mèche, dans l’ordre des quatre temps.',
    pourQui: 'Débutantes, sans expérience en coiffure, qui veulent entrer dans le métier de locticienne.',
    pourEntrer: 'Entretien d’admission et test d’observation : le geste, l’hygiène, la posture. Aucun diplôme demandé.',
    sait: [
      'accueillir une cliente et lire une tête : texture, cuir chevelu, état des locks',
      'conduire les quatre temps d’un rituel d’entretien, dans l’ordre et sans en sauter un',
      'laver au KLƆKLƆ™ et nourrir au DÀNDÀN™ sans feutrer ni casser la fibre',
      'tenir son poste : hygiène, outils, temps, fiche cliente',
    ],
    programme: [
      { nom: 'L’accueil et la lecture de la tête', seances: 1, contenu: 'Hygiène du poste et des outils. Le cheveu afro, la racine, le cuir chevelu. Les calibres de la Maison, du Jumbo au Nano. Ouvrir et lire une fiche cliente.' },
      { nom: 'Purifier', seances: 1, contenu: 'Le lavage KLƆKLƆ™ Essentiel et Signature, le massage crânien, un rinçage et un séchage qui ne feutrent pas la mèche. Quand proposer WÈWÈ™, la purification des trois mois.' },
      { nom: 'Nourrir', seances: 2, contenu: 'DÀNDÀN™, l’hydratation aux sept huiles. Lire ce dont la fibre a besoin, doser, appliquer, protéger la racine.' },
      { nom: 'Sceller et couronner', seances: 2, contenu: 'Fixer le soin et protéger la mèche. Le styling de sortie : chignon, demi-attache, détaché structuré, huile parfumée. Le conseil d’entretien à la maison.' },
    ],
    tetesReelles: 'trois rituels d’entretien au salon, en observation puis assistée',
  },
  {
    id: 'affirmation', titre: 'Affirmation', niveau: 'Palier II · L’Affirmation',
    duree: 'huit semaines · dix séances', semaines: 8, seances: 10,
    competences: 'la reprise de racines, le resserrage de précision et la conduite d’un rituel de soin complet',
    public: 'debutante', prixXof: 250000,
    accroche: 'Le resserrage de précision et la reprise des contours : tenir une tête de bout en bout.',
    pourQui: 'Apprenantes qui ont validé Fondation et veulent tenir une tête entière.',
    pourEntrer: 'Fondation validée. Une professionnelle qui veut resserrer va vers la spécialité Resserrage.',
    sait: [
      'diagnostiquer une tête au KÒKÒ™ Suivi : calibre, densité, état, pousse',
      'resserrer lock par lock au SÍNSIN™, uniforme et sans tension excessive',
      'reprendre les tempes, la nuque et la lisière sans casser le contour',
      'conduire un rituel complet dans le temps annoncé, et poser la cadence de reprise (4, 6, 8 ou 10 semaines)',
    ],
    programme: [
      { nom: 'Le diagnostic KÒKÒ™', seances: 2, contenu: 'Compter les locks et reconnaître le calibre. Lire la pousse et les zones fragiles. Écrire la fiche et l’orientation vers le bon atelier.' },
      { nom: 'SÍNSIN™, le resserrage', seances: 4, contenu: 'Crochet ou torsion selon la texture. La tension juste qui préserve la racine, le contrôle d’uniformité. SÍNSIN™ Essentielle, puis Élaborée et son scellement renforcé.' },
      { nom: 'La reprise frontale', seances: 2, contenu: 'Tempes, nuque, baby hairs. Des lignes nettes entre deux resserrages complets, sans fragiliser la lisière.' },
      { nom: 'Le rituel complet', seances: 2, contenu: 'Enchaîner diagnostic, lavage, resserrage, soin et styling. Tenir le temps, expliquer la cadence à la cliente, mettre la fiche à jour.' },
    ],
    tetesReelles: 'six resserrages, dont trois en autonomie supervisée',
  },
  {
    id: 'oeuvre', titre: 'L’Œuvre', niveau: 'Palier III · L’Œuvre',
    duree: 'trois mois · douze séances', semaines: 12, seances: 12,
    /* SÉPARÉE DE MAÎTRE MND le 13 septembre 2026 : les deux certificats
       imprimaient mot pour mot la même phrase. L'Œuvre est la maîtrise
       technique ; la transmission est à Maître MND. */
    competences: 'la création VÈKPÈ™, la restauration des locks en souffrance, la couleur végétale YÈKPÈ™ et le défaisage GBÀTÀ™',
    public: 'debutante', prixXof: 450000,
    accroche: 'Faire naître une couronne, et sauver celles qui souffrent : la création, la restauration, la couleur.',
    pourQui: 'Apprenantes qui ont validé Affirmation, et veulent tenir tous les ateliers de la Maison.',
    pourEntrer: 'Affirmation validée, et un dossier de dix resserrages réalisés.',
    sait: [
      'conseiller le calibre et poser un Lock Test avant toute création',
      'créer des locks VÈKPÈ™ du Jumbo au Mini, lock par lock',
      'conduire une restauration : bilan écrit, WÈWÈ™ puis GBÌGBÌ™, plan de soin à trois mois',
      'poser une couleur végétale YÈKPÈ™ après test sur mèche, et en suivre le protocole',
      'défaire des locks à l’aiguille au GBÀTÀ™, en équipe, en préservant la fibre',
    ],
    programme: [
      { nom: 'La naissance · VÈKPÈ™', seances: 4, contenu: 'KÒKÒ™ Origine, Prélude et Lock Test. Les sections et les calibres : Jumbo de 50 à 100 locks, Medium de 100 à 180, Mini de 180 à 250. La création lock par lock, et les retouches à quatre semaines.' },
      { nom: 'La restauration · FÍNFÍN™', seances: 3, contenu: 'KÒKÒ™ Prestige, bilan écrit et pronostic. WÈWÈ™ puis GBÌGBÌ™, la fermeture des locks ouvertes, le plan de soin rédigé à trois mois.' },
      { nom: 'La couleur végétale · YÈKPÈ™', seances: 3, contenu: 'Henné, indigo et plantes, sans ammoniaque. Le test colorimétrique sur mèche, la pose et le temps. Le protocole qui suit : GBÌGBÌ™ à deux semaines, DÀNDÀN™ à un mois, WÈWÈ™ à six semaines.' },
      { nom: 'Le défaisage · GBÀTÀ™', seances: 2, contenu: 'Défaire à l’aiguille, lock par lock ou mèche par mèche. Travailler à plusieurs prestataires sur une même tête, soigner le cheveu retrouvé.' },
    ],
    tetesReelles: 'deux créations, deux restaurations et une couleur, en autonomie supervisée',
  },

  /* ── POUR LES PROFESSIONNELLES · jours consécutifs ────────────────── */
  {
    id: 'initiation', titre: 'Initiation au soin des locks', niveau: 'Parcours I · L’Initiation',
    duree: 'trois jours · douze heures · quatre séances', semaines: 1, seances: 4,
    competences: 'les gestes fondateurs du soin des locks : lavage doux, hydratation et protection de la fibre',
    public: 'professionnelle', prixXof: 90000, heures: 12,
    accroche: 'Trois jours pour soigner les têtes lockées qui s’assoient déjà dans votre salon, sans les abîmer.',
    pourQui: 'Coiffeuses, tresseuses et esthéticiennes en activité, qui reçoivent des têtes lockées sans avoir appris à les soigner.',
    pourEntrer: 'Exercer déjà dans la coiffure ou l’esthétique, et un entretien.',
    sait: [
      'laver, hydrater et protéger des locks sans les feutrer ni les casser',
      'reconnaître ce qui relève d’un soin, et ce qui demande un diagnostic de la Maison',
      'conseiller l’entretien entre deux rendez-vous',
    ],
    programme: [
      { nom: 'Comprendre la mèche', seances: 1, contenu: 'Le cheveu afro, la naissance d’une lock, les erreurs qui l’abîment : résidus, humidité, tension.' },
      { nom: 'Purifier', seances: 1, contenu: 'Le lavage KLƆKLƆ™, le séchage complet. Ce que fait WÈWÈ™ et quand l’orienter.' },
      { nom: 'Nourrir et protéger', seances: 1, contenu: 'DÀNDÀN™ et les huiles végétales, la protection de nuit, les gestes à laisser à la cliente.' },
      { nom: 'Le geste complet', seances: 1, contenu: 'Un rituel d’entretien du début à la fin sur une tête, et le conseil qui l’accompagne.' },
    ],
    tetesReelles: 'un rituel complet, assistée',
  },
  {
    id: 'praticien', titre: 'Praticien MND', niveau: 'Parcours II · L’Affirmation',
    duree: 'une semaine · trente heures · cinq séances', semaines: 1, seances: 5,
    competences: 'la maîtrise du diagnostic, de la création, de la reprise de racines et du rituel de soin complet',
    public: 'professionnelle', prixXof: 350000, heures: 30,
    accroche: 'Une semaine pour exercer selon la méthode MND : diagnostic, création, resserrage, rituel complet.',
    pourQui: 'Locticiennes en activité qui veulent la méthode de la Maison et sa certification.',
    pourEntrer: 'Au moins un an de pratique des locks, et un test d’entrée : un resserrage sur tête.',
    sait: [
      'poser un diagnostic KÒKÒ™ Origine ou Suivi, et recommander le calibre',
      'créer des locks VÈKPÈ™ Medium et Mini, et poser un Lock Test',
      'resserrer au SÍNSIN™ et reprendre les contours',
      'conduire un rituel complet, de l’accueil au styling, en posant la cadence de reprise',
    ],
    programme: [
      { nom: 'Le diagnostic et le calibre', seances: 1, contenu: 'KÒKÒ™ Origine et Suivi, le comptage des locks, les calibres, la fiche cliente.' },
      { nom: 'La création VÈKPÈ™', seances: 2, contenu: 'Les sections, les calibres Medium et Mini, le Lock Test, la création lock par lock.' },
      { nom: 'SÍNSIN™ et les contours', seances: 1, contenu: 'Le resserrage de précision, l’uniformité, la reprise frontale.' },
      { nom: 'Le rituel complet', seances: 1, contenu: 'De l’accueil au styling dans le temps annoncé. La cadence, la relation cliente, la fiche.' },
    ],
    tetesReelles: 'une création et deux resserrages, en autonomie supervisée',
  },
  {
    id: 'maitre', titre: 'Maître MND', niveau: 'Parcours III · L’Œuvre',
    duree: 'trois mois · quatre-vingt-dix heures · douze séances', semaines: 12, seances: 12,
    competences: 'la maîtrise des cas complexes, la conduite d’atelier, la transmission de la méthode et l’évaluation des apprenantes',
    public: 'professionnelle', prixXof: 850000, heures: 90,
    accroche: 'Tenir les cas les plus exigeants, et transmettre : conduire un atelier, former, évaluer.',
    pourQui: 'Praticiennes certifiées qui veulent diriger un atelier, ou devenir formatrices sous licence de la méthode. C’est ici que les deux chemins se rejoignent.',
    pourEntrer: 'Certification Praticien MND ou L’Œuvre, et un dossier de vingt rituels documentés.',
    sait: [
      'réaliser les cas complexes : VÈKPÈ™ Micro et Nano, de 250 à 600 locks, et ÀLÀLÀ™, la Grande Renaissance',
      'conduire un atelier : journée, postes, temps, qualité, suivi des clientes',
      'former une apprenante : démontrer, corriger, remplir une fiche de séance',
      'évaluer un module et siéger à un jury avec les grilles de l’Académie',
    ],
    programme: [
      { nom: 'Les cas complexes', seances: 4, contenu: 'VÈKPÈ™ Micro et Nano sur deux jours, l’engagement d’entretien expliqué avant la pose. ÀLÀLÀ™ : séparer et démêler des locks collées, reconstruire.' },
      { nom: 'La conduite d’atelier', seances: 3, contenu: 'Organiser une journée à plusieurs postes, répartir les têtes, tenir les temps et la qualité, suivre la cadence des clientes.' },
      { nom: 'Transmettre la méthode', seances: 3, contenu: 'Démontrer un geste, corriger sans décourager. La fiche de séance et sa note sur 20. La pratique en trois temps : observation, assistée, autonome supervisée.' },
      { nom: 'Évaluer et certifier', seances: 2, contenu: 'La grille des modules, la grille du jury, les seuils de certification, et ce qu’engage la licence de la méthode.' },
    ],
    tetesReelles: 'deux cas complexes, et quatre séances de Fondation ou d’Affirmation co-animées aux côtés d’une formatrice',
  },
  {
    id: 'resserrage', titre: 'Resserrage & soin des racines', niveau: 'Parcours technique',
    duree: 'deux semaines · vingt heures · six séances', semaines: 2, seances: 6,
    competences: 'le resserrage de précision, la santé du cuir chevelu et la protection de la longueur acquise',
    public: 'professionnelle', prixXof: 180000, heures: 20,
    accroche: 'Le geste le plus demandé au salon, jusqu’à la précision : un resserrage qui tient, une racine qui respire.',
    pourQui: 'Coiffeuses et locticiennes en activité qui veulent se spécialiser dans l’entretien des locks.',
    pourEntrer: 'Pratiquer déjà le soin des locks, ou avoir suivi l’Initiation.',
    sait: [
      'lire la pousse et la santé du cuir chevelu avant de toucher la racine',
      'resserrer au crochet ou en torsion selon la texture, sans tension excessive',
      'reprendre les contours et les tempes',
      'stimuler la pousse au VÍVÍVÓ™ et proposer le programme de pousse',
      'protéger la longueur acquise entre deux rendez-vous',
    ],
    programme: [
      { nom: 'La racine et le cuir chevelu', seances: 1, contenu: 'La pousse, la tension, la casse de traction. Les signes qui imposent d’orienter vers un diagnostic.' },
      { nom: 'SÍNSIN™ Essentielle', seances: 2, contenu: 'Crochet et torsion, l’uniformité lock par lock, le temps d’un resserrage complet.' },
      { nom: 'SÍNSIN™ Élaborée et reprise frontale', seances: 2, contenu: 'Le scellement renforcé qui espace les visites. Tempes, nuque, lisière.' },
      { nom: 'VÍVÍVÓ™ et la longueur', seances: 1, contenu: 'Ail noir, moringa, gingembre, cannelle, et vingt minutes de massage crânien. Le programme de pousse : DÀNDÀN™ à quatre semaines, GBÌGBÌ™ à huit, WÈWÈ™ et la remesure à douze.' },
    ],
    tetesReelles: 'quatre resserrages, dont deux en autonomie supervisée',
  },
  {
    id: 'laboratoire', titre: 'Le Laboratoire · formulation capillaire', niveau: 'Parcours spécial',
    duree: 'une semaine · vingt-quatre heures · quatre séances', semaines: 1, seances: 4,
    competences: 'la formulation des soins de la gamme : origines des ingrédients, protocoles et substitutions',
    public: 'professionnelle', prixXof: 200000, heures: 24,
    accroche: 'Comprendre ce qu’on pose sur une tête : les ingrédients, les formules de la Maison, et quand les adapter.',
    pourQui: 'Praticiennes en activité qui conseillent des soins et veulent préparer ceux de la gamme.',
    pourEntrer: 'Pratiquer déjà le soin des locks. Aucune formation en chimie demandée.',
    sait: [
      'reconnaître les beurres, huiles et plantes de la gamme, leur origine et leur rôle',
      'suivre une formule de la Maison, au gramme près',
      'préparer un soin pour une cliente et le consigner au Laboratoire, le stock suit',
      'remplacer un ingrédient manquant sans changer l’effet, et savoir quand ne pas le faire',
      'tenir l’hygiène, la conservation et le test de tolérance',
    ],
    programme: [
      { nom: 'Les ingrédients', seances: 1, contenu: 'Karité et mafura, baobab et café vert, soie et hibiscus, neem et calendula, aloès et lin, tea-tree et citron vert. D’où ils viennent, ce qu’ils font à la fibre.' },
      { nom: 'Les six formules de la Maison', seances: 1, contenu: 'Le Voile Aloès & Lin, L’Élixir Baobab & Café vert, Le Beurre Karité & Mafura, La Cure Soie & Hibiscus, Le Baume Neem & Calendula, Le Tonique Tea-tree & Citron vert.' },
      { nom: 'Préparer pour une cliente', seances: 1, contenu: 'Partir du besoin : sécheresse, casse, cuir chevelu. Doser, fabriquer, étiqueter, consigner la préparation.' },
      { nom: 'Remplacer et conserver', seances: 1, contenu: 'Les équivalences et les incompatibilités, le test de tolérance, la conservation et les dates.' },
    ],
    tetesReelles: 'deux préparations fabriquées et remises à des clientes du salon',
  },
  {
    id: 'referentiel', titre: 'Certification Référentiel MND', niveau: 'Certifiant · Pro',
    duree: 'dix séances · sur dossier', semaines: 10, seances: 10,
    competences: 'le référentiel complet de la Maison, appliqué et démontré devant le jury de l’Académie',
    public: 'professionnelle', prixXof: 400000,
    accroche: 'Démontrer le référentiel complet devant le jury de l’Académie, sans refaire tout le cursus.',
    pourQui: 'Professionnelles expérimentées qui pratiquent déjà l’ensemble des gestes, et veulent la certification de la Maison.',
    pourEntrer: 'Un dossier de pratique (photos avant et après, fiches d’au moins quinze clientes), un entretien et un test pratique.',
    sait: [
      'appliquer les quatre temps, les paliers et le lexique ™ de la Maison',
      'poser le diagnostic KÒKÒ™ et choisir le calibre',
      'réaliser une création VÈKPÈ™, un SÍNSIN™ et un soin FÍNFÍN™ au standard MND',
      'tenir la relation cliente, l’hygiène et la fiche',
    ],
    programme: [
      { nom: 'Le référentiel', seances: 2, contenu: 'Les quatre temps, les paliers, le lexique ™, les standards de la Maison et ce qu’ils interdisent.' },
      { nom: 'La mise à niveau des gestes', seances: 4, contenu: 'Les écarts relevés au test d’entrée, repris un à un : création, resserrage, soin.' },
      { nom: 'Le dossier', seances: 2, contenu: 'Constituer le dossier de pratique, choisir ses cas, apprendre à le présenter.' },
      { nom: 'La préparation au jury', seances: 2, contenu: 'Une épreuve pratique à blanc et un oral à blanc, notés comme le vrai jury.' },
    ],
    tetesReelles: 'trois rituels complets en autonomie supervisée',
  },
];

export const parcoursParId = (id: string): ParcoursMND | undefined =>
  PARCOURS_MND.find((p) => p.id === id);

/* LE NOM APLATI : sans accent, sans apostrophe, sans ligature. La ligature
   manquait (13 septembre 2026) : « Œ » ne se décompose pas en « OE », et
   « L'Oeuvre » écrit à la main restait un autre parcours que « L'Œuvre », au
   contraire de ce que promettait le commentaire d'ici. */
const aPlat = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[Œœ]/g, 'oe').replace(/[Ææ]/g, 'ae')
    .replace(/[’']/g, '').toLowerCase().trim();

/** Le parcours dont une formation porte le nom, graphie près. */
export const parcoursDuNom = (nom: string): ParcoursMND | undefined =>
  PARCOURS_MND.find((p) => aPlat(p.titre) === aPlat(nom));

/** CE QU'IL RESTE À POSER. Les formations déjà créées ne se doublent pas :
    reposer les neuf sur une Académie qui en porte trois en ferait douze, dont
    trois jumelles, et il faudrait les démêler à la main.

    LA COMPARAISON SE FAIT SUR LE NOM APLATI — sans accent ni apostrophe : la
    Maison a pu écrire « L'Oeuvre » là où la référence dit « L'Œuvre », et deux
    graphies d'un même parcours restent un seul parcours. */
export function parcoursAPoser(
  dejaLa: readonly { name: string }[],
): ParcoursMND[] {
  const vus = new Set(dejaLa.map((f) => aPlat(f.name)));
  return PARCOURS_MND.filter((p) => !vus.has(aPlat(p.titre)));
}

/* ══ COMPLÉTER SANS ÉCRASER — 13 septembre 2026 ═══════════════════════
   Les neuf formations sont déjà posées dans l'Académie, avec une ligne de
   description et les quatre temps pour programme. Leur apporter le contenu
   validé ne doit RIEN reprendre de ce que la Maison a écrit :
   · une rubrique ne se remplit que VIDE ;
   · un prix ne se pose que s'il est encore à zéro ;
   · la description ne se remplace que si elle est vide, ou si elle est
     l'ancienne phrase commune de L'Œuvre et de Maître MND ;
   · LE PROGRAMME ne remplace les modules que s'ils sont encore les quatre
     temps posés par défaut, ET qu'aucune apprenante n'y est inscrite : ses
     modules validés sont retrouvés par leur nom, et un nom qui change
     effacerait sa progression. Si les modules portent déjà les noms du
     parcours, seules leurs séances et leur contenu se posent. */

/** La forme minimale d'une formation que ce juge sait compléter. */
export type FicheDeFormation = {
  name: string;
  priceXof: number;
  description?: string;
  modules?: string[];
  public?: PublicDeFormation;
  accroche?: string;
  pourQui?: string;
  pourEntrer?: string;
  sait?: string[];
  /** Aligné sur `modules`, index pour index. */
  programme?: { seances?: number; contenu?: string }[];
  tetesReelles?: string;
};

/** Les phrases de compétences qui ne disaient pas la bonne chose, et qu'on
    remplace quand on les retrouve telles quelles. */
export const COMPETENCES_REMPLACEES: readonly string[] = [
  'la maîtrise d’œuvre du soin des locks, la conduite d’atelier et la transmission de la méthode',
  /* Les trois phrases à tiret cadratin : le certificat les imprimait telles
     quelles, et la Maison n'écrit pas de tiret cadratin. */
  'les gestes fondateurs de la Maison — purifier, nourrir, sceller et couronner la mèche',
  'les gestes fondateurs du soin des locks — lavage doux, hydratation et protection de la fibre',
  'la formulation des soins de la gamme — origines des ingrédients, protocoles et substitutions',
];

export function completeLaFiche<F extends FicheDeFormation>(
  f: F,
  o: { modulesParDefaut: readonly string[]; inscrites: number },
): { fiche: F; rubriques: string[] } {
  const p = parcoursDuNom(f.name);
  if (!p) return { fiche: f, rubriques: [] };
  const vide = (t?: string) => !t || !t.trim();
  const patch: Partial<FicheDeFormation> = {};
  const rubriques: string[] = [];

  if (!f.public) { patch.public = p.public; rubriques.push('public'); }
  if (vide(f.accroche)) { patch.accroche = p.accroche; rubriques.push('accroche'); }
  if (vide(f.pourQui)) { patch.pourQui = p.pourQui; rubriques.push('pour qui'); }
  if (vide(f.pourEntrer)) { patch.pourEntrer = p.pourEntrer; rubriques.push('pour entrer'); }
  if (!f.sait?.length) { patch.sait = [...p.sait]; rubriques.push('ce qu’elle sait'); }
  if (vide(f.tetesReelles)) { patch.tetesReelles = p.tetesReelles; rubriques.push('têtes réelles'); }
  const desc = (f.description ?? '').trim();
  if (desc === '' || (COMPETENCES_REMPLACEES.includes(desc) && desc !== p.competences)) {
    patch.description = p.competences;
    rubriques.push('description');
  }
  if (!f.priceXof) { patch.priceXof = p.prixXof; rubriques.push('prix'); }

  const noms = p.programme.map((m) => m.nom);
  const contenus = () => p.programme.map(({ seances, contenu }) => ({ seances, contenu }));
  const modules = f.modules;
  const parDefaut = modules === undefined
    || (modules.length === o.modulesParDefaut.length && modules.every((m, i) => m === o.modulesParDefaut[i]));
  const memesNoms = !!modules && modules.length === noms.length
    && modules.every((m, i) => aPlat(m) === aPlat(noms[i]));
  const programmeVide = !(f.programme ?? []).some((m) => (m.seances ?? 0) > 0 || !vide(m.contenu));
  if (memesNoms) {
    if (programmeVide) { patch.programme = contenus(); rubriques.push('programme'); }
  } else if (parDefaut && o.inscrites === 0) {
    patch.modules = noms;
    patch.programme = contenus();
    rubriques.push('programme');
  }

  return rubriques.length ? { fiche: { ...f, ...patch }, rubriques } : { fiche: f, rubriques };
}
