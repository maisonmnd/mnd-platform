import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check } from 'lucide-react';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch, maitreParDefaut } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { COTE_VIGNETTE, QUALITE_VIGNETTE } from '../../../../shared/photo';
import { maisonNom, houseSignature } from '../../../../shared/identite';
import {
  clientsStore, clienteDePassage, ensureInitiePersona, estDePassage, useClients, useFamilies,
  remiseFamillePct, type Client,
} from '../../../../shared/clients';
import { apptPaidXof,
  appointmentsStore, useAppointments, useRemindersSent, markReminderSent, reminderKey, venuesHonorees,
  attacheSeance, detacheSeance,
} from '../../../../shared/agenda';
import { fermerLeSalonPour, rouvrirLeSalonDe } from '../../../../shared/blocages';
import {
  type Appointment, type ReminderKind,
} from '../../../../shared/agenda';
import { sousArbreOf, useServices, useCategories, useProducts, priceModeOf, catsDansLOrdre, mondeDeCat, mondeLabel, LONGUEURS, suitLongueur, type LongueurId, type Service } from '../../../../shared/catalog';
import { depositForServices, depositPctFor, useSettings } from '../../../../shared/settings';
import { createStore, uid, useStore } from '../../../../shared/store';
import { consommerPourRituel, rembobinerRituel } from '../../../../shared/stock';
import { useSubscribers, usePlans, activeSubscriberOf, coveredRemaining, inclusVendus, useStaff, ordonneEquipe, type StaffMember } from '../equipe/data';
import { prixFerme, prixFixeDe, useModelBands, useBandSets, pricingOf, personalPriceXof, prixDansPanier, remiseGestePct, unGesteDansLePanier, prixDeBase, isPersonalized, bandLabel, personalDurationMin, servesBand, bandForService, estProposable, regimeTarifaire, splitByWeights, type ModelBand } from '../../../../shared/pricing';
import { sameName } from '../../../../shared/text';
import type { CommRates } from '../equipe/payroll';
import { invoicesStore, invoiceTotal, invoiceReglements, caissesHorsBilan, type Invoice, type Cashbox, totalProduitsXof } from '../../../../shared/finance';
import { DemanderModal } from '../equipe/DemanderModal';
import './clients.css';

/* Outils communs du domaine Clients & Agenda — dates, pastilles, tiroir, modale RDV. */

/* ---------- Dates ---------- */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => toISO(new Date());

/** Le JOUR d'une valeur de date, ou '' si elle est illisible.
    `fromISO` construit la date en collant l'heure au jour (`${iso}T12:00:00`) :
    toute valeur qui n'est pas un jour ISO nu produit une date invalide, et les
    formateurs écrivaient « Invalid Date » en clair à l'écran. C'est arrivé pour
    de bon — une date déjà formatée repassée dans `frShort` (voir Catalogue.tsx,
    le point d'usage). Ce garde-fou coupe au jour, tolère un horodatage complet,
    et refuse le reste plutôt que de deviner. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const dayOf = (v?: string | null): string => {
  const s = String(v ?? '').slice(0, 10);
  return ISO_DAY.test(s) ? s : '';
};
export const fromISO = (iso: string) => new Date(`${dayOf(iso)}T12:00:00`);
export const addDaysISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Une date illisible s'écrit « — », JAMAIS « Invalid Date » : au comptoir,
   un tiret se comprend, un message d'erreur anglais inquiète la cliente. */

/** « Lun. 13 juil. » */
export const frShort = (iso: string) =>
  dayOf(iso) ? cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) : '—';

/** « Lundi 13 juillet » */
export const frLong = (iso: string) =>
  dayOf(iso) ? cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) : '—';

/** « 13 juil. » */
export const frDay = (iso: string) =>
  dayOf(iso) ? fromISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';

export const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/* ---------- La cadence d'une tête ----------
   Le juge vit dans `shared/cadence.ts` — Ma Couronne le lit aussi (l'accueil
   prédit la prochaine séance). Ré-exporté ici pour les écrans du domaine. */
export { predictNextVisit, cadenceLabel, type Cadence } from '../../../../shared/cadence';

/** Écart relatif éditorial : « aujourd'hui », « il y a 4 j », « il y a 2 mois ». */
export function relDays(iso: string): string {
  const diff = Math.round((Date.now() - fromISO(iso).getTime()) / 86400000);
  if (diff <= 0) return 'aujourd’hui';
  if (diff === 1) return 'hier';
  if (diff < 30) return `il y a ${diff} j`;
  const months = Math.round(diff / 30);
  return `il y a ${months} mois`;
}

/* ---------- Rendez-vous ---------- */
export const apptServices = (a: Appointment, byId: Map<string, Service>): Service[] =>
  a.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);

/** Le prix d'une prestation POUR CE RENDEZ-VOUS : celui de la longueur
    travaillée quand le rituel en porte une, son prix catalogue sinon.

    Le rendez-vous connaît sa longueur — elle est inscrite dessus. Aucun contexte
    cliente n'est donc nécessaire ici, et ces totaux restent lisibles partout
    (carnet, synthèse, impayés) sans que chaque écran ait à retrouver la fiche. */
export const svcPriceForAppt = (a: Appointment, s: Service): number =>
  (a.longueur ? s.prixParLongueur?.[a.longueur] : undefined) ?? s.priceXof;

export const apptDurationMin = (a: Appointment, byId: Map<string, Service>) =>
  /* ① CE QUI EST ÉCRIT SUR LE RENDEZ-VOUS fait foi — 1er septembre 2026. Il
     porte la durée qu'on lui a donnée à la pose, calibre compris. Voir
     `Appointment.dureeMin` : le passé ne se recalcule pas.
     ② ③ Sinon la grille par longueur, sinon le catalogue : c'est le calcul
     d'avant, mot pour mot, et c'est lui que lisent tous les rendez-vous
     posés avant cette règle. */
  a.dureeMin
  || apptServices(a, byId).reduce(
    (sum, s) => sum + ((a.longueur ? s.dureeParLongueur?.[a.longueur] : undefined) ?? s.durationMin),
    0,
  ) || 60;

/* Série multi-séances : la prestation n'est facturée qu'UNE fois.
   Le montant est porté par la séance 1 ; les séances suivantes valent 0
   (partout : tableau de bord, carnet, synthèse, fidélité, impayés). */
/** LE PRIX D'UNE LIGNE APRÈS SA PROPRE REMISE — pourcentage d'abord, francs
    ensuite, jamais négatif. `i` est la position dans `serviceIds`, PAS dans la
    liste des prestations retrouvées : `apptServices` écarte les fiches
    disparues du catalogue, et les deux index divergent dès qu'un rituel ancien
    en porte une. Prendre le mauvais index appliquerait la remise au geste
    voisin — en silence. */
export const remiseDeLigne = (a: Appointment, i: number): { pct: number; xof: number } => {
  const r = a.remisesLignes?.[i];
  return { pct: Math.max(0, Math.min(100, r?.pct ?? 0)), xof: Math.max(0, r?.xof ?? 0) };
};

/** Ce que vaut la prestation à la position `i` une fois sa remise appliquée. */
export const svcNetForAppt = (a: Appointment, s: Service, i: number): number => {
  const { pct, xof } = remiseDeLigne(a, i);
  return Math.max(0, Math.round(svcPriceForAppt(a, s) * (1 - pct / 100)) - xof);
};

export const apptTotalXof = (a: Appointment, byId: Map<string, Service>) => {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  /* Un prix figé l'emporte sur le catalogue : le rituel a été facturé À CE
     PRIX-LÀ, et le catalogue a bougé depuis. Le relire au tarif du jour
     réécrirait l'histoire — c'est ce que faisaient les RDV repris de l'ancien
     ERP, à 3 M F près. La règle des séries reste au-dessus : une séance 2+ ne
     vaut rien, prix figé ou non. */
  if (typeof a.priceXof === 'number') return a.priceXof;
  /* Les remises de LIGNE se retranchent ici — avant la remise globale, qui les
     trouvera donc déjà déduites. On parcourt `serviceIds` et non la liste des
     prestations, pour que l'index de la remise soit le bon même si une fiche a
     disparu du catalogue. */
  return a.serviceIds.reduce((sum, id, i) => {
    const s = byId.get(id);
    return s ? sum + svcNetForAppt(a, s, i) : sum;
  }, 0);
};

/** Total après remise du RDV : le pourcentage d'abord, puis la remise en CFA.
    Jamais négatif — une remise en CFA supérieure au reste rend le rituel offert.

    UN FORFAIT PONCTUEL FAIT FOI et remplace tout le calcul : c'est le total que
    la Maison a promis pour l'ensemble des gestes. Rien ne s'y ajoute — on ne
    remise pas un prix déjà négocié. Tout ce qui ventile par prestation (mains,
    production, seuils, commissions, Bilan) répartit ce net au prorata et suit
    donc sans rien savoir du forfait. */
export const apptNetXof = (a: Appointment, byId: Map<string, Service>) => {
  /* La règle des séries passe avant tout : une séance 2+ ne vaut rien, forfait
     ou non — sinon un forfait se compterait une fois par séance. */
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(a.forfait.totalXof));
  return Math.max(0, Math.round(apptTotalXof(a, byId) * (1 - (a.discountPct ?? 0) / 100)) - (a.discountXof ?? 0));
};

/** LA COMMISSION DÉTAILLÉE D'UN MAÎTRE POUR UN MOIS — une seule porte.

    Extraite du tableau Personnel pour que le RUN de Paie l'utilise AUSSI
    (décision : le moteur détaillé fait foi, pas le forfait `commissionPct`). Le
    net de chaque rituel honoré est réparti entre ses prestations au prorata de
    ce que chacune vaut pour cette tête ; la part d'une prestation se divise entre
    ses mains ; le taux vient du barème par palier (ou du taux négocié du maître),
    et zéro pour qui n'est pas commissionné. La commission produits : les factures
    « produit » attribuées à ce maître × le taux produits. */
export function commissionDetaillee(
  m: StaffMember,
  month: string,
  args: {
    appts: readonly Appointment[];
    invoices: readonly Invoice[];
    byId: Map<string, Service>;
    team: readonly StaffMember[];
    branchId: string;
    rates: CommRates;
  },
): { presta: number; produit: number } {
  const { appts, invoices, byId, team, branchId, rates } = args;
  const paletteRate = (p: string) =>
    (p === 'Fondation' ? rates.fondation : p === 'Élévation' ? rates.elevation : rates.souverainete) / 100;
  const tauxDe = (x: StaffMember, palier: string) =>
    x.commissionne === true
      ? (x.commissionTauxPct !== undefined ? x.commissionTauxPct / 100 : paletteRate(palier))
      : 0;
  const linkedInv = new Set<string>();
  for (const a of appts) if (a.invoiceId) linkedInv.add(a.invoiceId);

  let presta = 0;
  let produit = 0;
  for (const a of appts) {
    if (a.branchId !== branchId || a.status !== 'honoré') continue;
    if (a.date.slice(0, 7) !== month || (a.seriesIndex && a.seriesIndex > 1)) continue;
    const net = apptNetXof(a, byId);
    const poids = a.serviceIds.map((id) => { const sv = byId.get(id); return sv ? svcPriceForAppt(a, sv) : 0; });
    const parts = splitByWeights(net, poids);
    a.serviceIds.forEach((id, i) => {
      const sv = byId.get(id);
      if (!sv) return;
      const mains = a.mains?.[i]?.length ? a.mains[i] : team.filter((x) => sameName(x.name, a.master)).map((x) => x.id);
      if (!mains.includes(m.id)) return;
      presta += Math.round((parts[i] / mains.length) * tauxDe(m, sv.palier));
    });
  }
  for (const i of invoices) {
    if (i.branchId !== branchId || i.kind !== 'facture' || i.status !== 'payée' || i.master !== m.name) continue;
    if (i.date.slice(0, 7) !== month) continue;
    if (i.lines.some((l) => l.label.startsWith('Règlement ·'))) continue;
    /* ── LE PRODUIT PAIE SA COMMISSION, MÊME AVEC UN RITUEL — 31 août 2026 ──
       « Le même shampooing rapporte la même chose, qu'il soit vendu pendant le
       rituel ou séparément » (Yéman).

       La règle sautait TOUTE facture liée à un rendez-vous, pour ne pas payer
       deux fois ce que la boucle des rituels a déjà compté. Elle emportait les
       produits avec elle : un shampooing vendu sur le ticket du rituel ne
       rapportait rien, le même vendu au comptoir si.

       On ne saute plus la pièce, on n'en compte que ce qui n'a pas déjà été
       payé : sur une facture liée, les seules LIGNES DE PRODUIT
       (`InvoiceLine.produitId`) ; sur une vente libre, la pièce entière comme
       avant — ses prestations n'ont aucun rendez-vous pour les compter.

       Les pièces d'AVANT ce jour n'ont pas de `produitId` : une facture liée
       en rend donc zéro, exactement ce qu'elle rendait hier. Rien ne bouge
       rétroactivement dans une paie déjà versée. */
    const assiette = linkedInv.has(i.id) ? totalProduitsXof(i) : invoiceTotal(i);
    if (assiette <= 0) continue;
    produit += Math.round(assiette * (rates.produits / 100));
  }
  return { presta, produit };
}

/* Date d'un règlement (jj/mm/aaaa OU ISO) → clé de mois « aaaa-mm », et → ISO
   « aaaa-mm-jj » pour la borne du jour. Les règlements de formation/abonnement
   se saisissent dans les deux formats ; ces deux helpers les unifient. */
const revMonthKey = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}`;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}` : '';
};
const revISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

type ReglementLite = { date: string; amountXof: number };
type PorteurDeReglements = { payments?: readonly ReglementLite[] };

/** LE CHIFFRE D'AFFAIRES D'UN MOIS — une seule porte pour TOUS les écrans.

    L'histoire : le même mois affichait des CA différents selon l'écran — la
    Synthèse comptait les abonnements (décidé le 3 août), le Dashboard, Analytics
    et le Bilan les oubliaient ; le Bilan seul écartait les caisses hors bilan.
    La composition vit donc ICI, appelée partout : factures (versement par
    versement, à leur mois) + rituels honorés non encore facturés + règlements de
    formation + règlements d'abonnement.

    `cut` (aaaa-mm-jj) borne au jour, pour la comparaison mois-à-date des KPI.
    `exclureHorsBilan` écarte les versements tombés dans une caisse hors bilan —
    c'est le CA des livres officiels (le Bilan mensuel), pas la trésorerie réelle
    des écrans opérationnels. */
export function revenuDuMois(
  args: {
    invoices: readonly Invoice[];
    appts: readonly Appointment[];
    byId: Map<string, Service>;
    apprenants: readonly PorteurDeReglements[];
    abonnes: readonly PorteurDeReglements[];
    branchId: string;
    cashboxes?: readonly Cashbox[];
  },
  mk: string,
  opts: { cut?: string; exclureHorsBilan?: boolean } = {},
): number {
  const { invoices, appts, byId, apprenants, abonnes, branchId, cashboxes } = args;
  const { cut, exclureHorsBilan } = opts;
  const exclues = exclureHorsBilan ? caissesHorsBilan(cashboxes ?? [], branchId) : null;

  const factures = invoices
    .filter((i) => i.branchId === branchId && i.kind === 'facture')
    .reduce((s, i) => s + invoiceReglements(i)
      .filter((p) => (p.date ?? '').startsWith(mk)
        && (!cut || (p.date ?? '') <= cut)
        && (!exclues || !exclues.has(p.cashbox ?? '')))
      .reduce((n, p) => n + p.amountXof, 0), 0);

  /* Rituels honorés SANS facture d'encaissement : celle-ci, quand elle existe,
     les compte déjà (jamais deux fois). */
  const rituels = appts
    .filter((a) => a.branchId === branchId && a.status === 'honoré' && !a.invoiceId
      && a.date.slice(0, 7) === mk && (!cut || a.date <= cut))
    .reduce((s, a) => s + apptNetXof(a, byId), 0);

  const flux = (porteurs: readonly PorteurDeReglements[], positifSeul: boolean): number =>
    porteurs
      .flatMap((p) => p.payments ?? [])
      .filter((r) => (!positifSeul || r.amountXof > 0)
        && revMonthKey(r.date) === mk && (!cut || revISO(r.date) <= cut))
      .reduce((s, r) => s + r.amountXof, 0);

  return factures + rituels + flux(apprenants, false) + flux(abonnes, true);
}

/* ---------- Les factures suivent le rituel ----------

   MODIFIER UN RITUEL DÉJÀ ENCAISSÉ laissait sa facture telle qu'elle était
   née : les lignes disaient les prestations du jour de l'encaissement, le
   Carnet disait celles d'aujourd'hui — deux documents pour la même séance,
   qui ne racontaient plus la même histoire (demande de Yéman, 11 août).

   LA RÈGLE D'OR : L'ARGENT REÇU NE BOUGE PAS. La pièce atteste un paiement ;
   son TOTAL est intouchable — c'est ce qui est entré dans la caisse, et le
   chiffre d'affaires le lit. Seules les LIGNES se reconforment : chaque
   prestation d'aujourd'hui à son PRIX PLEIN, l'écart en remise visible (ou en
   ligne d'ajustement s'il joue dans l'autre sens). Si le nouveau net dépasse
   ce qui a été payé, la différence vit où elle a toujours vécu : au RESTE dû
   du rituel, pas dans une facture réécrite.

   Une pièce de règlement PARTIEL (une seule ligne « Règlement · … ») ne se
   détaille pas après coup — un argent qui n'a couvert qu'une part ne se
   ventile pas ; seul son libellé suit les prestations du jour. */
const LIGNE_AJUSTEMENT = 'Ajustement · prix consenti ce jour-là';

/** Ce qu'un alignement CHANGERAIT sur une pièce — de quoi montrer avant d'écrire. */
export type EcartDeConformite = { avant: Invoice; apres: Invoice };

/** LE CONTEXTE TARIFAIRE D'UN RITUEL — une seule définition, pour tous ceux qui
    lisent un rendez-vous PERSISTÉ (la réparation en masse, un contrôle, un
    export). La modale garde le sien, qui suit ce que la Maison change à
    l'écran ; mais la RÉSOLUTION DE LA LONGUEUR est la même des deux côtés, et
    c'est là que tout se joue.

    C'est précisément l'absence de cette résolution qui a produit les factures
    au prorata : la caisse appelait `pricingOf(client, …)` sans la longueur
    FIGÉE du rituel, toute prestation à grille retombait sur son prix « court »,
    la somme des prix pleins passait sous le net encaissé, et la branche de
    secours ventilait le total au prorata. Deux écrans, deux prix pour la même
    tête. Une seule définition, et ils ne peuvent plus se contredire. */
export function tarifsDuRituel(
  appt: Appointment,
  ctx: {
    client?: Pick<Client, 'lockCount' | 'priceCoef' | 'prixFixes' | 'longueur'>;
    bands: ModelBand[];
    sets: Parameters<typeof pricingOf>[2];
    cats: Parameters<typeof pricingOf>[3];
    byId: Map<string, Service>;
    tousServices: readonly Service[];
    produits: readonly { id: string; priceXof: number }[];
  },
) {
  const pricing = {
    ...pricingOf(ctx.client, ctx.bands, ctx.sets, ctx.cats),
    /* Même ordre que la modale : la longueur figée du rituel prime — relire
       mars ne le retarife pas —, puis celle de la fiche, puis Mi-Long. */
    longueur: appt.longueur ?? ctx.client?.longueur ?? 'mi-long',
  };
  const chosen = apptServices(appt, ctx.byId);
  const personnalise = isPersonalized(pricing) && chosen.length > 0;
  const prixPlein = (sv: Service) =>
    personnalise ? personalPriceXof(sv, pricing, ctx.tousServices, ctx.produits) : prixDeBase(sv, pricing);
  const gesteDe = (sv: Service) => remiseGestePct(sv, pricing, chosen);
  return { pricing, chosen, prixPlein, gesteDe };
}

