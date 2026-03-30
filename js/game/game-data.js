// ═══════════════════════════════════════════════════════════════
//  TRESETTE — Carte Napoletane (A Perdere / A Vincere)
// ═══════════════════════════════════════════════════════════════

// ─── Game Mode ────────────────────────────────────────────────
let gameMode = 'perdere'; // 'perdere' or 'vincere'
let cpuDifficulty = 'medio'; // 'facile', 'medio', 'difficile'

var _selectedTeammate = null;
var _joinPreferredSeat = -1; // 0-indexed seat the client wants to sit in


function selectMode(mode) {
  // Switch skill profile to the new mode
  if (_profileLoaded) _switchProfileToMode(mode);
  gameMode = mode;
  document.getElementById('mode-perdere').classList.toggle('selected', mode === 'perdere');
  document.getElementById('mode-vincere').classList.toggle('selected', mode === 'vincere');
  document.getElementById('overlay-sub').textContent = mode === 'perdere' ? 'A PERDERE' : 'A VINCERE';
  document.getElementById('info-objective').innerHTML = mode === 'perdere'
    ? '<b>🎯 Obiettivo:</b> Prendi MENO punti possibili!'
    : '<b>🎯 Obiettivo:</b> Si gioca a coppie! Prendi PIÙ punti possibili con il compagno e dichiara il buongioco! Prima coppia a 31 punti vince.';
}

function selectDifficulty(diff) {
  cpuDifficulty = diff;
  document.getElementById('diff-facile').classList.toggle('selected', diff === 'facile');
  document.getElementById('diff-medio').classList.toggle('selected', diff === 'medio');
  document.getElementById('diff-difficile').classList.toggle('selected', diff === 'difficile');
  document.getElementById('diff-adattivo').classList.toggle('selected', diff === 'adattivo');
  if (diff === 'adattivo' && !_profileLoaded) _loadPlayerProfile();
}

// ─── Constants ────────────────────────────────────────────────
const SUITS = ['coppe','denari','bastoni','spade'];
const SUIT_NAMES = { coppe:'Coppe', denari:'Denari', bastoni:'Bastoni', spade:'Spade' };
const SUIT_ICONS = { coppe:'🏆', denari:'🟡', bastoni:'🌿', spade:'⚔️' };
const SUIT_COLORS = { coppe:'#c07000', denari:'#b8960b', bastoni:'#2d6b2d', spade:'#3060a0' };
const SUIT_COLORS2 = { coppe:'#a05800', denari:'#8b7500', bastoni:'#1a4a1a', spade:'#1e4080' };

// Ranks 1-10 where 8=Fante, 9=Cavallo, 10=Re
const RANK_NAMES = {1:'Asso',2:'Due',3:'Tre',4:'Quattro',5:'Cinque',6:'Sei',7:'Sette',8:'Fante',9:'Cavallo',10:'Re'};
const RANK_SHORT = {1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'F',9:'C',10:'R'};

// Power order (higher = stronger): 3 is strongest
const RANK_POWER = {4:0, 5:1, 6:2, 7:3, 8:4, 9:5, 10:6, 1:7, 2:8, 3:9};

// Point values in "terzi" (thirds). 3 terzi = 1 punto.
const RANK_POINTS = {1:3, 2:1, 3:1, 4:0, 5:0, 6:0, 7:0, 8:1, 9:1, 10:1};

// ═══════════════════════════════════════════════════════════════
//  ADAPTIVE AI — Player Profiling & Learning System (variables)
// ═══════════════════════════════════════════════════════════════
var _playerProfile = null;
var _playerProfiles = { perdere: null, vincere: null };
var _profileLoaded = false;
var _currentGameObs = null;
var _tournamentObs = null; // accumulates observations across hands in a tournament

const PLAYER_NAMES = ['Tu','Giuseppe','Riccardo','Zio Checco'];

