/* ══ LES MESSAGES DE L'ABONNÉE — 8 novembre 2026 (lot 4 de l'abonnement refait) ══
   Maquette `public/maquette-l-abonnement-refait.html`, section « Les messages
   qu'elle reçoit » : « Deux messages par séance, tous deux liés à son
   rendez-vous. Le jour même, rien n'arrive sur son téléphone : tout se passe
   au fauteuil. Ils passent par la salle d'attente des envois. » « Construis
   le reste des lots de l'abonnement refait » (Yéman, 8 novembre 2026).
   L'idée, dans ses mots : « une petite surprise à chaque fois », et « un
   message qui vient ce jour-là parce qu'ils nous font confiance ».

   DEUX MESSAGES, PAS UN DE PLUS :
     · LA VEILLE : le rappel J-1 qui existe (`rappels-j1`) gagne UNE phrase
       quand la séance du lendemain est une séance de formule et qu'un panier
       d'attention VALIDÉ l'attend : « Bonjour {prénom}, votre rendez-vous est
       prévu demain à {heure} à la Maison MND. Une attention vous y attend. »
       C'est un modèle Meta NEUF (`rappel_rdv_attention`), posé par le secret
       WA_TEMPLATE_RAPPEL_ATTENTION. Tant qu'il n'est pas posé, le rappel
       d'hier part mot pour mot, sans bruit (la règle de WA_TEMPLATE_REPRISE).
     · APRÈS LA SÉANCE : quand une séance de formule est marquée faite,
       « Merci, {prénom}. Votre prochaine séance : {jour} à {heure} ? » avec
       deux boutons, « Oui, je réserve » et « Une autre date ». La date est
       son jour favori et son heure d'habitude, dans la vie du contrat, sur
       une lune réglée, jamais avant l'ouverture, jamais un dimanche, sur une
       place libre. « Oui » pose la séance couverte par la formule, sous le
       verrou du serveur ; « Une autre date » passe la main à la conversation,
       sans rien poser. Un rendez-vous suivant déjà posé : pas de message.
   À SON ARRIVÉE : AUCUN MESSAGE (tranché le 6 novembre 2026). Aucune relance
   « venez découvrir votre surprise » : la maquette l'exclut.
   TOUT PASSE PAR LA SALLE D'ATTENTE (shared/salle-des-envois) : la veille est
   déposée par `rappels-j1`, le message d'après par le Trône (le même geste
   que `merci-en-salle.ts`), clé d'unicité `prochaine-seance-<rdvId>`. Jamais
   un envoi direct.

   TROIS BLOCS RECOPIÉS dans les fonctions Edge (elles ne lisent rien du
   dépôt) : ⟨veille-attention⟩ dans `rappels-j1`, ⟨prochaine-seance⟩ dans
   `whatsapp-webhook`, ⟨deja-un-suivant⟩ dans `whatsapp-webhook` et
   `envois-partent` (11 novembre 2026 : la suite posée pendant les dix
   minutes de salle tait le message au départ, et un « Oui » ne pose jamais
   une seconde séance). `node scripts/terminer-copie-serveur.mjs` les
   réécrit, la règle R8 des douze lunes et `verifie-les-messages-de-la-seance`
   les comparent caractère pour caractère. Entre les repères : ni `import`
   ni `export` ; les noms s'exportent juste après.

   Pur : ni magasin, ni réseau, ni horloge (l'instant entre par la porte). */

import { EN_ATTENTE, heureDeDepart, momentDuMessage, type ReglesDeLaSalle } from './salle-des-envois';

/* ⟨veille-attention⟩ */
/** Le modèle Meta de la veille avec l'attention. Son nom est FIXE ; le secret
    WA_TEMPLATE_RAPPEL_ATTENTION de `rappels-j1` le pose, et rien ne part tant
    qu'il n'est pas posé. */
const MODELE_RAPPEL_ATTENTION = 'rappel_rdv_attention';
/** Le genre de la ligne d'envoi, pour « Ce qui va partir » et le journal. */
const GENRE_VEILLE_ATTENTION = 'veille-attention';

type RdvDeLaVeille = { id: string; clientId?: string; date?: string; status?: string; coveredBySub?: boolean; coverKind?: string; sansConfirmation?: boolean };
/** Un panier d'attention tel que la table `attention_paniers` le porte (son
    identifiant est celui du rendez-vous ; `apptId` le redit). */
