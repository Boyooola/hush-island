// The island's live room, running on Cloudflare.
//
// Every visitor holds one WebSocket to a single Durable Object. It does three small jobs:
//   1. passes each visitor's position, chat and gestures on to everyone else who is ashore
//   2. keeps count, and when the island is full, holds newcomers in a queue in arrival order
//   3. lets the next in line ashore the moment someone leaves
// Everything it needs to remember rides on the sockets themselves, so it can sleep between messages.
import { DurableObject } from 'cloudflare:workers';

const DEFAULT_CAP = 40;          // animals ashore at once
const STALE_MS = 45000;          // a visitor silent this long is taken to have left
const MAX_BYTES = 2500;          // largest message accepted
const MAX_PER_SECOND = 12;       // messages accepted from one visitor each second

export class Island extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.cap = Math.max(1, parseInt(env.CAP, 10) || DEFAULT_CAP);
    this.rate = new Map();        // socket -> [second, count]; forgotten when the object sleeps, which is fine
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      // A plain request gets a head count: how many are ashore, how many are waiting, how many fit.
      const all = this.everyone();
      const body = { ashore: all.filter((x) => x.a.role === 'in').length, waiting: all.filter((x) => x.a.role === 'wait').length, cap: this.cap };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ id: crypto.randomUUID().slice(0, 12), role: 'new', at: Date.now(), seen: Date.now() });
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
    while (ashore < this.cap && waiting.length) {
      const next = waiting.shift();
      next.a.role = 'in';
      next.ws.serializeAttachment(next.a);
      this.send(next.ws, { t: 'in', id: next.a.id, cap: this.cap });
      ashore++;
      // Ask everyone ashore to say where they are, so the newcomer sees them at once.
      for (const { ws, a } of all) if (a.role === 'in' && ws !== next.ws) this.send(ws, { t: 'hello', id: next.a.id });
    }
    waiting.forEach((w, i) => this.send(w.ws, { t: 'wait', pos: i + 1, of: waiting.length, cap: this.cap }));
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    const now = Date.now(), sec = Math.floor(now / 1000), r = this.rate.get(ws);
    if (r && r[0] === sec) { if (++r[1] > MAX_PER_SECOND) return; } else this.rate.set(ws, [sec, 1]);
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (now - a.seen > 5000) { a.seen = now; ws.serializeAttachment(a); }
    if (m.t === 'join') {
      if (a.role === 'new') { a.role = 'wait'; a.at = now; a.seen = now; ws.serializeAttachment(a); }
      this.settle();
    } else if (m.t === 'p' && a.role === 'in' && m.p && typeof m.p === 'object') {
      const out = JSON.stringify({ t: 'p', id: a.id, p: m.p });
      for (const o of this.ctx.getWebSockets()) {
        if (o === ws) continue;
        const b = o.deserializeAttachment();
        if (b && b.role === 'in') { try { o.send(out); } catch (e) { /* gone */ } }
      }
    } else if (m.t === 'leave') {
      try { ws.close(1000, 'left'); } catch (e) { /* gone */ }
    }
    // Anything else (a waiting visitor's "still here") only refreshes the time they were last heard from.
  }

  webSocketClose(ws) { this.gone(ws); }
  webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const a = ws.deserializeAttachment();
    this.rate.delete(ws);
    if (a) {
      const was = a.role;
      a.role = 'gone';
      try { ws.serializeAttachment(a); } catch (e) { /* closed */ }
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
<link rel="icon" href="data:,">
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = () => env.ISLAND.get(env.ISLAND.idFromName('main')).fetch(request);
    if (url.pathname === '/room/status.json') return room();
    if (url.pathname === '/room' || url.pathname === '/room/' || url.pathname === '/room/status' || url.pathname === '/room/status/') {
      // The game speaks to /room over a WebSocket. A person opening it in a browser gets a page instead.
      if (request.headers.get('Upgrade') === 'websocket' && url.pathname === '/room') return room();
      return new Response(STATUS_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