// ─── Team helpers (a vincere: 0+2 vs 1+3) ─────────────────────
const TEAM_MEMBERS = [[0,2],[1,3]]; // Team 0 = South+North, Team 1 = West+East
function getPlayerTeam(playerIdx) { return TEAM_MEMBERS[0].includes(playerIdx) ? 0 : 1; }
function getTeamScore(teamIdx) {
  if(!game) return 0;
  return TEAM_MEMBERS[teamIdx].reduce((s,i) => s + game.scores[i], 0);
}
function getTeamName(teamIdx) {
  return PLAYER_NAMES[TEAM_MEMBERS[teamIdx][0]] + ' & ' + PLAYER_NAMES[TEAM_MEMBERS[teamIdx][1]];
}
function isVincereMode() { return gameMode === 'vincere'; }
var VINCERE_LIMIT = 31; // first team to 31 punti interi wins the tournament

// ─── Buongioco (accuse) per il Tresette a Vincere ────────────────────
// Napola: A-2-3 dello stesso seme = 3 punti, +1 per ogni carta consecutiva aggiuntiva
// Tre/Quattro di un tipo: 3 o 4 carte dello stesso valore (tra A, 2, 3)
function detectBuongioco(hand) {
  var declarations = [];
  // Check Napola per ogni seme
  SUITS.forEach(function(suit) {
    var suitRanks = hand.filter(function(c){ return c.suit === suit; }).map(function(c){ return c.rank; });
    if (suitRanks.indexOf(1) >= 0 && suitRanks.indexOf(2) >= 0 && suitRanks.indexOf(3) >= 0) {
      var len = 3;
      for (var r = 4; r <= 10; r++) {
        if (suitRanks.indexOf(r) >= 0) len++;
        else break;
      }
      declarations.push({
        type: 'napola',
        suit: suit,
        length: len,
        puntiTerzi: len * 3 // 3 punti base = 9 terzi, +3 per carta extra
      });
    }
  });
  // Check tre/quattro dello stesso valore (A=1, 2, 3)
  [1, 2, 3].forEach(function(rank) {
    var count = hand.filter(function(c){ return c.rank === rank; }).length;
    if (count >= 3) {
      declarations.push({
        type: count === 4 ? 'quattro' : 'tre',
        rank: rank,
        count: count,
        puntiTerzi: count * 3 // 3 of a kind = 9 terzi (3 punti), 4 = 12 terzi (4 punti)
      });
    }
  });
  return declarations;
}

function describeBuongioco(decl) {
  if (decl.type === 'napola') {
    var label = 'Napola di ' + SUIT_NAMES[decl.suit];
    if (decl.length > 3) label += ' (' + decl.length + ' carte)';
    return label + ' = ' + formatPunti(decl.puntiTerzi);
  }
  var rankName = RANK_NAMES[decl.rank];
  var pluralNames = {1:'Assi', 2:'Due', 3:'Tre'};
  var plural = pluralNames[decl.rank] || rankName;
  if (decl.type === 'quattro') return '4 ' + plural + ' = ' + formatPunti(decl.puntiTerzi);
  return '3 ' + plural + ' = ' + formatPunti(decl.puntiTerzi);
}

// Applica buongioco: rileva dichiarazioni, aggiunge punti, restituisce info
function applyBuongioco() {
  if (!isVincereMode() || !game) return [];
  var allDeclarations = [];
  for (var p = 0; p < 4; p++) {
    var decls = detectBuongioco(game.hands[p]);
    decls.forEach(function(d) {
      d.playerIdx = p;
      d.playerName = PLAYER_NAMES[p];
      d.teamIdx = getPlayerTeam(p);
      game.scores[p] += d.puntiTerzi;
      allDeclarations.push(d);
    });
  }
  return allDeclarations;
}

var _buongiocoTimers = {};
var BUONGIOCO_DISPLAY_MS = 10000;

