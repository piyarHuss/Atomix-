/* =====================================================================
   deposit.js  v5  —  Ludo Masters : PREMIUM UPI deposit (QR + MacroDroid + Firebase UTR)

   index.html me profile_plus.js ke BAAD, boot() se PEHLE (type="module" nahi):
     <script src="profile_plus.js"></script>
     <script src="deposit.js?v=5"></script>

   v5 me kya badla:
   - PhonePe / GPay / Paytm / Other UPI buttons REMOVE (UPI apps redirect par security
     ke karan payment block kar dete the) + ?payredir=1 redirect page bhi hata diya
   - Amount select -> QR usi amount ke saath generate hota hai
   - QR ke niche professional English instruction: screenshot lo, kisi bhi payment app se
     scan karke timer ke andar pay karo
   - Premium UI: gold QR frame, timer pill + progress bar, step-by-step guide
   - UTR (12-digit) verify system SAME hai, kuch nahi hataya
   - DEP_QR_AMT: QR me amount ON/OFF (agar kisi app me amount wale QR par error aaye to false)

   Flow:
   1. User amount chunta hai -> "Generate QR & Pay"
   2. Payment screen: QR (amount ke saath) + 10 minute countdown + instructions
   3. User QR ka screenshot leta hai, payment app me gallery se scan karke pay karta hai
   4. Payment ke baad 12-digit UTR -> "Verify & Add Coins"
   5. Verify: bank_utrs/<utr> exist, not used, amount >= selected amount
      -> atomic claim (bank_utrs used:true + used_utrs/<utr> permanent tombstone)
      -> wallet me paisa add -> bank_utrs/<utr> DELETE
   6. Ek UTR sirf ek baar: used_utrs/<utr> kabhi delete nahi hota.
   ===================================================================== */

