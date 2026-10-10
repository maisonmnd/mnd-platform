/* ══ ENSEMBLE, LE MÊME JOUR — 10 octobre 2026 (la genèse des prix, lot 3) ══
   Décision de Yéman au sélecteur : quand on vient ensemble, la Maison offre
   UN GESTE, pas un pourcentage (les deux −15 % du 23 septembre portaient sur
   le cœur) :
   - PARENT ET ENFANT : le KLƆKLƆ™ Kids de l'enfant offert avec la venue du
     parent ;
   - VENEZ À DEUX : deux têtes adultes au même créneau, le lavage de la
     seconde offert, en saison seulement (février, juillet et août, du mardi
     au jeudi : jamais le samedi, la Maison y vend des places).
   UNE FAVEUR À LA FOIS : la tête qui reçoit un geste ne prend pas en plus la
   remise famille sur ce rendez-vous.

   Pur : aucun magasin, aucun réseau. */

export const KLOKLO_KIDS = 'sv-kids-kloklo';
export const LAVAGES_ADULTES: readonly string[] = ['sv-plt-05-ess-c', 'sv-plt-05-sig-c', 'sv-plt-05-pre-c'];

/** La saison de Venez à deux : février, juillet, août, du mardi au jeudi. */
export function saisonDeVenezADeux(dateIso: string): boolean {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const mois = d.getMonth() + 1;
  const jour = d.getDay(); // 0 dimanche … 6 samedi
  return (mois === 2 || mois === 7 || mois === 8) && jour >= 2 && jour <= 4;
}

export type TeteEnsemble = { id: string; mineur: boolean; serviceIds: readonly string[] };
export type Geste = { index: number; serviceId: string; pourquoi: 'parent-et-enfant' | 'venez-a-deux' };

/** LES GESTES DU FOYER sur ce créneau, tête par tête (dans l'ordre donné). */
export function gestesEnsemble(tetes: readonly TeteEnsemble[], dateIso: string): Record<string, Geste[]> {
  const out: Record<string, Geste[]> = {};
  const adultes = tetes.filter((t) => !t.mineur);
  if (adultes.length >= 1) {
    for (const t of tetes.filter((x) => x.mineur)) {
      const i = t.serviceIds.indexOf(KLOKLO_KIDS);
      if (i >= 0) out[t.id] = [{ index: i, serviceId: KLOKLO_KIDS, pourquoi: 'parent-et-enfant' }];
    }
  }
  if (adultes.length >= 2 && saisonDeVenezADeux(dateIso)) {
    const seconde = adultes[1];
    const i = seconde.serviceIds.findIndex((id) => LAVAGES_ADULTES.includes(id));
    if (i >= 0) out[seconde.id] = [{ index: i, serviceId: seconde.serviceIds[i], pourquoi: 'venez-a-deux' }];
  }
  return out;
}

/** Les remises par ligne d'un rendez-vous (tableau parallèle aux prestations),
    ou `undefined` sans geste. */
export function remisesDesGestes(serviceIds: readonly string[], gestes: readonly Geste[] | undefined): ({ pct: number } | null)[] | undefined {
  if (!gestes || gestes.length === 0) return undefined;
  return serviceIds.map((_, i) => (gestes.some((g) => g.index === i) ? { pct: 100 } : null));
}

export const libelleDuGeste = (g: Geste): string =>
  g.pourquoi === 'parent-et-enfant' ? 'Parent et enfant : le KLƆKLƆ™ Kids offert' : 'Venez à deux : le second lavage offert';
