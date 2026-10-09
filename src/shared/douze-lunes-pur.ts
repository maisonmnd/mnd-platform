import { FORME_DU_CODE, codeDeMarraine, prenomDuNom, type ResumeParrainage, type SoinOffert } from './parrainage-pur';

/* ══ DE MAIN EN MAIN — 9 octobre 2026 ═══════════════════════════════════
   Le nouveau programme d'ambassadrices de la Maison. La carte ne se donne
   plus à toutes : elle se GAGNE à la Maison. À sa Nᵉ visite honorée depuis
   le 1er janvier 2026 (cinq par défaut), une cliente devient GRAINE : le
   Trône pose son code et sa carte. C'est une DÉCISION écrite sur sa fiche
   (`graine`), jamais une déduction refaite à chaque passage : relever N plus
   tard, annuler une visite après coup, rien ne la reprend.

   Ce module est PUR : ni magasin, ni réseau, il n'importe que
   `parrainage-pur`. Le Trône l'applique (useParrainageVivant, le geste de
   lancement), Ma Couronne en tire « votre Graine dans n visites » avec la
   MÊME règle, le harnais l'éprouve.

   Les décisions de la direction (9 octobre 2026) :
   · une visite est un JOUR : deux rendez-vous honorés le même jour font un ;
   · aucune exclusion : toute fiche non archivée peut devenir Graine, têtes
     dépendantes et prix convenus compris (le paramètre `exclues` reste, le
     Trône passe un ensemble vide) ;
   · au lancement, TOUTES les récompenses de l'ancien programme se retirent,
     utilisées et expirées comprises : l'archive de la fiche les garde, le
     Foyer reste ;
   · une amie invitée avant le lancement et venue après vaut son merci à sa
     marraine dès que celle-ci est Graine : `parraineePar` n'est pas vidé,
     l'ancien code reste lisible dans l'archive.

   Les noms techniques (`douze-lunes`, `mnd_douze_lunes`,
   `avantLesDouzeLunes`) gardent le premier nom du programme ; « Les Douze
   Lunes » est devenu l'accompagnement de la première année (phase 2). */

/** Les visites comptent à partir de ce jour, inclus. */
export const DEBUT_DES_LUNES = '2026-01-01';
export const SEUIL_GRAINE_DEFAUT = 5;
export const SEUIL_GRAINE_MIN = 1;
export const SEUIL_GRAINE_MAX = 20;
/** LA BORNE ANTI-RAFALE : au-delà de ce nombre de Graines à poser d'un même
    passage, le Trône n'écrit rien seul ; la direction voit la liste. */
export const PLAFOND_SANS_MAIN = 10;

/** Le document `mnd_douze_lunes`, lisible par les clientes connectées (0124). */
export type ReglageDesLunes = {
  /** N : les visites honorées qui font une Graine. */
  seuilGraine: number;
  /** L'instant du lancement (ISO), posé EN DERNIER par le geste. Absent :
      aucune Graine ne se pose, aucun merci ne part. */
  lanceLe?: string;
  lancePar?: string;
  /** Le retour en arrière : `lanceLe` retiré, l'instant gardé ici. */
  annuleLe?: string;
  /** LE REMERCIEMENT WHATSAPP DE « DE MAIN EN MAIN » (9 octobre 2026). Le
      geste le reprend de `mnd_parrainage`, où il ÉTEINT l'ancien : un vieux
      poste resté sur l'ancien moteur n'envoie plus rien, le moteur neuf ne
      lit que celui-ci. */
  merciParWhatsApp?: boolean;
};

/** La Graine, posée par le Trône seul (champ protégé par 0124). */
export type Graine = {
  code: string;
  /** Le jour où le Trône l'a posée. */
  le: string;
  /** Le jour de la Nᵉ visite honorée : la date MÉTIER d'un envoi futur. */
  atteinteLe: string;
  /** N au moment de la pose : le relever plus tard ne reprend rien. */
  seuil: number;
};

