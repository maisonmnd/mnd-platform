/* ══ L'ATTENTION · 6 novembre 2026 ═══════════════════════════════════════
   « Les gens qui ont des abonnements ont une petite surprise à chaque fois,
   même une toute petite surprise qu'ils veulent découvrir […] parce qu'ils
   nous font confiance, plus que toutes les autres personnes. » (Yéman.)
   Maquette `public/maquette-l-abonnement-refait.html`, « construis les 2
   lots » le 6 novembre 2026 : lot 2 (l'attention) et lot 3 (le Trône).

   CE QUI EST TRANCHÉ (sélecteur, 6 novembre 2026) : un présent à chaque
   séance, avec un mot ; remis au fauteuil, à son arrivée, avec une carte de
   la Collection Maison MND dont le mot s'écrit à la main ; la Maison choisit
   tout, comme dans une boutique (à boire, à goûter, le présent), et tout
   reste une surprise ; trois niveaux : offert, à la carte entre 800 et
   1 500 F (jamais plus), sceau d'or à la dernière séance d'un carnet ; le
   frais vient d'une artisane du quartier, commandée la veille ; les articles
   à la carte se proposent en fin de rendez-vous, trois au plus.

   CE FICHIER NE FAIT QUE DES RÈGLES : il ne lit ni n'écrit rien. Le Trône lui
   donne les séances, la boutique et l'historique ; il propose, il compte, il
   dresse la liste de la veille. La proposition est une règle écrite ici, pas
   un tirage au sort ni un appel à une machine : la même entrée donne
   toujours le même panier, et « Pourquoi » le dit.

   LA SURPRISE SE GARDE AU SERVEUR. Ma Couronne ne lit jamais un panier : elle
   demande `mes_attentions` (migration 0170), qui ne rend d'un panier scellé
   que sa date et son indice. `ceQuElleLit` est le jumeau de cette fonction,
   pour les bancs. */

import type { ReleveDuContrat } from './abonnee-pur';

export type Rayon = 'boire' | 'gout' | 'present';
export type Niveau = 'offert' | 'carte' | 'or';
/** Un nombre : la réserve comptée. « frais » : commandé la veille à
    l'artisane. « jardin » : cueilli sur place, sans commande. */
export type Reserve = number | 'frais' | 'jardin';

export const RAYONS: readonly Rayon[] = ['boire', 'gout', 'present'];
export const RAYON_DIT: Record<Rayon, string> = { boire: 'À boire', gout: 'À goûter', present: 'Le présent' };
export const NIVEAU_DIT: Record<Niveau, string> = { offert: 'Offert', carte: 'À la carte', or: 'Sceau d’or' };

/** « Des mini-coûts qui ne dépassent jamais 1 500 francs. C'est entre 800 et 1 500. » */
export const PRIX_A_LA_CARTE = { min: 800, max: 1500 } as const;
/** « Jusqu'à trois petits articles » proposés quand elle règle. */
export const PROPOSES_EN_FIN_DE_RDV = 3;

export type ArticleDAttention = {
  id: string;
  branchId?: string;
  nom: string;
  rayon: Rayon;
  niveau: Niveau;
  /** À la carte seulement : entre 800 et 1 500 F. */
  prixXof?: number;
  /** Ce qu'il coûte à la Maison : sert « Les comptes ». Facultatif. */
  coutXof?: number;
  reserve: Reserve;
  /** L'indice d'un présent, lu sous le pli scellé (« elle se noue »). */
  indice?: string;
  /** À la carte : proposé à l'encaissement, si la Maison le décide. */
  enFinDeRdv?: boolean;
  /** À la carte : le produit du catalogue qui le porte à l'encaissement (le
      ticket, la caisse et la réserve passent par « La Gamme »). */
  produitId?: string;
  /** Retiré de la boutique ; gardé pour ce qui a déjà été remis. */
  retire?: boolean;
  /** Son rang dans son rayon : le plus petit d'abord. */
  ordre?: number;
};

export type CarteDeCollection = { serie: string; numero: number };

export type PanierDAttention = {
  /** L'identifiant du rendez-vous : un panier par séance, jamais deux. */
  id: string;
  branchId?: string;
  apptId: string;
  clientId: string;
  subId: string;
  date: string;
  time: string;
  rang: number | null;
  total: number | null;
  /** La dernière séance d'un carnet : le sceau d'or. */
  or?: boolean;
  boire?: string;
  gout?: string;
  present?: string;
  carte?: CarteDeCollection;
  /** Le mot de la carte, à recopier à la main. */
  mot: string;
  pourquoi?: string;
  etat: 'propose' | 'valide';
  valideLe?: string;
  validePar?: string;
  arriveeLe?: string;
  arriveePar?: string;
  remiseLe?: string;
  remisePar?: string;
  /** Les NOMS au moment de la remise : ce qu'elle a reçu ne change plus si
      la boutique change ensuite. */
  recu?: { boire?: string; gout?: string; present?: string };
};

