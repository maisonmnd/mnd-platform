/* LE LIEN DE RÉSERVATION PRÉPARÉ — 28 septembre 2026. « J'aimerais envoyer
   un lien de réservation avec les services présélectionnés pour que la
   cliente finalise elle-même son rendez-vous » (Yéman).

   La Maison choisit au Trône les gestes (et, si elle le sait, le calibre) ;
   le lien ouvre la page de réservation du site avec ces gestes déjà cochés,
   le calibre déjà dit : la cliente n'a plus qu'à prendre son jour, son heure
   et laisser son numéro. Les prix restent ceux du site, calculés au calibre.

   L'ADRESSE EST LE CONTRAT ENTRE LES DEUX RIVES : `besoin`, `gestes` (les
   identifiants du catalogue, séparés par des virgules), `calibre` (l'identi-
   fiant de tranche). Ce fichier l'écrit ET la lit, pour que le Trône et le
   site ne puissent pas en diverger ; `verifie-lien-reservation` l'éprouve. */

export type BesoinDuLien = 'entretien' | 'creation' | 'reparation' | 'enfant';
export type LienPrepare = { besoin: BesoinDuLien; gestes: string[]; calibre?: string };

const ID_SUR = /^[A-Za-z0-9_-]{1,80}$/;
const BESOINS: readonly BesoinDuLien[] = ['entretien', 'creation', 'reparation', 'enfant'];

/** Le lien, depuis l'adresse du site (`https://maisonmnd.com/`). */
export function lienDeReservation(site: string, l: LienPrepare): string {
  const u = new URL('reserver/', site.endsWith('/') ? site : `${site}/`);
  u.searchParams.set('besoin', l.besoin);
  const gestes = l.gestes.filter((g) => ID_SUR.test(g));
  if (gestes.length) u.searchParams.set('gestes', gestes.join(','));
  if (l.calibre && ID_SUR.test(l.calibre)) u.searchParams.set('calibre', l.calibre);
  return u.href;
}

/* LE JETON DU MODÈLE META — 28 septembre 2026. Le bouton du modèle
   `reservation_preparee` a une URL fixe, `https://maisonmnd.com/reserver/?r=`,
   à laquelle Meta ajoute UNE variable. Des `&` et des virgules risqueraient
   d'y être encodés : la variable est donc un seul mot, fait de caractères
   qu'aucune adresse ne réécrit. Forme : `besoin.geste~geste~geste.calibre`
   (le calibre peut manquer). */
export function jetonDuLien(l: LienPrepare): string {
  const gestes = l.gestes.filter((g) => /^[A-Za-z0-9_-]{1,80}$/.test(g));
  return [l.besoin, gestes.join('~'), l.calibre && ID_SUR.test(l.calibre) ? l.calibre : ''].join('.').replace(/\.$/, '');
}
export const URL_DU_MODELE = 'https://maisonmnd.com/reserver/?r=';

/** Ce que l'adresse d'une page de réservation prépare. Tout ce qui n'a pas
    la forme d'un identifiant est écarté, jamais interprété. */
export function lienLu(recherche: string): { gestes: string[]; calibre: string } {
  try {
    const p = new URLSearchParams(recherche);
    const r = p.get('r');
    if (r) {
      const [, gestesBruts = '', cal = ''] = r.split('.');
      const gestes = [...new Set(gestesBruts.split('~').filter((g) => ID_SUR.test(g)))];
      return { gestes, calibre: ID_SUR.test(cal) ? cal : '' };
    }
    const gestes = [...new Set((p.get('gestes') ?? '').split(',').map((g) => g.trim()).filter((g) => ID_SUR.test(g)))];
    const calibre = p.get('calibre') ?? '';
    return { gestes, calibre: ID_SUR.test(calibre) ? calibre : '' };
  } catch {
    return { gestes: [], calibre: '' };
  }
}

export const besoinDuLienValide = (b: string): b is BesoinDuLien => (BESOINS as readonly string[]).includes(b);

/** Le message qui accompagne le lien, prêt à envoyer. */
export const messageDuLien = (prenom: string, gestes: string[], lien: string): string => [
  `Bonjour${prenom.trim() ? ` ${prenom.trim()}` : ''}, voici votre réservation préparée par la Maison MND${gestes.length ? ` : ${gestes.join(', ')}` : ''}.`,
  'Il ne vous reste qu’à choisir votre jour et votre heure :',
  lien,
].join('\n');
