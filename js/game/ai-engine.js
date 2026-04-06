// ─── CPU AI ───────────────────────────────────────────────────
async function cpuTurn() {
  if (!game || isHumanSeat(game.currentPlayer) || game.phase !== 'playing') return;

  game.animating = true;
  await delay(500 + Math.random() * 400);
  if (!game) return; // quit during delay
  // Re-check: a human player may have joined this seat during the delay
  if (isHumanSeat(game.currentPlayer)) {
    game.animating = false;
    renderAll();
    if(mpMode && isHost) syncState(true);
    return;
  }
  game.animating = false;

  const playerIdx = game.currentPlayer;
  const playable = getPlayableCards(playerIdx);
  if (playable.length === 0) return; // shouldn't happen

  const card = cpuSelectCard(playerIdx, playable);
  await playCard(playerIdx, card);
}

function cpuSelectCard(playerIdx, playable) {
  if (cpuDifficulty === 'facile') return cpuSelectEasy(playerIdx, playable);
  if (cpuDifficulty === 'difficile') return cpuSelectHard(playerIdx, playable);
  if (cpuDifficulty === 'adattivo') return cpuSelectAdaptive(playerIdx, playable);
  // medio (default) — original logic
  if (gameMode === 'vincere') return cpuSelectCardVincere(playerIdx, playable);
  return cpuSelectCardPerdere(playerIdx, playable);
}

// ═══════════════════════════════════════════════════════════════
//  AI FACILE — plays almost randomly, slight bias to follow suit
// ═══════════════════════════════════════════════════════════════
function cpuSelectEasy(playerIdx, playable) {
  // 70% of the time play a random card
  if (Math.random() < 0.7) return playable[Math.floor(Math.random() * playable.length)];
  // 30% of the time use medium logic
  if (gameMode === 'vincere') return cpuSelectCardVincere(playerIdx, playable);
  return cpuSelectCardPerdere(playerIdx, playable);
}

// ═══════════════════════════════════════════════════════════════
//  AI MEDIO — original balanced logic (A Perdere / A Vincere)
// ═══════════════════════════════════════════════════════════════

// ─── AI: A Perdere (avoid taking points) ──────────────────────
function cpuSelectCardPerdere(playerIdx, playable) {
  var suitCounts = {};
  game.hands[playerIdx].forEach(function(c) { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });

  if (game.trick.length === 0) {
    // LEAD: Create voids by playing from shortest suits first
    // Prefer 0-point cards, then low-power cards, from short suits
    var candidates = playable.map(function(c) {
      var pts = RANK_POINTS[c.rank];
      var sLen = suitCounts[c.suit] || 0;
      // Lower score = better: prefer zero points, short suits, low power
      var score = (pts * 10) + (sLen * 3) + RANK_POWER[c.rank];
      // Avoid leading Aces (3 pts danger)
      if (c.rank === 1) score += 15;
      return {card: c, score: score};
    });
    candidates.sort(function(a,b){ return a.score - b.score; });
    return candidates[0].card;
  }

  const leadSuit = game.trick[0].card.suit;
  const following = playable.filter(c => c.suit === leadSuit);
  if (following.length > 0) {
    let bestPower = -1;
    game.trick.forEach(({ card }) => {
      if (card.suit === leadSuit && RANK_POWER[card.rank] > bestPower) bestPower = RANK_POWER[card.rank];
    });
    const under = following.filter(c => RANK_POWER[c.rank] < bestPower);
    const over = following.filter(c => RANK_POWER[c.rank] > bestPower);
    if (under.length > 0) {
      // Undershoot: play just below the winner, dump highest-point under card
      // If the trick already has high points, prioritize dumping Aces/figures
      var trickPts = 0;
      game.trick.forEach(function(t){ trickPts += RANK_POINTS[t.card.rank]; });
      if (trickPts >= 3) {
        // High-value trick — dump our highest point card safely
        under.sort((a, b) => {
          const pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
          if (pa !== pb) return pb - pa; // dump Aces and figures first
          return RANK_POWER[b.rank] - RANK_POWER[a.rank];
        });
      } else {
        // Normal undershoot — play just below to preserve low cards
        under.sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
      }
      return under[0];
    }
    // Must go over — play lowest power, lowest points
    over.sort((a, b) => {
      const pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
      if (pa !== pb) return pa - pb;
      return RANK_POWER[a.rank] - RANK_POWER[b.rank];
    });
    return over[0];
  }
  // Void: dump highest-point cards (Aces first, then figures)
  playable.sort((a, b) => {
    const pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
    if (pa !== pb) return pb - pa;
    return RANK_POWER[b.rank] - RANK_POWER[a.rank];
  });
  return playable[0];
}

