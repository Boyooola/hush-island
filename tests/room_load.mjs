// Load on the live room: N pretend visitors each sending 4 positions a second. One of them times the deliveries.
const URL = 'ws://localhost:8787/room';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const N of [30, 60, 100]) {
  const socks = [];
  let lat = [], got = 0;
  for (let i = 0; i < N; i++) {
    const ws = new WebSocket(URL);
    await new Promise((r) => { ws.onopen = r; });
    ws.send(JSON.stringify({ t: 'join' }));
    if (i === 0) ws.onmessage = (e) => { if (e.data[0] !== '{') return; const m = JSON.parse(e.data); if (m.t === 'p' && m.p.ts) { got++; lat.push(Date.now() - m.p.ts); } };
    socks.push(ws);
  }
  await sleep(500);
  const state = (i) => ({ v: 1, n: 'Bot ' + i, s: i % 8, c: 0, t: '', x: 1.23, z: 4.56, r: 0.5, st: 0, se: -1, m: null, e: null, h: 0, tl: 0, w: 0, b: 0, nv: 3, fr: [0.8, 1795570000000], ts: 0 });
  const SECS = 8;
  let sent = 0;
  const iv = setInterval(() => { for (let i = 1; i < N; i++) { const p = state(i); p.ts = Date.now(); socks[i].send(JSON.stringify({ t: 'p', p })); sent++; } }, 250);
  await sleep(SECS * 1000);
  clearInterval(iv);
  await sleep(700);
  lat.sort((a, b) => a - b);
  const pct = (q) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] : -1;
  console.log(String(N).padStart(3), 'visitors |', Math.round(sent / SECS), 'messages a second in,', Math.round(sent / SECS * (N - 1)), 'out | delivered to one visitor:', got, 'of', sent, '| delay typical', pct(0.5), 'ms, worst 1%', pct(0.99), 'ms');
  for (const ws of socks) ws.close();
  await sleep(800);
}
process.exit(0);
