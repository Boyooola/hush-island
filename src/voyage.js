// The boat's first voyage: once she is built, animals can climb in, and she sails once round the island and home.
// There is no captain and no server keeping the course. A voyage is known by the moment it was called (its number)
// and the moment it casts off; from those two and the clock, every visitor works out where the boat is.
import { smoothstep, shoreRadius } from './terrain.js';
import { SITE_A, siteR } from './build.js';

export const BOARD_MS = 45000;      // time to climb in before she casts off by herself
export const SAIL_MS = 130000;      // once round the island
const OUT = 50;                     // how far from the fire she sails: clear of the end of the dock

// How far along the course she is (0 to 1) at a share t of the sailing time: slow off the beach, slow coming in.
function along(t) {
  const e = 0.14, v = 1 / (1 - e);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < e) return (v * t * t) / (2 * e);
  if (t > 1 - e) return 1 - (v * (1 - t) * (1 - t)) / (2 * e);
  return v * (t - e / 2);
}
function point(u) {
  const phi = u * Math.PI * 2, a = SITE_A - phi;
  const f = smoothstep(0, 0.6, phi) * (1 - smoothstep(Math.PI * 2 - 0.6, Math.PI * 2, phi));
  const r = siteR + (OUT - siteR) * f;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
// Where the boat is on voyage (id, cast) at time now: null when there is no voyage to speak of.
// phase 'board' (on the stocks, filling up), 'sail', or 'done'.
export function voyageAt(id, cast, now) {
  if (!id) return null;
  if (now < cast) return { phase: 'board', left: (cast - now) / 1000, pose: null, u: 0 };
  const t = (now - cast) / SAIL_MS;
  if (t >= 1) return { phase: 'done', left: 0, pose: null, u: 1 };
  const u = along(t), [x, z] = point(u), [x1, z1] = point(Math.min(1, u + 0.002)), [x0, z0] = point(Math.max(0, u - 0.002));
  const l = Math.hypot(x1 - x0, z1 - z0) || 1;
  return { phase: 'sail', left: ((1 - t) * SAIL_MS) / 1000, pose: { x, z, hx: (x1 - x0) / l, hz: (z1 - z0) / l }, u, offshore: Math.hypot(x, z) / shoreRadius(Math.atan2(z, x)) };
}
