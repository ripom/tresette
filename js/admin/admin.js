    // Inizializza Firebase (usa FIREBASE_CONFIG da js/shared/firebase-config.js)
    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.database();
    let statsChartInstance = null;
    let dailyChartInstance = null;

    // ─── Local Stats (works for guests & logged-in users) ───
    var _tipDescriptions = {
      'perc-vittorie': 'Percentuale di partite vinte sul totale. Più è alta, meglio giochi!',
      'bravura': 'Punteggio da 0 a 100 calcolato automaticamente in base alle tue giocate: vittorie (40%), qualità delle mosse (35%), esperienza (15%) e efficienza punti (10%).',
      'punti-medi': 'Media dei punti (in terzi) presi per partita. A Perdere: più basso è meglio. A Vincere: più alto è meglio.',
      'tendenza': 'Media mobile esponenziale delle vittorie recenti. Indica se stai migliorando o peggiorando nelle ultime partite.',
      'sottogiocare': 'Quanto spesso giochi una carta appena sotto quella vincente per evitare di prendere la mano. Un valore alto indica gioco prudente.',
      'scarico-punti': 'Quanto spesso scarichi carte di valore (Assi, figure) quando non hai il seme richiesto. Un valore alto indica gioco aggressivo nello scaricare punti sugli altri.'
    };
    function _showTip(key, btnEl) {
      var tip = document.getElementById('info-tooltip');
      if (!tip) return;
      var text = _tipDescriptions[key] || '';
      tip.innerHTML = '<span class="close-tip" onclick="document.getElementById(\'info-tooltip\').classList.remove(\'visible\')">&times;</span>' + text;
      // Position near the button
      var rect = btnEl.getBoundingClientRect();
      var tipW = Math.min(320, window.innerWidth * 0.9);
      var left = Math.min(rect.left, window.innerWidth - tipW - 10);
      if (left < 5) left = 5;
      var top = rect.bottom + 6;
      if (top + 150 > window.innerHeight) top = rect.top - 100;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      tip.style.maxWidth = tipW + 'px';
      tip.classList.add('visible');
      // Auto-close after 6s
      clearTimeout(tip._timer);
      tip._timer = setTimeout(function(){ tip.classList.remove('visible'); }, 6000);
    }
    // Close tooltip on outside tap
    document.addEventListener('click', function(e) {
      if (!e.target.classList.contains('info-btn')) {
        var tip = document.getElementById('info-tooltip');
        if (tip) tip.classList.remove('visible');
      }
    });

    (function loadLocalStats() {
      try {
        var raw = localStorage.getItem('tresette_player_profiles');
        if (!raw) return;
        var profiles = JSON.parse(raw);
        var skillLabels = [
          {max:24, label:'Principiante', color:'#e53935'},
          {max:39, label:'Base', color:'#ff9800'},
          {max:54, label:'Intermedio', color:'#fdd835'},
          {max:69, label:'Avanzato', color:'#43a047'},
          {max:84, label:'Esperto', color:'#1e88e5'},
          {max:100, label:'Maestro', color:'#7b1fa2'}
        ];
        function getSkillInfo(level) {
          for (var i = 0; i < skillLabels.length; i++) {
            if (level <= skillLabels[i].max) return skillLabels[i];
          }
          return skillLabels[skillLabels.length - 1];
        }
        function infoBtn(key) {
          return ' <span class="info-btn" onclick="_showTip(\'' + key + '\', this)" title="Clicca per info">ℹ</span>';
        }
        var detailsHtml = '';
        ['perdere', 'vincere'].forEach(function(mode) {
          var p = profiles[mode];
          if (!p) return;
          var el = function(id) { return document.getElementById(id); };
          if (el('local-games-' + mode)) el('local-games-' + mode).textContent = p.gamesPlayed || 0;
          if (el('local-wins-' + mode)) el('local-wins-' + mode).textContent = p.gamesWon || 0;
          if (el('local-skill-' + mode)) {
            var sk = Math.round(p.skillLevel || 0);
            var info = getSkillInfo(sk);
            el('local-skill-' + mode).innerHTML = '<span style="color:' + info.color + ';font-weight:bold">' + sk + '</span> <small style="color:' + info.color + '">' + info.label + '</small>';
          }
          if (p.gamesPlayed > 0) {
            var winRate = Math.round((p.gamesWon / p.gamesPlayed) * 100);
            var modeLabel = mode === 'perdere' ? 'A Perdere' : 'A Vincere';
            var modeIcon = mode === 'perdere' ? '🔻' : '🔺';
            detailsHtml += '<div style="margin-bottom:14px;padding:14px 16px;background:#f8f9fa;border-radius:10px;border:1px solid #e0e0e0">';
            detailsHtml += '<h4 style="margin:0 0 10px;color:#2a6a2a;font-size:1rem">' + modeIcon + ' ' + modeLabel + '</h4>';
            detailsHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.88rem">';
            // Row items with info buttons
            detailsHtml += '<div style="padding:6px 0"><b>% Vittorie</b>' + infoBtn('perc-vittorie') + '<br><span style="font-size:1.2em;color:#2a6a2a">' + winRate + '%</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Partite</b><br><span style="font-size:1.2em">' + (p.gamesPlayed || 0) + '</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Vittorie</b><br><span style="font-size:1.2em">' + (p.gamesWon || 0) + '</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Bravura</b>' + infoBtn('bravura') + '<br><span style="font-size:1.2em">' + Math.round(p.skillLevel || 0) + '/100</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Punti medi</b>' + infoBtn('punti-medi') + '<br><span style="font-size:1.2em">' + (p.avgScorePerGame ? p.avgScorePerGame.toFixed(1) : '—') + '</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Tendenza</b>' + infoBtn('tendenza') + '<br><span style="font-size:1.2em">' + (p.emaWinRate ? (p.emaWinRate * 100).toFixed(0) + '%' : '—') + '</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Sottogiocare</b>' + infoBtn('sottogiocare') + '<br><span style="font-size:1.2em">' + (p.duckRate ? (p.duckRate * 100).toFixed(0) + '%' : '—') + '</span></div>';
            detailsHtml += '<div style="padding:6px 0"><b>Scarico punti</b>' + infoBtn('scarico-punti') + '<br><span style="font-size:1.2em">' + (p.pointDumpRate ? (p.pointDumpRate * 100).toFixed(0) + '%' : '—') + '</span></div>';
            detailsHtml += '</div></div>';
          }
        });
        var detailsEl = document.getElementById('local-skill-details');
        if (detailsEl && detailsHtml) detailsEl.innerHTML = detailsHtml;
        else if (detailsEl) detailsEl.innerHTML = '<p style="color:#999;text-align:center;font-style:italic">Nessuna partita giocata ancora su questo dispositivo. Torna a giocare! 🃏</p>';
      } catch(e) {
        console.warn('Error loading local stats:', e);
      }
    })();

    function _fmtDuration(ms) {
      if (!ms || ms <= 0) return '—';
      var sec = Math.floor(ms / 1000);
      var min = Math.floor(sec / 60);
      sec = sec % 60;
      var hrs = Math.floor(min / 60);
      min = min % 60;
      if (hrs > 0) return hrs + 'h ' + min + 'm ' + sec + 's';
      if (min > 0) return min + 'm ' + sec + 's';
      return sec + 's';
    }

    // Ascolta lo stato di autenticazione
    auth.onAuthStateChanged(user => {
      if (user) {
        // Loggato — check if admin
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';
        document.getElementById('user-email').style.display = 'inline';
        document.getElementById('user-email').textContent = user.email;
        _loadHeaderDisplayName(user);
        _checkAdminRole(user);
      } else {
        // Disconnesso
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('dashboard-section').style.display = 'none';
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
        document.getElementById('user-email').style.display = 'none';
        document.getElementById('user-email').textContent = '';
        document.getElementById('header-display-name').style.display = 'none';
      }
    });

    // Display name in header
    function _loadHeaderDisplayName(user) {
      var el = document.getElementById('header-display-name');
      // Listen for changes to display name in DB
      db.ref('users/' + user.uid + '/displayName').on('value', function(snap) {
        var name = snap.val() || user.displayName || '';
        if (name) {
          el.textContent = '👤 ' + name;
          el.style.display = 'inline';
        } else {
          el.textContent = '👤 ' + (user.email ? user.email.split('@')[0] : '');
          el.style.display = 'inline';
        }
      }, function() {
        // fallback if can't read
        var name = user.displayName || (user.email ? user.email.split('@')[0] : '');
        if (name) {
          el.textContent = '👤 ' + name;
          el.style.display = 'inline';
        }
      });
    }

    // Modal cambio nome
    function openNameModal() {
      var user = auth.currentUser;
      if (!user) return;
      var el = document.getElementById('header-display-name');
      var currentName = (el.textContent || '').replace(/^👤\s*/, '');
      document.getElementById('name-modal-input').value = currentName;
      document.getElementById('name-modal-msg').textContent = '';
      document.getElementById('name-modal-overlay').classList.add('active');
      document.getElementById('name-modal-input').focus();
    }

    function closeNameModal() {
      document.getElementById('name-modal-overlay').classList.remove('active');
    }

    function saveDisplayName() {
      var user = auth.currentUser;
      if (!user) return;
      var newName = document.getElementById('name-modal-input').value.trim();
      var msgEl = document.getElementById('name-modal-msg');
      if (!newName) {
        msgEl.style.color = 'red';
        msgEl.textContent = 'Il nome non può essere vuoto.';
        return;
      }
      if (newName.length > 30) {
        msgEl.style.color = 'red';
        msgEl.textContent = 'Il nome non può superare i 30 caratteri.';
        return;
      }
      msgEl.style.color = '#888';
      msgEl.textContent = 'Salvataggio...';

      // Update in Firebase DB
      var updates = {};
      updates['users/' + user.uid + '/displayName'] = newName;
      // Also update in admins if the user is admin
      if (_admins[user.uid]) {
        updates['admins/' + user.uid + '/displayName'] = newName;
      }
      db.ref().update(updates).then(function() {
        // Also update Firebase Auth profile
        return user.updateProfile({ displayName: newName });
      }).then(function() {
        msgEl.style.color = 'green';
        msgEl.textContent = '✅ Nome aggiornato!';
        // Update welcome message if in user section
        var welcomeEl = document.getElementById('user-welcome');
        if (welcomeEl && document.getElementById('user-section').style.display !== 'none') {
          welcomeEl.textContent = 'Ciao ' + newName + '!';
        }
        setTimeout(closeNameModal, 800);
      }).catch(function(e) {
        msgEl.style.color = 'red';
        msgEl.textContent = 'Errore: ' + e.message;
      });
    }

    // Funzione Login
    function login() {
      const email = document.getElementById('email').value;
      const pwd = document.getElementById('password').value;
      const errEl = document.getElementById('login-error');
      
      auth.signInWithEmailAndPassword(email, pwd)
        .catch(error => {
          errEl.style.display = 'block';
          errEl.textContent = 'Errore di accesso: ' + error.message;
        });
    }

    // Funzione Logout
    function logout() {
      auth.signOut();
    }

    // Check admin role and show appropriate dashboard
    var _isAdmin = false;
    var _userChartInstance = null;

    function _checkAdminRole(user) {
      db.ref('admins/' + user.uid).once('value', function(snap) {
        if (snap.exists()) {
          // ADMIN — show full dashboard AND personal stats
          _isAdmin = true;
          document.getElementById('dashboard-section').style.display = 'block';
          document.getElementById('user-section').style.display = 'block';
          document.getElementById('user-welcome').textContent = 'Ciao ' + (user.displayName || user.email) + '!';
          loadData();
          loadLiveData();
          loadAdmins();
          loadAdminSocial();
          loadUserStats(user);
          loadUserSocial(user);
        } else {
          _showNormalUser(user);
        }
      }, function(err) {
        // Permission denied or network error — treat as normal user
        _showNormalUser(user);
      });
    }

    function _showNormalUser(user) {
      _isAdmin = false;
      document.getElementById('dashboard-section').style.display = 'none';
      document.getElementById('user-section').style.display = 'block';
      document.getElementById('user-welcome').textContent = 'Ciao ' + (user.displayName || user.email) + '!';
      loadUserStats(user);
      loadUserSocial(user);
    }

        function _skillLabel(s) { return s < 25 ? 'Principiante' : s < 40 ? 'Base' : s < 55 ? 'Intermedio' : s < 70 ? 'Avanzato' : s < 85 ? 'Esperto' : 'Maestro'; }
    function _skillColor(s) { return s < 25 ? '#e53935' : s < 40 ? '#ff9800' : s < 55 ? '#fdd835' : s < 70 ? '#43a047' : s < 85 ? '#1e88e5' : s < 100 ? '#7b1fa2' : '#7b1fa2'; }
    function _showSkillCard(el, detEl, profiles) {
      var parts = [];
      ['perdere','vincere'].forEach(function(mode) {
        var p = profiles ? profiles[mode] : null;
        if (p && typeof p.skillLevel === 'number' && p.gamesPlayed > 0) {
          var icon = mode === 'vincere' ? '\uD83D\uDD3A' : '\uD83D\uDD3B';
          var winPct = Math.round(p.gamesWon / p.gamesPlayed * 100);
          parts.push(icon + ' ' + p.skillLevel + '/100 <span style="font-size:0.7rem;color:#888">(' + _skillLabel(p.skillLevel) + ', ' + winPct + '% vitt., ' + p.gamesPlayed + ' part.)</span>');
        }
      });
      if (parts.length > 0) {
        el.innerHTML = parts.join('<br>');
        var best = Math.max((profiles && profiles.perdere && profiles.perdere.skillLevel) || 0, (profiles && profiles.vincere && profiles.vincere.skillLevel) || 0);
        el.style.color = _skillColor(best);
        if (detEl) detEl.textContent = '';
      } else {
        el.textContent = '\u2014';
        el.style.color = '';
        if (detEl) detEl.textContent = 'Gioca qualche partita per attivare';
      }
    }

    function loadUserStats(user) {
      db.ref('users/' + user.uid + '/playerProfiles').on('value', function(snap) {
        var profiles = snap.val();
        var skillEl = document.getElementById('user-skill');
        var detailEl = document.getElementById('user-skill-detail');
        if (profiles) {
          _showSkillCard(skillEl, detailEl, profiles);
        } else {
          db.ref('users/' + user.uid + '/playerProfile').once('value', function(oldSnap) {
            var old = oldSnap.val();
            if (old && typeof old.skillLevel === 'number') {
              _showSkillCard(skillEl, detailEl, { perdere: old, vincere: null });
            } else {
              skillEl.textContent = '\u2014'; skillEl.style.color = '';
              detailEl.textContent = 'Gioca qualche partita per attivare';
            }
          });
        }
      }, function() {});

      // Try loading user's own profile data first
      db.ref('users/' + user.uid).once('value', function(profileSnap) {
        var profile = profileSnap.val();
        if (profile && profile.displayName) {
          document.getElementById('user-welcome').textContent = 'Ciao ' + profile.displayName + '!';
        }
      }, function() { /* ignore profile read errors */ });

      // Strategy: load from BOTH per-user path AND global path, merge, deduplicate.
      // We load global games fully (not via query index, which may not exist) and filter client-side.
      var perUserEntries = [];
      var globalMatchingEntries = [];
      var perUserDone = false;
      var globalDone = false;

      function _onBothLoaded() {
        if (!perUserDone || !globalDone) return;

        // Merge: deduplicate by timestamp+type+duration
        var merged = {};
        perUserEntries.forEach(function(e) {
          var key = (e.timestamp || 0) + '_' + (e.type || '') + '_' + (e.durationMs || 0);
          merged[key] = e;
        });
        globalMatchingEntries.forEach(function(e) {
          var key = (e.timestamp || 0) + '_' + (e.type || '') + '_' + (e.durationMs || 0);
          if (!merged[key]) merged[key] = e;
        });

        var allEntries = Object.values(merged);
        var total = allEntries.length, cpu = 0, mp = 0;
        allEntries.forEach(function(entry) {
          if (entry.type === 'CPU') cpu++;
          else mp++;
        });

        // If global had extra entries not in per-user, backfill them now
        if (allEntries.length > perUserEntries.length) {
          globalMatchingEntries.forEach(function(e) {
            var key = (e.timestamp || 0) + '_' + (e.type || '') + '_' + (e.durationMs || 0);
            var alreadyInUser = perUserEntries.some(function(pu) {
              return (pu.timestamp || 0) + '_' + (pu.type || '') + '_' + (pu.durationMs || 0) === key;
            });
            if (!alreadyInUser) {
              db.ref('users/' + user.uid + '/gameStats').push().set(e).catch(function(){});
            }
          });
        }

        document.getElementById('user-total').textContent = total;
        document.getElementById('user-cpu').textContent = cpu;
        document.getElementById('user-mp').textContent = mp;
        document.getElementById('user-stats-error').style.display = 'none';

        if (total === 0) {
          document.getElementById('user-stats-error').style.display = 'block';
          document.getElementById('user-stats-error').textContent = 'Nessuna partita registrata ancora. Gioca una partita per vedere le tue statistiche!';
          document.getElementById('user-stats-error').style.color = '#888';
        }

        // Chart
        if (total > 0) {
          var ctx = document.getElementById('userChart').getContext('2d');
          if (_userChartInstance) _userChartInstance.destroy();
          _userChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: ['CPU', 'Multiplayer'],
              datasets: [{ data: [cpu, mp], backgroundColor: ['#4caf50', '#2196f3'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
          });
        }

        // Render game history table
        _renderUserGameHistory(allEntries);
      }

      // 1. Per-user stats
      db.ref('users/' + user.uid + '/gameStats').once('value', function(snap) {
        var data = snap.val() || {};
        perUserEntries = Object.values(data);
        console.log('[STATS] Per-user entries found:', perUserEntries.length);
        perUserDone = true;
        _onBothLoaded();
      }, function(err) {
        console.warn('[STATS] Per-user read failed:', err.message);
        perUserEntries = [];
        perUserDone = true;
        _onBothLoaded();
      });

      // 2. Global stats — load ALL and filter client-side by uid
      //    (orderByChild requires .indexOn in Firebase rules which may not be configured)
      db.ref('statistics/games').once('value', function(globalSnap) {
        var allGlobal = globalSnap.val() || {};
        globalMatchingEntries = [];
        Object.values(allGlobal).forEach(function(entry) {
          if (entry && entry.uid === user.uid) {
            globalMatchingEntries.push(entry);
          }
        });
        console.log('[STATS] Global entries matching uid:', globalMatchingEntries.length, '(total global:', Object.keys(allGlobal).length + ')');
        globalDone = true;
        _onBothLoaded();
      }, function(err) {
        console.warn('[STATS] Global stats read failed:', err.message);
        globalMatchingEntries = [];
        globalDone = true;
        _onBothLoaded();
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  USER GAME HISTORY TABLE
    // ═══════════════════════════════════════════════════════════
    var _userGamesList = [];
    var _userGamesPage = 0;
    var _userGamesPerPage = 10;

    var _userSkillChartInstance = null;

    function _renderUserGameHistory(entries) {
      _userGamesList = entries.slice().sort(function(a, b) {
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      _userGamesPage = 0;
      _renderUserGamesPage();
      _renderUserSkillChart(entries);
    }

    function _renderUserSkillChart(entries) {
      var canvas = document.getElementById('userSkillChart');
      var msgEl = document.getElementById('user-skill-chart-msg');
      if (!canvas) return;

      // Split entries by mode (perdere/vincere)
      var perdereData = entries.filter(function(e) {
        return typeof e.skillLevel === 'number' && e.timestamp && (e.skillMode === 'perdere' || (!e.skillMode && e.gameMode === 'perdere') || !e.skillMode);
      }).sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

      var vincereData = entries.filter(function(e) {
        return typeof e.skillLevel === 'number' && e.timestamp && (e.skillMode === 'vincere' || (!e.skillMode && e.gameMode === 'vincere'));
      }).sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

      var totalData = perdereData.length + vincereData.length;
      if (totalData < 2) {
        if (msgEl) msgEl.textContent = totalData === 0
          ? 'Nessun dato di bravura disponibile. Gioca qualche partita!'
          : 'Servono almeno 2 partite per mostrare il grafico.';
        if (_userSkillChartInstance) { _userSkillChartInstance.destroy(); _userSkillChartInstance = null; }
        return;
      }
      if (msgEl) msgEl.textContent = '';

      // Build datasets
      var datasets = [];
      if (perdereData.length >= 2) {
        datasets.push({
          label: '🔻 A Perdere',
          data: perdereData.map(function(e) { return { x: new Date(e.timestamp), y: e.skillLevel }; }),
          borderColor: '#e65100',
          backgroundColor: 'rgba(230, 81, 0, 0.08)',
          fill: false,
          tension: 0.3,
          pointBackgroundColor: perdereData.map(function(e) {
            var v = e.skillLevel;
            return v < 25 ? '#e53935' : v < 40 ? '#ff9800' : v < 55 ? '#fdd835' : v < 70 ? '#43a047' : v < 85 ? '#1e88e5' : '#7b1fa2';
          }),
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2
        });
      }
      if (vincereData.length >= 2) {
        datasets.push({
          label: '🔺 A Vincere',
          data: vincereData.map(function(e) { return { x: new Date(e.timestamp), y: e.skillLevel }; }),
          borderColor: '#7b1fa2',
          backgroundColor: 'rgba(123, 31, 162, 0.08)',
          fill: false,
          tension: 0.3,
          pointBackgroundColor: vincereData.map(function(e) {
            var v = e.skillLevel;
            return v < 25 ? '#e53935' : v < 40 ? '#ff9800' : v < 55 ? '#fdd835' : v < 70 ? '#43a047' : v < 85 ? '#1e88e5' : '#7b1fa2';
          }),
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          borderDash: [5, 3]
        });
      }

      if (datasets.length === 0) {
        if (msgEl) msgEl.textContent = 'Servono almeno 2 partite nella stessa modalità per mostrare il grafico.';
        if (_userSkillChartInstance) { _userSkillChartInstance.destroy(); _userSkillChartInstance = null; }
        return;
      }

      var ctx = canvas.getContext('2d');
      if (_userSkillChartInstance) _userSkillChartInstance.destroy();

      _userSkillChartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
          responsive: true,
          plugins: {
            legend: { display: datasets.length > 1 },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  var v = ctx.parsed.y;
                  var label = v < 25 ? 'Principiante' : v < 40 ? 'Base' : v < 55 ? 'Intermedio' : v < 70 ? 'Avanzato' : v < 85 ? 'Esperto' : 'Maestro';
                  return ctx.dataset.label + ': ' + v + '/100 (' + label + ')';
                }
              }
            }
          },
          scales: {
            y: {
              min: 0, max: 100,
              title: { display: true, text: 'Livello Bravura' },
              ticks: { stepSize: 10 }
            },
            x: {
              type: 'time',
              time: { unit: 'day', displayFormats: { day: 'dd/MM', hour: 'dd/MM HH:mm' } },
              title: { display: true, text: 'Data' },
              ticks: { maxRotation: 45, font: { size: 9 } }
            }
          }
        }
      });
    }

    function _renderUserGamesPage() {
      var tbody = document.getElementById('user-games-tbody');
      if (!tbody) return;
      var total = _userGamesList.length;
      if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="padding:16px;color:#888">Nessuna partita trovata.</td></tr>';
        document.getElementById('user-games-page-info').textContent = '';
        document.getElementById('user-games-prev').disabled = true;
        document.getElementById('user-games-next').disabled = true;
        return;
      }
      var start = _userGamesPage * _userGamesPerPage;
      var end = Math.min(start + _userGamesPerPage, total);
      var pageItems = _userGamesList.slice(start, end);
      var html = '';
      pageItems.forEach(function(entry, idx) {
        var num = start + idx + 1;
        var dateStr = entry.timestamp ? new Date(entry.timestamp).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
        var typeBadge = entry.type === 'CPU'
          ? '<span class="badge badge-cpu">CPU</span>'
          : '<span class="badge badge-host">Multiplayer</span>';
        var modeStr = (entry.gameMode === 'vincere') ? 'A Vincere' : 'A Perdere';
        var diffStr = (entry.difficulty || 'medio').charAt(0).toUpperCase() + (entry.difficulty || 'medio').slice(1);
        var tricks = entry.tricksPlayed || 0;
        var durStr = '—';
        if (entry.durationMs && entry.durationMs > 0) {
          var secs = Math.floor(entry.durationMs / 1000);
          var mins = Math.floor(secs / 60);
          var remSecs = secs % 60;
          durStr = mins + ':' + (remSecs < 10 ? '0' : '') + remSecs;
        }
        // Result badge
        var resultBadge = '—';
        if (entry.completed) {
          if (entry.result === 'win') {
            resultBadge = '<span class="badge badge-completed">' + (entry.volo ? '🚀 Volo!' : '✅ Vittoria') + '</span>';
          } else if (entry.result === 'lose') {
            resultBadge = '<span class="badge badge-incomplete">❌ Sconfitta</span>';
          } else if (entry.result === 'draw') {
            resultBadge = '<span class="badge" style="background:#ff9800;color:#fff">🤝 Parità</span>';
          } else {
            resultBadge = '<span class="badge" style="background:#888;color:#fff">—</span>';
          }
        } else {
          resultBadge = '<span style="color:#999;font-size:0.8rem">—</span>';
        }
        // Score display
        var scoreStr = '—';
        if (entry.completed && entry.scores && entry.playerNames) {
          var parts = [];
          for (var si = 0; si < entry.scores.length; si++) {
            var t = entry.scores[si];
            var w = Math.floor(t / 3);
            var f = t % 3;
            var ps = '' + w;
            if (f === 1) ps = w > 0 ? w + '⅓' : '⅓';
            else if (f === 2) ps = w > 0 ? w + '⅔' : '⅔';
            parts.push((entry.playerNames[si] || ('P'+(si+1))) + ' ' + ps);
          }
          scoreStr = '<span style="font-size:0.75rem">' + parts.join(', ') + '</span>';
        } else if (entry.completed && typeof entry.playerScore === 'number') {
          var t2 = entry.playerScore;
          var w2 = Math.floor(t2 / 3);
          var f2 = t2 % 3;
          var ps2 = '' + w2;
          if (f2 === 1) ps2 = w2 > 0 ? w2 + '⅓' : '⅓';
          else if (f2 === 2) ps2 = w2 > 0 ? w2 + '⅔' : '⅔';
          scoreStr = 'Tu: ' + ps2 + ' pt';
        }
        var statusBadge = entry.completed
          ? '<span class="badge badge-completed">Completata</span>'
          : '<span class="badge badge-incomplete">Abbandonata</span>';
        html += '<tr>';
        html += '<td>' + num + '</td>';
        html += '<td style="font-size:0.8rem">' + dateStr + '</td>';
        html += '<td>' + typeBadge + '</td>';
        html += '<td>' + modeStr + '</td>';
        html += '<td>' + diffStr + '</td>';
        html += '<td>' + resultBadge + '</td>';
        html += '<td>' + scoreStr + '</td>';
        // Skill level badge
        var skillBadge1 = '\u2014';
        if (typeof entry.skillLevel === 'number') {
          var sk1 = entry.skillLevel;
          var skC1 = sk1 < 25 ? '#e53935' : sk1 < 40 ? '#ff9800' : sk1 < 55 ? '#fdd835' : sk1 < 70 ? '#43a047' : sk1 < 85 ? '#1e88e5' : '#7b1fa2';
          var skFg1 = (sk1 >= 40 && sk1 < 55) ? '#333' : '#fff';
          var skMode1 = entry.skillMode === 'vincere' ? '\ud83d\udd3a' : '\ud83d\udd3b';
          skillBadge1 = '<span class=\"badge\" style=\"background:' + skC1 + ';color:' + skFg1 + '\">' + skMode1 + ' ' + sk1 + '</span>';
        }
        html += '<td>' + skillBadge1 + '</td>';
        html += '<td>' + tricks + '</td>';
        html += '<td>' + durStr + '</td>';
        html += '<td>' + statusBadge + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
      var totalPages = Math.ceil(total / _userGamesPerPage);
      document.getElementById('user-games-page-info').textContent = 'Pagina ' + (_userGamesPage + 1) + ' di ' + totalPages + ' (' + total + ' partite)';
      document.getElementById('user-games-prev').disabled = (_userGamesPage <= 0);
      document.getElementById('user-games-next').disabled = (end >= total);
    }

    function userGamesPagePrev() {
      if (_userGamesPage > 0) { _userGamesPage--; _renderUserGamesPage(); }
    }
    function userGamesPageNext() {
      var maxPage = Math.ceil(_userGamesList.length / _userGamesPerPage) - 1;
      if (_userGamesPage < maxPage) { _userGamesPage++; _renderUserGamesPage(); }
    }

    // Caricamento Dati
    var _rawGames = [];
    var _rawGamesKeyed = []; // entries with Firebase keys for deletion

    function loadData() {
      db.ref('statistics/games').on('value', snapshot => {
        _rawGames = [];
        _rawGamesKeyed = [];
        snapshot.forEach(child => {
          var val = child.val();
          _rawGames.push(val);
          _rawGamesKeyed.push({ key: child.key, val: val });
        });
        renderFilteredData();
      }, error => {
        alert('Errore nel caricamento dei dati: per favore controlla le Security Rules di Firebase. \n' + error.message);
      });
    }

    function applyDateFilter() {
      renderFilteredData();
      renderFilteredLiveData();
    }

    function resetDateFilter() {
      document.getElementById('filter-from').value = '';
      document.getElementById('filter-to').value = '';
      renderFilteredData();
      renderFilteredLiveData();
    }

    function renderFilteredData() {
      var fromVal = document.getElementById('filter-from').value;
      var toVal = document.getElementById('filter-to').value;
      var fromTs = fromVal ? new Date(fromVal).getTime() : 0;
      var toTs = toVal ? new Date(toVal + 'T23:59:59').getTime() : Infinity;

      let cpu = 0, host = 0, client = 0, total = 0;
      let versions = {};
      let dailyCpu = {}, dailyMp = {};
      let durations = [];
      let minDur = null, maxDur = null;

      _rawGames.forEach(data => {
        var ts = data.timestamp ? new Date(data.timestamp).getTime() : 0;
        if (ts < fromTs || ts > toTs) return;

        total++;
        if (data.type === 'CPU') cpu++;
        if (data.type === 'Multiplayer') {
          if (data.role === 'Host') host++;
          if (data.role === 'Client') client++;
        }

        // Duration tracking
        if (data.durationMs && data.durationMs > 0) {
          durations.push(data.durationMs);
          if (!minDur || data.durationMs < minDur.durationMs) minDur = data;
          if (!maxDur || data.durationMs > maxDur.durationMs) maxDur = data;
        }

        let v = data.version || 'sviluppo';
        versions[v] = (versions[v] || 0) + 1;

        if (data.timestamp) {
          let d = new Date(data.timestamp);
          let key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0');
          if (data.type === 'CPU') {
            dailyCpu[key] = (dailyCpu[key] || 0) + 1;
          } else {
            dailyMp[key] = (dailyMp[key] || 0) + 1;
          }
        }
      });

      document.getElementById('count-cpu').textContent = cpu;
      document.getElementById('count-host').textContent = host;
      document.getElementById('count-client').textContent = client;
      document.getElementById('count-total').textContent = total;

      // Duration stats
      if (durations.length > 0) {
        var totalDurMs = durations.reduce(function(a, b){ return a + b; }, 0);
        var avgMs = totalDurMs / durations.length;
        document.getElementById('dur-avg').textContent = _fmtDuration(avgMs);
        document.getElementById('dur-total').textContent = _fmtDuration(totalDurMs);
        document.getElementById('dur-min').textContent = _fmtDuration(minDur.durationMs);
        document.getElementById('dur-min-info').textContent = (minDur.type || '') + (minDur.role ? ' ' + minDur.role : '') + ' — ' + (minDur.tricksPlayed != null ? minDur.tricksPlayed + '/10 mani' : '') + (minDur.timestamp ? ' — ' + new Date(minDur.timestamp).toLocaleDateString('it-IT') : '');
        document.getElementById('dur-max').textContent = _fmtDuration(maxDur.durationMs);
        document.getElementById('dur-max-info').textContent = (maxDur.type || '') + (maxDur.role ? ' ' + maxDur.role : '') + ' — ' + (maxDur.tricksPlayed != null ? maxDur.tricksPlayed + '/10 mani' : '') + (maxDur.timestamp ? ' — ' + new Date(maxDur.timestamp).toLocaleDateString('it-IT') : '');
      } else {
        document.getElementById('dur-avg').textContent = '—';
        document.getElementById('dur-total').textContent = '—';
        document.getElementById('dur-min').textContent = '—';
        document.getElementById('dur-min-info').textContent = 'Nessun dato';
        document.getElementById('dur-max').textContent = '—';
        document.getElementById('dur-max-info').textContent = 'Nessun dato';
      }

      let ul = document.getElementById('version-list');
      ul.innerHTML = '';
      let sortedVersions = Object.entries(versions).sort((a, b) => b[1] - a[1]);
      for(let [v, count] of sortedVersions) {
         let li = document.createElement('li');
         li.style.padding = "5px 0";
         li.style.borderBottom = "1px solid #ccc";
         li.style.display = "flex";
         li.style.justifyContent = "space-between";
         li.style.alignItems = "center";
         li.innerHTML = `<strong>v${v}</strong><span style="min-width:40px;text-align:right;font-variant-numeric:tabular-nums">${count}</span>`;
         ul.appendChild(li);
      }

      renderChart(cpu, host, client);
      renderDailyChart(dailyCpu, dailyMp);
      renderGamesTable();
    }

  // ═══════════════════════════════════════════════════════════
  //  LISTA ULTIME PARTITE — paginated table
  // ═══════════════════════════════════════════════════════════
  var _gamesPage = 0;
  var _gamesPerPage = 20;
  var _filteredGames = [];

  function renderGamesTable() {
    var fromVal = document.getElementById('filter-from').value;
    var toVal = document.getElementById('filter-to').value;
    var fromTs = fromVal ? new Date(fromVal).getTime() : 0;
    var toTs = toVal ? new Date(toVal + 'T23:59:59').getTime() : Infinity;

    _filteredGames = _rawGames.filter(function(g) {
      var ts = g.timestamp ? new Date(g.timestamp).getTime() : 0;
      return ts >= fromTs && ts <= toTs;
    });
    // Sort descending by timestamp (most recent first)
    _filteredGames.sort(function(a, b) {
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    _gamesPage = 0;
    _renderGamesPage();
  }

  function _renderGamesPage() {
    var tbody = document.getElementById('games-tbody');
    var total = _filteredGames.length;
    var totalPages = Math.max(1, Math.ceil(total / _gamesPerPage));
    var start = _gamesPage * _gamesPerPage;
    var end = Math.min(start + _gamesPerPage, total);
    var pageGames = _filteredGames.slice(start, end);

    if (total === 0) {
      tbody.innerHTML = '<tr><td colspan="13" style="padding:16px;color:#888">Nessuna partita trovata.</td></tr>';
    } else {
      var html = '';
      pageGames.forEach(function(g, idx) {
        var num = total - start - idx;
        var dateStr = g.timestamp ? new Date(g.timestamp).toLocaleString('it-IT', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
        var typeBadge = g.type === 'CPU'
          ? '<span class="badge badge-cpu">CPU</span>'
          : '<span class="badge badge-host">MP</span>';
        var modeBadge = g.gameMode === 'vincere'
          ? '<span class="badge" style="background:#7b1fa2">🔺 Vincere</span>'
          : '<span class="badge" style="background:#e65100">🔻 Perdere</span>';
        var roleBadge = '';
        if (g.type === 'Multiplayer') {
          roleBadge = g.role === 'Host'
            ? '<span class="badge badge-host">Host</span>'
            : '<span class="badge badge-client">Client</span>';
        } else {
          roleBadge = '<span style="color:#888">—</span>';
        }
        var diff = g.type === 'CPU' ? (g.difficulty || '—') : '<span style="color:#888">—</span>';
        // Risultato
        var resultBadge = '—';
        if (g.completed) {
          if (g.result === 'win') {
            resultBadge = '<span class="badge badge-completed">' + (g.volo ? '🚀 Volo!' : '✅ Vittoria') + '</span>';
          } else if (g.result === 'lose') {
            resultBadge = '<span class="badge badge-incomplete">❌ Sconfitta</span>';
          } else if (g.result === 'draw') {
            resultBadge = '<span class="badge" style="background:#ff9800;color:#fff">🤝 Parità</span>';
          } else {
            resultBadge = '<span class="badge" style="background:#888;color:#fff">—</span>';
          }
        } else {
          resultBadge = '<span style="color:#999;font-size:0.8rem">—</span>';
        }
        // Punteggio
        var scoreStr = '—';
        if (g.completed && g.scores && g.playerNames) {
          var parts = [];
          for (var si = 0; si < g.scores.length; si++) {
            var t = g.scores[si];
            var w = Math.floor(t / 3);
            var f = t % 3;
            var ps = '' + w;
            if (f === 1) ps = w > 0 ? w + '⅓' : '⅓';
            else if (f === 2) ps = w > 0 ? w + '⅔' : '⅔';
            parts.push((g.playerNames[si] || ('P'+(si+1))) + ' ' + ps);
          }
          scoreStr = '<span style="font-size:0.75rem">' + parts.join(', ') + '</span>';
        } else if (g.completed && typeof g.playerScore === 'number') {
          var t2 = g.playerScore;
          var w2 = Math.floor(t2 / 3);
          var f2 = t2 % 3;
          var ps2 = '' + w2;
          if (f2 === 1) ps2 = w2 > 0 ? w2 + '⅓' : '⅓';
          else if (f2 === 2) ps2 = w2 > 0 ? w2 + '⅔' : '⅔';
          scoreStr = 'Tu: ' + ps2 + ' pt';
        }
        var tricks = g.tricksPlayed != null ? g.tricksPlayed + '/10' : '—';
        var dur = _fmtDuration(g.durationMs);
        var statusBadge = g.completed
          ? '<span class="badge badge-completed">Completata</span>'
          : '<span class="badge badge-incomplete">Abbandonata</span>';
        var ver = g.version || '—';

        html += '<tr>';
        html += '<td>' + num + '</td>';
        html += '<td style="white-space:nowrap">' + dateStr + '</td>';
        html += '<td>' + typeBadge + '</td>';
        html += '<td>' + modeBadge + '</td>';
        html += '<td>' + roleBadge + '</td>';
        html += '<td>' + diff + '</td>';
        html += '<td>' + resultBadge + '</td>';
        html += '<td>' + scoreStr + '</td>';
        // Skill level badge
        var skillBadge2 = '\u2014';
        if (typeof g.skillLevel === 'number') {
          var sk2 = g.skillLevel;
          var skC2 = sk2 < 25 ? '#e53935' : sk2 < 40 ? '#ff9800' : sk2 < 55 ? '#fdd835' : sk2 < 70 ? '#43a047' : sk2 < 85 ? '#1e88e5' : '#7b1fa2';
          var skFg2 = (sk2 >= 40 && sk2 < 55) ? '#333' : '#fff';
          var skMode2 = g.skillMode === 'vincere' ? '\ud83d\udd3a' : '\ud83d\udd3b';
          skillBadge2 = '<span class=\"badge\" style=\"background:' + skC2 + ';color:' + skFg2 + '\">' + skMode2 + ' ' + sk2 + '</span>';
        }
        html += '<td>' + skillBadge2 + '</td>';
        html += '<td>' + tricks + '</td>';
        html += '<td>' + dur + '</td>';
        html += '<td>' + statusBadge + '</td>';
        html += '<td>' + ver + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    // Pager
    document.getElementById('games-page-info').textContent = 'Pagina ' + (_gamesPage + 1) + ' di ' + totalPages + ' (' + total + ' partite)';
    document.getElementById('games-prev').disabled = (_gamesPage <= 0);
    document.getElementById('games-next').disabled = (_gamesPage >= totalPages - 1);
  }

  function gamesPagePrev() {
    if (_gamesPage > 0) { _gamesPage--; _renderGamesPage(); }
  }
  function gamesPageNext() {
    var totalPages = Math.ceil(_filteredGames.length / _gamesPerPage);
    if (_gamesPage < totalPages - 1) { _gamesPage++; _renderGamesPage(); }
  }

  var _rawRooms = {};
  var _rawLobby = {};

  function loadLiveData() {
    // Ascolta le stanze attive
    db.ref('rooms').on('value', snapshot => {
      _rawRooms = snapshot.val() || {};
      renderFilteredLiveData();
    });

    // Ascolta i giocatori in lobby
    db.ref('lobby').on('value', snapshot => {
      _rawLobby = snapshot.val() || {};
      renderFilteredLiveData();
    });
  }

  function renderFilteredLiveData() {
    var fromVal = document.getElementById('filter-from').value;
    var toVal = document.getElementById('filter-to').value;
    var fromTs = fromVal ? new Date(fromVal).getTime() : 0;
    var toTs = toVal ? new Date(toVal + 'T23:59:59').getTime() : Infinity;

    // Filter rooms by meta.hostLease
    var filteredRooms = {};
    for (var code in _rawRooms) {
      var room = _rawRooms[code];
      var lease = (room.meta && room.meta.hostLease) ? room.meta.hostLease : 0;
      if (lease === 0 || (lease >= fromTs && lease <= toTs)) {
        filteredRooms[code] = room;
      }
    }

    // Filter lobby by time
    var filteredLobby = {};
    for (var lcode in _rawLobby) {
      var entry = _rawLobby[lcode];
      var ts = entry.time || 0;
      if (ts === 0 || (ts >= fromTs && ts <= toTs)) {
        filteredLobby[lcode] = entry;
      }
    }

    document.getElementById('count-rooms').textContent = Object.keys(filteredRooms).length;
    document.getElementById('rooms-json').textContent = JSON.stringify(filteredRooms, null, 2);
    document.getElementById('count-lobby').textContent = Object.keys(filteredLobby).length;
    document.getElementById('lobby-json').textContent = JSON.stringify(filteredLobby, null, 2);
  }

  function cleanupOldEntries() {
    var btn = document.getElementById('cleanup-btn');
    var log = document.getElementById('cleanup-log');
    log.style.display = 'block';
    log.textContent = 'Avvio pulizia...\n';
    btn.disabled = true;
    btn.textContent = '⏳ Pulizia in corso...';

    var cutoff = Date.now() - (24 * 60 * 60 * 1000);
    var removedRooms = 0, removedLobby = 0, keptRooms = 0, keptLobby = 0;

    function finish() {
      log.textContent += '\n--- Risultato ---\n';
      log.textContent += 'Rooms rimosse: ' + removedRooms + ' | mantenute: ' + keptRooms + '\n';
      log.textContent += 'Lobby rimosse: ' + removedLobby + ' | mantenute: ' + keptLobby + '\n';
      log.textContent += 'Pulizia completata.';
      btn.disabled = false;
      btn.textContent = '🗑️ Pulisci Rooms e Lobby (> 24h)';
    }

    // Clean rooms
    db.ref('rooms').once('value', function(snap) {
      var rooms = snap.val() || {};
      var roomKeys = Object.keys(rooms);
      log.textContent += 'Trovate ' + roomKeys.length + ' stanze.\n';

      var roomsDone = 0;
      if (roomKeys.length === 0) {
        // proceed to lobby
        cleanLobby();
        return;
      }

      roomKeys.forEach(function(code) {
        var room = rooms[code];
        var lease = (room.meta && room.meta.hostLease) ? room.meta.hostLease : 0;
        if (lease > 0 && lease < cutoff) {
          log.textContent += '  [ROOM] ' + code + ' — lease ' + new Date(lease).toLocaleString() + ' → RIMOSSA\n';
          db.ref('rooms/' + code).remove();
          removedRooms++;
        } else if (lease === 0) {
          // No lease at all — orphan, remove it
          log.textContent += '  [ROOM] ' + code + ' — nessun lease → RIMOSSA\n';
          db.ref('rooms/' + code).remove();
          removedRooms++;
        } else {
          log.textContent += '  [ROOM] ' + code + ' — lease ' + new Date(lease).toLocaleString() + ' → OK\n';
          keptRooms++;
        }
        roomsDone++;
        if (roomsDone === roomKeys.length) cleanLobby();
      });
    });

    function cleanLobby() {
      db.ref('lobby').once('value', function(snap) {
        var lobbies = snap.val() || {};
        var lobbyKeys = Object.keys(lobbies);
        log.textContent += 'Trovate ' + lobbyKeys.length + ' voci in lobby.\n';

        lobbyKeys.forEach(function(code) {
          var entry = lobbies[code];
          var ts = entry.time || 0;
          if (ts > 0 && ts < cutoff) {
            log.textContent += '  [LOBBY] ' + code + ' — ' + new Date(ts).toLocaleString() + ' → RIMOSSA\n';
            db.ref('lobby/' + code).remove();
            removedLobby++;
          } else if (ts === 0) {
            log.textContent += '  [LOBBY] ' + code + ' — nessun timestamp → RIMOSSA\n';
            db.ref('lobby/' + code).remove();
            removedLobby++;
          } else {
            log.textContent += '  [LOBBY] ' + code + ' — ' + new Date(ts).toLocaleString() + ' → OK\n';
            keptLobby++;
          }
        });

        finish();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PULIZIA PARTITE DUPLICATE
  //  In multiplayer, each player writes to statistics/games.
  //  This finds entries with the same scores+timestamp and keeps only one per group.
  // ═══════════════════════════════════════════════════════════
  function cleanupDuplicateGames() {
    var btn = document.getElementById('cleanup-dupes-btn');
    var log = document.getElementById('cleanup-dupes-log');
    log.style.display = 'block';
    log.textContent = 'Analisi partite duplicate in corso...\n';
    btn.disabled = true;
    btn.textContent = '⏳ Analisi in corso...';

    db.ref('statistics/games').once('value', function(snapshot) {
      var entries = [];
      snapshot.forEach(function(child) {
        entries.push({ key: child.key, val: child.val() });
      });

      log.textContent += 'Totale entry nel database: ' + entries.length + '\n';

      // Build a fingerprint for each entry to detect duplicates.
      // Duplicates share the same: type=Multiplayer, scores, playerNames, tricksPlayed,
      // gameMode, and timestamps within 5 seconds of each other.
      function fingerprint(e) {
        var v = e.val;
        var scores = (v.scores && v.scores.length) ? v.scores.join(',') : '';
        var names = (v.playerNames && v.playerNames.length) ? v.playerNames.join(',') : '';
        return [v.type || '', v.gameMode || '', scores, names, v.tricksPlayed || 0, v.completed ? '1' : '0'].join('|');
      }

      // Group entries by fingerprint, then within each group cluster by close timestamps
      var groups = {};
      entries.forEach(function(e) {
        var fp = fingerprint(e);
        if (!groups[fp]) groups[fp] = [];
        groups[fp].push(e);
      });

      var keysToRemove = [];
      var groupsFound = 0;

      Object.keys(groups).forEach(function(fp) {
        var group = groups[fp];
        if (group.length <= 1) return; // no duplicates

        // Sort by timestamp
        group.sort(function(a, b) { return (a.val.timestamp || 0) - (b.val.timestamp || 0); });

        // Cluster entries within 10 seconds of each other
        var clusters = [];
        var currentCluster = [group[0]];
        for (var i = 1; i < group.length; i++) {
          var prevTs = group[i-1].val.timestamp || 0;
          var curTs = group[i].val.timestamp || 0;
          if (curTs - prevTs <= 10000) { // 10 seconds
            currentCluster.push(group[i]);
          } else {
            clusters.push(currentCluster);
            currentCluster = [group[i]];
          }
        }
        clusters.push(currentCluster);

        // For each cluster with >1 entry, keep the best one (prefer Host, or the one with duration)
        clusters.forEach(function(cluster) {
          if (cluster.length <= 1) return;
          groupsFound++;

          // Pick best: prefer Host role, then one with durationMs
          cluster.sort(function(a, b) {
            var aHost = (a.val.role === 'Host') ? 1 : 0;
            var bHost = (b.val.role === 'Host') ? 1 : 0;
            if (bHost !== aHost) return bHost - aHost;
            var aDur = (a.val.durationMs && a.val.durationMs > 0) ? 1 : 0;
            var bDur = (b.val.durationMs && b.val.durationMs > 0) ? 1 : 0;
            return bDur - aDur;
          });

          var kept = cluster[0];
          var dateStr = kept.val.timestamp ? new Date(kept.val.timestamp).toLocaleString('it-IT') : '?';
          var namesStr = (kept.val.playerNames || []).join(', ');
          log.textContent += '\n📋 Gruppo: ' + dateStr + ' — ' + namesStr + '\n';
          log.textContent += '   Mantenuta: [' + kept.key.substring(0,8) + '...] ' + (kept.val.role || kept.val.type) + '\n';

          for (var j = 1; j < cluster.length; j++) {
            var dup = cluster[j];
            log.textContent += '   Rimossa:   [' + dup.key.substring(0,8) + '...] ' + (dup.val.role || dup.val.type) + '\n';
            keysToRemove.push(dup.key);
          }
        });
      });

      log.textContent += '\n--- Risultato ---\n';
      log.textContent += 'Gruppi di duplicati trovati: ' + groupsFound + '\n';
      log.textContent += 'Entry da rimuovere: ' + keysToRemove.length + '\n';

      if (keysToRemove.length === 0) {
        log.textContent += 'Nessuna entry duplicata trovata. ✅\n';
        btn.disabled = false;
        btn.textContent = '🔄 Trova e Rimuovi Partite Duplicate';
        return;
      }

      log.textContent += '\nRimozione in corso...\n';

      var removed = 0;
      var errors = 0;
      var total = keysToRemove.length;

      // Build a multi-path update for atomic deletion
      var updates = {};
      keysToRemove.forEach(function(key) {
        updates[key] = null;
      });

      db.ref('statistics/games').update(updates).then(function() {
        removed = total;
        log.textContent += 'Rimosse ' + removed + ' entry duplicate con successo. ✅\n';
        btn.disabled = false;
        btn.textContent = '🔄 Trova e Rimuovi Partite Duplicate';
      }).catch(function(err) {
        log.textContent += 'Errore durante la rimozione: ' + err.message + '\n';
        log.textContent += 'Tentativo rimozione singola...\n';
        // Fallback: remove one by one
        var promises = keysToRemove.map(function(key) {
          return db.ref('statistics/games/' + key).remove().then(function() {
            removed++;
          }).catch(function() {
            errors++;
          });
        });
        Promise.all(promises).then(function() {
          log.textContent += 'Rimosse: ' + removed + ' | Errori: ' + errors + '\n';
          btn.disabled = false;
          btn.textContent = '🔄 Trova e Rimuovi Partite Duplicate';
        });
      });
    }, function(err) {
      log.textContent += 'Errore lettura database: ' + err.message + '\n';
      btn.disabled = false;
      btn.textContent = '🔄 Trova e Rimuovi Partite Duplicate';
    });
  }

  function renderChart(cpu, host, client) {
    const ctx = document.getElementById('statsChart').getContext('2d');
      if (statsChartInstance) {
        statsChartInstance.destroy();
      }
      statsChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['CPU', 'Multiplay Host', 'Multiplay Client'],
          datasets: [{
            data: [cpu, host, client],
            backgroundColor: ['#4caf50', '#2196f3', '#ff9800']
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }

    function renderDailyChart(dailyCpu, dailyMp) {
      // Unisci tutte le chiavi orarie e ordina
      let allKeys = new Set([...Object.keys(dailyCpu), ...Object.keys(dailyMp)]);
      let sortedKeys = Array.from(allKeys).sort();

      let cpuData = sortedKeys.map(k => dailyCpu[k] || 0);
      let mpData = sortedKeys.map(k => dailyMp[k] || 0);
      let totalData = sortedKeys.map((k, i) => cpuData[i] + mpData[i]);

      // Etichette: DD/MM HH:00
      let labels = sortedKeys.map(k => {
        let parts = k.split('T');
        let dp = parts[0].split('-');
        return dp[2] + '/' + dp[1] + ' ' + parts[1] + ':00';
      });

      const ctx = document.getElementById('dailyChart').getContext('2d');
      if (dailyChartInstance) dailyChartInstance.destroy();
      dailyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'CPU',
              data: cpuData,
              backgroundColor: 'rgba(76, 175, 80, 0.7)',
              borderColor: '#4caf50',
              borderWidth: 1
            },
            {
              label: 'Multiplayer',
              data: mpData,
              backgroundColor: 'rgba(33, 150, 243, 0.7)',
              borderColor: '#2196f3',
              borderWidth: 1
            },
            {
              label: 'Totale',
              data: totalData,
              type: 'line',
              borderColor: '#ff9800',
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              borderWidth: 2,
              pointRadius: 3,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: { stacked: true, title: { display: true, text: 'Ora' }, ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 24 } },
            y: { stacked: false, beginAtZero: true, title: { display: true, text: 'Partite' }, ticks: { stepSize: 1 } }
          },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { mode: 'index', intersect: false }
          }
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  ADMIN MANAGEMENT — auto-bootstrap + user table
    // ═══════════════════════════════════════════════════════════
    var _admins = {};
    var _allUsers = {};

    function loadAdmins() {
      // First: auto-bootstrap — if no admins exist, make current user admin
      db.ref('admins').once('value', function(snap) {
        var admins = snap.val();
        if (!admins || Object.keys(admins).length === 0) {
          var user = auth.currentUser;
          if (user) {
            db.ref('admins/' + user.uid).set({
              email: user.email || '',
              displayName: user.displayName || '',
              addedBy: 'auto-bootstrap',
              addedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(function() {
              _showAdminMsg('✅ Sei diventato il primo amministratore!', 'green');
              _startAdminListeners();
            });
            return;
          }
        }
        _startAdminListeners();
      });
    }

    function _startAdminListeners() {
      // Listen to admins
      db.ref('admins').on('value', function(snap) {
        _admins = snap.val() || {};
        _renderUsersTable();
      }, function(err) {
        _showAdminMsg('Errore caricamento admin: ' + err.message, 'red');
      });

      // Listen to users
      db.ref('users').on('value', function(snap) {
        _allUsers = snap.val() || {};
        _renderUsersTable();
      }, function(err) {
        _showAdminMsg('Errore caricamento utenti: ' + err.message, 'red');
      });
    }

    function _renderUsersTable() {
      var tbody = document.getElementById('users-tbody');
      if (!tbody) return;
      var currentUid = auth.currentUser ? auth.currentUser.uid : '';
      var uids = Object.keys(_allUsers);

      // Also include admins that might not be in _allUsers
      Object.keys(_admins).forEach(function(uid) {
        if (uids.indexOf(uid) === -1) uids.push(uid);
      });

      if (uids.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#888">Nessun utente registrato.</td></tr>';
        return;
      }

      // Sort: admins first, then by name
      uids.sort(function(a, b) {
        var aAdmin = _admins[a] ? 0 : 1;
        var bAdmin = _admins[b] ? 0 : 1;
        if (aAdmin !== bAdmin) return aAdmin - bAdmin;
        var aName = (_allUsers[a] && _allUsers[a].displayName) || '';
        var bName = (_allUsers[b] && _allUsers[b].displayName) || '';
        return aName.localeCompare(bName);
      });

      var html = '';
      uids.forEach(function(uid) {
        var user = _allUsers[uid] || {};
        var admin = _admins[uid];
        var isAdmin = !!admin;
        var isMe = uid === currentUid;
        var name = user.displayName || (admin && admin.displayName) || '';
        var email = user.email || (admin && admin.email) || '—';
        if (!name) name = email.split('@')[0] || uid.substring(0, 8);
        var lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString('it-IT') : (admin && admin.addedAt ? new Date(admin.addedAt).toLocaleString('it-IT') : '—');
        var roleColor = isAdmin ? '#2a6a2a' : '#666';
        var roleLabel = isAdmin ? '👑 Admin' : '👤 Utente';
        var rowBg = isAdmin ? '#e8f5e9' : (isMe ? '#e3f2fd' : '#fff');

        html += '<tr style="background:' + rowBg + ';border-bottom:1px solid #ddd">';
        html += '<td style="padding:8px"><strong>' + name + '</strong>' + (isMe ? ' <span style="color:#1565c0;font-size:0.8rem">(Tu)</span>' : '') + '</td>';
        html += '<td style="padding:8px;color:#555">' + email + '</td>';
        html += '<td style="padding:8px;text-align:center;color:' + roleColor + ';font-weight:bold">' + roleLabel + '</td>';
        // Skill levels from playerProfiles (per-mode: perdere/vincere)
        var profiles = user.playerProfiles || null;
        // Fallback to legacy single profile
        if (!profiles && user.playerProfile && typeof user.playerProfile.skillLevel === 'number') {
          profiles = { perdere: user.playerProfile, vincere: null };
        }
        var skillDisplay = '—';
        if (profiles) {
          var skillParts = [];
          ['perdere','vincere'].forEach(function(mode) {
            var p = profiles[mode];
            if (p && typeof p.skillLevel === 'number' && p.gamesPlayed > 0) {
              var sv = p.skillLevel;
              var sc = sv < 25 ? '#e53935' : sv < 40 ? '#ff9800' : sv < 55 ? '#fdd835' : sv < 70 ? '#43a047' : sv < 85 ? '#1e88e5' : '#7b1fa2';
              var sfg = (sv >= 40 && sv < 55) ? '#333' : '#fff';
              var icon = mode === 'vincere' ? '🔺' : '🔻';
              skillParts.push('<span class="badge" style="background:' + sc + ';color:' + sfg + '">' + icon + ' ' + sv + '</span>');
            }
          });
          if (skillParts.length > 0) skillDisplay = skillParts.join(' ');
        }
        html += '<td style="padding:8px;text-align:center">' + skillDisplay + '</td>';
        html += '<td style="padding:8px;text-align:center;color:#888;font-size:0.85rem">' + lastLogin + '</td>';
        html += '<td style="padding:8px;text-align:center">';
        if (isMe) {
          html += '<span style="color:#888;font-size:0.8rem">—</span>';
        } else if (isAdmin) {
          html += '<button onclick="toggleAdmin(\'' + uid + '\', false)" style="background:#c62828;padding:4px 12px;font-size:0.8rem;border:none;color:#fff;border-radius:4px;cursor:pointer">Rimuovi Admin</button>';
        } else {
          html += '<button onclick="toggleAdmin(\'' + uid + '\', true)" style="background:#2a6a2a;padding:4px 12px;font-size:0.8rem;border:none;color:#fff;border-radius:4px;cursor:pointer">Rendi Admin</button>';
        }
        html += '</td></tr>';
      });
      tbody.innerHTML = html;
    }

    function toggleAdmin(uid, makeAdmin) {
      var user = _allUsers[uid] || {};
      var label = user.displayName || user.email || uid;
      if (makeAdmin) {
        if (!confirm('Rendere "' + label + '" amministratore?')) return;
        db.ref('admins/' + uid).set({
          email: user.email || '',
          displayName: user.displayName || '',
          addedBy: auth.currentUser ? auth.currentUser.email : 'unknown',
          addedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(function() {
          _showAdminMsg('✅ ' + label + ' è ora admin', 'green');
        }).catch(function(e) {
          _showAdminMsg('Errore: ' + e.message, 'red');
        });
      } else {
        if (!confirm('Rimuovere "' + label + '" dagli amministratori?')) return;
        db.ref('admins/' + uid).remove().then(function() {
          _showAdminMsg('✅ ' + label + ' non è più admin', 'green');
        }).catch(function(e) {
          _showAdminMsg('Errore: ' + e.message, 'red');
        });
      }
    }

    function _showAdminMsg(text, color) {
      var el = document.getElementById('admin-msg');
      if (el) { el.style.color = color || '#333'; el.textContent = text; }
    }

    function manualAddUser() {
      var name = document.getElementById('manual-user-name').value.trim();
      var email = document.getElementById('manual-user-email').value.trim();
      var uid = document.getElementById('manual-user-uid').value.trim();
      if (!email) { _showAdminMsg('Inserisci almeno l\'email.', 'red'); return; }
      if (!uid) { _showAdminMsg('Inserisci lo UID (lo trovi in Firebase Console → Authentication → Users).', 'red'); return; }
      db.ref('users/' + uid).set({
        email: email,
        displayName: name || email.split('@')[0],
        lastLogin: firebase.database.ServerValue.TIMESTAMP,
        addedManually: true
      }).then(function() {
        _showAdminMsg('✅ Utente aggiunto: ' + (name || email), 'green');
        document.getElementById('manual-user-name').value = '';
        document.getElementById('manual-user-email').value = '';
        document.getElementById('manual-user-uid').value = '';
      }).catch(function(e) {
        _showAdminMsg('Errore: ' + e.message, 'red');
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  SOCIAL STATS — User view
    // ═══════════════════════════════════════════════════════════
    var _userFriendsRef = null;
    var _userReqRef = null;
    var _userPresRef = null;

    function loadUserSocial(user) {
      var uid = user.uid;

      // Presence status
      db.ref('presence/' + uid).on('value', function(snap) {
        var data = snap.val();
        var el = document.getElementById('user-presence-status');
        if (data && data.online) {
          el.textContent = '🟢';
          el.title = 'Online';
        } else {
          el.textContent = '⚫';
          el.title = 'Offline';
        }
      }, function() {
        document.getElementById('user-presence-status').textContent = '—';
      });

      // Friends list
      if (_userFriendsRef) _userFriendsRef.off();
      _userFriendsRef = db.ref('friends/' + uid);
      _userFriendsRef.on('value', function(snap) {
        var friends = snap.val() || {};
        var keys = Object.keys(friends);
        document.getElementById('user-friends-count').textContent = keys.length;
        var listEl = document.getElementById('user-friends-list');
        if (keys.length === 0) {
          listEl.innerHTML = '<p style="text-align:center;color:#888;padding:20px">Nessun amico ancora. Gioca e aggiungi amici dal pannello Social!</p>';
          return;
        }
        // Check online status for each friend
        var html = '';
        var pending = keys.length;
        var friendData = [];
        keys.forEach(function(fUid) {
          var f = friends[fUid];
          db.ref('presence/' + fUid).once('value', function(pSnap) {
            var pres = pSnap.val();
            var isOnline = pres && pres.online;
            var inGame = pres && pres.inGame;
            var inLobby = pres && pres.currentRoom && !pres.inGame;
            friendData.push({ uid: fUid, name: f.displayName || fUid.substring(0, 8), since: f.since, online: isOnline, inGame: inGame, inLobby: inLobby });
            pending--;
            if (pending === 0) {
              friendData.sort(function(a, b) { return (a.online === b.online) ? a.name.localeCompare(b.name) : (b.online ? 1 : -1); });
              html = '';
              friendData.forEach(function(fd) {
                var statusClass = fd.inGame ? 'ingame' : (fd.online ? 'online' : 'offline');
                var statusText = fd.inGame ? 'In partita' : (fd.inLobby ? 'In lobby' : (fd.online ? 'Online' : 'Offline'));
                var badgeClass = fd.inGame ? 'badge-ingame' : (fd.inLobby ? 'badge-inlobby' : (fd.online ? 'badge-online' : 'badge-offline'));
                html += '<div class="friend-item">';
                html += '<div style="display:flex;align-items:center;gap:8px"><span class="friend-status ' + statusClass + '"></span><span class="friend-name">' + _escH(fd.name) + '</span></div>';
                html += '<span class="badge ' + badgeClass + '" style="color:#fff;padding:2px 8px;border-radius:10px;font-size:0.75rem">' + statusText + '</span>';
                html += '</div>';
              });
              listEl.innerHTML = html;
            }
          }, function() { pending--; });
        });
      }, function() {
        document.getElementById('user-friends-count').textContent = '—';
        document.getElementById('user-friends-list').innerHTML = '<p style="text-align:center;color:#c62828;padding:20px">Impossibile caricare la lista amici.</p>';
      });

      // Friend requests
      if (_userReqRef) _userReqRef.off();
      _userReqRef = db.ref('friendRequests/' + uid);
      _userReqRef.on('value', function(snap) {
        var reqs = snap.val() || {};
        var keys = Object.keys(reqs);
        document.getElementById('user-requests-count').textContent = keys.length;
        var listEl = document.getElementById('user-friend-requests-list');
        if (keys.length === 0) {
          listEl.innerHTML = '<p style="text-align:center;color:#888;padding:20px">Nessuna richiesta di amicizia in sospeso.</p>';
          return;
        }
        var html = '';
        keys.forEach(function(senderUid) {
          var req = reqs[senderUid];
          var dateStr = req.timestamp ? new Date(req.timestamp).toLocaleString('it-IT') : '—';
          html += '<div class="friend-item" style="flex-direction:column;align-items:stretch;gap:6px">';
          html += '<div style="display:flex;align-items:center;justify-content:space-between">';
          html += '<span class="friend-name">📨 ' + _escH(req.fromName || senderUid.substring(0, 8)) + '</span>';
          html += '<span style="font-size:0.75rem;color:#888">' + dateStr + '</span>';
          html += '</div>';
          if (req.message) {
            html += '<div style="font-size:0.85rem;color:#666;font-style:italic;padding:4px 8px;background:#f0f0f0;border-radius:4px">"' + _escH(req.message) + '"</div>';
          }
          html += '</div>';
        });
        listEl.innerHTML = html;
      }, function() {
        document.getElementById('user-requests-count').textContent = '—';
        document.getElementById('user-friend-requests-list').innerHTML = '<p style="text-align:center;color:#c62828;padding:20px">Impossibile caricare le richieste.</p>';
      });
    }

    function _escH(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════
    //  SOCIAL STATS — Admin view
    // ═══════════════════════════════════════════════════════════
    var _socialChartInstance = null;
    var _adminPresenceRef = null;
    var _adminFriendsRef = null;
    var _adminReqsRef = null;
    var _adminInvRef = null;

    function loadAdminSocial() {
      // 1. Online players (presence)
      if (_adminPresenceRef) _adminPresenceRef.off();
      _adminPresenceRef = db.ref('presence');
      _adminPresenceRef.on('value', function(snap) {
        var all = snap.val() || {};
        var now = Date.now();
        var STALE_MS = 2 * 60 * 1000; // 2 minutes
        var onlineList = [];
        for (var uid in all) {
          if (all[uid] && all[uid].online) {
            var lastSeen = all[uid].lastSeen || 0;
            if (now - lastSeen < STALE_MS) {
              onlineList.push({ uid: uid, data: all[uid] });
            } else {
              // Stale entry — clean it up
              db.ref('presence/' + uid).remove().catch(function(){});
            }
          }
        }
        document.getElementById('admin-online-count').textContent = onlineList.length;
        _renderAdminOnlineTable(onlineList);
        _renderSocialChart();
      }, function() {
        document.getElementById('admin-online-count').textContent = '—';
      });

      // 2. Friends network
      if (_adminFriendsRef) _adminFriendsRef.off();
      _adminFriendsRef = db.ref('friends');
      _adminFriendsRef.on('value', function(snap) {
        var all = snap.val() || {};
        var pairs = [];
        var seen = {};
        var totalLinks = 0;
        for (var uid in all) {
          var friends = all[uid];
          for (var fUid in friends) {
            var pairKey = uid < fUid ? uid + ':' + fUid : fUid + ':' + uid;
            if (!seen[pairKey]) {
              seen[pairKey] = true;
              totalLinks++;
              var uName = (_allUsers[uid] && _allUsers[uid].displayName) || uid.substring(0, 8);
              var fName = friends[fUid].displayName || (_allUsers[fUid] && _allUsers[fUid].displayName) || fUid.substring(0, 8);
              pairs.push({ user: uName, friend: fName, since: friends[fUid].since });
            }
          }
        }
        document.getElementById('admin-friends-total').textContent = totalLinks;
        _renderAdminFriendsTable(pairs);
        _renderSocialChart();
      }, function() {
        document.getElementById('admin-friends-total').textContent = '—';
      });

      // 3. All pending friend requests
      if (_adminReqsRef) _adminReqsRef.off();
      _adminReqsRef = db.ref('friendRequests');
      _adminReqsRef.on('value', function(snap) {
        var all = snap.val() || {};
        var reqs = [];
        var total = 0;
        for (var targetUid in all) {
          var senders = all[targetUid];
          for (var senderUid in senders) {
            total++;
            var targetName = (_allUsers[targetUid] && _allUsers[targetUid].displayName) || targetUid.substring(0, 8);
            reqs.push({
              from: senders[senderUid].fromName || senderUid.substring(0, 8),
              to: targetName,
              message: senders[senderUid].message || '',
              timestamp: senders[senderUid].timestamp
            });
          }
        }
        document.getElementById('admin-requests-total').textContent = total;
        _renderAdminRequestsTable(reqs);
        _renderSocialChart();
      }, function() {
        document.getElementById('admin-requests-total').textContent = '—';
      });

      // 4. Active invitations
      if (_adminInvRef) _adminInvRef.off();
      _adminInvRef = db.ref('invitations');
      _adminInvRef.on('value', function(snap) {
        var all = snap.val() || {};
        var invites = [];
        var total = 0;
        for (var targetUid in all) {
          var senders = all[targetUid];
          for (var senderUid in senders) {
            total++;
            var inv = senders[senderUid];
            var targetName = (_allUsers[targetUid] && _allUsers[targetUid].displayName) || targetUid.substring(0, 8);
            invites.push({
              from: inv.fromName || senderUid.substring(0, 8),
              to: targetName,
              room: inv.roomCode || '—',
              seat: inv.seatIndex != null ? (inv.seatIndex + 1) : '—',
              timestamp: inv.timestamp
            });
          }
        }
        document.getElementById('admin-invitations-total').textContent = total;
        _renderAdminInvitationsTable(invites);
        _renderSocialChart();
      }, function() {
        document.getElementById('admin-invitations-total').textContent = '—';
      });
    }

    function _renderAdminOnlineTable(list) {
      var tbody = document.getElementById('online-players-tbody');
      if (!tbody) return;
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;color:#888">Nessun giocatore online al momento.</td></tr>';
        return;
      }
      list.sort(function(a, b) { return (a.data.displayName || '').localeCompare(b.data.displayName || ''); });
      var html = '';
      list.forEach(function(item) {
        var d = item.data;
        var statusBadge, statusText;
        if (d.inGame) { statusBadge = 'badge-ingame'; statusText = 'In Partita'; }
        else if (d.currentRoom) { statusBadge = 'badge-inlobby'; statusText = 'In Lobby'; }
        else { statusBadge = 'badge-online'; statusText = 'Online'; }
        var typeBadge = d.isGuest ? '<span class="badge badge-client">Ospite</span>' : '<span class="badge badge-host">Registrato</span>';
        var lastSeen = d.lastSeen ? new Date(d.lastSeen).toLocaleString('it-IT') : '—';
        html += '<tr>';
        html += '<td><strong>' + _escH(d.displayName || 'Sconosciuto') + '</strong></td>';
        html += '<td><span class="badge ' + statusBadge + '">' + statusText + '</span></td>';
        html += '<td>' + (d.currentRoom || '—') + '</td>';
        html += '<td>' + typeBadge + '</td>';
        html += '<td style="font-size:0.8rem;color:#888">' + lastSeen + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    function _renderAdminFriendsTable(pairs) {
      var tbody = document.getElementById('friends-network-tbody');
      if (!tbody) return;
      if (pairs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="padding:16px;color:#888">Nessuna amicizia registrata.</td></tr>';
        return;
      }
      pairs.sort(function(a, b) { return (b.since || 0) - (a.since || 0); });
      var html = '';
      pairs.forEach(function(p) {
        var dateStr = p.since ? new Date(p.since).toLocaleString('it-IT') : '—';
        html += '<tr>';
        html += '<td><strong>' + _escH(p.user) + '</strong></td>';
        html += '<td><strong>' + _escH(p.friend) + '</strong></td>';
        html += '<td style="font-size:0.85rem;color:#888">' + dateStr + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    function _renderAdminRequestsTable(reqs) {
      var tbody = document.getElementById('requests-tbody');
      if (!tbody) return;
      if (reqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#888">Nessuna richiesta pendente.</td></tr>';
        return;
      }
      reqs.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      var html = '';
      reqs.forEach(function(r) {
        var dateStr = r.timestamp ? new Date(r.timestamp).toLocaleString('it-IT') : '—';
        html += '<tr>';
        html += '<td><strong>' + _escH(r.from) + '</strong></td>';
        html += '<td><strong>' + _escH(r.to) + '</strong></td>';
        html += '<td style="font-size:0.85rem;color:#666;max-width:200px;overflow:hidden;text-overflow:ellipsis">' + _escH(r.message || '—') + '</td>';
        html += '<td style="font-size:0.85rem;color:#888">' + dateStr + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    function _renderAdminInvitationsTable(invites) {
      var tbody = document.getElementById('invitations-tbody');
      if (!tbody) return;
      if (invites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:16px;color:#888">Nessun invito attivo.</td></tr>';
        return;
      }
      invites.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
      var html = '';
      invites.forEach(function(inv) {
        var dateStr = inv.timestamp ? new Date(inv.timestamp).toLocaleString('it-IT') : '—';
        html += '<tr>';
        html += '<td><strong>' + _escH(inv.from) + '</strong></td>';
        html += '<td><strong>' + _escH(inv.to) + '</strong></td>';
        html += '<td>' + _escH(inv.room) + '</td>';
        html += '<td>' + inv.seat + '</td>';
        html += '<td style="font-size:0.85rem;color:#888">' + dateStr + '</td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    function _renderSocialChart() {
      var online = parseInt(document.getElementById('admin-online-count').textContent) || 0;
      var friends = parseInt(document.getElementById('admin-friends-total').textContent) || 0;
      var reqs = parseInt(document.getElementById('admin-requests-total').textContent) || 0;
      var invites = parseInt(document.getElementById('admin-invitations-total').textContent) || 0;
      if (online + friends + reqs + invites === 0) return;
      var ctx = document.getElementById('socialChart');
      if (!ctx) return;
      ctx = ctx.getContext('2d');
      if (_socialChartInstance) _socialChartInstance.destroy();
      _socialChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Online', 'Amicizie', 'Richieste', 'Inviti'],
          datasets: [{
            label: 'Social',
            data: [online, friends, reqs, invites],
            backgroundColor: ['#4caf50', '#ff9800', '#e53935', '#7b1fa2']
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          },
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Panoramica Social' }
          }
        }
      });
    }