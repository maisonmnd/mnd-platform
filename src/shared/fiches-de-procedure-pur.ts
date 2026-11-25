/* ══ LES FICHES DE PROCÉDURE — 25 novembre 2026 ══════════════════════════
   « Crée une fiche de procédure par soin du catalogue, en commençant par le
   Rituel SOWA. Utilise le même format pour chaque fiche. Signale les
   informations à valider, sans inventer de dosage, de durée ou de
   contre-indication. Relie chaque fiche à la prestation correspondante.
   L'équipe doit pouvoir consulter la version validée sans quitter le
   rendez-vous » (Yéman).

   CE N'EST PAS UN « PROTOCOLE » DU 6 SEPTEMBRE (`protocoles.ts`) : celui-là
   est une SUITE de soins dans le temps (J+14, J+30). Une fiche de procédure
   dit COMMENT se rend un soin, au fauteuil.

   UN SEUL FORMAT, SEPT RUBRIQUES, TOUJOURS DANS LE MÊME ORDRE (`RUBRIQUES`).
   Une fiche ne peut pas en porter une huitième ni en sauter une : le type le
   refuse, et `ficheSure` remet à sa place ce qui arriverait abîmé du serveur.

   DEUX ÉTATS, JAMAIS MÉLANGÉS. Le BROUILLON est la copie de travail de la
   direction. La VERSION VALIDÉE est une copie figée, numérotée, signée (qui,
   quand) : c'est la seule que lit l'équipe. Corriger le brouillon ne change
   rien à ce qu'elle lit tant qu'on n'a pas validé de nouveau.

   CE QUI N'EST PAS SU SE DIT, IL NE SE DEVINE PAS. Une ligne peut porter
   `aValider` : ce qui manque, en toutes lettres. Elle s'affiche signalée, au
   brouillon comme à la version validée. Aucun dosage, aucune durée, aucune
   contre-indication n'est écrit ici de la main du code : ce qui dépend d'une
   notice dit « selon la notice » et le signale.

   MODULE PUR : ni magasin, ni écran, ni réseau. Le document
   `mnd_fiches_de_procedure` vit dans `fiches-de-procedure.ts` ; la direction
   seule l'écrit (0244). */

export type RubriqueId = 'objectif' | 'public' | 'produits' | 'arrivee' | 'etapes' | 'conseils' | 'suivi';

/** LE FORMAT, le même pour chaque fiche. `detail` nomme la seconde case d'une
    ligne quand la rubrique en porte une : la référence d'un produit, le temps
    de pose d'une étape. */
export const RUBRIQUES: readonly { id: RubriqueId; titre: string; aide: string; detail?: string }[] = [
  { id: 'objectif', titre: 'Objectif', aide: 'Ce que le soin doit obtenir.' },
  { id: 'public', titre: 'Public', aide: 'Pour qui, et dans quel cas.' },
  { id: 'produits', titre: 'Produits et références', aide: 'Chaque produit et sa référence exacte au salon.', detail: 'Référence au salon' },
  { id: 'arrivee', titre: 'Vérifications à l’arrivée', aide: 'Ce qui se regarde avant de commencer.' },
  { id: 'etapes', titre: 'Étapes et temps de pose validés', aide: 'Dans l’ordre du fauteuil. Un temps ne s’écrit que validé.', detail: 'Temps de pose validé' },
  { id: 'conseils', titre: 'Conseils après le soin', aide: 'Ce que la cliente emporte.' },
  { id: 'suivi', titre: 'Inclusions et suivi', aide: 'Ce qui est compris, ce qui est offert, ce qui suit.' },
];

export const IDS_DES_RUBRIQUES: readonly RubriqueId[] = RUBRIQUES.map((r) => r.id);

export type LigneDeFiche = {
  id: string;
  texte: string;
  /** La seconde case : la référence (produits), le temps de pose (étapes). */
  detail?: string;
  /** CE QUI RESTE À VALIDER sur cette ligne, en toutes lettres. Présent : la
      ligne est signalée partout où elle se lit. */
  aValider?: string;
};

export type ContenuDeFiche = Record<RubriqueId, LigneDeFiche[]>;

export type VersionValidee = {
  numero: number;
  /** L'instant de la validation (ISO). */
  le: string;
  /** Le nom de qui a validé, tel que le Trône le connaît. */
  par: string;
  contenu: ContenuDeFiche;
};

