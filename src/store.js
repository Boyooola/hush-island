// Things the island remembers between visits: carvings, bottle notes and how many nights you have come.
// Everything read from here was written by other visitors: treat it as untrusted text, never as markup.
const DAY = 86400000;
const CARVING_LIFE = 7 * DAY;
const BOTTLE_LIFE = 30 * DAY;

import { use } from './backend.js';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const local = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* no storage: carry on */ } },
};
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createStore() {
  let db = null, user = null, uid = null, canWrite = null;
  let deviceId = local.get('ember.device');
  if (typeof deviceId !== 'string') { deviceId = 'd' + Math.random().toString(36).slice(2, 12); local.set('ember.device', deviceId); }

  const ready = (async () => {
    try {
      [db, user] = await Promise.all([use('db'), use('user')]);
      if (user) {
        try { uid = await user.id(); } catch (e) { uid = null; }
        try { canWrite = await user.can('data.write'); } catch (e) { canWrite = null; }
      }
    } catch (e) { db = null; }
  })();
  const me = () => uid || deviceId;

  // How many notes and carvings this visitor has left tonight (a light limit, kept on the device).
  function spend(kind, max) {
    const key = `ember.spent.${kind}`, rec = local.get(key);
    const today = todayKey();
    const n = rec && rec.day === today ? rec.n : 0;
    if (n >= max) return false;
    local.set(key, { day: today, n: n + 1 });
    return true;
  }

  // ---- carvings ----
  function parseCarving(doc) {
    const d = doc.data() || {};
    const text = clean(d.text, 60), at = Number(d.at);
    if (!text || !Number.isFinite(at)) return null;
    return { id: doc.id, text, name: clean(d.name, 22) || 'Someone', at };
  }
  // cb(list, state): state is 'loading', 'ok', 'slow' or 'off'.
  function watchCarvings(cb) {
    let stop = null, cancelled = false;
    cb([], 'loading');
    ready.then(() => {
      if (cancelled) return;
      if (!db) { cb([], 'off'); return; }
      let got = false;
      const slow = setTimeout(() => { if (!got) cb([], 'slow'); }, 10000);
      try {
        stop = db.collection('carvings').orderBy('at', 'desc').limit(20).onSnapshot((snap) => {
          got = true; clearTimeout(slow);
          const cutoff = Date.now() - CARVING_LIFE;
          cb(snap.docs.map(parseCarving).filter((c) => c && c.at > cutoff), 'ok');
        }, () => { clearTimeout(slow); cb([], 'off'); });
      } catch (e) { clearTimeout(slow); cb([], 'off'); }
    });
    return () => { cancelled = true; if (stop) stop(); };
  }
  async function carve(text, name) {
    await ready;
    text = clean(text, 60);
    if (!text) return 'empty';
    if (!db || canWrite === false) return 'readonly';
    if (!spend('carve', 5)) return 'limit';
    try {
      await db.collection('carvings').add({ text, name: clean(name, 22), at: Date.now(), by: me() });
      // Sweep away a few carvings that have faded.
      db.collection('carvings').where('at', '<', Date.now() - CARVING_LIFE).limit(10).get()
        .then((old) => old.docs.forEach((d) => db.doc('carvings/' + d.id).delete().catch(() => {}))).catch(() => {});
      return 'ok';
    } catch (e) {
      if (e && e.code === 'invalid_argument') canWrite = false;
      return e && e.code === 'invalid_argument' ? 'readonly' : 'failed';
    }
  }

  // ---- bottle notes ----
  function parseBottle(doc) {
    const d = doc.data() || {};
    const text = clean(d.text, 140), at = Number(d.at);
    if (!text || !Number.isFinite(at)) return null;
    return {
      id: doc.id, text, name: clean(d.name, 22) || 'Someone', at, from: String(d.from || ''),
      state: d.state === 'replied' ? 'replied' : d.state === 'kept' ? 'kept' : 'adrift',
      reply: clean(d.reply, 140), replyName: clean(d.replyName, 22) || 'Someone',
    };
  }
  // What the tide has for you: a reply to one of your own notes first, otherwise a stranger's note.
  async function findBottle() {
    await ready;
    if (!db) return null;
    try {
      const mine = await db.collection('bottles').where('from', '==', me()).limit(20).get();
      const answered = mine.docs.map(parseBottle).find((b) => b && b.state === 'replied');
      if (answered) return { ...answered, kind: 'reply' };
      const adrift = await db.collection('bottles').where('state', '==', 'adrift').limit(30).get();
      const cutoff = Date.now() - BOTTLE_LIFE;
      const skipped = local.get('ember.bottles.seen') || [];
      const others = adrift.docs.map(parseBottle).filter((b) => b && b.from !== me() && b.at > cutoff && !skipped.includes(b.id));
      if (!others.length) return null;
      return { ...others[Math.floor(Math.random() * others.length)], kind: 'note' };
    } catch (e) { return null; }
  }
  async function throwBottle(text, name) {
    await ready;
    text = clean(text, 140);
    if (!text) return 'empty';
    if (!db || canWrite === false) return 'readonly';
    if (!spend('bottle', 5)) return 'limit';
    try {
      await db.collection('bottles').add({ text, name: clean(name, 22), at: Date.now(), from: me(), state: 'adrift' });
      return 'ok';
    } catch (e) {
      if (e && e.code === 'invalid_argument') canWrite = false;
      return e && e.code === 'invalid_argument' ? 'readonly' : 'failed';
    }
  }
  async function replyBottle(id, text, name) {
    await ready;
    text = clean(text, 140);
    if (!text) return 'empty';
    if (!db || canWrite === false) return 'readonly';
    try {
      await db.doc('bottles/' + id).update({ state: 'replied', reply: text, replyName: clean(name, 22), replyAt: Date.now() });
      return 'ok';
    } catch (e) { return e && e.code === 'invalid_argument' ? 'readonly' : 'failed'; }
  }
  // Put a stranger's note back without answering: it stays adrift for someone else, but not for you.
  function passBottle(id) {
    const seen = local.get('ember.bottles.seen') || [];
    if (!seen.includes(id)) { seen.push(id); local.set('ember.bottles.seen', seen.slice(-60)); }
  }
  // You have read the reply to your own note: the bottle is done.
  async function finishBottle(id) {
    await ready;
    if (!db) return;
    try { await db.doc('bottles/' + id).delete(); } catch (e) { /* it will be offered again next time */ }
  }

  // ---- nights visited ----
  // Counts different nights, never streaks. Kept on the device and, where possible, with the account.
  async function countNight() {
    const today = todayKey();
    let rec = local.get('ember.nights');
    if (!rec || !Number.isFinite(rec.count)) rec = { count: 0, last: '' };
    await ready;
    let ref = null, remote = null;
    if (db && uid) {
      try {
        ref = db.doc('data/users/' + uid + '/visits');
        const snap = await ref.get();
        const d = snap.exists ? snap.data() : null;
        if (d && Number.isFinite(d.count)) remote = { count: Math.floor(d.count), last: String(d.last || '') };
      } catch (e) { ref = null; }
    }
    if (remote && remote.count >= rec.count) rec = remote;
    let changed = !remote || remote.count !== rec.count || remote.last !== rec.last;
    if (rec.last !== today) { rec = { count: Math.min(9999, rec.count + 1), last: today }; changed = true; }
    local.set('ember.nights', rec);
    if (ref && changed && canWrite !== false) { try { await ref.set(rec); } catch (e) { /* the device copy still counts */ } }
    return rec.count;
  }

  // ---- the boat everyone is building ----
  // Each delivery is one small record; the boat's progress is their sum. Without storage, your own planks still count on this device.
  function watchBoat(cb) {
    const mine = () => { const v = local.get('ember.boat'); return Number.isFinite(v) ? v : 0; };
    cb(mine(), 'loading');
    ready.then(() => {
      if (!db) { cb(mine(), 'off'); return; }
      try {
        db.collection('boat').orderBy('at', 'desc').limit(1000).onSnapshot((snap) => {
          // The total, and who it came from: every name with the planks given under it, most first.
          let total = 0;
          const by = new Map();
          for (const d of snap.docs) {
            const rec = d.data() || {}, n = Number(rec.n);
            if (!Number.isFinite(n)) continue;
            const k = Math.max(0, Math.min(5, Math.floor(n)));
            total += k;
            const name = (clean(rec.name, 22) || 'A visitor') + (/^\d{4}$/.test(String(rec.code)) ? ` #${rec.code}` : '');
            by.set(name, (by.get(name) || 0) + k);
          }
          cb(total, 'ok', [...by.entries()].map(([name, n]) => ({ name, n })).sort((p, q) => q.n - p.n));
        }, () => cb(mine(), 'off'));
      } catch (e) { cb(mine(), 'off'); }
    });
  }
  async function addPlanks(n, name, code) {
    const v = local.get('ember.boat');
    local.set('ember.boat', (Number.isFinite(v) ? v : 0) + n);
    await ready;
    if (!db || canWrite === false) return 'local';
    try { await db.collection('boat').add({ n, name: clean(name, 22), code: /^\d{4}$/.test(String(code)) ? String(code) : '', at: Date.now(), by: me() }); return 'ok'; } catch (e) { return 'local'; }
  }

  return {
    ready, watchBoat, addPlanks, watchCarvings, carve, findBottle, throwBottle, replyBottle, passBottle, finishBottle, countNight,
    get available() { return !!db; },
    get canWrite() { return !!db && canWrite !== false; },
  };
}
