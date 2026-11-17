/* ══ LA LECTURE DE LA MAISON, FAITE AU TRÔNE — 17 novembre 2026 ═════════════
   « La consultation en affiches », lot 2. La lecture (les prestations que ses
   besoins appellent, leurs fourchettes, l'estimation) est l'affaire de la
   Maison : elle se fait ICI, sur le catalogue et les réglages du Trône,
   depuis ce qu'elle a dit (ses besoins cochés et sa couronne), et se remet au
   rendez-vous. Le dépôt d'une consultation ne la porte pas (`depotPropre`).

   LA RÈGLE, lue à ses sources : `qualifie` (besoins-pur), `fourchetteDe` et
   `somme` (estimation-pur). Rien n'est inventé : un besoin inconnu du
   document ne propose rien, une prestation archivée ou fermée sort de la
   lecture. Par défaut, la première proposée est retenue (la plus
   pertinente) ; la Maison ajuste au devis.

   MODULE PUR : ni magasin, ni réseau. Le Trône l'appelle (`lecture-de-la-maison`),
   le banc le fait tourner. */
import { AUCUNE_PREUVE, qualifie, type LigneQualifiee, type ReglagesDesBesoins } from './besoins-pur';
import { calibreDuNombre, fourchetteDe, proposableEnLigne, somme, type CalibreBrut, type LongueurDite, type PrestationBrute } from './estimation-pur';

/** La forme que le Trône lit déjà (`OnlineConsultation.estimation`). */
export type LectureDeLaMaison = {
  lignes: { serviceId: string; nom: string; min: number | null; max: number | null; retenue: boolean }[];
  aConfirmer: { serviceId: string; nom: string; pourquoi: string }[];
  min: number; max: number; aChiffrer: number;
};

/** Ce que la lecture lit d'une consultation déposée. */
export type CeQuElleADit = {
  besoins?: readonly { id: string }[];
  couronne?: { locks?: number; calibreId?: string; longueur?: string };
};

const LONGUEURS: readonly string[] = ['court', 'mi-long', 'long'];

/** Ce qui manque, dit pour l'équipe. */
const pourquoiDit = (l: LigneQualifiee): string => l.manques.join(' · ') || 'à confirmer';

/** LA LECTURE. `fermees` : les familles du catalogue éteintes. Sans besoin
    reconnu, rien : la Maison lit elle-même. */
export function lectureDeLaMaison(
  c: CeQuElleADit, r: ReglagesDesBesoins,
  services: readonly PrestationBrute[], calibres: readonly CalibreBrut[], fermees: ReadonlySet<string> = new Set(),
): LectureDeLaMaison | null {
  const choisis = (c.besoins ?? []).map((b) => b.id).filter((id): id is string => typeof id === 'string' && id !== '');
  if (choisis.length === 0) return null;
  const vendues = new Map<string, PrestationBrute>();
  for (const s of services) if (proposableEnLigne(s) && !fermees.has(String(s.categoryId ?? ''))) vendues.set(s.id, s);
  const prixDe = (id: string): number | undefined => {
    const s = vendues.get(id);
    if (!s) return undefined;
    if (s.priceXof && s.priceXof > 0) return s.priceXof;
    const p = Object.values(s.prixParLongueur ?? {}).filter((n): n is number => typeof n === 'number' && n > 0);
    return p.length ? Math.min(...p) : undefined;
  };
  const lignes = qualifie(r, choisis, AUCUNE_PREUVE, prixDe).lignes.filter((l) => vendues.has(l.serviceId));
  const locks = Number(c.couronne?.locks) > 0 ? Math.round(Number(c.couronne?.locks)) : 0;
  const calibreId = locks > 0 ? calibreDuNombre(locks, calibres) : (c.couronne?.calibreId || undefined);
  const longueur: LongueurDite = LONGUEURS.includes(String(c.couronne?.longueur ?? '')) ? (c.couronne?.longueur as LongueurDite) : '';
  const fourchette = (id: string) => {
    const s = vendues.get(id);
    return s ? fourchetteDe(s, { locks: locks || undefined, calibreId, longueur, calibres }) : null;
  };
  const nom = (id: string): string => vendues.get(id)?.name ?? id;
  const proposees = lignes.filter((l) => l.ok);
  const retenues = proposees[0] ? [proposees[0].serviceId] : [];
  const total = somme(retenues.map(fourchette));
  return {
    lignes: proposees.map((l) => { const x = fourchette(l.serviceId); return { serviceId: l.serviceId, nom: nom(l.serviceId), min: x?.min ?? null, max: x?.max ?? null, retenue: retenues.includes(l.serviceId) }; }),
    aConfirmer: lignes.filter((l) => !l.ok).map((l) => ({ serviceId: l.serviceId, nom: nom(l.serviceId), pourquoi: pourquoiDit(l) })),
    min: total.min, max: total.max, aChiffrer: total.aChiffrer,
  };
}

/** La garde médicale (plaques, psoriasis) : relue dans les réglages, jamais dans le dépôt. */
export const gardeDeLaPeau = (c: CeQuElleADit, r: ReglagesDesBesoins): boolean => {
  const choisis = new Set((c.besoins ?? []).map((b) => b.id));
  return r.besoins.some((b) => b.garde === 'peau' && choisis.has(b.id));
};

/** Les points d'un besoin coché, lus dans les réglages du Trône (le dépôt n'en porte pas). */
export const pointsDuBesoin = (r: ReglagesDesBesoins, id: string): number | null => r.besoins.find((b) => b.id === id)?.points ?? null;
