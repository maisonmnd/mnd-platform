/* ══ CE QUE ÇA RAPPORTE, LE COMPTE DE L'ASSISTANT · 26 octobre 2026 ═══════
   Spécification de l'Assistant Maison (§5.5 et §6.5, maquette v4
   « construis ») : « le compte de l'Assistant une fois par semaine : par
   situation, ce qu'il a coûté et fait revenir ; à qui il peut écrire ; qui
   écrit seul avec l'état réel ; ce que Claude coûte ».

   Ses règles chiffrées, mot pour mot :
     · VENUE GAGNÉE = un rendez-vous PRIS (`creeLe`) dans les 14 jours après
       le départ du message, honoré, encaissé ; une venue n'est gagnée qu'une
       fois, au premier message de la fenêtre (même règle que
       `resultatDeLaCampagne` et `mesureDesEnvois`) ;
     · VERDICT à partir de 20 envois seulement : utile si taux ≥ 10 % et
       rendement ≥ 3 ; à éteindre si 0 venue ou rendement < 1 ; à regarder
       sinon ; sous 20, « à mesurer : n sur 20 », jamais un taux inventé ;
       pour « garder » (un service) : RDV tenus ÷ gardés ;
     · RENDEMENT = encaissé des venues gagnées ÷ remise réelle ; COÛT D'UNE
       VENUE = (remise réelle + messages Meta remis × tarif) ÷ venues ;
       Ma Couronne compte 0 F ;
     · COÛT META : « non renseigné » tant que la direction n'a pas posé ses
       tarifs (`mnd_tarifs_meta`, en francs) ; AUCUN tarif n'est inventé ici,
       comme `conversations.ts` le refuse depuis septembre ;
     · DEUX VOIX LA MÊME SEMAINE : clientes ayant reçu deux messages hors
       service en 7 jours, toutes voix confondues ; visé 0. Les services sont
       ceux de `dernier-message-pur` (`estUnService`), jamais un second juge.

   Ce module ne lit rien : l'écran lui donne la table `envois`, les RDV (avec
   l'encaissé déjà calculé par `apptPaidXof`), les codes, les WhatsApp
   sortants, et l'état lu de dehors (GET des fonctions, documents). Il rend
   des chiffres, jamais une phrase sans chiffre.

   Pur : `scripts/verifie-ce-que-ca-rapporte.mjs` le prouve. */

import { MODELES_DE_GERARD, type CleDeModele } from './gerard-pur';
import { estUnService, jourACotonou } from './dernier-message-pur';
import { devenuDe, TYPE_DIT, jourDuSalon, type EnvoiLu } from './envois';
import { attendEncore, facteurVivant } from './salle-des-envois';
import { AUTOMATISATIONS_REELLES, compteDuMois, type AutomatisationReelle } from './automatisations-reelles-pur';
import { ENVOIS_POUR_MESURER, JOURS_DE_REPONSE } from './previsions-pur';
import { moisACotonou, type Compteur } from './ia-budget-pur';
import { PLAFOND_DES_HUIT_USD } from './ia-maison-pur';

/* ── CE QUE LE COMPTE LIT ─────────────────────────────────────────────── */

/** Une ligne `envois`, avec les champs que l'Assistant y pose. */
export type EnvoiDuCompte = EnvoiLu & {
  /** Le dépôt en salle : stable, quand `quand` est réécrit à chaque verdict du facteur. */
  deposeLe?: string;
  genre?: string;
  modele?: string;
  codePromo?: string;
  parQui?: string;
};
/** Un rendez-vous : `encaisseXof` est `apptPaidXof(a)`, calculé par l'écran (agenda.ts n'est pas pur). */
export type RdvDuCompte = { id: string; clientId: string; status: string; date: string; creeLe?: string; encaisseXof: number };
export type CodeDuCompte = { code: string; clientId?: string; utiliseLe?: string; remiseReelleXof?: number };
/** Un WhatsApp sortant de `messages_wa` : `modele` dit qu'une voix l'a envoyé. */
export type MessageDuCompte = { sens?: string; clientId?: string; quand?: string; modele?: string };

export type CategorieMeta = 'utilitaire' | 'marketing' | 'authentification';
/** Le barème de la direction, en francs par message remis. Vide : « non renseigné ». */
export type TarifsMeta = Partial<Record<CategorieMeta, number>>;

/** Deux jours AAAA-MM-JJ inclus, au jour de Cotonou. */
export type Periode = { du: string; au: string };
export type ChoixDePeriode = 'semaine' | 'mois' | 'depuis';
/** Le premier jour du compte : la mise en ligne de l'Assistant Maison. */
export const DEBUT_DU_COMPTE = '2026-10-26';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const midi = (j: string) => new Date(`${j}T12:00:00Z`);
/* Arithmétique de jours ancrée à midi UTC, écrite sans `slice(0, 10)` : la
   lettre que les gardes des purs interdisent sur une date (27 octobre 2026). */
