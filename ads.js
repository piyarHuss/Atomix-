/* =====================================================================
   ads.js  v3  —  Ludo Masters  (Adsgram + Monetag)
   Load order (index.html):
     profile_plus.js  ->  remote_config.js  ->  ads.js  ->  boot();
   - Watch Ad tasks / rewarded ad : card ki apni setting (adNet + adBlock),
                                    warna Adsgram reward block (59522), fallback Monetag (zone 12251773)
   - Interstitial                 : Adsgram int-59518 (result screen ke buttons par, 3 min me max 1 baar)
   - Adsgram Task widget          : task-59520 (Tasks page par, Telegram ke andar)

   >>> TEST MODE: neeche  const DEBUG = true;  karo.
       Adsgram test ad dikhata hai + har error ka message toast me aata hai.
       Live karne se pehle ZAROOR false karo. <<<

   v3 fixes:
   - interstitial double-tap guard (intBusy), 3 min gap sirf successful ad par
   - cb() crash hone par doosra ad nahi chalta
   - rewarded ad par timeout (loading box atkega nahi)
   - user ad skip kare to fallback ad nahi chalta
   - Task widget listeners document par (re-render safe)
   - Monetag load fail cache nahi hota, SDK host whitelist
   - wrappers return value / saare arguments pass karte hain
   - demo ad sirf tab jab explicitly 'demo' chuna ho (ya DEBUG)
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
  /* Monetag SDK sirf in hosts se load hoga. Monetag naya host de to yahan add karo. */
  const SDK_HOSTS = ['libtl.com'];
  const REWARD_TIMEOUT = 120000;    /* rewarded ad ke liye max wait */
  const INT_TIMEOUT = 45000;        /* interstitial atak jaye to aage badho */

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
  const hostOk = src => {
    try { return SDK_HOSTS.indexOf(new URL(src.indexOf('//') === 0 ? 'https:' + src : src).hostname) !== -1; }
    catch (e) { return false; }
  };
  addScript('https://telegram.org/js/telegram-web-app.js');
  addScript('https://sad.adsgram.ai/js/sad.min.js').then(ok => { if (!ok) dbg('Adsgram SDK load nahi hua'); });

  const MZ = {};
  function ensureMonetag(zoneOverride) {
    const c = cfg(), z = String(zoneOverride || c.monetagZone), fn = 'show_' + z;
    if (window[fn]) return Promise.resolve(window[fn]);
    if (!hostOk(c.monetagSdk)) { dbg('Monetag SDK host allowed nahi: ' + c.monetagSdk); return Promise.resolve(undefined); }
    if (!MZ[z]) MZ[z] = addScript(c.monetagSdk, { 'data-zone': z, 'data-sdk': fn }).then(() => new Promise(r => {
      let n = 0;
      const t = setInterval(() => {
        if (window[fn] || ++n > 30) {
          clearInterval(t);
          if (!window[fn]) delete MZ[z];      /* fail hua to cache mat karo, agli baar retry */
          r(window[fn]);
        }
      }, 100);
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
          .then(r => {
            if (r && r.done === false) { const e = new Error('skipped'); e.skipped = true; return rej(e); }
            res(r);
          }).catch(rej);
      } catch (e) { rej(e); }
    });
  }

  /* ---- providers: resolve = user ne ad dekha, reject = nahi mila / skip ---- */
  const run = {
    demo: () => new Promise(res => _demo(res)),
    adsgram: b => agShow(b || cfg().adsgramBlock),
    monetag: b => ensureMonetag(b).then(fn => {
      if (!fn) throw new Error('Monetag SDK not loaded');
      return fn();
    })
  };

  /* ---- Rewarded ad (Watch Ad tasks) ---- */
  const _demo = showRewardedAd;     /* purana 3 second wala demo ad */

  /* ---- kis task card ka ad hai: admin ke Tasks page se (Ad network + Ad Block ID) ---- */
  let AD_CTX = null;
  const taskRow = id => {
    const t = (window.RC && window.RC.tasks) || [];
    return (Array.isArray(t) ? t : Object.values(t)).filter(Boolean).find(r => r.id === id);
  };
  const _w = watchAd;
  watchAd = function (id, ...rest) {
    AD_CTX = id;
    try { return _w.call(this, id, ...rest); } finally { AD_CTX = null; }
  };
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
    const row = AD_CTX ? taskRow(AD_CTX) : null; AD_CTX = null;
    const cand = [
      { p: (row && row.adNet) || c.provider, b: String((row && row.adBlock) || '').trim() },   /* card ki apni setting */
      { p: c.fallback, b: '' }                                                                /* global fallback */
    ];
    const order = cand.filter((x, i, a) => x.p && x.p !== 'none' && run[x.p] && a.findIndex(y => y.p === x.p && y.b === x.b) === i);
    if (!order.length) {
      if (DEBUG) order.push({ p: 'demo', b: '' });
      else { toast('Ad not available right now. Try again later'); return; }
    }
    let finished = 0;
    loadingBox(true);
    (function next(i) {
      if (finished) return;
      if (i >= order.length) { loadingBox(false); toast('Ad not available right now. Try again later'); return; }
      let settled = 0, tm = 0;
      const ok = () => {
        if (settled) return; settled = 1; clearTimeout(tm);
        if (finished) return; finished = 1;
        loadingBox(false);
        cb();                                   /* reward sirf yahan */
      };
      const fail = e => {
        if (settled) return; settled = 1; clearTimeout(tm);
        if (finished) return;
        dbg('Rewarded ' + order[i].p + ' ' + order[i].b + ' failed: ' + errTxt(e));
        if (e && e.skipped) { loadingBox(false); toast('Ad skipped. No reward'); return; }   /* skip par fallback nahi */
        next(i + 1);
      };
      tm = setTimeout(() => fail(new Error('timeout')), REWARD_TIMEOUT);
      let p;
      try { p = run[order[i].p](order[i].b); } catch (e) { fail(e); return; }
      Promise.resolve(p).then(ok, fail);        /* cb() crash hua to fallback ad nahi chalega */
    })(0);
  };

  /* ---- Interstitial: result screen ke buttons par ---- */
  let lastInt = 0, intBusy = false;
  function interstitial(then) {
    const c = cfg();
    if (!c.enabled) { then(); return; }
    if (intBusy) return;                                              /* double-tap: ignore */
    if (Date.now() - lastInt < c.intGapMs) { dbg('Interstitial skip: 3 min ka gap'); then(); return; }
    if (!inTg() || !window.Adsgram) { dbg('Interstitial skip: Telegram/Adsgram nahi mila'); then(); return; }
    intBusy = true;
    let d = 0, tm = 0;
    const go2 = () => { if (d) return; d = 1; clearTimeout(tm); intBusy = false; then(); };
    agShow(c.adsgramInt)
      .then(() => { lastInt = Date.now(); go2(); })                   /* gap sirf success par */
      .catch(e => { dbg('Interstitial failed: ' + errTxt(e)); go2(); });
    tm = setTimeout(go2, INT_TIMEOUT);                                /* kuch atak jaye to bhi aage badho */
  }
  const _ra = resAgain, _rh = resHome;
  resAgain = function (...a) { if (RES.busy) return; interstitial(() => _ra.apply(this, a)); };
  resHome = function (...a) { if (RES.busy) return; interstitial(() => _rh.apply(this, a)); };

  /* ---- Adsgram Task widget (Tasks page) ---- */
  (() => {
    const css = '.ag-w{margin:calc(14*var(--u)) 0 0;padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(224,206,255,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.8);display:flex;align-items:center;gap:calc(8*var(--u));font-weight:700;color:#3a1590;font-size:calc(13*var(--u))}.ag-w adsgram-task{display:flex;flex:1;align-items:center;justify-content:space-between;gap:8px}.ag-b{padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#4aa0ff,#0a50d8);color:#fff;font-weight:800}.ag-b.c{background:linear-gradient(180deg,#7dec3a,#2fb312)}.ag-b.d{background:#bcb6d8}.ag-r{font-weight:800;color:#6a2fe0}';
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const o = V.tasks;
    V.tasks = function (...a) {
      const html = o.apply(this, a); if (!inTg() || !cfg().enabled) return html;
      const c = cfg(), done = TK && TK.c && TK.c.ag;
      const box = done ? '<div class="ag-w">✓ Sponsored task done</div>'
        : `<div class="ag-w"><span class="ag-lbl">Sponsored Task</span><adsgram-task data-block-id="${c.adsgramTask}" data-debug="${DEBUG}">
<span slot="reward" class="ag-r">+${c.taskReward} 💎</span><div slot="button" class="ag-b">Go</div><div slot="claim" class="ag-b c">Claim</div><div slot="done" class="ag-b d">Done</div></adsgram-task></div>`;
      const mark = '<div class="tk-bonus">';
      if (html.indexOf(mark) === -1) { dbg('tk-bonus div nahi mila, Sponsored Task nahi dikhega'); return html; }
      return html.replace(mark, () => box + mark);
    };

    const giveReward = el => {
      TK = TK0(); if (TK.c.ag) return; TK.c.ag = 1; tkSave();
      rewardFx(el, { g: num2(cfg().taskReward) }, () => go('tasks'));
    };

    /* document par capture listener: Tasks page kitni baar bhi re-render ho, kaam karta rahega */
    const isTask = e => e.target && e.target.tagName === 'ADSGRAM-TASK';
    ['reward', 'onReward'].forEach(t =>
      document.addEventListener(t, e => { if (isTask(e)) giveReward(e.target); }, true));
    ['onBannerNotFound', 'onError'].forEach(t =>
      document.addEventListener(t, e => {
        if (!isTask(e)) return;
        dbg('Task widget: ' + e.type + ' ' + errTxt(e.detail));
        const w = e.target.closest('.ag-w'); if (w) w.style.display = 'none';   /* task nahi mila to khali card mat dikhao */
      }, true));

    const _g = go;
    go = function (v, ...rest) {
      const r = _g.call(this, v, ...rest);
      if (v === 'tasks') setTimeout(() => {
        if (document.querySelector('adsgram-task') && (!window.customElements || !customElements.get('adsgram-task')))
          dbg('adsgram-task element define nahi hua (SDK/Telegram check karo)');
      }, 0);
      return r;
    };
  })();
})();
