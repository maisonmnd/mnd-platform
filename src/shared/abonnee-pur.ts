/* ══ LE RELEVÉ DE L'ABONNÉE — un seul juge, 20 octobre 2026 ══════════════
   « Repenser entièrement l'expérience des clients abonnés… distinct,
   transparent, fiable, pour les clientes comme pour l'administration »
   (Yéman). Maquette L0 validée le 20 octobre 2026 (« construis c'est bon
   comme ça »).

   LA MÊME QUESTION RECEVAIT SIX RÉPONSES. « Il vous reste 4 sur 6 » était le
   plus petit reste d'une prestation posé sur le plus grand quota d'une autre ;
   réservées et faites se confondaient ; l'argent payé en ligne vivait sur le
   contrat, celui de MND PAY sur la pièce, et l'écran disait « en retard » pour
   un argent reçu. Ici, chaque question a UN juge, et Ma Couronne, le Trône,
   les messages et le serveur (par copie bornée) lisent celui-là.

   CE QUI EST RÉGLÉ ICI, ET PAR QUI (décisions du 20 octobre 2026) :
   · une séance est RÉSERVÉE à la prise, FAITE à l'honneur ; les deux se
     comptent à part (décision 1) ;
   · annulée à moins de 24 h, ou absente : la séance est comptée, « Manquée » ;
     la Maison peut la RENDRE (décision 3) ;
   · une suite de forfait ne se décompte jamais sur la formule ;
   · un paquet épuisé libère la place ; plusieurs formules peuvent courir
     ensemble (« Deux en même temps », tranché au sélecteur) : à la
     réservation, celle qui finit le plus tôt est proposée d'office, et une
     séance appartient au contrat que nomme son `subId` ;
   · Chaque Lune se règle avant la lune ; non réglée, elle se met en pause le
     jour même de l'échéance, sans dette (décision 5) ; la lune commence au
     règlement ;
   · une formule prise en ligne et non réglée est RETENUE 7 jours, puis
     s'efface (décision 7) ;
   · une échéance, ou le 7e jour d'une retenue, qui tombe un dimanche passe au
     lundi (porte close le dimanche) ;
   · le retard commence le LENDEMAIN de l'échéance ; le jour même, la somme se
     lit « à régler aujourd'hui » ; la porte des réservations se ferme après
     la grâce de la Maison (`JOURS_DE_GRACE`) ;
   · le versé est l'union des versements du contrat et de la pièce, par
     identifiant : c'est ce qui referme le double registre ;
   · résiliation : ce qui a été réglé au-delà des séances comptées devient un
     avoir, au prorata, arrondi au franc ; un avoir n'est jamais retranché en
     silence (décision 9) ;
   · prix revu après le comptage du calibre : l'écart va sur la prochaine
     échéance, ou sur une échéance neuve à 30 jours s'il n'en reste aucune ;
     en sa faveur, il se retranche de la prochaine, le reste en avoir
     (décision 10) ;
   · une séance proposée par la Maison compte aussitôt parmi les réservées ;
     refusée, elle revient à la formule ;
   · le statut stocké `exhausted` (cinq contrats repris de l'ancien ERP) ne
     décide plus rien : l'état se lit sur les faits.

   PUR : aucun magasin, aucun réseau, aucune horloge. Le jour est passé en
   argument (`jourDeCotonou()` chez l'appelant), jamais `toISOString()`.
   `abonnements.ts` lie ses magasins au chargement : on n'en importe que des
   TYPES. Les juges justes qu'il porte (`dansLaVieDuContrat`, `coversSub`,
   `inclusVendus`, `contratPourLaDate`) sont repris ici sans magasin, et le
   banc vérifie qu'ils disent la même chose là où rien n'a changé. */
import type { Plan, PlanIncluded, Subscriber, Payment } from './abonnements';
import type { Appointment } from './agenda';
import type { Invoice, InvoicePayment } from './finance';
import { etatDesEcheances, JOURS_DE_GRACE, type Echeance } from './echeancier';
import { dejaPriseParLaTete, leFoyerJoue, prixDuFoyer, soinDeLaLune } from './formules-en-lunes-pur';
import { decaleLeJour } from './ia-faits-pur';

/* ══ LES FAITS QUE LE MODÈLE PORTERA (lot L3) ══════════════════════════
   Le juge lit des FAITS, jamais des états. Ceux-ci n'existent pas encore
   dans le modèle : ils sont tous facultatifs, et leur absence redonne la
   lecture d'avant. */

/** Ce que l'on sait d'une séance, au-delà du rendez-vous d'aujourd'hui. */
export type FaitsDeLaSeance = {
  /** L'INSTANT de l'annulation (ISO, avec fuseau ; sans fuseau = Cotonou).
      Absent sur les annulations d'avant : elles ne se comptent pas. */
  annuleeLe?: string;
  /** Qui a annulé. Une annulation de la Maison ne se compte jamais. */
  annuleePar?: 'cliente' | 'maison';
  /** Elle n'est pas venue : posé au comptoir (« Absente : marquer manquée »). */
  absente?: { le: string; par?: string };
  /** LA SÉANCE RENDUE : une manquée que la Maison redonne, avec son motif. */
  rendue?: { le: string; motif: string; par?: string };
  /** Proposée par la Maison (la cadence posée d'avance), en attente d'elle. */
  proposeeLe?: string;
};
export type SeanceLue = Appointment & FaitsDeLaSeance;

/** Ce que l'on sait d'un contrat, au-delà de l'abonnée d'aujourd'hui. */
export type FaitsDuContrat = {
  /** 'couronne' : pris en ligne (écrit par `souscrire_a_une_formule`). */
  origine?: 'couronne' | 'comptoir';
  /** LA RÉSILIATION DATÉE. Absente sur un `churn` d'avant : il ne réclame
      plus rien et ne rend rien, comme avant. */
  resilieeLe?: string;
  motifDeResiliation?: string;
  /** Elle a renoncé à une formule retenue (« Renoncer »). */
  renonceeLe?: string;
  /** LA SUSPENSION, datée, avec son motif : « En pause jusqu'au … ». */
  suspendue?: { du: string; au: string; motif?: string };
  /** LE DERNIER PRIX REVU après le comptage du calibre. L'échéancier écrit
      porte déjà l'écart (`echeancierApresPrixRevu`) ; ceci sert l'annonce. */
  prixRevu?: { le: string; ancienXof: number; nouveauXof: number; calibre?: string };
};
export type ContratLu = Subscriber & FaitsDuContrat;

/* ══ LES MOTS ═══════════════════════════════════════════════════════════ */

/** Les états d'une séance, les mêmes partout. « À clôturer » ne se lit que
    côté Maison : une séance passée restée confirmée n'est jamais « faite ». */
export type EtatSeance = 'a-confirmer' | 'confirmee' | 'proposee' | 'faite' | 'annulee' | 'manquee' | 'a-cloturer';

/** Les états d'une formule. `effacee` : une retenue jamais réglée ; elle se
    dit « Retenue non réglée, effacée le … », sans pastille. */
export type EtatFormule = 'retenue' | 'en-cours' | 'en-pause' | 'epuisee' | 'terminee' | 'resiliee' | 'effacee';

export type ReglesDeLaMaison = {
  /** Les jours après une échéance avant que la porte des réservations se ferme. */
  graceJours: number;
  /** En deçà, une annulation de la cliente compte la séance (décision 3). */
  delaiAnnulationHeures: number;
  /** Les jours d'une formule retenue (décision 7). */
  retenueJours: number;
  /** Combien de jours l'accueil annonce un prix revu. */
  annoncePrixRevuJours: number;
  /** Le seuil de la fin de paquet (une séance, ou quinze jours). */
  finProche: { seances: number; jours: number };
};

export const REGLES_DE_LA_MAISON: ReglesDeLaMaison = {
  graceJours: JOURS_DE_GRACE,
  delaiAnnulationHeures: 24,
  retenueJours: 7,
  annoncePrixRevuJours: 14,
  finProche: { seances: 1, jours: 15 },
};

/* ══ LES JOURS ══════════════════════════════════════════════════════════ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const estIso = (s: string | null | undefined): s is string => !!s && ISO.test(s);

/** Le nombre de jours de `de` à `a` (négatif si `a` est avant). */
export const joursEntre = (de: string, a: string): number =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** LE DIMANCHE PASSE AU LUNDI : la porte de la Maison est close le dimanche.
    Une échéance, ou le dernier jour d'une retenue, tombant un dimanche se
    juge le lundi. */
