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
  /** LA PIÈCE QUE CE VERSEMENT A FAIT NAÎTRE. Un règlement émet une facture ;
      sans ce lien, rien ne dit LAQUELLE — le rendez-vous ne retient que la
      dernière, et un rituel réglé en deux fois en compte deux. Le registre des
      encaissements s'en sert pour dater la pièce au jour où l'argent est
      vraiment entré, et la suppression d'une facture pour reprendre SES
      versements plutôt que les plus récents. Absent sur les journaux d'avant. */
  invoiceId?: string;
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
  /** LA REMISE D'UNE PRESTATION — 17 août 2026, demande de Yéman :
      « créer les remises en lignes % ou F, à personnaliser ».

      Tableau PARALLÈLE à `serviceIds`, comme `mains` — et pour la même raison :
      un rituel peut porter deux fois le même geste, et l'un peut être offert
      quand l'autre ne l'est pas. Indexer par prestation les confondrait.

      Le POURCENTAGE s'applique d'abord, les FRANCS ensuite — l'ordre de la
      remise globale, pour qu'une seule règle s'apprenne. Les deux étages se
      cumulent avec la remise globale du rendez-vous (décision de Yéman) : la
      ligne d'abord, l'ensemble ensuite.

      Vide ou absent sur une ligne = pas de remise. */
  remisesLignes?: ({ pct?: number; xof?: number } | null)[];
  /** LA LONGUEUR TRAVAILLÉE CE JOUR-LÀ. Elle commande le prix et la durée des
      prestations qui se facturent à la longueur (voir `prixParLongueur`).

      Elle vit sur le rendez-vous et non sur la fiche cliente parce qu'elle
      change : une tête coupée en mars n'est plus la même en septembre. Inscrite
      ici, chaque rituel garde la longueur qu'il a réellement travaillée, et
      relire un rendez-vous de mars ne le retarife pas à la longueur d'aujourd'hui. */
  longueur?: LongueurId;
  /** ── LA DURÉE SE FIGE À LA POSE — 1er septembre 2026 ────────────
      « Le coefficient durée ne sert à rien, on dirait qu'il ne bouge pas du
      tout » (Yéman). Il ne parlait qu'à Ma Couronne : le comptoir, le
      calendrier et la Caisse lisaient la durée du catalogue, sans jamais
      regarder le calibre. Un resserrage annoncé 1 h prend 1 h 55 sur une tête
      Micro, et la suivante était posée cinquante-cinq minutes trop tôt.

      POURQUOI L'ÉCRIRE PLUTÔT QUE LA DÉDUIRE. La durée se déduisait du
      catalogue à chaque affichage. Y brancher le calibre aurait fait changer
      de hauteur TOUS les rendez-vous passés le jour de la mise en ligne, et
      les aurait fait rebouger à chaque coefficient touché. Pire : une tête qui
      grossit de 340 à 360 locks aurait allongé, rétrospectivement, tous ses
      rendez-vous de l'année. LE CALENDRIER DE MARS N'EST PAS UNE PRÉVISION,
      C'EST UN COMPTE RENDU.

      C'est déjà la règle du prix et de la longueur travaillée, qui se figent à
      la pose pour la même raison. La durée rejoint la même famille.

      ABSENT = LES RENDEZ-VOUS D'AVANT, qui gardent leur calcul d'origine. */
  dureeMin?: number;
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
  /** QUI A OFFERT CE RITUEL — l'identifiant de celle qui l'a payé pour une
      autre.

      Rhanda, belle-sœur d'Ahmed, lui a offert sa première visite : 110 000 F, le
      2 mai 2026. La Maison savait déjà dire « payé par X, pour Y » — mais
      seulement par un COMPTE FAMILLE, un lien permanent. Une belle-sœur qui
      offre une fois ne doit pas devenir son payeur à vie.

      Le geste vit sur le RENDEZ-VOUS, et non sur la facture : le rendez-vous
      est ce que tout le monde relit — le Carnet, sa fiche, la Vitrine. Une
      facture, personne ne la rouvre.

      CE QUE CE CHAMP DÉPLACE : la dépense et les points de fidélité vont à
      celle qui a payé (`apptPayeurId`) — c'est elle qui a sorti l'argent, c'est
      elle que la Maison reconnaît. Le rituel, lui, reste au parcours de celle
      qui a été soignée.

      CE QU'IL NE DÉPLACE PAS : un franc de la caisse. Le chiffre d'affaires, le
      Bilan, le registre des encaissements et les commissions somment les
      rendez-vous sans regarder à qui ils appartiennent — nommer un geste ne
      réécrit pas la comptabilité. */
  offertPar?: string;
  /** LE FORFAIT PONCTUEL — un total négocié pour l'ENSEMBLE des gestes de ce
      rituel, décidé une fois, pour une cliente : « les quatre gestes pour
      60 000 F ».

      À ne pas confondre avec le forfait du catalogue (`Service.includes` +
      `forfaitRemisePct`), qui est un produit durable qu'on réserve. Celui-ci
      naît au comptoir, ou à la prise du rendez-vous.

      IL NE TOUCHE JAMAIS AUX PRESTATIONS. Le montant par prestation porte les
      mains et donc la production, les seuils, les primes, les commissions des
      maîtres et la ventilation par maison du Bilan. Effondrer les lignes en une
      seule « Forfait — 60 000 F » effacerait tout cela d'un coup. Le forfait ne
      fixe donc que le NET du rituel : la Maison répartit ensuite ce net entre
      les gestes au prorata de ce que chacun vaut pour cette tête
      (`splitByWeights`), exactement comme elle le fait déjà pour une remise.
      Rien d'autre dans la Maison n'a besoin de connaître ce champ.

      Il FAIT FOI : ni le pourcentage ni la remise en CFA ne s'y ajoutent — on
      ne remise pas un prix déjà négocié. */
  forfait?: {
    /** Le nom que la cliente lira sur sa facture. Vide = « Forfait ». */
    nom?: string;
    /** LE TOTAL VOULU, net, pour l'ensemble du rituel. */
    totalXof: number;
    /** Le prix plein au moment où il a été consenti. Sert à dire au comptoir
        que la composition a changé depuis, et à reproposer le même taux : un
        forfait posé à la réservation sur trois gestes ne dit plus rien de juste
        quand un quatrième s'ajoute au fauteuil. */
    baseXof: number;
    /** Jour où il a été consenti (ISO). */
    poseAt: string;
  };
  discountPct?: number; // remise appliquée au RDV (0–100)
  /** Remise manuelle en CFA, retranchée APRÈS la remise en %. Geste de comptoir
      (fidélité, arrangement) que le pourcentage ne sait pas exprimer. */
  discountXof?: number;
  /** `discountPct` est LA REMISE FAMILLE du compte de la cliente (voir
      `remiseFamillePct`, shared/clients). Le montant ne change pas — seule
      l'étiquette : la modale et la facture disent « Remise famille » pour que
      la cliente sache d'où vient son avantage. */
  remiseFamille?: boolean;
  /** Prix du rituel FIGÉ au moment où il a été facturé, avant remise.
      Le catalogue vit : ses tarifs changent. Sans ce champ, un rituel de mars se
      relirait au tarif d'aujourd'hui et l'historique se réécrirait tout seul —
      sur les RDV repris de l'ancien ERP, l'écart atteignait 3 M F.
      Absent (le cas courant) → le total se calcule sur le catalogue, comme avant. */
  priceXof?: number;
  /** Prestations sur lesquelles l'acompte est calculé (défaut : toutes). */
  depositServiceIds?: string[];
  /** Série multi-séances : les RDV liés partagent cet identifiant. */
  /** LE FOYER QUI VIENT ENSEMBLE — 2 septembre 2026.

      « Comment je peux prendre des RDV dans un foyer pour 2 personnes au
      minimum ? » (Yéman). La mère et ses deux filles demandaient trois fois le
      même formulaire, et rien ensuite ne disait que ces trois rendez-vous
      n'en faisaient qu'un.

      DEUX RENDEZ-VOUS, PAS UN À DEUX TÊTES. Le calendrier, les mains, les
      commissions et le suivi comptent tous PAR TÊTE : un objet à deux têtes
      casserait les quatre d'un coup. On pose donc des rendez-vous ordinaires,
      liés par cet identifiant, exactement comme les séances d'une série. */
  /** LE RITUEL DONT CELUI-CI EST LA REPRISE — 3 septembre 2026.

      Il sert de VERROU autant que de trace : ré-honorer un rituel déjà clos
      est un geste courant, et sans ce lien chaque passage poserait une reprise
      de plus. Il dit aussi, sur la fiche, d'où vient ce rendez-vous que
      personne ne se souvient d'avoir pris. */
  repriseDe?: string;
  foyerId?: string;
  seriesId?: string;
  seriesIndex?: number; // n° de la séance (1..N)
  seriesTotal?: number; // nombre total de séances de la série
  note?: string;
  source?: 'trone' | 'couronne' | 'consultation';
  /** QUAND LA RÉSERVATION A ÉTÉ PRISE — 5 septembre 2026.

      « J'ai besoin de voir plus d'informations quand le client a fait la
      réservation en ligne » (Yéman).

      Une réservation reçue ne disait pas son âge. Or l'âge décide : une demande
      posée il y a deux heures s'appelle, une demande posée il y a six jours et
      jamais reçue est un manquement de la Maison. Absent sur tout ce qui
      précède — on ne l'invente pas, faute de le savoir. */
  creeLe?: string;
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
      deux fois, une fois sur chaque. Carolle O. en portait deux simultanément
      dans l'ancien ERP ; c'est ce qui a rendu ce champ nécessaire.
      Il affranchit aussi le décompte des dates : un pack saisi après coup couvre
      des séances antérieures à son enregistrement, et le lien explicite les
      rattache quand une fenêtre de dates les aurait perdues. */
  subId?: string;
};

