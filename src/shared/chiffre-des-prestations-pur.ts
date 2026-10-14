/* ══ LE CHIFFRE DES PRESTATIONS — 14 octobre 2026 ═════════════════════════

   Maquette EvcUQJUB… validée (« construis »), quatre choix : le chiffre des
   rituels honorés avec « dont encaissé » ; une formule comptée à sa vente, sur
   une ligne à part ; un écran des Finances ; vu de la direction et du
   département Finances.

   LES RÈGLES SONT CELLES DU TRÔNE, PAS DE NOUVELLES. Le net d'un rituel vient
   de `apptNetXof` (remises, forfait, séance de série à 0 F), que l'écran passe
   ici ; il se partage entre ses prestations au prorata de leurs prix de carte,
   la dernière part soldant l'arrondi (le même partage que `splitByWeights`,
   que le banc compare) ; une séance couverte par une formule ne compte jamais
   dans le chiffre (agenda.ts, `coveredBySub`) mais compte en nombre ; un
   rendez-vous annulé ne compte pas ; un rendez-vous à venir se compte à part,
   sans argent. Pur : ni magasin, ni horloge. Le banc
   `verifie-le-chiffre-des-prestations` l'éprouve. */

export type Regroupement = 'prestation' | 'famille' | 'maison';
export type Periode = { de: string; a: string };

/** Ce que le calcul lit d'un rendez-vous. */
export type RdvLu = {
  id: string;
  date: string;
  status: string;
  serviceIds: readonly string[];
  clientId?: string;
  clientName?: string;
  invoiceId?: string;
  coveredBySub?: boolean;
  seriesIndex?: number;
  branchId?: string;
};
/** Une formule vendue : une facture d'abonnement, sans rendez-vous. */
export type FormuleVendue = { id: string; date: string; nom: string; montantXof: number; encaisseXof: number; qui: string; branchId?: string };

export type Entrees = {
  rdvs: readonly RdvLu[];
  /** Le net du rituel, remises comprises (apptNetXof). */
  netDe: (a: RdvLu) => number;
  /** La part déjà payée, entre 0 et 1. */
  partPayeeDe: (a: RdvLu) => number;
  services: ReadonlyMap<string, { name: string; priceXof: number; categoryId?: string }>;
  familleDe: (categoryId: string | undefined) => { id: string; nom: string } | undefined;
  maisonDe: (categoryId: string | undefined) => { id: string; nom: string } | undefined;
  formules: readonly FormuleVendue[];
  nomDe: (a: RdvLu) => string;
};

export type RituelCompte = {
  cle: string; date: string; qui: string; montantXof: number; encaisseXof: number;
  /** Une part d'un rituel à plusieurs prestations. */
  combine: boolean;
  /** Une séance couverte par une formule, ou de série : comptée sans argent. */
  sansArgent: boolean;
  invoiceId?: string;
  apptId?: string;
  quoi?: string;
};
export type Ligne = {
  cle: string;
  nom: string;
  sous?: string;
  formule?: boolean;
  /** Rituels honorés (une fois par rituel, même si la prestation y revient). */
  rituels: number;
  /** Dont sans argent : séances de formule ou de série. */
  sansArgent: number;
  chiffreXof: number;
  /** Le prix de carte des rituels payants : la remise moyenne s'en déduit. */
  carteXof: number;
  encaisseXof: number;
  aVenir: number;
  parMois: Record<string, number>;
  detail: RituelCompte[];
};

const dansLaPeriode = (d: string, p: Periode): boolean => d.slice(0, 10) >= p.de && d.slice(0, 10) <= p.a;
const moisDe = (d: string): string => d.slice(0, 7);

/** Le partage du Trône (`splitByWeights`, pricing.ts), recopié pour rester pur :
    parts entières au prorata, la dernière solde l'arrondi, poids nuls = égaux. */
export function partage(total: number, poids: readonly number[]): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const somme = poids.reduce((s, w) => s + Math.max(0, w), 0);
  let acc = 0;
  return poids.map((w, i) => {
    if (i === n - 1) return total - acc;
    const part = somme > 0 ? Math.round((total * Math.max(0, w)) / somme) : Math.round(total / n);
    acc += part;
    return part;
  });
}

