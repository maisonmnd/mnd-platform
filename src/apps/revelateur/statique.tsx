/* CE QUE LA CONSTRUCTION ÉCRIT DANS LA PAGE — 24 septembre 2026.

   `genere-revelateur.mjs` empaquette ce module avec esbuild, comme il le
   fait du contenu, et l'appelle avec les offres lues dans la base. Le rendu
   est celui du MÊME composant que l'îlot monte ensuite : ce que Google et
   les aperçus de partage lisent est, au caractère près, ce que la visiteuse
   voit avant que le script ne tourne. */
import { renderToString } from 'react-dom/server';
import Offres from './ilots/Offres';
import type { OffreDuSite } from './maison';

export { offresDuTrottoir } from '../../shared/offres-pur';
export { horairesStructures } from './schema-pur';

export function rendsLesOffres(offres: OffreDuSite[], genre?: string): string {
  return renderToString(<Offres genre={genre} initiales={offres} />);
}

/* Le JSON posé dans un <script> ne doit jamais pouvoir le fermer. */
export function jsonPourLaPage(valeur: unknown): string {
  return JSON.stringify(valeur).replace(/</g, '\u003c').replace(/\u2028/g, '\u2028').replace(/\u2029/g, '\u2029');
}
