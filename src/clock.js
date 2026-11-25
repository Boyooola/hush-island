// Island time. One island day takes 48 real minutes and runs off the clock on the wall,
// so every visitor is always in the same hour of the same day.
export const DAY_MS = 48 * 60000;
export function islandHour(now = Date.now()) { return ((now % DAY_MS) / DAY_MS) * 24; }
export function clockText(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  const part = h < 5.5 || h >= 19.5 ? 'Night' : h < 8 ? 'Dawn' : h < 16.5 ? 'Day' : 'Dusk';
  return `${part}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Where the island day stands, for the little bar on screen: which part of the day it is, what comes next
// and in how many real minutes, and how far along the bar the marker sits (the bar runs dawn to dawn).
const PARTS = [[5.5, 'Dawn'], [8, 'Day'], [16.5, 'Dusk'], [19.5, 'Night']];
export const DAY_BAR_START = 5.5;
export function dayInfo(h) {
  let i = PARTS.length - 1;
  for (let k = 0; k < PARTS.length; k++) if (h >= PARTS[k][0]) i = k;
  if (h < PARTS[0][0]) i = PARTS.length - 1;
  const next = PARTS[(i + 1) % PARTS.length];
  const hours = (next[0] - h + 24) % 24;
  return { part: PARTS[i][1], next: next[1], minutes: hours * (DAY_MS / 60000 / 24), pos: ((h - DAY_BAR_START + 24) % 24) / 24, night: i === 3 };
}

// What the sky and light look like at a few hours; everything between is blended.
// dark: 1 at night, 0 by day (fireflies, stars and lamps follow it).
const KEYS = [
  { h: 0, top: 0x050a1e, mid: 0x0d1c40, hor: 0x142a4d, sky: 0x6f8fd8, ground: 0x333c66, hemi: 1.45, key: 0x9db8ff, keyI: 1.5, fill: 0.3, dark: 1, fog: 0.0105, sea: 0x1a4a68, far: 0x0b1730 },
  { h: 5.5, top: 0x050a1e, mid: 0x0d1c40, hor: 0x142a4d, sky: 0x6f8fd8, ground: 0x333c66, hemi: 1.45, key: 0x9db8ff, keyI: 1.5, fill: 0.3, dark: 1, fog: 0.0105, sea: 0x1a4a68, far: 0x0b1730 },
  { h: 6.6, top: 0x27407e, mid: 0x8a78ac, hor: 0xf0a47c, sky: 0xb7a6d6, ground: 0x6a5a66, hemi: 1.5, key: 0xffb080, keyI: 1.5, fill: 0.35, dark: 0.3, fog: 0.008, sea: 0x3d6f8f, far: 0x54507a },
  { h: 8.2, top: 0x2c78c8, mid: 0x6aaee6, hor: 0xb8def0, sky: 0xcfe4ff, ground: 0x8e9a72, hemi: 1.75, key: 0xfff0d6, keyI: 2.3, fill: 0.45, dark: 0, fog: 0.0055, sea: 0x2f86ad, far: 0x7fa6c4 },
  { h: 16.4, top: 0x2c78c8, mid: 0x6aaee6, hor: 0xb8def0, sky: 0xcfe4ff, ground: 0x8e9a72, hemi: 1.75, key: 0xfff0d6, keyI: 2.3, fill: 0.45, dark: 0, fog: 0.0055, sea: 0x2f86ad, far: 0x7fa6c4 },
  { h: 18.2, top: 0x1d2660, mid: 0x74508e, hor: 0xff8c5c, sky: 0xae92c6, ground: 0x5e4c5c, hemi: 1.4, key: 0xff9668, keyI: 1.5, fill: 0.3, dark: 0.35, fog: 0.008, sea: 0x3a5f86, far: 0x3c3560 },
  { h: 19.6, top: 0x050a1e, mid: 0x0d1c40, hor: 0x142a4d, sky: 0x6f8fd8, ground: 0x333c66, hemi: 1.45, key: 0x9db8ff, keyI: 1.5, fill: 0.3, dark: 1, fog: 0.0105, sea: 0x1a4a68, far: 0x0b1730 },
  { h: 24, top: 0x050a1e, mid: 0x0d1c40, hor: 0x142a4d, sky: 0x6f8fd8, ground: 0x333c66, hemi: 1.45, key: 0x9db8ff, keyI: 1.5, fill: 0.3, dark: 1, fog: 0.0105, sea: 0x1a4a68, far: 0x0b1730 },
];
const mixHex = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
// Rain: on most island days one spell of about four minutes blows in off the sea. 0 is dry, 1 is pouring.
function roll(n) { let x = (Math.floor(n) ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
export function rainAt(now = Date.now()) {
  const d = Math.floor(now / DAY_MS);
  if (roll(d * 5 + 3) > 0.7) return 0;
  const start = d * DAY_MS + (0.12 + roll(d * 7 + 1) * 0.7) * DAY_MS, len = 270000, since = now - start;
  if (since < 0 || since > len) return 0;
  return Math.min(1, since / 30000, (len - since) / 30000);
}

export function skyAt(h, rain = 0) {
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  t = t * t * (3 - 2 * t);
  const out = { h };
  for (const k of ['top', 'mid', 'hor', 'sky', 'ground', 'key', 'sea', 'far']) out[k] = mixHex(a[k], b[k], t);
  for (const k of ['hemi', 'keyI', 'fill', 'dark', 'fog']) out[k] = a[k] + (b[k] - a[k]) * t;
  if (rain > 0) {
    // Cloud: colours drain toward grey and the light drops.
    const grey = mixHex(0x7a8492, 0x0e131c, out.dark), r = rain * 0.75;
    for (const k of ['top', 'mid', 'hor']) out[k] = mixHex(out[k], grey, r);
    out.sea = mixHex(out.sea, mixHex(0x4a6272, 0x12222e, out.dark), r);
    out.keyI *= 1 - 0.6 * rain; out.hemi *= 1 - 0.22 * rain; out.fog += 0.005 * rain;
    out.cloud = rain;
  }
  // The sun climbs from the east at dawn and sets in the west at dusk.
  const s = Math.min(1, Math.max(0, (h - 6) / 13)) * Math.PI;
  out.sun = [Math.cos(s) * 0.85, Math.sin(s) * 0.9 + 0.06, -0.42];
  return out;
}
