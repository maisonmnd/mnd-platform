import type { ChantierIa, UsageIa } from './ia-maison-pur';
import type { Service, LongueurId } from './catalog';
import { CATEGORIE_FINFIN, CATEGORIE_VEKPE } from './catalogue-pur';

/* ══ LE DEVIS ÉCRIT PAR L'ASSISTANT — 13 novembre 2026 ═══════════════════
   « Je veux construire dans devis l'assistant qui crée les devis des clientes
   à partir d'une description ou d'un résumé de la situation » (Yéman), après
   avoir bâti à la main le devis de Faïza K. : consultation, défaisage,
   réparation intensive, recréation de 100 locks, puis une remise pour tomber
   sur 160 000 F. (Ce devis portait un défaisage ET une réparation : la Maison
   a précisé le 18 novembre 2026 que les deux ne vont jamais ensemble, voir
   `UN DÉFAISAGE NE SE RÉPARE PAS` plus bas.) Trois choix au sélecteur : une page à deux onglets, un
   BROUILLON À RELIRE (rien ne part sans elle), du texte ou de la dictée.

   LA RÈGLE QUI FAIT TENIR TOUT LE RESTE : CLAUDE NE DIT JAMAIS UN PRIX. Il
   choisit des prestations du catalogue par leur identifiant, dit combien de
   locks chacune concerne, et rend le total voulu s'il y en a un. Les francs,
   eux, viennent du catalogue par `prixDe` (le même juge que la Caisse et le
   rendez-vous) ; la remise est la différence, calculée ici, et bornée par le
   plafond de la Maison. Un modèle qui invente « 85 000 F » écrirait un faux
   prix sur un papier qu'on remet à une cliente.

   CE MODULE NE FAIT CONFIANCE À RIEN de ce que Claude rend : un identifiant
   hors catalogue est écarté et dit, une quantité reste entière et bornée, un
   total voulu plus haut que la somme ne majore rien. Il n'écrit rien : l'écran
   montre le brouillon, la cliente et la Maison décident. MODULE PUR. */

export const CHANTIER_DU_DEVIS: ChantierIa = 'devis';
export const USAGE_DU_DEVIS: UsageIa = 'texte';

/** Une description n'est pas un roman : au-delà, on la tait (la porte coupe à 40 000 signes). */
export const SIGNES_MAX_DE_LA_DESCRIPTION = 4000;
export const LIGNES_MAX = 12;
export const QUANTITE_MAX = 10;
export const LOCKS_MAX = 1000;

/** Le strict nécessaire d'une prestation pour la proposer et la chiffrer. */
export type PrestationDuCatalogue = Pick<Service, 'id' | 'name' | 'priceXof' | 'categoryId'> & Partial<Pick<Service, 'description' | 'archived' | 'priceMode' | 'tarifMode' | 'ratePerLock' | 'prixParLongueur' | 'tarifLockParLongueur' | 'hidePrice' | 'bandId' | 'bandIds' | 'priceFloors' | 'scalesWithModel'>>;

/** Les familles qu'on ne propose jamais sur un devis : les essais de la Maison. */
const FAMILLES_ECARTEES = new Set(['8p8i2vwmx3']);

/** Ce qu'on a le droit de proposer : ni archivée, ni un essai de la Maison. */
export const prestationsProposables = <T extends PrestationDuCatalogue>(services: readonly T[]): T[] =>
  services.filter((s) => s.archived !== true && !FAMILLES_ECARTEES.has(s.categoryId) && !/^essai de paiement/i.test(s.name));

/** Une prestation qui se compte AU LOCK : son prix suit un nombre de locks. */
export const seCompteAuLock = (s: PrestationDuCatalogue): boolean =>
  s.tarifMode === 'lock' || (s.tarifMode === undefined && !!s.ratePerLock);

/** Les calibres qu'une prestation sert, quand elle en désigne : sa liste
    `bandIds` (le catalogue en base : « VÈKPÈ™ Création Pico et Galaxy » en
    sert deux), sinon son `bandId`, sinon son plancher unique (la lecture de
    `bandIdOf` de `pricing`, pour le catalogue d'avant `bandId`). */
const calibresServis = (s: PrestationDuCatalogue): string[] => {
  if (s.bandIds?.length) return [...s.bandIds];
  if (s.bandId) return [s.bandId];
  const planchers = Object.keys(s.priceFloors ?? {});
  return planchers.length === 1 ? planchers : [];
};

