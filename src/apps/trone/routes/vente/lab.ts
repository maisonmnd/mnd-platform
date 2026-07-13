/* Le Laboratoire — l'atelier des formules (données & logique pure).
   Le formulateur maître : besoin capillaire → formule complète (nom, description,
   origines, protocole). Substitution d'ingrédients indisponibles avec régénération
   de la formule ET recalibrage du protocole. Inventaire par ingrédients disponibles,
   suivi des formules performantes. Transcrit du prototype `Le Trone.dc.html`. */

export type Concern = { k: string; label: string; glyph: string };

export const LAB_CONCERNS: Concern[] = [
  { k: 'hydratation', label: 'Hydratation', glyph: '◍' },
  { k: 'volume', label: 'Volume & densité', glyph: '◬' },
  { k: 'secheresse', label: 'Sécheresse', glyph: '☼' },
  { k: 'casse', label: 'Anti-casse', glyph: '⟊' },
  { k: 'psoriasis', label: 'Anti-psoriasis', glyph: '❉' },
  { k: 'pellicules', label: 'Anti-pellicules', glyph: '❄' },
];

export type Origin = { ingredient: string; role: string; origin: string; grade: string };
export type ProtocolStep = { n: string; title: string; detail: string };

export type Formula = {
  name: string;
  concernLabel: string;
  forme: string;
  contenance: string;
  description: string;
  origins: Origin[];
  protocolTime: string;
  protocol: ProtocolStep[];
  coutMatN: number;
  prixN: number;
  prixMult: number;
  maitreNote: string;
  /** style du bandeau d'identité */
  band: { bg: string; eyebrow: string; title: string; forme: string };
};

const BAND_DEEP = { bg: 'var(--color-indigo)', eyebrow: 'var(--copper-200)', title: 'var(--color-ivoire)', forme: 'rgba(244,240,232,.72)' };
const BAND_OBSIDIAN = { bg: 'var(--color-obsidian)', eyebrow: 'var(--copper-200)', title: 'var(--color-ivoire)', forme: 'rgba(244,240,232,.72)' };
const BAND_SABLE = { bg: 'var(--color-sable)', eyebrow: 'var(--copper-700)', title: 'var(--color-indigo)', forme: 'var(--ink-soft)' };

