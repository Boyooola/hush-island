// A game of tag between two visitors, watched by a third. Run against the local room.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
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
const until = async (p, fn, ms = 30000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const has = (p, text) => until(p, (x) => window.__ember.log.join(' ').includes(x), 30000, text);
const acts = (p) => p.evaluate(() => JSON.stringify(window.__ember.actions));
const a = await open(1, 640, 360), b = await open(6, 640, 360);
await until(a, () => window.__ember.peers.size === 1); await until(b, () => window.__ember.peers.size === 1);
await a.evaluate(() => window.__ember.teleport(2, 15, 0)); await b.evaluate(() => window.__ember.teleport(3.6, 15, 0));
ok('next to another animal, tag is offered beside the greeting', await until(a, () => { const x = window.__ember.actions; return x[0] && x[0].startsWith('Greet ') && x[1] && x[1].startsWith('Play tag with '); }), await acts(a));
await a.screenshot({ path: '/home/claude/ember-isle/shots/tag1-offer.png' });
await a.evaluate(() => window.__ember.run(1));
ok('the one who starts is told to run', await has(a, 'a game of tag is on. Run!'));
ok('the tagged one is told they are it', await has(b, 'tagged you. You are it!'));
ok('and knows it', await until(b, () => window.__ember.it === 'me'));
ok('the other sees who is it', await until(a, () => { const e = window.__ember; return e.it && e.it !== 'me' && e.peers.get(e.it) && e.peers.get(e.it).data.sub.startsWith('it!'); }));
ok('the guide points the chaser at the runner', await until(b, () => window.__ember.goal && window.__ember.goal.text.startsWith('You are it. Catch')), JSON.stringify(await b.evaluate(() => window.__ember.goal)));
ok('the starter cannot tag while someone else is it', !/Play tag|"Tag /.test(await acts(a)), await acts(a));
await b.waitForTimeout(1200);
await b.screenshot({ path: '/home/claude/ember-isle/shots/tag2-it.png' });
// A third arrives mid-game and sees the state.
const c = await open(3, 640, 360);
ok('a latecomer sees who is it', await until(c, () => { const e = window.__ember; return e.peers.size === 2 && e.it && e.it !== 'me'; }));
// After the grace, the chaser tags back.
ok('after a breath, the chaser can tag', await until(b, () => (window.__ember.actions[0] || '').startsWith('Tag ')), await acts(b));
await b.evaluate(() => window.__ember.run(0));
ok('it passes on', await has(a, 'tagged you. You are it!') && await until(a, () => window.__ember.it === 'me') && await until(b, () => window.__ember.it && window.__ember.it !== 'me'));
ok('the onlooker is told', await has(c, ' is it.'), (await c.evaluate(() => window.__ember.log.join(' | '))).slice(-160));
// Resting is safe.
await b.evaluate(() => window.__ember.setMode('lie')); await a.waitForTimeout(4500);
ok('a resting animal cannot be tagged', !/Play tag|"Tag /.test(await acts(a)), await acts(a));
ok('and the guide looks for someone else', await until(a, () => window.__ember.goal && /You are it/.test(window.__ember.goal.text)), JSON.stringify(await a.evaluate(() => window.__ember.goal)));
// It lapses when nobody is caught.
await a.evaluate(() => { window.__ember.tagTime = 3; });
ok('with nobody caught the game lapses', await has(a, 'Nobody was caught, so the game of tag is over.') && await until(a, () => window.__ember.it === null));
ok('and the others hear it is over', await has(b, 'The game of tag is over.'));
const s = await (await fetch('http://localhost:8787/room/stats.json')).json();
ok('tags are counted', (s.days[s.today] || {}).tag === 2, JSON.stringify(s.days[s.today]));
console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
await browser.close();
