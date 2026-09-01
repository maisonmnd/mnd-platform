/* ── LE MODÈLE DES ABONNEMENTS — descendu dans shared/, 28 août 2026 ──
   « Build an interactive way for the clients to purchase and follow their
   packs and memberships » (Yéman).

   Formules et abonnées vivaient dans `routes/equipe/data.ts`, du côté du
   Trône. Ma Couronne n'importe RIEN du Trône — cette séparation est voulue,
   c'est elle qui garde l'application cliente légère et sans code de gestion.
   Le modèle descend donc ici, où les deux sœurs peuvent le lire.

   LES DEUX MAGASINS SONT CRÉÉS ET LIÉS ICI, une seule fois. Les créer des deux
   côtés aurait donné deux instances sur la même clé : les lectures auraient
   concordé, les rendus non — un geste posé d'un côté ne réveillant pas les
   écrans de l'autre. C'est le genre de désaccord qu'on met des mois à voir.

   `routes/equipe/data.ts` réexporte tout ce fichier : aucun import existant
   n'a bougé. */
import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import type { PaymentMethod } from './finance';
import type { Appointment } from './agenda';
import {
  roundPrice, modelBandsStore, bandSetsStore, bandsAbonnements, type ModelBand,
} from './pricing';
import type { LongueurId } from './catalog';
import type { Echeance } from './echeancier';
import type { OptionCouleur } from './couleur';

/** Un règlement de la formation — intégral ou partiel, avec sa date. */
export type Payment = { id: string; amountXof: number; date: string; method?: PaymentMethod };
/** Une prestation du catalogue INCLUSE dans une formule, avec son quota par cycle.
    `qty === null` = illimité (« Rituels illimités »). */
export type PlanIncluded = { serviceId: string; qty: number | null };

/** DEUX FAÇONS DE VENDRE UN ABONNEMENT, et elles ne se comptent pas pareil :

    · `cycle`  — un abonnement RÉCURRENT. Le quota se recharge à chaque
                 échéance : « 2 rituels par mois » redonne 2 le mois suivant.
                 `priceXof` est le montant du cycle.
    · `pack`   — un PAQUET DE CRÉDITS acheté d'un coup. « 6 GBÈZÀ™ + 6 SÍNSIN™ »
                 vaut pour toute la durée de vie du pack, sans rechargement :
                 une fois les 6 consommés, il est épuisé. `priceXof` est le prix
                 total payé, et `validityDays` sa durée de vie.

    Confondre les deux fausse tout le suivi : le pack annuel de Diane D.,
    lu à travers une fenêtre mensuelle, affichait 0 séance utilisée sur 6 alors
    qu'elle les avait toutes consommées entre juin 2025 et juin 2026. */
export type PlanMode = 'cycle' | 'pack';

/* ── LE PARCOURS DES FORMULES — 28 août 2026 ──────────────────────────
   « Respecte la maquette avec le rangement du parcours des abonnements »
   (Yéman). Onze formules à plat dans une grille, c'est le même mal que les
   sept carrés de la page QR : rien ne dit laquelle sert quand.

   LES FAMILLES SONT DES MOMENTS DU PARCOURS, pas des rayons de magasin. Une
   tête entre par la porte, elle prolonge, elle amène son foyer, et le jour où
   elle fait confiance elle prend son année. C'est cet ordre-là qui s'affiche,
   parce que c'est celui dans lequel une cliente les rencontre. */
export type FamilleFormule = 'naissance' | 'prolongement' | 'porte' | 'foyer' | 'annees';

export const FAMILLES_FORMULES: { k: FamilleFormule; titre: string; quand: string; sous: string }[] = [
  /* LA NAISSANCE OUVRE LE PARCOURS — 28 août. « Dans quel moment du parcours
     je mets VÈKPÈ™ Les 4 Premiers Entretiens ? » (Yéman). Dans aucun des
     quatre : il les PRÉCÈDE tous.

     Ce forfait se vend au moment où la couronne naît, avant qu'aucune autre
     formule ait un sens — on ne prolonge pas ce qui n'existe pas encore, et
     « La porte d'entrée » s'adresse à celle qui hésite, pas à celle qui vient
     de payer une création. La Suite le dit d'ailleurs en toutes lettres :
     « votre couronne ne s'arrête pas à quatre ». Sans ce premier moment, sa
     promesse renvoyait à un vide. */
  { k: 'naissance', titre: 'La naissance', quand: 'au sortir de la création',
    sous: 'Ce qu’on tend avec la couronne elle-même, quand elle demande déjà qui l’entretiendra.' },
  { k: 'prolongement', titre: 'Le prolongement', quand: 'quand le paquet s’épuise',
    sous: 'Le meilleur moment de vente de la Maison : elle a déjà payé une fois, elle connaît le fauteuil.' },
  { k: 'porte', titre: 'La porte d’entrée', quand: 'le petit prix',
    sous: 'Ce qui se prend massivement est ce qui coûte le moins cher à dire oui.' },
  { k: 'foyer', titre: 'Le foyer', quand: 'à deux, à trois',
    sous: 'Le seul levier qui amène des têtes neuves sans que la Maison dépense un franc.' },
  { k: 'annees', titre: 'Les Années', quand: 'pour celles qui font confiance',
    sous: 'Des paquets de crédits valables douze mois : la caisse encaisse à la signature, elle vient à son rythme.' },
];

