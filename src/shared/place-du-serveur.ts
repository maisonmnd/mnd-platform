import {
  creneauxLibres, dureeDesPrestations, minutesDeHhmm, occupesDuJour, ouvertureDuJour, plagesBloquees,
  type CreneauOccupe, type ExceptionDHoraire, type HeureDeLaSemaine, type MurPose,
} from './agenda-pur';
import { estUneConsultation, masquePourLeSite, priceModeOf, racineOf, type MasquesDuSite, type PriceMode } from './catalogue-pur';
import { exigeConsultation, type Besoin } from './qualification';

/* ══ LA PLACE, JUGÉE PAR LE SERVEUR · 9 octobre 2026 ═══════════════════════
   « Quand une cliente écrit, la Maison lui répond seule, lui propose de vraies
   places libres du calendrier et pose le rendez-vous dans le Trône » (maquette
   « Réserver sur WhatsApp », validée le 9 octobre 2026). Deux portes posent
   désormais un rendez-vous sans qu'une main du Trône le voie : le site
   (`demande-submit`) et WhatsApp (`whatsapp-automate`). Elles jugent la place
   par CE module, recopié tel quel entre ses repères.

   CE QUE LE JUGE DU SITE NE VOYAIT PAS (relevé du 9 octobre 2026) :
     · les FAUTEUILS. Le site les comptait (le samedi plein du 17 septembre),
       le serveur non : un appel direct remplissait une Maison pleine ;
     · la CONSULTATION PRÉALABLE. Une création VÈKPÈ™, une restauration
       FÍNFÍN™, un devis ou une prestation « consultation avant » se
       réservaient d'un appel direct. Désormais : `consultation_requise` ;
     · le MAÎTRE LIBRE. Il prenait `maitres[0]` sans regarder. Désormais la
       liste des maîtres LIBRES à cette heure, dans l'ordre de la Maison ; le
       verrou (`pose_si_libre`, migration 0125) prend le premier encore libre ;
     · le JOUR DE COTONOU. « Jamais le jour même » se comptait sur l'horloge
       UTC du serveur : entre minuit et une heure à Cotonou, le jour même
       passait. Le jour se compte ici à UTC+1 (le Bénin n'a pas d'heure d'été) ;
     · la DURÉE FIGÉE. Un rendez-vous posé porte `dureeMin` depuis le
       1er septembre 2026 ; les créneaux occupés se lisent désormais par
       `creneaux_occupes`, qui la lit d'abord (`duree_du_rdv`, 0125).

   CE QUI SE RÉSERVE EN LIGNE vit ici aussi (`reservableSurLeSite`, les deux
   ateliers, la consultation de chaque parcours) : le site public, qui le
   tenait dans `revelateur/agenda.ts`, le ré-exporte. L'écran propose, le
   serveur dispose, et les deux lisent la même règle.

   LES PLACES LIBRES (`placesLibres`) sont celles que le site montre
   (`heuresLibres`), jour par jour : le même `creneauxLibres`, maître par
   maître, fauteuils, plafonds et murs compris. Le harnais le vérifie.

   PUR : ni magasin, ni réseau, ni horloge (l'instant entre par la porte).
   Le bloc entre les repères ⟨place-du-serveur⟩ n'a ni `import` ni `export` :
   dans une fonction Edge, il s'appuie PAR LEUR NOM sur les blocs ⟨agenda-pur⟩,
   ⟨catalogue-pur⟩ et ⟨qualification⟩, recopiés juste avant lui. La règle R8
   de `verifie-les-douze-lunes` confronte chaque copie caractère pour
   caractère ; `verifie-la-place-du-serveur` les fait tourner sur les mêmes
   cas que l'original. */

/* ⟨place-du-serveur⟩ */
/* ── 1. CE QUI SE RÉSERVE EN LIGNE ──────────────────────────────────────
   Deux ateliers, et c'est délibéré : l'Entretien (lavages, soins, reprises de
   racines, sorties signature) et la Coloration. Une création et une
   restauration passent par la consultation, les formations sont des
   candidatures, les mèches et les fournitures ne sont pas des rendez-vous.
   Les masques de la Vitrine (comptoir, Ma Couronne) ne comptent pas ici :
   seuls ceux du site public (`siteMasques`). */
const ATELIERS_RESERVABLES: readonly string[] = ['atl-ii-gbeji', 'atl-iii-yekpe'];