// ─── AI: A Vincere (try to take points) ───────────────────────
function cpuSelectCardVincere(playerIdx, playable) {
  if (game.trick.length === 0) {
    const suitCounts = {};
    game.hands[playerIdx].forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
    playable.sort((a, b) => {
      const ca = suitCounts[a.suit] || 0, cb = suitCounts[b.suit] || 0;
      if (ca !== cb) return cb - ca;
      return RANK_POWER[b.rank] - RANK_POWER[a.rank];
    });
    const strong = playable.filter(c => RANK_POWER[c.rank] >= 8);
    if (strong.length > 0) {
      strong.sort((a, b) => {
        const ca = suitCounts[a.suit] || 0, cb = suitCounts[b.suit] || 0;
        if (ca !== cb) return cb - ca;
        return RANK_POWER[b.rank] - RANK_POWER[a.rank];
      });
      return strong[0];
    }
    return playable[0];
  }

  const leadSuit = game.trick[0].card.suit;
  const following = playable.filter(c => c.suit === leadSuit);

  if (following.length > 0) {
    let bestPower = -1;
    game.trick.forEach(({ card }) => {
      if (card.suit === leadSuit && RANK_POWER[card.rank] > bestPower) bestPower = RANK_POWER[card.rank];
    });
    const over = following.filter(c => RANK_POWER[c.rank] > bestPower);
    const under = following.filter(c => RANK_POWER[c.rank] < bestPower);

    let trickPts = 0;
    game.trick.forEach(({ card }) => { trickPts += RANK_POINTS[card.rank]; });

    if (over.length > 0 && trickPts > 0) {
      over.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);
      return over[0];
    }
    if (over.length > 0 && game.trick.length === 3) {
      over.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);
      return over[0];
    }
    if (under.length > 0) {
      under.sort((a, b) => {
        const pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pa - pb;
        return RANK_POWER[a.rank] - RANK_POWER[b.rank];
      });
      return under[0];
    }
    over.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);
    return over[0];
  }

  playable.sort((a, b) => {
    const pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
    if (pa !== pb) return pa - pb;
    return RANK_POWER[a.rank] - RANK_POWER[b.rank];
  });
  return playable[0];
}

// ═══════════════════════════════════════════════════════════════
//  AI DIFFICILE — card counting, prediction, advanced strategy
// ═══════════════════════════════════════════════════════════════
function _hardGetUnseen(playerIdx) {
  // All 40 cards minus what CPU can see: own hand + all seen cards on trick/past tricks
  var seen = {};
  (game._seenCards || []).forEach(function(c){ seen[c.suit+'_'+c.rank] = true; });
  game.hands[playerIdx].forEach(function(c){ seen[c.suit+'_'+c.rank] = true; });
  // Current trick cards too
  game.trick.forEach(function(t){ seen[t.card.suit+'_'+t.card.rank] = true; });
  var unseen = [];
  SUITS.forEach(function(s){
    for(var r = 1; r <= 10; r++){
      if(!seen[s+'_'+r]) unseen.push({suit:s, rank:r});
    }
  });
  return unseen;
}

function _hardCountUnseenSuit(playerIdx, suit) {
  return _hardGetUnseen(playerIdx).filter(function(c){ return c.suit === suit; }).length;
}

function _hardHighestUnseenPower(playerIdx, suit) {
  var unseen = _hardGetUnseen(playerIdx).filter(function(c){ return c.suit === suit; });
  if(unseen.length === 0) return -1;
  return Math.max.apply(null, unseen.map(function(c){ return RANK_POWER[c.rank]; }));
}

function _hardIsPlayerVoid(pIdx, suit) {
  return game._suitVoid && game._suitVoid[pIdx] && game._suitVoid[pIdx][suit];
}

function _hardCanWinSafe(card, playerIdx) {
  // Check if this card would likely win: is it the highest remaining power in its suit?
  var unseen = _hardGetUnseen(playerIdx).filter(function(c){ return c.suit === card.suit; });
  var higherUnseen = unseen.filter(function(c){ return RANK_POWER[c.rank] > RANK_POWER[card.rank]; });
  return higherUnseen.length === 0;
}

function cpuSelectHard(playerIdx, playable) {
  if (gameMode === 'vincere') return _hardVincere(playerIdx, playable);
  return _hardPerdere(playerIdx, playable);
}

