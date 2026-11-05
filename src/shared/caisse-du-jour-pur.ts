import { invoiceReglements } from './finance-pur';
import type { Cashbox, Invoice } from './finance';
import { attenduDuTiroir, nouvelleCloture, pourquoiPasCeJour, type Cloture } from './caisse-du-soir-pur';
import { laCaisseDuPaiement } from './caisses-des-caissiers-pur';
import { CAISSE_MND_PAY } from './mnd-pay-pur';

/* ══ LA CAISSE DU JOUR, CAISSE PAR CAISSE — 5 novembre 2026 ═══════════════
   « Dans la caisse du jour je veux pouvoir cocher les caisses pour voir quoi
   est disponible dans la caisse et clôturer correctement la caisse. Je ne
   veux pas juste un résumé. Je veux des chiffres qui ont du sens avec des
   totaux bien précis » (Yéman). Maquette « La caisse du jour » validée
   (« Validé, construis »), avec deux décisions :
     · les espèces se comptent en UN montant, comme MoMo et KkiaPay : pas de
       billetage ;
     · les pourboires en espèces restent dans le tiroir jusqu'aux salaires
       du 5 : ils comptent dans le disponible du soir, de jour en jour, tant
       qu'ils ne sont pas remis.

   LA REMISE DES POURBOIRES (5 novembre 2026, précision de la paie : les
   salaires partent par MTN, la paie n'écrit sa dépense « Salaires » sur
   aucune caisse, aucun tiroir ne bouge). Sans geste, les pourboires
   resteraient pour toujours dans le disponible. La direction les remet donc
   d'un geste, « Remettre les pourboires » : une SORTIE HORS ACTIVITÉ du
   tiroir, motif « Pourboires remis à l’équipe », par le mécanisme
   d'« À régulariser ». Hors résultat : ce n'est pas une dépense de la
   Maison, c'est l'argent des mains qui leur revient.

   LE LIVRE NE PORTE PAS LES POURBOIRES (ils vont au bocal, `receipts`) : le
   matin d'une caisse y ajoute donc ceux qu'elle garde des jours d'avant,
   sans quoi la remise sortirait du livre un argent qu'il n'a jamais compté.
   Après une clôture, ceux d'avant elle sont dans son compté ; depuis la
   remise à 0 F du tiroir, ceux d'avant sont partis avec elle.

   AUCUNE FORMULE NOUVELLE POUR LE LIVRE. Le matin, les entrées et les
   sorties viennent du livre du tiroir (`boxMoves` de `useCaisses`, la source
   de Finances › Les caisses et de son « Jour par jour ») ; le comptage part
   de la dernière clôture comme la clôture du soir (`attenduDuTiroir`). Ce
   module ne fait que les ranger en colonnes, y ajouter les pourboires et
   les dépenses sorties du tiroir en attente de validation (comme la clôture
   du soir), et dire ce qu'une clôture écrit. Sans React ni magasin :
   `verifie-la-caisse-du-jour` l'éprouve, le 4 novembre 2026 rejoué en
   données de banc. */

/** Une ligne du livre d'un tiroir, telle que `boxMoves` la rend. */
export type LigneDuLivre = {
  date: string;
  delta: number;
  label: string;
  sub?: string;
  /** Un versement : la pièce qu'il règle. */
  invoiceId?: string;
  /** Une dépense : sa fiche. */
  expenseId?: string;
  transfertId?: string;
};

/** Une dépense sortie du tiroir, pas encore validée : le livre ne la dit pas
    encore, le tiroir l'a déjà perdue (même lecture que la clôture du soir). */
export type AttenteDuTiroir = { id: string; label: string; date: string; xof: number };

/** Un pourboire, dans la caisse qui l'a reçu, au jour où il est entré. */
export type PourboireDuJour = { invoiceId: string; cashbox: string; xof: number; jour: string };

/** Le motif de la sortie hors activité qui remet les pourboires à l'équipe. */
export const MOTIF_POURBOIRES_REMIS = 'Pourboires remis à l’équipe' as const;
/** Le Trône suit les pourboires au tiroir à partir du lendemain de ce jour :
    ceux d'avant se remettaient hors de lui (et Real Money a été remis à 0 F
    au soir du 31 octobre 2026). Une remise à 0 F plus récente d'un tiroir
    repousse ce départ pour lui. */
export const SUIVI_DES_POURBOIRES_DEPUIS = '2026-10-31';

/** Une remise de pourboires déjà écrite sur ce tiroir. */
export type RemiseDePourboires = { date: string; xof: number };

