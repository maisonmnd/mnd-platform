/* ══ LES CODES DU MOMENT — 23 octobre 2026 ══════════════════════════════
   « Je ne me retrouve pas facilement dans les QR. Comment faciliter
   l'utilisation, qu'elle soit smart et intelligente » (Yéman), puis « il faut
   avant le RDV son itinéraire » et « le client qui n'a pas encore l'appli
   devrait le lui proposer pour la télécharger ».

   Dix carrés noirs se ressemblent : l'œil ne les distingue pas. La page met
   donc devant la main le code dont le moment a besoin, lu dans l'agenda du
   jour, sans rien demander :
     · à la fin d'un rituel qui reste à régler, LE PAIEMENT ;
     · juste après le paiement d'une première venue, L'AVIS GOOGLE ;
     · le matin (dès 1 h 30 avant l'ouverture), tant que le code du jour
       n'est pas né, LE CODE DU JOUR ;
     · avant un rendez-vous, L'ITINÉRAIRE à lui envoyer (premières venues
       d'abord : elles ne connaissent pas encore la porte) ;
     · pendant un rituel ou juste après, MA COURONNE à installer, quand sa
       fiche n'a pas encore de compte ;
     · pendant un rituel, LE WIFI.
   Quatre propositions au plus. Rien de tout cela : les codes que ce poste
   montre le plus (`usage`), sinon le paiement et le wifi.

   Pur : ni magasin ni horloge. L'écran passe le jour, la minute et les
   rendez-vous déjà lus ; `verifie-les-codes-du-moment` le rejoue. */

export type IdDuCode = 'site' | 'carte' | 'plan' | 'wifi' | 'momo' | 'kkiapay' | 'avis' | 'couronne' | 'academie' | 'jour';

export type RdvDuMoment = {
  id: string;
  /** Le nom tel que l'écran le montre. */
  qui: string;
  maitre?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  dureeMin: number;
  status: string;
  /** Ce qui reste à régler, acompte vérifié déduit. */
  resteXof: number;
  /** De l'argent est entré aujourd'hui sur ce rendez-vous. */
  payeAujourdhui: boolean;
  /** Aucun rituel honoré avant aujourd'hui. */
  premiereVenue: boolean;
  /** Sa fiche a déjà un compte Ma Couronne. */
  aCouronne: boolean;
};

export type Suggestion =
  | { sorte: 'payer'; rdvId: string; qui: string; maitre?: string; resteXof: number }
  | { sorte: 'avis'; rdvId: string; qui: string }
  | { sorte: 'code-du-jour' }
  | { sorte: 'itineraire'; rdvId: string; qui: string; maitre?: string; heure: string; premiereVenue: boolean }
  | { sorte: 'couronne'; rdvId: string; qui: string }
  | { sorte: 'wifi'; rdvId: string; qui: string; maitre?: string }
  | { sorte: 'habitude'; code: IdDuCode };

/** Un rituel « finit » dans ses vingt dernières minutes : on prépare le paiement. */
export const FIN_PROCHE_MIN = 20;
/** Le paiement reste proposé deux heures après la fin prévue (un rituel déborde). */
export const PAYER_APRES_MIN = 120;
/** L'avis, dans l'heure et demie qui suit la fin. */
export const AVIS_APRES_MIN = 90;
/** L'itinéraire, dans les trois heures qui précèdent le rendez-vous. */
export const ITINERAIRE_AVANT_MIN = 180;
/** Ma Couronne, pendant le rituel et l'heure qui suit sa fin. */
export const COURONNE_APRES_MIN = 60;
/** Le code du jour, d'une heure et demie avant l'ouverture à deux heures après
    (la nuit, il n'a rien à faire en tête). */
export const CODE_DU_JOUR_AVANT_OUVERTURE_MIN = 90;
export const CODE_DU_JOUR_APRES_OUVERTURE_MIN = 120;
export const AU_PLUS = 4;
/** Sans moment ni habitude : le paiement et le wifi. */
export const PAR_DEFAUT: readonly IdDuCode[] = ['kkiapay', 'wifi'];

