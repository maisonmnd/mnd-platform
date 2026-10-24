/* ═══════════════════════════════════════════════════════════════════
   LES QUATRE AUTRES AGENTS — 24 octobre 2026.

   « Construis les quatre autres agents (planning, comptabilité, avis,
   stock) » (Yéman), maquette VJ5PJEGUPDbYKUgEdMUNbS (vue 3). Comme les deux
   premiers : ils LISENT ce que le Trône sait déjà et PROPOSENT ; chaque geste
   attend un clic. Aucun n'écrit à une cliente ni à un fournisseur.

     · LE PLANNING veille aux fauteuils : les jours creux et les jours pleins
       des deux semaines qui viennent, les heures où plus de têtes que de
       fauteuils sont posées, les rendez-vous posés un jour fermé ;
     · LA COMPTABILITÉ range : les dépenses sans justificatif, celles qui
       attendent un oui, et celles laissées en « Divers » qu'un même
       fournisseur ou un même libellé range ailleurs d'habitude ;
     · LES AVIS : ce qui attend une réponse sur Google, les brouillons prêts
       à copier (Claude les écrit déjà, chantier `avis`) ;
     · LE STOCK : la liste de courses du Laboratoire (`reappro`, shared/
       stock.ts) et la Gamme sous son seuil.

   Ce module est PUR ; `scripts/verifie-les-quatre-agents.mjs` le prouve. */

/* ── LE PLANNING ──────────────────────────────────────────────────── */
export const SEUIL_DU_CREUX = 0.35;
export const SEUIL_DU_PLEIN = 0.9;
/** Le pas de la grille des fauteuils, comme au comptoir. */
const PAS_MIN = 15;

export type EtatDuJour = 'ferme' | 'creux' | 'plein' | 'normal';
export type JourDeCharge = {
  iso: string;
  etat: EtatDuJour;
  rdv: number;
  /** Ce que les fauteuils offrent ce jour-là, en minutes (fauteuils × ouverture). */
  capaciteMin: number;
  occupeMin: number;
  /** De 0 à 1 (au-delà de 1 : plus de têtes que de fauteuils sur la journée). */
  taux: number;
  /** Les heures où plus de têtes que de fauteuils se chevauchent. */
  trop: { heure: string; tetes: number }[];
  /** Des rendez-vous posés alors que la Maison est fermée. */
  surFerme: number;
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** LA CHARGE D'UN JOUR : ce que les rendez-vous occupent dans l'ouverture,
    rapporté à ce que les fauteuils offrent ; et chaque quart d'heure où les
    têtes dépassent les fauteuils, dit une fois par bloc, à son plus haut. */
export function chargeDuJour(o: {
  iso: string;
  ouverture: { closed: boolean; openMin: number; closeMin: number };
  sieges: number;
  rdvs: readonly { debutMin: number; dureeMin: number }[];
}): JourDeCharge {
  const { ouverture } = o;
  if (ouverture.closed || ouverture.closeMin <= ouverture.openMin) {
    return { iso: o.iso, etat: 'ferme', rdv: o.rdvs.length, capaciteMin: 0, occupeMin: 0, taux: 0, trop: [], surFerme: o.rdvs.length };
  }
  const sieges = Math.max(1, Math.floor(o.sieges) || 1);
  const capaciteMin = sieges * (ouverture.closeMin - ouverture.openMin);
  const occupeMin = o.rdvs.reduce((s, r) => s + Math.max(0, Math.min(r.debutMin + r.dureeMin, ouverture.closeMin) - Math.max(r.debutMin, ouverture.openMin)), 0);
  const trop: { heure: string; tetes: number }[] = [];
  let bloc: { heure: string; tetes: number } | null = null;
  if (o.sieges > 0) {
    for (let t = ouverture.openMin; t < ouverture.closeMin; t += PAS_MIN) {
      const n = o.rdvs.filter((r) => r.debutMin <= t && r.debutMin + r.dureeMin > t).length;
      if (n > o.sieges) {
        if (!bloc) { bloc = { heure: hhmm(t), tetes: n }; trop.push(bloc); } else bloc.tetes = Math.max(bloc.tetes, n);
      } else bloc = null;
    }
  }
  const taux = capaciteMin ? occupeMin / capaciteMin : 0;
  const etat: EtatDuJour = taux >= SEUIL_DU_PLEIN ? 'plein' : taux < SEUIL_DU_CREUX ? 'creux' : 'normal';
  return { iso: o.iso, etat, rdv: o.rdvs.length, capaciteMin, occupeMin, taux, trop, surFerme: 0 };
}

/** Le pourcentage dit (« 30 % »), borné à l'entier. */
export const tauxDit = (t: number): string => `${Math.round(t * 100)} %`;

/* ── LA COMPTABILITÉ ──────────────────────────────────────────────── */
/** Sous ce montant, un ticket de taxi ou un sachet d'eau : on ne réclame pas
    de justificatif. */
export const SEUIL_DU_JUSTIFICATIF_XOF = 5000;
export const CATEGORIE_A_RANGER = 'Divers';

export type DepenseLue = {
  id: string;
  branchId: string;
  label: string;
  amountXof: number;
  date: string;
  category: string;
  subcategory?: string;
  fournisseurId?: string;
  fichier?: unknown;
  validation?: { etat: 'attente' | 'validee' | 'refusee' };
  stopped?: boolean;
};

/** Les dépenses depuis une date, au-dessus du seuil, sans pièce jointe ;
    les plus lourdes d'abord. Une dépense refusée n'en réclame pas. */
export function depensesSansJustificatif<T extends DepenseLue>(depenses: readonly T[], branchId: string, depuis: string): T[] {
  return depenses
    .filter((d) => d.branchId === branchId && d.date >= depuis && d.amountXof >= SEUIL_DU_JUSTIFICATIF_XOF && !d.fichier && d.validation?.etat !== 'refusee')
    .sort((a, b) => b.amountXof - a.amountXof || b.date.localeCompare(a.date));
}

export const depensesEnAttente = <T extends DepenseLue>(depenses: readonly T[], branchId: string): T[] =>
  depenses.filter((d) => d.branchId === branchId && d.validation?.etat === 'attente');

/** La clé d'un libellé : ses deux premiers mots qui comptent, sans accents
    ni casse (« Achat mèches Dantokpa » et « achat meches » se rejoignent). */
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'pour', 'et', 'au', 'aux', 'a']);
export function cleDuLibelle(label: string): string {
  const mots = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m) && !/^\d+$/.test(m));
  return mots.slice(0, 2).join(' ');
}