export type FicheDeProcedure = {
  /** LA PRESTATION DU CATALOGUE à laquelle la fiche est reliée. */
  serviceId: string;
  /** Son code sans suffixe de longueur, quand elle en porte un : ses sœurs
      (Court, Mi-Long, Long) lisent alors la même fiche. */
  code?: string;
  titre: string;
  brouillon: ContenuDeFiche;
  brouillonLe?: string;
  brouillonPar?: string;
  validee?: VersionValidee;
};

/** Le document : une fiche par identifiant de prestation. */
export type LesFiches = Record<string, FicheDeProcedure>;

/** Ce que ce module lit d'une prestation. Le catalogue en porte davantage. */
export type PrestationLue = {
  id: string;
  name: string;
  code?: string;
  description?: string;
  durationMin?: number;
  sessions?: number;
  archived?: boolean;
  reserveEnfants?: boolean;
  consultationAvant?: boolean;
  sansRemise?: boolean;
  includes?: { serviceId: string; afterWeeks?: number; offert?: boolean }[];
  fiche?: { indications?: string; eligibilite?: string; contreIndications?: string; actifs?: string };
};

export const contenuVide = (): ContenuDeFiche => ({
  objectif: [], public: [], produits: [], arrivee: [], etapes: [], conseils: [], suivi: [],
});

/** Le code d'une prestation sans son suffixe de longueur (comme `protocoles.ts`). */
export const codeNuDeLaPrestation = (code?: string): string => (code ?? '').replace(/·[CML]$/, '');

/** Le nom sans « · Court » et ses sœurs. */
export const nomSansLongueur = (nom: string): string =>
  nom.replace(/\s*·\s*(Court|Mi-Long|Long ou haute densité)\s*$/, '');

/* ══ LA FICHE SÓWÀ ═══════════════════════════════════════════════════════
   Ce que Yéman a dicté le 25 novembre 2026, et ce que le catalogue dit déjà
   du Rituel Sówà™ (sa description, « aucune remise »). Rien d'autre.

   · Pouxit : la référence exacte reste à inscrire ; l'âge minimum, le temps
     de pose, le rinçage et la seconde application DÉPENDENT DE SA NOTICE.
   · Neem et shikakaï : envisagés, usage à valider (les enfants surtout). En
     attendant ils restent HORS de la séance : Pouxit seul, selon sa notice.
   · Le DÀNDÀN™ est recommandé ; la Couronne Cocon est offerte aux enfants ;
     le contrôle est offert à J+7.
   · La Couronne Cocon et le contrôle n'ont pas de prestation au catalogue
     (lu le 25 novembre 2026) : la fiche le signale au lieu de l'inventer. */

/** L'identifiant du Rituel Sówà™ au catalogue de la Maison (comme `besoins-pur`). */
export const ID_DU_RITUEL_SOWA = '1740l5ysxj';

const SELON_LA_NOTICE = 'Selon la notice du produit';

