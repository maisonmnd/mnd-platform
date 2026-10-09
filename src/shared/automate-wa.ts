/* ══ LA MAISON RÉPOND ET RÉSERVE SUR WHATSAPP · 9 octobre 2026 ═════════════
   « Quand une cliente écrit, la Maison lui répond seule, lui propose de vraies
   places libres du calendrier et pose le rendez-vous dans le Trône, sans
   qu'elle quitte WhatsApp » (maquette « Réserver sur WhatsApp », validée le
   9 octobre 2026, façon B : une conversation à boutons et à listes).

   LES DÉCISIONS DE LA DIRECTION, 9 octobre 2026 :
     · l'automate pose un rendez-vous CONFIRMÉ, comme le site ;
     · il prend la parole quand la cliente parle de rendez-vous, et au premier
       message d'un numéro inconnu. « Merci pour hier » ne déclenche rien ;
     · la nuit, il répond et réserve à toute heure : elle a écrit, elle attend ;
     · il lit les boutons, les listes et quelques mots (les jours, demain,
       matin, après-midi, annuler). Pas de modèle de langue. Au deuxième écart,
       la main passe à l'équipe ;
     · un interrupteur à trois positions (éteint, essai, ouvert). Livré en
       ESSAI avec une liste VIDE : personne n'est servi tant que la direction
       n'a pas saisi ses numéros.

   LES RÈGLES DE LA MAISON QU'IL TIENT :
     · « Madame Naffi » (appelDe) dans chaque message, et une fiche qui ne dit
       rien est une dame ;
     · jamais de prix, jamais le nom d'un maître (la Maison attribue), toute
       date dite avec son année ;
     · une création, une restauration, un devis ou une prestation marquée
       « consultation avant » ne se réserve jamais : il propose la
       consultation ;
     · il n'annule JAMAIS rien : une annulation ou un report se transmet ;
     · la devise signe la confirmation, et elle seule.

   LA RELECTURE DU MÊME JOUR (verifie-l-automate-wa, R20 à R30) :
     · le numéro ne dit pas toujours qui écrit : une fiche trouvée par son
       second numéro, une mineure, deux adultes sur un même numéro passent
       par « Pour qui ? », et rien de personne n'est dit avant le choix ;
       en essai, seule la fiche dont c'est le premier numéro est servie ;
     · il se tait quand elle parle d'un rendez-vous qu'elle a déjà, quand sa
       fiche en porte un à venir, quand la Maison lui a écrit dans la
       semaine, et devant une question qui n'est pas de réserver (en plein
       parcours, la main passe, dite) ;
     · « pas samedi » écarte samedi ; les mêmes mots deux fois sont un écart ;
     · la civilité et le prénom écrits se lisent ; « Je confirme » passe le
       plafond ; février n'est pas un prix.

   CE FICHIER EST PUR : ni magasin, ni réseau, ni horloge. Tout ce qu'il sait
   lui vient de la porte : l'état du fil, les messages du tour, et ce que la
   fonction vient de lire en base (les fiches du numéro, le réglage, l'agenda,
   dont les places libres calculées sur l'instantané du tour).

   LE BLOC ENTRE LES REPÈRES ⟨automate-wa⟩ SE RECOPIE TEL QUEL dans la
   fonction Edge `whatsapp-automate` (une fonction Edge ne lit rien du dépôt).
   Il n'a donc ni `import` ni `export` dedans : il s'appuie, PAR LEUR NOM, sur
   `appelDe` (la copie compacte des fonctions Edge) et sur les blocs
   ⟨agenda-pur⟩, ⟨catalogue-pur⟩, ⟨qualification⟩ et ⟨prochaines-places⟩.
   Ses propres noms ne doivent croiser aucun des leurs (d'où les suffixes
   « Wa » de ses petites aides). Le harnais confrontera les deux copies,
   caractère pour caractère. */

import { appelDe } from './civilite';
import { dureeDesPrestations, ouvertureDuJour, type ExceptionDHoraire, type HeureDeLaSemaine } from './agenda-pur';
import { estUneConsultation, priceModeOf, type PriceMode } from './catalogue-pur';
import { exigeConsultation, type Besoin } from './qualification';
import { prochainesPlaces } from './reservation-express';

/* ⟨automate-wa⟩ */
/* ── 1. LE RÉGLAGE : éteint, essai, ouvert ─────────────────────────────
   Il vit dans `mnd_auto_config.automateWa`. ABSENT, il vaut REGLAGE_LIVRE :
   essai, liste vide, personne n'est servi. La base le remet en forme à
   chaque écriture (0125, `reglage_automate_net`) et le garde à la direction. */
type ModeDeLAutomate = 'eteint' | 'essai' | 'ouvert';
type ReglageDeLAutomate = {
  mode: ModeDeLAutomate;
  /** Les numéros servis en essai, réduits (chiffres, au format de Meta). */
  numerosEssai: string[];
  /** Jusqu'où vont les places proposées : de 7 à 30 jours, 14 par défaut. */
  horizonJours: number;
  /** La main de l'équipe tient le fil tant d'heures : de 1 à 72, 24 par défaut. */
  pauseHeures: number;
};
const REGLAGE_LIVRE: ReglageDeLAutomate = { mode: 'essai', numerosEssai: [], horizonJours: 14, pauseHeures: 24 };

const bornerWa = (v: unknown, min: number, max: number, defaut: number): number => {
  if (v === null || v === undefined || v === '') return defaut;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

function reglageDeLAutomate(brut: unknown): ReglageDeLAutomate {
  if (!brut || typeof brut !== 'object') return { ...REGLAGE_LIVRE, numerosEssai: [] };
  const r = brut as Record<string, unknown>;
  const mode: ModeDeLAutomate = r.mode === 'eteint' || r.mode === 'ouvert' || r.mode === 'essai' ? r.mode : 'essai';
  const bruts = Array.isArray(r.numerosEssai) ? r.numerosEssai : [];
  const numerosEssai = [...new Set(bruts.map((x) => String(x ?? '').replace(/\D/g, '')).filter((x) => x.length >= 8))].slice(0, 20);
  return {
    mode,
    numerosEssai,
    horizonJours: bornerWa(r.horizonJours, 7, 30, 14),
    pauseHeures: bornerWa(r.pauseHeures, 1, 72, 24),
  };
}

type TiroirDuNumero = 'clientes' | 'equipe' | 'prestataires';

/** QUI EST SERVI. Éteint : personne. Essai : les numéros listés seulement,
    même rangés dans Équipe (la direction y est). Ouvert : le tiroir Clientes,
    et toujours les numéros listés. Les prestataires, jamais. */
function numeroServi(reglage: ReglageDeLAutomate, numero: string, tiroir: TiroirDuNumero | undefined): boolean {
  const n = String(numero ?? '').replace(/\D/g, '');
  if (!n || tiroir === 'prestataires' || reglage.mode === 'eteint') return false;
  if (reglage.numerosEssai.includes(n)) return true;
  return reglage.mode === 'ouvert' && (tiroir ?? 'clientes') === 'clientes';
}

/* ── 2. L'ÉTAT DU FIL ───────────────────────────────────────────────────
   Deux lignes par numéro dans `fils_automate`, pour que personne n'écrase
   l'autre : `fil-<numero>` (écrite par le serveur seul, `avance_le_fil`) et
   `main-<numero>` (la main de l'équipe, écrite par le Trône ou par
   `pause_le_fil`). */
type EtapeDuFil =
  | 'repos' | 'qui' | 'besoin' | 'meme' | 'rituel' | 'places' | 'jours'
  | 'civilite' | 'prenom' | 'recap' | 'confirme' | 'main' | 'clos';

type MotifDeLaMain =
  | 'demande' | 'ecarts' | 'prix' | 'media' | 'jour-meme' | 'autre-soin' | 'autre-personne'
  | 'sans-place' | 'plafond' | 'erreur' | 'envoi-refuse' | 'annulation' | 'question';

type CiviliteDuFil = 'madame' | 'mademoiselle' | 'monsieur';

type PlaceLibre = { iso: string; heure: string };

type PanierDuFil = {
  /** La fiche pour qui l'on réserve. Absente : une inconnue. */
  clientId?: string;
  /** Le prénom de la personne pour qui l'on réserve, quand ce n'est pas
      celle qui écrit (maman et enfant sur un même numéro). */
  pourQui?: string;
  besoin?: Besoin;
  serviceIds?: string[];
  /** Un jour de la semaine (« samedi ») ou une date (AAAA-MM-JJ, « demain »). */
  jourVoulu?: string;
  /** Le jour qu'elle écarte (« pas samedi », « samedi je ne peux pas ») :
      ses places ne sont plus proposées, tant qu'il en reste d'autres. */
  jourEvite?: string;
  moment?: 'matin' | 'apres-midi';
  /** Le jour touché dans « Un autre jour ». */
  jourChoisi?: string;
  /** Les rituels ou consultations proposés, dans l'ordre de la liste. */
  rituels?: string[][];
  /** Les places proposées, pour mémoire. */
  places?: PlaceLibre[];
  date?: string;
  time?: string;
  dureeMin?: number;
  civilite?: CiviliteDuFil;
  prenom?: string;
};

type EtatDuFil = {
  numero: string;
  /** Monte de un à chaque écriture : `avance_le_fil` n'écrit que si elle n'a
      pas bougé. Les identifiants des choix la portent. */
  version: number;
  etape: EtapeDuFil;
  /** Quand l'étape a commencé, et à quelle version : un choix d'un message
      plus ancien que l'étape est un vieux toucher. */
  depuis: string;
  versionDeLEtape: number;
  majLe: string;
  /** Quand l'automate a pris la parole (le bandeau « répond seule depuis »). */
  prisLe?: string;
  /** Les cinq derniers messages traités : une seconde livraison n'est jamais neuve. */
  traites: string[];
  dernierEntrantQuand?: string;
  panier: PanierDuFil;
  /** Les textes non compris à l'étape en cours (0, 1 ; au second, la main passe). */
  ecarts: number;
  /** Les instants des messages de l'automate, sur 24 heures glissantes. */
  envois: string[];
  rdvId?: string;
  mainPasseeLe?: string;
  motifMain?: MotifDeLaMain;
  /** L'étape où il en était quand la main est passée : « Rendre à
      l'automate » la reprend. */
  etapeAvantLaMain?: EtapeDuFil;
  versionAvantLaMain?: number;
};

type MainDuFil = {
  numero?: string;
  pauseLe?: string;
  jusqua?: string;
  motif?: string;
  rendueLe?: string;
  par?: string;
};

const MINUTE_WA = 60 * 1000;
const HEURE_WA = 60 * MINUTE_WA;
const JOUR_WA = 24 * HEURE_WA;
/** Dix messages de l'automate au plus par fil et par 24 heures. */
const PLAFOND_DE_L_AUTOMATE = 10;
/** Au deuxième texte non compris, la main passe. */
const ECARTS_AVANT_LA_MAIN = 2;
/** Sept places au plus dans la liste, plus « Un autre jour » et la Maison. */
const PLACES_PROPOSEES = 7;
/** Neuf jours au plus dans « Un autre jour », plus la Maison. */
const JOURS_PROPOSES = 9;
/** Un parcours sans nouvelle depuis 24 heures est abandonné. */
const PARCOURS_PERIME_MS = JOUR_WA;
/** Un message reçu il y a plus de 15 minutes (une relivraison après une
    panne) ne fait plus parler l'automate. */
const TOUR_PERIME_MS = 15 * MINUTE_WA;
/** Le temps d'un tour : un message de moins d'une minute sur un fil tenu
    n'allume pas l'alarme. */
const TOUR_EN_COURS_MS = MINUTE_WA;
/** LA MAISON A ÉCRIT à ce numéro depuis moins d'une semaine, de sa main ou
    par un de ses envois (un rappel, une reprise, une confirmation) : c'est
    elle qui mène cette conversation, et l'automate n'en fait jamais un
    parcours neuf (relecture du 9 octobre 2026). */
const LA_MAISON_A_PARLE_MS = 7 * JOUR_WA;

const ETAPES_EN_COURS: readonly EtapeDuFil[] = ['qui', 'besoin', 'meme', 'rituel', 'places', 'jours', 'civilite', 'prenom', 'recap'];

const ETAPE_DITE: Record<EtapeDuFil, string> = {
  repos: 'au repos',
  qui: 'pour qui',
  besoin: 'le besoin',
  meme: 'la même chose ?',
  rituel: 'le rituel',
  places: "choix de l'heure",
  jours: 'choix du jour',
  civilite: 'la civilité',
  prenom: 'le prénom',
  recap: 'le récapitulatif',
  confirme: 'rendez-vous posé',
  main: 'main passée',
  clos: 'parcours arrêté',
};

const MOTIF_DIT: Record<MotifDeLaMain, string> = {
  demande: 'a demandé la Maison',
  ecarts: 'deux réponses non comprises',
  prix: 'une question de prix',
  media: 'un vocal, une photo ou une pièce',
  'jour-meme': 'pour le jour même',
  'autre-soin': 'un autre soin',
  'autre-personne': 'pour une autre personne',
  'sans-place': 'aucune place libre',
  plafond: 'dix messages en 24 heures',
  erreur: 'la réservation a échoué',
  'envoi-refuse': 'un message refusé par Meta',
  annulation: 'une annulation ou un report',
  question: 'une question à lire',
};

const msWa = (iso: string | undefined | null): number => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : NaN;
};

