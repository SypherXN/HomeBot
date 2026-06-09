/* Offline shell + Web Push for HomeBot PWA */
const CACHE = "homebot-static-v3";

function appUrl(path) {
  return new URL(path || "/", self.registration.scope).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"].map((p) => new URL(p, self.location).pathname))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r ?? caches.match("/index.html")))
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "HomeBot", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: appUrl("favicon.svg"),
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = appUrl(event.notification.data?.url || "/");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && "navigate" in client) {
          return client.focus().then((focused) => focused.navigate(target));
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

