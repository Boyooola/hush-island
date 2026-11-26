import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const run = async (hour) => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  const p = await ctx.newPage(); p.setDefaultTimeout(150000); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8787/index.html'); await p.waitForTimeout(2500);
  await p.evaluate((h) => { window.__ember.lockQuality(); window.__ember.setHour(h); }, hour);
  await p.click('#enter');
  let st = null;
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(500); st = await p.evaluate(() => window.__ember.audio.playing); if (st.state === 'play' && st.at > 1) break; }
  const credit = await p.evaluate(() => document.getElementById('music-credit').textContent);
  await ctx.close();
  return { st, credit };
};
const day = await run(12), night = await run(23);
ok('by day a day piece plays', day.st.state === 'play' && /^day-\d\.mp3$/.test(day.st.file) && !day.st.paused && day.st.at > 1, JSON.stringify(day.st));
ok('by night a night piece plays', night.st.state === 'play' && /^night-\d\.mp3$/.test(night.st.file) && night.st.at > 1, JSON.stringify(night.st));
ok('the music is credited in Help', day.credit === 'Music made with Suno.', day.credit);
console.log(errs.length ? errs.join('|') : 'no page errors');
await browser.close();