/** « 14:20 » → 860. Illisible : NaN, et le rendez-vous ne propose rien. */
export const minutesDe = (hhmm: string): number => {
  const m = /^(\d{1,2})[:h](\d{2})/.exec((hhmm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Aucun rituel honoré AVANT aujourd'hui : sa première venue. */
export const premiereVenueDe = (
  rdvs: readonly { clientId?: string; status: string; date: string }[],
  clientId: string | undefined,
  aujourdhui: string,
): boolean => !!clientId && !rdvs.some((a) => a.clientId === clientId && a.status === 'honoré' && a.date < aujourdhui);

/** Les codes rangés du plus montré au moins montré ; à égalité, l'ordre donné. */
export function ordreParUsage<T extends string>(ids: readonly T[], usage: Readonly<Record<string, number>>): T[] {
  return ids.map((id, i) => ({ id, i, n: usage[id] ?? 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.id);
}

export function codesDuMoment(o: {
  aujourdhui: string;
  /** Minutes depuis minuit, à l'heure de la Maison. */
  minutes: number;
  rdvs: readonly RdvDuMoment[];
  /** L'heure d'ouverture du jour, en minutes. */
  ouvertureMin: number;
  codeDuJourNe: boolean;
  /** Les codes prêts à être montrés : un avis sans lien ne se propose pas. */
  prets: ReadonlySet<IdDuCode>;
  usage: Readonly<Record<string, number>>;
}): Suggestion[] {
  const m = o.minutes;
  const duJour = o.rdvs
    .filter((a) => a.date === o.aujourdhui && a.status !== 'annulé')
    .map((a) => ({ a, debut: minutesDe(a.time), fin: minutesDe(a.time) + Math.max(0, a.dureeMin || 0) }))
    .filter((x) => Number.isFinite(x.debut));

  const payer: Suggestion[] = (o.prets.has('kkiapay') || o.prets.has('momo'))
    ? duJour
      .filter(({ a, debut, fin }) => a.resteXof > 0 && debut <= m && m >= fin - FIN_PROCHE_MIN && m <= fin + PAYER_APRES_MIN)
      .sort((x, y) => x.fin - y.fin)
      .map(({ a }) => ({ sorte: 'payer', rdvId: a.id, qui: a.qui, ...(a.maitre ? { maitre: a.maitre } : {}), resteXof: a.resteXof }))
    : [];

  const avis: Suggestion[] = o.prets.has('avis')
    ? duJour
      .filter(({ a, fin }) => a.premiereVenue && a.resteXof <= 0 && a.payeAujourdhui && m >= fin - FIN_PROCHE_MIN && m <= fin + AVIS_APRES_MIN)
      .sort((x, y) => y.fin - x.fin)
      .slice(0, 1)
      .map(({ a }) => ({ sorte: 'avis', rdvId: a.id, qui: a.qui }))
    : [];

  const codeDuJour: Suggestion[] = !o.codeDuJourNe
    && m >= o.ouvertureMin - CODE_DU_JOUR_AVANT_OUVERTURE_MIN && m <= o.ouvertureMin + CODE_DU_JOUR_APRES_OUVERTURE_MIN
    ? [{ sorte: 'code-du-jour' }] : [];

  const itineraire: Suggestion[] = o.prets.has('plan')
    ? duJour
      .filter(({ a, debut }) => a.status !== 'honoré' && debut > m && debut - m <= ITINERAIRE_AVANT_MIN)
      .sort((x, y) => Number(y.a.premiereVenue) - Number(x.a.premiereVenue) || x.debut - y.debut)
      .map(({ a }) => ({ sorte: 'itineraire', rdvId: a.id, qui: a.qui, ...(a.maitre ? { maitre: a.maitre } : {}), heure: a.time, premiereVenue: a.premiereVenue }))
    : [];

  const couronne: Suggestion[] = o.prets.has('couronne')
    ? duJour
      .filter(({ a, debut, fin }) => !a.aCouronne && debut <= m && m <= fin + COURONNE_APRES_MIN)
      .sort((x, y) => x.debut - y.debut)
      .slice(0, 1)
      .map(({ a }) => ({ sorte: 'couronne', rdvId: a.id, qui: a.qui }))
    : [];

  const wifi: Suggestion[] = o.prets.has('wifi')
    ? duJour
      .filter(({ debut, fin }) => debut <= m && m < fin - FIN_PROCHE_MIN)
      .slice(0, 1)
      .map(({ a }) => ({ sorte: 'wifi', rdvId: a.id, qui: a.qui, ...(a.maitre ? { maitre: a.maitre } : {}) }))
    : [];

  const moment = [...payer, ...avis, ...codeDuJour, ...itineraire, ...couronne, ...wifi].slice(0, AU_PLUS);
  if (moment.length > 0) return moment;

  const habitudes = ordreParUsage(Object.keys(o.usage).filter((k) => (o.usage[k] ?? 0) > 0) as IdDuCode[], o.usage)
    .filter((c) => o.prets.has(c));
  const repli = habitudes.length > 0 ? habitudes : PAR_DEFAUT.filter((c) => o.prets.has(c));
  return repli.slice(0, 2).map((code) => ({ sorte: 'habitude', code }));
}
