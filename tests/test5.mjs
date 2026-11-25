// Carvings, bottle notes and visit rewards, against a stand-in for the shared store.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const url = 'http://localhost:8765/index.html';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const mock = () => {
  // A tiny document store kept in localStorage, so two "visitors" on the same origin share it.
  const KEY = 'mockdb';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const snapDoc = (id, data) => ({ id, exists: data !== undefined, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
  const inColl = (path) => { const all = load(), out = []; for (const k in all) { const i = k.lastIndexOf('/'); if (k.slice(0, i) === path) out.push([k.slice(i + 1), all[k]]); } return out; };
  const query = (path, filters = [], order = null, lim = 1000) => {
    const run = () => {
      let rows = inColl(path).filter(([, d]) => filters.every(([f, op, v]) => op === '==' ? d[f] === v : op === '<' ? d[f] < v : true));
      if (order) rows.sort((a, b) => (a[1][order[0]] - b[1][order[0]]) * (order[1] === 'desc' ? -1 : 1));
      rows = rows.slice(0, lim);
      const docs = rows.map(([id, d]) => snapDoc(id, d));
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    };
    return {
      where: (f, op, v) => query(path, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => query(path, filters, [f, dir], lim),
      limit: (n) => query(path, filters, order, n),
      get: async () => run(),
      onSnapshot: (next) => { let last = ''; const tick = () => { const r = run(), sig = JSON.stringify(r.docs.map((d) => [d.id, d.data()])); if (sig !== last) { last = sig; next(r); } }; const iv = setInterval(tick, 400); setTimeout(tick, 50); return () => clearInterval(iv); },
      path,
      doc: (id) => doc(path + '/' + (id || 'x' + Math.random().toString(36).slice(2, 10))),
      add: async (data) => { const r = doc(path + '/x' + Math.random().toString(36).slice(2, 10)); await r.set(data); return r; },
    };
  };
  const doc = (path) => ({
    id: path.slice(path.lastIndexOf('/') + 1), path,
    get: async () => snapDoc(path.slice(path.lastIndexOf('/') + 1), load()[path]),
    set: async (data) => { const d = load(); d[path] = data; save(d); },
    update: async (data) => { const d = load(); if (!d[path]) throw { code: 'invalid_argument' }; d[path] = { ...d[path], ...data }; save(d); },
    delete: async () => { const d = load(); delete d[path]; save(d); },
  });
  const uid = sessionStorage.getItem('uid') || ('u' + Math.random().toString(36).slice(2, 8));
  sessionStorage.setItem('uid', uid);
  const db = { doc, collection: (p) => query(p) };
  const user = { id: async () => uid, can: async () => true };
  window.claude = { use: (n) => Promise.resolve(n === 'db' ? db : n === 'user' ? user : null) };
};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(mock);
const errs = [];
const open = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.goto(url); await p.waitForTimeout(1500); await p.evaluate(() => window.__ember.lockQuality()); await p.click('#enter'); await p.waitForTimeout(3000); return p; };
const a = await open();
const sheetText = (p) => p.evaluate(() => document.getElementById('sheet').hidden ? '(closed)' : document.getElementById('sheet').innerText.replace(/\n+/g, ' | '));

// Carvings.
await a.evaluate(() => { const e = window.__ember; e.teleport(-5.1, 5.1, -2.4); e.cam(0.85, 0.2, 5.5); });
await a.waitForTimeout(700);
console.log('at the wall:', await a.evaluate(() => window.__ember.actions));
await a.keyboard.press('e');
await a.waitForTimeout(500);
console.log('sheet:', await sheetText(a));
await a.fill('#sheet-input', 'First night here. The fire was warm.');
await a.press('#sheet-input', 'Enter');
await a.waitForTimeout(1200);
console.log('after carving:', await sheetText(a));
await a.screenshot({ path: 'shots/50-carving-sheet.png' });
await a.keyboard.press('Escape');
await a.waitForTimeout(1500);
await a.screenshot({ path: 'shots/51-wall.png' });

// Bottle: A writes one at the crate.
await a.evaluate(() => { const e = window.__ember; e.teleport(5.4, 22.1, 0.5); e.cam(2.6, 0.3, 6.5); });
await a.waitForTimeout(700);
console.log('at the crate:', await a.evaluate(() => window.__ember.actions));
await a.keyboard.press('e');
await a.waitForTimeout(400);
await a.fill('#sheet-input', 'Hello from Manila. What is the sea like where you are?');
await a.screenshot({ path: 'shots/52-note-sheet.png' });
await a.press('#sheet-input', 'Enter');
await a.waitForTimeout(900);
await a.screenshot({ path: 'shots/53-bottle-throw.png' });
await a.waitForTimeout(1500);
console.log('A log:', await a.evaluate(() => document.getElementById('log').innerText.split('\n').slice(-1)[0]));
await a.evaluate(() => window.__ember.lookForBottle());
await a.waitForTimeout(600);
console.log('A is not offered their own bottle:', (await a.evaluate(() => window.__ember.bottle)) === null);

// B (another visitor) finds it and replies.
const b = await open();
await b.evaluate(() => window.__ember.lookForBottle());
await b.waitForTimeout(800);
const spot = await b.evaluate(() => window.__ember.bottleSpot);
console.log('B finds a bottle:', await b.evaluate(() => window.__ember.bottle && window.__ember.bottle.kind), spot && [spot.x.toFixed(1), spot.z.toFixed(1)]);
await b.evaluate((s) => { const e = window.__ember; e.teleport(s.x + 0.6, s.z - 1.0, 0.4); e.cam(Math.PI + 0.4, 0.35, 5); }, spot);
await b.waitForTimeout(1500);
await b.screenshot({ path: 'shots/54-washed-up.png' });
console.log('B at the bottle:', await b.evaluate(() => window.__ember.actions));
await b.keyboard.press('e');
await b.waitForTimeout(400);
console.log('B reads:', await sheetText(b));
await b.fill('#sheet-input', 'Calm and warm tonight. Hello back from the other side.');
await b.press('#sheet-input', 'Enter');
await b.waitForTimeout(1500);
console.log('B log:', await b.evaluate(() => document.getElementById('log').innerText.split('\n').slice(-1)[0]));
await b.close();

// A gets the reply.
await a.bringToFront();
await a.evaluate(() => window.__ember.lookForBottle());
await a.waitForTimeout(800);
const spotA = await a.evaluate(() => window.__ember.bottleSpot);
console.log('A now has:', await a.evaluate(() => window.__ember.bottle && window.__ember.bottle.kind));
await a.evaluate((s) => { const e = window.__ember; e.teleport(s.x + 0.5, s.z - 0.9, 0.4); }, spotA);
await a.waitForTimeout(600);
await a.keyboard.press('e');
await a.waitForTimeout(500);
console.log('A reads:', await sheetText(a));
await a.screenshot({ path: 'shots/55-reply.png' });
await a.click('#sheet-extra');
await a.waitForTimeout(600);
console.log('bottles left in the store:', await a.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mockdb'))).filter((k) => k.startsWith('bottles/')).length));

// Nights and rewards.
console.log('nights after first visit:', await a.evaluate(() => window.__ember.nights), '|', await a.evaluate(() => document.getElementById('nights').textContent));
await a.evaluate(() => { const e = window.__ember; e.setNights(14); e.teleport(1.2, 6.4, 0.4); e.cam(0.5, 0.2, 4.2); });
await a.waitForTimeout(2500);
await a.screenshot({ path: 'shots/56-rewards.png' });
console.log(errs.length ? errs.join('\n') : 'no page errors');
await browser.close();