export type RegleDuRang = {
  rang: number;
  /** Le présent voulu à cette séance (un article de la boutique). */
  present?: string;
  /** Le mot voulu à cette séance ; `{prenom}` s'y remplace. */
  mot?: string;
};
export type ProgrammeDAttention = {
  /** « programme:<id de la formule> », ou « programme:defaut ». */
  id: string;
  branchId?: string;
  type: 'programme';
  planId: string | null;
  rangs: RegleDuRang[];
};
export type CollectionDeCartes = {
  id: 'collection';
  branchId?: string;
  type: 'collection';
  /** Les séries imprimées, dans l'ordre où elles se donnent. */
  series: { nom: string; nombre: number }[];
};
export type ViseeDesAttentions = {
  id: 'visee';
  branchId?: string;
  type: 'visee';
  /** Le coût visé d'un panier offert. */
  coutParPanierXof?: number;
};
/** CE QUE LA MAISON NE PROPOSE PLUS À UNE TÊTE (« Ne plus lui proposer » : une
    allergie, un goût). Rangé ici, à la Maison seule, jamais sur sa fiche,
    qu'elle peut lire. */
export type EcartsDeLaTete = {
  /** « ecarts:<id de la tête> ». */
  id: string;
  branchId?: string;
  type: 'ecarts';
  clientId: string;
  articles: string[];
};
export type ReglageDAttention = ProgrammeDAttention | CollectionDeCartes | ViseeDesAttentions | EcartsDeLaTete;

/** Ce que la Maison ne propose plus à cette tête. */
export const ecartesDe = (reglages: readonly ReglageDAttention[], clientId: string): string[] =>
  reglages.find((r): r is EcartsDeLaTete => r.type === 'ecarts' && r.clientId === clientId)?.articles ?? [];

/** Une séance de formule à préparer : ce que le relevé du contrat en dit. */
export type SeanceAPreparer = {
  apptId: string;
  clientId: string;
  subId: string;
  planId: string | null;
  formule: string;
  mode: 'pack' | 'cycle';
  date: string;
  time: string;
  rang: number | null;
  total: number | null;
};

/** LES SÉANCES DE FORMULE entre deux jours, lues dans les relevés des
    contrats : celles qui comptent (une annulée ou une absente n'a pas de
    panier, elle revient à la formule). Dans l'ordre du calendrier. */
export function seancesAPreparer(releves: readonly ReleveDuContrat[], du: string, au: string): SeanceAPreparer[] {
  const out: SeanceAPreparer[] = [];
  for (const c of releves) {
    const clientId = c.sub.clientId;
    if (!clientId) continue;
    for (const s of c.attribuees) {
      if (!s.compte || s.date < du || s.date > au) continue;
      out.push({
        apptId: s.id, clientId, subId: c.sub.id, planId: c.sub.planId ?? null, formule: c.nom, mode: c.mode,
        date: s.date, time: s.time, rang: s.rang, total: s.total,
      });
    }
  }
  return out.sort((x, y) => (x.date === y.date ? (x.time < y.time ? -1 : x.time > y.time ? 1 : 0) : (x.date < y.date ? -1 : 1)));
}

/** La semaine d'un jour, du lundi au dimanche (AAAA-MM-JJ). */
export function semaineDe(jour: string): { du: string; au: string } {
  const d = new Date(`${jour}T12:00:00Z`);
  const depuisLundi = (d.getUTCDay() + 6) % 7;
  const iso = (n: number): string => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { du: iso(-depuisLundi), au: iso(6 - depuisLundi) };
}

/** « 9 h 00 ». */
export const heureDuFauteuil = (t: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  return m ? `${Number(m[1])} h ${m[2]}` : t;
};

/** Le prénom à écrire sur une carte : le premier mot du nom, s'il en est un. */
export const prenomDe = (nom: string | undefined): string => {
  const brut = (nom ?? '').trim().split(/\s+/)[0] ?? '';
  return brut && !/[0-9@_.]/.test(brut) ? brut : '';
};

/* ── LA BOUTIQUE ──────────────────────────────────────────────────────── */

/** « 1 500 », à la française. */
const milliers = (n: number): string => n.toLocaleString('fr-FR');
/** « entre 800 et 1 500 F ». */
export const BORNES_DE_LA_CARTE_DITES = `entre ${milliers(PRIX_A_LA_CARTE.min)} et ${milliers(PRIX_A_LA_CARTE.max)} F`;

