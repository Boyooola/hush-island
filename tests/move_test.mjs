// Moving out of Supabase: the room copies everything across once, and a returning guest keeps who they were.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const M = 'http://localhost:8799', R = 'http://localhost:8787';
const md5uid = (n) => { const h = crypto.createHash('md5').update(n).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const person = (k) => { const d = crypto.createHash('sha256').update('hush-island:person:' + k).digest(); return { pid: d.subarray(0, 10).toString('hex'), code: String(1000 + (((d[10] << 16) | (d[11] << 8) | d[12]) % 9000)) }; };
const ann = person('guest:' + md5uid('ann')), bob = person('guest:' + md5uid('bob'));
const uuid = () => crypto.randomUUID();
const now = Date.now();
const boat = []; for (let i = 0; i < 61; i++) boat.push({ id: uuid(), at: now - 100000 + i, d: { n: i === 60 ? 1 : 2, name: 'Old Hand ' + (i % 5), code: '1234', at: now - 100000 + i, by: 'x' } });      // 121 planks
const seed = {
  boat, carvings: [{ id: uuid(), at: now - 5000, d: { text: 'we were here', name: 'Ann', at: now - 5000, by: 'x' } }],
  bottles: [{ id: uuid(), at: now - 4000, d: { text: 'hello from before', name: 'Bob', at: now - 4000, from: md5uid('bob'), state: 'adrift' } }],
  profiles: [{ pid: ann.pid, guest_id: md5uid('ann'), name: 'Ann Otter', code: ann.code, species: 2, seen: new Date(now - 60000).toISOString() }, { pid: bob.pid, guest_id: md5uid('bob'), name: 'Bob Fox', code: bob.code, species: 1, seen: new Date(now - 90000).toISOString() }],
  friends: [{ a: ann.pid, b: bob.pid, at: new Date(now - 80000).toISOString() }, { a: bob.pid, b: ann.pid, at: new Date(now - 80000).toISOString() }],
  friend_asks: [], friend_notes: [{ id: 1, dest: ann.pid, src: bob.pid, name: 'Bob Fox', body: 'see you at the fire', at: new Date(now - 70000).toISOString() }], feedback: [{ id: 1, at: new Date(now - 60000).toISOString(), who: 'Ann', h: 'h1', body: 'lovely island' }], reports: [],
};
console.log('seed', await (await fetch(M + '/_seed', { method: 'POST', body: JSON.stringify(seed) })).text());
const db = async (body) => { const r = await fetch(R + '/room/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
let [st, got] = await db({ op: 'list', coll: 'boat', order: ['at', 'desc'], lim: 1000 });
ok('the planks came across', st === 200 && got.rows.length === 61 && got.rows.reduce((s, r) => s + r[1].n, 0) === 121, st + ' ' + (got.rows || []).length);
[st, got] = await db({ op: 'list', coll: 'bottles', filters: [['state', '==', 'adrift']], lim: 30 });
ok('and the bottles, findable by their state', st === 200 && got.rows.length === 1 && got.rows[0][1].text === 'hello from before');
const bottle = got.rows[0][0];
ok('the rules hold: a plank of the wrong size is refused', (await db({ op: 'put', coll: 'boat', id: uuid(), data: { n: 50 } }))[0] === 403);
ok('a mark with words not said here is refused', (await db({ op: 'put', coll: 'carvings', id: uuid(), data: { text: 'fuck this', name: 'x' } }))[0] === 403);
ok('nothing but the three collections', (await db({ op: 'list', coll: 'people' }))[0] === 404);
ok('a bottle can be answered once', (await db({ op: 'patch', coll: 'bottles', id: bottle, data: { state: 'replied', reply: 'hello back', replyName: 'Cy' } }))[0] === 200 && (await db({ op: 'patch', coll: 'bottles', id: bottle, data: { state: 'replied', reply: 'again' } }))[0] === 403);
ok('and thrown away once answered', (await db({ op: 'del', coll: 'bottles', id: bottle }))[0] === 200 && (await db({ op: 'one', coll: 'bottles', id: bottle }))[1].d === null);
const kp = await (await fetch(R + '/room/reports.json', { headers: { 'x-keeper-key': 'testkey' } })).json();
ok('feedback from before is on the keeper\'s page', kp.feedback && kp.feedback.some((f) => f.text === 'lovely island'), JSON.stringify(kp).slice(0, 200));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errs = [], outside = [];
const open = async (guestName) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => { outside.push(r.request().url()); r.abort(); });
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(R + '/index.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000);
  await p.evaluate(([g, uid]) => { localStorage.setItem('ember.starter', '4'); if (g) localStorage.setItem('hush.guest', JSON.stringify({ access_token: 'x'.repeat(48) + '.y.guest-' + g, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3000, user: { id: uid } })); }, [guestName, guestName ? md5uid(guestName) : '']);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__ember.lockQuality(); window.__ember.idleAfter = 3600000; });
  await p.click('#enter'); await p.waitForTimeout(6000);
  return p;
};
const until = async (p, fn, ms = 20000, arg) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(400); } return false; };
const a = await open('ann');
const me = await a.evaluate(() => ({ code: window.__ember.code, kept: localStorage.getItem('hush.kept'), boat: window.__ember.boatTotal, friends: window.__ember.friends, log: window.__ember.log.join(' | ') }));
ok('a returning guest keeps the number they had', me.code === ann.code && me.kept === '1', me.code + ' vs ' + ann.code + ' kept ' + me.kept);
ok('and their friends, and the note left for them', JSON.stringify(me.friends).includes('Bob Fox') && /see you at the fire/.test(me.log), JSON.stringify(me.friends).slice(0, 200));
ok('the boat stands as it was built', me.boat === 121, String(me.boat));
// Later: the old sign-in is forgotten by the browser, and it is still the same animal.
await a.evaluate(() => localStorage.removeItem('hush.guest')); await a.reload({ waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2500); await a.click('#enter'); await a.waitForTimeout(6000);
ok('without the old sign-in it is still the same animal', (await a.evaluate(() => window.__ember.code)) === ann.code);
const b = await open('');
const nb = await b.evaluate(() => window.__ember.code);
ok('a newcomer gets a number with no Supabase at all', /^\d{4}$/.test(nb) && nb !== ann.code, nb);
// A mark cut on the wall by one shows for the other without waiting for a poll.
const t0 = Date.now();
const res = await a.evaluate(() => window.__ember.store.carve('moved in', 'Ann'));
const seen = await until(b, () => window.__ember.carvings.some((c) => c.text === 'moved in'), 15000);
ok('a new mark reaches the other visitor at once', res === 'ok' && seen && Date.now() - t0 < 12000, res + ' ' + (Date.now() - t0) + ' ms');
const ms = await (await fetch(M + '/_state')).json();
ok('nothing was written to Supabase, and each table was read once', !ms.calls.includes('WRITE') && !ms.calls.some((c) => c.startsWith('hi_')) && ms.calls.filter((c) => c === 'table:boat').length === 1, JSON.stringify(ms.calls));
ok('the game itself never called out to Supabase', !outside.some((u) => /supabase/.test(u)), outside.filter((u) => /supabase/.test(u)).join(' '));
console.log(errs.length ? [...new Set(errs)].join('|') : 'no page errors');
await browser.close();
