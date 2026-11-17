/* =====================================================================
   carrom_patch.js  -  Carrom ko online (user vs user) chalane ka patch
   ---------------------------------------------------------------------
   Kisi purani file ko edit karne ki zarurat nahi.
   Bas index.html me profile_plus.js aur matchmaking.js ke BAAD ye add karo:

       <script src="carrom_patch.js"></script>

   Kya karta hai:
     1) GAMES.Carrom.ready = true   (pehle "coming soon" toast aata tha)
     2) Carrom ke liye games/carrom/carrom.js apne aap load karta hai
     3) Carrom ka result Ludo jaisa ('blue' = jeeta) bana ke app ko deta hai
     4) Carrom match ke stats (played / won / lost) record karta hai
     5) Console me "CR:" debug lines
   ===================================================================== */
(() => {
  'use strict';

  /* index.html ke hisaab se path badlo (carrom.js kahan rakhi hai) */
  const CARROM_SRC = 'games/carrom/carrom.js?v=8';

  const isCarrom = k => /carrom/i.test(String(k || ''));
  const clog = (...a) => { try { console.log('CR:', ...a); } catch (e) { } };

  /* 1) Carrom ready */
  if (typeof GAMES !== 'undefined' && GAMES.Carrom) GAMES.Carrom.ready = true;
  else clog('GAMES.Carrom nahi mila - profile_plus.js ke baad load karo');

  /* 2) debug: match start par kya mila */
  const _oms = onMatchStart;
  onMatchStart = function (m) {
    try {
      clog('onMatchStart game=', m && m.game, 'opponentType=', m && m.opponentType,
        'net=', !!(m && m.net), 'role=', m && m.role, 'matchId=', m && m.matchId);
    } catch (e) { }
    return _oms.apply(this, arguments);
  };

  /* 3) carrom.js loader */
  let carromP = null;
  function loadCarrom() {
    if (window.CarromGame) return Promise.resolve(window.CarromGame);
    if (carromP) return carromP;
    carromP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CARROM_SRC;
      s.onload = () => (window.CarromGame ? res(window.CarromGame) : rej(new Error('CarromGame define nahi hua')));
      s.onerror = () => { carromP = null; rej(new Error('carrom.js load nahi hui: ' + CARROM_SRC)); };
      document.head.appendChild(s);
    });
    return carromP;
  }

  /* 4) loadGameModule: Carrom ke liye apna module, baaki sab purana */
  const _lg = loadGameModule;
  loadGameModule = async function (k) {
    const forCarrom = isCarrom(k) || (typeof curGame === 'string' && isCarrom(curGame));
    if (!forCarrom) return _lg.apply(this, arguments);

    const mod = await loadCarrom();
    return {
      start(o) {
        const m = o.match || {};
        clog('carrom start; online=', m.opponentType === 'human' || m.ai === false, 'net=', !!m.net, 'role=', m.role);

        let done = 0;
        const rec = win => {
          if (done) return; done = 1;
          try {
            ST = { played: ST.played + 1, won: ST.won + (win ? 1 : 0), lost: ST.lost + (win ? 0 : 1) };
            dbSet('st', ST);
          } catch (e) { }
        };

        const f = o.onFinish, x = o.onExit;
        o.onFinish = r => {
          const won = !!(r && r.won);
          rec(won);
          /* Ludo jaisa format: winner 'blue' = main (neeche wala) */
          const nr = Object.assign({}, r, {
            won,
            winner: won ? 'blue' : 'red',
            loser: won ? 'red' : 'blue',
            winnerName: won ? (m.me || 'You') : (m.opponent || 'Opponent')
          });
          return f ? f(nr) : undefined;
        };
        o.onExit = function () { rec(false); return x ? x.apply(this, arguments) : undefined; };

        return mod.start(o);
      },
      stop() { return mod.stop && mod.stop(); }
    };
  };

  clog('carrom_patch loaded');
})();