const plusJours = (j: string, n: number): string => {
  const d = midi(j); d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const ecartJours = (a: string, b: string): number => Math.round((midi(b).getTime() - midi(a).getTime()) / 86_400_000);

/** Semaine : les sept derniers jours ; mois : du 1er à aujourd'hui ; depuis : depuis le 26 octobre 2026. */
export function periodeDuCompte(choix: ChoixDePeriode, aujourdhui: string): Periode {
  if (choix === 'semaine') return { du: plusJours(aujourdhui, -6), au: aujourdhui };
  if (choix === 'mois') return { du: `${aujourdhui.slice(0, 7)}-01`, au: aujourdhui };
  return { du: DEBUT_DU_COMPTE, au: aujourdhui };
}

/* ── PARTI, REMIS, SITUATION ──────────────────────────────────────────── */

const PARTI = new Set(['lu', 'remis', 'en-route', 'non-remis', 'a-la-main']);

/** Un message PARTI : ce que Meta a accepté, ou ce qui est parti à un
    toucher. Ce qui attend encore en salle n'est pas un envoi. */
export const estParti = (e: Pick<EnvoiDuCompte, 'statut' | 'etat'>): boolean => !attendEncore(e) && PARTI.has(devenuDe(e));
export const estRemis = (e: Pick<EnvoiDuCompte, 'statut' | 'etat'>): boolean => {
  const d = devenuDe(e);
  return d === 'lu' || d === 'remis';
};

/** La clé d'une situation : le genre pour l'Assistant, le type pour les autres voix. */
export const cleDeLaSituation = (e: Pick<EnvoiDuCompte, 'type' | 'genre'>): string =>
  e.type === 'gerard' ? (e.genre || 'gerard') : e.type;

/** Les mots de la maquette v4 (spec §11) ; un type inconnu se dit par le journal. */
export const SITUATION_DITE: Record<string, string> = {
  garder: 'Garder son RDV', anniversaire: 'Anniversaire', combiner: 'Tout combiner', envie: 'Une envie', creux: 'Une place (jour creux)',
  noel: 'Fêtes', retard: 'Reprise', 'une-venue': 'Une seule venue', endormie: 'Endormie', gerard: 'Assistant Maison',
  campagne: 'Offre flash', 'fete-de-couronne': 'Fête de couronne',
};
export const situationDite = (cle: string): string => SITUATION_DITE[cle] ?? TYPE_DIT[cle] ?? cle;
/** L'ordre de la maquette ; ce qui n'y est pas suit, par envoyés décroissants. */
const ORDRE_DES_SITUATIONS = ['garder', 'envie', 'creux', 'retard', 'combiner', 'une-venue', 'endormie', 'anniversaire', 'noel', 'campagne', 'avis-google'];

/** Le type `envois` qu'un modèle Meta écrit, pour le juger par `estUnService`. */
export function typeDuModeleMeta(modele: string): { type: string; genre?: string } {
  const g = (Object.entries(MODELES_DE_GERARD) as [CleDeModele, { nom: string }][]).find(([, m]) => m.nom === modele);
  if (g) return { type: 'gerard', genre: g[0] };
  const a = AUTOMATISATIONS_REELLES.find((x) => x.modeles.includes(modele));
  return { type: a?.types[0] ?? modele };
}

/** LA CATÉGORIE META D'UN ENVOI, ou null quand Meta ne facture rien (Ma
    Couronne, SMS, WhatsApp à un toucher). Un modèle inconnu se compte
    marketing : « on répond facturé quand on ne sait pas » (conversations.ts). */
export function categorieMetaDe(
  e: Pick<EnvoiDuCompte, 'type' | 'canal' | 'modele'>,
  categorieDuModele?: (modele: string) => CategorieMeta | undefined,
): CategorieMeta | null {
  if (e.canal !== 'whatsapp') return null;
  if (e.type === 'gerard') {
    const m = MODELES_DE_GERARD[e.modele as CleDeModele];
    return m ? (m.categorie === 'UTILITY' ? 'utilitaire' : 'marketing') : 'marketing';
  }
  const modele = e.modele ?? AUTOMATISATIONS_REELLES.find((a) => a.types.includes(e.type))?.modeles[0];
  return (modele ? categorieDuModele?.(modele) : undefined) ?? 'marketing';
}

/** Le code tel qu'il se compare : accents ôtés, capitales, lettres et
    chiffres seuls. Même geste que `normaliseLeCode` (promos.ts, qui n'est pas
    pur) ; l'écran peut passer le sien. */
const codeReduit = (brut: string | undefined): string =>
  (brut ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ── PAR SITUATION ────────────────────────────────────────────────────── */

export type Verdict = { etat: 'a-mesurer' | 'utile' | 'a-regarder' | 'a-eteindre' | 'service'; dit: string };

export type LigneDuCompte = {
  cle: string;
  dit: string;
  service: boolean;
  envoyes: number;
  remis: number;
  /** Ma Couronne (gratuit), WhatsApp par Meta, à un toucher. */
  parCanal: { couronne: number; meta: number; toucher: number };
  venuesGagnees: number;
  /** Services seulement : les rendez-vous protégés qui ont été honorés. */
  tenus: number | null;
  /** Venues ÷ envoyés (tenus ÷ gardés pour un service) ; null sous 20 envois. */
  taux: number | null;
  encaisseXof: number;
  remiseXof: number;
  /** null : le barème Meta n'est pas renseigné et des messages Meta sont partis. */
  coutMetaXof: number | null;
  coutClaudeUsd: number;
  /** Encaissé ÷ remise ; null sans remise, ou sous 20 envois. */
  rendement: number | null;
  /** (remise + Meta) ÷ venues ; null sans venue, Meta non renseigné, ou sous 20 envois. */
  coutDUneVenue: number | null;
  verdict: Verdict;
};

export type EntreesDuCompte = {
  envois: readonly EnvoiDuCompte[];
  rdvs: readonly RdvDuCompte[];
  codes: readonly CodeDuCompte[];
  periode: Periode;
  /** Le barème de la direction ; absent ou vide : « non renseigné ». */
  tarifs?: TarifsMeta | null;
  /** La catégorie approuvée d'un modèle Meta (`CATEGORIE_DES_MODELES`). */
  categorieDuModele?: (modele: string) => CategorieMeta | undefined;
  /** Le détail du compteur Claude par mois et par chantier (`mnd_ia_compteur_huit.parChantier`). */
  parChantier?: Record<string, Record<string, { usd?: number }>> | null;
  /** Quel chantier Claude sert quelle situation. Aucun aujourd'hui : l'Assistant n'appelle pas Claude. */
  chantiersDeLaSituation?: Record<string, readonly string[]>;
  normaliseLeCode?: (brut: string | undefined) => string;
};

export type CompteParSituation = { lignes: LigneDuCompte[]; total: LigneDuCompte; metaRenseigne: boolean };

const dansLaPeriode = (e: Pick<EnvoiDuCompte, 'quand'>, p: Periode): boolean => {
  const j = jourDuSalon(e.quand);
  return !!j && j >= p.du && j <= p.au;
};

/** Les mois AAAA-MM touchés par une période. */
export function moisDeLaPeriode(p: Periode): string[] {
  const out: string[] = [];
  for (let m = p.du.slice(0, 7); m <= p.au.slice(0, 7); ) {
    out.push(m);
    const [a, mo] = m.split('-').map(Number);
    m = `${mo === 12 ? a + 1 : a}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`;
  }
  return out;
}

/** LES VENUES GAGNÉES, attribuées une fois chacune : les messages qui
    sollicitent, du plus ancien au plus récent ; chacun prend le premier
    rendez-vous de sa cliente pris dans ses 14 jours, honoré et encaissé, pas
    encore attribué. Un rendez-vous sans `creeLe` ne compte pas : on ne devine pas. */
/** L'instant où le rendez-vous a été PRIS, ou null : sans `creeLe`, on ne devine pas (pas même par sa date). */
const instantDePrise = (a: Pick<RdvDuCompte, 'creeLe' | 'date'>): string | null => (a.creeLe && Number.isFinite(Date.parse(a.creeLe)) ? a.creeLe : null);

function attribueLesVenues(envois: readonly EnvoiDuCompte[], rdvs: readonly RdvDuCompte[]): Map<string, RdvDuCompte> {
  const parCliente = new Map<string, { rdv: RdvDuCompte; pris: string }[]>();
  for (const rdv of rdvs) {
    const pris = instantDePrise(rdv);
    if (!pris || rdv.status !== 'honoré' || !(rdv.encaisseXof > 0)) continue;
    const l = parCliente.get(rdv.clientId);
    if (l) l.push({ rdv, pris }); else parCliente.set(rdv.clientId, [{ rdv, pris }]);
  }
  for (const l of parCliente.values()) l.sort((x, y) => x.pris.localeCompare(y.pris));
  const dejaGagnes = new Set<string>();
  const out = new Map<string, RdvDuCompte>();
  const messages = envois
    .filter((e) => !!e.clientId && estParti(e) && !estUnService(e) && Number.isFinite(Date.parse(e.quand)))
    .sort((a, b) => a.quand.localeCompare(b.quand));
  for (const m of messages) {
    const fin = new Date(Date.parse(m.quand) + JOURS_DE_REPONSE * 86_400_000).toISOString();
    const gagne = (parCliente.get(m.clientId as string) ?? []).find((x) => !dejaGagnes.has(x.rdv.id) && x.pris >= m.quand && x.pris <= fin);
    if (!gagne) continue;
    dejaGagnes.add(gagne.rdv.id);
    out.set(m.id, gagne.rdv);
  }
  return out;
}

const arrondi = (x: number, decimales = 1): number => Math.round(x * 10 ** decimales) / 10 ** decimales;

/** LE VERDICT d'une ligne, aux seuils de la spécification. */
export function verdictDeLaSituation(l: Pick<LigneDuCompte, 'service' | 'envoyes' | 'venuesGagnees' | 'tenus' | 'taux' | 'rendement'>): Verdict {
  if (l.envoyes < ENVOIS_POUR_MESURER) return { etat: l.service ? 'service' : 'a-mesurer', dit: `à mesurer · ${l.envoyes} sur ${ENVOIS_POUR_MESURER}` };
  if (l.service) return { etat: 'service', dit: l.tenus === null ? 'service' : `${l.tenus} tenus sur ${l.envoyes}` };
  if (l.venuesGagnees === 0 || (l.rendement !== null && l.rendement < 1)) return { etat: 'a-eteindre', dit: 'à éteindre' };
  if ((l.taux ?? 0) >= 0.10 && (l.rendement === null || l.rendement >= 3)) return { etat: 'utile', dit: 'utile' };
  return { etat: 'a-regarder', dit: 'à regarder' };
}

type Brouillon = Omit<LigneDuCompte, 'taux' | 'rendement' | 'coutDUneVenue' | 'verdict'> & { metaInconnu: boolean };

const ligneVide = (cle: string, service: boolean): Brouillon => ({
  cle, dit: situationDite(cle), service, envoyes: 0, remis: 0, parCanal: { couronne: 0, meta: 0, toucher: 0 },
  venuesGagnees: 0, tenus: service ? 0 : null, encaisseXof: 0, remiseXof: 0, coutMetaXof: 0, coutClaudeUsd: 0, metaInconnu: false,
});

function acheve(b: Brouillon): LigneDuCompte {
  const { metaInconnu, ...reste } = b;
  const assez = b.envoyes >= ENVOIS_POUR_MESURER;
  const coutMetaXof = metaInconnu ? null : b.coutMetaXof;
  const taux = !assez ? null : b.service ? (b.tenus ?? 0) / b.envoyes : b.venuesGagnees / b.envoyes;
  const rendement = assez && !b.service && b.remiseXof > 0 ? arrondi(b.encaisseXof / b.remiseXof) : null;
  const coutDUneVenue = assez && !b.service && b.venuesGagnees > 0 && coutMetaXof !== null
    ? Math.round((b.remiseXof + coutMetaXof) / b.venuesGagnees) : null;
  const ligne = { ...reste, coutMetaXof, taux, rendement, coutDUneVenue };
  return { ...ligne, verdict: verdictDeLaSituation(ligne) };
}

/** LE TABLEAU « PAR SITUATION », et sa ligne de total. */
export function parSituation(o: EntreesDuCompte): CompteParSituation {
  const tarifs = o.tarifs ?? {};
  const normalise = o.normaliseLeCode ?? codeReduit;
  const chantiers = o.chantiersDeLaSituation ?? {};
  const venues = attribueLesVenues(o.envois, o.rdvs);
  const rdvParId = new Map(o.rdvs.map((a) => [a.id, a]));
  const codesUtilises = new Map<string, number>();
  for (const c of o.codes) if (c.utiliseLe) codesUtilises.set(normalise(c.code), (codesUtilises.get(normalise(c.code)) ?? 0) + (Number(c.remiseReelleXof) || 0));
  const codesVus = new Set<string>();

  const lignes = new Map<string, Brouillon>();
  const total = ligneVide('total', false);
  total.dit = 'Total'; total.tenus = 0;
  const ajoute = (b: Brouillon, e: EnvoiDuCompte, gagne: RdvDuCompte | undefined, remise: number, tenu: boolean) => {
    b.envoyes += 1;
    if (estRemis(e)) b.remis += 1;
    if (e.canal === 'push') b.parCanal.couronne += 1;
    else if (e.canal === 'wa-main' || devenuDe(e) === 'a-la-main') b.parCanal.toucher += 1;
    else if (e.canal === 'whatsapp') b.parCanal.meta += 1;
    if (gagne) { b.venuesGagnees += 1; b.encaisseXof += gagne.encaisseXof; }
    if (tenu) b.tenus = (b.tenus ?? 0) + 1;
    b.remiseXof += remise;
    const cat = categorieMetaDe(e, o.categorieDuModele);
    if (cat && estRemis(e)) {
      const tarif = tarifs[cat];
      if (typeof tarif === 'number' && Number.isFinite(tarif)) b.coutMetaXof = (b.coutMetaXof ?? 0) + tarif;
      else b.metaInconnu = true;
    }
  };

  for (const e of o.envois) {
    if (!estParti(e) || !dansLaPeriode(e, o.periode)) continue;
    const cle = cleDeLaSituation(e);
    const service = estUnService(e);
    const b = lignes.get(cle) ?? ligneVide(cle, service);
    lignes.set(cle, b);
    const gagne = venues.get(e.id);
    /* La remise réelle d'un code honoré, rattachée à la ligne qui l'a porté ; un code une fois. */
    let remise = 0;
    const code = normalise(e.codePromo);
    if (code && codesUtilises.has(code) && !codesVus.has(code)) { codesVus.add(code); remise = codesUtilises.get(code) ?? 0; }
    const tenu = service && !!e.apptId && rdvParId.get(e.apptId)?.status === 'honoré';
    ajoute(b, e, gagne, remise, tenu);
    ajoute(total, e, gagne, remise, tenu);
  }

  /* Claude, par chantier, sur les mois de la période. */
  const mois = moisDeLaPeriode(o.periode);
  for (const [cle, b] of lignes) {
    for (const ch of chantiers[cle] ?? []) for (const m of mois) {
      const usd = Number(o.parChantier?.[m]?.[ch]?.usd) || 0;
      b.coutClaudeUsd += usd; total.coutClaudeUsd += usd;
    }
  }
  const rang = (cle: string) => { const i = ORDRE_DES_SITUATIONS.indexOf(cle); return i < 0 ? 99 : i; };
  const triees = [...lignes.values()]
    .sort((a, b) => rang(a.cle) - rang(b.cle) || b.envoyes - a.envoyes || a.cle.localeCompare(b.cle))
    .map(acheve);
  if (!triees.some((l) => l.service)) total.tenus = null;
  const t = acheve(total);
  return { lignes: triees, total: { ...t, verdict: { etat: 'service', dit: `${triees.length} situation${triees.length > 1 ? 's' : ''}` } }, metaRenseigne: !total.metaInconnu };
}

/* ── LA PHRASE DU VERDICT ─────────────────────────────────────────────── */

/** « 761 000 F » : l'espace insécable entre les milliers. */
export const francsDits = (n: number): string => `${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
const virgule = (x: number): string => x.toFixed(1).replace('.', ',');

/** LA PHRASE DE VERDICT, de forme fixe, jamais un chiffre à la main :
    « 148 messages, 23 venues gagnées, 774 000 F encaissés pour 117 000 F de
    remise : rendement 6,6, coût d'une venue 6 300 F ». Ce qui ne se mesure
    pas encore le dit, à la même place. */
export function phraseDuVerdict(t: Pick<LigneDuCompte, 'envoyes' | 'venuesGagnees' | 'encaisseXof' | 'remiseXof' | 'rendement' | 'coutDUneVenue' | 'coutMetaXof'>): string {
  const messages = `${t.envoyes} message${t.envoyes > 1 ? 's' : ''}`;
  const venues = `${t.venuesGagnees} venue${t.venuesGagnees > 1 ? 's' : ''} gagnée${t.venuesGagnees > 1 ? 's' : ''}`;
  const rendement = t.rendement === null
    ? (t.envoyes < ENVOIS_POUR_MESURER ? `rendement à mesurer (${t.envoyes} sur ${ENVOIS_POUR_MESURER})` : 'rendement sans remise')
    : `rendement ${virgule(t.rendement)}`;
  const cout = t.coutDUneVenue !== null ? `coût d’une venue ${francsDits(t.coutDUneVenue)}`
    : t.coutMetaXof === null ? 'coût d’une venue non renseigné (barème Meta vide)'
      : t.venuesGagnees === 0 ? 'aucune venue à chiffrer' : 'coût d’une venue à mesurer';
  return `${messages}, ${venues}, ${francsDits(t.encaisseXof)} encaissés pour ${francsDits(t.remiseXof)} de remise : ${rendement}, ${cout}.`;
}

/* ── DEUX VOIX LA MÊME SEMAINE ────────────────────────────────────────── */

export const JOURS_D_UNE_SEMAINE = 7;
export type DeuxVoix = { clientes: { clientId: string; jours: string[] }[]; nombre: number };

/** LES CLIENTES QUI ONT REÇU DEUX MESSAGES HORS SERVICE EN SEPT JOURS, toutes
    voix confondues : la table `envois` (hors services, partis, au jour du
    DÉPÔT : `quand` est réécrit à chaque verdict du facteur) et les WhatsApp
    sortants envoyés par un modèle (une voix ; une réponse libre de l'équipe
    est une conversation, pas une voix). Un même message vit dans les deux
    tables : les jours se comptent une fois par cliente. Visé 0. */
export function deuxVoixLaMemeSemaine(envois: readonly EnvoiDuCompte[], messages: readonly MessageDuCompte[] = [], periode?: Periode): DeuxVoix {
  const jours = new Map<string, Set<string>>();
  const pose = (clientId: string | undefined, instant: string | undefined) => {
    const j = jourACotonou(instant);
    if (!clientId || !JOUR.test(j)) return;
    const s = jours.get(clientId) ?? new Set<string>();
    s.add(j); jours.set(clientId, s);
  };
  for (const e of envois) {
    if (estUnService(e) || !estParti(e)) continue;
    pose(e.clientId, e.deposeLe ?? e.quand);
  }
  for (const w of messages) {
    if (w.sens !== 'sortant' || !w.modele) continue;
    if (estUnService(typeDuModeleMeta(w.modele))) continue;
    pose(w.clientId, w.quand);
  }
  const clientes: DeuxVoix['clientes'] = [];
  for (const [clientId, s] of jours) {
    const tries = [...s].sort();
    const touches = new Set<string>();
    for (let i = 1; i < tries.length; i++) {
      if (ecartJours(tries[i - 1], tries[i]) >= JOURS_D_UNE_SEMAINE) continue;
      if (periode && (tries[i] < periode.du || tries[i] > periode.au)) continue;
      touches.add(tries[i - 1]); touches.add(tries[i]);
    }
    if (touches.size) clientes.push({ clientId, jours: [...touches].sort() });
  }
  clientes.sort((a, b) => a.clientId.localeCompare(b.clientId));
  return { clientes, nombre: clientes.length };
}

/* ── QUI ÉCRIT SEUL ───────────────────────────────────────────────────── */

/** Ce qu'un GET sans POST rend d'une fonction posée (`sonde-les-fonctions`). */
export type SondeLue = { http: number; version?: string; secrets?: Record<string, number>; erreur?: string };
export type EtatDuModeleMeta = 'depose' | 'approuve' | 'refuse';

/** L'état lu de dehors, par l'écran. Un champ absent se dit « inconnu », jamais « oui ». */
export type EtatLu = {
  maintenantMs: number;
  /** AAAA-MM à Cotonou. */
  mois: string;
  envois: readonly EnvoiDuCompte[];
  branchId?: string;
  /** Par nom de fonction : la réponse au GET ; null = sondée, muette. Absente = pas sondée. */
  sondes?: Partial<Record<string, SondeLue | null>>;
  /** La version au dépôt, si l'écran la connaît (la sonde la lit dans supabase/functions). */
  versionsAuDepot?: Partial<Record<string, string>>;
  /** `mnd_facteur` : le signe de vie d'`envois-partent`. */
  facteur?: { vuLe?: string; version?: string } | null;
  /** `mnd_gerard` : Pause / Actif, dernier passage. */
  gerard?: { mode?: string; dernierPassage?: string } | null;
  /** `mnd_auto_config.automateWa.mode`. */
  automateWa?: { mode?: string } | null;
  /** `mnd_auto_config.avisAuto`. */
  avisAuto?: boolean | null;
  /** `mnd_settings.relances.actives` et `mndPay.actif`. */
  relancesActives?: boolean | null;
  mndPayActif?: boolean | null;
  /** Le chat du site : quelqu'un de permanence, ou Claude. */
  chat?: { permanence?: boolean; claude?: boolean } | null;
  /** `mnd_ia_reglages.automatique` (le Centre de commande). */
  centreAutomatique?: boolean | null;
  /** Le registre des modèles Meta (document de direction à créer, ex. `mnd_modeles_meta`) : nom → état. */
  modelesMeta?: Partial<Record<string, EtatDuModeleMeta>> | null;
};

export type Interrupteur = 'assistant' | 'automate' | 'toujours' | 'relances' | 'avis' | 'avec-son-modele' | 'a-la-main' | 'chat' | 'centre' | 'trone-ouvert';
export type Voix = {
  id: string;
  nom: string;
  /** Les `id` d'`AUTOMATISATIONS_REELLES` qu'elle regroupe. */
  automatisations: readonly string[];
  /** Les `type` d'`envois` en plus (l'Assistant). */
  types: readonly string[];
  /** Les fonctions qui la portent. */
  fonctions: readonly string[];
  /** Les fonctions sans GET : leur état est celui du facteur (`mnd_facteur`). */
  parLeFacteur?: boolean;
  /** Les secrets attendus, par leur nom. */
  secrets: readonly string[];
  /** Les modèles Meta en plus de ceux du catalogue. */
  modeles: readonly string[];
  interrupteur: Interrupteur;
  /** Ce que « ce mois » compte quand `envois` ne le sait pas. */
  compteDit?: string;
};

export const VOIX_DE_LA_MAISON: readonly Voix[] = [
  { id: 'assistant', nom: 'Assistant Maison', automatisations: [], types: ['gerard'], fonctions: ['assistant-maison'], secrets: [], modeles: Object.values(MODELES_DE_GERARD).map((m) => m.nom), interrupteur: 'assistant' },
  { id: 'automate', nom: 'Automate WhatsApp', automatisations: ['automate-wa'], types: [], fonctions: ['whatsapp-automate'], secrets: [], modeles: [], interrupteur: 'automate', compteDit: 'ses réponses vivent dans les conversations' },
  { id: 'confirmation', nom: 'Confirmation, rappel J-1', automatisations: ['confirmation', 'rappel-j1', 'push-rappels'], types: [], fonctions: ['confirmation-rdv', 'rappels-j1', 'envois-partent'], parLeFacteur: true, secrets: [], modeles: [], interrupteur: 'toujours' },
  { id: 'entre-deux', nom: 'Entre deux séances', automatisations: ['point-apres', 'point-avant', 'reprise-j3'], types: [], fonctions: ['rappels-j1', 'whatsapp-webhook'], parLeFacteur: true, secrets: [], modeles: [], interrupteur: 'avec-son-modele' },
  { id: 'relances', nom: 'Relances de factures', automatisations: ['relance-facture'], types: [], fonctions: ['relances-factures'], secrets: ['WA_TEMPLATE_RELANCE'], modeles: [], interrupteur: 'relances' },
  { id: 'echeances', nom: 'Échéances des formules', automatisations: ['rappel-echeance', 'prix-revu', 'fin-de-paquet'], types: [], fonctions: ['rappels-d-echeance'], secrets: [], modeles: [], interrupteur: 'avec-son-modele' },
  { id: 'avis', nom: 'Demande d’avis', automatisations: ['avis-google', 'avis-premiere-venue'], types: [], fonctions: ['avis-google'], secrets: [], modeles: [], interrupteur: 'avis' },
  { id: 'reponse-aux-avis', nom: 'Réponse aux avis', automatisations: [], types: [], fonctions: ['avis-google-pont'], secrets: [], modeles: [], interrupteur: 'a-la-main', compteDit: 'publiées par le Trône' },
  { id: 'site', nom: 'Le site : accusé, marraine', automatisations: ['accuse', 'parrainage', 'merci-marraine'], types: [], fonctions: ['demande-submit'], secrets: [], modeles: [], interrupteur: 'avec-son-modele' },
  { id: 'chat', nom: 'Chat du site', automatisations: [], types: [], fonctions: ['discussion'], secrets: [], modeles: [], interrupteur: 'chat', compteDit: 'ses réponses vivent dans les conversations' },
  { id: 'centre', nom: 'Centre de commande', automatisations: [], types: [], fonctions: ['centre-de-commande'], secrets: [], modeles: [], interrupteur: 'centre', compteDit: 'ne parle pas aux clientes' },
];

export type Case = { etat: 'ok' | 'doux' | 'alarme' | 'inconnu'; dit: string };
export type LigneDeVoix = {
  id: string;
  nom: string;
  allume: Case;
  posee: Case;
  secret: Case;
  modeleMeta: Case;
  /** L'instant ISO du dernier message parti, ou null. */
  dernierPassage: string | null;
  /** Les messages partis ce mois ; null quand `envois` ne la compte pas (`compteDit`). */
  partisCeMois: number | null;
  compteDit?: string;
  /** Une case rouge : une promesse à vide. */
  alarme: boolean;
};

const POIDS: Record<Case['etat'], number> = { ok: 0, doux: 1, inconnu: 2, alarme: 3 };
const pire = (cases: Case[]): Case => {
  if (!cases.length) return { etat: 'doux', dit: '·' };
  const etat = cases.reduce<Case['etat']>((m, c) => (POIDS[c.etat] > POIDS[m] ? c.etat : m), 'ok');
  return { etat, dit: cases.map((c) => c.dit).join(' · ') };
};

function caseDeLaFonction(nom: string, etat: EtatLu, parLeFacteur: boolean): Case {
  if (parLeFacteur && (nom === 'confirmation-rdv' || nom === 'rappels-j1' || nom === 'envois-partent')) {
    if (etat.facteur === undefined) return { etat: 'inconnu', dit: `${nom} · facteur non lu` };
    const vivant = facteurVivant(etat.facteur?.vuLe, etat.maintenantMs);
    const v = etat.facteur?.version ? ` ${etat.facteur.version}` : '';
    return vivant ? { etat: 'ok', dit: `${nom} · facteur vivant${v}` } : { etat: 'alarme', dit: `${nom} · facteur absent${v}` };
  }
  if (!etat.sondes || !(nom in etat.sondes)) return { etat: 'inconnu', dit: `${nom} · pas sondée` };
  const s = etat.sondes[nom];
  if (!s) return { etat: 'alarme', dit: `${nom} · muette` };
  if (s.http === 404) return { etat: 'alarme', dit: `${nom} · jamais posée` };
  const version = (s.version ?? '').split(' ')[0];
  if (version) {
    const depot = etat.versionsAuDepot?.[nom];
    if (depot && !version.startsWith(depot)) return { etat: 'alarme', dit: `${nom} ${version} en ligne, ${depot} au dépôt` };
    return { etat: 'ok', dit: `${nom} ${version}` };
  }
  if (s.http === 200 || s.http === 401 || s.http === 405) return { etat: 'doux', dit: `${nom} en ligne, sans version` };
  return { etat: 'alarme', dit: `${nom} · http ${s.http}` };
}

function caseDuSecret(v: Voix, etat: EtatLu): Case {
  if (!v.secrets.length) return { etat: 'doux', dit: '·' };
  return pire(v.secrets.map((nom) => {
    const lg = v.fonctions.map((f) => etat.sondes?.[f]?.secrets?.[nom]).find((x) => typeof x === 'number');
    if (lg === undefined) return { etat: 'inconnu', dit: `${nom} non lu` } as Case;
    return lg > 0 ? { etat: 'ok', dit: `${nom} posé` } : { etat: 'alarme', dit: `${nom} absent` };
  }));
}

function caseDuModele(modeles: readonly string[], service: boolean, etat: EtatLu): Case {
  if (!modeles.length) return { etat: 'doux', dit: 'sans modèle' };
  const n = modeles.length;
  if (etat.modelesMeta === undefined || etat.modelesMeta === null) return { etat: 'inconnu', dit: `${n} modèle${n > 1 ? 's' : ''}, état non noté` };
  const approuves = modeles.filter((m) => etat.modelesMeta?.[m] === 'approuve').length;
  const refuses = modeles.filter((m) => etat.modelesMeta?.[m] === 'refuse').length;
  const dit = `${approuves} approuvé${approuves > 1 ? 's' : ''} sur ${n}${refuses ? `, ${refuses} refusé${refuses > 1 ? 's' : ''}` : ''}${service ? ' · service' : ''}`;
  return { etat: approuves === n ? 'ok' : 'alarme', dit };
}

function caseDeLAllumage(v: Voix, etat: EtatLu, secret: Case): Case {
  const ouiNon = (x: boolean | null | undefined, oui: string, non: string): Case =>
    x === undefined || x === null ? { etat: 'inconnu', dit: 'non lu' } : x ? { etat: 'ok', dit: oui } : { etat: 'doux', dit: non };
  switch (v.interrupteur) {
    case 'assistant':
      if (!etat.gerard || etat.gerard.mode === undefined) return { etat: 'inconnu', dit: 'non lu' };
      return etat.gerard.mode === 'eteint' ? { etat: 'doux', dit: 'Pause' } : { etat: 'ok', dit: 'Actif' };
    case 'automate': {
      const mode = etat.automateWa?.mode;
      if (!mode) return { etat: 'inconnu', dit: 'non lu' };
      return mode === 'ouvert' ? { etat: 'ok', dit: 'ouvert' } : { etat: 'doux', dit: mode === 'essai' ? 'essai' : 'éteint' };
    }
    case 'toujours': return { etat: 'ok', dit: 'toujours' };
    case 'trone-ouvert': return { etat: 'ok', dit: 'quand un Trône est ouvert' };
    case 'relances': {
      const c = ouiNon(etat.relancesActives, 'oui', 'éteint');
      return c.etat === 'ok' && etat.mndPayActif === false ? { etat: 'doux', dit: 'oui, sans MND PAY' } : c;
    }
    case 'avis': return ouiNon(etat.avisAuto, 'oui', 'éteint');
    case 'avec-son-modele':
      if (!v.secrets.length) return { etat: 'ok', dit: 'avec son modèle' };
      return secret.etat === 'ok' ? { etat: 'ok', dit: 'avec son modèle' } : secret.etat === 'alarme' ? { etat: 'alarme', dit: 'éteint : modèle absent' } : { etat: 'inconnu', dit: 'non lu' };
    case 'a-la-main': return { etat: 'doux', dit: 'à la main' };
    case 'chat':
      if (!etat.chat) return { etat: 'inconnu', dit: 'non lu' };
      return etat.chat.permanence ? { etat: 'ok', dit: 'permanence' } : etat.chat.claude ? { etat: 'ok', dit: 'Claude' } : { etat: 'doux', dit: 'personne' };
    case 'centre': return ouiNon(etat.centreAutomatique, 'oui', 'coupé');
    default: return { etat: 'inconnu', dit: 'non lu' };
  }
}

/** QUI ÉCRIT SEUL : une ligne par voix, l'état réel lu de dehors, jamais une
    promesse. Une case rouge = une promesse à vide. */
export function quiEcritSeul(automatisations: readonly AutomatisationReelle[], etat: EtatLu, voix: readonly Voix[] = VOIX_DE_LA_MAISON): LigneDeVoix[] {
  return voix.map((v) => {
    const siennes = automatisations.filter((a) => v.automatisations.includes(a.id));
    const types = [...new Set([...v.types, ...siennes.flatMap((a) => a.types)])];
    const modeles = [...new Set([...v.modeles, ...siennes.flatMap((a) => a.modeles)])];
    const service = types.length > 0 && types.every((t) => estUnService({ type: t }));
    const secret = caseDuSecret(v, etat);
    const posee = pire(v.fonctions.map((f) => caseDeLaFonction(f, etat, !!v.parLeFacteur)));
    const modeleMeta = caseDuModele(modeles, service, etat);
    const allume = caseDeLAllumage(v, etat, secret);
    const partis = types.length ? etat.envois.filter((e) => types.includes(e.type) && estParti(e) && (!etat.branchId || !e.branchId || e.branchId === etat.branchId)) : [];
    let dernierPassage = partis.reduce<string | null>((d, e) => (d === null || e.quand > d ? e.quand : d), null);
    if (v.interrupteur === 'assistant' && etat.gerard?.dernierPassage && (!dernierPassage || etat.gerard.dernierPassage > jourACotonou(dernierPassage))) {
      dernierPassage = `${etat.gerard.dernierPassage}T00:00:00.000Z`;
    }
    const partisCeMois = types.length ? compteDuMois(etat.envois, types, etat.mois, etat.branchId).partis : null;
    const cases = [allume, posee, secret, modeleMeta];
    return { id: v.id, nom: v.nom, allume, posee, secret, modeleMeta, dernierPassage, partisCeMois, compteDit: v.compteDit, alarme: cases.some((c) => c.etat === 'alarme') };
  });
}

/* ── À QUI IL PEUT ÉCRIRE ─────────────────────────────────────────────── */

/** Ce que la portée lit d'une fiche : les champs de `FicheDeGerard`. */
export type FicheDePortee = {
  accord: boolean; stop: boolean; couronne: boolean; telephone: boolean; ecartee: boolean;
  enfantDuFoyer?: boolean; souciOuvert?: string; resteDu?: number;
};
export type AccordLu = { oui: boolean; le?: string };
export type Portee = {
  fiches: number;
  vivantes: number;
  couronne: number;
  accordWhatsApp: number;
  sansAccord: number;
  sansTelephone: number;
  stop: number;
  ecartees: number;
  enfantsDuFoyer: number;
  auCalme: number;
  /** Vivantes, ni enfant ni stop, jointes par Ma Couronne ou par WhatsApp avec l'accord. */
  joignables: number;
  /** Les accords notés, par semaine (lundi AAAA-MM-JJ), les douze dernières semaines. */
  courbe: { lundi: string; accords: number }[];
};

const lundiDe = (j: string): string => { const d = midi(j); const s = (d.getUTCDay() + 6) % 7; return plusJours(j, -s); };

/** LA PORTÉE DE L'ASSISTANT : à qui il peut écrire, et par où. « Le premier
    chiffre à faire monter » : l'accord « Nouvelles de la Maison ». */
export function aQuiIlPeutEcrire(fiches: readonly FicheDePortee[], o: { accords?: readonly AccordLu[]; aujourdhui: string; semaines?: number }): Portee {
  const vivantes = fiches.filter((f) => !f.ecartee);
  const n = (p: (f: FicheDePortee) => boolean) => vivantes.filter(p).length;
  const semaines = o.semaines ?? 12;
  const premierLundi = plusJours(lundiDe(o.aujourdhui), -7 * (semaines - 1));
  const courbe = Array.from({ length: semaines }, (_, i) => ({ lundi: plusJours(premierLundi, 7 * i), accords: 0 }));
  for (const a of o.accords ?? []) {
    const j = jourACotonou(a.le);
    if (!a.oui || !JOUR.test(j) || j < premierLundi || j > o.aujourdhui) continue;
    const l = lundiDe(j);
    const c = courbe.find((x) => x.lundi === l);
    if (c) c.accords += 1;
  }
  return {
    fiches: fiches.length,
    vivantes: vivantes.length,
    couronne: n((f) => f.couronne),
    accordWhatsApp: n((f) => f.accord && f.telephone && !f.stop),
    sansAccord: n((f) => f.telephone && !f.accord && !f.stop),
    sansTelephone: n((f) => !f.telephone && !f.couronne),
    stop: n((f) => f.stop),
    ecartees: fiches.length - vivantes.length,
    enfantsDuFoyer: n((f) => !!f.enfantDuFoyer),
    auCalme: n((f) => !!f.souciOuvert || (f.resteDu ?? 0) > 0),
    joignables: n((f) => !f.enfantDuFoyer && !f.stop && (f.couronne || (f.accord && f.telephone))),
    courbe,
  };
}

/* ── CLAUDE CE MOIS : LE LECTEUR DU COMPTEUR ──────────────────────────── */

/** Le document `mnd_ia_compteur_huit` ENTIER : une clé par mois (la forme
    `Compteur`), et à côté la clé `parChantier` (mois → chantier → usd,
    appels), qui n'est pas un mois. */
export type DocumentDuCompteur = Record<string, unknown> | null | undefined;
export type DetailDUnChantier = { chantier: string; usd: number; appels: number };
export type ClaudeDuMois = {
  mois: string;
  usd: number;
  appels: number;
  plafond: number;
  /** 0 à 1, borné. */
  part: number;
  parChantier: DetailDUnChantier[];
  /** Le Centre de commande (`mnd_ia_compteur`), à part : il garde son plafond. */
  centreUsd: number;
  /** Le diagnostic photo (`mnd_ia_compteur_diagnostic`), s'il tient la même forme. */
  diagnosticUsd: number;
  /** Tout ce qui a tourné, compteur des huit compris. */
  totalUsd: number;
};

const estUneLigne = (v: unknown): v is { usd?: unknown; appels?: unknown } => !!v && typeof v === 'object' && !Array.isArray(v);

/** Les lignes du mois seules : la clé `parChantier` n'est pas un mois. */
export function lignesDuCompteur(doc: DocumentDuCompteur): Compteur {
  const out: Compteur = {};
  for (const [k, v] of Object.entries(doc ?? {})) {
    if (k === 'parChantier' || !/^\d{4}-\d{2}$/.test(k) || !estUneLigne(v)) continue;
    out[k] = { usd: Number(v.usd) || 0, appels: Number(v.appels) || 0, entree: Number((v as { entree?: unknown }).entree) || 0, sortie: Number((v as { sortie?: unknown }).sortie) || 0 };
  }
  return out;
}

/** Les mois que le compteur connaît, du plus ancien au plus récent. */
export const moisDuCompteur = (doc: DocumentDuCompteur): string[] => Object.keys(lignesDuCompteur(doc)).sort();

/** Le détail d'un mois par chantier, du plus cher au moins cher. */
export function detailDuMois(doc: DocumentDuCompteur, mois: string): DetailDUnChantier[] {
  const detail = (doc as { parChantier?: Record<string, Record<string, { usd?: unknown; appels?: unknown }>> } | null | undefined)?.parChantier;
  const duMois = detail && typeof detail === 'object' ? detail[mois] : undefined;
  if (!duMois || typeof duMois !== 'object') return [];
  return Object.entries(duMois)
    .map(([chantier, l]) => ({ chantier, usd: Number(l?.usd) || 0, appels: Number(l?.appels) || 0 }))
    .sort((a, b) => b.usd - a.usd || a.chantier.localeCompare(b.chantier));
}

/** CE QUE CLAUDE A COÛTÉ CE MOIS, à l'heure de Cotonou : la jauge sur le
    plafond des huit, le détail par chantier, et ce qui tournait à côté. */
export function claudeDuMois(o: { huit: DocumentDuCompteur; centre?: DocumentDuCompteur; diagnostic?: DocumentDuCompteur; quand: Date; plafondUsd?: number }): ClaudeDuMois {
  const mois = moisACotonou(o.quand);
  const huit = lignesDuCompteur(o.huit)[mois];
  const usd = arrondi(huit?.usd ?? 0, 4);
  const plafond = Number.isFinite(o.plafondUsd) && (o.plafondUsd as number) > 0 ? (o.plafondUsd as number) : PLAFOND_DES_HUIT_USD;
  const centreUsd = arrondi(lignesDuCompteur(o.centre)[mois]?.usd ?? 0, 4);
  const diagnosticUsd = arrondi(lignesDuCompteur(o.diagnostic)[mois]?.usd ?? 0, 4);
  return {
    mois, usd, appels: huit?.appels ?? 0, plafond,
    part: arrondi(Math.min(1, Math.max(0, plafond > 0 ? usd / plafond : 0)), 4),
    parChantier: detailDuMois(o.huit, mois),
    centreUsd, diagnosticUsd,
    totalUsd: arrondi(usd + centreUsd + diagnosticUsd, 4),
  };
}