export function alignerFacturesDuRituel(
  appt: Appointment,
  byId: Map<string, Service>,
  /* LE PRIX PLEIN DE CHAQUE PRESTATION, AU TARIF DE LA CLIENTE (12 août). La
     première version lisait `svcPriceForAppt` — longueur et catalogue
     seulement : planchers par calibre, tarif au lock et Juste Prix ignorés,
     et une pièce Mini payée 90 000 F se réécrivait « 45 000 + Ajustement
     45 000 ». L'appelant passe désormais SON contexte tarifaire (la modale
     RDV passe le sien, longueur figée comprise) ; le repli reste l'ancien
     calcul pour ne rien casser d'un appel nu. */
  /* LE PRIX PLEIN — celui d'avant le geste de la Maison. Voir `gesteOf`. */
  priceOf: (s: Service) => number = (s) => svcPriceForAppt(appt, s),
  /** LES PRODUITS DE LA GAMME — ce qu'il ne faut JAMAIS réécrire (16 août).
      Le garde des pièces mixtes reconnaissait une ligne de rituel à son NOM
      EXACT au catalogue. Un nom se corrige, et le lien casse alors EN SILENCE,
      pour toujours : la pièce de reprise de Prisca dit « … · shampoing
      apporté » quand le catalogue dit « … · Shampoing apporté », et elle a
      cessé de suivre son rituel sans que rien ne le signale.

      On renverse donc la charge de la preuve : au lieu de reconnaître ce qu'on
      sait reconstruire, on reconnaît ce qu'il faut PRÉSERVER. Un flacon reste
      un flacon quel que soit l'âge de la pièce ; une prestation renommée
      redevient réparable. Sans cette liste, l'ancienne règle stricte
      s'applique — un appel nu ne peut pas faire disparaître un produit. */
  produits: readonly { name: string }[] = [],
  /** LE GESTE DE LA MAISON, EN POURCENTAGE — 16 août 2026.

      « Kèmi doit savoir que le shampoing est à 10 000 F et qu'elle a une
      remise de 100 %. Je ne veux pas simplement le montant 0 F. Je veux que ça
      suive l'écriture qu'il y a sur le RDV » (Yéman).

      La pièce recevait le prix DÉJÀ diminué du geste — donc « 0 F », un cadeau
      rendu invisible. Un cadeau qu'on ne voit pas n'est pas reçu : la cliente
      lit un shampoing gratuit sans savoir qu'il valait 10 000 F. La ligne
      porte désormais le PRIX PLEIN et sa remise, comme la modale du rituel
      l'écrit — `unitXof` × (1 − `discountPct`) vaut exactement ce que la ligne
      valait avant, donc LE TOTAL NE BOUGE PAS. */
  gesteOf: (s: Service) => number = () => 0,
  /** SIMULER — calculer sans rien écrire. Une réparation en masse doit pouvoir
      se MONTRER avant de s'appliquer : c'est la même mécanique qui juge et qui
      répare, donc l'aperçu ne peut pas mentir sur ce qui va se passer. */
  options?: { simuler?: boolean },
): EcartDeConformite[] {
  /* LE LIEN SE LIT DANS LES DEUX SENS — 16 août 2026. On ne le cherchait que
     depuis le RENDEZ-VOUS (`invoiceId`, `payments[].invoiceId`) ; or « Facture
     à envoyer » (`factureAEnvoyer`) pose le lien sur LA PIÈCE — `apptId` — et
     n'écrit rien en retour sur le rituel. Une facture émise par ce chemin était
     donc invisible à l'alignement : elle réclamait indéfiniment les prestations
     du jour de son émission. C'est le second verrou du cas Habibath. */
  const ids = new Set<string>();
  if (appt.invoiceId) ids.add(appt.invoiceId);
  for (const p of appt.payments ?? []) if (p.invoiceId) ids.add(p.invoiceId);
  const liee = (inv: Invoice): boolean => ids.has(inv.id) || inv.apptId === appt.id;
  const services = apptServices(appt, byId);
  if (services.length === 0) return [];
  /* Tous les noms de prestations du catalogue — pour reconnaître ce qui, sur
     la pièce, est une ligne de RITUEL (même d'une composition passée). */
  const nomsPrestations = new Set<string>();
  for (const s of byId.values()) nomsPrestations.add(s.name);
  const nomsProduits = new Set(produits.map((p) => p.name));

  const conformer = (inv: Invoice): Invoice => {
    if (!liee(inv) || inv.kind !== 'facture') return inv;
    /* UNE PIÈCE PAS ENCORE PAYÉE SUIT LE RITUEL, TOTAL COMPRIS — 16 août 2026.
       Le garde ne laissait passer que les factures `payée` : une facture
       ENVOYÉE — donc une réclamation, pas une attestation — restait figée sur
       les prestations du jour de son émission. Yéman a modifié le rituel de
       Habibath, la pièce a continué de réclamer l'ancien.

       La règle d'or ne s'applique QU'À L'ARGENT REÇU : sur une pièce payée, le
       total est intouchable et seules les lignes se reconforment. Sur une pièce
       qui n'a rien encaissé, il n'y a aucun argent à protéger — et une
       réclamation qui ne demande pas ce qui est dû est simplement fausse. Elle
       se réécrit donc ENTIÈREMENT, comme si on l'émettait aujourd'hui. */
    const payee = inv.status === 'payée';
    if (!payee && inv.status !== 'envoyée' && inv.status !== 'brouillon') return inv;
    const total = invoiceTotal(inv);

    if (inv.lines.length === 1 && inv.lines[0].label.startsWith('Règlement ·')) {
      const label = `Règlement · ${apptLabel(appt, byId)}`;
      if (inv.lines[0].label === label) return inv;
      return { ...inv, lines: [{ ...inv.lines[0], label }] };
    }

    /* UN FORFAIT DONNE SON NOM À LA PIÈCE (règle du 8 août) : c'est le prix
       négocié que la cliente relira, pas la composition. On ne le redétaille
       pas — changer les gestes ne change pas ce qu'elle a accepté. */
    if (appt.forfait && inv.lines.length === 1) return inv;

    /* UNE PIÈCE MIXTE NE SE RÉÉCRIT PAS (12 août). Le panier de la Caisse pose
       produits et formations sur LA MÊME facture que le rituel qu'elle solde ;
       la réécrire depuis les seuls services effaçait ces lignes du document
       payé — le flacon disparaissait du PDF, et le papier ne correspondait
       plus au mouvement de stock. On ne reconforme que ce qu'on sait
       reconstruire : si une ligne n'est ni une prestation du catalogue ni
       l'ajustement, la pièce reste entière. */
    /* UNE PIÈCE À UNE SEULE LIGNE EST LE RITUEL LUI-MÊME — 16 août 2026.
       « Quand je modifie une ligne d'un RDV, modifie la ligne en facturation
       même si c'est déjà payé » (Yéman). Le garde du dessus la retenait :
       l'encaissement d'un rituel à PLUSIEURS gestes qui n'a pas pu se détailler
       (acompte, avoir, règlement en deux fois) pose UNE ligne portant les noms
       COLLÉS — « KƆKLƆ™ … + SÍNSIN™ … ». Ce libellé-là n'est le nom d'aucune
       prestation du catalogue : la pièce était donc jugée irreconstructible et
       ne suivait jamais le rituel, quoi qu'on y change.

       Or à ce point du code, une pièce d'UNE ligne ne peut plus être qu'un
       rituel : le règlement partiel (« Règlement · … ») et le forfait sont
       sortis juste au-dessus, et une pièce de produits seuls n'est pas LIÉE à
       un rendez-vous. Elle se reconforme donc — au prix plein de chaque geste,
       l'écart en remise ou en ajustement, et LE TOTAL NE BOUGE PAS D'UN FRANC.
       Le chiffre d'affaires ne bouge pas davantage : il se lit sur le rituel
       (`apptNetXof`), que ceci ne touche pas. */
    const reconstructible = inv.lines.length === 1
      || inv.lines.every((l) => nomsPrestations.has(l.label)
        || l.label === LIGNE_AJUSTEMENT
        /* La règle renversée : ce qui n'est pas un produit de la Gamme est un
           geste, même si son nom a changé depuis. */
        || (nomsProduits.size > 0 && !nomsProduits.has(l.label)));
    if (!reconstructible) return inv;

    /* LES LIGNES DISENT LES VRAIS PRIX, L'ÉCART SE DIT EN REMISE. La première
       version répartissait le total AU PRORATA : 40 000 F sur deux gestes
       donnaient 9 697 et 30 303 — exacts en somme, mais correspondant à aucun
       prix réel (« des prix bizarres qui ne veulent rien dire », Yéman,
       11 août). C'est la présentation de l'ENCAISSEMENT qu'on reproduit :
       chaque prestation à son prix plein, et si leur somme dépasse le total
       payé, l'écart est une remise visible ; si elle est en dessous, une
       ligne d'ajustement le dit (patron de la reprise 0018). Le total, lui,
       ne bouge toujours pas d'un franc. */
    const pleins = services.map((s) => Math.max(0, Math.round(priceOf(s))));
    /* LA REMISE DE LA LIGNE, SUR LA LIGNE. Le geste automatique de la Maison
       (une prestation offerte par la règle du Catalogue) l'emporte quand il
       joue : on ne remise pas ce qui est déjà donné. Sinon c'est la remise
       posée à la main au rituel qui s'écrit — et sa part en FRANCS la suit,
       parce qu'un « 5 000 F de moins » traduit en pourcentage donnerait un
       nombre à virgule que personne ne relit.

       L'index vient de `serviceIds`, pas de `services` : les deux divergent dès
       qu'une fiche a disparu du catalogue, et la remise irait au geste voisin. */
    const posRituel = services.map((sv) => appt.serviceIds.indexOf(sv.id));
    const mains2 = services.map((_, i) => remiseDeLigne(appt, posRituel[i] >= 0 ? posRituel[i] : i));
    const gestes = services.map((s, i) => {
      const auto = Math.max(0, Math.min(100, Math.round(gesteOf(s))));
      return auto > 0 ? auto : Math.round(mains2[i].pct);
    });
    const francs = services.map((s, i) => (Math.round(gesteOf(s)) > 0 ? 0 : Math.round(mains2[i].xof)));
    /* `gross` est ce que les lignes valent VRAIMENT — geste déduit. C'est lui
       qu'on compare au total payé, sinon le geste serait compté deux fois :
       une fois sur la ligne, une fois dans la remise globale. */
    const gross = pleins.reduce((a, p, i) => a + Math.max(0, Math.round(p * (1 - gestes[i] / 100)) - francs[i]), 0);
    const lines = services.map((s, i) => ({
      id: `il-${inv.id}-${i}`, label: s.name, qty: 1, unitXof: pleins[i], discountPct: gestes[i],
      ...(francs[i] > 0 ? { discountXof: francs[i] } : {}),
    }));
    let remiseXof: number | undefined;
    if (!payee) {
      /* RIEN N'EST ENTRÉ : la pièce vaut ce que vaut le rituel AUJOURD'HUI —
         mêmes lignes, même remise et même total qu'une facture émise à
         l'instant (`factureAEnvoyer`). Pas de ligne d'ajustement : il n'y a
         pas d'écart à justifier, seulement un montant à réclamer. */
      const net = apptNetXof(appt, byId);
      remiseXof = gross > net ? gross - net : undefined;
    } else if (gross > total) {
      remiseXof = gross - total;
    } else if (gross < total) {
      lines.push({ id: `il-${inv.id}-adj`, label: LIGNE_AJUSTEMENT, qty: 1, unitXof: total - gross, discountPct: 0 });
    }
    /* La remise du compte famille se NOMME sur la pièce — la cliente doit lire
       d'où vient son avantage, pas un « remise » anonyme. */
    const discountLabel = remiseXof && appt.remiseFamille ? 'Remise famille' : undefined;
    /* Idempotent : mêmes prestations, mêmes montants, même remise → on ne
       réécrit rien, la synchronisation n'a pas à porter un faux changement. */
    const deja = inv.lines.length === lines.length
      && (inv.globalDiscountPct ?? 0) === 0
      && (inv.globalDiscountXof ?? 0) === (remiseXof ?? 0)
      && (inv.discountLabel ?? undefined) === discountLabel
      && inv.lines.every((l, i) => l.label === lines[i].label
        && l.qty * l.unitXof === lines[i].unitXof
        && (l.discountPct ?? 0) === lines[i].discountPct
        /* La remise en FRANCS compte aussi — sans elle, corriger un « −20 000 F »
           en « −15 000 F » passait pour « déjà conforme » et ne s'écrivait pas. */
        && (l.discountXof ?? 0) === (lines[i].discountXof ?? 0));
    if (deja) return inv;
    return { ...inv, lines, globalDiscountPct: 0, globalDiscountXof: remiseXof, discountLabel };
  };

  /* `conformer` rend l'objet REÇU quand il n'a rien à corriger (garde
     d'idempotence plus haut) : l'identité de référence suffit donc à repérer
     ce qui bouge, sans comparer champ par champ. */
  const ecarts: EcartDeConformite[] = [];
  for (const inv of invoicesStore.get()) {
    const apres = conformer(inv);
    if (apres !== inv) ecarts.push({ avant: inv, apres });
  }
  if (!options?.simuler && ecarts.length > 0) invoicesStore.set((prev) => prev.map(conformer));
  return ecarts;
}

/** Le nom d'un forfait ponctuel — « Forfait » quand la Maison n'en a pas donné. */
export const forfaitLabel = (f: NonNullable<Appointment['forfait']>): string => f.nom?.trim() || 'Forfait';

/** Le taux que ce forfait représente, en % du prix plein consenti ce jour-là. */
export const forfaitTauxPct = (f: NonNullable<Appointment['forfait']>): number =>
  f.baseXof > 0 ? Math.max(0, (1 - f.totalXof / f.baseXof) * 100) : 0;

/** Facteur de remise EFFECTIF d'un RDV (0–1) — le pourcentage ET la remise en
    CFA, cette dernière répartie au prorata des prestations. À utiliser pour
    toute ventilation par prestation ou par maître : appliquer seulement
    `discountPct` surévaluerait le chiffre d'affaires dès qu'une remise manuelle
    existe, et les ventilations ne sommeraient plus au net encaissé. */
export const apptDiscountFactor = (a: Appointment, byId: Map<string, Service>): number => {
  const gross = apptTotalXof(a, byId);
  if (gross <= 0) return 0;
  return apptNetXof(a, byId) / gross;
};

/** Acompte CRÉDITABLE : seul un acompte VÉRIFIÉ reçu (depositConfirmed) compte.
    Un acompte simplement demandé (réservation en ligne, RDV pris au comptoir)
    n'a aucune preuve de paiement — le déduire ferait sous-encaisser le salon. */
export const apptDepositCreditXof = (a: Appointment) =>
  (a.depositConfirmed ? a.depositXof ?? 0 : 0);

/** Reste à encaisser : net − acompte VÉRIFIÉ − déjà encaissé (jamais négatif). */
export const apptDueXof = (a: Appointment, byId: Map<string, Service>) =>
  /* `apptPaidXof` lit le JOURNAL des versements quand il existe, et retombe sur
     `paidXof` sinon. Sans cela, des qu'un reglement s'inscrit au journal, cet
     ecran reclamerait un argent deja encaisse. */
  Math.max(0, apptNetXof(a, byId) - apptDepositCreditXof(a) - apptPaidXof(a));

/** État de règlement d'un RDV — support de la pastille payé/partiel/impayé/gratuit. */
export function apptPayState(a: Appointment, byId: Map<string, Service>): 'payé' | 'partiel' | 'impayé' | 'gratuit' {
  const net = apptNetXof(a, byId);
  if (net <= 0) return 'gratuit';
  const due = apptDueXof(a, byId);
  if (due <= 0) return 'payé';
  const paid = (a.paidXof ?? 0) + apptDepositCreditXof(a);
  return paid > 0 ? 'partiel' : 'impayé';
}

export const apptLabel = (a: Appointment, byId: Map<string, Service>) =>
  apptServices(a, byId).map((s) => s.name).join(' + ') || '—';

/** LE RITUEL RÉSUMÉ EN UNE LIGNE COURTE — pour les pièces où la place est
    comptée (relevé, facture : la colonne PRESTATION tient sur deux lignes).
    `apptLabel` colle TOUS les noms bout à bout ; sur le papier, la ligne était
    coupée net et une cliente lisait « KƆKLƆ · Le Shampoing » en face de
    75 000 F — le prix d'un rituel entier attribué au geste le moins cher
    (constaté par Yéman, 15 août). Ici, au-delà de trois prestations, le compte
    prend la parole : « A + B + 2 autres ». Rien n'est caché en silence. */
export const apptResume = (a: Appointment, byId: Map<string, Service>, max = 3) => {
  const noms = apptServices(a, byId).map((s) => s.name);
  if (!noms.length) return '—';
  if (noms.length <= max) return noms.join(' + ');
  const reste = noms.length - (max - 1);
  return `${noms.slice(0, max - 1).join(' + ')} + ${reste} autres`;
};

/* ---------- Rappel WhatsApp (cloche sur un RDV à venir) ----------
   Un seul endroit pour le message ET la fenêtre du rappel, partagé par
   Le Carnet, le Calendrier et le Tableau de bord — le libellé reste identique
   partout. `due` code l'urgence : « now » = dans l'heure (rappel H-1),
   « soon » = demain (rappel J-1), '' = plus lointain. */
const digitsOf = (p?: string) => (p ?? '').replace(/\D/g, '');

/* LA SIGNATURE A REJOINT `shared/identite` — 22 août 2026. Elle vivait ici,
   à côté du rappel WhatsApp, alors qu'elle appartient à l'identité de la
   Maison : l'écran des avis Google devra la poser sans traverser le carnet
   des clientes. Re-exportée pour les appelants d'avant. */
export { houseSignature };

