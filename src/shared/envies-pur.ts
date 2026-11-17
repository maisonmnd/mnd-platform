import { estUneConsultation, masquePourLeSite, type MasquesDuSite, type PriceMode } from './catalogue-pur';
import { exigeConsultation } from './qualification';
import { reservableSurLeSite } from './place-du-serveur';

/* ══ VOS ENVIES — 17 novembre 2026 (la consultation en affiches) ══════════
   « Permets-moi de créer mes envies et de les associer en votre rituel ou la
   Maison regarde », puis « c'est plutôt 3 groupes : rituel, visio et/ou
   consultation privée » (Yéman). La direction écrit ses envies au Trône
   (Système › Besoins et règles › Vos envies) ; le site les lit, et la
   consultation en affiches suit sans redéploiement.

   TROIS GROUPES. Rituel : son rituel du catalogue, réservé tout de suite.
   Visio : gratuite. Consultation privée : payante, déduite. Visio et
   Consultation privée vont ensemble ou seules ; Rituel est seul.

   LA RÈGLE QUI TIENT TOUT : une envie ne mène à un rituel que si CE rituel se
   réserve en ligne aujourd'hui, par la règle même du serveur
   (`reservableSurLeSite`, place-du-serveur). Sans rituel choisi, ou avec un
   rituel que le serveur refuserait, l'envie se comporte comme une Visio : la
   Maison regarde d'abord. Le site ne propose jamais une affiche que la
   réservation refuserait ensuite.

   UNE ENVIE EN CONSULTATION PRIVÉE SEULE L'EMPORTE sur la visio quand
   plusieurs envies sont choisies : un seul rendez-vous, pas de visio pour
   rien. Sans visio ouverte (éteinte, ou plus un quart d'heure libre), la
   consultation privée prend sa place : il reste toujours une porte.

   RESTRICTIONS : deux envies qui ne se choisissent pas ensemble (la première
   touchée grise l'autre) ; une réponse du début qui écarte une envie (elle ne
   s'affiche pas).

   MODULE PUR : ni magasin, ni écran, ni réseau. Le document `mnd_envies`
   (shared/envies.ts) est ce que la direction corrige ; ce module porte la
   semence, les gestes du Trône et l'aiguillage du site. Le banc
   `verifie-les-envies` l'éprouve dans les deux sens. */

export type Groupe = 'rituel' | 'visio' | 'privee';
export type RendezVous = 'visio' | 'privee';

export const GROUPES: readonly { id: Groupe; nom: string }[] = [
  { id: 'rituel', nom: 'Rituel' }, { id: 'visio', nom: 'Visio' }, { id: 'privee', nom: 'Consultation privée' },
];
const RENDEZ_VOUS: readonly RendezVous[] = ['visio', 'privee'];

/** « Cliquer autant de cases que l'on veut ou au maximum 5 » (Yéman). */
export const ENVIES_MAX = 5;
/** Un nom d'affiche : un ou deux mots. */
export const NOM_MAX = 24;
/** Six gestes au plus dans une même venue : le plafond de `demande-submit`
    (`PLAFOND_GESTES`, revelateur/agenda.ts). Les deux bougent ensemble. */
export const GESTES_MAX = 6;

/* ── LES RÉPONSES DU DÉBUT ────────────────────────────────────────────── */

export type ReponseDuDebut = 'maison' | 'ailleurs' | 'aucune' | 'defaire';
export type ReponseAEnvies = 'maison' | 'ailleurs';
export type Parcours = 'envies' | 'modele' | 'defaire';

export const REPONSES_DU_DEBUT: readonly { id: ReponseDuDebut; dit: string }[] = [
  { id: 'maison', dit: 'Des locks faites à la Maison MND' },
  { id: 'ailleurs', dit: 'Des locks faites ailleurs' },
  { id: 'aucune', dit: 'Pas encore de locks' },
  { id: 'defaire', dit: 'Des locks à défaire' },
];
/** Les deux réponses qui mènent aux envies : les seules qu'une restriction nomme. */
export const REPONSES_A_ENVIES: readonly ReponseAEnvies[] = ['maison', 'ailleurs'];

/** Trois parcours : les envies, le modèle (pas encore de locks), des locks à défaire. */
export const parcoursDe = (r: ReponseDuDebut): Parcours => (r === 'aucune' ? 'modele' : r === 'defaire' ? 'defaire' : 'envies');
export const reponseDite = (r: ReponseDuDebut): string => REPONSES_DU_DEBUT.find((x) => x.id === r)?.dit ?? '';

