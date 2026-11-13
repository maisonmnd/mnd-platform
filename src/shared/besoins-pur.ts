/* ══ LES BESOINS ET LEURS POINTS — 13 novembre 2026 ═══════════════════════
   La Consultation, lot 1 (maquette « La Consultation MND », validée par
   « construis »). « Identifie une liste de près de 100 besoins avec les
   services qui répondent à leur besoin, avec un système de points pour
   qualifier un service qui est assez cher : il faut une note minimum avant
   d'être éligible pour un service de plus de 40 000 F » (Yéman).

   LA RÈGLE QUI TIENT TOUT : un besoin ne donne ses points qu'aux prestations
   qui y répondent. Cocher « mes contours ne sont plus nets » ne rendra jamais
   ÀLÀLÀ™ éligible. Une prestation est proposée quand ses points (ceux des
   besoins choisis qui la citent, plus les preuves) atteignent le seuil du
   palier de son prix.

   LA GARDE « PEAU » (13 novembre au soir) : plaques, psoriasis. La Maison ne
   pose pas de diagnostic médical (même règle que le diagnostic photo) : tant
   qu'elle n'a pas vu le cuir chevelu, détox, décapant et décoloration sont
   écartés, quels que soient les points.

   TOUT SE RÈGLE AU TRÔNE : ce module ne porte que la semence et le calcul.
   Le document `mnd_besoins` (shared/besoins.ts) est ce que la direction
   corrige. MODULE PUR : aucun magasin, aucun écran. */

export type IdFamille = string;
export type Famille = { id: IdFamille; nom: string };

export type Besoin = {
  id: string;
  famille: IdFamille;
  /** Les mots de la cliente, tels qu'elle les dirait. */
  mots: string;
  points: number;
  /** Les prestations qui y répondent, par identifiant du catalogue. */
  prestations: string[];
  /** La garde médicale : écarte ce qui irrite tant que la Maison n'a pas vu. */
  garde?: 'peau';
};

/** Palier de prix : 0 = I, 1 = II, 2 = III, 3 = IV. */
export type Palier = 0 | 1 | 2 | 3;
export const PALIERS_DITS = ['I', 'II', 'III', 'IV'] as const;

export type ReglagesDesBesoins = {
  version: 1;
  familles: Famille[];
  besoins: Besoin[];
  /** Les points demandés par palier (I, II, III, IV). */
  seuils: [number, number, number, number];
  /** Les bornes hautes des paliers I, II et III, en francs. */
  bornes: [number, number, number];
  preuves: { photo: number; visio: number; privee: number };
  /** Les prestations courantes : aucun seuil de points, quel que soit leur prix. */
  sansSeuil: string[];
  /** Le palier posé à la main, quand le prix ne le dit pas (forfait, comptage). */
  paliersPoses: Record<string, Palier>;
  /** Ce que la garde « peau » écarte. */
  ecartesParLaPeau: string[];
  modifieLe?: string;
  modifiePar?: string;
};

export const POINTS_PERMIS = [5, 10, 15, 20, 25, 30] as const;
export const SENS_DES_POINTS: Record<number, string> = {
  5: 'un confort', 10: 'une gêne', 15: 'une gêne qui dure', 20: 'un vrai problème', 25: 'un problème sérieux', 30: 'une transformation',
};

/* ── LA SEMENCE ─────────────────────────────────────────────────────────
   Les besoins de la maquette, reliés aux identifiants du catalogue en vigueur
   le 13 novembre 2026. Quatre prestations archivées ce jour-là (Retouches Post
   Création, AQUA LOCKS RITUAL™, Vanilles, Nattes) n’y figurent pas : on ne
   propose pas ce qui ne se vend plus. Les extensions naturelles de locks n'ont
   pas encore de fiche : leurs besoins naissent sans prestation, à relier au
   Trône le jour où elles existent. */
