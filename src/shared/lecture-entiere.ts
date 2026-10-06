/* TOUTE LA TABLE, PAGE PAR PAGE — 1er octobre 2026.

   « Quand je clique sur n'importe quelle rubrique du Trône, c'est très lent
   depuis hier. La synchronisation aussi est très lente » (Yéman). Le Carnet
   affichait « Tout 1000 » : pile mille rendez-vous.

   Supabase ne rend JAMAIS plus de mille lignes par requête. La synchronisation
   lisait chaque table d'un seul `select('id,data')` : tant qu'une table tenait
   sous mille lignes, c'était toute la table ; le jour où `appointments` a
   passé le millième rendez-vous, la lecture est devenue une TRANCHE, et rien
   ne l'a dit. Les lignes de trop disparaissaient de l'écran, revenaient une à
   une par le temps réel, repartaient à la relecture suivante, et à chaque
   aller-retour tout l'écran se recalculait. La pastille restait sur
   « Synchronisation… » et chaque clic attendait son tour.

   La lecture se fait donc par PAGES, à la suite de la dernière ligne lue
   (`id` croissant, « après tel id »), et non par numéro de rang : une ligne
   insérée pendant la lecture ne décale rien, on ne saute ni ne double aucune
   ligne. On s'arrête à la première page incomplète. Une erreur en cours de
   route rend l'erreur et AUCUNE ligne : une table à moitié lue passerait
   pour une table entière, et c'est exactement la panne qu'on répare.

   Ce module n'importe rien : le harnais `verifie-la-lecture-entiere` l'éprouve
   avec un faux serveur, sans réseau. */

export const PAGE_DE_LECTURE = 1000;

type ErreurDeLecture = { message: string };
export type ReponseDePage<L> = { data: L[] | null; error: ErreurDeLecture | null };
/** Lit une page : les `taille` premières lignes dont l'`id` suit `apres`
    (toutes depuis le début si `apres` est nul), dans l'ordre croissant des `id`. */
export type LecteurDePage<L extends { id: string }> = (apres: string | null, taille: number) => PromiseLike<ReponseDePage<L>>;

/* Deux mille pages font deux millions de lignes : au-delà, ce n'est plus une
   table qu'on charge dans un navigateur, c'est une boucle qui ne finit pas. */
const PAGES_AU_PLUS = 2000;

export async function litToutesLesPages<L extends { id: string }>(
  page: LecteurDePage<L>,
  taille: number = PAGE_DE_LECTURE,
): Promise<ReponseDePage<L>> {
  const vues = new Map<string, L>();
  let apres: string | null = null;
  for (let tour = 0; tour < PAGES_AU_PLUS; tour += 1) {
    const { data, error } = await page(apres, taille);
    if (error) return { data: null, error };
    const lignes = data ?? [];
    for (const l of lignes) vues.set(l.id, l);
    if (lignes.length < taille) return { data: [...vues.values()], error: null };
    apres = lignes[lignes.length - 1].id;
  }
  return { data: null, error: { message: 'lecture interminable : la table ne finit pas' } };
}
