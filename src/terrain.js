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
// Which island this is. There is no address for Lantern Rock: a visitor is there because the boat took them there, and
// the browser remembers which shore they are on. (On a developer's own machine the address /far still chooses it, for the tests.)
const kept = typeof globalThis.__mine === 'object' && globalThis.__mine ? globalThis.__mine : null;
export const LOCAL = typeof location !== 'undefined' && (!location.hostname || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) && !(kept && kept.local === false);
const shoreKept = kept ? kept.d['ember.isle'] : null;
export const ISLE = typeof location === 'undefined' ? 'home' : LOCAL ? (/^\/far\/?$/.test(location.pathname) ? 'far' : 'home') : (shoreKept === 'far' ? 'far' : 'home');
export const FAR = ISLE === 'far';

// Key places (metres, y up, the fire at the origin). On the far shore the fire is the camp at the Landing, on
// the island's eastern tip, and the land runs away west from it.
export const FIRE = { x: 0, z: 0 };
export const HILL = FAR ? { x: -270, z: -20 } : { x: -15, z: -12 };       // home: the hill behind the fire; far: the High Meadow
export const SPAWN = FAR ? { x: 19.5, z: 3.4 } : { x: 0.5, z: 24.2 };
export const DOCK = FAR ? { x0: 25.2, x1: 41.7, z0: -1.15, z1: 1.15, y: 0.55 } : { x0: 29.5, x1: 46, z0: -1.15, z1: 1.15, y: 0.55 };
export const WOODPILE = { x: 3.1, z: 5.0 };
export const SIGN = FAR ? { x: 14.5, z: 4.6 } : { x: -3.7, z: 20.6 };
// The areas of the far shore, for the map and for saying where you are. Each is a centre and a reach.
// Other places on the far shore that the land is shaped around.
export const WOODS = { x: -78, z: -8, r: 46 }, FLATS = { x: -100, z: 132, r: 40 }, VALLEY = { x: -200, z: 0, r: 46 }, POINT = { x: -310, z: 6 }, HOLLOW = { x: -168, z: -84 }, FARBEACH = (() => { const a = Math.atan2(-96, -292), r = FAR ? shoreRadius(a) - 11 : 300; return { x: Math.cos(a) * r, z: Math.sin(a) * r, a }; })();
export const POOL = { x: VALLEY.x - 4, z: VALLEY.z + 27, r: 14.5, y: 2.55 };      // Stillwater's pool, under the valley's southern wall
export const CRAG = { x: POOL.x, z: POOL.z + 14.6, y: 3.0 };                    // the crag the water falls from, with the hollow behind the fall
// Stepping stones across the pool, from the path's side to the falls.
export const STONES = FAR ? [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: POOL.x + 2.2 - i * 0.25 + (i % 2 ? 0.7 : -0.5), z: POOL.z - 12.6 + i * 3.05 })) : [];
export const HOLLOW_TREE = { x: WOODS.x - 15, z: WOODS.z + 27, ry: 0.7 };      // deep in Whisper Woods, off the path
export const SUMMIT = { x: -265, z: -2 };      // the highest point of the island, a crag above the High Meadow
// The ring of seven standing stones on the High Meadow, one for each light.
export const STANDING = FAR ? [0, 1, 2, 3, 4, 5, 6].map((i) => { const a = i / 7 * Math.PI * 2 + 0.3; return { x: HILL.x + Math.cos(a) * 7.2, z: HILL.z + Math.sin(a) * 7.2, a }; }) : [];
export const COTTAGE = { x: -304.5, z: 19, y: 23.2, ry: Math.atan2(-7, -9) };      // the keeper's cottage, a little way from his tower
// The Tide Flats: mud that the sea covers and uncovers. Out on it lies the wreck; beyond it a causeway of stones
// runs to an islet that can only be reached, and left, while the tide is out.
const FLAT_A = Math.atan2(FLATS.z, FLATS.x), FU = { x: Math.cos(FLAT_A), z: Math.sin(FLAT_A) };
export const TIDE = { low: -0.35, high: 0.92, flat: 0.42, period: 16 * 60000 };
export const FLAT_EDGE = FAR ? (() => { const r = shoreRadius(FLAT_A); return { x: FU.x * r, z: FU.z * r }; })() : { x: 0, z: 0 };
export const ISLET = { x: FLAT_EDGE.x + FU.x * 44, z: FLAT_EDGE.z + FU.z * 44 };
export const WRECK = { x: FLATS.x + FU.x * 9 - FU.z * 15, z: FLATS.z + FU.z * 9 + FU.x * 15 };
export const FLAT_SHORE = { x: FLATS.x - FU.x * 46, z: FLATS.z - FU.z * 46 };      // dry ground above the flats, where the sea puts back anyone it catches
// How high the tide stands at a given moment (the same for everyone), and how far through its turn it is (0 and 1 = high water, 0.5 = low).
export function tideAt(now) { const ph = (now % TIDE.period) / TIDE.period; return { y: lerp(TIDE.low, TIDE.high, 0.5 + 0.5 * Math.cos(ph * Math.PI * 2)), ph }; }
// Above the Far Beach, a ledge on the cliff with a hot spring on it; on the beach itself, a shelter of driftwood.
export const SPRING = (() => { const a = FARBEACH.a + 0.105, r = FAR ? shoreRadius(a) - 7.5 : 300; return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 5.6 }; })();
export const SHELTER = { x: FARBEACH.x - Math.cos(FARBEACH.a) * 7 + Math.sin(FARBEACH.a) * 6, z: FARBEACH.z - Math.sin(FARBEACH.a) * 7 - Math.cos(FARBEACH.a) * 6 };
// Hidden places in the open country, where no path goes.
export const MOONPOOL = { x: -70, z: -95, y: 4.4 };       // a pool in a dell in the north-east that takes light at night
export const BONES = { x: -106, z: -134 };                // what is left of a whale, on the cliff top above the north shore
export const SEAT = { x: 29.5, z: 46 };                   // a chair cut from a boulder on the south-east cliff, facing home
export const WAYCAIRN = { x: -20, z: 88 };                // a cairn on the south cliffs that every visitor adds to
export const GARDEN = { x: VALLEY.x + 9, z: VALLEY.z - 24 };
// The wider island: landmarks that can be seen from a long way off, and the places that are hard to find.
export const WINDMILL = { x: -283, z: -31, ry: 2.2 };       // on the edge of the High Meadow, its sails gone
export const WATCH = { x: -44, z: -118, ry: 0.6 };          // the stump of a watchtower on the north cliffs
export const ORCHARD = { x: -14, z: 62 };                   // apple trees and beehives on the south-east shoulder
export const WELL = { x: -72, z: -16 };                     // the well at the crossroads in Whisper Woods
export const HUT = { x: -84, z: 110, ry: -0.9 };            // the Beachcomber's hut on posts, at the top of the flats
export const GAP = { x: -226, z: 104, ry: 0.5 };            // the Whistling Gap: a split rock on the south-west cliffs
export const TRUNK = { x: -104, z: 18, ry: 1.1 };           // a great fallen trunk in the woods, hollow underneath
export const LEDGE = { x: SUMMIT.x - 9.5, z: SUMMIT.z + 4.5 };      // a ledge behind the summit crag
export const DUSKRING = { x: -216, z: -13 };                // a ring of mushrooms in the valley that shows at dusk
// Chapel Rock: a stack off the south-west cliffs with a roofless chapel on it, and the bridge that used to reach it.
const CH_A = 2.75, CH_R = FAR ? shoreRadius(CH_A) : 300, cu = { x: Math.cos(CH_A), z: Math.sin(CH_A) };
export const CHAPEL = { x: cu.x * (CH_R + 42), z: cu.z * (CH_R + 42), ry: Math.atan2(cu.x, cu.z), y: 5.3 };
export const BRIDGE = { ax: cu.x * (CH_R - 3.5), az: cu.z * (CH_R - 3.5), bx: cu.x * (CH_R + 27.5), bz: cu.z * (CH_R + 27.5), half: 1.15, on: false, ya: 0, yb: 0 };
export function bridgeAt(x, z) {
  const dx = BRIDGE.bx - BRIDGE.ax, dz = BRIDGE.bz - BRIDGE.az, L2 = dx * dx + dz * dz, k = ((x - BRIDGE.ax) * dx + (z - BRIDGE.az) * dz) / L2;
  if (k < -0.02 || k > 1.02) return -1;
  return Math.hypot(x - BRIDGE.ax - dx * k, z - BRIDGE.az - dz * k) <= BRIDGE.half ? clamp(k, 0, 1) : -1;
}
export const bridgeY = (k) => lerp(BRIDGE.ya, BRIDGE.yb, k) - 0.55 * Math.sin(k * Math.PI);
// A cove under the watchtower that only has a floor while the tide is out.
const CV_A = -1.9, CV_R = FAR ? shoreRadius(CV_A) : 300;
export const COVE = { x: Math.cos(CV_A) * (CV_R - 6), z: Math.sin(CV_A) * (CV_R - 6), y: 0.16, ox: Math.cos(CV_A), oz: Math.sin(CV_A) };
// The Giant's Steps: columns of rock going out from the north-east cliff to a stack with a nest on it.
const ST_A = -1.2, ST_R = FAR ? shoreRadius(ST_A) : 300;
export const STACK = { x: Math.cos(ST_A) * (ST_R + 31), z: Math.sin(ST_A) * (ST_R + 31), y: 4.3, r: 4.6 };
export const STEPS = [];
export const STEP_GAP = { x: 0, z: 0, y: 0, r: 1.5 };      // one column of the Steps is missing; a plank goes across where it stood
// A block of rock on the south cliffs too high to get onto alone, and the Gardener's tunnel from Stillwater out to the south shore.
export const BOOST = { x: -168, z: 131, r: 1.5, y: 0, fx: -168, fz: 134.6 };
export const TUNNEL = { a: { x: -200, z: 47 }, b: { x: -154, z: 121 } };
// The Leap: a pinnacle standing off the north cliff, a little too far for most animals to jump to.
const LP_A = -1.76, LP_R = FAR ? shoreRadius(LP_A) : 300;
export const LEAP = { x: Math.cos(LP_A) * (LP_R + 4.6), z: Math.sin(LP_A) * (LP_R + 4.6), y: 4.4, r: 1.9, fx: Math.cos(LP_A) * (LP_R - 2.2), fz: Math.sin(LP_A) * (LP_R - 2.2) };
// A sunken rowboat in the shallows of the Far Beach, and the mast of the ship it came from, further out.
export const SUNKEN = { x: FARBEACH.x + Math.cos(FARBEACH.a) * 6 - Math.sin(FARBEACH.a) * 9, z: FARBEACH.z + Math.sin(FARBEACH.a) * 6 + Math.cos(FARBEACH.a) * 9 };
export const MAST = { x: FARBEACH.x + Math.cos(FARBEACH.a) * 52 + Math.sin(FARBEACH.a) * 14, z: FARBEACH.z + Math.sin(FARBEACH.a) * 52 - Math.cos(FARBEACH.a) * 14 };
// Where nothing should grow of its own accord: [x, z, reach].
export const KEEP_CLEAR = FAR ? [[WINDMILL.x, WINDMILL.z, 9], [WATCH.x, WATCH.z, 8], [WELL.x, WELL.z, 5], [HUT.x, HUT.z, 6], [GAP.x, GAP.z, 7], [BOOST.x, BOOST.z, 6], [TUNNEL.a.x, TUNNEL.a.z, 5], [TUNNEL.b.x, TUNNEL.b.z, 5], [TRUNK.x, TRUNK.z, 7], [LEDGE.x, LEDGE.z, 4], [DUSKRING.x, DUSKRING.z, 5], [CHAPEL.x, CHAPEL.z, 26], [COVE.x, COVE.z, 12], [ORCHARD.x, ORCHARD.z, 17], [-88, 6, 4], [-186, -19, 4], [-257, -17, 4], [-80, 105, 4]] : [];
// Level ground under whatever is built: [x, z, flat out to, back to the land's own shape by].
const PADS = FAR ? [[WINDMILL.x, WINDMILL.z, 5, 10], [WATCH.x, WATCH.z, 5, 10], [WELL.x, WELL.z, 3, 7], [ORCHARD.x, ORCHARD.z, 9, 20], [GAP.x, GAP.z, 4, 9], [TRUNK.x, TRUNK.z, 4, 9], [LEDGE.x, LEDGE.z, 2.6, 5.5]].map(([x, z, r0, r1]) => ({ x, z, r0, r1, y: null, busy: false })) : [];
export const LIGHTHOUSE = { x: -319, z: 7, y: 22.6 };      // on Lantern Point
export const AREAS = FAR ? [
  { id: 'landing', name: 'The Landing', x: 6, z: 0, r: 30 },
  { id: 'woods', name: 'Whisper Woods', x: WOODS.x, z: WOODS.z, r: 48 },
  { id: 'flats', name: 'The Tide Flats', x: FLATS.x, z: FLATS.z, r: 42 },
  { id: 'hollow', name: 'Hollow Hill', x: HOLLOW.x, z: HOLLOW.z, r: 30 },
  { id: 'valley', name: 'Stillwater', x: VALLEY.x, z: VALLEY.z, r: 44 },
  { id: 'meadow', name: 'The High Meadow', x: HILL.x, z: HILL.z, r: 30 },
  { id: 'point', name: 'Lantern Point', x: POINT.x, z: POINT.z, r: 30 },
  { id: 'farbeach', name: 'The Far Beach', x: FARBEACH.x, z: FARBEACH.z, r: 30 },
  { id: 'north', name: 'The North Cliffs', x: -50, z: -104, r: 34 },
  { id: 'orchard', name: 'The Orchard', x: ORCHARD.x, z: ORCHARD.z, r: 26 },
  { id: 'southwest', name: 'The Whistling Shore', x: -232, z: 112, r: 36 },
  { id: 'chapel', name: 'Chapel Rock', x: CHAPEL.x, z: CHAPEL.z, r: 24 },
] : [];
// Where each sight lies, for the Mapmaker's map.
export const SIGHT_AT = FAR ? {
  stillwater: [VALLEY.x, VALLEY.z], hollowtree: [HOLLOW_TREE.x, HOLLOW_TREE.z], underhill: [-150, -70], paintings: [-166, -84], deeppool: [-190, -76],
  stones: [HILL.x, HILL.z], summit: [SUMMIT.x, SUMMIT.z], tower: [LIGHTHOUSE.x, LIGHTHOUSE.z], cottage: [COTTAGE.x, COTTAGE.z], wreck: [WRECK.x, WRECK.z],
  islet: [ISLET.x, ISLET.z], farbeach: [FARBEACH.x, FARBEACH.z], spring: [SPRING.x, SPRING.z], moonpool: [MOONPOOL.x, MOONPOOL.z], whale: [BONES.x, BONES.z],
  seat: [SEAT.x, SEAT.z], waycairn: [WAYCAIRN.x, WAYCAIRN.z], grotto: [CRAG.x, CRAG.z],
} : {};
export function areaAt(x, z) {
  let best = null, bd = 1e9;
  for (const a of AREAS) { const d = Math.hypot(x - a.x, z - a.z) / a.r; if (d < 1 && d < bd) { bd = d; best = a; } }
  return best;
}

