/* =====================================================================
   private_pl.js  —  Ludo Masters
   Pehli baar game khelne par: Profile  ->  Age  ->  Privacy tick  ->  Confirm
   Telegram SDK se naam + profile photo auto-fill.

   index.html me (refer_fix.js ke baad, boot() se pehle):
     <script src="private_pl.js"></script>

   (Telegram SDK ye file khud load kar leti hai. Chaho to <head> me bhi daal do:
     <script src="https://telegram.org/js/telegram-web-app.js"></script>)

   GAME GATE:
   - Default: jis bhi button ke onclick me play/startGame/joinGame... jaisa call ho,
     wo pehli baar rok kar ye popup dikhata hai, confirm hone par wahi click chal jaata hai.
   - Apna exact function naam ho to:  window.PV_GATE_RE = /startLudo\(|playBot\(/;
   - Ya seedha code me:  pvGate(() => startLudo());

   Firebase:  users ke andar dbSet('priv', {...})   (age, name, photo, tg id, ts, version)
   ===================================================================== */
(() => {
  const POLICY_URL = 'https://atomix-privacy-policy.vercel.app/';
  const VER = 1, LS = 'lm_priv_v' + VER;
  const PV = { ok: false, bypass: 0, step: 0, name: '', age: '', c1: 0, c2: 0, cb: null, photo: '', tgId: 0, busy: 0 };
  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- Telegram SDK ---------- */
  function loadSdk() {
    return new Promise(res => {
      if (window.Telegram && Telegram.WebApp) return res();
      const s = document.createElement('script');
      s.src = 'https://telegram.org/js/telegram-web-app.js';
      s.onload = () => res(); s.onerror = () => res();
      document.head.appendChild(s);
      setTimeout(res, 3500);
    });
  }
  const tgUser = () => {
    const tg = window.Telegram && Telegram.WebApp;
    return (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
  };
  function tgInfo() {
    const u = tgUser();
    if (!u) return { name: '', photo: '', id: 0 };
    const nm = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || '';
    return { name: nm.slice(0, 16), photo: u.photo_url || '', id: u.id || 0 };
  }
  function syncTg() {
    const t = tgInfo();
    if (t.photo) PV.photo = t.photo;
    if (t.id) PV.tgId = t.id;
    if (!PV.name && t.name) PV.name = t.name;
    try { if (window.PROF && t.photo) PROF.photo = t.photo; } catch (e) { }
  }

  /* ---------- state ---------- */
  function readLs() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function isDone() {
    if (PV.ok) return true;
    const l = readLs();
    if (l && l.ok) { PV.ok = true; return true; }
    try { if (window.ST && Number(ST.played) > 0) return true; } catch (e) { }   /* purane players ko rokna nahi */
    return false;
  }
  try {
    const o = applyRemote;
    applyRemote = function (v, first) {
      o(v, first);
      if (v && v.priv && v.priv.ok) { PV.ok = true; try { localStorage.setItem(LS, JSON.stringify(v.priv)); } catch (e) { } }
    };
  } catch (e) { }

  /* ---------- avatar helpers (apne profile me bhi use kar sakte ho) ---------- */
  const initial = n => E((String(n || PV.name || 'P').trim()[0] || 'P').toUpperCase());
  function avatar(sz) {
    const s = sz || 64;
    return PV.photo
      ? `<img class="pv-ph" src="${E(PV.photo)}" width="${s}" height="${s}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;pv-ph pv-in&quot; style=&quot;width:${s}px;height:${s}px&quot;>${initial()}</span>'">`
      : `<span class="pv-ph pv-in" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .45)}px">${initial()}</span>`;
  }
  window.pvAvatar = avatar;
  try {                                   /* A('tgme', ...) = apna Telegram photo */
    const oA = A;
    A = function (n, e, w, h) { if (n === 'tgme') return avatar(w || 40); return oA.apply(this, arguments); };
  } catch (e) { /* A const hai to skip — pvAvatar() direct use karo */ }

  /* ---------- UI ---------- */
  const AGES = [['18-24', '18 – 24'], ['25-34', '25 – 34'], ['35-44', '35 – 44'], ['45+', '45+'], ['u18', 'Under 18']];
  const POLICY = `<b>What we store</b><br>Your Telegram name and photo, display name, age group, balances, game stats, withdrawal details (UPI ID) and referral records.<br><br>
<b>How we use it</b><br>To run the game, credit rewards, process withdrawals, prevent fraud and improve the app. We never sell your data.<br><br>
<b>Fair play</b><br>Cheating, fake accounts, automation and referral abuse can lead to a ban and loss of balance.<br><br>
<b>Rewards &amp; withdrawals</b><br>Only Rupees can be withdrawn above the minimum shown in the Wallet. Withdrawals are reviewed manually. Diamonds have no cash value.<br><br>
<b>Age</b><br>You must be 18 or older to play.<br><br>
<b>Your choices</b><br>You can edit your name in Profile. To delete your data, contact support.`;

  function build() {
    const t = tgInfo();
    return `<div class="pv-bk"></div>
<div class="pv-cd"><i class="pv-glow"></i>
<div class="pv-hd"><div class="pv-dots"><i></i><i></i><i></i></div><button class="pv-x" onclick="pvClose()" aria-label="Close">✕</button></div>
<div class="pv-vw"><div class="pv-tr" id="pvTr">
 <section class="pv-p">
  <h2>Create your profile</h2><p class="pv-s">Welcome to Ludo Masters 🎲</p>
  <div class="pv-av"><i class="pv-ring"></i><i class="pv-ring r2"></i><span id="pvAv">${avatar(92)}</span>${t.id ? '<b class="pv-vf">✓ Telegram</b>' : ''}</div>
  <label class="pv-l">Display name</label>
  <input id="pvNm" class="pv-in2" maxlength="16" autocomplete="off" placeholder="Enter your name" value="${E(PV.name)}" oninput="pvName(this.value)">
  <small class="pv-h">${t.id ? 'Synced from your Telegram account. You can edit it.' : 'Choose the name other players will see.'}</small>
 </section>
 <section class="pv-p">
  <h2>How old are you?</h2><p class="pv-s">You must be 18+ to play for real rewards</p>
  <div class="pv-ages">${AGES.map(a => `<button class="pv-ag${a[0] === 'u18' ? ' u' : ''}" data-a="${a[0]}" onclick="pvAge('${a[0]}')"><span>${a[1]}</span></button>`).join('')}</div>
  <div class="pv-warn" id="pvWarn">Sorry, this game is only for players aged 18 and above.</div>
 </section>
 <section class="pv-p">
  <h2>Privacy &amp; Terms</h2><p class="pv-s">Please read and accept to continue</p>
  <div class="pv-pol">${POLICY}</div>
  <div class="pv-ck" id="pvC1" onclick="pvChk(1)"><span class="pv-bx"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span>I have read and accept the <a class="pv-lk" href="${POLICY_URL}" onclick="return pvPolicy(event)">Privacy Policy</a></span></div>
  <div class="pv-ck" id="pvC2" onclick="pvChk(2)"><span class="pv-bx"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span>I confirm I am <b>18+</b> and agree to the <b>Terms &amp; Conditions</b></span></div>
 </section>
</div></div>
<div class="pv-ft"><button class="pv-bk2" id="pvBack" onclick="pvBack()">Back</button><button class="pv-nx" id="pvNext" onclick="pvNext()">Next</button></div>
</div>`;
  }

  function mount() {
    let o = $('pv');
    if (o) o.remove();
    o = document.createElement('div'); o.id = 'pv'; o.className = 'pv';
    o.innerHTML = build();
    (document.getElementById('app') || document.body).appendChild(o);
    return o;
  }
  function upd() {
    const tr = $('pvTr'); if (!tr) return;
    tr.style.transform = 'translateX(' + (-PV.step * 100) + '%)';
    document.querySelectorAll('#pv .pv-dots i').forEach((d, i) => d.className = i < PV.step ? 'done' : i === PV.step ? 'on' : '');
    document.querySelectorAll('#pv .pv-p').forEach((p, i) => p.classList.toggle('act', i === PV.step));
    $('pvBack').style.visibility = PV.step ? 'visible' : 'hidden';
    const nx = $('pvNext');
    nx.textContent = PV.step === 2 ? 'Confirm & Play' : 'Next';
    const okv = PV.step === 0 ? PV.name.trim().length >= 2
      : PV.step === 1 ? !!PV.age && PV.age !== 'u18'
        : PV.c1 && PV.c2;
    nx.disabled = !okv; nx.classList.toggle('rdy', !!okv);
    $('pvWarn').classList.toggle('show', PV.age === 'u18');
    document.querySelectorAll('#pv .pv-ag').forEach(b => b.classList.toggle('on', b.dataset.a === PV.age));
    $('pvC1').classList.toggle('on', !!PV.c1); $('pvC2').classList.toggle('on', !!PV.c2);
  }

  window.pvPolicy = e => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    try {
      const tg = window.Telegram && Telegram.WebApp;
      if (tg && tg.openLink) tg.openLink(POLICY_URL); else window.open(POLICY_URL, '_blank', 'noopener');
    } catch (x) { window.open(POLICY_URL, '_blank', 'noopener'); }
    return false;
  };
  window.pvName = v => { PV.name = String(v || '').slice(0, 16); const a = $('pvAv'); if (a && !PV.photo) a.innerHTML = avatar(92); upd(); };
  window.pvAge = a => { PV.age = a; upd(); };
  window.pvChk = i => { PV['c' + i] = PV['c' + i] ? 0 : 1; upd(); };
  window.pvBack = () => { if (PV.step > 0) { PV.step--; upd(); } };
  window.pvNext = () => {
    const nx = $('pvNext'); if (nx.disabled) return;
    if (PV.step < 2) { PV.step++; upd(); } else confirmAll();
  };
  window.pvClose = () => {
    const o = $('pv'); if (!o || PV.busy) return;
    o.classList.add('out'); setTimeout(() => o.remove(), 320); PV.cb = null;
  };

  async function confirmAll() {
    if (PV.busy) return; PV.busy = 1;
    const name = PV.name.trim().slice(0, 16);
    const obj = { ok: 1, v: VER, age: PV.age, name, photo: PV.photo || '', tg: PV.tgId || 0, ts: Date.now() };
    PV.ok = true;
    try { localStorage.setItem(LS, JSON.stringify(obj)); } catch (e) { }
    try { if (typeof dbSet === 'function') dbSet('priv', obj); } catch (e) { }
    try { if (window.PROF) { PROF.name = name; if (PV.photo) PROF.photo = PV.photo; } } catch (e) { }
    try { if (typeof saveProf === 'function') saveProf(); } catch (e) { }
    try { if (typeof refreshBal === 'function') refreshBal(); } catch (e) { }
    const cd = document.querySelector('#pv .pv-cd');
    cd.innerHTML = `<i class="pv-glow"></i><div class="pv-done"><div class="pv-ok"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></div>
<div class="pv-dav">${avatar(70)}</div><h2>You're all set, ${E(name)}!</h2><p class="pv-s">Let the game begin 🎲</p></div>${confetti()}`;
    try { Telegram.WebApp.HapticFeedback.notificationOccurred('success'); } catch (e) { }
    await sleep(1700);
    const o = $('pv'); if (o) { o.classList.add('out'); await sleep(320); o.remove(); }
    PV.busy = 0;
    const cb = PV.cb; PV.cb = null;
    if (cb) { PV.bypass = 1; try { cb(); } finally { PV.bypass = 0; } }
  }
  function confetti() {
    const c = ['#ffd21f', '#ff5a8a', '#58c8ff', '#7dec3a', '#a478ff', '#ffa43a'];
    return '<div class="pv-cf">' + Array.from({ length: 26 }, (_, i) =>
      `<i style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(Math.random() * .5).toFixed(2)}s;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--c:${c[i % c.length]}"></i>`).join('') + '</div>';
  }

  /* ---------- gate ---------- */
  function openGate(cb) {
    syncTg();
    PV.step = 0; PV.age = ''; PV.c1 = 0; PV.c2 = 0; PV.cb = cb || null; PV.busy = 0;
    mount(); upd();
    requestAnimationFrame(() => $('pv') && $('pv').classList.add('in'));
    try { Telegram.WebApp.HapticFeedback.impactOccurred('light'); } catch (e) { }
  }
  window.pvGate = function (cb) {
    if (isDone()) { if (cb) cb(); return true; }
    openGate(cb); return false;
  };
  window.pvIsDone = isDone;

  window.PV_GATE_RE = window.PV_GATE_RE || /(^|[^A-Za-z0-9_])(play|start|join|enter|quick|vs)[A-Za-z0-9_]*(game|match|ludo|bot|pool|room|now)?[A-Za-z0-9_]*\s*\(/i;
  const SKIP = /(display|replay|payout|toast|go\(|refer|invite|share|copy|claim|menu|profile|wallet|withdraw|tab|close|sheet|setting)/i;
  document.addEventListener('click', e => {
    if (PV.bypass || isDone()) return;
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('#pv')) return;
    const el = t.closest('[onclick]'); if (!el) return;
    const code = el.getAttribute('onclick') || '';
    if (!window.PV_GATE_RE.test(code) || SKIP.test(code)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    openGate(() => { el.click(); });
  }, true);

  function wrapFns() {
    ['startGame', 'playNow', 'startMatch', 'playGame', 'quickPlay', 'joinGame', 'startLudo', 'playBot'].forEach(n => {
      const f = window[n];
      if (typeof f !== 'function' || f.__pv) return;
      const w = function () { if (isDone() || PV.bypass) return f.apply(this, arguments); const a = arguments, th = this; openGate(() => f.apply(th, a)); };
      w.__pv = 1; try { window[n] = w; } catch (e) { }
    });
  }

  /* ---------- init ---------- */
  loadSdk().then(() => {
    try { const tg = Telegram.WebApp; tg.ready(); tg.expand(); } catch (e) { }
    syncTg(); wrapFns(); setTimeout(wrapFns, 1500);
  });

  /* ---------- CSS ---------- */
  const css = `
.pv{--k:var(--u,1px);position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;font-family:Poppins,system-ui,sans-serif;color:#fff}
.pv-bk{position:absolute;inset:0;background:rgba(10,4,40,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .35s}
.pv.in .pv-bk{opacity:1}.pv.out .pv-bk{opacity:0}
.pv-cd{position:relative;overflow:hidden;width:100%;max-width:calc(480*var(--k));max-height:94%;display:flex;flex-direction:column;border-radius:calc(30*var(--k)) calc(30*var(--k)) 0 0;padding:calc(16*var(--k)) calc(18*var(--k)) calc(20*var(--k));background:linear-gradient(180deg,#3a1fb0,#1a0a62 70%,#140850);border:calc(3*var(--k)) solid #f0b43a;border-bottom:0;box-shadow:0 calc(-8*var(--k)) calc(40*var(--k)) rgba(120,80,255,.55);transform:translateY(105%);transition:transform .55s cubic-bezier(.2,1.1,.3,1)}
.pv.in .pv-cd{transform:none}.pv.out .pv-cd{transform:translateY(105%);transition:transform .3s ease-in}
.pv-glow{position:absolute;left:-40%;top:0;width:50%;height:100%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.14),transparent);transform:skewX(-20deg);animation:pvShine 4s ease-in-out infinite}
.pv-hd{position:relative;display:flex;align-items:center;justify-content:space-between;margin-bottom:calc(6*var(--k))}
.pv-dots{display:flex;gap:calc(7*var(--k));margin:0 auto}
.pv-dots i{display:block;width:calc(26*var(--k));height:calc(6*var(--k));border-radius:calc(6*var(--k));background:rgba(255,255,255,.25);transition:all .35s}
.pv-dots i.on{background:#ffd21f;width:calc(40*var(--k));box-shadow:0 0 calc(8*var(--k)) rgba(255,210,31,.8)}.pv-dots i.done{background:#7dec3a}
.pv-x{position:absolute;right:0;top:calc(-4*var(--k));width:calc(30*var(--k));height:calc(30*var(--k));border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:calc(14*var(--k));cursor:pointer}
.pv-vw{position:relative;overflow:hidden;flex:1;min-height:0}
.pv-tr{display:flex;transition:transform .5s cubic-bezier(.3,.9,.3,1)}
.pv-p{flex:0 0 100%;min-width:0;padding:calc(4*var(--k)) calc(2*var(--k));text-align:center;opacity:0;transform:translateX(calc(30*var(--k)));transition:opacity .45s .12s,transform .45s .12s}
.pv-p.act{opacity:1;transform:none}
.pv-p h2{font-size:calc(22*var(--k));font-weight:800;color:#ffd21f;text-shadow:0 calc(2*var(--k)) 0 #7a3a00}
.pv-s{margin:calc(2*var(--k)) 0 calc(10*var(--k));font-size:calc(12.5*var(--k));font-weight:600;color:#d9ccff}
.pv-av{position:relative;display:grid;place-items:center;width:calc(124*var(--k));height:calc(124*var(--k));margin:calc(6*var(--k)) auto calc(12*var(--k))}
.pv-av>span{position:relative;z-index:2;display:block;animation:pvPop .7s cubic-bezier(.2,1.4,.4,1) both}
.pv-ph{display:block;border-radius:50%;object-fit:cover;border:calc(3*var(--k)) solid #ffd21f;background:#3a1a9a}
.pv-in{display:grid!important;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#8b5cf6,#4a1fc0)}
.pv-ring{position:absolute;inset:0;border-radius:50%;border:calc(2.5*var(--k)) solid rgba(255,210,31,.7);animation:pvRing 2.4s ease-out infinite}.pv-ring.r2{animation-delay:1.2s}
.pv-vf{position:absolute;z-index:3;bottom:calc(2*var(--k));left:50%;transform:translateX(-50%);white-space:nowrap;padding:calc(2*var(--k)) calc(10*var(--k));border-radius:calc(12*var(--k));background:linear-gradient(180deg,#4ab4ff,#1a78d8);border:calc(1.5*var(--k)) solid #fff;font-size:calc(10.5*var(--k))}
.pv-l{display:block;text-align:left;margin:0 calc(4*var(--k)) calc(4*var(--k));font-size:calc(12*var(--k));font-weight:700;color:#d9ccff}
.pv-in2{width:100%;box-sizing:border-box;border-radius:calc(16*var(--k));border:calc(2*var(--k)) solid #8a5cff;background:#1a0a5c;color:#fff;padding:calc(12*var(--k)) calc(16*var(--k));font:700 calc(16*var(--k)) Poppins,sans-serif;outline:0;transition:border-color .2s,box-shadow .2s}
.pv-in2:focus{border-color:#ffd21f;box-shadow:0 0 calc(10*var(--k)) rgba(255,210,31,.5)}
.pv-h{display:block;margin-top:calc(6*var(--k));font-size:calc(11*var(--k));color:#bba9f5}
.pv-ages{display:grid;grid-template-columns:1fr 1fr;gap:calc(10*var(--k));margin-top:calc(4*var(--k))}
.pv-ag{padding:calc(14*var(--k)) 0;border-radius:calc(18*var(--k));border:calc(2.5*var(--k)) solid #6a4ae0;background:linear-gradient(180deg,#3a1fb8,#220e66);color:#fff;font:800 calc(16*var(--k)) Poppins,sans-serif;cursor:pointer;transition:transform .2s,background .25s,border-color .25s}
.pv-ag:active{transform:scale(.95)}
.pv-ag.on{background:linear-gradient(180deg,#ffd84a,#f09a10);color:#4a2400;border-color:#fff0a0;transform:scale(1.04);box-shadow:0 0 calc(14*var(--k)) rgba(255,200,60,.7)}
.pv-ag.u.on{background:linear-gradient(180deg,#ff6a6a,#d02020);color:#fff;box-shadow:0 0 calc(14*var(--k)) rgba(255,80,80,.7)}
.pv-ag:last-child{grid-column:1/-1}
.pv-warn{max-height:0;overflow:hidden;opacity:0;margin-top:0;font-size:calc(12*var(--k));font-weight:700;color:#ffb0b0;transition:all .35s}
.pv-warn.show{max-height:calc(60*var(--k));opacity:1;margin-top:calc(12*var(--k))}
.pv-pol{height:calc(170*var(--k));overflow-y:auto;text-align:left;padding:calc(12*var(--k)) calc(14*var(--k));border-radius:calc(16*var(--k));background:rgba(255,255,255,.95);color:#2a1b5e;font-size:calc(11.5*var(--k));line-height:1.45;-webkit-overflow-scrolling:touch}
.pv-pol b{color:#4a1fb0}
.pv-ck{display:flex;align-items:center;gap:calc(10*var(--k));margin-top:calc(10*var(--k));padding:calc(10*var(--k)) calc(12*var(--k));border-radius:calc(16*var(--k));background:rgba(255,255,255,.1);border:calc(2*var(--k)) solid rgba(160,120,255,.5);text-align:left;font-size:calc(12*var(--k));font-weight:600;line-height:1.3;cursor:pointer;transition:all .25s}
.pv-ck.on{background:rgba(125,236,58,.18);border-color:#7dec3a}
.pv-lk{color:#6fc3ff;font-weight:800;text-decoration:underline;text-underline-offset:calc(2*var(--k));text-decoration-thickness:calc(1.5*var(--k))}
.pv-lk:active{color:#ffd21f}
.pv-bx{flex:none;display:grid;place-items:center;width:calc(26*var(--k));height:calc(26*var(--k));border-radius:calc(8*var(--k));border:calc(2.5*var(--k)) solid #bba9f5;background:#1a0a5c;transition:all .25s}
.pv-bx svg{width:calc(18*var(--k));height:calc(18*var(--k));fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24;transition:stroke-dashoffset .35s .05s}
.pv-ck.on .pv-bx{background:linear-gradient(180deg,#8cf53a,#1fb010);border-color:#fff}
.pv-ck.on .pv-bx svg{stroke-dashoffset:0}
.pv-ft{display:flex;gap:calc(10*var(--k));margin-top:calc(14*var(--k))}
.pv-bk2{flex:none;padding:0 calc(20*var(--k));height:calc(50*var(--k));border-radius:calc(26*var(--k));border:calc(2*var(--k)) solid #8a5cff;background:transparent;color:#fff;font:800 calc(15*var(--k)) Poppins,sans-serif;cursor:pointer}
.pv-nx{flex:1;height:calc(50*var(--k));border-radius:calc(26*var(--k));border:calc(3*var(--k)) solid #ffd84a;background:linear-gradient(180deg,#8cf53a,#1fb010);color:#fff;font:800 calc(17*var(--k)) Poppins,sans-serif;text-shadow:0 calc(2*var(--k)) calc(3*var(--k)) rgba(0,70,0,.55);cursor:pointer;transition:filter .3s,transform .15s}
.pv-nx:active{transform:scale(.97)}
.pv-nx:disabled{filter:grayscale(.9) brightness(.8);cursor:not-allowed}
.pv-nx.rdy{animation:pvGlow 1.8s ease-in-out infinite}
.pv-done{text-align:center;padding:calc(18*var(--k)) 0 calc(10*var(--k))}
.pv-ok{width:calc(84*var(--k));height:calc(84*var(--k));margin:0 auto calc(8*var(--k))}
.pv-ok svg{width:100%;height:100%;fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}
.pv-ok circle{stroke:#7dec3a;stroke-dasharray:152;stroke-dashoffset:152;animation:pvDraw .6s ease forwards}
.pv-ok path{stroke:#fff;stroke-dasharray:40;stroke-dashoffset:40;animation:pvDraw .4s .5s ease forwards}
.pv-dav{margin:calc(6*var(--k)) 0;animation:pvPop .6s .3s cubic-bezier(.2,1.4,.4,1) both}
.pv-dav .pv-ph{display:inline-block}
.pv-done h2{font-size:calc(20*var(--k));font-weight:800;color:#ffd21f}
.pv-cf{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.pv-cf i{position:absolute;top:-10px;left:var(--x);width:calc(9*var(--k));height:calc(14*var(--k));background:var(--c);border-radius:2px;animation:pvFall 1.6s var(--d) ease-in forwards}
@keyframes pvShine{0%{left:-50%}60%,100%{left:130%}}
@keyframes pvPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
@keyframes pvRing{0%{transform:scale(.8);opacity:.9}100%{transform:scale(1.35);opacity:0}}
@keyframes pvGlow{0%,100%{box-shadow:0 0 0 0 rgba(125,255,60,.6)}50%{box-shadow:0 0 calc(18*var(--k)) calc(4*var(--k)) rgba(125,255,60,.5)}}
@keyframes pvDraw{to{stroke-dashoffset:0}}
@keyframes pvFall{to{transform:translateY(calc(520*var(--k))) rotate(var(--r));opacity:.9}}
@media (prefers-reduced-motion:reduce){.pv *{animation:none!important;transition:none!important}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
