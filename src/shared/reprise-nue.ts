/* ══ UNE REPRISE NAÎT NUE — 2 octobre 2026 ═══════════════════════════════
   « Quand je finis un RDV, je l'honore, un nouveau RDV se crée avec le statut
   payé. Ça fausse tout. Tel est l'exemple de Vicentia, qui a deux RDV le
   3 novembre parce que j'ai passé deux paiements sur son compte aujourd'hui.
   La cliente reçoit deux messages WhatsApp » (Yéman).

   LA PANNE. La reprise posée à la clôture recopie le rituel d'avant
   (`{ ...appt }`) et n'en retirait qu'une partie : les versements et la pièce,
   pas `paidXof`. Or encaisser écrit `paidXof` PUIS honore, donc la reprise
   naissait avec la somme du rituel d'avant : « payé », comptée dans les
   revenus à venir, jamais réclamée. Même sort pour l'acompte vérifié, pour la
   remise accordée au comptoir, pour la Gamme emportée ce jour-là.

   LA RÈGLE : une reprise reprend les GESTES (prestations, mains, durée,
   longueur, heure) et le TARIF DE LA TÊTE (remise de famille), jamais ce qui
   appartenait à la VISITE (argent, remise du jour, produits, réponses de la
   cliente).

   Pur, éprouvé par `verifie-la-reprise-nue`. */

/** Ce qui appartenait à la visite d'avant, et ne passe jamais à la suivante. */
export const CHAMPS_DE_LA_VISITE = [
  'payments', 'paidXof', 'invoiceId', 'pointsAwarded',
  'depositXof', 'depositConfirmed', 'depositConfirmedAt', 'depositServiceIds',
  'discountXof', 'remisesLignes', 'gamme', 'forfait', 'priceXof', 'offertPar',
  'coveredBySub', 'coverKind', 'subId', 'foyerId', 'seriesId', 'seriesIndex', 'seriesTotal',
  'confirmeeParLaClienteLe', 'autreMomentDemandeLe', 'repriseProposeeLe', 'relanceFaite',
  'creeLe', 'note',
] as const;

/** Le rituel d'avant, débarrassé de sa visite. Rend une copie. */
export function sansLaVisite<T extends object>(appt: T): T {
  const copie = { ...appt } as Record<string, unknown>;
  for (const champ of CHAMPS_DE_LA_VISITE) delete copie[champ];
  return copie as T;
}

type RdvLu = {
  id: string; status?: string; repriseDe?: string; creeLe?: string;
  payments?: unknown[]; invoiceId?: string; paidXof?: number;
  depositXof?: number; depositConfirmed?: boolean; depositConfirmedAt?: string;
  discountXof?: number;
};

/** La remise du comptoir s'écrit au rendez-vous depuis le 1er octobre au soir
    (0b5b2797) : seule une reprise posée depuis a pu la recopier. Avant, une
    remise en francs recopiée était le geste voulu de la Maison. */
export const REMISE_DU_COMPTOIR_DEPUIS = '2026-10-01T21:00:00.000Z';

/** CE QU'IL FAUT RENDRE NU sur les reprises déjà posées. Une reprise qui n'a
    reçu AUCUN versement à elle (journal vide, pas de pièce) et qui porte une
    somme encaissée l'a recopiée : la reprise date du 3 septembre, le journal
    des versements du 17 août, tout vrai règlement y laisse une ligne. L'acompte
    et la remise ne se reprennent que s'ils sont ceux du rituel d'avant, à
    l'identique. Une reprise déjà honorée a sa propre vie : on n'y touche pas. */
export function reprisesARendreNues(rdvs: readonly RdvLu[]): Map<string, Record<string, undefined>> {
  const parId = new Map(rdvs.map((a) => [a.id, a]));
  const sortie = new Map<string, Record<string, undefined>>();
  for (const a of rdvs) {
    if (!a.repriseDe || a.status === 'honoré' || (a.payments?.length ?? 0) > 0 || a.invoiceId) continue;
    const avant = parId.get(a.repriseDe);
    const patch: Record<string, undefined> = {};
    if ((a.paidXof ?? 0) > 0) patch.paidXof = undefined;
    if (avant && a.depositConfirmed && (a.depositXof ?? 0) > 0 && a.depositXof === avant.depositXof
      && (a.depositConfirmedAt ?? '') === (avant.depositConfirmedAt ?? '')) {
      patch.depositXof = undefined;
      patch.depositConfirmed = undefined;
      patch.depositConfirmedAt = undefined;
    }
    if (avant && (a.discountXof ?? 0) > 0 && a.discountXof === avant.discountXof
      && (a.creeLe ?? '') >= REMISE_DU_COMPTOIR_DEPUIS) patch.discountXof = undefined;
    if (Object.keys(patch).length > 0) sortie.set(a.id, patch);
  }
  return sortie;
}