/* ── LES SÉANCES DE SUITE (15 août) ───────────────────────────────────
   « Il a pris un soin de reconstruction intensive 2 séances. Il va payer une
   séance et réserver sa deuxième aujourd'hui sans payer. » — et « ça peut
   arriver qu'on finisse en 1 séance ».

   Le nombre de séances ne se sait donc PAS à la prise : le poser d'avance
   ferait promettre une venue qui n'aura peut-être pas lieu. La série se
   construit à mesure — on rattache la séance suivante au rituel déjà facturé,
   le jour où l'on sait qu'elle est nécessaire.

   La règle de valeur existait déjà (`apptTotalXof` : une séance 2+ vaut zéro,
   partout) ; ce qui manquait, c'était le geste pour la poser au comptoir. */

/* ══ ASSEOIR UN FOYER — 2 septembre 2026 ═════════════════════════════
   Deux têtes au même créneau demandent DEUX MAÎTRES. Sinon elles passent l'une
   après l'autre, et c'est la durée de la première qui décide de l'heure de la
   seconde.

   LE CALCUL EST PUR : il ne lit ni le magasin ni l'horloge, il place. L'écran
   lui dit qui vient, combien de temps, et quels maîtres sont libres. */

const minVersHeure = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const heureVersMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Deux rendez-vous se chevauchent-ils ? Bornes ouvertes : finir à 14:00 et
    commencer à 14:00 ne se chevauche pas, c'est le fauteuil qui se libère. */
