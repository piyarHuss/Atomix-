/* =====================================================================
   profile_plus.js  —  Ludo Masters
   Edit Profile (name/bio), 30 Avatars (free / mission-task / VIP),
   My Stats (played/won/lost), Withdraw (only ₹, min ₹50),
   + avatar-sync fix on all pages.
   index.html me "boot();" se PEHLE load hota hai (README upar chat me).
   ===================================================================== */

/* ---------- SETTINGS (yahan se badlo) ---------- */
const MIN_WD = 50;            /* minimum withdrawal ₹ */
const DEMO_PAYMENTS = true;   /* true = Deposit button demo me VIP unlock karega. Real payment lagane ke baad FALSE karo
                                 aur payment success par onDepositSuccess(amount) call karo */
const AV_TOTAL = 30;          /* total avatars: 1-5 free, 6-20 mission/task, 21-30 VIP */

/* ---------- LOCAL STATE (Firebase se sync hota hai) ---------- */
let PROF = { name: 'LudoKing123', bio: '' };
let ST = { played: 0, won: 0, lost: 0 };
let VIP = 0;
let WD = {};

/* ---------- HELPERS ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function rer() { const s = document.getElementById('screen'), t = s.scrollTop; go(cur); s.scrollTop = t; }
function sheet(html) {
  closeSh();
  const o = document.createElement('div');
  o.id = 'pp-sh'; o.className = 'pp-ov';
  o.onclick = e => { if (e.target === o) closeSh(); };
  o.innerHTML = '<div class="pp-sh"><i class="pp-gr"></i>' + html + '</div>';
  document.getElementById('app').appendChild(o);
  sfx('popup_open');
}
function closeSh() { const o = document.getElementById('pp-sh'); if (o) o.remove(); }
const ppClose = closeSh;
const ppId = () => '#' + String(100000 + ((parseInt((UID || '0').slice(0, 8), 36) || 0) % 900000));
function ppCopy() {
  try { navigator.clipboard.writeText(ppId().replace('#', '')); } catch (e) { }
  toast('ID copied');
}

/* ---------- AVATAR UNLOCK RULES ---------- */
const mc = () => Object.keys((MS && MS.c) || {}).length;   /* claimed missions */
const UNL = {
  6: ['Play 1 game', () => ST.played >= 1],
  7: ['Win 1 game', () => ST.won >= 1],
  8: ['Complete 1 mission', () => mc() >= 1],
  9: ['Play 5 games', () => ST.played >= 5],
  10: ['Complete 2 missions', () => mc() >= 2],
  11: ['Win 3 games', () => ST.won >= 3],
  12: ['Complete 3 missions', () => mc() >= 3],
  13: ['Play 10 games', () => ST.played >= 10],
  14: ['Win 5 games', () => ST.won >= 5],
  15: ['Complete 4 missions', () => mc() >= 4],
  16: ['Play 20 games', () => ST.played >= 20],
  17: ['Win 10 games', () => ST.won >= 10],
  18: ['Complete all missions', () => mc() >= 5],
  19: ['Win 15 games', () => ST.won >= 15],
  20: ['Win 25 games', () => ST.won >= 25]
};
const isUn = i => i <= 5 || (i <= 20 ? UNL[i][1]() : !!VIP);
const reqTxt = i => i <= 5 ? 'Free' : i <= 20 ? UNL[i][0] : 'VIP · Deposit';

function ppPick(i) {
  if (!isUn(i)) { toast('🔒 ' + (i > 20 ? 'VIP only – make a deposit' : reqTxt(i))); return; }
  if (i === myAv) return;
  myAv = i; dbSet('myAv', i);
  rer(); toast('Avatar updated');
}
pickAv = function (i) { ppPick(i); };

function avTile(i) {
  const un = isUn(i), sel = myAv === i;
  return `<div class="av-t${sel ? ' sel' : ''}${un ? '' : ' lk'}" onclick="ppPick(${i})">
  <div class="av-im">${A('av' + i, '🧑', 34, 0)}${un ? '' : '<span class="av-lock">' + A('lock_icon', '🔒', 22, 26) + '</span>'}${sel ? '<b class="av-ck">✓</b>' : ''}${i > 20 ? '<span class="av-vip">VIP</span>' : ''}</div>
  <small>${sel ? 'Selected' : un ? 'Unlocked' : reqTxt(i)}</small></div>`;
}
const avGrid = (a, b) => '<div class="av-g">' + Array.from({ length: b - a + 1 }, (_, k) => avTile(a + k)).join('') + '</div>';

/* ---------- LEVEL / XP (stats se nikalta hai) ---------- */
function calcMe() {
  const xp = ST.played * 100 + ST.won * 150;
  ME.name = PROF.name; ME.level = Math.floor(xp / 500) + 1; ME.xp = xp % 500; ME.max = 500; ME.games = ST.played; ME.id = ppId();
}

/* ---------- PROFILE PAGE ---------- */
V.profile = () => {
  calcMe();
  const rows = [
    ['row_edit', '✏️', 'Edit Profile', 'Change your name or bio', 'ppEdit()'],
    ['row_avatar', '🖼️', 'Change Avatar', 'Select a new character', "go('avatars')"],
    ['stats_chart', '📊', 'My Stats', 'View your game stats', "go('stats')"],
    ['wallet_icon', '👛', 'Wallet & Transactions', 'Check your balance & history', "go('wallet')"],
    ['refer', '🎁', 'Refer & Earn', 'Invite friends and earn rewards', 'invite()'],
    ['support', '🎧', 'Help & Support', 'Get help from our team', "toast('Support coming soon')"],
    ['set_logout', '🚪', 'Logout', 'Sign out from your account', 'ppLogout()']
  ];
  return `<div class="pf-pg">
<div class="pf-bar"><button class="pf-rb" onclick="go('home')">${A('back', '‹', 18, 22)}</button><div class="pf-t">Profile</div><button class="pf-rb" onclick="go('menu')">${A('set_settings', '⚙️', 18, 24)}</button></div>
<div class="pf-card"><div class="pf-ring" onclick="go('avatars')">${A('av' + myAv, '🧑', 50, 0)}<span class="pf-ed">${A('edit_pencil', '✏️', 12, 14)}</span></div>
<div class="pf-in"><div class="pf-nm" onclick="ppEdit()">${esc(ME.name)}${A('verified', '✔', 14, 18)}</div>
<div class="pf-id" onclick="ppCopy()">ID: ${ME.id}${A('copy', '⧉', 12, 16)}</div>
${PROF.bio ? `<div class="pf-bio">${esc(PROF.bio)}</div>` : ''}
<div class="pf-lv"><span>${A('level_crown', '👑', 16, 22)}Level ${ME.level}</span><small>${ME.xp.toLocaleString()} / ${ME.max.toLocaleString()}</small></div>
<div class="pf-bar2"><i style="width:${ME.xp / ME.max * 100}%"></i></div></div></div>
<div class="pf-st"><div class="pf-sc g">${A('gem', '💎', 40, 46)}<div><b>${Math.round(BAL.gems)}</b><small>Diamond Balance</small></div><button class="pf-pl" onclick="go('store')">+</button></div>
<div class="pf-sc">${A('stat_trophy', '🏆', 40, 46)}<div><b>${ME.games}</b><small>Total Games</small></div></div></div>
<div class="pf-av" id="pfav"><div class="pf-ah"><span>${A('title_community', '👥', 20, 26)}Choose Avatar</span><a onclick="go('avatars')">View All ${A('chevron', '›', 14, 14)}</a></div>
<div class="pf-ag">${[1, 2, 3, 4, 5].map(i => `<div class="pf-a${i == myAv ? ' on' : ''}" onclick="ppPick(${i})">${A('av' + i, '🧑', 34, 0)}${i == myAv ? '<b>✓</b>' : ''}</div>`).join('')}</div></div>
${rows.map(r => `<div class="pf-row" onclick="${r[4]}"><span class="pf-ri">${A(r[0], r[1], 24, 32)}</span><div><b>${r[2]}</b><small>${r[3]}</small></div>${A('chevron', '›', 16, 16)}</div>`).join('')}
<div class="pf-foot">${A('crown_corner', '👑', 40, 70)}${A('crown_corner', '👑', 40, 70)}</div></div>`;
};

