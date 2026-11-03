// Sorgente GPS reale. Con ?demo nell'indirizzo viene usata sim.js al suo posto.

(() => {
  function watchPosition(onFix, onError) {
    if (!('geolocation' in navigator)) {
      onError({ code: 0 });
      return;
    }
    navigator.geolocation.watchPosition(
      (p) =>
        onFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          speed: p.coords.speed,
          heading: p.coords.heading,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          time: p.timestamp,
        }),
      onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.realGps = { watchPosition };
})();