export const chevauche = (debutA: string, dureeA: number, debutB: string, dureeB: number): boolean => {
  const a = heureVersMin(debutA);
  const b = heureVersMin(debutB);
  return a < b + Math.max(1, dureeB) && b < a + Math.max(1, dureeA);
};

/** LES MAÎTRES LIBRES À CETTE HEURE-LÀ, ce jour-là.

    UN RENDEZ-VOUS ANNULÉ NE TIENT PLUS LE FAUTEUIL. Le compter ferait refuser
    « ensemble » pour une place qui est libre, et la Maison proposerait deux
    créneaux à la suite sans raison. */
export function maitresLibres(o: {
  appts: readonly Appointment[];
  branchId: string;
  dateIso: string;
  heure: string;
  dureeMin: number;
  maitres: readonly string[];
  /** Les rendez-vous qu'on est en train de poser, et qui tiennent déjà. */
  dejaPoses?: readonly { master: string; time: string; dureeMin: number }[];
}): string[] {
  const duJour = o.appts.filter((a) => a.branchId === o.branchId && a.date === o.dateIso && a.status !== 'annulé');
  return o.maitres.filter((m) => {
    const pris = duJour.some((a) => a.master === m && chevauche(o.heure, o.dureeMin, a.time, a.dureeMin || 60));
    if (pris) return false;
    return !(o.dejaPoses ?? []).some((d) => d.master === m && chevauche(o.heure, o.dureeMin, d.time, d.dureeMin));
  });
}

