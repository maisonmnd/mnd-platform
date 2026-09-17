import { CATEGORIE_FINFIN, fondeLaCouronne, priceModeOf, racineOf, type PriceMode } from './catalogue-pur';

/* CONSULTATION D'ABORD, OU RÉSERVATION DIRECTE — 17 septembre 2026.

   La règle métier du site révélateur : « une création et une réparation
   commencent toujours par une consultation ; un entretien simple se réserve
   directement ». Elle n'existait nulle part en données : Ma Couronne laissait
   réserver une création sans regard, et le site aurait pu refuser ce que
   Ma Couronne acceptait (relecture de l'audit, constat ⑨). Ce module est le
   SEUL juge, pur, lu par le site (par le besoin déclaré) et par Ma Couronne
   (par la prestation visée). Il n'importe rien qui touche à Supabase. */

export type Porte = 'consultation' | 'directe';

export type Besoin = 'creation' | 'reparation' | 'entretien' | 'enfant' | 'formation' | 'inconnu';

type PrestationJugee = {
  categoryId: string;
  priceMode?: PriceMode;
  hidePrice?: boolean;
  /** L'exception posée au Catalogue : une prestation qui exige un regard
      avant réservation, même hors création, devis et restauration. */
  consultationAvant?: boolean;
};

/** Ce qui décide n'est pas l'état déclaré, c'est la prestation visée :
    une création (atelier VÈKPÈ™), un prix sur devis, une restauration
    (atelier FÍNFÍN™), ou le drapeau posé à la main. */
export function exigeConsultation(s: PrestationJugee, cats: { id: string; parentId?: string }[]): boolean {
  if (s.consultationAvant === true) return true;
  if (fondeLaCouronne(s)) return true;
  if (priceModeOf(s) === 'devis') return true;
  return racineOf(cats, s.categoryId)?.id === CATEGORIE_FINFIN;
}

export const porteDe = (s: PrestationJugee, cats: { id: string; parentId?: string }[]): Porte =>
  exigeConsultation(s, cats) ? 'consultation' : 'directe';

/** Le site ne connaît pas encore de prestation, seulement un besoin : la
    même règle, dite par parcours. Un enfant commence par un échange avec ses
    parents ; une formation est une demande, pas un fauteuil. « Je ne sais
    pas » mène au regard : c'est le bon défaut. */
export const porteDuBesoin = (b: Besoin): Porte =>
  b === 'entretien' || b === 'formation' ? 'directe' : 'consultation';

export const ditLaPorte = (p: Porte): string =>
  p === 'consultation' ? 'Commence par une consultation.' : 'Se réserve directement.';
