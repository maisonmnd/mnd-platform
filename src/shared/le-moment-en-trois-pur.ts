/* ══ LE MOMENT SE PAIE EN TROIS VENUES, PUR — 7 novembre 2026 ═══════════════
   « Le Moment se paie en 3 fois, il faut diviser le paiement en 3 venues »
   (Yéman). Maquette « Le Moment en trois venues » validée par « construis ».
   Deux choix, au sélecteur :
   · LE MOMENT SE VIT EN UNE FOIS, À LA PREMIÈRE VENUE, et se paie sur trois
     venues, un tiers à chacune, la première comprise ;
   · LES TROIS DATES SONT CHOISIES AU DÉPART : trois rendez-vous posés
     ensemble, un tiers attaché à chacun.

   Les autres venues sont des venues d'entretien ordinaires (GBÈJÍ™
   Essentiel ou Signature) qui n'encaissent que leur part.

   ⟨QUATRE VENUES — 7 novembre 2026⟩ « Il faut mettre 4 venues au total.
   Changer le Moment en 4 venues » (Yéman). Tout NOUVEAU plan a quatre venues
   (`VENUES_DU_MOMENT`) ; le nombre d'un plan existant est celui de ses tiers
   (`tiers.length`), un plan à trois venues se lit et s'encaisse comme avant.
   Les commentaires ci-dessous parlent de « trois » et de « tiers » par
   histoire : lire « N venues » et « part ». Un PRIX CONVENU (`tiersConvenus`,
   « mettre chaque venue à 45 000 F ») se pose à la main, sans passer par la
   grille ni l'arrondi.

   ON RÉUTILISE L'ÉCHÉANCIER DE LA MAISON (`echeancier.ts`), on ne le réécrit
   pas : les échéances d'ici sont des `Echeance`, leur état se dérive des
   règlements par `etatDesEcheances` (les règlements s'imputent dans l'ordre,
   la plus vieille d'abord), RIEN n'est stocké de ce qui se calcule. Ce qui
   change : la découpe est TOUJOURS trois, hors des seuils 100 000 / 200 000 des
   abonnements, et la date d'une échéance est la date d'un RENDEZ-VOUS, pas une
   date libre : le tiers suit son rendez-vous, il suit sa nouvelle date quand
   la venue est déplacée.

   QUATRE RÈGLES QUI NE SE DEVINENT PAS :

   ① CHAQUE TIERS S'ARRONDIT AU 500 F, ET LE PREMIER ABSORBE L'ARRONDI (la
     règle ② de l'échéancier). La somme des trois vaut EXACTEMENT le total,
     au franc : la Maison encaisse le surplus tout de suite, la dernière venue
     n'est jamais plus lourde qu'annoncé.
   ② JAMAIS DE REMISE AJOUTÉE, JAMAIS DE DETTE AJOUTÉE. Le total est le prix
     du Moment FIGÉ à la première venue ; le tiers n'est qu'une part de ce
     prix. Pas de remise sur un Moment réglé en trois fois, ni de cumul avec
     un autre avantage (« une seule remise »).
   ③ UN TIERS NON RÉGLÉ MET LE MOMENT EN PAUSE, comme une lune non réglée met
     une formule en pause (formules-en-lunes-pur.ts) : rien ne s'ajoute, rien
     ne se réclame en plus, la suite attend que le tiers soit réglé.
   ④ UNE VENUE DÉPLACÉE OU MANQUÉE GARDE SON TIERS. Le tiers est attaché au
     rendez-vous : déplacé, il porte sa nouvelle date ; manqué, il reste dû
     (et le Moment en pause).

   CE FICHIER N'IMPORTE QUE L'ÉCHÉANCIER : il est lu par le Trône, par Ma
   Couronne et par le banc. Les fonctions Edge n'en portent aucune copie : le
   reste de chaque rendez-vous (son prix figé, son argent reçu) est lu par les
   blocs ⟨reste-du-rdv⟩ de la fin, inchangés. */
