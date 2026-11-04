# ContaKM

Conta km e navigatore per la bici. È una web app installabile (PWA): niente account, niente chiavi API, i dati restano sul telefono.

## Provarla sul PC

Doppio clic su `index.html` (in Chrome, Edge o Firefox), oppure:

```bash
npm run dev
```

e apri http://localhost:5173/?demo per un giro simulato.

## Usarla sul telefono

Il GPS del telefono funziona solo su `https://`, quindi l'app va pubblicata su un hosting statico.

1. Crea la cartella da caricare:

   ```bash
   npm run pubblica
   ```

2. Apri https://app.netlify.com/drop e trascina lì la cartella `pubblica`.
3. Apri sul telefono l'indirizzo `https://….netlify.app` che ti viene dato.
4. Dal menu del browser scegli "Aggiungi a schermata Home".

Per aggiornare l'app, rifai il punto 1 e, nella pagina del sito su Netlify, carica di nuovo la cartella dalla sezione Deploys, così l'indirizzo non cambia. Sul telefono la nuova versione compare dalla seconda apertura dell'app.

Finché la bici è in movimento lo schermo resta acceso e l'app deve restare in primo piano: i browser sospendono il GPS delle pagine in sottofondo. I km si contano solo dopo aver premuto Avvia.

Il numero di satelliti non è disponibile nei browser: l'app mostra la precisione GPS in metri, che è il dato reale fornito dal telefono.

## App Android (Play Store)

La cartella `android/` è l'app nativa fatta con Capacitor: contiene gli stessi file del sito, quindi funziona anche senza internet. Dentro l'app voce, schermo acceso, condivisione e "Apri WeCity" usano le funzioni di Android.

Serve una volta sola: Node, Java 21 e l'Android SDK (Android Studio lo installa da solo).

1. La chiave di firma (`contakm-upload.jks`) non è nella repository. Va indicata in `android/keystore.properties`, che resta fuori da GitHub:

   ```properties
   storeFile=/percorso/di/contakm-upload.jks
   storePassword=…
   keyAlias=contakm
   keyPassword=…
   ```

2. Prima di ogni nuova versione aumenta `versionCode` (e `versionName`) in `android/app/build.gradle`: il Play Store rifiuta un numero già usato.
3. Crea il file da caricare:

   ```bash
   npm install
   npm run aab
   ```

   Il file è `android/app/build/outputs/bundle/release/app-release.aab`.

Informativa sulla privacy per la scheda del Play Store: https://rosariomarra.github.io/ContaKM/privacy.html

## WeCity

Il pulsante "Apri WeCity" apre l'app (`it.wecity.app3`) su Android; su iPhone porta all'App Store. Il tasto Start di WeCity va premuto a mano: una app non può toccare i pulsanti di un'altra. L'ordine giusto è prima WeCity, poi Avvia in ContaKM. Il pulsante si nasconde da Altro.

## Servizi gratuiti usati

| Cosa | Servizio |
| --- | --- |
| Mappa | OpenFreeMap, stile Positron, con OpenStreetMap come riserva |
| Ricerca luoghi | Photon (Komoot) |
| Percorsi bici (sempre il più breve) e istruzioni in italiano | Valhalla (FOSSGIS) |

Sono server pubblici offerti gratis per un uso moderato: vanno bene per uso personale, non per un'app con molti utenti.

## Sviluppo

```bash
npm test
```

- `js/` script classici che condividono l'oggetto `ContaKM`, così l'app parte anche aperta come file.
- `tools/make-icons.mjs` rigenera il logo e le icone.
