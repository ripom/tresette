// ─── Firebase Init (SDK loaded externally) ───
(function initFirebaseApp(){
  try {
    if(typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') {
      console.warn('[FIREBASE] SDK or config not available yet');
      // Still proceed to auth without Firebase
      setTimeout(function(){ showAuthForm('choice'); }, 100);
      return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    _fbDb = firebase.database();
    _fbReady = true;
    // Sync server time offset for accurate lease age calculations
    _fbDb.ref('.info/serverTimeOffset').on('value', function(snap) {
      _fbServerTimeOffset = snap.val() || 0;
      dbg('[FIREBASE] serverTimeOffset = ' + _fbServerTimeOffset + 'ms');
    });
    dbg('Firebase ready! DB URL: ' + _fbDb.app.options.databaseURL);
    // Listen for connectivity changes
    _fbDb.ref('.info/connected').on('value', function(snap) {
      dbg('[FIREBASE] .info/connected = ' + snap.val());
      if(snap.val() === true && mpMode && mpRoom) {
        dbg('[FIREBASE] Connectivity restored — scheduling meta check in 500ms (isHost='+isHost+' room='+mpRoom+')');
        // Resume duration timer
        if(game && game.phase === 'playing') { _gameStartedAt = Date.now(); }
        setTimeout(function(){ _checkMetaOnReconnect(); }, 500);
      } else if(snap.val() === false && mpMode) {
        dbg('[FIREBASE] Connection LOST (isHost='+isHost+' room='+mpRoom+')');
        // Pause duration timer
        if(game && game.phase === 'playing' && _gameStartedAt > 0) {
          _gameElapsedMs += Date.now() - _gameStartedAt;
          _gameStartedAt = 0;
        }
      }
    });
    // Make auth persistence explicit before checking the restored user state.
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(function() {
        _checkAuthState();
      })
      .catch(function(err) {
        console.warn('[AUTH] setPersistence failed:', err);
        _checkAuthState();
      });
  } catch(e) {
    console.error('[FIREBASE] Init failed:', e);
    // Still proceed to auth without Firebase
    setTimeout(function(){ showAuthForm('choice'); }, 100);
  }
})();

// ═══════════════════════════════════════════════════════════════
//  AUTH SYSTEM — Guest / Login / Register / Change Password
// ═══════════════════════════════════════════════════════════════
var _authUser = null; // firebase.User or null
var _isGuest = false;
var _guestDisplayName = '';

function showAuthForm(which) {
  var sections = ['auth-choice','auth-login','auth-register','auth-resetpwd','auth-logged','auth-changepwd'];
  sections.forEach(function(id){ document.getElementById(id).style.display = 'none'; });
  // Clear errors
  document.querySelectorAll('.auth-error').forEach(function(el){ el.textContent = ''; });
  if (which === 'choice') document.getElementById('auth-choice').style.display = 'flex';
  else if (which === 'login') document.getElementById('auth-login').style.display = 'block';
  else if (which === 'register') document.getElementById('auth-register').style.display = 'block';
  else if (which === 'resetpwd') document.getElementById('auth-resetpwd').style.display = 'block';
  else if (which === 'logged') document.getElementById('auth-logged').style.display = 'block';
  else if (which === 'changepwd') document.getElementById('auth-changepwd').style.display = 'block';
}

function _checkAuthState() {


  var auth = firebase.auth();


  if (!auth) { showAuthForm('choice'); return; }


  


  auth.onAuthStateChanged(function(user) {


    if (user) {


      _authUser = user;


      _isGuest = false;


      _guestDisplayName = '';


      dbg('[AUTH] Auto-login rilevato: ' + (user.displayName || user.email));


      var nameEl = document.getElementById('auth-logged-name');


      if (nameEl) nameEl.textContent = user.displayName || 'Giocatore';


      var emailEl = document.getElementById('auth-logged-email');


      if (emailEl) emailEl.textContent = user.email || '';


      


      _updateUserBadge();


      _syncNameFromAuth();


      var nameInput = document.getElementById('my-name-input');


      if (nameInput) nameInput.value = user.displayName || '';


      


      _registerUserInDb(user);


      _loadPlayerProfile();


      _setupPresence();


      _initSocialListeners();


      proceedToGame();


    } else {


      _authUser = null;


      var savedType = null;


      var savedGuest = null;


      try {


        savedType = localStorage.getItem('tresette_auth_type');


        savedGuest = localStorage.getItem('tresette_guest_name');


      } catch(e) {}


      if (savedType === 'guest' && savedGuest) {


        dbg('[AUTH] Auto-login ospite (da sessione pregressa): ' + savedGuest);


        _isGuest = true;


        _guestDisplayName = savedGuest;


        var ni = document.getElementById('my-name-input'); if(ni) ni.value = savedGuest;


        _updateUserBadge();


        _setupPresence();


        _initSocialListeners();


        proceedToGame();


      } else {


        try { localStorage.removeItem('tresette_auth_type'); localStorage.removeItem('tresette_guest_name'); } catch(e) {}


        showAuthForm('choice');


      }


    }


  });


}


function authAsGuest() {
  var guestNameInput = document.getElementById('auth-guest-name');
  var guestName = guestNameInput ? guestNameInput.value.trim() : '';
  var errEl = document.getElementById('guest-name-err');
  if (errEl) errEl.textContent = '';
  
  if (!guestName) {
    if (errEl) errEl.textContent = 'Inserisci il tuo nome.';
    return;
  }

  _isGuest = true;
  _authUser = null;
  _guestDisplayName = guestName;
  try { localStorage.setItem('tresette_auth_type', 'guest'); } catch(e) {}
  try { localStorage.setItem('tresette_guest_name', guestName); } catch(e) {}

  dbg('[AUTH] Accesso come ospite: ' + guestName);
  var ni = document.getElementById('my-name-input'); if(ni) ni.value = guestName;
  _updateUserBadge();
  _setupPresence();
  _initSocialListeners();
  proceedToGame();
}

function proceedToGame() {
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  // Always load skill profile (works for both logged-in users and guests via localStorage)
  if (!_profileLoaded) _loadPlayerProfile();
  _updateUserBadge();
  _syncNameFromAuth();
}

function doLogin() {
  var email = document.getElementById('auth-login-email').value.trim();
  var pwd = document.getElementById('auth-login-pwd').value;
  var errEl = document.getElementById('login-err');
  errEl.textContent = '';
  if (!email || !pwd) { errEl.textContent = 'Inserisci email e password.'; return; }
  if (typeof firebase === 'undefined' || !firebase.auth) { errEl.textContent = 'Firebase non ancora pronto. Riprova tra un momento.'; return; }
  dbg('[AUTH] Tentativo login: ' + email);
  firebase.auth().signInWithEmailAndPassword(email, pwd)
    .then(function(cred) {
      dbg('[AUTH] Login riuscito: ' + (cred.user.displayName || cred.user.email));
      _authUser = cred.user;
      _isGuest = false;
      _updateUserBadge();
      _syncNameFromAuth();
      var nameInput = document.getElementById('my-name-input');
      if (nameInput) nameInput.value = cred.user.displayName || '';
      _registerUserInDb(cred.user);
      _loadPlayerProfile();
      _setupPresence();
      _initSocialListeners();
      proceedToGame();
    })
    .catch(function(e) { dbg('[AUTH] Login fallito: ' + e.code); errEl.textContent = _authErrorMsg(e); });
}

function doRegister() {
  var name = document.getElementById('auth-reg-name').value.trim();
  var email = document.getElementById('auth-reg-email').value.trim();
  var pwd = document.getElementById('auth-reg-pwd').value;
  var pwd2 = document.getElementById('auth-reg-pwd2').value;
  var errEl = document.getElementById('register-err');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Inserisci il tuo nome.'; return; }
  if (!email) { errEl.textContent = 'Inserisci la tua email.'; return; }
  if (pwd.length < 6) { errEl.textContent = 'La password deve avere almeno 6 caratteri.'; return; }
  if (pwd !== pwd2) { errEl.textContent = 'Le password non corrispondono.'; return; }
  firebase.auth().createUserWithEmailAndPassword(email, pwd)
    .then(function(cred) {
      return cred.user.updateProfile({ displayName: name });
    })
    .then(function() {
      // Force state refresh
      _authUser = firebase.auth().currentUser;
      _isGuest = false;
      dbg('[AUTH] Registrazione riuscita: ' + name + ' (' + email + ')');
      document.getElementById('auth-logged-name').textContent = name;
      document.getElementById('auth-logged-email').textContent = email;
      _updateUserBadge();
      _syncNameFromAuth();
      var nameInput = document.getElementById('my-name-input');
      if (nameInput) nameInput.value = name;
      _registerUserInDb(_authUser);
      _loadPlayerProfile();
      _setupPresence();
      _initSocialListeners();
      proceedToGame();
    })
    .catch(function(e) { errEl.textContent = _authErrorMsg(e); });
}

function doResetPassword() {
  var email = document.getElementById('auth-reset-email').value.trim();
  var errEl = document.getElementById('resetpwd-err');
  errEl.textContent = '';
  if (!email) { errEl.textContent = 'Inserisci la tua email.'; return; }
  firebase.auth().sendPasswordResetEmail(email)
    .then(function() {
      errEl.style.color = '#4f4';
      errEl.textContent = '✅ Email di recupero inviata! Controlla la tua casella.';
    })
    .catch(function(e) { errEl.style.color = '#f66'; errEl.textContent = _authErrorMsg(e); });
}

function doChangePassword() {
  var oldPwd = document.getElementById('auth-old-pwd').value;
  var newPwd = document.getElementById('auth-new-pwd').value;
  var newPwd2 = document.getElementById('auth-new-pwd2').value;
  var errEl = document.getElementById('changepwd-err');
  errEl.textContent = '';
  if (!oldPwd) { errEl.textContent = 'Inserisci la password attuale.'; return; }
  if (newPwd.length < 6) { errEl.textContent = 'La nuova password deve avere almeno 6 caratteri.'; return; }
  if (newPwd !== newPwd2) { errEl.textContent = 'Le nuove password non corrispondono.'; return; }
  var user = firebase.auth().currentUser;
  if (!user || !user.email) { errEl.textContent = 'Devi essere loggato.'; return; }
  // Re-authenticate first
  var credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPwd);
  user.reauthenticateWithCredential(credential)
    .then(function() { return user.updatePassword(newPwd); })
    .then(function() {
      errEl.style.color = '#4f4';
      errEl.textContent = '✅ Password aggiornata con successo!';
      document.getElementById('auth-old-pwd').value = '';
      document.getElementById('auth-new-pwd').value = '';
      document.getElementById('auth-new-pwd2').value = '';
    })
    .catch(function(e) { errEl.style.color = '#f66'; errEl.textContent = _authErrorMsg(e); });
}

function doLogout() {
  dbg('[AUTH] Logout eseguito: ' + (_authUser ? (_authUser.displayName || _authUser.email) : 'guest'));
  // Stop any running game first
  if (game && game.phase === 'playing') {
    dbg('[AUTH] Arresto gioco in corso prima del logout');
    quitGame();
  }
  // Cleanup social listeners and presence
  _cleanupSocialListeners();
  
  var cleanupAndShowAuth = function() {
    _authUser = null;
    _isGuest = false;
    _guestDisplayName = '';
    try { localStorage.removeItem('tresette_auth_type'); } catch(e) {}
    try { localStorage.removeItem('tresette_user_name'); } catch(e) {}
    try { localStorage.removeItem('tresette_guest_name'); } catch(e) {}
    _updateUserBadge();
    _syncNameFromAuth();
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('auth-overlay').classList.remove('hidden');
    showAuthForm('choice');
  };

  if (firebase.auth) {
    firebase.auth().signOut().then(cleanupAndShowAuth).catch(cleanupAndShowAuth);
  } else {
    cleanupAndShowAuth();
  }
}

function _updateUserBadge() {
  var badge = document.getElementById('user-badge');
  var nameEl = document.getElementById('ub-name');
  var authBtn = document.getElementById('ub-auth-btn');
  var skillEl = document.getElementById('ub-skill');
  if (!badge || !nameEl) return;
  if (_authUser) {
    nameEl.textContent = _authUser.displayName || _authUser.email || 'Utente';
    badge.querySelector('.ub-icon').textContent = '👤';
    badge.style.display = 'flex';
    if (authBtn) { authBtn.textContent = '🚪 Esci'; authBtn.title = 'Logout'; }
  } else if (_isGuest) {
    nameEl.textContent = _guestDisplayName ? ('Ospite: ' + _guestDisplayName) : 'Ospite';
    badge.querySelector('.ub-icon').textContent = '🎭';
    badge.style.display = 'flex';
    if (authBtn) { authBtn.textContent = '🚪 Esci'; authBtn.title = 'Logout ospite'; }
  } else {
    badge.style.display = 'none';
  }
  // Skill badge: only show during an active game
  if (skillEl) {
    if (game && game.phase) {
      _updateSkillBadge(skillEl);
    } else {
      skillEl.style.display = 'none';
    }
  }
}

