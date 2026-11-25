// Keeping the peace, as two visitors see it. Run against the local room.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const enter = async (p, animal) => {
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; });
  if (animal) await p.click(`#pick-animal button:nth-child(${animal})`);
  await p.click('#enter'); await p.waitForTimeout(4500);
  await p.evaluate(() => { const e = window.__ember; e.setHour(12); e.setRain(0); });
};
const open = async (animal, ua) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, userAgent: ua });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.setItem('ember.starter', '4'));
  await enter(p, animal);
  return p;
};
const until = async (p, fn, ms = 25000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const has = (p, text, ms) => until(p, (x) => window.__ember.log.join(' ').includes(x), ms, text);
const say = async (p, text) => { await p.evaluate((x) => window.__ember.sendChat(x), text); await p.waitForTimeout(1300); };
const a = await open(4, 'test-browser-A'), b = await open(5, 'test-browser-B');
await until(a, () => window.__ember.peers.size === 1); await until(b, () => window.__ember.peers.size === 1);
await a.evaluate(() => window.__ember.teleport(2, 15, 0)); await b.evaluate(() => window.__ember.teleport(3.8, 15, 0)); await a.waitForTimeout(2500);
const aName = await a.evaluate(() => window.__ember.me.name);
await say(a, 'hello there');
ok('ordinary talk is heard', await has(b, 'hello there'));
// Stop hearing, and hear again.
await b.click('#log b.whom');
ok('pressing a name opens that visitor', (await b.evaluate(() => document.getElementById('sheet-title').textContent)).startsWith(aName + ' #') && (await b.evaluate(() => document.getElementById('sheet').innerText)).includes('hello there'));
await b.screenshot({ path: '/home/claude/ember-isle/shots/m1-visitor.png' });
await b.click('#sheet-extra'); await say(a, 'second line');
ok('after "stop hearing", nothing more from them', !(await has(b, 'second line', 3000)) && await has(b, 'They are not told'));
await b.evaluate(() => { const e = window.__ember; e.openVisitor([...e.peers.keys()][0]); }); await b.click('#sheet-extra'); await say(a, 'third line');
ok('and they can be heard again', await has(b, 'third line'));
// Words not said here.
await say(a, 'wanna fuck?');
ok('the sender is told and muted', await has(a, 'That is not said on this island. You are muted for 10 minutes') && (await a.evaluate(() => window.__ember.mutedUntil)) > Date.now());
ok('their own tag says muted', /§m/.test(await a.evaluate(() => window.__ember.me.sub)) && (await a.evaluate(() => window.__ember.me.sub)).includes('·'), await a.evaluate(() => window.__ember.me.sub));
ok('the words reach nobody', !(await has(b, 'wanna', 3000)));
ok('others see them as muted', await until(b, () => { const p = [...window.__ember.peers.values()][0]; return p.data.muted > Date.now() && /§m.+·/.test(p.av.sub); }));
await b.evaluate(() => window.__ember.cam(0.4, 0.3, 4.5)); await b.waitForTimeout(1200);
await b.screenshot({ path: '/home/claude/ember-isle/shots/m2-muted.png' });
await say(a, 'hello?');
ok('while muted, talk goes nowhere and they are told why', await has(a, 'You are muted, so nobody would hear that') && !(await has(b, 'hello?', 3000)));
await say(b, 'oh shit');
ok('milder swearing is just not sent', await has(b, 'Gently, please') && (await b.evaluate(() => window.__ember.mutedUntil)) === 0);
// Report.
await b.evaluate(() => { const e = window.__ember; e.openVisitor([...e.peers.keys()][0]); });
await b.fill('#sheet-input', 'said something gross to me'); await b.click('#sheet-send');
ok('the reporter is thanked', await has(b, 'The keeper will read your report'));
await b.waitForTimeout(800);
const d = await (await fetch('http://localhost:8787/room/reports.json', { headers: { 'x-keeper-key': 'testkey' } })).json();
ok('the keeper gets the report with the lines the island heard', d.reports.length === 1 && d.reports[0].who.startsWith(aName + ' #') && d.reports[0].sure && d.reports[0].lines.includes('third line') && d.reports[0].note === 'said something gross to me', JSON.stringify(d.reports));
// A reload does not lift the mute.
await a.evaluate(() => localStorage.removeItem('ember.mute'));
await enter(a, 0);
ok('reloading, even with the browser\'s memory wiped, does not lift the mute', (await a.evaluate(() => window.__ember.mutedUntil)) > Date.now() && /§m/.test(await a.evaluate(() => window.__ember.me.sub)), await a.evaluate(() => window.__ember.me.sub));
// The keeper's page.
const pg = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
await pg.route((u) => new URL(u).hostname !== 'localhost', (r) => r.abort());
await pg.goto('http://localhost:8787/room/reports'); await pg.waitForTimeout(800);
await pg.fill('#key', 'wrong'); await pg.click('#door button'); await pg.waitForTimeout(800);
ok('a wrong key is refused', (await pg.evaluate(() => document.getElementById('state').textContent)).includes('does not open'));
await pg.fill('#key', 'testkey'); await pg.click('#door button'); await pg.waitForTimeout(1000);
const txt = await pg.evaluate(() => document.body.innerText);
ok('the right key shows the report', txt.includes(aName + ' #') && txt.includes('third line') && txt.includes('Muted now'), txt.slice(0, 200).replace(/\n+/g, ' / '));
await pg.screenshot({ path: '/home/claude/ember-isle/shots/m3-reports.png', fullPage: true });
console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
await browser.close();
