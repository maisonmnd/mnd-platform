import { createStore, useStore } from './store';
import type { LongueurId } from './catalog';

/* Le Carnet — rendez-vous multi-services, 08:00–18:00.
   Les semences sont générées autour d'aujourd'hui : le carnet vit toujours. */

/** Un versement encaissé sur un rendez-vous — avance sur une séance à venir, ou
    solde au comptoir. Une AVANCE n'honore pas le rendez-vous : le rituel reste
    « confirmé » tant qu'il n'est pas fait, mais l'argent, lui, est bien entré. */
export type ApptPayment = {
  id: string;
  amountXof: number;
  date: string; // ISO AAAA-MM-JJ — le jour où l'argent est ENTRÉ, jamais celui du rituel
  method?: string; // espèces · Mobile Money · carte…
  cashbox?: string; // caisse créditée
  note?: string;
};

export type Appointment = {
  id: string;
  branchId: string;
  clientId: string;
  /** Nom de la cliente au moment du RDV — porté depuis Ma Couronne pour que Le Trône
      l'affiche même si la fiche n'est pas (encore) synchronisée, et pour l'auto-réparation. */
  clientName?: string;
  serviceIds: string[]; // RDV multi-services
  /** LES MAINS — qui a réellement exécuté chaque prestation, par identifiant de
      membre du personnel. Tableau PARALLÈLE à `serviceIds` : `mains[i]` liste
      ceux qui ont fait `serviceIds[i]`.

      Parallèle et non indexé par prestation, parce qu'un rituel peut porter
      deux fois le même geste — deux modules de soin dans la même visite — et
      qu'ils ne sont pas forcément faits par les mêmes personnes.

      `master` reste le maître ASSIGNÉ, celui qui répond du rendez-vous. Il ne
      dit pas qui a travaillé : un KLƆKLƆ se fait à deux mains, une reprise
      rarement à moins, et la coiffure souvent par une troisième. Sans ce
      champ, une commission ne peut aller qu'à un seul nom, et c'est le mauvais
      dès que la journée se partage.

      Absent ou vide pour une ligne = on retombe sur `master`. */
  mains?: string[][];
  /** LA LONGUEUR TRAVAILLÉE CE JOUR-LÀ. Elle commande le prix et la durée des
      prestations qui se facturent à la longueur (voir `prixParLongueur`).

      Elle vit sur le rendez-vous et non sur la fiche cliente parce qu'elle
      change : une tête coupée en mars n'est plus la même en septembre. Inscrite
      ici, chaque rituel garde la longueur qu'il a réellement travaillée, et
      relire un rendez-vous de mars ne le retarife pas à la longueur d'aujourd'hui. */
  longueur?: LongueurId;
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
  /** JOURNAL DES VERSEMENTS — chaque règlement avec SA date. `paidXof` n'en donne
      que la somme, et une somme ne sait pas dire quand l'argent est entré : une
      cliente qui verse 100 000 F le 23 avril puis 300 000 F le 30 avril pour un
      rituel du 2 mai a payé 400 000 F EN AVRIL. Sans le journal, ces 400 000 F
      basculaient sur mai et faussaient deux mois d'un coup.
      Quand ce journal existe, il FAIT FOI ; `paidXof` reste le repli des
      rendez-vous d'avant (voir `apptPaidXof`). */
  payments?: ApptPayment[];
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
  /** PAR QUOI la seance est couverte. `coveredBySub` dit qu'elle est deja
      payee ; ce champ dit par quoi — un abonnement mensuel n'est pas un forfait
      vendu d'un coup, et les confondre au comptoir empeche de savoir ce que
      chaque formule rapporte reellement. Absent sur l'historique : on retombe
      alors sur « abonnement », seul mecanisme qui existait avant le 3 aout. */
  coverKind?: 'abonnement' | 'forfait';
  /** Le forfait qui couvre cette seance — l'identifiant de la prestation
      vendue, pour remonter du suivi a la vente qui l'a promis. */
  coverServiceId?: string;
  /** QUEL abonnement couvre ce rituel. Sans lui, la couverture se rattache à la
      CLIENTE — et une cliente qui porte deux packs voit ses rendez-vous décomptés
      deux fois, une fois sur chaque. Carolle Odoutan en portait deux simultanément
      dans l'ancien ERP ; c'est ce qui a rendu ce champ nécessaire.
      Il affranchit aussi le décompte des dates : un pack saisi après coup couvre
      des séances antérieures à son enregistrement, et le lien explicite les
      rattache quand une fenêtre de dates les aurait perdues. */
  subId?: string;
};

/** Total réellement encaissé au salon sur un rendez-vous. Le journal fait foi dès
    qu'il existe ; sinon on retombe sur `paidXof` — les rendez-vous d'avant le
    journal n'ont que lui, et les ignorer effacerait leur règlement. */
export const apptPaidXof = (a: Pick<Appointment, 'payments' | 'paidXof'>): number =>
  a.payments?.length ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0;

/** Ce qui est entré CE JOUR-LÀ sur ce rendez-vous — la brique de la recette du
    jour et du registre des encaissements. Un rituel de mai payé d'avance en avril
    n'apporte rien à la recette de mai : tout est déjà tombé en avril.
    L'acompte vérifié compte lui aussi, à la date où il a été reconnu reçu. */
export const apptCashOnDay = (a: Appointment, iso: string): number => {
  const versements = (a.payments ?? []).filter((p) => p.date === iso).reduce((s, p) => s + (Number(p.amountXof) || 0), 0);
  const acompte = a.depositConfirmed && (a.depositConfirmedAt ?? a.date) === iso ? Number(a.depositXof) || 0 : 0;
  /* Sans journal, on ne sait pas dater les versements : le total tombe le jour du
     rituel, comme avant. C'est le comportement d'origine, conservé tel quel. */
  const sansJournal = !a.payments?.length && a.date === iso ? Number(a.paidXof) || 0 : 0;
  return versements + acompte + sansJournal;
};

/** Reste dû sur un rendez-vous, acompte vérifié déduit. Jamais négatif : un
    trop-perçu est un pourboire ou une erreur de saisie, pas une dette de la Maison. */
export const apptDueXof = (a: Appointment, totalXof: number): number =>
  Math.max(0, totalXof - apptPaidXof(a) - (a.depositConfirmed ? Number(a.depositXof) || 0 : 0));

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
   (fait pour bloquer les vidages ACCIDENTELS, pas les volontaires).
   ⚠ Irréversible : il n'existe PLUS de filet côté base. Les tables `import_*`,
   zone d'atterrissage de la migration de l'ancien ERP, ont été vidées puis
   retirées du schéma le 30-07-2026 (supabase/drop_import_tables.sql) — la copie
   de référence de ces rendez-vous vit dans l'ancien ERP, hors de cette base.
   Le seul filet restant est l'export JSON de Système · Paramètres.

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
