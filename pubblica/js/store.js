// Salvataggi sul telefono (localStorage). Nessun account, nessun server.

(() => {
  const KEYS = {
    current: 'contakm.current',
    history: 'contakm.history',
    recents: 'contakm.recents',
    favorites: 'contakm.favorites',
    prefs: 'contakm.prefs',
  };

  const DEFAULT_PREFS = {
    voice: true,
    sun: false,
    accent: 'orange',
    kmAlert: 5,
    bikeType: 'Hybrid',
    avoidHills: false,
    preferPaths: true,
    wecity: true,
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

  const store = {
    loadCurrent: () => read(KEYS.current, null),
    saveCurrent: (ride) => write(KEYS.current, ride),
    clearCurrent() {
      try {
        localStorage.removeItem(KEYS.current);
      } catch { /* niente da pulire */ }
    },

    loadHistory: () => read(KEYS.history, []),
    addToHistory(ride) {
      const history = [ride, ...store.loadHistory()];
      // Memoria piena: si sacrificano le tracce più vecchie, mai i km.
      for (let i = history.length - 1; !write(KEYS.history, history) && i > 0; i--) {
        history[i] = { ...history[i], track: [] };
      }
    },
    removeFromHistory(startedAt) {
      write(KEYS.history, store.loadHistory().filter((r) => r.startedAt !== startedAt));
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
    },

    loadPrefs: () => ({ ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) }),
    savePrefs: (prefs) => write(KEYS.prefs, prefs),

    exportBackup: () => ({
      app: 'ContaKM',
      history: store.loadHistory(),
      favorites: store.loadFavorites(),
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
      write(KEYS.history, [...history, ...added].sort((a, b) => b.startedAt - a.startedAt));
      if (Array.isArray(data.favorites)) {
        const favorites = store.loadFavorites();
        const extra = data.favorites.filter((p) =>
          Number.isFinite(p?.lat) && Number.isFinite(p.lon) && !favorites.some((f) => samePlace(f, p)));
        write(KEYS.favorites, [...favorites, ...extra]);
      }
      return added.length;
    },
  };

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.store = store;
})();
