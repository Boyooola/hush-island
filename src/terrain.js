// Island shape, ground height and collision. Pure functions, shared by world, avatars and input.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Smooth value noise in 2D, deterministic.
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

// Which island this page is: home (Hush Island) or the far shore (Lantern Rock), a second, much larger island
// reached by boat. It is the same game on a different piece of land, chosen by the address of the page (/far).
export const ISLE = typeof location !== 'undefined' && /^\/far\/?$/.test(location.pathname) ? 'far' : 'home';
export const FAR = ISLE === 'far';

// Key places (metres, y up, the fire at the origin). On the far shore the fire is the camp at the Landing, on
// the island's eastern tip, and the land runs away west from it.
export const FIRE = { x: 0, z: 0 };
export const HILL = FAR ? { x: -66, z: -10 } : { x: -15, z: -12 };       // home: the hill behind the fire; far: the High Meadow
export const SPAWN = FAR ? { x: 19.5, z: 3.4 } : { x: 0.5, z: 24.2 };
export const DOCK = FAR ? { x0: 25.2, x1: 41.7, z0: -1.15, z1: 1.15, y: 0.55 } : { x0: 29.5, x1: 46, z0: -1.15, z1: 1.15, y: 0.55 };
export const WOODPILE = { x: 3.1, z: 5.0 };
export const SIGN = FAR ? { x: 14.5, z: 4.6 } : { x: -3.7, z: 20.6 };
// The areas of the far shore, for the map and for saying where you are. Each is a centre and a reach.
export const AREAS = FAR ? [
  { id: 'landing', name: 'The Landing', x: 6, z: 0, r: 24 },
  { id: 'woods', name: 'Whisper Woods', x: -30, z: -2, r: 22 },
  { id: 'flats', name: 'The Tide Flats', x: -32, z: 40, r: 22 },
  { id: 'hollow', name: 'Hollow Hill', x: -40, z: -40, r: 18 },
  { id: 'meadow', name: 'The High Meadow', x: -66, z: -10, r: 19 },
  { id: 'point', name: 'Lantern Point', x: -98, z: 8, r: 16 },
  { id: 'farbeach', name: 'The Far Beach', x: -84, z: -38, r: 17 },
] : [];
export function areaAt(x, z) {
  let best = null, bd = 1e9;
  for (const a of AREAS) { const d = Math.hypot(x - a.x, z - a.z) / a.r; if (d < 1 && d < bd) { bd = d; best = a; } }
  return best;
}

// Shoreline radius as a function of angle. Home is a wobbly circle. The far shore is a long teardrop: close to
// the camp on the east side, over a hundred metres away to the west.
export function shoreRadius(theta) {
  if (FAR) {
    const k = Math.pow((1 - Math.cos(theta)) / 2, 1.45);
    return (27 + 84 * k) * (1 + 0.07 * Math.sin(3 * theta + 1) + 0.05 * Math.sin(5 * theta + 2.3) + 0.045 * Math.sin(8 * theta + 0.6) * k);
  }
  return 30 + 3 * Math.sin(3 * theta + 1) + 2 * Math.sin(5 * theta + 2.3) + 1.2 * Math.sin(2 * theta);
}

// The Landing on the far shore: the first explorers' camp, laid out around the fire and along the way to the jetty.
// Each is a piece of props.glb, where it stands, which way it is turned, and how much room it takes up.
export const MAPMAKER = { x: 10.9, z: -3.3 };
export const MAP_BOARD = { x: 8.2, z: -4.9, ry: 0.22 };
export const LANDING = FAR ? [
  { kind: 'map_board', x: MAP_BOARD.x, z: MAP_BOARD.z, ry: MAP_BOARD.ry, r: 0, clear: 3 },
  { kind: 'tent', x: -4.6, z: -8.8, ry: Math.atan2(-8.8, 4.6), r: 1.35, clear: 3.2 },
  { kind: 'tent', x: 4.4, z: -10.4, ry: Math.atan2(-10.4, -4.4), r: 1.35, clear: 3.2 },
  { kind: 'tent', x: -3.0, z: 10.6, ry: Math.atan2(10.6, 3.0), r: 1.35, clear: 3.2 },
  { kind: 'supplies', x: 7.4, z: 7.6, ry: 2.2, r: 1.15, clear: 2.4 },
  { kind: 'supplies', x: 21.6, z: -3.6, ry: -0.5, r: 1.15, clear: 2.4 },
  { kind: 'drying_rack', x: 13.4, z: -7.4, ry: 0.5, r: 0, clear: 2.2 },
  { kind: 'rowboat', x: 27.6, z: 7.4, ry: 0.9, r: 1.0, clear: 2.6, tilt: 0.16 },
  { kind: 'lantern_pole', x: 8.4, z: 2.5, ry: Math.PI / 2, r: 0.16, clear: 1 },
  { kind: 'lantern_pole', x: 12.8, z: -1.9, ry: -Math.PI / 2, r: 0.16, clear: 1 },
  { kind: 'lantern_pole', x: 17.4, z: 2.4, ry: Math.PI / 2, r: 0.16, clear: 1 },
  { kind: 'lantern_pole', x: 22.2, z: -1.8, ry: -Math.PI / 2, r: 0.16, clear: 1 },
] : [];
export const WALL = { x: -6.6, z: 3.4, yaw: 0.85 };       // driftwood wall for carvings
export const CRATE = FAR ? { x: 17.5, z: -8.2 } : { x: 6.2, z: 23.2 };                  // empty bottles on the beach
// Places along the beach where a bottle can wash up (the south beach at home, the landing beach on the far shore).
export const BOTTLE_SPOTS = (FAR ? [-26, -15, 15, 27] : [66, 79, 102, 114]).map((deg) => {
  const a = (deg * Math.PI) / 180, r = shoreRadius(a) * 0.955;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
});

