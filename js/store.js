// Salvataggi sul telefono (localStorage). Nessun account, nessun server.

(() => {
  const KEYS = {
    current: 'contakm.current',
    history: 'contakm.history',
    recents: 'contakm.recents',
    favorites: 'contakm.favorites',
    prefs: 'contakm.prefs',
    bikes: 'contakm.bikes',
    sync: 'contakm.sync',
  };

  const DEFAULT_PREFS = {
    voice: true,
    sun: false,
    accent: 'blue',
    accentV2: true, // dal colore predefinito arancio si passa una volta all'azzurro
    kmAlert: 5,
    bikeType: 'Hybrid',
    speedStyle: 'digital', // 'digital' oppure 'analog'
    panelCollapsed: false, // pannello dei dati in home ridotto a una riga
    activeBikeId: null,
    weightKg: 75,
    weeklyGoalKm: 50,
    serviceEveryKm: 300,
    serviceAtKm: 0,
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const samePlace = (a, b) => a.lat === b.lat && a.lon === b.lon;

  // ---------- Per la copia online (sync.js) ----------
  // Ogni uscita e ogni bici cambiata riceve updatedAt; quelle eliminate finiscono tra le "eliminate"
  // finché la copia online non lo sa. I dati che arrivano dall'online (fromSync) non si rimarcano.

  const DEFAULT_SYNC = { userId: null, lastPushAt: 0, pulled: {}, deleted: { rides: [], bikes: [] }, settingsUpdatedAt: 0 };
  const loadSync = () => ({ ...DEFAULT_SYNC, ...read(KEYS.sync, {}) });
  let onLocalChange = null;

  const withoutStamp = (item) => JSON.stringify({ ...item, updatedAt: undefined });

  function trackChanges(kind, prevList, nextList, keyOf) {
    const now = Date.now();
    const prev = new Map(prevList.map((x) => [keyOf(x), withoutStamp(x)]));
    let changed = false;
    for (const item of nextList) {
      const before = prev.get(keyOf(item));
      if (before !== withoutStamp(item)) {
        item.updatedAt = now;
        changed = true;
      }
      prev.delete(keyOf(item));
    }
    if (prev.size) {
      const state = loadSync();
      const gone = new Set(state.deleted[kind]);
      for (const key of prev.keys()) gone.add(key);
      state.deleted[kind] = [...gone].slice(-500);
      write(KEYS.sync, state);
      changed = true;
    }
    return changed;
  }

  function touchSettings() {
    const state = loadSync();
    state.settingsUpdatedAt = Date.now();
    write(KEYS.sync, state);
    onLocalChange?.();
  }

  const store = {
    loadCurrent: () => read(KEYS.current, null),
    saveCurrent: (ride) => write(KEYS.current, ride),
    clearCurrent() {
      try {
        localStorage.removeItem(KEYS.current);
      } catch { /* niente da pulire */ }
    },

    loadHistory: () => read(KEYS.history, []),
    saveHistory(history, { fromSync = false } = {}) {
      const changed = !fromSync && trackChanges('rides', store.loadHistory(), history, (r) => r.startedAt);
      // Memoria piena: si sacrificano le tracce più vecchie, mai i km.
      for (let i = history.length - 1; !write(KEYS.history, history) && i > 0; i--) {
        history[i] = { ...history[i], track: [] };
      }
      if (changed) onLocalChange?.();
    },
    addToHistory(ride) {
      store.saveHistory([ride, ...store.loadHistory()]);
    },
    setRideBike(startedAt, bikeId) {
      store.saveHistory(store.loadHistory().map((r) => (r.startedAt === startedAt ? { ...r, bikeId } : r)));
    },
    removeFromHistory(startedAt) {
      store.saveHistory(store.loadHistory().filter((r) => r.startedAt !== startedAt));
    },

    loadRecents: () => read(KEYS.recents, []),
    addRecent(place) {
      const others = store.loadRecents().filter((p) => !samePlace(p, place));
      write(KEYS.recents, [place, ...others].slice(0, 6));
    },

    loadFavorites: () => read(KEYS.favorites, []),
    isFavorite: (place) => store.loadFavorites().some((p) => samePlace(p, place)),
    toggleFavorite(place) {
      const favorites = store.loadFavorites();
      const others = favorites.filter((p) => !samePlace(p, place));
      write(KEYS.favorites, others.length === favorites.length ? [place, ...favorites] : others);
      touchSettings();
    },

    loadBikes: () => read(KEYS.bikes, []),
    saveBikes(bikes, { fromSync = false } = {}) {
      const changed = !fromSync && trackChanges('bikes', store.loadBikes(), bikes, (b) => b.id);
      write(KEYS.bikes, bikes);
      if (changed) onLocalChange?.();
    },

    loadPrefs: () => ({ ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) }),
    savePrefs(prefs, { fromSync = false } = {}) {
      const before = JSON.stringify(read(KEYS.prefs, {}));
      write(KEYS.prefs, prefs);
      if (!fromSync && before !== JSON.stringify(prefs)) touchSettings();
    },
    saveFavorites: (favorites) => write(KEYS.favorites, favorites),

    loadSync,
    saveSync: (state) => write(KEYS.sync, state),
    /** Avvisa (sync.js) quando cambia qualcosa da copiare online. */
    onLocalChange(fn) {
      onLocalChange = fn;
    },

    exportBackup: () => ({
      app: 'ContaKM',
      history: store.loadHistory(),
      favorites: store.loadFavorites(),
      bikes: store.loadBikes(),
      prefs: store.loadPrefs(),
    }),
    /** Unisce un backup ai dati presenti; restituisce quante uscite ha aggiunto. */
    importBackup(data) {
      if (data?.app !== 'ContaKM' || !Array.isArray(data.history)) throw new Error('Backup non valido');
      const history = store.loadHistory();
      const known = new Set(history.map((r) => r.startedAt));
      const valid = data.history.filter((r) =>
        Number.isFinite(r?.startedAt) && Number.isFinite(r.distanceM) && Number.isFinite(r.movingMs)
        && !known.has(r.startedAt));
      const added = valid.map((r) => ({ maxSpeedMs: 0, climbM: 0, ...r, track: Array.isArray(r.track) ? r.track : [] }));
      store.saveHistory([...history, ...added].sort((a, b) => b.startedAt - a.startedAt));
      if (Array.isArray(data.favorites)) {
        const favorites = store.loadFavorites();
        const extra = data.favorites.filter((p) =>
          Number.isFinite(p?.lat) && Number.isFinite(p.lon) && !favorites.some((f) => samePlace(f, p)));
        write(KEYS.favorites, [...favorites, ...extra]);
        if (extra.length) touchSettings();
      }
      if (Array.isArray(data.bikes)) {
        const bikes = store.loadBikes();
        const extra = data.bikes.filter((b) =>
          typeof b?.id === 'string' && Array.isArray(b.maintenance) && !bikes.some((k) => k.id === b.id));
        store.saveBikes([...bikes, ...extra]);
      }
      return added.length;
    },
  };

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.store = store;
})();
