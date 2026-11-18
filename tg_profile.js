/* =====================================================================
   tg_profile.js — Ludo Masters
   1) Telegram account ka naam -> profile name (sirf jab user ne apna naam nahi badla)
   2) Telegram ki photo -> Avatars page me "Telegram Avatar" tile (id 99)
   Load order: profile_plus.js -> deposit.js -> fast_deposit.js -> tg_profile.js -> boot()
   ===================================================================== */
(() => {
  const TG_UNICODE_NAME = true;   /* true = Hindi/other language ke naam bhi allowed. false = sirf English */
  const TG_AV = 99;               /* Telegram avatar ka special number */

  const W = window.Telegram && Telegram.WebApp;
  const U = (W && W.initDataUnsafe && W.initDataUnsafe.user) || null;
  if (!U) return;                 /* Telegram ke bahar khola to kuch nahi karega */

  /* ---------- naam saaf karo (app ke rules: 3-16 char, no double space) ---------- */
  const clean = s => {
    s = String(s || '').replace(TG_UNICODE_NAME ? /[^\p{L}\p{N}_ ]/gu : /[^A-Za-z0-9_ ]/g, '');
    s = s.replace(/ {2,}/g, ' ').trim();
    return Array.from(s).slice(0, 16).join('').trim();
  };
  const len = s => Array.from(s).length;
  const tgName = () => {
    let n = clean((U.first_name || '') + ' ' + (U.last_name || ''));
    if (len(n) < 3) n = clean(U.username);
    return len(n) >= 3 ? n : '';
  };

  /* ---------- photo: Telegram photo_url, na ho to naam ke pehle akshar wala avatar ---------- */
  const ch = (Array.from(clean(U.first_name || U.username || 'P'))[0] || 'P').toUpperCase();
  const INIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7a3ff0"/>' +
    '<text x="50" y="67" font-size="50" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#fff">' + ch + '</text></svg>');
  const PHOTO = U.photo_url || INIT;

  /* ---------- name edit me bhi Hindi etc allow (agar TG_UNICODE_NAME true) ---------- */
  if (TG_UNICODE_NAME) {
    ppCheck = function () {
      const n = document.getElementById('ppn').value.trim();
      let e = '';
      if (len(n) < 3) e = 'Name must be at least 3 characters';
      else if (!/^[\p{L}\p{N}_ ]+$/u.test(n)) e = 'Only letters, numbers, space and _ allowed';
      else if (/ {2,}/.test(n)) e = 'Double spaces are not allowed';
      return { n, e };
    };
  }

  /* ---------- Firebase data aane par: naam + pehli baar avatar ---------- */
  const _ar = applyRemote;
  applyRemote = function (v, first) {
    _ar(v, first);
    if (!first) return;
    v = v || {};
    let changed = false;
    const n = tgName();
    if (n && PROF.name === 'LudoKing123') {                 /* default naam hi hai -> Telegram naam lagao */
      PROF = { name: n, bio: PROF.bio || '' };
      ME.name = n; dbSet('prof', PROF); changed = true;
    }
    if (!v.tgav) {                                           /* sirf ek baar auto-select */
      dbSet('tgav', 1);
      if (!v.myAv) { myAv = TG_AV; dbSet('myAv', TG_AV); changed = true; }
    }
    if (changed) { try { rer(); } catch (e) { } }
  };

  /* ---------- tile select karne ka function ---------- */
  window.tgPick = function () {
    if (myAv === TG_AV) return;
    myAv = TG_AV; dbSet('myAv', TG_AV);
    rer(); toast('Telegram avatar selected');
  };

  /* ---------- Avatars page: sabse upar Telegram card ---------- */
  const _av = V.avatars;
  V.avatars = function () {
    const sel = myAv === TG_AV;
    const card = `<div class="av-card"><div class="av-sh">Telegram Avatar <small>From your account</small></div>
<div class="av-g"><div class="av-t${sel ? ' sel' : ''}" onclick="tgPick()">
<div class="av-im"><img class="as" src="${esc(PHOTO)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${INIT}'" alt="">${sel ? '<b class="av-ck">✓</b>' : ''}</div>
<small>${sel ? 'Selected' : 'Use my photo'}</small></div></div></div>`;
    return _av().replace('<div class="av-card">', card + '<div class="av-card">');
  };

  /* ---------- jahan bhi av99 aaye (profile, home, menu, pool, edit sheet) -> Telegram photo ---------- */
  const fix = root => {
    const list = [];
    if (root.matches && root.matches('img[src*="av' + TG_AV + '.png"]')) list.push(root);
    if (root.querySelectorAll) root.querySelectorAll('img[src*="av' + TG_AV + '.png"]').forEach(i => list.push(i));
    list.forEach(i => {
      i.removeAttribute('onerror');
      i.referrerPolicy = 'no-referrer';
      i.onerror = () => { i.onerror = null; i.src = INIT; };
      i.src = PHOTO;
    });
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) fix(n); })))
    .observe(document.documentElement, { childList: true, subtree: true });
  fix(document);
})();