// Height of the land itself (without the dock).
const bump = (x, z, cx, cz, h, sig) => h * Math.exp(-((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (2 * sig * sig));
// The far shore: low and wooded in the middle, a hill with caves to the north, a high flat meadow to the west,
// a cliff at the western point, and wide flats to the south that barely clear the water.
function farHeight(x, z) {
  const r = Math.hypot(x, z), theta = Math.atan2(z, x), shore = shoreRadius(theta), inland = shore - r;
  let h = inland >= 0 ? 1.7 * (1 - Math.pow(r / shore, 2.2)) : -Math.min(5, -inland * 0.217);
  const land = smoothstep(-0.5, 7, inland);
  // Whisper Woods: rolling ground.
  h += (0.9 * noise2(x * 0.045 + 5, z * 0.045 - 2) + 0.9) * smoothstep(12, 34, r) * land;
  // Hollow Hill.
  h += bump(x, z, -40, -40, 9.5, 10.5) * land;
  // The High Meadow: a broad table with a flat top.
  { const d = Math.hypot(x - HILL.x, z - HILL.z); h += 7.6 * (1 - smoothstep(11, 24, d)) * land; }
  // Lantern Point: high ground right up to the western edge, so it ends in a cliff.
  h += bump(x, z, -99, 8, 9, 9) * smoothstep(-0.5, 2.2, inland);
  // The Far Beach behind the hills stays low.
  h -= bump(x, z, -84, -40, 1.2, 10) * land;
  // Small bumps everywhere.
  h += (0.22 * noise2(x * 0.16, z * 0.16) + 0.08 * noise2(x * 0.45 + 9, z * 0.45 - 4)) * land;
  // The Tide Flats: pressed down almost to the water.
  { const m = Math.exp(-((x + 32) * (x + 32) + (z - 42) * (z - 42)) / (2 * 16 * 16)); if (inland > -2) h = lerp(h, 0.14 + 0.07 * noise2(x * 0.3, z * 0.3), Math.min(1, m * 1.15) * smoothstep(-2, 3, inland)); }
  // The camp clearing.
  h = lerp(1.62, h, smoothstep(5.5, 11, r));
  return h;
}
export function terrainHeight(x, z) {
  if (FAR) return farHeight(x, z);
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const d = r / shoreRadius(theta);
  let h;
  if (d <= 1) {
    h = 1.7 * (1 - Math.pow(d, 2.2));
  } else {
    h = -Math.min(5, (d - 1) * 6.5);
  }
  const land = 1 - smoothstep(0.8, 1.02, d);
  // The hill behind the fire.
  const hx = x - HILL.x, hz = z - HILL.z;
  h += 4.6 * Math.exp(-(hx * hx + hz * hz) / (2 * 46)) * land;
  // Small bumps.
  h += (0.22 * noise2(x * 0.16, z * 0.16) + 0.08 * noise2(x * 0.45 + 9, z * 0.45 - 4)) * land;
  // A flat clearing around the fire.
  const flat = smoothstep(5.5, 11, r);
  h = lerp(1.62, h, flat);
  return h;
}

// The gangplank out to the boat's mooring on the west beach: a sloping walkway from the sand to her side.
// It is only there (on: true) once the boat is built. Lengths are along the line from the fire out through the yard.
// Where the boat lies: the west beach at home, beside the dock on the far shore.
export const SITE_A = FAR ? 0.5 : 2.62;
export const SLIP = (() => { const a = SITE_A, shore = shoreRadius(a), r0 = shore - 0.5; return { a, on: false, r0, r1: shore + 4.1 - 1.0, y0: terrainHeight(Math.cos(a) * r0, Math.sin(a) * r0) + 0.06, y1: 0.52, half: 0.5 }; })();
const slipAt = (x, z) => [x * Math.cos(SLIP.a) + z * Math.sin(SLIP.a), -x * Math.sin(SLIP.a) + z * Math.cos(SLIP.a)];
export function onSlip(x, z) {
  if (!SLIP.on) return false;
  const [along, across] = slipAt(x, z);
  return along >= SLIP.r0 - 0.3 && along <= SLIP.r1 + 0.1 && Math.abs(across) <= SLIP.half;
}
export const slipHeight = (x, z) => lerp(SLIP.y0, SLIP.y1, Math.min(1, Math.max(0, (slipAt(x, z)[0] - SLIP.r0) / (SLIP.r1 - SLIP.r0))));
export const slipPoint = (r, across = 0) => ({ x: Math.cos(SLIP.a) * r - Math.sin(SLIP.a) * across, z: Math.sin(SLIP.a) * r + Math.cos(SLIP.a) * across });

export function onDock(x, z) {
  return x >= DOCK.x0 && x <= DOCK.x1 && z >= DOCK.z0 && z <= DOCK.z1;
}

// The worn paths: from the beach up to the fire, and from the fire out to the dock, the hill and the boatyard.
// pathAmount is 1 on a path, 0 well off it, with a ragged edge.
export const PATHS = FAR ? [
  [[5.4, 0.3], [15, 0.4], [25.4, 0]],                                              // camp to the jetty
  [[-5.4, 0.2], [-16, -2], [-30, -4], [-45, -8], [-57, -10]],                     // west through the woods to the meadow
  [[-30, -4], [-34, -18], [-38, -30]],                                             // north to Hollow Hill
  [[-16, -2], [-21, 12], [-27, 26]],                                               // south to the flats
  [[-57, -10], [-76, -3], [-91, 6]],                                               // on to Lantern Point
] : [
  [[0.5, 22.5], [0.9, 14], [0.3, 5.6]],
  [[5.4, 0.4], [16, -0.6], [29.6, 0]],
  [[-3.8, -3.0], [-9.5, -6.6], [-13.4, -10.6]],
  [[-5.2, 0.4], [-11, 3.2], [-17, 9.2], [-22.6, 13.2]],
];
export function pathAmount(x, z) {
  let d = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0] - ax, bz = p[i + 1][1] - az;
    const k = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - bx * k, z - az - bz * k));
  }
  return 1 - smoothstep(0.55, 1.45, d + noise2(x * 0.9 + 11, z * 0.9 - 5) * 0.45);
}

