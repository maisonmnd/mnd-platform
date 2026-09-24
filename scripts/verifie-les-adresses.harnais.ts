/* LES ADRESSES DE LA MAISON, ÉPROUVÉES — `node scripts/verifie-les-adresses.mjs`.

   Le 24 septembre 2026, l'état des lieux du site a mesuré trois choses :
   la racine du domaine servait une page vide marquée noindex, le Trône
   (l'écran de connexion de la gestion) était dans Google, et aucun
   robots.txt n'existait à la seule adresse où les moteurs le lisent.

   Ce harnais tient la réparation dans sa forme, pas dans son résultat en
   ligne : où va chaque site, ce que dit une page de renvoi, ce que portent
   les entrées à connexion. Quand `dist-sites/` existe, il lit aussi ce qui
   a été construit : le CNAME, le robots.txt, le plan du site, les renvois.
   Sans construction, il le dit et ne ment pas. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { destinationDuSite, SOURCES } from './publie.mjs';
import { adressesARenvoyer, cibleDe, pageDeRenvoi, page404DeRenvoi } from './renvoi.mjs';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── OÙ VA CHAQUE SITE ───────────────────────────────────────────── */
dit('la vitrine va au dépôt principal du compte, branche main, à la racine',
  { depot: 'x.github.io', branche: 'main', chemin: '' }, destinationDuSite('revelateur', 'x'));
dit('les renvois vont à l’ancien site-projet, sous /revelateur',
  { depot: 'revelateur', branche: 'gh-pages', chemin: '/revelateur' }, destinationDuSite('revelateur-renvoi', 'x'));
dit('les autres sites ne bougent pas',
  { depot: 'trone', branche: 'gh-pages', chemin: '/trone' }, destinationDuSite('trone', 'x'));
/* Aucune destination n'écrit de domaine : le nom du compte suffit, le
   domaine se lit chez GitHub à la publication. */
dit('aucune destination ne connaît un nom de domaine', false,
  /\.(com|bj|fr|net)\b/.test(JSON.stringify(['revelateur', 'revelateur-renvoi', 'trone'].map((s) => destinationDuSite(s, 'x')))));

/* ── CE QUE DIT UNE PAGE DE RENVOI ───────────────────────────────── */
const cible = 'https://exemple.test/entretien-locks/';
const renvoi = pageDeRenvoi(cible);
dit('elle porte la canonique vers la nouvelle adresse', true, renvoi.includes(`<link rel="canonical" href="${cible}">`));
dit('… un rafraîchissement immédiat', true, renvoi.includes(`<meta http-equiv="refresh" content="0; url=${cible}">`));
dit('… un script qui garde la recherche et l’ancre', true, renvoi.includes('location.search + location.hash'));
dit('… et dit aux moteurs de ne pas la garder', true, renvoi.includes('<meta name="robots" content="noindex">'));
dit('… sans jamais servir de page blanche à qui n’a pas de script', true, renvoi.includes(`<a href="${cible}">`));
dit('une cible qui n’est pas une adresse https est refusée', true,
  (() => { try { pageDeRenvoi('javascript:alert(1)'); return false; } catch { return true; } })());
dit('une cible portant un guillemet ne casse pas la page', true,
  (() => { try { pageDeRenvoi('https://exemple.test/"><script>'); return false; } catch { return true; } })());

/* ── LE 404 DES RENVOIS GARDE LE CHEMIN ──────────────────────────── */
const q = page404DeRenvoi('https://exemple.test/', '/revelateur');
dit('le 404 ôte l’ancien préfixe et renvoie sur le même chemin', true,
  q.includes('location.pathname.replace(') && q.includes('/revelateur') && q.includes('location.search + location.hash'));
dit('… et renvoie à l’accueil sans script', true, q.includes('content="0; url=https://exemple.test/"'));
dit('… sans se faire indexer', true, q.includes('name="robots" content="noindex"'));

/* ── LES ADRESSES À RENVOYER ─────────────────────────────────────── */
dit('le 404 d’origine n’est pas une adresse à renvoyer', ['a/index.html', 'index.html'],
  adressesARenvoyer(['index.html', '404.html', 'a/index.html']));
dit('l’accueil renvoie vers la racine exacte', 'https://exemple.test/', cibleDe('https://exemple.test/', 'index.html'));
dit('une page renvoie vers son dossier, barre finale comprise', 'https://exemple.test/journal/x/', cibleDe('https://exemple.test/', 'journal/x/index.html'));
dit('une page nue garde son nom', 'https://exemple.test/apropos.html', cibleDe('https://exemple.test/', 'apropos.html'));

