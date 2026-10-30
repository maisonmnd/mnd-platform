/* LA COULEUR SUR LE SITE — 30 octobre 2026.

   « En ligne, la couleur n'est pas évidente, on ne voit pas ses services »
   (Yéman). Maquette 8BpT93dX…, ses choix au sélecteur : une page à elle
   (/couleur-locks/), une ligne « Une couleur ? » sous les tuiles de la
   réservation, une carte sans photo sur l'accueil.

   Sa famille a quitté le nom « Coloration » pour « La Lumière » (la
   nouvelle grille) : le site ne la reconnaissait plus comme couleur et la
   rangeait en dernière question. On la reconnaît désormais à sa marque,
   YÈKPÈ™, jamais à son identifiant. La couleur apportée par la cliente
   n'est pas un geste à proposer, comme le produit apporté.

   Pur : la construction du site l'appelle sans réseau, le navigateur aussi. */
import { litLaMarqueWa } from '../../shared/gestes-en-francais';
import { estUneConsultation } from '../../shared/catalogue-pur';
import { reservableSurLeSite } from '../../shared/place-du-serveur';
import type { AgendaDeLaMaison, PrestationPublique } from './agenda';

export const MARQUE_DE_LA_COULEUR = 'YÈKPÈ';
export const TITRE_DE_LA_COULEUR = 'La couleur végétale';

/** Un geste de la couleur, à proposer : la marque YÈKPÈ™, ni Kids ni apporté. */
export const estUnGesteDeLaCouleur = (s: { name: string }): boolean =>
  litLaMarqueWa(s.name).marque === MARQUE_DE_LA_COULEUR && !/\bkids\b|avec votre (?:produit|couleur)/i.test(s.name);

/** Le titre de la famille sur le site : son nom au catalogue, précédé de
    « La couleur végétale » quand ce nom ne dit pas la couleur. */
export const titreDeLaFamille = (label: string, items: readonly { name: string }[]): string =>
  (items.some(estUnGesteDeLaCouleur) && !/couleur|color/i.test(label) ? `${TITRE_DE_LA_COULEUR} · ${label}` : label);

/** L'ordre des gestes de la couleur, par leur variante au catalogue. */
const ORDRE: readonly string[] = ['Couleur', 'Éclat', 'Lumière'];
/** Chaque geste dit en mots simples, comme la liste WhatsApp (automate 30-f). */
export const GESTES_DE_LA_COULEUR_DITS: Readonly<Record<string, string>> = {
  Couleur: 'Couleur végétale',
  'Éclat': 'Raviver la couleur',
  'Lumière': 'Brillance des locks',
};
/** « Couleur végétale, raviver la couleur et brillance des locks » : ce que
    la couleur offre, d'après les gestes qu'elle a ici. */
export const ceQueLaCouleurOffre = (items: readonly { name: string }[]): string => {
  const dits = [...new Set(items.filter(estUnGesteDeLaCouleur)
    .map((s) => litLaMarqueWa(s.name).variante)
    .sort((a, b) => (ORDRE.indexOf(a) < 0 ? 9 : ORDRE.indexOf(a)) - (ORDRE.indexOf(b) < 0 ? 9 : ORDRE.indexOf(b)))
    .map((v) => GESTES_DE_LA_COULEUR_DITS[v])
    .filter(Boolean))].map((d, i) => (i === 0 ? d : d.toLowerCase()));
  return dits.length <= 1 ? (dits[0] ?? '') : `${dits.slice(0, -1).join(', ')} et ${dits[dits.length - 1]}`;
};
const LONGUEURS: readonly string[] = ['court', 'mi-long', 'long'];

export type PrixDeLaCouleur = { longueur?: string; xof: number };
export type GesteDeLaCouleur = { id: string; geste: string; nom: string; prix: PrixDeLaCouleur[] };

/** LES GESTES DE LA COULEUR POUR SA PAGE : ceux qui se réservent en ligne,
    dans l'ordre Couleur, Éclat, Lumière ; un seul par geste, celui que la
    Maison a nommé (« · La Révélation Végétale ») avant l'ancien du même
    geste. Le prix vient du catalogue : sa grille par longueur quand il en a
    une, sinon le sien ; aucun pour un prix masqué ou un devis. */
export function gestesDeLaCouleurPourLaPage(agenda: AgendaDeLaMaison): GesteDeLaCouleur[] {
  const cats = agenda.categories;
  const geste = (s: PrestationPublique): string => litLaMarqueWa(s.name).variante;
  const sansNom = (s: PrestationPublique): number => (String(s.name).split(' · ')[1] ? 0 : 1);
  const rang = (s: PrestationPublique): number => { const i = ORDRE.indexOf(geste(s)); return i < 0 ? ORDRE.length : i; };
  const vus = new Set<string>();
  return agenda.services
    .filter((s) => !estUneConsultation(s, cats) && reservableSurLeSite(s, cats, agenda.masques) && estUnGesteDeLaCouleur(s))
    .sort((a, b) => rang(a) - rang(b) || sansNom(a) - sansNom(b) || a.name.localeCompare(b.name, 'fr'))
    .filter((s) => { const g = geste(s); if (vus.has(g)) return false; vus.add(g); return true; })
    .map((s) => {
      const muet = s.hidePrice || s.priceMode === 'devis';
      const grille = LONGUEURS.filter((l) => Number(s.prixParLongueur?.[l]) > 0).map((l) => ({ longueur: l, xof: Number(s.prixParLongueur?.[l]) }));
      const prix = muet ? [] : grille.length > 0 ? grille : Number(s.priceXof) > 0 ? [{ xof: Number(s.priceXof) }] : [];
      return { id: s.id, geste: geste(s), nom: s.name, prix };
    });
}
