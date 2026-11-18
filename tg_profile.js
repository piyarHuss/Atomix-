/* tg_profile.js — Telegram naam + photo avatar
   Load: profile_plus.js -> deposit.js -> fast_deposit.js -> tg_profile.js -> boot() */
(() => {
  const UNICODE = true;    /* true = Hindi etc naam allowed, false = sirf English */
  const AV = 99;           /* Telegram avatar ka special number */

  const U = window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
  if (!U) return;

  const BAD = UNICODE ? /[^\p{L}\p{N}_ ]/gu : /[^A-Za-z0-9_ ]/g;
  const OK = UNICODE ? /^[\p{L}\p{N}_ ]+$/u : /^[A-Za-z0-9_ ]+$/;
  const len = s => Array.from(s).length;
  const clean = s => Array.from(String(s || '').replace(BAD, '').replace(/ +/g, ' ').trim()).slice(0, 16).join('').trim();

  let name = clean((U.first_name || '') + ' ' + (U.last_name || ''));
  if (len(name) < 3) name = clean(U.username);
  if (len(name) < 3) name = '';

  const letter = (Array.from(clean(U.first_name || U.username))[0] || 'P').toUpperCase();
  const INIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7a3ff0"/>' +
    '<text x="50" y="67" font-size="50" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#fff">' + letter + '</text></svg>');
  const PHOTO = U.photo_url || INIT;

  /* edit-name check (Hindi allow) */
  if (UNICODE) ppCheck = function () {
    const n = document.getElementById('ppn').value.trim();
    let e = '';
    if (len(n) < 3) e = 'Name must be at least 3 characters';
    else if (!OK.test(n)) e = 'Only letters, numbers, space and _ allowed';
    else if (/ {2,}/.test(n)) e = 'Double spaces are not allowed';
    return { n, e };
  };

  /* naam + pehli baar avatar */
  const _ar = applyRemote;
  applyRemote = function (v, first) {
    _ar(v, first);
    if (!first) return;
    v = v || {};
    let ch = false;
    if (name && PROF.name === 'LudoKing123') {
      PROF = { name, bio: PROF.bio || '' }; ME.name = name; dbSet('prof', PROF); ch = true;
    }
    if (!v.tgav) {
      dbSet('tgav', 1);
      if (U.photo_url && !v.myAv) { myAv = AV; dbSet('myAv', AV); ch = true; }
    }
    if (ch) { try { rer(); } catch (e) { } }
  };

  window.tgPick = function () {
    if (myAv === AV) return;
    myAv = AV; dbSet('myAv', AV); rer(); toast('Telegram avatar selected');
  };

  /* Avatars page: upar Telegram card */
  const _av = V.avatars;
  V.avatars = function () {
    const sel = myAv === AV;
    const card = `<div class="av-card"><div class="av-sh">Telegram Avatar <small>From your account</small></div>
<div class="av-g"><div class="av-t${sel ? ' sel' : ''}" onclick="tgPick()"><div class="av-im"><img class="as" src="assets/av${AV}.png" alt="">${sel ? '<b class="av-ck">✓</b>' : ''}</div>
<small>${sel ? 'Selected' : 'Use my photo'}</small></div></div></div>`;
    return _av().replace('<div class="av-card">', card + '<div class="av-card">');
  };

  /* har av99 image -> Telegram photo (fail ho to initials) */
  const sel = 'img[src*="av' + AV + '.png"]';
  const fix = r => {
    const l = r.matches && r.matches(sel) ? [r] : [];
    if (r.querySelectorAll) r.querySelectorAll(sel).forEach(i => l.push(i));
    l.forEach(i => {
      i.removeAttribute('onerror');
      i.referrerPolicy = 'no-referrer';
      i.onerror = () => { i.onerror = null; i.src = INIT; };
      i.src = PHOTO;
    });
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && fix(n))))
    .observe(document.documentElement, { childList: true, subtree: true });
  fix(document);
})();
