/* ══ LES DIX DU LUNDI — 26 novembre 2026 ═══════════════════════════════════
   L'audit du Trône (point B2, « Faire revenir celles qui ont glissé »),
   validé par Yéman d'un « construis » : 124 clientes sans rituel depuis deux
   à douze mois et sans rendez-vous à venir, dont 55 venues une seule fois ;
   Perle repère « en retard », « une seule venue » et « endormie », mais ne
   mesure rien et tout passe à la main. Chaque lundi, DIX clientes à
   recontacter, chacune avec son message prêt et le bon soin ; le résultat se
   compte en francs.

   LA LISTE EST FIGÉE POUR LA SEMAINE. Calculée une fois (le lundi, ou à la
   première ouverture de la semaine, au jour du salon), rangée par branche et
   par semaine ISO dans le document `mnd_les_dix_du_lundi` : elle ne se
   rebat pas pendant que l'équipe la travaille. Ce qui se relit à chaque
   écran : le message (ses deux places sont celles du jour), le soin et son
   prix (le catalogue du jour), et ce qui la fait taire depuis lundi.

   QUI ENTRE. Son dernier rituel honoré il y a 60 à 365 jours, aucun
   rendez-vous à venir. Jamais : une fiche d'essai, archivée, de la diaspora
   (la saison de la diaspora s'en occupe, point B6), « de passage » POSÉ À LA
   MAIN, locks défaits, un enfant d'un foyer (un autre paie pour elle ; son
   parent payeur entre s'il a glissé lui-même), un STOP, « jamais pour
   elle », une situation éteinte par la direction, un souci ouvert, une somme
   due, une relance de Perle de moins de quatre semaines (deux en saison des
   fêtes), un message de la Maison de moins de quatorze jours, la promesse
   des deux nouvelles par mois déjà tenue, et qui ne peut rien recevoir
   (sans Ma Couronne ni numéro ; l'endormie sans Ma Couronne ni accord des
   nouvelles : elle ne part pas à la main, choix du 27 octobre 2026).

   « DE PASSAGE » : la marque que la machine pose seule sur une tête venue
   une fois (`clienteDePassage`, levée à la deuxième venue) n'écarte PAS :
   ce sont précisément les « une seule venue » de l'audit (50 sur 55 le
   26 novembre 2026). Celle qu'une main a posée (`passagePose`) écarte,
   comme au Classement.

   LE MOTIF, DANS L'ORDRE DE PERLE (`situationDuJour`, ④) : 150 jours sans
   venir, endormie (trois fois au plus, six semaines d'écart) ; sinon une
   seule venue ; sinon en retard, si sa date de cadence est passée d'au
   moins dix jours (une cliente à rythme lent n'a pas glissé).

   LE RANG. Ce qu'elle a réglé à la Maison (toutes ses venues, la pièce du
   rituel ou ses versements), pondéré par la fraîcheur de son départ (1 à
   60 jours, 0,4 à 365) ; à égalité, plus de venues, puis la plus fraîche.
   QUATRE PLACES au plus sont gardées aux clientes d'une seule venue : la
   chute entre la première et la deuxième venue est la plus grosse fuite.

   LE MESSAGE est celui de Perle, mot pour mot (ses modèles « place » et
   « endormie », ses variables) ; le canal aussi (`canalDe`) : Ma Couronne
   d'abord, sinon le bouton WhatsApp, à la main. « Envoyé » écrit au journal
   des envois la même ligne que le toucher de Perle (`ligneALaMain`, ou la
   notification `ligneDeNotification`) : elle compte pour les quatorze jours,
   les relances et la promesse des deux par mois.

   LE RÉSULTAT, EN FRANCS : une cliente contactée est REVENUE quand un
   rendez-vous pris après le contact est honoré dans les 60 jours ; ce qu'il
   a rapporté est ce qui a été réglé (la pièce du rituel ou ses versements),
   jamais un prix deviné.

   Pur : ni magasin, ni réseau, ni horloge. `scripts/verifie-les-dix-du-lundi.mjs`
   le prouve (et `--prouve`). */
import {
  ECART_MIN, ENDORMIE_DES_JOURS, ENDORMIE_ECART, ENDORMIE_FOIS_MAX, ENVIE_REFUSEE_ATTEND, MODELES_DE_GERARD, RELANCE_APRES_CADENCE,
  RELANCE_TOUS_LES_JOURS, UNE_VENUE_APRES, aLaMainSeulement, canalDe, dateDeCadence, derniereVenue, deuxPlacesDites, ecartJours,
  intervalleDesRelances, jourDit, plusJours, prochainRdv, promesseDe, propositionDesPlaces, remplis,
  type CleDeModele, type FicheDeGerard, type GenreDeMessage, type Place, type Situation,
} from './gerard-pur';
import { apptPaidXof } from './agenda-pur';
import { invoiceRegleXof } from './finance-pur';
import { leRituelDOffice, sesProchainsRituels, type VenueDuProchainRituel } from './prochain-rituel-pur';
import type { Invoice } from './finance';

