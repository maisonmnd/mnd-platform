/* ══ LE CLUB DES PETITES COURONNES — 21 octobre 2026 ═══════════════════
   « Aujourd'hui, j'ai eu un enfant qui est parti sur le site de Maison MND,
   qui était tout fier, et il voulait savoir en quoi consistait le programme
   de MND Kids. Je n'avais pas grande réponse pour lui » (Yéman). Programme
   proposé (artefact PsdoECCZ), choisi au sélecteur : le Club des Petites
   Couronnes, un collier de cauris et des tampons, les cadeaux tels quels,
   « tu » pour l'enfant ; les visites passées comptent, les cadeaux partent
   d'aujourd'hui.

   UNE SEULE RÈGLE, ICI. Le Trône (la carte de la fiche, le signal sur le
   rendez-vous) et Ma Couronne (le collier d'une tête portée) lisent ce
   module ; aucun écran ne recompte. Pur : aucun magasin, le jour passé en
   argument, jamais `Date.now()`.

   UN CAURIS = UN RENDEZ-VOUS HONORÉ, compté une fois, s'il porte au moins
   une prestation MND Kids, ou si l'enfant avait 15 ans ou moins ce jour-là
   (date de naissance connue). Un adulte qui n'a jamais eu de prestation Kids
   n'est pas du Club : sa fiche ne montre rien. */

/** Le jour où le Club commence : les paliers atteints avant ne donnent qu'un
    cadeau, le plus haut. */
export const CLUB_DEPUIS = '2026-10-21';

/** Le collier : dix cauris. Au-delà, il est plein. */
export const COLLIER = 10;

/** L'âge jusqu'auquel une venue compte d'office (`AGE_MND_KIDS`, accounts.ts). */
export const AGE_DU_CLUB = 15;

/** La catégorie MND Kids du catalogue (`CAT_KIDS`, kids.ts, qui lit les
    magasins : sa valeur est recopiée ici, et le banc vérifie qu'elles disent
    la même chose). */
export const CATEGORIE_KIDS = 'cat-mnd-kids';

/** LA PREMIÈRE COURONNE KIDS : la pose seule, ou le pack de naissance. Son
    premier rendez-vous honoré donne le jour de l'anniversaire de couronne. */
export const PREMIERE_COURONNE_KIDS: readonly string[] = ['sv-kids-vekpe', 'sv-kids-naissance'];

export type PalierDuClub = {
  cauris: number;
  nom: string;
  /** Le cadeau, dit à l'enfant (« tu »). */
  cadeauPourToi: string;
  /** Le cadeau, dit à la Maison et aux parents. */
  cadeau: string;
  /** Ce que la Maison remet, en court, pour le comptoir. */
  aRemettre: string;
};

export const PALIERS_DU_CLUB: readonly PalierDuClub[] = [
  /* LES CADEAUX REVUS PAR YÉMAN AU SÉLECTEUR, le 21 octobre 2026 : l'écusson
     du Club à l'entrée, le bonnet de nuit en satin, la trousse « Mon kit de
     couronne », le cauris d'or au collier plein. */
  { cauris: 1, nom: 'Bienvenue', cadeauPourToi: 'le cordon, le carnet et l’écusson du Club', cadeau: 'le cordon, le carnet et l’écusson du Club', aRemettre: 'le cordon, le carnet et l’écusson du Club' },
  { cauris: 3, nom: 'Le premier rang', cadeauPourToi: 'un bonnet de nuit en satin à ta taille', cadeau: 'un bonnet de nuit en satin à sa taille', aRemettre: 'le bonnet de nuit' },
  { cauris: 6, nom: 'La moitié du collier', cadeauPourToi: 'la trousse « Mon kit de couronne »', cadeau: 'la trousse « Mon kit de couronne »', aRemettre: 'la trousse « Mon kit de couronne »' },
  { cauris: 10, nom: 'Petite Couronne', cadeauPourToi: 'le cauris d’or, le diplôme et ta photo dans le carnet', cadeau: 'le cauris d’or, le diplôme et sa photo dans le carnet', aRemettre: 'le cauris d’or, le diplôme et la photo' },
];

export type RdvDuClub = { id: string; clientId: string; date: string; time?: string; status: string; serviceIds: readonly string[] };
export type ServiceDuClub = { id: string; categoryId?: string };
export type CadeauRemis = { le: string; par?: string };
export type FicheDuClub = { id: string; birthday?: string; clubCadeaux?: Readonly<Record<string, CadeauRemis>> };

const estIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10));

/** L'ÂGE À UN JOUR DONNÉ, lu sur les chaînes : aucune horloge, aucun fuseau. */
export function ageAuJour(naissance: string | undefined, jour: string): number | undefined {
  if (!estIso(naissance) || !estIso(jour)) return undefined;
  const [an, mn, jn] = naissance.slice(0, 10).split('-').map(Number);
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  let age = a - an;
  if (m < mn || (m === mn && j < jn)) age -= 1;
  return age;
}

