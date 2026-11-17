/* ══ LE DEVIS SE REMET AU RENDEZ-VOUS — 17 novembre 2026 ═══════════════════
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » (Yéman). Tranché le même jour : le bilan
   (lecture, prix, devis) se remet AU rendez-vous, par la Maison, une fois la
   visio tenue ou la consultation privée faite. Jamais à la simple
   réservation, jamais avant.

   UN SEUL JUGE, `peutEtreRemis`, appelé partout où un devis sort de la
   Maison : « Remettre le devis », « Adresser par WhatsApp », Imprimer, PDF,
   « Confirmer », « Convertir en facture » (Factures), le geste « Son devis »
   des Conversations. Il dit oui, ou non avec une raison courte que le Trône
   affiche.

   CE QUE LA CLIENTE VOIT NE SE RECALCULE PAS CHEZ ELLE : Ma Couronne ne lit
   ni les visios ni les consultations. La Maison pose donc une marque sur le
   devis quand elle le remet (`remisLe`, `remisPar`), et c'est cette marque
   que lisent Ma Couronne (`visiblePourElle`) et la base (migration 0219 :
   une cliente ne lit pas un devis sans elle).

   CE QUI SORT DE LA RÈGLE : une pièce qui n'est pas un devis, et une
   commande de la Boutique (un `kind: 'devis'` qui porte `boutique`).

   LES DEVIS D'AVANT : un devis daté d'avant `LE_JOUR_DE_LA_REMISE`, déjà
   envoyé, accepté, confirmé ou payé, est tenu pour remis (elle l'a en main).
   Un « estimé » ou un « à valider » d'avant attend sa remise, comme les
   autres.

   UN DEVIS VAUT QUINZE JOURS, comptés du jour où il est remis. Passé ce
   délai il se dit périmé : la cliente ne le valide plus, la Maison ne le
   confirme plus tel quel, elle le renouvelle.

   MODULE PUR : ni magasin, ni horloge, ni fenêtre. */

export const VALIDITE_DU_DEVIS_JOURS = 15;

/** Le jour où la règle commence. Avant lui, un devis déjà parti reste parti. */
export const LE_JOUR_DE_LA_REMISE = '2026-11-17';

/** Le nom de remise que pose le devis ferme (`mesure-de-la-consultation-pur` le relit). */
export const LIBELLE_DE_LA_CONSULTATION_DEDUITE = 'Consultation privée, déduite';

/** Ce que la règle lit d'une pièce. */
export type DevisLuPourLaRemise = {
  kind: string;
  status: string;
  date: string;
  clientId?: string;
  forClientId?: string;
  consultationId?: string;
  /** L'instant où la Maison l'a remis (ISO). Absent : pas encore remis. */
  remisLe?: string;
  remisPar?: string;
  /** Le motif de la direction quand elle a passé outre la règle. */
  remisHorsRegle?: string;
  /** Une commande de la Boutique : hors de la règle. */
  boutique?: unknown;
};

/** Ce que la règle lit d'une consultation, tel que `visio-salle` et la file B
    l'écrivent (agent 1B, 17 novembre 2026) :
    · `rdvId` : son rendez-vous du Carnet. La consultation privée réglée et
      posée porte `rdv-privee-<id>` : « privée faite » se lit sur lui (honoré).
      Une visio inscrite au Carnet (réglage `auCarnet`, éteint au départ) le
      porte aussi ;
    · `visio` : la visio, son état (`statut`) et l'instant où elle a été tenue
      (`tenueLe`), posés par la file B au résumé ;
    · `momentRefuse` : la privée réglée dont le moment a été pris entre-temps,
      sans `rdvId` : elle n'est pas faite. */
export type ConsultationDeLaRemise = {
  id: string;
  createdAt?: string;
  paidXof?: number;
  rdvId?: string;
  visio?: { id: string; debut: string; statut?: string; tenueLe?: string };
  momentRefuse?: unknown;
  temoins?: readonly string[];
};

export type VisioDeLaRemise = { id?: string; consultationId?: string | null; telephone?: string; statut: string; debut?: string };
export type RdvDeLaRemise = { id: string; clientId: string; status: string; date: string };

