import type { Expense } from './finance';

/* ══ PARTAGER UN PAIEMENT — 13 novembre 2026 ═════════════════════════════
   « Dans Dépenses, permets-moi de split a payment » (Yéman), après un ticket
   de supermarché payé d'une seule carte, dont une part n'était pas pour le
   salon. Maquette `public/maquette-partager-un-paiement.html` ; tranché au
   sélecteur : partager une dépense posée ET à la saisie ; une case « hors de
   la Maison » par part ; dans la liste, un paiement et ses parts dessous ; la
   validation de toutes les parts ensemble. Puis « construis ».

   UNE PART EST UNE DÉPENSE À PART ENTIÈRE (son objet, sa catégorie, son
   montant), et toutes portent le même `paiement` : son identifiant, le total
   payé, le libellé du paiement. La date, la caisse, le reçu, le porteur, le
   fournisseur et la validation restent communs. Les totaux par catégorie se
   font donc seuls, et la caisse bouge de la somme des parts, qui est le total.

   PUR : aucune lecture de magasin, aucune horloge, aucun identifiant tiré au
   hasard (l'appelant les donne). Le banc `verifie-le-partage-du-paiement`
   l'éprouve. */

export const PARTS_AU_MOINS = 2;
export const PARTS_AU_PLUS = 8;

/** Une part telle que la fenêtre la saisit. `id` : celui d'une part déjà
    posée qu'on reprend. */
export type PartSaisie = { id?: string; objet: string; categorie: string; montantXof: number; horsMaison?: boolean };

/** POURQUOI CETTE DÉPENSE NE SE PARTAGE PAS, ou `null`. Chacune de ces
    dépenses porte un lien que deux parts casseraient. */
export function pourquoiPasDePartage(e: Pick<Expense, 'recurring' | 'fx' | 'items' | 'sources' | 'source' | 'empruntId' | 'stopped'>): string | null {
  if (e.recurring) return 'Une dépense qui revient chaque mois ne se partage pas : ses parts reviendraient aussi.';
  if (e.fx) return 'Une dépense payée d’une caisse en devise ne se partage pas.';
  if (e.items && e.items.length > 0) return 'Cette dépense est déjà détaillée en articles.';
  if (e.sources && e.sources.length > 0) return 'Des revenus sont désignés pour la payer : ils iraient à une seule part.';
  if (e.source === 'run' || e.source === 'confirm') return 'Une charge de salaire ne se partage pas.';
  if (e.empruntId) return 'Les intérêts d’un emprunt ne se partagent pas.';
  if (e.stopped) return 'Une dépense arrêtée ne se partage pas.';
  return null;
}

const entier = (n: unknown): number => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

/** Ce qui reste à répartir : positif, il manque ; négatif, les parts dépassent. */
export const resteARepartir = (totalXof: number, parts: readonly Pick<PartSaisie, 'montantXof'>[]): number =>
  entier(totalXof) - parts.reduce((s, p) => s + entier(p.montantXof), 0);

export type RefusDuPartage = 'moins-de-deux' | 'trop-de-parts' | 'objet-vide' | 'categorie-vide' | 'montant' | 'reste';

/** LE PARTAGE TIENT-IL ? Deux parts au moins, huit au plus ; chacune a un
    objet, une catégorie et un montant entier positif ; leur somme est
    exactement le paiement. */
export function refusDuPartage(totalXof: number, parts: readonly PartSaisie[]): RefusDuPartage | null {
  if (parts.length < PARTS_AU_MOINS) return 'moins-de-deux';
  if (parts.length > PARTS_AU_PLUS) return 'trop-de-parts';
  if (parts.some((p) => !String(p.objet ?? '').trim())) return 'objet-vide';
  if (parts.some((p) => !String(p.categorie ?? '').trim())) return 'categorie-vide';
  if (parts.some((p) => !(entier(p.montantXof) > 0) || entier(p.montantXof) !== Number(p.montantXof))) return 'montant';
  if (resteARepartir(totalXof, parts) !== 0) return 'reste';
  return null;
}

export const MOT_DU_REFUS: Record<RefusDuPartage, string> = {
  'moins-de-deux': 'Un partage a deux parts au moins.',
  'trop-de-parts': `Huit parts au plus.`,
  'objet-vide': 'Chaque part dit ce qu’elle est.',
  'categorie-vide': 'Chaque part a sa catégorie.',
  montant: 'Chaque part a un montant en francs, sans centimes.',
  reste: 'Le total des parts doit faire exactement le paiement.',
};