const isoWa = (ms: number): string => new Date(ms).toISOString();

function etatNeufDuFil(numero: string, maintenant: string): EtatDuFil {
  return {
    numero, version: 0, etape: 'repos', depuis: maintenant, versionDeLEtape: 0, majLe: maintenant,
    traites: [], panier: {}, ecarts: 0, envois: [],
  };
}

/** LA PAUSE DE L'ÉQUIPE : posée, pas encore échue, pas rendue depuis. */
function pauseActive(main: MainDuFil | null | undefined, maintenantMs: number): boolean {
  if (!main) return false;
  const pose = msWa(main.pauseLe);
  const fin = msWa(main.jusqua);
  if (!Number.isFinite(pose) || !Number.isFinite(fin) || fin <= maintenantMs) return false;
  const rendue = msWa(main.rendueLe);
  return !(Number.isFinite(rendue) && rendue >= pose);
}

/** L'ÉTAPE QUI VAUT MAINTENANT. Un parcours sans nouvelle depuis 24 heures
    retombe au repos ; une main passée tient `pauseHeures`, puis retombe au
    repos ; rendue à l'automate, elle reprend l'étape où il en était. */
function etapeCourante(
  etat: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures: number,
): EtapeDuFil {
  if (!etat) return 'repos';
  const maj = msWa(etat.majLe);
  if (etat.etape === 'main') {
    const le = msWa(etat.mainPasseeLe ?? etat.majLe);
    const rendue = msWa(main?.rendueLe);
    if (Number.isFinite(rendue) && Number.isFinite(le) && rendue >= le) {
      const avant = etat.etapeAvantLaMain;
      return avant && ETAPES_EN_COURS.includes(avant) && maintenantMs - rendue < PARCOURS_PERIME_MS ? avant : 'repos';
    }
    return Number.isFinite(le) && maintenantMs - le < pauseHeures * HEURE_WA ? 'main' : 'repos';
  }
  if (ETAPES_EN_COURS.includes(etat.etape)) {
    return Number.isFinite(maj) && maintenantMs - maj < PARCOURS_PERIME_MS ? etat.etape : 'repos';
  }
  if (etat.etape === 'confirme') {
    return Number.isFinite(maj) && maintenantMs - maj < pauseHeures * HEURE_WA ? 'confirme' : 'repos';
  }
  return 'repos';
}

/* ── 3. CE QUE L'ÉCRAN EN DIT ───────────────────────────────────────────
   `tenu` : l'automate mène le fil. `pause` : l'équipe a la main. `main` :
   l'automate a passé la main (pastille rouge, l'alarme sonne). `fini` : un
   rendez-vous posé ou un parcours arrêté, dernier mot traité. */
type TenueDuFil = 'tenu' | 'pause' | 'main' | 'fini' | 'aucun';

type VueDeLAutomate = {
  tenue: TenueDuFil;
  etape?: EtapeDuFil;
  /** Depuis quand l'automate mène ce parcours. */
  depuis?: string;
  motif?: MotifDeLaMain;
  rdvId?: string;
  /** Le panier, pour « Poser ce rendez-vous » pré-rempli. */
  panier?: PanierDuFil;
};

function tenuParLAutomate(
  fil: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures = REGLAGE_LIVRE.pauseHeures,
): TenueDuFil {
  if (pauseActive(main, maintenantMs)) return 'pause';
  if (!fil) return 'aucun';
  const etape = etapeCourante(fil, main, maintenantMs, pauseHeures);
  if (etape === 'main') return 'main';
  if (ETAPES_EN_COURS.includes(etape)) return 'tenu';
  if (etape === 'confirme') return 'fini';
  if (fil.etape === 'clos' && maintenantMs - msWa(fil.majLe) < PARCOURS_PERIME_MS) return 'fini';
  return 'aucun';
}

function vueDeLAutomate(
  fil: EtatDuFil | null | undefined, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures = REGLAGE_LIVRE.pauseHeures,
): VueDeLAutomate {
  const tenue = tenuParLAutomate(fil, main, maintenantMs, pauseHeures);
  if (!fil || tenue === 'aucun') return { tenue };
  return {
    tenue,
    etape: etapeCourante(fil, main, maintenantMs, pauseHeures),
    ...(fil.prisLe ? { depuis: fil.prisLe } : {}),
    ...(fil.motifMain && tenue === 'main' ? { motif: fil.motifMain } : {}),
    ...(fil.rdvId ? { rdvId: fil.rdvId } : {}),
    panier: fil.panier,
  };
}

/** L'AUTOMATE RÉPOND-IL POUR ELLE ? Un fil tenu ou fini dont l'automate a
    traité le dernier message n'attend pas la Maison ; un message de moins
    d'une minute sur un fil tenu non plus (le temps d'un tour). Une main
    passée, une pause, un mot après la confirmation : l'alarme sonne. */
function silenceDeLAlarme(
  tenue: TenueDuFil, fil: EtatDuFil | null | undefined, dernierEntrantQuand: string | undefined, maintenantMs: number,
): boolean {
  if (tenue !== 'tenu' && tenue !== 'fini') return false;
  if (!dernierEntrantQuand) return true;
  const elle = msWa(dernierEntrantQuand);
  const traite = msWa(fil?.dernierEntrantQuand);
  /* RENDUE À L'AUTOMATE APRÈS UNE MAIN PASSÉE (relecture du 9 octobre
     2026) : le mot qu'il a traité EN PASSANT LA MAIN (« Parler à la Maison »,
     une question de prix, une photo) n'a toujours pas eu de réponse. Seul un
     mot d'elle traité par un nouveau tour, ou une personne qui répond, éteint
     l'alarme. */
  if (fil?.etape === 'main' && Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return false;
  if (Number.isFinite(elle) && Number.isFinite(traite) && elle <= traite) return true;
  return tenue === 'tenu' && Number.isFinite(elle) && maintenantMs - elle < TOUR_EN_COURS_MS;
}

/* ── 4. LES MOTS RECONNUS ───────────────────────────────────────────────
   Pas de modèle de langue : les jours, demain, matin, après-midi, annuler,
   aujourd'hui (la main passe) et le prix (la main passe, sans un mot). */
const sansAccentsWa = (t: string): string =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'")
    .toLowerCase().replace(/\s+/g, ' ').trim();

const JOURS_LONGS_WA = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS_WA = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MOIS_LONGS_WA = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS_WA = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** L'instant à Cotonou (UTC+1, sans heure d'été) : le jour, la minute, le
    jour de la semaine. Le serveur tourne en UTC : entre 23 h et minuit UTC,
    c'est déjà le lendemain à Cotonou. */
