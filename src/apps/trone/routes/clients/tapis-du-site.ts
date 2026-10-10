import { reservableSurLeSite } from '../../../../shared/place-du-serveur';
import type { MasquesDuSite, PriceMode } from '../../../../shared/catalogue-pur';

/* LE TAPIS DU SITE DIT CE QUE LE SERVEUR ACCEPTE — 10 octobre 2026.

   La régie des vitrines, en portée « Sur le site public », montrait sous le
   titre « Ce que le monde entier peut réserver en ligne » la liste de MA
   COURONNE : les masques de la Maison (`hiddenServices`, `hiddenCategories`),
   les produits en plus, et rien des masques du site (`siteMasques`). Le site,
   lui, et les deux portes du serveur (`demande-submit`, `whatsapp-automate`)
   ne lisent que `siteMasques` et ne proposent que ce que `reservableSurLeSite`
   accepte : l'Entretien, la Coloration et les consultations. Le tapis disait
   donc autre chose que ce qui se réserve vraiment.

   Il passe désormais par le MÊME juge que le serveur, sans produit (un
   produit ne se réserve pas). L'ordre reste celui du catalogue : l'atelier
   dans l'arbre (`catsDansOrdre`, tel que la régie le déroule), puis le rang
   dans l'atelier. Pur : le harnais le fait tourner sans magasin. */
export type PrestationDuTapis = {
  id: string; categoryId: string; name: string; order: number;
  priceMode?: PriceMode; hidePrice?: boolean; consultationAvant?: boolean; enabled?: boolean; archived?: boolean;
};

export function tapisDuSite<S extends PrestationDuTapis>(
  services: readonly S[],
  catsDansOrdre: readonly { id: string; parentId?: string }[],
  masques: MasquesDuSite | undefined,
): S[] {
  const cats = catsDansOrdre.map((c) => ({ id: c.id, ...(c.parentId ? { parentId: c.parentId } : {}) }));
  const rang = new Map(cats.map((c, i) => [c.id, i]));
  return services
    .filter((s) => reservableSurLeSite(s, cats, masques ?? {}))
    .slice()
    .sort((a, b) => ((rang.get(a.categoryId) ?? 9999) - (rang.get(b.categoryId) ?? 9999)) || (a.order - b.order));
}
