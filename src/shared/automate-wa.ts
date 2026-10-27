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
     · il se tait quand elle parle d'un rendez-vous qu'elle a déjà (sauf une
       question que le conseil reconnaît), et devant une question qui n'est
       pas de réserver (en plein parcours, la main passe, dite). Il se
       taisait aussi une semaine quand la Maison avait écrit, et quand sa
       fiche portait un rendez-vous à venir : levé le 14 octobre 2026 (« I
       need the automation to take the lead all the time ») ;
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
import { GESTES_EN_FRANCAIS, gesteDitEnFrancaisWa, litLaMarqueWa } from './gestes-en-francais';
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

/** LA CLÉ D'UN NUMÉRO POUR LE COMPARER (13 octobre 2026). Meta identifie
    une Béninoise par son ancien numéro à huit chiffres (229 97 00 00 99)
    quand le Trône l'écrit au plan de 2024 (229 01 97 00 00 99) : le premier
    essai de Yéman est resté sans réponse, son numéro listé en Essai n'étant
    « pas le même ». Les deux formes se réduisent à la même clé. Rien d'autre
    ne change : les envois et les fils gardent le numéro tel que Meta le dit. */
function cleWa(brut: unknown): string {
  const d = String(brut ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('22901')) return `229${d.slice(5)}`;
  if (d.length === 10 && d.startsWith('01')) return `229${d.slice(2)}`;
  if (d.length === 8) return `229${d}`;
  return d;
}

type TiroirDuNumero = 'clientes' | 'equipe' | 'prestataires';

/** QUI EST SERVI. Éteint : personne. Essai : les numéros listés seulement,
    même rangés dans Équipe (la direction y est). Ouvert : le tiroir Clientes,
    et toujours les numéros listés. Les prestataires, jamais. */
function numeroServi(reglage: ReglageDeLAutomate, numero: string, tiroir: TiroirDuNumero | undefined): boolean {
  const n = cleWa(numero);
  if (!n || tiroir === 'prestataires' || reglage.mode === 'eteint') return false;
  if (reglage.numerosEssai.some((x) => cleWa(x) === n)) return true;
  return reglage.mode === 'ouvert' && (tiroir ?? 'clientes') === 'clientes';
}

/* ── 2. L'ÉTAT DU FIL ───────────────────────────────────────────────────
   Deux lignes par numéro dans `fils_automate`, pour que personne n'écrase
   l'autre : `fil-<numero>` (écrite par le serveur seul, `avance_le_fil`) et
   `main-<numero>` (la main de l'équipe, écrite par le Trône ou par
   `pause_le_fil`). */
type EtapeDuFil =
  | 'repos' | 'qui' | 'besoin' | 'meme' | 'rituel' | 'encore' | 'places' | 'jours'
  | 'civilite' | 'prenom' | 'recap' | 'confirme' | 'main' | 'clos'
  /* Le conseil (14 octobre 2026) : la liste des questions, puis une réponse. */
  | 'questions' | 'reponse';

type MotifDeLaMain =
  | 'demande' | 'ecarts' | 'prix' | 'media' | 'jour-meme' | 'autre-soin' | 'autre-personne'
  | 'sans-place' | 'plafond' | 'erreur' | 'envoi-refuse' | 'annulation' | 'question' | 'sante';

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
  /** Les rituels offerts au premier choix : « Ajouter un soin » y puise
      ceux qui restent (13 octobre 2026). */
  offerts?: string[][];
  /** Elle ajoute un soin : le prochain choix s'ajoute au panier au lieu
      de le remplacer. */
  enAjout?: boolean;
  /** Les messages de « un autre soin ? » et de sa liste : ils s'ajoutent
      au plafond, choisir trois soins ne mange pas la marge des détours. */
  horsPlafond?: number;
  /** La liste à l'écran est celle des soins (« Autre soin ») : son propre
      « Autre soin » passe la main (13 octobre 2026). */
  dansLesSoins?: boolean;
  /** Les places proposées, pour mémoire. */
  places?: PlaceLibre[];
  date?: string;
  time?: string;
  dureeMin?: number;
  civilite?: CiviliteDuFil;
  prenom?: string;
  /** L'étape du parcours où elle a posé sa question : « Continuer » l'y
      ramène (le conseil, 14 octobre 2026). */
  reprendre?: EtapeDuFil;
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
  /** La main passée par la réception (Claude ou son secours), pas par une
      personne : une envie de réserver la reprend (28 octobre 2026). */
  mainDeLaReception?: boolean;
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

const ETAPES_EN_COURS: readonly EtapeDuFil[] = ['qui', 'besoin', 'meme', 'rituel', 'encore', 'places', 'jours', 'civilite', 'prenom', 'recap', 'questions', 'reponse'];

const ETAPE_DITE: Record<EtapeDuFil, string> = {
  repos: 'au repos',
  qui: 'pour qui',
  besoin: 'le besoin',
  meme: 'la même chose ?',
  rituel: 'le rituel',
  encore: 'un autre soin ?',
  places: "choix de l'heure",
  jours: 'choix du jour',
  civilite: 'la civilité',
  prenom: 'le prénom',
  recap: 'le récapitulatif',
  questions: 'les questions',
  reponse: 'une réponse de la Maison',
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
  sante: 'le cuir chevelu, à regarder',
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
    /* RENDU APRÈS UN RENDEZ-VOUS POSÉ (13 octobre 2026) : l'automate laisse
       la Maison répondre `pauseHeures` après la pose (un « merci », une
       question) ; l'équipe peut le lui rendre, il reprend au repos. Le
       second essai de Yéman est tombé là, sans bouton pour le lever. */
    const rendue = msWa(main?.rendueLe);
    if (Number.isFinite(rendue) && Number.isFinite(maj) && rendue >= maj) return 'repos';
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
  /** Le parcours ouvert par la réception : son mot a déjà salué. */
  deLaReception?: boolean;
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
  /** Une réponse de la Maison (le conseil) : son identifiant, pour la trace
      et les compteurs du Trône. */
  reponseId?: string;
  /** Ses prix viennent du catalogue du jour, par jetons : le juge de la
      Maison les laisse passer, et eux seuls. */
  prixDuCatalogue?: boolean;
  /** Écrit par la réception (Claude, 27 octobre 2026) : la trace dit
      « Assistant Maison », et les compteurs de la réception la lisent. */
  deLaReception?: boolean;
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
function texteSain(t: string, prixPermis = false): string[] {
  const fautes: string[] = [];
  const s = String(t ?? '');
  if (/sal(?:on)/i.test(s)) fautes.push('le mot banni (s-a-l-o-n)');
  if (s.includes(String.fromCharCode(0x2014))) fautes.push('un tiret cadratin');
  /* L'UNITÉ ENTIÈRE, suivie d'autre chose qu'une lettre (relecture du 9
     octobre 2026) : sans le drapeau u, « \b » passait entre le f et le é, et
     « 5 février 2026 » se lisait comme un prix. */
  if (!prixPermis && /\d[\d\s.,]*\s?(fcfa|cfa|xof|francs?|f)(?![\p{L}])/iu.test(s)) fautes.push('un prix');
  return fautes;
}

/* ── 7 bis. LE CONSEIL : LES RÉPONSES DE LA MAISON · 14 octobre 2026 ────
   Maquette « Prendre RDV & Conseil Locks » (MwRLSQ3e…), cinq choix de la
   direction : sans modèle de langue ; les prix comme le site, plus un
   « à partir de » pour une création ; les photos du registre (plus tard) ;
   des brouillons préparés, validés par la direction ; un onglet des
   Conversations.

   CE QUE L'AUTOMATE ENVOIE EST LE TEXTE VALIDÉ, MOT POUR MOT. Il ne
   rédige rien : il reconnaît une question à ses mots, et envoie la réponse
   que la direction a validée. Un brouillon ne part jamais.

   LES PRIX S'ÉCRIVENT EN JETONS, « {prix:sv-koko-ori} » : l'automate les
   remplace par le prix du catalogue du jour. Un prix tapé à la main
   vieillirait le jour où la carte change (le 1er janvier 2027) : le juge le
   refuse. Un jeton introuvable (une prestation retirée, un prix masqué, un
   devis) retient la réponse, et la Maison répond elle-même.

   LE CUIR CHEVELU NE SE SOIGNE PAS À DISTANCE : une démangeaison, une
   plaque, une chute par endroits, et la Maison le dit, propose la
   consultation, nomme le médecin, et passe la main. Aucun produit.

   SANS RÉPONSE VALIDÉE, RIEN NE CHANGE : l'automate se conduit comme avant
   le conseil, mot pour mot (le banc le rejoue). */
type EtatDeLaReponse = 'brouillon' | 'validee';
type ReponseDeLaMaison = {
  id: string;
  /** Le titre de la ligne dans la liste de WhatsApp : 24 signes au plus. */
  titre: string;
  /** La ligne grise sous le titre : 72 signes au plus. */
  description?: string;
  /** Les mots qui la reconnaissent, sans accents ni majuscules. */
  mots: string[];
  /** Ce que la Maison répond, 900 signes au plus, prix en jetons. */
  texte: string;
  etat: EtatDeLaReponse;
  /** Où mène « Réserver » sous la réponse : un parcours, ou le menu. */
  mene?: Besoin;
  ordre: number;
  valideeLe?: string;
  valideePar?: string;
};
type ConseilDeLaMaison = { reponses: ReponseDeLaMaison[]; motsSante: string[] };

/** LES MOTS DU CUIR CHEVELU, quand la direction n'en a pas écrit d'autres. */
const MOTS_SANTE_LIVRES: readonly string[] = [
  'gratte', 'grattent', 'demange', 'demangent', 'demangeaison', 'plaque', 'plaie', 'croute', 'rougeur',
  'chute', 'tombent', 'perds mes cheveux', 'trou', 'teigne', 'saigne', 'douleur', 'douloureux', 'brule',
  'brulure', 'infection', 'pus', 'irrite', 'irritation',
];
const TEXTE_DE_REPONSE_MAX = 900;
const BESOINS_DU_CONSEIL: readonly Besoin[] = ['entretien', 'creation', 'reparation', 'enfant'];
const JETON_DE_PRIX = /\{prix:([^}]{1,80})\}/g;