/* ── LE DOCUMENT ──────────────────────────────────────────────────────── */

export type Envie = {
  id: string;
  nom: string;
  /** Rituel seul, ou Visio et/ou Consultation privée. */
  groupes: Groupe[];
  /** Son ou ses rituels du catalogue (identifiants), lus quand le groupe est Rituel. */
  rituels: string[];
};

export type ReglagesDesEnvies = {
  version: 1;
  envies: Envie[];
  /** Deux envies qui ne se choisissent pas ensemble. */
  paires: [string, string][];
  /** Une réponse du début qui écarte une envie : elle ne s'affiche pas. */
  ecarts: { reponse: ReponseAEnvies; envie: string }[];
  /** Sans locks encore : le rendez-vous du modèle, et le tarif des cheveux naturels. */
  modele: { rdv: RendezVous[]; naturels: { prixXof: number; lot: number } };
  /** Des locks à défaire : le rituel de « Cheveux libres », et le rendez-vous de « Nouvelles locks ». */
  defaire: { rituel: string; rdv: RendezVous[] };
  modifieLe?: string;
  modifiePar?: string;
};

/* ── LA SEMENCE ─────────────────────────────────────────────────────────
   Les onze familles de `mnd_besoins`, sous leurs noms d'affiche ; leurs
   identifiants ne changent pas : les besoins de chaque famille restent ceux
   de l'envie. Groupes de départ, ceux de la maquette validée : Créer en
   Consultation privée, Réparer en Visio et Consultation privée, Volume et
   Structure en Visio, les sept autres en Rituel.

   LE RITUEL DE CHAQUE ENVIE EN RITUEL est la prestation que `mnd_besoins`
   désigne déjà comme directe (catalogue lu le 17 novembre 2026) :
     · Finition : La Retouche · contours et racines, citée par quatre besoins
       sur dix, sans seuil ;
     · Entretien : SÍNSIN™ Essentiel · La Reprise, la première du besoin qui
       fonde la famille, sans seuil ;
     · Hydratation : DÀNDÀN™, citée par ses trois besoins, sans seuil ;
     · Lavage : KLƆKLƆ™ Signature · L'Ancrage, le lavage le plus cité que la
       garde « peau » n'écarte pas (le WÈWÈ™, plus cité, est un détox écarté) ;
     · Couleur : YÈKPÈ™ Couleur · La Révélation Végétale, la plus citée ; son
       palier ne demande aucun point ;
     · Grands jours, Enfants : rien d'évident, laissées vides. Une envie en
       Rituel sans rituel se comporte comme une Visio, et le Trône la dit
       « rituel à choisir ».
   Une seule restriction : Créer et Réparer. */
export const ENVIES_DE_DEPART = (): ReglagesDesEnvies => ({
  version: 1,
  envies: [
    { id: 'creer', nom: 'Créer', groupes: ['privee'], rituels: [] },
    { id: 'reparer', nom: 'Réparer', groupes: ['visio', 'privee'], rituels: [] },
    { id: 'volume', nom: 'Volume', groupes: ['visio'], rituels: [] },
    { id: 'structure', nom: 'Structure', groupes: ['visio'], rituels: [] },
    { id: 'finition', nom: 'Finition', groupes: ['rituel'], rituels: ['sv-retouches-post-reprise'] },
    { id: 'entretien', nom: 'Entretien', groupes: ['rituel'], rituels: ['sv-atl-ii-e'] },
    { id: 'hydratation', nom: 'Hydratation', groupes: ['rituel'], rituels: ['sv-plt-10-m'] },
    { id: 'lavage', nom: 'Lavage', groupes: ['rituel'], rituels: ['sv-plt-05-sig-c'] },
    { id: 'couleur', nom: 'Couleur', groupes: ['rituel'], rituels: ['sv-atl-iii-cou-c'] },
    { id: 'grands-jours', nom: 'Grands jours', groupes: ['rituel'], rituels: [] },
    { id: 'enfants', nom: 'Enfants', groupes: ['rituel'], rituels: [] },
  ],
  paires: [['creer', 'reparer']],
  ecarts: [],
  /* « 25 000 F pour 75 locks » (Yéman). Le rendez-vous : les deux, au départ. */
  modele: { rdv: ['visio', 'privee'], naturels: { prixXof: 25000, lot: 75 } },
  /* GBÀTÀ™ Essentiel · Le Défaisage : le rituel de « Cheveux libres ». */
  defaire: { rituel: 'sv-plt-45-std', rdv: ['visio', 'privee'] },
});

