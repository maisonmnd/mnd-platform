/* LA COMMUNAUTÉ MND — 28 septembre 2026, maquette validée
   (`public/maquette-la-communaute-mnd.html`) : « construis », puis
   « construis avec les patterns réels de la marque » (Yéman), d'après
   Corinne de Farme. Quatre blocs : la communauté (trois cartes), le
   parrainage, les ingrédients (une page d'histoire par ingrédient, comme
   leur « Fleur d'amandier »), l'avant / après.

   LES INGRÉDIENTS NE S'INVENTENT PAS. Ce sont ceux des six formules du
   Laboratoire de la Maison (`routes/vente/lab.ts`) et du soin VÍVÍVÓ™ : leur
   origine, leur qualité, la note du maître viennent de là. L'histoire de
   chaque plante est ce que la botanique en dit couramment ; aucun bienfait
   médical n'est promis.

   L'AVANT / APRÈS EST VIDE tant que la Maison n'a pas donné ses paires :
   chaque photo passe par le registre (`docs/site-revelateur/photos.md`) et
   l'accord de la cliente, comme toute la galerie. La section ne sort pas
   tant que la liste est vide. */

export type CarteCommunaute = { titre: string; texte: string; vers: string; suite: string; marque: string };

export const COMMUNAUTE = {
  sur: 'La communauté MND',
  titre: 'Bienvenue dans la Maison.',
  cartes: [
    {
      titre: 'Devenez testeuse',
      texte: 'Essayez nos nouveaux soins avant tout le monde, et dites-nous ce que vous en pensez.',
      vers: '/testeuse/', suite: 'Je m’inscris', marque: 'cire-cuivre.png',
    },
    {
      titre: 'Conseils et astuces',
      texte: 'Le Journal, le diagnostic et votre routine, pour soigner votre couronne entre deux visites.',
      vers: '/journal/', suite: 'Lire le Journal', marque: 'medaillon-seul-indigo.png',
    },
    {
      titre: 'Nos engagements',
      texte: 'Des produits éprouvés sur nos couronnes, une hygiène sans faille, et un regard avant chaque geste.',
      vers: '/engagements/', suite: 'Nos promesses', marque: 'sceau-ivoire-indigo.png',
    },
  ] as CarteCommunaute[],
};

export const PARRAINAGE = {
  sur: 'Le parrainage',
  titre: 'Offrez la Maison à une amie.',
  ligne: 'Chaque cliente est une ambassadrice. Votre amie découvre la Maison avec un cadeau de bienvenue ; quand elle est venue, vous choisissez le vôtre.',
  pas: [
    ['Vous recevez votre code', 'Votre prénom et votre numéro, et le site vous donne un code à vous, à partager sur WhatsApp.'],
    ['Votre amie réserve avec votre code', 'Sur le site, le code déjà posé dans le lien. Son cadeau de bienvenue l’attend à sa première visite.'],
    ['Elle vient, vous choisissez', 'Dès que sa visite est passée, votre récompense vous attend dans Ma Couronne : un soin offert, ou une remise sur un produit de la Gamme.'],
    ['Ses amies vous reviennent en écho', 'Quand votre amie fait venir les siennes, vous recevez un écho. Et vous montez de rang : Pousse, Tresse, Couronne, Reine de la Maison.'],
  ] as [string, string][],
  regle: 'Un code sert une fois par nouvelle cliente, jamais à une cliente déjà connue de la Maison, ni à la marraine elle-même. Deux générations, jamais d’argent : des soins et des remises.',
};

/* ── LES INGRÉDIENTS ─────────────────────────────────────────────────── */
export type Ingredient = {
  slug: string;
  nom: string;
  /** Le nom botanique, en italique. */
  latin: string;
  /** Deux ou trois mots, sur la carte. */
  role: string;
  /** La ligne du bandeau, comme la leur sous « Fleur d'Amandier ». */
  accroche: string;
  origine: string;
  pourquoi: string;
  maison: string;
  /** D'où la Maison le tire, et sous quelle forme (le Laboratoire). */
  fiche: { lieu: string; qualite: string; formule: string };
  /** Le mot de l'atelier : la note du maître au Laboratoire, ou la fiche du soin. */
  note: string;
  soin: { texte: string; vers: string };
  /** La teinte de la carte, prise dans la plante. */
  teinte: string;
  /** Une photo à venir (registre des photos), sinon le motif de la Maison. */
  photo?: string;
};

