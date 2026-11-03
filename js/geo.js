// Funzioni geografiche pure: nessuna dipendenza dal browser.
// I file sono script classici che condividono ContaKM: così l'app parte anche con un doppio clic.

(() => {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;

  /** Distanza in metri tra due punti {lat, lon}. */
  function distance(a, b) {
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Direzione in gradi (0 = nord) da a verso b. */
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x =
      Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
      Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  /** Decodifica una polyline con precisione 6 (formato Valhalla). */
  function decodePolyline6(str) {
    const coords = [];
    let i = 0, lat = 0, lon = 0;
    const next = () => {
      let shift = 0, result = 0, byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (i < str.length) {
      lat += next();
      lon += next();
      coords.push({ lat: lat / 1e6, lon: lon / 1e6 });
    }
    return coords;
  }

  /**
   * Proietta p sul segmento a-b.
   * Restituisce la distanza da p e la frazione (0..1) lungo il segmento.
   */
  function projectOnSegment(p, a, b) {
    const k = Math.cos(rad(p.lat));
    const ax = (a.lon - p.lon) * k, ay = a.lat - p.lat;
    const bx = (b.lon - p.lon) * k, by = b.lat - p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2));
    const closest = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
    return { dist: distance(p, closest), t };
  }

  globalThis.ContaKM ??= {};
  Object.assign(globalThis.ContaKM, { distance, bearing, decodePolyline6, projectOnSegment });
})();
