import type { FormuleRapide } from '../../shared/reservation-express';
import {
  creneauxLibres, dureeDesPrestations, occupesDuJour, ouvertureDuJour, plagesBloquees,
  type CreneauOccupe, type ExceptionDHoraire, type HeureDeLaSemaine, type MurPose,
} from '../../shared/agenda-pur';
import { estUneConsultation, type MasquesDuSite } from '../../shared/catalogue-pur';
import { porteDuBesoin, type Besoin } from '../../shared/qualification';
import { ATELIERS_RESERVABLES, CONSULTATION_PAR_PARCOURS, reservableSurLeSite } from '../../shared/place-du-serveur';
import type { Bande } from './prix-calibre';
import { client } from './maison';

/* LE CALENDRIER DU SITE, SANS COMPTE — 17 septembre 2026.

   « Est-ce possible de réserver directement sans passer par WhatsApp ? »
   (Yéman). Oui : tout ce qu'il faut pour dessiner un calendrier honnête est
   déjà lisible par la clé publique, et rien de plus.

     • le catalogue et ses durées      `catalog_services` (0006)
     • la Maison et ses maîtres        `branches` (0006)
     • les heures et les fermetures    `mnd_settings`, `mnd_horaires_exceptions`
     • les murs posés à la main        `blocages` (0042)
     • les créneaux déjà pris          `creneaux_occupes` (0079)

   La dernière est une fonction faite exprès : elle rend un jour, un maître,
   une heure et une durée. Aucun nom, aucune prestation, aucun montant. On
   dessine le mur, jamais ce qu'il y a derrière.

   ÉCRIRE, EN REVANCHE, NE SE FAIT PAS D'ICI : `appointments` n'accepte aucune
   écriture anonyme, et c'est juste. C'est la fonction Edge `demande-submit`
   qui pose le rendez-vous, avec la clé de service, après avoir REVÉRIFIÉ le
   créneau. Cet écran propose ; le serveur dispose. */

export type PrestationPublique = {
  id: string;
  name: string;
  categoryId: string;
  durationMin?: number;
  /* CE QUI FAIT LE PRIX SELON LE CALIBRE — 28 septembre 2026 : les mêmes
     champs que le Trône, lus tels quels dans la ligne du catalogue. Voir
     `prix-calibre.ts`, qui les lit. */
  scalesWithModel?: boolean;
  priceFloors?: Record<string, number>;
  bandId?: string;
  bandIds?: string[];
  ratePerLock?: number;
  tarifMode?: 'lock' | 'calibre';
  prixParLongueur?: Partial<Record<string, number>>;
  paliersDeLocks?: { auDela: number; prixXof: number }[];
  /** LE PRIX VIENT DU CATALOGUE, JAMAIS D'ICI — 17 septembre 2026. « Il faut
      mettre les prix pour que le client comprenne d'entrée de jeu » (Yéman).
      Un prix corrigé au Trône se corrige donc sur le site, le jour même. */
  priceXof?: number;
  priceMode?: 'fixe' | 'variable' | 'devis';
  hidePrice?: boolean;
  consultationAvant?: boolean;
  enabled?: boolean;
  archived?: boolean;
  master?: string;
};

export type CategoriePublique = { id: string; label: string; fon?: string; parentId?: string; enabled?: boolean };

export type AgendaDeLaMaison = {
  branchId: string;
  maitres: string[];
  services: PrestationPublique[];
  categories: CategoriePublique[];
  semaine: HeureDeLaSemaine[];
  exceptions: ExceptionDHoraire[];
  murs: MurPose[];
  capMaison: number;
  capMaitre: number;
  /** Les fauteuils de la Maison : au-delà, plus d'heure, quel que soit le
      maître. C'est ce qui manquait au samedi plein (17 septembre 2026). */
  sieges: number;
  /** Ce que la Maison a décoché pour le site (régie de la Vitrine). */
  masques: MasquesDuSite;
  /** LE BARÈME DES CALIBRES — 28 septembre 2026 : les tranches de la Maison
      (`mnd_model_bands`), celles propres à une famille (`mnd_model_band_sets`)
      et l'interrupteur qui suspend le barème. Lisibles par la clé publique
      depuis la migration 0011 : c'est une grille tarifaire, rien de privé. */
  bandes: Bande[];
  bandSets: Record<string, Bande[]>;
  baremeSuspendu: boolean;
  /** LES FORMULES RAPIDES — 29 septembre 2026 : les venues que les clientes
      réservent le plus, posées par le Trône (useFormulesRapides). Absentes
      d'un agenda mis en cache avant ce jour : on les lit donc `?? []`. */
  formules?: FormuleRapide[];
};