/** CE QUE LA FICHE PORTAIT AVANT LE LANCEMENT. Écrite une fois, jamais
    réécrite : c'est elle qui sert à revenir en arrière. */
export type ArchiveDesLunes = {
  /** L'instant du geste. */
  le: string;
  codeParrain?: string;
  parrainage?: ResumeParrainage;
  soinsRetires: SoinOffert[];
  /** L'ordre des récompenses avant le geste (leurs identifiants), pour les
      rendre à leur place au retour. */
  ordreDesSoins?: string[];
};

/** Ce que le juge lit d'une fiche. */
export type FicheDesLunes = {
  id: string;
  name?: string;
  archived?: boolean;
  codeParrain?: string;
  parrainage?: ResumeParrainage;
  soinsOfferts?: SoinOffert[];
  parraineePar?: string;
  graine?: Graine;
  avantLesDouzeLunes?: ArchiveDesLunes;
};
export type RdvDesLunes = { status: string; date: string; clientId?: string };
export type DemandeDesLunes = { id?: string; prenom?: string; codeParrain?: string; parrainDe?: string; code?: string };

/** N, borné : un réglage absent ou abîmé vaut cinq. */
export function seuilDeLaGraine(r?: Partial<ReglageDesLunes> | null): number {
  const n = Math.round(Number(r?.seuilGraine));
  if (!Number.isFinite(n) || n < SEUIL_GRAINE_MIN) return SEUIL_GRAINE_DEFAUT;
  return Math.min(SEUIL_GRAINE_MAX, n);
}

/* ── LES VISITES ─────────────────────────────────────────────────────────
   UNE SEULE RÈGLE, pour le Trône et pour Ma Couronne : un rendez-vous
   HONORÉ, daté entre le 1er janvier 2026 et aujourd'hui. La borne haute
   écarte les reprises honorées d'avance (4 octobre). Un jour compte une
   fois. */
const estUneVisiteDesLunes = (r: RdvDesLunes | null | undefined, aujourdhui: string): boolean => {
  if (!r || r.status !== 'honoré') return false;
  const jour = String(r.date ?? '').slice(0, 10);
  return jour >= DEBUT_DES_LUNES && jour <= aujourdhui;
};

/** Les jours de visite d'une fiche, distincts et dans l'ordre. */
export function joursDesLunes(rdvs: readonly RdvDesLunes[], clientId: string, aujourdhui: string): string[] {
  const jours = new Set<string>();
  for (const r of rdvs) if (r?.clientId === clientId && estUneVisiteDesLunes(r, aujourdhui)) jours.add(r.date.slice(0, 10));
  return [...jours].sort();
}

/** Les jours de visite de toutes les fiches, en un seul passage sur le carnet. */
export function joursParFiche(rdvs: readonly RdvDesLunes[], aujourdhui: string): Map<string, string[]> {
  const parFiche = new Map<string, Set<string>>();
  for (const r of rdvs) {
    if (!r?.clientId || !estUneVisiteDesLunes(r, aujourdhui)) continue;
    const jours = parFiche.get(r.clientId) ?? new Set<string>();
    jours.add(r.date.slice(0, 10));
    parFiche.set(r.clientId, jours);
  }
  return new Map([...parFiche].map(([id, jours]) => [id, [...jours].sort()]));
}

export const visitesDesLunes = (rdvs: readonly RdvDesLunes[], clientId: string, aujourdhui: string): number =>
  joursDesLunes(rdvs, clientId, aujourdhui).length;

/** « Votre Graine dans n visites » : jamais moins de zéro. */
export const resteAvantLaGraine = (visites: number, seuil: number): number => Math.max(0, seuil - visites);

