// Service worker — Mon Coloc IA : réception des notifications push.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Mon Coloc IA', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Mon Coloc IA';
  const options = {
    body: data.body || '',
    icon: '/icon',
    badge: '/icon',
    vibrate: [80, 40, 80],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((liste) => {
        for (const client of liste) {
          if ('focus' in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
