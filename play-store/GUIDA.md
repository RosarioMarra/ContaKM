# Pubblicare ContaKM sul Play Store

Tutto quello che serve è in questa cartella. Le schermate della Play Console cambiano nome ogni tanto: se una voce non è identica, cerca quella con il significato più vicino.

| File | Dove va nella Play Console |
| --- | --- |
| `ContaKM-1.16.aab` (te l'ho mandato a parte) | Test → Test chiuso → Crea release |
| `icona-512.png` | Scheda dello store → Icona dell'app |
| `grafica-in-evidenza-1024x500.jpg` | Scheda dello store → Grafica in evidenza |
| `screenshot-telefono/it/01…08.jpg` | Scheda dello store (italiano) → Screenshot telefono |
| `screenshot-telefono/en/01…08.jpg` | Scheda dello store (inglese) → Screenshot telefono |
| `screenshot-tablet/*.jpg` | Screenshot tablet da 7" e da 10" (facoltativi, ma fanno vedere la dashboard) |

La **chiave di firma** (`contakm-upload.jks` e `PASSWORD.txt`) non è qui: tienila al sicuro, serve per ogni aggiornamento.

---

## 1. Account sviluppatore (una volta sola)

1. Vai su <https://play.google.com/console/signup> con il tuo account Google.
2. Tipo di account: **Personale**.
3. Paga la quota **una tantum di 25 $**. Dopo il pagamento puoi togliere la carta da <https://pay.google.com>.
4. Completa la **verifica dell'identità** (documento) e del numero di telefono. Può richiedere qualche giorno.

## 2. Crea l'app

**Tutte le app → Crea app**

- Nome dell'app: `ContaKM – Conta km per bici`
- Lingua predefinita: **Italiano – it-IT**
- App o gioco: **App**
- Gratuita o a pagamento: **Gratuita** (non si potrà più cambiare in "a pagamento")
- Spunta le due dichiarazioni e premi **Crea app**.

## 3. Configura l'app (menu "Contenuti dell'app")

### Norme sulla privacy
`https://rosariomarra.github.io/ContaKM/privacy.html`

### Accesso all'app
**Tutte le funzionalità sono disponibili senza restrizioni di accesso.**
L'accesso con Google è facoltativo: serve solo per la copia online; l'app funziona tutta anche senza.

### Annunci
**No, la mia app non contiene annunci.**

### Classificazione dei contenuti
Categoria: **Utilità, produttività, comunicazione o altro**. Risposte:
- Violenza, paura, sesso, linguaggio volgare, droghe, gioco d'azzardo: **No** a tutto.
- Gli utenti possono interagire o scambiarsi contenuti tra loro nell'app? **No.**
- L'app condivide la posizione dell'utente con altri utenti? **Sì** — il pulsante "Condividi la mia posizione" permette all'utente di inviare la propria posizione a chi vuole, tramite le app del telefono.
- L'app permette acquisti di beni digitali? **No.**
- È un browser web o un motore di ricerca? **No.**

Il risultato atteso è "3+ / PEGI 3" (o simile).

### Pubblico di destinazione
Età: **18 e più** (puoi aggiungere 16-17 e 13-15; non scegliere fasce sotto i 13 anni, altrimenti si applicano le regole per le famiglie).
L'app può attirare i bambini involontariamente? **No.**

### App per la salute
ContaKM misura attività fisica (km, velocità, calorie stimate). Se compare la dichiarazione, scegli **Attività fisica e fitness** e indica che **non** è un dispositivo medico.

### Servizi in primo piano (obbligatorio per il GPS in sottofondo)
Tipo: **Posizione** (`FOREGROUND_SERVICE_LOCATION`).
- Descrizione da incollare:
  > Durante un'uscita in bici avviata dall'utente con il pulsante "Avvia" (o con il navigatore), ContaKM registra la posizione anche a schermo spento per contare i km e disegnare il percorso. Mentre registra, Android mostra sempre la notifica "ContaKM sta registrando l'uscita". La registrazione si ferma con Pausa o Termina.
- Impatto se interrotto: **i km e il percorso dell'uscita andrebbero persi o sarebbero sbagliati.**
- **Video** (30-60 secondi, caricalo su YouTube come "Non in elenco" e incolla il link). Registra lo schermo del telefono con l'app installata dal test:
  1. Apri ContaKM e premi **Avvia**.
  2. Mostra la notifica "ContaKM sta registrando l'uscita" (tira giù la tendina).
  3. Spegni lo schermo e fai qualche decina di metri a piedi o in bici.
  4. Riaccendi: i km sono aumentati. Premi **Pausa** e poi **Termina**: la notifica sparisce e compare "Uscita salvata".

### Eliminazione dell'account
- L'app consente di creare un account? **Sì.**
- Link per eliminare l'account: `https://rosariomarra.github.io/ContaKM/elimina-account.html`
- Gli utenti possono eliminare alcuni dati senza eliminare l'account? **Sì** (eliminando le singole uscite e bici).

### Sicurezza dei dati
Risposte generali:
- L'app raccoglie o condivide dati utente? **Sì.**
- Tutti i dati sono criptati in transito? **Sì** (HTTPS).
- Gli utenti possono chiedere l'eliminazione dei dati? **Sì** (stesso link qui sopra).

Dati raccolti (tutti **non condivisi** con terze parti, **non** usati per pubblicità):

| Tipo di dato | Raccolto | Facoltativo? | Scopi |
| --- | --- | --- | --- |
| Posizione → **Posizione esatta** | Sì | No (serve a contare i km e per il navigatore; con l'account le tracce vengono salvate online) | Funzionalità dell'app, Gestione account |
| Informazioni personali → **Indirizzo email** | Sì | Sì (solo con l'accesso Google) | Gestione account |
| Informazioni personali → **Nome** | Sì | Sì (solo con l'accesso Google) | Gestione account |
| Informazioni personali → **ID utente** | Sì | Sì (solo con l'accesso Google) | Gestione account |
| Salute e fitness → **Informazioni sul fitness** (km, velocità, tempi) | Sì | Sì (online solo con l'accesso Google) | Funzionalità dell'app |

Note per non sbagliare:
- Ricerca luoghi (Photon) e calcolo percorsi (Valhalla) ricevono la posizione solo quando l'utente cerca o avvia il navigatore: è un'azione avviata dall'utente, per questo non va indicata come "condivisione".
- Le uscite senza account restano **solo sul telefono**: dati trattati solo sul dispositivo non vanno dichiarati come raccolti.

### Altre dichiarazioni
- App governativa: **No**. Funzioni finanziarie: **Nessuna**. Notizie: **No**.

## 4. Scheda dello store principale

Categoria: **Salute e fitness** · Tag: Ciclismo, Attività fisica, Navigazione · Email di contatto: la tua email (sarà pubblica) · Sito web: `https://rosariomarra.github.io/ContaKM/`

### Italiano (it-IT)

**Nome (max 30):**
```
ContaKM – Conta km per bici
```

**Descrizione breve (max 80):**
```
Tachimetro, conta km e navigatore per bici ed e-bike, con la manutenzione.
```

**Descrizione completa (max 4000):**
```
ContaKM è il conta km per chi va in bici: grande, chiaro e facile da usare in sella. Niente pubblicità, niente abbonamenti, e i tuoi dati restano sul telefono.

CONTA KM IN TEMPO REALE
• Velocità grande e leggibile, anche al sole, con il tachimetro digitale o analogico
• Km percorsi, tempo in movimento, media, velocità massima, salita e calorie stimate
• Funziona anche a schermo spento: il GPS continua finché l'uscita è in corso
• Annunci a voce ogni 1, 5 o 10 km
• Blocco dei tocchi per non premere niente per sbaglio sul manubrio

NAVIGATORE PER LA BICI
• Cerca un indirizzo o un luogo, anche a voce
• Percorso più breve calcolato per la bici, con le indicazioni svolta per svolta e la voce in italiano
• La freccia segue la bussola del telefono, anche da fermo
• Se sbagli strada ricalcola da solo
• All'arrivo l'uscita si salva da sola, con il percorso sulla mappa

LE TUE BICI, IN 3D
• Aggiungi tutte le tue bici: città, MTB, corsa ed elettriche (e-city, e-trekking, e-MTB, e-gravel, cargo, pieghevole, fat)
• Scegli modello e colore e guardala in 3D: si gira con un dito e il campanello suona davvero
• Ogni uscita resta legata alla bici con cui l'hai fatta

MANUTENZIONE SOTTO CONTROLLO
• Promemoria per catena, freni, copertoni, tagliando e batteria, in km o in mesi
• Tocchi una voce e la bici 3D ti mostra il pezzo
• Avviso a fine uscita quando è ora di intervenire

STATISTICHE E USCITE
• Km della settimana e del mese, obiettivo settimanale e record personali
• Ogni uscita con il percorso sulla mappa e il file GPX da esportare
• Backup delle uscite in un file

IL TUO PROFILO
• Preferenze in un solo posto: colore dell'app, voce, peso, obiettivo
• Facoltativo: accedi con Google per avere una copia online e ritrovare uscite e bici su un altro telefono. Puoi eliminare l'account quando vuoi.

Mappe © OpenStreetMap. Percorsi e ricerca con servizi gratuiti basati su OpenStreetMap.
```

**Note di versione (1.16):**
```
Prima versione di ContaKM: conta km, navigatore per la bici, più bici in 3D (anche elettriche), manutenzione e profilo con copia online facoltativa.
```

### Inglese (en-US) — facoltativa ma consigliata
Aggiungi la lingua in **Scheda dello store → Gestisci traduzioni → Aggiungi le tue traduzioni → Inglese (Stati Uniti)** e carica gli screenshot della cartella `en`.

**Name:**
```
ContaKM – Bike computer
```

**Short description:**
```
Bike speedometer, ride tracker and bike navigation, with maintenance reminders.
```

**Full description:**
```
ContaKM is a bike computer for your phone: big, clear and easy to use while riding. No ads, no subscriptions, and your data stays on your phone.

LIVE RIDE TRACKING
• Big, readable speed, even in sunlight, with a digital or analogue speedometer
• Distance, moving time, average and top speed, climb and estimated calories
• Keeps tracking with the screen off while your ride is running
• Voice updates every 1, 5 or 10 km
• Touch lock so you don't press anything by mistake on the handlebar

BIKE NAVIGATION
• Search an address or place, also by voice
• Shortest route for bikes, turn-by-turn directions with voice guidance
• The arrow follows your phone's compass, even when standing still
• Automatic rerouting if you take a wrong turn
• Your ride is saved automatically when you arrive

YOUR BIKES, IN 3D
• Add all your bikes: city, MTB, road and e-bikes (e-city, e-trekking, e-MTB, e-gravel, cargo, folding, fat)
• Pick the model and colour and see it in 3D: spin it with a finger and ring the bell
• Every ride is linked to the bike you used

MAINTENANCE MADE EASY
• Reminders for chain, brakes, tyres, service and battery, by distance or time
• Tap an item and the 3D bike zooms in on the part
• A reminder at the end of a ride when something is due

STATS AND RIDES
• Weekly and monthly distance, weekly goal and personal records
• Every ride with its route on the map and a GPX file to export
• Back up your rides to a file

YOUR PROFILE
• All your preferences in one place: app colour, voice, weight, goal
• Optional: sign in with Google to keep an online copy and find your rides and bikes on another phone. You can delete your account at any time.

Maps © OpenStreetMap contributors. Routing and search by free OpenStreetMap-based services.
```

**Release notes:**
```
First release of ContaKM: ride tracking, bike navigation, multiple 3D bikes (e-bikes included), maintenance and a profile with optional online backup.
```

## 5. Carica l'app (test chiuso)

Per gli account personali nuovi Google chiede un **test chiuso con almeno 12 tester per 14 giorni** prima di poter pubblicare per tutti.

1. **Test → Test chiuso → Crea traccia** (o usa "Alpha").
2. **Tester**: crea un elenco email con **almeno 12 persone** (amici, familiari: servono account Google, va bene anche Gmail) e salvalo.
3. **Crea nuova release**:
   - Alla prima release accetta **Firma dell'app di Google Play** (Google conserva la chiave definitiva; la tua `contakm-upload.jks` resta la chiave di caricamento).
   - Carica `ContaKM-1.16.aab`.
   - Nome release: `1.16`. Note: quelle qui sopra.
4. **Paesi**: scegli almeno l'Italia.
5. **Invia per la revisione**. La prima revisione può richiedere da qualche ora a qualche giorno.
6. Quando è approvata, copia il **link per partecipare al test** e mandalo ai tester con questo messaggio:

```
Ciao! Sto pubblicando ContaKM, un conta km e navigatore per la bici.
Mi aiuti a provarla? Serve che resti installata per 14 giorni (puoi usarla quanto vuoi).
1) Apri questo link dal telefono Android e premi "Diventa un tester": [LINK]
2) Poi installala dal Play Store con il link che compare.
Grazie!
```

7. Dopo i 14 giorni, in **Dashboard** compare **Richiedi l'accesso in produzione**: rispondi alle domande sul test (come l'hai fatto provare e cosa hai migliorato).

## 6. Pubblica per tutti

**Produzione → Crea nuova release → Aggiungi dalla libreria** (scegli la stessa build o una più nuova), paesi, **Invia per la revisione**.

## 7. Aggiornamenti futuri

Ogni nuova versione deve avere un `versionCode` più alto: te lo preparo io quando mi chiedi le modifiche, insieme al nuovo file `.aab`, da caricare nella stessa traccia (test o produzione).
