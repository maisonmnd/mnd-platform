import type { Invoice } from './finance';
import { FUSEAU_DU_SALON, heureDuMessage } from './salle-des-envois';

/* ══ UNE PIÈCE, UN SEUL WHATSAPP — 1er novembre 2026 ═════════════════════
   LE FAIT, relu dans la base. Le 31 octobre 2026, la pièce 0166 est partie
   à 14 h 37 depuis un poste (le rituel honoré, `facture_du_rituel`, le PDF,
   une clé `facture-<id>-modele`). À 22 h 08, un AUTRE poste a encaissé le
   même rendez-vous : le reçu `recu_de_paiement` est reparti au même numéro,
   avec LE MÊME PDF, sans aucune clé d'unicité. La règle « argent
   d'aujourd'hui, rituel d'aujourd'hui » était vraie ; rien ne savait que le
   papier était déjà chez elle.

   SA RÈGLE (1er novembre 2026, 0 h 14) : « Il faut interdire plusieurs
   WhatsApp sur les mêmes rituels ou les mêmes rappels. Quand c'est parti une
   fois, même quand on retouche, terminer, plus d'envoi. »

   LECTURE : le papier d'une pièce ne part qu'une fois vers la cliente, tout
   seul. Une fois la facture (ou le reçu) partie, aucun geste du comptoir
   (encaisser, terminer, honorer, retoucher, le tableau de bord) ne renvoie
   ce papier. Seul le bouton exprès « Renvoyer » le peut, et il dit que c'est
   déjà parti.

   DEUX VERROUS, PAS UN. ① La pièce porte sa marque (`Invoice.whatsapp`) :
   un poste qui la lit refuse avant même de préparer le PDF. ② Le serveur
   `whatsapp-envoi` tient UNE clé par pièce (`CLE_DE_LA_PIECE`), quel que
   soit le modèle et quelle que soit l'étape : le poste qui n'a pas encore
   reçu la marque par la synchro se heurte à la clé, reçoit `deja: true`, et
   apprend ainsi que c'est parti d'ailleurs. Les étapes refusées par Meta
   rendent la clé (le serveur la passe « non-remis », donc reprenable), et
   la fenêtre fermée se juge AVANT la réservation : mot, puis modèle, puis
   lien marchent toujours en chaîne sur la même clé.

   EXCEPTION GARDÉE : le reçu d'un règlement EN LIGNE (elle paie depuis son
   téléphone par « Régler ») garde sa clé `recu-en-ligne-<règlement>` : c'est
   la réponse à SON geste, pas une retouche du comptoir. Il pose la marque
   lui aussi, pour que le comptoir ne renvoie plus rien après.

   LE FOYER ET LE POINT (relecture du 1er novembre 2026) : « Terminer les
   séances de N. et A. · une facture du foyer » retire les factures déjà
   parties seules (sa règle : terminer ne renvoie rien) ; le bouton d'après
   coup « Envoyer la facture du foyer », geste exprès, les garde. Le point du
   compte, geste exprès qui résume tout ce qui reste dû, ne regarde pas les
   marques. Et la migration 0150 pose la marque locale, jamais la clé serveur
   `piece-<id>` : pour une pièce partie avant elle, seul le premier verrou
   tient, le jour de la migration, sur un poste pas encore resynchronisé.

   Ce fichier est pur : ni React, ni magasin ; le banc l'importe tel quel. */

/** LA clé d'unicité serveur de tout envoi automatique du papier d'une pièce. */
export const CLE_DE_LA_PIECE = (pieceId: string): string => `piece-${pieceId}`;

/** Le bouton exprès « Renvoyer » : une clé à la minute, pour qu'un double
    toucher n'envoie qu'une fois, mais qu'un renvoi voulu passe. */
export const CLE_DE_RENVOI = (pieceId: string, instantIso: string): string =>
  `piece-${pieceId}-renvoi-${instantIso.slice(0, 16)}`;

/** Le papier du foyer n'est pas un modèle Meta (il voyage sous
    `facture_du_rituel`, « du foyer ci-jointe ») : la marque dit ce qui est
    parti, pas le nom du modèle. */
export const PAPIER_DU_FOYER = 'facture_du_foyer';