/* ── LES RÈGLES CHOISIES ─────────────────────────────────────────────── */
export const CLE_DES_DIX_DU_LUNDI = 'mnd_les_dix_du_lundi';
export const DIX = 10;
/** Les places gardées aux clientes d'une seule venue, au plus. */
export const PLACES_DES_UNE_VENUE = 4;
/** Glissée : son dernier rituel il y a au moins tant de jours (celui de Perle, « une seule venue »)… */
export const GLISSEE_DES_JOURS = UNE_VENUE_APRES;
/** … et au plus tant de jours. */
export const GLISSEE_JUSQU_A_JOURS = 365;
/** « Plus tard » : hors de la liste tant de jours, la règle de la Maison pour une proposition refusée. */
export const PLUS_TARD_JOURS = ENVIE_REFUSEE_ATTEND;
/** « Pas joignable » : elle peut revenir dans une liste après quatre semaines, l'écart des relances de Perle. */
export const PAS_JOIGNABLE_JOURS = RELANCE_TOUS_LES_JOURS;
/** Un rendez-vous pris après le contact, honoré dans tant de jours : elle est revenue. */
export const RETOUR_DANS_LES_JOURS = 60;
/** La fraîcheur la plus basse, à 365 jours. */
export const FRAICHEUR_MIN = 0.4;

export type MotifDuLundi = 'une-venue' | 'retard' | 'endormie';
export const MOTIF_DIT: Record<MotifDuLundi, string> = { 'une-venue': 'Une seule venue', retard: 'En retard', endormie: 'Endormie' };
const MODELE_DU_MOTIF: Record<MotifDuLundi, CleDeModele> = { 'une-venue': 'place', retard: 'place', endormie: 'endormie' };

/* ── LA SEMAINE ──────────────────────────────────────────────────────── */
/** Le lundi de la semaine d'un jour (AAAA-MM-JJ). */
export const lundiDeLaSemaine = (jour: string): string => {
  const d = new Date(`${jour.slice(0, 10)}T12:00:00Z`);
  return plusJours(jour.slice(0, 10), -((d.getUTCDay() + 6) % 7));
};
/** LA SEMAINE ISO d'un jour : « 2026-W48 ». Elle porte l'année de son jeudi. */
export function semaineIso(jour: string): string {
  const jeudi = plusJours(lundiDeLaSemaine(jour), 3);
  const annee = Number(jeudi.slice(0, 4));
  const rang = ecartJours(`${annee}-01-01`, jeudi);
  return `${annee}-W${String(Math.floor(rang / 7) + 1).padStart(2, '0')}`;
}
export const cleDeLaListe = (branchId: string, semaine: string): string => `${branchId}|${semaine}`;

/* ── LE DOCUMENT ─────────────────────────────────────────────────────── */
export type GesteDuLundi =
  | { quoi: 'envoye'; le: string; par: string; canal: 'whatsapp' | 'couronne'; envoiId: string }
  | { quoi: 'injoignable'; le: string; par: string }
  | { quoi: 'plus-tard'; le: string; par: string; jusquau: string };
export type LigneDuLundi = {
  clientId: string;
  motif: MotifDuLundi;
  /** Son dernier rituel honoré, le jour où la liste s'est figée. */
  derniereVenue: string;
  venues: number;
  /** Ce qu'elle avait réglé à la Maison, toutes venues, le jour où la liste s'est figée. */
  apporteXof: number;
  geste?: GesteDuLundi;
};
export type RaisonHors =
  | 'essai' | 'archivee' | 'diaspora' | 'passage-pose' | 'locks' | 'enfant' | 'a-reprogrammer' | 'stop' | 'jamais' | 'eteinte'
  | 'silence' | 'recemment' | 'plafond' | 'plus-tard' | 'injoignable' | 'pas-en-retard' | 'endormie-assez' | 'sans-canal' | 'hors-des-dix';
