/* ══ L'ESTIMATION DE LA CONSULTATION GRATUITE — 13 novembre 2026 ═══════════
   La Consultation, lot 2 (maquette, écran S5 et livrable 8). Une fourchette
   en francs pour chaque prestation que la lecture propose, calculée sur le
   catalogue lu tel quel ; jamais un prix inventé.

   QUAND UN PARAMÈTRE MANQUE, LA FOURCHETTE S'ÉLARGIT AU LIEU DE MENTIR :
     · longueur inconnue : du plus bas au plus haut des prix par longueur ;
     · nombre de locks inconnu pour une création au lock : les bornes du
       calibre choisi (Medium, 81 à 150 locks…) ;
     · prestation sur devis, ou comptage sans calibre : pas de nombre, la
       Maison chiffre.
   Le prix ferme vient toujours de la Maison, après sa confirmation.

   Module PUR : le site public l'importe sans rien charger d'autre (ni
   magasin, ni synchronisation). Les champs lus sont ceux de `catalog_services`. */

export type LongueurDite = 'court' | 'mi-long' | 'long' | '';

/** Ce que l'estimation lit d'une prestation du catalogue. */
export type PrestationBrute = {
  id: string;
  name: string;
  categoryId?: string;
  priceXof?: number;
  priceToXof?: number;
  priceMode?: string;
  hidePrice?: boolean;
  prixParLongueur?: Partial<Record<string, number>>;
  tarifLockParLongueur?: Partial<Record<string, number>>;
  auDelaDesLocks?: { seuil: number; tarifParLongueur: Partial<Record<string, number>> };
  ratePerLock?: number;
  tarifMode?: string;
  bandIds?: string[];
  bandId?: string;
  archived?: boolean;
  enabled?: boolean;
};

export type CalibreBrut = { id: string; name?: string; maxLocks: number | null };

export type Fourchette = { min: number; max: number };

const LONGUEURS = ['court', 'mi-long', 'long'] as const;
const positif = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Les calibres dans l'ordre, chacun avec ses bornes (le premier part de 1 ; le dernier, sans plafond, s'arrête à 650). */
export function bornesDesCalibres(calibres: readonly CalibreBrut[]): { id: string; nom: string; min: number; max: number }[] {
  const tries = [...calibres].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  let bas = 1;
  return tries.map((c) => {
    const haut = c.maxLocks ?? Math.max(bas, 650);
    const r = { id: c.id, nom: c.name ?? c.id, min: bas, max: haut };
    bas = haut + 1;
    return r;
  });
}

/** Le calibre d'un nombre de locks. */
export function calibreDuNombre(locks: number, calibres: readonly CalibreBrut[]): string | undefined {
  return bornesDesCalibres(calibres).find((b) => locks >= b.min && locks <= b.max)?.id;
}

const auLock = (sv: PrestationBrute): boolean => !!sv.tarifLockParLongueur && Object.values(sv.tarifLockParLongueur).some(positif)
  || (sv.tarifMode === 'lock' && positif(sv.ratePerLock));

/** Le prix d'un nombre de locks à un tarif : par tranches au-delà du seuil, jamais sous le plancher de la longueur. */
function prixAuLock(sv: PrestationBrute, locks: number, longueur: (typeof LONGUEURS)[number] | null): number | undefined {
  const tarif = longueur ? sv.tarifLockParLongueur?.[longueur] : undefined;
  const t = positif(tarif) ? tarif : (positif(sv.ratePerLock) ? sv.ratePerLock : undefined);
  if (!t) return undefined;
  const fin = longueur ? sv.auDelaDesLocks?.tarifParLongueur?.[longueur] : undefined;
  const seuil = sv.auDelaDesLocks?.seuil ?? 0;
  const brut = positif(fin) && seuil > 0 && locks > seuil ? seuil * t + (locks - seuil) * fin : locks * t;
  const plancher = longueur ? sv.prixParLongueur?.[longueur] : undefined;
  return Math.max(brut, positif(plancher) ? plancher : 0);
}

/** La fourchette d'une prestation, ou rien quand seule la Maison peut chiffrer. */
export function fourchetteDe(
  sv: PrestationBrute,
  o: { locks?: number; calibreId?: string; longueur: LongueurDite; calibres: readonly CalibreBrut[] },
): Fourchette | null {
  if (sv.priceMode === 'devis') return null;
  const longueurs: ((typeof LONGUEURS)[number] | null)[] = o.longueur ? [o.longueur] : (sv.tarifLockParLongueur ? [...LONGUEURS] : [null]);

  if (auLock(sv)) {
    let nombres: number[];
    if (positif(o.locks)) nombres = [Math.round(o.locks)];
    else {
      const id = o.calibreId ?? sv.bandIds?.[0] ?? sv.bandId;
      const b = id ? bornesDesCalibres(o.calibres).find((x) => x.id === id) : undefined;
      if (!b) return null;
      nombres = [b.min, b.max];
    }
    const prix = longueurs.flatMap((l) => nombres.map((n) => prixAuLock(sv, n, l))).filter(positif);
    return prix.length ? { min: Math.min(...prix), max: Math.max(...prix) } : null;
  }

  const parLongueur = Object.entries(sv.prixParLongueur ?? {}).filter(([, v]) => positif(v)) as [string, number][];
  if (parLongueur.length) {
    const p = o.longueur ? parLongueur.filter(([k]) => k === o.longueur).map(([, v]) => v) : parLongueur.map(([, v]) => v);
    if (p.length) return { min: Math.min(...p), max: Math.max(...p) };
  }
  if (positif(sv.priceXof)) return { min: sv.priceXof, max: positif(sv.priceToXof) && sv.priceToXof > sv.priceXof ? sv.priceToXof : sv.priceXof };
  return null;
}

/** La somme des fourchettes retenues ; les prestations sans nombre sont comptées à part. */
export function somme(f: readonly (Fourchette | null)[]): { min: number; max: number; aChiffrer: number } {
  let min = 0; let max = 0; let aChiffrer = 0;
  for (const x of f) { if (!x) { aChiffrer += 1; continue; } min += x.min; max += x.max; }
  return { min, max, aChiffrer };
}

/** Une prestation qui peut paraître sur le site : ni archivée, ni fermée. */
export const proposableEnLigne = (sv: PrestationBrute): boolean => sv.archived !== true && sv.enabled !== false;
