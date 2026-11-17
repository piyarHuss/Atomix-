/* =====================================================================
   fast_deposit.js — Ludo Masters
   Rule: pehla deposit (VIP = 1) complete hone par hi withdrawal chalega.
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

/* ---------- CSS ---------- */
(() => {
  const st = document.createElement('style');
  st.textContent = `
.fd-lk{width:calc(64*var(--u));height:calc(64*var(--u));margin:calc(4*var(--u)) auto calc(8*var(--u));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:calc(32*var(--u));background:linear-gradient(180deg,#ffe58a,#f5b32a);box-shadow:0 calc(4*var(--u)) calc(12*var(--u)) rgba(245,179,42,.5)}
.fd-note{margin-top:calc(10*var(--u));padding:calc(10*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));background:#fff3d6;border:calc(1.5*var(--u)) solid #f5c76a;color:#7a4a00;font-size:calc(12.5*var(--u));font-weight:600;line-height:1.4;text-align:center}`;
  document.head.appendChild(st);
})();
