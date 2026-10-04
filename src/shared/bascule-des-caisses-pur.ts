/* ══ LA BASCULE D'OCTOBRE — 4 octobre 2026 ════════════════════════════
   « J'ai trop de caisses, comment repartir de neuf et avoir des caisses bien
   distinctes ? Toutes mes transactions avant octobre je les mettrais dans une
   caisse principale et recommencer une nouvelle vie » (Yéman). Maquette « Le
   parcours de l'argent », manuel des caisses, six réponses au sélecteur.

   CE MODULE NE TOUCHE À RIEN : il décide. `routes/finances/bascule.ts` applique.

   DEUX TEMPS, PAS UN — même jour, deuxième message : « Je ne veux pas que les
   caisses rangées disparaissent, parce que je mets toujours de l'ordre dans
   les anciens points. Le but est de finaliser tout mon travail jusqu'au 1er
   octobre, qui me prendra encore un peu de temps. Mais en attendant, bien
   continuer la suite à partir du 1er octobre. »

   ① OUVRIR OCTOBRE (maintenant) : les caisses d'avant deviennent ANCIENNES,
     visibles partout, avec tout leur passé ; les pièces neuves naissent à 0 ;
     seules les écritures datées du 1er octobre ou après changent de caisse.
   ② RANGER L'AVANT (plus tard, quand elle le dira) : tout ce qui précède le
     1er octobre part dans « Caisse principale · jusqu'au 30 sept. 2026 ».

   LA RÈGLE, POUR CHAQUE CASE QUI NOMME UNE CAISSE :
     · datée d'octobre ou après → la suite de sa caisse, ou la pièce choisie
       pour elle, ou rien ne change (gardée) ;
     · datée d'avant → ne bouge pas au temps ①, va à l'archive au temps ②.
   Chaque case changée garde son ancien nom à côté d'elle (`cashboxAvant`,
   `deAvant`, `versAvant`) : c'est la note qui dit d'où vient la ligne, et
   c'est aussi le chemin du retour en arrière.

   UNE CAISSE N'EST LIÉE QUE PAR SON NOM, dans quatorze sortes d'écritures
   (inventaire du 4 octobre). Les cartes cadeaux n'y sont pas : la base gèle
   leur caisse une fois payées (0112), et leur argent vit dans le mouvement
   d'avoir `cre-<carte>`, qui, lui, bascule. */
import type { Cashbox, RoleDeCaisse } from './finance';

export const ARCHIVE = 'Caisse principale · jusqu’au 30 sept. 2026';
export const JOUR_DE_DEPART = '2026-10-01';
export const MOIS_DE_DEPART = '2026-10';
/** Des noms qui ne sont pas des tiroirs : on n'y touche jamais. */
const INTOUCHABLES = new Set(['Pourboires']);
/** Écrit tel quel par le serveur des paiements en ligne : ne se renomme pas. */
export const NOM_KKIAPAY = 'KkiaPay';

/** Ce que devient une caisse d'avant :
    · `ancienne` : elle reste, avec son passé ; ses écritures d'octobre vont
      à la pièce choisie (`octobreVers`) ;
    · `suite` : elle reste ancienne, et sa suite naît sous ce nom, dans la même
      devise (le même compte MoMo, le même compte en banque, d'octobre on) ;
    · `garder` : elle entre telle quelle dans une pièce (KkiaPay). */
export type Destin =
  | { sort: 'ancienne' }
  | { sort: 'suite'; nom: string; role: RoleDeCaisse; horsBilan?: boolean }
  | { sort: 'garder'; role: RoleDeCaisse; horsBilan?: boolean };

export type Etape = 'ouvrir' | 'ranger';

/** Une caisse neuve de la bascule. */
export type Neuve = { nom: string; role: RoleDeCaisse; glyph: string; sub: string; equipe?: boolean; horsBilan?: boolean };

export const NEUVES: readonly Neuve[] = [
  { nom: 'Terrasse · Tiroir espèces', role: 'terrasse', glyph: '◈', sub: 'Espèces du comptoir', equipe: true },
  { nom: 'Terrasse · MoMoPay société', role: 'terrasse', glyph: '◉', sub: 'MTN MoMoPay', equipe: true },
  { nom: 'La Banque', role: 'banque', glyph: '▥', sub: 'Compte de la société' },
  { nom: 'Caisse du mois', role: 'mois', glyph: '◫', sub: 'Dépenses courantes' },
  { nom: 'Le Grenier', role: 'grenier', glyph: '△', sub: 'Épargne de précaution' },
  { nom: 'La Cour', role: 'cour', glyph: '▤', sub: 'Investissements' },
  { nom: 'Caisse du foyer', role: 'foyer', glyph: '⌂', sub: 'Hors activité', horsBilan: true },
  { nom: ARCHIVE, role: 'archive', glyph: '▣', sub: 'Tout ce qui précède le 1er octobre 2026' },
];

