// Counting, calls and answers, company at the fire and the boat, and tracks. Run against the local room.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const stats = async () => { const d = await (await fetch('http://localhost:8787/room/stats.json')).json(); return { ...d, t: d.days[d.today] || {} }; };
const open = async (animal, w = 960, h = 540) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());      // nothing outside this machine: fonts and so on only slow the test
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ember.lockQuality(); localStorage.setItem('ember.starter', '4'); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; });
  await p.click(`#pick-animal button:nth-child(${animal})`);
  await p.click('#enter'); await p.waitForTimeout(4500);
  await p.evaluate(() => { const e = window.__ember; e.setHour(12); e.setRain(0); });
  return p;
};
const log = (p) => p.evaluate(() => window.__ember.log.join(' | '));
const until = async (p, fn, ms = 40000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(500); } return false; };
const t0 = Date.now();

const a = await open(3);
let s = await stats();
ok('a first visit is counted once, as a newcomer', s.t.visits === 1 && s.t.visitors === 1 && s.t.newcomers === 1 && s.t.peak === 1, JSON.stringify(s.t));
ok('the first one ashore is told so', await until(a, () => window.__ember.log.join(' ').includes('first animal ashore today')));

// Alone: a call nobody answers is picked up by the keeper.
await a.evaluate(() => { const e = window.__ember, c = e.critters.cow; const spots = [[0, 14], [10, 8], [-10, 8], [8, -10]]; const s = spots.find((q) => Math.hypot(q[0] - c.x, q[1] - c.z) > 13); e.teleport(s[0], s[1], 0); });
await a.waitForTimeout(800);
await a.evaluate(() => window.__ember.callOut());
ok('alone, the keeper answers a call', await until(a, () => window.__ember.log.join(' ').includes('the keeper lifts his head and answers you')));
await a.screenshot({ path: '/home/claude/ember-isle/shots/t1-keeper-answers.png' });

// A trail behind a walking animal.
await a.evaluate(() => { const e = window.__ember; e.teleport(0, 16, 0); e.walkTo(3, 20); });
ok('walking leaves prints', await until(a, () => window.__ember.traces.count >= 4), String(await a.evaluate(() => window.__ember.traces.count)));
await a.evaluate(() => window.__ember.cam(0.6, 0.75, 5)); await a.waitForTimeout(1500);
await a.screenshot({ path: '/home/claude/ember-isle/shots/t2-prints.png' });

const b = await open(6);
s = await stats();
ok('a second visitor is counted, and the peak is two', s.t.visitors === 2 && s.t.peak === 2 && s.ashore === 2, JSON.stringify(s.t));
ok('the second is told another has been here', await until(b, () => window.__ember.log.join(' ').includes('One other animal has been here today')));
await until(b, () => window.__ember.peers.size === 1); await until(a, () => window.__ember.peers.size === 1);

// Call and answer.
await a.evaluate(() => window.__ember.teleport(2, 14, 0)); await b.evaluate(() => window.__ember.teleport(4, 14, 0));
await a.waitForTimeout(2500);
await a.evaluate(() => window.__ember.callOut());
const prompted = await until(b, () => (window.__ember.actions[0] || '').startsWith('Answer '), 15000);
ok('hearing a call offers to answer it', prompted, JSON.stringify(await b.evaluate(() => window.__ember.actions)));
await b.screenshot({ path: '/home/claude/ember-isle/shots/t3-answer.png' });
await b.evaluate(() => window.__ember.run(0));
ok('the answerer is told', await until(b, () => window.__ember.log.join(' ').includes('You answer ')));
ok('the caller hears the answer', await until(a, () => window.__ember.log.join(' ').includes('answers your call')));
ok('and the keeper stays quiet when an animal answered', !(await a.evaluate(() => window.__ember.lonely)));
s = await stats();
ok('the answer is counted', s.t.answer === 1, JSON.stringify(s.t));