/* ── LE DOCUMENT RENDU SÛR ──────────────────────────────────────────────── */

const plie = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const propre = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
const entier = (x: unknown, defaut: number): number => {
  const n = Math.round(Number(x));
  return Number.isFinite(n) && n > 0 ? n : defaut;
};

/** Rituel est seul ; Visio et Consultation privée vont ensemble ou seules ;
    une envie mène toujours quelque part (sans groupe lisible : Rituel, où une
    envie neuve naît). */
export function groupesSurs(x: unknown): Groupe[] {
  const lus = Array.isArray(x) ? GROUPES.map((g) => g.id).filter((g) => x.includes(g)) : [];
  if (lus.includes('rituel') || lus.length === 0) return ['rituel'];
  return lus;
}

/** Visio et/ou Consultation privée ; jamais aucune (illisible : les deux). */
export function rendezVousSurs(x: unknown): RendezVous[] {
  const lus = Array.isArray(x) ? RENDEZ_VOUS.filter((g) => x.includes(g)) : [];
  return lus.length ? lus : [...RENDEZ_VOUS];
}

const memePaire = (p: readonly [string, string], a: string, b: string): boolean => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/** Les liens qui ne mènent plus nulle part tombent : une restriction sur une envie retirée, un doublon. */
function range(r: ReglagesDesEnvies): ReglagesDesEnvies {
  const ids = new Set(r.envies.map((e) => e.id));
  const paires: [string, string][] = [];
  for (const [a, b] of r.paires) {
    if (a === b || !ids.has(a) || !ids.has(b) || paires.some((p) => memePaire(p, a, b))) continue;
    paires.push([a, b]);
  }
  const ecarts: ReglagesDesEnvies['ecarts'] = [];
  for (const e of r.ecarts) {
    if (!ids.has(e.envie) || ecarts.some((x) => x.reponse === e.reponse && x.envie === e.envie)) continue;
    ecarts.push({ reponse: e.reponse, envie: e.envie });
  }
  return { ...r, paires, ecarts };
}

/** Un document lu au serveur, rendu sûr : ce qui manque reprend la semence,
    rien de ce qui est là n'est jeté, rien d'étrange ne passe. */
export function enviesSures(v: unknown): ReglagesDesEnvies {
  const base = ENVIES_DE_DEPART();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return base;
  const o = v as Record<string, unknown>;
  const objet = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});

  let envies = base.envies;
  if (Array.isArray(o.envies)) {
    envies = [];
    for (const brut of o.envies) {
      const e = objet(brut);
      const id = typeof e.id === 'string' ? e.id.trim() : '';
      if (!id || envies.some((x) => x.id === id)) continue;
      const rituels = Array.isArray(e.rituels) ? [...new Set(e.rituels.filter((s): s is string => typeof s === 'string' && s !== ''))].slice(0, GESTES_MAX) : [];
      envies.push({ id, nom: propre(e.nom), groupes: groupesSurs(e.groupes), rituels });
    }
  }
  const paires: [string, string][] = Array.isArray(o.paires)
    ? o.paires.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string').map((p) => [p[0], p[1]])
    : base.paires;
  const ecarts: ReglagesDesEnvies['ecarts'] = Array.isArray(o.ecarts)
    ? o.ecarts.map(objet).filter((e) => (e.reponse === 'maison' || e.reponse === 'ailleurs') && typeof e.envie === 'string')
      .map((e) => ({ reponse: e.reponse as ReponseAEnvies, envie: e.envie as string }))
    : base.ecarts;
  const modele = objet(o.modele);
  const naturels = objet(modele.naturels);
  const defaire = objet(o.defaire);
  return range({
    version: 1,
    envies,
    paires,
    ecarts,
    modele: {
      rdv: rendezVousSurs(modele.rdv),
      naturels: { prixXof: entier(naturels.prixXof, base.modele.naturels.prixXof), lot: entier(naturels.lot, base.modele.naturels.lot) },
    },
    defaire: {
      rituel: typeof defaire.rituel === 'string' ? defaire.rituel.trim() : base.defaire.rituel,
      rdv: rendezVousSurs(defaire.rdv),
    },
    ...(typeof o.modifieLe === 'string' ? { modifieLe: o.modifieLe } : {}),
    ...(typeof o.modifiePar === 'string' ? { modifiePar: o.modifiePar } : {}),
  });
}