function showBuongiocoNotification(declarations) {
  if (!isVincereMode() || !game) return;
  var rot = mpMode ? (mySeat >= 0 ? mySeat : 0) : 0;

  // Group declarations by playerIdx
  var byPlayer = {};
  if (declarations && declarations.length > 0) {
    declarations.forEach(function(d) {
      if (!byPlayer[d.playerIdx]) byPlayer[d.playerIdx] = [];
      byPlayer[d.playerIdx].push(d);
    });
  }

  // Show a banner for each player
  for (var v = 0; v < 4; v++) {
    var actual = (v + rot) % 4;
    var pos = PLAYER_POS[v];
    var banner = document.getElementById('bg-' + pos);
    if (!banner) continue;

    var playerDecls = byPlayer[actual];
    var html = '<div class="bg-title">🎯 ' + PLAYER_NAMES[actual] + '</div>';
    if (playerDecls && playerDecls.length > 0) {
      playerDecls.forEach(function(d) {
        html += '<div class="bg-line">' + describeBuongioco(d) + '</div>';
      });
    } else {
      html += '<div class="bg-none">Nessuna accusa</div>';
    }
    banner.innerHTML = html;

    // Position near the player label
    positionBuongiocoBanner(banner, pos);
    banner.classList.add('show');

    // Clear previous timer
    if (_buongiocoTimers[pos]) clearTimeout(_buongiocoTimers[pos]);
    _buongiocoTimers[pos] = setTimeout((function(b) {
      return function() { b.classList.remove('show'); };
    })(banner), BUONGIOCO_DISPLAY_MS);
  }
}

function positionBuongiocoBanner(banner, pos) {
  var label = document.getElementById('label-' + pos);
  if (!label) return;
  var r = label.getBoundingClientRect();
  var cx = r.left + r.width / 2;
  var cy = r.top + r.height / 2;
  banner.style.position = 'fixed';
  if (pos === 'south') {
    banner.style.left = cx + 'px';
    banner.style.top = (r.top - 6) + 'px';
    banner.style.transform = 'translate(-50%,-100%)';
  } else if (pos === 'north') {
    banner.style.left = cx + 'px';
    banner.style.top = (r.bottom + 6) + 'px';
    banner.style.transform = 'translate(-50%,0)';
  } else if (pos === 'west') {
    banner.style.left = (r.right + 6) + 'px';
    banner.style.top = cy + 'px';
    banner.style.transform = 'translate(0,-50%)';
  } else if (pos === 'east') {
    banner.style.left = (r.left - 6) + 'px';
    banner.style.top = cy + 'px';
    banner.style.transform = 'translate(-100%,-50%)';
  }
}

function hideBuongiocoBanners() {
  PLAYER_POS.forEach(function(pos) {
    var b = document.getElementById('bg-' + pos);
    if (b) b.classList.remove('show');
    if (_buongiocoTimers[pos]) { clearTimeout(_buongiocoTimers[pos]); delete _buongiocoTimers[pos]; }
  });
}

// Pool of Italian-flavoured CPU names to draw from randomly
const CPU_NAME_POOL = [
  'Alfredo','Armando','Aurelio','Bartolomeo','Benedetto','Bruno','Carlo',
  'Cesare','Corrado','Daniele','Davide','Dino','Edmondo','Edoardo','Emanuele',
  'Enzo','Ernesto','Ettore','Fabio','Federico','Filippo','Flavio','Fortunato',
  'Franco','Gabriele','Giacomo','Gianni','Giovanni','Giulio','Giuseppe',
  'Guido','Italo','Luca','Luigi','Marco','Mario','Massimo','Matteo','Maurizio',
  'Michele','Nicola','Orlando','Ottavio','Paolo','Piero','Pietro','Remo',
  'Renato','Riccardo','Roberto','Rocco','Romano','Rosario','Salvatore',
  'Sergio','Silvano','Silvio','Simone','Stefano','Tommaso','Ugo','Umberto',
  'Valentino','Vito','Vittorio','Zio Beppe','Zio Checco','Zio Toni',
  'Nonno Leo','Nonno Gino','Cugino Max','Cugino Pino'
];

