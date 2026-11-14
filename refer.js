/* =====================================================================
   refer.js  —  Ludo Masters
   Refer & Earn (Leaderboard / Rules / My Rewards / My Referrals),
   Help & Support, About, Privacy, Terms, Community links.

   index.html me ads.js ke BAAD aur boot() se PEHLE:
     <script src="refer.js"></script>

   Telegram link:  https://t.me/Lwinup_bot/winup?startapp=ref_<code>
   BOT TOKEN is file me KABHI nahi daalna (client code public hota hai).

   Firebase paths (naye):
     refCodes/<code>          = referrer uid
     refs/<referrerUid>/<uid> = { ts, n, a, claimed, g, c }
     refTg/<telegramId>       = { by, u, ts }   (ek Telegram account = sirf ek referral)
     lb/w/<weekStart>/<uid>   = { n, a, p }     (weekly leaderboard)
     lb/d/<day>/<uid>         = { n, a, p }     (yesterday)
     feedback/<id>            = { uid, name, msg, ts }
     config/refer             = admin panel ke settings

   ASSETS (assets/ folder, sab naam underscore me):
     ref_bg.png        forest + blue rays full background (bina UI ke)
     ref_sign.png      wooden sign + crown + laurel (number KHALI, number CSS se)
     ref_chest.png     treasure chest
     ref_lantern.png   lantern
     ref_dice.png      dice (right side CSS se flip hota hai)
     ref_rank1.png     GOLD podium  + crown + laurel ring
     ref_rank2.png     BLUE podium  + crown + laurel ring
     ref_rank3.png     ORANGE podium + crown + laurel ring
                       (teeno same width/height, ring ke andar transparent)
     ref_coin.png      Rupee coin
     ref_cal_w.png, ref_cal_y.png, ref_cal_l.png   sub-tab calendar icons
     ref_group.png     channel banner icon
     ref_wa.png, ref_tg.png   feedback bar icons
     --- My Rewards page: sirf ye NAYE PNG chahiye ---
     ref_rw_bg.png, ref_gift.png, ref_t_rf.png, ref_ic_check.png,
     ref_ic_clock.png, ref_ic_date.png, ref_ic_doc.png
     (baaki icons pehle se maujood: stat_trophy, title_community, wallet_icon,
      level_crown, stat_star, ref_coin, logo. Naam badalne ho to RWA table dekho)
     --- My Referrals page: NAYE PNG ---
     ref_rf_head.png (aapka Ludo Masters header, nahi mila to logo.png dikhega),
     ref_rf_bg.png, ref_ic_mail.png, ref_ic_hourglass.png, ref_rf_kids.png,
     ref_rf_add.png, ref_rf_mega.png, ref_ic_link.png, ref_s_fb.png
   ===================================================================== */
const BOT_APP = 'https://t.me/Lwinup_bot/winup';
const REF_DEF = {
  enabled: true, rewardGems: 50, rewardCash: 0, welcomeGems: 20, ptsPerRef: 100,
  prizes: '500,300,200,100,100,50,50,50,50,50', channelUrl: '', supportUrl: ''
};
let REFC = Object.assign({}, REF_DEF), REFC_T = 0;
let REFS = {};                                   /* mere referrals */
let RF = { tab: 'lb', per: 'w', rw: 'total' };
let LBD = { w: [], y: [], l: [], t: 0, load: 0 };
let refBusy = 0, refListening = 0;
const RF_LAST = {};

/* ---------- helpers ---------- */
const rn = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const p2 = n => String(n).padStart(2, '0');
const rD = d => { d = new Date(d); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const dmy = d => p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear();
const rfm = n => Number(n || 0).toLocaleString('en-IN');
const rsleep = ms => new Promise(r => setTimeout(r, ms));
const rget = p => fdb.ref(p).once('value').then(s => s.val() || {}).catch(() => ({}));
const rtg = () => (window.Telegram && Telegram.WebApp) || null;
const refCode = () => String(UID || '').slice(0, 10);
const refLink = () => UID ? BOT_APP + '?startapp=ref_' + refCode() : BOT_APP;
function wk(off) {                                /* hafta SATURDAY se shuru */
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7) - off * 7); return d;
}
const yd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1); };
const prizes = () => (Array.isArray(REFC.prizes) ? REFC.prizes : String(REFC.prizes || '').split(',')).map(x => Math.max(0, rn(x)));
const rsort = o => Object.entries(o).map(([u, v]) => ({ u, ...v })).filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 50);

async function refCfg(force) {
  if (!force && Date.now() - REFC_T < 60000) return;
  REFC_T = Date.now();
  const v = await rget('config/refer');
  REFC = Object.assign({}, REF_DEF, v);
}

/* ---------- open / share ---------- */
function refOpenUrl(url) {
  const tg = rtg();
  try {
    if (tg && /^https:\/\/t\.me\//.test(url) && tg.openTelegramLink) tg.openTelegramLink(url);
    else if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, '_blank');
  } catch (e) { window.open(url, '_blank'); }
}
function refOpen(k) { const u = REFC[k]; if (!u) { toast('Coming soon'); return; } refOpenUrl(u); }
function refCopy() {
  const t = refLink();
  const done = () => toast('Link copied ✓');
  try { navigator.clipboard.writeText(t).then(done, fb); } catch (e) { fb(); }
  function fb() {
    try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = 0; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }
    catch (e) { toast('Copy failed'); }
  }
}
function refShare(k) {
  const link = refLink(), text = 'Join me on Ludo Masters and win real rewards! 🎲 Use my link:';
  const u = encodeURIComponent(link), t = encodeURIComponent(text);
  if (k === 'sh') { if (navigator.share) { navigator.share({ title: 'Ludo Masters', text, url: link }).catch(() => { }); } else refCopy(); return; }
  const urls = {
    tg: 'https://t.me/share/url?url=' + u + '&text=' + t,
    wa: 'https://wa.me/?text=' + t + '%20' + u,
    fb: 'https://www.facebook.com/sharer/sharer.php?u=' + u
  };
  refOpenUrl(urls[k]);
}
/* purane "invite" buttons ab real Refer page kholte hain (share karne se free reward nahi milta) */
invite = function () { RF.tab = 'rf'; go('refer'); };
invMis = function () { RF.tab = 'rf'; go('refer'); };

/* ---------- referral capture (naya user link se aaye) ---------- */
async function refCapture(v) {
  if (REFC.enabled === false) return;
  let tg = null;
  for (let i = 0; i < 20; i++) { tg = rtg(); if (tg) break; await rsleep(150); }
  if (!tg || !tg.initDataUnsafe) return;
  const sp = tg.initDataUnsafe.start_param || '', tu = tg.initDataUnsafe.user;
  if (!/^ref_/.test(sp) || !tu || !tu.id) return;
  const code = sp.slice(4);
  if (!code || code === refCode()) return;
  if (v && v.ref && v.ref.by) return;                                   /* pehle se kisi ke referral se aaya */
  if (v && v.createdAt && Date.now() - v.createdAt > 2 * 864e5) return; /* sirf naye users */
  if (ST.played > 0) return;
  const rUid = (await fdb.ref('refCodes/' + code).once('value')).val();
  if (!rUid || rUid === UID) return;
  const tx = await fdb.ref('refTg/' + tu.id).transaction(x => x ? undefined : { by: rUid, u: UID, ts: Date.now() });
  if (!tx.committed) return;                                            /* ye Telegram account pehle use ho chuka */
  await fdb.ref('refs/' + rUid + '/' + UID).set({ ts: Date.now(), n: String(tu.first_name || 'Friend').slice(0, 16), a: 'av' + myAv });
  dbSet('ref', { by: rUid, ts: Date.now() });
  const wg = rn(REFC.welcomeGems);
  if (wg > 0) { BAL.gems += wg; saveBal(); refreshBal(); toast('🎁 Welcome bonus +' + wg + ' 💎'); }
}
function refListen() {
  if (refListening || !UID) return; refListening = 1;
  let first = 1;
  fdb.ref('refs/' + UID).on('value', s => {
    const v = s.val() || {};
    if (!first) {
      const n = Object.keys(v).filter(k => !REFS[k]);
      if (n.length) toast('🎉 ' + (v[n[0]].n || 'A friend') + ' joined with your link!');
    }
    first = 0; REFS = v; refSyncLb(); refRender();
  });
}
async function refInit(v) {
  if (!UID) return;
  try {
    await refCfg(true);
    fdb.ref('refCodes/' + refCode()).set(UID).catch(() => { });
    refListen();
    await refCapture(v);
  } catch (e) { console.error('refInit', e); }
}
(() => {
  const o = applyRemote;
  applyRemote = function (v, first) { o(v, first); if (first) refInit(v); };
})();

