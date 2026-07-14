/* Service worker — Web Push pour Ma Couronne (notifications téléphone).
   Ne met RIEN en cache : uniquement la réception des notifications et le clic.
   (Éviter tout cache ici pour ne jamais servir une version périmée de l'app.) */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Maison MND';
  const options = {
    body: data.body || '',
    icon: data.icon || '/couronne/assets/monograms/mono-copper.png',
    badge: data.badge || '/couronne/assets/monograms/mono-copper.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || '/couronne/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/couronne/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { try { w.navigate(url); } catch (_e) { /* ignore */ } return w.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