export const INGREDIENTS: Ingredient[] = [
  {
    slug: 'aloes', nom: 'L’aloès', latin: 'Aloe barbadensis Miller', role: 'Hydrater · Apaiser',
    accroche: 'Une feuille épaisse qui garde l’eau quand tout sèche autour d’elle. Les Égyptiens l’appelaient la plante de l’immortalité.',
    origine: 'L’aloès est une plante grasse, née selon les botanistes dans la péninsule Arabique, et cultivée depuis l’Antiquité autour de la Méditerranée puis dans toute l’Afrique. Il aime la chaleur et les sols pauvres, et il pousse volontiers au Bénin, dans les cours comme dans les champs. Ses feuilles charnues gardent l’eau pendant des semaines : c’est tout son secret.',
    pourquoi: 'Le gel de sa feuille est fait presque entièrement d’eau. Il réhydrate la fibre sans l’alourdir, et il apaise un cuir chevelu qui tiraille après un lavage ou une retwist. Surtout, il ne laisse pas de film : c’est la première chose que la Maison demande à ce qui entre dans une lock.',
    maison: 'Nous le prenons frais, et nous le posons le jour même. Il est la base du Voile Aloès & Lin, le vaporisateur que la Maison compose pour les couronnes assoiffées, et il revient dans nos soins quand un cuir chevelu demande de la douceur.',
    fiche: { lieu: 'Vallée de l’Ouémé, Bénin', qualite: 'Gel frais, pressé à froid', formule: 'Le Voile Aloès & Lin' },
    note: 'L’aloès doit être posé le jour même : passé quarante-huit heures, il perd son âme.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#3F5B3A',
  },
  {
    slug: 'hibiscus', nom: 'L’hibiscus', latin: 'Hibiscus sabdariffa', role: 'Fortifier · Faire briller',
    accroche: 'La fleur du bissap, rouge sombre, que l’Afrique de l’Ouest boit glacée depuis toujours.',
    origine: 'L’oseille de Guinée, que nous appelons bissap, est une plante de l’Afrique de l’Ouest. On la cultive pour ses calices rouges, séchés au soleil puis infusés : c’est la boisson des fêtes et des après-midi chauds, du Sénégal au Bénin. Dans le nord du pays, sur le plateau de l’Atacora, on la récolte à la main à la fin de la saison des pluies.',
    pourquoi: 'Ses calices donnent à l’eau une infusion acide et colorée. Sur la fibre, elle gaine et fait briller, et elle aide la couronne à tenir face à la casse. Elle travaille avec une protéine douce : jamais seule, jamais trop souvent.',
    maison: 'Nous l’infusons nous-mêmes, fleurs séchées dans l’eau frémissante, jusqu’à la teinte pourpre. Elle entre dans La Cure Soie & Hibiscus, le masque que la Maison réserve aux longueurs qui cassent.',
    fiche: { lieu: 'Plateau de l’Atacora, Bénin', qualite: 'Fleurs séchées', formule: 'La Cure Soie & Hibiscus' },
    note: 'Trop de protéine raidit et casse à son tour. On alterne toujours : une semaine protéine, une semaine hydratation.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#7A2E3B',
  },
  {
    slug: 'baobab', nom: 'Le baobab', latin: 'Adansonia digitata', role: 'Nourrir · Assouplir',
    accroche: 'L’arbre à palabres, sous lequel on se réunit depuis des siècles. Certains ont plus de mille ans.',
    origine: 'Le baobab est l’arbre de la savane africaine. Son tronc immense garde l’eau pour traverser la saison sèche, et sous son ombre se tiennent, depuis toujours, les palabres des villages. Son fruit, qu’on appelle le pain de singe, porte des graines dont on presse une huile dorée : c’est elle que nous gardons.',
    pourquoi: 'Son huile est légère et riche en acides gras. Elle nourrit la racine sans la graisser, rend à la lock sa souplesse, et l’aide à plier plutôt qu’à rompre.',
    maison: 'Nous la choisissons de première pression. Elle est au cœur de L’Élixir Baobab & Café vert, le sérum des racines, et elle adoucit La Cure Soie & Hibiscus.',
    fiche: { lieu: 'Ferlo, Sénégal', qualite: 'Huile de première pression', formule: 'L’Élixir Baobab & Café vert' },
    note: 'Le café doit être vert, jamais torréfié : c’est le grain cru qui garde la caféine.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#8A5A3B',
  },
  {
    slug: 'karite', nom: 'Le karité', latin: 'Vitellaria paradoxa', role: 'Sceller · Protéger',
    accroche: 'On l’appelle l’or des femmes : de la noix au beurre, ce sont leurs mains qui le font.',
    origine: 'Le karité est un arbre de la savane de l’Afrique de l’Ouest, du Sénégal au Bénin et au Ghana. Il ne se plante pas, il se garde : il pousse seul et donne ses fruits après une quinzaine d’années. Les femmes ramassent les noix, les sèchent, les concassent, puis barattent la pâte à la main jusqu’au beurre. C’est pourquoi on dit l’or des femmes.',
    pourquoi: 'Le beurre scelle. Posé en couche fine sur des pointes déjà hydratées, il garde l’eau dans la fibre et la protège du soleil et de la poussière. Épais, ou posé à la racine, il s’accumule dans la lock : la mesure fait tout.',
    maison: 'Nous le prenons brut, baratté à la main, et nous le fondons sans jamais dépasser soixante degrés. Il est la base du Beurre Karité & Mafura, que la Maison pose sur les pointes, en dernier geste, et toujours avec parcimonie.',
    fiche: { lieu: 'Savane de Tamale, Ghana', qualite: 'Beurre brut, baratté à la main', formule: 'Le Beurre Karité & Mafura' },
    note: 'Au-delà de soixante degrés, le karité tourne et devient granuleux. La température, c’est tout le métier.',
    soin: { texte: 'L’entretien des locks', vers: '/entretien-locks/' }, teinte: '#B08A55',
  },
  {
    slug: 'neem', nom: 'Le neem', latin: 'Azadirachta indica', role: 'Purifier · Apaiser le cuir',
    accroche: 'Le margousier, planté au bord des routes et des cours pour son ombre et son amertume.',
    origine: 'Le neem vient du sous-continent indien, où la médecine traditionnelle l’emploie depuis des millénaires. Il a traversé les océans et s’est si bien acclimaté en Afrique de l’Ouest qu’on le croit d’ici : au Bénin, il borde les routes et ombrage les cours. De ses graines, on presse une huile épaisse, à l’odeur forte.',
    pourquoi: 'Son huile assainit le cuir chevelu et calme ce qui démange. Elle convient aux cuirs sensibles, là où les pellicules et les rougeurs reviennent, à condition d’être bien mariée : pure, elle est trop forte.',
    maison: 'Nous la tempérons au beurre de cacao et à la nigelle, et nous faisons toujours un essai au pli du coude. C’est la base du Baume Neem & Calendula, que la Maison réserve aux cuirs chevelus qui réagissent.',
    fiche: { lieu: 'Tamil Nadu, Inde', qualite: 'Huile pressée à froid', formule: 'Le Baume Neem & Calendula' },
    note: 'Le neem sent fort, on le tempère au cacao et à la nigelle. Et toujours un essai au pli du coude.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#4F5A2A',
  },
  {
    slug: 'moringa', nom: 'Le moringa', latin: 'Moringa oleifera', role: 'Stimuler · Densifier',
    accroche: 'L’arbre de vie, dont chaque feuille nourrit : on le plante près des maisons.',
    origine: 'Le moringa est né au pied de l’Himalaya, dans le nord de l’Inde. Il pousse vite, résiste à la sécheresse, et s’est répandu dans toute l’Afrique de l’Ouest, où on le plante près des maisons pour ses feuilles, qu’on mange, et ses graines, dont on tire une huile claire. On l’appelle l’arbre de vie.',
    pourquoi: 'Ses feuilles sont parmi les plus riches du monde végétal. Travaillé en massage sur le cuir chevelu, il réveille la racine et accompagne la pousse, là où la couronne s’éclaircit.',
    maison: 'Il entre, avec l’ail noir, le gingembre et la cannelle, dans VÍVÍVÓ™, l’activateur de pousse de la Maison : vingt minutes de massage crânien, en cure de trois séances.',
    fiche: { lieu: 'Afrique de l’Ouest', qualite: 'Feuille et huile', formule: 'VÍVÍVÓ™ · L’Activateur de Pousse' },
    note: 'Ail noir, moringa, gingembre, cannelle, et vingt minutes de massage crânien.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#5E7040',
  },
  /* L'HUILE D'AVOCAT — « rajouter l'huile d'avocat » (Yéman, 30 septembre
     2026). Elle est l'une des sept huiles de DÀNDÀN™, le soin hydratant. */
  {
    slug: 'avocat', nom: 'L’huile d’avocat', latin: 'Persea americana', role: 'Nourrir · Assouplir',
    accroche: 'Le fruit qui donne une huile verte, tirée de sa chair et non de son noyau.',
    origine: 'L’avocatier vient d’Amérique centrale, où on le cultive depuis des millénaires. Il a trouvé au sud du Bénin un climat à sa mesure : on le voit dans les cours et les vergers, et ses fruits se vendent sur tous les marchés de la saison. De sa chair, et non de son noyau, on presse une huile verte et épaisse.',
    pourquoi: 'C’est l’une des rares huiles qui entrent dans la fibre au lieu de rester dessus. Riche en acides gras et en vitamine E, elle nourrit les longueurs sèches, assouplit une lock qui raidit, et protège les pointes. Elle est douce avec le cuir chevelu.',
    maison: 'Nous la choisissons pressée à froid, et nous la mêlons aux autres : elle est l’une des sept huiles de DÀNDÀN™, le soin hydratant de la Maison, de la racine à la pointe.',
    fiche: { lieu: 'Sud du Bénin', qualite: 'Huile de pulpe, pressée à froid', formule: 'DÀNDÀN™ · Le Soin Hydratant' },
    note: 'L’huile d’avocat pénètre : on la pose sur une fibre déjà humide, jamais sur du sec.',
    soin: { texte: 'Les soins des locks', vers: '/soins-locks/' }, teinte: '#6E7A33',
  },
];

