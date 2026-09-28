/* LE CODE DE MARRAINE, SANS MAGASIN — 28 septembre 2026. Lu par le site
   (qui ne doit jamais charger la synchro du Trône) et par l'écran
   Parrainages ; la fonction Edge `demande-submit` en porte une copie, que
   `verifie-le-parrainage` confronte à celle-ci. */

/** PRENOM-XXX : six lettres du prénom au plus, un tiret, trois signes sans
    ambiguïté (ni O ni 0, ni I ni 1, ni L). */
export const FORME_DU_CODE = /^[A-Z]{1,6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{3}$/;
export const SIGNES_DU_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Le début du code, tiré du prénom : sans accents, lettres seules. */
export function racineDuCode(prenom: string): string {
  const r = prenom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return r || 'MND';
}

export function codeDeMarraine(prenom: string, hasard: () => number = Math.random): string {
  let fin = '';
  for (let i = 0; i < 3; i++) fin += SIGNES_DU_CODE[Math.floor(hasard() * SIGNES_DU_CODE.length) % SIGNES_DU_CODE.length];
  return `${racineDuCode(prenom)}-${fin}`;
}

/** Le lien que la marraine partage : la page de réservation, code posé. */
export const lienDuParrainage = (site: string, code: string): string =>
  `${site.replace(/\/?$/, '/')}reserver/?code=${encodeURIComponent(code)}`;
