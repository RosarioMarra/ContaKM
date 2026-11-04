// Mappe offline: si salva la zona inquadrata e la mappa si vede anche senza internet.
// I riquadri salvati stanno in una memoria a parte (Cache API) che non si svuota da sola.
// La mappa li legge tramite un protocollo "ckm://" di MapLibre, così funziona sia sul sito sia nell'app.

(() => {
  const HOST = 'tiles.openfreemap.org';
  const STYLE_URL = `https://${HOST}/styles/positron`;
  const TILEJSON_URL = `https://${HOST}/planet`;
  const SAVED_CACHE = 'contakm-offline-v1';
  const RECENT_CACHE = 'contakm-tiles-v1';
  const AREAS_KEY = 'contakm.offlineAreas';
  const MAX_ZOOM = 14; // i dati vettoriali arrivano fino a 14: oltre la mappa ingrandisce quelli
  const MIN_ZOOM = 5;
  const MAX_TILES = 4000;
  const AVG_TILE_KB = 60;
  const ASSETS_MB = 1.5; // stile, icone e caratteri, una volta sola

  const hasCaches = typeof caches !== 'undefined';

  // ---------- Calcoli sui riquadri (funzioni pure, testate) ----------

  const lonToX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const latToY = (lat, z) => {
    const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };

  /** Riquadri [z, x, y] che coprono la zona { south, west, north, east } da minZoom a maxZoom. */
  function tilesFor(bounds, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM) {
    const list = [];
    for (let z = minZoom; z <= maxZoom; z++) {
      const max = 2 ** z - 1;
      const x0 = Math.max(0, lonToX(bounds.west, z));
      const x1 = Math.min(max, lonToX(bounds.east, z));
      const y0 = Math.max(0, latToY(bounds.north, z));
      const y1 = Math.min(max, latToY(bounds.south, z));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) list.push([z, x, y]);
    }
    return list;
  }

  function countTiles(bounds) {
    return tilesFor(bounds).length;
  }

  /**
   * Chiave stabile di un riquadro vettoriale: OpenFreeMap cambia ogni settimana la versione nell'indirizzo,
   * la chiave la toglie così i riquadri salvati restano validi anche dopo l'aggiornamento.
   */
  function savedKey(url) {
    const m = url.match(/^https:\/\/tiles\.openfreemap\.org\/planet\/[^/]+\/(\d+)\/(\d+)\/(\d+)\.pbf/);
    return m ? `https://${HOST}/planet/saved/${m[1]}/${m[2]}/${m[3]}.pbf` : url;
  }

  // ---------- Zone salvate ----------

  function loadAreas() {
    try {
      return JSON.parse(localStorage.getItem(AREAS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveAreas(list) {
    try {
      localStorage.setItem(AREAS_KEY, JSON.stringify(list));
    } catch { /* memoria piena: la zona resta comunque nella cache */ }
  }

  // ---------- Lettura dei riquadri per la mappa ----------

  const isTile = (url) => /\.(pbf|png|jpg|webp)(\?|$)/.test(url) && !/\/sprites\//.test(url);
  let recentPuts = 0;

  async function fromCaches(url) {
    if (!hasCaches) return null;
    const saved = await caches.open(SAVED_CACHE);
    return (await saved.match(savedKey(url))) || (await saved.match(url)) || (await caches.match(url));
  }

  async function rememberRecent(url, res) {
    // Sul sito ci pensa già il service worker; nell'app si tengono gli ultimi riquadri visti.
    if (!hasCaches || navigator.serviceWorker?.controller) return;
    const cache = await caches.open(RECENT_CACHE);
    await cache.put(url, res);
    if (++recentPuts % 50 === 0) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - 1500))) await cache.delete(k);
    }
  }

  async function load(url, signal) {
    if (isTile(url)) {
      // Riquadri: prima quelli salvati (subito, anche offline), poi la rete
      const cached = await fromCaches(url).catch(() => null);
      if (cached) return cached;
      const res = await fetch(url, { signal });
      if (res.ok) rememberRecent(url, res.clone()).catch(() => {});
      return res;
    }
    // Stile, indice dei riquadri, icone e caratteri: prima la rete per averli aggiornati, poi la copia
    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        rememberRecent(url, res.clone()).catch(() => {});
        return res;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
    }
    const cached = await fromCaches(url).catch(() => null);
    if (cached) return cached;
    throw new Error(`Non disponibile offline: ${url}`);
  }

  /** Registra il protocollo ckm:// in MapLibre. Restituisce la funzione transformRequest da passare alla mappa. */
  function install(maplibregl) {
    if (!maplibregl?.addProtocol || !hasCaches) return null;
    maplibregl.addProtocol('ckm', async (params, abort) => {
      const url = params.url.replace(/^ckm:\/\//, 'https://');
      const res = await load(url, abort?.signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (params.type === 'json') return { data: await res.json() };
      if (params.type === 'string') return { data: await res.text() };
      return { data: await res.arrayBuffer() };
    });
    return (url) => (url.startsWith(`https://${HOST}/`) ? { url: url.replace(/^https:\/\//, 'ckm://') } : undefined);
  }

  // ---------- Salvataggio di una zona ----------

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { res, data: await res.clone().json() };
  }

  /** Stile, indice, icone e caratteri: servono per disegnare la mappa senza rete. */
  async function styleAssets() {
    const { data: style } = await fetchJson(STYLE_URL);
    const { data: tilejson } = await fetchJson(TILEJSON_URL);
    const urls = [STYLE_URL, TILEJSON_URL];
    if (style.sprite) for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.push(`${style.sprite}${suffix}`);
    const stacks = new Set();
    for (const layer of style.layers || []) {
      const font = layer.layout?.['text-font'];
      if (Array.isArray(font) && font.every((f) => typeof f === 'string')) stacks.add(font.join(','));
    }
    for (const stack of stacks) {
      for (const range of ['0-255', '256-511', '8192-8447']) {
        urls.push(style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range));
      }
    }
    const raster = Object.values(style.sources || {}).find((s) => s.type === 'raster')?.tiles?.[0];
    return { urls, vector: tilejson.tiles[0], raster };
  }

  /**
   * Scarica la zona. onProgress(fatti, totale). Restituisce la zona salvata.
   * Si può interrompere con controller.abort().
   */
  async function saveArea(bounds, name, onProgress, controller = new AbortController()) {
    if (!hasCaches) throw new Error('Questo dispositivo non può salvare le mappe');
    const tiles = tilesFor(bounds);
    if (tiles.length > MAX_TILES) throw new Error('Zona troppo grande: avvicinati con lo zoom');
    const { urls, vector, raster } = await styleAssets();
    const jobs = [
      ...urls.map((url) => ({ url, key: url })),
      ...tiles.map(([z, x, y]) => {
        const url = vector.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        return { url, key: savedKey(url) };
      }),
    ];
    if (raster) {
      for (const [z, x, y] of tilesFor(bounds, 0, 6)) {
        const url = raster.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        jobs.push({ url, key: url });
      }
    }
    const cache = await caches.open(SAVED_CACHE);
    let done = 0;
    let bytes = 0;
    let failed = 0;
    const keys = [];
    let next = 0;
    async function worker() {
      while (next < jobs.length) {
        if (controller.signal.aborted) throw new DOMException('Interrotto', 'AbortError');
        const job = jobs[next++];
        try {
          let res = await cache.match(job.key);
          if (!res) {
            res = await fetch(job.url, { signal: controller.signal });
            if (res.ok) {
              const blob = await res.blob();
              bytes += blob.size;
              await cache.put(job.key, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || '' } }));
            } else if (res.status !== 404) {
              failed++;
            }
          }
          keys.push(job.key);
        } catch (err) {
          if (controller.signal.aborted) throw err;
          failed++;
        }
        onProgress?.(++done, jobs.length);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    if (failed > jobs.length * 0.1) throw new Error('Connessione interrotta: riprova');
    const area = {
      id: `z${Date.now().toString(36)}`,
      name,
      bounds,
      savedAt: Date.now(),
      tiles: tiles.length,
      bytes,
      keys,
    };
    saveAreas([area, ...loadAreas()]);
    return area;
  }

  /** Toglie la zona e i riquadri che non servono a nessun'altra zona salvata. */
  async function deleteArea(id) {
    const areas = loadAreas();
    const area = areas.find((a) => a.id === id);
    if (!area) return;
    const rest = areas.filter((a) => a.id !== id);
    const keep = new Set(rest.flatMap((a) => a.keys || []));
    if (hasCaches) {
      const cache = await caches.open(SAVED_CACHE);
      for (const key of area.keys || []) if (!keep.has(key)) await cache.delete(key);
    }
    saveAreas(rest);
  }

  const estimateMb = (bounds) => (countTiles(bounds) * AVG_TILE_KB) / 1024 + ASSETS_MB;

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.offline = {
    MAX_TILES,
    tilesFor,
    countTiles,
    estimateMb,
    savedKey,
    install,
    loadAreas,
    saveArea,
    deleteArea,
    supported: hasCaches,
  };
})();