function _updateSkillBadge(el) {
  if (!el) return;
  var profile = _playerProfile;
  // Try localStorage if not loaded yet
  if (!profile) {
    try {
      var stored = localStorage.getItem('tresette_player_profiles');
      if (stored) {
        var profiles = JSON.parse(stored);
        profile = profiles[gameMode || 'perdere'];
      }
    } catch(e) {}
  }
  if (profile && typeof profile.skillLevel === 'number' && profile.gamesPlayed > 0) {
    var s = profile.skillLevel;
    var label = s < 25 ? 'Princ.' : s < 40 ? 'Base' : s < 55 ? 'Inter.' : s < 70 ? 'Avanz.' : s < 85 ? 'Esperto' : 'Maestro';
    var bg = s < 25 ? '#e53935' : s < 40 ? '#ff9800' : s < 55 ? '#fdd835' : s < 70 ? '#43a047' : s < 85 ? '#1e88e5' : '#7b1fa2';
    var fg = (s >= 40 && s < 55) ? '#333' : '#fff';
    var modeIcon = (gameMode === 'vincere') ? '🔺' : '🔻';
    el.textContent = modeIcon + ' ' + s;
    el.title = label + ' (' + s + '/100) — ' + (gameMode === 'vincere' ? 'A Vincere' : 'A Perdere');
    el.style.background = bg;
    el.style.color = fg;
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
}

function _syncNameFromAuth() {
  var nameInput = document.getElementById('my-name-input');
  if (!nameInput) return;
  if (_authUser && _authUser.displayName) {
    nameInput.value = _authUser.displayName;
    nameInput.readOnly = true;
    nameInput.style.opacity = '0.7';
    nameInput.style.cursor = 'default';
    nameInput.title = 'Nome del profilo in uso';
  } else {
    nameInput.readOnly = true;
    nameInput.style.opacity = '0.7';
    nameInput.style.cursor = 'default';
    nameInput.title = _isGuest ? 'Nome ospite in uso' : 'Nome del profilo in uso';
    if (_isGuest && !nameInput.value) nameInput.value = '';
  }
}

function _onAuthBtnClick(e) {
  if (e) { e.stopPropagation(); }
  if (_authUser || _isGuest) {
    // Logged in or guest → logout and return to auth choice
    doLogout();
  } else {
    // Not authenticated → show login form directly
    dbg('[AUTH] Richiesta login da badge');
    document.getElementById('auth-overlay').classList.remove('hidden');
    showAuthForm('login');
  }
}

function _registerUserInDb(user) {
  if (!_fbDb || !user || !user.uid) return;
  // IMPORTANT: use .update() NOT .set() to avoid overwriting gameStats!
  _fbDb.ref('users/' + user.uid).update({
    email: user.email || '',
    displayName: user.displayName || '',
    lastLogin: firebase.database.ServerValue.TIMESTAMP
  }).catch(function(e) { dbg('[AUTH] Errore registrazione utente nel DB: ' + e.message); });
}

function _authErrorMsg(e) {
  var code = e.code || '';
  if (code === 'auth/user-not-found') return 'Utente non trovato.';
  if (code === 'auth/wrong-password') return 'Password errata.';
  if (code === 'auth/invalid-email') return 'Email non valida.';
  if (code === 'auth/email-already-in-use') return 'Email già registrata.';
  if (code === 'auth/weak-password') return 'Password troppo debole (min 6 caratteri).';
  if (code === 'auth/too-many-requests') return 'Troppi tentativi. Riprova più tardi.';
  if (code === 'auth/invalid-credential') return 'Credenziali non valide. Controlla email e password.';
  return e.message || 'Errore sconosciuto.';
}

  // ─── Statistiche ──────────────────────────────────────────
function _getGameDuration() {
  var elapsed = _gameElapsedMs;
  if (_gameStartedAt > 0) elapsed += Date.now() - _gameStartedAt;
  return elapsed;
}

function logGameStats(gameType, playerRole, completed, resultData) {
  if (typeof firebase !== 'undefined' && firebase.database) {
    try {
      var durationMs = _getGameDuration();
      var uid = (_authUser && _authUser.uid) ? _authUser.uid : null;
      var statData = {
        type: gameType,
        role: playerRole,
        difficulty: cpuDifficulty || 'medio',
        gameMode: gameMode || 'perdere',
        version: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : 'unknown',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        durationMs: durationMs,
        tricksPlayed: (game && game.trickNum) ? game.trickNum : 0,
        completed: !!completed,
        uid: uid || null,
        skillLevel: (_playerProfile && typeof _playerProfile.skillLevel === 'number') ? _playerProfile.skillLevel : null,
        skillMode: gameMode || 'perdere'
      };
      // Attach result data if provided
      if (resultData) {
        statData.result = resultData.result || null;          // 'win', 'lose', 'draw'
        statData.playerScore = resultData.playerScore || null; // player's score in terzi
        statData.scores = resultData.scores || null;           // all player scores array
        statData.playerNames = resultData.playerNames || null; // all player names array
        statData.volo = resultData.volo || false;
        if (resultData.teamScores) statData.teamScores = resultData.teamScores;
      }
      // In multiplayer, only the host writes to global stats to avoid duplicates
      var shouldWriteGlobal = !mpMode || isHost;
      if (shouldWriteGlobal) {
        var statsRef = firebase.database().ref('statistics/games').push();
        statsRef.set(statData).then(function() {
          console.log('[STATS] Global stat saved OK, uid=' + uid);
        }).catch(function(e) {
          console.error('[STATS] Global stat save FAILED:', e);
        });
      } else {
        console.log('[STATS] Skipping global stat (client in MP mode, host will write it)');
      }
      // Also save per-user stats if logged in
      if (uid) {
        firebase.database().ref('users/' + uid + '/gameStats').push().set(statData)
          .then(function() {
            console.log('[STATS] Per-user stat saved OK for uid=' + uid);
          })
          .catch(function(e) {
            console.warn('[STATS] Per-user stat save failed, will retry once', e);
            setTimeout(function() {
              if (_authUser && _authUser.uid) {
                firebase.database().ref('users/' + _authUser.uid + '/gameStats').push().set(statData)
                  .catch(function(e2) { console.error('Per-user stat retry also failed', e2); });
              }
            }, 3000);
          });
      }
    } catch(e) { console.error('Errore salvataggio stat', e); }
  }
}

// ─── Debug logger ──────────────────────────────────────────
var _dbgLines = [];
function dbg(msg) {
  if (!Array.isArray(_dbgLines)) _dbgLines = [];
  var ts = new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var role = isHost ? 'HOST' : 'CLI';
  var seatTag = mySeat >= 0 ? 's'+mySeat : 's?';
  var line = '['+ts+'] ['+role+'/'+seatTag+'] '+msg;
  console.log('%c[MP:'+role+'/'+seatTag+'] '+msg,'color:#0f0');
  _dbgLines.push(line);
  if(_dbgLines.length > 200) _dbgLines.shift();
  var el = document.getElementById('dbg-panel');
  if(el){ el.textContent = _dbgLines.join('\n'); el.scrollTop = el.scrollHeight; }
  _updateHostInfo();
}
function _describeSeatOwnership() {
  var parts = [];
  for(var seat=0; seat<4; seat++) {
    var entry = _humanSeats[seat];
    var isHuman = _humanSeatSet.has(seat);
    var name = PLAYER_NAMES[seat] || (entry && entry.name) || ('Seat '+(seat+1));
    var ownerId = entry && entry.id ? ',id='+entry.id : '';
    parts.push('s'+seat+'='+(isHuman ? 'human' : 'cpu')+'('+name+ownerId+')');
  }
  return parts.join(' | ');
}
function _logSeatOwnership(context) {
  dbg('[SEATS] '+context+' :: '+_describeSeatOwnership());
}
function _updateHostInfo() {
  var el = document.getElementById('hi-host');
  if(!el) return;
  if(!mpMode) { el.textContent = '— (v' + (typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '1.0.1') + ')'; return; }
  var name = _currentHostName || '?';
  el.innerHTML = '<span style="color:#fa4;font-weight:bold">' + name + '</span>'
    + ' <span style="color:#666">e' + _lastSeenEpoch + ' ' + mpRoom + ' (v' + (typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : '1.0.1') + ')</span>';
}
function _resolveHostName(hostId) {
  if(!hostId) return;
  if(hostId === MY_ID) {
    _currentHostName = _getMyName ? (_getMyName() || PLAYER_NAMES[mySeat >= 0 ? mySeat : 0] || 'Me') : 'Me';
    return;
  }
  // Look up in _humanSeats
  for(var s in _humanSeats) {
    if(_humanSeats[s].id === hostId) { _currentHostName = _humanSeats[s].name; return; }
  }
  // Try seats in Firebase
  if(_fbDb && mpRoom) {
    _fbDb.ref('rooms/'+mpRoom+'/seats').once('value', function(snap) {
      var seats = snap.val() || {};
      for(var pid in seats) {
        if(pid === hostId) {
          var seatIdx = seats[pid];
          _currentHostName = PLAYER_NAMES[seatIdx] || ('Seat '+seatIdx);
          _updateHostInfo();
          return;
        }
      }
      _currentHostName = hostId.substring(0,6)+'...';
      _updateHostInfo();
    });
  }
}
dbg('MY_ID='+MY_ID);

// ─── Room code ───
function genCode() {
  var c='ABCDEFGHJKLMNPQRSTUVWXYZ'; var s='';
  for(var i=0;i<6;i++) s+=c[Math.floor(Math.random()*c.length)];
  return s;
}

function showLobbySection(id) {
  ['lobby-host','lobby-join','lobby-waiting','lobby-pick-seat'].forEach(function(s){var el=document.getElementById(s);if(el)el.style.display=s===id?'block':'none';});
  if(id === 'lobby-menu') startLobbyBrowser(); else stopLobbyBrowser();
}
function cancelLobby() {
  // Remove lobby entry if we were hosting
  if(isHost && mpRoom) _removeLobbyEntry();
  _fbCleanup();
  stopHostHeartbeat();
  _updatePresenceRoom(null);
  document.getElementById('lobby-overlay').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}

// ─── Firebase helpers ───
var _fbListeners = [];
var _msgListeners = [];
var _msgCount = 0;
var _hostWatchdogTimer = null;
var _clientWatchdogTimer = null;
function _clearMessageListeners(){
  _msgListeners.forEach(function(q){ try{q.off();}catch(e){} });
  _msgListeners = [];
  _processedMsgKeys = {};
}
function _fbCleanup(){
  _fbListeners.forEach(function(r){ try{r.off();}catch(e){} });
  _fbListeners = [];
  _clearMessageListeners();
  _stateRef = null;
  _latestAppliedStateSeq = 0;
  _stateSeq = 0;
  if(_hostWatchdogTimer){ clearInterval(_hostWatchdogTimer); _hostWatchdogTimer = null; }
  if(_clientWatchdogTimer){ clearInterval(_clientWatchdogTimer); _clientWatchdogTimer = null; }
  // Stop turn timer to prevent CPU auto-play after leaving
  stopTurnTimer();
  // Clean up host migration timers
  _stopHostLease();
  _stopMetaWatch();
  // Clean up v3.1.0 subsystems
  _teardownRoomPresence();
  _stopEventLogListener();
  _isViceHost = false;
  _viceHostId = '';
  // Clean up seat info listener if active
  if(_seatInfoRef){ try{_seatInfoRef.off();}catch(e){} _seatInfoRef = null; }
}
// Delete old messages to keep Firebase DB lean (host only)
function _cleanOldMessages(){
  if(!_fbDb || !mpRoom || !isHost) return;
  var ref = _fbDb.ref('rooms/'+mpRoom+'/messages');
  ref.orderByChild('_ts').limitToFirst(50).once('value', function(snap){
    var count = snap.numChildren();
    if(count > 30){
      var toDelete = count - 15; // keep last 15
      var i = 0;
      snap.forEach(function(child){
        if(i < toDelete){ child.ref.remove(); }
        i++;
      });
      dbg('Cleaned '+toDelete+' old messages');
    }
  });
}

function mpSend(data) {
  if(!_fbDb || !mpRoom) return;
  data._from = MY_ID;
  data._ts = firebase.database.ServerValue.TIMESTAMP;
  dbg('SEND t='+data.t);
  // Clean up old messages periodically (keep DB lean)
  _msgCount++;
  if(_msgCount % 25 === 0 && isHost){
    _cleanOldMessages();
  }
  // Prune processed message keys to prevent memory leak in long sessions
  if(_msgCount % 50 === 0){
    var keys = Object.keys(_processedMsgKeys);
    if(keys.length > 100){
      keys.slice(0, keys.length - 30).forEach(function(k){ delete _processedMsgKeys[k]; });
    }
  }
  _fbDb.ref('rooms/'+mpRoom+'/messages').push(data)
    .catch(function(e){ dbg('SEND ERR: '+e); });
}

var _processedMsgKeys = {};  // track processed message keys to avoid duplicates

function mpListen(handler) {
  if(!_fbDb || !mpRoom) return;
  var ref = _fbDb.ref('rooms/'+mpRoom+'/messages');
  // Use a 'value' listener on the last 5 messages instead of 'child_added'.
  // 'child_added' with limitToLast can silently lose messages when:
  // - multiple messages arrive in the same Firebase batch
  // - messages are deleted by _cleanOldMessages shifting the window
  // A 'value' listener always sees the complete current window.
  var query = ref.orderByKey().limitToLast(5);
  
  query.on('value', function(snap) {
    if(!snap.exists()) return;
    snap.forEach(function(child) {
      var key = child.key;
      if(_processedMsgKeys[key]) return; // already handled
      _processedMsgKeys[key] = true;
      var data = child.val();
      if(!data || data._from === MY_ID) return;
      dbg('RECV t='+data.t+' key='+key.substring(key.length-6));
      handler(data);
    });
  });
  
  _msgListeners.push(query);
  dbg('Listening on rooms/'+mpRoom);
}

// ═══════════════════════════════════════════════════════════════
//  HOST MIGRATION — Epoch-based lease, atomic promotion, return-to-original
// ═══════════════════════════════════════════════════════════════
var _hostEpoch = 0;          // current epoch on this client
var _lastSeenEpoch = 0;      // highest epoch observed from state
var _originalHostId = '';     // the ID of the player who created the room
var _currentHostName = '';    // display name of the current host (updated from meta + state)
var _metaRef = null;          // Firebase ref for rooms/{code}/meta
var _metaLeaseTimer = null;   // host writes lease every 10s
var _metaWatchTimer = null;   // clients check for expired lease
var HOST_LEASE_INTERVAL = 10000;  // host writes lease every 10s
var HOST_LEASE_TIMEOUT  = 35000;  // lease considered expired after 35s
var _hostSelfCheckTimer = null;   // periodic split-brain self-check
var _fbServerTimeOffset = 0;      // ms offset: serverTime ≈ Date.now() + _fbServerTimeOffset

// ─── Vice-Host (v3.1.0) ───
var _viceHostId = '';         // the designated vice-host player ID
var _isViceHost = false;      // true on the client that is the vice-host

// ─── Room Presence (v3.1.0) ───
// Per-player presence inside a room: rooms/{code}/presence/{playerId}
var _roomPresenceRef = null;      // ref for own presence node
var _roomPresenceListenerRef = null; // ref listening to all room presence

function _setupRoomPresence() {
  _teardownRoomPresence();
  if(!_fbDb || !mpRoom || mySeat < 0) return;
  _roomPresenceRef = _fbDb.ref('rooms/'+mpRoom+'/presence/'+MY_ID);
  var data = {
    seat: mySeat,
    online: true,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    canHost: true
  };
  _roomPresenceRef.set(data).catch(function(e){ dbg('[ROOM-PRES] set ERR: '+e); });
  _roomPresenceRef.onDisconnect().update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
  dbg('[ROOM-PRES] Setup OK seat='+mySeat+' room='+mpRoom);
}
function _updateRoomPresence() {
  if(!_roomPresenceRef) return;
  _roomPresenceRef.update({
    seat: mySeat,
    online: true,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  }).catch(function(){});
}
function _teardownRoomPresence() {
  if(_roomPresenceRef) { try{ _roomPresenceRef.update({online:false}); _roomPresenceRef.onDisconnect().cancel(); }catch(e){} _roomPresenceRef=null; }
  if(_roomPresenceListenerRef) { try{ _roomPresenceListenerRef.off(); }catch(e){} _roomPresenceListenerRef=null; }
}

// ─── Event Log (v3.1.0) ───
// Append-only event log: rooms/{code}/events/{seq}
var _eventSeq = 0; // running event sequence counter (host increments)
var _eventLogRef = null; // client listener ref
var _lastAppliedEventSeq = 0; // client: highest event seq applied

function _logEvent(type, seat, payload) {
  if(!_fbDb || !mpRoom || !isHost) return;
  _eventSeq++;
  var evt = {
    seq: _eventSeq,
    epoch: _hostEpoch,
    type: type,
    by: MY_ID,
    seat: (typeof seat === 'number') ? seat : -1,
    payload: payload || null,
    ts: firebase.database.ServerValue.TIMESTAMP
  };
  dbg('[EVENT] Writing event seq='+_eventSeq+' type='+type+' seat='+evt.seat);
  _fbDb.ref('rooms/'+mpRoom+'/events/'+_eventSeq).set(evt)
    .catch(function(e){ dbg('[EVENT] WRITE ERR: '+e); });
  // Update meta with latest event seq
  _fbDb.ref('rooms/'+mpRoom+'/meta/lastEventSeq').set(_eventSeq).catch(function(){});
}

function _startEventLogListener() {
  _stopEventLogListener();
  if(!_fbDb || !mpRoom || isHost) return;
  _eventLogRef = _fbDb.ref('rooms/'+mpRoom+'/events').orderByKey().startAt(String(_lastAppliedEventSeq + 1));
  _eventLogRef.on('child_added', function(snap) {
    var evt = snap.val();
    if(!evt || !evt.seq) return;
    if(evt.seq <= _lastAppliedEventSeq) return;
    _lastAppliedEventSeq = evt.seq;
    dbg('[EVENT-RX] seq='+evt.seq+' type='+evt.type+' seat='+evt.seat+' epoch='+evt.epoch);
    // Vice-host: track events for hot standby state
    if(_isViceHost) {
      dbg('[VICE] Received event seq='+evt.seq+' type='+evt.type+' — state is current');
    }
  });
  dbg('[EVENT] Listening for events in room='+mpRoom+' from seq='+(_lastAppliedEventSeq+1));
}
function _stopEventLogListener() {
  if(_eventLogRef) { try{ _eventLogRef.off(); }catch(e){} _eventLogRef=null; }
}

// ─── Checkpoint (v3.1.0) ───
// Periodic full-state checkpoints: rooms/{code}/checkpoint
var _checkpointInterval = 5; // write checkpoint every N events
var _lastCheckpointSeq = 0;

function _writeCheckpoint() {
  if(!_fbDb || !mpRoom || !isHost || !game) return;
  var cp = makeStateSnapshot(_stateSeq);
  cp._eventSeq = _eventSeq;
  cp._checkpointTs = firebase.database.ServerValue.TIMESTAMP;
  _fbDb.ref('rooms/'+mpRoom+'/checkpoint').set(cp)
    .then(function(){ dbg('[CHECKPOINT] Written OK at eventSeq='+_eventSeq+' stateSeq='+_stateSeq); })
    .catch(function(e){ dbg('[CHECKPOINT] WRITE ERR: '+e); });
  _lastCheckpointSeq = _eventSeq;
  _fbDb.ref('rooms/'+mpRoom+'/meta/lastCheckpointSeq').set(_lastCheckpointSeq).catch(function(){});
}
function _maybeWriteCheckpoint() {
  if(!isHost) return;
  if(_eventSeq - _lastCheckpointSeq >= _checkpointInterval) {
    _writeCheckpoint();
  }
}

// ─── Vice-Host Election (v3.1.0) ───
// Rule: lowest human seat that is online and not the host
function _electViceHost() {
  if(!isHost || !_fbDb || !mpRoom) return;
  _fbDb.ref('rooms/'+mpRoom+'/presence').once('value', function(snap) {
    var all = snap.val() || {};
    var candidates = [];
    for(var pid in all) {
      var p = all[pid];
      if(pid === MY_ID) continue; // skip self (host)
      if(!p.online || !p.canHost) continue;
      if(typeof p.seat !== 'number' || p.seat < 0) continue;
      candidates.push({ id: pid, seat: p.seat });
    }
    candidates.sort(function(a,b){ return a.seat - b.seat; });
    var newVice = candidates.length > 0 ? candidates[0].id : '';
    if(newVice !== _viceHostId) {
      _viceHostId = newVice;
      dbg('[VICE] Elected vice-host: '+ (_viceHostId || 'none') +' (from '+candidates.length+' candidates)');
      _fbDb.ref('rooms/'+mpRoom+'/meta/viceHostId').set(_viceHostId || null).catch(function(){});
    }
  });
}
// Re-elect when room presence changes (host only)
function _startViceHostWatch() {
  _stopViceHostWatch();
  if(!isHost || !_fbDb || !mpRoom) return;
  _roomPresenceListenerRef = _fbDb.ref('rooms/'+mpRoom+'/presence');
  _roomPresenceListenerRef.on('value', function() {
    _electViceHost();
  });
  dbg('[VICE] Started vice-host watch');
}
function _stopViceHostWatch() {
  if(_roomPresenceListenerRef) { try{ _roomPresenceListenerRef.off(); }catch(e){} _roomPresenceListenerRef=null; }
}

// Estimate current server time (compensated for clock skew)
function _serverNow() { return Date.now() + _fbServerTimeOffset; }

// Write meta node (host calls this)
function _writeHostMeta() {
  if(!_fbDb || !mpRoom || !isHost) { dbg('[META] _writeHostMeta SKIP: db='+!!_fbDb+' room='+mpRoom+' isHost='+isHost); return; }
  dbg('[META] Writing meta: hostId='+MY_ID+' epoch='+_hostEpoch+' originalHost='+(_originalHostId||MY_ID)+' roomLabel='+_roomLabel+' viceHost='+(_viceHostId||'none'));
  _fbDb.ref('rooms/'+mpRoom+'/meta').set({
    hostId: MY_ID,
    hostEpoch: _hostEpoch,
    originalHostId: _originalHostId || MY_ID,
    viceHostId: _viceHostId || null,
    roomLabel: _roomLabel || '',
    difficulty: cpuDifficulty || 'medio',
    lastEventSeq: _eventSeq || 0,
    lastCheckpointSeq: _lastCheckpointSeq || 0,
    hostLease: firebase.database.ServerValue.TIMESTAMP
  }).then(function(){ dbg('[META] Meta written OK'); }).catch(function(e){ dbg('[META] WRITE ERR: '+e); });
}

// Start the host lease heartbeat (host only) + split-brain detection
var _hostMetaListenerRef = null; // real-time meta listener for the host
function _startHostLease() {
  _stopHostLease();
  dbg('[LEASE] Starting host lease heartbeat, epoch='+_hostEpoch+' interval='+HOST_LEASE_INTERVAL+'ms');
  _writeHostMeta();
  _setupRoomPresence();
  _startViceHostWatch();
  _metaLeaseTimer = setInterval(function() {
    if(!isHost) { dbg('[LEASE] Stopping lease: isHost='+isHost); _stopHostLease(); return; }
    dbg('[LEASE] Renewing lease, epoch='+_hostEpoch);
    _fbDb.ref('rooms/'+mpRoom+'/meta/hostLease').set(
      firebase.database.ServerValue.TIMESTAMP
    ).catch(function(e){ dbg('[LEASE] Renew ERR: '+e); });
  }, HOST_LEASE_INTERVAL);

  // Real-time meta listener: detect if another host promoted (immediate split-brain resolution)
  if(_hostMetaListenerRef) { try{_hostMetaListenerRef.off();}catch(e){} }
  _hostMetaListenerRef = _fbDb.ref('rooms/'+mpRoom+'/meta');
  _hostMetaListenerRef.on('value', function(snap) {
    var meta = snap.val();
    if(!meta || !isHost) return;
    if(meta.hostId !== MY_ID && meta.hostEpoch > _hostEpoch) {
      dbg('[SPLIT-BRAIN-RT] *** DETECTED *** Meta hostId='+meta.hostId+' epoch='+meta.hostEpoch+' > myEpoch='+_hostEpoch+' — demoting immediately');
      _hostEpoch = meta.hostEpoch;
      _lastSeenEpoch = meta.hostEpoch;
      _stopHostLease();
      _demoteToClient();
      showStatus('Un altro giocatore è diventato host', 2500);
    }
  });

  // Backup split-brain self-check every 20s (handles edge cases where real-time listener misses)
  _stopHostSelfCheck();
  _hostSelfCheckTimer = setInterval(function() {
    if(!isHost || !mpMode || !_fbDb || !mpRoom) return;
    _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap) {
      var meta = snap.val();
      if(!meta) return;
      if(meta.hostId !== MY_ID) {
        dbg('[SPLIT-BRAIN] *** DETECTED *** Meta says hostId='+meta.hostId+' but I ('+MY_ID+') think I am host! metaEpoch='+meta.hostEpoch+' myEpoch='+_hostEpoch);
        if(meta.hostEpoch > _hostEpoch) {
          dbg('[SPLIT-BRAIN] Other host has higher epoch ('+meta.hostEpoch+' > '+_hostEpoch+') — I must demote');
          _hostEpoch = meta.hostEpoch;
          _lastSeenEpoch = meta.hostEpoch;
          _demoteToClient();
          showStatus('Conflitto risolto: sei ora client', 2500);
        } else if(meta.hostEpoch === _hostEpoch) {
          dbg('[SPLIT-BRAIN] Same epoch — comparing IDs to break tie: mine='+MY_ID+' theirs='+meta.hostId);
          // Deterministic tie-break: lower ID wins
          if(MY_ID > meta.hostId) {
            dbg('[SPLIT-BRAIN] My ID is higher — I demote');
            _demoteToClient();
            showStatus('Conflitto risolto: sei ora client', 2500);
          } else {
            dbg('[SPLIT-BRAIN] My ID is lower — I stay host, rewriting meta');
            _hostEpoch++;
            _lastSeenEpoch = _hostEpoch;
            _writeHostMeta();
          }
        } else {
          dbg('[SPLIT-BRAIN] I have higher epoch ('+_hostEpoch+' > '+meta.hostEpoch+') — rewriting meta to assert');
          _writeHostMeta();
        }
      }
    });
  }, 20000);
}
function _stopHostSelfCheck() {
  if(_hostSelfCheckTimer){ clearInterval(_hostSelfCheckTimer); _hostSelfCheckTimer = null; }
}
function _stopHostLease() {
  if(_metaLeaseTimer){ dbg('[LEASE] Stopping host lease timer'); clearInterval(_metaLeaseTimer); _metaLeaseTimer = null; }
  if(_hostMetaListenerRef){ dbg('[LEASE] Detaching host meta listener'); try{_hostMetaListenerRef.off();}catch(e){} _hostMetaListenerRef = null; }
  _stopHostSelfCheck();
  _stopViceHostWatch();
}

