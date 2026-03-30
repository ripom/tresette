// ─── Tournament State ─────────────────────────────────────────
var tournamentScores = [0, 0, 0, 0]; // penalty points per player (perdere) or per team (vincere: [team0, team1])
var tournamentActive = false;
var TOURNAMENT_LIMIT = 7; // first to reach this loses the tournament (a perdere)
// For vincere: VINCERE_LIMIT = 31 (first team to 31 punti interi wins)
var tournamentOver = false;

function resetTournament() {
  tournamentScores = isVincereMode() ? [0, 0] : [0, 0, 0, 0];
  tournamentOver = false;
  tournamentActive = true;
  renderTournament();
}

function getVincereTournamentLimit() { return VINCERE_LIMIT; }

function toggleTournament() {
  var body = document.getElementById('tp-body');
  var icon = document.getElementById('tp-toggle-icon');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    icon.classList.add('open');
  } else {
    body.classList.add('collapsed');
    icon.classList.remove('open');
  }
}

function toggleScorePanel() {
  var body = document.getElementById('sp-body');
  var icon = document.getElementById('sp-toggle-icon');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    icon.classList.add('open');
  } else {
    body.classList.add('collapsed');
    icon.classList.remove('open');
  }
}

// ─── Draggable panels (touch + mouse) ────────────────────────
(function initDraggablePanels() {
  var panels = ['score-panel', 'tournament-panel', 'lead-suit-badge', 'trick-winner-badge', 'label-south', 'label-north', 'label-west', 'label-east'];
  panels.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var dragging = false;
    var startX, startY, origLeft, origTop;
    var dragThreshold = 8; // px to distinguish drag from tap
    var moved = false;

    function onStart(e) {
      var t = e.touches ? e.touches[0] : e;
      dragging = true;
      moved = false;
      startX = t.clientX;
      startY = t.clientY;
      var rect = el.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      // Clear any right/bottom positioning so left/top works
      el.style.transition = 'none';
    }

    function onMove(e) {
      if (!dragging) return;
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if (!moved && Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
      moved = true;
      e.preventDefault();
      var newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, origLeft + dx));
      var newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, origTop + dy));
      el.style.left = newLeft + 'px';
      el.style.top = newTop + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }

    function onEnd(e) {
      dragging = false;
      el.style.transition = '';
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  });
})();

function renderTournament() {
  var panel = document.getElementById('tournament-panel');
  if (!tournamentActive) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  var container = document.getElementById('tp-rows');
  container.innerHTML = '';

  if (isVincereMode()) {
    // Team-based tournament for "a vincere" — accumulate punti interi, first to 31
    var myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
    var myTeam = getPlayerTeam(myIdx);
    var limit = VINCERE_LIMIT;
    var teams = tournamentScores.map(function(s, i) { return { idx: i, score: s, name: getTeamName(i) }; });
    teams.sort(function(a, b) { return b.score - a.score; }); // highest first
    teams.forEach(function(t, rank) {
      var row = document.createElement('div');
      var cls = 'tp-row';
      if (t.idx === myTeam) cls += ' you';
      if (t.score === Math.max(tournamentScores[0], tournamentScores[1]) && tournamentScores[0] !== tournamentScores[1]) cls += ' leader';
      row.className = cls;
      row.innerHTML = '<span class="tp-name">' + (rank + 1) + '° ' + t.name + '</span><span class="tp-pts">' + t.score + ' / ' + limit + ' pt</span>';
      container.appendChild(row);
    });
  } else {
    var myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
    var minScore = Math.min(...tournamentScores);
    var maxScore = Math.max(...tournamentScores);
    // Sort by tournament score ascending (best first)
    var players = tournamentScores.map(function(s, i) { return { idx: i, score: s, name: PLAYER_NAMES[i] }; });
    players.sort(function(a, b) { return a.score - b.score; });
    players.forEach(function(p, rank) {
      var row = document.createElement('div');
      var cls = 'tp-row';
      if (p.idx === myIdx) cls += ' you';
      if (p.score >= TOURNAMENT_LIMIT) cls += ' eliminated';
      else if (p.score === minScore) cls += ' leader';
      row.className = cls;
      row.innerHTML = '<span class="tp-name">' + (rank + 1) + '° ' + p.name + '</span><span class="tp-pts">' + p.score + '</span>';
      container.appendChild(row);
    });
  }
}

function updateTournamentScores(winnerSet, loserSet, voloActive) {
  if (!tournamentActive || tournamentOver) return;

  if (isVincereMode()) {
    // A vincere: accumulate integer points (floor of terzi/3) per team
    var teamScore0 = getTeamScore(0);
    var teamScore1 = getTeamScore(1);
    // Convert terzi to punti interi (drop fractions)
    var puntiTeam0 = Math.floor(teamScore0 / 3);
    var puntiTeam1 = Math.floor(teamScore1 / 3);
    tournamentScores[0] += puntiTeam0;
    tournamentScores[1] += puntiTeam1;
  } else {
    // A perdere: individual penalty points
    for (var i = 0; i < 4; i++) {
      if (winnerSet.has(i) && voloActive) {
        tournamentScores[i] = tournamentScores[i] - 2; // volo: -2 (can go negative)
      } else if (loserSet.has(i)) {
        tournamentScores[i] += 1; // loser: +1
      }
      // winners (non-volo) get 0
    }
  }
  renderTournament();
  // Check if someone reached the limit
  if (isVincereMode()) {
    for (var k = 0; k < 2; k++) {
      if (tournamentScores[k] >= VINCERE_LIMIT) {
        tournamentOver = true;
        break;
      }
    }
  } else {
    for (var j = 0; j < 4; j++) {
      if (tournamentScores[j] >= TOURNAMENT_LIMIT) {
        tournamentOver = true;
        break;
      }
    }
  }
}

// ─── Game State ───────────────────────────────────────────────
let game = null;
var _gameAborted = false; // flag to stop async animations when quitting

// Clean up any in-flight animation elements from the DOM
function cleanupAnimations() {
  _gameAborted = true;
  // Remove all flying card elements that may still be in the body
  document.querySelectorAll('[style*="z-index:50"][style*="position:fixed"]').forEach(function(el) {
    if (el.parentNode === document.body) el.parentNode.removeChild(el);
  });
  // Hide the deck
  hideDeck();
  // Clear hand containers
  var ids = ['player-hand','north-hand','west-hand','east-hand','trick-area'];
  ids.forEach(function(id) { var el = document.getElementById(id); if(el) el.innerHTML = ''; });
}

var _lastGameStarter = -1; // tracks who started the previous game
var _isVeryFirstGame = true; // true only for the very first game of the session