/** La dernière clôture d'avant le jour, son livre remis à la mesure de
    celui du jour (`livreDeLaCloture`). */
export type ClotureDAvant = { laisseXof: number; livreXof: number; date?: string };

export type SortieDuJour = LigneDuLivre & { enAttente?: true };

export type CaisseDuJour = {
  nom: string;
  /** Au matin : ce que la dernière clôture a laissé, plus ce que le livre a
      bougé depuis ; sans clôture, le livre au soir de la veille. Avec, en
      plus, les pourboires gardés des jours d'avant (`pourboiresDuMatinXof`). */
  matinXof: number;
  matinSelon: 'livre' | 'comptage';
  /** Les pourboires des jours d'avant, encore dans la caisse au matin
      (depuis la dernière clôture, ou le départ du suivi). */
  pourboiresDuMatinXof: number;
  versementsXof: number;
  pourboiresXof: number;
  /** Ce que la caisse doit encore à l'équipe : les pourboires reçus depuis le
      départ du suivi, moins ce qui a déjà été remis. */
  aRemettreXof: number;
  /** Transferts reçus, avoirs versés, entrées hors activité, prêts rendus. */
  autresEntreesXof: number;
  /** Dépenses, coffre, transferts sortants, sorties hors activité (dont
      « À régulariser »), et les dépenses du jour en attente de validation. */
  sortiesXof: number;
  /** Ce qui doit être dans la caisse ce soir. */
  disponibleXof: number;
  /** Le soir selon le livre, sans pourboire ni attente : « Jour par jour ». */
  livreSoirXof: number;
  /** Le livre que retient une clôture de ce soir (les dépenses en attente
      retirées, comme la clôture du soir). */
  livreAClotureXof: number;
  entrees: LigneDuLivre[];
  autresEntrees: LigneDuLivre[];
  sorties: SortieDuJour[];
  pourboires: PourboireDuJour[];
  /** Quelque chose a bougé ce jour-là. */
  bouge: boolean;
};

const jourDe = (d: string | undefined): string => String(d ?? '').slice(0, 10);
const somme = (l: readonly number[]): number => l.reduce((s, n) => s + n, 0);

/* ── LES CAISSES DU COMPTOIR ─────────────────────────────────────────────
   Le tiroir des espèces, le compte MoMoPay de la Maison, KkiaPay, la carte,
   les chèques à déposer, MND PAY. Reconnues comme partout ailleurs
   (`laCaisseDuPaiement` : l'identifiant, le nom, un nom d'avant), jamais à
   un nom écrit ici. Toutes les autres de la branche vont au groupe replié. */
export function caissesDuComptoir<B extends Pick<Cashbox, 'id' | 'branchId' | 'name' | 'sub' | 'role' | 'equipe' | 'archiveeLe' | 'caissierId' | 'currency' | 'horsEncaissement'>>(
  boxes: readonly B[], branchId: string,
): B[] {
  const ici = boxes.filter((b) => b.branchId === branchId && !b.archiveeLe);
  const out: B[] = [];
  const ajoute = (b: B | undefined) => { if (b && !out.includes(b)) out.push(b); };
  /* Le tiroir des espèces, et à défaut la caisse qui se dit tiroir ou
     espèces (sans devise, ni caissier, ni épargne). */
  const ditEspeces = (b: B) => /esp[eè]ce|tiroir/i.test(`${b.name} ${b.sub ?? ''}`) && !/momo|devise/i.test(`${b.name} ${b.sub ?? ''}`);
  ajoute(laCaisseDuPaiement(ici, branchId, 'especes')
    ?? ici.find((b) => !b.currency && !b.caissierId && !b.horsEncaissement && ditEspeces(b)));
  ajoute(laCaisseDuPaiement(ici, branchId, 'momo'));
  ajoute(ici.find((b) => b.id === `cb-kkiapay-${branchId}`) ?? ici.find((b) => b.name === 'KkiaPay'));
  ajoute(laCaisseDuPaiement(ici, branchId, 'carte'));
  ajoute(laCaisseDuPaiement(ici, branchId, 'cheque'));
  ajoute(ici.find((b) => b.name === CAISSE_MND_PAY));
  return out;
}