import { etatDesEcheances, resteDeLEcheancier, type Echeance } from './echeancier';
import { arrondiAuCinqCents, prixApresRemisePct } from './arrondi-des-remises-pur';

/** Le service du Moment, et les deux venues d'entretien (catalogue, cat-venue). */
export const SERVICE_LE_MOMENT = 'sv-le-moment';
export const VENUE_ESSENTIEL = 'sv-venue-gbeji-ess';
export const VENUE_SIGNATURE = 'sv-venue-gbeji-sig';
/** SÍNSIN™ Essentiel : le geste qui distingue la venue Essentielle de la Signature. */
const SINSIN_ESSENTIEL = 'sv-atl-ii-e';

/** LE NOMBRE DE VENUES DÉPEND DU MOMENT (7 novembre 2026) : « Il faut mettre 4 venues au total. Changer le Moment en
    4 venues », précisé par « Les 4 venues sont sur le Moment cuir chevelu uniquement » (Yéman). Le Moment cuir
    chevelu se pose et se règle en QUATRE venues ; le Moment Signature reste à TROIS, comme livré. Le nombre de venues
    d'un plan existant vient du PLAN (`tiers.length`), jamais d'une constante : un plan à trois venues se lit et
    s'encaisse comme avant. Le NOM du champ `momentEnTrois` (sur le rendez-vous) et celui de ce fichier restent tels
    quels : ce sont des données et des liens déjà écrits. Seuls les MOTS lus par la cliente et l'équipe suivent le
    nombre (`enNVenues`). */
export const VENUES_DU_MOMENT = 3;
export const VENUES_DU_MOMENT_CUIR_CHEVELU = 4;
/** Le nombre de venues d'un NOUVEAU plan, selon le Moment choisi. */
export const venuesDuMomentPour = (serviceId: string | undefined): number =>
  serviceId === SERVICE_LE_MOMENT_CUIR_CHEVELU ? VENUES_DU_MOMENT_CUIR_CHEVELU : VENUES_DU_MOMENT;
/** LES VENUES SUIVANTES : pour le Moment cuir chevelu, ce sont AUSSI le Moment cuir chevelu (même geste, même durée,
    à son prix) ; pour le Moment Signature, la venue d'entretien qui lui correspond. */
export const serviceDesVenuesSuivantes = (momentId: string, inclus: readonly { serviceId?: string }[] | undefined): string =>
  momentId === SERVICE_LE_MOMENT_CUIR_CHEVELU ? momentId : venueDEntretienDuMoment(inclus);