/* ---------- leaderboard points (har referrer apni entry khud likhta hai) ---------- */
function refSyncLb() {
  if (!UID) return;
  const L = Object.values(REFS), pts = rn(REFC.ptsPerRef);
  const cnt = (a, b) => L.filter(r => r.ts >= a.getTime() && r.ts < b.getTime()).length * pts;
  const w0 = wk(0), w1 = wk(1), y0 = yd(), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const nx = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  [['w/' + rD(w0), cnt(w0, nx(w0))], ['w/' + rD(w1), cnt(w1, nx(w1))], ['d/' + rD(y0), cnt(y0, t0)]].forEach(([k, p]) => {
    if (RF_LAST[k] === p) return; RF_LAST[k] = p;
    if (p > 0) fdb.ref('lb/' + k + '/' + UID).set({ n: PROF.name, a: 'av' + myAv, p }).catch(() => { });
  });
}
async function refLoad(force) {
  if (LBD.load || (!force && Date.now() - LBD.t < 30000)) return;
  LBD.load = 1;
  try {
    await refCfg();
    const [w, y, l] = await Promise.all([rget('lb/w/' + rD(wk(0))), rget('lb/d/' + rD(yd())), rget('lb/w/' + rD(wk(1)))]);
    LBD.w = rsort(w); LBD.y = rsort(y); LBD.l = rsort(l); LBD.t = Date.now();
  } catch (e) { console.error(e); }
  LBD.load = 0; refRender();
}
function refRender() {
  if (cur !== 'refer') return;
  const s = document.getElementById('screen'), t = s.scrollTop;
  s.innerHTML = V.refer(); s.scrollTop = t;
  rwMark();
}
function rwMark() { const ap = document.getElementById('app'); if (!ap) return; ap.classList.toggle('rw', cur === 'refer' && RF.tab === 'rw'); ap.classList.toggle('rfp', cur === 'refer' && RF.tab === 'rf'); }
/* rank 2/3 ki image na mile to rank 1 wali image fallback ke roop me dikhao */
function rfFb(im) {
  if (im.dataset.fb) { im.remove(); return; }
  im.dataset.fb = 1; im.classList.add('fb'); im.src = 'assets/ref_rank1.png';
}
function refTab(t) { RF.tab = t; refRender(); document.getElementById('screen').scrollTop = 0; if (t === 'lb') refLoad(); }
function refPer(p) { RF.per = p; refRender(); }
function refRw(x) { RF.rw = x; refRender(); }

/* ---------- claim ---------- */
async function refClaim(ids, btn) {
  if (refBusy) return; refBusy = 1;
  let g = 0, c = 0;
  try {
    for (const id of ids) {
      const r = REFS[id]; if (!r || r.claimed) continue;
      const gg = rn(REFC.rewardGems), cc = rn(REFC.rewardCash);
      const res = await fdb.ref('refs/' + UID + '/' + id + '/claimed').transaction(x => x ? undefined : 1);
      if (!res.committed) continue;
      fdb.ref('refs/' + UID + '/' + id).update({ g: gg, c: cc, cts: Date.now() }).catch(() => { });
      REFS[id] = Object.assign({}, r, { claimed: 1, g: gg, c: cc });
      g += gg; c += cc; msAdd('inv'); tkAdd('i1');
    }
  } catch (e) { console.error(e); }
  refBusy = 0;
  if (g || c) rewardFx(btn, { g, c }, () => refRender());
  else toast('Nothing to claim');
}
const refClaimAll = btn => refClaim(Object.keys(REFS).filter(k => !REFS[k].claimed), btn);

/* ---------- feedback ---------- */
function refFeedback() {
  sheet(`<div class="pp-t">Feedback</div><p class="pp-p">Tell us what went wrong or how we can improve.</p>
<textarea id="rffb" maxlength="300" rows="4" placeholder="Write your message…"></textarea>
<div class="pp-bt"><button class="pp-c" onclick="ppClose()">Cancel</button><button class="pp-s" onclick="refSendFb()">Send</button></div>`);
}
function refSendFb() {
  const m = (document.getElementById('rffb') || {}).value || '';
  if (m.trim().length < 5) { toast('Please write a little more'); return; }
  fdb.ref('feedback').push({ uid: UID || '', name: PROF.name, msg: m.trim(), ts: Date.now() }).catch(() => { });
  ppClose(); toast('Thanks! Feedback sent ✓');
}

/* =====================================================================
   REFER PAGE
   ===================================================================== */
const rfAv = i => 'av' + (i % 6 + 1);   /* khali slot ke liye default avatar (real player nahi) */
const rcoin = (s = 18) => A('ref_coin', '🪙', s, s + 4);
const shareBox = () => `<div class="rf-sh"><div class="rf-st">Share your referral link &amp; start earning</div>
<div class="rf-lk"><span>${esc(refLink())}</span><button onclick="refCopy()">${A('copy', '⧉', 16, 20)}</button></div>
<div class="rf-sb">${[['wa', 'ref_wa', '💬'], ['tg', 'telegram', '✈️'], ['fb', 'ref_fb', 'f'], ['sh', 'ref_share', '⤴']].map(b => `<button class="rf-b ${b[0]}" onclick="refShare('${b[0]}')">${A(b[1], b[2], 26, 34)}</button>`).join('')}</div></div>`;

function vLb() {
  const list = LBD[RF.per] || [], pr = prizes(), total = pr.slice(0, 10).reduce((a, b) => a + b, 0), showPz = RF.per !== 'y';
  const me = list.findIndex(x => x.u === UID), myP = me >= 0 ? list[me].p : 0;
  const pod = i => {
    const e = list[i], z = showPz ? pr[i] || 0 : 0;
    return `<div class="rf-pd p${i + 1}${e ? '' : ' em'}">
<img class="rf-fr" src="assets/ref_rank${i + 1}.png" alt="" onerror="rfFb(this)">
<span class="rf-av">${A(e ? (e.a || 'av1') : rfAv(i), '🧑', 40, 0)}</span>
<b class="rf-rk">${i + 1}</b>
<div class="rf-ti"><div class="rf-pn">${e ? esc(e.n) : 'Open slot'}</div>
<div class="rf-pp">${showPz ? rcoin(15) + rfm(z) : ''}</div>
<small class="rf-ps">Points: ${rfm(e ? e.p : 0)}</small></div></div>`;
  };
  const rows = [];
  for (let i = 3; i < 10; i++) {
    const e = list[i];
    rows.push(`<div class="rf-r${e ? '' : ' em'}"><b class="n">${i + 1}</b><span class="pl">${A(e ? (e.a || 'av1') : rfAv(i), '🧑', 26, 0)}<span>${e ? esc(e.n) : 'Open slot'}</span></span><span class="pt">${e ? rfm(e.p) : '—'}</span><span class="pz">${showPz ? rcoin(16) + rfm(pr[i] || 0) : '—'}</span></div>`);
  }
  return `<div class="rf-hero">
<img class="rf-dice l" src="assets/ref_dice.png" alt="">
<img class="rf-dice r" src="assets/ref_dice.png" alt="">
<img class="rf-lantern" src="assets/ref_lantern.png" alt="">
<div class="rf-sign"><img src="assets/ref_sign.png" alt=""><b>${showPz ? rfm(total) : rfm(LBD.y.reduce((s, x) => s + x.p, 0))}</b></div>
<img class="rf-chest" src="assets/ref_chest.png" alt="">
<div class="rf-tip">Tips: leaderboard updates every 30 minutes</div></div>
<div class="rf-sub">${[['w', 'This Week', 'ref_cal_w', '📅'], ['y', 'Yesterday Earn', 'ref_cal_y', '🎁'], ['l', 'Last Week', 'ref_cal_l', '🗓️']].map(s => `<button class="${RF.per === s[0] ? 'on' : ''}" onclick="refPer('${s[0]}')">${A(s[2], s[3], 18, 22)}${s[1]}</button>`).join('')}</div>
<div class="rf-pods">${pod(1)}${pod(0)}${pod(2)}</div>
<div class="rf-tb"><div class="rf-yr"><span>Your Rank:${me >= 0 ? me + 1 : '-'}</span><span>Points: ${rfm(myP)}</span></div>
<div class="rf-th"><span>Rank</span><span>Player</span><span>Points</span><span>Prize</span></div>${rows.join('')}
${list.length ? '' : '<div class="rf-em">No referrals yet. Invite friends to enter the leaderboard!</div>'}</div>
<div class="rf-ag" onclick="refOpen('channelUrl')">${A('ref_group', '👥', 34, 40)}<span>Join agent channel to learn how be a agent and earn much</span><b>›</b></div>
<div class="rf-fb"><div class="rf-fi"><span class="rf-ic">${A('ref_wa', '💬', 48, 56)}${A('ref_tg', '✈️', 48, 56)}</span><small>Referral link not working?</small></div><button onclick="refFeedback()">Feedback Now</button></div>`;
}

