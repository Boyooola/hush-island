// Tag with the keeper: alone, and then with a second visitor who must see the same chase.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const open = async (animal, w = 640, h = 360) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.setItem('ember.starter', '4'));
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; window.__ember.tagTime = 900; });
  await p.click(`#pick-animal button:nth-child(${animal})`);
  await p.click('#enter'); await p.waitForTimeout(4500);
  await p.evaluate(() => { const e = window.__ember; e.setHour(12); e.setRain(0); });
  return p;
};
const until = async (p, fn, ms = 30000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const has = (p, text, ms) => until(p, (x) => window.__ember.log.join(' ').includes(x), ms, text);
const kpos = (p) => p.evaluate(() => { const k = window.__ember.keeper; return [k.x, k.z, k.mode]; });
const nearKeeper = (p, d = 1.9) => p.evaluate((d) => { const e = window.__ember, k = e.keeper, r = Math.hypot(k.x, k.z) || 1; e.teleport(k.x * (1 + d / r), k.z * (1 + d / r)); }, d);
const a = await open(4, 1280, 720);
const home = await kpos(a);
await nearKeeper(a); await a.waitForTimeout(1000);
ok('beside the keeper you can ask him to play', (await a.evaluate(() => window.__ember.actions)).includes('Ask the Keeper to play tag'), JSON.stringify(await a.evaluate(() => window.__ember.actions)));
await a.evaluate(() => { const e = window.__ember; e.run(e.actions.indexOf('Ask the Keeper to play tag')); });
ok('he gets up, the game is on and you are it', await until(a, () => { const e = window.__ember; return e.game > 0 && e.it === 'me' && e.keeperLoose && e.keeper.mode === 'stand'; }) && await has(a, 'The keeper gets to his feet'));
// Chase him: he should run.
await a.evaluate(() => window.__ember.cam(0.6, 0.5, 9));
let moved = 0;
for (let i = 0; i < 12 && moved < 4; i++) { await a.evaluate(() => { const e = window.__ember, k = e.keeper; e.walkTo(k.x, k.z); }); await a.waitForTimeout(1000); const k = await kpos(a); moved = Math.hypot(k[0] - home[0], k[1] - home[1]); }
ok('chased, he runs from you', moved >= 4, moved.toFixed(1) + ' m from the fire');
await a.screenshot({ path: '/home/claude/ember-isle/shots/k1-chase.png' });
const k1 = await kpos(a);
ok('he stays on dry land', await a.evaluate(() => { const e = window.__ember; return e.world.surface(e.keeper.x, e.keeper.z) !== 'water'; }));
// A second visitor sees him in the same place and can join.
const b = await open(6);
await until(b, () => window.__ember.peers.size === 1);
ok('a second visitor sees the game and the keeper out of his seat', await until(b, () => window.__ember.seenGame > 0 && window.__ember.keeperLoose && window.__ember.K.data.game > 0));
const same = async () => { const [ka, kb] = [await kpos(a), await kpos(b)]; return Math.hypot(ka[0] - kb[0], ka[1] - kb[1]); };
await a.waitForTimeout(2000);
ok('both see him in the same place', (await same()) < 2.5, (await same()).toFixed(2) + ' m apart');
await b.click('#game-btn');
ok('the second joins: three playing', await until(a, () => /3 playing/.test(document.getElementById('game').innerText)), await a.evaluate(() => document.getElementById('game').innerText.replace(/\s+/g, ' ')));
// Catch him.
await nearKeeper(a, 1.6);
ok('close enough, you can tag him', await until(a, () => window.__ember.actions[0] === 'Tag the keeper', 15000), JSON.stringify(await a.evaluate(() => window.__ember.actions)));
await a.evaluate(() => window.__ember.run(0));
ok('tagged, the keeper is it for everyone', await until(a, () => window.__ember.it === 'keeper') && await until(b, () => window.__ember.it === 'keeper') && await has(b, 'The keeper is it'));
await a.waitForTimeout(600); await a.screenshot({ path: '/home/claude/ember-isle/shots/k2-keeper-it.png' });
// He chases and tags someone back.
await a.evaluate(() => window.__ember.teleport(8, 14)); await b.evaluate(() => window.__ember.teleport(9.5, 14));
const caught = await until(a, () => window.__ember.it && window.__ember.it !== 'keeper', 120000);
if (!caught) console.log('keeper at', JSON.stringify(await kpos(a)), 'a at', JSON.stringify(await a.evaluate(() => [window.__ember.me.x, window.__ember.me.z, window.__ember.me.mode])), 'K', JSON.stringify(await a.evaluate(() => window.__ember.K.data)));
const who = [await a.evaluate(() => window.__ember.it), await b.evaluate(() => window.__ember.it)];
ok('he chases and tags someone back', caught && who.includes('me'), JSON.stringify(who));
ok('the one he caught is told', (await has(a, 'The keeper tagged you', 5000)) || (await has(b, 'The keeper tagged you', 5000)));
// The one moving him leaves: the other carries on.
await a.click('#btn-leave'); await b.waitForTimeout(3000);
const p1 = await kpos(b);
ok('when the first player leaves, the game goes on for the other', (await b.evaluate(() => window.__ember.game)) > 0 && (await b.evaluate(() => window.__ember.keeperLoose)), JSON.stringify(p1));
// Time runs out: he goes home.
await b.evaluate(() => { window.__ember.tagTime = 1; });
ok('when time is up he walks back to the fire and lies down', await until(b, () => { const e = window.__ember; return !e.keeperLoose && e.keeper.mode === 'lie'; }, 180000) && Math.hypot((await kpos(b))[0] - home[0], (await kpos(b))[1] - home[1]) < 0.5, JSON.stringify(await kpos(b)));
console.log('state', JSON.stringify(await b.evaluate(() => window.__ember.keeperState)));
await nearKeeper(b); await b.waitForTimeout(1500);
await b.evaluate(() => { const e = window.__ember; e.tagTime = 900; const i = e.actions.indexOf('Ask the Keeper to play tag'); if (i >= 0) e.run(i); });
ok('asked again straight away, he wants a rest', await has(b, 'Let me get my breath back first', 8000), JSON.stringify(await b.evaluate(() => window.__ember.actions)));
console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
await browser.close();
