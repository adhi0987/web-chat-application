// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New Message', body: 'You have a new message!' };
  
  const options = {
    body: data.body,
    icon: '/logo_2.svg',
    badge: '/logo_2.svg', // Small icon for notification bar
    data: {
      url: self.location.origin // The URL to open when clicked
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});