// ─── Status Messages ─────────────────────────────────────────
function showStatus(text, duration) {
  const el = document.getElementById('status-msg');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration || 1500);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Game Over ────────────────────────────────────────────────
function showGameOver() {
  // Stats will be logged AFTER result computation (below)
  _updatePresenceInGame(false);

  const el = document.getElementById('game-over');
  el.classList.add('show');

  const isPerdere = gameMode === 'perdere';
  const localSeat = (mpMode && !isHost && mySeat >= 0) ? mySeat : 0;

  // Build player list
  const sorted = game.scores.map((s, i) => ({ name: PLAYER_NAMES[i], score: s, idx: i }));

  // Determine winners and losers
  let winnerSet = new Set();
  let loserSet = new Set();
  let voloActive = false;

  if (isPerdere) {
    // --- A PERDERE rules ---
    // 1 punto intero = 3 terzi (un asso o 3 figure)
    const MIN_PUNTO = 3; // 3 terzi = 1 punto intero
    const maxScore = Math.max(...game.scores);

    // Sort a copy by score ascending to find the 3 players with least points
    const byScoreAsc = sorted.slice().sort((a, b) => a.score - b.score);
    // The bottom 3 are the 3 players with the LEAST points (excluding the top scorer)
    // i.e. byScoreAsc[0], byScoreAsc[1], byScoreAsc[2] — the 3 lowest scorers
    const bottomThreeSum = byScoreAsc[0].score + byScoreAsc[1].score + byScoreAsc[2].score;
    // 3 punti interi = 9 terzi
    const VOLO_THRESHOLD = 9;

    if (bottomThreeSum < VOLO_THRESHOLD) {
      // VOLO! The player with the most points wins!
      voloActive = true;
      // Winner: player(s) with highest score
      game.scores.forEach((s, i) => { if (s === maxScore) winnerSet.add(i); });
      // Losers: anyone who didn't reach at least 1 punto intero (except the volo winner)
      game.scores.forEach((s, i) => {
        if (!winnerSet.has(i) && s < MIN_PUNTO) loserSet.add(i);
      });
    } else {
      // Normal "a perdere": highest score loses
      // Also anyone who didn't reach at least 1 punto intero loses
      game.scores.forEach((s, i) => {
        if (s === maxScore) loserSet.add(i);
        else if (s < MIN_PUNTO) loserSet.add(i);
      });
      // Winners: everyone not in loserSet
      game.scores.forEach((s, i) => {
        if (!loserSet.has(i)) winnerSet.add(i);
      });
    }
  } else {
    // --- A VINCERE (team-based) ---
    const teamScore0 = getTeamScore(0);
    const teamScore1 = getTeamScore(1);
    const myTeam = getPlayerTeam(localSeat);

    if (teamScore0 > teamScore1) {
      TEAM_MEMBERS[0].forEach(i => winnerSet.add(i));
      TEAM_MEMBERS[1].forEach(i => loserSet.add(i));
    } else if (teamScore1 > teamScore0) {
      TEAM_MEMBERS[1].forEach(i => winnerSet.add(i));
      TEAM_MEMBERS[0].forEach(i => loserSet.add(i));
    } else {
      // Tie: no winners or losers
    }
  }

  const playerIsWinner = winnerSet.has(localSeat);
  const playerIsLoser = loserSet.has(localSeat);

  const resultsEl = document.getElementById('go-results');
  resultsEl.innerHTML = '';

  if (!isPerdere) {
    // --- A VINCERE: show team results ---
    const myTeam = getPlayerTeam(localSeat);
    const teamScore0 = getTeamScore(0);
    const teamScore1 = getTeamScore(1);
    // Convert terzi to punti interi for this hand
    var puntiHand0 = Math.floor(teamScore0 / 3);
    var puntiHand1 = Math.floor(teamScore1 / 3);
    const teams = [
      { idx: 0, score: teamScore0, puntiInteri: puntiHand0, name: getTeamName(0) },
      { idx: 1, score: teamScore1, puntiInteri: puntiHand1, name: getTeamName(1) }
    ];
    teams.sort((a, b) => b.score - a.score); // highest first

    teams.forEach((t, rank) => {
      const isWin = (t.score === Math.max(teamScore0, teamScore1)) && teamScore0 !== teamScore1;
      const isLose = (t.score === Math.min(teamScore0, teamScore1)) && teamScore0 !== teamScore1;
      const isTie = teamScore0 === teamScore1;
      const row = document.createElement('div');
      row.className = 'go-result-row' + (isLose ? ' loser' : '') + (isWin ? ' winner' : '');
      let statusLabel = '+'  + t.puntiInteri + ' pt torneo';
      if (isWin) statusLabel = '✅ ' + statusLabel;
      else if (isTie) statusLabel = '🤝 ' + statusLabel;
      else if (isLose) statusLabel = '❌ ' + statusLabel;
      row.innerHTML =
        `<span class="grr-name">${rank + 1}° ${t.name}</span>` +
        `<span class="grr-pts">${formatPuntiLong(t.score)}</span>` +
        `<span class="grr-status">${statusLabel}</span>`;
      resultsEl.appendChild(row);
    });

    // Also show individual scores for reference
    const detailDiv = document.createElement('div');
    detailDiv.style.cssText = 'margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;';
    sorted.sort((a,b) => b.score - a.score);
    sorted.forEach(p => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;justify-content:space-between;font-size:clamp(9px,2vw,11px);color:#aaa;padding:1px 0;';
      d.innerHTML = `<span>${p.name}</span><span>${formatPunti(p.score)}</span>`;
      detailDiv.appendChild(d);
    });
    resultsEl.appendChild(detailDiv);

    // Show buongioco declarations if any were applied this hand
    if (game._buongiocoDecls && game._buongiocoDecls.length > 0) {
      const bgDiv = document.createElement('div');
      bgDiv.style.cssText = 'margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;';
      bgDiv.innerHTML = '<div style="color:#fa4;font-size:clamp(9px,2vw,11px);margin-bottom:2px">🎯 Buongioco:</div>';
      game._buongiocoDecls.forEach(d => {
        const dd = document.createElement('div');
        dd.style.cssText = 'font-size:clamp(8px,1.8vw,10px);color:#cca;padding:1px 0;';
        dd.textContent = d.playerName + ': ' + describeBuongioco(d);
        bgDiv.appendChild(dd);
      });
      resultsEl.appendChild(bgDiv);
    }
  } else {
    // --- A PERDERE: show individual results ---
    // Re-sort: winners first, then neutral, then losers; within each group by score
    sorted.sort((a, b) => {
      const aGroup = winnerSet.has(a.idx) ? 0 : (loserSet.has(a.idx) ? 2 : 1);
      const bGroup = winnerSet.has(b.idx) ? 0 : (loserSet.has(b.idx) ? 2 : 1);
      if (aGroup !== bGroup) return aGroup - bGroup;
      return a.score - b.score;
    });

    // If volo, show a banner
    if (voloActive) {
      const voloBanner = document.createElement('div');
      voloBanner.style.cssText = 'text-align:center;color:#ff2;font-size:clamp(14px,3.5vw,20px);font-weight:bold;margin-bottom:10px;text-shadow:0 0 10px rgba(255,200,0,0.6);';
      const voloWinnerNames = sorted.filter(p => winnerSet.has(p.idx)).map(p => p.name).join(', ');
      voloBanner.textContent = `🚀 VOLO! ${voloWinnerNames} vince!`;
      resultsEl.appendChild(voloBanner);
    }

    sorted.forEach((p, rank) => {
      const isWinner = winnerSet.has(p.idx);
      const isLoser = loserSet.has(p.idx);
      const isPlayer = p.idx === localSeat;
      const row = document.createElement('div');
      row.className = 'go-result-row' + (isLoser ? ' loser' : '') + (isWinner ? ' winner' : '');
      let statusLabel = '';
      if (isWinner) {
        if (voloActive) statusLabel = isPlayer ? '🚀 VOLO!' : '🚀 VOLO!';
        else statusLabel = isPlayer ? '✅ VINCI' : '✅ VINCE';
      } else if (isLoser) {
        if (p.score < 3 && !voloActive) {
          statusLabel = isPlayer ? '❌ <1pt!' : '❌ <1pt!';
        } else {
          statusLabel = isPlayer ? '❌ PERDI' : '❌ PERDE';
        }
      }
      row.innerHTML =
        `<span class="grr-name">${rank + 1}° ${p.name}</span>` +
        `<span class="grr-pts">${formatPuntiLong(p.score)}</span>` +
        `<span class="grr-status">${statusLabel}</span>`;
      resultsEl.appendChild(row);
    });
  }

  // Update tournament scores
  updateTournamentScores(winnerSet, loserSet, voloActive);

  // --- Log completed game stats WITH result data ---
  var _goType = mpMode ? 'Multiplayer' : 'CPU';
  var _goRole = mpMode ? (isHost ? 'Host' : 'Client') : null;
  // In perdere mode: if you survived (not a loser), you won — don't classify as 'draw'
  // In vincere mode: only a true tie (equal team scores) is a 'draw'
  var _resultStr;
  if (playerIsWinner) {
    _resultStr = 'win';
  } else if (playerIsLoser) {
    _resultStr = 'lose';
  } else if (isPerdere) {
    // In perdere, surviving without penalty = effective win
    _resultStr = 'win';
  } else {
    _resultStr = 'draw';
  }
  var _playerScore = game.scores[localSeat] || 0;
  var _resultData = {
    result: _resultStr,
    playerScore: _playerScore,
    scores: game.scores.slice(),
    playerNames: PLAYER_NAMES.slice(),
    volo: voloActive
  };
  if (!isPerdere) {
    _resultData.teamScores = [getTeamScore(0), getTeamScore(1)];
  }
  logGameStats(_goType, _goRole, true, _resultData);

  // Update player skill profile after every game (all modes, not just adattivo)
  _updateProfileAfterGame(
    _resultStr === 'win',
    game.scores[localSeat] || 0
  );

  // --- Set title: if tournament just ended, reflect tournament result; otherwise hand result ---
  if (tournamentOver) {
    if (isVincereMode()) {
      const myTeam = getPlayerTeam(localSeat);
      const myTourneyScore = tournamentScores[myTeam];
      const maxTourney = Math.max(...tournamentScores);
      if (myTourneyScore === maxTourney && tournamentScores[0] !== tournamentScores[1]) {
        document.getElementById('go-title').textContent = '🏆 La tua coppia vince il Torneo!';
        document.getElementById('go-title').style.color = '#4f4';
        sndWin();
      } else if (myTourneyScore < maxTourney) {
        document.getElementById('go-title').textContent = '💀 La tua coppia perde il Torneo!';
        document.getElementById('go-title').style.color = '#f44';
        sndLose();
      } else {
        document.getElementById('go-title').textContent = '🏆 Torneo Finito!';
        document.getElementById('go-title').style.color = '#fa4';
      }
    } else {
      const myTourneyScore = tournamentScores[localSeat];
      const minTourney = Math.min(...tournamentScores);
      if (myTourneyScore === minTourney) {
        document.getElementById('go-title').textContent = '🏆 Hai Vinto il Torneo!';
        document.getElementById('go-title').style.color = '#4f4';
        sndWin();
      } else if (myTourneyScore >= TOURNAMENT_LIMIT) {
        document.getElementById('go-title').textContent = '💀 Hai Perso il Torneo!';
        document.getElementById('go-title').style.color = '#f44';
        sndLose();
      } else {
        document.getElementById('go-title').textContent = '🏆 Torneo Finito!';
        document.getElementById('go-title').style.color = '#fa4';
      }
    }
  } else {
    if (playerIsWinner) {
      document.getElementById('go-title').textContent = voloActive ? '🚀 Hai fatto VOLO!' : '🎉 Hai Vinto!';
      document.getElementById('go-title').style.color = '#4f4';
      sndWin();
    } else if (playerIsLoser) {
      document.getElementById('go-title').textContent = '😞 Hai Perso!';
      document.getElementById('go-title').style.color = '#f44';
      sndLose();
    } else {
      if (isVincereMode()) {
        document.getElementById('go-title').textContent = '🤝 Parità!';
      } else {
        document.getElementById('go-title').textContent = '🃏 Fine Partita';
      }
      document.getElementById('go-title').style.color = '#fa4';
    }

    // For vincere: show cumulative tournament progress
    if (isVincereMode() && tournamentActive && !tournamentOver) {
      const progDiv = document.createElement('div');
      progDiv.style.cssText = 'margin-top:8px;border-top:1px solid rgba(255,255,255,0.15);padding-top:6px;text-align:center;';
      progDiv.innerHTML = '<div style="color:#5af;font-size:clamp(10px,2.2vw,12px);margin-bottom:4px">📊 Classifica Torneo (obiettivo: ' + VINCERE_LIMIT + ' punti)</div>'
        + [0,1].map(function(ti) {
          return '<div style="color:#ccc;font-size:clamp(9px,2vw,11px)">' + getTeamName(ti) + ': ' + tournamentScores[ti] + ' / ' + VINCERE_LIMIT + ' pt</div>';
        }).join('');
      resultsEl.appendChild(progDiv);
    }
  }

  // Show correct button: CONTINUA during tournament, GIOCA ANCORA when tournament over
  document.getElementById('continue-btn').style.display = tournamentOver ? 'none' : '';
  document.getElementById('retry-btn').style.display = tournamentOver ? '' : 'none';

  // If tournament is over, show tournament result
  if (tournamentOver) {
    const tEl = document.createElement('div');
    tEl.style.cssText = 'margin-top:12px;padding:8px;border-top:1px solid rgba(255,255,255,0.2);text-align:center;';
    if (isVincereMode()) {
      const tSorted = tournamentScores.map((s, i) => ({ name: getTeamName(i), score: s, idx: i }))
        .sort((a, b) => b.score - a.score);
      const tWinner = tSorted[0];
      const tLoser = tSorted[1];
      tEl.innerHTML = `<div style="color:#fa4;font-weight:bold;font-size:clamp(12px,3vw,16px);margin-bottom:4px">🏆 TORNEO FINITO!</div>`
        + `<div style="color:#4f4;font-size:clamp(10px,2.5vw,13px)">👑 ${tWinner.name} vince (${tWinner.score} punti)</div>`
        + `<div style="color:#f44;font-size:clamp(10px,2.5vw,13px)">💀 ${tLoser.name} perde (${tLoser.score} punti)</div>`;
    } else {
      const tSorted = tournamentScores.map((s, i) => ({ name: PLAYER_NAMES[i], score: s, idx: i }))
        .sort((a, b) => a.score - b.score);
      const tLoser = tSorted[3];
      const tWinner = tSorted[0];
      tEl.innerHTML = `<div style="color:#fa4;font-weight:bold;font-size:clamp(12px,3vw,16px);margin-bottom:4px">🏆 TORNEO FINITO!</div>`
        + `<div style="color:#4f4;font-size:clamp(10px,2.5vw,13px)">👑 ${tWinner.name} vince il torneo (${tWinner.score} pt)</div>`
        + `<div style="color:#f44;font-size:clamp(10px,2.5vw,13px)">💀 ${tLoser.name} perde il torneo (${tLoser.score} pt)</div>`;
    }
    resultsEl.appendChild(tEl);
  }
}

