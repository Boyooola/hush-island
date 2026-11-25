// The island's two shared services, whatever is behind them:
//   room: who else is here right now (positions, chat, gestures)
//   db:   what the island remembers (marks, bottles, the boat)
// Three possible homes, tried in this order: the Claude page it was first built on, a Supabase project
// (see config.js), or this browser alone, where tabs of the same browser share with each other.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let made = null;
export function use(name) {
  if (window.claude && typeof window.claude.use === 'function') return window.claude.use(name);
  if (!made) made = build();
  return made.then((b) => b[name] || null);
}
export let mode = 'claude';     // 'claude', 'supabase' or 'local': shown nowhere, handy when checking

async function build() {
  let sb = null;
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 3 } } });
    } catch (e) { sb = null; }
  }
  const db = sb ? makeDb(supabaseDriver(sb), 10000) : makeDb(localDriver(), 1000);
  // Live visitors: the island's own room on Cloudflare if this site has one, else Supabase, else this browser alone.
  const url = location.origin.replace(/^http/, 'ws') + '/room';
  const ws = /^https?:/.test(location.protocol) ? await openSocket(url) : null;
  if (ws) { mode = 'cloudflare'; return { room: makeRoom(socketWire(ws, url)), db, user: null }; }
  if (sb) { mode = 'supabase'; return { room: makeRoom(supabaseWire(sb)), db, user: null }; }
  mode = 'local';
  return { room: makeRoom(localWire()), db, user: null };
}

// ---------- the island's own room: one WebSocket to the Worker in worker/index.js ----------
function openSocket(url) {
  return new Promise((res) => {
    let done = false, ws;
    const end = (v) => { if (!done) { done = true; clearTimeout(timer); res(v); } };
    const timer = setTimeout(() => { try { ws.close(); } catch (e) { /* never opened */ } end(null); }, 4000);
    try { ws = new WebSocket(url); } catch (e) { end(null); return; }
    ws.onopen = () => end(ws);
    ws.onerror = ws.onclose = () => end(null);
  });
}
function socketWire(first, url) {
  let ws = first, onMsg = () => {}, onUp = () => {}, joined = false;
  const hook = () => {
    ws.onmessage = (e) => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMsg(m); };
    ws.onerror = () => {};
    ws.onclose = () => { onUp(false); setTimeout(again, 2000); };
  };
  // A dropped line is picked up again, and your place ashore asked for again.
  const again = async () => {
    const n = await openSocket(url);
    if (!n) { setTimeout(again, 4000); return; }
    ws = n; hook(); onUp(true);
    if (joined) ws.send(JSON.stringify({ t: 'join' }));
  };
  hook();
  setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 20000);
  window.addEventListener('pagehide', () => { try { ws.close(1000); } catch (e) { /* gone */ } });
  return {
    post(m) { if (m.t === 'join') joined = true; if (m.t === 'leave') joined = false; if (ws.readyState === 1) ws.send(JSON.stringify(m)); },
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
function supabaseWire(sb) {
  const ch = sb.channel('island', { config: { broadcast: { self: false } } });
  let onMsg = () => {}, onUp = () => {};
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.subscribe((status) => onUp(status === 'SUBSCRIBED'));
  return { post: (m) => { ch.send({ type: 'broadcast', event: 'm', payload: m }).catch(() => {}); }, listen: (fn) => { onMsg = fn; }, up: (fn) => { onUp = fn; }, gap: 700, beat: 6000 };
}
function makeRoom(wire) {
  const id = Math.random().toString(36).slice(2, 12);
  const others = new Map();
  const beat = wire.beat || 2500;
  let mine = {}, handler = null, lastPost = 0, timer = null, dirty = false;
  let ashore = !wire.queued, onQueue = null;      // a room with a queue lets you in when there is space
  const emit = () => {
    if (!handler) return;
    handler({ peers: [...others.entries()].map(([peer, o]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer', presence: o.p })) });
  };
  const post = () => { if (!ashore) return; lastPost = Date.now(); dirty = false; wire.post({ t: 'p', id, p: mine }); };
  wire.listen((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'in') { ashore = true; if (onQueue) onQueue({ state: 'in', cap: m.cap }); post(); return; }
    if (m.t === 'wait') { ashore = false; if (onQueue) onQueue({ state: 'wait', pos: m.pos, of: m.of, cap: m.cap }); return; }
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
    join(fn) { onQueue = fn; if (wire.queued) wire.post({ t: 'join' }); else { ashore = true; fn({ state: 'in' }); if (handler) wire.post({ t: 'hello', id }); } },
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
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* no storage */ } };
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
// Supabase: one table per collection, each row (id, at, d) with the record itself in d. See supabase/schema.sql.
function supabaseDriver(sb) {
  const col = (f) => (f === 'at' ? 'at' : `d->>${f}`);
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async list(coll, filters, order, lim) {
      let q = sb.from(coll).select('id,d');
      for (const [f, op, v] of filters) q = op === '==' ? q.eq(col(f), v) : op === '<' ? q.lt(col(f), v) : q;
      if (order) q = q.order('at', { ascending: order[1] !== 'desc' });
      return ok(await q.limit(lim)).map((r) => [r.id, r.d]);
    },
    async one(coll, id) { const rows = ok(await sb.from(coll).select('d').eq('id', id).limit(1)); return rows.length ? rows[0].d : undefined; },
    async put(coll, id, data) { ok(await sb.from(coll).insert({ id, at: Number(data.at) || Date.now(), d: data })); },
    async patch(coll, id, data) {
      const old = await this.one(coll, id);
      if (!old) throw new Error('missing');
      ok(await sb.from(coll).update({ d: { ...old, ...data } }).eq('id', id));
    },
    async del(coll, id) { ok(await sb.from(coll).delete().eq('id', id)); },
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
        return () => { stopped = true; clearInterval(iv); };
      },
      doc: (id) => doc(coll + '/' + (id || newId())),
      add: async (data) => { const r = doc(coll + '/' + newId()); await r.set(data); return r; },
    };
  };
  return { collection: (path) => query(path), doc };
}
