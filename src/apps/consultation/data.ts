import { SERVICES_SEED, PRODUCTS_SEED, servicesStore, productsStore, type Service } from '../../shared/catalog';

/* La Consultation — données du rite, moteur de diagnostic et de projection.
   Tout le texte est final (source : prototype La Consultation.dc.html). */

export type Parcours = 'creation' | 'sos';

export const FEE_XOF = 15000;
export const MOMO_USSD = '*880*41*506846*15000#';
export const MOMO_ACCOUNT = '506846';

/** Devises offertes à la diaspora — pivot XOF. */
export const CURRENCY_CHOICES = ['XOF', 'USD', 'CAD', 'EUR'] as const;
export type CurrencyChoice = (typeof CURRENCY_CHOICES)[number];

/* ---------- Réponses ---------- */

export type PhotoSlot = { key: string; label: string; ph: string; tip: string; url: string | null; fileName: string | null };

export type Answers = {
  nom: string;
  dial: string;
  phone: string;
  ville: string;
  pays: string | null;
  hairType: string | null;
  etat: string | null; // état des cheveux (création) ou âge des locks (sos)
  washFreq: string | null;
  treatments: string[];
  routine: string | null;
  nuit: string | null;
  lifestyle: string[];
  goalLen: string | null;
  inspo: string | null;
  sosGoals: string[];
  sosZones: string[];
  horizon: string | null;
};

export const initialAnswers: Answers = {
  nom: '', dial: '+229', phone: '', ville: '', pays: 'Bénin',
  hairType: null, etat: null,
  washFreq: null, treatments: [], routine: null, nuit: null, lifestyle: [],
  goalLen: null, inspo: null, sosGoals: [], sosZones: [], horizon: null,
};

export const initialPhotos: PhotoSlot[] = [
  { key: 'ciel', label: 'La couronne vue du ciel', ph: 'Vue du dessus', tip: 'Du dessus, sur une raie — pour lire le cuir chevelu et la densité.', url: null, fileName: null },
  { key: 'flancs', label: 'Les flancs', ph: 'Profil gauche ou droit', tip: 'De profil, cheveux dégagés — pour la longueur et le volume.', url: null, fileName: null },
  { key: 'nuque', label: 'La nuque', ph: 'Vue arrière', tip: 'L’arrière et les pointes — pour évaluer la casse.', url: null, fileName: null },
];

/* ---------- Portrait ---------- */

export const PAYS_CHIPS: { name: string; dial: string; currency: CurrencyChoice }[] = [
  { name: 'Bénin', dial: '+229', currency: 'XOF' },
  { name: 'Côte d’Ivoire', dial: '+225', currency: 'XOF' },
  { name: 'Sénégal', dial: '+221', currency: 'XOF' },
  { name: 'Nigéria', dial: '+234', currency: 'XOF' },
  { name: 'France', dial: '+33', currency: 'EUR' },
  { name: 'Canada', dial: '+1', currency: 'CAD' },
  { name: 'États-Unis', dial: '+1', currency: 'USD' },
  { name: 'Royaume-Uni', dial: '+44', currency: 'EUR' },
  { name: 'Ailleurs', dial: '+229', currency: 'XOF' },
];

export const HAIR_CHIPS: [string, string][] = [
  ['3C', 'Boucles serrées'],
  ['4A', 'Crépu défini'],
  ['4B', 'Crépu serré'],
  ['4C', 'Crépu dense'],
];

export const ETAT_CREATION: [string, string, string][] = [
  ['libres', 'Cheveux libres', 'jamais lockés'],
  ['transition', 'Vagues / twists', 'en transition'],
  ['fausses', 'Fausses locks', 'temporaires'],
  ['nsp', 'Je ne sais pas', 'à évaluer'],
];

export const ETAT_SOS: [string, string, string][] = [
  ['<1', '< 1 an', 'jeunes locks'],
  ['1-3', '1 – 3 ans', 'en maturation'],
  ['3-6', '3 – 6 ans', 'établies'],
  ['6+', '6 ans +', 'matures'],
];