function initGame(startPlayer) {
  const deck = shuffle(createDeck());
  const hands = [[], [], [], []];
  for (let i = 0; i < 40; i++) {
    hands[i % 4].push(deck[i]);
  }
  // Sort each hand by suit then by power
  hands.forEach(h => {
    h.sort((a, b) => {
      if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return RANK_POWER[b.rank] - RANK_POWER[a.rank]; // Strongest first
    });
  });

  // First game: random starter. Subsequent games: next player in cycle.
  var sp;
  if(typeof startPlayer === 'number'){
    sp = startPlayer;
  } else if(_lastGameStarter >= 0){
    sp = (_lastGameStarter + 1) % 4;
  } else {
    sp = Math.floor(Math.random() * 4);
  }
  _lastGameStarter = sp;

  // Reset duration timer
  _gameStartedAt = Date.now();
  _gameElapsedMs = 0;

  game = {
    hands,
    trick: [],
    trickNum: 0,
    leadPlayer: sp,
    currentPlayer: sp,
    leadSuit: null,
    scores: [0, 0, 0, 0],
    trickCards: [],
    phase: 'playing',
    animating: false,
    _buongiocoDecls: [],
    _seenCards: [],          // Hard AI: all cards seen on the table
    _suitVoid: [{},{},{},{}] // Hard AI: tracks which players are void in which suit
  };

  // Adaptive AI: reset observations for new hand
  _resetGameObservation();

  // Apply buongioco (accuse) for a vincere mode
  var decls = applyBuongioco();
  game._buongiocoDecls = decls;
  // Buongioco display will be triggered by the caller via showBuongiocoAndStart()
}

// Show buongioco banners for 5 seconds, then start play (trigger first CPU turn if needed)
// Call this AFTER initGame() + renderAll()
function showBuongiocoAndStart(onReadyCallback) {
  if (!game) return;
  hideBuongiocoBanners();
  if (isVincereMode()) {
    // Block play while buongioco is shown
    game.animating = true;
    renderAll(); // re-render to reflect animating state
    // Show banners after a brief delay so positions are settled
    setTimeout(function() {
      showBuongiocoNotification(game._buongiocoDecls);
      // After display period, unblock and start play
      setTimeout(function() {
        if (!game) return;
        game.animating = false;
        renderAll();
        if (onReadyCallback) onReadyCallback();
      }, BUONGIOCO_DISPLAY_MS);
    }, 400);
  } else {
    // A perdere: no buongioco, start immediately
    if (onReadyCallback) onReadyCallback();
  }
}

// ─── Rendering ────────────────────────────────────────────────

// ─── Deck & Dealing Animation Helpers ─────────────────────────
function getDealerVisualPos() {
  // Determine where the dealer is visually (screen position)
  if (!game) return { x: innerWidth / 2, y: innerHeight / 2 };
  var dealerSeat = game.leadPlayer; // dealer is the lead player at start
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var visualIdx = (dealerSeat - rot + 4) % 4;
  var pos = PLAYER_POS[visualIdx];
  var cx = innerWidth / 2, cy = innerHeight / 2;
  if (pos === 'south') return { x: cx, y: innerHeight - 30 };
  if (pos === 'north') return { x: cx, y: 30 };
  if (pos === 'west')  return { x: 30, y: cy };
  if (pos === 'east')  return { x: innerWidth - 30, y: cy };
  return { x: cx, y: cy };
}