const P = {
  ori: 'sv-koko-ori', acc: 'sv-koko-sui', bil: 'sv-koko-bilan', con: 'svc-doto-conseil', essai: 'sv-sup-30',
  jum: 'sv-atl-i-jum', med: 'sv-atl-i-med', min: 'sv-atl-i-min', mic: 'sv-atl-i-mic', nan: 'sv-atl-i-nan', pic: 'sv-atl-i-pic',
  xxl: 'sv-sup-40', prel: 'sv-sup-03-c',
  pcc: 'sv-souv-crea', pcr: 'sv-souv-rep', pc1: 'sv-souv-1h', pc2: 'sv-souv-2h',
  finl: 'sv-finfin-legere', fine: 'sv-atl-iv-gbe-c', finp: 'sv-atl-iv-gbp-c', alala: 'sv-atl-iv-ala-c', finr: 'sv-plt-50-ret-r-c',
  cure: 'sv-fft-iv-01', renais: 'sv-fft-iv-02', gbi: 'sv-plt-40-m', gbip: 'sv-atl-iv-gbp-prot', gbae: 'sv-plt-45-std', gbai: 'sv-plt-45-int',
  viv: 'sv-plt-30-c', vivc: 'sv-plt-30-cur', retc: 'sv-retouches-post-reprise', cont: 'x0ci24g7ya', subl: 'sv-gbeji-sublimation',
  sins: 'sv-atl-ii-e', sinsig: 'sv-atl-ii-l', expr: 'sv-venue-gbeji-exp', lum: 'sv-atl-iii-lum-c',
  kloe: 'sv-plt-05-ess-c', klos: 'sv-plt-05-sig-c', klop: 'sv-plt-05-pre-c', shp: 'sv-dds-shp-e',
  acd: 'sv-aca-ini-dec', acr: 'sv-aca-ini-res', aca: 'sv-aca-ini-aut',
  dan: 'sv-plt-10-m', danl: 'sv-plt-10-l', wewe: 'sv-plt-20-c', wd: 'sv-forfait-sv-plt-60-wd-c',
  sowa: '1740l5ysxj', wedec: 'sv-dds-dec', momc: 'sv-le-moment-cuir-chevelu',
  coul: 'sv-atl-iii-cou-c', cl: 'sv-forfait-sv-plt-60-cl-c', ecl: 'sv-atl-iii-ecl-c', coula: 'sv-dds-col-c', trans: 'sv-atl-iii-sub-c',
  ppc: 'sv-plt-60-pc-c', ppm: 'sv-plt-60-pc-m', ppl: 'sv-plt-60-pc-l',
  soig: 'sv-plt-50-sty-e', ssig: 'sv-plt-50-sty-s', sgj: 'sv-plt-50-eve-c',
  cge: 'sv-stu-c-sik-1-c', cgs: 'sv-stu-c-sik-2-c', cev: 'sv-stu-c-eve-c', rcf: 'sv-stu-b-cpf-c', rev: 'sv-stu-b-eve-c', mp: 'sv-plt-70-par', man: 'sv-plt-70-man-c', ped: 'sv-plt-70-ped-c',
  kpc: 'sv-kids-vekpe', knai: 'sv-kids-naissance', kri: 'sv-kids-rituel', ksi: 'sv-kids-sinsin', kgr: 'sv-kids-gbigbi', kre: 'sv-kids-retouche', kkl: 'sv-kids-kloklo',
} as const;
type Cle = keyof typeof P;

export const FAMILLES_DE_DEPART: Famille[] = [
  { id: 'creer', nom: 'Créer ma couronne' },
  { id: 'reparer', nom: 'Réparer et renforcer' },
  { id: 'volume', nom: 'Volume, longueur et extensions' },
  { id: 'structure', nom: 'Structure et tracé' },
  { id: 'finition', nom: 'Finition et netteté' },
  { id: 'entretien', nom: 'Entretien régulier' },
  { id: 'hydratation', nom: 'Hydratation et soin' },
  { id: 'lavage', nom: 'Lavage, détox et cuir chevelu' },
  { id: 'couleur', nom: 'Couleur et lumière' },
  { id: 'grands-jours', nom: 'Grands jours et style' },
  { id: 'enfants', nom: 'Enfants et confort' },
];

