// Fa funzionare l'app senza rete: il conta km non deve mai dipendere dal segnale.
// Il navigatore (ricerca e percorso) resta online; le mappe già viste restano in memoria.

const SHELL_CACHE = 'contakm-shell-v35';
const TILE_CACHE = 'contakm-tiles-v1';
const MAX_TILES = 1500;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/bikes.js',
  'js/sync.js',
  'js/cloud.js',
  'js/bike3d.js',
  'js/heading.js',
  'vendor/supabase/supabase.js',
  'js/native.js',
  'vendor/capacitor/capacitor.js',
  'js/geo.js',
  'js/gps.js',
  'js/nav.js',
  'js/offline.js',
  'js/story.js',
  'js/ride.js',
  'js/sim.js',
  'js/stats.js',
  'js/store.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/maplibre/maplibre-gl.js',
  'vendor/maplibre/maplibre-gl.css',
  'vendor/maplibre/leaflet-maplibre-gl.js',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
];

const TILE_HOST = /(^|\.)(tile\.openstreetmap\.org|tiles\.openfreemap\.org)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  // Risposta immediata dalla memoria, aggiornamento in sottofondo per la prossima apertura.
  const update = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (cached) {
    update.catch(() => {});
    return cached;
  }
  return update;
}

async function tileResponse(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    const keys = await cache.keys();
    if (keys.length > MAX_TILES) await cache.delete(keys[0]);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(shellResponse(event.request));
  } else if (TILE_HOST.test(url.hostname)) {
    event.respondWith(tileResponse(event.request));
  }
});
