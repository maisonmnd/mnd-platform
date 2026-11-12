import { asset } from '../../../../shared/asset';
import { useBranch } from '../../../../shared/branches';
import { useStore } from '../../../../shared/store';
import { autoConfigStore, MOMO_MARCHAND_DEFAUT, MOMO_USSD_DEFAUT, REVIEW_LINK_DEFAUT } from '../equipe/data';

/* ══ LES LIENS DES QR CODES, UNE SEULE SOURCE — 12 novembre 2026 ═════════
   « Ajoute dans les liens la liste des liens des QR codes » (Yéman). Ces
   adresses vivaient dans `QrCodes.tsx` ; la fenêtre des liens à envoyer
   (`shell/LiensAEnvoyer.tsx`) les donne à son tour. Deux calculs d'une même
   adresse finiraient par diverger : elles sont sorties ici, et les deux
   écrans les lisent.

   Le wifi et le code du jour n'ont PAS de lien, et ce n'est pas un oubli
   (18 août 2026) : le mot de passe du wifi s'affiche au comptoir le temps
   d'un scan, alors qu'un lien se transfère et reste dans une conversation ;
   le code du jour sert à pointer, et un lien qui pointe pour vous n'est plus
   une preuve de présence.

   L'adresse se construit sur l'origine COURANTE : jamais de domaine écrit en
   dur, changer de compte ne casse rien. */

/** Ma Couronne : sœur du Trône, sous /couronne/ en ligne, à la racine en développement. */
export const lienMaCouronne = () =>
  `${window.location.origin}${window.location.pathname.startsWith('/trone') ? '/couronne/' : '/couronne.html'}`;

export type LiensDesQrCodes = {
  /** Le QR fixe du comptoir « Régler par MTN » (11 novembre 2026). */
  lienComptoirMtn: string;
  /** La page payer.html au marchand ; ne s'envoie que si `codeMarchand` est lu. */
  lienMomo: string;
  codeMarchand: string;
  momoUssd: string;
  momoMarchand: string;
  lienSite: string;
  lienCarte: string;
  lienPlan: string;
  /** Le lien de la fiche Google (la porte), et non le centre de la ville. */
  planPrecis: boolean;
  adresseComplete: string;
  lienCouronne: string;
  lienAvis: string;
  lienAcademie: string;
};

export function useLiensDesQrCodes(): LiensDesQrCodes {
  const [autoRaw] = useStore(autoConfigStore);
  const { branch } = useBranch();
  const momoUssd = autoRaw.momoUssd || MOMO_USSD_DEFAUT;
  const momoMarchand = autoRaw.momoMarchand || MOMO_MARCHAND_DEFAUT;
  const lienAvis = (autoRaw.reviewLink || REVIEW_LINK_DEFAUT).trim();

  const lienAbsolu = (chemin: string) => new URL(asset(chemin), window.location.href).href;
  /* LE CODE MARCHAND SE LIT DANS LE CODE USSD — il n'a pas de champ à lui, et
     lui en inventer un ferait deux vérités à tenir d'accord. Dans
     « *880*41*909099*montant# », c'est le dernier groupe de chiffres : le
     préfixe de l'opérateur passe avant, le montant vient après. */
  const codeMarchand = (momoUssd.match(/\d{4,}/g) ?? []).slice(-1)[0] ?? '';
  const momo = new URL(lienAbsolu('payer.html'));
  if (momoMarchand) momo.searchParams.set('m', momoMarchand);
  momo.searchParams.set('c', codeMarchand);

  /* LE QR DU COMPTOIR « RÉGLER PAR MTN » — 11 novembre 2026 : un QR FIXE,
     la page Régler en mode comptoir ; la cliente tape son numéro MTN et
     retrouve son rendez-vous du jour. Ni montant ni numéro dans le carré. */
  const lienComptoirMtn = `${lienAbsolu('regler.html')}?comptoir`;

  const adresseComplete = [branch.address, branch.city, branch.country].filter(Boolean).join(', ');
  /* LE LIEN DE LA FICHE PRIME SUR L'ADRESSE ÉCRITE — 18 août 2026. Chercher
     « Cotonou, Bénin » posait le point au centre de la ville : une cliente qui
     suit ce carré arrive dans le bon quartier et cherche encore. Le lien court
     de la fiche Google, lui, désigne la porte. L'adresse reste le repli quand
     aucun lien n'est saisi — mieux vaut la ville que rien. */
  const lienPlan = branch.mapsUrl?.trim()
    || (adresseComplete ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresseComplete)}` : '');

  /* LA CARTE DU COMPTOIR — construite sur l'origine COURANTE, jamais un
     domaine en dur : elle vit sous /trone/ en ligne, à la racine en
     développement. Changer de compte GitHub ne doit rien casser. */
  const lienCarte = new URL(`${window.location.pathname.includes('/trone') ? '/trone/' : '/'}carte.html`, window.location.origin).href;

  /* LE SITE PUBLIC — 23 septembre 2026. La RACINE du domaine, pas
     /revelateur/ : elle y renvoie d'elle-même, et c'est la valeur la plus
     courte, donc le carré le plus lisible une fois imprimé. En développement
     le site vit à côté, sous son nom de fichier. */
  const lienSite = new URL(
    window.location.pathname.includes('/trone') ? '/' : '/revelateur.html',
    window.location.origin,
  ).href;

  /* LE SITE DE L'ACADÉMIE — 17 septembre 2026. Sœur du Trône, donc adresse
     voisine : sous /trone/ en ligne, à la racine en développement. */
  const lienAcademie = new URL(
    `${window.location.pathname.includes('/trone') ? '/academie/' : '/academie.html'}`,
    window.location.origin,
  ).href;

  return {
    lienComptoirMtn,
    lienMomo: momo.href, codeMarchand, momoUssd, momoMarchand,
    lienSite, lienCarte, lienPlan, planPrecis: !!branch.mapsUrl?.trim(), adresseComplete,
    lienCouronne: lienMaCouronne(), lienAvis, lienAcademie,
  };
}