// Start watching the meta node for lease expiry (client only)
function _startMetaWatch() {
  _stopMetaWatch();
  if(!_fbDb || !mpRoom || isHost) { dbg('[WATCH] _startMetaWatch SKIP: db='+!!_fbDb+' room='+mpRoom+' isHost='+isHost); return; }
  dbg('[WATCH] Starting meta watch for room='+mpRoom+' myId='+MY_ID+' mySeat='+mySeat);
  _setupRoomPresence();
  // Listen to meta changes
  _metaRef = _fbDb.ref('rooms/'+mpRoom+'/meta');
  _metaRef.on('value', function(snap) {
    var meta = snap.val();
    if(!meta) { dbg('[WATCH] Meta snap is null'); return; }
    var prevEpoch = _lastSeenEpoch;
    _lastSeenEpoch = Math.max(_lastSeenEpoch, meta.hostEpoch || 0);
    _originalHostId = meta.originalHostId || '';
    // Preserve room label from meta so heartbeat uses the correct name
    if(meta.roomLabel) _roomLabel = meta.roomLabel;
    // Track vice-host designation
    _viceHostId = meta.viceHostId || '';
    var wasVice = _isViceHost;
    _isViceHost = (_viceHostId === MY_ID);
    if(_isViceHost && !wasVice) {
      dbg('[VICE] *** I am now the designated vice-host ***');
      _startEventLogListener();
    } else if(!_isViceHost && wasVice) {
      dbg('[VICE] I am no longer vice-host');
      _stopEventLogListener();
    }
    // Track host name for debug display
    _resolveHostName(meta.hostId);
    if(meta.hostEpoch !== prevEpoch) {
      dbg('[WATCH] Meta changed: hostId='+meta.hostId+' epoch='+meta.hostEpoch+' origHost='+_originalHostId+' (prev epoch='+prevEpoch+')');
    }
  });
  _fbListeners.push(_metaRef);
  // Periodic check for lease expiry (every 15s — real-time listener handles most cases)
  _metaWatchTimer = setInterval(function() {
    if(!mpMode || !game || isHost) return;
    _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap) {
      var meta = snap.val();
      if(!meta || !meta.hostLease) return;
      var age = _serverNow() - meta.hostLease;
      dbg('[WATCH] Lease check: hostId='+meta.hostId+' epoch='+meta.hostEpoch+' age='+age+'ms timeout='+HOST_LEASE_TIMEOUT+'ms offset='+_fbServerTimeOffset+'ms');
      if(age > HOST_LEASE_TIMEOUT) {
        dbg('[WATCH] HOST LEASE EXPIRED (age='+age+'ms) — attempting promotion');
        _attemptPromotion(meta);
      }
    });
  }, 15000);
}
function _stopMetaWatch() {
  if(_metaWatchTimer){ dbg('[WATCH] Stopping meta watch timer'); clearInterval(_metaWatchTimer); _metaWatchTimer = null; }
  if(_metaRef){ dbg('[WATCH] Detaching meta listener'); try{_metaRef.off();}catch(e){} _metaRef = null; }
}

// Atomic promotion via Firebase transaction
function _attemptPromotion(metaSnapshot) {
  if(isHost || !_fbDb || !mpRoom || !mpMode || !game) {
    dbg('[PROMOTE] SKIP: isHost='+isHost+' db='+!!_fbDb+' room='+mpRoom+' mpMode='+mpMode+' game='+!!game);
    return;
  }
  // Vice-host priority: only the designated vice-host attempts immediately.
  // Other clients wait 8s for the vice to claim, then fall back.
  var designatedVice = metaSnapshot.viceHostId || '';
  if(designatedVice && designatedVice !== MY_ID) {
    dbg('[PROMOTE] Deferring to vice-host '+designatedVice+' (I am '+MY_ID+'), will retry in 8s if unclaimed');
    setTimeout(function() {
      if(isHost || !mpMode || !game) return;
      _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap) {
        var fresh = snap.val();
        if(!fresh) return;
        if(fresh.hostEpoch !== metaSnapshot.hostEpoch) { dbg('[PROMOTE-FALLBACK] Epoch changed, someone promoted'); return; }
        var age = _serverNow() - (fresh.hostLease || 0);
        if(age < HOST_LEASE_TIMEOUT - 5000) { dbg('[PROMOTE-FALLBACK] Lease now fresh, aborting'); return; }
        dbg('[PROMOTE-FALLBACK] Vice-host did not claim — attempting promotion myself');
        _doAtomicPromotion(fresh);
      });
    }, 8000);
    return;
  }
  _doAtomicPromotion(metaSnapshot);
}

function _doAtomicPromotion(metaSnapshot) {
  if(isHost) return;
  var expectedEpoch = metaSnapshot.hostEpoch || 0;
  dbg('[PROMOTE] *** ATTEMPTING PROMOTION *** expectedEpoch='+expectedEpoch+' myId='+MY_ID+' mySeat='+mySeat+' currentHostId='+metaSnapshot.hostId);

  _fbDb.ref('rooms/'+mpRoom+'/meta').transaction(function(current) {
    if(!current) { dbg('[PROMOTE] Transaction: current is null, aborting'); return; }
    dbg('[PROMOTE] Transaction read: hostId='+current.hostId+' epoch='+current.hostEpoch+' lease='+current.hostLease);
    if(current.hostEpoch !== expectedEpoch) {
      dbg('[PROMOTE] Transaction ABORT: epoch changed (expected='+expectedEpoch+' actual='+current.hostEpoch+')');
      return;
    }
    var age = _serverNow() - (current.hostLease || 0);
    dbg('[PROMOTE] Transaction: lease age='+age+'ms threshold='+(HOST_LEASE_TIMEOUT-5000)+'ms offset='+_fbServerTimeOffset+'ms');
    if(age < HOST_LEASE_TIMEOUT - 5000) {
      dbg('[PROMOTE] Transaction ABORT: host lease still fresh (age='+age+'ms)');
      return;
    }
    dbg('[PROMOTE] Transaction COMMITTING: new hostId='+MY_ID+' new epoch='+(current.hostEpoch+1));
    return {
      hostId: MY_ID,
      hostEpoch: current.hostEpoch + 1,
      originalHostId: current.originalHostId || '',
      viceHostId: null,
      roomLabel: current.roomLabel || '',
      lastEventSeq: current.lastEventSeq || 0,
      lastCheckpointSeq: current.lastCheckpointSeq || 0,
      hostLease: firebase.database.ServerValue.TIMESTAMP
    };
  }, function(error, committed, snapshot) {
    if(error) { dbg('[PROMOTE] Transaction ERROR: '+error); return; }
    if(!committed) { dbg('[PROMOTE] Transaction NOT COMMITTED (someone else won or host returned)'); return; }
    var newMeta = snapshot.val();
    _hostEpoch = newMeta.hostEpoch;
    _lastSeenEpoch = _hostEpoch;
    _originalHostId = newMeta.originalHostId || '';
    dbg('[PROMOTE] *** PROMOTION WON *** I am now host! epoch='+_hostEpoch+' originalHost='+_originalHostId);
    _showDiscBanner('🔄 Ripristino partita...', 3, 'Sincronizzazione stato di gioco...');
    _becomeHost();
  }, false);
}

// Forced promotion when host explicitly leaves (no lease timeout check)
function _attemptForcedPromotion(metaSnapshot) {
  if(isHost || !_fbDb || !mpRoom || !mpMode || !game) {
    dbg('[PROMOTE-FORCED] SKIP: isHost='+isHost+' db='+!!_fbDb+' room='+mpRoom+' mpMode='+mpMode+' game='+!!game);
    return;
  }
  var expectedEpoch = metaSnapshot.hostEpoch || 0;
  dbg('[PROMOTE-FORCED] *** ATTEMPTING FORCED PROMOTION *** expectedEpoch='+expectedEpoch+' myId='+MY_ID);

  _fbDb.ref('rooms/'+mpRoom+'/meta').transaction(function(current) {
    if(!current) { dbg('[PROMOTE-FORCED] Transaction: current is null, writing fresh meta');
      return {
        hostId: MY_ID,
        hostEpoch: expectedEpoch + 1,
        originalHostId: _originalHostId || MY_ID,
        viceHostId: null,
        roomLabel: _roomLabel || '',
        lastEventSeq: 0,
        lastCheckpointSeq: 0,
        hostLease: firebase.database.ServerValue.TIMESTAMP
      };
    }
    if(current.hostEpoch !== expectedEpoch) {
      dbg('[PROMOTE-FORCED] Transaction ABORT: epoch changed (expected='+expectedEpoch+' actual='+current.hostEpoch+')');
      return; // another client already promoted
    }
    dbg('[PROMOTE-FORCED] Transaction COMMITTING: new hostId='+MY_ID+' new epoch='+(current.hostEpoch+1));
    return {
      hostId: MY_ID,
      hostEpoch: current.hostEpoch + 1,
      originalHostId: current.originalHostId || '',
      viceHostId: null,
      roomLabel: current.roomLabel || '',
      lastEventSeq: current.lastEventSeq || 0,
      lastCheckpointSeq: current.lastCheckpointSeq || 0,
      hostLease: firebase.database.ServerValue.TIMESTAMP
    };
  }, function(error, committed, snapshot) {
    if(error) { dbg('[PROMOTE-FORCED] Transaction ERROR: '+error); return; }
    if(!committed) { dbg('[PROMOTE-FORCED] Transaction NOT COMMITTED'); return; }
    var newMeta = snapshot.val();
    _hostEpoch = newMeta.hostEpoch;
    _lastSeenEpoch = _hostEpoch;
    _originalHostId = newMeta.originalHostId || '';
    dbg('[PROMOTE-FORCED] *** PROMOTION WON *** I am now host! epoch='+_hostEpoch);
    _showDiscBanner('🔄 Sei diventato il nuovo host!', 3, 'La partita continua...');
    _becomeHost();
  }, false);
}