function getViewportSize() {
  var vv = window.visualViewport;
  var width = (vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 360;
  var height = (vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 640;
  return { width: width, height: height };
}

function getPlayerTargetPos(playerIdx) {
  // Get the approximate screen center position for a player's hand area
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var visualIdx = (playerIdx - rot + 4) % 4;
  var pos = PLAYER_POS[visualIdx];
  var viewport = getViewportSize();
  // Use the actual hand container positions from the DOM
  var containerId;
  if (pos === 'south') containerId = 'player-hand';
  else if (pos === 'east') containerId = 'east-hand';
  else if (pos === 'north') containerId = 'north-hand';
  else containerId = 'west-hand';
  var el = document.getElementById(containerId);
  if (el) {
    var r = el.getBoundingClientRect();
    if (r.width > 24 && r.height > 24) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  // Fallback to approximate positions
  var cx = viewport.width / 2, cy = viewport.height / 2;
  if (pos === 'south') return { x: cx, y: viewport.height - 80 };
  if (pos === 'north') return { x: cx, y: 50 };
  if (pos === 'west')  return { x: 50, y: cy };
  if (pos === 'east')  return { x: viewport.width - 50, y: cy };
  return { x: cx, y: cy };
}

function showDeck() {
  var deckEl = document.getElementById('deck-container');
  deckEl.innerHTML = '';

  // Position deck near center of table (always visible)
  var viewport = getViewportSize();
  var cx = Math.round(viewport.width / 2);
  var cy = Math.round(viewport.height / 2);

  // Shift deck to the LEFT side of the table to avoid overlapping central banners
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var dealerVisual = (game.leadPlayer - rot + 4) % 4;
  var pos = PLAYER_POS[dealerVisual];
  var shiftX = 0, shiftY = 0;
  var shiftBase = viewport.width <= 520 ? -120 : -260;
  var shiftVBase = viewport.width <= 520 ? 40 : 80;
  if (pos === 'south') { shiftX = shiftBase; shiftY = shiftVBase; }
  else if (pos === 'north') { shiftX = shiftBase; shiftY = -shiftVBase; }
  else if (pos === 'west') { shiftX = shiftBase; shiftY = 0; }
  else if (pos === 'east') { shiftX = shiftBase; shiftY = 0; }

  var deckW = viewport.width <= 520 ? 50 : viewport.width < 600 ? 70 : 90;
  var deckH = viewport.width <= 520 ? 77 : viewport.width < 600 ? 107 : 138;

  // Prevent clipping into left player (west-hand) on small screens
  var minLeft = viewport.width * 0.22;
  if (cx + shiftX < minLeft) { shiftX = minLeft - cx; }

  var finalX = Math.max(10, Math.min(viewport.width - deckW - 10, cx + shiftX - deckW / 2));
  var finalY = Math.max(10, Math.min(viewport.height - deckH - 10, cy + shiftY - deckH / 2));

  deckEl.style.left = finalX + 'px';
  deckEl.style.top = finalY + 'px';
  deckEl.style.width = deckW + 'px';
  deckEl.style.height = deckH + 'px';
  deckEl.style.display = 'block';

  // Stack of cards (visual deck — 10 layers, one removed per round)
  for (var i = 0; i < 10; i++) {
    var c = document.createElement('div');
    c.className = 'deck-card';
    c.style.width = deckW + 'px';
    c.style.height = deckH + 'px';
    c.style.left = (i * 1) + 'px';
    c.style.top = (-i * 1) + 'px';
    c.style.zIndex = i;
    applyCardBack(c, 'deck-card-img');
    deckEl.appendChild(c);
  }
}

function hideDeck() {
  var deckEl = document.getElementById('deck-container');
  deckEl.style.display = 'none';
  deckEl.innerHTML = '';
}

function getDeckScreenPos() {
  var deckEl = document.getElementById('deck-container');
  var viewport = getViewportSize();
  // Use explicit style values since getBoundingClientRect may fail on newly shown elements
  var left = parseFloat(deckEl.style.left) || viewport.width / 2;
  var top = parseFloat(deckEl.style.top) || viewport.height / 2;
  var w = parseFloat(deckEl.style.width) || 60;
  var h = parseFloat(deckEl.style.height) || 92;
  return { x: left + w / 2, y: top + h / 2 };
}

async function animateDealing(onComplete) {
  if (!game) return;
  _gameAborted = false;
  game.animating = true;

  var viewport = getViewportSize();
  var isMobileView = viewport.width <= 520 || viewport.width <= 900;

  showDeck();

  // Force layout reflow so positions are correct
  await delay(100);

  var deckPos = getDeckScreenPos();
  var targetCardW = 50, targetCardH = 77;
  var deckCardW = viewport.width <= 520 ? 50 : viewport.width < 600 ? 70 : 90;
  var deckCardH = viewport.width <= 520 ? 77 : viewport.width < 600 ? 107 : 138;

  // Save actual hands and replace with empty arrays for progressive dealing
  var actualHands = [
    game.hands[0].slice(),
    game.hands[1].slice(),
    game.hands[2].slice(),
    game.hands[3].slice()
  ];
  game.hands = [[], [], [], []];

  // Build dealing: cards dealt from player after dealer, going clockwise
  var startPlayer = game.leadPlayer;
  var dealtCount = [0, 0, 0, 0];

  // Deal cards: one card per player per round, 10 rounds
  // Within each round, stagger cards for a realistic dealing feel
  var FLIGHT_DURATION = isMobileView ? 133 : 213; // ms for card to fly from deck to hand
  var STAGGER_DELAY = isMobileView ? 43 : 80;     // ms delay between cards within a round
  var ROUND_PAUSE = isMobileView ? 27 : 53;        // ms pause between rounds

  for (var round = 0; round < 10; round++) {
    if (_gameAborted || !game) return; // abort check at start of each round
    var roundPromises = [];

    for (var p = 0; p < 4; p++) {
      var seat = (startPlayer + 1 + p) % 4;
      var cardIdx = dealtCount[seat];
      var actualCard = actualHands[seat][cardIdx];
      dealtCount[seat]++;

      // Capture variables in closure
      (function(seat, actualCard, staggerMs) {
        var pr = new Promise(function(resolve) {
          setTimeout(function() {
            var target = getPlayerTargetPos(seat);

            // Create flying card at deck position with card back image
            var flyCard = document.createElement('div');
            flyCard.style.cssText = 'position:fixed;z-index:50;pointer-events:none;border-radius:6px;' +
              'border:none;box-shadow:2px 4px 10px rgba(0,0,0,0.5);overflow:hidden;background:#f5f5f0;' +
              'width:' + deckCardW + 'px;height:' + deckCardH + 'px;' +
              'left:' + (deckPos.x - deckCardW / 2) + 'px;top:' + (deckPos.y - deckCardH / 2) + 'px;';
            applyCardBack(flyCard, 'card-back-img');
            document.body.appendChild(flyCard);

            // Card sound
            sndCardSlide();

            // Animate flight
            requestAnimationFrame(function() {
              requestAnimationFrame(function() {
                flyCard.style.transition = 'left ' + FLIGHT_DURATION + 'ms ease-in-out, top ' + FLIGHT_DURATION + 'ms ease-in-out, width ' + FLIGHT_DURATION + 'ms ease-in-out, height ' + FLIGHT_DURATION + 'ms ease-in-out';
                flyCard.style.left = (target.x - targetCardW / 2) + 'px';
                flyCard.style.top = (target.y - targetCardH / 2) + 'px';
                flyCard.style.width = targetCardW + 'px';
                flyCard.style.height = targetCardH + 'px';
              });
            });

            // When card arrives, remove it and add to hand
            setTimeout(function() {
              if (flyCard.parentNode) flyCard.parentNode.removeChild(flyCard);
              // Add card to game hand and sort
              game.hands[seat].push(actualCard);
              game.hands[seat].sort(function(a, b) {
                if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
                return RANK_POWER[b.rank] - RANK_POWER[a.rank];
              });
              // Re-render hands to show the new card
              renderPlayerHand();
              renderOpponentHands();
              resolve();
            }, FLIGHT_DURATION + 30);
          }, staggerMs);
        });
        roundPromises.push(pr);
      })(seat, actualCard, p * STAGGER_DELAY);
    }

    // Wait for all 4 cards in this round to arrive
    await Promise.all(roundPromises);

    // Abort check — quit was pressed during dealing
    if (_gameAborted || !game) return;

    // Remove a card from the visual deck to show it shrinking
    var deckEl = document.getElementById('deck-container');
    if (deckEl && deckEl.lastChild) deckEl.removeChild(deckEl.lastChild);

    // Brief pause between rounds
    if (round < 9) await delay(ROUND_PAUSE);

    // Abort check again after delay
    if (_gameAborted || !game) return;
  }

  // Final pause then start game
  await delay(400);
  if (_gameAborted || !game) return;
  hideDeck();
  game.animating = false;
  if (onComplete) onComplete();
}

// ─── Dealer Selection Animation ─────────────────────────────────
// options (optional): { cards: [{suit,rank},...], winnerSeat: N }
// When cards/winnerSeat provided, uses those instead of random selection.
var _dealerBannerActive = false;
var _dealerAnimRunning = false;
function _dismissDealerBanner() {
  _dealerBannerActive = false;
  _dealerAnimRunning = false;
  _gameAborted = true; // stop ongoing async dealer animation
  var bannerEl = document.getElementById('dealer-banner');
  if (bannerEl) bannerEl.classList.remove('show');
  // Remove any leftover flying cards
  var leftover = document.querySelectorAll('.dealer-fly-card');
  for (var i = 0; i < leftover.length; i++) {
    if (leftover[i].parentNode) leftover[i].parentNode.removeChild(leftover[i]);
  }
  // Hide deck if still visible
  hideDeck();
}

function _calcDealerWinner(cards) {
  var NATURAL_POWER = {1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10};
  var winnerSeat = 0;
  var winnerPower = NATURAL_POWER[cards[0].rank];
  for (var w = 1; w < 4; w++) {
    var pw = NATURAL_POWER[cards[w].rank];
    if (pw > winnerPower) {
      winnerSeat = w;
      winnerPower = pw;
    }
  }
  return winnerSeat;
}

async function animateDealerSelection(onComplete, options) {
  _gameAborted = false;
  _dealerAnimRunning = true;
  options = options || {};

  // Hide leftover badges from the previous hand
  var _lsBadge = document.getElementById('lead-suit-badge');
  var _twBadge = document.getElementById('trick-winner-badge');
  if (_lsBadge) _lsBadge.style.display = 'none';
  if (_twBadge) _twBadge.style.display = 'none';
  // Clear trick area
  var _trickArea = document.getElementById('trick-area');
  if (_trickArea) _trickArea.innerHTML = '';
  // Hide turn indicator and trick count
  var _turnInd = document.getElementById('turn-indicator');
  if (_turnInd) _turnInd.style.display = 'none';

  var viewport = getViewportSize();
  var isMobileView = viewport.width <= 520 || viewport.width <= 900;

  // Use predetermined cards or pick random ones
  var selectionCards;
  if (options.cards && options.cards.length === 4) {
    selectionCards = options.cards;
  } else {
    var tempDeck = shuffle(createDeck());
    selectionCards = [tempDeck[0], tempDeck[1], tempDeck[2], tempDeck[3]];
  }

  // We need a temporary game.leadPlayer for showDeck positioning — use seat 0
  var savedGame = game;
  game = { leadPlayer: 0 };
  showDeck();
  game = savedGame;

  await delay(200);

  var deckPos = getDeckScreenPos();
  var deckCardW = viewport.width <= 520 ? 50 : viewport.width < 600 ? 70 : 90;
  var deckCardH = viewport.width <= 520 ? 77 : viewport.width < 600 ? 107 : 138;
  var targetCardW = deckCardW;
  var targetCardH = deckCardH;

  var FLIGHT_DURATION = isMobileView ? 250 : 400;
  var STAGGER_DELAY = isMobileView ? 200 : 350;
  var FLIP_DELAY = 200;

  var flyCards = []; // keep references to remove later

  for (var p = 0; p < 4; p++) {
    if (_gameAborted) return;

    var seat = p;
    var card = selectionCards[seat];
    var target = getPlayerTargetPos(seat);

    // Create flying card at deck position (face down)
    var flyCard = document.createElement('div');
    flyCard.className = 'dealer-fly-card';
    flyCard.style.cssText = 'position:fixed;z-index:50;pointer-events:none;border-radius:6px;' +
      'border:none;box-shadow:2px 4px 10px rgba(0,0,0,0.5);overflow:hidden;background:#f5f5f0;' +
      'width:' + deckCardW + 'px;height:' + deckCardH + 'px;' +
      'left:' + (deckPos.x - deckCardW / 2) + 'px;top:' + (deckPos.y - deckCardH / 2) + 'px;' +
      'transition:none;';
    applyCardBack(flyCard, 'card-back-img');
    document.body.appendChild(flyCard);
    flyCards.push({ el: flyCard, card: card, seat: seat, target: target });

    sndCardSlide();

    // Animate flight to player position
    await new Promise(function(resolve) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          flyCard.style.transition = 'left ' + FLIGHT_DURATION + 'ms ease-in-out, top ' + FLIGHT_DURATION + 'ms ease-in-out, width ' + FLIGHT_DURATION + 'ms ease-in-out, height ' + FLIGHT_DURATION + 'ms ease-in-out';
          flyCard.style.left = (target.x - targetCardW / 2) + 'px';
          flyCard.style.top = (target.y - targetCardH / 2) + 'px';
          flyCard.style.width = targetCardW + 'px';
          flyCard.style.height = targetCardH + 'px';
        });
      });
      setTimeout(resolve, FLIGHT_DURATION + 50);
    });

    if (_gameAborted) return;

    // Flip card: scale to 0, swap content, scale back to 1
    flyCard.style.transition = 'transform ' + FLIP_DELAY + 'ms ease-in';
    flyCard.style.transform = 'scaleX(0)';
    await delay(FLIP_DELAY);

    if (_gameAborted) return;

    // Replace card back with card face
    // NOTE: CARD_DATA has coppe↔bastoni images swapped, so we apply the same correction as main card rendering
    flyCard.innerHTML = '';
    var _imgSuit = card.suit === 'coppe' ? 'bastoni' : card.suit === 'bastoni' ? 'coppe' : card.suit;
    var faceImg = document.createElement('img');
    faceImg.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    faceImg.src = CARD_DATA[_imgSuit + '_' + card.rank];
    faceImg.alt = RANK_NAMES[card.rank] + ' di ' + SUIT_NAMES[card.suit];
    faceImg.draggable = false;
    flyCard.appendChild(faceImg);

    flyCard.style.transition = 'transform ' + FLIP_DELAY + 'ms ease-out';
    flyCard.style.transform = 'scaleX(1)';
    await delay(FLIP_DELAY);

    // Remove a card from visual deck
    var deckEl = document.getElementById('deck-container');
    if (deckEl && deckEl.lastChild) deckEl.removeChild(deckEl.lastChild);

    // Pause between cards
    if (p < 3) await delay(STAGGER_DELAY - FLIGHT_DURATION);
  }

  if (_gameAborted) return;

  // Pause to let players see all 4 cards
  await delay(1500);

  // Determine winner (use provided or calculate)
  var winnerSeat;
  if (typeof options.winnerSeat === 'number') {
    winnerSeat = options.winnerSeat;
  } else {
    winnerSeat = _calcDealerWinner(selectionCards);
  }

  // Clean up: hide deck (keep flying cards visible)
  hideDeck();

  // Show dealer banner on top of the visible cards
  var bannerEl = document.getElementById('dealer-banner');
  var bannerText = document.getElementById('dealer-banner-text');
  var dealerName = PLAYER_NAMES[winnerSeat];
  var winCard = selectionCards[winnerSeat];
  var starterSeat = (winnerSeat + 1) % 4;
  var starterName = PLAYER_NAMES[starterSeat];
  bannerText.innerHTML = '🃏 Mazziere: <span style="color:#fa4">' + dealerName + '</span><br>' +
    '<span style="font-size:0.6em;color:#ccc">' + RANK_NAMES[winCard.rank] + ' di ' + SUIT_NAMES[winCard.suit] + ' — carta più alta</span><br>' +
    '<span style="font-size:0.55em;color:#aaa">Inizia: <b>' + starterName + '</b></span>';
  bannerEl.classList.add('show');
  _dealerBannerActive = true;

  var continueBtn = document.getElementById('dealer-continue-btn');

  // Wait for continue button click
  continueBtn.style.display = '';
  await new Promise(function(resolve) {
    function onContinue() {
      continueBtn.removeEventListener('click', onContinue);
      continueBtn.removeEventListener('touchend', onContinue);
      resolve();
    }
    continueBtn.addEventListener('click', onContinue);
    continueBtn.addEventListener('touchend', onContinue);
  });
  _dealerBannerActive = false;
  _dealerAnimRunning = false;
  bannerEl.classList.remove('show');

  // Now remove flying cards
  for (var fc = 0; fc < flyCards.length; fc++) {
    if (flyCards[fc].el.parentNode) flyCards[fc].el.parentNode.removeChild(flyCards[fc].el);
  }

  if (onComplete) onComplete(winnerSeat);
}

