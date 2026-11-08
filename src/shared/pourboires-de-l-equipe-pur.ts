/* ══ LES POURBOIRES DE L'ÉQUIPE — 5 novembre 2026 ═══════════════════════════
   « Je veux voir le tableau clair des pourboires des employés. Ils ont besoin
   de savoir combien ils gagnent au fur et à mesure, donc je veux voir
   l'évolution. C'est quelque part dans l'encaissement, et ce n'est pas facile
   à voir », puis « construire sur chaque écran du personnel concerné son
   pourboire » (Yéman, 4 novembre 2026). Maquette 2e4ZNFxyREv6mxG4vakuh5
   validée ; ses choix :
     · le tableau de l'équipe dans Équipe › Les pourboires, à la direction
       seule, avec un lien depuis la Caisse et depuis Encaissements ;
     · une notification sur le téléphone de chacun à chaque pourboire, sa
       part seule (« +1 000 F de pourboire · Ranti »), jamais le montant de
       la pièce ;
     · la cliente dite à l'équipe par son PRÉNOM, le nom entier reste à la
       direction ;
     · l'évolution mois par mois pour la direction, aujourd'hui, semaine et
       mois pour chacun.

   CE QUI SE COMPTE, C'EST CE QUI A ÉTÉ INSCRIT : une ligne de `tips` par
   part (shared/tips.ts, `addTipPartage`). Aucun partage n'est recalculé ici :
   la part écrite le jour de l'encaissement fait foi, même si les parts de
   l'équipe ont changé depuis.

   Pur : aucune lecture de magasin. Le banc verifie-les-pourboires-de-l-equipe
   le rejoue, et tient la copie SQL de la notification (0157) au mot près. */

export type PartDePourboire = {
  id: string;
  staffId: string;
  amountXof: number;
  /** Le jour du pourboire, AAAA-MM-JJ (celui de la pièce ou du règlement). */
  date: string;
  /** Le nom de la cliente, tel que la pièce le portait. */
  note?: string;
  invoiceId?: string;
  /** L'instant où la part s'est inscrite (5 novembre 2026) ; absent avant. */
  inscritLe?: string;
};

export type MembreDuPartage = { id: string; name: string; partPourboire?: number; archiveeLe?: string };
export type PieceDuFil = { id: string; number?: string };

import { periodeDesPourboires, periodeDite } from './periode-des-pourboires-pur';
export { periodeDesPourboires, periodeAvant, periodeTitre, periodeDite, pourboiresDuDit, payesLeDit, periodeCourte } from './periode-des-pourboires-pur';

/* ── Les jours et les mois ────────────────────────────────────────────── */

export const jourDe = (d: string | undefined): string => String(d ?? '').slice(0, 10);
/** La PÉRIODE d'un pourboire (8 nov. 2026) : du 6 au 4, payée le 5. Clé AAAA-MM du mois où elle commence ;
    le juge est shared/periode-des-pourboires-pur. Ce nom reste pour les appels d'avant. */
export const moisDe = (d: string | undefined): string => periodeDesPourboires(d);

/** Le jour décalé de n jours (midi UTC : aucun fuseau ne fait sauter le jour). */
export function ajouteJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Le lundi de la semaine de ce jour : la semaine de la Maison commence le lundi. */
export function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return ajouteJours(jour, -((d.getUTCDay() + 6) % 7));
}

