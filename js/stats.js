// Calcoli sullo storico delle uscite: totali, record e calorie stimate.

(() => {
  /** Stima con i valori MET del ciclismo, in base alla velocità media. */
  function caloriesFor(distanceM, movingMs, weightKg) {
    const hours = movingMs / 3600000;
    if (hours <= 0) return 0;
    const avgKmh = distanceM / 1000 / hours;
    const met = avgKmh < 16 ? 4 : avgKmh < 19 ? 6 : avgKmh < 22 ? 8 : avgKmh < 25 ? 10 : 12;
    return met * weightKg * hours;
  }

  /** Lunedì alle 00:00 della settimana di now. */
  function startOfWeek(now) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return day.getTime();
  }

  function startOfMonth(now) {
    const day = new Date(now);
    return new Date(day.getFullYear(), day.getMonth(), 1).getTime();
  }

  function summarize(history, now = Date.now()) {
    const week = startOfWeek(now);
    const month = startOfMonth(now);
    const sum = (rides) => rides.reduce((total, r) => total + r.distanceM, 0);
    const avgOf = (r) => (r.movingMs > 0 ? r.distanceM / (r.movingMs / 1000) : 0);
    return {
      rides: history.length,
      totalM: sum(history),
      weekM: sum(history.filter((r) => r.startedAt >= week)),
      monthM: sum(history.filter((r) => r.startedAt >= month)),
      longestM: Math.max(0, ...history.map((r) => r.distanceM)),
      bestAvgMs: Math.max(0, ...history.map(avgOf)),
      topSpeedMs: Math.max(0, ...history.map((r) => r.maxSpeedMs)),
    };
  }

  /** Record battuti da un'uscita rispetto alle precedenti (serve almeno un'uscita prima). */
  function newRecords(previous, r) {
    if (!previous.length) return [];
    const s = summarize(previous);
    const avg = r.movingMs > 0 ? r.distanceM / (r.movingMs / 1000) : 0;
    const out = [];
    if (r.distanceM > s.longestM) out.push('uscita più lunga');
    if (r.distanceM >= 2000 && avg > s.bestAvgMs) out.push('media più alta');
    if (r.maxSpeedMs > s.topSpeedMs) out.push('velocità massima');
    return out;
  }

  /** Km delle ultime n settimane (da lunedì), dalla più vecchia a quella in corso. */
  function weeklyTotals(history, now = Date.now(), n = 8) {
    const weekMs = 7 * 864e5;
    const current = startOfWeek(now);
    return Array.from({ length: n }, (_, i) => {
      const start = current - (n - 1 - i) * weekMs;
      const end = start + weekMs;
      const m = history.filter((r) => r.startedAt >= start && r.startedAt < end).reduce((t, r) => t + r.distanceM, 0);
      return { start, km: m / 1000 };
    });
  }

  /**
   * Profilo della velocità di un'uscita dai punti registrati ([lat, lon, secondi]):
   * velocità tra un punto e l'altro, smussata, solo dentro i tratti senza interruzioni.
   */
  function speedProfile(track, segmentsOf, distance) {
    const points = [];
    for (const seg of segmentsOf(track)) {
      for (let i = 1; i < seg.length; i++) {
        const dt = seg[i][2] - seg[i - 1][2];
        if (dt <= 0) continue;
        const d = distance({ lat: seg[i - 1][0], lon: seg[i - 1][1] }, { lat: seg[i][0], lon: seg[i][1] });
        points.push({ t: seg[i][2], kmh: (d / dt) * 3.6 });
      }
    }
    // Media mobile su 5 punti: toglie il tremolio del GPS senza cancellare le salite e le frenate
    return points.map((p, i) => {
      const win = points.slice(Math.max(0, i - 2), i + 3);
      return { t: p.t, kmh: win.reduce((s, q) => s + q.kmh, 0) / win.length };
    });
  }

  globalThis.ContaKM ??= {};
  Object.assign(globalThis.ContaKM, { caloriesFor, startOfWeek, summarize, newRecords, weeklyTotals, speedProfile });
})();
