/* ══ LES PLACES LIMITÉES AU TRÔNE — 4 novembre 2026 ═══════════════════════
   La décision de Yéman (maquette « Places limitées » AhFRNqiggFoaiR725iKSQe,
   « construis ») : −15 % sur les shampoings, lavages et soins, du mardi au
   vendredi, jamais le samedi, seulement un jour vide, trois places par jour
   décomptées (« Remise : il reste 3 places », « il reste 2 places », « il
   reste une place »), une réservation au plein tarif ce jour-là ferme les
   places restantes, une place prise est gardée. Une seule remise : jamais de
   place pour une tête aux prix convenus, abonnée, ni qui a déjà une remise
   (famille, code, remise de la main). Les jours, les places, l'horizon, le
   pourcentage et l'allumage se règlent dans Système › Paramètres.

   La règle elle-même vit dans `shared/offres-pur.ts` (`offreDuJourDeLaVenue`,
   `occupationDuJour`, `placesRestantes`), lue aussi par le site et Ma
   Couronne. CE MODULE NE LA RÉÉCRIT PAS : il dit seulement comment les trois
   portes du Trône (la fenêtre du rendez-vous, la Caisse, Son prochain rituel)
   la nourrissent depuis le carnet, et comment la carte des Paramètres écrit
   l'offre. Il est PUR (aucun magasin, aucun React) pour s'éprouver sans écran :
   `node scripts/verifie-les-places-au-trone.mjs --prouve`. */
import {
  codeNormalise, ditLesPlaces, estAPlaces, isoDuJour, joursEntre, laVenueTombeBien, occupationDuJour, offreDuJourDeLaVenue,
  placesRestantes, remiseFamilleDeLaTete, remisesDeLaMainSeules, JOURS_DES_OFFRES,
  type OccupationDuJour, type OffreCodee, type RdvACompter, type VenueAJuger,
} from '../../../../shared/offres-pur';

/** L'offre que règle la carte des Paramètres, posée en base par un réglage SQL. */
export const ID_DES_PLACES = 'of-places-limitees';
export const CODE_DES_PLACES = 'PLACES15';
export const TITRE_DES_PLACES = 'Places limitées';
/** L'ancienne offre du mercredi, éteinte : seule sa liste de gestes sert encore,
    quand la carte crée l'offre des places avant le réglage SQL. */
export const ID_DU_MERCREDI = 'of-mercredi15';

type OffreAuTrone = OffreCodee & { id?: string; branchId?: string; title?: string };

/* ── LE COMPTE, VU D'UN RENDEZ-VOUS ─────────────────────────────────────── */

/** Un rendez-vous qu'on relit (la fenêtre, le ticket de la Caisse). */
export type RdvRelu = { id: string; date?: string; status?: string; offreId?: string; codeOffre?: string };

/** L'offre à places dont ce rendez-vous porte la marque (son identifiant, ou
    à défaut son code), quelle que soit sa date. */
export function offreDesPlacesDuRdv<T extends OffreAuTrone>(rdv: Pick<RdvRelu, 'offreId' | 'codeOffre'> | null | undefined, offres: readonly T[]): T | undefined {
  if (!rdv) return undefined;
  return offres.find((o) => estAPlaces(o)
    && ((!!o.id && rdv.offreId === o.id) || (!!codeNormalise(o.code) && codeNormalise(rdv.codeOffre) === codeNormalise(o.code))));
}

/** LA PLACE QU'IL TIENT À CETTE DATE : l'identifiant de l'offre. Rien si la
    date relue n'est plus la sienne (déplacé, il redemande une place au jour
    neuf) ni s'il est annulé. C'est `offreTenue` d'`offreDuJourDeLaVenue`. */
export function placeTenue(rdv: RdvRelu | null | undefined, dateIso: string | null | undefined, offres: readonly OffreAuTrone[]): string | undefined {
  if (!rdv || rdv.status === 'annulé' || !dateIso) return undefined;
  if (String(rdv.date ?? '').slice(0, 10) !== String(dateIso).slice(0, 10)) return undefined;
  return offreDesPlacesDuRdv(rdv, offres)?.id;
}

/** Une pièce du comptoir, telle que le compte la lit. */
export type PieceACompter = { branchId?: string; date?: string; kind?: string; discountLabel?: string };