export type TeteAPlacer = { clientId: string; dureeMin: number };
export type PlaceDuFoyer = { clientId: string; time: string; master: string };

/** OÙ S'ASSEOIT CHAQUE TÊTE DU FOYER.

    `ensemble` : chacune prend un maître libre à elle, toutes à la même heure.
    S'il manque un maître, LES SURNUMÉRAIRES PASSENT À LA SUITE plutôt que
    d'être refusées : une famille qui s'est déplacée ne repart pas parce que la
    Maison n'a que deux fauteuils.

    `à la suite` : toutes chez le premier maître, l'une après l'autre, chacune
    décalée de la durée de celle d'avant.

    ON NE MET JAMAIS DEUX TÊTES CHEZ LE MÊME MAÎTRE À LA MÊME HEURE. C'est la
    seule règle qui ne se négocie pas : elle ferait promettre un fauteuil qui
    n'existe pas, et la faute se découvre à l'arrivée, devant la famille. */
export function placeLeFoyer(o: {
  tetes: readonly TeteAPlacer[];
  maitresLibres: readonly string[];
  maitreParDefaut: string;
  heure: string;
  ensemble: boolean;
}): PlaceDuFoyer[] {
  if (o.tetes.length === 0) return [];
  const places: PlaceDuFoyer[] = [];
  if (o.ensemble && o.maitresLibres.length > 0) {
    /* CHACUNE SON MAÎTRE, tant qu'il y en a. */
    const front = o.tetes.slice(0, o.maitresLibres.length);
    front.forEach((t, i) => places.push({ clientId: t.clientId, time: o.heure, master: o.maitresLibres[i] }));
    /* LES SUIVANTES REPRENNENT LE PREMIER MAÎTRE, à la suite de sa tête. */
    let curseur = heureVersMin(o.heure) + (front[0]?.dureeMin ?? 60);
    for (const t of o.tetes.slice(o.maitresLibres.length)) {
      places.push({ clientId: t.clientId, time: minVersHeure(curseur), master: o.maitresLibres[0] });
      curseur += Math.max(1, t.dureeMin);
    }
    return places;
  }
  /* À LA SUITE, chez un seul maître. */
  const maitre = o.maitresLibres[0] ?? o.maitreParDefaut;
  let curseur = heureVersMin(o.heure);
  for (const t of o.tetes) {
    places.push({ clientId: t.clientId, time: minVersHeure(curseur), master: maitre });
    curseur += Math.max(1, t.dureeMin);
  }
  return places;
}

/** Le rituel qui PORTE le prix d'une série — sa séance 1. */
export const teteDeSerie = (l: readonly Appointment[], sid: string): Appointment | undefined =>
  l.filter((a) => a.seriesId === sid).sort((a, b) => (a.seriesIndex ?? 1) - (b.seriesIndex ?? 1))[0];

/** RATTACHER une séance à un rituel déjà facturé. Le parent devient la séance 1
    s'il ne l'était pas encore, la nouvelle prend le rang suivant, et TOUS les
    membres voient leur total remis à jour — sans quoi le carnet dirait
    « séance 3/2 ». Pure : elle rend la nouvelle liste. */
export const attacheSeance = (
  l: readonly Appointment[], apptId: string, parentId: string,
): Appointment[] => {
  const enfant = l.find((a) => a.id === apptId);
  const parent = l.find((a) => a.id === parentId);
  if (!enfant || !parent || parent.id === enfant.id) return [...l];
  /* La série du parent, ou une série qui naît sur lui. */
  const sid = parent.seriesId ?? parent.id;
  const membres = l.filter((a) => a.seriesId === sid && a.id !== apptId);
  const rangs = membres.map((a) => a.seriesIndex ?? 1);
  /* Le parent n'était pas encore en série : il en devient la tête. */
  const rangMax = rangs.length ? Math.max(...rangs) : 1;
  const rang = rangMax + 1;
  return l.map((a) => {
    if (a.id === apptId) return { ...a, seriesId: sid, seriesIndex: rang, seriesTotal: rang };
    if (a.id === parent.id && !parent.seriesId) return { ...a, seriesId: sid, seriesIndex: 1, seriesTotal: rang };
    if (a.seriesId === sid) return { ...a, seriesTotal: rang };
    return a;
  });
};

