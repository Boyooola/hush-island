import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let fails = 0; const ok = (c, m, x = '') => { if (!c) { console.log('FAIL ' + m, x); fails++; } };
const S = '/home/claude/ember-isle/shots/';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); window.__ember.setRain(0); window.__ember.setFog(false); });
await p.click('#pick-animal button:nth-child(1)'); await p.click('#enter'); await p.waitForTimeout(6000);
await p.evaluate(() => { const e = window.__ember, P = 16 * 60000, now = e.timeNow(), cur = (now % P) / P; e.shiftTime(((0.5 - cur + 1) % 1) * P); e.setLamp(true); }); await p.waitForTimeout(1000);
// every stretch of every path can be walked
const legs = await p.evaluate(() => { const e = window.__ember, out = []; e.paths.forEach((path, pi) => { for (let i = 0; i + 1 < path.length; i++) { e.teleport(path[i][0], path[i][1], 0); const r = e.walkTo(path[i + 1][0], path[i + 1][1]); out.push({ pi, i, a: path[i], b: path[i + 1], ok: !!r, n: r ? r.length : 0 }); } }); return out; });
console.log(legs.length, 'stretches of path;', legs.filter((l) => !l.ok).length, 'cannot be walked');
for (const l of legs.filter((q) => !q.ok)) console.log('  path', l.pi, 'leg', l.i, l.a.join(','), '->', l.b.join(','));
fails += legs.filter((l) => !l.ok).length;
// everything a quest sends a visitor to can be reached from the nearest bit of path
const res = await p.evaluate(() => {
  const e = window.__ember, w = e.world, T = [];
  for (const [k, v] of Object.entries(e.sightAt)) T.push(['sight ' + k, v[0], v[1]]);
  w.logPages.forEach((q, i) => T.push(['page ' + (i + 1), q.x, q.z])); w.sources.forEach((q, i) => T.push([q.kind + ' ' + i, q.x, q.z]));
  T.push(['hermit', w.hermit.x, w.hermit.z], ['heron', w.heron.x, w.heron.z], ['mapmaker', w.mapmaker.x, w.mapmaker.z], ['tower door', w.lighthouse.door.x, w.lighthouse.door.z], ['cottage door', w.cottage.door.x, w.cottage.door.z], ['bell', w.flats.bell.x, w.flats.bell.z]);
  const verts = e.paths.flat(), out = [];
  for (const [name, x, z] of T) {
    const v = verts.slice().sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z))[0];
    let got = null; for (const [dx, dz] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6], [2.4, 2.4], [-2.4, -2.4]]) { e.teleport(v[0], v[1], 0); const r = e.walkTo(x + dx, z + dz); if (r) { got = r; break; } }
    out.push({ name, ok: !!got, d: Math.round(Math.hypot(v[0] - x, v[1] - z)) });
  }
  e.teleport(8, 2, 0); return out;
});
console.log(res.length, 'places;', res.filter((r) => !r.ok).length, 'cannot be reached:', res.filter((r) => !r.ok).map((r) => `${r.name} (${r.d} m from a path)`).join(', '));
for (const [name, x, z, cam] of [['w1', 14, 3, [1.57, 0.25, 10]], ['w2', -265, -2, [4.2, 0.3, 12]], ['w3', -40, -4, [1.57, 0.3, 10]]]) { await p.evaluate(([x, z, cam]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(...cam); }, [x, z, cam]); await p.waitForTimeout(9000); await p.screenshot({ path: S + name + '.png' }); }
console.log(fails ? `${fails} FAILED` : 'all paths walk');
await browser.close();