/** Pourquoi cet article ne peut pas entrer tel quel dans la boutique. */
export function pourquoiPasCetArticle(a: Pick<ArticleDAttention, 'nom' | 'rayon' | 'niveau' | 'prixXof' | 'reserve'>): string | null {
  if (!a.nom.trim()) return 'Donnez un nom à cet article.';
  if (a.niveau === 'or' && a.rayon !== 'present') return 'Le sceau d’or est un présent.';
  if (a.niveau === 'carte') {
    const p = a.prixXof;
    if (p === undefined || !Number.isInteger(p)) return `À la carte, il faut un prix ${BORNES_DE_LA_CARTE_DITES}.`;
    if (p < PRIX_A_LA_CARTE.min || p > PRIX_A_LA_CARTE.max) return `Un article à la carte coûte ${BORNES_DE_LA_CARTE_DITES}, jamais plus.`;
  }
  if (typeof a.reserve === 'number' && (!Number.isInteger(a.reserve) || a.reserve < 0)) return 'La réserve se compte en pièces entières.';
  return null;
}

/** La réserve en mots. */
export const reserveDite = (r: Reserve): string =>
  (r === 'frais' ? 'Frais, commandé la veille' : r === 'jardin' ? 'Cueilli au jardin' : `${r} en réserve`);

const parOrdre = (x: ArticleDAttention, y: ArticleDAttention): number =>
  ((x.ordre ?? 0) - (y.ordre ?? 0)) || x.nom.localeCompare(y.nom, 'fr') || (x.id < y.id ? -1 : 1);

/** Les articles en rayon (ni retirés), dans l'ordre de la boutique. */
export const enRayon = (articles: readonly ArticleDAttention[], rayon?: Rayon): ArticleDAttention[] =>
  articles.filter((a) => !a.retire && (!rayon || a.rayon === rayon)).sort(parOrdre);

const lesTrois = (p: Pick<PanierDAttention, 'boire' | 'gout' | 'present'>): string[] =>
  [p.boire, p.gout, p.present].filter((x): x is string => !!x);

