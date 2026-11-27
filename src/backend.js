// The island's two shared services, whatever is behind them:
//   room: who else is here right now (positions, chat, gestures)
//   db:   what the island remembers (marks, bottles, the boat)
// Two possible homes: the island's own room on Cloudflare (worker/index.js), which keeps both, or this browser
// alone, where tabs of the same browser share with each other. (Until November 2026 the records, and each
// visitor's guest account, lived in a Supabase project. What is left of that here is only the way across.)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { setIslandTime } from './now.js';
import { mine } from './mine.js';

let made = null, refreshing = null;
const ls = { get: (k) => { const v = mine.get(k); return typeof v === 'string' ? v : v === null ? null : JSON.stringify(v); }, set: (k, v) => mine.set(k, v) };      // kept by the island (mine.js)
// The guest account this browser had with Supabase, if it had one: what the old sign-in left in storage.
function oldSession() {
  try { const s = JSON.parse(ls.get('hush.guest') || 'null'); return s && s.user && typeof s.user.id === 'string' && typeof s.refresh_token === 'string' ? s : null; } catch (e) { return null; }
}
export const oldGuestId = () => { const s = oldSession(); return s ? s.user.id : (ls.get('hush.was') || null); };
// For the move only: proof of that old guest account ({ id, token }), so that the island can let this browser keep
// the number and friends it had. Once the island says it has done so, this is never asked for again.
export async function guest() {
  if (ls.get('hush.kept')) return null;
  const s = oldSession();
  if (!s || !SUPABASE_URL || !SUPABASE_KEY) return null;
  if (Number(s.expires_at) * 1000 - Date.now() > 60000) return { id: s.user.id, token: s.access_token };
  if (!refreshing) refreshing = (async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }), signal: AbortSignal.timeout(5000) });
      const j = r.ok ? await r.json() : null;
      if (!j || typeof j.access_token !== 'string' || !j.user) return null;
      ls.set('hush.guest', JSON.stringify({ ...s, ...j, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) }));
      return { id: j.user.id, token: j.access_token };
    } catch (e) { return null; }
  })().finally(() => { refreshing = null; });
  return refreshing;
}
export function use(name) {
  if (window.claude && typeof window.claude.use === 'function') return window.claude.use(name);
  if (!made) made = build();
  return made.then((b) => b[name] || null);
}
export let mode = 'claude';     // 'claude', 'cloudflare' or 'local': shown nowhere, handy when checking

async function build() {
  // Whoever this browser was as a guest is still who its bottles belong to.
  const user = { id: async () => oldGuestId(), can: async () => true };
  const url = location.origin.replace(/^http/, 'ws') + '/room';
  const web = /^https?:/.test(location.protocol);
  const ws = web ? await openSocket(url) : null;
  // No line yet? If this site does have its own room, keep trying for it rather than settling for being alone:
  // everyone has to end up on the same island.
  if (ws || (web && await hasRoom())) { mode = 'cloudflare'; return { room: makeRoom(socketWire(ws, url)), db: makeDb(islandDriver(), 300000), user }; }
  mode = 'local';
  return { room: makeRoom(localWire()), db: makeDb(localDriver(), 1000), user };
}