export const CONTENU_SOWA: ContenuDeFiche = {
  objectif: [
    { id: 'sowa-ob-1', texte: 'Éliminer les poux des locks, avec discrétion et sans jugement.' },
    { id: 'sowa-ob-2', texte: 'À la sortie : un cuir chevelu traité, les lentes retirées au peigne fin.' },
    { id: 'sowa-ob-3', texte: 'Le rituel tient en deux venues : le premier rendez-vous, puis le contrôle offert à J+7.' },
  ],
  public: [
    { id: 'sowa-pu-1', texte: 'Toute personne qui a des démangeaisons, ou qui a vu des poux ou des lentes, chez elle ou chez un proche.' },
    { id: 'sowa-pu-2', texte: 'Adultes et enfants. Pour un enfant, la coiffure protectrice Couronne Cocon est offerte.' },
    {
      id: 'sowa-pu-3', texte: 'Âge minimum : celui de la notice du produit.',
      aValider: 'À recopier de la notice du Pouxit utilisé au salon, une fois sa référence inscrite. Aucun âge n’a été supposé.',
    },
    {
      id: 'sowa-pu-4', texte: 'Contre-indications : aucune n’est écrite sur cette fiche.',
      aValider: 'À recopier de la notice du produit, puis à valider par la direction. Rien n’a été supposé.',
    },
  ],
  produits: [
    {
      id: 'sowa-pr-1', texte: 'Pouxit · traitement anti-poux',
      aValider: 'Inscrire la référence exacte utilisée au salon. L’âge minimum, le temps de pose, le rinçage et la seconde application dépendent de sa notice.',
    },
    {
      id: 'sowa-pr-2', texte: 'Poudre de neem et poudre de shikakaï · composants végétaux envisagés pour Sówà',
      aValider: 'Usage à valider, notamment pour les enfants. En attendant : hors de la séance anti-poux. Pouxit seul, selon sa notice.',
    },
    { id: 'sowa-pr-3', texte: 'Peigne fin · retrait des lentes' },
    {
      id: 'sowa-pr-4', texte: 'Produit du lavage, après la pose',
      aValider: 'Le produit utilisé pour le lavage n’est pas précisé : à inscrire.',
    },
  ],
  arrivee: [
    { id: 'sowa-ar-1', texte: 'Examiner le cuir chevelu avec la cliente, avec discrétion et sans jugement.' },
    { id: 'sowa-ar-2', texte: 'Constater la présence de poux ou de lentes.' },
    {
      id: 'sowa-ar-3', texte: 'Pour un enfant : son âge, à comparer à l’âge minimum de la notice.',
      aValider: 'Âge minimum à recopier de la notice du Pouxit utilisé.',
    },
    {
      id: 'sowa-ar-4', texte: 'Autres vérifications et précautions de la notice.',
      aValider: 'À écrire par la direction, d’après la notice du produit. Rien n’a été supposé.',
    },
  ],
  etapes: [
    { id: 'sowa-et-1', texte: 'Examen du cuir chevelu, avec la cliente.' },
    {
      id: 'sowa-et-2', texte: 'Application du traitement anti-poux Pouxit, lock par lock. Pouxit seul : ni neem ni shikakaï dans cette séance.',
      aValider: 'Dosage : aucun n’est écrit ici. Suivre la notice ; à recopier une fois la référence inscrite.',
    },
    {
      id: 'sowa-et-3', texte: 'Temps de pose.', detail: SELON_LA_NOTICE,
      aValider: 'Durée à recopier de la notice du Pouxit utilisé. Aucune durée n’a été supposée.',
    },
    {
      id: 'sowa-et-4', texte: 'Rinçage, puis lavage soigné.', detail: SELON_LA_NOTICE,
      aValider: 'Le rinçage dépend de la notice : à recopier.',
    },
    { id: 'sowa-et-5', texte: 'Retrait des lentes au peigne fin.' },
    { id: 'sowa-et-6', texte: 'Recommander le soin hydratant DÀNDÀN™ à la cliente.' },
    {
      id: 'sowa-et-7', texte: 'Pour un enfant : la coiffure protectrice Couronne Cocon, offerte.',
      aValider: 'La Couronne Cocon n’est pas décrite au catalogue : ses gestes et son temps sont à écrire.',
    },
    { id: 'sowa-et-8', texte: 'Poser avec elle le rendez-vous de contrôle, offert, à J+7.' },
    {
      id: 'sowa-et-9', texte: 'Seconde application.', detail: SELON_LA_NOTICE,
      aValider: 'Si elle est due, et quand : cela dépend de la notice, à recopier. À dire aussi si elle se fait au contrôle de J+7.',
    },
  ],
  conseils: [
    { id: 'sowa-co-1', texte: 'Revenir à J+7 pour la séance de contrôle, offerte.' },
    { id: 'sowa-co-2', texte: 'Le soin hydratant DÀNDÀN™ est recommandé à la suite du rituel.' },
    {
      id: 'sowa-co-3', texte: 'Conseils à suivre à la maison.',
      aValider: 'À écrire par la direction, d’après la notice du produit. Aucun conseil n’a été supposé.',
    },
  ],
  suivi: [
    { id: 'sowa-su-1', texte: 'Compris : le premier rendez-vous, le Rituel Sówà™.' },
    {
      id: 'sowa-su-2', texte: 'Compris : la recommandation du soin hydratant DÀNDÀN™.',
      aValider: 'À préciser : lequel (sept huiles ou Léger), le jour même ou à un autre rendez-vous, et à quel prix.',
    },
    {
      id: 'sowa-su-3', texte: 'Offert aux enfants : la coiffure protectrice Couronne Cocon.',
      aValider: 'La Couronne Cocon n’a pas de prestation au catalogue : à créer, offerte, pour qu’elle se pose au rendez-vous. À préciser : jusqu’à quel âge.',
    },
    {
      id: 'sowa-su-4', texte: 'Offert : la séance de contrôle, à J+7.',
      aValider: 'Aucune prestation de contrôle au catalogue : le rendez-vous se pose à la main. À écrire : ce qui s’y fait.',
    },
    { id: 'sowa-su-5', texte: 'Le Rituel Sówà™ ne porte aucune remise.' },
  ],
};