// ─── Init & Start ─────────────────────────────────────────────

// Populate preview cards and info with SVG suits
(function populateOverlay() {
  const previewRow = document.getElementById('preview-row');
  const previewCards = [
    {r:1, s:'coppe'}, {r:3, s:'denari'}, {r:10, s:'bastoni'},
    {r:2, s:'spade'}, {r:9, s:'coppe'}, {r:7, s:'denari'}
  ];
  previewCards.forEach(({r, s}) => {
    const d = document.createElement('div');
    d.className = 'preview-card';
    const img = document.createElement('img');
    const _ps = s === 'coppe' ? 'bastoni' : s === 'bastoni' ? 'coppe' : s;
    img.src = CARD_DATA[_ps + "_" + r];
    img.alt = RANK_NAMES[r] + " di " + SUIT_NAMES[s];
    img.draggable = false;
    d.appendChild(img);
    previewRow.appendChild(d);
  });

  const infoSuits = document.getElementById('info-suits');
  infoSuits.innerHTML = `<b>Semi:</b> ${SUITS.map(s =>
    `${SUIT_ICONS[s]} ${SUIT_NAMES[s]}`
  ).join(' · ')}`;
})();

// "GIOCA!" buttons are now directly on the overlay
var _overlayMenuActionLock = false;
function runOverlayMenuAction(ev, action) {
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  if(_overlayMenuActionLock) return false;
  _overlayMenuActionLock = true;
  var active = document.activeElement;
  if(active && typeof active.blur === 'function') active.blur();
  var actions = {
    single: startSinglePlayerFromOverlay,
    create: showCreateRoom,
    join: showJoinRoom
  };
  var fn = actions[action];
  requestAnimationFrame(function(){ if(fn) fn(); });
  setTimeout(function(){ _overlayMenuActionLock = false; }, 650);
  return false;
}
function startSinglePlayerFromOverlay() {
  if(!_getMyName()){ document.getElementById('my-name-input').style.border='2px solid #f44'; document.getElementById('my-name-input').focus(); return; }
  document.getElementById('my-name-input').style.border='';
  var myName = _getMyName();
  PLAYER_NAMES[0] = myName;
  var usedNames = [myName];
  for(var s = 1; s <= 3; s++){
    PLAYER_NAMES[s] = pickCpuName(usedNames);
    usedNames.push(PLAYER_NAMES[s]);
  }
  mpMode = false; isHost = false;
  document.getElementById('overlay').classList.add('hidden');
  startGame();
}
function showCreateRoom() {
  if(!_getMyName()){ document.getElementById('my-name-input').style.border='2px solid #f44'; document.getElementById('my-name-input').focus(); return; }
  document.getElementById('my-name-input').style.border='';
  document.getElementById('host-name-input').value = _getMyName();
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.remove('hidden');
  document.getElementById('lobby-mode-sub').textContent = gameMode === 'perdere' ? 'A PERDERE' : 'A VINCERE';
  document.getElementById('host-seats-area').style.display = 'none';
  document.getElementById('create-room-btn').style.display = '';
  showLobbySection('lobby-host');
}
function showJoinRoom() {
  if(!_getMyName()){ document.getElementById('my-name-input').style.border='2px solid #f44'; document.getElementById('my-name-input').focus(); return; }
  document.getElementById('my-name-input').style.border='';
  document.getElementById('join-name-input').value = _getMyName();
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.remove('hidden');
  document.getElementById('lobby-mode-sub').textContent = gameMode === 'perdere' ? 'A PERDERE' : 'A VINCERE';
  showLobbySection('lobby-join');
  startLobbyBrowser();
}
function bindRemoteSafeUiHandlers() {
  function bindClick(id, handler) {
    var el = document.getElementById(id);
    if(!el || el.dataset.boundClick === '1') return;
    el.dataset.boundClick = '1';
    el.addEventListener('click', handler);
  }
  function bindOverlayAction(id, action) {
    var el = document.getElementById(id);
    if(!el || el.dataset.boundOverlayAction === '1') return;
    el.dataset.boundOverlayAction = '1';
    var handler = function(ev) { return runOverlayMenuAction(ev, action); };
    el.addEventListener('pointerdown', handler);
    el.addEventListener('click', handler);
  }

  bindClick('mode-perdere', function(){ selectMode('perdere'); });
  bindClick('mode-vincere', function(){ selectMode('vincere'); });
  bindOverlayAction('overlay-single-btn', 'single');
  bindOverlayAction('overlay-create-btn', 'create');
  bindOverlayAction('overlay-join-btn', 'join');
  bindClick('create-room-btn', hostGame);
  bindClick('join-room-btn', joinGame);
  bindClick('start-mp-btn', startMultiplayerGame);
  bindClick('lobby-back-host-btn', cancelLobby);
  bindClick('lobby-back-join-btn', cancelLobby);
  bindClick('seat-pick-confirm', confirmSeatPick);
  bindClick('seat-pick-cancel-btn', cancelSeatPick);
  bindClick('fullscreen-btn', toggleFullscreen);
}
bindRemoteSafeUiHandlers();