/* ---------- Habitudes ---------- */

export const WASH_CHIPS: [string, string][] = [
  ['rare', 'Rare'],
  ['bimensuel', '2× / mois'],
  ['hebdo', 'Hebdo'],
  ['frequent', 'Plusieurs / sem.'],
];

export const TREAT_CHIPS: [string, string][] = [
  ['aucun', 'Aucun'],
  ['coloration', 'Coloration'],
  ['decoloration', 'Décoloration'],
  ['henne', 'Henné'],
  ['tissage', 'Mèches / tissage'],
  ['crochet', 'Crochet / interlock serré'],
];

export const ROUTINE_CHIPS: [string, string, string][] = [
  ['minimale', 'Minimale', 'eau & soins rares'],
  ['reguliere', 'Régulière', 'huiles & hydratation'],
  ['riche', 'Riche', 'rituel suivi'],
];

export const NUIT_CHIPS: [string, string][] = [
  ['foulard', 'Foulard en soie'],
  ['bonnet', 'Bonnet satin'],
  ['taie', 'Taie satinée'],
  ['aucune', 'Aucune protection'],
];

export const LIFE_CHIPS: [string, string][] = [
  ['sport', 'Sport intense'],
  ['piscine', 'Piscine / mer'],
  ['soleil', 'Fort soleil'],
  ['eau-dure', 'Eau calcaire'],
  ['sec', 'Climat sec'],
];

/* ---------- Vision ---------- */

export const LEN_CHIPS: [string, string, string][] = [
  ['court', 'Épaules', 'mèche maîtrisée'],
  ['moyen', 'Poitrine', 'présence douce'],
  ['long', 'Taille', 'pleine couronne'],
  ['max', 'Sans limite', 'tout le potentiel'],
];

export const INSPO_CHIPS: [string, string, string][] = [
  ['micro', 'Microlocks', 'finesse & légèreté'],
  ['classiques', 'Locks classiques', 'présence & tenue'],
  ['nano', 'Nano-locks', 'haute densité'],
  ['soeurs', 'Sœurs / bohème', 'mèches libres'],
  ['sculptees', 'Sculptées', 'coiffages d’apparat'],
  ['naturel', 'Au naturel', 'sobriété souveraine'],
];

export const SOS_GOAL_CHIPS: [string, string][] = [
  ['Stopper la casse', 'la fibre cède'],
  ['Récupérer la densité', 'locks amincies'],
  ['Assainir le cuir', 'racines fragiles'],
  ['Réparer les pointes', 'extrémités usées'],
  ['Reprendre la longueur', 'après la perte'],
];

export const SOS_ZONE_CHIPS: [string, string][] = [
  ['rac', 'Racines'],
  ['lon', 'Longueurs'],
  ['poi', 'Pointes'],
  ['cuir', 'Cuir chevelu'],
];

export const HORIZON_CHIPS: string[] = ['Au plus vite', 'D’ici 6 mois', 'D’ici un an', 'Le temps de la maîtrise'];

/* ---------- Analyse ---------- */

export const ANALYSE_LINES = [
  'Elle observe la densité, mèche après mèche.',
  'Elle lit la santé du cuir chevelu.',
  'Elle mesure l’intégrité de la fibre.',
  'Elle croise vos habitudes et votre climat.',
  'Elle compose votre protocole souverain.',
];

export const ANALYSE_STEPS = [
  'Lecture des images…',
  'Cartographie du cuir chevelu…',
  'Analyse de l’intégrité…',
  'Croisement du mode de vie…',
  'Composition du protocole…',
];

/* ---------- Moteur de diagnostic ---------- */

export type DiagScores = {
  hydratation: number;
  cuir: number;
  integrite: number;
  densite: number;
  maturite: number;
};

