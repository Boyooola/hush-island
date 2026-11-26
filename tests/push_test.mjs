import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const S = '/home/claude/ember-isle/shots/';
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); window.__ember.setRain(0); window.__ember.setFog(false); });
await p.click('#pick-animal button:nth-child(1)'); await p.click('#enter'); await p.waitForTimeout(5000);
const go = async (x, z, wait = 3000, cam = [0.6, 0.5, 9]) => { await p.evaluate(([x, z, cam]) => { const e = window.__ember; e.teleport(x, z, 0); e.cam(...cam); }, [x, z, cam]); await p.waitForTimeout(wait); };
const log = (n = 5) => p.evaluate((n) => window.__ember.log.slice(-n).join(' || '), n);
const finds = () => p.evaluate(() => Object.keys(window.__ember.journal));
const cut = async (pos, look, name) => { await p.evaluate(([pos, look]) => window.__ember.cutTo(pos, look, 6), [pos, look]); await p.waitForTimeout(3000); await p.screenshot({ path: S + name }); await p.waitForTimeout(4200); };
// hares
const H = await p.evaluate(() => { const e = window.__ember; return { hares: e.shy.hares.map((h) => ({ x: h.x, z: h.z })), seals: e.shy.seals.map((s) => ({ x: s.hx, z: s.hz })), y: e.world.lighthouse.galleryY }; });
await go(H.hares[0].x + 11, H.hares[0].z + 2, 3000);
const hy = await p.evaluate(() => window.__ember.me.y);
await cut([H.hares[0].x + 2.2, hy + 0.9, H.hares[0].z + 2.4], [H.hares[0].x, hy + 0.25, H.hares[0].z], 'p1.png');
await p.keyboard.press('6'); await p.waitForTimeout(1000);      // lie down and keep still
let came = false; for (let i = 0; i < 40 && !came; i++) { await p.waitForTimeout(3000); came = (await finds()).includes('hare'); }
ok(came, 'lying still on the meadow, a hare comes over', await log(2)); await p.screenshot({ path: S + 'p2.png' });
await p.keyboard.press('6'); await p.waitForTimeout(800);
const h1 = await p.evaluate(() => window.__ember.shy.hares.map((h) => h.state).join());
await p.evaluate(() => { const e = window.__ember, h = e.shy.hares[1]; e.teleport(h.x + 6, h.z, 0); }); await p.waitForTimeout(600);
await p.evaluate(() => { const e = window.__ember, h = e.shy.hares[1]; e.walkTo ? e.walkTo(h.x, h.z) : e.teleport(h.x + 1.5, h.z, 0); }); await p.waitForTimeout(2500);
const far1 = await p.evaluate(() => { const e = window.__ember, h = e.shy.hares[1]; return Math.hypot(h.x - e.me.x, h.z - e.me.z); });
ok(far1 > 4.5, 'walked at, a hare bolts', `${far1.toFixed(1)} m away, ${await log(1)}`);
// seals
await p.evaluate(() => { const e = window.__ember, P = 16 * 60000, now = e.timeNow(), cur = (now % P) / P; e.shiftTime(((0.5 - cur + 1) % 1) * P); }); await p.waitForTimeout(1500); console.log('  tide:', await p.evaluate(() => document.getElementById('tide-note').textContent));
await go(H.seals[0].x - 16, H.seals[0].z - 12, 2500);
const sy = await p.evaluate(() => window.__ember.shy.seals[0].g.position.y);
await cut([H.seals[0].x + 3.5, sy + 1.6, H.seals[0].z + 4.5], [H.seals[1].x + 1.5, sy + 0.2, H.seals[1].z - 1.5], 'p3.png');
await p.keyboard.press('1'); await p.waitForTimeout(4000);
ok((await finds()).includes('seal'), 'called to from a distance, a seal answers', await log(2));
await go(H.seals[0].x - 1.5, H.seals[0].z - 1, 5000);
ok(await p.evaluate(() => window.__ember.shy.seals[0].away === 1), 'gone up to, the seals slide off', await log(1));
// fog
await p.evaluate(() => { window.__ember.setHour(23); window.__ember.setFog(true); }); await go(20, 4, 9000, [1.2, 0.3, 10]); await p.screenshot({ path: S + 'p4.png' });
ok((await finds()).includes('fog') && /Fog, coming in/.test(await log(6)), 'a fog night is told and found', (await log(2)).slice(0, 120));
await p.evaluate(() => { window.__ember.setFog(false); }); await p.waitForTimeout(3000); await p.screenshot({ path: S + 'p5.png' });
// the dark under the hill
await p.evaluate(() => window.__ember.setHour(11)); await go(-182, -92, 4000);
let turned = false; for (let i = 0; i < 50 && !turned; i++) { await p.waitForTimeout(3000); turned = await p.evaluate(() => Math.hypot(window.__ember.me.x + 150, window.__ember.me.z + 70) < 8); }
ok(turned, 'with no light and no company, the hill walks you out', await log(1));
await p.evaluate(() => window.__ember.setLamp(true)); await go(-182, -92, 4000); await p.waitForTimeout(20000);
ok(await p.evaluate(() => Math.hypot(window.__ember.me.x + 182, window.__ember.me.z + 92) < 3), 'with the lantern it does not');
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
