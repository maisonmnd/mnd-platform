/* LES PAGES DE RENVOI — 24 septembre 2026.

   La vitrine quitte /revelateur/ pour la racine du domaine. GitHub Pages ne
   sait pas faire une redirection côté serveur : une ancienne adresse ne peut
   être renvoyée que par une PAGE qui le dit. Chaque adresse de la vitrine
   reçoit donc, sous /revelateur/, une page qui porte trois signaux que les
   moteurs et les navigateurs comprennent tous : la canonique vers la
   nouvelle adresse, un rafraîchissement immédiat, et un script qui renvoie
   en gardant la recherche et l'ancre (un lien « ?besoin=entretien » ou
   « ?code=RENTREE10 » posé hier sur WhatsApp doit arriver entier).

   AUCUN DOMAINE N'EST ÉCRIT ICI : la cible arrive de l'appelant, qui la tient
   de la configuration Pages lue chez GitHub. Ce module est pur, pour que le
   harnais le lise sans rien construire. */

const echappe = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** La page qui renvoie UNE adresse vers sa nouvelle place. */
export function pageDeRenvoi(cible) {
  if (!/^https:\/\/[^\s"]+$/.test(cible)) throw new Error(`cible de renvoi invalide : ${cible}`);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maison MND</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${echappe(cible)}">
<meta http-equiv="refresh" content="0; url=${echappe(cible)}">
<script>location.replace(${JSON.stringify(cible)} + location.search + location.hash);</script>
</head>
<body><p><a href="${echappe(cible)}">Maison MND</a></p></body>
</html>
`;
}

/** La page 404 du site de renvoi : une adresse qu'aucune page ne couvre
    (une image, un ancien morceau de script) est renvoyée en GARDANT son
    chemin, l'ancien préfixe ôté. Sans script, elle renvoie à l'accueil. */
export function page404DeRenvoi(racine, prefixe) {
  if (!/^https:\/\/[^\s"]+\/$/.test(racine)) throw new Error(`racine de renvoi invalide : ${racine}`);
  const motif = new RegExp(`^${prefixe.replace(/[/.]/g, '\\$&')}/?`);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maison MND</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${echappe(racine)}">
<script>
  var chemin = location.pathname.replace(${JSON.stringify(motif.source)} ? new RegExp(${JSON.stringify(motif.source)}) : /^\\//, '/');
  location.replace(${JSON.stringify(racine.replace(/\/$/, ''))} + chemin + location.search + location.hash);
</script>
</head>
<body><p><a href="${echappe(racine)}">Maison MND</a></p></body>
</html>
`;
}

/** Les pages HTML d'un site, en chemins relatifs, ordonnées : c'est la liste
    des adresses à renvoyer. Le 404 du site d'origine n'est pas une adresse. */
export function adressesARenvoyer(pagesRelatives) {
  return [...pagesRelatives].filter((rel) => rel !== '404.html').sort();
}

/** L'adresse publique d'une page relative, à partir de l'adresse du site. */
export function cibleDe(adresseDuSite, rel) {
  if (!adresseDuSite.endsWith('/')) throw new Error('l’adresse du site porte sa barre finale');
  return rel === 'index.html' ? adresseDuSite : `${adresseDuSite}${rel.replace(/index\.html$/, '')}`;
}