export type Diag = {
  scores: DiagScores;
  avg: number;
  palier: Service['palier'];
  service: Service;
  cadence: string;
  lecture: string;
  flags: { t: string; tone: 'alerte' | 'veille' | 'sain' | 'info' }[];
  dry: number;
  nuitOk: boolean;
};

const clamp = (n: number) => Math.max(18, Math.min(96, Math.round(n)));

function findService(id: string): Service {
  const live = servicesStore.get().find((s) => s.id === id);
  return live ?? SERVICES_SEED.find((s) => s.id === id) ?? SERVICES_SEED[0];
}

export function computeDiag(a: Answers, parcours: Parcours): Diag {
  const sos = parcours === 'sos';
  const chem = a.treatments.filter((t) => t !== 'aucun').length;
  const dry = ['soleil', 'sec', 'piscine', 'eau-dure'].filter((k) => a.lifestyle.includes(k)).length;
  const nuitOk = a.nuit === 'foulard' || a.nuit === 'bonnet' || a.nuit === 'taie';

  const hydratation = clamp(
    72 - dry * 9 + (a.routine === 'minimale' ? -10 : a.routine === 'riche' ? 12 : 0) + (nuitOk ? 6 : 0)
  );
  const cuir = clamp(a.washFreq === 'rare' ? 48 : a.washFreq === 'frequent' ? 60 : a.washFreq === 'hebdo' ? 84 : 74);
  const integrite = clamp(92 - chem * 16 - (a.lifestyle.includes('sport') ? 4 : 0) + (nuitOk ? 2 : 0));
  const densite = clamp(sos ? 64 - chem * 6 : 58);
  const maturite = clamp(sos ? (a.etat === '6+' ? 90 : a.etat === '3-6' ? 72 : a.etat === '1-3' ? 50 : 32) : 14);

  const avg = (hydratation + cuir + integrite + densite) / 4;

  // Recommandation puisée dans le catalogue de la maison (lecture seule).
  let serviceId: string;
  let cadence: string;
  if (sos) {
    if (integrite < 50 || avg < 52) {
      serviceId = 'sv-sos-restauration';
      cadence = '4 h · cure de sauvetage en 3 séances';
    } else {
      serviceId = 'sv-reprise-locks';
      cadence = '3 h · reprise en 2 séances';
    }
  } else if (a.inspo === 'nano' || a.goalLen === 'max') {
    serviceId = 'sv-microlocks';
    cadence = '6 h · 2 séances liées';
  } else if (a.goalLen === 'long' || a.inspo === 'micro' || a.routine === 'riche') {
    serviceId = 'sv-locks-fines';
    cadence = '5 h · pose en une séance';
  } else {
    serviceId = 'sv-locks-moyennes';
    cadence = '4 h · pose en une séance';
  }
  const service = findService(serviceId);

  const lecture = sos
    ? integrite < 50
      ? 'Vos locks appellent un sauvetage. La fibre est éprouvée, mais la racine répond encore — la Maison peut restaurer la couronne.'
      : 'Vos locks sont fragilisées sans être en péril. Une reprise et une cure suffiront à leur rendre leur tenue.'
    : 'Une base prometteuse pour une première couronne. Le terrain est prêt — il s’agit maintenant de poser dans les règles et de laisser le temps faire son œuvre.';

  const flags: Diag['flags'] = [];
  if (hydratation < 60) flags.push({ t: 'Hydratation à relever — la sécheresse fragilise la mèche.', tone: 'alerte' });
  if (integrite < 60) flags.push({ t: 'Historique chimique présent — on rebâtit l’intégrité avant tout.', tone: 'veille' });
  if (cuir < 60) flags.push({ t: 'Cuir chevelu à rééquilibrer — la fréquence de lavage compte.', tone: 'veille' });
  if (!nuitOk) flags.push({ t: 'Nuit sans protection — la soie ou le satin préservent la couronne.', tone: 'veille' });
  if (flags.length === 0) flags.push({ t: 'Aucun signal d’alerte majeur — terrain sain, on construit.', tone: 'sain' });
  flags.push({ t: 'Climat & mode de vie intégrés à votre protocole.', tone: 'info' });

  return { scores: { hydratation, cuir, integrite, densite, maturite }, avg, palier: service.palier, service, cadence, lecture, flags, dry, nuitOk };
}

