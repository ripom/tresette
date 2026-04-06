// ═══════════════════════════════════════════════════════════════
//  EMOTICON SYSTEM – labels untouched, menus/bubbles float independently
// ═══════════════════════════════════════════════════════════════
(function initEmoticons(){
  var EMOTES = [
    {id:'hello',      emoji:'👋', label:'Ciao!',          sub:'benvenuto!',          snd:'emoteHappy'},
    {id:'bye',        emoji:'🫡', label:'Ciao!',          sub:'devo andare via!',    snd:'emoteBye'},
    {id:'laugh',      emoji:'😂', label:'Ahahah',         sub:'questa era bella',    snd:'emoteLaugh'},
    {id:'noCards',    emoji:'🃏', label:'Non ne ho!',     sub:'non ho quel seme',    snd:'emoteSad'},
    {id:'yourTurn',   emoji:'⏳', label:'Tocca a te!',    sub:'muoviti dai!',        snd:'emoteBored'},
    {id:'dammit',     emoji:'🤬', label:'Mannaggia!',     sub:'e che ca@@o!',        snd:'emoteAngry'},
    {id:'applause',   emoji:'👏', label:'Bravo!',         sub:'bella giocata',       snd:'emoteApplause'},
    {id:'thumbsUp',   emoji:'👍', label:'Thumbs Up',      sub:'ottima mossa',        snd:'emoteThumbsUp'},
    {id:'thumbsDown', emoji:'👎', label:'Thumbs Down',    sub:'che combini',         snd:'emoteThumbsDown'},
    {id:'bored',      emoji:'🥱', label:'Annoiato',       sub:'muoviamoci un po\'',  snd:'emoteBored'},
    {id:'problem',    emoji:'⚠️', label:'Problema!',      sub:'c\'è qualche problema!', snd:'emoteAngry'},
    {id:'sad',        emoji:'😔', label:'Mi dispiace!',   sub:'questa é sfortuna',   snd:'emoteSad'}
  ];
  var POSITIONS = ['south','east','north','west'];
  var emoteTimers = {};
  var openMenuPos = null;

  function renderEmoteAvatar(emote, wrapperClass){
    if(emote.id === 'thumbsUp' || emote.id === 'thumbsDown' || emote.id === 'applause' || emote.id === 'hello' || emote.id === 'bye' || emote.id === 'noCards' || emote.id === 'yourTurn' || emote.id === 'problem' || emote.id === 'dammit') {
      return '<span class="' + wrapperClass + '"><span class="emote-native-icon">' + emote.emoji + '</span></span>';
    }
    var extra = '';
    if(emote.id === 'sad') extra = '<span class="emote-mark"></span>';
    else if(emote.id === 'bored') extra = '<span class="emote-mark"></span>';
    else if(emote.id === 'dammit') extra = '<span class="emote-mark"></span>';
    return '<span class="' + wrapperClass + '"><span class="emote-avatar">'
      + '<span class="emote-face"></span>'
      + '<span class="emote-eye left"></span>'
      + '<span class="emote-eye right"></span>'
      + '<span class="emote-mouth"></span>'
      + extra
      + '</span></span>';
  }

  // Dynamically create a single reusable menu
  var menuEl = document.createElement('div');
  menuEl.className = 'emote-menu';
  menuEl.id = 'emote-menu-popup';
  EMOTES.forEach(function(e){
    var btn = document.createElement('button');
    btn.className = 'emote-btn';
    btn.dataset.emote = e.id;
    btn.title = e.label;
    btn.innerHTML = renderEmoteAvatar(e, 'emote-btn-emoji')
      + '<span class="emote-btn-label"><span class="emote-btn-title">' + e.label + '</span><span class="emote-btn-sub">' + e.sub + '</span></span>';
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if(openMenuPos) onEmoteSelect(openMenuPos, e);
    });
    btn.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
    menuEl.appendChild(btn);
  });
  document.body.appendChild(menuEl);

  // ── helpers ──
  function getRot(){
    return (typeof mpMode!=='undefined'&&mpMode&&!isHost&&typeof mySeat!=='undefined'&&mySeat>=0)?mySeat:0;
  }
  function getVisualPos(idx){ return POSITIONS[(idx-getRot()+4)%4]; }
  function idxForPos(pos){ var v=POSITIONS.indexOf(pos); return v<0?-1:(v+getRot())%4; }
  function humanSeat(){ return getRot(); }

  // ── position a floating element near a label ──
  function posNear(el, labelId, above){
    var lbl = document.getElementById(labelId);
    if(!lbl){ el.style.display='none'; return; }
    var r = lbl.getBoundingClientRect();
    var cx = r.left + r.width/2;
    var cy = r.top + r.height/2;
    var pos = labelId.replace('label-','');
    el.style.position = 'fixed';
    if(pos==='south'){
      el.style.left = cx+'px'; el.style.top = (r.top-4)+'px';
      el.style.transform = 'translate(-50%,-100%)';
    } else if(pos==='north'){
      el.style.left = cx+'px'; el.style.top = (r.bottom+4)+'px';
      el.style.transform = 'translate(-50%,0)';
    } else if(pos==='west'){
      el.style.left = (r.right+4)+'px'; el.style.top = cy+'px';
      el.style.transform = 'translate(0,-50%)';
    } else if(pos==='east'){
      el.style.left = (r.left-4)+'px'; el.style.top = cy+'px';
      el.style.transform = 'translate(-100%,-50%)';
    }
  }

  // ── position emoticon bubble on the player's card area ──
  var HAND_IDS = {south:'player-hand',east:'east-hand',north:'north-hand',west:'west-hand'};
  function posOnCards(el, pos){
    var hand = document.getElementById(HAND_IDS[pos]);
    if(!hand){ el.style.display='none'; return; }
    var r = hand.getBoundingClientRect();
    var cx = r.left + r.width/2;
    var cy = r.top + r.height/2;
    el.style.position = 'fixed';
    el.style.top = cy + 'px';
    if(pos==='east'){
      // Shift left so the emoji doesn't get clipped by the right edge
      el.style.left = (r.left) + 'px';
      el.style.transform = 'translate(-50%,-50%)';
    } else if(pos==='west'){
      // Shift right so it doesn't get clipped by the left edge
      el.style.left = (r.right) + 'px';
      el.style.transform = 'translate(-50%,-50%)';
    } else {
      el.style.left = cx + 'px';
      el.style.transform = 'translate(-50%,-50%)';
    }
  }

  // ── show/hide emoticon bubble ──
  function showEmoticon(pos, emote){
    var bubble = document.getElementById('emote-'+pos);
    if(!bubble) return;
    bubble.dataset.emote = emote.id;
    bubble.innerHTML = '<div class="emote-chip">'
      + renderEmoteAvatar(emote, 'emote-chip-emoji')
      + '<span class="emote-chip-text"><span class="emote-chip-title">' + emote.label + '</span><span class="emote-chip-sub">' + emote.sub + '</span></span>'
      + '</div>';
    // Play emote sound
    if(emote.snd) playBuffer(emote.snd);
    // Show on the player's card area for ALL players
    posOnCards(bubble, pos);
    bubble.classList.add('show');
    if(emoteTimers[pos]) clearTimeout(emoteTimers[pos]);
    emoteTimers[pos] = setTimeout(function(){
      bubble.classList.remove('show');
    }, 3200);
  }
  function showEmoticonForPlayer(idx,emote){ showEmoticon(getVisualPos(idx),emote); }

  // ── menu (above the trigger button) ──
  function openMenu(){
    closeMenu();
    var btn = document.getElementById('emote-trigger-btn');
    if(!btn) return;
    var r = btn.getBoundingClientRect();
    menuEl.style.position = 'fixed';
    menuEl.style.left = (r.left + r.width/2) + 'px';
    menuEl.style.top = (r.top - 6) + 'px';
    menuEl.style.transform = 'translate(-50%,-100%)';
    menuEl.classList.add('show');
    openMenuPos = 'south';
  }
  function closeMenu(){
    menuEl.classList.remove('show');
    openMenuPos = null;
  }
  function onEmoteSelect(pos, emote){
    closeMenu();
    showEmoticon(pos, emote);
    if(typeof mpMode!=='undefined'&&mpMode){
      try{ mpSend({t:'emote',pidx:idxForPos(pos),eid:emote.id}); }catch(e){}
    }
  }

  // ── dedicated emote button – right of label (desktop) or above label (mobile) ──
  (function(){
    var btn = document.getElementById('emote-trigger-btn');
    if(!btn) return;

    function isMobile(){ return window.innerWidth <= 520 || window.innerHeight <= 500; }

    function positionBtn(){
      var lbl = document.getElementById('label-south');
      if(!lbl) return;
      var r = lbl.getBoundingClientRect();
      if(isMobile()){
        // Above the label, centered
        btn.style.left = (r.left + r.width/2) + 'px';
        btn.style.top = (r.top - 4) + 'px';
        btn.style.transform = 'translate(-50%,-100%)';
      } else {
        // To the right of the label
        btn.style.left = (r.right + 14) + 'px';
        btn.style.top = (r.top + r.height/2) + 'px';
        btn.style.transform = 'translateY(-50%)';
      }
    }
    positionBtn();
    window.addEventListener('resize', positionBtn);
    setInterval(positionBtn, 5000);

    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      if(openMenuPos==='south') closeMenu(); else openMenu();
    });
  })();
  document.addEventListener('click', closeMenu);

  // ── emoticon utilities (no CPU auto-emotes, only humans can send) ──
  function findEmote(id){
    for(var i=0;i<EMOTES.length;i++) if(EMOTES[i].id===id) return EMOTES[i];
    return EMOTES[0];
  }
  window._emoteSystem = { showForPlayer:showEmoticonForPlayer, findEmote:findEmote, EMOTES:EMOTES };
})();