export const RAISON_HORS_DITE: Record<RaisonHors, string> = {
  essai: 'fiche d’essai', archivee: 'archivée', diaspora: 'de la diaspora (la saison de la diaspora)', 'passage-pose': '« de passage » posé à la main',
  locks: 'locks défaits', enfant: 'enfant d’un foyer (le parent payeur reçoit)', 'a-reprogrammer': 'un rendez-vous à reprogrammer l’attend déjà',
  stop: 'a dit STOP', jamais: '« jamais pour elle »',
  eteinte: 'situation éteinte par la direction', silence: 'un souci ouvert ou une somme due', recemment: 'la Maison lui a écrit récemment',
  plafond: 'deux nouvelles ce mois', 'plus-tard': '« plus tard » (90 jours)', injoignable: '« pas joignable » il y a moins de quatre semaines',
  'pas-en-retard': 'son rythme ne la dit pas encore en retard', 'endormie-assez': 'endormie, déjà relancée trois fois',
  'sans-canal': 'rien ne peut lui parvenir (endormie sans Ma Couronne ni accord des nouvelles, ou sans numéro)',
  'hors-des-dix': 'au-delà des dix',
};
export type ListeDuLundi = {
  branchId: string;
  semaine: string;
  lundi: string;
  figeeLe: string;
  lignes: LigneDuLundi[];
  /** Les glissées qui pouvaient entrer, avant la coupe à dix. */
  vivier: number;
  /** Les glissées restées dehors, par raison. */
  hors: Partial<Record<RaisonHors, number>>;
};
export type DocumentDuLundi = { listes: Record<string, ListeDuLundi> };
export const DOCUMENT_DU_LUNDI_VIDE: DocumentDuLundi = { listes: {} };

const estUnJour = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x);
const MOTIFS = new Set<string>(['une-venue', 'retard', 'endormie']);
function gesteLu(g: unknown): GesteDuLundi | undefined {
  const x = g as Partial<Record<string, unknown>> | null | undefined;
  if (!x || typeof x !== 'object' || !estUnJour(x.le) || !Number.isFinite(Date.parse(x.le))) return undefined;
  const par = typeof x.par === 'string' ? x.par : '';
  if (x.quoi === 'envoye') {
    return { quoi: 'envoye', le: x.le, par, canal: x.canal === 'couronne' ? 'couronne' : 'whatsapp', envoiId: typeof x.envoiId === 'string' ? x.envoiId : '' };
  }
  if (x.quoi === 'injoignable') return { quoi: 'injoignable', le: x.le, par };
  if (x.quoi === 'plus-tard') return { quoi: 'plus-tard', le: x.le, par, jusquau: estUnJour(x.jusquau) ? x.jusquau.slice(0, 10) : plusJours(x.le.slice(0, 10), PLUS_TARD_JOURS) };
  return undefined;
}
/** Le document tel qu'il descend, lu sans confiance : une liste abîmée ne casse rien. */
export function documentDuLundiLu(brut: unknown): DocumentDuLundi {
  const listes = (brut as { listes?: unknown } | null | undefined)?.listes;
  if (!listes || typeof listes !== 'object') return { listes: {} };
  const out: Record<string, ListeDuLundi> = {};
  for (const [cle, l] of Object.entries(listes as Record<string, unknown>)) {
    const x = l as Partial<ListeDuLundi> | null;
    if (!x || typeof x.branchId !== 'string' || typeof x.semaine !== 'string' || !Array.isArray(x.lignes)) continue;
    const lignes: LigneDuLundi[] = [];
    for (const brute of x.lignes as unknown[]) {
      const y = brute as Partial<LigneDuLundi> | null;
      if (!y || typeof y.clientId !== 'string' || !MOTIFS.has(String(y.motif)) || lignes.some((z) => z.clientId === y.clientId)) continue;
      const geste = gesteLu(y.geste);
      lignes.push({
        clientId: y.clientId, motif: y.motif as MotifDuLundi, derniereVenue: estUnJour(y.derniereVenue) ? y.derniereVenue.slice(0, 10) : '',
        venues: Number(y.venues) || 0, apporteXof: Math.max(0, Math.round(Number(y.apporteXof) || 0)), ...(geste ? { geste } : {}),
      });
    }
    out[cle] = {
      branchId: x.branchId, semaine: x.semaine, lundi: estUnJour(x.lundi) ? x.lundi.slice(0, 10) : '', figeeLe: estUnJour(x.figeeLe) && Number.isFinite(Date.parse(x.figeeLe)) ? x.figeeLe : '',
      lignes: lignes.slice(0, DIX), vivier: Number(x.vivier) || 0, hors: x.hors && typeof x.hors === 'object' ? x.hors : {},
    };
  }
  return { listes: out };
}