// Shoreline radius as a function of angle. Home is a wobbly circle. The far shore is a long teardrop: close to
// the camp on the east side, over a hundred metres away to the west.
export function shoreRadius(theta) {
  if (FAR) {
    // A long island, about 400 m east to west and 300 north to south: pointed at the Landing, broad behind it.
    // Worked out on a stretched sheet (so that it is longer than it is wide) and squeezed back.
    const Q = 0.72, cs = Math.cos(theta), sn = Math.sin(theta), t2 = Math.atan2(sn / Q, cs);
    const k = Math.pow((1 - Math.cos(t2)) / 2, 1.45);
    const R = (27 + 330 * k) * (1 + 0.06 * Math.sin(3 * t2 + 1) + 0.05 * Math.sin(5 * t2 + 2.3) + 0.05 * Math.sin(9 * t2 + 0.6) * k + 0.03 * Math.sin(14 * t2 + 2) * k);
    return R / Math.hypot(cs, sn / Q);
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
// Things left on Hush Island from before: a carved post by the dock, a lamp lens in the sand, the Keeper's chest.
export const POST = { x: 26.6, z: 3.6 };
export const LENS = (() => { const a = 0.78, r = (30 + 3 * Math.sin(3 * a + 1) + 2 * Math.sin(5 * a + 2.3) + 1.2 * Math.sin(2 * a)) * 0.925; return { x: Math.cos(a) * r, z: Math.sin(a) * r }; })();
export const CHEST = { x: 4.9, z: 6.3 };
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
export const PATHS = FAR ? [
  [[5.4, 0.3], [15, 0.4], [25.4, 0]],                                                                  // camp to the jetty
  [[-5.4, 0.2], [-40, -4], [-78, -8], [-118, -3], [-150, 0], [-176, 2], [-200, 0]],                   // west through the woods and the gorge into Stillwater
  [[-78, -8], [-108, -40], [-134, -58], [-150, -70]],                                                  // north-west to Hollow Hill
  [[-40, -4], [-60, 46], [-84, 98], [-100, 126]],                                                      // south to the flats
  [[-200, 0], [-236, -10], [-270, -20], [-292, -8], [-310, 6]],                                       // up out of the valley, over the meadow, to Lantern Point
  [[-270, -20], [-286, -56], [-306, -86], [FARBEACH.x + 5, FARBEACH.z + 4]],                                                             // down to the Far Beach
  [[-100, 126], [-140, 138], [-190, 138], [-226, 112], [-262, 118], [BRIDGE.ax, BRIDGE.az]],          // along the south-west cliffs to the bridge
  [[-78, -8], [-66, -44], [-54, -82], [-45, -110]],                                                    // north out of the woods to the watchtower
  [[-60, 46], [-38, 56], [-18, 61]],                                                                    // east to the orchard
] : [
  [[0.5, 22.5], [0.9, 14], [0.3, 5.6]],
  [[5.4, 0.4], [16, -0.6], [29.6, 0]],
  [[-3.8, -3.0], [-9.5, -6.6], [-13.4, -10.6]],
  [[-5.2, 0.4], [-11, 3.2], [-17, 9.2], [-22.6, 13.2]],
];
// How far a spot is from the nearest way across the island.
export function pathDist(x, z) {
  let d = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0] - ax, bz = p[i + 1][1] - az;
    const k = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - bx * k, z - az - bz * k));
  }
  return d;
}
// Lantern Rock is not a round green hump like home: it stands out of the sea on cliffs, climbs in shelves of rock,
// and has a broken ridge along its north side. Only three places come gently down to the water: the Landing in the
// east, the Tide Flats in the south and the Far Beach behind the hills.
const COVES = [[0, 1.05], [Math.atan2(FLATS.z, FLATS.x), 0.3], [Math.atan2(FARBEACH.z, FARBEACH.x), 0.16]];
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
export function cliffAmount(theta) { let c = 1; for (const [a, w] of COVES) c *= smoothstep(w * 0.55, w * 1.2, turn(theta, a)); return c; }
function farRaw(x, z) {
  const r = Math.hypot(x, z), theta = Math.atan2(z, x), shore = shoreRadius(theta), inland = shore - r, c = cliffAmount(theta);
  if (inland < 0) {
    let h = -Math.min(5, -inland * (0.217 + 0.9 * c));
    if (Math.abs(x - ISLET.x) < 60 && Math.abs(z - ISLET.z) < 60) {
      // The islet, and the stones that lead out to it.
      const di = Math.hypot(x - ISLET.x, z - ISLET.z);
      h = Math.max(h, 4.4 * Math.exp(-di * di / (2 * 7.5 * 7.5)) - 0.5 + 0.2 * noise2(x * 0.3, z * 0.3));
      const bx = ISLET.x - FLAT_EDGE.x, bz = ISLET.z - FLAT_EDGE.z, k = clamp(((x - FLAT_EDGE.x) * bx + (z - FLAT_EDGE.z) * bz) / (bx * bx + bz * bz), -0.15, 1), dc = Math.hypot(x - FLAT_EDGE.x - bx * k, z - FLAT_EDGE.z - bz * k);
      h = Math.max(h, lerp(-1.2, TIDE.flat - 0.12, 1 - smoothstep(1.6, 4.2, dc)));
    }
    if (Math.abs(x - CHAPEL.x) < 40 && Math.abs(z - CHAPEL.z) < 40) {
      const di = Math.hypot(x - CHAPEL.x, z - CHAPEL.z);
      h = Math.max(h, (CHAPEL.y + 1.2) * (1 - smoothstep(13.5, 23, di)) - 1.2 + 0.18 * noise2(x * 0.3, z * 0.3) * smoothstep(9, 14, di));
    }
    return h;
  }
  const land = smoothstep(-0.5, 9, inland), way = 1 - smoothstep(4, 12, pathDist(x, z));
  // The edge: a beach in the coves, a wall of rock everywhere else.
  let h = 1.7 * (1 - Math.pow(r / shore, 2.2)) * (1 - 0.7 * c) + (4.5 + 3.5 * noise2(x * 0.02 + 1, z * 0.02)) * c * smoothstep(0, 3.2, inland) * smoothstep(9, 40, r);      // the high ground begins a walk away from the camp
  // Rolling ground inland, in big swells and small.
  h += (2.6 * noise2(x * 0.016 + 5, z * 0.016 - 2) + 1.4 * noise2(x * 0.04 + 5, z * 0.04 - 2) + 2.6) * smoothstep(14, 50, r) * land;
  // Stillwater: a valley in the middle of the island that cannot be seen from outside. High ground stands all
  // round it; the only easy ways in are the gorge from the woods and the path over the western lip.
  const vd = Math.hypot(x - VALLEY.x, z - VALLEY.z);
  { const rim = Math.exp(-Math.pow((vd - 64) / 17, 2)); h += (13 + 4 * noise2(x * 0.03 + 9, z * 0.03 + 2)) * rim * (1 - 0.92 * way) * land; }
  // Hollow Hill, on the valley's northern rim.
  h += bump(x, z, HOLLOW.x - 4, HOLLOW.z - 2, 17, 21) * land;
  // The High Meadow: a broad table with a flat top, west of the valley.
  { const d = Math.hypot(x - HILL.x, z - HILL.z); h += 7 * (1 - smoothstep(16, 34, d)) * land; }
  // Lantern Point: the highest ground, right up to the western edge, so it ends in a great cliff.
  h += bump(x, z, POINT.x, POINT.z, 17, 20) * smoothstep(-0.5, 2.6, inland);
  // A broken ridge of crags along the north coast.
  { const n = 1 - Math.abs(noise2(x * 0.03 + 3, z * 0.03 + 8)); h += n * n * n * 10 * smoothstep(-30, -80, z) * smoothstep(-30, -80, x) * smoothstep(1, 14, inland) * (1 - way); }
  // The Far Beach behind the hills stays low.
  h *= 1 - 0.85 * Math.exp(-(Math.pow(x - FARBEACH.x, 2) + Math.pow(z - FARBEACH.z, 2)) / (2 * 20 * 20));
  // Shelves: the high ground climbs in steps of bare rock, except where a way has been worn up it.
  if (h > 3) { const S = 2.6, f = h / S, fl = Math.floor(f), st = (fl + smoothstep(0.7, 0.98, f - fl)) * S; h = lerp(h, st, 0.8 * (1 - way) * smoothstep(3, 4.6, h) * smoothstep(16, 36, r)); }      // and not round the camp, which lies in easy ground
  // The floor of Stillwater: flat and sheltered, with a hollow in the middle for the pool.
  h = lerp(h, 3.2 + 0.5 * noise2(x * 0.08, z * 0.08) - 1.15 * (1 - smoothstep(7, 15.5, Math.hypot(x - POOL.x, z - POOL.z))), 1 - smoothstep(30, 47, vd));
  // Level ground under the crag at the falls, so that the hollow behind the water has a floor.
  h = lerp(CRAG.y, h, smoothstep(6.5, 11, Math.hypot(x - CRAG.x, z - CRAG.z - 2.5)));
  // Small bumps everywhere.
  h += (0.22 * noise2(x * 0.16, z * 0.16) + 0.08 * noise2(x * 0.45 + 9, z * 0.45 - 4)) * land;
  // The Tide Flats: pressed down almost to the water.
  { const m = Math.exp(-(Math.pow(x - FLATS.x, 2) + Math.pow(z - FLATS.z, 2)) / (2 * 30 * 30)); h = lerp(h, TIDE.flat + 0.07 * noise2(x * 0.3, z * 0.3), Math.min(1, m * 1.2) * smoothstep(-2, 3, inland)); }
  // The ledge the hot spring sits on, with a dip in it for the water.
  { const d = Math.hypot(x - SPRING.x, z - SPRING.z); h = lerp(SPRING.y - 0.5 * (1 - smoothstep(1.2, 2.6, d)), h, smoothstep(4, 7.5, d)); }
  // The dell the moon pool lies in.
  { const d = Math.hypot(x - MOONPOOL.x, z - MOONPOOL.z); h = lerp(MOONPOOL.y - 0.45 * (1 - smoothstep(1.5, 3.2, d)), h, smoothstep(4.2, 9, d)); }
  // Level ground for the keeper's cottage.
  h = lerp(COTTAGE.y, h, smoothstep(5, 9.5, Math.hypot(x - COTTAGE.x, z - COTTAGE.z)));
  // Level ground for the lighthouse to stand on.
  h = lerp(LIGHTHOUSE.y, h, smoothstep(5, 11, Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z)) );
  // The camp clearing.
  h = lerp(1.62, h, smoothstep(5.5, 11, r));
  // Level ground under the landmarks.
  for (const p of PADS) {
    if (p.busy || Math.abs(x - p.x) > p.r1 || Math.abs(z - p.z) > p.r1) continue;
    if (p.y === null) { p.busy = true; p.y = farRaw(p.x, p.z); p.busy = false; }
    h = lerp(p.y, h, smoothstep(p.r0, p.r1, Math.hypot(x - p.x, z - p.z)));
  }
  // The cove under the watchtower: a notch in the cliff with a floor the high tide covers.
  { const d = Math.hypot(x - COVE.x, z - COVE.z); if (d < 13) h = lerp(COVE.y + 0.5 * smoothstep(0, 6, (x - COVE.x) * -COVE.ox + (z - COVE.z) * -COVE.oz), h, smoothstep(5.5, 12, d)); }
  // Rock over everything that is hollow under the hill: where the land would lie too low to roof a passage, it rises.
  if (nearCave(x, z)) { const c = caveAt(x, z); if (c.deep && c.e < 9) h = Math.max(h, lerp(h, c.top + 3.2 + 1.2 * Math.sin(x * 0.31) * Math.cos(z * 0.27), 1 - smoothstep(1.5, 9, c.e))); }
  return h;
}
// The caves under Hollow Hill: a way cut through the hill from its eastern foot to its western, with two chambers
// on it (the dark gallery, then the round echo chamber). The ground is dug out along it; the hill itself, drawn
// separately as a lid (world.js), is the roof.
export const CAVE = { pts: [[-150, -70], [-166, -84], [-182, -92], [-204, -102]], y0: 9.6, y1: 3.2, half: 2.7, rooms: [[1, 6.5], [2, 7.5]], roof: 4.4,
  // A side passage from the round chamber, shut by a stone door until the chamber is made to ring, and at its end
  // a small room with a pool in it.
  branch: [[-182, -92], [-190, -76]], pool: { x: -190, z: -76, r: 5.6 }, door: { x: -185.6, z: -84.8 },
  // The rest of what is under the hill: passages off the main way, each from one spot to another at a given floor
  // height and half-width, some ending in a room. [ax, az, ay, bx, bz, by, half, room at the far end]
  more: [
    [-166, -84, 7.4, -158, -100, 7.0, 2.3, 0], [-158, -100, 7.0, -170, -112, 6.4, 2.3, 6.5],      // to the crystal gallery
    [-170, -112, 6.4, -188, -110, 5.2, 2.2, 0], [-188, -110, 5.2, -193, -97, 4.4, 2.2, 0],          // and round, back to the main way
    [-166, -84, 7.4, -171, -70, 7.8, 2.1, 0], [-171, -70, 7.8, -162, -60, 8.2, 2.1, 4.6],            // a passage that goes nowhere
    [-190, -76, 4.1, -203, -72, 3.6, 2.2, 0], [-203, -72, 3.6, -214, -82, 2.9, 2.4, 9],              // beyond the pool, down to the lake
    [-158, -77, 8.5, -151, -86, 8.6, 1.9, 3.6],                                                     // a nook near the mouth
  ],
  gallery: { x: -170, z: -112 }, deadend: { x: -162, z: -60 }, lake: { x: -214, z: -82, r: 9, y: 2.72 }, nook: { x: -151, z: -86 } };
