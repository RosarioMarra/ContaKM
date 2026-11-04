// Copia online su Supabase per chi accede con Google.
// Il telefono resta la copia principale: si scaricano le novità, si uniscono ai dati locali
// (vince la modifica più recente) e si caricano le modifiche fatte qui.

(() => {
  const PAGE = 500;
  const UPLOAD_CHUNK = 25; // le uscite con la traccia pesano: pochi alla volta

  const stamp = (x) => x?.updatedAt || 0;
  const maxTime = (a, b) => (!a || (b && b > a) ? b : a);

  /** Unisce le righe scaricate ai dati locali. Restituisce la nuova lista e se è cambiato qualcosa. */
  function mergeRemote(localList, rows, keyOf, rowKey, pendingDeletes, lastPushAt) {
    const byKey = new Map(localList.map((x) => [keyOf(x), x]));
    const pending = new Set(pendingDeletes);
    let changed = false;
    for (const row of rows) {
      const key = rowKey(row);
      if (pending.has(key)) continue; // eliminata qui e non ancora caricata: vince l'eliminazione
      const local = byKey.get(key);
      if (row.deleted) {
        // Eliminata altrove; se qui è stata cambiata dopo l'ultimo caricamento, la si tiene.
        if (local && (lastPushAt === 0 || stamp(local) <= lastPushAt)) {
          byKey.delete(key);
          changed = true;
        }
        continue;
      }
      if (!local || stamp(row.data) > stamp(local)) {
        byKey.set(key, row.data);
        changed = true;
      }
    }
    return { list: [...byKey.values()], changed };
  }

  async function pullAll(client, table, columns, since) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      let query = client.from(table).select(columns).order('updated_at', { ascending: true }).range(from, from + PAGE - 1);
      if (since) query = query.gt('updated_at', since);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  }

  async function upload(client, table, rows, onConflict) {
    for (let i = 0; i < rows.length; i += UPLOAD_CHUNK) {
      const { error } = await client.from(table).upsert(rows.slice(i, i + UPLOAD_CHUNK), { onConflict });
      if (error) throw error;
    }
  }

  /**
   * Una sincronizzazione completa. store è ContaKM.store; client un client Supabase con l'utente già dentro.
   * Restituisce { pulled: true } se sono arrivati dati nuovi da mostrare.
   */
  async function syncNow(client, store, userId) {
    let state = store.loadSync();
    if (state.userId !== userId) {
      // Primo accesso da questo telefono (o un altro account): si carica tutto e si scarica tutto.
      state = { ...state, userId, lastPushAt: 0, pulled: {} };
    }
    const startedAt = Date.now();
    let pulled = false;

    // 1. Scarica le novità
    const rideRows = await pullAll(client, 'rides', 'started_at,data,deleted,updated_at', state.pulled.rides);
    const bikeRows = await pullAll(client, 'bikes', 'id,data,deleted,updated_at', state.pulled.bikes);
    const settingsRows = await pullAll(client, 'settings', 'data,updated_at', state.pulled.settings);

    const rides = mergeRemote(store.loadHistory(), rideRows, (r) => r.startedAt, (row) => Number(row.started_at),
      state.deleted.rides, state.lastPushAt);
    if (rides.changed) {
      store.saveHistory(rides.list.sort((a, b) => b.startedAt - a.startedAt), { fromSync: true });
      pulled = true;
    }
    const bikes = mergeRemote(store.loadBikes(), bikeRows, (b) => b.id, (row) => row.id,
      state.deleted.bikes, state.lastPushAt);
    if (bikes.changed) {
      // Le bici restano nell'ordine in cui sono state create.
      store.saveBikes(bikes.list.sort((a, b) => a.createdAt - b.createdAt), { fromSync: true });
      pulled = true;
    }
    const remoteSettings = settingsRows[settingsRows.length - 1];
    if (remoteSettings && stamp(remoteSettings.data) > state.settingsUpdatedAt) {
      const { prefs, favorites } = remoteSettings.data;
      // La bici in uso e il tema sole restano di questo telefono.
      const local = store.loadPrefs();
      store.savePrefs({ ...local, ...prefs, activeBikeId: local.activeBikeId, sun: local.sun }, { fromSync: true });
      if (Array.isArray(favorites)) store.saveFavorites(favorites);
      state.settingsUpdatedAt = stamp(remoteSettings.data);
      pulled = true;
    }
    for (const [name, rows] of [['rides', rideRows], ['bikes', bikeRows], ['settings', settingsRows]]) {
      for (const row of rows) state.pulled[name] = maxTime(state.pulled[name], row.updated_at);
    }

    // 2. Carica le modifiche fatte qui
    const changedRides = store.loadHistory().filter((r) => stamp(r) >= state.lastPushAt);
    await upload(client, 'rides', [
      ...changedRides.map((r) => ({ started_at: r.startedAt, data: r, deleted: false })),
      ...state.deleted.rides.map((startedAt) => ({ started_at: startedAt, data: {}, deleted: true })),
    ], 'user_id,started_at');
    const changedBikes = store.loadBikes().filter((b) => stamp(b) >= state.lastPushAt);
    await upload(client, 'bikes', [
      ...changedBikes.map((b) => ({ id: b.id, data: b, deleted: false })),
      ...state.deleted.bikes.map((id) => ({ id, data: {}, deleted: true })),
    ], 'user_id,id');
    if (state.settingsUpdatedAt >= state.lastPushAt || !state.pulled.settings) {
      const prefs = { ...store.loadPrefs() };
      delete prefs.activeBikeId;
      delete prefs.sun;
      const data = { prefs, favorites: store.loadFavorites(), updatedAt: state.settingsUpdatedAt || startedAt };
      await upload(client, 'settings', [{ data }], 'user_id');
    }

    // Le eliminazioni caricate non servono più; quelle arrivate nel frattempo restano.
    const latest = store.loadSync();
    const uploaded = { rides: new Set(state.deleted.rides), bikes: new Set(state.deleted.bikes) };
    store.saveSync({
      ...state,
      lastPushAt: startedAt,
      settingsUpdatedAt: Math.max(state.settingsUpdatedAt, latest.settingsUpdatedAt),
      deleted: {
        rides: latest.deleted.rides.filter((k) => !uploaded.rides.has(k)),
        bikes: latest.deleted.bikes.filter((k) => !uploaded.bikes.has(k)),
      },
    });
    return { pulled };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.sync = { syncNow, mergeRemote };
})();
