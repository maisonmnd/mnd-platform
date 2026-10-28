/* LA FACTURE DU FOYER — 27 octobre 2026.

   « Comment envoyer la facture de N. et de son frère A. en un message, avec
   le total des deux factures ? » (Yéman, deux frères venus le même jour, un
   seul numéro). Ses choix au sélecteur : une « facture du foyer », UN PDF qui
   liste les factures de la journée et leur total, en UN message WhatsApp ;
   dans les comptes, chaque enfant garde sa propre facture. Elle se propose
   au « Terminer la séance » et par un bouton après coup.

   Ici, sans aucun magasin : qui fait partie du foyer ce jour-là, le mot du
   message, la clé qui empêche un double envoi. Le Trône les branche
   (vente/envoi-de-la-piece.ts, clients/Carnet.tsx, clients/actions.tsx).

   QUI EST DU FOYER : le même compte famille, ou le même numéro de téléphone
   (deux frères inscrits chacun avec le numéro du parent). Le foyer d'un jour
   = les rendez-vous non annulés de ces têtes, ce jour-là, dans la branche ;
   il n'existe qu'à partir de deux. */

export type TeteDuFoyer = { id: string; familyId?: string; phone?: string; archived?: boolean };
export type RdvDuFoyer = { id: string; clientId: string; date: string; time?: string; status: string; branchId?: string };

const chiffres = (s?: string): string => (s ?? '').replace(/\D/g, '');

/** Deux têtes du même foyer : le même compte famille, ou le même numéro (au
    moins huit chiffres, pour qu'un numéro vide ou tronqué ne réunisse personne). */
export function memeFoyer(a: TeteDuFoyer | undefined, b: TeteDuFoyer | undefined): boolean {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  if (a.familyId && a.familyId === b.familyId) return true;
  const na = chiffres(a.phone);
  return na.length >= 8 && na === chiffres(b.phone);
}

/** LES RENDEZ-VOUS DU FOYER CE JOUR-LÀ, celui-ci compris, dans l'ordre de
    l'heure. Moins de deux : il n'y a pas de foyer, la liste est vide. */
export function rdvsDuFoyerLeJour<T extends RdvDuFoyer>(
  rdv: T, rdvs: readonly T[], tetes: readonly TeteDuFoyer[],
): T[] {
  const parId = new Map(tetes.map((t) => [t.id, t]));
  const elle = parId.get(rdv.clientId);
  const ceux = rdvs.filter((a) => a.date === rdv.date && a.status !== 'annulé'
    && (a.branchId ?? '') === (rdv.branchId ?? '')
    && !parId.get(a.clientId)?.archived
    && (a.id === rdv.id || memeFoyer(elle, parId.get(a.clientId))));
  if (!ceux.some((a) => a.id === rdv.id)) ceux.push(rdv);
  if (ceux.length < 2) return [];
  return ceux.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.clientId.localeCompare(b.clientId));
}

/** LA CLÉ DE L'ENVOI : un jour, un numéro. Un double toucher, un second poste,
    un « Terminer » puis un « Envoyer » le même jour : un seul message part. */
export const cleDuFoyer = (jourIso: string, numero: string | undefined): string =>
  `foyer-${jourIso}-${chiffres(numero)}`;

/** Ce que le modèle `facture_du_rituel` reçoit en {{3}} : « Voici votre
    facture du foyer ci-jointe ». */
export const FACTURE_DU_FOYER_JOINTE = 'du foyer ci-jointe';

/** LE MOT DU MESSAGE, dans la fenêtre de 24 heures. Aucun numéro de pièce
    (règle de la Maison) ; le PDF les porte. `quand` est la date dite, avec
    son année. */
export function motDuFoyer(o: {
  appel: string;
  quand: string;
  lignes: readonly { prenom: string; resteDit: string }[];
  totalDit: string;
  lien?: string;
  /** Le lien mène à la page « Régler » du foyer (KkiaPay), 28 octobre 2026 :
      le mot le dit, comme celui de la facture seule. */
  enLigne?: boolean;
}): string {
  const qui = o.lignes.map((l) => l.prenom);
  const noms = qui.length > 1 ? `${qui.slice(0, -1).join(', ')} et ${qui[qui.length - 1]}` : qui.join('');
  const detail = o.lignes.map((l) => `${l.prenom} : ${l.resteDit}`).join('\n');
  return `Bonjour ${o.appel}, merci de la visite de ${noms} du ${o.quand}. Voici votre facture du foyer ci-jointe.\n${detail}\nTotal à régler : ${o.totalDit}.${o.lien
    ? (o.enLigne
      ? `\nPour régler en une fois depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez ce lien :\n${o.lien}`
      : `\nPour régler par mobile money, tout réseau, touchez ce lien : votre téléphone compose le numéro de paiement, frais compris.\n${o.lien}`)
    : ''}`;
}