/** UNE CRÉATION AU LOCK (17 novembre 2026) : comptée au lock ET rangée dans
    l'atelier de la Naissance, VÈKPÈ™ (par la CATÉGORIE, la leçon du 18 août :
    les six créations de la base y sont). En second recours, une prestation au
    lock qui désigne son calibre. Ses locks sont ceux qu'on POSE, dits sur la
    ligne. Un soin compté au lock qui sert tous les calibres (le resserrage
    SÍNSIN™ du catalogue de départ : 100 F le lock, six planchers) se compte,
    lui, sur la couronne entière. Sans cette distinction, un resserrage sur
    295 locks sortait au prix de base, avec un avertissement faux (revue du
    17 novembre 2026). Les planchers seuls ne suffisent pas : la création Nano
    de départ en porte deux (Nano et Galaxy). */
export const estUneCreationAuLock = (s: PrestationDuCatalogue): boolean =>
  seCompteAuLock(s) && (s.categoryId === CATEGORIE_VEKPE || calibresServis(s).length > 0);

/** Une prestation dont le prix suit LA TÊTE de la cliente : un soin compté au
    lock qui n'est pas une création, un prix par calibre à plusieurs planchers
    (le SÍNSIN™ Essentiel en base), ou une prestation qui suit le modèle. Sans
    le nombre de locks de la tête, elle sort au prix du catalogue. */
export const suitLaTete = (s: PrestationDuCatalogue): boolean =>
  !estUneCreationAuLock(s) && (seCompteAuLock(s) || Object.keys(s.priceFloors ?? {}).length > 1 || s.scalesWithModel === true);

/* ── UN DÉFAISAGE NE SE RÉPARE PAS — 18 novembre 2026 ───────────────────
   « On ne peut pas défaire et réparer en même temps. Mais on peut défaire,
   revenir à neuf, cheveux afro, et refaire un nouveau départ, une nouvelle
   création » (Yéman). On répare des locks qu'on GARDE ; un défaisage les
   défait toutes, et la tête revient aux cheveux naturels. Ce qui le suit est
   une création, jamais une réparation.

   LA RÈGLE EST TENUE ICI, PAS SEULEMENT DANS LA CONSIGNE : un modèle qui
   l'oublie une fois sur vingt écrirait un devis impossible sur un papier
   remis à une cliente. Une réparation proposée à côté d'un défaisage est
   écartée, et le brouillon le dit.

   PAR LA CATÉGORIE, JAMAIS PAR LE NOM (la leçon du 18 août) : le défaisage
   est la famille GBÀTÀ™ (`plt-45` de la semence, `cat-defaisage` de la base,
   la même lecture que `defaitLaCouronne` de `catalog`) ; la réparation est
   l'atelier FÍNFÍN™, La Renaissance (`CATEGORIE_FINFIN`), et le module
   `plt-40` de la semence (la même lecture que `CAT_REPARE` de `persona`). */
const FAMILLES_DU_DEFAISAGE: ReadonlySet<string> = new Set(['plt-45', 'cat-defaisage']);
const FAMILLES_DE_LA_REPARATION: ReadonlySet<string> = new Set([CATEGORIE_FINFIN, 'plt-40']);
export const estUnDefaisage = (s: Pick<PrestationDuCatalogue, 'categoryId'>): boolean => FAMILLES_DU_DEFAISAGE.has(s.categoryId);
export const estUneReparation = (s: Pick<PrestationDuCatalogue, 'categoryId'>): boolean => FAMILLES_DE_LA_REPARATION.has(s.categoryId);

/** Un calibre du barème, tel que la Maison le règle aux Paramètres. */
export type CalibreDuBareme = { name?: string; maxLocks: number | null };

/** Les calibres dits à Claude, DEPUIS LE BARÈME COURANT : « Jumbo jusqu’à 80,
    Medium 81 à 150, …, Galaxy au-delà de 550 ». Écrits en dur, ils disaient
    « Pico 451 à 600 » quand le barème arrête Pico à 550 : une création de
    560 locks était rangée en Pico, hors de son calibre (revue du 17 novembre
    2026). Un calibre sans nom ne se dit pas, mais sa borne compte. */
