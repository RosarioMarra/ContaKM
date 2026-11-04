// Funzioni che dentro l'app Android (Capacitor) passano dai plugin nativi:
// nella WebView di Android voce, schermo acceso, download e condivisione del browser non ci sono.
// Sul sito questo oggetto resta spento (isNative = false) e l'app usa le funzioni del browser.

(() => {
  const cap = globalThis.capacitorExports;
  const isNative = Boolean(cap?.Capacitor?.isNativePlatform?.());
  const plugin = (name) => (isNative ? cap.registerPlugin(name) : null);

  const KeepAwake = plugin('KeepAwake');
  const TextToSpeech = plugin('TextToSpeech');
  const AppLauncher = plugin('AppLauncher');
  const Filesystem = plugin('Filesystem');
  const Share = plugin('Share');

  const native = {
    isNative,

    say(text) {
      TextToSpeech.stop().catch(() => {});
      return TextToSpeech.speak({ text, lang: 'it-IT', rate: 1, category: 'playback' }).catch(() => {});
    },

    keepAwake(on) {
      return (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
    },

    /** Apre un'altra app dal suo nome di pacchetto; se manca apre la sua pagina sul Play Store. */
    async openApp(packageName, storeUrl) {
      try {
        const { completed } = await AppLauncher.openUrl({ url: packageName });
        if (completed) return;
      } catch { /* app non installata */ }
      await AppLauncher.openUrl({ url: storeUrl }).catch(() => {});
    },

    /** Salva il file nella cache dell'app e apre il menu Condividi (Drive, email, File…). */
    async saveFile(name, content) {
      const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
      await Share.share({ title: name, files: [uri] });
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
