/* ══ GÉRARD, LE CERVEAU — 26 octobre 2026 ════════════════════════════════
   « Toutes les clientes connaissent Gérard, mon assistant : on donnera son
   nom à l'assistant », puis « une interaction continue et active entre nous
   et la cliente, de sa séance à sa date de cadence », « qu'elle n'ait pas le
   temps de nous oublier en six ou huit semaines » (Yéman). Maquette
   4bPVFik1ABh3TRFZ5XbHiG, choix du sélecteur :
     · autonomie : seul après deux semaines d'essai, puis le soir même
       « je n'attendrai pas deux semaines : on commence immédiatement » ;
     · le fil : UNE ENVIE PAR MOIS entre deux séances ; pendant LA SAISON DES
       FÊTES (1er novembre au 24 décembre), une envie toutes les TROIS
       semaines, les relances toutes les DEUX, Noël dès le 15 novembre ;
     · les relances : quatre semaines au plus par cliente ; une endormie
       trois fois, à six semaines d'écart, puis silence ;
     · le rendez-vous : gardé DEUX JOURS AVANT (la veille reste au rappel) ;
     · les remises : jour creux 15 %, anniversaire 10 %, HUIT par semaine ;
     · la coiffure offerte quand elle ajoute un soin à son resserrage ;
     · Noël : les places des fêtes et la carte cadeau, sans remise.

   CHAQUE MATIN, UNE CHOSE PAR CLIENTE, AU PLUS. `situationDuJour` lit sa
   fiche et dit ce que Gérard lui écrit aujourd'hui, ou rien, dans cet ordre :
   garder un RDV de dans deux jours, son anniversaire, « tout combiner » sept
   jours avant sa date de cadence, une envie du fil, Noël, puis, hors du fil,
   les relances (en retard, une seule venue, endormie). Un jour creux, s'il
   reste des remises, transforme une envie ou une relance en place à −15 %.

   LA DATE DE CADENCE est son rendez-vous posé s'il existe, sinon la date que
   la Cadence attend. Le fil court de sa dernière venue à cette date ; les
   relances ne commencent que dix jours après, si rien n'est posé.

   CE QUE GÉRARD NE FAIT PAS ICI : il n'envoie rien (la salle d'attente des
   envois, lot 2), il ne lit pas les réponses (Claude, lot 3), il ne fabrique
   pas le code (promos.ts, au moment de l'envoi). Il DIT quoi écrire, à qui,
   pourquoi, et avec quel code.

   LA RÈGLE FRANCHE, HORS DES CHOIX : les messages sont signés « Maison MND »,
   Gérard n'annonce rien de lui-même, mais il ne nie jamais être un assistant automatique
   quand une cliente le demande franchement (`estUneQuestionFranche`).

   Pur : `scripts/verifie-gerard.mjs` le prouve. */

/* ── LES RÈGLES CHOISIES ─────────────────────────────────────────────── */
export const ENVIE_TOUS_LES_JOURS = 30;
/** La première envie, au plus tôt, après la séance (le bilan et le point d'après passent avant). */
export const PREMIERE_ENVIE_APRES = 30;
/** Une envie ne part pas si la date de cadence est à moins de tant de jours : « tout combiner » arrive. */
export const ENVIE_AVANT_CADENCE_MIN = 21;
export const COMBINER_AVANT = 7;
export const GARDER_AVANT = 2;
/** Un RDV pris depuis moins de tant de jours n'a pas besoin d'être gardé. */
export const GARDER_SI_POSE_DEPUIS = 7;
export const RELANCE_TOUS_LES_JOURS = 28;
export const RELANCE_APRES_CADENCE = 10;
export const ENDORMIE_DES_JOURS = 150;
export const ENDORMIE_FOIS_MAX = 3;
export const ENDORMIE_ECART = 42;
export const UNE_VENUE_APRES = 60;
/** Deux messages de Gérard à la même cliente : jamais moins de tant de jours, hors « garder ». */
export const ECART_MIN = 14;
export const ENVIE_REFUSEE_ATTEND = 90;
export const CREUX_DE = 3;
export const CREUX_A = 7;
export const REMISE_CREUX_PCT = 15;
export const REMISE_ANNIV_PCT = 10;
export const ANNIV_VALABLE_JOURS = 30;
export const REMISES_PAR_SEMAINE = 8;
export const NOEL_DU = '11-15';
export const NOEL_AU = '12-15';
/** LA SAISON DES FÊTES : « un mois avant les fêtes, un marketing beaucoup plus intense ». */
export const FETES_DU = '11-01';
export const FETES_AU = '12-24';
export const ENVIE_TOUS_LES_JOURS_EN_FETES = 21;
export const RELANCE_TOUS_LES_JOURS_EN_FETES = 14;
export const estSaisonDesFetes = (j: string): boolean => j.slice(5) >= FETES_DU && j.slice(5) <= FETES_AU;
/** L'écart entre deux envies, et la première après la séance, au jour dit. */
export const intervalleDesEnvies = (j: string): number => (estSaisonDesFetes(j) ? ENVIE_TOUS_LES_JOURS_EN_FETES : ENVIE_TOUS_LES_JOURS);
export const intervalleDesRelances = (j: string): number => (estSaisonDesFetes(j) ? RELANCE_TOUS_LES_JOURS_EN_FETES : RELANCE_TOUS_LES_JOURS);
/** La signature des messages : « Maison MND », seule (Yéman, le 26 octobre 2026 au soir : « ne signe pas Gérard »). */
export const SIGNATURE = 'Maison MND';

/* ── LES MODÈLES WHATSAPP ────────────────────────────────────────────────
   Le premier message d'une conversation doit être un modèle approuvé par
   Meta. Chaque situation a le sien ; le plan du Trône remplit le MÊME texte
   que le serveur enverra : ce qu'on lit est ce qui part. {{1}} est toujours
   l'appel (la civilité notée, sinon le prénom). Le corps finit par la
   signature, « Maison MND » ; le pied de page est la devise seule,
   comme pour tous les modèles de la Maison (13 octobre 2026). Jamais le mot
   « code » dans un corps : Meta le range alors en Authentification. */