// Transition from client to host
function _becomeHost() {
  dbg('[BECOME] *** _becomeHost called *** mySeat='+mySeat+' epoch='+_hostEpoch+' room='+mpRoom);
  isHost = true;
  _isViceHost = false;
  _viceHostId = '';
  _stopEventLogListener();
  _clearMessageListeners();
  _resolveHostName(MY_ID);
  _stopMetaWatch();
  _startHostLease();

  // Restore event seq from meta/checkpoint if available
  _fbDb.ref('rooms/'+mpRoom+'/meta/lastEventSeq').once('value', function(snap) {
    var lastEvt = snap.val();
    if(typeof lastEvt === 'number' && lastEvt > _eventSeq) {
      _eventSeq = lastEvt;
      dbg('[BECOME] Restored _eventSeq from meta: '+_eventSeq);
    }
  });
  _fbDb.ref('rooms/'+mpRoom+'/meta/lastCheckpointSeq').once('value', function(snap) {
    var lastCp = snap.val();
    if(typeof lastCp === 'number') _lastCheckpointSeq = lastCp;
  });

  // Read room label from meta so heartbeat preserves the room name
  _fbDb.ref('rooms/'+mpRoom+'/meta/roomLabel').once('value', function(snap){
    var label = snap.val();
    if(label) { _roomLabel = label; dbg('[BECOME] Restored roomLabel from meta: '+_roomLabel); }
  });

  // Rebuild _humanSeats from Firebase seats data
  dbg('[BECOME] Reading seats from Firebase...');
  _fbDb.ref('rooms/'+mpRoom+'/seats').once('value', function(snap) {
    var seats = snap.val() || {};
    dbg('[BECOME] Raw seats data: '+JSON.stringify(seats));
    _humanSeats = {};
    _humanSeatSet = new Set([mySeat]);
    for(var playerId in seats) {
      var seatIdx = seats[playerId];
      if(playerId === MY_ID) { dbg('[BECOME] Skipping myself: seat='+seatIdx); continue; }
      // The original host removed their seat from Firebase when leaving.
      // If it somehow still appears (race condition), skip and clean up.
      if(playerId === _originalHostId && playerId !== MY_ID) {
        dbg('[BECOME] Skipping original host (left): seat='+seatIdx+' id='+playerId);
        _fbDb.ref('rooms/'+mpRoom+'/seats/'+playerId).remove();
        continue;
      }
      // Don't let anyone else occupy MY seat
      if(seatIdx === mySeat) {
        dbg('[BECOME] Conflict: player '+playerId+' has my seat '+mySeat+', skipping');
        continue;
      }
      var pName = PLAYER_NAMES[seatIdx] || ('Giocatore '+(seatIdx+1));
      _humanSeats[seatIdx] = { name: pName, id: playerId, lastPing: Date.now() };
      _humanSeatSet.add(seatIdx);
      dbg('[BECOME] Restored seat '+seatIdx+': name='+pName+' id='+playerId);
    }
    dbg('[BECOME] Final humanSeats: '+JSON.stringify(Object.keys(_humanSeats))+' humanSeatSet: ['+Array.from(_humanSeatSet).join(',')+']');
    _logSeatOwnership('after rebuild as migrated host');

    // Now that _humanSeats is rebuilt, sync state to clients with correct humanSeatSet
    dbg('[BECOME] Syncing state as new host (after seats rebuilt)...');
    syncState(true);
    _logEvent('host-migrated', mySeat, { prevHostId: _originalHostId, newEpoch: _hostEpoch });
    _writeCheckpoint();

    // Explicit render to make sure UI is up to date
    if(game) {
      dbg('[BECOME] Forcing renderAll after seats rebuilt');
      renderAll();
    }

    // If it's a CPU turn (including the seat of the host who left), kick the AI
    var cpuNeeded = (game && game.phase === 'playing' && !isHumanSeat(game.currentPlayer));
    dbg('[BECOME] CPU turn needed? '+cpuNeeded+' currentPlayer='+(game?game.currentPlayer:'n/a')+' phase='+(game?game.phase:'n/a'));
    if(cpuNeeded) {
      setTimeout(function() { dbg('[BECOME] Kicking CPU turn after promotion'); cpuTurn(); }, 600);
    }
  });

  // Start listening for messages as host
  dbg('[BECOME] Attaching migrated host message handler');
  function _migratedHostHandler(data) {
    if(data.t === 'ping') {
      for(var hp in _humanSeats) {
        if(_humanSeats[hp].id === data._from) {
          _humanSeats[hp].lastPing = Date.now();
          dbg('[MIG-HOST] ping refreshed seat='+hp+' id='+data._from+' name='+(_humanSeats[hp].name||PLAYER_NAMES[hp]||'?'));
          break;
        }
      }
      return;
    }
    dbg('[MIG-HOST] Received t='+data.t+' from='+data._from+(data.name?' name='+data.name:''));
    if(data.t === 'join') {
      var existingSeat = -1;
      for(var k in _humanSeats) { if(_humanSeats[k].id === data._from) { existingSeat = parseInt(k); break; } }
      if(existingSeat < 0 && typeof data.rejoinSeat === 'number' && data.rejoinSeat >= 0 && data.rejoinSeat <= 3) {
        var wantedSeat = data.rejoinSeat;
        var wantedEntry = _humanSeats[wantedSeat];
        var wantedStale = wantedEntry && (Date.now() - wantedEntry.lastPing) > 10000;
        var isOrig = (data._from === _originalHostId && data._from !== MY_ID);
        var wantsOriginalHostSeat = isOrig && wantedSeat === 0;
        var wantsSeatZeroRecovery = wantedSeat === 0 && (!_humanSeatSet.has(0) || !wantedEntry || wantedStale) && (!data.name || PLAYER_NAMES[0] === data.name || (wantedEntry && wantedEntry.name === data.name));
        var wantedHuman = _humanSeatSet.has(wantedSeat) || wantsOriginalHostSeat || wantsSeatZeroRecovery;
        var wantedNameOk = wantsOriginalHostSeat || wantsSeatZeroRecovery || !data.name || PLAYER_NAMES[wantedSeat] === data.name || (wantedEntry && wantedEntry.name === data.name);
        if(wantedHuman && wantedNameOk && (!wantedEntry || wantedEntry.id === data._from || wantedStale)) {
          existingSeat = wantedSeat;
          _humanSeats[existingSeat] = _humanSeats[existingSeat] || {};
          _humanSeats[existingSeat].id = data._from;
          _humanSeats[existingSeat].name = _humanSeats[existingSeat].name || data.name || PLAYER_NAMES[existingSeat] || 'Host';
          _humanSeats[existingSeat].lastPing = Date.now();
          dbg('[MIG-HOST] Matched by rejoinSeat: seat='+existingSeat+' wantedHuman='+wantedHuman+' wantedStale='+!!wantedStale+' origHostSeat='+wantsOriginalHostSeat+' seatZeroRecovery='+wantsSeatZeroRecovery);
        }
      }
      if(existingSeat < 0 && data.name) {
        for(var kn in _humanSeats) {
          if(_humanSeats[kn].name === data.name && (Date.now() - _humanSeats[kn].lastPing) > 10000) {
            existingSeat = parseInt(kn); _humanSeats[existingSeat].id = data._from;
            dbg('[MIG-HOST] Matched by name: seat='+existingSeat);
            break;
          }
        }
      }
      // Original host ALWAYS gets seat 0 on rejoin
      var isOrig = (data._from === _originalHostId && data._from !== MY_ID);
      if(isOrig && existingSeat >= 0 && existingSeat !== 0) {
        dbg('[MIG-HOST] Original host was at seat='+existingSeat+' — forcing to seat 0');
        delete _humanSeats[existingSeat];
        existingSeat = 0;
      }
      if(existingSeat >= 0) {
        _humanSeats[existingSeat] = _humanSeats[existingSeat] || {};
        _humanSeats[existingSeat].id = data._from;
        _humanSeats[existingSeat].name = data.name || _humanSeats[existingSeat].name || PLAYER_NAMES[existingSeat] || 'Host';
        _humanSeats[existingSeat].lastPing = Date.now();
        _humanSeatSet.add(existingSeat);
        PLAYER_NAMES[existingSeat] = _humanSeats[existingSeat].name;
        dbg('[MIG-HOST] Player REJOINED seat='+existingSeat+' name='+_humanSeats[existingSeat].name+' id='+data._from);
        showStatus(_humanSeats[existingSeat].name+' riconnesso!', 2000);
        _fbDb.ref('rooms/'+mpRoom+'/seats/'+data._from).set(existingSeat);
        deduplicateNames();
        renderLabels();
        renderAll();
        _logSeatOwnership('migrated host rejoin seat='+existingSeat);
        bcastGSNow();
        return;
      }
      // Original host not in _humanSeats at all — add at seat 0
      if(isOrig) {
        dbg('[MIG-HOST] Original host rejoined as regular client — adding to seat 0');
        _humanSeats[0] = { name: data.name || PLAYER_NAMES[0] || 'Host', id: data._from, lastPing: Date.now() };
        _humanSeatSet.add(0);
        PLAYER_NAMES[0] = _humanSeats[0].name;
        _fbDb.ref('rooms/'+mpRoom+'/seats/'+data._from).set(0);
        deduplicateNames();
        renderLabels();
        renderAll();
        _logSeatOwnership('migrated host restored original host on seat 0');
        bcastGSNow();
        return;
      }
      // Mid-game: allow unknown player to take over a CPU seat
      var migFreeSeat = -1;
      for(var ms=1;ms<=3;ms++){ if(!_humanSeatSet.has(ms)){ migFreeSeat=ms; break; } }
      if(migFreeSeat < 0){ dbg('[MIG-HOST] Join from unknown player, all seats taken'); return; }
      var migName = data.name || 'Giocatore '+(migFreeSeat+1);
      _humanSeats[migFreeSeat] = {name:migName, id:data._from, lastPing:Date.now()};
      _humanSeatSet.add(migFreeSeat);
      PLAYER_NAMES[migFreeSeat] = migName;
      dbg('[MIG-HOST] Mid-game join: seat='+migFreeSeat+' name='+migName);
      showStatus(migName + ' si \u00e8 unito!', 2000);
      deduplicateNames();
      renderLabels();
      _logSeatOwnership('migrated host assigned human seat='+migFreeSeat);
      bcastGSNow();
      _fbDb.ref('rooms/'+mpRoom+'/seats/'+data._from).set(migFreeSeat);
      return;
    }
    if(data.t === 'play' && mpMode && game) {
      var playSeat = -1;
      for(var k2 in _humanSeats) { if(_humanSeats[k2].id === data._from) { playSeat = parseInt(k2); break; } }
      // Original host always plays at seat 0 on rejoin
      if(playSeat < 0 && data._from === _originalHostId) {
        dbg('[MIG-HOST] Original host play not in _humanSeats, forcing seat 0');
        playSeat = 0;
      }
      if(playSeat < 0) { dbg('[MIG-HOST] Play from unknown player, ignoring'); return; }
      _humanSeats[playSeat].lastPing = Date.now();
      dbg('[MIG-HOST] Play: seat='+playSeat+' cardId='+data.cardId+' currentPlayer='+game.currentPlayer);
      if(game.currentPlayer !== playSeat) { dbg('[MIG-HOST] Not this player\'s turn, ignoring'); return; }
      var card = game.hands[playSeat].find(function(c) { return c.id === data.cardId; });
      if(!card || !isCardPlayable(playSeat, card)) { dbg('[MIG-HOST] Card not found or not playable'); return; }
      dbg('[MIG-HOST] Executing play for seat='+playSeat);
      _logEvent('card-played', playSeat, { cardId: data.cardId });
      _maybeWriteCheckpoint();
      _origPlayCard(playSeat, card).catch(function(e) { dbg('[MIG-HOST] playCard ERR: '+e); });
    }
    if(data.t === 'emote' && data.eid && typeof data.pidx === 'number') {
      try { var es = window._emoteSystem; if(es) { var em = es.findEmote(data.eid); if(em) es.showForPlayer(data.pidx, em); } } catch(e) {}
    }
    if(data.t === 'chat') { _handleChatMessage(data); }
  }
  mpListen(_migratedHostHandler);
  startHostHeartbeat();

  // Start host watchdog to detect disconnected human players
  if(_hostWatchdogTimer) clearInterval(_hostWatchdogTimer);
  _clientDisconnected = false;
  _hostWatchdogTimer = setInterval(function(){
    if(!mpMode || !game || game.phase==='done') return;
    var anyDisc = false;
    for(var k in _humanSeats){
      if(Date.now() - _humanSeats[k].lastPing > 30000){
        anyDisc = true;
        break;
      }
    }
    if(anyDisc && !_clientDisconnected){
      _clientDisconnected = true;
      dbg('[HOST-WD] Detected disconnected client(s) while hosting migrated room');
      _logSeatOwnership('host watchdog disconnect snapshot');
      _showDiscBanner('⚠️ Un giocatore disconnesso...', 0, 'In attesa di riconnessione...');
      startHostHeartbeat();
    }
  }, 8000);

  // Hide disconnect banner with success message
  _showDiscSuccess('✅ Sei diventato il nuovo host!');
  showStatus('Sei diventato il nuovo host!', 3000);

  dbg('[BECOME] *** Host migration complete ***');
}

// Demote from host to client
function _demoteToClient() {
  dbg('[DEMOTE] *** Demoting to client *** mySeat='+mySeat+' epoch='+_hostEpoch+' lastSeenEpoch='+_lastSeenEpoch);
  isHost = false;
  _isViceHost = false;
  _viceHostId = '';
  _stopHostLease();
  _stopEventLogListener();
  stopHostHeartbeat();
  stopTurnTimer();
  if(_hostWatchdogTimer) { dbg('[DEMOTE] Clearing host watchdog'); clearInterval(_hostWatchdogTimer); _hostWatchdogTimer = null; }
  // Reset seq tracking so we accept state from the new host
  _latestAppliedStateSeq = 0;
  _stateSeq = 0;
  dbg('[DEMOTE] Reset seq tracking: _latestAppliedStateSeq=0 _stateSeq=0');
  dbg('[DEMOTE] Starting meta watch as client');
  _startMetaWatch();
  // Force a fresh state pull so UI updates immediately
  dbg('[DEMOTE] Pulling latest state from new host');
  pullLatestState(0, 3);
  dbg('[DEMOTE] Demotion complete, now a client');
}

// Check meta on reconnect (called when Firebase .info/connected fires or on forceReconnect)
function _checkMetaOnReconnect() {
  if(!_fbDb || !mpRoom || !mpMode) { dbg('[RECONN] SKIP: db='+!!_fbDb+' room='+mpRoom+' mpMode='+mpMode); return; }
  dbg('[RECONN] Checking meta on reconnect... isHost='+isHost+' myId='+MY_ID+' epoch='+_hostEpoch);
  _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap) {
    var meta = snap.val();
    if(!meta) { dbg('[RECONN] Meta is null, room may be gone'); return; }
    dbg('[RECONN] Meta: hostId='+meta.hostId+' epoch='+meta.hostEpoch+' origHost='+meta.originalHostId+' lease='+meta.hostLease);
    if(isHost && meta.hostId !== MY_ID && meta.hostEpoch > _hostEpoch) {
      dbg('[RECONN] *** SOMEONE ELSE IS HOST *** (their epoch='+meta.hostEpoch+' mine='+_hostEpoch+') — demoting');
      _hostEpoch = meta.hostEpoch;
      _lastSeenEpoch = meta.hostEpoch;
      _demoteToClient();
      showStatus('Un altro giocatore è diventato host', 2000);
    } else if(!isHost && meta.hostId === MY_ID && meta.hostEpoch >= _lastSeenEpoch) {
      dbg('[RECONN] *** I AM THE DESIGNATED HOST *** epoch='+meta.hostEpoch+' — becoming host');
      _hostEpoch = meta.hostEpoch;
      _lastSeenEpoch = meta.hostEpoch;
      _becomeHost();
    } else {
      dbg('[RECONN] No role change needed. isHost='+isHost+' metaHost='+meta.hostId+' metaEpoch='+meta.hostEpoch);
    }
  });
}

// ─── State sync: host writes full state to DB, client listens ───
var _stateRef = null;
var _stateSeq = 0;
var _latestAppliedStateSeq = 0;

function makeStateSnapshot(seq) {
  return {
    h: game.hands,
    tr: game.trick.map(function(t){ return {p:t.playerIdx, c:t.card}; }),
    tn: game.trickNum,
    lp: game.leadPlayer,
    cp: game.currentPlayer,
    ls: game.leadSuit,
    sc: game.scores,
    tc: game.trickCards,
    ph: game.phase,
    an: game.animating || false,
    gm: gameMode,
    diff: cpuDifficulty || 'medio',
    names: PLAYER_NAMES.slice(),
    hs: Array.from(_humanSeatSet),
    seq: seq,
    _epoch: _hostEpoch,
    _eventSeq: _eventSeq || 0,
    tsc: tournamentScores.slice(),
    tact: tournamentActive,
    tov: tournamentOver,
    _ts: firebase.database.ServerValue.TIMESTAMP
  };
}