export const FICHE_SOWA: FicheDeProcedure = {
  serviceId: ID_DU_RITUEL_SOWA,
  titre: 'Rituel Sówà™ · Rituel anti-poux Maison MND',
  brouillon: CONTENU_SOWA,
};

/** LES FICHES ÉCRITES DANS LE CODE. Elles naissent en BROUILLON : la
    validation porte un nom et une date, et ce nom ne peut être que celui de
    qui a relu. Une fiche du document l'emporte toujours sur sa semence. */
export const FICHES_DE_DEPART = (): LesFiches => ({
  [ID_DU_RITUEL_SOWA]: copieDeLaFiche(FICHE_SOWA),
});

/* ══ LIRE SANS CRAINTE ═══════════════════════════════════════════════════ */

const texteSur = (v: unknown): string => (typeof v === 'string' ? v : '');

const ligneSure = (brut: unknown, repli: string): LigneDeFiche | null => {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  const texte = texteSur(o.texte);
  const detail = texteSur(o.detail).trim();
  const aValider = texteSur(o.aValider).trim();
  if (!texte.trim() && !detail && !aValider) return null;
  return {
    id: texteSur(o.id) || repli,
    texte,
    ...(detail ? { detail } : {}),
    ...(aValider ? { aValider } : {}),
  };
};

/** Un contenu toujours complet : les sept rubriques, dans l'ordre, chacune une
    liste. Une rubrique inconnue est écartée, une absente revient vide. */
export const contenuSur = (brut: unknown): ContenuDeFiche => {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const sur = contenuVide();
  for (const id of IDS_DES_RUBRIQUES) {
    const lignes = Array.isArray(o[id]) ? (o[id] as unknown[]) : [];
    sur[id] = lignes
      .map((l, i) => ligneSure(l, `${id}-${i + 1}`))
      .filter((l): l is LigneDeFiche => l !== null);
  }
  return sur;
};

const versionSure = (brut: unknown): VersionValidee | undefined => {
  if (!brut || typeof brut !== 'object') return undefined;
  const o = brut as Record<string, unknown>;
  const numero = typeof o.numero === 'number' && o.numero >= 1 ? Math.floor(o.numero) : 0;
  const le = texteSur(o.le);
  if (!numero || !le) return undefined;
  return { numero, le, par: texteSur(o.par), contenu: contenuSur(o.contenu) };
};

export const ficheSure = (brut: unknown, serviceId: string): FicheDeProcedure | null => {
  if (!brut || typeof brut !== 'object' || !serviceId) return null;
  const o = brut as Record<string, unknown>;
  const validee = versionSure(o.validee);
  const code = texteSur(o.code).trim();
  return {
    serviceId,
    ...(code ? { code } : {}),
    titre: texteSur(o.titre),
    brouillon: contenuSur(o.brouillon),
    ...(texteSur(o.brouillonLe) ? { brouillonLe: texteSur(o.brouillonLe) } : {}),
    ...(texteSur(o.brouillonPar) ? { brouillonPar: texteSur(o.brouillonPar) } : {}),
    ...(validee ? { validee } : {}),
  };
};

/** LE DOCUMENT, toujours sûr à lire. Une fiche de départ absente du document
    y revient (un document né avant elle ne la connaît pas) ; une fiche du
    document n'est jamais réécrite par sa semence. */
export const fichesSures = (brut: unknown): LesFiches => {
  const sur: LesFiches = {};
  if (brut && typeof brut === 'object' && !Array.isArray(brut)) {
    for (const [id, f] of Object.entries(brut as Record<string, unknown>)) {
      const fiche = ficheSure(f, id);
      if (fiche) sur[id] = fiche;
    }
  }
  for (const [id, semence] of Object.entries(FICHES_DE_DEPART())) {
    if (!sur[id]) sur[id] = semence;
  }
  return sur;
};

export function copieDuContenu(c: ContenuDeFiche): ContenuDeFiche {
  const copie = contenuVide();
  for (const id of IDS_DES_RUBRIQUES) copie[id] = (c[id] ?? []).map((l) => ({ ...l }));
  return copie;
}

