/* ══ LES FICHES D'ESSAI — 7 novembre 2026 ═════════════════════════════════

   « Comment implémenter des RDV test qui ne vont pas dans notre liste de RDV,
   ce sont des RDV fictifs, comme en sandbox ? » puis « ni dans le chiffre
   d'affaires » puis « oui construis les RDV essais » (Yéman, 7 novembre 2026).
   Elle teste en vrai (Ma Couronne, le site, WhatsApp, KkiaPay à 100 F) avec sa
   propre fiche : la chaîne d'essai doit marcher de bout en bout (rendez-vous,
   pièce, paiement, honoré, messages À ELLE) mais la gestion ne doit rien en
   voir.

   LE MODÈLE, SANS PLUS :
   · une marque sur la FICHE de la cliente, `essai: true` (champ de
     `clients.data`). Tout ce qui lui appartient (rendez-vous, pièces,
     versements, abonnements, points, avis) est « d'essai ». Aucune marque par
     rendez-vous : un rendez-vous d'essai se reconnaît à sa cliente, donc on ne
     peut pas oublier de le marquer et on ne peut pas le démarquer seul ;
   · le service catalogue « Essai de paiement · 100 F » (fermé aux clientes)
     rend d'essai tout rendez-vous qui le porte, fiche cochée ou non : c'est
     le même essai, posé par une autre voie ;
   · une pièce se juge sur SA cliente, ou sur le rendez-vous auquel elle est
     liée (`apptId` de la pièce, ou `invoiceId` du rendez-vous).

   CE QUI CHANGE, ET CE QUI NE CHANGE PAS. Les écrans qui COMPTENT ou LISTENT
   pour la Maison lisent les rendez-vous et les pièces `sansLesEssais` ; les
   écrans qui servent LA cliente (Ma Couronne, le billet du site, WhatsApp, la
   page Régler), l'automatisme de la fin du rituel, l'honneur, KkiaPay et les
   messages envoyés à elle lisent tout, comme avant. Un rendez-vous d'essai
   continue d'occuper le fauteuil : la place est vraiment prise.

   Pur : ni magasin, ni horloge, ni DOM. Le banc `verifie-essai` l'éprouve ;
   `--prouve` remet chaque faute une à une et exige qu'il crie. */

/** Le service catalogue des essais de paiement (catégorie « ESSAIS », fermée
    aux clientes). Posé par la Maison le 7 novembre 2026. */
export const SERVICE_D_ESSAI_ID = 'doiqyq0g0m';

/** Les mots de l'écran, en un seul endroit (jamais de tiret long). */
export const MOT_ESSAI = 'Essai';
export const CASE_DE_LA_FICHE = 'Fiche d’essai (rien de ses rendez-vous ni de ses paiements ne compte)';
export const PHRASE_DE_LA_CASE =
  'Pour tester la chaîne en vrai avec cette fiche. Ses rendez-vous, ses factures et ses paiements restent à elle, mais ne comptent ni dans le chiffre d’affaires, ni dans la caisse, ni dans les compteurs, ni dans les messages de l’équipe. Décochée, tout redevient compté.';
export const MONTRER_LES_ESSAIS = 'Montrer les essais';

/** La requête que les assistants (SQL brut) ajoutent pour ne lire que les
    fiches qui comptent. `c` est l'alias de `clients`. */
export const SQL_SANS_FICHE_D_ESSAI = "not coalesce((c.data->>'essai')::boolean, false)";

type FicheLue = { id: string; essai?: boolean | null };
type RdvLu = { clientId?: string; serviceIds?: readonly string[] | null; invoiceId?: string | null };
type PieceLue = { id?: string; clientId?: string; apptId?: string | null };

/** Une fiche cochée « d'essai ». Une fiche absente ou sans marque compte. */
export const estUneFicheDEssai = (client: FicheLue | null | undefined): boolean => client?.essai === true;