/* ── LES POURBOIRES DU JOUR ──────────────────────────────────────────────
   Le pourboire est un fait de la PIÈCE : il arrive avec son premier
   versement (le jour de l'encaissement), une seule fois même si la pièce se
   règle en plusieurs jours. Il va dans la caisse du versement en espèces de
   ce jour-là, à défaut dans celle du premier versement (MoMo, KkiaPay,
   MND PAY : l'argent y est). Une pièce en devise n'en ajoute pas : le billet
   étranger est déjà entier dans son tiroir (doctrine du 11 août). L'avoir et
   l'acompte ne sont pas des billets du jour. */
const estEnEspeces = (m: string | undefined): boolean => /esp[eè]ces|cash|liquide/i.test(m ?? '');

/** Tous les pourboires des pièces de la branche, chacun à son jour et dans sa caisse. */
export function pourboiresDesPieces(pieces: readonly Invoice[], branchId: string): PourboireDuJour[] {
  const out: PourboireDuJour[] = [];
  for (const i of pieces) {
    if (i.branchId !== branchId || i.kind !== 'facture') continue;
    const xof = Math.round(i.tipXof ?? 0);
    if (!(xof > 0) || i.fx) continue;
    const vs = invoiceReglements(i).filter((p) => p.method !== 'Avoir' && p.method !== 'Acompte' && p.amountXof > 0);
    if (vs.length === 0) continue;
    const leJour = (p: { date?: string }) => jourDe(p.date || i.date);
    const jour = vs.map(leJour).sort()[0];
    const ceJour = vs.filter((p) => leJour(p) === jour).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
    const porteur = ceJour.find((p) => estEnEspeces(p.method)) ?? ceJour[0];
    if (porteur.fx) continue;
    const cashbox = porteur.cashbox ?? i.cashbox;
    if (!cashbox) continue;
    out.push({ invoiceId: i.id, cashbox, xof, jour });
  }
  return out;
}

/** Les pourboires entrés ce jour-là. */
export const pourboiresDuJour = (pieces: readonly Invoice[], branchId: string, jour: string): PourboireDuJour[] =>
  pourboiresDesPieces(pieces, branchId).filter((p) => p.jour === jour);

/* ── UNE CAISSE, UN JOUR ─────────────────────────────────────────────────
   disponible = matin + versements + pourboires + autres entrées − sorties,
   au franc près. Sans pourboire ni dépense en attente, le matin, les
   entrées, les sorties et le soir sont ceux du « Jour par jour » ; avec une
   clôture d'avant, le matin est son compté (le chiffre de la main). */
export function laCaisseDuJour(o: {
  nom: string;
  jour: string;
  /** Le livre au matin du jour : `boxMoves(nom, { de: jour, a: jour }).startBalance`. */
  livreMatinXof: number;
  /** Les lignes du jour : `boxMoves(nom, { de: jour, a: jour }).moves`. */
  moves: readonly LigneDuLivre[];
  /** Les dépenses de ce tiroir en attente de validation (toutes dates). */
  enAttente: readonly AttenteDuTiroir[];
  /** La dernière clôture de ce tiroir, au plus tard la veille. */
  derniere?: ClotureDAvant;
  /** Les pourboires des pièces (toutes caisses, tous jours : on prend les siens). */
  pourboires: readonly PourboireDuJour[];
  /** Les remises de pourboires déjà écrites sur ce tiroir. */
  remises?: readonly RemiseDePourboires[];
  /** Le départ du suivi des pourboires pour ce tiroir (exclu) : le plus tard
      de `SUIVI_DES_POURBOIRES_DEPUIS` et de sa dernière remise à 0 F. */
  suiviDepuis?: string;
}): CaisseDuJour {
  const { nom, jour } = o;
  const suivi = o.suiviDepuis && o.suiviDepuis > SUIVI_DES_POURBOIRES_DEPUIS ? o.suiviDepuis : SUIVI_DES_POURBOIRES_DEPUIS;
  const attenteAvant = somme(o.enAttente.filter((e) => jourDe(e.date) < jour).map((e) => e.xof));
  const attenteDuJour = o.enAttente.filter((e) => jourDe(e.date) === jour);
  const moves = o.moves.filter((m) => jourDe(m.date) === jour);
  const siens = o.pourboires.filter((p) => p.cashbox === nom);
  const pourboires = siens.filter((p) => p.jour === jour);
  /* Gardés au matin : entrés après la dernière clôture (son compté porte ceux
     d'avant) et après le départ du suivi, avant ce jour. */
  const gardesDepuis = o.derniere?.date && o.derniere.date > suivi ? o.derniere.date : suivi;
  const pourboiresDuMatinXof = somme(siens.filter((p) => p.jour > gardesDepuis && p.jour < jour).map((p) => p.xof));
  const recus = somme(siens.filter((p) => p.jour > suivi && p.jour <= jour).map((p) => p.xof));
  const remis = somme((o.remises ?? []).filter((r) => jourDe(r.date) > suivi && jourDe(r.date) <= jour).map((r) => r.xof));

  const matinXof = attenduDuTiroir({ livreMaintenantXof: o.livreMatinXof - attenteAvant, derniere: o.derniere }) + pourboiresDuMatinXof;
  const entrees = moves.filter((m) => !!m.invoiceId && m.delta > 0);
  const autresEntrees = moves.filter((m) => !m.invoiceId && m.delta > 0);
  const sorties: SortieDuJour[] = [
    ...moves.filter((m) => m.delta < 0),
    ...attenteDuJour.map((e) => ({ date: e.date, delta: -e.xof, label: e.label, sub: 'En attente de validation', expenseId: e.id, enAttente: true as const })),
  ];
  const versementsXof = somme(entrees.map((m) => m.delta));
  const autresEntreesXof = somme(autresEntrees.map((m) => m.delta));
  const sortiesXof = somme(sorties.map((m) => -m.delta));
  const pourboiresXof = somme(pourboires.map((p) => p.xof));
  const livreSoirXof = o.livreMatinXof + somme(moves.map((m) => m.delta));
  return {
    nom,
    matinXof,
    matinSelon: o.derniere ? 'comptage' : 'livre',
    pourboiresDuMatinXof,
    versementsXof, pourboiresXof, autresEntreesXof, sortiesXof,
    aRemettreXof: Math.max(0, recus - remis),
    disponibleXof: matinXof + versementsXof + pourboiresXof + autresEntreesXof - sortiesXof,
    livreSoirXof,
    livreAClotureXof: livreSoirXof - attenteAvant - somme(attenteDuJour.map((e) => e.xof)),
    entrees, autresEntrees, sorties, pourboires,
    bouge: moves.length > 0 || pourboires.length > 0 || attenteDuJour.length > 0,
  };
}

