import { createStore, useStore } from './store';

/* Le Carnet — rendez-vous multi-services, 08:00–18:00.
   Les semences sont générées autour d'aujourd'hui : le carnet vit toujours. */

export type Appointment = {
  id: string;
  branchId: string;
  clientId: string;
  /** Nom de la cliente au moment du RDV — porté depuis Ma Couronne pour que Le Trône
      l'affiche même si la fiche n'est pas (encore) synchronisée, et pour l'auto-réparation. */
  clientName?: string;
  serviceIds: string[]; // RDV multi-services
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  master: string;
  status: 'confirmé' | 'en attente' | 'honoré' | 'annulé';
  /** Acompte Mobile Money DEMANDÉ (montant). Tant que `depositConfirmed` n'est
      pas vrai, il n'est PAS déduit du dû : une réservation en ligne le pose au
      clic, sans preuve de paiement — le comptoir doit le vérifier puis le
      confirmer avant qu'il ne compte comme reçu. */
  depositXof?: number;
  /** L'acompte a été VÉRIFIÉ reçu (MoMo contrôlé au comptoir) — lui seul se déduit. */
  depositConfirmed?: boolean;
  /** Jour où l'acompte a été RECONNU reçu (ISO). Un acompte entre dans la caisse
      ce jour-là, pas le jour du rendez-vous : sans cette date, le registre des
      encaissements daterait l'argent du mauvais mois. Absent sur les acomptes
      confirmés avant son introduction — on retombe alors sur la date du RDV. */
  depositConfirmedAt?: string;
  paidXof?: number; // total encaissé au salon (hors acompte) — suit les paiements partiels
  discountPct?: number; // remise appliquée au RDV (0–100)
  /** Remise manuelle en CFA, retranchée APRÈS la remise en %. Geste de comptoir
      (fidélité, arrangement) que le pourcentage ne sait pas exprimer. */
  discountXof?: number;
  /** Prix du rituel FIGÉ au moment où il a été facturé, avant remise.
      Le catalogue vit : ses tarifs changent. Sans ce champ, un rituel de mars se
      relirait au tarif d'aujourd'hui et l'historique se réécrirait tout seul —
      sur les RDV repris de l'ancien ERP, l'écart atteignait 3 M F.
      Absent (le cas courant) → le total se calcule sur le catalogue, comme avant. */
  priceXof?: number;
  /** Prestations sur lesquelles l'acompte est calculé (défaut : toutes). */
  depositServiceIds?: string[];
  /** Série multi-séances : les RDV liés partagent cet identifiant. */
  seriesId?: string;
  seriesIndex?: number; // n° de la séance (1..N)
  seriesTotal?: number; // nombre total de séances de la série
  note?: string;
  source?: 'trone' | 'couronne' | 'consultation';
  /** Points de fidélité déjà attribués à l'honneur du RDV (évite le double comptage). */
  pointsAwarded?: boolean;
  /** Numéro de la facture émise à l'encaissement du RDV. */
  invoiceId?: string;
  /** Rituel COUVERT par l'abonnement de la cliente : rien à facturer (prix 0) et
      décompté de son allocation du cycle (voir `subServiceUsage`, equipe/data.ts).
      Ne jamais compter un RDV couvert dans le chiffre d'affaires. */
  coveredBySub?: boolean;
};

/** Date ISO à J+offset (calculée au chargement — le carnet suit le présent). */
const dOff = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const APPOINTMENTS_SEED: Appointment[] = [];

export const appointmentsStore = createStore<Appointment[]>('mnd_appointments', APPOINTMENTS_SEED);
export const useAppointments = () => useStore(appointmentsStore);

import { bindCollection, bindDocument } from './sync';
import { supabase } from './supabase';
bindCollection(appointmentsStore, 'appointments');

