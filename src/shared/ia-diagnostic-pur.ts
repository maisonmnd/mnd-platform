/* ══ LE DIAGNOSTIC PHOTO DES LOCKS — 19 octobre 2026 ═══════════════════
   Décisions de Yéman (14 octobre, confirmées « tel quel » le 19) : dans La
   Consultation (payée 15 000 F par KkiaPay) ET dans Ma Couronne ; la cliente
   voit sa lecture tout de suite ; un maître la relit dans la journée ; les
   produits conseillés se retirent à la Maison ; les photos s'effacent à
   90 jours ; Claude Sonnet lit (repli Haiku) ; une peau qui inquiète = aucun
   produit, « consultez un médecin ou un dermatologue », l'équipe prévenue ;
   JAMAIS un diagnostic médical ; une photo ne mesure pas la porosité.
   Le 19 au soir : la recommandation se construit AVEC le catalogue du Trône
   et une table « observation → rituel → produit » écrite ICI par défaut,
   marquée « à valider » au Trône (Paramètres) où la direction la corrige ;
   le diagnostic reste FERMÉ aux clientes tant que la direction ne l'allume
   pas (`mnd_auto_config.diagnosticPhoto`) ; qui relit : la direction et le
   département Atelier.

   LES CLIENTES N'ONT PAS DE COMPTE DU PERSONNEL : ce chantier n'emprunte pas
   la porte `ia-maison`. Sa fonction, `diagnostic-locks`, a sa porte à elle
   (une session Ma Couronne, ou une consultation payée), son compteur à part
   (`mnd_ia_compteur_diagnostic`, 20 $ par mois) et recopie ce bloc entre ses
   repères ⟨diagnostic-locks⟩ : `verifie-les-douze-lunes` (R8) confronte les
   deux, `verifie-le-diagnostic-photo` fait tourner la règle et la fonction.
   On corrige ici, puis on recopie le bloc entier. MODULE PUR. */

/* ⟨diagnostic-locks⟩ */
export const VERSION_DU_DIAGNOSTIC = '2026-10-19-a';
/** Une à quatre photos de la même couronne (sa décision). */
export const PHOTOS_MIN = 1;
export const PHOTOS_MAX = 4;
/** 4 Mo par photo en clair : le téléphone réduit avant d'envoyer. */
export const OCTETS_MAX_PAR_PHOTO = 4_000_000;
/** 90 jours (sa décision), puis les photos s'effacent ; la lecture reste. */
export const GARDE_DES_PHOTOS_JOURS = 90;
export const COFFRE_DES_PHOTOS_DU_DIAGNOSTIC = 'photos-du-diagnostic';
export const TABLE_DES_DIAGNOSTICS = 'diagnostics';
/** La table « observation → rituel → produit » corrigée par la direction. */
export const CLE_DE_LA_TABLE_DU_DIAGNOSTIC = 'mnd_diagnostic_table';
/** Le compteur du diagnostic, à part de ceux des agents et des huit. */
export const CLE_DU_COMPTEUR_DU_DIAGNOSTIC = 'mnd_ia_compteur_diagnostic';
export const PLAFOND_DU_DIAGNOSTIC_USD = 20;
/** Sonnet lit les photos ; Haiku prend le relais si Sonnet n'est pas ouvert à la clé. */
export const MODELES_DU_DIAGNOSTIC: readonly string[] = ['claude-sonnet-5-5', 'claude-haiku-5-5'];
/** Cinq lectures par dix minutes et par adresse. */
export const SEAU_DU_DIAGNOSTIC = 5;
/** Au plus trois rituels et deux produits : une lecture propose, elle ne vend pas. */
export const RITUELS_MAX = 3;
export const PRODUITS_MAX = 2;

/* ── LES ÉNUMÉRATIONS FERMÉES ──────────────────────────────────────────
   Claude ne choisit que dans ces listes ; ce qui n'y est pas se refuse. */