type PanierDeLaVeille = { id?: unknown; apptId?: unknown; clientId?: unknown; date?: unknown; etat?: unknown; remiseLe?: unknown };

/** LES RENDEZ-VOUS QU'UNE ATTENTION ATTEND. Une séance de formule (couverte,
    pas par un forfait), non annulée, dont le panier est VALIDÉ et pas encore
    remis, à sa tête et à sa date. C'est ce que `ceQuElleLit`
    (attentions-pur) montre à l'abonnée comme « scellée » ou « à venir » : un
    panier seulement proposé, remis, ou d'une séance annulée ne compte pas.
    UN RENDEZ-VOUS POSÉ SANS CONFIRMATION (`sansConfirmation`) garde le rappel
    d'hier, mot pour mot : ce lot ne change rien à ce qu'il reçoit (garde
    demandée le 11 novembre 2026). */
function attentionsAttendues(rdvs: readonly RdvDeLaVeille[], paniers: readonly PanierDeLaVeille[]): Set<string> {
  const out = new Set<string>();
  for (const a of rdvs) {
    if (!a || !a.id || a.status === 'annulé' || a.coveredBySub !== true || a.coverKind === 'forfait' || a.sansConfirmation === true) continue;
    const p = paniers.find((x) => !!x && String(x.apptId ?? x.id ?? '') === a.id);
    if (!p || p.etat !== 'valide' || p.remiseLe) continue;
    if (a.clientId && p.clientId && String(p.clientId) !== a.clientId) continue;
    if (a.date && p.date && String(p.date) !== a.date) continue;
    out.add(a.id);
  }
  return out;
}

/** La phrase de la veille avec l'attention : les mots du modèle approuvé,
    variables posées. « à la Maison MND », jamais un montant. */
const phraseDeLaVeilleAvecAttention = (appel: string, heure: string): string =>
  `Bonjour ${appel}, votre rendez-vous est prévu demain à ${heure} à la Maison MND. Une attention vous y attend.`;
/** Le rappel d'hier, mot pour mot (le texte que `rappels-j1` écrit au fil). */
const phraseDeLaVeille = (appel: string, heure: string): string => `${appel}, votre rendez-vous est demain à ${heure}.`;

type RappelChoisi = {
  modele: string; texteAuFil: string; composants: unknown[]; attention: boolean; genre?: string;
  repli?: { modele: string; composants: unknown[]; texteAuFil: string };
};

/** LE RAPPEL DE LA VEILLE, CHOISI : la phrase de l'attention seulement si le
    modèle est posé ET que chaque tête que le message nomme a son attention
    (le rappel d'un foyer nomme plusieurs têtes) ; sinon le rappel d'hier,
    exactement tel qu'il est. Les deux portent les mêmes deux variables.
    AVEC L'ATTENTION, LE RAPPEL D'HIER VOYAGE EN REPLI : si Meta refuse le
    modèle neuf (pas approuvé, en pause), le facteur le fait partir à sa
    place dans la même minute (la règle du 3 novembre 2026). */
function rappelDeLaVeille(o: {
  modeleDuRappel: string; modeleAttention: string; appel: string; heure: string;
  tetes: readonly string[]; attendues: ReadonlySet<string>;
}): RappelChoisi {
  const corps = (): unknown[] => [{ type: 'body', parameters: [{ type: 'text', text: o.appel }, { type: 'text', text: o.heure }] }];
  const avecAttention = !!o.modeleAttention && o.tetes.length > 0 && o.tetes.every((id) => o.attendues.has(id));
  if (!avecAttention) return { modele: o.modeleDuRappel, texteAuFil: phraseDeLaVeille(o.appel, o.heure), composants: corps(), attention: false };
  return {
    modele: o.modeleAttention, texteAuFil: phraseDeLaVeilleAvecAttention(o.appel, o.heure), composants: corps(), attention: true, genre: GENRE_VEILLE_ATTENTION,
    repli: { modele: o.modeleDuRappel, composants: corps(), texteAuFil: phraseDeLaVeille(o.appel, o.heure) },
  };
}
/* ⟨/veille-attention⟩ */
export { MODELE_RAPPEL_ATTENTION, GENRE_VEILLE_ATTENTION, attentionsAttendues, phraseDeLaVeilleAvecAttention, phraseDeLaVeille, rappelDeLaVeille };
export type { RdvDeLaVeille, PanierDeLaVeille, RappelChoisi };

