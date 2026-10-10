/* ══ LA RETOUCHE COMPRISE, POSÉE D'OFFICE — 10 octobre 2026 ══════════════
   La genèse des prix, correction 2 (décidée au sélecteur) : « une Retouche
   comprise dans toute création, posée d'office dans l'agenda à trois ou
   quatre semaines ; les suivantes au calibre ».

   CE QUI SE PASSAIT. À la clôture d'une création, la reprise recopiait les
   prestations du rituel : honorer une création réservait… une deuxième
   création, au rythme de la tête (une KÒKÒ™ puis la création suffisent à
   lire une cadence). Désormais :
   - après une CRÉATION (l'atelier VÈKPÈ™, ou VÈKPÈ™ Kids), la suite est LA
     RETOUCHE à quatre semaines, offerte (une remise de ligne à 100 % : elle
     tient même si l'on rouvre le rendez-vous), sans attendre de rythme ;
   - après cette Retouche comprise, la suite est la première VENUE, à la
     sixième semaine de la couronne (GBÈJÍ™ Essentiel, ou SÍNSIN™ Kids) ;
   - la Nano et la Pico (Pico et Galaxy) promettent « 1 SÍNSIN™ Essentiel
     offert à 6 semaines » : la Retouche porte la promesse (`sinsinOffert`),
     et la venue se pose ligne à ligne, le SÍNSIN™ offert (remise de ligne à
     100 %), le reste au prix de la carte, la sortie offerte comme dans la
     venue. La Mini le promet encore aujourd'hui et le perd au 1er janvier
     2027 (maquette validée : « Nano, Pico et Galaxy ») : une Mini créée
     avant garde sa promesse.

   Pur : aucun magasin, aucun réseau. */

export const CREATION_KIDS = 'sv-kids-vekpe';
export const RETOUCHE_ADULTE = 'sv-retouches-post-reprise';
export const RETOUCHE_KIDS = 'sv-kids-retouche';
export const VENUE_ADULTE = 'sv-venue-gbeji-ess';
export const VENUE_KIDS = 'sv-kids-sinsin';
export const SINSIN_ESSENTIEL = 'sv-atl-ii-e';
/** Les créations dont la carte promet « 1 SÍNSIN™ Essentiel offert à 6 semaines ». */
export const CREATIONS_AU_SINSIN_OFFERT: readonly string[] = ['sv-atl-i-nan', 'sv-atl-i-pic'];
export const CREATION_MINI = 'sv-atl-i-min';
/** La Mini promet son SÍNSIN™ pour une création faite avant ce jour. */
export const MINI_SANS_SINSIN_DES = '2027-01-01';
/** Cette création, à cette date, promet-elle le SÍNSIN™ à 6 semaines ? */
export const prometLeSinsin = (serviceId: string, date?: string): boolean =>
  CREATIONS_AU_SINSIN_OFFERT.includes(serviceId)
  || (serviceId === CREATION_MINI && (date ?? '').slice(0, 10) < MINI_SANS_SINSIN_DES);
/** La Retouche comprise tombe à quatre semaines ; la venue, deux semaines après. */
export const SEMAINES_DE_LA_RETOUCHE = 4;
export const SEMAINES_JUSQU_A_LA_VENUE = 2;

type Fiche = { id: string; durationMin?: number; archived?: boolean; includes?: readonly { serviceId: string; offert?: boolean }[] };

export type SuiteImposee = {
  serviceIds: string[];
  dureeMin?: number;
  semaines: number;
  remisesLignes?: ({ pct: number } | null)[];
  retoucheComprise?: true;
  sinsinOffert?: true;
  note: string;
};

/** LA SUITE QU'IMPOSE CE RITUEL, ou `null` si la reprise ordinaire s'applique.
    `estCreation` reconnaît une prestation de l'atelier VÈKPÈ™
    (`fondeLaCouronne`). Une prestation absente ou archivée du catalogue ne
    s'impose pas : la reprise ordinaire reprend la main. */
export function suiteImposee(
  rituel: { serviceIds: readonly string[]; date?: string; retoucheComprise?: boolean; sinsinOffert?: boolean },
  estCreation: (serviceId: string) => boolean,
  catalogue: readonly Fiche[],
): SuiteImposee | null {
  const vivante = (id: string) => catalogue.find((s) => s.id === id && s.archived !== true);
  const kids = rituel.serviceIds.includes(CREATION_KIDS) || rituel.serviceIds.includes(RETOUCHE_KIDS);
  if (rituel.retoucheComprise) {
    const venue = vivante(kids ? VENUE_KIDS : VENUE_ADULTE);
    if (!venue) return null;
    /* Le SÍNSIN™ promis : la venue ligne à ligne, chaque ligne vivante, sinon
       la venue entière et la promesse dite dans la note. */
    if (rituel.sinsinOffert && !kids) {
      const lignes = (venue.includes ?? []).map((i) => i.serviceId);
      if (lignes.includes(SINSIN_ESSENTIEL) && lignes.every((id) => vivante(id))) {
        return {
          serviceIds: lignes, dureeMin: venue.durationMin, semaines: SEMAINES_JUSQU_A_LA_VENUE,
          remisesLignes: (venue.includes ?? []).map((i) => (i.offert || i.serviceId === SINSIN_ESSENTIEL ? { pct: 100 } : null)),
          note: 'La première venue, à la sixième semaine de la couronne, le SÍNSIN™ Essentiel offert comme promis à la création',
        };
      }
      return {
        serviceIds: [venue.id], dureeMin: venue.durationMin, semaines: SEMAINES_JUSQU_A_LA_VENUE,
        note: 'La première venue, à la sixième semaine. Le SÍNSIN™ Essentiel promis à la création est offert : à déduire',
      };
    }
    return {
      serviceIds: [venue.id], dureeMin: venue.durationMin, semaines: SEMAINES_JUSQU_A_LA_VENUE,
      note: 'La première venue, à la sixième semaine de la couronne',
    };
  }
  const creation = rituel.serviceIds.includes(CREATION_KIDS) || rituel.serviceIds.some(estCreation);
  if (!creation) return null;
  const retouche = vivante(kids ? RETOUCHE_KIDS : RETOUCHE_ADULTE);
  if (!retouche) return null;
  const promis = !kids && rituel.serviceIds.some((id) => prometLeSinsin(id, rituel.date));
  return {
    serviceIds: [retouche.id], dureeMin: retouche.durationMin, semaines: SEMAINES_DE_LA_RETOUCHE,
    remisesLignes: [{ pct: 100 }], retoucheComprise: true, ...(promis ? { sinsinOffert: true as const } : {}),
    note: 'La Retouche comprise dans la création, posée d’office à quatre semaines',
  };
}
