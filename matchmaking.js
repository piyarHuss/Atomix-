/* =====================================================================
   matchmaking.js  v2  —  real user vs user (Ludo + Carrom), nahi mila to AI

   v2:
   - Queue ab GAME ke hisaab se alag: queue/<game>_<pool>/<uid>
     (pehle sirf pool id tha, isliye Ludo aur Carrom wale aapas me jud sakte the)
   - Match me game ka naam save hota hai; galat game ka match ignore hota hai
   - Wait time 15 sec (real player ko milne ka zyada mauka), stale 30 sec
   - MatchNet: live "aim" ab alag node me overwrite hota hai (database me kachra nahi bharta)
   - Debug: console me "MM:" lines
   ===================================================================== */
const MM_WAIT = 15000;    /* itne ms real player ka wait, phir AI */
const MM_STALE = 30000;   /* itna purana queue entry ignore */
const MM_HB = 7000;       /* heartbeat */

let MM_OFF = 0;
try { fdb.ref('.info/serverTimeOffset').on('value', s => MM_OFF = s.val() || 0); } catch (e) { }
const mmNow = () => Date.now() + MM_OFF;
const mmLog = (...a) => { try { console.log('MM:', ...a); } catch (e) { } };

const mm = { on: false, starting: false, pool: null, game: null, qref: null, mref: null, hb: null, to: null, lis: null };

function mmStop(removeQ = true) {
  clearTimeout(mm.to); clearInterval(mm.hb);
  if (mm.mref && mm.lis) { try { mm.mref.off('value', mm.lis); } catch (e) { } }
  if (mm.qref) { try { mm.qref.onDisconnect().cancel(); } catch (e) { } if (removeQ) { try { mm.qref.remove(); } catch (e) { } } }
  mm.on = false; mm.lis = null;
}

/* ---------- search shuru ---------- */
startSearch = function () {
  mmStop(); clearTimeout(mtT); clearTimeout(matchStartTimer);
  MATCH.started = false; mm.starting = false;
  const title = document.getElementById('mtt'), sub = document.getElementById('mts'), opp = document.getElementById('mtopp');
  if (title) title.textContent = 'Finding Opponent';
  if (sub) sub.textContent = 'Looking for a real player...';
  if (opp) opp.innerHTML = `<div class="mt-c opp">${A('opp_unknown', '❔', 50, 0)}</div><span class="mt-l opp">Searching...</span>`;
  srchStart();

  /* Firebase login na ho to seedha AI */
  if (!UID || !MATCH.pool) { mmLog('no UID/pool -> AI', !!UID, !!MATCH.pool); mtT = setTimeout(foundOpp, 3000); return; }

  const game = (typeof curGame === 'string' && curGame) ? curGame : 'Ludo';
  const pid = MATCH.pool.id;
  const qk = game + '_' + pid;                       /* game + pool ki alag queue */
  mm.on = true; mm.pool = pid; mm.game = game;
  mm.qref = fdb.ref('queue/' + qk + '/' + UID);
  mm.mref = fdb.ref('userMatch/' + UID);
  mmLog('search start', qk);

  mm.mref.set(null).then(() => {
    if (!mm.on) return;
    /* koi bhi mujhe match kar de to ye fire hoga */
    mm.lis = s => { const mid = s.val(); if (mid && mm.on) mmStart(mid); };
    mm.mref.on('value', mm.lis);

    let taken = null;
    fdb.ref('queue/' + qk).transaction(q => {
      taken = null; q = q || {};
      const t = mmNow();
      for (const k of Object.keys(q)) {
        if (k === UID) continue;
        if (!q[k] || t - (q[k].ts || 0) > MM_STALE) { delete q[k]; continue; }   /* purana/dead entry */
        taken = Object.assign({ uid: k }, q[k]); delete q[k]; break;
      }
      if (taken) delete q[UID];
      else q[UID] = { name: PROF.name, av: myAv > 1 ? 'av' + myAv : 'av1', ts: t };
      return Object.keys(q).length ? q : null;
    }).then(r => {
      if (!mm.on) return;
      if (taken) { mmLog('opponent found in queue', taken.uid); mmCreate(taken); return; }
      /* queue me wait karo */
      mmLog('waiting in queue');
      mm.qref.onDisconnect().remove();
      mm.hb = setInterval(() => mm.qref.transaction(c => c ? Object.assign({}, c, { ts: mmNow() }) : c), MM_HB);
      mm.to = setTimeout(mmTimeout, MM_WAIT);
    }).catch(e => { console.error('MM fail', e.code, e.message); if (mm.on) { mmStop(); mtT = setTimeout(foundOpp, 1500); } });
  }).catch(e => { console.error('MM userMatch reset fail', e.code, e.message); if (mm.on) { mmStop(); mtT = setTimeout(foundOpp, 1500); } });
};

/* kisi ko nahi mila -> AI */
async function mmTimeout() {
  if (!mm.on) return;
  let was = false;
  try { await mm.qref.transaction(c => { was = c !== null; return null; }); } catch (e) { was = true; }
  if (was) { mmLog('timeout -> AI'); mmStop(false); foundOpp(); return; }      /* abhi bhi queue me tha -> koi real nahi mila */
  /* kisi ne mujhe utha liya hai, pointer aane do (max 5s) */
  mm.to = setTimeout(() => { if (mm.on && !mm.starting) { mmStop(false); foundOpp(); } }, 5000);
}