// ---------- the island's own room: one WebSocket to the Worker in worker/index.js ----------
function openSocket(url) {
  return new Promise((res) => {
    let done = false, ws;
    const end = (v) => { if (!done) { done = true; clearTimeout(timer); res(v); } };
    // A slow device can be busy loading the island when the line opens, so the clock may run out before the
    // "open" event is heard. Look at the line itself before giving up on it.
    const timer = setTimeout(() => { if (ws && ws.readyState === 1) { end(ws); return; } try { ws.close(); } catch (e) { /* never opened */ } end(null); }, 8000);
    try { ws = new WebSocket(url); } catch (e) { end(null); return; }
    ws.onopen = () => end(ws);
    ws.onerror = ws.onclose = () => end(null);
  });
}
async function hasRoom() {
  try {
    const r = await fetch('/room/status.json', { cache: 'no-store' });
    const d = r.ok ? await r.json() : null;
    return !!d && Number.isFinite(d.cap);
  } catch (e) { return false; }
}
function socketWire(first, url) {
  let ws = first || { readyState: 3 }, onMsg = () => {}, onUp = () => {}, joined = false, joinMsg = null, admitted = false;
  const hook = () => {
    ws.onmessage = (e) => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (m && m.t === 'in') admitted = true; onMsg(m); };
    ws.onerror = () => {};
    ws.onclose = () => { onUp(false); setTimeout(again, 2000); };
  };
  // A dropped line is picked up again, and your place ashore asked for again.
  const again = async () => {
    const n = await openSocket(url);
    if (!n) { setTimeout(again, 4000); return; }
    ws = n; hook(); onUp(true);
    // Picking up a visit already under way is not a new visit; a first request that never got through still is.
    if (joined) {
      // Say who you are again, with a fresh token: the island keeps nothing about a line once it has dropped.
      const g = await guest().catch(() => null);
      const msg = { ...(joinMsg || { t: 'join' }) };
      if (g) msg.tok = g.token;
      if (admitted || !joinMsg) msg.again = 1;
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    }
  };
  if (first) hook(); else setTimeout(again, 500);
  setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 20000);
  window.addEventListener('pagehide', () => { try { ws.close(1000); } catch (e) { /* gone */ } });
  return {
    post(m) { if (m.t === 'join') { joined = true; joinMsg = m; } if (m.t === 'leave') joined = false; if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
    listen(fn) { onMsg = fn; },
    up(fn) { onUp = fn; fn(ws.readyState === 1); },
    gap: 240, beat: 5000, queued: true,
  };
}

