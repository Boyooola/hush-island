// A visitor's own things: quests done, what is in the satchel, which shore they are on, how they like the sound.
// None of it is kept in the browser. boot.js fetches it from the island's room before the game is loaded, and every
// change is sent back there a moment later. The one thing the browser holds is the key that says whose things they are.
// (On a developer's machine a copy is also written to the browser's storage, which the tests read and set.)
const G = globalThis;
const box = G.__mine || (G.__mine = { d: {}, ok: false, key: '', local: true, old: null });
let timer = 0, firstDirty = 0, sending = false, again = false;
// Only what has changed is sent, and the room folds it into what it holds: two tabs open at once no longer undo each other.
const dirty = new Set();
const patch = (keys) => { const p = {}; for (const k of keys) p[k] = box.d[k] === undefined ? null : box.d[k]; return JSON.stringify({ key: box.key, p }); };
async function send() {
  if (!box.ok || !box.key) return false;
  if (sending) { again = true; return false; }
  if (!dirty.size) return true;
  sending = true; firstDirty = 0;
  const keys = [...dirty]; dirty.clear();
  let kept = false;
  try { const r = await fetch('/room/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: patch(keys), keepalive: true }); if (r.status === 429) again = true; else kept = r.ok; }
  catch (e) { again = true; }
  sending = false;
  if (!kept) for (const k of keys) dirty.add(k);
  if (again) { again = false; kept = false; touch(); }
  return kept;
}
function touch() {
  if (!box.ok) return;
  const now = Date.now(); if (!firstDirty) firstDirty = now;
  clearTimeout(timer); timer = setTimeout(send, now - firstDirty > 9000 ? 0 : 2500);      // a moment after the last change, and never more than a few seconds behind
}
export const mine = {
  get(key) { const v = box.d[key]; return v === undefined ? null : v; },
  set(key, value) {
    if (value === null || value === undefined) delete box.d[key]; else box.d[key] = value;
    dirty.add(key);
    if (box.local) { try { if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, typeof value === 'string' && key.startsWith('hush.') ? value : JSON.stringify(value)); } catch (e) { /* no storage */ } }
    touch();
  },
  // Sent now, and waited for (briefly): before the page is left for the other island.
  // It keeps trying for a few seconds: a save already on its way, or one the room turned back for coming too soon, is waited out.
  async flush() {
    if (!box.ok) return false;
    const until = Date.now() + 6000;
    while (Date.now() < until) {
      clearTimeout(timer);
      let kept = false; try { kept = await send(); } catch (e) { kept = false; }
      if (kept) { clearTimeout(timer); return true; }
      await new Promise((r) => setTimeout(r, 450));
    }
    return false;
  },
  get ok() { return box.ok; }, get old() { return box.old; }, get local() { return box.local; },
};
// Leaving the page: whatever has not been sent yet goes now.
if (typeof addEventListener === 'function') {
  const last = () => { if (box.ok && box.key && dirty.size && !sending && navigator.sendBeacon) { firstDirty = 0; clearTimeout(timer); const keys = [...dirty]; try { if (navigator.sendBeacon('/room/mine', new Blob([patch(keys)], { type: 'application/json' }))) dirty.clear(); } catch (e) { /* gone */ } } };
  addEventListener('pagehide', last); document.addEventListener('visibilitychange', () => { if (document.hidden) last(); });
}
if (box.dirty) { box.dirty = false; for (const k in box.d) dirty.add(k); touch(); }      // boot.js changed something on the way in