/** La marque posée sur la pièce quand son papier est parti. `dAilleurs` : un
    autre poste l'avait envoyé, celui-ci l'a appris par la clé du serveur. */
export type PiecePartie = { partieLe: string; modele: string; parQui?: string; dAilleurs?: true };

export const pieceDejaPartie = (p: Pick<Invoice, 'whatsapp'>): boolean => !!p.whatsapp?.partieLe;

/** Pose la marque. LA PREMIÈRE FOIS FAIT FOI : une marque déjà là reste,
    sauf si la nouvelle dit un départ PLUS ANCIEN (la clé du serveur rend
    l'instant du vrai premier envoi, qu'un poste en retard ignorait). */
export function marqueLaPiecePartie<P extends Pick<Invoice, 'whatsapp'>>(p: P, info: PiecePartie): P {
  const ancienne = Date.parse(p.whatsapp?.partieLe ?? '');
  const nouvelle = Date.parse(info.partieLe);
  if (Number.isFinite(ancienne) && !(nouvelle < ancienne)) return p;
  return {
    ...p,
    whatsapp: {
      partieLe: info.partieLe,
      modele: info.modele,
      ...(info.parQui ? { parQui: info.parQui } : {}),
      ...(info.dAilleurs ? { dAilleurs: true as const } : {}),
    },
  };
}

export type DecisionDEnvoi = { envoie: false; motif: string } | { envoie: true; cle: string };

/** La décision, AVANT de préparer quoi que ce soit (attente Tap & Go, PDF).
    Une pièce JAMAIS partie prend la clé de la pièce, quel que soit le geste :
    le bouton « Envoyer la facture sur son WhatsApp » passe `renvoi` même la
    première fois (Carnet, encaissement), et ce premier envoi doit réserver
    `piece-<id>` au serveur, sinon un second poste en retard de synchro
    repartirait sur une clé libre (le cas de la pièce 0166, à l'envers ;
    relecture du 1er novembre 2026). Une pièce partie : le renvoi exprès prend
    sa clé à la minute ; tout geste automatique est refusé et dit depuis quand. */
export function decisionDEnvoi(o: { piece: Pick<Invoice, 'id' | 'whatsapp'>; geste: 'auto' | 'renvoi'; instant: string }): DecisionDEnvoi {
  if (!pieceDejaPartie(o.piece)) return { envoie: true, cle: CLE_DE_LA_PIECE(o.piece.id) };
  if (o.geste === 'renvoi') return { envoie: true, cle: CLE_DE_RENVOI(o.piece.id, o.instant) };
  return { envoie: false, motif: `déjà ${ditLaPiecePartie(o.piece)}` };
}

/** CE QUE « deja » VEUT DIRE (1er novembre 2026). Le serveur rend `deja` dès
    que la clé est prise, même quand l'autre poste attend encore la réponse de
    Meta (réservation « en-route », sans waId, moins de cinq minutes). Si Meta
    refuse ensuite, la clé est rendue et RIEN n'est parti : marquer la pièce
    sur ce `deja` ferait croire à un papier qui n'existe pas, et plus aucun
    geste ne l'enverrait. Seul un `deja` qui porte le waId du premier envoi
    dit que le papier est chez elle ; celui-ci dit « rien n'est su ». */
export const enRouteAilleurs = (r: { deja?: true; waId?: string }): boolean => !!r.deja && !r.waId;

/** « partie sur son WhatsApp le 31 octobre 2026 à 14 h 37 » : l'année sur la
    date (règle de la Maison), l'heure du salon, jamais celle de Greenwich. */
export function ditLaPiecePartie(p: Pick<Invoice, 'whatsapp'>, fuseau: string = FUSEAU_DU_SALON): string {
  const t = new Date(p.whatsapp?.partieLe ?? '');
  if (!Number.isFinite(t.getTime())) return 'partie sur son WhatsApp';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: fuseau, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(t);
  } catch {
    return `partie sur son WhatsApp le ${t.toISOString().slice(0, 10)}`;
  }
  const lit = (type: Intl.DateTimeFormatPartTypes): string => parts.find((x) => x.type === type)?.value ?? '';
  const jour = `${Number(lit('day'))} ${lit('month')} ${lit('year')}`;
  return `partie sur son WhatsApp le ${jour} à ${heureDuMessage(`${lit('hour')}:${lit('minute')}`)}`;
}
