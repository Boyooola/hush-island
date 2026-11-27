// The first thing to run. It finds out who the visitor is (the key their browser holds, or a new one), fetches their
// things from the island's room, and only then loads the game, so the game starts already knowing them.
const G = globalThis;
const DEV = !location.hostname || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let live = false; try { if (/[?&]live\b/.test(location.search)) sessionStorage.setItem('ember.live', '1'); live = sessionStorage.getItem('ember.live') === '1'; } catch (e) { /* no storage */ }
const local = DEV && !live;      // a developer's machine: the browser's copy is also read, for the tests
let key = null; try { key = JSON.parse(localStorage.getItem('ember.key')); } catch (e) { key = null; }
if (typeof key !== 'string' || !/^[a-z0-9]{24,40}$/.test(key)) { const b = new Uint8Array(20); crypto.getRandomValues(b); key = [...b].map((x) => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-6); try { localStorage.setItem('ember.key', JSON.stringify(key)); } catch (e) { /* a visit with no key is a visit nothing is kept from */ } }
const wake = (share, step, slow) => { try { const f = document.getElementById('wk-fill'); if (!f) return; if (slow) f.style.transitionDuration = slow + 's'; f.style.width = share + '%'; if (step) document.getElementById('wk-step').textContent = step; } catch (e) { /* no page to show it on */ } };
wake(30, 'Finding your things', 5);
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
// A visitor the room knows only from its older record (kept before their things moved here) gets that record now.
if (!local && box.ok && !box.had && box.old) { try { const o = JSON.parse(box.old); if (o && typeof o === 'object') { for (const k in o) if (box.d['ember.' + k] === undefined && o[k] !== null) box.d['ember.' + k] = o[k]; box.dirty = true; } } catch (e) { /* nothing usable */ } }
delete box.d['ember.key'];
// Arriving by boat: the note carried across says which shore this is, even if the room did not hear of it in time.
if (!local) { try { const c = JSON.parse(sessionStorage.getItem('ember.crossing')); if (c && (c.to === 'far' || c.to === 'home') && Date.now() - (c.at || 0) < 90000 && box.d['ember.isle'] !== c.to) { box.d['ember.isle'] = c.to; box.dirty = true; } } catch (e) { /* no note */ } }
if (!local && box.d['ember.isle'] === 'far') { try { document.getElementById('scene').classList.add('far'); } catch (e) { /* no canvas */ } }
wake(88, 'Waking the island', 9);
try { await import('./app.js'); } catch (e) { wake(88, 'The island did not load. Check your connection and reload the page.'); throw e; }