type Doc<T> = { key: string; data: T };

let promesse: Promise<AgendaDeLaMaison | null> | null = null;

/** Tout ce que le calendrier a besoin de savoir, lu une seule fois. */
/* SANS BRANCHE DONNÉE, LA BRANCHE VEDETTE — 28 septembre 2026. Les
   branches arrivent déjà dans le même lot que le reste : attendre `maison()`
   avant de lancer ce lot ajoutait un aller-retour entier à la base. La règle
   est celle de `maison()` : la vedette active, sinon la première. */
export function agendaDeLaMaison(branchIdDonne?: string): Promise<AgendaDeLaMaison | null> {
  if (promesse) return promesse;
  promesse = (async () => {
    const supabase = await client();
    if (!supabase) return null;
    const [services, categories, docs, blocages, branches] = await Promise.all([
      supabase.from('catalog_services').select('id,data'),
      supabase.from('catalog_categories').select('id,data'),
      supabase.from('documents').select('key,data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config', 'mnd_model_bands', 'mnd_model_band_sets']),
      supabase.from('blocages').select('id,data'),
      supabase.from('branches').select('id,data'),
    ]);
    const lignes = <T,>(r: { data: unknown }): T[] =>
      ((r.data ?? []) as { data?: T }[]).map((x) => x.data).filter(Boolean) as T[];

    const reglages = ((docs.data ?? []) as Doc<{ hours?: HeureDeLaSemaine[]; maxRdvParJourMaison?: number; maxRdvParJourMaitre?: number; baremeSuspendu?: boolean }>[])
      .find((d) => d.key === 'mnd_settings')?.data ?? {};
    const bandes = ((docs.data ?? []) as Doc<Bande[]>[]).find((d) => d.key === 'mnd_model_bands')?.data;
    const bandSets = ((docs.data ?? []) as Doc<Record<string, Bande[]>>[]).find((d) => d.key === 'mnd_model_band_sets')?.data;
    const exceptions = ((docs.data ?? []) as Doc<ExceptionDHoraire[]>[])
      .find((d) => d.key === 'mnd_horaires_exceptions')?.data ?? [];
    type LigneBranche = { id: string; data?: { masters?: string[]; seats?: number; flagship?: boolean; status?: string } };
    const toutes = (branches.data ?? []) as LigneBranche[];
    const branche = branchIdDonne
      ? toutes.find((b) => b.id === branchIdDonne)
      : toutes.find((b) => b.data?.flagship && b.data?.status !== 'paused') ?? toutes[0];
    if (!branche) return null;
    const branchId = branche.id;
    const vitrine = ((docs.data ?? []) as Doc<{ siteMasques?: MasquesDuSite; formulesRapides?: FormuleRapide[] }>[])
      .find((d) => d.key === 'mnd_vitrine_config')?.data;
    const masques = vitrine?.siteMasques ?? {};
    const formules = (Array.isArray(vitrine?.formulesRapides) ? vitrine.formulesRapides : [])
      .filter((f) => f && Array.isArray(f.serviceIds) && f.serviceIds.length > 0);

    return {
      branchId,
      maitres: (branche?.data?.masters ?? []).filter(Boolean),
      services: lignes<PrestationPublique>(services).filter((s) => s.enabled !== false && !s.archived),
      categories: lignes<CategoriePublique>(categories),
      /* Sans horaires descendus, la semaine reste VIDE et chaque jour se dit
         fermé : mieux vaut ne rien proposer que d'ouvrir un jour que la
         Maison ferme (la leçon du lundi 12 octobre, 5 septembre). */
      semaine: Array.isArray(reglages.hours) ? reglages.hours : [],
      exceptions: Array.isArray(exceptions) ? exceptions : [],
      murs: lignes<MurPose>(blocages),
      capMaison: Number(reglages.maxRdvParJourMaison ?? 0),
      capMaitre: Number(reglages.maxRdvParJourMaitre ?? 0),
      sieges: Math.max(0, Number(branche?.data?.seats ?? 0)),
      masques,
      bandes: Array.isArray(bandes) ? bandes.filter((b) => b && b.id && b.name) : [],
      bandSets: bandSets && typeof bandSets === 'object' ? bandSets : {},
      baremeSuspendu: reglages.baremeSuspendu === true,
      formules,
    };
  })();
  return promesse;
}