/* ---------- EDIT PROFILE (bottom sheet) ---------- */
function ppEdit() {
  sheet(`<div class="pp-t">Edit Profile</div>
<div class="pp-av">${A('av' + myAv, '🧑', 40, 0)}</div>
<label>Display Name</label>
<input id="ppn" maxlength="16" value="${esc(PROF.name)}" oninput="ppVal()" autocomplete="off" spellcheck="false">
<div class="pp-r"><span id="ppe"></span><span id="ppc"></span></div>
<label>Bio <em>(optional)</em></label>
<input id="ppb" maxlength="40" value="${esc(PROF.bio)}" oninput="ppVal()" placeholder="Say something about you" autocomplete="off">
<div class="pp-r"><span></span><span id="ppbc"></span></div>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" id="pps" onclick="ppSave()">Save Changes</button></div>`);
  ppVal();
}
function ppCheck() {
  const n = document.getElementById('ppn').value.trim();
  let e = '';
  if (n.length < 3) e = 'Name must be at least 3 characters';
  else if (!/^[A-Za-z0-9_ ]+$/.test(n)) e = 'Only letters, numbers, space and _ allowed';
  else if (/ {2,}/.test(n)) e = 'Double spaces are not allowed';
  return { n, e };
}
function ppVal() {
  const { n, e } = ppCheck(), b = document.getElementById('ppb').value.trim();
  document.getElementById('ppe').textContent = e;
  document.getElementById('ppc').textContent = document.getElementById('ppn').value.length + '/16';
  document.getElementById('ppbc').textContent = document.getElementById('ppb').value.length + '/40';
  document.getElementById('pps').disabled = !!e || (n === PROF.name && b === PROF.bio);
}
function ppSave() {
  const { n, e } = ppCheck(); if (e) return;
  PROF = { name: n, bio: document.getElementById('ppb').value.trim() };
  ME.name = n; dbSet('prof', PROF);
  closeSh(); rer(); toast('Profile updated ✓');
}

/* ---------- LOGOUT ---------- */
function ppLogout() {
  sheet(`<div class="pp-t">Logout?</div><p class="pp-p">You are playing as a guest account. If you logout, your progress on this device may be lost.</p>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Stay</button><button class="pp-s red" onclick="ppLogout2()">Logout</button></div>`);
}
function ppLogout2() { firebase.auth().signOut().then(() => location.reload()).catch(() => location.reload()); }

/* ---------- AVATARS PAGE ---------- */
V.avatars = () => {
  const un = Array.from({ length: AV_TOTAL }, (_, i) => i + 1).filter(isUn).length;
  return `<div class="pf-pg">
<div class="pf-bar"><button class="pf-rb" onclick="go('profile')">${A('back', '‹', 18, 22)}</button><div class="pf-t">Avatars</div><div class="av-cnt">${un}/${AV_TOTAL}</div></div>
<div class="av-card"><div class="av-sh">Free Avatars</div>${avGrid(1, 5)}</div>
<div class="av-card"><div class="av-sh">Mission &amp; Task Rewards <small>Unlock by playing</small></div>${avGrid(6, 20)}</div>
<div class="av-card vipc"><div class="av-sh"><span style="display:flex;align-items:center;gap:6px">${A('level_crown', '👑', 18, 24)}VIP Avatars</span> <small>${VIP ? 'Unlocked' : 'Unlock with a deposit'}</small></div>${avGrid(21, 30)}
${VIP ? '' : `<button class="pp-s vipb" onclick="go('store')">Deposit &amp; Become VIP</button>`}</div></div>`;
};

/* ---------- MY STATS PAGE ---------- */
V.stats = () => {
  calcMe();
  const p = ST.played, w = ST.won, l = ST.lost, wr = p ? Math.round(w / p * 100) : 0;
  return `<div class="pf-pg">
<div class="pf-bar"><button class="pf-rb" onclick="go('profile')">${A('back', '‹', 18, 22)}</button><div class="pf-t" style="display:flex;align-items:center;gap:6px">${A('stats_chart', '📊', 22, 28)}My Stats</div><span style="width:36px"></span></div>
<div class="ps-ring" style="--p:${wr}"><div>${A('stat_star', '⭐', 22, 26)}<b>${wr}%</b><small>Win Rate</small></div></div>
<div class="ps-g">
<div class="ps-c"><span>${A('title_gamepad', '🎮', 26, 38)}</span><b>${p}</b><small>Games Played</small></div>
<div class="ps-c w"><span>${A('stat_trophy', '🏆', 26, 38)}</span><b>${w}</b><small>Won</small></div>
<div class="ps-c l"><span>${A('stat_lost', '💔', 26, 38)}</span><b>${l}</b><small>Lost</small></div></div>
<div class="ps-box"><div class="ps-lb"><span>Won ${w}</span><span>Lost ${l}</span></div>
<div class="ps-bar"><i style="width:${p ? w / p * 100 : 0}%"></i></div></div>
<div class="ps-box"><div class="ps-it"><span class="ps-l">${A('level_crown', '👑', 18, 24)}Level</span><b>${ME.level}</b></div>
<div class="ps-it"><span class="ps-l">${A('stat_star', '⭐', 18, 24)}XP in this level</span><b>${ME.xp} / ${ME.max}</b></div>
<div class="ps-it"><span class="ps-l">${A('mis_trophy', '🏆', 18, 24)}Missions completed</span><b>${mc()}</b></div>
<div class="ps-it"><span class="ps-l">${A('title_community', '👥', 18, 24)}Avatars unlocked</span><b>${Array.from({ length: AV_TOTAL }, (_, i) => i + 1).filter(isUn).length} / ${AV_TOTAL}</b></div>
<div class="ps-it"><span class="ps-l">${A('gem', '💎', 18, 24)}Diamonds</span><b>${Math.round(BAL.gems)}</b></div></div>
${p ? '' : '<div class="ps-em">No games played yet. Play your first game to see your stats here!</div>'}
<button class="pp-s vipb" style="margin-top:14px" onclick="go('games')">Play Now</button></div>`;
};

