/* =====================================================================
   games/carrom/carrom.js  -  Carrom Masters engine (v5: pro striker + smart bot)
   ---------------------------------------------------------------------
   Folder:
     games/carrom/carrom.js
     games/carrom/assets/   board.png  coin_white.png  coin_black.png
                            (optional) coin_queen.png  striker.png  background.png
     games/carrom/sounds/   strike.mp3 coin_hit.mp3 wall_hit.mp3 pocket.mp3
                            foul.mp3 turn.mp3 click.mp3   (optional, beep fallback)

   Ludo ke shared files (games/assets/ aur games/sounds/):
     assets: btn_menu.png menu_panel.png icon_sound.png icon_sound_off.png
             icon_music.png icon_music_off.png icon_leave.png background.png
     sounds: bg_music.mp3

   Win/Lose sound app ka Result page bajata hai, isliye yahan nahi bajta.
   Telegram Mini App: swipe-down lock, viewport resize, cache-busting (?v=) support.

   Contract:
     window.CarromGame.start({ mount, match, onFinish, onExit, onShot, onAim })
     window.CarromGame.stop()
     window.CarromGame.remoteShot({x,dx,dy,power})            (online opponent ki shot)
     window.CarromGame.remoteAim({x,dx,dy,power,on})          (online opponent ka live aim/slider)
     onFinish({ won:true|false, winner:'you'|'bot', points })

   NEW in v5:
     - Striker bahut bada (coin ka 2x, mobile carrom jaisa)
     - Opponent (bot ya online) ka striker slide hota dikhta hai, phir aim/pull-back, phir shot
     - Slider ke niche koi text nahi
     - Bot: har shot ko exact physics se simulate karke best shot chunta hai (full hard)
   ===================================================================== */
