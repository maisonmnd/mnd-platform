/* ══ LES LIENS À ENVOYER — 12 novembre 2026 ══════════════════════════════
   « Une cliente voudrait passer au salon et voudrait le lien pour réserver »,
   puis « peux-tu designer quelque part dans le Trône où j'accède rapidement
   à ces liens que je peux envoyer par WhatsApp app directement », puis
   « rajouter à côté de WhatsApp, app aussi » (Yéman).

   Maquette `public/maquette-les-liens-a-envoyer.html`, tranchée au
   sélecteur le 12 novembre 2026 : la fenêtre s'ouvre depuis le menu Créer et
   depuis la fiche d'une cliente ; elle donne les cinq parcours du site et
   l'itinéraire ; chaque lien part avec une phrase d'accueil et une phrase de
   suite ; deux portes côte à côte, « WhatsApp » (Conversations, le numéro de
   la Maison) et « App » (l'application de l'appareil).

   CE N'EST PAS LE LIEN PRÉPARÉ de Conversations (`lien-reservation.ts`) :
   celui-là coche des gestes et un calibre, et part par un modèle approuvé.
   Ici, l'adresse publique d'un parcours, rien de plus.

   PUR, SANS IMPORT, ET SANS NOM DE DOMAINE : l'adresse du site est DONNÉE
   (l'origine du Trône), jamais écrite ici. Le banc
   `scripts/verifie-les-liens-a-envoyer.mjs` l'éprouve contre le site : les
   parcours que la page de réservation sait lire, la page /venir/. */

export type CleDuLien = 'tout' | 'creation' | 'reparation' | 'entretien' | 'enfant' | 'venir';

export type LienAEnvoyer = {
  cle: CleDuLien;
  /** Le titre du groupe dans la fenêtre. */
  groupe: string;
  nom: string;
  /** Une ligne pour la main qui choisit. */
  sous: string;
  /** Le chemin sur le site, relatif à sa racine. */
  chemin: string;
  /** Ce que le message annonce : « voici <objet> : ». */
  objet: string;
  /** La phrase qui suit le lien. */
  suite: string;
};

const SUITE_DE_LA_RESERVATION = 'La confirmation arrive ensuite sur WhatsApp.';

export const LIENS_A_ENVOYER: readonly LienAEnvoyer[] = [
  {
    cle: 'tout', groupe: 'Réserver', nom: 'La réservation', sous: 'elle choisit son parcours sur le site',
    chemin: 'reserver/',
    objet: 'le lien pour réserver à la Maison MND',
    suite: `Vous y choisissez votre parcours, votre jour et votre heure. ${SUITE_DE_LA_RESERVATION}`,
  },
  {
    cle: 'creation', groupe: 'Les consultations', nom: 'Consultation Première Couronne', sous: 'créer ses premières locks',
    chemin: 'reserver/?besoin=creation',
    objet: 'le lien pour réserver votre consultation Première Couronne à la Maison MND',
    suite: `Vous y choisissez votre jour et votre heure. ${SUITE_DE_LA_RESERVATION}`,
  },
  {
    cle: 'reparation', groupe: 'Les consultations', nom: 'Consultation Réparation', sous: 'des locks à restaurer',
    chemin: 'reserver/?besoin=reparation',
    objet: 'le lien pour réserver votre consultation Réparation à la Maison MND',
    suite: `Vous y choisissez votre jour et votre heure. ${SUITE_DE_LA_RESERVATION}`,
  },
  {
    cle: 'entretien', groupe: 'Les soins', nom: 'Entretien', sous: 'des locks déjà suivies',
    chemin: 'reserver/?besoin=entretien',
    objet: 'le lien pour réserver votre entretien à la Maison MND',
    suite: `Vous y choisissez vos soins, votre jour et votre heure. ${SUITE_DE_LA_RESERVATION}`,
  },
  {
    cle: 'enfant', groupe: 'Les soins', nom: 'MND Kids', sous: 'le rendez-vous d’un enfant',
    chemin: 'reserver/?besoin=enfant',
    objet: 'le lien pour réserver le rendez-vous MND Kids de votre enfant',
    suite: `Vous y choisissez son jour et son heure. ${SUITE_DE_LA_RESERVATION}`,
  },
  {
    cle: 'venir', groupe: 'Pour venir', nom: 'L’itinéraire', sous: 'Google Maps, jusqu’à la porte du salon',
    /* La page du site qui ouvre Google Maps sur la porte : la même que le
       geste « Itinéraire » de Conversations (29 octobre 2026). */
    chemin: 'venir/',
    objet: 'le chemin pour venir à la Maison MND',
    suite: 'La page ouvre Google Maps sur notre porte.',
  },
];

/** Les groupes, dans l'ordre de la fenêtre. */
export const GROUPES_DES_LIENS: readonly string[] = [...new Set(LIENS_A_ENVOYER.map((l) => l.groupe))];

export const lienAEnvoyer = (cle: CleDuLien): LienAEnvoyer =>
  LIENS_A_ENVOYER.find((l) => l.cle === cle) ?? LIENS_A_ENVOYER[0];

