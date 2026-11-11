/* ══ LES FORMULES SUR LA PAGE ABONNEMENTS DU SITE — 8 novembre 2026 ═══════
   Lot 5 de l'abonnement refait (maquette `public/maquette-l-abonnement-
   refait.html`, « La page Abonnements du site ») : « Trois façons de venir :
   chaque lune, par carnet, ou après une création. Sans prix sur la page : le
   prix dépend de la tête, il se lit dans Ma Couronne ou se dit de vive voix. »

   LES NOMS SEULEMENT, JAMAIS UN PRIX. Les formules viennent de la liste de
   la Maison (`FORMULES_EN_LUNES`, la genèse des prix du 10 octobre 2026 :
   c'est d'elle que naissent les fiches du Trône), filtrées par
   `ouvertesALaVente` : une formule fermée n'y paraît pas. Les variantes
   « · Signature » se rangent sous leur nom de base. La page est écrite à la
   construction (scripts/genere-revelateur.mjs) : rien de cette liste, ni
   aucun prix, ne voyage dans le paquet du navigateur. Pur. */

import { FORMULES_EN_LUNES } from '../../shared/formules-en-lunes-pur';
import { ouvertesALaVente } from '../../shared/formules-fermees-pur';

export type FaconDeVenir = 'lune' | 'carnet' | 'creation';
export const FACONS_DE_VENIR: readonly FaconDeVenir[] = ['lune', 'carnet', 'creation'];

type FormulePourLeSite = { name: string; mode?: 'cycle' | 'pack'; famille?: string; fermee?: boolean };

/** La façon de venir d'une formule : après une création (la naissance), chaque
    lune (un cycle), par carnet (un paquet). */
export const faconDe = (p: Pick<FormulePourLeSite, 'mode' | 'famille'>): FaconDeVenir =>
  (p.famille === 'naissance' ? 'creation' : p.mode === 'cycle' ? 'lune' : 'carnet');

/** « GBÈJÍ™ · Carnet de Quatre · Signature » se range sous « GBÈJÍ™ · Carnet de Quatre ». */
export const nomDeBase = (nom: string): string => nom.replace(/\s*·\s*Signature\s*$/u, '').trim();

/** LES NOMS PAR FAÇON DE VENIR : les formules ouvertes à la vente, dans
    l'ordre de la liste, chaque nom une fois. Aucun prix n'en sort. */
export function faconsDeVenir(plans: readonly FormulePourLeSite[]): Record<FaconDeVenir, string[]> {
  const out: Record<FaconDeVenir, string[]> = { lune: [], carnet: [], creation: [] };
  for (const p of ouvertesALaVente(plans)) {
    const nom = nomDeBase(p.name);
    if (!nom) continue;
    const liste = out[faconDe(p)];
    if (!liste.includes(nom)) liste.push(nom);
  }
  return out;
}

/** Ce que la page du site écrit : les formules de la Maison, ouvertes. */
export const faconsDuSite = (): Record<FaconDeVenir, string[]> => faconsDeVenir(FORMULES_EN_LUNES);