const echappeWa = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** LE CONSEIL TEL QUE LA BASE LE REND, remis en forme : une réponse sans
    identifiant propre ou en double tombe ; les mots se lisent sans accents. */
function conseilDeLaMaison(brut: unknown): ConseilDeLaMaison {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const reponses: ReponseDeLaMaison[] = [];
  const vus = new Set<string>();
  for (const x of Array.isArray(b.reponses) ? b.reponses : []) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const id = String(r.id ?? '').trim();
    if (!/^[a-z0-9-]{1,60}$/.test(id) || vus.has(id)) continue;
    vus.add(id);
    const description = String(r.description ?? '').trim();
    const mene = BESOINS_DU_CONSEIL.includes(r.mene as Besoin) ? (r.mene as Besoin) : undefined;
    const ordre = Number(r.ordre);
    reponses.push({
      id,
      titre: String(r.titre ?? '').trim(),
      ...(description ? { description } : {}),
      mots: [...new Set((Array.isArray(r.mots) ? r.mots : []).map((m) => sansAccentsWa(String(m ?? ''))).filter((m) => m.length >= 2))].slice(0, 40),
      texte: String(r.texte ?? '').trim(),
      etat: r.etat === 'validee' ? 'validee' : 'brouillon',
      ...(mene ? { mene } : {}),
      ordre: Number.isFinite(ordre) ? ordre : 999,
      ...(typeof r.valideeLe === 'string' ? { valideeLe: r.valideeLe } : {}),
      ...(typeof r.valideePar === 'string' ? { valideePar: r.valideePar } : {}),
    });
  }
  const sante = [...new Set((Array.isArray(b.motsSante) ? b.motsSante : []).map((m) => sansAccentsWa(String(m ?? ''))).filter((m) => m.length >= 3))];
  return { reponses, motsSante: sante.length > 0 ? sante : [...MOTS_SANTE_LIVRES] };
}

/** LE CONSEIL PARLE dès qu'une réponse est validée. Sans elle, l'automate
    se conduit exactement comme avant le conseil. */
const conseilActif = (c: ConseilDeLaMaison | undefined): boolean => !!c && c.reponses.some((r) => r.etat === 'validee');

/** LES PRIX DU CATALOGUE DU JOUR, par identifiant et par code : un prix
    positif, ni masqué, ni sur devis. Les lignes telles que la base les rend. */
function prixDuCatalogue(lignes: readonly { id: string; data?: Record<string, unknown> | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lignes) {
    const d = (l?.data ?? {}) as Record<string, unknown>;
    const p = Math.round(Number(d.priceXof));
    if (!Number.isFinite(p) || p <= 0 || d.hidePrice === true || d.priceMode === 'devis' || d.archived === true) continue;
    out[l.id] = p;
    if (typeof d.code === 'string' && d.code.trim()) out[d.code.trim()] = p;
  }
  return out;
}

/** « 135 000 F » : une espace simple entre les milliers, partout pareil. */
const prixDitWa = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** CE QUI EMPÊCHE UNE RÉPONSE DE PARTIR. Une liste vide = elle peut partir
    (si elle est validée). Sans `prix`, les jetons ne se vérifient pas. */
function fautesDeLaReponse(r: ReponseDeLaMaison, prix?: Readonly<Record<string, number>>): string[] {
  const f: string[] = [];
  if (!r.titre || r.titre.length > 24) f.push('un titre de 1 à 24 signes');
  if (r.description && r.description.length > 72) f.push('une ligne grise de 72 signes au plus');
  if (!r.texte) f.push('le texte de la réponse');
  if (r.texte.length > TEXTE_DE_REPONSE_MAX) f.push(`un texte de ${TEXTE_DE_REPONSE_MAX} signes au plus`);
  if (r.mots.length === 0) f.push('au moins un mot pour la reconnaître');
  const sansJetons = r.texte.replace(JETON_DE_PRIX, '');
  for (const x of texteSain(sansJetons)) f.push(x === 'un prix' ? 'un prix écrit à la main (insérez-le depuis le catalogue)' : x);
  if (/[{}]/.test(sansJetons)) f.push('une accolade qui n’est pas un prix');
  if (prix) {
    for (const m of r.texte.matchAll(JETON_DE_PRIX)) {
      const ref = m[1].trim();
      if (!((prix[ref] ?? 0) > 0)) f.push(`un prix introuvable au catalogue (${ref})`);
    }
  }
  return f;
}

/** LE TEXTE QUI PART : validée, sans faute, chaque jeton remplacé par le prix
    du jour. `null` sinon : elle ne part pas. */
