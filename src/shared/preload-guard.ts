/* Auto-récupération des chunks obsolètes après un déploiement.

   Sur un hébergement statique (GitHub Pages), chaque déploiement renomme les
   fichiers JS (hash). Un navigateur qui garde en cache une ancienne version de
   l'app essaie alors de charger un chunk supprimé → 404 « Failed to fetch
   dynamically imported module ». Ici on recharge la page UNE fois pour récupérer
   la version fraîche (index.html + chunks), avec un garde-fou anti-boucle. */

const RELOAD_KEY = 'mnd_chunk_reload_at';

/** Un fichier de code d'une autre version manque : on recharge UNE fois (pas
    deux en 30 s). Rend `false` quand le garde-fou retient le rechargement. */
export const rechargeUneFois = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* stockage refusé : on recharge quand même */ }
  window.location.reload();
  return true;
};

/** Le message d'un module de code qui n'a pas pu se charger. */
export const codeIntrouvable = (msg: string): boolean =>
  /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically imported module/i.test(msg);

if (typeof window !== 'undefined') {
  const reloadOnce = () => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      // On ne recharge qu'une fois par 30 s : si le rechargement ne corrige pas,
      // on n'entre pas dans une boucle ; un déploiement ultérieur pourra relancer.
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const looksStale = (msg: string) =>
    /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically imported module/i.test(msg);

  // Événement Vite dédié aux échecs de préchargement de modules.
  window.addEventListener('vite:preloadError', () => reloadOnce());

  // Filet global : erreurs d'import de modules non capturées.
  window.addEventListener('error', (e) => {
    if (looksStale(String((e as ErrorEvent).message || ''))) reloadOnce();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    if (looksStale(String(reason?.message || reason || ''))) reloadOnce();
  });
}
