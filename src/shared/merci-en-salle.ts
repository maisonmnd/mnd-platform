import { supabase } from './supabase';
import { numeroWa } from './conversations';
import { EN_ATTENTE, REGLES_PAR_DEFAUT, facteurVivant, heureDeDepart } from './salle-des-envois';

/* ══ LE MERCI À LA MARRAINE, PAR LA SALLE D'ATTENTE — 29 octobre 2026 ══
   « Est-ce possible de leur créer une salle d'attente de 10 minutes
   également, pour que je contrôle toujours avant qu'ils partent ? »
   (Yéman, au sélecteur : la fin de paquet et le merci, comme les autres).

   Le merci partait du Trône à l'instant où le juge le comptait. Il est
   désormais DÉPOSÉ en salle, dix minutes, retenable et écartable, et le
   facteur (`envois-partent`) le porte. Sa carte, dessinée ici, se dépose
   d'abord chez Meta par `whatsapp-envoi` (le dépôt seul, 2026-10-29-a), qui
   rend un identifiant : c'est lui que le colis porte, jamais l'image.

   REPLI, COMME LES AUTRES : facteur muet, fonction d'avant (pas
   d'identifiant), ou pas de connexion, et le merci part comme avant, tout
   de suite (`repli`). Deux postes ne déposent pas deux mercis : la ligne
   s'INSÈRE, et la clé primaire ne se prend qu'une fois (`deja`). */

export const MODELE_DU_MERCI = 'parrainage_merci';

/** La ligne du merci, une par récompense (ou par filleule, faute de récompense). */
export const idDuMerci = (clientId: string, cle: string): string =>
  `env-merci-${clientId}-${cle}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 160);

/** LE COLIS : la carte en en-tête quand elle a été déposée, puis les trois
    variables du modèle (son appel, la filleule, la récompense). */
export const colisDuMerci = (o: { numero: string; variables: readonly string[]; mediaId?: string }) => ({
  genre: 'whatsapp' as const, numero: o.numero, modele: MODELE_DU_MERCI,
  composants: [
    ...(o.mediaId ? [{ type: 'header' as const, parameters: [{ type: 'image' as const, image: { id: o.mediaId } }] }] : []),
    { type: 'body' as const, parameters: o.variables.map((v) => ({ type: 'text' as const, text: v.replace(/\s+/g, ' ').trim() })) },
  ],
  /* Les mots du modèle approuvé (fiche 11 du document des modèles), variables posées. */
  texteAuFil: `Bonjour ${o.variables[0] ?? ''}, ${o.variables[1] ?? ''} est venue à la Maison grâce à vous. Merci ! Votre récompense vous attend : ${o.variables[2] ?? ''}. Choisissez-la dans Ma Couronne, ou dites-le simplement à l’accueil.`,
  parQui: 'Le Trône · ambassadrices',
});

/** La carte déposée chez Meta, sans rien envoyer. `null` : pas déposée
    (fonction d'avant, refus, pas de connexion). */
export async function deposeLaCarte(piece: { nom: string; type: string; donnees: string }): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-envoi', { body: { televerseSeulement: true, piece } });
    const id = !error && data && typeof data === 'object' ? (data as { mediaId?: unknown }).mediaId : undefined;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export type IssueDuMerci = 'depose' | 'deja' | 'repli';

/** LE MERCI EN SALLE : déposé (`depose`), déjà déposé par un autre poste
    (`deja`), ou à envoyer comme avant (`repli`). */
export async function deposeLeMerci(o: {
  cle: string; branchId: string; clientId: string; prenom: string; numero: string;
  variables: readonly string[]; piece?: { nom: string; type: string; donnees: string };
  maintenantMs?: number;
}): Promise<IssueDuMerci> {
  const sb = supabase;
  const numero = numeroWa(o.numero);
  if (!sb || !numero || !o.branchId) return 'repli';
  const { data: facteur } = await sb.from('documents').select('data').eq('key', 'mnd_facteur').maybeSingle();
  if (!facteurVivant((facteur?.data as { vuLe?: string } | null)?.vuLe, Date.now())) return 'repli';
  const mediaId = o.piece ? await deposeLaCarte(o.piece) : null;
  /* Une carte prévue qui ne s'est pas déposée : le merci part comme avant, avec elle. */
  if (o.piece && !mediaId) return 'repli';
  const id = idDuMerci(o.clientId, o.cle);
  const quand = new Date(o.maintenantMs ?? Date.now()).toISOString();
  const depart = heureDeDepart(o.maintenantMs ?? Date.now(), REGLES_PAR_DEFAUT);
  const { error } = await sb.from('envois').insert({
    id, branch_id: o.branchId,
    data: {
      id, branchId: o.branchId, type: 'merci-marraine', canal: 'whatsapp', clientId: o.clientId, prenom: o.prenom,
      statut: EN_ATTENTE, quand, deposeLe: quand, partA: new Date(depart.partA).toISOString(), calme: depart.calme,
      colis: colisDuMerci({ numero, variables: o.variables, mediaId: mediaId ?? undefined }),
    },
  });
  /* La clé déjà prise : un autre poste l'a déposé. Toute autre erreur : comme avant. */
  if (!error) return 'depose';
  return (error as { code?: string }).code === '23505' ? 'deja' : 'repli';
}