export const calibresDits = (calibres: readonly CalibreDuBareme[]): string => {
  const tri = [...calibres].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  const mots: string[] = [];
  let dessous = 0;
  for (const c of tri) {
    const nom = c.name?.trim();
    if (nom) mots.push(c.maxLocks == null ? `${nom} au-delà de ${dessous}` : dessous === 0 ? `${nom} jusqu’à ${c.maxLocks}` : `${nom} ${dessous + 1} à ${c.maxLocks}`);
    if (c.maxLocks != null) dessous = c.maxLocks;
  }
  return mots.join(', ');
};

/** La devise de la branche, dite à Claude pour le total voulu. */
const DEVISES_DITES: Record<string, string> = { XOF: 'francs CFA', XAF: 'francs CFA', EUR: 'euros', USD: 'dollars américains', CAD: 'dollars canadiens', GBP: 'livres sterling', CHF: 'francs suisses' };
export const deviseDite = (code: string | undefined): string => DEVISES_DITES[code || 'XOF'] ?? (code || 'francs CFA');

const net = (s: string | undefined, max: number): string =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */
export function consigneDuDevis(o: {
  services: readonly PrestationDuCatalogue[]; aujourdhui: string;
  /** Le barème des calibres, tel qu'il est réglé aujourd'hui. Absent : aucune borne n'est dite. */
  calibres?: readonly CalibreDuBareme[];
  /** La devise de la branche (`XOF` par défaut) : le total voulu se dit dans cette devise. */
  devise?: string;
}): string {
  const catalogue = prestationsProposables(o.services)
    .map((s) => `${s.id} | ${net(s.name, 90)} | ${estUneCreationAuLock(s) ? 'création au lock' : seCompteAuLock(s) ? 'au lock sur la tête' : 'prix fixe'}${net(s.description, 120) ? ` | ${net(s.description, 120)}` : ''}`)
    .join('\n');
  const bornes = o.calibres?.length ? calibresDits(o.calibres) : '';
  const enFrancs = ['XOF', 'XAF'].includes(o.devise || 'XOF');
  return [
    'Tu prépares le BROUILLON d’un devis pour la Maison MND, maison de soin de locks à Cotonou. Tu lis la situation d’une cliente écrite par la Maison et tu choisis, DANS LE CATALOGUE CI-DESSOUS et nulle part ailleurs, les prestations qui y répondent, dans l’ordre où elles se font.',
    '',
    'RÈGLES',
    '- Tu rends des IDENTIFIANTS du catalogue. Jamais un nom inventé, jamais un prix : les prix sont calculés par la Maison, pas par toi.',
    '- Une consultation passe d’abord quand la cliente vient d’ailleurs ou n’est pas encore connue : « KÒKÒ™ Accueil » pour des locks nées ailleurs, « KÒKÒ™ Origine » pour une première couronne.',
    `- Pour une « création au lock » (les créations VÈKPÈ™), \`locks\` est le nombre de locks À CRÉER, et tu prends la création du calibre qui correspond à ce nombre${bornes ? ` (calibres de la Maison : ${bornes})` : ''}. Pour toute autre prestation, \`locks\` vaut 0 : un soin « au lock sur la tête » (un resserrage) se compte sur \`locksDeLaTete\`, pas sur la ligne.`,
    '- Un défaisage et une réparation ne vont JAMAIS ensemble. On répare des locks qu’on garde ; un défaisage les défait toutes, et la tête revient aux cheveux naturels (afro). Ce qui suit un défaisage est un nouveau départ : une création nouvelle (VÈKPÈ™), jamais une réparation. Si la situation semble demander les deux, tu suis le chemin qu’elle décrit et tu dis le doute dans `reserves`.',
    '- `locksDeLaTete` est le nombre de locks que la cliente porte aujourd’hui, s’il est dit ; sinon 0. Ne le devine pas.',
    '- `longueur` est la longueur des locks si elle est dite (court, mi-long, long), sinon une chaîne vide. Ne la devine pas.',
    `- \`totalVoulu\` est le total que la Maison veut atteindre, en ${deviseDite(o.devise)}${enFrancs ? ' (« pour que le devis s’arrête à 160 000 F »)' : ''}, sinon 0. Tu le recopies tel qu’il est dit, sans le calculer ni le convertir.`,
    '- Une prestation par geste demandé, pas plus. Si la situation ne se range dans aucune prestation, tu ne l’inventes pas : tu la dis dans `reserves`.',
    '- `raison` : une courte phrase, en français, qui dit pourquoi cette prestation. `reserves` : ce qui manque ou t’a fait douter (longueur non dite, nombre de locks flou), une phrase par point, ou rien.',
    `- Aujourd’hui : ${o.aujourdhui}.`,
    '',
    'CATALOGUE (identifiant | nom | mode | extrait)',
    catalogue,
  ].join('\n');
}

