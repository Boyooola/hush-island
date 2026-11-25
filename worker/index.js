// The island's live room, running on Cloudflare.
//
// Every visitor holds one WebSocket to a single Durable Object. It does three small jobs:
//   1. passes each visitor's position, chat and gestures on to everyone else who is ashore
//   2. keeps count, and when the island is full, holds newcomers in a queue in arrival order
//   3. lets the next in line ashore the moment someone leaves
//   4. keeps daily totals (visits, how long people stay, whether they met anyone) and the tracks of the last few
//      visitors, in its own small database. Totals only: nothing is kept about any one visitor.
//   5. keeps the peace: a message with words that are not said here is dropped and its sender muted for a while,
//      and visitors can report one another. A mute is remembered against a scrambled form of the address it came
//      from, so reloading the page does not lift it.
// Everything it needs to remember about who is here rides on the sockets themselves, so it can sleep between messages.
import { DurableObject } from 'cloudflare:workers';
import { judge } from '../src/words.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../src/config.js';

const DEFAULT_CAP = 40;          // animals ashore at once
const STALE_MS = 45000;          // a visitor silent this long is taken to have left
const MAX_BYTES = 4500;          // largest message accepted
const MAX_PER_SECOND = 12;       // messages accepted from one visitor each second
const DEFAULT_SLEEP_OUT = 600;   // seconds asleep before a visitor can be moved on, and only when others are waiting
const TRACKS_KEPT = 8;           // how many departed visitors' tracks stay on the island
const TRACK_AGE = 36 * 3600000;  // and for how long
const NOTES = /^(g[1-4]|answer|duo|sniff|left|tag|game|dance|gesture|sail)$/;   // things the game may ask to have counted
const MUTE_FIRST = 10 * 60000;    // how long a first mute lasts
const MUTE_AGAIN = 60 * 60000;    // and any further one within a day
const REPORTS_TO_MUTE = 3;       // reports from different visitors, within an hour, that mute someone
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export class Island extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.cap = Math.max(1, parseInt(env.CAP, 10) || DEFAULT_CAP);
    this.sleepOut = Math.max(1, parseInt(env.SLEEP_OUT, 10) || DEFAULT_SLEEP_OUT) * 1000;
    this.rate = new Map();        // socket -> [second, count]; forgotten when the object sleeps, which is fine
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS tally (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, k))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS tracks (at INTEGER PRIMARY KEY, x REAL, z REAL, s INTEGER, n TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS mutes (h TEXT PRIMARY KEY, until INTEGER, n INTEGER, at INTEGER, why TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS reports (at INTEGER PRIMARY KEY, tid TEXT, who TEXT, wh TEXT, by TEXT, note TEXT, lines TEXT, sure INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS feedback (at INTEGER PRIMARY KEY, who TEXT, h TEXT, text TEXT)');
    // People: who a secret key belongs to (only its scrambled form is kept), so friends can be shown by name when away.
    this.sql.exec('CREATE TABLE IF NOT EXISTS people (pid TEXT PRIMARY KEY, name TEXT, code TEXT, s INTEGER, seen INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER, PRIMARY KEY (a, b))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS asks (a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER, PRIMARY KEY (a, b))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS mail (at INTEGER PRIMARY KEY, dest TEXT, src TEXT, name TEXT, text TEXT)');
    this.pals = new Map();        // "a|b" -> [are they friends, when asked]: saves asking for every whisper
    this.said = new Map();        // socket -> the last few things it said, for reports; forgotten when the object sleeps
  }

  // Daily totals. add() counts one more of something today; top() keeps the highest value seen today.
  add(k, n = 1) { try { this.sql.exec('INSERT INTO tally (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = n + excluded.n', dayOf(Date.now()), k, n); } catch (e) { /* counting must never break the room */ } }
  top(k, n) { try { this.sql.exec('INSERT INTO tally (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = MAX(n, excluded.n)', dayOf(Date.now()), k, n); } catch (e) { /* as above */ } }
  today(k) { try { const r = this.sql.exec('SELECT n FROM tally WHERE day = ? AND k = ?', dayOf(Date.now()), k).toArray(); return r.length ? r[0].n : 0; } catch (e) { return 0; } }
  tracks() {
    try { return this.sql.exec('SELECT at, x, z, s, n FROM tracks WHERE at > ? ORDER BY at DESC LIMIT ?', Date.now() - TRACK_AGE, TRACKS_KEPT).toArray(); } catch (e) { return []; }
  }
  async hashOf(request) {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!ip) return '';
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(['hush-island', ip, request.headers.get('User-Agent') || '', request.headers.get('Accept-Language') || ''].join('|')));
    return [...new Uint8Array(d)].slice(0, 9).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // A note for the keeper from a visitor. A handful a day from any one visitor, and the newest thousand are kept.
  async feedback(request) {
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    let m = null;
    try { const raw = await request.text(); if (raw.length <= 4000) m = JSON.parse(raw); } catch (e) { m = null; }
    const text = m && typeof m === 'object' ? clip(m.text, 600) : '';
    if (text.length < 3) return json({ error: 'empty' }, 400);
    const h = await this.hashOf(request), now = Date.now();
    try {
      if (this.remote) {
        const res = await this.sb('hi_feedback', { p_who: clip(m.name, 32), p_h: h, p_text: text });
        if (res === 'enough') return json({ error: 'enough for today' }, 429);
        this.add('feedback');
        return json({ ok: true }, 200);
      }
      const n = this.sql.exec('SELECT COUNT(*) AS n FROM feedback WHERE h = ? AND at > ?', h, now - 86400000).toArray()[0].n;
      if (n >= 5) return json({ error: 'enough for today' }, 429);
      this.sql.exec('INSERT OR REPLACE INTO feedback (at, who, h, text) VALUES (?, ?, ?, ?)', now, clip(m.name, 32), h, text);
      this.sql.exec('DELETE FROM feedback WHERE at NOT IN (SELECT at FROM feedback ORDER BY at DESC LIMIT 1000)');
      this.add('feedback');
    } catch (e) { return json({ error: 'not kept' }, 500); }
    return json({ ok: true }, 200);
  }
  // ---- where people-data lives ----
  // Friends, notes for absent friends, feedback and reports are kept in Supabase when the Worker has been given
  // the project's secret key (a secret named SUPABASE_SECRET_KEY). Without it they are kept in this room's own
  // small database, so the island works either way.
  get remote() { return !!this.env.SUPABASE_SECRET_KEY; }
  get sbUrl() { return this.env.SUPABASE_URL_OVERRIDE || SUPABASE_URL; }
  async sb(fn, args) {
    const key = this.env.SUPABASE_SECRET_KEY;
    const r = await fetch(`${this.sbUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(args || {}), signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('supabase ' + fn + ' ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  later(p) { try { this.ctx.waitUntil(Promise.resolve(p).catch(() => {})); } catch (e) { /* nothing to wait on */ } }

  // ---- friends, whispers and notes ----
  // A visitor is known by a scrambled form of their guest account with Supabase (the visitor sends its token,
  // Supabase says whose it is) or, failing that, of the secret their browser keeps. The four figures shown beside
  // a name are taken from it, so nobody can wear someone else's number.
  async identify(a, key, tok) {
    let k = '';
    a.gid = '';
    if (typeof tok === 'string' && tok.length > 40 && tok.length < 3500 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(tok) && this.sbUrl) {
      try {
        const r = await fetch(this.sbUrl + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(3000) });
        const u = r.ok ? await r.json() : null;
        if (u && typeof u.id === 'string' && /^[0-9a-f-]{36}$/.test(u.id)) { k = 'guest:' + u.id; a.who = 'guest'; a.gid = u.id; }
      } catch (e) { /* fall back to the browser's own secret */ }
    }
    if (!k) { k = typeof key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(key) ? key : ''; a.who = 'browser'; }
    if (!k) { a.pid = ''; a.code = ''; return; }
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hush-island:person:' + k)));
    a.pid = [...d].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
    a.code = String(1000 + (((d[10] << 16) | (d[11] << 8) | d[12]) % 9000));
  }
  remember(a) {
    if (!a.pid) return;
    const name = clip(a.nb ? 'Guest' : (a.n0 || ''), 24) || 'A visitor';
    if (this.remote) { this.later(this.sb('hi_remember', { p_pid: a.pid, p_guest: a.gid || null, p_name: name, p_code: a.code || '', p_species: a.s | 0 })); return; }
    try { this.sql.exec('INSERT OR REPLACE INTO people (pid, name, code, s, seen) VALUES (?, ?, ?, ?, ?)', a.pid, name, a.code || '', a.s | 0, Date.now()); } catch (e) { /* a nicety */ }
  }
  socketsOf(pid) { return pid ? this.everyone().filter((x) => x.a.pid === pid && x.a.role === 'in') : []; }
  async areFriends(p, q) {
    if (!p || !q) return false;
    const key = p + '|' + q, hit = this.pals.get(key);
    if (hit && Date.now() - hit[1] < 300000) return hit[0];
    let yes = false;
    try { yes = this.remote ? !!(await this.sb('hi_are_friends', { p_me: p, p_them: q })) : this.sql.exec('SELECT 1 FROM friends WHERE a = ? AND b = ?', p, q).toArray().length > 0; } catch (e) { return false; }
    if (this.pals.size > 2000) this.pals.clear();
    this.pals.set(key, [yes, Date.now()]);
    return yes;
  }
  // Everything a visitor needs to draw their Friends list: friends (with whether they are ashore), and who has asked.
  async friendsOf(pid) {
    if (!pid) return { friends: [], asks: [] };
    try {
      let friends, asks;
      if (this.remote) { const d = (await this.sb('hi_friends_of', { p_pid: pid })) || {}; friends = d.friends || []; asks = d.asks || []; }
      else {
        const row = (r) => ({ pid: r.pid, name: r.name || 'A visitor', code: r.code || '', s: r.s | 0, seen: r.seen || 0 });
        friends = this.sql.exec('SELECT f.b AS pid, p.name, p.code, p.s, p.seen FROM friends f LEFT JOIN people p ON p.pid = f.b WHERE f.a = ? ORDER BY p.seen DESC LIMIT 60', pid).toArray().map(row);
        asks = this.sql.exec('SELECT k.a AS pid, p.name, p.code, p.s, p.seen FROM asks k LEFT JOIN people p ON p.pid = k.a WHERE k.b = ? AND k.at > ? ORDER BY k.at DESC LIMIT 20', pid, Date.now() - 14 * 86400000).toArray().map(row);
      }
      const here = new Set(this.everyone().filter((x) => x.a.role === 'in' && x.a.pid).map((x) => x.a.pid));
      for (const f of friends) f.here = here.has(f.pid);
      return { friends, asks };
    } catch (e) { return { friends: [], asks: [] }; }
  }
  async tellFriends(pid) { const there = this.socketsOf(pid); if (!there.length) return; const list = await this.friendsOf(pid); for (const { ws } of there) this.send(ws, { t: 'friends', ...list }); }
  // When someone comes or goes, their friends who are ashore get a fresh list.
  async tellFriendsOf(pid) {
    if (!pid) return;
    const ashore = new Set(this.everyone().filter((x) => x.a.role === 'in' && x.a.pid && x.a.pid !== pid).map((x) => x.a.pid));
    if (!ashore.size) return;
    const { friends } = await this.friendsOf(pid);
    for (const f of friends) if (ashore.has(f.pid)) await this.tellFriends(f.pid);
  }
  // Just come ashore: their friends list and any notes left for them follow the welcome, and their friends hear of it.
  async greet(ws, a) {
    if (!a.pid) return;
    this.send(ws, { t: 'friends', first: 1, ...(await this.friendsOf(a.pid)) });
    const mail = await this.mailFor(a.pid);
    if (mail.length) this.send(ws, { t: 'mail', mail });
    await this.tellFriendsOf(a.pid);
  }
  // Asking to be friends. If the other has already asked you, you are friends; otherwise they are asked.
  async befriend(ws, a, m) {
    const them = typeof m.pid === 'string' && /^[0-9a-f]{20}$/.test(m.pid) ? m.pid : '';
    if (!a.pid || !them || them === a.pid) return;
    try {
      let res;
      if (this.remote) res = (await this.sb('hi_befriend', { p_me: a.pid, p_them: them })) || {};
      else {
        if (this.sql.exec('SELECT 1 FROM friends WHERE a = ? AND b = ?', a.pid, them).toArray().length) res = { result: 'already' };
        else if (this.sql.exec('SELECT COUNT(*) AS n FROM friends WHERE a = ?', a.pid).toArray()[0].n >= 60) res = { result: 'full' };
        else if (this.sql.exec('SELECT 1 FROM asks WHERE a = ? AND b = ?', them, a.pid).toArray().length) {
          const now = Date.now();
          this.sql.exec('INSERT OR REPLACE INTO friends (a, b, at) VALUES (?, ?, ?), (?, ?, ?)', a.pid, them, now, them, a.pid, now);
          this.sql.exec('DELETE FROM asks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a.pid, them, them, a.pid);
          res = { result: 'friends', name: (this.sql.exec('SELECT name FROM people WHERE pid = ?', them).toArray()[0] || {}).name || 'A visitor' };
        } else if (this.sql.exec('SELECT COUNT(*) AS n FROM asks WHERE a = ? AND at > ?', a.pid, Date.now() - 86400000).toArray()[0].n >= 20) res = { result: 'limit' };       // not a way to pester a whole island
        else { this.sql.exec('INSERT OR REPLACE INTO asks (a, b, at) VALUES (?, ?, ?)', a.pid, them, Date.now()); res = { result: 'asked' }; }
      }
      if (res.result === 'full') this.send(ws, { t: 'fno', why: 'full' });
      else if (res.result === 'friends') {
        this.pals.delete(a.pid + '|' + them); this.pals.delete(them + '|' + a.pid);
        this.add('friends');
        await this.tellFriends(a.pid); await this.tellFriends(them);
        for (const { ws: o } of this.socketsOf(them)) this.send(o, { t: 'fyes', pid: a.pid, name: a.n || 'A visitor' });
        this.send(ws, { t: 'fyes', pid: them, name: res.name || 'A visitor' });
      } else if (res.result === 'asked') {
        for (const { ws: o } of this.socketsOf(them)) this.send(o, { t: 'fask', pid: a.pid, id: a.id, name: a.n || 'A visitor' });
        await this.tellFriends(them);
      }
    } catch (e) { /* friends are a nicety */ }
  }
  async unfriend(ws, a, m) {
    const them = typeof m.pid === 'string' && /^[0-9a-f]{20}$/.test(m.pid) ? m.pid : '';
    if (!a.pid || !them) return;
    try {
      if (this.remote) await this.sb('hi_unfriend', { p_me: a.pid, p_them: them });
      else {
        this.sql.exec('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a.pid, them, them, a.pid);
        this.sql.exec('DELETE FROM asks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a.pid, them, them, a.pid);
      }
    } catch (e) { /* as above */ }
    this.pals.delete(a.pid + '|' + them); this.pals.delete(them + '|' + a.pid);
    await this.tellFriends(a.pid); await this.tellFriends(them);
  }
  // A whisper goes to one friend only. If they are away it is kept as a note and handed over when they next arrive.
  async whisper(ws, a, m) {
    const them = typeof m.to === 'string' && /^[0-9a-f]{20}$/.test(m.to) ? m.to : '', now = Date.now();
    const text = clip(m.text, 200);
    if (!a.pid || !them || !text) return;
    if (a.mu > now) { this.send(ws, { t: 'wno', why: 'muted' }); return; }
    if (!(await this.areFriends(a.pid, them))) { this.send(ws, { t: 'wno', why: 'friends' }); return; }
    const verdict = judge(text);
    if (verdict === 'mute') { this.mute(ws, a, 'words'); return; }
    if (verdict) { this.send(ws, { t: 'hush' }); return; }
    const lines = this.said.get(ws) || [];
    lines.push('(whisper) ' + text); if (lines.length > 5) lines.shift();
    this.said.set(ws, lines);
    const there = this.socketsOf(them);
    if (there.length) {
      for (const { ws: o } of there) this.send(o, { t: 'w', pid: a.pid, id: a.id, name: a.n || 'A visitor', text });
      this.send(ws, { t: 'wok', to: them, kept: 0 });
      this.add('whispers');
      return;
    }
    try {
      let res;
      if (this.remote) res = await this.sb('hi_leave_note', { p_from: a.pid, p_to: them, p_name: a.n || 'A visitor', p_text: text });
      else if (this.sql.exec('SELECT COUNT(*) AS n FROM mail WHERE dest = ? AND src = ?', them, a.pid).toArray()[0].n >= 5) res = 'enough';
      else {
        this.sql.exec('INSERT OR REPLACE INTO mail (at, dest, src, name, text) VALUES (?, ?, ?, ?, ?)', now, them, a.pid, a.n || 'A visitor', text);
        this.sql.exec('DELETE FROM mail WHERE at < ?', now - 60 * 86400000);
        res = 'ok';
      }
      if (res === 'ok') { this.send(ws, { t: 'wok', to: them, kept: 1 }); this.add('notes'); }
      else this.send(ws, { t: 'wno', why: res === 'enough' ? 'enough' : res === 'friends' ? 'friends' : 'failed' });
    } catch (e) { this.send(ws, { t: 'wno', why: 'failed' }); }
  }
  // Notes waiting for someone who has just come ashore: handed over once, then forgotten.
  async mailFor(pid) {
    if (!pid) return [];
    try {
      if (this.remote) return (await this.sb('hi_take_notes', { p_pid: pid })) || [];
      const rows = this.sql.exec('SELECT at, src, name, text FROM mail WHERE dest = ? ORDER BY at LIMIT 30', pid).toArray();
      if (rows.length) this.sql.exec('DELETE FROM mail WHERE dest = ?', pid);
      return rows.filter((r) => this.sql.exec('SELECT 1 FROM friends WHERE a = ? AND b = ?', pid, r.src).toArray().length > 0).map((r) => ({ at: r.at, pid: r.src, name: r.name, text: r.text }));
    } catch (e) { return []; }
  }
  // Mute a visitor: ten minutes the first time, an hour if it happens again within a day.
  mute(ws, a, why) {
    const now = Date.now();
    let n = (a.mn || 0) + 1;
    try {
      if (a.h) { const r = this.sql.exec('SELECT n, at FROM mutes WHERE h = ?', a.h).toArray(); if (r.length && now - r[0].at < 86400000) n = Math.max(n, r[0].n + 1); }
      a.mu = now + (n > 1 ? MUTE_AGAIN : MUTE_FIRST); a.mn = n;
      if (a.h) this.sql.exec('INSERT OR REPLACE INTO mutes (h, until, n, at, why) VALUES (?, ?, ?, ?, ?)', a.h, a.mu, n, now, why);
    } catch (e) { a.mu = now + MUTE_FIRST; }
    ws.serializeAttachment(a);
    this.add('muted');
    this.send(ws, { t: 'muted', until: a.mu, why });
  }
  async report(ws, a, m) {
    const tid = clip(m.id, 16), now = Date.now();
    const target = this.everyone().find((x) => x.a.id === tid && x.a.role === 'in');
    if (!target || target.ws === ws) return;
    a.rp = Array.isArray(a.rp) ? a.rp : [];
    if (a.rp.includes(tid) || a.rp.length >= 8) return;         // one report per visitor about any one animal
    a.rp.push(tid); ws.serializeAttachment(a);
    const heard = this.said.get(target.ws) || [];
    const lines = heard.length ? heard : (Array.isArray(m.lines) ? m.lines.slice(-5).map((x) => clip(x, 200)).filter(Boolean) : []);
    try {
      let n;
      if (this.remote) n = await this.sb('hi_report', { p_tid: tid, p_who: clip(target.a.n, 32) || 'A visitor', p_wh: target.a.h || '', p_by: a.h || a.id, p_note: clip(m.note, 200), p_lines: lines, p_sure: heard.length > 0 });
      else {
        this.sql.exec('INSERT OR REPLACE INTO reports (at, tid, who, wh, by, note, lines, sure) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', now, tid, clip(target.a.n, 32) || 'A visitor', target.a.h || '', a.h || a.id, clip(m.note, 200), JSON.stringify(lines), heard.length ? 1 : 0);
        this.sql.exec('DELETE FROM reports WHERE at < ?', now - 30 * 86400000);
        n = this.sql.exec('SELECT COUNT(DISTINCT by) AS n FROM reports WHERE tid = ? AND at > ?', tid, now - 3600000).toArray()[0].n;
      }
      this.add('reports');
      if (n >= REPORTS_TO_MUTE && !(target.a.mu > now)) this.mute(target.ws, target.a, 'reports');
    } catch (e) { /* a report that cannot be kept is lost, the room carries on */ }
  }
  async reports() {
    const now = Date.now();
    if (this.remote) {
      const d = (await this.sb('hi_keeper', {})) || {};
      return { reports: d.reports || [], feedback: d.feedback || [], mutes: this.sql.exec('SELECT until, n, why FROM mutes WHERE until > ? ORDER BY until DESC LIMIT 100', now).toArray(), kept: 'supabase' };
    }
    const reports = this.sql.exec('SELECT at, who, note, lines, sure FROM reports ORDER BY at DESC LIMIT 200').toArray().map((r) => { let lines = []; try { lines = JSON.parse(r.lines); } catch (e) { lines = []; } return { at: r.at, who: r.who, note: r.note, lines, sure: !!r.sure }; });
    const mutes = this.sql.exec('SELECT until, n, why FROM mutes WHERE until > ? ORDER BY until DESC LIMIT 100', now).toArray();
    const feedback = this.sql.exec('SELECT at, who, text FROM feedback ORDER BY at DESC LIMIT 300').toArray();
    return { reports, mutes, feedback };
  }
  // Someone has left the island: count how long they stayed and whether they had company, and keep their tracks.
  departed(a) {
    if (!a.in) return;
    const now = Date.now(), secs = Math.max(0, Math.round((now - a.in) / 1000));
    this.add('stays'); this.add('stay_secs', secs);
    this.add(secs < 60 ? 'stay_a' : secs < 300 ? 'stay_b' : secs < 900 ? 'stay_c' : 'stay_d');
    this.add(a.met ? 'met' : 'alone');
    if (secs >= 45 && typeof a.x === 'number' && typeof a.z === 'number') {
      try {
        // One set of tracks per spot: newer ones replace older ones close by.
        this.sql.exec('DELETE FROM tracks WHERE (x - ?) * (x - ?) + (z - ?) * (z - ?) < 9', a.x, a.x, a.z, a.z);
        this.sql.exec('INSERT OR REPLACE INTO tracks (at, x, z, s, n) VALUES (?, ?, ?, ?, ?)', now, a.x, a.z, a.s | 0, String(a.n || '').slice(0, 24));
        this.sql.exec('DELETE FROM tracks WHERE at NOT IN (SELECT at FROM tracks ORDER BY at DESC LIMIT ?)', TRACKS_KEPT);
      } catch (e) { /* tracks are a nicety */ }
    }
    a.in = 0;
  }
  stats() {
    const since = dayOf(Date.now() - 29 * 86400000), days = {};
    try { for (const r of this.sql.exec('SELECT day, k, n FROM tally WHERE day >= ? ORDER BY day', since)) (days[r.day] = days[r.day] || {})[r.k] = r.n; } catch (e) { /* empty */ }
    const all = this.everyone();
    return { now: Date.now(), today: dayOf(Date.now()), ashore: all.filter((x) => x.a.role === 'in').length, waiting: all.filter((x) => x.a.role === 'wait').length, cap: this.cap, days };
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (new URL(request.url).pathname === '/room/feedback') return request.method === 'POST' ? this.feedback(request) : new Response('Feedback is sent from inside the game.', { status: 405 });
      if (new URL(request.url).pathname === '/room/reports.json') {
        // For the keeper of the island only: the key is a secret set on the Worker, sent in a header.
        const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        const want = this.env.ADMIN_KEY, got = request.headers.get('x-keeper-key') || '';
        if (!want) return json({ error: 'no key set' }, 503);
        if (got.length !== want.length || !crypto.subtle.timingSafeEqual(new TextEncoder().encode(got), new TextEncoder().encode(want))) return json({ error: 'wrong key' }, 403);
        try { return json(await this.reports(), 200); } catch (e) { return json({ error: 'could not read' }, 502); }
      }
      if (new URL(request.url).pathname === '/room/stats.json') return new Response(JSON.stringify(this.stats()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      // A plain request gets a head count: how many are ashore, how many are waiting, how many fit.
      const all = this.everyone();
      const body = { ashore: all.filter((x) => x.a.role === 'in').length, waiting: all.filter((x) => x.a.role === 'wait').length, cap: this.cap };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    // A scrambled form of the visitor's address and browser, kept only so that a mute outlasts a reload. The
    // browser is part of it because many people can share one address (a household, a phone network).
    const h = await this.hashOf(request);
    let mu = 0, mn = 0;
    if (h) {
      try { const r = this.sql.exec('SELECT until, n FROM mutes WHERE h = ?', h).toArray(); if (r.length && r[0].until > Date.now()) { mu = r[0].until; mn = r[0].n; } } catch (e) { /* no mute known */ }
    }
    // The country the connection comes from, as Cloudflare sees it: shown under the visitor's name if they wish.
    const where = request.cf && typeof request.cf.country === 'string' ? request.cf.country : (request.headers.get('CF-IPCountry') || '');
    const cc = /^[A-Z]{2}$/.test(where) && where !== 'XX' && where !== 'T1' ? where : '';
    pair[1].serializeAttachment({ id: crypto.randomUUID().slice(0, 12), role: 'new', at: Date.now(), seen: Date.now(), h, mu, mn, cc });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  everyone() {
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) list.push({ ws, a });
    }
    return list;
  }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* already gone */ } }

  // Bring the queue up to date: drop the silent, let people ashore while there is room, tell the rest their place.
  settle() {
    const now = Date.now();
    let all = this.everyone();
    for (const { ws, a } of all) {
      if (a.role !== 'new' && now - a.seen > STALE_MS) { try { ws.close(4000, 'silent too long'); } catch (e) { /* gone */ } a.role = 'gone'; }
    }
    all = all.filter((x) => x.a.role !== 'gone');
    let ashore = all.filter((x) => x.a.role === 'in').length;
    const waiting = all.filter((x) => x.a.role === 'wait').sort((p, q) => p.a.at - q.a.at);
    // Full, with a line: whoever has slept longest by the fire (past the limit) is carried out by the tide.
    if (waiting.length && ashore >= this.cap) {
      const sleepers = all.filter((x) => x.a.role === 'in' && x.a.zz && now - x.a.zz > this.sleepOut).sort((p, q) => p.a.zz - q.a.zz);
      for (const sl of sleepers.slice(0, waiting.length - Math.max(0, this.cap - ashore))) {
        this.step(sl.ws, sl.a, all);
        this.add('tide');
        this.send(sl.ws, { t: 'out', why: 'tide' });
        ashore--;
      }
    }
    while (ashore < this.cap && waiting.length) {
      const next = waiting.shift();
      next.a.role = 'in';
      next.a.in = now;
      next.a.met = ashore > 0;
      ashore++;
      // The tally. A line picked up again after a drop is the same visit, not a new one.
      const j = next.a.j || {};
      if (!j.again) {
        this.add('visits'); this.add('h' + String(new Date(now).getUTCHours()).padStart(2, '0'));
        if (j.first) this.add('visitors');
        if (j.fresh) this.add('newcomers');
        if (j.fresh && !j.step) this.add('g0');
        if (next.a.q) this.add('queued');
      }
      this.top('peak', ashore);
      next.ws.serializeAttachment(next.a);
      this.send(next.ws, { t: 'in', now: Date.now(), id: next.a.id, cap: this.cap, today: this.today('visitors'), tracks: this.tracks(), mu: next.a.mu > now ? next.a.mu : 0, cc: next.a.cc || '', pid: next.a.pid || '', code: next.a.code || '', who: next.a.who || '' });
      this.later(this.greet(next.ws, next.a));
      // Ask everyone ashore to say where they are, so the newcomer sees them at once. They have company now.
      for (const { ws, a } of all) if (a.role === 'in' && ws !== next.ws) {
        if (!a.met) { a.met = true; ws.serializeAttachment(a); }
        this.send(ws, { t: 'hello', id: next.a.id });
      }
    }
    waiting.forEach((w, i) => { if (!w.a.q) { w.a.q = 1; w.ws.serializeAttachment(w.a); } this.send(w.ws, { t: 'wait', pos: i + 1, of: waiting.length, cap: this.cap }); });
  }

  // Take a visitor off the island without closing their line: they are back on the title screen.
  step(ws, a, all) {
    const was = a.role;
    if (was === 'in') { this.departed(a); this.remember(a); }
    a.role = 'new'; a.zz = 0; a.q = 0;
    ws.serializeAttachment(a);
    if (was === 'in') this.later(this.tellFriendsOf(a.pid));
    if (was === 'in') for (const { ws: o, a: b } of all || this.everyone()) if (b.role === 'in' && o !== ws) this.send(o, { t: 'bye', id: a.id });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    const now = Date.now(), sec = Math.floor(now / 1000), r = this.rate.get(ws);
    if (r && r[0] === sec) { if (++r[1] > MAX_PER_SECOND) return; } else this.rate.set(ws, [sec, 1]);
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (now - a.seen > 5000) {
      a.seen = now;
      // Now and then, note where a visitor is, so their tracks can be left where they were last.
      if (m.t === 'p' && a.role === 'in' && m.p && Number.isFinite(m.p.x) && Number.isFinite(m.p.z)) { a.x = Math.round(m.p.x * 10) / 10; a.z = Math.round(m.p.z * 10) / 10; a.s = m.p.s | 0; }
      ws.serializeAttachment(a);
    }
    if (m.t === 'join') {
      if (a.role === 'new') {
        a.role = 'wait'; a.at = now; a.seen = now;
        a.j = { again: m.again ? 1 : 0, first: m.first ? 1 : 0, fresh: m.fresh ? 1 : 0, step: m.step | 0 };
        if (!a.pid) await this.identify(a, m.key, m.tok);
        ws.serializeAttachment(a);
      }
      this.settle();
    } else if (m.t === 'note') {
      if (a.role === 'in' && typeof m.k === 'string' && NOTES.test(m.k)) this.add(m.k);
    } else if (m.t === 'p' && a.role === 'in' && m.p && typeof m.p === 'object') {
      // Remember since when a visitor says they have been asleep (never earlier than a day ago, never in the future).
      const zz = typeof m.p.zz === 'number' && m.p.zz > 0 ? Math.min(now, Math.max(now - 86400000, m.p.zz)) : 0;
      if ((zz > 0) !== ((a.zz || 0) > 0)) { a.zz = zz; ws.serializeAttachment(a); }
      // Names are chosen by visitors, so they are held to the same words as talk. Each new name is judged once.
      if (typeof m.p.n === 'string' && m.p.n !== a.n0) { a.n0 = m.p.n.slice(0, 40); a.nb = judge(a.n0) ? 1 : 0; a.n = (a.nb ? 'Guest' : clip(a.n0, 24)) + (a.code ? ' #' + a.code : ''); a.s = m.p.s | 0; ws.serializeAttachment(a); this.remember(a); }
      if (a.nb) m.p.n = 'Guest';
      // The island stamps who this is: the number beside the name and the id friends are kept by.
      m.p.k = a.code || ''; m.p.pd = a.pid || '';
      if (typeof m.p.t === 'string' && judge(m.p.t)) m.p.t = '';
      // What they say: nothing from the muted is passed on, and a message with words not said here is dropped
      // and mutes its sender (or, for milder words, is only dropped).
      if (Array.isArray(m.p.m)) {
        const mid = m.p.m[1];
        if (a.mu > now || mid === a.bad) m.p.m = null;
        else if (mid !== a.ok) {
          const text = clip(m.p.m[0], 200), verdict = judge(text);
          if (verdict) {
            a.bad = mid; m.p.m = null;
            if (verdict === 'mute') this.mute(ws, a, 'words'); else { ws.serializeAttachment(a); this.send(ws, { t: 'hush' }); }
          } else {
            a.ok = mid; ws.serializeAttachment(a);
            const lines = this.said.get(ws) || [];
            lines.push(text); if (lines.length > 5) lines.shift();
            this.said.set(ws, lines);
          }
        }
      }
      m.p.mu = a.mu > now ? a.mu : 0;
      const out = JSON.stringify({ t: 'p', id: a.id, p: m.p });
      for (const o of this.ctx.getWebSockets()) {
        if (o === ws) continue;
        const b = o.deserializeAttachment();
        if (b && b.role === 'in') { try { o.send(out); } catch (e) { /* gone */ } }
      }
    } else if (m.t === 'friend') {
      if (a.role === 'in') await this.befriend(ws, a, m);
    } else if (m.t === 'unfriend') {
      if (a.role === 'in') await this.unfriend(ws, a, m);
    } else if (m.t === 'w') {
      if (a.role === 'in') await this.whisper(ws, a, m);
    } else if (m.t === 'mute') {
      // The game itself caught the words before sending them, and says so.
      if (a.role === 'in' && !(a.mu > now)) this.mute(ws, a, 'words');
    } else if (m.t === 'report') {
      if (a.role === 'in') await this.report(ws, a, m);
    } else if (m.t === 'leave') {
      if (a.role === 'in' || a.role === 'wait') { this.step(ws, a); this.settle(); }
    } else if (a.role === 'wait') {
      this.settle();      // a waiting visitor's "still here": a good moment to see whether a sleeper can make room
    }
  }

  webSocketClose(ws) { this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const a = ws.deserializeAttachment();
    this.rate.delete(ws); this.said.delete(ws);
    if (a) {
      const was = a.role;
      if (was === 'in') { this.departed(a); this.remember(a); }
      a.role = 'gone';
      try { ws.serializeAttachment(a); } catch (e) { /* closed */ }
      if (was === 'in') this.later(this.tellFriendsOf(a.pid));
      if (was === 'in') for (const { ws: o, a: b } of this.everyone()) if (b.role === 'in' && o !== ws) this.send(o, { t: 'bye', id: a.id });
    }
    this.settle();
  }
}

// The head count as a page a person can read. It asks the room for fresh numbers every few seconds.
const STATUS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Who is on Hush Island</title>
<meta name="description" content="How many animals are on Hush Island right now, and whether there is a line.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#050a1e">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&amp;family=Nunito:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; --ink: #f6ead2; --quiet: #b9c4d8; --ember: #ff9d4d; --amber: #ffc978; }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; padding: 32px 24px; color: var(--ink);
    font: 600 17px/1.45 "Nunito", "Segoe UI", system-ui, sans-serif;
    background: radial-gradient(120% 70% at 50% 108%, rgba(255, 140, 60, 0.3) 0%, rgba(255, 140, 60, 0) 60%), linear-gradient(180deg, #050a1e 0%, #0d1c40 55%, #142a4d 100%);
  }
  main { width: min(560px, 100%); }
  a { color: var(--amber); text-decoration-color: rgba(255, 201, 120, 0.4); text-underline-offset: 4px; text-decoration-thickness: 1.5px; }
  a:hover { color: var(--ink); text-decoration-color: var(--ember); }
  a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
  .home { font: 800 22px/1 "Baloo 2", "Nunito", sans-serif; text-decoration: none; }
  h1 { font: 800 clamp(44px, 12vw, 84px)/0.98 "Baloo 2", "Nunito", sans-serif; color: var(--amber); margin: 26px 0 10px; text-shadow: 0 0 40px rgba(255, 140, 60, 0.45); text-wrap: balance; }
  h1 small { display: block; font-size: 0.36em; line-height: 1.2; color: var(--ink); text-shadow: none; margin-top: 8px; }
  p { margin: 0 0 6px; max-width: 44ch; }
  .quiet { color: var(--quiet); font-size: 15px; }
  .go { display: inline-block; margin-top: 22px; font: 800 20px/1 "Baloo 2", "Nunito", sans-serif; }
  #when { margin-top: 26px; }
</style>
</head>
<body>
<main>
  <a class="home" href="/">Hush Island</a>
  <h1 id="count" aria-live="polite">Counting<small>&nbsp;</small></h1>
  <p id="line"></p>
  <p id="room" class="quiet"></p>
  <a class="go" id="go" href="/">Step ashore</a>
  <p id="when" class="quiet"></p>
</main>
<script>
  const el = (id) => document.getElementById(id);
  let last = 0;
  async function look() {
    try {
      const d = await (await fetch('/room/status.json', { cache: 'no-store' })).json();
      const n = d.ashore, w = d.waiting, full = n >= d.cap;
      el('count').firstChild.textContent = n === 0 ? 'Nobody' : String(n);
      el('count').querySelector('small').textContent = n === 0 ? 'is ashore right now' : n === 1 ? 'animal is ashore' : 'animals are ashore';
      el('line').textContent = n === 0 ? 'The fire is still lit. Be the first by it.' : full ? (w === 0 ? 'The island is full. The next to arrive will wait in line.' : w === 1 ? 'The island is full, and 1 more is waiting in line.' : 'The island is full, and ' + w + ' more are waiting in line.') : 'There is room by the fire.';
      el('room').textContent = 'The island holds ' + d.cap + ' at a time.';
      el('go').textContent = full ? 'Join the line' : 'Step ashore';
      last = Date.now();
    } catch (e) { if (!last) { el('count').firstChild.textContent = 'No answer'; el('count').querySelector('small').textContent = 'from the island just now'; el('line').textContent = 'This page will keep trying.'; } }
  }
  setInterval(() => { if (!document.hidden) look(); }, 5000);
  setInterval(() => { if (last) { const s = Math.round((Date.now() - last) / 1000); el('when').textContent = s < 2 ? 'Counted just now.' : 'Counted ' + s + ' seconds ago.'; } }, 1000);
  look();
</script>
</body>
</html>`;

// Reports, for the keeper of the island.
const REPORTS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reports from Hush Island</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#050a1e">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&amp;family=Nunito:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; --ink: #f6ead2; --quiet: #b9c4d8; --ember: #ff9d4d; --amber: #ffc978; --line: rgba(185, 196, 216, 0.22); }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body { padding: 32px 24px 64px; color: var(--ink); font: 600 17px/1.45 "Nunito", "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg, #050a1e 0%, #0d1c40 55%, #142a4d 100%); }
  main { width: min(720px, 100%); margin: 0 auto; }
  a { color: var(--amber); text-underline-offset: 4px; }
  .home { font: 800 22px/1 "Baloo 2", "Nunito", sans-serif; text-decoration: none; }
  h1 { font: 800 clamp(36px, 9vw, 60px)/1 "Baloo 2", "Nunito", sans-serif; color: var(--amber); margin: 26px 0 10px; }
  h2 { font: 800 24px/1.1 "Baloo 2", "Nunito", sans-serif; color: var(--amber); margin: 40px 0 6px; }
  p { margin: 0 0 8px; max-width: 60ch; }
  .quiet { color: var(--quiet); font-size: 15px; }
  form { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0; }
  input { flex: 1 1 240px; font: inherit; color: var(--ink); background: rgba(5, 10, 30, 0.6); border: 1.5px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  button { font: 800 17px/1 "Baloo 2", "Nunito", sans-serif; color: #1a1206; background: var(--amber); border: 0; border-radius: 8px; padding: 11px 18px; cursor: pointer; }
  button.plain { background: none; color: var(--amber); padding: 0; text-decoration: underline; text-underline-offset: 4px; font: inherit; }
  [hidden] { display: none !important; }
  article { border-top: 1px solid var(--line); padding: 16px 0; }
  article h3 { font: 700 18px/1.3 "Nunito", sans-serif; margin: 0 0 2px; }
  article ul { margin: 8px 0; padding-left: 20px; }
  article li { overflow-wrap: anywhere; }
</style>
</head>
<body>
<main>
  <a class="home" href="/">Hush Island</a>
  <h1>Reports and feedback</h1>
  <p id="lead">What visitors have reported and what they have told you, newest first. Only the keeper of the island can read this.</p>
  <form id="door"><input id="key" type="password" autocomplete="off" placeholder="The keeper's key" aria-label="The keeper's key"><button type="submit">Open</button></form>
  <p id="state" class="quiet" role="status"></p>
  <div id="list"></div>
  <h2 id="fb-head" hidden>Feedback</h2>
  <div id="fb"></div>
  <h2 id="mutes-head" hidden>Muted now</h2>
  <div id="mutes"></div>
</main>
<script>
  const el = (id) => document.getElementById(id);
  const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const WHY = { words: 'for what they wrote', reports: 'after several reports' };
  let key = '';
  try { key = sessionStorage.getItem('hush.key') || ''; } catch (e) { key = ''; }
  async function look() {
    if (!key) return;
    el('state').textContent = 'Opening…';
    let r;
    try { r = await fetch('/room/reports.json', { cache: 'no-store', headers: { 'x-keeper-key': key } }); }
    catch (e) { el('state').textContent = 'No answer from the island just now. Try again in a moment.'; return; }
    if (r.status === 503) { el('state').textContent = 'No key has been set for this island yet. In Cloudflare, open the hush-island Worker, go to Settings, then Variables and Secrets, and add a secret named ADMIN_KEY. Then come back and enter it here.'; return; }
    if (r.status !== 200) { el('state').textContent = 'That key does not open this page.'; try { sessionStorage.removeItem('hush.key'); } catch (e) { /* fine */ } key = ''; return; }
    const d = await r.json();
    try { sessionStorage.setItem('hush.key', key); } catch (e) { /* fine */ }
    el('door').hidden = true;
    el('state').textContent = d.reports.length ? d.reports.length + (d.reports.length === 1 ? ' report.' : ' reports.') + ' Reports older than 30 days are dropped.' : 'No reports. A quiet island.';
    const list = el('list'); list.textContent = '';
    for (const rp of d.reports) {
      const a = document.createElement('article'), h = document.createElement('h3'), p = document.createElement('p'), ul = document.createElement('ul');
      h.textContent = rp.who + ' was reported';
      p.className = 'quiet';
      p.textContent = when(rp.at) + (rp.note ? '. The reporter wrote: "' + rp.note + '"' : '') + (rp.sure ? '. These lines were seen by the island itself.' : '. These lines are as the reporter saw them.');
      for (const line of rp.lines) { const li = document.createElement('li'); li.textContent = line; ul.append(li); }
      if (!rp.lines.length) { const li = document.createElement('li'); li.textContent = 'No lines were attached.'; ul.append(li); }
      a.append(h, p, ul); list.append(a);
    }
    el('fb-head').hidden = false;
    const fb = el('fb'); fb.textContent = '';
    if (!d.feedback.length) { const p = document.createElement('p'); p.className = 'quiet'; p.textContent = 'Nobody has left a note yet.'; fb.append(p); }
    for (const f of d.feedback) { const a = document.createElement('article'), p = document.createElement('p'), q = document.createElement('p'); p.textContent = f.text; p.style.overflowWrap = 'anywhere'; q.className = 'quiet'; q.textContent = (f.who || 'A visitor') + ', ' + when(f.at); a.append(p, q); fb.append(a); }
    el('mutes-head').hidden = !d.mutes.length;
    const m = el('mutes'); m.textContent = '';
    for (const mu of d.mutes) { const p = document.createElement('p'); p.textContent = 'A visitor is muted ' + (WHY[mu.why] || '') + ' until ' + when(mu.until) + (mu.n > 1 ? ' (not the first time).' : '.'); m.append(p); }
  }
  el('door').addEventListener('submit', (e) => { e.preventDefault(); key = el('key').value.trim(); el('key').value = ''; look(); });
  look();
</script>
</body>
</html>`;

// The daily totals as a page a person can read.
const STATS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hush Island in numbers</title>
<meta name="description" content="How many animals visit Hush Island, how long they stay, and whether they meet anyone.">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#050a1e">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&amp;family=Nunito:wght@600;700&amp;display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; --ink: #f6ead2; --quiet: #b9c4d8; --ember: #ff9d4d; --amber: #ffc978; --line: rgba(185, 196, 216, 0.22); }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; margin: 0; }
  body {
    padding: 32px 24px 64px; color: var(--ink);
    font: 600 17px/1.45 "Nunito", "Segoe UI", system-ui, sans-serif;
    background: radial-gradient(120% 50% at 50% 104%, rgba(255, 140, 60, 0.22) 0%, rgba(255, 140, 60, 0) 60%), linear-gradient(180deg, #050a1e 0%, #0d1c40 55%, #142a4d 100%);
  }
  main { width: min(760px, 100%); margin: 0 auto; }
  a { color: var(--amber); text-decoration-color: rgba(255, 201, 120, 0.4); text-underline-offset: 4px; text-decoration-thickness: 1.5px; }
  a:hover { color: var(--ink); text-decoration-color: var(--ember); }
  a:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
  .home { font: 800 22px/1 "Baloo 2", "Nunito", sans-serif; text-decoration: none; }
  h1 { font: 800 clamp(44px, 12vw, 84px)/0.98 "Baloo 2", "Nunito", sans-serif; color: var(--amber); margin: 26px 0 10px; text-shadow: 0 0 40px rgba(255, 140, 60, 0.45); text-wrap: balance; }
  h1 small { display: block; font-size: 0.36em; line-height: 1.2; color: var(--ink); text-shadow: none; margin-top: 8px; }
  h2 { font: 800 26px/1.1 "Baloo 2", "Nunito", sans-serif; color: var(--amber); margin: 44px 0 10px; }
  p { margin: 0 0 6px; max-width: 60ch; }
  .quiet { color: var(--quiet); font-size: 15px; }
  .scroll { overflow-x: auto; margin: 0 -24px; padding: 0 24px; }
  table { border-collapse: collapse; width: 100%; min-width: 560px; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 7px 0 7px 18px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; padding-left: 0; }
  thead th { font-size: 14px; color: var(--quiet); font-weight: 700; vertical-align: bottom; white-space: normal; line-height: 1.2; }
  tbody tr:first-child td { color: var(--amber); }
  td.none { color: var(--quiet); }
  dl { display: grid; grid-template-columns: minmax(0, max-content) max-content minmax(4ch, 1fr); gap: 6px 18px; margin: 0; font-variant-numeric: tabular-nums; }
  dt { grid-column: 1; }
  dd { margin: 0; text-align: right; }
  dd.share { color: var(--quiet); text-align: left; }
  #notes { margin-top: 44px; }
  #notes p { margin-bottom: 4px; }
</style>
</head>
<body>
<main>
  <a class="home" href="/">Hush Island</a>
  <h1 id="count" aria-live="polite">Counting<small>&nbsp;</small></h1>
  <p id="now"></p>

  <h2>Day by day</h2>
  <div class="scroll">
    <table>
      <thead><tr><th scope="col">Day</th><th scope="col">Animals</th><th scope="col">First time ever</th><th scope="col">Most ashore at once</th><th scope="col">Had company</th><th scope="col">Stayed five minutes or more</th></tr></thead>
      <tbody id="days"></tbody>
    </table>
  </div>

  <h2>How long they stay</h2>
  <dl id="stay"></dl>

  <h2>First steps</h2>
  <p id="steps-lead"></p>
  <dl id="steps"></dl>

  <h2>Together</h2>
  <dl id="together"></dl>

  <h2>When they come</h2>
  <p id="hours"></p>

  <div id="notes" class="quiet">
    <p>Totals for the last 14 days, except where a day is named. A day runs midnight to midnight UTC.</p>
    <p>An animal is one browser, counted once a day. A dropped connection ends a stay, so stays on phones read shorter than they were.</p>
    <p>Nothing is kept about any one visitor, apart from a mute while it lasts. <span id="when"></span></p>
  </div>
</main>
<script>
  const el = (id) => document.getElementById(id);
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) + '%' : '');
  const dur = (s) => (s < 90 ? Math.round(s) + ' sec' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' hr');
  const dayName = (key, today) => (key === today ? 'Today' : new Date(key + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
  function rows(id, list) {
    const dl = el(id); dl.textContent = '';
    for (const r of list) {
      const dt = document.createElement('dt'), n = document.createElement('dd'), s = document.createElement('dd');
      dt.textContent = r[0]; n.textContent = r[1]; s.textContent = r[2] || ''; s.className = 'share';
      dl.append(dt, n, s);
    }
  }
  let last = 0;
  async function look() {
    let d;
    try { d = await (await fetch('/room/stats.json', { cache: 'no-store' })).json(); }
    catch (e) { if (!last) { el('count').firstChild.textContent = 'No answer'; el('count').querySelector('small').textContent = 'from the island just now'; el('now').textContent = 'This page will keep trying.'; } return; }
    last = Date.now();
    const keys = [];
    for (let i = 0; i < 14; i++) keys.push(new Date(d.now - i * 86400000).toISOString().slice(0, 10));
    const day = (k) => d.days[k] || {};
    const sum = (name) => keys.reduce((a, k) => a + (day(k)[name] || 0), 0);
    const t = day(d.today), n = t.visitors || 0;
    el('count').firstChild.textContent = n === 0 ? 'Nobody yet' : String(n);
    el('count').querySelector('small').textContent = n === 0 ? 'has come ashore today' : n === 1 ? 'animal has come ashore today' : 'animals have come ashore today';
    el('now').innerHTML = '';
    el('now').append(d.ashore === 0 ? 'Nobody is ashore right now. ' : d.ashore === 1 ? '1 is ashore right now. ' : d.ashore + ' are ashore right now. ');
    const a = document.createElement('a'); a.href = '/room/status'; a.textContent = 'See who is on the island'; el('now').append(a);

    const body = el('days'); body.textContent = '';
    // Days before the counting began are left out.
    let shown = keys.length;
    while (shown > 1 && !day(keys[shown - 1]).visits) shown--;
    for (const k of keys.slice(0, shown)) {
      const x = day(k), tr = document.createElement('tr'), stays = x.stays || 0, empty = !x.visits;
      const cells = [dayName(k, d.today), x.visitors || 0, x.newcomers || 0, x.peak || 0, stays ? pct(x.met || 0, stays) : '', stays ? pct((x.stay_c || 0) + (x.stay_d || 0), stays) : ''];
      cells.forEach((c, i) => { const td = document.createElement(i ? 'td' : 'th'); if (!i) td.scope = 'row'; td.textContent = empty && i ? (i < 4 ? '0' : '') : c; if (empty) td.className = 'none'; tr.append(td); });
      body.append(tr);
    }

    const stays = sum('stays');
    rows('stay', stays ? [
      ['Under a minute', sum('stay_a'), pct(sum('stay_a'), stays)],
      ['One to five minutes', sum('stay_b'), pct(sum('stay_b'), stays)],
      ['Five to fifteen minutes', sum('stay_c'), pct(sum('stay_c'), stays)],
      ['Longer than that', sum('stay_d'), pct(sum('stay_d'), stays)],
      ['Average stay', dur(sum('stay_secs') / stays), ''],
    ] : [['No stays counted yet', '', '']]);

    const g0 = sum('g0');
    el('steps-lead').textContent = g0 ? 'Of the ' + g0 + (g0 === 1 ? ' animal' : ' animals') + ' who stepped ashore for the first time, how many went on to do each of these:' : 'Nobody new has stepped ashore yet.';
    rows('steps', g0 ? [
      ['Walked up to the fire', sum('g1'), pct(sum('g1'), g0)],
      ['Rested by it', sum('g2'), pct(sum('g2'), g0)],
      ['Fed it a stick', sum('g3'), pct(sum('g3'), g0)],
      ['Greeted the keeper', sum('g4'), pct(sum('g4'), g0)],
    ] : []);

    rows('together', [
      ['Stays with another animal ashore', sum('met'), pct(sum('met'), stays)],
      ['Stays alone the whole time', sum('alone'), pct(sum('alone'), stays)],
      ['Calls answered by another animal', sum('answer'), ''],
      ['Planks added with company', sum('duo'), ''],
      ['Gestures made to another animal', sum('gesture'), ''],
      ['Friendships made', sum('friends'), ''],
      ['Whispers between friends', sum('whispers'), ''],
      ['Notes left for absent friends', sum('notes'), ''],
      ['Times an animal joined a dance', sum('dance'), ''],
      ['Voyages round the island, counted per animal', sum('sail'), ''],
      ['Games of tag begun', sum('game'), ''],
      ['Tags made playing tag', sum('tag'), ''],
      ['Tracks sniffed at', sum('sniff'), ''],
      ['Mutes for bad language or reports', sum('muted'), ''],
      ['Reports made by visitors', sum('reports'), ''],
      ['Notes left for the keeper', sum('feedback'), ''],
      ['Waited in line to get ashore', sum('queued'), ''],
      ['Left with the Leave button', sum('left'), ''],
      ['Carried out by the tide while away', sum('tide'), ''],
    ]);

    const hours = [];
    for (let h = 0; h < 24; h++) hours.push([sum('h' + String(h).padStart(2, '0')), h]);
    const total = hours.reduce((s, x) => s + x[0], 0);
    if (!total) el('hours').textContent = 'No visits counted yet.';
    else {
      const best = hours.slice().sort((p, q) => q[0] - p[0]).slice(0, 3).filter((x) => x[0] > 0);
      const say = (h) => { const t0 = new Date(); t0.setUTCHours(h, 0, 0, 0); const t1 = new Date(t0.getTime() + 3600000); const f = (x) => x.toLocaleTimeString(undefined, { hour: 'numeric' }); return f(t0) + ' to ' + f(t1); };
      el('hours').textContent = 'Busiest hours, in your own time: ' + best.map((x) => say(x[1]) + ' (' + x[0] + (x[0] === 1 ? ' visit' : ' visits') + ')').join(', ') + '.';
    }
  }
  setInterval(() => { if (!document.hidden) look(); }, 30000);
  setInterval(() => { if (last) { const s = Math.round((Date.now() - last) / 1000); el('when').textContent = s < 2 ? 'Counted just now.' : s < 60 ? 'Counted ' + s + ' seconds ago.' : 'Counted a minute ago.'; } }, 1000);
  look();
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = () => env.ISLAND.get(env.ISLAND.idFromName('main')).fetch(request);
    if (url.pathname === '/room/status.json' || url.pathname === '/room/stats.json' || url.pathname === '/room/reports.json' || url.pathname === '/room/feedback') return room();
    if (url.pathname === '/room/reports' || url.pathname === '/room/reports/') return new Response(REPORTS_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (url.pathname === '/room/stats' || url.pathname === '/room/stats/') return new Response(STATS_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (url.pathname === '/room' || url.pathname === '/room/' || url.pathname === '/room/status' || url.pathname === '/room/status/') {
      // The game speaks to /room over a WebSocket. A person opening it in a browser gets a page instead.
      if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/room') return room();
      return new Response(STATUS_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