/** COMBIEN DE PIÈCES SONT DÉJÀ PROMISES : les paniers pas encore remis. */
export function engages(paniers: readonly PanierDAttention[], sauf?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of paniers) {
    if (p.remiseLe || p.id === sauf) continue;
    for (const id of lesTrois(p)) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

/** LA RÉSERVE QUI NE COUVRE PLUS : « Foulard de nuit : 2 en réserve pour 3
    séances à venir, à recommander. » */
export function reservesCourtes(articles: readonly ArticleDAttention[], paniers: readonly PanierDAttention[]): { article: ArticleDAttention; reserve: number; promis: number }[] {
  const promis = engages(paniers);
  return enRayon(articles)
    .filter((a) => typeof a.reserve === 'number' && (promis.get(a.id) ?? 0) > a.reserve)
    .map((a) => ({ article: a, reserve: a.reserve as number, promis: promis.get(a.id) ?? 0 }));
}

/** LES ARTICLES PROPOSÉS QUAND ELLE RÈGLE : à la carte, choisis par la Maison,
    en réserve, trois au plus. Proposés à toutes, abonnées ou non. */
export function articlesEnFinDeRdv(articles: readonly ArticleDAttention[]): ArticleDAttention[] {
  return enRayon(articles)
    .filter((a) => a.niveau === 'carte' && a.enFinDeRdv && !pourquoiPasCetArticle(a) && (typeof a.reserve !== 'number' || a.reserve > 0))
    .slice(0, PROPOSES_EN_FIN_DE_RDV);
}

/* ── LE PANIER ────────────────────────────────────────────────────────── */

/** La dernière séance d'un carnet : le sceau d'or. Une formule à la lune n'a
    pas de dernière séance (à fixer avec Yéman : la sixième lune d'affilée). */
export const estLeSceauDOr = (s: Pick<SeanceAPreparer, 'mode' | 'rang' | 'total'>): boolean =>
  s.mode === 'pack' && s.rang !== null && s.total !== null && s.total > 1 && s.rang === s.total;

/** Le programme d'une formule : le sien, sinon celui de toutes. */
export function programmeDe(reglages: readonly ReglageDAttention[], planId: string | null): ProgrammeDAttention | undefined {
  const tous = reglages.filter((r): r is ProgrammeDAttention => r.type === 'programme');
  return tous.find((p) => planId !== null && p.planId === planId) ?? tous.find((p) => p.planId === null);
}

/** LE MOT PROPOSÉ. Celui du programme pour ce rang, sinon l'un des trois mots
    de la Maison : la bienvenue, le merci, le carnet tenu. Aucun accord de
    genre : la civilité ne se suppose pas. Il se relit et se réécrit avant
    d'être validé, puis se recopie à la main. */
export function motPropose(s: Pick<SeanceAPreparer, 'mode' | 'rang' | 'total'>, prenom: string, programme?: ProgrammeDAttention): string {
  const p = prenom.trim();
  const voulu = programme?.rangs.find((r) => r.rang === s.rang)?.mot?.trim();
  if (voulu) return voulu.replace(/\{prenom\}/g, p).replace(/ ,/g, ',').replace(/\s{2,}/g, ' ').trim();
  const a = p ? `, ${p}` : '';
  if (estLeSceauDOr(s)) return `${s.total} séances, un carnet tenu jusqu’au bout. La Maison MND vous remercie${a}.`;
  if (s.rang === 1) return `Bienvenue${a}. Votre couronne a maintenant son rythme, et nous veillons dessus avec vous.`;
  return `Merci de nous confier votre couronne${a}. Elle garde son rythme, et nous y veillons avec vous.`;
}

/** LA CARTE SUIVANTE DE LA COLLECTION : la première qu'elle n'a jamais reçue,
    série après série. `null` : collection non saisie, ou toutes reçues. */
export function carteSuivante(collection: CollectionDeCartes | undefined, recues: readonly CarteDeCollection[]): CarteDeCollection | null {
  for (const s of collection?.series ?? []) {
    for (let n = 1; n <= s.nombre; n += 1) {
      if (!recues.some((c) => c.serie === s.nom && c.numero === n)) return { serie: s.nom, numero: n };
    }
  }
  return null;
}

export type HistoireDeLaTete = {
  /** Les articles déjà remis ou déjà prévus pour cette personne, du plus
      ancien au plus récent. */
  recus: readonly string[];
  cartes: readonly CarteDeCollection[];
  /** Ce que la Maison ne lui propose plus (« Ne plus lui proposer »). */
  ecartes: readonly string[];
};

/** L'histoire d'une tête : ce qu'elle a reçu, ET ce qui lui est déjà prévu à
    une autre séance (deux paniers de la même semaine ne se répètent pas).
    `sauf` : la séance qu'on prépare, qui ne compte pas contre elle-même. */
export function histoireDe(clientId: string, paniers: readonly PanierDAttention[], ecartes: readonly string[] = [], sauf?: string): HistoireDeLaTete {
  const siens = paniers.filter((p) => p.clientId === clientId && p.id !== sauf)
    .sort((x, y) => (x.date === y.date ? (x.time < y.time ? -1 : 1) : (x.date < y.date ? -1 : 1)));
  return { recus: siens.flatMap(lesTrois), cartes: siens.map((p) => p.carte).filter((c): c is CarteDeCollection => !!c), ecartes };
}

export type PanierPropose = Pick<PanierDAttention, 'boire' | 'gout' | 'present' | 'carte' | 'mot' | 'pourquoi' | 'or'>;

/** PERLE PROPOSE LE PANIER, d'après le programme et l'histoire de la tête.
    · Le présent : celui du programme pour ce rang s'il est possible, sinon le
      premier du rayon qu'elle n'a jamais reçu. JAMAIS DEUX FOIS LE MÊME
      PRÉSENT à la même personne : faute de présent neuf, la ligne reste à
      choisir. À la dernière séance d'un carnet, un présent du sceau d'or.
    · À boire, à goûter : ce qu'elle n'a jamais reçu d'abord ; quand elle a
      tout goûté, ce qu'elle a reçu il y a le plus longtemps.
    · Jamais un article retiré, écarté pour elle, ou dont la réserve comptée
      est déjà toute promise. Le frais et le jardin ne s'épuisent pas.
    · La carte : la suivante de la collection, jamais deux fois la même. */
export function proposeLePanier(o: {
  seance: SeanceAPreparer;
  prenom: string;
  articles: readonly ArticleDAttention[];
  reglages: readonly ReglageDAttention[];
  histoire: HistoireDeLaTete;
  /** Tous les paniers posés, pour ne pas promettre deux fois la même pièce. */
  paniers: readonly PanierDAttention[];
}): PanierPropose {
  const { seance, histoire } = o;
  const or = estLeSceauDOr(seance);
  const programme = programmeDe(o.reglages, seance.planId);
  const promis = engages(o.paniers, seance.apptId);
  const possible = (a: ArticleDAttention): boolean =>
    !a.retire && !histoire.ecartes.includes(a.id) && (typeof a.reserve !== 'number' || a.reserve > (promis.get(a.id) ?? 0));
  const dernierRecu = (id: string): number => histoire.recus.lastIndexOf(id);
  const raisons: string[] = [];

  const tourne = (rayon: 'boire' | 'gout'): string | undefined => {
    const c = enRayon(o.articles, rayon).filter((a) => a.niveau === 'offert' && possible(a));
    if (c.length === 0) return undefined;
    const neuf = c.find((a) => dernierRecu(a.id) < 0);
    return (neuf ?? [...c].sort((x, y) => dernierRecu(x.id) - dernierRecu(y.id))[0]).id;
  };

  const presents = enRayon(o.articles, 'present').filter((a) => a.niveau === (or ? 'or' : 'offert') && possible(a) && dernierRecu(a.id) < 0);
  const voulu = programme?.rangs.find((r) => r.rang === seance.rang)?.present;
  const duProgramme = voulu ? presents.find((a) => a.id === voulu) : undefined;
  const present = (duProgramme ?? presents[0])?.id;
  if (or) raisons.push('dernière séance du carnet : le sceau d’or');
  else if (seance.rang !== null && seance.total !== null) raisons.push(`séance ${seance.rang} sur ${seance.total}`);
  if (duProgramme) raisons.push('le présent de son programme');
  else if (present) raisons.push('un présent qu’elle n’a jamais reçu');
  else raisons.push(or ? 'aucun présent du sceau d’or en réserve : à choisir' : 'aucun présent neuf pour elle en réserve : à choisir');

  const carte = carteSuivante(o.reglages.find((r): r is CollectionDeCartes => r.type === 'collection'), histoire.cartes) ?? undefined;
  return {
    boire: tourne('boire'), gout: tourne('gout'), present, ...(carte ? { carte } : {}), ...(or ? { or: true } : {}),
    mot: motPropose(seance, o.prenom, programme),
    pourquoi: `${raisons.join(' ; ').replace(/^./, (c) => c.toUpperCase())}.`,
  };
}

/** Le panier d'une séance, tel qu'il s'écrit quand la Maison le valide ou le change. */
export function panierDeLaSeance(s: SeanceAPreparer, p: PanierPropose, branchId?: string): PanierDAttention {
  return {
    id: s.apptId, ...(branchId ? { branchId } : {}), apptId: s.apptId, clientId: s.clientId, subId: s.subId, date: s.date, time: s.time,
    rang: s.rang, total: s.total, ...(p.or ? { or: true } : {}),
    ...(p.boire ? { boire: p.boire } : {}), ...(p.gout ? { gout: p.gout } : {}), ...(p.present ? { present: p.present } : {}),
    ...(p.carte ? { carte: p.carte } : {}), mot: p.mot, ...(p.pourquoi ? { pourquoi: p.pourquoi } : {}), etat: 'propose',
  };
}

/** Pourquoi ce panier ne peut pas encore se valider. */
export function pourquoiPasValider(p: Pick<PanierDAttention, 'present' | 'mot'>): string | null {
  if (!p.present) return 'Choisissez le présent.';
  if (!p.mot.trim()) return 'Écrivez le mot de la carte.';
  return null;
}

/** OÙ EN EST LE PANIER, le jour de la séance. */
export type TempsDuPanier = 'a-valider' | 'pret' | 'arrivee' | 'remis';
export const tempsDuPanier = (p: Pick<PanierDAttention, 'etat' | 'arriveeLe' | 'remiseLe'> | undefined): TempsDuPanier =>
  (!p || p.etat !== 'valide' ? 'a-valider' : p.remiseLe ? 'remis' : p.arriveeLe ? 'arrivee' : 'pret');

/** « ARRIVÉE » : l'instant où l'équipe l'accueille. Seulement sur un panier validé. */
export function marqueLArrivee(p: PanierDAttention, quand: string, par?: string): PanierDAttention {
  if (p.etat !== 'valide' || p.arriveeLe) return p;
  return { ...p, arriveeLe: quand, ...(par ? { arriveePar: par } : {}) };
}

const nomDe = (articles: readonly ArticleDAttention[], id: string | undefined): string | undefined =>
  (id ? articles.find((a) => a.id === id)?.nom : undefined);

/** « REMISE » : le présent et la carte sont remis. Les noms se figent sur le
    panier, et la réserve comptée baisse d'une pièce par article remis. */
export function remetLePanier(p: PanierDAttention, articles: readonly ArticleDAttention[], quand: string, par?: string): { panier: PanierDAttention; articles: ArticleDAttention[] } {
  if (p.etat !== 'valide' || p.remiseLe) return { panier: p, articles: [...articles] };
  const remis = lesTrois(p);
  const boire = nomDe(articles, p.boire); const gout = nomDe(articles, p.gout); const present = nomDe(articles, p.present);
  return {
    panier: {
      ...p, ...(p.arriveeLe ? {} : { arriveeLe: quand, ...(par ? { arriveePar: par } : {}) }), remiseLe: quand, ...(par ? { remisePar: par } : {}),
      recu: { ...(boire ? { boire } : {}), ...(gout ? { gout } : {}), ...(present ? { present } : {}) },
    },
    articles: articles.map((a) => (typeof a.reserve === 'number' && remis.includes(a.id) ? { ...a, reserve: Math.max(0, a.reserve - 1) } : a)),
  };
}

/* ── LE JOUR, AU TRÔNE ────────────────────────────────────────────────── */

const AVENIR: readonly string[] = ['a-confirmer', 'confirmee', 'proposee', 'a-cloturer'];

/** LA PROCHAINE SÉANCE d'un contrat : la première qui compte et n'a pas eu lieu. */
export function prochaineSeance(c: ReleveDuContrat, jour: string): { apptId: string; date: string; time: string; rang: number | null; total: number | null } | null {
  const s = c.attribuees.find((x) => x.compte && AVENIR.includes(x.etat) && x.date >= jour);
  return s ? { apptId: s.id, date: s.date, time: s.time, rang: s.rang, total: s.total } : null;
}

/** Les séances qu'il reste à prendre : des SÉANCES, pas des prestations (la
    ligne la plus longue d'une formule à plusieurs prestations). `null` : sans limite. */
export function seancesDisponibles(c: ReleveDuContrat): number | null {
  const bornees = c.seances.filter((l) => l.incluses !== null);
  if (bornees.length === 0) return null;
  const longue = bornees.reduce((m, l) => ((l.incluses ?? 0) > (m.incluses ?? 0) ? l : m));
  return longue.disponibles ?? 0;
}

export type FinDeCarnet = { clientId: string; subId: string; formule: string; apptId: string; date: string; time: string };
/** LES FINS DE CARNET : un carnet dont la prochaine séance est la dernière.
    C'est le moment du sceau d'or, et de proposer de reprendre. Un carnet dont
    la dernière séance est réservée se dit « épuisé » (tout est pris) : il en
    fait partie, c'est même le cas ordinaire. */
export function finsDeCarnet(releves: readonly ReleveDuContrat[], jour: string): FinDeCarnet[] {
  const out: FinDeCarnet[] = [];
  for (const c of releves) {
    if (c.mode !== 'pack' || (c.etat !== 'en-cours' && c.etat !== 'epuisee') || !c.sub.clientId) continue;
    const s = prochaineSeance(c, jour);
    if (s && estLeSceauDOr({ mode: 'pack', rang: s.rang, total: s.total })) {
      out.push({ clientId: c.sub.clientId, subId: c.sub.id, formule: c.nom, apptId: s.apptId, date: s.date, time: s.time });
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

export type SansRendezVous = { clientId: string; subId: string; formule: string; disponibles: number | null };
/** SANS RENDEZ-VOUS : une formule en cours, des séances à prendre, aucune de posée. */
export function sansRendezVous(releves: readonly ReleveDuContrat[], jour: string): SansRendezVous[] {
  const out: SansRendezVous[] = [];
  for (const c of releves) {
    if (c.etat !== 'en-cours' || !c.sub.clientId || prochaineSeance(c, jour)) continue;
    const d = seancesDisponibles(c);
    if (d === 0) continue;
    out.push({ clientId: c.sub.clientId, subId: c.sub.id, formule: c.nom, disponibles: d });
  }
  return out;
}

/** CE QUE LE PANIER DEMANDE AU FAUTEUIL, en une phrase, selon son temps. */
export function panierDit(p: PanierDAttention | undefined, articles: readonly ArticleDAttention[], heure: (iso: string) => string): string {
  const nom = (id: string | undefined): string | undefined => (id ? articles.find((a) => a.id === id)?.nom : undefined);
  const temps = tempsDuPanier(p);
  if (!p || temps === 'a-valider') return 'Panier à valider, dans « Les attentions ».';
  const servi = [nom(p.boire), nom(p.gout)].filter((x): x is string => !!x).map(minuscule).join(' et ');
  const present = minuscule(nom(p.present) ?? 'son présent');
  if (temps === 'remis') return `Panier servi et remis${p.remiseLe ? ` à ${heure(p.remiseLe)}` : ''}. L’attention se lit maintenant dans Ma Couronne.`;
  if (temps === 'arrivee') return `Arrivée${p.arriveeLe ? ` à ${heure(p.arriveeLe)}` : ''}.${servi ? ` À servir : ${servi}.` : ''} À remettre : ${present}, et sa carte signée.`;
  return `Panier prêt : ${servi ? `${servi}, ` : ''}${present}, et sa carte à signer.`;
}

/* ── LA VEILLE ────────────────────────────────────────────────────────── */

export type LigneDeLaVeille = { article: ArticleDAttention; nombre: number };
export type ListeDeLaVeille = {
  jour: string;
  seances: number;
  /** Le frais, à commander à l'artisane du quartier. */
  aCommander: LigneDeLaVeille[];
  /** Cueilli au jardin, le matin. */
  aCueillir: LigneDeLaVeille[];
  /** À sortir de la réserve comptée. */
  aSortir: LigneDeLaVeille[];
  /** Les cartes à écrire et à signer. */
  cartes: { apptId: string; clientId: string; time: string; carte?: CarteDeCollection; mot: string }[];
  /** Les séances de formule de ce jour dont le panier n'est pas validé. */
  aValider: number;
};

/** LA LISTE DE LA VEILLE, pour les séances de `jour`, d'après les paniers validés. */
export function listeDeLaVeille(jour: string, seances: readonly SeanceAPreparer[], paniers: readonly PanierDAttention[], articles: readonly ArticleDAttention[]): ListeDeLaVeille {
  const duJour = seances.filter((s) => s.date === jour);
  const valides = duJour.map((s) => paniers.find((p) => p.id === s.apptId)).filter((p): p is PanierDAttention => !!p && p.etat === 'valide' && !p.remiseLe)
    .sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
  const compte = new Map<string, number>();
  for (const p of valides) for (const id of lesTrois(p)) compte.set(id, (compte.get(id) ?? 0) + 1);
  /* Rayon après rayon (à boire, à goûter, le présent), puis l'ordre de la boutique. */
  const lignes = (quoi: (r: Reserve) => boolean): LigneDeLaVeille[] =>
    [...articles].sort((x, y) => (RAYONS.indexOf(x.rayon) - RAYONS.indexOf(y.rayon)) || parOrdre(x, y))
      .filter((a) => compte.has(a.id) && quoi(a.reserve)).map((a) => ({ article: a, nombre: compte.get(a.id) ?? 0 }));
  return {
    jour, seances: duJour.length,
    aCommander: lignes((r) => r === 'frais'), aCueillir: lignes((r) => r === 'jardin'), aSortir: lignes((r) => typeof r === 'number'),
    cartes: valides.map((p) => ({ apptId: p.apptId, clientId: p.clientId, time: p.time, ...(p.carte ? { carte: p.carte } : {}), mot: p.mot })),
    aValider: duJour.length - duJour.filter((s) => paniers.some((p) => p.id === s.apptId && p.etat === 'valide')).length,
  };
}

const minuscule = (t: string): string => t.replace(/^./, (c) => c.toLowerCase());

/** LE MESSAGE À L'ARTISANE : le texte se prépare, la Maison l'envoie elle-même.
    `jourDit` : la date en toutes lettres, avec l'année. `null` : rien à commander. */
export function messageALArtisane(liste: Pick<ListeDeLaVeille, 'aCommander'>, jourDit: string): string | null {
  if (liste.aCommander.length === 0) return null;
  const quoi = liste.aCommander.map((l) => `${l.nombre} × ${minuscule(l.article.nom)}`).join(', ');
  return `Bonjour, la Maison MND vous commande pour ${jourDit} : ${quoi}. Merci de nous confirmer l’heure de livraison.`;
}

/* ── LES COMPTES ──────────────────────────────────────────────────────── */

/** CE QUE LES ATTENTIONS ONT COÛTÉ sur une période : les paniers remis, au
    coût saisi des articles. `sansCout` : les pièces remises dont le coût n'est
    pas saisi (le total est alors un plancher, et l'écran le dit). */
export function coutDesAttentions(paniers: readonly PanierDAttention[], articles: readonly ArticleDAttention[], du: string, au: string): { paniers: number; coutXof: number; sansCout: number } {
  const remis = paniers.filter((p) => p.remiseLe && p.date >= du && p.date <= au);
  let coutXof = 0; let sansCout = 0;
  for (const p of remis) {
    for (const id of lesTrois(p)) {
      const c = articles.find((a) => a.id === id)?.coutXof;
      if (c === undefined) sansCout += 1; else coutXof += c;
    }
  }
  return { paniers: remis.length, coutXof, sansCout };
}

/* ── CE QUE L'ABONNÉE LIT ─────────────────────────────────────────────── */

type TeteDeLAttention = { apptId: string; clientId: string; date: string; rang: number | null; total: number | null; or: boolean };
export type AttentionLue =
  | (TeteDeLAttention & { etat: 'recue'; mot: string; recu: { boire?: string; gout?: string; present?: string } })
  | (TeteDeLAttention & { etat: 'scellee'; arrivee: boolean; indice?: string })
  | (TeteDeLAttention & { etat: 'a-venir' });

/** LE JUMEAU DE `mes_attentions` (migration 0170). D'un panier validé :
    · remis : le présent, ce qui a été servi, le mot de la carte ;
    · le prochain à venir : scellé, sa date et son indice, rien d'autre ;
    · les suivants : « à venir », sans indice.
    Jamais un panier non validé, ni celui d'une séance annulée, ni celui d'une
    séance passée sans remise. */
export function ceQuElleLit(o: {
  clientId: string; jour: string;
  paniers: readonly PanierDAttention[];
  articles: readonly ArticleDAttention[];
  /** Les rendez-vous annulés : leur panier ne se montre pas. */
  annules: readonly string[];
}): AttentionLue[] {
  const siens = o.paniers
    .filter((p) => p.clientId === o.clientId && p.etat === 'valide' && !o.annules.includes(p.apptId) && (p.remiseLe || p.date >= o.jour))
    .sort((x, y) => (x.date === y.date ? (x.time < y.time ? -1 : 1) : (x.date < y.date ? -1 : 1)));
  let scelleVu = false;
  return siens.map((p): AttentionLue => {
    const tete = { apptId: p.apptId, clientId: p.clientId, date: p.date, rang: p.rang, total: p.total, or: !!p.or };
    if (p.remiseLe) return { ...tete, etat: 'recue', mot: p.mot, recu: p.recu ?? {} };
    if (scelleVu) return { ...tete, etat: 'a-venir' };
    scelleVu = true;
    const indice = o.articles.find((a) => a.id === p.present)?.indice?.trim();
    return { ...tete, etat: 'scellee', arrivee: !!p.arriveeLe, ...(indice ? { indice } : {}) };
  });
}

/* ── LES ARTICLES DICTÉS ──────────────────────────────────────────────── */

/** CE QUE YÉMAN A DICTÉ LE 6 NOVEMBRE 2026, et rien d'autre : la boutique part
    vide, et un toucher y pose cette liste, qu'elle simplifie ensuite (« quand
    on va finir tout ça, on va simplifier la liste »). Aucun prix, aucun coût,
    aucune réserve n'est supposé : les pièces sont à compter (réserve 0), le
    frais se commande la veille. Les bières attendent leur niveau : elles sont
    posées « à la carte », sans prix, donc jamais proposées avant qu'elle le
    fixe. Les noms doux sont ceux de la maquette validée ; ils se changent. */
export const ARTICLES_DICTES: readonly Omit<ArticleDAttention, 'id' | 'branchId'>[] = [
  { nom: 'La Citronnelle du jardin', rayon: 'boire', niveau: 'offert', reserve: 'jardin' },
  { nom: 'L’Orange en fleur', rayon: 'boire', niveau: 'offert', reserve: 'frais' },
  { nom: 'Les Perles de tapioca', rayon: 'boire', niveau: 'offert', reserve: 'frais' },
  { nom: 'La Béninoise bien glacée', rayon: 'boire', niveau: 'carte', reserve: 0 },
  { nom: 'La Beaufort bien glacée', rayon: 'boire', niveau: 'carte', reserve: 0 },
  { nom: 'La Guinness bien glacée', rayon: 'boire', niveau: 'carte', reserve: 0 },
  { nom: 'La pastille à la menthe', rayon: 'gout', niveau: 'offert', reserve: 0 },
  { nom: 'Le petit pâté', rayon: 'gout', niveau: 'offert', reserve: 'frais' },
  { nom: 'Les Dorées', rayon: 'gout', niveau: 'offert', reserve: 0 },
  { nom: 'Les Petites Olives', rayon: 'gout', niveau: 'offert', reserve: 0 },
  { nom: 'Les Mini Kraks', rayon: 'gout', niveau: 'offert', reserve: 0 },
  { nom: 'Le stylo', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'Le chouchou', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'L’élastique', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'Le porte-clé', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'La trousse MND', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'La serviette carrée MND', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'L’huile de coco', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'Le beurre de mangue', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'L’huile d’avocat', rayon: 'present', niveau: 'offert', reserve: 0 },
  { nom: 'Le T-shirt « Le sceau au cœur »', rayon: 'present', niveau: 'or', reserve: 0 },
];