const S: [IdFamille, string, number, Cle[], 'peau'?][] = [
  ['creer', 'Je veux mes premières locks', 30, ['ori', 'jum', 'med', 'essai']],
  ['creer', 'Je veux des locks fines, très définies', 20, ['ori', 'min', 'mic', 'essai']],
  ['creer', 'Je veux des locks épaisses, faciles à vivre', 15, ['ori', 'jum', 'med']],
  ['creer', 'J’hésite sur la taille de mes locks', 10, ['essai', 'ori']],
  ['creer', 'Je veux voir le résultat avant de m’engager', 10, ['essai', 'ori']],
  ['creer', 'Mes cheveux sont lisses ou bouclés : est-ce possible ?', 15, ['ori', 'prel']],
  ['creer', 'Je veux des locks très fines, presque des fils', 25, ['ori', 'nan', 'pic']],
  ['creer', 'Je veux reprendre les contours un mois après ma création', 10, ['retc']],
  ['creer', 'Je veux être seule au salon pendant ma création', 15, ['pcc']],
  ['creer', 'Mes cheveux sont très longs', 10, ['xxl']],
  ['reparer', 'Quelques locks s’abîment', 10, ['finl', 'gbi']],
  ['reparer', 'Mes locks cassent', 20, ['fine', 'gbi', 'finp']],
  ['reparer', 'Mes locks s’ouvrent ou sont creuses', 25, ['finp', 'fine']],
  ['reparer', 'Mes locks s’amincissent à la racine', 20, ['fine', 'finp', 'gbi']],
  ['reparer', 'J’ai fait un défrisage ou une décoloration', 20, ['fine', 'gbip']],
  ['reparer', 'Mes locks ont été négligées longtemps', 25, ['acc', 'finp', 'alala']],
  ['reparer', 'Mes locks ont été faites ailleurs et je ne suis pas satisfaite', 20, ['acc', 'fine', 'alala']],
  ['reparer', 'Je veux un suivi après la réparation', 10, ['finr', 'cure']],
  ['reparer', 'Je veux une reconstruction suivie sur plusieurs mois', 20, ['cure', 'renais']],
  ['reparer', 'Je veux réparer dans le calme, salon fermé', 10, ['pcr']],
  ['volume', 'Ma tête paraît clairsemée', 25, ['alala', 'viv', 'vivc']],
  ['volume', 'J’ai perdu des locks', 20, ['alala', 'finp']],
  ['volume', 'Mes cheveux poussent lentement', 10, ['viv', 'vivc']],
  ['volume', 'Mes tempes se dégarnissent', 15, ['viv', 'vivc', 'retc']],
  ['volume', 'Des cheveux sortent de mes locks', 10, ['subl', 'sins']],
  ['volume', 'Je veux des locks plus pleines', 15, ['subl', 'alala']],
  ['volume', 'Je veux des locks plus longues, tout de suite', 25, []],
  ['volume', 'Je veux remplacer des locks perdues ou cassées', 20, ['finp']],
  ['volume', 'Je veux plus de locks sans attendre qu’elles poussent', 25, ['alala']],
  ['volume', 'Mon cuir chevelu se voit trop entre les locks', 15, ['alala', 'viv']],
  ['structure', 'Mes locks sont collées entre elles', 30, ['gbae', 'alala']],
  ['structure', 'Mon tracé est irrégulier', 20, ['alala', 'sinsig']],
  ['structure', 'Mes locks n’ont pas toutes la même taille', 20, ['alala', 'fine']],
  ['structure', 'Je veux défaire mes locks', 30, ['gbae', 'gbai']],
  ['structure', 'Je veux défaire seulement certaines locks', 20, ['gbae', 'alala']],
  ['structure', 'Mes locks sont anciennes et très denses', 25, ['gbai']],
  ['structure', 'Je veux changer de taille de locks', 25, ['alala', 'gbae', 'ori']],
  ['structure', 'Mes locks sont tordues, sans forme', 15, ['sinsig', 'fine']],
  ['structure', 'Je veux un nouveau tracé', 25, ['alala']],
  ['structure', 'Je veux repartir de zéro', 30, ['gbai', 'ori']],
  ['finition', 'Mes contours ne sont plus nets', 5, ['retc', 'cont']],
  ['finition', 'Mes racines ont repoussé', 10, ['sins', 'retc']],
  ['finition', 'Je veux des baby hairs dessinés', 5, ['cont', 'retc']],
  ['finition', 'Je veux une reprise qui tienne plus longtemps', 10, ['sinsig']],
  ['finition', 'Je veux une finition parfaite pour une occasion', 10, ['sinsig', 'ssig']],
  ['finition', 'Mes locks frisottent', 10, ['subl', 'sins']],
  ['finition', 'Je veux un rafraîchissement rapide entre deux venues', 5, ['expr', 'retc']],
  ['finition', 'Mes pointes sont abîmées', 10, ['finl', 'gbi']],
  ['finition', 'Je veux des locks brillantes', 5, ['lum']],
  ['finition', 'Je veux une reprise minutieuse, lock par lock', 10, ['sinsig', 'sins']],
  ['entretien', 'Je veux entretenir mes locks toutes les six semaines', 10, ['sins', 'kloe']],
  ['entretien', 'Je veux espacer mes visites', 10, ['sinsig']],
  ['entretien', 'Je veux apprendre à entretenir mes locks moi-même', 15, ['acd', 'acr', 'aca']],
  ['entretien', 'Je veux apprendre le resserrage', 20, ['acr', 'aca']],
  ['entretien', 'Je veux être autonome entre deux venues', 20, ['aca']],
  ['entretien', 'Je veux une sortie coiffée après mon entretien', 5, ['soig', 'ssig']],
  ['hydratation', 'Mes locks sont sèches', 10, ['dan', 'danl']],
  ['hydratation', 'Mes locks sont raides, sans souplesse', 10, ['dan']],
  ['hydratation', 'Je veux une hydratation profonde', 10, ['dan']],
  ['lavage', 'Je veux décaper mes locks, enlever tout ce qui s’est accumulé', 20, ['wewe', 'wd', 'wedec']],
  ['lavage', 'J’ai mon propre décapant ou shampoing clarifiant', 5, ['wedec']],
  ['lavage', 'Mes locks ont des résidus de produits', 15, ['wewe', 'wd', 'klop']],
  ['lavage', 'Mes locks ne sont pas propres, même après le lavage', 15, ['wewe', 'klos', 'wd']],
  ['lavage', 'Des peluches et des dépôts se voient dans mes locks', 15, ['wewe', 'klop']],
  ['lavage', 'Mes locks sentent le renfermé', 15, ['wewe', 'wd']],
  ['lavage', 'Mon cuir chevelu me démange', 15, ['klos', 'wewe', 'momc']],
  ['lavage', 'J’ai des pellicules', 10, ['wewe', 'klos']],
  ['lavage', 'J’ai des plaques sur le cuir chevelu', 20, ['bil', 'kloe'], 'peau'],
  ['lavage', 'J’ai du psoriasis', 20, ['bil', 'kloe'], 'peau'],
  ['lavage', 'Mon cuir chevelu est sensible', 10, ['klos', 'momc', 'danl']],
  ['lavage', 'J’ai des poux', 15, ['sowa']],
  ['lavage', 'Je veux un lavage rapide', 5, ['kloe']],
  ['lavage', 'Je veux un lavage complet, avec un massage', 5, ['klos']],
  ['lavage', 'Je veux un lavage profond, avec un masque', 10, ['klop']],
  ['lavage', 'J’apporte mon propre shampoing', 5, ['shp']],
  ['lavage', 'Je veux un soin complet, détox et hydratation', 15, ['wd']],
  ['couleur', 'Je veux une couleur naturelle, sans ammoniaque', 15, ['coul', 'cl']],
  ['couleur', 'Je veux raviver ma couleur', 5, ['ecl']],
  ['couleur', 'J’ai ma propre coloration', 5, ['coula']],
  ['couleur', 'Je veux des locks plus claires, blondes', 25, ['trans', 'ppc', 'ppm']],
  ['couleur', 'Je veux couvrir mes cheveux blancs', 10, ['coul', 'ecl']],
  ['couleur', 'Je veux une couleur et de la brillance', 15, ['cl']],
  ['couleur', 'Ma couleur a terni', 5, ['ecl', 'lum']],
  ['couleur', 'J’ai fait une décoloration et mes locks souffrent', 25, ['ppc', 'ppm', 'ppl', 'gbip']],
  ['couleur', 'Je veux tester une couleur avant de me lancer', 10, ['coul']],
  ['couleur', 'J’ai des locks longues et denses à colorer', 15, ['ppl', 'coul']],
  ['grands-jours', 'Je me marie', 20, ['cgs', 'cge']],
  ['grands-jours', 'J’ai un événement, une cérémonie', 10, ['cev', 'sgj']],
  ['grands-jours', 'Je veux une coiffure pour le quotidien', 5, ['soig']],
  ['grands-jours', 'Je veux une coiffure élaborée', 5, ['ssig']],
  ['grands-jours', 'Je veux un essai avant le grand jour', 15, ['cgs']],
  ['grands-jours', 'Mes cheveux naturels sont libres, je veux une coupe', 10, ['rcf']],
  ['grands-jours', 'Je veux définir mes boucles', 5, ['rev']],
  ['grands-jours', 'Je veux un moment complet, mains et pieds compris', 5, ['mp', 'man', 'ped']],
  ['enfants', 'Je veux des locks pour mon enfant', 30, ['con', 'kpc', 'knai']],
  ['enfants', 'Mon enfant a déjà des locks à entretenir', 10, ['kri', 'ksi']],
  ['enfants', 'Les locks de mon enfant s’abîment', 10, ['kgr', 'kre']],
  ['enfants', 'Je veux un lavage doux pour mon enfant', 5, ['kkl']],
  ['enfants', 'Je veux un conseil pour les cheveux de mon enfant', 5, ['con']],
  ['enfants', 'Je veux que mon enfant soit suivi après sa première pose', 15, ['knai', 'kre']],
  ['enfants', 'Je veux être seule au salon, en toute discrétion', 10, ['pc1', 'pc2']],
  ['enfants', 'Je viens avec une amie ou ma fille', 10, ['pc2']],
  ['enfants', 'J’habite loin, je veux limiter mes venues', 15, ['sinsig', 'aca']],
  ['enfants', 'Je ne sais pas ce qu’il me faut', 5, ['bil', 'acc']],
];