/** Le nombre de venues dit en lettres, pour ce que la cliente et l'équipe lisent. */
export const NOMBRE_EN_LETTRES: Record<number, string> = { 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq' };
export const enLettres = (n: number): string => NOMBRE_EN_LETTRES[n] ?? String(n);
/** « en quatre venues ». */
export const enNVenues = (n: number): string => `en ${enLettres(n)} venues`;
/** Chaque tiers se compte en pièces de 500 F. */
export const ARRONDI_DU_TIERS_XOF = 500;
/** En dessous, un tiers tomberait à zéro : rien ne se découpe. */
export const totalMinimumXof = (n: number = VENUES_DU_MOMENT): number => n * ARRONDI_DU_TIERS_XOF;

/** Ce que chaque rendez-vous du plan porte, écrit une fois à la pose :
    de quoi relire le plan depuis n'importe lequel des trois. */
export type MomentEnTrois = {
  planId: string;
  /** La venue, de 1 à 3 : 1 = Le Moment. */
  /** La venue, de 1 à N (N = tiers.length) : 1 = Le Moment. */
  rang: number;
  /** Le plafond d'une venue (Moment cuir chevelu : 45 000 F) : aucune part ne le dépasse, remise comprise. Absent :
      pas de plafond. Les parts écrites sont déjà plafonnées ; ce champ le DIT. */
  plafondParVenueXof?: number;
  /** Le prix du Moment, FIGÉ le jour de la première venue. */
  total: number;
  /** Les trois tiers, écrits : une parole donnée ne se recalcule pas. */
  tiers: number[];
};

/** LES DEUX MOMENTS (0192, 0193, 7 novembre 2026) : « Le Moment Signature » et « Le Moment · cuir chevelu »,
    le même programme adapté. Les deux se règlent en trois venues. */
export const SERVICE_LE_MOMENT_CUIR_CHEVELU = 'sv-le-moment-cuir-chevelu';
export const LES_MOMENTS: readonly string[] = [SERVICE_LE_MOMENT, SERVICE_LE_MOMENT_CUIR_CHEVELU];

/** Un Moment est-il dans ces prestations ? */
export const contientLeMoment = (serviceIds: readonly string[] | undefined): boolean =>
  (serviceIds ?? []).some((id) => LES_MOMENTS.includes(id));

/** LA VENUE D'ENTRETIEN QUI SUIT LE MOMENT : Signature, sauf si le Moment
    contient la SÍNSIN™ Essentielle. Le Moment du catalogue contient la
    Signature : c'est donc GBÈJÍ™ Signature. */
export const venueDEntretienDuMoment = (inclus: readonly { serviceId?: string }[] | undefined): string =>
  (inclus ?? []).some((i) => i.serviceId === SINSIN_ESSENTIEL) ? VENUE_ESSENTIEL : VENUE_SIGNATURE;

/** LES TROIS TIERS. Chaque tiers d'entretien est un multiple de 500 F (le
    tiers entier en dessous), le premier prend ce qui reste : sa somme vaut
    exactement le total. Un total inconnu, nul, négatif ou trop petit pour
    trois pièces de 500 F ne se règle pas en trois : `null`. */
export function tiersDuMoment(total: unknown, n: number = VENUES_DU_MOMENT): number[] | null {
  if (typeof total !== 'number' || !Number.isFinite(total)) return null;
  const t = Math.round(total);
  if (n < 2 || t < totalMinimumXof(n)) return null;
  const part = Math.floor(t / n / ARRONDI_DU_TIERS_XOF) * ARRONDI_DU_TIERS_XOF;
  return [t - part * (n - 1), ...Array.from({ length: n - 1 }, () => part)];
}

/** Le Moment peut-il se régler en trois venues ? Seulement si son total est connu et assez grand. */
export const momentSeRegleEnTrois = (total: unknown, n: number = VENUES_DU_MOMENT): boolean => tiersDuMoment(total, n) !== null;

/** LE PLAFOND PAR VENUE DU MOMENT CUIR CHEVELU — 7 novembre 2026. « Il faut que, avec la remise, la cliente ne paie
    pas plus de 45 000 F. Réajuster au besoin » (Yéman). Lecture retenue : 45 000 F est un PLAFOND PAR VENUE, posé sur
    le plan (`plafondParVenueXof`). Une remise ne peut que BAISSER une part, jamais la monter au-dessus ; une part de
    la grille qui dépasse le plafond est ramenée au plafond. */
export const PLAFOND_PAR_VENUE_CUIR_CHEVELU_XOF = 45_000;

/** LES PARTS D'UN PLAN À PLAFOND : la part de la grille (`tiersDuMoment`), UNE remise (pourcentage arrondi au 500 F
    supérieur par `prixApresRemisePct`, puis francs répartis à parts égales), arrondie au 500 F, puis le plafond, et
    jamais moins de 500 F. La somme des parts est le total réel du plan. `null` si la grille ne découpe pas. */
export function tiersPlafonnes(total: unknown, n: number, o: { plafondXof: number; remisePct?: number; remiseXof?: number }): number[] | null {
  const grille = tiersDuMoment(total, n);
  if (!grille) return null;
  const enFrancs = Math.max(0, Math.floor((o.remiseXof ?? 0) / n / ARRONDI_DU_TIERS_XOF) * ARRONDI_DU_TIERS_XOF);
  return grille.map((t) => Math.max(ARRONDI_DU_TIERS_XOF,
    Math.min(Math.max(ARRONDI_DU_TIERS_XOF, Math.floor(o.plafondXof / ARRONDI_DU_TIERS_XOF) * ARRONDI_DU_TIERS_XOF),
      arrondiAuCinqCents(prixApresRemisePct(t, o.remisePct ?? 0) - enFrancs))));
}

/** UN PRIX CONVENU (7 novembre 2026) : « Mettre chaque venue à 45 000 F ». Des tiers posés à la main, chacun un
    multiple de 500 F au moins égal à 500 F : leur somme EST le total convenu, chaque tiers est son prix figé ;
    ni la grille ni l'arrondi ne les ramènent au prix de la tête. Invalide : `null`. */
export function tiersConvenus(tiers: unknown): number[] | null {
  if (!Array.isArray(tiers) || tiers.length < 2) return null;
  return tiers.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= ARRONDI_DU_TIERS_XOF && x % ARRONDI_DU_TIERS_XOF === 0)
    ? [...tiers] : null;
}