/** LES PLACES PRISES PAR UNE CLIENTE DE PASSAGE. Un ticket sans rendez-vous ne
    laisse rien au carnet : sa place se lit sur la pièce, dont le libellé de
    remise commence par le code de l'offre (« PLACES15 · 15 % hors gamme »,
    `libelleDuCode`). Sans ce compte, chaque passage d'un jour vide aurait
    trouvé ses trois places intactes. */
export function prisesAuComptoir(
  offre: { code?: string },
  pieces: readonly PieceACompter[],
  dateIso: string,
  branchId?: string,
): number {
  const code = codeNormalise(offre.code);
  if (!code) return 0;
  return pieces.filter((p) => !!p && p.kind !== 'devis'
    && String(p.date ?? '').slice(0, 10) === dateIso
    && (!branchId || !p.branchId || p.branchId === branchId)
    && codeNormalise(String(p.discountLabel ?? '').split('·')[0]) === code).length;
}

/** Ce que le Trône sait d'une venue : ce que lit `offreDuJourDeLaVenue`, plus
    le carnet d'où l'occupation se tire. */
export type VenueDuTrone = Omit<VenueAJuger, 'occupation' | 'offreTenue' | 'placesConnues'> & {
  /** Le carnet (le compte écarte les autres maisons et les annulés). */
  rdvs: readonly RdvACompter[];
  /** Le rendez-vous qu'on relit, s'il existe déjà. */
  relu?: RdvRelu | null;
  /** Les pièces du comptoir, pour une cliente de passage (ticket sans rendez-vous). */
  pieces?: readonly PieceACompter[];
};

export type JugementDuTrone<T> = {
  offre: T;
  /** Une offre à places (sinon, une offre du jour d'hier, sans compte). */
  aPlaces: boolean;
  /** Ce rendez-vous tient déjà sa place à cette date : elle est gardée. */
  tenue: boolean;
  /** Les places qui restent ce jour-là pour les autres, AVANT qu'il n'en prenne. */
  restantes: number | null;
};

/** L'OCCUPATION QUE VOIT CE RENDEZ-VOUS. Le rendez-vous relu est ôté du compte
    (`saufId`) quand il tient sa place : il ne la prend pas deux fois. S'il est
    déjà posé ce jour-là AU PLEIN TARIF, il reste compté parmi les autres : il
    a fermé le jour en le prenant (« une réservation au plein tarif ce jour-là
    ferme les places restantes »), et le rouvrir n'y change rien. Sans quoi
    rouvrir une réservation faite au plein tarif sur un jour vide lui aurait
    offert la remise et rendu au site des places que la base tient fermées.
    Déplacé à un autre jour, il n'est pas de ce jour : le compte est celui des
    autres. */
export function occupationPourLeRdv(
  offre: OffreAuTrone,
  rdvs: readonly RdvACompter[],
  dateIso: string,
  e: { branchId?: string; relu?: RdvRelu | null; pieces?: readonly PieceACompter[] } = {},
): OccupationDuJour {
  const tenue = placeTenue(e.relu, dateIso, [offre]);
  const occ = occupationDuJour(offre, rdvs, dateIso, { branchId: e.branchId, saufId: tenue ? e.relu?.id : undefined });
  return e.pieces ? { ...occ, prises: occ.prises + prisesAuComptoir(offre, e.pieces, dateIso, e.branchId) } : occ;
}

/** L'OFFRE DU JOUR QUI VAUT POUR CE RENDEZ-VOUS AU TRÔNE, ou `null`. Chaque
    offre à places se juge sur SON compte (l'occupation est propre à l'offre),
    les autres comme avant ; à plusieurs, la plus forte remise, comme
    `offreDuJourDeLaVenue`. */
