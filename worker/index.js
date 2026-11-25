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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/room' || url.pathname === '/room/status') return env.ISLAND.get(env.ISLAND.idFromName('main')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};
