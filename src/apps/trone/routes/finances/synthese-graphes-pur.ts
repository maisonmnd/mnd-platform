/* ══ LA SYNTHÈSE EN GRAPHES : LES RÈGLES PURES — 24 octobre 2026 ═════
   « Refais une vraie page de synthèse et bilan. De vrais graphes qui
   ressemblent aux captures » (Yéman, captures d'un tableau Workday).

   Ce fichier ne dessine rien : il calcule ce que les graphes montrent, pour
   qu'un banc puisse le vérifier sans navigateur
   (`scripts/verifie-la-synthese-en-graphes.mjs`).

   ── CE QUI GOUVERNE CES DESSINS ─────────────────────────────────────

   ① LES TEINTES SONT CALCULÉES, PAS CHOISIES. Les quatre de `TEINTES` ont
     passé le contrôle sur TOUTES les paires, sur l'ivoire du Trône (#F6F1E7) :
     séparation en daltonisme ≥ 10,8, vision normale ≥ 15,8, contraste ≥ 3:1.
     L'indigo de la Maison (#1E2150) est trop sombre pour la bande de clarté
     d'un graphe : il reste aux textes et aux aplats, pas aux séries.

   ② LA COULEUR SUIT LA CHOSE, PAS SON RANG DU MOIS. Une caisse garde sa
     teinte d'un mois à l'autre : son rang se lit sur TOUT l'historique
     (`rangsStables`), jamais sur le mois affiché. Au-delà de quatre, le reste
     se range dans « Autres », en gris : jamais une cinquième teinte inventée.

   ③ UNE SEULE ÉCHELLE. Revenus, dépenses et résultat sont trois montants en
     francs : un seul axe. Les captures de Workday mettent deux échelles sur
     un même dessin ; ici, jamais : l'alignement de deux axes est arbitraire,
     il fait croire à un lien qui n'existe pas. */

/** Les quatre teintes des séries, dans leur ordre fixe — voir ①. */
export const TEINTES = ['#3B4BA0', '#BE7526', '#4E86D9', '#008E7F'] as const;
/** Le gris de « Autres » : ce qui n'a pas de teinte à soi. */
export const TEINTE_AUTRES = '#A8A296';
/** Combien de choses ont leur teinte dans un anneau ; le reste fait « Autres ». */
export const PLACES_DE_L_ANNEAU = TEINTES.length;

const MOINS = '−';

/** LES GRADUATIONS DE L'AXE : des nombres ronds (1, 2, 2,5, 5 × 10ⁿ), qui
    contiennent toujours le zéro, et descendent sous lui quand un résultat est
    négatif. Un axe qui ne part pas de zéro grossit les écarts. `pasMin` : un
    axe qui compte des rendez-vous ne dit jamais « 0,25 rituel ». */
export function graduations(min: number, max: number, cible = 4, pasMin = 0): number[] {
  const bas = Math.min(0, min);
  const haut = Math.max(0, max);
  if (haut === bas) return [0];
  const brut = (haut - bas) / Math.max(1, cible);
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = Math.max(pasMin, [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= brut - 1e-9) ?? 10 * p);
  const debut = Math.floor(bas / pas + 1e-9) * pas;
  const fin = Math.ceil(haut / pas - 1e-9) * pas;
  const out: number[] = [];
  for (let k = 0; debut + k * pas <= fin + pas * 1e-6; k++) out.push(Math.round((debut + k * pas) * 1e6) / 1e6);
  return out;
}

/** « 1,5 M », « 500 k », « 750 » : le chiffre d'un axe, court. Le signe moins
    est le vrai (−), pas le trait d'union. */
export function chiffreCourt(v: number): string {
  const a = Math.abs(v);
  const signe = v < 0 ? MOINS : '';
  if (a >= 1_000_000) return `${signe}${(a / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`;
  if (a >= 1_000) return `${signe}${(a / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k`;
  return `${signe}${Math.round(a).toLocaleString('fr-FR')}`;
}

/** LE RANG DE CHAQUE CHOSE, SUR TOUT L'HISTORIQUE — voir ②. Le plus gros
    total d'abord ; à égalité, l'ordre alphabétique, pour qu'il ne bouge pas. */