/** DÉTACHER une séance — elle redevient un rituel qui se facture. Les restants
    se renumérotent, et une série retombée à UN membre n'en est plus une : ses
    marques s'effacent, sinon le carnet afficherait « séance 1/1 · incluse » sur
    un rituel parfaitement encaissable. */
export const detacheSeance = (l: readonly Appointment[], apptId: string): Appointment[] => {
  const enfant = l.find((a) => a.id === apptId);
  const sid = enfant?.seriesId;
  if (!enfant || !sid) return [...l];
  const restants = l
    .filter((a) => a.seriesId === sid && a.id !== apptId)
    .sort((a, b) => (a.seriesIndex ?? 1) - (b.seriesIndex ?? 1));
  const total = restants.length;
  const rangDe = new Map(restants.map((a, i) => [a.id, i + 1]));
  return l.map((a) => {
    if (a.id === apptId) {
      const { seriesId: _s, seriesIndex: _i, seriesTotal: _t, ...nu } = a;
      return nu as Appointment;
    }
    if (a.seriesId !== sid) return a;
    if (total <= 1) {
      const { seriesId: _s, seriesIndex: _i, seriesTotal: _t, ...nu } = a;
      return nu as Appointment;
    }
    return { ...a, seriesIndex: rangDe.get(a.id) ?? a.seriesIndex, seriesTotal: total };
  });
};

/** QUI PORTE CE RITUEL AU COMPTE — celle qui a payé quand quelqu'un l'a offert,
    la cliente sinon. Un seul juge : la dépense de la fiche, les points de
    fidélité et le nom porté par la facture doivent désigner la même personne,
    sans quoi la Maison remercierait l'une et facturerait l'autre. */
export const apptPayeurId = (a: Pick<Appointment, 'offertPar' | 'clientId'>): string =>
  a.offertPar || a.clientId;

/** COMBIEN DE FOIS ELLE EST VENUE — des VENUES, jamais des lignes.

    Deux rituels le même jour font une seule visite : la Maison a coiffé et posé
    une couleur dans la foulée. Compter les lignes ferait « revenir » quelqu'un
    qui n'est jamais reparti. Et seulement l'HONORÉ : un rendez-vous pris puis
    manqué ne dit rien d'une relation.

    Un seul compteur pour toute la Maison, parce que deux seuils s'y adossent —
    la marque « de passage » qui se lève au 2ᵉ passage, et l'entrée au Cercle au
    3ᵉ. S'ils comptaient chacun à leur façon, la fiche dirait deux chiffres pour
    la même personne et personne ne saurait lequel croire.

    `parPayeur` juge par celle qui PAIE (`apptPayeurId`) plutôt que par celle qui
    s'assied : c'est la clé des points de fidélité, et l'entrée au Cercle doit se
    compter avec la même — sinon on ouvrirait le Cercle à l'une et on
    créditerait l'autre. */
/** LES TÊTES QUE LA MAISON A RÉELLEMENT COURONNÉES — celles qui se sont assises
    au moins une fois. Un SET, construit d'une passe : la question se pose pour
    tout le CRM à la fois (têtes couronnées, têtes actives, audiences), et
    interroger `venuesHonorees` par cliente relirait le carnet entier à chaque
    fiche.

    POURQUOI CE COMPTEUR EXISTE (11 août 2026). Ouvrir un compte sur Ma Couronne
    créait une fiche pleine (`ensureClient`) : des inconnus qui n'étaient jamais
    venus comptaient parmi les têtes couronnées, et chaque inscription faussait
    un peu plus la rétention. « Tête couronnée » ne veut plus dire « fiche
    existante » mais « venue au moins une fois » — ce qui ne demande aucun
    champ, aucun entretien, et se corrige tout seul le jour où elle s'assied. */
export const tetesVenues = (appts: readonly Appointment[]): Set<string> => {
  const s = new Set<string>();
  for (const a of appts) if (a.status === 'honoré' && a.clientId) s.add(a.clientId);
  return s;
};

