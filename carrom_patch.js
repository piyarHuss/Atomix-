/* =====================================================================
   carrom_patch.js — Carrom ko app se jodta hai
   Sabse LAST mein load karo (deposit.js ke baad, boot() se pehle)
   ===================================================================== */

/* ---- 1) Carrom shim: script load karta hai + result Ludo format me badalta hai ---- */
(function () {
  let loading = null, stopped = false;

  function loadCarrom() {
    if (window.CarromGame) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'games/carrom/carrom.js';
      s.onload = () => window.CarromGame ? res() : rej(new Error('CarromGame not found'));
      s.onerror = () => rej(new Error('Could not load games/carrom/carrom.js'));
      document.head.appendChild(s);
    });
    return loading;
  }

  window.CarromShim = {
    start(o) {
      stopped = false;
      const f = o.onFinish;
      /* stats tracker 'blue' = jeet samajhta hai, isliye wahi format bhejo */
      o.onFinish = r => f && f(Object.assign({}, r, { winner: r.won ? 'blue' : 'red' }));
      loadCarrom().then(() => {
        if (stopped) return;
        window.CarromGame.start(o);
      }).catch(err => {
        console.error(err);
        if (o.mount) o.mount.innerHTML =
          '<div class="game-error"><b>Game could not be loaded</b><small>' + String(err.message || err) +
          '</small><button onclick="go(\'home\')">Back to Home</button></div>';
      });
    },
    stop() {
      stopped = true;
      if (window.CarromGame) window.CarromGame.stop();
    }
  };

  /* GAMES me Carrom ko ready karo */
  Object.assign(GAMES.Carrom, {
    script: 'games/carrom/carrom.js',
    module: 'CarromShim',
    ready: true
  });
})();

/* ---- 2) Carrom me real-player matchmaking band (abhi sync nahi hai) -> seedha AI ---- */
(function () {
  const _start = startSearch;
  startSearch = function () {
    if (curGame === 'Ludo') return _start();

    try { mmStop(); } catch (e) {}
    clearTimeout(mtT); clearTimeout(matchStartTimer);
    MATCH.started = false;
    const title = document.getElementById('mtt'),
          sub = document.getElementById('mts'),
          opp = document.getElementById('mtopp');
    if (title) title.textContent = 'Finding Opponent';
    if (sub) sub.textContent = 'Preparing an AI match...';
    if (opp) opp.innerHTML =
      `<div class="mt-c opp">${A('opp_unknown', '❔', 50, 0)}</div><span class="mt-l opp">Searching...</span>`;
    try { srchStart(); } catch (e) {}
    mtT = setTimeout(foundOpp, 3000);
  };
})();