/** Les N dates sont-elles valides et dans l'ordre ? La première est le jour du Moment. */
export const datesDuPlanValides = (dates: readonly string[], n: number = VENUES_DU_MOMENT): boolean =>
  dates.length === n
  && dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  && dates.every((d, i) => i === 0 || dates[i - 1] <= d);

/** CE QU'ÉCRIT CHAQUE RENDEZ-VOUS à la pose du plan. Des tiers `convenus` (prix convenu) font foi : le total est
    leur somme ; sinon la grille, en `VENUES_DU_MOMENT` venues. */
export function momentEnTroisDuRang(planId: string, rang: number, total: number, convenus?: readonly number[], n: number = VENUES_DU_MOMENT, plafondXof?: number): MomentEnTrois | null {
  const tiers = convenus ? tiersConvenus([...convenus]) : tiersDuMoment(total, n);
  if (!tiers || rang < 1 || rang > tiers.length) return null;
  if (plafondXof !== undefined && tiers.some((x) => x > plafondXof)) return null;
  return { planId, rang, total: convenus ? tiers.reduce((s, x) => s + x, 0) : Math.round(total), tiers, ...(plafondXof !== undefined ? { plafondParVenueXof: plafondXof } : {}) };
}

/** LE FORFAIT QUE PORTE CHAQUE RENDEZ-VOUS : son tiers, et rien d'autre. C'est
    lui qui commande le net du rendez-vous (`apptNetXof`, `prixFigeDeLaFin`) ;
    `baseXof` vaut le tiers, donc AUCUNE remise ne se lit nulle part : un
    tiers n'est pas un prix consenti, c'est une part d'un prix entier. */
export function forfaitDuTiers(m: Pick<MomentEnTrois, 'rang' | 'tiers'>, jourIso: string): { nom: string; totalXof: number; baseXof: number; poseAt: string } {
  const tiers = m.tiers[m.rang - 1] ?? 0;
  return { nom: `Le Moment ${enNVenues(m.tiers.length)} · venue ${m.rang} sur ${m.tiers.length}`, totalXof: tiers, baseXof: tiers, poseAt: jourIso };
}

/** Le plan écrit une fois : l'échéancier de la Maison, une échéance par
    rendez-vous (sa date est celle de la venue). */
export function echeancierDuPlan(m: Pick<MomentEnTrois, 'tiers'>, dates: readonly string[]): Echeance[] {
  return m.tiers.map((montant, i) => ({ numero: i + 1, dueIso: dates[i] ?? dates[dates.length - 1] ?? '', amountXof: montant }));
}

export type EtatDuTiers = 'regle' | 'prochaine' | 'a-venir' | 'en-pause';

export type LigneDuPlan = {
  rang: number;
  rdvId: string | null;
  dateIso: string;
  montantXof: number;
  regleXof: number;
  resteXof: number;
  etat: EtatDuTiers;
};