/* ---------- WALLET (only ₹ withdrawal) ---------- */
V.wallet = () => {
  const cash = BAL.cash, can = cash >= MIN_WD;
  const list = Object.keys(WD).map(k => Object.assign({ k }, WD[k])).sort((a, b) => b.ts - a.ts);
  const when = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="top"><button class="back" onclick="go('home')">${A('back', '‹', 18, 18)}</button><div class="ttl">${A('wallet_icon', '👛', 26, 30)}My Wallet</div><span style="width:34px"></span></div>
<div class="bal"><div>Withdrawable Balance<b>${A('wallet_icon', '👛', 40, 44)}₹${cash.toFixed(2)}</b></div><button class="wd" onclick="ppWd()">Withdraw</button></div>
<div class="pw-box"><div class="pw-top"><span>Minimum withdrawal ₹${MIN_WD}</span><span>${can ? 'Ready ✓' : '₹' + cash.toFixed(0) + ' / ₹' + MIN_WD}</span></div>
<div class="pw-bar"><i style="width:${Math.min(100, cash / MIN_WD * 100)}%"></i></div>
<small>${can ? 'You can withdraw now. Only Rupees can be withdrawn.' : 'Add ₹' + (MIN_WD - cash).toFixed(2) + ' more to unlock withdrawal. Only Rupees can be withdrawn.'}</small></div>
<div class="row"><span class="ic" style="background:#8b5cf6">${A('gem', '💎', 22, 26)}</span><div>${Math.round(BAL.gems)} Diamonds<small>Used to enter games · not withdrawable</small></div></div>
<div class="sec"><span>Transaction History</span></div>
${list.length ? list.map(r => `<div class="row"><span class="ic" style="background:#2f8cf0">${A('tx_ad', '↑', 22, 42)}</span><div>Withdrawal · ${esc(r.upi)}<small>${when(r.ts)} · <b style="color:#e08a00">${esc(r.status)}</b></small></div><em style="color:#d02a2a">-₹${Number(r.amt).toFixed(2)}</em></div>`).join('') : '<div class="ps-em" style="color:var(--mut)">No transactions yet.</div>'}`;
};
function ppWd() {
  if (BAL.cash < MIN_WD) { toast('Minimum withdrawal is ₹' + MIN_WD); return; }
  sheet(`<div class="pp-t">Withdraw Money</div>
<p class="pp-p">Available: <b>₹${BAL.cash.toFixed(2)}</b> · Minimum ₹${MIN_WD}</p>
<label>Amount (₹)</label>
<div class="pp-amt"><input id="pwa" type="number" inputmode="numeric" min="${MIN_WD}" max="${Math.floor(BAL.cash)}" placeholder="${MIN_WD}" oninput="ppWdVal()"><button onclick="document.getElementById('pwa').value=${Math.floor(BAL.cash)};ppWdVal()">MAX</button></div>
<label>UPI ID</label>
<input id="pwu" placeholder="example@upi" autocomplete="off" autocapitalize="off" oninput="ppWdVal()">
<div class="pp-r"><span id="pwe"></span><span></span></div>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" id="pws" onclick="ppWdGo()">Request Withdrawal</button></div>`);
  ppWdVal();
}
function ppWdCheck() {
  const a = Math.floor(Number(document.getElementById('pwa').value) || 0), u = document.getElementById('pwu').value.trim();
  let e = '';
  if (a < MIN_WD) e = 'Minimum withdrawal is ₹' + MIN_WD;
  else if (a > BAL.cash) e = 'Amount is more than your balance';
  else if (!/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(u)) e = 'Enter a valid UPI ID';
  return { a, u, e };
}
function ppWdVal() { const { e } = ppWdCheck(); document.getElementById('pwe').textContent = e; document.getElementById('pws').disabled = !!e; }
function ppWdGo() {
  const { a, u, e } = ppWdCheck(); if (e) return;
  const id = 'w' + Date.now(), r = { amt: a, upi: u, status: 'pending', ts: Date.now() };
  WD[id] = r; BAL.cash = +(BAL.cash - a).toFixed(2); saveBal(); dbSet('wd/' + id, r); refreshBal();
  closeSh(); rer(); toast('Withdrawal request sent ✓');
}

/* ---------- DEPOSIT -> VIP ---------- */
const DEP_AMT = [250, 400, 800, 1200, 2000, 4000];
function ppDep(i) {
  if (!DEMO_PAYMENTS) { toast('Payment gateway not connected yet'); return; }
  sheet(`<div class="pp-t">Demo Deposit</div><p class="pp-p">Test mode: deposit of <b>₹${DEP_AMT[i]}</b> will unlock VIP avatars.</p>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" onclick="ppClose();onDepositSuccess(${DEP_AMT[i]})">Pay ₹${DEP_AMT[i]}</button></div>`);
}
/* Real payment success hone par isko call karo: onDepositSuccess(amount) */
function onDepositSuccess(amount) {
  VIP = 1; dbSet('vip', 1);
  toast('👑 VIP unlocked! 10 VIP avatars available');
  rer();
}

/* ---------- STATS TRACKING (game khatam hone par) ---------- */
const _lg = loadGameModule;
loadGameModule = async function (k) {
  const mod = await _lg(k);
  return {
    start(o) {
      let done = 0;
      const f = o.onFinish, x = o.onExit;
      const rec = (win) => { if (done) return; done = 1; ST = { played: ST.played + 1, won: ST.won + (win ? 1 : 0), lost: ST.lost + (win ? 0 : 1) }; dbSet('st', ST); };
      o.onFinish = r => { rec(!!r && r.winner === 'blue'); if (f) f(r); };
      o.onExit = () => { rec(false); if (x) x(); };   /* beech me quit = loss */
      return mod.start(o);
    },
    stop() { return mod.stop && mod.stop(); }
  };
};

/* ---------- AVATAR SYNC FIX: har page par same avatar ---------- */
const fixAv = h => h.replace(/assets\/avatar\.png/g, 'assets/av' + myAv + '.png');
['pool', 'match', 'tasks'].forEach(k => { const o = V[k]; V[k] = function () { return fixAv(o()); }; });
(() => {
  const o = V.home;
  V.home = function () {
    calcMe();
    const p = ST.played, wr = p ? Math.round(ST.won / p * 100) : 0;
    return fixAv(o())
      .replace('<div>12<small>Games</small>', `<div>${p}<small>Games</small>`)
      .replace('<div>85%<small>Win Rate</small>', `<div>${wr}%<small>Win Rate</small>`)
      .replace('<div>50<small>Gems</small>', `<div>${Math.round(BAL.gems)}<small>Gems</small>`);
  };
  const m = V.menu;
  V.menu = function () { calcMe(); return fixAv(m()).replace('Md Abu Bakar Siddiq', esc(PROF.name)).replace('ID: 123456', 'ID: ' + ME.id.replace('#', '')); };
  const s = V.store;
  V.store = function () { let k = 0; return s().replace(/<button class="dp-btn">/g, () => `<button class="dp-btn" onclick="ppDep(${k++})">`); };
})();

/* ---------- nav hide + purple bg for new pages ---------- */
const _go = go;
go = function (v) {
  _go(v);
  if (v === 'avatars' || v === 'stats') {
    document.getElementById('app').classList.add('prof');
    document.getElementById('nav').style.display = 'none';
  }
};

/* ---------- FIREBASE SYNC for new data ---------- */
const _ar = applyRemote;
applyRemote = function (v, first) {
  _ar(v, first);
  v = v || {};
  const np = Object.assign({ name: 'LudoKing123', bio: '' }, v.prof || {});
  const ns = Object.assign({ played: 0, won: 0, lost: 0 }, v.st || {});
  const nv = v.vip ? 1 : 0, nw = v.wd || {};
  const ch = jx([np, ns, nv, nw]) !== jx([PROF, ST, VIP, WD]);
  PROF = np; ST = ns; VIP = nv; WD = nw; ME.name = np.name;
  if (ch && !first && !document.getElementById('pp-sh') && ['home', 'profile', 'avatars', 'stats', 'wallet', 'menu', 'pool'].includes(cur)) rer();
};

