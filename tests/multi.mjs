// Two tabs sharing a mock room, to check that visitors see each other.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const url = 'http://localhost:8765/index.html';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  const id = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel('mock-room');
  const all = new Map();
  let mine = {};
  let handler = null;
  const snapshot = () => [...all.entries()].map(([peer, presence]) => ({ peer, by: null, isMe: peer === id, sameTab: peer === id, kind: 'viewer', guest: false, presence, updatedAt: Date.now() }));
  const fire = () => { if (handler) handler({ peers: snapshot(), joined: [], left: [], updated: [] }); };
  bc.onmessage = (e) => { const m = e.data; if (m.t === 'p') { all.set(m.id, m.p); fire(); } if (m.t === 'hello') bc.postMessage({ t: 'p', id, p: mine }); if (m.t === 'bye') { all.delete(m.id); fire(); } };
  window.addEventListener('pagehide', () => bc.postMessage({ t: 'bye', id }));
  const room = {
    presence(patch) { mine = { ...mine, ...patch }; all.set(id, mine); bc.postMessage({ t: 'p', id, p: mine }); fire(); return Promise.resolve(); },
    onPeers(fn) { handler = fn; all.set(id, mine); bc.postMessage({ t: 'hello', id }); setTimeout(fire, 0); return () => {}; },
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
  };
  window.claude = { use: (n) => Promise.resolve(n === 'room' ? room : null) };
});
const a = await ctx.newPage(), b = await ctx.newPage();
const errs = [];
for (const p of [a, b]) p.on('pageerror', (e) => errs.push(e.message));
await a.goto(url); await b.goto(url);
await a.waitForTimeout(1500);
await a.evaluate(() => window.__ember.lockQuality()); await b.evaluate(() => window.__ember.lockQuality());
await a.click('#enter'); await b.bringToFront(); await b.click('#enter');
await b.waitForTimeout(3000);
await b.evaluate(() => { const e = window.__ember; e.teleport(2.5, 6.5, Math.PI); e.cam(0.5, 0.3, 7); });
await a.bringToFront();
await a.evaluate(() => { const e = window.__ember; e.teleport(-1, 7, Math.PI); e.cam(-0.4, 0.3, 7.5); });
await a.waitForTimeout(600);
await b.bringToFront();
await b.evaluate(() => { const e = window.__ember; e.sendChat('Hi there, nice fire.'); e.playEmote('wag'); });
await b.waitForTimeout(600);
await a.bringToFront();
await a.waitForTimeout(1200);
await a.screenshot({ path: 'shots/20-multi-a.png' });
console.log('A sees peers:', await a.evaluate(() => window.__ember.peers.size), '| count:', await a.evaluate(() => document.getElementById('count').textContent));
console.log('A log:', await a.evaluate(() => document.getElementById('log').innerText.replace(/\n/g, ' | ')));
// Shared fire: A feeds it, B should see the same fuel. B picks up a log, A should see it held.
await a.evaluate(() => window.__ember.setFire(1.25));
await b.bringToFront(); await b.waitForTimeout(900);
console.log('fuel A / B:', (await a.evaluate(() => window.__ember.fuel)).toFixed(2), '/', (await b.evaluate(() => window.__ember.fuel)).toFixed(2));
await b.evaluate(() => { const e = window.__ember; e.teleport(3.3, 6.2, Math.PI); });
await b.waitForTimeout(500);
await b.keyboard.press('e');
await b.waitForTimeout(500);
await a.bringToFront(); await a.waitForTimeout(900);
console.log('A sees B holding:', await a.evaluate(() => [...window.__ember.peers.values()][0].av.held));
await b.bringToFront();
await b.evaluate(() => { const e = window.__ember; e.teleport(2.2, 4.2, Math.PI); });
await b.waitForTimeout(500);
await b.keyboard.press('e');
for (let i = 0; i < 20 && (await b.evaluate(() => window.__ember.fuel)) < 1.3; i++) await b.waitForTimeout(500);
await a.bringToFront(); await a.waitForTimeout(900);
console.log('after B tosses a log, fuel A / B:', (await a.evaluate(() => window.__ember.fuel)).toFixed(2), '/', (await b.evaluate(() => window.__ember.fuel)).toFixed(2));
await b.bringToFront();
await b.evaluate(() => window.__ember.teleport(-1.7, 1.7, Math.PI));
await b.waitForTimeout(500);
console.log('B can:', await b.evaluate(() => window.__ember.actions));
await b.evaluate(() => { const e = window.__ember; e.run(0); e.warmth = 0.9; });
await b.waitForTimeout(1500);
console.log('B mode:', await b.evaluate(() => window.__ember.me.mode));
await a.bringToFront(); await a.waitForTimeout(900);
await a.evaluate(() => window.__ember.cam(-0.9, 0.25, 6));
await a.waitForTimeout(900);
await a.screenshot({ path: 'shots/21-multi-rest.png' });
console.log('A sees B:', await a.evaluate(() => { const p = [...window.__ember.peers.values()][0]; return { mode: p.av.mode, seat: p.data.seat, warmth: p.av.warmth }; }));
// B walks up to A and greets; A should be told, and wag back.
await b.bringToFront();
const apos = await a.evaluate(() => [window.__ember.me.x, window.__ember.me.z]);
await b.evaluate((p) => { const e = window.__ember; e.standUp(); e.teleport(p[0] + 1.3, p[1] + 0.4, 0); }, apos);
await b.waitForTimeout(900);
console.log('B next to A can:', await b.evaluate(() => window.__ember.actions));
await b.evaluate(() => { const e = window.__ember; const i = e.actions.findIndex((l) => l && l.startsWith('Greet')); if (i >= 0) e.run(i); });
await b.waitForTimeout(500);
await a.bringToFront(); await a.waitForTimeout(1500);
console.log('A log:', await a.evaluate(() => document.getElementById('log').innerText.split('\n').slice(-2).join(' | ')), '| A emote:', await a.evaluate(() => window.__ember.me.emote));
// B calls from far away; A hears about it.
await b.bringToFront();
await b.evaluate(() => { const e = window.__ember; e.teleport(-15, -12, 0); });
await b.waitForTimeout(3200);
await b.evaluate(() => window.__ember.callOut());
await b.waitForTimeout(500);
await a.bringToFront(); await a.waitForTimeout(1200);
console.log('A log:', await a.evaluate(() => document.getElementById('log').innerText.split('\n').slice(-1).join(' | ')));
// B lies down near A, then runs past; A watches.
await b.bringToFront();
await b.evaluate(() => { const e = window.__ember; e.standUp(); e.teleport(-3.2, 7.2, 1.2); e.setMode('lie'); });
await b.waitForTimeout(2500);
await a.bringToFront();
await a.evaluate(() => { const e = window.__ember; e.teleport(-1.2, 9.4, 3.6); e.cam(0.7, 0.3, 4.5); });
await a.waitForTimeout(2500);
await a.screenshot({ path: 'shots/22-multi-lie.png' });
await b.bringToFront();
await b.evaluate(() => { const e = window.__ember; e.setMode('stand'); e.walkTo(-3.2, 14); });
await b.waitForTimeout(1200);
await a.bringToFront();
await a.waitForTimeout(700);
await a.screenshot({ path: 'shots/23-multi-run.png' });
// A late joiner should pick up the fire as it is.
const c = await ctx.newPage();
await c.goto(url); await c.waitForTimeout(1500); await c.click('#enter'); await c.waitForTimeout(2500);
console.log('late joiner fuel:', (await c.evaluate(() => window.__ember.fuel)).toFixed(2));
await c.close();
await b.close();
await a.waitForTimeout(800);
console.log('after B leaves, A sees peers:', await a.evaluate(() => window.__ember.peers.size));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