/* ⟨prochaine-seance⟩ */
/** Le modèle Meta du message d'après la séance (deux boutons). Son nom est
    FIXE : le Trône le dépose quand la direction l'a noté « approuvé » dans le
    registre des modèles (shared/modeles-meta). */
const MODELE_PROCHAINE_SEANCE = 'prochaine_seance';
/** Le `type` et le `genre` de la ligne d'envoi déposée en salle. */
const TYPE_APRES_SEANCE = 'apres-seance';
const GENRE_APRES_SEANCE = 'apres-seance';
const BOUTONS_DE_LA_PROCHAINE_SEANCE = ['Oui, je réserve', 'Une autre date'] as const;
type GesteDeLaProchaineSeance = 'oui' | 'autre';

/** LA CLÉ D'UNICITÉ : une ligne par séance honorée, pour toujours. */
const idDeLaProchaineSeance = (rdvId: string): string => `prochaine-seance-${rdvId}`;
/** Ce que chaque bouton rapporte au webhook : la séance honorée qu'il suit. */
const chargeDuBoutonDeLaProchaineSeance = (rdvId: string, geste: GesteDeLaProchaineSeance): string =>
  `PROCHAINE_${geste === 'oui' ? 'OK' : 'AUTRE'}:${rdvId}`;
/** Le bouton touché, relu ; `null` si ce n'est pas un bouton de la prochaine séance. */
function lisLeBoutonDeLaProchaineSeance(id: unknown): { rdvId: string; geste: GesteDeLaProchaineSeance } | null {
  const m = /^PROCHAINE_(OK|AUTRE):([A-Za-z0-9_-]{1,80})$/.exec(String(id ?? ''));
  return m ? { rdvId: m[2], geste: m[1] === 'OK' ? 'oui' : 'autre' } : null;
}

/** Les mots du modèle, variables posées : {{1}} l'appel, {{2}} le moment
    (« samedi 23 janvier 2027 à 9 h », l'année toujours). */
const texteDeLaProchaineSeance = (appel: string, moment: string): string => `Merci, ${appel}. Votre prochaine séance : ${moment} ?`;
/** Ce que le fil du Trône garde : le texte et ses deux boutons, entre crochets. */
const texteAuFilDeLaProchaineSeance = (appel: string, moment: string): string =>
  `${texteDeLaProchaineSeance(appel, moment)} [${BOUTONS_DE_LA_PROCHAINE_SEANCE[0]}] [${BOUTONS_DE_LA_PROCHAINE_SEANCE[1]}]`;
/** Les composants du modèle : le corps, puis les deux réponses rapides. */
const composantsDeLaProchaineSeance = (appel: string, moment: string, rdvId: string): unknown[] => [
  { type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: moment }] },
  { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: chargeDuBoutonDeLaProchaineSeance(rdvId, 'oui') }] },
  { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: chargeDuBoutonDeLaProchaineSeance(rdvId, 'autre') }] },
];

/** CE QUE « OUI » POSE : la place proposée, gardée sur la ligne d'envoi (le
    bouton ne porte que la séance ; la ligne porte le reste). */
type PropositionDeSeance = { subId: string; serviceId: string; date: string; time: string; clientId: string };
/** La proposition relue sans confiance : chaque champ présent et bien formé, sinon rien. */
function propositionLisible(x: unknown): PropositionDeSeance | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const subId = texte(p.subId); const serviceId = texte(p.serviceId); const date = texte(p.date); const time = texte(p.time); const clientId = texte(p.clientId);
  if (!subId || !serviceId || !clientId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return { subId, serviceId, date, time, clientId };
}

/** « Oui, je réserve » : LA confirmation, dite dans la conversation (comme
    l'automate) ; la ligne `conf-<rdv>-whatsapp`, posée avec la séance, tait
    le modèle de confirmation-rdv, qui ne reprend la main que si cette phrase
    ne part pas. Un rendez-vous se dit « confirmé pour le … ». */
const reponseAuOui = (appel: string, moment: string): string =>
  `C’est noté, ${appel} : votre séance est confirmée pour le ${moment} à la Maison MND.`;
/** « Oui » quand un rendez-vous suivant a été posé depuis le message (le
    comptoir, Ma Couronne) : rien ne se pose une seconde fois. */