export const jourOuvre = (iso: string): string =>
  (estIso(iso) && new Date(`${iso}T12:00:00Z`).getUTCDay() === 0 ? decaleLeJour(iso, 1) : iso);

/** Un instant ISO en millisecondes. Sans fuseau, c'est l'heure de Cotonou
    (UTC+1, sans heure d'été) : jamais celle de l'appareil. */
const instantDe = (iso: string): number => {
  const s = iso.length <= 10 ? `${iso}T00:00:00` : iso;
  return Date.parse(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}+01:00`);
};

const debutDeLaSeance = (a: Pick<Appointment, 'date' | 'time'>): number => {
  const h = /^(\d{1,2}):(\d{2})$/.exec(a.time ?? '');
  return instantDe(`${a.date}T${h ? `${h[1].padStart(2, '0')}:${h[2]}` : '00:00'}:00`);
};

/* ══ LE CONTRAT : SA VIE, SES LUNES, SON CONTENU ═══════════════════════ */

const estUnPaquet = (plan: Plan | undefined): boolean => plan?.mode === 'pack';

/** LE JOUR OÙ CE CONTRAT A COMMENCÉ D'EXISTER (même règle que `debutDuContrat`). */
export const debutDuContratLu = (sub: Subscriber): string =>
  (estIso(sub.startIso) ? sub.startIso : sub.sinceIso) ?? '0000-01-01';

/** LA FIN VENDUE, jamais la durée de la formule. `null` : sans fin. */
export const finDuContratLu = (sub: Subscriber): string | null => (estIso(sub.expiresIso) ? sub.expiresIso : null);

/** CE JOUR-LÀ, LE CONTRAT EST-IL EN VIE ? Rien avant la signature ; le
    dernier jour vendu en fait partie (même règle que `dansLaVieDuContrat`). */
export const dansLaVie = (sub: Subscriber, dateIso: string): boolean => {
  if (dateIso < debutDuContratLu(sub)) return false;
  const fin = finDuContratLu(sub);
  return !fin || dateIso <= fin;
};

const dureeDeLaLune = (sub: Subscriber): number =>
  (sub.cycle === 'annuel' ? 365 : sub.cycle === 'semestriel' ? 180 : 30);

/** LA LUNE QUI CONTIENT CETTE DATE, [du, au). Les lunes réglées finissent à
    `nextIso` : on en descend ou on en remonte par pas d'une lune.

    LE JOUR, PAS L'ÉCHÉANCE, CHOISIT LA LUNE. L'ancien juge prenait toujours
    [nextIso − 30, nextIso) : une lune réglée d'avance faisait passer les
    séances du mois en cours hors du compte. */
export function luneDeLaDate(sub: Subscriber, dateIso: string): { du: string; au: string } | null {
  if (!estIso(sub.nextIso)) return null;
  const d = dureeDeLaLune(sub);
  const ancre = decaleLeJour(sub.nextIso, -d);
  const du = decaleLeJour(ancre, Math.floor(joursEntre(ancre, dateIso) / d) * d);
  return { du, au: decaleLeJour(du, d) };
}

/** LA LUNE QUI SUIT UN RÈGLEMENT : réglée d'avance, elle prolonge la lune en
    cours ; réglée en pause, elle commence le jour du règlement (décision 5).
    Rend le nouveau `nextIso`, pour l'écriture serveur. */
export const prochaineIsoApresReglement = (sub: Subscriber, jourDuReglement: string): string => {
  const depuis = estIso(sub.nextIso) && sub.nextIso > jourDuReglement ? sub.nextIso : jourDuReglement;
  return decaleLeJour(depuis, dureeDeLaLune(sub));
};

/** LE CONTENU VENDU À CETTE DATE : ses quotas à elle, sinon ceux de la
    formule, et le soin de la lune du moment (même règle que `inclusVendus`). */
export const inclusALaDate = (sub: Subscriber, plan: Plan | undefined, dateIso: string): PlanIncluded[] => {
  const base = sub.inclusPropres ?? plan?.included ?? [];
  const soin = plan ? soinDeLaLune(plan, sub.sinceIso ?? sub.startIso ?? undefined, dateIso) : undefined;
  return soin && !base.some((i) => i.serviceId === soin) ? [...base, { serviceId: soin, qty: 1 }] : base;
};

/** LE NOMBRE DE SÉANCES VENDUES : une séance est une venue, qui porte toutes
    ses prestations (« six séances, pas douze »). `null` : sans limite. */
const seancesVendues = (inclus: readonly PlanIncluded[]): number | null => {
  const bornees = inclus.filter((i) => i.qty !== null).map((i) => i.qty as number);
  return bornees.length ? Math.max(...bornees) : null;
};

/** LE CONTRAT EN VIGUEUR À CETTE DATE : le plus récent dont la vie la couvre
    (même règle que `contratPourLaDate`). Sert de repli aux séances d'avant
    le lien `subId`. */
export const contratPourLaDate = (
  subs: readonly Subscriber[], clientId: string, dateIso: string, _plans: readonly Plan[],
): Subscriber | undefined =>
  subs
    .filter((s) => s.clientId === clientId && s.status !== 'churn' && dansLaVie(s, dateIso))
    .sort((a, b) => (debutDuContratLu(a) < debutDuContratLu(b) ? 1 : -1))[0];

/* ══ LA SÉANCE ══════════════════════════════════════════════════════════ */

/** L'ÉTAT D'UNE SÉANCE, lu sur les faits, le même partout. */
export function etatDeLaSeance(a: SeanceLue, jour: string, regles: ReglesDeLaMaison = REGLES_DE_LA_MAISON): EtatSeance {
  if (a.status === 'honoré') return 'faite';
  if (a.absente) return 'manquee';
  if (a.status === 'annulé') {
    /* UNE PROPOSITION REFUSÉE N'EST PAS UNE ANNULATION : la séance revient à
       la formule, quelle que soit l'heure. */
    if (a.proposeeLe && !a.confirmeeParLaClienteLe) return 'annulee';
    if (a.annuleePar === 'maison' || !a.annuleeLe) return 'annulee';
    const heures = (debutDeLaSeance(a) - instantDe(a.annuleeLe)) / 3_600_000;
    return heures < regles.delaiAnnulationHeures ? 'manquee' : 'annulee';
  }
  if (a.date < jour) return 'a-cloturer';
  if (a.proposeeLe && a.status === 'en attente' && !a.confirmeeParLaClienteLe) return 'proposee';
  return a.status === 'en attente' ? 'a-confirmer' : 'confirmee';
}

/** Cet état prend-il un crédit ? Tout sauf l'annulée et la manquée rendue. */
const prendUnCredit = (etat: EtatSeance, a: FaitsDeLaSeance): boolean =>
  etat !== 'annulee' && !(etat === 'manquee' && a.rendue);

/** À QUEL CONTRAT APPARTIENT CETTE SÉANCE ? Une seule réponse, jamais deux.

    · `subId` : le contrat qu'il nomme, et lui seul. Un lien vers un contrat
      inconnu ne se rattache nulle part : c'est une anomalie à voir, pas une
      séance à reposer ailleurs.
    · sans lien (les séances d'avant) : le plus récent contrat en vie ce
      jour-là qui porte l'une de ses prestations, sinon le plus récent en vie.
      L'ancien juge la comptait sur TOUS les contrats qui la couvraient. */
export function contratDeLaSeance(
  a: Pick<Appointment, 'subId' | 'clientId' | 'date' | 'serviceIds'>,
  subsDeLaTete: readonly Subscriber[], plans: readonly Plan[],
): Subscriber | undefined {
  if (a.subId) return subsDeLaTete.find((s) => s.id === a.subId);
  const vivants = subsDeLaTete
    .filter((s) => s.clientId === a.clientId && dansLaVie(s, a.date))
    .sort((x, y) => (debutDuContratLu(x) < debutDuContratLu(y) ? 1 : -1));
  const porteLaPrestation = (s: Subscriber) => inclusALaDate(s, plans.find((p) => p.id === s.planId), a.date)
    .some((i) => a.serviceIds.includes(i.serviceId));
  return vivants.find(porteLaPrestation) ?? vivants[0];
}

/** CETTE SÉANCE EST-ELLE PORTÉE PAR CE CONTRAT ? Couverte, pas par un
    forfait, rattachée à lui, et dans sa vie. Son état (manquée, annulée) se
    juge ensuite. */
export function porteeParLeContrat(
  a: SeanceLue, sub: Subscriber, subsDeLaTete: readonly Subscriber[], plans: readonly Plan[],
): boolean {
  if (!a.coveredBySub) return false;
  /* UNE SUITE DE FORFAIT EST DÉJÀ PAYÉE PAR LE FORFAIT : la décompter sur la
     formule lui prendrait une séance qu'elle n'a pas utilisée. */
  if (a.coverKind === 'forfait') return false;
  if (!dansLaVie(sub, a.date)) return false;
  return contratDeLaSeance(a, subsDeLaTete, plans)?.id === sub.id;
}

/** CETTE SÉANCE PREND-ELLE UN CRÉDIT DE CE CONTRAT ? Portée par lui, son
    état prend un crédit, et elle n'est pas postérieure à sa résiliation. */
export function compteLaSeance(
  a: SeanceLue, sub: ContratLu, subsDeLaTete: readonly Subscriber[], plans: readonly Plan[],
  jour: string, regles: ReglesDeLaMaison = REGLES_DE_LA_MAISON,
): boolean {
  if (!porteeParLeContrat(a, sub, subsDeLaTete, plans)) return false;
  if (sub.resilieeLe && a.date > sub.resilieeLe) return false;
  return prendUnCredit(etatDeLaSeance(a, jour, regles), a);
}

/* ══ L'ARGENT ═══════════════════════════════════════════════════════════ */

export type Versement = {
  id: string; date: string; montantXof: number; moyen?: string;
  /** Où il est écrit. `les-deux` est la règle ; le reste dit d'où il vient. */
  inscrit: 'contrat' | 'piece' | 'les-deux';
  /** Le même identifiant porte deux montants différents : à voir au Trône. */
  desaccord?: boolean;
};

/** LE VERSÉ D'UN CONTRAT : ses versements à lui et ceux de sa pièce, réunis
    par identifiant. KkiaPay écrivait le contrat seul, MND PAY la pièce
    seule, le comptoir les deux : sommer les deux registres comptait deux
    fois le même billet, en lire un seul en oubliait un. */
export function versementsDuContrat(sub: Subscriber, invoices: readonly Invoice[]): Versement[] {
  const parId = new Map<string, Versement>();
  for (const p of (sub.payments ?? []) as Payment[]) {
    if (!p?.id) continue;
    parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof, moyen: p.method, inscrit: 'contrat' });
  }
  const piece = sub.invoiceId ? invoices.find((i) => i.id === sub.invoiceId) : undefined;
  for (const p of (piece?.payments ?? []) as InvoicePayment[]) {
    if (!p?.id) continue;
    const deja = parId.get(p.id);
    if (deja) parId.set(p.id, { ...deja, inscrit: 'les-deux', ...(deja.montantXof !== p.amountXof ? { desaccord: true } : {}) });
    else parId.set(p.id, { id: p.id, date: p.date, montantXof: p.amountXof, moyen: p.method, inscrit: 'piece' });
  }
  return [...parId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type StatutDEcheance = 'reglee' | 'a-regler-aujourdhui' | 'en-retard' | 'a-venir' | 'retenue' | 'annulee';

export type EcheanceDuContrat = Echeance & {
  /** Le jour où elle se juge : le lundi quand elle est écrite un dimanche. */
  dueIso: string;
  /** Le jour écrit au contrat. */
  dueEcriteIso: string;
  regleXof: number;
  resteXof: number;
  statut: StatutDEcheance;
  /** Le jour où l'argent l'a soldée. */
  regleeLe?: string;
  retardJours: number;
};

export type ArgentDuContrat = {
  prixVenduXof: number;
  regleXof: number;
  /** Tout ce qui reste à régler, échu ou non (jamais une lune non réglée). */
  resteXof: number;
  /** Échu au jour : le jour même compris. */
  aRegleAujourdhuiXof: number;
  /** Échu la veille ou avant : LA seule définition du retard. */
  enRetardXof: number;
  retardJours: number;
  aVenir: { dueIso: string; montantXof: number; numero?: number; genre: 'echeance' | 'lune' }[];
  echeances: EcheanceDuContrat[];
  prochaine?: { dueIso: string; montantXof: number };
  versements: Versement[];
  /** Ce que la Maison lui doit sur ce contrat : jamais retranché en silence. */
  avoirXof: number;
  /** Une retenue : rien n'est dû ; ceci ouvre la formule. */
  pourOuvrir?: { montantXof: number; avantIso: string };
  /** Une lune en pause : rien n'est dû ; ceci la rouvre. */
  luneARegler?: { depuisIso: string; montantXof: number };
  /** La résiliation, chiffrée au prorata. */
  prorata?: { seances: number; comptees: number; consommeXof: number; avoirXof: number; resteXof: number; le: string };
};

/** LE PRIX VENDU, sans magasin : le prix convenu, sinon le prix du paquet,
    sinon celui de la formule. L'appelant qui sait relire le calibre passe
    `prixVenduXof` d'abonnements.ts par `prixDuContrat`. */
const prixParDefaut = (sub: Subscriber, plan: Plan | undefined): number =>
  sub.prixConvenuXof ?? (estUnPaquet(plan) ? sub.priceXof : undefined) ?? plan?.priceXof ?? 0;

/** L'échéancier qui fait foi : celui du contrat, sinon, pour un paquet, son
    prix entier attendu à la signature. Un cycle se règle lune par lune. */
const echeancesDeBase = (sub: Subscriber, plan: Plan | undefined, prixXof: number): Echeance[] => {
  if (sub.echeances?.length) return [...sub.echeances].sort((a, b) => a.numero - b.numero).map((e) => ({ ...e }));
  return estUnPaquet(plan) && prixXof > 0 ? [{ numero: 1, dueIso: debutDuContratLu(sub), amountXof: prixXof }] : [];
};

/** Le jour où le cumul des versements a atteint ce montant. */
const jourOuLeCumulAtteint = (versements: readonly Versement[], cumulXof: number): string | undefined => {
  let s = 0;
  for (const v of versements) { s += v.montantXof; if (s >= cumulXof) return v.date; }
  return undefined;
};

export type OptionsDeLArgent = {
  prixXof?: number;
  etat?: EtatFormule;
  /** Les séances comptées au jour de la résiliation (faites et manquées). */
  compteesALaResiliation?: number;
  /** Le jour de fin de la retenue (pour `pourOuvrir`). */
  retenueJusquau?: string;
  regles?: ReglesDeLaMaison;
};

/** L'ARGENT D'UN CONTRAT : un seul calcul pour le reste dû, l'échu, le
    retard, l'à venir et l'avoir. Remplace `resteDuContrat`, `retardDuContrat`
    et `duDeLAbonnement`. */
export function argentDuContrat(
  sub: ContratLu, plan: Plan | undefined, invoices: readonly Invoice[], jour: string, o: OptionsDeLArgent = {},
): ArgentDuContrat {
  const prix = o.prixXof ?? prixParDefaut(sub, plan);
  const versements = versementsDuContrat(sub, invoices);
  const regle = versements.reduce((s, v) => s + v.montantXof, 0);
  const base = echeancesDeBase(sub, plan, prix);
  const etat = o.etat;
  const resiliee = etat === 'resiliee';
  const sansDette = resiliee || etat === 'effacee' || etat === 'retenue';

  let cumul = 0;
  const echeances: EcheanceDuContrat[] = etatDesEcheances(base, regle, jour).map((e) => {
    cumul += e.amountXof;
    const dueIso = jourOuvre(e.dueIso);
    let statut: StatutDEcheance;
    if (e.soldee) statut = 'reglee';
    else if (etat === 'retenue') statut = 'retenue';
    else if (sansDette) statut = 'annulee';
    else if (dueIso < jour) statut = 'en-retard';
    else if (dueIso === jour) statut = 'a-regler-aujourdhui';
    else statut = 'a-venir';
    return {
      numero: e.numero, amountXof: e.amountXof, dueIso, dueEcriteIso: e.dueIso,
      regleXof: e.regleXof, resteXof: e.resteXof, statut,
      ...(e.soldee ? { regleeLe: jourOuLeCumulAtteint(versements, cumul) } : {}),
      retardJours: statut === 'en-retard' ? joursEntre(dueIso, jour) : 0,
    };
  });

  const ouvertes = echeances.filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard' || e.statut === 'a-venir');
  let resteXof = ouvertes.reduce((s, e) => s + e.resteXof, 0);
  let aRegleAujourdhuiXof = echeances
    .filter((e) => e.statut === 'a-regler-aujourdhui' || e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0);
  const enRetardXof = echeances.filter((e) => e.statut === 'en-retard').reduce((s, e) => s + e.resteXof, 0);
  const retardJours = echeances.reduce((m, e) => Math.max(m, e.retardJours), 0);
  const aVenir: ArgentDuContrat['aVenir'] = echeances
    .filter((e) => e.statut === 'a-venir').map((e) => ({ dueIso: e.dueIso, montantXof: e.resteXof, numero: e.numero, genre: 'echeance' }));

  /* LE TROP-VERSÉ EST UN AVOIR, jamais une remise sur la suivante. */
  const totalEcheancier = base.reduce((s, e) => s + e.amountXof, 0);
  let avoirXof = base.length && etat !== 'effacee' ? Math.max(0, regle - totalEcheancier) : 0;

  const out: ArgentDuContrat = {
    prixVenduXof: prix, regleXof: regle, resteXof, aRegleAujourdhuiXof, enRetardXof, retardJours,
    aVenir, echeances, versements, avoirXof,
  };

  /* LA RÉSILIATION DATÉE, AU PRORATA (décision 9). Ce qui a été réglé au-delà
     des séances comptées revient en avoir ; ce qui a été consommé au-delà du
     réglé reste dû au jour de la résiliation. Arrondi au franc. Un `churn`
     d'avant, sans date, ne réclame plus rien et ne rend rien. */
  if (resiliee && sub.resilieeLe && estUnPaquet(plan)) {
    const seances = seancesVendues(inclusALaDate(sub, plan, sub.resilieeLe)) ?? 0;
    const comptees = o.compteesALaResiliation ?? 0;
    if (seances > 0) {
      const consommeXof = Math.round((prix * Math.min(comptees, seances)) / seances);
      const avoir = Math.max(0, regle - consommeXof);
      const reste = Math.max(0, consommeXof - regle);
      out.prorata = { seances, comptees, consommeXof, avoirXof: avoir, resteXof: reste, le: sub.resilieeLe };
      avoirXof = avoir;
      resteXof = reste;
      aRegleAujourdhuiXof = reste > 0 && sub.resilieeLe <= jour ? reste : 0;
      out.avoirXof = avoirXof; out.resteXof = resteXof; out.aRegleAujourdhuiXof = aRegleAujourdhuiXof;
    }
  }

  if (etat === 'retenue') {
    const premiere = base[0]?.amountXof ?? prix;
    out.pourOuvrir = { montantXof: premiere, avantIso: o.retenueJusquau ?? jourOuvre(decaleLeJour(debutDuContratLu(sub), (o.regles ?? REGLES_DE_LA_MAISON).retenueJours)) };
  }

  /* LA LUNE : jamais une dette. Elle s'annonce à venir, ou se règle pour
     rouvrir la formule en pause. */
  if (!estUnPaquet(plan) && !sansDette && estIso(sub.nextIso) && !base.length) {
    const quand = jourOuvre(sub.nextIso);
    const suspendue = !!sub.suspendue && sub.suspendue.du <= jour && jour <= sub.suspendue.au;
    if (etat === 'en-pause' && !suspendue) out.luneARegler = { depuisIso: quand, montantXof: prix };
    else if (etat !== 'en-pause') out.aVenir.push({ dueIso: quand, montantXof: prix, genre: 'lune' });
  }

  const prochaine = ouvertes[0];
  if (prochaine) out.prochaine = { dueIso: prochaine.dueIso, montantXof: prochaine.resteXof };
  else if (out.aVenir.length) out.prochaine = { dueIso: out.aVenir[0].dueIso, montantXof: out.aVenir[0].montantXof };
  return out;
}

/* ══ L'ÉTAT D'UNE FORMULE ═══════════════════════════════════════════════ */

export type EtatDeLaFormule = {
  etat: EtatFormule;
  retenueJusquau?: string;
  effaceeLe?: string;
  pause?: { genre: 'lune'; depuisIso: string } | { genre: 'suspension'; du: string; au: string; motif?: string };
};

/** L'ÉTAT D'UNE FORMULE, LU ET NON STOCKÉ. L'ordre des questions est la
    définition : résiliée › effacée › terminée › retenue › en pause ›
    épuisée › en cours. `exhausted`, `risk`, `new` ne décident de rien. */
export function etatDeLaFormule(
  sub: ContratLu, plan: Plan | undefined, o: { jour: string; regleXof: number; lignes: readonly LigneDeSeances[]; regles?: ReglesDeLaMaison },
): EtatDeLaFormule {
  const { jour } = o;
  const regles = o.regles ?? REGLES_DE_LA_MAISON;
  if (sub.resilieeLe ? sub.resilieeLe <= jour : sub.status === 'churn') return { etat: 'resiliee' };

  /* LA RETENUE : prise en ligne, rien de réglé. Sept jours, le dernier au
     lundi s'il tombe un dimanche, puis elle s'efface le lendemain. */
  if (sub.origine === 'couronne' && o.regleXof <= 0) {
    if (sub.renonceeLe && sub.renonceeLe <= jour) return { etat: 'effacee', effaceeLe: sub.renonceeLe };
    const jusquau = jourOuvre(decaleLeJour(debutDuContratLu(sub), regles.retenueJours));
    if (jour > jusquau) return { etat: 'effacee', effaceeLe: decaleLeJour(jusquau, 1), retenueJusquau: jusquau };
    return { etat: 'retenue', retenueJusquau: jusquau };
  }

  const fin = finDuContratLu(sub);
  if (fin && fin < jour) return { etat: 'terminee' };

  if (sub.suspendue && sub.suspendue.du <= jour && jour <= sub.suspendue.au) {
    return { etat: 'en-pause', pause: { genre: 'suspension', ...sub.suspendue } };
  }
  /* UNE LUNE NON RÉGLÉE MET LA FORMULE EN PAUSE le jour même de son échéance
     (le lundi si elle tombe un dimanche), jamais de dette. */
  if (!estUnPaquet(plan) && estIso(sub.nextIso) && jour >= jourOuvre(sub.nextIso)) {
    return { etat: 'en-pause', pause: { genre: 'lune', depuisIso: jourOuvre(sub.nextIso) } };
  }
  /* ÉPUISÉE : toutes ses séances bornées sont prises. Elle ne bloque rien :
     une autre formule peut se prendre à côté. */
  const bornees = o.lignes.filter((l) => l.incluses !== null);
  if (estUnPaquet(plan) && bornees.length && bornees.every((l) => (l.disponibles ?? 0) <= 0)) return { etat: 'epuisee' };
  return { etat: 'en-cours' };
}

/* ══ LE RELEVÉ ══════════════════════════════════════════════════════════ */

export type SeanceDuContrat = {
  id: string; date: string; time: string; serviceIds: string[];
  etat: EtatSeance;
  /** Elle prend un crédit de ce contrat. */
  compte: boolean;
  rendue: boolean;
  /** « séance 3 sur 6 » : son rang parmi celles qui comptent, dans sa lune
      pour un cycle, dans toute la vie pour un paquet. `null` hors compte. */
  rang: number | null;
  total: number | null;
  /** Pourquoi elle ne compte pas, quand elle est portée par ce contrat. */
  pourquoiPas?: 'annulee' | 'rendue' | 'apres-resiliation';
};

export type LigneDeSeances = {
  serviceId: string;
  incluses: number | null;
  faites: number;
  /** À venir et non annulées, proposées comprises, à clôturer comprises. */
  reservees: number;
  /** Dont celles passées et restées confirmées (côté Maison). */
  aCloturer: number;
  manquees: number;
  /** incluses − (faites + réservées + manquées). `null` : sans limite. */
  disponibles: number | null;
  /** Plus de séances que vendues : une anomalie à montrer au Trône. */
  depasse: number;
  seances: string[];
};

export type RaisonDeLaPorte = 'retenue' | 'pause' | 'epuisee' | 'terminee' | 'resiliee' | 'effacee' | 'retard' | 'quota' | 'sans';

export type ReleveDuContrat = {
  sub: ContratLu;
  plan?: Plan;
  /** Le nom du contrat à voix haute : sa référence, sinon sa date de départ. */
  reference: string;
  nom: string;
  mode: 'pack' | 'cycle';
  etat: EtatFormule;
  debutIso: string;
  finIso: string | null;
  retenueJusquau?: string;
  effaceeLe?: string;
  resilieeLe?: string;
  pause?: EtatDeLaFormule['pause'];
  /** La lune des lignes : celle du jour, ou la dernière réglée en pause. */
  lune?: { du: string; au: string; prochaineIso: string };
  /** Une ligne par prestation incluse, dans la fenêtre du jour. */
  seances: LigneDeSeances[];
  /** Toutes les séances portées par ce contrat, datées. */
  attribuees: SeanceDuContrat[];
  /** Séances couvertes par ce contrat dont aucune prestation n'est vendue. */
  couvertsHorsFormule: string[];
  argent: ArgentDuContrat;
  porte: { peutReserverIncluse: boolean; raison?: RaisonDeLaPorte };
  finProche?: { motif: 'derniere-seance' | 'date-proche'; reste: number; jusquau: string | null };
};

export type GenreDAlerte = 'retard' | 'a-regler' | 'pause' | 'retenue' | 'prix-revu' | 'a-confirmer' | 'fin-proche';
/** L'ordre de l'accueil : une seule alerte, la plus urgente. */
export const ORDRE_DES_ALERTES: readonly GenreDAlerte[] = ['retard', 'a-regler', 'pause', 'retenue', 'prix-revu', 'a-confirmer', 'fin-proche'];

export type Alerte = {
  genre: GenreDAlerte;
  subId?: string;
  reference?: string;
  dueIso?: string;
  montantXof?: number;
  seanceId?: string;
  texte: string;
};

export type ResteHorsFormule = { id: string; genre: 'rituel' | 'piece'; date: string; resteXof: number; libelle?: string };

export type LigneDeSolde = {
  genre: 'echeance' | 'resiliation' | 'lune' | 'avoir' | 'rituel' | 'piece';
  statut: 'a-regler-aujourdhui' | 'en-retard' | 'a-venir' | 'avoir';
  montantXof: number;
  dueIso?: string;
  subId?: string;
  reference?: string;
  numero?: number;
  id?: string;
  libelle?: string;
};

export type SoldeDeLaCliente = {
  /** L'échu au jour, retard compris. Jamais additionné à l'à venir. */
  aRegleAujourdhuiXof: number;
  dontEnRetardXof: number;
  aVenirXof: number;
  /** À part, jamais retranché en silence. */
  avoirXof: number;
  parContrat: { subId: string; reference: string; aRegleAujourdhuiXof: number; enRetardXof: number; aVenirXof: number; avoirXof: number }[];
  lignes: LigneDeSolde[];
};

export type ReleveDeLAbonnee = {
  jour: string;
  clientId: string;
  /** Les formules qui courent (retenue, en cours, en pause, épuisée), celle
      qui finit le plus tôt d'abord. Il peut y en avoir plusieurs. */
  contrats: ReleveDuContrat[];
  /** Terminées, résiliées, effacées : de la plus récente à la plus ancienne. */
  anciens: ReleveDuContrat[];
  porte: { peutReserverIncluse: boolean; peutAcheter: boolean; raison?: RaisonDeLaPorte };
  alerte?: Alerte;
  /** Toutes les alertes, dans l'ordre de l'accueil (le Trône les lit toutes). */
  alertes: Alerte[];
  solde: SoldeDeLaCliente;
};

export type EntreeDuReleve = {
  /** Le jour à Cotonou, AAAA-MM-JJ. */
  jour: string;
  /** La tête : la cliente, ou l'enfant qu'elle porte. */
  clientId: string;
  subs: readonly ContratLu[];
  plans: readonly Plan[];
  /** Ses rendez-vous, lus par pages côté serveur (jamais 1000 pile). */
  appts: readonly SeanceLue[];
  invoices: readonly Invoice[];
  regles?: Partial<ReglesDeLaMaison>;
  /** Le prix vendu relu au calibre (`prixVenduXof`), quand l'appelant l'a. */
  prixDuContrat?: (sub: Subscriber, plan: Plan | undefined) => number;
  /** Les rituels passés et les pièces hors abonnement qui gardent un reste. */
  restesHorsFormule?: readonly ResteHorsFormule[];
};

/* ── LES PHRASES : l'année toujours, aucune civilité, aucun numéro de pièce ── */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « lundi 2 novembre 2026 », « dimanche 1er novembre 2026 ». */
export const jourDitAvecLAnnee = (iso: string): string => {
  if (!estIso(iso)) return iso;
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
};
/** « 70 000 F », espaces insécables. */
export const francs = (n: number): string =>
  `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const heureDite = (t: string): string => {
  const h = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  return h ? `${Number(h[1])} h${h[2] === '00' ? '' : ` ${h[2]}`}` : t;
};
const rangDit = (n: number): string => (n === 1 ? '1re' : `${n}e`);

const ordreDe = (g: GenreDAlerte): number => ORDRE_DES_ALERTES.indexOf(g);

/** LE RELEVÉ D'UNE TÊTE : toutes ses formules, chacune avec ses séances, son
    argent et sa porte ; l'alerte la plus urgente ; le solde. Tout écran et
    tout message lisent ceci, et rien d'autre. */
export function releveDeLAbonnee(e: EntreeDuReleve): ReleveDeLAbonnee {
  const regles: ReglesDeLaMaison = { ...REGLES_DE_LA_MAISON, ...(e.regles ?? {}) };
  const { jour } = e;
  const siens = e.subs.filter((s) => s.clientId === e.clientId);
  const appts = e.appts.filter((a) => a.clientId === e.clientId);
  const planDe = (s: Subscriber) => e.plans.find((p) => p.id === s.planId);

  const releves = siens.map((sub): ReleveDuContrat => {
    const plan = planDe(sub);
    const paquet = estUnPaquet(plan);
    const prixXof = e.prixDuContrat ? e.prixDuContrat(sub, plan) : prixParDefaut(sub, plan);

    /* SES SÉANCES, toutes, avec leur état et leur crédit. */
    const portees = appts.filter((a) => porteeParLeContrat(a, sub, siens, e.plans));
    const lues = portees.map((a) => {
      const etat = etatDeLaSeance(a, jour, regles);
      const apres = !!sub.resilieeLe && a.date > sub.resilieeLe;
      const compte = !apres && prendUnCredit(etat, a);
      return {
        a, etat, compte,
        pourquoiPas: compte ? undefined : apres ? 'apres-resiliation' as const : a.rendue ? 'rendue' as const : 'annulee' as const,
      };
    });
    /* LA FENÊTRE D'UNE SÉANCE : toute la vie pour un paquet, sa lune pour un cycle. */
    const fenetreDe = (dateIso: string): { du: string; au: string } | null => (paquet ? null : luneDeLaDate(sub, dateIso));
    const memeFenetre = (x: string, y: string): boolean => {
      if (paquet) return true;
      const f = fenetreDe(x);
      return !f || (y >= f.du && y < f.au);
    };
    const parOrdre = [...lues].sort((x, y) => (x.a.date === y.a.date ? (x.a.time < y.a.time ? -1 : 1) : (x.a.date < y.a.date ? -1 : 1)));
    const attribuees: SeanceDuContrat[] = parOrdre.map((l) => {
      const total = seancesVendues(inclusALaDate(sub, plan, l.a.date));
      const rang = l.compte
        ? parOrdre.filter((m) => m.compte && memeFenetre(l.a.date, m.a.date)
          && (m.a.date < l.a.date || (m.a.date === l.a.date && m.a.time <= l.a.time))).length
        : null;
      return {
        id: l.a.id, date: l.a.date, time: l.a.time, serviceIds: [...l.a.serviceIds], etat: l.etat,
        compte: l.compte, rendue: !!l.a.rendue, rang, total,
        ...(l.pourquoiPas ? { pourquoiPas: l.pourquoiPas } : {}),
      };
    });

    /* LA FENÊTRE DU JOUR : la lune du jour, ou en pause la dernière réglée. */
    let lune: ReleveDuContrat['lune'];
    let dansLaFenetre: (d: string) => boolean = () => true;
    let dateDuContenu = jour;
    if (!paquet && estIso(sub.nextIso)) {
      const ref = jour < sub.nextIso ? jour : decaleLeJour(sub.nextIso, -1);
      const f = luneDeLaDate(sub, ref);
      if (f) {
        lune = { ...f, prochaineIso: jourOuvre(sub.nextIso) };
        dansLaFenetre = (d) => d >= f.du && d < f.au;
        dateDuContenu = f.du;
      }
    }
    const inclus = inclusALaDate(sub, plan, dateDuContenu);
    const dansFenetre = attribuees.filter((s) => dansLaFenetre(s.date));
    const lignes: LigneDeSeances[] = inclus.map((i) => {
      const leurs = dansFenetre.filter((s) => s.serviceIds.includes(i.serviceId));
      const comptees = leurs.filter((s) => s.compte);
      const faites = comptees.filter((s) => s.etat === 'faite').length;
      const manquees = comptees.filter((s) => s.etat === 'manquee').length;
      const reservees = comptees.length - faites - manquees;
      const aCloturer = comptees.filter((s) => s.etat === 'a-cloturer').length;
      const pris = comptees.length;
      return {
        serviceId: i.serviceId, incluses: i.qty, faites, reservees, aCloturer, manquees,
        disponibles: i.qty === null ? null : Math.max(0, i.qty - pris),
        depasse: i.qty === null ? 0 : Math.max(0, pris - i.qty),
        seances: leurs.map((s) => s.id),
      };
    });
    const couvertsHorsFormule = attribuees
      .filter((s) => !inclusALaDate(sub, plan, s.date).some((i) => s.serviceIds.includes(i.serviceId))).map((s) => s.id);

    const versements = versementsDuContrat(sub, e.invoices);
    const regleXof = versements.reduce((s, v) => s + v.montantXof, 0);
    const etatF = etatDeLaFormule(sub, plan, { jour, regleXof, lignes, regles });
    const compteesALaResiliation = attribuees.filter((s) => s.compte && (s.etat === 'faite' || s.etat === 'manquee')).length;
    const argent = argentDuContrat(sub, plan, e.invoices, jour, {
      prixXof, etat: etatF.etat, compteesALaResiliation, retenueJusquau: etatF.retenueJusquau, regles,
    });

    /* LA PORTE DE CE CONTRAT : réserver une séance incluse. */
    let porte: ReleveDuContrat['porte'] = { peutReserverIncluse: true };
    const parEtat: Partial<Record<EtatFormule, RaisonDeLaPorte>> = {
      retenue: 'retenue', 'en-pause': 'pause', epuisee: 'epuisee', terminee: 'terminee', resiliee: 'resiliee', effacee: 'effacee',
    };
    const fermee = parEtat[etatF.etat];
    if (fermee) porte = { peutReserverIncluse: false, raison: fermee };
    else if (argent.retardJours > regles.graceJours) porte = { peutReserverIncluse: false, raison: 'retard' };
    else if (lignes.length && lignes.every((l) => l.disponibles !== null && l.disponibles <= 0)) porte = { peutReserverIncluse: false, raison: 'quota' };

    /* LA FIN DE PAQUET : une séance, ou quinze jours avant la date (le premier). */
    let finProche: ReleveDuContrat['finProche'];
    const finIso = finDuContratLu(sub);
    if (paquet && etatF.etat === 'en-cours') {
      const bornees = lignes.filter((l) => l.disponibles !== null);
      if (bornees.length) {
        const reste = Math.min(...bornees.map((l) => l.disponibles as number));
        if (reste > 0 && reste <= regles.finProche.seances) finProche = { motif: 'derniere-seance', reste, jusquau: finIso };
        else if (reste > 0 && finIso && joursEntre(jour, finIso) <= regles.finProche.jours) finProche = { motif: 'date-proche', reste, jusquau: finIso };
      }
    }

    return {
      sub, plan,
      reference: sub.reference ?? (sub.sinceIso ? `depuis le ${jourDitAvecLAnnee(sub.sinceIso)}` : 'sans référence'),
      nom: plan?.name ?? 'Formule retirée',
      mode: paquet ? 'pack' : 'cycle',
      etat: etatF.etat,
      debutIso: debutDuContratLu(sub),
      finIso,
      ...(etatF.retenueJusquau ? { retenueJusquau: etatF.retenueJusquau } : {}),
      ...(etatF.effaceeLe ? { effaceeLe: etatF.effaceeLe } : {}),
      ...(etatF.etat === 'resiliee' && sub.resilieeLe ? { resilieeLe: sub.resilieeLe } : {}),
      ...(etatF.pause ? { pause: etatF.pause } : {}),
      ...(lune ? { lune } : {}),
      seances: lignes, attribuees, couvertsHorsFormule, argent, porte,
      ...(finProche ? { finProche } : {}),
    };
  });

  const COURENT: readonly EtatFormule[] = ['retenue', 'en-cours', 'en-pause', 'epuisee'];
  const finDe = (c: ReleveDuContrat) => c.finIso ?? '9999-12-31';
  const contrats = releves.filter((c) => COURENT.includes(c.etat))
    .sort((a, b) => (finDe(a) === finDe(b) ? (a.debutIso < b.debutIso ? -1 : 1) : (finDe(a) < finDe(b) ? -1 : 1)));
  const anciens = releves.filter((c) => !COURENT.includes(c.etat)).sort((a, b) => (a.debutIso < b.debutIso ? 1 : -1));

  const alertes = alertesDuReleve(contrats, anciens, jour, regles);
  const solde = soldeDuReleve([...contrats, ...anciens], e.restesHorsFormule ?? [], jour);

  const ouverte = contrats.some((c) => c.porte.peutReserverIncluse);
  const ORDRE_DES_RAISONS: readonly RaisonDeLaPorte[] = ['retard', 'pause', 'retenue', 'quota', 'epuisee'];
  const raisons = contrats.map((c) => c.porte.raison).filter((r): r is RaisonDeLaPorte => !!r);
  const raison = ouverte ? undefined
    : (ORDRE_DES_RAISONS.find((r) => raisons.includes(r)) ?? (contrats.length ? raisons[0] : 'sans'));

  return {
    jour, clientId: e.clientId, contrats, anciens,
    /* PLUSIEURS FORMULES PEUVENT COURIR ENSEMBLE : une formule en cours ne
       ferme pas l'achat. Seules la formule fermée et « une fois par tête »
       refusent (`peutAcheterLaFormule`). */
    porte: { peutReserverIncluse: ouverte, peutAcheter: true, ...(raison ? { raison } : {}) },
    ...(alertes[0] ? { alerte: alertes[0] } : {}),
    alertes, solde,
  };
}

/** LES ALERTES DE L'ACCUEIL, toutes formules confondues, la plus urgente
    d'abord ; à genre égal, la plus ancienne échéance. L'argent dû alerte
    aussi sur une formule finie : finir ne solde rien. */
function alertesDuReleve(
  contrats: readonly ReleveDuContrat[], anciens: readonly ReleveDuContrat[], jour: string, regles: ReglesDeLaMaison,
): Alerte[] {
  const out: Alerte[] = [];
  for (const c of anciens) {
    if (c.etat === 'effacee') continue;
    const base = { subId: c.sub.id, reference: c.reference };
    const retard = c.argent.echeances.find((x) => x.statut === 'en-retard');
    if (retard) {
      out.push({ ...base, genre: 'retard', dueIso: retard.dueIso, montantXof: c.argent.enRetardXof,
        texte: `Votre ${rangDit(retard.numero)} échéance du ${jourDitAvecLAnnee(retard.dueIso)} attend : ${francs(c.argent.enRetardXof)}.` });
    }
    const p = c.argent.prorata;
    if (p && p.resteXof > 0) {
      out.push({ ...base, genre: p.le < jour ? 'retard' : 'a-regler', dueIso: p.le, montantXof: p.resteXof,
        texte: `Votre ${c.nom}, résiliée le ${jourDitAvecLAnnee(p.le)}, garde un reste à régler : ${francs(p.resteXof)}.` });
    }
  }
  for (const c of contrats) {
    const base = { subId: c.sub.id, reference: c.reference };
    const ech = c.argent.echeances;
    const retard = ech.find((x) => x.statut === 'en-retard');
    if (retard) {
      out.push({ ...base, genre: 'retard', dueIso: retard.dueIso, montantXof: c.argent.enRetardXof,
        texte: `Votre ${rangDit(retard.numero)} échéance du ${jourDitAvecLAnnee(retard.dueIso)} attend : ${francs(c.argent.enRetardXof)}.` });
    }
    const duJour = ech.find((x) => x.statut === 'a-regler-aujourdhui');
    if (duJour) {
      out.push({ ...base, genre: 'a-regler', dueIso: duJour.dueIso, montantXof: duJour.resteXof,
        texte: `Votre ${rangDit(duJour.numero)} échéance est à régler aujourd’hui, ${jourDitAvecLAnnee(duJour.dueIso)} : ${francs(duJour.resteXof)}.` });
    }
    if (c.etat === 'en-pause' && c.pause?.genre === 'lune') {
      out.push({ ...base, genre: 'pause', dueIso: c.pause.depuisIso, montantXof: c.argent.luneARegler?.montantXof,
        texte: `Votre prochaine lune attend son règlement depuis le ${jourDitAvecLAnnee(c.pause.depuisIso)} : la formule est en pause, sans dette. Elle court 30 jours à partir du jour où vous réglez.` });
    } else if (c.etat === 'en-pause' && c.pause?.genre === 'suspension') {
      out.push({ ...base, genre: 'pause', dueIso: c.pause.au,
        texte: `Votre formule est en pause jusqu’au ${jourDitAvecLAnnee(c.pause.au)}.` });
    }
    if (c.etat === 'retenue' && c.argent.pourOuvrir) {
      out.push({ ...base, genre: 'retenue', dueIso: c.argent.pourOuvrir.avantIso, montantXof: c.argent.pourOuvrir.montantXof,
        texte: `Votre formule est retenue jusqu’au ${jourDitAvecLAnnee(c.argent.pourOuvrir.avantIso)} au soir. Pour l’ouvrir : ${francs(c.argent.pourOuvrir.montantXof)}. Sans règlement, elle s’efface le lendemain, et rien n’est dû.` });
    }
    const pr = c.sub.prixRevu;
    if (pr && pr.le <= jour && joursEntre(pr.le, jour) <= regles.annoncePrixRevuJours) {
      out.push({ ...base, genre: 'prix-revu', dueIso: pr.le,
        texte: `Votre calibre a été compté le ${jourDitAvecLAnnee(pr.le)} : votre prix passe de ${francs(pr.ancienXof)} à ${francs(pr.nouveauXof)}.` });
    }
    const proposee = c.attribuees.find((s) => s.etat === 'proposee');
    if (proposee) {
      out.push({ ...base, genre: 'a-confirmer', dueIso: proposee.date, seanceId: proposee.id,
        texte: `La Maison vous propose une séance le ${jourDitAvecLAnnee(proposee.date)} à ${heureDite(proposee.time)} : confirmez-la.` });
    }
    if (c.finProche) {
      const f = c.finProche;
      out.push({ ...base, genre: 'fin-proche', ...(f.jusquau ? { dueIso: f.jusquau } : {}),
        texte: f.motif === 'derniere-seance'
          ? `Il vous reste 1 séance sur votre ${c.nom}${f.jusquau ? `, valable jusqu’au ${jourDitAvecLAnnee(f.jusquau)}` : ''}.`
          : `Votre ${c.nom} finit le ${jourDitAvecLAnnee(f.jusquau as string)} : il vous reste ${f.reste} séances.` });
    }
  }
  return out.sort((a, b) => ordreDe(a.genre) - ordreDe(b.genre) || (a.dueIso ?? '').localeCompare(b.dueIso ?? ''));
}

/** LE SOLDE DE LA TÊTE : à régler aujourd'hui, à venir, avoir. Trois chiffres
    séparés, listés contrat par contrat, jamais additionnés en un seul. */
function soldeDuReleve(releves: readonly ReleveDuContrat[], restes: readonly ResteHorsFormule[], jour: string): SoldeDeLaCliente {
  const lignes: LigneDeSolde[] = [];
  const parContrat: SoldeDeLaCliente['parContrat'] = [];
  for (const c of releves) {
    if (c.etat === 'effacee') continue;
    const base = { subId: c.sub.id, reference: c.reference };
    const ar = c.argent;
    for (const x of ar.echeances) {
      if (x.statut === 'a-regler-aujourdhui' || x.statut === 'en-retard' || x.statut === 'a-venir') {
        lignes.push({ ...base, genre: 'echeance', statut: x.statut, montantXof: x.resteXof, dueIso: x.dueIso, numero: x.numero });
      }
    }
    if (ar.prorata && ar.prorata.resteXof > 0) {
      lignes.push({ ...base, genre: 'resiliation', statut: ar.prorata.le < jour ? 'en-retard' : ar.prorata.le === jour ? 'a-regler-aujourdhui' : 'a-venir',
        montantXof: ar.prorata.resteXof, dueIso: ar.prorata.le });
    }
    for (const v of ar.aVenir) if (v.genre === 'lune') lignes.push({ ...base, genre: 'lune', statut: 'a-venir', montantXof: v.montantXof, dueIso: v.dueIso });
    if (ar.avoirXof > 0) lignes.push({ ...base, genre: 'avoir', statut: 'avoir', montantXof: ar.avoirXof });
    const siennes = lignes.filter((l) => l.subId === c.sub.id);
    parContrat.push({
      subId: c.sub.id, reference: c.reference,
      aRegleAujourdhuiXof: siennes.filter((l) => l.statut === 'a-regler-aujourdhui' || l.statut === 'en-retard').reduce((s, l) => s + l.montantXof, 0),
      enRetardXof: siennes.filter((l) => l.statut === 'en-retard').reduce((s, l) => s + l.montantXof, 0),
      aVenirXof: siennes.filter((l) => l.statut === 'a-venir').reduce((s, l) => s + l.montantXof, 0),
      avoirXof: siennes.filter((l) => l.statut === 'avoir').reduce((s, l) => s + l.montantXof, 0),
    });
  }
  for (const r of restes) {
    if (!(r.resteXof > 0)) continue;
    lignes.push({ genre: r.genre, id: r.id, libelle: r.libelle, montantXof: r.resteXof, dueIso: r.date,
      statut: r.date < jour ? 'en-retard' : r.date === jour ? 'a-regler-aujourdhui' : 'a-venir' });
  }
  const somme = (f: (l: LigneDeSolde) => boolean) => lignes.filter(f).reduce((s, l) => s + l.montantXof, 0);
  return {
    aRegleAujourdhuiXof: somme((l) => l.statut === 'a-regler-aujourdhui' || l.statut === 'en-retard'),
    dontEnRetardXof: somme((l) => l.statut === 'en-retard'),
    aVenirXof: somme((l) => l.statut === 'a-venir'),
    avoirXof: somme((l) => l.statut === 'avoir'),
    parContrat, lignes,
  };
}

/** LE SOLDE DE LA CLIENTE, seul. */
export const soldeDeLaCliente = (e: EntreeDuReleve): SoldeDeLaCliente => releveDeLAbonnee(e).solde;

/* ══ RÉSERVER : QUELLE FORMULE ? ═══════════════════════════════════════ */

export type FormuleProposee = {
  /** Celle qui finit le plus tôt et peut porter la séance : proposée d'office. */
  proposee?: ReleveDuContrat;
  /** Les autres qui le peuvent aussi, au choix d'une touche. */
  autres: ReleveDuContrat[];
};

/** CE CONTRAT PEUT-IL PORTER CETTE PRESTATION CE JOUR-LÀ ? En cours, sans
    retard au-delà de la grâce, en vie ce jour-là, sur une lune déjà réglée,
    et avec un crédit libre dans la fenêtre de ce jour. `sauf` : la séance
    que l'on déplace, qui ne se compte pas contre elle-même. */
export function peutPorter(c: ReleveDuContrat, serviceId: string, dateIso: string, sauf?: string): boolean {
  /* DÉPLACER LA DERNIÈRE SÉANCE D'UN PAQUET : il est épuisé par elle-même,
     elle doit pouvoir changer de jour sur son propre contrat. */
  const deplaceLaSienne = c.etat === 'epuisee' && !!sauf && c.attribuees.some((s) => s.id === sauf && s.compte);
  if ((c.etat !== 'en-cours' && !deplaceLaSienne) || c.porte.raison === 'retard') return false;
  if (!dansLaVie(c.sub, dateIso)) return false;
  if (c.sub.resilieeLe && dateIso > c.sub.resilieeLe) return false;
  if (c.sub.suspendue && c.sub.suspendue.du <= dateIso && dateIso <= c.sub.suspendue.au) return false;
  let fenetre: { du: string; au: string } | null = null;
  if (c.mode === 'cycle') {
    if (!estIso(c.sub.nextIso) || dateIso >= c.sub.nextIso) return false;
    fenetre = luneDeLaDate(c.sub, dateIso);
  }
  const ligne = inclusALaDate(c.sub, c.plan, dateIso).find((i) => i.serviceId === serviceId);
  if (!ligne) return false;
  if (ligne.qty === null) return true;
  const prises = c.attribuees.filter((s) => s.compte && s.id !== sauf && s.serviceIds.includes(serviceId)
    && (!fenetre || (s.date >= fenetre.du && s.date < fenetre.au))).length;
  return prises < ligne.qty;
}

/** LA FORMULE PROPOSÉE POUR RÉSERVER : parmi celles qui peuvent porter la
    séance, celle qui finit le plus tôt ; une formule sans fin passe après.
    Elle peut choisir l'autre d'une touche. */
export function formuleProposeePourReserver(
  releve: ReleveDeLAbonnee, serviceId: string, dateIso: string, sauf?: string,
): FormuleProposee {
  const possibles = releve.contrats.filter((c) => peutPorter(c, serviceId, dateIso, sauf))
    .sort((a, b) => {
      const fa = a.finIso ?? '9999-12-31';
      const fb = b.finIso ?? '9999-12-31';
      return fa === fb ? (a.debutIso < b.debutIso ? -1 : 1) : (fa < fb ? -1 : 1);
    });
  return { ...(possibles[0] ? { proposee: possibles[0] } : {}), autres: possibles.slice(1) };
}

/* ══ ACHETER ════════════════════════════════════════════════════════════ */

/** PEUT-ELLE PRENDRE CETTE FORMULE ? Une formule qui court ne ferme rien.
    Refusent seulement : la formule fermée à la vente, et « une fois par
    tête » déjà signée (une retenue effacée, jamais réglée, ne compte pas). */
export function peutAcheterLaFormule(
  plan: Plan, releve: ReleveDeLAbonnee, plans: readonly Plan[],
): { ok: true } | { ok: false; raison: 'fermee' | 'deja-prise'; contrat?: ContratLu } {
  if (plan.fermee) return { ok: false, raison: 'fermee' };
  const signes = [...releve.contrats, ...releve.anciens].filter((c) => c.etat !== 'effacee').map((c) => c.sub);
  const deja = dejaPriseParLaTete(plan, signes, plans);
  return deja ? { ok: false, raison: 'deja-prise', contrat: deja } : { ok: true };
}

/** LE PRIX POUR SA TÊTE, Foyer compris (décision 12) : −15 % pour la
    deuxième et la troisième tête, l'avantage total jamais au-delà de 25 %
    sous la valeur à la carte, arrondi au 500 F supérieur (`prixDuFoyer`). */
export function prixPourLaTete(o: { prixTeteXof: number; valeurCarteXof: number; rangDansLeFoyer: number }): {
  prixXof: number; foyerXof: number; foyerJoue: boolean; plafonne: boolean;
} {
  if (!leFoyerJoue(o.rangDansLeFoyer)) return { prixXof: o.prixTeteXof, foyerXof: 0, foyerJoue: false, plafonne: false };
  const prixXof = prixDuFoyer(o.prixTeteXof, o.valeurCarteXof);
  const sien = o.valeurCarteXof > 0 ? Math.max(0, 1 - o.prixTeteXof / o.valeurCarteXof) : 0;
  return { prixXof, foyerXof: o.prixTeteXof - prixXof, foyerJoue: true, plafonne: sien + 0.15 > 0.25 + 1e-9 };
}

/* ══ LE PRIX REVU APRÈS LE COMPTAGE ════════════════════════════════════ */

export type EcheancierRevu = {
  ok: boolean;
  refus?: string;
  ancienXof: number;
  nouveauXof: number;
  ecartXof: number;
  /** L'échéancier à écrire (vide pour un cycle : le prix vaut dès la lune suivante). */
  echeances: Echeance[];
  /** Le rang de l'échéance qui porte l'écart, quand il s'y ajoute ou s'en retranche. */
  porteeSur?: number;
  /** Une échéance neuve a été posée, à 30 jours. */
  nouvelle?: { numero: number; dueIso: string; amountXof: number };
  /** Ce qui, en sa faveur, dépasse la prochaine échéance : un avoir. */
  avoirXof: number;
};

/** CE QUE LE NOUVEAU PRIX FAIT À L'ÉCHÉANCIER (décision 10).

    · plus cher : l'écart s'ajoute à la PROCHAINE échéance non soldée ; s'il
      n'en reste aucune, il devient une échéance neuve à 30 jours (le lundi
      si c'est un dimanche), qui aura son rappel la veille ;
    · moins cher : l'écart se retranche de la prochaine ; ce qui la dépasse
      devient un avoir (le versé au-delà du nouveau total).

    L'ARGENT DÉJÀ REÇU NE BOUGE PAS : une tranche soldée reste soldée. */
export function echeancierApresPrixRevu(
  sub: ContratLu, plan: Plan | undefined, invoices: readonly Invoice[], nouveauXof: number, jour: string,
  o: { prixXof?: number } = {},
): EcheancierRevu {
  const ancien = o.prixXof ?? prixParDefaut(sub, plan);
  const nouveau = Math.max(0, Math.round(nouveauXof));
  const ecart = nouveau - ancien;
  const socle = { ancienXof: ancien, nouveauXof: nouveau, ecartXof: ecart, avoirXof: 0 };
  if (nouveau <= 0) return { ...socle, ok: false, refus: 'Un contrat à 0 F ne se vend pas. Résiliez-le plutôt.', echeances: [] };
  if (!estUnPaquet(plan) && !sub.echeances?.length) return { ...socle, ok: true, echeances: [] };

  const regle = versementsDuContrat(sub, invoices).reduce((s, v) => s + v.montantXof, 0);
  const base = echeancesDeBase(sub, plan, ancien);
  const etats = etatDesEcheances(base, regle, jour);
  const tranches = etats.map((x) => ({ numero: x.numero, dueIso: x.dueIso, amountXof: x.amountXof }));
  const iProchaine = etats.findIndex((x) => x.resteXof > 0);
  let porteeSur: number | undefined;
  let nouvelle: EcheancierRevu['nouvelle'];

  if (ecart > 0) {
    if (iProchaine >= 0) { tranches[iProchaine].amountXof += ecart; porteeSur = tranches[iProchaine].numero; }
    else {
      nouvelle = { numero: tranches.length + 1, dueIso: jourOuvre(decaleLeJour(jour, 30)), amountXof: ecart };
      tranches.push({ ...nouvelle });
    }
  } else if (ecart < 0) {
    let r = -ecart;
    if (iProchaine >= 0) {
      const pris = Math.min(r, etats[iProchaine].resteXof);
      tranches[iProchaine].amountXof -= pris;
      r -= pris;
      porteeSur = tranches[iProchaine].numero;
    }
    /* CE QUI DÉPASSE LA PROCHAINE NE SE RÉPARTIT PAS SUR LES SUIVANTES : le
       total descend au nouveau prix, et le versé au-delà est un avoir. */
    for (let i = tranches.length - 1; i >= 0 && r > 0; i -= 1) {
      const pris = Math.min(r, tranches[i].amountXof);
      tranches[i].amountXof -= pris;
      r -= pris;
    }
  }
  const echeances = tranches.filter((t) => t.amountXof > 0).map((t, i) => ({ ...t, numero: i + 1 }));
  const total = echeances.reduce((s, t) => s + t.amountXof, 0);
  return {
    ...socle, ok: true, echeances,
    ...(porteeSur !== undefined ? { porteeSur } : {}),
    ...(nouvelle ? { nouvelle: { ...nouvelle, numero: echeances.length } } : {}),
    avoirXof: Math.max(0, regle - total),
  };
}