export type ContexteDeLaRemise = {
  consultations: readonly ConsultationDeLaRemise[];
  visios: readonly VisioDeLaRemise[];
  rdvs: readonly RdvDeLaRemise[];
  /** Le numéro d'une cliente : une visio prise sans consultation se retrouve par lui. */
  telephoneDe?: (clientId: string) => string | undefined;
};

export type Remise =
  | { ok: true; par: 'hors-regle' | 'deja-remis' | 'visio' | 'privee' | 'rendez-vous' }
  | { ok: false; raison: string };

const ETATS_PARTIS = ['envoyée', 'acceptée', 'confirmé', 'payée'];
const ETATS_QUI_PERIMENT = ['estimé', 'à valider', 'envoyée'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Cotonou vit une heure après le temps universel, sans heure d'été. */
const DECALAGE_DE_COTONOU_MS = 60 * 60_000;

const huit = (t: string | undefined): string => String(t ?? '').replace(/\D/g, '').slice(-8);

/** Le jour de Cotonou d'un instant, ou le jour lui-même s'il est déjà un jour. */
export function jourDeLInstant(iso: string | undefined): string {
  const s = String(iso ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10) : '';
}

/** Un jour, n jours plus tard. */
export function plusJours(jour: string, n: number): string {
  const ms = Date.parse(`${jour}T00:00:00.000Z`);
  return Number.isFinite(ms) ? new Date(ms + n * 86_400_000).toISOString().slice(0, 10) : '';
}

/** « 2 décembre 2026 ». */
export function jourEnClair(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  return a && m && j ? `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}` : jour;
}

/** « le 17 nov. à 10:00 », à l'heure de Cotonou. */
function quandDit(iso: string | undefined): string {
  const ms = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + DECALAGE_DE_COTONOU_MS).toISOString();
  return `le ${Number(d.slice(8, 10))} ${MOIS_COURTS[Number(d.slice(5, 7)) - 1]} à ${d.slice(11, 16)}`;
}

/** La règle ne regarde ni une facture, ni une commande de la Boutique (un objet `boutique`, comme en base). */
export const horsRegle = (d: Pick<DevisLuPourLaRemise, 'kind' | 'boutique'>): boolean =>
  d.kind !== 'devis' || (typeof d.boutique === 'object' && d.boutique !== null && !Array.isArray(d.boutique));

/** La Maison l'a remis : sa marque, ou un devis d'avant la règle déjà parti. */
export const estRemis = (d: Pick<DevisLuPourLaRemise, 'status' | 'date' | 'remisLe'>): boolean =>
  !!d.remisLe || (/^\d{4}-\d{2}-\d{2}/.test(String(d.date ?? '')) && String(d.date) < LE_JOUR_DE_LA_REMISE && ETATS_PARTIS.includes(d.status));

/** Ce que la cliente peut lire d'un devis : remis, et plus un brouillon. La base tient la même règle (0219). */
export const lisibleParElle = (d: DevisLuPourLaRemise): boolean =>
  horsRegle(d) || (d.status !== 'brouillon' && estRemis(d));

/* ── LA RÈGLE ─────────────────────────────────────────────────────────── */

