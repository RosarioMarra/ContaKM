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

  globalThis.ContaKM ??= {};
  Object.assign(globalThis.ContaKM, { caloriesFor, startOfWeek, summarize });
})();