/** Les créneaux déjà pris d'une période. ELLE ÉCHOUE OUVERT, comme Ma
    Couronne : si la fonction n'est pas posée ou si le réseau tombe, on rend
    une liste vide. Mieux vaut proposer une heure déjà prise, que le serveur
    refusera à l'écriture, que de fermer le salon tout entier. */
/* LE CALENDRIER DU SITE, EN UN SEUL ALLER-RETOUR — 28 septembre 2026. « Sur
   le site le calendrier prend du temps pour se charger » (Yéman). Il
   attendait trois réponses l'une après l'autre (la Maison, puis l'agenda,
   puis les créneaux pris), chacune d'environ six dixièmes de seconde depuis
   la base, davantage depuis Cotonou. Désormais :
     · l'agenda part seul, sans attendre la Maison (il lit la branche lui-même) ;
     · les créneaux pris partent EN MÊME TEMPS quand la branche est déjà
       connue de la visite précédente ;
     · l'agenda de la dernière visite s'affiche TOUT DE SUITE, puis se
       remplace par le frais. Le serveur revérifie de toute façon l'heure
       et le prix à l'envoi : un agenda d'hier ne peut rien réserver de faux ;
     · la page lance tout cela dès son ouverture (main.ts), pendant que le
       code du calendrier se télécharge encore. */
const CLE_AGENDA = 'mnd_site_agenda_v1';
const CLE_BRANCHE = 'mnd_site_branche';
const JOURS_DU_SITE = 21;

export function agendaEnCache(): AgendaDeLaMaison | null {
  try {
    const brut = localStorage.getItem(CLE_AGENDA);
    return brut ? (JSON.parse(brut) as AgendaDeLaMaison) : null;
  } catch { return null; }
}

let calendrier: Promise<{ agenda: AgendaDeLaMaison | null; occupes: CreneauOccupe[] }> | null = null;
export function calendrierDuSite(du: string, au: string): Promise<{ agenda: AgendaDeLaMaison | null; occupes: CreneauOccupe[] }> {
  if (calendrier) return calendrier;
  calendrier = (async () => {
    let devine = '';
    try { devine = localStorage.getItem(CLE_BRANCHE) ?? ''; } catch { /* pas de stockage */ }
    const pris = devine ? creneauxOccupes(devine, du, au) : null;
    const agenda = await agendaDeLaMaison();
    if (!agenda) return { agenda: null, occupes: [] };
    try {
      localStorage.setItem(CLE_AGENDA, JSON.stringify(agenda));
      localStorage.setItem(CLE_BRANCHE, agenda.branchId);
    } catch { /* tant pis */ }
    const occupes = pris && devine === agenda.branchId ? await pris : await creneauxOccupes(agenda.branchId, du, au);
    return { agenda, occupes };
  })();
  return calendrier;
}
export const JOURS_DU_CALENDRIER = JOURS_DU_SITE;

export async function creneauxOccupes(branchId: string, du: string, au: string): Promise<CreneauOccupe[]> {
  const supabase = await client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('creneaux_occupes', { p_branch: branchId, p_du: du, p_au: au });
  return error ? [] : ((data ?? []) as CreneauOccupe[]);
}

/** Les heures libres d'un jour, pour un rituel donné. Le maître est celui de
    la prestation quand elle en désigne un, sinon chacun de ceux de la Maison :
    une heure libre chez l'un suffit à la proposer. */
