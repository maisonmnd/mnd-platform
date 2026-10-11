/* LA PORTE D'UNE OFFRE — sortie de l'îlot des offres le 11 octobre 2026,
   pour que la carte des offres et la remise qui revient au défilement
   mènent au même endroit, par la même règle. Module pur : ni React, ni
   base ; la construction le lit aussi (statique.tsx). */

/* LE PARCOURS D'UNE OFFRE CHOISIT SON BOUTON ET SA PORTE — 22 septembre 2026.
   Comme les cinq portes de l'accueil : un entretien se réserve en ligne, tout
   le reste passe par le rappel, parce qu'une création ou une réparation
   commence par une consultation, qui se prend de vive voix. */
export const PARCOURS: Record<string, { sur: string; bouton: string; porte: 'reserver' | 'rappel' }> = {
  creation: { sur: 'Première Couronne', bouton: 'Réserver ma consultation', porte: 'rappel' },
  reparation: { sur: 'Réparation', bouton: 'Faire diagnostiquer ma couronne', porte: 'rappel' },
  entretien: { sur: 'Entretien', bouton: 'Réserver mon entretien', porte: 'reserver' },
  enfant: { sur: 'MND Kids', bouton: 'Organiser notre visite', porte: 'rappel' },
  formation: { sur: 'Formations', bouton: 'Voir le programme', porte: 'rappel' },
};

/* LA PORTE SE DIT DEPUIS LA RACINE DU SITE, JAMAIS EN RELATIF — 24 septembre
   2026, « quand on appuie le bouton J'en profite ce n'est branché à rien »
   (Yéman).

   Ce n'était pas un bouton sans destination, c'était une destination fausse,
   et seulement sur l'accueil. L'îlot écrivait `../reserver/`. Depuis
   /revelateur/les-offres/, ce chemin tombe juste ; depuis /revelateur/, il
   remonte d'un cran de trop et sort du site, sur une page qui répond 404.
   UN ÎLOT NE CONNAÎT PAS LA PROFONDEUR DE LA PAGE QUI LE MONTE : le même
   composant sert l'accueil et la page des offres, donc aucun `../` ne peut
   être juste pour les deux. D'où `base()`, comme Contact, Demande et Joindre,
   qui lit la base posée à la construction.

   Et comme l'îlot se monte par script, son lien n'existe dans aucun HTML
   généré : le harnais, qui lit les pages servies, ne pouvait pas l'attraper.
   Il lit désormais la SOURCE des îlots pour cette règle-là. */
const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/* SANS PARCOURS, LE CALENDRIER : il pose lui-même la porte quand le besoin
   est inconnu (Reserver.tsx), donc aucune impasse. */
export const laPorte = (o: { parcours?: string; code?: string }): string => {
  const p = o.parcours ? PARCOURS[o.parcours] : undefined;
  /* LE BOUTON EMPORTE LE CODE — 24 septembre 2026. « Du coup le code se
     remplit automatiquement lors de la réservation » (Yéman) : c'est cette
     adresse qui le porte. Une cliente qui arrive autrement le tape, il est
     écrit en toutes lettres sur la carte juste au-dessus. */
  const code = o.code ? `&code=${encodeURIComponent(o.code)}` : '';
  if (!p) return base(`/reserver/?besoin=inconnu${code}`);
  return base(`/${p.porte}/?besoin=${o.parcours}${code}`);
};