// No play-btn anymore — buttons are directly on overlay
document.getElementById('retry-btn').onclick = () => {
  handleRetryGame();
};
document.getElementById('retry-btn').addEventListener('touchend', handleRetryGame, { passive: false });
document.getElementById('continue-btn').onclick = () => {
  handleContinueTournament();
};
document.getElementById('continue-btn').addEventListener('touchend', handleContinueTournament, { passive: false });
document.getElementById('endgame-btn').onclick = () => {
  quitGame();
};
document.getElementById('endgame-btn').addEventListener('touchend', function(e) {
  e.preventDefault(); e.stopPropagation(); quitGame();
}, { passive: false });
document.getElementById('rules-btn').onclick = () => {
  document.getElementById('rules-panel').classList.add('show');
};

// --- Continue tournament (next round, same players) ---
var _continueTouchLock = false;
function handleContinueTournament(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'touchend') {
      _continueTouchLock = true;
      setTimeout(function(){ _continueTouchLock = false; }, 400);
    } else if (_continueTouchLock) {
      return;
    }
  }
  document.getElementById('game-over').classList.remove('show');
  if (mpMode && isHost) {
    initGame();
    deduplicateNames();
    renderAll();
    renderTournament();
    mpSend({t:'start',gm:gameMode,diff:cpuDifficulty,names:PLAYER_NAMES.slice(),hands:game.hands,lp:game.leadPlayer,cp:game.currentPlayer,humanSeats:Array.from(_humanSeatSet)});
    syncState(true);
    sndStart();
    showStatus('Nuova mano!',1500);
    showBuongiocoAndStart(function(){
      if(game && !isHumanSeat(game.currentPlayer)) setTimeout(function(){cpuTurn();},400);
    });
  } else if (mpMode && !isHost) {
    showStatus('In attesa nuova mano...',2000);
  } else {
    initGame();
    deduplicateNames();
    renderLabels();
    renderScores();
    renderTournament();
    document.getElementById('trick-count').textContent = 'Mano 0 / 10';
    document.getElementById('player-hand').innerHTML = '';
    document.getElementById('north-hand').innerHTML = '';
    document.getElementById('west-hand').innerHTML = '';
    document.getElementById('east-hand').innerHTML = '';
    document.getElementById('trick-area').innerHTML = '';
    sndStart();
    showStatus('Nuova mano!', 1500);
    renderAll();
    showBuongiocoAndStart(function(){
      if(game && !isHumanSeat(game.currentPlayer)) setTimeout(function(){ cpuTurn(); }, 400);
    });
  }
}

