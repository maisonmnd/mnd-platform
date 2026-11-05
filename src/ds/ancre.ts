/* LES ANCRES DANS UN TRÔNE À DIÈSE — 5 novembre 2026.
   « Les pages ne s'ouvrent pas : Le mois, Aujourd'hui, À traiter, Le détail
   du mois ne marchent pas. J'ai un message unexpected » (Yéman). Le Trône vit
   derrière le dièse (`createHashRouter`) : un lien `href="#le-mois"` y est une
   PAGE, « /le-mois », qui n'existe pas, et le routeur montrait sa page
   d'erreur brute. Une ancre de la page se suit donc à la main : on ne change
   pas d'adresse, on fait défiler jusqu'à la section. Le `href` reste, pour le
   clic du milieu et les lecteurs d'écran. */
export const allerALaSection = (id: string) => (e: { preventDefault(): void }): void => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
