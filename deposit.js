/* =====================================================================
   deposit.js  —  Ludo Masters : REAL UPI deposit (MacroDroid + Firebase UTR)

   index.html me profile_plus.js ke BAAD (aur refer.js ke pehle/baad kahin bhi), boot() se PEHLE:
     <script src="profile_plus.js"></script>
     <script src="deposit.js"></script>
   (type="module" mat lagana)

   Kya karta hai:
   - profile_plus.js ka demo ppDep()/onDepositSuccess() replace karta hai
   - Wallet page par "Add Cash" button, Store ke deposit buttons bhi yahi sheet kholte hain
   - User: amount -> UPI app me pay -> 12-digit UTR -> Verify
   - Verify: bank_utrs/<utr> check (exist, used===false, amount >= entered)
     -> pehle bank_utrs/<utr> = {used:true, claimedBy, claimedAt}  (Firebase rules ek hi baar allow karte hain)
     -> phir wallet me paisa add
   - Beech me app band ho jaye to agle open par pending credit apne aap poora hota hai

   Debug: console me "DEP:" lines.
   ===================================================================== */

/* ---------- SETTINGS (yahan se badlo) ---------- */
const DEP_UPI = 'mining-fathe@ptaxis';
const DEP_PN = 'Admin';
const DEP_MIN = 10;                 /* minimum deposit ₹ */
const DEP_MAX = 50000;              /* maximum deposit ₹ */
const DEP_QUICK = [50, 100, 250, 500];
/* ₹1 deposit par kitna milega: cash = withdrawable ₹ balance, gems = diamonds */
const DEP_CREDIT = { cash: 1, gems: 0 };

let DEP_BUSY = 0, DEP_FAILS = [];
const DEP_DONE = {};
const depLog = (...a) => { try { console.log('DEP:', ...a); } catch (e) { } };
const depTg = () => (window.Telegram && Telegram.WebApp) || null;
const depInr = n => '₹' + Number(n || 0).toLocaleString('en-IN');

/* ---------- UPI app kholna ----------
   Telegram ka WebView upi:// kholta hi nahi (ERR_UNKNOWN_URL_SCHEME), isliye
   seedha upi:// kabhi nahi kholte. Pehle https wala pay.html (apni site par, index.html ke saath)
   phone ke browser me khulta hai, wahan se UPI app khulte hain. */
function depPayUrl(a) {
  return new URL('pay.html', location.href).href.split('#')[0] + '?am=' + encodeURIComponent(a);
}
function depOpen(url) {
  const tg = depTg();
  try {
    if (tg && tg.openLink) { tg.openLink(url, { try_browser: 'chrome' }); return; }
  } catch (e) { console.error('DEP: openLink failed', e); }
  try { window.open(url, '_blank'); } catch (e) { toast('Could not open payment page. Copy the UPI ID and pay manually.'); }
}
function depCopyUpi() {
  const done = () => toast('UPI ID copied ✓');
  const fb = () => {
    try { const a = document.createElement('textarea'); a.value = DEP_UPI; a.style.position = 'fixed'; a.style.opacity = 0; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }
    catch (e) { toast('Copy failed'); }
  };
  try { navigator.clipboard.writeText(DEP_UPI).then(done, fb); } catch (e) { fb(); }
}

/* ---------- Deposit sheet ---------- */
ppDep = function (i) {
  const pre = (typeof i === 'number' && i >= 0 && DEP_AMT[i]) ? DEP_AMT[i] : 100;
  sheet(`<div class="pp-t">Add Cash</div>
<p class="pp-p">Pay by UPI, then enter the 12-digit UTR to get your balance instantly.</p>
<label>1. Amount (₹)</label>
<div class="dp-chips">${DEP_QUICK.map(x => `<button type="button" onclick="depSet(${x})">₹${x}</button>`).join('')}</div>
<input id="dpa" type="number" inputmode="numeric" min="${DEP_MIN}" max="${DEP_MAX}" value="${pre}" oninput="depVal()" placeholder="Min ₹${DEP_MIN}">
<button type="button" class="pp-s vipb" style="margin-top:10px" onclick="depPay()">Pay via PhonePe / GPay / Paytm</button>
<div class="dp-up">UPI ID: <b>${esc(DEP_UPI)}</b> <a onclick="depCopyUpi()">Copy</a><br><small>Button se app na khule to UPI ID copy karke apne UPI app me pay karo.</small></div>
<label>2. UTR / Ref No. <em>(12 digits)</em></label>
<input id="dpu" type="text" inputmode="numeric" maxlength="12" placeholder="e.g. 412345678901" autocomplete="off" oninput="depVal()">
<div class="pp-r"><span id="dpe"></span><span id="dpc"></span></div>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" id="dps" onclick="depVerify()">Verify &amp; Add Coins</button></div>`);
  depVal();
};
function depSet(x) { const a = document.getElementById('dpa'); if (a) { a.value = x; depVal(); } }
function depAmt() { return Math.floor(Number((document.getElementById('dpa') || {}).value) || 0); }
function depCheckAmt(a) {
  if (a < DEP_MIN) return 'Minimum deposit is ₹' + DEP_MIN;
  if (a > DEP_MAX) return 'Maximum deposit is ₹' + DEP_MAX;
  return '';
}
function depVal() {
  const u = document.getElementById('dpu'), e = document.getElementById('dpe'), c = document.getElementById('dpc'), b = document.getElementById('dps');
  if (!u || !b) return;
  const clean = u.value.replace(/\D/g, '');
  if (clean !== u.value) u.value = clean;
  c.textContent = clean.length + '/12';
  const ae = depCheckAmt(depAmt());
  e.textContent = ae || (clean.length && clean.length !== 12 ? 'UTR must be exactly 12 digits' : '');
  b.disabled = !!ae || clean.length !== 12 || !!DEP_BUSY;
}
function depPay() {
  const a = depAmt(), e = depCheckAmt(a);
  if (e) { toast(e); return; }
  depOpen(depPayUrl(a));
  toast('After payment, come back here and enter the UTR');
}