/* LA CONSULTATION DE CHAQUE PORTE (la Maison, 17 septembre 2026) : le KÒKÒ
   Origine pour une première couronne, le KÒKÒ Suivi pour une réparation, le
   Conseil et diagnostic pour un enfant. Un identifiant disparu ne ferme
   jamais la porte : l'écran propose alors toutes les consultations. */
const CONSULTATION_PAR_PARCOURS: Readonly<Partial<Record<Besoin, string>>> = {
  creation: 'sv-koko-ori',
  reparation: 'sv-koko-sui',
  enfant: 'svc-doto-conseil',
};

/** Trois mois au plus : un carnet ne se remplit pas à l'aveugle. */
const FENETRE_DE_RESERVATION = 90;
const UN_JOUR_MS = 86_400_000;

type PrestationDuServeur = {
  id: string;
  name?: string;
  categoryId: string;
  durationMin?: number;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  consultationAvant?: boolean;
  enabled?: boolean;
  archived?: boolean;
  /** Le maître que la prestation désigne, quand elle en désigne un. */
  master?: string;
};

type CategorieDuServeur = { id: string; parentId?: string };

/** UNE PRESTATION SE RÉSERVE-T-ELLE EN LIGNE ? Active, non décochée pour le
    site, et soit une consultation, soit un geste d'un atelier réservable qui
    n'exige pas de consultation et n'est pas sur devis. */
function reservableSurLeSite(
  s: {
    id: string; categoryId: string; name?: string; priceMode?: PriceMode; hidePrice?: boolean;
    consultationAvant?: boolean; enabled?: boolean; archived?: boolean;
  },
  cats: { id: string; parentId?: string }[],
  masques: MasquesDuSite | undefined,
): boolean {
  if (s.enabled === false || s.archived) return false;
  if (masquePourLeSite(s, masques, cats)) return false;
  if (estUneConsultation(s, cats)) return true;
  if (exigeConsultation(s, cats) || priceModeOf(s) === 'devis') return false;
  const racine = racineOf(cats, s.categoryId)?.id ?? s.categoryId;
  return ATELIERS_RESERVABLES.includes(racine);
}

/* ── 2. L'AGENDA DU SERVEUR ─────────────────────────────────────────────
   Tout ce que le juge lit, mis en forme depuis les lignes que la fonction
   vient de lire en base : la branche (maîtres, fauteuils), `mnd_settings`
   (semaine, plafonds), `mnd_horaires_exceptions`, `mnd_vitrine_config`
   (masques du site, formules rapides), le catalogue et ses familles, les
   blocages, et les créneaux occupés (`creneaux_occupes`). Une valeur mal
   écrite en base se lit comme vide, jamais comme une panne. */
type AgendaDuServeur = {
  branchId: string;
  maitres: string[];
  /** Les fauteuils de la Maison. 0 = sans limite. */
  sieges: number;
  capMaison: number;
  capMaitre: number;
  semaine: HeureDeLaSemaine[];
  exceptions: ExceptionDHoraire[];
  murs: MurPose[];
  occupes: CreneauOccupe[];
  /** Tout le catalogue, prestations éteintes comprises : le juge dit pourquoi. */
  services: PrestationDuServeur[];
  categories: CategorieDuServeur[];
  masques: MasquesDuSite;
  formules: { serviceIds: string[] }[];
};

type LignesDeLAgenda = {
  branche: { id: string; data?: unknown } | null | undefined;
  /** `mnd_settings.data` */
  reglages?: unknown;
  /** `mnd_horaires_exceptions.data` */
  exceptions?: unknown;
  /** `mnd_vitrine_config.data` */
  vitrine?: unknown;
  services?: readonly { id: string; data?: unknown }[] | null;
  categories?: readonly { id: string; data?: unknown }[] | null;
  blocages?: readonly { id?: string; data?: unknown }[] | null;
  /** Les lignes de `creneaux_occupes` : jour, maître, début, durée. */
  occupes?: readonly unknown[] | null;
};