function _hardPerdere(playerIdx, playable) {
  var myHand = game.hands[playerIdx];
  var suitCounts = {};
  myHand.forEach(function(c){ suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  var trickNum = game.trickNum || 0;
  var isLastTrick = (trickNum >= 9);
  var cardsLeftInHand = myHand.length;

  // ── HELPER: count total points in a set of cards ──
  function _sumPoints(cards) {
    return cards.reduce(function(s,c){ return s + RANK_POINTS[c.rank]; }, 0);
  }

  // ── HELPER: find how many aces remain unseen ──
  function _countUnseenAces() {
    var unseen = _hardGetUnseen(playerIdx);
    return unseen.filter(function(c){ return c.rank === 1; }).length;
  }

  // ── HELPER: does hand contain ONLY high cards in a suit (dangerous) ──
  function _isTrappedInSuit(suit) {
    var mySuitCards = myHand.filter(function(c){ return c.suit === suit; });
    if (mySuitCards.length === 0) return false;
    var lowestPower = Math.min.apply(null, mySuitCards.map(function(c){ return RANK_POWER[c.rank]; }));
    var unseenLower = _hardGetUnseen(playerIdx).filter(function(c){
      return c.suit === suit && RANK_POWER[c.rank] < lowestPower;
    });
    return unseenLower.length === 0; // all remaining are below us = we'll always win = BAD
  }

  // ── HELPER: count my "safe" cards (low power scartine) in a suit ──
  function _safeCardsInSuit(suit) {
    return myHand.filter(function(c){
      return c.suit === suit && RANK_POWER[c.rank] <= 3; // 4,5,6,7
    }).length;
  }

  // ═══════════════════════ LEADING ═══════════════════════
  if (game.trick.length === 0) {
    // STRATEGY 1: Create voids - play singleton from short suits to become void
    // Being void lets you dump Aces (3pts!) and figures on others' tricks
    var singletons = playable.filter(function(c) {
      return (suitCounts[c.suit] || 0) === 1;
    });
    if (singletons.length > 0) {
      // Prefer to void suits where we don't hold low safe cards
      // But DON'T lead a singleton Ace (3 pts!) if someone can undershoot — better to void a figure
      var safeSingletons = singletons.filter(function(c) { return c.rank !== 1; });
      var target = safeSingletons.length > 0 ? safeSingletons : singletons;
      target.sort(function(a,b){
        // Prefer: low-point, low-power singletons
        var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pa - pb;
        return RANK_POWER[a.rank] - RANK_POWER[b.rank];
      });
      return target[0];
    }

    // STRATEGY 2: Lead from short suits (doubletons) to create voids fast
    var doubletons = playable.filter(function(c) {
      return (suitCounts[c.suit] || 0) === 2;
    });
    if (doubletons.length > 0) {
      // From doubletons, lead the LOWER card first
      doubletons.sort(function(a,b){
        var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pa - pb;
        return RANK_POWER[a.rank] - RANK_POWER[b.rank];
      });
      // Avoid leading from a doubleton where we'd win (we're top card in that suit)
      var safeDubl = doubletons.filter(function(c){ return !_hardCanWinSafe(c, playerIdx); });
      if (safeDubl.length > 0) return safeDubl[0];
    }

    // STRATEGY 3: Avoid leading suits where we're "trapped" (all remaining cards are below ours)
    // STRATEGY 4: Prefer leading scartine (0-point cards) from suits with safe low cards
    var candidates = playable.map(function(c) {
      var isTop = _hardCanWinSafe(c, playerIdx);
      var trapped = _isTrappedInSuit(c.suit);
      var pts = RANK_POINTS[c.rank];
      var sLen = suitCounts[c.suit] || 0;
      var unseenInSuit = _hardCountUnseenSuit(playerIdx, c.suit);
      var safeCards = _safeCardsInSuit(c.suit);

      // Lower score = better to lead
      var score = 0;
      score += pts * 12;               // strongly avoid leading point cards
      score += RANK_POWER[c.rank] * 1; // prefer low power
      score += isTop ? 25 : 0;         // big penalty for leading the top card (we'll win the trick)
      score += trapped ? 20 : 0;       // penalty for suits where we're trapped
      score -= safeCards * 3;           // bonus if we have safe low cards in this suit
      score += (unseenInSuit === 0) ? 18 : 0;  // penalty if no unseen cards (we'll win everything)
      score -= (sLen <= 2) ? 6 : 0;    // bonus for short suits (will create void faster)
      // Late game: avoid being last trick winner — lead from suits with many unseen
      if (isLastTrick) score += isTop ? 30 : 0;
      return {card: c, score: score};
    });
    candidates.sort(function(a,b){ return a.score - b.score; });
    return candidates[0].card;
  }

  // ═══════════════════════ FOLLOWING SUIT ═══════════════════════
  var leadSuit = game.trick[0].card.suit;
  var following = playable.filter(function(c){ return c.suit === leadSuit; });

  if (following.length > 0) {
    var bestPower = -1;
    var currentWinnerIdx = -1;
    game.trick.forEach(function(t){
      if (t.card.suit === leadSuit && RANK_POWER[t.card.rank] > bestPower) {
        bestPower = RANK_POWER[t.card.rank];
        currentWinnerIdx = t.playerIdx;
      }
    });

    var under = following.filter(function(c){ return RANK_POWER[c.rank] < bestPower; });
    var over = following.filter(function(c){ return RANK_POWER[c.rank] > bestPower; });
    var playersLeft = 4 - game.trick.length - 1;
    var trickPts = _sumPoints(game.trick.map(function(t){ return t.card; }));

    if (under.length > 0) {
      // STRATEGY 5: Undershooting — play the card JUST below the current winner
      // This preserves lower safe cards for later and dumps max points safely
      under.sort(function(a,b){ return RANK_POWER[b.rank] - RANK_POWER[a.rank]; });
      // The highest "under" card is the undershoot
      var undershoot = under[0];

      // STRATEGY 6: If the trick has high points AND someone already winning,
      // dump our highest-point cards underneath (especially Aces under a 3 or 2)
      if (trickPts >= 3) {
        // Look for high-point cards we can safely dump
        var highPtUnder = under.filter(function(c){ return RANK_POINTS[c.rank] >= 1; });
        if (highPtUnder.length > 0) {
          highPtUnder.sort(function(a,b){ return RANK_POINTS[b.rank] - RANK_POINTS[a.rank]; });
          return highPtUnder[0]; // dump the Ace or highest figure under the winning card
        }
      }

      // Normal undershoot: play highest safe card to preserve low cards
      return undershoot;
    }

    // Must go over — we're forced to take the trick (or someone after us might)
    if (over.length > 0) {
      // STRATEGY 7: If players still to play, check if they might overtake us
      if (playersLeft > 0) {
        var highestUnseen = _hardHighestUnseenPower(playerIdx, leadSuit);
        // Also check if players after us are known to be void
        var afterUs = [];
        var curLead = game.leadPlayer;
        for(var ai = game.trick.length + 1; ai < 4; ai++){
          afterUs.push((curLead + ai) % 4);
        }
        var someoneCanBeat = afterUs.some(function(p){
          return !_hardIsPlayerVoid(p, leadSuit);
        }) && highestUnseen > RANK_POWER[over[0].rank];

        if (someoneCanBeat) {
          // Someone else will likely overtake — play our lowest over to save resources
          over.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
          return over[0];
        }
      }

      // STRATEGY 8: We'll win this trick — minimize damage
      // Play lowest POINT card that's over, not lowest POWER
      over.sort(function(a,b){
        var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pa - pb;
        return RANK_POWER[a.rank] - RANK_POWER[b.rank];
      });
      return over[0];
    }

    // Edge case: exactly equal (shouldn't happen in tresette, but safety)
    return following[0];
  }

  // ═══════════════════════ VOID — CAN'T FOLLOW SUIT ═══════════════════════
  // STRATEGY 9: Dump the most dangerous cards from hand
  // Priority: Aces (3pts) > Figures (1/3pt) > save scartine

  // STRATEGY 10: Check if someone is about to "cappotto" (take all 21 points)
  // If so, we MUST take at least ⅓ point or they get the cappotto bonus
  // This is anti-sola strategy: ensure we capture at least one small point card

  playable.sort(function(a,b){
    var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
    if (pa !== pb) return pb - pa; // dump highest points (Aces first!)
    // Among same-point cards, dump high power to keep safe lows
    return RANK_POWER[b.rank] - RANK_POWER[a.rank];
  });

  // STRATEGY 11: DON'T dump an Ace if the current trick winner might be US 
  // (edge case: if trick has 3 cards and we're the 4th, check who's winning)
  // But if we're void we can't win anyway, so always dump the Ace

  return playable[0];
}

function _hardVincere(playerIdx, playable) {
  var myHand = game.hands[playerIdx];
  var suitCounts = {};
  myHand.forEach(function(c){ suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  var myTeam = getPlayerTeam(playerIdx);
  var partner = TEAM_MEMBERS[myTeam].filter(function(p){ return p !== playerIdx; })[0];

  if (game.trick.length === 0) {
    // LEAD: prefer suits where we hold the top remaining card (guaranteed win)
    // Also prefer long suits to draw out opponents' cards
    var candidates = playable.map(function(c) {
      var isTop = _hardCanWinSafe(c, playerIdx);
      var pts = RANK_POINTS[c.rank];
      var sLen = suitCounts[c.suit] || 0;
      var unseenInSuit = _hardCountUnseenSuit(playerIdx, c.suit);
      // In vincere: HIGH score = good (we want to take points)
      var score = (isTop ? 30 : 0) + (pts * 5) + (sLen * 3) + RANK_POWER[c.rank];
      // Bonus: lead from a suit where opponents are known to be void
      var opps = [0,1,2,3].filter(function(p){ return getPlayerTeam(p) !== myTeam; });
      var oppsVoid = opps.filter(function(p){ return _hardIsPlayerVoid(p, c.suit); }).length;
      score += oppsVoid * 10;
      return {card: c, score: score};
    });
    candidates.sort(function(a,b){ return b.score - a.score; });
    return candidates[0].card;
  }

  var leadSuit = game.trick[0].card.suit;
  var following = playable.filter(function(c){ return c.suit === leadSuit; });

  if (following.length > 0) {
    var bestPower = -1;
    var currentWinner = -1;
    game.trick.forEach(function(t){
      if (t.card.suit === leadSuit && RANK_POWER[t.card.rank] > bestPower) {
        bestPower = RANK_POWER[t.card.rank];
        currentWinner = t.playerIdx;
      }
    });
    var partnerWinning = (currentWinner === partner);
    var over = following.filter(function(c){ return RANK_POWER[c.rank] > bestPower; });
    var under = following.filter(function(c){ return RANK_POWER[c.rank] < bestPower; });

    var trickPts = 0;
    game.trick.forEach(function(t){ trickPts += RANK_POINTS[t.card.rank]; });

    // If partner is currently winning, don't overtake — feed them points
    if (partnerWinning && under.length > 0) {
      under.sort(function(a,b){
        var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pb - pa; // give partner the most points
        return RANK_POWER[b.rank] - RANK_POWER[a.rank];
      });
      return under[0];
    }

    // We're last to play — take the trick
    if (game.trick.length === 3 && over.length > 0) {
      over.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
      return over[0];
    }

    // Can overtake and there are points — win with minimum card
    if (over.length > 0 && (trickPts > 0 || game.trick.length >= 2)) {
      // But check if someone after us is likely to overtake bigger
      var playersLeft = 4 - game.trick.length - 1;
      if (playersLeft > 0) {
        var highestUnseen = _hardHighestUnseenPower(playerIdx, leadSuit);
        // Check if an opponent after us might have a higher card
        var afterUs = [];
        var curLead = game.leadPlayer;
        for(var i = game.trick.length + 1; i < 4; i++){
          afterUs.push((curLead + i) % 4);
        }
        var oppAfter = afterUs.filter(function(p){ return getPlayerTeam(p) !== myTeam; });
        var oppMayBeat = oppAfter.some(function(p){ return !_hardIsPlayerVoid(p, leadSuit); }) && highestUnseen > RANK_POWER[over[0].rank];
        if (!oppMayBeat) {
          over.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
          return over[0];
        }
      }
      over.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
      return over[0];
    }

    if (under.length > 0) {
      // Can't win / not worth it — save strong cards, dump zero-point
      under.sort(function(a,b){
        var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
        if (pa !== pb) return pa - pb;
        return RANK_POWER[a.rank] - RANK_POWER[b.rank];
      });
      return under[0];
    }
    over.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
    return over[0];
  }

  // Can't follow suit: if partner is winning, feed points; otherwise dump low
  var currentWinnerOff = -1;
  var bestPowerOff = -1;
  game.trick.forEach(function(t){
    if (t.card.suit === game.trick[0].card.suit && RANK_POWER[t.card.rank] > bestPowerOff) {
      bestPowerOff = RANK_POWER[t.card.rank];
      currentWinnerOff = t.playerIdx;
    }
  });
  if (currentWinnerOff === partner) {
    // Partner wins — dump high-point cards as a gift
    playable.sort(function(a,b){
      var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
      if (pa !== pb) return pb - pa;
      return RANK_POWER[b.rank] - RANK_POWER[a.rank];
    });
    return playable[0];
  }
  // Opponent wins — dump lowest value
  playable.sort(function(a,b){
    var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
    if (pa !== pb) return pa - pb;
    return RANK_POWER[a.rank] - RANK_POWER[b.rank];
  });
  return playable[0];
}

// ═══════════════════════════════════════════════════════════════
//  AI ADATTIVO — Learns player behavior & adapts dynamically
// ═══════════════════════════════════════════════════════════════

function _initPlayerProfile() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    totalScoreTerzi: 0,
    leadPowerAvg: 0.5,
    duckRate: 0.5,
    pointDumpRate: 0.5,
    longSuitLeadRate: 0.5,
    avgScorePerGame: 16.5,
    emaWinRate: 0.5,
    skillLevel: 50,
    lastUpdated: 0
  };
}

function _resetGameObservation() {
  // Merge current hand observations into tournament accumulator before resetting
  if (_currentGameObs && _tournamentObs) {
    _tournamentObs.leads = _tournamentObs.leads.concat(_currentGameObs.leads);
    _tournamentObs.follows = _tournamentObs.follows.concat(_currentGameObs.follows);
    _tournamentObs.voidPlays = _tournamentObs.voidPlays.concat(_currentGameObs.voidPlays);
  }
  _currentGameObs = {
    leads: [],
    follows: [],
    voidPlays: [],
    tricksWon: 0,
    tricksSeen: 0
  };
  // Start fresh tournament accumulator if none exists
  if (!_tournamentObs) {
    _tournamentObs = { leads: [], follows: [], voidPlays: [] };
  }
}

function _observeHumanPlay(playerIdx, card) {
  var myIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;
  if (playerIdx !== myIdx || !_currentGameObs) return;

  var trickLen = game.trick.length; // card already pushed

  if (trickLen === 1) {
    // LEAD: record card strength (only publicly visible info — the card played)
    _currentGameObs.leads.push({
      power: RANK_POWER[card.rank] / 9,
      points: RANK_POINTS[card.rank],
      suitLen: 0.5 // unknown — don't peek at hand
    });
  } else if (trickLen > 1) {
    var leadSuit = game.trick[0].card.suit;

    if (card.suit === leadSuit) {
      // FOLLOWING: measure duck/overtake based only on what's visible on the table
      var bestPower = -1;
      for (var i = 0; i < trickLen - 1; i++) {
        var tc = game.trick[i].card;
        if (tc.suit === leadSuit && RANK_POWER[tc.rank] > bestPower)
          bestPower = RANK_POWER[tc.rank];
      }
      var playedPower = RANK_POWER[card.rank];
      var ducked = playedPower < bestPower;

      // We don't know if player had a choice (can't see their hand)
      // Estimate: assume they had a choice (slightly inaccurate but fair)
      _currentGameObs.follows.push({
        ducked: ducked,
        hadChoice: true
      });
    } else {
      // VOID: track point dumping (publicly visible — they didn't follow suit)
      _currentGameObs.voidPlays.push({
        pointsDumped: RANK_POINTS[card.rank]
      });
    }
  }
}

function _updateProfileAfterGame(won, scoreTerzi, volo) {
  if (!_playerProfile) _playerProfile = _initPlayerProfile();
  var p = _playerProfile;
  var alpha = 0.15; // EMA smoothing factor

  p.gamesPlayed++;
  if (won) p.gamesWon++;
  p.totalScoreTerzi += scoreTerzi;

  // Win rate EMA
  p.emaWinRate = p.emaWinRate * (1 - 0.2) + (won ? 1 : 0) * 0.2;

  // When volo: skip strategic observations — only the volo result matters
  // Otherwise individual plays (taking aces, not ducking) would drag skill down
  if (!volo) {
    // Merge final hand into tournament accumulator
    if (_currentGameObs && _tournamentObs) {
      _tournamentObs.leads = _tournamentObs.leads.concat(_currentGameObs.leads);
      _tournamentObs.follows = _tournamentObs.follows.concat(_currentGameObs.follows);
      _tournamentObs.voidPlays = _tournamentObs.voidPlays.concat(_currentGameObs.voidPlays);
    }
    // Use all accumulated observations from the tournament
    var obs = _tournamentObs || _currentGameObs;
    if (obs) {
      if (obs.leads.length > 0) {
        var avgPow = obs.leads.reduce(function(s, l) { return s + l.power; }, 0) / obs.leads.length;
        p.leadPowerAvg = p.leadPowerAvg * (1 - alpha) + avgPow * alpha;

        var avgSL = obs.leads.reduce(function(s, l) { return s + l.suitLen; }, 0) / obs.leads.length;
        p.longSuitLeadRate = p.longSuitLeadRate * (1 - alpha) + avgSL * alpha;
      }

      var choices = obs.follows.filter(function(f) { return f.hadChoice; });
      if (choices.length > 0) {
        var dPct = choices.filter(function(f) { return f.ducked; }).length / choices.length;
        p.duckRate = p.duckRate * (1 - alpha) + dPct * alpha;
      }

      if (obs.voidPlays.length > 0) {
        var avgDump = obs.voidPlays.reduce(function(s, v) {
          return s + v.pointsDumped;
        }, 0) / obs.voidPlays.length;
        p.pointDumpRate = p.pointDumpRate * (1 - alpha) + Math.min(avgDump / 3, 1) * alpha;
      }
    }
    p.avgScorePerGame = p.avgScorePerGame * (1 - alpha) + scoreTerzi * alpha;
  }
  // Reset tournament accumulator for next evaluation
  _tournamentObs = { leads: [], follows: [], voidPlays: [] };

  // Calculate skill level (0-100)
  // Components:
  // 1. Win rate (40%): weighted by how often the player wins
  // 2. Strategic quality (35%): in perdere, good players duck when they CAN but also
  //    dump aces when void and avoid leading point cards — a pure duckRate is too simple.
  //    We combine duckRate (when they had choice) + pointDumpRate (dumping skills) + low leadPower (safe leads)
  // 3. Experience bonus (15%): ramp up over first 30 games
  // 4. Score efficiency (10%): lower avg score = better in perdere
  var winSkill = Math.min(Math.max(p.emaWinRate * 1.3 - 0.15, 0), 1);

  var stratSkill;
  if (gameMode === 'perdere') {
    // Good perdere player: ducks when possible, dumps points when void, leads low
    var duckSkill = Math.min(p.duckRate * 1.2, 1); // ducking is good (0-1)
    var dumpSkill = Math.min(p.pointDumpRate * 1.3, 1); // dumping points when void is good
    var leadSkill = Math.max(1 - p.leadPowerAvg * 1.5, 0); // leading LOW is good (inverted)
    stratSkill = duckSkill * 0.4 + dumpSkill * 0.3 + leadSkill * 0.3;
  } else {
    // Good vincere player: overtakes, captures points, leads strong
    stratSkill = (1 - p.duckRate) * 0.4 + p.leadPowerAvg * 0.3 + (1 - p.pointDumpRate) * 0.3;
  }

  var expBonus = Math.min(p.gamesPlayed / 30, 1);

  // In perdere: low avg score = good. Max ~33 terzi possible, average ~8.
  var scoreSkill = 0;
  if (gameMode === 'perdere' && p.gamesPlayed >= 3) {
    scoreSkill = Math.max(1 - (p.avgScorePerGame / 16), 0); // 0 terzi = 1.0, 16+ terzi = 0
  } else if (p.gamesPlayed >= 3) {
    scoreSkill = Math.min(p.avgScorePerGame / 20, 1); // higher score = better in vincere
  }

  p.skillLevel = Math.round(winSkill * 40 + stratSkill * 35 + expBonus * 15 + scoreSkill * 10);
  p.skillLevel = Math.min(100, Math.max(0, p.skillLevel));
  p.lastUpdated = Date.now();

  console.log('[ADAPTIVE] Profile updated: skill=' + p.skillLevel +
    ' winRate=' + p.emaWinRate.toFixed(2) +
    ' duckRate=' + p.duckRate.toFixed(2) +
    ' leadPow=' + p.leadPowerAvg.toFixed(2) +
    ' games=' + p.gamesPlayed +
    (volo ? ' VOLO(obs skipped)' : ''));

  _savePlayerProfile();
}

// ─── Adaptive AI card selection ───────────────────────────────
// 6 skill tiers with progressive use of advanced strategies
function cpuSelectAdaptive(playerIdx, playable) {
  // Ensure profile exists
  if (!_playerProfile) {
    _playerProfile = _initPlayerProfile();
    _profileLoaded = true;
  }
  var profile = _playerProfile;
  var skill = profile.skillLevel;
  var rand = Math.random() * 100;

  // ── Tier 1: Principiante (0-24) — mostly random, occasional basic logic
  if (skill < 25) {
    if (rand < 80) return playable[Math.floor(Math.random() * playable.length)];
    return _cpuMedioLogic(playerIdx, playable);
  }
  // ── Tier 2: Base (25-39) — more basic logic, less random
  if (skill < 40) {
    if (rand < 55) return playable[Math.floor(Math.random() * playable.length)];
    return _cpuMedioLogic(playerIdx, playable);
  }
  // ── Tier 3: Intermedio (40-54) — full medium logic, occasional hard plays
  if (skill < 55) {
    if (rand < 20) return playable[Math.floor(Math.random() * playable.length)];
    if (rand < 40) return cpuSelectHard(playerIdx, playable);
    return _cpuMedioLogic(playerIdx, playable);
  }
  // ── Tier 4: Avanzato (55-69) — mostly hard AI with medium fallback
  if (skill < 70) {
    if (rand < 60) return cpuSelectHard(playerIdx, playable);
    return _cpuMedioLogic(playerIdx, playable);
  }
  // ── Tier 5: Esperto (70-84) — hard AI + counter-strategies
  if (skill < 85) {
    if (rand < 35) return _adaptiveCounterPlay(playerIdx, playable, profile);
    return cpuSelectHard(playerIdx, playable);
  }
  // ── Tier 6: Maestro (85-100) — heavy counter-strategies + hard AI
  if (rand < 55) return _adaptiveCounterPlay(playerIdx, playable, profile);
  return cpuSelectHard(playerIdx, playable);
}

function _cpuMedioLogic(playerIdx, playable) {
  if (gameMode === 'vincere') return cpuSelectCardVincere(playerIdx, playable);
  return cpuSelectCardPerdere(playerIdx, playable);
}

// ─── Counter-strategy: exploit player's known tendencies ──────
function _adaptiveCounterPlay(playerIdx, playable, profile) {
  var isPerdere = gameMode === 'perdere';
  var myHand = game.hands[playerIdx];
  var suitCounts = {};
  myHand.forEach(function(c) { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  var humanIdx = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;

  if (game.trick.length === 0) {
    // ── LEADING ──
    if (isPerdere) {
      // COUNTER 1: Player always ducks → lead suits where they have cards but no safe lows
      // Force them to take the trick by leading in suits where they're "trapped"
      if (profile.duckRate > 0.6) {
        var candidates = playable.map(function(c) {
          var score = RANK_POWER[c.rank] + (RANK_POINTS[c.rank] * 8);
          var unseenCount = _hardCountUnseenSuit(playerIdx, c.suit);
          // Lead into suits with many unseen cards (human likely still has cards there)
          score -= unseenCount * 3;
          // Avoid suits where human is known void
          if (_hardIsPlayerVoid(humanIdx, c.suit)) score += 30;
          return { card: c, score: score };
        });
        candidates.sort(function(a, b) { return a.score - b.score; });
        return candidates[0].card;
      }
      // COUNTER 2: Player leads from short suits (trying to create voids)
      // → Lead from THEIR likely void suits to deny them the dump opportunity
      if (profile.longSuitLeadRate < 0.4) {
        // They lead short suits → we should lead suits where they're void
        // so they can't dump Aces on us
        var forceCards = playable.filter(function(c) {
          return !_hardIsPlayerVoid(humanIdx, c.suit);
        });
        if (forceCards.length > 0) {
          forceCards.sort(function(a, b) {
            var pa = RANK_POINTS[a.rank], pb = RANK_POINTS[b.rank];
            if (pa !== pb) return pa - pb;
            return RANK_POWER[a.rank] - RANK_POWER[b.rank];
          });
          return forceCards[0];
        }
      }
      // COUNTER 3: Player leads strong (high leadPowerAvg)
      // → Lead low from short suits to become void faster ourselves
      if (profile.leadPowerAvg > 0.6) {
        var shortSuit = playable.slice().sort(function(a, b) {
          var sa = suitCounts[a.suit] || 0, sb = suitCounts[b.suit] || 0;
          if (sa !== sb) return sa - sb;
          return RANK_POWER[a.rank] - RANK_POWER[b.rank];
        });
        var zeroCards = shortSuit.filter(function(c) { return RANK_POINTS[c.rank] === 0; });
        return zeroCards.length > 0 ? zeroCards[0] : shortSuit[0];
      }
    } else {
      // Vincere: exploit passive players
      if (profile.duckRate > 0.6) {
        var strong = playable.filter(function(c) { return RANK_POWER[c.rank] >= 7; });
        if (strong.length > 0) {
          strong.sort(function(a, b) { return RANK_POWER[b.rank] - RANK_POWER[a.rank]; });
          return strong[0];
        }
      }
      if (profile.pointDumpRate > 0.6) {
        var candidates = playable.map(function(c) {
          var unseen = _hardCountUnseenSuit(playerIdx, c.suit);
          return { card: c, unseen: unseen };
        });
        candidates.sort(function(a, b) { return b.unseen - a.unseen; });
        return candidates[0].card;
      }
    }
    return cpuSelectHard(playerIdx, playable);
  }

  // ── FOLLOWING or VOID ──
  var leadSuit = game.trick[0].card.suit;
  var following = playable.filter(function(c) { return c.suit === leadSuit; });

  if (following.length > 0) {
    var bestPower = -1;
    var currentWinner = -1;
    game.trick.forEach(function(t) {
      if (t.card.suit === leadSuit && RANK_POWER[t.card.rank] > bestPower) {
        bestPower = RANK_POWER[t.card.rank];
        currentWinner = t.playerIdx;
      }
    });

    if (isPerdere) {
      // COUNTER 4: Human is winning this trick → dump our highest-point cards on them
      if (currentWinner === humanIdx) {
        var under = following.filter(function(c) { return RANK_POWER[c.rank] < bestPower; });
        if (under.length > 0) {
          under.sort(function(a, b) { return RANK_POINTS[b.rank] - RANK_POINTS[a.rank]; });
          return under[0]; // dump Aces/figures under human's winning card
        }
      }
      // COUNTER 5: If human still has to play and tends to duck,
      // play a medium card to force them to go over or take the points
      var playersLeft = 4 - game.trick.length - 1;
      if (playersLeft > 0 && currentWinner !== humanIdx && profile.duckRate > 0.5) {
        // Human hasn't played yet — check if they'll be forced over
        var humanMustPlay = !game.trick.some(function(t){ return t.playerIdx === humanIdx; });
        if (humanMustPlay) {
          // Play just high enough to force human to go over or take high points
          following.sort(function(a,b){ return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
          // Find card that's high enough to be a threat but not our highest
          var midCard = following[Math.floor(following.length / 2)];
          if (midCard && RANK_POWER[midCard.rank] > bestPower) return midCard;
        }
      }
    } else {
      if (currentWinner === humanIdx) {
        var over = following.filter(function(c) { return RANK_POWER[c.rank] > bestPower; });
        if (over.length > 0 && profile.duckRate > 0.5) {
          over.sort(function(a, b) { return RANK_POWER[a.rank] - RANK_POWER[b.rank]; });
          return over[0];
        }
      }
    }
  } else {
    // VOID
    if (isPerdere) {
      // COUNTER 6: Human is winning → pile maximum points on them
      var humanWinning = false;
      if (game.trick.length > 0) {
        var bestWP = -1; var winner = -1;
        game.trick.forEach(function(t) {
          if (t.card.suit === leadSuit && RANK_POWER[t.card.rank] > bestWP) {
            bestWP = RANK_POWER[t.card.rank]; winner = t.playerIdx;
          }
        });
        humanWinning = (winner === humanIdx);
      }
      if (humanWinning) {
        // Dump Aces and highest point cards on them!
        playable.sort(function(a, b) { return RANK_POINTS[b.rank] - RANK_POINTS[a.rank]; });
        return playable[0];
      }
      // COUNTER 7: Anticipate human's void dump tendency
      // If human likes to dump points when void, save our Aces for when THEY lead
      if (profile.pointDumpRate > 0.6) {
        // Don't dump Ace now — save it to dump when human takes a trick
        var nonAces = playable.filter(function(c) { return c.rank !== 1; });
        if (nonAces.length > 0) {
          nonAces.sort(function(a, b) { return RANK_POINTS[b.rank] - RANK_POINTS[a.rank]; });
          return nonAces[0];
        }
      }
    }
  }

  // Fallback: use hard AI
  return cpuSelectHard(playerIdx, playable);
}

// ─── Profile persistence (Firebase + localStorage) ────────────
function _savePlayerProfile() {
  if (!_playerProfile) return;
  // Sync current profile back into the mode-specific slot
  _playerProfiles[gameMode || 'perdere'] = _playerProfile;
  try {
    localStorage.setItem('tresette_player_profiles', JSON.stringify(_playerProfiles));
  } catch(e) {}
  if (_fbDb && _authUser && _authUser.uid) {
    _fbDb.ref('users/' + _authUser.uid + '/playerProfiles').set(_playerProfiles)
      .then(function() { console.log('[ADAPTIVE] Profiles saved to Firebase'); })
      .catch(function(e) { console.warn('[ADAPTIVE] Firebase save failed:', e.message); });
  }
  // Update skill badge display
  var skillEl = document.getElementById('ub-skill');
  if (skillEl) _updateSkillBadge(skillEl);
}

function _loadPlayerProfile() {
  // Try localStorage first (instant)
  try {
    var stored = localStorage.getItem('tresette_player_profiles');
    if (stored) {
      _playerProfiles = JSON.parse(stored);
      _playerProfile = _playerProfiles[gameMode || 'perdere'] || _initPlayerProfile();
      _profileLoaded = true;
      console.log('[ADAPTIVE] Profiles loaded from localStorage, mode=' + gameMode + ' skill=' + _playerProfile.skillLevel);
    } else {
      // Migration: try old single-profile key
      var oldStored = localStorage.getItem('tresette_player_profile');
      if (oldStored) {
        var oldProfile = JSON.parse(oldStored);
        _playerProfiles.perdere = oldProfile;
        _playerProfiles.vincere = _initPlayerProfile();
        _playerProfile = _playerProfiles[gameMode || 'perdere'];
        _profileLoaded = true;
        localStorage.removeItem('tresette_player_profile');
        localStorage.setItem('tresette_player_profiles', JSON.stringify(_playerProfiles));
        console.log('[ADAPTIVE] Migrated old profile to per-mode profiles');
      }
    }
  } catch(e) {}

  // Then try Firebase (may overwrite with more recent data)
  if (_fbDb && _authUser && _authUser.uid) {
    _fbDb.ref('users/' + _authUser.uid + '/playerProfiles').once('value', function(snap) {
      var data = snap.val();
      if (data) {
        if (data.perdere) _playerProfiles.perdere = data.perdere;
        if (data.vincere) _playerProfiles.vincere = data.vincere;
        _playerProfile = _playerProfiles[gameMode || 'perdere'] || _initPlayerProfile();
        _profileLoaded = true;
        console.log('[ADAPTIVE] Profiles loaded from Firebase, mode=' + gameMode + ' skill=' + _playerProfile.skillLevel);
        try { localStorage.setItem('tresette_player_profiles', JSON.stringify(_playerProfiles)); } catch(e) {}
      } else {
        // Try old single-profile path for migration
        _fbDb.ref('users/' + _authUser.uid + '/playerProfile').once('value', function(oldSnap) {
          var oldData = oldSnap.val();
          if (oldData && oldData.gamesPlayed > 0) {
            _playerProfiles.perdere = oldData;
            _playerProfile = _playerProfiles[gameMode || 'perdere'] || _initPlayerProfile();
            _profileLoaded = true;
            console.log('[ADAPTIVE] Migrated old Firebase profile to per-mode');
          }
          if (!_playerProfile) { _playerProfile = _initPlayerProfile(); _profileLoaded = true; }
        });
      }
      if (!_playerProfile) { _playerProfile = _initPlayerProfile(); _profileLoaded = true; }
    }, function(err) {
      console.warn('[ADAPTIVE] Firebase load failed:', err.message);
      if (!_playerProfile) { _playerProfile = _initPlayerProfile(); _profileLoaded = true; }
    });
  } else {
    if (!_playerProfile) { _playerProfile = _initPlayerProfile(); _profileLoaded = true; }
  }
}

function _switchProfileToMode(mode) {
  // Save current profile to its mode slot
  if (_playerProfile && gameMode) {
    _playerProfiles[gameMode] = _playerProfile;
  }
  // Load profile for the new mode
  _playerProfile = _playerProfiles[mode || 'perdere'] || _initPlayerProfile();
  _playerProfiles[mode || 'perdere'] = _playerProfile;
}
