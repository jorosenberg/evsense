/**
 * sw.js, EVsense Service Worker
 *
 * Strategy: Cache-first for app shell + static assets, network-first for API calls.
 *
 * What gets cached:
 *   - App shell (HTML, CSS, JS bundles)
 *   - vehicles_summary.json (browse page works offline)
 *   - favicon, icons, fonts
 *
 * What stays network-only:
 *   - Firestore requests (vehicle detail, requires fresh data)
 *   - ip-api.com (state detection)
 *   - External images (manufacturer CDNs)
 *
 * This means:
 *   - Browse page works offline (uses cached vehicles_summary.json)
 *   - Vehicle Detail page requires a network connection
 *   - Calculator runs entirely offline (all math is client-side)
 */

const CACHE_NAME = 'evsense-v2'
const STATIC_ASSETS = [
  '/',
  '/browse',
  '/compare',
  '/tools/charging-cost-chart',
  '/manifest.json',
  '/favicon.png',
  '/data/vehicles_summary.json',
]

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can, don't fail install if some assets are missing
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      )
    })
  )
  // Take control immediately (don't wait for old SW to die)
  self.skipWaiting()
})

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: route requests ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip Firestore, Analytics, ip-api, and other external APIs, always network
  const skipDomains = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'firebasestorage.googleapis.com',
    'ip-api.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ]
  if (skipDomains.some(domain => url.hostname.includes(domain))) return

  // vehicles_summary.json: cache-first, fallback to network
  if (url.pathname === '/data/vehicles_summary.json') {
    event.respondWith(cacheFirst(request))
    return
  }

  // JS/CSS/image assets (content-hashed): cache-first
  if (
    url.pathname.match(/\.(js|css|png|webp|jpg|jpeg|svg|woff2?)$/) ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // HTML routes: network-first with cache fallback (ensures fresh content)
  if (request.headers.get('accept')?.includes('text/html') || url.pathname === '/') {
    event.respondWith(networkFirst(request))
    return
  }

  // Default: network-first
  event.respondWith(networkFirst(request))
})

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline, content not available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached

    // For HTML navigations, serve the app shell (SPA fallback)
    const appShell = await caches.match('/')
    if (appShell) return appShell

    return new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offline, EVsense</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
    .card { text-align: center; padding: 2rem; max-width: 360px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.6; }
    a { color: #0057FF; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 3rem; margin-bottom: 1rem">⚡</div>
    <h1>You're offline</h1>
    <p>EVsense needs a connection to load vehicle details and incentive data.
       The <a href="/browse">Browse page</a> and calculator work offline if you've visited before.</p>
  </div>
</body>
</html>`
}