export type Plan = {
  id: string;
  name: string;
  tag: string;
  priceXof: number; // cycle : montant du cycle · pack : prix total du paquet
  line: string; // la promesse
  perks: string[];
  popular: boolean;
  /** Prestations du catalogue incluses dans la formule (sélection + quota).
      Le suivi de consommation se calcule depuis les RDV couverts (coveredBySub).
      En mode `pack`, `qty` est le total pour toute la vie du pack, pas par mois. */
  included?: PlanIncluded[];
  /** Absent = `cycle`, le mode d'origine de la Maison. */
  mode?: PlanMode;
  /** Pack uniquement — durée de vie en jours. `null` ou absent = sans limite. */
  validityDays?: number | null;
  /** Remise consentie sur le prix à la carte, telle qu'annoncée à la vente. */
  discountPct?: number;
  /** Le moment du parcours où cette formule se propose. Absent = elle se range
      sous « Les autres formules », en fin d'écran — jamais masquée. */
  famille?: FamilleFormule;

  /* ══ LE PRIX SUIT LA TÊTE — 1er septembre 2026 ═══════════════════════
     « Les abonnements doivent se facturer au palier comme au catalogue. Et
     avoir aussi l'option de la longueur » (Yéman).

     UNE FORMULE COÛTAIT LE MÊME PRIX À TOUTES LES TÊTES. Le catalogue sait
     depuis longtemps qu'un lock n'est pas un lock ; la formule, non. Une
     Juste Cadence à 45 000 F qui porte quatre resserrages fait vivre la
     Maison sur un Jumbo, et la fait travailler à perte pendant dix mois sur
     un Pico, dont chaque resserrage vaut deux fois et demie. Rien à l'écran
     ne le disait.

     TROIS CHAMPS, ET AUCUN N'EST OBLIGATOIRE : une formule qui n'en porte
     aucun vaut son prix unique, exactement comme avant. La mise en ligne ne
     déplace aucun prix toute seule. */

  /** L'interrupteur : le prix de référence se multiplie par le coefficient du
      calibre, comme une prestation qui « suit le modèle ». Un seul chiffre
      donne alors les sept prix. */
  suitLeCalibre?: boolean;
  /** Les exceptions, calibre par calibre. Une case écrite ici PASSE DEVANT le
      calcul : c'est une décision de la Maison, rien ne va devant.
      Une case ABSENTE n'est pas un prix à zéro, c'est « prends le calcul ». */
  prixParCalibre?: Record<string, number>;
  /** Ce que la longueur ajoute, en francs, APRÈS le prix du calibre. Trois
      chiffres plutôt que la grille croisée : voir `prixDeLaFormule`. */
  supplementLongueur?: Partial<Record<LongueurId, number>>;
};

/** CE QU'ON SAIT DE LA TÊTE au moment de dire un prix. Les deux champs
    manquent souvent, et c'est prévu : sans calibre on rend le prix de
    référence, sans longueur on n'ajoute rien. */
export type TeteConnue = { bandId?: string; longueur?: LongueurId };

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const PLANS_SEED: Plan[] = [];
export const plansStore = createStore<Plan[]>('mnd_abo_plans', PLANS_SEED);
export const usePlans = () => useStore(plansStore);