export type LectureDuPlan = {
  lignes: LigneDuPlan[];
  /** Ce qu'il reste à encaisser sur le Moment : jamais plus que le total. */
  resteXof: number;
  /** Un tiers dont la venue est passée n'est pas réglé : le Moment attend. */
  enPause: boolean;
  /** Le tiers de la venue d'AUJOURD'HUI, s'il reste dû. */
  tiersDuJour: LigneDuPlan | null;
  /** Le premier tiers non réglé qui n'est pas passé : la prochaine venue. */
  prochaine: LigneDuPlan | null;
};

/** LE RENDEZ-VOUS, tel que le plan le lit. */
export type RdvDuPlan = {
  id: string;
  date: string;
  status?: string;
  clientId?: string;
  payments?: { amountXof?: number }[];
  paidXof?: number;
  momentEnTrois?: MomentEnTrois | null;
};

const nombre = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** L'argent versé sur ce rendez-vous : son journal, sinon `paidXof`. */
export const argentDeLaVenue = (r: Pick<RdvDuPlan, 'payments' | 'paidXof'>): number =>
  r.payments && r.payments.length > 0 ? r.payments.reduce((s, p) => s + nombre(p.amountXof), 0) : nombre(r.paidXof);

/** CE QUE LA VENUE A RÉGLÉ DE SON TIERS : jamais plus que son tiers. Un tiers
    ne se règle qu'une fois : ce qui déborde ne devient pas le tiers d'une
    autre venue, c'est un trop-perçu qui se traite ailleurs. */
export const regleDuTiers = (r: RdvDuPlan): number => {
  const m = r.momentEnTrois;
  return m ? Math.min(Math.max(0, argentDeLaVenue(r)), m.tiers[m.rang - 1] ?? 0) : 0;
};

/** CE QU'IL RESTE À ENCAISSER AU COMPTOIR POUR CETTE VENUE : son tiers moins
    ce qu'elle a déjà réglé, jamais le total du Moment. Zéro hors plan. */
export const tiersAEncaisser = (r: RdvDuPlan): number => {
  const m = r.momentEnTrois;
  return m ? Math.max(0, (m.tiers[m.rang - 1] ?? 0) - regleDuTiers(r)) : 0;
};

/** LES TROIS RENDEZ-VOUS D'UN PLAN, dans l'ordre des venues. */
export const rdvsDuPlan = <R extends RdvDuPlan>(rdvs: readonly R[], planId: string): R[] =>
  rdvs.filter((r) => r.momentEnTrois?.planId === planId)
    .sort((a, b) => (a.momentEnTrois?.rang ?? 0) - (b.momentEnTrois?.rang ?? 0));

/** LES PLANS D'UNE CLIENTE : les identifiants de plan de ses rendez-vous. */
export const plansDeLaCliente = (rdvs: readonly RdvDuPlan[], clientId: string): string[] =>
  [...new Set(rdvs.filter((r) => r.clientId === clientId && r.momentEnTrois).map((r) => r.momentEnTrois!.planId))];

/** LIT LE PLAN depuis ses rendez-vous : les dates sont celles des rendez-vous
    (une venue déplacée porte sa nouvelle date, règle ④), l'argent versé
    s'impute dans l'ordre (la plus vieille venue d'abord, règle ③ de
    l'échéancier). Rien de ce qu'on lit ici n'est stocké. */
