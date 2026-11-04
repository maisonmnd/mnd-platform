import {
  codeNormalise, estAPlaces, offreDuJourDeLaVenue, type OffreCodee, type VenueAJuger,
} from '../../shared/offres-pur';

/* LES PLACES LIMITÉES, VUES DU SITE — 4 novembre 2026.

   La décision de Yéman (maquette « Places limitées », « construis ») : −15 %
   sur les shampoings, lavages et soins, du mardi au vendredi, un jour vide,
   trois places par jour décomptées, une seule remise. La règle vit dans
   `offres-pur` (`placesRestantes`, `offreDuJourDeLaVenue`) et en base
   (`places_de_la_remise`, 0154). Le site ne voit pas l'agenda des autres :
   il lit les places DÉJÀ COMPTÉES par la base et les passe à la règle
   (`placesConnues`). Ce module est pur : ni React, ni réseau ; le banc
   `verifie-les-places-au-site` l'éprouve.

   JAMAIS DE REMISE SUR UN JOUR QU'ON N'A PAS COMPTÉ : une lecture en panne
   rend une carte vide, et une carte vide ne remise aucun jour. */

/** Les places lues, jour par jour puis offre par offre. */
export type CarteDesRemises = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** LA CARTE, depuis la réponse de `places_de_la_remise` (jour, offre, places).
    Une ligne qui ne se lit pas est laissée : elle ne vaut ni zéro ni trois. */
export function carteDesRemises(data: unknown): CarteDesRemises {
  if (!Array.isArray(data)) return {};
  const carte: Record<string, Record<string, number>> = {};
  for (const l of data as { jour?: unknown; offre?: unknown; places?: unknown }[]) {
    const jour = String(l?.jour ?? '').slice(0, 10);
    const offre = String(l?.offre ?? '');
    const n = Number(l?.places);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !offre || !Number.isInteger(n) || n < 0) continue;
    (carte[jour] ??= {})[offre] = n;
  }
  return carte;
}

/** Les places de cette offre ce jour-là, telles que la base les a dites ;
    `null` quand elle n'a rien dit (jour non concerné, ou rien de lu). */
export function placesConnuesDe(carte: CarteDesRemises, offreId: string | undefined, jour: string | null | undefined): number | null {
  if (!offreId || !jour) return null;
  const n = carte[String(jour).slice(0, 10)]?.[offreId];
  return typeof n === 'number' ? n : null;
}

/** L'OFFRE DU JOUR DE LA VENUE, VUE DU SITE : la règle d'`offreDuJourDeLaVenue`,
    offre par offre, chaque offre à places recevant SES places du jour. À
    plusieurs, la plus forte remise, comme l'original. */
export function offreDuJourDuSite<T extends OffreCodee & { branchId?: string }>(
  offres: readonly T[],
  carte: CarteDesRemises,
  v: VenueAJuger,
): T | null {
  let mieux: T | null = null;
  for (const o of offres) {
    const r = estAPlaces(o)
      ? offreDuJourDeLaVenue([o], { ...v, placesConnues: placesConnuesDe(carte, o.id, v.dateIso) })
      : offreDuJourDeLaVenue([o], v);
    if (r && (!mieux || (r.discountPct ?? 0) > (mieux.discountPct ?? 0))) mieux = r;
  }
  return mieux;
}

/** CE CODE EST-IL CELUI D'UNE OFFRE À PLACES ? Il ne se tape plus : la remise
    se pose d'elle-même avec la place. Tapé, ou venu d'un ancien lien, il ne
    vaut pas un code d'offre. */
export function estUnCodeDesPlaces(offres: readonly OffreCodee[], code: unknown): boolean {
  const c = codeNormalise(code);
  return !!c && offres.some((o) => estAPlaces(o) && codeNormalise(o.code) === c);
}

/** L'OFFRE À PLACES QUI A AU MOINS UN JOUR OUVERT, pour le bandeau de la
    réservation : allumée, de cette maison (ou sans maison), une place au
    moins sur un jour lu. Rien quand tous les jours sont pris. */
export function offreDesPlacesOuverte<T extends OffreCodee & { branchId?: string }>(
  offres: readonly T[],
  carte: CarteDesRemises,
  branchId?: string,
): T | null {
  for (const o of offres) {
    if (!o?.active || !estAPlaces(o) || !o.id) continue;
    if (o.branchId && branchId && o.branchId !== branchId) continue;
    if (Object.values(carte).some((parOffre) => (parOffre[o.id as string] ?? 0) > 0)) return o;
  }
  return null;
}

/** « −15 % », ou rien : jamais « −0 % » pour une offre qui ne dit pas son taux. */
const pctDit = (o: { discountPct?: number } | null | undefined): string => {
  const p = Math.round(o?.discountPct ?? 0);
  return p > 0 ? `−${p} %` : '';
};

/** Le bandeau, quand au moins un jour a des places. */
export const bandeauDesPlaces = (o: { discountPct?: number }): string =>
  `${pctDit(o) || 'Remise'} sur les shampoings, lavages et soins · Places limitées`;

/** Le nombre de places sur la pastille d'un jour : des chiffres. */
export const placesDites = (n: number): string => (n === 1 ? '1 place' : `${n} places`);

/** La dernière place est partie entre l'affichage et l'envoi (`places_limitees`). */
export const phraseDeLaPlacePartie = (o: { discountPct?: number } | null | undefined): string =>
  (pctDit(o) ? `La dernière place à ${pctDit(o)} vient de partir.` : 'La dernière place vient de partir.');

/** Le bouton qui suit : confirmer, sans remise, au tarif de la Maison. */
export const BOUTON_DU_TARIF_DE_LA_MAISON = 'Confirmer au tarif de la Maison';

/** Ses prix convenus sont connus avant la confirmation (son lien de retour). */
export const PHRASE_DES_TARIFS_CONVENUS = 'Vos tarifs convenus s’appliquent.';

/** Le serveur n'a pas pu relire ce que porte son numéro : dans le doute, pas
    de remise (4 novembre 2026). La page le dit, sans prix à sa place. */
export const PHRASE_DU_DOUTE = 'La remise des places limitées n’a pas pu être vérifiée : votre rendez-vous est tenu, la Maison vous confirme le tarif.';

/** Ce que le serveur a tranché quand la place n'a pas été prise : une seule
    remise, la sienne, ou le doute. Vide pour une raison inconnue. */
export function phraseDUneSeuleRemise(r: unknown): string {
  if (r === 'prix-convenus') return PHRASE_DES_TARIFS_CONVENUS;
  if (r === 'abonnee') return 'Votre abonnement s’applique : une seule remise à la fois.';
  if (r === 'famille') return 'Votre remise famille s’applique : une seule remise à la fois.';
  if (r === 'illisible') return PHRASE_DU_DOUTE;
  return '';
}

/** La confirmation, quand la place limitée est tenue. */
export const phraseDeLaPlaceTenue = (o: { discountPct?: number } | null | undefined): string =>
  (pctDit(o)
    ? `${pctDit(o)} sur vos shampoings, lavages et soins : votre place limitée est tenue.`
    : 'Votre place limitée est tenue : la remise est posée sur vos shampoings, lavages et soins.');

/** La réponse du lien de retour dit-elle des prix convenus ? */
export const prixConvenusDuRetour = (r: unknown): boolean => {
  const x = r as { ok?: unknown; prixConvenus?: unknown } | null | undefined;
  return x?.ok === true && x.prixConvenus === true;
};
