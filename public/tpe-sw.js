/* Service worker — TRÔNE TERMINAL, l'application du TPE de poche (26 novembre
   2026). « Besoin d'une app sur le téléphone, Trône TPE de poche par exemple…
   ou Trône Terminal » (Yéman).

   Il ne sert qu'à deux choses : rendre l'application installable (le
   navigateur demande un service qui répond aux pages), et rouvrir l'écran du
   TPE sans réseau plutôt qu'une page d'erreur. Il ne garde QUE la page
   tpe.html, la dernière vue ; tout le reste (le code, la fonction, Supabase,
   KkiaPay, MTN) passe au réseau, toujours. Rien ne s'encaisse hors ligne.

   SA PORTÉE EST ÉTROITE : `/trone/tpe` (src/apps/tpe/App.tsx l'enregistre ainsi). Le service
   du Trône (`sw.js`, portée `/trone/`) reste maître de tout le reste : sur le
   téléphone de la direction, les deux vivent côte à côte sans se remplacer. */
const CACHE = 'mnd-tpe-page';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      const frais = await fetch(req);
      if (frais.ok) {
        const cache = await caches.open(CACHE);
        await cache.put('tpe.html', frais.clone());
      }
      return frais;
    } catch {
      const cache = await caches.open(CACHE);
      const garde = await cache.match('tpe.html');
      return garde ?? new Response('Pas de réseau : le TPE se rouvre dès que le téléphone est relié.', {
        status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
