/* LUDO MASTERS — 2 PLAYER LUDO (v5.2 PRO UI + exact board calibration)
   - Pro layout: top bar (menu + "₹X vs ₹X" + coin badge), avatars, name tags on board
   - Emoji / Chat icons under your avatar -> emoji popup (like real Ludo apps)
   - Animated slide-in MENU: Sound, Music, Leave Match
   - Every UI part can be replaced with a PNG from assets/ (CSS fallback if missing)
   - mp3 sound system (Web Audio, reliable on mobile), background image, 13x13 board mapping, 3D dice, bot AI

   v5.3 ADD: 15-second turn timer (see TURN_SECONDS). No tap in time -> turn goes to opponent.
   v5.2 FIX: token positions now use EXACT cell centers measured from ludo_board.png
             (COL_X / ROW_Y arrays) instead of an equal-size-cell formula.

   START OPTIONS (match object):
     match.bet            -> 5  shows "₹5 vs ₹5" and coin badge "5"
                             (also accepted: entryFee, entry, entry_fee, betAmount, bet_amount, amount, stake, fee, price, prize)
     match.me             -> your name           match.meAvatar        -> image url / file in assets
     match.opponent       -> opponent name       match.opponentAvatar  -> image url / file in assets
     match.meFlag / match.opponentFlag -> emoji ("🇮🇳") or png file in assets ("flag_in.png")
     match.ai = true      -> play against bot    match.background      -> background file
*/
(() => {
  "use strict";

  if (window.LudoGame && window.LudoGame.__mastersLoaded) return;

  const SCRIPT_URL = document.currentScript?.src || document.baseURI;
  const ASSET = name => new URL(`assets/${name}`, SCRIPT_URL).href;
  const assetOrUrl = f => (/^(https?:|data:|blob:|\/)/.test(f) ? f : ASSET(f));

  /* ================================================================== */
  /*  FILE NAMES                                                         */
  /* ================================================================== */
  const SOUND_DIR = "sounds/";
  const BACKGROUND_FILE = "background.png";

  // Optional PNG skins (put in assets/). If a file is missing, CSS design is used.
  const SKINS = {
    topbar:  "ui_topbar.png",    // full top bar plate
    menubtn: "btn_menu.png",     // menu button (plate + icon)
    coin:    "coin_badge.png",   // right coin badge plate
    frame:   "avatar_frame.png", // frame drawn over avatars
    panel:   "menu_panel.png"    // slide-in menu background
  };

  /* ================================================================== */
  /*  BOARD GEOMETRY  (13 x 13 board image)                              */
  /* ================================================================== */
  // Exact cell centers measured from ludo_board.png, in % of board size.
  // The cells in the image are NOT all equal size, so a formula drifts
  // a few pixels. These arrays are the true centers.
  //   index = column (left -> right)  /  row (top -> bottom)
  const COL_X = [4.05, 11.99, 19.84, 27.49, 34.89, 42.50, 50.00, 57.46, 64.96, 72.36, 79.96, 87.76, 95.62];
  const ROW_Y = [4.05, 11.75, 19.45, 27.00, 34.45, 41.95, 49.36, 56.76, 64.60, 72.40, 80.10, 87.90, 95.70];
  const cellX = c => COL_X[c];
  const cellY = r => ROW_Y[r];

  const TRACK_LEN = 44;
  const LAST_TRACK_STEP = 42;
  const LANE_START = 43;
  const FINISH = 47;

  const TRACK = [
    [5,0],[5,1],[5,2],[5,3],[5,4],
    [4,5],[3,5],[2,5],[1,5],[0,5],
    [0,6],[0,7],
    [1,7],[2,7],[3,7],[4,7],
    [5,8],[5,9],[5,10],[5,11],[5,12],
    [6,12],[7,12],
    [7,11],[7,10],[7,9],[7,8],
    [8,7],[9,7],[10,7],[11,7],[12,7],
    [12,6],[12,5],
    [11,5],[10,5],[9,5],[8,5],
    [7,4],[7,3],[7,2],[7,1],[7,0],
    [6,0]
  ];

  const PLAYERS = {
    red: {
      start: 12,
      color: "#e53935",
      lane: [[1,6],[2,6],[3,6],[4,6]],
      avatar: "red_avatar.png",
      goti: "red_goti.png"
    },
    blue: {
      start: 34,
      color: "#1976d2",
      lane: [[11,6],[10,6],[9,6],[8,6]],
      avatar: "blue_avatar.png",
      goti: "blue_goti.png"
    }
  };

  // Exact centers of the 4 holes in each home box (board %)
  const HOME_POSITIONS = {
    red:  [[74.1,12.0],[86.6,12.0],[74.1,24.9],[86.6,24.9]],
    blue: [[12.2,73.4],[24.9,73.4],[12.2,86.4],[24.9,86.4]]
  };

  const FINISH_POS = {
    red:  i => [50 + (i - 1.5) * 2.8, 41.2],
    blue: i => [50 + (i - 1.5) * 2.8, 58.8]
  };

  const SAFE_TRACK_INDEXES = new Set([1,7,12,18,23,29,34,40]);

  const SIZE_HOME = 8.2, SIZE_TRACK = 6.6, SIZE_FINISH = 4.4;
  const STEP_MS = 190;

  // Turn timer: seconds a player has to tap the dice (or pick a token).
  // Time over -> turn passes to the opponent.
  const TURN_SECONDS = 15;

  // Token position nudge in board %: [x, y]. Negative y = move UP.
  // Cell centers are now exact, so this is 0 by default. Only use it if the
  // goti PNG itself has extra empty space (e.g. blue: [0, -0.3]).
  const TOKEN_NUDGE = { red: [0, 0], blue: [0, 0] };

  // Possible names for the bet amount inside the match object
  const BET_KEYS = ["bet","entryFee","entry","entry_fee","betAmount","bet_amount","amount","stake","fee","price","prize"];

  /* ================================================================== */
  /*  EMOJI + QUICK MESSAGES                                             */
  /* ================================================================== */
  const EMOJI_FALLBACK = ["😡","😎","😭","😘","😁","😍","🙏","😴"];
  const QUICK_TEXT = ["Hi", "Hurry up!", "Hahahaha!", "Well Played!", "Sorry!", "Thank you!"];
  const REACTION_COOLDOWN = 1200;

  /* ================================================================== */
  /*  SOUND SYSTEM  (mp3 in sounds/, synth beep if a file is missing)    */
  /* ================================================================== */
  /*  dice_roll  dice_land  token_step  token_enter  token_capture  token_home
      safe_square  no_move  your_turn  extra_turn  win  lose
      emoji_send  emoji_receive  button_click  game_start
      menu_open  menu_close  bg_music     (all .mp3)                          */
  const SOUND_VOLUME = {
    dice_roll: 0.9, dice_land: 0.8, token_step: 0.6, token_enter: 0.8,
    token_capture: 0.9, token_home: 0.9, safe_square: 0.7, no_move: 0.7,
    your_turn: 0.7, extra_turn: 0.8, win: 1, lose: 0.9,
    emoji_send: 0.7, emoji_receive: 0.7, button_click: 0.6, game_start: 0.8,
    menu_open: 0.7, menu_close: 0.6
  };
  const MUSIC_VOLUME = 0.22;

  let actx = null;
  function tone(freq, dur = 0.07, type = "sine", vol = 0.06, when = 0) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t = actx.currentTime + when;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* no audio */ }
  }

  const SYNTH = {
    dice_roll()     { for (let i = 0; i < 9; i++) tone(170 + Math.random() * 140, 0.05, "square", 0.025, i * 0.1); },
    dice_land()     { tone(220, 0.09, "triangle", 0.08); },
    token_step()    { tone(540, 0.06, "triangle", 0.07); },
    token_enter()   { tone(440, 0.08, "triangle", 0.08); tone(660, 0.1, "triangle", 0.08, 0.07); },
    token_capture() { tone(320, 0.16, "sawtooth", 0.07); tone(160, 0.28, "sawtooth", 0.08, 0.1); },
    token_home()    { [523, 659, 784].forEach((f, i) => tone(f, 0.16, "sine", 0.09, i * 0.1)); },
    safe_square()   { tone(880, 0.1, "sine", 0.06); },
    no_move()       { tone(200, 0.22, "sawtooth", 0.05); },
    your_turn()     { tone(660, 0.08, "sine", 0.06); tone(880, 0.1, "sine", 0.06, 0.09); },
    extra_turn()    { [587, 740, 880].forEach((f, i) => tone(f, 0.1, "triangle", 0.07, i * 0.08)); },
    win()           { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "sine", 0.09, i * 0.14)); },
    lose()          { [392, 330, 262].forEach((f, i) => tone(f, 0.25, "sine", 0.08, i * 0.16)); },
    emoji_send()    { tone(700, 0.06, "sine", 0.05); },
    emoji_receive() { tone(900, 0.07, "sine", 0.05); tone(1100, 0.07, "sine", 0.05, 0.07); },
    button_click()  { tone(480, 0.04, "square", 0.03); },
    game_start()    { [392, 523, 659].forEach((f, i) => tone(f, 0.16, "triangle", 0.08, i * 0.12)); },
    menu_open()     { tone(360, 0.09, "triangle", 0.06); tone(540, 0.12, "triangle", 0.06, 0.07); },
    menu_close()    { tone(540, 0.08, "triangle", 0.05); tone(360, 0.1, "triangle", 0.05, 0.07); }
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} }
  };

  const audio = {
    sfxOn: store.get("lm2_sfx", true),
    musicOn: store.get("lm2_music", true),
    bank: {},
    music: null,
    loaded: false,
    ctx: null,

    url(name) { return new URL(`${SOUND_DIR}${name}.mp3`, SCRIPT_URL).href; },

    getCtx() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* none */ }
      }
      return this.ctx;
    },

    // browsers keep audio locked until a user touch — call this on every touch
    unlock() {
      const c = this.getCtx();
      if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
    },

    load() {
      if (this.loaded) return;
      this.loaded = true;
      const c = this.getCtx();

      // sound effects: decoded once into memory (Web Audio) -> plays reliably every time
      Object.keys(SOUND_VOLUME).forEach(name => {
        const entry = { vol: SOUND_VOLUME[name], buffer: null, failed: false };
        this.bank[name] = entry;
        if (!c) { entry.failed = true; return; }
        fetch(this.url(name))
          .then(r => { if (!r.ok) throw new Error("missing"); return r.arrayBuffer(); })
          .then(ab => new Promise((res, rej) => {
            const p = c.decodeAudioData(ab, res, rej);
            if (p && p.catch) p.catch(rej);
          }))
          .then(buf => { entry.buffer = buf; })
          .catch(() => { entry.failed = true; });
      });

      // background music: normal looping audio element
      const m = new Audio(this.url("bg_music"));
      m.loop = true;
      m.volume = MUSIC_VOLUME;
      m.preload = "auto";
      m.addEventListener("error", () => { m.__failed = true; });
      this.music = m;
    },

    play(name) {
      if (!this.sfxOn) return;
      const e = this.bank[name];
      if (!e) return;

      if (e.buffer && this.ctx) {
        this.unlock();
        try {
          const src = this.ctx.createBufferSource();
          const g = this.ctx.createGain();
          src.buffer = e.buffer;
          g.gain.value = e.vol;
          src.connect(g);
          g.connect(this.ctx.destination);
          src.start(0);
        } catch (err) { /* ignore */ }
        return;
      }

      // mp3 missing / could not be decoded -> synth beep
      if (e.failed) SYNTH[name] && SYNTH[name]();
      // else: still loading, skip silently
    },

    startMusic() {
      if (!this.musicOn || !this.music || this.music.__failed) return;
      const p = this.music.play();
      if (p && p.catch) p.catch(() => {});
    },
    pauseMusic() { if (this.music) this.music.pause(); },
    stopMusic()  { if (this.music) { this.music.pause(); this.music.currentTime = 0; } },

    setSfx(on)   { this.sfxOn = on; store.set("lm2_sfx", on); },
    setMusic(on) { this.musicOn = on; store.set("lm2_music", on); on ? this.startMusic() : this.pauseMusic(); }
  };

  /* ================================================================== */
  /*  CSS                                                                */
  /* ================================================================== */
  const css = `
  .lm2-root{
    --wood1:#8a5a2b;--wood2:#5b3819;--wood3:#3a2210;--gold1:#fff3b0;--gold2:#f5b82e;--gold3:#b9770e;
    position:relative;width:100%;height:100%;min-height:100dvh;overflow:auto;
    box-sizing:border-box;padding:0 0 14px;color:#fff;
    background:var(--lm2-bg,none) center/cover no-repeat,
      linear-gradient(180deg,#6b4423,#3d2410);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    display:flex;flex-direction:column;align-items:center;gap:10px;
    -webkit-tap-highlight-color:transparent;user-select:none;
  }
  .lm2-root *{box-sizing:border-box}
  .lm2-root button{font-family:inherit}
  .lm2-root button:active:not(:disabled){filter:brightness(1.15)}
  .lm2-fb{display:inline-block;line-height:1}

  /* ---------- TOP BAR ---------- */
  .lm2-topbar{flex:0 0 auto;width:100%;height:64px;padding:0 8px;display:flex;align-items:center;gap:8px;
    background:var(--lm2-topbar,none) center/100% 100% no-repeat,
      repeating-linear-gradient(90deg,#0000 0 7px,#0000001a 7px 8px),
      linear-gradient(180deg,#80532a,#573419 60%,#3c2310);
    border-bottom:3px solid #24130a;box-shadow:0 5px 12px #000a,inset 0 1px 0 #d4a26a66}
  .png-topbar .lm2-topbar{background:var(--lm2-topbar) center/100% 100% no-repeat;border:0;box-shadow:none}

  .lm2-menubtn{flex:0 0 auto;width:48px;height:48px;border-radius:9px;display:grid;place-items:center;cursor:pointer;padding:0;
    background:linear-gradient(145deg,#c9965c,#8a5a2b 60%,#6a4119);border:2px solid #e6bd86;
    box-shadow:0 3px 7px #000a,inset 0 1px 0 #fff5,inset 0 -3px 5px #0004}
  .lm2-menubtn .bars{display:grid;gap:5px;width:24px}
  .lm2-menubtn .bars i{display:block;height:4px;border-radius:2px;background:linear-gradient(#fff3d0,#e9c98d);box-shadow:0 1px 2px #0008}
  .png-menubtn .lm2-menubtn{background:var(--lm2-menubtn) center/100% 100% no-repeat;border:0;box-shadow:none}
  .png-menubtn .lm2-menubtn .bars{display:none}

  .lm2-vs{flex:1;min-width:0;text-align:center;font-size:clamp(20px,7vw,30px);font-weight:900;letter-spacing:.5px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    background:linear-gradient(180deg,var(--gold1),var(--gold2) 55%,var(--gold3));
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 2px 0 #2a1406) drop-shadow(0 3px 4px #000a)}

  .lm2-coin{flex:0 0 auto;min-width:76px;height:40px;padding:0 12px 0 6px;border-radius:20px;display:flex;align-items:center;gap:6px;
    background:linear-gradient(180deg,#3d2412,#22130a);border:2px solid #d2a35a;
    box-shadow:0 3px 7px #000a,inset 0 1px 0 #fff3}
  .lm2-coin b{font-size:19px;font-weight:900;color:#ffd96a;text-shadow:0 2px 2px #000a}
  .lm2-coin .lm2-ico{width:28px;height:28px;object-fit:contain}
  .lm2-coinfb{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-size:15px;font-weight:900;color:#7a4a00;
    background:radial-gradient(circle at 35% 30%,#fff3b0,#f5b82e 60%,#b9770e);border:2px solid #fff3b0}
  .png-coin .lm2-coin{background:var(--lm2-coin) center/100% 100% no-repeat;border:0;box-shadow:none}

  /* ---------- PLAYER ROWS ---------- */
  .lm2-prow{width:min(94vw,520px,56dvh);display:flex;align-items:flex-start;gap:14px;min-height:68px}
  .lm2-prow.red{justify-content:flex-end}
  .lm2-prow.blue{justify-content:flex-start;padding-bottom:16px}
  .lm2-pcol{display:flex;flex-direction:column;align-items:center;gap:12px}
  .lm2-pwrap{position:relative}

  .lm2-avatar{position:relative;width:64px;height:64px;border-radius:12px;background:#f3ead6;border:3px solid #f3ead6;
    box-shadow:0 4px 10px #000b,inset 0 0 0 1px #0003;transition:box-shadow .25s,transform .25s}
  .lm2-avatar>img{width:100%;height:100%;object-fit:cover;border-radius:8px;display:block}
  .lm2-avatar .lm2-initial{display:grid;place-items:center;width:100%;height:100%;border-radius:8px;
    font-size:28px;font-weight:900;color:#fff;background:linear-gradient(145deg,#8e6bff,#4a2bb3)}
  .lm2-avatar::after{content:"";position:absolute;inset:-9px;background:var(--lm2-frame,none) center/100% 100% no-repeat;pointer-events:none}
  .lm2-avatar.turn{box-shadow:0 0 0 3px #ffd54f,0 0 20px #ffd54f;transform:scale(1.05);animation:lm2-glow 1s ease-in-out infinite alternate}
  @keyframes lm2-glow{from{box-shadow:0 0 0 3px #ffd54f,0 0 10px #ffd54f}to{box-shadow:0 0 0 3px #ffd54f,0 0 22px #ffe97a}}
  .lm2-count{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);font-style:normal;font-size:9px;font-weight:900;
    padding:1px 8px;border-radius:9px;background:#2a1608;color:#ffd98a;border:1px solid #c99a4e;white-space:nowrap;z-index:2}

  /* emoji + chat icons */
  .lm2-quick{display:flex;gap:16px;align-items:flex-start}
  .lm2-qbtn{background:transparent;border:0;padding:0;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;color:#ffe9c0}
  .lm2-qbtn .qi{width:38px;height:38px;display:grid;place-items:center;filter:drop-shadow(0 3px 3px #000a);transition:transform .12s}
  .lm2-qbtn:active .qi{transform:scale(.88)}
  .lm2-qbtn .lm2-ico{width:100%;height:100%;object-fit:contain}
  .lm2-qbtn .lm2-fb{font-size:30px}
  .lm2-qbtn small{font-size:10px;font-weight:900;text-shadow:0 1px 3px #000,0 0 3px #000}

  /* name tags on the board */
  .lm2-nametag{position:absolute;z-index:4;display:flex;align-items:center;gap:5px;max-width:42%;pointer-events:none;
    font-size:clamp(9px,3vw,12px);font-weight:900;color:#fff;white-space:nowrap;text-shadow:0 1px 3px #000,0 0 3px #000}
  .lm2-nametag b{overflow:hidden;text-overflow:ellipsis}
  .lm2-nametag .lm2-flag{height:1.25em;width:auto;border-radius:2px;font-size:1.25em;line-height:1}
  .lm2-nametag.red{top:1%;right:5%}
  .lm2-nametag.blue{bottom:1%;left:5%}

  /* ---------- TURN TIMER ---------- */
  .lm2-tmr{position:absolute;top:-12px;left:-12px;width:34px;height:34px;border-radius:50%;z-index:6;
    display:grid;place-items:center;pointer-events:none;
    background:conic-gradient(var(--tc,#3ddc84) var(--p,100%),#2a1608 0);
    box-shadow:0 3px 8px #000b,0 0 0 2px #0008}
  .lm2-tmr[hidden]{display:none}
  .lm2-tmr::before{content:"";position:absolute;inset:4px;border-radius:50%;background:#1d0f06}
  .lm2-tmr b{position:relative;font-size:14px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000}
  .lm2-tmr.urgent{animation:lm2-tpulse .5s ease-in-out infinite alternate}
  @keyframes lm2-tpulse{from{transform:scale(1)}to{transform:scale(1.18)}}
  .lm2-toast{position:absolute;left:50%;top:46%;z-index:40;transform:translate(-50%,-50%);pointer-events:none;
    padding:10px 20px;border-radius:14px;background:#000c;border:2px solid #ffd54f;color:#ffe9a8;
    font-size:16px;font-weight:900;text-shadow:0 2px 3px #000;white-space:nowrap;
    animation:lm2-pop .3s cubic-bezier(.2,1.5,.4,1) both;transition:opacity .3s}
  .lm2-toast.out{opacity:0}

  /* ---------- reaction bubbles ---------- */
  .lm2-bubble{position:absolute;left:50%;z-index:30;pointer-events:none;
    animation:lm2-pop .35s cubic-bezier(.2,1.5,.4,1) both;transition:opacity .3s}
  .lm2-bubble.red{top:calc(100% + 6px)}
  .lm2-bubble.blue{bottom:calc(100% + 10px)}
  .lm2-bubble.out{opacity:0}
  .lm2-bubble.emo{filter:drop-shadow(0 4px 6px #000a)}
  .lm2-bubble.emo>*{display:block;animation:lm2-float .9s ease-in-out infinite alternate}
  .lm2-bubble.txt{width:max-content;max-width:190px;text-align:center;background:#fff;color:#211052;
    font-weight:900;font-size:12px;padding:7px 12px;border-radius:14px;box-shadow:0 4px 12px #000a}
  @keyframes lm2-pop{from{transform:translateX(-50%) scale(.2);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
  @keyframes lm2-float{from{transform:translateY(0) rotate(-4deg)}to{transform:translateY(-5px) rotate(4deg)}}
  .lm2-emo-img{width:58px;height:58px;object-fit:contain}
  .lm2-emo-fb{font-size:46px;line-height:58px;height:58px;display:block}

  /* ---------- 3D DICE ---------- */
  .lm2-dice{--h:20px;position:relative;width:66px;height:66px;flex:0 0 66px;padding:0;
    border-radius:18px;display:grid;place-items:center;cursor:pointer;
    border:2px solid #ffffff66;opacity:.55;filter:saturate(.55);
    box-shadow:0 6px 14px #000a,inset 0 2px 4px #fff6,inset 0 -4px 8px #0005;
    transition:opacity .25s,filter .25s,box-shadow .25s}
  .lm2-dice.red{--pip:#c62828;background:linear-gradient(145deg,#ff8a80,#c62828 70%,#8e1b1b)}
  .lm2-dice.blue{--pip:#1565c0;background:linear-gradient(145deg,#82b1ff,#1565c0 70%,#0d3c8a)}
  .lm2-dice.active{opacity:1;filter:none;box-shadow:0 0 0 3px #ffe56688,0 0 20px #ffd54f,0 6px 14px #000a}
  .lm2-dice.ready{animation:lm2-ready 1s ease-in-out infinite}
  .lm2-dice.ready::after{content:"TAP TO ROLL";position:absolute;bottom:-17px;left:50%;
    transform:translateX(-50%);white-space:nowrap;font-size:8px;font-weight:950;
    letter-spacing:.8px;color:#ffe566;text-shadow:0 1px 3px #000,0 0 3px #000}
  .lm2-dice:disabled{cursor:default}
  @keyframes lm2-ready{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}

  .lm2-scene{width:40px;height:40px;perspective:260px}
  .lm2-dice.rolling .lm2-scene{animation:lm2-toss .95s ease-out}
  @keyframes lm2-toss{
    0%{transform:translateY(0) scale(1)}
    28%{transform:translateY(-15px) scale(1.3)}
    58%{transform:translateY(0) scale(1)}
    74%{transform:translateY(-6px) scale(1.1)}
    100%{transform:translateY(0) scale(1)}}
  .lm2-cube{width:100%;height:100%;position:relative;transform-style:preserve-3d}
  .lm2-face{position:absolute;inset:0;border-radius:20%;
    background:linear-gradient(145deg,#ffffff,#d9deea);
    box-shadow:inset 0 0 7px #0003,inset 0 0 0 1px #fff;
    display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:13%;
    backface-visibility:hidden}
  .lm2-face i{place-self:center;width:84%;aspect-ratio:1;border-radius:50%}
  .lm2-face i.on{background:radial-gradient(circle at 35% 30%,#fff7 0,transparent 35%),var(--pip);
    box-shadow:inset 0 -1px 2px #0007}
  .lm2-face.f1 i.on{transform:scale(1.3)}
  .f1{transform:rotateY(0deg) translateZ(var(--h))}
  .f2{transform:rotateY(90deg) translateZ(var(--h))}
  .f3{transform:rotateX(90deg) translateZ(var(--h))}
  .f4{transform:rotateX(-90deg) translateZ(var(--h))}
  .f5{transform:rotateY(-90deg) translateZ(var(--h))}
  .f6{transform:rotateY(180deg) translateZ(var(--h))}

  /* ---------- board ---------- */
  .lm2-boardwrap{width:min(94vw,520px,56dvh);aspect-ratio:1;flex:0 0 auto}
  .lm2-board{position:relative;width:100%;height:100%;border:5px solid #2a1608;border-radius:10px;
    overflow:hidden;background:#fff8ed;box-shadow:0 9px 24px #000b,0 0 0 2px #c99a4e}
  .lm2-boardbg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
  .lm2-board-fallback{position:absolute;inset:0;display:none;place-items:center;text-align:center;
    color:#28145f;background:#fff1d8;font-size:13px;font-weight:900;padding:20px}
  .lm2-board-fallback.visible{display:grid}
  .lm2-pieces,.lm2-debug{position:absolute;inset:0}
  .lm2-debug{pointer-events:none;z-index:9}
  .lm2-debug span{position:absolute;transform:translate(-50%,-50%);font-size:7px;font-weight:900;
    background:#000a;color:#0f0;border-radius:3px;padding:0 2px}

  /* ---------- tokens ---------- */
  .lm2-piece{position:absolute;transform:translate(-50%,-50%);padding:0;border:0;background:transparent;
    display:grid;place-items:center;z-index:3;cursor:pointer;
    transition:left .19s linear,top .19s linear,width .19s,height .19s,opacity .3s;
    filter:drop-shadow(0 2px 2px #0009)}
  .lm2-piece:disabled{cursor:default}
  .lm2-piece>img,.lm2-piece>.fallback-goti{width:100%;height:100%;object-fit:contain;pointer-events:none}
  .lm2-piece.selectable{z-index:7}
  .lm2-piece.selectable::before{content:"";position:absolute;inset:-16%;border-radius:50%;
    border:2px solid #ffe500;box-shadow:0 0 10px #ffe500,inset 0 0 8px #ffe50088;
    animation:lm2-ring .7s infinite alternate;pointer-events:none}
  .lm2-piece.selectable>img,.lm2-piece.selectable>.fallback-goti{animation:lm2-bob .55s infinite alternate}
  .lm2-piece.moving{z-index:9}
  .lm2-piece.hop>img,.lm2-piece.hop>.fallback-goti{animation:lm2-hop .19s}
  @keyframes lm2-ring{from{transform:scale(.88);opacity:.6}to{transform:scale(1.14);opacity:1}}
  @keyframes lm2-bob{from{transform:translateY(0)}to{transform:translateY(-9%)}}
  @keyframes lm2-hop{0%{transform:translateY(0) scale(1)}50%{transform:translateY(-38%) scale(1.28)}100%{transform:translateY(0) scale(1)}}
  .lm2-piece .fallback-goti{display:none;width:78%;height:78%;border-radius:50%;border:2px solid #fff;
    background:var(--goti);box-shadow:inset -3px -4px 5px #0007}
  .lm2-piece.no-image .fallback-goti{display:block}

  /* ---------- emoji / chat popup ---------- */
  .lm2-emoji-layer{position:fixed;inset:0;z-index:9000}
  .lm2-emoji-layer[hidden]{display:none}
  .lm2-emoji-pop{position:absolute;left:0;right:0;margin:0 auto;width:min(calc(100vw - 16px),410px);
    padding:14px 12px 12px;border-radius:20px;
    background:linear-gradient(180deg,#1d4f93,#0c2a5c);border:3px solid #4a90e2;
    box-shadow:0 12px 34px #000b,inset 0 0 20px #5aa7ff44;animation:lm2-slide .22s ease-out}
  .lm2-emoji-pop[hidden]{display:none}
  .lm2-emoji-pop::after{content:"";position:absolute;left:calc(var(--ax,50px) - 11px);bottom:-13px;width:22px;height:22px;
    background:#0c2a5c;border-right:3px solid #4a90e2;border-bottom:3px solid #4a90e2;
    transform:rotate(45deg);border-radius:0 0 6px 0}
  @keyframes lm2-slide{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}
  .lm2-emoji-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
  .lm2-emoji-grid button{background:transparent;border:0;padding:2px;display:grid;place-items:center;
    cursor:pointer;transition:transform .12s}
  .lm2-emoji-grid button:active{transform:scale(.85)}
  .lm2-emoji-grid .lm2-emo-img{width:56px;height:56px}
  .lm2-emoji-grid .lm2-emo-fb{font-size:44px;line-height:56px;height:56px}
  .lm2-quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .lm2-quick-grid button{border:2px solid #7db8ff;border-radius:6px;padding:9px 6px;color:#fff;
    background:linear-gradient(180deg,#3a7be0,#1f4fb3);font-size:15px;font-weight:900;cursor:pointer;
    text-shadow:0 2px 2px #0007;box-shadow:inset 0 1px 0 #fff4,0 3px 5px #0006}
  .lm2-chat-row{display:flex;gap:8px}
  .lm2-chat-row input{flex:1;min-width:0;padding:11px;border-radius:8px;border:2px solid #7db8ff;background:#0a1f45;color:#fff;font-size:15px;outline:none}
  .lm2-chat-row button{border:2px solid #7db8ff;border-radius:8px;padding:0 18px;color:#fff;font-weight:900;font-size:15px;cursor:pointer;
    background:linear-gradient(180deg,#3a7be0,#1f4fb3)}

  /* ---------- MENU DRAWER ---------- */
  .lm2-menu-layer{position:fixed;inset:0;z-index:9500;pointer-events:none}
  .lm2-menu-layer.open{pointer-events:auto}
  .lm2-menu-back{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .32s}
  .lm2-menu-layer.open .lm2-menu-back{opacity:.6}
  .lm2-menu-panel{position:absolute;left:0;top:0;bottom:0;width:min(80vw,310px);padding:18px 16px;display:flex;flex-direction:column;gap:12px;
    background:var(--lm2-panel,none) center/100% 100% no-repeat,
      repeating-linear-gradient(90deg,#0000 0 7px,#0000001a 7px 8px),
      linear-gradient(180deg,#7a4f26,#4d2f16 70%,#35200f);
    border-right:4px solid #24130a;box-shadow:8px 0 24px #000c,inset -2px 0 0 #d4a26a55;
    transform:translateX(-106%);transition:transform .4s cubic-bezier(.2,.9,.25,1)}
  .png-panel .lm2-menu-panel{background:var(--lm2-panel) center/100% 100% no-repeat;border:0}
  .lm2-menu-layer.open .lm2-menu-panel{transform:none}
  .lm2-menu-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #24130a66}
  .lm2-menu-head h3{margin:0;font-size:26px;font-weight:900;letter-spacing:2px;
    background:linear-gradient(180deg,var(--gold1),var(--gold2) 55%,var(--gold3));-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 2px 0 #2a1406)}
  .lm2-menu-x{width:36px;height:36px;border-radius:50%;border:2px solid #e6bd86;background:linear-gradient(#c9965c,#7a4d22);
    color:#fff;font-size:20px;font-weight:900;cursor:pointer;box-shadow:0 3px 6px #0008;padding:0;line-height:1}
  .lm2-menu-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer;
    background:linear-gradient(180deg,#00000033,#00000055);border:2px solid #24130a88;box-shadow:inset 0 1px 0 #fff2;
    opacity:0;transform:translateX(-26px);transition:opacity .3s,transform .35s cubic-bezier(.2,.9,.25,1)}
  .lm2-menu-layer.open .lm2-menu-item{opacity:1;transform:none;transition-delay:calc(.14s + var(--i) * .07s)}
  .lm2-menu-item .mi{width:34px;height:34px;display:grid;place-items:center;flex:0 0 34px}
  .lm2-menu-item .mi .lm2-ico{width:100%;height:100%;object-fit:contain}
  .lm2-menu-item .mi .lm2-fb{font-size:26px}
  .lm2-menu-item .ml{flex:1;font-size:16px;font-weight:900;color:#ffe9c0;text-shadow:0 2px 2px #0008}
  .lm2-switch{position:relative;width:52px;height:28px;border-radius:14px;border:2px solid #24130a;background:#5a4a40;flex:0 0 52px;
    transition:background .25s;box-shadow:inset 0 2px 4px #0008}
  .lm2-switch i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;
    background:linear-gradient(#fff,#ddd);box-shadow:0 2px 4px #0009;transition:transform .25s cubic-bezier(.3,1.4,.5,1)}
  .lm2-switch.on{background:linear-gradient(#3ddc84,#12934f)}
  .lm2-switch.on i{transform:translateX(24px)}
  .lm2-menu-sp{flex:1}
  .lm2-menu-item.leave{background:linear-gradient(180deg,#e0453f,#a11a16);border-color:#5e0b09;justify-content:center}
  .lm2-menu-item.leave .ml{flex:0 0 auto;color:#fff}
  .lm2-menu-item.leave .mi{width:28px;height:28px;flex:0 0 28px}

  /* ---------- modal ---------- */
  .lm2-modal{position:fixed;inset:0;z-index:9999;background:#08031dcc;display:grid;place-items:center;padding:20px}
  .lm2-modal[hidden]{display:none}
  .lm2-card{position:relative;width:min(320px,90vw);padding:24px 18px 18px;border-radius:20px;
    background:linear-gradient(145deg,#fff,#d9ceff);color:#281064;border:2px solid #bca5ff;
    box-shadow:0 12px 35px #0009;text-align:center;animation:lm2-slide .25s ease-out}
  .lm2-card h2{margin:4px 0 8px;font-size:25px}
  .lm2-card p{margin:5px 0 15px;font-size:13px}
  .lm2-card button{border:0;border-radius:14px;padding:10px 17px;background:#5424c7;color:#fff;font-weight:900;cursor:pointer}
  .lm2-card .row{display:flex;gap:10px;justify-content:center}

  @media(min-width:600px){.lm2-root{justify-content:flex-start}}
  `;

  /* ================================================================== */
  /*  SMALL HTML HELPERS                                                 */
  /* ================================================================== */
  const PIPS = { 1:[4], 2:[2,6], 3:[2,4,6], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };

  const faceHtml = n =>
    `<div class="lm2-face f${n}">${
      Array.from({ length: 9 }, (_, i) =>
        `<i${PIPS[n].includes(i) ? ' class="on"' : ""}></i>`).join("")
    }</div>`;

  const cubeHtml = () =>
    `<div class="lm2-scene"><div class="lm2-cube">${[1,2,3,4,5,6].map(faceHtml).join("")}</div></div>`;

  const ROT = { 1:[0,0], 2:[0,-90], 3:[-90,0], 4:[90,0], 5:[0,90], 6:[0,180] };

  // PNG icon with automatic text fallback
  const iconHtml = (file, fb, fbClass = "lm2-fb") =>
    `<img class="lm2-ico" src="${ASSET(file)}" data-fb="${fb}" data-fbclass="${fbClass}" alt="">`;

  const emojiHtml = i =>
    `<img class="lm2-emo-img" data-fb="${EMOJI_FALLBACK[i]}" data-fbclass="lm2-emo-fb" src="${ASSET(`emoji_${i + 1}.png`)}" alt="">`;

  /* ================================================================== */
  /*  GAME HELPERS                                                       */
  /* ================================================================== */
  const COLORS = ["red", "blue"];
  const other = c => (c === "red" ? "blue" : "red");
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function createState() {
    return {
      turn: Math.random() < 0.5 ? "red" : "blue",
      dice: null,
      rolled: false,
      busy: false,
      gameOver: false,
      tokens: { red: [-1,-1,-1,-1], blue: [-1,-1,-1,-1] },
      winner: null,
      moving: null
    };
  }

  const globalIndex = (color, step) => (PLAYERS[color].start + step) % TRACK_LEN;

  function legalMove(state, color, index, dice) {
    const step = state.tokens[color][index];
    if (step === FINISH) return false;
    if (step === -1) return dice === 6;
    return step + dice <= FINISH;
  }

  function getLegal(state) {
    if (!state.rolled || state.dice == null || state.gameOver) return [];
    return state.tokens[state.turn]
      .map((_, i) => (legalMove(state, state.turn, i, state.dice) ? i : -1))
      .filter(i => i >= 0);
  }

  function tokenPos(color, index, step) {
    const P = PLAYERS[color];
    if (step === -1) {
      const [x, y] = HOME_POSITIONS[color][index];
      return { x, y, size: SIZE_HOME, kind: "home" };
    }
    if (step <= LAST_TRACK_STEP) {
      const [r, c] = TRACK[globalIndex(color, step)];
      return { x: cellX(c), y: cellY(r), size: SIZE_TRACK, kind: "track" };
    }
    if (step < FINISH) {
      const [r, c] = P.lane[step - LANE_START];
      return { x: cellX(c), y: cellY(r), size: SIZE_TRACK, kind: "lane" };
    }
    const [x, y] = FINISH_POS[color](index);
    return { x, y, size: SIZE_FINISH, kind: "finish" };
  }

  const STACK_OFFSETS = {
    2: [[-1.7, 0], [1.7, 0]],
    3: [[-1.7, 1.2], [1.7, 1.2], [0, -1.6]],
    4: [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]
  };

  const fmtMoney = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

  /* ================================================================== */
  /*  START / STOP                                                       */
  /* ================================================================== */
  let cleanup = null;
  let activeApi = null;
  function stop() { if (cleanup) cleanup(); }

  function start({
    mount,
    match = {},
    onFinish = () => {},
    onExit = () => {},
    onReaction = () => {}
  } = {}) {
    if (!mount) throw new Error("LudoGame.start requires a mount element.");
    stop();
    audio.load();

    const state = createState();
    let destroyed = false;
    let aiTimer = null;
    let nextReactionAt = 0;
    let panelMode = null;
    let menuOpen = false;
    const timers = new Set();
    const bubbleTimers = {};

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
      timers.add(id);
      return id;
    };

    const isAI = match.ai === true || match.mode === "ai" || match.opponentType === "ai";
    const opponent = String(match.opponent || (isAI ? "Ludo Bot" : "Opponent"));
    const me = String(match.me || "You");

    // ---- bet amount (accepts many key names, and text like "₹5") ----
    let betRaw;
    for (const k of BET_KEYS) {
      if (match[k] !== undefined && match[k] !== null && match[k] !== "") { betRaw = match[k]; break; }
    }
    const betNum = Number(String(betRaw ?? "").replace(/[^\d.]/g, ""));
    const hasBet = betRaw !== undefined && betRaw !== null && betRaw !== "" && Number.isFinite(betNum);
    const betText = hasBet ? fmtMoney(betNum) : "";

    const isBot = c => isAI && c === "red";

    const safeText = s => String(s).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));

    const flagHtml = f => {
      if (!f) return "";
      return /\.(png|jpe?g|webp|svg|gif)$/i.test(f)
        ? `<img class="lm2-flag" src="${assetOrUrl(f)}" alt="" onerror="this.remove()">`
        : `<span class="lm2-flag">${safeText(f)}</span>`;
    };

    const avatarHtml = (src, name) =>
      `<img src="${safeText(assetOrUrl(src))}" data-fb="${safeText((name || "?").trim().charAt(0).toUpperCase() || "?")}" data-fbclass="lm2-initial" alt="">`;

    const style = document.createElement("style");
    style.dataset.lm2Style = "1";
    style.textContent = css;
    document.head.append(style);

    mount.innerHTML = `
      <section class="lm2-root">

        <header class="lm2-topbar">
          <button type="button" class="lm2-menubtn" data-action="menu-open" aria-label="Menu">
            <span class="bars"><i></i><i></i><i></i></span>
          </button>
          <div class="lm2-vs">${hasBet ? `₹${betText} vs ₹${betText}` : "LUDO MASTERS"}</div>
          ${hasBet ? `
          <div class="lm2-coin">
            ${iconHtml("icon_coin.png", "₹", "lm2-coinfb")}
            <b>${betText}</b>
          </div>` : `<div style="width:48px"></div>`}
        </header>

        <div class="lm2-prow red">
          <button type="button" class="lm2-dice red" id="lm2-red-dice" disabled>${cubeHtml()}</button>
          <div class="lm2-pwrap" id="lm2-red-wrap">
            <div class="lm2-avatar" id="lm2-red-profile">
              ${avatarHtml(match.opponentAvatar || PLAYERS.red.avatar, opponent)}
              <span class="lm2-tmr" id="lm2-red-tmr" hidden><b>15</b></span>
              <em class="lm2-count" id="lm2-red-count">0/4</em>
            </div>
          </div>
        </div>

        <div class="lm2-boardwrap">
          <div class="lm2-board">
            <img class="lm2-boardbg" src="${ASSET("ludo_board.png")}" alt="Ludo board">
            <div class="lm2-board-fallback">
              Add your complete board image at <code>assets/ludo_board.png</code>
            </div>
            <div class="lm2-nametag red">${flagHtml(match.opponentFlag)}<b>${safeText(opponent)}</b></div>
            <div class="lm2-nametag blue">${flagHtml(match.meFlag)}<b>${safeText(me)}</b></div>
            <div class="lm2-pieces"></div>
            <div class="lm2-debug"></div>
          </div>
        </div>

        <div class="lm2-prow blue">
          <div class="lm2-pcol">
            <div class="lm2-pwrap" id="lm2-blue-wrap">
              <div class="lm2-avatar" id="lm2-blue-profile">
                ${avatarHtml(match.meAvatar || PLAYERS.blue.avatar, me)}
                <span class="lm2-tmr" id="lm2-blue-tmr" hidden><b>15</b></span>
                <em class="lm2-count" id="lm2-blue-count">0/4</em>
              </div>
            </div>
            <div class="lm2-quick">
              <button type="button" class="lm2-qbtn" id="lm2-emoji-btn" data-action="emoji" aria-label="Emoji">
                <span class="qi">${iconHtml("icon_emoji.png", "😄")}</span><small>Emoji</small>
              </button>
              <button type="button" class="lm2-qbtn" id="lm2-chat-btn" data-action="chat" aria-label="Chat">
                <span class="qi">${iconHtml("icon_chat.png", "💬")}</span><small>Chat</small>
              </button>
            </div>
          </div>
          <button type="button" class="lm2-dice blue" id="lm2-blue-dice">${cubeHtml()}</button>
        </div>

        <!-- emoji / chat popup -->
        <div class="lm2-emoji-layer" id="lm2-emoji-layer" hidden>
          <div class="lm2-emoji-pop" id="lm2-pop-emoji" hidden>
            <div class="lm2-emoji-grid">
              ${EMOJI_FALLBACK.map((_, i) =>
                `<button type="button" data-emoji-id="${i}" aria-label="Emoji ${i + 1}">${emojiHtml(i)}</button>`
              ).join("")}
            </div>
            <div class="lm2-quick-grid">
              ${QUICK_TEXT.map((t, i) =>
                `<button type="button" data-quick="${i}">${safeText(t)}</button>`
              ).join("")}
            </div>
          </div>
          <div class="lm2-emoji-pop" id="lm2-pop-chat" hidden>
            <div class="lm2-chat-row">
              <input id="lm2-chat-input" maxlength="40" placeholder="Type a message..." autocomplete="off">
              <button type="button" data-action="chat-send">Send</button>
            </div>
          </div>
        </div>

        <!-- slide-in menu -->
        <div class="lm2-menu-layer" id="lm2-menu-layer">
          <div class="lm2-menu-back" data-action="menu-close"></div>
          <aside class="lm2-menu-panel">
            <div class="lm2-menu-head">
              <h3>MENU</h3>
              <button type="button" class="lm2-menu-x" data-action="menu-close" aria-label="Close">✕</button>
            </div>

            <div class="lm2-menu-item" style="--i:0" data-action="toggle-sfx" role="button">
              <span class="mi" id="lm2-sfx-ico"></span>
              <span class="ml">Sound</span>
              <span class="lm2-switch" id="lm2-sfx-sw"><i></i></span>
            </div>

            <div class="lm2-menu-item" style="--i:1" data-action="toggle-music" role="button">
              <span class="mi" id="lm2-music-ico"></span>
              <span class="ml">Music</span>
              <span class="lm2-switch" id="lm2-music-sw"><i></i></span>
            </div>

            <div class="lm2-menu-sp"></div>

            <div class="lm2-menu-item leave" style="--i:2" data-action="leave" role="button">
              <span class="mi">${iconHtml("icon_leave.png", "🚪")}</span>
              <span class="ml">Leave Match</span>
            </div>
          </aside>
        </div>

        <div class="lm2-modal" id="lm2-modal" hidden>
          <div class="lm2-card">
            <div id="lm2-modal-content"></div>
          </div>
        </div>
      </section>
    `;

    const root = mount.querySelector(".lm2-root");
    const modal = root.querySelector("#lm2-modal");
    const modalContent = root.querySelector("#lm2-modal-content");
    const boardImage = root.querySelector(".lm2-boardbg");
    const layer = root.querySelector(".lm2-pieces");
    const emojiLayer = root.querySelector("#lm2-emoji-layer");
    const popEmoji = root.querySelector("#lm2-pop-emoji");
    const popChat = root.querySelector("#lm2-pop-chat");
    const chatInput = root.querySelector("#lm2-chat-input");
    const emojiBtn = root.querySelector("#lm2-emoji-btn");
    const chatBtn = root.querySelector("#lm2-chat-btn");
    const menuLayer = root.querySelector("#lm2-menu-layer");

    // ---- background image ----
    const bgFile = match.background || BACKGROUND_FILE;
    root.style.setProperty("--lm2-bg", `url("${assetOrUrl(bgFile)}")`);

    // ---- optional PNG skins ----
    Object.entries(SKINS).forEach(([key, file]) => {
      const im = new Image();
      im.onload = () => {
        if (destroyed) return;
        root.style.setProperty(`--lm2-${key}`, `url("${im.src}")`);
        root.classList.add(`png-${key}`);
      };
      im.src = ASSET(file);
    });

    const dice = {
      red:  root.querySelector("#lm2-red-dice"),
      blue: root.querySelector("#lm2-blue-dice")
    };
    const cubes = {
      red:  dice.red.querySelector(".lm2-cube"),
      blue: dice.blue.querySelector(".lm2-cube")
    };
    const profiles = {
      red:  root.querySelector("#lm2-red-profile"),
      blue: root.querySelector("#lm2-blue-profile")
    };
    const wraps = {
      red:  root.querySelector("#lm2-red-wrap"),
      blue: root.querySelector("#lm2-blue-wrap")
    };
    const counts = {
      red:  root.querySelector("#lm2-red-count"),
      blue: root.querySelector("#lm2-blue-count")
    };

    boardImage.addEventListener("error", () => {
      root.querySelector(".lm2-board-fallback").classList.add("visible");
    });

    // any <img data-fb> that fails to load -> show its fallback text/emoji
    root.addEventListener("error", e => {
      const t = e.target;
      if (t && t.tagName === "IMG" && t.dataset.fb !== undefined) {
        const s = document.createElement("span");
        s.className = t.dataset.fbclass || "lm2-fb";
        s.textContent = t.dataset.fb;
        t.replaceWith(s);
      }
    }, true);

    /* ---------------- debug grid (window.LUDO_DEBUG = true) ---------------- */
    if (window.LUDO_DEBUG) {
      const dbg = root.querySelector(".lm2-debug");
      const mk = (x, y, t) => {
        const s = document.createElement("span");
        s.style.left = x + "%"; s.style.top = y + "%"; s.textContent = t;
        dbg.append(s);
      };
      TRACK.forEach(([r, c], i) => mk(cellX(c), cellY(r), i));
      COLORS.forEach(col => PLAYERS[col].lane.forEach(([r, c], i) => mk(cellX(c), cellY(r), "L" + i)));
      COLORS.forEach(col => HOME_POSITIONS[col].forEach(([x, y], i) => mk(x, y, "H" + i)));
    }

    /* ---------------- sound toggles (in menu) ---------------- */
    function refreshSoundUi() {
      root.querySelector("#lm2-sfx-ico").innerHTML =
        audio.sfxOn ? iconHtml("icon_sound.png", "🔊") : iconHtml("icon_sound_off.png", "🔇");
      root.querySelector("#lm2-music-ico").innerHTML =
        audio.musicOn ? iconHtml("icon_music.png", "🎵") : iconHtml("icon_music_off.png", "🔕");
      root.querySelector("#lm2-sfx-sw").classList.toggle("on", audio.sfxOn);
      root.querySelector("#lm2-music-sw").classList.toggle("on", audio.musicOn);
    }
    refreshSoundUi();

    let musicStarted = false;
    const firstTouch = () => {
      audio.unlock();                // unlock Web Audio on EVERY touch
      if (musicStarted) return;
      musicStarted = true;
      audio.startMusic();
    };
    root.addEventListener("pointerdown", firstTouch);

    const onVisibility = () => {
      if (document.hidden) audio.pauseMusic();
      else {
        audio.unlock();
        if (musicStarted) audio.startMusic();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    /* ---------------- menu ---------------- */
    function openMenu() {
      if (menuOpen) return;
      closePanel();
      menuOpen = true;
      audio.play("menu_open");
      menuLayer.classList.add("open");
    }
    function closeMenu(silent = false) {
      if (!menuOpen) return;
      menuOpen = false;
      if (!silent) audio.play("menu_close");
      menuLayer.classList.remove("open");
    }

    /* ---------------- dice 3D ---------------- */
    const spinBase = { red: [0, 0], blue: [0, 0] };

    function showFace(color, n, spin) {
      const cube = cubes[color];
      const b = spinBase[color];
      if (spin) {
        b[0] += 360 * (2 + Math.floor(Math.random() * 2));
        b[1] += 360 * (2 + Math.floor(Math.random() * 2));
      }
      const [fx, fy] = ROT[n];
      cube.style.transition = spin ? "transform .95s cubic-bezier(.15,.7,.25,1)" : "none";
      cube.style.transform =
        `rotateX(-16deg) rotateY(20deg) rotateX(${b[0] + fx}deg) rotateY(${b[1] + fy}deg)`;
    }
    showFace("red", 1, false);
    showFace("blue", 1, false);

    /* ---------------- tokens ---------------- */
    const pieces = { red: [], blue: [] };

    COLORS.forEach(color => {
      for (let i = 0; i < 4; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lm2-piece";
        btn.dataset.color = color;
        btn.dataset.token = String(i);
        btn.style.setProperty("--goti", PLAYERS[color].color);
        btn.setAttribute("aria-label", `${color} token ${i + 1}`);

        const img = document.createElement("img");
        img.src = ASSET(PLAYERS[color].goti);
        img.alt = "";
        img.onerror = () => { btn.classList.add("no-image"); img.remove(); };
        btn.append(img);

        const fb = document.createElement("span");
        fb.className = "fallback-goti";
        btn.append(fb);

        layer.append(btn);
        pieces[color].push(btn);
      }
    });

    function renderTokens() {
      const items = [];
      COLORS.forEach(color => {
        state.tokens[color].forEach((step, index) => {
          items.push({ color, index, step, ...tokenPos(color, index, step) });
        });
      });

      const groups = new Map();
      items.forEach(it => {
        if (it.kind === "track" || it.kind === "lane") {
          const key = it.x.toFixed(1) + "," + it.y.toFixed(1);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(it);
        }
      });
      groups.forEach(arr => {
        const n = Math.min(arr.length, 4);
        if (arr.length > 1) {
          arr.forEach((it, j) => {
            const o = STACK_OFFSETS[n][j % n];
            it.x += o[0];
            it.y += o[1];
            it.size = n === 2 ? 5.2 : 4.5;
          });
        }
      });

      const legal = getLegal(state);

      items.forEach(it => {
        const el = pieces[it.color][it.index];
        const nu = TOKEN_NUDGE[it.color] || [0, 0];
        el.style.left = (it.x + nu[0]) + "%";
        el.style.top  = (it.y + nu[1]) + "%";
        el.style.width = it.size + "%";
        el.style.height = it.size + "%";

        const selectable =
          !state.busy && !state.gameOver && !isBot(it.color) &&
          it.color === state.turn && legal.includes(it.index);

        el.disabled = !selectable;
        el.classList.toggle("selectable", selectable);
        el.classList.toggle(
          "moving",
          !!state.moving && state.moving.color === it.color && state.moving.index === it.index
        );
        el.style.opacity = it.step === FINISH ? ".75" : "1";
      });
    }

    function hop(color, index) {
      const el = pieces[color][index];
      el.classList.remove("hop");
      void el.offsetWidth;
      el.classList.add("hop");
    }

    /* ---------------- UI update ---------------- */
    function update() {
      COLORS.forEach(color => {
        const myTurn = !state.gameOver && state.turn === color;
        const clickable = myTurn && !isBot(color) && !state.busy && !state.rolled;

        dice[color].disabled = !clickable;
        dice[color].classList.toggle("active", myTurn);
        dice[color].classList.toggle("ready", clickable);
        profiles[color].classList.toggle("turn", myTurn);

        const done = state.tokens[color].filter(s => s === FINISH).length;
        counts[color].textContent = `${done}/4`;
      });

      renderTokens();
    }

    function showModal(html) { modalContent.innerHTML = html; modal.hidden = false; }
    function closeModal() { modal.hidden = true; modalContent.innerHTML = ""; }

    /* ---------------- TURN TIMER (15 sec) ---------------- */
    const timerEls = {
      red:  root.querySelector("#lm2-red-tmr"),
      blue: root.querySelector("#lm2-blue-tmr")
    };
    let turnInterval = null;
    let turnDeadline = 0;

    function hideTimers() {
      COLORS.forEach(c => {
        timerEls[c].hidden = true;
        timerEls[c].classList.remove("urgent");
      });
    }

    function stopTurnTimer() {
      clearInterval(turnInterval);
      turnInterval = null;
      hideTimers();
    }

    function drawTimer(color, remainMs) {
      const el = timerEls[color];
      const secs = Math.max(0, Math.ceil(remainMs / 1000));
      const pct = Math.max(0, Math.min(100, (remainMs / (TURN_SECONDS * 1000)) * 100));
      el.hidden = false;
      el.style.setProperty("--p", pct + "%");
      el.style.setProperty("--tc", secs <= 5 ? "#ff3b30" : secs <= 8 ? "#ffb300" : "#3ddc84");
      el.classList.toggle("urgent", secs <= 5);
      el.querySelector("b").textContent = String(secs);
    }

    function startTurnTimer() {
      stopTurnTimer();
      if (destroyed || state.gameOver || isBot(state.turn)) return;
      const color = state.turn;
      turnDeadline = Date.now() + TURN_SECONDS * 1000;
      drawTimer(color, TURN_SECONDS * 1000);
      turnInterval = setInterval(() => {
        if (destroyed) { stopTurnTimer(); return; }
        const remain = turnDeadline - Date.now();
        if (remain <= 0) { onTurnTimeout(); return; }
        drawTimer(color, remain);
      }, 200);
    }

    function showToast(text) {
      root.querySelector(".lm2-toast")?.remove();
      const t = document.createElement("div");
      t.className = "lm2-toast";
      t.textContent = text;
      root.append(t);
      later(() => { t.classList.add("out"); later(() => t.remove(), 320); }, 1200);
    }

    async function onTurnTimeout() {
      stopTurnTimer();
      if (destroyed || state.gameOver || state.busy) return;
      const color = state.turn;

      // dice was rolled but player did not pick a token -> auto-move the most advanced legal token
      if (state.rolled) {
        const legal = getLegal(state);
        if (legal.length) {
          const best = legal.reduce((a, b) =>
            state.tokens[color][b] > state.tokens[color][a] ? b : a);
          showToast("Time's up! Auto move");
          moveToken(color, best, true);
          return;
        }
      }

      // player did not tap the dice -> turn goes to the opponent
      state.busy = true;
      showToast("Time's up!");
      audio.play("no_move");
      update();
      await wait(900);
      if (destroyed || state.gameOver) return;
      nextTurn(false);
    }

    /* ---------------- emoji / chat panel ---------------- */
    function closePanel() {
      panelMode = null;
      emojiLayer.hidden = true;
      popEmoji.hidden = true;
      popChat.hidden = true;
    }

    function openPanel(mode) {
      if (panelMode === mode) { closePanel(); return; }
      closeMenu(true);
      panelMode = mode;
      emojiLayer.hidden = false;
      popEmoji.hidden = mode !== "emoji";
      popChat.hidden = mode !== "chat";

      const pop = mode === "emoji" ? popEmoji : popChat;
      const btn = mode === "emoji" ? emojiBtn : chatBtn;
      const r = btn.getBoundingClientRect();
      pop.style.bottom = (window.innerHeight - r.top + 14) + "px";
      pop.style.setProperty("--ax", (r.left + r.width / 2 - pop.getBoundingClientRect().left) + "px");

      if (mode === "chat") later(() => chatInput.focus(), 80);
    }

    /* ---------------- reactions ---------------- */
    function showBubble(color, payload) {
      const host = wraps[color];
      host.querySelector(".lm2-bubble")?.remove();

      const b = document.createElement("div");
      if (payload.type === "emoji") {
        const id = Math.max(0, Math.min(7, Number(payload.id) || 0));
        b.className = `lm2-bubble ${color} emo`;
        b.innerHTML = emojiHtml(id);
      } else {
        b.className = `lm2-bubble ${color} txt`;
        b.textContent = String(payload.text || "").slice(0, 60);
      }
      host.append(b);

      clearTimeout(bubbleTimers[color]);
      bubbleTimers[color] = later(() => {
        b.classList.add("out");
        later(() => b.remove(), 320);
      }, 2800);
    }

    function sendReaction(payload) {
      const now = Date.now();
      if (now < nextReactionAt) return;
      nextReactionAt = now + REACTION_COOLDOWN;

      audio.play("emoji_send");
      showBubble("blue", payload);
      onReaction({ from: "blue", ...payload });

      if (isAI && Math.random() < 0.55) {
        later(() => {
          if (payload.type === "text" && payload.text === "Hi") botSay({ type: "text", text: "Hi" });
          else if (payload.type === "text" && payload.text === "Hurry up!") botSay({ type: "text", text: "Sorry!" });
          else if (payload.type === "text" && payload.text === "Well Played!") botSay({ type: "text", text: "Thank you!" });
          else botSay({ type: "emoji", id: pick([1, 4, 5, 3]) });
        }, 900 + Math.random() * 900);
      }
    }

    function receiveReaction(payload) {
      if (destroyed || !payload) return;
      audio.play("emoji_receive");
      showBubble("red", payload);
    }

    function botSay(payload) { receiveReaction(payload); }

    function botReact(kind) {
      if (!isAI || state.gameOver) return;
      const pools = {
        hi:    [{ type: "text", text: "Hi" }, { type: "emoji", id: 3 }],
        happy: [{ type: "emoji", id: 1 }, { type: "emoji", id: 4 }, { type: "text", text: "Hahahaha!" }],
        sad:   [{ type: "emoji", id: 2 }, { type: "emoji", id: 0 }, { type: "emoji", id: 6 }],
        gg:    [{ type: "text", text: "Well Played!" }]
      };
      later(() => botSay(pick(pools[kind])), 700 + Math.random() * 600);
    }

    /* ---------------- flow ---------------- */
    function finishGame(color) {
      state.gameOver = true;
      state.busy = true;
      state.winner = color;
      stopTurnTimer();
      const winnerName = color === "red" ? opponent : me;
      update();
      closeMenu(true);
      closePanel();

      const iWon = color === "blue";
      audio.play(iWon ? "win" : "lose");
      if (iWon) botReact("gg");

      showModal(`
        <div style="font-size:48px">${iWon ? "🏆" : "😔"}</div>
        <h2>${safeText(winnerName)} Wins!</h2>
        <p>${hasBet && iWon ? `You won the ₹${betText} match.` : "All four tokens reached home."}</p>
        <button type="button" data-action="result-exit">Back to Lobby</button>
      `);

      onFinish({ winner: color, winnerName, loser: other(color) });
    }

    function nextTurn(extra = false) {
      state.busy = false;
      state.rolled = false;
      state.dice = null;
      state.moving = null;

      if (!extra) state.turn = other(state.turn);

      if (extra) audio.play("extra_turn");
      else if (!isBot(state.turn)) audio.play("your_turn");

      update();
      if (isBot(state.turn)) { stopTurnTimer(); scheduleAiTurn(); }
      else startTurnTimer();
    }

    function scheduleAiTurn() {
      if (!isAI || state.gameOver || state.turn !== "red" || state.busy || state.rolled) return;
      clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        if (!destroyed && !state.gameOver && state.turn === "red" && !state.busy && !state.rolled) {
          roll("red");
        }
      }, 700);
    }

    function chooseAiToken(legal, d) {
      let best = legal[0];
      let bestScore = -Infinity;

      for (const index of legal) {
        const old = state.tokens.red[index];
        const next = old === -1 ? 0 : old + d;
        let score = next;

        if (old === -1) score += 25;
        if (next === FINISH) score += 100;
        else if (next >= LANE_START) score += 18;

        if (next <= LAST_TRACK_STEP) {
          const g = globalIndex("red", next);
          const safe = SAFE_TRACK_INDEXES.has(g);

          if (safe) score += 10;
          else {
            const canCapture = state.tokens.blue.some(s =>
              s >= 0 && s <= LAST_TRACK_STEP && globalIndex("blue", s) === g);
            if (canCapture) score += 60;

            const danger = state.tokens.blue.some(s => {
              if (s < 0 || s > LAST_TRACK_STEP) return false;
              const dist = (g - globalIndex("blue", s) + TRACK_LEN) % TRACK_LEN;
              return dist >= 1 && dist <= 6;
            });
            if (danger) score -= 12;
          }
        }

        if (old >= 0 && old <= LAST_TRACK_STEP) {
          const gOld = globalIndex("red", old);
          if (!SAFE_TRACK_INDEXES.has(gOld)) {
            const inDanger = state.tokens.blue.some(s => {
              if (s < 0 || s > LAST_TRACK_STEP) return false;
              const dist = (gOld - globalIndex("blue", s) + TRACK_LEN) % TRACK_LEN;
              return dist >= 1 && dist <= 6;
            });
            if (inDanger) score += 14;
          }
        }

        if (score > bestScore) { bestScore = score; best = index; }
      }
      return best;
    }

    async function roll(color) {
      if (state.busy || state.gameOver || state.turn !== color || state.rolled) return;

      stopTurnTimer();
      state.busy = true;
      const n = 1 + Math.floor(Math.random() * 6);

      dice[color].classList.add("rolling");
      showFace(color, n, true);
      audio.play("dice_roll");
      update();

      await wait(1000);
      if (destroyed) return;

      dice[color].classList.remove("rolling");
      audio.play("dice_land");
      state.dice = n;
      state.rolled = true;
      state.busy = false;

      const legal = getLegal(state);

      if (!legal.length) {
        state.busy = true;
        audio.play("no_move");
        update();
        await wait(1000);
        if (destroyed || state.gameOver) return;
        nextTurn(false);
        return;
      }

      if (isBot(color)) {
        update();
        await wait(750);
        if (destroyed || state.gameOver) return;
        moveToken(color, chooseAiToken(legal, n), true);
        return;
      }

      const allAtBase = legal.every(i => state.tokens[color][i] === -1);
      if (legal.length === 1 || allAtBase) {
        update();
        await wait(450);
        if (destroyed || state.gameOver) return;
        moveToken(color, legal[0], false);
        return;
      }

      update(); // glowing tokens appear
      startTurnTimer(); // time to choose a token
    }

    async function moveToken(color, index, byBot = false) {
      if (state.gameOver || state.busy || !state.rolled || state.turn !== color) return;
      if (isBot(color) && !byBot) return;
      if (!getLegal(state).includes(index)) return;

      const d = state.dice;
      const old = state.tokens[color][index];

      stopTurnTimer();
      state.busy = true;
      state.rolled = false;
      state.moving = { color, index };
      update();

      if (old === -1) {
        state.tokens[color][index] = 0;
        audio.play("token_enter");
        hop(color, index);
        update();
        await wait(300);
      } else {
        for (let k = 1; k <= d; k++) {
          state.tokens[color][index] = old + k;
          hop(color, index);
          audio.play("token_step");
          update();
          await wait(STEP_MS);
          if (destroyed) return;
        }
      }
      if (destroyed) return;

      const newStep = state.tokens[color][index];

      let captured = false;
      let landedSafe = false;
      if (newStep <= LAST_TRACK_STEP) {
        const g = globalIndex(color, newStep);
        if (SAFE_TRACK_INDEXES.has(g)) {
          landedSafe = old !== -1;
        } else {
          const oc = other(color);
          state.tokens[oc].forEach((s, oi) => {
            if (s >= 0 && s <= LAST_TRACK_STEP && globalIndex(oc, s) === g) {
              state.tokens[oc][oi] = -1;
              captured = true;
            }
          });
        }
      }

      if (captured) {
        audio.play("token_capture");
        update();
        if (isAI) botReact(color === "red" ? "happy" : "sad");
        await wait(600);
        if (destroyed) return;
      } else if (landedSafe && newStep !== FINISH) {
        audio.play("safe_square");
      }

      const reachedHome = newStep === FINISH;
      if (reachedHome) audio.play("token_home");

      if (state.tokens[color].every(s => s === FINISH)) {
        state.moving = null;
        finishGame(color);
        return;
      }

      state.moving = null;
      update();

      await wait(captured || reachedHome ? 600 : 350);
      if (destroyed || state.gameOver) return;

      nextTurn(d === 6 || captured || reachedHome);
    }

    /* ---------------- events ---------------- */
    function sendChatText() {
      const value = chatInput.value.trim();
      if (!value) return;
      chatInput.value = "";
      closePanel();
      sendReaction({ type: "text", text: value });
    }

    function clickHandler(event) {
      const piece = event.target.closest(".lm2-piece");
      if (piece) {
        moveToken(piece.dataset.color, Number(piece.dataset.token), false);
        return;
      }

      const emo = event.target.closest("[data-emoji-id]");
      if (emo) {
        closePanel();
        sendReaction({ type: "emoji", id: Number(emo.dataset.emojiId) });
        return;
      }

      const quick = event.target.closest("[data-quick]");
      if (quick) {
        closePanel();
        sendReaction({ type: "text", text: QUICK_TEXT[Number(quick.dataset.quick)] });
        return;
      }

      if (event.target === emojiLayer) { closePanel(); return; }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;

      switch (action) {
        case "menu-open":
          openMenu();
          break;
        case "menu-close":
          closeMenu();
          break;
        case "toggle-sfx":
          audio.setSfx(!audio.sfxOn);
          refreshSoundUi();
          audio.play("button_click");
          break;
        case "toggle-music":
          audio.setMusic(!audio.musicOn);
          musicStarted = true;
          refreshSoundUi();
          audio.play("button_click");
          break;
        case "leave":
          audio.play("button_click");
          closeMenu(true);
          showModal(`
            <div style="font-size:44px">🚪</div>
            <h2>Leave Match?</h2>
            <p>If you leave now, you will lose this match${hasBet ? ` and your ₹${betText} bet` : ""}.</p>
            <div class="row">
              <button type="button" data-action="close" style="background:#6b5aa8">Stay</button>
              <button type="button" data-action="leave-confirm" style="background:#c62828">Leave</button>
            </div>
          `);
          break;
        case "leave-confirm":
          closeModal();
          onExit({ reason: "leave" });
          break;
        case "close":
          audio.play("button_click");
          closeModal();
          break;
        case "emoji":
          audio.play("button_click");
          openPanel("emoji");
          break;
        case "chat":
          audio.play("button_click");
          openPanel("chat");
          break;
        case "chat-send":
          sendChatText();
          break;
        case "result-exit":
          audio.play("button_click");
          onExit({ reason: "finished" });
          break;
      }
    }

    function keyHandler(e) {
      if (e.key === "Enter" && e.target === chatInput) { e.preventDefault(); sendChatText(); }
    }

    const redRoll  = () => { audio.startMusic(); roll("red"); };
    const blueRoll = () => { roll("blue"); };

    root.addEventListener("click", clickHandler);
    root.addEventListener("keydown", keyHandler);
    dice.red.addEventListener("click", redRoll);
    dice.blue.addEventListener("click", blueRoll);

    audio.play("game_start");
    update();
    if (isBot(state.turn)) scheduleAiTurn();
    else startTurnTimer();
    if (isAI && Math.random() < 0.6) later(() => botReact("hi"), 1600);

    const api = { receiveReaction };
    activeApi = api;

    cleanup = () => {
      destroyed = true;
      clearInterval(turnInterval);
      clearTimeout(aiTimer);
      timers.forEach(clearTimeout);
      timers.clear();
      root.removeEventListener("click", clickHandler);
      root.removeEventListener("keydown", keyHandler);
      root.removeEventListener("pointerdown", firstTouch);
      dice.red.removeEventListener("click", redRoll);
      dice.blue.removeEventListener("click", blueRoll);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.stopMusic();
      style.remove();
      mount.innerHTML = "";
      if (activeApi === api) activeApi = null;
      cleanup = null;
    };

    return api;
  }

  window.LudoGame = {
    start,
    stop,
    // online play: LudoGame.receiveReaction({ type:"emoji", id:0..7 }) or { type:"text", text:"Hi" }
    receiveReaction: payload => activeApi && activeApi.receiveReaction(payload),
    __mastersLoaded: true
  };
})();