/** Les prestations courantes, sans seuil de points (soins, lavages, finitions,
    coiffures) : les points protègent les prestations lourdes, pas un soin. */
const SANS_SEUIL: Cle[] = [
  'kloe', 'klos', 'klop', 'shp', 'kkl', 'wewe', 'wedec', 'wd', 'dan', 'danl', 'viv', 'vivc', 'gbi', 'gbip', 'kgr', 'sowa',
  'retc', 'cont', 'subl', 'sins', 'sinsig', 'expr', 'lum', 'ecl', 'coula', 'soig', 'ssig', 'sgj',
  'cge', 'cgs', 'cev', 'rcf', 'rev', 'mp', 'man', 'ped', 'kri', 'ksi', 'kre',
];

export const BESOINS_DE_DEPART = (): ReglagesDesBesoins => ({
  version: 1,
  familles: FAMILLES_DE_DEPART.map((f) => ({ ...f })),
  besoins: S.map(([famille, mots, points, cles, garde], i) => ({
    id: `bs-${String(i + 1).padStart(3, '0')}`,
    famille, mots, points,
    prestations: cles.map((c) => P[c]),
    ...(garde ? { garde } : {}),
  })),
  seuils: [0, 20, 40, 70],
  bornes: [15000, 40000, 100000],
  preuves: { photo: 10, visio: 15, privee: 25 },
  sansSeuil: SANS_SEUIL.map((c) => P[c]),
  /* Medium se compte au lock, sans plancher : le prix ne dit pas son palier.
     Le Moment Cuir chevelu est un forfait composé. Posés à la main. */
  paliersPoses: { [P.med]: 2, [P.momc]: 2 },
  ecartesParLaPeau: [P.wewe, P.wedec, P.wd, P.momc, P.trans],
});