export function lOffreDuJourAuTrone<T extends OffreAuTrone>(offres: readonly T[], v: VenueDuTrone): JugementDuTrone<T> | null {
  const { rdvs, relu, pieces, ...venue } = v;
  const date = venue.dateIso ? String(venue.dateIso).slice(0, 10) : null;
  const aujourdhui = venue.aujourdhui ?? isoDuJour(new Date());
  let mieux: JugementDuTrone<T> | null = null;
  for (const o of offres) {
    let j: JugementDuTrone<T> | null = null;
    if (estAPlaces(o)) {
      if (!date) continue;
      const tenue = placeTenue(relu, date, [o]);
      const occupation = occupationPourLeRdv(o, rdvs, date, { branchId: venue.branchId, relu, pieces });
      const r = offreDuJourDeLaVenue([o], { ...venue, aujourdhui, occupation, offreTenue: tenue });
      if (r) j = { offre: r, aPlaces: true, tenue: !!tenue, restantes: placesRestantes(o, date, occupation, aujourdhui) };
    } else {
      const r = offreDuJourDeLaVenue([o], venue);
      if (r) j = { offre: r, aPlaces: false, tenue: false, restantes: null };
    }
    if (j && (!mieux || (j.offre.discountPct ?? 0) > (mieux.offre.discountPct ?? 0))) mieux = j;
  }
  return mieux;
}

/** CE QUE LE BANDEAU ET LE PANIER DISENT : « Places limitées · Remise : il
    reste 2 places » avant la pose (les places restantes), « Places limitées ·
    place tenue » après (le rendez-vous la garde). Une offre sans places dit
    son seul titre. */
export function ditLaPlaceDuRdv(j: Pick<JugementDuTrone<{ title?: string }>, 'offre' | 'aPlaces' | 'tenue' | 'restantes'>): string {
  const titre = String(j.offre.title ?? '').trim() || TITRE_DES_PLACES;
  if (!j.aPlaces) return titre;
  if (j.tenue) return `${titre} · place tenue`;
  return (j.restantes ?? 0) > 0 ? `${titre} · ${ditLesPlaces(j.restantes as number)}` : titre;
}

/** L'offre à places qui POURRAIT valoir ce jour-là pour ces gestes : active, de
    la maison, un de ses jours, dans sa saison, sur un geste qu'elle couvre.
    Sert à dire pourquoi elle ne se pose pas ; elle ne remise rien. */
export function offreAPlacesDuJour<T extends OffreAuTrone>(
  offres: readonly T[],
  v: { branchId?: string; dateIso: string | null | undefined; serviceIds: readonly string[] },
): T | null {
  if (!v.dateIso) return null;
  const gestes = new Set(v.serviceIds);
  return offres.find((o) => !!o && o.active && estAPlaces(o) && !!codeNormalise(o.code)
    && !(o.branchId && v.branchId && o.branchId !== v.branchId)
    && laVenueTombeBien(o, v.dateIso)
    && (o.serviceIds ?? []).some((id) => gestes.has(id))) ?? null;
}

/** POURQUOI LA PLACE NE SE POSE PAS, dit à l'équipe : une remise qui ne vient
    pas sans raison passe pour une panne. Rien quand il n'y a rien à dire (un
    jour passé, une offre éteinte). Le premier motif l'emporte, dans l'ordre de
    la règle « une seule remise ». `jour` : le motif tient au jour (déjà pris,
    complet, trop loin), et non à la cliente ; l'écran le dit plus bas. */
export function pourquoiSansPlace(
  o: OffreAuTrone & { title?: string },
  v: {
    dateIso: string; aujourdhui: string; occupation: OccupationDuJour;
    prixConvenus?: boolean; abonnee?: boolean; famille?: boolean; autreRemise?: boolean;
    dejaUnCode?: string | boolean; couvert?: boolean; forfait?: boolean;
  },
): { texte: string; jour: boolean } | null {
  const titre = String(o.title ?? '').trim() || TITRE_DES_PLACES;
  const pct = Math.round(o.discountPct ?? 0);
  const non = (raison: string) => ({ texte: `${titre} ne s’applique pas : ${raison}.`, jour: false });
  if (v.prixConvenus) return non('ses prix convenus s’appliquent (une seule remise)');
  if (v.abonnee) return non('elle a une formule à cette date (une seule remise)');
  if (v.famille) return non('la remise famille de son foyer s’applique (une seule remise)');
  if (v.dejaUnCode) return non(typeof v.dejaUnCode === 'string' ? `ce rendez-vous porte déjà le code ${v.dejaUnCode}` : 'un autre code est déjà posé');
  if (v.couvert) return non('le rituel est couvert par l’abonnement');
  if (v.forfait) return non('un forfait est posé');
  if (v.autreRemise) return non('une remise est déjà posée (une seule remise)');
  const j = String(v.dateIso).slice(0, 10);
  if (j < v.aujourdhui) return null;
  const horizon = Math.floor(o.horizonJours ?? 0);
  if (horizon > 0 && joursEntre(v.aujourdhui, j) > horizon) return { texte: `${titre} : les places s’ouvrent ${horizon} jours à l’avance.`, jour: true };
  if (o.jourVideSeulement && v.occupation.autres > 0) return { texte: `${titre} : le jour a déjà des rendez-vous, aucune place à −${pct} %.`, jour: true };
  if (placesRestantes(o, j, v.occupation, v.aujourdhui) === 0) return { texte: `${titre} : plus de place à −${pct} % ce jour-là.`, jour: true };
  return null;
}