var _syncDebounceTimer = null;
var _syncImmediate = false; // set true for must-send-now calls
function syncState(immediate) {
  if(!mpMode || !isHost || !_fbDb || !mpRoom) return;
  // Split-brain guard: don't write if we know a higher epoch exists
  if(_lastSeenEpoch > _hostEpoch) {
    dbg('[SYNC-GUARD] Blocked state write: lastSeenEpoch='+_lastSeenEpoch+' > myEpoch='+_hostEpoch+' — demoting');
    _demoteToClient();
    return;
  }
  if(immediate) {
    // Cancel any pending debounce and write now
    if(_syncDebounceTimer) { clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
    return _doSyncStateNow();
  }
  // Debounce: collapse rapid calls into one write (120ms window)
  if(!_syncDebounceTimer) {
    _syncDebounceTimer = setTimeout(function() {
      _syncDebounceTimer = null;
      _doSyncStateNow();
    }, 120);
  }
  return null;
}
function _doSyncStateNow() {
  if(!mpMode || !isHost || !_fbDb || !mpRoom) return null;
  if(_lastSeenEpoch > _hostEpoch) return null;
  _stateSeq++;
  var state = makeStateSnapshot(_stateSeq);
  dbg('[STATE-WRITE] seq='+_stateSeq+' epoch='+_hostEpoch+' cp='+(game?game.currentPlayer:'n/a')+' phase='+(game?game.phase:'n/a')+' humans=['+Array.from(_humanSeatSet).join(',')+']');
  _fbDb.ref('rooms/'+mpRoom+'/state').set(state)
    .catch(function(e){ dbg('STATE ERR: '+e); });
  return state;
}

function applyRemoteState(data) {
  var seq = data.seq || 0;
  if(seq && seq < _latestAppliedStateSeq) return false;
  _latestAppliedStateSeq = Math.max(_latestAppliedStateSeq, seq);
  // Clear client play lock: new state from host means any pending play is resolved
  _humanPlayLock = false;
  // Firebase drops empty arrays as null — treat null/missing hand entries as []
  var rawHands = data.h || [];
  game.hands = [0,1,2,3].map(function(i){
    var h = rawHands[i];
    return (h && typeof h === 'object') ? Object.values(h).map(function(c){ return {suit:c.suit,rank:c.rank,id:c.id}; }) : [];
  });
  game.trick = (data.tr||[]).map(function(t){ return {playerIdx:t.p, card:{suit:t.c.suit,rank:t.c.rank,id:t.c.id}}; });
  game.trickNum = data.tn || 0;
  game.leadPlayer = data.lp || 0;
  game.currentPlayer = data.cp || 0;
  game.leadSuit = data.ls || null;
  game.scores = data.sc ? data.sc.slice() : [0,0,0,0];
  game.trickCards = data.tc ? Object.values(data.tc).map(function(c){ return {suit:c.suit,rank:c.rank,id:c.id}; }) : [];
  game.phase = data.ph || 'playing';
  game.animating = !!data.an;

  // Sync tournament state from host
  if (data.tsc) {
    tournamentScores = data.tsc.slice();
    tournamentActive = !!data.tact;
    tournamentOver = !!data.tov;
    renderTournament();
  }

  renderAll();
  if(game.phase === 'done') showGameOver();
  return true;
}

function _syncHumanSeatsFromState(humanSeats) {
  var before = Array.from(_humanSeatSet).join(',');
  if (humanSeats) _humanSeatSet = new Set(humanSeats);
  if (mpMode && mySeat >= 0) _humanSeatSet.add(mySeat);
  dbg('[SEATS] syncHumanSeatsFromState before=['+before+'] after=['+Array.from(_humanSeatSet).join(',')+'] mySeat='+mySeat+' myRole='+(mySeat >= 0 && _humanSeatSet.has(mySeat) ? 'human' : 'cpu'));
  _logSeatOwnership('after state sync');
}

function pullLatestState(minSeq, attempts) {
  if(!_fbDb || !mpRoom || attempts <= 0) return;
  _fbDb.ref('rooms/'+mpRoom+'/state').once('value').then(function(snap){
    var data = snap.val();
    if(!data || data.seq == null) return;  // seq always present in valid states
    var seq = data.seq || 0;
    var requiredSeq = Math.max(minSeq || 0, _latestAppliedStateSeq || 0);
    if(seq < requiredSeq) {
      setTimeout(function(){ pullLatestState(minSeq, attempts - 1); }, 250);
      return;
    }
    applyRemoteState(data);
    if(data.ph !== 'done' && attempts > 1) {
      setTimeout(function(){ pullLatestState(minSeq, attempts - 1); }, 500);
    }
  }).catch(function(e){ dbg('STATE PULL ERR: '+e); });
}

function _listenState() {
  if(!_fbDb || !mpRoom || _stateRef) return;
  _stateRef = _fbDb.ref('rooms/'+mpRoom+'/state');
  var _prevTrickLen = -1;
  var _prevTrickNum = -1;
  var _prevPhase = '';
  var _prevSeq = 0;
  var _firstSnap = true;

  _stateRef.on('value', function(snap){
    var data = snap.val();
    if(!data || data.seq == null) return;  // seq always present in valid states
    var seq = data.seq || 0;
    var stateEpoch = data._epoch || 0;

    // Epoch guard: ignore state from a stale host
    if(stateEpoch < _lastSeenEpoch) {
      dbg('[STATE-EPOCH] IGNORED stale state: epoch='+stateEpoch+' < lastSeen='+_lastSeenEpoch+' seq='+seq);
      return;
    }
    if(stateEpoch > _lastSeenEpoch) {
      dbg('[STATE-EPOCH] New epoch detected: '+stateEpoch+' > '+_lastSeenEpoch+' — resetting seq tracking');
      _lastSeenEpoch = stateEpoch;
      // Reset seq tracking so new host's state is accepted regardless of seq number
      _prevSeq = 0;
      _latestAppliedStateSeq = 0;
      if(isHost && stateEpoch > _hostEpoch) {
        dbg('[STATE-EPOCH] Higher epoch than mine ('+_hostEpoch+') — demoting to client');
        _demoteToClient();
      }
    }

    // Host listens only for epoch changes — never apply own state writes back
    if(isHost) return;

    var seenSeq = Math.max(_prevSeq, _latestAppliedStateSeq);
    if(seq <= seenSeq && !_firstSnap) return;
    _prevSeq = seq;
    dbg('STATE seq='+seq+' epoch='+stateEpoch+' cp='+data.cp+' tr='+(data.tr?data.tr.length:0)+' tn='+data.tn);

    if(!game) game = {hands:[[],[],[],[]],trick:[],trickNum:0,leadPlayer:0,currentPlayer:0,leadSuit:null,scores:[0,0,0,0],trickCards:[],phase:'playing',animating:false};
    if(!mpMode){
      mpMode = true; gameMode = data.gm||gameMode||'perdere';
      if(data.diff) cpuDifficulty = data.diff;
      if(data.names) for(var i=0;i<4;i++) PLAYER_NAMES[i]=data.names[i];
      if(!_mpPingTimer) _mpPingTimer = setInterval(function(){ if(mpMode) mpSend({t:'ping'}); }, 25000);
      initAudio();
    }
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    // Only hide game-over if incoming state is NOT the final done-state;
    // otherwise applyRemoteState shows it correctly.
    if((data.ph || '') !== 'done') {
      document.getElementById('game-over').classList.remove('show');
    }
    document.getElementById('quit-btn').style.display = '';
    if(mpMode) _showChatBtn(true);
    // mySeat is set by the dedicated seats listener — do NOT overwrite it here
    if(data.names) for(var i=0;i<4;i++) PLAYER_NAMES[i]=data.names[i];
    if(data.gm) gameMode = data.gm;
    if(data.diff) cpuDifficulty = data.diff;
    _syncHumanSeatsFromState(data.hs);

    // Detect changes for sound effects (skip on first snapshot)
    var newTrickLen = data.tr ? data.tr.length : 0;
    var newTrickNum = data.tn || 0;
    if(!_firstSnap){
      if(newTrickLen > _prevTrickLen && _prevTrickLen >= 0){
        sndCardPlay();
        // Asso detection removed
        if(data.gm === 'perdere' && data.tr.length > 0){
          // scardone removed
        }
      }
      if(newTrickNum > _prevTrickNum && _prevTrickNum >= 0) sndTrickWon();
      if(data.ph === 'done' && _prevPhase !== 'done'){
        var myScore = data.sc[mySeat >= 0 ? mySeat : 1];
        var maxScore = Math.max.apply(null, data.sc);
        if(myScore >= maxScore) sndWin(); else sndLose();
      }
    }
    _prevTrickLen = newTrickLen;
    _prevTrickNum = newTrickNum;
    _prevPhase = data.ph || '';
    _firstSnap = false;

    if(!applyRemoteState(data)) return;
  });
  _fbListeners.push(_stateRef);
  dbg('Listening on state for room '+mpRoom);
}

// ─── Room Browser ───
var _lobbyRooms = {};
var _lobbyRef = null;

function startLobbyBrowser() {
  stopLobbyBrowser();
  if(!_fbDb) {
    document.getElementById('room-list-status').textContent = 'Connessione a Firebase...';
    dbg('[LOBBY] _fbDb non pronto, retry in 500ms (_fbReady='+_fbReady+')');
    setTimeout(function(){ startLobbyBrowser(); }, 500);
    return;
  }
  _lobbyRooms = {};
  renderRoomList();
  document.getElementById('room-list-status').textContent = 'Cercando partite...';
  dbg('LOBBY browser start — _fbDb='+!!_fbDb+' _fbReady='+_fbReady);
  _lobbyRef = _fbDb.ref('lobby');
  // Timeout: if no data after 5s, something is wrong
  var _lobbyTimeout = setTimeout(function(){
    dbg('[LOBBY] TIMEOUT: nessun dato ricevuto dopo 5s. Possibili cause: regole Firebase bloccanti o connessione persa.');
    document.getElementById('room-list-status').textContent = 'Impossibile caricare le stanze. Controlla la connessione.';
    // Try a one-time read as fallback
    _fbDb.ref('lobby').once('value').then(function(snap){
      dbg('[LOBBY] Fallback once() riuscito: ' + JSON.stringify(snap.val()));
    }).catch(function(e){
      dbg('[LOBBY] Fallback once() ERRORE: ' + e.message);
    });
  }, 5000);
  _lobbyRef.on('value', function(snap){
    clearTimeout(_lobbyTimeout);
    var rooms = snap.val() || {};
    dbg('[LOBBY] Dati ricevuti: ' + Object.keys(rooms).length + ' stanze totali');
    _lobbyRooms = {};
    var now = Date.now();
    for(var code in rooms){
      var r = rooms[code];
      if(r && r.time){
        var age = now - r.time;
        if(age < 120000){
          _lobbyRooms[code] = r;
        } else {
          dbg('[LOBBY] Stanza ' + code + ' scartata: age=' + Math.round(age/1000) + 's');
        }
      } else {
        dbg('[LOBBY] Stanza ' + code + ' senza timestamp, inclusa comunque');
        if(r) _lobbyRooms[code] = r;
      }
    }
    dbg('[LOBBY] Stanze visibili: ' + Object.keys(_lobbyRooms).length);
    renderRoomList();
  }, function(err){
    dbg('[LOBBY] ERRORE lettura lobby: ' + err.message);
    document.getElementById('room-list-status').textContent = 'Errore: ' + err.message;
  });
  _fbListeners.push(_lobbyRef);
}
function stopLobbyBrowser() {
  if(_lobbyRef){ try{_lobbyRef.off();}catch(e){} _lobbyRef=null; }
}

function renderRoomList() {
  var list = document.getElementById('room-list');
  var status = document.getElementById('room-list-status');
  var codes = Object.keys(_lobbyRooms);
  if(codes.length === 0){
    list.innerHTML = '';
    status.textContent = _fbReady ? 'Nessuna stanza trovata' : 'Connessione...';
    return;
  }
  status.textContent = '';
  list.innerHTML = '';
  codes.forEach(function(code){
    var r = _lobbyRooms[code];
    var label = r.label || ('Partita di '+(r.host||'?'));
    var div = document.createElement('div');
    div.className = 'room-item';
    var diffLabel = r.difficulty === 'facile' ? '😊 Facile' : r.difficulty === 'difficile' ? '🔥 Difficile' : '🧠 Medio';
    div.innerHTML = '<div class="ri-info"><div class="ri-host">'+label+'</div><div class="ri-mode">'+(r.mode==='vincere'?'🔺 A Vincere':'🔻 A Perdere')+' — '+diffLabel+' — Host: '+(r.host||'?')+'</div></div><div class="ri-join">Unisciti ▸</div>';
    div.onclick = function(){ joinFromBrowser(code); };
    list.appendChild(div);
  });
}
function joinFromBrowser(code) {
  stopLobbyBrowser();
  document.getElementById('join-code-input').value = code;
  // Set gameMode from the room's mode so vincere rooms show seat picker
  var roomData = _lobbyRooms && _lobbyRooms[code];
  if (roomData && roomData.mode) {
    selectMode(roomData.mode);
  }
  if (roomData && roomData.difficulty) {
    cpuDifficulty = roomData.difficulty;
    selectDifficulty(roomData.difficulty);
  }
  var joinName = (document.getElementById('join-name-input').value||'').trim();
  if(!joinName){
    document.getElementById('join-name-input').style.border='2px solid #f44';
    document.getElementById('join-name-input').focus();
    return;
  }
  joinGame();
}

// ─── Heartbeat ───
var _heartbeatTimer = null;
var _roomLabel = '';
function startHostHeartbeat() {
  stopHostHeartbeat();
  if(!_fbDb || !mpRoom) { dbg('[HEARTBEAT] SKIP: _fbDb='+!!_fbDb+' mpRoom='+mpRoom); return; }
  var myName = _getMyName() || 'Host';
  // Auto-remove lobby entry when host disconnects (browser close, network loss)
  _fbDb.ref('lobby/'+mpRoom).onDisconnect().remove()
    .then(function(){ dbg('[HEARTBEAT] onDisconnect registrato per lobby/'+mpRoom); })
    .catch(function(e){ dbg('[HEARTBEAT] onDisconnect ERR: '+e.message); });
  function beat(){
    if(!_fbDb || !mpRoom) return;
    var data = {host:myName, mode:gameMode, difficulty:cpuDifficulty, label:_roomLabel||('Partita di '+myName), time:firebase.database.ServerValue.TIMESTAMP};
    dbg('[HEARTBEAT] Scrivendo in lobby/'+mpRoom+': ' + JSON.stringify({host:data.host, mode:data.mode}));
    _fbDb.ref('lobby/'+mpRoom).set(data)
      .then(function(){ dbg('[HEARTBEAT] OK — scritto in lobby/'+mpRoom); })
      .catch(function(e){ dbg('[HEARTBEAT] ERRORE scrittura lobby: '+e.message); });
  }
  beat();
  _heartbeatTimer = setInterval(beat, 30000);
}
function stopHostHeartbeat() {
  if(_heartbeatTimer){ clearInterval(_heartbeatTimer); _heartbeatTimer=null; }
}
function _removeLobbyEntry() {
  if(_fbDb && mpRoom) {
    dbg('[LOBBY] Removing lobby entry for room='+mpRoom);
    _fbDb.ref('lobby/'+mpRoom).remove().catch(function(e){ dbg('[LOBBY] Remove ERR: '+e); });
  }
}

// ─── Invite / Copy ───
var GAME_BASE_URL = 'https://htmlpreview.github.io/?https://github.com/ripom/ssp-test-ric/blob/main/tresette_multiplayers.html';
function getInviteLink() { return GAME_BASE_URL; }
function copyRoomCode() {
  var code = mpRoom; if(!code) return;
  var msg = document.getElementById('copy-msg');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){ msg.textContent='Copiato!'; setTimeout(function(){msg.textContent='';},2000); }).catch(function(){ prompt('Copia:',code); });
  } else { prompt('Copia:',code); }
}
function copyInviteLink() {
  var link = getInviteLink(); var msg = document.getElementById('copy-msg');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(link).then(function(){ msg.textContent='Link copiato!'; setTimeout(function(){msg.textContent='';},2000); }).catch(function(){ prompt('Copia:',link); });
  } else { prompt('Copia:',link); }
}

function _getMyName() {
  var v = (document.getElementById('my-name-input').value||'').trim();
  if(!v) v = (document.getElementById('host-name-input')&&document.getElementById('host-name-input').value||'').trim();
  if(!v) v = (document.getElementById('join-name-input')&&document.getElementById('join-name-input').value||'').trim();
  return v;
}

var _mpPingTimer = null;

// ===== HOST =====
var _clientName = 'Amico';
var _humanSeats = {}; // {seatIdx: {name, id, lastPing}}
var _humanSeatSet = new Set([0]); // set of seat indices occupied by humans

function _updateSeatUI(){
  for(var i=0;i<4;i++){
    var nameEl = document.getElementById('seat-name-'+i);
    var rowEl = document.getElementById('seat-'+i);
    var iconEl = rowEl.querySelector('.seat-icon');
    if(i===0){
      nameEl.textContent = PLAYER_NAMES[0];
      nameEl.style.color = '#4f4';
      iconEl.textContent = '👤';
    } else if(_humanSeats[i]){
      nameEl.textContent = _humanSeats[i].name;
      nameEl.style.color = '#4f4';
      iconEl.textContent = '👤';
    } else {
      nameEl.innerHTML = '<span style="color:#888">In attesa...</span> <button class="lobby-btn" style="font-size:10px;padding:3px 8px;min-height:24px;margin-left:6px" onclick="_showInviteForSeat('+i+')">📨 Invita</button>';
      nameEl.style.color = '';
      iconEl.textContent = '⏳';
    }
  }
  var count = Object.keys(_humanSeats).length;
  var statusEl = document.getElementById('host-status');
  if(count === 0) statusEl.textContent = 'In attesa di giocatori...';
  else if(count < 3) statusEl.textContent = count+' giocatore/i uniti. Puoi iniziare o attendere altri.';
  else statusEl.textContent = 'Tavolo pieno! 4 giocatori pronti.';
  // Show start button as soon as at least 1 player joins
  document.getElementById('start-mp-btn').style.display = count > 0 ? 'block' : 'none';
  // Auto-start when all 4 seats filled
  if(count === 3 && !mpMode){
    statusEl.textContent = 'Tavolo pieno! Partita in partenza...';
    setTimeout(function(){ if(!mpMode) startMultiplayerGame(); }, 1500);
  }
  // Publish seat info to Firebase (debounced to avoid rapid writes)
  if(_fbDb && mpRoom && isHost){
    if(typeof _seatInfoDebounce !== 'undefined' && _seatInfoDebounce) clearTimeout(_seatInfoDebounce);
    _seatInfoDebounce = setTimeout(function(){
      _seatInfoDebounce = null;
      if(!_fbDb || !mpRoom || !isHost) return;
      var sInfo = {};
      for(var si=0;si<4;si++){
        var key = 's' + si;
        if(si===0) sInfo[key] = {name: PLAYER_NAMES[0], taken: true};
        else if(_humanSeats[si]) sInfo[key] = {name: _humanSeats[si].name, taken: true};
        else sInfo[key] = {name: '', taken: false};
      }
      _fbDb.ref('rooms/'+mpRoom+'/seatInfo').set(sInfo);
    }, 300);
  }
}