function agendaDepuisLesLignes(l: LignesDeLAgenda): AgendaDuServeur | null {
  const objet = (v: unknown): Record<string, unknown> =>
    (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
  const chaine = (v: unknown): string =>
    (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const ids = (v: unknown): string[] => liste(v).filter((x): x is string => typeof x === 'string' && x !== '');
  /* Un entier écrit en nombre ou en texte, comme le lit le verrou (0125) ;
     illisible ou négatif : 0, c'est-à-dire sans limite. */
  const entier = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,4}(\.\d+)?\s*$/.test(v) ? Number(v) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const MODES: readonly string[] = ['fixe', 'variable', 'devis'];

  const brancheId = chaine(l.branche?.id);
  if (!l.branche || !brancheId) return null;
  const branche = objet(l.branche.data);
  const reglages = objet(l.reglages);
  const vitrine = objet(l.vitrine);
  const masques = objet(vitrine.siteMasques);

  const semaine: HeureDeLaSemaine[] = liste(reglages.hours).map(objet)
    .filter((h) => chaine(h.key) !== '')
    .map((h) => ({ key: chaine(h.key), open: chaine(h.open), close: chaine(h.close), closed: !!h.closed }));
  const exceptions: ExceptionDHoraire[] = liste(l.exceptions).map(objet)
    .filter((e) => chaine(e.date) !== '')
    .map((e) => ({
      date: chaine(e.date),
      ...(chaine(e.staffId) ? { staffId: chaine(e.staffId) } : {}),
      ...(chaine(e.open) ? { open: chaine(e.open) } : {}),
      ...(chaine(e.close) ? { close: chaine(e.close) } : {}),
      closed: !!e.closed,
    }));
  const murs: MurPose[] = (l.blocages ?? []).map((b) => objet(objet(b).data))
    .filter((b) => chaine(b.branchId) !== '' && chaine(b.date) !== '')
    .map((b) => ({
      branchId: chaine(b.branchId),
      date: chaine(b.date),
      ...(chaine(b.master) ? { master: chaine(b.master) } : {}),
      ...(chaine(b.debut) ? { debut: chaine(b.debut) } : {}),
      ...(chaine(b.fin) ? { fin: chaine(b.fin) } : {}),
    }));
  const occupes: CreneauOccupe[] = (l.occupes ?? []).map(objet)
    .filter((c) => chaine(c.jour) !== '' && /^\d{1,2}:\d{2}/.test(chaine(c.debut)))
    .map((c) => {
      const d = Number(c.duree);
      return { jour: chaine(c.jour), maitre: chaine(c.maitre), debut: chaine(c.debut), duree: Number.isFinite(d) && d >= 1 ? d : 60 };
    });
  const services: PrestationDuServeur[] = (l.services ?? []).map((r) => {
    const d = objet(r.data);
    const duree = Number(d.durationMin);
    const mode = chaine(d.priceMode);
    return {
      id: chaine(r.id) || chaine(d.id),
      name: chaine(d.name),
      categoryId: chaine(d.categoryId),
      ...(d.durationMin !== undefined && d.durationMin !== null && d.durationMin !== '' && Number.isFinite(duree) && duree >= 0 ? { durationMin: duree } : {}),
      ...(MODES.includes(mode) ? { priceMode: mode as PriceMode } : {}),
      ...(d.hidePrice ? { hidePrice: true } : {}),
      ...(d.consultationAvant === true ? { consultationAvant: true } : {}),
      ...(d.enabled === false ? { enabled: false } : {}),
      ...(d.archived ? { archived: true } : {}),
      ...(chaine(d.master) ? { master: chaine(d.master) } : {}),
    };
  }).filter((s) => s.id !== '');
  const categories: CategorieDuServeur[] = (l.categories ?? []).map((r) => {
    const d = objet(r.data);
    return { id: chaine(r.id), ...(chaine(d.parentId) ? { parentId: chaine(d.parentId) } : {}) };
  }).filter((c) => c.id !== '');

  return {
    branchId: brancheId,
    maitres: ids(branche.masters),
    sieges: entier(branche.seats),
    capMaison: entier(reglages.maxRdvParJourMaison),
    capMaitre: entier(reglages.maxRdvParJourMaitre),
    semaine,
    exceptions,
    murs,
    occupes,
    services,
    categories,
    masques: { services: ids(masques.services), categories: ids(masques.categories) },
    formules: liste(vitrine.formulesRapides).map(objet)
      .map((f) => ({ serviceIds: ids(f.serviceIds) }))
      .filter((f) => f.serviceIds.length > 0),
  };
}

/* ── 3. LE JOUR, À L'HEURE DE COTONOU ───────────────────────────────────
   UTC+1, toute l'année. Jamais l'horloge du serveur (UTC) : entre minuit et
   une heure à Cotonou, elle croit encore être la veille. */
const jourDeCotonou = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);

/** Le jour `n` jours après `iso` (AAAA-MM-JJ). Illisible : chaîne vide. */
function isoApresJours(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * UN_JOUR_MS).toISOString().slice(0, 10) : '';
}

/** Combien de jours d'ici (Cotonou) à `dateIso` : 1 = demain, 0 = aujourd'hui.
    Une date qui n'existe pas (le 31 février) rend NaN. */
