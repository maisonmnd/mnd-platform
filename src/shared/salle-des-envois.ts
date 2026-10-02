/* ══ LA SALLE D'ATTENTE DES ENVOIS — 2 octobre 2026 ══════════════════════
   « Est-ce possible d'intercepter un message qui part vers chez un client ?
   D'arrêter l'envoi à cause de l'heure tardive ou autre raison, erreur…
   Besoin de voir immédiatement les nouveaux messages qui sont prêts à partir
   dans les 5 à 10 min à venir » (Yéman, 0 h 05, un rendez-vous posé à minuit
   allait réveiller sa cliente). Maquette `maquette-la-salle-d-attente-des-
   envois.html`, quatre arbitrages tranchés :

     · dix minutes de salle avant qu'un message parte seul ;
     · heures calmes de 20 h à 8 h : rien ne part seul, tout attend le matin ;
     · la réponse à une cliente qui réserve ELLE-MÊME reste immédiate ;
     · on est prévenu par la pastille, par le téléphone et par un son.

   COMMENT. Les fonctions planifiées ne s'adressent plus à la cliente : elles
   DÉPOSENT une ligne dans le journal des envois, statut « en-attente », avec
   son heure de départ et son colis (de quoi l'envoyer). Un facteur, réveillé
   chaque minute, envoie ce dont l'heure est venue. Entre les deux, une main
   peut retenir, relâcher, envoyer tout de suite ou écarter.

   TROIS RÈGLES, celles de la maquette :
     · un message retenu ne part jamais seul ;
     · un message attendu se relit avant de partir (un rendez-vous déplacé ou
       annulé pendant l'attente ne reçoit pas le message d'avant) ;
     · un message ne part qu'une fois.

   CE FICHIER EST LA SOURCE : le Trône l'importe, les fonctions Edge en
   recopient le calcul des heures (elles ne lisent rien du dépôt), et le
   harnais `verifie-la-salle-des-envois` tient les deux ensemble. Pur. */

/** Le salon vit à l'heure de Cotonou : UTC + 1, toute l'année, sans heure d'été. */
export const DECALAGE_DU_SALON_H = 1;

export type ReglesDeLaSalle = {
  /** Minutes passées en salle avant de partir seul. */
  salleMin: number;
  /** Les heures calmes commencent à cette heure du salon (20 = 20 h). */
  calmeDe: number;
  /** … et finissent à celle-ci (8 = 8 h). Égales : pas d'heures calmes. */
  calmeA: number;
};

export const REGLES_PAR_DEFAUT: ReglesDeLaSalle = { salleMin: 10, calmeDe: 20, calmeA: 8 };

/** Au-delà, le facteur est tenu pour absent : les fonctions envoient comme
    avant plutôt que de déposer des messages que personne ne porterait. */
export const FACTEUR_VIVANT_MS = 5 * 60_000;

/** Ce qu'on lit des réglages de la Maison (`mnd_auto_config`), bornes comprises. */
export function reglesDepuis(cfg: { salleMin?: unknown; calmeDe?: unknown; calmeA?: unknown } | null | undefined): ReglesDeLaSalle {
  const n = (v: unknown, min: number, max: number, defaut: number): number => {
    const x = Number(v);
    return Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : defaut;
  };
  return {
    salleMin: n(cfg?.salleMin, 1, 120, REGLES_PAR_DEFAUT.salleMin),
    calmeDe: n(cfg?.calmeDe, 0, 23, REGLES_PAR_DEFAUT.calmeDe),
    calmeA: n(cfg?.calmeA, 0, 23, REGLES_PAR_DEFAUT.calmeA),
  };
}

/** L'heure du salon à cet instant, en heures décimales (20.5 = 20 h 30). */
export const heureDuSalon = (ms: number): number => {
  const d = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
};

/** Cet instant tombe-t-il dans les heures calmes ? La fenêtre peut passer minuit. */
export function dansLesHeuresCalmes(ms: number, r: ReglesDeLaSalle): boolean {
  if (r.calmeDe === r.calmeA) return false;
  const h = heureDuSalon(ms);
  return r.calmeDe < r.calmeA ? (h >= r.calmeDe && h < r.calmeA) : (h >= r.calmeDe || h < r.calmeA);
}