/** COUPER LE PAIEMENT. `base` : la dépense à partager (ou la première part
    d'un paiement déjà partagé). La première part garde l'identifiant de
    `base` (un bon d'achat, une capture ou une carte qui la nomment la
    retrouvent), une part reprise garde le sien, les autres reçoivent
    `nouvelId()`. */
export function partsDuPaiement(
  base: Expense,
  parts: readonly PartSaisie[],
  o: { idDuPaiement: string; totalXof: number; libelle: string; nouvelId: () => string },
): Expense[] {
  /* Ce qui est propre à chaque part ne se recopie pas. */
  const { id: _id, label: _l, category: _c, subcategory: _s, amountXof: _a, items: _i, paiement: _p, horsMaison: _h, ...commun } = base;
  const pris = new Set<string>();
  return parts.map((p, i) => {
    const id = p.id && !pris.has(p.id) ? p.id : (i === 0 && !pris.has(base.id) ? base.id : o.nouvelId());
    pris.add(id);
    return {
      ...commun,
      id,
      label: String(p.objet).trim(),
      category: String(p.categorie).trim(),
      amountXof: entier(p.montantXof),
      paiement: { id: o.idDuPaiement, totalXof: entier(o.totalXof), libelle: o.libelle },
      ...(p.horsMaison ? { horsMaison: true } : {}),
    } as Expense;
  });
}

/** RÉUNIR : les parts redeviennent une seule dépense, sous l'identifiant de
    la première, au libellé du paiement, dans la catégorie de la plus grosse
    part. Rien de ce qui était commun ne se perd. */
export function reunisLesParts(parts: readonly Expense[]): Expense | null {
  if (parts.length === 0) return null;
  const premiere = parts[0];
  const plusGrosse = [...parts].sort((a, b) => b.amountXof - a.amountXof)[0];
  const total = parts.reduce((s, p) => s + entier(p.amountXof), 0);
  const { paiement, horsMaison: _h, ...reste } = premiere;
  return {
    ...reste,
    label: paiement?.libelle || premiere.label,
    category: plusGrosse.category,
    amountXof: total,
  };
}

/** Les parts d'un paiement, dans l'ordre où elles sont rangées. */
export const lesPartsDe = <E extends Pick<Expense, 'paiement'>>(depenses: readonly E[], idDuPaiement: string): E[] =>
  depenses.filter((d) => d.paiement?.id === idDuPaiement);

/** L'identifiant d'un paiement neuf, tiré de la dépense qu'on partage. */
export const idDuPaiementPour = (e: Pick<Expense, 'id' | 'paiement'>): string => e.paiement?.id ?? `paiement-${e.id}`;

/** LA LISTE, UN PAIEMENT ET SES PARTS DESSOUS. Les dépenses gardent leur
    ordre ; les parts d'un même paiement se rangent ensemble, à la place de la
    première rencontrée. */
export type LigneDeLaListe<E> =
  | { sorte: 'depense'; depense: E }
  | { sorte: 'paiement'; id: string; libelle: string; totalXof: number; parts: E[] };

export function groupeLesPaiements<E extends Pick<Expense, 'paiement' | 'amountXof'>>(lignes: readonly E[]): LigneDeLaListe<E>[] {
  const out: LigneDeLaListe<E>[] = [];
  const vus = new Map<string, Extract<LigneDeLaListe<E>, { sorte: 'paiement' }>>();
  for (const e of lignes) {
    const p = e.paiement;
    if (!p?.id) { out.push({ sorte: 'depense', depense: e }); continue; }
    const deja = vus.get(p.id);
    if (deja) { deja.parts.push(e); continue; }
    const neuf = { sorte: 'paiement' as const, id: p.id, libelle: p.libelle, totalXof: entier(p.totalXof), parts: [e] };
    vus.set(p.id, neuf);
    out.push(neuf);
  }
  return out;
}

/** Les parts saisies pour reprendre un paiement déjà partagé. */
export const partsSaisiesDe = (parts: readonly Expense[]): PartSaisie[] =>
  parts.map((p) => ({ id: p.id, objet: p.label, categorie: p.category, montantXof: entier(p.amountXof), ...(p.horsMaison ? { horsMaison: true } : {}) }));
