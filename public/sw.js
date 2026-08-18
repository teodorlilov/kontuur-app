// Kill-switch: this app has never shipped a service worker, but kontuur.app has a legacy
// workbox worker registered in the wild that proxies (and breaks) long-running fetches.
// Browsers re-fetch a registered worker's script on navigation; serving this file replaces
// the zombie, unregisters it, clears its caches, and reloads controlled tabs.
// Must stay excluded from the auth middleware — a redirect makes the update check fail
// silently and keeps the old worker alive forever.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister()
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((name) => caches.delete(name)))
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) client.navigate(client.url)
    })()
  )
})
