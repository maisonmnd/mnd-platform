/* ══ LA BOÎTE UNIQUE DES CONVERSATIONS, LE PUR · 26 octobre 2026 ═══════════
   Spécification de l'Assistant Maison (§5.2, maquette validée) : « Une seule
   boîte par personne : fils WhatsApp, chat du site, demandes et vocaux du
   site, appels, soucis Entre deux séances, et tout ce que l'Assistant lui a
   écrit. Un seul juge "attend une réponse", une seule sonnerie. »

   Avant ce jour, sept écrans tenaient chacun leur file : Conversations,
   Discussions, Demandes, deux carnets d'appels, Entre deux séances, le
   journal des envois. Une même cliente pouvait attendre à trois endroits et
   n'être vue à aucun. Ici, tout ce qui vient d'une personne, ou lui a été
   écrit, se range dans UNE boîte, à sa clé : sa fiche, sinon son numéro
   (`cleDuNumeroWa`, parce que Meta dit 229 97… quand la fiche porte
   229 01 97…), sinon sa discussion.

   CE QUE CE FICHIER NE JUGE PAS. Un fil WhatsApp attend une réponse quand
   `Fil.attendUneReponse` le dit (`filsDeLaMaison`, shared/conversations), et
   lui seul : la cloche, l'alarme du tableau de bord et cette boîte disent la
   même chose, ou rien. Les autres juges sont repris tels quels eux aussi :
   `etatDeLaDiscussion` (chat), `dansLeFiltre` (demandes), `meriteUnRappel`
   (appels WhatsApp), `etat 'ouvert' && !bien` (soucis), `!fait` (appels
   notés). Ce fichier les COMPOSE, il n'en réécrit aucun.

   TROIS DÉDOUBLONNAGES, parce qu'un même geste d'elle laisse deux traces :
     ① la demande du site est aussi écrite dans son fil (`messages_wa`,
        `canal: 'site'`, `demandeId`) : une bulle, pas deux ;
     ② le souci choisi dans la liste WhatsApp est le message qu'elle a touché
        ET un signalement `sig-wa-<clé courte du waId>` : une bulle ;
     ③ la réponse reçue à son souci vit dans le fil (`auto: 'point-recu' |
        'point-bien'`) sur WhatsApp, et sur le signalement seul depuis Ma
        Couronne : jamais les deux, et jamais tenue pour une main humaine.

   Pur : `scripts/verifie-la-boite-unique.mjs` le prouve (et `--prouve`). */

import {
  REPONSES_GRATUITES_DU_MOIS, cleDuNumeroWa, compteDesModeles, estReserve, numeroWa, resteEnClair,
  type Fil, type MessageWa, type Tiroir,
} from './conversations';
import { DEVENU_DIT, devenuDe, estEnvoiAutomatique, typeDit, type EnvoiLu } from './envois';
import { attendEncore } from './salle-des-envois';
import { etatDeLaDiscussion, type AuteurDuMessage } from './chat-du-site-pur';
import { dansLeFiltre, ditLeBesoin, nomDeLaDemande, type Demande } from './demandes';
import { dureeDe, dureeDite, meriteUnRappel, type AppelWa, type EtatDAppel } from './appels-wa';
import { DELAI_HEURES, NIVEAUX, TITRE_COURT, enRetard, niveauDe, type Niveau, type Signalement } from './entre-deux-pur';
import { jourACotonou } from './dernier-message-pur';
import { estUneQuestionFranche, heureDite, jourDit } from './gerard-pur';
import type { Discussion, MessageAuTrone } from './discussions';
import type { AppelRecu } from './appels';

/* ── LES MOTS ────────────────────────────────────────────────────────────── */

/** D'où vient une bulle. `comptoir` : noté au Trône par l'équipe. */
export type SourceDeBulle = 'whatsapp' | 'chat' | 'demande' | 'vocal' | 'appel' | 'couronne' | 'comptoir';
/** Qui l'a écrite. `chat` : la réponse automatique du chat du site ;
    `modele` : un modèle Meta parti seul ; `systeme` : une ligne d'état. */
export type AuteurDeBulle = 'elle' | 'equipe' | 'assistant' | 'automate' | 'modele' | 'chat' | 'systeme';
export type TableDeLaBulle = 'messages_wa' | 'discussions' | 'discussion_messages' | 'demandes' | 'appels_wa' | 'mnd_appels' | 'signalements' | 'envois';

export type Bulle = {
  /** Unique dans la boîte. */
  id: string;
  /** ISO complet : l'instant. */
  quand: string;
  source: SourceDeBulle;
  auteur: AuteurDeBulle;
  texte: string;
  /** Qui l'a écrite côté Maison, quand on le sait. */
  parQui?: string;
  /** Le modèle Meta, s'il y en a un. */
  modele?: string;
  /** Le niveau d'un souci (Santé, À voir, Conseil). */
  niveau?: Niveau;
  /** Ce que Meta en a dit, ou le devenu d'un envoi, ou l'état d'un appel. */
  etat?: string;
  /** Le bouton qu'elle a touché, s'il y en a un. */
  bouton?: string;
  /** Parti seul : l'écran le grise, pour voir la rafale s'il y en a une. */
  gris: boolean;
  /** D'où elle vient, pour le geste qui la vise. */
  de: { table: TableDeLaBulle; id: string };
};

