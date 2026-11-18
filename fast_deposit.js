/* =====================================================================
   fast_deposit.js v2 — Ludo Masters
   1) Pehla deposit (VIP = 1) hone par hi withdrawal chalega
   2) Deposit screens par "Safe & Secure Payments" trust card
   Load order: profile_plus.js -> deposit.js -> fast_deposit.js -> boot()
   ===================================================================== */

/* ---------- Withdraw sheet: deposit nahi kiya to lock ---------- */
const FD_ppWd = ppWd;
ppWd = function () {
  if (!VIP) { fdLocked(); return; }
  FD_ppWd();
};

/* Safety: request submit par bhi check (agar sheet pehle se khuli ho) */
const FD_ppWdGo = ppWdGo;
ppWdGo = function () {
  if (!VIP) { closeSh(); fdLocked(); return; }
  FD_ppWdGo();
};

function fdLocked() {
  sheet(`<div class="fd-lk">🔒</div>
<div class="pp-t">Withdrawal Locked</div>
<p class="pp-p">To unlock withdrawals, complete your <b>first deposit</b> (minimum ₹${DEP_MIN}).<br>After that you can withdraw your winnings anytime.</p>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s vipb" style="margin:0" onclick="ppClose();ppDep(-1)">Deposit Now</button></div>`);
}

/* ---------- Wallet page: lock notice + lock button ---------- */
(() => {
  const w = V.wallet;
  V.wallet = function () {
    let h = w();
    if (VIP) return h;
    h = h.replace('<button class="wd" onclick="ppWd()">Withdraw</button>',
                  '<button class="wd" onclick="ppWd()" style="opacity:.75">🔒 Withdraw</button>');
    h = h.replace('<div class="pw-box">',
      '<div class="fd-note">🔒 <b>Withdrawal locked.</b> Make your first deposit to unlock withdrawals.</div><div class="pw-box">');
    return h;
  };
})();

/* ---------- Deposit screens: Safe & Secure trust card ---------- */
function fdTrust(full) {
  const sh = document.querySelector('#pp-sh .pp-sh');
  if (!sh || sh.querySelector('.fd-sec')) return;
  const bt = sh.querySelector('.pp-bt');
  const d = document.createElement('div');
  d.className = 'fd-sec' + (full ? '' : ' sm');
  d.innerHTML = full
    ? `<div class="fd-sh"><span class="fd-ic">🛡️</span><div><b>Safe &amp; Secure Payments</b><small>Your money and details stay protected</small></div></div>
<ul>
<li><i>✓</i><span>Pay directly from <b>your own UPI app</b>. The money moves bank to bank through UPI.</span></li>
<li><i>✓</i><span>We <b>never ask</b> for your UPI PIN, card number, OTP or bank password.</span></li>
<li><i>✓</i><span>Every payment is checked with its <b>12-digit UTR</b>, and a UTR can be used <b>only once</b>.</span></li>
<li><i>✓</i><span>Cash is added to your wallet <b>instantly</b> after the payment is verified.</span></li>
</ul>
<div class="fd-hp">Payment problem? <a onclick="ppClose();go('support')">Contact Help &amp; Support</a></div>`
    : `<div class="fd-sh"><span class="fd-ic">🛡️</span><div><b>Safe &amp; Secure Payments</b></div></div>
<div class="fd-ch"><span>🔐 UPI protected</span><span>✅ UTR verified</span><span>⚡ Instant credit</span></div>
<div class="fd-wn">Never share your <b>UPI PIN</b> or OTP with anyone. We will never ask for it.</div>`;
  if (bt) sh.insertBefore(d, bt); else sh.appendChild(d);
}

const FD_depAmtStep = depAmtStep;
depAmtStep = function (pre) { FD_depAmtStep(pre); fdTrust(true); };

const FD_depPayStep = depPayStep;
depPayStep = function () { FD_depPayStep(); fdTrust(false); };

/* ---------- CSS ---------- */
(() => {
  const st = document.createElement('style');
  st.textContent = `
.fd-lk{width:calc(64*var(--u));height:calc(64*var(--u));margin:calc(4*var(--u)) auto calc(8*var(--u));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:calc(32*var(--u));background:linear-gradient(180deg,#ffe58a,#f5b32a);box-shadow:0 calc(4*var(--u)) calc(12*var(--u)) rgba(245,179,42,.5)}
.fd-note{margin-top:calc(10*var(--u));padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));background:#fff3d6;border:calc(1.5*var(--u)) solid #f5c76a;color:#7a4a00;font-size:calc(12.5*var(--u));font-weight:600;line-height:1.4;text-align:center}
.fd-sec{margin-top:calc(12*var(--u));padding:calc(12*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#effbf3,#dff5e7);border:calc(1.5*var(--u)) solid #9fe0b6;color:#14532d;text-align:left}
.fd-sec.sm{padding:calc(9*var(--u)) calc(10*var(--u))}
.fd-sh{display:flex;align-items:center;gap:calc(10*var(--u))}
.fd-ic{flex:none;width:calc(36*var(--u));height:calc(36*var(--u));border-radius:50%;display:grid;place-items:center;font-size:calc(19*var(--u));background:linear-gradient(180deg,#5fe03a,#1fa80e);box-shadow:0 calc(2*var(--u)) calc(6*var(--u)) rgba(31,168,14,.45)}
.fd-sec.sm .fd-ic{width:calc(28*var(--u));height:calc(28*var(--u));font-size:calc(15*var(--u))}
.fd-sh b{display:block;font-size:calc(14*var(--u));font-weight:800;color:#0f5a2a}
.fd-sh small{display:block;font-size:calc(11*var(--u));font-weight:600;color:#3f7a56}
.fd-sec ul{list-style:none;margin:calc(10*var(--u)) 0 0;padding:0}
.fd-sec li{display:flex;gap:calc(8*var(--u));align-items:flex-start;margin-bottom:calc(6*var(--u));font-size:calc(12*var(--u));line-height:1.4;font-weight:500}
.fd-sec li i{flex:none;width:calc(16*var(--u));height:calc(16*var(--u));margin-top:calc(1*var(--u));border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:calc(10*var(--u));font-weight:800;color:#fff;background:#1fa80e}
.fd-sec li b{color:#0f5a2a}
.fd-hp{margin-top:calc(6*var(--u));padding-top:calc(8*var(--u));border-top:1px solid rgba(31,120,60,.2);text-align:center;font-size:calc(11.5*var(--u));font-weight:600;color:#3f7a56}
.fd-hp a{color:#0f7a3a;font-weight:800;text-decoration:underline;cursor:pointer}
.fd-ch{display:flex;flex-wrap:wrap;gap:calc(6*var(--u));margin-top:calc(8*var(--u))}
.fd-ch span{padding:calc(3*var(--u)) calc(9*var(--u));border-radius:calc(12*var(--u));background:#fff;border:1px solid #9fe0b6;font-size:calc(11*var(--u));font-weight:700;color:#0f5a2a}
.fd-wn{margin-top:calc(8*var(--u));font-size:calc(11.5*var(--u));line-height:1.4;font-weight:600;color:#7a2a10}
.fd-wn b{color:#b01212}`;
  document.head.appendChild(st);
})();