export type RangementPropose = { depenseId: string; label: string; vers: string; sous?: string; parce: string };

/** CE QUE LA COMPTABILITÉ PROPOSE DE RANGER : une dépense en « Divers » que
    les autres dépenses du MÊME FOURNISSEUR rangent ailleurs (au moins deux
    fois), ou, sans fournisseur, celles du MÊME LIBELLÉ (au moins deux fois).
    Elle propose la rubrique la plus fréquente ; elle ne range rien seule. */
export function rangementsProposes(depenses: readonly DepenseLue[], branchId: string): RangementPropose[] {
  const siennes = depenses.filter((d) => d.branchId === branchId);
  const rangees = siennes.filter((d) => d.category && d.category !== CATEGORIE_A_RANGER);
  const laPlusFrequente = (l: readonly DepenseLue[]): { vers: string; sous?: string; n: number } | null => {
    const compte = new Map<string, { n: number; sous?: string }>();
    for (const d of l) {
      const c = compte.get(d.category) ?? { n: 0, sous: d.subcategory };
      c.n += 1;
      compte.set(d.category, c);
    }
    const [vers, c] = [...compte.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0] ?? [];
    return vers && c && c.n >= 2 ? { vers, sous: c.sous, n: c.n } : null;
  };
  const out: RangementPropose[] = [];
  for (const d of siennes) {
    if (d.category && d.category !== CATEGORIE_A_RANGER) continue;
    if (d.fournisseurId) {
      const r = laPlusFrequente(rangees.filter((x) => x.fournisseurId === d.fournisseurId));
      if (r) { out.push({ depenseId: d.id, label: d.label, vers: r.vers, sous: r.sous, parce: `comme ${r.n} autres dépenses de ce fournisseur` }); continue; }
    }
    const cle = cleDuLibelle(d.label);
    if (!cle) continue;
    const r = laPlusFrequente(rangees.filter((x) => cleDuLibelle(x.label) === cle));
    if (r) out.push({ depenseId: d.id, label: d.label, vers: r.vers, sous: r.sous, parce: `comme ${r.n} autres « ${d.label.trim().split(/\s+/).slice(0, 3).join(' ')} »` });
  }
  return out;
}

/* ── LE STOCK ─────────────────────────────────────────────────────── */
/** La Gamme sous son seuil, la plus vide d'abord. */
export function gammeAReassortir<T extends { id: string; name: string; stock: number; archived?: boolean }>(produits: readonly T[], seuil: number): T[] {
  return produits.filter((p) => !p.archived && Number.isFinite(p.stock) && p.stock <= seuil)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}

/* ── LES AVIS ─────────────────────────────────────────────────────── */
export type EtatDesAvis = { sansReponse: number; prets: number; sansBrouillon: number; ecartes: number; noteRecente: number | null };

/** L'ÉTAT DES AVIS : ceux qui attendent une réponse, parmi eux ceux dont le
    brouillon est prêt à copier et ceux qui n'en ont pas encore ; la note
    moyenne des dix derniers. `sansReponse` et `brouillonDe` viennent des
    règles des avis (ia-avis-pur) : un seul juge. */
export function etatDesAvis<A extends { note: number; quand?: string }>(
  avis: readonly A[],
  estSansReponse: (a: A) => boolean,
  brouillonDe: (a: A) => { reponse?: string; ecarte?: boolean } | undefined,
): EtatDesAvis {
  const attendent = avis.filter(estSansReponse);
  const prets = attendent.filter((a) => { const b = brouillonDe(a); return !!b?.reponse?.trim() && !b.ecarte; }).length;
  const ecartes = attendent.filter((a) => !!brouillonDe(a)?.ecarte).length;
  const derniers = [...avis].filter((a) => Number.isFinite(a.note)).sort((a, b) => (b.quand ?? '').localeCompare(a.quand ?? '')).slice(0, 10);
  return {
    sansReponse: attendent.length,
    prets,
    sansBrouillon: attendent.length - prets - ecartes,
    ecartes,
    noteRecente: derniers.length ? Math.round((derniers.reduce((s, a) => s + a.note, 0) / derniers.length) * 10) / 10 : null,
  };
}