/* ---------- CSS ---------- */
(() => {
  const css = `
.pf-ring,.pf-nm,.pf-id{cursor:pointer}
.pf-bio{margin-top:calc(2*var(--u));font-size:calc(12*var(--u));color:#e8dcff;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-ah a{cursor:pointer}
/* sheet */
.pp-ov{position:absolute;inset:0;z-index:70;display:flex;align-items:flex-end;background:rgba(14,4,44,.7);backdrop-filter:blur(3px);animation:drIn .25s ease both}
.pp-sh{width:100%;max-height:92%;overflow-y:auto;background:linear-gradient(180deg,#f4eeff,#e5dbff);border-radius:calc(28*var(--u)) calc(28*var(--u)) 0 0;padding:calc(10*var(--u)) calc(18*var(--u)) calc(22*var(--u));animation:ppUp .3s cubic-bezier(.2,.9,.3,1.1) both;color:#2a1b5e}
@keyframes ppUp{from{transform:translateY(100%)}to{transform:none}}
.pp-gr{display:block;width:calc(44*var(--u));height:calc(5*var(--u));border-radius:3px;background:#c4b6ee;margin:0 auto calc(12*var(--u))}
.pp-t{text-align:center;font-weight:800;font-size:calc(20*var(--u));color:#3a1590;margin-bottom:calc(10*var(--u))}
.pp-p{text-align:center;font-size:calc(13*var(--u));color:#5b4aa0;margin:0 0 calc(10*var(--u));line-height:1.4}
.pp-av{width:calc(84*var(--u));height:calc(84*var(--u));margin:0 auto calc(12*var(--u));border-radius:50%;padding:calc(3*var(--u));background:linear-gradient(145deg,#ffe58a,#f5b32a);overflow:hidden;display:flex;align-items:center;justify-content:center}
.pp-av img.as{width:100%;height:100%;border-radius:50%;object-fit:cover}
.pp-sh label{display:block;font-weight:700;font-size:calc(13*var(--u));color:#3a1590;margin:calc(8*var(--u)) calc(4*var(--u)) calc(5*var(--u))}
.pp-sh label em{font-style:normal;font-weight:500;color:#7a6cb8}
.pp-sh input{width:100%;height:calc(46*var(--u));border-radius:calc(14*var(--u));border:calc(2*var(--u)) solid #cbbdf3;background:#fff;padding:0 calc(14*var(--u));font:600 calc(15*var(--u)) Poppins,sans-serif;color:#2a1b5e;outline:0}
.pp-sh input:focus{border-color:#7a3ff0;box-shadow:0 0 0 calc(3*var(--u)) rgba(122,63,240,.18)}
.pp-r{display:flex;justify-content:space-between;gap:8px;min-height:calc(18*var(--u));margin:calc(3*var(--u)) calc(4*var(--u)) 0;font-size:calc(11.5*var(--u));color:#7a6cb8}
.pp-r span:first-child{color:#d02a2a;font-weight:600}
.pp-amt{display:flex;gap:calc(8*var(--u))}.pp-amt button{flex:none;width:calc(66*var(--u));border:0;border-radius:calc(14*var(--u));background:#ddd0ff;color:#5424d0;font:800 calc(13*var(--u)) Poppins}
.pp-bt{display:flex;gap:calc(10*var(--u));margin-top:calc(14*var(--u))}
.pp-c,.pp-s{flex:1;height:calc(48*var(--u));border-radius:calc(16*var(--u));border:0;font:800 calc(15*var(--u)) Poppins,sans-serif;cursor:pointer}
.pp-c{background:#e0d6ff;color:#5424d0}
.pp-s{color:#fff;background:linear-gradient(180deg,#8b4dff,#5424d0);box-shadow:0 calc(4*var(--u)) 0 rgba(50,20,130,.45)}
.pp-s.red{background:linear-gradient(180deg,#ff5a5a,#d81420);box-shadow:0 calc(4*var(--u)) 0 rgba(120,10,20,.4)}
.pp-s:disabled{opacity:.45;box-shadow:none;cursor:default}
.pp-s.vipb{width:100%;flex:none;margin-top:calc(12*var(--u));background:linear-gradient(180deg,#ffd84a,#ff9a14);color:#5a2a00;box-shadow:0 calc(4*var(--u)) 0 rgba(160,80,0,.4)}
/* avatars page */
.av-cnt{min-width:calc(52*var(--u));text-align:center;color:#fff;font-weight:800;font-size:calc(13*var(--u));padding:calc(6*var(--u)) calc(10*var(--u));border-radius:calc(16*var(--u));background:linear-gradient(180deg,#7b3fe4,#4b1fa8);border:calc(1.5*var(--u)) solid rgba(255,255,255,.35)}
.av-card{margin-top:calc(12*var(--u));padding:calc(10*var(--u)) calc(10*var(--u)) calc(12*var(--u));border-radius:calc(20*var(--u));background:linear-gradient(180deg,rgba(235,220,255,.94),rgba(205,180,250,.92));border:calc(2*var(--u)) solid rgba(255,255,255,.7)}
.av-card.vipc{background:linear-gradient(180deg,#fff0c2,#f3d27a);border-color:#fff3c0}
.av-sh{font-weight:800;font-size:calc(15*var(--u));color:#3a1590;margin:0 calc(4*var(--u)) calc(8*var(--u));display:flex;align-items:baseline;justify-content:space-between;gap:6px}
.av-sh small{font-size:calc(11*var(--u));font-weight:600;color:#6a5aa8}
.av-g{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(8*var(--u))}
.av-t{text-align:center;cursor:pointer}
.av-im{position:relative;aspect-ratio:.9;border-radius:calc(14*var(--u));border:calc(2.5*var(--u)) solid transparent;background:rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;font-size:calc(30*var(--u));overflow:visible}
.av-im img.as{width:100%;height:100%;border-radius:calc(11*var(--u));object-fit:cover}
.av-t.sel .av-im{border-color:#ffd34c;box-shadow:0 0 calc(10*var(--u)) rgba(255,205,70,.85)}
.av-t.lk .av-im img.as,.av-t.lk .av-im .ph{filter:grayscale(1) brightness(.6)}
.av-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(22*var(--u))}
.av-ck{position:absolute;top:calc(-7*var(--u));right:calc(-7*var(--u));width:calc(20*var(--u));height:calc(20*var(--u));border-radius:50%;background:#fff;color:#5b2fd0;font-size:calc(12*var(--u));display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.av-vip{position:absolute;left:50%;top:calc(-7*var(--u));transform:translateX(-50%);padding:0 calc(7*var(--u));border-radius:calc(8*var(--u));background:linear-gradient(180deg,#ffd84a,#ff9a14);color:#5a2a00;font-weight:800;font-size:calc(9*var(--u));line-height:calc(14*var(--u))}
.av-t small{display:block;margin-top:calc(4*var(--u));font-size:calc(10*var(--u));font-weight:600;color:#4a3a8a;line-height:1.15;min-height:calc(24*var(--u))}
/* stats page */
.ps-ring{--p:0;width:calc(150*var(--u));height:calc(150*var(--u));margin:calc(14*var(--u)) auto;border-radius:50%;background:conic-gradient(#5fe03a calc(var(--p)*1%),rgba(255,255,255,.2) 0);display:flex;align-items:center;justify-content:center;box-shadow:0 0 calc(18*var(--u)) rgba(120,80,255,.5)}
.ps-ring>div{width:80%;height:80%;border-radius:50%;background:linear-gradient(180deg,#4a1fb8,#2a0f6a);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ps-ring b{font-size:calc(34*var(--u));font-weight:800;line-height:1}.ps-ring small{font-size:calc(12*var(--u));color:#d9c8ff}
.ps-g{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(8*var(--u))}
.ps-c{border-radius:calc(18*var(--u));padding:calc(10*var(--u)) calc(4*var(--u));text-align:center;color:#fff;background:linear-gradient(180deg,#5a2aa8,#3a1470);border:calc(1.5*var(--u)) solid rgba(255,255,255,.18)}
.ps-c.w{background:linear-gradient(180deg,#2f9e1a,#1d6a10)}.ps-c.l{background:linear-gradient(180deg,#d83b4a,#8f1424)}
.ps-c span{font-size:calc(22*var(--u))}.ps-c b{display:block;font-size:calc(26*var(--u));font-weight:800;line-height:1.1}.ps-c small{font-size:calc(11*var(--u));opacity:.9}
.ps-box{margin-top:calc(12*var(--u));padding:calc(12*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(236,222,255,.95),rgba(214,192,250,.93));border:calc(2*var(--u)) solid rgba(255,255,255,.7)}
.ps-lb{display:flex;justify-content:space-between;font-weight:800;font-size:calc(13*var(--u));color:#3a1590;margin-bottom:calc(6*var(--u))}
.ps-bar{height:calc(12*var(--u));border-radius:6px;background:#d83b4a;overflow:hidden}.ps-bar i{display:block;height:100%;background:linear-gradient(180deg,#6fe84a,#1fa80e)}
.ps-it{display:flex;justify-content:space-between;padding:calc(7*var(--u)) calc(2*var(--u));font-size:calc(13.5*var(--u));color:#4a3a8a;border-bottom:1px solid rgba(90,60,170,.15)}
.ps-it:last-child{border:0}.ps-it b{color:#2a1b5e}
.ps-em{margin-top:calc(14*var(--u));text-align:center;color:#e8dcff;font-size:calc(13*var(--u));font-weight:600;padding:0 calc(10*var(--u))}
/* wallet */
.pw-box{margin-top:calc(10*var(--u));padding:calc(12*var(--u));border-radius:calc(16*var(--u));background:rgba(255,255,255,.8)}
.pw-top{display:flex;justify-content:space-between;font-weight:700;font-size:calc(13*var(--u));margin-bottom:calc(6*var(--u))}
.pw-bar{height:calc(10*var(--u));border-radius:6px;background:#d9d2f5;overflow:hidden}.pw-bar i{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#5fe03a)}
.pw-box small{display:block;margin-top:calc(6*var(--u));font-size:calc(11.5*var(--u));color:var(--mut)}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();

/* =====================================================================
   v2: har game ka pool page, game cards sirf PNG hone par, music fix
   ===================================================================== */

/* ---------- GAMES CONFIG ----------
   ready:true  = game engine (script) maujood hai, match start hota hai
   ready:false = pool page khulta hai, par Play par "coming soon" (fee nahi katti)
   Naya game ready karna ho: script/module daalo aur ready:true karo */
GAMES.Ludo.title = 'Ludo'; GAMES.Ludo.ready = true;
Object.assign(GAMES, {
  Carrom:    { title: 'Carrom',           name: 'Carrom Masters',   logo: 'logo_carrom',    bg: 'match_bg_carrom',    banner: 'pool_banner_carrom',    ready: false },
  TeenPatti: { title: 'Teen Patti',       name: 'Teen Patti',       logo: 'logo_teenpatti', bg: 'match_bg_teenpatti', banner: 'pool_banner_teenpatti', ready: false },
  Snakes:    { title: 'Snakes & Ladders', name: 'Snakes & Ladders', logo: 'logo_snakes',    bg: 'match_bg_snakes',    banner: 'pool_banner_snakes',    ready: false },
  Chess:     { title: 'Chess',            name: 'Chess Masters',    logo: 'logo_chess',     bg: 'match_bg_chess',     banner: 'pool_banner_chess',     ready: false },
  Solitaire: { title: 'Solitaire',        name: 'Solitaire',        logo: 'logo_solitaire', bg: 'match_bg_solitaire', banner: 'pool_banner_solitaire', ready: false }
});

const _playPool = playPool;
playPool = function (id) {
  const g = GAMES[curGame];
  if (g && g.ready === false) { toast(g.title + ' coming soon'); return; }
  _playPool(id);
};

/* pool page: banner/frame PNG na ho to broken image na dikhe */
(() => {
  const o = V.pool;
  V.pool = function () { return o().replace(/<img class="pl-img"/g, '<img class="pl-img" onerror="this.style.display=\'none\'"'); };
})();

/* ---------- GAMES PAGE: card tabhi dikhe jab assets/<image>.png ho ---------- */
const GM_MAIN = [['Ludo', 'game_ludo', 'c1'], ['Carrom', 'game_carrom', 'c2'], ['TeenPatti', 'game_teenpatti', 'c3'], ['Snakes', 'game_snakes', 'c4']];
const GM_FEAT = [['Chess', 'game_chess', 'c5'], ['Solitaire', 'game_solitaire', 'c4']];
function gcSync() {
  document.querySelectorAll('.gsec').forEach(s => {
    s.style.display = [...s.querySelectorAll('.gc')].some(c => c.style.display !== 'none') ? '' : 'none';
  });
}
function gcShow(img) { img.closest('.gc').style.display = ''; gcSync(); }
function gcGone(img) { img.closest('.gc').remove(); gcSync(); }
const gcard = (g, sm) => `<div class="gc ${g[2]} ${sm}" style="display:none;cursor:pointer" onclick="openGame('${g[0]}')"><div class="im"><img class="as" src="assets/${g[1]}.png" alt="" onload="gcShow(this)" onerror="gcGone(this)"></div><p>${esc(GAMES[g[0]].title)}</p><button class="pn">Play Now</button></div>`;
V.games = () => `<div class="top"><div class="ttl">${A('title_gamepad', '🎮', 26, 30)}All Games</div></div>
<div class="gsec" style="display:none"><div class="grid">${GM_MAIN.map(g => gcard(g, '')).join('')}</div></div>
<div class="gsec" style="display:none"><div class="sec"><span style="display:flex;gap:6px;align-items:center">${A('star_featured', '⭐', 18, 22)}Featured Games</span><a>View All ${CH()}</a></div>
<div class="grid">${GM_FEAT.map(g => gcard(g, 'sm')).join('')}</div></div>`;

/* ---------- MUSIC: app khulte hi apne aap bajega ----------
   Menu ke Music toggle se OFF karo to band rahega (save hota hai).
   Note: kuch browser/WebView bina touch ke audio block karte hain;
   tab pehle touch/tap par music turant shuru ho jata hai. */
const bgmKick = () => { if (S.mus && bgm.paused) return bgm.play().then(() => true).catch(() => false); return Promise.resolve(!S.mus); };
const BGM_EV = ['pointerdown', 'touchstart', 'click', 'keydown'];
const bgmGesture = () => { bgmKick().then(ok => { if (ok && !bgm.paused) BGM_EV.forEach(e => document.removeEventListener(e, bgmGesture, true)); }); };
BGM_EV.forEach(e => document.addEventListener(e, bgmGesture, true));
const _ar2 = applyRemote;
applyRemote = function (v, first) {
  _ar2(v, first);
  if (first) {
    /* purana "music forced OFF" fix ek baar hata do */
    if (!(v && v.musV2)) { S.mus = 1; saveSnd(); dbSet('musV2', 1); }
    bgmKick();   /* bina touch ke chal gaya to theek, nahi to pehle touch par chalega */
  }
};

/* ---------- GAME KE HISAAB SE BACKGROUND ----------
   Pool page:  assets/pool_bg_<game>.png      (pool_bg_ludo, pool_bg_carrom, pool_bg_teenpatti, pool_bg_snakes, pool_bg_chess, pool_bg_solitaire)
   Match page: assets/match_bg_<game>.png     (match_bg_ludo, match_bg_carrom, ...)
   PNG na ho to normal background dikhega. */
Object.keys(GAMES).forEach(k => { GAMES[k].poolBg = GAMES[k].poolBg || 'pool_bg_' + k.toLowerCase(); });
(() => {
  const g0 = go;
  go = function (v) {
    g0(v);
    const ap = document.getElementById('app'), s = document.getElementById('screen');
    ap.classList.toggle('pb', v === 'pool');
    if (v === 'pool') s.style.setProperty('--pbg', 'url(assets/' + GAMES[curGame].poolBg + '.png)');
  };
})();

(() => {
  const st = document.createElement('style');
  st.textContent = `#app.pb #screen{background:var(--pbg) center/cover no-repeat}.ps-l{display:flex;align-items:center;gap:calc(8*var(--u))}.ps-c span{display:flex;justify-content:center}.ps-ring>div img.as{margin-bottom:calc(2*var(--u))}.av-lock img.as{width:calc(26*var(--u))!important;height:calc(26*var(--u))!important;filter:none!important}.av-sh img.as{vertical-align:middle}`;
  document.head.appendChild(st);
})();