function vRules() {
  const pr = prizes(), g = rn(REFC.rewardGems), c = rn(REFC.rewardCash), w = rn(REFC.welcomeGems), pt = rn(REFC.ptsPerRef);
  const rew = (g ? g + ' 💎' : '') + (g && c ? ' + ' : '') + (c ? '₹' + c : '');
  return `<div class="rf-card"><h3>How it works</h3><ol class="rf-ol">
<li><b>Share</b> your personal link from the My Rewards or My Referrals tab.</li>
<li>Your friend opens the link in <b>Telegram</b> and starts the game as a <b>new player</b>.</li>
<li>They show up in <b>My Referrals</b>. Tap <b>Claim</b> to collect <b>${rew || 'your reward'}</b> per friend.</li>
<li>Each friend also earns you <b>${rfm(pt)} leaderboard points</b>. Top 10 each week win prizes.</li></ol></div>
<div class="rf-card"><h3>Rewards</h3>
<div class="rf-kv"><span>You get (per friend)</span><b>${rew || '—'}</b></div>
<div class="rf-kv"><span>Your friend gets (welcome)</span><b>${w ? w + ' 💎' : '—'}</b></div>
<div class="rf-kv"><span>Leaderboard points per friend</span><b>${rfm(pt)}</b></div></div>
<div class="rf-card"><h3>Weekly prizes (Top 10)</h3>
${pr.slice(0, 10).map((z, i) => `<div class="rf-kv"><span>Rank ${i + 1}</span><b>₹${rfm(z)}</b></div>`).join('')}
<small class="rf-sm">The week runs Saturday to Friday. Prizes are credited by our team after the week ends.</small></div>
<div class="rf-card"><h3>Terms</h3><ul class="rf-ul">
<li>Only new players who join through your link count.</li>
<li>One Telegram account can be referred only once. Self-referrals are not allowed.</li>
<li>Fake or duplicate accounts will be removed and rewards cancelled.</li>
<li>We may change rewards or rules at any time.</li></ul></div>`;
}

function refList() { return Object.entries(REFS).map(([u, r]) => ({ u, ...r })).sort((a, b) => b.ts - a.ts); }

/* My Rewards icons: yaha PNG ke naam badal sakte ho. Jo pehle se aapke assets me the wahi use kiye hain. */
const RWA = {
  lb: 'stat_trophy', rules: 'title_community', rw: 'ref_gift', rf: 'ref_t_rf',
  wallet: 'wallet_icon', gift: 'ref_gift', claimGift: 'ref_gift', crown: 'level_crown',
  friends: 'title_community', star: 'stat_star', cash: 'ref_coin',
  check: 'ref_ic_check', clock: 'ref_ic_clock', date: 'ref_ic_date', doc: 'ref_ic_doc',
  /* My Referrals page */
  mail: 'ref_ic_mail', hourglass: 'ref_ic_hourglass', gem: 'gem', kids: 'ref_rf_kids', add: 'ref_rf_add',
  mega: 'ref_rf_mega', link: 'ref_ic_link', copy: 'copy', wa: 'ref_wa', tg: 'telegram', fb: 'ref_s_fb', more: 'ref_t_rf'
};
const rwI = (n, e, w, h) => A(n, e, w, h || w);
function vRewards() {
  const g = rn(REFC.rewardGems), c = rn(REFC.rewardCash), pt = rn(REFC.ptsPerRef);
  const today = rD(Date.now()), all = refList();
  const sc = RF.rw === 'total' ? all : all.filter(r => rD(r.ts) === today);
  const cl = sc.filter(r => r.claimed), pe = sc.filter(r => !r.claimed);
  const cash = cl.reduce((s, r) => s + rn(r.c), 0), gems = cl.reduce((s, r) => s + rn(r.g), 0);
  const pg = pe.length * g, pc = pe.length * c;
  const st = [[RWA.friends, '👥', 'Friends', sc.length], [RWA.check, '✅', 'Claimed', cl.length],
    [RWA.clock, '🕒', 'Pending', pe.length], [RWA.star, '⭐', 'Points', sc.length * pt]];
  const hd = [[RWA.date, '📅', 'Date'], [RWA.cash, '🪙', 'Total Cash'], [RWA.star, '⭐', 'Total Bonus'], [RWA.doc, '📄', 'Details']];
  return `<div class="rw-seg"><button class="${RF.rw === 'total' ? 'on' : ''}" onclick="refRw('total')">Total</button><button class="${RF.rw === 'today' ? 'on' : ''}" onclick="refRw('today')">Today</button></div>
<div class="rw-cards">
<div class="rw-cd"><span class="rw-ico">${rwI(RWA.wallet, '👛', 70, 70)}</span><b>Cash</b><div class="rw-pill">₹${rfm(cash)}</div></div>
<div class="rw-cd"><span class="rw-ico">${rwI(RWA.gift, '🎁', 70, 70)}</span><b>Bonus</b><div class="rw-pill">${rfm(gems)}</div></div></div>
<div class="rw-st">${st.map(x => `<div>${rwI(x[0], x[1], 30, 30)}<small>${x[2]}</small><span>${rfm(x[3])}</span></div>`).join('')}</div>
<div class="rw-cur">${rwI(RWA.crown, '👑', 40, 36)}<span>Current Bonus:</span><b>${rfm(pg)}${pc ? ' + ₹' + rfm(pc) : ''}</b></div>
<div class="rw-clw"><i class="sp l"></i><button class="rw-claim${pe.length ? '' : ' off'}" ${pe.length ? 'data-ns' : ''} onclick="refClaimAll(this)">${rwI(RWA.claimGift, '🎁', 34, 34)}<span>Claim</span></button><i class="sp r"></i></div>
<div class="rw-lt"><div class="rw-lh">${hd.map(h => `<div>${rwI(h[0], h[1], 20, 20)}<span>${h[2]}</span></div>`).join('')}</div>
${sc.length ? sc.map(r => `<div class="rf-lr"><span>${dmy(new Date(r.ts))}</span><span>${rfm(r.claimed ? r.c : c)}</span><span class="gm">${A('gem', '💎', 16, 20)}${rfm(r.claimed ? r.g : g)}</span>${r.claimed ? '<span class="ok">Claimed</span>' : `<button onclick="refClaim(['${r.u}'],this)">Claim</button>`}</div>`).join('') : '<div class="rw-em">No rewards yet. Share your link to start earning!</div>'}</div>
${shareBox()}`;
}

const shareBox2 = () => `<div class="rr-sh"><div class="rr-sht">${rwI(RWA.mega, '📣', 90, 70)}<div><span>Share your referral link &amp;</span><b>start earning</b></div></div>
<div class="rr-lk">${rwI(RWA.link, '🔗', 24, 24)}<span>${esc(refLink())}</span><button onclick="refCopy()">${A(RWA.copy, '⧉', 22, 26)}</button></div>
<div class="rr-sb">${[['wa', RWA.wa, '💬', 'WhatsApp'], ['tg', RWA.tg, '✈️', 'Telegram'], ['fb', RWA.fb, 'f', 'Facebook'], ['sh', RWA.more, '⤴', 'More']].map(b => `<button class="rr-b ${b[0]}" onclick="refShare('${b[0]}')">${rwI(b[1], b[2], 40, 44)}<small>${b[3]}</small></button>`).join('')}</div></div>`;

