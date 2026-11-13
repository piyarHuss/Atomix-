/* =====================================================================
   ads.js  v5  —  Ludo Masters  (Adsgram + Monetag)
   Load order (index.html):
     profile_plus.js  ->  remote_config.js  ->  ads.js  ->  boot();

   v5 (sab kuch admin panel se control):
   - Watch Ad (rewarded) : card ka apna block  ->  admin ka Primary block (default int-59518)
                           ->  Fallback block (default Monetag zone)
                           int-59518 ab SIRF yahin (Watch Ad me) chalta hai.
                           Result screen par ab koi interstitial nahi.
   - Ad ke baad cooldown : admin me set (default 20 sec). Cooldown me dobara ad nahi,
                           neeche "Next ad in Xs" timer dikhta hai.
   - Daily ad limit      : admin me set (0 = unlimited)
   - Adsgram Task widget : task-59520, har N minute me dobara aata hai (default 5 min).
                           Claim ke baad "Next in mm:ss" countdown, khatam hote hi widget wapas.
   - Daily task limit    : admin me set (0 = unlimited)

   RC.ads se ye fields aate hain (admin panel khud bhar deta hai):
     enabled, pNet, pBlock, fNet, fBlock, taskOn, taskBlock, taskReward,
     cooldownSec, taskIntervalMin, maxAdsPerDay, maxTaskPerDay, monetagSdk
   (remote_config.js ko pura RC.ads object app tak pass karna hai.)

   NOTE: cooldown / daily limit phone ke localStorage me hain, yaani sirf soft limit.
   Real paise ke liye server-side check zaroori hai.

   >>> TEST MODE: neeche  const DEBUG = true;  karo. Live se pehle false. <<<
   ===================================================================== */
const DEBUG = false;