export const SCHEMA_DU_DEVIS: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lignes: {
      type: 'array',
      maxItems: LIGNES_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          serviceId: { type: 'string', description: 'L’identifiant de la prestation, tel qu’au catalogue.' },
          quantite: { type: 'integer', minimum: 1, maximum: QUANTITE_MAX, description: 'Combien de fois, 1 le plus souvent.' },
          locks: { type: 'integer', minimum: 0, maximum: LOCKS_MAX, description: 'Locks à créer pour une prestation au lock, sinon 0.' },
          raison: { type: 'string', description: 'Pourquoi cette prestation, une phrase.' },
        },
        required: ['serviceId', 'quantite', 'locks', 'raison'],
      },
    },
    locksDeLaTete: { type: 'integer', minimum: 0, maximum: LOCKS_MAX },
    longueur: { type: 'string', enum: ['', 'court', 'mi-long', 'long'] },
    totalVoulu: { type: 'number', minimum: 0, description: 'Le total voulu, dans la devise de la Maison, ou 0.' },
    reserves: { type: 'array', maxItems: 6, items: { type: 'string' } },
  },
  required: ['lignes', 'locksDeLaTete', 'longueur', 'totalVoulu', 'reserves'],
};

/* ── LA LECTURE, REVALIDÉE ────────────────────────────────────────────── */
export type LigneLue = { serviceId: string; quantite: number; locks: number; raison: string };
export type DevisLu = {
  lignes: LigneLue[];
  locksDeLaTete: number;
  longueur: LongueurId | '';
  /** Le total voulu TEL QU'IL EST DIT, dans la devise de la branche, au
      centime près : `devisDepuisLaLecture` le ramène en XOF. */
  totalVoulu: number;
  reserves: string[];
  /** Ce qu'on a écarté à la lecture (identifiant hors catalogue, ligne en trop). */
  ecartees: string[];
};

const nombre = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};
const entier = (v: unknown, min: number, max: number): number | null => {
  const n = nombre(v, min, max);
  return n === null ? null : Math.round(n);
};

export function lectureDuDevis(data: unknown, services: readonly PrestationDuCatalogue[]): DevisLu | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.lignes)) return null;
  const permises = new Map(prestationsProposables(services).map((s) => [s.id, s]));
  const lignes: LigneLue[] = [];
  const ecartees: string[] = [];
  const idDe = (brute: unknown): string => {
    const v = brute && typeof brute === 'object' ? (brute as Record<string, unknown>).serviceId : undefined;
    return typeof v === 'string' ? v.trim() : '';
  };
  /* UN DÉFAISAGE NE SE RÉPARE PAS : s'il est au devis, aucune réparation n'y entre. */
  const defait = d.lignes.some((brute) => { const sv = permises.get(idDe(brute)); return !!sv && estUnDefaisage(sv); });
  for (const brute of d.lignes) {
    if (!brute || typeof brute !== 'object') continue;
    const l = brute as Record<string, unknown>;
    const id = idDe(brute);
    const sv = permises.get(id);
    if (!sv) { ecartees.push(id ? `« ${net(id, 40)} » n’est pas au catalogue` : 'une ligne sans prestation'); continue; }
    if (defait && estUneReparation(sv)) { ecartees.push(`« ${sv.name} », parce qu’on ne répare pas des locks qu’on défait : après le défaisage, la tête revient aux cheveux naturels, et la suite est une création nouvelle`); continue; }
    if (lignes.length >= LIGNES_MAX) { ecartees.push(`« ${sv.name} » (trop de lignes)`); continue; }
    lignes.push({
      serviceId: id,
      quantite: entier(l.quantite, 1, QUANTITE_MAX) ?? 1,
      /* Des locks sur la ligne pour une création seulement : un soin au lock se
         compte sur la tête (`locksDeLaTete`), pas sur un nombre posé sur sa ligne. */
      locks: estUneCreationAuLock(sv) ? (entier(l.locks, 0, LOCKS_MAX) ?? 0) : 0,
      raison: net(typeof l.raison === 'string' ? l.raison : '', 160),
    });
  }
  const longueur = d.longueur === 'court' || d.longueur === 'mi-long' || d.longueur === 'long' ? d.longueur : '';
  return {
    lignes,
    locksDeLaTete: entier(d.locksDeLaTete, 0, LOCKS_MAX) ?? 0,
    longueur,
    totalVoulu: Math.round((nombre(d.totalVoulu, 0, 100_000_000) ?? 0) * 100) / 100,
    reserves: Array.isArray(d.reserves) ? d.reserves.filter((r): r is string => typeof r === 'string').map((r) => net(r, 200)).filter(Boolean).slice(0, 6) : [],
    ecartees,
  };
}