// ─── Card Play Animation ──────────────────────────────────────
function getCardElementInHand(playerIdx, cardId) {
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var visualIdx = (playerIdx - rot + 4) % 4;
  var containerId;
  if (visualIdx === 0) containerId = 'player-hand';
  else if (visualIdx === 1) containerId = 'east-hand';
  else if (visualIdx === 2) containerId = 'north-hand';
  else containerId = 'west-hand';

  var container = document.getElementById(containerId);
  if (!container) return null;
  var cards = container.querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) {
    if (cards[i].dataset && cards[i].dataset.id === cardId) return cards[i];
  }
  // Return last card as fallback for face-down opponents
  return cards.length > 0 ? cards[cards.length - 1] : null;
}

function getTrickTargetPos(playerIdx) {
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var visualIdx = (playerIdx - rot + 4) % 4;
  var area = document.getElementById('trick-area');
  if (!area) return { x: innerWidth / 2, y: innerHeight / 2 };
  var r = area.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var pos = PLAYER_POS[visualIdx];
  if (pos === 'south') return { x: cx, y: r.bottom - 40 };
  if (pos === 'north') return { x: cx, y: r.top + 10 };
  if (pos === 'west') return { x: r.left + 10, y: cy };
  if (pos === 'east') return { x: r.right - 40, y: cy };
  return { x: cx, y: cy };
}