function instantACotonou(ms: number): { iso: string; min: number; dow: number } {
  const d = new Date(ms + HEURE_WA);
  return { iso: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}

const isoPlusJoursWa = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const dowDeIsoWa = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

type MotsDuTour = {
  /** Aujourd'hui, ce soir, tout de suite : la main passe. */
  jourMeme: boolean;
  jourVoulu?: string;
  /** Le jour qu'elle écarte : « pas samedi », « samedi je ne peux pas ». */
  jourEvite?: string;
  moment?: 'matin' | 'apres-midi';
  annuler: boolean;
  /** Décaler, reporter, déplacer, changer d'heure : jamais fait seul. */
  deplacer: boolean;
  prix: boolean;
  retard: boolean;
  parleDUnRdv: boolean;
};

/** UNE NÉGATION AUTOUR DU MOT (relecture du 9 octobre 2026) : « pas
    samedi », « je ne peux pas venir samedi », « sauf samedi », « samedi
    c'est impossible », « samedi je ne peux pas ». Sans elle, « je ne peux pas
    samedi » se lisait comme une envie de samedi, et la même liste revenait
    sans fin. La phrase s'arrête à la ponctuation : « pas de souci, samedi »
    reste un oui. */
const nieLeMotWa = (t: string, debut: number, fin: number): boolean =>
  /\b(pas|sauf|ni|plutot que|autre que|hors)\s+(?:[^\s.,;!?]+\s+){0,2}$/.test(t.slice(Math.max(0, debut - 40), debut))
  || /^[^.?!,;]{0,30}?\b(impossible|pas possible|peux pas|pourrai pas|pourrais pas|suis pas|serai pas|ne m'?arrange pas|ne me convient pas|ne convient pas|pas dispo)/.test(t.slice(fin));

function motsReconnus(texte: string, maintenantMs: number): MotsDuTour {
  const t = ` ${sansAccentsWa(texte)} `;
  const aujourdhui = instantACotonou(maintenantMs).iso;
  let jourVoulu: string | undefined;
  let jourEvite: string | undefined;
  for (const j of t.matchAll(/apres[- ]?demain|\bdemain\b|\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g)) {
    const v = j[1] ?? isoPlusJoursWa(aujourdhui, /^apres/.test(j[0]) ? 2 : 1);
    const debut = j.index ?? 0;
    if (nieLeMotWa(t, debut, debut + j[0].length)) jourEvite = jourEvite ?? v;
    else jourVoulu = jourVoulu ?? v;
  }
  if (jourEvite && jourEvite === jourVoulu) jourEvite = undefined;
  const ditAujourdhui = /aujourd ?'? ?hui|\bce soir\b|tout de suite|\bce matin\b|\bcet apres[- ]?midi\b|tout a l'heure|\btantot\b/.test(t);
  let moment: 'matin' | 'apres-midi' | undefined;
  let momentEvite: 'matin' | 'apres-midi' | undefined;
  for (const m of t.matchAll(/apres[- ]?midi|\baprem\b|\bsoir(?:ee)?\b|\bmatin(?:ee)?\b/g)) {
    const v = /matin/.test(m[0]) ? 'matin' : 'apres-midi';
    const debut = m.index ?? 0;
    if (nieLeMotWa(t, debut, debut + m[0].length)) momentEvite = momentEvite ?? v;
    else moment = moment ?? v;
  }
  /* « Pas le matin » : l'après-midi, donc. */
  if (!moment && momentEvite) moment = momentEvite === 'matin' ? 'apres-midi' : 'matin';
  return {
    jourMeme: ditAujourdhui && !jourVoulu,
    ...(jourVoulu ? { jourVoulu } : {}),
    ...(jourEvite ? { jourEvite } : {}),
    ...(moment ? { moment } : {}),
    annuler: /\bannul/.test(t),
    deplacer: /\b(decal|report|deplac)/.test(t) || /\bchanger (de |mon |le |la |l'|d')?(rendez|rdv|heure|jour|date|creneau)/.test(t),
    prix: /\b(prix|combien|cout|coute|coutent|couter|tarif|tarifs|fcfa|cfa|montant)\b/.test(t),
    retard: /\bretard\b/.test(t),
    parleDUnRdv: /rendez[- ]?vous|\brdv\b/.test(t),
  };
}

/** UNE INTENTION DE RÉSERVER : prendre rendez-vous, réserver, une place, un
    créneau, « je voudrais passer samedi »… Jamais quand elle parle
    d'annuler, de décaler ou d'un retard : ce n'est pas réserver. */
function intentionDeReserver(texte: string): boolean {
  const t = sansAccentsWa(texte);
  if (!t) return false;
  if (/\b(annul|decal|report|deplac|retard)/.test(t)) return false;
  if (/rendez[- ]?vous|\brdv\b|\breserv|\bune place\b|\bdes places\b|\bcreneau|\bdisponib|\bdispo\b/.test(t)) return true;
  if (/\bje (voudrais|veux|souhaite|souhaiterais|aimerais|peux|pourrais|compte) (passer|venir)\b/.test(t)) return true;
  if (/\best[- ]ce que je (peux|pourrais) (passer|venir)\b/.test(t)) return true;
  if (/\bprendre (un |une )?(rendez|rdv|place|creneau)/.test(t)) return true;
  return /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)\b/.test(t)
    && /\b(passer|venir|libre|possible)\b/.test(t);
}

/** ELLE PARLE D'UN RENDEZ-VOUS QU'ELLE A DÉJÀ (relecture du 9 octobre
    2026) : « je confirme mon rendez-vous de samedi », « j'ai réservé sur le
    site », « merci pour le rendez-vous d'hier », « je suis devant la porte »,
    « à quelle heure est mon rdv ? », « c'est bien noté ? », la réponse à un
    rappel. Le mot « rendez-vous » n'y est pas une envie de réserver : la
    Maison répond elle-même (« Mon rendez-vous » viendra en v2). */
function renvoieAUnRdv(texte: string): boolean {
  const t = sansAccentsWa(texte);
  if (!t) return false;
  return /\b(mon|ma|mes|notre|nos|son|sa|ses|ce|cet|cette|le|du|au) (prochain |dernier |premier )?(rendez[- ]?vous|rdv|reservation|resa)\b/.test(t)
    || /\bj'?ai (deja )?(reserve|pris)\b/.test(t)
    || /\bconfirm/.test(t)
    || /\bhier\b|\bdevant\b|\ben route\b|\bsur place\b|\bje suis (la|arrivee?)\b|\bj'?arrive\b/.test(t)
    || /\ba quelle heure\b|\btoujours\b|\bbien note\b|\bc'?est note\b|\brappel/.test(t);
}

/** UNE QUESTION QUI N'EST PAS DE RÉSERVER (relecture du 9 octobre 2026) :
    « je dois venir les cheveux lavés ? », « vous vendez le sérum ? ». Une
    question sur le jour ou le moment (« vous êtes ouverts samedi ? ») reste
    de la réservation. Celle-là demande une personne : l'automate ne l'avale
    jamais (au repos il se tait, en plein parcours la main passe). */
function uneQuestionAutre(texte: string, maintenantMs: number): boolean {
  const morceaux = String(texte ?? '').split('?');
  for (let i = 0; i < morceaux.length - 1; i += 1) {
    const phrase = morceaux[i].split(/[.!\n]/).pop() ?? '';
    if (!phrase.trim()) continue;
    const m = motsReconnus(phrase, maintenantMs);
    if (!intentionDeReserver(phrase) && !m.jourVoulu && !m.jourEvite && !m.moment && !m.jourMeme) return true;
  }
  return false;
}

/* ── 5. LE TOUR DE LA CLIENTE ───────────────────────────────────────────
   Les messages reçus et pas encore traités, joints : deux messages envoyés
   coup sur coup font UN tour. Un toucher d'un message de l'automate porte
   un identifiant « MND:<version>:<geste>[:<argument>] ». Les boutons des
   autres parcours (la reprise du J-3, le versement) et les formulaires ne
   sont pas à lui : ils n'entrent pas dans le tour. */
type MessageEntrantDuTour = {
  waId?: string;
  quand: string;
  texte?: string;
  type?: string;
  sens?: string;
  canal?: string;
  bouton?: { id?: string; texte?: string } | null;
  formulaire?: unknown;
};

type ChoixDuTour = { id: string; titre: string; waId: string };

type TourDeLaCliente = {
  waIds: string[];
  quand: string;
  texte: string;
  choix?: ChoixDuTour;
  media: boolean;
};

const MEDIAS_WA = ['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts'];

function tourDeLaCliente(messages: readonly MessageEntrantDuTour[], traites: readonly string[] = []): TourDeLaCliente {
  const deja = new Set(traites);
  const quandDe = (m: MessageEntrantDuTour): number => { const q = msWa(m.quand); return Number.isFinite(q) ? q : 0; };
  const neufs = messages
    .filter((m) => (m.sens ?? 'entrant') === 'entrant' && m.canal !== 'site' && !!m.waId && !deja.has(m.waId))
    .filter((m) => !m.formulaire && !(m.bouton?.id && !m.bouton.id.startsWith('MND:')))
    .sort((a, b) => quandDe(a) - quandDe(b));
  let choix: ChoixDuTour | undefined;
  const textes: string[] = [];
  for (const m of neufs) {
    const id = m.bouton?.id;
    if (id) { choix = { id, titre: String(m.bouton?.texte ?? m.texte ?? ''), waId: String(m.waId) }; continue; }
    if (MEDIAS_WA.includes(m.type ?? '')) continue;
    const t = String(m.texte ?? '').trim();
    if (t) textes.push(t);
  }
  return {
    waIds: neufs.map((m) => String(m.waId)),
    quand: neufs.length > 0 ? neufs[neufs.length - 1].quand : '',
    texte: textes.join('\n'),
    ...(choix ? { choix } : {}),
    media: neufs.some((m) => MEDIAS_WA.includes(m.type ?? '')),
  };
}

const idDeChoix = (version: number, geste: string, argument?: string): string =>
  `MND:${version}:${geste}${argument ? `:${argument}` : ''}`;

function lisLeChoix(id: string | undefined): { version: number; geste: string; argument?: string } | null {
  const m = /^MND:(\d+):([a-z-]+)(?::(.+))?$/.exec(id ?? '');
  if (!m) return null;
  return { version: Number(m[1]), geste: m[2], ...(m[3] ? { argument: m[3] } : {}) };
}

/* ── 6. LES DATES, TOUJOURS AVEC L'ANNÉE ──────────────────────────────── */
function heureDite(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const minutes = Number(m[2]);
  return minutes > 0 ? `${Number(m[1])} h ${m[2]}` : `${Number(m[1])} h`;
}

/** « samedi 17 octobre 2026 », « dimanche 1er novembre 2026 ». */
function jourDitAvecAnnee(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const n = d.getUTCDate();
  return `${JOURS_LONGS_WA[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS_LONGS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** LE TITRE D'UNE PLACE, 24 signes au plus (la limite de Meta), l'année
    dedans : « Sam. 17 oct. 2026 · 9 h », sinon « Sam. 17/10/2026 · 9 h 30 »,
    sinon « Sam. 17/10/2026 · 14h30 ». */
function titreDePlace(iso: string, hhmm: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return `${iso} ${hhmm}`.slice(0, 24);
  const j = JOURS_COURTS_WA[d.getUTCDay()];
  const n = d.getUTCDate();
  const a = `${j} ${n === 1 ? '1er' : n} ${MOIS_COURTS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${heureDite(hhmm)}`;
  if (a.length <= 24) return a;
  const date = `${String(n).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const b = `${j} ${date} · ${heureDite(hhmm)}`;
  if (b.length <= 24) return b;
  return `${j} ${date} · ${hhmm.replace(':', 'h')}`;
}

/** « Samedi 17 oct. 2026 » : le titre d'un jour dans « Un autre jour ». */
function titreDuJour(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  const jour = JOURS_LONGS_WA[d.getUTCDay()];
  const n = d.getUTCDate();
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)} ${n === 1 ? '1er' : n} ${MOIS_COURTS_WA[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Hors du Bénin, l'heure se dit « heure de Cotonou ». */
const heureDeCotonouSiBesoin = (numero: string): string =>
  (String(numero ?? '').replace(/\D/g, '').startsWith('229') ? '' : ' (heure de Cotonou)');

/** QUAND LA MAISON RÉPOND ELLE-MÊME : `null` si elle est ouverte en ce
    moment, sinon « demain dès 9 h », « aujourd'hui dès 9 h » ou « lundi 12
    octobre 2026 dès 9 h ». Les heures sont celles de `mnd_settings.hours`,
    exceptions comprises. Sans semaine connue, on la dit ouverte : mieux vaut
    promettre une personne que d'inventer une heure. */
function prochaineOuvertureDite(
  maintenantMs: number, semaine: readonly HeureDeLaSemaine[], exceptions: readonly ExceptionDHoraire[],
): string | null {
  if (semaine.length === 0) return null;
  const ici = instantACotonou(maintenantMs);
  const ce = ouvertureDuJour(ici.iso, semaine, exceptions);
  if (!ce.closed && ici.min >= ce.openMin && ici.min < ce.closeMin) return null;
  for (let i = 0; i <= 14; i += 1) {
    const iso = isoPlusJoursWa(ici.iso, i);
    const f = ouvertureDuJour(iso, semaine, exceptions);
    if (f.closed) continue;
    if (i === 0 && ici.min >= f.openMin) continue;
    const h = heureDite(`${String(Math.floor(f.openMin / 60)).padStart(2, '0')}:${String(f.openMin % 60).padStart(2, '0')}`);
    const quand = i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : jourDitAvecAnnee(iso);
    return `${quand} dès ${h}`;
  }
  return 'dès sa réouverture';
}

/* ── 7. CE QUE L'AUTOMATE ENVOIE ────────────────────────────────────────
   Trois formes, aux limites de Meta : un texte ; trois boutons au plus
   (titre de 20 signes) ; une liste de dix lignes au plus (titre de 24
   signes, description de 72, bouton de 20). Chaque message à choix porte
   « Parler à la Maison », la sortie que Meta exige, et le pied. */
const PIED = 'Réponse automatique · Parler à la Maison à tout moment';
/** La devise de la Maison, telle qu'elle s'écrit (DEVISE_COMPLETE,
    shared/identite) : elle signe la confirmation, et elle seule. */
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

type FormeDuMessage = 'texte' | 'boutons' | 'liste';

type MessageSortant = {
  forme: FormeDuMessage;
  /** L'étape que ce message ouvre ou rappelle : le fil du Trône la dit. */
  etape: EtapeDuFil;
  corps: string;
  pied?: string;
  boutons?: { id: string; titre: string }[];
  bouton?: string;
  lignes?: { id: string; titre: string; description?: string }[];
};

const coupeWa = (t: string, n: number): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
};

const prenomDuNomWa = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/** Les choix du message, tels qu'elle les lit : le fil du Trône les montre. */
function choixDuMessage(m: MessageSortant): string[] {
  if (m.forme === 'boutons') return (m.boutons ?? []).map((b) => b.titre);
  if (m.forme === 'liste') return (m.lignes ?? []).map((l) => l.titre);
  return [];
}

/** LA CHARGE POUR GRAPH, telle que Meta l'attend. */
function chargeGraph(m: MessageSortant, numero: string): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: numero };
  if (m.forme === 'texte') {
    return { ...base, type: 'text', text: { body: m.corps, preview_url: /https?:\/\//.test(m.corps) } };
  }
  const pied = m.pied ? { footer: { text: m.pied } } : {};
  if (m.forme === 'boutons') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button', body: { text: m.corps }, ...pied,
        action: { buttons: (m.boutons ?? []).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titre } })) },
      },
    };
  }
  return {
    ...base,
    type: 'interactive',
    interactive: {
      type: 'list', body: { text: m.corps }, ...pied,
      action: {
        button: m.bouton ?? 'Choisir',
        sections: [{
          rows: (m.lignes ?? []).map((l) => ({ id: l.id, title: l.titre, ...(l.description ? { description: l.description } : {}) })),
        }],
      },
    },
  };
}