/* ── LE CALCUL ─────────────────────────────────────────────────────────── */

/** Le prix d'appel d'une prestation, pour son palier : prix catalogue, sinon le
    plus bas de ses prix par longueur. Aucun des deux (comptage, forfait, sur
    devis) : inconnu, et l'inconnu se range au palier le plus haut. */
export type PrixDAppel = (serviceId: string) => number | undefined;

export function palierDe(r: Pick<ReglagesDesBesoins, 'bornes' | 'paliersPoses'>, serviceId: string, prix: number | undefined): Palier {
  const pose = r.paliersPoses[serviceId];
  if (pose !== undefined) return pose;
  if (prix === undefined || !(prix > 0)) return 3;
  return prix <= r.bornes[0] ? 0 : prix <= r.bornes[1] ? 1 : prix <= r.bornes[2] ? 2 : 3;
}

export type Preuves = { photo: boolean; visio: boolean; privee: boolean };
export const AUCUNE_PREUVE: Preuves = { photo: false, visio: false, privee: false };

export type LigneQualifiee = {
  serviceId: string;
  palier: Palier;
  /** Les points des besoins choisis qui citent cette prestation. */
  pertinence: number;
  /** Pertinence et preuves. */
  score: number;
  seuil: number;
  sansSeuil: boolean;
  ok: boolean;
  /** Ce qui manque, dit pour un humain. */
  manques: string[];
};