/** Le mois qui précède de n mois (AAAA-MM). */
export function moisAvant(mois: string, n = 1): string {
  const [a, m] = mois.split('-').map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Les mois en clair, la même liste que la notification (0157) recopie. */
export const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;

/** « novembre 2026 » : l'année toujours (règle de la Maison). */
export const moisDit = (mois: string): string => {
  const m = Number(mois.slice(5, 7));
  return m >= 1 && m <= 12 ? `${MOIS_DITS[m - 1]} ${mois.slice(0, 4)}` : mois;
};
/** « Novembre 2026 », en tête de colonne. */
export const moisTitre = (mois: string): string => {
  const d = moisDit(mois);
  return d.charAt(0).toUpperCase() + d.slice(1);
};
/** « nov. », sous une barre quand les mois sont nombreux. */
export const moisCourt = (mois: string): string => {
  const m = Number(mois.slice(5, 7));
  return m >= 1 && m <= 12 ? MOIS_COURTS[m - 1] : mois;
};
/** « 4 nov. 2026 ». */
export const jourDit = (jour: string): string => {
  const m = Number(jour.slice(5, 7));
  const j = Number(jour.slice(8, 10));
  return m >= 1 && m <= 12 && j >= 1 ? `${j} ${MOIS_COURTS[m - 1]} ${jour.slice(0, 4)}` : jour;
};

/* ── Les montants et les parts ────────────────────────────────────────── */

/** « 1 000 F », comme fmtMoney en XOF (espace fine insécable de fr-FR). */
export const francsDits = (n: number): string => `${Math.round(n).toLocaleString('fr-FR')} F`;

/** Un montant de part lisible : entier, positif, sinon rien. */
const montantDe = (p: Pick<PartDePourboire, 'amountXof'>): number => {
  const n = Math.round(Number(p.amountXof));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const partDe = (m: Pick<MembreDuPartage, 'partPourboire'>): number => {
  const p = Number(m.partPourboire ?? 1);
  return Number.isFinite(p) && p > 0 ? p : 0;
};

/** La part écrite comme dans la maquette : « 1 », « ½ », « 0 », « 1,5 ». */
export const partDite = (part: number | undefined): string => {
  const p = Number(part ?? 1);
  if (!Number.isFinite(p) || p <= 0) return '0';
  if (p === 0.5) return '½';
  return String(Math.round(p * 100) / 100).replace('.', ',');
};

/** « Ta part : une part. » Le mot juste, jamais « 0.5 part ». */
export const taPartDite = (part: number | undefined): string => {
  const p = Number(part ?? 1);
  if (!Number.isFinite(p) || p <= 0) return 'aucune part';
  if (p === 1) return 'une part';
  if (p === 0.5) return 'une demi-part';
  return `${String(Math.round(p * 100) / 100).replace('.', ',')} parts`;
};

/* ── Le prénom de la cliente ──────────────────────────────────────────── */

/* La même liste de civilités que foyer-pur.ts (`prenomDe`), et que la
   notification (0157) recopie : le banc compare les trois textes. */
const CIVILITES = /^(m\.?|mr\.?|mme\.?|mlle\.?|madame|mademoiselle|monsieur|dr\.?)$/i;
/** Ce qu'un prénom ne contient jamais : un chiffre, une adresse, un numéro. */
const PAS_UN_PRENOM = /[0-9@+/_:;]/;

/** LE PRÉNOM SEUL, dit à l'équipe (choix du 4 novembre 2026) : le premier mot
    du nom, civilité sautée ; rien si ce mot n'est pas un prénom (un numéro,
    une adresse, de la ponctuation, plus de trente lettres). */
export function prenomDeLaCliente(nom: string | null | undefined): string {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  while (mots.length > 1 && CIVILITES.test(mots[0])) mots.shift();
  const p = mots[0] ?? '';
  if (!p || p.length > 30 || PAS_UN_PRENOM.test(p) || /^[\p{P}\p{S}]+$/u.test(p)) return '';
  return p;
}

/** Le prénom d'un membre de l'équipe, pour le partage dit en une ligne. */
export const prenomDuMembre = (nom: string | undefined): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/* ── Les totaux d'une personne ────────────────────────────────────────── */

export type Totaux = { aujourdhui: number; semaine: number; mois: number; moisPrecedent: number; depuisLeDebut: number; nb: number };

/** Aujourd'hui, la semaine (du lundi à aujourd'hui), le mois en cours, le
    mois précédent, et depuis la première part inscrite. */
export function totauxDe(parts: readonly PartDePourboire[], aujourdhui: string): Totaux {
  const lundi = lundiDe(aujourdhui);
  const mois = moisDe(aujourdhui);
  const avant = moisAvant(mois);
  const t: Totaux = { aujourdhui: 0, semaine: 0, mois: 0, moisPrecedent: 0, depuisLeDebut: 0, nb: 0 };
  for (const p of parts) {
    const n = montantDe(p);
    if (!n) continue;
    const j = jourDe(p.date);
    t.depuisLeDebut += n;
    t.nb += 1;
    if (j === aujourdhui) t.aujourdhui += n;
    if (j >= lundi && j <= aujourdhui) t.semaine += n;
    if (moisDe(j) === mois) t.mois += n;
    if (moisDe(j) === avant) t.moisPrecedent += n;
  }
  return t;
}

const plusRecentDAbord = (a: PartDePourboire, b: PartDePourboire): number =>
  jourDe(b.date).localeCompare(jourDe(a.date)) || String(b.inscritLe ?? '').localeCompare(String(a.inscritLe ?? '')) || b.id.localeCompare(a.id);

export type LigneAMoi = { id: string; jour: string; jourDit: string; prenom: string; amountXof: number };

/** CE QUE CHACUN VOIT DE SES POURBOIRES : ses totaux et la liste du mois, la
    cliente par son prénom. Jamais le montant de la pièce : sa part. */
export function mesPourboires(parts: readonly PartDePourboire[], staffId: string, aujourdhui: string): {
  totaux: Totaux; mois: string; moisPrecedent: string; duMois: LigneAMoi[];
} {
  const miennes = parts.filter((p) => p.staffId === staffId && montantDe(p) > 0);
  const mois = moisDe(aujourdhui);
  return {
    totaux: totauxDe(miennes, aujourdhui),
    mois,
    moisPrecedent: moisAvant(mois),
    duMois: miennes.filter((p) => moisDe(p.date) === mois).sort(plusRecentDAbord)
      .map((p) => ({ id: p.id, jour: jourDe(p.date), jourDit: jourDit(jourDe(p.date)), prenom: prenomDeLaCliente(p.note), amountXof: montantDe(p) })),
  };
}

/* ── « À l'instant » ──────────────────────────────────────────────────── */

/** Combien de temps un pourboire reste « qui vient d'arriver ». */
export const FRAICHEUR_MS = 2 * 60 * 60_000;

/** LE POURBOIRE QUI VIENT D'ARRIVER, s'il y en a un : le plus récent de ses
    pourboires d'aujourd'hui ou d'hier, inscrit il y a moins de deux heures.
    L'instant d'inscription se lit sur la part (`inscritLe`) ; une part qui ne
    le porte pas (écrite par un Trône d'avant le 5 novembre 2026, sur un autre
    poste) prend l'instant où l'écran l'a VUE arriver (`vuesArriver`). JAMAIS
    une part d'un jour plus ancien : un repartage du registre réécrit des
    parts d'août avec l'heure d'aujourd'hui, et ce n'est pas un pourboire qui
    arrive. */
export function vientDArriver(
  parts: readonly PartDePourboire[],
  staffId: string,
  aujourdhui: string,
  maintenantMs: number,
  vuesArriver: ReadonlyMap<string, number> = new Map(),
): { id: string; amountXof: number; prenom: string; depuisMs: number; aMs: number } | null {
  const hier = ajouteJours(aujourdhui, -1);
  let meilleur: { id: string; amountXof: number; prenom: string; depuisMs: number; aMs: number } | null = null;
  for (const p of parts) {
    if (p.staffId !== staffId) continue;
    const n = montantDe(p);
    const j = jourDe(p.date);
    if (!n || j < hier || j > aujourdhui) continue;
    const inscrit = p.inscritLe ? Date.parse(p.inscritLe) : NaN;
    const a = Number.isFinite(inscrit) ? inscrit : vuesArriver.get(p.id);
    if (a === undefined || !Number.isFinite(a)) continue;
    const depuis = maintenantMs - a;
    if (depuis < -60_000 || depuis > FRAICHEUR_MS) continue;
    if (!meilleur || a > meilleur.aMs) meilleur = { id: p.id, amountXof: n, prenom: prenomDeLaCliente(p.note), depuisMs: Math.max(0, depuis), aMs: a };
  }
  return meilleur;
}

/** « à l'instant » (moins de deux minutes), « il y a 12 min », puis l'heure
    de Cotonou, « à 14 h 05 ». */
export function quandDit(depuisMs: number, aMs: number): string {
  if (depuisMs < 2 * 60_000) return 'à l’instant';
  if (depuisMs < 60 * 60_000) return `il y a ${Math.floor(depuisMs / 60_000)} min`;
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Porto-Novo' })
    .format(new Date(aMs)).split(':').map(Number);
  return m ? `à ${h} h ${String(m).padStart(2, '0')}` : `à ${h} h`;
}

/** « +1 000 F de pourboire · Ranti » : sa part, le prénom de la cliente.
    La même phrase que le titre de la notification (0157). */
export const pourboireArriveDit = (amountXof: number, prenom: string): string =>
  `+${francsDits(amountXof)} de pourboire${prenom ? ` · ${prenom}` : ''}`;

/** LA NOTIFICATION, telle que la base l'écrit (0196, `previens_du_pourboire`) :
    le titre dit sa part et le prénom ; le corps, son total de la PÉRIODE de ce
    pourboire (du 6 au 4, payée le 5 ; `periode` = la clé 'AAAA-MM' de
    `periodeDesPourboires`). Rien d'autre : ni le montant de la pièce, ni le
    nom entier. */
export function notificationDuPourboire(part: number, note: string | undefined, totalDeLaPeriode: number, periode: string): { titre: string; corps: string } {
  return {
    titre: pourboireArriveDit(part, prenomDeLaCliente(note)),
    corps: `Tes pourboires ${periodeDite(periode)} : ${francsDits(totalDeLaPeriode)}.`,
  };
}

/* ── Le tableau de l'équipe (la direction) ────────────────────────────── */

export type LigneDuTableau = {
  id: string; nom: string; part: number;
  aujourdhui: number; semaine: number;
  /** Alignés sur `colonnes`. */
  parMois: number[];
  depuisLeDebut: number; nb: number;
};

export type TableauDeLEquipe = {
  /** Les mois en colonnes, le plus récent d'abord : le mois en cours, puis
      les précédents jusqu'au premier mois inscrit (six au plus). */
  colonnes: string[];
  /** Le premier mois où un pourboire s'est inscrit (« Depuis août 2026 »). */
  premierMois: string | null;
  lignes: LigneDuTableau[];
  /** Qui ne prend pas part au partage et n'a rien reçu : une ligne, pas cinq. */
  sansPart: { id: string; nom: string }[];
  total: Omit<LigneDuTableau, 'id' | 'nom'>;
};

/** Les parts de cette maison : celles de ses fiches, et celles dont la fiche
    n'existe plus nulle part (elles restent de l'argent inscrit). */
export function partsDeLaMaison(parts: readonly PartDePourboire[], membresDeLaMaison: readonly { id: string }[], toutesLesFiches: readonly { id: string }[]): PartDePourboire[] {
  const ici = new Set(membresDeLaMaison.map((m) => m.id));
  const connues = new Set(toutesLesFiches.map((m) => m.id));
  return parts.filter((p) => ici.has(p.staffId) || !connues.has(p.staffId));
}

export const FICHE_RETIREE = 'fiche-retiree';

/** LE TABLEAU : une ligne par membre qui prend part au partage ou qui a reçu
    quelque chose, dans l'ordre de l'équipe ; une ligne « Fiche retirée » pour
    les parts dont la fiche n'existe plus ; le total, qui dit tout l'argent
    inscrit. Les parts comptent telles qu'écrites, jamais recalculées. */
export function tableauDeLEquipe(
  parts: readonly PartDePourboire[],
  membres: readonly MembreDuPartage[],
  aujourdhui: string,
  { moisMax = 6 }: { moisMax?: number } = {},
): TableauDeLEquipe {
  const valables = parts.filter((p) => montantDe(p) > 0 && /^\d{4}-\d{2}-\d{2}/.test(p.date));
  const mois = moisDe(aujourdhui);
  const premierMois = valables.length ? valables.map((p) => moisDe(p.date)).sort()[0] : null;
  const colonnes: string[] = [mois];
  while (premierMois && colonnes.length < moisMax && colonnes[colonnes.length - 1] > premierMois) colonnes.push(moisAvant(colonnes[colonnes.length - 1]));
  const parFiche = new Map<string, PartDePourboire[]>();
  const fiches = new Set(membres.map((m) => m.id));
  for (const p of valables) {
    const cle = fiches.has(p.staffId) ? p.staffId : FICHE_RETIREE;
    parFiche.set(cle, [...(parFiche.get(cle) ?? []), p]);
  }
  const ligneDe = (id: string, nom: string, part: number, siennes: readonly PartDePourboire[]): LigneDuTableau => {
    const t = totauxDe(siennes, aujourdhui);
    return {
      id, nom, part, aujourdhui: t.aujourdhui, semaine: t.semaine,
      parMois: colonnes.map((c) => siennes.filter((p) => moisDe(p.date) === c).reduce((n, p) => n + montantDe(p), 0)),
      depuisLeDebut: t.depuisLeDebut, nb: t.nb,
    };
  };
  const lignes: LigneDuTableau[] = [];
  const sansPart: { id: string; nom: string }[] = [];
  const enActivite = (m: MembreDuPartage): boolean => !m.archiveeLe || m.archiveeLe > aujourdhui;
  for (const m of membres) {
    const siennes = parFiche.get(m.id) ?? [];
    const part = partDe(m);
    if (siennes.length || (enActivite(m) && part > 0)) lignes.push(ligneDe(m.id, m.name, part, siennes));
    else if (enActivite(m)) sansPart.push({ id: m.id, nom: m.name });
  }
  const retirees = parFiche.get(FICHE_RETIREE);
  if (retirees?.length) lignes.push(ligneDe(FICHE_RETIREE, 'Fiche retirée', 0, retirees));
  const total = {
    /* Les parts d'aujourd'hui : celles de l'équipe en activité (4 = trois
       fois 1 et deux fois ½). */
    part: membres.filter(enActivite).reduce((n, m) => n + partDe(m), 0),
    aujourdhui: lignes.reduce((n, l) => n + l.aujourdhui, 0),
    semaine: lignes.reduce((n, l) => n + l.semaine, 0),
    parMois: colonnes.map((_, i) => lignes.reduce((n, l) => n + l.parMois[i], 0)),
    depuisLeDebut: lignes.reduce((n, l) => n + l.depuisLeDebut, 0),
    nb: lignes.reduce((n, l) => n + l.nb, 0),
  };
  return { colonnes, premierMois, lignes, sansPart, total };
}

/* ── L'évolution, mois par mois ───────────────────────────────────────── */

/** La clé d'un pourboire (et non d'une part) : sa pièce ; une part d'avant le
    19 août 2026, sans pièce, se range avec celles du même jour et de la même
    cliente. */
export const cleDuPourboire = (p: PartDePourboire): string =>
  p.invoiceId ? `piece:${p.invoiceId}` : `sans-piece:${jourDe(p.date)}:${String(p.note ?? '').trim().toLowerCase()}`;

export type MoisDeLaSerie = { mois: string; total: number; nbPourboires: number; enCours: boolean };

/** Les mois du premier inscrit au mois en cours (douze au plus), vides
    compris : un mois sans pourboire se voit, il ne disparaît pas. */
export function serieMoisParMois(parts: readonly PartDePourboire[], aujourdhui: string, { moisMax = 12 }: { moisMax?: number } = {}): MoisDeLaSerie[] {
  const valables = parts.filter((p) => montantDe(p) > 0 && /^\d{4}-\d{2}-\d{2}/.test(p.date));
  const courant = moisDe(aujourdhui);
  if (!valables.length) return [{ mois: courant, total: 0, nbPourboires: 0, enCours: true }];
  const premier = valables.map((p) => moisDe(p.date)).sort()[0];
  const mois: string[] = [courant];
  while (mois.length < moisMax && mois[0] > premier) mois.unshift(moisAvant(mois[0]));
  return mois.map((m) => {
    const du = valables.filter((p) => moisDe(p.date) === m);
    return { mois: m, total: du.reduce((n, p) => n + montantDe(p), 0), nbPourboires: new Set(du.map(cleDuPourboire)).size, enCours: m === courant };
  });
}

/* ── Le fil des pourboires ────────────────────────────────────────────── */

export type PourboireDuFil = {
  cle: string; jour: string; jourDit: string;
  invoiceId?: string; numero?: string;
  /** Le nom entier : la direction seule le lit. */
  cliente: string;
  prenom: string;
  montant: number;
  parts: { staffId: string; nom: string; prenom: string; amountXof: number }[];
  partageDit: string;
};

/** « Aimer, Gérard, Nassim 1 000 F chacun · Brice, Yéman 500 F chacun » : les
    parts égales ensemble, la plus grande d'abord. */
export function partageDit(parts: readonly { prenom: string; amountXof: number }[], argent: (n: number) => string = francsDits): string {
  const parMontant = new Map<number, string[]>();
  for (const p of parts) parMontant.set(p.amountXof, [...(parMontant.get(p.amountXof) ?? []), p.prenom || 'une fiche retirée']);
  return [...parMontant.entries()].sort((a, b) => b[0] - a[0])
    .map(([n, noms]) => `${noms.join(', ')} ${argent(n)}${noms.length > 1 ? ' chacun' : ''}`)
    .join(' · ');
}

/** LE FIL : chaque pourboire, sa pièce, son montant, son partage, le plus
    récent d'abord. Filtré sur un mois, ou sur ceux qui ont crédité un membre. */
export function filDesPourboires(
  parts: readonly PartDePourboire[],
  membres: readonly MembreDuPartage[],
  pieces: readonly PieceDuFil[],
  { mois, staffId, argent = francsDits }: { mois?: string; staffId?: string; argent?: (n: number) => string } = {},
): PourboireDuFil[] {
  const nomDe = new Map(membres.map((m) => [m.id, m.name]));
  const numeroDe = new Map(pieces.map((p) => [p.id, p.number]));
  const groupes = new Map<string, PartDePourboire[]>();
  for (const p of parts) {
    if (!montantDe(p) || (mois && moisDe(p.date) !== mois)) continue;
    const c = cleDuPourboire(p);
    groupes.set(c, [...(groupes.get(c) ?? []), p]);
  }
  const fil: PourboireDuFil[] = [];
  for (const [cle, ps] of groupes) {
    if (staffId && !ps.some((p) => p.staffId === staffId)) continue;
    const premiere = [...ps].sort(plusRecentDAbord)[ps.length - 1];
    const lesParts = ps
      .map((p) => ({ staffId: p.staffId, nom: nomDe.get(p.staffId) ?? 'Fiche retirée', prenom: nomDe.has(p.staffId) ? prenomDuMembre(nomDe.get(p.staffId)) : '', amountXof: montantDe(p) }))
      .sort((a, b) => b.amountXof - a.amountXof || membres.findIndex((m) => m.id === a.staffId) - membres.findIndex((m) => m.id === b.staffId));
    const cliente = String(ps.find((p) => p.note?.trim())?.note ?? '').trim();
    const invoiceId = premiere.invoiceId;
    const numero = invoiceId ? numeroDe.get(invoiceId) : undefined;
    fil.push({
      cle, jour: jourDe(premiere.date), jourDit: jourDit(jourDe(premiere.date)),
      ...(invoiceId ? { invoiceId } : {}), ...(numero ? { numero } : {}),
      cliente, prenom: prenomDeLaCliente(cliente),
      montant: lesParts.reduce((n, p) => n + p.amountXof, 0),
      parts: lesParts,
      partageDit: partageDit(lesParts, argent),
    });
  }
  return fil.sort((a, b) => b.jour.localeCompare(a.jour) || (b.numero ?? '').localeCompare(a.numero ?? '') || b.cle.localeCompare(a.cle));
}

/** LE DÉTAIL D'UN MEMBRE (un toucher sur son nom) : ses totaux, son évolution,
    et chacun de ses pourboires avec sa part. */
export function detailDuMembre(parts: readonly PartDePourboire[], staffId: string, aujourdhui: string): {
  totaux: Totaux; serie: MoisDeLaSerie[];
  lignes: { id: string; jour: string; jourDit: string; cliente: string; amountXof: number }[];
} {
  const siennes = parts.filter((p) => p.staffId === staffId && montantDe(p) > 0);
  return {
    totaux: totauxDe(siennes, aujourdhui),
    serie: serieMoisParMois(siennes, aujourdhui),
    lignes: [...siennes].sort(plusRecentDAbord).map((p) => ({ id: p.id, jour: jourDe(p.date), jourDit: jourDit(jourDe(p.date)), cliente: String(p.note ?? '').trim(), amountXof: montantDe(p) })),
  };
}