export type PourquoiElleAttend = 'whatsapp' | 'chat' | 'demande' | 'souci' | 'appel' | 'appel-wa';
export type FiltreDeLaBoite = 'attend' | 'entre-deux' | 'site' | 'tout';
export const FILTRES_DE_LA_BOITE: readonly FiltreDeLaBoite[] = ['attend', 'entre-deux', 'site', 'tout'];
export const FILTRE_DIT: Record<FiltreDeLaBoite, string> = {
  attend: 'Attend une réponse', 'entre-deux': 'Entre deux séances', site: 'Depuis le site', tout: 'Tout',
};

export type Boite = {
  /** `c:<clientId>`, sinon `n:<clé du numéro>`, sinon `d:<discussion>` (ou l'id de la seule pièce). */
  cle: string;
  clientId?: string;
  /** Le numéro réduit (`numeroWa`), pour les gestes WhatsApp. */
  numero?: string;
  discussionId?: string;
  nom: string;
  /** « KT » ; « ? » quand on ne connaît pas son nom. */
  initiales: string;
  sansFiche: boolean;
  tiroir: Tiroir;
  branchId?: string;
  /** Les sources présentes, dans l'ordre où elles paraissent. */
  canaux: SourceDeBulle[];
  /** Le fil fusionné, dans l'ordre du temps. */
  bulles: Bulle[];
  derniere?: Bulle;
  derniereDElle?: Bulle;
  /** Depuis la dernière bulle, en millisecondes. */
  depuisMs?: number;
  /** LE JUGE COMPOSÉ : vrai dès qu'une des pièces attend. */
  attendUneReponse: boolean;
  pourquoi: PourquoiElleAttend[];
  /** Un souci Santé ouvert. */
  sante: boolean;
  niveauDuSouci?: Niveau;
  /** Un souci ouvert au-delà de son délai (24 h, 48 h, 7 jours). */
  enRetard: boolean;
  /** La fenêtre WhatsApp ferme dans moins d'une heure, et elle attend. */
  fenetreFermeBientot: boolean;
  /** Elle demande franchement si elle parle à une personne. */
  questionFranche: boolean;
  quiALaMain: string;
  filtres: FiltreDeLaBoite[];
  /** « Rien à répondre » posé depuis son dernier message (`estRangee`) : ses
      mots ne l'attendent plus ; un souci, une demande, un appel gardent leur juge. */
  rangee: boolean;
  /** Le fil WhatsApp le plus récent (une fiche à deux numéros en a deux). */
  fil?: Fil;
  fils: Fil[];
  discussions: Discussion[];
  demandes: Demande[];
  appelsWa: AppelWa[];
  appels: AppelRecu[];
  signalements: Signalement[];
  soucisOuverts: Signalement[];
};

/** Ce que la boîte lit d'une fiche cliente : de quoi la nommer et la joindre. */
export type ClienteDeLaBoite = { id: string; name: string; phone?: string; phone2?: string; branchId?: string };
/** Une ligne `envois`, avec les champs que l'Assistant y pose (cast local). */
export type EnvoiDeLaBoite = EnvoiLu & { genre?: string; texte?: string; parQui?: string; deposeLe?: string; partA?: string };

export type EntreeDesBoites = {
  fils: readonly Fil[];
  discussions?: readonly Discussion[];
  /** Les messages des discussions ouvertes à l'écran (chargés à l'ouverture). */
  messagesDesDiscussions?: Readonly<Record<string, readonly MessageAuTrone[]>>;
  demandes?: readonly Demande[];
  appelsWa?: readonly AppelWa[];
  appels?: readonly AppelRecu[];
  signalements?: readonly Signalement[];
  envois?: readonly EnvoiDeLaBoite[];
  clientes: readonly ClienteDeLaBoite[];
  maintenant: number;
  branchId?: string;
  /** Les tiroirs montrés : la direction voit tout, le personnel les clientes. */
  tiroirs?: readonly Tiroir[];
  /** « Rien à répondre », par clé de boîte et par fil (`cleDuFilRange`). */
  riensARepondre?: Readonly<RiensARepondre>;
};

/* ── RIEN À RÉPONDRE · 27 octobre 2026 ───────────────────────────────────
   « Je ne comprends pas bien la partie conversation » (Yéman) : 40 boîtes
   « attendaient une réponse », dont des « Merci » de 7, 14 et 27 jours. Un
   geste les range : « Rien à répondre ». MÊME RÈGLE QUE L'ARCHIVE DES FILS
   (`estArchive`, shared/conversations) : il vaut jusqu'à son prochain
   message, on le juge contre ses mots, pas contre une case à décocher. Il
   ne touche QUE ses mots (WhatsApp, chat du site) : un souci, une demande,
   un appel ont leurs propres gestes et ne se rangent pas en passant.
   Partagé (`mnd_rien_a_repondre`), il vaut sur chaque appareil, et le
   compte de la barre des vues (`attendUnHumain`) le lit aussi. */
export type RienARepondre = { le: string; par?: string };
export type RiensARepondre = Record<string, RienARepondre>;
/** La clé d'un fil rangé : son numéro, comme les boîtes sans fiche. */
export const cleDuFilRange = (numero: string | undefined): string => `n:${cleDuNumero(numero)}`;
/** RANGÉE ? Oui si l'une de ses clés porte un « Rien à répondre » posé
    après son dernier mot (ou si elle n'a jamais écrit). Les instants se
    comparent en millisecondes, jamais en texte. */
