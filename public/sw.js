// Minimal app-shell cache so the interface opens instantly and still opens
// with no network once it has been visited.
const CACHE_NAME = "trello-snap-shell-v4";

// "/" only ever redirects now (to /login or /boards depending on the session),
// and Cache.put refuses a redirected response — so the sign-in screen is the
// shell that gets pre-cached. It is also the only page safe to store: it is
// identical for everyone.
const APP_SHELL = ["/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch cross-origin requests (OCR language data, fonts) or /api/*:
  // those answers are per-user and per-session, and a script-readable copy in
  // Cache Storage would outlive signing out.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Pages are per-user too — /boards and /settings render one person's data —
  // so a navigation always goes to the network and is never written to the
  // cache. Offline it falls back to the pre-cached sign-in shell, which is
  // the same for everyone. Next.js's own RSC payloads (?_rsc=) are page data
  // by another name and get the same treatment.
  if (request.mode === "navigate" || url.searchParams.has("_rsc")) {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(request)) ??
          (await caches.match("/login")) ??
          Response.error()
      )
    );
    return;
  }

  // Everything left is a build asset: hashed JS/CSS, icons, the manifest.
  // Those are immutable and identical for everyone, so cache-first with a
  // background refresh is safe and makes the shell instant.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
