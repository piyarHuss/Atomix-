/* =====================================================================
   deposit.js  v4  —  Ludo Masters : REAL UPI deposit (MacroDroid + Firebase UTR)

   index.html me profile_plus.js ke BAAD, boot() se PEHLE (type="module" nahi):
     <script src="profile_plus.js"></script>
     <script src="deposit.js?v=4"></script>

   v4 me kya badla:
   - DEP_APP_AMT flag: UPI app buttons me amount pre-fill ON/OFF (default OFF,
     kyunki personal UPI ID par amount wale link se app "payment nahi hoga" error deta hai)
   - DEP_QR_AMT flag: QR code me amount ON/OFF
   - UTR verify: used ("false" / false / missing), amount ("₹10", "10.00") sab handle
   - Claim fail hone par asli Firebase error code dikhta hai (PERMISSION_DENIED etc.)
   - Debug: console me "DEP:" lines

   Flow:
   1. User amount chunta hai -> "Generate QR & Pay"
   2. Payment screen: QR + 10 minute countdown + PhonePe / GPay / Paytm / Other UPI
   3. Payment ke baad 12-digit UTR -> "Verify & Add Coins"
   4. Verify: bank_utrs/<utr> exist, not used, amount >= selected amount
      -> atomic claim (bank_utrs used:true + used_utrs/<utr> permanent tombstone)
      -> wallet me paisa add -> bank_utrs/<utr> DELETE
   5. Ek UTR sirf ek baar: used_utrs/<utr> kabhi delete nahi hota.
   ===================================================================== */

/* ---------- SETTINGS ---------- */
const DEP_UPI = 'mining-fathe@ptaxis';
const DEP_PN = 'Admin';
const DEP_MIN = 10;
const DEP_MAX = 50000;
const DEP_QUICK = [50, 100, 250, 500];
const DEP_TTL = 10 * 60 * 1000;           /* QR/payment window: 10 minute */
const DEP_APP_AMT = false;                /* false = app buttons amount pre-fill nahi karenge (user khud amount dalega) */
const DEP_QR_AMT = true;                  /* QR me amount rakhna hai? Agar scan par bhi error aaye to false karo */
/* ₹1 deposit par kitna milega: cash = withdrawable ₹, gems = diamonds */
const DEP_CREDIT = { cash: 1, gems: 0 };
const DEP_QR_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', 'qrcode.min.js'];