/* ── LE DEVIS CHIFFRÉ PAR LA MAISON ───────────────────────────────────── */
export type LigneDuDevis = {
  serviceId: string;
  label: string;
  qty: number;
  unitXof: number;
  /** Les locks comptés, pour une prestation au lock ; 0 sinon. */
  locks: number;
  raison: string;
};

export type DevisPropose = {
  lignes: LigneDuDevis[];
  brutXof: number;
  remiseXof: number;
  totalXof: number;
  /** Le total voulu, RAMENÉ EN XOF (0 s'il n'y en a pas). */
  totalVoulu: number;
  /** La longueur qui a servi aux prix : celle de la description, sinon celle de la fiche. */
  longueur: LongueurId | '';
  /** Ce que la Maison doit savoir avant d'ouvrir le brouillon. */
  avertissements: string[];
};

/** Le juge des prix : celui de la Caisse (`personalPriceXof`), injecté pour que ce module reste sans magasin.
    Il prend les locks et la longueur TELS QU'ILS LUI SONT DONNÉS, sans repli sur la fiche : c'est
    `devisDepuisLaLecture` qui décide d'où ils viennent, pour que ses avertissements disent vrai. */
export type JugeDesPrix = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: LongueurId | '' }) => number;

/** Ce que la fiche de la cliente sait déjà, quand une cliente est choisie. */
export type CeQueSaitLaFiche = { lockCount?: number; longueur?: LongueurId | '' };

const LONGUEURS_DITES: Record<LongueurId, string> = { court: 'courtes', 'mi-long': 'mi-longues', long: 'longues' };