export const venuesHonorees = (
  appts: readonly Appointment[],
  clientId: string,
  parPayeur = false,
): number => {
  if (!clientId) return 0;
  const jours = new Set<string>();
  for (const a of appts) {
    if (a.status !== 'honoré') continue;
    if ((parPayeur ? apptPayeurId(a) : a.clientId) !== clientId) continue;
    jours.add(a.date);
  }
  return jours.size;
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

/** ÉCRIRE UN RENDEZ-VOUS ET LE SAVOIR — 16 août 2026.

    Un rituel annulé depuis Ma Couronne n'est JAMAIS revenu annulé au Trône
    (constaté par Yéman sur son rendez-vous du 19 août). Le geste écrivait dans
    le magasin, le magasin poussait, et la cliente lisait « Rendez-vous
    annulé » — pendant que le salon gardait le créneau.

    Deux silences se prêtaient main-forte : ① une poussée REFUSÉE par les
    droits était comptée comme réussie (voir `sync.ts`), donc jamais retentée ;
    ② un `update` que la RLS écarte ne lève AUCUNE erreur — il touche zéro
    ligne, et zéro ligne ressemble à un succès.

    D'où ce chemin, pour les gestes qui ENGAGENT la Maison (annuler, déplacer) :
    on écrit, puis on DEMANDE au serveur ce qu'il a vraiment fait. `.select()`
    rend la ligne touchée ; aucune ligne rendue = rien n'est arrivé, et l'écran
    doit le dire au lieu de féliciter. Sans backend (Maison en local), il n'y a
    rien à transmettre : c'est un succès. */
export async function ecrisRendezVous(
  id: string,
  patch: Partial<Appointment>,
): Promise<boolean> {
  appointmentsStore.set((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  if (!supabase) return true;
  const a = appointmentsStore.get().find((x) => x.id === id);
  if (!a) return false;
  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({ id: a.id, branch_id: a.branchId ?? null, data: a })
      .eq('id', id)
      .select('id');
    if (error) {
      console.warn('[mnd] écriture du rendez-vous refusée :', error.message);
      return false;
    }
    return (data?.length ?? 0) === 1;
  } catch (e) {
    console.warn('[mnd] écriture du rendez-vous injoignable :', e);
    return false;
  }
}

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

/* LES BORNES DE REPLI DU CALENDRIER — 8 h à 18 h.

   Elles étaient la SEULE vérité de la grille, alors que la Maison porte par
   ailleurs des horaires par jour (`mnd_salon_hours`) que « Mon mois » lit pour
   juger la ponctualité. Deux vérités qui s'ignorent : le calendrier ouvrait à
   8 h quand le pointage attendait 9 h, et personne ne pouvait les accorder —
   aucun écran ne réglait les heures du salon.

   Ces constantes ne servent plus que de repli, quand les heures du salon ne
   disent rien. Voir `bornesDuSalon`. */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;

/** L'amplitude à couvrir par la grille : la plus large de la semaine, arrondie
    à l'heure. Une grille par jour ferait sauter la hauteur des blocs d'un jour
    à l'autre ; une amplitude commune garde la semaine lisible. */
export const bornesDuSalon = (
  horaires: Record<string, { open: string; close: string; closed: boolean }>,
): { ouverture: number; fermeture: number } => {
  const heure = (t: string | undefined): number | undefined => {
    const m = /^(\d{1,2})\s*[h:]\s*(\d{2})?$/.exec((t ?? '').trim());
    return m ? Number(m[1]) : undefined;
  };
  let min: number | undefined;
  let max: number | undefined;
  for (const j of Object.values(horaires ?? {})) {
    if (!j || j.closed) continue;
    const o = heure(j.open);
    const f = heure(j.close);
    if (o !== undefined) min = min === undefined ? o : Math.min(min, o);
    if (f !== undefined) max = max === undefined ? f : Math.max(max, f);
  }
  return {
    ouverture: min ?? OPEN_HOUR,
    /* +1 pour que la dernière heure d'ouverture reste cliquable. */
    fermeture: Math.max((max ?? CLOSE_HOUR), (min ?? OPEN_HOUR) + 1),
  };
};