let DEP_BUSY = 0, DEP_FAILS = [], DEP_SESS = null, DEP_T = 0;
const DEP_DONE = {};
const DEP_KEY = 'dep_sess';
const depLog = (...a) => { try { console.log('DEP:', ...a); } catch (e) { } };
const depTg = () => (window.Telegram && Telegram.WebApp) || null;
const depInr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
/* Firebase / MacroDroid se aaya "used" kisi bhi form me ho sakta hai */
const depIsUsed = x => x === true || x === 'true' || x === 1 || x === '1';
/* "₹10", "Rs. 10.00", "10" -> 10 */
const depNum = x => { const n = parseFloat(String(x == null ? '' : x).replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };

/* ---------- Chrome me khulne wala redirect page (?payredir=1) ---------- */
const DEP_RD = (() => {
  try {
    const p = new URLSearchParams(location.search);
    if (p.get('payredir') !== '1') return null;
    return { am: Math.floor(Number(p.get('am'))), app: p.get('app') || 'upi' };
  } catch (e) { return null; }
})();
const DEP_PKG = { phonepe: 'com.phonepe.app', gpay: 'com.google.android.apps.nbu.paisa.user', paytm: 'net.one97.paytm' };
function depRdUrl(app, a) {
  let q = 'pa=' + encodeURIComponent(DEP_UPI) + '&pn=' + encodeURIComponent(DEP_PN) + '&cu=INR';
  if (DEP_APP_AMT) q += '&am=' + a;
  const pk = DEP_PKG[app];
  /* intent:// = Android Chrome se seedha usi app me */
  return pk ? 'intent://pay?' + q + '#Intent;scheme=upi;package=' + pk + ';end' : 'upi://pay?' + q;
}
if (DEP_RD) {
  boot = function () { };                                  /* is tab me game boot nahi karna */
  try { bgm.pause(); bgm.play = () => Promise.resolve(); } catch (e) { }
  const ok = DEP_RD.am >= 1 && DEP_RD.am <= 100000;
  const names = { phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm', upi: 'your UPI app' };
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#2a0f88,#140a52);color:#fff;font-family:Poppins,system-ui,sans-serif';
  const btn = (app, label, cls) => `<a href="${depRdUrl(app, DEP_RD.am)}" style="display:block;margin-top:10px;padding:13px;border-radius:14px;font-weight:800;font-size:15px;color:${cls ? '#4a2400' : '#fff'};text-decoration:none;background:${cls ? 'linear-gradient(180deg,#ffd84a,#ff9a14)' : 'linear-gradient(180deg,#8b4dff,#5424d0)'}">${label}</a>`;
  const hint = DEP_APP_AMT
    ? 'After paying, go back to Telegram and enter the 12-digit UTR.'
    : 'Enter <b>₹' + DEP_RD.am + '</b> in the app and pay. Then go back to Telegram and enter the 12-digit UTR.';
  o.innerHTML = ok
    ? `<div style="width:min(92vw,380px);padding:22px;border-radius:22px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);text-align:center">
<h2 style="margin:0">Pay via UPI</h2><div style="font-size:38px;font-weight:800;color:#ffd21f;margin:6px 0">₹${DEP_RD.am}</div>
<p style="margin:6px 0;font-size:13px;color:#d9c8ff;line-height:1.45">Opening ${names[DEP_RD.app] || names.upi}… ${hint}</p>
${btn('upi', 'Open any UPI app', 1)}${btn('phonepe', 'PhonePe')}${btn('gpay', 'Google Pay')}${btn('paytm', 'Paytm')}
<div style="margin-top:14px;padding:9px;border-radius:12px;background:rgba(0,0,0,.3);font-size:13px;word-break:break-all">UPI ID: <b>${DEP_UPI}</b></div></div>`
    : '<div style="text-align:center"><h2>Invalid amount</h2><p>Go back to the app and try again.</p></div>';
  document.body.appendChild(o);
  if (ok) setTimeout(() => { location.href = depRdUrl(DEP_RD.app, DEP_RD.am); }, 300);
}

/* ---------- session (10 min window) ---------- */
function depSessLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(DEP_KEY) || 'null');
    if (s && s.amt && s.start && Date.now() - s.start < DEP_TTL + 10 * 60 * 1000) return s;   /* expiry ke 10 min baad tak resume */
  } catch (e) { }
  return null;
}
function depSessSave(s) { DEP_SESS = s; try { if (s) localStorage.setItem(DEP_KEY, JSON.stringify(s)); else localStorage.removeItem(DEP_KEY); } catch (e) { } }
const depLeft = () => DEP_SESS ? Math.max(0, DEP_SESS.start + DEP_TTL - Date.now()) : 0;