/* ── LES ENTRÉES À CONNEXION OU À DOCUMENT SONT HORS DES MOTEURS ── */
const ENTREES = ['trone.html', 'couronne.html', 'consultation.html', 'certificat.html', 'bilan.html', 'bulletin.html', 'carte.html'];
dit('les sept entrées portent la balise noindex', [],
  ENTREES.filter((f) => !/<meta name="robots" content="noindex"\s*\/?>/.test(readFileSync(f, 'utf8'))));
const PUBLIQUES = ['lokaa.html', 'academie.html', 'portail.html', 'index.html'].filter((f) => existsSync(f));
dit('… et aucune entrée publique ne la porte par erreur', [],
  PUBLIQUES.filter((f) => /name="robots" content="noindex"/.test(readFileSync(f, 'utf8'))));

/* ── LE GARDE-FOU DU DIST VOIT LES RENVOIS ───────────────────────── */
dit('renvoi.mjs est une source de construction : le retoucher rend les dist périmés', true,
  SOURCES.some((s: string) => s.split('\\').join('/').endsWith('scripts/renvoi.mjs')));

/* ── CE QUI A ÉTÉ CONSTRUIT, quand ça l'a été ─────────────────────── */
const construit = 'dist-sites/revelateur';
if (!existsSync(construit)) {
  console.log('—     dist-sites/ absent : la construction n’est pas éprouvée ici (lancer node scripts/build-sites.mjs avant de publier).');
} else {
  const pages = (function marche(d: string, rel = ''): string[] {
    return readdirSync(d).flatMap((f) => {
      const p = join(d, f); const r = rel ? `${rel}/${f}` : f;
      return statSync(p).isDirectory() ? marche(p, r) : (f.endsWith('.html') ? [r] : []);
    });
  })(construit);
  const robots = readFileSync(join(construit, 'robots.txt'), 'utf8');
  const sitemap = existsSync(join(construit, 'sitemap.xml')) ? readFileSync(join(construit, 'sitemap.xml'), 'utf8') : '';
  const adresses = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  dit('la vitrine construite est explorable et annonce son plan du site', true,
    /Allow: \//.test(robots) && /Sitemap: https:\/\/[^/]+\/sitemap\.xml/.test(robots));
  dit('… son plan du site ne dit plus /revelateur/', [], adresses.filter((a) => a.includes('/revelateur/')));
  /* Le Trône et Ma Couronne sont déjà dans Google. Un Disallow les figerait
     en « indexés, mais bloqués » : Google ne reviendrait plus lire le noindex
     qu'ils portent. Le Disallow ne se pose qu'APRÈS leur disparition. */
  dit('… et n’interdit PAS /trone/ ni /couronne/ tant qu’ils sont indexés (la balise noindex les fait sortir, un Disallow les figerait)', [],
    ['/trone/', '/couronne/'].filter((c) => new RegExp('Disallow:\\s*' + c.split('/').join('\\/')).test(robots)));
  dit('… et compte autant d’adresses que de pages à dossier', adresses.length,
    pages.filter((r) => r.endsWith('index.html')).length);
  const cname = join(construit, 'CNAME');
  const hote = adresses[0] ? new URL(adresses[0]).host : '';
  dit('… le CNAME dit le domaine du plan du site, ou n’existe pas s’il n’y a pas de domaine propre',
    hote.endsWith('.github.io') ? 'aucun' : hote,
    existsSync(cname) ? readFileSync(cname, 'utf8').trim() : 'aucun');
  const renvois = 'dist-sites/revelateur-renvoi';
  if (!existsSync(renvois)) {
    console.log('—     dist-sites/revelateur-renvoi absent : pas d’adresse publique à la construction, les renvois n’ont pas été écrits.');
  } else {
    const anciennes = adressesARenvoyer(pages);
    const ecrites = (function marche(d: string, rel = ''): string[] {
      return readdirSync(d).flatMap((f) => {
        const p = join(d, f); const r = rel ? `${rel}/${f}` : f;
        return statSync(p).isDirectory() ? marche(p, r) : (f.endsWith('.html') ? [r] : []);
      });
    })(renvois).filter((r) => r !== '404.html').sort();
    dit('chaque ancienne adresse a sa page de renvoi, ni plus ni moins', anciennes, ecrites);
    const racine = adresses[0] ? `https://${hote}/` : '';
    dit('… et chaque renvoi vise la même page à la racine', [],
      anciennes.filter((rel) => !readFileSync(join(renvois, rel), 'utf8').includes(`href="${cibleDe(racine, rel)}"`)));
    dit('… le 404 des renvois existe et garde le chemin', true,
      existsSync(join(renvois, '404.html')) && readFileSync(join(renvois, '404.html'), 'utf8').includes('location.pathname.replace('));
  }
}

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
