// The room's side of guest sign-in: a token Supabase vouches for decides who you are; otherwise the browser's secret.
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const join = async (msg) => { const ws = await new Promise((res) => { const w = new WebSocket('ws://localhost:8787/room'); w.msgs = []; w.onmessage = (e) => w.msgs.push(JSON.parse(e.data)); w.onopen = () => res(w); }); ws.send(JSON.stringify({ t: 'join', ...msg })); await sleep(700); return ws.msgs.find((m) => m.t === 'in') || {}; };
const a1 = await join({ key: 'aaaaaaaaaaaaaaaaaaaaaaaa1', tok: 'x'.repeat(40) + '.y.guest-alice' });
const a2 = await join({ key: 'bbbbbbbbbbbbbbbbbbbbbbbb2', tok: 'x'.repeat(40) + '.y.guest-alice' });
const b = await join({ key: 'cccccccccccccccccccccccc3', tok: 'x'.repeat(40) + '.y.guest-bob' });
const bad = await join({ key: 'aaaaaaaaaaaaaaaaaaaaaaaa1', tok: 'x'.repeat(40) + '.y.forged' });
const same = await join({ key: 'aaaaaaaaaaaaaaaaaaaaaaaa1' });
const none = await join({});
ok('a guest account decides who you are, whatever the browser', a1.who === 'guest' && a1.pid && a1.pid === a2.pid && a1.code === a2.code, JSON.stringify([a1.pid, a1.code, a1.who]));
ok('a different guest is a different visitor', b.who === 'guest' && b.pid !== a1.pid);
ok('a token Supabase does not vouch for falls back to the browser\'s secret', bad.who === 'browser' && bad.pid && bad.pid !== a1.pid && bad.pid === same.pid, JSON.stringify([bad.pid, bad.who]));
ok('with neither, a visitor still comes ashore, without a number', none.t === 'in' && !none.pid && !none.code);
const st = await (await fetch('http://localhost:8799/_state')).json();
process.exit(0);