/* ---------- UPI link / QR ---------- */
const depUpiUrl = a => 'upi://pay?pa=' + DEP_UPI + '&pn=' + encodeURIComponent(DEP_PN) + (DEP_QR_AMT ? '&am=' + a : '') + '&cu=INR';
/* Telegram WebView upi:// kholta nahi -> apna hi https page (?payredir=1) phone ke Chrome me khulta hai */
function depAppUrl(app, a) {
  return location.origin + location.pathname + '?payredir=1&am=' + encodeURIComponent(a) + '&app=' + encodeURIComponent(app);
}
function depOpen(url) {
  const tg = depTg();
  try { if (tg && tg.openLink) { tg.openLink(url, { try_browser: 'chrome' }); return; } }
  catch (e) { console.error('DEP: openLink failed', e); }
  try { window.open(url, '_blank'); } catch (e) { toast('Could not open. Copy the UPI ID and pay manually.'); }
}
function depLoadQr() {
  return new Promise(res => {
    if (window.QRCode) return res(true);
    let i = 0;
    const next = () => {
      if (i >= DEP_QR_LIBS.length) return res(false);
      const s = document.createElement('script');
      s.src = DEP_QR_LIBS[i++];
      s.onload = () => window.QRCode ? res(true) : next();
      s.onerror = next;
      document.head.appendChild(s);
    };
    next();
  });
}
async function depDrawQr() {
  const box = document.getElementById('dpq'); if (!box || !DEP_SESS) return;
  const ok = await depLoadQr();
  const b2 = document.getElementById('dpq'); if (!b2) return;
  if (!ok) { b2.innerHTML = '<div class="dp-qe">QR could not load.<br>Use the app buttons or UPI ID below.</div>'; return; }
  b2.innerHTML = '';
  try {
    new QRCode(b2, { text: depUpiUrl(DEP_SESS.amt), width: 190, height: 190, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch (e) { console.error('DEP: QR failed', e); b2.innerHTML = '<div class="dp-qe">QR error. Use the app buttons.</div>'; }
}
function depCopyUpi() {
  const done = () => toast('UPI ID copied ✓');
  const fb = () => {
    try { const a = document.createElement('textarea'); a.value = DEP_UPI; a.style.position = 'fixed'; a.style.opacity = 0; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }
    catch (e) { toast('Copy failed'); }
  };
  try { navigator.clipboard.writeText(DEP_UPI).then(done, fb); } catch (e) { fb(); }
}

/* ---------- STEP A: amount ---------- */
const depCheckAmt = a => a < DEP_MIN ? 'Minimum deposit is ₹' + DEP_MIN : a > DEP_MAX ? 'Maximum deposit is ₹' + DEP_MAX : '';
function depAmtStep(pre) {
  sheet(`<div class="pp-t">Add Cash</div>
<p class="pp-p">Select an amount. You will get a QR code and UPI app buttons.</p>
<label>Amount (₹)</label>
<div class="dp-chips">${DEP_QUICK.map(x => `<button type="button" onclick="depSet(${x})">₹${x}</button>`).join('')}</div>
<input id="dpa" type="number" inputmode="numeric" min="${DEP_MIN}" max="${DEP_MAX}" value="${pre}" oninput="depAmtVal()" placeholder="Min ₹${DEP_MIN}">
<div class="pp-r"><span id="dpe"></span><span></span></div>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" id="dpg" onclick="depStart()">Generate QR &amp; Pay</button></div>`);
  depAmtVal();
}
function depSet(x) { const a = document.getElementById('dpa'); if (a) { a.value = x; depAmtVal(); } }
const depAmtNow = () => Math.floor(Number((document.getElementById('dpa') || {}).value) || 0);
function depAmtVal() {
  const e = depCheckAmt(depAmtNow());
  const el = document.getElementById('dpe'), b = document.getElementById('dpg');
  if (el) el.textContent = e; if (b) b.disabled = !!e;
}
function depStart() {
  const a = depAmtNow(), e = depCheckAmt(a); if (e) { toast(e); return; }
  depSessSave({ amt: a, start: Date.now() });
  depPayStep();
}
function depBack() { depSessSave(null); depAmtStep(100); }

/* ---------- STEP B: QR + timer + app buttons + UTR ---------- */
function depPayStep() {
  if (!DEP_SESS) return depAmtStep(100);
  const a = DEP_SESS.amt;
  const apps = [['phonepe', 'PhonePe', 'ph'], ['gpay', 'Google Pay', 'gp'], ['paytm', 'Paytm', 'pt'], ['upi', 'Other UPI', 'ot']];
  const note = DEP_APP_AMT
    ? 'Scan the QR or tap an app. Amount ' + depInr(a) + ' is pre-filled.'
    : 'Scan the QR, or tap an app and pay exactly <b>' + depInr(a) + '</b> to the UPI ID below.';
  sheet(`<div class="pp-t">Pay ${depInr(a)}</div>
<div id="dpw" class="dp-w">
<div class="dp-qrw"><div id="dpq"><div class="dp-qe">Generating QR…</div></div></div>
<div class="dp-tm">Time left <b id="dpt">10:00</b></div>
<div class="dp-apps">${apps.map(x => `<button type="button" class="dp-a ${x[2]}" onclick="depApp('${x[0]}')">${x[1]}</button>`).join('')}</div>
</div>
<div id="dpx" class="dp-ex">Payment window ended. Already paid? Enter your UTR below. Otherwise tap <b>Change amount</b> for a new QR.</div>
<p class="pp-p" style="margin-top:8px">${note}</p>
<div class="dp-up">UPI ID: <b>${esc(DEP_UPI)}</b> <a onclick="depCopyUpi()">Copy</a></div>
<label>Enter UTR / Ref No. <em>(12 digits)</em></label>
<input id="dpu" type="text" inputmode="numeric" maxlength="12" placeholder="e.g. 412345678901" autocomplete="off" oninput="depVal()">
<div class="pp-r"><span id="dpe"></span><span id="dpc"></span></div>
<div id="dpr" class="dp-res"></div>
<div class="pp-bt"><button class="pp-c" onclick="depBack()">Change amount</button><button class="pp-s" id="dps" onclick="depVerify()">Verify &amp; Add Coins</button></div>`);
  depVal(); depDrawQr();
  clearInterval(DEP_T); DEP_T = setInterval(depTick, 1000); depTick();
}
function depTick() {
  const t = document.getElementById('dpt');
  if (!t || !DEP_SESS) { clearInterval(DEP_T); DEP_T = 0; return; }
  const l = depLeft(), m = Math.floor(l / 60000), s = Math.floor(l % 60000 / 1000);
  t.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (l <= 0) {
    const w = document.getElementById('dpw'), x = document.getElementById('dpx');
    if (w) w.classList.add('ex'); if (x) x.style.display = 'block';
    clearInterval(DEP_T); DEP_T = 0;
  }
}
function depApp(k) {
  if (!DEP_SESS || depLeft() <= 0) { toast('Payment window ended. Change amount to start again.'); return; }
  depOpen(depAppUrl(k, DEP_SESS.amt));
  toast(DEP_APP_AMT ? 'After payment, come back and enter the UTR' : 'Pay ' + depInr(DEP_SESS.amt) + ', then come back and enter the UTR');
}
function depVal() {
  const u = document.getElementById('dpu'), e = document.getElementById('dpe'), c = document.getElementById('dpc'), b = document.getElementById('dps');
  if (!u || !b) return;
  const clean = u.value.replace(/\D/g, '');
  if (clean !== u.value) u.value = clean;
  c.textContent = clean.length + '/12';
  e.textContent = clean.length && clean.length !== 12 ? 'UTR must be exactly 12 digits' : '';
  const rr = document.getElementById('dpr'); if (rr) { rr.className = 'dp-res'; rr.innerHTML = ''; }
  b.disabled = clean.length !== 12 || !!DEP_BUSY;
}

/* entry: store buttons / wallet button */
ppDep = function (i) {
  const s = depSessLoad();
  if (s) { DEP_SESS = s; depPayStep(); return; }          /* chalu session ho to wahi se resume */
  const pre = (typeof i === 'number' && i >= 0 && DEP_AMT[i]) ? DEP_AMT[i] : 100;
  depAmtStep(pre);
};

/* ---------- Verify + claim ---------- */
async function depVerify() {
  if (DEP_BUSY) return;
  const a = DEP_SESS ? DEP_SESS.amt : 0, u = ((document.getElementById('dpu') || {}).value || '').trim();
  const btn = document.getElementById('dps');
  const show = m => depBad('Check details', m);
  if (!a) return show('Session expired. Tap Change amount.');
  if (!/^\d{12}$/.test(u)) return show('UTR must be exactly 12 digits');
  if (!UID) return show('Please wait, account is loading…');
  const now = Date.now();
  DEP_FAILS = DEP_FAILS.filter(t => now - t < 10 * 60 * 1000);
  if (DEP_FAILS.length >= 5) return show('Too many wrong attempts. Try again after 10 minutes.');

  DEP_BUSY = 1; if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  const bad = (h, d) => { DEP_FAILS.push(Date.now()); depBad(h, d); };
  let ok = 0, bank = 0, ts = 0;
  try {
    let d = null, used = null;
    try {
      d = (await fdb.ref('bank_utrs/' + u).once('value')).val();
      used = (await fdb.ref('used_utrs/' + u).once('value')).val();
    } catch (e) {
      console.error('DEP: read failed', e.code, e.message);
      depBad('Network error', 'Could not check UTR (' + (e.code || 'unknown') + '). Try again.'); return;
    }
    depLog('utr data =', JSON.stringify(d), '| tombstone =', JSON.stringify(used));
    if (used) { bad('Wrong UTR', 'This UTR was already used.'); return; }
    if (!d) { bad('Wrong UTR', 'UTR not found. If you just paid, wait 1-2 minutes and try again.'); return; }
    if (typeof d !== 'object') { bad('Wrong UTR', 'Invalid payment record.'); return; }
    if (depIsUsed(d.used)) { bad('Wrong UTR', 'This UTR was already used.'); return; }
    bank = depNum(d.amount);
    if (!(bank > 0)) { depLog('amount parse failed, raw =', d.amount); bad('Wrong UTR', 'Invalid payment record.'); return; }
    if (bank < a) { bad('Amount too low', 'Paid ' + depInr(bank) + ' is less than the selected ' + depInr(a) + '.'); return; }

    ts = Date.now();
    dbSet('dep/' + u, { amt: bank, ts, c: 0 });         /* intent marker: beech me app band ho to recovery */
    const up = {};
    up['bank_utrs/' + u + '/used'] = true;
    up['bank_utrs/' + u + '/claimedBy'] = UID;
    up['bank_utrs/' + u + '/claimedAt'] = ts;
    up['used_utrs/' + u] = { by: UID, amt: bank, ts };   /* permanent: UTR dobara kabhi use nahi hoga */
    try { await fdb.ref().update(up); }                  /* atomic: sab ya kuch nahi */
    catch (e) {
      console.error('DEP: claim failed', e.code, e.message);
      dbSet('dep/' + u, { amt: bank, ts, c: 2 });
      const perm = e && e.code === 'PERMISSION_DENIED';
      bad(perm ? 'Claim blocked' : 'Claim failed',
        perm ? 'Firebase rules ne write block kiya (PERMISSION_DENIED). Rules check karo.' : (e.code || 'This UTR is already used or invalid.'));
      return;
    }
    ok = 1;
  } finally {
    DEP_BUSY = 0;
    if (!ok && btn) { btn.textContent = 'Verify & Add Coins'; depVal(); }
  }
  if (!ok) return;
  depLog('claimed', u, bank);
  DEP_DONE[u] = 1;
  depCredit(u, bank, ts);
  depCleanup(u);
  depSessSave(null); clearInterval(DEP_T); DEP_T = 0;
  depOk(bank);
}

/* galat UTR / error: bada red message
   NOTE: depVal() result box clear kar deta hai, isliye bad() ke baad button ko hi enable karte hain,
   input ko dobara trigger nahi karte. */
function depBad(head, detail) {
  const r = document.getElementById('dpr'), e = document.getElementById('dpe');
  if (e) e.textContent = '';
  if (r) { r.className = 'dp-res bad'; r.innerHTML = '<b>❌ ' + esc(head) + '</b><small>' + esc(detail || '') + '</small>'; }
  try { const tg = depTg(); tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error'); } catch (e2) { }
}
/* sahi UTR: Success message, phir page apne aap band */
function depOk(amt) {
  try { const tg = depTg(); tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('success'); } catch (e) { }
  sheet(`<div class="dp-ok"><div class="dp-tick">✓</div><div class="pp-t" style="margin:0">Payment Successful</div><p class="pp-p">${depInr(amt)} added to your wallet.</p></div>`);
  setTimeout(() => { const o = document.getElementById('pp-sh'); if (o && o.querySelector('.dp-ok')) closeSh(); }, 2200);
}

/* coins/wallet me paisa add */
function depCredit(u, amt, ts) {
  const cash = +(amt * DEP_CREDIT.cash).toFixed(2), gems = Math.round(amt * DEP_CREDIT.gems);
  if (cash) BAL.cash = +(BAL.cash + cash).toFixed(2);
  if (gems) BAL.gems += gems;
  saveBal(); refreshBal();
  dbSet('dep/' + u, { amt, ts: ts || Date.now(), c: 1 });
  depLog('credited', u, cash, gems);
  onDepositSuccess(amt);
}
/* coins mil gaye -> bank_utrs se UTR delete (used_utrs tombstone rehta hai) */
function depCleanup(u) {
  fdb.ref('bank_utrs/' + u).remove()
    .then(() => depLog('bank_utrs/' + u + ' deleted'))
    .catch(e => console.error('DEP: delete failed (rules check karo)', e.code, e.message));
}

/* VIP unlock + message */
onDepositSuccess = function (amount) {
  VIP = 1; dbSet('vip', 1);
  toast('✅ ' + depInr(amount) + ' added · 👑 VIP unlocked');
  try { rer(); } catch (e) { }
};

/* ---------- Recovery: claim ho gaya par credit nahi hua ---------- */
(() => {
  const o = applyRemote;
  applyRemote = function (v, first) {
    o(v, first);
    if (!first || !v || !v.dep) return;
    Object.keys(v.dep).forEach(async k => {
      const r = v.dep[k];
      if (!r || r.c !== 0 || DEP_DONE[k]) return;
      DEP_DONE[k] = 1;
      try {
        const t = (await fdb.ref('used_utrs/' + k).once('value')).val();
        if (t && t.by === UID && depNum(t.amt) === depNum(r.amt)) {
          depLog('recovering pending credit', k);
          depCredit(k, depNum(r.amt), r.ts);
          depCleanup(k);
        } else {
          dbSet('dep/' + k, { amt: r.amt, ts: r.ts, c: 2 });   /* claim hua hi nahi tha -> band */
        }
      } catch (e) { console.error('DEP: recovery failed', e); }
    });
  };
})();

/* ---------- Wallet page par "Add Cash" button ---------- */
(() => {
  const w = V.wallet;
  V.wallet = function () {
    return w().replace('<div class="pw-box">', '<button class="pp-s vipb" style="width:100%;margin:10px 0 0" onclick="ppDep(-1)">＋ Add Cash (UPI)</button><div class="pw-box">');
  };
})();

/* ---------- CSS ---------- */
(() => {
  const css = `
.dp-chips{display:flex;gap:calc(8*var(--u));margin-bottom:calc(8*var(--u))}
.dp-chips button{flex:1;height:calc(38*var(--u));border:0;border-radius:calc(12*var(--u));background:#ddd0ff;color:#5424d0;font:800 calc(13*var(--u)) Poppins,sans-serif;cursor:pointer}
.dp-qrw{display:flex;justify-content:center;margin:calc(4*var(--u)) 0 calc(8*var(--u))}
#dpq{width:calc(206*var(--u));height:calc(206*var(--u));padding:calc(8*var(--u));border-radius:calc(16*var(--u));background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 calc(4*var(--u)) calc(14*var(--u)) rgba(60,30,140,.3)}
#dpq img,#dpq canvas{max-width:100%;max-height:100%;display:block}
.dp-qe{font-size:calc(12*var(--u));color:#5b4aa0;text-align:center;font-weight:600}
.dp-tm{text-align:center;font-weight:700;font-size:calc(13*var(--u));color:#5b4aa0}
.dp-tm b{display:inline-block;min-width:calc(56*var(--u));margin-left:calc(4*var(--u));font-size:calc(20*var(--u));font-weight:800;color:#d02a2a;font-variant-numeric:tabular-nums}
.dp-apps{display:grid;grid-template-columns:1fr 1fr;gap:calc(8*var(--u));margin-top:calc(10*var(--u))}
.dp-a{height:calc(44*var(--u));border:0;border-radius:calc(14*var(--u));color:#fff;font:800 calc(14*var(--u)) Poppins,sans-serif;cursor:pointer;box-shadow:0 calc(3*var(--u)) 0 rgba(0,0,0,.22)}
.dp-a.ph{background:linear-gradient(180deg,#8a4dff,#5f259f)}
.dp-a.gp{background:linear-gradient(180deg,#4a8bff,#1a5fd8)}
.dp-a.pt{background:linear-gradient(180deg,#2bb3ff,#0a7ed8)}
.dp-a.ot{background:linear-gradient(180deg,#ffa43a,#e06a10)}
.dp-w.ex .dp-qrw,.dp-w.ex .dp-apps{opacity:.25;pointer-events:none;filter:grayscale(1)}
.dp-ex{display:none;margin-top:calc(8*var(--u));padding:calc(8*var(--u)) calc(10*var(--u));border-radius:calc(12*var(--u));background:#ffe9e9;color:#a01818;font-size:calc(12*var(--u));font-weight:600;text-align:center;line-height:1.4}
.dp-res{display:none;margin-top:calc(8*var(--u));padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));text-align:center}
.dp-res.bad{display:block;background:#ffe3e3;border:calc(2*var(--u)) solid #e04646;color:#b01212;animation:dpShake .4s}
.dp-res.bad b{display:block;font-size:calc(18*var(--u));font-weight:800}
.dp-res.bad small{display:block;margin-top:calc(2*var(--u));font-size:calc(12*var(--u));font-weight:600}
@keyframes dpShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.dp-ok{text-align:center;padding:calc(18*var(--u)) 0 calc(10*var(--u))}
.dp-tick{width:calc(76*var(--u));height:calc(76*var(--u));margin:0 auto calc(10*var(--u));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:calc(44*var(--u));font-weight:800;color:#fff;background:linear-gradient(180deg,#5fe03a,#1fa80e);box-shadow:0 0 calc(18*var(--u)) rgba(80,220,60,.6);animation:dpPop .45s cubic-bezier(.2,1.4,.4,1) both}
@keyframes dpPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
.dp-up{margin:calc(6*var(--u)) calc(4*var(--u)) 0;text-align:center;font-size:calc(12*var(--u));color:#5b4aa0}
.dp-up b{color:#3a1590}
.dp-up a{margin-left:calc(6*var(--u));color:#7a3ff0;font-weight:800;text-decoration:underline;cursor:pointer}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