export const OBSERVATIONS = [
  { cle: 'secheresse', dit: 'Sécheresse' },
  { cle: 'frisottis', dit: 'Frisottis et repousse' },
  { cle: 'racines-laches', dit: 'Racines lâches' },
  { cle: 'amincissement', dit: 'Amincissement' },
  { cle: 'pellicules', dit: 'Pellicules visibles' },
  { cle: 'residus', dit: 'Résidus' },
  { cle: 'pointes-abimees', dit: 'Pointes abîmées' },
  { cle: 'casse', dit: 'Casse' },
] as const;
export type Observation = (typeof OBSERVATIONS)[number]['cle'];
export const ZONES = [
  { cle: 'racines', dit: 'les racines' },
  { cle: 'longueurs', dit: 'les longueurs' },
  { cle: 'pointes', dit: 'les pointes' },
  { cle: 'cuir-chevelu', dit: 'le cuir chevelu' },
] as const;
export type Zone = (typeof ZONES)[number]['cle'];
export const INTENSITES = [
  { cle: 'legere', dit: 'légère', poids: 1 },
  { cle: 'marquee', dit: 'marquée', poids: 2 },
  { cle: 'forte', dit: 'forte', poids: 3 },
] as const;
export type Intensite = (typeof INTENSITES)[number]['cle'];
/** Le calibre ESTIMÉ d'après la photo : jamais le compte exact, qui se fait à la Maison. */
export const CALIBRES_ESTIMES = [
  { cle: 'micro', dit: 'micro' }, { cle: 'fin', dit: 'fin' }, { cle: 'moyen', dit: 'moyen' },
  { cle: 'epais', dit: 'épais' }, { cle: 'incertain', dit: 'à constater à la Maison' },
] as const;
export type CalibreEstime = (typeof CALIBRES_ESTIMES)[number]['cle'];
/** Les trois longueurs du catalogue, et le doute. */
export const LONGUEURS_ESTIMEES = [
  { cle: 'court', dit: 'court' }, { cle: 'mi-long', dit: 'mi-long' }, { cle: 'long', dit: 'long' },
  { cle: 'incertain', dit: 'à constater à la Maison' },
] as const;
export type LongueurEstimee = (typeof LONGUEURS_ESTIMEES)[number]['cle'];
/** LA PEAU QUI INQUIÈTE (sa décision) : un drapeau, jamais un mot de plus. */
export const DRAPEAUX_PEAU = [
  { cle: 'rougeur', dit: 'une rougeur' },
  { cle: 'plaie', dit: 'une plaie' },
  { cle: 'croutes', dit: 'des croûtes' },
  { cle: 'chute-en-plaques', dit: 'une chute en plaques' },
] as const;
export type DrapeauPeau = (typeof DRAPEAUX_PEAU)[number]['cle'];
export const QUALITES_DE_PHOTO = ['bonne', 'moyenne', 'insuffisante'] as const;
export type QualiteDePhoto = (typeof QUALITES_DE_PHOTO)[number];

export type ObservationLue = { cle: Observation; zone: Zone; intensite: Intensite };
export type Lecture = {
  observations: ObservationLue[];
  calibre: CalibreEstime;
  longueur: LongueurEstimee;
  peau: DrapeauPeau[];
  qualite: QualiteDePhoto;
  /** Trois phrases de Claude, repassées par `texteSansPromesse` avant d'être montrées. */
  resume: string;
};

/* ── LA TABLE PAR DÉFAUT : observation → rituel → produit ──────────────
   Écrite ici le 19 octobre 2026, « à valider » par la direction au Trône.
   Un rituel se reconnaît par des MOTS dans son nom ou dans celui de son
   atelier (le catalogue vivant a ses propres noms) ; un produit par les
   quatre mots que le Trône connaît : huile, shampoing, beurre, sérum. Une
   observation sans mot de produit ne propose aucun produit, et c'est voulu
   (une repousse se reprend au fauteuil, elle ne s'achète pas). */
