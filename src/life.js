// Things that live on and around the island: fish under the dock, splashes and shaken-off droplets,
// and the falling stars everyone sees at the same moment.
import { loadProps } from './props.js';
import { timeNow } from './now.js';
import * as THREE from 'three';
import { DOCK, HILL, clamp, lerp, shoreRadius, terrainHeight } from './terrain.js';
import { DAY_MS } from './clock.js';
import { makeGlowTexture } from './labels.js';

// A small repeatable random number from a whole number, so every visitor rolls the same dice.
function hash(n) {
  let x = (Math.floor(n) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Falling stars come as a shower at island midnight, once every island day.
const SHOWER_MS = 150000;
export function showerState(now = timeNow()) {
  const since = now % DAY_MS;
  if (since < SHOWER_MS) return { on: true, startsIn: 0, endsIn: SHOWER_MS - since };
  return { on: false, startsIn: DAY_MS - since, endsIn: 0 };
}

export function buildLife(scene, world) {
  const updaters = [];

  // ---------- fish under the end of the dock ----------
  const HOME = { x: DOCK.x1 + 0.9, z: 0 };
  const fish = [];
  {
    const shape = new THREE.Shape();
    shape.moveTo(0.34, 0);
    shape.quadraticCurveTo(0.12, 0.12, -0.16, 0.04);
    shape.lineTo(-0.34, 0.13);
    shape.lineTo(-0.28, 0);
    shape.lineTo(-0.34, -0.13);
    shape.lineTo(-0.16, -0.04);
    shape.quadraticCurveTo(0.12, -0.12, 0.34, 0);
    const geo = new THREE.ShapeGeometry(shape, 6);
    geo.rotateX(-Math.PI / 2);          // flat on the water, nose along +x
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x06101e, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
      m.scale.setScalar(0.8 + hash(i * 3 + 2) * 0.7);
      m.renderOrder = 2;
      scene.add(m);
      fish.push({
        m, a: hash(i) * 6.28, speed: (0.32 + hash(i * 5) * 0.3) * (i % 2 ? 1 : -1), rx: 1.1 + hash(i * 11) * 2.0, rz: 0.9 + hash(i * 13) * 1.6,
        ph: hash(i * 17) * 6.28, x: HOME.x, z: 0, scare: 0, gone: 0, sx: 0, sz: 0,
      });
    }
  }
  // One fish, now and then, jumps clear of the water.
  const jumper = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xbfd3de, roughness: 0.35, metalness: 0.3, emissive: 0x24313a }));
  jumper.scale.set(2.2, 0.8, 0.5);
  jumper.visible = false;
  scene.add(jumper);
  let jump = null, nextJump = 9;
  updaters.push((dt, t) => {
    for (const f of fish) {
      if (f.gone > 0) { f.gone -= dt; f.m.visible = false; continue; }
      f.m.visible = true;
      f.scare = Math.max(0, f.scare - dt * 0.45);
      f.a += dt * f.speed * (1 + f.scare * 5);
      const px = f.x, pz = f.z;
      // A looping path round the end of the dock; a scare pushes it out to sea for a moment.
      const tx = HOME.x + Math.cos(f.a) * f.rx + f.sx * f.scare * 4, tz = HOME.z + Math.sin(f.a * 1.3 + f.ph) * f.rz + f.sz * f.scare * 4;
      f.x = lerp(f.x, tx, 1 - Math.exp(-dt * 3)); f.z = lerp(f.z, tz, 1 - Math.exp(-dt * 3));
      f.m.position.set(f.x, world.seaY(f.x, f.z) + (f.model ? -0.03 + Math.sin(t * 2.3 + f.ph) * 0.03 : 0.03), f.z);
      if (Math.hypot(f.x - px, f.z - pz) > 1e-4) f.m.rotation.y = Math.atan2(-(f.z - pz), f.x - px) + Math.sin(t * 9 + f.ph) * 0.18;
      if (!f.model) f.m.material.opacity = 0.5 * (1 - 0.75 * f.scare);
    }
    nextJump -= dt;
    if (nextJump < 0 && !jump) {
      nextJump = 10 + Math.random() * 14;
      const f = fish[Math.floor(Math.random() * fish.length)];
      if (f.gone <= 0 && f.scare < 0.1) jump = { x: f.x, z: f.z, yaw: f.m.rotation.y, k: 0 };
      if (jump) world.ripple(jump.x, jump.z);
    }
    if (jump) {
      jump.k += dt / 0.8;
      const k = jump.k, ahead = k * 0.9;
      jumper.visible = true;
      jumper.position.set(jump.x + Math.cos(jump.yaw) * ahead, Math.sin(k * Math.PI) * 0.55, jump.z - Math.sin(jump.yaw) * ahead);
      jumper.rotation.set(0, jump.yaw, Math.cos(k * Math.PI) * 0.9);
      if (k >= 1) { world.ripple(jumper.position.x, jumper.position.z); jumper.visible = false; jump = null; }
    }
  });

  // ---------- schools in the shallows, all round the island ----------
  const schools = [];
  {
    const geo = fish[0].m.geometry, mat = new THREE.MeshBasicMaterial({ color: 0x071320, transparent: true, opacity: 0.42, depthWrite: false, fog: false });
    for (let k = 0; k < 6; k++) {
      const a = 0.5 + k * 1.05 + hash(k * 31) * 0.5, r = shoreRadius(a) + 2.2 + hash(k * 37) * 2.5;
      const school = { a, r, turn: (k % 2 ? 1 : -1) * (0.012 + hash(k * 41) * 0.01), list: [] };
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.scale.setScalar(0.45 + hash(k * 7 + i) * 0.3);
        m.renderOrder = 2;
        scene.add(m);
        school.list.push({ m, off: hash(k * 13 + i * 3) * 6.28, wide: 0.4 + hash(k * 17 + i) * 1.1 });
      }
      schools.push(school);
    }
  }
  updaters.push((dt, t) => {
    for (const sc of schools) {
      sc.a += sc.turn * dt;
      const r = shoreRadius(sc.a) + (sc.r - shoreRadius(sc.a)) * 1;
      for (const f of sc.list) {
        // Each fish weaves about the middle of its school as the school follows the shore.
        const a = sc.a + Math.sin(t * 0.5 + f.off) * 0.03 * f.wide, rr = sc.r + Math.cos(t * 0.37 + f.off * 2) * f.wide;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        f.m.position.set(x, world.seaY(x, z) + 0.03, z);
        f.m.rotation.y = -(a + Math.sign(sc.turn) * Math.PI / 2) + Math.sin(t * 8 + f.off) * 0.2;
      }
    }
  });

  // ---------- gulls, by day ----------
  const gulls = [];
  {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.14, 1.0, 0.06, -0.05], 3));
    wing.computeVertexNormals();
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f6f8, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, white), r = new THREE.Mesh(wing, white);
      r.scale.x = -1;
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), white); body.rotation.x = Math.PI / 2;
      g.add(l, r, body);
      g.scale.setScalar(1.3);
      scene.add(g);
      gulls.push({ g, l, r, a: hash(i * 5 + 3) * 6.28, rad: 26 + hash(i * 9) * 34, h: 11 + hash(i * 11) * 12, sp: (0.07 + hash(i * 3) * 0.05) * (i % 2 ? 1 : -1), ph: hash(i) * 6 });
    }
    // A skein of birds high over the hill, in a loose V, for anyone lying back to watch the sky.
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, white), r = new THREE.Mesh(wing, white);
      r.scale.x = -1;
      g.add(l, r);
      g.scale.setScalar(1.1);
      scene.add(g);
      const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      gulls.push({ g, l, r, a: 0, rad: 30 + rank * side * 1.6, lag: rank * 0.06, h: 36 - rank * 0.4, sp: 0.085, ph: i * 0.9, cx: HILL.x, cz: HILL.z, flock: true });
    }
    gulls.mat = white;
    // The modelled gull (props.glb): a body with a head, beak and tail, and two wings that beat.
    loadProps().then((make) => {
      if (!make || !make('gull')) return;
      const mats = new Set();
      for (const b of gulls) {
        const body = make('gull', 'gull_wing'), l = make('gull_wing_l'), r = make('gull_wing_r');
        l.position.set(0.05, 0.03, 0); r.position.set(-0.05, 0.03, 0);
        while (b.g.children.length) b.g.remove(b.g.children[0]);
        b.g.add(body, l, r); b.l = l; b.r = r;
        b.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.material.transparent = true; o.material.side = THREE.DoubleSide; mats.add(o.material); } });
      }
      gulls.mats = [...mats];
    });
  }
  let daylight = 0;
  updaters.push((dt, t) => {
    gulls.mat.opacity = daylight;
    if (gulls.mats) for (const m of gulls.mats) m.opacity = daylight;
    for (const b of gulls) {
      b.g.visible = daylight > 0.02;
      if (!b.g.visible) continue;
      if (b.flock) b.a = (timeNow() / 1000) * b.sp - b.lag; else b.a += b.sp * dt;
      b.g.position.set((b.cx || 0) + Math.cos(b.a) * b.rad, b.h + Math.sin(t * 0.3 + b.ph) * (b.flock ? 0.3 : 1.5), (b.cz || 0) + Math.sin(b.a) * b.rad);
      b.g.rotation.y = -b.a + (b.sp > 0 ? 0 : Math.PI);
      // Long glides with a few slow beats between.
      const beat = b.flock ? Math.sin(t * 5 + b.ph) * 0.45 : Math.max(0, Math.sin(t * 0.5 + b.ph)) * Math.sin(t * 7 + b.ph) * 0.5;
      b.l.rotation.z = beat + 0.08; b.r.rotation.z = -(beat + 0.08);
    }
  });

  // ---------- butterflies over the grass, by day ----------
  const meadows = [];
  {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, 0, 0, -0.05, 0.11, 0, -0.07, 0, 0, 0.05, 0.11, 0, -0.07, 0.1, 0, 0.08], 3));
    wingGeo.computeVertexNormals();
    const colours = [0xffc85a, 0xf4f1e6, 0x8fd0ff, 0xff9a7a];
    // Meadows: open grass a little way from the fire.
    for (let i = 0; i < 40 && meadows.length < 3; i++) {
      const a = hash(i * 3 + 50) * 6.283, r = 9 + hash(i * 7 + 51) * 9, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) < 0.9 || meadows.some((m) => Math.hypot(m.x - x, m.z - z) < 9)) continue;
      const mdw = { x, z, y: terrainHeight(x, z), scare: 0, list: [] };
      for (let j = 0; j < 5; j++) {
        const mat = new THREE.MeshBasicMaterial({ color: colours[(i + j) % colours.length], side: THREE.DoubleSide, transparent: true, opacity: 0 });
        const g = new THREE.Group(), l = new THREE.Mesh(wingGeo, mat), rr = new THREE.Mesh(wingGeo, mat);
        rr.scale.x = -1;
        g.add(l, rr);
        scene.add(g);
        mdw.list.push({ g, l, r: rr, mat, ph: hash(i * 11 + j) * 6.28, wide: 0.8 + hash(i * 13 + j) * 1.6, up: 0.5 + hash(i * 17 + j) * 0.7 });
      }
      meadows.push(mdw);
    }
  }
  let dayNow = 0, rainNow = 0;
  updaters.push((dt, t) => {
    const show = dayNow * (1 - rainNow);
    for (const m of meadows) {
      m.scare = Math.max(0, m.scare - dt * 0.35);
      for (const b of m.list) {
        b.g.visible = show > 0.03;
        if (!b.g.visible) continue;
        b.mat.opacity = show;
        const s = 1 + m.scare * 2.2;
        b.g.position.set(m.x + Math.sin(t * 0.6 + b.ph) * b.wide * s, m.y + b.up + Math.sin(t * 1.7 + b.ph * 2) * 0.25 + m.scare * 2.2, m.z + Math.cos(t * 0.47 + b.ph * 1.3) * b.wide * s);
        b.g.rotation.y = t * 0.6 + b.ph;
        const flap = Math.sin(t * (18 + m.scare * 10) + b.ph) * 1.0;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    }
  });

  // ---------- a flat stone that soaks up the sun ----------
  const STONE = { x: 0, z: 0 };
  {
    let best = null;
    for (let i = 0; i < 60 && !best; i++) {
      const a = 0.9 + hash(i * 5 + 80) * 1.6, r = 11 + hash(i * 9 + 81) * 6, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) > 1.0 && Math.abs(terrainHeight(x + 1.2, z) - terrainHeight(x - 1.2, z)) < 0.35) best = { x, z };
    }
    Object.assign(STONE, best || { x: 8, z: 13 });
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.55, 0), new THREE.MeshStandardMaterial({ color: 0x9a9fa8, roughness: 0.9, flatShading: true }));
    m.scale.set(1, 0.1, 0.82);
    m.position.set(STONE.x, terrainHeight(STONE.x, STONE.z) + 0.03, STONE.z);
    m.rotation.y = 0.7;
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---------- rain ----------
  const RAIN = 700, rainPos = new Float32Array(RAIN * 6), rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN * 3; i++) rainSeed[i] = Math.random();
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc6d8e8, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  rainLines.frustumCulled = false; rainLines.visible = false;
  scene.add(rainLines);
  let rainT = 0, rainRipple = 0;
  const rainCentre = new THREE.Vector3();
  updaters.push((dt) => {
    rainLines.visible = rainNow > 0.02;
    if (!rainLines.visible) return;
    rainT += dt;
    rainLines.material.opacity = 0.5 * rainNow;
    rainGeo.setDrawRange(0, Math.floor(RAIN * rainNow) * 2);
    for (let i = 0; i < RAIN; i++) {
      // Each drop falls through a box that travels with the viewer.
      const x = rainCentre.x + (rainSeed[i * 3] - 0.5) * 34, z = rainCentre.z + (rainSeed[i * 3 + 2] - 0.5) * 34;
      const y = rainCentre.y + 9 - ((rainSeed[i * 3 + 1] * 16 + rainT * 17) % 16);
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x + 0.05; rainPos[i * 6 + 4] = y - 0.55; rainPos[i * 6 + 5] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
    // Rings on the sea where the drops land.
    rainRipple -= dt;
    if (rainRipple < 0) {
      rainRipple = 0.12 / Math.max(0.2, rainNow);
      const a = Math.random() * 6.283, r = shoreRadius(a) + 1 + Math.random() * 9;
      world.ripple(Math.cos(a) * r, Math.sin(a) * r);
    }
  });

  // ---------- droplets: a splash in the sea, or a wet coat shaken off ----------
  const DROPS = 90;
  const dropPos = new Float32Array(DROPS * 3), dropVel = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  for (let i = 0; i < DROPS; i++) dropPos[i * 3 + 1] = -50;
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xd8ecf5, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, map: makeGlowTexture('rgba(255,255,255,1)'), sizeAttenuation: true }));
  drops.frustumCulled = false;
  scene.add(drops);
  let dropAt = 0;
  function spray(x, y, z, n, out, up) {
    for (let i = 0; i < n; i++) {
      const j = dropAt++ % DROPS, a = Math.random() * 6.283, s = out * (0.4 + Math.random() * 0.6);
      dropPos[j * 3] = x; dropPos[j * 3 + 1] = y; dropPos[j * 3 + 2] = z;
      dropVel[j * 3] = Math.cos(a) * s; dropVel[j * 3 + 1] = up * (0.5 + Math.random() * 0.6); dropVel[j * 3 + 2] = Math.sin(a) * s;
      dropLife[j] = 1;
    }
  }
  updaters.push((dt) => {
    let any = false;
    for (let j = 0; j < DROPS; j++) {
      if (dropLife[j] <= 0) continue;
      any = true;
      dropVel[j * 3 + 1] -= 9 * dt;
      dropPos[j * 3] += dropVel[j * 3] * dt; dropPos[j * 3 + 1] += dropVel[j * 3 + 1] * dt; dropPos[j * 3 + 2] += dropVel[j * 3 + 2] * dt;
      dropLife[j] -= dt * 1.1;
      if (dropLife[j] <= 0 || dropPos[j * 3 + 1] < 0) { dropLife[j] = 0; dropPos[j * 3 + 1] = -50; }
    }
    if (any) dropGeo.attributes.position.needsUpdate = true;
  });

  // ---------- falling stars ----------
  const streakTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 16;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.75, 'rgba(210,228,255,0.55)');
    grad.addColorStop(0.97, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(250, 3); g.lineTo(256, 8); g.lineTo(250, 13); g.closePath(); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const streaks = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    m.visible = false; m.frustumCulled = false; m.matrixAutoUpdate = false;
    scene.add(m);
    streaks.push({ m, k: 1 });
  }
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _zv = new THREE.Vector3(), _yv = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  let streakAt = 0;
  // One falling star. The same seed draws the same star for everyone.
  function meteor(seed) {
    if (daylight > 0.5) return;
    const s = streaks[streakAt++ % streaks.length];
    const az = hash(seed) * 6.283, el = 0.3 + hash(seed + 1) * 0.75;
    s.p0 = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(380);
    // Across the sky and a little downward.
    _zv.copy(s.p0).normalize();
    _t.crossVectors(_zv, _up).normalize().multiplyScalar(hash(seed + 2) < 0.5 ? 1 : -1);
    s.dir = _t.clone().addScaledVector(_up, -(0.25 + hash(seed + 3) * 0.5)).normalize();
    s.len = 46 + hash(seed + 4) * 50; s.travel = 90 + hash(seed + 5) * 80; s.dur = 0.7 + hash(seed + 6) * 0.6; s.k = 0;
    s.m.visible = true;
  }
  let lastSlot = 0, showerOn = false, forced = 0;
  // ---------- modelled sea life ----------
  // The fish at the dock start as plain shapes, so they are there at once. When the models arrive (sea.json, packed
  // by tools/pack_models.mjs from Quaternius's public-domain Fish Pack) they take the shapes' places, a dolphin
  // starts leaping offshore now and then, and once in a long while a whale shows its back far out.
  // Both keep to the wall clock, so everyone on the island sees the same leap at the same moment.
  const seaLife = { dolphin: null, whale: null };
  function applySea(models) {
    const geo = (name, length) => {
      const m = models[name];
      if (!m) return null;
      const raw = (b64, T) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };
      const p16 = raw(m.p, Int16Array), c8 = raw(m.c, Uint8Array);
      const pos = new Float32Array(p16.length), col = new Float32Array(c8.length), c = new THREE.Color();
      for (let i = 0; i < p16.length; i++) pos[i] = p16[i] * m.k;
      for (let i = 0; i < c8.length; i += 3) { c.setRGB(c8[i] / 255, c8[i + 1] / 255, c8[i + 2] / 255, THREE.SRGBColorSpace); col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.center();
      g.rotateY(SEA_TURN);                  // the models lie along z; here a nose points along +x
      g.computeBoundingBox();
      const len = g.boundingBox.max.x - g.boundingBox.min.x;
      g.scale(length / len, length / len, length / len);
      g.computeVertexNormals();
      return g;
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, flatShading: true, emissive: 0x223344, emissiveIntensity: 0.25 });
    const kinds = [geo('Fish3', 0.5), geo('Fish2', 0.56), geo('Fish1', 0.7)].filter(Boolean);
    if (kinds.length) {
      fish.forEach((f, i) => {
        const k = f.m.scale.x;
        f.m.geometry = kinds[i % kinds.length]; f.m.material = mat; f.m.renderOrder = 0;
        f.m.scale.setScalar(0.8 + (k - 0.8) * 0.5);
        f.model = true;
      });
      jumper.geometry = kinds[1 % kinds.length]; jumper.material = mat; jumper.scale.setScalar(1.1);
    }
    const dg = geo('Dolphin', 2.5), wg = geo('Whale', 15);
    if (dg) { seaLife.dolphin = new THREE.Mesh(dg, mat); seaLife.dolphin.visible = false; scene.add(seaLife.dolphin); }
    if (wg) { seaLife.whale = new THREE.Mesh(wg, mat); seaLife.whale.visible = false; scene.add(seaLife.whale); }
  }
  // Dolphins that come alongside the boat on her voyage: two of them, leaping in turn a little way off her beam.
  const escorts = [];
  let escortPose = null, escortFrom = 0;
  const SEA_TURN = Math.PI / 2;
  const DOLPHIN_EVERY = 95, WHALE_EVERY = 540;
  let lastSplash = -1;
  updaters.push(() => {
    const now = timeNow() / 1000;
    const d = seaLife.dolphin;
    if (d) {
      // Three leaps in a row along the shore, somewhere out past the shallows, every minute and a half or so.
      const n = Math.floor(now / DOLPHIN_EVERY), k = now - n * DOLPHIN_EVERY, leap = Math.floor(k / 1.9), u = k / 1.9 - leap;
      d.visible = leap < 3;
      if (d.visible) {
        const a0 = hash(n * 7 + 3) * 6.28, dir = hash(n * 11) > 0.5 ? 1 : -1, r = shoreRadius(a0) + 12 + hash(n * 5) * 10;      // out past the shallows, whatever the island's shape
        const a = a0 + dir * (leap + u) * 0.075;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, y = world.seaY(x, z) - 0.5 + Math.sin(u * Math.PI) * 1.9;
        d.position.set(x, y, z);
        // Heading along the shore, nose up on the way out of the water and down on the way back in.
        d.rotation.set(0, Math.atan2(-(dir * Math.cos(a)), dir * -Math.sin(a)), Math.cos(u * Math.PI) * 0.9, 'YZX');
        const mark = n * 10 + leap * 2 + (u > 0.5 ? 1 : 0);
        if (mark !== lastSplash && (u < 0.12 || u > 0.88)) { lastSplash = mark; world.ripple(x, z); }
      }
    }
    if (d && !escorts.length) for (let i = 0; i < 2; i++) { const e = new THREE.Mesh(d.geometry, d.material); e.visible = false; scene.add(e); escorts.push(e); }
    escorts.forEach((e, i) => {
      // One visit a voyage: each of the two leaps twice, in turn, and then they are gone.
      const p = escortPose, since = now - escortFrom - i * 1.7, n = Math.floor(since / 3.4), u = (since - n * 3.4) / 1.5;
      e.visible = !!p && since >= 0 && n < 2 && u < 1;
      if (!e.visible) { e.userData.wet = 0; return; }
      // Abreast of the boat and a few lengths off, one each side, drawing ahead through the leap.
      const side = i ? -1 : 1, off = 4.6 + i * 1.3, fwd = -1.5 + u * 4.5 + i * 1.2;
      const x = p.x + p.hx * fwd - p.hz * off * side, z = p.z + p.hz * fwd + p.hx * off * side;
      e.position.set(x, world.seaY(x, z) - 0.5 + Math.sin(u * Math.PI) * 1.8, z);
      e.rotation.set(0, Math.atan2(-p.hz, p.hx), Math.cos(u * Math.PI) * 0.9, 'YZX');
      const mark = u < 0.5 ? 1 : 2;
      if (e.userData.wet !== mark && (u < 0.12 || u > 0.88)) { e.userData.wet = mark; world.ripple(x, z); }
    });
    const w = seaLife.whale;
    if (w) {
      // Far out, a whale's back rises, rolls forward and sinks again.
      const n = Math.floor(now / WHALE_EVERY), k = now - n * WHALE_EVERY, u = k / 16;
      w.visible = u < 1;
      if (w.visible) {
        const a = hash(n * 13 + 1) * 6.28, r = shoreRadius(a) + 73 + hash(n * 3) * 25, x = Math.cos(a) * r + u * 9 * Math.sin(a), z = Math.sin(a) * r - u * 9 * Math.cos(a);
        w.position.set(x, world.seaY(x, z) - 4.6 + Math.sin(u * Math.PI) * 3.3, z);
        w.rotation.set(0, Math.atan2(Math.cos(a), Math.sin(a)), (0.5 - u) * 0.5, 'YZX');
      }
    }
  });

  const events = { onShower: null };
  updaters.push((dt) => {
    // The sky keeps time by the clock on the wall, so everyone sees the same stars fall.
    const now = timeNow(), st = showerState(now), on = st.on || forced > now;
    if (on !== showerOn) { showerOn = on; if (events.onShower) events.onShower(on); }
    const slotMs = on ? 1300 : 20000, slot = Math.floor(now / slotMs);
    if (slot !== lastSlot) {
      lastSlot = slot;
      if (hash(slot * 13 + (on ? 5 : 9)) < (on ? 0.8 : 0.14)) meteor(slot);
      if (on && hash(slot * 29) < 0.3) meteor(slot + 7777);
    }
    for (const s of streaks) {
      if (s.k >= 1) continue;
      s.k = Math.min(1, s.k + dt / s.dur);
      _p.copy(s.p0).addScaledVector(s.dir, s.travel * s.k - s.len / 2);
      _zv.copy(_p).normalize().negate();
      _yv.crossVectors(_zv, s.dir).normalize();
      s.m.matrix.makeBasis(_t.copy(s.dir).multiplyScalar(s.len), _yv.multiplyScalar(2.6), _zv).setPosition(_p);
      s.m.matrixWorldNeedsUpdate = true;
      s.m.material.opacity = Math.sin(s.k * Math.PI) * 0.95;
      if (s.k >= 1) s.m.visible = false;
    }
  });

  return {
    events,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    // Fetch the modelled fish, dolphin and whale. The sea works without them.
    async loadSea(url = 'sea.json') { try { const r = await fetch(url); if (!r.ok) return null; const models = await r.json(); applySea(models); return models; } catch (e) { return null; } },
    get seaLife() { return seaLife; },
    setDaylight(v) { daylight = v; dayNow = v; },
    // How hard it is raining (0 to 1), and where the viewer is so the rain falls round them.
    setRain(v, centre) { rainNow = v; if (centre) rainCentre.copy(centre); },
    stone: STONE,
    // The nearest meadow of butterflies and how far off it is.
    meadowNear(x, z) { let best = null, bd = 1e9; for (const m of meadows) { const d = Math.hypot(m.x - x, m.z - z); if (d < bd) { bd = d; best = m; } } return { meadow: best, dist: bd, flying: dayNow * (1 - rainNow) > 0.4 }; },
    startle(m) { if (m) m.scare = 1; },
    // Where the water is pawed at from the end of the dock.
    fishingSpot: { x: DOCK.x1 + 0.75, z: 0 },
    // Splash at a point on the sea. Fish close by bolt. Returns true if one was right under the paw and `take` is set.
    splash(x, z, take) {
      spray(x, 0.1, z, 16, 1.5, 3.2);
      world.ripple(x, z);
      let caught = false, best = null, bd = 0.85;
      for (const f of fish) {
        if (f.gone > 0) continue;
        const d = Math.hypot(f.x - x, f.z - z);
        if (take && d < bd && f.scare < 0.2) { bd = d; best = f; }
        if (d < 3.2) { f.scare = 1; const l = Math.max(0.2, d); f.sx = (f.x - x) / l; f.sz = (f.z - z) / l; }
      }
      if (best) { best.gone = 45; best.scare = 0; caught = true; }
      return caught;
    },
    // A wet coat shaken off: droplets flung out from the body.
    shakeOff(x, y, z, size) { spray(x, y, z, 30, 2.4 * size, 1.6); },
    meteor,
    get shower() { return showerOn; },
    // Send the dolphins alongside the boat at this place and heading, or (null) call them off.
    escort(pose, from = 0) { escortPose = pose; escortFrom = from; },
    get whaleUp() { return !!(seaLife.whale && seaLife.whale.visible); },
    get escorting() { return escorts.filter((e) => e.visible).length; },
    forceShower(ms = 20000) { forced = timeNow() + ms; },
    get fish() { return fish.map((f) => ({ x: f.x, z: f.z, gone: f.gone > 0, scare: f.scare })); },
  };
}