/** Le devis peut-il être montré ou envoyé à la cliente ? Sinon, pourquoi. */
export function peutEtreRemis(d: DevisLuPourLaRemise, ctx: ContexteDeLaRemise): Remise {
  if (horsRegle(d)) return { ok: true, par: 'hors-regle' };
  if (estRemis(d)) return { ok: true, par: 'deja-remis' };

  const tetes = [d.clientId, d.forClientId].filter((x): x is string => !!x);
  const honores = ctx.rdvs.filter((a) => a.status === 'honoré' && tetes.includes(a.clientId));

  if (d.consultationId) {
    const c = ctx.consultations.find((x) => x.id === d.consultationId);
    if (!c) return { ok: false, raison: 'Sa consultation est introuvable : rien ne dit que le rendez-vous a eu lieu.' };
    const privee = (Number(c.paidXof) || 0) > 0;
    /* La visio : son état sur la consultation (la file B), ou dans la table `visios`. */
    const visios: VisioDeLaRemise[] = [
      ...(c.visio?.statut ? [{ id: c.visio.id, consultationId: c.id, statut: c.visio.tenueLe ? 'tenue' : c.visio.statut, debut: c.visio.debut }] : []),
      ...ctx.visios.filter((v) => v.consultationId === c.id || (!!c.visio && !!v.id && v.id === c.visio.id)),
    ];
    if (c.visio?.tenueLe || visios.some((v) => v.statut === 'tenue')) return { ok: true, par: 'visio' };
    /* Son rendez-vous du Carnet, quand la consultation le porte : la privée faite (ou la visio inscrite au Carnet, tenue). */
    const rdv = c.rdvId ? ctx.rdvs.find((a) => a.id === c.rdvId) : undefined;
    if (rdv?.status === 'honoré') return { ok: true, par: privee ? 'privee' : 'rendez-vous' };
    /* La privée d'avant le Carnet : les locks témoins se photographient devant elle. */
    if (privee && (c.temoins?.length ?? 0) > 0) return { ok: true, par: 'privee' };

    if (privee && !c.rdvId && c.momentRefuse) return { ok: false, raison: 'La consultation privée n’a pas encore son moment au Carnet : elle n’est pas faite.' };
    if (privee) return { ok: false, raison: 'La consultation privée n’est pas encore faite.' };
    const aVenir = visios.find((v) => v.statut === 'réservée');
    if (aVenir) return { ok: false, raison: `La visio n’est pas encore tenue${aVenir.debut ? ` (${quandDit(aVenir.debut)})` : ''}.` };
    if (visios.some((v) => v.statut === 'manquée')) return { ok: false, raison: 'Elle a manqué sa visio : le devis attend un rendez-vous tenu.' };
    if (rdv && rdv.status !== 'annulé') return { ok: false, raison: 'Son rendez-vous n’a pas encore eu lieu.' };
    return { ok: false, raison: 'Aucun rendez-vous tenu : ni visio, ni consultation privée.' };
  }

  /* Un devis fait au Trône, sans consultation : elle est déjà venue. */
  if (tetes.length === 0) return { ok: false, raison: 'Sans fiche cliente, rien ne dit qu’elle est venue à la Maison.' };
  if (honores.length > 0) return { ok: true, par: 'rendez-vous' };
  const numeros = tetes.map((id) => huit(ctx.telephoneDe?.(id))).filter((n) => n.length === 8);
  if (ctx.visios.some((v) => v.statut === 'tenue' && numeros.includes(huit(v.telephone)))) return { ok: true, par: 'visio' };
  return { ok: false, raison: 'Elle n’a pas encore eu de rendez-vous honoré à la Maison.' };
}

/* ── CE QUE LE TRÔNE AFFICHE ──────────────────────────────────────────── */

export type EtatDeLaRemise =
  | { etat: 'hors-regle' }
  | { etat: 'remis'; le?: string; par?: string; horsRegle?: string }
  /** Le rendez-vous est tenu : la Maison peut le remettre. */
  | { etat: 'a-remettre' }
  /** À remettre au rendez-vous : la raison se dit. */
  | { etat: 'attend'; raison: string };

export function etatDeLaRemise(d: DevisLuPourLaRemise, ctx: ContexteDeLaRemise): EtatDeLaRemise {
  if (horsRegle(d)) return { etat: 'hors-regle' };
  if (estRemis(d)) return { etat: 'remis', le: d.remisLe, par: d.remisPar, horsRegle: d.remisHorsRegle };
  const r = peutEtreRemis(d, ctx);
  return r.ok ? { etat: 'a-remettre' } : { etat: 'attend', raison: r.raison };
}

/** Le mot de la pastille du registre, ou rien. Un brouillon ne dit rien : il se travaille. */
export function pastilleDeLaRemise(d: DevisLuPourLaRemise, e: EtatDeLaRemise): string | null {
  if (d.status === 'brouillon') return null;
  if (e.etat === 'attend') return 'à remettre au rendez-vous';
  if (e.etat === 'a-remettre') return 'à remettre';
  return null;
}

