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

/* Le JSON posé dans un <script> ne doit jamais pouvoir le fermer.
   LES ÉCHAPPEMENTS SONT DOUBLÉS — 10 octobre 2026 (revue de code). Écrit
   avec une seule barre, le littéral de remplacement valait le caractère
   lui-même (« < ») : chaque remplacement rendait la même chaîne, et une offre
   dont le texte portait « </script> » fermait la balise de la page générée.
   Avec deux barres, ce sont les six caractères de l'échappement qui
   s'écrivent, et JSON.parse les relit en « < ». */
export function jsonPourLaPage(valeur: unknown): string {
  return JSON.stringify(valeur).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