/* maine opponent utha liya -> match banao (atomic) */
function mmCreate(opp) {
  const mid = fdb.ref('matches').push().key;
  const me = { uid: UID, name: PROF.name, av: myAv > 1 ? 'av' + myAv : 'av1' };
  const up = {};
  up['matches/' + mid] = { game: mm.game, pool: mm.pool, created: firebase.database.ServerValue.TIMESTAMP, host: me, guest: { uid: opp.uid, name: opp.name, av: opp.av } };
  up['userMatch/' + opp.uid] = mid;
  up['userMatch/' + UID] = mid;
  fdb.ref().update(up).catch(e => { console.error('MM create fail', e.code, e.message); if (mm.on) { mmStop(); foundOpp(); } });
}

/* match mil gaya (host aur guest dono yahi chalate hain) */
async function mmStart(mid) {
  if (mm.starting || MATCH.started) return;
  mm.starting = true;
  let d = null;
  try { d = (await fdb.ref('matches/' + mid).once('value')).val(); } catch (e) { console.error('MM read match fail', e); }
  if (!d || cur !== 'match') { mm.starting = false; return; }
  /* galat game ka match (purana / dusre game ka) ignore */
  const myGame = (typeof curGame === 'string' && curGame) ? curGame : 'Ludo';
  if (d.game && d.game !== myGame) {
    mmLog('game mismatch', d.game, myGame);
    mm.starting = false; try { fdb.ref('userMatch/' + UID).remove(); } catch (e) { } return;
  }
  mmLog('match start', mid, d.game);
  mmStop(false); srchStop();
  const p = MATCH.pool, host = d.host.uid === UID, o = host ? d.guest : d.host;

  const bal = p.kind === 'g' ? BAL.gems : BAL.cash;
  if (bal < p.feeN) {
    toast(p.kind === 'g' ? 'Not enough diamonds!' : 'Not enough cash!');
    fdb.ref('matches/' + mid + '/left/' + UID).set(true);
    fdb.ref('userMatch/' + UID).remove(); go('pool'); return;
  }
  MATCH.started = true;
  if (p.kind === 'g') BAL.gems -= p.feeN; else BAL.cash = +(BAL.cash - p.feeN).toFixed(2);
  saveBal(); refreshBal();
  fdb.ref('userMatch/' + UID).remove();

  MATCH.botName = o.name; MATCH.botAv = o.av;
  const oe = document.getElementById('mtopp');
  if (oe) oe.innerHTML = `<div class="mt-c opp on">${A(o.av, '🧑', 40, 0)}</div><span class="mt-l opp on">${esc(o.name)}</span>`;
  const ring = document.querySelector('.mt-ring'); if (ring) ring.classList.add('found');
  const t = document.getElementById('mtt'), s = document.getElementById('mts');
  if (t) t.textContent = 'Player Found!'; if (s) s.textContent = 'Real player ready. Starting match...';
  sfx('match_found');

  const myKey = myAv > 1 ? 'av' + myAv : 'av1';
  matchStartTimer = setTimeout(() => onMatchStart({
    game: myGame, pool: p, ai: false, opponentType: 'human',
    matchId: mid, role: host ? 'host' : 'guest', net: MatchNet.open(mid, host ? 'host' : 'guest'),
    me: ME.name, meAvatar: AVURL(myKey),
    opponent: o.name, opponentAvatar: AVURL(o.av), opAvKey: o.av
  }), 1800);
}

/* ---------- cancel / page chhodna ---------- */
const _cmMM = cancelMatch;
cancelMatch = function () { mmStop(); try { if (UID) fdb.ref('userMatch/' + UID).remove(); } catch (e) { } _cmMM(); };
(() => { const g = go; go = function (v) { if (v !== 'match' && mm.on && !MATCH.started) mmStop(); g(v); }; })();

/* ---------- game ke andar sync (ludo.js / carrom.js ye use karte hain) ----------
   send({type:'roll'|'move'|'shot'|'pass'|'forfeit'|'react'...}) -> matches/<id>/moves (push, sabko milta hai)
   send({type:'aim', ...})  -> matches/<id>/aim_<role> (overwrite, sirf latest; live aim ke liye) */
const MatchNet = {
  r: null, role: null, lis: null, aimRef: null, aimLis: null, leftRef: null,
  open(mid, role) {
    this.close(); this.role = role; this.r = fdb.ref('matches/' + mid);
    try { this.r.child('left/' + UID).onDisconnect().set(true); } catch (e) { }
    const me = this;
    const other = role === 'host' ? 'guest' : 'host';
    return {
      role,
      send(o) {
        if (!me.r) return;
        if (o && o.type === 'aim') {
          me.r.child('aim_' + role).set(Object.assign({}, o, { by: role, t: firebase.database.ServerValue.TIMESTAMP })).catch(() => { });
          return;
        }
        me.r.child('moves').push(Object.assign({}, o, { by: role, t: firebase.database.ServerValue.TIMESTAMP }));
      },
      onMsg(cb) {
        me.lis = s => { const v = s.val(); if (v && v.by !== role) cb(v); };
        me.r.child('moves').on('child_added', me.lis);
        /* opponent ka live aim (sirf carrom use karta hai) */
        me.aimRef = me.r.child('aim_' + other);
        me.aimLis = s => { const v = s.val(); if (v && v.by !== role) cb(v); };
        me.aimRef.on('value', me.aimLis);
      },
      onOppLeft(cb) {
        me.leftRef = me.r.child('left');
        me.leftRef.on('value', s => { const v = s.val() || {}; if (Object.keys(v).some(k => k !== UID)) cb(); });
      },
      close() { me.close(); }
    };
  },
  close() {
    if (this.r) {
      try { this.r.child('moves').off(); this.r.child('left').off(); this.r.child('left/' + UID).onDisconnect().cancel(); } catch (e) { }
      try { if (this.aimRef && this.aimLis) this.aimRef.off('value', this.aimLis); } catch (e) { }
    }
    this.r = null; this.aimRef = null; this.aimLis = null; this.leftRef = null;
  }
};