/** L'adresse complète, depuis la racine du site (`https://…/`). */
export function adresseDuLienAEnvoyer(site: string, cle: CleDuLien): string {
  return new URL(lienAEnvoyer(cle).chemin, site.endsWith('/') ? site : `${site}/`).href;
}

/** Le message : l'appel facultatif (sans lui, « Bonjour, », jamais un
    « Madame » supposé), ce qu'on envoie, le lien sur sa ligne, la suite. Sans
    la signature : le Trône la pose, une seule fois, par `signeLeMessage`. */
const compose = (objet: string, lien: string, suite: string, appel: string): string => {
  const a = appel.replace(/\s+/g, ' ').trim();
  return `Bonjour${a ? ` ${a}` : ''}, voici ${objet} :\n${lien}\n${suite}`;
};

/** Le message d'un lien du site, prêt à partir. */
export function messageDuLienAEnvoyer(site: string, cle: CleDuLien, appel = ''): string {
  const l = lienAEnvoyer(cle);
  return compose(l.objet, adresseDuLienAEnvoyer(site, cle), l.suite, appel);
}

/* ══ LES LIENS DES QR CODES — 12 novembre 2026 ═══════════════════════════
   « Ajoute dans les liens la liste des liens des QR codes » (Yéman). Les
   codes de la page QR codes qui ont un lien à envoyer, dans le même ordre.
   Leurs ADRESSES ne s'écrivent pas ici : le Trône les calcule à un seul
   endroit (`routes/clients/liens-des-qr-codes.ts`), pour la page QR codes et
   pour cette fenêtre. Ici, seulement leurs mots.
   Le wifi et le code du jour n'y sont pas, exprès (18 août 2026) : un mot de
   passe et un code de pointage ne voyagent pas dans une conversation. */

export type CleDuQr = 'mtn' | 'kkiapay' | 'momo' | 'site' | 'carte' | 'plan' | 'couronne' | 'avis' | 'academie';
export type LienDuQr = { cle: CleDuQr; nom: string; sous: string; objet: string; suite: string };

export const GROUPE_DES_QR_CODES = 'Les liens des QR codes';

const REGLER = 'Saisissez le montant en francs, puis validez sur votre téléphone.';

export const LIENS_DES_QR_CODES: readonly LienDuQr[] = [
  { cle: 'mtn', nom: 'Payer par MTN', sous: 'son numéro MTN, son rendez-vous du jour',
    objet: 'le lien pour régler par MTN', suite: 'Tapez votre numéro MTN : votre rendez-vous s’affiche. Validez ensuite sur votre téléphone, sans frais pour vous.' },
  { cle: 'kkiapay', nom: 'Payer par KkiaPay', sous: 'tous réseaux, avec l’appareil photo',
    objet: 'le lien pour régler par KkiaPay', suite: `MTN MoMo, Moov Money ou Celtiis Cash. ${REGLER}` },
  { cle: 'momo', nom: 'Payer par MoMoPay', sous: 'MTN seulement',
    objet: 'le lien pour régler par MoMo', suite: REGLER },
  { cle: 'site', nom: 'Le site de la Maison', sous: 'nos gestes, nos parcours, le rendez-vous',
    objet: 'le site de la Maison MND', suite: 'Nos gestes, nos parcours, et la prise de rendez-vous.' },
  { cle: 'carte', nom: 'La carte des prix', sous: 'rituels, formules et gamme, au franc près',
    objet: 'la carte de la Maison MND', suite: 'Tous nos rituels et nos formules, à jour au franc près.' },
  { cle: 'plan', nom: 'Nous trouver', sous: 'la Maison sur Google Maps',
    objet: 'la Maison MND sur Google Maps', suite: 'Google Maps vous guide jusqu’à nous.' },
  { cle: 'couronne', nom: 'Ma Couronne', sous: 'son application : rendez-vous, parcours, Cercle',
    objet: 'Ma Couronne, votre espace à la Maison MND', suite: 'Créez votre compte, puis « Ajouter à l’écran d’accueil » l’installe comme une application.' },
  { cle: 'avis', nom: 'Un avis Google', sous: 'le formulaire d’avis s’ouvre directement',
    objet: 'le lien pour laisser un avis à la Maison MND', suite: 'Si le cœur vous en dit, deux phrases nous aident beaucoup. Merci pour votre passage.' },
  { cle: 'academie', nom: 'Académie MND', sous: 'neuf parcours, leurs prix et la réservation',
    objet: 'l’Académie MND, qui forme au métier du lock', suite: 'Neuf parcours sur des têtes réelles à Cotonou : le programme, les prix et l’inscription.' },
];

export const lienDuQr = (cle: CleDuQr): LienDuQr =>
  LIENS_DES_QR_CODES.find((l) => l.cle === cle) ?? LIENS_DES_QR_CODES[0];

/** Le message d'un lien des QR codes, l'adresse DONNÉE par le Trône. */
export function messageDuLienDuQr(cle: CleDuQr, lien: string, appel = ''): string {
  const l = lienDuQr(cle);
  return compose(l.objet, lien, l.suite, appel);
}