export function estRangee(cles: readonly string[], dernierDElle: string | undefined, riens: Readonly<RiensARepondre> | undefined): boolean {
  if (!riens) return false;
  const t = dernierDElle ? Date.parse(dernierDElle) : NaN;
  return cles.some((k) => {
    const r = riens[k];
    if (!r) return false;
    const le = Date.parse(r.le);
    if (!Number.isFinite(le)) return false;
    return !Number.isFinite(t) || t <= le;
  });
}

/* ── QUI ÉCRIT SEUL ──────────────────────────────────────────────────────── */

/** L'Assistant signe « Maison MND » chez la cliente ; côté Maison, ses lignes
    portent « Assistant Maison » (spec §11) ou l'ancien « Gérard ». */
export const estLaMainDeLAssistant = (parQui?: string): boolean => /^(assistant maison|g[ée]rard)$/i.test((parQui ?? '').trim());

/** PARTI SANS MAIN HUMAINE : les fonctions (« Le Trône », « la Maison,
    automatiquement », `estEnvoiAutomatique` du journal) et l'Assistant. Le
    journal l'apprend le même jour (lot 2) ; la boîte le nomme aussi, pour
    que « répondues sous 1 h » ne lui doive rien quoi qu'il advienne de la
    ligne du journal. */
export const estPartiSeul = (parQui?: string): boolean => estEnvoiAutomatique(parQui) || estLaMainDeLAssistant(parQui);

/** UNE RÉPONSE D'UNE MAIN HUMAINE : sortante, sans `auto`, signée par une
    personne. Un modèle qu'une personne envoie de sa main répond ; un modèle
    parti seul, un mot de l'automate, un « point reçu » ne répondent pas. */
export const estUneMainHumaine = (m: Pick<MessageWa, 'sens' | 'auto' | 'parQui'>): boolean =>
  m.sens === 'sortant' && !m.auto && !estPartiSeul(m.parQui);

/** L'auteur d'un message WhatsApp, côté boîte. */
export function auteurDuMessageWa(m: Pick<MessageWa, 'sens' | 'auto' | 'modele' | 'parQui'>): AuteurDeBulle {
  if (m.sens === 'entrant') return 'elle';
  if (m.auto) return 'automate';
  if (estLaMainDeLAssistant(m.parQui)) return 'assistant';
  if (estEnvoiAutomatique(m.parQui)) return m.modele ? 'modele' : 'automate';
  return 'equipe';
}

const GRIS: ReadonlySet<AuteurDeBulle> = new Set<AuteurDeBulle>(['automate', 'modele', 'assistant', 'chat']);
const AUTEUR_DU_CHAT: Record<AuteurDuMessage, AuteurDeBulle> = { visiteuse: 'elle', maison: 'equipe', auto: 'chat', systeme: 'systeme' };
const SOURCE_DU_CANAL: Record<Signalement['canal'], SourceDeBulle> = { couronne: 'couronne', whatsapp: 'whatsapp', trone: 'comptoir' };
const ETAT_D_APPEL_DIT: Record<EtatDAppel, string> = { sonne: 'sonne', pris: 'pris', manque: 'manqué', fini: 'terminé', refuse: 'refusé' };
const RANG_DU_NIVEAU: Record<Niveau, number> = { conseil: 0, voir: 1, sante: 2 };
export const UNE_HEURE_MS = 3_600_000;

/* ⟨cle-courte⟩ recopie de `supabase/functions/whatsapp-webhook/index.ts`
   (une fonction Edge n'importe rien du dépôt ; le banc compare les deux). */
const cleCourte = (waId: string): string => waId.replace(/[^A-Za-z0-9]/g, '').slice(-24) || 'x';
/* ⟨/cle-courte⟩ */

/** L'identifiant du signalement qu'écrit le webhook pour un souci choisi
    dans la liste WhatsApp : le même geste que le message qu'elle a touché. */
export const idDuSouciWa = (waId: string): string => `sig-wa-${cleCourte(waId)}`;

/* ── LES TEXTES ──────────────────────────────────────────────────────────── */

/** « KT » ; un numéro n'a pas d'initiales. */
export const initialesDe = (nom: string): string => {
  const mots = nom.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0 || /^\d+$/.test(mots.join(''))) return '?';
  return (mots.length === 1 ? mots[0].slice(0, 2) : mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
};

/** « 14 h 05 » à Cotonou. */
export const heureACotonou = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const [h, m] = new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Africa/Porto-Novo', hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
  return `${Number(h)} h ${m}`;
};

/** Ce qu'une demande du site dit en une ligne : le besoin, la place demandée
    (avec l'année), la voix, ses mots. */
export function texteDeLaDemande(d: Pick<Demande, 'besoin' | 'mot' | 'date' | 'time' | 'voix'>): string {
  const morceaux = [ditLeBesoin(d.besoin)];
  if (d.date) morceaux.push(`place demandée le ${jourDit(d.date)}${d.time ? ` à ${heureDite(d.time)}` : ''}`);
  if (d.voix) morceaux.push(`message vocal${d.voix.dureeS ? ` (${dureeDite(d.voix.dureeS)})` : ''}`);
  const mot = (d.mot ?? '').trim();
  if (mot) morceaux.push(`« ${mot} »`);
  return morceaux.join(', ');
}

export function texteDeLAppelWa(a: Pick<AppelWa, 'sens' | 'etat' | 'prisLe' | 'finiLe' | 'prisPar'>): string {
  const duree = dureeDe(a as AppelWa);
  return `Appel WhatsApp ${a.sens === 'entrant' ? 'reçu' : 'passé'}, ${ETAT_D_APPEL_DIT[a.etat]}`
    + `${duree !== undefined ? `, ${dureeDite(duree)}` : ''}${a.prisPar ? `, pris par ${a.prisPar}` : ''}`;
}