/** CE QUE META REFUSERAIT, avant de l'envoyer : une liste vide = conforme. */
function respecteMeta(m: MessageSortant): string[] {
  const fautes: string[] = [];
  const corpsMax = m.forme === 'boutons' ? 1024 : 4096;
  if (!m.corps.trim()) fautes.push('corps vide');
  if (m.corps.length > corpsMax) fautes.push(`corps de ${m.corps.length} signes (${corpsMax} au plus)`);
  if (m.pied && m.pied.length > 60) fautes.push(`pied de ${m.pied.length} signes (60 au plus)`);
  if (m.forme === 'boutons') {
    const b = m.boutons ?? [];
    if (b.length < 1 || b.length > 3) fautes.push(`${b.length} boutons (de 1 à 3)`);
    for (const x of b) {
      if (!x.titre || x.titre.length > 20) fautes.push(`bouton « ${x.titre} » : titre de 1 à 20 signes`);
      if (!x.id || x.id.length > 256) fautes.push(`bouton « ${x.titre} » : identifiant de 1 à 256 signes`);
    }
    if (new Set(b.map((x) => x.titre)).size !== b.length) fautes.push('deux boutons au même titre');
    if (new Set(b.map((x) => x.id)).size !== b.length) fautes.push('deux boutons au même identifiant');
    if (!b.some((x) => lisLeChoix(x.id)?.geste === 'maison')) fautes.push('pas de sortie « Parler à la Maison »');
  }
  if (m.forme === 'liste') {
    const l = m.lignes ?? [];
    if (l.length < 1 || l.length > 10) fautes.push(`${l.length} lignes (de 1 à 10)`);
    if (!m.bouton || m.bouton.length > 20) fautes.push('bouton de la liste : de 1 à 20 signes');
    for (const x of l) {
      if (!x.titre || x.titre.length > 24) fautes.push(`ligne « ${x.titre} » : titre de 1 à 24 signes`);
      if (x.description && x.description.length > 72) fautes.push(`ligne « ${x.titre} » : description de ${x.description.length} signes (72 au plus)`);
      if (!x.id || x.id.length > 200) fautes.push(`ligne « ${x.titre} » : identifiant de 1 à 200 signes`);
    }
    if (new Set(l.map((x) => x.id)).size !== l.length) fautes.push('deux lignes au même identifiant');
    if (!l.some((x) => lisLeChoix(x.id)?.geste === 'maison')) fautes.push('pas de sortie « Parler à la Maison »');
  }
  return fautes;
}

/** CE QUE LA MAISON N'ÉCRIT JAMAIS À UNE CLIENTE : le mot qu'elle a banni
    (la Maison, jamais le « s-a-l-o-n »), le tiret cadratin, un prix. Une
    liste vide = sain. Les deux premiers s'écrivent ici sans leur forme
    littérale, pour qu'une recherche dans les textes du bloc ne trouve que
    les vraies fautes. */