const caveLens = CAVE.pts.slice(1).map((p, i) => Math.hypot(p[0] - CAVE.pts[i][0], p[1] - CAVE.pts[i][1])), caveLen = caveLens.reduce((a, b) => a + b, 0);
// For a spot: e, how far it is outside the hollowed space (negative inside it); u, how far along the way (0..1);
// floor, the height of the cave floor there; top, the height of the cave roof.
export function caveAt(x, z) {
  let best = 1e9, u = 0, acc = 0;
  for (let i = 0; i < CAVE.pts.length - 1; i++) {
    const ax = CAVE.pts[i][0], az = CAVE.pts[i][1], bx = CAVE.pts[i + 1][0] - ax, bz = CAVE.pts[i + 1][1] - az;
    const k = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1), d = Math.hypot(x - ax - bx * k, z - az - bz * k);
    if (d < best) { best = d; u = (acc + k * caveLens[i]) / caveLen; }
    acc += caveLens[i];
  }
  let e = best - CAVE.half, lift = 0;
  for (const [i, r] of CAVE.rooms) { const d = Math.hypot(x - CAVE.pts[i][0], z - CAVE.pts[i][1]); e = Math.min(e, d - r); lift = Math.max(lift, 1.8 * (1 - smoothstep(0, r, d))); }
  let floor = lerp(CAVE.y0, CAVE.y1, u);
  { // the side passage: measured the same way, and taken if it is the nearer
    const [a, b] = CAVE.branch, bx = b[0] - a[0], bz = b[1] - a[1], k = clamp(((x - a[0]) * bx + (z - a[1]) * bz) / (bx * bx + bz * bz), 0, 1);
    const d = Math.hypot(x - a[0] - bx * k, z - a[1] - bz * k), dp = Math.hypot(x - CAVE.pool.x, z - CAVE.pool.z), eb = Math.min(d - 2.4, dp - CAVE.pool.r);
    if (eb < e) { e = eb; u = BRANCH_U; floor = BRANCH_Y - 1.0 * k - 0.5 * (1 - smoothstep(1.5, CAVE.pool.r - 1, dp)); lift = 1.2 * (1 - smoothstep(0, CAVE.pool.r, dp)); }
  }
  let deep = eDeep(e, u);
  for (const [ax, az, ay, bx, bz, by, half, room] of CAVE.more) {
    const dx = bx - ax, dz = bz - az, k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    let em = Math.hypot(x - ax - dx * k, z - az - dz * k) - half, fl = lerp(ay, by, k), lf = 0;
    if (room) { const d = Math.hypot(x - bx, z - bz); if (d - room < em) { em = d - room; fl = by - (room > 8 ? 1.1 * (1 - smoothstep(2, room - 1.5, d)) : 0); } lf = 1.6 * (1 - smoothstep(0, room, d)); }
    if (em < e) { e = em; u = BRANCH_U; floor = fl; lift = lf; deep = true; }
  }
  return { e, u, floor, top: floor + CAVE.roof + lift, deep };
}
// Whether a spot on the main way is far enough in from either mouth to want rock over it.
const eDeep = (e, u) => u > 0.1 && u < 0.9;
const BRANCH_U = (caveLens[0] + caveLens[1]) / caveLen, BRANCH_Y = lerp(CAVE.y0, CAVE.y1, BRANCH_U);
const nearCave = (x, z) => x < -136 && x > -232 && z < -46 && z > -128;
function farHeight(x, z) {
  const h = farRaw(x, z);
  if (!nearCave(x, z)) return h;
  const c = caveAt(x, z);
  return c.e > 2.4 || h <= c.floor ? h : lerp(c.floor, h, smoothstep(0, 2.4, c.e));
}
// The land as it would be with no cave dug in it (the hill's outside), and whether a spot has the hill for a roof.
export const terrainRaw = (x, z) => (FAR ? farRaw(x, z) : terrainHeight(x, z));
export function caveRoofed(x, z, reach = 2.6) { if (!FAR || !nearCave(x, z)) return false; const c = caveAt(x, z); return c.e < reach && farRaw(x, z) > c.top + 0.7; }
export const inCave = (x, z) => caveRoofed(x, z, 0.4);
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

