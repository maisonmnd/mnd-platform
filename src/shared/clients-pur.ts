/* ══ LES PRÉDICATS DES CLIENTES, PURS — 27 octobre 2026 ══════════════════
   Sortis de `clients.ts` (qui tire la synchronisation) pour que la fonction
   serveur de l'Assistant Maison et la Cadence pure les lisent sans elle.
   `clients.ts` les réexporte : un seul juge, comme avant. */

/* ---------- Les clientes de passage ----------
   Un seul prédicat pour toute la Maison. Chaque écran qui compte des TÊTES
   (têtes couronnées, têtes actives, nouvelles du mois, audience d'une relance)
   passe par lui ; aucun écran qui compte de l'ARGENT ou du TRAVAIL ne le
   regarde — le rituel d'une passante vaut exactement celui d'une autre. */

export const estDePassage = (c: { dePassage?: boolean }): boolean => c.dePassage === true;

/** ELLE N'A PLUS DE LOCKS — rien à compter, rien à mesurer. */
export const aDefaitSesLocks = (c: { locksDefaits?: boolean }): boolean => c.locksDefaits === true;

/** LA DIASPORA — UN SEUL JUGE, ENFIN (16 août 2026).

    La notion vivait à DEUX endroits, et le commentaire de `dePassage`
    ci-dessus le disait déjà : le CHAMP `diaspora` (lu par les signaux de
    persona) et le SEGMENT « Diaspora » (lu par le registre des Clientes).
    Deux vérités pour une notion, donc un compteur qui annonçait « Diaspora 1 »
    pendant que la Maison en reconnaissait cinquante.

    Ici on lit LES DEUX et on ne casse rien : une fiche marquée d'un côté ou de
    l'autre est de la diaspora. Les nouveaux marquages écrivent le CHAMP —
    un segment se renomme et s'efface depuis une liste, et le prédicat
    casserait en silence.

    CE QUE ÇA COMMANDE : on ne prédit pas le retour de quelqu'un qui vit
    ailleurs. Elle vient quand elle est au pays ; sa cadence ne dit rien, et la
    relance qu'on lui envoie ne fait que noyer les vraies (demande de Yéman —
    la moitié de « celles qui ont glissé » était de la diaspora). */
export const estDiaspora = (c: { diaspora?: boolean; segments?: readonly string[] }): boolean =>
  c.diaspora === true || (c.segments ?? []).some((s) => s.trim().toLowerCase() === 'diaspora');

/** Le nombre de mois sans venir au-delà duquel la Maison cesse d'attendre.
    Un seul endroit le porte : cinq écrans qui écriraient « 5 » chacun de leur
    côté finiraient par en porter trois différents. */
export const MOIS_AVANT_SORTIE = 5;

/** LA DATE D'IL Y A N MOIS, EN MOIS DE CALENDRIER — jamais en 150 jours.

    Le 31 mars moins un mois donne le 28 février, jamais le 3 mars : sans ce
    plafond, JavaScript déborde sur le mois suivant et la règle se déclenche
    trois jours trop tôt une fois sur douze. Dates LOCALES, comme partout dans
    la Maison — à Cotonou la nuit comptable ne se coupe pas en deux. */
export const moisAvant = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  const cible = new Date(y, (m - 1) - n, 1);
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate();
  const jour = Math.min(d, dernierJour);
  const mm = String(cible.getMonth() + 1).padStart(2, '0');
  return `${cible.getFullYear()}-${mm}-${String(jour).padStart(2, '0')}`;
};

/** ELLE DORT — plus de cinq mois sans s'asseoir, et elle n'est pas d'ailleurs.

    STRICTEMENT PLUS : à cinq mois pile, elle n'est pas encore sortie. « Plus
    de 5 mois » se lit comme la Maison le dit, et une règle qui sortirait une
    tête le jour anniversaire de sa dernière venue surprendrait.

    SANS DERNIÈRE VENUE, RIEN NE DORT : une fiche qui ne s'est jamais assise
    est une VISITEUSE, elle a son propre registre. Lui appliquer les cinq mois
    la ferait sortir d'une maison où elle n'est jamais entrée. */
export const dortDepuisLongtemps = (
  c: { diaspora?: boolean; segments?: readonly string[] },
  derniereVenue: string | undefined,
  aujourdhui: string,
  mois: number = MOIS_AVANT_SORTIE,
): boolean => {
  if (!derniereVenue) return false;
  if (estDiaspora(c)) return false;
  return derniereVenue < moisAvant(aujourdhui, mois);
};