async function animateCardToTrick(playerIdx, card) {
  if (_gameAborted || !game) return;
  var cardEl = getCardElementInHand(playerIdx, card.id);
  if (!cardEl) return;

  var srcRect = cardEl.getBoundingClientRect();
  if (srcRect.width === 0 && srcRect.height === 0) return; // element not visible

  var tgt = getTrickTargetPos(playerIdx);
  var { cw, ch } = getCardSize();
  var isPortraitMobile = innerWidth <= 520 && innerHeight > innerWidth;
  var trickScale = Math.max(0.7, Math.min(1, innerWidth / 768)) * (isPortraitMobile ? 1.3 : 1);
  var tw = Math.round(cw * trickScale);
  var th = Math.round(ch * trickScale);

  // Create a simple flying div that looks like the card back
  var flyCard = document.createElement('div');
  flyCard.style.cssText = 'position:fixed;z-index:50;pointer-events:none;border-radius:6px;' +
    'border:none;box-shadow:2px 4px 12px rgba(0,0,0,0.6);overflow:hidden;background:#f5f5f0;' +
    'width:' + srcRect.width + 'px;height:' + srcRect.height + 'px;' +
    'left:' + srcRect.left + 'px;top:' + srcRect.top + 'px;';

  // If the card was face-up (player's own card), clone its appearance
  if (cardEl.classList.contains('face-up')) {
    flyCard.style.background = 'transparent';
    flyCard.style.border = 'none';
    flyCard.innerHTML = cardEl.innerHTML;
    var innerImg = flyCard.querySelector('img');
    if (innerImg) {
      innerImg.style.width = '100%';
      innerImg.style.height = '100%';
      innerImg.style.objectFit = 'fill';
    }
  } else {
    // face-down card back image
    flyCard.style.border = 'none';
    applyCardBack(flyCard, 'card-back-img');
  }
  document.body.appendChild(flyCard);

  // Hide original card
  cardEl.style.visibility = 'hidden';

  // Play card sound
  sndCardSlide();

  await new Promise(function(resolve) {
    // Double rAF to lock in initial position before animating
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        flyCard.style.transition = 'left 0.35s ease-out, top 0.35s ease-out, width 0.35s ease-out, height 0.35s ease-out';
        flyCard.style.left = (tgt.x - tw / 2) + 'px';
        flyCard.style.top = (tgt.y - th / 2) + 'px';
        flyCard.style.width = tw + 'px';
        flyCard.style.height = th + 'px';
      });
    });
    setTimeout(function() {
      if (flyCard.parentNode) flyCard.parentNode.removeChild(flyCard);
      resolve();
    }, 400);
  });
}

function renderAll() {
  if (!game) return;
  renderPlayerHand();
  renderOpponentHands();
  renderTrick();
  renderScores();
  renderLabels();
  document.getElementById('trick-count').textContent = `Mano ${game.trickNum} / 10`;
  // Turn timer (no banner, just timer logic)
  if(game.phase==='playing' && !game.animating){
    var cp = game.currentPlayer;
    // Start turn timer if it's a new HUMAN player's turn (delayed to let CPU resolve first)
    if(_turnTimerPlayer !== cp && isHumanSeat(cp) && !game.animating) {
      clearTimeout(window._turnTimerDelay);
      window._turnTimerDelay = setTimeout(function(){
        if(game && game.currentPlayer === cp && game.phase === 'playing' && !game.animating){
          startTurnTimer();
        }
      }, 600);
    }
  } else {
    stopTurnTimer();
  }
}

function getCardSize() {
  const w = innerWidth;
  const h = innerHeight;
  // Use both dimensions so cards shrink when window gets smaller in any direction
  const baseW = w * 0.1176;
  const baseH = h * 0.1512;
  const cw = Math.round(Math.max(36, Math.min(109, Math.min(baseW, baseH))));
  const ch = Math.round(cw * 1.54);
  return { cw, ch };
}