export type LigneDeLaTable = { observation: Observation; rituel: string[]; produits: string[] };
export const MOTS_DE_PRODUIT: readonly string[] = ['huile', 'shampoing', 'beurre', 'sérum'];
export const TABLE_PAR_DEFAUT: readonly LigneDeLaTable[] = [
  { observation: 'secheresse', rituel: ['hydratant', 'soin', 'dandan'], produits: ['huile', 'beurre'] },
  { observation: 'frisottis', rituel: ['reprise', 'resserrage', 'sinsin', 'racines'], produits: [] },
  { observation: 'racines-laches', rituel: ['reprise', 'resserrage', 'sinsin'], produits: [] },
  { observation: 'amincissement', rituel: ['reconstruction', 'gbigbi', 'renfor'], produits: ['sérum'] },
  { observation: 'pellicules', rituel: ['purification', 'wewe', 'lavage', 'kloklo'], produits: ['shampoing'] },
  { observation: 'residus', rituel: ['purification', 'wewe', 'lavage', 'kloklo'], produits: ['shampoing'] },
  { observation: 'pointes-abimees', rituel: ['hydratant', 'soin', 'pointes'], produits: ['huile', 'beurre'] },
  { observation: 'casse', rituel: ['reconstruction', 'gbigbi', 'restauration', 'finfin'], produits: ['sérum', 'huile'] },
];
/** Ce qu'un diagnostic ne propose jamais comme rituel : une consultation
    (la lecture y renvoie déjà), le défaisage, l'Académie. */
const CATEGORIES_HORS_RITUEL: readonly string[] = ['doto', 'koko', 'plt-45', 'cat-defaisage'];

export const MOT_A_CONFIRMER = 'À confirmer en consultation.';
export const MOT_RELU = 'Relu par la Maison.';
export const MOT_SANS_LECTURE = 'La Maison relit vos photos et vous répond dans la journée.';
export const MOT_PEAU = 'Ce que montrent vos photos mérite d’abord l’avis d’un médecin ou d’un dermatologue. La Maison ne propose aucun produit ici ; l’équipe est prévenue et vous rappelle.';
export const MOT_DES_PRODUITS = 'mis de côté pour votre prochain passage';

const estParmi = <T extends string>(liste: readonly { cle: T }[], v: unknown): v is T => liste.some((x) => x.cle === v);
const estUne = <T extends string>(liste: readonly T[], v: unknown): v is T => (liste as readonly unknown[]).includes(v);
const ditDe = (liste: readonly { cle: string; dit: string }[], cle: string): string =>
  liste.find((x) => x.cle === cle)?.dit ?? cle;
/** Sans accents ni majuscules, pour reconnaître un mot dans un nom. */
export const motSimple = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const motsPropres = (brut: unknown, max: number): string[] =>
  (Array.isArray(brut) ? brut : typeof brut === 'string' ? brut.split(/[,;]/) : [])
    .map((m) => String(m ?? '').trim().slice(0, 40)).filter((m) => m.length >= 3).slice(0, max);

/** LA TABLE, TELLE QU'ON PEUT S'Y FIER. Le document de la direction peut
    être absent, une liste, ou `{ lignes }` ; une observation qu'il ne porte
    pas garde sa ligne par défaut ; une ligne qu'il porte la remplace, mots
    nettoyés et bornés. Une table abîmée retombe entièrement sur le défaut. */
export function tableValide(brut: unknown): LigneDeLaTable[] {
  const lignes = Array.isArray(brut) ? brut : (brut && typeof brut === 'object' && Array.isArray((brut as { lignes?: unknown }).lignes))
    ? (brut as { lignes: unknown[] }).lignes : [];
  const siennes = new Map<Observation, LigneDeLaTable>();
  for (const l of lignes) {
    const o = (l as { observation?: unknown })?.observation;
    if (!estParmi(OBSERVATIONS, o)) continue;
    siennes.set(o, { observation: o, rituel: motsPropres((l as { rituel?: unknown }).rituel, 8), produits: motsPropres((l as { produits?: unknown }).produits, 4) });
  }
  return TABLE_PAR_DEFAUT.map((d) => siennes.get(d.observation) ?? { observation: d.observation, rituel: [...d.rituel], produits: [...d.produits] });
}

/** CE QUE CLAUDE A RENDU, AVANT QU'ON Y CROIE. Ni objet : rien. Une liste
    d'observations qui n'est pas une liste : rien. Une observation hors des
    listes se laisse tomber ; un calibre ou une longueur inconnus deviennent
    « incertain » (c'est ce qu'ils sont) ; un drapeau inventé ne compte pas ;
    un résumé qui n'est pas un texte devient vide. */