export const LAB_FORMULAS: Record<string, Formula> = {
  hydratation: {
    name: 'Le Voile Aloès & Lin', concernLabel: 'Hydratation', forme: 'Leave-in vaporisé', contenance: '250 ml',
    description: 'Un voile d’eau vivante qui réhydrate la fibre assoiffée sans l’alourdir — la boucle retrouve son rebond et garde l’eau toute la journée.',
    origins: [
      { ingredient: 'Gel d’aloès frais', role: 'Réservoir d’eau, apaise le cuir', origin: 'Vallée de l’Ouémé, Bénin', grade: 'pressé à froid' },
      { ingredient: 'Mucilage de graines de lin', role: 'Film hydratant, définit la boucle', origin: 'Plaines du Rif, Maroc', grade: 'décoction maison' },
      { ingredient: 'Glycérine végétale', role: 'Humectant, capte l’humidité de l’air', origin: 'Porto-Novo, Bénin', grade: 'd’origine palmiste' },
      { ingredient: 'Hydrolat de fleur d’oranger', role: 'Fraîcheur, parfum, tonifie', origin: 'Nabeul, Tunisie', grade: 'distillation lente' },
    ],
    protocolTime: '≈ 35 min · atelier',
    protocol: [
      { n: '1', title: 'Extraire le gel', detail: 'Filer le gel d’aloès, le mixer 30 s et filtrer au tamis fin pour ôter toute pulpe.' },
      { n: '2', title: 'La gelée de lin', detail: 'Faire frémir 2 c. à s. de graines dans 300 ml d’eau 8 min ; filtrer le mucilage encore tiède.' },
      { n: '3', title: 'Marier les eaux', detail: 'Hors du feu, unir aloès et lin, ajouter 5 % de glycérine et l’hydrolat. Remuer en huit.' },
      { n: '4', title: 'Conserver & couler', detail: 'Ajouter le conservateur agréé (0,8 %), couler en flacon spray ambré stérilisé.' },
      { n: '5', title: 'Le geste cliente', detail: 'Vaporiser sur cheveux essorés, lisser à la paume, froisser les pointes. À renouveler chaque matin.' },
    ],
    coutMatN: 1150, prixN: 9500, prixMult: 8,
    maitreNote: 'L’aloès doit être posé le jour même — passé 48 h il perd son âme. C’est là toute la différence avec un voile industriel.',
    band: BAND_DEEP,
  },
  volume: {
    name: 'L’Élixir Baobab & Café vert', concernLabel: 'Volume & densité', forme: 'Sérum racines', contenance: '60 ml',
    description: 'Un sérum qui réveille le bulbe et densifie la couronne — la caféine stimule, le baobab nourrit le follicule sans graisser la racine.',
    origins: [
      { ingredient: 'Huile de baobab', role: 'Nourrit le follicule, riche en oméga', origin: 'Ferlo, Sénégal', grade: 'première pression' },
      { ingredient: 'Macérât de café vert', role: 'Caféine — stimule la micro-circulation', origin: 'Hauts plateaux, Éthiopie', grade: 'grains crus broyés' },
      { ingredient: 'Huile de ricin noir', role: 'Épaissit, fortifie la tige', origin: 'Saint Elizabeth, Jamaïque', grade: 'grillé à la cendre' },
      { ingredient: 'Huile essentielle de menthe poivrée', role: 'Effet frais, vasodilatateur doux', origin: 'Provence, France', grade: 'distillée vapeur' },
    ],
    protocolTime: '≈ 50 min · macération 10 j',
    protocol: [
      { n: '1', title: 'Le macérât', detail: 'Couvrir le café vert moulu d’huile de baobab, laisser macérer 10 jours à l’abri, en remuant chaque jour.' },
      { n: '2', title: 'Filtrer le trésor', detail: 'Presser au tissu fin, récupérer l’huile ambrée chargée de caféine.' },
      { n: '3', title: 'Assembler', detail: 'Unir 70 % macérât, 25 % ricin noir ; ajouter 5 gouttes de menthe pour 60 ml.' },
      { n: '4', title: 'Flaconner en compte-gouttes', detail: 'Couler en flacon verre teinté à pipette, à conserver au frais.' },
      { n: '5', title: 'Le geste cliente', detail: 'Déposer raie par raie sur cuir propre, masser 3 min du bout des doigts. 3 soirs par semaine.' },
    ],
    coutMatN: 1980, prixN: 16000, prixMult: 8,
    maitreNote: 'Le café doit être vert, jamais torréfié : c’est le grain cru qui garde la caféine. Une erreur que font 9 ateliers sur 10.',
    band: BAND_OBSIDIAN,
  },
  secheresse: {
    name: 'Le Beurre Karité & Mafura', concernLabel: 'Sécheresse', forme: 'Beurre scellant', contenance: '150 ml',
    description: 'Un beurre fondant qui scelle l’hydratation dans les fibres les plus poreuses — pour les cheveux qui boivent et restent secs malgré tout.',
    origins: [
      { ingredient: 'Beurre de karité brut', role: 'Scelle, nourrit en profondeur', origin: 'Savane de Tamale, Ghana', grade: 'baratté à la main' },
      { ingredient: 'Huile de mafura', role: 'Réparation intense, anti-poreux', origin: 'Vallée du Zambèze, Mozambique', grade: 'pressée à froid' },
      { ingredient: 'Huile d’avocat', role: 'Pénètre la cuticule, assouplit', origin: 'Plateau de Kenya, Kenya', grade: 'vierge extra' },
      { ingredient: 'Cire de candelilla', role: 'Tenue du beurre, brillance', origin: 'Désert de Chihuahua, Mexique', grade: 'végétale raffinée' },
    ],
    protocolTime: '≈ 40 min · repos 2 h',
    protocol: [
      { n: '1', title: 'Fondre au bain-marie', detail: 'Faire fondre karité, mafura, avocat et candelilla à 60 °C sans dépasser, pour préserver les vitamines.' },
      { n: '2', title: 'Hors du feu', detail: 'Retirer dès la dernière paillette fondue ; laisser tiédir à 40 °C.' },
      { n: '3', title: 'Le foisonnement', detail: 'Placer 1 h au frais puis fouetter au batteur jusqu’à texture chantilly aérée.' },
      { n: '4', title: 'Empoter', detail: 'Garnir des pots opaques, lisser la surface, laisser figer 2 h à température ambiante.' },
      { n: '5', title: 'Le geste cliente', detail: 'Sur cheveux humides, méthode LOC : Liquide, Oil, puis ce beurre en Crème. Pointes en priorité.' },
    ],
    coutMatN: 1420, prixN: 12000, prixMult: 8,
    maitreNote: 'Au-delà de 60 °C, le karité « tourne » et devient granuleux. La température, c’est tout le métier.',
    band: BAND_SABLE,
  },
  casse: {
    name: 'La Cure Soie & Hibiscus', concernLabel: 'Anti-casse', forme: 'Masque protéiné', contenance: '200 ml',
    description: 'Un masque qui reconstruit la fibre fragilisée — la protéine de soie comble les brèches, l’hibiscus renforce sans rigidifier. Pour les longueurs qui cassent.',
    origins: [
      { ingredient: 'Protéine de soie hydrolysée', role: 'Comble les fissures de la kératine', origin: 'Bassin du Murcia, Espagne', grade: 'bas poids molécul.' },
      { ingredient: 'Poudre d’hibiscus', role: 'Renforce, gaine, fait briller', origin: 'Plateau de l’Atacora, Bénin', grade: 'fleurs séchées' },
      { ingredient: 'Huile de baobab', role: 'Élasticité, anti-rupture', origin: 'Ferlo, Sénégal', grade: 'première pression' },
      { ingredient: 'Décoction d’ortie', role: 'Silice — solidité de la tige', origin: 'Massif central, France', grade: 'feuilles sauvages' },
    ],
    protocolTime: '≈ 45 min',
    protocol: [
      { n: '1', title: 'La décoction', detail: 'Infuser ortie et hibiscus dans 250 ml d’eau frémissante 12 min ; filtrer la teinte pourpre.' },
      { n: '2', title: 'La base crème', detail: 'Émulsionner la décoction avec 8 % d’émulsifiant végétal et le baobab jusqu’à liaison nappante.' },
      { n: '3', title: 'La protéine', detail: 'À 40 °C, incorporer 4 % de soie hydrolysée — jamais à chaud, elle se dénature.' },
      { n: '4', title: 'Conserver & empoter', detail: 'Ajouter conservateur (0,8 %), ajuster le pH à 4,5 ; empoter en pot large.' },
      { n: '5', title: 'Le geste cliente', detail: 'Poser sur cheveux propres, 20 min sous charlotte tiède, rincer. 1 fois / semaine — pas plus, la protéine veut de la mesure.' },
    ],
    coutMatN: 1760, prixN: 14000, prixMult: 8,
    maitreNote: 'Trop de protéine raidit et casse à son tour. On alterne toujours : une semaine protéine, une semaine hydratation.',
    band: BAND_DEEP,
  },
  psoriasis: {
    name: 'Le Baume Neem & Calendula', concernLabel: 'Anti-psoriasis', forme: 'Baume cuir chevelu', contenance: '100 ml',
    description: 'Un baume apaisant qui calme les plaques, démange et squames du psoriasis — le neem assainit, le calendula répare la peau à vif. Sans cortisone.',
    origins: [
      { ingredient: 'Huile de neem', role: 'Antifongique, calme l’inflammation', origin: 'Régions du Tamil Nadu, Inde', grade: 'pressée à froid' },
      { ingredient: 'Macérât de calendula', role: 'Répare, apaise les lésions', origin: 'Ombrie, Italie', grade: 'fleurs bio' },
      { ingredient: 'Huile de nigelle (cumin noir)', role: 'Régule l’immunité cutanée', origin: 'Vallée du Nil, Égypte', grade: 'première pression' },
      { ingredient: 'Beurre de cacao', role: 'Barrière protectrice, fond doux', origin: 'Forêt de la Lobé, Cameroun', grade: 'brut non désodorisé' },
    ],
    protocolTime: '≈ 40 min · macérât 21 j',
    protocol: [
      { n: '1', title: 'Le macérât de souci', detail: 'Couvrir les fleurs de calendula d’huile d’olive douce, macérer 21 jours au soleil voilé.' },
      { n: '2', title: 'Filtrer', detail: 'Presser le macérât orangé, garder l’huile réparatrice.' },
      { n: '3', title: 'Fondre la base', detail: 'Faire fondre le cacao à 50 °C, unir au macérât, ajouter neem (10 %) et nigelle (10 %).' },
      { n: '4', title: 'Empoter en baume', detail: 'Couler tiède en pot stérile, laisser figer ; texture pommade souple.' },
      { n: '5', title: 'Le geste cliente', detail: 'Appliquer en couche fine sur les plaques le soir, masser doucement, laisser poser la nuit. Test cutané d’abord.' },
    ],
    coutMatN: 2240, prixN: 18000, prixMult: 8,
    maitreNote: 'Le neem sent fort — on le tempère au cacao et à la nigelle. Et toujours un test au pli du coude : le cuir psoriasique est susceptible.',
    band: BAND_OBSIDIAN,
  },
  pellicules: {
    name: 'Le Tonique Tea-tree & Citron vert', concernLabel: 'Anti-pellicules', forme: 'Tonique rinçage', contenance: '200 ml',
    description: 'Un tonique acidulé qui rééquilibre le cuir et chasse les pellicules à la racine — le tea-tree assainit, le vinaigre resserre, le cuir respire enfin.',
    origins: [
      { ingredient: 'Huile essentielle de tea-tree', role: 'Antifongique, anti-Malassezia', origin: 'Nouvelle-Galles, Australie', grade: 'distillée vapeur' },
      { ingredient: 'Vinaigre de cidre cru', role: 'Rééquilibre le pH, resserre', origin: 'Pays d’Auge, France', grade: 'non filtré, avec mère' },
      { ingredient: 'Infusion de romarin', role: 'Assainit, stimule, fortifie', origin: 'Collines de l’Atlas, Maroc', grade: 'feuilles séchées' },
      { ingredient: 'Jus de citron vert', role: 'Astringent, clarifie', origin: 'Casamance, Sénégal', grade: 'pressé frais' },
    ],
    protocolTime: '≈ 25 min',
    protocol: [
      { n: '1', title: 'L’infusion de romarin', detail: 'Infuser le romarin dans 200 ml d’eau bouillante 15 min, couvrir, filtrer.' },
      { n: '2', title: 'L’acide juste', detail: 'Unir l’infusion à 30 % de vinaigre de cidre et au jus d’un citron vert.' },
      { n: '3', title: 'L’actif', detail: 'Ajouter 15 gouttes de tea-tree dans un solubilisant végétal avant de mélanger à l’eau.' },
      { n: '4', title: 'Embouteiller', detail: 'Couler en flacon spray ; tonique à conserver 1 mois au frais.' },
      { n: '5', title: 'Le geste cliente', detail: 'Après le shampoing, vaporiser sur cuir, masser 2 min, laisser poser 5 min, rincer à l’eau fraîche. 2 fois / semaine.' },
    ],
    coutMatN: 980, prixN: 8000, prixMult: 8,
    maitreNote: 'Le tea-tree pur brûle — toujours le diluer dans un solubilisant, jamais directement dans l’eau où il flotterait en gouttes agressives.',
    band: BAND_SABLE,
  },
};