// --- Retry (new tournament) ---
var _retryTouchLock = false;
function handleRetryGame(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'touchend') {
      _retryTouchLock = true;
      setTimeout(function(){ _retryTouchLock = false; }, 400);
    } else if (_retryTouchLock) {
      return;
    }
  }

  document.getElementById('game-over').classList.remove('show');

  // Reset tournament for a new session
  resetTournament();

  if (mpMode && isHost) {
    // New tournament: animate dealer selection
    deduplicateNames();
    document.getElementById('player-hand').innerHTML = '';
    document.getElementById('north-hand').innerHTML = '';
    document.getElementById('west-hand').innerHTML = '';
    document.getElementById('east-hand').innerHTML = '';
    document.getElementById('trick-area').innerHTML = '';
    // Pre-calculate dealer cards and winner, send to clients
    var _dTempDeck2 = shuffle(createDeck());
    var _dCards2 = [{suit:_dTempDeck2[0].suit,rank:_dTempDeck2[0].rank},{suit:_dTempDeck2[1].suit,rank:_dTempDeck2[1].rank},{suit:_dTempDeck2[2].suit,rank:_dTempDeck2[2].rank},{suit:_dTempDeck2[3].suit,rank:_dTempDeck2[3].rank}];
    var _dWinner2 = _calcDealerWinner(_dCards2);
    // Build seatMap so clients can set mySeat before animation (avoids race condition)
    var _seatMap2 = {};
    for(var _sk2 in _humanSeats) { if(_humanSeats[_sk2] && _humanSeats[_sk2].id) _seatMap2[_humanSeats[_sk2].id] = parseInt(_sk2); }
    dbg('[DEALER] Host seatMap (tournament): ' + JSON.stringify(_seatMap2));
    mpSend({t:'dealer',cards:_dCards2,winnerSeat:_dWinner2,names:PLAYER_NAMES.slice(),seatMap:_seatMap2});
    animateDealerSelection(function(dealerSeat) {
      initGame((dealerSeat + 1) % 4);
      renderAll();
      renderTournament();
      mpSend({t:'start',gm:gameMode,diff:cpuDifficulty,names:PLAYER_NAMES.slice(),hands:game.hands,lp:game.leadPlayer,cp:game.currentPlayer,humanSeats:Array.from(_humanSeatSet)});
      syncState(true);
      sndStart();
      showStatus('Nuovo torneo!',1500);
      showBuongiocoAndStart(function(){
        if(game && !isHumanSeat(game.currentPlayer)) setTimeout(function(){cpuTurn();},400);
      });
    }, {cards:_dCards2, winnerSeat:_dWinner2});
  } else if (mpMode && !isHost) {
    showStatus('In attesa nuovo torneo...',2000);
  } else {
    // New tournament single player: animate dealer selection
    deduplicateNames();
    document.getElementById('label-south').innerHTML = PLAYER_NAMES[0] + ' <span class="lb-pts"></span>';
    document.getElementById('label-east').innerHTML = PLAYER_NAMES[1] + ' <span class="lb-pts"></span>';
    document.getElementById('label-north').innerHTML = PLAYER_NAMES[2] + ' <span class="lb-pts"></span>';
    document.getElementById('label-west').innerHTML = PLAYER_NAMES[3] + ' <span class="lb-pts"></span>';
    document.getElementById('trick-count').textContent = '';
    document.getElementById('player-hand').innerHTML = '';
    document.getElementById('north-hand').innerHTML = '';
    document.getElementById('west-hand').innerHTML = '';
    document.getElementById('east-hand').innerHTML = '';
    document.getElementById('trick-area').innerHTML = '';
    animateDealerSelection(function(dealerSeat) {
      initGame((dealerSeat + 1) % 4);
      deduplicateNames();
      renderLabels();
      renderScores();
      renderTournament();
      document.getElementById('trick-count').textContent = 'Mano 0 / 10';
      sndStart();
      showStatus('Nuovo torneo!', 1500);
      renderAll();
      showBuongiocoAndStart(function(){
        if(game && !isHumanSeat(game.currentPlayer)) setTimeout(function(){ cpuTurn(); }, 400);
      });
    });
  }
}