// ═══════════════════════════════════════════════════════════════
//  SOCIAL SYSTEM — Presence, Friends, Invitations
// ═══════════════════════════════════════════════════════════════

var _presenceRef = null;
var _onlinePlayers = {};
var _onlinePlayersRef = null;
var _friendsList = {};
var _presenceHeartbeatTimer = null;
var PRESENCE_STALE_MS = 2 * 60 * 1000; // 2 minutes — entries older than this are considered offline
var _friendsRef = null;
var _pendingFriendRequests = {};
var _friendReqRef = null;
var _pendingInvitations = {};
var _invitationsRef = null;
var _knownOnlineFriends = {};
var _inviteSeatTarget = -1;
var _invResponseRef = null;
var _socialListenersStarted = false;

// ────── Toast Notifications ──────

function _showToast(text, type, duration) {
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast-item toast-' + (type || 'info');
  toast.textContent = text;
  toast.onclick = function() {
    toast.classList.remove('show');
    setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  };
  container.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  var dur = duration || 5000;
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, dur);
  while (container.children.length > 5) container.removeChild(container.firstChild);
}

// ────── Presence System ──────

function _setupPresence() {
  if (!_fbDb) return;
  var uid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  var displayName = (_authUser && !_isGuest) ? (_authUser.displayName || 'Giocatore') : (_guestDisplayName || _getMyName() || 'Ospite');
  _presenceRef = _fbDb.ref('presence/' + uid);
  // Write presence immediately (don't wait for .info/connected which may have already fired)
  var presenceData = {
    displayName: displayName,
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
    online: true,
    isGuest: _isGuest || false,
    currentRoom: mpRoom || null,
    inGame: false
  };
  _presenceRef.set(presenceData).then(function() {
    dbg('[SOCIAL] Presence set OK for uid=' + uid);
  }).catch(function(e) {
    dbg('[SOCIAL] Presence set FAILED: ' + e.message);
  });
  _presenceRef.onDisconnect().remove();
  // Also re-set on reconnect
  _fbDb.ref('.info/connected').on('value', function(snap) {
    if (snap.val() === true && _presenceRef) {
      _presenceRef.onDisconnect().remove();
      _presenceRef.update({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }
  });
  // Heartbeat: update lastSeen every 60s so stale detection works
  if (_presenceHeartbeatTimer) clearInterval(_presenceHeartbeatTimer);
  _presenceHeartbeatTimer = setInterval(function() {
    if (_presenceRef) {
      _presenceRef.update({ lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(function(){});
    }
  }, 60 * 1000);
}

function _updatePresenceRoom(roomCode) {
  if (_presenceRef) {
    _presenceRef.update({
      currentRoom: roomCode || null,
      inGame: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }
  // Also manage room-scoped presence (v3.1.0)
  if(roomCode && typeof _setupRoomPresence === 'function') {
    _setupRoomPresence();
  } else if(!roomCode && typeof _teardownRoomPresence === 'function') {
    _teardownRoomPresence();
  }
}

function _updatePresenceInGame(playing) {
  if (_presenceRef) {
    _presenceRef.update({
      inGame: !!playing,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }
  // Update room-scoped presence (v3.1.0)
  if(typeof _updateRoomPresence === 'function') _updateRoomPresence();
}

// ────── Online Players Listener ──────

var _presenceThrottleTimer = null;
var _presencePendingSnap = null;

function _processPresenceSnapshot(all) {
  var now = Date.now();
  dbg('[SOCIAL] Presence snapshot: ' + Object.keys(all).length + ' entries');
  _onlinePlayers = {};
  for (var uid in all) {
    if (all[uid] && all[uid].online === true) {
      var entry = all[uid];
      var displayName = (entry.displayName || '').trim();
      if (!displayName) {
        _fbDb.ref('presence/' + uid).remove().catch(function(){});
        continue;
      }
      var lastSeen = entry.lastSeen || 0;
      if (now - lastSeen < PRESENCE_STALE_MS) {
        _onlinePlayers[uid] = Object.assign({}, entry, { displayName: displayName });
      } else {
        _fbDb.ref('presence/' + uid).remove().catch(function(){});
      }
    }
  }
  var myUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  delete _onlinePlayers[myUid];
  dbg('[SOCIAL] Online players (excluding self, after stale filter): ' + Object.keys(_onlinePlayers).length);
  _renderOnlinePlayersPanel();
  _checkFriendOnlineNotifications();
}

function _startOnlinePlayersListener() {
  if (!_fbDb) return;
  if (_onlinePlayersRef) _onlinePlayersRef.off();
  _onlinePlayersRef = _fbDb.ref('presence');
  _onlinePlayersRef.on('value', function(snap) {
    var all = snap.val() || {};
    // Throttle: process at most once every 3s to avoid cascade
    if (_presenceThrottleTimer) {
      _presencePendingSnap = all;
      return;
    }
    _processPresenceSnapshot(all);
    _presenceThrottleTimer = setTimeout(function() {
      _presenceThrottleTimer = null;
      if (_presencePendingSnap) {
        var pending = _presencePendingSnap;
        _presencePendingSnap = null;
        _processPresenceSnapshot(pending);
      }
    }, 3000);
  }, function(err) {
    dbg('[SOCIAL] Presence listener ERROR: ' + err.message);
  });
}

// ────── Friends Listener ──────

function _startFriendsListener() {
  if (!_authUser || _isGuest || !_fbDb) return;
  if (_friendsRef) _friendsRef.off();
  _friendsRef = _fbDb.ref('friends/' + _authUser.uid);
  _friendsRef.on('value', function(snap) {
    _friendsList = snap.val() || {};
    _renderFriendsList();
  });
}

// ────── Friend Requests ──────

function _startFriendRequestsListener() {
  if (!_authUser || _isGuest || !_fbDb) return;
  if (_friendReqRef) _friendReqRef.off();
  _friendReqRef = _fbDb.ref('friendRequests/' + _authUser.uid);
  _friendReqRef.on('value', function(snap) {
    var prev = Object.keys(_pendingFriendRequests);
    _pendingFriendRequests = snap.val() || {};
    var curr = Object.keys(_pendingFriendRequests);
    curr.forEach(function(senderUid) {
      if (prev.indexOf(senderUid) === -1) {
        var req = _pendingFriendRequests[senderUid];
        var reqName = req.fromName || 'Giocatore';
        _showToast('📨 Richiesta da ' + reqName + (req.message ? ': "' + req.message + '"' : ''), 'info', 8000);
      }
    });
    _updateFriendRequestBadge();
    _renderFriendRequests();
  });
}

function _sendFriendRequest(targetUid, targetName, message) {
  if (!_authUser || _isGuest) {
    _showToast('Devi effettuare il login per aggiungere amici.', 'warn');
    return;
  }
  if (targetUid === _authUser.uid) return;
  // Check if already friends
  if (_friendsList[targetUid]) {
    _showToast(targetName + ' è già tuo amico!', 'warn');
    return;
  }
  var msg = (message || '').substring(0, 200);
  _fbDb.ref('friendRequests/' + targetUid + '/' + _authUser.uid).set({
    fromName: _authUser.displayName || 'Giocatore',
    message: msg,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  }).then(function() {
    _showToast('Richiesta di amicizia inviata a ' + targetName + '!', 'ok');
  }).catch(function(e) {
    _showToast('Errore: ' + e.message, 'err');
  });
}

function _acceptFriendRequest(senderUid) {
  if (!_authUser || !_fbDb) return;
  var req = _pendingFriendRequests[senderUid];
  if (!req) return;
  var updates = {};
  updates['friends/' + _authUser.uid + '/' + senderUid] = {
    displayName: req.fromName,
    since: firebase.database.ServerValue.TIMESTAMP
  };
  updates['friends/' + senderUid + '/' + _authUser.uid] = {
    displayName: _authUser.displayName || 'Giocatore',
    since: firebase.database.ServerValue.TIMESTAMP
  };
  updates['friendRequests/' + _authUser.uid + '/' + senderUid] = null;
  _fbDb.ref().update(updates).then(function() {
    _showToast('Ora sei amico di ' + req.fromName + '!', 'ok');
  }).catch(function(e) {
    _showToast('Errore: ' + e.message, 'err');
  });
}

function _rejectFriendRequest(senderUid) {
  if (!_authUser || !_fbDb) return;
  _fbDb.ref('friendRequests/' + _authUser.uid + '/' + senderUid).remove();
  _showToast('Richiesta rifiutata.', 'info');
}

function _removeFriend(friendUid, friendName) {
  if (!_authUser || !_fbDb) return;
  if (!confirm('Rimuovere ' + (friendName || 'questo amico') + ' dalla lista amici?')) return;
  var updates = {};
  updates['friends/' + _authUser.uid + '/' + friendUid] = null;
  updates['friends/' + friendUid + '/' + _authUser.uid] = null;
  _fbDb.ref().update(updates).then(function() {
    _showToast('Amico rimosso.', 'info');
  });
}

function _showAddFriendDialog(targetUid, targetName) {
  var msg = prompt('Messaggio per ' + targetName + ' (opzionale):', 'Ciao, giochiamo insieme!');
  if (msg === null) return;
  _sendFriendRequest(targetUid, targetName, msg);
}

// ────── Friend Online Notifications ──────

function _checkFriendOnlineNotifications() {
  if (!_authUser || _isGuest) return;
  var newOnline = {};
  for (var uid in _onlinePlayers) {
    if (_friendsList[uid]) {
      newOnline[uid] = true;
      if (!_knownOnlineFriends[uid]) {
        var friendName = _friendsList[uid].displayName || 'Amico';
        _showToast('🟢 ' + friendName + ' è online!', 'info');
      }
    }
  }
  _knownOnlineFriends = newOnline;
}

// ────── Invitations ──────

function _startInvitationsListener() {
  if (!_fbDb) return;
  var myUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  if (_invitationsRef) _invitationsRef.off();
  _invitationsRef = _fbDb.ref('invitations/' + myUid);
  _invitationsRef.on('child_added', function(snap) {
    var inv = snap.val();
    var senderUid = snap.key;
    if (!inv) return;

    // Discard invitations older than 24 hours (stale offline invites)
    var STALE_MS = 24 * 60 * 60 * 1000;
    if (inv.timestamp && (Date.now() - inv.timestamp > STALE_MS)) {
      console.log('[INVITE] Scartato invito scaduto da ' + inv.fromName);
      _fbDb.ref('invitations/' + myUid + '/' + senderUid).remove();
      return;
    }

    _pendingInvitations[senderUid] = inv;
    _showInvitationToast(senderUid, inv);
  });
  _invitationsRef.on('child_removed', function(snap) {
    delete _pendingInvitations[snap.key];
  });
}

function _startInvitationResponsesListener() {
  if (!_fbDb) return;
  var myUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  if (_invResponseRef) _invResponseRef.off();
  _invResponseRef = _fbDb.ref('invitationResponses/' + myUid);
  _invResponseRef.on('child_added', function(snap) {
    var resp = snap.val();
    var fromUid = snap.key;
    if (!resp) return;
    if (resp.rejected) {
      _showToast('❌ ' + (resp.fromName || 'Giocatore') + ' ha rifiutato il tuo invito.', 'warn', 6000);
    }
    // Clean up the response node after reading
    _fbDb.ref('invitationResponses/' + myUid + '/' + fromUid).remove();
  });
}

function _showInvitationToast(senderUid, inv) {
  var container = document.getElementById('toast-container');
  if (!container) return;

  var toast = document.createElement('div');
  toast.className = 'toast-item toast-info show';
  var accId = 'inv-acc-' + senderUid.substring(0, 8);
  var rejId = 'inv-rej-' + senderUid.substring(0, 8);
  toast.innerHTML = '<div style="margin-bottom:6px">🎮 <b>' + _escHtml(inv.fromName) + '</b> ti invita a giocare!</div>'
    + '<div style="font-size:10px;color:#aaa;margin-bottom:8px">' + _escHtml(inv.roomLabel || 'Partita') + ' — Posto ' + (inv.seatIndex + 1) + '</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button class="lobby-btn primary" style="font-size:11px;padding:4px 12px;min-height:30px" id="' + accId + '">Accetta</button>'
    + '<button class="lobby-btn" style="font-size:11px;padding:4px 12px;min-height:30px" id="' + rejId + '">Rifiuta</button>'
    + '</div>';
  container.appendChild(toast);
  document.getElementById(accId).onclick = function() {
    _acceptInvitation(senderUid, inv);
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  };
  document.getElementById(rejId).onclick = function() {
    _rejectInvitation(senderUid);
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  };
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 30000);
}

function _sendInvitation(targetUid) {
  if (!_fbDb || !mpRoom) return;
  var senderUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  var senderName = (_authUser ? _authUser.displayName : '') || _guestDisplayName || _getMyName() || 'Giocatore';
  var targetPlayer = _onlinePlayers[targetUid];
  var isTargetOnline = !!targetPlayer;
  var targetName = isTargetOnline ? targetPlayer.displayName : (_friendsList[targetUid] ? _friendsList[targetUid].displayName : 'giocatore');
  var roomLabel = document.getElementById('room-name-input') ? document.getElementById('room-name-input').value || 'Partita' : 'Partita';

  _fbDb.ref('invitations/' + targetUid + '/' + senderUid).set({
    fromName: senderName,
    roomCode: mpRoom,
    roomLabel: roomLabel,
    seatIndex: _inviteSeatTarget,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    offline: !isTargetOnline
  }).then(function() {
    if (isTargetOnline) {
      _showToast('📨 Invito inviato a ' + targetName + '!', 'ok');
    } else {
      _showToast('🔔 Invito inviato a ' + targetName + ' (offline). Lo vedrà al prossimo accesso.', 'info', 5000);
    }
    _closeInvitePanel();
  });

  // Only auto-remove on disconnect for ONLINE targets.
  // Offline invitations must persist until the friend logs in.
  if (isTargetOnline) {
    _fbDb.ref('invitations/' + targetUid + '/' + senderUid).onDisconnect().remove();
  }
}

function _acceptInvitation(senderUid, inv) {
  var myUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  _fbDb.ref('invitations/' + myUid + '/' + senderUid).remove();
  var myName = (_authUser ? _authUser.displayName : '') || _guestDisplayName || _getMyName() || 'Ospite';
  var joinNameEl = document.getElementById('join-name-input');
  var joinCodeEl = document.getElementById('join-code-input');
  if (joinNameEl) joinNameEl.value = myName;
  if (joinCodeEl) joinCodeEl.value = inv.roomCode;
  // Show lobby and join directly with the seat from the invitation
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.remove('hidden');
  showLobbySection('lobby-join');
  var invSeat = typeof inv.seatIndex === 'number' ? inv.seatIndex : undefined;
  setTimeout(function() { _doActualJoin(myName, inv.roomCode.toUpperCase(), invSeat); }, 400);
}

function _rejectInvitation(senderUid) {
  if (!_fbDb) return;
  var myUid = (_authUser && !_isGuest) ? _authUser.uid : ('guest_' + MY_ID);
  var myName = (_authUser ? _authUser.displayName : '') || _guestDisplayName || _getMyName() || 'Ospite';
  _fbDb.ref('invitations/' + myUid + '/' + senderUid).remove();
  // Notify the sender that the invitation was rejected
  _fbDb.ref('invitationResponses/' + senderUid + '/' + myUid).set({
    rejected: true,
    fromName: myName,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

// ────── Social Panel UI ──────

function _showSocialPanel() {
  var panel = document.getElementById('social-panel');
  if (!panel) return;
  panel.classList.add('show');
  // Start listeners if not yet
  if (!_socialListenersStarted && _fbDb) {
    _startOnlinePlayersListener();
    if (_authUser && !_isGuest) {
      _startFriendsListener();
      _startFriendRequestsListener();
      _startInvitationsListener();
    }
    _socialListenersStarted = true;
  }
  _showSocialTab('online');
  _renderOnlinePlayersPanel();
  _renderFriendsList();
  _renderFriendRequests();
}

function _closeSocialPanel() {
  var panel = document.getElementById('social-panel');
  if (panel) panel.classList.remove('show');
}

function _showSocialTab(tab) {
  var tabs = ['online', 'friends', 'requests'];
  tabs.forEach(function(t) {
    var tabBtn = document.getElementById('social-tab-' + t);
    var body = document.getElementById('social-body-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
    if (body) body.style.display = (t === tab) ? 'block' : 'none';
  });
  // Hide friends/requests tabs for guests
  if (_isGuest) {
    document.getElementById('social-tab-friends').style.display = 'none';
    document.getElementById('social-tab-requests').style.display = 'none';
  } else {
    document.getElementById('social-tab-friends').style.display = '';
    document.getElementById('social-tab-requests').style.display = '';
  }
}

function _escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function _renderOnlinePlayersPanel() {
  var body = document.getElementById('social-body-online');
  if (!body) return;
  var uids = Object.keys(_onlinePlayers);
  if (uids.length === 0) {
    body.innerHTML = '<div class="social-empty">Nessun altro giocatore online al momento.</div>';
    return;
  }
  // Sort: friends first
  uids.sort(function(a, b) {
    var af = _friendsList[a] ? 0 : 1;
    var bf = _friendsList[b] ? 0 : 1;
    if (af !== bf) return af - bf;
    return (_onlinePlayers[a].displayName || '').localeCompare(_onlinePlayers[b].displayName || '');
  });
  var html = '';
  uids.forEach(function(uid) {
    var p = _onlinePlayers[uid];
    var isFriend = !!_friendsList[uid];
    var inGame = !!p.inGame;
    var inLobby = !!p.currentRoom && !p.inGame;
    html += '<div class="social-player-row">';
    html += '<div>';
    html += '<span class="social-player-name" style="color:' + (isFriend ? '#4f4' : '#ccc') + '">';
    html += (isFriend ? '⭐ ' : '🟢 ') + _escHtml(p.displayName);
    if (p.isGuest) html += ' <span style="color:#999;font-size:0.85em">(ospite)</span>';
    html += '</span>';
    if (inGame) html += ' <span class="social-player-status" style="color:#e84">(in partita)</span>';
    else if (inLobby) html += ' <span class="social-player-status" style="color:#888">(in lobby)</span>';
    html += '</div>';
    html += '<div style="display:flex;gap:4px">';
    if (!_isGuest && !isFriend && uid.indexOf('guest_') !== 0) {
      html += '<button class="lobby-btn" style="font-size:10px;padding:3px 8px;min-height:24px" onclick="_showAddFriendDialog(\'' + uid + '\',\'' + _escHtml(p.displayName).replace(/'/g, "\\'") + '\')">➕ Amico</button>';
    }
    html += '</div>';
    html += '</div>';
  });
  body.innerHTML = html;
}

function _renderFriendsList() {
  var body = document.getElementById('social-body-friends');
  if (!body) return;
  if (_isGuest) { body.innerHTML = '<div class="social-empty">Effettua il login per gestire gli amici.</div>'; return; }
  var uids = Object.keys(_friendsList);
  if (uids.length === 0) {
    body.innerHTML = '<div class="social-empty">Nessun amico ancora. Aggiungi amici dalla lista Online!</div>';
    return;
  }
  var html = '';
  uids.forEach(function(uid) {
    var f = _friendsList[uid];
    var isOnline = !!_onlinePlayers[uid];
    var inGame = isOnline && _onlinePlayers[uid].inGame;
    var inLobby = isOnline && _onlinePlayers[uid].currentRoom && !_onlinePlayers[uid].inGame;
    html += '<div class="social-player-row">';
    html += '<div>';
    html += '<span class="social-player-name" style="color:' + (isOnline ? '#4f4' : '#888') + '">';
    html += (isOnline ? '🟢' : '⚫') + ' ' + _escHtml(f.displayName);
    html += '</span>';
    if (inGame) html += ' <span class="social-player-status" style="color:#e84">(in partita)</span>';
    else if (inLobby) html += ' <span class="social-player-status" style="color:#888">(in lobby)</span>';
    else if (!isOnline) html += ' <span class="social-player-status" style="color:#666">offline</span>';
    html += '</div>';
    html += '<button class="lobby-btn" style="font-size:10px;padding:3px 8px;min-height:24px;color:#f88" onclick="_removeFriend(\'' + uid + '\',\'' + _escHtml(f.displayName).replace(/'/g, "\\'") + '\')">✕</button>';
    html += '</div>';
  });
  body.innerHTML = html;
}

function _renderFriendRequests() {
  var body = document.getElementById('social-body-requests');
  if (!body) return;
  if (_isGuest) { body.innerHTML = '<div class="social-empty">Effettua il login per vedere le richieste.</div>'; return; }
  var uids = Object.keys(_pendingFriendRequests);
  if (uids.length === 0) {
    body.innerHTML = '<div class="social-empty">Nessuna richiesta di amicizia in sospeso.</div>';
    return;
  }
  var html = '';
  uids.forEach(function(senderUid) {
    var req = _pendingFriendRequests[senderUid];
    html += '<div class="social-player-row" style="flex-direction:column;align-items:stretch;gap:6px">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between">';
    html += '<span class="social-player-name">📨 ' + _escHtml(req.fromName) + '</span>';
    html += '</div>';
    if (req.message) {
      html += '<div style="font-size:11px;color:#aaa;font-style:italic;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:4px">"' + _escHtml(req.message) + '"</div>';
    }
    html += '<div style="display:flex;gap:6px;justify-content:flex-end">';
    html += '<button class="lobby-btn primary" style="font-size:11px;padding:4px 12px;min-height:28px" onclick="_acceptFriendRequest(\'' + senderUid + '\')">✓ Accetta</button>';
    html += '<button class="lobby-btn" style="font-size:11px;padding:4px 12px;min-height:28px;color:#f88" onclick="_rejectFriendRequest(\'' + senderUid + '\')">✕ Rifiuta</button>';
    html += '</div>';
    html += '</div>';
  });
  body.innerHTML = html;
}

function _updateFriendRequestBadge() {
  var count = Object.keys(_pendingFriendRequests).length;
  var badge = document.getElementById('req-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
  // Also update the social-btn badge
  var sBadge = document.getElementById('social-badge');
  if (sBadge) {
    sBadge.textContent = count;
    sBadge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// ────── Invite from Seat ──────

function _showInviteForSeat(seatIdx) {
  _inviteSeatTarget = seatIdx;
  var panel = document.getElementById('invite-player-panel');
  if (!panel) return;
  panel.style.display = 'block';
  document.getElementById('invite-seat-label').textContent = (seatIdx + 1);
  // Make sure online players are being listened to
  if (!_socialListenersStarted && _fbDb) {
    _startOnlinePlayersListener();
    _socialListenersStarted = true;
  }
  _renderInvitePlayerList();
}

function _closeInvitePanel() {
  var panel = document.getElementById('invite-player-panel');
  if (panel) panel.style.display = 'none';
  _inviteSeatTarget = -1;
}

function _renderInvitePlayerList() {
  var listEl = document.getElementById('invite-player-list');
  if (!listEl) return;

  // Collect online players
  var onlineUids = Object.keys(_onlinePlayers);

  // Collect offline friends (not in _onlinePlayers)
  var offlineFriendUids = [];
  if (!_isGuest) {
    for (var fuid in _friendsList) {
      if (!_onlinePlayers[fuid]) {
        offlineFriendUids.push(fuid);
      }
    }
  }

  if (onlineUids.length === 0 && offlineFriendUids.length === 0) {
    listEl.innerHTML = '<div class="social-empty">Nessun giocatore disponibile. Aggiungi amici per invitarli anche quando sono offline!</div>';
    return;
  }

  // Sort online: friends first, then alphabetically
  onlineUids.sort(function(a, b) {
    var af = _friendsList[a] ? 0 : 1;
    var bf = _friendsList[b] ? 0 : 1;
    if (af !== bf) return af - bf;
    return (_onlinePlayers[a].displayName || '').localeCompare(_onlinePlayers[b].displayName || '');
  });

  // Sort offline friends alphabetically
  offlineFriendUids.sort(function(a, b) {
    return (_friendsList[a].displayName || '').localeCompare(_friendsList[b].displayName || '');
  });

  var html = '';

  // Online players section
  if (onlineUids.length > 0) {
    html += '<div style="color:#4caf50;font-size:10px;font-weight:bold;margin-bottom:4px;margin-top:2px">🟢 ONLINE</div>';
    onlineUids.forEach(function(uid) {
      var p = _onlinePlayers[uid];
      var isFriend = !!_friendsList[uid];
      var inGame = !!p.inGame;
      var inLobby = !!p.currentRoom && !p.inGame;
      html += '<div class="social-player-row">';
      html += '<div>';
      html += '<span class="social-player-name" style="color:' + (isFriend ? '#4f4' : '#ccc') + '">';
      html += (isFriend ? '⭐ ' : '') + _escHtml(p.displayName);
      if (p.isGuest) html += ' <span style="color:#999;font-size:0.85em">(ospite)</span>';
      html += '</span>';
      if (inGame) html += ' <span class="social-player-status" style="color:#e84">(in partita)</span>';
      else if (inLobby) html += ' <span class="social-player-status" style="color:#888">(in lobby)</span>';
      html += '</div>';
      html += '<button class="lobby-btn primary" style="font-size:10px;padding:3px 10px;min-height:26px" onclick="_sendInvitation(\'' + uid + '\')">📨 Invita</button>';
      html += '</div>';
    });
  }

  // Offline friends section
  if (offlineFriendUids.length > 0) {
    html += '<div style="color:#888;font-size:10px;font-weight:bold;margin-bottom:4px;margin-top:8px">⚫ OFFLINE — riceveranno una notifica push</div>';
    offlineFriendUids.forEach(function(uid) {
      var f = _friendsList[uid];
      html += '<div class="social-player-row" style="opacity:0.7">';
      html += '<div>';
      html += '<span class="social-player-name" style="color:#888">⭐ ' + _escHtml(f.displayName) + '</span>';
      html += ' <span class="social-player-status" style="color:#666">offline</span>';
      html += '</div>';
      html += '<button class="lobby-btn" style="font-size:10px;padding:3px 10px;min-height:26px;background:rgba(255,170,68,0.15);border-color:rgba(255,170,68,0.3);color:#fa4" onclick="_sendInvitation(\'' + uid + '\')">🔔 Notifica</button>';
      html += '</div>';
    });
  }

  listEl.innerHTML = html;
}

// ────── Social Init & Cleanup ──────

function _initSocialListeners() {
  if (!_fbDb) return;
  _startOnlinePlayersListener();
  _startInvitationsListener();
  _startInvitationResponsesListener();
  if (_authUser && !_isGuest) {
    _startFriendsListener();
    _startFriendRequestsListener();
  }
  _socialListenersStarted = true;
  // Show social button
  var btn = document.getElementById('social-btn');
  if (btn) btn.style.display = 'flex';
}

function _cleanupSocialListeners() {
  if (_presenceHeartbeatTimer) { clearInterval(_presenceHeartbeatTimer); _presenceHeartbeatTimer = null; }
  if (_presenceRef) { _presenceRef.remove(); _presenceRef = null; }
  if (_onlinePlayersRef) { _onlinePlayersRef.off(); _onlinePlayersRef = null; }
  if (_friendReqRef) { _friendReqRef.off(); _friendReqRef = null; }
  if (_friendsRef) { _friendsRef.off(); _friendsRef = null; }
  if (_invitationsRef) { _invitationsRef.off(); _invitationsRef = null; }
  if (_invResponseRef) { _invResponseRef.off(); _invResponseRef = null; }
  _onlinePlayers = {};
  _friendsList = {};
  _pendingFriendRequests = {};
  _pendingInvitations = {};
  _knownOnlineFriends = {};
  _socialListenersStarted = false;
}