/** FIGER LA SEMAINE : une liste déjà là ne se réécrit JAMAIS (un second poste
    qui la calculerait au même instant ne la rebat pas). */
export function figeLaListe(doc: DocumentDuLundi, liste: ListeDuLundi): DocumentDuLundi {
  const cle = cleDeLaListe(liste.branchId, liste.semaine);
  if (doc.listes[cle]) return doc;
  return { listes: { ...doc.listes, [cle]: { ...liste, lignes: liste.lignes.slice(0, DIX) } } };
}

/** UN GESTE SUR UNE LIGNE. « Envoyé » est définitif : le message est parti,
    rien ne le défait. Les deux autres se posent sur une ligne libre. */
export function poseLeGeste(doc: DocumentDuLundi, cle: string, clientId: string, geste: GesteDuLundi): DocumentDuLundi {
  const l = doc.listes[cle];
  if (!l) return doc;
  const i = l.lignes.findIndex((x) => x.clientId === clientId);
  if (i < 0 || l.lignes[i].geste) return doc;
  const lignes = l.lignes.map((x, k) => (k === i ? { ...x, geste } : x));
  return { listes: { ...doc.listes, [cle]: { ...l, lignes } } };
}
/** « Annuler » : « Pas joignable » et « Plus tard » se défont ; « Envoyé », jamais. */
export function retireLeGeste(doc: DocumentDuLundi, cle: string, clientId: string): DocumentDuLundi {
  const l = doc.listes[cle];
  if (!l) return doc;
  const i = l.lignes.findIndex((x) => x.clientId === clientId);
  if (i < 0 || !l.lignes[i].geste || l.lignes[i].geste!.quoi === 'envoye') return doc;
  const lignes = l.lignes.map((x, k) => {
    if (k !== i) return x;
    const libre: LigneDuLundi = { ...x };
    delete libre.geste;
    return libre;
  });
  return { listes: { ...doc.listes, [cle]: { ...l, lignes } } };
}

/** CE QUE LES LISTES PASSÉES ÉCARTENT ENCORE : « plus tard » jusqu'à sa date,
    « pas joignable » quatre semaines, « envoyé » le temps d'une relance (la
    trace de Perle le dit aussi ; ceci tient si la ligne du journal manque). */
export function ecarteesParLesListes(doc: DocumentDuLundi, branchId: string, aujourdhui: string): Map<string, RaisonHors> {
  const out = new Map<string, RaisonHors>();
  for (const l of Object.values(doc.listes)) {
    if (l.branchId !== branchId) continue;
    for (const x of l.lignes) {
      const g = x.geste;
      if (!g) continue;
      const jour = g.le.slice(0, 10);
      if (g.quoi === 'plus-tard' && aujourdhui < g.jusquau) out.set(x.clientId, 'plus-tard');
      else if (g.quoi === 'injoignable' && ecartJours(jour, aujourdhui) < PAS_JOIGNABLE_JOURS && !out.has(x.clientId)) out.set(x.clientId, 'injoignable');
      else if (g.quoi === 'envoye' && ecartJours(jour, aujourdhui) < intervalleDesRelances(aujourdhui) && !out.has(x.clientId)) out.set(x.clientId, 'recemment');
    }
  }
  return out;
}

/* ── CE QU'ELLE A RÉGLÉ ──────────────────────────────────────────────── */
type RdvRegle = { id: string; invoiceId?: string | null; payments?: readonly { amountXof?: number | string }[]; paidXof?: number | string };
/** CE QU'UN RENDEZ-VOUS A RAPPORTÉ : ce que sa pièce a reçu, ou ses versements,
    le plus grand des deux (ils disent le même argent) ; une pièce partagée par
    plusieurs rendez-vous (un foyer) ne compte que les versements du sien. */
