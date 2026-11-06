// Account: accesso con Google tramite Supabase e copia online automatica (sync.js).
// Senza accesso l'app funziona come sempre, con i dati solo sul telefono.

(() => {
  const SUPABASE_URL = 'https://ndgbnovyjfoiiyjnicox.supabase.co';
  // Chiave pubblica: può stare nell'app, i dati sono protetti dalle regole RLS (supabase/schema.sql).
  const SUPABASE_KEY = 'sb_publishable_4FNJngjXcTGQS1b5TKs84Q_8O8Z89CS';
  const NATIVE_REDIRECT = 'io.github.rosariomarra.contakm://auth';
  // Google torna su questa pagina del sito (indirizzo già consentito in Supabase), che riapre l'app col codice.
  const NATIVE_LANDING = 'https://rosariomarra.github.io/ContaKM/app-login.html';
  const SYNC_DELAY_MS = 4000; // si aspetta un attimo per caricare più modifiche insieme

  const { store, sync, native } = globalThis.ContaKM;
  const $ = (id) => document.getElementById(id);

  let client = null;
  let user = null;
  let options = {};
  let timer = null;
  let running = null;
  let lastSyncAt = 0;
  let lastError = null;
  let handledCode = null;

  const timeOf = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  function render() {
    const text = $('account-text');
    if (!client) {
      $('btn-login').hidden = true;
      text.textContent = '';
      return;
    }
    $('btn-login').hidden = Boolean(user);
    for (const id of ['btn-sync', 'btn-logout']) $(id).hidden = !user;
    $('danger-zone').hidden = !user;
    $('account').dataset.signedIn = user ? '1' : '';
    options.onUser?.(user ? {
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      photo: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    } : null);
    if (!user) {
      text.textContent = 'Accedi con Google per salvare uscite, bici e preferenze anche online e ritrovarle su un altro telefono.';
      text.dataset.state = '';
      return;
    }
    let status = 'Sincronizzazione in attesa…';
    let state = 'wait';
    if (running) status = 'Sincronizzazione in corso…';
    else if (lastError) {
      status = navigator.onLine ? 'Sincronizzazione non riuscita: riprovo da solo.' : 'Sei offline: sincronizzo appena torna internet.';
      state = 'error';
    } else if (lastSyncAt) {
      status = `Tutto salvato online alle ${timeOf(lastSyncAt)}`;
      state = 'ok';
    }
    text.textContent = status;
    text.dataset.state = state;
  }

  function syncSoon(delay = SYNC_DELAY_MS) {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(runSync, delay);
  }

  async function runSync() {
    if (!user) return;
    if (running) {
      running.finally(() => syncSoon());
      return;
    }
    running = sync.syncNow(client, store, user.id);
    render();
    try {
      const { pulled } = await running;
      lastSyncAt = Date.now();
      lastError = null;
      if (pulled) options.onPulled?.();
    } catch (err) {
      lastError = err;
      console.warn('Sincronizzazione non riuscita', err);
    } finally {
      running = null;
      render();
    }
  }

  async function signIn() {
    if (!navigator.onLine) {
      options.toast?.('Per accedere serve internet');
      return;
    }
    if (native.isNative) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_LANDING, skipBrowserRedirect: true },
      });
      if (error) throw error;
      await native.openBrowser(data.url);
      return;
    }
    if (location.protocol === 'file:') {
      options.toast?.('L\'accesso funziona dal sito o dall\'app, non dal file aperto sul computer');
      return;
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) throw error;
  }

  /** L'app Android viene riaperta da Google con ?code=…: lo si scambia con la sessione. */
  async function handleAppUrl(url) {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    native.closeBrowser();
    const params = new URL(url).searchParams;
    const failure = params.get('error_description') || params.get('error');
    if (failure) {
      options.toast?.('Accesso non riuscito');
      return;
    }
    const code = params.get('code');
    if (!code || code === handledCode) return;
    handledCode = code;
    // All'avvio Android ripete il link che ha aperto l'app: se si è già dentro non serve rifare l'accesso.
    const { data: current } = await client.auth.getSession();
    if (current?.session) return;
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) options.toast?.('Accesso non riuscito: riprova');
  }

  async function signOut() {
    await client.auth.signOut({ scope: 'local' });
    options.toast?.('Sei uscito: i dati restano su questo telefono');
  }

  async function deleteAccount() {
    const btn = $('btn-delete-account');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Sicuro? Cancella i dati online';
      return;
    }
    btn.dataset.armed = '';
    btn.textContent = 'Elimina account';
    const { error } = await client.rpc('delete_my_account');
    if (error) {
      options.toast?.('Eliminazione non riuscita: controlla internet e riprova');
      return;
    }
    await client.auth.signOut({ scope: 'local' });
    store.saveSync({ ...store.loadSync(), userId: null, lastPushAt: 0, pulled: {} });
    options.toast?.('Account eliminato. Uscite e bici restano su questo telefono.');
  }

  const safely = (fn) => () => fn().catch((err) => {
    console.warn(err);
    options.toast?.('Qualcosa non ha funzionato: riprova');
  });

  function init(opts) {
    options = opts;
    if (!globalThis.supabase?.createClient) {
      render();
      return;
    }
    // Il codice di un accesso partito dall'app Android, finito per errore sul sito (manca la chiave che ha l'app):
    // lo si gira all'app invece di provare a usarlo qui.
    if (!native.isNative && /[?&]code=/.test(location.search) && /Android/i.test(navigator.userAgent)) {
      let verifier = null;
      try {
        verifier = localStorage.getItem('contakm.auth-code-verifier');
      } catch { /* niente */ }
      if (!verifier) {
        location.replace(`app-login.html${location.search}`);
        return;
      }
    }
    client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: !native.isNative,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'contakm.auth',
        ...(native.authStorage ? { storage: native.authStorage } : {}),
      },
    });
    if (native.isNative) native.onAppUrl((url) => handleAppUrl(url).catch(() => {}));
    client.auth.onAuthStateChange((_event, session) => {
      const before = user?.id;
      user = session?.user ?? null;
      render();
      // Mai chiamare Supabase dentro questo callback: si rimanda.
      if (user && user.id !== before) setTimeout(() => syncSoon(0), 0);
    });
    store.onLocalChange(() => syncSoon());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncSoon(0);
    });
    window.addEventListener('online', () => syncSoon(0));
    setInterval(() => syncSoon(0), 5 * 60 * 1000);

    $('btn-login').addEventListener('click', safely(signIn));
    $('btn-sync').addEventListener('click', () => syncSoon(0));
    $('btn-logout').addEventListener('click', safely(signOut));
    $('btn-delete-account').addEventListener('click', safely(deleteAccount));
    render();
  }

  globalThis.ContaKM.cloud = { init, syncSoon };
})();