/* ── LE CODE ACTIF ───────────────────────────────────────────────────────
   Le seul code qui ouvre quelque chose est celui de la Graine. Tout autre
   code est éteint : anciens `codeParrain`, codes des demandes « Marraine »
   du site, code reposé par un vieux poste. Archivée, une fiche n'a plus de
   code actif.

   CE BLOC EST RECOPIÉ TEL QUEL dans la fonction `demande-submit` (une
   fonction Edge ne lit rien du dépôt), juste après sa propre
   `FORME_DU_CODE`, que `verifie-le-parrainage` confronte déjà à celle-ci ;
   le harnais confronte les deux copies du bloc, caractère pour caractère. */
/* ⟨code-actif⟩ */
function codeActifDe(fiche: unknown): string | null {
  if (!fiche || typeof fiche !== 'object') return null;
  const f = fiche as { archived?: unknown; graine?: { code?: unknown } | null };
  const code = f.graine && typeof f.graine === 'object' ? f.graine.code : undefined;
  return f.archived !== true && typeof code === 'string' && FORME_DU_CODE.test(code) ? code : null;
}
/* ⟨/code-actif⟩ */
export { codeActifDe };

/** LE CODE QUE PORTE LA CARTE DE MA COURONNE (9 octobre 2026, au soir) :
    celui de la Graine ; et AVANT le lancement seulement, l'ancien code de
    la fiche, pour que Ma Couronne, publiée un autre soir que le geste,
    n'efface la carte de personne. Lancé, un ancien code n'ouvre plus rien. */
export function codeDeLaCarte(fiche: Pick<FicheDesLunes, 'archived' | 'codeParrain' | 'graine'> | null | undefined, lance: boolean): string | null {
  if (!fiche) return null;
  if (fiche.graine) return codeActifDe(fiche);
  if (lance || fiche.archived) return null;
  const ancien = fiche.codeParrain;
  return typeof ancien === 'string' && FORME_DU_CODE.test(ancien) ? ancien : null;
}

/** Un hasard DÉTERMINISTE tiré d'un texte : deux postes du Trône qui posent
    la même Graine en même temps écrivent le MÊME code. (Ex-`graine()` de
    shared/parrainage, renommée pour ne plus se confondre avec le rang.) */