function hostGame() {
  var hostNameEl = document.getElementById('host-name-input');
  var roomNameEl = document.getElementById('room-name-input');
  var myName = (hostNameEl.value||'').trim();
  var roomLabel = (roomNameEl.value||'').trim() || 'Partita di '+myName;
  if(!myName){ hostNameEl.style.border='2px solid #f44'; hostNameEl.focus(); return; }
  hostNameEl.style.border='';
  if(!_fbReady){ alert('Firebase non pronto. Riprova.'); return; }
  // Clean up any previous room's lobby entry before creating a new one
  if(mpRoom && _fbDb) {
    dbg('[HOST-INIT] Cleaning up previous room lobby entry: '+mpRoom);
    _fbDb.ref('lobby/'+mpRoom).remove();
  }
  stopHostHeartbeat();
  _clearMessageListeners();
  PLAYER_NAMES[0] = myName;
  mpRoom = genCode(); isHost = true; mySeat = 0;
  _saveSession(mpRoom, myName, true);
  _setSessionSeat(0);
  _updatePresenceRoom(mpRoom);
  _humanSeats = {};
  _humanSeatSet = new Set([0]);
  _logSeatOwnership('host created room before players join');
  // Write host's own seat to Firebase so migrated hosts can find us
  if(_fbDb) _fbDb.ref('rooms/'+mpRoom+'/seats/'+MY_ID).set(0);
  // Initialize host migration epoch
  _hostEpoch = 1;
  _lastSeenEpoch = 1;
  _originalHostId = MY_ID;
  dbg('[HOST-INIT] Epoch initialized: epoch='+_hostEpoch+' originalHostId='+_originalHostId+' myId='+MY_ID);
  dbg('HOST room='+mpRoom+' label='+roomLabel);
  document.getElementById('room-code').textContent = mpRoom;
  document.getElementById('create-room-btn').style.display = 'none';
  document.getElementById('host-seats-area').style.display = '';
  document.getElementById('host-status').textContent = 'In attesa di giocatori...';
  document.getElementById('start-mp-btn').style.display = 'none';
  _roomLabel = roomLabel;
  _updateSeatUI();
  startHostHeartbeat();
  // Write initial host meta for migration system
  dbg('[HOST-INIT] Starting host lease + state listener for room='+mpRoom);
  _startHostLease();
  // Listen to state (needed so we can detect epoch changes if we get demoted)
  _listenState();

  var _clientLastPing = Date.now();
  var _clientDisconnected = false;

  function hostHandler(data){
    _clientLastPing = Date.now();
    if(_clientDisconnected){
      _clientDisconnected = false;
      dbg('[HOST] Client traffic resumed from '+data._from+' event='+data.t);
      _logSeatOwnership('host detected reconnect');
      _showDiscSuccess('✅ Giocatore riconnesso!');
    }
    if(data.t==='ping'){
      for(var hp in _humanSeats){
        if(_humanSeats[hp].id === data._from){
          _humanSeats[hp].lastPing = Date.now();
          dbg('[HOST] ping refreshed seat='+hp+' id='+data._from+' name='+(_humanSeats[hp].name||PLAYER_NAMES[hp]||'?'));
          break;
        }
      }
      return;
    }
    if(data.t==='join'){
      dbg('[HOST] join request from='+data._from+' name='+(data.name||'?')+' prefSeat='+(data.prefSeat != null ? data.prefSeat : 'none')+' rejoinSeat='+(data.rejoinSeat != null ? data.rejoinSeat : 'none')+' mpMode='+mpMode);
      // Check if this player already has a seat (rejoin by ID)
      var existingSeat = -1;
      for(var k in _humanSeats){ if(_humanSeats[k].id === data._from){ existingSeat = parseInt(k); break; } }
      if(existingSeat < 0 && typeof data.rejoinSeat === 'number' && data.rejoinSeat >= 1 && data.rejoinSeat <= 3 && mpMode) {
        var wantedSeat = data.rejoinSeat;
        var wantedEntry = _humanSeats[wantedSeat];
        var wantedStale = wantedEntry && (Date.now() - wantedEntry.lastPing) > 10000;
        var wantedHuman = _humanSeatSet.has(wantedSeat);
        var wantedNameOk = !data.name || PLAYER_NAMES[wantedSeat] === data.name || (wantedEntry && wantedEntry.name === data.name);
        if(wantedHuman && wantedNameOk && (!wantedEntry || wantedEntry.id === data._from || wantedStale)) {
          existingSeat = wantedSeat;
          _humanSeats[existingSeat] = {name:data.name || PLAYER_NAMES[existingSeat] || ('Giocatore '+(existingSeat+1)), id:data._from, lastPing:Date.now()};
          dbg('HOST: player REJOIN by rejoinSeat='+existingSeat+' stale='+!!wantedStale+' wantedHuman='+wantedHuman);
        }
      }
      // If no match by ID, try matching by name (player refreshed page and got new ID)
      if(existingSeat < 0 && data.name && mpMode) {
        for(var kn in _humanSeats){
          if(_humanSeats[kn].name === data.name && (Date.now() - _humanSeats[kn].lastPing) > 10000){
            existingSeat = parseInt(kn);
            // Update the stored ID to the new one
            _humanSeats[existingSeat].id = data._from;
            // Remove old seat reference
            dbg('HOST: player REJOIN by name, updating ID for seat='+existingSeat);
            break;
          }
        }
      }
      if(existingSeat >= 0){
        _humanSeats[existingSeat] = _humanSeats[existingSeat] || {};
        _humanSeats[existingSeat].name = _humanSeats[existingSeat].name || data.name || PLAYER_NAMES[existingSeat] || ('Giocatore '+(existingSeat+1));
        _humanSeats[existingSeat].lastPing = Date.now();
        _humanSeatSet.add(existingSeat);
        dbg('HOST: player REJOINED seat='+existingSeat+' name='+_humanSeats[existingSeat].name);
        if(mpMode && game){
          showStatus(_humanSeats[existingSeat].name+' riconnesso!', 2000);
          _logSeatOwnership('host rejoin seat='+existingSeat);
          bcastGSNow();
        }
        // Write seat assignment to dedicated path for this player
        _fbDb.ref('rooms/'+mpRoom+'/seats/'+data._from).set(existingSeat);
        return;
      }
      // New player — assign seat (honor preferred seat if available)
      // Mid-game: allow joining a CPU-controlled seat
      var freeSeat = -1;
      // Try preferred seat first (for vincere mode seat selection)
      if (typeof data.prefSeat === 'number' && data.prefSeat >= 1 && data.prefSeat <= 3 && !_humanSeatSet.has(data.prefSeat)) {
        freeSeat = data.prefSeat;
      }
      // Fallback: next free seat (not in _humanSeatSet = currently CPU)
      if (freeSeat < 0) {
        for(var s=1;s<=3;s++){ if(!_humanSeatSet.has(s)){ freeSeat=s; break; } }
      }
      if(freeSeat < 0) return; // full
      var pName = data.name || 'Giocatore '+(freeSeat+1);
      _humanSeats[freeSeat] = {name:pName, id:data._from, lastPing:Date.now()};
      _humanSeatSet.add(freeSeat);
      PLAYER_NAMES[freeSeat] = pName;
      dbg('HOST: new player seat='+freeSeat+' name='+pName+' mid-game='+mpMode);
      _logSeatOwnership('host assigned human seat='+freeSeat);
      _logEvent('seat-assigned', freeSeat, { name: pName, playerId: data._from });
      if(!mpMode) _updateSeatUI();
      // Write seat assignment to dedicated path for this player
      _fbDb.ref('rooms/'+mpRoom+'/seats/'+data._from).set(freeSeat);
      if(mpMode && game) {
        // Mid-game join: announce, sync state, and re-render labels
        showStatus(pName + ' si \u00e8 unito!', 2000);
        deduplicateNames();
        renderLabels();
        bcastGSNow();
        dbg('HOST: mid-game join seat='+freeSeat+' cp='+game.currentPlayer+' isHuman='+isHumanSeat(game.currentPlayer));
      }
    }
    if(data.t==='play' && mpMode && game){
      // Find which seat this player is
      var playSeat = -1;
      for(var k2 in _humanSeats){ if(_humanSeats[k2].id === data._from){ playSeat = parseInt(k2); break; } }
      if(playSeat < 0) { dbg('HOST play REJECTED: unknown player _from='+data._from); return; }
      _humanSeats[playSeat].lastPing = Date.now();
      dbg('HOST play seat='+playSeat+' cardId='+data.cardId+' cp='+game.currentPlayer+' anim='+game.animating+' phase='+game.phase);
      if(game.currentPlayer !== playSeat) { dbg('HOST play REJECTED: not their turn (cp='+game.currentPlayer+' playSeat='+playSeat+')'); return; }
      var card = game.hands[playSeat].find(function(c){return c.id===data.cardId;});
      if(!card || !isCardPlayable(playSeat,card)) { dbg('HOST play REJECTED: card not found or not playable cardId='+data.cardId); return; }
      _logEvent('card-played', playSeat, { cardId: data.cardId });
      _maybeWriteCheckpoint();
      _origPlayCard(playSeat, card).catch(function(e){ dbg('playCard ERR: '+e); });
    }
    if(data.t==='emote' && data.eid && typeof data.pidx==='number'){
      try{
        var es=window._emoteSystem; if(es){ var em=es.findEmote(data.eid); if(em) es.showForPlayer(data.pidx,em); }
      }catch(e){}
    }
    if(data.t==='chat') { _handleChatMessage(data); }
  }
  mpListen(hostHandler);

  // Watchdog
  if(_hostWatchdogTimer) clearInterval(_hostWatchdogTimer);
  _hostWatchdogTimer = setInterval(function(){
    if(!mpMode || !game || game.phase==='done') return;
    var anyDisc = false;
    for(var k in _humanSeats){
      if(Date.now() - _humanSeats[k].lastPing > 30000){
        anyDisc = true;
        break;
      }
    }
    if(anyDisc && !_clientDisconnected){
      _clientDisconnected = true;
      dbg('[HOST-WD] Detected disconnected client(s) on primary host');
      _logSeatOwnership('host watchdog disconnect snapshot');
      _showDiscBanner('⚠️ Un giocatore disconnesso...', 0, 'In attesa di riconnessione...');
      startHostHeartbeat();
    }
  }, 8000);
}

var _startingGame = false; // guard against double-calls
function startMultiplayerGame() {
  if(!isHost || _startingGame) return;
  _startingGame = true;
  mpMode = true;
  // Ensure host lease is running (may have been stopped if lobby took >10s)
  if(!_metaLeaseTimer) _startHostLease();
  _mpPingTimer = setInterval(function(){ if(mpMode) mpSend({t:'ping'}); }, 25000);
  PLAYER_NAMES[0] = document.getElementById('host-name-input').value.trim() || 'Tu';
  // Fill seats: human players get their names, empty seats become CPU with random names
  var usedNames = [PLAYER_NAMES[0]];
  _humanSeatSet = new Set([0]);
  for(var s=1;s<=3;s++){
    if(_humanSeats[s]){
      PLAYER_NAMES[s] = _humanSeats[s].name;
      _humanSeatSet.add(s);
    } else {
      PLAYER_NAMES[s] = pickCpuName(usedNames);
      dbg('[HOST-START] seat='+s+' assigned as cpu name='+PLAYER_NAMES[s]);
    }
    usedNames.push(PLAYER_NAMES[s]);
  }
  _logSeatOwnership('startMultiplayerGame after seat fill');
  deduplicateNames();
  document.getElementById('label-south').innerHTML=PLAYER_NAMES[0]+' <span class="lb-pts"></span>';
  document.getElementById('label-east').innerHTML=PLAYER_NAMES[1]+' <span class="lb-pts"></span>';
  document.getElementById('label-north').innerHTML=PLAYER_NAMES[2]+' <span class="lb-pts"></span>';
  document.getElementById('label-west').innerHTML=PLAYER_NAMES[3]+' <span class="lb-pts"></span>';
  document.getElementById('lobby-overlay').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('game-over').classList.remove('show');
  document.getElementById('quit-btn').style.display = '';
  _showChatBtn(true);
  initAudio();

  // Always animate dealer selection for the first game of a multiplayer session
  document.getElementById('player-hand').innerHTML = '';
  document.getElementById('north-hand').innerHTML = '';
  document.getElementById('west-hand').innerHTML = '';
  document.getElementById('east-hand').innerHTML = '';
  document.getElementById('trick-area').innerHTML = '';

  // Pre-calculate dealer cards and winner, send to clients
  var _dTempDeck = shuffle(createDeck());
  var _dCards = [{suit:_dTempDeck[0].suit,rank:_dTempDeck[0].rank},{suit:_dTempDeck[1].suit,rank:_dTempDeck[1].rank},{suit:_dTempDeck[2].suit,rank:_dTempDeck[2].rank},{suit:_dTempDeck[3].suit,rank:_dTempDeck[3].rank}];
  var _dWinner = _calcDealerWinner(_dCards);
  // Build seatMap so clients can set mySeat before animation (avoids race condition)
  var _seatMap = {};
  for(var _sk in _humanSeats) { if(_humanSeats[_sk] && _humanSeats[_sk].id) _seatMap[_humanSeats[_sk].id] = parseInt(_sk); }
  dbg('[DEALER] Host seatMap: ' + JSON.stringify(_seatMap));
  mpSend({t:'dealer',cards:_dCards,winnerSeat:_dWinner,names:PLAYER_NAMES.slice(),seatMap:_seatMap});

  animateDealerSelection(function(dealerSeat) {
    _startingGame = false;
    initGame((dealerSeat + 1) % 4);
    resetTournament();
    renderAll(); renderTournament();
    dbg('HOST startGame cp='+game.currentPlayer);
    mpSend({t:'start',gm:gameMode,diff:cpuDifficulty,names:PLAYER_NAMES.slice(),hands:game.hands,lp:game.leadPlayer,cp:game.currentPlayer,humanSeats:Array.from(_humanSeatSet)});
    syncState(true);
    _logEvent('game-started', 0, { mode: gameMode, difficulty: cpuDifficulty, leadPlayer: game.leadPlayer });
    _writeCheckpoint();
    _updatePresenceInGame(true);
    sndStart(); showStatus('Partita iniziata!',1500);    showBuongiocoAndStart(function(){
      if(game && !isHumanSeat(game.currentPlayer)) setTimeout(function(){cpuTurn();},400);
    });
  }, {cards:_dCards, winnerSeat:_dWinner});
}

// ===== CLIENT =====
function showJoinUI() { showLobbySection('lobby-join'); document.getElementById('join-error').textContent=''; document.getElementById('join-status').textContent=''; startLobbyBrowser(); }

var _pendingJoinName = '';
var _pendingJoinCode = '';
var _seatInfoRef = null;

function joinGame() {
  var joinName = (document.getElementById('join-name-input').value||'').trim();
  if(!joinName){ document.getElementById('join-name-input').style.border='2px solid #f44'; document.getElementById('join-name-input').focus(); return; }
  document.getElementById('join-name-input').style.border='';
  var code = document.getElementById('join-code-input').value.trim();
  if(code.length!==6){ document.getElementById('join-error').textContent='Codice a 6 lettere'; return; }
  if(!_fbReady){ document.getElementById('join-error').textContent='Firebase non pronto.'; return; }

  _pendingJoinName = joinName;
  _pendingJoinCode = code.toUpperCase();

  if (gameMode === 'vincere') {
    // Show seat picker first
    showSeatPicker();
  } else {
    // A perdere: join immediately with original inline logic
    _doActualJoin(joinName, code.toUpperCase(), undefined);
  }
}

function showSeatPicker() {
  showLobbySection('lobby-pick-seat');
  document.getElementById('seat-pick-error').textContent = '';
  document.getElementById('seat-pick-confirm').disabled = true;
  _joinPreferredSeat = -1;
  var listEl = document.getElementById('seat-pick-list');
  listEl.innerHTML = '<div style="text-align:center;color:#888;font-size:12px">Caricamento posti...</div>';

  // Read seat info from Firebase
  if (_seatInfoRef) { _seatInfoRef.off(); _seatInfoRef = null; }
  _seatInfoRef = _fbDb.ref('rooms/' + _pendingJoinCode + '/seatInfo');
  _seatInfoRef.on('value', function(snap) {
    var raw = snap.val();
    // Normalize: host writes keys as s0,s1,s2,s3 — convert to indexed lookup
    var info = null;
    if (raw) {
      info = {};
      for (var i = 0; i < 4; i++) {
        info[i] = raw['s' + i] || raw[i] || null;
      }
    }
    _lastSeatInfo = info;
    renderSeatPicker(info);
  });
}

var _lastSeatInfo = null;

function renderSeatPicker(seatInfo) {
  var listEl = document.getElementById('seat-pick-list');
  listEl.innerHTML = '';
  if (!seatInfo || !seatInfo[0]) {
    listEl.innerHTML = '<div style="text-align:center;color:#f66;font-size:12px">Stanza non trovata o dati non disponibili. Riprova.</div>';
    document.getElementById('seat-pick-confirm').disabled = true;
    return;
  }
  var POSITIONS = ['Sud (Host)', 'Est', 'Nord', 'Ovest'];
  var PARTNERS = [2, 3, 0, 1]; // partner of seat i (0-indexed)
  for (var i = 0; i < 4; i++) {
    var si = seatInfo[i];
    var taken = si && si.taken;
    var name = (si && si.name) ? si.name : '';
    var partnerIdx = PARTNERS[i];
    var partnerName = (seatInfo[partnerIdx] && seatInfo[partnerIdx].name) ? seatInfo[partnerIdx].name : '?';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;cursor:' + (i === 0 || taken ? 'default' : 'pointer') + ';background:rgba(255,255,255,' + (i === 0 || taken ? '0.03' : '0.07') + ');border:2px solid ' + (_joinPreferredSeat === i ? '#fa4' : 'rgba(255,255,255,0.1)') + ';transition:border .2s;';
    var leftHtml = '<div>';
    leftHtml += '<div style="color:' + (taken ? '#888' : '#fff') + ';font-size:clamp(12px,2.5vw,14px);font-weight:bold">Posto ' + (i + 1) + ' — ' + POSITIONS[i] + '</div>';
    if (taken) {
      leftHtml += '<div style="color:#4f4;font-size:clamp(10px,2vw,12px)">👤 ' + name + '</div>';
    } else {
      leftHtml += '<div style="color:#5af;font-size:clamp(10px,2vw,12px)">✅ Libero</div>';
    }
    leftHtml += '<div style="color:#aaa;font-size:clamp(9px,1.8vw,10px)">Coppia con: Posto ' + (partnerIdx + 1) + (seatInfo[partnerIdx] && seatInfo[partnerIdx].name ? ' (' + seatInfo[partnerIdx].name + ')' : '') + '</div>';
    leftHtml += '</div>';
    var rightHtml = '';
    if (i === 0) {
      rightHtml = '<span style="color:#888;font-size:clamp(9px,1.8vw,10px)">👑 Host</span>';
    } else if (taken) {
      rightHtml = '<span style="color:#888;font-size:clamp(9px,1.8vw,10px)">🔒 Occupato</span>';
    } else {
      rightHtml = '<span style="color:#5af;font-size:clamp(10px,2vw,12px);font-weight:bold">Scegli ▶</span>';
    }
    row.innerHTML = leftHtml + '<div>' + rightHtml + '</div>';
    if (i > 0 && !taken) {
      row.setAttribute('data-seat', i);
      row.onclick = (function(seatIdx) {
        return function() {
          _joinPreferredSeat = seatIdx;
          document.getElementById('seat-pick-confirm').disabled = false;
          document.getElementById('seat-pick-error').textContent = '';
          // Re-render to highlight selection
          renderSeatPicker(_lastSeatInfo);
        };
      })(i);
    }
    listEl.appendChild(row);
  }
  // If the previously selected seat is now taken, clear selection
  if (_joinPreferredSeat > 0 && seatInfo[_joinPreferredSeat] && seatInfo[_joinPreferredSeat].taken) {
    _joinPreferredSeat = -1;
    document.getElementById('seat-pick-confirm').disabled = true;
  }
}

function confirmSeatPick() {
  if (_joinPreferredSeat < 1) {
    document.getElementById('seat-pick-error').textContent = 'Scegli un posto libero!';
    return;
  }
  // Stop listening to seat info
  if (_seatInfoRef) { _seatInfoRef.off(); _seatInfoRef = null; }
  _doActualJoin(_pendingJoinName, _pendingJoinCode, _joinPreferredSeat);
}

function cancelSeatPick() {
  if (_seatInfoRef) { _seatInfoRef.off(); _seatInfoRef = null; }
  showLobbySection('lobby-join');
}