/* ---------- SETTINGS ---------- */
const DEP_UPI = 'mining-fathe@ptaxis';
const DEP_PN = 'Admin';
const DEP_MIN = 10;
const DEP_MAX = 50000;
const DEP_QUICK = [50, 100, 250, 500];
const DEP_TTL = 10 * 60 * 1000;           /* QR/payment window: 10 minute */
const DEP_QR_AMT = true;                  /* QR me amount rakhna hai? Scan par error aaye to false karo */
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
  if (!ok) { b2.innerHTML = '<div class="dp-qe">QR could not load.<br>Please check your connection and reopen this screen.</div>'; return; }
  b2.innerHTML = '';
  try {
    new QRCode(b2, { text: depUpiUrl(DEP_SESS.amt), width: 190, height: 190, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } catch (e) { console.error('DEP: QR failed', e); b2.innerHTML = '<div class="dp-qe">QR error. Please try again.</div>'; }
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
<p class="pp-p">Select an amount to generate a secure payment QR code.</p>
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

/* ---------- STEP B: QR + timer + instructions + UTR ---------- */
function depPayStep() {
  if (!DEP_SESS) return depAmtStep(100);
  const a = DEP_SESS.amt;
  sheet(`<div class="dp-hd"><span class="dp-hl">Amount to Pay</span><span class="dp-ha">${depInr(a)}</span></div>
<div id="dpw" class="dp-w">
<div class="dp-qrw"><div class="dp-fr"><div id="dpq"><div class="dp-qe">Generating QR…</div></div></div></div>
<div class="dp-tm"><span>⏱ Time left</span><b id="dpt">10:00</b></div>
<div class="dp-bar"><i id="dpbar"></i></div>
<div class="dp-ins">
<div class="dp-it">How to complete your payment</div>
<ol>
<li><b>Take a screenshot</b> of this QR code.</li>
<li>Open <b>any UPI payment app</b> and choose <b>Scan QR → Upload from gallery</b>.</li>
<li>Pay exactly <b>${depInr(a)}</b> <u>before the timer ends</u>.</li>
<li>Enter the <b>12-digit UTR / Ref No.</b> below to receive your cash.</li>
</ol>
</div>
</div>
<div id="dpx" class="dp-ex">Payment window ended. Already paid? Enter your UTR below. Otherwise tap <b>Change amount</b> for a new QR.</div>
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
  const bar = document.getElementById('dpbar');
  if (bar) { bar.style.width = (l / DEP_TTL * 100).toFixed(1) + '%'; bar.className = l < 60000 ? 'low' : ''; }
  if (l <= 0) {
    const w = document.getElementById('dpw'), x = document.getElementById('dpx');
    if (w) w.classList.add('ex'); if (x) x.style.display = 'block';
    clearInterval(DEP_T); DEP_T = 0;
  }
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
.dp-hd{display:flex;align-items:center;justify-content:space-between;padding:calc(10*var(--u)) calc(14*var(--u));margin-bottom:calc(8*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(135deg,#2a0f88,#5424d0);color:#fff;box-shadow:0 calc(4*var(--u)) calc(12*var(--u)) rgba(60,30,140,.35)}
.dp-hl{font-size:calc(12*var(--u));font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#d9c8ff}
.dp-ha{font-size:calc(26*var(--u));font-weight:800;color:#ffd21f;text-shadow:0 1px 0 rgba(0,0,0,.25)}
.dp-qrw{display:flex;justify-content:center;margin:calc(4*var(--u)) 0 calc(8*var(--u))}
.dp-fr{padding:calc(5*var(--u));border-radius:calc(22*var(--u));background:linear-gradient(135deg,#ffe27a,#ff9a14 55%,#ffd84a);box-shadow:0 calc(5*var(--u)) calc(16*var(--u)) rgba(255,154,20,.45)}
#dpq{width:calc(206*var(--u));height:calc(206*var(--u));padding:calc(8*var(--u));border-radius:calc(17*var(--u));background:#fff;display:flex;align-items:center;justify-content:center}
#dpq img,#dpq canvas{max-width:100%;max-height:100%;display:block}
.dp-qe{font-size:calc(12*var(--u));color:#5b4aa0;text-align:center;font-weight:600}
.dp-tm{display:flex;align-items:center;justify-content:center;gap:calc(8*var(--u));font-weight:700;font-size:calc(13*var(--u));color:#5b4aa0}
.dp-tm b{min-width:calc(60*var(--u));padding:calc(2*var(--u)) calc(10*var(--u));border-radius:calc(20*var(--u));background:#fff0f0;border:calc(1.5*var(--u)) solid #f0b4b4;text-align:center;font-size:calc(19*var(--u));font-weight:800;color:#d02a2a;font-variant-numeric:tabular-nums}
.dp-bar{height:calc(5*var(--u));margin:calc(7*var(--u)) calc(6*var(--u)) 0;border-radius:calc(5*var(--u));background:#e4dbff;overflow:hidden}
.dp-bar i{display:block;height:100%;width:100%;border-radius:inherit;background:linear-gradient(90deg,#5fe03a,#ffd21f);transition:width 1s linear}
.dp-bar i.low{background:linear-gradient(90deg,#ff5a5a,#ff9a14)}
.dp-ins{margin-top:calc(10*var(--u));padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));background:#f3edff;border:calc(1.5*var(--u)) solid #d8c9ff;text-align:left}
.dp-it{font-size:calc(13*var(--u));font-weight:800;color:#3a1590;margin-bottom:calc(4*var(--u))}
.dp-ins ol{margin:0;padding-left:calc(18*var(--u));font-size:calc(12*var(--u));line-height:1.5;color:#4b3a8a;font-weight:500}
.dp-ins li{margin-bottom:calc(2*var(--u))}
.dp-ins b{color:#3a1590}
.dp-ins u{text-decoration:none;font-weight:800;color:#d02a2a}
.dp-w.ex .dp-qrw,.dp-w.ex .dp-ins{opacity:.25;pointer-events:none;filter:grayscale(1)}
.dp-ex{display:none;margin-top:calc(8*var(--u));padding:calc(8*var(--u)) calc(10*var(--u));border-radius:calc(12*var(--u));background:#ffe9e9;color:#a01818;font-size:calc(12*var(--u));font-weight:600;text-align:center;line-height:1.4}
.dp-res{display:none;margin-top:calc(8*var(--u));padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));text-align:center}
.dp-res.bad{display:block;background:#ffe3e3;border:calc(2*var(--u)) solid #e04646;color:#b01212;animation:dpShake .4s}
.dp-res.bad b{display:block;font-size:calc(18*var(--u));font-weight:800}
.dp-res.bad small{display:block;margin-top:calc(2*var(--u));font-size:calc(12*var(--u));font-weight:600}
@keyframes dpShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.dp-ok{text-align:center;padding:calc(18*var(--u)) 0 calc(10*var(--u))}
.dp-tick{width:calc(76*var(--u));height:calc(76*var(--u));margin:0 auto calc(10*var(--u));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:calc(44*var(--u));font-weight:800;color:#fff;background:linear-gradient(180deg,#5fe03a,#1fa80e);box-shadow:0 0 calc(18*var(--u)) rgba(80,220,60,.6);animation:dpPop .45s cubic-bezier(.2,1.4,.4,1) both}
@keyframes dpPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
.dp-up{margin:calc(8*var(--u)) calc(4*var(--u)) 0;text-align:center;font-size:calc(12*var(--u));color:#5b4aa0}
.dp-up b{color:#3a1590}
.dp-up a{margin-left:calc(6*var(--u));color:#7a3ff0;font-weight:800;text-decoration:underline;cursor:pointer}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