function texteSain(t: string): string[] {
  const fautes: string[] = [];
  const s = String(t ?? '');
  if (/sal(?:on)/i.test(s)) fautes.push('le mot banni (s-a-l-o-n)');
  if (s.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');
  /* L'UNITÉ ENTIÈRE, suivie d'autre chose qu'une lettre (relecture du 9
     octobre 2026) : sans le drapeau u, « \b » passait entre le f et le é, et
     « 5 février 2026 » se lisait comme un prix. */
  if (/\d[\d\s.,]*\s?(fcfa|cfa|xof|francs?|f)(?![\p{L}])/iu.test(s)) fautes.push('un prix');
  return fautes;
}

/* ── 8. LA PORTE DU TOUR ────────────────────────────────────────────────── */
type FicheDuNumero = {
  id: string;
  nom: string;
  civilite?: CiviliteDuFil;
  auMasculin?: boolean;
  branchId?: string;
  familyId?: string;
  naissance?: string;
  /** Trouvée par son premier numéro : c'est elle qui écrit, d'ordinaire. */
  parPhone: boolean;
  /** Trouvée par sa famille, sans numéro à elle (un enfant). */
  parFamille?: boolean;
  numeros?: string[];
  /** Sa dernière venue honorée (fiches_du_numero, 0125). */
  derniereVenue?: { date: string; serviceIds: string[] };
  /** Son prochain rendez-vous, confirmé ou en attente, d'aujourd'hui ou
      plus tard (fiches_du_numero, 0125) : elle en a déjà un, la Maison
      répond elle-même. */
  prochainRdv?: { date: string; time?: string };
};

type PrestationDuTour = {
  id: string;
  name: string;
  categoryId: string;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  consultationAvant?: boolean;
  durationMin?: number;
  /** Ouverte à la réservation en ligne, au jugement du serveur (la règle du
      site : non masquée, et une consultation ou un atelier réservable). */
  reservable: boolean;
};

type AgendaDuTour = {
  branchId: string;
  prestations: readonly PrestationDuTour[];
  categories: { id: string; parentId?: string }[];
  /** Les formules rapides de la Maison (`mnd_vitrine_config.formulesRapides`). */
  formules: readonly { serviceIds: readonly string[] }[];
  /** La consultation de chaque parcours (creation, reparation, enfant). */
  consultationParParcours?: Partial<Record<Besoin, string>>;
  semaine: readonly HeureDeLaSemaine[];
  exceptions: readonly ExceptionDHoraire[];
  /** LES PLACES LIBRES de J+1 à l'horizon pour ces gestes, rangées dans le
      temps, calculées par le serveur sur l'instantané du tour (fauteuils,
      plafonds, murs et maîtres compris). Ni l'écran ni la cliente ne les
      calculent. */
  places: (serviceIds: readonly string[]) => readonly PlaceLibre[];
};

type ContexteLeger = {
  maintenantMs: number;
  /** Le numéro réduit, au format de Meta. */
  numero: string;
  tiroir?: TiroirDuNumero;
  reglage: ReglageDeLAutomate;
  fiches: readonly FicheDuNumero[];
  /** Aucun message de ce numéro avant ce tour. */
  premierMessage: boolean;
  main?: MainDuFil | null;
  /** L'instant du dernier message que la Maison a écrit à ce numéro, de sa
      main ou par un de ses envois (jamais un message de l'automate). */
  derniereParoleDeLaMaison?: string;
};

type ContexteDuTour = ContexteLeger & {
  maison: { nom: string; itineraire?: string };
  agenda?: AgendaDuTour;
};

type ParoleDuTour = 'silence' | 'main-silencieuse' | 'parle';

/** MINEURE, d'après sa date de naissance (AAAA-MM-JJ) : moins de dix-huit
    ans ce jour-là. Sans date lisible, on ne présume rien. */
function mineureWa(naissance: string | undefined, aujourdhuiIso: string): boolean {
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(naissance ?? '');
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(aujourdhuiIso ?? '');
  if (!n || !a) return false;
  const age = Number(a[1]) - Number(n[1]) - (`${a[2]}-${a[3]}` < `${n[2]}-${n[3]}` ? 1 : 0);
  return age < 18;
}

/** LES FICHES QUE L'AUTOMATE PEUT SERVIR (relecture du 9 octobre 2026). En
    ESSAI, seules celles dont ce numéro est le PREMIER (`phone`) : le numéro
    d'essai de la direction, rangé en second numéro d'une proche ou trouvé
    par sa famille, ne doit jamais faire poser un rendez-vous d'essai
    CONFIRMÉ sur la fiche d'une vraie cliente (sa confirmation, son rappel). */
function fichesServies(ctx: Pick<ContexteLeger, 'reglage' | 'fiches'>): readonly FicheDuNumero[] {
  return ctx.reglage.mode === 'essai' ? ctx.fiches.filter((f) => f.parPhone) : ctx.fiches;
}

/** CELLE QUI ÉCRIT, quand on la sait : la seule fiche ADULTE dont ce numéro
    est le premier (relecture du 9 octobre 2026). Trouvée par son second
    numéro (un mari, une sœur), mineure (le numéro de sa maman), ou à
    plusieurs sur le même premier numéro : on ne sait pas qui écrit. On le
    lui demande (« Pour qui ? »), et rien de personne, ni son nom dans le
    salut ni sa dernière venue, n'est dit avant son choix. */
function titulaireDuNumero(fiches: readonly FicheDuNumero[], aujourdhuiIso: string): FicheDuNumero | undefined {
  const adultes = fiches.filter((f) => f.parPhone && !mineureWa(f.naissance, aujourdhuiIso));
  return adultes.length === 1 ? adultes[0] : undefined;
}

/** LA MAISON MÈNE DÉJÀ CETTE CONVERSATION : elle a écrit à ce numéro depuis
    moins d'une semaine (`LA_MAISON_A_PARLE_MS`), et personne ne l'a rendue à
    l'automate depuis. */
function laMaisonAParle(ctx: Pick<ContexteLeger, 'maintenantMs' | 'main' | 'derniereParoleDeLaMaison'>): boolean {
  const le = msWa(ctx.derniereParoleDeLaMaison);
  if (!Number.isFinite(le) || ctx.maintenantMs - le >= LA_MAISON_A_PARLE_MS) return false;
  const rendue = msWa(ctx.main?.rendueLe);
  return !(Number.isFinite(rendue) && rendue >= le);
}

/** LE TOUCHER « JE CONFIRME » DU RÉCAPITULATIF EN COURS (relecture du 9
    octobre 2026) : il pose le rendez-vous même au-delà du plafond. Elle a
    confirmé : elle ne doit jamais rester sans rien. */
function confirmeValide(etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, courante: EtapeDuFil): boolean {
  const ch = lisLeChoix(tour.choix?.id);
  if (!etat || courante !== 'recap' || ch?.geste !== 'oui') return false;
  const depuis = etat.etape === courante ? etat.versionDeLEtape : (etat.versionAvantLaMain ?? etat.versionDeLEtape);
  return ch.version >= (depuis ?? 0) && ch.version <= etat.version;
}

/** QUI PARLE, AVANT DE LIRE L'AGENDA. `silence` : l'automate ne dit rien et
    n'écrit rien, l'équipe répond comme aujourd'hui. `main-silencieuse` : il
    passe la main sans un mot (un prix, un vocal, une photo, le plafond).
    `parle` : il répond. */
function jugeLaParole(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger,
): { parole: ParoleDuTour; motif?: MotifDeLaMain } {
  const ms = ctx.maintenantMs;
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return { parole: 'silence' };
  if (pauseActive(ctx.main, ms)) return { parole: 'silence' };
  if (tour.waIds.length === 0) return { parole: 'silence' };
  const quand = msWa(tour.quand);
  if (Number.isFinite(quand) && ms - quand > TOUR_PERIME_MS) return { parole: 'silence' };
  const courante = etapeCourante(etat, ctx.main, ms, ctx.reglage.pauseHeures);
  if (courante === 'main' || courante === 'confirme') return { parole: 'silence' };
  const mots = motsReconnus(tour.texte, ms);
  const fiches = fichesServies(ctx);
  let parle = false;
  if (ETAPES_EN_COURS.includes(courante)) {
    if (tour.media) return { parole: 'main-silencieuse', motif: 'media' };
    if (mots.prix) return { parole: 'main-silencieuse', motif: 'prix' };
    parle = true;
  } else if (tour.choix && lisLeChoix(tour.choix.id)) {
    parle = true;
  } else if (tour.media || mots.prix || mots.retard) {
    parle = false;
  } else if (laMaisonAParle(ctx)) {
    /* La Maison vient d'écrire (sa main, un rappel, une reprise) : sa
       réponse est pour la Maison, jamais un parcours neuf. */
    parle = false;
  } else if (mots.deplacer || mots.annuler) {
    parle = true;
  } else if (renvoieAUnRdv(tour.texte) || fiches.some((f) => !f.parFamille && !!f.prochainRdv)) {
    /* Un rendez-vous qu'elle a déjà : la Maison répond elle-même. */
    parle = false;
  } else if (uneQuestionAutre(tour.texte, ms)) {
    parle = false;
  } else if (intentionDeReserver(tour.texte)) {
    parle = true;
  } else if (ctx.premierMessage && fiches.length === 0) {
    parle = true;
  }
  if (!parle) return { parole: 'silence' };
  const envois = (etat?.envois ?? []).filter((e) => ms - msWa(e) < JOUR_WA).length;
  if (envois >= PLAFOND_DE_L_AUTOMATE && !confirmeValide(etat, tour, courante)) return { parole: 'main-silencieuse', motif: 'plafond' };
  return { parole: 'parle' };
}

const quiParle = (etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger): ParoleDuTour =>
  jugeLaParole(etat, tour, ctx).parole;

/* ── 9. CE QUE LE TOUR ÉCRIT ────────────────────────────────────────────
   Au « Je confirme » seulement : le rendez-vous, la demande (une inconnue)
   et la ligne d'envoi, posés ensemble par `pose_si_libre` sous verrou.
   Leurs identifiants viennent du message « Je confirme » : une seconde
   livraison ne crée rien. */
type RdvAPoser = {
  id: string;
  branchId: string;
  clientId: string;
  clientName: string;
  serviceIds: string[];
  date: string;
  time: string;
  dureeMin: number;
  status: 'confirmé';
  source: 'whatsapp';
  creeLe: string;
  note: string;
};

type DemandeAPoser = {
  id: string;
  genre: 'rdv';
  createdAt: string;
  branchId: string;
  prenom: string;
  civilite: CiviliteDuFil;
  telephone: string;
  besoin: Besoin;
  source: 'whatsapp';
  serviceIds: string[];
  date: string;
  time: string;
  apptId: string;
  consentementLe: string;
  statut: 'nouvelle';
};

type EnvoiAPoser = {
  id: string;
  branchId: string;
  type: 'confirmation';
  canal: 'whatsapp';
  apptId: string;
  clientId?: string;
  prenom: string;
  numero: string;
  dateRdv: string;
  heure: string;
  moment: string;
  statut: 'en cours';
  detail: string;
  quand: string;
};

type EcritureDuTour = { genre: 'pose'; rdv: RdvAPoser; demande?: DemandeAPoser; envoi: EnvoiAPoser };

type AlerteDeLAutomate = { titre: string; corps: string; url: string };

type SortieDuTour = {
  messages: MessageSortant[];
  etat: EtatDuFil;
  ecritures: EcritureDuTour[];
  /** L'automate a pris ce tour : le webhook n'envoie pas sa notification
      habituelle (l'automate rend la sienne, `alerte`). */
  pris: boolean;
  alerte?: AlerteDeLAutomate;
};

/** Le verdict de `pose_si_libre` (0125). */
type VerdictDeLaPose =
  | { ok: true; id: string; verdict?: 'pose' | 'deja' | 'deja_pose' }
  | { ok: false; raison: string };

/** L'ALERTE AU PERSONNEL : le prénom seul, jamais le texte qu'elle a écrit. */
function alerteDeLAutomate(o: {
  genre: 'pose' | 'main'; prenom: string; numero: string; date?: string; time?: string; motif?: MotifDeLaMain;
}): AlerteDeLAutomate {
  const qui = o.prenom || 'Une cliente';
  if (o.genre === 'pose') {
    return {
      titre: 'Nouveau rendez-vous par WhatsApp',
      corps: `${qui}, ${jourDitAvecAnnee(o.date ?? '')} à ${heureDite(o.time ?? '')}`,
      url: '/trone/#/calendrier',
    };
  }
  return {
    titre: 'WhatsApp · la main passe',
    corps: `${qui} · ${MOTIF_DIT[o.motif ?? 'demande']}`,
    url: `/trone/#/conversations?n=${o.numero}`,
  };
}

/** UNE CLÉ COURTE ET STABLE tirée d'un identifiant Meta : deux empreintes
    FNV-1a de 32 bits, en base 36. Le même message donne toujours la même
    clé ; deux messages, deux clés. */
function cleCourte(brut: string): string {
  const s = String(brut ?? '');
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `${a.toString(36).padStart(7, '0')}${b.toString(36).padStart(7, '0')}`;
}

/** Les gestes, dits comme on parle : « A », « A et B », « A, B et C ». */
const gestesDitsWa = (noms: readonly string[]): string =>
  (noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`);

/* ── 10. L'ATELIER DU TOUR ──────────────────────────────────────────────
   Toutes les étapes se fabriquent ici, autour d'un état de travail `base`.
   `etapeSuivante` y joue un tour ; `suiteDeLaPose` y dit le verdict du
   verrou, sans faire monter la version (une seule écriture par tour). */
function atelierDuTour(ancien: EtatDuFil | null | undefined, tour: TourDeLaCliente | null, ctx: ContexteDuTour, memeVersion: boolean) {
  const ms = ctx.maintenantMs;
  const maintenant = isoWa(ms);
  const pauseH = ctx.reglage.pauseHeures;
  const aujourdhui = instantACotonou(ms).iso;
  const courante = tour ? etapeCourante(ancien, ctx.main, ms, pauseH) : (ancien?.etape ?? 'repos');
  const version = (ancien?.version ?? 0) + (memeVersion ? 0 : 1);

  const base: EtatDuFil = ancien
    ? { ...ancien, panier: { ...ancien.panier }, traites: [...ancien.traites], envois: [...ancien.envois] }
    : etatNeufDuFil(ctx.numero, maintenant);
  base.numero = ctx.numero;
  base.version = version;
  base.majLe = maintenant;
  base.envois = base.envois.filter((e) => ms - msWa(e) < JOUR_WA);
  if (tour) {
    base.traites = [...new Set([...base.traites, ...tour.waIds])].slice(-5);
    base.dernierEntrantQuand = tour.quand || maintenant;
  }
  if (courante !== base.etape) {
    if (ETAPES_EN_COURS.includes(courante)) {
      /* Rendue à l'automate : il reprend l'étape où il en était. */
      base.etape = courante;
      base.versionDeLEtape = base.versionAvantLaMain ?? base.versionDeLEtape;
      base.mainPasseeLe = undefined;
      base.motifMain = undefined;
      base.etapeAvantLaMain = undefined;
      base.versionAvantLaMain = undefined;
    } else {
      base.etape = courante;
    }
    base.ecarts = 0;
  }

  const agenda = ctx.agenda;
  const cats = agenda?.categories ?? [];
  const prestation = (id: string): PrestationDuTour | undefined => agenda?.prestations.find((s) => s.id === id);
  /** Réservable par l'automate : ouverte en ligne, et une consultation, ou
      un geste qui n'exige ni consultation ni devis. La règle du serveur
      (`reservable`) ET celle de la Maison (qualification) : une création ne
      passe jamais, même si le site l'avait laissée ouverte par erreur. */
  const reservableWa = (s: PrestationDuTour | undefined): boolean =>
    !!s && s.reservable && (estUneConsultation(s, cats) || (!exigeConsultation(s, cats) && priceModeOf(s) !== 'devis'));
  const directe = (s: PrestationDuTour | undefined): boolean => reservableWa(s) && !estUneConsultation(s!, cats);
  const nomsDe = (ids: readonly string[]): string[] => ids.map((id) => prestation(id)?.name ?? '').filter(Boolean);

  /* ── Qui écrit, et comment on l'appelle ── */
  const fiches = fichesServies(ctx);
  const titulaire: FicheDuNumero | undefined = titulaireDuNumero(fiches, aujourdhui);
  /** Aucune adulte ne porte ce numéro en premier : celle qui écrit n'a
      peut-être pas de fiche. « Pour moi » la mène au parcours d'une inconnue
      (sa civilité, son prénom, sa demande). */
  const pourMoiPossible = !fiches.some((f) => f.parPhone && !mineureWa(f.naissance, aujourdhui));
  const appel = (): string => {
    if (titulaire) return appelDe({ name: titulaire.nom, civilite: titulaire.civilite, auMasculin: titulaire.auMasculin });
    if (base.panier.civilite) return appelDe({ name: base.panier.prenom ?? '', civilite: base.panier.civilite });
    return appelDe(null);
  };
  const ficheChoisie = (): FicheDuNumero | undefined => fiches.find((f) => f.id === base.panier.clientId);
  const prenomPourAlerte = (): string =>
    prenomDuNomWa(ficheChoisie()?.nom) || base.panier.prenom || prenomDuNomWa(titulaire?.nom) || '';
  const salut = (): string => {
    const min = instantACotonou(ms).min;
    return min >= 18 * 60 || min < 5 * 60 ? 'Bonsoir' : 'Bonjour';
  };
  const cotonou = heureDeCotonouSiBesoin(ctx.numero);
  const maisonNomWa = String(ctx.maison.nom || 'Maison MND').trim();

  /* ── Les briques des messages ── */
  const choix = (geste: string, argument?: string): string => idDeChoix(version, geste, argument);
  const sortieMaison = { id: choix('maison'), titre: 'Parler à la Maison' };
  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps });
  const boutons = (etape: EtapeDuFil, corps: string, liste: { id: string; titre: string }[]): MessageSortant =>
    ({ forme: 'boutons', etape, corps, pied: PIED, boutons: [...liste, sortieMaison].slice(0, 3) });
  const liste = (etape: EtapeDuFil, corps: string, bouton: string, lignes: { id: string; titre: string; description?: string }[]): MessageSortant =>
    ({ forme: 'liste', etape, corps, pied: PIED, bouton, lignes: [...lignes.slice(0, 9), sortieMaison] });
  const relanceDite = (): string => `Touchez l'un des choix ci-dessous, ${appel()}, ou Parler à la Maison.`;

  const passe = (etape: EtapeDuFil): void => {
    if (base.etape !== etape) {
      base.etape = etape;
      base.depuis = maintenant;
      base.versionDeLEtape = version;
      base.ecarts = 0;
    }
  };

  const sortie = (messages: MessageSortant[], alerte?: AlerteDeLAutomate): SortieDuTour => {
    for (let i = 0; i < messages.length; i += 1) base.envois.push(maintenant);
    return { messages, etat: base, ecritures: [], pris: true, ...(alerte ? { alerte } : {}) };
  };

  /** LA MAIN PASSE. Le jour : « Une personne de la Maison vous répond ici ».
      La nuit ou un jour fermé : « La Maison vous répond demain dès 9 h ». */
  const laMainDite = (): string => {
    const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
    return quand === null
      ? `Une personne de la Maison vous répond ici, ${appel()}.`
      : `La Maison vous répond ${quand}, ${appel()}.`;
  };
  const laMain = (motif: MotifDeLaMain, dire: boolean, corps?: string): SortieDuTour => {
    if (ETAPES_EN_COURS.includes(base.etape)) {
      base.etapeAvantLaMain = base.etape;
      base.versionAvantLaMain = base.versionDeLEtape;
    } else {
      base.etapeAvantLaMain = undefined;
      base.versionAvantLaMain = undefined;
    }
    passe('main');
    base.mainPasseeLe = maintenant;
    base.motifMain = motif;
    const messages = dire ? [texte('main', corps ?? laMainDite())] : [];
    return sortie(messages, alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte(), numero: ctx.numero, motif }));
  };
  const dire = (m: MessageSortant | null, motifSiRien: MotifDeLaMain = 'sans-place'): SortieDuTour =>
    (m ? sortie([m]) : laMain(motifSiRien, true));

  /* ── Les places ── */
  const tempsDe = (p: PlaceLibre): number => msWa(`${p.iso}T${p.heure}:00Z`);
  const chrono = (a: PlaceLibre, b: PlaceLibre): number => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : a.heure < b.heure ? -1 : a.heure > b.heure ? 1 : 0);
  const parJours = (places: readonly PlaceLibre[], combien: number): PlaceLibre[] => {
    if (combien <= 0) return [];
    const jours = new Map<string, { heure: string }[]>();
    for (const p of places) jours.set(p.iso, [...(jours.get(p.iso) ?? []), { heure: p.heure }]);
    return prochainesPlaces([...jours.entries()].map(([iso, heures]) => ({ iso, heures })), combien)
      .map((x) => ({ iso: x.iso, heure: x.place.heure }));
  };
  /** Deux places par jour au plus, sans compléter : le jour voulu passe en
      tête sans prendre toute la liste (la maquette : deux samedis, puis les
      autres jours). */
  const deuxParJour = (places: readonly PlaceLibre[], plafond: number): PlaceLibre[] => {
    const parJour = new Map<string, number>();
    for (const p of places) parJour.set(p.iso, (parJour.get(p.iso) ?? 0) + 1);
    const sansCompleter = [...parJour.values()].reduce((s, n) => s + Math.min(2, n), 0);
    return parJours(places, Math.min(plafond, sansCompleter));
  };
  const placesLibresDuPanier = (): PlaceLibre[] => {
    const ids = base.panier.serviceIds ?? [];
    if (!agenda || ids.length === 0) return [];
    return [...agenda.places(ids)].filter((p) => p.iso > aujourdhui).sort(chrono);
  };
  const convient = (p: PlaceLibre): boolean => {
    const j = base.panier.jourVoulu;
    const okJour = !j || (/^\d{4}-\d{2}-\d{2}$/.test(j) ? p.iso === j : JOURS_LONGS_WA[dowDeIsoWa(p.iso)] === j);
    const m = base.panier.moment;
    const okMoment = !m || (m === 'matin' ? p.heure < '13:00' : p.heure >= '13:00');
    return okJour && okMoment;
  };
  /** Le jour qu'elle écarte (« pas samedi ») : ses places ne reviennent pas. */
  const evitee = (p: PlaceLibre): boolean => {
    const j = base.panier.jourEvite;
    return !!j && (/^\d{4}-\d{2}-\d{2}$/.test(j) ? p.iso === j : JOURS_LONGS_WA[dowDeIsoWa(p.iso)] === j);
  };
  const preferenceDite = (): string => {
    const j = base.panier.jourVoulu;
    const m = base.panier.moment;
    const jour = !j ? '' : /^\d{4}-\d{2}-\d{2}$/.test(j)
      ? (j === isoPlusJoursWa(aujourdhui, 1) ? 'demain' : `le ${jourDitAvecAnnee(j)}`)
      : `le ${j}`;
    if (jour && m) return `${jour} ${m === 'matin' ? 'matin' : 'après-midi'}`;
    if (jour) return jour;
    return m === 'matin' ? 'le matin' : "l'après-midi";
  };

  const lignesDesPlaces = (sel: readonly PlaceLibre[]) => sel.map((p) => ({
    id: choix('place', `${p.iso.replace(/-/g, '')}-${p.heure.replace(':', '')}`),
    titre: titreDePlace(p.iso, p.heure),
    description: coupeWa(`${jourDitAvecAnnee(p.iso)} à ${heureDite(p.heure)}${cotonou}`, 72),
  }));

  const msgPlaces = (o: { intro?: string; relance?: boolean; proche?: PlaceLibre; exclure?: PlaceLibre } = {}): MessageSortant | null => {
    const toutes = placesLibresDuPanier()
      .filter((p) => !(o.exclure && p.iso === o.exclure.iso && p.heure === o.exclure.heure));
    if (toutes.length === 0) return null;
    /* Le jour qu'elle écarte ne revient pas, tant qu'il reste d'autres places. */
    const horsEvite = toutes.filter((p) => !evitee(p));
    const offertes = horsEvite.length > 0 ? horsEvite : toutes;
    let sel: PlaceLibre[];
    let intro = o.intro;
    if (o.proche) {
      const t0 = tempsDe(o.proche);
      sel = [...offertes].sort((a, b) => Math.abs(tempsDe(a) - t0) - Math.abs(tempsDe(b) - t0) || chrono(a, b))
        .slice(0, PLACES_PROPOSEES).sort(chrono);
    } else {
      const jour = base.panier.jourChoisi;
      const duJour = jour ? offertes.filter((p) => p.iso === jour) : [];
      if (jour && duJour.length > 0) {
        sel = parJours(duJour, PLACES_PROPOSEES);
        intro = intro ?? `Voici les places du ${jourDitAvecAnnee(jour)}, ${appel()}.`;
      } else {
        base.panier.jourChoisi = undefined;
        const voulues = offertes.filter(convient);
        const autres = offertes.filter((p) => !convient(p));
        const d = deuxParJour(voulues, PLACES_PROPOSEES);
        const a = deuxParJour(autres, PLACES_PROPOSEES - d.length);
        sel = [...d, ...a];
        /* Moins de sept : on complète, le jour voulu d'abord, dans l'ordre du temps. */
        const cle = (p: PlaceLibre): string => `${p.iso} ${p.heure}`;
        const pris = new Set(sel.map(cle));
        for (const p of [...voulues, ...autres]) {
          if (sel.length >= PLACES_PROPOSEES) break;
          if (!pris.has(cle(p))) { sel.push(p); pris.add(cle(p)); }
        }
        if ((base.panier.jourVoulu || base.panier.moment) && voulues.length === 0) {
          intro = intro ?? `Nous n'avons plus de place ${preferenceDite()} dans les ${ctx.reglage.horizonJours} prochains jours, ${appel()}. Voici les prochaines places.`;
        }
      }
    }
    base.panier.places = sel;
    passe('places');
    const corps = o.relance ? relanceDite() : (intro ?? `Voici les prochaines places, ${appel()}.`);
    return liste('places', corps, 'Voir les places', [
      ...lignesDesPlaces(sel),
      { id: choix('autre-jour'), titre: 'Un autre jour', description: 'les prochains jours ouverts' },
    ]);
  };

  const msgJours = (relance = false): MessageSortant | null => {
    const libres = placesLibresDuPanier();
    const horsEvite = libres.filter((p) => !evitee(p));
    const toutes = horsEvite.length > 0 ? horsEvite : libres;
    const compte = new Map<string, number>();
    for (const p of toutes) compte.set(p.iso, (compte.get(p.iso) ?? 0) + 1);
    const jours = [...compte.keys()].sort().slice(0, JOURS_PROPOSES);
    if (jours.length === 0) return null;
    base.panier.jourChoisi = undefined;
    passe('jours');
    return liste('jours', relance ? relanceDite() : `Quel jour vous conviendrait, ${appel()} ?`, 'Choisir un jour', jours.map((iso) => {
      const n = compte.get(iso) ?? 0;
      return { id: choix('jour', iso.replace(/-/g, '')), titre: titreDuJour(iso), description: `${n} ${n > 1 ? 'heures libres' : 'heure libre'}` };
    }));
  };

  /* ── Les étapes ── */
  const msgQui = (relance: boolean, avecSalut: boolean): MessageSortant => {
    passe('qui');
    const lignes = fiches.slice(0, pourMoiPossible ? 7 : 8).map((f) => ({
      id: choix('qui', f.id),
      titre: coupeWa(f === titulaire ? `Pour moi, ${prenomDuNomWa(f.nom)}` : `Pour ${prenomDuNomWa(f.nom)}`, 24),
    }));
    const corps = relance ? relanceDite()
      : avecSalut ? `${salut()} ${appel()}, merci de votre message. Pour qui est ce rendez-vous ?`
        : `Pour qui est ce rendez-vous, ${appel()} ?`;
    return liste('qui', corps, 'Choisir', [
      ...lignes,
      ...(pourMoiPossible ? [{ id: choix('moi'), titre: 'Pour moi' }] : []),
      { id: choix('autre-personne'), titre: 'Une autre personne' },
    ]);
  };

  const msgBesoin = (relance: boolean, avecSalut: boolean): MessageSortant => {
    passe('besoin');
    const pourQui = base.panier.pourQui;
    let corps: string;
    if (relance) corps = relanceDite();
    else if (pourQui) corps = `Comment pouvons-nous prendre soin de la couronne de ${pourQui}, ${appel()} ?`;
    else if (avecSalut && fiches.length === 0) corps = `${salut()} ${appel()}, bienvenue à la ${maisonNomWa}. Comment pouvons-nous prendre soin de votre couronne ?`;
    else if (avecSalut) corps = `${salut()} ${appel()}, merci de votre message. Comment pouvons-nous prendre soin de votre couronne ?`;
    else corps = `Comment pouvons-nous prendre soin de votre couronne, ${appel()} ?`;
    const ses = pourQui ? 'ses' : 'mes';
    return liste('besoin', corps, 'Choisir', [
      { id: choix('besoin', 'entretien'), titre: `Entretenir ${ses} locks` },
      { id: choix('besoin', 'creation'), titre: `Créer ${ses} locks` },
      { id: choix('besoin', 'reparation'), titre: `Réparer ${ses} locks` },
      ...(pourQui ? [] : [{ id: choix('besoin', 'enfant'), titre: 'Pour mon enfant' }]),
    ]);
  };

  const venueReprenable = (f: FicheDuNumero | undefined): { date: string; serviceIds: string[] } | null => {
    const v = f?.derniereVenue;
    if (!v || !Array.isArray(v.serviceIds) || v.serviceIds.length === 0 || v.serviceIds.length > 6) return null;
    return v.serviceIds.every((id) => directe(prestation(id))) ? v : null;
  };

  const msgMeme = (relance: boolean, avecSalut: boolean): MessageSortant | null => {
    const v = venueReprenable(ficheChoisie());
    if (!v) return null;
    passe('meme');
    const gestes = gestesDitsWa(nomsDe(v.serviceIds));
    const quand = jourDitAvecAnnee(v.date);
    const pourQui = base.panier.pourQui;
    const corps = relance ? relanceDite()
      : pourQui ? `La dernière venue de ${pourQui}, ${appel()} : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`
        : avecSalut ? `${salut()} ${appel()}, merci de votre message. Votre dernière venue : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`
          : `Votre dernière venue, ${appel()} : ${gestes}, le ${quand}. Souhaitez-vous la même chose ?`;
    return boutons('meme', corps, [
      { id: choix('meme'), titre: 'La même chose' },
      { id: choix('autre'), titre: 'Autre chose' },
    ]);
  };

  const titreDesGestes = (ids: readonly string[]): string => {
    const noms = nomsDe(ids);
    if (noms.length <= 1) return coupeWa(noms[0] ?? '', 24);
    const suite = ` + ${noms.length - 1}`;
    return `${coupeWa(noms[0], 24 - suite.length)}${suite}`;
  };

  const sontDesConsultations = (offres: readonly string[][]): boolean =>
    offres.length > 0 && offres.every((ids) => ids.length === 1 && !!prestation(ids[0]) && estUneConsultation(prestation(ids[0])!, cats));

  const msgRituel = (relance: boolean, offres: string[][]): MessageSortant | null => {
    const valables = offres.filter((ids) => ids.length > 0 && ids.every((id) => reservableWa(prestation(id)))).slice(0, 8);
    if (valables.length === 0) return null;
    passe('rituel');
    base.panier.rituels = valables.map((ids) => [...ids]);
    const consultations = sontDesConsultations(valables);
    const corps = relance ? relanceDite()
      : consultations ? `Quelle consultation souhaitez-vous, ${appel()} ?` : `Quel rituel souhaitez-vous, ${appel()} ?`;
    return liste('rituel', corps, 'Choisir', [
      ...valables.map((ids, i) => ({
        id: choix('rituel', String(i)),
        titre: titreDesGestes(ids),
        description: coupeWa(gestesDitsWa(nomsDe(ids)), 72),
      })),
      ...(consultations ? [] : [{ id: choix('autre-soin'), titre: 'Autre soin', description: 'une personne de la Maison vous répond' }]),
    ]);
  };

  const msgCivilite = (relance: boolean): MessageSortant => {
    passe('civilite');
    return liste('civilite', relance ? relanceDite() : 'Pour inscrire votre rendez-vous, comment devons-nous vous appeler ?', 'Choisir', [
      { id: choix('civ', 'madame'), titre: 'Madame' },
      { id: choix('civ', 'mademoiselle'), titre: 'Mademoiselle' },
      { id: choix('civ', 'monsieur'), titre: 'Monsieur' },
    ]);
  };

  const msgPrenom = (relance: boolean): MessageSortant => {
    passe('prenom');
    const civ = appelDe({ civilite: base.panier.civilite });
    return boutons('prenom', relance
      ? `Écrivez simplement votre prénom, ${civ}, ou touchez Parler à la Maison.`
      : `Et votre prénom, ${civ} ?`, []);
  };

  const quandDuPanier = (): string =>
    `${jourDitAvecAnnee(base.panier.date ?? '')} à ${heureDite(base.panier.time ?? '')}${cotonou}`;

  const msgRecap = (relance: boolean): MessageSortant | null => {
    const p = base.panier;
    if (!p.date || !p.time || !p.serviceIds?.length) return null;
    passe('recap');
    const gestes = gestesDitsWa(nomsDe(p.serviceIds));
    const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
    const corps = relance ? relanceDite()
      : `Voici ${de}, ${appel()} : ${gestes}, ${quandDuPanier()}, à la ${maisonNomWa}. Nous le posons ?`;
    return boutons('recap', corps, [
      { id: choix('oui'), titre: 'Je confirme' },
      { id: choix('autre-heure'), titre: 'Une autre heure' },
    ]);
  };

  const renvoie = (etape: EtapeDuFil, relance: boolean): SortieDuTour => {
    switch (etape) {
      case 'qui': return dire(msgQui(relance, false));
      case 'besoin': return dire(msgBesoin(relance, false));
      case 'meme': return dire(msgMeme(relance, false) ?? msgBesoin(relance, false));
      case 'rituel': return dire(msgRituel(relance, base.panier.rituels ?? []), 'autre-soin');
      case 'places': return dire(msgPlaces({ relance }));
      case 'jours': return dire(msgJours(relance));
      case 'civilite': return dire(msgCivilite(relance));
      case 'prenom': return dire(msgPrenom(relance));
      case 'recap': return dire(msgRecap(relance) ?? msgPlaces({}));
      default: return laMain('erreur', true);
    }
  };

  const ecart = (): SortieDuTour => {
    base.ecarts = (base.ecarts ?? 0) + 1;
    if (base.ecarts >= ECARTS_AVANT_LA_MAIN) return laMain('ecarts', true);
    return renvoie(base.etape, true);
  };

  /* ── Les gestes ── */
  const pourLaFiche = (f: FicheDuNumero, avecSalut: boolean): SortieDuTour => {
    base.panier.clientId = f.id;
    /* Sans titulaire, celle qui écrit n'est pas cette fiche : on parle
       « de Kemi », jamais « de votre » dernière venue. */
    base.panier.pourQui = f.id !== titulaire?.id ? prenomDuNomWa(f.nom) : undefined;
    return dire(msgMeme(false, avecSalut) ?? msgBesoin(false, avecSalut));
  };

  const accueil = (mots: MotsDuTour): SortieDuTour => {
    base.panier = {
      ...(mots.jourVoulu ? { jourVoulu: mots.jourVoulu } : {}),
      ...(mots.jourEvite ? { jourEvite: mots.jourEvite } : {}),
      ...(mots.moment ? { moment: mots.moment } : {}),
    };
    base.prisLe = maintenant;
    base.rdvId = undefined;
    base.mainPasseeLe = undefined;
    base.motifMain = undefined;
    base.etapeAvantLaMain = undefined;
    base.versionAvantLaMain = undefined;
    if (fiches.length === 0) return dire(msgBesoin(false, true));
    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, true);
    return dire(msgQui(false, true));
  };

  const introDeLaConsultation = (b: Besoin, nom: string): string => {
    if (base.panier.pourQui) return `Cela commence toujours par une consultation, ${appel()} : le ${nom}. Voici les prochaines places.`;
    if (b === 'creation') return `Une première couronne commence toujours par une consultation, ${appel()} : le ${nom}. Nous y étudions votre texture et votre cuir chevelu, et choisissons ensemble votre calibre. Voici les prochaines places.`;
    if (b === 'reparation') return `Une réparation commence toujours par une consultation, ${appel()} : le ${nom}. Nous y regardons vos locks et décidons ensemble du soin. Voici les prochaines places.`;
    return `Pour un enfant, tout commence par un échange avec ses parents, ${appel()} : le ${nom}. Voici les prochaines places.`;
  };

  /** La consultation du parcours si elle existe encore, sinon toutes : on
      ne ferme jamais la porte sur un identifiant qui a changé de nom. */
  const consultationsPour = (b: Besoin): PrestationDuTour[] => {
    const toutes = (agenda?.prestations ?? []).filter((s) => reservableWa(s) && estUneConsultation(s, cats));
    const sienne = agenda?.consultationParParcours?.[b];
    const laSienne = sienne ? toutes.filter((s) => s.id === sienne) : [];
    return laSienne.length > 0 ? laSienne : toutes;
  };

  const formulesOffertes = (): string[][] => {
    const formules = (agenda?.formules ?? [])
      .map((f) => [...f.serviceIds])
      .filter((ids) => ids.length > 0 && ids.length <= 6 && ids.every((id) => directe(prestation(id))));
    if (formules.length > 0) return formules.slice(0, 8);
    return (agenda?.prestations ?? []).filter((s) => directe(s))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')).slice(0, 8).map((s) => [s.id]);
  };

  const choisisLeBesoin = (b: Besoin): SortieDuTour => {
    base.panier.besoin = b;
    if (b === 'entretien') return dire(msgRituel(false, formulesOffertes()), 'autre-soin');
    const consult = consultationsPour(b);
    if (consult.length === 0) return laMain('sans-place', true);
    if (consult.length > 1) return dire(msgRituel(false, consult.map((s) => [s.id])), 'sans-place');
    base.panier.serviceIds = [consult[0].id];
    return dire(msgPlaces({ intro: introDeLaConsultation(b, consult[0].name) }));
  };

  const placePrise = (p: PlaceLibre): SortieDuTour =>
    dire(msgPlaces({ intro: `Cette heure vient d'être prise, ${appel()}. Voici les places les plus proches.`, proche: p, exclure: p }));

  const choisisLaPlace = (p: PlaceLibre): SortieDuTour => {
    const libre = p.iso > aujourdhui && placesLibresDuPanier().some((x) => x.iso === p.iso && x.heure === p.heure);
    if (!libre) return placePrise(p);
    base.panier.date = p.iso;
    base.panier.time = p.heure;
    base.panier.dureeMin = dureeDesPrestations(base.panier.serviceIds ?? [], agenda?.prestations ?? []);
    if (!base.panier.clientId) {
      if (!base.panier.civilite) return dire(msgCivilite(false));
      if (!base.panier.prenom) return dire(msgPrenom(false));
    }
    return dire(msgRecap(false) ?? msgPlaces({}));
  };

  /** « JE CONFIRME » : la place est rejouée sur l'instantané du tour, puis
      l'écriture part au verrou. Aucun message ici : la confirmation, ou la
      place prise, vient avec le verdict (`suiteDeLaPose`). */
  const poseLeRendezVous = (): SortieDuTour => {
    const p = base.panier;
    if (!p.date || !p.time || !p.serviceIds?.length || !agenda) return dire(msgPlaces({}));
    const place = { iso: p.date, heure: p.time };
    const libre = p.date > aujourdhui && placesLibresDuPanier().some((x) => x.iso === place.iso && x.heure === place.heure);
    if (!libre) return placePrise(place);
    if (!p.clientId && (!p.civilite || !p.prenom)) return dire(msgCivilite(false));
    const waId = tour?.choix?.waId;
    if (!waId) return laMain('erreur', true);
    const cle = cleCourte(waId);
    const fiche = ficheChoisie();
    const rdvId = `rdv-wa-${cle}`;
    const quand = `${jourDitAvecAnnee(p.date)} à ${heureDite(p.time)}`;
    const dureeMin = p.dureeMin ?? dureeDesPrestations(p.serviceIds, agenda.prestations);
    const rdv: RdvAPoser = {
      id: rdvId,
      branchId: agenda.branchId,
      clientId: fiche?.id ?? '',
      clientName: fiche?.nom || p.prenom || 'Réservation WhatsApp',
      serviceIds: [...p.serviceIds],
      date: p.date,
      time: p.time,
      dureeMin,
      status: 'confirmé',
      source: 'whatsapp',
      creeLe: maintenant,
      note: `Pris sur WhatsApp · réponse automatique${ctx.reglage.mode === 'essai' ? ' · essai' : ''}`,
    };
    const demande: DemandeAPoser | undefined = fiche ? undefined : {
      id: `dem-wa-${cle}`,
      genre: 'rdv',
      createdAt: maintenant,
      branchId: agenda.branchId,
      prenom: p.prenom ?? '',
      civilite: p.civilite ?? 'madame',
      telephone: `+${ctx.numero}`,
      besoin: p.besoin ?? 'entretien',
      source: 'whatsapp',
      serviceIds: [...p.serviceIds],
      date: p.date,
      time: p.time,
      apptId: rdvId,
      consentementLe: tour?.quand || maintenant,
      statut: 'nouvelle',
    };
    const envoi: EnvoiAPoser = {
      id: `conf-${rdvId}-whatsapp`,
      branchId: agenda.branchId,
      type: 'confirmation',
      canal: 'whatsapp',
      apptId: rdvId,
      ...(fiche ? { clientId: fiche.id } : {}),
      prenom: appel(),
      numero: `+${ctx.numero}`,
      dateRdv: p.date,
      heure: p.time,
      moment: quand,
      statut: 'en cours',
      detail: 'dit dans la conversation',
      quand: maintenant,
    };
    return { messages: [], etat: base, ecritures: [{ genre: 'pose', rdv, ...(demande ? { demande } : {}), envoi }], pris: true };
  };

  /** LE VERDICT DU VERROU. Posé : la confirmation, signée de la devise.
      L'heure prise entre-temps : les places les plus proches, rien n'est
      posé. Autre chose : la main passe. */
  const ditLeVerdict = (verdict: VerdictDeLaPose): SortieDuTour => {
    const p = base.panier;
    if (verdict.ok) {
      base.rdvId = verdict.id;
      passe('confirme');
      const de = p.pourQui ? `le rendez-vous de ${p.pourQui}` : 'votre rendez-vous';
      const itineraire = String(ctx.maison.itineraire ?? '').trim();
      const corps = [
        `C'est confirmé, ${appel()} : ${de} est retenu le ${quandDuPanier()}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`,
        itineraire && texteSain(itineraire).length === 0 ? coupeWa(itineraire, 600) : '',
        DEVISE,
      ].filter(Boolean).join('\n\n');
      return sortie([texte('confirme', corps)], alerteDeLAutomate({
        genre: 'pose', prenom: prenomPourAlerte(), numero: ctx.numero, date: p.date, time: p.time,
      }));
    }
    if (['creneau_pris', 'creneau_plafond', 'creneau_complet', 'creneau_hors_ouverture', 'creneau_ferme'].includes(verdict.raison) && p.date && p.time) {
      return placePrise({ iso: p.date, heure: p.time });
    }
    return laMain('erreur', true);
  };

  /* ── LE TOUR ── */
  const joue = (t: TourDeLaCliente): SortieDuTour => {
    const mots = motsReconnus(t.texte, ms);
    const enCours = ETAPES_EN_COURS.includes(base.etape);
    const ch = lisLeChoix(t.choix?.id);

    /* « Je confirme » du récapitulatif en cours passe même au-delà du
       plafond : elle a confirmé, elle reçoit sa confirmation. */
    const confirme = base.etape === 'recap' && ch?.geste === 'oui' && ch.version >= base.versionDeLEtape && ch.version < version;
    if (base.envois.length >= PLAFOND_DE_L_AUTOMATE && !confirme) return laMain('plafond', false);
    if (enCours && t.media) return laMain('media', false);
    if (enCours && mots.prix) return laMain('prix', false);
    if (ch?.geste === 'maison') return laMain('demande', true);
    /* LE JOUR MÊME ne se réserve jamais ici : la Maison répond elle-même
       (la nuit, elle dit quand). */
    if (mots.jourMeme) {
      return laMain('jour-meme', true, prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []) === null
        ? `Pour aujourd'hui, une personne de la Maison vous répond ici, ${appel()}.`
        : laMainDite());
    }
    if (mots.deplacer || (mots.annuler && (!enCours || mots.parleDUnRdv))) {
      return laMain('annulation', true, `Nous transmettons votre demande, ${appel()}. La Maison vous répond ici.`);
    }
    if (mots.annuler && enCours) {
      passe('clos');
      return sortie([texte('clos', `C'est noté, ${appel()} : rien n'est réservé. Écrivez-nous quand vous le souhaitez.`)]);
    }
    if (!enCours) return accueil(mots);
    if (!agenda) return laMain('erreur', true);

    if (ch) {
      const valide = ch.version >= base.versionDeLEtape && ch.version < version;
      /* UN VIEUX TOUCHER renvoie l'étape où l'on est : ce n'est pas un écart. */
      if (!valide) return renvoie(base.etape, false);
      const g = ch.geste;
      const arg = ch.argument ?? '';
      switch (base.etape) {
        case 'qui': {
          const f = g === 'qui' ? fiches.find((x) => x.id === arg) : undefined;
          if (f) return pourLaFiche(f, false);
          if (g === 'moi' && pourMoiPossible) {
            base.panier.clientId = undefined;
            base.panier.pourQui = undefined;
            return dire(msgBesoin(false, false));
          }
          if (g === 'autre-personne') return laMain('autre-personne', true);
          break;
        }
        case 'besoin':
          if (g === 'besoin' && (arg === 'entretien' || arg === 'creation' || arg === 'reparation' || arg === 'enfant')) {
            return choisisLeBesoin(arg);
          }
          break;
        case 'meme': {
          if (g === 'meme') {
            const v = venueReprenable(ficheChoisie());
            if (!v) return dire(msgBesoin(false, false));
            base.panier.besoin = 'entretien';
            base.panier.serviceIds = [...v.serviceIds];
            return dire(msgPlaces({}));
          }
          if (g === 'autre') return dire(msgBesoin(false, false));
          break;
        }
        case 'rituel': {
          if (g === 'rituel') {
            const ids = base.panier.rituels?.[Number(arg)];
            if (!ids || !ids.every((id) => reservableWa(prestation(id)))) return renvoie('rituel', false);
            base.panier.serviceIds = [...ids];
            const unique = ids.length === 1 ? prestation(ids[0]) : undefined;
            const consultation = unique && estUneConsultation(unique, cats);
            return dire(msgPlaces(consultation && base.panier.besoin ? { intro: introDeLaConsultation(base.panier.besoin, unique.name) } : {}));
          }
          if (g === 'autre-soin') return laMain('autre-soin', true);
          break;
        }
        case 'places': {
          if (g === 'place') {
            const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(arg);
            if (m) return choisisLaPlace({ iso: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}` });
          }
          if (g === 'autre-jour') return dire(msgJours(false));
          if (g === 'revoir') return dire(msgPlaces({}));
          break;
        }
        case 'jours': {
          const m = g === 'jour' ? /^(\d{4})(\d{2})(\d{2})$/.exec(arg) : null;
          if (m) {
            base.panier.jourChoisi = `${m[1]}-${m[2]}-${m[3]}`;
            return dire(msgPlaces({}));
          }
          break;
        }
        case 'civilite':
          if (g === 'civ' && (arg === 'madame' || arg === 'mademoiselle' || arg === 'monsieur')) {
            base.panier.civilite = arg;
            return dire(base.panier.prenom ? (msgRecap(false) ?? msgPlaces({})) : msgPrenom(false));
          }
          break;
        case 'recap':
          if (g === 'oui') return poseLeRendezVous();
          if (g === 'autre-heure') {
            base.panier.date = undefined;
            base.panier.time = undefined;
            base.panier.jourChoisi = undefined;
            return dire(msgPlaces({}));
          }
          break;
        default:
          break;
      }
      return renvoie(base.etape, false);
    }

    /* UNE QUESTION QUI N'EST PAS DE RÉSERVER ne s'avale jamais : la main
       passe, dite, et l'équipe la lit (relecture du 9 octobre 2026). */
    if (uneQuestionAutre(t.texte, ms)) return laMain('question', true);
    /* Un texte : les mots reconnus d'abord, puis la civilité et le prénom,
       sinon un écart. Des mots qui ne changent rien à ce qu'elle veut (le
       même « samedi », encore) sont un écart : la même liste ne revient pas
       sans fin. */
    const desMots = !!(mots.jourVoulu || mots.moment || mots.jourEvite);
    const retiensLesMots = (): boolean => {
      const p = base.panier;
      const avant = [p.jourVoulu, p.moment, p.jourEvite].join('|');
      const jourVoulu = mots.jourVoulu ?? (mots.jourEvite && p.jourVoulu === mots.jourEvite ? undefined : p.jourVoulu);
      const jourEvite = mots.jourEvite ?? (mots.jourVoulu && p.jourEvite === mots.jourVoulu ? undefined : p.jourEvite);
      const moment = mots.moment ?? p.moment;
      if ([jourVoulu, moment, jourEvite].join('|') === avant) return false;
      p.jourVoulu = jourVoulu;
      p.moment = moment;
      p.jourEvite = jourEvite;
      p.jourChoisi = undefined;
      return true;
    };
    switch (base.etape) {
      case 'places':
      case 'jours':
        if (desMots) return retiensLesMots() ? dire(msgPlaces({})) : ecart();
        if (base.etape === 'places' && base.panier.besoin === 'creation' && /\bcrea|\bcreer\b/.test(sansAccentsWa(t.texte))) {
          return sortie([boutons('places', `La création se décide après la consultation, ${appel()}. Une personne de la Maison peut vous en dire plus.`, [
            { id: choix('revoir'), titre: 'Voir les places' },
          ])]);
        }
        break;
      case 'recap':
        if (desMots) {
          if (!retiensLesMots()) return ecart();
          base.panier.date = undefined;
          base.panier.time = undefined;
          return dire(msgPlaces({}));
        }
        break;
      case 'civilite': {
        /* ÉCRITE AU LIEU D'ÊTRE TOUCHÉE (relecture du 9 octobre 2026) :
           « Madame », « Mme Grace », « Monsieur Koffi ». */
        const c = civiliteLue(t.texte);
        if (c) {
          base.panier.civilite = c.civilite;
          if (c.prenom) base.panier.prenom = c.prenom;
          return dire(base.panier.prenom ? (msgRecap(false) ?? msgPlaces({})) : msgPrenom(false));
        }
        if (desMots) return retiensLesMots() ? renvoie(base.etape, false) : ecart();
        break;
      }
      case 'prenom': {
        /* « Mme Grace » : la civilité se corrige, le prénom se garde. */
        const c = civiliteLue(t.texte);
        const change = !!c && c.civilite !== base.panier.civilite;
        if (c) base.panier.civilite = c.civilite;
        const prenom = c ? (c.prenom ?? null) : prenomLu(t.texte);
        if (prenom) {
          base.panier.prenom = prenom;
          return dire(msgRecap(false) ?? msgPlaces({}));
        }
        if (change) return dire(msgPrenom(false));
        break;
      }
      default:
        if (desMots) return retiensLesMots() ? renvoie(base.etape, false) : ecart();
        break;
    }
    return ecart();
  };

  return { base, joue, laMain, ditLeVerdict };
}

/** LE PRÉNOM QU'ELLE ÉCRIT : « Awa », « je m'appelle Awa », « moi c'est
    Awa ». Pas de chiffre, trois mots au plus, des lettres. */
function prenomLu(brut: string): string | null {
  let t = String(brut ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(?:je m(?:'|’|\s)?appelle|moi c'?est|moi c’est|c'?est|c’est|je suis|mon pr[ée]nom (?:est|c'?est|c’est))\s+(.+)$/i.exec(t);
  if (m) t = m[1];
  t = t.replace(/[.!,;:]+$/, '').trim();
  if (!t || t.length > 40 || /\d/.test(t)) return null;
  if (!/^\p{L}[\p{L}'’\- ]*$/u.test(t)) return null;
  const mots = t.split(' ');
  if (mots.length > 3) return null;
  if (/^(bonjour|bonsoir|oui|non|merci|ok|okay|salut|madame|mademoiselle|monsieur|mme|mlle|melle|mr|svp|stp)$/.test(sansAccentsWa(mots[0]))) return null;
  return mots.map((w) => w.split('-').map((p) => (p ? `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}` : p)).join('-')).join(' ');
}

/** LA CIVILITÉ QU'ELLE ÉCRIT au lieu de la toucher (relecture du 9 octobre
    2026) : « Madame », « Mme Grace », « mademoiselle », « Mlle Awa »,
    « Monsieur Koffi », « M. Koffi ». Le prénom qui suit, s'il se lit, est
    retenu. Rien d'autre : `null`. */
function civiliteLue(brut: string): { civilite: CiviliteDuFil; prenom?: string } | null {
  const t = String(brut ?? '').trim().replace(/\s+/g, ' ');
  const m = /^(madame|mme|mademoiselle|mlle|melle|monsieur|mr|m(?=\.))\.?(?:\s+(.+?))?[.!,;:]*$/i.exec(t);
  if (!m) return null;
  const mot = sansAccentsWa(m[1]);
  const civilite: CiviliteDuFil = mot === 'mademoiselle' || mot === 'mlle' || mot === 'melle' ? 'mademoiselle'
    : mot === 'monsieur' || mot === 'mr' || mot === 'm' ? 'monsieur' : 'madame';
  const prenom = m[2] ? prenomLu(m[2]) : null;
  return { civilite, ...(prenom ? { prenom } : {}) };
}

/** UN TOUR DE LA CONVERSATION. Rend les messages à envoyer (un au plus),
    l'état à écrire (`avance_le_fil`), les écritures (le rendez-vous, au
    « Je confirme » seulement), et l'alerte au personnel. `pris: false` : ce
    tour n'est pas à lui, rien ne s'écrit et le webhook prévient comme
    d'habitude. */
function etapeSuivante(ancien: EtatDuFil | null, tour: TourDeLaCliente, ctx: ContexteDuTour): SortieDuTour {
  const juge = jugeLaParole(ancien, tour, ctx);
  if (juge.parole === 'silence') {
    return { messages: [], etat: ancien ?? etatNeufDuFil(ctx.numero, isoWa(ctx.maintenantMs)), ecritures: [], pris: false };
  }
  const atelier = atelierDuTour(ancien, tour, ctx, false);
  if (juge.parole === 'main-silencieuse') return atelier.laMain(juge.motif ?? 'erreur', false);
  return atelier.joue(tour);
}

/** APRÈS LE VERROU : `etat` est celui que `etapeSuivante` vient de rendre
    avec l'écriture `pose` ; la version ne monte pas (une écriture par tour). */
function suiteDeLaPose(etat: EtatDuFil, verdict: VerdictDeLaPose, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, true).ditLeVerdict(verdict);
}

/** APRÈS COUP : META A REFUSÉ LE MESSAGE DU TOUR (fenêtre fermée, compte
    sans moyen de paiement, numéro injoignable), ou le message ne passait
    pas les juges de la Maison. `etat` est celui que le tour vient d'écrire.
    La main passe SANS UN MOT de plus (un second message ne partirait pas
    mieux) : sans cela le fil se dirait tenu, l'alarme se tairait, et elle
    attendrait une réponse qui n'est jamais partie. C'est une seconde
    écriture du tour : la version monte. */
function mainApresCoup(etat: EtatDuFil, motif: MotifDeLaMain, ctx: ContexteDuTour): SortieDuTour {
  return atelierDuTour(etat, null, ctx, false).laMain(motif, false);
}
/* ⟨/automate-wa⟩ */

export {
  REGLAGE_LIVRE, PLAFOND_DE_L_AUTOMATE, ECARTS_AVANT_LA_MAIN, PLACES_PROPOSEES, JOURS_PROPOSES,
  PARCOURS_PERIME_MS, TOUR_PERIME_MS, TOUR_EN_COURS_MS, ETAPES_EN_COURS, ETAPE_DITE, MOTIF_DIT, PIED, DEVISE,
  reglageDeLAutomate, numeroServi, pauseActive, etapeCourante, tenuParLAutomate, vueDeLAutomate, silenceDeLAlarme,
  LA_MAISON_A_PARLE_MS, mineureWa, fichesServies, titulaireDuNumero, laMaisonAParle, confirmeValide,
  renvoieAUnRdv, uneQuestionAutre, civiliteLue,
  motsReconnus, intentionDeReserver, tourDeLaCliente, lisLeChoix, idDeChoix, instantACotonou,
  heureDite, jourDitAvecAnnee, titreDePlace, titreDuJour, prochaineOuvertureDite,
  choixDuMessage, chargeGraph, respecteMeta, texteSain, alerteDeLAutomate, cleCourte, prenomLu,
  quiParle, jugeLaParole, etapeSuivante, suiteDeLaPose, mainApresCoup,
};
export type {
  ModeDeLAutomate, ReglageDeLAutomate, TiroirDuNumero, EtapeDuFil, MotifDeLaMain, CiviliteDuFil, PlaceLibre,
  PanierDuFil, EtatDuFil, MainDuFil, TenueDuFil, VueDeLAutomate, MotsDuTour, MessageEntrantDuTour, ChoixDuTour,
  TourDeLaCliente, FormeDuMessage, MessageSortant, FicheDuNumero, PrestationDuTour, AgendaDuTour, ContexteLeger,
  ContexteDuTour, ParoleDuTour, RdvAPoser, DemandeAPoser, EnvoiAPoser, EcritureDuTour, AlerteDeLAutomate,
  SortieDuTour, VerdictDeLaPose,
};