/** Ingrédients absents des réserves au réveil (par défaut). true/absent = en réserve. */
export const LAB_STOCK_DEFAULTS: Record<string, boolean> = {
  'Macérât de café vert': false,
  'Huile de mafura': false,
  'Protéine de soie hydrolysée': false,
};

export type Sub = { ingredient: string; origin: string; grade: string };

export const LAB_SUBS: Record<string, Sub[]> = {
  'Gel d’aloès frais': [{ ingredient: 'Gel d’aloe vera bio', origin: 'Guanacaste, Costa Rica', grade: 'stabilisé à froid' }, { ingredient: 'Hydrolat de concombre', origin: 'Nabeul, Tunisie', grade: 'distillation lente' }],
  'Mucilage de graines de lin': [{ ingredient: 'Mucilage de graines de chia', origin: 'Oaxaca, Mexique', grade: 'décoction maison' }, { ingredient: 'Gel de psyllium', origin: 'Gujarat, Inde', grade: 'téguments blonds' }],
  'Glycérine végétale': [{ ingredient: 'Miel d’acacia', origin: 'Casamance, Sénégal', grade: 'cru non chauffé' }, { ingredient: 'Gel de figue de barbarie', origin: 'Souss, Maroc', grade: 'pressé à froid' }],
  'Hydrolat de fleur d’oranger': [{ ingredient: 'Hydrolat de rose', origin: 'Kelaat M’Gouna, Maroc', grade: 'distillation lente' }, { ingredient: 'Hydrolat de lavande', origin: 'Provence, France', grade: 'distillée vapeur' }],
  'Huile de baobab': [{ ingredient: 'Huile de marula', origin: 'Limpopo, Afrique du Sud', grade: 'première pression' }, { ingredient: 'Huile de moringa', origin: 'Dosso, Niger', grade: 'pressée à froid' }],
  'Macérât de café vert': [{ ingredient: 'Macérât de guarana', origin: 'Amazonas, Brésil', grade: 'graines broyées' }, { ingredient: 'Macérât de thé vert', origin: 'Uji, Japon', grade: 'feuilles crues' }],
  'Huile de ricin noir': [{ ingredient: 'Huile de ricin doré', origin: 'Clarendon, Jamaïque', grade: 'pressée à froid' }, { ingredient: 'Poudre de chébé infusée', origin: 'Ouaddaï, Tchad', grade: 'traditionnelle' }],
  'Huile essentielle de menthe poivrée': [{ ingredient: 'HE de romarin à cinéole', origin: 'Atlas, Maroc', grade: 'distillée vapeur' }, { ingredient: 'HE de menthe verte', origin: 'Vallée du Nil, Égypte', grade: 'distillée vapeur' }],
  'Beurre de karité brut': [{ ingredient: 'Beurre de cacao brut', origin: 'Forêt de la Lobé, Cameroun', grade: 'non désodorisé' }, { ingredient: 'Beurre de mangue', origin: 'Andhra Pradesh, Inde', grade: 'pressé à froid' }],
  'Huile de mafura': [{ ingredient: 'Huile de kpangnan', origin: 'Atacora, Bénin', grade: 'pressée à froid' }, { ingredient: 'Huile de tamanu', origin: 'Tuléar, Madagascar', grade: 'vierge' }],
  'Huile d’avocat': [{ ingredient: 'Huile d’olive douce', origin: 'Sfax, Tunisie', grade: 'vierge extra' }, { ingredient: 'Huile de macadamia', origin: 'Mpumalanga, Afrique du Sud', grade: 'première pression' }],
  'Cire de candelilla': [{ ingredient: 'Cire de carnauba', origin: 'Ceará, Brésil', grade: 'végétale raffinée' }, { ingredient: 'Cire d’abeille filtrée', origin: 'Plateau d’Abomey, Bénin', grade: 'brute filtrée' }],
  'Protéine de soie hydrolysée': [{ ingredient: 'Protéine de riz hydrolysée', origin: 'Camargue, France', grade: 'bas poids molécul.' }, { ingredient: 'Protéine de blé hydrolysée', origin: 'Beauce, France', grade: 'végan' }],
  'Poudre d’hibiscus': [{ ingredient: 'Poudre de bissap', origin: 'Vallée du fleuve, Sénégal', grade: 'fleurs séchées' }, { ingredient: 'Poudre d’amla', origin: 'Uttar Pradesh, Inde', grade: 'fruits séchés' }],
  'Décoction d’ortie': [{ ingredient: 'Décoction de prêle', origin: 'Massif central, France', grade: 'tiges sauvages' }, { ingredient: 'Décoction de fenugrec', origin: 'Kairouan, Tunisie', grade: 'graines germées' }],
  'Huile de neem': [{ ingredient: 'Huile de nigelle', origin: 'Vallée du Nil, Égypte', grade: 'première pression' }, { ingredient: 'Macérât de margousier', origin: 'Tamil Nadu, Inde', grade: 'feuilles macérées' }],
  'Macérât de calendula': [{ ingredient: 'Macérât de camomille', origin: 'Ombrie, Italie', grade: 'fleurs bio' }, { ingredient: 'Gel d’aloès apaisant', origin: 'Vallée de l’Ouémé, Bénin', grade: 'pressé à froid' }],
  'Huile de nigelle (cumin noir)': [{ ingredient: 'Huile de bourrache', origin: 'Anjou, France', grade: 'première pression' }, { ingredient: 'Huile d’onagre', origin: 'Saskatchewan, Canada', grade: 'pressée à froid' }],
  'Beurre de cacao': [{ ingredient: 'Beurre de karité brut', origin: 'Savane de Tamale, Ghana', grade: 'baratté à la main' }, { ingredient: 'Beurre de kokum', origin: 'Goa, Inde', grade: 'pressé à froid' }],
  'Huile essentielle de tea-tree': [{ ingredient: 'HE de niaouli', origin: 'Côte Ouest, Madagascar', grade: 'distillée vapeur' }, { ingredient: 'HE de palmarosa', origin: 'Kerala, Inde', grade: 'distillée vapeur' }],
  'Vinaigre de cidre cru': [{ ingredient: 'Vinaigre de bissap', origin: 'Cotonou, Bénin', grade: 'fermenté maison' }, { ingredient: 'Jus de citron fermenté', origin: 'Casamance, Sénégal', grade: 'cru' }],
  'Infusion de romarin': [{ ingredient: 'Infusion de thé vert', origin: 'Collines de l’Atlas, Maroc', grade: 'feuilles séchées' }, { ingredient: 'Infusion de sauge', origin: 'Provence, France', grade: 'feuilles sauvages' }],
  'Jus de citron vert': [{ ingredient: 'Jus de citron jaune', origin: 'Menton, France', grade: 'pressé frais' }, { ingredient: 'Jus de pamplemousse', origin: 'Casamance, Sénégal', grade: 'pressé frais' }],
};