function vRefs() {
  const L = refList(), g = rn(REFC.rewardGems), c = rn(REFC.rewardCash);
  const cl = L.filter(r => r.claimed), pe = L.filter(r => !r.claimed);
  const eg = cl.reduce((s, r) => s + rn(r.g), 0), ec = cl.reduce((s, r) => s + rn(r.c), 0);
  const st = [[RWA.mail, '✉️', 'Invited', L.length], [RWA.check, '✅', 'Claimed', cl.length], [RWA.hourglass, '⏳', 'Pending', pe.length], [RWA.gem, '💎', 'Earned', eg]];
  const rows = L.map(r => `<div class="rf-fr2"><span class="rf-fa">${A(r.a || 'av1', '🧑', 30, 0)}</span><div><b>${esc(r.n || 'Friend')}</b><small>Joined ${dmy(new Date(r.ts))}</small></div>${r.claimed ? '<span class="rf-ok">Claimed ✓</span>' : `<button class="rf-cl" onclick="refClaim(['${r.u}'],this)">+${g ? g + '💎' : ''}${c ? ' ₹' + c : ''}</button>`}</div>`).join('');
  return `<div class="rr-st">${st.map(x => `<div>${rwI(x[0], x[1], 34, 34)}<small>${x[2]}</small><span>${rfm(x[3])}</span></div>`).join('')}</div>
${ec ? `<div class="rr-cash">Cash earned <b>₹${rfm(ec)}</b></div>` : ''}
${pe.length ? `<div class="rw-clw"><i class="sp l"></i><button class="rw-claim" data-ns onclick="refClaimAll(this)">${rwI(RWA.claimGift, '🎁', 34, 34)}<span>Claim all (${pe.length})</span></button><i class="sp r"></i></div>` : ''}
<div class="rr-fc"><div class="rr-top"><div class="rr-art">${rwI(RWA.kids, '👨‍👩‍👧', 150, 120)}<div class="rr-rb">My Friends (${L.length})</div></div><i class="rr-dv"></i>
<div class="rr-em">${rwI(RWA.add, '👥', 64, 56)}<b>${L.length ? L.length + (L.length > 1 ? ' friends' : ' friend') + ' joined.<br>Keep inviting!' : 'No friends yet.<br>Share your link below!'}</b></div></div>
${L.length ? '<div class="rr-list">' + rows + '</div>' : ''}</div>
${shareBox2()}`;
}

V.refer = () => {
  const tabs = [['lb', RWA.lb, '🏆', 'LEADER<br>BOARD'], ['rules', RWA.rules, '👥', 'REFER<br>RULES'], ['rw', RWA.rw, '🎁', 'MY<br>REWARDS'], ['rf', RWA.rf, '🔗', 'MY<br>REFERRALS']];
  const body = REFC.enabled === false ? '<div class="rf-card"><h3>Refer &amp; Earn</h3><p>This feature is currently unavailable. Please check back soon.</p></div>'
    : RF.tab === 'lb' ? vLb() : RF.tab === 'rules' ? vRules() : RF.tab === 'rw' ? vRewards() : vRefs();
  const nd = RF.tab === 'rw' || RF.tab === 'rf';   /* naya design wale tabs */
  const head = RF.tab === 'rw' ? '<div class="rw-head"><img src="assets/logo.png" alt="" onerror="this.style.display=\'none\'"></div>'
    : RF.tab === 'rf' ? '<div class="rw-head"><img src="assets/ref_rf_head.png" alt="" onerror="this.onerror=null;this.src=\'assets/logo.png\'"></div>' : '';
  return `${head}<div class="rf-top"><div class="rf-tabs">${tabs.map(t => `<button class="${RF.tab === t[0] ? 'on' : ''}" onclick="refTab('${t[0]}')">${nd ? rwI(t[1], t[2], 26, 26) + '<span>' + t[3] + '</span>' : t[3]}</button>`).join('')}</div></div>${body}`;
};

/* =====================================================================
   SUPPORT / ABOUT / PRIVACY / TERMS
   ===================================================================== */
const FAQ = [
  ['How do I withdraw money?', () => `Open Profile → Wallet → Withdraw. Only Rupees (₹) can be withdrawn and the minimum is ₹${MIN_WD}. Requests stay “pending” until our team reviews and pays them.`],
  ['What are Diamonds used for?', () => 'Diamonds are used to enter diamond pools. They cannot be withdrawn.'],
  ['How does Refer & Earn work?', () => 'Share your link from Profile → Refer & Earn. When a new player joins through it, you can claim your reward from the My Referrals tab.'],
  ['My referral reward is missing', () => 'The friend must open your link in Telegram and be a brand new player. Check the My Referrals tab and tap Claim. Still stuck? Use the feedback box below.'],
  ['Who do I play against?', () => 'Right now matches are played against an AI opponent. Real-player matches may be added later.'],
  ['Why was my account banned?', () => 'Accounts that cheat, abuse referrals or use fake accounts can be banned. Contact support if you think it was a mistake.']
];
function infoPage(title, ik, ie, back, inner) {
  return `<div class="pf-pg"><div class="pf-bar"><button class="pf-rb" onclick="go('${back}')">${A('back', '‹', 18, 22)}</button><div class="pf-t" style="display:flex;align-items:center;gap:6px">${A(ik, ie, 22, 28)}${title}</div><span style="width:36px"></span></div>${inner}</div>`;
}
V.support = () => infoPage('Help & Support', 'support', '🎧', 'profile', `
<div class="av-card"><div class="av-sh">Contact us</div>
<button class="pp-s vipb" style="margin-top:0" onclick="${REFC.supportUrl ? "refOpen('supportUrl')" : "refFeedback()"}">${REFC.supportUrl ? 'Chat on Telegram' : 'Send a message'}</button></div>
<div class="av-card"><div class="av-sh">Frequently asked questions</div>${FAQ.map(f => `<details class="rf-q"><summary>${f[0]}</summary><p>${f[1]()}</p></details>`).join('')}</div>
<div class="av-card"><div class="av-sh">Still need help?</div><button class="pp-s" style="width:100%" onclick="refFeedback()">Write feedback</button></div>`);
V.about = () => infoPage('About Us', 'about', 'ℹ️', 'community', `
<div class="av-card"><div class="av-sh">Ludo Masters</div><p class="rf-tx">Play Ludo, complete missions, invite friends and earn rewards, all inside Telegram.</p><p class="rf-tx">Version 1.0</p></div>
<div class="av-card"><div class="av-sh">Links</div>
<div class="pf-row" onclick="go('privacy')"><div><b>Privacy Policy</b></div>${A('chevron', '›', 16, 16)}</div>
<div class="pf-row" onclick="go('terms')"><div><b>Terms &amp; Conditions</b></div>${A('chevron', '›', 16, 16)}</div>
<div class="pf-row" onclick="go('support')"><div><b>Help &amp; Support</b></div>${A('chevron', '›', 16, 16)}</div></div>`);
V.privacy = () => infoPage('Privacy Policy', 'set_privacy', '🛡️', 'menu', `
<div class="av-card"><div class="av-sh">What we store</div><p class="rf-tx">Anonymous account ID, display name, avatar, balances, game stats, withdrawal requests (UPI ID) and referral records. If you join through a referral link we also store your Telegram user ID to stop duplicate referrals.</p></div>
<div class="av-card"><div class="av-sh">How we use it</div><p class="rf-tx">To run the game, credit rewards, process withdrawals, prevent fraud and improve the app. We do not sell your data.</p></div>
<div class="av-card"><div class="av-sh">Your choices</div><p class="rf-tx">You can edit your name and avatar in Profile. To delete your data, contact support.</p></div>`);
V.terms = () => infoPage('Terms & Conditions', 'set_terms', '📘', 'menu', `
<div class="av-card"><div class="av-sh">Fair play</div><p class="rf-tx">Cheating, fake accounts, automation and referral abuse are not allowed and can lead to a ban and loss of balance.</p></div>
<div class="av-card"><div class="av-sh">Rewards &amp; withdrawals</div><p class="rf-tx">Only Rupees can be withdrawn, above the minimum shown in the Wallet. Withdrawals are reviewed manually and can be rejected if fraud is suspected. Diamonds have no cash value.</p></div>
<div class="av-card"><div class="av-sh">Changes</div><p class="rf-tx">We may update rewards, prizes and these terms at any time. Continued use means you accept the changes.</p></div>`);