function texteDeLaReponse(r: ReponseDeLaMaison, prix?: Readonly<Record<string, number>>): string | null {
  if (r.etat !== 'validee') return null;
  const aDesJetons = /\{prix:/.test(r.texte);
  if (aDesJetons && !prix) return null;
  if (fautesDeLaReponse(r, prix).length > 0) return null;
  return r.texte.replace(JETON_DE_PRIX, (_t, ref: string) => prixDitWa((prix ?? {})[ref.trim()] ?? 0));
}

/** LES RÉPONSES QUI PEUVENT PARTIR, dans l'ordre de la direction. */
function reponsesEnvoyables(
  conseil: ConseilDeLaMaison | undefined, prix: Readonly<Record<string, number>> | undefined,
): { r: ReponseDeLaMaison; texte: string }[] {
  const out: { r: ReponseDeLaMaison; texte: string }[] = [];
  for (const r of conseil?.reponses ?? []) {
    const texte = texteDeLaReponse(r, prix);
    if (texte) out.push({ r, texte });
  }
  return out.sort((a, b) => a.r.ordre - b.r.ordre || a.r.titre.localeCompare(b.r.titre, 'fr'));
}

/** CE QUE LE CONSEIL LIT DANS UN TEXTE : le cuir chevelu, et les réponses
    validées dont elle a dit le plus de mots (toutes, à égalité). Un mot se
    lit entier, au pluriel aussi (« plaques », « cheveux »). */
function lisLeConseil(texte: string, conseil: ConseilDeLaMaison | undefined): { sante: boolean; ids: string[] } {
  if (!conseilActif(conseil)) return { sante: false, ids: [] };
  const t = ` ${sansAccentsWa(texte).replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ')} `;
  const dit = (mot: string): boolean => new RegExp(`(^|[^a-z0-9])${echappeWa(mot)}(s|x)?(?=[^a-z0-9]|$)`).test(t);
  const sante = conseil!.motsSante.some(dit);
  const scores = conseil!.reponses
    .filter((r) => r.etat === 'validee')
    .map((r) => ({ id: r.id, n: r.mots.filter(dit).length }))
    .filter((x) => x.n > 0);
  const max = scores.reduce((m, x) => Math.max(m, x.n), 0);
  return { sante, ids: max > 0 ? scores.filter((x) => x.n === max).map((x) => x.id) : [] };
}

/** LE CONSEIL A-T-IL QUELQUE CHOSE À DIRE à ce texte ? */
const leConseilParle = (texte: string, conseil: ConseilDeLaMaison | undefined): boolean => {
  const lu = lisLeConseil(texte, conseil);
  return lu.sante || lu.ids.length > 0;
};

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
  /** Les réponses de la Maison (`mnd_reponses_maison`, le conseil). */
  conseil?: ConseilDeLaMaison;
};

