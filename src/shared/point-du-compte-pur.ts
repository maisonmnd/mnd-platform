/* LE POINT DU COMPTE — 28 octobre 2026.

   « Merline et sa sœur ont plusieurs factures en instance : comment envoyer le
   point à leur père, avec un lien de paiement ? J'ai plusieurs clients comme
   ça, qui accumulent 4 ou 5 factures avant de payer » (Yéman). Ses choix au
   sélecteur (maquette VZ7F7MNJ…) : le point pour TOUT compte dès deux
   factures, un compte famille comme une cliente seule ; il part en un
   toucher, le PDF et le lien ensemble, au payeur du compte ; un bouton sur
   la fiche, au Carnet et dans Factures ; et un seul rappel par payeur.

   Ici, sans aucun magasin : qui paie le compte, quelles factures le point
   couvre, la phrase du modèle, le mot du message, la clé d'un envoi. Le
   Trône les branche (vente/FenetreDuPoint.tsx, vente/envoi-de-la-piece.ts).

   LE COMPTE D'UNE TÊTE : son compte famille s'il en a un (toutes ses têtes
   non archivées, le payeur compris), sinon elle seule. LE PAYEUR : celui du
   compte famille, sinon elle-même. Le point va au payeur d'AUJOURD'HUI, pas à
   celui qu'une vieille facture nomme : le père ajouté au compte reçoit le
   point des factures écrites quand sa fille payait encore. */

export type TeteDuPoint = { id: string; name?: string; familyId?: string; phone?: string; archived?: boolean };
export type CompteDuPoint = { id: string; name?: string; payerClientId?: string };

/** Il n'y a de point qu'à partir de deux factures : une seule part comme avant. */
export const SEUIL_DU_POINT = 2;

/** Le compte famille d'une tête : le sien, ou celui qu'elle paie. */
const compteDe = (tete: TeteDuPoint | undefined, comptes: readonly CompteDuPoint[]): CompteDuPoint | undefined =>
  !tete ? undefined
    : (tete.familyId ? comptes.find((c) => c.id === tete.familyId) : undefined) ?? comptes.find((c) => c.payerClientId === tete.id);

/** LE PAYEUR DU COMPTE d'une tête : celui de son compte famille, sinon elle-même. */
export function payeurDuCompte(teteId: string, tetes: readonly TeteDuPoint[], comptes: readonly CompteDuPoint[]): string {
  const c = compteDe(tetes.find((t) => t.id === teteId), comptes);
  return c?.payerClientId || teteId;
}

/** LES TÊTES DU COMPTE d'un payeur : celles de son compte famille (lui compris), sinon lui seul. */
export function tetesDuCompte(payeurId: string, tetes: readonly TeteDuPoint[], comptes: readonly CompteDuPoint[]): Set<string> {
  const c = compteDe(tetes.find((t) => t.id === payeurId), comptes);
  const ids = new Set([payeurId]);
  if (c) {
    for (const t of tetes) if (t.familyId === c.id && !t.archived) ids.add(t.id);
    if (c.payerClientId) ids.add(c.payerClientId);
  }
  return ids;
}

/** LES FACTURES DU POINT : celles d'une tête du compte (au nom de la tête
    soignée ou de celle qui l'a payée), dans la branche, qui doivent encore,
    de la plus ancienne à la plus récente. */