/** Mot-clé de l'ingrédient tel qu'il apparaît dans le protocole — pour le recalibrage. */
export const LAB_PROTO_TOKENS: Record<string, string> = {
  'Gel d’aloès frais': 'aloès', 'Mucilage de graines de lin': 'lin', 'Glycérine végétale': 'glycérine', 'Hydrolat de fleur d’oranger': 'hydrolat',
  'Huile de baobab': 'baobab', 'Macérât de café vert': 'café vert', 'Huile de ricin noir': 'ricin noir', 'Huile essentielle de menthe poivrée': 'menthe',
  'Beurre de karité brut': 'karité', 'Huile de mafura': 'mafura', 'Huile d’avocat': 'avocat', 'Cire de candelilla': 'candelilla',
  'Protéine de soie hydrolysée': 'soie', 'Poudre d’hibiscus': 'hibiscus', 'Décoction d’ortie': 'ortie',
  'Huile de neem': 'neem', 'Macérât de calendula': 'calendula', 'Huile de nigelle (cumin noir)': 'nigelle', 'Beurre de cacao': 'cacao',
  'Huile essentielle de tea-tree': 'tea-tree', 'Vinaigre de cidre cru': 'cidre', 'Infusion de romarin': 'romarin', 'Jus de citron vert': 'citron vert',
};