/** Cochée au départ : une caisse du comptoir qui a un solde ou un mouvement. */
export const cocheeAuDepart = (c: Pick<CaisseDuJour, 'bouge' | 'matinXof' | 'disponibleXof'>, duComptoir: boolean): boolean =>
  duComptoir && (c.bouge || c.matinXof !== 0 || c.disponibleXof !== 0);

/* ── REMETTRE LES POURBOIRES ─────────────────────────────────────────────
   Une sortie hors activité du tiroir, au jour affiché : elle paraît dans
   « − Sorties » ce jour-là, par le livre, et baisse ce qui reste à remettre.
   Jamais une dépense : rien n'entre aux Dépenses ni au résultat. */
const fr = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} F`;

/** Pourquoi la remise ne s'écrit pas encore, `null` quand elle peut partir. */
export function pourquoiPasLaRemiseDesPourboires(o: {
  xof: number | null; aRemettreXof: number; jour: string; aujourdhui: string;
  /** La dernière clôture de ce tiroir (AAAA-MM-JJ). */
  derniereClotureLe?: string;
}): string | null {
  if (o.jour > o.aujourdhui) return 'La remise ne se date pas dans l’avenir.';
  /* Une clôture garde le livre de son soir : une sortie glissée avant elle
     fausserait l'attendu du soir suivant (même borne que la remise à 0 F). */
  if (o.derniereClotureLe && o.jour < o.derniereClotureLe) return `Caisse close le ${o.derniereClotureLe.split('-').reverse().join('/')} : la remise se date ce jour-là ou après.`;
  if (o.aRemettreXof <= 0) return 'Aucun pourboire à remettre.';
  if (o.xof === null || !Number.isFinite(o.xof) || o.xof <= 0) return 'Le montant manque.';
  if (o.xof > o.aRemettreXof) return `Plus que les pourboires à remettre (${fr(o.aRemettreXof)}).`;
  return null;
}

/** La sortie hors activité que la remise écrit. */
export function laRemiseDesPourboires(o: { id: string; branchId: string; cashbox: string; jour: string; xof: number; par: string }): {
  id: string; branchId: string; date: string; sens: 'sortie'; motif: typeof MOTIF_POURBOIRES_REMIS; label: string; amountXof: number; cashbox: string;
} {
  return {
    id: o.id, branchId: o.branchId, date: o.jour, sens: 'sortie', motif: MOTIF_POURBOIRES_REMIS,
    label: `Par ${o.par}`, amountXof: Math.round(o.xof), cashbox: o.cashbox,
  };
}

/** Les remises de pourboires d'un tiroir, parmi les mouvements hors activité. */
export const remisesDesPourboires = (
  l: readonly { branchId: string; cashbox: string; sens?: 'entree' | 'sortie'; motif: string; date: string; amountXof: number }[],
  branchId: string, cashbox: string,
): RemiseDePourboires[] =>
  l.filter((m) => m.branchId === branchId && m.cashbox === cashbox && m.sens === 'sortie' && m.motif === MOTIF_POURBOIRES_REMIS)
    .map((m) => ({ date: m.date, xof: m.amountXof }));

/* ── L'ÉTAT D'UNE CAISSE CE JOUR-LÀ ──────────────────────────────────────
   Close : une clôture de ce jour, la plus récente (elle se montre avec son
   compté et son écart, et ne se reclôt pas en double), sauf si la direction
   a demandé de recompter. Bloquée : une clôture d'un jour d'après (la suite
   des comptages se casserait, `pourquoiPasCeJour`). Ouverte sinon, avec la
   clôture que la direction a demandé de reprendre, comme la clôture du soir. */
export type EtatDeLaCaisse =
  | { etat: 'ouverte'; reprend?: string }
  | { etat: 'close'; cloture: Cloture }
  | { etat: 'bloquee'; pourquoi: string };

export function etatDeLaCaisse(o: {
  clotures: readonly Cloture[]; branchId: string; cashbox: string; jour: string; aujourdhui: string;
}): EtatDeLaCaisse {
  const reprises = new Set(o.clotures.map((c) => c.reprend).filter(Boolean) as string[]);
  const aRefaire = (c: Cloture) => c.validation?.verdict === 'repris' && !reprises.has(c.id);
  const siennes = o.clotures.filter((c) => c.branchId === o.branchId && c.cashbox === o.cashbox);
  const duJour = siennes.filter((c) => c.date === o.jour).sort((a, b) => b.le.localeCompare(a.le))[0];
  if (duJour && !aRefaire(duJour)) return { etat: 'close', cloture: duJour };
  const pourquoi = pourquoiPasCeJour({ clotures: o.clotures, branchId: o.branchId, cashbox: o.cashbox, jour: o.jour, aujourdhui: o.aujourdhui });
  if (pourquoi) return { etat: 'bloquee', pourquoi };
  const repriseDe = siennes.filter(aRefaire).sort((a, b) => b.le.localeCompare(a.le))[0];
  return { etat: 'ouverte', ...(repriseDe ? { reprend: repriseDe.id } : {}) };
}

/** Le compté et l'écart d'une ligne : ceux de sa clôture quand elle est
    close, sinon ce que la main vient de saisir. */
export function compteEtEcart(etat: EtatDeLaCaisse, saisiXof: number | null, disponibleXof: number): { compteXof: number | null; ecartXof: number | null } {
  if (etat.etat === 'close') return { compteXof: etat.cloture.compteXof, ecartXof: etat.cloture.ecartXof };
  if (etat.etat === 'bloquee' || saisiXof === null) return { compteXof: null, ecartXof: null };
  return { compteXof: saisiXof, ecartXof: Math.round(saisiXof) - Math.round(disponibleXof) };
}

/** Un montant saisi : des chiffres (espaces permis), `null` sinon. */
export function montantSaisi(v: string): number | null {
  const t = v.replace(/[\s  ]/g, '').replace(',', '.');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t));
}

/* ── LES TOTAUX : LES SEULES CAISSES COCHÉES ─────────────────────────── */
export type LigneDuTableau = { caisse: CaisseDuJour; compteXof: number | null; ecartXof: number | null };
export type Totaux = {
  n: number; matinXof: number; versementsXof: number; pourboiresXof: number; autresEntreesXof: number;
  sortiesXof: number; disponibleXof: number; aRemettreXof: number; comptees: number; compteXof: number; ecartXof: number;
};

export function lesTotaux(lignes: readonly LigneDuTableau[], cochees: ReadonlySet<string>): Totaux {
  const t: Totaux = { n: 0, matinXof: 0, versementsXof: 0, pourboiresXof: 0, autresEntreesXof: 0, sortiesXof: 0, disponibleXof: 0, aRemettreXof: 0, comptees: 0, compteXof: 0, ecartXof: 0 };
  for (const l of lignes) {
    if (!cochees.has(l.caisse.nom)) continue;
    t.n += 1;
    t.matinXof += l.caisse.matinXof;
    t.versementsXof += l.caisse.versementsXof;
    t.pourboiresXof += l.caisse.pourboiresXof;
    t.autresEntreesXof += l.caisse.autresEntreesXof;
    t.sortiesXof += l.caisse.sortiesXof;
    t.disponibleXof += l.caisse.disponibleXof;
    t.aRemettreXof += l.caisse.aRemettreXof;
    if (l.compteXof !== null) {
      t.comptees += 1;
      t.compteXof += l.compteXof;
      t.ecartXof += l.ecartXof ?? 0;
    }
  }
  return t;
}

/* ── CLÔTURER LES CAISSES COCHÉES ────────────────────────────────────────
   Le bouton s'allume quand la journée est close (la clôture de Grenat), que
   chaque caisse cochée encore ouverte a son compté, et que chaque écart a
   son motif. `null` quand on peut. */
export type CaisseACloturer = {
  nom: string;
  etat: EtatDeLaCaisse;
  caisse: CaisseDuJour;
  compteXof: number | null;
  ecartXof: number | null;
  motif: string;
  /** Le fond habituel du tiroir (`fondPropose`) : rien ne part au coffre ici. */
  fondXof: number;
};

const noms = (l: readonly { nom: string }[]) => l.map((c) => c.nom).join(', ');

export function pourquoiPasLaCloture(o: { journeeClose: boolean; pourquoiJournee: string; cochees: readonly CaisseACloturer[] }): string | null {
  if (!o.journeeClose) return o.pourquoiJournee || 'La journée n’est pas close.';
  if (o.cochees.length === 0) return 'Cochez au moins une caisse.';
  const bloquee = o.cochees.find((c) => c.etat.etat === 'bloquee');
  if (bloquee && bloquee.etat.etat === 'bloquee') return `${bloquee.nom} : ${bloquee.etat.pourquoi}`;
  const ouvertes = o.cochees.filter((c) => c.etat.etat === 'ouverte');
  if (ouvertes.length === 0) return 'Les caisses cochées sont closes.';
  const aCompter = ouvertes.filter((c) => c.compteXof === null || c.compteXof < 0);
  if (aCompter.length) return `Reste à compter : ${noms(aCompter)}.`;
  const sansMotif = ouvertes.filter((c) => (c.ecartXof ?? 0) !== 0 && !c.motif.trim());
  if (sansMotif.length) return `Motif de l’écart : ${noms(sansMotif)}.`;
  return null;
}

/** Ce que la clôture écrit : une ligne de `clotures_caisse` par caisse cochée,
    ouverte et comptée, comme la clôture du soir (`nouvelleCloture`) :
    l'attendu est le disponible, le livre retenu celui du soir, rien ne part
    au coffre, le motif accompagne un écart. */
export function lesCloturesDuSoir(o: {
  branchId: string; jour: string; par: string; le: string; id: () => string;
  cochees: readonly CaisseACloturer[];
}): Cloture[] {
  const out: Cloture[] = [];
  for (const c of o.cochees) {
    if (c.etat.etat !== 'ouverte' || c.compteXof === null) continue;
    const ecart = Math.round(c.compteXof) - Math.round(c.caisse.disponibleXof);
    out.push(nouvelleCloture({
      id: o.id(), branchId: o.branchId, cashbox: c.nom, date: o.jour,
      attenduXof: c.caisse.disponibleXof, compteXof: c.compteXof,
      ...(ecart !== 0 && c.motif.trim() ? { note: c.motif } : {}),
      fondXof: c.fondXof, verseAuCoffreXof: 0,
      livreAvantCoffreXof: c.caisse.livreAClotureXof,
      par: o.par, le: o.le,
      ...(c.etat.reprend ? { reprend: c.etat.reprend } : {}),
    }));
  }
  return out;
}

/** L'état dit en tête : « Non clôturée · 1 / 3 comptées », « Clôturée · 3 / 3 ». */
export function etatDit(cochees: readonly Pick<CaisseACloturer, 'etat' | 'compteXof'>[]): { dit: string; close: boolean } {
  const n = cochees.length;
  const comptees = cochees.filter((c) => c.compteXof !== null).length;
  const closes = cochees.filter((c) => c.etat.etat === 'close').length;
  if (n > 0 && closes === n) return { dit: `Clôturée · ${n} / ${n}`, close: true };
  return { dit: `Non clôturée · ${comptees} / ${n} comptée${comptees > 1 ? 's' : ''}`, close: false };
}
