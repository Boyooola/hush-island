// The first thing to run. It finds out who the visitor is (the key their browser holds, or a new one), fetches their
// things from the island's room, and only then loads the game, so the game starts already knowing them.
const G = globalThis;
const DEV = !location.hostname || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let live = false; try { if (/[?&]live\b/.test(location.search)) sessionStorage.setItem('ember.live', '1'); live = sessionStorage.getItem('ember.live') === '1'; } catch (e) { /* no storage */ }
const local = DEV && !live;      // a developer's machine: the browser's copy is also read, for the tests
let key = null; try { key = JSON.parse(localStorage.getItem('ember.key')); } catch (e) { key = null; }
if (typeof key !== 'string' || !/^[a-z0-9]{24,40}$/.test(key)) { const b = new Uint8Array(20); crypto.getRandomValues(b); key = [...b].map((x) => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-6); try { localStorage.setItem('ember.key', JSON.stringify(key)); } catch (e) { /* a visit with no key is a visit nothing is kept from */ } }
const box = G.__mine = { d: {}, ok: false, key, local, old: null, had: false };
async function fetchMine() {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('/room/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }), signal: AbortSignal.timeout(4000 + i * 2000) });
      if (r.ok) { const j = await r.json(); if (j.d) { try { box.d = JSON.parse(j.d) || {}; box.had = true; } catch (e) { box.d = {}; } } box.old = j.old || null; box.ok = true; return; }
      if (r.status === 404 || r.status === 400) return;      // no room here (a plain file server): nothing will be kept
    } catch (e) { /* try again */ }
    await new Promise((res) => setTimeout(res, 500));
  }
}
await fetchMine();
// What an older visit left in this browser's storage is taken up once, sent to the room, and cleared away.
const inBrowser = () => { const out = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || k === 'ember.key' || !(k.startsWith('ember.') || k.startsWith('hush.'))) continue; const raw = localStorage.getItem(k); if (k.startsWith('hush.') && k !== 'hush.island.db') { out[k] = raw; continue; } if (k === 'hush.island.db') continue; try { out[k] = JSON.parse(raw); } catch (e) { /* not ours */ } } } catch (e) { /* no storage */ } return out; };
if (local) Object.assign(box.d, inBrowser());
else if (box.ok) {
  const old = inBrowser(), keys = Object.keys(old);
  if (keys.length) {
    if (!box.had) Object.assign(box.d, old);      // the room had nothing for this visitor: what the browser held is theirs
    try { const r = await fetch('/room/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, d: JSON.stringify(box.d) }) }); if (r.ok) { for (const k of keys) localStorage.removeItem(k); localStorage.removeItem('hush.island.db'); } } catch (e) { /* next visit */ }
  }
}
delete box.d['ember.key'];
await import('./app.js');
