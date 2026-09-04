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
import { etatDesEcheances, resteDeLEcheancier, enRetardXof } from './echeancier';
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
  /** LE NUMÉRO DU CONTRAT — « ABO-2026-014 ». Posé à la signature, jamais
      réécrit, unique dans la Maison. C'est lui qui distingue deux fois la même
      formule pour la même tête dans la même année. Absent sur les abonnements
      d'avant le 1er septembre 2026 : on ne leur en fabrique pas un après coup,
      il prétendrait avoir été donné à la signature. */
  reference?: string;
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
/* ══ DEUX FOIS LA MÊME FORMULE, ET RIEN POUR LES DISTINGUER ═══════════
   « Il arrive qu'une cliente ait acheté La Juste Cadence 2 fois dans la même
   année, comment je distingue une Juste Cadence de l'autre ? » (Yéman, 1er
   septembre 2026).

   RIEN NE LES DISTINGUAIT À L'ŒIL. Deux lignes portant le même nom et la même
   formule, séparées par le seul identifiant technique que personne ne voit.
   On ne pouvait ni les nommer au téléphone, ni dire laquelle une facture
   règle, ni savoir laquelle un rendez-vous décompte.

   UNE RÉFÉRENCE, COMME UNE FACTURE. Écrite à la signature, jamais réécrite :
   c'est le numéro du contrat, et il survit à tout ce qu'on change ensuite.
   Trois chiffres, l'année devant, parce qu'un abonnement est plus rare qu'une
   pièce de caisse et que « ABO-2026-014 » se lit à voix haute. */
export const PREFIXE_ABO = 'ABO';

