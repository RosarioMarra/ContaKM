// Le bici: dati, km di ciascuna e profilo di manutenzione. Solo calcoli, niente interfaccia.
// Le distanze delle uscite sono in metri; quelle delle bici (km iniziali, manutenzione) in km.

(() => {
  const DAY_MS = 86400000;
  const MONTH_MS = 30.44 * DAY_MS;

  /** Voci di manutenzione di ogni bici nuova; ognuna si può modificare o togliere. */
  const MAINTENANCE_DEFAULTS = [
    { key: 'chain-lube', label: 'Lubrificazione catena', everyKm: 300 },
    { key: 'chain', label: 'Sostituzione catena', everyKm: 3000 },
    { key: 'brakes', label: 'Pastiglie freni', everyKm: 2000 },
    { key: 'tyres', label: 'Copertoni', everyKm: 4000 },
    { key: 'service', label: 'Tagliando completo', everyMonths: 12 },
    { key: 'battery', label: 'Controllo batteria', everyMonths: 6, electricOnly: true },
  ];

  const BIKE_TYPES = ['City', 'Hybrid', 'Road', 'Mountain'];

  /** Vernici proposte per la bici 3D; si può anche scegliere un colore qualsiasi. */
  const BIKE_COLORS = [
    { value: '#38bdf8', label: 'Azzurro' },
    { value: '#e5484d', label: 'Rosso' },
    { value: '#ff7a1a', label: 'Arancio' },
    { value: '#f5c518', label: 'Giallo' },
    { value: '#34d399', label: 'Verde' },
    { value: '#2f5bd3', label: 'Blu' },
    { value: '#f472b6', label: 'Rosa' },
    { value: '#eef1f5', label: 'Bianco' },
    { value: '#a8b3bf', label: 'Argento' },
    { value: '#24282e', label: 'Nero' },
  ];

  /** Telai della bici 3D. Se non è scelto, si deduce dal tipo di bici. */
  const FRAME_STYLES = [
    { value: 'classic', label: 'Classico' },
    { value: 'city', label: 'Città' },
    { value: 'mtb', label: 'MTB' },
    { value: 'road', label: 'Corsa' },
  ];
  const FRAME_FOR_TYPE = { City: 'city', Hybrid: 'classic', Road: 'road', Mountain: 'mtb' };

  const frameOf = (bike) => bike?.frame || FRAME_FOR_TYPE[bike?.type] || 'classic';
  const colorOf = (bike, fallback = '#38bdf8') => bike?.color || fallback;

  /** Su quale pezzo della bici 3D zoomare per una voce di manutenzione. */
  const PART_FOR_KEY = { 'chain-lube': 'chain', chain: 'chain', brakes: 'brakes', tyres: 'tyres', battery: 'battery', service: 'all' };
  // Prima i pezzi precisi: "cambio sella" è la sella, "cambio" da solo è il cambio della trasmissione.
  const PART_WORDS = [
    [/sell|reggisell/i, 'saddle'],
    [/manubr|sterz|campanel|luc/i, 'handlebar'],
    [/fren|pastigl|disc/i, 'brakes'],
    [/copert|gomm|pneum|ruot|camer/i, 'tyres'],
    [/batter|motor/i, 'battery'],
    [/caten|cambi|deragl|pignon|corona|trasmiss/i, 'chain'],
  ];
  function partFor(item) {
    if (item?.key && PART_FOR_KEY[item.key]) return PART_FOR_KEY[item.key];
    const found = PART_WORDS.find(([re]) => re.test(item?.label || ''));
    return found ? found[1] : 'all';
  }

  const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function maintenanceItem(fields, km, now) {
    return {
      id: newId('m'),
      key: fields.key || null,
      label: fields.label,
      everyKm: fields.everyKm || null,
      everyMonths: fields.everyMonths || null,
      electricOnly: Boolean(fields.electricOnly),
      doneAtKm: km,
      doneAt: now,
      log: [],
    };
  }

  /** Bici nuova: la manutenzione parte "appena fatta" ai km che ha già. */
  function createBike(fields = {}, now = Date.now()) {
    const startKm = Math.max(0, Number(fields.startKm) || 0);
    return {
      id: newId('b'),
      name: (fields.name || '').trim() || 'La mia bici',
      type: BIKE_TYPES.includes(fields.type) ? fields.type : 'Hybrid',
      electric: Boolean(fields.electric),
      brand: fields.brand || '',
      model: fields.model || '',
      size: fields.size || '',
      weightKg: Number(fields.weightKg) || null,
      purchasedOn: fields.purchasedOn || '',
      color: fields.color || null,
      frame: fields.frame || null,
      startKm,
      createdAt: now,
      maintenance: MAINTENANCE_DEFAULTS.map((d) => maintenanceItem(d, startKm, now)),
    };
  }

  /** Uscite di una bici. Quelle senza bici (vecchie o da un backup) vanno alla prima bici. */
  function ridesOf(bike, history, bikes) {
    const fallback = bikes?.[0]?.id;
    return history.filter((r) => (r.bikeId || fallback) === bike.id);
  }

  /** Km totali della bici: quelli che aveva più quelli registrati con ContaKM. */
  function bikeKm(bike, history, bikes) {
    return bike.startKm + ridesOf(bike, history, bikes).reduce((t, r) => t + r.distanceM, 0) / 1000;
  }

  function visibleItems(bike) {
    return bike.maintenance.filter((i) => !i.electricOnly || bike.electric);
  }

  /**
   * Stato di una voce: quanto manca alla prossima scadenza.
   * ratio va da 0 (appena fatta) a 1 (da fare); con km e mesi vale la scadenza più vicina.
   */
  function itemStatus(item, kmNow, now = Date.now()) {
    const kmSince = Math.max(0, kmNow - item.doneAtKm);
    const monthsSince = Math.max(0, (now - item.doneAt) / MONTH_MS);
    const ratios = [];
    if (item.everyKm) ratios.push(kmSince / item.everyKm);
    if (item.everyMonths) ratios.push(monthsSince / item.everyMonths);
    const ratio = ratios.length ? Math.max(...ratios) : 0;
    return {
      kmSince,
      monthsSince,
      kmLeft: item.everyKm ? item.everyKm - kmSince : null,
      daysLeft: item.everyMonths ? Math.round((item.everyMonths * MONTH_MS - (now - item.doneAt)) / DAY_MS) : null,
      ratio,
      due: ratio >= 1,
    };
  }

  function dueItems(bike, history, bikes, now = Date.now()) {
    const km = bikeKm(bike, history, bikes);
    return visibleItems(bike).filter((i) => itemStatus(i, km, now).due);
  }

  function markDone(item, kmNow, now = Date.now()) {
    item.log = [{ at: now, km: Math.round(kmNow) }, ...(item.log || [])].slice(0, 20);
    item.doneAtKm = kmNow;
    item.doneAt = now;
  }

  /**
   * Cambiano i km che la bici aveva prima di ContaKM: le voci mai segnate come fatte
   * si spostano di conseguenza, così non risultano scadute per errore.
   */
  function setStartKm(bike, startKm) {
    const delta = startKm - bike.startKm;
    bike.startKm = startKm;
    for (const item of bike.maintenance) {
      if (!item.log?.length) item.doneAtKm = Math.max(0, item.doneAtKm + delta);
    }
  }

  function addItem(bike, fields, kmNow, now = Date.now()) {
    const item = maintenanceItem(fields, kmNow, now);
    bike.maintenance.push(item);
    return item;
  }

  /**
   * Prima apertura con le bici: crea "La mia bici" dalle impostazioni di prima
   * e le assegna le uscite già salvate. Restituisce null se non c'è niente da cambiare.
   */
  function migrate(bikes, history, prefs, now = Date.now()) {
    if (bikes.length > 0) return null;
    const bike = createBike({ name: 'La mia bici', type: prefs.bikeType }, now);
    const totalKm = history.reduce((t, r) => t + r.distanceM, 0) / 1000;
    for (const item of bike.maintenance) item.doneAtKm = totalKm;
    const lube = bike.maintenance.find((i) => i.key === 'chain-lube');
    if (prefs.serviceEveryKm) lube.everyKm = prefs.serviceEveryKm;
    lube.doneAtKm = Math.min(totalKm, prefs.serviceAtKm || 0);
    return {
      bikes: [bike],
      history: history.map((r) => (r.bikeId ? r : { ...r, bikeId: bike.id })),
      activeBikeId: bike.id,
    };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.bikes = {
    MAINTENANCE_DEFAULTS,
    BIKE_COLORS,
    FRAME_STYLES,
    frameOf,
    colorOf,
    partFor,
    createBike,
    ridesOf,
    bikeKm,
    visibleItems,
    itemStatus,
    dueItems,
    markDone,
    setStartKm,
    addItem,
    migrate,
  };
})();
