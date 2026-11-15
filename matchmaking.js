/* =====================================================================
   matchmaking.js  —  real user vs user, nahi mila to AI
   ===================================================================== */
const MM_WAIT = 10000;    /* itne ms real player ka wait, phir AI */
const MM_STALE = 25000;   /* itna purana queue entry ignore */
const MM_HB = 7000;       /* heartbeat */

let MM_OFF = 0;
try { fdb.ref('.info/serverTimeOffset').on('value', s => MM_OFF = s.val() || 0); } catch (e) { }
const mmNow = () => Date.now() + MM_OFF;

const mm = { on: false, starting: false, pool: null, qref: null, mref: null, hb: null, to: null, lis: null };

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
  if (!UID || !MATCH.pool) { mtT = setTimeout(foundOpp, 3000); return; }

  const pid = MATCH.pool.id;
  mm.on = true; mm.pool = pid;
  mm.qref = fdb.ref('queue/' + pid + '/' + UID);
  mm.mref = fdb.ref('userMatch/' + UID);

  mm.mref.set(null).then(() => {
    if (!mm.on) return;
    /* koi bhi mujhe match kar de to ye fire hoga */
    mm.lis = s => { const mid = s.val(); if (mid && mm.on) mmStart(mid); };
    mm.mref.on('value', mm.lis);

    let taken = null;
    fdb.ref('queue/' + pid).transaction(q => {
      taken = null; q = q || {};
      const t = mmNow();
      for (const k of Object.keys(q)) {
        if (k === UID) continue;
        if (t - (q[k].ts || 0) > MM_STALE) { delete q[k]; continue; }   /* purana/dead entry */
        taken = Object.assign({ uid: k }, q[k]); delete q[k]; break;
      }
      if (taken) delete q[UID];
      else q[UID] = { name: PROF.name, av: myAv > 1 ? 'av' + myAv : 'av1', ts: t };
      return Object.keys(q).length ? q : null;
    }).then(() => {
      if (!mm.on) return;
      if (taken) { mmCreate(taken); return; }
      /* queue me wait karo */
      mm.qref.onDisconnect().remove();
      mm.hb = setInterval(() => mm.qref.transaction(c => c ? Object.assign({}, c, { ts: mmNow() }) : c), MM_HB);
      mm.to = setTimeout(mmTimeout, MM_WAIT);
    }).catch(e => { console.error('MM fail', e); if (mm.on) { mmStop(); mtT = setTimeout(foundOpp, 1500); } });
  });
};

/* kisi ko nahi mila -> AI */
async function mmTimeout() {
  if (!mm.on) return;
  let was = false;
  try { await mm.qref.transaction(c => { was = c !== null; return null; }); } catch (e) { was = true; }
  if (was) { mmStop(false); foundOpp(); return; }      /* abhi bhi queue me tha -> koi real nahi mila */
  /* kisi ne mujhe utha liya hai, pointer aane do (max 5s) */
  mm.to = setTimeout(() => { if (mm.on && !mm.starting) { mmStop(false); foundOpp(); } }, 5000);
}

/* maine opponent utha liya -> match banao (atomic) */
function mmCreate(opp) {
  const mid = fdb.ref('matches').push().key;
  const me = { uid: UID, name: PROF.name, av: myAv > 1 ? 'av' + myAv : 'av1' };
  const up = {};
  up['matches/' + mid] = { pool: mm.pool, created: firebase.database.ServerValue.TIMESTAMP, host: me, guest: { uid: opp.uid, name: opp.name, av: opp.av } };
  up['userMatch/' + opp.uid] = mid;
  up['userMatch/' + UID] = mid;
  fdb.ref().update(up).catch(e => { console.error(e); if (mm.on) { mmStop(); foundOpp(); } });
}

/* match mil gaya (host aur guest dono yahi chalate hain) */
async function mmStart(mid) {
  if (mm.starting || MATCH.started) return;
  mm.starting = true;
  const d = (await fdb.ref('matches/' + mid).once('value')).val();
  if (!d || cur !== 'match') { mm.starting = false; return; }
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
    game: curGame, pool: p, ai: false, opponentType: 'human',
    matchId: mid, role: host ? 'host' : 'guest', net: MatchNet.open(mid, host ? 'host' : 'guest'),
    me: ME.name, meAvatar: AVURL(myKey),
    opponent: o.name, opponentAvatar: AVURL(o.av), opAvKey: o.av
  }), 1800);
}

/* ---------- cancel / page chhodna ---------- */
const _cmMM = cancelMatch;
cancelMatch = function () { mmStop(); try { if (UID) fdb.ref('userMatch/' + UID).remove(); } catch (e) { } _cmMM(); };
(() => { const g = go; go = function (v) { if (v !== 'match' && mm.on && !MATCH.started) mmStop(); g(v); }; })();

/* ---------- game ke andar moves sync (ludo.js ye use karega) ---------- */
const MatchNet = {
  r: null, role: null, lis: null,
  open(mid, role) {
    this.close(); this.role = role; this.r = fdb.ref('matches/' + mid);
    try { this.r.child('left/' + UID).onDisconnect().set(true); } catch (e) { }
    const me = this;
    return {
      role,
      send(o) { me.r.child('moves').push(Object.assign({}, o, { by: role, t: firebase.database.ServerValue.TIMESTAMP })); },
      onMsg(cb) { me.lis = s => { const v = s.val(); if (v && v.by !== role) cb(v); }; me.r.child('moves').on('child_added', me.lis); },
      onOppLeft(cb) { me.r.child('left').on('value', s => { const v = s.val() || {}; if (Object.keys(v).some(k => k !== UID)) cb(); }); },
      close() { me.close(); }
    };
  },
  close() { if (this.r) { try { this.r.child('moves').off(); this.r.child('left').off(); this.r.child('left/' + UID).onDisconnect().cancel(); } catch (e) { } } this.r = null; }
};