export function leChiffre(e: Entrees, p: Periode, regroupement: Regroupement, jour: string, toutesBranches = true, branchId?: string): {
  lignes: Ligne[]; chiffreXof: number; encaisseXof: number; rituels: number;
} {
  const lignes = new Map<string, Ligne>();
  const ligne = (cle: string, nom: string, sous?: string, formule?: boolean): Ligne => {
    let l = lignes.get(cle);
    if (!l) { l = { cle, nom, sous, formule, rituels: 0, sansArgent: 0, chiffreXof: 0, carteXof: 0, encaisseXof: 0, aVenir: 0, parMois: {}, detail: [] }; lignes.set(cle, l); }
    return l;
  };
  const groupe = (serviceId: string): { cle: string; nom: string; sous?: string } | undefined => {
    const s = e.services.get(serviceId);
    if (!s) return undefined;
    if (regroupement === 'prestation') return { cle: serviceId, nom: s.name };
    const g = regroupement === 'famille' ? e.familleDe(s.categoryId) : e.maisonDe(s.categoryId);
    return g ? { cle: g.id, nom: g.nom } : { cle: 'sans', nom: 'Sans famille' };
  };
  const ici = (b?: string) => toutesBranches || !branchId || !b || b === branchId;

  for (const a of e.rdvs) {
    if (!ici(a.branchId) || a.status === 'annulé' || a.serviceIds.length === 0) continue;
    if (a.status !== 'honoré') {
      if (a.date.slice(0, 10) >= jour) {
        const vus = new Set<string>();
        for (const id of a.serviceIds) { const g = groupe(id); if (g && !vus.has(g.cle)) { vus.add(g.cle); ligne(g.cle, g.nom, g.sous).aVenir += 1; } }
      }
      continue;
    }
    if (!dansLaPeriode(a.date, p)) continue;
    const sansArgent = !!a.coveredBySub || (a.seriesIndex ?? 1) > 1;
    const net = sansArgent ? 0 : Math.max(0, e.netDe(a));
    const poids = a.serviceIds.map((id) => e.services.get(id)?.priceXof ?? 0);
    const parts = partage(net, poids);
    const r = Math.max(0, Math.min(1, e.partPayeeDe(a)));
    const parGroupe = new Map<string, { g: { cle: string; nom: string; sous?: string }; montant: number; carte: number }>();
    a.serviceIds.forEach((id, i) => {
      const g = groupe(id);
      if (!g) return;
      const x = parGroupe.get(g.cle) ?? { g, montant: 0, carte: 0 };
      x.montant += parts[i];
      x.carte += sansArgent ? 0 : (e.services.get(id)?.priceXof ?? 0);
      parGroupe.set(g.cle, x);
    });
    const combine = parGroupe.size > 1;
    for (const { g, montant, carte } of parGroupe.values()) {
      const l = ligne(g.cle, g.nom, g.sous);
      const enc = Math.round(montant * r);
      l.rituels += 1;
      if (sansArgent) l.sansArgent += 1;
      l.chiffreXof += montant;
      l.carteXof += carte;
      l.encaisseXof += enc;
      l.parMois[moisDe(a.date)] = (l.parMois[moisDe(a.date)] ?? 0) + montant;
      l.detail.push({ cle: a.id, date: a.date, qui: e.nomDe(a), montantXof: montant, encaisseXof: enc, combine, sansArgent, invoiceId: a.invoiceId, apptId: a.id });
    }
  }

  /* LA FORMULE, À SA VENTE, SUR UNE LIGNE À PART (choix 2). Ses séances sont
     déjà comptées plus haut, en nombre et sans argent, sous leurs prestations. */
  for (const f of e.formules) {
    if (!ici(f.branchId) || !dansLaPeriode(f.date, p)) continue;
    const cle = regroupement === 'prestation' ? `formule:${f.nom}` : 'formules';
    const l = ligne(cle, regroupement === 'prestation' ? `Formule · ${f.nom}` : 'Les formules', undefined, true);
    l.rituels += 1;
    l.chiffreXof += f.montantXof;
    l.carteXof += f.montantXof;
    l.encaisseXof += Math.min(f.montantXof, f.encaisseXof);
    l.parMois[moisDe(f.date)] = (l.parMois[moisDe(f.date)] ?? 0) + f.montantXof;
    l.detail.push({ cle: f.id, date: f.date, qui: f.qui, montantXof: f.montantXof, encaisseXof: Math.min(f.montantXof, f.encaisseXof), combine: false, sansArgent: false, invoiceId: f.id, quoi: 'Vente de la formule' });
  }

  const liste = [...lignes.values()].filter((l) => l.rituels > 0 || l.aVenir > 0);
  for (const l of liste) l.detail.sort((x, y) => y.date.localeCompare(x.date));
  liste.sort((x, y) => y.chiffreXof - x.chiffreXof || y.rituels - x.rituels || x.nom.localeCompare(y.nom));
  return {
    lignes: liste,
    chiffreXof: liste.reduce((s, l) => s + l.chiffreXof, 0),
    encaisseXof: liste.reduce((s, l) => s + l.encaisseXof, 0),
    rituels: rituelsDistincts(liste),
  };
}

/** Le prix réel moyen d'un rituel payant, et la remise moyenne sur la carte. */
/** LE NOMBRE DE RITUELS D'UN ENSEMBLE DE LIGNES : chacun une fois, même quand
    il porte deux prestations rangées sur deux lignes (le rituel combiné). Une
    formule vendue n'est pas un rituel. */