export function rangsStables(totaux: ReadonlyMap<string, number>): Map<string, number> {
  const tri = [...totaux.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  return new Map(tri.map(([nom], i) => [nom, i]));
}

export type PartBrute = { nom: string; valeur: number; n?: number };
export type PartDeLAnneau = {
  nom: string;
  valeur: number;
  n: number;
  /** L'indice dans `TEINTES`, ou null pour « Autres ». */
  teinte: number | null;
  /** Les noms rangés dans ce morceau (un seul, sauf pour « Autres »). */
  membres: string[];
};

/** LES MORCEAUX D'UN ANNEAU. Les quatre premiers rangs de l'historique ont
    leur teinte ; tout le reste du mois se range dans « Autres ». Les morceaux
    se suivent dans l'ordre des teintes : deux teintes voisines sur l'anneau
    sont toujours une paire éprouvée. Rien de nul ni de négatif. */
export function partsDeLAnneau(parts: readonly PartBrute[], rangs: ReadonlyMap<string, number>, places = PLACES_DE_L_ANNEAU): PartDeLAnneau[] {
  const vivantes = parts.filter((p) => p.valeur > 0);
  const nommees: PartDeLAnneau[] = [];
  const autres: PartDeLAnneau = { nom: 'Autres', valeur: 0, n: 0, teinte: null, membres: [] };
  for (const p of vivantes) {
    const r = rangs.get(p.nom);
    if (r !== undefined && r < places) nommees.push({ nom: p.nom, valeur: p.valeur, n: p.n ?? 1, teinte: r, membres: [p.nom] });
    else { autres.valeur += p.valeur; autres.n += p.n ?? 1; autres.membres.push(p.nom); }
  }
  nommees.sort((a, b) => (a.teinte ?? 0) - (b.teinte ?? 0));
  return autres.valeur > 0 ? [...nommees, autres] : nommees;
}

/** DES POURCENTAGES QUI FONT 100. Arrondir chacun à part donne 99 ou 101 :
    le plus fort reste reçoit le point qui manque. */
export function pourcents(valeurs: readonly number[]): number[] {
  const total = valeurs.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return valeurs.map(() => 0);
  const bruts = valeurs.map((v) => (Math.max(0, v) / total) * 100);
  const bas = bruts.map(Math.floor);
  let manque = 100 - bas.reduce((s, v) => s + v, 0);
  const ordre = bruts.map((b, i) => ({ i, reste: b - Math.floor(b) })).sort((a, b) => b.reste - a.reste);
  for (const { i } of ordre) { if (manque <= 0) break; bas[i] += 1; manque -= 1; }
  return bas;
}

/** LE CHEMIN D'UN MORCEAU D'ANNEAU, de l'angle a0 à a1 (en radians, 0 en
    haut, dans le sens des aiguilles). Un morceau seul, à 100 %, ne peut pas
    s'écrire en un arc (son début et sa fin se confondent) : il se trace en
    deux moitiés. */
export function cheminDuMorceau(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const pt = (rayon: number, a: number) => `${(cx + rayon * Math.sin(a)).toFixed(2)} ${(cy - rayon * Math.cos(a)).toFixed(2)}`;
  if (a1 - a0 >= 2 * Math.PI - 1e-6) {
    const m = a0 + Math.PI;
    return `M ${pt(R, a0)} A ${R} ${R} 0 1 1 ${pt(R, m)} A ${R} ${R} 0 1 1 ${pt(R, a0)} Z `
      + `M ${pt(r, a0)} A ${r} ${r} 0 1 0 ${pt(r, m)} A ${r} ${r} 0 1 0 ${pt(r, a0)} Z`;
  }
  const grand = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(R, a0)} A ${R} ${R} 0 ${grand} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${grand} 0 ${pt(r, a0)} Z`;
}

/** Les angles de chaque morceau, bout à bout, sur un tour complet. */
export function anglesDesMorceaux(valeurs: readonly number[]): { a0: number; a1: number }[] {
  const total = valeurs.reduce((s, v) => s + Math.max(0, v), 0);
  let a = 0;
  return valeurs.map((v) => {
    const d = total > 0 ? (Math.max(0, v) / total) * 2 * Math.PI : 0;
    const out = { a0: a, a1: a + d };
    a += d;
    return out;
  });
}

/** L'ÉCART AU MOIS D'AVANT, et s'il est bon. Une hausse des dépenses n'est pas
    une bonne nouvelle : le sens et le jugement sont deux choses. */
export function ecartAuMois(courant: number, avant: number, hausseEstBonne = true): { pct: number | null; sens: 'hausse' | 'baisse' | 'stable'; bon: boolean | null } {
  if (avant === 0) return { pct: null, sens: courant === 0 ? 'stable' : 'hausse', bon: null };
  const pct = Math.round(((courant - avant) / Math.abs(avant)) * 100);
  const sens = pct > 0 ? 'hausse' : pct < 0 ? 'baisse' : 'stable';
  return { pct, sens, bon: sens === 'stable' ? null : (sens === 'hausse') === hausseEstBonne };
}

/** LE GROUPEMENT DU DÉTAIL : « Voir par cliente, par caisse… », comme la
    fenêtre de Workday. Les lignes sans valeur pour cette clé vont sous
    « Non précisé » : rien ne disparaît du total. */
export function groupePar<T extends { amount: number; dims?: Record<string, string> }>(lignes: readonly T[], cle: string): { nom: string; total: number; n: number }[] {
  const m = new Map<string, { total: number; n: number }>();
  for (const l of lignes) {
    const nom = (l.dims?.[cle] ?? '').trim() || 'Non précisé';
    const c = m.get(nom) ?? { total: 0, n: 0 };
    m.set(nom, { total: c.total + l.amount, n: c.n + 1 });
  }
  return [...m.entries()].map(([nom, v]) => ({ nom, ...v })).sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));
}

/** LA BORNE DU MOIS : « encaissé à ce jour ». Le mois en cours, et tout mois
    à venir, s'arrête à aujourd'hui ; un mois passé se lit en entier. La même
    règle que le tableau de bord depuis le 1er octobre 2026 : un versement daté
    du 29 n'est pas encore de l'argent reçu le 24, il se lit dans le projeté. */
export const borneDuMois = (mk: string, aujourdhui: string): string | undefined =>
  (mk >= aujourdhui.slice(0, 7) ? aujourdhui : undefined);

/** LA COMPARAISON LOYALE, À JOUR ÉGAL : le mois d'avant s'arrête au même
    quantième, borné à sa longueur (le 31 mars se compare au 28 février). */
export const aJourEgal = (mkAvant: string, aujourdhui: string): string => {
  const fin = new Date(Number(mkAvant.slice(0, 4)), Number(mkAvant.slice(5, 7)), 0).getDate();
  return `${mkAvant}-${String(Math.min(Number(aujourdhui.slice(8, 10)), fin)).padStart(2, '0')}`;
};

/** LE CUMUL JOUR APRÈS JOUR. `jusqua` (un indice) arrête la courbe : les
    jours d'après valent null, ils ne sont pas encore arrivés. */
export function cumul(valeurs: readonly number[], jusqua = valeurs.length - 1): (number | null)[] {
  let s = 0;
  return valeurs.map((v, i) => {
    if (i > jusqua) return null;
    s += v;
    return s;
  });
}
