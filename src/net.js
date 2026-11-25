// Shared presence: who else has the island open right now, where they stand and what they say.
// Everything received here is untrusted display data from other viewers.
import { clamp } from './terrain.js';
import { use, mode } from './backend.js';
import { PLAYABLE } from './avatar.js';
import { judge } from './words.js';

// Names are chosen by visitors now, so they are held to the same words as talk. Checked once per name.
const nameOk = new Map();
function fairName(n) {
  if (!nameOk.has(n)) { if (nameOk.size > 500) nameOk.clear(); nameOk.set(n, !judge(n)); }
  return nameOk.get(n) ? n : 'Guest';
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max);
const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);

export function parsePeer(p) {
  const s = p && typeof p === 'object' ? p : {};
  if (s.v !== 1 || typeof s.n !== 'string') return null;
  const say = Array.isArray(s.m) ? { text: clean(s.m[0], 200), id: num(s.m[1], 0, 1e15) } : null;
  const emote = Array.isArray(s.e) ? { name: clean(s.e[0], 12), id: num(s.e[1], 0, 1e15) } : null;
  return {
    name: fairName(clean(s.n, 22) || 'Guest'),
    sub: fairName(clean(s.t, 28)) === 'Guest' ? '' : clean(s.t, 28),
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
    asleep: num(s.zz, 0, 1e15) > 0,
    // Tag: when this visitor was last made "it", and whom they last tagged and when.
    muted: num(s.mu, 0, 1e15),
    it: num(s.it, 0, 1e15),
    tagTo: Array.isArray(s.tg) ? clean(s.tg[0], 16) : '',
    tagAt: Array.isArray(s.tg) ? num(s.tg[1], 0, 1e15) : 0,
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
  let joinCb = null, joinInfo = null;
  const startJoin = () => { if (room && typeof room.join === 'function') room.join(joinCb, joinInfo); else joinCb({ state: 'in' }); };

  async function connect() {
    let ns = null;
    try {
      ns = await use('room');
    } catch (e) { ns = null; }
    if (!ns) { status = 'solo'; handlers.onStatus(status); if (joinCb) joinCb({ state: 'in' }); return; }
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
      if (typeof room.mod === 'function' && handlers.onMod) room.mod(handlers.onMod);
      if (pending) { const p = pending; pending = null; send(p, true); }
      if (joinCb) startJoin();
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
  return {
    send,
    get status() { return status; },
    // Ask for a place on the island. cb hears {state: 'in'}, or {state: 'wait', pos, of} while the island is full.
    join(cb, info) { joinCb = cb; joinInfo = info || null; if (status === 'solo') cb({ state: 'in' }); else if (room) startJoin(); },
    get mode() { return mode; },
    selfMute() { if (room && typeof room.selfMute === 'function') room.selfMute(); },
    report(peer, lines, note) { return !!(room && typeof room.report === 'function' && room.report(peer, lines, note)); },
    // The name everyone else on the island knows you by on the wire.
    get id() { return room && typeof room.id === 'function' ? room.id() : ''; },
    // Have the island count one more of something. Only the island's own room keeps count.
    note(k) { if (room && typeof room.note === 'function') room.note(k); },
    // Give up your place and stop being seen.
    leave() { joinCb = null; lastSent = ''; if (room && typeof room.leave === 'function') room.leave(); handlers.onPeers([]); },
  };
}