/** La fin des heures calmes qui suit cet instant (lui-même dans les heures calmes). */
export function finDesHeuresCalmes(ms: number, r: ReglesDeLaSalle): number {
  const local = new Date(ms + DECALAGE_DU_SALON_H * 3_600_000);
  const fin = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), r.calmeA, 0, 0) - DECALAGE_DU_SALON_H * 3_600_000;
  return fin > ms ? fin : fin + 86_400_000;
}

/** QUAND CE MESSAGE POURRA PARTIR : après son temps de salle, et jamais dans
    les heures calmes. Né la nuit, il attend l'ouverture du matin. */
export function heureDeDepart(maintenantMs: number, r: ReglesDeLaSalle): { partA: number; calme: boolean } {
  const apresLaSalle = maintenantMs + r.salleMin * 60_000;
  if (!dansLesHeuresCalmes(apresLaSalle, r)) return { partA: apresLaSalle, calme: false };
  return { partA: finDesHeuresCalmes(apresLaSalle, r), calme: true };
}

/** Le facteur a-t-il donné signe de vie récemment ? */
export const facteurVivant = (vuLe: string | undefined | null, maintenantMs: number): boolean => {
  const t = Date.parse(vuLe ?? '');
  return Number.isFinite(t) && maintenantMs - t <= FACTEUR_VIVANT_MS && t - maintenantMs <= FACTEUR_VIVANT_MS;
};

/* ── La ligne en salle ───────────────────────────────────────────────── */

export const EN_ATTENTE = 'en-attente';
export const RETENU = 'retenu';
export const ECARTE = 'écarté';
export const PERIME = 'périmé';
/** Le facteur l'a pris en main : plus personne ne peut le retenir. */
export const EN_ENVOI = 'en-envoi';

export type EnvoiEnSalle = {
  id: string;
  statut: string;
  /** L'instant où il pourra partir (ISO). */
  partA?: string;
  /** Il attend la fin des heures calmes. */
  calme?: boolean;
  /** Une main a dit « maintenant » : il part même pendant les heures calmes. */
  parLaMain?: boolean;
  retenuPar?: string;
  retenuLe?: string;
  ecartePar?: string;
  ecarteLe?: string;
  deposeLe?: string;
};

export const estEnSalle = (e: Pick<EnvoiEnSalle, 'statut'>): boolean => e.statut === EN_ATTENTE || e.statut === RETENU;
/** Pas encore parti : la ligne n'appartient pas encore au journal. Un message
    écarté ou périmé, lui, y figure : il faut pouvoir retrouver ce qui n'est
    PAS parti, et pourquoi. */
export const attendEncore = (e: Pick<EnvoiEnSalle, 'statut'>): boolean =>
  e.statut === EN_ATTENTE || e.statut === RETENU || e.statut === EN_ENVOI;

/** LE FACTEUR PEUT-IL LE PORTER MAINTENANT ? Seul un message en attente, dont
    l'heure est venue, part ; et pendant les heures calmes, seulement si une
    main l'a demandé. */
export function peutPartir(e: EnvoiEnSalle, maintenantMs: number, r: ReglesDeLaSalle): boolean {
  if (e.statut !== EN_ATTENTE) return false;
  const t = Date.parse(e.partA ?? '');
  if (!Number.isFinite(t) || t > maintenantMs) return false;
  return e.parLaMain === true || !dansLesHeuresCalmes(maintenantMs, r);
}

/** Les gestes de la main. Chacun rend la ligne telle qu'elle doit s'écrire,
    ou `null` quand le geste n'a plus de sens (le message est déjà parti). */
