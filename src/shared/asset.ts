/* Résolution des chemins d'assets/pages tenant compte du chemin de base.

   En dev et en prod servie à la racine, BASE_URL = '/' → chemin inchangé.
   Sous un sous-chemin (ex. GitHub Pages `/mnd-platform/`), BASE_URL porte
   ce préfixe et les liens absolus `/assets/...` ou `/trone.html` restent valides.

   Les URLs gérées par Vite (HTML, CSS url(), imports) sont réécrites
   automatiquement ; ce helper couvre les références absolues écrites à la main
   dans le JS/TSX (src d'images, arrière-plans, navigation inter-surfaces). */
export const asset = (path: string): string =>
  import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\/+/, '');
