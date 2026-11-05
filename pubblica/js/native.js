// Funzioni che dentro l'app Android (Capacitor) passano dai plugin nativi:
// nella WebView di Android voce, schermo acceso, download e condivisione del browser non ci sono.
// Sul sito questo oggetto resta spento (isNative = false) e l'app usa le funzioni del browser.

(() => {
  const cap = globalThis.capacitorExports;
  const isNative = Boolean(cap?.Capacitor?.isNativePlatform?.());
  const plugin = (name) => (isNative ? cap.registerPlugin(name) : null);

  const KeepAwake = plugin('KeepAwake');
  const TextToSpeech = plugin('TextToSpeech');
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');
  const BackgroundGeolocation = plugin('BackgroundGeolocation');
  const LocalNotifications = plugin('LocalNotifications');
  const Browser = plugin('Browser');
  const App = plugin('App');

  // Un solo watcher alla volta: in uscita con la notifica (GPS anche a schermo spento), altrimenti senza.
  let gpsCallbacks = null;
  let watcherId = null;
  let watcherBackground = null;
  let watcherQueue = Promise.resolve();

  function toFix(l) {
    return {
      lat: l.latitude,
      lon: l.longitude,
      speed: l.speed,
      heading: l.bearing,
      accuracy: l.accuracy,
      altitude: l.altitude,
      time: l.time,
    };
  }

  function restartWatcher(background) {
    watcherQueue = watcherQueue.then(async () => {
      if (!gpsCallbacks || background === watcherBackground) return;
      if (watcherId != null) await BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => {});
      watcherBackground = background;
      const options = { requestPermissions: true, stale: false, distanceFilter: 0 };
      if (background) {
        options.backgroundTitle = 'ContaKM sta registrando l\'uscita';
        options.backgroundMessage = 'I km si contano anche a schermo spento. Tocca per aprire.';
      }
      watcherId = await BackgroundGeolocation.addWatcher(options, (location, error) => {
        if (error) {
          gpsCallbacks.onError({ code: error.code === 'NOT_AUTHORIZED' ? 1 : 2 });
          return;
        }
        if (location) gpsCallbacks.onFix(toFix(location));
      });
    }).catch(() => {});
    return watcherQueue;
  }

  const native = {
    isNative,

    say(text) {
      TextToSpeech.stop().catch(() => {});
      return TextToSpeech.speak({ text, lang: 'it-IT', rate: 1, category: 'playback' }).catch(() => {});
    },

    keepAwake(on) {
      return (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
    },

    /** Immagine (base64 senza intestazione) salvata nella cache e passata al menu Condividi (Instagram, WhatsApp…). */
    async shareImage(name, base64) {
      const { uri } = await Filesystem.writeFile({ path: name, data: base64, directory: 'CACHE' });
      await Share.share({ title: 'La mia uscita con ContaKM', files: [uri] });
    },

    /** Salva il file nella cache dell'app e apre il menu Condividi (Drive, email, File…). */
    async saveFile(name, content) {
      const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: name, files: [uri] });
    },

    /** GPS del telefono dal plugin: continua anche a schermo spento quando l'uscita è in corso. */
    watchPosition(onFix, onError) {
      gpsCallbacks = { onFix, onError };
      restartWatcher(false);
    },

    /** Accende o spegne la registrazione in sottofondo (con la notifica fissa di Android). */
    backgroundTracking(on) {
      if (on) LocalNotifications.requestPermissions().catch(() => {}); // Android 13+: serve per mostrare la notifica
      return restartWatcher(on);
    },

    /** Accesso con Google: la pagina si apre nel browser del telefono (Google non la permette dentro l'app). */
    openBrowser(url) {
      return Browser.open({ url, presentationStyle: 'popover' });
    },

    closeBrowser() {
      return Browser.close().catch(() => {});
    },

    /** Chiamata quando l'app viene aperta da un link io.github.rosariomarra.contakm://… (anche ad app chiusa). */
    onAppUrl(fn) {
      App.addListener('appUrlOpen', (e) => fn(e.url)).catch(() => {});
      App.getLaunchUrl().then((r) => r?.url && fn(r.url)).catch(() => {});
    },

    openSettings() {
      return BackgroundGeolocation.openSettings().catch(() => {});
    },

    share(options) {
      return Share.share(options);
    },

    /** Icone della barra di stato chiare sul tema scuro, scure sul tema sole. */
    statusBar(lightBackground) {
      return cap.SystemBars.setStyle({ style: lightBackground ? 'LIGHT' : 'DARK' }).catch(() => {});
    },
  };

  globalThis.ContaKM = Object.assign(globalThis.ContaKM || {}, { native });
})();
