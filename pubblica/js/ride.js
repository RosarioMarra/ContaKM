// Il conta km: trasforma le posizioni GPS in distanza, velocità e tempi.

(() => {
  const { distance } = globalThis.ContaKM;

  const KMH = 3.6;
  const MAX_ACCURACY_M = 35;     // oltre questa imprecisione il punto viene scartato
  const MAX_PLAUSIBLE_MS = 30;   // 108 km/h: oltre è un salto del GPS
  const MOVING_MIN_MS = 2 / KMH; // sotto i 2 km/h si è fermi e il tempo si ferma da solo
  const SIGNAL_LOST_MS = 8000;
  const TRACK_STEP_M = 25;
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

    addTrackPoint(fix) {
      const last = this.track[this.track.length - 1];
      if (last && distance({ lat: last[0], lon: last[1] }, fix) < TRACK_STEP_M) return;
      this.track.push([
        +fix.lat.toFixed(5),
        +fix.lon.toFixed(5),
        Math.round((fix.time - this.startedAt) / 1000),
      ]);
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

    /** Da chiamare ogni secondo: aggiorna il tempo anche se il GPS tace. */
    tick(now = Date.now()) {
      if (this.lastFixAt && now - this.lastFixAt > SIGNAL_LOST_MS) this.speedMs = 0;
      if (this.state === 'running' && this.moving && this.lastTickAt) {
        this.movingMs += now - this.lastTickAt;
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

  globalThis.ContaKM.Ride = Ride;
})();
