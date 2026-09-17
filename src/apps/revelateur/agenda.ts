import {
  creneauxLibres, dureeDesPrestations, occupesDuJour, ouvertureDuJour, plagesBloquees,
  type CreneauOccupe, type ExceptionDHoraire, type HeureDeLaSemaine, type MurPose,
} from '../../shared/agenda-pur';
import { estUneConsultation, masquePourLeSite, priceModeOf, racineOf, type MasquesDuSite } from '../../shared/catalogue-pur';
import { exigeConsultation, porteDuBesoin, type Besoin } from '../../shared/qualification';
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
};

type Doc<T> = { key: string; data: T };

let promesse: Promise<AgendaDeLaMaison | null> | null = null;

/** Tout ce que le calendrier a besoin de savoir, lu une seule fois. */
export function agendaDeLaMaison(branchId: string): Promise<AgendaDeLaMaison | null> {
  if (promesse) return promesse;
  promesse = (async () => {
    const supabase = await client();
    if (!supabase || !branchId) return null;
    const [services, categories, docs, blocages, branches] = await Promise.all([
      supabase.from('catalog_services').select('id,data'),
      supabase.from('catalog_categories').select('id,data'),
      supabase.from('documents').select('key,data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_vitrine_config']),
      supabase.from('blocages').select('id,data'),
      supabase.from('branches').select('id,data'),
    ]);
    const lignes = <T,>(r: { data: unknown }): T[] =>
      ((r.data ?? []) as { data?: T }[]).map((x) => x.data).filter(Boolean) as T[];

    const reglages = ((docs.data ?? []) as Doc<{ hours?: HeureDeLaSemaine[]; maxRdvParJourMaison?: number; maxRdvParJourMaitre?: number }>[])
      .find((d) => d.key === 'mnd_settings')?.data ?? {};
    const exceptions = ((docs.data ?? []) as Doc<ExceptionDHoraire[]>[])
      .find((d) => d.key === 'mnd_horaires_exceptions')?.data ?? [];
    const branche = ((branches.data ?? []) as { id: string; data?: { masters?: string[]; seats?: number } }[])
      .find((b) => b.id === branchId);
    const masques = ((docs.data ?? []) as Doc<{ siteMasques?: MasquesDuSite }>[])
      .find((d) => d.key === 'mnd_vitrine_config')?.data?.siteMasques ?? {};

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
    };
  })();
  return promesse;
}

/** Les créneaux déjà pris d'une période. ELLE ÉCHOUE OUVERT, comme Ma
    Couronne : si la fonction n'est pas posée ou si le réseau tombe, on rend
    une liste vide. Mieux vaut proposer une heure déjà prise, que le serveur
    refusera à l'écriture, que de fermer le salon tout entier. */
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
   Deux ateliers, et c'est délibéré : l'Entretien (avec ses familles, les
   lavages, les soins, les reprises de racines, les sorties signature) et la
   Coloration. Tout le reste ne se prend pas d'un clic par une inconnue : une
   création et une restauration passent par la consultation, les formations
   sont des candidatures, les mèches et les fournitures ne sont pas des
   rendez-vous, et MND Kids commence par un échange avec les parents.

   POURQUOI PAS LES MASQUES DE LA VITRINE, qui sont pourtant lisibles ici :
   ils règlent la carte du comptoir et Ma Couronne, deux surfaces où la
   Maison a choisi de cacher le Diagnostic, la Création et la Renaissance.
   Les suivre aurait caché exactement ce que ce site doit faire réserver. */
export const ATELIERS_RESERVABLES: readonly string[] = ['atl-ii-gbeji', 'atl-iii-yekpe'];

/* LA CONSULTATION DE CHAQUE PORTE — 17 septembre 2026, dictée par la Maison :
   « Le parcours 1 c'est le KÒKÒ Origine, première couronne ; le parcours 2
   c'est le KÒKÒ Suivi ; la consultation de MND Kids c'est Conseil et
   diagnostic. » Une visiteuse qui vient créer sa couronne n'a pas à choisir
   entre trois diagnostics : on lui propose LE SIEN.

   CE SONT DES IDENTIFIANTS, et on a appris ce matin ce qu'ils valent quand la
   Maison renomme : si celui-ci a disparu, on montre TOUTES les consultations
   plutôt qu'une page vide. Le prix n'est jamais écrit ici, il se lit sur le
   catalogue. */
export const CONSULTATION_PAR_PARCOURS: Readonly<Partial<Record<Besoin, string>>> = {
  creation: 'sv-koko-ori',
  reparation: 'sv-koko-sui',
  enfant: 'svc-doto-conseil',
};

/** Les prestations que CETTE porte autorise à réserver. Vide = l'écran
    retombe sur la demande de rappel, jamais sur une page morte. */
export function prestationsReservables(agenda: AgendaDeLaMaison, besoin: Besoin): PrestationPublique[] {
  const cats = agenda.categories;
  /* CE QUE LA MAISON A DÉCOCHÉ NE SE PROPOSE PLUS (17 septembre 2026). Le
     même juge sert à `demande-submit`, qui REFUSE : sans lui, décocher ne
     serait qu'un décor. */
  const offert = (s: PrestationPublique) => !masquePourLeSite(s, agenda.masques, cats);
  if (porteDuBesoin(besoin) === 'consultation') {
    const consultations = agenda.services.filter((s) => estUneConsultation(s, cats) && offert(s));
    const sienne = CONSULTATION_PAR_PARCOURS[besoin];
    const laSienne = sienne ? consultations.filter((s) => s.id === sienne) : [];
    /* Sa consultation si elle existe encore, sinon toutes : on ne ferme
       jamais la porte sur un identifiant qui a changé de nom. */
    return laSienne.length > 0 ? laSienne : consultations;
  }
  return agenda.services.filter((s) => {
    if (!offert(s)) return false;
    if (estUneConsultation(s, cats)) return false;
    if (exigeConsultation(s, cats)) return false;
    if (priceModeOf(s) === 'devis') return false;
    const racine = racineOf(cats, s.categoryId)?.id ?? s.categoryId;
    return ATELIERS_RESERVABLES.includes(racine);
  });
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
