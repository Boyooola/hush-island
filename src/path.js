// Finds a walking route across the island, around trees, logs, rocks and water.
// The island is cut into half-metre cells once; each tap runs an A* search over them.
import { walkable, colliders } from './terrain.js';

const CELL = 0.5, MIN = -48, N = 192;
const BODY = 0.37;
let grid = null;

export function blockedAt(x, z) {
  if (!walkable(x, z)) return true;
  for (const c of colliders) {
    const r = c.r + BODY, dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function build() {
  grid = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (blockedAt(MIN + (i + 0.5) * CELL, MIN + (j + 0.5) * CELL)) grid[j * N + i] = 1;
  }
}
const toCell = (v) => Math.max(0, Math.min(N - 1, Math.floor((v - MIN) / CELL)));
const toWorld = (c) => MIN + (c + 0.5) * CELL;

// Nearest open cell to (i, j), searching outward in rings.
function nearestOpen(i, j, maxRing) {
  if (!grid[j * N + i]) return [i, j];
  for (let r = 1; r <= maxRing; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N || grid[b * N + a]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = [a, b]; }
    }
    if (best) return best;
  }
  return null;
}

function clearLine(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(d / 0.2);
  for (let s = 1; s < steps; s++) {
    const k = s / steps;
    if (grid[toCell(z0 + (z1 - z0) * k) * N + toCell(x0 + (x1 - x0) * k)]) return false;
  }
  return true;
}

// Returns a list of points to walk through, ending at (or as near as possible to) the target.
export function findPath(sx, sz, tx, tz) {
  if (!grid) build();
  const start = nearestOpen(toCell(sx), toCell(sz), 4);
  const goal = nearestOpen(toCell(tx), toCell(tz), 14);
  if (!start || !goal) return null;
  const goalBlocked = blockedAt(tx, tz);
  const endX = goalBlocked ? toWorld(goal[0]) : tx, endZ = goalBlocked ? toWorld(goal[1]) : tz;
  if (clearLine(sx, sz, endX, endZ)) return [{ x: endX, z: endZ }];

  const S = start[1] * N + start[0], G = goal[1] * N + goal[0];
  const g = new Float32Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = [];   // binary heap of [f, cell]
  const push = (f, c) => {
    heap.push([f, c]);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const gi = G % N, gj = (G / N) | 0;
  const h = (c) => { const di = Math.abs((c % N) - gi), dj = Math.abs(((c / N) | 0) - gj); return Math.max(di, dj) + 0.4142 * Math.min(di, dj); };
  g[S] = 0; push(h(S), S);
  let found = false, guard = 0;
  while (heap.length && guard++ < 60000) {
    const c = pop()[1];
    if (closed[c]) continue;
    closed[c] = 1;
    if (c === G) { found = true; break; }
    const ci = c % N, cj = (c / N) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const n = b * N + a;
      if (grid[n] || closed[n]) continue;
      if (di && dj && (grid[cj * N + a] || grid[b * N + ci])) continue;   // no cutting corners
      const cost = g[c] + (di && dj ? 1.4142 : 1);
      if (cost < g[n]) { g[n] = cost; from[n] = c; push(cost + h(n), n); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = G; c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: toWorld(c % N), z: toWorld((c / N) | 0) }));
  pts[0] = { x: sx, z: sz };
  pts.push({ x: endX, z: endZ });
  // Pull the route tight: skip every point you can already walk straight past.
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 70);
    while (j > i + 1 && !clearLine(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}