export function devisDepuisLaLecture(
  lu: DevisLu,
  o: {
    services: readonly PrestationDuCatalogue[]; prixDe: JugeDesPrix; plafondDeRemiseXof: (baseXof: number) => number;
    /** Comment une somme se dit : `fmtMoney` dans la devise de la branche, injecté comme le juge des prix.
        Les avertissements écrivaient « 160000 F » en dur, faux hors du franc et sans séparateur. */
    somme: (xof: number) => string;
    /** Le total voulu est dit dans la devise de la branche : cette fonction le ramène en XOF
        (`toXof`). Absente : la branche compte en francs CFA. Sans elle, « 250 € » se lisait
        250 F, et la direction, sans plafond, accordait une remise de presque tout (revue du
        17 novembre 2026). */
    enXof?: (montantDit: number) => number;
    /** La fiche de la cliente choisie : son nombre de locks et sa longueur servent quand la
        description ne les dit pas, ET L'AVERTISSEMENT LE DIT. Le juge des prix y retombait
        en silence pendant que l'avertissement annonçait le prix du catalogue ou des locks
        courtes (revue du 17 novembre 2026). */
    fiche?: CeQueSaitLaFiche;
    /** Une création servirait-elle ce nombre de locks ? Le juge des calibres de la Caisse
        (`servesBand`), injecté. Hors de son calibre, une création sort au prix du catalogue :
        il faut le dire. Absent : on ne le vérifie pas. */
    horsDeSonCalibre?: (sv: PrestationDuCatalogue, locks: number) => boolean;
  },
): DevisPropose {
  const parId = new Map(o.services.map((s) => [s.id, s]));
  const avertissements: string[] = lu.ecartees.map((e) => `Écartée : ${e}.`);

  /* D'OÙ VIENNENT LA TÊTE ET LA LONGUEUR : la description d'abord, la fiche
     ensuite, et rien d'autre. Ce qui vient de la fiche se dit plus bas. */
  const teteDeLaFiche = o.fiche?.lockCount && o.fiche.lockCount > 0 ? Math.round(o.fiche.lockCount) : undefined;
  const tete = lu.locksDeLaTete > 0 ? lu.locksDeLaTete : teteDeLaFiche;
  const longueurDeLaFiche = o.fiche?.longueur || '';
  const longueur: LongueurId | '' = lu.longueur || longueurDeLaFiche;

  const lignes: LigneDuDevis[] = [];
  let laTeteCompte = false;
  let laLongueurCompte = false;
  for (const l of lu.lignes) {
    const sv = parId.get(l.serviceId);
    if (!sv) continue;
    const creation = estUneCreationAuLock(sv);
    /* LES LOCKS DE LA LIGNE POUR UNE CRÉATION, ceux de la tête pour le reste : un
       resserrage se prix sur la couronne entière, une création sur ce qu'on pose.
       Une création sans nombre ne prend JAMAIS celui de la tête : 295 locks nées
       ailleurs ne disent pas combien on en recrée. */
    const locks = creation ? l.locks : 0;
    const locksDuPrix = creation ? (locks > 0 ? locks : undefined) : tete;
    if (creation && locks <= 0) avertissements.push(`« ${sv.name} » se compte au lock et le nombre de locks à créer n’est pas dit : prix du catalogue, à préciser.`);
    if (suitLaTete(sv)) {
      laTeteCompte = true;
      if (tete === undefined) avertissements.push(`« ${sv.name} » se chiffre sur la tête de la cliente, et son nombre de locks n’est pas dit : prix du catalogue, à préciser.`);
    }
    if (Object.keys(sv.prixParLongueur ?? {}).length > 0 || Object.keys(sv.tarifLockParLongueur ?? {}).length > 0) laLongueurCompte = true;
    const unit = Math.max(0, Math.round(o.prixDe(sv, { locks: locksDuPrix, longueur })));
    if (unit <= 0) avertissements.push(sv.priceMode === 'devis' ? `« ${sv.name} » se chiffre sur devis : son prix est à écrire à la main.` : `« ${sv.name} » n’a pas de prix pour cette situation (calibre ou nombre de locks) : prix à écrire à la main.`);
    else if (creation && locks > 0 && o.horsDeSonCalibre?.(sv, locks)) avertissements.push(`« ${sv.name} » ne sert pas une création de ${locks} locks (hors de son calibre) : prix du catalogue, à vérifier.`);
    lignes.push({ serviceId: sv.id, label: sv.name, qty: l.quantite, unitXof: unit, locks, raison: l.raison });
  }
  if (lignes.length === 0) avertissements.push('Aucune prestation du catalogue ne répond à cette situation : ajoutez-les à la main.');
  if (laTeteCompte && lu.locksDeLaTete <= 0 && teteDeLaFiche !== undefined) avertissements.push(`Le nombre de locks de la tête n’est pas dit : celui de sa fiche est pris (${teteDeLaFiche} locks).`);
  if (laLongueurCompte && !lu.longueur) {
    avertissements.push(longueurDeLaFiche
      ? `La longueur des locks n’est pas dite : celle de sa fiche est prise (locks ${LONGUEURS_DITES[longueurDeLaFiche]}).`
      : 'La longueur des locks n’est pas dite : les prix qui en dépendent sont ceux du catalogue, à ajuster.');
  }
  for (const r of lu.reserves) avertissements.push(r);

  const brutXof = lignes.reduce((s, l) => s + l.qty * l.unitXof, 0);
  const vouluXof = lu.totalVoulu > 0 ? Math.max(0, Math.round(o.enXof ? o.enXof(lu.totalVoulu) : lu.totalVoulu)) : 0;
  let remiseXof = 0;
  if (vouluXof > 0) {
    if (vouluXof >= brutXof) {
      if (vouluXof > brutXof) avertissements.push(`Le total voulu (${o.somme(vouluXof)}) dépasse la somme des prestations (${o.somme(brutXof)}) : rien n’est majoré.`);
    } else {
      const voulue = brutXof - vouluXof;
      const permise = o.plafondDeRemiseXof(brutXof);
      remiseXof = Math.min(voulue, permise);
      if (remiseXof < voulue) avertissements.push(`La remise demandée (${o.somme(voulue)}) dépasse ce que l’équipe peut accorder : plafonnée à ${o.somme(remiseXof)}. La direction peut aller au-delà.`);
    }
  }
  return { lignes, brutXof, remiseXof, totalXof: brutXof - remiseXof, totalVoulu: vouluXof, longueur, avertissements };
}

/** La description qui part vers Claude : bornée, jamais vide. */
export const descriptionPourClaude = (s: string): string | null => {
  const t = String(s ?? '').trim();
  return t.length < 8 ? null : t.slice(0, SIGNES_MAX_DE_LA_DESCRIPTION);
};