export function scoreTag(n: number): string {
  return n >= 80 ? 'Excellent' : n >= 65 ? 'Solide' : n >= 50 ? 'Correct' : n >= 38 ? 'Fragile' : 'À soigner';
}

export function scoreTone(n: number): 'haut' | 'moyen' | 'bas' | 'alerte' {
  return n >= 65 ? 'haut' : n >= 50 ? 'moyen' : n >= 38 ? 'bas' : 'alerte';
}

/* ---------- Projection souveraine ---------- */

export const MILESTONES = [0, 3, 6, 12, 18];

export function stageOf(m: number, parcours: Parcours): [string, string] {
  if (parcours === 'sos') {
    if (m <= 0) return ['Le sauvetage', 'On stoppe la casse et l’on refonde les racines fragiles.'];
    if (m <= 3) return ['La stabilisation', 'La fibre cesse de céder, le cuir chevelu se rééquilibre.'];
    if (m <= 6) return ['La reprise', 'Densité et tenue reviennent — la mèche se raffermit.'];
    if (m <= 12) return ['La pleine santé', 'La couronne est restaurée, dense et saine.'];
    return ['La maîtrise', 'Entretien de maîtrise — la couronne rendue tient seule.'];
  }
  if (m <= 0) return ['Le départ', 'La fondation est posée — sections nettes, première pose scellée dans les règles de l’art.'];
  if (m <= 4) return ['Le bourgeonnement', 'Les locks prennent. Premier resserrage des racines, le motif se dessine.'];
  if (m <= 8) return ['L’affirmation', 'La maille se referme, la mèche tient seule. La couronne s’affirme.'];
  if (m <= 14) return ['La maturité', 'Locks pleinement formées, denses et souveraines. L’entretien devient rituel.'];
  return ['Le couronnement', 'La maîtrise. La couronne est accomplie — prête pour l’apparat.'];
}

export type ProjMetric = { l: string; v: string; pct: number };

export function projMetrics(m: number, parcours: Parcours, d: Diag): ProjMetric[] {
  if (parcours === 'sos') {
    const f = Math.min(1, m / 9);
    const start = Math.round(d.avg);
    const sante = Math.min(96, Math.round(start + f * (94 - start)));
    const integ = Math.min(96, Math.round(d.scores.integrite + f * (95 - d.scores.integrite)));
    const dens = Math.min(96, Math.round(d.scores.densite + f * (92 - d.scores.densite)));
    return [
      { l: 'Santé restaurée', v: sante + ' %', pct: sante },
      { l: 'Intégrité reprise', v: integ + ' %', pct: integ },
      { l: 'Densité reprise', v: dens + ' %', pct: dens },
    ];
  }
  const growth = 1.2 + (d.nuitOk ? 0.15 : 0);
  const len = Math.round(2 + m * growth);
  const mature = Math.min(100, Math.round((m / 16) * 100));
  const dens = Math.min(100, Math.round(38 + m * 3.4));
  return [
    { l: 'Longueur projetée', v: len + ' cm', pct: Math.min(100, len * 1.6) },
    { l: 'Densité', v: dens + ' %', pct: dens },
    { l: 'Maturité', v: mature + ' %', pct: mature },
  ];
}

/** Horizon choisi → jalon mis en lumière. */
export function horizonToMilestone(horizon: string | null): number {
  if (horizon === 'Au plus vite') return 3;
  if (horizon === 'D’ici 6 mois') return 6;
  if (horizon === 'D’ici un an') return 12;
  if (horizon === 'Le temps de la maîtrise') return 18;
  return 6;
}