export function copieDeLaFiche(f: FicheDeProcedure): FicheDeProcedure {
  return {
    ...f,
    brouillon: copieDuContenu(f.brouillon),
    ...(f.validee ? { validee: { ...f.validee, contenu: copieDuContenu(f.validee.contenu) } } : {}),
  };
}

/* ══ CE QUI RESTE À VALIDER ══════════════════════════════════════════════ */

export type PointAValider = { rubrique: RubriqueId; titre: string; ligne: LigneDeFiche };

/** Les lignes signalées, dans l'ordre de la fiche. */
export const pointsAValider = (c: ContenuDeFiche): PointAValider[] =>
  RUBRIQUES.flatMap((r) => (c[r.id] ?? [])
    .filter((l) => !!l.aValider?.trim())
    .map((ligne) => ({ rubrique: r.id, titre: r.titre, ligne })));

/** Les rubriques qui ne disent rien : aucune ligne écrite. */
export const rubriquesVides = (c: ContenuDeFiche): RubriqueId[] =>
  IDS_DES_RUBRIQUES.filter((id) => !(c[id] ?? []).some((l) => l.texte.trim()));

const memeContenu = (a: ContenuDeFiche, b: ContenuDeFiche): boolean =>
  JSON.stringify(contenuSur(a)) === JSON.stringify(contenuSur(b));

/** Le brouillon a-t-il bougé depuis la version validée ? */
export const brouillonDiffere = (f: FicheDeProcedure): boolean =>
  !f.validee || !memeContenu(f.brouillon, f.validee.contenu);

export type EtatDeLaFiche = 'a-ecrire' | 'brouillon' | 'validee' | 'validee-et-brouillon';

export const etatDeLaFiche = (f: FicheDeProcedure | undefined): EtatDeLaFiche => {
  if (!f) return 'a-ecrire';
  if (!f.validee) return 'brouillon';
  return brouillonDiffere(f) ? 'validee-et-brouillon' : 'validee';
};

export const MOT_DE_L_ETAT_DE_LA_FICHE: Record<EtatDeLaFiche, string> = {
  'a-ecrire': 'à écrire',
  brouillon: 'brouillon',
  validee: 'validée',
  'validee-et-brouillon': 'validée · brouillon en cours',
};

/* ══ VALIDER ═════════════════════════════════════════════════════════════ */

/** LA VALIDATION fige le brouillon en version numérotée et signée.

    UNE FICHE SANS SIGNATAIRE OU SANS ÉTAPE NE SE VALIDE PAS : l'équipe lirait
    « validée » sur une page qui ne dit pas comment faire, ou sans savoir qui
    en répond. Les points « à valider » ne bloquent pas : ils restent signalés
    dans la version que lit l'équipe (pour Sówà, « Pouxit seul, selon sa
    notice » vaut justement en attendant). */
export function valideLaFiche(
  f: FicheDeProcedure, par: string, le: string,
): { fiche: FicheDeProcedure } | { refus: string } {
  const qui = par.trim();
  if (!qui) return { refus: 'La validation porte un nom : votre compte n’en a pas.' };
  if (!f.titre.trim()) return { refus: 'Une fiche sans titre ne se retrouve pas.' };
  const contenu = contenuSur(f.brouillon);
  if (!contenu.etapes.some((l) => l.texte.trim())) return { refus: 'Une fiche sans étape ne dit pas comment faire : écrivez au moins une étape.' };
  return {
    fiche: {
      ...f,
      brouillon: contenu,
      validee: { numero: (f.validee?.numero ?? 0) + 1, le, par: qui, contenu: copieDuContenu(contenu) },
    },
  };
}

/* ══ RELIER À LA PRESTATION ══════════════════════════════════════════════ */

/** LA FICHE D'UNE PRESTATION : la sienne d'abord, sinon celle d'une sœur de
    longueur (même code nu). Rien d'autre : un nom qui ressemble ne relie pas. */
export function ficheDeLaPrestation(
  fiches: LesFiches, sv: Pick<PrestationLue, 'id' | 'code'> | undefined,
): FicheDeProcedure | undefined {
  if (!sv) return undefined;
  if (fiches[sv.id]) return fiches[sv.id];
  const nu = codeNuDeLaPrestation(sv.code);
  if (!nu) return undefined;
  return Object.values(fiches).find((f) => !!f.code && f.code === nu);
}

