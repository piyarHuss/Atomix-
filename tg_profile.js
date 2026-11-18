/* tg_profile.js v3 — Telegram naam + photo avatar
   Load: [telegram-web-app.js] -> profile_plus.js -> deposit.js -> fast_deposit.js -> tg_profile.js?v=3 -> boot() */
(() => {
  const UNICODE = true;   /* true = Hindi etc naam allowed */
  const DEBUG = true;     /* true = shuru me toast dikhega (testing). Live me false karo */
  const AV = 99;

  /* ---- Telegram user dhoondho (SDK, initData, URL hash, sessionStorage) ---- */
  const parse = d => { try { const u = new URLSearchParams(d).get('user'); return u ? JSON.parse(u) : null; } catch (e) { return null; } };
  const getUser = () => {
    try { const w = window.Telegram && Telegram.WebApp; if (w) { if (w.initDataUnsafe && w.initDataUnsafe.user) return w.initDataUnsafe.user; if (w.initData) { const u = parse(w.initData); if (u) return u; } } } catch (e) { }
    try { const h = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData'); if (h) { const u = parse(h); if (u) return u; } } catch (e) { }
    try { const s = JSON.parse(sessionStorage.getItem('__telegram__initParams') || 'null'); if (s && s.tgWebAppData) { const u = parse(s.tgWebAppData); if (u) return u; } } catch (e) { }
    return null;
  };

  const BAD = UNICODE ? /[^\p{L}\p{N}_ ]/gu : /[^A-Za-z0-9_ ]/g;
  const OK = UNICODE ? /^[\p{L}\p{N}_ ]+$/u : /^[A-Za-z0-9_ ]+$/;
  const len = s => Array.from(s).length;
  const clean = s => Array.from(String(s || '').replace(BAD, '').replace(/ +/g, ' ').trim()).slice(0, 16).join('').trim();

  let U = null, name = '', PHOTO = '', INIT = '';
  const prep = () => {
    if (U) return true;
    U = getUser();
    if (!U) return false;
    name = clean((U.first_name || '') + ' ' + (U.last_name || ''));
    if (len(name) < 3) name = clean(U.username);
    if (len(name) < 3) name = '';
    const letter = (Array.from(clean(U.first_name || U.username))[0] || 'P').toUpperCase();
    INIT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7a3ff0"/>' +
      '<text x="50" y="67" font-size="50" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#fff">' + letter + '</text></svg>');
    PHOTO = U.photo_url || INIT;
    return true;
  };
  prep();   /* abhi try karo (hash badalne se pehle) */

  if (DEBUG) setTimeout(() => {
    prep();
    try { toast('TG sdk: ' + (window.Telegram ? 'ok' : 'MISSING') + ' | user: ' + (U ? U.first_name : 'NOT FOUND') + ' | photo: ' + (U && U.photo_url ? 'yes' : 'no')); } catch (e) { }
  }, 3500);

  /* ---- naam edit check (Hindi allow) ---- */
  if (UNICODE) ppCheck = function () {
    const n = document.getElementById('ppn').value.trim();
    let e = '';
    if (len(n) < 3) e = 'Name must be at least 3 characters';
    else if (!OK.test(n)) e = 'Only letters, numbers, space and _ allowed';
    else if (/ {2,}/.test(n)) e = 'Double spaces are not allowed';
    return { n, e };
  };

  /* ---- naam + pehli baar avatar ---- */
  const _ar = applyRemote;
  applyRemote = function (v, first) {
    _ar(v, first);
    if (!first || !prep()) return;
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

  /* ---- Avatars page: upar Telegram card ---- */
  const _av = V.avatars;
  V.avatars = function () {
    if (!prep()) return _av();
    const sel = myAv === AV;
    const card = `<div class="av-card"><div class="av-sh">Telegram Avatar <small>From your account</small></div>
<div class="av-g"><div class="av-t${sel ? ' sel' : ''}" onclick="tgPick()"><div class="av-im"><img class="as" src="assets/av${AV}.png" alt="">${sel ? '<b class="av-ck">✓</b>' : ''}</div>
<small>${sel ? 'Selected' : 'Use my photo'}</small></div></div></div>`;
    return _av().replace('<div class="av-card">', card + '<div class="av-card">');
  };

  /* ---- har av99 image -> Telegram photo (fail ho to initials) ---- */
  const SEL = 'img[src*="av' + AV + '.png"]';
  const fix = r => {
    if (!prep()) return;
    const l = r.matches && r.matches(SEL) ? [r] : [];
    if (r.querySelectorAll) r.querySelectorAll(SEL).forEach(i => l.push(i));
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