function renderPlayerHand() {
  const container = document.getElementById('player-hand');
  container.innerHTML = '';
  if (!game) return;
  // In multiplayer, show MY seat's hand (host=0, client=1)
  const myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  if(myIdx < 0 || myIdx > 3 || !game.hands[myIdx]) {
    dbg('[RENDER] renderPlayerHand SKIP: myIdx='+myIdx+' mySeat='+mySeat+' isHost='+isHost);
    return;
  }
  const hand = game.hands[myIdx];
  const total = hand.length;
  const { cw, ch } = getCardSize();
  const maxHandWidth = Math.min(innerWidth - 20, 1200);
  const overlap = Math.min(cw * 0.72, maxHandWidth / Math.max(total, 1));
  const totalW = (total - 1) * overlap + cw;
  const startX = (maxHandWidth - totalW) / 2;

  container.style.width = maxHandWidth + 'px';
  container.style.left = '50%';
  container.style.transform = 'translateX(-50%)';

  hand.forEach((card, i) => {
    const el = createCardElement(card, true);
    el.style.width = cw + 'px';
    el.style.height = ch + 'px';
    el.style.left = (startX + i * overlap) + 'px';
    el.style.bottom = '0px';
    el.style.position = 'absolute';
    el.style.zIndex = i;

    // Check if card is playable — use my seat index
    if (game.currentPlayer === myIdx && game.phase === 'playing' && !game.animating) {
      const playable = isCardPlayable(myIdx, card);
      if (playable) {
        el.classList.add('playable');
        el._cardTouchFired = false;
        const playHandler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Guard: prevent double-play from touch+click or rapid taps
          if (_humanPlayLock) return;
          if (!game || game.currentPlayer !== myIdx || game.phase !== 'playing' || game.animating) return;
          // Prevent touch+click double-fire: if touchend fired, skip the click
          if (e.type === 'touchend') { el._cardTouchFired = true; }
          if (e.type === 'click' && el._cardTouchFired) return;
          _humanPlayLock = true;
          // Disable all playable cards immediately
          document.querySelectorAll('#player-hand .playable').forEach(function(c){ c.onclick=null; c.classList.remove('playable'); });
          if (mpMode && !isHost) {
            dbg('CLIENT click card='+card.id+' cp='+game.currentPlayer+' phase='+game.phase);
            el.style.opacity = '0.5';
            mpSend({t:'play', cardId: card.id});
            // Safety: if no response in 5s, show connection issue and retry
            setTimeout(function(){
              if(game && game.currentPlayer === myIdx && game.phase === 'playing'){
                _discPlayRetryCount++;
                _humanPlayLock = false;
                dbg('CLIENT: play timeout #'+_discPlayRetryCount+', re-rendering hand');
                if(_discPlayRetryCount >= 2) {
                  _showDiscBanner('⚠️ Nessuna risposta dall\'host', 1, 'Verifica connessione in corso...');
                }
                renderPlayerHand();
              }
            }, 5000);
          } else {
            // Host or single-player: play directly
            playCard(myIdx, card);
          }
        };
        el.onclick = playHandler;
        el.addEventListener('touchend', playHandler, { passive: false });
      }
    }
    container.appendChild(el);
  });
}

function renderOpponentHands() {
  if (!game) return;
  const w = innerWidth;
  const base = Math.min(w, innerHeight * 0.8);
  const oppW = Math.round(Math.max(46, Math.min(82, base * 0.108)));
  const oppH = Math.round(oppW * 1.5);
  const northGap = Math.round(Math.max(22, Math.min(46, base * 0.06)));
  const sideGap = Math.round(Math.max(17, Math.min(34, base * 0.043)));

  // Seat mapping: in MP client mode, remap who goes where visually
  // Host (or single-player): south=0 east=1 north=2 west=3
  // Client: south=1 east=2 north=3 west=0  (rotate by 1)
  const rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  const seatAt = function(pos) { return (pos + rot) % 4; };
  // Opponents are east(1), north(2), west(3) in visual positions
  const eastSeat = seatAt(1);
  const northSeat = seatAt(2);
  const westSeat = seatAt(3);

  // North
  const northEl = document.getElementById('north-hand');
  northEl.innerHTML = '';
  const nCards = game.hands[northSeat].length;
  for (let i = 0; i < nCards; i++) {
    const el = createCardElement(game.hands[northSeat][i], false);
    el.style.position = 'absolute';
    el.style.width = oppW + 'px';
    el.style.height = oppH + 'px';
    el.style.left = (i * northGap) + 'px';
    el.style.top = '0';
    el.style.zIndex = i;
    northEl.appendChild(el);
  }
  northEl.style.width = (nCards > 0 ? (nCards - 1) * northGap + oppW : 0) + 'px';

  // West
  const westEl = document.getElementById('west-hand');
  westEl.innerHTML = '';
  const wCards = game.hands[westSeat].length;
  for (let i = 0; i < wCards; i++) {
    const el = createCardElement(game.hands[westSeat][i], false);
    el.style.position = 'absolute';
    el.style.width = oppW + 'px';
    el.style.height = oppH + 'px';
    el.style.left = '0';
    el.style.top = (i * sideGap) + 'px';
    el.style.zIndex = i;
    el.style.transform = 'rotate(90deg)';
    westEl.appendChild(el);
  }
  westEl.style.height = (wCards > 0 ? (wCards - 1) * sideGap + oppH : 0) + 'px';

  // East
  const eastEl = document.getElementById('east-hand');
  eastEl.innerHTML = '';
  const eCards = game.hands[eastSeat].length;
  for (let i = 0; i < eCards; i++) {
    const el = createCardElement(game.hands[eastSeat][i], false);
    el.style.position = 'absolute';
    el.style.width = oppW + 'px';
    el.style.height = oppH + 'px';
    el.style.left = '0';
    el.style.top = (i * sideGap) + 'px';
    el.style.zIndex = i;
    el.style.transform = 'rotate(-90deg)';
    eastEl.appendChild(el);
  }
  eastEl.style.height = (eCards > 0 ? (eCards - 1) * sideGap + oppH : 0) + 'px';
}