/* ---------- Community + Menu + Profile links ---------- */
V.community = () => `<div class="top"><div class="ttl">${A('title_community', '👥', 26, 30)}Community</div></div>
<div class="ban" style="padding:16px"><div><b>Join Our Community</b><small>Play • Share • Earn Together</small></div>${A('plane', '✈️', 40, 52)}</div>
${[['telegram', '✈️', 'Telegram Channel', 'Join Now', "refOpen('channelUrl')"], ['refer', '🎁', 'Refer a Friend', 'Earn Now', "go('refer')"], ['support', '🎧', 'Support', 'Get Help', "go('support')"], ['about', 'ℹ️', 'About Us', 'Learn More', "go('about')"]].map(r => `<div class="row" style="border-radius:0;margin:0;border-bottom:1px solid #ece6ff;cursor:pointer" onclick="${r[4]}"><span class="ic" style="background:none;font-size:28px">${A(r[0], r[1], 28, 36)}</span><div>${r[2]}</div><button class="sbtn">${r[3]}</button></div>`).join('')}`;
(() => {
  const m = V.menu;
  V.menu = function () {
    const map = { 'Privacy Policy': "go('privacy')", 'Terms &amp; Conditions': "go('terms')", 'Terms & Conditions': "go('terms')", 'Logout': 'ppLogout()' };
    return m().split('<div class="row plain">').map((s, i) => {
      if (!i) return s;
      const k = Object.keys(map).find(x => s.includes('<div>' + x + '</div>'));
      return '<div class="row plain"' + (k ? ' onclick="' + map[k] + '" style="cursor:pointer"' : '') + '>' + s;
    }).join('');
  };
  const p = V.profile;
  V.profile = function () {
    return p().replace('onclick="invite()"', "onclick=\"go('refer')\"").replace("onclick=\"toast('Support coming soon')\"", "onclick=\"go('support')\"");
  };
  const g = go;
  go = function (v) {
    g(v);
    const ap = document.getElementById('app');
    ap.classList.toggle('rf', v === 'refer');
    ap.classList.toggle('rw', v === 'refer' && RF.tab === 'rw');
    ap.classList.toggle('rfp', v === 'refer' && RF.tab === 'rf');
    if (['support', 'about', 'privacy', 'terms'].includes(v)) { ap.classList.add('prof'); document.getElementById('nav').style.display = 'none'; }
    if (v === 'refer') { refCfg().then(() => { refSyncLb(); refRender(); }); refLoad(); }
    if (v === 'support' || v === 'about') refCfg();
  };
})();