/** Les fiches par identifiant : la seule table de lecture des jugements. */
export const fichesParId = <C extends FicheLue>(clients: readonly C[]): Map<string, C> =>
  new Map(clients.map((c) => [c.id, c]));

/** Un rendez-vous d'essai : sa cliente est d'essai, ou il porte le service des
    essais. Un rendez-vous sans fiche (cliente de passage) compte. */
export const estUnRdvDEssai = (appt: RdvLu, clientsParId: ReadonlyMap<string, FicheLue>): boolean => {
  if (appt.serviceIds?.includes(SERVICE_D_ESSAI_ID)) return true;
  return !!appt.clientId && estUneFicheDEssai(clientsParId.get(appt.clientId));
};

/** Les pièces de la Maison, rangées par rendez-vous lié : `rdvDeLaPiece`
    se demande avec l'identifiant de la pièce. */
export const rdvsParPiece = <R extends RdvLu & { id: string }>(rdvs: readonly R[]): Map<string, R> => {
  const m = new Map<string, R>();
  for (const r of rdvs) if (r.invoiceId) m.set(r.invoiceId, r);
  return m;
};

/** Une pièce d'essai : sa cliente est d'essai, ou le rendez-vous qu'elle règle
    l'est (par `apptId`, ou par le rendez-vous qui la porte). */
export const estUnePieceDEssai = (
  piece: PieceLue,
  clientsParId: ReadonlyMap<string, FicheLue>,
  rdvs?: { parId: ReadonlyMap<string, RdvLu>; parPiece: ReadonlyMap<string, RdvLu> },
): boolean => {
  if (piece.clientId && estUneFicheDEssai(clientsParId.get(piece.clientId))) return true;
  if (!rdvs) return false;
  const lie = (piece.apptId ? rdvs.parId.get(piece.apptId) : undefined) ?? (piece.id ? rdvs.parPiece.get(piece.id) : undefined);
  return !!lie && estUnRdvDEssai(lie, clientsParId);
};

/** LE SÉLECTEUR COMMUN. Ce que la Maison compte : les rendez-vous sans les essais. */
export const sansLesEssais = <R extends RdvLu>(rdvs: readonly R[], clientsParId: ReadonlyMap<string, FicheLue>): R[] =>
  rdvs.filter((a) => !estUnRdvDEssai(a, clientsParId));

/** Les pièces sans les essais. `rdvs` aide à juger les pièces sans cliente. */
export const piecesSansLesEssais = <P extends PieceLue>(
  pieces: readonly P[],
  clientsParId: ReadonlyMap<string, FicheLue>,
  rdvs?: readonly (RdvLu & { id: string })[],
): P[] => {
  const liens = rdvs ? { parId: new Map(rdvs.map((r) => [r.id, r as RdvLu])), parPiece: rdvsParPiece(rdvs) as ReadonlyMap<string, RdvLu> } : undefined;
  return pieces.filter((p) => !estUnePieceDEssai(p, clientsParId, liens));
};

/** Les fiches qui comptent (statistiques de fidélité, compteurs de cliente). */
export const fichesSansLesEssais = <C extends FicheLue>(clients: readonly C[]): C[] =>
  clients.filter((c) => !estUneFicheDEssai(c));

/** Le calendrier : les essais n'y paraissent que si on les demande. */
export const rdvsDuCalendrier = <R extends RdvLu>(
  rdvs: readonly R[],
  clientsParId: ReadonlyMap<string, FicheLue>,
  montrerLesEssais: boolean,
): R[] => (montrerLesEssais ? [...rdvs] : sansLesEssais(rdvs, clientsParId));

/** Combien d'essais le calendrier cache (pour le dire sur l'interrupteur). */
export const nombreDEssais = (rdvs: readonly RdvLu[], clientsParId: ReadonlyMap<string, FicheLue>): number =>
  rdvs.filter((a) => estUnRdvDEssai(a, clientsParId)).length;