export function texteDuSouci(s: Pick<Signalement, 'bien' | 'soucis' | 'texte' | 'photo'>): string {
  if (s.bien) return 'Tout va bien';
  const titres = (s.soucis ?? []).map((c) => TITRE_COURT[c] ?? c).join(', ');
  const mot = (s.texte ?? '').trim();
  return [titres, mot ? `« ${mot} »` : '', s.photo ? 'une photo' : ''].filter(Boolean).join(', ') || 'Un souci signalé';
}

/* ── LES BULLES ──────────────────────────────────────────────────────────── */

export function bulleDuMessageWa(m: MessageWa, souci?: Signalement): Bulle {
  const auteur = auteurDuMessageWa(m);
  const source: SourceDeBulle = m.canal === 'site' ? (/^message vocal/i.test(m.texte) ? 'vocal' : 'demande') : 'whatsapp';
  const texte = m.texte || m.bouton?.texte || (m.piece ? `Pièce : ${m.piece.nom}` : '');
  return {
    id: `wa-${m.id}`, quand: m.quand, source, auteur, texte,
    ...(m.parQui ? { parQui: m.parQui } : {}),
    ...(m.modele ? { modele: m.modele } : {}),
    ...(souci && !souci.bien && souci.soucis.length ? { niveau: niveauDe(souci.soucis) } : {}),
    ...(m.sens === 'sortant' && m.etat ? { etat: m.etat } : {}),
    ...(m.bouton?.texte ? { bouton: m.bouton.texte } : {}),
    gris: GRIS.has(auteur),
    de: { table: 'messages_wa', id: m.id },
  };
}

/** Une ligne `envois` dans la boîte, ou rien. Ce qui est parti sur WhatsApp
    vit déjà dans le fil (`messages_wa`, ligne `wa-<waMessageId>`) : on ne le
    redit pas. Ce qui attend en salle, ce qui a échoué, ce qui est parti en
    notification Ma Couronne ou à la main, n'est écrit nulle part ailleurs. */
export function bulleDeLEnvoi(en: EnvoiDeLaBoite): Bulle | null {
  const devenu = devenuDe(en);
  if (devenu === 'ecarte' || devenu === 'perime') return null;
  const assistant = en.type === 'gerard';
  const texte = (en.texte ?? '').trim() || `${typeDit(en.type)}${en.genre ? ` · ${en.genre}` : ''}`;
  const de = { table: 'envois' as const, id: en.id };
  const id = `envoi-${en.id}`;
  if (attendEncore(en)) {
    return {
      id, quand: en.deposeLe ?? en.quand, source: en.canal === 'push' ? 'couronne' : 'whatsapp', auteur: 'systeme',
      texte: `En salle d’attente : ${typeDit(en.type)}${en.partA ? `, part à ${heureACotonou(en.partA)}` : ''}`,
      etat: en.statut, gris: true, de,
    };
  }
  if (en.canal === 'push') {
    return { id, quand: en.quand, source: 'couronne', auteur: assistant ? 'assistant' : 'automate', texte, etat: DEVENU_DIT[devenu], gris: true, de, ...(en.parQui ? { parQui: en.parQui } : {}) };
  }
  if (devenu === 'a-la-main') {
    return { id, quand: en.quand, source: 'whatsapp', auteur: assistant ? 'assistant' : 'equipe', texte, etat: DEVENU_DIT[devenu], gris: assistant, de, ...(en.parQui ? { parQui: en.parQui } : {}) };
  }
  if (devenu === 'echec' || devenu === 'personne') {
    return { id, quand: en.quand, source: 'whatsapp', auteur: 'systeme', texte: `${typeDit(en.type)} : ${DEVENU_DIT[devenu]}`, etat: DEVENU_DIT[devenu], gris: true, de };
  }
  return null;
}

/* ── LA BOÎTE ────────────────────────────────────────────────────────────── */

type Brouillon = {
  cle: string;
  clientId?: string;
  discussionId?: string;
  branchId?: string;
  noms: string[];
  numeros: string[];
  bulles: Bulle[];
  fils: Fil[];
  discussions: Discussion[];
  demandes: Demande[];
  appelsWa: AppelWa[];
  appels: AppelRecu[];
  signalements: Signalement[];
};

/** LA CLÉ D'UN NUMÉRO POUR LE RAPPROCHER : celle de `conversations`, parce
    que Meta et la fiche n'écrivent pas le même numéro (229 97… / 229 01 97…). */
const cleDuNumero = (brut: string | undefined): string => cleDuNumeroWa(brut);

const deLaBranche = (b: string | null | undefined, branchId?: string): boolean => !branchId || !b || b === branchId;

type JugementDeLaBoite = Pick<Boite, 'pourquoi' | 'niveauDuSouci' | 'enRetard' | 'fil' | 'questionFranche' | 'discussions' | 'demandes' | 'appels' | 'derniere'> & { rangee?: boolean };

/** QUI A LA MAIN, en une phrase courte : le geste le plus pressé d'abord
    (Santé, puis un appel, une demande, le chat, WhatsApp), sinon qui tient
    le fil (l'automate, l'équipe), sinon rien à faire. */