function copyRoomCode() {
  var code = mpRoom;
  if(!code) return;
  var msg = document.getElementById('copy-msg');
  // Try modern clipboard API first
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){
      msg.textContent = 'Codice copiato! Incollalo su WhatsApp';
      setTimeout(function(){ msg.textContent=''; }, 3000);
    }).catch(function(){ fallbackCopy(code, msg); });
  } else {
    fallbackCopy(code, msg);
  }
}
function fallbackCopy(text, msg) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try {
    document.execCommand('copy');
    msg.textContent = 'Codice copiato! Incollalo su WhatsApp';
  } catch(e) {
    msg.textContent = 'Tieni premuto sul codice per copiare';
  }
  setTimeout(function(){ msg.textContent=''; }, 3000);
  document.body.removeChild(ta);
}

// Build invite link — just the game URL, no code (rooms are discoverable via lobby browser)
var GAME_BASE_URL = 'https://htmlpreview.github.io/?https://github.com/ripom/ssp-test-ric/blob/main/tresette_multiplayers.html';
function getInviteLink() {
  return GAME_BASE_URL;
}
function copyInviteLink() {
  var link = getInviteLink();
  var msg = document.getElementById('copy-msg');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(link).then(function(){
      msg.textContent = 'Link copiato! Invialo su WhatsApp';
      setTimeout(function(){ msg.textContent=''; }, 3000);
    }).catch(function(){ prompt('Copia questo link:', link); });
  } else {
    prompt('Copia questo link:', link);
  }
}

