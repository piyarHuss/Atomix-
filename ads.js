/* =====================================================================
   ads.js  v2  —  Ludo Masters  (Adsgram + Monetag)
   Load order (index.html):
     profile_plus.js  ->  remote_config.js  ->  ads.js  ->  boot();
   - Watch Ad tasks / rewarded ad : Adsgram reward block (59522), fallback Monetag (zone 12251773)
   - Interstitial                 : Adsgram int-59518 (result screen ke buttons par, 3 min me max 1 baar)
   - Adsgram Task widget          : task-59520 (Tasks page par, Telegram ke andar)

   >>> TEST MODE: neeche  const DEBUG = true;  karo.
       Adsgram test ad dikhata hai + har error ka message toast me aata hai.
       Sab theek dikhe to wapas  false  kar do (live karne se pehle ZAROOR). <<<
   ===================================================================== */
const DEBUG = false;

(() => {
  const DEF = {
    provider: 'adsgram', fallback: 'monetag',
    adsgramBlock: '59522',          /* rewarded */
    adsgramInt: 'int-59518',        /* interstitial */
    adsgramTask: 'task-59520',      /* task widget */
    taskReward: 10,                 /* task widget ka diamond reward */
    monetagZone: '12251773',
    monetagSdk: '//libtl.com/sdk.js',
    intGapMs: 180000                /* interstitial ke beech kam se kam 3 minute */
  };
  const cfg = () => {
    const a = (window.RC && window.RC.ads) || {};
    const o = {};
    Object.keys(DEF).forEach(k => { o[k] = (a[k] !== undefined && a[k] !== '' && a[k] !== null) ? a[k] : DEF[k]; });
    o.enabled = a.enabled !== false;
    if (DEBUG) o.intGapMs = 0;
    return o;
  };
  const inTg = () => !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
  const errTxt = e => !e ? 'unknown' : (e.description || e.message || (typeof e === 'string' ? e : JSON.stringify(e)));
  const dbg = m => { console.log('[ads]', m); if (DEBUG) toast('ADS: ' + m); };
  const num2 = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

  /* ---- SDK loading ---- */
  const addScript = (src, attrs) => new Promise(res => {
    const s = document.createElement('script');
    s.src = src.indexOf('//') === 0 ? 'https:' + src : src; s.async = true;
    Object.keys(attrs || {}).forEach(k => s.setAttribute(k, attrs[k]));
    s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  addScript('https://telegram.org/js/telegram-web-app.js');
  addScript('https://sad.adsgram.ai/js/sad.min.js').then(ok => { if (!ok) dbg('Adsgram SDK load nahi hua'); });
  const MZ = {};
  function ensureMonetag() {
    const c = cfg(), z = String(c.monetagZone), fn = 'show_' + z;
    if (window[fn]) return Promise.resolve(window[fn]);
    if (!MZ[z]) MZ[z] = addScript(c.monetagSdk, { 'data-zone': z, 'data-sdk': fn }).then(() => new Promise(r => {
      let n = 0; const t = setInterval(() => { if (window[fn] || ++n > 30) { clearInterval(t); r(window[fn]); } }, 100);
    }));
    return MZ[z];
  }
  ensureMonetag();

  /* ---- Adsgram helper: ek jagah se sab block chalte hain ---- */
  function agShow(blockId) {
    return new Promise((res, rej) => {
      if (!window.Adsgram) return rej(new Error('Adsgram SDK not loaded'));
      if (!inTg()) return rej(new Error('Adsgram only works inside Telegram'));
      try {
        window.Adsgram.init({ blockId: String(blockId), debug: DEBUG }).show()
          .then(r => (r && r.done === false) ? rej(new Error('skipped')) : res(r)).catch(rej);
      } catch (e) { rej(e); }
    });
  }

  /* ---- providers: resolve = user ne ad dekha, reject = nahi mila / skip ---- */
  const run = {
    demo: () => new Promise(res => _demo(res)),
    adsgram: () => agShow(cfg().adsgramBlock),
    monetag: () => ensureMonetag().then(fn => {
      if (!fn) throw new Error('Monetag SDK not loaded');
      return fn();
    })
  };

  /* ---- Rewarded ad (Watch Ad tasks) ---- */
  const _demo = showRewardedAd;     /* purana 3 second wala demo ad */
  function loadingBox(on) {
    let o = document.getElementById('ad-load');
    if (!on) { if (o) o.remove(); return; }
    if (o) return;
    o = document.createElement('div'); o.id = 'ad-load'; o.className = 'dr'; o.style.zIndex = 120;
    o.innerHTML = '<div class="ad-box"><b>Loading ad…</b><small>Please wait</small></div>';
    document.getElementById('app').appendChild(o);
  }
  showRewardedAd = function (cb) {
    const c = cfg();
    if (!c.enabled) { toast('Ads are turned off'); return; }
    const order = [c.provider, c.fallback].filter((p, i, a) => p && p !== 'none' && run[p] && a.indexOf(p) === i);
    if (!order.length) order.push('demo');
    let finished = 0;
    loadingBox(true);
    (function next(i) {
      if (i >= order.length) { loadingBox(false); toast('Ad not available right now. Try again later'); return; }
      run[order[i]]().then(() => {
        if (finished) return; finished = 1; loadingBox(false); cb();     /* reward sirf yahan */
      }).catch(e => { dbg('Rewarded ' + order[i] + ' failed: ' + errTxt(e)); next(i + 1); });
    })(0);
  };

  /* ---- Interstitial: result screen ke buttons par ---- */
  let lastInt = 0;
  function interstitial(then) {
    const c = cfg();
    if (!c.enabled) { then(); return; }
    if (Date.now() - lastInt < c.intGapMs) { dbg('Interstitial skip: 3 min ka gap'); then(); return; }
    if (!inTg() || !window.Adsgram) { dbg('Interstitial skip: Telegram/Adsgram nahi mila'); then(); return; }
    lastInt = Date.now();
    let d = 0; const go2 = () => { if (!d) { d = 1; then(); } };
    agShow(c.adsgramInt).then(go2).catch(e => { dbg('Interstitial failed: ' + errTxt(e)); go2(); });
    setTimeout(go2, 20000);   /* kuch atak jaye to bhi aage badho */
  }
  const _ra = resAgain, _rh = resHome;
  resAgain = function () { if (RES.busy) return; interstitial(() => _ra()); };
  resHome = function () { if (RES.busy) return; interstitial(() => _rh()); };

  /* ---- Adsgram Task widget (Tasks page) ---- */
  (() => {
    const css = '.ag-w{margin:calc(14*var(--u)) 0 0;padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(224,206,255,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.8);display:flex;align-items:center;gap:calc(8*var(--u));font-weight:700;color:#3a1590;font-size:calc(13*var(--u))}.ag-w adsgram-task{display:flex;flex:1;align-items:center;justify-content:space-between;gap:8px}.ag-b{padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#4aa0ff,#0a50d8);color:#fff;font-weight:800}.ag-b.c{background:linear-gradient(180deg,#7dec3a,#2fb312)}.ag-b.d{background:#bcb6d8}.ag-r{font-weight:800;color:#6a2fe0}';
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const o = V.tasks;
    V.tasks = function () {
      const html = o(); if (!inTg() || !cfg().enabled) return html;
      const c = cfg(), done = TK && TK.c && TK.c.ag;
      const box = done ? '<div class="ag-w">✓ Sponsored task done</div>'
        : `<div class="ag-w"><span class="ag-lbl">Sponsored Task</span><adsgram-task data-block-id="${c.adsgramTask}" data-debug="${DEBUG}">
<span slot="reward" class="ag-r">+${c.taskReward} 💎</span><div slot="button" class="ag-b">Go</div><div slot="claim" class="ag-b c">Claim</div><div slot="done" class="ag-b d">Done</div></adsgram-task></div>`;
      return html.replace('<div class="tk-bonus">', box + '<div class="tk-bonus">');
    };

    const giveReward = el => {
      TK = TK0(); if (TK.c.ag) return; TK.c.ag = 1; tkSave();
      rewardFx(el, { g: num2(cfg().taskReward) }, () => go('tasks'));
    };
    const _g = go;
    go = function (v) {
      _g(v);
      if (v === 'tasks') setTimeout(() => {
        const el = document.querySelector('adsgram-task'); if (!el || el._b) return; el._b = 1;
        if (!window.customElements || !customElements.get('adsgram-task')) dbg('adsgram-task element define nahi hua (SDK/Telegram check karo)');
        el.addEventListener('reward', () => giveReward(el));
        el.addEventListener('onReward', () => giveReward(el));
        const none = e => {
          dbg('Task widget: ' + (e && e.type) + ' ' + errTxt(e && e.detail));
          const w = el.closest('.ag-w'); if (w) w.style.display = 'none';      /* task nahi mila to khali card mat dikhao */
        };
        el.addEventListener('onBannerNotFound', none);
        el.addEventListener('onError', none);
      }, 0);
    };
  })();
})();
