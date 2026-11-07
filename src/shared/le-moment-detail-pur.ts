/* ══ CE QUE COMPREND LE MOMENT, VENUE PAR VENUE, PUR — 7 novembre 2026 ═════════
   « Quand je prends Le Moment, je dois voir lesquels des services je consomme
   à chaque séance. Je veux le détail de tous les services inclus dans cette
   prestation » (Yéman).

   LE DÉTAIL VIENT DE `includes` DU SERVICE, EN BASE, DANS SON ORDRE, jamais
   d'une liste écrite ici : changer la composition au Catalogue change ce qu'on
   lit partout (comptoir, fiche, caisse, Ma Couronne). Les offerts (VÍVÍVÓ™, la
   sortie) sont marqués. Un service retiré du catalogue se DIT (« Un service
   retiré du catalogue ») sans casser l'écran ni disparaître de la liste. Le nom
   est celui du catalogue, jamais un code interne.

   Ce fichier n'importe rien : il lit un sous-ensemble de `Service` et sert le
   Trône, Ma Couronne et le banc. */

/** Le service tel que le détail le lit (sous-ensemble de `Service`). */
export type ServiceLu = {
  id: string; name: string; durationMin?: number; priceXof?: number;
  includes?: { serviceId?: string; categoryId?: string; productId?: string; offert?: boolean; afterWeeks?: number; venue?: number }[];
};

export type LigneDuDetail = {
  serviceId: string;
  /** Le nom complet du catalogue ; jamais un identifiant. */
  nom: string;
  offert: boolean;
  dureeMin?: number;
  /** La valeur de carte, quand on la connaît (zéro ou inconnue : absente). */
  valeurXof?: number;
  /** Dans combien de semaines après la première venue, quand le catalogue le dit. */
  apresSemaines?: number;
  /** Le service n'est plus au catalogue : la ligne le dit, elle ne casse rien. */
  retire: boolean;
  /** La venue du plan qui consomme la ligne, quand le catalogue la répartit (`includes[].venue`). */
  venue?: number;
};

export type DetailDuService = {
  lignes: LigneDuDetail[];
  /** Ce que le Moment offre, à la valeur de carte (les lignes offertes dont la valeur est connue). */
  valeurOfferteXof: number;
  /** La valeur de carte de tout ce qui est compté (hors offerts). */
  valeurCarteXof: number;
};

export const SERVICE_RETIRE_DIT = 'Un service retiré du catalogue';

type Catalogue = ReadonlyMap<string, ServiceLu> | readonly ServiceLu[];
const trouve = (catalogue: Catalogue, id: string): ServiceLu | undefined =>
  (Array.isArray(catalogue)
    ? (catalogue as readonly ServiceLu[]).find((s) => s.id === id)
    : (catalogue as ReadonlyMap<string, ServiceLu>).get(id));

type Options = {
  /** La valeur de carte d'un service, au prix de cette tête quand l'écran le sait ; absent : le prix d'annonce. */
  prixDe?: (s: ServiceLu) => number | undefined;
  nomDeLAtelier?: (id: string) => string | undefined;
  nomDuProduit?: (id: string) => string | undefined;
};

/** LE DÉTAIL D'UN SERVICE À `includes` : toutes ses lignes, dans l'ordre du catalogue. Avec `rang`, seulement celles
    que cette venue du plan consomme : quand le catalogue répartit les lignes par venue (`venue`), les lignes de ce
    rang (sans marque : la première venue) ; sinon, toutes (le Moment au complet, ou une venue d'entretien). */
export function detailDuService(service: ServiceLu | null | undefined, catalogue: Catalogue, o: Options = {}, rang?: number): DetailDuService {
  const inclus = service?.includes ?? [];
  const reparti = inclus.some((i) => typeof i.venue === 'number');
  const choisis = rang !== undefined && reparti ? inclus.filter((i) => (i.venue ?? 1) === rang) : inclus;
  const lignes: LigneDuDetail[] = choisis.map((i) => {
    const offert = i.offert === true;
    const apres = {
      ...(typeof i.afterWeeks === 'number' && i.afterWeeks > 0 ? { apresSemaines: i.afterWeeks } : {}),
      ...(typeof i.venue === 'number' ? { venue: i.venue } : {}),
    };
    if (i.serviceId) {
      const s = trouve(catalogue, i.serviceId);
      if (!s) return { serviceId: i.serviceId, nom: SERVICE_RETIRE_DIT, offert, retire: true, ...apres };
      const valeur = o.prixDe ? o.prixDe(s) : s.priceXof;
      return {
        serviceId: s.id, nom: s.name, offert, retire: false, ...apres,
        ...(typeof s.durationMin === 'number' && s.durationMin > 0 ? { dureeMin: Math.round(s.durationMin) } : {}),
        ...(typeof valeur === 'number' && valeur > 0 ? { valeurXof: Math.round(valeur) } : {}),
      };
    }
    if (i.productId) return { serviceId: i.productId, nom: o.nomDuProduit?.(i.productId) ?? 'Un produit de la Gamme', offert, retire: false, ...apres };
    return { serviceId: i.categoryId ?? '', nom: (i.categoryId && o.nomDeLAtelier?.(i.categoryId)) || 'Un geste de la Maison', offert, retire: false, ...apres };
  });
  return {
    lignes,
    valeurOfferteXof: lignes.reduce((s, l) => s + (l.offert ? l.valeurXof ?? 0 : 0), 0),
    valeurCarteXof: lignes.reduce((s, l) => s + (l.offert ? 0 : l.valeurXof ?? 0), 0),
  };
}

/** LE DÉTAIL DE CHAQUE VENUE D'UN PLAN : ce que le rendez-vous de la venue pose réellement (son service). Pour le
    Moment cuir chevelu, chaque venue EST le Moment (mêmes services) ; pour le Moment Signature, la venue 1 est le
    Moment complet et les suivantes la venue d'entretien posée. Un rendez-vous sans service lu donne un détail vide. */
export function detailParVenue(serviceIdsDesVenues: readonly (string | undefined)[], catalogue: Catalogue, o: Options = {}): DetailDuService[] {
  return serviceIdsDesVenues.map((id, i) => detailDuService(id ? trouve(catalogue, id) : undefined, catalogue, o, i + 1));
}

/** La durée d'une ligne, dite : « 2 h 30 », « 45 min ». */
export const dureeDite = (min: number): string => {
  const m = Math.round(min);
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`;
};

/** « à 8 semaines », pour une ligne posée plus tard. */
export const apresSemainesDit = (n: number): string => `à ${n} semaines`;
