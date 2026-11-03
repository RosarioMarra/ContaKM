// Navigatore: ricerca luoghi (Photon), percorso bici (Valhalla) e avanzamento lungo il percorso.

(() => {
  const { decodePolyline6, distance, projectOnSegment } = globalThis.ContaKM;

  const PHOTON_URL = 'https://photon.komoot.io/api/';
  const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';

  const OFF_ROUTE_M = 40;
  const OFF_ROUTE_FIXES = 3;
  const ARRIVED_M = 25;
  const ANNOUNCE_FAR_M = 150;
  const ANNOUNCE_NEAR_M = 35;
  const DESTINATION_TYPES = new Set([4, 5, 6]);

  async function searchPlaces(query, near) {
    const params = new URLSearchParams({ q: query, limit: '8', lang: 'default' });
    if (near) {
      params.set('lat', near.lat);
      params.set('lon', near.lon);
    }
    const res = await fetch(`${PHOTON_URL}?${params}`);
    if (!res.ok) throw new Error(`Ricerca non riuscita (${res.status})`);
    const data = await res.json();
    const places = data.features.map((f) => {
      const p = f.properties;
      const street = [p.street, p.housenumber].filter(Boolean).join(' ');
      const title = p.name || street || p.city || 'Luogo';
      const details = [p.name ? street : '', p.city || p.county, p.state]
        .filter((part, i, all) => part && part !== title && all.indexOf(part) === i);
      return {
        title,
        subtitle: details.join(', '),
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      };
    });
    // OpenStreetMap ha spesso più oggetti per lo stesso luogo: in lista ne basta uno.
    const seen = new Set();
    return places.filter((place) => {
      const key = `${place.title}|${place.subtitle}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function requestRoute(from, to, options, heading) {
    const start = { lat: from.lat, lon: from.lon };
    if (heading != null) start.heading = Math.round(heading);
    const body = {
      locations: [start, { lat: to.lat, lon: to.lon }],
      costing: 'bicycle',
      costing_options: {
        bicycle: {
          bicycle_type: options.bikeType || 'Hybrid',
          // Sempre il percorso più breve: conta solo la distanza, stradine e vicoli compresi.
          shortest: true,
          use_living_streets: 1,
          avoid_bad_surfaces: 0,
        },
      },
      language: 'it-IT',
      units: 'kilometers',
    };
    const res = await fetch(`${VALHALLA_URL}?json=${encodeURIComponent(JSON.stringify(body))}`);
    if (!res.ok) throw new Error(`Percorso non trovato (${res.status})`);
    return (await res.json()).trip;
  }

  async function fetchRoute(from, to, options = {}) {
    let trip;
    try {
      trip = await requestRoute(from, to, options, options.heading);
    } catch (err) {
      // La direzione di marcia può far scartare tutte le strade vicine: si riprova senza.
      if (options.heading == null) throw err;
      trip = await requestRoute(from, to, options, null);
    }
    const leg = trip.legs[0];
    return {
      coords: decodePolyline6(leg.shape),
      distanceM: trip.summary.length * 1000,
      timeS: trip.summary.time,
      maneuvers: leg.maneuvers.map((m) => ({
        type: m.type,
        text: m.instruction,
        alert: m.verbal_transition_alert_instruction || m.instruction,
        spoken: m.verbal_pre_transition_instruction || m.instruction,
        index: m.begin_shape_index,
      })),
    };
  }

  /** Segue il ciclista lungo un percorso e dice cosa mostrare e cosa annunciare. */
  class NavSession {
    constructor(route) {
      this.route = route;
      this.cum = [0];
      for (let i = 1; i < route.coords.length; i++) {
        this.cum.push(this.cum[i - 1] + distance(route.coords[i - 1], route.coords[i]));
      }
      this.segment = 0;
      this.offRouteFixes = 0;
      this.announced = new Set();
    }

    /** Il segmento più vicino, cercando solo poco indietro e avanti per non saltare a un altro tratto. */
    locate(pos) {
      const { coords } = this.route;
      let best = { dist: Infinity, segment: this.segment, t: 0 };
      const from = Math.max(0, this.segment - 3);
      for (let i = from; i < coords.length - 1; i++) {
        if (this.cum[i] - this.cum[this.segment] > 500) break;
        const { dist, t } = projectOnSegment(pos, coords[i], coords[i + 1]);
        if (dist < best.dist) best = { dist, segment: i, t };
      }
      return best;
    }

    /**
     * Restituisce lo stato della navigazione per la posizione data:
     * manovra successiva, distanze, testo da pronunciare, fuori percorso, arrivo.
     */
    update(pos) {
      const { coords, maneuvers } = this.route;
      const here = this.locate(pos);
      this.segment = here.segment;

      const tolerance = Math.max(OFF_ROUTE_M, (pos.accuracy || 0) * 1.5);
      this.offRouteFixes = here.dist > tolerance ? this.offRouteFixes + 1 : 0;

      const segLen = this.cum[here.segment + 1] - this.cum[here.segment] || 0;
      const along = this.cum[here.segment] + segLen * here.t;
      const total = this.cum[coords.length - 1];
      const remainingM = Math.max(0, total - along);

      const nextIdx = maneuvers.findIndex((m) => m.index > 0 && this.cum[m.index] > along + 1);
      const next = nextIdx >= 0 ? maneuvers[nextIdx] : maneuvers[maneuvers.length - 1];
      const toNextM = Math.max(0, this.cum[next.index] - along);

      return {
        next,
        toNextM,
        remainingM,
        arrived: remainingM < ARRIVED_M,
        offRoute: this.offRouteFixes >= OFF_ROUTE_FIXES,
        say: this.announcement(next, nextIdx, toNextM),
      };
    }

    announcement(next, idx, toNextM) {
      const key = (stage) => `${idx}:${stage}`;
      if (toNextM <= ANNOUNCE_NEAR_M && !this.announced.has(key('near'))) {
        this.announced.add(key('near'));
        this.announced.add(key('far'));
        return next.alert;
      }
      // Un tratto corto non ha spazio per due avvisi: basta quello vicino.
      if (toNextM <= ANNOUNCE_FAR_M && toNextM > ANNOUNCE_NEAR_M * 2 && !this.announced.has(key('far'))) {
        this.announced.add(key('far'));
        return `Tra ${Math.round(toNextM / 10) * 10} metri, ${next.alert}`;
      }
      return null;
    }
  }

  /** Angolo della freccia per ogni tipo di manovra Valhalla. */
  function arrowAngle(type) {
    switch (type) {
      case 9: case 18: case 20: case 23: return 45;
      case 2: case 10: return 90;
      case 11: return 135;
      case 12: case 13: return 180;
      case 14: return -135;
      case 3: case 15: return -90;
      case 16: case 19: case 21: case 24: return -45;
      default: return 0;
    }
  }

  function maneuverIcon(type) {
    if (DESTINATION_TYPES.has(type)) return 'destination';
    if (type === 26 || type === 27) return 'roundabout';
    return 'arrow';
  }

  Object.assign(globalThis.ContaKM, { searchPlaces, fetchRoute, NavSession, arrowAngle, maneuverIcon });
})();