(() => {
  const DEF = {
    enabled: true,
    pNet: 'adsgram', pBlock: 'int-59518',      /* Watch Ad primary */
    fNet: 'monetag', fBlock: '12251773',       /* fallback */
    taskOn: true, taskBlock: 'task-59520', taskReward: 10,
    cooldownSec: 20,                           /* ek ad ke baad wait */
    taskIntervalMin: 5,                        /* task widget kitne minute baad wapas */
    maxAdsPerDay: 0,                           /* 0 = unlimited */
    maxTaskPerDay: 0,                          /* 0 = unlimited */
    monetagSdk: '//libtl.com/sdk.js'
  };
  /* Monetag SDK sirf in hosts se load hoga. */
  const SDK_HOSTS = ['libtl.com'];
  const REWARD_TIMEOUT = 120000;

  const num2 = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const cfg = () => {
    const a = (window.RC && window.RC.ads) || {};
    const o = {};
    Object.keys(DEF).forEach(k => { o[k] = (a[k] !== undefined && a[k] !== '' && a[k] !== null) ? a[k] : DEF[k]; });
    o.enabled = a.enabled !== false;
    o.taskOn = a.taskOn !== false;
    ['taskReward', 'cooldownSec', 'taskIntervalMin', 'maxAdsPerDay', 'maxTaskPerDay'].forEach(k => { o[k] = Math.max(0, num2(o[k])); });
    return o;
  };
  const inTg = () => !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
  const errTxt = e => !e ? 'unknown' : (e.description || e.message || (typeof e === 'string' ? e : JSON.stringify(e)));
  const dbg = m => { console.log('[ads]', m); if (DEBUG) toast('ADS: ' + m); };

  /* Block ID saaf: "59518" / "int-59518" / " INT-59518 " -> "int-59518" (prefix bacha rehta hai) */
  const normAny = id => {
    const s = String(id == null ? '' : id).trim().toLowerCase().replace(/\s+/g, '');
    const n = s.replace(/^\D*/, '');
    if (!n) return '';
    const p = s.indexOf('int-') === 0 ? 'int-' : s.indexOf('task-') === 0 ? 'task-' : '';
    return p + n;
  };

  /* localStorage (safe) */
  const LS = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const cntGet = p => num2(LS.get(p + dayKey()));
  const cntInc = p => LS.set(p + dayKey(), String(cntGet(p) + 1));
  const fmt = s => { s = Math.max(0, s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

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
  if (!window.Telegram) addScript('https://telegram.org/js/telegram-web-app.js');

  const agReady = window.Adsgram
    ? Promise.resolve(true)
    : addScript('https://sad.adsgram.ai/js/sad.min.js').then(ok => {
        if (!ok) dbg('Adsgram SDK load nahi hua (network / adblock check karo)');
        return ok;
      });

  const MZ = {};
  function ensureMonetag(zoneOverride) {
    const c = cfg(), z = String(zoneOverride || DEF.fBlock).replace(/\D/g, ''), fn = 'show_' + z;
    if (window[fn]) return Promise.resolve(window[fn]);
    if (!hostOk(c.monetagSdk)) { dbg('Monetag SDK host allowed nahi: ' + c.monetagSdk); return Promise.resolve(undefined); }
    if (!MZ[z]) MZ[z] = addScript(c.monetagSdk, { 'data-zone': z, 'data-sdk': fn }).then(() => new Promise(r => {
      let n = 0;
      const t = setInterval(() => {
        if (window[fn] || ++n > 30) {
          clearInterval(t);
          if (!window[fn]) delete MZ[z];
          r(window[fn]);
        }
      }, 100);
    }));
    return MZ[z];
  }

  /* ---- Adsgram: rewarded / interstitial / task sab isi se (blockId sahi prefix ke saath) ---- */
  function agShow(blockId) {
    return agReady.then(() => new Promise((res, rej) => {
      if (!window.Adsgram) return rej(new Error('Adsgram SDK not loaded'));
      if (!inTg()) return rej(new Error('Adsgram only works inside Telegram'));
      try {
        window.Adsgram.init({ blockId: String(blockId), debug: DEBUG }).show()
          .then(r => {
            if (r && r.done === false) { const e = new Error('skipped'); e.skipped = true; return rej(e); }
            res(r);
          }).catch(rej);
      } catch (e) { rej(e); }
    }));
  }

  const run = {
    demo: () => new Promise(res => _demo(res)),
    adsgram: b => agShow(normAny(b) || normAny(DEF.pBlock)),
    monetag: b => ensureMonetag(b).then(fn => {
      if (!fn) throw new Error('Monetag SDK not loaded');
      return fn();
    })
  };

  const _demo = showRewardedAd;     /* purana 3 second wala demo ad */

  /* ---- kis task card ka ad hai (admin Tasks page ka Ad block) ---- */
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

  /* ---- cooldown (ad ke baad N second wait) ---- */
  let nextAdAt = num2(LS.get('lm_ad_next')), pillT = 0;
  const cdLeft = () => Math.ceil((nextAdAt - Date.now()) / 1000);
  function cdPill() {
    clearInterval(pillT);
    let el = document.getElementById('ad-cd');
    if (cdLeft() <= 0) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'ad-cd';
      el.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:130;padding:9px 18px;border-radius:20px;background:rgba(30,20,70,.94);color:#fff;font:700 13px/1 sans-serif;border:2px solid rgba(255,255,255,.55);pointer-events:none;box-shadow:0 6px 18px rgba(0,0,0,.35)';
      document.body.appendChild(el);
    }
    const tick = () => {
      const s = cdLeft();
      if (s <= 0) { clearInterval(pillT); el.remove(); return; }
      el.textContent = '⏳ Next ad in ' + s + 's';
    };
    tick(); pillT = setInterval(tick, 250);
  }
  cdPill();

  /* ---- Rewarded ad (Watch Ad tasks) ---- */
  let adBusy = false;
  showRewardedAd = function (cb) {
    const c = cfg();
    const row = AD_CTX ? taskRow(AD_CTX) : null; AD_CTX = null;
    if (!c.enabled) { toast('Ads are turned off'); return; }
    if (adBusy) return;
    const wait = cdLeft();
    if (wait > 0) { toast('Next ad in ' + wait + 's'); cdPill(); return; }
    if (c.maxAdsPerDay > 0 && cntGet('lm_ads_') >= c.maxAdsPerDay) { toast('Daily ad limit reached. Come back tomorrow'); return; }

    const blockFor = p => p === c.pNet ? c.pBlock : p === c.fNet ? c.fBlock : '';
    const mk = (p, b) => ({ p, b: String(b || '').trim() || blockFor(p) });
    const cand = [];
    if (row && row.adNet) cand.push(mk(row.adNet, row.adBlock));   /* 1) card ka apna block */
    cand.push(mk(c.pNet, c.pBlock));                               /* 2) admin primary (int-59518) */
    cand.push(mk(c.fNet, c.fBlock));                               /* 3) fallback */
    const key = x => x.p + '|' + String(x.b).toLowerCase();
    const order = cand.filter((x, i, a) => x.p && x.p !== 'none' && run[x.p] && a.findIndex(y => key(y) === key(x)) === i);
    if (!order.length) {
      if (DEBUG) order.push({ p: 'demo', b: '' });
      else { toast('Ad not available right now. Try again later'); return; }
    }

    let finished = 0;
    adBusy = true; loadingBox(true);
    const end = () => { adBusy = false; loadingBox(false); };
    (function next(i) {
      if (finished) return;
      if (i >= order.length) { end(); toast('Ad not available right now. Try again later'); return; }
      let settled = 0, tm = 0;
      const ok = () => {
        if (settled) return; settled = 1; clearTimeout(tm);
        if (finished) return; finished = 1;
        end();
        if (c.cooldownSec > 0) {                         /* cooldown pehle, taaki cb() crash se bypass na ho */
          nextAdAt = Date.now() + c.cooldownSec * 1000;
          LS.set('lm_ad_next', String(nextAdAt));
          cdPill();
        }
        cntInc('lm_ads_');
        cb();                                            /* reward sirf yahan */
      };
      const fail = e => {
        if (settled) return; settled = 1; clearTimeout(tm);
        if (finished) return;
        dbg('Rewarded ' + order[i].p + ' ' + order[i].b + ' failed: ' + errTxt(e));
        if (e && e.skipped) { finished = 1; end(); toast('Ad skipped. No reward'); return; }   /* skip par fallback nahi */
        next(i + 1);
      };
      tm = setTimeout(() => fail(new Error('timeout')), REWARD_TIMEOUT);
      let p;
      try { p = run[order[i].p](order[i].b); } catch (e) { fail(e); return; }
      Promise.resolve(p).then(ok, fail);
    })(0);
  };

  /* ---- Adsgram Task widget (Tasks page) : har N minute me dobara ---- */
  (() => {
    const css = '.ag-w{margin:calc(14*var(--u)) 0 0;padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(224,206,255,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.8);display:flex;align-items:center;gap:calc(8*var(--u));font-weight:700;color:#3a1590;font-size:calc(13*var(--u))}.ag-w adsgram-task{display:flex;flex:1;align-items:center;justify-content:space-between;gap:8px}.ag-b{padding:calc(6*var(--u)) calc(14*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#4aa0ff,#0a50d8);color:#fff;font-weight:800}.ag-b.c{background:linear-gradient(180deg,#7dec3a,#2fb312)}.ag-b.d{background:#bcb6d8}.ag-r{font-weight:800;color:#6a2fe0}';
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    const AG_KEY = 'lm_ag_last';
    const agLast = () => num2(LS.get(AG_KEY));
    const agWait = () => Math.ceil((agLast() + cfg().taskIntervalMin * 60000 - Date.now()) / 1000);
    const agCount = () => num2(TK && TK.c && TK.c.agN);

    const o = V.tasks;
    V.tasks = function (...a) {
      const html = o.apply(this, a);
      const c = cfg();
      if (!inTg() || !c.enabled || !c.taskOn) return html;
      const block = 'task-' + String(c.taskBlock).replace(/\D/g, '');          /* hamesha task-XXXXX */
      let box;
      if (c.maxTaskPerDay > 0 && agCount() >= c.maxTaskPerDay) {
        box = '<div class="ag-w">✓ Sponsored tasks done for today</div>';
      } else if (agLast() && agWait() > 0) {
        box = `<div class="ag-w"><span class="ag-lbl">Sponsored Task</span><span class="ag-r" style="margin-left:auto">Next in <span class="ag-cd">${fmt(agWait())}</span></span></div>`;
      } else {
        box = `<div class="ag-w"><span class="ag-lbl">Sponsored Task</span><adsgram-task data-block-id="${block}" data-debug="${DEBUG}">
<span slot="reward" class="ag-r">+${c.taskReward} 💎</span><div slot="button" class="ag-b">Go</div><div slot="claim" class="ag-b c">Claim</div><div slot="done" class="ag-b d">Done</div></adsgram-task></div>`;
      }
      const mark = '<div class="tk-bonus">';
      if (html.indexOf(mark) === -1) { dbg('tk-bonus div nahi mila, Sponsored Task nahi dikhega'); return html; }
      return html.replace(mark, () => box + mark);
    };

    /* countdown ticker: khatam hote hi Tasks page dobara draw -> widget wapas */
    setInterval(() => {
      const els = document.querySelectorAll('.ag-cd');
      if (!els.length) return;
      const s = agWait();
      if (s <= 0) { go('tasks'); return; }
      els.forEach(el => { el.textContent = fmt(s); });
    }, 1000);

    let agLock = 0;
    const giveReward = el => {
      if (Date.now() - agLock < 3000) return;            /* reward + onReward dono fire ho to double na mile */
      const c = cfg();
      if (agLast() && agWait() > 0) return;
      TK = TK0();
      if (c.maxTaskPerDay > 0 && num2(TK.c.agN) >= c.maxTaskPerDay) return;
      agLock = Date.now();
      TK.c.ag = 1; TK.c.agN = num2(TK.c.agN) + 1; tkSave();
      LS.set(AG_KEY, String(Date.now()));
      rewardFx(el, { g: num2(c.taskReward) }, () => go('tasks'));
    };

    const isTask = e => e.target && e.target.tagName === 'ADSGRAM-TASK';
    ['reward', 'onReward'].forEach(t =>
      document.addEventListener(t, e => { if (isTask(e)) giveReward(e.target); }, true));
    ['onBannerNotFound', 'onError'].forEach(t =>
      document.addEventListener(t, e => {
        if (!isTask(e)) return;
        dbg('Task widget: ' + e.type + ' ' + errTxt(e.detail));
        const w = e.target.closest('.ag-w'); if (w) w.style.display = 'none';
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