const reponseDejaReservee = (appel: string, moment: string): string =>
  `C’est déjà fait, ${appel} : votre prochaine séance est confirmée pour le ${moment} à la Maison MND.`;
/** « Une autre date » : la main passe à la conversation, rien n'est posé. */
const reponseALAutreDate = (appel: string): string =>
  `Bien sûr, ${appel}. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.`;
/** « Oui » sur une place que le serveur ne peut plus poser (prise entre-temps,
    formule qui ne porte plus) : la main passe, comme pour une autre date. */
const reponseALaPlacePrise = (appel: string): string =>
  `Cette place vient d’être prise, ${appel}. Dites-nous ici le jour qui vous va : la Maison MND vous propose une heure.`;
/* ⟨/prochaine-seance⟩ */
export {
  MODELE_PROCHAINE_SEANCE, TYPE_APRES_SEANCE, GENRE_APRES_SEANCE, BOUTONS_DE_LA_PROCHAINE_SEANCE,
  idDeLaProchaineSeance, chargeDuBoutonDeLaProchaineSeance, lisLeBoutonDeLaProchaineSeance,
  texteDeLaProchaineSeance, texteAuFilDeLaProchaineSeance, composantsDeLaProchaineSeance, propositionLisible,
  reponseAuOui, reponseDejaReservee, reponseALAutreDate, reponseALaPlacePrise,
};
export type { GesteDeLaProchaineSeance, PropositionDeSeance };

/* ⟨deja-un-suivant⟩ */
/** Un rendez-vous de la tête, pour savoir si un suivant est déjà posé. */
type RdvDeLaTete = { id: string; clientId: string; date: string; time?: string; status: string };
/** LE RENDEZ-VOUS SUIVANT, S'IL EST DÉJÀ POSÉ : le plus proche rendez-vous
    de la même tête, ni annulé ni honoré, après la séance (le même jour plus
    tard compris). `null` : elle n'a pas encore sa place. Jugé trois fois :
    au dépôt (le Trône), au départ (le facteur : la carte « Son prochain
    rituel » pose souvent la suite pendant les dix minutes de salle), et au
    « Oui » (le webhook : rien ne se pose une seconde fois). */
function leSuivant<R extends RdvDeLaTete>(rdvs: readonly R[], seance: { id: string; clientId: string; date: string; time?: string }): R | null {
  let mieux: R | null = null;
  for (const a of rdvs) {
    if (!a || a.id === seance.id || a.clientId !== seance.clientId || a.status === 'annulé' || a.status === 'honoré') continue;
    const apres = a.date > seance.date || (a.date === seance.date && String(a.time ?? '') > String(seance.time ?? ''));
    if (!apres) continue;
    if (!mieux || a.date < mieux.date || (a.date === mieux.date && String(a.time ?? '') < String(mieux.time ?? ''))) mieux = a;
  }
  return mieux;
}
/** Un rendez-vous suivant existe-t-il déjà ? Alors pas de message : elle a déjà sa place. */
const dejaUnSuivant = (rdvs: readonly RdvDeLaTete[], seance: { id: string; clientId: string; date: string; time?: string }): boolean =>
  leSuivant(rdvs, seance) !== null;
/* ⟨/deja-un-suivant⟩ */
export { leSuivant, dejaUnSuivant };
export type { RdvDeLaTete };

/* ══ CE QUE LE TRÔNE DÉCIDE, AU MOMENT OÙ LA SÉANCE EST MARQUÉE FAITE ═════
   Ces règles vivent au Trône seul (shared/messages-de-l-abonnee.ts les
   branche sur les magasins) : rien n'en est recopié dans une fonction. */

/** Ce que la règle lit de la séance honorée. */
export type SeanceHonoree = {
  id: string; branchId?: string; clientId: string; clientName?: string; date: string; time: string; status: string;
  coveredBySub?: boolean; coverKind?: string; subId?: string; serviceIds: readonly string[]; master?: string; numeroAPrevenir?: string;
};

export type RaisonDuSilence =
  | 'pas-honoree' | 'pas-une-formule' | 'un-forfait' | 'seance-ancienne' | 'sans-numero' | 'stop' | 'deja-un-suivant'
  | 'modele-non-approuve' | 'sans-contrat' | 'sans-prestation' | 'aucune-date';

