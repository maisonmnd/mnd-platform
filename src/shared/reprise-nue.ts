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
  'creeLe', 'note', 'repriseRetiree',
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

/* ══ UNE REPRISE NE REVIENT PAS TOUTE SEULE — 2 octobre 2026 ═══════════════
   « Ce RDV de Shegun du 30 octobre ne fait que revenir. Je supprime, il
   revient tout seul » ; « même chose pour Nathael, un RDV se crée tout seul
   pour demain 3 octobre » (Yéman).

   LA PANNE. La reprise se tente à CHAQUE sauvegarde d'un rituel honoré et à
   chaque encaissement (c'est voulu : un chemin qui l'oubliait la perdait en
   silence). Son seul verrou était la reprise ELLE-MÊME (`repriseDe`) : effacée,
   le verrou disparaissait avec elle, et la sauvegarde suivante la reposait.
   Et un rituel ANCIEN, ressaisi ou corrigé des semaines après, posait sa
   reprise depuis sa propre date : cinq semaines plus tôt, rythme de quatre,
   elle tombait demain, avec sa confirmation WhatsApp.

   TROIS GARDES DE PLUS :
   · une reprise effacée à la main laisse une marque sur son rituel
     (`repriseRetiree`) : elle ne revient plus ;
   · seul le DERNIER rituel d'une tête pose sa reprise : un rituel plus récent
     a déjà dit quand elle revient ;
   · la reprise se pose à la CLÔTURE : un rituel de plus de quatorze jours ne
     pose plus rien, sa reprise se prend à la main. */
export const CLOTURE_JOURS = 14;

type RdvGarde = { id: string; clientId?: string; date: string; status?: string; repriseDe?: string; repriseRetiree?: boolean };

const joursAvant = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Pourquoi CE rituel ne pose pas de reprise aujourd'hui, ou `null`. */
export function pourquoiPasDeRepriseIci(appt: RdvGarde, tous: readonly RdvGarde[], aujourdhui: string): string | null {
  const jour = aujourdhui.slice(0, 10);
  if (appt.repriseRetiree) return 'sa reprise a été retirée à la main';
  if (tous.some((a) => a.repriseDe === appt.id)) return 'sa reprise est déjà posée';
  const plusRecent = tous.find((a) => a.clientId === appt.clientId && a.id !== appt.id
    && a.status !== 'annulé' && a.date > appt.date && a.date <= jour);
  if (plusRecent) return `un rituel plus récent existe (${plusRecent.date})`;
  if (appt.date < joursAvant(jour, CLOTURE_JOURS)) return `rituel de plus de ${CLOTURE_JOURS} jours : sa reprise se prend à la main`;
  return null;
}

/* ══ UN RITUEL, UN SEUL PROCHAIN RENDEZ-VOUS — 4 octobre 2026 ═════════════
   « Quand je paie un RDV ça pose la date qui suit. Quand je repasse un
   paiement ou que je supprime un paiement pour le modifier, ça repose un RDV.
   Le RDV de Nadège K. d'hier a généré plusieurs RDV dans le futur » (Yéman).

   LA PANNE. L'écran d'encaissement a son propre « Reprogrammer le prochain
   rendez-vous », à côté de la reprise de la clôture. Il créait son rendez-vous
   SANS AUCUNE GARDE et sans le relier au rituel (`repriseDe` absent) : chaque
   encaissement repassé en ajoutait un, et la reprise de la clôture ne pouvait
   pas le reconnaître comme le sien.

   LA RÈGLE, POUR LES DEUX CHEMINS : avant de poser, on cherche le prochain
   déjà posé — la suite de CE rituel, ou n'importe quel rendez-vous à venir de
   la tête. S'il existe, rien ne se crée, et l'écran le dit. */
type RdvProchain = { id: string; clientId?: string; date: string; status?: string; repriseDe?: string };

/** Le prochain rendez-vous déjà posé pour ce rituel ou cette tête, ou `null`. */
export function prochainDejaPose<T extends RdvProchain>(appt: RdvProchain, tous: readonly T[], aujourdhui: string): T | null {
  const jour = aujourdhui.slice(0, 10);
  const suite = tous.find((a) => a.repriseDe === appt.id && a.status !== 'annulé');
  if (suite) return suite;
  if (!appt.clientId) return null;
  return tous
    .filter((a) => a.clientId === appt.clientId && a.id !== appt.id
      && a.status !== 'annulé' && a.status !== 'honoré' && a.date >= jour)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** LA MARQUE LAISSÉE PAR UNE REPRISE EFFACÉE À LA MAIN : le rituel dont elle
    venait, à marquer `repriseRetiree`, ou `null` si ce n'était pas une reprise. */
export const rituelDeLaRepriseEffacee = (efface: { repriseDe?: string }): string | null => efface.repriseDe ?? null;