export type Subscriber = {
  id: string;
  branchId: string;
  clientId?: string; // lien vers la fiche cliente — pour distinguer l'abonnée partout
  name: string;
  planId: string;
  cycle?: SubCycle; // défaut mensuel ; semestriel facture 5 mois (1 offert), annuel 10 mois (2 offerts)
  slot: string; // « Jeu · 14h00 · Yéman »
  nextIso: string; // prochaine échéance
  /** ── CE QUI A FAIT CE PRIX — 1er septembre 2026 ────────────────
      Le calibre et la longueur au moment de la vente, écrits noir sur blanc.

      SANS CETTE TRACE, LE PRIX NE SE RELIT PLUS. Une tête grossit, une tête se
      refait ; six mois plus tard, personne ne saurait dire pourquoi cette
      abonnée-là paie 201 500 F quand la formule en affiche 168 000. Et
      `ecartDuPrixConvenu` compterait 20 % de faveur là où il n'y a que le
      tarif de son calibre. */
  calibreVendu?: string;
  longueurVendue?: LongueurId;
  /** Date d'inscription (ISO) — l'ancienneté S'AFFICHE calculée depuis cette date.
      L'ancien champ `since` était une chaîne figée (« ce mois ») qui ne vieillissait
      jamais ; il reste porté par les abonnées d'avant, en repli d'affichage. */
  sinceIso?: string;
  since: string; // hérité — « 8 mois » figé (repli si sinceIso absent)
  /** `exhausted` n'existe QUE pour un pack : tous les crédits consommés. Un
      abonnement à cycle ne s'épuise pas, il se recharge ou il se rompt. */
  status: 'active' | 'new' | 'risk' | 'churn' | 'exhausted';
  mrrXof: number; // NORMALISÉ mensuel (annuel = montant annuel / 12) — alimente le MRR
  payments?: Payment[]; // règlements enregistrés, avec dates
  /** ÉCHÉANCIER — écrit UNE FOIS à la signature, quand l'abonnement dépasse
      100 000 F et que la tête choisit de payer en 2 ou 4 fois. Absent = elle
      règle en une fois, à chaque échéance de cycle, comme avant.
      L'ÉTAT de chaque échéance ne se stocke pas : il se dérive des règlements
      (voir `shared/echeancier.ts`). Un « payé » écrit à côté de ses versements
      finit toujours par les contredire. */
  echeances?: Echeance[];
  /** L'OPTION COULEUR — les blancs couverts, ou le gris sublimé. Elle vit sur
      l'ABONNÉE et non sur la formule : la même Année Sereine se prend avec ou
      sans, et une dame peut changer de voie sans résilier. Voir
      `shared/couleur.ts`. Absente = elle n'a pas pris l'option. */
  couleur?: OptionCouleur;
  note?: string;
  /* — pack à crédits — */
  /** Jour d'achat du pack (ISO). C'est le début de sa fenêtre de consommation :
      tout RDV couvert entre cette date et l'échéance décompte ses crédits. */
  startIso?: string;
  /** Échéance du pack (ISO). `null` = sans limite de durée. */
  expiresIso?: string | null;
  /** Prix TOTAL payé pour le pack — à ne pas confondre avec `mrrXof`, qui
      normalise en mensuel pour le MRR et n'a pas de sens sur un paquet. */
  priceXof?: number;

  /* ── CE QUI SE CONVIENT AU COMPTOIR — 28 août 2026 ────────────────
     « I need to be able to have it personnalized per clients and select a
     client to sell it to with its own price for each different client. »

     TROIS CHAMPS, ET ILS VIVENT SUR L'ABONNÉE, JAMAIS SUR LA FORMULE. Poser
     le prix négocié de Mérine sur L'Année Sereine le donnerait à toutes les
     suivantes, et à la vitrine du comptoir. La formule reste la formule ;
     ce qui se négocie se pose ici, sur cette tête-là.

     TOUS TROIS FACULTATIFS, ET C'EST LA RÈGLE : absents, l'abonnement lit sa
     formule exactement comme avant. Les abonnements déjà signés n'ont donc
     rien à reprendre, et une vente ordinaire n'a pas un champ de plus à
     remplir. */

  /** LE PRIX CONVENU pour cette tête. Absent = le prix de la formule.
      Sur un abonnement à cycle, c'est le montant DU CYCLE : il vaut donc
      aussi pour les renouvellements, comme une parole donnée. */
  prixConvenuXof?: number;
  /** Pourquoi ce prix. Facultatif (décision du 28 août) : au comptoir, pressé,
      on vend sans écrire. Mais un prix sans raison devient une discussion trois
      mois plus tard, quand personne ne se souvient. */
  motifConvenu?: string;
  /** LE CONTENU AJUSTÉ pour cette tête — quantités changées, prestation
      retirée, prestation ajoutée. Absent = le contenu de la formule. */
  inclusPropres?: PlanIncluded[];
  /** LA PIÈCE DE CET ABONNEMENT — 29 août 2026.

      « Un règlement encaissé au comptoir ne devrait pas être QUE sur la fiche
      de l'abonnement. Il doit créer un mouvement de caisse et une facture »
      (Yéman). Il avait raison, et le trou était sérieux : `savePay` inscrivait
      le versement dans `payments[]` et NULLE PART AILLEURS. Ni pièce, ni
      caisse — le journal de caisse se dérive des règlements de factures, donc
      cet argent n'entrait dans aucun tiroir et ne paraissait dans aucun
      chiffre d'affaires.

      La pièce naît au PREMIER règlement et se garde : les versements suivants
      s'y ajoutent, comme une facture réglée en deux fois. */
  invoiceId?: string;

  /** La durée de vie ajustée d'un pack, en jours. Absente = celle de la
      formule. Sans effet sur un abonnement à cycle, qui ne s'épuise pas. */
  validiteJours?: number;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const SUBSCRIBERS_SEED: Subscriber[] = [];

export const subscribersStore = createStore<Subscriber[]>('mnd_abo_members', SUBSCRIBERS_SEED);
export const useSubscribers = () => useStore(subscribersStore);
/** Cycles de facturation d'un abonnement (règles Maison ci-dessous). */
export type SubCycle = 'mensuel' | 'semestriel' | 'annuel';

/** Nombre de MOIS facturés pour un cycle (le reste est offert) :
    mensuel = 1 · semestriel = 5 payés sur 6 (1 offert) · annuel = 10 sur 12 (2 offerts). */
const CYCLE_MONTHS_PAID: Record<SubCycle, number> = { mensuel: 1, semestriel: 5, annuel: 10 };
/** Durée d'un cycle en mois — sert au MRR normalisé. */
const CYCLE_MONTHS_SPAN: Record<SubCycle, number> = { mensuel: 1, semestriel: 6, annuel: 12 };
/** Durée d'un cycle en jours — sert aux échéances. */
export const cycleDays = (cycle: SubCycle): number => (cycle === 'annuel' ? 365 : cycle === 'semestriel' ? 180 : 30);
/** Libellé lisible d'un cycle, mois offerts compris. */
export const cycleLabel = (cycle: SubCycle): string =>
  cycle === 'annuel' ? 'Annuel · 2 mois offerts' : cycle === 'semestriel' ? 'Semestriel · 1 mois offert' : 'Mensuel';

/** Prix annuel d'une formule : 10 mois payés, 2 mois offerts (règle Maison). */
export const annualPriceXof = (monthlyXof: number) => monthlyXof * CYCLE_MONTHS_PAID.annuel;
/** Prix semestriel : 5 mois payés, 1 mois offert (règle Maison). */
export const semestrielPriceXof = (monthlyXof: number) => monthlyXof * CYCLE_MONTHS_PAID.semestriel;
/** Montant réellement facturé pour un cycle donné. */
export const subCycleAmountXof = (monthlyXof: number, cycle: SubCycle) =>
  monthlyXof * CYCLE_MONTHS_PAID[cycle];
/** Contribution NORMALISÉE (mensuelle) au MRR selon le cycle. */
export const subMonthlyXof = (monthlyXof: number, cycle: SubCycle) =>
  cycle === 'mensuel' ? monthlyXof : Math.round((monthlyXof * CYCLE_MONTHS_PAID[cycle]) / CYCLE_MONTHS_SPAN[cycle]);
/** TOUS les abonnements vivants d'une cliente, du plus récent au plus ancien.

    UNE SEULE FORMULE À LA FOIS EST LA RÈGLE, et le serveur la tient depuis la
    0077 : deux abonnements ouverts, ce sont deux compteurs de crédits sur les
    mêmes rendez-vous, et personne ne sait lequel se décompte.

    LE COMPTOIR, LUI, NE LA TENAIT PAS. On pouvait inscrire deux fois la même
    tête sans un mot, et c'est arrivé (Mylène, 1er septembre 2026) : la fiche
    d'un rendez-vous lisait alors l'ANCIENNE formule, annonçait qu'elle ne
    couvrait rien, et le rituel se facturait plein alors que la nouvelle
    formule le portait. */
export const abonnementsVivantsDe = (subs: Subscriber[], clientId: string): Subscriber[] => {
  /* UN PAQUET DONT LA DATE EST PASSÉE EST TERMINÉ — 1er septembre 2026. « Elle
     a un abonnement qui est déjà terminé » (Yéman). Un pack porte sa date de
     fin (`expiresIso`) ; la laisser passer sans rien en faire gardait sa
     formule « vivante » indéfiniment, et c'est elle qu'on opposait à la tête
     qui venait d'en reprendre une neuve.

     L'ALLOCATION ÉPUISÉE, ELLE, NE TERMINE RIEN : un cycle se remet à zéro à
     l'échéance, et une abonnée mensuelle qui a tout consommé ce mois-ci reste
     abonnée. Ce sont deux choses différentes, et les confondre résilierait des
     abonnements en cours. */
  const aujourdhui = todayIsoLocal();
  return subs
    .filter((s) => s.clientId === clientId
      && s.status !== 'churn'
      && !(s.expiresIso && s.expiresIso < aujourdhui))
    .sort((a, b) => ((a.sinceIso ?? '') < (b.sinceIso ?? '') ? 1 : -1));
};

/** L'abonnement actif d'une cliente, ou undefined.

    LE PLUS RÉCENT L'EMPORTE quand il y en a plusieurs. `find` rendait le
    PREMIER du magasin, c'est-à-dire le plus anciennement écrit : la tête qui
    venait de reprendre une formule se voyait opposer celle de l'an dernier. */
export const activeSubscriberOf = (subs: Subscriber[], clientId: string): Subscriber | undefined =>
  abonnementsVivantsDe(subs, clientId)[0];
/** Somme réglée par l'abonnée (tous règlements confondus). */
export const subPaid = (s: Subscriber) => (s.payments ?? []).reduce((a, p) => a + p.amountXof, 0);
/* ---------- Prestations incluses — sélection & SUIVI de consommation ---------- */

const isoRe = /^\d{4}-\d{2}-\d{2}$/;
const todayIsoLocal = () => new Date().toISOString().slice(0, 10);
/** J±`days` depuis une date ISO (midi local — insensible aux fuseaux). */
export const addDaysFromISO = (iso: string, days: number) =>
  new Date(new Date(`${iso}T12:00:00`).getTime() + days * 86400000).toISOString().slice(0, 10);

/** Fenêtre [début, fin) du cycle EN COURS d'un abonné : la fenêtre se termine à
    l'échéance à venir (`nextIso`) et remonte d'une durée de cycle. Le suivi de
    consommation se lit dans cette fenêtre — il se remet donc à zéro à chaque
    nouveau cycle, sans écriture ni compteur à synchroniser. */
export const cycleWindow = (sub: Subscriber): { start: string; end: string } => {
  const cycle = sub.cycle ?? 'mensuel';
  const end = isoRe.test(sub.nextIso) ? sub.nextIso : addDaysFromISO(todayIsoLocal(), cycleDays(cycle));
  return { start: addDaysFromISO(end, -cycleDays(cycle)), end };
};

/** LA FENÊTRE DE CONSOMMATION — celle dans laquelle on compte les rituels couverts.

    · pack  — de l'achat à l'échéance, d'un seul tenant. Les crédits ne se
              rechargent jamais : c'est toute la vie du pack qui compte.
    · cycle — la fenêtre glissante de l'abonnement récurrent (cycleWindow).

    Lire un pack à travers une fenêtre mensuelle est l'erreur qui vide les
    compteurs : le pack annuel de Diane D., consommé de juin 2025 à juin
    2026, affichait 0 sur 6 dès qu'on sortait du mois courant. Un pack sans
    échéance court jusqu'à une borne volontairement lointaine plutôt que
    jusqu'à « aujourd'hui » — sinon un rendez-vous PRIS D'AVANCE, déjà couvert
    et déjà décompté au comptoir, sortirait de la fenêtre et rendrait ses
    crédits comme s'il n'avait pas eu lieu. */
export const subWindow = (sub: Subscriber, plan: Plan | undefined): { start: string; end: string } => {
  if (plan?.mode !== 'pack') return cycleWindow(sub);
  const start = sub.startIso && isoRe.test(sub.startIso) ? sub.startIso : (sub.sinceIso ?? '0000-01-01');
  const end = sub.expiresIso && isoRe.test(sub.expiresIso) ? sub.expiresIso : '9999-12-31';
  return { start, end };
};

/** CE RENDEZ-VOUS DÉCOMPTE-T-IL LES CRÉDITS DE CET ABONNEMENT ?

    Deux façons de le rattacher, et la première prime :
    · `subId` — le lien EXPLICITE vers un abonnement précis. Indispensable dès
      qu'une cliente porte deux packs : sans lui, ses rendez-vous se décomptent
      sur les deux à la fois. Et comme le lien est explicite, il se passe de la
      fenêtre de dates — un pack saisi après coup couvre des séances antérieures
      à son enregistrement.
    · `clientId` + fenêtre — le repli, pour les rendez-vous d'avant ce champ.
      La fenêtre reste indispensable là : elle est la seule chose qui empêche de
      compter deux cycles pour un abonnement récurrent. */
export const coversSub = (a: Appointment, sub: Subscriber, plan: Plan | undefined): boolean => {
  if (!a.coveredBySub || a.status === 'annulé') return false;
  if (a.subId) return a.subId === sub.id;
  if (a.clientId !== sub.clientId) return false;
  const { start, end } = subWindow(sub, plan);
  return a.date >= start && a.date < end;
};

/** Consommation d'une prestation incluse : une ligne par prestation de la formule.
    « Utilisée » = RDV COUVERT (coveredBySub), non annulé, daté dans la FENÊTRE de
    l'abonnement — le cycle en cours pour un abonnement récurrent, toute la durée
    de vie du paquet pour un pack à crédits. `remaining === null` = illimité.

    Rien n'est stocké : le compteur se relit depuis les rendez-vous. Vérifié sur
    les 7 abonnements repris de l'ancien ERP — 18 lignes de crédit sur 18
    retrouvées à l'unité près, sans qu'aucun compteur ait été importé. */
export type IncludedUsage = { serviceId: string; qty: number | null; used: number; remaining: number | null };

/** LES RENDEZ-VOUS QUI DÉCOMPTENT CET ABONNEMENT, du plus récent au plus ancien.

    Même juge que le compteur (`coversSub`), même fenêtre : c'est la condition
    pour que la liste et le nombre ne se contredisent jamais. */
export const rdvCouvertsDe = (sub: Subscriber, plan: Plan | undefined, appts: Appointment[]): Appointment[] =>
  appts
    .filter((a) => coversSub(a, sub, plan))
    .sort((a, b) => (a.date === b.date ? (a.time < b.time ? 1 : -1) : (a.date < b.date ? 1 : -1)));

/** LE COMPTEUR AVEC SES RENDEZ-VOUS — 1er septembre 2026.

    « Je veux ouvrir le suivi des packs et les RDV associés » (Yéman).

    UN COMPTEUR SANS SES PIÈCES NE SE VÉRIFIE PAS. « 6 / 6 utilisées » ne dit
    pas QUELLES séances ont mangé les jetons : on ne peut ni contrôler un
    décompte que la cliente conteste, ni retrouver le rendez-vous coché par
    erreur, ni voir qu'il en manque un. Chaque ligne porte donc les rendez-vous
    qui la consomment, et `used` N'EST PLUS COMPTÉ À PART : c'est la longueur de
    la liste. Deux façons de compter la même chose finissent par diverger.

    UN RENDEZ-VOUS PORTANT DEUX PRESTATIONS INCLUSES paraît sur les deux lignes,
    et décompte les deux : c'est bien deux jetons qu'il consomme. */
export type IncludedUsageDetail = IncludedUsage & { rdv: Appointment[] };
export const usageDetaille = (
  sub: Subscriber, plan: Plan | undefined, appts: Appointment[],
): IncludedUsageDetail[] => {
  /* SES QUOTAS À ELLE. Lire ceux de la formule quand on lui en a promis
     d'autres afficherait six jetons à qui on en a vendu huit — la plus sûre
     façon de perdre sa confiance. */
  const inc = inclusVendus(sub, plan);
  if (inc.length === 0) return [];
  const mine = rdvCouvertsDe(sub, plan, appts);
  return inc.map((i) => {
    const rdv = mine.filter((a) => a.serviceIds.includes(i.serviceId));
    return {
      serviceId: i.serviceId, qty: i.qty, used: rdv.length,
      remaining: i.qty === null ? null : Math.max(0, i.qty - rdv.length), rdv,
    };
  });
};

/** LES RENDEZ-VOUS COUVERTS QUI NE DÉCOMPTENT RIEN.

    Un rendez-vous coché « couvert par l'abonnement » dont aucune prestation
    n'est dans la formule ne bouge aucun compteur, et ne se voit donc NULLE
    PART : il se règle comme s'il était offert, sans jeton en face. C'est la
    seule anomalie que le suivi ne pouvait pas montrer, et la plus coûteuse. */
export const rdvCouvertsHorsFormule = (
  sub: Subscriber, plan: Plan | undefined, appts: Appointment[],
): Appointment[] => {
  const inclus = new Set(inclusVendus(sub, plan).map((i) => i.serviceId));
  return rdvCouvertsDe(sub, plan, appts).filter((a) => !a.serviceIds.some((id) => inclus.has(id)));
};

/** Le compteur seul, sans les pièces — pour les écrans qui n'affichent qu'un nombre.
    DÉRIVÉ de `usageDetaille`, jamais recompté : deux façons de compter la même
    chose finissent toujours par diverger d'un jeton, un jour, sur une fiche. */
export const subServiceUsage = (sub: Subscriber, plan: Plan | undefined, appts: Appointment[]): IncludedUsage[] =>
  usageDetaille(sub, plan, appts).map(({ serviceId, qty, used, remaining }) => ({ serviceId, qty, used, remaining }));

/* ── CE QUI A ÉTÉ RÉELLEMENT VENDU — 28 août 2026 ────────────────────
   Un prix négocié qui ne descendrait que dans l'écran de vente serait pire que
   pas de prix négocié du tout : la caisse, le suivi et Ma Couronne diraient
   chacun un chiffre différent, et personne ne saurait lequel croire. Ces
   quatre fonctions sont donc LE SEUL JUGE de ce qui a été vendu. Tout écran
   qui affiche un prix, un quota ou une échéance passe par elles.

   LA RÈGLE EST LA MÊME PARTOUT : ce que porte l'abonnée l'emporte, et à
   défaut la formule parle. */

/** LES CALIBRES DE LA MAISON, lus paresseusement.

    LE JUGE DOIT ÊTRE COMPLET SANS QU'ON LUI TENDE RIEN — 1er septembre 2026.
    Ces fonctions sont appelées depuis des dizaines d'écrans ; leur demander
    d'aller chercher le barème obligerait chacun à y penser, et le premier qui
    l'oublierait afficherait le prix de référence à une tête Micro. Le barème
    est un document de la Maison, pas un paramètre d'appel.

    Lu au moment de l'appel, jamais au chargement du module : nouer les deux
    ferait dépendre l'ordre des imports. */
const lesCalibres = (): ModelBand[] => {
  /* LE BARÈME DES ABONNEMENTS, pas celui du fauteuil — 1er septembre 2026.
     Un engagement de dix mois ne se majore pas comme une séance. Tant que la
     Maison n'a pas écarté les deux, ce barème EST celui des prestations, et
     rien ne bouge. */
  try { return bandsAbonnements(bandSetsStore.get(), modelBandsStore.get()); } catch { return []; }
};

/** CE QUE PORTE LA FORMULE, EN TOUTES LETTRES — 1er septembre 2026.

    Le même texte sert la facture, le suivi et demain le rappel : l'écrire deux
    fois, c'est promettre « 6 resserrages » d'un côté et « 6 × resserrage » de
    l'autre, puis se demander lequel fait foi.

    LES QUOTAS SONT LES SIENS (`inclusVendus`), jamais ceux du catalogue : une
    facture qui annoncerait six lavages à qui on en a vendu huit se retournerait
    contre la Maison le jour du septième. */
export const libellesInclus = (
  sub: Subscriber, plan: Plan | undefined, nomDuService: (id: string) => string,
): string[] =>
  inclusVendus(sub, plan).map((i) => (i.qty === null
    ? `${nomDuService(i.serviceId)} · à volonté`
    : `${i.qty} × ${nomDuService(i.serviceId)}`));

/** LE PRIX RÉELLEMENT VENDU pour un cycle (ou le total d'un pack).

    LE CALIBRE VENDU EST RELU ICI : sans lui, la fiche d'une abonnée Micro
    réafficherait le prix de référence dès le lendemain de la vente, et le
    comptoir aurait annoncé un chiffre que l'écran contredirait. */
export const prixVenduXof = (sub: Subscriber, plan: Plan | undefined, cycle: SubCycle): number =>
  sub.prixConvenuXof ?? (plan
    ? prixDeLaFormule(plan, cycle,
      { bandId: sub.calibreVendu, longueur: sub.longueurVendue }, lesCalibres()).montantXof
    : 0);

/** LE CONTENU RÉELLEMENT VENDU — ses quotas à elle, sinon ceux de la formule. */
export const inclusVendus = (sub: Subscriber, plan: Plan | undefined): PlanIncluded[] =>
  sub.inclusPropres ?? plan?.included ?? [];

/** LA DURÉE DE VIE RÉELLEMENT VENDUE d'un pack, en jours. `null` = sans limite. */
export const validiteVendueJours = (sub: Subscriber, plan: Plan | undefined): number | null =>
  sub.validiteJours ?? plan?.validityDays ?? null;

/** LES MOIS QUE COUVRE CE QUI A ÉTÉ VENDU — la durée ajustée fait foi sur un
    pack, le cycle sur un abonnement récurrent. Sert à ramener au mois. */
export const moisCouvertsVendus = (sub: Subscriber, plan: Plan | undefined, cycle: SubCycle): number => {
  if (plan?.mode === 'pack') return Math.max(1, Math.round((validiteVendueJours(sub, plan) ?? 365) / 30));
  return plan ? prixDeLaFormule(plan, cycle, { bandId: sub.calibreVendu }, lesCalibres()).moisCouverts : 1;
};

/** LA PART MENSUELLE DE CE QUI A ÉTÉ VENDU — c'est elle qui alimente le MRR.
    Sur le prix du catalogue, la Maison lirait chaque mois un revenu qu'elle
    n'encaisse pas. */
export const partMensuelleVendueXof = (sub: Subscriber, plan: Plan | undefined, cycle: SubCycle): number => {
  const mois = moisCouvertsVendus(sub, plan, cycle);
  return mois <= 0 ? 0 : Math.round(prixVenduXof(sub, plan, cycle) / mois);
};

/** Cet abonnement porte-t-il un prix négocié ? Sert à afficher l'écart. */
export const prixEstConvenu = (sub: Subscriber): boolean =>
  typeof sub.prixConvenuXof === 'number' && sub.prixConvenuXof >= 0;

/** L'ÉCART entre le prix du catalogue et le prix convenu. Négatif = elle paie
    moins. `null` quand rien n'a été négocié — il n'y a alors pas d'écart à
    montrer, et zéro n'est pas la même chose qu'absent. */
export const ecartDuPrixConvenu = (
  sub: Subscriber, plan: Plan | undefined, cycle: SubCycle,
  /* LE TARIF DE RÉFÉRENCE EST LE SIEN, PAS CELUI DE LA VITRINE — 1er septembre
     2026. Comparer le prix d'une tête Micro au prix du calibre de référence
     annoncerait « +20 % » sur une vente parfaitement ordinaire, et la Maison
     croirait avoir surfacturé. L'écart ne doit dire qu'UNE chose : ce que la
     Maison a consenti EN PLUS de son tarif. */
  bands: readonly ModelBand[] = lesCalibres(),
): { catalogueXof: number; convenuXof: number; ecartXof: number; pct: number } | null => {
  if (!prixEstConvenu(sub) || !plan) return null;
  const catalogueXof = prixDeLaFormule(plan, cycle, {
    bandId: sub.calibreVendu, longueur: sub.longueurVendue,
  }, bands).montantXof;
  const convenuXof = sub.prixConvenuXof as number;
  return {
    catalogueXof, convenuXof, ecartXof: convenuXof - catalogueXof,
    pct: catalogueXof > 0 ? Math.round(((convenuXof - catalogueXof) / catalogueXof) * 1000) / 10 : 0,
  };
};

/* ── CE QU'ELLE A BESOIN DE VOIR — 29 août 2026 ──────────────────────
   « L'abonnement des foyers ne doit apparaître que sur les comptes des
   personnes qui ont un foyer. Les autres n'en ont pas besoin » (Yéman).

   Une formule à deux ou trois têtes proposée à une tête seule n'est pas une
   offre, c'est une question à laquelle elle ne peut pas répondre : elle
   encombre la vitrine et fait douter du reste. Celle qui voudrait amener sa
   sœur le dit au comptoir, et la Maison lui ouvre le foyer d'abord.

   LE MASQUE DE LA VITRINE RESTE AU-DESSUS. Ceci retire ce qui ne la concerne
   pas ; `formulesVisiblesPour` retire ce que la Maison a décidé de cacher. Les
   deux se composent, dans cet ordre. */
export const formulesPourElle = <T extends { famille?: FamilleFormule }>(
  plans: readonly T[], aUnFoyer: boolean,
): T[] => (aUnFoyer ? plans.slice() : plans.filter((p) => p.famille !== 'foyer'));

/** L'ÉTENDUE DES REMISES ANNONCÉES — « de 17 % à 37 % ». Elle se CALCULE sur
    les formules réellement montrées, jamais écrite à la main : un chiffre posé
    en dur ment le jour où un prix bouge, et il ment à une cliente. Rend `null`
    quand aucune formule n'annonce de remise — on ne promet alors rien. */
export const etendueDesRemises = (
  plans: readonly { discountPct?: number }[],
): { min: number; max: number } | null => {
  const pcts = plans.map((p) => p.discountPct ?? 0).filter((n) => n > 0);
  if (pcts.length === 0) return null;
  return { min: Math.min(...pcts), max: Math.max(...pcts) };
};

/* LE PONT AVEC SUPABASE, POSÉ ICI ET NULLE PART AILLEURS : les deux sœurs
   lisent la même table par le même magasin. */
bindCollection(plansStore, 'plans');
bindCollection(subscribersStore, 'subscribers');

/* ── CE QU'ELLE AURAIT GAGNÉ — 28 août 2026 ───────────────────────────
   « Vos trois derniers rituels vous auraient coûté 18 000 F de moins avec La
   Suite. » C'est le seul argument qu'on ne peut pas discuter : le chiffre est
   le SIEN, calculé sur SES rendez-vous, et il ne demande aucun effort de vente
   au comptoir.

   ON NE COMPTE QUE CE QUE LA FORMULE COUVRE VRAIMENT. Un rituel n'entre dans
   la comparaison que si TOUTES ses prestations sont incluses dans la formule :
   à moitié couvert, il gonflerait l'économie annoncée, et la cliente le
   découvrirait à sa première facture. Mieux vaut promettre moins et tenir.

   LES PACKS NE SE COMPARENT PAS SUR TROIS MOIS. Un paquet de crédits vaut pour
   douze mois : le juger sur une fenêtre courte le ferait paraître ruineux. */

export type RituelPasse = { serviceIds: readonly string[]; netXof: number };

export type Suggestion = {
  plan: Plan;
  /** Ce qu'elle a réellement payé sur les rituels que la formule aurait couverts. */
  depenseXof: number;
  auraitCouteXof: number;
  economieXof: number;
  rituels: number;
};

/** La formule qui lui aurait le plus fait gagner, ou rien si aucune ne l'aurait
    aidée. Rendre une suggestion à économie nulle serait un mensonge poli. */
export function formuleLaPlusUtile(o: {
  plans: readonly Plan[];
  rituels: readonly RituelPasse[];
  /** Sur combien de mois portent ces rituels — un cycle mensuel se paie autant de fois. */
  moisObserves: number;
}): Suggestion | null {
  const mois = Math.max(1, Math.round(o.moisObserves));
  let meilleure: Suggestion | null = null;

  for (const plan of o.plans) {
    /* Un pack ne se juge pas sur une fenêtre courte, et une formule sans
       prestation incluse ne couvre rien de mesurable. */
    if (plan.mode === 'pack') continue;
    const inclus = new Set((plan.included ?? []).map((i) => i.serviceId));
    if (inclus.size === 0) continue;

    const couverts = o.rituels.filter(
      (r) => r.serviceIds.length > 0 && r.serviceIds.every((id) => inclus.has(id)),
    );
    if (couverts.length === 0) continue;

    const depenseXof = couverts.reduce((s, r) => s + Math.max(0, r.netXof), 0);
    const auraitCouteXof = plan.priceXof * mois;
    const economieXof = depenseXof - auraitCouteXof;
    if (economieXof <= 0) continue;

    if (!meilleure || economieXof > meilleure.economieXof) {
      meilleure = { plan, depenseXof, auraitCouteXof, economieXof, rituels: couverts.length };
    }
  }
  return meilleure;
}

/* ── CE QU'UNE FORMULE COÛTE, ET SUR QUELLE PÉRIODE — 28 août 2026 ────
   « L'Éclosion est un abonnement annuel, pourquoi c'est écrit prix mensuel ?
   De même pour tous les autres abonnements à l'année » (Yéman).

   UN PAQUET NE SE MULTIPLIE PAS. `subCycleAmountXof` applique la règle des
   cycles — 5 mois payés sur 6, 10 sur 12 — et l'écran l'appliquait à TOUT,
   paquets compris. L'Éclosion, 225 000 F pour douze mois, s'affichait
   « 225 000 F /mois » en vue mensuelle, et se serait affichée 2 250 000 F en
   vue annuelle. Le prix d'un paquet est son prix, entier, une fois.

   LA VUE PAR CYCLE NE LE CONCERNE PAS NON PLUS : un paquet n'a pas de cycle,
   il a une durée de vie. Le sélecteur en haut de l'écran ne doit donc rien
   lui faire — il ne parle qu'aux abonnements récurrents. */

/** Les mois que couvre un paquet — sa durée de vie, jamais un cycle. */
export const moisDuPack = (p: Plan): number =>
  Math.max(1, Math.round((p.validityDays ?? 365) / 30));

export type PrixAffiche = {
  montantXof: number;
  /** « / mois », « · 12 mois » — ce qui se lit après le chiffre. */
  periode: string;
  /** « 2 mois offerts » quand le cycle en offre ; vide sinon. */
  offert: string;
  /** Sur combien de mois ce montant s'étale — pour ramener au MRR. */
  moisCouverts: number;
  /** Le mot juste dans un formulaire : « Prix du paquet » ou « Prix mensuel ». */
  libelle: string;
};

/** LE PRIX DE BASE D'UNE FORMULE POUR UNE TÊTE DONNÉE — 1er septembre 2026.

    LA CASE LA PLUS PRÉCISE GAGNE, et l'ordre ne se discute nulle part
    ailleurs : un prix qui se calcule à deux endroits finit toujours par
    donner deux résultats.

      ① le prix écrit à la main pour ce calibre, s'il existe ;
      ② sinon le prix de référence × le coefficient du calibre, si
         l'interrupteur est posé ;
      ③ sinon le prix unique de la formule, celui d'avant cette règle.

    LE SUPPLÉMENT DE LONGUEUR N'ENTRE PAS ICI : il s'ajoute APRÈS, une fois le
    cycle appliqué, pour qu'un supplément de 8 000 F ne soit pas multiplié par
    dix dans un paquet annuel. Voir `prixDeLaFormule`. */
export function basePourLaTete(
  p: Plan,
  bands: readonly ModelBand[],
  tete?: TeteConnue,
): number {
  const ecrit = tete?.bandId ? p.prixParCalibre?.[tete.bandId] : undefined;
  if (typeof ecrit === 'number' && ecrit >= 0) return Math.round(ecrit);
  if (!p.suitLeCalibre || !tete?.bandId) return p.priceXof;
  const band = bands.find((b) => b.id === tete.bandId);
  if (!band || !(band.coef > 0)) return p.priceXof;
  return roundPrice(p.priceXof * band.coef);
}

/** Ce que la longueur ajoute. Zéro quand elle est inconnue ou non tarifée :
    on n'invente pas un supplément à une tête dont on ignore la longueur. */
export const supplementDeLongueurXof = (p: Plan, tete?: TeteConnue): number => {
  const v = tete?.longueur ? p.supplementLongueur?.[tete.longueur] : undefined;
  return typeof v === 'number' && v > 0 ? Math.round(v) : 0;
};

/** L'ÉTENDUE DES PRIX D'UNE FORMULE — « de 36 000 à 126 000 F ».

    CALCULÉE, JAMAIS SAISIE : le jour où un coefficient bouge aux Paramètres,
    la fourchette suit sans que personne n'y pense. Rend `null` quand la
    formule ne varie pas — il n'y a alors qu'un prix, et une fourchette de
    deux fois le même chiffre se lirait comme une panne. */
export function etendueDeLaFormule(
  p: Plan,
  cycle: SubCycle,
  bands: readonly ModelBand[],
): { bas: number; haut: number } | null {
  /* ON INTERROGE LE MOTEUR POUR CHAQUE CALIBRE, plutôt que de refaire son
     raisonnement ici. Deux calculs du même prix finiraient par diverger, et
     c'est la vitrine qui mentirait.

     LE PRIX SANS CALIBRE EN FAIT PARTIE : une tête qu'on n'a pas comptée paie
     la référence, et ce montant doit tenir dans la fourchette annoncée. Sans
     lui, une formule tarifée à la main sur un seul calibre annonçait « 90 000
     à 90 000 » alors que six têtes sur sept en paient 45 000. */
  const candidats = [prixDeLaFormule(p, cycle, undefined, bands).montantXof];
  for (const b of bands) {
    candidats.push(prixDeLaFormule(p, cycle, { bandId: b.id }, bands).montantXof);
  }
  /* Une exception posée sur un calibre RETIRÉ du barème depuis se voit encore :
     elle se facture toujours si la tête y tombe. */
  for (const id of Object.keys(p.prixParCalibre ?? {})) {
    candidats.push(prixDeLaFormule(p, cycle, { bandId: id }, bands).montantXof);
  }
  if (candidats.length === 0) return null;
  const bas = Math.min(...candidats);
  const haut = Math.max(...candidats);
  return haut > bas ? { bas, haut } : null;
}

export function prixDeLaFormule(
  p: Plan,
  cycle: SubCycle,
  /* LA TÊTE EST FACULTATIVE, et tous les appels d'avant le 1er septembre 2026
     la laissent vide : ils retombent alors sur le prix unique, au franc près.
     C'est la condition pour qu'aucun écran ne change de chiffre le jour de la
     mise en ligne. */
  tete?: TeteConnue,
  bands: readonly ModelBand[] = [],
): PrixAffiche {
  const base = basePourLaTete(p, bands, tete);
  const enPlus = supplementDeLongueurXof(p, tete);
  if (p.mode === 'pack') {
    const mois = moisDuPack(p);
    return {
      montantXof: base + enPlus,
      periode: `· ${mois} mois`,
      offert: '',
      moisCouverts: mois,
      libelle: 'Prix du paquet',
    };
  }
  return {
    montantXof: subCycleAmountXof(base, cycle) + enPlus,
    periode: cycle === 'annuel' ? '/ an' : cycle === 'semestriel' ? '/ 6 mois' : '/ mois',
    offert: cycle === 'annuel' ? '2 mois offerts' : cycle === 'semestriel' ? '1 mois offert' : '',
    moisCouverts: cycle === 'annuel' ? 12 : cycle === 'semestriel' ? 6 : 1,
    libelle: 'Prix mensuel',
  };
}

/** La part MENSUELLE d'une formule, paquet compris — ce qui nourrit le MRR.
    Un paquet de 225 000 F sur douze mois pèse 18 750 F par mois, pas 225 000 :
    le compter entier gonflerait le revenu récurrent du mois de la signature,
    puis il disparaîtrait. */
export const partMensuelleDeLaFormule = (p: Plan, cycle: SubCycle): number => {
  const a = prixDeLaFormule(p, cycle);
  return a.moisCouverts <= 0 ? 0 : Math.round(a.montantXof / a.moisCouverts);
};

/* ── CE QUE LA FORMULE VAUT À LA CARTE — 28 août 2026 ─────────────────
   « J'ai besoin de voir le calcul se faire dès que je choisis des services.
   Un total pour me situer » (Yéman).

   Le prix d'une formule ne se décide pas dans le vide : il se décide CONTRE
   la carte. Sans ce total sous les yeux, on pose un chiffre au jugé et on
   découvre trois mois plus tard qu'on a remisé de 40 % ou de 2 %.

   LES QUOTAS ILLIMITÉS NE SE CHIFFRENT PAS, et on ne les compte donc pas
   pour zéro : ce serait faire croire à une remise énorme sur une formule qui
   n'a peut-être aucune marge. Ils se comptent à part, et l'écran le dit. */

export type ValeurCarte = {
  /** Ce que la cliente paierait à la carte pour ce qui est chiffrable. */
  totalXof: number;
  /** Combien de lignes sont illimitées — donc hors du calcul. */
  illimitees: number;
  /** Combien de lignes pointent une prestation absente du catalogue. */
  introuvables: number;
};

export function valeurALaCarte(
  included: readonly PlanIncluded[] | undefined,
  prixDuService: (serviceId: string) => number | undefined,
): ValeurCarte {
  let totalXof = 0;
  let illimitees = 0;
  let introuvables = 0;
  for (const i of included ?? []) {
    const prix = prixDuService(i.serviceId);
    if (prix === undefined) { introuvables++; continue; }
    if (i.qty === null) { illimitees++; continue; }
    totalXof += Math.max(0, prix) * Math.max(0, i.qty);
  }
  return { totalXof, illimitees, introuvables };
}

/** CE QU'ELLE GAGNE, ELLE — 1er septembre 2026.

    « Il faudra personnaliser ce message selon le prix de chacun. Combien la
    nouvelle remise leur donne comme nouveau total de remise » (Yéman).

    LES DEUX MOITIÉS DOIVENT SUIVRE LA MÊME TÊTE. Le gain se lit « ce que la
    carte coûterait moins ce que la formule demande » : si la carte se calcule
    au prix de la cliente et la formule au prix de référence, l'écart annoncé
    n'existe pour personne. Une tête Micro paie ses resserrages plus cher à la
    carte ET son abonnement plus cher : son gain n'est celui de personne
    d'autre.

    `prixDuService` doit donc être le prix PERSONNEL de la cliente
    (`personalPriceXof`), jamais celui du catalogue. */
export function gainPourElle(
  plan: Plan,
  cycle: SubCycle,
  tete: TeteConnue | undefined,
  bands: readonly ModelBand[],
  prixDuService: (serviceId: string) => number | undefined,
): { carteXof: number; prixXof: number; gainXof: number; pct: number; illimitees: number; introuvables: number } {
  const carte = valeurALaCarte(plan.included, prixDuService);
  const prixXof = prixDeLaFormule(plan, cycle, tete, bands).montantXof;
  const { gainXof, pct } = remiseSurLaCarte(carte.totalXof, prixXof);
  return { carteXof: carte.totalXof, prixXof, gainXof, pct, illimitees: carte.illimitees, introuvables: carte.introuvables };
}

/** Un avantage écrit à la main parle-t-il déjà du gain ? Ceux-là sont REMPLACÉS
    par la phrase calculée : deux chiffres sur le même sujet, dont l'un figé
    dans un texte, finissent toujours par se contredire. */
export const perkParleDeLaCarte = (perk: string): boolean =>
  /à la carte|vous gagnez|de remise|sur la carte/i.test(perk);

/** L'écart entre la carte et le prix demandé. Négatif = la formule coûte PLUS
    cher que la carte, ce qu'aucune cliente n'accepte : l'écran doit le crier
    plutôt que de l'afficher comme une remise négative. */
export const remiseSurLaCarte = (carteXof: number, prixXof: number): { gainXof: number; pct: number } => {
  if (carteXof <= 0) return { gainXof: 0, pct: 0 };
  const gainXof = carteXof - Math.max(0, prixXof);
  return { gainXof, pct: Math.round((gainXof / carteXof) * 100) };
};