/** UNE VENUE DU CLUB : honorée, et Kids par sa prestation ou par l'âge. */
export function estUneVenueDuClub(
  a: RdvDuClub, fiche: Pick<FicheDuClub, 'birthday'>, services: ReadonlyMap<string, ServiceDuClub>,
): boolean {
  if (a.status !== 'honoré') return false;
  if (a.serviceIds.some((id) => services.get(id)?.categoryId === CATEGORIE_KIDS)) return true;
  const age = ageAuJour(fiche.birthday, a.date);
  return age !== undefined && age >= 0 && age <= AGE_DU_CLUB;
}

export type CaurisDuClub = { rdvId: string; date: string; rang: number };

const parOrdre = (x: RdvDuClub, y: RdvDuClub): number =>
  x.date.localeCompare(y.date) || (x.time ?? '').localeCompare(y.time ?? '') || x.id.localeCompare(y.id);

/** SES CAURIS, dans l'ordre des venues : le premier est son premier rang. */
export function caurisDe(
  fiche: FicheDuClub, appts: readonly RdvDuClub[], services: ReadonlyMap<string, ServiceDuClub>,
): CaurisDuClub[] {
  return appts
    .filter((a) => a.clientId === fiche.id && estUneVenueDuClub(a, fiche, services))
    .slice().sort(parOrdre)
    .map((a, i) => ({ rdvId: a.id, date: a.date.slice(0, 10), rang: i + 1 }));
}

export type CadeauDuClub = {
  palier: PalierDuClub;
  /** Le jour du cauris qui a fait atteindre le palier. */
  atteintLe: string;
  /** Atteint avant le Club : seul le plus haut de ceux-là se remet. */
  avantLeClub: boolean;
  remis?: CadeauRemis;
};

export type AnniversaireDeCouronne = {
  /** Le jour de sa Première Couronne à la Maison. */
  premiereCouronne: string;
  /** Le prochain anniversaire, aujourd'hui compris. */
  prochain: string;
  /** Les années qu'il fêtera ce jour-là (1 au moins). */
  ans: number;
  /** C'est aujourd'hui. */
  aujourdhui: boolean;
};

export type ReleveDuClub = {
  /** Du Club : au moins un cauris, ou un enfant de 15 ans ou moins. */
  membre: boolean;
  cauris: number;
  /** Ce que le collier montre : dix au plus. */
  surLeCollier: number;
  plein: boolean;
  liste: CaurisDuClub[];
  /** Le palier le plus haut atteint. */
  palier?: PalierDuClub;
  /** Le prochain, et ce qu'il manque. */
  prochain?: { palier: PalierDuClub; manque: number };
  /** Les cadeaux qui reviennent à l'enfant (remis ou non), du plus ancien au plus récent. */
  cadeaux: CadeauDuClub[];
  /** Ceux qui restent à remettre. */
  cadeauxARemettre: CadeauDuClub[];
  anniversaire?: AnniversaireDeCouronne;
};

const anneeDe = (jour: string): number => Number(jour.slice(0, 4));

/** LE PROCHAIN ANNIVERSAIRE d'un jour, à partir d'aujourd'hui (compris). Un
    29 février se fête le 28 les années communes. */