/** Les pièces vers lesquelles une écriture d'octobre peut aller. */
export const PIECES_D_OCTOBRE: readonly string[] = NEUVES.filter((n) => n.role !== 'archive').map((n) => n.nom);

/** Ce que la bascule propose pour une caisse existante (les réponses du 4 octobre). */
export function destinPropose(c: Pick<Cashbox, 'name' | 'currency' | 'role'>, devise: string): Destin {
  const n = c.name.trim();
  if (n === ARCHIVE || NEUVES.some((x) => x.nom === n)) return { sort: 'garder', role: c.role ?? NEUVES.find((x) => x.nom === n)?.role ?? 'archive' };
  if (n === NOM_KKIAPAY) return { sort: 'garder', role: 'terrasse' };
  if (/momo\s*brice/i.test(n)) return { sort: 'suite', nom: 'Terrasse · MoMo MTN', role: 'terrasse' };
  if (/wells/i.test(n)) return { sort: 'suite', nom: 'Foyer · Wells Fargo', role: 'foyer', horsBilan: true };
  if (/scotia/i.test(n)) return { sort: 'suite', nom: 'Foyer · Scotiabank', role: 'foyer', horsBilan: true };
  const cur = (c.currency || devise).toUpperCase();
  if (cur === 'EUR') return { sort: 'suite', nom: 'Terrasse · Devises EUR', role: 'terrasse' };
  return { sort: 'ancienne' };
}

/** Le plan proposé pour toutes les caisses vivantes d'une branche (temps ①).
    Deux caisses n'ont jamais la même suite : la seconde reste simplement
    ancienne, et l'écran laisse la changer. Une relance revoit les anciennes :
    leurs suites existent déjà, rien ne se crée deux fois. */
export function planPropose(caisses: readonly Cashbox[], branchId: string, devise: string): Plan {
  const destins: Record<string, Destin> = {};
  const pris = new Set<string>();
  for (const c of caisses) {
    if (c.branchId !== branchId || c.archiveeLe) continue;
    let d = destinPropose(c, devise);
    if (d.sort === 'suite') {
      if (pris.has(d.nom)) d = { sort: 'ancienne' };
      else pris.add(d.nom);
    }
    destins[c.name] = d;
  }
  return { etape: 'ouvrir', destins, octobreVers: {} };
}

/** « 03/10/2026 », « 2026-10-03T08:00:00Z », « 2026-10-03 » → « 2026-10-03 ». */
export function jourDe(d: unknown): string | undefined {
  if (typeof d !== 'string' || !d) return undefined;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return undefined;
}

export type Plan = {
  etape: Etape;
  destins: Record<string, Destin>;
  /** Pour chaque caisse ancienne : où vont ses écritures d'octobre. */
  octobreVers: Record<string, string>;
};

/** LA RÈGLE. Le nom qu'une case doit porter, ou `undefined` si elle ne bouge pas. */
export function nouveauNom(plan: Plan, nom: unknown, date: unknown): string | undefined {
  if (typeof nom !== 'string' || !nom || INTOUCHABLES.has(nom)) return undefined;
  const jour = jourDe(date);
  if (!jour) return undefined;
  /* L'AVANT NE BOUGE QU'AU TEMPS ② : tant qu'elle met de l'ordre dans les
     anciens points, chaque écriture d'avant reste dans sa caisse. */
  if (jour < JOUR_DE_DEPART) return plan.etape === 'ranger' && nom !== ARCHIVE ? ARCHIVE : undefined;
  const d = plan.destins[nom];
  if (!d) return undefined;
  if (d.sort === 'suite') return d.nom === nom ? undefined : d.nom;
  if (d.sort === 'ancienne') return plan.octobreVers[nom];
  return undefined;
}

/** Une case manquante : écriture d'octobre sur une caisse ancienne sans pièce choisie. */
export function manque(plan: Plan, nom: unknown, date: unknown): boolean {
  if (typeof nom !== 'string' || !nom) return false;
  const jour = jourDe(date);
  return !!jour && jour >= JOUR_DE_DEPART && plan.destins[nom]?.sort === 'ancienne' && !plan.octobreVers[nom];
}

type Rec = Record<string, unknown>;

