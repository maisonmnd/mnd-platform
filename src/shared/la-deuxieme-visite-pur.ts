/* ══ LA DEUXIÈME VISITE SE JOUE AU FAUTEUIL — 26 novembre 2026 ═══════════
   L'audit du Trône (point B2, validé par Yéman) : 55 des 124 clientes qui
   ont glissé ne sont venues qu'une fois. La chute entre la première et la
   deuxième venue est la plus grosse fuite de la Maison ; le prochain rituel
   se propose donc au fauteuil DÈS LA PREMIÈRE VISITE.

   La carte « Son prochain rituel » le propose déjà à toutes, à la fin de
   chaque règlement (« C'est réglé »), à la Caisse, et quand on marque un
   rituel honoré sans l'encaisser (vente/SonProchainRituel.tsx). Rien n'est
   refait : ce module dit seulement si CE rituel est sa première visite, et
   la carte le dit à l'équipe, en tête, avant « Fermer sans prochain
   rendez-vous ».

   Pur, sans import : `scripts/verifie-les-dix-du-lundi.mjs` l'éprouve. */

/** Sa première visite : aucun autre rituel honoré avant ce jour-là. Le rituel
    qu'on ferme (`rituelId`) ne compte pas, qu'il soit déjà honoré ou non. */
export function estSaPremiereVisite(o: {
  rdvs: readonly { id: string; date: string; status: string }[];
  jour: string;
  rituelId?: string;
}): boolean {
  const j = o.jour.slice(0, 10);
  return !o.rdvs.some((a) => a.id !== o.rituelId && a.status === 'honoré' && a.date.slice(0, 10) < j);
}

export const PREMIERE_VISITE_TITRE = 'Première visite : proposez-lui son prochain rituel';
export const PREMIERE_VISITE_DIT = 'Avant qu’elle parte. C’est entre la première et la deuxième venue que la Maison perd le plus de clientes.';
