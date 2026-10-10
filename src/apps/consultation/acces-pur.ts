/* L'ACCÈS À LA CONSULTATION, SES PASSAGES — 10 octobre 2026.

   Sortis de App.tsx pour que le harnais `verifie-revue-couronne-site` les
   éprouve seuls (revue de code du 10 octobre). Ce fichier est PUR.

   L'accès est PERSISTÉ (il survit au rechargement, voir App.tsx) :
   `consultationId` est tiré AVANT le paiement, c'est la référence que porte
   la transaction (`partnerId`) et l'identifiant de la ligne déposée. */

export type Reglement = 'kkiapay' | 'declare' | 'aucun';
export type Access = {
  paid: boolean; ref: string | null; at: string | null;
  consultationId: string | null; amountXof: number; reglement: Reglement;
};
export const ACCES_VIDE: Access = { paid: false, ref: null, at: null, consultationId: null, amountXof: 0, reglement: 'aucun' };

/** LE WIDGET A RENDU UNE RÉFÉRENCE : l'argent est parti. Elle est gardée
    AVANT la vérification du serveur. Jusqu'au 10 octobre, une vérification
    en échec laissait `ref` vide, et l'écran réoffrait « Payer avec
    KkiaPay » : un second clic rouvrait le widget, un second débit. */
export const accesApresLeWidget = (a: Access, consultationId: string, transactionId: string, at: string): Access =>
  ({ ...a, consultationId, ref: transactionId, at, reglement: 'kkiapay' });

/** CE QUE L'ÉCRAN D'ACCÈS OFFRE :
      · `regle`        : le serveur a dit reçu, rien à payer ;
      · `a-reverifier` : une référence sans verdict, on revérifie, JAMAIS on
                         ne repaie ;
      · `a-payer`      : rien n'est parti, le bouton de paiement. */
export type VoieDAcces = 'regle' | 'a-reverifier' | 'a-payer';
export const voieDAcces = (a: Access): VoieDAcces => (a.paid ? 'regle' : a.ref ? 'a-reverifier' : 'a-payer');

/** POURSUIVRE SANS VERDICT : la consultation continue, la Maison
    rapproche. Une référence déjà reçue du widget voyage avec elle : le
    serveur relira le paiement par `partnerId`. */
export const accesSansVerdict = (a: Access, consultationId: string, reglement: Reglement): Access =>
  (a.ref
    ? { ...ACCES_VIDE, consultationId, ref: a.ref, at: a.at, reglement: 'kkiapay' }
    : { ...ACCES_VIDE, consultationId, reglement });

/** LA CONSULTATION EST DÉPOSÉE : l'accès qui l'a portée est SCELLÉ (l'écran
    de bienvenue le relit), et l'accès persisté redevient vide. Jusqu'au 10
    octobre, il restait : un rechargement puis un nouveau rite réutilisaient
    le même `consultationId`, et l'upsert du serveur écrasait la première
    consultation (réponses, créneau, statut) en la remettant « nouvelle ». */
export const accesApresDepot = (a: Access): { scelle: Access; suivant: Access } =>
  ({ scelle: a, suivant: ACCES_VIDE });