/** Les remises de la main d'un rendez-vous relu, celles de sa place ôtées. Une
    place se repose à chaque rendu (son pourcentage du jour) ; ses lignes ne
    sont donc jamais « de la main ». `remisesDeLaMainSeules` les reconnaît à
    leur pourcentage : si le réglage a changé depuis la pose (15 % devenu
    20 %), la ligne de la place passerait pour une remise de la main, et la
    place se perdrait sous « une seule remise ». Sur un rendez-vous qui porte
    la marque d'une offre à places, une ligne en pour cent seul sur un geste
    couvert est la sienne. */
export function remisesDeLaMainDuRdv(
  rdv: { codeOffre?: string; offreId?: string; serviceIds: readonly string[]; remisesLignes?: readonly ({ pct?: number; xof?: number } | null | undefined)[] },
  offres: readonly OffreAuTrone[],
): ({ pct?: number; xof?: number } | null)[] {
  const seules = remisesDeLaMainSeules(rdv, offres);
  const o = offreDesPlacesDuRdv(rdv, offres);
  if (!o) return seules;
  const couvre = new Set(o.serviceIds ?? []);
  return seules.map((r, i) => (r && !r.xof && (r.pct ?? 0) > 0 && couvre.has(rdv.serviceIds[i]) ? null : r));
}

/* ── LA REMISE FAMILLE D'UNE TÊTE ───────────────────────────────────────── */

/** LE TAUX FAMILLE QUI VAUT POUR CETTE TÊTE. Une seule remise : aux prix
    convenus ou abonnée, rien (`remiseFamilleDeLaTete`) ; un geste offert au
    panier, rien non plus (une seule faveur, 16 août 2026). */
export const famPctDeLaTete = (pctDuCompte: number, t: { prixConvenus?: boolean; abonnee?: boolean; gesteAuPanier?: boolean }): number =>
  t.gesteAuPanier ? 0 : remiseFamilleDeLaTete(pctDuCompte, t);

/** LA PART QUI PREND LA REMISE FAMILLE : ni un forfait (déjà réduit), ni un
    geste sans remise (le Rituel Sówà™, « aucune remise », 4 novembre 2026). */
export const baseDeLaRemiseFamille = (lignes: readonly { net: number; forfait?: boolean; sansRemise?: boolean }[]): number =>
  Math.max(0, lignes.reduce((n, l) => n + (l.forfait || l.sansRemise ? 0 : Math.max(0, Math.round(l.net))), 0));

/** La remise famille en francs exacts, sur cette part. */
export const remiseFamilleEnFrancs = (lignes: readonly { net: number; forfait?: boolean; sansRemise?: boolean }[], pct: number): number =>
  pct > 0 ? Math.round(baseDeLaRemiseFamille(lignes) * (pct / 100)) : 0;

/* ── LA REMISE SUR TOUT, JAMAIS SUR LE RITUEL SÓWÀ™ ─────────────────────
   4 novembre 2026, au sélecteur (Yéman) : « Le Rituel Sówà™ ne prend AUCUNE
   remise, même posée à la main ». La remise sur tout du rendez-vous, en pour
   cent comme en francs, porte sur le reste ; la ligne du Sówà garde son prix.
   Un rendez-vous sans geste sans remise se calcule exactement comme hier. */

export type RemiseSurTout = {
  /** Ce que le pourcentage retire, en francs. */
  pctXof: number;
  /** Les francs de la main, arrêtés où commence la part sans remise. */
  xof: number;
  /** Le total après la remise sur tout. */
  netXof: number;
  /** Le pourcentage s'écrit en francs : `apptNetXof` l'appliquerait sinon au
      rendez-vous entier, Sówà compris. */
  enFrancs: boolean;
};