/** POURQUOI LE MESSAGE NE PART PAS, avant même de chercher une date. `null` :
    la séance mérite sa proposition. L'ordre est celui des questions.
    LE MESSAGE VIENT « CE JOUR-LÀ » : une séance marquée faite plus d'un jour
    après sa date (un rattrapage, un nettoyage du carnet) ne propose rien,
    sinon un lot d'honneurs ferait partir un message par vieille séance. */
export function pourquoiPasDeProchaineSeance(o: {
  seance: Pick<SeanceHonoree, 'id' | 'clientId' | 'date' | 'time' | 'status' | 'coveredBySub' | 'coverKind'>;
  rdvs: readonly RdvDeLaTete[];
  numero: string;
  /** La fiche a dit STOP aux messages de la Maison. */
  stop: boolean;
  modeleApprouve: boolean;
  /** Aujourd'hui, à Cotonou (AAAA-MM-JJ). */
  jour: string;
}): RaisonDuSilence | null {
  if (o.seance.status !== 'honoré') return 'pas-honoree';
  if (o.seance.coveredBySub !== true) return 'pas-une-formule';
  if (o.seance.coverKind === 'forfait') return 'un-forfait';
  if (!ISO.test(o.seance.date) || o.seance.date < jourPlus(o.jour, -1)) return 'seance-ancienne';
  if (!o.modeleApprouve) return 'modele-non-approuve';
  if (!o.numero) return 'sans-numero';
  if (o.stop) return 'stop';
  if (dejaUnSuivant(o.rdvs, o.seance)) return 'deja-un-suivant';
  return null;
}

/* ── Les jours, sans fuseau : midi UTC, comme le relevé de l'abonnée ── */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const jourPlus = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 0 = dimanche … 6 = samedi. */
export const jourDeLaSemaine = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
const minutesDe = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Sans rythme à elle : quatre semaines ; jamais moins de deux (le plancher de la Cadence). */
export const RYTHME_PAR_DEFAUT_JOURS = 28;
export const PLANCHER_DU_RYTHME_JOURS = 14;

/** LE RYTHME DE LA PROCHAINE, dans cet ordre : le rythme noté sur sa fiche
    (en semaines), sinon sa cadence observée (ses venues), sinon celui du
    carnet (sa validité partagée entre ses séances), sinon quatre semaines.
    Jamais moins de quatorze jours. */
export function rythmeDeLaProchaine(o: {
  rythmeSemaines?: number | null;
  cadenceJours?: number | null;
  carnet?: { validiteJours?: number | null; seances?: number | null } | null;
}): number {
  const borne = (n: number) => Math.max(PLANCHER_DU_RYTHME_JOURS, Math.round(n));
  if (o.rythmeSemaines && o.rythmeSemaines > 0) return borne(o.rythmeSemaines * 7);
  if (o.cadenceJours && o.cadenceJours > 0) return borne(o.cadenceJours);
  const v = o.carnet?.validiteJours ?? 0; const s = o.carnet?.seances ?? 0;
  if (v > 0 && s > 0) return borne(v / s);
  return RYTHME_PAR_DEFAUT_JOURS;
}

/** La place la plus proche de son heure ; sans heure, la première. */
export function placeLaPlusProche(heures: readonly string[], voulue: string | null | undefined): string | null {
  if (heures.length === 0) return null;
  if (!voulue || !/^\d{1,2}:\d{2}$/.test(voulue)) return heures[0];
  const cible = minutesDe(voulue);
  return [...heures].sort((a, b) => Math.abs(minutesDe(a) - cible) - Math.abs(minutesDe(b) - cible) || minutesDe(a) - minutesDe(b))[0];
}

/** Quatre semaines de recherche après la date que son rythme attend. */
export const HORIZON_DE_LA_PROPOSITION_JOURS = 28;

/** LA PLACE PROPOSÉE : à partir de la date que son rythme attend (jamais
    avant demain), le premier jour qui est l'un de SES jours (tous les jours
    ouverts si elle n'en a pas), jamais un dimanche, pas un jour fermé, dans
    la vie du contrat et sur une lune réglée (`peutPorter`, le juge de
    l'abonnée), avec une place libre ; à son heure d'habitude quand elle est
    libre, sinon la plus proche. Rien en quatre semaines : `null`, et aucun
    message (la Maison lui parle de vive voix). Les places viennent toujours
    de l'ouverture du jour : jamais une heure avant l'ouverture. */