// ---------- room ----------
// A wire carries small messages to everyone else on the island. The room on top of it keeps the list of who is
// here: each visitor says where they are a few times a second, and anyone silent for a while is taken to have left.
function localWire() {
  const bc = new BroadcastChannel('hush-island-room');
  return { post: (m) => bc.postMessage(m), listen: (fn) => { bc.onmessage = (e) => fn(e.data); }, up: (fn) => setTimeout(() => fn(true), 0), gap: 100, beat: 2500 };
}
function makeRoom(wire) {
  const id = Math.random().toString(36).slice(2, 12);
  let known = id;                // the id others see: the island's own room hands one out when you come ashore
  const others = new Map();
  const beat = wire.beat || 2500;
  let mine = {}, handler = null, lastPost = 0, timer = null, dirty = false;
  let ashore = !wire.queued, onQueue = null, been = false, inLine = false, onMod = null, onSocial = null;      // a room with a queue lets you in when there is space
  const emit = () => {
    if (!handler) return;
    handler({ peers: [...others.entries()].map(([peer, o]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer', presence: o.p })) });
  };
  const post = () => { if (!ashore) return; lastPost = Date.now(); dirty = false; wire.post({ t: 'p', id, p: mine }); };
  wire.listen((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'db') { changed.dispatchEvent(new CustomEvent('c', { detail: m.c })); return; }
    if (m.t === 'in') { setIslandTime(m.now); if (m.kept) { const was = oldGuestId(); if (was) ls.set('hush.was', was); ls.set('hush.kept', '1'); } ashore = true; been = true; if (typeof m.id === 'string') known = m.id; if (onQueue) onQueue({ state: 'in', cap: m.cap, today: m.today, tracks: m.tracks, mu: m.mu, cc: m.cc, pid: m.pid, code: m.code, who: m.who }); post(); return; }
    if (m.t === 'muted') { if (onMod) onMod({ muted: m.until, why: m.why }); return; }
    if (m.t === 'hush') { if (onMod) onMod({ soft: true }); return; }
    if (m.t === 'saved' || m.t === 'friends' || m.t === 'mail' || m.t === 'fask' || m.t === 'fyes' || m.t === 'fno' || m.t === 'w' || m.t === 'wok' || m.t === 'wno') { if (onSocial) onSocial(m); return; }
    if (m.t === 'wait') { ashore = false; inLine = true; if (onQueue) onQueue({ state: 'wait', pos: m.pos, of: m.of, cap: m.cap }); return; }
    if (m.t === 'out') { ashore = false; others.clear(); emit(); wire.post({ t: 'leave' }); const f = onQueue; onQueue = null; if (f) f({ state: 'out', why: m.why }); return; }
    if (typeof m.id !== 'string' || m.id === id) return;
    if (m.t === 'p' && m.p && typeof m.p === 'object') { others.set(m.id, { p: m.p, at: Date.now() }); emit(); }
    else if (m.t === 'hello') post();
    else if (m.t === 'bye' && others.delete(m.id)) emit();
  });
  let still = 0;
  setInterval(() => {
    const now = Date.now();
    let gone = false;
    for (const [k, o] of others) if (now - o.at > beat * 2.5 + 3000) { others.delete(k); gone = true; }
    if (gone) emit();
    if (ashore && now - lastPost > beat) post();          // a heartbeat, so a visitor standing still is not taken for gone
    if (!ashore && onQueue && now - still > 15000) { still = now; wire.post({ t: 'still' }); }   // still waiting in line
  }, 1000);
  if (!wire.queued) window.addEventListener('pagehide', () => wire.post({ t: 'bye', id }));
  return {
    presence(patch) {
      mine = { ...mine, ...patch };
      dirty = true;
      const wait = wire.gap - (Date.now() - lastPost);
      if (wait <= 0) post();
      else if (!timer) timer = setTimeout(() => { timer = null; if (dirty) post(); }, wait);
      return Promise.resolve();
    },
    onPeers(fn) { handler = fn; if (!wire.queued) wire.post({ t: 'hello', id }); setTimeout(emit, 0); return () => { handler = null; }; },
    onConnection(fn) { wire.up(fn); return () => {}; },
    // Ask to come ashore. fn hears {state: 'in'} when there is room, or {state: 'wait', pos, of} while queued.
    // info says what kind of visit this is (first today, first ever), for the island's daily totals.
    join(fn, info) {
      onQueue = fn; inLine = false;
      // If the island's room cannot be reached, nobody is kept on the title screen: after a while you step ashore
      // alone, and the others appear when the line comes up.
      if (wire.queued) setTimeout(() => { if (!ashore && !inLine && onQueue === fn) fn({ state: 'in', alone: true }); }, 12000);
      if (wire.queued) wire.post(been ? { t: 'join', ...(info || {}), again: 1 } : { t: 'join', ...(info || {}) }); else { ashore = true; fn({ state: 'in' }); if (handler) wire.post({ t: 'hello', id }); } },
    id() { return known; },
    // Keeping the peace. mod(fn) hears when the island mutes you or drops a message; selfMute tells the island the
    // game stopped your words itself; report sends the island what another visitor said.
    mod(fn) { onMod = fn; },
    social(fn) { onSocial = fn; },
    send(m) { if (wire.queued && ashore) wire.post(m); },
    selfMute() { if (wire.queued && ashore) wire.post({ t: 'mute' }); },
    report(peer, lines, note) { if (wire.queued && ashore) { wire.post({ t: 'report', id: peer, lines, note }); return true; } return false; },
    // Ask the island to count one more of something (a guide step reached, a call answered).
    note(k) { if (wire.queued && ashore) wire.post({ t: 'note', k }); },
    // Back to the title screen: stop being seen, give up your place.
    leave() {
      if (wire.queued) wire.post({ t: 'leave' }); else wire.post({ t: 'bye', id });
      ashore = false; onQueue = null; others.clear(); emit();
    },
  };
}

// ---------- db ----------
// A small document store: collections of records, each with an id. A driver says where the records live.
function localDriver() {
  const KEY = 'hush.island.db';
  // With no room to keep them, shared things last as long as the page is open and no longer.
  let held = {}; const load = () => held, save = (d) => { held = d; };
  return {
    async list(coll, filters, order, lim) {
      let rows = Object.entries(load()[coll] || {}).filter(([, d]) => filters.every(([f, op, v]) => (op === '==' ? d[f] === v : op === '<' ? d[f] < v : true)));
      if (order) rows.sort((a, b) => ((a[1][order[0]] || 0) - (b[1][order[0]] || 0)) * (order[1] === 'desc' ? -1 : 1));
      return rows.slice(0, lim);
    },
    async one(coll, id) { return (load()[coll] || {})[id]; },
    async put(coll, id, data) { const d = load(); (d[coll] = d[coll] || {})[id] = data; save(d); },
    async patch(coll, id, data) { const d = load(); if (!d[coll] || !d[coll][id]) throw new Error('missing'); d[coll][id] = { ...d[coll][id], ...data }; save(d); },
    async del(coll, id) { const d = load(); if (d[coll]) { delete d[coll][id]; save(d); } },
  };
}
// The island's own room: records are asked for and added over /room/db, and the room says (down the line every
// visitor already holds) when a collection has changed, so nobody has to keep asking.
const changed = new EventTarget();
function islandDriver() {
  const call = async (body) => {
    const r = await fetch('/room/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('island db ' + r.status);
    return r.json();
  };
  return {
    live: true,
    async list(coll, filters, order, lim) { return (await call({ op: 'list', coll, filters, order, lim })).rows; },
    async one(coll, id) { const d = (await call({ op: 'one', coll, id })).d; return d === null ? undefined : d; },
    async put(coll, id, data) { await call({ op: 'put', coll, id, data }); },
    async patch(coll, id, data) { await call({ op: 'patch', coll, id, data }); },
    async del(coll, id) { await call({ op: 'del', coll, id }); },
  };
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36));
function makeDb(driver, pollMs) {
  const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => data });
  const split = (path) => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const doc = (path) => {
    const [coll, id] = split(path);
    return {
      id, path,
      get: async () => snapDoc(id, await driver.one(coll, id)),
      set: (data) => driver.put(coll, id, data),
      update: (data) => driver.patch(coll, id, data),
      delete: () => driver.del(coll, id),
    };
  };
  const query = (coll, filters = [], order = null, lim = 1000) => {
    const run = async () => { const docs = (await driver.list(coll, filters, order, lim)).map(([id, d]) => snapDoc(id, d)); return { docs, size: docs.length, empty: !docs.length }; };
    return {
      where: (f, op, v) => query(coll, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => query(coll, filters, [f, dir], lim),
      limit: (n) => query(coll, filters, order, n),
      get: run,
      // Tell the listener whenever what the query returns has changed.
      onSnapshot(next, fail) {
        let last = null, stopped = false, failed = false;
        const tick = async () => {
          if (stopped || document.hidden) return;
          try {
            const r = await run(), sig = JSON.stringify(r.docs.map((d) => [d.id, d.data()]));
            if (sig !== last) { last = sig; next(r); }
          } catch (e) { if (!failed && last === null && fail) { failed = true; fail(e); } }
        };
        const iv = setInterval(tick, pollMs);
        setTimeout(tick, 30);
        // Told of a change, or back from a hidden tab: look at once.
        const told = (e) => { if (e.detail === coll) tick(); }, back = () => { if (!document.hidden) tick(); };
        if (driver.live) { changed.addEventListener('c', told); document.addEventListener('visibilitychange', back); }
        return () => { stopped = true; clearInterval(iv); changed.removeEventListener('c', told); document.removeEventListener('visibilitychange', back); };
      },
      doc: (id) => doc(coll + '/' + (id || newId())),
      add: async (data) => { const r = doc(coll + '/' + newId()); await r.set(data); return r; },
    };
  };
  return { collection: (path) => query(path), doc };
}
