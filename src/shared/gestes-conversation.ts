import type { Client, Family } from './clients';
import type { Invoice } from './finance';
import type { Appointment } from './agenda';
import type { Bilan } from './bilans';
import type { CodePromo } from './promos';

/* ══ LES GESTES D'UNE CONVERSATION — 14 septembre 2026 ════════════════

   « Comment avoir les boutons de l'automatisation, rappels de RDV, factures,
   itinéraires, codes QR, paiements… Comment aussi joindre des fichiers ? »
   (Yéman). Puis, dans le même souffle : « Rajoute ses devis, ses photos, et
   son bilan à remettre », « rajoute suivi d'abonnement », « rajoute dans les
   raccourcis le bilan du foyer avec les impayés ».

   DIX GESTES, ET AUCUN N'INVENTE RIEN. Tout ce qu'ils envoient existe déjà
   dans la Maison, éparpillé dans dix écrans : le lien de paiement des
   Paramètres, le chemin du salon, une facture, un devis qui attend un oui, un
   bilan pas encore remis, ses photos, ses jetons d'abonnement, le relevé de
   son foyer. Ce fichier ne fabrique aucune donnée — il CHOISIT la bonne pièce
   et écrit la phrase qui l'accompagne.

   RIEN NE PART D'UN SEUL CLIC. Chaque geste COMPOSE un message ; c'est une
   main qui le relit et l'envoie. Un bouton qui expédie directement finit par
   envoyer une facture à la mauvaise tête un soir de rush, et ce soir-là on
   maudit le bouton.

   UN BOUTON ÉTEINT DIT POURQUOI. « Aucun devis en attente », « son bilan de
   samedi est déjà remis », « le relevé part à la payeuse ». Onze boutons dont
   on ne sait lesquels servent sont un mur ; onze boutons dont chacun dit son
   état sont une liste de ce qu'il reste à faire pour elle.

   CE FICHIER EST PUR. Aucune lecture de magasin, aucun `window`, aucune date
   implicite : tout entre par le contexte. C'est ce qui permet au harnais de
   juger les dix gestes sans navigateur, et à Ma Couronne de ne rien importer
   d'ici sans le vouloir. */

/* ── Les formes minimales dont ce module a besoin. On prend des `Pick` plutôt
      que les types entiers : ce module doit pouvoir juger un foyer sans que
      toute la finance descende avec lui. */
export type TeteDuGeste = Pick<Client, 'id' | 'name' | 'familyId' | 'birthday' | 'archived' | 'photo'>;
export type PieceDuGeste = Pick<Invoice, 'id' | 'branchId' | 'kind' | 'number' | 'clientId' | 'date' | 'status' | 'apptId'>
  & { totalXof: number; resteXof: number };

export type CleDuGeste =
  | 'paiement' | 'devis' | 'facture' | 'bilan' | 'photos'
  | 'abonnement' | 'foyer' | 'itineraire' | 'rendezvous' | 'promo';

/** CE QU'UN GESTE PROPOSE DE JOINDRE. Le fichier lui-même ne voyage pas ici :
    seul son identité voyage, et la surface va le chercher au moment d'envoyer.
    Composer un message ne doit pas charger trois PDF pour rien. */
export type PieceAJoindre =
  | { quoi: 'facture'; invoiceId: string; nom: string }
  | { quoi: 'devis'; invoiceId: string; nom: string }
  | { quoi: 'bilan'; bilanId?: string; apptId: string; nom: string }
  | { quoi: 'bilans-du-foyer'; apptIds: string[]; nom: string }
  | { quoi: 'photos'; clientId: string; nom: string };

export type Geste = {
  cle: CleDuGeste;
  /** Le mot du bouton — « Lien de paiement ». */
  mot: string;
  /** Ce qu'il montre à droite quand il sait quelque chose — « 15 000 F ». */
  dit?: string;
  /** LA PASTILLE D'ATTENTE — « à remettre », « 15 000 F dus ». Elle ne dit pas
      ce que le bouton fait : elle dit ce qu'il RESTE à faire. */
  attend?: string;
  /** `null` = disponible. Sinon la phrase qui dit pourquoi il est éteint. */
  eteint: string | null;
  /** Le message déjà rempli, à relire. Absent quand le geste ouvre un panneau
      (la promotion) plutôt qu'il ne compose. */
  compose?: string;
  piece?: PieceAJoindre;
  /** CE QUI DOIT ÊTRE CORRIGÉ AVANT D'ENVOYER. Le geste reste disponible — on
      ne bloque pas le comptoir — mais l'écran montre l'avertissement, et une
      main décide. Un compteur que la cliente conteste est pire qu'un silence. */
  avertit?: string;
};