/** Réécrit UNE case et garde son ancien nom à côté (une fois : un second
    passage ne l'efface pas). Rend le même objet quand rien ne change. */
function basculeLaCase<T extends Rec>(r: T, champ: string, date: unknown, plan: Plan): T {
  const neuf = nouveauNom(plan, r[champ], date);
  if (neuf === undefined) return r;
  const avant = `${champ}Avant`;
  return { ...r, [champ]: neuf, [avant]: r[avant] ?? r[champ] };
}

/** Le retour : la case reprend son ancien nom, la note s'efface. */
function rendsLaCase<T extends Rec>(r: T, champ: string): T {
  const avant = `${champ}Avant`;
  if (typeof r[avant] !== 'string') return r;
  const { [avant]: ancien, ...reste } = r;
  return { ...reste, [champ]: ancien } as T;
}

/** Les quatorze sortes d'écritures : où est la caisse, et quelle date compte. */
export type Sorte = 'factures' | 'depenses' | 'coffre' | 'transferts' | 'avoirs' | 'horsActivite' | 'emprunts'
  | 'rendezVous' | 'remboursements' | 'clotures' | 'engagements' | 'prets' | 'avances';

const SIMPLES: Record<Exclude<Sorte, 'factures' | 'transferts' | 'rendezVous'>, string> = {
  depenses: 'date', coffre: 'date', avoirs: 'date', horsActivite: 'date', emprunts: 'date',
  remboursements: 'date', clotures: 'date', engagements: 'verseLe', prets: 'date', avances: 'date',
};

/** Bascule une écriture. Rend la même référence si rien ne change. */
export function basculeLEcriture<T>(sorte: Sorte, ecriture: T, plan: Plan): T {
  const r = ecriture as unknown as Rec;
  if (sorte === 'transferts') {
    const a = basculeLaCase(r, 'de', r.date, plan);
    return basculeLaCase(a, 'vers', r.date, plan) as unknown as T;
  }
  if (sorte === 'factures' || sorte === 'rendezVous') {
    const payments = Array.isArray(r.payments) ? (r.payments as Rec[]) : undefined;
    let changees = false;
    const neufs = payments?.map((p) => {
      const q = basculeLaCase(p, 'cashbox', p.date, plan);
      if (q !== p) changees = true;
      return q;
    });
    let out: Rec = changees ? { ...r, payments: neufs } : r;
    if (sorte === 'factures') {
      /* Le miroir de la pièce suit le premier versement ; une pièce d'avant le
         journal n'a que lui, daté du jour de la pièce. */
      const date = payments && payments.length ? payments[0].date : r.date;
      out = basculeLaCase(out, 'cashbox', date, plan);
    }
    return out as unknown as T;
  }
  return basculeLaCase(r, 'cashbox', r[SIMPLES[sorte]], plan) as unknown as T;
}

/** Le retour d'une écriture à son état d'avant la bascule. */
export function rendsLEcriture<T>(sorte: Sorte, ecriture: T): T {
  const r = ecriture as unknown as Rec;
  if (sorte === 'transferts') return rendsLaCase(rendsLaCase(r, 'de'), 'vers') as unknown as T;
  if (sorte === 'factures' || sorte === 'rendezVous') {
    const payments = Array.isArray(r.payments) ? (r.payments as Rec[]) : undefined;
    let changees = false;
    const neufs = payments?.map((p) => { const q = rendsLaCase(p, 'cashbox'); if (q !== p) changees = true; return q; });
    const out: Rec = changees ? { ...r, payments: neufs } : r;
    return (sorte === 'factures' ? rendsLaCase(out, 'cashbox') : out) as unknown as T;
  }
  return rendsLaCase(r, 'cashbox') as unknown as T;
}

/** Les cases d'une écriture : leur nom et leur date (pour compter et lister). */
export function casesDe(sorte: Sorte, ecriture: unknown): { nom: unknown; date: unknown }[] {
  const r = ecriture as Rec;
  if (sorte === 'transferts') return [{ nom: r.de, date: r.date }, { nom: r.vers, date: r.date }];
  if (sorte === 'factures' || sorte === 'rendezVous') {
    const payments = Array.isArray(r.payments) ? (r.payments as Rec[]) : [];
    const cases = payments.map((p) => ({ nom: p.cashbox, date: p.date }));
    if (sorte === 'factures' && payments.length === 0) cases.push({ nom: r.cashbox, date: r.date });
    return cases;
  }
  return [{ nom: r.cashbox, date: r[SIMPLES[sorte]] }];
}

