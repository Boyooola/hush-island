// Leaving, choosing an animal, falling asleep, and being moved on when someone is waiting.
// Run against the local room with space for one and a five-second sleep limit.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [];
const open = async () => { const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message)); await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(2500); await p.evaluate(() => window.__ember.lockQuality()); return p; };
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const status = async () => (await fetch('http://localhost:8787/room/status.json')).json();
const a = await open();
// Picker.
const names = await a.evaluate(() => [...document.querySelectorAll('#pick-animal button')].map((b) => b.textContent));
ok('eight animals to choose from', names.length === 8 && !names.includes('Cow'), names.join(' '));
await a.click('#pick-animal button:nth-child(4)');
await a.waitForTimeout(600);
const id1 = await a.evaluate(() => ({ ...window.__ember.identity, shown: document.getElementById('who-name').textContent, coats: document.querySelectorAll('#pick-coat button').length }));
ok('choosing Wolf makes you a wolf and keeps your first name', id1.species === 3 && id1.name.endsWith('Wolf') && id1.shown === id1.name, JSON.stringify(id1));
await a.click('#pick-coat button:nth-child(2)');
await a.waitForTimeout(400);
ok('choosing a coat changes it', (await a.evaluate(() => window.__ember.identity.palette)) === 1);
const before = id1.name;
await a.click('#reroll'); await a.waitForTimeout(300);
const id2 = await a.evaluate(() => window.__ember.identity);
ok('another name keeps the animal', id2.species === 3 && id2.name !== before && id2.name.endsWith('Wolf'), id2.name);
await a.screenshot({ path: '/home/claude/ember-isle/shots/lv1-picker.png' });
// Ashore, then leave.
await a.click('#enter'); await a.waitForTimeout(3500);
ok('ashore', await a.evaluate(() => document.body.classList.contains('playing')) && (await status()).ashore === 1, JSON.stringify(await status()));
await a.click('#btn-leave'); await a.waitForTimeout(2500);
const left = await a.evaluate(() => ({ playing: document.body.classList.contains('playing'), hint: document.getElementById('hint').textContent, btn: document.getElementById('enter').textContent, picker: !document.getElementById('picker').hidden }));
ok('leaving returns to the title screen', !left.playing && left.picker && left.hint.includes('left the island'), JSON.stringify(left));
ok('and frees the place', (await status()).ashore === 0, JSON.stringify(await status()));
await a.screenshot({ path: '/home/claude/ember-isle/shots/lv2-left.png' });
await a.click('#pick-animal button:nth-child(1)'); await a.waitForTimeout(400);
await a.click('#enter'); await a.waitForTimeout(3500);
ok('back ashore as a different animal', await a.evaluate(() => document.body.classList.contains('playing') && window.__ember.me.species === 0) && (await status()).ashore === 1);
// Asleep.
await a.evaluate(() => { window.__ember.idleAfter = 1500; });
await a.waitForTimeout(9500);
const nap = await a.evaluate(() => ({ asleep: window.__ember.asleep, mode: window.__ember.me.mode, tag: window.__ember.me.sub }));
ok('left alone, the animal lies down asleep and its tag says so', nap.asleep && nap.mode === 'lie' && nap.tag.includes('§z'), JSON.stringify(nap));
await a.screenshot({ path: '/home/claude/ember-isle/shots/lv3-asleep.png' });
// Someone arrives while the island (room for one) is full.
const b = await open();
await b.bringToFront(); await b.click('#enter'); await b.waitForTimeout(2500);
ok('newcomer waits', !(await b.evaluate(() => document.body.classList.contains('playing'))) && (await status()).waiting === 1, JSON.stringify(await status()));
for (let i = 0; i < 24 && !(await b.evaluate(() => document.body.classList.contains('playing'))); i++) await b.waitForTimeout(1000);
ok('the sleeper is carried out and the newcomer comes ashore', await b.evaluate(() => document.body.classList.contains('playing')), JSON.stringify(await status()));
await a.bringToFront(); await a.waitForTimeout(1500);
const out = await a.evaluate(() => ({ playing: document.body.classList.contains('playing'), hint: document.getElementById('hint').textContent }));
ok('the sleeper is told what happened', !out.playing && out.hint.includes('tide'), JSON.stringify(out));
await a.screenshot({ path: '/home/claude/ember-isle/shots/lv4-tide.png' });
// Awake animals are never moved.
await a.click('#enter'); await a.waitForTimeout(2500);
ok('the one moved on now waits in turn', !(await a.evaluate(() => document.body.classList.contains('playing'))) && (await status()).waiting === 1, JSON.stringify(await status()));
await b.bringToFront();
for (let i = 0; i < 8; i++) { await b.mouse.click(640, 300); await b.waitForTimeout(1000); }
ok('someone awake keeps their place however long the line', await b.evaluate(() => document.body.classList.contains('playing') && !window.__ember.asleep), JSON.stringify(await status()));
console.log(errs.length ? errs.slice(0, 3).join('\n') : 'no page errors');
await browser.close(); process.exit(0);
