// Collega GPS, conta km, navigatore e interfaccia.

(() => {
  const {
    Ride, NavSession, arrowAngle, caloriesFor, fetchRoute, maneuverIcon, realGps, searchPlaces, simGps, store, summarize,
  } = globalThis.ContaKM;

  const L = window.L;
  const $ = (id) => document.getElementById(id);

  const params = new URLSearchParams(location.search);
  const isDemo = params.has('demo');
  const gps = isDemo ? simGps : realGps;

  const MIN_RIDE_M = 50;
  const SAVE_EVERY_MS = 10000;
  const REROUTE_COOLDOWN_MS = 20000;
  const UNLOCK_HOLD_MS = 1000;  const ROUTE_COLOR = '#e0218a';
  const CYCLEWAY_COLOR = '#0b9a4b';
  const WECITY_PLAY_URL = 'https://play.google.com/store/apps/details?id=it.wecity.app3';
  const WECITY_IOS_URL = 'https://apps.apple.com/it/app/wecity/id655647085';

  const ACCENTS = [
    { value: 'orange', label: 'Arancio' },
    { value: 'blue', label: 'Azzurro' },
    { value: 'green', label: 'Verde' },
    { value: 'pink', label: 'Rosa' },
  ];
  const KM_ALERTS = [
    { value: 0, label: 'No' },
    { value: 1, label: '1 km' },
    { value: 5, label: '5 km' },
    { value: 10, label: '10 km' },
  ];
  const BIKE_TYPES = [
    { value: 'City', label: 'Città' },
    { value: 'Hybrid', label: 'Ibrida' },
    { value: 'Road', label: 'Corsa' },
    { value: 'Mountain', label: 'MTB' },
  ];

  let ride = new Ride(store.loadCurrent());
  const prefs = store.loadPrefs();
  let lastFix = null;
  let heading = null;
  let gpsStarted = false;
  let gpsError = false;
  let lastSaveAt = 0;
  let wakeLock = null;
  let announcedKmSteps = 0;
  let historyM = summarize(store.loadHistory()).totalM; // km delle uscite salvate, per la home

  // Navigazione
  let nav = null;
  let destination = null;
  let pendingRoute = null;
  let rerouting = false;
  let lastRerouteAt = 0;

  // ---------- Formattazione ----------

  const number = (value, digits) =>
    value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const kmh = (ms) => number(ms * 3.6, 1);
  const km = (m) => number(m / 1000, 2);
  const clock = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  function duration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function shortDistance(m) {
    if (m >= 1000) return `${number(m / 1000, 1)} km`;
    return `${Math.round(m / 10) * 10} m`;
  }

  function shortDuration(seconds) {
    const min = Math.round(seconds / 60);
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  }

  const rideDate = (ms) =>
    new Date(ms).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- Avvisi e voce ----------

  let toastTimer;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function say(text) {
    if (!prefs.voice || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    speechSynthesis.speak(utterance);
  }

  function saveFile(name, content, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ---------- GPS e schermo sempre acceso ----------

  function startGps() {
    if (gpsStarted) return;
    gpsStarted = true;
    gps.watchPosition(onFix, onGpsError);
    renderGps();
  }

  function showAlert(text) {
    $('alert-text').textContent = text;
    $('alert').hidden = false;
  }

  function onGpsError(err) {
    if (err.code === 1 || err.code === 0) {
      gpsError = true;
      showAlert('Posizione bloccata: abilitala per questo sito nelle impostazioni del browser e ricarica.');
    } else if (!lastFix) {
      showAlert('GPS non trovato. Sul computer di solito manca: puoi provare il giro simulato.');
    }
    renderGps();
  }

  async function keepScreenOn() {
    if (wakeLock || !('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* batteria scarica o non supportato: l'app funziona comunque */ }
  }

  function updateScreenLock() {
    if (ride.state === 'running' || nav) keepScreenOn();
    else if (wakeLock) wakeLock.release();
  }

  function onFix(fix) {
    gpsError = false;
    $('alert').hidden = true;
    const firstFix = !lastFix;
    lastFix = fix;
    if (Number.isFinite(fix.heading) && fix.speed > 0.5) heading = fix.heading;

    ride.update(fix);
    updateMapPosition(firstFix);
    const spokeNav = nav ? updateNav(fix) : false;
    if (!spokeNav) announceKm();

    if (ride.state === 'running' && fix.time - lastSaveAt > SAVE_EVERY_MS) {
      lastSaveAt = fix.time;
      store.saveCurrent(ride);
    }
    render();
  }

  function announceKm() {
    if (!prefs.kmAlert) return;
    const steps = Math.floor(ride.distanceM / 1000 / prefs.kmAlert);
    if (steps > announcedKmSteps) {
      say(`${steps * prefs.kmAlert} chilometri. Media ${Math.round(ride.avgSpeedMs * 3.6)} orari.`);
    }
    announcedKmSteps = steps;
  }

  // ---------- Rendering ----------

  function renderGps() {
    const el = $('gps');
    if (gpsError) {
      el.dataset.state = 'error';
      $('gps-text').textContent = 'Bloccato';
    } else if (!gpsStarted) {
      el.dataset.state = 'off';
      $('gps-text').textContent = 'GPS spento';
    } else if (ride.hasSignal()) {
      el.dataset.state = 'ok';
      $('gps-text').textContent = `${isDemo ? 'Demo' : 'GPS'} ±${Math.round(lastFix.accuracy)} m`;
    } else {
      el.dataset.state = 'searching';
      $('gps-text').textContent = 'Cerco GPS…';
    }
  }

  function render() {
    const speed = String(Math.round(ride.speedMs * 3.6));
    $('speed').textContent = speed;
    $('map-speed').textContent = speed;
    $('speed-note').textContent =
      ride.state === 'paused' ? '· in pausa' : ride.state === 'running' && !ride.moving ? '· fermo' : '';
    $('stat-distance').textContent = km(ride.distanceM);
    $('map-distance').textContent = km(ride.distanceM);
    $('stat-time').textContent = duration(ride.movingMs);
    $('stat-avg').textContent = kmh(ride.avgSpeedMs);
    $('stat-max').textContent = kmh(ride.maxSpeedMs);
    $('stat-climb').textContent = String(Math.round(ride.climbM));
    $('stat-kcal').textContent = String(Math.round(caloriesFor(ride.distanceM, ride.movingMs, prefs.weightKg)));
    $('stat-clock').textContent = clock(Date.now());
    renderTotal();

    $('btn-start').hidden = ride.state !== 'idle';
    $('btn-pause').hidden = ride.state !== 'running';
    $('btn-resume').hidden = ride.state !== 'paused';
    $('btn-finish').hidden = ride.state !== 'paused';
    // Solo prima di partire: passando a un'altra app il browser sospende il GPS di ContaKM.
    $('btn-wecity').hidden = !prefs.wecity || ride.state !== 'idle';
    renderGps();
  }

  /** Km totali in home: uscite salvate più quella in corso, così crescono mentre pedali. */
  function renderTotal() {
    $('stat-total').textContent = number((historyM + ride.distanceM) / 1000, 1);
  }

  /** Android apre l'app se c'è, altrimenti Google Play; iPhone arriva all'App Store. */
  function wecityLink() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      const fallback = encodeURIComponent(WECITY_PLAY_URL);
      return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=it.wecity.app3;S.browser_fallback_url=${fallback};end`;
    }
    return /iPhone|iPad/i.test(ua) ? WECITY_IOS_URL : WECITY_PLAY_URL;
  }

  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = prefs.sun ? 'sun' : 'dark';
    root.dataset.accent = prefs.accent;
    document.querySelector('meta[name="theme-color"]').content = prefs.sun ? '#ffffff' : '#0f1b2d';
    $('btn-sun').setAttribute('aria-pressed', prefs.sun);
    $('btn-voice').setAttribute('aria-pressed', prefs.voice);
    $('btn-voice').querySelector('use').setAttribute('href', prefs.voice ? '#i-voice' : '#i-voice-off');
  }

  // ---------- Blocco tocchi ----------

  let unlockTimer;

  function setupLock() {
    const overlay = $('lock');
    $('btn-lock').addEventListener('click', () => { overlay.hidden = false; });
    const cancel = () => {
      clearTimeout(unlockTimer);
      overlay.classList.remove('holding');
    };
    overlay.addEventListener('pointerdown', () => {
      overlay.classList.add('holding');
      unlockTimer = setTimeout(() => {
        cancel();
        overlay.hidden = true;
      }, UNLOCK_HOLD_MS);
    });
    overlay.addEventListener('pointerup', cancel);
    overlay.addEventListener('pointercancel', cancel);
    overlay.addEventListener('pointerleave', cancel);
  }

  // ---------- Mappa ----------

  let map = null;
  let riderMarker = null;
  let routeLine = null;
  let destMarker = null;
  let following = true;

  const RIDER_ICON = `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="#2563eb" stroke="#fff" stroke-width="3"/><path d="M22 9l9 23-9-5-9 5z" fill="#fff"/></svg>`;

  /** Disegna le piste ciclabili sotto i nomi delle strade. */
  function addCycleways(gl) {
    const firstLabel = gl.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    gl.addLayer({
      id: 'piste-ciclabili',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['any', ['==', ['get', 'subclass'], 'cycleway'], ['==', ['get', 'bicycle'], 'designated']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': CYCLEWAY_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 4, 19, 8],
      },
    }, firstLabel);
  }

  function createTiles(target) {
    const osm = () =>
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap',
      });
    // Mappa semplice, quasi solo strade e nomi; se non si carica si passa a OSM standard.
    let simple;
    try {
      simple = L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/positron',
        attribution: '© OpenStreetMap · OpenFreeMap',
      }).addTo(target);
    } catch { /* telefono senza WebGL */ }
    if (!simple) {
      osm().addTo(target);
      return;
    }
    let loaded = false;
    const gl = simple.getMaplibreMap();
    gl.once('load', () => {
      loaded = true;
      addCycleways(gl);
    });
    gl.on('error', () => {
      if (!loaded && navigator.onLine && target.hasLayer(simple)) {
        target.removeLayer(simple);
        osm().addTo(target);
      }
    });
  }

  function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: false, center: [41.9, 12.5], zoom: 6, maxZoom: 19 });
    map.attributionControl.setPrefix(false);
    createTiles(map);
    map.on('dragstart', () => {
      following = false;
      $('btn-locate').hidden = false;
    });
  }

  function updateMapPosition(firstFix) {
    if (!map || !lastFix) return;
    const latlng = [lastFix.lat, lastFix.lon];
    if (!riderMarker) {
      riderMarker = L.marker(latlng, {
        interactive: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: 'rider', html: RIDER_ICON, iconSize: [44, 44], iconAnchor: [22, 22] }),
      }).addTo(map);
    } else {
      riderMarker.setLatLng(latlng);
    }
    const svg = riderMarker.getElement()?.querySelector('svg');
    if (svg && heading != null) svg.style.transform = `rotate(${heading}deg)`;
    if (pendingRoute) return;
    if (firstFix) map.setView(latlng, 16);
    else if (following) map.panTo(latlng);
  }

  function drawRoute(route) {
    if (routeLine) routeLine.remove();
    routeLine = L.polyline(route.coords.map((c) => [c.lat, c.lon]), { color: ROUTE_COLOR, weight: 8, opacity: 0.9 }).addTo(map);
  }

  function clearRoute() {
    routeLine?.remove();
    destMarker?.remove();
    routeLine = null;
    destMarker = null;
  }

  function recenter() {
    following = true;
    $('btn-locate').hidden = true;
    if (lastFix) map.setView([lastFix.lat, lastFix.lon], Math.max(map.getZoom(), 16));
  }

  // ---------- Navigatore ----------

  const routeOptions = () => ({
    heading,
    bikeType: prefs.bikeType,
    avoidHills: prefs.avoidHills,
    preferPaths: prefs.preferPaths,
  });

  async function chooseDestination(place) {
    $('search').close();
    if (!place.isStart) store.addRecent(place);
    showView('map');
    if (!lastFix) {
      toast('Attendo il segnale GPS: riprova tra poco');
      return;
    }
    toast('Calcolo il percorso…');
    try {
      const route = await fetchRoute(lastFix, place, routeOptions());
      $('toast').hidden = true;
      destination = place;
      pendingRoute = route;
      drawRoute(route);
      destMarker?.remove();
      destMarker = L.circleMarker([place.lat, place.lon], { radius: 10, color: '#fff', weight: 3, fillColor: ROUTE_COLOR, fillOpacity: 1 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { paddingTopLeft: [30, 30], paddingBottomRight: [30, 220], animate: false });
      $('preview-title').textContent = place.title;
      $('preview-info').textContent = `${shortDistance(route.distanceM)} · ${shortDuration(route.timeS)} · arrivo ${clock(Date.now() + route.timeS * 1000)}`;
      $('preview').hidden = false;
      $('map-strip').hidden = true;
      $('btn-search').hidden = true;
    } catch {
      toast('Percorso non disponibile. Controlla la connessione e riprova.');
    }
  }

  function cancelPreview() {
    pendingRoute = null;
    destination = null;
    clearRoute();
    $('preview').hidden = true;
    $('map-strip').hidden = false;
    $('btn-search').hidden = false;
    recenter();
  }

  function startNav() {
    if (!pendingRoute) return;
    nav = new NavSession(pendingRoute);
    gps.followPath?.(pendingRoute.coords);
    say(pendingRoute.maneuvers[0].spoken);
    pendingRoute = null;
    $('preview').hidden = true;
    $('map-strip').hidden = false;
    $('turn').hidden = false;
    map.invalidateSize();
    following = true;
    $('btn-locate').hidden = true;
    if (lastFix) map.setView([lastFix.lat, lastFix.lon], 17);
    if (ride.state !== 'running') ride.start();
    updateScreenLock();
    if (lastFix) updateNav(lastFix);
    render();
  }

  function stopNav() {
    nav = null;
    destination = null;
    clearRoute();
    $('turn').hidden = true;
    $('btn-search').hidden = false;
    map?.invalidateSize();
    updateScreenLock();
  }

  /** Restituisce true se ha parlato, così l'annuncio dei km non si sovrappone. */
  function updateNav(fix) {
    const status = nav.update(fix);
    if (status.arrived) {
      say('Sei arrivato');
      toast('Sei arrivato!');
      stopNav();
      return true;
    }
    renderTurn(status);
    if (status.offRoute) reroute(fix);
    if (status.say) say(status.say);
    return Boolean(status.say);
  }

  function renderTurn({ next, toNextM, remainingM }) {
    const { distanceM, timeS } = nav.route;
    $('turn-distance').textContent = shortDistance(toNextM);
    $('turn-text').textContent = rerouting ? 'Ricalcolo il percorso…' : next.text;
    $('turn-left').textContent = shortDistance(remainingM);
    $('turn-eta').textContent = clock(Date.now() + (remainingM / distanceM) * timeS * 1000);
    const icon = $('turn-icon');
    icon.querySelector('use').setAttribute('href', `#i-${maneuverIcon(next.type)}`);
    icon.style.transform = maneuverIcon(next.type) === 'arrow' ? `rotate(${arrowAngle(next.type)}deg)` : '';
  }

  async function reroute(fix) {
    if (rerouting || Date.now() - lastRerouteAt < REROUTE_COOLDOWN_MS) return;
    rerouting = true;
    lastRerouteAt = Date.now();
    say('Ricalcolo il percorso');
    try {
      const route = await fetchRoute(fix, destination, routeOptions());
      if (!nav) return;
      nav = new NavSession(route);
      gps.followPath?.(route.coords);
      drawRoute(route);
    } catch {
      // Senza rete si continua a mostrare il vecchio percorso: si ritenta dopo la pausa.
    } finally {
      rerouting = false;
    }
  }

  let closeArmedTimer;
  function onTurnClose() {
    const btn = $('turn-close');
    if (btn.classList.contains('confirm')) {
      disarmTurnClose();
      stopNav();
      return;
    }
    // Due tocchi: un urto sul manubrio non deve interrompere la navigazione.
    btn.classList.add('confirm');
    btn.textContent = 'Esci?';
    closeArmedTimer = setTimeout(disarmTurnClose, 3000);
  }

  function disarmTurnClose() {
    clearTimeout(closeArmedTimer);
    const btn = $('turn-close');
    btn.classList.remove('confirm');
    btn.innerHTML = '<svg><use href="#i-close"/></svg>';
  }

  // ---------- Ricerca destinazione ----------

  let searchSeq = 0;
  let searchTimer;

  function textBlock(className, text) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    return el;
  }

  function placeRow(place) {
    const li = document.createElement('li');
    li.className = 'place';
    const btn = document.createElement('button');
    btn.className = 'row';
    btn.append(textBlock('row-title', place.title), textBlock('row-sub', place.subtitle));
    btn.addEventListener('click', () => chooseDestination(place));
    li.append(btn);
    if (!place.isStart) {
      const star = document.createElement('button');
      star.className = 'icon-btn star';
      star.setAttribute('aria-label', 'Preferito');
      star.setAttribute('aria-pressed', store.isFavorite(place));
      star.innerHTML = '<svg><use href="#i-star"/></svg>';
      star.addEventListener('click', () => {
        store.toggleFavorite(place);
        star.setAttribute('aria-pressed', store.isFavorite(place));
      });
      li.append(star);
    }
    return li;
  }

  function renderResults(places, hint) {
    $('search-hint').textContent = hint;
    $('results').replaceChildren(...places.map(placeRow));
  }

  function openSearch() {
    startGps();
    const input = $('search-input');
    input.value = '';
    searchSeq++;
    const favorites = store.loadFavorites();
    const recents = store.loadRecents().filter((p) => !store.isFavorite(p));
    const start = ride.track[0]
      ? [{ title: 'Torna alla partenza', subtitle: 'Da dove hai iniziato questa uscita', lat: ride.track[0][0], lon: ride.track[0][1], isStart: true }]
      : [];
    renderResults([...start, ...favorites, ...recents], 'Per sicurezza, scegli la destinazione da fermo.');
    $('search').showModal();
    input.focus();
  }

  async function runSearch(query) {
    const seq = ++searchSeq;
    if (query.trim().length < 3) return;
    try {
      const places = await searchPlaces(query, lastFix);
      if (seq !== searchSeq) return;
      renderResults(places, places.length ? 'Tocca la stella per salvare un luogo tra i preferiti.' : 'Nessun risultato: prova a scrivere anche la città.');
    } catch {
      if (seq === searchSeq) renderResults([], 'Ricerca non disponibile. Controlla la connessione.');
    }
  }

  function setupMic() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const btn = $('btn-mic');
    btn.hidden = false;
    btn.addEventListener('click', () => {
      const rec = new Recognition();
      rec.lang = 'it-IT';
      btn.classList.add('listening');
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        $('search-input').value = text;
        runSearch(text);
      };
      rec.onend = () => btn.classList.remove('listening');
      rec.start();
    });
  }

  // ---------- Uscite ----------

  function finishRide() {
    const data = { ...ride.toJSON(), endedAt: Date.now() };
    store.clearCurrent();
    ride = new Ride();
    announcedKmSteps = 0;
    if (nav) stopNav();
    updateScreenLock();
    render();
    if (data.distanceM < MIN_RIDE_M) {
      toast('Uscita troppo breve: non salvata');
      return;
    }
    store.addToHistory(data);
    renderHistory();
    openDetail(data, 'Uscita salvata');
    if (kmSinceService() >= prefs.serviceEveryKm) {
      toast('Ora di fare manutenzione alla bici: pulisci e lubrifica la catena');
    }
  }

  function renderHistory() {
    const history = store.loadHistory();
    const s = summarize(history);
    $('week-km').textContent = number(s.weekM / 1000, 1);
    $('month-km').textContent = number(s.monthM / 1000, 1);
    $('total-km').textContent = number(s.totalM / 1000, 1);
    $('total-rides').textContent = s.rides;
    historyM = s.totalM;
    renderTotal();

    const goal = prefs.weeklyGoalKm;
    $('goal').hidden = !goal;
    $('goal-text').textContent = `Obiettivo settimana: ${number(s.weekM / 1000, 1)} di ${goal} km`;
    $('goal-fill').style.width = `${goal ? Math.min(100, (s.weekM / 1000 / goal) * 100) : 0}%`;

    $('records').hidden = s.rides === 0;
    $('record-long').textContent = km(s.longestM);
    $('record-avg').textContent = kmh(s.bestAvgMs);
    $('record-top').textContent = kmh(s.topSpeedMs);

    $('history-empty').hidden = s.rides > 0;
    $('history').replaceChildren(
      ...history.map((r) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'row';
        btn.append(
          textBlock('row-title', `${km(r.distanceM)} km`),
          textBlock('row-sub', `${rideDate(r.startedAt)} · ${duration(r.movingMs)}`),
        );
        btn.addEventListener('click', () => openDetail(r, rideDate(r.startedAt)));
        li.append(btn);
        return li;
      }),
    );
  }

  let detailRide = null;
  let detailMap = null;

  function statTile(value, label) {
    const tile = document.createElement('div');
    tile.className = 'stat';
    tile.append(textBlock('stat-value', value), textBlock('stat-label', label));
    return tile;
  }

  function openDetail(r, title) {
    detailRide = r;
    $('detail-title').textContent = title;
    const avgMs = r.movingMs > 0 ? r.distanceM / (r.movingMs / 1000) : 0;
    $('detail-stats').replaceChildren(
      statTile(km(r.distanceM), 'km'),
      statTile(duration(r.movingMs), 'tempo'),
      statTile(kmh(avgMs), 'media km/h'),
      statTile(kmh(r.maxSpeedMs), 'massima km/h'),
      statTile(String(Math.round(r.climbM)), 'm di salita'),
      statTile(String(Math.round(caloriesFor(r.distanceM, r.movingMs, prefs.weightKg))), 'kcal stimate'),
    );
    resetDeleteButton();
    $('btn-gpx').hidden = r.track.length < 2;
    $('detail').showModal();

    const mapEl = $('detail-map');
    mapEl.hidden = r.track.length < 2;
    if (r.track.length >= 2) {
      detailMap = L.map(mapEl, { zoomControl: false, maxZoom: 19 });
      detailMap.attributionControl.setPrefix(false);
      const line = L.polyline(r.track.map((p) => [p[0], p[1]]), { color: ROUTE_COLOR, weight: 6 });
      detailMap.fitBounds(line.getBounds(), { padding: [20, 20], animate: false });
      createTiles(detailMap);
      line.addTo(detailMap);
    }
  }

  function closeDetail() {
    detailMap?.remove();
    detailMap = null;
    $('detail').close();
  }

  function resetDeleteButton() {
    $('btn-delete').textContent = 'Elimina';
    $('btn-delete').dataset.armed = '';
  }

  function onDelete() {
    const btn = $('btn-delete');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Sicuro?';
      return;
    }
    store.removeFromHistory(detailRide.startedAt);
    closeDetail();
    renderHistory();
  }

  function downloadGpx() {
    const r = detailRide;
    const points = r.track
      .map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}"><time>${new Date(r.startedAt + p[2] * 1000).toISOString()}</time></trkpt>`)
      .join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ContaKM" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Uscita ${new Date(r.startedAt).toLocaleDateString('it-IT')}</name><type>cycling</type><trkseg>