/* SEPT PLUS UN (maquette v4, 26 octobre 2026, « Tout me va ») : les 14
   modèles deviennent 8. Un seul service, « garder » (UTILITY) ; les autres
   sont MARKETING et ne partent sur WhatsApp qu'avec l'accord des nouvelles :
   déclarer service un modèle marketing expose le numéro de la Maison à un
   blocage par Meta (131050), et tous ses rappels avec lui. Aucun montant de
   remise ni le mot « code » dans un corps : la remise est notée à son nom et
   se propose à la Caisse. Le soin et la date vont en variables. */
export type CleDeModele = 'garder' | 'avant' | 'envie' | 'place' | 'anniversaire' | 'fetes' | 'endormie' | 'nouvelles';
export type ModeleDeGerard = { nom: string; categorie: 'UTILITY' | 'MARKETING'; corps: string; boutons: string[] };
const CORPS: Record<CleDeModele, ModeleDeGerard> = {
  garder: { nom: 'gerard_garder', categorie: 'UTILITY', corps: 'Bonjour {{1}}, votre {{2}} est {{3}}. C’est toujours bon pour vous ?', boutons: ['Oui, je viens', 'Changer l’heure', 'Je ne peux plus'] },
  avant: { nom: 'gerard_avant', categorie: 'MARKETING', corps: 'Bonjour {{1}}, votre prochain {{2}} approche : il est prévu {{3}}. Je vous réserve votre place ? Avec un soin ajouté le même jour, votre coiffure de sortie est offerte.', boutons: ['Oui', 'Avec le soin', 'Pas cette fois'] },
  envie: { nom: 'gerard_envie', categorie: 'MARKETING', corps: 'Bonjour {{1}}, pour prendre soin de vos locks avant votre prochain {{2}}, prévu {{3}}, la Maison vous propose {{4}}. Je vous trouve une place ?', boutons: ['Oui', 'Pas cette fois'] },
  place: { nom: 'gerard_place', categorie: 'MARKETING', corps: 'Bonjour {{1}}, il est temps de votre {{2}} : nous avons de la place {{3}}. Je vous en garde une ?', boutons: ['Oui', 'Une autre date', 'Pas cette fois'] },
  anniversaire: { nom: 'gerard_anniversaire', categorie: 'MARKETING', corps: 'Joyeux anniversaire {{1}} ! Toute la Maison vous souhaite une très belle année. Pour l’occasion, une attention vous attend sur votre prochain soin, jusqu’au {{2}}.', boutons: ['Merci, je réserve', 'Merci'] },
  fetes: { nom: 'gerard_fetes', categorie: 'MARKETING', corps: 'Bonjour {{1}}, les fêtes approchent et les places du 15 au 24 décembre {{2}} partent vite. Je vous en garde une ? Et pour offrir, la carte cadeau de la Maison se commande en deux minutes.', boutons: ['Une place', 'La carte cadeau', 'Pas cette fois'] },
  endormie: { nom: 'gerard_endormie', categorie: 'MARKETING', corps: 'Bonjour {{1}}, cela fait {{2}} mois que nous n’avons pas vu vos locks. Comment vont-elles ? Si l’envie vous prend d’un soin, la Maison a de la place les semaines qui viennent.', boutons: ['Prendre un RDV', 'Pas pour l’instant'] },
  nouvelles: { nom: 'nouvelles_de_la_maison', categorie: 'MARKETING', corps: 'Bonjour {{1}}, des nouvelles de la Maison : {{2}} Répondez simplement à ce message si cela vous tente.', boutons: ['Oui', 'Pas cette fois'] },
};
/** Chaque corps finit par la signature de Gérard, sur sa ligne. */
export const MODELES_DE_GERARD: Record<CleDeModele, ModeleDeGerard> = Object.fromEntries(
  Object.entries(CORPS).map(([cle, m]) => [cle, { ...m, corps: `${m.corps}\n\n${SIGNATURE}` }]),
) as Record<CleDeModele, ModeleDeGerard>;
/** Le corps rempli : {{n}} reçoit la n-ième variable. */
export const remplis = (corps: string, variables: readonly string[]): string =>
  corps.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => variables[Number(n) - 1] ?? '');