export function retiens<T extends EnvoiEnSalle>(e: T, qui: string, quandIso: string): T | null {
  if (e.statut !== EN_ATTENTE) return null;
  return { ...e, statut: RETENU, retenuPar: qui, retenuLe: quandIso };
}
export function relache<T extends EnvoiEnSalle>(e: T, maintenantMs: number, r: ReglesDeLaSalle): T | null {
  if (e.statut !== RETENU) return null;
  const { partA, calme } = heureDeDepart(maintenantMs, r);
  const { retenuPar: _p, retenuLe: _l, parLaMain: _m, ...reste } = e;
  return { ...(reste as T), statut: EN_ATTENTE, partA: new Date(partA).toISOString(), calme };
}
export function envoieMaintenant<T extends EnvoiEnSalle>(e: T, maintenantMs: number): T | null {
  if (e.statut !== EN_ATTENTE && e.statut !== RETENU) return null;
  const { retenuPar: _p, retenuLe: _l, ...reste } = e;
  return { ...(reste as T), statut: EN_ATTENTE, partA: new Date(maintenantMs).toISOString(), calme: false, parLaMain: true };
}
export function ecarte<T extends EnvoiEnSalle>(e: T, qui: string, quandIso: string): T | null {
  if (e.statut !== EN_ATTENTE && e.statut !== RETENU) return null;
  return { ...e, statut: ECARTE, ecartePar: qui, ecarteLe: quandIso };
}

/** CE QUE LA PASTILLE DIT : combien attendent, combien sont retenus, et dans
    combien de minutes part le premier. */
export function resumeDeLaSalle(envois: readonly EnvoiEnSalle[], maintenantMs: number): {
  attente: number; tenus: number; prochainDansMin: number | null;
} {
  let attente = 0; let tenus = 0; let prochain: number | null = null;
  for (const e of envois) {
    if (e.statut === RETENU) { tenus += 1; continue; }
    if (e.statut !== EN_ATTENTE) continue;
    attente += 1;
    const t = Date.parse(e.partA ?? '');
    if (Number.isFinite(t) && (prochain === null || t < prochain)) prochain = t;
  }
  return { attente, tenus, prochainDansMin: prochain === null ? null : Math.max(0, Math.ceil((prochain - maintenantMs) / 60_000)) };
}

/** « part dans 4 min », « part à 8 h », « part à l'instant ». */
export function quandIlPart(e: Pick<EnvoiEnSalle, 'partA' | 'calme'>, maintenantMs: number): string {
  const t = Date.parse(e.partA ?? '');
  if (!Number.isFinite(t)) return '';
  const min = Math.ceil((t - maintenantMs) / 60_000);
  if (min <= 0) return 'part à l’instant';
  if (min <= 60) return `part dans ${min} min`;
  const h = heureDuSalon(t);
  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
  return `part à ${hh} h${mm > 0 ? ` ${String(mm).padStart(2, '0')}` : ''}`;
}

/** LE RENDEZ-VOUS A-T-IL BOUGÉ PENDANT L'ATTENTE ? Le facteur relit avant de
    porter : un rendez-vous disparu, annulé, déplacé ou déjà passé ne reçoit
    pas le message qu'on lui destinait. Rend le motif, ou `null` si tout tient. */
export function pourquoiIlNePartPlus(
  e: { dateRdv?: string; heure?: string; type?: string },
  rdv: { date?: string; time?: string; status?: string } | null | undefined,
  maintenantMs: number,
): string | null {
  if (!rdv) return 'le rendez-vous n’existe plus';
  if (rdv.status === 'annulé') return 'le rendez-vous a été annulé';
  if ((rdv.date ?? '') !== (e.dateRdv ?? '') || (rdv.time ?? '') !== (e.heure ?? '')) return 'le rendez-vous a été déplacé';
  if (e.type === 'confirmation' && rdv.status !== 'confirmé') return 'le rendez-vous n’est plus confirmé';
  /* « Votre rendez-vous est demain » ne part pas le jour même : un rappel du
     soir retenu par les heures calmes arriverait au matin du rendez-vous. */
  if (e.type === 'rappel-j1' && new Date(maintenantMs + 3_600_000).toISOString().slice(0, 10) >= (rdv.date ?? '')) return 'trop tard pour un rappel de la veille';
  const h = /^\d{1,2}:\d{2}$/.test(rdv.time ?? '') ? (rdv.time as string).padStart(5, '0') : '23:59';
  const moment = Date.parse(`${rdv.date}T${h}:00+01:00`);
  if (Number.isFinite(moment) && moment <= maintenantMs) return 'l’heure du rendez-vous est passée';
  return null;
}
