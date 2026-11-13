/* =====================================================================
   remote_config.js  v2  —  Ludo Masters  (Admin Panel se poora control)
   Load order (index.html):
     <script src="profile_plus.js"></script>
     <script src="remote_config.js"></script>
     <script>boot();</script>
   Admin panel ka "Save & Publish" -> Firebase config/*  -> yahan se app par lagta hai.
   Control hota hai: App Settings, Games, Packs, Pools, Daily Rewards,
   Missions, Tasks, Login/Big bonus, Ads on/off, Maintenance, Announcement, Ban.
   ===================================================================== */
(() => {
  const CK = 'lm_cfg_v2';
  const db = () => firebase.database();
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const arr = v => Array.isArray(v) ? v.filter(x => x != null) : Object.values(v || {});
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const dkey = d => { d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const safe = (name, f) => { try { f(); } catch (e) { console.error('[remote_config] ' + name + ' failed:', e); } };

  /* ---- app ke ORIGINAL (default) values, taaki config dobara lagne par sahi se reset ho ---- */
  const ORIG = {
    pools: POOLS.map(x => Object.assign({}, x)),
    dr: DR.map(x => Object.assign({}, x)),
    mis: MIS.map(x => Object.assign({}, x)),
    tasks: TASKS.map(x => Object.assign({}, x))
  };
  const RCX = { loginBonus: 10, bigBonus: 50, adsOn: true };
  window.TKURL = {};

  let CFG = {};
  try { CFG = JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) { }
  window.RC = CFG;
  if (CFG.app && CFG.app.turnSeconds) window.LUDO_TURN_SECONDS = num(CFG.app.turnSeconds);

  /* ---- helpers jo inline onclick se chalte hain ---- */
  window.tkLink = id => {
    const u = window.TKURL[id]; if (!u) return;
    try { window.open(u, '_blank'); } catch (e) { location.href = u; }
    setTimeout(() => { tkAdd(id); go('tasks'); }, 5000);          /* link khulne ke ~5 sec baad progress */
  };
  window.inviteTask = id => {
    const d = { title: 'Ludo Masters', text: 'Join me on Ludo Masters and win rewards!', url: location.href };
    Promise.resolve(navigator.share ? navigator.share(d) : 0).then(() => { tkAdd(id); go('tasks'); }).catch(() => { });
  };

  /* ---- config apply ---- */
  function applyCfg(c) {
    CFG = c || {}; window.RC = CFG;
    try { localStorage.setItem(CK, JSON.stringify(CFG)); } catch (e) { }
    const a = CFG.app || {};

    /* App settings */
    safe('minWd', () => { if (a.minWd != null) MIN_WD = num(a.minWd) || MIN_WD; });          /* profile_plus.js me const -> let chahiye */
    safe('demoPayments', () => { if (a.demoPayments != null) DEMO_PAYMENTS = !!a.demoPayments; });
    if (a.turnSeconds) window.LUDO_TURN_SECONDS = num(a.turnSeconds);
    RCX.loginBonus = a.loginBonus != null ? num(a.loginBonus) : 10;
    RCX.bigBonus = a.bigBonus != null ? num(a.bigBonus) : 50;
    RCX.adsOn = !(CFG.ads && CFG.ads.enabled === false);

    /* Games on/off + title */
    safe('games', () => arr(CFG.games).forEach(g => {
      if (g && GAMES[g.key]) { GAMES[g.key].ready = !!g.ready; if (g.title) GAMES[g.key].title = g.title; }
    }));

    /* Store / Deposit packs */
    safe('packs', () => {
      const p = arr(CFG.packs);
      if (p.length) { DEP_AMT.length = 0; p.forEach(x => DEP_AMT.push(num(x.amt))); }
    });

    /* Pools & Cards */
    safe('pools', () => {
      if (CFG.pools == null) return;
      const rows = arr(CFG.pools).filter(r => r.enabled !== false);
      POOLS.length = 0;
      rows.forEach(r => {
        const g = r.kind === 'g', fee = num(r.feeN), win = num(r.win);
        POOLS.push({
          id: String(r.id), frame: r.frame || (g ? 'pool_diamond_frame' : 'pool_cash_frame'),
          prize: '₹' + win, win, label: r.label || 'Rupees',
          fee: fee <= 0 ? 'Free' : (g ? String(fee) : '₹' + fee), kind: g ? 'g' : 'c', feeN: fee,
          ic: g ? 'gem' : 'cash_stack'
        });
      });
    });

    /* Daily rewards (7 din) */
    safe('daily', () => {
      if (CFG.daily == null) return;
      const rows = arr(CFG.daily);
      for (let i = 0; i < 7; i++) {
        const r = rows[i]; if (!r) { DR[i] = Object.assign({}, ORIG.dr[i]); continue; }
        let g = num(r.g), c = num(r.c);
        if (!g && !c) g = 10;                                   /* dono 0 -> 10 diamond */
        if (i === 6) DR[i] = { g, c };                          /* Day 7 me dono dikhte hain */
        else { const o = {}; if (g) o.g = g; if (c) o.c = c; DR[i] = o; }
      }
    });

    /* Missions */
    safe('missions', () => {
      if (CFG.missions == null) return;
      const rows = arr(CFG.missions);
      MIS.length = 0;
      ORIG.mis.forEach(m => {
        const r = rows.find(x => x.id === m.id);
        if (r && r.enabled === false) return;
        const o = Object.assign({}, m);
        if (r) { if (r.t) o.t = r.t; if (r.s) o.s = r.s; if (num(r.n) > 0) o.n = num(r.n); if (r.r != null) o.r = num(r.r); }
        MIS.push(o);
      });
    });

    /* Tasks */
    safe('tasks', () => {
      if (CFG.tasks == null) return;
      const rows = arr(CFG.tasks);
      TASKS.length = 0; window.TKURL = {};
      rows.forEach(r => {
        if (r.enabled === false) return;
        if (r.kind === 'ad' && !RCX.adsOn) return;               /* Ads Network OFF = ad tasks hide */
        const o = ORIG.tasks.find(x => x.id === r.id) || {};
        const t = Object.assign({}, o, {
          id: r.id, sec: r.sec === 'ads' ? 'ads' : 'tasks', t: r.t || 'Task', sub: r.sub || '',
          n: num(r.n) > 0 ? num(r.n) : 1, r: num(r.r), kind: r.kind, btn: r.btn || 'Go',
          ic: r.ic || o.ic || 'title_gamepad', e: o.e || '✅'
        });
        if (r.kind === 'ad') { delete t.go; }
        else if (r.kind === 'link') { window.TKURL[r.id] = r.url || ''; t.go = "tkLink('" + r.id + "')"; }
        else if (r.kind === 'invite') { t.go = "inviteTask('" + r.id + "')"; }
        else { t.go = "go('" + (r.page || 'games') + "')"; }
        TASKS.push(t);
      });
    });
  }

  /* ---- Login bonus / Big bonus: amount admin se ---- */
  claimLogin = function (b) {
    if (TK.login) return; TK.login = 1; tkSave();
    rewardFx(b, { g: RCX.loginBonus }, () => go('tasks'));
  };
  claimBonus = function (b) {
    if (TK.bonus) return;
    if (!TASKS.every(t => TK.c[t.id])) { toast('Complete all tasks first!'); return; }
    TK.bonus = 1; tkSave();
    rewardFx(b, { g: RCX.bigBonus }, () => go('tasks'));
  };
  (() => {
    const o = V.tasks;
    V.tasks = function () {
      return o()
        .replace(/(<div class="tk-login">[\s\S]*?<span class="tk-n">)\+10(<\/span>)/, '$1+' + RCX.loginBonus + '$2')
        .replace(/(<div class="tk-bonus">[\s\S]*?<span class="tk-n">)\+50(<\/span>)/, '$1+' + RCX.bigBonus + '$2');
    };
  })();

  /* ---- Store page: cards admin ke packs se ---- */
  (() => {
    const o = V.store;
    const kfmt = n => n >= 1000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : String(n);
    V.store = function () {
      const html = o(), packs = arr(CFG.packs);
      if (!packs.length) return html;
      const grid = '<div class="dp-grid">' + packs.map((p, i) => `<div class="dp-col">
<div class="dp-card"><span class="dp-badge">${A('gem', '💎', 14, 18)}<b>+${kfmt(num(p.gems))}</b></span>
<div class="dp-im">${A('pack' + (i % 6 + 1), '💵', 44, 64)}</div><div class="dp-amt">₹${num(p.amt)}</div></div>
<div class="dp-bc"><span>₹${num(p.bcash)}</span>${A('bcash', '💵', 14, 22)}<span>B. Cash</span></div>
<button class="dp-btn" onclick="ppDep(${i})">Deposit</button></div>`).join('') + '</div>\n';
      return html.replace(/<div class="dp-grid">[\s\S]*?(?=<div class="dp-wide dp-gem">)/, grid);
    };
  })();

  /* ---- block screens (maintenance / ban) ---- */
  function block(id, icon, title, msg) {
    let o = document.getElementById(id);
    if (!o) {
      o = document.createElement('div'); o.id = id;
      o.style.cssText = 'position:absolute;inset:0;z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#fff;background:radial-gradient(ellipse at 50% 30%,#5a2bd0,#1e0a52);font-family:Poppins,sans-serif';
      document.getElementById('app').appendChild(o);
    }
    o.innerHTML = '<div style="font-size:64px;margin-bottom:12px">' + icon + '</div><div style="font-size:22px;font-weight:800;margin-bottom:8px">' + esc(title) + '</div><div style="font-size:14px;opacity:.85;line-height:1.5">' + esc(msg) + '</div>';
    try { bgm.pause(); } catch (e) { }
  }
  const unblock = id => { const o = document.getElementById(id); if (o) o.remove(); };
  function maint() {
    const a = CFG.app || {};
    if (a.maintenance) block('rc-mt', '🛠️', 'Under Maintenance', a.maintenanceMsg || 'We are updating the game. Please come back soon.');
    else unblock('rc-mt');
  }

  /* ---- announcement (ek baar; text badle to phir) ---- */
  function announce() {
    const t = ((CFG.app || {}).announcement || '').trim(); if (!t) return;
    let seen = ''; try { seen = localStorage.getItem('lm_ann') || ''; } catch (e) { }
    if (seen === t) return;
    try { localStorage.setItem('lm_ann', t); } catch (e) { }
    setTimeout(() => toast('📢 ' + t), 1500);
  }

  /* ---- tracking: createdAt, lastSeen, daily activity (admin Dashboard) ---- */
  function track() {
    if (!UID) return;
    const u = db().ref('users/' + UID);
    u.child('createdAt').transaction(v => v || Date.now()).catch(() => { });
    u.child('lastSeen').set(TS()).catch(() => { });
    db().ref('activity/' + dkey(Date.now()) + '/' + UID).set(1).catch(() => { });
  }
  function checkBan() {
    if (!UID) return;
    db().ref('bans/' + UID).once('value').then(s => {
      const b = s.val();
      if (b) block('rc-ban', '🚫', 'Account Blocked', 'Reason: ' + (b.reason || 'Policy violation'));
    }).catch(() => { });
  }

  /* ---- pehli baar data aane par ---- */
  const SAFE_RERENDER = ['home', 'games', 'store', 'pool', 'missions', 'tasks', 'menu', 'profile', 'wallet', 'community', 'avatars', 'stats'];
  const _ar = applyRemote;
  let started = false;
  applyRemote = function (v, first) {
    _ar(v, first);
    if (first && !started) {
      started = true;
      applyCfg(CFG); maint();                                   /* cache se turant (pehle render se pehle) */
      db().ref('config').once('value').then(s => {
        applyCfg(s.val() || {}); maint(); announce();
        if (SAFE_RERENDER.includes(cur) && !document.getElementById('pp-sh') && !document.getElementById('dr')) { try { rer(); } catch (e) { } }
      }).catch(e => console.error('[remote_config] config read failed (Rules?):', e));
      track(); checkBan();
    }
  };

  /* ---- Deposit: deposits list + total + VIP + diamonds ---- */
  const _od = onDepositSuccess;
  onDepositSuccess = function (amount) {
    const pack = arr(CFG.packs).find(p => num(p.amt) === num(amount)) || { gems: 0 };
    const gems = num(pack.gems);
    try {
      db().ref('deposits').push({ uid: UID, amt: num(amount), gems, ts: TS(), method: DEMO_PAYMENTS ? 'demo' : 'app' });
      if (!DEMO_PAYMENTS) {
        db().ref('users/' + UID + '/dep/total').transaction(t => num(t) + num(amount));
        db().ref('users/' + UID + '/dep/count').transaction(t => num(t) + 1);
      }
    } catch (e) { console.error(e); }
    if (gems) { BAL.gems += gems; saveBal(); refreshBal(); }
    _od(amount);
  };
})();