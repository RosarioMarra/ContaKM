// Direzione della freccia sulla mappa: bussola del telefono (sensori di orientamento:
// magnetometro più giroscopio) da fermi e piano, GPS quando si pedala.

(() => {
  const RAD = Math.PI / 180;
  const GPS_MIN_SPEED_MS = 2.5; // 9 km/h: sopra, la direzione del GPS è più affidabile della bussola
  const SMOOTH = 0.2;           // filtro sui sensori: toglie il tremolio senza ritardare troppo

  const norm = (deg) => ((deg % 360) + 360) % 360;

  /**
   * Direzione verso cui "guarda" il telefono, da alpha/beta/gamma assoluti (alpha 0 = nord).
   * Telefono in piano: conta il lato alto dello schermo. Telefono dritto (sul manubrio): conta il retro.
   * screenAngle è la rotazione dello schermo (0 verticale, 90/270 orizzontale).
   */
  function compassHeading(alpha, beta, gamma, screenAngle = 0) {
    if (![alpha, beta, gamma].every(Number.isFinite)) return null;
    const cA = Math.cos(alpha * RAD); const sA = Math.sin(alpha * RAD);
    const cB = Math.cos(beta * RAD); const sB = Math.sin(beta * RAD);
    const cG = Math.cos(gamma * RAD); const sG = Math.sin(gamma * RAD);
    // Colonne della matrice di rotazione del dispositivo (x = est, y = nord).
    const xAxis = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG];
    const yAxis = [-cB * sA, cA * cB];
    const zAxis = [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB];
    const sT = Math.sin(screenAngle * RAD);
    const cT = Math.cos(screenAngle * RAD);
    const up = [sT * xAxis[0] + cT * yAxis[0], sT * xAxis[1] + cT * yAxis[1]];
    const back = [-zAxis[0], -zAxis[1]];
    const v = Math.hypot(...up) >= Math.hypot(...back) ? up : back;
    if (Math.hypot(...v) < 1e-6) return null;
    return norm(Math.atan2(v[0], v[1]) / RAD);
  }

  /** Media "circolare": da 350° a 10° passa per 0°, non per 180°. */
  function smoothAngle(prev, next, k = SMOOTH) {
    if (prev == null) return next;
    const diff = ((next - prev + 540) % 360) - 180;
    return norm(prev + diff * k);
  }

  /** Quale direzione usare: GPS in movimento, bussola da fermi o piano. */
  function bestHeading({ gps, speedMs, compass }) {
    if (gps != null && speedMs >= GPS_MIN_SPEED_MS) return gps;
    if (compass != null) return compass;
    return gps;
  }

  /** Ascolta la bussola del telefono e chiama onHeading con la direzione già filtrata. */
  function startCompass(onHeading) {
    let value = null;
    const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;
    const handle = (e) => {
      let h = null;
      if (Number.isFinite(e.webkitCompassHeading)) {
        // iPhone: la bussola è già pronta, ma va combinata con l'inclinazione come su Android.
        h = compassHeading(360 - e.webkitCompassHeading, e.beta, e.gamma, screenAngle());
      } else if (e.absolute || e.type === 'deviceorientationabsolute') {
        h = compassHeading(e.alpha, e.beta, e.gamma, screenAngle());
      }
      if (h == null) return;
      value = smoothAngle(value, h);
      onHeading(value);
    };
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handle);
    } else if ('ondeviceorientation' in window) {
      window.addEventListener('deviceorientation', handle);
    }
  }

  /** Su iPhone la bussola va chiesta con un tocco; altrove non serve. */
  async function askCompassPermission() {
    const ask = globalThis.DeviceOrientationEvent?.requestPermission;
    if (typeof ask !== 'function') return true;
    try {
      return (await ask.call(DeviceOrientationEvent)) === 'granted';
    } catch {
      return false;
    }
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.heading = { compassHeading, smoothAngle, bestHeading, startCompass, askCompassPermission };
})();