/* =====================================================================
   v4: Search sound + Match-found sound
   assets: sounds/searching.mp3  -> opponent search ke dauran loop me bajta hai
           sounds/match_found.mp3 -> user/opponent mil jane par ek baar bajta hai
   ===================================================================== */
const SRCH = new Audio('sounds/searching.mp3');
SRCH.loop = true; SRCH.volume = .6; SRCH.preload = 'none';
function srchStart() {
  srchStop();
  if (!S.sfx) return;                       /* Sound OFF ho to nahi bajega */
  try { SRCH.currentTime = 0; SRCH.play().catch(() => { }); } catch (e) { }
}
function srchStop() { try { SRCH.pause(); SRCH.currentTime = 0; } catch (e) { } }

const _ss = startSearch;
startSearch = function () { _ss(); srchStart(); };

const _fo = foundOpp;
foundOpp = function () {
  const was = MATCH.started;
  srchStop();                               /* search sound band, phir match_found bajega */
  _fo();                                    /* andar sfx('match_found') bajta hai */
  if (was) return;
};

const _cm = cancelMatch;
cancelMatch = function () { srchStop(); _cm(); };

/* match page chhodte hi search sound band */
(() => {
  const g1 = go;
  go = function (v) { if (v !== 'match') srchStop(); g1(v); };
})();
/* app background me jaye to bhi band */
document.addEventListener('visibilitychange', () => { if (document.hidden) srchStop(); });

