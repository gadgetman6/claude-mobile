/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from "workbox-precaching";

// Precache assets from Vite build
precacheAndRoute(self.__WB_MANIFEST);

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title ?? "Claude Mobile";
    const options: NotificationOptions = {
      body: data.body ?? "Notification",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.data?.type ?? "default",
      data: data.data,
      requireInteraction: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for non-JSON push
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Claude Mobile", { body: text })
    );
  }
});

// Notification click handler — focus/open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow("/");
    })
  );
});

// Skip waiting so new SW activates immediately on update
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Activate immediately (don't wait for old SW to die)
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
