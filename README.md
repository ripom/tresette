# 🃏 Tresette — Carte Napoletane

Gioco di carte **Tresette** con carte napoletane, giocabile in modalità **singolo giocatore** (vs CPU con 4 livelli di difficoltà) e **multiplayer online** via Firebase.

**Versione:** 3.0.0

## 📸 Caratteristiche

- 🎮 **Gioco singolo** contro CPU con 4 livelli: Facile, Medio, Difficile, Adattivo (impara il tuo stile!)
- 🌐 **Multiplayer online** in tempo reale via Firebase Realtime Database
- 🔻 **Due modalità**: A Perdere e A Vincere (a coppie)
- 🏆 **Tornei** con classifica progressiva
- 👥 **Sistema sociale**: amici, inviti, presenza online
- 🔑 **Autenticazione**: login/registrazione opzionale, o gioco come ospite
- 📊 **Statistiche**: dashboard con metriche dettagliate per ogni giocatore
- 🎯 **Skill tracking**: sistema di bravura adattivo (Principiante → Maestro)
- 🔊 **Audio**: effetti sonoro sintetizzati (niente file audio esterni)
- 📱 **Responsive**: ottimizzato per desktop, tablet e mobile

---

## 🔧 Prerequisiti

1. **Node.js** (v16+) — per installare Firebase CLI
2. **Firebase CLI** — per il deploy su Firebase Hosting
3. **Account Google** — per accedere a Firebase Console
4. **Progetto Firebase** — creato nella Firebase Console

### Installare Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

---

## 🏗️ Creare il progetto Firebase

### 1. Crea un nuovo progetto

1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Clicca **"Aggiungi progetto"**
3. Inserisci un nome (es. `tresette-game`)
4. (Opzionale) Abilita Google Analytics
5. Clicca **"Crea progetto"**

### 2. Abilita Authentication

1. Nel menu laterale → **Build** → **Authentication**
2. Clicca **"Get started"**
3. Nella tab **"Sign-in method"**, abilita:
   - ✅ **Email/Password** (obbligatorio)
4. Clicca **"Save"**

### 3. Crea il Realtime Database

1. Nel menu laterale → **Build** → **Realtime Database**
2. Clicca **"Create Database"**
3. Scegli la **location** (consigliato: `europe-west1` per Europa)
4. Seleziona **"Start in locked mode"** (configureremo le regole dopo)
5. Clicca **"Enable"**

### 4. Configura le Security Rules del Database

Vai in **Realtime Database** → tab **"Rules"** e incolla queste regole:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "admins": {
      ".read": "auth != null",
      ".write": "auth != null && (root.child('admins').child(auth.uid).exists() || !root.child('admins').exists())"
    },
    "rooms": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "lobby": {
      ".read": true,
      ".write": "auth != null"
    },
    "presence": {
      ".read": true,
      ".write": true
    },
    "friends": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "friendRequests": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null"
      }
    },
    "invitations": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null"
      }
    },
    "statistics": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Clicca **"Publish"** per salvare.

> **Nota sulle regole:**
> - `users/` — ogni utente legge/scrive solo i propri dati
> - `admins/` — leggibile da tutti gli utenti autenticati; scrivibile solo dagli admin (il primo utente diventa admin automaticamente)
> - `rooms/` — stanze di gioco multiplayer, accessibili a tutti gli utenti autenticati
> - `lobby/` — lista stanze pubbliche, leggibile anche senza login
> - `presence/` — stato online dei giocatori, pubblico
> - `friends/`, `friendRequests/`, `invitations/` — sistema sociale con permessi per utente
> - `statistics/` — statistiche globali delle partite

### 5. Abilita Firebase Hosting

1. Nel menu laterale → **Build** → **Hosting**
2. Clicca **"Get started"**
3. Segui la procedura guidata (la configurazione locale la faremo dopo)

### 6. Registra un'app Web

1. Nella **panoramica del progetto** (home), clicca l'icona **Web** (`</>`)
2. Dai un nickname all'app (es. `Tresette Web`)
3. ✅ Seleziona **"Also set up Firebase Hosting for this app"**
4. Clicca **"Register app"**
5. Firebase mostrerà la **configurazione** — copiala! (vedi sezione successiva)

---

## ⚙️ Configurazione del progetto

### 1. Copia la configurazione Firebase

Dalla schermata di registrazione dell'app (o da **Project Settings** → **General** → la tua app), copia i valori della configurazione.

Modifica il file **`firebase-config.json`** nella root del progetto:

```json
{
  "projectId": "IL-TUO-PROJECT-ID",
  "apiKey": "LA-TUA-API-KEY",
  "authDomain": "IL-TUO-PROJECT-ID.firebaseapp.com",
  "databaseURL": "https://IL-TUO-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app",
  "storageBucket": "IL-TUO-PROJECT-ID.appspot.com",
  "messagingSenderId": "IL-TUO-SENDER-ID",
  "appId": "IL-TUO-APP-ID"
}
```

Poi copia gli stessi valori nel file JavaScript:

**`js/shared/firebase-config.js`** (e `public/js/shared/firebase-config.js`):

```javascript
var FIREBASE_CONFIG = {
    projectId:          "IL-TUO-PROJECT-ID",
    apiKey:             "LA-TUA-API-KEY",
    authDomain:         "IL-TUO-PROJECT-ID.firebaseapp.com",
    databaseURL:        "https://IL-TUO-PROJECT-ID-default-rtdb.REGION.firebasedatabase.app",
    storageBucket:      "IL-TUO-PROJECT-ID.appspot.com",
    messagingSenderId:  "IL-TUO-SENDER-ID",
    appId:              "IL-TUO-APP-ID"
};
```

> **Dove trovare ogni valore:**
> | Campo | Dove trovarlo in Firebase Console |
> |-------|----------------------------------|
> | `projectId` | Project Settings → General → Project ID |
> | `apiKey` | Project Settings → General → Web API Key |
> | `authDomain` | È `{projectId}.firebaseapp.com` |
> | `databaseURL` | Realtime Database → nella barra dell'URL in alto |
> | `storageBucket` | Project Settings → General → Default GCS bucket |
> | `messagingSenderId` | Project Settings → Cloud Messaging → Sender ID |
> | `appId` | Project Settings → General → Your apps → App ID |

### 2. Inizializza Firebase nel progetto locale

```bash
firebase init
```

Seleziona:
- ✅ **Hosting: Configure files for Firebase Hosting**
- Scegli il progetto creato
- Public directory: **`public`**
- Single-page app: **No**
- Automatic builds: **No**

Oppure usa i file già presenti (`firebase.json` e `.firebaserc`), aggiornando `.firebaserc`:

```json
{
  "projects": {
    "default": "IL-TUO-PROJECT-ID"
  }
}
```

---

## 🚀 Deploy

```bash
firebase deploy --only hosting
```

Il gioco sarà disponibile su:
- `https://IL-TUO-PROJECT-ID.web.app`
- `https://IL-TUO-PROJECT-ID.firebaseapp.com`

---

## 🧪 Test in locale

### Aprire direttamente il file
Apri `index.html` nel browser (il file nella **root**, non in `public/`). Funziona per il gioco singolo. Il multiplayer richiede connessione internet per Firebase.

### Con Firebase Emulator (opzionale)
```bash
firebase emulators:start
```
Apri `http://localhost:5000`

---

## 📁 Struttura del progetto

```
tresette/
├── firebase.json           ← Configurazione Firebase Hosting
├── .firebaserc             ← Link al progetto Firebase
└── public/                 ← 📦 Cartella deployata su Firebase Hosting
    ├── index.html
    ├── stats.html
    ├── css/ js/ img/       ← (stessa struttura della root)
    └── firebase-config.json
```

---

## 🗄️ Struttura del Database Firebase

Il Realtime Database usa questi nodi principali:

| Nodo | Descrizione |
|------|-------------|
| `users/{uid}` | Profilo utente: email, nome, statistiche partite, profili AI |
| `admins/{uid}` | Lista admin (il primo utente viene promosso automaticamente) |
| `rooms/{roomCode}` | Stanze multiplayer: stato gioco, posti, metadata, messaggi |
| `lobby/{roomCode}` | Stanze pubbliche visibili nel browser stanze |
| `presence/{uid}` | Stato online/offline dei giocatori |
| `friends/{uid}` | Lista amici per utente |
| `friendRequests/{uid}` | Richieste di amicizia in arrivo |
| `invitations/{uid}` | Inviti a partite in arrivo |
| `statistics/games` | Log globale di tutte le partite giocate |

---

## 🔐 Sicurezza

- La **API Key di Firebase** è pubblica per design — non è un segreto. La sicurezza è garantita dalle **Security Rules** del database.
- Le **Security Rules** limitano chi può leggere/scrivere ogni nodo.
- Il file `firebase-config.json` nella root **non viene deployato** (è fuori dalla cartella `public/`).
- Le password degli utenti sono gestite interamente da Firebase Auth (mai salvate nel codice).

---

## 📝 Licenza

Questo gioco è un esperimento open source e non ha fini di lucro. Nessun dato personale viene salvato oltre allo stretto necessario per la partita.
