// Shared presence: who else has the island open right now, where they stand and what they say.
// Everything received here is untrusted display data from other viewers.
import { clamp } from './terrain.js';
import { use } from './backend.js';
import { PLAYABLE } from './avatar.js';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max);
const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);

export function parsePeer(p) {
  const s = p && typeof p === 'object' ? p : {};
  if (s.v !== 1 || typeof s.n !== 'string') return null;
  const say = Array.isArray(s.m) ? { text: clean(s.m[0], 200), id: num(s.m[1], 0, 1e15) } : null;
  const emote = Array.isArray(s.e) ? { name: clean(s.e[0], 12), id: num(s.e[1], 0, 1e15) } : null;
  return {
    name: clean(s.n, 22) || 'Guest',
    sub: clean(s.t, 28),
    species: Math.floor(num(s.s, 0, PLAYABLE - 1)),
    palette: Math.floor(num(s.c, 0, 8)),
    x: num(s.x, -70, 70),
    z: num(s.z, -70, 70),
    yaw: num(s.r, -10, 10),
    mode: s.st === 1 ? 'sit' : s.st === 2 || s.st === 3 ? 'lie' : 'stand',
    gaze: s.st === 3,
    seat: Number.isInteger(s.se) ? s.se : -1,
    say: say && say.text ? say : null,
    emote: emote && emote.name ? emote : null,
    held: s.h === 1 || s.h === 2 || s.h === 3 ? s.h : 0,
    wet: num(s.w, 0, 1),
    butterfly: s.b === 1,
    nights: Math.floor(num(s.nv, 0, 9999)),
    warmth: num(s.tl, 0, 1),
    fire: Array.isArray(s.fr) && Number.isFinite(s.fr[0]) && Number.isFinite(s.fr[1]) ? { fuel: num(s.fr[0], 0, 1.4), at: num(s.fr[1], 0, 1e15) } : null,
  };
}

export function createNet(handlers) {
  let room = null;
  let lastSent = '';
  let lastSentAt = 0;
  let pending = null;
  let status = 'connecting';

  async function connect() {
    let ns = null;
    try {
      ns = await use('room');
    } catch (e) { ns = null; }
    if (!ns) { status = 'solo'; handlers.onStatus(status); return; }
    room = ns;
    const fail = () => { room = null; status = 'solo'; handlers.onStatus(status); handlers.onPeers([]); };
    try {
      room.onConnection((c) => {
        status = c ? 'online' : 'connecting';
        handlers.onStatus(status);
      }, fail);
      room.onPeers((change) => {
        const list = [];
        for (const peer of change.peers) {
          if (peer.sameTab || peer.kind !== 'viewer') continue;
          const data = parsePeer(peer.presence);
          if (data) list.push({ id: peer.peer, mine: !!peer.isMe, data });
        }
        handlers.onPeers(list);
      }, fail);
      if (pending) { const p = pending; pending = null; send(p, true); }
    } catch (e) { fail(); }
  }

  function send(state, force) {
    if (!room) { pending = state; return; }
    const now = performance.now();
    if (!force && now - lastSentAt < 90) return;
    const json = JSON.stringify(state);
    if (json === lastSent) return;
    lastSent = json;
    lastSentAt = now;
    try { room.presence(state).catch(() => {}); } catch (e) { /* stay quiet: the island works alone */ }
  }

  connect();
  return { send, get status() { return status; } };
}