export function apptReminder(
  a: Appointment,
  client: Client | undefined,
  byId: Map<string, Service>,
  picto?: string,
): { href: string | null; due: 'now' | 'soon' | ''; when: string } {
  const t = todayISO();
  const tomorrow = addDaysISO(t, 1);
  const when =
    a.date === t ? `aujourd'hui à ${a.time}`
    : a.date === tomorrow ? `demain à ${a.time}`
    : `${frDay(a.date)} à ${a.time}`;
  let due: 'now' | 'soon' | '' = '';
  if (a.date === t) {
    const now = new Date();
    const mins = timeToMin(a.time) - (now.getHours() * 60 + now.getMinutes());
    due = mins >= -15 && mins <= 90 ? 'now' : 'soon';
  } else if (a.date === tomorrow) {
    due = 'soon';
  }
  const digits = digitsOf(client?.phone);
  if (!digits) return { href: null, due, when };
  const first = (client?.name ?? '').split(' ')[0] || 'Madame';
  const svc = apptLabel(a, byId);
  const msg =
    `Bonjour ${first},\n` +
    `Petit rappel de la Maison MND : votre rendez-vous est prévu ${when}${svc && svc !== '—' ? ` (${svc})` : ''}.\n` +
    `Merci de nous prévenir en cas d'empêchement. À très vite.\n\n` +
    houseSignature(picto);
  return { href: `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, due, when };
}

/** Cloche de rappel WhatsApp : n'apparaît que sur un RDV À VENIR (confirmé ou en
    attente, date ≥ aujourd'hui) d'une cliente avec numéro. Un clic ouvre WhatsApp
    avec le message prêt à envoyer ET consigne le rappel. Réutilisée par Le Carnet,
    le Calendrier et le Tableau de bord.
    Deux rappels distincts par rendez-vous : « j1 » (la veille) et « h1 » (dans
    l'heure). Une fois le J-1 consigné la cloche se met en retrait ; elle se
    RALLUME d'elle-même à l'entrée dans la dernière heure, car le H-1 reste à
    envoyer. Un rappel consigné se renvoie quand même d'un clic — on ne verrouille
    rien, on se souvient seulement. */
export function ReminderBell({
  appt, client, byId, className, size = 15,
}: { appt: Appointment; client?: Client; byId: Map<string, Service>; className?: string; size?: number }) {
  const [sentKeys] = useRemindersSent();
  const { branch } = useBranch(); // le picto de la branche signe le message
  const upcoming =
    (appt.status === 'confirmé' || appt.status === 'en attente') && appt.date >= todayISO();
  const { href, due, when } = apptReminder(appt, client, byId, branch.pictogram ?? undefined);
  if (!upcoming || !client) return null;
  /* Sans numéro sur la fiche, la cloche disparaissait EN SILENCE — et on
     cherchait pourquoi telle cliente n'avait pas la sienne (question de Yéman,
     12 août). Un refus se motive : cloche barrée, pointillée, qui dit ce qui
     manque et mène à la fiche pour poser le numéro. */
  if (!href) {
    return (
      <a
        className={`trc-remind${className ? ` ${className}` : ''}`}
        data-off="1"
        href="#/customers"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        title={`Pas de numéro sur la fiche, le rappel WhatsApp du RDV ${when} ne peut pas partir. Ouvrez la fiche pour ajouter le numéro.`}
        aria-label="Pas de numéro sur la fiche, ouvrir le carnet de clientes"
      >
        <BellOff size={size} />
      </a>
    );
  }
  const kind: ReminderKind = due === 'now' ? 'h1' : 'j1';
  const sent = sentKeys.includes(reminderKey(appt.id, appt.date, kind));
  const label = kind === 'h1' ? 'dernier rappel (dans l’heure)' : 'rappel de la veille';
  return (
    <a
      className={`trc-remind${className ? ` ${className}` : ''}`}
      data-due={due}
      data-sent={sent ? '1' : undefined}
      href={href}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      onClick={(e) => { e.stopPropagation(); markReminderSent(appt.id, appt.date, kind); }}
      title={sent ? `Rappel déjà envoyé, RDV ${when}. Cliquez pour renvoyer.` : `Rappel WhatsApp, ${label}, RDV ${when}`}
      aria-label={sent ? 'Rappel WhatsApp déjà envoyé, renvoyer' : 'Envoyer un rappel WhatsApp'}
    >
      {sent ? <Check size={size} /> : <Bell size={size} />}
    </a>
  );
}

export function useServicesById(): Map<string, Service> {
  const [services] = useServices();
  return useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
}

export function useBranchClients(): Client[] {
  const { branch } = useBranch();
  const [clients] = useClients();
  return useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
}

export function useBranchAppointments(): Appointment[] {
  const { branch } = useBranch();
  const [appointments] = useAppointments();
  return useMemo(() => appointments.filter((a) => a.branchId === branch.id), [appointments, branch.id]);
}

/* ---------- Pastilles ---------- */
const STATUS_CLASS: Record<Appointment['status'], string> = {
  'confirmé': 'trc-pill--confirme',
  'en attente': 'trc-pill--attente',
  'honoré': 'trc-pill--honore',
  'annulé': 'trc-pill--annule',
};

export function StatusPill({ status }: { status: Appointment['status'] }) {
  return <span className={`trc-pill ${STATUS_CLASS[status]}`}>{status}</span>;
}

/* Pastille de règlement — verte (payé), cuivre (partiel), rouge (impayé) ; rien si gratuit. */
export function PayStatusPill({ a, byId }: { a: Appointment; byId: Map<string, Service> }) {
  const state = apptPayState(a, byId);
  if (state === 'gratuit') return null;
  /* copper-700, pas le cuivre brut : à cette taille sur fond clair, le cuivre
     brut tombe à 3,1:1 — sous le seuil AA (4,5:1). */
  const color = state === 'payé' ? 'var(--trf-success)' : state === 'partiel' ? 'var(--copper-700)' : '#8f3b30';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-pill)',
        padding: '2px 7px',
        border: `1px solid ${color}`,
        color,
        whiteSpace: 'nowrap',
        lineHeight: 1.35,
      }}
    >
      {state}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = { couronne: 'Ma Couronne', consultation: 'Consultation', trone: 'Le Trône' };

export function SourceBadge({ source }: { source?: Appointment['source'] }) {
  if (!source || source === 'trone') return null;
  return <span className={`trc-src ${source === 'consultation' ? 'trc-src--indigo' : ''}`}>{SOURCE_LABEL[source]}</span>;
}

/* ---------- Avatar (photo ou initiales) ---------- */
/** Lit un fichier image et le RÉDUIT avant stockage : la photo part en JSONB
    synchronisé (Supabase) puis vit dans localStorage — une photo de téléphone
    brute (3–5 Mo en base64) saturerait les deux. On la ramène à `max` px de côté,
    en JPEG : un avatar net pèse alors quelques dizaines de Ko. Repli sur le
    data-URL d'origine si le canvas n'est pas disponible. */
/* LA VIGNETTE SUFFIT — 29 août 2026. Ce réducteur écrivait des images de
   512 px dans la fiche cliente, en base64 ; elles s'affichent dans un rond de
   48. Cinquante photos ainsi rangées faisaient 2 874 ko, soit 98,5 % de tout ce
   que l'application télécharge à CHAQUE ouverture, et le trafic mensuel de la
   Maison y passait entier. Le défaut descend donc à `COTE_VIGNETTE` (192 px),
   et rien ne change à l'écran. Voir `shared/photo.ts`.

   L'appel garde son nom et sa signature : un écran qui a besoin d'un plus
   grand côté le passe explicitement et n'est pas touché. */
export async function readImageDownscaled(file: File, max = COTE_VIGNETTE): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible.'));
      i.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', QUALITE_VIGNETTE);
  } catch {
    return dataUrl; // un GIF animé ou un format exotique : on garde l'original plutôt que rien
  }
}

export function Avatar({ client, size = 36, ouvrable = false }: {
  client: Pick<Client, 'name' | 'photo'>;
  size?: number;
  /* OUVRIR LA PHOTO (26 août) — un visage en 36 pixels ne se reconnaît pas.
     Opt-in : là où la ligne entière est cliquable (Carnet, Calendrier), on ne
     détourne pas le geste sans le vouloir. */
  ouvrable?: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  if (client.photo) {
    const photo = client.photo;
    return (
      <>
        <img
          className="trc-avatar"
          src={photo}
          alt={ouvrable ? `Photo de ${client.name}, agrandir` : ''}
          width={size}
          height={size}
          style={{ width: size, height: size, cursor: ouvrable ? 'zoom-in' : undefined }}
          onClick={ouvrable ? (e) => { e.stopPropagation(); setOuverte(true); } : undefined}
        />
        {ouverte && (
          <div
            role="dialog"
            aria-label={`Photo de ${client.name}`}
            onClick={(e) => { e.stopPropagation(); setOuverte(false); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(20,20,27,.92)',
              display: 'grid', placeItems: 'center', padding: 24, cursor: 'zoom-out',
            }}
          >
            <img
              src={photo}
              alt={`Photo de ${client.name}`}
              style={{ maxWidth: '92vw', maxHeight: '82vh', borderRadius: 4, boxShadow: '0 18px 60px rgba(0,0,0,.5)' }}
            />
            <div style={{
              marginTop: 14, fontFamily: 'var(--font-serif)', fontSize: 20, color: '#EFEAE0', textAlign: 'center',
            }}>
              {client.name}
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#B9B5C6', marginTop: 4 }}>
                toucher l’écran pour fermer
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <span className="trc-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

/* ---------- Les locks de la tête, dans la modale du rituel ----------
   ILS APPARTIENNENT À LA FICHE, PAS AU RENDEZ-VOUS : une tête ne change pas de
   nombre de locks d'un rituel à l'autre. Saisis ici, ils s'inscrivent donc sur
   la cliente — et le rituel se retarife aussitôt, puisque le barème du modèle
   les lit.

   L'écriture attend la sortie du champ. À chaque frappe, elle partirait à la
   base : « 3 », « 34 », « 340 » — trois écritures pour un seul chiffre. */
function LocksDeLaTete({ client, calibre }: { client?: Client; calibre?: string }) {
  const initial = client?.lockCount != null ? String(client.lockCount) : '';
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);
  /* LE BROUILLON SUIT LA FICHE — même patron que la cellule de la liste
     (LocksCell). Sans cela, il gardait sa valeur DE MONTAGE : changer de
     cliente dans la même modale montrait les locks de la précédente, et un
     comptage corrigé sur la fiche à côté n'apparaissait jamais ici — les deux
     champs parlaient de la même tête sans se lire (constaté le 11 août). Hors
     focus seulement : on n'écrase pas une frappe en cours. */
  useEffect(() => {
    if (!focused) setDraft(client?.lockCount != null ? String(client.lockCount) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, client?.lockCount, focused]);

  const inscrire = () => {
    setFocused(false);
    if (!client) return;
    const t = draft.trim();
    if (t === '') {
      if (client.lockCount === undefined) return;
      clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, lockCount: undefined } : c)));
      return;
    }
    const n = Math.round(Number(t.replace(/[^\d]/g, '')));
    /* Une saisie qui n'est pas un compte ne s'écrit pas — on remet ce que la
       fiche portait plutôt que d'effacer en silence. */
    if (!Number.isFinite(n) || n <= 0) { setDraft(initial); return; }
    if (n === client.lockCount) return;
    clientsStore.set((prev) => prev.map((c) => (c.id === client.id ? { ...c, lockCount: n } : c)));
  };

  return (
    <Field label="Ses locks">
      <Input
        value={draft}
        inputMode="numeric"
        disabled={!client}
        placeholder={client ? 'à compter' : '—'}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={inscrire}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        style={{ textAlign: 'right' }}
      />
      <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.45 }}>
        {!client ? 'Cliente de passage' : calibre ?? 'Sans eux, prix « dès »'}
      </div>
    </Field>
  );
}

/* ---------- Tiroir latéral ----------
   LA LARGEUR SE RETIENT. Le tiroir tenait 680 px, dessiné pour un portable ; sur
   l'écran du comptoir il laissait les deux tiers de la page vides et obligeait à
   faire défiler une fiche qui aurait tenu d'un coup d'œil. Le choix est gardé
   d'une fiche à l'autre : le régler à chaque ouverture, ce serait ne pas l'avoir
   réglé. */
export const ficheElargieStore = createStore<boolean>('mnd_fiche_elargie', false);

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const [elargi, setElargi] = useStore(ficheElargieStore);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="trc-drawer-veil" onClick={onClose} />
      <div className={`trc-drawer${elargi ? ' is-large' : ''}`}>
        <button
          type="button"
          className="trc-drawer__wide"
          onClick={() => setElargi((v) => !v)}
          title={elargi ? 'Revenir au tiroir étroit' : 'Occuper toute la largeur de l’écran'}
        >
          {elargi ? 'Réduire' : 'Élargir'}
        </button>
        {children}
      </div>
    </>
  );
}

/* ---------- Créneaux 07:00 → 21:30 ----------
   Toute l'amplitude d'ouverture possible (le samedi ferme à 20h, certains
   soirs plus tard) : la liste s'arrêtait à 17:30, d'où l'impossibilité de
   poser un rendez-vous en soirée. La modale accepte de toute façon une heure
   hors liste (option injectée), mais le menu doit couvrir les heures réelles. */
export const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h < 22; h++) {
    out.push(`${pad2(h)}:00`, `${pad2(h)}:30`);
  }
  return out;
})();

/* ---------- Modale rendez-vous — création & modification ---------- */
/* UNE PASTILLE DE CHOIX — la même partout dans la modale de rendez-vous.

   Elle porte son style AVEC ELLE, et c'est tout l'objet : les pastilles
   utilisaient `trv-palier-chip`, une classe qui vit dans `vente.css`. Cette
   feuille n'est chargée que sur les écrans de Vente — jamais sur le Carnet, le
   Calendrier ni le Tableau de bord, qui ouvrent pourtant la même modale. Les
   pastilles y restaient brutes et « actif » ne peignait rien : on désignait des
   mains et une longueur sans jamais voir lesquelles étaient retenues, alors
   qu'elles commandent la commission, la prime et le prix.

   Une modale partagée par quatre écrans ne peut pas dépendre de la feuille d'un
   domaine. */
/* LES QUATRE PALIERS DE LA MODALE (14 août, maquette validée). Un rendez-vous
   se lit comme une phrase — qui, quoi, quand, combien — et les numéros disent
   une vraie séquence : l'ordre dans lequel la main remplit, et celui dans
   lequel on relit un rituel au comptoir. */
/** « 1 h 30 » · « 45 min » — la durée d'un rituel, dite court. */
const fmtDureeCourte = (min: number): string => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
};

function PalierRdv({ n, titre, aide }: { n: number; titre: string; aide?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
      <span style={{
        flex: 'none', width: 21, height: 21, borderRadius: '50%', border: '1px solid var(--color-copper)',
        color: 'var(--copper-700)', fontFamily: 'var(--font-serif)', fontSize: 11.5,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{titre}</span>
      {aide && <span className="mnd-muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{aide}</span>}
    </div>
  );
}

function ChipChoix({ actif, onClick, title, children, petit }: {
  actif: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  petit?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={actif}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: actif ? 'var(--color-copper)' : 'var(--surface-card)',
        color: actif ? 'var(--color-ivoire)' : 'var(--color-indigo)',
        border: `1px solid ${actif ? 'var(--color-copper)' : 'var(--hairline)'}`,
        borderRadius: 4,
        padding: petit ? '4px 11px' : '10px 14px',
        fontFamily: petit ? 'var(--font-sans)' : 'var(--font-serif)',
        fontSize: petit ? 11.5 : 15,
        transition: 'var(--transition-base)',
      }}
    >
      {actif && <span aria-hidden="true" style={{ fontSize: petit ? 10 : 12 }}>✓</span>}
      {children}
    </button>
  );
}

export type RdvInitial = Partial<Pick<Appointment, 'clientId' | 'serviceIds' | 'date' | 'time' | 'master' | 'note'>>
  /** Le rituel déjà facturé dont ce nouveau rendez-vous est la séance suivante
      (15 août) — la modale s'ouvre déjà rattachée, il ne reste que la date. */
  & { suiteDe?: string };

const RDV_STATUSES: Appointment['status'][] = ['en attente', 'confirmé', 'honoré', 'annulé'];

export function RdvModal({
  onClose,
  initial,
  appt,
  title,
  onEncaisser,
  sansPrix,
}: {
  onClose: () => void;
  /** LA FICHE SANS SES MONTANTS. Un maître ouvre le rituel pour lire sa
      journée et désigner ses mains, pas pour lire le chiffre de la Maison.
      Le prix de chaque prestation, le total, la remise et l'acompte se
      taisent alors — le reste de la fiche fonctionne à l'identique. */
  sansPrix?: boolean;
  initial?: RdvInitial;
  /** Rendez-vous existant — la modale passe en mode modification (statut, suppression). */
  appt?: Appointment;
  title?: string;
  /** Encaisser depuis la modale — n'apparaît qu'en modification d'un RDV existant. */
  onEncaisser?: (a: Appointment) => void;
}) {
  const { branch, currency } = useBranch();
  const clients = useBranchClients();
  const branchAppts = useBranchAppointments();
  const [services] = useServices();
  /* Les produits de la Gamme — une composition de forfait peut en porter, et
     le moteur les compte désormais (12 août). */
  const [produitsGamme] = useProducts();
  const byId = useServicesById();

  const [clientId, setClientId] = useState(appt?.clientId ?? initial?.clientId ?? clients[0]?.id ?? '');
  /* La porte « Demander » du rituel — l'autre porte de la maquette du Fil. */
  const [demanderOuvert, setDemanderOuvert] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>(appt?.serviceIds ?? initial?.serviceIds ?? []);
  /* LES MAINS, prestation par prestation. Un tableau parallele a `serviceIds` :
     le rituel peut porter deux fois le meme geste, et pas forcement par les
     memes personnes. Vide sur une ligne = on retombe sur le maitre assigne. */
  const [mains, setMains] = useState<string[][]>(appt?.mains ?? []);
  /* LES PLIS (14 août, maquette validée par Yéman). Neuf fois sur dix c'est le
     maître au fauteuil qui exécute, et la note du carnet reste vide : ces deux
     blocs occupaient pourtant la moitié de l'écran. Ils se replient — et
     s'ouvrent d'eux-mêmes quand ils portent déjà quelque chose. */
  const [mainsOuvertes, setMainsOuvertes] = useState<string[]>([]);
  /* LES REMISES DE LIGNE — tableau parallèle à `serviceIds`, comme les mains. */
  const [remisesL, setRemisesL] = useState<({ pct?: number; xof?: number } | null)[]>(appt?.remisesLignes ?? []);
  const [remisesOuvertes, setRemisesOuvertes] = useState<string[]>([]);
  const [noteOuverte, setNoteOuverte] = useState(!!appt?.note?.trim());
  const [equipe] = useStaff();
  const mainsDe = (i: number) => mains[i] ?? [];
  const basculeMain = (i: number, staffId: string) => setMains((prev) => {
    const n = serviceIds.map((_, k) => prev[k] ?? []);
    n[i] = n[i].includes(staffId) ? n[i].filter((x) => x !== staffId) : [...n[i], staffId];
    return n;
  });
  const [date, setDate] = useState(appt?.date ?? initial?.date ?? todayISO());
  const [time, setTime] = useState(appt?.time ?? initial?.time ?? '09:00');
  /* LE MAÎTRE QUE LA MAISON A DÉSIGNÉ — 1er septembre 2026. Le premier de la
     liste n'était qu'un accident de saisie ; voir `maitreParDefaut`. Un
     rendez-vous qu'on relit garde évidemment le sien. */
  const [master, setMaster] = useState(appt?.master ?? initial?.master ?? maitreParDefaut(branch));
  const [status, setStatus] = useState<Appointment['status']>(appt?.status ?? 'confirmé');
  const [note, setNote] = useState(appt?.note ?? initial?.note ?? '');
  const [discountPct, setDiscountPct] = useState<number>(appt?.discountPct ?? 0);
  const [discountXof, setDiscountXof] = useState<number>(appt?.discountXof ?? 0);
  /* LE FORFAIT PONCTUEL — un total négocié pour l'ensemble des gestes. Il
     REMPLACE les remises tant qu'il est posé : deux mécaniques sur le même
     rituel, et plus personne ne sait ce qui a été consenti. */
  const [forfaitOn, setForfaitOn] = useState(!!appt?.forfait);
  const [forfaitNom, setForfaitNom] = useState(appt?.forfait?.nom ?? '');
  const [forfaitStr, setForfaitStr] = useState(appt?.forfait ? String(appt.forfait.totalXof) : '');
  /* Qui a offert ce rituel — vide dans l'immense majorité des cas. C'est
     pourquoi le champ vit derrière un INTERRUPTEUR : un cas d'exception ne
     s'affiche pas en pleine lumière à chaque rendez-vous. */
  const [offertPar, setOffertPar] = useState(appt?.offertPar ?? '');
  const [offertOn, setOffertOn] = useState(!!appt?.offertPar);
  /* LE PRIX, UN SEUL CHOIX — plein, remisé, ou forfait. Les trois s'excluent :
     un forfait est un prix négocié, on ne le remise pas (règle du 8 août) ;
     les afficher côte à côte les faisait passer pour cumulables. */
  const [prixMode, setPrixMode] = useState<'plein' | 'remise' | 'forfait'>(
    () => (appt?.forfait ? 'forfait' : (appt?.discountPct || appt?.discountXof ? 'remise' : 'plein')),
  );
  /* Montant convenu — saisi pour les rituels à prix variable / sur devis.
     `null` = la Maison n'a pas touché au champ : la valeur affichée se DÉRIVE
     alors du rendez-vous. Le seeder avec `priceXof` était un bug à double
     détente : le rendez-vous ne stocke que le TOTAL (fixes + libre), donc le
     champ « sur mesure » se rouvrait avec le total entier — et réenregistrer
     rajoutait les prix fixes PAR-DESSUS, gonflant le rituel à chaque
     ouverture (constaté le 11 août, 8 000 → 13 000 → 18 000). */
  const [amount, setAmount] = useState<string | null>(null);
  /* Ré-tarifer un rituel au tarif du jour (geste EXPLICITE) : un prix figé sous
     un ancien barème peut être actualisé au prix personnalisé courant. Jamais
     automatique — le prix d'origine fait foi tant que la maison ne le demande pas. */
  const [refreshPrice, setRefreshPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings] = useSettings();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [bands] = useModelBands();
  /* Tout le carnet — pour compter les venues honorées de la tête choisie. */
  const [tousLesRdv] = useAppointments();
  /* Abonnement actif de la cliente — pour la distinguer à la prise de rendez-vous. */
  const membership = clientId ? activeSubscriberOf(subs, clientId) : undefined;
  const membershipPlan = membership ? plans.find((p) => p.id === membership.planId) : undefined;
  /* Couverture par l'abonnement : rituel « inclus » (prix 0, décompté du quota). */
  const [covered, setCovered] = useState<boolean>(appt?.coveredBySub ?? false);
  /* LA SÉANCE DE SUITE (15 août) — de quel rituel déjà facturé celle-ci est la
     suite. Vide = un rituel qui se facture normalement. À la réouverture, on
     retrouve le parent par la tête de sa série. */
  const [suiteDe, setSuiteDe] = useState<string>(() => {
    if (initial?.suiteDe) return initial.suiteDe;
    if (!appt?.seriesId || (appt.seriesIndex ?? 1) <= 1) return '';
    const tete = appointmentsStore.get()
      .filter((x) => x.seriesId === appt.seriesId && x.id !== appt.id)
      .sort((a, b) => (a.seriesIndex ?? 1) - (b.seriesIndex ?? 1))[0];
    return tete?.id ?? '';
  });

  const chosen = serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);

  /* ── SES RITUELS HABITUELS ────────────────────────────────────────
     Une cliente revient pour la même chose. Retaper ses quatre gestes à chaque
     prise de rendez-vous est un travail de copiste — et une source d'écarts :
     un geste oublié, et la pièce ne ressemble plus aux précédentes.

     ON NE DEMANDE À PERSONNE D'ENREGISTRER UN MODÈLE. L'habitude est déjà
     écrite dans le carnet : on regroupe ses rituels passés par COMBINAISON de
     prestations, on compte, et on propose les trois plus fréquentes. Rien à
     curer, rien à tenir à jour, et ça vaut pour toutes les têtes dès le
     premier jour — y compris celles dont personne n'aurait pensé à faire un
     modèle.

     Deux gardes. Une combinaison dont UNE prestation a disparu du catalogue
     est écartée : un modèle qui pose un identifiant mort remplirait le rituel
     d'un vide silencieux — c'est la même faute que juger sur la carte élaguée.
     Et les rituels ANNULÉS ne comptent pas : ce qu'on n'a pas fait n'est pas
     une habitude. */
  const rituelsHabituels = useMemo(() => {
    if (!clientId) return [];
    const groupes = new Map<string, { ids: string[]; n: number; dernier: string; master: string }>();
    for (const a of branchAppts) {
      if (a.clientId !== clientId || a.status === 'annulé') continue;
      if (appt && a.id === appt.id) continue;
      const ids = a.serviceIds ?? [];
      if (!ids.length || !ids.every((id) => byId.has(id))) continue;
      const cle = [...ids].sort().join('|');
      const g = groupes.get(cle);
      if (!g) {
        groupes.set(cle, { ids, n: 1, dernier: a.date, master: a.master });
      } else {
        g.n += 1;
        /* Le plus RÉCENT donne l'ordre des gestes et le maître : la dernière
           fois est la meilleure image de l'habitude d'aujourd'hui. */
        if (a.date > g.dernier) { g.dernier = a.date; g.ids = ids; g.master = a.master; }
      }
    }
    return [...groupes.values()]
      .sort((x, y) => y.n - x.n || y.dernier.localeCompare(x.dernier))
      .slice(0, 3);
  }, [clientId, branchAppts, byId, appt]);

  /* ── LES PRESTATIONS À LA UNE — 22 août 2026 ───────────────────────
     « Quand je sélectionne des services, je voudrais avoir des services à la
     une qui reviennent plus souvent que d'autres. »

     Cent-quarante-huit prestations à la file : les six qu'on pose dix fois par
     jour se cherchent aussi longtemps que celle qu'on pose une fois l'an.

     ON NE DEMANDE À PERSONNE DE LES DÉSIGNER. C'est la même règle que « Ses
     rituels habituels » : l'habitude est DÉJÀ écrite dans le carnet. On compte
     ce que la Maison a réellement posé sur les six derniers mois, et les plus
     fréquentes montent en tête. Rien à curer, rien à tenir à jour, et cela
     vaut dès le premier jour — y compris pour les prestations auxquelles
     personne n'aurait pensé.

     SIX MOIS, ET PAS TOUT L'HISTORIQUE : une prestation abandonnée en janvier
     ne doit pas trôner en août. Les rituels ANNULÉS ne comptent pas — ce qu'on
     n'a pas fait n'est pas une habitude. */
  const alaUne = useMemo(() => {
    const depuis = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    })();
    const compte = new Map<string, number>();
    for (const a of branchAppts) {
      if (a.status === 'annulé' || a.date < depuis) continue;
      for (const id of a.serviceIds ?? []) compte.set(id, (compte.get(id) ?? 0) + 1);
    }
    return [...compte.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([id, n]) => ({ sv: byId.get(id), n }))
      .filter((x): x is { sv: Service; n: number } => !!x.sv);
  }, [branchAppts, byId]);

  /* Le modèle dont on attend le « Remplacer » — un seul à la fois. */
  const [modeleAConfirmer, setModeleAConfirmer] = useState<string | null>(null);

  const [cats] = useCategories();
  const remaining = services.filter((s) => !serviceIds.includes(s.id)).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);

  /* LA REMISE FAMILLE (12 août ; barème du foyer le 14). Le compte famille de
     la tête choisie porte un taux (`remiseFamillePct` — LE juge : taux posé =
     personnalisé, compte muet = 1 enfant → 10 %, 2 et plus → 15 %) : sur un
     NOUVEAU rituel, choisir un membre pose d'office « Remise » à ce taux, et
     revenir à une tête sans compte la retire — tant que la main n'a rien
     consenti d'autre. Un rituel EXISTANT garde ce qui a été consenti : rien
     ne s'y réécrit tout seul, la remise du compte s'y propose d'un clic.
     ELLE NE PORTE PAS SUR LES FORFAITS (déjà réduits) : le net l'applique à
     la part hors forfaits, et l'enregistrement la FIGE en francs exacts. */
  const [families] = useFamilies();
  const ficheCliente = clients.find((c) => c.id === clientId);
  const familleDuCompte = ficheCliente?.familyId ? families.find((f) => f.id === ficheCliente.familyId) : undefined;
  /* Le taux du compte, avant la règle du geste — voir `famPct`, plus bas :
     le juge a besoin du contexte tarifaire, qui n'existe qu'après la longueur. */
  const famPctCompte = remiseFamillePct(familleDuCompte, clients, todayISO());

  /* Prestations choisies qui sont INCLUSES dans la formule de l'abonnée, avec leur
     allocation restante sur le cycle (le RDV en cours exclu de son propre décompte).
     `remaining === null` = illimité. La couverture n'est proposée que s'il reste au
     moins une allocation (ou si ce RDV était déjà couvert). */
  const coverageRows = (membership && membershipPlan)
    ? chosen
        /* SES prestations à elle : le contenu ajusté à la vente fait foi. */
        .filter((sv) => inclusVendus(membership, membershipPlan).some((i) => i.serviceId === sv.id))
        .map((sv) => ({ sv, remaining: coveredRemaining(membership, membershipPlan, sv.id, branchAppts, appt?.id) }))
    : [];
  const canCover = coverageRows.length > 0 && (coverageRows.some((r) => r.remaining === null || (r.remaining ?? 0) > 0) || !!appt?.coveredBySub);
  const effCovered = covered && canCover;
  /* LE PRIX D'ORIGINE FAIT FOI. Un rituel au prix figé (facturé à CE prix-là —
     ancien ERP ou encaissement passé) GARDE son prix quand on le modifie : le
     catalogue vit, l'histoire non. Le prix ne se recalcule au catalogue du jour
     QUE si l'on change les prestations elles-mêmes — l'ancien prix ne décrit
     alors plus le même rituel. */
  const frozenXof = appt?.priceXof;
  /* SON prix : le modèle de la cliente (nombre de locks → tranche du barème) et
     son Juste Prix personnalisent le tarif de référence. Quand il n'y a rien à
     personnaliser, la référence reste le catalogue — comportement inchangé. */
  const rdvClient = clients.find((c) => c.id === clientId);
  /* LES RITUELS AUXQUELS RATTACHER UNE SUITE — les siens, non annulés, hors
     celui-ci et hors séances de suite (on se rattache à la tête, pas au
     wagon). Du plus récent au plus ancien : la suite d'aujourd'hui appartient
     presque toujours à la dernière venue. */
  const rituelsPorteurs = useMemo(
    () => branchAppts
      .filter((a) => a.clientId === clientId && a.id !== appt?.id
        && a.status !== 'annulé' && (a.seriesIndex ?? 1) <= 1)
      .map((a) => {
        const soins = apptServices(a, byId);
        /* CE QU'ON NOMME (15 août, 2ᵉ passe) — le soin qui promet une suite, et
           LUI SEUL. La première version empilait « (+ 7 autres) » et le prix du
           rituel : deux nombres qui ne concernent pas la séance qu'on pose, et
           que Yéman a lus comme les siens. On ne dit que ce qui sert. */
        const multi = soins.filter((sv) => (sv.sessions ?? 1) > 1);
        const dit = multi.length
          ? multi.map((sv) => sv.name).join(' + ')
          : soins[0]?.name ?? 'rituel';
        return { a, dit, seances: multi[0]?.sessions ?? 0, aDesSeances: multi.length > 0 };
      })
      .slice(0, 30),
    [branchAppts, clientId, appt?.id, byId],
  );
  const porteur = rituelsPorteurs.find((r) => r.a.id === suiteDe);
  const estSuite = !!porteur;
  const [sets] = useBandSets();
  /* LA LONGUEUR TRAVAILLÉE, choisie ici — et le rendez-vous FIGE la sienne :
     le relire ne le retarife jamais à la longueur d'aujourd'hui. Le point de
     départ vient désormais de la FICHE (11 août) : la Maison connaît sa
     longueur, autant partir de la vraie ; le sélecteur corrige si elle a
     poussé. À défaut Mi-Long — le cas courant au fauteuil. */
  const [longueur, setLongueur] = useState<LongueurId>(
    appt?.longueur ?? rdvClient?.longueur ?? 'mi-long',
  );
  /* CHANGER DE CLIENTE dans la modale adopte SA longueur de fiche — sur le seul
     changement de tête, pour qu'une synchro n'écrase pas une correction faite
     au sélecteur. La longueur déjà FIGÉE d'un rituel existant prime toujours. */
  useEffect(() => {
    if (appt?.longueur) return;
    const fiche = clients.find((c) => c.id === clientId);
    setLongueur(fiche?.longueur ?? 'mi-long');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  /* TOUS LES MONTANTS DE CETTE FICHE PASSENT PAR ICI. Masquer les prix un par
     un aurait laissé passer celui qu'on oublie — et un prix oublié dans un
     écran censé n'en montrer aucun vaut pire que pas de masquage du tout. */
  /* LES MONTANTS SE TAISENT AUSSI SUR UNE SÉANCE INCLUSE : afficher le prix
     d'un soin dont la séance ne se facture pas ferait croire à un dû. */
  const argent = (n: number): string => (sansPrix || estSuite ? '—' : fmtMoney(n, currency));
  const pricing = { ...pricingOf(rdvClient, bands, sets, cats), longueur };

  /* ══ LA DURÉE SUIT LA TÊTE — 1er septembre 2026 ════════════════════
     « Le coefficient durée ne sert à rien, on dirait qu'il ne bouge pas du
     tout » (Yéman). Il ne parlait qu'à Ma Couronne. Ici, le comptoir posait la
     durée du catalogue, et la cliente suivante était appelée trop tôt.

     `personalDurationMin` est le MÊME juge que Ma Couronne : durée de la
     longueur ou du catalogue, multipliée par le coefficient de durée du
     calibre, calée au quart d'heure. La marge de calibre y entre d'elle-même,
     puisqu'elle vit dans `pricingOf`. */
  const dureeCalculee = useMemo(
    () => chosen.reduce((n, sv) => n + personalDurationMin(sv, pricing), 0),
    [chosen, pricing],
  );
  const dureeCatalogue = useMemo(
    () => chosen.reduce((n, sv) => n + ((longueur ? sv.dureeParLongueur?.[longueur] : undefined) ?? sv.durationMin), 0),
    [chosen, longueur],
  );
  /* LA MAIN PASSE DEVANT LE CALCUL : une tête va parfois plus vite que son
     calibre. Vide = on suit le calcul. */
  const [dureeMain, setDureeMain] = useState<string>('');
  const dureeRetenue = Math.max(15, parseInt(dureeMain.replace(/[^0-9]/g, ''), 10) || dureeCalculee || 60);
  const finDuRdv = timeToMin(time) + dureeRetenue;
  /* Le prix de référence suit déjà la longueur : sans cela, une cliente sans
     modèle ni Juste Prix — donc « non personnalisée » — se serait vu facturer
     le prix du Court quelle que soit sa longueur. */
  const grossCatalogue = chosen.reduce((s, sv) => s + prixDeBase(sv, pricing), 0);

  /* UNE SEULE FAVEUR À LA FOIS — 16 août 2026, décision de Yéman : « ça ferait
     2 remises et ça nous ferait perdre beaucoup trop d'argent ». Quand la
     Maison offre déjà un geste dans ce rituel (un shampoing offert parce
     qu'une Reprise l'accompagne), la remise du compte famille ne s'y ajoute
     pas — et sur TOUT le rituel : c'est le sens de « l'une ou l'autre ». Même
     esprit que les forfaits, où elle ne porte jamais sur ce qui est déjà
     réduit. Le geste est d'ailleurs le plus généreux des deux : un shampoing
     à 10 000 F offert pèse plus que 15 % sur une reprise.
     Déclaré ICI, après `pricing` : le juge du geste a besoin du calibre. */
  const gesteAuPanier = unGesteDansLePanier(chosen, pricing);
  const famPct = gesteAuPanier ? 0 : famPctCompte;
  const famAuto = useRef(false);
  useEffect(() => {
    if (appt || sansPrix || forfaitOn || covered) return;
    if (famPct > 0) {
      const vierge = prixMode === 'plein' && !discountPct && !discountXof;
      if (vierge || famAuto.current) {
        famAuto.current = true;
        setPrixMode('remise');
        setDiscountPct(famPct);
        setDiscountXof(0);
      }
    } else if (famAuto.current) {
      /* Le geste vient d'entrer au rituel : la remise famille posée d'office
         se retire d'elle-même, sans que la main ait à y penser. */
      famAuto.current = false;
      setPrixMode('plein');
      setDiscountPct(0);
      setDiscountXof(0);
    }
    /* Volontairement sur le CHANGEMENT DE TÊTE (et de taux) seulement : réagir
       aux états du prix referait le geste de la Maison dans son dos. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, famPct]);
  /* La longueur ne concerne que les prestations qui s'y facturent. Ailleurs, le
     sélecteur n'a rien à commander : on ne le montre pas. */
  const longueurPertinente = chosen.some(suitLongueur);
  /* SEULEMENT CE QUI LA CONCERNE. Un VÈKPÈ™ Medium n'existe pas pour une cliente
     Mini : le proposer, c'est risquer de figer 150 000 F sur son rendez-vous là
     où son prix est de 220 000 F. Déclaré APRÈS `pricing` — le lire plus haut
     touchait une constante non encore initialisée et cassait tout le Carnet. */
  /* LES VENUES DE LA TÊTE — pour ouvrir les prestations à seuil (desVenue).
     Le forfait GBÈJÍ™ Fidélité ne paraît qu'à partir de la 3ᵉ venue : avant,
     il n'existe pas pour elle, comme une création hors calibre. */
  /* Mémoïsé : le comptage balaie le carnet ENTIER, et cette modale re-rend à
     chaque frappe — le chemin de saisie le plus chaud de l'application. */
  const venuesTete = useMemo(() => venuesHonorees(tousLesRdv, clientId), [tousLesRdv, clientId]);
  /* SÉANCE INCLUSE : SEULEMENT CE QUI Y DONNE DROIT (20 août). Une suite ne
     refait pas tout le rituel — elle poursuit les soins qui promettent
     plusieurs séances. Le sélecteur ne propose donc que les prestations
     multi-séances DU RITUEL PARENT : retirée d'un ×, une création terminée en
     une séance s'y retrouve si la main se ravise, et rien d'autre n'entre. */
  const proposables = remaining
    .filter((sv) => !estSuite || (porteur?.a.serviceIds.includes(sv.id) && (sv.sessions ?? 1) > 1))
    .filter((sv) => estProposable(sv, pricing, venuesTete, !!familleDuCompte));
  /* GROUPÉES PAR ATELIER. 148 prestations à la file, on ne retrouve rien : il
     faut lire toute la liste pour choisir un resserrage. Les regrouper sous le
     nom de leur atelier rend la recherche visuelle immédiate — c'est déjà comme
     ça que la Maison en parle. Les catégories vides ne s'affichent pas.
     DANS L'ORDRE DU CATALOGUE (12 août) : ateliers ET prestations suivent les
     champs `order` que les flèches du Catalogue maintiennent — le sélecteur
     lisait l'ordre brut du magasin, et la main ne retrouvait pas ses repères.
     Tout suit un ordre à MND ; la Caisse trie déjà ainsi. */
  const parAtelier = catsDansLOrdre(cats)
    .map((c) => ({
      cat: c,
      list: proposables.filter((sv) => sv.categoryId === c.id).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.list.length);
  const horsAtelier = proposables
    .filter((sv) => !cats.some((c) => c.id === sv.categoryId))
    .sort((a, b) => a.order - b.order);

  const rdvPersonalized = isPersonalized(pricing) && chosen.length > 0;
  /* LE GESTE OFFERT entre dans le total (15 août) : une prestation offerte
     par la règle du Catalogue vaut zéro dans SON rituel — le comptoir ne
     retranche rien à la main, et la facture dira la même chose. */
  /* LE TOTAL DU RITUEL, REMISES DE LIGNE DÉDUITES. Elles se retranchent ICI,
     avant la remise globale — c'est l'ordre annoncé à Yéman le 17 août : la
     ligne d'abord, l'ensemble ensuite. */
  const remiseLigneAt = (i: number) => {
    const r = remisesL[i];
    return { pct: Math.max(0, Math.min(100, r?.pct ?? 0)), xof: Math.max(0, r?.xof ?? 0) };
  };
  const apresRemiseLigne = (brut: number, i: number) => {
    const r = remiseLigneAt(i);
    return Math.max(0, Math.round(brut * (1 - r.pct / 100)) - r.xof);
  };
  const grossBase = rdvPersonalized
    ? chosen.reduce((s, sv) => s + apresRemiseLigne(prixDansPanier(sv, pricing, chosen, services, produitsGamme), serviceIds.indexOf(sv.id)), 0)
    : chosen.reduce((s, sv) => {
        const pct = remiseGestePct(sv, pricing, chosen);
        return s + apresRemiseLigne(Math.round(prixDeBase(sv, pricing) * (1 - pct / 100)), serviceIds.indexOf(sv.id));
      }, 0);
  const servicesChanged = !!appt && [...appt.serviceIds].sort().join('|') !== [...serviceIds].sort().join('|');
  /* Prestation à prix variable ou sur devis : le montant se fixe au fauteuil. Le
     montant convenu (saisi dans la modale) prime alors sur la somme de référence ;
     à défaut, on retient le prix de départ. */
  /* CE QUI RESTE VRAIMENT À TARIFER — et rien d'autre.
     Le critère n'est PAS « la prestation n'est pas à prix fixe » : une SÍNSIN
     Élaborée est déclarée « variable », mais son prix est exactement connu dès
     qu'on a le calibre ou le comptage de la cliente — l'écran l'affiche
     d'ailleurs en clair, « 35 000 F » et non « dès 35 000 F ». Lui ouvrir un
     champ de saisie faisait redemander un montant déjà calculé, sur une ligne
     qui affichait déjà son prix : deux nombres, et l'on ne savait plus lequel
     comptait (constaté le 11 août).

     `prixFerme` porte déjà cette question — « son prix est-il exactement connu
     pour cette cliente ? » — et il tient compte du prix convenu avec elle. Un
     champ ne s'ouvre donc que là où la réponse est NON : une prestation sur
     devis, ou une variable dont le modèle ne permet pas encore de trancher. */
  const estLibre = (sv: Service) => !prixFerme(sv, pricing);
  const needsAmount = chosen.some(estLibre);
  /* UNE SEULE prestation à prix libre → le montant se saisit SUR SA LIGNE.
     Au-delà, un champ par ligne mentirait : le rendez-vous ne porte qu'un
     montant, et deux champs le réécriraient l'un après l'autre. */
  const libres = chosen.filter(estLibre);
  const seulPrixLibre = libres.length === 1;
  /* UNE REMISE QU'ON VIENT DE POSER DÉGÈLE LE PRIX — 18 août 2026.

     Le gel protège l'histoire : relire un rituel de mars ne le retarife pas. Mais
     il l'emporterait aussi sur un geste qu'on est en train de faire — on pose
     −50 %, le total ne bouge pas, et la remise « ne marche pas ».

     On compare donc les remises À L'ÉCRAN à celles ENREGISTRÉES : si elles ont
     changé, c'est une décision d'aujourd'hui et le prix se recalcule. Si elles
     sont identiques — le cas d'une simple réouverture —, le gel tient. Sans
     cette comparaison, rouvrir un vieux rituel remisé le retariferait tout seul,
     ce qui est exactement la faute que le gel existe pour empêcher. */
  const signatureRemises = (rs: readonly ({ pct?: number; xof?: number } | null | undefined)[] | undefined, n: number) =>
    Array.from({ length: n }, (_, i) => `${rs?.[i]?.pct ?? 0}/${rs?.[i]?.xof ?? 0}`).join('|');
  const remisesChangees = signatureRemises(remisesL, serviceIds.length)
    !== signatureRemises(appt?.remisesLignes, serviceIds.length);
  const keepFrozen = !needsAmount && typeof frozenXof === 'number' && !servicesChanged && !refreshPrice && !remisesChangees;
  const grossXof = keepFrozen ? (frozenXof as number) : grossBase;

  /* LE MONTANT CONVENU NE VAUT QUE POUR LES PRESTATIONS À PRIX LIBRE.
     Il REMPLAÇAIT le total du rituel : une reprise SÍNSIN à 45 000 F posée à
     côté d'une prestation sur mesure disparaissait dès qu'on saisissait
     12 000 F pour celle-ci — le rendez-vous valait 12 000 F au lieu de 57 000,
     et rien ne le disait (constaté le 11 août). Le montant se substitue
     désormais au SEUL bloc des prix libres ; les prestations à prix fixe
     gardent le leur et s'ajoutent.

     Sans montant saisi, le bloc libre garde son prix de départ — zéro pour une
     prestation sur devis, le prix annoncé pour une variable. */
  /* LE PRIX PLEIN ET LE GESTE, SÉPARÉMENT (16 août) — la facture doit pouvoir
     écrire « 10 000 F · remise −100 % » là où l'écran du rituel l'écrit. Les
     confondre en un seul nombre rendait le cadeau invisible sur la pièce. */
  const prixPlein = (sv: Service) =>
    rdvPersonalized ? personalPriceXof(sv, pricing, services, produitsGamme) : prixDeBase(sv, pricing);
  const gesteDe = (sv: Service) => remiseGestePct(sv, pricing, chosen);
  /* LA REMISE POSÉE À LA MAIN SUR CETTE LIGNE — 18 août 2026.
     « La remise par prestation ne marche pas » (Yéman) : le bloc calculait bien
     « 30 000 F au lieu de 60 000 F », mais la ligne affichait toujours 60 000 et
     le total du rituel les comptait entiers. La remise ne vivait que dans son
     propre affichage — elle n'entrait dans AUCUN calcul de la modale.

     Elle entre ici, au seul endroit qui donne le prix d'une ligne : tout ce qui
     en découle — le montant à droite, le total du bandeau, ce qui part à
     l'enregistrement — suit d'un coup. Un prix calculé à deux endroits finit
     toujours par diverger ; celui-ci n'a qu'une source.

     L'index vient de `serviceIds` et non de `chosen` : les deux divergent dès
     qu'une fiche a disparu du catalogue, et la remise irait au geste voisin. */
  const remiseLigneDe = (sv: Service) => {
    const i = serviceIds.indexOf(sv.id);
    const r = i >= 0 ? remisesL[i] : undefined;
    return { pct: Math.max(0, Math.min(100, r?.pct ?? 0)), xof: Math.max(0, r?.xof ?? 0) };
  };
  const prixDe = (sv: Service) => {
    const apresGeste = Math.round(prixPlein(sv) * (1 - gesteDe(sv) / 100));
    const r = remiseLigneDe(sv);
    return Math.max(0, Math.round(apresGeste * (1 - r.pct / 100)) - r.xof);
  };
  const grossLibre = libres.reduce((s, sv) => s + prixDe(sv), 0);
  const grossFixe = Math.max(0, grossBase - grossLibre);
  /* LA PART LIBRE DÉJÀ FIGÉE — retrouvée en ôtant les prix fixes du total
     enregistré. C'est elle que le champ affiche à la réouverture, et c'est ce
     qui rend le geste NEUTRE : rouvrir puis enregistrer sans rien toucher
     redonne exactement le même total. */
  const libreFige = needsAmount && appt?.priceXof != null
    ? Math.max(0, Math.round(appt.priceXof) - grossFixe)
    : undefined;
  const amountStr = amount ?? (libreFige != null ? String(libreFige) : '');
  /* « 0 » EST UNE VALEUR (12 août). L'ancien `(amountNum || grossLibre)` ne
     distinguait pas « zéro convenu » de « rien saisi » : taper 0 (rituel
     offert sur la part libre) enregistrait quand même le prix de départ, et
     une part libre FIGÉE à zéro — tarif monté au Catalogue, prestation fixe
     ajoutée dans la modale, abonnement décoché — regonflait le rituel à la
     réouverture : la résurgence du bug « il remet 8 000 » par le cas zéro.
     Seul un champ VIDE retombe sur le prix de départ, comme l'aide le dit. */
  const amountNum = amountStr.trim() === '' ? null : (parseInt(amountStr.replace(/[^0-9]/g, ''), 10) || 0);
  const effGross = needsAmount ? grossFixe + (amountNum ?? grossLibre) : grossXof;
  /* REMISE VISIBLE « prix d'origine conservé » : chaque prestation reste affichée à
     son prix PLEIN (personalPriceXof, somme = grossBase) ; quand le total effectif
     figé est INFÉRIEUR au prix du jour, l'écart est une remise explicite — le RDV
     et la facture montrent les mêmes prix pleins + la même remise. Ne vaut que pour
     les rituels tout-en-prix-fixe (variable/devis : montant saisi au fauteuil). */
  const frozenRemiseXof = !needsAmount && keepFrozen && grossBase > effGross ? grossBase - effGross : 0;
  /* Information « prix d'origine ≠ tarif du jour » — ne vaut que pour les prix FIXES. */
  const frozenDiffers = !needsAmount && typeof frozenXof === 'number' && Math.round(frozenXof) !== Math.round(grossBase);
  /* Pourcentage d'abord, puis remise en CFA — jamais sous zéro. Même ordre que
     `apptNetXof`, sinon l'aperçu de la modale mentirait sur le net encaissé.
     Rituel couvert par l'abonnement → rien à facturer (0). */
  /* Le forfait : un total, et le taux qu'il représente — l'un remplit l'autre.
     On négocie tantôt un montant rond (« les quatre pour 60 000 »), tantôt un
     pourcentage ; le comptoir ne devrait pas avoir à faire la conversion. */
  const forfaitNum = Math.max(0, Math.round(Number(String(forfaitStr).replace(/[^0-9]/g, '')) || 0));
  const forfaitPose = forfaitOn && String(forfaitStr).trim() !== '';
  const forfaitPct = effGross > 0 ? Math.round((1 - forfaitNum / effGross) * 1000) / 10 : 0;
  const setForfaitParPct = (v: string) => {
    const p = Math.max(0, Math.min(100, Number(String(v).replace(',', '.')) || 0));
    setForfaitStr(String(Math.max(0, Math.round(effGross * (1 - p / 100)))));
  };
  /* LA REMISE FAMILLE ÉPARGNE LES FORFAITS (14 août, décision de Yéman) : un
     forfait est déjà réduit par construction — le remiser encore le réduirait
     deux fois. Quand la remise posée EST celle du compte famille (même
     identité que partout : discountPct === famPct), le pourcentage ne porte
     que sur la part hors forfaits. Une remise manuelle, elle, porte sur tout
     — c'est un geste de la main, pas un barème. */
  const forfaitPartXof = chosen
    .filter((sv) => regimeTarifaire(sv, cats).k === 'forfait')
    .reduce((s, sv) => s + prixDe(sv), 0);
  const remiseEstFamille = prixMode === 'remise' && famPct > 0 && discountPct === famPct;
  const baseRemisePct = remiseEstFamille ? Math.max(0, effGross - forfaitPartXof) : effGross;
  /* En francs exacts — c'est CE montant que l'enregistrement fige. */
  const remiseFamilleXof = remiseEstFamille ? Math.round(baseRemisePct * (discountPct / 100)) : 0;
  const totalXof = effCovered
    ? 0
    : forfaitPose
      ? forfaitNum
      : Math.max(0, effGross - Math.round(baseRemisePct * (discountPct / 100)) - discountXof);
  /* Acompte piloté par Paramètres : SEULEMENT les prestations qui l'exigent,
     CHACUNE à son propre taux. Aucune (ou taux 0) → pas d'acompte. */
  const depositServiceIds = chosen.filter((s) => depositPctFor(s.id) > 0).map((s) => s.id);
  /* La remise en CFA ne se répartit pas prestation par prestation : l'acompte se
     calcule sur le prix remisé en %, puis on le plafonne au net — réclamer un
     acompte supérieur au total à payer n'aurait aucun sens. */
  const depositXof = Math.min(depositForServices(chosen, discountPct), totalXof);
  const hasDeposit = depositXof > 0;
  /* Un pourcentage n'est affichable que s'il est unique parmi les prestations
     concernées ; sinon seul le montant a du sens. */
  const depositRates = [...new Set(chosen.map((s) => depositPctFor(s.id)).filter((p) => p > 0))];
  const depositPct = depositRates.length === 1 ? depositRates[0] : null;

  /* Chevauchement — même maître, même jour, statut non annulé (indication non bloquante). */
  const overlap = useMemo(() => {
    const start = timeToMin(time);
    const end = start + (chosen.reduce((s, sv) => s + sv.durationMin, 0) || 60);
    return branchAppts.find((a) => {
      if (a.id === appt?.id || a.date !== date || a.master !== master || a.status === 'annulé') return false;
      const s2 = timeToMin(a.time);
      return start < s2 + apptDurationMin(a, byId) && s2 < end;
    });
  }, [branchAppts, appt?.id, date, time, master, chosen, byId]);

  const overlapName = overlap ? clients.find((c) => c.id === overlap.clientId)?.name ?? 'une cliente' : '';

  /* CE QUI S'ÉCRIT SUR LE RITUEL. `baseXof` se réaffirme à chaque enregistrement :
     c'est le prix plein contre lequel la Maison vient de consentir ce total.
     La date, elle, ne bouge que si le total change — rouvrir une fiche ne
     redate pas une promesse déjà faite. */
  const forfaitEnregistre: Appointment['forfait'] =
    effCovered || !forfaitPose
      ? undefined
      : {
          nom: forfaitNom.trim() || undefined,
          totalXof: forfaitNum,
          baseXof: effGross,
          poseAt: appt?.forfait && appt.forfait.totalXof === forfaitNum ? appt.forfait.poseAt : todayISO(),
        };

  const nomDe = (id: string) => clients.find((c) => c.id === id)?.name ?? 'cette cliente';
  /* On ne s'offre pas son propre rituel : la mention n'aurait aucun sens et
     ferait compter la dépense deux fois au même compte. */
  const offertRetenu = offertPar && offertPar !== clientId ? offertPar : undefined;

  const save = (chosenStatus: Appointment['status']) => {
    if (!clientId) {
      setError('Choisissez une tête couronnée.');
      return;
    }
    if (serviceIds.length === 0) {
      setError('Ajoutez au moins une prestation.');
      return;
    }
    /* LE SALON SOUVERAIN FERME LA MAISON (15 août) — « quand quelqu'un
       réserve, le salon est bloqué pour ce temps ». La plage se pose au NOM du
       rendez-vous : elle se repose sans se dédoubler quand l'heure change, et
       se lève dès que le rituel est annulé ou que la prestation quitte le
       rituel. Sans maître : personne ne reçoit, pas même un autre fauteuil. */
    const reglerLeSalon = (id: string, statut: Appointment['status']) => {
      const priv = chosen.find((sv) => sv.privatise);
      if (!priv || statut === 'annulé') { rouvrirLeSalonDe(id); return; }
      const debutMin = timeToMin(time);
      const finMin = debutMin + (chosen.reduce((n, sv) => n + sv.durationMin, 0) || priv.durationMin);
      const enHeure = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
      fermerLeSalonPour({
        apptId: id, branchId: branch.id, date,
        debut: enHeure(debutMin), fin: enHeure(Math.min(finMin, 24 * 60)),
        qui: rdvClient?.name,
      });
    };

    if (appt) {
      /* LA SÉRIE SE POSE APRÈS L'ÉCRITURE (15 août) — `attacheSeance` a besoin
         de voir le rendez-vous à jour pour renuméroter toute la série. */
      const poseLaSerie = (l: Appointment[]): Appointment[] => {
        const avant = appt.seriesId && (appt.seriesIndex ?? 1) > 1 ? appt.seriesId : '';
        if (estSuite) return attacheSeance(l, appt.id, suiteDe);
        return avant ? detacheSeance(l, appt.id) : l;
      };
      appointmentsStore.set((prev) => poseLaSerie(
        prev.map((x) =>
          x.id === appt.id
            ? { ...x, clientId, serviceIds, date, time, master, status: chosenStatus, note: note.trim() || undefined,
                /* La longueur ne s'inscrit que si une prestation s'y facture :
                   la poser partout salirait tous les rituels d'une donnee qui
                   ne commande rien chez eux. */
                longueur: longueurPertinente ? longueur : undefined,
                /* ══ LA DURÉE SE FIGE ICI — 1er septembre 2026 ═══════════
                   Elle s'écrit sur le rendez-vous, comme le prix et la
                   longueur travaillée. MODIFIER UN RENDEZ-VOUS LA RECALCULE :
                   changer ses prestations, c'est le reposer, et la durée suit
                   le geste. Un coefficient touché plus tard, lui, ne le
                   rattrape jamais. */
                dureeMin: dureeRetenue,
                /* Aucune main nulle part : on n'ecrit rien plutot qu'un tableau
                   de listes vides — le rendez-vous retombe alors sur son maitre. */
                mains: mains.some((m) => m?.length) ? serviceIds.map((_, k) => mains[k] ?? []) : undefined,
                /* Les remises de ligne suivent le même motif que les mains :
                   alignées sur `serviceIds`, absentes quand aucune n'est posée
                   — un tableau de nulls sur chaque rituel ne dirait rien. */
                remisesLignes: remisesL.some((r) => (r?.pct ?? 0) > 0 || (r?.xof ?? 0) > 0)
                  ? serviceIds.map((_, k) => remisesL[k] ?? null)
                  : undefined,
                /* Rituel COUVERT par l'abonnement : rien à facturer (prix 0), ni
                   remise ni acompte, décompté du quota du cycle. */
                coveredBySub: effCovered ? true : undefined,
                offertPar: offertRetenu,
                forfait: forfaitEnregistre,
                /* Un forfait posé efface les remises : le total négocié EST le
                   prix, on ne le remise pas une seconde fois. */
                /* La remise famille se FIGE EN FRANCS (part hors forfaits ×
                   taux) : la facture et l'encaissement retranchent ce montant
                   exact, sans avoir à reconnaître les forfaits après coup. */
                discountPct: effCovered || forfaitPose || remiseEstFamille ? undefined : (discountPct || undefined),
                discountXof: effCovered || forfaitPose ? undefined
                  : remiseEstFamille ? (((discountXof || 0) + remiseFamilleXof) || undefined)
                  : (discountXof || undefined),
                remiseFamille: !effCovered && !forfaitPose && remiseEstFamille ? true : undefined,
                /* PRIX D'ORIGINE CONSERVÉ tant que les prestations ne changent pas.
                   Prestations modifiées → recalcul au tarif du jour DE LA CLIENTE
                   (personnalisé si modèle/Juste Prix, sinon catalogue). Variable/
                   devis : on GÈLE le montant convenu. */
                /* `effGross` — le MÊME nombre que l'aperçu de la modale : prix
                   fixes + montant convenu des prix libres. Le recalculer ici
                   ferait diverger ce qu'on lit de ce qu'on enregistre. */
                priceXof: effCovered ? 0 : needsAmount ? effGross : keepFrozen ? frozenXof : rdvPersonalized ? grossBase : undefined,
                depositServiceIds: effCovered ? [] : depositServiceIds,
                depositXof: effCovered ? 0 : depositXof }
            : x,
        ),
      ));
      reglerLeSalon(appt.id, chosenStatus);
      /* LE STOCK SUIT LE STATUT, quel que soit le chemin. Le bouton du Carnet
         n'était pas le seul à écrire « honoré » : ce sélecteur aussi — et il
         contournait la consommation comme le rembobinage. */
      if (chosenStatus === 'honoré' && appt.status !== 'honoré') {
        consommerPourRituel({ id: appt.id, branchId: appt.branchId, serviceIds }, todayISO());
      } else if (chosenStatus !== 'honoré' && appt.status === 'honoré') {
        rembobinerRituel(appt.id);
      }
      /* LES FACTURES LIÉES SUIVENT LA NOUVELLE COMPOSITION — total intact,
         lignes conformes (voir alignerFacturesDuRituel). Le contexte tarifaire
         de la modale (calibre, Juste Prix, longueur figée) donne les VRAIS
         prix pleins — pas le prix catalogue nu. */
      const maj = appointmentsStore.get().find((x) => x.id === appt.id);
      if (maj) alignerFacturesDuRituel(maj, byId, prixPlein, produitsGamme, gesteDe);
    } else {
      const created: Appointment = {
        id: uid(),
        branchId: branch.id,
        clientId,
        serviceIds,
        longueur: longueurPertinente ? longueur : undefined,
        /* La durée figée, comme sur la branche de modification ci-dessus. */
        dureeMin: dureeRetenue,
        mains: mains.some((m) => m?.length) ? serviceIds.map((_, k) => mains[k] ?? []) : undefined,
        remisesLignes: remisesL.some((r) => (r?.pct ?? 0) > 0 || (r?.xof ?? 0) > 0)
          ? serviceIds.map((_, k) => remisesL[k] ?? null)
          : undefined,
        date,
        time,
        master,
        status: chosenStatus,
        source: 'trone',
        note: note.trim() || undefined,
        coveredBySub: effCovered || undefined,
        coverKind: effCovered ? ('abonnement' as const) : undefined,
        offertPar: offertRetenu,
        forfait: forfaitEnregistre,
        /* Remise famille figée en francs — voir la note du chemin des séries. */
        discountPct: effCovered || forfaitPose || remiseEstFamille ? undefined : (discountPct || undefined),
        discountXof: effCovered || forfaitPose ? undefined
          : remiseEstFamille ? (((discountXof || 0) + remiseFamilleXof) || undefined)
          : (discountXof || undefined),
        remiseFamille: !effCovered && !forfaitPose && remiseEstFamille ? true : undefined,
        /* Couvert par l'abonnement → prix 0 ; variable/devis gèle le montant
           convenu ; cliente au prix personnalisé → SON prix, figé dès la prise. */
        priceXof: effCovered ? 0 : needsAmount ? effGross : rdvPersonalized ? grossBase : undefined,
        depositServiceIds: effCovered ? [] : depositServiceIds,
        depositXof: effCovered ? 0 : depositXof,
      };

      /* LES SEANCES DUES PAR UN FORFAIT SE POSENT AU CARNET. Un forfait qui
         promet « les 3 premiers entretiens » ne les promettait qu'en toutes
         lettres : rien ne savait ce qui restait du, ces gestes n'entraient dans
         aucune statistique, et une seance oubliee ne se voyait nulle part.

         Chaque prestation incluse portant une echeance devient un rendez-vous
         a sa date, couvert par le forfait donc a 0 F. Le montant du forfait
         reste entier sur la visite d'ouverture : ces seances sont deja payees.
         Les dates sont a confirmer avec la cliente — elles sont posees pour ne
         pas etre perdues, pas pour etre gravees. */
      const suites: Appointment[] = [];
      for (const sid of serviceIds) {
        for (const inc of byId.get(sid)?.includes ?? []) {
          if (!inc.afterWeeks || inc.afterWeeks <= 0) continue;
          /* « SELON LE CALIBRE » se resout ICI, au moment ou une tete est en
             face : la ligne designe un atelier, on y prend la prestation qui
             sert le modele de la cliente. Sans cela il aurait fallu cinq
             forfaits identiques, un par densite. */
          const sousArbre = inc.categoryId ? sousArbreOf(cats, inc.categoryId) : undefined;
          const cible = sousArbre
            ? services.find((sv) => sousArbre.has(sv.categoryId) && servesBand(sv, bandForService(sv, pricing)))
            : byId.get(inc.serviceId);
          if (!cible) continue;
          suites.push({
            id: uid(),
            branchId: branch.id,
            clientId,
            serviceIds: [cible.id],
            date: addDaysISO(date, inc.afterWeeks * 7),
            time,
            master,
            status: 'confirmé',
            source: 'trone',
            note: `Inclus au forfait · ${byId.get(sid)?.name ?? ''}, date à confirmer`.trim(),
            coveredBySub: true,
            coverKind: 'forfait',
            coverServiceId: sid,
            priceXof: 0,
            depositServiceIds: [],
            depositXof: 0,
          });
        }
      }
      /* SÉANCE DE SUITE : elle se rattache au rituel qui porte le prix une
         fois qu'elle EXISTE — renuméroter la série suppose de la voir dans la
         liste. */
      appointmentsStore.set((prev) => {
        const avec = [...prev, created, ...suites];
        return estSuite ? attacheSeance(avec, created.id, suiteDe) : avec;
      });
      reglerLeSalon(created.id, chosenStatus);
    }
    onClose();
  };

  const remove = () => {
    if (!appt) return;
    if (!window.confirm('Supprimer ce rendez-vous ? Cette action est définitive.')) return;
    /* Un rituel honoré a consommé sa recette : le supprimer sans rembobiner
       laissait des mouvements orphelins pointant vers un rendez-vous disparu. */
    rembobinerRituel(appt.id);
    appointmentsStore.set((prev) => prev.filter((x) => x.id !== appt.id));
    onClose();
  };

  /* Annuler ≠ supprimer : le RDV annulé sort du calendrier et de tout chiffre,
     mais reste visible (barré) au Carnet — l'histoire n'est pas effacée. */
  const cancelRdv = () => {
    if (!appt) return;
    const paid = appt.paidXof ?? 0;
    const msg = paid > 0
      ? `Annuler ce rendez-vous ? Il porte déjà ${argent(paid)} encaissés, l'annulation ne rembourse rien (passez par « Encaisser → Annuler l'encaissement » d'abord si besoin). Le rituel sortira du calendrier et ne comptera dans aucun chiffre.`
      : 'Annuler ce rendez-vous ? Il sortira du calendrier et ne comptera dans aucun chiffre, il restera visible, barré, au Carnet.';
    if (!window.confirm(msg)) return;
    appointmentsStore.set((prev) => prev.map((x) => (x.id === appt.id ? { ...x, status: 'annulé' } : x)));
    /* S'il avait été honoré, sa recette revient au stock — un rituel annulé
       n'a rien consommé. Sans mouvement : geste muet. */
    rembobinerRituel(appt.id);
    onClose();
  };

  return (
    <Modal title={title ?? (appt ? 'Modifier le rendez-vous.' : 'Nouveau rendez-vous.')} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ═══ LE BANDEAU VIVANT (14 août) — il ne bouge jamais.
            Onze champs à la file, et le total tout en bas : on faisait défiler
            pour retrouver ce qu'on était en train d'écrire. La tête, son
            calibre, le moment et LE TOTAL NET (remise déduite — la somme
            qu'elle paiera, pas le prix du catalogue) restent sous les yeux du
            premier au dernier champ. */}
        <div style={{
          position: 'sticky', top: -1, zIndex: 3, margin: '-4px -2px 0',
          background: 'var(--color-indigo)', borderRadius: 3, padding: '13px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-ivoire)', minWidth: 0 }}>
              {rdvClient?.name ?? 'Tête à choisir'}
            </span>
            {!sansPrix && (
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 23, color: 'var(--copper-200)', whiteSpace: 'nowrap' }}>
                {effCovered ? 'inclus' : estSuite ? 'séance incluse' : argent(totalXof)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, fontSize: 12, color: 'var(--ink-invert-soft, #C9C3DB)' }}>
            {pricing.band && rdvClient?.lockCount ? (
              <span style={{ border: '1px solid var(--hairline-invert)', borderRadius: 999, padding: '1px 9px' }}>
                {bandLabel(pricing.band, bands)} · {rdvClient.lockCount} locks
              </span>
            ) : null}
            <span>
              {frShort(date)} · <b style={{ color: 'var(--color-ivoire)', fontWeight: 600 }}>{time}</b>
              {master ? <> · avec <b style={{ color: 'var(--color-ivoire)', fontWeight: 600 }}>{master}</b></> : ''}
            </span>
            <span style={{ border: '1px solid var(--hairline-invert)', borderRadius: 999, padding: '1px 9px' }}>{status}</span>
          </div>
        </div>

        {/* ① LA TÊTE — et ses locks : ils commandent le barème du modèle. Tant
            qu'ils manquent, le prix s'annonce « dès » ; il devient exact dès
            qu'on les connaît, sans quitter la modale. */}
        <PalierRdv n={1} titre="La tête" />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 124px', gap: 12, alignItems: 'start', marginTop: -8 }}>
          <Field label="Tête couronnée">
            <ClientPicker value={clientId} onChange={setClientId} allowPassage placeholder="Rechercher une cliente (nom, téléphone)…" />
            {membership && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '3px 11px' }}>
                ★ Abonnée · {membershipPlan?.name ?? 'formule'}{membership.cycle && membership.cycle !== 'mensuel' ? ` · ${membership.cycle}` : ''}
              </div>
            )}
          </Field>
          <LocksDeLaTete
            key={clientId}
            client={rdvClient}
            calibre={pricing.band ? bandLabel(pricing.band, bands) : undefined}
          />
        </div>

        {/* ELLE NE PARAÎT QUE LORSQUE LA DURÉE CHANGE. Sur une tête Medium, ou
            sur une prestation qui ne suit pas le modèle, rien ne s'affiche : un
            écran qui commente ce qu'il n'a pas modifié fatigue pour rien.

            SANS CETTE PHRASE, L'ALLONGEMENT PASSE POUR UN BOGUE : on lit 1 h au
            catalogue, 1 h 55 au calendrier, on corrige à la main, et le réglage
            ne sert plus à rien. */}
        {chosen.length > 0 && (
          <div className="trc-rdv-duree">
            <div className="trc-rdv-duree__t">
              <b>{fmtDureeCourte(dureeRetenue)}</b>, de {time} à {String(Math.floor(finDuRdv / 60)).padStart(2, '0')}:{String(finDuRdv % 60).padStart(2, '0')}
            </div>
            {dureeCalculee !== dureeCatalogue && !dureeMain && pricing.band && (
              <div className="trc-rdv-duree__d">
                La fiche annonce {fmtDureeCourte(dureeCatalogue)} ; sa tête est
                {' '}<b>calibre {pricing.band.name ?? bandLabel(pricing.band, bands)}</b>,
                et le barème des prestations y pose ×{pricing.band.durCoef}.
              </div>
            )}
            <div className="trc-rdv-duree__main">
              <span>À la main</span>
              <input
                className="mnd-input"
                inputMode="numeric"
                placeholder={String(dureeCalculee || 60)}
                value={dureeMain}
                onChange={(e) => setDureeMain(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <span>min</span>
              {dureeMain && (
                <button className="tre-link-btn" onClick={() => setDureeMain('')}>revenir au calcul</button>
              )}
            </div>
          </div>
        )}

        <div>
          <PalierRdv
            n={2}
            titre="Le rituel"
            aide={chosen.length
              ? `${chosen.length} prestation${chosen.length > 1 ? 's' : ''} · ${fmtDureeCourte(chosen.reduce((s, sv) => s + sv.durationMin, 0))}`
              : undefined}
          />
          {/* LE MAÎTRE AU FAUTEUIL, ICI — c'est lui qui exécute le rituel, et
              chaque prestation le nomme juste dessous. Il tenait un champ à
              part en bas de page, à côté du statut : deux choses qui n'ont
              rien à voir. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
            <span className="mnd-muted" style={{ fontSize: 11.5, flex: 'none' }}>Au fauteuil</span>
            <Select
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              style={{ flex: '0 1 220px', minWidth: 0 }}
              aria-label="Maître au fauteuil"
            >
              {branch.masters.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          {/* SES HABITUDES, À UN CLIC — À LA CRÉATION COMME À LA RELECTURE.
              Demande de Yéman, 17 août : ouvrir un rituel existant doit aussi
              montrer ses combinaisons. Elles servent alors à comparer autant
              qu'à composer — « est-ce bien ce qu'elle prend d'habitude ? ».

              UNE SEULE PRÉCAUTION, et elle ne coûte rien au cas courant : si le
              rituel porte DÉJÀ des gestes et que le modèle en dit d'autres, le
              clic demande confirmation au lieu d'effacer. Sur un rituel vide,
              il applique tout de suite — on ne fait pas confirmer un geste qui
              ne détruit rien. */}
          {/* Pas d'habitudes sur une SÉANCE INCLUSE (20 août) : un clic y
              remplacerait les soins de la suite par un rituel entier — à
              zéro franc. La suite ne propose que ce qui y donne droit. */}
          {!estSuite && rituelsHabituels.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="mnd-muted" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 7 }}>
                Ses rituels habituels
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rituelsHabituels.map((m) => {
                  const cle = m.ids.join('|');
                  const noms = m.ids.map((id) => byId.get(id)?.name).filter((n): n is string => !!n);
                  const duree = m.ids.reduce((s, id) => s + (byId.get(id)?.durationMin ?? 0), 0);
                  const pose = [...m.ids].sort().join('|') === [...serviceIds].sort().join('|');
                  const poser = () => {
                    setServiceIds(m.ids);
                    /* Les mains repartent à zéro : elles disent QUI a travaillé
                       ce jour-là, pas ce qui se répète. */
                    setMains([]);
                    if (m.master) setMaster(m.master);
                    setModeleAConfirmer(null);
                  };
                  return (
                    <div key={cle} className={`trc-modele${pose ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        className="trc-modele__corps"
                        onClick={() => {
                          if (pose) return;
                          if (serviceIds.length > 0) setModeleAConfirmer(cle);
                          else poser();
                        }}
                      >
                        <span className="trc-modele__gestes">{noms.join(' + ')}</span>
                        <span className="trc-modele__meta">
                          {m.n} fois · dernier le {frDay(m.dernier)}
                          {duree > 0 ? ` · ${fmtDureeCourte(duree)}` : ''}
                          {pose ? ' · c’est le rituel en cours' : ''}
                        </span>
                      </button>
                      {modeleAConfirmer === cle && (
                        <div className="trc-modele__confirme">
                          <span>
                            Remplacer les {serviceIds.length} geste{serviceIds.length > 1 ? 's' : ''} en cours par ce modèle ?
                          </span>
                          <span style={{ display: 'flex', gap: 6, flex: 'none' }}>
                            <button type="button" className="mnd-btn mnd-btn--copper mnd-btn--sm" onClick={poser}>Remplacer</button>
                            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => setModeleAConfirmer(null)}>Garder</button>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
            {chosen.map((sv, i) => (
              <div
                key={sv.id}
                className="mnd-bande"
                style={{ padding: '11px 14px' }}
              >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--color-indigo)' }}>{sv.name}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {Math.round(sv.durationMin / 60 * 10) / 10} h · {sv.sessions > 1 ? `${sv.sessions} séances · ` : ''}palier {sv.palier}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  {/* SON prix PLEIN — la remise éventuelle est une ligne à part (comme la facture). */}
                  <span style={{ fontSize: 13 }}>{remiseGestePct(sv, pricing, chosen) > 0
                      /* LE GESTE DE LA MAISON — le prix plein reste lisible,
                         barré : la cliente doit VOIR ce qu'on lui fait, sinon
                         le geste ne compte pas. Offert à 100 %, sinon le prix
                         qui reste et la baisse consentie. */
                      ? (() => {
                          const pct = remiseGestePct(sv, pricing, chosen);
                          return (
                            <span title="Geste de la maison, réglé au Catalogue">
                              <span style={{ textDecoration: 'line-through', color: 'var(--ink-soft)', marginRight: 6 }}>
                                {argent(personalPriceXof(sv, pricing, services, produitsGamme))}
                              </span>
                              <span style={{ color: 'var(--copper-700)' }}>
                                {pct >= 100
                                  ? 'offert'
                                  : `${argent(prixDansPanier(sv, pricing, chosen, services, produitsGamme))} · −${pct} %`}
                              </span>
                            </span>
                          );
                        })()
                      : prixFixeDe(sv, pricing) !== undefined
                      /* SON PRIX CONVENU, ET ON LE DIT. Sans la mention, le
                         comptoir lit un montant qui ne colle pas au catalogue
                         et « corrige » — c'est-à-dire efface l'accord. */
                      ? <span title="Prix convenu avec elle, fiche → Profil → Ses prix fermes" style={{ color: 'var(--copper-700)' }}>
                          {argent(prixFixeDe(sv, pricing)!)} · convenu
                        </span>
                      : priceModeOf(sv) === 'devis'
                      ? 'sur devis'
                      /* UN PRIX PAS FERME SE DIT « dès » — quel que soit le mode
                         (13 août). Une prestation FIXE qui suit le modèle, sur
                         une tête aux locks non comptés, affichait « 20 000 F »
                         net PENDANT que le champ de montant s'ouvrait à côté :
                         deux vérités contradictoires sur la même ligne, et le
                         champ se lisait comme un bug. Dès que le prix est connu
                         au franc près (`prixFerme`), le montant s'affiche net
                         et le champ ne s'ouvre pas — même juge des deux côtés. */
                      : !prixFerme(sv, pricing)
                        ? `dès ${argent(personalPriceXof(sv, pricing, services, produitsGamme))}`
                        : argent(personalPriceXof(sv, pricing, services, produitsGamme))}</span>
                  {/* LE MONTANT SE SAISIT SUR LA LIGNE, à côté de « sur devis ».
                      Il vivait tout en bas de la modale, sous la note du carnet :
                      on lisait « sur devis » sans voir où le dire, et l'on
                      enregistrait un rituel à 0 F sans s'en apercevoir.

                      UN SEUL MONTANT PAR RENDEZ-VOUS : `Appointment.priceXof`
                      porte le rituel entier, pas la prestation. Le champ ne
                      paraît donc en ligne que s'il n'y a QU'UNE prestation à
                      prix libre — sinon deux champs modifieraient la même
                      valeur en se contredisant, et c'est le bloc du bas, qui dit
                      « montant du rituel », qui garde la main. */}
                  {estLibre(sv) && seulPrixLibre && !effCovered && !sansPrix && (
                    <input
                      className="mnd-input"
                      type="number"
                      min={0}
                      value={amountStr}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={grossLibre > 0 ? String(grossLibre) : 'montant'}
                      style={{ width: 118, textAlign: 'right', padding: '5px 8px', fontSize: 13 }}
                      aria-label={`Montant convenu, ${sv.name}`}
                      title="Montant convenu pour ce rituel"
                    />
                  )}
                  {/* L'ORDRE DES PRESTATIONS EST CELUI DU FAUTEUIL. Il decide de
                      la lecture du rendez-vous, de l'ordre des lignes sur la
                      facture et du deroule de la seance : un diagnostic ouvre,
                      un styling ferme. On ne pouvait que retirer et re-ajouter
                      pour le corriger. */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button
                      /* On echange par la POSITION REELLE de la prestation, pas
                         par son rang a l'ecran : `chosen` ecarte les fiches
                         disparues du catalogue, et les deux index divergent des
                         qu'un rendez-vous ancien en porte une. */
                      onClick={() => {
                        const pos = serviceIds.indexOf(sv.id);
                        if (pos <= 0) return;
                        /* LES MAINS SUIVENT LEUR GESTE. Les deux tableaux sont
                           paralleles : deplacer l'un sans l'autre attribuerait
                           le travail d'une personne a la prestation voisine. */
                        setServiceIds((ids) => { const n = [...ids]; [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]]; return n; });
                        setMains((prev) => {
                          const n = serviceIds.map((_, k) => prev[k] ?? []);
                          [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]];
                          return n;
                        });
                      }}
                      disabled={i === 0}
                      aria-label="Monter cette prestation"
                      title="Monter"
                      style={{ cursor: i === 0 ? 'default' : 'pointer', background: 'none', border: 'none', padding: 0, lineHeight: 0.9, fontSize: 11, color: i === 0 ? 'var(--line)' : 'var(--ink-soft)' }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => {
                        const pos = serviceIds.indexOf(sv.id);
                        if (pos < 0 || pos >= serviceIds.length - 1) return;
                        setServiceIds((ids) => { const n = [...ids]; [n[pos], n[pos + 1]] = [n[pos + 1], n[pos]]; return n; });
                        setMains((prev) => {
                          const n = serviceIds.map((_, k) => prev[k] ?? []);
                          [n[pos], n[pos + 1]] = [n[pos + 1], n[pos]];
                          return n;
                        });
                      }}
                      disabled={i >= chosen.length - 1}
                      aria-label="Descendre cette prestation"
                      title="Descendre"
                      style={{ cursor: i >= chosen.length - 1 ? 'default' : 'pointer', background: 'none', border: 'none', padding: 0, lineHeight: 0.9, fontSize: 11, color: i >= chosen.length - 1 ? 'var(--line)' : 'var(--ink-soft)' }}
                    >
                      ▼
                    </button>
                  </span>
                  <button
                    onClick={() => {
                      const pos = serviceIds.indexOf(sv.id);
                      setServiceIds((ids) => ids.filter((_, k) => k !== pos));
                      setMains((prev) => serviceIds.map((_, k) => prev[k] ?? []).filter((_, k) => k !== pos));
                    }}
                    aria-label="Retirer"
                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13 }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {/* LES MAINS. Qui a reellement execute ce geste — un KLOKLO se
                  fait a deux, une reprise rarement a moins, la coiffure souvent
                  par une troisieme. Le maitre assigne repond du rendez-vous ;
                  il ne dit pas qui a travaille, et c'est pourtant lui seul que
                  la commission suivait. Aucune main cochee : on retombe sur lui. */}
              {/* LES MAINS SE REPLIENT (14 août). Neuf fois sur dix c'est le
                  maître au fauteuil qui exécute : une ligne le dit, et les
                  pastilles n'écrasent plus la prestation. Le pli s'ouvre de
                  lui-même dès que des mains sont désignées — on ne cache
                  jamais un choix déjà fait. */}
              {/* ── LA REMISE DE CETTE PRESTATION ────────────────────────
                  « Créer les remises en lignes % ou F. À personnaliser. »
                  (Yéman, 17 août). Un pourcentage OU des francs, sur CE geste
                  seulement — et les deux se cumulent ensuite avec la remise
                  globale du rendez-vous, la ligne d'abord.

                  Le bloc reste replié tant que rien n'est posé : neuf lignes
                  sur dix se vendent au prix annoncé, et deux champs par
                  prestation rempliraient l'écran d'un cas rare. */}
              {!sansPrix && (() => {
                const pos = serviceIds.indexOf(sv.id);
                const r = remisesL[pos] ?? {};
                const posee = (r.pct ?? 0) > 0 || (r.xof ?? 0) > 0;
                const ouverte = posee || remisesOuvertes.includes(sv.id);
                /* LE PRIX D'ORIGINE DE LA REMISE = le prix RÉEL de la ligne pour
                   cette cliente (`prixPlein` : personnalisé/calibre/longueur), le
                   même que le total applique. `svcPriceForAppt` donnait le prix
                   CATALOGUE de base — d'où « au lieu de 20 000 » sous une ligne à
                   30 000. Le montant facturé était déjà juste ; seul l'affichage
                   mentait. */
                const plein = prixPlein(sv);
                const net = Math.max(0, Math.round(plein * (1 - (r.pct ?? 0) / 100)) - (r.xof ?? 0));
                const poser = (patch: { pct?: number; xof?: number }) => setRemisesL((prev) => {
                  const n = serviceIds.map((_, k) => prev[k] ?? null);
                  n[pos] = { ...(n[pos] ?? {}), ...patch };
                  return n;
                });
                return (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--hairline)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                        {posee
                          ? <>Remise · <b style={{ color: 'var(--copper-700)', fontWeight: 600 }}>{argent(net)}</b> au lieu de {argent(plein)}</>
                          : 'Au prix annoncé'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemisesOuvertes((prev) => (prev.includes(sv.id) ? prev.filter((x) => x !== sv.id) : [...prev, sv.id]))}
                        style={{
                          marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', padding: 0,
                          font: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)',
                        }}
                      >
                        {ouverte ? 'Replier' : 'Remiser cette prestation'}
                      </button>
                    </div>
                    {ouverte && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {[5, 10, 15, 20, 50, 100].map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={`mnd-btn mnd-btn--sm ${(r.pct ?? 0) === v ? 'mnd-btn--copper' : 'mnd-btn--ghost'}`}
                            style={{ flex: 'none' }}
                            onClick={() => poser({ pct: (r.pct ?? 0) === v ? 0 : v })}
                          >
                            −{v}%
                          </button>
                        ))}
                        <input
                          className="mnd-input"
                          inputMode="numeric"
                          placeholder="0"
                          value={r.xof ? String(r.xof) : ''}
                          onChange={(e) => poser({ xof: Math.max(0, Math.round(Number(e.target.value.replace(/[^\d]/g, '')) || 0)) })}
                          style={{ width: 96, textAlign: 'right' }}
                          aria-label="Remise en francs sur cette prestation"
                        />
                        <span className="mnd-muted" style={{ fontSize: 11.5 }}>F · après le %</span>
                        {posee && (
                          <button
                            type="button"
                            className="mnd-btn mnd-btn--ghost mnd-btn--sm"
                            style={{ flex: 'none' }}
                            onClick={() => poser({ pct: 0, xof: 0 })}
                          >
                            Retirer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {ordonneEquipe(equipe.filter((m) => m.branchId === branch.id && m.auFauteuil)).length > 0 && (() => {
                const pos = serviceIds.indexOf(sv.id);
                const desMains = mainsDe(pos);
                const ouvert = desMains.length > 0 || mainsOuvertes.includes(sv.id);
                const equipeAuFauteuil = ordonneEquipe(equipe.filter((m) => m.branchId === branch.id && m.auFauteuil));
                return (
                  <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--hairline)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span className="mnd-muted" style={{ fontSize: 11.5 }}>
                        {desMains.length > 0
                          ? `Exécuté par ${desMains.length} main${desMains.length > 1 ? 's' : ''}`
                          : <>Exécuté par <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>{master || 'le maître assigné'}</b>, au fauteuil</>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMainsOuvertes((prev) => (prev.includes(sv.id) ? prev.filter((x) => x !== sv.id) : [...prev, sv.id]))}
                        style={{
                          marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', padding: 0,
                          font: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)',
                        }}
                      >
                        {ouvert ? 'Replier' : 'Plusieurs mains ?'}
                      </button>
                    </div>
                    {ouvert && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                        {equipeAuFauteuil.map((m) => (
                          <ChipChoix key={m.id} actif={desMains.includes(m.id)} petit onClick={() => basculeMain(pos, m.id)}>
                            {m.name}
                          </ChipChoix>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              </div>
            ))}
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setServiceIds((ids) => [...ids, e.target.value]);
                }
              }}
              style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
            >
              <option value="" disabled>
                + Ajouter une prestation…
              </option>
              {/* À LA UNE, EN TÊTE — ce que la Maison pose le plus souvent.
                  Elles restent aussi à leur atelier : c'est un raccourci, pas
                  un déménagement, et l'on doit pouvoir les retrouver là où on
                  a l'habitude de les chercher. Filtrées par `proposables`,
                  comme le reste : une prestation hors calibre ou déjà choisie
                  n'y paraît pas davantage qu'ailleurs. */}
              {(() => {
                const une = alaUne.filter(({ sv }) => proposables.some((p) => p.id === sv.id));
                if (une.length === 0) return null;
                return (
                  <optgroup label="★ À la une · les plus posées">
                    {une.map(({ sv, n }) => (
                      <option key={`une-${sv.id}`} value={sv.id}>
                        {sv.name} · {priceModeOf(sv) === 'devis' ? 'sur devis' : argent(personalPriceXof(sv, pricing, services, produitsGamme))} · {n}×
                      </option>
                    ))}
                  </optgroup>
                );
              })()}
              {/* LES MONDES SE DISENT (12 août) : un séparateur quand on passe
                  de l'Atelier au plateau, au Studio — « où s'arrête
                  l'Atelier ? » se lit dans la liste même. */}
              {parAtelier.map((g, gi) => {
                const monde = mondeDeCat(g.cat, cats);
                const prec = gi > 0 ? mondeDeCat(parAtelier[gi - 1].cat, cats) : null;
                return (
                  <Fragment key={g.cat.id}>
                    {(gi === 0 || monde !== prec) && <optgroup label={`━━ ${mondeLabel(monde)} ━━`} />}
                    <optgroup label={`${g.cat.fon} · ${g.cat.label}`}>
                      {g.list.map((sv) => (
                        <option key={sv.id} value={sv.id}>
                          {sv.name} · {priceModeOf(sv) === 'devis' ? 'sur devis' : argent(personalPriceXof(sv, pricing, services, produitsGamme))}
                        </option>
                      ))}
                    </optgroup>
                  </Fragment>
                );
              })}
              {horsAtelier.length > 0 && (
                <optgroup label="Autres">
                  {horsAtelier.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name} · {priceModeOf(sv) === 'devis' ? 'sur devis' : argent(personalPriceXof(sv, pricing, services, produitsGamme))}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        </div>

        {/* LA LONGUEUR TRAVAILLÉE — elle commande le prix et la durée des
            prestations qui s'y facturent, et se fige sur le rendez-vous. Elle ne
            paraît que si une prestation choisie la lit : ailleurs, un sélecteur
            qui ne commande rien n'est qu'une case de plus à remplir. */}
        {longueurPertinente && (
          <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)', marginBottom: 8 }}>
              Longueur travaillée
            </div>
            {/* LE CHOIX DOIT SE VOIR. Ces pastilles portaient `trv-palier-chip`,
                une classe qui vit dans `vente.css` — jamais chargée sur le
                Carnet, qui n'a que `clients.css`. Les trois boutons restaient
                donc bruts et « actif » ne peignait rien : on choisissait une
                longueur sans jamais savoir laquelle était retenue, alors qu'elle
                commande le prix. Le style est ici, avec le composant : une
                modale partagée par quatre écrans ne peut pas dépendre de la
                feuille d'un domaine. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LONGUEURS.map((l) => (
                <ChipChoix
                  key={l.id}
                  actif={longueur === l.id}
                  title={l.hint}
                  onClick={() => setLongueur(l.id)}
                >
                  {l.label}
                </ChipChoix>
              ))}
            </div>
            {/* CE QUE LA LONGUEUR CHOISIE COÛTE, en clair — c'est la seule raison
                pour laquelle on la demande. */}
            <div style={{ fontSize: 11.5, color: 'var(--copper-700)', marginTop: 9, lineHeight: 1.55 }}>
              <b style={{ fontWeight: 600 }}>{LONGUEURS.find((l) => l.id === longueur)?.label}</b>
              {' — '}
              {chosen.filter(suitLongueur).map((sv) => `${sv.name} · ${argent(personalPriceXof(sv, pricing, services, produitsGamme))}`).join(' · ')}
            </div>
          </div>
        )}

        {coverageRows.length > 0 && (
          <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: canCover ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={effCovered}
                disabled={!canCover}
                onChange={(e) => setCovered(e.target.checked)}
                style={{ marginTop: 2, flex: 'none' }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--copper-700)' }}>
                  Inclus dans l’abonnement, ne rien facturer
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
                  {coverageRows.map((r) => {
                    const label = r.remaining === null
                      ? 'illimité'
                      : (r.remaining ?? 0) > 0
                        ? `reste ${r.remaining} ce cycle`
                        : 'allocation épuisée';
                    return `${r.sv.name} · ${label}`;
                  }).join(' — ')}
                </span>
                {!canCover && (
                  <span style={{ display: 'block', fontSize: 11, color: '#8f3b30', marginTop: 3 }}>
                    Plus d’allocation sur le cycle en cours, le rituel sera facturé normalement.
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        {/* ③ LE MOMENT — le jour, l'heure, la main qui tient le fauteuil. */}
        <PalierRdv n={3} titre="Le moment" />
        <div className="tr-grid tr-grid--2" style={{ marginTop: -8 }}>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure">
            <Select value={time} onChange={(e) => setTime(e.target.value)}>
              {!TIME_SLOTS.includes(time) && <option value={time}>{time}</option>}
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* LE MAÎTRE A QUITTÉ LE BAS DE PAGE (14 août, Yéman) : il se lisait
            déjà trois fois — dans le bandeau, sous chaque prestation, et là.
            Le choix vit désormais AU RITUEL, où la main le désigne ; ici ne
            reste que ce qui appartient au moment. */}
        {appt && (
          <Field label="Statut">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment['status'])}>
              {RDV_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {overlap && (
          <div className="trc-overlap">
            Attention, {master} reçoit déjà {overlapName} à {overlap.time} ce jour-là. Les deux rituels se chevauchent ;
            vous pouvez tout de même enregistrer.
          </div>
        )}

        {/* LA NOTE SE REPLIE (14 août) : elle reste vide la plupart du temps,
            et occupait une ligne entière entre deux champs qu'on remplit
            toujours. Le pli s'ouvre de lui-même quand elle porte un mot. */}
        {noteOuverte ? (
          <Field label="Note du carnet">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une attention, une préférence…" autoFocus={!appt?.note?.trim()} />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOuverte(true)}
            style={{
              alignSelf: 'flex-start', cursor: 'pointer', background: 'none', border: 'none', padding: 0,
              font: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--copper-700)',
            }}
          >
            + Une note au carnet
          </button>
        )}

        {/* LES CHAMPS DE SAISIE AUSSI. Masquer les montants FORMATÉS ne suffisait
            pas : le montant du rituel et les remises sont des nombres bruts,
            qui passaient au travers. Un écran censé ne montrer aucun prix en
            montrait trois. */}
        {needsAmount && !seulPrixLibre && !effCovered && !sansPrix && (
          <Field label="Montant du rituel (F CFA)">
            <input
              className="mnd-input"
              type="number"
              min={0}
              value={amountStr}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={grossLibre > 0 ? String(grossLibre) : '—'}
              style={{ width: 180, textAlign: 'right' }}
              aria-label="Montant convenu du rituel"
            />
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
              Montant convenu pour {libres.length > 1 ? 'les prestations à prix libre' : 'la prestation à prix libre'}.
              {grossFixe > 0 ? ` Il s’ajoute aux ${argent(grossFixe)} des prestations à prix fixe.` : ''}
              {grossLibre > 0 ? ` À défaut, ${argent(grossLibre)} (prix de départ${rdvPersonalized ? ' personnalisé' : ''}) sera retenu.` : ''}
            </div>
          </Field>
        )}

        {/* LE PRIX — UN SEUL CHOIX. Plein, remisé, ou forfait : trois modes
            exclusifs sous une seule étiquette. Avant, « Forfait », « Remise % »
            et « Remise manuelle » s'empilaient comme trois réglages cumulables —
            alors qu'un forfait EFFACE les remises (un prix négocié ne se remise
            pas). Le choix dit la règle. */}
        {!effCovered && !sansPrix && (
          <>
          <PalierRdv
            n={4}
            titre="Le prix"
            aide={rdvPersonalized && rdvClient?.lockCount ? `son prix · ${rdvClient.lockCount} locks` : undefined}
          />
          {/* LA SÉANCE DE SUITE (15 août, cas Ahmed T.) — « il a pris un
              soin 2 séances, il paie une séance et réserve la deuxième sans
              payer », et « ça peut arriver qu'on finisse en 1 séance ». Le
              nombre de séances ne se sait donc pas à la prise : la série se
              construit à mesure, en rattachant celle-ci au rituel qui porte
              déjà le prix. Rien à encaisser ici — `apptTotalXof` met une
              séance 2+ à zéro partout, et le carnet lui refuse « Encaisser ». */}
          {/* LA SÉANCE DE SUITE NE SE CHOISIT PLUS ICI (15 août, 2ᵉ passe).
              Le sélecteur listait les rituels PASSÉS de la cliente : ouvert
              depuis un rituel déjà facturé, il invitait à le rattacher EN
              ARRIÈRE — un rendez-vous à 133 200 F passait à « séance incluse »,
              donc à zéro, d'un clic dans une liste qu'on lisait de travers.
              « C'est quoi + 7 autres, c'est quoi le prix de 119 000 F ? » :
              c'étaient ceux de L'AUTRE rituel, et rien ne le disait.

              Le rattachement part désormais du bon bout — menu ⋯ du rituel qui
              porte le soin → « Poser la séance suivante ». Ici, on ne fait plus
              que DIRE l'état, et le défaire s'il est faux. */}
          {estSuite && porteur && (
            <div className="mnd-bande" style={{ padding: '13px 15px' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                Séance {(appt?.seriesIndex ?? 2)} de « {porteur.dit} »
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.6 }}>
                Le rituel du {frShort(porteur.a.date)} porte le prix{porteur.seances > 0 ? ` des ${porteur.seances} séances` : ''}, rien à encaisser ici. Il ne reste qu'à choisir <b>la date</b>, au palier ③.
                Seuls les soins à plusieurs séances sont repris : une création
                déjà terminée en une seule séance se retire d'un ✕, au palier ②.
              </div>
              <button
                type="button"
                className="trc-disc"
                style={{ marginTop: 10 }}
                onClick={() => setSuiteDe('')}
              >
                Détacher, ce rituel se facture
              </button>
            </div>
          )}
          {/* UNE SÉANCE INCLUSE NE PARLE PLUS D'ARGENT — 22 août 2026.
              « Quand on pose la séance suivante, ne mets aucun total, aucun
              montant. Juste séance incluse. » Le palier continuait d'offrir
              prix plein, remise, forfait, acompte et récapitulatif — sur un
              rituel qui vaut ZÉRO par construction (`apptTotalXof` met une
              séance 2+ à zéro partout). Proposer d'y consentir une remise
              n'avait aucun sens, et le total affiché en bas invitait à croire
              qu'il restait quelque chose à encaisser. */}
          {!estSuite && (
          <Field label="Le prix">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { m: 'plein' as const, t: 'Prix plein' },
                { m: 'remise' as const, t: 'Remise' },
                { m: 'forfait' as const, t: 'Forfait' },
              ]).map(({ m, t }) => (
                <button
                  key={m}
                  type="button"
                  className={`trc-disc ${prixMode === m ? 'is-on' : ''}`}
                  onClick={() => {
                    /* Un choix de la main éteint l'automatisme famille : « Prix
                       plein » consenti reste plein, même si la tête change. */
                    famAuto.current = false;
                    setPrixMode(m);
                    if (m !== 'forfait') setForfaitOn(false);
                    if (m === 'forfait') { setForfaitOn(true); setDiscountPct(0); setDiscountXof(0); }
                    if (m === 'plein') { setDiscountPct(0); setDiscountXof(0); }
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            {/* Le compte famille annonce son avantage — un clic le pose, quel
                que soit le mode où la main se trouve. */}
            {famPct > 0 && prixMode !== 'remise' && (
              <button
                type="button"
                className="trc-disc"
                style={{ marginTop: 10, borderColor: 'var(--copper-300)', color: 'var(--copper-700)' }}
                onClick={() => {
                  setPrixMode('remise');
                  setForfaitOn(false);
                  setDiscountPct(famPct);
                  setDiscountXof(0);
                }}
              >
                Poser la remise famille · −{famPct}%
              </button>
            )}
            {prixMode === 'remise' && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                  {famPct > 0 && (
                    <button
                      type="button"
                      className={`trc-disc ${discountPct === famPct ? 'is-on' : ''}`}
                      onClick={() => setDiscountPct(famPct)}
                      title={`L'avantage du compte ${familleDuCompte?.name ?? 'famille'}`}
                    >
                      Famille −{famPct}%
                    </button>
                  )}
                  {[5, 10, 15, 20].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`trc-disc ${discountPct === p ? 'is-on' : ''}`}
                      onClick={() => setDiscountPct(p)}
                    >
                      −{p}%
                    </button>
                  ))}
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    max={100}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                    style={{ width: 68, textAlign: 'right' }}
                    aria-label="Remise en pourcentage"
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>% · ou</span>
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    value={discountXof}
                    onChange={(e) => setDiscountXof(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    style={{ width: 120, textAlign: 'right' }}
                    placeholder="0"
                    aria-label={`Remise en ${currency}`}
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>{currency}</span>
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Le pourcentage d’abord, les francs ensuite, les deux se cumulent.
                </div>
              </>
            )}
            {prixMode === 'forfait' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                  <input
                    className="mnd-input"
                    value={forfaitNom}
                    onChange={(e) => setForfaitNom(e.target.value)}
                    placeholder="Forfait"
                    style={{ flex: '1 1 150px', minWidth: 0 }}
                    aria-label="Nom du forfait"
                  />
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    value={forfaitStr}
                    onChange={(e) => setForfaitStr(e.target.value)}
                    placeholder={String(effGross)}
                    style={{ width: 128, textAlign: 'right' }}
                    aria-label={`Total du forfait en ${currency}`}
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>soit</span>
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={forfaitPose ? forfaitPct : ''}
                    onChange={(e) => setForfaitParPct(e.target.value)}
                    style={{ width: 76, textAlign: 'right' }}
                    aria-label="Taux du forfait en pourcentage"
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>% sur {argent(effGross)}</span>
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                  Les prestations restent détaillées : chacune reçoit sa part du total, au prorata de
                  ce qu’elle vaut pour cette tête. Les mains, les primes, les commissions et le Bilan
                  continuent de compter juste.
                </div>
              </>
            )}
          </Field>
          )}
          </>
        )}

        {/* CE RITUEL EST-IL OFFERT ? Le geste vit sur le rendez-vous, et non sur
            la facture : c'est le rendez-vous que tout le monde relit. Rhanda a
            offert à Ahmed sa première visite — 110 000 F, le 2 mai 2026 — et la
            Maison n'avait aucun endroit où l'inscrire, sinon un compte famille
            qui l'aurait faite payeuse à vie. DERRIÈRE UN INTERRUPTEUR : un cas
            d'exception ne s'étale pas à chaque rendez-vous. */}
        {!effCovered && !sansPrix && (
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              <input
                type="checkbox"
                checked={offertOn}
                onChange={(e) => {
                  setOffertOn(e.target.checked);
                  if (!e.target.checked) setOffertPar('');
                }}
              />
              Ce rituel est offert par une autre cliente, cas exceptionnel
            </label>
            {offertOn && (
              <div style={{ marginTop: 10 }}>
                <ClientPicker
                  value={offertPar}
                  onChange={setOffertPar}
                  placeholder="Qui l’offre ?"
                />
                {offertPar && offertPar !== clientId && (
                  <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
                    La dépense et les points de fidélité iront à {nomDe(offertPar)}, c’est elle qui
                    paie. Le rituel, lui, reste au parcours de {nomDe(clientId)}.
                  </div>
                )}
                {offertPar && offertPar === clientId && (
                  <div className="trc-sub" style={{ marginTop: 6, color: 'var(--copper-700)' }}>
                    Elle ne peut pas s’offrir son propre rituel, laissez vide.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* LE PRIX D'ORIGINE FAIT FOI : le rituel a été facturé à CE prix-là et
            le garde, quoi que fasse le catalogue. Il ne se recalcule que si les
            prestations elles-mêmes changent — et on le dit AVANT d'enregistrer. */}
        {frozenDiffers && !servicesChanged && !refreshPrice && !sansPrix && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Prix d’origine conservé : <b>{argent(frozenXof!)}</b> (au tarif d’aujourd’hui,
            ces prestations vaudraient {argent(grossBase)}). Il ne changera que si vous
            modifiez les prestations, ou si vous l’actualisez :
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setRefreshPrice(true)}
                style={{ cursor: 'pointer', background: 'var(--color-copper)', color: 'var(--color-ivoire)', border: 'none', borderRadius: 3, padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600 }}
              >
                Actualiser au tarif du jour ({argent(grossBase)})
              </button>
            </div>
          </div>
        )}
        {frozenDiffers && !servicesChanged && refreshPrice && !sansPrix && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Ré-tarifé au tarif du jour : <b>{argent(grossBase)}</b> (ancien prix
            {' '}{argent(frozenXof!)}). Enregistrez pour figer ce nouveau prix ; ré-encaissez
            ensuite pour que la facture porte les mêmes montants.
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setRefreshPrice(false)}
                style={{ cursor: 'pointer', background: 'none', color: 'var(--copper-700)', border: '1px solid var(--copper-300)', borderRadius: 3, padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 11.5 }}
              >
                Garder le prix d’origine
              </button>
            </div>
          </div>
        )}
        {typeof frozenXof === 'number' && servicesChanged && !needsAmount && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Vous avez modifié les prestations : enregistrer recalculera ce rituel au tarif du jour
            ({argent(grossBase)}), l’ancien prix de {argent(frozenXof)} sera abandonné.
          </div>
        )}
        {/* Prix PERSONNALISÉ — modèle (tranche de locks) × Juste Prix : annoncé
            avant d'enregistrer, puis figé sur le rendez-vous. */}
        {rdvPersonalized && !needsAmount && !keepFrozen && !effCovered && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Prix personnalisé : <b>{argent(grossBase)}</b>
            {pricing.band ? <>, modèle {bandLabel(pricing.band, bands)} (×{pricing.band.coef})</> : null}
            {pricing.clientCoef !== 1 ? <> · Juste Prix ×{pricing.clientCoef}</> : null}
            {grossBase !== grossCatalogue ? <> · catalogue {argent(grossCatalogue)}</> : null}.
            Il sera figé sur ce rendez-vous à l’enregistrement.
          </div>
        )}

        {/* LE RÉCAPITULATIF ENTIER SE TAIT. Le laisser avec des tirets partout
            n'apprend rien et donne l'air d'un écran cassé : mieux vaut qu'il
            n'y soit pas. */}
        {!sansPrix && (
        <div className="trc-total">
          {effCovered ? (
            <div className="trc-total__row">
              <span>Inclus dans l’abonnement</span>
              <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>Rien à facturer</span>
            </div>
          ) : (
          <>
          {/* Remise « prix d'origine conservé » : prix du jour plein, puis l'écart
              figé retranché — la remise reste LISIBLE (comme sur la facture). */}
          {frozenRemiseXof > 0 && (
            <>
              <div className="trc-total__row">
                <span>Prix du jour</span>
                <span className="trc-total__num">{argent(grossBase)}</span>
              </div>
              <div className="trc-total__row">
                <span>Remise · prix d’origine conservé</span>
                <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>−{argent(frozenRemiseXof)}</span>
              </div>
            </>
          )}
          {forfaitPose && (
            <div className="trc-total__row">
              <span>{forfaitNom.trim() || 'Forfait'} · au lieu de {argent(effGross)}</span>
              <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>
                −{argent(Math.max(0, effGross - forfaitNum))}
              </span>
            </div>
          )}
          {!forfaitPose && (discountPct > 0 || discountXof > 0) && (
            <div className="trc-total__row">
              <span>
                Sous-total
                {discountPct > 0 ? (remiseEstFamille ? ` · remise famille −${discountPct}%${forfaitPartXof > 0 ? ' (hors forfaits)' : ''}` : ` · remise −${discountPct}%`) : ''}
                {discountXof > 0 ? ` · remise −${argent(discountXof)}` : ''}
              </span>
              <span className="trc-total__num"><s style={{ color: 'var(--ink-soft)' }}>{argent(effGross)}</s></span>
            </div>
          )}
          <div className="trc-total__row">
            <span>Total prestations</span>
            <span className="trc-total__num">{argent(totalXof)}</span>
          </div>
          </>
          )}
          {hasDeposit && (
            <div className="trc-total__row">
              <span>
                Acompte demandé{depositPct !== null ? ` · ${depositPct} %` : ' · taux variables'}
                {depositServiceIds.length < chosen.length ? ' (partiel)' : ''}
                {' · à vérifier à l’encaissement'}
              </span>
              <span className="trc-total__num">{argent(depositXof)}</span>
            </div>
          )}
        </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>
        )}

        {appt ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save(status)}>
              Enregistrer les modifications
            </Button>
            {/* UN RITUEL RÉGLÉ NE S'ENCAISSE PAS DEUX FOIS (Yéman, 11 août) :
                proposer « Encaisser » sur un rituel payé sème la confusion.
                MAIS RÉGLÉ N'EST PAS UNE IMPASSE (17 août) : « comment retourner
                sur les encaissements, je ne peux pas les éditer ». On n'encaisse
                pas deux fois — on doit pourtant pouvoir RELIRE ce qui a été reçu
                et corriger un moyen ou une date mal saisis. Le bouton change
                donc de mot au lieu de disparaître. */}
            {onEncaisser && (apptPayState(appt, byId) === 'payé' ? (
              <button
                type="button"
                onClick={() => onEncaisser(appt)}
                style={{
                  alignSelf: 'center', cursor: 'pointer', background: 'none', border: 'none',
                  padding: 4, font: 'inherit', fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)',
                }}
              >
                Réglé, voir et corriger les règlements
              </button>
            ) : (
              <Button variant="ghost" onClick={() => onEncaisser(appt)}>
                Encaisser ou poser un acompte
              </Button>
            ))}
            {/* L'AUTRE PORTE DE LA MAQUETTE DU FIL — 20 août : « Demander »
                naît LÀ OÙ LE TRAVAIL SE TROUVE. La dernière pièce de la liste
                de Yéman : la porte existait sur la facture, pas sur le rituel. */}
            <Button variant="ghost" onClick={() => setDemanderOuvert(true)}>
              Demander à quelqu’un de s’en occuper
            </Button>
            {/* LA DESTRUCTION QUITTE LA PILE (14 août). Annuler et supprimer
                s'alignaient, pleine largeur, avec Enregistrer et Encaisser :
                quatre boutons de même poids dont deux qui détruisent — une
                erreur qui attend son heure. Ils vivent désormais sous un pli,
                en petit, et gardent leur mot de confirmation. */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 2 }}>
              {appt.status !== 'annulé' && (
                <button
                  type="button"
                  onClick={cancelRdv}
                  style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 4, font: 'inherit', fontSize: 11.5, color: 'var(--ink-soft)' }}
                >
                  Annuler le rendez-vous
                </button>
              )}
              <button
                type="button"
                onClick={remove}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 4, font: 'inherit', fontSize: 11.5, color: 'var(--copper-700)' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save('confirmé')}>
              {hasDeposit ? 'Confirmer & demander l’acompte' : 'Confirmer le rendez-vous'}
            </Button>
            <Button variant="ghost" onClick={() => save('en attente')}>
              Enregistrer en attente
            </Button>
          </div>
        )}
      </div>
      {demanderOuvert && appt && (
        <DemanderModal
          piece={{
            kind: 'rituel',
            id: appt.id,
            label: `${clients.find((c) => c.id === appt.clientId)?.name ?? appt.clientName ?? 'Cliente'} · ${appt.date} ${appt.time} · ${apptLabel(appt, byId)}`,
          }}
          sousTitre={`Le rituel de ${clients.find((c) => c.id === appt.clientId)?.name ?? appt.clientName ?? 'la cliente'} · ${appt.date}`}
          onClose={() => setDemanderOuvert(false)}
        />
      )}
    </Modal>
  );
}