export function rituelsDistincts(lignes: readonly Pick<Ligne, 'formule' | 'detail'>[]): number {
  const vus = new Set<string>();
  for (const l of lignes) if (!l.formule) for (const d of l.detail) vus.add(d.cle);
  return vus.size;
}

export function prixReel(l: Pick<Ligne, 'chiffreXof' | 'carteXof' | 'rituels' | 'sansArgent'>): { moyenXof: number | null; remisePct: number | null } {
  const payants = l.rituels - l.sansArgent;
  return {
    moyenXof: payants > 0 ? Math.round(l.chiffreXof / payants) : null,
    remisePct: l.carteXof > 0 ? Math.round((1 - l.chiffreXof / l.carteXof) * 100) : null,
  };
}

/** L'évolution sur la période d'avant ; nulle si rien ne la précède. */
export function evolution(maintenant: number, avant: number | undefined): number | null {
  if (avant === undefined || avant <= 0) return null;
  return Math.round(((maintenant - avant) / avant) * 100);
}

/* ══ LES PÉRIODES ═══════════════════════════════════════════════════════ */

export type ChoixDePeriode = 'mois' | 'moisPrec' | 'trois' | 'annee' | 'douze' | 'libre';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const dernierDuMois = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
/** Décale une date de n mois, le jour rabattu sur la fin du mois. */
export function decaleMois(iso: string, n: number): string {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  const na = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${na}-${pad(nm)}-${pad(Math.min(j, dernierDuMois(na, nm)))}`;
}
const premierDu = (iso: string) => `${iso.slice(0, 7)}-01`;
const finDu = (iso: string) => { const [a, m] = iso.split('-').map(Number); return `${a}-${pad(m)}-${pad(dernierDuMois(a, m))}`; };
const moisDit = (iso: string) => { const [a, m] = iso.split('-').map(Number); return `${MOIS[m - 1]} ${a}`; };
const jourDit = (iso: string) => { const [a, m, j] = iso.split('-').map(Number); return `${j} ${MOIS[m - 1]} ${a}`; };

/** La période choisie, celle d'avant pour comparer, et ce qu'elle se dit. */
export function laPeriode(choix: ChoixDePeriode, jour: string, libre?: Periode): { p: Periode; avant: Periode; dit: string; mois: string[] } {
  const enMois = (de: string, a: string, n: number, dit: string) => ({ p: { de, a }, avant: { de: decaleMois(de, -n), a: decaleMois(a, -n) }, dit, mois: lesMois(de, a) });
  switch (choix) {
    case 'mois': return enMois(premierDu(jour), jour, 1, `${moisDit(jour)}, jusqu’au ${Number(jour.slice(8))}`);
    case 'moisPrec': { const d = premierDu(decaleMois(jour, -1)); return enMois(d, finDu(d), 1, moisDit(d)); }
    case 'trois': return enMois(premierDu(decaleMois(jour, -2)), jour, 3, `${moisDit(decaleMois(jour, -2))} à ${moisDit(jour)}`);
    case 'annee': return enMois(`${jour.slice(0, 4)}-01-01`, jour, 12, `janvier à ${moisDit(jour)}`);
    case 'douze': return enMois(premierDu(decaleMois(jour, -11)), jour, 12, `${moisDit(decaleMois(jour, -11))} à ${moisDit(jour)}`);
    default: {
      const de = libre?.de && libre.de <= (libre.a || jour) ? libre.de : premierDu(jour);
      const a = libre?.a && libre.a >= de ? libre.a : jour;
      const jours = Math.round((Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000) + 1;
      const recule = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - n * 86_400_000).toISOString().slice(0, 10);
      return { p: { de, a }, avant: { de: recule(de, jours), a: recule(de, 1) }, dit: `du ${jourDit(de)} au ${jourDit(a)}`, mois: lesMois(de, a) };
    }
  }
}
/** Les mois (AAAA-MM) d'une période, dans l'ordre. */
export function lesMois(de: string, a: string): string[] {
  const out: string[] = [];
  for (let m = de.slice(0, 7); m <= a.slice(0, 7) && out.length < 240; m = decaleMois(`${m}-01`, 1).slice(0, 7)) out.push(m);
  return out;
}

/** Les lignes de l'export (downloadCsv, finances/_shared, les écrit et
    neutralise les formules). */
export function lignesCsv(lignes: readonly Ligne[], avant: ReadonlyMap<string, number>): (string | number)[][] {
  const t: (string | number)[][] = [['Prestation', 'Rituels', 'Dont sans argent', 'Chiffre (F)', 'Prix réel moyen (F)', 'Remise (%)', 'Évolution (%)', 'Dont encaissé (F)', 'À venir']];
  for (const l of lignes) {
    const r = prixReel(l);
    const ev = evolution(l.chiffreXof, avant.get(l.cle));
    t.push([l.nom, l.rituels, l.sansArgent, l.chiffreXof, r.moyenXof ?? '', r.remisePct ?? '', ev ?? '', l.encaisseXof, l.aVenir]);
  }
  return t;
}