function _doActualJoin(myName, code, prefSeat) {
  try {
  // Clean up listeners from any previous join attempt
  _fbListeners.forEach(function(r){ try{r.off();}catch(e){} });
  _fbListeners = [];
  _clearMessageListeners();
  _stateRef = null;
  _latestAppliedStateSeq = 0;
  _stateSeq = 0;
  if(_clientWatchdogTimer){ clearInterval(_clientWatchdogTimer); _clientWatchdogTimer = null; }
  if(_seatInfoRef){ try{_seatInfoRef.off();}catch(e){} _seatInfoRef = null; }
  
  isHost = false; mySeat = -1; mpRoom = code;
  // Reset epoch tracking for the new room — prevents stale epoch from previous session
  _hostEpoch = 0;
  _lastSeenEpoch = 0;
  _latestAppliedStateSeq = 0;
  _stateSeq = 0;
  _saveSession(mpRoom, myName, false);
  var _sess = _getSession();
  var _rejoinSeat = (_sess && _sess.room === mpRoom && typeof _sess.seat === 'number') ? _sess.seat : null;
  _updatePresenceRoom(code);
  dbg('CLIENT joining room='+mpRoom + (prefSeat != null ? ' prefSeat='+prefSeat : '') + ' rejoinSeat=' + (_rejoinSeat != null ? _rejoinSeat : 'none') + ' name=' + myName);
  document.getElementById('join-status').textContent='Connessione...';
  document.getElementById('join-error').textContent='';
  mpSend({t:'join', name:myName, prefSeat: prefSeat != null ? prefSeat : null, rejoinSeat: _rejoinSeat});
  var joinRetry = setInterval(function(){ if(mpMode){clearInterval(joinRetry);return;} mpSend({t:'join', name:myName, prefSeat: prefSeat != null ? prefSeat : null, rejoinSeat: _rejoinSeat}); }, 8000);

  var _hostLastPing = Date.now();
  var _hostDisconnected = false;

  // Listen for seat assignment on dedicated path
  var _seatRef = _fbDb.ref('rooms/'+mpRoom+'/seats/'+MY_ID);
  _seatRef.on('value', function(snap){
    var val = snap.val();
    if(val !== null && val !== undefined){
      var prevSeat = mySeat;
      mySeat = val;
      _setSessionSeat(mySeat);
      if (mpMode || game) _humanSeatSet.add(mySeat);
      dbg('[SEAT] Seat assigned via DB: mySeat='+mySeat+' (was '+prevSeat+') role='+(mySeat >= 0 && _humanSeatSet.has(mySeat) ? 'human' : 'cpu'));
      _logSeatOwnership('client seat assignment');
      document.getElementById('wait-status').textContent='Posto '+(mySeat+1)+' assegnato! In attesa dell\'host...';
      // Re-render if game is active so cards appear immediately
      if(game && mpMode && game.phase !== 'done') {
        dbg('[SEAT] Game active, triggering renderAll after seat assignment');
        renderAll();
      }
    }
  });
  _fbListeners.push(_seatRef);

  _listenState();

  function _processClientStart(data) {
    dbg('CLIENT _processClientStart cp='+data.cp+' mySeat='+mySeat);
    if(mySeat < 0) mySeat = 1; // fallback
    mpMode = true; gameMode = data.gm||'perdere';
    if(data.diff) cpuDifficulty = data.diff;
    _syncHumanSeatsFromState(data.humanSeats);
    dbg('[CLIENT-START] mySeat='+mySeat+' role='+(mySeat >= 0 && _humanSeatSet.has(mySeat) ? 'human' : 'cpu')+' humans=['+Array.from(_humanSeatSet).join(',')+']');
    for(var i=0;i<4;i++) PLAYER_NAMES[i]=data.names[i];
    game = {hands:data.hands.map(function(h){return h.map(function(c){return {suit:c.suit,rank:c.rank,id:c.id};});}),trick:[],trickNum:0,leadPlayer:data.lp||0,currentPlayer:data.cp||0,leadSuit:null,scores:[0,0,0,0],trickCards:[],phase:'playing',animating:false,_buongiocoDecls:[]};
    var clientDecls = applyBuongioco();
    game._buongiocoDecls = clientDecls;
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('game-over').classList.remove('show');
    document.getElementById('quit-btn').style.display = '';
    _showChatBtn(true);
    if(!_mpPingTimer) _mpPingTimer = setInterval(function(){ if(mpMode) mpSend({t:'ping'}); }, 25000);
    if (!tournamentActive) {
      resetTournament();
    }
    initAudio(); renderAll(); renderTournament(); _updatePresenceInGame(true); sndStart(); showStatus('Partita iniziata!',1500);
    showBuongiocoAndStart(null);
  }

  function clientHandler(data){
    _hostLastPing = Date.now();
    if(_hostDisconnected){
      _hostDisconnected = false;
      dbg('[CLIENT] Host traffic resumed with event='+data.t+' from='+data._from);
      _logSeatOwnership('client detected host reconnect');
      _showDiscSuccess('✅ Connessione ripristinata!');
    }
    // Reset play retry counter on any host response
    _discPlayRetryCount = 0;
    if(data.t==='ping') return;
    if(data.t==='final'){
      dbg('CLIENT final seq='+(data.seq||0)+' hasState='+(data.state ? 'yes' : 'no')+' ph='+(data.state&&data.state.ph));
      if(data.state && data.state.seq != null){
        // data.state.h may be null when Firebase drops empty arrays — applyRemoteState handles that
        applyRemoteState(data.state);
      } else {
        pullLatestState(data.seq || 0, 4);
      }
      return;
    }
    if(data.t==='quit'){
      dbg('[CLIENT] Received quit from host; closing room');
      // Host quit with no other humans — game over for real
      _dismissDealerBanner();
      showStatus('L\'host ha abbandonato!', 3000);
      _clearSession();
      _updatePresenceRoom(null);
      stopTurnTimer();
      game = null;
      mpMode = false;
      if(_mpPingTimer){ clearInterval(_mpPingTimer); _mpPingTimer=null; }
      if(_clientWatchdogTimer){ clearInterval(_clientWatchdogTimer); _clientWatchdogTimer=null; }
      _fbCleanup();
      document.getElementById('quit-btn').style.display='none';
      setTimeout(function(){ document.getElementById('overlay').classList.remove('hidden'); }, 3000);
      return;
    }
    if(data.t==='host-leaving'){
      // Host is leaving but room data preserved — attempt migration
      _dismissDealerBanner();
      dbg('[CLIENT] Host leaving — attempting immediate promotion');
      _logSeatOwnership('client received host-leaving');
      stopTurnTimer(); // prevent stale turn timer from firing during migration
      showStatus('L\'host ha abbandonato. Migrazione in corso...', 3000);
      // Read meta and attempt promotion immediately
      if(_fbDb && mpRoom) {
        _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap) {
          var meta = snap.val();
          if(!meta) {
            dbg('[CLIENT] host-leaving: meta is null, cannot migrate');
            showStatus('Impossibile continuare la partita.', 3000);
            _clearSession();
            stopTurnTimer();
            game = null;
            mpMode = false;
            _fbCleanup();
            document.getElementById('quit-btn').style.display='none';
            setTimeout(function(){ document.getElementById('overlay').classList.remove('hidden'); }, 3000);
            return;
          }
          // Force promotion — the host's lease will stop renewing
          // Attempt immediately: override the lease timeout check
          _attemptForcedPromotion(meta);
        });
      }
      return;
    }
    if(data.t==='dealer'){
      dbg('CLIENT dealer selection received: winner='+data.winnerSeat+' mySeat='+mySeat+' MY_ID='+MY_ID);
      // CRITICAL: set mpMode=true NOW so that getPlayerTargetPos applies the correct rotation
      // (otherwise rot=0 is used, same as host, and cards don't rotate on client screen)
      mpMode = true;
      // CRITICAL: set mySeat from seatMap BEFORE rendering, to fix rotation
      // The seat assignment via Firebase DB may not have arrived yet (race condition)
      if(data.seatMap) {
        dbg('[DEALER] Client received seatMap: ' + JSON.stringify(data.seatMap));
        var _foundSeat = data.seatMap[MY_ID];
        if(_foundSeat !== undefined && _foundSeat !== null) {
          dbg('[SEAT] Seat set from dealer seatMap: mySeat='+_foundSeat+' (was '+mySeat+')');
          mySeat = _foundSeat;
        } else {
          dbg('[SEAT] WARNING: MY_ID not found in seatMap! MY_ID='+MY_ID+' keys='+Object.keys(data.seatMap).join(','));
        }
      } else {
        dbg('[SEAT] WARNING: No seatMap in dealer message!');
      }
      // Set player names from host so labels show correctly during animation
      if(data.names) for(var di=0;di<4;di++) PLAYER_NAMES[di]=data.names[di];
      deduplicateNames();
      // Show labels
      var rot = mySeat >= 0 ? mySeat : 0;
      document.getElementById('label-south').innerHTML = PLAYER_NAMES[rot] + ' <span class="lb-pts"></span>';
      document.getElementById('label-east').innerHTML = PLAYER_NAMES[(rot+1)%4] + ' <span class="lb-pts"></span>';
      document.getElementById('label-north').innerHTML = PLAYER_NAMES[(rot+2)%4] + ' <span class="lb-pts"></span>';
      document.getElementById('label-west').innerHTML = PLAYER_NAMES[(rot+3)%4] + ' <span class="lb-pts"></span>';
      // Hide lobby, show game area
      document.getElementById('lobby-overlay').classList.add('hidden');
      document.getElementById('overlay').classList.add('hidden');
      document.getElementById('game-over').classList.remove('show');
      document.getElementById('quit-btn').style.display = '';
      _showChatBtn(true);
      // Clear hand containers
      document.getElementById('player-hand').innerHTML = '';
      document.getElementById('north-hand').innerHTML = '';
      document.getElementById('west-hand').innerHTML = '';
      document.getElementById('east-hand').innerHTML = '';
      document.getElementById('trick-area').innerHTML = '';
      initAudio();
      // Run dealer selection animation — if host clicks Continue first,
      // the 'start' message will force-dismiss and start the game immediately
      animateDealerSelection(null, {cards:data.cards, winnerSeat:data.winnerSeat});
      return;
    }
    if(data.t==='start'){
      dbg('CLIENT start! cp='+data.cp+' mySeat='+mySeat+' dealerAnimRunning='+_dealerAnimRunning);
      // Force-dismiss dealer animation/banner immediately — host already clicked Continue
      _dismissDealerBanner();
      _processClientStart(data);
      return;
    }
    if(data.t==='emote' && data.eid && typeof data.pidx==='number'){
      try{
        var es=window._emoteSystem; if(es){ var em=es.findEmote(data.eid); if(em) es.showForPlayer(data.pidx,em); }
      }catch(e){}
    }
    if(data.t==='chat') { _handleChatMessage(data); }
  }
  mpListen(clientHandler);

  // Start meta watch for host migration
  _startMetaWatch();

  // Watchdog
  if(_clientWatchdogTimer) clearInterval(_clientWatchdogTimer);
  _clientWatchdogTimer = setInterval(function(){
    if(!mpMode || !game || game.phase==='done' || isHost) return;
    if(Date.now() - _hostLastPing > 30000 && !_hostDisconnected){
      _hostDisconnected = true;
      dbg('[CLIENT-WD] Host ping timeout (>30s) — showing banner and attempting promotion');
      _logSeatOwnership('client watchdog host timeout');
      _showDiscBanner('⚠️ Connessione con l\'host persa', 1, 'Rilevamento disconnessione...');
      // After a short delay, move to step 2 and attempt promotion
      setTimeout(function(){
        if(!isHost && _hostDisconnected) {
          _showDiscBanner('🔄 Migrazione host in corso...', 2, 'Trasferimento del controllo della partita...');
          _fbDb.ref('rooms/'+mpRoom+'/meta').once('value', function(snap){
            var meta = snap.val();
            dbg('[CLIENT-WD] Meta read for promotion: '+(meta ? 'hostId='+meta.hostId+' epoch='+meta.hostEpoch+' lease='+meta.hostLease : 'null'));
            if(meta) _attemptPromotion(meta);
          });
        }
      }, 3000);
    }
  }, 8000);

  showLobbySection('lobby-waiting');
  document.getElementById('wait-status').textContent='Connesso! In attesa dell\'host...';

  } catch(err) {
    dbg('ERROR in _doActualJoin: ' + err.message);
    console.error('_doActualJoin error:', err);
  }
}

// ─── Auto-join from URL ───
(function(){
  var code='';
  var h=location.hash.replace('#','').trim();
  if(h && /^[A-Za-z]{6}$/.test(h)) code=h;
  if(!code){var m=location.href.match(/[&?]code=([A-Za-z]{6})/);if(m)code=m[1];}
  if(code){
    code=code.toUpperCase();
    var iv=setInterval(function(){
      if(_fbReady){
        clearInterval(iv);
        // Read room mode before showing join UI
        _fbDb.ref('lobby/'+code).once('value', function(snap){
          var roomData = snap.val();
          if (roomData && roomData.mode) {
            selectMode(roomData.mode);
          }
          document.getElementById('overlay').classList.add('hidden');
          document.getElementById('lobby-overlay').classList.remove('hidden');
          document.getElementById('lobby-mode-sub').textContent = gameMode === 'vincere' ? 'A VINCERE' : 'A PERDERE';
          showLobbySection('lobby-join');
          document.getElementById('join-code-input').value=code;
        });
      }
    },200);
    return; // URL code takes priority over session
  }
  // Auto-rejoin from session (page refresh / browser reopen)
  var sess = _getSession();
  if(sess){
    var iv3=setInterval(function(){
      if(_fbReady){
        clearInterval(iv3);
        dbg('[AUTO-REJOIN] Session found: room='+sess.room+' name='+sess.name+' hosting='+sess.hosting);
        // First verify the room is alive by checking meta and state
        _fbDb.ref('rooms/'+sess.room+'/meta').once('value', function(metaSnap){
          var meta = metaSnap.val();
          if(!meta) {
            dbg('[AUTO-REJOIN] Room '+sess.room+' is gone (no meta) — clearing session');
            _clearSession();
            return; // stay on main menu
          }
          // Check if host lease is fresh (< 60s old = someone is actively hosting)
          var leaseAge = Date.now() - (meta.hostLease || 0);
          var roomAlive = leaseAge < 60000;
          dbg('[AUTO-REJOIN] Room '+sess.room+' meta: hostId='+meta.hostId+' epoch='+meta.hostEpoch+' leaseAge='+leaseAge+'ms alive='+roomAlive);

          // Always inspect the latest state and ask the user before reconnecting.
          // This prevents the app from skipping the dashboard and landing on the table automatically.
          _fbDb.ref('rooms/'+sess.room+'/state').once('value', function(stateSnap){
            var stateData = stateSnap.val();
            if(!stateData || stateData.seq == null) {
              dbg('[AUTO-REJOIN] Room '+sess.room+' has no valid state — clearing session');
              _clearSession();
              if(!roomAlive) {
                _fbDb.ref('rooms/'+sess.room).remove();
                _fbDb.ref('lobby/'+sess.room).remove();
              }
              document.getElementById('lobby-overlay').classList.add('hidden');
              document.getElementById('overlay').classList.remove('hidden');
              return;
            }

            if(roomAlive) dbg('[AUTO-REJOIN] Active session found — asking user before reconnect');
            else dbg('[AUTO-REJOIN] Room '+sess.room+' has state but stale lease — asking user');
            _showRejoinPrompt(sess, meta, stateData, roomAlive);
          });
        });
      }
    },200);
  }
})();

// ─── Rejoin confirmation prompt ───
function _showRejoinPrompt(sess, meta, stateData, roomAlive) {
  var names = stateData.names || [];
  var leaseAge = Math.round((Date.now() - (meta.hostLease||0)) / 1000);
  var title = roomAlive ? 'Partita precedente disponibile' : 'Partita precedente trovata';
  var subtitle = roomAlive
    ? 'Puoi rientrare nella partita oppure tornare alla schermata iniziale.'
    : 'La stanza non e piu attiva, ma esistono ancora dati di partita.';

  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.remove('hidden');
  // Use the waiting section to show the prompt
  showLobbySection('lobby-waiting');
  var waitEl = document.getElementById('wait-status');
  waitEl.innerHTML = 
    '<div style="text-align:center;margin-bottom:12px">'
    + '<div style="font-size:clamp(13px,3vw,16px);color:#fa4;font-weight:bold;margin-bottom:8px">'+title+'</div>'
    + '<div style="color:#ccc;font-size:clamp(10px,2.2vw,13px);margin-bottom:4px">Stanza: <b style="color:#5af;letter-spacing:2px">'+sess.room+'</b></div>'
    + '<div style="color:#aaa;font-size:clamp(9px,2vw,11px)">Giocatori: '+names.join(', ')+'</div>'
    + '<div style="color:#bbb;font-size:clamp(9px,2vw,11px);margin-top:6px">'+subtitle+'</div>'
    + '<div style="color:#'+(leaseAge < 90 ? 'ff8' : 'f66')+';font-size:clamp(9px,2vw,11px);margin-top:4px">'
    + (leaseAge < 90 ? '⚠️ Host inattivo da '+leaseAge+'s' : '❌ Host disconnesso da '+leaseAge+'s')
    + '</div>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px;align-items:center;margin-top:12px">'
    + '<button class="lobby-btn primary" onclick="_confirmRejoin()" style="min-width:180px">▶ Riconnettiti alla partita</button>'
    + '<button class="lobby-btn" onclick="_cancelRejoin()" style="min-width:180px">✕ Nuova partita</button>'
    + '</div>';
}

function _confirmRejoin() {
  var sess = _getSession();
  if(!sess) { _cancelRejoin(); return; }
  dbg('[AUTO-REJOIN] User confirmed rejoin to room='+sess.room);
  document.getElementById('wait-status').innerHTML = '<div style="color:#aaa">Riconnessione in corso...</div>';

  _fbDb.ref('rooms/'+sess.room+'/meta').once('value', function(snap){
    var meta = snap.val();
    if(!meta) { dbg('[AUTO-REJOIN] Room gone after confirm'); _clearSession(); _cancelRejoin(); return; }
    if(sess.hosting) {
      _doHostAutoRejoin(sess, meta);
    } else {
      _doClientAutoRejoin(sess);
    }
  });
}

function _cancelRejoin() {
  dbg('[AUTO-REJOIN] User chose new game — clearing session');
  _clearSession();
  document.getElementById('lobby-overlay').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}

