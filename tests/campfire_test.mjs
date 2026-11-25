// Campfire hour: a set time to gather, told in the visitor's own time, with a flame for those who came.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const until = async (p, fn, ms = 30000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const ctxOf = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, timezoneId: 'Asia/Manila', locale: 'en-US' }); await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort()); return ctx; };
const a = await (await ctxOf(1280, 720)).newPage(); a.on('pageerror', (e) => errs.push(e.message));
await a.goto('http://localhost:8787/index.html', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(1500);
await a.evaluate(() => localStorage.setItem('ember.starter', '4')); await a.reload({ waitUntil: 'domcontentloaded' }); await a.waitForTimeout(4000);
const title = await a.evaluate(() => document.getElementById('campfire-note').textContent);
ok('the title screen says when, in UTC, and how long is left', /every day at 01:00 and 13:00 UTC\. The next starts in \d/.test(title), title);
await a.screenshot({ path: '/home/claude/ember-isle/shots/c1-title.png' });
await a.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; });
await a.click('#enter'); await a.waitForTimeout(9000);
ok('arriving, you are told when company gathers', await a.evaluate(() => /Campfire hour is every day at/.test(window.__ember.log.join(' '))));
ok('and it stays in view at the top', /Campfire hour in \d.* \((01|13):00 UTC\)/.test(await a.evaluate(() => window.__ember.campfire.top)), await a.evaluate(() => window.__ember.campfire.top));
const b = await (await ctxOf(640, 360)).newPage(); b.on('pageerror', (e) => errs.push(e.message));
await b.goto('http://localhost:8787/index.html', { waitUntil: 'domcontentloaded' }); await b.waitForTimeout(1500);
await b.evaluate(() => localStorage.setItem('ember.starter', '4')); await b.reload({ waitUntil: 'domcontentloaded' }); await b.waitForTimeout(3000);
await b.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; }); await b.click('#enter'); await b.waitForTimeout(6000);
// Ten minutes to go.
await a.evaluate(() => { const e = window.__ember; e.campShift = e.campfire.next - e.timeNow() - 8 * 60000; });
ok('ten minutes before, those ashore are told', await until(a, () => /Campfire hour starts in \d+ min/.test(window.__ember.log.join(' ')), 15000));
// The hour begins.
await a.evaluate(() => { const e = window.__ember; e.campShift = 0; e.campShift = e.campfire.next - e.timeNow() + 3000; });
ok('when it begins there are big words and the keeper speaks', await until(a, () => window.__ember.campfire.on && /Pull in close/.test(window.__ember.log.join(' ')) && /It is campfire hour/.test(window.__ember.log.join(' ')), 15000), await a.evaluate(() => window.__ember.campfire.top));
await a.evaluate(() => { const e = window.__ember; e.setHour(21.5); e.teleport(2.4, 3.0, Math.PI); e.cam(2.6, 0.3, 7); }); await a.waitForTimeout(5000);
await a.screenshot({ path: '/home/claude/ember-isle/shots/c2-hour.png' });
ok('during the hour it says how long is left', /Campfire hour is on: \d+ (min|h)( \d+ min)? left/.test(await a.evaluate(() => window.__ember.campfire.top)), await a.evaluate(() => window.__ember.campfire.top));
ok('standing far from the fire does not count', (await b.evaluate(() => { const e = window.__ember; e.campShift = 0; e.campShift = e.campfire.next - e.timeNow() + 3000; e.teleport(0.5, 22, 0); return 1; })) === 1);
const s0 = await a.evaluate(() => window.__ember.campfire.secs), s1 = await b.evaluate(() => window.__ember.campfire.secs);
ok('time by the fire is what counts', s0 > 0.3 && s1 === 0, s0 + ' ' + s1);
await a.evaluate(() => { window.__ember.campSecs = 43; });      // this machine runs the game slowly: skip most of the wait
ok('sitting in at the fire earns the flame', await until(a, () => window.__ember.campfire.fires === 1, 120000), JSON.stringify(await a.evaluate(() => window.__ember.campfire)));
await b.waitForTimeout(3000);
ok('others see the flame, and the one who stayed away has none', await until(b, () => [...window.__ember.peers.values()].some((p) => p.data.fires === 1), 15000) && (await b.evaluate(() => window.__ember.campfire.fires)) === 0);
await a.waitForTimeout(3000);
ok('it is given once an hour, not twice', (await a.evaluate(() => window.__ember.campfire.fires)) === 1);
await a.screenshot({ path: '/home/claude/ember-isle/shots/c3-flame.png' });
const st = await (await fetch('http://localhost:8787/room/stats.json')).json(), day = st.days[Object.keys(st.days).sort().pop()];
ok('who came is counted, by which hour', day.campfire === 1 && (day.cf01 === 1 || day.cf13 === 1), JSON.stringify(day).slice(0, 200));
await a.evaluate(() => { const e = window.__ember; e.campShift = e.campfire.id + 3600000 - e.timeNow() + 3000 + 0; });
ok('when the hour ends it says when the next is', await until(a, () => /Campfire hour is over\. The next is at \d\d:00 UTC, in \d/.test(window.__ember.log.join(' ')), 15000));
console.log(errs.length ? [...new Set(errs)].join('|') : 'no page errors');
await browser.close();