/** La marque que pose la Maison en remettant le devis. Un brouillon part « envoyé ». */
export function marqueDeLaRemise(d: Pick<DevisLuPourLaRemise, 'status' | 'remisLe'>, quand: string, par?: string, horsRegleMotif?: string):
  { remisLe: string; remisPar?: string; remisHorsRegle?: string; status?: 'envoyée' } {
  return {
    remisLe: d.remisLe || quand,
    ...(par ? { remisPar: par } : {}),
    ...(horsRegleMotif ? { remisHorsRegle: horsRegleMotif } : {}),
    ...(d.status === 'brouillon' ? { status: 'envoyée' as const } : {}),
  };
}

/* ── QUINZE JOURS ─────────────────────────────────────────────────────── */

/** Le dernier jour où le devis vaut : quinze jours après sa remise (sa date, pour un devis d'avant la marque). */
export const dernierJourValable = (d: Pick<DevisLuPourLaRemise, 'date' | 'remisLe'>): string =>
  plusJours(jourDeLInstant(d.remisLe) || String(d.date ?? '').slice(0, 10), VALIDITE_DU_DEVIS_JOURS);

/** Remis, pas encore accepté, et ses quinze jours sont passés. */
export function estPerime(d: DevisLuPourLaRemise, aujourdhui: string): boolean {
  if (horsRegle(d) || !estRemis(d) || !ETATS_QUI_PERIMENT.includes(d.status)) return false;
  const fin = dernierJourValable(d);
  return !!fin && aujourdhui > fin;
}

/** « Valable jusqu’au 2 décembre 2026 », ou rien quand la question ne se pose pas. */
export function validiteDite(d: DevisLuPourLaRemise): string {
  if (horsRegle(d) || !estRemis(d) || !ETATS_QUI_PERIMENT.includes(d.status)) return '';
  const fin = dernierJourValable(d);
  return fin ? `Valable jusqu’au ${jourEnClair(fin)}` : '';
}

/** Le papier du devis dit jusqu'à quand il vaut, sous le mot du maître. */
export function avecLaValidite<T extends { note?: string }>(papier: T, d: DevisLuPourLaRemise): T {
  const v = validiteDite(d);
  return v ? { ...papier, note: `${papier.note ? `${papier.note}\n` : ''}${v}.` } : papier;
}

/** Le devis d'avant était périmé : l'enregistrer « confirmé » demande de l'avoir renouvelé (sa date, sa remise). */
export const seConfirmeTelQuel = (avant: DevisLuPourLaRemise, apres: DevisLuPourLaRemise, aujourdhui: string): boolean =>
  !estPerime({ ...apres, status: avant.status }, aujourdhui);

/** Renouveler : le même devis repart pour quinze jours, à relire avant de l'enregistrer. */
export const renouvele = (aujourdhui: string, quand: string): { date: string; remisLe: string } => ({ date: aujourdhui, remisLe: quand });

/* ── LA PORTE PAR OÙ SORT UN DEVIS ────────────────────────────────────────
   Ce que les Factures du Trône font de la règle, sans crochet ni écran : le
   banc l'éprouve tel quel, et `RemiseDuDevis.tsx` ne fait que lui tendre le
   contexte, l'heure et l'écriture. */
export type MarqueDeLaRemise = ReturnType<typeof marqueDeLaRemise>;
type PieceDeLaPorte = DevisLuPourLaRemise & { id: string; number?: string };

