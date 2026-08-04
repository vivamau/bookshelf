const CACHE_PREFIX = 'bookshelf-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-512x512.svg'
];

const getIndexAssets = (html) => Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/gi))
  .map((match) => new URL(match[1], self.location.origin))
  .filter((url) => url.origin === self.location.origin)
  .map((url) => `${url.pathname}${url.search}`)
  .filter((path) => !path.startsWith('/api/'));

const fetchAndCache = async (cache, path) => {
  const response = await fetch(path, { cache: 'reload' });
  if (!response.ok) throw new Error(`Could not cache ${path}: ${response.status}`);
  await cache.put(path, response);
};

const precacheApplicationShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/index.html', { cache: 'reload' });
  if (!indexResponse.ok) throw new Error(`Could not cache the application shell: ${indexResponse.status}`);

  const html = await indexResponse.clone().text();
  await Promise.all([
    cache.put('/', indexResponse.clone()),
    cache.put('/index.html', indexResponse.clone())
  ]);

  const discoveredAssets = getIndexAssets(html);
  const remainingAssets = [...new Set([...CORE_ASSETS.slice(2), ...discoveredAssets])]
    .filter((path) => path !== '/' && path !== '/index.html');
  await Promise.all(remainingAssets.map((path) => fetchAndCache(cache, path)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(precacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then((cache) => cache.match('/index.html'))
        .then((cachedShell) => cachedShell || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return Response.error();
      }
    })
  );
});