/* ── LES GESTES DU TRÔNE ──────────────────────────────────────────────── */

/** Pourquoi ce nom ne se prend pas : vide, ou déjà celui d'une autre envie
    (aux accents et à la casse près). `null` : il se prend. */
export function nomRefuse(r: ReglagesDesEnvies, nom: string, saufId?: string): 'vide' | 'pris' | null {
  const n = propre(nom);
  if (!n) return 'vide';
  return r.envies.some((e) => e.id !== saufId && plie(e.nom) === plie(n)) ? 'pris' : null;
}

/** Une envie neuve naît en Rituel, sans rituel : « rituel à choisir ». Un nom
    refusé, ou un identifiant déjà pris, ne change rien. */
export function ajouteUneEnvie(r: ReglagesDesEnvies, nom: string, id: string): ReglagesDesEnvies {
  if (nomRefuse(r, nom) || !id || r.envies.some((e) => e.id === id)) return r;
  return { ...r, envies: [...r.envies, { id, nom: propre(nom), groupes: ['rituel'], rituels: [] }] };
}

export function renommeUneEnvie(r: ReglagesDesEnvies, id: string, nom: string): ReglagesDesEnvies {
  if (nomRefuse(r, nom, id)) return r;
  return { ...r, envies: r.envies.map((e) => (e.id === id ? { ...e, nom: propre(nom) } : e)) };
}

/** Retirer une envie retire ses restrictions avec elle. */
export const retireUneEnvie = (r: ReglagesDesEnvies, id: string): ReglagesDesEnvies =>
  range({ ...r, envies: r.envies.filter((e) => e.id !== id) });

/** Toucher un groupe : Rituel prend l'envie pour lui seul ; Visio et
    Consultation privée s'ajoutent ou se retirent, jamais les deux à la fois. */
export function basculeUnGroupe(r: ReglagesDesEnvies, id: string, g: Groupe): ReglagesDesEnvies {
  const e = r.envies.find((x) => x.id === id);
  if (!e) return r;
  let groupes: Groupe[];
  if (g === 'rituel') groupes = ['rituel'];
  else {
    const reste = e.groupes.filter((x): x is RendezVous => x !== 'rituel');
    groupes = reste.includes(g) ? reste.filter((x) => x !== g) : RENDEZ_VOUS.filter((x) => x === g || reste.includes(x));
  }
  /* Une envie mène toujours quelque part : le dernier groupe ne se retire pas. */
  if (!groupes.length || groupes.join() === e.groupes.join()) return r;
  return { ...r, envies: r.envies.map((x) => (x.id === id ? { ...x, groupes } : x)) };
}

export function poseLesRituels(r: ReglagesDesEnvies, id: string, rituels: readonly string[]): ReglagesDesEnvies {
  const propres = [...new Set(rituels.filter((s) => typeof s === 'string' && s !== ''))].slice(0, GESTES_MAX);
  return { ...r, envies: r.envies.map((e) => (e.id === id ? { ...e, rituels: propres } : e)) };
}

/** Deux envies qui ne se choisissent pas ensemble. Une paire déjà posée, ou
    d'une envie avec elle-même, ne change rien. */
export function ajouteUnePaire(r: ReglagesDesEnvies, a: string, b: string): ReglagesDesEnvies {
  const connue = (id: string) => r.envies.some((e) => e.id === id);
  if (a === b || !connue(a) || !connue(b) || r.paires.some((p) => memePaire(p, a, b))) return r;
  return { ...r, paires: [...r.paires, [a, b]] };
}
export const retireUnePaire = (r: ReglagesDesEnvies, a: string, b: string): ReglagesDesEnvies => ({ ...r, paires: r.paires.filter((p) => !memePaire(p, a, b)) });
/** Une réponse du début qui écarte une envie. */
export function ajouteUnEcart(r: ReglagesDesEnvies, reponse: ReponseAEnvies, envie: string): ReglagesDesEnvies {
  if (!r.envies.some((e) => e.id === envie) || r.ecarts.some((x) => x.reponse === reponse && x.envie === envie)) return r;
  return { ...r, ecarts: [...r.ecarts, { reponse, envie }] };
}
export const retireUnEcart = (r: ReglagesDesEnvies, reponse: ReponseAEnvies, envie: string): ReglagesDesEnvies =>
  ({ ...r, ecarts: r.ecarts.filter((e) => !(e.reponse === reponse && e.envie === envie)) });

