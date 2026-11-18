/* =====================================================================
   ads.js v6 - Ludo Masters (Adsgram + Monetag) - ADMIN PANEL COMPATIBLE
   Load order: profile_plus.js -> remote_config.js -> ads.js -> boot();
   remote_config.js v3 wala hi rakho (usme badlav nahi).
   Testing ke baad DEBUG = false kar dena.
   Count reset: localStorage.removeItem('ads_day')
   ===================================================================== */
(() => {
  const DEBUG = true;   /* TEST: toast me chain dikhega. Live me false */

  const DEF = {
    pNet: 'adsgram', pBlock: '59522',
    fNet: 'monetag', fBlock: '12251773',
    cooldownSec: 20, maxAdsPerDay: 0,
    taskOn: true, taskBlock: 'task-59520', taskReward: 10, taskIntervalMin: 5, maxTaskPerDay: 0,
    monetagSdk: '//libtl.com/sdk.js',
    intBlock: 'int-59518',
    intGapMs: 180000
  };
  const num2 = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const normNet = n => { n = String(n || '').toLowerCase(); return n.includes('monetag') ? 'monetag' : n.includes('adsgram') ? 'adsgram' : n === 'demo' ? 'demo' : ''; };
  const cfg = () => {
    const a = (window.RC && window.RC.ads) || {};
    const o = {};
    Object.keys(DEF).forEach(k => { o[k] = (a[k] !== undefined && a[k] !== null && a[k] !== '') ? a[k] : DEF[k]; });
    o.pNet = normNet(o.pNet) || 'adsgram';
    o.fNet = normNet(o.fNet);
    if (a.fNet === 'none') { o.fNet = ''; o.fBlock = ''; }
    if (a.fBlock === '' && a.fNet !== undefined) o.fBlock = '';
    o.enabled = a.enabled !== false;
    o.taskOn = a.taskOn !== false && o.taskOn !== false;
    return o;
  };
  const inTg = () => !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
  const dbg = m => { if (DEBUG) { try { toast(String(m)); } catch (e) { } } console.warn('[ads]', m); };

  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const dayState = () => { const s = LS.get('ads_day', null); return (s && s.d === today()) ? s : { d: today(), t: 0, c: {}, tk: 0 }; };
  const saveDay = s => LS.set('ads_day', s);

  const addScript = (src, attrs) => new Promise(res => {
    const s = document.createElement('script');
    s.src = src.indexOf('//') === 0 ? 'https:' + src : src; s.async = true;
    Object.keys(attrs || {}).forEach(k => s.setAttribute(k, attrs[k]));
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  addScript('https://telegram.org/js/telegram-web-app.js');
  addScript('https://sad.adsgram.ai/js/sad.min.js');

  /* Ad cards: RC.tasks (Firebase raw) + app ke TASKS dono se milake */
  const adTasks = () => {
    const raw = (window.RC && window.RC.tasks) ? Object.values(window.RC.tasks) : [];
    let app = []; try { app = (typeof TASKS !== 'undefined' && Array.isArray(TASKS)) ? TASKS : []; } catch (e) { }
    const byId = {};
    raw.forEach(x => { if (x && x.id) byId[x.id] = Object.assign({}, x); });
    app.forEach(x => {
      if (!x || !x.id) return;
      const b = byId[x.id] || (byId[x.id] = {});
      Object.keys(x).forEach(k => { if (b[k] === undefined || b[k] === '' || b[k] === null) b[k] = x[k]; });
    });
    return Object.values(byId).filter(x => x && x.kind === 'ad' && x.enabled !== false);
  };

  const MZ = {};
  function ensureMonetag(zone) {
    const c = cfg(), z = String(zone), fn = 'show_' + z;
    if (window[fn]) return Promise.resolve(window[fn]);
    if (!MZ[z]) MZ[z] = addScript(c.monetagSdk, { 'data-zone': z, 'data-sdk': fn }).then(() => new Promise(r => {
      let n = 0; const t = setInterval(() => { if (window[fn] || ++n > 30) { clearInterval(t); r(window[fn]); } }, 100);
    }));
    return MZ[z];
  }
  function preloadMonetag() {
    const c = cfg(), zones = new Set();
    if (c.fNet === 'monetag' && c.fBlock) zones.add(String(c.fBlock));
    if (c.pNet === 'monetag' && c.pBlock) zones.add(String(c.pBlock));
    adTasks().forEach(t => { if (normNet(t.adNet) === 'monetag' && t.adBlock) zones.add(String(t.adBlock)); });
    zones.forEach(z => ensureMonetag(z));
  }
  setTimeout(preloadMonetag, 1500);
  setTimeout(preloadMonetag, 6000);

  const withTimeout = (p, ms, msg) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(msg)), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });

  const run = {
    demo: () => new Promise(res => _demo(res)),
    adsgram: block => new Promise((res, rej) => {
      if (!window.Adsgram || !inTg()) return rej(new Error('Adsgram only works inside Telegram'));
      try {
        window.Adsgram.init({ blockId: String(block) }).show()
          .then(r => (r && r.done === false) ? rej(Object.assign(new Error('skipped'), { skipped: 1 })) : res())
          .catch(e => {
            if (e && e.error === false) rej(Object.assign(new Error('skipped'), { skipped: 1 }));
            else rej(new Error((e && (e.description || e.message)) || 'Adsgram no ad'));
          });
      } catch (e) { rej(e); }
    }),
    monetag: block => ensureMonetag(block).then(fn => {
      if (!fn) throw new Error('Monetag SDK not loaded (zone ' + block + ')');
      const t0 = Date.now();
      return withTimeout(Promise.resolve(fn()), 25000, 'Monetag timeout (zone ' + block + ')')
        .then(() => { if (Date.now() - t0 < 2500) throw Object.assign(new Error('skipped'), { skipped: 1 }); });
    })
  };

  const _demo = showRewardedAd;
  function loadingBox(on) {
    let o = document.getElementById('ad-load');
    if (!on) { if (o) o.remove(); return; }
    if (o) return;
    o = document.createElement('div'); o.id = 'ad-load'; o.className = 'dr'; o.style.zIndex = 120;
    o.innerHTML = '<div class="ad-box"><b>Loading ad…</b><small>Please wait</small></div>';
    document.getElementById('app').appendChild(o);
  }

  /* ---- CARD PEHCHAN ---- */
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function detectTask(el) {
    const list = adTasks(); if (!list.length || !el) return null;
    let n = el, d = 0;
    while (n && n !== document.body && d < 8) {
      const s = (n.getAttribute ? (n.getAttribute('onclick') || '') : '') + ' ' + (n.dataset ? Object.values(n.dataset).join(' ') : '') + ' ' + (n.id || '');
      const hit = list.find(x => new RegExp('(^|[^\\w-])' + reEsc(x.id) + '($|[^\\w-])').test(s));
      if (hit) return hit;
      n = n.parentElement; d++;
    }
    n = el; d = 0;
    while (n && n !== document.body && d < 8) {
      const tx = clean(n.textContent);
      if (tx && tx.length < 500) {
        const m = list.filter(x => x.t && tx.includes(clean(x.t)) && (!x.sub || tx.includes(clean(x.sub))));
        if (m.length === 1) return m[0];
        if (m.length > 1) {
          m.sort((a, b) => clean(b.t).length - clean(a.t).length);
          if (clean(m[0].t).length > clean(m[1].t).length) return m[0];
          const par = n.parentElement;
          if (par) {
            const sibs = [...par.children].filter(c => c.tagName === n.tagName && c.className === n.className && m.some(x => clean(c.textContent).includes(clean(x.t))));
            const i = sibs.indexOf(n);
            if (i >= 0 && m[i]) return m[i];
          }
          return null;
        }
      }
      n = n.parentElement; d++;
    }
    return null;
  }

  let lastClick = 0;
  document.addEventListener('click', e => {
    lastClick = Date.now();
    try {
      const hit = detectTask(e.target);
      if (hit) { window.__adTask = hit.id; setTimeout(() => { window.__adTask = null; }, 4000); }
      else window.__adTask = null;
    } catch (err) { console.warn('[ads] detect error', err); }
  }, true);

  /* Card dhundo: (1) argument  (2) click se  (3) cb function ke text me id */
  function findTask(t, cb) {
    if (t && typeof t === 'object') return { task: t, via: 'arg' };
    let via = 'arg';
    if (t == null || t === '') { t = window.__adTask; window.__adTask = null; via = 'click'; }
    let hit = t ? adTasks().find(x => String(x.id) === String(t)) : null;
    if (hit) return { task: hit, via };
    try {
      const src = String(cb || '');
      hit = adTasks().find(x => src.indexOf("'" + x.id + "'") > -1 || src.indexOf('"' + x.id + '"') > -1);
      if (hit) return { task: hit, via: 'cb' };
    } catch (e) { }
    return { task: null, via: 'none' };
  }
  const taskDone = id => { try { return !!(typeof TK !== 'undefined' && TK.c && TK.c[id]); } catch (e) { return false; } };

  let busy = 0, lastEnd = 0;

  showRewardedAd = function (cb, taskArg) {
    if (busy || Date.now() - lastEnd < 1500) return;

    const c = cfg();
    if (!c.enabled) { toast('Ads are turned off'); return; }
    const userClick = Date.now() - lastClick < 1000;
    const f = findTask(taskArg, cb), task = f.task, tid = task && task.id ? String(task.id) : '';
    const st = dayState();

    if (c.maxAdsPerDay > 0 && st.t >= c.maxAdsPerDay) { if (userClick) toast('Daily ad limit reached. Come back tomorrow'); return; }

    const lim = task ? Math.round(num2(task.adLimit)) : 0;
    const used = tid ? (st.c[tid] || 0) : 0;
    if (lim > 0 && tid && used >= lim) {
      if (taskDone(tid)) return;
      if (userClick) toast('Daily limit poori: ' + used + '/' + lim);
      return;
    }

    const wait = Math.ceil((LS.get('ads_last', 0) + c.cooldownSec * 1000 - Date.now()) / 1000);
    if (c.cooldownSec > 0 && wait > 0) { if (userClick) toast('Next ad in ' + wait + 's'); return; }

    const chain = [];
    const add = (net, block) => { net = normNet(net); if (net && block && run[net] && !chain.some(x => x.net === net && x.block === String(block))) chain.push({ net, block: String(block) }); };
    if (task && normNet(task.adNet) && task.adBlock) add(task.adNet, task.adBlock);
    else add(c.pNet, c.pBlock);
    add(c.fNet, c.fBlock);
    if (!chain.length) chain.push({ net: 'demo', block: '' });
    dbg('task=' + (tid || 'NONE') + ' via=' + f.via + ' adNet=' + (task && task.adNet || '-') + ' used=' + used + '/' + lim + ' | ' + chain.map(x => x.net + ':' + x.block).join(' -> '));

    let finished = 0;
    busy = 1;
    loadingBox(true);
    const end = () => { busy = 0; lastEnd = Date.now(); loadingBox(false); };
    (function next(i) {
      if (i >= chain.length) { end(); toast('Ad not available right now. Try again later'); return; }
      const p = chain[i];
      run[p.net](p.block).then(() => {
        if (finished) return; finished = 1; end();
        const s2 = dayState(); s2.t++; if (tid) s2.c[tid] = (s2.c[tid] || 0) + 1; saveDay(s2);
        LS.set('ads_last', Date.now());
        cb();
      }).catch(e => {
        if (e && e.skipped) { end(); toast('Ad skipped. Reward nahi mila'); return; }
        dbg(p.net + ' ' + p.block + ' failed: ' + (e && e.message || e));
        next(i + 1);
      });
    })(0);
  };

  /* ---- Interstitial: result screen ---- */
  let lastInt = 0;
  function interstitial(then) {
    const c = cfg();
    if (!c.enabled || !inTg() || !window.Adsgram || Date.now() - lastInt < c.intGapMs) { then(); return; }
    lastInt = Date.now();
    let d = 0; const go2 = () => { if (!d) { d = 1; then(); } };
    try { window.Adsgram.init({ blockId: String(c.intBlock) }).show().then(go2).catch(go2); } catch (e) { go2(); }
    setTimeout(go2, 20000);
  }
  const _ra = resAgain, _rh = resHome;
  resAgain = function () { if (RES.busy) return; interstitial(() => _ra()); };
  resHome = function () { if (RES.busy) return; interstitial(() => _rh()); };

  /* ---- Adsgram Task widget (Tasks page) ---- */
  (() => {
    const css = '.ag-w{margin:calc(14*var(--u)) 0 0;padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(224,206,255,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.8);display:flex;align-items:center;gap:calc(8*var(--u));font-weight:700;color:#3a1590;font-size:calc(13*var(--u))}.ag-w adsgram-task{display:flex;flex:1;align-items:center;justify-content:space-between;gap:8px}.ag-b{padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#4aa0ff,#0a50d8);color:#fff;font-weight:800}.ag-b.c{background:linear-gradient(180deg,#7dec3a,#2fb312)}.ag-b.d{background:#bcb6d8}.ag-r{font-weight:800;color:#6a2fe0}';
    const stl = document.createElement('style'); stl.textContent = css; document.head.appendChild(stl);

    const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    let tmr = null;

    const o = V.tasks;
    V.tasks = function () {
      const html = o(); const c = cfg();
      if (!inTg() || !c.enabled || !c.taskOn || !c.taskBlock) return html;
      const s = dayState(), next = LS.get('ag_next', 0), left = next - Date.now();
      let box;
      if (c.maxTaskPerDay > 0 && s.tk >= c.maxTaskPerDay) box = '<div class="ag-w">✓ Sponsored task limit reached for today</div>';
      else if (left > 0) box = '<div class="ag-w"><span>Sponsored Task</span><span class="ag-r" id="ag-cd" style="margin-left:auto">Next in ' + mmss(left) + '</span></div>';
      else box = `<div class="ag-w"><span>Sponsored Task</span><adsgram-task data-block-id="${c.taskBlock}" data-debug="false">
<span slot="reward" class="ag-r">+${c.taskReward} 💎</span><div slot="button" class="ag-b">Go</div><div slot="claim" class="ag-b c">Claim</div><div slot="done" class="ag-b d">Done</div></adsgram-task></div>`;
      return html.replace('<div class="tk-bonus">', box + '<div class="tk-bonus">');
    };

    const _g = go;
    go = function (v) {
      _g(v);
      clearInterval(tmr);
      if (v !== 'tasks') return;
      setTimeout(() => {
        const el = document.querySelector('adsgram-task');
        if (el && !el._b) {
          el._b = 1;
          el.addEventListener('reward', () => {
            const c = cfg(), s = dayState();
            if (c.maxTaskPerDay > 0 && s.tk >= c.maxTaskPerDay) return;
            s.tk++; saveDay(s);
            LS.set('ag_next', Date.now() + Math.max(0, c.taskIntervalMin) * 60000);
            rewardFx(el, { g: num2(c.taskReward) }, () => go('tasks'));
          });
        }
        const cd = document.getElementById('ag-cd');
        if (cd) tmr = setInterval(() => {
          const l = LS.get('ag_next', 0) - Date.now(), e = document.getElementById('ag-cd');
          if (!e) { clearInterval(tmr); return; }
          if (l <= 0) { clearInterval(tmr); go('tasks'); } else e.textContent = 'Next in ' + mmss(l);
        }, 1000);
      }, 0);
    };
  })();
})();
