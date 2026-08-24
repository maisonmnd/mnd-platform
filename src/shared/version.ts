/* MISE À JOUR AUTOMATIQUE — l'app se recharge quand une nouvelle version est en ligne.

   Le service worker ne met rien en cache et cède la main immédiatement ; ce n'est
   donc pas lui qui retenait les anciennes versions. C'est l'application INSTALLÉE
   qui garde son `index.html` : elle repart de sa copie, charge les mêmes bundles,
   et ne voit jamais un déploiement. Le 2 août 2026, cinq versions successives ont
   été publiées sans qu'aucune n'atteigne le comptoir — et il a fallu purger les
   données de site à la main à chaque fois, ce qui déconnecte la Maison.

   Le remède : la construction dépose un `version.json` à côté de l'app, et
   l'app compare — au démarrage, puis à chaque retour de focus. Si l'empreinte
   diffère de celle compilée dans le bundle, c'est qu'un déploiement a eu lieu :
   on recharge une fois, en contournant le cache.

   Une seule fois par session : si le fichier était mal déployé, une boucle de
   rechargement rendrait l'app inutilisable — pire que le problème d'origine. */

const BUILD = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
const CLE = 'mnd_version_rechargee';
const DELAI_MS = 60_000;

let dernierTest = 0;

async function versionEnLigne(): Promise<string | null> {
  try {
    /* `cache: 'no-store'` : sans lui, la requête retournerait la copie que l'on
       cherche justement à détecter comme périmée. */
    const r = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { build?: string };
    return j.build ?? null;
  } catch {
    return null; // hors ligne : on ne fait rien, l'app continue
  }
}

async function verifier(): Promise<void> {
  if (!BUILD) return; // développement local : rien à comparer
  if (Date.now() - dernierTest < DELAI_MS) return;
  dernierTest = Date.now();

  const enLigne = await versionEnLigne();
  if (!enLigne || enLigne === BUILD) return;

  /* Déjà rechargé pour CETTE version en ligne : on s'arrête là. Sans ce garde,
     un `version.json` incohérent boucle indéfiniment. */
  try {
    if (sessionStorage.getItem(CLE) === enLigne) return;
    sessionStorage.setItem(CLE, enLigne);
  } catch { /* stockage indisponible : on recharge quand même, une fois */ }

  console.info(`[mnd] nouvelle version en ligne (${enLigne}), rechargement`);
  location.reload();
}

if (typeof window !== 'undefined') {
  void verifier();
  window.addEventListener('focus', () => void verifier());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void verifier(); });
}