export type Qualification = { peau: boolean; lignes: LigneQualifiee[]; proposees: number };

export function qualifie(r: ReglagesDesBesoins, choisis: readonly string[], preuves: Preuves, prixDe: PrixDAppel): Qualification {
  const parId = new Map(r.besoins.map((b) => [b.id, b]));
  const retenus = choisis.map((id) => parId.get(id)).filter((b): b is Besoin => !!b);
  const peau = retenus.some((b) => b.garde === 'peau');
  const pertinence = new Map<string, number>();
  for (const b of retenus) for (const s of b.prestations) pertinence.set(s, (pertinence.get(s) ?? 0) + b.points);
  const pts = (preuves.photo ? r.preuves.photo : 0) + (preuves.visio ? r.preuves.visio : 0) + (preuves.privee ? r.preuves.privee : 0);
  const unePreuve = preuves.photo || preuves.visio || preuves.privee;
  const lignes: LigneQualifiee[] = [...pertinence.entries()].map(([serviceId, rel]) => {
    const palier = palierDe(r, serviceId, prixDe(serviceId));
    const libre = r.sansSeuil.includes(serviceId);
    const seuil = libre ? 0 : r.seuils[palier];
    const score = rel + pts;
    const manques: string[] = [];
    if (peau && r.ecartesParLaPeau.includes(serviceId)) manques.push('écartée tant que la Maison n’a pas vu le cuir chevelu');
    if (score < seuil) manques.push(`il manque ${seuil - score} points`);
    if (!libre && palier >= 2 && !unePreuve) manques.push('il faut une photo ou une visio');
    if (!libre && palier >= 3 && !preuves.privee) manques.push('il faut la consultation privée');
    return { serviceId, palier, pertinence: rel, score, seuil, sansSeuil: libre, ok: manques.length === 0, manques };
  }).sort((a, b) => (b.pertinence - a.pertinence) || ((prixDe(a.serviceId) ?? 1e12) - (prixDe(b.serviceId) ?? 1e12)) || a.serviceId.localeCompare(b.serviceId));
  return { peau, lignes, proposees: lignes.filter((l) => l.ok).length };
}

/* ── LA SANTÉ DU DOCUMENT ──────────────────────────────────────────────── */

export type Defaut = { besoinId?: string; serviceId?: string; dit: string };

/** Ce qui cloche, pour que l'écran le dise : un besoin sans prestation (il ne
    peut pas paraître sur le site), une prestation inconnue ou archivée. */
export function defautsDes(r: ReglagesDesBesoins, existe: (serviceId: string) => 'vendue' | 'archivee' | 'inconnue'): Defaut[] {
  const d: Defaut[] = [];
  const familles = new Set(r.familles.map((f) => f.id));
  for (const b of r.besoins) {
    if (!b.mots.trim()) d.push({ besoinId: b.id, dit: 'un besoin sans mots' });
    if (!familles.has(b.famille)) d.push({ besoinId: b.id, dit: `« ${b.mots} » : famille inconnue` });
    if (b.prestations.length === 0) d.push({ besoinId: b.id, dit: `« ${b.mots} » n’a aucune prestation : il ne paraîtra pas` });
    for (const s of b.prestations) {
      const e = existe(s);
      if (e === 'inconnue') d.push({ besoinId: b.id, serviceId: s, dit: `« ${b.mots} » cite une prestation qui n’existe plus` });
      else if (e === 'archivee') d.push({ besoinId: b.id, serviceId: s, dit: `« ${b.mots} » cite une prestation archivée` });
    }
  }
  return d;
}

