// A stand-in for Supabase's REST and auth endpoints, for testing the room's side of things on this machine.
// It answers the same calls with the same shapes as the SQL functions in supabase/schema.sql.
import http from 'node:http';
import crypto from 'node:crypto';
const S = { profiles: new Map(), friends: new Set(), asks: new Map(), notes: [], feedback: [], reports: [], calls: [] };
const prof = (pid) => { const p = S.profiles.get(pid) || {}; return { pid, name: p.name || 'A visitor', code: p.code || '', s: p.species || 0, seen: p.seen || 0 }; };
const F = {
  hi_remember: (a) => { S.profiles.set(a.p_pid, { name: a.p_name, code: a.p_code, species: a.p_species, guest: a.p_guest, seen: Date.now() }); return null; },
  hi_friends_of: (a) => ({ friends: [...S.friends].filter((k) => k.startsWith(a.p_pid + '|')).map((k) => prof(k.split('|')[1])), asks: [...S.asks.keys()].filter((k) => k.endsWith('|' + a.p_pid)).map((k) => prof(k.split('|')[0])) }),
  hi_are_friends: (a) => S.friends.has(a.p_me + '|' + a.p_them),
  hi_befriend: (a) => {
    if (S.friends.has(a.p_me + '|' + a.p_them)) return { result: 'already' };
    if (S.asks.has(a.p_them + '|' + a.p_me)) { S.friends.add(a.p_me + '|' + a.p_them); S.friends.add(a.p_them + '|' + a.p_me); S.asks.delete(a.p_them + '|' + a.p_me); S.asks.delete(a.p_me + '|' + a.p_them); return { result: 'friends', name: prof(a.p_them).name }; }
    S.asks.set(a.p_me + '|' + a.p_them, Date.now()); return { result: 'asked' };
  },
  hi_unfriend: (a) => { S.friends.delete(a.p_me + '|' + a.p_them); S.friends.delete(a.p_them + '|' + a.p_me); return null; },
  hi_leave_note: (a) => { if (!S.friends.has(a.p_from + '|' + a.p_to)) return 'friends'; if (S.notes.filter((n) => n.dest === a.p_to && n.src === a.p_from).length >= 5) return 'enough'; S.notes.push({ dest: a.p_to, src: a.p_from, name: a.p_name, text: a.p_text, at: Date.now() }); return 'ok'; },
  hi_take_notes: (a) => { const mine = S.notes.filter((n) => n.dest === a.p_pid); S.notes = S.notes.filter((n) => n.dest !== a.p_pid); return mine.map((n) => ({ at: n.at, pid: n.src, name: n.name, text: n.text })); },
  hi_feedback: (a) => { if (a.p_h && S.feedback.filter((f) => f.h === a.p_h).length >= 5) return 'enough'; S.feedback.push({ at: Date.now(), who: a.p_who, h: a.p_h, text: a.p_text }); return 'ok'; },
  hi_report: (a) => { S.reports.push({ at: Date.now(), tid: a.p_tid, who: a.p_who, by: a.p_by, note: a.p_note, lines: a.p_lines, sure: a.p_sure }); return new Set(S.reports.filter((r) => r.tid === a.p_tid).map((r) => r.by)).size; },
  hi_keeper: () => ({ reports: S.reports.slice().reverse().map((r) => ({ at: r.at, who: r.who, note: r.note, lines: r.lines, sure: r.sure })), feedback: S.feedback.slice().reverse().map((f) => ({ at: f.at, who: f.who, text: f.text })) }),
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(v === undefined ? '' : JSON.stringify(v)); };
    if (req.url === '/_state') return send(200, { profiles: [...S.profiles.entries()], friends: [...S.friends], notes: S.notes, feedback: S.feedback, reports: S.reports, calls: S.calls });
    if (req.url === '/auth/v1/user') {
      // A token of the form x.y.guest-<name> stands for a signed-in guest; anything else is refused.
      const m = /\.guest-([a-z0-9]+)$/.exec(req.headers.authorization || '');
      if (!m) return send(401, { msg: 'bad token' });
      const h = crypto.createHash('md5').update(m[1]).digest('hex');
      return send(200, { id: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`, is_anonymous: true });
    }
    const fn = (/^\/rest\/v1\/rpc\/(\w+)$/.exec(req.url) || [])[1];
    if (!fn || !F[fn]) return send(404, { message: 'no such function' });
    if (req.headers.apikey !== 'test-secret' || req.headers.authorization !== 'Bearer test-secret') return send(401, { message: 'no key' });
    S.calls.push(fn);
    const out = F[fn](body ? JSON.parse(body) : {});
    return out === null ? (res.writeHead(204), res.end()) : send(200, out);
  });
}).listen(8799, () => console.log('mock supabase on 8799'));