export function quiALaMain(b: JugementDeLaBoite): string {
  if (b.pourquoi.includes('souci') && b.niveauDuSouci) {
    const h = DELAI_HEURES[b.niveauDuSouci];
    const delai = h < 48 ? `${h} h` : `${Math.round(h / 24)} jours`;
    if (b.enRetard) return `${b.niveauDuSouci === 'sante' ? 'rappel' : 'réponse'} en retard (${NIVEAUX[b.niveauDuSouci]}, ${delai})`;
    return `${b.niveauDuSouci === 'sante' ? 'à rappeler' : 'à répondre'} sous ${delai}`;
  }
  if (b.pourquoi.includes('appel-wa')) return 'appel WhatsApp manqué, à rappeler';
  if (b.pourquoi.includes('appel')) return b.appels.some((a) => !a.fait && a.suite === 'rdv') ? 'a appelé, un rendez-vous à caler' : 'a appelé, à rappeler';
  if (b.pourquoi.includes('demande')) return b.demandes.some((d) => dansLeFiltre(d, 'a-traiter') && d.apptId) ? 'rendez-vous pris sur le site, à confirmer' : 'demande du site, à traiter';
  if (b.pourquoi.includes('chat')) return b.derniere?.source === 'chat' && b.derniere.auteur === 'chat' ? 'réponse automatique partie, à relire' : 'à répondre sur le chat du site';
  if (b.pourquoi.includes('whatsapp') && b.fil) {
    if (b.questionFranche) return 'elle demande si elle parle à une personne';
    if (b.fil.automate?.tenue === 'main') return 'l’automate a passé la main, à répondre';
    return b.fil.fenetre.ouverte ? `à répondre, fenêtre ouverte encore ${resteEnClair(b.fil.fenetre.resteMs)}` : 'à répondre par un modèle, fenêtre fermée';
  }
  if (b.rangee) return 'rien à répondre, jusqu’à son prochain message';
  if (b.fil?.automate?.tenue === 'tenu') return 'l’automate a la main';
  if (b.fil?.automate?.tenue === 'pause') return 'l’équipe a la main';
  if (!b.fil && b.discussions.length > 0 && b.discussions.every((d) => etatDeLaDiscussion(d) === 'close')) return 'discussion close';
  if (!b.fil && b.demandes.some((d) => d.statut === 'convertie')) return 'devenue cliente';
  return 'rien à faire';
}

/** Les filtres où la boîte paraît. « Entre deux séances » : un souci encore
    ouvert. « Depuis le site » : un chat, une demande ou un vocal du site. */
export function filtresDe(b: Pick<Boite, 'attendUneReponse' | 'soucisOuverts' | 'discussions' | 'demandes' | 'bulles'>): FiltreDeLaBoite[] {
  const f: FiltreDeLaBoite[] = [];
  if (b.attendUneReponse) f.push('attend');
  if (b.soucisOuverts.length > 0) f.push('entre-deux');
  if (b.discussions.length > 0 || b.demandes.some((d) => d.source !== 'whatsapp')
    || b.bulles.some((x) => x.source === 'chat' || x.source === 'demande' || x.source === 'vocal')) f.push('site');
  f.push('tout');
  return f;
}

export const boitesDuFiltre = (boites: readonly Boite[], filtre: FiltreDeLaBoite): Boite[] => boites.filter((b) => b.filtres.includes(filtre));

export function comptesDesFiltres(boites: readonly Boite[]): Record<FiltreDeLaBoite, number> {
  const c: Record<FiltreDeLaBoite, number> = { attend: 0, 'entre-deux': 0, site: 0, tout: 0 };
  for (const b of boites) for (const f of b.filtres) c[f] += 1;
  return c;
}

/** TOUTES LES BOÎTES DE LA MAISON, celles qui attendent d'abord (Santé en
    tête), puis de la plus récente à la plus calme. */