/* ---------- CSS ---------- */
(() => {
  const css = `
#app.rf #screen{padding:0 calc(10*var(--u)) calc(100*var(--u));background:url(assets/ref_bg.png) center top/cover no-repeat,linear-gradient(180deg,#1b0e5e,#2a14a0 45%,#140a52)}
.rf-top{padding:calc(14*var(--u)) calc(34*var(--u)) calc(4*var(--u))}
.rf-tabs{display:flex;border-radius:calc(22*var(--u));padding:calc(3*var(--u));background:linear-gradient(180deg,#3a1a9a,#1e0a5e);border:calc(2.5*var(--u)) solid #f0b43a;box-shadow:0 0 calc(10*var(--u)) rgba(240,180,60,.45)}
.rf-tabs button{flex:1;border:0;background:none;color:#fff;font:800 calc(12*var(--u))/1.15 Poppins,sans-serif;padding:calc(7*var(--u)) 0;border-radius:calc(16*var(--u));cursor:pointer}
.rf-tabs button.on{background:linear-gradient(180deg,#58c8ff,#1a78e0);color:#fff1a8}
.rf-hero{position:relative;height:calc(190*var(--u));margin-top:calc(-2*var(--u))}
.rf-sign{position:absolute;left:50%;top:calc(6*var(--u));width:68%;transform:translateX(-50%)}
.rf-sign img{display:block;width:100%;height:auto}
.rf-sign b{position:absolute;left:0;right:0;top:50%;transform:translateY(-44%);text-align:center;font-size:calc(52*var(--u));font-weight:800;font-style:italic;line-height:1;color:#ffd21f;-webkit-text-stroke:calc(5*var(--u)) #7a3a00;paint-order:stroke fill;text-shadow:0 calc(4*var(--u)) 0 #7a3a00}
.rf-chest{position:absolute;right:calc(-8*var(--u));top:calc(40*var(--u));width:24%;height:auto}
.rf-lantern{position:absolute;left:calc(8*var(--u));top:calc(36*var(--u));width:10%;height:auto}
.rf-dice{position:absolute;top:calc(-6*var(--u));width:calc(52*var(--u));height:auto}
.rf-dice.l{left:calc(-6*var(--u))}
.rf-dice.r{right:calc(-6*var(--u));transform:scaleX(-1)}
.rf-tip{position:absolute;left:50%;bottom:calc(6*var(--u));transform:translateX(-50%);white-space:nowrap;padding:calc(3*var(--u)) calc(16*var(--u));border-radius:calc(14*var(--u));background:linear-gradient(180deg,#ffc928,#e08a00);border:calc(1.5*var(--u)) solid #fff0a0;color:#5a2a00;font-weight:700;font-size:calc(11*var(--u))}
.rf-sub{display:flex;gap:calc(6*var(--u));margin-top:calc(12*var(--u))}
.rf-sub button{display:flex;align-items:center;justify-content:center;gap:calc(5*var(--u));flex:1;height:calc(40*var(--u));border-radius:calc(22*var(--u));border:calc(2*var(--u)) solid rgba(160,120,255,.6);background:linear-gradient(180deg,#3a1a9a,#220e66);color:#fff;font:700 calc(12.5*var(--u)) Poppins,sans-serif;cursor:pointer}
.rf-sub button.on{background:linear-gradient(180deg,#ffd84a,#f09a10);color:#4a2400;border-color:#fff0a0}
.rf-pods{--mid:36%;--side:31%;--ov:-2%;display:flex;align-items:flex-end;justify-content:center;margin:calc(10*var(--u)) calc(-6*var(--u)) 0}
.rf-pd{position:relative;flex:none;width:var(--side);text-align:center}
.rf-pd.p1{width:var(--mid);z-index:3}
.rf-pd.p2{margin-right:var(--ov);z-index:2}
.rf-pd.p3{margin-left:var(--ov);z-index:2}
.rf-pd img.rf-fr{display:block;width:100%;height:auto;pointer-events:none}
.rf-av{position:absolute;left:50%;top:29.3%;width:35%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;overflow:hidden;z-index:2;background:#3a1a9a}
.rf-av img.as,.rf-av .ph{width:100%!important;height:100%!important;object-fit:cover;display:block;font-size:calc(30*var(--u))}
.rf-rk{position:absolute;left:50%;top:50.4%;width:11%;aspect-ratio:1;transform:translate(-50%,-50%);z-index:2;display:grid;place-items:center;font-weight:800;font-size:calc(13*var(--u));line-height:1;color:#7a3a00}
.rf-ti{position:absolute;left:14%;right:14%;top:58%;bottom:12%;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;min-width:0}
.rf-pn{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:calc(1*var(--u)) calc(8*var(--u));border-radius:calc(9*var(--u));background:rgba(20,8,70,.62);color:#fff;font-weight:700;font-size:calc(9*var(--u));line-height:1.35}
.rf-pp{display:flex;align-items:center;justify-content:center;gap:calc(2*var(--u));font-weight:800;font-size:calc(13*var(--u));line-height:1;color:#ffe27a;-webkit-text-stroke:calc(2.5*var(--u)) #7a3a00;paint-order:stroke fill}
.rf-ps{font-weight:800;font-size:calc(8.5*var(--u));line-height:1;color:#fff;text-shadow:0 1px 2px rgba(60,20,0,.8)}
.rf-pd.em .rf-av{filter:grayscale(.6);opacity:.8}
.rf-pd.em .rf-pn{opacity:.8}
.rf-tb{margin-top:calc(14*var(--u));border-radius:calc(22*var(--u));overflow:hidden;padding-bottom:calc(6*var(--u));border:calc(2.5*var(--u)) solid #7a4aff;background:linear-gradient(180deg,#2a1480,#1a0c5c)}
.rf-yr{display:flex;justify-content:space-between;padding:calc(10*var(--u)) calc(14*var(--u));font-weight:800;font-size:calc(16*var(--u));color:#ffd21f}
.rf-yr span:last-child{color:#fff}
.rf-th,.rf-r{display:grid;grid-template-columns:.7fr 1.7fr 1fr 1fr;align-items:center}
.rf-th{margin:0 calc(4*var(--u));padding:calc(8*var(--u)) calc(4*var(--u));text-align:center;border-radius:calc(14*var(--u)) calc(14*var(--u)) 0 0;background:linear-gradient(180deg,#8b5cf6,#5b34d6);color:#fff;font-weight:700;font-size:calc(13*var(--u))}
.rf-th span:nth-child(3),.rf-th span:nth-child(4){color:#ffd21f}
.rf-r{margin:calc(4*var(--u)) calc(6*var(--u)) 0;padding:calc(6*var(--u)) calc(4*var(--u));border-radius:calc(14*var(--u));background:linear-gradient(180deg,#fff,#e0d4ff);color:#2a1b5e;font-weight:700;font-size:calc(12.5*var(--u));text-align:center}
.rf-r .n{font-size:calc(22*var(--u));font-weight:800;color:#4a1fb0}
.rf-r .pl{display:flex;align-items:center;gap:calc(6*var(--u));min-width:0}
.rf-r .pl img.as,.rf-r .pl .ph{flex:none;width:calc(30*var(--u))!important;height:calc(30*var(--u))!important;border-radius:50%;object-fit:cover;border:calc(2*var(--u)) solid #e08a30;font-size:calc(16*var(--u))}
.rf-r .pl span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rf-r.em{opacity:.62}.rf-r.em .pl img.as,.rf-r.em .pl .ph{filter:grayscale(.7)}
.rf-r .mt{width:100%;text-align:center;color:#9a8ccc}
.rf-r .pz{display:flex;align-items:center;justify-content:center;gap:calc(3*var(--u))}
.rf-em{padding:calc(12*var(--u));text-align:center;font-size:calc(12*var(--u));color:#d9c8ff;font-weight:600}.rf-em.dk{color:#6a5aa8}
.rf-ag{display:flex;align-items:center;gap:calc(8*var(--u));margin-top:calc(12*var(--u));padding:calc(8*var(--u)) calc(14*var(--u));border-radius:calc(22*var(--u));background:linear-gradient(180deg,#4a1fb8,#2a0f78);border:calc(2*var(--u)) solid #a478ff;color:#fff;font-weight:600;font-size:calc(11.5*var(--u));cursor:pointer}
.rf-ag span{flex:1}.rf-ag b{font-size:calc(22*var(--u));color:#ffd21f}
.rf-fb{display:flex;align-items:center;justify-content:space-between;gap:calc(8*var(--u));margin-top:calc(8*var(--u));padding:calc(8*var(--u)) calc(12*var(--u));border-radius:calc(24*var(--u));background:linear-gradient(180deg,#1f9d4a,#0e6a30);border:calc(2*var(--u)) solid #58e07a}
.rf-fi{flex:1;display:flex;flex-direction:column;align-items:center;gap:0;color:#fff;font-weight:600;font-size:calc(11*var(--u))}
.rf-ic{display:flex;gap:calc(4*var(--u));justify-content:center}
.rf-fb button{flex:none;border:calc(2*var(--u)) solid #fff0a0;border-radius:calc(20*var(--u));background:linear-gradient(180deg,#ffd84a,#f09a10);color:#4a2400;font:800 calc(14*var(--u)) Poppins,sans-serif;padding:calc(8*var(--u)) calc(18*var(--u));cursor:pointer}
.rf-card{margin-top:calc(12*var(--u));padding:calc(12*var(--u));border-radius:calc(20*var(--u));background:linear-gradient(180deg,rgba(236,222,255,.96),rgba(214,192,250,.94));border:calc(2*var(--u)) solid rgba(255,255,255,.7);color:#2a1b5e;font-size:calc(13*var(--u));line-height:1.45}
.rf-card h3{font-size:calc(16*var(--u));color:#3a1590;margin-bottom:calc(8*var(--u))}
.rf-ol,.rf-ul{padding-left:calc(18*var(--u))}.rf-ol li,.rf-ul li{margin-bottom:calc(5*var(--u))}
.rf-kv{display:flex;justify-content:space-between;padding:calc(6*var(--u)) 0;border-bottom:1px solid rgba(90,60,170,.15);font-weight:600}
.rf-kv:last-of-type{border:0}.rf-kv b{color:#4a1fb0}
.rf-sm{display:block;margin-top:calc(6*var(--u));color:#6a5aa8;font-size:calc(11*var(--u))}
.rf-seg{display:flex;padding:calc(3*var(--u));border-radius:calc(24*var(--u));background:linear-gradient(180deg,#2a1480,#1a0c5c);border:calc(2*var(--u)) solid #5a3ad0}
.rf-seg button{flex:1;height:calc(36*var(--u));border:0;border-radius:calc(20*var(--u));background:none;color:#fff;font:700 calc(15*var(--u)) Poppins,sans-serif;cursor:pointer}
.rf-seg button.on{background:linear-gradient(180deg,#8b5cf6,#5424d0)}
.rf-hx{display:grid;grid-template-columns:1fr 1fr;gap:calc(14*var(--u));margin-top:calc(16*var(--u))}
.rf-cb{text-align:center;padding:calc(10*var(--u)) 0 calc(14*var(--u));border-radius:calc(20*var(--u));background:linear-gradient(180deg,#fff,#e6dcff);border:calc(3*var(--u)) solid #f0b43a;box-shadow:0 0 calc(10*var(--u)) rgba(240,180,60,.5)}
.rf-cb b{display:block;font-size:calc(22*var(--u));color:#3a1590;font-weight:800}
.rf-cb span{display:inline-block;margin-top:calc(6*var(--u));min-width:calc(90*var(--u));padding:calc(6*var(--u)) 0;border-radius:calc(14*var(--u));background:#d0c8e8;color:#2a1b5e;font-weight:800;font-size:calc(24*var(--u))}
.rf-bd{display:grid;grid-template-columns:repeat(4,1fr);margin-top:calc(14*var(--u));border-radius:calc(16*var(--u));overflow:hidden;background:rgba(235,225,255,.92);border:calc(2*var(--u)) solid rgba(255,255,255,.6)}
.rf-bd div{padding:calc(6*var(--u)) calc(2*var(--u)) calc(8*var(--u));text-align:center;border-right:1px solid rgba(90,60,170,.2)}.rf-bd div:last-child{border:0}
.rf-bd small{display:block;font-size:calc(10.5*var(--u));font-weight:700;color:#4a3a8a}
.rf-bd span{display:inline-block;margin-top:calc(4*var(--u));min-width:calc(40*var(--u));padding:calc(5*var(--u)) 0;border-radius:calc(10*var(--u));background:#cfc6ea;color:#2a1b5e;font-weight:800;font-size:calc(15*var(--u))}
.rf-cur{display:flex;justify-content:space-between;align-items:center;margin-top:calc(14*var(--u));padding:calc(8*var(--u)) calc(22*var(--u));border-radius:calc(24*var(--u));background:linear-gradient(180deg,#4a1fb8,#2a0f78);border:calc(3*var(--u)) solid #f0b43a;color:#fff;font-weight:700;font-size:calc(17*var(--u))}
.rf-cur b{color:#fff;font-size:calc(19*var(--u))}
.rf-claim{display:block;width:calc(190*var(--u));height:calc(48*var(--u));margin:calc(12*var(--u)) auto 0;border-radius:calc(26*var(--u));border:calc(3*var(--u)) solid rgba(255,255,255,.6);background:linear-gradient(180deg,#7dec3a,#2fb312);color:#fff;font:800 calc(24*var(--u)) Poppins,sans-serif;cursor:pointer;text-shadow:0 2px 3px rgba(0,0,0,.35);box-shadow:0 calc(4*var(--u)) 0 rgba(20,100,10,.5)}
.rf-claim.off{background:#bcb6d8;box-shadow:none;text-shadow:none}
.rf-lt{margin-top:calc(14*var(--u));padding-bottom:calc(6*var(--u));border-radius:calc(20*var(--u));overflow:hidden;background:rgba(200,185,250,.9);border:calc(2*var(--u)) solid rgba(255,255,255,.6)}
.rf-lh,.rf-lr{display:grid;grid-template-columns:1.2fr 1fr 1.1fr 1fr;align-items:center;text-align:center}
.rf-lh{padding:calc(10*var(--u)) calc(4*var(--u));font-weight:700;font-size:calc(11.5*var(--u));color:#2a1b5e;background:linear-gradient(180deg,#d8ccff,#b9a6f5)}
.rf-lr{margin:calc(5*var(--u)) calc(6*var(--u)) 0;padding:calc(9*var(--u)) calc(4*var(--u));border-radius:calc(14*var(--u));background:linear-gradient(180deg,#fff,#eee6ff);color:#2a1b5e;font-weight:700;font-size:calc(12.5*var(--u))}
.rf-lr .gm{display:flex;align-items:center;justify-content:center;gap:calc(4*var(--u))}
.rf-lr .ok{color:#1f8a0e}
.rf-lr button,.rf-cl{border:0;border-radius:calc(14*var(--u));background:linear-gradient(180deg,#7dec3a,#2fb312);color:#fff;font:800 calc(12*var(--u)) Poppins,sans-serif;padding:calc(5*var(--u)) calc(10*var(--u));cursor:pointer}
.rf-sh{margin-top:calc(14*var(--u));padding:calc(12*var(--u));border-radius:calc(22*var(--u));background:linear-gradient(180deg,#4a1fb8,#2a0f78);border:calc(2*var(--u)) solid #8a5cff;color:#fff}
.rf-st{text-align:center;font-weight:700;font-size:calc(14*var(--u))}
.rf-lk{display:flex;align-items:center;gap:calc(6*var(--u));margin-top:calc(10*var(--u));padding:calc(6*var(--u)) calc(10*var(--u));border-radius:calc(20*var(--u));background:#2a1470;border:calc(1.5*var(--u)) solid #8a5cff}
.rf-lk span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(11.5*var(--u))}
.rf-lk button{flex:none;border:0;background:none;cursor:pointer;color:#fff;font-size:calc(18*var(--u))}
.rf-sb{display:flex;justify-content:space-around;margin-top:calc(12*var(--u))}
.rf-b{width:calc(58*var(--u));height:calc(58*var(--u));border-radius:calc(16*var(--u));border:calc(2.5*var(--u)) solid #f0c060;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font:800 calc(26*var(--u)) Poppins,sans-serif}
.rf-b.wa{background:linear-gradient(180deg,#3fd35a,#1c9a3a)}.rf-b.tg{background:linear-gradient(180deg,#4ab4ff,#1a78d8)}.rf-b.fb{background:linear-gradient(180deg,#3b6ad0,#1f3f9a)}.rf-b.sh{background:linear-gradient(180deg,#ffa43a,#e06a10)}
.rf-fr2{display:flex;align-items:center;gap:calc(10*var(--u));padding:calc(8*var(--u)) 0;border-bottom:1px solid rgba(90,60,170,.15)}
.rf-fr2:last-child{border:0}
.rf-fr2>div{flex:1;min-width:0;line-height:1.25}.rf-fr2 b{display:block;font-size:calc(14*var(--u))}.rf-fr2 small{color:#6a5aa8;font-size:calc(11*var(--u))}
.rf-fa{flex:none;width:calc(40*var(--u));height:calc(40*var(--u))}
.rf-fa img.as,.rf-fa .ph{width:100%!important;height:100%!important;border-radius:50%;object-fit:cover;border:calc(2*var(--u)) solid #e08a30}
.rf-ok{color:#1f8a0e;font-weight:700;font-size:calc(12*var(--u))}
.rf-q{border-bottom:1px solid rgba(90,60,170,.18);padding:calc(8*var(--u)) calc(4*var(--u))}
.rf-q summary{font-weight:700;font-size:calc(13.5*var(--u));color:#2a1b5e;cursor:pointer}
.rf-q p{margin-top:calc(6*var(--u));font-size:calc(12.5*var(--u));color:#4a3a8a;line-height:1.45}
.rf-tx{font-size:calc(13*var(--u));color:#4a3a8a;line-height:1.5;margin:0 calc(4*var(--u)) calc(6*var(--u))}
.pp-sh textarea{width:100%;border-radius:calc(14*var(--u));border:calc(2*var(--u)) solid #cbbdf3;background:#fff;padding:calc(10*var(--u)) calc(14*var(--u));font:600 calc(14*var(--u)) Poppins,sans-serif;color:#2a1b5e;outline:0;resize:none}
#app.rf.rw #screen{background:url(assets/ref_rw_bg.png) center top/cover no-repeat,linear-gradient(180deg,#1b0e5e,#2a14a0 45%,#140a52)}
.rw-head{text-align:center;padding-top:calc(6*var(--u))}
.rw-head img{display:block;margin:0 auto;width:92%;max-height:calc(130*var(--u));object-fit:contain}
#app.rw .rf-top,#app.rfp .rf-top{padding:calc(8*var(--u)) calc(2*var(--u)) calc(4*var(--u))}
#app.rw .rf-tabs,#app.rfp .rf-tabs{border:calc(2.5*var(--u)) solid #5aa8ff;background:linear-gradient(180deg,#2a1a9a,#160a62);box-shadow:0 0 calc(12*var(--u)) rgba(90,170,255,.55)}
#app.rw .rf-tabs button,#app.rfp .rf-tabs button{display:flex;align-items:center;justify-content:center;gap:calc(4*var(--u));padding:calc(5*var(--u)) calc(2*var(--u));font-size:calc(10.5*var(--u));text-align:left}
#app.rw .rf-tabs button span,#app.rfp .rf-tabs button span{display:block}
#app.rw .rf-tabs button img.as,#app.rfp .rf-tabs button img.as,#app.rw .rf-tabs button .ph,#app.rfp .rf-tabs button .ph{flex:none}
#app.rw .rf-tabs button.on,#app.rfp .rf-tabs button.on{background:linear-gradient(180deg,#ffd84a,#f09a10);color:#4a2400;box-shadow:0 0 calc(8*var(--u)) rgba(255,200,60,.7)}
.rw-seg{display:flex;margin:calc(10*var(--u)) calc(6*var(--u)) 0;padding:calc(3*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(180deg,#1c0e70,#140a52);border:calc(2*var(--u)) solid #6a3ae0}
.rw-seg button{flex:1;height:calc(38*var(--u));border:0;border-radius:calc(22*var(--u));background:none;color:#fff;font:800 calc(20*var(--u)) Poppins,sans-serif;cursor:pointer}
.rw-seg button.on{background:linear-gradient(180deg,#ffd84a,#f5a000);color:#4a2400;box-shadow:0 0 calc(8*var(--u)) rgba(255,200,60,.6)}
.rw-cards{display:grid;grid-template-columns:1fr 1fr;gap:calc(12*var(--u));margin-top:calc(34*var(--u))}
.rw-cd{position:relative;text-align:center;padding:calc(36*var(--u)) calc(10*var(--u)) calc(14*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(180deg,#f4f6ff,#c4d4fb);border:calc(3*var(--u)) solid #f0b43a;box-shadow:0 0 calc(12*var(--u)) rgba(240,180,60,.55)}
.rw-ico{position:absolute;left:50%;top:calc(-30*var(--u));transform:translateX(-50%);display:block}
.rw-ico img.as,.rw-ico .ph{display:block;height:auto}
.rw-cd b{display:block;font-size:calc(30*var(--u));font-weight:800;color:#2a1070;line-height:1.1}
.rw-pill{margin-top:calc(8*var(--u));padding:calc(6*var(--u)) 0;border-radius:calc(30*var(--u));background:linear-gradient(180deg,#5a1fd0,#2a0a80);border:calc(2*var(--u)) solid #7a4aff;color:#fff;font-weight:800;font-size:calc(34*var(--u));line-height:1.1;box-shadow:inset 0 calc(2*var(--u)) 0 rgba(255,255,255,.25)}
.rw-st{display:grid;grid-template-columns:repeat(4,1fr);margin-top:calc(14*var(--u));padding:calc(8*var(--u)) 0;border-radius:calc(24*var(--u));background:linear-gradient(180deg,#e8e0ff,#cbbcf6);border:calc(2*var(--u)) solid rgba(255,255,255,.7)}
.rw-st div{display:flex;flex-direction:column;align-items:center;gap:calc(1*var(--u));border-right:1px solid rgba(90,60,170,.3)}
.rw-st div:last-child{border:0}
.rw-st small{font-size:calc(13*var(--u));font-weight:800;color:#2a1b7e}
.rw-st span{font-size:calc(28*var(--u));font-weight:800;color:#2a1070;line-height:1.1}
.rw-cur{display:flex;align-items:center;gap:calc(10*var(--u));margin-top:calc(12*var(--u));padding:calc(6*var(--u)) calc(18*var(--u)) calc(6*var(--u)) calc(12*var(--u));border-radius:calc(30*var(--u));background:linear-gradient(180deg,#4a1fb0,#1e0a68);border:calc(3*var(--u)) solid #f0b43a;color:#fff}
.rw-cur span{flex:1;font-weight:800;font-size:calc(20*var(--u))}
.rw-cur b{font-size:calc(34*var(--u));font-weight:800;color:#ffc21f}
.rw-clw{display:flex;align-items:center;justify-content:center;gap:calc(14*var(--u));margin-top:calc(14*var(--u))}
.rw-claim{display:flex;align-items:center;justify-content:center;gap:calc(8*var(--u));width:calc(250*var(--u));height:calc(62*var(--u));border-radius:calc(34*var(--u));border:calc(3.5*var(--u)) solid #ffd84a;background:linear-gradient(180deg,#8cf53a,#1fb010);color:#fff;font:800 calc(34*var(--u)) Poppins,sans-serif;cursor:pointer;text-shadow:0 calc(2*var(--u)) calc(3*var(--u)) rgba(0,70,0,.55);box-shadow:0 0 calc(14*var(--u)) rgba(120,255,60,.6),0 calc(4*var(--u)) 0 rgba(20,100,10,.5)}
.rw-claim.off{filter:grayscale(.85) brightness(.9);box-shadow:none}
.rw-clw .sp{position:relative;width:calc(26*var(--u));height:calc(34*var(--u));flex:none}
.rw-clw .sp::before,.rw-clw .sp::after{content:"";position:absolute;left:0;width:calc(22*var(--u));height:calc(5*var(--u));border-radius:calc(4*var(--u));background:#ffc21f}
.rw-clw .sp::before{top:calc(4*var(--u))}.rw-clw .sp::after{bottom:calc(4*var(--u))}
.rw-clw .sp.l{transform:scaleX(-1)}
.rw-clw .sp.l::before,.rw-clw .sp.r::before{transform:rotate(-22deg)}
.rw-clw .sp.l::after,.rw-clw .sp.r::after{transform:rotate(22deg)}
.rw-lt{margin-top:calc(14*var(--u));padding-bottom:calc(8*var(--u));border-radius:calc(26*var(--u));overflow:hidden;background:linear-gradient(180deg,#e2d8ff,#c9b9f6);border:calc(2*var(--u)) solid rgba(255,255,255,.7)}
.rw-lh{display:grid;grid-template-columns:1.2fr 1fr 1.1fr 1fr;padding:calc(10*var(--u)) 0 calc(6*var(--u))}
.rw-lh div{display:flex;flex-direction:column;align-items:center;gap:calc(1*var(--u));border-right:1px solid rgba(90,60,170,.3)}
.rw-lh div:last-child{border:0}
.rw-lh span{font-size:calc(14*var(--u));font-weight:800;color:#2a1b7e}
.rw-em{padding:calc(6*var(--u)) calc(10*var(--u)) calc(4*var(--u));text-align:center;font-size:calc(14*var(--u));font-weight:800;color:#2a1070}
#app.rf.rfp #screen{background:url(assets/ref_rf_bg.png) center top/cover no-repeat,linear-gradient(180deg,#2a0f88,#4a24cc 60%,#1c0a6a)}
.rr-st{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(8*var(--u));margin-top:calc(10*var(--u))}
.rr-st div{display:flex;flex-direction:column;align-items:center;gap:calc(1*var(--u));padding:calc(8*var(--u)) calc(2*var(--u)) calc(8*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,#3a1fb8,#1d0a6a);border:calc(2.5*var(--u)) solid #6a8cff;box-shadow:0 0 calc(10*var(--u)) rgba(110,140,255,.5);color:#fff}
.rr-st small{font-size:calc(13*var(--u));font-weight:800}
.rr-st span{font-size:calc(28*var(--u));font-weight:800;line-height:1.1}
.rr-cash{margin-top:calc(8*var(--u));text-align:center;font-weight:700;font-size:calc(13*var(--u));color:#e9e0ff}.rr-cash b{color:#ffd21f}
.rr-fc{margin-top:calc(14*var(--u));padding:calc(12*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(180deg,#f6f0ff,#d9c9fb);border:calc(3*var(--u)) solid #f0b43a;box-shadow:0 0 calc(12*var(--u)) rgba(240,180,60,.55);color:#2a1b6e}
.rr-top{display:grid;grid-template-columns:1.1fr calc(2*var(--u)) 1fr;align-items:center;gap:calc(8*var(--u))}
.rr-art{position:relative;text-align:center;padding-bottom:calc(26*var(--u))}
.rr-art img.as,.rr-art .ph{width:100%!important;max-width:calc(170*var(--u))!important;height:auto!important}
.rr-rb{position:absolute;left:calc(-6*var(--u));right:calc(-6*var(--u));bottom:0;padding:calc(5*var(--u)) calc(14*var(--u));font-weight:800;font-size:calc(16*var(--u));color:#4a1fb0;background:linear-gradient(180deg,#ffe27a,#f0a010);clip-path:polygon(0 0,100% 0,96% 50%,100% 100%,0 100%,4% 50%)}
.rr-dv{display:block;width:calc(2*var(--u));height:80%;background:rgba(90,60,170,.35)}
.rr-em{text-align:center}
.rr-em img.as,.rr-em .ph{width:calc(64*var(--u))!important;height:auto!important}
.rr-em b{display:block;margin-top:calc(4*var(--u));font-size:calc(17*var(--u));line-height:1.25;color:#3a1590}
.rr-em::after{content:"";display:block;height:calc(3*var(--u));width:70%;margin:calc(6*var(--u)) auto 0;border-radius:calc(3*var(--u));background:linear-gradient(90deg,transparent,#6a3de0,#f0b43a,transparent)}
.rr-list{margin-top:calc(10*var(--u));padding-top:calc(4*var(--u));border-top:1px solid rgba(90,60,170,.25)}
.rr-sh{margin-top:calc(14*var(--u));padding:calc(12*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(180deg,#4a1fc0,#22097a);border:calc(3*var(--u)) solid #8a5cff;box-shadow:0 0 calc(12*var(--u)) rgba(138,92,255,.6)}
.rr-sht{display:flex;align-items:center;gap:calc(8*var(--u))}
.rr-sht>img.as,.rr-sht>.ph{flex:none;width:calc(78*var(--u))!important;height:auto!important}
.rr-sht div{flex:1;text-align:center;font-style:italic;font-weight:800}
.rr-sht span{display:block;font-size:calc(19*var(--u));color:#fff;line-height:1.2}
.rr-sht b{display:block;font-size:calc(30*var(--u));color:#ffd21f;text-shadow:0 calc(2*var(--u)) calc(3*var(--u)) rgba(80,30,0,.6);line-height:1.1}
.rr-lk{display:flex;align-items:center;gap:calc(8*var(--u));margin-top:calc(10*var(--u));padding:calc(4*var(--u)) calc(4*var(--u)) calc(4*var(--u)) calc(12*var(--u));border-radius:calc(22*var(--u));background:#1a0a5c;border:calc(2*var(--u)) solid #6a4ae0;color:#fff}
.rr-lk span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(14*var(--u))}
.rr-lk button{flex:none;width:calc(46*var(--u));height:calc(38*var(--u));display:grid;place-items:center;border-radius:calc(14*var(--u));border:calc(2*var(--u)) solid #9a7aff;background:linear-gradient(180deg,#7a4aff,#4a1fc0);cursor:pointer;color:#fff}
.rr-sb{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(8*var(--u));margin-top:calc(12*var(--u))}
.rr-b{display:flex;flex-direction:column;align-items:center;gap:calc(2*var(--u));padding:calc(10*var(--u)) 0 calc(7*var(--u));border-radius:calc(16*var(--u));border:calc(2.5*var(--u)) solid #f0c060;color:#fff;cursor:pointer;font-family:Poppins,sans-serif}
.rr-b small{font-size:calc(11.5*var(--u));font-weight:800}
.rr-b.wa{background:linear-gradient(180deg,#3fd35a,#1c9a3a)}.rr-b.tg{background:linear-gradient(180deg,#4ab4ff,#1a78d8)}.rr-b.fb{background:linear-gradient(180deg,#3b6ad0,#1f3f9a)}.rr-b.sh{background:linear-gradient(180deg,#ffa43a,#e06a10)}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();