export function placeProposee(o: {
  derniere: string;
  rythmeJours: number;
  demain: string;
  jours: readonly number[];
  heure: string | null;
  estFerme: (iso: string) => boolean;
  peutPorter: (iso: string) => boolean;
  placesLibres: (iso: string) => readonly string[];
  horizonJours?: number;
}): { date: string; time: string } | null {
  if (!ISO.test(o.derniere) || !ISO.test(o.demain)) return null;
  const attendu = jourPlus(o.derniere, Math.max(1, Math.round(o.rythmeJours)));
  const depart = attendu > o.demain ? attendu : o.demain;
  const sesJours = o.jours.filter((j) => Number.isInteger(j) && j >= 1 && j <= 6);
  const horizon = o.horizonJours ?? HORIZON_DE_LA_PROPOSITION_JOURS;
  for (let i = 0; i <= horizon; i += 1) {
    const iso = jourPlus(depart, i);
    const j = jourDeLaSemaine(iso);
    if (j === 0) continue;
    if (sesJours.length > 0 && !sesJours.includes(j)) continue;
    if (o.estFerme(iso)) continue;
    if (!o.peutPorter(iso)) continue;
    const time = placeLaPlusProche(o.placesLibres(iso), o.heure);
    if (!time) continue;
    return { date: iso, time };
  }
  return null;
}

/** LA LIGNE DÉPOSÉE EN SALLE. Elle ne nomme PAS la séance comme rendez-vous
    (`apptId`) : le facteur jugerait « l'heure du rendez-vous est passée » et
    la jetterait, comme le point d'après séance. La séance voyage sous
    `seanceId` (et sa date sous `dateRdv`, pour l'écran), la place proposée
    sous `proposition`, que « Oui » relit, et l'appel du {{1}} sous `appel`,
    que les réponses redisent. Pas de `subId` à la racine : la porte d'Opale
    rangerait alors deux séances d'une même formule sous un seul événement. */
export function ligneDeLaProchaineSeance(o: {
  seance: Pick<SeanceHonoree, 'id' | 'branchId' | 'clientId' | 'date'>;
  prenom: string;
  appel: string;
  numero: string;
  proposition: PropositionDeSeance;
  maintenantMs: number;
  regles: ReglesDeLaSalle;
}): Record<string, unknown> {
  const id = idDeLaProchaineSeance(o.seance.id);
  const quand = new Date(o.maintenantMs).toISOString();
  const depart = heureDeDepart(o.maintenantMs, o.regles);
  const moment = momentDuMessage(o.proposition.date, o.proposition.time);
  return {
    id, branchId: o.seance.branchId, type: TYPE_APRES_SEANCE, genre: GENRE_APRES_SEANCE, canal: 'whatsapp',
    clientId: o.seance.clientId, seanceId: o.seance.id, dateRdv: o.seance.date, prenom: o.prenom, appel: o.appel,
    statut: EN_ATTENTE, quand, deposeLe: quand, partA: new Date(depart.partA).toISOString(), ...(depart.calme ? { calme: true } : {}),
    proposition: { ...o.proposition },
    colis: {
      genre: 'whatsapp', numero: o.numero, modele: MODELE_PROCHAINE_SEANCE, parQui: 'la Maison, automatiquement',
      texteAuFil: texteAuFilDeLaProchaineSeance(o.appel, moment),
      composants: composantsDeLaProchaineSeance(o.appel, moment, o.seance.id),
    },
  };
}

/* ══ CE QUI VA PARTIR : les envois prévus de l'abonnée, sur sept jours ═════
   Pour l'onglet « À venir » des Envois automatiques (une autre main le
   branche) : d'après les rendez-vous à venir, les paniers validés et les
   réglages, la liste de ce qui partira, genre par genre. Pur, sans magasin. */