/** Le rendez-vous d'un parcours à part : Visio et/ou Consultation privée,
    jamais aucun (le dernier ne se retire pas : la liste revient telle quelle). */
export function basculeUnRendezVous(rdv: RendezVous[], g: RendezVous): RendezVous[] {
  const neuf = rdv.includes(g) ? rdv.filter((x) => x !== g) : RENDEZ_VOUS.filter((x) => x === g || rdv.includes(x));
  return neuf.length ? neuf : rdv;
}

/** Les trois compteurs de l'écran : combien d'envies dans chaque groupe. */
export const compteurs = (r: ReglagesDesEnvies): Record<Groupe, number> => ({
  rituel: r.envies.filter((e) => e.groupes.includes('rituel')).length,
  visio: r.envies.filter((e) => e.groupes.includes('visio')).length,
  privee: r.envies.filter((e) => e.groupes.includes('privee')).length,
});

/* ── CE QUI SE RÉSERVE EN LIGNE ───────────────────────────────────────── */

export type PrestationJugee = {
  id: string; categoryId: string; name?: string; priceMode?: PriceMode; hidePrice?: boolean;
  consultationAvant?: boolean; enabled?: boolean; archived?: boolean; fenetreApresVenue?: unknown;
};
export type EtatEnLigne = 'ok' | 'inconnue' | 'eteinte' | 'masquee' | 'consultation' | 'hors-atelier' | 'fenetre';

/** Une prestation se réserve-t-elle en ligne aujourd'hui, et sinon pourquoi ?
    La règle est celle du serveur (`lesGestesSeReservent`, place-du-serveur),
    dite pour la direction : le site ne propose que ce que le serveur pose. */
export function etatEnLigne(
  s: PrestationJugee | undefined,
  cats: { id: string; parentId?: string }[],
  masques: MasquesDuSite | undefined,
): EtatEnLigne {
  if (!s) return 'inconnue';
  if (s.archived || s.enabled === false) return 'eteinte';
  if (masquePourLeSite(s, masques, cats)) return 'masquee';
  if (!estUneConsultation(s, cats) && exigeConsultation(s, cats)) return 'consultation';
  if (!reservableSurLeSite(s, cats, masques)) return 'hors-atelier';
  /* Un geste à fenêtre demande la dernière venue : le site ne sait pas la situer. */
  if (s.fenetreApresVenue) return 'fenetre';
  return 'ok';
}

/** Ce que le Trône dit d'une prestation qui ne se réserve pas en ligne. */
export const RAISON_HORS_LIGNE: Readonly<Record<Exclude<EtatEnLigne, 'ok'>, string>> = {
  inconnue: 'n’existe plus au catalogue',
  eteinte: 'est archivée ou éteinte au catalogue',
  masquee: 'est décochée pour le site',
  consultation: 'demande une consultation avant',
  'hors-atelier': 'n’est pas d’un atelier qui se réserve en ligne',
  fenetre: 'ne se réserve que dans sa fenêtre après la dernière venue',
};

/* ── CE QUE LE SITE MONTRE ────────────────────────────────────────────── */

/** Les envies à montrer après cette réponse : nommées, et non écartées. */
export function enviesAffichees(r: ReglagesDesEnvies, reponse: ReponseDuDebut | null): Envie[] {
  return r.envies.filter((e) => e.nom.trim() !== '' && !r.ecarts.some((x) => x.reponse === reponse && x.envie === e.id));
}

/** L'envie déjà choisie qui interdit celle-ci ; `null` : rien ne l'interdit. */
export function interditePar(r: ReglagesDesEnvies, choisies: readonly string[], id: string): string | null {
  for (const [a, b] of r.paires) {
    if (a === id && choisies.includes(b)) return b;
    if (b === id && choisies.includes(a)) return a;
  }
  return null;
}

/** Cette envie peut-elle encore se toucher ? Déjà choisie : oui (pour la
    retirer). Sinon : moins de cinq choisies, et aucune ne l'interdit. */