/* EFFACEMENT VOLONTAIRE de TOUS les rendez-vous — chemin dédié qui SUPPRIME
   directement côté serveur (l'app est connectée en staff, la RLS l'autorise),
   CONTOURNANT à dessein le garde-fou anti-suppression-de-masse de la synchro
   (fait pour bloquer les vidages ACCIDENTELS, pas les volontaires). La table de
   sauvegarde froide `import_appointments` n'est PAS concernée.
   ⚠ Irréversible sans sauvegarde.

   DEUX CORRECTIONS, apprises à la dure le 30-07-2026.

   ① ON N'EFFACE PLUS PAR BRANCHE. Le filtre `.eq('branch_id', …)` laissait
      derrière tout rendez-vous rattaché à une branche SUPPRIMÉE : 385 sur 792
      portaient `br-xrnyd4nh7x`, une branche qui n'existe plus. Le carnet
      paraissait vidé, et la moitié de l'histoire dormait encore au serveur —
      invisible partout sauf sous « Toutes les branches » d'Analytics.
      `branchId` est conservé en paramètre pour la trace de l'appelant.

   ② ON VIDE AUSSI LE CACHE LOCAL, sinon l'effacement se défait tout seul.
      À l'hydratation, une table serveur VIDE est traitée comme une maison
      neuve à amorcer : la synchro repousse alors le contenu du navigateur
      (voir `bindCollection`, branche `else`). Serveur vide + cache plein =
      les 792 rendez-vous remontent au rechargement. Le commentaire d'origine
      affirmait le contraire ; il avait tort.

      On écrit `[]` DANS localStorage plutôt que d'effacer la clé : une clé
      absente fait repartir la SEMENCE du code, qui génère des rendez-vous
      autour d'aujourd'hui. Et on écrit directement, sans passer par le
      magasin, pour ne pas déclencher une poussée de 792 suppressions que le
      garde-fou refuserait de toute façon — bruyamment. */
export async function wipeAppointments(_branchId: string): Promise<number> {
  const count = appointmentsStore.get().length;
  if (supabase) {
    /* `not id is null` = toutes les lignes, quelle que soit leur branche. */
    const { error } = await supabase.from('appointments').delete().not('id', 'is', null);
    if (error) throw new Error(error.message);
    localStorage.setItem(appointmentsStore.key, '[]');
  } else {
    // Mode local (sans backend) : le magasin est la seule vérité.
    appointmentsStore.set(() => []);
  }
  return count;
}

/* ----- Rappels WhatsApp déjà envoyés -----
   Une trace SYNCHRONISÉE (le comptoir et le téléphone du maître doivent voir le
   même carnet de rappels : sans ça, la cliente en reçoit deux, ou aucun).
   Clé = `<id du RDV>:<date du RDV>:<j1|h1>` — la DATE est dans la clé à dessein :
   un rendez-vous déplacé redevient « à rappeler », son ancien rappel ne vaut plus.
   Les clés de plus d'une semaine sont élaguées à chaque écriture (le document
   reste petit sans jamais qu'on ait à le purger à la main).
   ⚠ Document (LWW) et non collection : deux appareils qui marquent un rappel à la
   même seconde peuvent en perdre un — le pire des cas est un rappel envoyé deux
   fois, jamais une perte d'argent. */
export type ReminderKind = 'j1' | 'h1';

export const remindersSentStore = createStore<string[]>('mnd_reminders_sent', []);
bindDocument(remindersSentStore, 'mnd_reminders_sent');
export const useRemindersSent = () => useStore(remindersSentStore);

export const reminderKey = (apptId: string, date: string, kind: ReminderKind): string =>
  `${apptId}:${date}:${kind}`;

/** Date (AAAA-MM-JJ) portée par une clé de rappel — '' si la clé est d'un autre âge. */
const keyDate = (k: string): string => k.split(':')[1] ?? '';

export function markReminderSent(apptId: string, date: string, kind: ReminderKind): void {
  const key = reminderKey(apptId, date, kind);
  const floor = dOff(-8); // au-delà d'une semaine, un rappel n'apprend plus rien
  remindersSentStore.set((prev) =>
    prev.includes(key) ? prev : [...prev.filter((k) => keyDate(k) >= floor), key]);
}

export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;