${points}
</trkseg></trk>
</gpx>`;
    saveFile(`contakm-${new Date(r.startedAt).toISOString().slice(0, 10)}.gpx`, gpx, 'application/gpx+xml');
  }

  // ---------- Altro: impostazioni e strumenti ----------

  function savePrefs() {
    store.savePrefs(prefs);
    applyPrefs();
  }

  function setupSegmented(id, options, key, onChange) {
    const root = $(id);
    const paint = () => {
      root.querySelectorAll('button').forEach((btn, i) => {
        btn.setAttribute('aria-pressed', options[i].value === prefs[key]);
      });
    };
    root.replaceChildren(
      ...options.map((option) => {
        const btn = document.createElement('button');
        btn.textContent = option.label;
        btn.addEventListener('click', () => {
          prefs[key] = option.value;
          savePrefs();
          paint();
          onChange?.();
        });
        return btn;
      }),
    );
    paint();
  }

  function setupToggle(id, key) {
    const btn = $(id);
    btn.setAttribute('aria-pressed', prefs[key]);
    btn.addEventListener('click', () => {
      prefs[key] = !prefs[key];
      btn.setAttribute('aria-pressed', prefs[key]);
      savePrefs();
    });
  }

  function setupStepper(id, key, step, min, max, onChange) {
    const root = $(id);
    const value = root.querySelector('.stepper-value');
    const paint = () => { value.textContent = prefs[key]; };
    const [minus, plus] = root.querySelectorAll('button');
    const change = (delta) => {
      prefs[key] = Math.min(max, Math.max(min, prefs[key] + delta));
      savePrefs();
      paint();
      onChange?.();
    };
    minus.addEventListener('click', () => change(-step));
    plus.addEventListener('click', () => change(step));
    paint();
  }

  function totalHistoryKm() {
    return summarize(store.loadHistory()).totalM / 1000;
  }

  function kmSinceService() {
    return Math.max(0, totalHistoryKm() - prefs.serviceAtKm);
  }

  function renderService() {
    const done = kmSinceService();
    $('service-text').textContent = `${number(done, 0)} km dall'ultima manutenzione, avviso a ${prefs.serviceEveryKm} km`;
    $('service-fill').style.width = `${Math.min(100, (done / prefs.serviceEveryKm) * 100)}%`;
    $('service-fill').dataset.due = done >= prefs.serviceEveryKm ? '1' : '';
  }

  async function sharePosition() {
    if (!lastFix) {
      startGps();
      toast('Attendo il segnale GPS: riprova tra poco');
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${lastFix.lat.toFixed(5)}&mlon=${lastFix.lon.toFixed(5)}#map=17/${lastFix.lat.toFixed(5)}/${lastFix.lon.toFixed(5)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'La mia posizione', text: 'Sono qui in bici:', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('Link della posizione copiato');
      }
    } catch { /* condivisione annullata */ }
  }

  function exportBackup() {
    const name = `contakm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    saveFile(name, JSON.stringify(store.exportBackup()), 'application/json');
  }

  async function importBackup(file) {
    try {
      const added = store.importBackup(JSON.parse(await file.text()));
      toast(`Backup caricato: ${added} uscite aggiunte`);
      renderHistory();
      renderService();
    } catch {
      toast('Questo file non è un backup di ContaKM');
    }
  }

  function setupSettings() {
    setupSegmented('set-accent', ACCENTS, 'accent');
    setupSegmented('set-km-alert', KM_ALERTS, 'kmAlert');
    setupSegmented('set-bike', BIKE_TYPES, 'bikeType');
    setupToggle('set-hills', 'avoidHills');
    setupToggle('set-paths', 'preferPaths');
    setupToggle('set-wecity', 'wecity');
    $('set-wecity').addEventListener('click', render);
    $('btn-wecity').href = wecityLink();
    setupStepper('set-weight', 'weightKg', 1, 30, 200, render);
    setupStepper('set-goal', 'weeklyGoalKm', 10, 0, 1000);
    setupStepper('set-service', 'serviceEveryKm', 50, 50, 5000, renderService);
    $('btn-service-done').addEventListener('click', () => {
      prefs.serviceAtKm = totalHistoryKm();
      savePrefs();
      renderService();
      toast('Manutenzione segnata');
    });
    $('btn-share').addEventListener('click', sharePosition);
    $('btn-backup').addEventListener('click', exportBackup);
    $('btn-restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });
    $('btn-demo').textContent = isDemo ? 'Esci dal giro simulato' : 'Prova il giro simulato';
    $('btn-demo').addEventListener('click', () => {
      location.search = isDemo ? '' : '?demo';
    });
  }

  // ---------- Navigazione tra le schede ----------

  function showView(name) {
    for (const view of ['ride', 'map', 'history', 'more']) {
      $(`view-${view}`).hidden = view !== name;
    }
    document.querySelectorAll('.tab').forEach((tab) => {
      if (tab.dataset.view === name) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    if (name === 'map') {
      startGps();
      initMap();
      map.invalidateSize();
      updateMapPosition(!riderMarker);
    }
    if (name === 'history') renderHistory();
    if (name === 'more') renderService();
  }

  // ---------- Avvio ----------

  function startRide() {
    startGps();
    ride.start();
    updateScreenLock();
    render();
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => showView(tab.dataset.view));
    });

    $('btn-start').addEventListener('click', startRide);
    $('btn-resume').addEventListener('click', startRide);
    $('btn-pause').addEventListener('click', () => {
      ride.pause();
      store.saveCurrent(ride);
      updateScreenLock();
      render();
    });
    $('btn-finish').addEventListener('click', finishRide);

    $('btn-voice').addEventListener('click', () => {
      prefs.voice = !prefs.voice;
      savePrefs();
    });
    $('btn-sun').addEventListener('click', () => {
      prefs.sun = !prefs.sun;
      savePrefs();
    });
    $('btn-alert-demo').addEventListener('click', () => {
      location.search = '?demo';
    });

    $('btn-search').addEventListener('click', openSearch);
    $('btn-search-close').addEventListener('click', () => $('search').close());
    $('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(e.target.value), 400);
    });
    $('btn-locate').addEventListener('click', recenter);
    $('btn-go').addEventListener('click', startNav);
    $('btn-preview-cancel').addEventListener('click', cancelPreview);
    $('turn-close').addEventListener('click', onTurnClose);

    $('btn-detail-close').addEventListener('click', closeDetail);
    $('btn-gpx').addEventListener('click', downloadGpx);
    $('btn-delete').addEventListener('click', onDelete);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') updateScreenLock();
      // Se il telefono chiude l'app, l'uscita in corso resta salvata.
      else if (ride.state !== 'idle') store.saveCurrent(ride);
    });
  }

  bindEvents();
  setupMic();
  setupLock();
  setupSettings();
  applyPrefs();
  announcedKmSteps = prefs.kmAlert ? Math.floor(ride.distanceM / 1000 / prefs.kmAlert) : 0;
  render();

  setInterval(() => {
    ride.tick();
    render();
  }, 1000);

  // Se la posizione è già stata concessa non serve aspettare un tocco.
  navigator.permissions?.query({ name: 'geolocation' })
    .then((status) => { if (status.state === 'granted') startGps(); })
    .catch(() => {});
  if (isDemo) {
    startGps();
    toast('Giro simulato: il GPS è finto');
  }

  // In locale il service worker è spento, così le modifiche si vedono subito.
  const canInstall = location.protocol === 'https:' || (location.hostname === 'localhost' && params.has('sw'));
  if ('serviceWorker' in navigator && canInstall) {
    navigator.serviceWorker.register('sw.js');
  }
})();