export function laRemiseSurTout(e: {
  /** Le total du rendez-vous, remises de ligne déduites. */
  brutXof: number;
  /** La part des gestes sans remise (`gesteSansRemise`). */
  sansRemiseXof: number;
  pct: number;
  xof: number;
  /** La part que prend le pourcentage, quand elle est plus petite que « tout
      sauf le Sówà » (la remise famille épargne aussi les forfaits). */
  basePctXof?: number;
}): RemiseSurTout {
  const brut = Math.max(0, Math.round(e.brutXof));
  const sans = Math.min(brut, Math.max(0, Math.round(e.sansRemiseXof)));
  const base = Math.min(brut - sans, Math.max(0, Math.round(e.basePctXof ?? brut - sans)));
  const pctXof = Math.round(base * (Math.max(0, Math.min(100, e.pct || 0)) / 100));
  const saisi = Math.max(0, Math.round(e.xof || 0));
  const xof = sans > 0 ? Math.min(saisi, Math.max(0, brut - sans - pctXof)) : saisi;
  return { pctXof, xof, netXof: Math.max(0, brut - pctXof - xof), enFrancs: sans > 0 && pctXof > 0 };
}

/** LES REMISES DE LIGNE, CELLE D'UN GESTE SANS REMISE ÔTÉE : posée avant le
    4 novembre 2026 sur le Rituel Sówà™, elle ne revient pas à la réouverture
    d'un rendez-vous qui n'est pas figé. Tableau parallèle aux gestes. */
export function remisesHorsDuGesteSansRemise<R>(
  remises: readonly (R | null | undefined)[],
  serviceIds: readonly string[],
  sansRemise: (serviceId: string) => boolean,
): (R | null)[] {
  return remises.map((r, i) => (r && !sansRemise(serviceIds[i]) ? r : null));
}

/** LA PHRASE DE L'ÉCRAN, sur la ligne et sous la remise sur tout : « Le
    Rituel Sówà™ ne prend aucune remise. » Le nom vient du catalogue. */
export function ditLeGesteSansRemise(nom?: string | null): string {
  const n = String(nom ?? '').trim() || 'Rituel Sówà™';
  return /^rituel\b/i.test(n) ? `Le ${n} ne prend aucune remise.` : `${n} ne prend aucune remise.`;
}

/** LA REMISE FAMILLE QUI SUIT À LA VISITE SUIVANTE (`remiseFamilleQuiSuit`,
    la reprise, « Reprogrammé depuis l'encaissement ») : plus rien pour une
    tête passée aux prix convenus ou abonnée à la date de la suite. */
export const laFamilleSuitElle = (t: { prixConvenus?: boolean; abonnee?: boolean }): boolean => !t.prixConvenus && !t.abonnee;

/* ── LE RÉGLAGE (Système › Paramètres › Places limitées) ────────────────── */

