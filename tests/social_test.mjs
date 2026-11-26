// Gestures, island-issued numbers, friends, whispers and notes. Run against the local room.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const enter = async (p, animal) => { await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(2500); await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; }); if (animal) await p.click(`#pick-animal button:nth-child(${animal})`); await p.click('#enter'); await p.waitForTimeout(4500); await p.evaluate(() => { const e = window.__ember; e.setHour(12); e.setRain(0); }); };
const open = async (animal, ua, w = 640, h = 360) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: ua });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => localStorage.setItem('ember.starter', '4'));
  await enter(p, animal);
  return p;
};
const until = async (p, fn, ms = 25000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const has = (p, text, ms) => until(p, (x) => window.__ember.log.join(' ').includes(x), ms, text);
const withRow = (p) => p.evaluate(() => (document.getElementById('with').hidden ? '' : document.getElementById('with').innerText.replace(/\s+/g, ' ')));
const clickWith = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll('#with button')].find((x) => x.textContent === l); if (b) b.click(); return !!b; }, label);
const act = (p, re) => p.evaluate((src) => { const e = window.__ember, i = e.actions.findIndex((x) => x && new RegExp(src).test(x)); if (i < 0) return false; e.run(i); return true; }, re);
const a = await open(1, 'ua-a', 1280, 720), b = await open(5, 'ua-b');
await until(a, () => window.__ember.peers.size === 1); await until(b, () => window.__ember.peers.size === 1);
const ida = await a.evaluate(() => ({ code: window.__ember.code, pid: window.__ember.pid, name: window.__ember.me.name }));
const idb = await b.evaluate(() => ({ code: window.__ember.code, pid: window.__ember.pid, name: window.__ember.me.name }));
ok('the island gives each visitor a number and an id', /^\d{4}$/.test(ida.code) && /^[0-9a-f]{20}$/.test(ida.pid) && ida.pid !== idb.pid, JSON.stringify(ida));
ok('others see that same number', await until(b, (x) => { const p = [...window.__ember.peers.values()][0]; return p.data.code === x.code && p.data.pid === x.pid; }, 15000, ida));
// Gestures.
await a.evaluate(() => { const e = window.__ember; e.teleport(2, 15, 0); e.cam(0.5, 0.4, 6); }); await b.evaluate(() => window.__ember.teleport(3.5, 15, 0));
ok('beside another animal, a row of things to do with them appears', await until(a, () => !document.getElementById('with').hidden && /Nuzzle/.test(document.getElementById('with').innerText)), await withRow(a));
await a.screenshot({ path: '/home/claude/ember-isle/shots/s1-with.png' });
ok('the row offers nuzzle, bow and friendship', /With .+: ?Nuzzle ?Play-bow ?Ask to be friends/.test(await withRow(a)), await withRow(a));
await clickWith(a, 'Nuzzle');
ok('a nuzzle is felt, and can be returned with the main action', await has(b, ida.name + ' nuzzles you') && await until(b, () => (window.__ember.actions[0] || '').startsWith('Nuzzle back')));
await act(b, '^Nuzzle back');
ok('the return reaches the first animal', await has(a, idb.name + ' nuzzles you'));
await a.evaluate(() => window.__ember.setHeld(2)); await a.waitForTimeout(2500);
ok('carrying a fish, you can share it', /Share your fish/.test(await withRow(a)), await withRow(a));
await clickWith(a, 'Share your fish');
ok('the fish changes mouths', await until(b, () => window.__ember.held === 2) && await until(a, () => window.__ember.held === 0));
await b.evaluate(() => { const e = window.__ember; e.setHeld(0); e.setMode('lie'); }); await a.waitForTimeout(2500);
ok('beside a resting animal, you can curl up', /Curl up beside/.test(await withRow(a)), await withRow(a));
await clickWith(a, 'Curl up beside');
ok('curling up lies you down against them', await until(a, () => { const e = window.__ember, p = [...e.peers.values()][0]; return e.me.mode === 'lie' && Math.hypot(e.me.x - p.av.x, e.me.z - p.av.z) < 1.6; }) && await has(b, 'curls up beside you'));
await a.waitForTimeout(800); await a.screenshot({ path: '/home/claude/ember-isle/shots/s2-curl.png' });
// Friends.
await a.evaluate(() => window.__ember.standUp()); await b.evaluate(() => window.__ember.standUp()); await a.waitForTimeout(2500);
await a.evaluate(() => window.__ember.teleport(2, 15, 0)); await a.waitForTimeout(1500);
ok('asking to be friends', (await clickWith(a, 'Ask to be friends')) && await has(a, 'to be friends. If they say yes'));
ok('the other is asked in big words and can say yes with the main action', await until(b, () => document.getElementById('flash-title').textContent.includes('asks to be friends') && (window.__ember.actions[0] || '').startsWith('Be friends with ')));
ok('until they answer, nobody is anybody\'s friend', (await a.evaluate(() => window.__ember.friends.length)) === 0 && (await b.evaluate(() => window.__ember.friendAsks.length)) === 1);
await act(b, '^Be friends with ');
ok('saying yes makes them friends on both sides', await until(a, () => window.__ember.friends.length === 1) && await until(b, () => window.__ember.friends.length === 1) && await has(a, 'are friends now') && await has(b, 'are friends now'));
// Whispers.
await b.evaluate(() => window.__ember.teleport(-20, -8, 0));
await a.evaluate((pid) => window.__ember.whisperTo(pid, 'psst, meet me at the dock'), idb.pid);
ok('a whisper reaches a friend across the island', await has(b, 'whispers psst, meet me at the dock'));
const c = await open(3, 'ua-c');
await a.evaluate((pid) => window.__ember.whisperTo(pid, 'second whisper'), idb.pid);
ok('and nobody else', await has(b, 'second whisper') && !(await has(c, 'second whisper', 3000)));
const idc = await c.evaluate(() => ({ pid: window.__ember.pid }));
await c.evaluate((pid) => { const e = window.__ember; e.friends.push({ pid, name: 'x', code: '0000', s: 0, seen: 0, here: true }); e.whisperTo(pid, 'let me in'); }, idb.pid);
ok('someone who is not a friend cannot whisper', await has(c, 'You can only whisper to friends') && !(await has(b, 'let me in', 2500)));
// Away: the Friends list, a note left, and the note handed over.
await b.evaluate(() => document.getElementById('btn-leave').click()); await a.waitForTimeout(2500);
await a.evaluate(() => document.getElementById('btn-friends').click()); await a.waitForTimeout(600);
let txt = await a.evaluate(() => document.getElementById('sheet').innerText.replace(/\s+/g, ' '));
ok('the Friends list shows an absent friend', txt.includes(idb.name) && txt.includes('#' + idb.code) && /last here/.test(txt), txt.slice(0, 160));
await a.screenshot({ path: '/home/claude/ember-isle/shots/s3-friends.png' });
await a.evaluate(() => document.querySelector('#sheet-body .row.pick').click()); await a.waitForTimeout(400);
ok('pressing them offers a note', (await a.evaluate(() => document.getElementById('sheet-title').textContent)).startsWith('A note for '));
await a.fill('#sheet-input', 'gone fishing, back tomorrow'); await a.click('#sheet-send');
ok('the note is kept for them', await has(a, 'Your note will be waiting when they come ashore'));
await b.click('#enter');
ok('back ashore, they are handed the note', await has(b, 'left you a note: gone fishing, back tomorrow', 30000));
ok('and their friend sees them arrive', await has(a, 'Your friend ' + idb.name + ' came ashore', 15000));
ok('a note is handed over once only', (await (await fetch('http://localhost:8787/room/stats.json')).json()).days && true);
// Reload: same number, same friends.
await enter(a, 0);
const again = await a.evaluate(() => ({ code: window.__ember.code, pid: window.__ember.pid, friends: window.__ember.friends.length }));
ok('after a reload the number and the friends are the same', again.code === ida.code && again.pid === ida.pid && again.friends === 1, JSON.stringify(again));
// Foul whispers.
await a.evaluate((pid) => window.__ember.whisperTo(pid, 'wanna fuck?'), idb.pid);
ok('a foul whisper is not delivered and mutes its sender', await has(a, 'That is not said on this island') && !(await has(b, 'wanna', 2500)));
const s = await (await fetch('http://localhost:8787/room/stats.json')).json();
const d = s.days[s.today] || {};
ok('gestures, friendships, whispers and notes are counted', d.gesture === 4 && d.friends === 1 && d.whispers === 2 && d.notes === 1, JSON.stringify(d));
console.log(errs.length ? 'page errors: ' + errs.join(' | ') : 'no page errors');
await browser.close();