export function lectureDuDiagnostic(brut: unknown): Lecture | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  if (!Array.isArray(b.observations)) return null;
  const vues = new Set<string>();
  const observations: ObservationLue[] = [];
  for (const o of b.observations.slice(0, 16)) {
    const x = o as { cle?: unknown; zone?: unknown; intensite?: unknown } | null;
    if (!x || !estParmi(OBSERVATIONS, x.cle) || !estParmi(ZONES, x.zone) || !estParmi(INTENSITES, x.intensite)) continue;
    const k = `${x.cle}|${x.zone}`;
    if (vues.has(k)) continue;
    vues.add(k);
    observations.push({ cle: x.cle, zone: x.zone, intensite: x.intensite });
    if (observations.length >= 8) break;
  }
  const peau = Array.isArray(b.peau) ? [...new Set(b.peau.filter((p): p is DrapeauPeau => estParmi(DRAPEAUX_PEAU, p)))] : [];
  return {
    observations,
    calibre: estParmi(CALIBRES_ESTIMES, b.calibre) ? b.calibre : 'incertain',
    longueur: estParmi(LONGUEURS_ESTIMEES, b.longueur) ? b.longueur : 'incertain',
    peau,
    qualite: estUne(QUALITES_DE_PHOTO, b.qualite) ? b.qualite : 'moyenne',
    resume: typeof b.resume === 'string' ? b.resume.slice(0, 1200) : '',
  };
}

export type Catalogue = {
  services: readonly { id: string; name: string; categoryId?: string; archived?: boolean }[];
  categories: readonly { id: string; fon?: string; label?: string; parentId?: string }[];
  products: readonly { id: string; name: string; priceXof: number; stock: number }[];
};
export type Recommandation = {
  rituels: { id: string; nom: string }[];
  produits: { id: string; nom: string; prixXof: number }[];
  peauInquiete: boolean;
  mot: string;
};

/** LA RECOMMANDATION, DEPUIS LA LECTURE, LA TABLE ET LE CATALOGUE VIVANT.
    Les observations les plus fortes passent d'abord ; chaque ligne de la
    table cherche ses mots dans le nom des rituels (et de leur atelier) et
    des produits du Trône ; trois rituels et deux produits au plus, chacun
    une fois ; un produit sans stock ne se met pas de côté. UNE PEAU QUI
    INQUIÈTE (sa décision) : aucun produit, aucun rituel, le mot du médecin. */
export function recommande(lecture: Lecture, table: readonly LigneDeLaTable[], catalogue: Catalogue): Recommandation {
  if (lecture.peau.length > 0) return { rituels: [], produits: [], peauInquiete: true, mot: MOT_PEAU };
  const poids = (i: Intensite): number => INTENSITES.find((x) => x.cle === i)?.poids ?? 0;
  const ordre = [...lecture.observations].sort((a, b) => poids(b.intensite) - poids(a.intensite));
  const nomDeLAtelier = (categoryId?: string): string => {
    let cur = catalogue.categories.find((c) => c.id === categoryId);
    const bouts: string[] = [];
    for (let i = 0; cur && i < 8; i += 1) { bouts.push(cur.fon ?? '', cur.label ?? ''); cur = catalogue.categories.find((c) => c.id === cur!.parentId); }
    return bouts.join(' ');
  };
  const horsRituel = (categoryId?: string): boolean => {
    let cur = catalogue.categories.find((c) => c.id === categoryId);
    if (CATEGORIES_HORS_RITUEL.includes(categoryId ?? '')) return true;
    for (let i = 0; cur && i < 8; i += 1) { if (CATEGORIES_HORS_RITUEL.includes(cur.id) || cur.id.startsWith('aca-')) return true; cur = catalogue.categories.find((c) => c.id === cur!.parentId); }
    return false;
  };
  const rituels: Recommandation['rituels'] = [];
  const produits: Recommandation['produits'] = [];
  for (const o of ordre) {
    const ligne = table.find((l) => l.observation === o.cle);
    if (!ligne) continue;
    const motsR = ligne.rituel.map(motSimple).filter(Boolean);
    const motsP = ligne.produits.map(motSimple).filter(Boolean);
    for (const s of catalogue.services) {
      if (rituels.length >= RITUELS_MAX) break;
      if (s.archived || horsRituel(s.categoryId) || rituels.some((r) => r.id === s.id)) continue;
      const texte = motSimple(`${s.name} ${nomDeLAtelier(s.categoryId)}`);
      if (motsR.some((m) => texte.includes(m))) rituels.push({ id: s.id, nom: s.name });
    }
    for (const p of catalogue.products) {
      if (produits.length >= PRODUITS_MAX) break;
      if (!(p.stock > 0) || produits.some((x) => x.id === p.id)) continue;
      const nom = motSimple(p.name);
      if (motsP.some((m) => nom.includes(m))) produits.push({ id: p.id, nom: p.name, prixXof: Math.max(0, Math.round(Number(p.priceXof) || 0)) });
    }
  }
  return { rituels, produits, peauInquiete: false, mot: MOT_A_CONFIRMER };
}