/* ══ LES DATES, DITES COMME AU COMPTOIR ══════════════════════════════ */

/** LE POINT FINAL, SANS LE DOUBLER. Les comptes de la Maison s'appellent
    « Famille A. », aux initiales : une phrase qui pose son point derrière
    écrirait « Famille A.. », et deux points de suite font amateur sur un
    message qui part à une cliente. */
export const pointFinal = (phrase: string): string =>
  /[.!?…]$/.test(phrase.trimEnd()) ? phrase.trimEnd() : `${phrase.trimEnd()}.`;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « samedi 6 septembre ». Sans l'année : on parle de choses proches, et
    l'année ferait administratif. */
export const jourDit = (iso: string): string => {
  const [a, m, j] = (iso ?? '').split('-').map(Number);
  if (!a || !m || !j) return iso ?? '';
  const d = new Date(a, m - 1, j);
  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]}`;
};

/** « samedi 6 septembre à 10 h 30 ». */
export const jourEtHeureDits = (iso: string, hhmm: string | undefined): string => {
  const j = jourDit(iso);
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? '')) return j;
  const [h, m] = (hhmm as string).split(':');
  return `${j} à ${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
};

/** LE PRÉNOM SEUL, pour s'adresser à elle. « Akouavi Kossou » donne
    « Akouavi ». Un message qui commence par le nom entier sonne comme une
    convocation. */
export const prenomDe = (nom: string | undefined): string =>
  (nom ?? '').trim().split(/\s+/)[0] ?? '';

/* ══ CHOISIR LA BONNE PIÈCE ══════════════════════════════════════════ */

/** SON PROCHAIN RENDEZ-VOUS — le premier à venir qui n'est ni annulé ni déjà
    honoré. On compare date ET heure : un rituel de ce matin n'est pas « à
    venir » à quinze heures, et l'annoncer comme tel est humiliant. */
export const prochainRendezVous = (
  appts: readonly Appointment[], clientId: string, aujourdhui: string, heure = '00:00',
): Appointment | undefined => appts
  .filter((a) => a.clientId === clientId && a.status !== 'annulé' && a.status !== 'honoré'
    && (a.date > aujourdhui || (a.date === aujourdhui && (a.time ?? '23:59') >= heure)))
  .sort((a, b) => (a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date)))[0];

/** SA DERNIÈRE FACTURE — la plus récente, soldée ou non. C'est celle dont on
    parle quand on dit « sa facture », même réglée : elle sert de preuve. */
export const saDerniereFacture = (
  pieces: readonly PieceDuGeste[], clientId: string,
): PieceDuGeste | undefined => pieces
  .filter((p) => p.kind === 'facture' && p.clientId === clientId && p.status !== 'brouillon')
  .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))[0];

/** CE QU'ELLE DOIT, toutes pièces confondues. */
export const sonResteDu = (pieces: readonly PieceDuGeste[], clientId: string): number => pieces
  .filter((p) => p.kind === 'facture' && p.clientId === clientId && p.status !== 'brouillon')
  .reduce((s, p) => s + Math.max(0, p.resteXof), 0);

/** SON DEVIS QUI ATTEND UN OUI — le plus récent devis ni accepté ni payé.

    UN BROUILLON N'ATTEND RIEN : il n'a pas été proposé. L'envoyer reviendrait
    à négocier un prix que personne n'a encore arrêté. */
export const sonDevisEnAttente = (
  pieces: readonly PieceDuGeste[], clientId: string,
): PieceDuGeste | undefined => pieces
  .filter((p) => p.kind === 'devis' && p.clientId === clientId
    && p.status !== 'acceptée' && p.status !== 'payée' && p.status !== 'brouillon')
  .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))[0];