export function heuresLibres(o: {
  agenda: AgendaDeLaMaison;
  dateIso: string;
  serviceIds: string[];
  occupes: readonly CreneauOccupe[];
  maintenant?: Date;
}): { heure: string; maitre: string }[] {
  const { agenda, dateIso, serviceIds } = o;
  const opening = ouvertureDuJour(dateIso, agenda.semaine, agenda.exceptions);
  if (opening.closed) return [];
  const durationMin = dureeDesPrestations(serviceIds, agenda.services);
  const occupes = occupesDuJour(o.occupes, dateIso);
  const maintenant = o.maintenant ?? new Date();
  const aujourdHui = dateIso === isoDuJour(maintenant);
  const maintenantMin = aujourdHui ? maintenant.getHours() * 60 + maintenant.getMinutes() : null;

  const demandes = serviceIds.map((id) => agenda.services.find((s) => s.id === id)?.master).filter(Boolean) as string[];
  const maitres = demandes.length > 0 ? [...new Set(demandes)] : (agenda.maitres.length > 0 ? agenda.maitres : ['']);

  const parHeure = new Map<string, string>();
  for (const maitre of maitres) {
    const heures = creneauxLibres({
      opening,
      durationMin,
      occupes,
      bloques: plagesBloquees(agenda.murs, agenda.branchId, dateIso, maitre),
      master: maitre,
      capMaison: agenda.capMaison,
      capMaitre: agenda.capMaitre,
      capSimultane: agenda.sieges,
      maintenantMin,
    });
    for (const h of heures) if (!parHeure.has(h)) parHeure.set(h, maitre);
  }
  return [...parHeure.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([heure, maitre]) => ({ heure, maitre }));
}

export const isoDuJour = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Les `n` prochains jours à partir de demain : on ne propose pas le jour
    même, la Maison a besoin de préparer la venue. */
export function prochainsJours(n: number, depuis = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    const d = new Date(depuis);
    d.setDate(d.getDate() + i);
    out.push(isoDuJour(d));
  }
  return out;
}