if (FAR) {
  BRIDGE.ya = terrainHeight(BRIDGE.ax, BRIDGE.az) + 0.12; BRIDGE.yb = terrainHeight(BRIDGE.bx, BRIDGE.bz) + 0.12;
  const n = 15, u = { x: Math.cos(ST_A), z: Math.sin(ST_A) }, r0 = ST_R - 2.4, r1 = ST_R + 31 - STACK.r + 0.6, y0 = terrainHeight(u.x * r0, u.z * r0);
  for (let i = 0; i < n; i++) { const k = i / (n - 1), r = lerp(r0, r1, k), side = Math.sin(i * 1.7) * 0.9; const st = { x: u.x * r - u.z * side, z: u.z * r + u.x * side, y: lerp(y0, STACK.y, k) + (i % 2 ? 0.14 : -0.1) * Math.sin(k * Math.PI), r: 1.5 }; if (i === 8) Object.assign(STEP_GAP, st); else STEPS.push(st); }
  BOOST.y = terrainHeight(BOOST.x, BOOST.z) + 3.0;
  STEPS.push({ x: STACK.x, z: STACK.z, y: STACK.y, r: STACK.r });
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
  if (BRIDGE.on && Math.abs(x - CHAPEL.x) < 70 && Math.abs(z - CHAPEL.z) < 70) { const k = bridgeAt(x, z); if (k >= 0) return Math.max(h, bridgeY(k)); }
  if (Math.abs(x - STACK.x) < 45 && Math.abs(z - STACK.z) < 45) { let y = h; for (const st of STEPS) if (Math.hypot(x - st.x, z - st.z) < st.r) y = Math.max(y, st.y); if (y > h) return y; }
  if (Math.abs(x - LEAP.x) < 3 && Math.hypot(x - LEAP.x, z - LEAP.z) < LEAP.r) return Math.max(h, LEAP.y);
  if (Math.abs(x - BOOST.x) < 3 && Math.hypot(x - BOOST.x, z - BOOST.z) < BOOST.r) return Math.max(h, BOOST.y);
  for (const st of STONES) if (Math.abs(x - st.x) < 0.75 && Math.abs(z - st.z) < 0.75 && Math.hypot(x - st.x, z - st.z) < 0.72) return Math.max(h, POOL.y + 0.1);      // a stepping stone
  return h;
}

export function walkable(x, z) {
  if (onDock(x, z) || onSlip(x, z)) return true;
  if (BRIDGE.on && Math.abs(x - CHAPEL.x) < 70 && Math.abs(z - CHAPEL.z) < 70 && bridgeAt(x, z) >= 0) return true;
  if (Math.abs(x - STACK.x) < 45 && Math.abs(z - STACK.z) < 45) for (const st of STEPS) if (Math.hypot(x - st.x, z - st.z) < st.r - 0.15) return true;
  if (Math.abs(x - LEAP.x) < 3 && Math.hypot(x - LEAP.x, z - LEAP.z) < LEAP.r - 0.15) return true;
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
