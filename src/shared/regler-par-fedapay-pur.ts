/* ══ RÉGLER PAR FEDAPAY, LE SECOURS DE KKIAPAY — 12 novembre 2026 ══════
   Le choix du moyen, lot C (choix ⑤ de la maquette « Le choix du moyen »,
   public/maquette-le-choix-du-moyen.html) : « KkiaPay sur le site, Ma
   Couronne et Régler ; FedaPay dans les liens de la Maison ; chacun secours
   de l'autre ».

   SUR LA PAGE « RÉGLER » D'UN RENDEZ-VOUS (son jeton) : quand KkiaPay ne peut
   pas s'ouvrir (pas de clé, son script injoignable, une erreur technique ;
   jamais quand elle annule elle-même), la page propose « Payer par
   FedaPay ». La fonction `mnd-pay` (entrée publique `regler-*`) relit le
   rendez-vous et SA pièce, et décide de tout : le montant est le reste de la
   pièce, le merci est le sien (plafonné, seulement si la pièce n'en a pas
   déjà), les frais de FedaPay sont AJOUTÉS (la décision de la Maison du 16
   octobre), au taux de ses réglages. La demande est écrite au registre
   `mnd_pay` AVANT l'appel à FedaPay. Elle choisit mobile money ou carte sur
   la page de FedaPay, qui la ramène à la page Régler.

   PAYÉE, LA PIÈCE SE RÈGLE SEULE, sans Trône ouvert : `mnd-pay-webhook` (ou
   la relecture de la page) pose le versement sur la pièce et sur le
   rendez-vous, caisse « FedaPay », sous l'identifiant de la demande, avec la
   trace d'un règlement en ligne (le Trône en tire l'annonce, le merci
   partagé et le reçu, comme pour KkiaPay). Réglée entre-temps, ou un reste
   qui a baissé : l'argent reste au registre, « à rapprocher » au Trône. On
   ne perd jamais un franc reçu.

   Ce fichier est PUR. Le bloc ⟨regler-par-fedapay⟩ est recopié, mot pour
   mot, dans mnd-pay et mnd-pay-webhook (scripts/fedapay-copie-serveur.mjs
   le réécrit, le banc verifie-regler-par-fedapay le compare) ; les règles
   qu'il emprunte (les frais de mnd-pay-pur, la pièce de regler-la-seance-pur,
   l'honneur de terminer-et-regler-pur) y sont recopiées par le même script. */

import { compteDeLaDemande, moyenDeLaPiece, type ReglagesMndPay } from './mnd-pay-pur';
import { rdvRegle, resteDeLaPiece, type PieceLue, type RdvLu, type ReglementEnLigne, type VersementLu } from './regler-la-seance-pur';
import { honneurAuReglement } from './terminer-et-regler-pur';

/* ⟨regler-par-fedapay⟩ */
/** Le genre d'une demande née sur la page Régler, au registre `mnd_pay`.
    Ni « lien » (le Trône inscrirait lui-même le versement, sans le merci),
    ni « comptoir » : c'est le serveur qui la pose sur sa pièce. */
export const GENRE_DU_LIEN_REGLER = 'regler';
/** La page de paiement de FedaPay : elle y choisit mobile money ou carte. */
export const MOYEN_DU_LIEN_REGLER = 'au_choix';
/** La caisse de l'argent reçu par FedaPay (celle du Trône, `CAISSE_MND_PAY`). */
export const CAISSE_FEDAPAY_DU_LIEN = 'FedaPay';
/** Son nom d'avant le 12 novembre 2026 : il vaut encore la caisse FedaPay. */
export const ANCIEN_NOM_MND_PAY = 'MND PAY';
/** Le merci, de 0 à 100 000 F : la règle de « Payer par MTN ». */
export const MERCI_MAX_DU_LIEN = 100_000;
/** Au-delà, ce n'est plus une séance : un montant à vérifier (le plafond de mnd-pay). */
export const PLAFOND_DU_LIEN_XOF = 5_000_000;
/** Une demande encore en attente, du même total, se reprend une demi-heure :
    deux touchers ne font pas deux transactions chez FedaPay. */
