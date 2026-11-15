/* =====================================================================
   refer_fix.js  v3  —  Ludo Masters  (refer.js ka PATCH)

   index.html me:
     <script src="refer.js"></script>
     <script src="refer_fix.js"></script>     <-- refer.js ke BAAD
   (type="module" mat lagana, warna globals reassign nahi honge)

   v4 LINK FORMAT:
        https://t.me/Lwinup_bot?start=<Telegram ID>
      (koi /app-name nahi, koi startapp nahi)
      Share text: "Join me on Ludo Masters and win real cash rewards! ..."

   ?start= link pehle BOT chat kholta hai. Bot ko /start <ID> pe ek web_app button
   bhejna hoga jiska URL  <APP_URL>?ref=<ID>  ho (bot ka code reply me diya hai).
   Mini App ?ref= padh leta hai (startParam), aur referral capture hota hai.

   Baaki: 5 games reward, gp progress sync, My Rewards/Referrals progress bar,
   Telegram SVG icon, Refer Rules page. Debug: console me "REF:" lines.

   BOT TOKEN is file me KABHI nahi daalna (client code public hota hai).
   ===================================================================== */
(() => {
  /* ---------- defaults ---------- */
  const DEF = { rewardGems: 0, rewardCash: 5, minGames: 5 };
  const OLD = Object.assign({}, REF_DEF);
  Object.assign(REF_DEF, DEF);
  /* REFC me sirf wahi keys badlo jo missing hain ya purane default par hain (admin ki value safe) */
  for (const k in DEF) { if (REFC[k] == null || REFC[k] === OLD[k]) REFC[k] = DEF[k]; }

  const minG = () => Math.max(1, Math.floor(rn(REFC.minGames)) || 5);
  const gpOf = r => Math.max(0, rn(r && r.gp));
  const isRdy = r => !!r && !r.claimed && gpOf(r) >= minG();
  window.refIsRdy = isRdy;
  const dbg = (...a) => { try { console.log('REF:', ...a); } catch (e) { } };

  /* ---------- link ---------- */
  /* referral code = user ka Telegram ID (Telegram na mile to UID code) */
  const myCode = () => {
    const tg = rtg(), u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return u && u.id ? String(u.id) : refCode();
  };
  const LINK_BASE = 'https://t.me/Lwinup_bot';
  /* https://t.me/Lwinup_bot?start=8075561163 */
  const myLink = () => LINK_BASE + (UID ? '?start=' + myCode() : '');

  /* refCodes/<telegramId> = uid  (referrer ka code UID se map hota hai) */
  let CODE_OK = 0;
  setInterval(() => {
    if (CODE_OK || !UID) return;
    const c = myCode(); if (!c || c === refCode()) return;
    fdb.ref('refCodes/' + c).transaction(x => (x && x !== UID) ? undefined : UID)
      .then(res => {
        if (res.committed) { CODE_OK = 1; dbg('refCodes/' + c + ' saved'); }
        else dbg('refCodes/' + c + ' kisi aur UID ka hai, save nahi hua');
      })
      .catch(e => console.error('REF: refCodes write failed (Firebase rules check karo)', e));
  }, 4000);

  /* start_param kai jagah se: initDataUnsafe, URL hash, URL query */
  const startParam = tg => {
    let sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    if (!sp) { try { sp = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('tgWebAppStartParam') || ''; } catch (e) { } }
    if (!sp) { try { sp = new URLSearchParams(location.search).get('tgWebAppStartParam') || ''; } catch (e) { } }
    /* ?start=<ID> link ke baad bot jo web_app button bhejta hai: <APP_URL>?ref=<ID> */
    if (!sp) { try { sp = new URLSearchParams(location.search).get('ref') || ''; } catch (e) { } }
    if (!sp) { try { sp = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('ref') || ''; } catch (e) { } }
    if (!sp) { try { sp = sessionStorage.getItem('ref_code') || ''; } catch (e) { } }
    else { try { sessionStorage.setItem('ref_code', sp); } catch (e) { } }
    return String(sp || '');
  };

  /* referral capture: ?ref=<TelegramID> (bot ke web_app button se) ya start_param */
  refCapture = async function (v) {
    if (REFC.enabled === false) return dbg('capture: feature disabled');
    let tg = null;
    for (let i = 0; i < 20; i++) { tg = rtg(); if (tg) break; await rsleep(150); }
    if (!tg || !tg.initDataUnsafe) return dbg('capture: Telegram WebApp nahi mila');
    const sp = startParam(tg), tu = tg.initDataUnsafe.user;
    dbg('start_param =', JSON.stringify(sp), '| tg user =', tu && tu.id);
    if (!/^(ref_)?[A-Za-z0-9_-]{4,40}$/.test(sp) || !tu || !tu.id) return dbg('capture: ref link se nahi khula (start_param khali)');
    const code = sp.replace(/^ref_/, '');
    if (!code || code === refCode() || code === String(tu.id)) return dbg('capture: self/empty code');
    if (v && v.ref && v.ref.by) return dbg('capture: pehle se kisi ke referral se aaya');
    if (v && v.createdAt && Date.now() - v.createdAt > 2 * 864e5) return dbg('capture: user purana hai (>2 din)');
    if (ST.played > 0) return dbg('capture: user pehle game khel chuka');
    let rUid = null;
    try { rUid = (await fdb.ref('refCodes/' + code).once('value')).val(); }
    catch (e) { return console.error('REF: refCodes read failed (rules check karo)', e); }
    dbg('referrer uid =', rUid);
    if (!rUid) return dbg('capture: refCodes/' + code + ' nahi mila (referrer ne app nahi khola ya rules read block kar rahe)');
    if (rUid === UID) return dbg('capture: self referral');
    let tx;
    try { tx = await fdb.ref('refTg/' + tu.id).transaction(x => x ? undefined : { by: rUid, u: UID, ts: Date.now() }); }
    catch (e) { return console.error('REF: refTg write failed (rules check karo)', e); }
    if (!tx.committed) return dbg('capture: ye Telegram account pehle use ho chuka (refTg/' + tu.id + ')');
    try {
      await fdb.ref('refs/' + rUid + '/' + UID).set({ ts: Date.now(), n: String(tu.first_name || 'Friend').slice(0, 16), a: 'av' + myAv });
    } catch (e) {
      console.error('REF: refs write failed (rules check karo)', e);
      fdb.ref('refTg/' + tu.id).remove().catch(() => { });   /* retry ho sake isliye lock hatao */
      return;
    }
    dbg('SUCCESS: referral saved');
    REF_BY = rUid;
    dbSet('ref', { by: rUid, ts: Date.now() });
    const wg = rn(REFC.welcomeGems);
    if (wg > 0) { BAL.gems += wg; saveBal(); refreshBal(); toast('🎁 Welcome bonus +' + wg + ' 💎'); }
  };
  refCopy = function () {
    const t = myLink();
    const done = () => toast('Link copied ✓');
    const fb = () => {
      try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = 0; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); done(); }
      catch (e) { toast('Copy failed'); }
    };
    try { navigator.clipboard.writeText(t).then(done, fb); } catch (e) { fb(); }
  };

  /* ---------- share ---------- */
  refShare = function (k) {
    const link = myLink();
    const text = 'Join me on Ludo Masters and win real cash rewards! 🎲 Play ' + minG() + ' games and earn. Use my link:';
    const u = encodeURIComponent(link), t = encodeURIComponent(text);
    if (k === 'sh') {
      if (navigator.share) navigator.share({ title: 'Ludo Masters', text, url: link }).catch(() => { });
      else refCopy();
      return;
    }
    const urls = {
      tg: 'https://t.me/share/url?url=' + u + '&text=' + t,
      wa: 'https://wa.me/?text=' + t + '%20' + u,
      fb: 'https://www.facebook.com/sharer/sharer.php?u=' + u
    };
    refOpenUrl(urls[k]);
  };

  /* ---------- friend ka progress (games played) referrer ko bhejna ---------- */
  var REF_BY = null, GP_LAST = -1, BY_TRY = 0;
  const _ar = applyRemote;
  applyRemote = function (v, first) { _ar(v, first); if (v && v.ref && v.ref.by) REF_BY = v.ref.by; };

  async function findBy() {
    if (REF_BY || BY_TRY > 10 || !UID) return;
    BY_TRY++;
    const tg = rtg(), u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (!u || !u.id) return;
    const r = await rget('refTg/' + u.id);
    if (r && r.u === UID && r.by) REF_BY = r.by;
  }
  function pushProg() {
    if (!UID || !REF_BY) return;
    const p = Math.min(1000, Math.floor(rn(typeof ST !== 'undefined' && ST ? ST.played : 0)));
    if (p <= GP_LAST) return;   /* sirf badhta hai */
    fdb.ref('refs/' + REF_BY + '/' + UID + '/gp')
      .transaction(x => (typeof x === 'number' && x >= p) ? undefined : p)
      .then(() => { GP_LAST = p; })
      .catch(e => console.error('REF: gp write failed (rules check karo)', e));
  }
  setInterval(() => {
    if (!UID) return;
    if (!REF_BY) findBy().then(pushProg).catch(() => { }); else pushProg();
  }, 8000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pushProg(); });

  /* ---------- list + claim ---------- */
  refList = function () {
    return Object.entries(REFS).map(([u, r]) => ({ u, ...r })).filter(r => r.ts).sort((a, b) => b.ts - a.ts);
  };
  refClaim = async function (ids, btn) {
    if (refBusy) return; refBusy = 1;
    let g = 0, c = 0, wait = 0;
    try {
      for (const id of ids) {
        const r = REFS[id]; if (!r || r.claimed) continue;
        if (!isRdy(r)) { wait++; continue; }
        /* fresh gp Firebase se verify karo */
        let fresh = r;
        try {
          const snap = await fdb.ref('refs/' + UID + '/' + id).once('value');
          const fv = snap.val();
          if (fv) fresh = Object.assign({}, r, fv);
        } catch (e) { dbg('claim: fresh read fail', e); }
        if (!isRdy(fresh)) { wait++; REFS[id] = Object.assign({}, r, fresh); continue; }
        const gg = rn(REFC.rewardGems), cc = rn(REFC.rewardCash);
        const res = await fdb.ref('refs/' + UID + '/' + id + '/claimed').transaction(x => x ? undefined : 1);
        if (!res.committed) continue;
        fdb.ref('refs/' + UID + '/' + id).update({ g: gg, c: cc, cts: Date.now() }).catch(() => { });
        REFS[id] = Object.assign({}, fresh, { claimed: 1, g: gg, c: cc });
        g += gg; c += cc; msAdd('inv'); tkAdd('i1');
      }
    } catch (e) { console.error(e); }
    refBusy = 0;
    if (g || c) rewardFx(btn, { g, c }, () => refRender());
    else toast(wait ? 'Friend must play ' + minG() + ' games first' : 'Nothing to claim');
  };
  window.refClaimReady = btn => refClaim(Object.keys(REFS).filter(k => isRdy(REFS[k])), btn);

  /* tab badalne par animation flag */
  refTab = function (t) {
    RF.tab = t; RF.fx = 1; refRender();
    document.getElementById('screen').scrollTop = 0;
    if (t === 'lb') refLoad();
  };

  /* ---------- icons ---------- */
  const TG_SVG = (s = 40) => `<svg class="rr-svg" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#2AABEE"/><path fill="#fff" d="M5.43 11.87l11.04-4.26c.51-.19.96.12.79.9l-1.88 8.86c-.14.63-.51.78-1.04.49l-2.87-2.12-1.38 1.33c-.15.15-.28.28-.58.28l.21-2.92 5.31-4.8c.23-.21-.05-.32-.36-.12L8.08 13.7l-2.83-.88c-.61-.19-.62-.61.13-.91z"/></svg>`;

  const shareBox3 = () => `<div class="rr-sh"><div class="rr-sht">${rwI(RWA.mega, '📣', 90, 70)}<div><span>Share your referral link &amp;</span><b>start earning</b></div></div>
<div class="rr-lk">${rwI(RWA.link, '🔗', 24, 24)}<span>${esc(myLink().replace(/^https?:\/\//, ''))}</span><button onclick="refCopy()" aria-label="Copy link">${A(RWA.copy, '⧉', 22, 26)}</button></div>
<div class="rr-code" onclick="refCopy()"><small>Your referral code</small><b>${esc(UID ? myCode() : '—')}</b><em>Tap to copy link</em></div>
<div class="rr-sb">${[['wa', rwI(RWA.wa, '💬', 40, 44), 'WhatsApp'], ['tg', TG_SVG(40), 'Telegram'], ['fb', rwI(RWA.fb, 'f', 40, 44), 'Facebook'], ['sh', rwI(RWA.more, '⤴', 40, 44), 'More']].map(b => `<button class="rr-b ${b[0] === 'tg' ? 'tgx' : b[0]}" onclick="refShare('${b[0]}')"><span class="rr-bi">${b[1]}</span><small>${b[2]}</small></button>`).join('')}</div></div>`;

  const prog = r => {
    const n = minG(), p = Math.min(gpOf(r), n);
    return `<span class="rf-pgm" title="${p}/${n} games"><i style="width:${Math.round(p / n * 100)}%"></i><em>${p}/${n} games</em></span>`;
  };

  /* ---------- My Rewards ---------- */
  vRewards = function () {
    const g = rn(REFC.rewardGems), c = rn(REFC.rewardCash), pt = rn(REFC.ptsPerRef);
    const today = rD(Date.now()), all = refList();
    const sc = RF.rw === 'total' ? all : all.filter(r => rD(r.ts) === today);
    const cl = sc.filter(r => r.claimed), pe = sc.filter(r => !r.claimed), rd = sc.filter(isRdy);
    const cash = cl.reduce((s, r) => s + rn(r.c), 0), gems = cl.reduce((s, r) => s + rn(r.g), 0);
    const cb = [rd.length * c ? '₹' + rfm(rd.length * c) : '', rd.length * g ? rfm(rd.length * g) + ' 💎' : ''].filter(Boolean).join(' + ') || '₹0';
    const st = [[RWA.friends, '👥', 'Friends', sc.length], [RWA.check, '✅', 'Claimed', cl.length],
      [RWA.clock, '🕒', 'Pending', pe.length], [RWA.star, '⭐', 'Points', sc.length * pt]];
    const hd = [[RWA.date, '📅', 'Date'], [RWA.cash, '🪙', 'Cash'], [RWA.star, '⭐', 'Bonus'], [RWA.doc, '📄', 'Status']];
    const row = r => `<div class="rf-lr"><span>${dmy(new Date(r.ts))}</span><span>₹${rfm(r.claimed ? r.c : c)}</span><span class="gm">${(r.claimed ? rn(r.g) : g) ? A('gem', '💎', 16, 20) + rfm(r.claimed ? r.g : g) : '—'}</span>${r.claimed ? '<span class="ok">Claimed</span>' : isRdy(r) ? `<button onclick="refClaim(['${r.u}'],this)">Claim</button>` : prog(r)}</div>`;
    return `<div class="rw-seg"><button class="${RF.rw === 'total' ? 'on' : ''}" onclick="refRw('total')">Total</button><button class="${RF.rw === 'today' ? 'on' : ''}" onclick="refRw('today')">Today</button></div>
<div class="rw-cards">
<div class="rw-cd"><span class="rw-ico">${rwI(RWA.wallet, '👛', 70, 70)}</span><b>Cash</b><div class="rw-pill">₹${rfm(cash)}</div></div>
<div class="rw-cd"><span class="rw-ico">${rwI(RWA.gift, '🎁', 70, 70)}</span><b>Bonus</b><div class="rw-pill">${rfm(gems)}</div></div></div>
<div class="rw-st">${st.map(x => `<div>${rwI(x[0], x[1], 30, 30)}<small>${x[2]}</small><span>${rfm(x[3])}</span></div>`).join('')}</div>
<div class="rw-cur">${rwI(RWA.crown, '👑', 40, 36)}<span>Ready to claim:</span><b>${cb}</b></div>
<div class="rw-clw"><i class="sp l"></i><button class="rw-claim${rd.length ? '' : ' off'}" ${rd.length ? 'data-ns' : ''} onclick="refClaimReady(this)">${rwI(RWA.claimGift, '🎁', 34, 34)}<span>Claim</span></button><i class="sp r"></i></div>
<div class="rw-lt"><div class="rw-lh">${hd.map(h => `<div>${rwI(h[0], h[1], 20, 20)}<span>${h[2]}</span></div>`).join('')}</div>
${sc.length ? sc.map(row).join('') : '<div class="rw-em">No rewards yet. Share your link to start earning!</div>'}</div>
${shareBox3()}`;
  };

  /* ---------- My Referrals ---------- */
  vRefs = function () {
    const L = refList(), g = rn(REFC.rewardGems), c = rn(REFC.rewardCash);
    const cl = L.filter(r => r.claimed), pe = L.filter(r => !r.claimed), rd = L.filter(isRdy);
    const eg = cl.reduce((s, r) => s + rn(r.g), 0), ec = cl.reduce((s, r) => s + rn(r.c), 0);
    const st = [[RWA.mail, '✉️', 'Invited', L.length], [RWA.check, '✅', 'Claimed', cl.length], [RWA.hourglass, '⏳', 'Pending', pe.length], [RWA.gem, '💎', 'Earned', eg]];
    const amt = (g ? g + '💎' : '') + (g && c ? ' ' : '') + (c ? '₹' + c : '');
    const rows = L.map(r => `<div class="rf-fr2"><span class="rf-fa">${A(r.a || 'av1', '🧑', 30, 0)}</span><div><b>${esc(r.n || 'Friend')}</b><small>Joined ${dmy(new Date(r.ts))}</small></div>${r.claimed ? '<span class="rf-ok">Claimed ✓</span>' : isRdy(r) ? `<button class="rf-cl" onclick="refClaim(['${r.u}'],this)">+${amt}</button>` : prog(r)}</div>`).join('');
    return `<div class="rr-st">${st.map(x => `<div>${rwI(x[0], x[1], 34, 34)}<small>${x[2]}</small><span>${rfm(x[3])}</span></div>`).join('')}</div>
${ec ? `<div class="rr-cash">Cash earned <b>₹${rfm(ec)}</b></div>` : ''}
<div class="rr-note">Earn <b>${amt || 'rewards'}</b> when a friend completes <b>${minG()} games</b></div>
${rd.length ? `<div class="rw-clw"><i class="sp l"></i><button class="rw-claim" data-ns onclick="refClaimReady(this)">${rwI(RWA.claimGift, '🎁', 34, 34)}<span>Claim all (${rd.length})</span></button><i class="sp r"></i></div>` : ''}
<div class="rr-fc"><div class="rr-top"><div class="rr-art">${rwI(RWA.kids, '👨‍👩‍👧', 150, 120)}<div class="rr-rb">My Friends (${L.length})</div></div><i class="rr-dv"></i>
<div class="rr-em">${rwI(RWA.add, '👥', 64, 56)}<b>${L.length ? L.length + (L.length > 1 ? ' friends' : ' friend') + ' joined.<br>Keep inviting!' : 'No friends yet.<br>Invite friends &amp; earn!'}</b></div></div>
${L.length ? '<div class="rr-list">' + rows + '</div>' : ''}</div>
${shareBox3()}`;
  };

  /* ---------- Refer Rules (professional + animation) ---------- */
  vRules = function () {
    const fx = RF.fx; RF.fx = 0;
    const c = rn(REFC.rewardCash), g = rn(REFC.rewardGems), w = rn(REFC.welcomeGems), pt = rn(REFC.ptsPerRef), n = minG();
    const pr = prizes().slice(0, 10);
    const rew = (c ? '₹' + rfm(c) : '') + (c && g ? ' + ' : '') + (g ? g + ' 💎' : '') || 'rewards';
    const medal = i => ['🥇', '🥈', '🥉'][i] || '<span class="rl-rk">' + (i + 1) + '</span>';
    const steps = [
      ['🔗', 'Share your link', 'Copy your personal link from the My Referrals or My Rewards tab and send it to your friends.'],
      ['📲', 'Friend joins on Telegram', 'They open your link in Telegram and start as a brand-new player' + (w ? ' and receive a ' + w + ' 💎 welcome bonus.' : '.')],
      ['🎲', 'Friend plays ' + n + ' games', 'Your reward unlocks as soon as they complete ' + n + ' games. Track progress in My Referrals.'],
      ['💰', 'You earn ' + rew, 'Tap Claim in My Rewards and the amount is added to your wallet. Repeat for every friend.']
    ];
    const heroTxt = 'Invite friends. Earn ' + rew + ' for each one.';
    const terms = [
      'Only brand-new players who join through your link count.',
      'Your reward is credited only after the friend completes ' + n + ' games.',
      'One Telegram account can be referred only once. Self-referrals are not allowed.',
      'Fake, duplicate or automated accounts are removed and rewards cancelled.',
      'We may change rewards or rules at any time.'
    ];
    const dly = i => `style="--d:${(0.5 + i * 0.14).toFixed(2)}s"`;
    return `<div class="rl${fx ? ' rl-go' : ''}">
<div class="rl-hero"><i class="rl-glow"></i><span class="rl-coin">₹</span><h2>Refer &amp; Earn</h2>
<div class="rl-amt">${rew}</div><p class="rl-type"><span>${esc(heroTxt)}</span></p></div>
<div class="rl-h">How it works</div>
<div class="rl-steps">${steps.map((s, i) => `<div class="rl-s" ${dly(i)}><span class="rl-n">${i + 1}</span><span class="rl-i">${s[0]}</span><div><b>${s[1]}</b><p>${s[2]}</p></div></div>`).join('')}</div>
<div class="rl-h">Rewards at a glance</div>
<div class="rl-tiles">
<div ${dly(4)}><small>You earn</small><b>${rew}</b><i>per friend</i></div>
<div ${dly(5)}><small>Friend gets</small><b>${w ? w + ' 💎' : '—'}</b><i>welcome bonus</i></div>
<div ${dly(6)}><small>Unlocks after</small><b>${n}</b><i>games played</i></div></div>
<div class="rl-h">Weekly leaderboard prizes</div>
<div class="rl-c" ${dly(7)}><p class="rl-sub">Every friend also gives you <b>${rfm(pt)} points</b>. Top 10 each week win cash prizes.</p>
${pr.map((z, i) => `<div class="rl-pz"><span>${medal(i)}<em>Rank ${i + 1}</em></span><b>₹${rfm(z)}</b></div>`).join('')}
<small class="rf-sm">The week runs Saturday to Friday. Prizes are credited by our team after the week ends.</small></div>
<div class="rl-h">Terms</div>
<div class="rl-c" ${dly(8)}><ul class="rl-ul">${terms.map(t => '<li>' + t + '</li>').join('')}</ul></div></div>`;
  };

  /* ---------- FAQ text ---------- */
  FAQ[2][1] = () => `Share your link from Profile → Refer & Earn. When a new player joins through it and completes ${minG()} games, you earn ₹${rfm(rn(REFC.rewardCash))}. Claim it from the My Rewards tab.`;
  FAQ[3][1] = () => `The friend must open your link in Telegram, be a brand-new player and complete ${minG()} games. Check progress in My Referrals. Still stuck? Use the feedback box below.`;

  /* ---------- CSS ---------- */
  const css = `
.rr-b.tgx{background:linear-gradient(180deg,#3cb6f5,#1672c4)!important;background-image:linear-gradient(180deg,#3cb6f5,#1672c4)!important;border:calc(3*var(--u)) solid #f0b43a!important;border-radius:calc(20*var(--u))!important;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:calc(3*var(--u));padding:calc(6*var(--u)) calc(2*var(--u));box-shadow:0 calc(3*var(--u)) calc(8*var(--u)) rgba(0,0,0,.35);color:#fff}
.rr-b.tgx::before,.rr-b.tgx::after{display:none!important;content:none!important}
.rr-b.tgx .rr-bi{background:none!important;width:calc(44*var(--u));height:calc(44*var(--u))}
.rr-b.tgx small{display:block!important;visibility:visible!important;opacity:1!important;position:static!important;font-weight:800;font-size:calc(11.5*var(--u));color:#fff;text-shadow:0 calc(1.5*var(--u)) calc(2*var(--u)) rgba(0,0,0,.5)}
.rr-lk{display:flex!important;align-items:center;gap:calc(8*var(--u));height:calc(50*var(--u))!important;min-height:0;padding:0 calc(6*var(--u)) 0 calc(12*var(--u))!important}
.rr-lk>.as,.rr-lk>.ph,.rr-lk>img{flex:none;margin:0!important}
.rr-lk>span{flex:1;min-width:0;margin:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;font-size:calc(13*var(--u))!important;font-weight:700;color:#e9e0ff;letter-spacing:.2px}
.rr-lk>button{flex:none}
.rr-code{display:flex;align-items:center;gap:calc(8*var(--u));margin-top:calc(8*var(--u));padding:calc(7*var(--u)) calc(12*var(--u));border-radius:calc(14*var(--u));background:rgba(255,255,255,.08);border:1px dashed rgba(255,210,31,.55);cursor:pointer}
.rr-code small{font-size:calc(11*var(--u));font-weight:600;color:#cfc2ff}
.rr-code b{margin-left:auto;font-size:calc(14*var(--u));font-weight:800;letter-spacing:1.5px;color:#ffd21f}
.rr-code em{font-style:normal;font-size:calc(10*var(--u));color:#bba9f5}
.rr-code:active{background:rgba(255,255,255,.16)}
.rr-sb{margin-top:calc(12*var(--u))}
.rr-sht b{display:block}

.rr-b{min-width:0;overflow:hidden}
.rr-b small{font-size:calc(10.5*var(--u));white-space:nowrap}
.rr-bi{display:grid;place-items:center;width:calc(44*var(--u));height:calc(44*var(--u))}
.rr-bi img.as,.rr-bi .ph{max-width:100%;max-height:100%}
.rr-svg{display:block;filter:drop-shadow(0 calc(2*var(--u)) calc(3*var(--u)) rgba(0,0,0,.35))}
.rr-note{margin-top:calc(8*var(--u));text-align:center;font-weight:700;font-size:calc(12.5*var(--u));color:#e9e0ff}.rr-note b{color:#ffd21f}
.rf-pgm{position:relative;display:block;min-width:calc(78*var(--u));height:calc(20*var(--u));border-radius:calc(12*var(--u));overflow:hidden;background:rgba(90,60,170,.22);border:1px solid rgba(90,60,170,.35)}
.rf-pgm i{position:absolute;left:0;top:0;bottom:0;border-radius:calc(12*var(--u));background:linear-gradient(90deg,#ffd84a,#f09a10);transition:width .6s}
.rf-pgm em{position:relative;display:block;text-align:center;font:800 calc(10.5*var(--u))/calc(20*var(--u)) Poppins,sans-serif;color:#2a1b5e}

.rl{padding-top:calc(6*var(--u))}
.rl-hero{position:relative;overflow:hidden;text-align:center;padding:calc(18*var(--u)) calc(12*var(--u)) calc(16*var(--u));border-radius:calc(26*var(--u));background:linear-gradient(180deg,#4a1fc0,#22097a);border:calc(3*var(--u)) solid #f0b43a;box-shadow:0 0 calc(14*var(--u)) rgba(240,180,60,.5);color:#fff}
.rl-glow{position:absolute;left:-30%;top:0;width:60%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);transform:skewX(-20deg);animation:rlShine 3.6s ease-in-out infinite}
.rl-coin{display:grid;place-items:center;margin:0 auto calc(6*var(--u));width:calc(46*var(--u));height:calc(46*var(--u));border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff2a0,#f0a010);border:calc(3*var(--u)) solid #fff0a0;color:#7a3a00;font-weight:800;font-size:calc(26*var(--u));animation:rlFloat 2.6s ease-in-out infinite}
.rl-hero h2{font-size:calc(20*var(--u));font-weight:800;letter-spacing:.3px}
.rl-amt{margin:calc(2*var(--u)) 0 calc(4*var(--u));font-size:calc(38*var(--u));font-weight:800;line-height:1.1;color:#ffd21f;text-shadow:0 calc(3*var(--u)) 0 #7a3a00}
.rl-type{display:flex;justify-content:center}
.rl-type span{display:inline-block;font-weight:600;font-size:calc(12.5*var(--u));color:#e9e0ff}
.rl-h{margin:calc(18*var(--u)) calc(4*var(--u)) calc(8*var(--u));font-weight:800;font-size:calc(15*var(--u));color:#fff;text-shadow:0 calc(2*var(--u)) calc(3*var(--u)) rgba(0,0,0,.4)}
.rl-h::after{content:"";display:block;width:calc(44*var(--u));height:calc(3*var(--u));margin-top:calc(4*var(--u));border-radius:calc(3*var(--u));background:linear-gradient(90deg,#ffd21f,transparent)}
.rl-steps{position:relative;display:flex;flex-direction:column;gap:calc(10*var(--u))}
.rl-steps::before{content:"";position:absolute;left:calc(21*var(--u));top:calc(20*var(--u));bottom:calc(20*var(--u));width:calc(3*var(--u));border-radius:calc(3*var(--u));background:linear-gradient(180deg,#ffd21f,#8a5cff,#ffd21f);background-size:100% 200%;animation:rlFlow 3s linear infinite}
.rl-s{position:relative;display:flex;align-items:flex-start;gap:calc(10*var(--u));padding:calc(10*var(--u)) calc(12*var(--u)) calc(10*var(--u)) calc(10*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,rgba(240,230,255,.97),rgba(214,194,250,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.75);color:#2a1b5e}
.rl-n{position:relative;z-index:1;flex:none;display:grid;place-items:center;width:calc(24*var(--u));height:calc(24*var(--u));border-radius:50%;background:linear-gradient(180deg,#ffd84a,#f09a10);color:#4a2400;font-weight:800;font-size:calc(13*var(--u));border:calc(2*var(--u)) solid #fff0a0}
.rl-s:last-child .rl-n{animation:rlPulse 1.6s ease-in-out infinite}
.rl-i{flex:none;font-size:calc(24*var(--u));line-height:1}
.rl-s b{display:block;font-size:calc(13.5*var(--u));color:#3a1590}
.rl-s p{margin-top:calc(2*var(--u));font-size:calc(11.5*var(--u));line-height:1.4;color:#4a3a8a}
.rl-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(8*var(--u))}
.rl-tiles>div{text-align:center;padding:calc(10*var(--u)) calc(4*var(--u));border-radius:calc(18*var(--u));background:linear-gradient(180deg,#3a1fb8,#1d0a6a);border:calc(2.5*var(--u)) solid #6a8cff;box-shadow:0 0 calc(10*var(--u)) rgba(110,140,255,.45);color:#fff}
.rl-tiles small{display:block;font-size:calc(10.5*var(--u));font-weight:700;color:#cfc2ff}
.rl-tiles b{display:block;margin:calc(2*var(--u)) 0;font-size:calc(18*var(--u));font-weight:800;color:#ffd21f;line-height:1.15}
.rl-tiles i{display:block;font-style:normal;font-size:calc(10*var(--u));color:#e9e0ff}
.rl-c{padding:calc(12*var(--u));border-radius:calc(20*var(--u));background:linear-gradient(180deg,rgba(240,230,255,.97),rgba(214,194,250,.95));border:calc(2*var(--u)) solid rgba(255,255,255,.75);color:#2a1b5e}
.rl-sub{font-size:calc(12*var(--u));color:#4a3a8a;margin-bottom:calc(6*var(--u))}
.rl-pz{display:flex;justify-content:space-between;align-items:center;padding:calc(6*var(--u)) calc(4*var(--u));border-bottom:1px solid rgba(90,60,170,.15);font-weight:700;font-size:calc(13*var(--u))}
.rl-pz span{display:flex;align-items:center;gap:calc(8*var(--u));font-size:calc(18*var(--u))}
.rl-pz em{font-style:normal;font-size:calc(12.5*var(--u));color:#4a3a8a}
.rl-pz b{color:#4a1fb0}
.rl-rk{display:grid;place-items:center;width:calc(22*var(--u));height:calc(22*var(--u));border-radius:50%;background:#cfc6ea;color:#2a1b5e;font-weight:800;font-size:calc(11.5*var(--u))}
.rl-ul{padding-left:calc(18*var(--u));font-size:calc(12*var(--u));line-height:1.45;color:#4a3a8a}.rl-ul li{margin-bottom:calc(5*var(--u))}
.rl-go .rl-hero{animation:rlUp .6s cubic-bezier(.2,.8,.2,1) both}
.rl-go .rl-type span{clip-path:inset(0 100% 0 0);animation:rlWrite 2.2s steps(34) .35s forwards}
.rl-go .rl-s,.rl-go .rl-tiles>div,.rl-go .rl-c{animation:rlUp .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}
@keyframes rlUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes rlWrite{to{clip-path:inset(0 0 0 0)}}
@keyframes rlShine{0%{left:-40%}60%,100%{left:120%}}
@keyframes rlFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(-4*var(--u)))}}
@keyframes rlFlow{to{background-position:0 200%}}
@keyframes rlPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,210,31,.7)}50%{box-shadow:0 0 0 calc(7*var(--u)) rgba(255,210,31,0)}}
@media (prefers-reduced-motion:reduce){.rl *{animation:none!important}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