/* =====================================================================
   v5: LOADING PAGE  (app khulte hi, jab tak saare assets load na ho jayein)
   assets (optional, na ho to gradient/text dikhega):
     assets/loading_bg.png    -> poora background (portrait, 1080x2340 jaisa)
     assets/loading_logo.png  -> upar ka logo (transparent PNG)
   Animation: 3D ghoomta Ludo dice + progress bar ke aage chhota dice + % text
   ===================================================================== */
const LOAD_IMGS = [
  'bg', 'logo', 'banner_art', 'avatar', 'av1', 'gem', 'wallet_icon', 'bell', 'arrow_circle',
  'icon_play', 'icon_shop', 'icon_missions', 'icon_daily', 'stat_trophy', 'stat_star', 'stat_gem',
  'stats_chart', 'chevron', 'nav_home', 'nav_games', 'nav_community', 'nav_store', 'nav_menu',
  'dr_header', 'loading_logo'
];
const LOAD_TIPS = ['Roll the dice, rule the board!', 'Complete missions to unlock new avatars', 'Invite friends and earn rewards', 'Win games to level up faster', 'Deposit to unlock VIP avatars'];

function ldPips(n) {
  const P = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n];
  return '<div class="ld-fc f' + n + '">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => '<i' + (P.includes(i) ? ' class="p' + (n === 1 ? ' r' : '') + '"' : '') + '></i>').join('') + '</div>';
}
const ldDice = c => '<div class="ld-cube ' + c + '">' + [1, 2, 3, 4, 5, 6].map(ldPips).join('') + '</div>';

