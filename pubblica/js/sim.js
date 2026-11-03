// Giro simulato per provare l'app dal PC: apri l'app con ?demo nell'indirizzo.
// ?demo=off aggiunge una deviazione dal percorso, per provare il ricalcolo.

(() => {
  const { bearing, distance } = globalThis.ContaKM;

  const SPEED_MS = 7; // circa 25 km/h
  const DEMO_PATH = [
    { lat: 40.8518, lon: 14.2681 },
    { lat: 40.8467, lon: 14.2585 },
    { lat: 40.8385, lon: 14.2525 },
    { lat: 40.8359, lon: 14.2488 },
  ];

  let path = DEMO_PATH;
  let segment = 0;
  let t = 0;

  /** Il simulatore pedala lungo il percorso del navigatore appena viene calcolato. */
  function followPath(coords) {
    path = coords;
    segment = 0;
    t = 0;
  }

  function watchPosition(onFix) {
    const detour = new URLSearchParams(location.search).get('demo') === 'off';
    let ticks = 0;
    setInterval(() => {
      ticks++;
      let left = SPEED_MS;
      while (segment < path.length - 1) {
        const len = distance(path[segment], path[segment + 1]);
        const remaining = len * (1 - t);
        if (left < remaining) {
          t += left / len;
          break;
        }
        left -= remaining;
        segment++;
        t = 0;
      }
      const atEnd = segment >= path.length - 1;
      const a = path[segment];
      const b = path[Math.min(segment + 1, path.length - 1)];
      const pos = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
      const off = detour && ticks > 20 && ticks < 40 ? 0.002 : 0;
      onFix({
        lat: pos.lat + off,
        lon: pos.lon,
        speed: atEnd ? 0 : SPEED_MS + Math.sin(ticks / 5),
        heading: bearing(a, b),
        accuracy: 6,
        altitude: 30 + Math.sin(ticks / 40) * 12,
        time: Date.now(),
      });
    }, 1000);
  }

  globalThis.ContaKM.simGps = { watchPosition, followPath };
})();