export const seTouche = (r: ReglagesDesEnvies, choisies: readonly string[], id: string): boolean =>
  choisies.includes(id) || (choisies.length < ENVIES_MAX && interditePar(r, choisies, id) === null);

/** Toucher une envie : la choisir ou la retirer. Cinq au plus ; rien ne chasse rien. */
export function basculeUneEnvie(r: ReglagesDesEnvies, choisies: readonly string[], id: string): string[] {
  if (choisies.includes(id)) return choisies.filter((x) => x !== id);
  /* Une envie sans nom ne s'affiche pas : elle ne se choisit pas non plus. */
  if (!r.envies.some((e) => e.id === id && e.nom.trim() !== '') || !seTouche(r, choisies, id)) return [...choisies];
  return [...choisies, id];
}

/** Les réglages ont changé, ou la première réponse : ce qui ne se choisit
    plus sort (envie retirée, écartée, ou interdite par une envie choisie
    avant elle ; la première choisie reste). */
export function rangeLesChoisies(r: ReglagesDesEnvies, choisies: readonly string[], reponse: ReponseDuDebut | null): string[] {
  const montrees = new Set(enviesAffichees(r, reponse).map((e) => e.id));
  const gardees: string[] = [];
  for (const id of choisies) {
    if (!montrees.has(id) || gardees.includes(id) || gardees.length >= ENVIES_MAX || interditePar(r, gardees, id) !== null) continue;
    gardees.push(id);
  }
  return gardees;
}

/* ── L'AIGUILLAGE : QUELLES AFFICHES POUR QUELLES RÉPONSES ────────────── */

export type Contexte = {
  /** Cette prestation se réserve-t-elle en ligne aujourd'hui ? (`etatEnLigne` sur le catalogue lu) */
  seReserve: (serviceId: string) => boolean;
  /** La visio est-elle ouverte : allumée, branchée, et au moins un quart d'heure libre ? */
  visioOuverte: boolean;
  /** La garde « peau » est levée : ce qu'elle écarte ne se réserve pas sans regard. */
  ecartees?: readonly string[];
};

export type Affiches = {
  /** « Votre rituel », réservé tout de suite : ses prestations, et les envies qui y mènent. */
  rituel: { prestations: string[]; envies: string[] } | null;
  /** Ce que la Maison regarde d'abord : les envies, et le ou les rendez-vous proposés. */
  regard: { envies: string[]; visio: boolean; privee: boolean } | null;
};

/** Ce qu'une envie vaut aujourd'hui : son rituel, s'il se réserve en ligne tout entier ; sinon son rendez-vous. */
export function porteeDe(e: Envie, c: Contexte): { rituel: string[] } | { rdv: RendezVous[] } {
  if (e.groupes.includes('rituel')) {
    const tient = e.rituels.length > 0 && e.rituels.every((s) => c.seReserve(s) && !(c.ecartees ?? []).includes(s));
    /* Sans rituel, ou avec un rituel que le serveur refuserait : comme une Visio. */
    return tient ? { rituel: [...e.rituels] } : { rdv: ['visio'] };
  }
  const rdv = e.groupes.filter((g): g is RendezVous => g !== 'rituel');
  return { rdv: rdv.length ? rdv : ['visio'] };
}

/** Le ou les rendez-vous à proposer pour ce que la Maison doit voir. */
export function rendezVousDe(vus: readonly (readonly RendezVous[])[], visioOuverte: boolean): { visio: boolean; privee: boolean } {
  /* Une envie rangée en consultation privée seule l'emporte : un seul rendez-vous. */
  const priveeSeule = vus.some((g) => g.includes('privee') && !g.includes('visio'));
  const visio = !priveeSeule && vus.some((g) => g.includes('visio'));
  const privee = priveeSeule || !visio || vus.some((g) => g.includes('privee'));
  /* Sans visio ouverte, la consultation privée prend sa place. */
  return visio && !visioOuverte ? { visio: false, privee: true } : { visio, privee };
}

/** LES ENVIES. Le rituel d'abord (les prestations des envies en Rituel, six
    gestes au plus, dans l'ordre où elle les a choisies), puis ce que la
    Maison regarde. Sans envie choisie : la Maison regarde, par les deux portes. */