/** Les jours qu'on coche : du mardi au samedi (la Maison ferme le lundi et le dimanche). */
export const JOURS_REGLABLES = ['Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;
export const DEFAUTS_DES_PLACES = { jours: ['Mar', 'Mer', 'Jeu', 'Ven'], places: 3, horizon: 14, pct: 15 } as const;
export const BORNES_DES_PLACES = {
  places: { min: 1, max: 10 },
  horizon: { min: 1, max: 60 },
  pct: { min: 5, max: 50 },
} as const;

export type ReglageDesPlaces = { active: boolean; jours: string[]; places: number; horizon: number; pct: number };

/** Un nombre tenu dans ses bornes ; illisible, le défaut. */
export function borne(v: unknown, b: { min: number; max: number }, defaut: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return defaut;
  return Math.max(b.min, Math.min(b.max, n));
}

/** Les jours dans l'ordre de la semaine, les seuls réglables. */
export const joursRanges = (jours: readonly string[]): string[] =>
  JOURS_DES_OFFRES.filter((j) => (JOURS_REGLABLES as readonly string[]).includes(j) && jours.includes(j));

/** LE RÉGLAGE TEL QU'IL EST : lu sur l'offre, les défauts quand elle n'existe
    pas encore (le premier enregistrement la crée). */
export function reglageDesPlaces(offres: readonly OffreAuTrone[]): ReglageDesPlaces & { existe: boolean; gestes: number } {
  const o = offres.find((x) => x?.id === ID_DES_PLACES);
  const mercredi = offres.find((x) => x?.id === ID_DU_MERCREDI);
  if (!o) {
    return {
      existe: false, active: false, jours: [...DEFAUTS_DES_PLACES.jours], places: DEFAUTS_DES_PLACES.places,
      horizon: DEFAUTS_DES_PLACES.horizon, pct: DEFAUTS_DES_PLACES.pct, gestes: (mercredi?.serviceIds ?? []).length,
    };
  }
  return {
    existe: true,
    active: !!o.active,
    jours: joursRanges(o.joursDeLaVenue ?? []),
    places: borne(o.placesParJour, BORNES_DES_PLACES.places, DEFAUTS_DES_PLACES.places),
    horizon: borne(o.horizonJours, BORNES_DES_PLACES.horizon, DEFAUTS_DES_PLACES.horizon),
    pct: borne(o.discountPct, BORNES_DES_PLACES.pct, DEFAUTS_DES_PLACES.pct),
    gestes: (o.serviceIds ?? []).length,
  };
}

/** Les champs d'affichage qu'une offre neuve reprend de l'ancienne offre du
    mercredi, et leurs replis. */
type OffreEcrite = OffreAuTrone & Record<string, unknown>;

/** LES OFFRES APRÈS LE RÉGLAGE. L'offre des places reçoit les jours (dans
    l'ordre de la semaine), les places, l'horizon, le pourcentage (et son
    « −15 % » affiché) et l'allumage, bornés ; toujours « seulement un jour
    vide ». Son code ne change pas : il marque les places déjà prises. ABSENTE,
    elle naît des défauts et des gestes de l'ancienne offre du mercredi, à la
    maison de la carte. Les autres offres ne bougent pas. */
export function offresApresLeReglage<T extends OffreEcrite>(
  offres: readonly T[],
  changes: Partial<ReglageDesPlaces>,
  e: { branchId: string },
): T[] {
  /* Absente, l'offre se lit éteinte : régler un nombre ne l'allume pas dans
     le dos de la direction, seul l'interrupteur le fait. */
  const lu = reglageDesPlaces(offres);
  const r: ReglageDesPlaces = {
    active: changes.active ?? lu.active,
    jours: joursRanges(changes.jours ?? lu.jours),
    places: borne(changes.places ?? lu.places, BORNES_DES_PLACES.places, DEFAUTS_DES_PLACES.places),
    horizon: borne(changes.horizon ?? lu.horizon, BORNES_DES_PLACES.horizon, DEFAUTS_DES_PLACES.horizon),
    pct: borne(changes.pct ?? lu.pct, BORNES_DES_PLACES.pct, DEFAUTS_DES_PLACES.pct),
  };
  const champs = {
    active: r.active,
    joursDeLaVenue: r.jours,
    placesParJour: r.places,
    jourVideSeulement: true,
    horizonJours: r.horizon,
    discountPct: r.pct,
    deal: `−${r.pct} %`,
  };
  if (offres.some((o) => o?.id === ID_DES_PLACES)) {
    return offres.map((o) => (o?.id === ID_DES_PLACES ? { ...o, ...champs } : o));
  }
  const mercredi = offres.find((o) => o?.id === ID_DU_MERCREDI) as OffreEcrite | undefined;
  const neuve = {
    title: TITRE_DES_PLACES,
    tag: TITRE_DES_PLACES,
    sub: 'sur les shampoings, lavages et soins, un jour encore vide',
    audience: typeof mercredi?.audience === 'string' ? mercredi.audience : 'Tous',
    days: Array.isArray(mercredi?.days) ? [...(mercredi.days as string[])] : [...JOURS_DES_OFFRES],
    heureDebut: typeof mercredi?.heureDebut === 'string' ? mercredi.heureDebut : '08h',
    heureFin: typeof mercredi?.heureFin === 'string' ? mercredi.heureFin : '20h',
    ...(typeof mercredi?.parcours === 'string' && mercredi.parcours ? { parcours: mercredi.parcours } : {}),
    vitrine: true,
    id: ID_DES_PLACES,
    branchId: e.branchId,
    code: CODE_DES_PLACES,
    serviceIds: [...(mercredi?.serviceIds ?? [])],
    ...champs,
  } as unknown as T;
  return [...offres, neuve];
}