export type RdvPrevu = RdvDeLaVeille & { id: string; clientId: string; date: string; time?: string; status: string };
export type MessagePrevu = {
  genre: typeof GENRE_VEILLE_ATTENTION | typeof GENRE_APRES_SEANCE;
  /** Le jour où il part (AAAA-MM-JJ) : la veille du rendez-vous, ou le jour de la séance. */
  moment: string;
  apptId: string;
  clientId: string;
  modele: string;
  raison: string;
};
export function messagesPrevusDeLAbonnee(o: {
  rdvs: readonly RdvPrevu[];
  paniers: readonly PanierDeLaVeille[];
  jour: string;
  horizonJours?: number;
  reglages: { modeleAttentionPose: boolean; modeleProchaineSeanceApprouve: boolean };
}): MessagePrevu[] {
  const fin = jourPlus(o.jour, o.horizonJours ?? 7);
  const aVenir = o.rdvs.filter((a) => a.date >= o.jour && a.date <= fin && a.status !== 'annulé' && a.status !== 'honoré'
    && a.coveredBySub === true && a.coverKind !== 'forfait');
  const attendues = attentionsAttendues(aVenir, o.paniers);
  const out: MessagePrevu[] = [];
  for (const a of aVenir) {
    if (o.reglages.modeleAttentionPose && attendues.has(a.id)) {
      out.push({ genre: GENRE_VEILLE_ATTENTION, moment: jourPlus(a.date, -1), apptId: a.id, clientId: a.clientId, modele: MODELE_RAPPEL_ATTENTION, raison: 'séance de formule, panier validé : le rappel de la veille dit l’attention' });
    }
    if (o.reglages.modeleProchaineSeanceApprouve && !dejaUnSuivant(o.rdvs, a)) {
      out.push({ genre: GENRE_APRES_SEANCE, moment: a.date, apptId: a.id, clientId: a.clientId, modele: MODELE_PROCHAINE_SEANCE, raison: 'séance de formule sans rendez-vous suivant : sa prochaine séance lui sera proposée une fois marquée faite' });
    }
  }
  return out.sort((x, y) => x.moment.localeCompare(y.moment) || x.apptId.localeCompare(y.apptId) || x.genre.localeCompare(y.genre));
}

/* ══ LES DEUX FICHES À DÉPOSER CHEZ META ═══════════════════════════════════
   Ce que Yéman recopie dans le gestionnaire WhatsApp (docs/modeles-whatsapp-
   abonnement.md et l'écran de Perle les montrent, avec « Copier »). Le pied
   est la devise de la Maison, telle que `DEVISE_COMPLETE` l'écrit : écrite en
   clair ici parce que ce module reste pur (identite.ts porte des magasins) ;
   le banc verifie-les-messages-de-la-seance la compare à DEVISE_COMPLETE, et
   l'écran du Trône, lui, lit DEVISE_COMPLETE. La direction note l'état de ces
   deux modèles dans « Ce que ça rapporte » › Ses modèles chez Meta › Les
   autres modèles de la Maison (ils y paraissent par AUTOMATISATIONS_REELLES). */
export type FicheDeModele = {
  nom: string; categorie: 'UTILITY'; langue: 'fr'; corps: string; boutons: readonly string[]; pied: string;
  variables: readonly string[]; secret?: string; quand: string;
};
export const PIED_DES_MODELES = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';
export const FICHES_DES_MODELES_DE_L_ABONNEE: readonly FicheDeModele[] = [
  {
    nom: MODELE_RAPPEL_ATTENTION, categorie: 'UTILITY', langue: 'fr',
    corps: 'Bonjour {{1}}, votre rendez-vous est prévu demain à {{2}} à la Maison MND. Une attention vous y attend.',
    boutons: [], pied: PIED_DES_MODELES, variables: ['l’appel (« Mme Awa », ou le prénom seul)', 'l’heure (« 9 h », « 10 h 30 »)'],
    secret: 'WA_TEMPLATE_RAPPEL_ATTENTION',
    quand: 'La veille d’une séance de formule dont le panier d’attention est validé, aux heures du rappel ; sinon le rappel habituel part tel quel.',
  },
  {
    nom: MODELE_PROCHAINE_SEANCE, categorie: 'UTILITY', langue: 'fr',
    corps: 'Merci, {{1}}. Votre prochaine séance : {{2}} ?',
    boutons: [...BOUTONS_DE_LA_PROCHAINE_SEANCE], pied: PIED_DES_MODELES, variables: ['l’appel', 'le moment proposé (« samedi 23 janvier 2027 à 9 h »)'],
    quand: 'Quand une séance de formule est marquée faite au Trône et qu’aucun rendez-vous suivant n’est posé ; déposé en salle d’attente, une fois par séance.',
  },
];