/** Un document lu au serveur, rendu sûr : ce qui manque reprend la semence,
    rien de ce qui est là n'est jeté. */
export function reglagesSurs(v: unknown): ReglagesDesBesoins {
  const base = BESOINS_DE_DEPART();
  if (!v || typeof v !== 'object') return base;
  const o = v as Partial<ReglagesDesBesoins>;
  const nombre = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : d);
  const besoins = Array.isArray(o.besoins)
    ? o.besoins.filter((b): b is Besoin => !!b && typeof b === 'object' && typeof (b as Besoin).id === 'string')
      .map((b) => ({
        id: b.id, famille: String(b.famille ?? ''), mots: String(b.mots ?? ''),
        points: nombre(b.points, 10), prestations: Array.isArray(b.prestations) ? b.prestations.filter((s) => typeof s === 'string') : [],
        ...(b.garde === 'peau' ? { garde: 'peau' as const } : {}),
      }))
    : base.besoins;
  const quatre = (x: unknown, d: [number, number, number, number]): [number, number, number, number] =>
    (Array.isArray(x) && x.length === 4 ? (x.map((n, i) => nombre(n, d[i])) as [number, number, number, number]) : d);
  const trois = (x: unknown, d: [number, number, number]): [number, number, number] =>
    (Array.isArray(x) && x.length === 3 ? (x.map((n, i) => nombre(n, d[i])) as [number, number, number]) : d);
  const liste = (x: unknown, d: string[]) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : d);
  const p = (o.preuves ?? {}) as Partial<ReglagesDesBesoins['preuves']>;
  return {
    version: 1,
    familles: Array.isArray(o.familles) && o.familles.length ? o.familles.filter((f) => f && typeof f.id === 'string').map((f) => ({ id: f.id, nom: String(f.nom ?? f.id) })) : base.familles,
    besoins,
    seuils: quatre(o.seuils, base.seuils),
    bornes: trois(o.bornes, base.bornes),
    preuves: { photo: nombre(p.photo, base.preuves.photo), visio: nombre(p.visio, base.preuves.visio), privee: nombre(p.privee, base.preuves.privee) },
    sansSeuil: liste(o.sansSeuil, base.sansSeuil),
    paliersPoses: o.paliersPoses && typeof o.paliersPoses === 'object'
      ? Object.fromEntries(Object.entries(o.paliersPoses).filter(([, v]) => v === 0 || v === 1 || v === 2 || v === 3)) as Record<string, Palier>
      : base.paliersPoses,
    ecartesParLaPeau: liste(o.ecartesParLaPeau, base.ecartesParLaPeau),
    ...(typeof o.modifieLe === 'string' ? { modifieLe: o.modifieLe } : {}),
    ...(typeof o.modifiePar === 'string' ? { modifiePar: o.modifiePar } : {}),
  };
}

/** Les besoins qui mènent à une prestation (la fiche technique les montre). */
export const besoinsDe = (r: ReglagesDesBesoins, serviceId: string): Besoin[] =>
  r.besoins.filter((b) => b.prestations.includes(serviceId));

/** Relier ou délier un besoin et une prestation : un seul lien, lu des deux côtés. */
export function relie(r: ReglagesDesBesoins, besoinId: string, serviceId: string, oui: boolean): ReglagesDesBesoins {
  return {
    ...r,
    besoins: r.besoins.map((b) => {
      if (b.id !== besoinId) return b;
      const a = b.prestations.includes(serviceId);
      if (oui && !a) return { ...b, prestations: [...b.prestations, serviceId] };
      if (!oui && a) return { ...b, prestations: b.prestations.filter((s) => s !== serviceId) };
      return b;
    }),
  };
}