export function affichesDesEnvies(r: ReglagesDesEnvies, choisies: readonly string[], c: Contexte): Affiches {
  /* Une envie se reconnaît à son identifiant, jamais à son nom ; retirée
     depuis, ou restée sans nom, elle ne compte plus. */
  const envies = choisies.map((id) => r.envies.find((e) => e.id === id)).filter((e): e is Envie => !!e && e.nom.trim() !== '');
  if (!envies.length) return { rituel: null, regard: { envies: [], ...rendezVousDe([RENDEZ_VOUS], c.visioOuverte) } };
  const prestations: string[] = [];
  const auRituel: string[] = [];
  const aVoir: string[] = [];
  const vus: RendezVous[][] = [];
  for (const e of envies) {
    const p = porteeDe(e, c);
    if ('rituel' in p) {
      const neufs = p.rituel.filter((s) => !prestations.includes(s));
      if (prestations.length + neufs.length <= GESTES_MAX) {
        prestations.push(...neufs);
        auRituel.push(e.id);
        continue;
      }
      /* Le septième geste ne rentre pas dans la venue : cette envie attend la Maison. */
      aVoir.push(e.id);
      vus.push(['visio']);
      continue;
    }
    aVoir.push(e.id);
    vus.push(p.rdv);
  }
  return {
    rituel: prestations.length ? { prestations, envies: auRituel } : null,
    regard: aVoir.length ? { envies: aVoir, ...rendezVousDe(vus, c.visioOuverte) } : null,
  };
}

/** SANS LOCKS ENCORE : le rendez-vous du modèle, réglé au Trône. Jamais de rituel. */
export const affichesDuModele = (r: ReglagesDesEnvies, c: Contexte): Affiches =>
  ({ rituel: null, regard: { envies: [], ...rendezVousDe([r.modele.rdv], c.visioOuverte) } });

export type Ensuite = 'libres' | 'nouvelles' | 'inconnu';

/** DES LOCKS À DÉFAIRE. « Cheveux libres » : son rituel, réservé tout de
    suite, sans visio ni consultation privée, s'il se réserve en ligne.
    « Nouvelles locks », « Je ne sais pas », ou un rituel que le serveur
    refuserait : le rendez-vous réglé au Trône. */
export function affichesADefaire(r: ReglagesDesEnvies, ensuite: Ensuite | null, c: Contexte): Affiches {
  if (ensuite === 'libres' && r.defaire.rituel && c.seReserve(r.defaire.rituel)) {
    return { rituel: { prestations: [r.defaire.rituel], envies: [] }, regard: null };
  }
  return { rituel: null, regard: { envies: [], ...rendezVousDe([r.defaire.rdv], c.visioOuverte) } };
}

/* ── LE PRIX AU BARÈME ────────────────────────────────────────────────── */

/** Arrondi commercial au 500 F, comme au Trône : jamais zéro pour un prix qui existe. */
const arrondi = (x: number): number => {
  const a = Math.round(x / 500) * 500;
  return a === 0 && x > 0 ? Math.round(x) : a;
};

/** LE PRIX DU RITUEL DE « CHEVEUX LIBRES » : « donne le prix du rituel de
    Gbata selon le nombre de locks » (Yéman). Son prix du catalogue multiplié
    par le coefficient du barème de la Maison pour l'épaisseur dite ; quand
    elle tient plusieurs calibres, ou qu'elle n'est pas dite, le plus petit
    coefficient : le prix se dit « à partir de ». Barème suspendu : le prix
    du catalogue. Sans prix au catalogue : 0, et rien ne s'affiche. */
export function prixAuBareme(prixXof: number, coefs: readonly number[], suspendu = false): number {
  if (!(prixXof > 0)) return 0;
  const valides = coefs.filter((c) => Number.isFinite(c) && c > 0);
  return arrondi(prixXof * (suspendu || !valides.length ? 1 : Math.min(...valides)));
}

/** UN PRIX NE SE COUPE JAMAIS SUR DEUX LIGNES (« 64 » au-dessus de « 000 »,
    ou son « F » seul à la ligne) : ses espaces deviennent insécables. Le
    montant vient toujours de `fmtMoney` ; le site et le Trône le disent ainsi. */
export const insecable = (montantDit: string): string => String(montantDit ?? '').trim().replace(/ /g, '\u00a0');

/** « 25 000 F les 75 locks » : le tarif des cheveux naturels, le montant déjà dit dans la devise. */
export const tarifDesNaturels = (montantDit: string, lot: number): string => `${montantDit} les ${lot} locks`;