// Height an avatar stands at.
export function groundHeight(x, z) {
  const h = terrainHeight(x, z);
  if (onDock(x, z) && h < DOCK.y) return DOCK.y;
  if (onSlip(x, z)) return Math.max(h, slipHeight(x, z));
  return h;
}

export function walkable(x, z) {
  if (onDock(x, z) || onSlip(x, z)) return true;
  return terrainHeight(x, z) > -0.22;
}

// How close a point is to the water's edge: 1 at the shore, 0 well inland.
export function shoreProximity(x, z) {
  const r = Math.hypot(x, z);
  const d = r / shoreRadius(Math.atan2(z, x));
  return smoothstep(0.45, 1.0, d);
}

// Circle colliders, filled in by the world builder.
export const colliders = [];

// Move from (x,z) by (dx,dz) for a body of the given radius. Returns the new position.
export function moveWithCollision(x, z, dx, dz, radius) {
  let nx = x + dx, nz = z + dz;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const ox = nx - c.x, oz = nz - c.z;
      const min = c.r + radius;
      const d2 = ox * ox + oz * oz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        nx = c.x + (ox / d) * min;
        nz = c.z + (oz / d) * min;
      }
    }
  }
  if (walkable(nx, nz)) return { x: nx, z: nz };
  if (walkable(nx, z)) return { x: nx, z };
  if (walkable(x, nz)) return { x, z: nz };
  return { x, z };
}

// The log ring around the fire, and the resting spots on the ground in front of it: two per log.
// Animals rest on the ground facing the flames; how far back each one settles depends on its size (spotAt).
export const LOGS = [];
export const SEATS = [];
{
  const ringR = 3.5;
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    LOGS.push({ x: Math.cos(a) * ringR, z: Math.sin(a) * ringR, angle: a });
    for (const s of [-0.26, 0.26]) {
      const b = a + s;
      SEATS.push({ angle: b, x: Math.cos(b) * 2.4, z: Math.sin(b) * 2.4, yaw: Math.atan2(-Math.cos(b), -Math.sin(b)) });
    }
  }
}
// Where an animal of a given body length settles at a spot: rump just clear of the log behind it.
export function spotAt(i, bodyLength) {
  const s = SEATS[i], r = clamp(3.0 - bodyLength / 2, 2.0, 2.6);
  return { x: Math.cos(s.angle) * r, z: Math.sin(s.angle) * r, yaw: s.yaw };
}