function joursDEcart(dateIso: string, ms: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || isoApresJours(dateIso, 0) !== dateIso) return Number.NaN;
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${jourDeCotonou(ms)}T00:00:00Z`)) / UN_JOUR_MS);
}

/* ── 4. LE JUGE ─────────────────────────────────────────────────────────
   Les codes sont ceux que le site sait déjà dire (`creneau_*`, `prestation_*`),
   plus `consultation_requise`. */
type RefusDeLaPlace =
  | 'creneau_invalide' | 'creneau_hors_fenetre' | 'creneau_ferme'
  | 'prestation_inconnue' | 'prestation_retiree' | 'consultation_requise'
  | 'creneau_hors_ouverture' | 'creneau_plafond' | 'creneau_pris';

type DemandeDePlace = { date: string; time: string; serviceIds: readonly string[] };

/** La place tient : sa durée, et les maîtres LIBRES à cette heure, dans
    l'ordre de la Maison (le verrou prend le premier encore libre). */
type VerdictDeLaPlace =
  | { ok: true; dureeMin: number; maitres: string[] }
  | { ok: false; erreur: RefusDeLaPlace };

/** Une place proposée : un jour et une heure, jamais un maître. */
type PlaceDuServeur = { iso: string; heure: string };

/** LA FORME ET LA FENÊTRE, avant toute lecture : un appel mal formé ne coûte
    rien à la base. Jamais le jour même (la Maison prépare la venue), jamais
    au-delà de trois mois. */
function laPlaceEstRecevable(p: { date: string; time: string }, ms: number): RefusDeLaPlace | null {
  const m = /^(\d{2}):(\d{2})$/.exec(String(p.time ?? ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return 'creneau_invalide';
  const ecart = joursDEcart(String(p.date ?? ''), ms);
  if (Number.isNaN(ecart)) return 'creneau_invalide';
  if (ecart < 1 || ecart > FENETRE_DE_RESERVATION) return 'creneau_hors_fenetre';
  return null;
}

/** LES GESTES : tous connus et actifs, aucun qui exige une consultation
    (sauf la consultation elle-même), tous ouverts à la réservation en ligne. */
function lesGestesSeReservent(agenda: AgendaDuServeur, serviceIds: readonly string[]): RefusDeLaPlace | null {
  if (serviceIds.length === 0) return 'prestation_inconnue';
  const gestes = serviceIds.map((id) => agenda.services.find((s) => s.id === id));
  const connus = gestes.filter((s): s is PrestationDuServeur => !!s && s.enabled !== false && !s.archived);
  if (connus.length !== serviceIds.length) return 'prestation_inconnue';
  const cats = agenda.categories;
  if (connus.some((s) => !estUneConsultation(s, cats) && exigeConsultation(s, cats))) return 'consultation_requise';
  if (connus.some((s) => !reservableSurLeSite(s, cats, agenda.masques))) return 'prestation_retiree';
  return null;
}

/** LES MAÎTRES À ESSAYER, comme le site (`heuresLibres`) : celui que désigne
    une prestation s'il y en a un, sinon ceux de la Maison, sinon le libellé
    vide d'une branche qui n'en déclare aucun. */
function maitresDuRituel(agenda: AgendaDuServeur, serviceIds: readonly string[]): string[] {
  const designes = serviceIds
    .map((id) => agenda.services.find((s) => s.id === id)?.master)
    .filter((m): m is string => !!m);
  if (designes.length > 0) return [...new Set(designes)];
  return agenda.maitres.length > 0 ? [...agenda.maitres] : [''];
}

/** LA PLACE TIENT-ELLE ? Tout ce que le site montrait, revérifié sur
    l'instantané que la fonction vient de lire. Le verrou (`pose_si_libre`)
    rejoue le plafond, les fauteuils et les maîtres sous verrou. */
function laPlaceTient(agenda: AgendaDuServeur, p: DemandeDePlace, ms: number): VerdictDeLaPlace {
  const recevable = laPlaceEstRecevable(p, ms);
  if (recevable) return { ok: false, erreur: recevable };
  /* Sans semaine connue, le jour est fermé : mieux vaut un rappel qu'un
     lundi ouvert que la Maison ferme. */
  const fenetre = ouvertureDuJour(p.date, agenda.semaine, agenda.exceptions);
  if (fenetre.closed) return { ok: false, erreur: 'creneau_ferme' };
  const gestes = lesGestesSeReservent(agenda, p.serviceIds);
  if (gestes) return { ok: false, erreur: gestes };

  const dureeMin = dureeDesPrestations(p.serviceIds, agenda.services);
  const debut = minutesDeHhmm(p.time);
  const fin = debut + dureeMin;
  if (debut < fenetre.openMin || fin > fenetre.closeMin) return { ok: false, erreur: 'creneau_hors_ouverture' };

  const duJour = occupesDuJour(agenda.occupes, p.date);
  /* Le plafond de la Maison : ses rendez-vous du jour, tous maîtres confondus. */
  if (agenda.capMaison > 0 && duJour.length >= agenda.capMaison) return { ok: false, erreur: 'creneau_plafond' };
  /* LES FAUTEUILS : le maître peut être libre, la Maison pleine. */
  if (agenda.sieges > 0
    && duJour.filter((a) => debut < a.debutMin + a.dureeMin && fin > a.debutMin).length >= agenda.sieges) {
    return { ok: false, erreur: 'creneau_pris' };
  }

  /* LES MAÎTRES LIBRES, tous, dans l'ordre : jamais le premier sans regarder. */
  const candidats = maitresDuRituel(agenda, p.serviceIds);
  const libres: string[] = [];
  let plafonnes = 0;
  for (const m of candidats) {
    const siens = duJour.filter((a) => a.maitre === m);
    if (agenda.capMaitre > 0 && siens.length >= agenda.capMaitre) {
      plafonnes += 1;
      continue;
    }
    const occupe = [
      ...siens.map((a): [number, number] => [a.debutMin, a.debutMin + a.dureeMin]),
      ...plagesBloquees(agenda.murs, agenda.branchId, p.date, m),
    ].some(([s, e]) => debut < e && fin > s);
    if (!occupe) libres.push(m);
  }
  if (libres.length === 0) return { ok: false, erreur: plafonnes === candidats.length ? 'creneau_plafond' : 'creneau_pris' };
  return { ok: true, dureeMin, maitres: libres };
}

/** LES PLACES LIBRES, de demain (à Cotonou) à l'horizon, rangées dans le
    temps : les heures que le site montrerait, jour par jour (le même
    `creneauxLibres`, maître par maître, fauteuils, plafonds et murs compris).
    Des gestes qui ne se réservent pas en ligne n'ont aucune place. */
function placesLibres(
  agenda: AgendaDuServeur, serviceIds: readonly string[], ms: number, horizonJours = 14,
): PlaceDuServeur[] {
  if (lesGestesSeReservent(agenda, serviceIds)) return [];
  const voulu = Math.round(Number(horizonJours));
  const n = Math.max(1, Math.min(FENETRE_DE_RESERVATION, Number.isFinite(voulu) && voulu > 0 ? voulu : 14));
  const durationMin = dureeDesPrestations(serviceIds, agenda.services);
  const maitres = maitresDuRituel(agenda, serviceIds);
  const aujourdhui = jourDeCotonou(ms);
  const out: PlaceDuServeur[] = [];
  for (let i = 1; i <= n; i += 1) {
    const iso = isoApresJours(aujourdhui, i);
    const opening = ouvertureDuJour(iso, agenda.semaine, agenda.exceptions);
    if (opening.closed) continue;
    const occupes = occupesDuJour(agenda.occupes, iso);
    const heures = new Set<string>();
    for (const master of maitres) {
      const libres = creneauxLibres({
        opening,
        durationMin,
        occupes,
        bloques: plagesBloquees(agenda.murs, agenda.branchId, iso, master),
        master,
        capMaison: agenda.capMaison,
        capMaitre: agenda.capMaitre,
        capSimultane: agenda.sieges,
        maintenantMin: null,
      });
      for (const h of libres) heures.add(h);
    }
    for (const heure of [...heures].sort()) out.push({ iso, heure });
  }
  return out;
}
/* ⟨/place-du-serveur⟩ */

export {
  ATELIERS_RESERVABLES, CONSULTATION_PAR_PARCOURS, FENETRE_DE_RESERVATION,
  reservableSurLeSite, agendaDepuisLesLignes, jourDeCotonou, isoApresJours, joursDEcart,
  laPlaceEstRecevable, lesGestesSeReservent, maitresDuRituel, laPlaceTient, placesLibres,
};
export type {
  PrestationDuServeur, CategorieDuServeur, AgendaDuServeur, LignesDeLAgenda,
  RefusDeLaPlace, DemandeDePlace, VerdictDeLaPlace, PlaceDuServeur,
};
