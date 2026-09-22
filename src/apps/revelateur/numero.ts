/* UN NUMÉRO SE LIT PAR DEUX — 21 septembre 2026.

   La branche garde son numéro comme elle l'a saisi, parfois d'un seul bloc
   (`0196756062`). Affiché tel quel à côté de celui du registre, qui est
   espacé, il avait l'air d'une référence de dossier plutôt que d'un numéro
   qu'on compose. On ne touche pas à ce qui est stocké : on le met en forme
   au moment de l'écrire. */

/** `0196756062` devient `+229 01 96 75 60 62`. Un numéro déjà espacé ressort
    identique, et un numéro d'un autre pays garde son indicatif. */
export function numeroDit(brut: string): string {
  const net = (brut ?? '').trim();
  if (!net) return '';
  const chiffres = net.replace(/\D/g, '');
  if (!chiffres) return net;
  /* Le Bénin, avec ou sans son indicatif : dix chiffres, cinq paires. */
  const local = chiffres.startsWith('229') ? chiffres.slice(3) : chiffres;
  const beninois = local.length === 10 && (chiffres.startsWith('229') || !net.startsWith('+'));
  if (beninois) return `+229 ${paires(local)}`;
  /* Ailleurs, on respecte ce qui est écrit : mal regrouper un numéro
     étranger serait pire que de le laisser tel quel. */
  return net;
}

const paires = (d: string): string => d.replace(/(\d{2})(?=\d)/g, '$1 ');

/** Les chiffres seuls, tels que wa.me et `tel:` les attendent. */
export const numeroNu = (brut: string): string => (brut ?? '').replace(/\D/g, '');
