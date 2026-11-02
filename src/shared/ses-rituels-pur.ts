/* ══ SES RITUELS, PAS SEULEMENT LE DERNIER — 2 novembre 2026 ══════════
   P. A., dans Ma Couronne : « je n'arrive pas à réserver sur le prochain mois
   pour mes soins […] je n'arrive pas à identifier ma routine ». Sa routine
   alterne deux rituels : un lavage toutes les deux ou trois semaines, et tous
   les deux mois le rituel complet (lavage, soin, reprise, sublimation).
   L'écran de réservation ne lui offrait que « Comme la dernière fois », et
   pour une raison de plus il ne montrait que le lavage :

   · la dernière venue ne se lisait que parmi les rituels « honorés » ; un
     rituel passé resté « confirmé » au Trône n'existait pas pour elle ;
   · UN SEUL GESTE ARCHIVÉ EFFAÇAIT TOUT LE RITUEL. Son soin AQUA LOCKS RITUAL™
     est fermé à la vente ; le rituel entier disparaissait de l'écran, et elle
     ne retrouvait plus rien qui ressemble à sa routine.

   La règle, pure, que lit Ma Couronne : ses derniers rituels DIFFÉRENTS, du
   plus récent au plus ancien ; un rituel passé compte s'il est honoré, ou
   resté confirmé ; un geste fermé se lit sous son SUCCESSEUR quand la Maison
   en a nommé un, sinon le rituel ne se propose pas (on ne retire jamais un
   geste en silence, le prix mentirait) ; une création (un acte d'une fois)
   n'est pas une routine. */

export type VenuePourSesRituels = {
  clientId?: string;
  date: string;
  time?: string;
  status: string;
  serviceIds: readonly string[];
};
export type SonRituel = { ids: string[]; date: string };

/** Les rituels que la Maison propose d'un toucher : trois au plus. */
export const RITUELS_PROPOSES = 3;

/** Un rituel passé : honoré, ou resté confirmé au Trône alors que son jour est passé. */
export const estUneVenuePassee = (a: Pick<VenuePourSesRituels, 'date' | 'status'>, aujourdhui: string): boolean =>
  a.status === 'honoré' || (a.status === 'confirmé' && a.date.slice(0, 10) < aujourdhui);

const cle = (ids: readonly string[]) => [...ids].sort().join('|');

/** SA LONGUEUR, CONNUE DE LA MAISON — 2 novembre 2026. Le RDV de P. A. pris
    dans Ma Couronne pour le 3 novembre 2026 est parti sans longueur : 8 000 F
    et 15 minutes, quand ses lavages au Trône se posaient en mi-long, 10 000 F
    et 30 minutes. Sa fiche ne porte pas de longueur (16 fiches sur 308 en ont
    une), mais chaque rituel du Trône fige la sienne. Quand la fiche se tait,
    la longueur de sa dernière venue est le point de départ ; le comptoir
    corrige à l'arrivée si elle a poussé, comme pour la fiche. */
export function longueurDeSaDerniereVenue<L extends string>(
  rdvs: readonly (VenuePourSesRituels & { longueur?: L })[], clientId: string, aujourdhui: string,
): L | undefined {
  const d = rdvs
    .filter((a) => a.clientId === clientId && !!a.longueur && estUneVenuePassee(a, aujourdhui))
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))[0];
  return d?.longueur;
}

export function sesRituelsPasses(o: {
  rdvs: readonly VenuePourSesRituels[];
  clientId: string;
  aujourdhui: string;
  /** La prestation est-elle à sa portée, aujourd'hui, en ligne ? */
  proposable: (serviceId: string) => boolean;
  /** Le successeur nommé d'une prestation fermée, s'il y en a un. */
  successeur?: (serviceId: string) => string | undefined;
  estCreation?: (serviceId: string) => boolean;
  max?: number;
}): SonRituel[] {
  const max = o.max ?? RITUELS_PROPOSES;
  const passees = o.rdvs
    .filter((a) => a.clientId === o.clientId && a.serviceIds.length > 0 && estUneVenuePassee(a, o.aujourdhui))
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`));
  const vus = new Set<string>();
  const rituels: SonRituel[] = [];
  for (const a of passees) {
    if (rituels.length >= max) break;
    if (o.estCreation && a.serviceIds.some(o.estCreation)) continue;
    const ids: string[] = [];
    let complet = true;
    for (const id of new Set(a.serviceIds)) {
      if (o.proposable(id)) { ids.push(id); continue; }
      const neuf = o.successeur?.(id);
      if (neuf && o.proposable(neuf)) { ids.push(neuf); continue; }
      complet = false;
      break;
    }
    if (!complet) continue;
    const k = cle(ids);
    if (vus.has(k)) continue;
    vus.add(k);
    rituels.push({ ids: [...new Set(ids)], date: a.date.slice(0, 10) });
  }
  return rituels;
}