/** CE QUE LA CLIENTE LIT, SANS PROMESSE. Un montant (« 15 000 F »), le mot
    « salon », le nom d'une maladie ou un mot de traitement : rien ne part,
    le résumé composé prend la place. Une phrase qui garantit, promet, parle
    de porosité ou de résultat tombe ; le tiret long devient une virgule ;
    « À confirmer en consultation. » clôt toujours. */
export function texteSansPromesse(texte: unknown): string {
  let t = String(texte ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/\d[\d\s.,]*\s*(f\b|f\.|fcfa|cfa|xof|francs?\b|€|\$)/i.test(t)) return '';
  if (/\bsalons?\b/i.test(t)) return '';
  if (/ecz[ée]ma|psoriasis|teigne|mycose|alop[ée]cie|infection|dermatite|champignon|bact[ée]ri|allergi|traitement|m[ée]dicament|ordonnance|cortico|antifongique|antibiot/i.test(t)) return '';
  const phrases = t.split(/(?<=[.!?])\s+/).filter((p) => !/garant|promet|r[ée]sultat|porosit|en \d+ (jours|semaines|mois)|dispara[iî]t/i.test(p));
  t = phrases.join(' ').trim();
  if (!t) return '';
  if (t.length > 600) t = `${t.slice(0, 600).replace(/\s+\S*$/, '')}…`;
  if (!/[.!?…]$/.test(t)) t = `${t}.`;
  return /confirmer en consultation/i.test(t) ? t : `${t} ${MOT_A_CONFIRMER}`;
}

/** LE RÉSUMÉ COMPOSÉ DEPUIS LES LISTES FERMÉES : ce qu'on montre quand le
    texte de Claude ne passe pas, et ce que le Trône relit à côté. */
export function resumeDepuisLesObservations(lecture: Lecture): string {
  if (lecture.peau.length > 0) return MOT_PEAU;
  const parts: string[] = [];
  if (lecture.qualite === 'insuffisante') parts.push('Vos photos ne permettent pas une lecture sûre : reprenez-les à la lumière du jour, de près.');
  if (lecture.observations.length) {
    const dits = lecture.observations.map((o) => `${ditDe(OBSERVATIONS, o.cle).toLowerCase()} ${ditDe(INTENSITES, o.intensite)} sur ${ditDe(ZONES, o.zone)}`);
    parts.push(`Vos photos montrent : ${dits.join(', ')}.`);
  } else if (lecture.qualite !== 'insuffisante') {
    parts.push('Vos photos ne montrent rien qui appelle un geste particulier.');
  }
  parts.push(`Calibre estimé : ${ditDe(CALIBRES_ESTIMES, lecture.calibre)}. Longueur estimée : ${ditDe(LONGUEURS_ESTIMEES, lecture.longueur)}.`);
  parts.push(MOT_A_CONFIRMER);
  return parts.join(' ');
}

/** La consigne de Claude : lire, dans les mots de la Maison, sans jamais
    soigner. Le prénom et l'initiale, rien d'autre d'elle. */
