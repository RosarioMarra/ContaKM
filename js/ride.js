// Il conta km: trasforma le posizioni GPS in distanza, velocità e tempi.

(() => {
  const { distance } = globalThis.ContaKM;

  const KMH = 3.6;
  const MAX_ACCURACY_M = 35;     // oltre questa imprecisione il punto viene scartato
  const MAX_PLAUSIBLE_MS = 30;   // 108 km/h: oltre è un salto del GPS
  const MOVING_MIN_MS = 2 / KMH; // sotto i 2 km/h si è fermi e il tempo si ferma da solo
  const SIGNAL_LOST_MS = 8000;
  const GAP_MS = 8000;           // GPS sospeso (schermo spento, altra app): il percorso riparte da un nuovo tratto
  const MAX_GAP_SPEED_MS = 50 / KMH; // il tratto senza GPS si conta solo se è plausibile in bici
  const TRACK_STEP_M = 25;
  const MAX_TRACK_JUMP_M = 150;  // tra due punti salvati di seguito, oltre è un salto del GPS
  const CLIMB_STEP_M = 4;        // filtra il rumore dell'altitudine GPS

  class Ride {
    constructor(saved = null) {
      this.state = 'idle'; // idle | running | paused
      this.startedAt = null;
      this.distanceM = 0;
      this.movingMs = 0;
      this.maxSpeedMs = 0;
      this.climbM = 0;
      this.track = [];
      if (saved) {
        Object.assign(this, saved);
        this.state = 'paused'; // dopo un riavvio si riparte sempre da pausa
      }
      this.speedMs = 0;
      this.prevFix = null;
      this.anchor = null;
      this.lastFixAt = 0;
      this.lastTickAt = null;
      this.trackingSince = 0; // da quando il GPS arriva senza interruzioni
      this.smoothAlt = null;
      this.climbRef = null;
    }

    start(now = Date.now()) {
      if (this.state === 'idle') this.startedAt = now;
      this.state = 'running';
      this.anchor = null;
      this.lastTickAt = now;
    }

    pause() {
      this.state = 'paused';
    }

    get moving() {
      return this.speedMs >= MOVING_MIN_MS;
    }

    get avgSpeedMs() {
      return this.movingMs > 0 ? this.distanceM / (this.movingMs / 1000) : 0;
    }

    /** fix: {lat, lon, speed (m/s o null), accuracy, altitude, time} */
    update(fix) {
      if (fix.accuracy > MAX_ACCURACY_M) return;
      this.lastFixAt = fix.time;

      const prev = this.prevFix;
      const stepDt = prev ? (fix.time - prev.time) / 1000 : 0;
      const stepDist = prev ? distance(prev, fix) : 0;

      // Un salto impossibile non deve toccare né velocità né distanza.
      if (stepDt > 0 && stepDist / stepDt > MAX_PLAUSIBLE_MS) return;
      this.prevFix = fix;

      let measured = fix.speed;
      if (measured == null || measured < 0) measured = stepDt > 0 ? stepDist / stepDt : 0;
      this.speedMs = stepDt > 0 && stepDt < 10 ? this.speedMs * 0.4 + measured * 0.6 : measured;
      if (this.speedMs < 0.3) this.speedMs = 0;

      if (this.state === 'running') this.addDistance(fix);
    }

    addDistance(fix) {
      if (this.anchor && fix.time - this.anchor.time > GAP_MS) {
        this.bridgeGap(fix);
        return;
      }
      // Da fermi il GPS "balla": conta solo uno spostamento vero e in movimento.
      if (!this.anchor || !this.moving) {
        this.anchor = fix;
        return;
      }
      const moved = distance(this.anchor, fix);
      if (moved < Math.max(4, fix.accuracy / 3)) return;
      this.distanceM += moved;
      this.anchor = fix;
      this.maxSpeedMs = Math.max(this.maxSpeedMs, this.speedMs);
      this.addTrackPoint(fix);
      this.updateClimb(fix.altitude);
    }

    /**
     * Il GPS è tornato dopo una pausa: niente linea dritta sulla mappa.
     * La distanza in linea d'aria e il suo tempo si contano solo se la velocità è da bici.
     */
    bridgeGap(fix) {
      const dt = fix.time - this.anchor.time;
      const gapM = distance(this.anchor, fix);
      const gapSpeed = gapM / (dt / 1000);
      if (gapSpeed >= MOVING_MIN_MS && gapSpeed <= MAX_GAP_SPEED_MS) {
        this.distanceM += gapM;
        this.movingMs += dt;
      }
      this.anchor = fix;
      this.trackingSince = fix.time;
      this.addTrackPoint(fix, true);
    }

    /** Punto del percorso: [lat, lon, secondi dalla partenza] e un 1 in fondo se apre un nuovo tratto. */
    addTrackPoint(fix, newSegment = false) {
      const last = this.track[this.track.length - 1];
      if (!newSegment && last && distance({ lat: last[0], lon: last[1] }, fix) < TRACK_STEP_M) return;
      const point = [
        +fix.lat.toFixed(5),
        +fix.lon.toFixed(5),
        Math.round((fix.time - this.startedAt) / 1000),
      ];
      if (newSegment && last) point.push(1);
      this.track.push(point);
    }

    updateClimb(altitude) {
      if (altitude == null) return;
      this.smoothAlt = this.smoothAlt == null ? altitude : this.smoothAlt * 0.8 + altitude * 0.2;
      if (this.climbRef == null) this.climbRef = this.smoothAlt;
      const diff = this.smoothAlt - this.climbRef;
      if (diff >= CLIMB_STEP_M) {
        this.climbM += diff;
        this.climbRef = this.smoothAlt;
      } else if (diff < 0) {
        this.climbRef = this.smoothAlt;
      }
    }

    /**
     * Da chiamare ogni secondo: aggiorna il tempo anche se il GPS tace.
     * In sottofondo Android rallenta i timer: il tempo trascorso si conta tutto, ma solo dal momento
     * in cui il GPS è tornato dopo un'interruzione (quello prima lo conta già bridgeGap).
     */
    tick(now = Date.now()) {
      if (this.lastFixAt && now - this.lastFixAt > SIGNAL_LOST_MS) this.speedMs = 0;
      if (this.state === 'running' && this.moving && this.lastTickAt) {
        this.movingMs += Math.max(0, now - Math.max(this.lastTickAt, this.trackingSince));
      }
      this.lastTickAt = now;
    }

    hasSignal(now = Date.now()) {
      return this.lastFixAt > 0 && now - this.lastFixAt <= SIGNAL_LOST_MS;
    }

    /** Solo i dati che servono per riprendere o archiviare l'uscita. */
    toJSON() {
      return {
        startedAt: this.startedAt,
        distanceM: this.distanceM,
        movingMs: this.movingMs,
        maxSpeedMs: this.maxSpeedMs,
        climbM: this.climbM,
        track: this.track,
      };
    }
  }

  /**
   * Divide il percorso nei tratti registrati senza interruzioni del GPS.
   * Le uscite salvate prima non hanno il segno di nuovo tratto: lì il salto si riconosce dalla distanza,
   * perché pedalando i punti vengono salvati ogni 25 m circa.
   */
  function trackSegments(track) {
    const segments = [];
    let prev = null;
    for (const p of track) {
      const jump = prev && distance({ lat: prev[0], lon: prev[1] }, { lat: p[0], lon: p[1] }) > MAX_TRACK_JUMP_M;
      if (p[3] === 1 || jump || segments.length === 0) segments.push([]);
      prev = p;
      segments[segments.length - 1].push(p);
    }
    return segments.filter((s) => s.length >= 2);
  }

  globalThis.ContaKM.Ride = Ride;
  globalThis.ContaKM.trackSegments = trackSegments;
})();
