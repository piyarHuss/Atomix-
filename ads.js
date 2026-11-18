/* =====================================================================
   ads.js v3 - Ludo Masters (Adsgram + Monetag) - ADMIN PANEL COMPATIBLE
   Load order (index.html):
     profile_plus.js -> remote_config.js -> ads.js -> boot();

   Admin panel fields (RC.ads):
     enabled, pNet, pBlock, fNet, fBlock, cooldownSec, maxAdsPerDay,
     taskOn, taskBlock, taskReward, taskIntervalMin, maxTaskPerDay, monetagSdk
   Har Watch Ad task ke fields:
     adNet, adBlock, adLimit, id

   - Card me jo Ad Network + Block set hai wahi chalta hai (Adsgram / Monetag).
   - Card ki Daily limit (adLimit) har user ke liye alag count hoti hai. 0 = unlimited.
   - Card ka ad fail ho to Fallback. Skip karne par reward nahi, fallback bhi nahi.
   - Reward tabhi jab user ad poora dekhe.
   ===================================================================== */
(() => {
  const DEBUG = false;   /* true = testing ke liye toast me "task=... | chain" dikhega. Live me false */

  const DEF = {
    pNet: 'adsgram', pBlock: '59522',
    fNet: 'monetag', fBlock: '12251773',
    cooldownSec: 20, maxAdsPerDay: 0,
    taskOn: true, taskBlock: 'task-59520', taskReward: 10, taskIntervalMin: 5, maxTaskPerDay: 0,
    monetagSdk: '//libtl.com/sdk.js',
    intBlock: 'int-59518',          /* result screen interstitial */
    intGapMs: 180000                /* interstitial ke beech kam se kam 3 minute */
  };
  const num2 = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  /* admin panel ki value kisi bhi naam se aaye ("Adsgram Rewarded", "monetag"...) -> adsgram / monetag */
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

  /* ---- localStorage helpers (soft limits) ---- */
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const dayState = () => { const s = LS.get('ads_day', null); return (s && s.d === today()) ? s : { d: today(), t: 0, c: {}, tk: 0 }; };
  const saveDay = s => LS.set('ads_day', s);

  /* ---- SDK loading ---- */
  const addScript = (src, attrs) => new Promise(res => {
    const s = document.createElement('script');
    s.src = src.indexOf('//') === 0 ? 'https:' + src : src; s.async = true;
    Object.keys(attrs || {}).forEach(k => s.setAttribute(k, attrs[k]));
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  addScript('https://telegram.org/js/telegram-web-app.js');
  addScript('https://sad.adsgram.ai/js/sad.min.js');

  const adTasks = () => ((window.RC && window.RC.tasks) ? Object.values(window.RC.tasks) : [])
    .filter(x => x && x.kind === 'ad' && x.enabled !== false);

  const MZ = {};
  function ensureMonetag(zone) {
    const c = cfg(), z = String(zone), fn = 'show_' + z;
    if (window[fn]) return Promise.resolve(window[fn]);
    if (!MZ[z]) MZ[z] = addScript(c.monetagSdk, { 'data-zone': z, 'data-sdk': fn }).then(() => new Promise(r => {
      let n = 0; const t = setInterval(() => { if (window[fn] || ++n > 30) { clearInterval(t); r(window[fn]); } }, 100);
    }));
    return MZ[z];
  }
  /* sab Monetag zones pehle se load karo (primary, fallback, aur har card ke) */
  function preloadMonetag() {
    const c = cfg(), zones = new Set();
    if (c.fNet === 'monetag' && c.fBlock) zones.add(String(c.fBlock));
    if (c.pNet === 'monetag' && c.pBlock) zones.add(String(c.pBlock));
    adTasks().forEach(t => { if (normNet(t.adNet) === 'monetag' && t.adBlock) zones.add(String(t.adBlock)); });
    zones.forEach(z => ensureMonetag(z));
  }
  setTimeout(preloadMonetag, 1500);
  setTimeout(preloadMonetag, 6000);   /* config Firebase se aane ke baad dobara */

  /* ---- providers: resolve = user ne ad dekha | reject(err.skipped) = skip | reject = ad nahi mila ---- */
  const run = {
    demo: () => new Promise(res => _demo(res)),
    adsgram: block => new Promise((res, rej) => {
      if (!window.Adsgram || !inTg()) return rej(new Error('Adsgram only works inside Telegram'));
      try {
        window.Adsgram.init({ blockId: String(block) }).show()
          .then(r => (r && r.done === false) ? rej(Object.assign(new Error('skipped'), { skipped: 1 })) : res())
          .catch(e => {
            /* Adsgram: error:false = user ne skip/close kiya, error:true = ad mila hi nahi */
            if (e && e.error === false) rej(Object.assign(new Error('skipped'), { skipped: 1 }));
            else rej(new Error((e && (e.description || e.message)) || 'Adsgram no ad'));
          });
      } catch (e) { rej(e); }
    }),
    monetag: block => ensureMonetag(block).then(fn => {
      if (!fn) throw new Error('Monetag SDK not loaded (zone ' + block + ')');
      return fn();
    })
  };

  /* ---- Rewarded ad ---- */
  const _demo = showRewardedAd;     /* purana 3 second wala demo ad */
  function loadingBox(on) {
    let o = document.getElementById('ad-load');
    if (!on) { if (o) o.remove(); return; }
    if (o) return;
    o = document.createElement('div'); o.id = 'ad-load'; o.className = 'dr'; o.style.zIndex = 120;
    o.innerHTML = '<div class="ad-box"><b>Loading ad…</b><small>Please wait</small></div>';
    document.getElementById('app').appendChild(o);
  }

  /* ---- CARD PEHCHAN: kaun sa Watch Ad card dabaya gaya ---- */
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function detectTask(el) {
    const list = adTasks(); if (!list.length || !el) return null;
    /* 1) onclick / data-* / id me task id (hyphen ke saath) */
    let n = el, d = 0;
    while (n && n !== document.body && d < 8) {
      const s = (n.getAttribute ? (n.getAttribute('onclick') || '') : '') + ' ' + (n.dataset ? Object.values(n.dataset).join(' ') : '') + ' ' + (n.id || '');
      const hit = list.find(x => new RegExp('(^|[^\\w-])' + reEsc(x.id) + '($|[^\\w-])').test(s));
      if (hit) return hit;
      n = n.parentElement; d++;
    }
    /* 2) card ka title + subtitle text */
    n = el; d = 0;
    while (n && n !== document.body && d < 8) {
      const tx = clean(n.textContent);
      if (tx && tx.length < 500) {
        const m = list.filter(x => x.t && tx.includes(clean(x.t)) && (!x.sub || tx.includes(clean(x.sub))));
        if (m.length === 1) return m[0];
        if (m.length > 1) {
          /* 3) same title wale cards: order se pehchano */
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
  /* Button ke click se pehle (capture) pata kar lo ki kaun sa card dabaya gaya */
  document.addEventListener('click', e => {
    try {
      const hit = detectTask(e.target);
      if (hit) { window.__adTask = hit.id; setTimeout(() => { window.__adTask = null; }, 1500); }
      else window.__adTask = null;
    } catch (err) { console.warn('[ads] detect error', err); }
  }, true);

  function findTask(t) {
    if (t && typeof t === 'object') return t;
    if (t == null || t === '') { t = window.__adTask; window.__adTask = null; if (!t) return null; }
    return adTasks().find(x => String(x.id) === String(t)) || null;
  }

  showRewardedAd = function (cb, taskArg) {
    const c = cfg();
    if (!c.enabled) { toast('Ads are turned off'); return; }
    const task = findTask(taskArg), tid = task && task.id ? String(task.id) : '';
    const st = dayState();

    /* daily limits: total + is card ki apni limit */
    if (c.maxAdsPerDay > 0 && st.t >= c.maxAdsPerDay) { toast('Daily ad limit reached. Come back tomorrow'); return; }
    const cl = task ? num2(task.adLimit) : 0;
    if (cl > 0 && tid && (st.c[tid] || 0) >= cl) { toast('Is task ki daily limit poori ho gayi'); return; }

    /* cooldown */
    const wait = Math.ceil((LS.get('ads_last', 0) + c.cooldownSec * 1000 - Date.now()) / 1000);
    if (c.cooldownSec > 0 && wait > 0) { toast('Next ad in ' + wait + 's'); return; }

    /* ad chain: card ka apna ad -> (card na mile to) Primary -> Fallback */
    const chain = [];
    const add = (net, block) => { net = normNet(net); if (net && block && run[net] && !chain.some(x => x.net === net && x.block === String(block))) chain.push({ net, block: String(block) }); };
    if (task && normNet(task.adNet) && task.adBlock) add(task.adNet, task.adBlock);
    else add(c.pNet, c.pBlock);
    add(c.fNet, c.fBlock);
    if (!chain.length) chain.push({ net: 'demo', block: '' });
    dbg('task=' + (tid || 'NONE') + ' | ' + chain.map(x => x.net + ':' + x.block).join(' -> '));

    let finished = 0;
    loadingBox(true);
    (function next(i) {
      if (i >= chain.length) { loadingBox(false); toast('Ad not available right now. Try again later'); return; }
      const p = chain[i];
      run[p.net](p.block).then(() => {
        if (finished) return; finished = 1; loadingBox(false);
        const s2 = dayState(); s2.t++; if (tid) s2.c[tid] = (s2.c[tid] || 0) + 1; saveDay(s2);
        LS.set('ads_last', Date.now());
        cb();                                                          /* reward sirf yahan */
      }).catch(e => {
        if (e && e.skipped) { loadingBox(false); toast('Ad skipped. Reward nahi mila'); return; }   /* skip par fallback nahi */
        dbg(p.net + ' ' + p.block + ' failed: ' + (e && e.message || e));
        next(i + 1);
      });
    })(0);
  };

  /* ---- Interstitial: result screen ke buttons par ---- */
  let lastInt = 0;
  function interstitial(then) {
    const c = cfg();
    if (!c.enabled || !inTg() || !window.Adsgram || Date.now() - lastInt < c.intGapMs) { then(); return; }
    lastInt = Date.now();
    let d = 0; const go2 = () => { if (!d) { d = 1; then(); } };
    try { window.Adsgram.init({ blockId: String(c.intBlock) }).show().then(go2).catch(go2); } catch (e) { go2(); }
    setTimeout(go2, 20000);   /* kuch atak jaye to bhi aage badho */
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