/* ── LES RÉGLAGES (le document mnd_gerard, lu par `gerard.ts`) ── */
export type ModeDeGerard = 'eteint' | 'essai' | 'ouvert';
export type ReglagesDeGerard = {
  mode: ModeDeGerard;
  /** Les clientes de l'essai. */
  essai: string[];
  /** Quand l'essai a commencé : deux semaines, puis la question « ouvrir ? ». */
  essaiDepuis?: string;
  /** Le jour du dernier passage (AAAA-MM-JJ) : une fois par jour. */
  dernierPassage?: string;
  /** LE PLAFOND DE LA SEMAINE (maquette v4, choix « francs ») : le nombre de
      remises, tout compris, et les francs qu'elles peuvent coûter. */
  remisesParSemaine: number;
  plafondFrancs: number;
  parQui?: string;
  le?: string;
};
export const ESSAI_MAX = 5;
export const PLAFOND_FRANCS_PAR_DEFAUT = 60_000;
export const REGLAGES_LIVRES: ReglagesDeGerard = { mode: 'eteint', essai: [], remisesParSemaine: REMISES_PAR_SEMAINE, plafondFrancs: PLAFOND_FRANCS_PAR_DEFAUT };
const entierBorne = (x: unknown, defaut: number, max: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(max, Math.round(x)) : defaut;

/** Les réglages lus, quoi que contienne le document. */
export const reglagesLus = (r: Partial<ReglagesDeGerard> | null | undefined): ReglagesDeGerard => ({
  mode: r?.mode === 'essai' || r?.mode === 'ouvert' ? r.mode : 'eteint',
  essai: Array.isArray(r?.essai) ? r!.essai.filter((x) => typeof x === 'string').slice(0, ESSAI_MAX) : [],
  essaiDepuis: typeof r?.essaiDepuis === 'string' ? r.essaiDepuis : undefined,
  dernierPassage: typeof r?.dernierPassage === 'string' ? r.dernierPassage : undefined,
  remisesParSemaine: entierBorne(r?.remisesParSemaine, REMISES_PAR_SEMAINE, 30),
  plafondFrancs: entierBorne(r?.plafondFrancs, PLAFOND_FRANCS_PAR_DEFAUT, 1_000_000),
  parQui: r?.parQui, le: r?.le,
});

/* ── LE PLAFOND DE LA SEMAINE, TOUT COMPRIS ─────────────────────────────
   Toutes les remises à son nom de la semaine (lundi à lundi) comptent, qui
   que soit leur auteur : jour creux, anniversaire, offre flash, remise de
   la direction. Les francs : ce qu'un code honoré a réellement remisé, ce
   qu'un code vivant peut encore remiser (son pourcentage sur le ticket
   moyen), rien pour un code mort sans servir. À l'une des deux bornes,
   plus aucune remise : le gardien retombe sur la situation sans elle. */
export type CodeCompte = { creeLe: string; expireLe: string; utiliseLe?: string; remisePct?: number; remiseXof?: number; remiseReelleXof?: number };
export function plafondDeLaSemaine(o: {
  codes: readonly CodeCompte[]; lundi: string; maintenantIso: string; ticketMoyenXof: number;
  remisesParSemaine: number; plafondFrancs: number;
}): { faites: number; francs: number; restantes: number } {
  const siens = o.codes.filter((c) => c.creeLe.slice(0, 10) >= o.lundi);
  let francs = 0;
  for (const c of siens) {
    if (c.utiliseLe) francs += Math.max(0, c.remiseReelleXof ?? 0);
    else if (c.expireLe > o.maintenantIso) francs += c.remiseXof ?? Math.round(((c.remisePct ?? 0) / 100) * Math.max(0, o.ticketMoyenXof));
  }
  const restantes = francs >= o.plafondFrancs ? 0 : Math.max(0, o.remisesParSemaine - siens.length);
  return { faites: siens.length, francs, restantes };
}


/* ── LES MOTS ────────────────────────────────────────────────────────── */
export type FamilleDeSoin = 'resserrage' | 'couleur' | 'hydratation' | 'lavage' | 'coiffure' | 'autre';

/** La famille d'une prestation, d'après son nom au catalogue. */
export function familleDuNom(nom: string): FamilleDeSoin {
  const n = String(nom ?? '');
  if (/^Droit de service/i.test(n)) return 'autre';
  if (/SÍNSIN|resserrage|reprise/i.test(n)) return 'resserrage';
  if (/YÈKPÈ|couleur|coloration/i.test(n)) return 'couleur';
  if (/DÀNDÀN|hydrat/i.test(n)) return 'hydratation';
  if (/KLƆKLƆ|lavage|shampoing/i.test(n)) return 'lavage';
  if (/coiffure|styling|nattes|vanilles/i.test(n)) return 'coiffure';
  return 'autre';
}

export type EnvieDeGerard = 'hydratation' | 'couleur' | 'lavage' | 'midi-deux' | 'coiffure';
export const ENVIE_DITE: Record<EnvieDeGerard, string> = {
  hydratation: 'Un soin hydratant', couleur: 'Une coloration', lavage: 'Un lavage rituel',
  'midi-deux': 'Une coiffure entre midi et deux', coiffure: 'Une coiffure payante',
};

export type GenreDeMessage = 'garder' | 'anniversaire' | 'combiner' | 'envie' | 'creux' | 'noel' | 'retard' | 'une-venue' | 'endormie';
export const GENRE_DIT: Record<GenreDeMessage, string> = {
  garder: 'Garder son RDV', anniversaire: 'Anniversaire', combiner: 'Tout combiner', envie: 'Une envie du fil',
  creux: 'Jour creux', noel: 'Noël', retard: 'En retard', 'une-venue': 'Une seule venue', endormie: 'Endormie',
};
/** UN SEUL SERVICE, « garder » (maquette v4) : tout le reste sollicite, et
    demande l'accord des nouvelles pour partir sur WhatsApp. */
export const EST_UN_SERVICE: Record<GenreDeMessage, boolean> = {
  garder: true, combiner: false, retard: false, 'une-venue': false,
  anniversaire: false, envie: false, creux: false, noel: false, endormie: false,
};
const PRIORITE: Record<GenreDeMessage, number> = {
  garder: 100, anniversaire: 90, combiner: 80, creux: 70, retard: 60, envie: 50, noel: 45, 'une-venue': 40, endormie: 30,
};

/* ── LES DATES ───────────────────────────────────────────────────────── */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const midi = (j: string) => new Date(`${j}T12:00:00Z`);
export const plusJours = (j: string, n: number): string => { const d = midi(j); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const ecartJours = (a: string, b: string): number => Math.round((midi(b).getTime() - midi(a).getTime()) / 86_400_000);
/** « mardi 3 novembre 2026 » : toujours l'année sur une date de cliente. */
export const jourDit = (j: string): string => {
  const d = midi(j);
  const n = d.getUTCDate();
  return `${JOURS[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** « 10 h », « 12 h 15 ». */
export const heureDite = (h: string): string => { const [hh, mm] = String(h).split(':'); return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`; };
export const placeDite = (p: { iso: string; heure: string }): string => `${jourDit(p.iso)} à ${heureDite(p.heure)}`;
const moisDit = (j: string): string => `${MOIS[Number(j.slice(5, 7)) - 1]} ${j.slice(0, 4)}`;

/* ── CE QUE GÉRARD LIT ───────────────────────────────────────────────── */
export type RdvDeGerard = { id: string; date: string; time: string; status: string; creeLe?: string; familles: FamilleDeSoin[]; venu: boolean };
/** Ce que Gérard a déjà écrit (le journal du lot 2) ; `reponse` : ce qu'elle a fait. */
export type TraceDeGerard = { quand: string; genre: GenreDeMessage; envie?: EnvieDeGerard; reponse?: 'oui' | 'non' };
export type FicheDeGerard = {
  id: string;
  /** Comment on s'adresse à elle (`appelDe`) : la civilité notée, sinon le prénom. */
  appel: string;
  /** Le nom de son soin habituel, en français : « resserrage des racines ». */
  soinDit: string;
  birthday?: string;
  birthdayGiftAt?: string;
  /** Elle a accepté les nouvelles de la Maison. */
  accord: boolean;
  /** Elle a dit « stop ». */
  stop: boolean;
  /** Elle reçoit les notifications de Ma Couronne. */
  couronne: boolean;
  telephone: boolean;
  /** De passage, diaspora, locks défaits, archivée : Gérard ne lui écrit pas. */
  ecartee: boolean;
  /** Les soucis dits ces 60 derniers jours (Entre deux séances). */
  soucis: string[];
  /** UN SOUCI ENCORE OUVERT (Entre deux séances, 26 octobre 2026) : le plus
      grave de ses signalements non traités, Santé puis À voir. Gérard se
      tait alors (`gerardSeTait`, gerard-entre-deux-pur) : ni envie ni remise. */
  souciOuvert?: 'sante' | 'a-voir';
  /* ── LA FICHE ÉLARGIE (maquette v4, lot 1) : ce qui la fait taire. ── */
  /** Ce qu'elle doit encore, en francs : jamais d'envie ni de remise tant qu'un reste est dû. */
  resteDu?: number;
  /** Sa dernière relance de facture (AAAA-MM-JJ) : silence sept jours autour. */
  derniereRelanceLe?: string;
  /** Le dernier message hors service parti vers elle, toutes voix confondues (`dernier-message-pur`). */
  dernierMessageHorsService?: string;
  /** Elle a écrit depuis moins de 48 heures sans réponse : on lui doit une réponse d'abord. */
  attendUneReponse?: boolean;
  /** Enfant d'un foyer : jamais écrite, c'est le parent payeur qui reçoit. */
  enfantDuFoyer?: boolean;
  /** Une carte cadeau vit sur sa fiche : pas de message de Noël. */
  carteVivante?: boolean;
  /** Ses remises à son nom encore valables : pas de seconde remise, jamais de cumul. */
  codesVivants?: number;
  rdvs: RdvDeGerard[];
  traces: TraceDeGerard[];
  /** La Cadence : la date ATTENDUE d'après son rythme (pour une cliente en
      retard, la date manquée, pas le cycle suivant ; null : rien de prédit),
      et son rythme en jours. */
  cadence: { iso: string | null; rythmeJours: number | null };
};
export type JourCreux = { iso: string; poses: number; ordinaire: number; manque: number; remises: number };
export type Place = { iso: string; heure: string };
export type ContexteDeGerard = {
  aujourdhui: string;
  /** Les jours creux de 3 à 7 jours, avec leurs remises ouvertes. */
  creux: readonly JourCreux[];
  /** Les remises qui restent cette semaine (8 moins celles déjà données). */
  remisesRestantes: number;
  /** Deux places libres pour elle (sa durée, son maître), un jour donné ou les 7 prochains. */
  placesDe: (clientId: string, jour?: string) => readonly Place[];
};

export type CodeAFaire = { mot: 'CREUX' | 'ANNIV'; pct: number; jusquau: string; jour?: string };
export type Situation = {
  clientId: string;
  genre: GenreDeMessage;
  envie?: EnvieDeGerard;
  canal: 'whatsapp' | 'couronne';
  modele: CleDeModele;
  variables: string[];
  /** Le corps du modèle, rempli. */
  texte: string;
  pourquoi: [string, string][];
  code?: CodeAFaire;
  priorite: number;
};

/* ── LE FIL ──────────────────────────────────────────────────────────── */
/** Sa dernière venue. */
export const derniereVenue = (f: Pick<FicheDeGerard, 'rdvs'>, aujourdhui: string): string | undefined =>
  f.rdvs.filter((r) => r.venu && r.date <= aujourdhui).reduce<string | undefined>((d, r) => (!d || r.date > d ? r.date : d), undefined);
/** Son prochain RDV posé (aujourd'hui compris), non annulé. */
export const prochainRdv = (f: Pick<FicheDeGerard, 'rdvs'>, aujourdhui: string): RdvDeGerard | undefined =>
  f.rdvs.filter((r) => r.date >= aujourdhui && r.status !== 'annulé' && !r.venu).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
/** LA DATE DE CADENCE : le RDV posé, sinon la date que la Cadence attend. */
export function dateDeCadence(f: FicheDeGerard, aujourdhui: string): { iso: string; posee: boolean } | null {
  const r = prochainRdv(f, aujourdhui);
  if (r) return { iso: r.date, posee: true };
  return f.cadence.iso ? { iso: f.cadence.iso, posee: false } : null;
}

export type PointDuFil = { iso: string; jour: number; quoi: string; existant: boolean };
/** LE FIL D'UNE CLIENTE, de sa dernière venue à sa date de cadence : ce que
    le Trône écrit déjà (bilan, points d'étape) et ce que Gérard ajoute. */
export function filDeLaCliente(f: FicheDeGerard, aujourdhui: string): PointDuFil[] {
  const s = derniereVenue(f, aujourdhui);
  const c = dateDeCadence(f, aujourdhui);
  if (!s || !c || c.iso <= s) return [];
  const duree = ecartJours(s, c.iso);
  const pts: PointDuFil[] = [
    { iso: s, jour: 0, quoi: 'La séance', existant: true },
    { iso: plusJours(s, 1), jour: 1, quoi: 'Le bilan de la séance', existant: true },
    { iso: plusJours(s, 7), jour: 7, quoi: 'Le point d’après', existant: true },
  ];
  for (let j = Math.min(PREMIERE_ENVIE_APRES, intervalleDesEnvies(plusJours(s, ENVIE_TOUS_LES_JOURS_EN_FETES))); duree - j >= ENVIE_AVANT_CADENCE_MIN; j += intervalleDesEnvies(plusJours(s, j))) {
    pts.push({ iso: plusJours(s, j), jour: j, quoi: 'Une envie', existant: false });
  }
  if (duree > COMBINER_AVANT) pts.push({ iso: plusJours(c.iso, -COMBINER_AVANT), jour: duree - COMBINER_AVANT, quoi: c.posee ? 'Le point d’avant' : 'Tout combiner', existant: c.posee });
  if (c.posee) pts.push({ iso: plusJours(c.iso, -GARDER_AVANT), jour: duree - GARDER_AVANT, quoi: 'Garder son RDV', existant: false });
  pts.push({ iso: c.iso, jour: duree, quoi: c.posee ? 'Son rendez-vous' : 'Sa date de cadence', existant: c.posee });
  return pts;
}

/* ── L'ENVIE ─────────────────────────────────────────────────────────── */
const a = (f: FicheDeGerard, fam: FamilleDeSoin) => f.rdvs.filter((r) => r.venu && r.familles.includes(fam)).map((r) => r.date).sort();
/** Elle prend ses RDV en semaine entre 11 h et 14 h : au moins deux de ses quatre dernières venues. */
export const vientAMidi = (f: FicheDeGerard): boolean => {
  const venues = f.rdvs.filter((r) => r.venu).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4);
  return venues.filter((r) => { const s = midi(r.date).getUTCDay(); const h = Number(r.time.slice(0, 2)); return s >= 1 && s <= 5 && h >= 11 && h < 14; }).length >= 2;
};

/** L'ENVIE DU MOIS, d'après sa fiche : ses soucis d'abord, puis ce qu'elle a
    déjà aimé, puis son rythme. Jamais la même deux fois de suite ; une envie
    refusée attend trois mois. */
export function choisisLEnvie(f: FicheDeGerard, aujourdhui: string): EnvieDeGerard | null {
  const envies = f.traces.filter((t) => t.genre === 'envie' && t.envie).sort((x, y) => x.quand.localeCompare(y.quand));
  const derniere = envies[envies.length - 1]?.envie;
  const refusee = (e: EnvieDeGerard) => envies.some((t) => t.envie === e && t.reponse === 'non' && ecartJours(t.quand.slice(0, 10), aujourdhui) < ENVIE_REFUSEE_ATTEND);
  const couleurs = a(f, 'couleur');
  const candidates: EnvieDeGerard[] = [];
  if (f.soucis.some((s) => s === 'seches' || s === 'cassantes')) candidates.push('hydratation');
  if (couleurs.length && ecartJours(couleurs[couleurs.length - 1], aujourdhui) >= 90) candidates.push('couleur');
  if (vientAMidi(f)) candidates.push('midi-deux');
  const m = Number(aujourdhui.slice(5, 7));
  if (m === 11 || m === 12 || a(f, 'coiffure').length) candidates.push('coiffure');
  if ((f.cadence.rythmeJours ?? 0) >= 42) candidates.push('lavage');
  candidates.push('hydratation', 'lavage');
  return candidates.find((e) => e !== derniere && !refusee(e)) ?? null;
}

/* ── LES JOURS CREUX ─────────────────────────────────────────────────── */
/** UN JOUR EST CREUX quand, de 3 à 7 jours avant, ses RDV posés sont sous
    l'ordinaire de ce jour de la semaine (le chiffre des Prévisions). Gérard
    ouvre autant de remises qu'il manque de RDV, dans la limite de la semaine. */
export function joursCreux(o: {
  aujourdhui: string;
  parJour: ReadonlyMap<string, number>;
  ordinaireDe: (j: string) => number;
  ouvertLe: (j: string) => boolean;
  remisesRestantes: number;
}): JourCreux[] {
  let reste = Math.max(0, o.remisesRestantes);
  const out: JourCreux[] = [];
  for (let k = CREUX_DE; k <= CREUX_A; k++) {
    const j = plusJours(o.aujourdhui, k);
    if (!o.ouvertLe(j)) continue;
    const poses = o.parJour.get(j) ?? 0;
    const ordinaire = o.ordinaireDe(j);
    const manque = Math.max(0, ordinaire - poses);
    if (manque === 0) continue;
    const remises = Math.min(manque, reste);
    reste -= remises;
    out.push({ iso: j, poses, ordinaire, manque, remises });
  }
  return out;
}

/* ── LE TEXTE ────────────────────────────────────────────────────────── */
/** « mardi 3 novembre 2026 à 10 h ou jeudi 5 novembre 2026 à 14 h » ; sans place, « cette semaine ». */
export const deuxPlacesDites = (p: readonly Place[]): string =>
  p.length >= 2 ? `${placeDite(p[0])} ou ${placeDite(p[1])}` : p.length === 1 ? placeDite(p[0]) : 'cette semaine';

/** CE QUE LA MAISON PROPOSE, selon l'envie : le {{4}} du modèle gerard_envie. */
export function propositionDeLEnvie(e: EnvieDeGerard, f: FicheDeGerard, aujourdhui: string): string {
  switch (e) {
    case 'hydratation':
      return f.soucis.some((x) => x === 'seches' || x === 'cassantes') ? 'un soin hydratant de 45 minutes, pour vos cheveux secs' : 'un soin hydratant de 45 minutes';
    case 'couleur': {
      const cs = a(f, 'couleur');
      return `une retouche de votre couleur végétale de ${moisDit(cs[cs.length - 1] ?? aujourdhui)}`;
    }
    case 'lavage': return 'un lavage rituel (shampoing)';
    case 'midi-deux': return 'une coiffure express entre midi et deux, pendant votre pause';
    case 'coiffure': return 'une coiffure pour vos occasions';
  }
}

/** L'ENVIE EN MODÈLE : gerard_envie et ses variables. */
export function modeleDeLEnvie(e: EnvieDeGerard, f: FicheDeGerard, c: { iso: string; posee: boolean } | null, aujourdhui: string): { modele: CleDeModele; variables: string[] } {
  const prevu = !c ? 'bientôt' : c.posee ? `le ${jourDit(c.iso)}` : `vers le ${jourDit(c.iso)}`;
  return { modele: 'envie', variables: [f.appel, f.soinDit, prevu, propositionDeLEnvie(e, f, aujourdhui)] };
}

/* ── LA SITUATION DU JOUR ────────────────────────────────────────────── */
const traceDe = (f: FicheDeGerard, genres: readonly GenreDeMessage[]) =>
  f.traces.filter((t) => genres.includes(t.genre)).sort((x, y) => x.quand.localeCompare(y.quand));
const derniereTrace = (f: FicheDeGerard, genres: readonly GenreDeMessage[]): string | undefined => {
  const t = traceDe(f, genres);
  return t.length ? t[t.length - 1].quand.slice(0, 10) : undefined;
};
const TOUS_SAUF_GARDER: GenreDeMessage[] = ['anniversaire', 'combiner', 'envie', 'creux', 'noel', 'retard', 'une-venue', 'endormie'];
const RELANCES: GenreDeMessage[] = ['retard', 'une-venue', 'endormie', 'creux'];

/** PAR OÙ LUI ÉCRIRE : Ma Couronne d'abord (gratuite, et elle part seule
    dès aujourd'hui), sinon WhatsApp ; une sollicitation sur WhatsApp
    demande son accord des nouvelles, et un « stop » la fait taire. */
export function canalDe(f: FicheDeGerard, genre: GenreDeMessage): 'whatsapp' | 'couronne' | null {
  if (EST_UN_SERVICE[genre]) return f.couronne ? 'couronne' : f.telephone ? 'whatsapp' : null;
  if (f.stop) return null;
  if (f.couronne) return 'couronne';
  return f.accord && f.telephone ? 'whatsapp' : null;
}

export function situationDuJour(f: FicheDeGerard, ctx: ContexteDeGerard): Situation | null {
  const A = ctx.aujourdhui;
  /* Écartée (de passage, diaspora, locks défaits, archivée) ou enfant d'un
     foyer : jamais écrite. Le parent payeur reçoit pour elle. */
  if (f.ecartee || f.enfantDuFoyer) return null;
  const fait = (genre: GenreDeMessage, modele: CleDeModele, variables: string[], pourquoi: [string, string][], extra: Partial<Situation> = {}): Situation | null => {
    const canal = canalDe(f, genre);
    if (!canal) return null;
    return { clientId: f.id, genre, canal, modele, variables, texte: remplis(MODELES_DE_GERARD[modele].corps, variables), pourquoi, priorite: PRIORITE[genre], ...extra };
  };

  /* ① Garder un RDV de dans deux jours, pris depuis plus d'une semaine. */
  const r = prochainRdv(f, A);
  if (r && ecartJours(A, r.date) === GARDER_AVANT && (!r.creeLe || ecartJours(r.creeLe.slice(0, 10), A) >= GARDER_SI_POSE_DEPUIS)
    && !traceDe(f, ['garder']).some((t) => t.quand.slice(0, 10) >= plusJours(r.date, -GARDER_AVANT - 1))) {
    const s = fait('garder', 'garder', [f.appel, f.soinDit, placeDite({ iso: r.date, heure: r.time })],
      [['Son RDV', placeDite({ iso: r.date, heure: r.time })], ['Pris le', r.creeLe ? jourDit(r.creeLe.slice(0, 10)) : 'avant le 5 sept. 2026']]);
    if (s) return s;
  }

  /* Un souci À voir ou Santé encore ouvert : Gérard se tait. Le RDV
     ci-dessus se garde quand même ; ni anniversaire, ni envie, ni relance
     (`gerardSeTait`, gerard-entre-deux-pur : on ne propose rien à une
     cliente qui attend qu'on la rappelle). Le test reste écrit ici : ce
     fichier n'importe rien, le banc vérifie qu'il dit comme `gerardSeTait`. */
  if (f.souciOuvert) return null;

  /* LES SILENCES DE LA MAQUETTE V4. On lui doit une réponse (elle a écrit
     il y a moins de 48 heures) ; elle doit de l'argent (silence commercial,
     décision commune aux trois architectures) ; une relance de facture est
     partie il y a moins de sept jours. Seul « garder », plus haut, passe. */
  if (f.attendUneReponse) return null;
  if ((f.resteDu ?? 0) > 0) return null;
  if (f.derniereRelanceLe && ecartJours(f.derniereRelanceLe, A) < 7) return null;

  /* QUATORZE JOURS SUR TOUT CE QUI EST PARTI : ses propres messages, et le
     dernier message hors service de n'importe quelle voix de la Maison. */
  const siens = derniereTrace(f, TOUS_SAUF_GARDER);
  const recemment = [siens, f.dernierMessageHorsService].filter((x): x is string => !!x).sort().pop();
  const tropTot = !!recemment && ecartJours(recemment, A) < ECART_MIN;
  const aDejaUneRemise = (f.codesVivants ?? 0) > 0;

  /* ② Son anniversaire, le jour même, une fois l'an. */
  if (f.birthday && f.birthday.slice(5, 10) === A.slice(5, 10) && (f.birthdayGiftAt ?? '').slice(0, 4) !== A.slice(0, 4)
    && !aDejaUneRemise && ctx.remisesRestantes > 0 && !traceDe(f, ['anniversaire']).some((t) => t.quand.slice(0, 4) === A.slice(0, 4))) {
    const jusquau = plusJours(A, ANNIV_VALABLE_JOURS);
    const s = fait('anniversaire', 'anniversaire', [f.appel, jourDit(jusquau)],
      [['Anniversaire', jourDit(A)], ['Remise à son nom', `${REMISE_ANNIV_PCT} %, ${ANNIV_VALABLE_JOURS} jours`]], { code: { mot: 'ANNIV', pct: REMISE_ANNIV_PCT, jusquau } });
    if (s) return s;
  }
  if (tropTot) return null;

  const s0 = derniereVenue(f, A);
  const c = dateDeCadence(f, A);
  const pourquoiDuFil: [string, string][] = [
    ['Dernière venue', s0 ? jourDit(s0) : 'aucune'],
    ['Sa date de cadence', c ? `${jourDit(c.iso)}${c.posee ? ' (RDV posé)' : ' (la Cadence)'}` : 'aucune'],
    ['Son rythme', f.cadence.rythmeJours ? `${Math.round(f.cadence.rythmeJours / 7)} semaines` : 'non mesuré'],
  ];
  const creux = ctx.remisesRestantes > 0 ? ctx.creux.find((j) => j.remises > 0) : undefined;
  const offreCreux = (motif: string): Situation | null => {
    if (!creux || aDejaUneRemise) return null;
    const places = ctx.placesDe(f.id, creux.iso);
    if (places.length === 0) return null;
    const heures = places.slice(0, 2).map((p) => heureDite(p.heure));
    return fait('creux', 'nouvelles', [f.appel, `une place s’est libérée ${jourDit(creux.iso)} à ${heures.join(' ou à ')}, et ce jour-là la Maison vous fait une remise sur votre ${f.soinDit}.`],
      [...pourquoiDuFil, ['Jour creux', `${jourDit(creux.iso)} : ${creux.poses} posés, ordinaire ${creux.ordinaire}`], ['Pourquoi elle', motif]],
      { code: { mot: 'CREUX', pct: REMISE_CREUX_PCT, jusquau: creux.iso, jour: creux.iso } });
  };

  /* Une seule venue : son rythme n'est pas mesuré (la Cadence lui prête
     trente jours). Pas de fil ni de « retard » : le message de la première
     venue, plus bas. */
  const venues = f.rdvs.filter((x) => x.venu).length;

  /* ③ Dans le fil : de sa dernière venue à sa date de cadence. */
  if (s0 && c && A > s0 && A <= c.iso && (c.posee || venues >= 2)) {
    const avantCadence = ecartJours(A, c.iso);
    if (avantCadence === COMBINER_AVANT && !c.posee) {
      return fait('combiner', 'avant', [f.appel, f.soinDit, `vers le ${jourDit(c.iso)}`], pourquoiDuFil);
    }
    /* Le mois de Noël : les places des fêtes, la carte cadeau, sans remise. */
    if (A.slice(5) >= NOEL_DU && A.slice(5) <= NOEL_AU && !traceDe(f, ['noel']).some((t) => t.quand.slice(0, 4) === A.slice(0, 4))
      && !(c.posee && c.iso.slice(5) >= '12-15' && c.iso.slice(5) <= '12-24') && !f.carteVivante) {
      return fait('noel', 'fetes', [f.appel, A.slice(0, 4)], pourquoiDuFil);
    }
    const depuis = ecartJours(s0, A);
    const premiere = Math.min(PREMIERE_ENVIE_APRES, intervalleDesEnvies(A));
    const derniereEnvie = derniereTrace(f, ['envie', 'creux']);
    const dueLe = derniereEnvie && derniereEnvie > s0 ? plusJours(derniereEnvie, intervalleDesEnvies(A)) : plusJours(s0, premiere);
    if (depuis >= premiere && A >= dueLe && avantCadence >= ENVIE_AVANT_CADENCE_MIN) {
      const viaCreux = offreCreux('son envie du mois tombe sur un jour creux');
      if (viaCreux) return viaCreux;
      const e = choisisLEnvie(f, A);
      if (e) { const m = modeleDeLEnvie(e, f, c, A); return fait('envie', m.modele, m.variables, [...pourquoiDuFil, ['L’envie', ENVIE_DITE[e]]], { envie: e }); }
    }
    return null;
  }

  /* ④ Hors du fil : les relances, quatre semaines au plus entre deux. */
  if (prochainRdv(f, A)) return null;
  const derniereRelance = derniereTrace(f, RELANCES);
  if (derniereRelance && ecartJours(derniereRelance, A) < intervalleDesRelances(A)) return null;
  if (!s0) return null;
  const sansVenir = ecartJours(s0, A);
  if (sansVenir >= ENDORMIE_DES_JOURS) {
    const fois = traceDe(f, ['endormie']);
    if (fois.length >= ENDORMIE_FOIS_MAX) return null;
    if (fois.length && ecartJours(fois[fois.length - 1].quand.slice(0, 10), A) < ENDORMIE_ECART) return null;
    const mois = Math.floor(sansVenir / 30);
    return fait('endormie', 'endormie', [f.appel, String(mois)],
      [...pourquoiDuFil, ['Sans venue depuis', `${mois} mois`], ['Relances d’endormie', `${fois.length} sur ${ENDORMIE_FOIS_MAX}`]]);
  }
  if (venues >= 2 && c && !c.posee && ecartJours(c.iso, A) >= RELANCE_APRES_CADENCE) {
    const viaCreux = offreCreux(`en retard de ${ecartJours(c.iso, A)} jours`);
    if (viaCreux) return viaCreux;
    const places = ctx.placesDe(f.id);
    return fait('retard', 'place', [f.appel, f.soinDit, deuxPlacesDites(places)],
      [...pourquoiDuFil, ['Date attendue', jourDit(c.iso)], ['Retard', `${ecartJours(c.iso, A)} jours`]]);
  }
  if (venues === 1 && sansVenir >= UNE_VENUE_APRES) {
    const places = ctx.placesDe(f.id);
    /* Venue une fois pour autre chose (sa création, un soin) : son premier resserrage. */
    const dejaResserree = f.rdvs.some((x) => x.venu && x.familles.includes('resserrage'));
    return fait('une-venue', 'place', [f.appel, dejaResserree ? f.soinDit : 'premier resserrage des racines', deuxPlacesDites(places)],
      [...pourquoiDuFil, ['Ses venues', '1'], ['Première venue', jourDit(s0)]]);
  }
  return null;
}

/** LE PLAN DU JOUR : une situation par cliente au plus, les plus pressées
    d'abord ; les jours creux s'épuisent dans l'ordre, sans dépasser leurs
    remises ni celles de la semaine. */
export function planDuJour(fiches: readonly FicheDeGerard[], ctx: ContexteDeGerard): Situation[] {
  const restant = new Map(ctx.creux.map((j) => [j.iso, j.remises]));
  let semaine = ctx.remisesRestantes;
  const out: Situation[] = [];
  const brutes = fiches.map((f) => ({ f, s: situationDuJour(f, ctx) })).filter((x): x is { f: FicheDeGerard; s: Situation } => !!x.s)
    .sort((x, y) => y.s.priorite - x.s.priorite);
  for (const { f, s } of brutes) {
    if (!s.code) { out.push(s); continue; }
    /* L'anniversaire passe avant les jours creux (sa priorité est plus haute) ; tous deux comptent. */
    const jour = s.code.jour;
    const n = jour ? restant.get(jour) ?? 0 : 1;
    if (n > 0 && semaine > 0) { if (jour) restant.set(jour, n - 1); semaine -= 1; out.push(s); continue; }
    /* Le plafond est atteint : elle reçoit ce qu'elle aurait reçu sans remise. */
    const sans = situationDuJour(f, { ...ctx, creux: [], remisesRestantes: 0 });
    if (sans) out.push(sans);
  }
  return out;
}

/* ── LA RÈGLE FRANCHE ────────────────────────────────────────────────── */
/** Une cliente qui demande franchement si elle parle à une personne. */
export const estUneQuestionFranche = (texte: string): boolean =>
  /\b(robot|chatbot|bot|ia|intelligence artificielle|machine)\b|\b(message|réponse|reponse)s? automatiques?\b|\bje parle (à|a) qui\b|\bc.est (bien |vraiment )?g[ée]rard\b|\bune vraie personne\b|\bun (être )?humain\b/i.test(String(texte ?? ''));
export const REPONSE_FRANCHE = 'Je suis l’assistant automatique de la Maison pour les rendez-vous. Si vous préférez, je préviens Gérard ou quelqu’un de l’équipe, qui vous écrit dans la journée.';

/* ══ LE PASSAGE DU JOUR — 26 octobre 2026, le soir ═══════════════════════
   « On commence immédiatement » (Yéman), et au sélecteur : « Ma Couronne +
   bouton WhatsApp » en attendant que Meta approuve les modèles. Une fois par
   jour, quand la direction ouvre le Trône entre 8 h et 20 h, Gérard dépose
   dans la salle d'attente des envois une NOTIFICATION Ma Couronne pour
   chaque ligne du plan qui passe par là ; le facteur (envois-partent) la
   porte à son heure, jamais entre 20 h et 8 h. Une ligne WhatsApp attend un
   toucher : « Envoyer sur WhatsApp » ouvre le message déjà écrit et la note
   « envoyé à la main ». Chaque envoi est une ligne `envois` de type
   « gerard » : c'est le journal, et ce que Gérard relit pour espacer. */
export type ReglagesDuPassage = { mode: ModeDeGerard; essai: readonly string[]; dernierPassage?: string };
export const HEURE_DU_PASSAGE_DE = 8;
export const HEURE_DU_PASSAGE_A = 20;
/** Le passage est-il dû : allumé, pas encore fait aujourd'hui, dans les heures. */
export const passageDu = (r: ReglagesDuPassage, aujourdhui: string, heureCotonou: number): boolean =>
  r.mode !== 'eteint' && r.dernierPassage !== aujourdhui && heureCotonou >= HEURE_DU_PASSAGE_DE && heureCotonou < HEURE_DU_PASSAGE_A;
/** PAUSE / ACTIF (maquette v4) : le champ `mode` garde ses valeurs, « eteint »
    veut dire Pause, tout le reste (« ouvert », et l'ancien « essai ») Actif. */
export const estActif = (r: Pick<ReglagesDuPassage, 'mode'>): boolean => r.mode !== 'eteint';
export const servie = (r: ReglagesDuPassage, _clientId: string): boolean => estActif(r);

export const idDeLaLigne = (aujourdhui: string, clientId: string, canal: 'push' | 'wa-main'): string => `gerard-${aujourdhui}-${clientId}-${canal}`;
/** Le texte sans sa dernière ligne de signature : la notification porte déjà « Maison MND » en titre. */
export const texteSansSignature = (texte: string): string => texte.replace(new RegExp(`\\n\\n${SIGNATURE}$`), '');

export type LigneDeGerard = {
  id: string; branchId: string; type: 'gerard'; canal: 'push' | 'wa-main'; statut: 'en-attente' | 'à-la-main';
  clientId: string; prenom: string; apptId: string; dateRdv: string; heure?: string;
  partA?: string; calme?: boolean; deposeLe: string; quand: string;
  genre: GenreDeMessage; envie?: EnvieDeGerard; modele: CleDeModele; texte: string; codePromo?: string;
  colis?: { genre: 'push'; clientId: string; titre: string; corps: string; url: string };
};
type OutilsDeLaLigne = {
  branchId: string; aujourdhui: string; maintenantIso: string; prenom: string;
  /** Le RDV que « garder » protège : le facteur le relit, et le périme s'il a bougé. */
  rdv?: { id: string; date: string; time: string };
  codePromo?: string;
};
const communs = (s: Situation, o: OutilsDeLaLigne) => ({
  branchId: o.branchId, type: 'gerard' as const, clientId: s.clientId, prenom: o.prenom,
  apptId: s.genre === 'garder' && o.rdv ? o.rdv.id : '', dateRdv: s.genre === 'garder' && o.rdv ? o.rdv.date : '',
  ...(s.genre === 'garder' && o.rdv ? { heure: o.rdv.time } : {}),
  deposeLe: o.maintenantIso, quand: o.maintenantIso, genre: s.genre, ...(s.envie ? { envie: s.envie } : {}), modele: s.modele, texte: s.texte,
  ...(o.codePromo ? { codePromo: o.codePromo } : {}),
});
/** LA NOTIFICATION DÉPOSÉE EN SALLE, au compte où elle est abonnée. */
export function ligneDeNotification(s: Situation, o: OutilsDeLaLigne & { compte: string; partA: string; calme: boolean }): LigneDeGerard {
  return {
    id: idDeLaLigne(o.aujourdhui, s.clientId, 'push'), canal: 'push', statut: 'en-attente', partA: o.partA, calme: o.calme, ...communs(s, o),
    colis: { genre: 'push', clientId: o.compte, titre: SIGNATURE, corps: texteSansSignature(s.texte), url: '/couronne/' },
  };
}
/** LE MESSAGE ENVOYÉ À LA MAIN sur WhatsApp, noté au journal. */
export const ligneALaMain = (s: Situation, o: OutilsDeLaLigne): LigneDeGerard =>
  ({ id: idDeLaLigne(o.aujourdhui, s.clientId, 'wa-main'), canal: 'wa-main', statut: 'à-la-main', ...communs(s, o) });

/** CE QUE GÉRARD A DÉJÀ ÉCRIT, relu dans les envois : ce qu'une main a
    écarté, ce que le facteur a périmé ou n'a pas pu porter ne compte pas. */
export function tracesDesEnvois(envois: readonly { type?: string; clientId?: string; statut?: string; quand?: string; deposeLe?: string; genre?: string; envie?: string }[]): Map<string, TraceDeGerard[]> {
  const m = new Map<string, TraceDeGerard[]>();
  for (const e of envois) {
    if (e.type !== 'gerard' || !e.clientId || !e.genre) continue;
    if (e.statut === 'écarté' || e.statut === 'périmé' || e.statut === 'échec') continue;
    const t: TraceDeGerard = { quand: e.deposeLe ?? e.quand ?? '', genre: e.genre as GenreDeMessage, ...(e.envie ? { envie: e.envie as EnvieDeGerard } : {}) };
    const l = m.get(e.clientId);
    if (l) l.push(t); else m.set(e.clientId, [t]);
  }
  return m;
}
