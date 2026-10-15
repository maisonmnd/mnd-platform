/* ══ L'ACCUSÉ D'UNE DEMANDE DU SITE — 15 octobre 2026 ═══════════════════
   « Pour votre enfant, vous préférez qu'on vous appelle : voilà le message
   que je reçois en WhatsApp… il n'est pas adapté à la demande du client »
   (Yéman). Le formulaire du rappel part en genre « rdv » SANS place ; le
   serveur prenait alors le modèle d'une place (`demande_recue`, approuvé
   chez Meta sous la forme « votre demande de rendez-vous pour le {{2}}…
   votre créneau ») avec {{2}} = « un rendez-vous » : « pour le un
   rendez-vous ».

   TROIS ACCUSÉS, TROIS MODÈLES, JAMAIS L'UN POUR L'AUTRE :
   · une place POSÉE : la confirmation (`confirmation_rdv`) ;
   · une place demandée que le verrou n'a pas posée : `demande_recue`, avec
     le jour et l'heure, la seule phrase qu'il sait dire ;
   · une demande SANS place (un rappel, une carte, un diagnostic, une
     testeuse) : `demande_recue_simple` (« votre demande ({{2}}) »), et rien
     d'autre. Tant que son secret n'est pas posé, RIEN NE PART : la page a
     déjà dit « Merci. Nous vous rappelons », un mot faux vaut moins que
     pas de mot.

   `demande-submit` RECOPIE le bloc entre ses repères (une fonction Edge
   n'importe rien du dépôt) ; `verifie-l-accuse-du-site` les confronte
   caractère pour caractère. On corrige ici, puis on recopie le bloc entier. */
/* ⟨accuse-du-site⟩ */
/** Le {{2}} d'une demande sans place : ce qu'elle a demandé, dit à elle. */
export const POUR_LE_RAPPEL: Record<string, string> = {
  creation: 'un rappel pour créer votre couronne',
  reparation: 'un rappel pour réparer votre couronne',
  entretien: 'un rappel pour entretenir votre couronne',
  enfant: 'un rappel pour votre enfant',
  formation: 'un rappel pour apprendre le métier',
};
export const quandDeLaDemande = (profil: string, besoin: string): string =>
  profil === 'Carte cadeau' ? 'une carte cadeau'
    : profil === 'Diagnostic locks' ? 'votre routine locks'
      : profil === 'Testeuse' ? 'votre inscription comme testeuse'
        : POUR_LE_RAPPEL[besoin] ?? 'un rappel de la Maison';

export type GenreDAccuse = 'confirmation' | 'demande-de-place' | 'rappel';
export const genreDAccuse = (o: { pose: boolean; avecPlace: boolean }): GenreDAccuse =>
  o.pose ? 'confirmation' : o.avecPlace ? 'demande-de-place' : 'rappel';

/** Le modèle Meta de chaque accusé. '' : aucun modèle juste, rien ne part. */
export const modeleDeLAccuse = (
  genre: GenreDAccuse,
  secrets: { conf?: string; accuse?: string; simple?: string },
): string =>
  genre === 'confirmation' ? (secrets.conf || 'confirmation_rdv')
    : genre === 'demande-de-place' ? (secrets.accuse || 'demande_recue')
      : (secrets.simple || '');

/** Ce que le fil des Conversations montre : le texte du modèle, rempli. */
export const texteDeLAccuse = (genre: GenreDAccuse, appel: string, quand: string): string =>
  genre === 'confirmation'
    ? `Bonjour ${appel}, c'est confirmé : votre rendez-vous est retenu ${quand}. Nous vous attendons. Merci de nous prévenir en cas d'empêchement.`
    : genre === 'demande-de-place'
      ? `Bonjour ${appel}, la Maison MND a bien reçu votre demande de rendez-vous pour le ${quand}. Nous vous confirmerons très prochainement votre créneau sur ce même numéro.`
      : `Bonjour ${appel}, la Maison MND a bien reçu votre demande (${quand}). Nous vous répondons très vite, sur ce numéro.`;
/* ⟨/accuse-du-site⟩ */