// Driftwood counts twice with company.
const site = await a.evaluate(() => { const y = window.__ember.yard.site; return [y.x, y.z]; });
await a.evaluate((q) => { const e = window.__ember; e.teleport(q[0] + 2.2, q[1] + 1.2); e.setHeld(3); }, site);
await b.evaluate((q) => window.__ember.teleport(q[0] + 3.4, q[1] + 2.4), site);
await a.waitForTimeout(3000);
const before = await a.evaluate(() => window.__ember.boat);
await a.evaluate(() => window.__ember.addToBoat());
ok('with company the driftwood counts twice', await until(a, () => window.__ember.log.join(' ').includes('the driftwood counts twice')), 'boat ' + before + ' → ' + (await a.evaluate(() => window.__ember.boat)));
ok('the companion is told', await until(b, () => window.__ember.log.join(' ').includes('company at the boat')));
s = await stats();
ok('and it is counted', s.t.duo === 1);

// Warmer together.
await a.evaluate(() => { const e = window.__ember; e.teleport(2.0, -1.6, 0); e.warmth = 0; });
await b.evaluate(() => { const e = window.__ember; e.teleport(-2.0, 1.6, 0); });
await a.waitForTimeout(1500);
await b.evaluate(() => { const e = window.__ember; e.run(e.actions.findIndex((x) => x && /by the fire/.test(x))); });
await a.evaluate(() => { const e = window.__ember; e.run(e.actions.findIndex((x) => x && /by the fire/.test(x))); });
ok('resting by the fire with company warms faster', await until(a, () => window.__ember.log.join(' ').includes('twice as fast in company')), await a.evaluate(() => JSON.stringify(window.__ember.actions)));
await a.screenshot({ path: '/home/claude/ember-isle/shots/t4-fire.png' });

// Leaving after a real stay leaves tracks for the next to find.
await a.evaluate(() => { const e = window.__ember; e.standUp(); e.teleport(1, 15, 0); });
const wait = 52000 - (Date.now() - t0); if (wait > 0) await a.waitForTimeout(wait);
await a.waitForTimeout(6500);
await a.click('#btn-leave'); await a.waitForTimeout(1500);
s = await stats();
ok('the stay is counted, with company', s.t.stays === 1 && s.t.met === 1 && s.t.left === 1 && s.t.stay_secs > 40, JSON.stringify(s.t));
await a.context().close(); await b.context().close(); await new Promise((r) => setTimeout(r, 1500));
const c = await open(1, 1280, 720);
const all = await c.evaluate(() => window.__ember.traces.left);
const left = all.filter((q) => Math.hypot(q.x - 1, q.z - 15) < 1.5);
ok('the next visitor finds the tracks', left.length === 1, JSON.stringify(all));
ok('and is told about them', await until(c, () => window.__ember.log.join(' ').includes('tracks are still on the ground')), await log(c));
await c.evaluate((tr) => { const e = window.__ember; e.teleport(tr.x + 1.2, tr.z + 0.8, 0); e.cam(0.5, 0.8, 5); }, left[0]);
ok('near them, sniffing is offered', await until(c, () => window.__ember.actions.includes('Sniff at the tracks'), 10000), JSON.stringify(await c.evaluate(() => window.__ember.actions)));
await c.screenshot({ path: '/home/claude/ember-isle/shots/t5-tracks.png' });
await c.evaluate(() => { const e = window.__ember; e.run(e.actions.indexOf('Sniff at the tracks')); });
ok('sniffing says who it was', await until(c, () => / was here (just now|\d+ minutes ago)/.test(window.__ember.log.join(' '))), (await log(c)).slice(-140));
s = await stats();
ok('three visitors today, sniff counted', s.t.visitors === 3 && s.t.sniff === 1, JSON.stringify(s.t));

// The numbers page.
const pg = await (await browser.newContext({ viewport: { width: 1100, height: 1500 } })).newPage();
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('http://localhost:8787/room/stats'); await pg.waitForTimeout(2500);
const txt = await pg.evaluate(() => document.body.innerText);
ok('the numbers page shows today', /3\s*animals have come ashore today/.test(txt) && txt.includes('Calls answered by another animal') && txt.includes('Busiest hours'), txt.slice(0, 160).replace(/\n/g, ' / '));
await pg.screenshot({ path: '/home/claude/ember-isle/shots/t6-stats.png', fullPage: true });
await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(600);
await pg.screenshot({ path: '/home/claude/ember-isle/shots/t7-stats-phone.png', fullPage: true });
console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
await browser.close();