(function (GLOBAL) {
  'use strict';

  var SRC = '';
  try { SRC = (document.currentScript && document.currentScript.src) || ''; } catch (e) {}
  var BASE = SRC ? SRC.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') : 'games/carrom/';
  var LA = BASE + '../assets/';   // Ludo ki shared assets
  // Telegram cache todne ke liye: carrom.js?v=5 se "?v=5" nikaal ke har asset/sound par lagate hain
  var VQ = (SRC.match(/\?v=[^&#]*/) || [''])[0];
  function U(p) { return p + VQ; }
  var TG = null;
  try { TG = (window.Telegram && window.Telegram.WebApp) || null; } catch (e) {}

  /* ------------------------------------------------------------------
     CONFIG  (coordinates board.png ke original size 1241 x 1268 mein)
     strikerR: striker ka size. Coin = 25, pehle 31 tha -> ab 38 (coin se 2x, mobile carrom pro look).
               Aur bada chahiye to 40-42 kar do.
     ------------------------------------------------------------------ */
  var CFG = {
    W: 1241, H: 1268,
    L: 98, R: 1144, T: 86, B: 1139,
    pockets: [{ x: 113, y: 112 }, { x: 1127, y: 112 }, { x: 113, y: 1108 }, { x: 1127, y: 1108 }],
    pocketR: 46,
    center: { x: 620, y: 615 },
    coinR: 25, strikerR: 50, strikerM: 2.0,
    lines: [{ y: 1011 }, { y: 211 }],
    x1: 259, x2: 980,
    maxSpeed: 3400,
    dt: 1 / 180,
    wallE: 0.78, hitE: 0.93,
    drag: 1.15, decel: 95, stopV: 14,
    maxPull: 260
  };
  var COLORS = ['white', 'black'];

  /* ------------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------------ */
  function ico(k, e) {
    return '<img src="' + LA + k + '.png' + VQ + '" onerror="this.replaceWith(document.createTextNode(\'' + e + '\'))">';
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  /* ------------------------------------------------------------------
     PHYSICS
     ------------------------------------------------------------------ */
  var _id = 1;
  function mkBody(type, x, y) {
    var s = type === 'striker';
    return { id: _id++, type: type, x: x, y: y, vx: 0, vy: 0,
             r: s ? CFG.strikerR : CFG.coinR, m: s ? CFG.strikerM : 1,
             alive: true, pocketed: false };
  }

  function newBoard() {
    var cx = CFG.center.x, cy = CFG.center.y, r = CFG.coinR, i, a, d, list = [];
    list.push(mkBody('queen', cx, cy));
    for (i = 0; i < 6; i++) {
      a = i * Math.PI / 3; d = 2 * r + 0.5;
      list.push(mkBody(COLORS[i % 2], cx + d * Math.cos(a), cy + d * Math.sin(a)));
    }
    for (i = 0; i < 12; i++) {
      a = i * Math.PI / 6;
      d = (i % 2 === 0) ? 4 * r + 1 : 2 * Math.sqrt(3) * r + 0.5;
      list.push(mkBody(COLORS[i % 2], cx + d * Math.cos(a), cy + d * Math.sin(a)));
    }
    return list;
  }

  function stepState(S, dt) {
    var B = S.bodies, n = B.length, i, j, b, o, sp, ns, k, p, dx, dy;
    for (i = 0; i < n; i++) {
      b = B[i]; if (!b.alive) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (sp > 0) {
        ns = sp * Math.exp(-CFG.drag * dt) - CFG.decel * dt;
        if (ns < CFG.stopV) ns = 0;
        k = ns / sp; b.vx *= k; b.vy *= k;
      }
      for (p = 0; p < 4; p++) {
        dx = b.x - CFG.pockets[p].x; dy = b.y - CFG.pockets[p].y;
        if (dx * dx + dy * dy < CFG.pocketR * CFG.pocketR) {
          b.alive = false; b.pocketed = true; b.vx = 0; b.vy = 0; b.pocket = p;
          S.events.push({ t: 'pocket', b: b });
          break;
        }
      }
      if (!b.alive) continue;
      if (b.x - b.r < CFG.L) { b.x = CFG.L + b.r; if (b.vx < 0) { S.events.push({ t: 'wall', v: -b.vx }); b.vx = -b.vx * CFG.wallE; b.vy *= 0.97; } }
      else if (b.x + b.r > CFG.R) { b.x = CFG.R - b.r; if (b.vx > 0) { S.events.push({ t: 'wall', v: b.vx }); b.vx = -b.vx * CFG.wallE; b.vy *= 0.97; } }
      if (b.y - b.r < CFG.T) { b.y = CFG.T + b.r; if (b.vy < 0) { S.events.push({ t: 'wall', v: -b.vy }); b.vy = -b.vy * CFG.wallE; b.vx *= 0.97; } }
      else if (b.y + b.r > CFG.B) { b.y = CFG.B - b.r; if (b.vy > 0) { S.events.push({ t: 'wall', v: b.vy }); b.vy = -b.vy * CFG.wallE; b.vx *= 0.97; } }
    }
    for (i = 0; i < n; i++) {
      b = B[i]; if (!b.alive) continue;
      for (j = i + 1; j < n; j++) {
        o = B[j]; if (!o.alive) continue;
        dx = o.x - b.x; dy = o.y - b.y;
        var min = b.r + o.r, d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        var d = Math.sqrt(d2), nx, ny;
        if (d < 1e-6) { nx = 1; ny = 0; d = 0; } else { nx = dx / d; ny = dy / d; }
        var ov = min - d, tm = b.m + o.m;
        b.x -= nx * ov * (o.m / tm); b.y -= ny * ov * (o.m / tm);
        o.x += nx * ov * (b.m / tm); o.y += ny * ov * (b.m / tm);
        var vn = (o.vx - b.vx) * nx + (o.vy - b.vy) * ny;
        if (vn < 0) {
          var imp = -(1 + CFG.hitE) * vn / (1 / b.m + 1 / o.m);
          b.vx -= imp / b.m * nx; b.vy -= imp / b.m * ny;
          o.vx += imp / o.m * nx; o.vy += imp / o.m * ny;
          S.events.push({ t: 'hit', v: -vn, s: (b.type === 'striker' || o.type === 'striker') });
        }
      }
    }
  }

  function isMoving(S) {
    for (var i = 0; i < S.bodies.length; i++) {
      var b = S.bodies[i];
      if (b.alive && (b.vx !== 0 || b.vy !== 0)) return true;
    }
    return false;
  }

  function isFree(S, x, y) {
    var need = CFG.strikerR + CFG.coinR + 1;
    for (var i = 0; i < S.bodies.length; i++) {
      var b = S.bodies[i];
      if (!b.alive || b.type === 'striker') continue;
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < need * need) return false;
    }
    return true;
  }

  function rayCast(S, sx, sy, dx, dy, sr) {
    var best = 1e9, hit = null, i, b, fx, fy, R, bq, c, disc, t;
    for (i = 0; i < S.bodies.length; i++) {
      b = S.bodies[i]; if (!b.alive || b.type === 'striker') continue;
      fx = sx - b.x; fy = sy - b.y; R = b.r + sr;
      bq = fx * dx + fy * dy; c = fx * fx + fy * fy - R * R; disc = bq * bq - c;
      if (disc >= 0) { t = -bq - Math.sqrt(disc); if (t > 0 && t < best) { best = t; hit = b; } }
    }
    var tw;
    if (dx > 1e-9) { tw = (CFG.R - sr - sx) / dx; if (tw > 0 && tw < best) { best = tw; hit = null; } }
    else if (dx < -1e-9) { tw = (CFG.L + sr - sx) / dx; if (tw > 0 && tw < best) { best = tw; hit = null; } }
    if (dy > 1e-9) { tw = (CFG.B - sr - sy) / dy; if (tw > 0 && tw < best) { best = tw; hit = null; } }
    else if (dy < -1e-9) { tw = (CFG.T + sr - sy) / dy; if (tw > 0 && tw < best) { best = tw; hit = null; } }
    return { t: best, hit: hit, x: sx + dx * best, y: sy + dy * best };
  }

  /* ------------------------------------------------------------------
     BOT  (smart)
     Idea: har sambhav shot (gotti x pocket x striker position x power) ko
     game ke exact physics se simulate karo, rules ke hisaab se score do,
     sabse achhi shot chuno. Physics deterministic hai isliye hard level
     mein jo bot sochta hai wahi hota hai.
     ------------------------------------------------------------------ */
  function cloneBodies(S) {
    var out = [];
    for (var i = 0; i < S.bodies.length; i++) {
      var b = S.bodies[i];
      if (b.alive) out.push({ id: b.id, type: b.type, x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, m: b.m, alive: true, pocketed: false });
    }
    return out;
  }

  function segDist(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    var t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + vx * t - px, cy = ay + vy * t - py;
    return Math.sqrt(cx * cx + cy * cy);
  }
  function pathBlocked(S, ax, ay, bx, by, need, skip) {
    for (var i = 0; i < S.bodies.length; i++) {
      var b = S.bodies[i];
      if (!b.alive || b.type === 'striker' || b === skip) continue;
      if (segDist(b.x, b.y, ax, ay, bx, by) < need + (b.r - CFG.coinR)) return true;
    }
    return false;
  }
  function pocketProx(x, y) {
    var m = 1e9;
    for (var k = 0; k < 4; k++) {
      var dx = x - CFG.pockets[k].x, dy = y - CFG.pockets[k].y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < m) m = d;
    }
    return Math.max(0, 1 - m / 900);
  }

  // shot simulate karo (game jaisi hi dt) aur score nikalo
  function simShot(S, x, y, ang, power, p, info) {
    var sim = { bodies: cloneBodies(S), events: [] }, st = mkBody('striker', x, y);
    st.vx = Math.cos(ang) * power * CFG.maxSpeed; st.vy = Math.sin(ang) * power * CFG.maxSpeed;
    sim.bodies.push(st);
    var steps = 0, dt = CFG.dt;
    while (steps++ < 2400) { stepState(sim, dt); sim.events.length = 0; if (!isMoving(sim)) break; }
    return scoreSim(sim, p, info || {});
  }

  function scoreSim(sim, p, info) {
    var mine = COLORS[p], i, b, own = 0, oth = 0, queenP = false, foul = false, queenAlive = false;
    for (i = 0; i < sim.bodies.length; i++) {
      b = sim.bodies[i];
      if (b.type === 'queen' && !b.pocketed) queenAlive = true;
      if (!b.pocketed) continue;
      if (b.type === 'striker') foul = true;
      else if (b.type === 'queen') queenP = true;
      else if (b.type === mine) own++;
      else oth++;
    }
    var startOwn = info.startOwn == null ? 9 : info.startOwn;
    var startOpp = info.startOpp == null ? 9 : info.startOpp;
    if (foul) return -40 - 7 * oth;                       // foul: apni gotti wapas, opponent ki wahi rahegi
    var s = own * 10 - oth * 7;
    if (queenP) {
      if (own > 0) s += 14;                               // queen cover ho gayi
      else queenAlive = true;                              // queen wapas rakhi jayegi
    }
    if (own > 0) s += 4;                                   // dobara shot milega
    if (startOpp - oth <= 0) return -300;                 // opponent ki aakhri gotti dalna = haar
    if (startOwn - own <= 0) s += queenAlive ? -15 : 200; // saari gotti: queen cover ho to jeet
    // thodi position sense: apni gotti pocket ke paas, opponent ki door
    var pos = 0, mp = 0, op = 0;
    for (i = 0; i < sim.bodies.length; i++) {
      b = sim.bodies[i];
      if (b.pocketed || b.type === 'striker' || b.type === 'queen') continue;
      if (b.type === mine) mp += pocketProx(b.x, b.y); else op += pocketProx(b.x, b.y);
    }
    pos = mp * 0.22 - op * 0.22;
    return s + pos;
  }

  function botPick(S, p, level, qOwner) {
    var mine = COLORS[p], y = CFG.lines[p].y, i, b, n;
    var own = [], q = null, oppN = 0;
    for (i = 0; i < S.bodies.length; i++) {
      b = S.bodies[i]; if (!b.alive) continue;
      if (b.type === mine) own.push(b);
      else if (b.type === 'queen') q = b;
      else if (b.type !== 'striker') oppN++;
    }
    var info = { startOwn: own.length, startOpp: oppN };
    var targets = own.slice(); if (q) targets.push(q);
    if (!targets.length) for (i = 0; i < S.bodies.length; i++) if (S.bodies[i].alive && S.bodies[i].type !== 'striker') targets.push(S.bodies[i]);

    var hard = level === 'hard', med = level === 'medium';
    var budget = hard ? 520 : med ? 140 : 50;
    var maxCand = hard ? 80 : med ? 26 : 10;
    var nx = hard ? 33 : med ? 17 : 9;
    var noise = hard ? 0 : med ? 0.012 : 0.05;
    var powers = hard ? [0.72, 0.88, 0.55, 1] : [0.7, 0.9, 0.55];

    // baseline par jo jagah khaali hain
    var xs = [];
    for (i = 0; i < nx; i++) {
      var xx = CFG.x1 + (CFG.x2 - CFG.x1) * i / (nx - 1);
      if (isFree(S, xx, y)) xs.push(xx);
    }
    var cands = [];
    if (xs.length) targets.forEach(function (t) {
      CFG.pockets.forEach(function (pk) {
        var ux = pk.x - t.x, uy = pk.y - t.y, ul = Math.sqrt(ux * ux + uy * uy) || 1;
        ux /= ul; uy /= ul;
        var gx = t.x - ux * (t.r + CFG.strikerR), gy = t.y - uy * (t.r + CFG.strikerR);
        if (gx < CFG.L + CFG.strikerR || gx > CFG.R - CFG.strikerR || gy < CFG.T + CFG.strikerR || gy > CFG.B - CFG.strikerR) return;
        if (pathBlocked(S, t.x, t.y, pk.x, pk.y, 2 * CFG.coinR - 3, t)) return;
        xs.forEach(function (x) {
          var dx = gx - x, dy = gy - y;
          if ((p === 0 && dy >= -5) || (p === 1 && dy <= 5)) return;
          var dl = Math.sqrt(dx * dx + dy * dy) || 1;
          var cs = (dx * ux + dy * uy) / dl;               // cut angle (1 = seedhi)
          if (cs < 0.28) return;
          if (pathBlocked(S, x, y, gx, gy, CFG.strikerR + CFG.coinR - 3, t)) return;
          cands.push({ x: x, ang: Math.atan2(dy, dx), g: cs - dl / 2500 - ul / 2500 + (t.type === 'queen' ? 0 : 0.05) });
        });
      });
    });
    cands.sort(function (a, c) { return c.g - a.g; });
    cands.length = Math.min(cands.length, maxCand);

    // kuch random shots bhi (bank / break / jab seedhi shot na mile)
    var extra = hard ? 26 : 8, tries = 0;
    while (extra > 0 && tries++ < 80) {
      var rx = CFG.x1 + Math.random() * (CFG.x2 - CFG.x1);
      if (!isFree(S, rx, y)) continue;
      var base = p === 0 ? -Math.PI / 2 : Math.PI / 2;
      cands.push({ x: rx, ang: base + (Math.random() - 0.5) * 2.2, g: -1 });
      extra--;
    }

    var best = null, sims = 0, t0 = now(), stop = false, pi, ci, c, sc, pw;
    for (pi = 0; pi < powers.length && !stop; pi++) {
      pw = powers[pi];
      for (ci = 0; ci < cands.length; ci++) {
        if (sims >= 40 && now() - t0 > budget) { stop = true; break; }
        c = cands[ci];
        sc = simShot(S, c.x, y, c.ang, pw, p, info) + Math.random() * 0.25;
        sims++;
        if (!best || sc > best.score) best = { x: c.x, ang: c.ang, power: pw, score: sc };
      }
    }

    // hard: best shot ke aas-paas chhota sa fine-tune
    if (hard && best && best.score > 0) {
      var deltas = [-0.012, -0.006, -0.003, 0.003, 0.006, 0.012], bb = best;
      for (i = 0; i < deltas.length; i++) {
        sc = simShot(S, bb.x, y, bb.ang + deltas[i], bb.power, p, info);
        if (sc > best.score + 0.01) best = { x: bb.x, ang: bb.ang + deltas[i], power: bb.power, score: sc };
      }
    }

    if (!best) best = { x: CFG.center.x, ang: p === 0 ? -Math.PI / 2 : Math.PI / 2, power: 0.6, score: 0 };
    if (noise) best.ang += (Math.random() - 0.5) * 2 * noise;
    if (level === 'easy' && Math.random() < 0.35) best.power = 0.3 + Math.random() * 0.5;
    return best;
  }

  /* ------------------------------------------------------------------
     SOUND  (mp3 chalta hai, file na mile to built-in awaaz)
     Sound ON/OFF Ludo ke saath shared hai (localStorage 'lm2_sfx')
     ------------------------------------------------------------------ */
  var SFX_FILES = { strike: 'strike.mp3', hit: 'coin_hit.mp3', wall: 'wall_hit.mp3', pocket: 'pocket.mp3',
                    foul: 'foul.mp3', turn: 'turn.mp3', click: 'click.mp3' };

  var Sound = {
    on: lsGet('lm2_sfx', true), ok: {}, base: {}, actx: null, last: {}, loaded: false,
    load: function () {
      if (this.loaded) return; this.loaded = true;
      var self = this;
      Object.keys(SFX_FILES).forEach(function (k) {
        var a = new Audio(); a.preload = 'auto';
        a.addEventListener('canplaythrough', function () { self.ok[k] = true; }, { once: true });
        a.addEventListener('error', function () { self.ok[k] = false; });
        a.src = U(BASE + 'sounds/' + SFX_FILES[k]);
        self.base[k] = a;
      });
    },
    unlock: function () {
      try {
        if (!this.actx) { var AC = GLOBAL.AudioContext || GLOBAL.webkitAudioContext; if (AC) this.actx = new AC(); }
        if (this.actx && this.actx.state === 'suspended') this.actx.resume();
      } catch (e) {}
    },
    play: function (k, vol) {
      if (!this.on) return;
      var t = Date.now(); if (this.last[k] && t - this.last[k] < 45) return; this.last[k] = t;
      vol = Math.max(0.05, Math.min(1, vol == null ? 1 : vol));
      if (this.ok[k] !== false && this.base[k] && this.base[k].src) {
        try { var n = this.base[k].cloneNode(); n.volume = vol; var pr = n.play(); if (pr && pr.catch) pr.catch(function () {}); return; } catch (e) {}
      }
      this.synth(k, vol);
    },
    tone: function (f0, f1, dur, type, gain, delay) {
      var c = this.actx; if (!c) return;
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
    },
    synth: function (k, v) {
      if (!this.actx) return;
      switch (k) {
        case 'strike': this.tone(260, 90, 0.14, 'sine', 0.7 * v); this.tone(1400, 400, 0.04, 'square', 0.15 * v); break;
        case 'hit': this.tone(950, 520, 0.07, 'triangle', 0.5 * v); break;
        case 'wall': this.tone(190, 120, 0.09, 'sine', 0.45 * v); break;
        case 'pocket': this.tone(520, 180, 0.28, 'sine', 0.6 * v); this.tone(120, 60, 0.2, 'sine', 0.5 * v, 0.05); break;
        case 'foul': this.tone(220, 90, 0.45, 'sawtooth', 0.3 * v); break;
        case 'turn': this.tone(660, 700, 0.09, 'sine', 0.3 * v); break;
        case 'click': this.tone(1100, 900, 0.04, 'square', 0.15 * v); break;
      }
    }
  };

  /* ------------------------------------------------------------------
     CSS (sab kuch .cr- se shuru)
     ------------------------------------------------------------------ */
  var CSS = '' +
    '.cr-wrap{position:absolute;inset:0;background:radial-gradient(circle at 50% 28%,#3b2a8f,#100b3d 70%);color:#fff;font-family:Poppins,system-ui,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;overflow:hidden;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
    '.cr-top{width:100%;display:flex;align-items:center;gap:6px;padding:8px 8px 6px;box-sizing:border-box}' +
    '.cr-pl{flex:1;display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:14px;background:rgba(255,255,255,.1);border:2px solid transparent;min-width:0}' +
    '.cr-pl.act{border-color:#ffc83d;background:rgba(255,200,61,.18)}' +
    '.cr-av{position:relative;flex:none;width:34px;height:34px;border-radius:50%;background:#f3c98b;border:2px solid #fff}' +
    '.cr-av img.p{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}' +
    '.cr-av img.k{position:absolute;right:-5px;bottom:-5px;width:16px;height:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}' +
    '.cr-pl b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;line-height:1.2}' +
    '.cr-pl small{font-size:11px;opacity:.85}' +
    '.cr-btn{flex:none;background:rgba(255,255,255,.14);border:0;color:#fff;width:32px;height:32px;border-radius:10px;font-size:15px;cursor:pointer;padding:0}' +
    '.cr-cv{touch-action:none;display:block;margin:auto 0}' +
    '.cr-bottom{width:100%;padding:12px 28px 14px;box-sizing:border-box;text-align:center}' +
    '.cr-slider{-webkit-appearance:none;appearance:none;display:block;width:100%;max-width:300px;height:28px;margin:0 auto;border-radius:16px;border:4px solid #8a0f14;outline:0;overflow:visible;background:linear-gradient(90deg,#5a2c10,#8b4a22 50%,#5a2c10);box-shadow:0 3px 8px rgba(0,0,0,.55),inset 0 3px 5px rgba(0,0,0,.55)}' +
    '.cr-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:62px;height:62px;border-radius:50%;border:0;background:url(' + BASE + 'assets/striker.png' + VQ + ') center/contain no-repeat,radial-gradient(circle at 40% 35%,#fff,#9fd0ff 60%,#3b78c4);filter:drop-shadow(0 3px 4px rgba(0,0,0,.6));cursor:pointer}' +
    '.cr-slider::-moz-range-thumb{width:62px;height:62px;border-radius:50%;border:0;background:url(' + BASE + 'assets/striker.png' + VQ + ') center/contain no-repeat,radial-gradient(circle at 40% 35%,#fff,#9fd0ff 60%,#3b78c4);cursor:pointer}' +
    '.cr-slider:disabled{opacity:.7}' +
    '.cr-otrack{width:100%;padding:8px 28px 14px;box-sizing:border-box}' +
    '.cr-oslider{pointer-events:none}' +
    /* slider ke niche ka text hata diya */
    '.cr-msg{display:none}' +
    '.cr-ov{position:absolute;inset:0;z-index:30;background:rgba(10,5,40,.78);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:20px}' +
    '.cr-ov h2{margin:0;font-size:26px}' +
    '.cr-ov p{margin:0;font-size:13px;opacity:.85}' +
    '.cr-ov button{min-width:190px;padding:12px 18px;border:0;border-radius:14px;font:700 15px Poppins,sans-serif;color:#2b1b10;background:linear-gradient(#ffd86b,#f0a81a);cursor:pointer}' +
    '.cr-ov button.sec{background:rgba(255,255,255,.18);color:#fff}' +
    '.cr-toast{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);padding:9px 18px;border-radius:12px;font-weight:700;font-size:15px;pointer-events:none;opacity:0;transition:opacity .25s;white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}' +
    '.cr-toast.show{opacity:1}' +
    /* menu button */
    '.cr-mn{width:44px;height:44px;border-radius:9px;display:grid;place-items:center;padding:0;border:2px solid #e6bd86;background:url(' + LA + 'btn_menu.png' + VQ + ') center/100% 100% no-repeat,linear-gradient(145deg,#c9965c,#8a5a2b 60%,#6a4119);box-shadow:0 3px 7px #000a}' +
    '.cr-mn .bars{display:grid;gap:5px;width:22px}.cr-mn .bars i{display:block;height:4px;border-radius:2px;background:linear-gradient(#fff3d0,#e9c98d)}' +
    /* slide-in menu */
    '.cr-menu{position:absolute;inset:0;z-index:20;pointer-events:none}.cr-menu.open{pointer-events:auto}' +
    '.cr-mback{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .32s}.cr-menu.open .cr-mback{opacity:.6}' +
    '.cr-mpanel{position:absolute;left:0;top:0;bottom:0;width:min(80%,310px);padding:18px 16px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;background:url(' + LA + 'menu_panel.png' + VQ + ') center/100% 100% no-repeat,repeating-linear-gradient(90deg,#0000 0 7px,#0000001a 7px 8px),linear-gradient(180deg,#7a4f26,#4d2f16 70%,#35200f);border-right:4px solid #24130a;box-shadow:8px 0 24px #000c;transform:translateX(-106%);transition:transform .4s cubic-bezier(.2,.9,.25,1)}' +
    '.cr-menu.open .cr-mpanel{transform:none}' +
    '.cr-mhead{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:2px solid #24130a66}' +
    '.cr-mhead h3{margin:0;font-size:26px;font-weight:900;letter-spacing:2px;background:linear-gradient(180deg,#fff3b0,#f5b82e 55%,#b9770e);-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.cr-mx{width:36px;height:36px;border-radius:50%;border:2px solid #e6bd86;background:linear-gradient(#c9965c,#7a4d22);color:#fff;font-size:20px;font-weight:900;cursor:pointer;padding:0}' +
    '.cr-mi{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;cursor:pointer;background:linear-gradient(180deg,#00000033,#00000055);border:2px solid #24130a88;opacity:0;transform:translateX(-26px);transition:opacity .3s,transform .35s}' +
    '.cr-menu.open .cr-mi{opacity:1;transform:none;transition-delay:calc(.14s + var(--i)*.07s)}' +
    '.cr-mic{width:34px;height:34px;display:grid;place-items:center;flex:0 0 34px;font-size:26px}.cr-mic img{width:100%;height:100%;object-fit:contain}' +
    '.cr-ml{flex:1;font-size:16px;font-weight:900;color:#ffe9c0}' +
    '.cr-sw{position:relative;width:52px;height:28px;border-radius:14px;border:2px solid #24130a;background:#5a4a40;flex:0 0 52px;transition:background .25s}' +
    '.cr-sw i{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:linear-gradient(#fff,#ddd);transition:transform .25s}' +
    '.cr-sw.on{background:linear-gradient(#3ddc84,#12934f)}.cr-sw.on i{transform:translateX(24px)}' +
    '.cr-msp{flex:1}.cr-mi.leave{background:linear-gradient(180deg,#e0453f,#a11a16);border-color:#5e0b09;justify-content:center}.cr-mi.leave .cr-ml{flex:0 0 auto;color:#fff}';

  /* ------------------------------------------------------------------
     GAME
     ------------------------------------------------------------------ */
  var current = null;

  function createGame(opts) {
    opts = opts || {};
    var match = opts.match || {};
    var mount = opts.mount || document.body;
    var online = (match.opponentType === 'human' || match.ai === false || match.online === true);
    var o = {
      mode: online ? 'online' : 'bot',
      difficulty: 'hard',   // computer hamesha full hard (match.difficulty ignore hota hai)
      names: [match.me || 'You', match.opponent || 'Bot'],
      avatars: [match.meAvatar || '', match.opponentAvatar || ''],
      myIndex: online ? (match.myIndex || 0) : 0,
      turnTime: match.turnTime || 0
    };

    // ---------- DOM ----------
    if (!document.getElementById('cr-style')) {
      var st = document.createElement('style'); st.id = 'cr-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    try { if (getComputedStyle(mount).position === 'static') mount.style.position = 'relative'; } catch (e) {}
    var wrap = document.createElement('div'); wrap.className = 'cr-wrap';
    // Background: carrom ka apna -> Ludo wala -> gradient
    wrap.style.background = 'url(' + BASE + 'assets/background.png' + VQ + ') center/cover no-repeat, url(' + LA + 'background.png' + VQ + ') center/cover no-repeat, radial-gradient(circle at 50% 28%,#3b2a8f,#100b3d 70%)';
    function plHtml(i) {
      return '<div class="cr-pl" data-p="' + i + '"><div class="cr-av"><img class="p" src="' + (o.avatars[i] || '') + '" onerror="this.style.visibility=\'hidden\'">' +
             '<img class="k" src="' + BASE + 'assets/coin_' + COLORS[i] + '.png' + VQ + '"></div><div style="min-width:0"><b class="n"></b><small class="c"></small></div></div>';
    }
    wrap.innerHTML =
      '<div class="cr-top"><button class="cr-btn cr-mn"><span class="bars"><i></i><i></i><i></i></span></button>' + plHtml(0) + plHtml(1) + '</div>' +
      '<div class="cr-otrack"><input class="cr-slider cr-oslider" type="range" min="0" max="1000" value="500" disabled></div>' +
      '<canvas class="cr-cv"></canvas>' +
      '<div class="cr-bottom"><input class="cr-slider" type="range" min="0" max="1000" value="500"><div class="cr-msg"></div></div>' +
      '<div class="cr-toast"></div><div class="cr-ov"></div><div class="cr-menu"></div>';
    mount.appendChild(wrap);
    var $ = function (s) { return wrap.querySelector(s); };
    var canvas = $('.cr-cv'), ctx = canvas.getContext('2d'), ov = $('.cr-ov'), toast = $('.cr-toast'),
        slider = $('.cr-bottom .cr-slider'), oslider = $('.cr-oslider'), otrack = $('.cr-otrack'), msgEl = $('.cr-msg'), menuBtn = $('.cr-mn'), menuEl = $('.cr-menu');

    // ---------- state ----------
    var imgs = {}, sprites = {};
    var S = { bodies: [], events: [] }, striker = mkBody('striker', CFG.center.x, CFG.lines[0].y);
    var turn = 0, phase = 'loading', queenOwner = -1, shotPocketed = [], anims = [];
    var aim = { on: false, dx: 0, dy: -1, power: 0 }, flip = false, scale = 1;
    var acc = 0, lastT = 0, raf = 0, timers = [], tleft = 0, tInt = 0, endWait = 0, destroyed = false, botBusy = false, finished = false;
    var ro = null;
    var paused = false, musicOn = lsGet('lm2_music', true), musicStarted = false;
    var botPlan = null;      // bot ki animation (slide -> aim -> fire)
    var remote = null;       // online opponent ka live aim
    var lastEmit = 0;

    // ---------- music (Ludo wali bg_music.mp3) ----------
    var music = new Audio(U(BASE + '../sounds/bg_music.mp3'));
    music.loop = true; music.volume = 0.22;
    function playMusic() { if (musicOn) { var p = music.play(); if (p && p.catch) p.catch(function () {}); } }

    function later(fn, ms) {
      var id = setTimeout(function () {
        if (destroyed) return;
        if (paused) { later(fn, 200); return; }
        fn();
      }, ms);
      timers.push(id); return id;
    }
    function say(t, ms) { toast.textContent = t; toast.classList.add('show'); later(function () { toast.classList.remove('show'); }, ms || 1400); }

    // ---------- assets ----------
    function loadImages(done) {
      var names = { board: 'board.png', white: 'coin_white.png', black: 'coin_black.png', queen: 'coin_queen.png', striker: 'striker.png' };
      var keys = Object.keys(names), left = keys.length, fired = false;
      function fin() { if (fired) return; fired = true; done(); }
      setTimeout(fin, 8000);   // slow network (Telegram): 8 sec baad bina rukke game shuru
      keys.forEach(function (k) {
        var im = new Image();
        im.onload = function () {
          imgs[k] = im;
          if (fired) { try { buildSprites(); } catch (e) {} }   // der se aayi image ke baad sprites dobara
          if (!--left) fin();
        };
        im.onerror = function () { imgs[k] = null; if (!--left) fin(); };
        im.src = U(BASE + 'assets/' + names[k]);
      });
    }
    function makeSprite(img, px, tint) {
      var c = document.createElement('canvas'); c.width = c.height = px;
      var g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (img) g.drawImage(img, 0, 0, px, px);
      else {
        var gr = g.createRadialGradient(px * .4, px * .35, px * .05, px / 2, px / 2, px / 2);
        gr.addColorStop(0, '#fff'); gr.addColorStop(1, tint || '#c9b48a');
        g.fillStyle = gr; g.beginPath(); g.arc(px / 2, px / 2, px / 2 - 1, 0, 7); g.fill();
      }
      return c;
    }
    function buildSprites() {
      var px = 160;
      sprites.white = makeSprite(imgs.white, px, '#efe3c8');
      sprites.black = makeSprite(imgs.black, px, '#222');
      if (imgs.queen) sprites.queen = makeSprite(imgs.queen, px);
      else {
        sprites.queen = makeSprite(imgs.white, px, '#efe3c8');
        var g = sprites.queen.getContext('2d'); g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(225,25,45,.82)'; g.fillRect(0, 0, px, px);
      }
      if (imgs.striker) sprites.striker = makeSprite(imgs.striker, px);
      else {
        var c = document.createElement('canvas'); c.width = c.height = px; var q = c.getContext('2d');
        var gr = q.createRadialGradient(px * .4, px * .35, px * .05, px / 2, px / 2, px / 2);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(.6, '#9fd0ff'); gr.addColorStop(1, '#3b78c4');
        q.fillStyle = gr; q.beginPath(); q.arc(px / 2, px / 2, px / 2 - 1, 0, 7); q.fill();
        q.strokeStyle = 'rgba(20,50,100,.8)'; q.lineWidth = px * .06;
        q.beginPath(); q.arc(px / 2, px / 2, px * .32, 0, 7); q.stroke();
        sprites.striker = c;
      }
    }

    // ---------- layout ----------
    function fit() {
      if (destroyed) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var availW = wrap.clientWidth, topH = $('.cr-top').offsetHeight + otrack.offsetHeight, botH = $('.cr-bottom').offsetHeight;
      var availH = wrap.clientHeight - topH - botH - 4;
      var cssW = Math.max(120, Math.min(availW, availH * CFG.W / CFG.H));
      canvas.style.width = cssW + 'px'; canvas.style.height = (cssW * CFG.H / CFG.W) + 'px';
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssW * CFG.H / CFG.W * dpr);
      scale = canvas.width / CFG.W;
    }
    function toWorld(ev) {
      var r = canvas.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width * CFG.W, y = (ev.clientY - r.top) / r.height * CFG.H;
      return flip ? { x: CFG.W - x, y: CFG.H - y } : { x: x, y: y };
    }

    // ---------- HUD ----------
    function remaining(col) { var n = 0; S.bodies.forEach(function (b) { if (b.alive && b.type === col) n++; }); return n; }
    function hud() {
      [0, 1].forEach(function (p) {
        var el = $('.cr-pl[data-p="' + p + '"]');
        el.querySelector('.n').textContent = o.names[p];
        el.querySelector('.c').textContent = remaining(COLORS[p]) + ' left' + (queenOwner === p ? '  ♛' : '');
        el.classList.toggle('act', turn === p && phase !== 'over' && phase !== 'loading');
      });
    }
    function canControl() {
      if (phase !== 'aim' || botBusy || paused) return false;
      if (o.mode === 'bot') return turn === 0;
      return turn === o.myIndex;
    }
    function isBot() { return o.mode === 'bot' && turn === 1; }
    function isOppOnline() { return o.mode === 'online' && turn !== o.myIndex; }
    function mineTurn() { return o.mode === 'bot' ? turn === 0 : turn === o.myIndex; }
    function setTrack(x) {
      var v = sliderFromX(x);
      if (mineTurn()) slider.value = v; else oslider.value = flip ? 1000 - v : v;
    }
    function sliderFromX(x) { return Math.round((x - CFG.x1) / (CFG.x2 - CFG.x1) * 1000); }

    // apna aim/slider online opponent ko bhejna (agar app ne onAim diya ho)
    function emitAim(force) {
      if (!opts.onAim || o.mode !== 'online' || !canControl()) return;
      var t = Date.now(); if (!force && t - lastEmit < 60) return; lastEmit = t;
      try { opts.onAim({ p: turn, x: striker.x, dx: aim.dx, dy: aim.dy, power: aim.power, on: aim.on }); } catch (e) {}
    }

    // ---------- turn flow ----------
    function strikerPlace(xv) {
      striker.x = CFG.x1 + (CFG.x2 - CFG.x1) * xv; striker.y = CFG.lines[turn].y;
      striker.vx = striker.vy = 0; striker.alive = true; striker.pocketed = false;
    }
    function beginTurn() {
      phase = 'aim'; aim.on = false; aim.power = 0; botBusy = false; botPlan = null; remote = null;
      slider.value = 500; oslider.value = 500; strikerPlace(0.5);
      slider.disabled = !canControl();
      hud(); startTimer();
      if (isBot()) { botBusy = true; later(botTurn, 450); }
    }
    function startTimer() {
      clearInterval(tInt);
      if (!o.turnTime) return;
      tleft = o.turnTime;
      tInt = setInterval(function () {
        if (phase !== 'aim' || paused) return;
        tleft--;
        if (tleft <= 0) { clearInterval(tInt); say('Time up!'); Sound.play('foul'); turn = 1 - turn; beginTurn(); }
      }, 1000);
    }

    // Bot: pehle sochta hai, phir striker slide karta hai, phir pull-back/aim dikhata hai, phir shot
    function botTurn() {
      var pick = botPick(S, 1, o.difficulty, queenOwner);
      var a0 = Math.PI / 2;   // bot upar se neeche ki taraf khelta hai
      var da = pick.ang - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      var dist = Math.abs(pick.x - striker.x) / (CFG.x2 - CFG.x1);
      botPlan = { pick: pick, stage: 0, t: 0, x0: striker.x, a0: a0, da: da, d0: 0.35 + 0.55 * dist, d1: 0.8 };
    }
    function easeIO(k) { k = Math.max(0, Math.min(1, k)); return k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
    function stepBot(dt) {
      var P = botPlan; if (!P) return;
      P.t += dt;
      if (P.stage === 0) {                                   // 1) striker line par slide
        var k = P.t / P.d0;
        striker.x = P.x0 + (P.pick.x - P.x0) * easeIO(k);
        setTrack(striker.x);
        if (k >= 1) {
          striker.x = P.pick.x; P.stage = 1; P.t = 0;
          aim.on = true; aim.power = 0; aim.dx = Math.cos(P.a0); aim.dy = Math.sin(P.a0);
        }
      } else if (P.stage === 1) {                            // 2) aim ghoomana + pull-back
        var k2 = Math.min(1, P.t / P.d1), e = easeIO(k2);
        var a = P.a0 + P.da * e + Math.sin(k2 * Math.PI * 3) * 0.05 * (1 - k2);
        aim.dx = Math.cos(a); aim.dy = Math.sin(a); aim.power = P.pick.power * e;
        if (k2 >= 1) { aim.dx = Math.cos(P.pick.ang); aim.dy = Math.sin(P.pick.ang); aim.power = P.pick.power; P.stage = 2; P.t = 0; }
      } else if (P.stage === 2) {                            // 3) thoda ruk ke chhodna
        if (P.t >= 0.35) {
          var pk = P.pick; botPlan = null; aim.on = false;
          fire(pk.x, Math.cos(pk.ang), Math.sin(pk.ang), pk.power, true);
        }
      }
    }
    // Online opponent: uska bheja hua live aim smooth dikhana
    function stepRemote(dt) {
      var R = remote; if (!R) return;
      var k = Math.min(1, dt * 14);
      striker.x += (R.x - striker.x) * k;
      setTrack(striker.x);
      if (R.on) {
        aim.on = true;
        aim.dx += (R.dx - aim.dx) * k; aim.dy += (R.dy - aim.dy) * k;
        var l = Math.sqrt(aim.dx * aim.dx + aim.dy * aim.dy) || 1; aim.dx /= l; aim.dy /= l;
        aim.power += (R.power - aim.power) * k;
      } else aim.on = false;
    }

    function fire(x, dx, dy, power, noEmit) {
      if (phase !== 'aim') return;
      clearInterval(tInt);
      striker.x = x; striker.y = CFG.lines[turn].y;
      striker.vx = dx * power * CFG.maxSpeed; striker.vy = dy * power * CFG.maxSpeed;
      striker.alive = true; striker.pocketed = false;
      S.bodies.push(striker); shotPocketed = []; phase = 'moving'; slider.disabled = true; botBusy = false;
      botPlan = null; remote = null; aim.on = false;
      Sound.play('strike', 0.4 + 0.6 * power);
      if (!noEmit && opts.onShot) try { opts.onShot({ p: turn, x: x, dx: dx, dy: dy, power: power }); } catch (e) {}
    }

    function respawn(b) {
      var cx = CFG.center.x, cy = CFG.center.y, r = CFG.coinR * 2 + 1, k, a, d, x, y;
      function free(px, py) {
        for (var i = 0; i < S.bodies.length; i++) {
          var q = S.bodies[i]; if (!q.alive || q === b) continue;
          var ddx = q.x - px, ddy = q.y - py; if (ddx * ddx + ddy * ddy < r * r) return false;
        } return true;
      }
      var placed = free(cx, cy), px = cx, py = cy;
      for (d = 1; !placed && d < 8; d++) for (k = 0; k < 12 && !placed; k++) {
        a = k * Math.PI / 6; x = cx + Math.cos(a) * d * r * 0.9; y = cy + Math.sin(a) * d * r * 0.9;
        if (free(x, y)) { px = x; py = y; placed = true; }
      }
      b.x = px; b.y = py; b.vx = b.vy = 0; b.alive = true; b.pocketed = false;
    }

    function endShot() {
      var idx = S.bodies.indexOf(striker); if (idx >= 0) S.bodies.splice(idx, 1);
      var p = turn, mine = COLORS[p], own = [], oth = [], queen = null, foul = false, i, b;
      for (i = 0; i < shotPocketed.length; i++) {
        b = shotPocketed[i];
        if (b.type === 'striker') foul = true;
        else if (b.type === 'queen') queen = b;
        else if (b.type === mine) own.push(b);
        else oth.push(b);
      }
      var text = '', cont = false;
      if (foul) {
        text = 'Foul! Striker pocketed';
        own.forEach(respawn);
        for (i = 0; i < S.bodies.length; i++) {
          b = S.bodies[i];
          if (!b.alive && b.type === mine && own.indexOf(b) < 0) { respawn(b); break; }
        }
        if (queen) respawn(queen);
        Sound.play('foul');
      } else {
        if (queen) {
          if (own.length > 0) { queenOwner = p; text = 'Queen covered!'; }
          else { respawn(queen); text = 'Queen returned (not covered)'; }
        }
        if (own.length > 0) { cont = true; if (!text) text = 'Nice! Shoot again'; }
        else if (oth.length > 0 && !text) text = 'Opponent coin pocketed';
      }

      var winner = -1;
      [p, 1 - p].forEach(function (q) {
        if (winner >= 0) return;
        if (remaining(COLORS[q]) === 0) {
          var qOnBoard = S.bodies.some(function (x) { return x.type === 'queen' && x.alive; });
          if (q === p && qOnBoard) {
            for (var k = 0; k < S.bodies.length; k++) {
              var cb = S.bodies[k];
              if (!cb.alive && cb.type === COLORS[q]) { respawn(cb); break; }
            }
            text = 'Cover the queen first!'; cont = false; Sound.play('foul');
          } else winner = q;
        }
      });

      hud();
      if (text) say(text, 1500);
      if (winner >= 0) return later(function () { finish(winner); }, 900);
      later(function () { if (!cont) { turn = 1 - turn; Sound.play('turn', 0.6); } beginTurn(); }, 900);
    }

    function finish(winner) {
      phase = 'over'; clearInterval(tInt); hud();
      try { music.pause(); } catch (e) {}
      var pts = remaining(COLORS[1 - winner]) + (queenOwner === winner ? 3 : 0);
      var iWon = (winner === o.myIndex);
      /* win/lose sound yahan nahi: app ka Result page bajata hai */
      ov.style.display = 'flex';
      ov.innerHTML = '<h2>' + (iWon ? '🏆 You won!' : 'You lost') + '</h2><p>Points: ' + pts + '</p>';
      later(function () {
        if (finished) return; finished = true;
        var res = { won: iWon, winner: iWon ? 'you' : 'bot', points: pts, game: 'carrom' };
        if (opts.onFinish) { try { opts.onFinish(res); } catch (e) { console.error(e); } }
      }, 1800);
    }

    function startMatch() {
      S = { bodies: newBoard(), events: [] }; anims = []; queenOwner = -1; turn = 0; shotPocketed = [];
      flip = (o.mode === 'online' && o.myIndex === 1);
      ov.style.display = 'none'; ov.innerHTML = '';
      beginTurn(); Sound.play('turn');
    }

    function askLeave() {
      if (phase === 'over') return;
      paused = true;
      ov.style.display = 'flex';
      ov.innerHTML = '<h2>Leave match?</h2><p>Your entry fee will be lost.</p><button class="stay">Keep playing</button><button class="sec leave">Leave</button>';
      ov.querySelector('.stay').onclick = function () { Sound.play('click'); ov.style.display = 'none'; ov.innerHTML = ''; paused = false; };
      ov.querySelector('.leave').onclick = function () {
        Sound.play('click'); paused = false;
        if (opts.onExit) { try { opts.onExit(); } catch (e) { console.error(e); } }
        else api.destroy();
      };
    }

    // ---------- MENU (Ludo jaisa slide-in drawer) ----------
    menuEl.innerHTML =
      '<div class="cr-mback" data-a="close"></div><aside class="cr-mpanel">' +
      '<div class="cr-mhead"><h3>MENU</h3><button class="cr-mx" data-a="close">✕</button></div>' +
      '<div class="cr-mi" style="--i:0" data-a="sfx"><span class="cr-mic" id="cr-sfxi"></span><span class="cr-ml">Sound</span><span class="cr-sw" id="cr-sfxs"><i></i></span></div>' +
      '<div class="cr-mi" style="--i:1" data-a="music"><span class="cr-mic" id="cr-musi"></span><span class="cr-ml">Music</span><span class="cr-sw" id="cr-muss"><i></i></span></div>' +
      '<div class="cr-msp"></div>' +
      '<div class="cr-mi leave" style="--i:2" data-a="leave"><span class="cr-mic">' + ico('icon_leave', '🚪') + '</span><span class="cr-ml">Leave Match</span></div></aside>';

    function syncMenu() {
      menuEl.querySelector('#cr-sfxi').innerHTML = Sound.on ? ico('icon_sound', '🔊') : ico('icon_sound_off', '🔇');
      menuEl.querySelector('#cr-musi').innerHTML = musicOn ? ico('icon_music', '🎵') : ico('icon_music_off', '🔕');
      menuEl.querySelector('#cr-sfxs').classList.toggle('on', Sound.on);
      menuEl.querySelector('#cr-muss').classList.toggle('on', musicOn);
    }
    function closeMenu(keepPause) {
      menuEl.classList.remove('open');
      if (!keepPause) paused = false;
    }
    menuBtn.onclick = function () {
      Sound.unlock();
      if (phase === 'over' || phase === 'loading') return;
      Sound.play('click'); paused = true; syncMenu(); menuEl.classList.add('open');
    };
    menuEl.addEventListener('click', function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      var a = el.getAttribute('data-a');
      if (a === 'close') { Sound.play('click'); closeMenu(); }
      else if (a === 'sfx') { Sound.on = !Sound.on; lsSet('lm2_sfx', Sound.on); Sound.play('click'); syncMenu(); }
      else if (a === 'music') {
        musicOn = !musicOn; lsSet('lm2_music', musicOn); musicStarted = true;
        if (musicOn) playMusic(); else music.pause();
        Sound.play('click'); syncMenu();
      }
      else if (a === 'leave') { Sound.play('click'); closeMenu(true); askLeave(); }
    });
    wrap.addEventListener('pointerdown', function () {
      Sound.unlock();
      if (!musicStarted) { musicStarted = true; playMusic(); }
    });

    // ---------- input ----------
    slider.addEventListener('input', function () {
      if (!canControl()) return;
      strikerPlace(slider.value / 1000);
      emitAim();
    });
    canvas.addEventListener('pointerdown', function (ev) {
      Sound.unlock();
      if (!canControl()) return;
      var w = toWorld(ev), dx = w.x - striker.x, dy = w.y - striker.y;
      if (dx * dx + dy * dy < Math.pow(CFG.strikerR * 2.6, 2)) {
        aim.on = true; aim.power = 0; aim.dx = 0; aim.dy = turn === 0 ? -1 : 1;
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
        ev.preventDefault();
        emitAim(true);
      }
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!aim.on || phase !== 'aim' || botBusy || paused) return;
      var w = toWorld(ev), dx = striker.x - w.x, dy = striker.y - w.y, len = Math.sqrt(dx * dx + dy * dy);
      if (len > 8) { aim.dx = dx / len; aim.dy = dy / len; }
      aim.power = Math.min(len, CFG.maxPull) / CFG.maxPull;
      ev.preventDefault();
      emitAim();
    });
    canvas.addEventListener('pointerup', function () {
      if (!aim.on || botBusy) return;
      var sx = aim.dx, sy = aim.dy, sp = aim.power;
      aim.on = false;
      if (phase !== 'aim' || paused) return;
      if (sp < 0.07) { emitAim(true); return; }
      if (!isFree(S, striker.x, striker.y)) { say('Coin in the way, move the striker'); Sound.play('foul', .5); emitAim(true); return; }
      fire(striker.x, sx, sy, sp, false);
    });
    canvas.addEventListener('pointercancel', function () { aim.on = false; emitAim(true); });
    var onResize = function () { fit(); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { fit(); }); ro.observe(mount); }

    // ---------- Telegram Mini App ----------
    // canvas par touch se mini-app neeche na khiske (swipe-down) + long-press menu band
    ['touchstart', 'touchmove'].forEach(function (t) {
      canvas.addEventListener(t, function (ev) { if (ev.cancelable) ev.preventDefault(); }, { passive: false });
    });
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    if (TG) {
      try { TG.ready(); TG.expand(); if (TG.disableVerticalSwipes) TG.disableVerticalSwipes(); } catch (e) {}
      try { TG.onEvent('viewportChanged', onResize); } catch (e) {}
    }
    // app background/minimize hone par music band, wapas aane par chalu
    var onVis = function () {
      if (document.hidden) { try { music.pause(); } catch (e) {} }
      else if (musicStarted && phase !== 'over') playMusic();
    };
    document.addEventListener('visibilitychange', onVis);

    // ---------- render ----------
    function drawBody(b) {
      var r = b.r, spr = sprites[b.type];
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 6, r * 0.98, r * 0.88, 0, 0, 7); ctx.fill();
      ctx.restore();
      if (spr) ctx.drawImage(spr, b.x - r, b.y - r, r * 2, r * 2);
    }
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (flip) { ctx.translate(CFG.W, CFG.H); ctx.rotate(Math.PI); }
      ctx.imageSmoothingQuality = 'high';
      if (imgs.board) ctx.drawImage(imgs.board, 0, 0, CFG.W, CFG.H);
      else { ctx.fillStyle = '#d9a35f'; ctx.fillRect(0, 0, CFG.W, CFG.H); }

      // jo khilaadi abhi nahi khel raha, uska striker apni line par rakha dikhta hai
      if (phase === 'aim' || phase === 'moving') {
        ctx.save(); ctx.globalAlpha = 0.92;
        drawBody({ type: 'striker', x: CFG.center.x, y: CFG.lines[1 - turn].y, r: CFG.strikerR });
        ctx.restore();
      }
      if (phase === 'aim') {
        // coin ke upar striker ho to laal (sirf apne turn par)
        if (canControl() && !isFree(S, striker.x, striker.y)) {
          ctx.fillStyle = 'rgba(255,0,0,.35)'; ctx.beginPath(); ctx.arc(striker.x, striker.y, CFG.strikerR + 6, 0, 7); ctx.fill();
        }
        // aim guide: apna, bot ka aur online opponent ka - sabka dikhta hai
        if (aim.on && aim.power > 0.03) {
          var rc = rayCast(S, striker.x, striker.y, aim.dx, aim.dy, CFG.strikerR);
          var GUIDE = 330;                       // guide ki max lambai
          var gl = Math.min(rc.t, GUIDE), gi, gn, ga;
          ctx.save();
          ctx.lineCap = 'round';
          // pull-back band: striker ke peeche, power ke hisab se
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 12;
          ctx.beginPath(); ctx.moveTo(striker.x, striker.y);
          ctx.lineTo(striker.x - aim.dx * aim.power * 120, striker.y - aim.dy * aim.power * 120); ctx.stroke();
          // chhote dots, door jaate hue fade
          gn = Math.floor(gl / 26);
          for (gi = 1; gi <= gn; gi++) {
            ga = 1 - (gi / (gn + 1)) * 0.85;
            ctx.fillStyle = 'rgba(255,255,255,' + ga.toFixed(2) + ')';
            ctx.beginPath(); ctx.arc(striker.x + aim.dx * gi * 26, striker.y + aim.dy * gi * 26, 5, 0, 7); ctx.fill();
          }
          // ghost striker: sirf jab gotti paas ho
          if (rc.hit && rc.t <= GUIDE) {
            ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(rc.x, rc.y, CFG.strikerR, 0, 7); ctx.stroke();
            var cdx = rc.hit.x - rc.x, cdy = rc.hit.y - rc.y, cl = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            for (gi = 1; gi <= 3; gi++) {
              ctx.fillStyle = 'rgba(255,220,90,' + (1 - gi * 0.25).toFixed(2) + ')';
              ctx.beginPath(); ctx.arc(rc.hit.x + cdx / cl * gi * 24, rc.hit.y + cdy / cl * gi * 24, 4.5, 0, 7); ctx.fill();
            }
          }
          // power ring (striker ke aas-paas)
          ctx.lineWidth = 8; ctx.strokeStyle = 'hsl(' + (120 - aim.power * 120) + ',90%,55%)';
          ctx.beginPath(); ctx.arc(striker.x, striker.y, CFG.strikerR + 13, -Math.PI / 2, -Math.PI / 2 + aim.power * Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
      S.bodies.forEach(function (b) { if (b.alive && b.type !== 'striker') drawBody(b); });
      if (phase === 'aim' || phase === 'moving') { if (striker.alive) drawBody(striker); }

      for (var i = anims.length - 1; i >= 0; i--) {
        var a = anims[i]; a.t += 1 / 60 / 0.3;
        if (a.t >= 1) { anims.splice(i, 1); continue; }
        var px = a.x + (a.px - a.x) * a.t, py = a.y + (a.py - a.y) * a.t, k = 1 - a.t * 0.6;
        ctx.save(); ctx.globalAlpha = 1 - a.t * 0.7;
        if (sprites[a.type]) ctx.drawImage(sprites[a.type], px - a.r * k, py - a.r * k, a.r * 2 * k, a.r * 2 * k);
        ctx.restore();
      }
    }

    // ---------- main loop ----------
    function processEvents() {
      var ev = S.events; if (!ev.length) return;
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i], v = Math.min(1, e.v / 1600);
        if (e.t === 'hit') Sound.play(e.s ? 'strike' : 'hit', 0.2 + v * 0.8);
        else if (e.t === 'wall') Sound.play('wall', 0.15 + v * 0.7);
        else if (e.t === 'pocket') {
          Sound.play('pocket', 0.9); shotPocketed.push(e.b);
          anims.push({ x: e.b.x, y: e.b.y, px: CFG.pockets[e.b.pocket].x, py: CFG.pockets[e.b.pocket].y, type: e.b.type, r: e.b.r, t: 0 });
        }
      }
      ev.length = 0; hud();
    }
    function loop(ts) {
      if (destroyed) return;
      raf = requestAnimationFrame(loop);
      var dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
      if (paused) { render(); return; }
      if (phase === 'aim') {
        if (botPlan) stepBot(dt);
        else if (isOppOnline()) stepRemote(dt);
      }
      if (phase === 'moving') {
        acc += dt;
        var guard = 0;
        while (acc >= CFG.dt && guard++ < 40) { stepState(S, CFG.dt); acc -= CFG.dt; }
        processEvents();
        if (!isMoving(S)) { endWait += dt; if (endWait > 0.25) { endWait = 0; phase = 'resolving'; endShot(); } } else endWait = 0;
      }
      render();
    }

    // ---------- API ----------
    var api = {
      remoteShot: function (s) {
        if (phase !== 'aim' || !s) return;
        strikerPlace((s.x - CFG.x1) / (CFG.x2 - CFG.x1));
        fire(s.x, s.dx, s.dy, s.power, true);
      },
      remoteAim: function (s) {
        if (!s || phase !== 'aim' || !isOppOnline()) return;
        remote = { x: s.x, dx: s.dx, dy: s.dy, power: s.power || 0, on: !!s.on };
      },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; cancelAnimationFrame(raf); clearInterval(tInt);
        try { music.pause(); } catch (e) {}
        timers.forEach(clearTimeout);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        try { if (TG) TG.offEvent('viewportChanged', onResize); } catch (e) {}
        if (ro) { try { ro.disconnect(); } catch (e) {} }
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (current === api) current = null;
      }
    };

    // ---------- start ----------
    Sound.load();
    hud(); fit();
    loadImages(function () {
      if (destroyed) return;
      buildSprites(); fit(); startMatch();
    });
    raf = requestAnimationFrame(loop);
    return api;
  }

  GLOBAL.CarromGame = {
    start: function (opts) { if (current) current.destroy(); current = createGame(opts); return current; },
    stop: function () { if (current) current.destroy(); },
    remoteShot: function (s) { if (current) current.remoteShot(s); },
    remoteAim: function (s) { if (current) current.remoteAim(s); },
    _test: { CFG: CFG, newBoard: newBoard, stepState: stepState, isMoving: isMoving, mkBody: mkBody, botPick: botPick, simShot: simShot }
  };
})(typeof window !== 'undefined' ? window : globalThis);