export function boitesDeLaMaison(e: EntreeDesBoites): Boite[] {
  const { branchId } = e;
  const clientesParId = new Map(e.clientes.map((c) => [c.id, c]));

  /* La clé : la fiche, sinon la cliente que le numéro désigne, sinon le
     numéro lui-même, sinon la pièce seule. */
  const clienteDuNumero = new Map<string, string>();
  const pose = (numero: string | null | undefined, clientId: string | null | undefined) => {
    const k = cleDuNumero(numero ?? undefined);
    if (k && clientId && !clienteDuNumero.has(k)) clienteDuNumero.set(k, clientId);
  };
  for (const c of e.clientes) { pose(c.phone, c.id); pose(c.phone2, c.id); }
  for (const f of e.fils) pose(f.numero, f.clientId);
  for (const a of e.appelsWa ?? []) pose(a.numero, a.clientId);
  for (const d of e.demandes ?? []) pose(d.telephone, d.clientId);
  for (const d of e.discussions ?? []) pose(d.telephone, d.client_id);
  const cle = (clientId: string | null | undefined, numero: string | null | undefined, repli: string): string => {
    if (clientId) return `c:${clientId}`;
    const k = cleDuNumero(numero ?? undefined);
    if (!k) return repli;
    const c = clienteDuNumero.get(k);
    return c ? `c:${c}` : `n:${k}`;
  };

  const brouillons = new Map<string, Brouillon>();
  const brouillon = (k: string): Brouillon => {
    let b = brouillons.get(k);
    if (!b) {
      b = { cle: k, noms: [], numeros: [], bulles: [], fils: [], discussions: [], demandes: [], appelsWa: [], appels: [], signalements: [] };
      if (k.startsWith('c:')) b.clientId = k.slice(2);
      brouillons.set(k, b);
    }
    return b;
  };

  /* ② Les soucis choisis dans la liste WhatsApp : le message qu'elle a
     touché porte la bulle, le signalement porte le niveau. */
  const soucisWa = new Map<string, Signalement>();
  for (const s of e.signalements ?? []) if (s.canal === 'whatsapp' && s.id.startsWith('sig-wa-')) soucisWa.set(s.id, s);
  const soucisVus = new Set<string>();
  /* ① Les demandes du site, aussi écrites dans le fil. */
  const idsDesDemandes = new Set((e.demandes ?? []).map((d) => d.id));

  for (const f of e.fils) {
    const b = brouillon(cle(f.clientId, f.numero, `n:${f.numero}`));
    b.fils.push(f);
    b.numeros.push(f.numero);
    if (!f.sansFiche) b.noms.push(f.nom);
    for (const m of f.messages) {
      const demandeId = (m as { demandeId?: string }).demandeId;
      if (m.canal === 'site' && demandeId && idsDesDemandes.has(demandeId)) continue;
      const souci = m.waId ? soucisWa.get(idDuSouciWa(m.waId)) : undefined;
      if (souci) soucisVus.add(souci.id);
      b.bulles.push(bulleDuMessageWa(m, souci));
    }
  }

  for (const d of e.discussions ?? []) {
    if (!deLaBranche(d.branch_id, branchId)) continue;
    const b = brouillon(cle(d.client_id, d.telephone, `d:${d.id}`));
    b.discussions.push(d);
    b.discussionId ??= d.id;
    b.branchId ??= d.branch_id ?? undefined;
    const nom = [d.prenom, d.nom].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
    if (nom) b.noms.push(nom);
    if (d.telephone) b.numeros.push(d.telephone);
    const messages = e.messagesDesDiscussions?.[d.id] ?? [];
    if (messages.length === 0) {
      /* Les messages se chargent à l'ouverture : d'ici là, la discussion
         tient sa place par son dernier instant et qui a parlé en dernier. */
      b.bulles.push({
        id: `chat-${d.id}`, quand: d.derniere_le, source: 'chat', auteur: d.dernier_de === 'visiteuse' ? 'elle' : 'equipe',
        texte: '', gris: false, de: { table: 'discussions', id: d.id },
      });
    }
    for (const m of messages) {
      const auteur = AUTEUR_DU_CHAT[m.de] ?? 'systeme';
      b.bulles.push({
        id: `chat-${d.id}-${m.id}`, quand: m.cree_le, source: 'chat', auteur, texte: m.texte,
        ...(m.par ? { parQui: m.par } : {}), gris: GRIS.has(auteur), de: { table: 'discussion_messages', id: String(m.id) },
      });
    }
  }

  for (const d of e.demandes ?? []) {
    if (!deLaBranche(d.branchId, branchId)) continue;
    const b = brouillon(cle(d.clientId, d.telephone, `q:${d.id}`));
    b.demandes.push(d);
    b.branchId ??= d.branchId;
    const nom = nomDeLaDemande(d);
    if (nom) b.noms.push(nom);
    if (d.telephone) b.numeros.push(d.telephone);
    b.bulles.push({
      id: `demande-${d.id}`, quand: d.createdAt, source: d.voix ? 'vocal' : 'demande', auteur: 'elle',
      texte: texteDeLaDemande(d), etat: d.statut, gris: false, de: { table: 'demandes', id: d.id },
    });
  }

  for (const a of e.appelsWa ?? []) {
    if (!deLaBranche(a.branchId, branchId)) continue;
    const b = brouillon(cle(a.clientId, a.numero, `w:${a.id}`));
    b.appelsWa.push(a);
    b.branchId ??= a.branchId;
    if (a.nomProfil) b.noms.push(a.nomProfil);
    b.numeros.push(a.numero);
    b.bulles.push({
      id: `appel-wa-${a.id}`, quand: a.sonneLe, source: 'appel', auteur: a.sens === 'entrant' ? 'elle' : 'equipe',
      texte: texteDeLAppelWa(a), ...(a.prisPar ? { parQui: a.prisPar } : {}), etat: ETAT_D_APPEL_DIT[a.etat], gris: false,
      de: { table: 'appels_wa', id: a.id },
    });
  }

  for (const a of e.appels ?? []) {
    if (!deLaBranche(a.branchId, branchId)) continue;
    const b = brouillon(cle(a.clientId, a.phone, `t:${a.id}`));
    b.appels.push(a);
    b.branchId ??= a.branchId;
    if (a.nom) b.noms.push(a.nom);
    if (a.phone) b.numeros.push(a.phone);
    b.bulles.push({
      id: `appel-${a.id}`, quand: a.at, source: 'appel', auteur: 'elle',
      texte: `A appelé${a.motif ? ` : ${a.motif}` : ''}${a.suite === 'rdv' ? ', un rendez-vous à caler' : ', à rappeler'}`,
      etat: a.fait ? 'fait' : 'à faire', gris: false, de: { table: 'mnd_appels', id: a.id },
    });
  }

  for (const s of e.signalements ?? []) {
    if (!deLaBranche(s.branchId, branchId)) continue;
    const b = brouillon(cle(s.clientId, undefined, `s:${s.id}`));
    b.signalements.push(s);
    b.branchId ??= s.branchId;
    const source = SOURCE_DU_CANAL[s.canal] ?? 'comptoir';
    const soucis = s.soucis ?? [];
    const niveau = s.bien || soucis.length === 0 ? undefined : niveauDe(soucis);
    const de = { table: 'signalements' as const, id: s.id };
    if (!soucisVus.has(s.id)) {
      b.bulles.push({
        id: `souci-${s.id}`, quand: s.quand, source, auteur: s.canal === 'trone' ? 'equipe' : 'elle', texte: texteDuSouci(s),
        ...(niveau ? { niveau } : {}), gris: false, de,
      });
    }
    /* ③ Ce qu'elle a reçu tout de suite : sur WhatsApp, le fil le porte
       (`auto: 'point-recu' | 'point-bien'`) ; depuis Ma Couronne, seul le
       signalement s'en souvient. */
    if (s.reponse && s.canal === 'couronne') {
      b.bulles.push({ id: `souci-${s.id}-reponse`, quand: s.quand, source: 'couronne', auteur: 'automate', texte: s.reponse, gris: true, de });
    }
    if (s.etat === 'ouvert' && !s.bien && niveau) {
      /* La ligne d'état suit la réponse reçue : sur WhatsApp, le mot parti
         seul quelques secondes après son choix (point-recu). */
      const t0 = Date.parse(s.quand);
      const reponseDuFil = s.canal === 'whatsapp'
        ? b.bulles.find((x) => x.de.table === 'messages_wa' && x.auteur === 'automate' && Date.parse(x.quand) >= t0 && Date.parse(x.quand) - t0 < 10 * 60_000)
        : undefined;
      b.bulles.push({ id: `souci-${s.id}-ouvert`, quand: reponseDuFil?.quand ?? s.quand, source, auteur: 'systeme', texte: `Souci ouvert (${NIVEAUX[niveau]}) : toute sollicitation suspendue`, niveau, gris: false, de });
    }
    if (s.etat === 'traite' && s.traiteLe && !s.bien) {
      b.bulles.push({ id: `souci-${s.id}-clos`, quand: s.traiteLe, source, auteur: 'systeme', texte: `Souci clos${s.traitePar ? ` par ${s.traitePar}` : ''}`, gris: false, de });
    }
  }

  for (const en of e.envois ?? []) {
    if (!deLaBranche(en.branchId, branchId)) continue;
    const bulle = bulleDeLEnvoi(en);
    if (!bulle) continue;
    const b = brouillon(cle(en.clientId, en.numero, `e:${en.id}`));
    b.branchId ??= en.branchId;
    if (en.prenom && !en.clientId) b.noms.push(en.prenom);
    if (en.numero) b.numeros.push(en.numero);
    b.bulles.push(bulle);
  }

  /* ── Le jugement ── */
  const maintenantIso = new Date(e.maintenant).toISOString();
  const boites: Boite[] = [];
  for (const b of brouillons.values()) {
    const cliente = b.clientId ? clientesParId.get(b.clientId) : undefined;
    b.fils.sort((x, y) => y.dernier.quand.localeCompare(x.dernier.quand));
    const fil = b.fils[0];
    const tiroir: Tiroir = fil?.tiroir ?? 'clientes';
    if (e.tiroirs && !e.tiroirs.includes(tiroir)) continue;

    b.bulles.sort((x, y) => x.quand.localeCompare(y.quand));
    const derniere = b.bulles[b.bulles.length - 1];
    const derniereDElle = [...b.bulles].reverse().find((x) => x.auteur === 'elle');
    const soucisOuverts = b.signalements.filter((s) => s.etat === 'ouvert' && !s.bien && (s.soucis ?? []).length > 0);

    const rangee = estRangee([b.cle, ...b.fils.map((f) => cleDuFilRange(f.numero))], derniereDElle?.quand, e.riensARepondre);
    const pourquoi: PourquoiElleAttend[] = [];
    if (!rangee && b.fils.some((f) => f.attendUneReponse)) pourquoi.push('whatsapp');
    if (!rangee && b.discussions.some((d) => etatDeLaDiscussion(d) === 'a-repondre')) pourquoi.push('chat');
    if (b.demandes.some((d) => dansLeFiltre(d, 'a-traiter'))) pourquoi.push('demande');
    if (soucisOuverts.length > 0) pourquoi.push('souci');
    if (b.appels.some((a) => !a.fait)) pourquoi.push('appel');
    if (b.appelsWa.some(meriteUnRappel)) pourquoi.push('appel-wa');

    let niveauDuSouci: Niveau | undefined;
    for (const s of soucisOuverts) {
      const n = niveauDe(s.soucis);
      if (!niveauDuSouci || RANG_DU_NIVEAU[n] > RANG_DU_NIVEAU[niveauDuSouci]) niveauDuSouci = n;
    }
    const filQuiAttend = pourquoi.includes('whatsapp') ? fil : undefined;
    const nomConnu = cliente?.name?.trim() || b.noms.find((n) => n.trim())?.trim() || (fil && fil.nom !== fil.numero ? fil.nom : '');
    const nom = nomConnu || (b.discussions.length > 0 ? 'Visiteuse du site' : (fil?.numero ?? b.numeros[0] ?? 'Sans nom'));
    const numero = (fil?.numero ?? (b.numeros.length ? numeroWa(b.numeros[0]) : cliente ? numeroWa(cliente.phone) : '')) || undefined;
    const t = derniere ? Date.parse(derniere.quand) : NaN;
    const canaux: SourceDeBulle[] = [];
    for (const x of b.bulles) if (!canaux.includes(x.source)) canaux.push(x.source);

    const sansPhrase: Omit<Boite, 'quiALaMain' | 'filtres'> = {
      cle: b.cle,
      rangee,
      ...(b.clientId ? { clientId: b.clientId } : {}),
      ...(numero ? { numero } : {}),
      ...(b.discussionId ? { discussionId: b.discussionId } : {}),
      nom,
      initiales: nomConnu ? initialesDe(nomConnu) : '?',
      sansFiche: !b.clientId,
      tiroir,
      ...((cliente?.branchId ?? b.branchId) ? { branchId: cliente?.branchId ?? b.branchId } : {}),
      canaux,
      bulles: b.bulles,
      ...(derniere ? { derniere } : {}),
      ...(derniereDElle ? { derniereDElle } : {}),
      ...(Number.isFinite(t) ? { depuisMs: Math.max(0, e.maintenant - t) } : {}),
      attendUneReponse: pourquoi.length > 0,
      pourquoi,
      sante: niveauDuSouci === 'sante',
      ...(niveauDuSouci ? { niveauDuSouci } : {}),
      enRetard: soucisOuverts.some((s) => enRetard(s, maintenantIso)),
      fenetreFermeBientot: !!filQuiAttend && filQuiAttend.fenetre.ouverte && filQuiAttend.fenetre.resteMs < UNE_HEURE_MS,
      questionFranche: !!filQuiAttend && estUneQuestionFranche(filQuiAttend.dernierQuiCompte.texte),
      ...(fil ? { fil } : {}),
      fils: b.fils,
      discussions: b.discussions,
      demandes: b.demandes,
      appelsWa: b.appelsWa,
      appels: b.appels,
      signalements: b.signalements,
      soucisOuverts,
    };
    boites.push({ ...sansPhrase, quiALaMain: quiALaMain(sansPhrase), filtres: filtresDe(sansPhrase) });
  }

  return boites.sort((x, y) =>
    Number(y.attendUneReponse) - Number(x.attendUneReponse)
    || Number(y.sante) - Number(x.sante)
    || (y.derniere?.quand ?? '').localeCompare(x.derniere?.quand ?? ''));
}