const JOURS_DITS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function jourDit(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${JOURS_DITS[d.getDay()]} ${d.getDate()} ${MOIS_DITS[d.getMonth()]}`;
}

export const jourCourt = (iso: string): { lettre: string; chiffre: string } => {
  const d = new Date(`${iso}T00:00:00`);
  return { lettre: JOURS_DITS[d.getDay()].slice(0, 3), chiffre: String(d.getDate()) };
};


/* ══ CE QUE LE SITE OUVRE À LA RÉSERVATION ═════════════════════════
   Deux ateliers (l'Entretien et la Coloration), et la consultation de chaque
   porte (le KÒKÒ Origine, le KÒKÒ Suivi, le Conseil et diagnostic). DEPUIS LE
   9 OCTOBRE 2026, LA RÈGLE VIT DANS `shared/place-du-serveur` : la même
   ligne sert à cet écran pour proposer, et au serveur (`demande-submit`,
   `whatsapp-automate`) pour refuser. Une règle tenue à deux endroits finit
   toujours par diverger, et c'est au comptoir qu'on l'apprend. Les deux
   constantes se ré-exportent ici : rien n'a changé d'adresse pour le site.

   POURQUOI PAS LES MASQUES DE LA VITRINE, qui sont pourtant lisibles ici :
   ils règlent la carte du comptoir et Ma Couronne, deux surfaces où la
   Maison a choisi de cacher le Diagnostic, la Création et la Renaissance.
   Les suivre aurait caché exactement ce que ce site doit faire réserver. */
export { ATELIERS_RESERVABLES, CONSULTATION_PAR_PARCOURS };

/** Les prestations que CETTE porte autorise à réserver. Vide = l'écran
    retombe sur la demande de rappel, jamais sur une page morte. */
export function prestationsReservables(agenda: AgendaDeLaMaison, besoin: Besoin): PrestationPublique[] {
  const cats = agenda.categories;
  /* CE QUE LA MAISON A DÉCOCHÉ NE SE PROPOSE PLUS (17 septembre 2026). Le
     même juge sert à `demande-submit`, qui REFUSE : sans lui, décocher ne
     serait qu'un décor. */
  const offert = (s: PrestationPublique) => reservableSurLeSite(s, cats, agenda.masques);
  if (porteDuBesoin(besoin) === 'consultation') {
    const consultations = agenda.services.filter((s) => estUneConsultation(s, cats) && offert(s));
    const sienne = CONSULTATION_PAR_PARCOURS[besoin];
    const laSienne = sienne ? consultations.filter((s) => s.id === sienne) : [];
    /* Sa consultation si elle existe encore, sinon toutes : on ne ferme
       jamais la porte sur un identifiant qui a changé de nom. */
    return laSienne.length > 0 ? laSienne : consultations;
  }
  /* Un geste d'un atelier réservable, sans consultation exigée, ni devis
     (`reservableSurLeSite`) ; une consultation n'est pas un entretien. */
  return agenda.services.filter((s) => !estUneConsultation(s, cats) && offert(s));
}

/* SIX GESTES AU PLUS DANS UNE MÊME VENUE — 18 septembre 2026.

   Ce n’est pas une idée d’écran : `demande-submit` applique déjà ce plafond
   par un `slice(0, 6)` avant d’écrire. Le dire ici, et le dire à la visiteuse,
   vaut mieux que de la laisser cocher un septième geste que le serveur
   retirerait sans un mot. Les deux chiffres doivent bouger ensemble. */
export const PLAFOND_GESTES = 6;

/* CE QUE LA PORTE OUVRE D’ABORD — 18 septembre 2026.

   « Quand je réserve un entretien je veux les lavage et la reprise de
   racines. Si je choisis faire un soin donc je vois les aqua locks ritual,
   dàndàn » (Yéman). Les familles existaient déjà et portaient leurs noms ;
   ce qui manquait, c’était leur ORDRE. Elles étaient rangées de la plus
   fournie à la plus maigre, si bien que les huit soins et les huit couleurs
   passaient devant les quatre lavages et les quatre reprises. Une visiteuse
   venue pour un entretien devait faire défiler pour trouver ce pour quoi
   elle était venue.

   ON RANGE DONC PAR INTENTION. La porte ouvre ses familles, le reste se plie
   sans jamais disparaître : « tout ce que la porte propose » (Yéman, au
   sélecteur). ON RECONNAÎT PAR LE NOM, pas par l’identifiant : la leçon du
   17 septembre, où le site cherchait une catégorie que la Maison avait
   renommée et rendait une page vide. Un nom qui change fait perdre la
   priorité, jamais la famille. */
const FAMILLES_DABORD: Readonly<Partial<Record<Besoin, readonly RegExp[]>>> = {
  entretien: [/lavage|shampoing/i, /racine|reprise/i],
};

export type GroupeDeGestes = {
  id: string;
  titre: string;
  items: PrestationPublique[];
  /** La porte l’ouvre d’emblée : c’est ce pour quoi la visiteuse est venue. */
  deLaPorte: boolean;
};

/** Les mêmes, rangées par famille : une liste de trente gestes à plat ne se
    lit pas, la même par familles se parcourt d'un regard. */
export function groupesDePrestations(
  agenda: AgendaDeLaMaison,
  prestations: readonly PrestationPublique[],
  besoin: Besoin = 'inconnu',
): GroupeDeGestes[] {
  const nom = (id: string): string =>
    agenda.categories.find((c) => c.id === id)?.label ?? 'Les autres gestes';
  const par = new Map<string, PrestationPublique[]>();
  for (const s of prestations) {
    const cle = s.categoryId;
    par.set(cle, [...(par.get(cle) ?? []), s]);
  }
  const dabord = FAMILLES_DABORD[besoin] ?? [];
  /* Le rang d’une famille : sa place dans l’intention de la porte, et
     `dabord.length` pour toutes celles qui n’y figurent pas. */
  const rang = (titre: string): number => {
    const i = dabord.findIndex((r) => r.test(titre));
    return i < 0 ? dabord.length : i;
  };
  return [...par.entries()]
    .map(([cle, items]) => ({ cle, titre: nom(cle), items }))
    .map(({ cle, titre, items }) => ({ id: cle, titre, items, deLaPorte: rang(titre) < dabord.length }))
    /* À intention égale, la famille la plus fournie d’abord : c’est l’ordre
       qui valait pour toutes avant le 18 septembre, et il reste bon ici. */
    .sort((a, b) => (rang(a.titre) - rang(b.titre)) || (b.items.length - a.items.length));
}