(() => {
  const css = `
#ld{position:absolute;inset:0;z-index:999;display:flex;flex-direction:column;align-items:center;overflow:hidden;color:#fff;
 background:url(assets/loading_bg.png) center/cover no-repeat,radial-gradient(ellipse at 50% 30%,#7a3ff0 0%,#4a1fb0 45%,#1e0a52 100%);transition:opacity .45s ease,transform .45s ease}
#ld.out{opacity:0;transform:scale(1.04);pointer-events:none}
#ld:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(15,4,50,.75),transparent 55%),radial-gradient(ellipse at 50% 0%,rgba(15,4,50,.45),transparent 40%);pointer-events:none}
.ld-sp{position:absolute;width:calc(5*var(--u));height:calc(5*var(--u));border-radius:50%;background:#ffe9a0;box-shadow:0 0 calc(8*var(--u)) #ffd34c;opacity:0;animation:ldSp 3.2s ease-in-out infinite}
@keyframes ldSp{0%{opacity:0;transform:translateY(0) scale(.4)}30%{opacity:1}100%{opacity:0;transform:translateY(calc(-90*var(--u))) scale(1.1)}}
.ld-top{position:relative;margin-top:calc(54*var(--u));height:calc(150*var(--u));width:100%;display:flex;align-items:center;justify-content:center;animation:ldDrop .9s cubic-bezier(.2,1.2,.3,1) both}
.ld-top img{max-width:84%;max-height:100%;object-fit:contain;filter:drop-shadow(0 calc(6*var(--u)) calc(10*var(--u)) rgba(0,0,0,.45))}
.ld-top h1{font-size:calc(44*var(--u));font-weight:800;line-height:.95;text-align:center;color:#ffb92e;-webkit-text-stroke:calc(2.5*var(--u)) #5a2bd0;paint-order:stroke fill;text-shadow:0 calc(5*var(--u)) 0 #3a1a96}
.ld-top h1 span{display:block;font-size:calc(34*var(--u));color:#fff;-webkit-text-stroke-color:#3a1a96}
@keyframes ldDrop{from{transform:translateY(calc(-40*var(--u)));opacity:0}to{transform:none;opacity:1}}
.ld-stage{position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;perspective:calc(700*var(--u))}
.ld-main{position:relative;width:calc(86*var(--u));height:calc(86*var(--u));animation:ldHop 1.5s cubic-bezier(.3,0,.4,1) infinite}
.ld-sh{position:absolute;left:50%;bottom:calc(-34*var(--u));width:calc(80*var(--u));height:calc(14*var(--u));margin-left:calc(-40*var(--u));border-radius:50%;background:rgba(0,0,0,.5);filter:blur(calc(4*var(--u)));animation:ldSh 1.5s cubic-bezier(.3,0,.4,1) infinite}
@keyframes ldHop{0%,100%{transform:translateY(0)}45%{transform:translateY(calc(-56*var(--u)))}}
@keyframes ldSh{0%,100%{transform:scale(1);opacity:.55}45%{transform:scale(.55);opacity:.25}}
.ld-cube{position:absolute;inset:0;transform-style:preserve-3d;animation:ldRoll 3s linear infinite}
.ld-cube.sm{animation-duration:2.2s}
@keyframes ldRoll{0%{transform:rotateX(0) rotateY(0) rotateZ(0)}100%{transform:rotateX(720deg) rotateY(360deg) rotateZ(360deg)}}
.ld-fc{position:absolute;inset:0;border-radius:18%;background:linear-gradient(145deg,#fff,#e4dcff);border:calc(1.5*var(--u)) solid #cfc2f7;box-shadow:inset 0 0 calc(10*var(--u)) rgba(106,61,232,.25);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:14%;backface-visibility:hidden}
.ld-fc i{display:block;place-self:center;width:72%;aspect-ratio:1}
.ld-fc i.p{border-radius:50%;background:radial-gradient(circle at 35% 30%,#6a4ad0,#2a0f6a);box-shadow:inset 0 calc(1*var(--u)) calc(2*var(--u)) rgba(0,0,0,.5)}
.ld-fc i.p.r{background:radial-gradient(circle at 35% 30%,#ff7a7a,#c8102e);width:100%}
.ld-main .ld-fc:nth-child(1){transform:translateZ(calc(43*var(--u)))}
.ld-main .ld-fc:nth-child(2){transform:rotateY(90deg) translateZ(calc(43*var(--u)))}
.ld-main .ld-fc:nth-child(3){transform:rotateY(180deg) translateZ(calc(43*var(--u)))}
.ld-main .ld-fc:nth-child(4){transform:rotateY(-90deg) translateZ(calc(43*var(--u)))}
.ld-main .ld-fc:nth-child(5){transform:rotateX(90deg) translateZ(calc(43*var(--u)))}
.ld-main .ld-fc:nth-child(6){transform:rotateX(-90deg) translateZ(calc(43*var(--u)))}
.ld-mini{position:absolute;width:calc(34*var(--u));height:calc(34*var(--u))}
.ld-mini .ld-fc:nth-child(1){transform:translateZ(calc(17*var(--u)))}
.ld-mini .ld-fc:nth-child(2){transform:rotateY(90deg) translateZ(calc(17*var(--u)))}
.ld-mini .ld-fc:nth-child(3){transform:rotateY(180deg) translateZ(calc(17*var(--u)))}
.ld-mini .ld-fc:nth-child(4){transform:rotateY(-90deg) translateZ(calc(17*var(--u)))}
.ld-mini .ld-fc:nth-child(5){transform:rotateX(90deg) translateZ(calc(17*var(--u)))}
.ld-mini .ld-fc:nth-child(6){transform:rotateX(-90deg) translateZ(calc(17*var(--u)))}
.ld-mini.a{left:14%;top:18%;animation:ldFloat 3.4s ease-in-out infinite}
.ld-mini.b{right:13%;top:46%;width:calc(26*var(--u));height:calc(26*var(--u));animation:ldFloat 2.8s ease-in-out -1s infinite}
.ld-mini.b .ld-fc:nth-child(1){transform:translateZ(calc(13*var(--u)))}.ld-mini.b .ld-fc:nth-child(2){transform:rotateY(90deg) translateZ(calc(13*var(--u)))}.ld-mini.b .ld-fc:nth-child(3){transform:rotateY(180deg) translateZ(calc(13*var(--u)))}.ld-mini.b .ld-fc:nth-child(4){transform:rotateY(-90deg) translateZ(calc(13*var(--u)))}.ld-mini.b .ld-fc:nth-child(5){transform:rotateX(90deg) translateZ(calc(13*var(--u)))}.ld-mini.b .ld-fc:nth-child(6){transform:rotateX(-90deg) translateZ(calc(13*var(--u)))}
@keyframes ldFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-16*var(--u)))}}
.ld-bot{position:relative;width:100%;padding:0 calc(34*var(--u)) calc(46*var(--u));text-align:center}
.ld-tip{min-height:calc(20*var(--u));margin-bottom:calc(14*var(--u));font-weight:600;font-size:calc(13*var(--u));color:#e8dcff;text-shadow:0 1px 4px rgba(0,0,0,.6);transition:opacity .35s}
.ld-bar{position:relative;height:calc(36*var(--u));border-radius:999px;background:linear-gradient(180deg,#d9dff0,#f3f5fb);border:calc(3*var(--u)) solid #111;box-shadow:0 calc(4*var(--u)) calc(10*var(--u)) rgba(0,0,0,.45),inset 0 calc(2*var(--u)) calc(4*var(--u)) rgba(0,0,0,.25)}
.ld-clip{position:absolute;inset:0;border-radius:999px;overflow:hidden}
.ld-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:linear-gradient(180deg,#58f5c4 0%,#18d49a 55%,#0fb583 100%);overflow:hidden}
.ld-fill:after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-50%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);animation:ldShine 1.3s linear infinite}
@keyframes ldShine{to{left:130%}}
.ld-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:calc(18*var(--u));color:#0a3a30;text-shadow:0 1px 0 rgba(255,255,255,.45);z-index:2}
.ld-head{position:absolute;top:50%;left:0;width:calc(30*var(--u));height:calc(30*var(--u));margin:calc(-15*var(--u)) 0 0 calc(-12*var(--u));z-index:3;perspective:calc(200*var(--u));filter:drop-shadow(0 calc(2*var(--u)) calc(3*var(--u)) rgba(0,0,0,.5))}
.ld-head .ld-cube{animation-duration:1.4s}
.ld-head .ld-fc:nth-child(1){transform:translateZ(calc(15*var(--u)))}.ld-head .ld-fc:nth-child(2){transform:rotateY(90deg) translateZ(calc(15*var(--u)))}.ld-head .ld-fc:nth-child(3){transform:rotateY(180deg) translateZ(calc(15*var(--u)))}.ld-head .ld-fc:nth-child(4){transform:rotateY(-90deg) translateZ(calc(15*var(--u)))}.ld-head .ld-fc:nth-child(5){transform:rotateX(90deg) translateZ(calc(15*var(--u)))}.ld-head .ld-fc:nth-child(6){transform:rotateX(-90deg) translateZ(calc(15*var(--u)))}
.ld-ver{margin-top:calc(12*var(--u));font-size:calc(11*var(--u));color:rgba(255,255,255,.55)}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();

function ldBuild() {
  const o = document.createElement('div'); o.id = 'ld';
  let sp = ''; for (let i = 0; i < 14; i++) sp += `<i class="ld-sp" style="left:${(i * 37 + 8) % 96}%;top:${35 + (i * 23) % 50}%;animation-delay:${(i % 7) * .45}s"></i>`;
  o.innerHTML = sp +
    `<div class="ld-top"><img src="assets/loading_logo.png" alt="" onerror="this.outerHTML='<h1>LUDO<span>MASTERS</span></h1>'"></div>
<div class="ld-stage"><div class="ld-mini a">${ldDice('sm')}</div><div class="ld-mini b">${ldDice('sm')}</div><div class="ld-main">${ldDice('')}<div class="ld-sh"></div></div></div>
<div class="ld-bot"><div class="ld-tip" id="ldTip">${LOAD_TIPS[0]}</div>
<div class="ld-bar"><div class="ld-clip"><div class="ld-fill" id="ldFill"></div></div><div class="ld-head" id="ldHead">${ldDice('')}</div><div class="ld-pct" id="ldPct">0%</div></div>
<div class="ld-ver">Loading game assets…</div></div>`;
  document.getElementById('app').appendChild(o);
  return o;
}

/* ---- network-aware preload ---- */
const LD_WEB = /^https?:$/.test(location.protocol);
const ldSleep = ms => new Promise(r => setTimeout(r, ms));
const ldNetSet = new Set();                       /* jin files par abhi network error aa raha hai */
const ldOffline = () => navigator.onLine === false || ldNetSet.size > 0;
function ldWaitOnline() {
  return new Promise(r => {
    const f = () => { removeEventListener('online', f); r(); };
    addEventListener('online', f);
    setTimeout(f, 2500);                           /* online event na aaye to bhi 2.5s baad dobara try */
  });
}
function ldOnce(url) {
  return new Promise(res => {
    const im = new Image(); let d = 0;
    const f = r => { if (d) return; d = 1; clearTimeout(t); res(r); };
    const t = setTimeout(() => f('timeout'), 20000);
    im.onload = () => f('ok'); im.onerror = () => f('err');
    im.src = url;
  });
}
/* PNG load karo. File exist hi nahi karti (404) -> skip. Network issue -> tab tak retry jab tak net na aaye. */
async function ldLoadImg(n) {
  const url = 'assets/' + n + '.png';
  for (; ;) {
    const r = await ldOnce(url);
    if (r === 'ok') { ldNetSet.delete(n); return; }
    let net = navigator.onLine === false;
    if (!net && LD_WEB) { try { await fetch(url, { method: 'HEAD', cache: 'no-store' }); } catch (e) { net = true; } }
    if (!net && r === 'err') { ldNetSet.delete(n); return; }     /* file missing hai, aage badho */
    if (net) ldNetSet.add(n); else ldNetSet.delete(n);            /* net theek par slow -> dobara try */
    await ldWaitOnline(); await ldSleep(1500);
  }
}
function ldPreload(onStep) {
  const list = LOAD_IMGS.slice();
  
  if (typeof myAv === 'number' && myAv > 5) list.push('av' + myAv);
  const uniq = [...new Set(list)];
  let done = 0; const total = uniq.length + 1;
  const step = () => { done++; onStep(done / total); };
  return Promise.all(uniq.map(n => ldLoadImg(n).then(step)).concat([
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(step, step)
  ]));
}
/* Home render hone ke baad screen par jo <img> hain unka load hona bhi wait karo */
function ldDomImgs() {
  const imgs = [...document.querySelectorAll('#app img')].filter(i => !i.closest('#ld') && !i.complete);
  return Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 30000); })));
}

(() => {
  const st = document.createElement('style');
  st.textContent = `.ld-head{margin:0!important;top:50%!important;transform:translateY(-50%);transition:left .15s linear}.ld-fill{transition:width .2s linear}
.ld-ver{min-height:calc(16*var(--u))}.ld-ver.err{color:#ffc9c9;font-weight:700;font-size:calc(13*var(--u));text-shadow:0 1px 4px rgba(0,0,0,.6)}
.ld-ver.slow{color:#ffe9a0;font-weight:600}
#ld.net .ld-fill{background:linear-gradient(180deg,#ff9a9a,#e04646 55%,#b82a2a)}
#ld.net .ld-fill:after{animation-duration:.7s}
#ld.net .ld-main{animation:ldHop 1.5s cubic-bezier(.3,0,.4,1) infinite,ldWob .5s ease-in-out infinite}
@keyframes ldWob{0%,100%{margin-left:0}50%{margin-left:calc(5*var(--u))}}`;
  document.head.appendChild(st);
})();

const _boot = boot;
boot = async function () {
  const ov = ldBuild(), fill = document.getElementById('ldFill'), head = document.getElementById('ldHead'), pct = document.getElementById('ldPct'), tip = document.getElementById('ldTip'), ver = ov.querySelector('.ld-ver');
  const t0 = performance.now(), MIN = 2200;
  let target = 0, shown = 0, finished = false, closed = false, ti = 0, lastMove = t0, lastShown = 0;
  const tipT = setInterval(() => { tip.style.opacity = 0; setTimeout(() => { tip.textContent = LOAD_TIPS[++ti % LOAD_TIPS.length]; tip.style.opacity = 1; }, 300); }, 2400);
  const paint = () => {
    fill.style.width = shown + '%';
    head.style.left = 'calc(' + shown + '% - ' + (shown * 0.3).toFixed(2) + ' * var(--u))';   /* dice bar ke saath aage chalta hai */
    pct.textContent = Math.floor(shown) + '%';
  };
  const status = () => {
    if (ldOffline()) { ov.classList.add('net'); ver.className = 'ld-ver err'; ver.textContent = '⚠ Network issue. Check your internet connection'; return; }
    ov.classList.remove('net');
    if (performance.now() - lastMove > 5000) { ver.className = 'ld-ver slow'; ver.textContent = 'Slow connection… please wait'; }
    else { ver.className = 'ld-ver'; ver.textContent = 'Loading game assets…'; }
  };
  const tick = () => {
    if (closed) return;
    const el = performance.now() - t0;
    const cap = Math.min(100, el / MIN * 100);
    /* shuru se hi bar chalti dikhe: pehli image load hone se pehle bhi halka sa aage badhti hai (max 20%) */
    const creep = ldOffline() ? 0 : 20 * (1 - Math.exp(-el / 2500));
    const goal = finished ? Math.min(100, cap) : Math.min(Math.max(target * 100, creep), cap, 96);
    shown += Math.max(0, goal - shown) * 0.12;
    if (finished && shown > 99.4) shown = 100;
    if (shown - lastShown >= 0.3) { lastShown = shown; lastMove = performance.now(); }
    paint(); status();
    if (shown >= 100) { closed = true; clearInterval(tipT); setTimeout(() => { ov.classList.add('out'); setTimeout(() => ov.remove(), 500); }, 250); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    await ldPreload(p => { target = Math.max(target, p * 0.8); });          /* sab assets (net na ho to yahin ruka rahega) */
    while (navigator.onLine === false) { ldNetSet.add('net'); await ldWaitOnline(); }
    ldNetSet.delete('net'); target = Math.max(target, 0.85);
    await _boot();                                                           /* Firebase login + Home render */
    target = Math.max(target, 0.92);
    await ldDomImgs();                                                       /* home par dikhne wali sab images */
  } catch (e) { console.error(e); }
  finished = true;
};

/* =====================================================================
   v6: GAME ke andar background music band (music sirf app me chalega)
   ===================================================================== */
const inGame = () => document.getElementById('app').classList.contains('game-active');
const _bgmPlay = bgm.play.bind(bgm);
bgm.play = function () { return inGame() ? Promise.resolve() : _bgmPlay(); };

const _oms = onMatchStart;
onMatchStart = function (m) {
  const r = _oms(m);                      /* game-active class turant lag jati hai */
  try { bgm.pause(); } catch (e) { }
  return r;
};
(() => {
  const g2 = go;
  go = function (v) {
    g2(v);
    if (!inGame() && S.mus && bgm.paused && !document.hidden && v !== 'match') bgm.play().catch(() => { });   /* game se bahar aate hi music wapas */
    if (inGame()) { try { bgm.pause(); } catch (e) { } }
  };
})();
