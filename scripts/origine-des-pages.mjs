import { execFileSync } from 'node:child_process';

/* L'ADRESSE PUBLIQUE DES SITES, LUE CHEZ GITHUB — 19 septembre 2026.

   Les sites sont des sites-projets du compte (`<compte>.github.io/trone/`…).
   Quand le site PRINCIPAL du compte (`<compte>.github.io`) porte un domaine
   propre, GitHub sert tous les sites-projets sous ce domaine, au même chemin,
   et redirige les anciennes adresses. Le domaine se lit donc là où il vit,
   dans la configuration Pages du site principal, et JAMAIS dans ce dépôt, qui
   est public : aucun nom de domaine ne s'écrit ici.

   Sans `gh`, sans réseau, ou sans site principal : l'adresse github.io, comme
   avant. Rien ne casse, la carte de lien et le sitemap disent seulement
   l'ancienne adresse, qui redirige. */

/** Le domaine propre du compte (« exemple.com »), ou '' s'il n'y en a pas. */
export function domainePropre(proprietaire) {
  if (!proprietaire) return '';
  try {
    const cname = execFileSync(
      'gh', ['api', `repos/${proprietaire}/${proprietaire}.github.io/pages`, '--jq', '.cname // ""'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 },
    ).trim().toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cname) ? cname : '';
  } catch {
    return '';
  }
}

/** L'origine publique des sites du compte, sans barre finale. */
export function origineDuCompte(proprietaire) {
  const domaine = domainePropre(proprietaire);
  return domaine ? `https://${domaine}` : `https://${proprietaire}.github.io`;
}