// ─── Host auto-rejoin logic (extracted) ───
function _doHostAutoRejoin(sess, meta) {
  dbg('[AUTO-REJOIN] Host auto-rejoin: room='+sess.room);
  mpRoom = sess.room;
  mySeat = 0;
  PLAYER_NAMES[0] = sess.name;
  _originalHostId = meta.originalHostId || MY_ID;

  _fbDb.ref('rooms/'+mpRoom+'/state').once('value', function(statSnap){
    var stateData = statSnap.val();
    if(!stateData || stateData.seq == null) {
      dbg('[AUTO-REJOIN] No valid state — clearing');
      _clearSession();
      document.getElementById('lobby-overlay').classList.add('hidden');
      document.getElementById('overlay').classList.remove('hidden');
      return;
    }
    dbg('[AUTO-REJOIN] State found: seq='+stateData.seq+' phase='+stateData.ph+' cp='+stateData.cp);
    if(!game) game = {hands:[[],[],[],[]],trick:[],trickNum:0,leadPlayer:0,currentPlayer:0,leadSuit:null,scores:[0,0,0,0],trickCards:[],phase:'playing',animating:false};
    mpMode = true;
    if(stateData.gm) gameMode = stateData.gm;
    if(stateData.diff) cpuDifficulty = stateData.diff;
    if(stateData.names) for(var i=0;i<4;i++) PLAYER_NAMES[i]=stateData.names[i];
    _syncHumanSeatsFromState(stateData.hs);
    _logSeatOwnership('host auto-rejoin loaded state');
    applyRemoteState(stateData);
    _latestAppliedStateSeq = stateData.seq || 0;
    _stateSeq = stateData.seq || 0;
    if(meta.hostId === MY_ID) {
      dbg('[AUTO-REJOIN] I am still the current host, resuming');
      _hostEpoch = (meta.hostEpoch || 0) + 1;
      _lastSeenEpoch = _hostEpoch;
      isHost = true;
      _listenState();
      _becomeHost();
      document.getElementById('lobby-overlay').classList.add('hidden');
      document.getElementById('overlay').classList.add('hidden');
      document.getElementById('quit-btn').style.display = '';
      _showChatBtn(true);
      initAudio();
      showStatus('Riconnesso come host!', 2500);
    } else {
      dbg('[AUTO-REJOIN] Someone else is host ('+meta.hostId+'), joining as client via _doActualJoin');
      _lastSeenEpoch = meta.hostEpoch || 0;
      isHost = false;
      document.getElementById('join-name-input').value = sess.name;
      document.getElementById('join-code-input').value = sess.room;
      _doActualJoin(sess.name, sess.room, undefined);
    }
    if(!_mpPingTimer) _mpPingTimer = setInterval(function(){ if(mpMode) mpSend({t:'ping'}); }, 25000);
  });
}

// ─── Client auto-rejoin logic (extracted) ───
function _doClientAutoRejoin(sess) {
  dbg('[AUTO-REJOIN] Client auto-rejoin: room='+sess.room+' name='+sess.name);
  _logSeatOwnership('before client auto-rejoin');
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.remove('hidden');
  document.getElementById('join-name-input').value = sess.name;
  document.getElementById('join-code-input').value = sess.room;
  _fbDb.ref('lobby/'+sess.room).once('value', function(snap){
    var roomData = snap.val();
    if(roomData && roomData.mode) {
      selectMode(roomData.mode);
      document.getElementById('lobby-mode-sub').textContent = roomData.mode === 'vincere' ? 'A VINCERE' : 'A PERDERE';
    }
    showLobbySection('lobby-join');
    setTimeout(function(){ joinGame(); }, 500);
  });
}

// ─── Patched functions ───
var _origPlayCard = playCard;
function isHumanSeat(s){if(!mpMode)return s===0; return _humanSeatSet.has(s);}

// ─── Migration progress UI ───
var _discPlayRetryCount = 0;
function _showDiscBanner(title, step, waitMsg) {
  document.getElementById('disconnect-text').textContent = title;
  var s1 = document.getElementById('disc-s1');
  var s2 = document.getElementById('disc-s2');
  var s3 = document.getElementById('disc-s3');
  s1.className = 'step' + (step >= 1 ? (step > 1 ? ' done' : ' active') : '');
  s2.className = 'step' + (step >= 2 ? (step > 2 ? ' done' : ' active') : '');
  s3.className = 'step' + (step >= 3 ? (step > 3 ? ' done' : ' active') : '');
  document.getElementById('disc-wait').textContent = waitMsg || '';
  document.getElementById('disc-steps').style.display = step > 0 ? '' : 'none';
  document.getElementById('reconnect-btn').style.display = step >= 2 ? 'inline-block' : 'none';
  document.getElementById('disconnect-banner').style.display = 'block';
}
function _hideDiscBanner() {
  document.getElementById('disconnect-banner').style.display = 'none';
  _discPlayRetryCount = 0;
}
function _showDiscSuccess(msg) {
  _showDiscBanner(msg, 4, '');
  document.getElementById('disc-steps').style.display = 'none';
  document.getElementById('reconnect-btn').style.display = 'none';
  setTimeout(_hideDiscBanner, 2000);
}

function bcastGS(){
  if(!mpMode||!isHost) return;
  syncState();
}
function bcastGSNow(){ syncState(true); }
function _bcastGSNow(){
  if(!mpMode||!isHost) return;
  syncState(true);
}



cpuTurn=async function(){
  if(!mpMode){
    if(isHumanSeat(game.currentPlayer)||game.phase!=='playing') return;
    game.animating=true; await delay(500+Math.random()*400); game.animating=false;
    var p2=getPlayableCards(game.currentPlayer); if(!p2.length) return;
    await _origPlayCard(game.currentPlayer, cpuSelectCard(game.currentPlayer,p2));
    return;
  }
  if(!isHost) return;
  if(game.phase!=='playing'||isHumanSeat(game.currentPlayer)) return;
  dbg('cpuTurn seat='+game.currentPlayer);
  game.animating=true; await delay(400+Math.random()*300);
  if(!game) return;
  if(game.phase!=='playing' || isHumanSeat(game.currentPlayer)) {
    game.animating=false;
    renderAll();
    bcastGSNow();
    dbg('cpuTurn ABORT after delay seat='+game.currentPlayer+' human='+isHumanSeat(game.currentPlayer));
    return;
  }
  game.animating=false;
  var p=getPlayableCards(game.currentPlayer);
  if(!p.length) return;
  var cpuCard = cpuSelectCard(game.currentPlayer,p);
  _logEvent('card-played', game.currentPlayer, { cardId: cpuCard.id, cpu: true });
  _maybeWriteCheckpoint();
  await _origPlayCard(game.currentPlayer, cpuCard);
};

var _oSGO=showGameOver; showGameOver=function(){_oSGO();};

// ═══════════════════════════════════════════════════════════════
//  ROOM CHAT (v3.1.0)
// ═══════════════════════════════════════════════════════════════
var _chatOpen = false;
var _chatUnread = 0;
var _chatMaxMessages = 50;

function _toggleChat() {
  _chatOpen = !_chatOpen;
  var panel = document.getElementById('chat-panel');
  if(_chatOpen) {
    panel.classList.add('show');
    _chatUnread = 0;
    _updateChatBadge();
    var inp = document.getElementById('chat-input');
    if(inp) setTimeout(function(){ inp.focus(); }, 100);
    var msgs = document.getElementById('chat-messages');
    if(msgs) msgs.scrollTop = msgs.scrollHeight;
  } else {
    panel.classList.remove('show');
  }
}

function _updateChatBadge() {
  var el = document.getElementById('chat-unread');
  if(!el) return;
  if(_chatUnread > 0 && !_chatOpen) {
    el.textContent = _chatUnread > 9 ? '9+' : _chatUnread;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function _showChatBtn(show) {
  var btn = document.getElementById('chat-btn');
  if(btn) btn.style.display = show ? 'flex' : 'none';
  if(!show) {
    _chatOpen = false;
    var panel = document.getElementById('chat-panel');
    if(panel) panel.classList.remove('show');
    _clearChat();
  } else {
    _restoreChat();
  }
}

function _clearChat() {
  var container = document.getElementById('chat-messages');
  if(container) container.innerHTML = '';
  _chatUnread = 0;
  _updateChatBadge();
  try { localStorage.removeItem('tresette_chat_room'); localStorage.removeItem('tresette_chat_log'); } catch(e) {}
}

function _saveChatLog() {
  try {
    if(!mpRoom) return;
    var container = document.getElementById('chat-messages');
    if(!container) return;
    var msgs = [];
    for(var i = 0; i < container.children.length; i++) {
      var el = container.children[i];
      var cls = el.className || '';
      var isSelf = cls.indexOf('chat-self') >= 0;
      var isSystem = cls.indexOf('chat-system') >= 0;
      var nameEl = el.querySelector('.chat-name');
      var name = nameEl ? nameEl.textContent.replace(/:$/, '') : '';
      var text = isSystem ? el.textContent : el.textContent.replace(name + ': ', '');
      msgs.push({ n: name, t: text, s: isSelf, y: isSystem });
    }
    localStorage.setItem('tresette_chat_room', mpRoom);
    localStorage.setItem('tresette_chat_log', JSON.stringify(msgs.slice(-_chatMaxMessages)));
  } catch(e) {}
}

function _restoreChat() {
  try {
    var savedRoom = localStorage.getItem('tresette_chat_room');
    if(!savedRoom || savedRoom !== mpRoom) { _clearChat(); return; }
    var raw = localStorage.getItem('tresette_chat_log');
    if(!raw) return;
    var msgs = JSON.parse(raw);
    if(!Array.isArray(msgs) || msgs.length === 0) return;
    var container = document.getElementById('chat-messages');
    if(!container || container.children.length > 0) return;
    for(var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      _addChatMessage(m.n || '', m.t || '', !!m.s, !!m.y, true);
    }
  } catch(e) {}
}

function _addChatMessage(name, text, isSelf, isSystem, skipSave) {
  var container = document.getElementById('chat-messages');
  if(!container) return;
  var div = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' chat-system' : (isSelf ? ' chat-self' : ' chat-other'));
  if(isSystem) {
    div.textContent = text;
  } else {
    var nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = name + ':';
    div.appendChild(nameSpan);
    div.appendChild(document.createTextNode(' ' + text));
  }
  container.appendChild(div);
  while(container.children.length > _chatMaxMessages) {
    container.removeChild(container.firstChild);
  }
  container.scrollTop = container.scrollHeight;
  if(!isSelf && !_chatOpen && !skipSave) {
    _chatUnread++;
    _updateChatBadge();
  }
  if(!skipSave) _saveChatLog();
}

function _sendChatMessage() {
  var inp = document.getElementById('chat-input');
  if(!inp) return;
  var text = inp.value.trim();
  if(!text || !mpMode) return;
  text = text.replace(/<[^>]*>/g, '');
  if(!text) return;
  inp.value = '';
  var myName = _getMyName() || PLAYER_NAMES[mySeat >= 0 ? mySeat : 0] || 'Giocatore';
  _addChatMessage(myName, text, true, false);
  mpSend({ t: 'chat', name: myName, text: text, seat: mySeat });
}

function _handleChatMessage(data) {
  if(!data || data.t !== 'chat' || !data.text) return;
  var name = data.name || 'Giocatore';
  var text = (data.text || '').replace(/<[^>]*>/g, '').substring(0, 200);
  _addChatMessage(name, text, false, false);
  // Floating bubble near sender when chat is closed (desktop)
  if(!_chatOpen && typeof data.seat === 'number' && data.seat >= 0) {
    _showChatBubble(data.seat, name, text);
  }
}

var _chatBubbleTimers = {};
function _showChatBubble(seatIdx, name, text) {
  var POSITIONS = ['south','east','north','west'];
  var rot = (typeof mpMode !== 'undefined' && mpMode && !isHost && typeof mySeat !== 'undefined' && mySeat >= 0) ? mySeat : 0;
  var pos = POSITIONS[(seatIdx - rot + 4) % 4];
  var labelId = 'label-' + pos;
  var lbl = document.getElementById(labelId);
  if(!lbl) return;

  var prevId = 'chat-float-' + pos;
  var prev = document.getElementById(prevId);
  if(prev) { prev.parentNode.removeChild(prev); }
  if(_chatBubbleTimers[pos]) { clearTimeout(_chatBubbleTimers[pos]); }

  var bubble = document.createElement('div');
  bubble.className = 'chat-float-bubble';
  bubble.id = prevId;
  var displayText = text.length > 60 ? text.substring(0, 57) + '...' : text;
  bubble.innerHTML = '<div class="chat-float-inner"><span class="chat-float-name">' + name + ':</span> <span class="chat-float-text">' + displayText.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span></div>';
  document.body.appendChild(bubble);

  var r = lbl.getBoundingClientRect();
  bubble.style.position = 'fixed';
  if(pos === 'south') {
    bubble.style.left = (r.left + r.width/2) + 'px';
    bubble.style.top = (r.top - 6) + 'px';
    bubble.style.transform = 'translate(-50%,-100%)';
  } else if(pos === 'north') {
    bubble.style.left = (r.left + r.width/2) + 'px';
    bubble.style.top = (r.bottom + 6) + 'px';
    bubble.style.transform = 'translate(-50%,0)';
  } else if(pos === 'west') {
    bubble.style.left = (r.right + 8) + 'px';
    bubble.style.top = (r.top + r.height/2) + 'px';
    bubble.style.transform = 'translate(0,-50%)';
  } else if(pos === 'east') {
    bubble.style.left = (r.left - 8) + 'px';
    bubble.style.top = (r.top + r.height/2) + 'px';
    bubble.style.transform = 'translate(-100%,-50%)';
  }

  requestAnimationFrame(function() { bubble.classList.add('show'); });

  _chatBubbleTimers[pos] = setTimeout(function() {
    bubble.classList.remove('show');
    setTimeout(function() { if(bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 300);
  }, 4000);
}

(function() {
  var chatBtn = document.getElementById('chat-btn');
  if(chatBtn) chatBtn.addEventListener('click', function(e) { e.stopPropagation(); _toggleChat(); });
  var sendBtn = document.getElementById('chat-send-btn');
  if(sendBtn) sendBtn.addEventListener('click', function(e) { e.stopPropagation(); _sendChatMessage(); });
  var chatInput = document.getElementById('chat-input');
  if(chatInput) {
    chatInput.addEventListener('keydown', function(e) {
      if(e.key === 'Enter') { e.preventDefault(); _sendChatMessage(); }
      e.stopPropagation();
    });
    chatInput.addEventListener('click', function(e) { e.stopPropagation(); });
  }
  document.addEventListener('click', function(e) {
    if(_chatOpen) {
      var panel = document.getElementById('chat-panel');
      var btn = document.getElementById('chat-btn');
      if(panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        _chatOpen = false;
        panel.classList.remove('show');
      }
    }
  });
})();

function forceReconnect() {
  dbg('[FORCE-RECONN] Button pressed. isHost='+isHost+' mpMode='+mpMode+' room='+mpRoom+' mySeat='+mySeat);
  _logSeatOwnership('forceReconnect pressed');
  _showDiscBanner('🔄 Riconnessione in corso...', 2, 'Tentativo di ripristino...');
  _checkMetaOnReconnect();
  if(!isHost && game){ 
    dbg('[FORCE-RECONN] As client: resetting animating, sending join');
    var sess = _getSession();
    var rejoinSeat = mySeat >= 0 ? mySeat : (sess && typeof sess.seat === 'number' ? sess.seat : null);
    game.animating=false; if(game.phase!=='done')game.phase='playing'; mpSend({t:'join',name:_getMyName()||'Amico', rejoinSeat: rejoinSeat}); renderAll(); 
  }
  else if(isHost && game && mpMode) { 
    dbg('[FORCE-RECONN] As host: refreshing meta + broadcasting state');
    _writeHostMeta(); bcastGSNow(); 
  }
  setTimeout(_hideDiscBanner, 3000);
}

document.getElementById('retry-btn').onclick = handleRetryGame;

// ── Fullscreen toggle ──
function _requestFs(el){
  if(el.requestFullscreen) return el.requestFullscreen();
  if(el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return Promise.resolve(); }
  if(el.msRequestFullscreen) { el.msRequestFullscreen(); return Promise.resolve(); }
  return Promise.reject();
}
function _exitFs(){
  var d=document;
  if(d.exitFullscreen) d.exitFullscreen();
  else if(d.webkitExitFullscreen) d.webkitExitFullscreen();
  else if(d.msExitFullscreen) d.msExitFullscreen();
}
function _isFs(){
  return !!(document.fullscreenElement||document.webkitFullscreenElement||document.msFullscreenElement);
}
function toggleFullscreen(){
  if(!_isFs()){
    _requestFs(document.documentElement).catch(function(){
      return _requestFs(document.body);
    }).catch(function(){});
  } else {
    _exitFs();
  }
}
function _updateFsBtn(){
  var btn=document.getElementById('fullscreen-btn'); if(!btn) return;
  btn.textContent=_isFs()?'⛶ Esci schermo intero':'⛶ Schermo intero';
}
document.addEventListener('fullscreenchange',_updateFsBtn);
document.addEventListener('webkitfullscreenchange',_updateFsBtn);

// Auto-enter fullscreen on first user interaction (desktop only)
(function(){
  var isMobile = /Android|iPhone|iPad|iPod|Mobile|Touch/i.test(navigator.userAgent);
  if(isMobile) return;
  var done=false;
  function autoFs(){
    if(done||_isFs()) return;
    done=true;
    _requestFs(document.documentElement).catch(function(){
      return _requestFs(document.body);
    }).catch(function(){});
    cleanup();
  }
  function cleanup(){
    ['click','pointerup','keydown'].forEach(function(ev){
      document.removeEventListener(ev,autoFs,true);
    });
  }
  ['click','pointerup','keydown'].forEach(function(ev){
    document.addEventListener(ev,autoFs,true);
  });
})();