export function consigneDuDiagnostic(o: { appel: string; nbPhotos: number }): string {
  return [
    'Tu lis des photos de locks pour la Maison MND, une maison de soin des locks à Cotonou (Bénin). Tu rends UNE lecture, dans la forme demandée, et rien d’autre.',
    `La personne : ${o.appel || 'la cliente'}. Tu ne connais que ce prénom ; n’invente ni nom ni civilité.`,
    `Tu reçois ${o.nbPhotos} photo(s) de la même couronne.`,
    '',
    'Ce que tu lis, et seulement cela :',
    '- l’état par zone (racines, longueurs, pointes, cuir chevelu), parmi les observations fermées : sécheresse, frisottis et repousse, racines lâches, amincissement, pellicules visibles, résidus, pointes abîmées, casse ; chacune avec son intensité (légère, marquée, forte) ;',
    '- le calibre estimé des locks (micro, fin, moyen, épais), « incertain » si la photo ne le montre pas ;',
    '- la longueur estimée (court : jusqu’aux épaules ; mi-long : des épaules aux omoplates ; long : au-delà), « incertain » sinon ;',
    '- la qualité des photos (bonne, moyenne, insuffisante).',
    '',
    'Règles absolues :',
    '- Tu ne poses JAMAIS de diagnostic médical : tu ne nommes aucune maladie, tu ne donnes aucun conseil médical, aucun traitement, aucun produit.',
    '- Si tu vois une rougeur, une plaie, des croûtes ou une chute en plaques, tu le signales SEULEMENT par le drapeau prévu, sans un mot de plus dans le résumé : la personne sera invitée à consulter un médecin ou un dermatologue.',
    '- Une photo ne mesure pas la porosité : n’en parle jamais.',
    '- Tu ne donnes JAMAIS de prix, de garantie de résultat, ni de délai de repousse.',
    '- Tu dis ce que tu VOIS, au conditionnel quand tu doutes ; ce que la photo ne montre pas reste « incertain ».',
    '- Tu parles dans les mots de la Maison : « locks », « couronne », « racines », « longueurs », « pointes », « cuir chevelu », « rituel » ; jamais « salon », jamais « dreads ».',
    '- Le résumé : trois phrases courtes au plus, en français, qui s’adressent à la personne (« vos locks »), sans liste, sans titre, sans émoji, sans tiret long.',
  ].join('\n');
}

/** La forme que Claude doit rendre : un outil à appeler, jamais du texte libre. */
export const SCHEMA_DE_LA_LECTURE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['observations', 'calibre', 'longueur', 'peau', 'qualite', 'resume'],
  properties: {
    observations: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['cle', 'zone', 'intensite'],
        properties: {
          cle: { type: 'string', enum: OBSERVATIONS.map((o) => o.cle) },
          zone: { type: 'string', enum: ZONES.map((z) => z.cle) },
          intensite: { type: 'string', enum: INTENSITES.map((i) => i.cle) },
        },
      },
    },
    calibre: { type: 'string', enum: CALIBRES_ESTIMES.map((c) => c.cle) },
    longueur: { type: 'string', enum: LONGUEURS_ESTIMEES.map((l) => l.cle) },
    peau: { type: 'array', maxItems: 4, items: { type: 'string', enum: DRAPEAUX_PEAU.map((d) => d.cle) } },
    qualite: { type: 'string', enum: [...QUALITES_DE_PHOTO] },
    resume: { type: 'string', maxLength: 900 },
  },
};

/** QUI RELIT (sa décision : la direction et le département Atelier), et
    personne d'autre : un maître de la Clientèle voit l'écran des
    consultations, il ne relit pas une lecture de photos. */
export const peutRelire = (role: string | undefined, acces: Record<string, boolean> | undefined): boolean =>
  role === 'souverain' || role === 'gerant' || (role === 'maitre' && acces?.['dept-atelier'] === true);

/** Où une photo vit dans le coffre : la branche, le diagnostic, son rang. */
export const cheminDeLaPhotoDuDiagnostic = (branchId: string, diagnosticId: string, n: number): string =>
  `${branchId || 'maison'}/${diagnosticId}/${n}.jpg`;

/** Les formats qu'on sait garder et montrer à Claude. */
export function formatDePhotoPermis(mime: unknown): boolean {
  const m = String(mime ?? '').toLowerCase().split(';')[0].trim();
  return m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';
}

