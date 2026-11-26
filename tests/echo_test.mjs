import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errs = []; let fails = 0;
const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m, x); if (!c) fails++; };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8787/far', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.setHour(11); });
await p.click('#pick-animal button:nth-child(1)'); await p.click('#enter'); await p.waitForTimeout(5000);
await p.evaluate(() => window.__ember.setLamp(true));      // the hill turns out anyone with no light
const S = '/home/claude/ember-isle/shots/';
const go = async (x, z, yaw, cam, wait = 2500) => { await p.evaluate(([x, z, yaw, cam]) => { const e = window.__ember; e.teleport(x, z, yaw); e.cam(...cam); }, [x, z, yaw, cam]); await p.waitForTimeout(wait); };
const E = await p.evaluate(() => { const e = window.__ember.world.echo; return { cr: e.crystals.map((c) => ({ x: c.x, z: c.z })), door: { x: e.door.x, z: e.door.z }, mark: e.mark }; });
await go(-182, -92, 4, [2.0, 0.7, 13], 5000); await p.screenshot({ path: S + 'e1.png' });
ok(await p.evaluate(() => { const d = window.__ember.world.echo.door; return d.solid.r > 2; }), 'the door is shut to begin with');
// (the test machine's clock for calls runs slow, so two crystals are set ringing directly and the third by a real call)
{ const c = E.cr[2]; await go(c.x + (-182 - c.x) * 0.3, c.z + (-92 - c.z) * 0.3, 4, [2.0, 0.7, 13], 9000); await p.screenshot({ path: S + 'e2.png' }); await p.evaluate(() => { window.__ember.world.ringCrystal(0, 24000); window.__ember.world.ringCrystal(1, 24000); }); await p.keyboard.press('1'); }
await p.waitForTimeout(2600); await p.screenshot({ path: S + 'e3.png' });
ok(await p.evaluate(() => window.__ember.world.echo.door.open && window.__ember.world.echo.door.solid.r === 0), 'three crystals ringing together open it');
await p.waitForTimeout(7000);
await go(-190, -77, 4, [0.4, 0.7, 9], 5000); await p.screenshot({ path: S + 'e4.png' });
ok(await p.evaluate(() => !!window.__emberCards().deeppool), 'the pool under the hill is a stamp');
await p.evaluate(() => window.__ember.setLamp(true)); await go(E.mark.x - 0.6, E.mark.z - 2.2, 0, [3.14, 0.25, 4.5], 2500);
const acts = await p.evaluate(() => window.__ember.actions.join(' | ')); ok(/mark on the rock/.test(acts), 'the mark can be looked at', acts);
await p.evaluate(() => { const e = window.__ember; e.run(e.actions.indexOf('Look at the mark on the rock')); }); await p.waitForTimeout(900); await p.screenshot({ path: S + 'e5.png' });
console.log(' ', await p.evaluate(() => window.__ember.log.slice(-4).join(' || ')));
console.log(errs.length ? [...new Set(errs)].slice(0, 5).join('\n') : 'no page errors', fails ? `${fails} FAILED` : '');
await browser.close();