/** LA SÉANCE QUI ATTEND SON BILAN — même juge que le Tableau de bord : un
    rituel HONORÉ des trente derniers jours dont aucun bilan ne porte
    l'identifiant. On rend la plus récente : c'est la parole due la plus
    fraîche, et celle dont elle se souvient. */
export const seanceSansBilan = (
  appts: readonly Appointment[], bilans: readonly Pick<Bilan, 'apptId'>[],
  clientId: string, depuis: string, aujourdhui: string,
): Appointment | undefined => {
  const remis = new Set(bilans.map((b) => b.apptId).filter((x): x is string => !!x));
  return appts
    .filter((a) => a.clientId === clientId && a.status === 'honoré'
      && a.date >= depuis && a.date <= aujourdhui && !remis.has(a.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
};

/** LA DATE D'IL Y A N JOURS, en ISO. */
export const ilYA = (iso: string, jours: number): string => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(a, m - 1, j - jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ══ LE FOYER ════════════════════════════════════════════════════════

   « Rajoute dans les raccourcis le bilan du foyer avec les impayés »
   (Yéman, 14 septembre).

   DEUX RÈGLES, PARCE QUE CE NE SONT PAS DEUX FOIS LA MÊME CHOSE.

   · L'ARGENT DU COMPTE EST À LA PAYEUSE. C'est elle qui règle : une pièce
     adressée au compte lui revient, y compris celle d'une adulte du foyer.
   · LE SOIN D'UNE ADULTE EST À ELLE SEULE. Son bilan part sur son numéro,
     jamais dans le message de sa mère. La Maison a déjà tranché cette
     question, et la base la porte : `est_ma_tete` ne reconnaît au parent que
     les MINEURS de sa famille, et à dix-huit ans l'enfant en sort de
     lui-même — ses données lui appartiennent.

   LE RELEVÉ NE PART QU'À LA PAYEUSE. L'envoyer au numéro d'une fille lui
   mettrait les finances de la maison entre les mains. */

export type LigneDuFoyer = {
  clientId: string;
  nom: string;
  /** Mineure au sens du compte : c'est ce qui décide si son bilan voyage. */
  mineure: boolean;
  /** Ce qu'elle doit, pièces ouvertes confondues. */
  resteXof: number;
  /** Les pièces qui portent cette dette, pour que le total se vérifie. */
  pieces: { number: string; date: string; resteXof: number }[];
  /** Sa séance honorée qui attend son bilan, quand il y en a une. */
  apptSansBilan?: string;
};

export type ReleveDuFoyer = {
  familyId: string;
  nom: string;
  payeuse?: TeteDuGeste;
  lignes: LigneDuFoyer[];
  /** La somme des impayés, avant l'avoir. */
  impayesXof: number;
  /** L'avoir du compte, tel que le registre des crédits le porte. */
  avoirXof: number;
  /** CE QUI EST RÉELLEMENT DÛ — jamais négatif. Un avoir plus grand que la
      dette n'est pas une dette en creux : il reste un avoir. */
  netXof: number;
  /** Ce qui reste d'avoir une fois la dette couverte. */
  avoirRestantXof: number;
  /** LES RITUELS HONORÉS QUE NULLE PIÈCE NE PORTE. Ils n'entrent PAS dans le
      total : un montant qui grandit après coup ne se défend pas. Ils se
      signalent, et le comptoir les facture d'abord. */
  rituelsNonFactures: number;
  /** Les séances du payeur et de ses mineures qui attendent un bilan. */
  apptsDesBilans: string[];
};

export type ContexteDuFoyer = {
  famille: Family;
  clients: readonly TeteDuGeste[];
  pieces: readonly PieceDuGeste[];
  appts: readonly Appointment[];
  bilans: readonly Pick<Bilan, 'apptId'>[];
  avoirXof: number;
  aujourdhui: string;
  /** Combien de jours en arrière on cherche un bilan dû. */
  joursDeBilan?: number;
  estMineure: (c: TeteDuGeste, aujourdhui: string) => boolean;
};

/** LE RELEVÉ D'UN FOYER — l'argent de tous, le soin de ceux qu'elle porte. */
export function releveDuFoyer(ctx: ContexteDuFoyer): ReleveDuFoyer {
  const { famille, clients, pieces, appts, bilans, aujourdhui } = ctx;
  const membres = clients.filter((c) => c.familyId === famille.id && !c.archived);
  const payeuse = membres.find((c) => c.id === famille.payerClientId)
    ?? clients.find((c) => c.id === famille.payerClientId);
  const depuis = ilYA(aujourdhui, ctx.joursDeBilan ?? 30);
  const remis = new Set(bilans.map((b) => b.apptId).filter((x): x is string => !!x));

  const lignes: LigneDuFoyer[] = membres.map((c) => {
    const siennes = pieces.filter((p) => p.kind === 'facture' && p.clientId === c.id
      && p.status !== 'brouillon' && p.resteXof > 0);
    /* LA MINORITÉ NE SE PRÉSUME PAS, et la payeuse n'est jamais « une tête
       qu'elle porte » : elle est elle-même, ce qui suffit. */
    const mineure = c.id !== famille.payerClientId && ctx.estMineure(c, aujourdhui);
    const sien = appts.find((a) => a.clientId === c.id && a.status === 'honoré'
      && a.date >= depuis && a.date <= aujourdhui && !remis.has(a.id));
    return {
      clientId: c.id,
      nom: c.name,
      mineure,
      resteXof: siennes.reduce((s, p) => s + p.resteXof, 0),
      pieces: siennes
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((p) => ({ number: p.number, date: p.date, resteXof: p.resteXof })),
      apptSansBilan: sien?.id,
    };
  });

  const impayesXof = lignes.reduce((s, l) => s + l.resteXof, 0);
  const avoirXof = Math.max(0, Math.round(ctx.avoirXof));
  const netXof = Math.max(0, impayesXof - avoirXof);
  const avoirRestantXof = Math.max(0, avoirXof - impayesXof);

  /* UN RITUEL HONORÉ QUE NULLE PIÈCE NE PORTE.

     LE LIEN SE LIT DANS LES DEUX SENS, comme partout dans la Maison : le
     rituel nomme sa facture (`invoiceId`) et la facture nomme son rituel
     (`apptId`). Ne lire qu'un côté compterait comme « non facturée » une
     séance encaissée par l'autre bout — et le relevé accuserait le comptoir
     d'un retard qui n'existe pas.

     ON NE DEVINE PAS PAR LA DATE. Une séance du samedi facturée le lundi est
     facturée : rapprocher par le jour inventerait des impayés le lundi matin. */
  const factures = new Set(pieces
    .filter((p) => p.kind === 'facture' && p.status !== 'brouillon' && p.apptId)
    .map((p) => p.apptId as string));
  const rituelsNonFactures = appts.filter((a) => a.status === 'honoré'
    && a.date >= depuis && a.date <= aujourdhui
    && membres.some((m) => m.id === a.clientId)
    && !a.invoiceId && !factures.has(a.id)).length;

  /* LES BILANS QUI VOYAGENT : ceux de la payeuse, et ceux des MINEURES
     qu'elle porte. Celui d'une adulte du foyer reste à elle. */
  const apptsDesBilans = lignes
    .filter((l) => l.apptSansBilan && (l.clientId === famille.payerClientId || l.mineure))
    .map((l) => l.apptSansBilan as string);

  return {
    familyId: famille.id,
    nom: famille.name,
    payeuse,
    lignes,
    impayesXof,
    avoirXof,
    netXof,
    avoirRestantXof,
    rituelsNonFactures,
    apptsDesBilans,
  };
}

/* ══ L'ABONNEMENT ════════════════════════════════════════════════════

   Le compteur N'EST PAS RECOMPTÉ ICI. Il arrive tout fait de l'écran
   Abonnements, qui est son seul juge. Deux façons de compter la même chose
   finissent toujours par diverger d'un jeton, un jour, sur une fiche — et
   c'est celle qu'on envoie par WhatsApp qu'on devra défendre. */
export type SuiviDAbonnement = {
  /** Le nom de la formule, tel qu'il se vend. */
  formule: string;
  /** `pack` : un paquet de crédits qui s'épuise et meurt à sa date.
      `cycle` : un abonnement qui se recharge à chaque échéance. */
  mode: 'pack' | 'cycle';
  lignes: { nom: string; reste: number | null; total: number | null }[];
  /** Pack : le dernier jour où les crédits valent. */
  expireLe?: string;
  /** Cycle : la prochaine échéance et son montant. */
  prochaineEcheance?: { date: string; montantXof: number };
  /** Ce qui est en retard, en francs. Il prend le dessus sur le compteur. */
  retardXof: number;
  /** LES RITUELS COUVERTS QUI NE DÉCOMPTENT RIEN — l'anomalie que le suivi
      seul ne montre pas. On ne l'envoie pas, on la signale. */
  couvertsHorsFormule: number;
};

/* ══ CE QUE CHAQUE GESTE ÉCRIT ═══════════════════════════════════════

   LA DEVISE NE SE POSE PAS ICI. Elle signe ce que la Maison écrit SEULE ;
   un message relu et envoyé par une main est celui de cette main. */

export type ContexteDesGestes = {
  branchId: string;
  /** Le nom de la maison, tel qu'il se dit — « la Maison », « L'atelier MND ». */
  maison: string;
  tete?: TeteDuGeste;
  /** La fenêtre de 24 heures est-elle ouverte ? */
  fenetreOuverte: boolean;
  aujourdhui: string;
  heure: string;
  /** L'argent, déjà mis en mots par la devise de la branche. */
  enFrancs: (xof: number) => string;
  /** Le lien de paiement au montant voulu, ou `null` s'il n'est pas réglé. */
  lienDePaiement: (xof: number) => string | null;
  /** Le chemin du salon, tel que les Paramètres le portent. */
  itineraire: string;
  pieces: readonly PieceDuGeste[];
  appts: readonly Appointment[];
  bilans: readonly Pick<Bilan, 'apptId'>[];
  /** Combien de photos la Maison détient d'elle. */
  photos: number;
  abonnement?: SuiviDAbonnement;
  foyer?: ReleveDuFoyer;
  /** Les codes de promotion encore vivants pour cette tête. */
  codesVivants: readonly CodePromo[];
  joursDeBilan?: number;
};

/** LA PHRASE DU SUIVI D'ABONNEMENT — celle du cycle, ou celle du paquet, et
    celle du RETARD qui prend le dessus sur les deux.

    Annoncer « il vous reste 2 soins » à quelqu'un qui doit 35 000 F, c'est
    offrir ce qu'on n'a pas encaissé. */
export function phraseDeLAbonnement(
  s: SuiviDAbonnement, prenom: string, enFrancs: (x: number) => string,
): string {
  if (s.retardXof > 0) {
    return `${prenom}, une échéance de votre formule ${s.formule} reste à régler : ${enFrancs(s.retardXof)}. Vous trouverez le lien pour la solder ci-dessous, et vos compteurs repartent aussitôt.`;
  }
  const restants = s.lignes.filter((l) => l.reste === null || l.reste > 0);
  const epuisees = s.lignes.filter((l) => l.reste === 0);
  const dit = (l: { nom: string; reste: number | null }) =>
    (l.reste === null ? `${l.nom} en illimité` : `${l.reste} ${l.nom}`);

  if (restants.length === 0) {
    return s.mode === 'pack'
      ? `${prenom}, votre ${s.formule} est entièrement consommée. Nous serons heureux de vous en proposer une nouvelle quand vous le souhaiterez.`
      : `${prenom}, vos prestations de ${s.formule} sont toutes prises pour ce cycle. Vos compteurs se rechargent ${s.prochaineEcheance ? `le ${jourDit(s.prochaineEcheance.date)}` : 'à la prochaine échéance'}.`;
  }
  const reste = restants.map(dit).join(' et ');
  const fin = epuisees.length > 0 ? ` ${epuisees.map((l) => l.nom).join(' et ')} : tout est consommé.` : '';
  return s.mode === 'pack'
    ? `${prenom}, il vous reste ${reste} sur votre ${s.formule}${s.expireLe ? `, valables jusqu’au ${jourDit(s.expireLe)}` : ''}.${fin}`
    : `${prenom}, il vous reste ${reste} ce mois-ci sur ${s.formule}. Vos compteurs se rechargent ${s.prochaineEcheance ? `le ${jourDit(s.prochaineEcheance.date)}` : 'à la prochaine échéance'}.${fin}`;
}

/** LA PHRASE DU RELEVÉ DE FOYER — les impayés, l'avoir déduit, le net.

    L'AVOIR SE DÉDUIT AVANT D'ANNONCER QUOI QUE CE SOIT. Réclamer 45 000 F à
    un foyer qui en a déposé 30 000, c'est avoir tort deux fois : sur le
    montant, et sur la mémoire. */
export function phraseDuFoyer(
  r: ReleveDuFoyer, prenom: string, enFrancs: (x: number) => string,
): string {
  const ouvertes = r.lignes.filter((l) => l.resteXof > 0).length;
  if (r.impayesXof <= 0) {
    return r.avoirXof > 0
      ? `${prenom}, le compte ${r.nom} est à jour, et il porte encore un avoir de ${enFrancs(r.avoirXof)}.`
      : `${prenom}, le compte ${r.nom} est entièrement à jour. Merci de votre confiance.`;
  }
  const tete = `${pointFinal(`${prenom}, voici le point sur ${r.nom}`)} ${ouvertes === 1 ? 'Une pièce reste ouverte' : `${ouvertes} pièces restent ouvertes`}, pour ${enFrancs(r.impayesXof)}.`;
  if (r.avoirXof <= 0) return `${tete} Vous trouverez ci-dessous le lien pour régler.`;
  if (r.netXof <= 0) {
    return `${tete} Votre compte porte un avoir de ${enFrancs(r.avoirXof)}, qui les couvre entièrement : il n’y a rien à régler${r.avoirRestantXof > 0 ? `, et il vous reste ${enFrancs(r.avoirRestantXof)} d’avoir` : ''}.`;
  }
  return `${tete} Votre compte porte un avoir de ${enFrancs(r.avoirXof)}, qui s’en déduit : il reste ${enFrancs(r.netXof)}. Vous trouverez ci-dessous le lien pour régler.`;
}

/** LES DIX GESTES, dans l'ordre où ils servent : l'argent d'abord, les
    pièces ensuite, le rendez-vous, et l'attention pour finir. */
export function lesGestes(ctx: ContexteDesGestes): Geste[] {
  const tete = ctx.tete;
  const prenom = prenomDe(tete?.name) || 'Bonjour';
  const sansFiche = 'Ce fil n’est rattaché à aucune fiche.';
  const fermee = 'La fenêtre de 24 heures est fermée : seul un modèle approuvé passe.';
  /* LA FENÊTRE FERME TOUT, sauf l'itinéraire — qui tient en une phrase et
     pourrait un jour voyager dans un modèle. On l'éteint quand même, pour ne
     pas laisser croire qu'un bouton sur dix échappe à la règle de Meta. */
  const barre = (quoi: string | null): string | null =>
    (!ctx.fenetreOuverte ? fermee : quoi);

  const g: Geste[] = [];

  /* ① LE LIEN DE PAIEMENT — au montant qui reste dû, jamais au total. */
  const du = tete ? sonResteDu(ctx.pieces, tete.id) : 0;
  const lien = ctx.lienDePaiement(du);
  g.push({
    cle: 'paiement',
    mot: 'Lien de paiement',
    dit: du > 0 ? ctx.enFrancs(du) : 'montant libre',
    eteint: barre(lien ? null : 'Le lien de paiement n’est pas réglé dans les Paramètres.'),
    compose: lien
      ? (du > 0
        ? `${prenom}, il reste ${ctx.enFrancs(du)} sur votre rituel. Voici le lien pour régler par Mobile Money : ${lien}`
        : `${prenom}, voici le lien pour régler par Mobile Money : ${lien}`)
      : undefined,
  });

  /* ② SON DEVIS — celui qui attend un oui. Le oui arrive par ce fil de toute
        façon ; c'est ici qu'il doit pouvoir être accepté. */
  const devis = tete ? sonDevisEnAttente(ctx.pieces, tete.id) : undefined;
  g.push({
    cle: 'devis',
    mot: 'Son devis',
    dit: devis?.number,
    attend: devis ? 'attend un oui' : undefined,
    eteint: barre(!tete ? sansFiche : (devis ? null : 'Aucun devis n’attend de réponse.')),
    compose: devis
      ? `${prenom}, voici le devis ${devis.number} du ${jourDit(devis.date)}, pour ${ctx.enFrancs(devis.totalXof)}. Dites-nous simplement oui et nous posons le rendez-vous.`
      : undefined,
    piece: devis ? { quoi: 'devis', invoiceId: devis.id, nom: `Devis ${devis.number}` } : undefined,
  });

  /* ③ SA FACTURE — la dernière pièce, avec ce qui reste dû s'il en reste. */
  const facture = tete ? saDerniereFacture(ctx.pieces, tete.id) : undefined;
  g.push({
    cle: 'facture',
    mot: 'Sa facture',
    dit: facture?.number,
    eteint: barre(!tete ? sansFiche : (facture ? null : 'Aucune facture à son nom.')),
    compose: facture
      ? `${prenom}, voici votre facture ${facture.number} du ${jourDit(facture.date)}, pour ${ctx.enFrancs(facture.totalXof)}.${facture.resteXof > 0 ? ` Il reste ${ctx.enFrancs(facture.resteXof)} à régler.` : ' Elle est soldée, merci.'}`
      : undefined,
    piece: facture ? { quoi: 'facture', invoiceId: facture.id, nom: `Facture ${facture.number}` } : undefined,
  });

  /* ④ SON BILAN À REMETTRE — l'envoyer le marque remis, et le compte du
        Tableau de bord baisse d'un, ici, pas dans un autre écran. */
  const seance = tete
    ? seanceSansBilan(ctx.appts, ctx.bilans, tete.id, ilYA(ctx.aujourdhui, ctx.joursDeBilan ?? 30), ctx.aujourdhui)
    : undefined;
  g.push({
    cle: 'bilan',
    mot: 'Son bilan',
    dit: seance ? jourDit(seance.date) : undefined,
    attend: seance ? 'à remettre' : undefined,
    eteint: barre(!tete ? sansFiche : (seance ? null : 'Aucun bilan n’attend d’être remis.')),
    compose: seance
      ? `${prenom}, voici le bilan de votre séance du ${jourDit(seance.date)}. Il dit où en est votre couronne et ce qui l’aidera d’ici la prochaine fois.`
      : undefined,
    piece: seance ? { quoi: 'bilan', apptId: seance.id, nom: `Bilan du ${jourDit(seance.date)}` } : undefined,
  });

  /* ⑤ SES PHOTOS — les siennes, et seulement les siennes. Lui rendre son
        image n'est pas la publier : l'accord de droit à l'image couvre la
        vitrine, les réseaux, Ma Couronne et la simulation, c'est-à-dire la
        montrer à d'AUTRES. Ce cas-là n'en est aucun. */
  g.push({
    cle: 'photos',
    mot: 'Ses photos',
    dit: ctx.photos > 0 ? String(ctx.photos) : undefined,
    eteint: barre(!tete ? sansFiche : (ctx.photos > 0 ? null : 'Aucune photo d’elle dans la Maison.')),
    compose: ctx.photos > 0 ? `${prenom}, voici vos photos.` : undefined,
    piece: tete && ctx.photos > 0 ? { quoi: 'photos', clientId: tete.id, nom: 'Ses photos' } : undefined,
  });

  /* ⑥ SON ABONNEMENT — le même compteur que l'écran Abonnements, mis en
        phrase. Jamais recompté ici. */
  const abo = ctx.abonnement;
  const restants = abo ? abo.lignes.filter((l) => l.reste === null || l.reste > 0)
    .reduce((s, l) => s + (l.reste ?? 0), 0) : 0;
  g.push({
    cle: 'abonnement',
    mot: 'Son abonnement',
    dit: abo ? (abo.retardXof > 0 ? ctx.enFrancs(abo.retardXof) : `${restants} jetons`) : undefined,
    attend: abo && abo.retardXof > 0 ? 'en retard' : undefined,
    eteint: barre(!tete ? sansFiche : (abo ? null : 'Elle n’est pas abonnée.')),
    compose: abo ? phraseDeLAbonnement(abo, prenom, ctx.enFrancs) : undefined,
    /* UN COMPTEUR QU'ELLE CONTESTE EST PIRE QU'AUCUN MESSAGE. */
    avertit: abo && abo.couvertsHorsFormule > 0
      ? `${abo.couvertsHorsFormule} ${abo.couvertsHorsFormule === 1 ? 'rituel couvert ne décompte' : 'rituels couverts ne décomptent'} aucun jeton. Corrigez-les avant d’envoyer ce compteur.`
      : undefined,
  });

  /* ⑦ LE FOYER — les impayés du compte, l'avoir déduit, et les bilans des
        têtes qu'elle porte. Il ne part QU'À LA PAYEUSE. */
  const foyer = ctx.foyer;
  const estLaPayeuse = !!foyer?.payeuse && !!tete && foyer.payeuse.id === tete.id;
  const lienFoyer = foyer ? ctx.lienDePaiement(foyer.netXof) : null;
  g.push({
    cle: 'foyer',
    mot: 'Le foyer',
    dit: foyer ? foyer.nom : undefined,
    attend: foyer && foyer.netXof > 0 ? `${ctx.enFrancs(foyer.netXof)} dus` : undefined,
    eteint: barre(!tete ? sansFiche
      : (!foyer ? 'Elle n’appartient à aucun compte de famille.'
        : (!estLaPayeuse ? 'Le relevé part à la payeuse du compte.' : null))),
    compose: foyer && estLaPayeuse
      ? `${phraseDuFoyer(foyer, prenom, ctx.enFrancs)}${foyer.netXof > 0 && lienFoyer ? ` ${lienFoyer}` : ''}`
      : undefined,
    piece: foyer && estLaPayeuse && foyer.apptsDesBilans.length > 0
      ? { quoi: 'bilans-du-foyer', apptIds: foyer.apptsDesBilans, nom: `Bilans de ${foyer.nom}` }
      : undefined,
    /* UN RITUEL HONORÉ MAIS PAS FACTURÉ N'ENTRE PAS DANS LE TOTAL : un
       montant qui grandit après coup ne se défend pas. */
    avertit: foyer && estLaPayeuse && foyer.rituelsNonFactures > 0
      ? `${foyer.rituelsNonFactures} ${foyer.rituelsNonFactures === 1 ? 'rituel honoré n’est pas encore facturé' : 'rituels honorés ne sont pas encore facturés'} : ils n’entrent pas dans ce total.`
      : undefined,
  });

  /* ⑧ SON PROCHAIN RENDEZ-VOUS. */
  const rdv = tete ? prochainRendezVous(ctx.appts, tete.id, ctx.aujourdhui, ctx.heure) : undefined;
  g.push({
    cle: 'rendezvous',
    mot: 'Son rendez-vous',
    dit: rdv ? jourEtHeureDits(rdv.date, rdv.time) : undefined,
    eteint: barre(!tete ? sansFiche : (rdv ? null : 'Aucun rendez-vous à venir.')),
    compose: rdv
      ? `${prenom}, nous vous attendons ${jourEtHeureDits(rdv.date, rdv.time)}.${rdv.depositXof && !rdv.depositConfirmed ? ` Un acompte de ${ctx.enFrancs(rdv.depositXof)} confirmera votre place.` : ''}`
      : undefined,
  });

  /* ⑨ L'ITINÉRAIRE — le même pour tout le monde. */
  g.push({
    cle: 'itineraire',
    mot: 'Itinéraire',
    eteint: barre(ctx.itineraire.trim() ? null : 'Le chemin du salon n’est pas écrit dans les Paramètres.'),
    compose: ctx.itineraire.trim()
      ? `${prenom}, voici comment nous rejoindre : ${ctx.itineraire.trim()}`
      : undefined,
  });

  /* ⑩ LA PROMOTION — elle OUVRE un panneau, elle ne compose pas. Un avantage
        se décide avant de s'écrire. */
  const vivant = ctx.codesVivants[0];
  g.push({
    cle: 'promo',
    mot: 'Promo flash',
    dit: vivant ? vivant.code : undefined,
    attend: vivant ? 'déjà envoyé' : undefined,
    eteint: barre(!tete ? 'Un code appartient à une tête : rattachez d’abord ce fil à une fiche.' : null),
  });

  return g;
}

/** LE GESTE VOULU, par sa clé. Les surfaces ne fouillent pas le tableau. */
export const gesteDit = (gestes: readonly Geste[], cle: CleDuGeste): Geste | undefined =>
  gestes.find((g) => g.cle === cle);