/* ---- La Gamme & le stock ---- */
export type GammeProduct = { name: string; concern: string; priceN: number; margin: string; unitsN: number; cap: number; unit: string };

export const GAMME_SEED: GammeProduct[] = [
  { name: 'Le Voile Aloès & Lin', concern: 'Hydratation', priceN: 9500, margin: '88 %', unitsN: 34, cap: 45, unit: 'flacons' },
  { name: 'L’Élixir Baobab & Café vert', concern: 'Volume & densité', priceN: 16000, margin: '88 %', unitsN: 6, cap: 40, unit: 'flacons' },
  { name: 'Le Beurre Karité & Mafura', concern: 'Sécheresse', priceN: 12000, margin: '88 %', unitsN: 22, cap: 40, unit: 'pots' },
  { name: 'La Cure Soie & Hibiscus', concern: 'Anti-casse', priceN: 14000, margin: '87 %', unitsN: 15, cap: 38, unit: 'pots' },
  { name: 'Le Baume Neem & Calendula', concern: 'Anti-psoriasis', priceN: 18000, margin: '87 %', unitsN: 2, cap: 25, unit: 'pots' },
  { name: 'Le Tonique Tea-tree & Citron vert', concern: 'Anti-pellicules', priceN: 8000, margin: '88 %', unitsN: 41, cap: 45, unit: 'flacons' },
];