export const REPRISE_DU_LIEN_MS = 30 * 60_000;
/** Une demande payée que le serveur n'a pas pu poser paraît « à rattacher »
    au Trône passé ce délai (une panne entre les deux). */
export const DELAI_DU_LIEN_REGLER_MS = 10 * 60_000;
/** L'identifiant d'une demande au registre : « mp- » et vingt signes hexadécimaux, tirés par le serveur. */
export const RE_DEMANDE_DU_LIEN = /^mp-[0-9a-f]{20}$/;
/** Ce que FedaPay montre sur sa page : jamais un nom, jamais un numéro de pièce. */
export const LIBELLE_DU_LIEN_REGLER = 'Maison MND · règlement de la séance';
/** Qui a demandé, au registre. */
export const DEMANDEE_PAR_LE_LIEN = 'la cliente, par son lien Régler';

const entier = (x: unknown): number => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);

/** Le merci tapé : un entier de 0 à 100 000 F ; rien quand la pièce en porte déjà un. */
export function merciDuLien(x: unknown, permis: boolean): number {
  const v = Math.floor(Number(x));
  if (!permis || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(MERCI_MAX_DU_LIEN, v);
}

/** LES RÉGLAGES DE LA MAISON qui comptent ici, lus dans le document
    `mnd_settings` (sa clé `mndPay`) : FedaPay allumé, et ses deux taux. Un
    taux illisible ne se lit pas (le défaut de mnd-pay-pur s'applique). */
export function reglagesDuLien(doc: unknown): ReglagesMndPay {
  const m = (doc && typeof doc === 'object' ? (doc as { mndPay?: unknown }).mndPay : null) as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return {};
  const taux = (x: unknown): number | undefined => {
    const v = Number(x);
    return x !== undefined && x !== null && x !== '' && Number.isFinite(v) && v >= 0 && v <= 20 ? v : undefined;
  };
  const mobile = taux(m.tauxMobilePct);
  const carte = taux(m.tauxCartePct);
  return { actif: m.actif === true, ...(mobile !== undefined ? { tauxMobilePct: mobile } : {}), ...(carte !== undefined ? { tauxCartePct: carte } : {}) };
}

/** FedaPay se propose sur la page : allumé par la Maison, et sa clé posée au serveur. */
export const fedapayOuvertAuLien = (o: { reglages: ReglagesMndPay | undefined; clePosee: boolean }): boolean =>
  o.reglages?.actif === true && o.clePosee === true;

/** LE COMPTE DU SERVEUR : le reste de la pièce, le merci (s'il est permis),
    les frais de FedaPay ajoutés (le taux le plus haut des deux, puisqu'elle
    choisit sur la page de FedaPay après que le montant est écrit), le total.
    `deja_reglee` : rien à régler ; `montant` : au-delà du plafond. */
export function compteDuLien(o: { resteXof: number; merciXof: unknown; merciPermis: boolean; reglages: ReglagesMndPay | undefined }):
  { ok: true; montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const reste = entier(o.resteXof);
  if (reste < 1) return { ok: false, raison: 'deja_reglee' };
  const c = compteDeLaDemande({ montantXof: reste, pourboireXof: merciDuLien(o.merciXof, o.merciPermis), moyen: MOYEN_DU_LIEN_REGLER, reglages: o.reglages });
  if (c.totalXof > PLAFOND_DU_LIEN_XOF) return { ok: false, raison: 'montant' };
  return { ok: true, montantXof: c.montantXof, pourboireXof: c.pourboireXof, fraisXof: c.fraisXof, totalXof: c.totalXof };
}

/** Une adresse de la machine même (le développement) : jamais un autre site. */
const boucleLocale = (u: URL): boolean => (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');

/** OÙ FEDAPAY LA RAMÈNE. Aucun domaine écrit ici : l'adresse se déduit de la
    page de retour que la Maison a déjà donnée à FedaPay (`MND_PAY_RETOUR`,
    paye.html du Trône), dont regler.html est la voisine. La page peut dire la
    sienne : elle n'est prise que si elle vit sur le MÊME site (ou sur la
    machine même, en développement) et se nomme regler.html. Le serveur écrit
    lui-même la suite (`r` : le jeton, `fp` : la demande) : rien d'autre ne
    voyage. Rend null quand la page de la Maison ne se lit pas. */
export function retourDuLien(o: { pageDeRetourDeLaMaison: string; pageDemandee?: unknown; jeton: string; demandeId: string }): string | null {
  let maison: URL;
  try { maison = new URL(String(o.pageDeRetourDeLaMaison ?? '').trim()); } catch { return null; }
  if (maison.protocol !== 'https:' && !boucleLocale(maison)) return null;
  let page = new URL('regler.html', maison);
  if (typeof o.pageDemandee === 'string' && o.pageDemandee.trim()) {
    try {
      const p = new URL(o.pageDemandee.trim());
      if ((p.origin === maison.origin || boucleLocale(p)) && /\/regler\.html$/.test(p.pathname)) page = new URL(`${p.origin}${p.pathname}`);
    } catch { /* une adresse illisible ne change rien */ }
  }
  /* Ni la requête ni l'ancre d'aucune des deux ne survivent : la suite est celle du serveur. */
  page.searchParams.set('r', o.jeton);
  page.searchParams.set('fp', o.demandeId);
  return page.toString();
}

/** Une demande du registre, telle que le serveur la lit. */
export type DemandeDuLien = {
  id: string; branchId?: string; genre?: string; moyen?: string; statut?: string;
  montantXof?: number; pourboireXof?: number; fraisXof?: number; totalXof?: number;
  pieceId?: string; pieceNumero?: string; clientId?: string; rdvId?: string;
  fedapayId?: number; reference?: string; url?: string; modeReel?: string;
  creeLe?: string; payeeLe?: string; poseLe?: string; aRapprocher?: string; raison?: string;
};

/** LA DEMANDE ÉCRITE AU REGISTRE AVANT L'APPEL À FEDAPAY : tout vient du
    serveur (le rendez-vous et la pièce relus, le compte), rien de la page. */
export function demandeDuLien(o: {
  id: string; branchId: string; rdvId: string;
  piece: { id: string; number?: string; clientId?: string };
  compte: { montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number };
  creeLe: string;
}): DemandeDuLien & Record<string, unknown> {
  return {
    id: o.id, branchId: o.branchId, genre: GENRE_DU_LIEN_REGLER, moyen: MOYEN_DU_LIEN_REGLER,
    montantXof: o.compte.montantXof, fraisXof: o.compte.fraisXof, totalXof: o.compte.totalXof,
    ...(o.compte.pourboireXof > 0 ? { pourboireXof: o.compte.pourboireXof } : {}),
    pieceId: o.piece.id, ...(o.piece.number ? { pieceNumero: String(o.piece.number).slice(0, 40) } : {}),
    ...(o.piece.clientId ? { clientId: String(o.piece.clientId).slice(0, 80) } : {}),
    rdvId: o.rdvId, libelle: LIBELLE_DU_LIEN_REGLER, statut: 'en_attente', creeLe: o.creeLe, creePar: DEMANDEE_PAR_LE_LIEN,
  };
}

/** LA DEMANDE À REPRENDRE : du même rendez-vous, encore en attente, partie
    chez FedaPay (sa page existe), au MÊME total, de moins d'une demi-heure. */
export function demandeAReprendre(lignes: readonly DemandeDuLien[], rdvId: string, totalXof: number, maintenantMs: number): DemandeDuLien | null {
  const bonnes = lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente'
    && !!d.fedapayId && !!d.url && entier(d.totalXof) === entier(totalXof)
    && maintenantMs - (Date.parse(String(d.creeLe ?? '')) || 0) < REPRISE_DU_LIEN_MS);
  return [...bonnes].sort((a, b) => String(b.creeLe ?? '').localeCompare(String(a.creeLe ?? '')))[0] ?? null;
}

/** Les demandes du même rendez-vous qu'une neuve remplace (un autre merci,
    un reste qui a changé) : encore en attente. Si l'une est payée quand
    même, FedaPay le dira, et l'argent ne se perd pas. */
export const demandesRemplacees = (lignes: readonly DemandeDuLien[], rdvId: string): DemandeDuLien[] =>
  lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente');

/** CE QUE LA PAGE VOIT D'UNE DEMANDE, et rien d'autre : son état, ce qui
    règle la séance (le reste et le merci), le total payé, l'honneur. Ni
    l'identifiant de FedaPay, ni sa référence, ni la pièce, ni un numéro. */
export function statutDuLienPourLaPage(d: DemandeDuLien, honore = false): {
  etat: 'attente' | 'payee' | 'refusee' | 'expiree' | 'annulee'; regleXof: number; totalXof: number; honore?: true;
} {
  const etat = d.statut === 'payee' ? 'payee' : d.statut === 'refusee' ? 'refusee' : d.statut === 'expiree' ? 'expiree' : d.statut === 'annulee' ? 'annulee' : 'attente';
  return {
    etat, regleXof: entier(d.montantXof) + entier(d.pourboireXof), totalXof: entier(d.totalXof),
    ...(etat === 'payee' && honore ? { honore: true as const } : {}),
  };
}

/** LE PARTAGE QUAND FEDAPAY CONFIRME : la pièce relue doit encore AU MOINS
    le reste demandé ; le versement est ce reste, le merci celui qu'elle a
    choisi. Réglée entre-temps, ou un reste qui a baissé : à rapprocher.
    On ne devine jamais un merci. */
export function partageDuLien(d: DemandeDuLien, resteActuelXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'reste_change' } {
  const actuel = entier(resteActuelXof);
  const demande = entier(d.montantXof);
  if (actuel <= 0) return { ok: false, raison: 'deja_reglee' };
  if (demande <= 0 || actuel < demande) return { ok: false, raison: 'reste_change' };
  return { ok: true, versementXof: demande, pourboireXof: Math.max(0, entier(d.pourboireXof)) };
}

/** Le jour et l'heure de Cotonou (UTC+1, sans heure d'été) d'un instant. */
export function quandACotonou(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** LE VERSEMENT POSÉ SUR LA PIÈCE ET LE RENDEZ-VOUS : l'identifiant de la
    demande (celui que le Trône inscrirait : deux écritures n'en font qu'une),
    le moyen qu'elle a vraiment pris, la caisse FedaPay. */
export function versementDuLien(d: DemandeDuLien, quandMs: number): VersementLu {
  const q = quandACotonou(quandMs);
  const frais = entier(d.fraisXof);
  return {
    id: d.id, date: q.date, time: q.time, amountXof: entier(d.montantXof),
    method: moyenDeLaPiece({ moyen: (d.moyen ?? MOYEN_DU_LIEN_REGLER) as 'au_choix', modeReel: d.modeReel }),
    cashbox: CAISSE_FEDAPAY_DU_LIEN,
    note: `FedaPay${d.reference ? ` · réf. ${d.reference}` : ''} · réglé par son lien Régler${frais > 0 ? ` · frais ${frais} F payés par la cliente` : ''}`,
  };
}

/** LA TRACE DU RÈGLEMENT sur la pièce : la forme d'un règlement en ligne. */
export function traceDuLien(d: DemandeDuLien, v: VersementLu, quandMs: number, pourboireXof: number): ReglementEnLigne {
  return {
    id: v.id, transactionId: d.fedapayId ? String(d.fedapayId) : d.id, payeLe: new Date(quandMs).toISOString(),
    montantXof: v.amountXof, pourboireXof: Math.max(0, entier(pourboireXof)), fraisXof: entier(d.fraisXof), moyen: CAISSE_FEDAPAY_DU_LIEN,
  };
}

/** LA PIÈCE APRÈS LE RÈGLEMENT : le versement, le statut qui suit l'argent,
    le merci à part (tipXof), la trace. La forme de `pieceReglee`
    (regler-la-seance-pur.ts), la caisse FedaPay en plus. */
export function pieceRegleeParLeLien(p: PieceLue, v: VersementLu, pourboireXof: number, trace: ReglementEnLigne): PieceLue {
  const payments = [...(p.payments ?? []), v];
  const suivante: PieceLue = { ...p, payments };
  const solde = resteDeLaPiece(suivante) <= 0;
  return {
    ...suivante,
    status: solde ? 'payée' : p.status,
    payment: p.payment ?? CAISSE_FEDAPAY_DU_LIEN,
    cashbox: p.cashbox ?? CAISSE_FEDAPAY_DU_LIEN,
    time: p.time ?? v.time,
    ...(pourboireXof > 0 ? { tipXof: entier(p.tipXof) + entier(pourboireXof) } : {}),
    reglementsEnLigne: [...(p.reglementsEnLigne ?? []).filter((r) => r.id !== trace.id), trace],
  };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE : le même versement (`rdvRegle`), puis
    l'honneur si elle avait déclaré avoir terminé et que tout est réglé. */
export function rdvApresLeLien(avant: RdvLu, v: VersementLu, pieceId: string, resteApresXof: number, maintenantMs: number): RdvLu {
  const regle = rdvRegle(avant, v, pieceId);
  const honneur = honneurAuReglement({ rdv: regle as unknown as Parameters<typeof honneurAuReglement>[0]['rdv'], resteXof: resteApresXof, maintenantMs });
  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;
}

/** La caisse FedaPay de la branche, si le Trône ne l'a pas encore posée : la
    même que la sienne (même identifiant, aucun doublon). */
export const caisseFedaPayNeuve = (branchId: string) => ({
  id: `cb-mndpay-${branchId}`, branchId, name: CAISSE_FEDAPAY_DU_LIEN, sub: 'Avant le reversement', glyph: '◈', openingXof: 0,
});
/** Une caisse de la branche est-elle déjà la caisse FedaPay ? */
export const estDejaLaCaisseFedaPay = (nom: unknown): boolean => nom === CAISSE_FEDAPAY_DU_LIEN || nom === ANCIEN_NOM_MND_PAY;
/* ⟨/regler-par-fedapay⟩ */

/* ══ CÔTÉ PAGE ET CÔTÉ TRÔNE (pas recopié au serveur) ════════════════════ */

/** Ce que la page dit d'un refus de l'entrée publique, en clair. */
export const DIT_DU_LIEN: Record<string, string> = {
  fermee: 'Le paiement par FedaPay n’est pas ouvert pour l’instant. Réessayez dans un moment, ou réglez à l’accueil.',
  indisponible: 'FedaPay ne répond pas pour l’instant. Réessayez dans un moment, ou réglez à l’accueil.',
  deja_reglee: 'Cette séance est déjà réglée. Merci.',
  sans_piece: 'Votre montant n’est pas encore prêt : l’équipe le prépare. Réessayez dans un instant.',
  annule: 'Ce rendez-vous a été annulé : il n’y a rien à régler.',
  lien: 'Ce lien n’est plus valable. Demandez-en un nouveau à la Maison.',
  montant: 'Ce montant ne passe pas en ligne : réglez à l’accueil.',
  trop: 'Beaucoup de demandes d’un coup. Réessayez dans un instant.',
  reseau: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
  hors_ligne: 'Pas de réseau pour l’instant. Réessayez dans un moment.',
};
export const ditDuLien = (e?: string): string => DIT_DU_LIEN[e ?? ''] ?? 'Le paiement par FedaPay n’a pas pu partir. Réessayez, ou réglez à l’accueil.';

/** LE MOT QUI ENVOIE LA PAGE « RÉGLER » DE SA SÉANCE, quand FedaPay ne
    répond pas au Trône (LienMndPay). La même phrase que le bouton « Envoyer
    le lien de paiement » de Factures.tsx : le banc verifie-regler-par-fedapay
    les compare. */
export const motDuLienRegler = (appel: string, resteDit: string, lien: string): string =>
  `Bonjour ${appel}, pour régler ${resteDit} depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez « Régler » sur cette page :\n${lien}`;