export function prochaineReferenceAbo(subs: Subscriber[], annee = new Date().getFullYear()): string {
  const re = new RegExp(`^${PREFIXE_ABO}-${annee}-(\\d+)$`);
  const prises = new Set<string>();
  let max = 0;
  for (const s of subs) {
    if (!s?.reference) continue;
    prises.add(s.reference);
    const m = re.exec(s.reference);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  /* ON NE REPREND JAMAIS UN NUMÉRO DÉJÀ PRIS, même si la suite a des trous :
     deux contrats de même référence seraient pires que pas de référence. */
  let n = max + 1;
  let ref = `${PREFIXE_ABO}-${annee}-${String(n).padStart(3, '0')}`;
  while (prises.has(ref)) {
    n += 1;
    ref = `${PREFIXE_ABO}-${annee}-${String(n).padStart(3, '0')}`;
  }
  return ref;
}

/** CE QUI NOMME UN CONTRAT À VOIX HAUTE.

    La référence quand elle existe. Sinon SA DATE DE DÉPART, qui est la seule
    chose qui distinguait déjà deux formules identiques : « sa Juste Cadence de
    novembre » se dit, se comprend, et se retrouve dans la liste. Les
    abonnements d'avant ce champ ne se réécrivent pas pour autant : une
    référence posée après coup prétendrait avoir été donnée à la signature. */
export const nomDuContrat = (sub: Subscriber): string =>
  sub.reference ?? (sub.sinceIso ? `depuis le ${sub.sinceIso}` : 'sans référence');

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
/** LE JOUR OÙ CE CONTRAT A COMMENCÉ D'EXISTER. Ni la fenêtre du cycle en cours,
    ni l'échéance : la signature. Rien de plus ancien ne le concerne. */
export const debutDuContrat = (sub: Subscriber): string =>
  (sub.startIso && isoRe.test(sub.startIso) ? sub.startIso : sub.sinceIso) ?? '0000-01-01';

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
/** CE JOUR-LÀ, LE CONTRAT EST-IL EN VIE ?

    « Il me reste une séance pour clôturer la Juste Cadence de 2025 au 30 juin
    2026 et il ne prend pas le RDV du 30/06/26, il me le facture » (Yéman,
    2 septembre 2026).

    LE DERNIER JOUR EN FAISAIT PARTIE, ET IL ÉTAIT EXCLU. La fenêtre se testait
    `date < fin` des deux côtés, cycle et paquet confondus. Un paquet « valable
    du 10 octobre au 30 juin » perdait donc le 30 juin, c'est-à-dire le jour où
    l'on vient justement solder son dernier crédit, puisque c'est la date écrite
    sur le contrat. La cliente lisait « au 30 juin », l'écran lui facturait
    45 000 F.

    LES DEUX RÉGIMES NE SE TESTENT PAS PAREIL, et c'est la source de l'erreur :
    · un PAQUET porte une date de FIN, le dernier jour où ses crédits valent.
      Elle est INCLUSE, exactement comme elle est annoncée.
    · un CYCLE porte une ÉCHÉANCE, qui est la frontière entre deux cycles. Elle
      est EXCLUE, sinon un rituel tombant ce jour-là compterait deux fois. */
export const dansLaVieDuContrat = (
  sub: Subscriber, plan: Plan | undefined, dateIso: string,
): boolean => {
  /* RIEN AVANT LA SIGNATURE, sous aucun prétexte : un fait de calendrier, pas
     un réglage. Un paquet enregistré après coup pour couvrir des séances
     anciennes se règle en corrigeant SA date de début, depuis le Suivi. */
  if (dateIso < debutDuContrat(sub)) return false;
  return !sub.expiresIso || dateIso <= sub.expiresIso;
};

export const coversSub = (a: Appointment, sub: Subscriber, plan: Plan | undefined): boolean => {
  if (!a.coveredBySub || a.status === 'annulé') return false;
  /* ══ RIEN AVANT LE DÉBUT DU CONTRAT — 1er septembre 2026 ══════════════
     « Ne pas mettre les RDV du passé sur le nouvel abonnement. Arrêter de
     faire augmenter un abonnement fini. Interdire carrément » (Yéman).

     LE LIEN EXPLICITE PASSAIT OUTRE TOUT, y compris l'existence du contrat.
     Rouvrir un rituel d'octobre 2025 pour l'enregistrer lui posait le lien vers
     le contrat EN COURS, celui de septembre 2026 : une séance rendue onze mois
     avant la signature gonflait un contrat qui n'existait pas encore, jusqu'à
     8 / 6 sur une formule neuve.

     CETTE BORNE-CI NE SE DISCUTE PAS. Un rendez-vous antérieur à la signature
     n'est porté par ce contrat sous AUCUN prétexte : c'est un fait de
     calendrier, pas un réglage. Un paquet enregistré après coup pour couvrir
     des séances anciennes se règle en corrigeant SA date de début, qui se
     touche depuis le Suivi. */
  /* LES DEUX BORNES DE SA VIE, LIEN EXPLICITE OU PAS. Le lien sert à départager
     deux contrats dont les fenêtres se chevauchent, pas à ressusciter un paquet
     clos ni à faire porter au présent un rituel du passé. */
  if (!dansLaVieDuContrat(sub, plan, a.date)) return false;
  if (a.subId) return a.subId === sub.id;
  if (a.clientId !== sub.clientId) return false;
  /* LA VIE DU PAQUET EST SA FENÊTRE, et elle vient d'être vérifiée, dernier jour
     compris. Un abonnement à CYCLE, lui, ne compte que le cycle EN COURS :
     c'est la seule chose qui l'empêche de compter deux cycles à la fois. */
  if (plan?.mode === 'pack') return true;
  const { start, end } = cycleWindow(sub);
  return a.date >= start && a.date < end;
};

/** LE CONTRAT EN VIGUEUR À CETTE DATE, celui qui doit porter le rituel.

    « Tous les RDV que je passe doivent aller sur l'abonnement qui couvre la
    période de l'abonnement » (Yéman, 1er septembre 2026).

    LA MODALE RETENAIT « SON ABONNEMENT ACTUEL », c'est-à-dire le plus récent,
    quelle que soit la date du rituel. Deux contrats successifs suffisaient donc
    à faire porter le passé par le présent.

    LE PLUS RÉCENT DONT LA SIGNATURE EST DÉJÀ PASSÉE. Un paquet meurt à son
    échéance et ne se rattrape pas ; un abonnement à cycle, lui, se recharge, et
    un rendez-vous pris pour dans trois mois lui revient bien — c'est la
    différence entre une réserve de crédits et un engagement qui court. */
export const contratPourLaDate = (
  subs: readonly Subscriber[], clientId: string, dateIso: string, plans: readonly Plan[],
): Subscriber | undefined =>
  subs
    .filter((s) => s.clientId === clientId && s.status !== 'churn')
    /* UN PAQUET FINI EST FINI : au-delà de sa date de fin, ses crédits ne valent
       plus rien et rien ne doit s'y ajouter. Mais LE DERNIER JOUR EN FAIT
       PARTIE, c'est celui-là qu'on vient solder. */
    .filter((s) => dansLaVieDuContrat(s, plans.find((p) => p.id === s.planId), dateIso))
    .sort((a, b) => (debutDuContrat(a) < debutDuContrat(b) ? 1 : -1))[0];

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

/* ══ LE COMPTE D'ABONNEMENT — 2 septembre 2026 ═══════════════════════
   « Créer des comptes abonnements pour chaque client distinctif. Quand il
   entame un nouveau. Facile à suivre. Quand c'est actif, quand un abonnement
   devient inactif. Bien faire la part des choses » (Yéman).

   L'ÉCRAN LISTAIT DES CONTRATS, PAS DES TÊTES. Une cliente y paraissait deux
   fois à cinq lignes d'écart, et rien ne disait que c'était la même personne ni
   que l'un avait succédé à l'autre. */

/** L'ÉTAT D'UN CONTRAT, LU ET NON STOCKÉ.

    LE CHAMP `status` EST ÉCRIT À LA VENTE et presque jamais remis à jour :
    l'écran annonçait « 9 abonnés actifs » en haut et « Actives 4 » en bas, les
    cinq manquants n'étant dans aucune case. Un état qui se stocke vieillit mal.
    Celui-ci se lit sur les dates et les crédits, donc il est vrai à la seconde
    où on le regarde.

    L'ORDRE DES QUESTIONS EST LA DÉFINITION :
    · résilié — arrêté à la main. Le seul départ véritable, et il prime : une
      résiliation le jour de l'échéance reste une résiliation.
    · terminé — la date de fin est passée. Crédits consommés ou non ; ceux qui
      restent disent que la formule était trop grande pour elle.
    · épuisé — tous les crédits consommés, la fenêtre court encore. C'est le
      moment de revendre : la tête est là, elle vient, et elle repassera au
      plein tarif à sa prochaine venue. RÉSERVÉ AUX PAQUETS : un abonnement à
      cycle qui a tout consommé n'est pas épuisé, il se recharge à l'échéance.
    · en cours — tout le reste. */
export type EtatContrat = 'resilie' | 'termine' | 'epuise' | 'en-cours';

export const etatDuContrat = (
  sub: Subscriber, plan: Plan | undefined, appts: Appointment[], aujourdhui: string,
): EtatContrat => {
  if (sub.status === 'churn') return 'resilie';
  if (sub.expiresIso && sub.expiresIso < aujourdhui) return 'termine';
  if (plan?.mode !== 'pack') return 'en-cours';
  const lignes = usageDetaille(sub, plan, appts);
  /* SANS PRESTATION INCLUSE, RIEN NE PEUT S'ÉPUISER : un paquet qui ne porte
     aucun crédit se règle au comptoir et court jusqu'à sa date. */
  if (lignes.length === 0) return 'en-cours';
  const tousBus = lignes.every((u) => u.qty !== null && (u.remaining ?? 0) <= 0);
  return tousBus ? 'epuise' : 'en-cours';
};

export const ETAT_LABEL: Record<EtatContrat, string> = {
  'en-cours': 'En cours', epuise: 'Épuisé', termine: 'Terminé', resilie: 'Résilié',
};

/** CE QUI RESTE DÛ SUR UN CONTRAT.

    L'ÉCHÉANCIER FAIT FOI QUAND IL EXISTE : c'est ce qui a été convenu, date par
    date. Sans échéancier, un PAQUET doit son prix moins ce qui a été versé.

    UN ABONNEMENT À CYCLE NE DOIT RIEN : il se règle lune après lune, et compter
    son prix comme une dette ferait apparaître une créance qui n'existe pas. */
export const resteDuContrat = (sub: Subscriber, plan: Plan | undefined, aujourdhui: string): number => {
  const verse = subPaid(sub);
  if (sub.echeances?.length) return resteDeLEcheancier(etatDesEcheances(sub.echeances, verse, aujourdhui));
  if (plan?.mode !== 'pack') return 0;
  return Math.max(0, prixVenduXof(sub, plan, sub.cycle ?? 'mensuel') - verse);
};

export const retardDuContrat = (sub: Subscriber, aujourdhui: string): number =>
  sub.echeances?.length ? enRetardXof(etatDesEcheances(sub.echeances, subPaid(sub), aujourdhui)) : 0;

export type ContratDuCompte = {
  sub: Subscriber;
  plan: Plan | undefined;
  etat: EtatContrat;
  /** Le détail par prestation, calculé UNE fois. Les écrans qui chiffrent la
      dette de fauteuil le relisent ici plutôt que de repasser sur tous les
      rendez-vous, et surtout plutôt que de l'approcher au prorata. */
  lignes: IncludedUsageDetail[];
  /** Le retard se SUPERPOSE à l'état : un contrat en cours peut être en retard,
      et c'est le cas le plus urgent de tous. */
  retardXof: number;
  resteXof: number;
  verseXof: number;
  /** Crédits : consommés (rendez-vous à venir compris) et promis. */
  utilises: number;
  promis: number;
  /** Séances RENDUES, celles qui ont eu lieu. Ce que la tête a reçu. */
  honorees: number;
  /** Jours sans abonnement avant celui-ci, quand le précédent avait une fin. */
  trouJours: number | null;
};

export type CompteAbonnement = {
  clientId: string;
  nom: string;
  contrats: ContratDuCompte[];
  /** Le contrat qui vit, s'il y en a un : celui que l'écran met en tête. */
  vif: ContratDuCompte | undefined;
  verseXof: number;
  resteXof: number;
  retardXof: number;
  honorees: number;
  depuisIso: string;
};

/** LES COMPTES, UNE LIGNE DE VIE PAR TÊTE.

    LE SILENCE ENTRE DEUX CONTRATS EST UNE DONNÉE. Soixante-trois jours sans
    abonnement, c'est deux mois où la tête est revenue au plein tarif, ou n'est
    pas revenue du tout. Rien ne le mesurait, et c'est pourtant le seul chiffre
    qui dise si la Maison RETIENT ses abonnées. */
export function comptesAbonnement(o: {
  subs: readonly Subscriber[];
  plans: readonly Plan[];
  appts: Appointment[];
  aujourdhui: string;
}): CompteAbonnement[] {
  /* UN CONTRAT SANS FICHE RESTE VISIBLE, seul dans son compte. `clientId` est
     facultatif depuis toujours : les abonnements repris de l'ancien ERP n'en ont
     pas. Les grouper ensemble ferait une tête imaginaire portant six formules ;
     les cacher ferait disparaitre de l'argent encaissé. */
  const parTete = new Map<string, Subscriber[]>();
  for (const s of o.subs) {
    const cle = s.clientId ?? `sans-fiche:${s.id}`;
    const l = parTete.get(cle);
    if (l) l.push(s); else parTete.set(cle, [s]);
  }
  const comptes: CompteAbonnement[] = [];
  for (const siens of parTete.values()) {
    /* DU PLUS RÉCENT AU PLUS ANCIEN, sur la date de DÉBUT : c'est l'ordre dans
       lequel on raconte une histoire qu'on connaît déjà. */
    const ordonnes = [...siens].sort((a, b) => (debutDuContrat(a) < debutDuContrat(b) ? 1 : -1));
    const contrats: ContratDuCompte[] = ordonnes.map((sub, i) => {
      const plan = o.plans.find((p) => p.id === sub.planId);
      const lignes = usageDetaille(sub, plan, o.appts);
      const rendus = rdvCouvertsDe(sub, plan, o.appts).filter((a) => a.status === 'honoré').length;
      /* LE TROU SE MESURE ENTRE LA FIN DU PRÉCÉDENT ET LE DÉBUT DE CELUI-CI.
         Le « précédent » est le suivant dans la liste, puisqu'elle descend le
         temps. Sans date de fin, pas de trou : on ne devine pas un silence. */
      const precedent: Subscriber | undefined = ordonnes[i + 1];
      const finPrec: string | null = precedent?.expiresIso ?? null;
      const trouJours = finPrec && debutDuContrat(sub) > finPrec
        ? Math.round((new Date(`${debutDuContrat(sub)}T12:00:00`).getTime()
          - new Date(`${finPrec}T12:00:00`).getTime()) / 86400000)
        : null;
      return {
        sub, plan, lignes,
        etat: etatDuContrat(sub, plan, o.appts, o.aujourdhui),
        retardXof: retardDuContrat(sub, o.aujourdhui),
        resteXof: resteDuContrat(sub, plan, o.aujourdhui),
        verseXof: subPaid(sub),
        utilises: lignes.reduce((n, u) => n + u.used, 0),
        promis: lignes.reduce((n, u) => n + (u.qty ?? 0), 0),
        honorees: rendus,
        trouJours,
      };
    });
    comptes.push({
      clientId: ordonnes[0]?.clientId ?? '',
      nom: ordonnes[0]?.name ?? '',
      contrats,
      vif: contrats.find((c) => c.etat === 'en-cours' || c.etat === 'epuise'),
      verseXof: contrats.reduce((n, c) => n + c.verseXof, 0),
      /* UN CONTRAT RÉSILIÉ NE RÉCLAME PLUS RIEN : le compter ferait une créance
         que la Maison a elle-même annulée. */
      resteXof: contrats.reduce((n, c) => n + (c.etat === 'resilie' ? 0 : c.resteXof), 0),
      retardXof: contrats.reduce((n, c) => n + (c.etat === 'resilie' ? 0 : c.retardXof), 0),
      honorees: contrats.reduce((n, c) => n + c.honorees, 0),
      depuisIso: debutDuContrat(ordonnes[ordonnes.length - 1]),
    });
  }
  return comptes;
}

/** LES GESTES D'ABORD. Un écran de comptes se lit le matin pour savoir QUI
    APPELER : ceux qui doivent de l'argent, puis ceux à qui reproposer une
    formule, puis les autres. L'alphabet ne dit rien à personne. */
export const rangDuCompte = (c: CompteAbonnement): number => {
  if (c.retardXof > 0) return 0;
  if (c.vif?.etat === 'epuise') return 1;
  if (c.vif) return 2;
  return 3;
};

export const comptesRanges = (comptes: CompteAbonnement[]): CompteAbonnement[] =>
  [...comptes].sort((a, b) => rangDuCompte(a) - rangDuCompte(b) || a.nom.localeCompare(b.nom, 'fr'));

/* ══ LE MOTEUR, EN ARGENT RÉEL — 2 septembre 2026 ════════════════════
   « Je ne comprends pas le montant récurrent de 18 817. Ça ne me renseigne pas
   grand-chose sur les abonnements. Pouvons-nous avoir d'autres données là ? »
   (Yéman, deux fois plutôt qu'une.)

   TROIS TORTS AU MRR, ET DEUX SONT DES FAUTES :
   ① PERSONNE N'A JAMAIS VERSÉ 18 817 F. C'est une moyenne, le prix d'un
      abonnement divisé par ses mois. Aucun billet ne correspond, et l'écran
      annonçait pourtant « sont déjà encaissés ce mois ».
   ② IL NE COMPTAIT QUE DEUX ABONNÉES SUR NEUF. Le montant est figé à la vente
      dans `mrrXof` ; les têtes inscrites avant ce champ, ou passées par Ma
      Couronne, valent zéro et le resteront.
   ③ LE PANNEAU DU BAS EN CACHAIT CINQ. « Actives 4 » sous une carte annonçant
      9 abonnés : les états `exhausted` n'étaient dans aucune des trois barres.

   TOUT CE QUI SUIT SE VÉRIFIE À LA CAISSE. Derrière chaque montant il y a des
   versements datés, des échéances nommées, des séances qui existent. Aucune
   moyenne, aucune projection. */

export type EcheanceDue = {
  sub: Subscriber;
  nom: string;
  formule: string;
  numero: number;
  total: number;
  dueIso: string;
  montantXof: number;
  /** Positif = en retard de tant de jours. */
  retardJours: number;
};

export type MoteurAbonnements = {
  encaisseCeMoisXof: number;
  encaisseMoisPrecedentXof: number;
  retardXof: number;
  retardTetes: number;
  aEncaisserXof: number;
  aEncaisserNb: number;
  prochaineIso: string | null;
  /** LE CARNET : ce que les abonnements en cours doivent encore rapporter. */
  carnetXof: number;
  /** La dette de fauteuil : séances promises et pas encore rendues. */
  seancesDues: number;
  seancesTenues: number;
  valeurDueXof: number;
  enCours: number;
  epuisees: number;
  nouvellesCeMois: number;
  enRetardNb: number;
  parties: number;
  /** Combien de têtes ont repris une formule après en avoir terminé une. */
  reprises: number;
  finsSansReprise: number;
  dues: EcheanceDue[];
  parFormule: { planId: string; nom: string; tetes: number; encaisseXof: number; resteXof: number }[];
};

const finDuMois = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

const moisPrecedentDe = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

const joursEntre = (a: string, b: string): number =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

export function moteurDesAbonnements(o: {
  comptes: readonly CompteAbonnement[];
  plans: readonly Plan[];
  aujourdhui: string;
  /** Le prix catalogue d'une prestation, pour chiffrer ce qui reste dû en fauteuil. */
  prixDuService: (serviceId: string) => number | undefined;
}): MoteurAbonnements {
  const mois = o.aujourdhui.slice(0, 7);
  const moisAvant = moisPrecedentDe(o.aujourdhui);
  const fin = finDuMois(o.aujourdhui);
  const m: MoteurAbonnements = {
    encaisseCeMoisXof: 0, encaisseMoisPrecedentXof: 0, retardXof: 0, retardTetes: 0,
    aEncaisserXof: 0, aEncaisserNb: 0, prochaineIso: null, carnetXof: 0,
    seancesDues: 0, seancesTenues: 0, valeurDueXof: 0,
    enCours: 0, epuisees: 0, nouvellesCeMois: 0, enRetardNb: 0, parties: 0,
    reprises: 0, finsSansReprise: 0, dues: [], parFormule: [],
  };
  const parPlan = new Map<string, { tetes: Set<string>; encaisseXof: number; resteXof: number }>();

  for (const compte of o.comptes) {
    if (compte.retardXof > 0) m.retardTetes += 1;
    if (!compte.vif) m.parties += 1;
    /* UNE REPRISE : une formule terminée, et une autre ouverte après elle.
       C'est la seule rétention qui se mesure sur ce qui s'est vraiment passé.
       Une fin SANS reprise est un départ aussi, simplement plus poli qu'une
       résiliation, et c'est elle que la carte « 100 % » ignorait. */
    const finis = compte.contrats.filter((c) => c.etat === 'termine' || c.etat === 'resilie');
    if (finis.length > 0) {
      if (compte.vif) m.reprises += 1; else m.finsSansReprise += 1;
    }

    for (const c of compte.contrats) {
      const cle = c.sub.planId;
      const e = parPlan.get(cle) ?? { tetes: new Set<string>(), encaisseXof: 0, resteXof: 0 };
      e.tetes.add(compte.clientId || compte.nom);
      e.encaisseXof += c.verseXof;
      if (c.etat !== 'resilie') e.resteXof += c.resteXof;
      parPlan.set(cle, e);

      /* CE QUI EST ENTRÉ EN CAISSE, versement par versement, à sa date. */
      for (const v of c.sub.payments ?? []) {
        if (v.date?.slice(0, 7) === mois) m.encaisseCeMoisXof += v.amountXof;
        else if (v.date?.slice(0, 7) === moisAvant) m.encaisseMoisPrecedentXof += v.amountXof;
      }

      if (c.etat === 'resilie') continue;
      m.carnetXof += c.resteXof;
      if (c.etat === 'en-cours') m.enCours += 1;
      if (c.etat === 'epuise') m.epuisees += 1;
      if (debutDuContrat(c.sub).slice(0, 7) === mois) m.nouvellesCeMois += 1;
      if (c.retardXof > 0) { m.retardXof += c.retardXof; m.enRetardNb += 1; }

      /* LA DETTE DE FAUTEUIL : des heures déjà payées. Elle ne figurait nulle
         part, et c'est pourtant elle qui décide si la Maison peut vendre une
         formule de plus ce mois-ci. */
      if (c.etat === 'en-cours' || c.etat === 'epuise') {
        for (const u of c.lignes) {
          if (u.qty === null) continue;
          const reste = Math.max(0, u.qty - u.used);
          m.seancesDues += reste;
          const prix = o.prixDuService(u.serviceId);
          if (prix) m.valeurDueXof += reste * prix;
        }
        m.seancesTenues += Math.max(0, c.utilises - c.honorees);
      }

      /* QUI PAIE, ET QUAND. Datée, nommée : c'est la seule liste qui fait
         décrocher un téléphone. */
      if (c.sub.echeances?.length) {
        const etats = etatDesEcheances(c.sub.echeances, c.verseXof, o.aujourdhui);
        for (const e2 of etats) {
          if (e2.resteXof <= 0) continue;
          const enRetard = e2.dueIso < o.aujourdhui;
          if (!enRetard && e2.dueIso > fin) continue;
          if (!enRetard) { m.aEncaisserXof += e2.resteXof; m.aEncaisserNb += 1; }
          if (!enRetard && (m.prochaineIso === null || e2.dueIso < m.prochaineIso)) m.prochaineIso = e2.dueIso;
          m.dues.push({
            sub: c.sub, nom: compte.nom, formule: c.plan?.name ?? 'Formule retirée',
            numero: e2.numero, total: c.sub.echeances.length, dueIso: e2.dueIso,
            montantXof: e2.resteXof, retardJours: enRetard ? joursEntre(e2.dueIso, o.aujourdhui) : 0,
          });
        }
      }
    }
  }

  /* LES RETARDS EN TÊTE, PUIS LE PLUS PROCHE : l'ordre dans lequel on appelle. */
  m.dues.sort((a, b) => (b.retardJours - a.retardJours) || a.dueIso.localeCompare(b.dueIso));
  m.parFormule = [...parPlan.entries()]
    .map(([planId, e]) => ({
      planId, nom: o.plans.find((p) => p.id === planId)?.name ?? 'Formule retirée',
      tetes: e.tetes.size, encaisseXof: e.encaisseXof, resteXof: e.resteXof,
    }))
    .filter((x) => x.tetes > 0)
    .sort((a, b) => (b.encaisseXof + b.resteXof) - (a.encaisseXof + a.resteXof));
  return m;
}

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

/** LA FOURCHETTE EN TOUTES LETTRES — 2 septembre 2026.

    « Tous les abonnements qui ont une fourchette et varient doivent annoncer la
    fourchette » (Yéman).

    ÉCRITE UNE FOIS, LUE PARTOUT. Trois écrans l'annonçaient déjà de trois
    façons : « de X à Y », « X à Y », « X – Y ». Trois formulations du même fait
    finissent par se lire comme trois offres différentes, et le jour où l'une
    change, les deux autres mentent. Le libellé vit ici, avec le calcul.

    `fmt` est passé par l'appelant parce que la devise appartient à la branche,
    pas au moteur. */
export const libelleFourchette = (
  p: Plan, cycle: SubCycle, bands: readonly ModelBand[], fmt: (x: number) => string,
): string | null => {
  const e = etendueDeLaFormule(p, cycle, bands);
  return e ? `${fmt(e.bas)} à ${fmt(e.haut)}` : null;
};

/** Ce qui suit la fourchette, et qui dit POURQUOI elle en est une. */
export const SELON_LE_CALIBRE = 'selon le calibre';

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

/* ══ LE VERSEMENT D'UN ABONNEMENT VIT À DEUX ENDROITS — 3 sept. 2026 ══
   « J'ai supprimé le paiement de la facture de l'abonnement de Mylène du 28
   août, mais son paiement au niveau de l'abonnement est resté intact et le reçu
   de son encaissement n'a pas été supprimé » (Yéman).

   UN RÈGLEMENT D'ABONNEMENT S'ÉCRIT DEUX FOIS, et c'est voulu : dans le contrat
   (`Subscriber.payments`, qui fait avancer l'échéance et le suivi) et sur la
   pièce (`Invoice.payments`, qui fait le chiffre d'affaires et la caisse). Les
   deux portent le MÊME identifiant, posé à la vente.

   MAIS RIEN NE LES DÉFAISAIT ENSEMBLE. Supprimer la pièce laissait le contrat
   payé ; supprimer le reçu laissait la pièce encaissée. Dans les deux cas
   l'argent existait encore quelque part, et les deux écrans se contredisaient
   sans que rien ne le dise. */

/** Retire d'un contrat les versements qui appartiennent à cette pièce, et
    coupe le lien. Rend le nombre de versements retirés. */
export function detacheLesVersementsDeLaPiece(invoiceId: string, idsDesVersements: readonly string[]): number {
  const ids = new Set(idsDesVersements);
  let retires = 0;
  subscribersStore.set((prev) => prev.map((sub) => {
    if (sub.invoiceId !== invoiceId) return sub;
    const restants = (sub.payments ?? []).filter((p) => !ids.has(p.id));
    retires += (sub.payments ?? []).length - restants.length;
    /* LE LIEN PART AVEC LA PIÈCE : le garder ferait chercher indéfiniment une
       facture qui n'existe plus, et le prochain règlement s'y accrocherait. */
    return { ...sub, payments: restants, invoiceId: undefined };
  }));
  return retires;
}

/** Le contrat qui porte ce versement, s'il y en a un. */
export const contratDuVersement = (paymentId: string): Subscriber | undefined =>
  subscribersStore.get().find((s) => (s.payments ?? []).some((p) => p.id === paymentId));

/* ══ REVOIR LE PRIX CONVENU D'UN CONTRAT — 4 septembre 2026 ═════════
   « Permets-moi de modifier le prix convenu » (Yéman).

   IL ÉTAIT FIGÉ POUR UNE BONNE RAISON, ET LA RAISON TIENT TOUJOURS : la pièce,
   l'échéancier et le suivi doivent dire le même chiffre. Un prix qu'on change
   seul dans son coin laisse une facture qui réclame 160 000 sur un contrat qui
   en vaut 190 000, et c'est la cliente qui découvre l'écart.

   ON NE FIGE DONC PLUS LE PRIX, ON DÉPLACE TOUT CE QUI EN DÉPEND. Ce juge dit
   ce que le nouveau prix fait à l'échéancier ; l'écran s'occupe de la pièce,
   qu'il est seul à voir.

   L'ARGENT DÉJÀ REÇU EST UN FAIT, PAS UNE PROPOSITION. Aucun nouveau prix ne
   peut passer sous ce qu'elle a versé : la Maison deviendrait sa débitrice, et
   rendre de l'argent est une décision d'avoir, pas une correction de tarif. */
export type PrixRevu = {
  ok: boolean;
  /** Dit à voix haute pourquoi la Maison refuse. */
  refus?: string;
  /** Le nouvel échéancier — absent quand le contrat n'en portait pas. */
  echeances?: Echeance[];
  /** Combien de tranches sont déjà couvertes par l'argent reçu, donc intouchées. */
  gardees: number;
  verseXof: number;
  ancienXof: number;
  nouveauXof: number;
};

export function revoitLePrixConvenu(
  sub: Subscriber, plan: Plan | undefined, nouveauXof: number,
): PrixRevu {
  const nouveau = Math.max(0, Math.round(nouveauXof));
  const verse = subPaid(sub);
  const ancien = prixVenduXof(sub, plan, sub.cycle ?? 'mensuel');
  const socle = { gardees: 0, verseXof: verse, ancienXof: ancien, nouveauXof: nouveau };
  if (nouveau <= 0) {
    return { ...socle, ok: false, refus: 'Un contrat à 0 F ne se vend pas. Résiliez-le plutôt.' };
  }
  if (nouveau < verse) {
    return {
      ...socle, ok: false,
      refus: `Elle a déjà versé ${verse} : un prix en dessous ferait de la Maison sa débitrice. Passez par un avoir.`,
    };
  }
  const ech = sub.echeances ?? [];
  if (ech.length === 0) return { ...socle, ok: true };

  /* LES TRANCHES QUE L'ARGENT COUVRE DÉJÀ NE BOUGENT PAS. Les versements se
     posent dans l'ordre (`etatDesEcheances`) : une tranche entièrement payée
     est une page tournée, la réécrire ferait réapparaître une dette réglée. */
  let couvert = 0;
  let gardees = 0;
  for (const e of ech) {
    if (couvert + e.amountXof > verse) break;
    couvert += e.amountXof;
    gardees += 1;
  }
  const restant = nouveau - couvert;
  const suite: Echeance[] = ech.slice(0, gardees).map((e) => ({ ...e }));
  if (restant > 0) {
    /* JAMAIS PLUS DE TRANCHES QUE DE FRANCS. Une tranche à zéro se lirait comme
       soldée d'avance et la cliente croirait devoir moins : on en garde moins,
       plutôt que d'en écrire une vide (même règle que `construitEcheancier`). */
    const libres = ech.slice(gardees);
    const places = Math.max(1, Math.min(libres.length, restant));
    const base = Math.floor(restant / places);
    const rab = restant - base * places;
    for (let i = 0; i < places; i += 1) {
      suite.push({
        numero: suite.length + 1,
        dueIso: libres[i]?.dueIso ?? libres[libres.length - 1].dueIso,
        amountXof: i === places - 1 ? base + rab : base,
      });
    }
  }
  /* LES RANGS SE REFONT : « la deuxième » doit rester la deuxième de la liste
     qu'on lui montre, sinon le suivi et le rappel parlent de tranches
     différentes. */
  return { ...socle, ok: true, gardees, echeances: suite.map((e, i) => ({ ...e, numero: i + 1 })) };
}