export function encaisseDesRdvs(rdvs: readonly RdvRegle[], pieces: readonly Invoice[]): Map<string, number> {
  const parId = new Map(pieces.filter((p) => p.kind === 'facture').map((p) => [p.id, p]));
  const parRdv = new Map(pieces.filter((p) => p.kind === 'facture' && !!p.apptId).map((p) => [p.apptId as string, p]));
  const partage = new Map<string, number>();
  for (const a of rdvs) if (a.invoiceId) partage.set(a.invoiceId, (partage.get(a.invoiceId) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const a of rdvs) {
    const piece = (a.invoiceId ? parId.get(a.invoiceId) : undefined) ?? parRdv.get(a.id);
    const verse = Math.max(0, apptPaidXof(a));
    const recu = piece && (partage.get(piece.id) ?? 0) <= 1 ? Math.max(0, invoiceRegleXof(piece)) : 0;
    out.set(a.id, Math.round(Math.max(verse, recu)));
  }
  return out;
}

/* ── QUI ENTRE ───────────────────────────────────────────────────────── */
export type MarquesDeLaFiche = {
  essai?: boolean; archivee?: boolean; diaspora?: boolean; passagePose?: boolean; locksDefaits?: boolean;
  /** Un rendez-vous « à reprogrammer » l'attend (19 novembre 2026) : Opale et l'équipe la suivent déjà. */
  aReprogrammer?: boolean;
};
export type CandidateDuLundi = { fiche: FicheDeGerard; marques: MarquesDeLaFiche; apporteXof: number };
export type Retenue = { clientId: string; motif: MotifDuLundi; derniereVenue: string; sansVenir: number; venues: number; apporteXof: number; score: number };
export type JugementDuLundi = { dans: true; retenue: Retenue } | { dans: false; raison: RaisonHors };
export type OptionsDuLundi = {
  aujourdhui: string;
  /** Les situations éteintes par la direction (`mnd_gerard.eteintes`). */
  eteintes?: readonly GenreDeMessage[];
  /** Ce que les listes passées écartent encore (`ecarteesParLesListes`). */
  ecartees?: ReadonlyMap<string, RaisonHors>;
};

const RELANCES: readonly GenreDeMessage[] = ['retard', 'une-venue', 'endormie', 'creux'];
const derniereDe = (f: FicheDeGerard, genres: readonly GenreDeMessage[] | null): string | undefined =>
  f.traces.filter((t) => (genres ? genres.includes(t.genre) : t.genre !== 'garder')).map((t) => t.quand.slice(0, 10)).sort().pop();
const venuesDe = (f: FicheDeGerard): number => f.rdvs.filter((r) => r.venu).length;

/** LA FRAÎCHEUR DE SON DÉPART : 1 à 60 jours, 0,4 à 365, en ligne droite. */
export const fraicheur = (sansVenir: number): number => {
  const t = (Math.min(GLISSEE_JUSQU_A_JOURS, Math.max(GLISSEE_DES_JOURS, sansVenir)) - GLISSEE_DES_JOURS) / (GLISSEE_JUSQU_A_JOURS - GLISSEE_DES_JOURS);
  return 1 - (1 - FRAICHEUR_MIN) * t;
};
export const scoreDuLundi = (apporteXof: number, sansVenir: number): number => Math.round(Math.max(0, apporteXof) * fraicheur(sansVenir));

/** A-T-ELLE GLISSÉ ? Son dernier rituel dans la fenêtre, rien à venir. `null` : non, elle n'est pas comptée. */
export function aGlisse(f: FicheDeGerard, aujourdhui: string): { derniere: string; sansVenir: number } | null {
  const s0 = derniereVenue(f, aujourdhui);
  if (!s0) return null;
  const sansVenir = ecartJours(s0, aujourdhui);
  if (sansVenir < GLISSEE_DES_JOURS || sansVenir > GLISSEE_JUSQU_A_JOURS) return null;
  if (prochainRdv(f, aujourdhui)) return null;
  return { derniere: s0, sansVenir };
}

/** LE MOTIF, dans l'ordre de Perle : endormie, une seule venue, en retard. */
export function motifDe(f: FicheDeGerard, sansVenir: number): MotifDuLundi {
  if (sansVenir >= ENDORMIE_DES_JOURS) return 'endormie';
  return venuesDe(f) === 1 ? 'une-venue' : 'retard';
}

/** CE QUI LA FAIT TAIRE AUJOURD'HUI, commun au jour où la liste se fige et à
    l'instant où l'on envoie. `null` : rien, elle peut recevoir. */
export function cequiLaTait(f: FicheDeGerard, motif: MotifDuLundi, o: Pick<OptionsDuLundi, 'aujourdhui' | 'eteintes'>): RaisonHors | null {
  const A = o.aujourdhui;
  if (f.stop) return 'stop';
  if (f.jamais?.includes(motif)) return 'jamais';
  if (o.eteintes?.includes(motif)) return 'eteinte';
  if (f.souciOuvert || (f.resteDu ?? 0) > 0) return 'silence';
  const recemment = [derniereDe(f, null), f.dernierMessageHorsService?.slice(0, 10)].filter((x): x is string => !!x).sort().pop();
  if (recemment && ecartJours(recemment, A) < ECART_MIN) return 'recemment';
  const relance = derniereDe(f, RELANCES);
  if (relance && ecartJours(relance, A) < intervalleDesRelances(A)) return 'recemment';
  if (motif === 'endormie') {
    const fois = f.traces.filter((t) => t.genre === 'endormie').map((t) => t.quand.slice(0, 10)).sort();
    if (fois.length >= ENDORMIE_FOIS_MAX) return 'endormie-assez';
    if (fois.length && ecartJours(fois[fois.length - 1], A) < ENDORMIE_ECART) return 'recemment';
  }
  if (!promesseDe(f, A).tenue) return 'plafond';
  if (!canalDe(f, motif)) return 'sans-canal';
  return null;
}

/** LE JUGEMENT D'UNE GLISSÉE, au jour où la liste se fige. `null` : elle n'a pas glissé. */
export function jugeLaCandidate(c: CandidateDuLundi, o: OptionsDuLundi): JugementDuLundi | null {
  const f = c.fiche;
  const g = aGlisse(f, o.aujourdhui);
  if (!g) return null;
  const non = (raison: RaisonHors): JugementDuLundi => ({ dans: false, raison });
  const m = c.marques;
  if (m.essai) return non('essai');
  if (m.archivee || f.archivee) return non('archivee');
  if (m.diaspora) return non('diaspora');
  if (m.passagePose) return non('passage-pose');
  if (m.locksDefaits) return non('locks');
  if (f.enfantDuFoyer) return non('enfant');
  if (m.aReprogrammer) return non('a-reprogrammer');
  const motif = motifDe(f, g.sansVenir);
  if (motif === 'retard') {
    const c0 = dateDeCadence(f, o.aujourdhui);
    if (!c0 || ecartJours(c0.iso, o.aujourdhui) < RELANCE_APRES_CADENCE) return non('pas-en-retard');
  }
  const ecartee = o.ecartees?.get(f.id);
  if (ecartee) return non(ecartee);
  const tait = cequiLaTait(f, motif, o);
  if (tait) return non(tait);
  const venues = venuesDe(f);
  return { dans: true, retenue: { clientId: f.id, motif, derniereVenue: g.derniere, sansVenir: g.sansVenir, venues, apporteXof: Math.max(0, Math.round(c.apporteXof)), score: scoreDuLundi(c.apporteXof, g.sansVenir) } };
}

const avant = (a: Retenue, b: Retenue): number =>
  b.score - a.score || b.venues - a.venues || a.sansVenir - b.sansVenir || a.clientId.localeCompare(b.clientId);

/** LES DIX : le rang, et QUATRE places au plus gardées aux clientes d'une
    seule venue ; une place qu'elles ne prennent pas revient aux autres, et
    inversement. Rendues dans l'ordre du rang. */
export function choisisLesDix(candidates: readonly CandidateDuLundi[], o: OptionsDuLundi): { lignes: LigneDuLundi[]; vivier: number; hors: Partial<Record<RaisonHors, number>> } {
  const hors: Partial<Record<RaisonHors, number>> = {};
  const dans: Retenue[] = [];
  for (const c of candidates) {
    const j = jugeLaCandidate(c, o);
    if (!j) continue;
    if (j.dans) dans.push(j.retenue);
    else hors[j.raison] = (hors[j.raison] ?? 0) + 1;
  }
  dans.sort(avant);
  const une = dans.filter((r) => r.venues === 1);
  const autres = dans.filter((r) => r.venues !== 1);
  const gardees = une.slice(0, PLACES_DES_UNE_VENUE);
  const choisies = [...gardees, ...autres.slice(0, DIX - gardees.length)];
  for (const r of [...une.slice(gardees.length), ...autres]) {
    if (choisies.length >= DIX) break;
    if (!choisies.includes(r)) choisies.push(r);
  }
  choisies.sort(avant);
  const restees = dans.length - choisies.length;
  if (restees > 0) hors['hors-des-dix'] = restees;
  return {
    lignes: choisies.map((r) => ({ clientId: r.clientId, motif: r.motif, derniereVenue: r.derniereVenue, venues: r.venues, apporteXof: r.apporteXof })),
    vivier: dans.length,
    hors,
  };
}

/* ── LE MESSAGE, CELUI DE PERLE ──────────────────────────────────────── */
/** Ce que Perle lui écrirait pour ce motif (`situationDuJour`, ④), mot pour
    mot : « place » avec deux places et son rituel pour une une-venue déjà
    resserrée ou une en retard ; « place » et « premier resserrage des
    racines » pour une une-venue venue pour autre chose ; « endormie » et
    ses mois sans venir. `null` : rien ne peut partir. */
export function situationDuLundi(f: FicheDeGerard, motif: MotifDuLundi, ctx: { aujourdhui: string; placesDe: (clientId: string) => readonly Place[] }): Situation | null {
  const A = ctx.aujourdhui;
  const s0 = derniereVenue(f, A);
  const canal = canalDe(f, motif);
  if (!s0 || !canal) return null;
  const modele = MODELE_DU_MOTIF[motif];
  let variables: string[];
  let extra: Partial<Situation> = {};
  if (motif === 'endormie') {
    variables = [f.appel, String(Math.floor(ecartJours(s0, A) / 30))];
  } else {
    const places = ctx.placesDe(f.id);
    const dejaResserree = motif === 'retard' || f.rdvs.some((x) => x.venu && x.familles.includes('resserrage'));
    variables = [f.appel, dejaResserree ? f.soinDit : 'premier resserrage des racines', deuxPlacesDites(places)];
    extra = dejaResserree ? propositionDesPlaces(f, places) : {};
  }
  const main = canal === 'whatsapp' && aLaMainSeulement(f, motif);
  return {
    clientId: f.id, genre: motif, canal, modele, variables, texte: remplis(MODELES_DE_GERARD[modele].corps, variables),
    pourquoi: [['Les dix du lundi', MOTIF_DIT[motif]], ['Dernière venue', jourDit(s0)], ...(main ? [['Accord des nouvelles', 'pas encore : à la main seulement'] as [string, string]] : [])],
    /* La priorité ordonne le plan du jour de Perle ; la liste a son propre rang. */
    priorite: 0,
    ...(main ? { aLaMainSeulement: true } : {}),
    ...extra,
  };
}

/** LE BON SOIN : celui que la carte « Son prochain rituel » lui proposerait au
    comptoir (`sesProchainsRituels`, `leRituelDOffice`), ses gestes sous leurs
    successeurs, jamais une création. Vide : elle n'est venue que pour une
    création (ou des gestes fermés) ; le message dit alors « premier
    resserrage des racines », et son prix suit le comptage. */
export function leBonSoin(o: {
  rdvs: readonly VenueDuProchainRituel[];
  clientId: string;
  aujourdhui: string;
  proposable: (serviceId: string) => boolean;
  successeur?: (serviceId: string) => string | undefined;
  estCreation?: (serviceId: string) => boolean;
  cadenceJours?: number | null;
}): string[] {
  const rituels = sesProchainsRituels({
    rdvs: o.rdvs, clientId: o.clientId, aujourdhui: o.aujourdhui,
    proposable: o.proposable, successeur: o.successeur, estCreation: o.estCreation, cadenceJours: o.cadenceJours,
  });
  const i = leRituelDOffice(rituels);
  return i >= 0 ? [...rituels[i].ids] : [];
}

/** POURQUOI ELLE EST LÀ, en une phrase courte. */
export function pourquoiElle(f: FicheDeGerard | undefined, l: Pick<LigneDuLundi, 'motif' | 'derniereVenue'>, aujourdhui: string): string {
  const jours = l.derniereVenue ? ecartJours(l.derniereVenue, aujourdhui) : 0;
  if (l.motif === 'une-venue') return `Venue une seule fois, il y a ${jours} jours : sa deuxième venue se joue maintenant.`;
  if (l.motif === 'endormie') return `${Math.floor(jours / 30)} mois sans venir.`;
  const c = f ? dateDeCadence(f, aujourdhui) : null;
  const rythme = f?.cadence.rythmeJours ? `, à son rythme de ${Math.round(f.cadence.rythmeJours / 7)} semaines` : '';
  return c && !c.posee && c.iso < aujourdhui ? `En retard de ${ecartJours(c.iso, aujourdhui)} jours${rythme}.` : `${jours} jours sans venir${rythme}.`;
}

/* ── L'ÉTAT D'UNE LIGNE, À L'ÉCRAN ───────────────────────────────────── */
export type EtatDuLundi =
  | { etat: 'a-faire'; situation: Situation }
  | { etat: 'envoye' | 'injoignable' | 'plus-tard'; geste: GesteDuLundi }
  | { etat: 'a-repris'; date: string }
  | { etat: 'tue'; raison: RaisonHors | 'repondre' | 'facture' | 'sans-fiche'; dit: string };

/** CE QUE LA LIGNE MONTRE : son geste, sinon son rendez-vous repris seule,
    sinon ce qui la fait taire depuis lundi (rejugé ici, à l'instant), sinon
    le message prêt. */
export function etatDeLaLigne(l: LigneDuLundi, f: FicheDeGerard | undefined, o: Pick<OptionsDuLundi, 'aujourdhui' | 'eteintes'> & { placesDe: (clientId: string) => readonly Place[] }): EtatDuLundi {
  if (l.geste) return { etat: l.geste.quoi, geste: l.geste };
  if (!f || f.archivee) return { etat: 'tue', raison: 'sans-fiche', dit: 'Sa fiche n’est plus là.' };
  const r = prochainRdv(f, o.aujourdhui);
  if (r) return { etat: 'a-repris', date: r.date };
  const tait = cequiLaTait(f, l.motif, o);
  if (tait) {
    const derniere = [derniereDe(f, null), f.dernierMessageHorsService?.slice(0, 10)].filter((x): x is string => !!x).sort().pop();
    const dit = tait === 'recemment' && derniere ? `Écrite le ${jourDit(derniere)} : attendre.` : `${RAISON_HORS_DITE[tait][0].toUpperCase()}${RAISON_HORS_DITE[tait].slice(1)}.`;
    return { etat: 'tue', raison: tait, dit };
  }
  /* Deux silences d'un moment, comme Perle : une réponse qu'on lui doit, une relance de facture de la semaine. */
  if (f.attendUneReponse) return { etat: 'tue', raison: 'repondre', dit: 'Elle a écrit : lui répondre d’abord.' };
  if (f.derniereRelanceLe && ecartJours(f.derniereRelanceLe, o.aujourdhui) < 7) return { etat: 'tue', raison: 'facture', dit: 'Relancée pour une facture cette semaine.' };
  const s = situationDuLundi(f, l.motif, o);
  return s ? { etat: 'a-faire', situation: s } : { etat: 'tue', raison: 'sans-canal', dit: `${RAISON_HORS_DITE['sans-canal'][0].toUpperCase()}${RAISON_HORS_DITE['sans-canal'].slice(1)}.` };
}

/* ── LE RÉSULTAT, EN FRANCS ──────────────────────────────────────────── */
export type RdvDuRetour = { id: string; clientId?: string; date: string; status: string; creeLe?: string; encaisseXof: number };
export type Retour = { etat: 'revenue'; date: string; encaisseXof: number; rdvId: string } | { etat: 'rdv-pris'; date: string; rdvId: string };

/** EST-ELLE REVENUE ? Un rendez-vous PRIS après le contact (`creeLe`, jamais
    deviné), daté dans les 60 jours, honoré : revenue, avec ce qu'il a
    rapporté. Pris mais pas encore venu : « rendez-vous pris ». */
export function retourDuContact(o: { contactLe: string; rdvs: readonly RdvDuRetour[]; aujourdhui: string }): Retour | null {
  const jour = o.contactLe.slice(0, 10);
  const fin = plusJours(jour, RETOUR_DANS_LES_JOURS);
  const pris = o.rdvs
    .filter((a) => !!a.creeLe && a.creeLe >= o.contactLe && a.status !== 'annulé' && a.date.slice(0, 10) >= jour && a.date.slice(0, 10) <= fin)
    .sort((a, b) => a.date.localeCompare(b.date));
  const venu = pris.find((a) => a.status === 'honoré' || (a.date.slice(0, 10) < o.aujourdhui && a.encaisseXof > 0));
  if (venu) return { etat: 'revenue', date: venu.date.slice(0, 10), encaisseXof: Math.max(0, Math.round(venu.encaisseXof)), rdvId: venu.id };
  const aVenir = pris.find((a) => a.date.slice(0, 10) >= o.aujourdhui);
  return aVenir ? { etat: 'rdv-pris', date: aVenir.date.slice(0, 10), rdvId: aVenir.id } : null;
}

export type BilanDuLundi = { lignes: number; contactees: number; rdvPris: number; revenues: number; francs: number };
/** LE BILAN d'une ou de plusieurs listes : contactées, rendez-vous pris, revenues, francs. */
export function bilanDuLundi(lignes: readonly { geste?: GesteDuLundi; retour: Retour | null }[]): BilanDuLundi {
  const b: BilanDuLundi = { lignes: lignes.length, contactees: 0, rdvPris: 0, revenues: 0, francs: 0 };
  for (const l of lignes) {
    if (l.geste?.quoi !== 'envoye') continue;
    b.contactees += 1;
    if (l.retour?.etat === 'revenue') { b.revenues += 1; b.francs += l.retour.encaisseXof; }
    else if (l.retour?.etat === 'rdv-pris') b.rdvPris += 1;
  }
  return b;
}