export const INGREDIENTS_TETE = {
  sur: 'Nos ingrédients',
  titre: 'Ce qui entre dans nos soins.',
  ligne: 'Des plantes d’Afrique, choisies une à une, et chacune avec son histoire.',
};

/* ── L'AVANT / APRÈS ─────────────────────────────────────────────────── */
export type PaireAvantApres = {
  /** Deux fichiers de `public/assets/photos/site/`, inscrits au registre. */
  avant: string;
  apres: string;
  /** Le geste et la durée ; jamais le prénom. */
  geste: string;
  detail: string;
};

/** VIDE tant que la Maison n'a pas donné ses paires et les accords. */
export const AVANT_APRES: PaireAvantApres[] = [];

export const ENGAGEMENTS: [string, string][] = [
  ['Des produits éprouvés', 'Rien n’entre dans nos soins qui n’ait d’abord été porté sur nos propres couronnes. Nos formules naissent au Laboratoire de la Maison, et nous savons d’où vient chaque plante.'],
  ['Une hygiène sans faille', 'Outils désinfectés entre chaque personne, linge propre pour chacune, espace nettoyé chaque jour.'],
  ['Un regard avant chaque geste', 'Nous regardons votre couronne avant de la toucher. Si un geste ne lui convient pas ce jour-là, nous vous le disons, même s’il était réservé.'],
  ['La vérité sur le temps', 'Une couronne se construit en mois, pas en heures. Nous vous disons combien de séances, combien de semaines, avant de commencer.'],
];