/** Le bilan d'avance : combien de cases partent à l'archive, combien sont
    renommées ou déplacées, et ce qui manque encore pour lancer. */
export function compteLaBascule(plan: Plan, lots: Partial<Record<Sorte, readonly unknown[]>>): {
  versLArchive: number; deplacees: number; manquantes: Record<string, number>;
} {
  let versLArchive = 0;
  let deplacees = 0;
  const manquantes: Record<string, number> = {};
  for (const [sorte, liste] of Object.entries(lots) as [Sorte, readonly unknown[]][]) {
    for (const e of liste ?? []) {
      for (const c of casesDe(sorte, e)) {
        if (manque(plan, c.nom, c.date)) { manquantes[c.nom as string] = (manquantes[c.nom as string] ?? 0) + 1; continue; }
        const n = nouveauNom(plan, c.nom, c.date);
        if (n === ARCHIVE) versLArchive++;
        else if (n) deplacees++;
      }
    }
  }
  return { versLArchive, deplacees, manquantes };
}

/** Les caisses après le temps ① : les anciennes restent (marquées, solde
    d'ouverture intact), leurs suites naissent dans la même devise, les pièces
    neuves naissent à 0, KkiaPay entre à la Terrasse. Rien ne se crée deux
    fois. Au temps ②, seule l'archive naît. */
export function caissesApres(caisses: readonly Cashbox[], branchId: string, plan: Plan, le: string, nouvelId: (nom: string, role: RoleDeCaisse) => string): Cashbox[] {
  const presents = () => new Set(out.filter((c) => c.branchId === branchId && !c.archiveeLe).map((c) => c.name));
  const out: Cashbox[] = [];
  if (plan.etape === 'ranger') {
    out.push(...caisses);
    if (!presents().has(ARCHIVE)) {
      out.push({ id: nouvelId(ARCHIVE, 'archive'), branchId, name: ARCHIVE, sub: 'Tout ce qui précède le 1er octobre 2026', glyph: '▣', openingXof: 0, role: 'archive', creeeParLaBascule: true });
    }
    return out;
  }
  const suites: Cashbox[] = [];
  for (const c of caisses) {
    const d = c.branchId === branchId && !c.archiveeLe ? plan.destins[c.name] : undefined;
    if (!d) { out.push(c); continue; }
    const avantLaBascule = c.avantLaBascule ?? { name: c.name, openingXof: c.openingXof, ...(c.horsBilan ? { horsBilan: true } : {}) };
    if (d.sort === 'garder') {
      out.push({ ...c, role: d.role, avantLaBascule, ...(d.horsBilan ? { horsBilan: true } : {}) });
      continue;
    }
    out.push({ ...c, jusquAu: c.jusquAu ?? '2026-09-30', avantLaBascule });
    if (d.sort === 'suite') {
      suites.push({
        id: nouvelId(d.nom, d.role), branchId, name: d.nom, sub: `Suite de ${c.name}`, glyph: c.glyph, openingXof: 0,
        role: d.role, creeeParLaBascule: true,
        ...(c.currency ? { currency: c.currency } : {}), ...(d.horsBilan ? { horsBilan: true } : {}),
      });
    }
  }
  for (const s of suites) if (!presents().has(s.name)) out.push(s);
  for (const n of NEUVES) {
    if (n.role === 'archive' || presents().has(n.nom)) continue;
    out.push({
      id: nouvelId(n.nom, n.role), branchId, name: n.nom, sub: n.sub, glyph: n.glyph, openingXof: 0, role: n.role,
      creeeParLaBascule: true, ...(n.equipe ? { equipe: true } : {}), ...(n.horsBilan ? { horsBilan: true } : {}),
    });
  }
  return out;
}

/** Le retour des caisses : les anciennes redeviennent ce qu'elles étaient,
    les neuves que plus rien ne nomme s'en vont. */
export function caissesRendues(caisses: readonly Cashbox[], branchId: string, nomsEncoreUtilises: ReadonlySet<string>): Cashbox[] {
  return caisses
    .filter((c) => !(c.branchId === branchId && c.creeeParLaBascule && !nomsEncoreUtilises.has(c.name)))
    .map((c) => {
      if (c.branchId !== branchId || !c.avantLaBascule) return c;
      const { archiveeLe: _a, avantLaBascule: av, role: _r, horsBilan: _h, jusquAu: _j, ...reste } = c;
      return { ...reste, name: av.name, openingXof: av.openingXof, ...(av.horsBilan ? { horsBilan: true } : {}) } as Cashbox;
    });
}