export type LectureDeLaFiche = {
  fiche: FicheDeProcedure;
  /** Ce qui se lit : la version validée, ou le brouillon (direction seule). */
  contenu: ContenuDeFiche;
  version: 'validee' | 'brouillon';
};

/** CE QUE CHACUN LIT. L'équipe : la version validée, ou rien. La direction :
    la version validée quand elle existe, sinon le brouillon (pour le relire
    et le valider). Le brouillon ne se montre JAMAIS à l'équipe. */
export function lectureDeLaFiche(f: FicheDeProcedure | undefined, direction: boolean): LectureDeLaFiche | null {
  if (!f) return null;
  if (f.validee) return { fiche: f, contenu: f.validee.contenu, version: 'validee' };
  return direction ? { fiche: f, contenu: f.brouillon, version: 'brouillon' } : null;
}

export type FicheDuRendezVous = LectureDeLaFiche & {
  service: PrestationLue;
  /** Le forfait qui l'apporte, quand la prestation n'est pas posée elle-même. */
  viaLeForfait?: string;
};

/** LES FICHES D'UN RENDEZ-VOUS : celles de ses prestations, puis celles des
    prestations que ses forfaits comprennent. Une fiche ne paraît qu'une fois,
    dans l'ordre du rendez-vous. */
export function fichesDuRendezVous(
  serviceIds: readonly string[],
  byId: { get: (id: string) => PrestationLue | undefined },
  fiches: LesFiches,
  direction: boolean,
): FicheDuRendezVous[] {
  const vues = new Set<string>();
  const sortie: FicheDuRendezVous[] = [];
  const pose = (sv: PrestationLue | undefined, via?: string) => {
    const lecture = lectureDeLaFiche(ficheDeLaPrestation(fiches, sv), direction);
    if (!sv || !lecture || vues.has(lecture.fiche.serviceId)) return;
    vues.add(lecture.fiche.serviceId);
    sortie.push({ ...lecture, service: sv, ...(via ? { viaLeForfait: via } : {}) });
  };
  const poses = serviceIds.map((id) => byId.get(id)).filter((sv): sv is PrestationLue => !!sv);
  for (const sv of poses) pose(sv);
  for (const sv of poses) {
    for (const inc of sv.includes ?? []) {
      if (inc.serviceId) pose(byId.get(inc.serviceId), sv.name);
    }
  }
  return sortie;
}

/* ══ LA FICHE DE DÉPART D'UN SOIN, LUE AU CATALOGUE ══════════════════════
   « Une fiche de procédure par soin du catalogue ». Un soin qui n'a pas
   encore sa fiche en reçoit une au même format, remplie de ce que LE
   CATALOGUE DIT DÉJÀ (sa description, sa fiche technique, ce qu'il comprend)
   et de rien d'autre. Chaque ligne reprise est signalée « à relire » ; chaque
   rubrique que le catalogue ne renseigne pas le dit. Elle n'existe qu'à
   l'écran de la direction tant qu'on ne l'a pas enregistrée. */

const A_ECRIRE = 'Le catalogue ne le dit pas : à écrire par la direction.';
const REPRIS = 'Repris du catalogue, écrit pour la cliente : à relire pour l’équipe.';