/* ---- Performance ---- */
export type PerfRow = { name: string; score: number; rachat: string; resultats: string; vitesse: string };

export const PERF_SEED: PerfRow[] = [
  { name: 'Le Voile Aloès & Lin', score: 94, rachat: '71 %', resultats: '+0,9', vitesse: 'Rapide' },
  { name: 'Le Beurre Karité & Mafura', score: 89, rachat: '64 %', resultats: '+0,8', vitesse: 'Soutenue' },
  { name: 'L’Élixir Baobab & Café vert', score: 82, rachat: '58 %', resultats: '+0,6', vitesse: 'Rapide' },
  { name: 'Le Tonique Tea-tree & Citron vert', score: 68, rachat: '41 %', resultats: '+0,5', vitesse: 'Régulière' },
  { name: 'La Cure Soie & Hibiscus', score: 54, rachat: '33 %', resultats: '+0,3', vitesse: 'Lente' },
  { name: 'Le Baume Neem & Calendula', score: 47, rachat: '52 %', resultats: '+0,7', vitesse: 'Confidentielle' },
];

export type ReinventRow = { name: string; flag: string; flagK: 'red' | 'amber' | 'blue'; why: string; move: string };

export const REINVENT_SEED: ReinventRow[] = [
  { name: 'La Cure Soie & Hibiscus', flag: 'À réinventer', flagK: 'red', why: 'Rachat en baisse (33 %) et résultats consignés modestes : la cliente la juge trop raide. La protéine domine la formule.', move: 'Baisser la soie à 2 %, ajouter glycérine et guimauve pour la souplesse — tester sur 8 têtes.' },
  { name: 'Le Baume Neem & Calendula', flag: 'À déployer', flagK: 'amber', why: 'Résultats cliniques excellents (+0,7) mais ventes confidentielles : produit méconnu, odeur de neem dissuasive.', move: 'Reparfumer au néroli, créer une fiche pédagogie cuir, le mettre en avant dans la Vitrine des clientes concernées.' },
  { name: 'Le Tonique Tea-tree & Citron vert', flag: 'À surveiller', flagK: 'blue', why: 'Score correct mais rachat sous la barre des 45 % : effet réel, mais la cliente oublie de renouveler.', move: 'Passer en abonnement « cuir net » trimestriel — rappel automatique du Carnet à J+50.' },
];