export function porteDeLaRemise<T extends PieceDeLaPorte>(
  contexte: ContexteDeLaRemise,
  aujourdhui: string,
  o: {
    /** Écrit la marque de la remise sur la pièce. */
    ecris: (id: string, marque: MarqueDeLaRemise) => void;
    /** Qui remet : le nom de la personne connectée. */
    qui?: string;
    /** Dit un refus à l'écran. */
    dit: (mot: string) => void;
    /** L'instant présent (ISO). */
    maintenant: () => string;
  },
) {
  const etatDe = (d: T): EtatDeLaRemise => etatDeLaRemise(d, contexte);

  /** Pourquoi ce devis ne sort pas, ou null. */
  const fermeAuDevis = (d: T): string | null => {
    if (horsRegle(d)) return null;
    if (estPerime(d, aujourdhui)) return `Ce devis valait jusqu’au ${jourEnClair(dernierJourValable(d))} : renouvelez-le avant de l’envoyer.`;
    const r = peutEtreRemis(d, contexte);
    return r.ok ? null : `À remettre au rendez-vous. ${r.raison}`;
  };

  /** Le devis sort : la règle dit oui, la Maison le marque remis. Rend la pièce telle qu'elle part, ou null.
      `motifHorsRegle` : la direction passe outre, son motif reste écrit sur le devis. */
  const sortLeDevis = (d: T, motifHorsRegle?: string): T | null => {
    if (horsRegle(d)) return d;
    const refus = motifHorsRegle ? null : fermeAuDevis(d);
    if (refus) { o.dit(refus); return null; }
    if (estRemis(d) && !motifHorsRegle) return d;
    const marque = marqueDeLaRemise(d, o.maintenant(), o.qui, motifHorsRegle);
    o.ecris(d.id, marque);
    return { ...d, ...marque } as T;
  };

  /** Pourquoi « Confirmer et créer le rendez-vous » est fermé, ou null : un devis se confirme remis, et dans ses quinze jours. */
  const fermeALaConfirmation = (d: T): string | null => {
    if (horsRegle(d)) return null;
    if (!estRemis(d)) return 'Remettez d’abord le devis à la cliente : il se confirme ensuite.';
    if (estPerime(d, aujourdhui)) return `Il valait jusqu’au ${jourEnClair(dernierJourValable(d))} : renouvelez-le avant de le confirmer.`;
    return null;
  };

  /** Pourquoi « Convertir en facture » est fermé, ou null : la facture se lit dans Ma Couronne, ce serait le remettre. */
  const fermeALaFacture = (d: T): string | null =>
    (!horsRegle(d) && !estRemis(d) ? 'Remettez d’abord le devis à la cliente.' : null);

  /** Ce qui refuse un enregistrement, ou null : un second devis pour la même
      consultation ; « confirmé » sur un devis pas remis, ou périmé. `avant` :
      la pièce telle qu'elle était (absente pour un devis neuf). */
  const refuseLEnregistrement = (
    d: T, avant: T | undefined,
    pieces: readonly { id: string; date: string; number?: string; consultationId?: string }[],
  ): string | null => {
    if (horsRegle(d)) return null;
    if (!avant && d.consultationId) {
      const deja = pieceDeLaConsultation(pieces, d.consultationId, d.id);
      if (deja) return `Cette consultation a déjà son devis (${deja.number ?? ''}) : modifiez-le plutôt.`;
    }
    if (d.status === 'confirmé' && avant?.status !== 'confirmé') {
      if (!estRemis(d)) return 'Ce devis n’est pas encore remis à la cliente : remettez-le d’abord, il se confirme ensuite.';
      if (avant && !seConfirmeTelQuel(avant, d, aujourdhui)) {
        return `Ce devis valait jusqu’au ${jourEnClair(dernierJourValable(avant))} : renouvelez-le avant de le confirmer.`;
      }
    }
    return null;
  };

  return { aujourdhui, etatDe, fermeAuDevis, sortLeDevis, fermeALaConfirmation, fermeALaFacture, refuseLEnregistrement };
}

/* ── LE LIEN DE L'ACOMPTE ─────────────────────────────────────────────────
   Le devis confirmé a fait naître son rendez-vous, avec un acompte DEMANDÉ
   (`depositXof`, jamais confirmé : seul le comptoir ou le serveur le dit
   reçu). Tant qu'il n'est pas reconnu reçu, son lien peut partir. La page
   « Régler » ne le prend pas (elle se ferme sur un acompte non vérifié) : le
   lien est celui de la page Mobile Money de la Maison, au montant exact. */
export function acompteAEnvoyer(
  d: { kind: string; status: string; id: string; apptId?: string; boutique?: unknown },
  rdvs: readonly { id: string; devisId?: string; status: string; depositXof?: number; depositConfirmed?: boolean }[],
): number {
  if (horsRegle(d) || d.status !== 'confirmé') return 0;
  const rdv = (d.apptId ? rdvs.find((a) => a.id === d.apptId) : undefined) ?? rdvs.find((a) => a.devisId === d.id);
  if (!rdv || rdv.depositConfirmed || rdv.status === 'annulé' || rdv.status === 'honoré') return 0;
  return Math.max(0, Math.round(Number(rdv.depositXof) || 0));
}

