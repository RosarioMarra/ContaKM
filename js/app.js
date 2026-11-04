// Collega GPS, conta km, navigatore e interfaccia.

(() => {
  const {
    Ride, NavSession, arrowAngle, bikes: bikeLib, caloriesFor, cloud, fetchRoute, maneuverIcon, native, realGps, searchPlaces, simGps, store, summarize, trackSegments,
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
  let bikeList = store.loadBikes();

  // Prima apertura con le bici: "La mia bici" prende uscite e manutenzione di prima.
  {
    const migrated = bikeLib.migrate(bikeList, store.loadHistory(), prefs);
    if (migrated) {
      bikeList = migrated.bikes;
      store.saveBikes(bikeList);
      store.saveHistory(migrated.history);
      prefs.activeBikeId = migrated.activeBikeId;
      store.savePrefs(prefs);
    }
  }
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
    if (!prefs.voice) return;
    if (native.isNative) {
      native.say(text);
      return;
    }
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    speechSynthesis.speak(utterance);
  }

  function saveFile(name, content, type) {
    if (native.isNative) {
      native.saveFile(name, content).catch(() => toast('Salvataggio non riuscito'));
      return;
    }
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
      showAlert(native.isNative
        ? 'Posizione bloccata: abilitala per ContaKM nelle impostazioni del telefono e riapri l\'app.'
        : 'Posizione bloccata: abilitala per questo sito nelle impostazioni del browser e ricarica.');
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
    if (native.isNative) {
      const active = ride.state === 'running' || Boolean(nav);
      native.keepAwake(active);
      if (!isDemo) native.backgroundTracking(active);
      return;
    }
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
    renderGauge(ride.speedMs * 3.6);
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

    $('btn-bike-pick').setAttribute('aria-disabled', ride.state !== 'idle');
    $('btn-start').hidden = ride.state !== 'idle';
    $('btn-pause').hidden = ride.state !== 'running';
    $('btn-resume').hidden = ride.state !== 'paused';
    $('btn-finish').hidden = ride.state !== 'paused';
    // Solo prima di partire: passando a un'altra app il browser sospende il GPS di ContaKM.
    $('btn-wecity').hidden = !prefs.wecity || ride.state !== 'idle';
    renderGps();
  }

  // ---------- Tachimetro analogico ----------

  const GAUGE_MAX_KMH = 50;
  const GAUGE_SWEEP = 270; // gradi, da -135 a +135 rispetto alla verticale
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const gaugeAngle = (kmhValue) => -GAUGE_SWEEP / 2 + (Math.min(kmhValue, GAUGE_MAX_KMH) / GAUGE_MAX_KMH) * GAUGE_SWEEP;

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  /** Punto sul cerchio di centro (100, 100): angolo 0 in alto, positivo in senso orario. */
  function gaugePoint(angle, r) {
    const rad = (angle * Math.PI) / 180;
    return [100 + r * Math.sin(rad), 100 - r * Math.cos(rad)];
  }

  function buildGauge() {
    const svg = $('gauge');
    const [sx, sy] = gaugePoint(-GAUGE_SWEEP / 2, 88);
    const [ex, ey] = gaugePoint(GAUGE_SWEEP / 2, 88);
    const arc = `M ${sx} ${sy} A 88 88 0 1 1 ${ex} ${ey}`;
    svg.append(
      svgEl('path', { d: arc, class: 'gauge-track', pathLength: 100 }),
      svgEl('path', { d: arc, class: 'gauge-fill', id: 'gauge-fill', pathLength: 100, 'stroke-dasharray': '0 100' }),
    );
    for (let v = 0; v <= GAUGE_MAX_KMH; v += 1) {
      const major = v % 10 === 0;
      const len = major ? 12 : v % 5 === 0 ? 8 : 4;
      const [x1, y1] = gaugePoint(gaugeAngle(v), 79);
      const [x2, y2] = gaugePoint(gaugeAngle(v), 79 - len);
      svg.append(svgEl('line', { x1, y1, x2, y2, class: major ? 'gauge-tick major' : 'gauge-tick' }));
      if (major) {
        const [lx, ly] = gaugePoint(gaugeAngle(v), 58);
        const label = svgEl('text', { x: lx, y: ly, class: 'gauge-label' });
        label.textContent = v;
        svg.append(label);
      }
    }
    const value = svgEl('text', { x: 100, y: 160, class: 'gauge-value', id: 'gauge-value' });
    value.textContent = '0';
    const needle = svgEl('g', { class: 'gauge-needle', id: 'gauge-needle' });
    needle.append(svgEl('line', { x1: 100, y1: 112, x2: 100, y2: 26 }), svgEl('circle', { cx: 100, cy: 100, r: 7 }));
    svg.append(value, needle);
  }

  function renderGauge(speedKmh) {
    $('gauge-needle').style.transform = `rotate(${gaugeAngle(speedKmh)}deg)`;
    $('gauge-fill').setAttribute('stroke-dasharray', `${(Math.min(speedKmh, GAUGE_MAX_KMH) / GAUGE_MAX_KMH) * 100} 100`);
    $('gauge-value').textContent = String(Math.round(speedKmh));
  }

  function applySpeedStyle() {
    const analog = prefs.speedStyle === 'analog';
    $('speed').hidden = analog;
    $('gauge').toggleAttribute('hidden', !analog); // su un svg la proprietà hidden non esiste
  }

  function toggleSpeedStyle() {
    prefs.speedStyle = prefs.speedStyle === 'analog' ? 'digital' : 'analog';
    savePrefs();
    applySpeedStyle();
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
    if (native.isNative) native.statusBar(prefs.sun);
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
    bikeType: activeBike().type,
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
    if (!Recognition || native.isNative) return; // nella WebView di Android il riconoscimento vocale non funziona
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
    const bike = activeBike();
    const data = { ...ride.toJSON(), endedAt: Date.now(), bikeId: bike.id };
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
    renderBikes();
    openDetail(data, 'Uscita salvata');
    const due = bikeLib.dueItems(bike, store.loadHistory(), bikeList);
    if (due.length) {
      toast(`Manutenzione per ${bike.name}: ${due.map((i) => i.label.toLowerCase()).join(', ')}`);
    }
  }

  let historyFilter = 'all';

  function renderHistoryFilter() {
    const root = $('history-filter');
    root.hidden = bikeList.length < 2;
    if (!bikeList.some((b) => b.id === historyFilter)) historyFilter = 'all';
    const options = [{ id: 'all', name: 'Tutte' }, ...bikeList];
    root.replaceChildren(...options.map((o) => {
      const btn = document.createElement('button');
      btn.textContent = o.name;
      btn.setAttribute('aria-pressed', o.id === historyFilter);
      btn.addEventListener('click', () => {
        historyFilter = o.id;
        renderHistory();
      });
      return btn;
    }));
  }

  function renderHistory() {
    const allRides = store.loadHistory();
    renderHistoryFilter();
    const filtered = historyFilter === 'all' ? allRides : bikeLib.ridesOf(findBike(historyFilter), allRides, bikeList);
    const all = summarize(allRides);
    historyM = all.totalM;
    renderTotal();
    const history = filtered;
    const s = summarize(history);
    $('week-km').textContent = number(s.weekM / 1000, 1);
    $('month-km').textContent = number(s.monthM / 1000, 1);
    $('total-km').textContent = number(s.totalM / 1000, 1);
    $('total-rides').textContent = s.rides;

    // L'obiettivo della settimana vale per tutte le bici insieme.
    const goal = prefs.weeklyGoalKm;
    $('goal').hidden = !goal;
    $('goal-text').textContent = `Obiettivo settimana: ${number(all.weekM / 1000, 1)} di ${goal} km`;
    $('goal-fill').style.width = `${goal ? Math.min(100, (all.weekM / 1000 / goal) * 100) : 0}%`;

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
          textBlock('row-sub', [rideDate(r.startedAt), duration(r.movingMs), bikeList.length > 1 ? bikeOf(r).name : '']
            .filter(Boolean).join(' · ')),
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
    $('detail-bike-row').hidden = bikeList.length < 2;
    $('detail-bike').replaceChildren(...bikeList.map((b) => new Option(b.name, b.id)));
    $('detail-bike').value = bikeOf(r).id;
    const segments = trackSegments(r.track).map((s) => s.map((p) => [p[0], p[1]]));
    $('btn-gpx').hidden = segments.length === 0;
    $('detail').showModal();

    const mapEl = $('detail-map');
    mapEl.hidden = segments.length === 0;
    if (segments.length > 0) {
      detailMap = L.map(mapEl, { zoomControl: false, maxZoom: 19 });
      detailMap.attributionControl.setPrefix(false);
      const line = L.polyline(segments, { color: ROUTE_COLOR, weight: 6 });
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
    const point = (p) => `<trkpt lat="${p[0]}" lon="${p[1]}"><time>${new Date(r.startedAt + p[2] * 1000).toISOString()}</time></trkpt>`;
    const segments = trackSegments(r.track)
      .map((s) => `<trkseg>\n${s.map(point).join('\n')}\n</trkseg>`)
      .join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ContaKM" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Uscita ${new Date(r.startedAt).toLocaleDateString('it-IT')}</name><type>cycling</type>
${segments}
</trk>
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

  async function sharePosition() {
    if (!lastFix) {
      startGps();
      toast('Attendo il segnale GPS: riprova tra poco');
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${lastFix.lat.toFixed(5)}&mlon=${lastFix.lon.toFixed(5)}#map=17/${lastFix.lat.toFixed(5)}/${lastFix.lon.toFixed(5)}`;
    try {
      if (native.isNative) {
        await native.share({ title: 'La mia posizione', text: 'Sono qui in bici:', url });
      } else if (navigator.share) {
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
      bikeList = store.loadBikes();
      renderHistory();
      renderBikes();
    } catch {
      toast('Questo file non è un backup di ContaKM');
    }
  }

  function setupSettings() {
    setupSegmented('set-accent', ACCENTS, 'accent');
    setupSegmented('set-km-alert', KM_ALERTS, 'kmAlert');
    setupToggle('set-wecity', 'wecity');
    $('set-wecity').addEventListener('click', render);
    $('btn-wecity').href = wecityLink();
    if (native.isNative) {
      $('btn-wecity').addEventListener('click', (e) => {
        e.preventDefault();
        native.openApp('it.wecity.app3', WECITY_PLAY_URL);
      });
    }
    setupStepper('set-weight', 'weightKg', 1, 30, 200, render);
    setupStepper('set-goal', 'weeklyGoalKm', 10, 0, 1000);
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

  // ---------- Bici e manutenzione ----------

  const BIKE_TYPE_LABEL = Object.fromEntries(BIKE_TYPES.map((t) => [t.value, t.label]));
  const findBike = (id) => bikeList.find((b) => b.id === id);
  const activeBike = () => findBike(prefs.activeBikeId) || bikeList[0];
  const bikeOf = (r) => findBike(r.bikeId) || bikeList[0];
  const longDate = (ms) => new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  let editingBikeId = null;
  let editingItemId = null;

  function saveBikes() {
    store.saveBikes(bikeList);
    renderBikes();
  }

  /** Tutto quello che mostra le bici: home, elenco in Altro e, se aperta, la scheda della bici. */
  function renderBikes() {
    renderBikePick();
    renderBikeList();
    if ($('bike').open) renderBikeSheet();
  }

  function bikeSub(b, history) {
    const type = `${BIKE_TYPE_LABEL[b.type]}${b.electric ? ' elettrica' : ''}`;
    return `${type} · ${number(bikeLib.bikeKm(b, history, bikeList), 0)} km`;
  }

  function renderBikePick() {
    const b = activeBike();
    $('bike-pick-name').textContent = b.name;
    $('bike-pick-due').hidden = bikeLib.dueItems(b, store.loadHistory(), bikeList).length === 0;
  }

  function bikeRow(b, history, onClick) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'row';
    btn.setAttribute('aria-current', b.id === activeBike().id);
    const title = b.id === activeBike().id ? `${b.name} · in uso` : b.name;
    btn.append(textBlock('row-title', title), textBlock('row-sub', bikeSub(b, history)));
    const due = bikeLib.dueItems(b, history, bikeList).length;
    if (due) btn.append(textBlock('row-sub row-due', due === 1 ? '1 manutenzione da fare' : `${due} manutenzioni da fare`));
    btn.addEventListener('click', onClick);
    li.append(btn);
    return li;
  }

  function renderBikeList() {
    const history = store.loadHistory();
    $('bike-list').replaceChildren(...bikeList.map((b) => bikeRow(b, history, () => openBike(b.id))));
  }

  function setActiveBike(id) {
    prefs.activeBikeId = id;
    store.savePrefs(prefs);
    renderBikes();
  }

  function openPicker() {
    if (ride.state !== 'idle') {
      toast('La bici si cambia a uscita finita');
      return;
    }
    const history = store.loadHistory();
    $('picker-list').replaceChildren(...bikeList.map((b) => bikeRow(b, history, () => {
      setActiveBike(b.id);
      $('bike-picker').close();
      toast(`Bici: ${b.name}`);
    })));
    $('bike-picker').showModal();
  }

  function addBike() {
    const b = bikeLib.createBike({ name: `Bici ${bikeList.length + 1}`, type: activeBike().type });
    bikeList.push(b);
    saveBikes();
    openBike(b.id);
    const name = $('bike-form').querySelector('[name="name"]');
    name.focus();
    name.select();
  }

  function openBike(id) {
    editingBikeId = id;
    fillBikeForm();
    renderBikeSheet();
    $('bike').showModal();
    $('bike').scrollTop = 0;
  }

  function fillBikeForm() {
    const b = findBike(editingBikeId);
    const form = $('bike-form');
    for (const input of form.querySelectorAll('input[name]')) input.value = b[input.name] ?? '';
    paintBikeType();
    $('bike-electric').setAttribute('aria-pressed', b.electric);
  }

  function paintBikeType() {
    const b = findBike(editingBikeId);
    $('bike-type').querySelectorAll('button').forEach((btn, i) => {
      btn.setAttribute('aria-pressed', BIKE_TYPES[i].value === b?.type);
    });
  }

  function maintLeftText(st) {
    if (st.due) return 'da fare';
    const parts = [];
    if (st.kmLeft != null) parts.push(`${number(Math.max(0, st.kmLeft), 0)} km`);
    if (st.daysLeft != null) {
      parts.push(st.daysLeft > 60 ? `${Math.round(st.daysLeft / 30.44)} mesi` : `${Math.max(0, st.daysLeft)} giorni`);
    }
    return `tra ${parts.join(' o ')}`;
  }

  function intervalText(item) {
    const parts = [];
    if (item.everyKm) parts.push(`${number(item.everyKm, 0)} km`);
    if (item.everyMonths) parts.push(item.everyMonths === 1 ? '1 mese' : `${item.everyMonths} mesi`);
    return `Ogni ${parts.join(' o ')}`;
  }

  function maintRow(b, item, kmNow) {
    const st = bikeLib.itemStatus(item, kmNow);
    const li = document.createElement('li');
    li.className = 'maint-item';
    li.dataset.due = st.due ? '1' : '';

    const head = document.createElement('div');
    head.className = 'maint-head';
    head.append(textBlock('maint-label', item.label), textBlock('maint-left', maintLeftText(st)));

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.min(100, st.ratio * 100)}%`;
    fill.dataset.due = st.due ? '1' : '';
    bar.append(fill);

    const last = item.log?.length
      ? `Fatta il ${longDate(item.doneAt)} a ${number(item.doneAtKm, 0)} km`
      : `Conteggio dal ${longDate(item.doneAt)} a ${number(item.doneAtKm, 0)} km`;

    const actions = document.createElement('div');
    actions.className = 'maint-actions';
    const edit = document.createElement('button');
    edit.className = 'btn btn-secondary';
    edit.textContent = intervalText(item);
    edit.addEventListener('click', () => openMaintEditor(item.id));
    const done = document.createElement('button');
    done.className = 'btn btn-primary';
    done.textContent = 'Fatto';
    done.addEventListener('click', () => {
      if (!done.dataset.armed) {
        done.dataset.armed = '1';
        done.textContent = 'Confermi?';
        return;
      }
      bikeLib.markDone(item, kmNow);
      saveBikes();
      toast(`${item.label}: segnata`);
    });
    actions.append(edit, done);

    li.append(head, bar, textBlock('maint-last', last), actions);
    return li;
  }

  function renderBikeSheet() {
    const b = findBike(editingBikeId);
    if (!b) return;
    const history = store.loadHistory();
    const s = summarize(bikeLib.ridesOf(b, history, bikeList));
    const kmNow = bikeLib.bikeKm(b, history, bikeList);
    const isActive = b.id === activeBike().id;
    $('bike-title').textContent = b.name;
    $('btn-bike-use').hidden = isActive || ride.state !== 'idle';
    $('bike-in-use').hidden = !isActive;
    $('bike-stats').replaceChildren(
      statTile(number(kmNow, 0), 'km totali'),
      statTile(String(s.rides), 'uscite'),
      statTile(number(s.monthM / 1000, 1), 'km mese'),
      statTile(km(s.longestM), 'km più lunga'),
      statTile(kmh(s.bestAvgMs), 'media top'),
      statTile(kmh(s.topSpeedMs), 'km/h max'),
    );
    $('bike-maint').replaceChildren(...bikeLib.visibleItems(b).map((item) => maintRow(b, item, kmNow)));
    const del = $('btn-bike-delete');
    del.hidden = bikeList.length < 2;
    del.dataset.armed = '';
    del.textContent = 'Elimina bici';
  }

  function onBikeField(e) {
    const b = findBike(editingBikeId);
    const { name, value } = e.target;
    if (name === 'name') b.name = value.trim() || 'Senza nome';
    else if (name === 'weightKg') b.weightKg = Number(value) || null;
    else if (name === 'startKm') bikeLib.setStartKm(b, Math.max(0, Number(value) || 0));
    else b[name] = value.trim();
    saveBikes();
  }

  function deleteBike() {
    const del = $('btn-bike-delete');
    const b = findBike(editingBikeId);
    const others = bikeList.filter((x) => x.id !== b.id);
    if (!del.dataset.armed) {
      del.dataset.armed = '1';
      del.textContent = `Sicuro? Le sue uscite passano a ${others[0].name}`;
      return;
    }
    const first = bikeList[0].id;
    store.saveHistory(store.loadHistory().map((r) => ((r.bikeId || first) === b.id ? { ...r, bikeId: others[0].id } : r)));
    bikeList = others;
    if (prefs.activeBikeId === b.id) {
      prefs.activeBikeId = others[0].id;
      store.savePrefs(prefs);
    }
    $('bike').close();
    saveBikes();
    toast(`${b.name} eliminata`);
  }

  function openMaintEditor(itemId) {
    editingItemId = itemId;
    const item = itemId && findBike(editingBikeId).maintenance.find((i) => i.id === itemId);
    $('maint-edit-title').textContent = item ? 'Modifica voce' : 'Nuova voce';
    $('maint-label').value = item?.label ?? '';
    $('maint-km').value = item?.everyKm ?? '';
    $('maint-months').value = item?.everyMonths ?? '';
    $('btn-maint-delete').hidden = !item;
    $('btn-maint-delete').dataset.armed = '';
    $('btn-maint-delete').textContent = 'Elimina';
    $('maint-edit').showModal();
    if (!item) $('maint-label').focus();
  }

  function saveMaint() {
    const b = findBike(editingBikeId);
    const label = $('maint-label').value.trim();
    const everyKm = Math.round(Number($('maint-km').value)) || null;
    const everyMonths = Math.round(Number($('maint-months').value)) || null;
    if (!label) {
      toast('Scrivi cosa va fatto');
      return;
    }
    if (!everyKm && !everyMonths) {
      toast('Indica ogni quanti km o mesi');
      return;
    }
    const item = editingItemId && b.maintenance.find((i) => i.id === editingItemId);
    if (item) Object.assign(item, { label, everyKm, everyMonths });
    else bikeLib.addItem(b, { label, everyKm, everyMonths }, bikeLib.bikeKm(b, store.loadHistory(), bikeList));
    $('maint-edit').close();
    saveBikes();
  }

  function deleteMaint() {
    const btn = $('btn-maint-delete');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Sicuro?';
      return;
    }
    const b = findBike(editingBikeId);
    b.maintenance = b.maintenance.filter((i) => i.id !== editingItemId);
    $('maint-edit').close();
    saveBikes();
  }

  function setupBikes() {
    $('btn-bike-pick').addEventListener('click', openPicker);
    $('btn-picker-close').addEventListener('click', () => $('bike-picker').close());
    $('btn-picker-manage').addEventListener('click', () => {
      $('bike-picker').close();
      showView('more');
      $('bike-list').scrollIntoView({ block: 'center' });
    });
    $('btn-bike-add').addEventListener('click', addBike);
    $('btn-bike-close').addEventListener('click', () => $('bike').close());
    $('btn-bike-use').addEventListener('click', () => {
      setActiveBike(editingBikeId);
      toast(`Bici: ${findBike(editingBikeId).name}`);
    });
    $('btn-bike-delete').addEventListener('click', deleteBike);
    $('bike-form').querySelectorAll('input[name]').forEach((input) => {
      input.addEventListener(input.name === 'name' ? 'input' : 'change', onBikeField);
    });
    $('bike-type').replaceChildren(...BIKE_TYPES.map((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        findBike(editingBikeId).type = t.value;
        paintBikeType();
        saveBikes();
      });
      return btn;
    }));
    $('bike-electric').addEventListener('click', () => {
      const b = findBike(editingBikeId);
      b.electric = !b.electric;
      $('bike-electric').setAttribute('aria-pressed', b.electric);
      saveBikes();
    });
    $('btn-maint-add').addEventListener('click', () => openMaintEditor(null));
    $('btn-maint-close').addEventListener('click', () => $('maint-edit').close());
    $('btn-maint-save').addEventListener('click', saveMaint);
    $('btn-maint-delete').addEventListener('click', deleteMaint);
    $('detail-bike').addEventListener('change', (e) => {
      store.setRideBike(detailRide.startedAt, e.target.value);
      detailRide.bikeId = e.target.value;
      renderHistory();
      renderBikes();
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
    if (name === 'more') renderBikeList();
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
    $('speed-box').addEventListener('click', toggleSpeedStyle);
    $('speed-box').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSpeedStyle();
      }
    });

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

  if (!findBike(prefs.activeBikeId)) prefs.activeBikeId = bikeList[0].id;
  buildGauge();
  applySpeedStyle();
  setupBikes();
  renderBikePick();
  bindEvents();
  // Dati arrivati da un altro telefono: si ridisegna tutto quello che li mostra.
  cloud.init({
    toast,
    onPulled() {
      bikeList = store.loadBikes();
      Object.assign(prefs, store.loadPrefs());
      if (!findBike(prefs.activeBikeId)) prefs.activeBikeId = bikeList[0]?.id;
      applyPrefs();
      renderHistory();
      renderBikes();
    },
  });
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
  // Nell'app Android i file sono già nel telefono: il service worker non serve.
  if ('serviceWorker' in navigator && canInstall && !native.isNative) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Riaprendo l'app dal sottofondo la pagina non si ricarica: si controlla qui se c'è una versione nuova.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
    // Versione nuova pronta: si ricarica subito, ma mai durante un'uscita.
    let reloadPending = false;
    const reloadIfIdle = () => {
      if (ride.state === 'idle') location.reload();
      else reloadPending = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) reloadIfIdle();
    });
    setInterval(() => { if (reloadPending) reloadIfIdle(); }, 5000);
  }
})();