function prochainAnniversaire(origine: string, jour: string): { date: string; ans: number } {
  const [ao, mo, jo] = origine.split('-').map(Number);
  const dit = (an: number): string => {
    const bissextile = (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;
    const j = mo === 2 && jo === 29 && !bissextile ? 28 : jo;
    return `${an}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  };
  let an = Math.max(ao + 1, anneeDe(jour));
  if (dit(an) < jour) an += 1;
  return { date: dit(an), ans: an - ao };
}

/** LE RELEVÉ DU CLUB d'une fiche, au jour dit. */
export function releveDuClub(e: {
  jour: string;
  fiche: FicheDuClub;
  appts: readonly RdvDuClub[];
  services: ReadonlyMap<string, ServiceDuClub>;
}): ReleveDuClub {
  const { jour, fiche, appts, services } = e;
  const liste = caurisDe(fiche, appts, services);
  const n = liste.length;
  const age = ageAuJour(fiche.birthday, jour);
  const membre = n > 0 || (age !== undefined && age >= 0 && age <= AGE_DU_CLUB);
  const atteints = PALIERS_DU_CLUB.filter((p) => n >= p.cauris);
  const palier = atteints[atteints.length - 1];
  const suivant = PALIERS_DU_CLUB.find((p) => n < p.cauris);

  /* LES CADEAUX : chaque palier atteint depuis le Club. LE KIT DE BIENVENUE
     (palier 1 : le cordon, le carnet, l'écusson) revient à TOUT membre, même
     venu bien avant le Club : sans cordon, pas de cauris (Yéman, 21 octobre
     2026). Parmi les autres paliers atteints avant, le plus haut seulement. */
  const tous = atteints.map((p): CadeauDuClub => {
    const atteintLe = liste[p.cauris - 1].date;
    const remis = fiche.clubCadeaux?.[String(p.cauris)];
    return { palier: p, atteintLe, avantLeClub: atteintLe < CLUB_DEPUIS, ...(remis ? { remis } : {}) };
  });
  const estLaBienvenue = (c: CadeauDuClub): boolean => c.palier.cauris === PALIERS_DU_CLUB[0].cauris;
  const autresAvant = tous.filter((c) => c.avantLeClub && !estLaBienvenue(c));
  const plusHautAvant = autresAvant[autresAvant.length - 1];
  const cadeaux = tous.filter((c) => estLaBienvenue(c) || !c.avantLeClub || c === plusHautAvant);

  /* L'ANNIVERSAIRE DE COURONNE : le premier rendez-vous honoré de sa Première
     Couronne Kids. */
  const premiere = appts
    .filter((a) => a.clientId === fiche.id && a.status === 'honoré' && a.serviceIds.some((id) => PREMIERE_COURONNE_KIDS.includes(id)))
    .slice().sort(parOrdre)[0];
  let anniversaire: AnniversaireDeCouronne | undefined;
  if (premiere && estIso(premiere.date)) {
    const origine = premiere.date.slice(0, 10);
    const p = prochainAnniversaire(origine, jour);
    anniversaire = { premiereCouronne: origine, prochain: p.date, ans: p.ans, aujourdhui: p.date === jour };
  }

  return {
    membre,
    cauris: n,
    surLeCollier: Math.min(n, COLLIER),
    plein: n >= COLLIER,
    liste,
    ...(palier ? { palier } : {}),
    ...(suivant ? { prochain: { palier: suivant, manque: suivant.cauris - n } } : {}),
    cadeaux,
    cadeauxARemettre: cadeaux.filter((c) => !c.remis),
    ...(anniversaire ? { anniversaire } : {}),
  };
}

/** CE QUE CE RENDEZ-VOUS FAIT AU COLLIER, pour la fiche du rendez-vous : son
    rang (déjà compté, ou qu'il aurait une fois honoré) et le palier qu'il
    atteint. `undefined` : il ne compte pas (adulte, ou annulé). */
export function caurisDuRdv(
  rdv: RdvDuClub, fiche: FicheDuClub, appts: readonly RdvDuClub[], services: ReadonlyMap<string, ServiceDuClub>,
): { rang: number; palier?: PalierDuClub; dejaCompte: boolean } | undefined {
  if (rdv.status === 'annulé') return undefined;
  const commeHonore: RdvDuClub = { ...rdv, status: 'honoré' };
  if (!estUneVenueDuClub(commeHonore, fiche, services)) return undefined;
  const autres = appts.filter((a) => a.id !== rdv.id);
  const liste = caurisDe(fiche, [...autres, commeHonore], services);
  const moi = liste.find((c) => c.rdvId === rdv.id);
  if (!moi) return undefined;
  const palier = PALIERS_DU_CLUB.find((p) => p.cauris === moi.rang);
  return { rang: moi.rang, dejaCompte: rdv.status === 'honoré', ...(palier ? { palier } : {}) };
}

/** « 3e cauris », « 1er cauris ». */
export const rangDit = (n: number): string => (n === 1 ? '1er cauris' : `${n}e cauris`);

/** LA PHRASE DU COMPTOIR, quand un palier tombe : « 3e cauris : le foulard
    de nuit est à remettre. » */
export const phraseDuPalier = (rang: number, p: PalierDuClub): string =>
  `${rangDit(rang)} : ${p.aRemettre} ${/^les | et /.test(p.aRemettre) ? 'sont' : 'est'} à remettre.`;

/** LE GESTE « REMIS » : la fiche garde le jour et la main. Remis deux fois,
    le premier jour reste : le geste ne réécrit pas l'histoire. Pur : rend la
    valeur à écrire, le magasin l'écrit (`poseLeCadeauDuClub`, clients.ts). */
export const cadeauxApresRemise = (
  fiche: Pick<FicheDuClub, 'clubCadeaux'>, palier: number, le: string, par?: string,
): Record<string, CadeauRemis> => (fiche.clubCadeaux?.[String(palier)]
  ? { ...fiche.clubCadeaux }
  : { ...(fiche.clubCadeaux ?? {}), [String(palier)]: { le, ...(par ? { par } : {}) } });