/* ---------- Protocole ---------- */

export type Temps = { no: string; n: string; g: string; prod: string };

export function protocoleTemps(d: Diag, parcours: Parcours): Temps[] {
  const sos = parcours === 'sos';
  return [
    {
      no: '01', n: 'Purifier',
      g: sos ? 'Purifier en douceur, libérer le cuir sans agresser.' : 'Laver et clarifier, préparer un terrain sain.',
      prod: d.dry > 1 ? 'Shampoing Moringa' : 'Shampoing Naturel',
    },
    { no: '02', n: 'Nourrir', g: 'Hydrater la fibre, fortifier la racine.', prod: 'Sérum Racines' },
    { no: '03', n: 'Sceller', g: 'Fixer le soin, verrouiller l’hydratation.', prod: d.scores.hydratation < 55 ? 'Huile Couronne +' : 'Huile Couronne' },
    { no: '04', n: 'Couronner', g: 'Définir, protéger, faire rayonner la mèche.', prod: 'Beurre Locks' },
  ];
}

export type RoadStep = { when: string; tag: 'Salon' | 'Maison' | 'Rituel'; t: string; s: string };

export function roadmapOf(d: Diag, parcours: Parcours): RoadStep[] {
  if (parcours === 'sos') {
    return [
      { when: 'Séance 1 · J0', tag: 'Salon', t: 'Sauvetage & diagnostic main', s: d.service.name + '. Le Maître stoppe la casse et refonde les racines fragiles.' },
      { when: 'Semaines 1–6', tag: 'Maison', t: 'Cure de fortification', s: 'Le rituel 4 temps à domicile, 2× / semaine. La fibre reprend du corps.' },
      { when: 'Séance 2 · M2', tag: 'Salon', t: 'Resserrage & contrôle', s: 'Resserrage intégral, vérification de l’intégrité, ajustement du protocole.' },
      { when: 'Trimestriel', tag: 'Rituel', t: 'Entretien de maîtrise', s: 'Un rendez-vous tous les 3 mois suffit à tenir la couronne restaurée.' },
    ];
  }
  return [
    { when: 'Séance 1 · J0', tag: 'Salon', t: 'La pose fondatrice', s: d.service.name + '. Sections, première maille, scellage.' },
    { when: 'Mois 1–3', tag: 'Maison', t: 'Le bourgeonnement', s: 'Rituel 4 temps hebdomadaire. On laisse les locks prendre sans les manipuler.' },
    { when: 'Séance 2 · M3', tag: 'Salon', t: 'Premier resserrage', s: 'Les racines sont reprises, le motif s’affirme.' },
    { when: 'M6 → couronnement', tag: 'Rituel', t: 'La maturité', s: 'Resserrage tous les 2–3 mois. La couronne atteint sa pleine densité.' },
  ];
}

/** Trousse maison — prix puisés dans la gamme DÒDÒ™ du catalogue. */
export function kitOf(): { n: string; priceXof: number }[] {
  const products = productsStore.get();
  const pick = (id: string, fallback: number, name: string) => {
    const p = products.find((x) => x.id === id) ?? PRODUCTS_SEED.find((x) => x.id === id);
    return { n: p?.name ?? name, priceXof: p?.priceXof ?? fallback };
  };
  return [
    pick('pr-serum-racines', 14000, 'Sérum Racines'),
    pick('pr-huile-couronne', 12000, 'Huile Couronne'),
    pick('pr-beurre-locks', 9500, 'Beurre Locks'),
  ];
}

/* ---------- Calendrier (dates calculées au jour le jour) ---------- */

export const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const DOW_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DOW_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const TIMES = ['09:30', '11:00', '14:30', '16:00', '17:30'];

export type CalMonth = { label: string; y: number; m: number };

export function monthsFrom(base: Date, count: number): CalMonth[] {
  const out: CalMonth[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push({ label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