/** Une idée par ligne, comme la fiche technique s'écrit. */
const lignesDe = (texte: string | undefined): string[] =>
  (texte ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** La description du catalogue, découpée en ses trois temps quand elle les
    porte : le corps, « Vous en retirez : », « À choisir quand : ». */
export function litLaDescription(description: string | undefined): { corps: string; retire: string; quand: string } {
  const d = (description ?? '').trim();
  const prends = (motif: RegExp): string => (d.match(motif)?.[1] ?? '').trim();
  const retire = prends(/Vous en retirez\s*:\s*([^\n]+)/);
  const quand = prends(/À choisir quand\s*:\s*([^\n]+)/);
  const corps = d
    .replace(/Vous en retirez\s*:\s*[^\n]+/, '')
    .replace(/À choisir quand\s*:\s*[^\n]+/, '')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');
  return { corps, retire, quand };
}

const majuscule = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function ficheDepuisLeCatalogue(
  sv: PrestationLue,
  nomDe: (serviceId: string) => string | undefined = () => undefined,
): FicheDeProcedure {
  const { corps, retire, quand } = litLaDescription(sv.description);
  const c = contenuVide();
  let n = 0;
  const ligne = (texte: string, aValider?: string, detail?: string): LigneDeFiche => {
    n += 1;
    return { id: `cat-${n}`, texte, ...(detail ? { detail } : {}), ...(aValider ? { aValider } : {}) };
  };

  c.objectif = retire
    ? [ligne(majuscule(retire), REPRIS)]
    : [ligne('Objectif du soin.', A_ECRIRE)];

  c.public = [
    ...(quand ? [ligne(majuscule(quand), REPRIS)] : []),
    ...lignesDe(sv.fiche?.indications).map((t) => ligne(t)),
    ...lignesDe(sv.fiche?.eligibilite).map((t) => ligne(t)),
    ...(sv.reserveEnfants ? [ligne('Réservé aux enfants (MND Kids).')] : []),
  ];
  if (c.public.length === 0) c.public = [ligne('Pour qui, et dans quel cas.', A_ECRIRE)];

  c.produits = lignesDe(sv.fiche?.actifs).map((t) => ligne(t, 'Référence exacte au salon : à inscrire.'));
  if (c.produits.length === 0) c.produits = [ligne('Produits utilisés et leur référence au salon.', A_ECRIRE)];

  c.arrivee = [
    ...(sv.consultationAvant ? [ligne('Une consultation précède ce soin : vérifier qu’elle a eu lieu.')] : []),
    ...lignesDe(sv.fiche?.contreIndications).map((t) => ligne(`Contre-indication (fiche technique du catalogue) : ${t}`)),
  ];
  if (!lignesDe(sv.fiche?.contreIndications).length) {
    c.arrivee.push(ligne('Vérifications et contre-indications.', 'Aucune n’est écrite au catalogue : à écrire par la direction. Rien n’a été supposé.'));
  }

  c.etapes = [
    ...(corps ? [ligne(corps, REPRIS)] : []),
    ligne('Étapes du fauteuil, dans l’ordre, et temps de pose.', 'À écrire par la direction. Aucune durée n’a été supposée.'),
  ];

  c.conseils = [ligne('Conseils après le soin.', A_ECRIRE)];

  c.suivi = [
    ...(sv.includes ?? []).filter((i) => !!i.serviceId).map((i) => {
      const nom = nomDe(i.serviceId) ?? 'une prestation retirée du catalogue';
      const quandIl = i.afterWeeks ? `, ${i.afterWeeks} semaine${i.afterWeeks > 1 ? 's' : ''} après` : '';
      return ligne(`${i.offert ? 'Offert' : 'Compris'} : ${nom}${quandIl}.`);
    }),
    ...((sv.sessions ?? 1) > 1 ? [ligne(`${sv.sessions} séances.`)] : []),
    ...(sv.sansRemise ? [ligne('Ce soin ne porte aucune remise.')] : []),
  ];
  if (c.suivi.length === 0) c.suivi = [ligne('Ce qui est compris, ce qui est offert, ce qui suit.', A_ECRIRE)];

  const nu = codeNuDeLaPrestation(sv.code);
  return {
    serviceId: sv.id,
    ...(nu ? { code: nu } : {}),
    titre: nomSansLongueur(sv.name),
    brouillon: c,
  };
}

/* ══ CE QUE DISENT LES ÉCRANS ════════════════════════════════════════════ */

/** « version 2, validée le 25 novembre 2026 par … », le jour dit par l'appelant. */
export const signatureDeLaVersion = (v: VersionValidee, jourDit: (iso: string) => string): string =>
  `Version ${v.numero}, validée le ${jourDit(v.le)}${v.par ? ` par ${v.par}` : ''}`;

/** Le sous-titre du bouton « Voir le protocole », selon ce qui se lira. */
export function ceQueDitLeBouton(lues: readonly FicheDuRendezVous[]): string {
  if (lues.length === 0) return '';
  const noms = lues.map((l) => nomSansLongueur(l.service.name).split(' · ')[0]);
  const tete = noms.length <= 2 ? noms.join(' et ') : `${noms.length} fiches`;
  const brouillons = lues.filter((l) => l.version === 'brouillon').length;
  if (brouillons === lues.length) return `${tete} · brouillon, pas encore validé`;
  const aValider = lues.reduce((k, l) => k + pointsAValider(l.contenu).length, 0);
  return aValider > 0 ? `${tete} · ${aValider} point${aValider > 1 ? 's' : ''} à valider` : tete;
}