function renderTrick() {
  const area = document.getElementById('trick-area');
  area.innerHTML = '';
  if (!game) return;
  const { cw, ch } = getCardSize();
  // Portrait mobile: boost trick card size by 30%
  const isPortraitMobile = innerWidth <= 520 && innerHeight > innerWidth;
  const trickScale = Math.max(0.7, Math.min(1, innerWidth / 768)) * (isPortraitMobile ? 1.3 : 1);
  const tw = Math.round(cw * trickScale);
  const th = Math.round(ch * trickScale);
  // Remap visual positions for client
  const rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  game.trick.forEach(({ playerIdx, card }) => {
    const el = createCardElement(card, true);
    const visualIdx = (playerIdx - rot + 4) % 4;
    el.className += ' trick-card pos-' + PLAYER_POS[visualIdx];
    el.style.position = 'absolute';
    el.style.width = tw + 'px';
    el.style.height = th + 'px';
    area.appendChild(el);
  });

  // Lead-suit badge
  const badge = document.getElementById('lead-suit-badge');
  const trickWinnerBadge = document.getElementById('trick-winner-badge');
  if(badge) {
    if(game.trick.length > 0) {
      const suitColors  = {coppe:'#e44', denari:'#e44', bastoni:'#aaa', spade:'#aaa'};
      const leadSuit = game.trick[0].card.suit;
      const SUIT_NAMES_IT = {coppe:'Coppe', denari:'Denari', bastoni:'Bastoni', spade:'Spade'};
      badge.textContent = 'giocata di ' + (SUIT_NAMES_IT[leadSuit] || leadSuit);
      badge.style.color = suitColors[leadSuit] || '#fff';
      badge.style.display = 'block';

      // Trick winner badge: who is currently winning the trick + points
      let bestIdx = 0;
      let bestPower = -1;
      game.trick.forEach(({ playerIdx, card }, i) => {
        if (card.suit === leadSuit && RANK_POWER[card.rank] > bestPower) {
          bestPower = RANK_POWER[card.rank];
          bestIdx = i;
        }
      });
      const currentWinner = game.trick[bestIdx].playerIdx;
      const myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
      let currentPts = 0;
      game.trick.forEach(({ card }) => { currentPts += RANK_POINTS[card.rank]; });
      // Add last trick bonus if this is trick 10 and all 4 cards are played
      if (game.trickNum === 9 && game.trick.length === 4) currentPts += 3;
      const winnerName = currentWinner === myIdx ? 'Prendi tu' : 'Prende ' + PLAYER_NAMES[currentWinner];
      const ptsLabel = currentPts > 0 ? ' (+' + formatPunti(currentPts) + ')' : ' (0)';
      trickWinnerBadge.textContent = '▶ ' + winnerName + ptsLabel;
      trickWinnerBadge.style.display = 'block';
    } else {
      badge.textContent = '';
      badge.style.display = 'none';
      trickWinnerBadge.textContent = '';
      trickWinnerBadge.style.display = 'none';
    }
  }
}

function renderScores() {
  const container = document.getElementById('score-rows');
  container.innerHTML = '';
  if (!game) return;
  const isPerdere = gameMode === 'perdere';
  // Show game mode in score panel title
  document.getElementById('score-title').textContent = isPerdere ? '🔻 A PERDERE' : '🔺 A VINCERE (coppie)';
  const myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;

  if (!isPerdere) {
    // ── A VINCERE: show team scores ──
    var myTeam = getPlayerTeam(myIdx);
    var teams = [0,1].map(t => ({ idx: t, score: getTeamScore(t), name: getTeamName(t) }));
    teams.sort((a, b) => b.score - a.score); // highest first
    teams.forEach((t, rank) => {
      const row = document.createElement('div');
      row.className = 'score-row' + (t.idx === myTeam ? ' you' : '');
      row.innerHTML = `<span class="sr-name">${rank + 1}° ${t.name}</span><span class="sr-pts">${formatPunti(t.score)}</span>`;
      container.appendChild(row);
    });
    return;
  }

  // Build player list with scores
  const players = game.scores.map((s, i) => ({ idx: i, score: s, name: PLAYER_NAMES[i] }));

  // Classify each player into ranking groups for correct ordering:
  //   Group 0 = winners (safe), Group 1 = losers (<1pt), Group 2 = losers (max score)
  // Handle volo: if bottom 3 sum < 3 punti (9 terzi), max scorer wins instead
  const MIN_PUNTO = 3;
  const maxScore = Math.max(...game.scores);
  const tempSorted = players.slice().sort((a, b) => a.score - b.score);
  // Bottom 3 = the 3 players with the LEAST points (excluding the top scorer)
  const bottomThreeSum = tempSorted[0].score + tempSorted[1].score + tempSorted[2].score;
  const isVolo = bottomThreeSum < 9;

  players.forEach(p => {
    if (isVolo) {
      // Volo: max scorer wins, <1pt losers, rest are safe
      if (p.score === maxScore) p.rankGroup = 0;
      else if (p.score >= MIN_PUNTO) p.rankGroup = 1;
      else p.rankGroup = 2;
    } else {
      // Normal: safe players first, then <1pt losers, then max-score losers
      if (p.score >= MIN_PUNTO && p.score < maxScore) p.rankGroup = 0;
      else if (p.score < MIN_PUNTO) p.rankGroup = 1;
      else p.rankGroup = 2; // max score
    }
  });

  // Sort: by group first, then by score ascending within each group
  players.sort((a, b) => {
    if (a.rankGroup !== b.rankGroup) return a.rankGroup - b.rankGroup;
    return a.score - b.score;
  });

  players.forEach((p, rank) => {
    const row = document.createElement('div');
    row.className = 'score-row' + (p.idx === myIdx ? ' you' : '');
    row.innerHTML = `<span class="sr-name">${rank + 1}° ${p.name}</span><span class="sr-pts">${formatPunti(p.score)}</span>`;
    container.appendChild(row);
  });
}

// ═══ Turn Timer: countdown + CPU auto-play after 30s ═══
// Only shows timer for HUMAN players (CPU plays instantly, no timer needed)
var _turnTimerStart = 0;
var _turnTimerPlayer = -1;
var _turnTimerInterval = null;
var TURN_TIMEOUT = 30; // seconds

function startTurnTimer() {
  stopTurnTimer();
  if(!game || game.phase !== 'playing' || game.animating) return;
  var cp = game.currentPlayer;
  // Only start timer for human seats
  if(!isHumanSeat(cp)) return;
  _turnTimerStart = Date.now();
  _turnTimerPlayer = cp;
  _turnTimerInterval = setInterval(function(){
    if(!game || game.phase !== 'playing' || game.currentPlayer !== _turnTimerPlayer || game.animating){
      stopTurnTimer();
      return;
    }
    var elapsed = (Date.now() - _turnTimerStart) / 1000;
    var remaining = Math.ceil(TURN_TIMEOUT - elapsed);
    // Update the active player's label with countdown
    updateTurnCountdown(_turnTimerPlayer, remaining);
    // Time's up — CPU plays on behalf
    if(remaining <= 0){
      var seat = _turnTimerPlayer;
      stopTurnTimer();
      // Only the host (or single-player) executes the auto-play
      if(isHost || !mpMode){
        dbg('TURN TIMEOUT: CPU auto-play for seat='+seat);
        var playable = getPlayableCards(seat);
        if(playable.length > 0){
          var card = cpuSelectCard(seat, playable);
          dbg('TURN TIMEOUT: playing card='+card.id);
          playCard(seat, card);
        }
      }
    }
  }, 1000);
}