export function lisLePlan(rdvsDuPlanLus: readonly RdvDuPlan[], aujourdhui: string): LectureDuPlan | null {
  const ref = rdvsDuPlanLus.find((r) => r.momentEnTrois)?.momentEnTrois;
  if (!ref) return null;
  const parRang = new Map<number, RdvDuPlan>();
  for (const r of rdvsDuPlanLus) if (r.momentEnTrois?.planId === ref.planId) parRang.set(r.momentEnTrois.rang, r);
  /* LE NOMBRE DE VENUES VIENT DU PLAN (ses tiers), pas d'un nombre figé : un plan à trois venues reste à trois. */
  const rangs = Array.from({ length: ref.tiers.length }, (_, i) => i + 1);
  const dates = rangs.map((k) => parRang.get(k)?.date ?? '');
  /* Une date manquante (venue effacée) se range avec la plus proche : le tiers
     reste dû, il ne disparaît pas avec le rendez-vous. */
  const datesLues = dates.map((d, i) => d || dates.slice(0, i).reverse().find(Boolean) || dates.find(Boolean) || aujourdhui);
  const verse = rangs.reduce((s, k) => { const r = parRang.get(k); return s + (r ? regleDuTiers(r) : 0); }, 0);
  const etats = etatDesEcheances(echeancierDuPlan(ref, datesLues), verse, aujourdhui);
  /* UNE VENUE EN PAUSE PREND LA PLACE DE LA PROCHAINE : tant que ce tiers n'est pas réglé, aucune autre venue ne passe devant lui. */
  let prochaineVue = false;
  const lignes: LigneDuPlan[] = etats.map((e) => {
    const rang = e.numero;
    let etat: EtatDuTiers;
    if (e.soldee) etat = 'regle';
    else if (e.dueIso < aujourdhui) { etat = 'en-pause'; prochaineVue = true; }
    else if (!prochaineVue) { etat = 'prochaine'; prochaineVue = true; } else etat = 'a-venir';
    return {
      rang, rdvId: parRang.get(rang)?.id ?? null, dateIso: e.dueIso, montantXof: e.amountXof,
      regleXof: e.regleXof, resteXof: e.resteXof, etat,
    };
  });
  return {
    lignes,
    resteXof: resteDeLEcheancier(etats),
    enPause: lignes.some((l) => l.etat === 'en-pause'),
    tiersDuJour: lignes.find((l) => l.resteXof > 0 && l.dateIso === aujourdhui) ?? null,
    prochaine: lignes.find((l) => l.etat === 'prochaine') ?? null,
  };
}

/** Le plan d'une cliente, lu depuis tous les rendez-vous : un plan à la fois, le plus récent non soldé d'abord. */
export function lisLesPlansDeLaCliente(rdvs: readonly RdvDuPlan[], clientId: string, aujourdhui: string): { planId: string; lecture: LectureDuPlan }[] {
  return plansDeLaCliente(rdvs, clientId)
    .map((planId) => ({ planId, lecture: lisLePlan(rdvsDuPlan(rdvs, planId), aujourdhui) }))
    .filter((p): p is { planId: string; lecture: LectureDuPlan } => p.lecture !== null)
    .sort((a, b) => (b.lecture.resteXof > 0 ? 1 : 0) - (a.lecture.resteXof > 0 ? 1 : 0)
      || (a.lecture.lignes[0]?.dateIso ?? '').localeCompare(b.lecture.lignes[0]?.dateIso ?? ''));
}

/** Des francs, lus à voix haute : « 45 000 F », l'espace ordinaire entre les milliers. */
export const francsDuTiers = (xof: number): string =>
  `${Math.round(xof).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** LA PHRASE DU BOUTON, à la caisse et sur la fiche : le tiers, jamais le total. */
export const phraseEncaisserLeTiers = (appel: string, montantXof: number, n: number = VENUES_DU_MOMENT): string =>
  `Encaisser ${ditLaPart(n)} de ${appel} : ${francsDuTiers(montantXof)}`;

/** LA PART D'UNE VENUE, DITE JUSTE : « le tiers » à trois venues, « le quart » à quatre, « la part » sinon.
    Ce que lit l'équipe et la cliente suit le nombre de venues du plan (7 novembre 2026). */
export const ditLaPart = (n: number): string => (n === 3 ? 'le tiers' : n === 4 ? 'le quart' : 'la part');

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 26 décembre 2026 » : la date avec son année, pour une cliente. */
export const jourDuTiers = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : '';
};

/** Les mots d'un état, pour la cliente et pour la fiche : jamais « retard ». */
export const motDeLEtat = (etat: EtatDuTiers): string =>
  etat === 'regle' ? 'Réglé' : etat === 'prochaine' ? 'À la prochaine venue' : etat === 'en-pause' ? 'En pause' : 'À venir';