export function piecesDuPoint<P extends PieceDuPoint>(o: {
  payeurId: string;
  tetes: readonly TeteDuPoint[];
  comptes: readonly CompteDuPoint[];
  pieces: readonly P[];
  branchId: string;
  resteDe: (p: P) => number;
}): P[] {
  const du = tetesDuCompte(o.payeurId, o.tetes, o.comptes);
  return o.pieces
    .filter((p) => (p.kind ?? 'facture') === 'facture' && (p.branchId ?? '') === o.branchId
      && ((!!p.clientId && du.has(p.clientId)) || (!!p.forClientId && du.has(p.forClientId)))
      && o.resteDe(p) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ── DEBUT point (copie dans supabase/functions/relances-factures, éprouvée par scripts/verifie-les-relances)
export type PieceDuPoint = { id: string; kind?: string; clientId?: string; forClientId?: string; branchId?: string; date: string; apptId?: string };
const MOIS_DU_POINT = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jourEtMois = (iso: string): string => {
  const j = Number(iso.slice(8, 10));
  return `${j === 1 ? '1er' : j} ${MOIS_DU_POINT[Number(iso.slice(5, 7)) - 1] ?? ''}`;
};

/** L'ÉTENDUE DES JOURS, avec l'année (règle de la Maison sur toute date
    qu'une cliente lit) : « du 13 juin au 1er septembre 2026 », « du 20
    décembre 2025 au 5 janvier 2026 », « du 5 septembre 2026 ». */
export function etendueDite(jours: readonly string[]): string {
  const tries = [...jours].filter((j) => /^\d{4}-\d{2}-\d{2}/.test(j)).sort();
  if (tries.length === 0) return '';
  const a = tries[0]; const b = tries[tries.length - 1];
  if (a.slice(0, 10) === b.slice(0, 10)) return `du ${jourEtMois(a)} ${a.slice(0, 4)}`;
  /* Le même mois ne se dit qu'une fois : « du 18 au 20 octobre 2026 ». */
  if (a.slice(0, 7) === b.slice(0, 7)) return `du ${jourEtMois(a).split(' ')[0]} au ${jourEtMois(b)} ${b.slice(0, 4)}`;
  return a.slice(0, 4) === b.slice(0, 4)
    ? `du ${jourEtMois(a)} au ${jourEtMois(b)} ${b.slice(0, 4)}`
    : `du ${jourEtMois(a)} ${a.slice(0, 4)} au ${jourEtMois(b)} ${b.slice(0, 4)}`;
}

/** CE QUE LE POINT COUVRE, pour le {{3}} du modèle et le message : « 6
    rituels, du 13 juin au 1er septembre 2026 ». « Factures » quand l'une
    n'est pas un rituel (une vente de produits). */
export function phraseDuPoint(pieces: readonly PieceDuPoint[]): string {
  const n = pieces.length;
  const mot = pieces.every((p) => !!p.apptId) ? (n > 1 ? 'rituels' : 'rituel') : (n > 1 ? 'factures' : 'facture');
  return `${n} ${mot}, ${etendueDite(pieces.map((p) => p.date))}`;
}
// ── FIN point

/** Les prénoms des têtes, chacun une fois, dans l'ordre des factures. */
export function prenomsDuPoint(pieces: readonly PieceDuPoint[], tetes: readonly TeteDuPoint[]): string[] {
  const vus: string[] = [];
  for (const p of pieces) {
    const t = tetes.find((x) => x.id === (p.forClientId ?? p.clientId));
    const prenom = (t?.name ?? '').trim().split(/\s+/)[0];
    if (prenom && !vus.includes(prenom)) vus.push(prenom);
  }
  return vus;
}

const enListe = (noms: readonly string[]): string =>
  noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms.join('');

/** LE MOT DU MESSAGE, dans la fenêtre de 24 heures. Aucun numéro de pièce
    (règle de la Maison) : le PDF les porte. Le payeur parmi les têtes lit «
    votre compte » ; un père qui ne vient pas lit « le compte de Merline et
    Djidjoho ». `quand` est le jour du point, dit avec son année. */
export function motDuPoint(o: {
  appel: string;
  quand: string;
  prenoms: readonly string[];
  payeurParmiLesTetes: boolean;
  phrase: string;
  totalDit: string;
  lien?: string;
  /** Le lien mène à la page « Régler » (KkiaPay), qui solde chaque facture. */
  enLigne?: boolean;
}): string {
  const deQui = o.payeurParmiLesTetes || o.prenoms.length === 0 ? 'de votre compte' : `du compte de ${enListe(o.prenoms)}`;
  return `Bonjour ${o.appel}, voici le point ${deQui} au ${o.quand} : ${o.phrase}, ${o.totalDit} à régler. Le détail est dans le document joint.${o.lien
    ? (o.enLigne
      ? `\nPour régler en une fois depuis votre téléphone (MTN, Moov, Celtiis ou carte), touchez ce lien :\n${o.lien}`
      : `\nPour régler en une fois par mobile money, tout réseau, touchez ce lien : votre téléphone compose le numéro de paiement, frais compris.\n${o.lien}`)
    : ''}`;
}

/** Le modèle Meta du point (à créer par la Maison) : document en tête, quatre
    variables, un bouton « Régler » (payer.html?tg={{1}}). */
export const MODELE_DU_POINT = 'point_du_compte';
/** Les quatre variables, dans l'ordre du modèle : l'appel, le jour du point, ce qu'il couvre, le total. */
export const variablesDuPoint = (appel: string, quand: string, phrase: string, totalDit: string): string[] =>
  [appel, quand, phrase, totalDit];

const chiffres = (s?: string): string => (s ?? '').replace(/\D/g, '');
/** LA CLÉ DE L'ENVOI : un jour, un numéro. Un double toucher n'envoie qu'une fois. */
export const cleDuPoint = (jourIso: string, numero: string | undefined): string =>
  `point-${jourIso}-${chiffres(numero)}`;