/** Le message du lien de l'acompte (la devise le signe à part). */
export const motDuLienDeLAcompte = (appel: string, acompte: string, lien: string): string =>
  `Bonjour ${appel}, votre devis est confirmé. Pour réserver votre rituel, l’acompte est de ${acompte}. `
  + `Par Mobile Money, ouvrez cette page : le code à composer s’y affiche, montant compris.\n${lien}`;

/* ── UN DEVIS PAR CONSULTATION ────────────────────────────────────────── */

/** La pièce déjà née de cette consultation (devis, ou facture née de lui), la plus récente. */
export function pieceDeLaConsultation<T extends { id: string; date: string; number?: string; consultationId?: string }>(
  pieces: readonly T[], consultationId: string, saufId?: string,
): T | undefined {
  if (!consultationId) return undefined;
  return pieces
    .filter((p) => p.consultationId === consultationId && p.id !== saufId)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.number ?? '').localeCompare(String(a.number ?? '')))[0];
}

/** La consultation privée réglée se déduit UNE fois : jamais sur un devis qui la porte déjà. */
export function avecLaDeduction(
  d: { globalDiscountXof?: number; discountLabel?: string },
  deduction: { globalDiscountXof: number; discountLabel: string } | null,
): { globalDiscountXof?: number; discountLabel?: string } {
  if (!deduction || !(deduction.globalDiscountXof > 0)) return {};
  if ((d.discountLabel ?? '').includes(LIBELLE_DE_LA_CONSULTATION_DEDUITE)) return {};
  const deja = Math.max(0, Math.round(Number(d.globalDiscountXof) || 0));
  if (deja === 0) return { globalDiscountXof: deduction.globalDiscountXof, discountLabel: deduction.discountLabel };
  return {
    globalDiscountXof: deja + deduction.globalDiscountXof,
    discountLabel: `${deduction.discountLabel} · ${(d.discountLabel ?? '').trim() || 'remise'}`,
  };
}

/* ── LA PIÈCE DÉJÀ NÉE SE ROUVRE ──────────────────────────────────────────
   « Préparer le devis » d'une consultation qui a déjà sa pièce n'en ouvre
   pas une seconde : la pièce se rouvre. Demandé ferme (après la consultation
   privée), l'estimé DEVIENT le devis ferme : à valider par elle, la
   consultation réglée déduite une seule fois, le mot du devis ferme s'il
   portait encore celui de l'estimation. Un devis déjà accepté, confirmé ou
   payé se rouvre tel quel ; une facture née du devis s'ouvre sans s'éditer. */
export function rouvreLaPieceDeLaConsultation<T extends {
  kind: string; status: string; number?: string; note?: string; aValiderPar?: string;
  globalDiscountXof?: number; discountLabel?: string;
}>(
  deja: T,
  o: { ferme: boolean; deduction: { globalDiscountXof: number; discountLabel: string } | null; motEstime: string; motFerme: string },
): { piece: T; enEdition: boolean; mot: string } {
  const numero = deja.number ?? '';
  if (deja.kind !== 'devis') {
    return { piece: deja, enEdition: false, mot: `Cette consultation a déjà sa facture ${numero}, née de son devis : elle s’ouvre, plutôt qu’un second devis.` };
  }
  const avance = deja.status === 'acceptée' || deja.status === 'confirmé' || deja.status === 'payée';
  if (!o.ferme || avance) {
    return { piece: deja, enEdition: true, mot: `Cette consultation a déjà son devis ${numero} : il s’ouvre, plutôt qu’un second.` };
  }
  const note = !deja.note?.trim() || deja.note === o.motEstime ? o.motFerme : deja.note;
  return {
    piece: { ...deja, status: 'à valider', aValiderPar: 'cliente', ...avecLaDeduction(deja, o.deduction), note } as T,
    enEdition: true,
    mot: `Cette consultation a déjà son devis ${numero} : il devient le devis ferme, la consultation réglée déduite une seule fois. Ajustez les lignes devant les témoins.`,
  };
}