type ContexteDuTour = ContexteLeger & {
  /** `carte` : le lien Google Maps de la branche ou des Paramètres. */
  maison: { nom: string; itineraire?: string; carte?: string };
  agenda?: AgendaDuTour;
  /** Les prix du catalogue du jour (`prixDuCatalogue`), pour les jetons du conseil. */
  prix?: Readonly<Record<string, number>>;
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
/** LES MESSAGES QUI COMPTENT POUR LE PLAFOND : ceux des dernières 24
    heures, depuis que l'équipe a rendu le fil (13 octobre 2026). Sans quoi
    un fil rendu après un plafond ou après une pose se taisait aussitôt. */
function envoisQuiComptent(envois: readonly string[], main: MainDuFil | null | undefined, ms: number): number {
  const rendue = msWa(main?.rendueLe);
  return envois.filter((e) => {
    const t = msWa(e);
    return ms - t < JOUR_WA && !(Number.isFinite(rendue) && t <= rendue);
  }).length;
}

/** LE PLAFOND DU FIL : dix messages, plus ceux de « un autre soin ? », de
    sa liste et de la liste des soins (six au plus, 13 octobre 2026). */
function plafondDuFil(etat: EtatDuFil | null | undefined): number {
  return PLAFOND_DE_L_AUTOMATE + Math.min(6, Math.max(0, etat?.panier?.horsPlafond ?? 0));
}

/** L'ÉTAPE DU TOUR (28 octobre 2026). Sur un « bonjour », la réception
    avait passé la main à l'équipe, la Maison fermée ; « Je veux un RDV » puis
    « Pour le jeudi à 9h » sont restés sans réponse (essai de Yéman, 0 h 42).
    Une main passée par la réception n'arrête pas une réservation : une envie
    de réserver rouvre le parcours. Celle qu'une personne a prise (la pause)
    tient toujours, et celle de l'automate aussi. */
function etapeDuTour(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente | null, main: MainDuFil | null | undefined, maintenantMs: number, pauseHeures: number,
): EtapeDuFil {
  const courante = etapeCourante(etat, main, maintenantMs, pauseHeures);
  if (courante === 'main' && etat?.mainDeLaReception && tour && intentionDeReserver(tour.texte)) return 'repos';
  return courante;
}

function jugeLaParole(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger,
): { parole: ParoleDuTour; motif?: MotifDeLaMain } {
  const ms = ctx.maintenantMs;
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return { parole: 'silence' };
  if (pauseActive(ctx.main, ms)) return { parole: 'silence' };
  if (tour.waIds.length === 0) return { parole: 'silence' };
  const quand = msWa(tour.quand);
  if (Number.isFinite(quand) && ms - quand > TOUR_PERIME_MS) return { parole: 'silence' };
  const courante = etapeDuTour(etat, tour, ctx.main, ms, ctx.reglage.pauseHeures);
  if (courante === 'main' || courante === 'confirme') return { parole: 'silence' };
  const mots = motsReconnus(tour.texte, ms);
  const fiches = fichesServies(ctx);
  let parle = false;
  if (ETAPES_EN_COURS.includes(courante)) {
    if (tour.media) return { parole: 'main-silencieuse', motif: 'media' };
    /* Une question de prix en plein parcours : la réponse validée si le
       conseil en a une, sinon la main passe, comme avant (14 octobre 2026). */
    if (mots.prix && !leConseilParle(tour.texte, ctx.conseil)) return { parole: 'main-silencieuse', motif: 'prix' };
    parle = true;
  } else if (tour.choix && lisLeChoix(tour.choix.id)) {
    /* Un calibre touché dans la liste de la réception (27 octobre 2026) :
       c'est à elle de répondre, avec le prix de ce calibre. */
    parle = lisLeChoix(tour.choix.id)?.geste !== 'calibre';
  } else if (tour.media || mots.retard) {
    parle = false;
    /* LA RÈGLE DES SEPT JOURS EST LEVÉE · 14 octobre 2026, décision de la
       direction : « I need the automation to take the lead all the time ».
       Un rappel, une reprise, une confirmation ou un message de l'équipe ne
       font plus taire l'automate une semaine. Ce qui reste : la main de
       l'équipe quand une personne écrit (la pause, `pauseHeures`), un
       rendez-vous qu'elle a déjà, et les questions qu'il ne sait pas. */
  } else if (mots.deplacer || mots.annuler) {
    /* Un prix dans la même phrase : la Maison le lit elle-même, comme avant. */
    parle = !mots.prix;
  } else if (renvoieAUnRdv(tour.texte)) {
    /* ELLE PARLE D'UN RENDEZ-VOUS QU'ELLE A DÉJÀ (« je confirme », « à quelle
       heure ? ») : l'automate ne sait ni le confirmer ni le déplacer, la
       Maison répond elle-même. Depuis le 14 octobre 2026 (« le faire
       répondre »), il répond si le conseil reconnaît une question dans son
       message ; et un rendez-vous à venir sur sa fiche ne le fait plus
       taire : elle peut en réserver un autre. */
    parle = leConseilParle(tour.texte, ctx.conseil);
  } else if (leConseilParle(tour.texte, ctx.conseil)) {
    /* LE CONSEIL (14 octobre 2026) : une question qu'une réponse validée
       reconnaît, ou le cuir chevelu qui inquiète. */
    parle = true;
  } else if (mots.prix) {
    parle = false;
  } else if (uneQuestionAutre(tour.texte, ms)) {
    /* Une question que la Maison n'a pas écrite : avec le conseil, la nuit,
       un accusé (« la Maison vous répond demain dès 9 h ») ; le jour, la
       Maison la lit elle-même, comme avant. */
    parle = conseilActif(ctx.conseil);
  } else if (intentionDeReserver(tour.texte)) {
    parle = true;
  } else if (ctx.premierMessage && fiches.length === 0) {
    parle = true;
  }
  if (!parle) return { parole: 'silence' };
  const envois = envoisQuiComptent(etat?.envois ?? [], ctx.main, ms);
  if (envois >= plafondDuFil(etat) && !confirmeValide(etat, tour, courante)) return { parole: 'main-silencieuse', motif: 'plafond' };
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

/* ── 9 bis. LES GESTES DITS EN FRANÇAIS : le dictionnaire, la marque et le
   geste en toutes lettres vivent dans `gestes-en-francais.ts` (13 octobre
   2026), partagés avec le site. */
/** Le titre d'une ligne de liste, dans `place` signes (24, ou moins devant
    « + 1 ») : « Resserrage · Essentiel », sinon « Resserrage Essentiel »,
    sinon le geste seul, « Hydratation ». Jamais de mot coupé quand le geste
    tient. Sans mot français, le nom du catalogue. */
const titreEnFrancaisWa = (nom: string, place = 24): string => {
  const { marque, variante, sansNiveau } = litLaMarqueWa(nom);
  const g = GESTES_EN_FRANCAIS[marque];
  if (!g) return coupeWa(nom, place);
  const v = variante.toLowerCase();
  const repete = !v || v === g.court.toLowerCase() || v === g.long.toLowerCase()
    || (sansNiveau && (v.includes(g.court.toLowerCase()) || v.includes(g.long.toLowerCase())));
  /* Un sous-titre (« VÍVÍVÓ™ · Le Vivifiant ») ne se colle pas au geste
     sans point : « Activateur Le Vivifiant » ne se lit pas. */
  const essais = repete ? [g.long, g.court]
    : sansNiveau ? [`${g.court} · ${variante}`, g.long, g.court]
      : [`${g.court} · ${variante}`, `${g.court} ${variante}`, g.long, g.court];
  return essais.find((x) => x.length <= place) ?? coupeWa(g.court, place);
};

const gestesDitsEnFrancaisWa = (noms: readonly string[]): string => gestesDitsWa(noms.map(gesteDitEnFrancaisWa));

/** LE LIEN GOOGLE MAPS DE LA MAISON (13 octobre 2026) : « rajoute le lien de
    Google Maps sur l'itinéraire qu'on envoie aux clients » (Yéman). Le
    premier lien valable des candidats : celui de la branche (Système ›
    Branches, `mapsUrl`), puis celui des Paramètres (`mapsLink`). Seul un lien
    https de Google Maps passe ; le paramètre de partage `g_st` est ôté, rien
    d'autre n'est réécrit. Aucun : chaîne vide. */
function lienMapsWa(...candidats: unknown[]): string {
  const google = /^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.(?:com|[a-z]{2}|com?\.[a-z]{2})\/maps|maps\.google\.(?:com|[a-z]{2}|com?\.[a-z]{2}))(?:[/?#]|$)/i;
  for (const c of candidats) {
    const brut = String(c ?? '').trim();
    if (!google.test(brut)) continue;
    try {
      const u = new URL(brut);
      if (!u.searchParams.has('g_st')) return brut;
      u.searchParams.delete('g_st');
      return u.toString();
    } catch { continue; }
  }
  return '';
}

/** UN APPEL VIDE NE LAISSE PAS DE TRACE (13 octobre 2026). */
const sansAppelVide = (t: string): string => t
  .replace(/ +,/g, ',')
  .replace(/,(?:\s*,)+/g, ',')
  .replace(/,[ \t]*([?!:;])/g, ' $1')
  .replace(/,[ \t]*\./g, '.')
  .replace(/ {2,}/g, ' ');

/** La ligne du lien, telle que la cliente la lit. */
const ligneGoogleMapsWa = (lien: string): string => (lien ? `Itinéraire sur Google Maps : ${lien}` : '');

/** La consultation nommée dans une phrase : « la consultation Origine
    (KÒKÒ™ Origine) » ; sans mot français, « le Conseil et diagnostic ». */
const laConsultationDiteWa = (nom: string): string => {
  const { marque, variante } = litLaMarqueWa(nom);
  const g = GESTES_EN_FRANCAIS[marque];
  return g ? `la ${g.long.toLowerCase()}${variante ? ` ${variante}` : ''} (${nom})` : `le ${nom}`;
};

/** La durée, dite : 45 → « 45 min », 60 → « 1 h », 105 → « 1 h 45 ». */
const dureeDiteWa = (min: number): string => {
  const n = Math.max(0, Math.round(Number(min) || 0));
  if (!n) return '';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
};

/** PLUSIEURS SOINS LE MÊME JOUR (13 octobre 2026) : après un rituel
    choisi, « Souhaitez-vous ajouter un autre soin ? », trois soins au plus
    dans un rendez-vous. */
const SOINS_PAR_RENDEZ_VOUS = 3;

/** Les marques des soins du cheveu, dans l'ordre où la liste les montre. */
const MARQUES_DES_SOINS: readonly string[] = ['DÀNDÀN', 'VÍVÍVÓ', 'WÈWÈ', 'GBÌGBÌ'];

/* ── 10. L'ATELIER DU TOUR ──────────────────────────────────────────────
   Toutes les étapes se fabriquent ici, autour d'un état de travail `base`.
   `etapeSuivante` y joue un tour ; `suiteDeLaPose` y dit le verdict du
   verrou, sans faire monter la version (une seule écriture par tour). */
function atelierDuTour(ancien: EtatDuFil | null | undefined, tour: TourDeLaCliente | null, ctx: ContexteDuTour, memeVersion: boolean, reprise = false) {
  const ms = ctx.maintenantMs;
  const maintenant = isoWa(ms);
  const pauseH = ctx.reglage.pauseHeures;
  const aujourdhui = instantACotonou(ms).iso;
  const courante = tour || reprise ? etapeDuTour(ancien, tour, ctx.main, ms, pauseH) : (ancien?.etape ?? 'repos');
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
    /* PERSONNE DE CONNU (13 octobre 2026) : ni fiche ni civilité choisie. On
       ne suppose plus Madame : la phrase se dit sans appel (`sansAppelVide`). */
    return '';
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
  /** Sans appel, la phrase ne garde pas de trace : « Quel rituel souhaitez-vous,
      ? » devient « Quel rituel souhaitez-vous ? », « Bonjour , bienvenue »
      devient « Bonjour, bienvenue ». Une phrase avec un appel ne change pas. */
  const propre = (corps: string): string => (appel() ? corps : sansAppelVide(corps));
  const texte = (etape: EtapeDuFil, corps: string): MessageSortant => ({ forme: 'texte', etape, corps: propre(corps) });
  const boutons = (etape: EtapeDuFil, corps: string, liste: { id: string; titre: string }[]): MessageSortant =>
    ({ forme: 'boutons', etape, corps: propre(corps), pied: PIED, boutons: [...liste, sortieMaison].slice(0, 3) });
  const liste = (etape: EtapeDuFil, corps: string, bouton: string, lignes: { id: string; titre: string; description?: string }[]): MessageSortant =>
    ({ forme: 'liste', etape, corps: propre(corps), pied: PIED, bouton, lignes: [...lignes.slice(0, 9), sortieMaison] });
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
  const laMain = (motif: MotifDeLaMain, dire: boolean, corps?: string, parLaReception = false): SortieDuTour => {
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
    base.mainDeLaReception = parLaReception || undefined;
    const messages = dire ? [texte('main', corps ?? laMainDite())] : [];
    return sortie(messages, alerteDeLAutomate({ genre: 'main', prenom: prenomPourAlerte(), numero: ctx.numero, motif }));
  };
  const dire = (m: MessageSortant | null, motifSiRien: MotifDeLaMain = 'sans-place'): SortieDuTour =>
    (m ? sortie([m]) : laMain(motifSiRien, true));
  /** Ce tour n'est pas pour lui : rien ne s'écrit, la Maison le lit. */
  const silence = (): SortieDuTour => ({ messages: [], etat: ancien ?? base, ecritures: [], pris: false });

  /* ── Le conseil (14 octobre 2026) ── */
  const envoyables = (): { r: ReponseDeLaMaison; texte: string }[] => reponsesEnvoyables(ctx.conseil, ctx.prix);
  /** L'étape où « Continuer » la ramène : un parcours commencé, jamais le
      menu (de là, « Réserver » suit la réponse), ni le conseil lui-même. */
  const retiensOuReprendre = (): void => {
    if (base.etape === 'questions' || base.etape === 'reponse') return;
    base.panier.reprendre = ETAPES_EN_COURS.includes(base.etape) && base.etape !== 'besoin' ? base.etape : undefined;
  };
  const salutDuConseil = (avecSalut: boolean): string =>
    (avecSalut ? `${salut()} ${appel()}, bienvenue à la ${maisonNomWa}.\n\n` : '');
  const msgQuestions = (page: number, choisies?: readonly { r: ReponseDeLaMaison; texte: string }[], avecSalut = false): MessageSortant | null => {
    const toutes = choisies ?? envoyables();
    if (toutes.length === 0) return null;
    retiensOuReprendre();
    passe('questions');
    const par = toutes.length > 9 ? 8 : 9;
    const p = Math.max(0, Math.floor(page) || 0);
    const debut = p * par < toutes.length ? p * par : 0;
    const tranche = toutes.slice(debut, debut + par);
    const plus = !choisies && debut + par < toutes.length;
    const corps = choisies
      ? `Votre message touche plusieurs sujets, ${appel()}. Lequel voulez-vous lire ?`
      : `Voici les questions qu'on nous pose le plus, ${appel()}. Touchez la vôtre.`;
    return liste('questions', `${salutDuConseil(avecSalut)}${corps}`, 'Les questions', [
      ...tranche.map((e) => ({ id: choix('reponse', e.r.id), titre: e.r.titre, ...(e.r.description ? { description: e.r.description } : {}) })),
      ...(plus ? [{ id: choix('plus', String(p + 1)), titre: 'Plus de questions' }] : []),
    ]);
  };
  const msgReponse = (e: { r: ReponseDeLaMaison; texte: string }, avecSalut: boolean): MessageSortant => {
    retiensOuReprendre();
    passe('reponse');
    const suite = base.panier.reprendre
      ? [{ id: choix('reprendre'), titre: 'Continuer' }, { id: choix('questions'), titre: 'Une autre question' }]
      : [{ id: choix('reserver', e.r.mene), titre: 'Réserver' }, { id: choix('questions'), titre: 'Une autre question' }];
    return { ...boutons('reponse', `${salutDuConseil(avecSalut)}${e.texte}`, suite), reponseId: e.r.id, prixDuCatalogue: true };
  };
  /** LE CONSEIL RÉPOND À SON TEXTE, ou `null` s'il n'a rien à dire. */
  const questionDuTour = (texteDuTour: string, avecSalut: boolean): SortieDuTour | null => {
    const lu = lisLeConseil(texteDuTour, ctx.conseil);
    if (lu.sante) {
      const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
      const qui = quand === null ? 'Une personne de la Maison vous répond ici.' : `La Maison vous répond ${quand}.`;
      return laMain('sante', true, `Merci de nous le dire, ${appel()}. Ce que vous décrivez se regarde de près : la Maison ne conseille pas de soin à distance. ${qui} Si la gêne est forte ou s'étend, un médecin ou un dermatologue saura vous examiner.`);
    }
    if (lu.ids.length === 0) return null;
    const trouvees = envoyables().filter((e) => lu.ids.includes(e.r.id));
    if (trouvees.length === 1) return dire(msgReponse(trouvees[0], avecSalut));
    if (trouvees.length > 1) return dire(msgQuestions(0, trouvees, avecSalut), 'question');
    /* Reconnue, mais elle ne peut pas partir (un prix introuvable au
       catalogue du jour) : la Maison répond elle-même. */
    return laMain('question', true);
  };

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
      ...(envoyables().length > 0 ? [{ id: choix('questions'), titre: 'Une question ?' }] : []),
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
    const gestes = gestesDitsEnFrancaisWa(nomsDe(v.serviceIds));
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
    if (noms.length <= 1) return titreEnFrancaisWa(noms[0] ?? '');
    const suite = ` + ${noms.length - 1}`;
    return `${titreEnFrancaisWa(noms[0], 24 - suite.length)}${suite}`;
  };
  /** Sous le titre : la marque fon et la durée RÉSERVÉE (une heure au
      moins, comme l'agenda), « SÍNSIN™ Essentiel · 1 h ». Les noms se
      coupent, la durée reste (revue du 13 octobre 2026). */
  const descriptionDesGestes = (ids: readonly string[]): string => {
    const duree = dureeDiteWa(dureeDesPrestations(ids, agenda?.prestations ?? []));
    const suite = duree ? ` · ${duree}` : '';
    return `${coupeWa(gestesDitsWa(nomsDe(ids)), 72 - suite.length)}${suite}`;
  };

  /** LES SOINS DU CHEVEU (13 octobre 2026) : « dans Autre soin j'aimerais
      les soins DÀNDÀN, VÍVÍVÓ… » (Yéman). Ceux qui se réservent ici,
      reconnus à leur marque, sans les versions Kids ni « avec votre
      produit » ; en ajout, jamais un soin déjà pris ni au-delà de trois. */
  const soinsDuCheveu = (): string[][] => {
    const pris = base.panier.enAjout ? (base.panier.serviceIds ?? []) : [];
    if (pris.length >= SOINS_PAR_RENDEZ_VOUS) return [];
    const rang = (s: PrestationDuTour): number => MARQUES_DES_SOINS.indexOf(litLaMarqueWa(s.name).marque);
    return (agenda?.prestations ?? [])
      .filter((s) => directe(s) && rang(s) >= 0 && !pris.includes(s.id) && !/\bkids\b|avec votre produit/i.test(s.name))
      .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, 8).map((s) => [s.id]);
  };
  /** LA CONSULTATION DE RÉPARATION, à ajouter le même jour (13 octobre
      2026, « entretenir ET réparer ») : celle que la Maison a désignée
      pour la réparation, jamais une autre devinée. */
  const reparationAAjouter = (): string | null => {
    const id = agenda?.consultationParParcours?.reparation;
    const pris = base.panier.serviceIds ?? [];
    if (!id || pris.includes(id) || pris.length >= SOINS_PAR_RENDEZ_VOUS) return null;
    return reservableWa(prestation(id)) ? id : null;
  };

  const sontDesConsultations = (offres: readonly string[][]): boolean =>
    offres.length > 0 && offres.every((ids) => ids.length === 1 && !!prestation(ids[0]) && estUneConsultation(prestation(ids[0])!, cats));

  const msgRituel = (relance: boolean, offres: string[][], ajout = false, soins = false): MessageSortant | null => {
    const valables = offres.filter((ids) => ids.length > 0 && ids.every((id) => reservableWa(prestation(id)))).slice(0, 8);
    if (valables.length === 0) return null;
    passe('rituel');
    base.panier.rituels = valables.map((ids) => [...ids]);
    if (!ajout && !soins) base.panier.offerts = valables.map((ids) => [...ids]);
    base.panier.enAjout = ajout;
    base.panier.dansLesSoins = soins;
    if ((ajout || soins) && !relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    const consultations = sontDesConsultations(valables);
    const corps = relance ? relanceDite()
      : ajout ? `Quel soin ajouter, ${appel()} ?`
        : soins ? `Quel soin souhaitez-vous, ${appel()} ?`
          : consultations ? `Quelle consultation souhaitez-vous, ${appel()} ?` : `Quel rituel souhaitez-vous, ${appel()} ?`;
    const reparation = agenda?.consultationParParcours?.reparation;
    /* « Autre soin » ouvre la liste des soins, s'il y en a et qu'on n'y est
       pas déjà ; sinon il passe la main, comme avant. */
    const desSoins = !soins && soinsDuCheveu().length > 0;
    const quels = [...new Set(soinsDuCheveu().map((ids) => GESTES_EN_FRANCAIS[litLaMarqueWa(prestation(ids[0])?.name ?? '').marque]?.long ?? '').filter(Boolean))];
    return liste('rituel', corps, 'Choisir', [
      ...valables.map((ids, i) => (ids.length === 1 && ids[0] === reparation && ajout
        ? { id: choix('rituel', String(i)), titre: 'Réparer mes locks', description: coupeWa(`consultation d'abord · ${descriptionDesGestes(ids)}`, 72) }
        : { id: choix('rituel', String(i)), titre: titreDesGestes(ids), description: descriptionDesGestes(ids) })),
      ...(consultations ? [] : [{ id: choix('autre-soin'), titre: 'Autre soin',
        description: desSoins ? coupeWa(gestesDitsWa(quels), 72) : 'une personne de la Maison vous répond' }]),
    ]);
  };

  /** LES SOINS QU'ELLE PEUT ENCORE AJOUTER : les offres du premier choix,
      moins ce qu'elle a déjà pris (une formule dont elle a pris un geste
      offre le reste), sans dépasser trois soins, sans doublon. */
  const soinsAAjouter = (): string[][] => {
    const pris = base.panier.serviceIds ?? [];
    const vus = new Set<string>();
    return (base.panier.offerts ?? [])
      .map((ids) => ids.filter((id) => !pris.includes(id)))
      .filter((ids) => ids.length > 0 && pris.length + ids.length <= SOINS_PAR_RENDEZ_VOUS && ids.every((id) => directe(prestation(id))))
      .filter((ids) => { const cle = [...ids].sort().join('+'); if (vus.has(cle)) return false; vus.add(cle); return true; });
  };

  const msgEncore = (relance: boolean): MessageSortant => {
    passe('encore');
    if (!relance) base.panier.horsPlafond = (base.panier.horsPlafond ?? 0) + 1;
    return boutons('encore', relance ? relanceDite() : `Souhaitez-vous ajouter un autre soin le même jour, ${appel()} ?`, [
      { id: choix('encore'), titre: 'Ajouter un soin' },
      { id: choix('suffit'), titre: "Non, c'est tout" },
    ]);
  };

  /** Un rituel choisi : un autre soin ? Trois soins, ou plus rien à
      ajouter : droit aux places. */
  const apresLeRituel = (): SortieDuTour =>
    ((base.panier.serviceIds ?? []).length >= SOINS_PAR_RENDEZ_VOUS || aAjouter().length === 0 ? dire(msgPlaces({})) : dire(msgEncore(false)));

  /** CE QU'ELLE PEUT AJOUTER : les formules qui restent, puis la consultation
      de réparation ; à défaut, les soins du cheveu (13 octobre 2026). */
  const aAjouter = (): string[][] => {
    const r = reparationAAjouter();
    const liste = [...soinsAAjouter(), ...(r ? [[r]] : [])];
    return liste.length > 0 ? liste : soinsDuCheveu();
  };

  /** « Ajouter un soin » : la liste de ce qui reste ; plus rien, les places. */
  const ajouteUnSoin = (relance: boolean): SortieDuTour =>
    dire(msgRituel(relance, aAjouter(), true) ?? msgPlaces({}));

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
      : `Et votre prénom, ${civ} ? Écrivez-le simplement dans un message, en réponse.`, []);
  };

  const quandDuPanier = (): string =>
    `${jourDitAvecAnnee(base.panier.date ?? '')} à ${heureDite(base.panier.time ?? '')}${cotonou}`;

  const msgRecap = (relance: boolean): MessageSortant | null => {
    const p = base.panier;
    if (!p.date || !p.time || !p.serviceIds?.length) return null;
    passe('recap');
    const gestes = gestesDitsEnFrancaisWa(nomsDe(p.serviceIds));
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
      case 'rituel': return base.panier.dansLesSoins
        ? dire(msgRituel(relance, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}))
        : base.panier.enAjout
        ? ajouteUnSoin(relance)
        : dire(msgRituel(relance, base.panier.rituels ?? []), 'autre-soin');
      case 'encore': return dire(msgEncore(relance));
      case 'places': return dire(msgPlaces({ relance }));
      case 'jours': return dire(msgJours(relance));
      case 'civilite': return dire(msgCivilite(relance));
      case 'prenom': return dire(msgPrenom(relance));
      case 'recap': return dire(msgRecap(relance) ?? msgPlaces({}));
      case 'questions':
      case 'reponse': return dire(msgQuestions(0), 'question');
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
    base.mainDeLaReception = undefined;
    base.etapeAvantLaMain = undefined;
    base.versionAvantLaMain = undefined;
    /* Ouvert par la réception, dont le mot précède : il a déjà salué. */
    const salue = !tour?.deLaReception;
    if (fiches.length === 0) return dire(msgBesoin(false, salue));
    if (fiches.length === 1 && titulaire) return pourLaFiche(titulaire, salue);
    return dire(msgQui(false, salue));
  };

  const introDeLaConsultation = (b: Besoin, nom: string): string => {
    if (base.panier.pourQui) return `Cela commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Voici les prochaines places.`;
    if (b === 'creation') return `Une première couronne commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Nous y étudions votre texture et votre cuir chevelu, et choisissons ensemble votre calibre. Voici les prochaines places.`;
    if (b === 'reparation') return `Une réparation commence toujours par une consultation, ${appel()} : ${laConsultationDiteWa(nom)}. Nous y regardons vos locks et décidons ensemble du soin. Voici les prochaines places.`;
    return `Pour un enfant, tout commence par un échange avec ses parents, ${appel()} : ${laConsultationDiteWa(nom)}. Voici les prochaines places.`;
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
        ligneGoogleMapsWa(lienMapsWa(ctx.maison.carte)),
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
    if (envoisQuiComptent(base.envois, ctx.main, ms) >= plafondDuFil(base) && !confirme) return laMain('plafond', false);
    if (enCours && t.media) return laMain('media', false);
    if (enCours && mots.prix && !ch) {
      /* Le conseil a peut-être la réponse (14 octobre 2026). */
      const q = questionDuTour(t.texte, false);
      if (q) return q;
      return laMain('prix', false);
    }
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
    if (!enCours) {
      /* LE CONSEIL AU REPOS (14 octobre 2026) : une question qu'il reconnaît,
         le cuir chevelu, ou, la nuit, une question qu'il ne sait pas. */
      if (!ch && conseilActif(ctx.conseil)) {
        const neuve = ctx.premierMessage && fiches.length === 0;
        const q = questionDuTour(t.texte, neuve);
        if (q) {
          /* Un parcours neuf : rien de l'ancien panier ne suit la réponse. */
          base.panier = {};
          base.prisLe = maintenant;
          base.rdvId = undefined;
          return q;
        }
        if (uneQuestionAutre(t.texte, ms) && !intentionDeReserver(t.texte)) {
          const quand = prochaineOuvertureDite(ms, agenda?.semaine ?? [], agenda?.exceptions ?? []);
          if (quand === null) return silence();
          base.prisLe = maintenant;
          return laMain('question', true);
        }
      }
      return accueil(mots);
    }
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
          if (g === 'questions') return dire(msgQuestions(0), 'question');
          break;
        case 'questions': {
          if (g === 'reponse') {
            const e = envoyables().find((x) => x.r.id === arg);
            if (e) return dire(msgReponse(e, false));
            return laMain('question', true);
          }
          if (g === 'plus') return dire(msgQuestions(Number(arg) || 0), 'question');
          break;
        }
        case 'reponse': {
          if (g === 'questions') return dire(msgQuestions(0), 'question');
          if (g === 'reserver') {
            base.panier.reprendre = undefined;
            if (arg === 'entretien' || arg === 'creation' || arg === 'reparation' || arg === 'enfant') return choisisLeBesoin(arg);
            return dire(msgBesoin(false, false));
          }
          if (g === 'reprendre') {
            const e = base.panier.reprendre;
            base.panier.reprendre = undefined;
            if (e && ETAPES_EN_COURS.includes(e) && e !== 'questions' && e !== 'reponse') {
              passe(e);
              return renvoie(e, false);
            }
            return dire(msgBesoin(false, false));
          }
          break;
        }
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
            const deja = base.panier.enAjout ? (base.panier.serviceIds ?? []) : [];
            base.panier.serviceIds = [...deja, ...ids.filter((id) => !deja.includes(id))];
            const ajoutee = !!base.panier.enAjout;
            base.panier.enAjout = false;
            base.panier.dansLesSoins = false;
            const unique = ids.length === 1 ? prestation(ids[0]) : undefined;
            const consultation = unique && estUneConsultation(unique, cats);
            if (consultation && !ajoutee) return dire(msgPlaces(base.panier.besoin ? { intro: introDeLaConsultation(base.panier.besoin, unique.name) } : {}));
            return apresLeRituel();
          }
          if (g === 'autre-soin') {
            /* Depuis une liste de rituels : les soins du cheveu ; depuis la
               liste des soins elle-même : une personne de la Maison. */
            if (!base.panier.dansLesSoins && soinsDuCheveu().length > 0) return dire(msgRituel(false, soinsDuCheveu(), !!base.panier.enAjout, true) ?? msgPlaces({}));
            return laMain('autre-soin', true);
          }
          break;
        }
        case 'encore': {
          if (g === 'encore') return ajouteUnSoin(false);
          if (g === 'suffit') return dire(msgPlaces({}));
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

    /* LE CONSEIL D'ABORD (14 octobre 2026) : une question qu'une réponse
       validée reconnaît, ou le cuir chevelu, en plein parcours aussi. */
    const qDuTour = questionDuTour(t.texte, false);
    if (qDuTour) return qDuTour;
    /* Après une réponse, ou devant la liste : une envie de réserver ouvre le
       parcours ; le reste (« merci », une autre phrase), la Maison le lit. */
    if (base.etape === 'questions' || base.etape === 'reponse') {
      if (intentionDeReserver(t.texte) || mots.jourVoulu || mots.moment) return accueil(mots);
      return silence();
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
      case 'encore': {
        /* ÉCRIT AU LIEU D'ÊTRE TOUCHÉ (13 octobre 2026) : « Merci, c'est
           tout », « Non merci, plutôt samedi matin » (le jour se garde),
           « Oui », « Je voudrais aussi un resserrage ». */
        const mot = sansAccentsWa(t.texte);
        if (/\b(non|nan)\b|c'est tout|c'est bon|ca suffit|ca ira|rien d'autre|pas d'autre|pas besoin|\bsuffit\b/.test(mot)) {
          if (desMots) retiensLesMots();
          return dire(msgPlaces({}));
        }
        if (/^(oui|ouais)\b|\b(ajout\w*|rajout\w*|aussi|encore|un autre|une autre|un deuxieme|un second|en plus)\b/.test(mot)) return ajouteUnSoin(false);
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

  /** La reprise : l'étape où il en était, dite à neuf (pas la relance). */
  const reprend = (): SortieDuTour => renvoie(base.etape, false);

  /* LA RÉCEPTION (27 octobre 2026) : Claude a répondu là où l'automate se
     taisait. Son message part tel qu'il l'a écrit (la fonction de réception
     l'a jugé : la voix, les seuls montants du catalogue, ni numéro ni le mot
     banni) ; le fil se dit « clos », répondu : l'alarme se tait, et le mot
     suivant repasse par le juge. « equipe » : la main passe, l'équipe est
     prévenue, et son message dit qui prend le relais. */
  const laReception = (r: ReponseDeLaReception): SortieDuTour => {
    const signe = (m: MessageSortant): MessageSortant => ({ ...m, deLaReception: true, prixDuCatalogue: true });
    if (r.suite === 'equipe') {
      const s = laMain('question', true, r.texte, true);
      return { ...s, messages: s.messages.map((m) => signe({ ...m, corps: r.texte })) };
    }
    passe('clos');
    if (r.suite === 'calibre' && r.lignes && r.lignes.length > 0) {
      /* Les calibres portent un identifiant de la Maison (« MND:… »), sans quoi leur toucher n'arriverait pas jusqu'ici. */
      const lignes = r.lignes.slice(0, 9).map((l) => ({ ...l, id: l.id.startsWith('calibre:') ? choix('calibre', l.id.slice('calibre:'.length)) : l.id }));
      return sortie([signe({ forme: 'liste', etape: 'clos', corps: r.texte, pied: PIED, bouton: 'Choisir mon calibre', lignes: [...lignes, sortieMaison] })]);
    }
    return sortie([signe({ forme: 'texte', etape: 'clos', corps: r.texte })]);
  };

  return { base, joue, laMain, ditLeVerdict, reprend, laReception };
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
/** LA REPRISE TOUT DE SUITE (13 octobre 2026) : « quand je débloque en
    rendant à l'automate, pourquoi ne prend-il pas immédiatement la
    relève ? » (Yéman). L'équipe vient de lui rendre le fil : il renvoie
    l'étape où il s'était arrêté, sans attendre un message d'elle. Rien ne
    part si rien n'est en cours (repos, rendez-vous posé, parcours
    périmé), si la main de l'équipe tient encore, ou si le numéro n'est pas
    servi. La fenêtre de 24 heures se juge dans la fonction. */
function repriseDuFil(ancien: EtatDuFil | null | undefined, ctx: ContexteDuTour): SortieDuTour {
  const rien = (etat: EtatDuFil): SortieDuTour => ({ messages: [], etat, ecritures: [], pris: false });
  if (!ancien) return rien(etatNeufDuFil(ctx.numero, isoWa(ctx.maintenantMs)));
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir) || pauseActive(ctx.main, ctx.maintenantMs)) return rien(ancien);
  if (!ETAPES_EN_COURS.includes(etapeCourante(ancien, ctx.main, ctx.maintenantMs, ctx.reglage.pauseHeures))) return rien(ancien);
  return atelierDuTour(ancien, null, ctx, false, true).reprend();
}

function etapeSuivante(ancien: EtatDuFil | null, tour: TourDeLaCliente, ctx: ContexteDuTour): SortieDuTour {
  const juge = jugeLaParole(ancien, tour, ctx);
  if (juge.parole === 'silence') {
    return { messages: [], etat: ancien ?? etatNeufDuFil(ctx.numero, isoWa(ctx.maintenantMs)), ecritures: [], pris: false };
  }
  const atelier = atelierDuTour(ancien, tour, ctx, false);
  if (juge.parole === 'main-silencieuse') return atelier.laMain(juge.motif ?? 'erreur', false);
  return atelier.joue(tour);
}

/* ── 11. LA RÉCEPTION : L'ASSISTANT QUI RÉPOND · 27 octobre 2026 ────────
   « Est-ce que mon assistant répond aux messages WhatsApp de cette façon même
   quand je dors ? » (Yéman, sur une vidéo de démonstration). Là où le juge
   se tait (une question, un prix, un merci, un mot qu'il ne reconnaît pas),
   la fonction `reception-wa` fait répondre Claude avec la voix et les règles
   de « Proposer une réponse » (shared/reception-wa-pur), et dit la suite.
   Le réglage vit à part (`mnd_assistant_wa`) : la base remet en forme celui
   de l'automate et n'y garderait pas un champ neuf. Livrée en ESSAI. */
type ModeDeLaReception = 'non' | 'essai' | 'tous';
type ReglageDeLaReception = { mode: ModeDeLaReception };
const CLE_DE_LA_RECEPTION = 'mnd_assistant_wa';
const RECEPTION_LIVREE: ReglageDeLaReception = { mode: 'essai' };

function reglageDeLaReception(brut: unknown): ReglageDeLaReception {
  const m = brut && typeof brut === 'object' ? (brut as { mode?: unknown }).mode : undefined;
  return { mode: m === 'non' || m === 'essai' || m === 'tous' ? m : RECEPTION_LIVREE.mode };
}

/** QUI ELLE SERT : personne, les numéros d'essai de l'automate, ou tout le
    monde. Jamais l'équipe ni les prestataires. */
function laReceptionSert(r: ReglageDeLaReception, numero: string, numerosEssai: readonly string[], tiroir: TiroirDuNumero | undefined): boolean {
  if (tiroir === 'equipe' || tiroir === 'prestataires') return false;
  if (r.mode === 'tous') return true;
  if (r.mode === 'essai') return numerosEssai.some((n) => cleWa(n) === cleWa(numero));
  return false;
}

type SuiteDeLaReception = 'rien' | 'reserver' | 'creation' | 'reparation' | 'calibre' | 'equipe';
type ReponseDeLaReception = { texte: string; suite: SuiteDeLaReception; lignes?: { id: string; titre: string; description?: string }[] };
/** Les suites qui ouvrent le parcours de l'automate : sa liste des prestations. */
const SUITES_DU_PARCOURS: readonly SuiteDeLaReception[] = ['reserver', 'creation', 'reparation'];

/** PEUT-ELLE PARLER ? Le juge s'est tu, et ce n'est pas un silence voulu :
    le numéro servi par l'automate ET par la réception, aucune main de
    l'équipe, un tour neuf, et l'automate n'a pas passé la main. */
function laReceptionPeutParler(
  etat: EtatDuFil | null | undefined, tour: TourDeLaCliente, ctx: ContexteLeger, r: ReglageDeLaReception,
): boolean {
  const ms = ctx.maintenantMs;
  if (!numeroServi(ctx.reglage, ctx.numero, ctx.tiroir)) return false;
  if (!laReceptionSert(r, ctx.numero, ctx.reglage.numerosEssai, ctx.tiroir)) return false;
  if (pauseActive(ctx.main, ms)) return false;
  if (tour.waIds.length === 0) return false;
  const quand = msWa(tour.quand);
  if (Number.isFinite(quand) && ms - quand > TOUR_PERIME_MS) return false;
  return etapeCourante(etat, ctx.main, ms, ctx.reglage.pauseHeures) !== 'main';
}

/** Le tour qui ouvre le parcours après la réception : son intention dite
    simplement (ses mots à elle passeraient de nouveau par le juge, qui s'est
    tu), sans le choix d'une ancienne liste. */
const INTENTION_DE_LA_RECEPTION = 'Je voudrais prendre rendez-vous.';
const tourPourLeParcours = (tour: TourDeLaCliente): TourDeLaCliente => ({ waIds: tour.waIds, quand: tour.quand, texte: INTENTION_DE_LA_RECEPTION, media: false, deLaReception: true });

/** Le mot de la réception qui précède la liste du parcours. */
const prefaceDeLaReception = (texte: string, etape: EtapeDuFil): MessageSortant =>
  ({ forme: 'texte', etape, corps: texte, deLaReception: true, prixDuCatalogue: true });

/** LE MOT DE SECOURS : Claude absent, en retard ou fautif, jamais un silence. */
function secoursDeLaReception(maintenantMs: number, semaine: readonly HeureDeLaSemaine[], exceptions: readonly ExceptionDHoraire[]): ReponseDeLaReception {
  const quand = prochaineOuvertureDite(maintenantMs, semaine, exceptions);
  return {
    texte: quand === null
      ? 'Merci pour votre message. Une personne de la Maison vous répond dans un instant.'
      : `Merci pour votre message. La Maison vous répond ${quand}.`,
    suite: 'equipe',
  };
}

function reponseDeLaReception(ancien: EtatDuFil | null, tour: TourDeLaCliente, ctx: ContexteDuTour, r: ReponseDeLaReception): SortieDuTour {
  return atelierDuTour(ancien, tour, ctx, false).laReception(r);
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
  reglageDeLAutomate, cleWa, sansAppelVide, lienMapsWa, ligneGoogleMapsWa, titreEnFrancaisWa, gesteDitEnFrancaisWa, dureeDiteWa, envoisQuiComptent, numeroServi, pauseActive, etapeCourante, tenuParLAutomate, vueDeLAutomate, silenceDeLAlarme,
  LA_MAISON_A_PARLE_MS, mineureWa, fichesServies, titulaireDuNumero, laMaisonAParle, confirmeValide,
  renvoieAUnRdv, uneQuestionAutre, civiliteLue,
  motsReconnus, intentionDeReserver, tourDeLaCliente, lisLeChoix, idDeChoix, instantACotonou,
  heureDite, jourDitAvecAnnee, titreDePlace, titreDuJour, prochaineOuvertureDite,
  choixDuMessage, chargeGraph, respecteMeta, texteSain, alerteDeLAutomate, cleCourte, prenomLu,
  quiParle, jugeLaParole, etapeSuivante, suiteDeLaPose, mainApresCoup, repriseDuFil,
  CLE_DE_LA_RECEPTION, RECEPTION_LIVREE, SUITES_DU_PARCOURS, INTENTION_DE_LA_RECEPTION, reglageDeLaReception, laReceptionSert, laReceptionPeutParler,
  tourPourLeParcours, prefaceDeLaReception, secoursDeLaReception, reponseDeLaReception,
  MOTS_SANTE_LIVRES, TEXTE_DE_REPONSE_MAX, conseilDeLaMaison, conseilActif, prixDuCatalogue, prixDitWa,
  fautesDeLaReponse, texteDeLaReponse, reponsesEnvoyables, lisLeConseil, leConseilParle,
};
export type {
  ModeDeLAutomate, ReglageDeLAutomate, TiroirDuNumero, EtapeDuFil, MotifDeLaMain, CiviliteDuFil, PlaceLibre,
  PanierDuFil, EtatDuFil, MainDuFil, TenueDuFil, VueDeLAutomate, MotsDuTour, MessageEntrantDuTour, ChoixDuTour,
  TourDeLaCliente, FormeDuMessage, MessageSortant, FicheDuNumero, PrestationDuTour, AgendaDuTour, ContexteLeger,
  ContexteDuTour, ParoleDuTour, RdvAPoser, DemandeAPoser, EnvoiAPoser, EcritureDuTour, AlerteDeLAutomate,
  SortieDuTour, VerdictDeLaPose, ReponseDeLaMaison, ConseilDeLaMaison, EtatDeLaReponse,
  ModeDeLaReception, ReglageDeLaReception, SuiteDeLaReception, ReponseDeLaReception,
};
