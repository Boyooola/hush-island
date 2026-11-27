// A visitor's own things: quests done, what is in the satchel, which shore they are on, how they like the sound.
// None of it is kept in the browser. boot.js fetches it from the island's room before the game is loaded, and every
// change is sent back there a moment later. The one thing the browser holds is the key that says whose things they are.
// (On a developer's machine a copy is also written to the browser's storage, which the tests read and set.)
const G = globalThis;
const box = G.__mine || (G.__mine = { d: {}, ok: false, key: '', local: true, old: null });
let timer = 0, firstDirty = 0, sending = false, again = false;
const body = () => JSON.stringify({ key: box.key, d: JSON.stringify(box.d) });
async function send() {
  if (!box.ok || !box.key) return false;
  if (sending) { again = true; return false; }
  sending = true; firstDirty = 0;
  try { const r = await fetch('/room/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body(), keepalive: true }); if (r.status === 429) again = true; }
  catch (e) { again = true; }
  sending = false;
  if (again) { again = false; touch(); }
  return true;
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
    if (box.local) { try { if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, typeof value === 'string' && key.startsWith('hush.') ? value : JSON.stringify(value)); } catch (e) { /* no storage */ } }
    touch();
  },
  // Sent now, and waited for (briefly): before the page is left for the other island.
  async flush() { clearTimeout(timer); try { await Promise.race([send(), new Promise((r) => setTimeout(r, 1800))]); } catch (e) { /* it will be sent from the other side */ } },
  get ok() { return box.ok; }, get old() { return box.old; }, get local() { return box.local; },
};
// Leaving the page: whatever has not been sent yet goes now.
if (typeof addEventListener === 'function') {
  const last = () => { if (box.ok && box.key && firstDirty && navigator.sendBeacon) { firstDirty = 0; clearTimeout(timer); try { navigator.sendBeacon('/room/mine', new Blob([body()], { type: 'application/json' })); } catch (e) { /* gone */ } } };
  addEventListener('pagehide', last); document.addEventListener('visibilitychange', () => { if (document.hidden) last(); });
}