// Auto-join: check ALL possible ways the code could be in the URL
// - hash: #CODE
// - query param on our page: ?code=CODE
// - query param on htmlpreview: &code=CODE
// - also check parent/referrer URL
(function checkUrlInvite(){
  var code = '';
  // Method 1: hash
  var hash = location.hash.replace('#','').trim();
  if(hash && /^[A-Za-z0-9]{6}$/.test(hash)) code = hash;
  // Method 2: our own query string
  if(!code){
    var m = location.search.match(/[?&]code=([A-Za-z0-9]{6})/);
    if(m) code = m[1];
  }
  // Method 3: full URL (htmlpreview puts everything in one big query)
  if(!code){
    var m2 = location.href.match(/[&?]code=([A-Za-z0-9]{6})/);
    if(m2) code = m2[1];
  }
  // Method 4: check document.referrer
  if(!code && document.referrer){
    var m3 = document.referrer.match(/[&#?]code=([A-Za-z0-9]{6})/);
    if(m3) code = m3[1];
  }
  if(code){
    code = code.toUpperCase();
    dbg('Auto-join from URL: code='+code);
    var checkReady = setInterval(function(){
      if(_fbReady){
        clearInterval(checkReady);
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('lobby-overlay').classList.remove('hidden');
        showLobbySection('lobby-join');
        document.getElementById('join-code-input').value = code;
      }
    }, 200);
  }
})();

function quitGame() {
  dbg('[QUIT] quitGame called');
  _startingGame = false;
  _updatePresenceRoom(null);
  // Dismiss dealer selection animation/banner if active
  _dismissDealerBanner();
  // Log abandoned game stats
  if(game && game.phase === 'playing') {
    var _qType = mpMode ? 'Multiplayer' : 'CPU';
    var _qRole = mpMode ? (isHost ? 'Host' : 'Client') : null;
    logGameStats(_qType, _qRole, false);
  }
  function _stabilizeStateForMigration() {
    if(!game || (game.phase !== 'playing' && game.phase !== 'done')) return false;
    if(game.animating) {
      if(game.phase === 'playing' && game.trick && game.trick.length === 4) {
        try {
          var winner = evaluateTrick();
          var pts = trickPoints();
          game.trickNum++;
          if(game.trickNum === 10) pts += 3;
          game.scores[winner] += pts;
          game.trickCards = game.trick.map(function(t){ return t.card; });
          game.leadPlayer = winner;
          game.currentPlayer = winner;
          if(game.trickNum >= 10) {
            game.phase = 'done';
          } else {
            game.trick = [];
          }
        } catch(e) {
          dbg('[QUIT] stabilize failed: ' + e);
          return false;
        }
      }
      game.animating = false;
    }
    return !!(game.phase === 'playing' || game.phase === 'done');
  }
  // Immediately abort all animations and clean up
  cleanupAnimations();
  var wasHost = isHost;
  var oldRoom = mpRoom;
  var oldSeat = mySeat;
  var oldName = _getMyName() || (oldSeat >= 0 ? PLAYER_NAMES[oldSeat] : '') || PLAYER_NAMES[0] || 'Amico';
  var hadGame = !!game;
  var canMigrateHost = !!(wasHost && mpMode && _stabilizeStateForMigration());
  var preserveMigrationSession = false;
  document.getElementById('quit-btn').style.display = 'none';
  if(typeof _showChatBtn === 'function') _showChatBtn(false);
  document.getElementById('game-over').classList.remove('show');
  _updateUserBadge(); // Hide skill badge when leaving game
  _hideDiscBanner();
  stopTurnTimer();
  hideBuongiocoBanners();
  stopHostHeartbeat();
  if(_mpPingTimer){ clearInterval(_mpPingTimer); _mpPingTimer=null; }
  if(mpMode){
    if(wasHost && _fbDb && oldRoom){
      // Check if there are other human players who can take over
      var hasOtherHumans = false;
      for(var qs=1;qs<=3;qs++){
        if(_humanSeats[qs]) { hasOtherHumans = true; break; }
      }
      if(hasOtherHumans && hadGame && canMigrateHost){
        preserveMigrationSession = true;
        syncState(true);
        // Notify clients to migrate host, do NOT delete room data
        mpSend({t:'host-leaving'});
        // Remove lobby entry and own seat; keep meta/state for migration
        _fbDb.ref('lobby/'+oldRoom).remove();
        _fbDb.ref('rooms/'+oldRoom+'/seats/'+MY_ID).remove();
        // Stop lease renewal so clients detect it and promote
        // The lease will expire and clients will attempt promotion
      } else {
        // No other humans, or state is mid-resolution — clean up everything
        mpSend({t:'quit'});
        _fbDb.ref('lobby/'+oldRoom).remove();
        _fbDb.ref('rooms/'+oldRoom+'/state').remove();
        _fbDb.ref('rooms/'+oldRoom+'/seats').remove();
        _fbDb.ref('rooms/'+oldRoom+'/meta').remove();
      }
    } else if(!wasHost && _fbDb && oldRoom && MY_ID){
      _fbDb.ref('rooms/'+oldRoom+'/seats/'+MY_ID).remove();
    }
    mpMode = false;
    _fbCleanup();
  }
  if(preserveMigrationSession && oldRoom) {
    _saveSession(oldRoom, oldName, false);
    _setSessionSeat(oldSeat >= 0 ? oldSeat : 0);
    dbg('[QUIT] Preserving session for migrated room rejoin room='+oldRoom+' seat='+(oldSeat >= 0 ? oldSeat : 0));
  } else {
    _clearSession();
  }
  game = null;
  document.getElementById('overlay').classList.remove('hidden');
}
document.getElementById('quit-btn').onclick = quitGame;

function forceReconnect() {
  dbg('FORCE RECONNECT triggered');
  document.getElementById('disconnect-text').textContent = '🔄 Riconnessione...';
  document.getElementById('reconnect-btn').style.display = 'none';
  if(!isHost){
    if(game){
      game.animating = false;
      if(game.phase !== 'done') game.phase = 'playing';
    }
    var myName = _getMyName() || 'Amico';
    mpSend({t:'join', name:myName});
    if(game) renderAll();
  } else {
    if(game && mpMode) bcastGSNow();
  }
  setTimeout(function(){ document.getElementById('disconnect-banner').style.display='none'; }, 2000);
}

// Prevent scroll/bounce only on the game table itself — NOT on overlays or UI
// iOS Safari: document-level touchmove preventDefault breaks ALL touch events
document.getElementById('table').addEventListener('touchmove', function(e) {
  e.preventDefault();
}, { passive: false });

// Handle orientation changes
window.addEventListener('orientationchange', () => {
  setTimeout(() => { if (game) renderAll(); }, 300);
});

function startGame() {
  initAudio();
  // Switch skill profile to current game mode
  if (_profileLoaded) _switchProfileToMode(gameMode);
  _updateUserBadge();
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('lobby-overlay').classList.add('hidden');
  document.getElementById('game-over').classList.remove('show');
  document.getElementById('quit-btn').style.display = '';

  // Start a new tournament
  resetTournament();

  // Update rules panel based on mode
  const isPerdere = gameMode === 'perdere';
  document.getElementById('rules-title').textContent = isPerdere ? '📜 Tresette a Perdere' : '📜 Tresette a Vincere';
  document.getElementById('rules-objective').innerHTML = isPerdere
    ? '<b>Obiettivo:</b> Prendere il <b>minor numero di punti</b> possibile. Chi fa più punti <b>perde!</b>'
    : '<b>Obiettivo:</b> Si gioca a <b>coppie</b>! Prendere il <b>maggior numero di punti</b> con il compagno. Prima coppia a <b>31 punti</b> vince! Ricordati di dichiarare il <b>buongioco</b>.';

  // First game of session: animate dealer selection
  if (_isVeryFirstGame) {
    _isVeryFirstGame = false;
    // Set labels directly (renderLabels needs game which is null at this point)
    deduplicateNames();
    document.getElementById('label-south').innerHTML = PLAYER_NAMES[0] + ' <span class="lb-pts"></span>';
    document.getElementById('label-east').innerHTML = PLAYER_NAMES[1] + ' <span class="lb-pts"></span>';
    document.getElementById('label-north').innerHTML = PLAYER_NAMES[2] + ' <span class="lb-pts"></span>';
    document.getElementById('label-west').innerHTML = PLAYER_NAMES[3] + ' <span class="lb-pts"></span>';
    document.getElementById('trick-count').textContent = '';
    document.getElementById('player-hand').innerHTML = '';
    document.getElementById('north-hand').innerHTML = '';
    document.getElementById('west-hand').innerHTML = '';
    document.getElementById('east-hand').innerHTML = '';
    document.getElementById('trick-area').innerHTML = '';

    animateDealerSelection(function(dealerSeat) {
      initGame((dealerSeat + 1) % 4);
      deduplicateNames();
      renderLabels();
      renderScores();
      document.getElementById('trick-count').textContent = 'Mano 0 / 10';
      showStatus(isPerdere ? 'A Perdere — Buona Fortuna! 🃏' : 'A Vincere — Buona Fortuna! 🃏', 1500);
      setTimeout(function() { sndStart(); }, 150);
      renderAll();
      showBuongiocoAndStart(function() {
        if (game && !isHumanSeat(game.currentPlayer)) {
          setTimeout(function(){ cpuTurn(); }, 400);
        }
      });
    });
    return;
  }

  initGame();
  deduplicateNames();
  // Render table elements (labels, scores) but not hands yet
  renderLabels();
  renderScores();
  document.getElementById('trick-count').textContent = 'Mano 0 / 10';
  // Clear hand containers so they appear empty during dealing
  document.getElementById('player-hand').innerHTML = '';
  document.getElementById('north-hand').innerHTML = '';
  document.getElementById('west-hand').innerHTML = '';
  document.getElementById('east-hand').innerHTML = '';
  document.getElementById('trick-area').innerHTML = '';
  showStatus(isPerdere ? 'A Perdere — Buona Fortuna! 🃏' : 'A Vincere — Buona Fortuna! 🃏', 1500);

  // Start sound after a small delay to let AudioContext fully resume
  setTimeout(() => { sndStart(); }, 150);

  // Show hands and start play (no dealing animation)
  renderAll();
  showBuongiocoAndStart(function() {
    if (game && !isHumanSeat(game.currentPlayer)) {
      setTimeout(function(){ cpuTurn(); }, 400);
    }
  });
}

// ─── Window Resize ────────────────────────────────────────────
let resizeTimeout;
function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (game) renderAll();
  }, 50);
}
window.addEventListener('resize', handleResize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleResize);
}



