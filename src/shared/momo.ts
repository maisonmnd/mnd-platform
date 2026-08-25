/* ── LE PAIEMENT MOBILE, TEL QUE LE TÉLÉPHONE LE COMPREND ─────────────
   Leçon du 25 août, payée par un QR imprimé sur des factures et INUTILISABLE :
   un QR de paiement ne porte PAS un lien web. Il porte l'identifiant marchand
   que l'application MoMo reconnaît (« 506846@momopay ») — le même que l'affiche
   MTN du comptoir, celle qui marche. Scanné avec l'appareil photo, un lien
   ouvre une page ; scanné dans MoMo, il ne veut rien dire, et c'est là que la
   cliente le présente.

   Le montant, lui, ne tient pas dans cet identifiant : il s'écrit EN CLAIR à
   côté du code, et dans le code à composer. */

/** Le code USSD, montant compris : « *880*41*506846*montant# » → « …*75000# ».

    ON N'INVENTE JAMAIS UN CODE DE PAIEMENT. Si le modèle ne porte pas le mot
    « montant », on rend le code inchangé plutôt que de fabriquer une syntaxe
    que l'opérateur ne connaît pas — la cliente saisira la somme elle-même. */
export function ussdAvecMontant(ussd: string, montantXof?: number): string {
  const modele = (ussd ?? '').trim();
  if (!modele) return '';
  if (!montantXof || montantXof <= 0) return modele;
  if (!/montant/i.test(modele)) return modele;
  return modele.replace(/montant/gi, String(Math.round(montantXof)));
}

/** Un identifiant marchand MoMo est-il exploitable comme QR de paiement ?
    Un lien web n'en est pas un — c'est très exactement l'erreur à ne plus
    refaire, et ce garde-fou la rend impossible en silence. */
export const estIdentifiantMomo = (valeur: string): boolean => {
  const v = (valeur ?? '').trim();
  return v !== '' && !/^https?:\/\//i.test(v);
};