/* ---------- Sélecteur de cliente — recherche par nom / téléphone ----------

   `allowWalkIn` : la vente ANONYME au comptoir (un flacon vendu à quelqu'un qui
   passe). Aucune fiche, aucun nom — et c'est légitime, personne n'a à décliner
   son identité pour acheter un sérum.

   `allowPassage` : la cliente DE PASSAGE, qui elle reçoit un geste. Son rituel
   doit compter dans la production du maître, donc il lui faut une fiche — mais
   deux champs suffisent, et le comptoir ne doit pas quitter son écran pour les
   saisir. Voir `Client.dePassage`. */
export function ClientPicker({
  value,
  onChange,
  placeholder = 'Rechercher une cliente…',
  allowWalkIn = false,
  allowPassage = false,
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowWalkIn?: boolean;
  allowPassage?: boolean;
}) {
  const clients = useBranchClients();
  const { branch } = useBranch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /* null = menu ; objet = le petit formulaire de passage, ouvert par-dessus. */
  const [passage, setPassage] = useState<{ name: string; phone: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value);
  const digits = (s: string) => s.replace(/\D/g, '');
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = query.trim();
  const qn = norm(q);
  const qd = digits(q);
  /* TOUT le CRM, trié : le menu défile. Aucun plafond — taper les premières lettres
     filtre par nom (insensible aux accents : « agnes » trouve « Agnès ») OU par
     téléphone. Le filtre téléphone ne s'applique QUE si la recherche contient des
     chiffres — sinon `digits(c.phone).includes('')` renvoie vrai pour TOUTES les
     clientes et le filtre par nom ne servait à rien (le bug « rien ne se filtre »). */
  const results = useMemo(() => {
    const base = q
      ? clients.filter((c) => norm(c.name).includes(qn) || (qd !== '' && digits(c.phone).includes(qd)))
      : clients;
    return [...base].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [clients, q, qn, qd]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setPassage(null); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  /* Ce qui est déjà tapé n'est pas perdu : des chiffres remplissent le
     téléphone, des lettres le prénom. Le comptoir a commencé à chercher — il
     ne recommence pas parce que la fiche n'existait pas. */
  const ouvrePassage = () => {
    const chiffres = digits(q);
    setPassage({
      name: chiffres === q ? '' : q,
      phone: chiffres.length >= 4 ? q.trim() : `${branch.dial} `,
    });
  };

  /* LA GARDE ANTI-DOUBLON (14 août — la Jade en double chez Ruth). Le petit
     formulaire créait sans regarder le carnet : taper le nom d'une tête déjà
     inscrite ouvrait une SECONDE fiche — deux Jade, deux suivis, deux comptes.
     Même nom (aplati, sans accents) ou même téléphone → on PROPOSE la fiche
     existante au lieu de la doubler. « Créer quand même » reste offert : les
     homonymes existent, mais ils se créent les yeux ouverts. */
  const [deja, setDeja] = useState<Client | null>(null);

  const enregistrePassage = (force = false) => {
    const nom = (passage?.name ?? '').trim();
    if (!nom) return;
    if (!force) {
      const plat = (s: string) => norm(s).replace(/\s+/g, ' ').trim();
      const telSaisi = digits(passage?.phone ?? '');
      const trouve = clients.find((c) => !c.archived
        && (plat(c.name) === plat(nom)
          || (telSaisi.length >= 8 && digits(c.phone) === telSaisi)));
      if (trouve) { setDeja(trouve); return; }
    }
    const c = clienteDePassage({
      branchId: branch.id,
      name: nom,
      phone: passage?.phone,
      city: branch.city,
      since: todayISO(),
      /* Elle entre par le seuil comme les autres — le persona dit son goût, pas
         son statut ; les deux notions ne se remplacent pas. */
      persona: ensureInitiePersona(),
    });
    clientsStore.set((prev) => [...prev, c]);
    onChange(c.id);
    setDeja(null);
    setPassage(null);
    setOpen(false);
    setQuery('');
  };

  /* La tête existante est prise telle quelle — c'est le geste attendu. */
  const prendreExistante = () => {
    if (!deja) return;
    onChange(deja.id);
    setDeja(null);
    setPassage(null);
    setOpen(false);
    setQuery('');
  };

  const display = open ? query : selected?.name ?? (value === 'walkin' && allowWalkIn ? 'Vente au comptoir' : '');

  return (
    <div className="trc-clientpick" ref={wrapRef}>
      <input
        className="mnd-input"
        value={display}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && passage && (
        <div className="trc-clientpick__menu trc-passage" role="dialog" aria-label="Cliente de passage">
          <div className="trc-passage__head">
            Cliente de passage, prénom et téléphone, rien de plus.
          </div>
          <input
            className="mnd-input"
            autoFocus
            value={passage.name}
            placeholder="Prénom"
            aria-label="Prénom de la cliente de passage"
            onChange={(e) => { setPassage({ ...passage, name: e.target.value }); setDeja(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enregistrePassage(); } }}
          />
          <input
            className="mnd-input"
            value={passage.phone}
            placeholder="Téléphone"
            inputMode="tel"
            aria-label="Téléphone de la cliente de passage"
            onChange={(e) => { setPassage({ ...passage, phone: e.target.value }); setDeja(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enregistrePassage(); } }}
          />
          {deja && (
            <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 2, background: 'var(--copper-50, #f9efe7)', padding: '10px 12px' }}>
              <div style={{ fontSize: 12.5, color: 'var(--color-indigo)', lineHeight: 1.5 }}>
                Cette tête est déjà au carnet, <b style={{ fontWeight: 600 }}>{deja.name}</b>
                {deja.phone ? ` · ${deja.phone}` : ''}.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Button size="sm" variant="copper" onClick={prendreExistante}>Prendre sa fiche</Button>
                <Button size="sm" variant="ghost" onClick={() => enregistrePassage(true)}>Créer quand même · homonyme</Button>
              </div>
            </div>
          )}
          <div className="trc-passage__foot">
            <button type="button" className="trc-passage__cancel" onClick={() => { setPassage(null); setDeja(null); }}>Annuler</button>
            <Button variant="copper" onClick={() => enregistrePassage()} disabled={!passage.name.trim()}>Enregistrer</Button>
          </div>
          <div className="trc-passage__note">
            Son rituel comptera au chiffre et à la production du maître. Elle
            restera hors des têtes actives et des relances jusqu’à sa 2ᵉ venue.
          </div>
        </div>
      )}
      {open && !passage && (
        <div className="trc-clientpick__menu" role="listbox">
          {allowPassage && (
            <button type="button" className="trc-clientpick__opt" onClick={ouvrePassage}>
              <span className="trc-clientpick__n">＋ Cliente de passage</span>
              <span className="trc-clientpick__m">prénom + téléphone</span>
            </button>
          )}
          {allowWalkIn && (
            <button type="button" className="trc-clientpick__opt" onClick={() => { onChange('walkin'); setOpen(false); }}>
              <span className="trc-clientpick__n">Vente au comptoir</span>
              <span className="trc-clientpick__m">sans fiche</span>
            </button>
          )}
          {results.map((c) => (
            <button key={c.id} type="button" className="trc-clientpick__opt" onClick={() => { onChange(c.id); setOpen(false); }}>
              <span className="trc-clientpick__n">{c.name}</span>
              <span className="trc-clientpick__m">
                {estDePassage(c) ? 'de passage · ' : ''}{c.phone || c.city}
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="trc-clientpick__empty">Aucune cliente, {q ? 'affinez la recherche' : 'ajoutez-en une'}.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Ce qu'il y a derrière un chiffre ----------
   Un indice du pilotage (un KPI, une barre, une part de camembert) n'est jamais
   qu'une somme : cette modale montre les lignes qui la composent, et chaque ligne
   qui porte une facture l'ouvre. Partagée par le Tableau de bord et Analytics —
   deux écrans, un seul geste. */

export type DrillRow = {
  date?: string; who: string; sub?: string; amount?: number;
  /** La ligne ouvre sa facture. */
  invoiceId?: string;
  /** …ou creuse d'un cran (une semaine s'ouvre sur un jour). Prime sur `invoiceId`. */
  onOpen?: () => void;
};
export type Drill = { title: string; sub?: string; rows: DrillRow[]; total?: number };

export function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const navigate = useNavigate();
  const { currency } = useBranch();
  return (
    <Modal title={drill.title} onClose={onClose} width={620}>
      {drill.sub && <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>{drill.sub}</div>}
      {drill.rows.length === 0 ? (
        <div className="trc-empty">Rien à montrer ici.</div>
      ) : (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {drill.rows.map((r, i) => {
            const body = (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.who}</div>
                  {r.sub && <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.sub}</div>}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  {r.amount !== undefined && (
                    <div className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)' }}>
                      {fmtMoney(r.amount, currency)}
                    </div>
                  )}
                  {r.date && <div className="mnd-muted" style={{ fontSize: 11 }}>{frShort(r.date)}</div>}
                </div>
              </>
            );
            /* `border: none` d'abord, puis la seule bordure qu'on garde :
               l'inverse annulerait le trait sur les lignes-boutons. */
            const st = {
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 12, padding: '9px 0',
              width: '100%', textAlign: 'left' as const, background: 'none',
              border: 'none', borderBottom: '1px solid var(--hairline)',
              font: 'inherit', color: 'inherit',
            };
            /* La ligne s'ouvre sur sa facture, ou creuse d'un cran. Une fidélisée
               ou un rituel jamais encaissé n'a ni l'un ni l'autre : elle reste une
               ligne plutôt qu'un bouton qui ne mène nulle part. */
            const open = r.onOpen ?? (r.invoiceId ? () => { onClose(); navigate(`/factures?id=${r.invoiceId}`); } : null);
            return open ? (
              <button
                key={`${r.who}-${r.date ?? ''}-${i}`}
                style={{ ...st, cursor: 'pointer' }}
                title={r.invoiceId && !r.onOpen ? 'Ouvrir la facture' : 'Voir le détail'}
                onClick={open}
              >
                {body}
              </button>
            ) : (
              <div key={`${r.who}-${r.date ?? ''}-${i}`} style={st}>{body}</div>
            );
          })}
        </div>
      )}
      {drill.total !== undefined && drill.rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-argile)' }}>
          <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Total</span>
          <span className="mnd-serif" style={{ fontSize: 22, color: 'var(--color-indigo)' }}>{fmtMoney(drill.total, currency)}</span>
        </div>
      )}
    </Modal>
  );
}