// ==============================================================
//  MULTIPLAYER via Firebase Realtime Database
// ==============================================================

let mpMode = false, isHost = false, mySeat = -1;
let mpRoom = '';
const GAME_VERSION = "3.2.0";
// Auto-sync version display everywhere from single GAME_VERSION constant
(function(){ ['game-version-display','auth-version'].forEach(function(id){ var el = document.getElementById(id); if(el) el.textContent = 'v' + GAME_VERSION; }); })();

// ─── Game Duration Tracking ───
var _gameStartedAt = 0;   // Date.now() when play started/resumed
var _gameElapsedMs = 0;   // accumulated play time (paused during disconnects)

// Persistent ID: survives page refresh so reconnection works
const MY_ID = (function(){
  var stored = null;
  try { stored = localStorage.getItem('tresette_my_id'); } catch(e){}
  if(stored && stored.length >= 6) return stored;
  var id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try { localStorage.setItem('tresette_my_id', id); } catch(e){}
  return id;
})();
var _fbReady = false;
var _fbDb = null;

// Session persistence helpers for auto-rejoin (localStorage survives browser close)
function _saveSession(room, name, hosting) {
  try {
    localStorage.setItem('tresette_room', room);
    localStorage.setItem('tresette_name', name);
    localStorage.setItem('tresette_host', hosting ? '1' : '0');
    localStorage.setItem('tresette_sess_ts', Date.now().toString());
  } catch(e){}
}
function _setSessionSeat(seat) {
  try {
    if (typeof seat === 'number' && seat >= 0 && seat <= 3) localStorage.setItem('tresette_seat', String(seat));
    else localStorage.removeItem('tresette_seat');
  } catch(e){}
}
function _clearSession() {
  try {
    localStorage.removeItem('tresette_room');
    localStorage.removeItem('tresette_name');
    localStorage.removeItem('tresette_host');
    localStorage.removeItem('tresette_sess_ts');
    localStorage.removeItem('tresette_seat');
  } catch(e){}
}
function _getSession() {
  try {
    var room = localStorage.getItem('tresette_room');
    var name = localStorage.getItem('tresette_name');
    var hosting = localStorage.getItem('tresette_host') === '1';
    var seatRaw = localStorage.getItem('tresette_seat');
    var seat = seatRaw === null ? null : parseInt(seatRaw, 10);
    var ts = parseInt(localStorage.getItem('tresette_sess_ts') || '0');
    // Expire after 2 hours to avoid stale sessions from old games
    if(room && name && ts && (Date.now() - ts) < 7200000) return {room:room, name:name, hosting:hosting, seat:isNaN(seat) ? null : seat};
    // Clean up stale
    if(ts && (Date.now() - ts) >= 7200000) _clearSession();
  } catch(e){}
  return null;
}