/* ── LES TUILES ──────────────────────────────────────────────────────────── */

export type ReponsesDuJour = {
  /** Les questions du jour : une suite de messages d'elle sans réponse entre eux compte pour une. */
  questions: number;
  /** Celles qu'une main humaine a reprises en moins d'une heure. */
  repondues: number;
  /** Posées il y a moins d'une heure et pas encore reprises : ni gagnées ni perdues. */
  enCours: number;
};

/** « RÉPONDUES SOUS 1 H AUJOURD'HUI, n sur N ». Le jour est celui de Cotonou
    (`jourACotonou`). Une question : le premier message d'elle d'une suite
    sans réponse ; sa réponse : le premier sortant d'une MAIN HUMAINE après
    (`estUneMainHumaine`). Un modèle parti seul, l'automate, l'Assistant, un
    « point reçu » ne répondent pas. Les demandes du site (`canal: 'site'`)
    ont leur accusé et leur file ; l'équipe et les prestataires ne sont pas
    des clientes. */
export function repondusSousUneHeure(messages: readonly MessageWa[], jour: string, maintenantMs?: number): ReponsesDuJour {
  const parNumero = new Map<string, MessageWa[]>();
  for (const m of messages) {
    if (m.canal === 'site' || estReserve(m.tiroir)) continue;
    const n = numeroWa(m.numero);
    if (!n) continue;
    const liste = parNumero.get(n);
    if (liste) liste.push(m); else parNumero.set(n, [m]);
  }
  const r: ReponsesDuJour = { questions: 0, repondues: 0, enCours: 0 };
  const juge = (debut: string, reponseA: string | null) => {
    if (jourACotonou(debut) !== jour) return;
    const t = Date.parse(debut);
    if (reponseA) { r.questions += 1; if (Date.parse(reponseA) - t <= UNE_HEURE_MS) r.repondues += 1; }
    else if (maintenantMs !== undefined && maintenantMs - t < UNE_HEURE_MS) r.enCours += 1;
    else r.questions += 1;
  };
  for (const liste of parNumero.values()) {
    liste.sort((a, b) => a.quand.localeCompare(b.quand));
    let debut: string | null = null;
    for (const m of liste) {
      if (m.sens === 'entrant') { if (debut === null) debut = m.quand; continue; }
      if (debut !== null && estUneMainHumaine(m)) { juge(debut, m.quand); debut = null; }
    }
    if (debut !== null) juge(debut, null);
  }
  return r;
}

export type ReponsesGratuites = { plafond: number; utilisees: number; restantes: number };

/** « RÉPONSES LIBRES GRATUITES RESTANTES CE MOIS, n sur 1 000 » : le palier
    de Meta moins ce que `compteDesModeles` (shared/conversations) a compté.
    `mois` : « 2026-10 ». Le palier est par numéro, pas par branche. */
export function reponsesGratuitesRestantes(messages: readonly MessageWa[], mois: string, branchId?: string): ReponsesGratuites {
  const utilisees = compteDesModeles(messages, mois, branchId).reponses;
  return { plafond: REPONSES_GRATUITES_DU_MOIS, utilisees, restantes: Math.max(0, REPONSES_GRATUITES_DU_MOIS - utilisees) };
}