/* ============================================================
   Logique pure du formulateur — swaps, protocole, correspondances.
   ============================================================ */

/** Nom court d'un ingrédient pour l'injecter dans le protocole recalibré. */
export function shortName(n: string): string {
  return n
    .replace(/^(Huile essentielle|HE|Huile|Macérât|Gel|Hydrolat|Poudre|Décoction|Beurre|Cire|Protéine|Jus|Vinaigre|Infusion|Mucilage|Miel)\s+(de\s+|d['’]\s*|à\s+)?/i, '')
    .replace(/^graines\s+d['’e]\s*/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim();
}

export type StockMap = Record<string, boolean>;

/** Un ingrédient est disponible si le stock ne le marque pas explicitement `false`. */
export const isAvail = (stock: StockMap, name: string) => stock[name] !== false;

/** Le stock effectif = défauts (3 manquants) fusionnés avec les bascules de l'atelier. */
export const effectiveStock = (stock: StockMap): StockMap => ({ ...LAB_STOCK_DEFAULTS, ...stock });

/** Tous les ingrédients connus (dé-dupliqués) — la réserve du laboratoire. */
export function labPantry(): string[] {
  const seen: string[] = [];
  Object.values(LAB_FORMULAS).forEach((f) => f.origins.forEach((o) => { if (!seen.includes(o.ingredient)) seen.push(o.ingredient); }));
  return seen;
}

/** Choisit des substituts pour les ingrédients manquants d'une formule (compose depuis le stock). */
export function composeFromStock(concernK: string, swaps: Record<string, Sub>, stock: StockMap): Record<string, Sub> {
  const f = LAB_FORMULAS[concernK];
  const eff = effectiveStock(stock);
  const next = { ...swaps };
  f.origins.forEach((o, idx) => {
    const key = `${concernK}:${idx}`;
    if (!isAvail(eff, o.ingredient)) {
      const opt = (LAB_SUBS[o.ingredient] || []).find((x) => isAvail(eff, x.ingredient)) || (LAB_SUBS[o.ingredient] || [])[0];
      if (opt) next[key] = opt;
    } else {
      delete next[key];
    }
  });
  return next;
}

export type OriginView = Origin & {
  key: string;
  swapped: boolean;
  oos: boolean;
  origName: string;
  statusLabel: string;
  statusFg: string;
  rowClass: string;
  subOptions: (Sub & { stockLabel: string; stockFg: string })[];
};

export type ProtocolView = ProtocolStep & { changed: boolean };

/** Reconstruit la formule affichée : origines (substituées), protocole recalibré, compteur. */
export function buildFormulaView(concernK: string, swaps: Record<string, Sub>, stock: StockMap) {
  const base = LAB_FORMULAS[concernK];
  const eff = effectiveStock(stock);
  let swapCount = 0;

  const origins: OriginView[] = base.origins.map((o, idx) => {
    const key = `${concernK}:${idx}`;
    const sub = swaps[key];
    if (sub) swapCount++;
    const cur = sub ?? o;
    const oos = !sub && !isAvail(eff, o.ingredient);
    const subOptions = (LAB_SUBS[o.ingredient] || []).map((opt) => ({
      ...opt,
      stockLabel: isAvail(eff, opt.ingredient) ? 'En réserve' : 'À sourcer',
      stockFg: isAvail(eff, opt.ingredient) ? 'var(--trv-success)' : 'var(--ink-soft)',
    }));
    return {
      ingredient: cur.ingredient, role: o.role, origin: cur.origin, grade: cur.grade,
      key, swapped: !!sub, oos, origName: o.ingredient,
      statusLabel: sub ? 'Substitué' : oos ? 'Indisponible' : 'En réserve',
      statusFg: sub ? 'var(--copper-700)' : oos ? 'var(--trv-warning)' : 'var(--trv-success)',
      rowClass: sub ? 'swapped' : oos ? 'oos' : '',
      subOptions,
    };
  });

  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const repl = (txt: string) => {
    let out = txt;
    base.origins.forEach((o, idx) => {
      const sub = swaps[`${concernK}:${idx}`];
      const src = LAB_PROTO_TOKENS[o.ingredient];
      if (!sub || !src) return;
      out = out.replace(new RegExp(`\\b${esc(src)}\\b`, 'gi'), shortName(sub.ingredient));
    });
    return out;
  };
  const protocol: ProtocolView[] = base.protocol.map((p) => {
    const title = repl(p.title);
    const detail = repl(p.detail);
    return { ...p, title, detail, changed: title !== p.title || detail !== p.detail };
  });

  return {
    base,
    origins,
    protocol,
    swapCount,
    oosCount: origins.filter((o) => o.oos).length,
    protoChanged: protocol.some((p) => p.changed),
    name: swapCount > 0 ? `${base.name} · recomposé` : base.name,
  };
}

export type MatchView = {
  k: string;
  label: string;
  name: string;
  forme: string;
  score: number;
  coverPct: number;
  ready: boolean;
  readyLabel: string;
  readyFg: string;
  summary: string;
  barFill: string;
};

/** Classe les formules par couverture du stock — l'inventaire par ingrédients disponibles. */
export function buildMatches(stock: StockMap): MatchView[] {
  const eff = effectiveStock(stock);
  return LAB_CONCERNS.map((c) => {
    const f = LAB_FORMULAS[c.k];
    let have = 0, subbed = 0, missing = 0;
    f.origins.forEach((o) => {
      if (isAvail(eff, o.ingredient)) have++;
      else if ((LAB_SUBS[o.ingredient] || []).some((opt) => isAvail(eff, opt.ingredient))) subbed++;
      else missing++;
    });
    const total = f.origins.length;
    const score = (have + subbed * 0.5) / total;
    return {
      k: c.k, label: c.label, name: f.name, forme: f.forme, score,
      coverPct: Math.round(((have + subbed) / total) * 100),
      ready: missing === 0,
      readyLabel: missing === 0 ? (subbed ? 'Composable · avec substituts' : 'Prête · tout en réserve') : 'Incomplète',
      readyFg: missing === 0 ? 'var(--trv-success)' : 'var(--trv-warning)',
      summary: `${have}/${total} en réserve${subbed ? ` · ${subbed} à substituer` : ''}${missing ? ` · ${missing} introuvable` : ''}`,
      barFill: missing === 0 ? (subbed ? 'var(--color-copper)' : 'var(--trv-success)') : 'var(--trv-warning)',
    };
  }).sort((a, b) => b.score - a.score);
}