/* ---------- Verify + claim ---------- */
async function depVerify() {
  if (DEP_BUSY) return;
  const a = depAmt(), u = ((document.getElementById('dpu') || {}).value || '').trim();
  const err = document.getElementById('dpe'), btn = document.getElementById('dps');
  const show = m => { if (err) err.textContent = m; };
  const ae = depCheckAmt(a);
  if (ae) return show(ae);
  if (!/^\d{12}$/.test(u)) return show('UTR must be exactly 12 digits');
  if (!UID) return show('Please wait, account is loading…');
  const now = Date.now();
  DEP_FAILS = DEP_FAILS.filter(t => now - t < 10 * 60 * 1000);
  if (DEP_FAILS.length >= 5) return show('Too many wrong attempts. Try again after 10 minutes.');

  DEP_BUSY = 1; if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  const fail = m => { DEP_FAILS.push(Date.now()); show(m); };
  let ok = 0, bank = 0;
  try {
    const ref = fdb.ref('bank_utrs/' + u);
    let d = null;
    try { d = (await ref.once('value')).val(); }
    catch (e) { console.error('DEP: read failed (rules check karo)', e); show('Could not check UTR. Try again.'); return; }
    depLog('utr data =', d);
    if (!d) { fail('UTR not found. Wait 1-2 minutes after payment and try again.'); return; }
    if (d.used !== false) { fail('This UTR is already used.'); return; }
    bank = Number(d.amount);
    if (!(bank > 0)) { fail('Invalid payment record.'); return; }
    if (bank < a) { fail('Paid amount (' + depInr(bank) + ') is less than the entered amount (' + depInr(a) + ').'); return; }
    try {
      await ref.update({ used: true, claimedBy: UID, claimedAt: Date.now() });   /* rules: sirf false -> true allow */
    } catch (e) {
      console.error('DEP: claim failed', e);
      fail('This UTR is already used or invalid.'); return;
    }
    ok = 1;
  } finally {
    DEP_BUSY = 0;
    if (!ok && btn) { btn.textContent = 'Verify & Add Coins'; depVal(); }
  }
  if (!ok) return;
  depLog('claimed', u, bank);
  const rec = { amt: bank, ts: Date.now(), c: 0 };
  dbSet('dep/' + u, rec);              /* pending marker: app beech me band ho to bhi credit na jaye */
  DEP_DONE[u] = 1;
  depCredit(u, bank, rec.ts);
  closeSh();
}

/* wallet me paisa add */
function depCredit(u, amt, ts) {
  const cash = +(amt * DEP_CREDIT.cash).toFixed(2), gems = Math.round(amt * DEP_CREDIT.gems);
  if (cash) BAL.cash = +(BAL.cash + cash).toFixed(2);
  if (gems) BAL.gems += gems;
  saveBal(); refreshBal();
  dbSet('dep/' + u, { amt, ts: ts || Date.now(), c: 1 });
  depLog('credited', u, cash, gems);
  onDepositSuccess(amt);
}

/* VIP unlock + message (profile_plus.js wala demo version replace) */
onDepositSuccess = function (amount) {
  VIP = 1; dbSet('vip', 1);
  toast('✅ ' + depInr(amount) + ' added · 👑 VIP unlocked');
  try { rer(); } catch (e) { }
};

/* ---------- Recovery: claim ho gaya par credit nahi hua (app band ho gayi) ---------- */
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
        const d = (await fdb.ref('bank_utrs/' + k).once('value')).val();
        if (d && d.used === true && d.claimedBy === UID && Number(d.amount) === Number(r.amt)) {
          depLog('recovering pending credit', k);
          depCredit(k, Number(d.amount), r.ts);
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
.dp-chips button:active{background:#c9b6ff}
.dp-up{margin:calc(8*var(--u)) calc(4*var(--u)) 0;text-align:center;font-size:calc(12*var(--u));color:#5b4aa0}
.dp-up b{color:#3a1590}
.dp-up a{margin-left:calc(6*var(--u));color:#7a3ff0;font-weight:800;text-decoration:underline;cursor:pointer}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