/** L'instant avant lequel les photos d'un diagnostic doivent être effacées. */
export const limiteDeGardeDesPhotos = (maintenantMs: number): number => maintenantMs - GARDE_DES_PHOTOS_JOURS * 86_400_000;

/** Les diagnostics dont les photos partent : créés avant la limite, photos
    encore là, pas encore effacées. */
export function diagnosticsAuxPhotosAEffacer<T extends { id: string; cree_le?: string; data?: { photos?: unknown; photosEffaceesLe?: unknown } }>(
  lignes: readonly T[], maintenantMs: number,
): T[] {
  const limite = limiteDeGardeDesPhotos(maintenantMs);
  return lignes.filter((d) => Array.isArray(d.data?.photos) && d.data!.photos.length > 0 && !d.data?.photosEffaceesLe
    && Number.isFinite(Date.parse(d.cree_le ?? '')) && Date.parse(d.cree_le!) < limite);
}

export type EtatDuDiagnostic = 'a-relire' | 'relu' | 'ferme';
export const ETATS_DU_DIAGNOSTIC: readonly EtatDuDiagnostic[] = ['a-relire', 'relu', 'ferme'];
/** Ce que la cliente lit sous sa lecture, selon l'état. */
export const motDeLEtat = (etat: string | undefined, peauInquiete = false): string =>
  (peauInquiete ? MOT_PEAU : etat === 'relu' ? MOT_RELU : MOT_A_CONFIRMER);
/* ⟨/diagnostic-locks⟩ */

/** Le nom d'une observation, pour l'écran. */
export const observationDite = (cle: string): string => ditDe(OBSERVATIONS, cle);
export const zoneDite = (cle: string): string => ditDe(ZONES, cle);
export const intensiteDite = (cle: string): string => ditDe(INTENSITES, cle);
export const calibreDit = (cle: string): string => ditDe(CALIBRES_ESTIMES, cle);
export const longueurDite = (cle: string): string => ditDe(LONGUEURS_ESTIMEES, cle);
export const drapeauDit = (cle: string): string => ditDe(DRAPEAUX_PEAU, cle);

/* ══ HORS DU BLOC : CE QUE LES ÉCRANS PARTAGENT (reprise du 19 octobre) ══
   La fonction n'en a pas besoin ; La Consultation, Ma Couronne et le Trône,
   si. Rien ici ne parle au réseau. */

/** L'ACCORD EXPLICITE (sa décision) : la phrase que la cliente coche, mot
    pour mot dans les deux applications. Sans la case cochée, rien ne part. */
export const PHRASE_DE_L_ACCORD = 'J’accepte que la Maison garde ces photos 90 jours pour relire ma lecture.';

/** Peut-on envoyer ? `null` : oui ; sinon, ce qu'on dit à la cliente. */
export function defautDeLEnvoi(nbPhotos: number, accord: boolean): string | null {
  if (!(nbPhotos >= PHOTOS_MIN)) return 'Choisissez au moins une photo.';
  if (nbPhotos > PHOTOS_MAX) return 'Quatre photos au plus.';
  if (accord !== true) return 'Cochez l’accord pour que la Maison garde vos photos.';
  return null;
}

/** LES REFUS DE LA FONCTION, DITS À LA CLIENTE. Aucun ne parle de Claude,
    d'argent ou de quota : elle lit ce qu'elle peut faire. */
export const MOTS_DES_REFUS: Readonly<Record<string, string>> = {
  ferme: 'Le diagnostic photo n’est pas ouvert pour l’instant.',
  porte: 'La lecture de vos photos s’ouvre avec votre consultation réglée en ligne, ou depuis votre compte Ma Couronne.',
  personnel: 'Ce compte est celui de l’équipe : le diagnostic photo se fait depuis le compte d’une cliente.',
  consentement: 'Cochez l’accord pour que la Maison garde vos photos.',
  photos: 'Une à quatre photos, nettes et à la lumière du jour.',
  format: 'Ce format de photo ne se lit pas : choisissez une photo JPEG, PNG ou WebP.',
  too_large: 'Une photo est trop lourde : choisissez-en une autre.',
  budget: 'Les lectures de photos reprennent le mois prochain : montrez vos photos à la Maison lors de votre consultation.',
  rate_limited: 'Plusieurs envois en peu de temps : réessayez dans dix minutes.',
  reseau: 'Pas de réseau : réessayez quand il revient.',
  erreur: 'Vos photos ne sont pas parties. Réessayez dans un moment.',
};
export const motDuRefus = (code: string | undefined): string => MOTS_DES_REFUS[code ?? ''] ?? MOTS_DES_REFUS.erreur;