export function hasardDe(texte: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** TOUS LES CODES QUE LA MAISON A DÉJÀ VUS : ceux des fiches (archivées
    comprises), ceux de leurs archives, ceux des Graines, ceux qui ont été
    partagés (`parraineePar`), et ceux des demandes du site. Un code neuf
    n'en reprend jamais un : un ancien code partagé ne doit pas ouvrir la
    carte d'une autre. */
export function codesConnus(fiches: readonly FicheDesLunes[], demandes: readonly DemandeDesLunes[]): Set<string> {
  const connus = new Set<string>();
  const ajoute = (c: unknown) => { if (typeof c === 'string' && c.trim()) connus.add(c.trim().toUpperCase()); };
  for (const f of fiches) {
    if (!f) continue;
    ajoute(f.codeParrain);
    ajoute(f.parraineePar);
    ajoute(f.graine?.code);
    ajoute(f.avantLesDouzeLunes?.codeParrain);
  }
  for (const d of demandes) {
    if (!d) continue;
    ajoute(d.codeParrain);
    ajoute(d.parrainDe);
    ajoute(d.code);
  }
  return connus;
}

const parId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** LES GRAINES À POSER : les fiches vivantes, sans Graine, hors `exclues`,
    qui ont au moins N jours de visite. Rangées par identifiant, chacune un
    code neuf tiré de son prénom, jamais un code de `interdits` ni un code
    déjà pris dans ce même passage. Le même résultat sur tous les postes,
    quel que soit l'ordre de lecture des fiches. */
export function grainesAAttribuer(
  fiches: readonly FicheDesLunes[], rdvs: readonly RdvDesLunes[], seuil: number, aujourdhui: string,
  interdits: ReadonlySet<string> = new Set(), exclues: ReadonlySet<string> = new Set(),
): { clientId: string; graine: Graine }[] {
  const n = Math.max(SEUIL_GRAINE_MIN, Math.round(seuil));
  const jours = joursParFiche(rdvs, aujourdhui);
  const pris = new Set(interdits);
  for (const f of fiches) if (f?.graine?.code) pris.add(f.graine.code);
  const candidates = fiches
    .filter((f) => f && !f.archived && !f.graine && !exclues.has(f.id) && (jours.get(f.id)?.length ?? 0) >= n)
    .sort(parId);
  const sortie: { clientId: string; graine: Graine }[] = [];
  for (const f of candidates) {
    for (let essai = 0; essai < 40; essai++) {
      const code = codeDeMarraine(prenomDuNom(f.name), hasardDe(`lunes:${f.id}:${essai}`));
      if (pris.has(code)) continue;
      pris.add(code);
      sortie.push({ clientId: f.id, graine: { code, le: aujourdhui, atteinteLe: jours.get(f.id)![n - 1], seuil: n } });
      break;
    }
  }
  return sortie;
}

/* ── LE RETRAIT DE L'ANCIEN PROGRAMME ───────────────────────────────────
   Une récompense de l'ancien programme se reconnaît à sa SOURCE (amie,
   écho, rang, défi) ou, pour les plus anciennes qui n'en portent pas (avant
   le 28 septembre), au début de son identifiant. Le Foyer reste. Ce qui
   n'est ni l'un ni l'autre reste aussi, et se montre à la direction. */
export type ClasseDeRecompense = 'retiree' | 'foyer' | 'inconnue';
const SOURCES_RETIREES = new Set(['amie', 'echo', 'rang', 'defi']);
const PREFIXE_RETIRE = /^(parr|echo|rang|defi)-/;

export function classeDeLaRecompense(s: Pick<SoinOffert, 'id' | 'source'> | null | undefined): ClasseDeRecompense {
  if (!s) return 'inconnue';
  if (s.source && SOURCES_RETIREES.has(s.source)) return 'retiree';
  if (s.source === 'foyer') return 'foyer';
  const id = String(s.id ?? '');
  if (PREFIXE_RETIRE.test(id)) return 'retiree';
  if (id.startsWith('foyer-')) return 'foyer';
  return 'inconnue';
}

/** UNE FICHE QUI PORTE ENCORE L'ANCIEN PROGRAMME sans être passée par le
    geste (une poussée perdue par la garde de masse de la synchro, par
    exemple). Le Trône ne lui pose pas de Graine seul : il effacerait son
    ancien code sans l'archiver. La relance du geste s'en charge. */
export function attendLeLancement(f: FicheDesLunes | null | undefined): boolean {
  if (!f || f.avantLesDouzeLunes || f.graine) return false;
  return !!f.codeParrain || !!f.parrainage || (f.soinsOfferts ?? []).some((s) => classeDeLaRecompense(s) === 'retiree');
}

export type LigneDuLancement = {
  clientId: string;
  nom: string;
  archivee: boolean;
  /** L'ancien code, qui s'éteint. */
  codeRetire?: string;
  /** L'ancien résumé de Ma Couronne, rangé dans l'archive. */
  resumeVide: boolean;
  retirees: SoinOffert[];
  gardees: { soin: SoinOffert; classe: Exclude<ClasseDeRecompense, 'retiree'> }[];
  /** La Graine initiale, si la fiche a déjà ses N visites. */
  graine?: Graine;
  visites: number;
};

export type PlanDuLancement = {
  le: string;
  seuil: number;
  /** Une ligne par fiche que le geste touche, rangées par identifiant. */
  lignes: LigneDuLancement[];
  /** Les fiches déjà passées par le geste (archive ou Graine) : rien à faire. */
  dejaLancees: number;
  /** Les récompenses ni anciennes ni du Foyer, sur toute fiche : gardées, montrées. */
  inconnues: { clientId: string; nom: string; soin: SoinOffert }[];
  /** Les marraines du site (demandes « Marraine ») dont le code s'éteint.
      On ne les touche pas : on les compte. */
  marrainesDuSite: { demandeId: string; prenom: string; code: string }[];
  totaux: {
    fiches: number; codes: number; resumes: number; graines: number;
    retirees: number; retireesUtilisees: number; retireesExpirees: number; retireesEnAttente: number;
    parSource: Record<string, number>;
    parPrefixe: Record<string, number>;
    /** « parr- · sans source », « parr- · amie », « echo- · echo »… */
    parPrefixeEtSource: Record<string, number>;
    gardeesFoyer: number; gardeesInconnues: number;
  };
};

const prefixeDe = (id: string): string => `${/^(parr|echo|rang|defi|foyer)-/.exec(String(id ?? ''))?.[1] ?? 'autre'}-`;
const compte = (r: Record<string, number>, cle: string) => { r[cle] = (r[cle] ?? 0) + 1; };

/** LE PLAN DU LANCEMENT, que la direction voit nom par nom avant le geste :
    pour chaque fiche pas encore lancée (archivées comprises), le code qui
    s'éteint, le résumé rangé, les récompenses retirées et gardées, la Graine
    initiale. Rien n'est écrit ici. */
export function planDuLancement(
  fiches: readonly FicheDesLunes[], rdvs: readonly RdvDesLunes[], demandes: readonly DemandeDesLunes[],
  lunes: Partial<ReglageDesLunes> | null | undefined, aujourdhui: string, exclues: ReadonlySet<string> = new Set(),
): PlanDuLancement {
  const seuil = seuilDeLaGraine(lunes);
  const vivantes = fiches.filter((f) => !!f);
  const aLancer = vivantes.filter((f) => !f.avantLesDouzeLunes && !f.graine).sort(parId);
  const graineDe = new Map(grainesAAttribuer(aLancer, rdvs, seuil, aujourdhui, codesConnus(fiches, demandes), exclues).map((g) => [g.clientId, g.graine]));
  const jours = joursParFiche(rdvs, aujourdhui);
  const plan: PlanDuLancement = {
    le: aujourdhui, seuil, lignes: [], dejaLancees: vivantes.length - aLancer.length, inconnues: [], marrainesDuSite: [],
    totaux: {
      fiches: 0, codes: 0, resumes: 0, graines: 0, retirees: 0, retireesUtilisees: 0, retireesExpirees: 0, retireesEnAttente: 0,
      parSource: {}, parPrefixe: {}, parPrefixeEtSource: {}, gardeesFoyer: 0, gardeesInconnues: 0,
    },
  };
  const t = plan.totaux;
  for (const f of aLancer) {
    const soins = f.soinsOfferts ?? [];
    const retirees = soins.filter((s) => classeDeLaRecompense(s) === 'retiree');
    const gardees = soins
      .map((soin) => ({ soin, classe: classeDeLaRecompense(soin) }))
      .filter((g): g is { soin: SoinOffert; classe: 'foyer' | 'inconnue' } => g.classe !== 'retiree');
    for (const g of gardees) if (g.classe === 'inconnue') plan.inconnues.push({ clientId: f.id, nom: f.name ?? '', soin: g.soin });
    const graine = graineDe.get(f.id);
    if (!f.codeParrain && !f.parrainage && retirees.length === 0 && !graine) continue;
    plan.lignes.push({
      clientId: f.id, nom: f.name ?? '', archivee: !!f.archived,
      ...(f.codeParrain ? { codeRetire: f.codeParrain } : {}),
      resumeVide: !!f.parrainage, retirees, gardees,
      ...(graine ? { graine } : {}),
      visites: jours.get(f.id)?.length ?? 0,
    });
    t.fiches += 1;
    if (f.codeParrain) t.codes += 1;
    if (f.parrainage) t.resumes += 1;
    if (graine) t.graines += 1;
    for (const s of retirees) {
      t.retirees += 1;
      if (s.utiliseLe) t.retireesUtilisees += 1;
      else if (s.expireLe && s.expireLe < aujourdhui) t.retireesExpirees += 1;
      else t.retireesEnAttente += 1;
      const source = s.source ?? 'sans source';
      compte(t.parSource, source);
      compte(t.parPrefixe, prefixeDe(s.id));
      compte(t.parPrefixeEtSource, `${prefixeDe(s.id)} · ${source}`);
    }
    for (const g of gardees) {
      if (g.classe === 'foyer') t.gardeesFoyer += 1;
      else t.gardeesInconnues += 1;
    }
  }
  const vus = new Set<string>();
  for (const d of demandes) {
    const code = d?.codeParrain;
    if (!code || !FORME_DU_CODE.test(code) || vus.has(code)) continue;
    vus.add(code);
    plan.marrainesDuSite.push({ demandeId: String(d.id ?? ''), prenom: prenomDuNom(d.prenom), code });
  }
  return plan;
}

/** LE GESTE SUR UNE FICHE. L'archive ne se pose qu'une fois : une fiche
    déjà lancée (archive, ou Graine posée depuis) revient telle quelle, ce
    qui rend la relance sans effet. Sinon : l'ancien code, l'ancien résumé et
    les récompenses de l'ancien programme partent dans l'archive, le Foyer et
    l'inconnu restent, la Graine initiale se pose avec son code.
    `parraineePar` ne bouge pas (décision 5). */
export function ficheLancee<T extends FicheDesLunes>(fiche: T, ligne: Pick<LigneDuLancement, 'clientId' | 'graine'> | null | undefined, le: string): T {
  if (!fiche || fiche.avantLesDouzeLunes || fiche.graine) return fiche;
  if (ligne && ligne.clientId !== fiche.id) return fiche;
  const soins = fiche.soinsOfferts ?? [];
  const retires = soins.filter((s) => classeDeLaRecompense(s) === 'retiree');
  const graine = ligne?.graine && !fiche.archived ? ligne.graine : undefined;
  if (!fiche.codeParrain && !fiche.parrainage && retires.length === 0 && !graine) return fiche;
  const archive: ArchiveDesLunes = {
    le,
    ...(fiche.codeParrain ? { codeParrain: fiche.codeParrain } : {}),
    ...(fiche.parrainage ? { parrainage: fiche.parrainage } : {}),
    soinsRetires: retires,
    ...(retires.length ? { ordreDesSoins: soins.map((s) => s?.id) } : {}),
  };
  const { codeParrain: _code, parrainage: _resume, ...reste } = fiche;
  const sortie = { ...reste, avantLesDouzeLunes: archive } as FicheDesLunes;
  if (retires.length) sortie.soinsOfferts = soins.filter((s) => classeDeLaRecompense(s) !== 'retiree');
  if (graine) {
    sortie.graine = graine;
    sortie.codeParrain = graine.code;
  }
  return sortie as T;
}

/** Les récompenses rendues : les retirées reviennent à leur place, une fois
    chacune ; les mercis posés depuis le lancement restent, à la suite. */
function soinsRendus(actuels: readonly SoinOffert[], a: ArchiveDesLunes): SoinOffert[] {
  const parIdent = new Map<string, SoinOffert>();
  for (const s of a.soinsRetires) if (s) parIdent.set(s.id, s);
  for (const s of actuels) {
    if (!s) continue;
    const archivee = parIdent.get(s.id);
    /* Une récompense consommée à la caisse depuis garde sa trace. */
    if (!archivee || (s.utiliseLe && !archivee.utiliseLe)) parIdent.set(s.id, s);
  }
  const ordre = [...(a.ordreDesSoins ?? []), ...a.soinsRetires.map((s) => s?.id), ...actuels.map((s) => s?.id)];
  const sortie: SoinOffert[] = [];
  const vus = new Set<string>();
  for (const id of ordre) {
    if (!id || vus.has(id)) continue;
    vus.add(id);
    const s = parIdent.get(id);
    if (s) sortie.push(s);
  }
  return sortie;
}

/** LE RETOUR EN ARRIÈRE SUR UNE FICHE : code, résumé et récompenses retirées
    rendus, mercis posés depuis gardés, Graine et archive retirées. Une
    Graine posée après le lancement sur une fiche neuve part avec son code. */
export function ficheRendue<T extends FicheDesLunes>(fiche: T): T {
  if (!fiche) return fiche;
  const a = fiche.avantLesDouzeLunes;
  if (!a && !fiche.graine) return fiche;
  const { graine, avantLesDouzeLunes: _archive, codeParrain, parrainage: _resume, ...reste } = fiche;
  const sortie = { ...reste } as FicheDesLunes;
  if (a) {
    if (a.codeParrain) sortie.codeParrain = a.codeParrain;
    if (a.parrainage) sortie.parrainage = a.parrainage;
    if ((a.soinsRetires ?? []).length) sortie.soinsOfferts = soinsRendus(fiche.soinsOfferts ?? [], a);
  } else if (codeParrain && codeParrain !== graine?.code) {
    sortie.codeParrain = codeParrain;
  }
  return sortie as T;
}

/* ── CE QUE LE RETOUR EN ARRIÈRE PERDRAIT — 9 octobre 2026 ────────────────
   Revenir à avant, puis relancer, ne rend pas ce que la fenêtre a donné :
   un merci posé depuis le lancement repartirait dans l'archive au second
   geste (et l'archive vaut « déjà posé », il ne reviendrait jamais) ; le
   code d'une Graine qui a déjà servi (le lien d'une amie, une réservation
   du site) serait interdit au tirage suivant, et la cliente recevrait un
   AUTRE code, ses amies rattachées au premier devenant orphelines. Le
   retour n'est donc permis que tant que la fenêtre n'a rien donné : sinon
   l'écran dit ce qui serait perdu, nom par nom, et n'écrit rien. */
export type PerteDuRetour = {
  /** Les mercis posés depuis le lancement (hors archive). */
  mercis: { clientId: string; nom: string; soinId: string }[];
  /** Les codes de Graine qui ont déjà servi, et à qui. */
  codes: { clientId: string; nom: string; code: string; par: string[] }[];
};
export function perteDuRetour(fiches: readonly FicheDesLunes[], demandes: readonly DemandeDesLunes[]): PerteDuRetour {
  const perte: PerteDuRetour = { mercis: [], codes: [] };
  const vivantes = fiches.filter((f) => !!f);
  for (const f of [...vivantes].sort(parId)) {
    if (!f.avantLesDouzeLunes && !f.graine) continue;
    const ranges = new Set((f.avantLesDouzeLunes?.soinsRetires ?? []).map((s) => s?.id));
    for (const s of f.soinsOfferts ?? []) {
      if (s && classeDeLaRecompense(s) === 'retiree' && !ranges.has(s.id)) perte.mercis.push({ clientId: f.id, nom: f.name ?? '', soinId: s.id });
    }
    const code = f.graine?.code;
    if (!code) continue;
    const par = [
      ...vivantes.filter((x) => x.id !== f.id && x.parraineePar === code).map((x) => x.name ?? x.id),
      ...demandes.filter((d) => d && (d.parrainDe === code || d.code === code)).map((d) => d.prenom || String(d.id ?? '')),
    ];
    if (par.length) perte.codes.push({ clientId: f.id, nom: f.name ?? '', code, par });
  }
  return perte;
}
export const retourPossible = (p: PerteDuRetour): boolean => p.mercis.length === 0 && p.codes.length === 0;

/* ── L'ANCIEN RÉGLAGE DU DOCUMENT `mnd_parrainage` ─────────────────────────
   Le geste l'éteint (ceinture contre un vieux poste resté sur l'ancien
   moteur) et le garde dans le document même ; le retour le rend. Purs, pour
   que le harnais les éprouve sans magasin. */
export type AncienReglageGarde = {
  le: string;
  bonusRangs?: unknown;
  defi?: unknown;
  classementVisible?: boolean;
  merciParWhatsApp?: boolean;
};
type ReglageDuDocument = {
  bonusRangs?: unknown;
  defi?: unknown;
  classementVisible?: boolean;
  merciParWhatsApp?: boolean;
  avantLesDouzeLunes?: AncienReglageGarde;
};

/** LE GESTE SUR LE RÉGLAGE : l'ancien gardé UNE fois (une reprise ne le
    réécrit pas), bonus de rang vidés, défi arrêté, classement caché, et le
    remerciement WhatsApp ÉTEINT (le programme neuf garde le sien dans
    `mnd_douze_lunes`, voir `merciDuLancement`). */
export function reglageEteint<R extends ReglageDuDocument>(r: R, le: string): R {
  const g: ReglageDuDocument = r ?? {};
  const defi = g.defi && typeof g.defi === 'object' ? { ...(g.defi as Record<string, unknown>), actif: false } : undefined;
  return {
    ...(g as Record<string, unknown>),
    avantLesDouzeLunes: g.avantLesDouzeLunes ?? {
      le,
      ...(g.bonusRangs !== undefined ? { bonusRangs: g.bonusRangs } : {}),
      ...(g.defi !== undefined ? { defi: g.defi } : {}),
      ...(g.classementVisible !== undefined ? { classementVisible: g.classementVisible } : {}),
      ...(g.merciParWhatsApp !== undefined ? { merciParWhatsApp: g.merciParWhatsApp } : {}),
    },
    bonusRangs: {},
    ...(defi ? { defi } : {}),
    classementVisible: false,
    merciParWhatsApp: false,
  } as unknown as R;
}

/** Le remerciement que le programme neuf reprend : celui d'AVANT le geste
    (gardé dans le document), jamais l'ancien éteint par une reprise. */
export const merciDuLancement = (r: ReglageDuDocument | null | undefined): boolean =>
  (r?.avantLesDouzeLunes ? r.avantLesDouzeLunes.merciParWhatsApp : r?.merciParWhatsApp) === true;

/** LE RETOUR SUR LE RÉGLAGE : l'ancien rendu tel quel, le gardé retiré. */
export function reglageRendu<R extends ReglageDuDocument>(r: R): R {
  const a = r?.avantLesDouzeLunes;
  if (!a) return r;
  const rendu: Record<string, unknown> = { ...(r as Record<string, unknown>) };
  for (const k of ['avantLesDouzeLunes', 'bonusRangs', 'defi', 'classementVisible', 'merciParWhatsApp']) delete rendu[k];
  return {
    ...rendu,
    ...(a.bonusRangs !== undefined ? { bonusRangs: a.bonusRangs } : {}),
    ...(a.defi !== undefined ? { defi: a.defi } : {}),
    ...(a.classementVisible !== undefined ? { classementVisible: a.classementVisible } : {}),
    ...(a.merciParWhatsApp !== undefined ? { merciParWhatsApp: a.merciParWhatsApp } : {}),
  } as unknown as R;
}

/** CE QUI N'EST PAS ENCORE APPLIQUÉ : les lignes du plan dont la fiche n'a
    pas reçu le geste (la garde de masse de la synchro peut abandonner une
    poussée en silence). Vide : le lancement est complet. */
export function resteDuLancement(fiches: readonly FicheDesLunes[], plan: Pick<PlanDuLancement, 'lignes'>): LigneDuLancement[] {
  const parIdent = new Map(fiches.filter((f) => !!f).map((f) => [f.id, f]));
  return plan.lignes.filter((l) => {
    const f = parIdent.get(l.clientId);
    if (!f) return false;
    if (!f.avantLesDouzeLunes && !f.graine) return true;
    return !!l.graine && !f.graine && !f.archived;
  });
}