function stopTurnTimer() {
  if(_turnTimerInterval){ clearInterval(_turnTimerInterval); _turnTimerInterval = null; }
  _turnTimerPlayer = -1;
}

function updateTurnCountdown(playerIdx, sec) {
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  var visualIdx = (playerIdx - rot + 4) % 4;
  var label = document.getElementById('label-' + PLAYER_POS[visualIdx]);
  if(!label) return;
  var color = sec <= 10 ? '#f44' : sec <= 20 ? '#fa4' : '#aaa';
  var scoreValue = isVincereMode() ? formatPunti(getTeamScore(getPlayerTeam(playerIdx))) : formatPunti(game.scores[playerIdx]);
  label.innerHTML = PLAYER_NAMES[playerIdx] + ' <span class="lb-pts">' + scoreValue + '</span>' +
    ' <span style="color:'+color+';font-size:clamp(8px,1.8vw,10px)">'+sec+'s</span>';
}

function renderLabels() {
  if (!game) return;
  const rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  for (let v = 0; v < 4; v++) {
    const actual = (v + rot) % 4;
    const label = document.getElementById('label-' + PLAYER_POS[v]);
    var roleBadge = '';
    if (mpMode && actual === mySeat) {
      roleBadge = isHost
        ? ' <span class="host-badge">[HOST]</span>'
        : ' <span class="client-badge">[CLIENT]</span>';
    }
    if (isVincereMode()) {
      var teamIdx = getPlayerTeam(actual);
      label.innerHTML = PLAYER_NAMES[actual] + roleBadge + ' <span class="lb-pts">' + formatPunti(getTeamScore(teamIdx)) + '</span>';
    } else {
      label.innerHTML = PLAYER_NAMES[actual] + roleBadge + ' <span class="lb-pts">' + formatPunti(game.scores[actual]) + '</span>';
    }
    label.classList.toggle('active-turn', game.currentPlayer === actual && game.phase === 'playing' && !game.animating);
  }
}

// ─── Game Logic ───────────────────────────────────────────────
function isCardPlayable(playerIdx, card) {
  if (game.trick.length === 0) return true; // Leading: anything
  const leadSuit = game.trick[0].card.suit;
  const hand = game.hands[playerIdx];
  const hasSuit = hand.some(c => c.suit === leadSuit);
  if (hasSuit) return card.suit === leadSuit; // Must follow suit
  return true; // Can play anything
}

function getPlayableCards(playerIdx) {
  return game.hands[playerIdx].filter(c => isCardPlayable(playerIdx, c));
}

function evaluateTrick() {
  const leadSuit = game.trick[0].card.suit;
  let winnerIdx = 0;
  let bestPower = -1;
  game.trick.forEach(({ playerIdx, card }, i) => {
    if (card.suit === leadSuit && RANK_POWER[card.rank] > bestPower) {
      bestPower = RANK_POWER[card.rank];
      winnerIdx = i;
    }
  });
  return game.trick[winnerIdx].playerIdx;
}

function trickPoints() {
  let pts = 0;
  game.trick.forEach(({ card }) => {
    pts += RANK_POINTS[card.rank];
  });
  return pts;
}

// ─── Play a card ──────────────────────────────────────────────
var _humanPlayLock = false;
async function playCard(playerIdx, card) {
  if (!game || game.animating || game.phase !== 'playing') return;
  // Guard: must be current player's turn
  if (playerIdx !== game.currentPlayer) { _humanPlayLock = false; return; }
  // Guard: card must still be in hand
  if (!game.hands[playerIdx].some(function(c){ return c.id === card.id; })) { _humanPlayLock = false; return; }

  // Animate card flying to trick area before removing from hand
  await animateCardToTrick(playerIdx, card);
  if (!game) return; // quit during animation

  // Remove from hand
  const hand = game.hands[playerIdx];
  const idx = hand.findIndex(c => c.id === card.id);
  if (idx < 0) return;
  hand.splice(idx, 1);

  // Add to trick
  game.trick.push({ playerIdx, card });

  // Adaptive AI: observe human play patterns (track in all modes for skill badge)
  _observeHumanPlay(playerIdx, card);

  // Hard AI: track seen cards and suit voids
  if (game._seenCards) game._seenCards.push({suit: card.suit, rank: card.rank});
  if (game._suitVoid && game.trick.length > 1) {
    var leadS = game.trick[0].card.suit;
    if (card.suit !== leadS) {
      game._suitVoid[playerIdx][leadS] = true;
    }
  }

  // Scardone removed

  // Play card sound
  sndCardPlay();

  // Release human play lock after card is committed
  _humanPlayLock = false;

  const trickComplete = game.trick.length === 4;
  if (trickComplete) {
    game.animating = true;
  }

  // Render — and sync state so client sees the card in the trick
  renderAll();
  if(mpMode && isHost) syncState();

  // Check if trick is complete
  if (trickComplete) {
    await delay(800);
    if (!game) return;

    const winner = evaluateTrick();
    let pts = trickPoints();

    // Last trick bonus
    game.trickNum++;
    if (game.trickNum === 10) pts += 3; // 3 terzi (1 punto) for last trick

    game.scores[winner] += pts;

    // Trick win sound
    sndTrickWon();

    game.trickCards = game.trick.map(t => t.card);
    if(mpMode && isHost) syncState();

    await delay(1400);
    if (!game) return;
    game.leadPlayer = winner;
    game.currentPlayer = winner;
    game.animating = false;

    // Check end
    if (game.trickNum >= 10) {
      game.phase = 'done';
      renderAll();
      if(mpMode && isHost) {
        var finalState = syncState();
        mpSend({t:'final', seq:finalState.seq, state:finalState});
        setTimeout(function(){
          if(mpMode && isHost && game && game.phase === 'done'){
            var retryFinalState = syncState();
            mpSend({t:'final', seq:retryFinalState.seq, state:retryFinalState});
          }
        }, 350);
      }
      await delay(500);
      if (!game) return;
      showGameOver();
      return;
    }

    // Clear trick
    game.trick = [];

    renderAll();
    if(mpMode && isHost) syncState();

    // If next player is CPU, trigger AI
    if (!isHumanSeat(game.currentPlayer)) {
      cpuTurn();
    }
  } else {
    // Next player
    game.currentPlayer = (game.currentPlayer + 1) % 4;
    renderAll();
    if(mpMode && isHost) syncState();

    // If CPU turn, trigger AI
    if (!isHumanSeat(game.currentPlayer)) {
      cpuTurn();
    }
  }
}