/** Ce que la cliente lit d'une lecture : le mot du maître quand il a relu et
    corrigé, sinon le texte de la lecture. */
export function texteMontre(d: { etat?: string; texte?: string | null; correction?: string | null }): string {
  const c = typeof d.correction === 'string' ? d.correction.trim() : '';
  return d.etat === 'relu' && c ? c : String(d.texte ?? '').trim();
}

/** Le mot du maître, propre : pas de tiret long, des espaces simples, borné. */
export const motDuMaitre = (brut: unknown): string =>
  String(brut ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200);

/** LA RELECTURE AU TRÔNE (sa décision : un maître relit dans la journée).
    Confirmer passe l'état à « relu », avec qui et quand ; un mot du maître
    remplace chez la cliente le texte de la lecture ; un rituel ou un
    produit qu'il retire n'est plus proposé ni mis de côté. La lecture de
    Claude, elle, reste telle quelle : on garde ce qui a été lu. */
export function relecture<D extends { recommandation?: Recommandation | null; correction?: string }>(
  data: D,
  o: { correction?: string; rituelsRetires?: readonly string[]; produitsRetires?: readonly string[]; par: string; leIso: string },
): { etat: 'relu'; relu_par: string; relu_le: string; data: D } {
  const mot = motDuMaitre(o.correction);
  const r = data.recommandation;
  const recommandation = r
    ? { ...r, rituels: r.rituels.filter((x) => !(o.rituelsRetires ?? []).includes(x.id)), produits: r.produits.filter((x) => !(o.produitsRetires ?? []).includes(x.id)) }
    : r;
  const { correction: _avant, ...reste } = data;
  return {
    etat: 'relu', relu_par: o.par, relu_le: o.leIso,
    data: { ...reste, recommandation, ...(mot ? { correction: mot } : {}) } as D,
  };
}

/** Écarter : la lecture ne sert pas (photo d'autre chose, doublon). Elle
    sort de la liste à relire ; la cliente lit « à confirmer en consultation ». */
export const ecarte = (par: string, leIso: string): { etat: 'ferme'; relu_par: string; relu_le: string } =>
  ({ etat: 'ferme', relu_par: par, relu_le: leIso });

/** LE DOCUMENT DE LA TABLE, tel que la direction l'écrit au Trône : ses
    lignes, et quand elle l'a validée. Sans `valideeLe`, la table reste
    marquée « à valider » (sa décision du 19 octobre). */
export type DocDeLaTable = { lignes: LigneDeLaTable[]; valideeLe?: string; valideePar?: string };
export const tableEstValidee = (doc: unknown): boolean => {
  const v = doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc as { valideeLe?: unknown }).valideeLe : undefined;
  return typeof v === 'string' && Number.isFinite(Date.parse(v));
};
/** « huile, beurre » tapé dans une case : des mots propres, bornés. */
export const motsDeLaSaisie = (s: unknown, max = 8): string[] => motsPropres(s, max);
/** Ce qu'une ligne propose avec le catalogue d'aujourd'hui : la même
    recommandation que la fonction, pour une observation forte seule. */
export const apercuDeLaLigne = (ligne: LigneDeLaTable, catalogue: Catalogue): Recommandation =>
  recommande({ observations: [{ cle: ligne.observation, zone: 'longueurs', intensite: 'forte' }], calibre: 'incertain', longueur: 'incertain', peau: [], qualite: 'bonne', resume: '' }, [ligne], catalogue);

/** « 19 octobre 2026 » : l'année toujours, sur une date de cliente. */
export function dateDuDiagnostic(iso: string | null | undefined): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const local = new Date(d.getTime() + 3_600_000); // l'heure de Cotonou (UTC+1)
  return `${local.getUTCDate()} ${MOIS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}
