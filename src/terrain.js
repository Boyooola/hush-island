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

// Key places (metres, y up, fire at the origin).
export const FIRE = { x: 0, z: 0 };
export const HILL = { x: -15, z: -12 };
export const SPAWN = { x: 0.5, z: 24.2 };
export const DOCK = { x0: 29.5, x1: 46, z0: -1.15, z1: 1.15, y: 0.55 };
export const WOODPILE = { x: 3.1, z: 5.0 };
export const SIGN = { x: -3.7, z: 20.6 };


// Shoreline radius as a function of angle: a wobbly circle.
export function shoreRadius(theta) {
  return 30 + 3 * Math.sin(3 * theta + 1) + 2 * Math.sin(5 * theta + 2.3) + 1.2 * Math.sin(2 * theta);
}

export const WALL = { x: -6.6, z: 3.4, yaw: 0.85 };       // driftwood wall for carvings
export const CRATE = { x: 6.2, z: 23.2 };                  // empty bottles on the beach
// Places along the south beach where a bottle can wash up.
export const BOTTLE_SPOTS = [66, 79, 102, 114].map((deg) => {
  const a = (deg * Math.PI) / 180, r = shoreRadius(a) * 0.955;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
});

// Height of the land itself (without the dock).
export function terrainHeight(x, z) {
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
export const SLIP = (() => { const a = 2.62, shore = shoreRadius(a), r0 = shore - 0.5; return { a, on: false, r0, r1: shore + 4.1 - 1.0, y0: terrainHeight(Math.cos(a) * r0, Math.sin(a) * r0) + 0.06, y1: 0.52, half: 0.5 }; })();
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