// Pick a CPU name at random that is NOT already in usedNames (case-insensitive)
function pickCpuName(usedNames) {
  var pool = CPU_NAME_POOL.slice();
  // shuffle
  for(var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  var used = usedNames.map(function(n){ return n.toLowerCase().trim(); });
  for(var k = 0; k < pool.length; k++) {
    if(used.indexOf(pool[k].toLowerCase()) === -1) return pool[k];
  }
  // All pool names exhausted — generate a unique fallback
  return 'CPU ' + Math.floor(Math.random() * 900 + 100);
}

// Deduplicate names: if a name appears more than once, append a counter suffix.
function deduplicateNames() {
  var seen = {};
  for(var i = 0; i < PLAYER_NAMES.length; i++) {
    var key = PLAYER_NAMES[i].toLowerCase().trim();
    if(seen[key] !== undefined) {
      // Collision: keep trying appended numbers until unique
      var base = PLAYER_NAMES[i];
      var n = 2;
      while(seen[(base + n).toLowerCase()] !== undefined) n++;
      PLAYER_NAMES[i] = base + n;
      seen[(base + n).toLowerCase()] = i;
    } else {
      seen[key] = i;
    }
  }
}
const PLAYER_POS = ['south','east','north','west'];
// Play order: counter-clockwise = S(0) → E(1)→ N(2) → W(3)

// ─── Pip patterns for number cards ────────────────────────────
// Positions are [x%, y%] relative to center area
const PIP_LAYOUTS = {
  1: [[50,50]],
  2: [[50,28],[50,72]],
  3: [[50,22],[50,50],[50,78]],
  4: [[32,28],[68,28],[32,72],[68,72]],
  5: [[32,22],[68,22],[50,50],[32,78],[68,78]],
  6: [[32,22],[68,22],[32,50],[68,50],[32,78],[68,78]],
  7: [[32,20],[68,20],[50,38],[32,55],[68,55],[32,80],[68,80]],
};

// ─── Create deck ──────────────────────────────────────────────
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 10; rank++) {
      deck.push({ suit, rank, id: `${suit}_${rank}` });
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Format points ────────────────────────────────────────────
function formatPunti(terzi) {
  const w = Math.floor(terzi / 3);
  const f = terzi % 3;
  if (f === 0) return `${w}`;
  if (f === 1) return w > 0 ? `${w}⅓` : '⅓';
  return w > 0 ? `${w}⅔` : '⅔';
}

function formatPuntiLong(terzi) {
  return formatPunti(terzi) + (terzi === 3 ? ' punto' : ' punti');
}

// ─── Card Rendering ───────────────────────────────────────────
let _svgId = 0;
function suitSVG(suit, size) {
  const s = size || 16;
  const c1 = SUIT_COLORS[suit];
  const c2 = SUIT_COLORS2[suit];
  const st = `display:inline-block;vertical-align:middle`;
  const uid = _svgId++;
  switch(suit) {
    case 'coppe': return `<svg viewBox="0 0 40 48" width="${s}" height="${s*48/40}" style="${st}">`
      +`<defs><linearGradient id="cg${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f0c040"/><stop offset="100%" stop-color="#c08010"/></linearGradient></defs>`
      +`<ellipse cx="20" cy="44" rx="9" ry="2.5" fill="${c2}"/>`
      +`<rect x="12" y="41" width="16" height="4" rx="2" fill="url(#cg${uid})" stroke="${c2}" stroke-width=".6"/>`
      +`<rect x="17" y="27" width="6" height="15" rx="1.5" fill="url(#cg${uid})" stroke="${c2}" stroke-width=".5"/>`
      +`<ellipse cx="20" cy="29" rx="4" ry="2" fill="${c2}" opacity=".5"/>`
      +`<path d="M6 10 Q6 28 20 28 Q34 28 34 10 Z" fill="url(#cg${uid})" stroke="${c2}" stroke-width=".8"/>`
      +`<ellipse cx="20" cy="10" rx="14" ry="5" fill="#f5d060" stroke="${c2}" stroke-width=".7"/>`
      +`<path d="M10 13 Q10 24 20 24 Q30 24 30 13 Z" fill="#b01030" opacity=".45"/>`
      +`<path d="M13 12 Q14 20 15 14" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>`
      +`</svg>`;
    case 'denari': return `<svg viewBox="0 0 40 40" width="${s}" height="${s}" style="${st}">`
      +`<defs><radialGradient id="dg${uid}"><stop offset="0%" stop-color="#f5d060"/><stop offset="100%" stop-color="#b89000"/></radialGradient></defs>`
      +`<circle cx="20" cy="20" r="17" fill="url(#dg${uid})" stroke="${c2}" stroke-width="1.2"/>`
      +`<circle cx="20" cy="20" r="13" fill="none" stroke="${c2}" stroke-width=".7"/>`
      +`<circle cx="20" cy="20" r="7" fill="#f0c840" stroke="${c2}" stroke-width=".6"/>`
      +`<g stroke="${c2}" stroke-width=".5" opacity=".7">`
      +`<line x1="20" y1="4" x2="20" y2="8"/><line x1="20" y1="32" x2="20" y2="36"/>`
      +`<line x1="4" y1="20" x2="8" y2="20"/><line x1="32" y1="20" x2="36" y2="20"/>`
      +`<line x1="8.5" y1="8.5" x2="11" y2="11"/><line x1="29" y1="8.5" x2="31.5" y2="11"/>`
      +`<line x1="8.5" y1="31.5" x2="11" y2="29"/><line x1="29" y1="31.5" x2="31.5" y2="29"/></g>`
      +`<circle cx="20" cy="20" r="3" fill="${c2}"/><circle cx="20" cy="20" r="1.2" fill="#f5d060"/>`
      +`</svg>`;
    case 'bastoni': return `<svg viewBox="0 0 40 50" width="${s}" height="${s*50/40}" style="${st}">`
      +`<defs><linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#7a6040"/><stop offset="50%" stop-color="#5d4830"/><stop offset="100%" stop-color="#4a3820"/></linearGradient></defs>`
      +`<path d="M17 44 L18 12 Q20 6 22 12 L23 44 Z" fill="url(#bg${uid})" stroke="#3a2a18" stroke-width=".7"/>`
      +`<ellipse cx="17" cy="8" rx="4" ry="6" fill="#2d7a2d" transform="rotate(-20 17 8)" opacity=".9"/>`
      +`<ellipse cx="23" cy="8" rx="4" ry="6" fill="#3a8a3a" transform="rotate(20 23 8)" opacity=".9"/>`
      +`<ellipse cx="20" cy="6" rx="3" ry="5.5" fill="#4a9a4a"/>`
      +`<rect x="15.5" y="16" width="9" height="2.5" rx="1.2" fill="#3a7a3a" stroke="#2a5a2a" stroke-width=".4"/>`
      +`<rect x="15.5" y="26" width="9" height="2.5" rx="1.2" fill="#3a7a3a" stroke="#2a5a2a" stroke-width=".4"/>`
      +`<rect x="15.5" y="36" width="9" height="2.5" rx="1.2" fill="#3a7a3a" stroke="#2a5a2a" stroke-width=".4"/>`
      +`<line x1="19.5" y1="14" x2="19.5" y2="42" stroke="rgba(0,0,0,.08)" stroke-width=".4"/>`
      +`<line x1="20.5" y1="14" x2="20.5" y2="42" stroke="rgba(255,255,255,.06)" stroke-width=".4"/>`
      +`</svg>`;
    case 'spade': return `<svg viewBox="0 0 40 50" width="${s}" height="${s*50/40}" style="${st}">`
      +`<defs><linearGradient id="sg${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#90aad0"/><stop offset="100%" stop-color="#506a9a"/></linearGradient></defs>`
      +`<path d="M20 3 Q10 18 13 36 L17 36 Q14 20 20 7 Q26 20 23 36 L27 36 Q30 18 20 3 Z" fill="url(#sg${uid})" stroke="${c2}" stroke-width=".7"/>`
      +`<path d="M18 8 Q15 20 16 32" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/>`
      +`<rect x="11" y="35" width="18" height="3" rx="1.5" fill="#daa520" stroke="#b08a18" stroke-width=".5"/>`
      +`<rect x="17" y="38" width="6" height="5" rx="1" fill="#8b5a28" stroke="#654321" stroke-width=".4"/>`
      +`<circle cx="20" cy="46" r="2.5" fill="#daa520" stroke="#b08a18" stroke-width=".4"/>`
      +`</svg>`;
  }
}

// ─── Face card figure SVGs ────────────────────────────────────
function faceFigureSVG(rank, suit, w, h) {
  const c1 = SUIT_COLORS[suit];
  const c2 = SUIT_COLORS2[suit];
  const skin = '#e8c090';
  const hair = '#5a3a20';
  if (rank === 8) { // Fante (Page/Jack)
    return `<svg viewBox="0 0 44 64" width="${w}" height="${h}" class="figure-svg">`
      +`<circle cx="22" cy="14" r="7" fill="${skin}" stroke="${c2}" stroke-width=".5"/>`
      +`<path d="M15 11 Q22 4 29 11" fill="${c1}" stroke="${c2}" stroke-width=".4"/>`
      +`<circle cx="22" cy="7" r="2" fill="${c1}"/>`
      +`<rect x="18" y="20" width="8" height="18" rx="2" fill="${c1}" stroke="${c2}" stroke-width=".4"/>`
      +`<rect x="17" y="22" width="10" height="6" rx="1" fill="${c1}" opacity=".7"/>`
      +`<path d="M18 28 L14 40" stroke="${c2}" stroke-width="1.8" stroke-linecap="round"/>`
      +`<path d="M26 28 L30 40" stroke="${c2}" stroke-width="1.8" stroke-linecap="round"/>`
      +`<path d="M20 38 L18 56" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`
      +`<path d="M24 38 L26 56" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`
      +`<line x1="12" y1="40" x2="16" y2="40" stroke="#888" stroke-width="1.5"/>`
      +`<line x1="10" y1="40" x2="15" y2="38" stroke="#888" stroke-width="1"/>`
      +`${suitSVGRaw(suit, 8, 32, 48)}`
      +`</svg>`;
  }
  if (rank === 9) { // Cavallo (Knight on horse)
    return `<svg viewBox="0 0 48 64" width="${w}" height="${h}" class="figure-svg">`
      +`<path d="M12 58 Q14 42 20 38 Q26 34 32 28 L38 32 Q36 38 34 42 L32 58 Z" fill="#8b6840" stroke="#5a4028" stroke-width=".6"/>`
      +`<path d="M32 28 Q38 20 36 14 Q34 10 28 12" fill="#8b6840" stroke="#5a4028" stroke-width=".6"/>`
      +`<circle cx="33" cy="16" r="1.5" fill="#222"/>`
      +`<path d="M36 12 L40 10 L38 14" fill="#8b6840"/>`
      +`<path d="M16 58 L12 58" stroke="#5a4028" stroke-width="1.5"/>`
      +`<path d="M30 58 L34 58" stroke="#5a4028" stroke-width="1.5"/>`
      +`<circle cx="22" cy="24" r="5.5" fill="${skin}" stroke="${c2}" stroke-width=".5"/>`
      +`<path d="M17 21 Q22 15 27 21" fill="${c1}" stroke="${c2}" stroke-width=".3"/>`
      +`<path d="M23 18 L25 12 L22 14" fill="${c1}"/>`
      +`<rect x="19" y="29" width="7" height="12" rx="1.5" fill="${c1}" stroke="${c2}" stroke-width=".4"/>`
      +`<path d="M19 33 L14 38" stroke="${c2}" stroke-width="1.5" stroke-linecap="round"/>`
      +`<path d="M26 33 L30 30" stroke="${c2}" stroke-width="1.5" stroke-linecap="round"/>`
      +`</svg>`;
  }
  if (rank === 10) { // Re (King)
    return `<svg viewBox="0 0 44 64" width="${w}" height="${h}" class="figure-svg">`
      +`<circle cx="22" cy="16" r="7" fill="${skin}" stroke="${c2}" stroke-width=".5"/>`
      +`<path d="M14 12 L16 4 L19 10 L22 3 L25 10 L28 4 L30 12 Z" fill="#daa520" stroke="#b08a18" stroke-width=".5"/>`
      +`<circle cx="22" cy="5" r="1.5" fill="#e04040"/>`
      +`<rect x="16" y="22" width="12" height="22" rx="2" fill="${c1}" stroke="${c2}" stroke-width=".5"/>`
      +`<path d="M16 24 L22 26 L28 24" fill="none" stroke="#daa520" stroke-width=".8"/>`
      +`<rect x="19" y="28" width="6" height="4" rx=".5" fill="#daa520" opacity=".4"/>`
      +`<path d="M16 30 L10 40" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`
      +`<path d="M28 30 L34 40" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>`
      +`<circle cx="10" cy="41" r="2" fill="${skin}"/>`
      +`<circle cx="34" cy="41" r="2" fill="${skin}"/>`
      +`<path d="M20 44 L18 58" stroke="${c2}" stroke-width="2.2" stroke-linecap="round"/>`
      +`<path d="M24 44 L26 58" stroke="${c2}" stroke-width="2.2" stroke-linecap="round"/>`
      +`<rect x="14" y="56" width="16" height="3" rx="1" fill="${c2}" opacity=".5"/>`
      +`${suitSVGRaw(suit, 6, 34, 48)}`
      +`</svg>`;
  }
  return '';
}

// Small embedded suit icon for face card figures
function suitSVGRaw(suit, size, x, y) {
  const c = SUIT_COLORS[suit];
  switch(suit) {
    case 'coppe': return `<g transform="translate(${x},${y}) scale(${size/40})">`
      +`<path d="M6 10 Q6 24 20 24 Q34 24 34 10 Z" fill="${c}" opacity=".6"/>`
      +`<ellipse cx="20" cy="10" rx="11" ry="4" fill="${c}" opacity=".5"/></g>`;
    case 'denari': return `<g transform="translate(${x},${y}) scale(${size/40})">`
      +`<circle cx="20" cy="20" r="14" fill="${c}" opacity=".5"/>`
      +`<circle cx="20" cy="20" r="6" fill="${c}" opacity=".3"/></g>`;
    case 'bastoni': return `<g transform="translate(${x},${y}) scale(${size/40})">`
      +`<rect x="17" y="4" width="6" height="32" rx="3" fill="${c}" opacity=".5"/></g>`;
    case 'spade': return `<g transform="translate(${x},${y}) scale(${size/40})">`
      +`<path d="M20 4 Q12 16 14 32 L26 32 Q28 16 20 4 Z" fill="${c}" opacity=".5"/></g>`;
  }
  return '';
}

function createCardBackImg(className) {
  const back = document.createElement('div');
  back.className = className;
  back.setAttribute('aria-hidden', 'true');
  return back;
}

function applyCardBack(el, className) {
  el.appendChild(createCardBackImg(className));
  return el;
}

function createCardElement(card, faceUp) {
  const el = document.createElement('div');
  el.className = 'card ' + (faceUp ? 'face-up' : 'face-down');
  el.dataset.id = card.id;
  el.dataset.suit = card.suit;
  el.dataset.rank = card.rank;

  if (!faceUp) return applyCardBack(el, 'card-back-img');

  // Use Napoletane card image
  const img = document.createElement('img');
  img.className = 'card-img';
  const _imgSuit = card.suit === 'coppe' ? 'bastoni' : card.suit === 'bastoni' ? 'coppe' : card.suit;
  img.src = CARD_DATA[_imgSuit + "_" + card.rank];
  img.alt = `${RANK_NAMES[card.rank]} di ${SUIT_NAMES[card.suit]}`;
  img.draggable = false;
  el.appendChild(img);
  return el;
}
