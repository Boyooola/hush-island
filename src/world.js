// Builds the island: sky, sea, land, fire, dock, trees and all small life.
import * as THREE from 'three';
import {
  mulberry32, clamp, lerp, smoothstep, noise2, terrainHeight, groundHeight, shoreRadius,
  FIRE, HILL, DOCK, WOODPILE, SIGN, WALL, CRATE, LOGS, colliders, onSlip, pathAmount, FAR, LANDING, MAPMAKER, MAP_BOARD, PATHS, AREAS, SIGHT_AT, pathDist, WOODS, FLATS, VALLEY, POINT, LIGHTHOUSE, POOL, POST, LENS, CHEST, CRAG, STONES, GARDEN, HOLLOW_TREE, CAVE, caveAt, caveRoofed, terrainRaw, SUMMIT, STANDING, COTTAGE, TIDE, tideAt, FLAT_EDGE, ISLET, WRECK, SPRING, SHELTER, FARBEACH, MOONPOOL, BONES, SEAT, WAYCAIRN, KEEP_CLEAR, TRUNK, LEDGE, COVE, DUSKRING, SUNKEN, STACK, GAP, WATCH, CHAPEL, ORCHARD } from './terrain.js';
import { timeNow } from './now.js';
import { makeGlowTexture, makeSkyLabel, makeSignTexture, makeCarvingBoard } from './labels.js';
import { CHESTS, ITEMS } from './items.js';
import { areaAt, caveRoofed as roofedAt, shoreRadius as shoreR } from './terrain.js';
import { loadProps, cutInto } from './props.js';

export const FOG_COLOR = 0x142a4d;
const MOON_DIR = new THREE.Vector3(-0.32, 0.5, -1).normalize();

const C = (hex) => new THREE.Color(hex);

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });
}

// The swell: three trains of waves crossing each other. Gentler right at the island, fuller out to sea.
function seaHeight(x, z, t) {
  const out = 0.55 + 0.45 * Math.min(1, Math.hypot(x, z) / 70);
  return (Math.sin(x * 0.42 + z * 0.2 + t * 1.25) * 0.085 + Math.sin(z * 0.55 - x * 0.16 - t * 1.0) * 0.07 + Math.sin((x + z) * 0.16 + t * 0.6) * 0.1) * out;
}

let starRush = false;      // the night of falling stars: they come every few seconds
export function buildWorld(scene, opts = {}) {
  const rng = mulberry32(20261125);
  const rand = (a, b) => a + (b - a) * rng();
  const updaters = [];
  const skyHooks = [];        // run with the look of the hour whenever the time of day moves on
  let seaT = 0;

  scene.background = C(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0105);

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x6f8fd8, 0x333c66, 1.45);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0x9db8ff, 1.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(100);
  scene.add(moonLight);
  // A faint cool fill from the sea side so nothing falls to pure black.
  const fill = new THREE.DirectionalLight(0x6f86c8, 0.3);
  fill.position.set(0.5, 0.5, 1).multiplyScalar(100);
  scene.add(fill);

  const _sun = new THREE.Vector3();
  skyHooks.push((k) => {
    hemi.color.setHex(k.sky); hemi.groundColor.setHex(k.ground); hemi.intensity = k.hemi;
    // One key light: the moon by night, the sun by day.
    _sun.set(k.sun[0], k.sun[1], k.sun[2]).normalize().lerp(MOON_DIR, k.dark).normalize();
    moonLight.position.copy(_sun).multiplyScalar(100);
    moonLight.color.setHex(k.key); moonLight.intensity = k.keyI;
    fill.intensity = k.fill;
    scene.fog.color.setHex(k.hor); scene.fog.density = k.fog; scene.background.setHex(k.hor);
  });

  // ---------- sky ----------
  const skyGeo = new THREE.SphereGeometry(450, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: C(0x050a1e) },
      mid: { value: C(0x0d1c40) },
      horizon: { value: C(FOG_COLOR) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main(){ float h = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
        c = mix(c, top, smoothstep(0.25, 0.9, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  skyHooks.push((k) => { skyMat.uniforms.top.value.setHex(k.top); skyMat.uniforms.mid.value.setHex(k.mid); skyMat.uniforms.horizon.value.setHex(k.hor); });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // Stars: one steady layer, one that twinkles.
  const starTex = makeGlowTexture('rgba(255,255,255,1)');
  function starLayer(count, size, seedShift) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const r2 = mulberry32(99 + seedShift);
    for (let i = 0; i < count; i++) {
      const u = r2() * Math.PI * 2;
      const y = 0.03 + r2() * 0.97;
      const s = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(u) * s * 420;
      pos[i * 3 + 1] = y * 420;
      pos[i * 3 + 2] = Math.sin(u) * s * 420;
      const tint = r2();
      const b = 0.55 + r2() * 0.45;
      col[i * 3] = b * (tint > 0.8 ? 1.0 : 0.85);
      col[i * 3 + 1] = b * (tint > 0.8 ? 0.9 : 0.92);
      col[i * 3 + 2] = b * (tint > 0.8 ? 0.75 : 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, map: starTex,
      depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, m);
    p.renderOrder = -9;
    scene.add(p);
    return p;
  }
  const dpr = opts.pixelRatio || 1;
  const steady = starLayer(1400, 2.6 * dpr, 0);
  let starShow = 1;
  skyHooks.push((k) => { starShow = k.dark * k.dark * (1 - (k.cloud || 0)); steady.material.opacity = 0.95 * starShow; steady.visible = twinkleA.visible = twinkleB.visible = starShow > 0.01; });
  const twinkleA = starLayer(260, 4.2 * dpr, 7);
  const twinkleB = starLayer(160, 5.6 * dpr, 13);
  updaters.push((dt, t) => {
    twinkleA.material.opacity = (0.65 + 0.3 * Math.sin(t * 1.7)) * starShow;
    twinkleB.material.opacity = (0.6 + 0.35 * Math.sin(t * 1.1 + 2)) * starShow;
  });

  // Moon.
  const glowTex = makeGlowTexture('rgba(255,255,255,1)');
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(13, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false, toneMapped: false }),
  );
  moon.position.copy(MOON_DIR).multiplyScalar(400);
  scene.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xa9c3ff, transparent: true, opacity: 0.55, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  moonGlow.scale.set(150, 150, 1);
  moonGlow.position.copy(moon.position);
  scene.add(moonGlow);
  // The sun, for the daylight hours.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  sun.scale.set(190, 190, 1);
  sun.renderOrder = -8;
  scene.add(sun);
  // A wide soft halo round it, strongest and warmest when it is low.
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  sunHalo.scale.set(620, 620, 1); sunHalo.renderOrder = -9; scene.add(sunHalo);
  skyHooks.push((k) => {
    moon.visible = moonGlow.visible = k.dark > 0.25;
    moonGlow.material.opacity = 0.55 * k.dark;
    sun.position.set(k.sun[0], k.sun[1], k.sun[2]).normalize().multiplyScalar(400);
    sun.material.opacity = (1 - k.dark) * 0.95 * (1 - (k.cloud || 0));
    moonGlow.material.opacity *= 1 - 0.8 * (k.cloud || 0);
    sun.visible = k.dark < 0.98 && k.sun[1] > 0.02;
    const low = clamp(1 - k.sun[1] / 0.45, 0, 1);
    sunHalo.position.copy(sun.position); sunHalo.visible = sun.visible;
    sunHalo.material.color.setHex(0xffe6bf).lerp(new THREE.Color(k.hor), low * 0.8);
    sunHalo.material.opacity = (0.12 + 0.3 * low) * (1 - k.dark) * (1 - (k.cloud || 0));
  });

  // Clouds: low-poly banks drifting across on the wind. White by day, lit from below at dawn and dusk,
  // dark shapes against the stars at night. They move by the clock, so everyone sees the same sky.
  {
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: false, depthWrite: false });
    const puff = new THREE.IcosahedronGeometry(1, 0);
    const banks = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rng() * 4), size = 14 + rng() * 16;
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(puff, cloudMat);
        m.scale.set(size * (0.7 + rng() * 0.7), size * (0.28 + rng() * 0.16), size * (0.55 + rng() * 0.5));
        m.position.set((j - (n - 1) / 2) * size * 0.8 + rng() * 5, rng() * size * 0.14, (rng() - 0.5) * size * 0.7);
        m.rotation.y = rng() * 6;
        g.add(m);
      }
      g.renderOrder = -7;
      scene.add(g);
      banks.push({ g, n, size, off: rng() * 640, z: -300 + rng() * 600, y: 70 + rng() * 55, rainOnly: i >= 10 });
    }
    // Modelled clouds: heaped on top, flat and a shade darker underneath.
    const cloudUnder = cloudMat.clone();
    loadProps().then((make) => {
      if (!make || !make('cloud_0')) return;
      banks.forEach((b, i) => {
        const m = make('cloud_' + (i % 3));
        m.traverse((o) => { if (o.isMesh) { o.material = o.material.name === 'cloud_under' ? cloudUnder : cloudMat; o.castShadow = false; o.receiveShadow = false; o.renderOrder = -7; } });
        m.scale.set(b.size * (0.42 + 0.13 * b.n), b.size * 0.62, b.size * 0.8);
        m.rotation.y = (i % 2) * Math.PI;
        while (b.g.children.length) b.g.remove(b.g.children[0]);
        b.g.add(m);
      });
    });
    let cover = 0;
    const tint = new THREE.Color(), warm = new THREE.Color();
    skyHooks.push((k) => {
      // Day: white. Low sun: the horizon's colour. Night: a dark blue-grey. Rain: grey, and more of them.
      const low = 1 - Math.abs(k.dark - 0.35) / 0.35;
      tint.setHex(0xffffff).lerp(warm.setHex(k.hor), Math.max(0, low) * 0.55).lerp(warm.setHex(0x1b2742), k.dark * k.dark).lerp(warm.setHex(k.mid), (k.cloud || 0) * 0.5);
      cloudMat.color.copy(tint);
      cloudMat.opacity = 0.95 - 0.35 * k.dark;
      cloudUnder.color.copy(tint).multiplyScalar(0.84 - 0.2 * (k.cloud || 0)); cloudUnder.opacity = cloudMat.opacity;
      cover = k.cloud || 0;
    });
    updaters.push(() => {
      const drift = (timeNow() / 1000) * 1.6;
      for (const b of banks) {
        b.g.visible = !b.rainOnly || cover > 0.3;
        b.g.position.set(((b.off + drift) % 640) - 320, b.y, b.z);
      }
    });
  }

  // Constellations: only drawn while someone lies down to look.
  const constellations = new THREE.Group();
  scene.add(constellations);
  const constMats = [];
  function addConstellation(name, az, el, pts, links) {
    const toVec = (a, e) => {
      const ar = THREE.MathUtils.degToRad(a), er = THREE.MathUtils.degToRad(e);
      return new THREE.Vector3(Math.sin(ar) * Math.cos(er), Math.sin(er), -Math.cos(ar) * Math.cos(er)).multiplyScalar(410);
    };
    const vs = pts.map(([da, de]) => toVec(az + da, el + de));
    const starGeo = new THREE.BufferGeometry().setFromPoints(vs);
    const starMat = new THREE.PointsMaterial({
      size: 5 * dpr, sizeAttenuation: false, color: 0xffffff, map: glowTex, transparent: true,
      depthWrite: false, fog: false, toneMapped: false, opacity: 0.9,
    });
    constellations.add(new THREE.Points(starGeo, starMat));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(links.flatMap(([a, b]) => [vs[a], vs[b]]));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
    constellations.add(new THREE.LineSegments(lineGeo, lineMat));
    const label = makeSkyLabel(name);
    label.position.copy(toVec(az, el - 9));
    label.scale.multiplyScalar(3.0);
    label.material.opacity = 0;
    constellations.add(label);
    constMats.push(lineMat, label.material);
  }
  addConstellation('The Fox', -20, 62, [[-8, 2], [-3, 5], [2, 3], [6, 6], [9, 1], [3, -2], [-2, -4]], [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [6, 0]]);
  addConstellation('The Lantern', 38, 55, [[0, 8], [-4, 3], [4, 3], [-4, -4], [4, -4], [0, -8]], [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 5]]);
  addConstellation('The Otter', 118, 60, [[-10, 0], [-5, 3], [0, 2], [5, 4], [9, 1], [11, -4]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  addConstellation('The Kettle', -112, 58, [[-5, 4], [4, 4], [6, -3], [-6, -3], [9, 2], [-1, 8]], [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [0, 5], [5, 1]]);
  let stargaze = 0, stargazeTarget = 0;
  updaters.push((dt) => {
    stargaze = lerp(stargaze, stargazeTarget, 1 - Math.exp(-dt * 1.2));
    for (const m of constMats) m.opacity = stargaze * 0.8 * Math.max(0, starShow * 2 - 1);
  });

  // Shooting stars.
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0.1, 0.15, 0.3]), 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, fog: false, toneMapped: false, depthWrite: false });
    const line = new THREE.Line(g, m);
    line.frustumCulled = false;
    scene.add(line);
    let next = 6 + rng() * 8, life = -1;
    const start = new THREE.Vector3(), dir = new THREE.Vector3();
    updaters.push((dt, t) => {
      if (life < 0) {
        if (t > next && starShow < 0.5) { next = t + 10; return; }
        if (t > next) {
          const az = rng() * Math.PI * 2, el = 0.45 + rng() * 0.6;
          start.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(400);
          dir.set(rng() - 0.5, -0.35 - rng() * 0.3, rng() - 0.5).normalize();
          life = 0;
        }
        return;
      }
      life += dt;
      const k = life / 0.9;
      const head = start.clone().addScaledVector(dir, k * 150);
      const tail = head.clone().addScaledVector(dir, -38 * Math.sin(Math.min(1, k) * Math.PI));
      const p = g.attributes.position;
      p.setXYZ(0, head.x, head.y, head.z);
      p.setXYZ(1, tail.x, tail.y, tail.z);
      p.needsUpdate = true;
      m.opacity = Math.sin(clamp(k, 0, 1) * Math.PI);
      if (k >= 1) { life = -1; m.opacity = 0; next = t + (starRush ? 1.5 + rng() * 3 : 14 + rng() * 22); }
    });
  }

  // ---------- land ----------
  // The square of ground that is drawn: all of home, or (coarser, and off-centre) all of the far shore.
  const STEP = FAR ? 2 : 1, GX0 = FAR ? -356 : -66, GZ0 = FAR ? -176 : -66, NX = FAR ? 206 : 132, NZ = FAR ? 204 : 132;
  const sand = C(0xd9c692), sandWet = C(0xa89868), deep = C(0x1d4854);
  const farRockA = C(0x6e6a76), farRockB = C(0x8f8894), shingle = C(0xc2baa6), shingleWet = C(0x7d7a70), farDeep = C(0x16444a), moss = C(0x5d7a5c), goldGrass = C(0xb09e54), heatherC = C(0x8a5f8c), paleTop = C(0xbdb98c), litter = C(0x96702f), mud = C(0x7c7466), pool = C(0x4f8a8a), valleyGreen = C(0x6fa06a), caveRock = C(0x4a4652);
  // The season, by the real month: spring greener, summer gold, autumn rust, and in winter snow lies on the high ground.
  const MONTH = new Date().getMonth(), SEASON = MONTH <= 1 || MONTH === 11 ? 'winter' : MONTH <= 4 ? 'spring' : MONTH <= 7 ? 'summer' : 'autumn', snow = C(0xeef2f4), orchardGreen = C(0x7fae62), pointTurf = C(0x8fa07c), beachGrass = C(0xb9b27a), chapelTurf = C(0x87957a), bracken = C(0x8f7a4c);
  if (FAR) { if (SEASON === 'spring') { moss.lerp(C(0x6fa05c), 0.45); goldGrass.lerp(C(0x9fb85a), 0.5); } else if (SEASON === 'summer') { goldGrass.lerp(C(0xc9b25a), 0.4); } else if (SEASON === 'autumn') { goldGrass.lerp(C(0xb07a3c), 0.4); heatherC.lerp(C(0x9a4f6a), 0.35); litter.lerp(C(0xb5612a), 0.3); } else { moss.lerp(C(0x7b8a80), 0.45); goldGrass.lerp(C(0xa8a48c), 0.5); heatherC.lerp(C(0x7a6a78), 0.5); } }
  const grassA = C(0x4f8250), grassB = C(0x3f6f49), grassHi = C(0x67995a), rock = C(0x6f7482);
  {
    const positions = [], colors = [];
    const step = STEP;
    const h = (i, j) => terrainHeight(GX0 + i * step, GZ0 + j * step);
    const tmp = new THREE.Color();
    const faceColor = (ax, ay, az, bx, by, bz, cx, cy, cz, out = colors) => {
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      const slope = Math.max(Math.abs(ay - by), Math.abs(by - cy), Math.abs(ay - cy)) / step;
      const n = noise2(mx * 0.35 + 3, mz * 0.35 - 7);
      if (FAR) {
        // Lantern Rock: banded cliffs, grey shingle, and moor on top (moss, dry gold grass, drifts of heather),
        // with fallen leaves under the birches and grey mud on the flats.
        const big = noise2(mx * 0.07 + 20, mz * 0.07 - 3), hea = noise2(mx * 0.12 - 7, mz * 0.12 + 4);
        if (slope > 0.7 && Math.max(ay, by, cy) > 0.4) {
          tmp.copy(Math.floor(my / 0.85 + n * 0.6) % 2 ? farRockA : farRockB).multiplyScalar(0.86 + 0.2 * n);
        } else if (my < -0.05) {
          tmp.copy(shingleWet).lerp(farDeep, clamp(-my / 2.2, 0, 1));
        } else if (my < 0.5 + n * 0.12) {
          tmp.copy(shingleWet).lerp(shingle, smoothstep(-0.05, 0.3, my));
        } else {
          tmp.copy(moss).lerp(goldGrass, smoothstep(-0.1, 0.55, big) * 0.85);
          tmp.lerp(heatherC, smoothstep(0.15, 0.5, hea) * 0.8);
          tmp.lerp(paleTop, smoothstep(6, 10, my) * 0.55);
          tmp.lerp(litter, (1 - smoothstep(WOODS.r * 0.6, WOODS.r * 1.1, Math.hypot(mx - WOODS.x, mz - WOODS.z))) * 0.75);
          tmp.lerp(valleyGreen, (1 - smoothstep(VALLEY.r * 0.7, VALLEY.r * 1.05, Math.hypot(mx - VALLEY.x, mz - VALLEY.z))) * 0.85);
          tmp.lerp(orchardGreen, (1 - smoothstep(12, 24, Math.hypot(mx - ORCHARD.x, mz - ORCHARD.z))) * 0.7);
          tmp.lerp(heatherC, (1 - smoothstep(20, 46, Math.hypot(mx + 232, mz - 112))) * 0.45 * smoothstep(-0.2, 0.3, hea));
          tmp.lerp(farRockB, (1 - smoothstep(20, 40, Math.hypot(mx + 50, mz + 104))) * 0.35);
          tmp.lerp(goldGrass, (1 - smoothstep(14, 26, Math.hypot(mx - HILL.x, mz - HILL.z))) * 0.4);                       // the meadow: pale grass
          tmp.lerp(pointTurf, (1 - smoothstep(26, 48, Math.hypot(mx - LIGHTHOUSE.x, mz - LIGHTHOUSE.z))) * 0.5);            // the point: salt-bitten turf
          tmp.lerp(beachGrass, (1 - smoothstep(20, 38, Math.hypot(mx - FARBEACH.x, mz - FARBEACH.z))) * 0.45 * smoothstep(1.5, 4, my));   // above the Far Beach: marram
          tmp.lerp(chapelTurf, (1 - smoothstep(16, 24, Math.hypot(mx - CHAPEL.x, mz - CHAPEL.z))) * 0.7);                   // Chapel Rock: short and grey-green
          tmp.lerp(bracken, (1 - smoothstep(26, 44, Math.hypot(mx - CAVE.pts[0][0], mz - CAVE.pts[0][1]))) * 0.4);           // round Hollow Hill: bracken brown
          if (SEASON === 'winter') tmp.lerp(snow, smoothstep(9, 15, my + n * 1.5) * 0.85);
          const fl = 1 - smoothstep(FLATS.r * 0.6, FLATS.r, Math.hypot(mx - FLATS.x, mz - FLATS.z));
          if (fl > 0) { tmp.lerp(mud, fl * 0.9); if (n > 0.3) tmp.lerp(pool, fl * smoothstep(0.3, 0.5, n) * 0.8); }
          tmp.lerp(shingle, 1 - smoothstep(0.5, 0.85, my - n * 0.12));
          if (slope > 0.48) tmp.lerp(farRockB, smoothstep(0.48, 0.7, slope));
        }
      } else if (my < -0.05) {
        tmp.copy(sandWet).lerp(deep, clamp(-my / 2.2, 0, 1));
      } else if (my < 0.5 + n * 0.12) {
        tmp.copy(sandWet).lerp(sand, smoothstep(-0.05, 0.3, my));
      } else {
        tmp.copy(grassA).lerp(grassB, n * 0.5 + 0.5);
        tmp.lerp(grassHi, smoothstep(3.2, 5.6, my) * 0.7);
        tmp.lerp(sand, 1 - smoothstep(0.5, 0.85, my - n * 0.12));
        if (slope > 0.62) tmp.lerp(rock, smoothstep(0.62, 0.9, slope));
      }
      // Trodden earth around the fire.
      const fr = Math.hypot(mx, mz);
      if (fr < 5.2) tmp.lerp(C(0x8a7350), (1 - smoothstep(2.2, 5.2, fr)) * 0.85);
      // Worn paths between the places animals go.
      if (my > 0.45) { const pa = pathAmount(mx, mz); if (pa > 0) tmp.lerp(C(0x94805a), pa * (FAR ? 0.35 : 0.3)); }      // at home, a faint wear under the modelled path
      const v = 0.95 + 0.1 * noise2(mx * 1.7, mz * 1.7);
      if (FAR && out === colors && caveRoofed(mx, mz, 2.2)) tmp.copy(caveRock).multiplyScalar(0.7 + 0.5 * n + (Math.floor(my / 0.8) % 2) * 0.12);      // under the hill: bare dark rock, floor and walls
      for (let k = 0; k < 3; k++) out.push(tmp.r * v, tmp.g * v, tmp.b * v);
    };
    // The ground is laid in tiles, so that the parts of a big island that are behind the visitor or out of sight
    // are not drawn. (Hush Island is small enough to be one.)
    const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
    const TILE = FAR ? 22 : 9999;
    for (let ti = 0; ti < NX; ti += TILE) for (let tj = 0; tj < NZ; tj += TILE) {
      positions.length = 0; colors.length = 0;
      for (let i = ti; i < Math.min(NX, ti + TILE); i++) {
        for (let j = tj; j < Math.min(NZ, tj + TILE); j++) {
          const x0 = GX0 + i * step, x1 = x0 + step, z0 = GZ0 + j * step, z1 = z0 + step;
          const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1), h11 = h(i + 1, j + 1);
          if (Math.max(h00, h10, h01, h11) < -4.9) continue;
          positions.push(x0, h00, z0, x0, h01, z1, x1, h10, z0);
          faceColor(x0, h00, z0, x0, h01, z1, x1, h10, z0);
          positions.push(x1, h10, z0, x0, h01, z1, x1, h11, z1);
          faceColor(x1, h10, z0, x0, h01, z1, x1, h11, z1);
        }
      }
      if (!positions.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const land = new THREE.Mesh(g, landMat);
      land.receiveShadow = true; land.userData.noShadow = true; land.userData.cull = 0;
      scene.add(land);
    }
    // The lid over the caves: the outside of Hollow Hill as it would be with nothing dug under it, and beneath it
    // the cave's roof. It is cut see-through above a visitor who is inside, so that they can be seen from above.
    if (FAR) {
      const lp = [], lc = [], dark = new THREE.Color();
      const i0 = Math.floor((-234 - GX0) / step), i1 = Math.ceil((-134 - GX0) / step), j0 = Math.floor((-130 - GZ0) / step), j1 = Math.ceil((-44 - GZ0) / step);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
        const x0 = GX0 + i * step, x1 = x0 + step, z0 = GZ0 + j * step, z1 = z0 + step;
        if (!caveRoofed(x0 + step / 2, z0 + step / 2, 3.6)) continue;
        const r00 = terrainRaw(x0, z0), r10 = terrainRaw(x1, z0), r01 = terrainRaw(x0, z1), r11 = terrainRaw(x1, z1);
        lp.push(x0, r00, z0, x0, r01, z1, x1, r10, z0); faceColor(x0, r00, z0, x0, r01, z1, x1, r10, z0, lc);
        lp.push(x1, r10, z0, x0, r01, z1, x1, r11, z1); faceColor(x1, r10, z0, x0, r01, z1, x1, r11, z1, lc);
        const c00 = caveAt(x0, z0).top, c10 = caveAt(x1, z0).top, c01 = caveAt(x0, z1).top, c11 = caveAt(x1, z1).top;
        lp.push(x0, c00, z0, x1, c10, z0, x0, c01, z1, x1, c10, z0, x1, c11, z1, x0, c01, z1);
        for (let k = 0; k < 2; k++) { dark.setHex(0x3a3642).multiplyScalar(0.8 + 0.4 * noise2(x0 * 0.4 + k, z0 * 0.4)); for (let q = 0; q < 3; q++) lc.push(dark.r, dark.g, dark.b); }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); lg.computeVertexNormals();
      const lid = new THREE.Mesh(lg, cutInto(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide }), 6.2, 7.4));
      lid.userData.noShadow = true; scene.add(lid);
    }
  }

  // ---------- sea ----------
  {
    // The grid is packed tight near the island, where waves are seen close up, and loose far out.
    const g = new THREE.PlaneGeometry(2, 2, 150, 150);
    g.rotateX(-Math.PI / 2);
    {
      const q = g.attributes.position.array;
      for (let i = 0; i < q.length; i += 3) {
        q[i] = Math.sign(q[i]) * Math.pow(Math.abs(q[i]), 2) * (FAR ? 700 : 450) + (FAR ? -150 : 0);      // packed tight around the middle of the island
        q[i + 2] = Math.sign(q[i + 2]) * Math.pow(Math.abs(q[i + 2]), 2) * (FAR ? 700 : 450);
      }
    }
    const base = g.attributes.position.array.slice();
    const m = new THREE.MeshStandardMaterial({
      color: 0x1a4a68, roughness: 0.3, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.86,
    });
    skyHooks.push((k) => { m.color.setHex(k.sea); });
    const sea = new THREE.Mesh(g, m);
    sea.userData.noShadow = true;
    sea.position.y = 0;
    scene.add(sea);
    const p = g.attributes.position;
    updaters.push((dt, t) => {
      seaT = t;
      for (let i = 0; i < p.count; i++) p.array[i * 3 + 1] = seaHeight(base[i * 3], base[i * 3 + 2], t);
      p.needsUpdate = true;
    });

    // Foam line where the sea meets the sand.
    const seg = 160, inner = [], foamPos = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      inner.push([Math.cos(a), Math.sin(a), shoreRadius(a)]);
    }
    for (let i = 0; i < seg; i++) {
      const [c0, s0, r0] = inner[i], [c1, s1, r1] = inner[i + 1];
      const a0 = r0 * 0.992, b0 = r0 * 1.012, a1 = r1 * 0.992, b1 = r1 * 1.012;
      foamPos.push(c0 * a0, 0, s0 * a0, c0 * b0, 0, s0 * b0, c1 * a1, 0, s1 * a1);
      foamPos.push(c1 * a1, 0, s1 * a1, c0 * b0, 0, s0 * b0, c1 * b1, 0, s1 * b1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(foamPos, 3));
    const fm = new THREE.MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const foam = new THREE.Mesh(fg, fm);
    foam.position.y = 0.05;
    scene.add(foam);
    const foam2 = new THREE.Mesh(fg, fm.clone());
    foam2.position.y = 0.045;
    scene.add(foam2);
    updaters.push((dt, t) => {
      const k = Math.sin(t * 0.55) * 0.5 + 0.5;
      foam.scale.setScalar(1.0 + 0.012 * k);
      fm.opacity = 0.2 + 0.3 * k;
      const k2 = Math.sin(t * 0.55 + 2.1) * 0.5 + 0.5;
      foam2.scale.setScalar(1.022 + 0.014 * k2);
      foam2.material.opacity = 0.08 + 0.16 * k2;
    });
  }

  // Far islands with their own small fires.
  {
    const silhouette = new THREE.MeshBasicMaterial({ color: 0x0b1730, fog: false });
    skyHooks.push((k) => { silhouette.color.setHex(k.far); });
    const farList = [];
    loadProps().then((make) => {
      if (!make || !make('far_island_0')) return;
      farList.forEach((f, i) => {
        const m = make('far_island_' + (i % 3));
        m.traverse((o) => { if (o.isMesh) { o.material = silhouette; o.castShadow = false; o.receiveShadow = false; } });
        m.position.set(f.x, -0.2, f.z); m.scale.setScalar(f.s * 1.25);
        m.rotation.y = Math.atan2(f.x, f.z) + (i % 2 ? Math.PI : 0);      // broadside to the island, so its outline shows
        scene.remove(f.isl); scene.add(m);
      });
    });
    const fires = [];
    // From the far shore, the one to the east with the bright fire is home.
    for (const [x, z, s] of FAR ? [[330, 40, 1.0], [150, -400, 0.9], [-480, -330, 0.8], [-560, 160, 1.0], [40, 420, 0.9]] : [[-190, -170, 1.2], [140, -240, 0.9], [-60, -300, 0.7], [260, 40, 1.0], [-250, 110, 0.9]]) {
      const isl = new THREE.Mesh(new THREE.SphereGeometry(20 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), silhouette);
      isl.scale.y = 0.22;
      isl.scale.z = 0.7;
      isl.position.set(x, -0.2, z);
      scene.add(isl); farList.push({ isl, x, z, s });
      const f = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xff9a44, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      }));
      f.position.set(x + 3 * s, 4.6 * s, z + 2 * s);
      f.scale.setScalar(7 * s);
      scene.add(f);
      fires.push([f, 7 * s, rng() * 10]);
    }
    updaters.push((dt, t) => {
      for (const [f, s, ph] of fires) f.scale.setScalar(s * (0.85 + 0.2 * Math.sin(t * 7 + ph) * Math.sin(t * 3.1 + ph)));
    });
  }

  // ---------- campfire ----------
  const fireY = groundHeight(FIRE.x, FIRE.z);
  const fireGroup = new THREE.Group();
  fireGroup.position.set(FIRE.x, fireY, FIRE.z);
  scene.add(fireGroup);
  colliders.push({ x: FIRE.x, z: FIRE.z, r: 1.0 });
  const fireRough = [];      // the stand-in stones and logs, until the modelled ones arrive
  {
    const stoneMat = std(0x8a8a90, { emissive: 0x2a1508 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.2, 0.3), 0), stoneMat);
      s.position.set(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95);
      s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      s.scale.y = 0.75;
      fireGroup.add(s); fireRough.push(s);
    }
    const woodMat = std(0x4a3222);
    const charMat = std(0x241812);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.95, 6), i % 2 ? woodMat : charMat);
      log.position.set(Math.cos(a) * 0.3, 0.36, Math.sin(a) * 0.3);
      log.rotation.z = Math.cos(a) * 0.62;
      log.rotation.x = -Math.sin(a) * 0.62;
      fireGroup.add(log); fireRough.push(log);
    }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }));
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.04;
    fireGroup.add(ash); fireRough.push(ash);
  }
  const flames = [];
  for (const [color, r, hgt, op] of [[0xff4d16, 0.56, 1.95, 0.7], [0xff8a22, 0.44, 1.6, 0.8], [0xffc04a, 0.31, 1.2, 0.9], [0xfff0b0, 0.17, 0.75, 0.95]]) {
    const g = new THREE.ConeGeometry(r, hgt, 7, 3);
    g.translate(0, hgt / 2, 0);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const f = new THREE.Mesh(g, m);
    f.position.y = 0.12;
    f.userData.base = g.attributes.position.array.slice();
    f.userData.h = hgt;
    f.userData.op = op;
    fireGroup.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xffa25e, 60, 46, 1.7);
  fireLight.position.set(0, 1.25, 0);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.camera.near = 0.3;
  fireLight.shadow.camera.far = 34;
  fireLight.shadow.bias = -0.004;
  fireLight.shadow.normalBias = 0.06;
  fireGroup.add(fireLight);
  // Fresh logs lying across the fire; more of them show as the fire is fed.
  const extraLogs = [];
  for (const [a, y] of [[0.4, 0.3], [2.0, 0.36], [3.6, 0.44]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 1.05, 7), std(0x6a4a30, { emissive: 0x2a1408 }));
    l.rotation.z = Math.PI / 2;
    l.rotation.y = a;
    l.position.y = y;
    fireGroup.add(l);
    extraLogs.push(l);
  }
  loadProps().then((make) => {
    const ring = make && ((FAR && make('camp_hearth')) || make('fire_ring', 'fire_extra'));      // the camp on the far shore has its own hearth: flat stones, a tripod and a kettle
    if (!ring) return;
    for (const m of fireRough) fireGroup.remove(m);
    fireGroup.add(ring);
    extraLogs.forEach((old, i) => { const l = make('fire_extra_' + i); if (!l) return; l.visible = old.visible; fireGroup.remove(old); fireGroup.add(l); extraLogs[i] = l; });
  });
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff7a2a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  fireGlow.position.y = 0.9;
  fireGlow.scale.setScalar(5.5);
  fireGroup.add(fireGlow);

  // Embers.
  const EMBERS = 90;
  const emberPos = new Float32Array(EMBERS * 3);
  const emberData = [];
  for (let i = 0; i < EMBERS; i++) emberData.push({ life: rng() * 3, max: 1.6 + rng() * 2.2, x: 0, z: 0, vx: 0, vz: 0, ph: rng() * 6 });
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    size: 0.09, color: 0xffb04a, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
  embers.frustumCulled = false;
  fireGroup.add(embers);

  // The fire runs on fuel: 0 is embers, 1 is a good blaze, above 1 is roaring.
  let fuel = 0.6, flare = 0, heat = 0.6, party = 0, partyWas = false, gathering = false;
  const emberCountFor = (h) => Math.floor(EMBERS * clamp(0.1 + 0.7 * h, 0, 1));
  updaters.push((dt, t) => {
    flare = Math.max(0, flare - dt / 5);
    const f = clamp(fuel, 0, 1.4);
    const target = 0.14 + 0.86 * Math.min(1, f) + Math.max(0, f - 1) * 0.5 + flare * 0.45;
    // At campfire hour the keeper keeps it roaring whatever has been fed to it.
    heat = lerp(heat, gathering ? Math.max(target, 1.3) : target, 1 - Math.exp(-dt * 2.5));
    const flick = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 23.7 + 1) + 0.06 * Math.sin(t * 5.1 + 2);
    // A dance warms the light and lets its colour wander.
    fireLight.intensity = 62 * flick * heat * (1 + party * 0.45);
    if (party > 0) fireLight.color.setHSL(0.07 + 0.045 * Math.sin(t * 2.3) + 0.02 * Math.sin(t * 5.1), 1, 0.62); else if (partyWas) fireLight.color.set(0xffa25e);
    partyWas = party > 0;
    fireLight.position.x = Math.sin(t * 9) * 0.05;
    fireLight.position.z = Math.cos(t * 7.3) * 0.05;
    fireGlow.scale.setScalar((1.6 + 4.4 * heat) * (0.9 + 0.15 * flick));
    fireGlow.material.opacity = 0.28 + 0.26 * Math.min(1, heat);
    flames.forEach((fl, i) => {
      const p = fl.geometry.attributes.position, b = fl.userData.base, hgt = fl.userData.h;
      for (let v = 0; v < p.count; v++) {
        const y = b[v * 3 + 1] / hgt;
        const sway = y * y * 0.22;
        p.array[v * 3] = b[v * 3] * (1 - y * 0.15) + Math.sin(t * (6 + i * 1.7) + y * 5 + i) * sway;
        p.array[v * 3 + 2] = b[v * 3 + 2] * (1 - y * 0.15) + Math.cos(t * (5 + i * 2.1) + y * 4 + i * 2) * sway;
      }
      p.needsUpdate = true;
      const size = 0.26 + 0.8 * heat;
      fl.scale.y = size * (0.88 + 0.16 * Math.sin(t * (8 + i * 2.3) + i * 1.3));
      fl.scale.x = fl.scale.z = 0.5 + 0.55 * Math.min(1.3, heat) + 0.06 * Math.sin(t * 10 + i);
      fl.rotation.y = t * (0.7 + i * 0.25);
      // The big outer flames die away first as the fire burns low.
      fl.material.opacity = fl.userData.op * clamp((heat - (i === 0 ? 0.32 : i === 1 ? 0.2 : 0.02)) * 5, 0, 1);
    });
    const active = emberCountFor(heat);
    for (let i = 0; i < EMBERS; i++) {
      const e = emberData[i];
      e.life += dt;
      if (e.life > e.max) {
        if (i >= active) { emberPos[i * 3 + 1] = -50; continue; }
        e.life = 0;
        e.max = (1.4 + rng() * 2.2) * (0.6 + 0.5 * heat);
        const a = rng() * Math.PI * 2, r = rng() * 0.35;
        e.x = Math.cos(a) * r; e.z = Math.sin(a) * r;
        e.vx = (rng() - 0.5) * 0.5; e.vz = (rng() - 0.5) * 0.5;
      }
      const k = e.life;
      emberPos[i * 3] = e.x + e.vx * k + Math.sin(k * 3 + e.ph) * 0.12;
      emberPos[i * 3 + 1] = 0.4 + k * (0.6 + 0.7 * heat) + k * k * 0.12;
      emberPos[i * 3 + 2] = e.z + e.vz * k + Math.cos(k * 2.6 + e.ph) * 0.12;
    }
    emberGeo.attributes.position.needsUpdate = true;
    extraLogs.forEach((m, i) => { m.visible = f > [0.45, 0.75, 1.05][i]; });
  });

  // A log thrown onto the fire.
  const tossMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6), std(0x7a5536, { emissive: 0x1c130c }));
  tossMesh.visible = false;
  tossMesh.userData.noShadow = true;
  scene.add(tossMesh);
  let toss = null;
  updaters.push((dt) => {
    if (!toss) return;
    toss.k += dt / 0.6;
    const k = Math.min(1, toss.k);
    tossMesh.position.set(lerp(toss.x, FIRE.x, k), lerp(toss.y, fireY + 0.45, k) + Math.sin(k * Math.PI) * 1.1, lerp(toss.z, FIRE.z, k));
    tossMesh.rotation.x += dt * 9; tossMesh.rotation.z += dt * 6;
    if (k >= 1) {
      tossMesh.visible = false;
      const done = toss.done; toss = null;
      flare = 1;
      for (let i = 0; i < EMBERS; i++) if (rng() < 0.5) emberData[i].life = 99;   // a burst of sparks
      if (done) done();
    }
  });

  // Footprints on the sand and ripples in the shallows.
  const prints = [];
  {
    const g = new THREE.CircleGeometry(0.075, 8);
    g.scale(1, 1.55, 1);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.order = 'YXZ';
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      prints.push(m);
    }
  }
  let printAt = 0;
  const rings = [];
  {
    const g = new THREE.RingGeometry(0.44, 0.5, 22);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData.life = 9;
      scene.add(m);
      rings.push(m);
    }
  }
  let ringAt = 0;
  updaters.push((dt) => {
    for (const m of prints) {
      if (!m.visible) continue;
      m.userData.life += dt;
      m.material.opacity = 0.26 * clamp((16 - m.userData.life) / 6, 0, 1);
      if (m.userData.life > 16) m.visible = false;
    }
    for (const m of rings) {
      if (!m.visible) continue;
      m.userData.life += dt;
      const k = m.userData.life / 1.5;
      m.scale.setScalar(0.4 + k * 1.9);
      m.material.opacity = 0.5 * (1 - k);
      if (k >= 1) m.visible = false;
    }
  });

  // Log seats.
  {
    const seatGroups = [];
    const barkMat = std(0x5e4a3a, { emissive: 0x1c130c });
    const endMat = std(0xb99668);
    for (const L of LOGS) {
      const y = groundHeight(L.x, L.z);
      const g = new THREE.Group();
      g.position.set(L.x, y + 0.29, L.z);
      const tx = -Math.sin(L.angle), tz = Math.cos(L.angle);
      g.rotation.y = Math.atan2(-tz, tx);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 2.5, 9), barkMat);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      for (const s of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 9), endMat);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = s * 1.255;
        g.add(cap);
      }
      scene.add(g); seatGroups.push(g);
      for (const s of [-0.8, 0, 0.8]) colliders.push({ x: L.x + tx * s, z: L.z + tz * s, r: 0.4 });
    }
    loadProps().then((make) => {
      if (!make || !make('seat_log_a')) return;
      seatGroups.forEach((g, i) => {
        const m = (FAR && make(i % 2 ? 'camp_bench_b' : 'camp_bench_a')) || make(i % 2 ? 'seat_log_b' : 'seat_log_a');      // benches at the camp, logs at home
        while (g.children.length) g.remove(g.children[0]);
        m.position.y = -0.29; if (i % 3 === 0) m.rotation.y = Math.PI;
        g.add(m);
      });
    });
  }

  // Woodpile.
  {
    const y = groundHeight(WOODPILE.x, WOODPILE.z);
    const g = new THREE.Group();
    g.position.set(WOODPILE.x, y, WOODPILE.z);
    g.rotation.y = 0.5;
    const mat = std(0x7a5536), end = std(0xc7a274);
    const rows = [[-0.33, -0.11, 0.11, 0.33], [-0.22, 0, 0.22], [-0.11, 0.11], [0]];
    rows.forEach((row, ri) => row.forEach((off) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.95, 7), mat);
      l.rotation.x = Math.PI / 2;
      l.position.set(off, 0.11 + ri * 0.19, rand(-0.04, 0.04));
      g.add(l);
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.085, 7), end);
      c.position.set(off, 0.11 + ri * 0.19, l.position.z + 0.478);
      g.add(c);
    }));
    // Loose sticks leaning on the pile: the size an animal can carry in its mouth.
    for (const [x, z, ry, tilt] of [[0.62, 0.1, 0.3, 1.05], [0.66, -0.12, -0.2, 1.15], [-0.6, 0.05, 2.9, 1.1], [0.1, 0.62, 1.4, 1.5], [-0.15, 0.66, 1.75, 1.52]]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.8, 6), mat);
      st.rotation.order = 'YXZ'; st.rotation.y = ry; st.rotation.z = tilt;
      st.position.set(x, tilt > 1.4 ? 0.04 : 0.2, z);
      g.add(st);
    }
    scene.add(g);
    colliders.push({ x: WOODPILE.x, z: WOODPILE.z, r: 0.62 });
    loadProps().then((make) => {
      const m = make && ((FAR && make('camp_stack')) || make('woodpile'));
      if (!m) return;
      while (g.children.length) g.remove(g.children[0]);
      g.add(m);
      // The chopping block beside it is solid too.
      g.updateMatrixWorld(true);
      const b = new THREE.Vector3(-1.05, 0, -0.15).applyMatrix4(g.matrixWorld);
      colliders.push({ x: b.x, z: b.z, r: 0.34 });
    });
  }

  // ---------- dock ----------
  let lanternLight;
  {
    const dockRough = [], rough = (m) => { dockRough.push(m); return m; };
    const plankA = std(0x8a6a48), plankB = std(0x7a5c3e), post = std(0x5a4330);
    const len = DOCK.x1 - DOCK.x0;
    const count = Math.floor(len / 0.5);
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 2.3 + rand(-0.08, 0.08)), i % 3 ? plankA : plankB);
      p.position.set(DOCK.x0 + 0.25 + i * 0.5, DOCK.y - 0.04 + rand(-0.008, 0.008), rand(-0.03, 0.03));
      p.rotation.y = rand(-0.02, 0.02);
      scene.add(rough(p));
    }
    for (let x = DOCK.x0 + 1.5; x <= DOCK.x1; x += 3.6) {
      for (const z of [DOCK.z0 - 0.05, DOCK.z1 + 0.05]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 7), post);
        m.position.set(x, -0.9, z);
        scene.add(rough(m));
      }
    }
    for (const z of [-0.9, 0.9]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.14), post);
      beam.position.set((DOCK.x0 + DOCK.x1) / 2, DOCK.y - 0.14, z);
      scene.add(rough(beam));
    }
    // Lantern at the end.
    const lx = DOCK.x1 - 0.5, lz = DOCK.z1 - 0.15;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), post);
    pole.position.set(lx, DOCK.y + 1.05, lz);
    scene.add(rough(pole));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), post);
    arm.position.set(lx - 0.22, DOCK.y + 2.05, lz);
    scene.add(rough(arm));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    lamp.position.set(lx - 0.42, DOCK.y + 1.82, lz);
    scene.add(rough(lamp));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.14, 4), post);
    cap.position.set(lx - 0.42, DOCK.y + 2.02, lz);
    cap.rotation.y = Math.PI / 4;
    scene.add(rough(cap));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc27a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    glow.position.copy(lamp.position);
    glow.scale.setScalar(2.2);
    scene.add(glow);
    lanternLight = new THREE.PointLight(0xffc27a, 16, 18, 1.8);
    lanternLight.position.copy(lamp.position);
    scene.add(lanternLight);
    colliders.push({ x: lx, z: lz, r: 0.15 });
    loadProps().then((make) => {
      const m = make && make('dock');
      if (!m) return;
      for (const r of dockRough) scene.remove(r);
      m.position.set(DOCK.x0, 0, 0);
      scene.add(m);
    });
    // Two fishing rods leaning on the rail.
    const rodMat = std(0xc9b48a);
    for (const [rx, tilt] of [[DOCK.x1 - 3, 0.5], [DOCK.x1 - 6.2, 0.42]]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 2.6, 5), rodMat);
      rod.position.set(rx, DOCK.y + 1.0, DOCK.z0 - 0.35);
      rod.rotation.x = -tilt;
      scene.add(rough(rod));
    }
  }

  // ---------- trees, rocks, plants ----------
  const pineMats = [std(0x2f6650), std(0x2a5a49), std(0x3a7458)];
  const trunkMat = std(0x5b4030);
  const leafMats = [std(0x3d7a4c), std(0x4b8a52)];
  const palmLeaf = std(0x3f8a55, { side: THREE.DoubleSide });
  const palmTrunk = std(0x8a6c4a);

  const farTrees = [];      // on the far shore the woods are too many to build one by one: places only, drawn in batches later
  const treeList = [], palmList = [];      // what was planted where, so the modelled trees can take their places
  function pine(x, z, s) {
    if (FAR) { farTrees.push({ x, z, s, kind: 'pine', ry: rng() * 6 }); colliders.push({ x, z, r: 0.32 * s }); return null; }
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    g.position.set(x, y - 0.1, z);
    const tmat = trunkMat.clone();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 1.5 * s, 6), tmat);
    trunk.position.y = 0.7 * s;
    g.add(trunk);
    const mat = pineMats[Math.floor(rng() * 3)].clone();
    [[1.15, 1.7, 1.75], [0.9, 1.5, 2.65], [0.62, 1.3, 3.45], [0.35, 0.9, 4.1]].forEach(([r, h, cy]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * s, 7), mat);
      c.position.y = cy * s;
      c.rotation.y = rng() * 3;
      g.add(c);
    });
    g.rotation.y = rng() * 6;
    g.rotation.z = rand(-0.04, 0.04);
    scene.add(g);
    colliders.push({ x, z, r: 0.32 * s });
    canopies.push({ x, z, r: 1.35 * s, base: y + 0.9 * s, top: y + 4.7 * s, mats: [mat, tmat], fade: 1 });
    treeList.push({ g, s, kind: 'pine', canopy: canopies[canopies.length - 1] });
    return g;
  }
  function leafy(x, z, s) {
    if (FAR) { farTrees.push({ x, z, s, kind: 'leafy', ry: rng() * 6 }); colliders.push({ x, z, r: 0.3 * s }); return null; }
    const g = new THREE.Group();
    const y = terrainHeight(x, z);
    g.position.set(x, y - 0.1, z);
    const tmat = trunkMat.clone();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.8 * s, 6), tmat);
    trunk.position.y = 0.85 * s;
    g.add(trunk);
    const mat = leafMats[Math.floor(rng() * 2)].clone();
    [[0, 2.5, 0, 1.15], [0.55, 2.1, 0.3, 0.8], [-0.5, 2.2, -0.35, 0.85], [0.1, 3.15, -0.1, 0.75]].forEach(([ox, oy, oz, r]) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), mat);
      b.position.set(ox * s, oy * s, oz * s);
      b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      g.add(b);
    });
    g.rotation.y = rng() * 6;
    scene.add(g);
    colliders.push({ x, z, r: 0.3 * s });
    canopies.push({ x, z, r: 1.75 * s, base: y + 1.2 * s, top: y + 4.1 * s, mats: [mat, tmat], fade: 1 });
    treeList.push({ g, s, kind: 'leafy', canopy: canopies[canopies.length - 1] });
    return g;
  }
  const palmTops = [];
  function palm(x, z, s, lean) {
    if (FAR) { farTrees.push({ x, z, s, kind: 'palm', ry: lean }); colliders.push({ x, z, r: 0.28 * s }); return; }
    const g = new THREE.Group();
    g.position.set(x, terrainHeight(x, z) - 0.15, z);
    g.rotation.y = lean;
    let cur = g;
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : 0.78 * s;
      seg.rotation.z = i === 0 ? 0.08 : 0.085;
      const r0 = (0.17 - i * 0.012) * s, r1 = (0.158 - i * 0.012) * s;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 0.8 * s, 6), palmTrunk);
      m.position.y = 0.4 * s;
      seg.add(m);
      cur.add(seg);
      cur = seg;
    }
    const crown = new THREE.Group();
    crown.position.y = 0.8 * s;
    cur.add(crown);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      const leafGeo = new THREE.ConeGeometry(0.34 * s, 2.5 * s, 4, 4);
      leafGeo.scale(1, 1, 0.12);
      leafGeo.translate(0, 1.25 * s, 0);
      // Bend the frond so it droops.
      const lp = leafGeo.attributes.position;
      for (let v = 0; v < lp.count; v++) {
        const yy = lp.getY(v) / (2.5 * s);
        lp.setZ(v, lp.getZ(v) - yy * yy * 0.95 * s);
      }
      leafGeo.computeVertexNormals();
      const leaf = new THREE.Mesh(leafGeo, palmLeaf);
      leaf.rotation.x = -(1.05 + rng() * 0.35);
      pivot.add(leaf);
      crown.add(pivot);
    }
    const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14 * s, 0), std(0x5a3d26));
    nut.position.set(0.12 * s, -0.12 * s, 0.1 * s);
    crown.add(nut);
    scene.add(g);
    palmTops.push([crown, rng() * 6]);
    palmList.push({ g, s, top: palmTops[palmTops.length - 1] });
    colliders.push({ x, z, r: 0.28 * s });
  }

  const canopies = [];
  const keepClear = (x, z) => {
    const r = Math.hypot(x, z);
    if (r < 9.5) return true;                               // fire clearing
    if (FAR && (LANDING.some((p) => Math.hypot(x - p.x, z - p.z) < p.clear) || Math.hypot(x - MAPMAKER.x, z - MAPMAKER.z) < 2)) return true;
    if (FAR && KEEP_CLEAR.some((k) => Math.abs(x - k[0]) < k[2] && Math.hypot(x - k[0], z - k[1]) < k[2])) return true;
    if (FAR) return pathAmount(x, z) > 0.02 || (x > 8 && Math.abs(z) < 4.5) || Math.hypot(x - HILL.x, z - HILL.z) < 14 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < 4 || Math.hypot(x - MOONPOOL.x, z - MOONPOOL.z) < 7 || Math.hypot(x - BONES.x, z - BONES.z) < 11 || Math.hypot(x - SEAT.x, z - SEAT.z) < 4 || Math.hypot(x - WAYCAIRN.x, z - WAYCAIRN.z) < 4 || Math.hypot(x - SPRING.x, z - SPRING.z) < 6 || Math.hypot(x - SHELTER.x, z - SHELTER.z) < 6 || Math.hypot(x - COTTAGE.x, z - COTTAGE.z) < 8 || Math.hypot(x - FLATS.x, z - FLATS.z) < FLATS.r * 0.8 || Math.hypot(x - POOL.x, z - POOL.z) < 17 || Math.hypot(x - HOLLOW_TREE.x, z - HOLLOW_TREE.z) < 8 || Math.hypot(x - CRAG.x, z - CRAG.z - 3) < 12 || Math.hypot(x - GARDEN.x + 3, z - GARDEN.z - 5) < 12 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 12 || Math.hypot(x - WALL.x, z - WALL.z) < 3;
    if (Math.abs(x) < 4.2 && z > 6) return true;            // path from the beach
    if (x > 6 && Math.abs(z) < 3.4) return true;            // path to the dock
    if (Math.hypot(x - HILL.x, z - HILL.z) < 4.2) return true; // hilltop
    // A loose path from the fire up the hill.
    const t = clamp(((x * HILL.x) + (z * HILL.z)) / (HILL.x * HILL.x + HILL.z * HILL.z), 0, 1);
    if (Math.hypot(x - HILL.x * t, z - HILL.z * t) < 2.4) return true;
    return false;
  };
  const placed = [];
  const farEnough = (x, z, d) => placed.every(([px, pz]) => Math.hypot(px - x, pz - z) > d);
  let tries = 0;
  while (placed.length < (FAR ? 520 : 34) && tries++ < (FAR ? 60000 : 4000)) {
    const a = rng() * Math.PI * 2;
    const d = FAR ? 0.12 + Math.sqrt(rng()) * 0.8 : 0.3 + rng() * 0.48;
    const r = d * shoreRadius(a);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepClear(x, z) || !farEnough(x, z, FAR ? 4.5 : 3.1)) continue;
    if (terrainHeight(x, z) < 0.75) continue;
    placed.push([x, z]);
    if (rng() < 0.7) pine(x, z, rand(0.85, 1.45)); else leafy(x, z, rand(0.9, 1.3));
  }
  tries = 0;
  let palms = 0;
  while (palms < (FAR ? 0 : 9) && tries++ < 3000) {
    const a = rng() * Math.PI * 2;
    const d = 0.8 + rng() * 0.1;
    const r = d * shoreRadius(a);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepClear(x, z) || !farEnough(x, z, 4) || (x > 20 && Math.abs(z) < 5) || (FAR && terrainHeight(x, z) > 2.2)) continue;
    placed.push([x, z]);
    palm(x, z, rand(0.9, 1.25), a + Math.PI / 2 + rand(-0.5, 0.5));
    palms++;
  }
  // Draw many copies of one modelled piece as a single batch.
  // On the far shore, which is too big to draw all at once, each batch is cut into squares of land: a square
  // that is behind the camera or lost in the mist is not drawn at all.
  const cells = [];
  let reach = 1;      // how far things are drawn, as a share of the full distance: less on a device that is struggling
  const batch = (make, name, spots, skip) => {
    const lump = make.single(opts.low && name === 'birch_b' ? 'birch_a' : name, skip);      // on a phone every birch is the plainer of the two
    if (!lump || !spots.length) return null;
    const groups = new Map();
    const small = /heather|bracken|slab|rock_/.test(name), size = small ? 35 : 42;
    // Trees have a plain far-away version (a trunk and a lump or two of leaves): past a little way off, that is what is drawn.
    const farLump = FAR && !small ? make.single(name + '_far') : null;      // ground cover is cut into smaller squares, so that less of it is drawn at once
    for (const sp of spots) { const key = FAR ? Math.floor(sp.x / size) + ',' + Math.floor(sp.z / size) : ''; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(sp); }
    let last = null;
    for (const list of groups.values()) {
      if (small) list.sort((a, b) => ((a.x * 12.9898 + a.z * 78.233) % 1) - ((b.x * 12.9898 + b.z * 78.233) % 1));      // in no order, so that drawing only some of them thins the cover evenly
      const inst = new THREE.InstancedMesh(lump.geometry, lump.material, list.length), d = new THREE.Object3D();
      let cx = 0, cz = 0;
      list.forEach((sp, i) => { d.position.set(sp.x, sp.y, sp.z); d.rotation.set(0, sp.ry || 0, 0); d.scale.set(sp.sx || sp.s, sp.sy || sp.s, sp.sz || sp.s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); cx += sp.x / list.length; cz += sp.z / list.length; });
      if (list[0].tint) { const col = new THREE.Color(); list.forEach((sp, i) => inst.setColorAt(i, col.setRGB(sp.tint[0], sp.tint[1], sp.tint[2]))); }
      inst.computeBoundingSphere();
      // No shadows from the batch: a whole wood drawn again for every light is more than a phone can take.
      inst.castShadow = false; inst.receiveShadow = true; inst.userData.noShadow = true; inst.name = 'batch_' + name;
      scene.add(inst);
      let lod = null;
      if (farLump) { lod = new THREE.InstancedMesh(farLump.geometry, farLump.material, list.length); for (let i = 0; i < list.length; i++) { inst.getMatrixAt(i, d.matrix); lod.setMatrixAt(i, d.matrix); } lod.computeBoundingSphere(); lod.castShadow = false; lod.receiveShadow = false; lod.userData.noShadow = true; lod.name = 'far_' + name; lod.visible = false; scene.add(lod); }
      if (FAR) cells.push({ inst, lod, x: cx, z: cz, far: small ? 95 : 170, near: 62, pad: small ? 25 : 24, full: list.length, thin: /heather|bracken/.test(name) });
      last = inst;
    }
    return last;
  };
  // Stillwater: the pool under the valley's southern wall, the crag the water falls from (with a hollow behind the
  // fall that cannot be seen from outside), stepping stones across, and the Hermit's garden on the far side.
  if (FAR) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.r, 22).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8f86, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.8, flatShading: true }));
    pool.position.set(POOL.x, POOL.y, POOL.z); pool.userData.noShadow = true; scene.add(pool);
    // Falling water: streaks drawn once and slid downwards for ever.
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 256;
    { const g = wc.getContext('2d'), r0 = mulberry32(5); g.clearRect(0, 0, 64, 256); for (let i = 0; i < 46; i++) { const x = r0() * 64, y = r0() * 256, len = 40 + r0() * 120; const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.35 + r0() * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r0() * 5, len); g.fillRect(x, y - 256, 2 + r0() * 5, len); } }
    const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(2, 1.4);
    const top = CRAG.y + 8.2, fall = new THREE.Group();
    const sheetMat = new THREE.MeshBasicMaterial({ map: wt, color: 0xdff6f2, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x8fd0c8, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    for (const [mat, dz, w] of [[bodyMat, 0, 3.0], [sheetMat, -0.08, 3.2], [sheetMat, 0.1, 2.6]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, top - POOL.y), mat); m.position.set(CRAG.x, (top + POOL.y) / 2, CRAG.z - 1.75 + dz); fall.add(m); }
    // The stream that feeds it, on top of the crag, and the white water where it lands.
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.6).rotateX(-Math.PI / 2), sheetMat); bed.position.set(CRAG.x, top + 0.42, CRAG.z + 1.1); fall.add(bed);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })); foam.position.set(CRAG.x, POOL.y + 0.03, CRAG.z - 2.2); fall.add(foam);
    const N = 26, sp = new Float32Array(N * 3), seeds = [...Array(N)].map((_, i) => [Math.random() * 6.28, 0.6 + Math.random() * 2.2, Math.random()]);
    const spray = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ size: 0.34, color: 0xffffff, map: glowTex, transparent: true, opacity: 0.55, depthWrite: false })); fall.add(spray);
    fall.traverse((o) => { o.userData.noShadow = true; }); scene.add(fall);
    updaters.push((dt, t) => {
      wt.offset.y = (t * 0.9) % 1;
      foam.scale.setScalar(1 + 0.08 * Math.sin(t * 3.1)); foam.material.opacity = 0.45 + 0.12 * Math.sin(t * 4.3);
      for (let i = 0; i < N; i++) { const [a, r, ph] = seeds[i], k = (t * 0.55 + ph) % 1; sp[i * 3] = CRAG.x + Math.cos(a) * r * (0.4 + k); sp[i * 3 + 1] = POOL.y + 0.1 + Math.sin(k * Math.PI) * 1.3; sp[i * 3 + 2] = CRAG.z - 2.2 + Math.sin(a) * r * 0.6 * (0.4 + k); }
      spray.geometry.attributes.position.needsUpdate = true;
    });
    // Where the rock is solid: the crag's shoulders and back. The way in is through the water.
    for (const [bx, by, r] of [[-4.6, 0.2, 2.0], [-4.7, 2.8, 2.2], [-4.6, 5.4, 2.3], [4.7, 0.3, 2.0], [4.8, 2.9, 2.3], [4.7, 5.6, 2.3], [0, 6.4, 3.0], [-2.6, 6.2, 2.2], [2.6, 6.3, 2.2], [-6.0, -1.0, 1.4], [6.2, -0.7, 1.4]]) colliders.push({ x: CRAG.x - bx, z: CRAG.z + by, r });
    colliders.push({ x: GARDEN.x, z: GARDEN.z, r: 2.1 });
    loadProps().then((make) => {
      const crag = make && make('falls_crag'); if (!crag) return;
      crag.position.set(CRAG.x, CRAG.y - 0.35, CRAG.z); crag.rotation.y = Math.PI; crag.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.castShadow = false; o.userData.noShadow = true; } }); scene.add(crag);
      const glow = (m) => m.traverse((o) => { if (o.isMesh && o.material.name === 'g_shroom_cap') { o.material.emissive.set(0x5fe8cf); o.material.emissiveIntensity = 1.6; } });
      for (const [bx, by, sc, ry] of [[1.7, 3.1, 1.2, 0.4], [-2.1, 3.3, 0.9, 2.1], [0.6, 3.7, 0.7, 4], [2.2, 1.6, 0.6, 1]]) { const m = make('glow_mushrooms'); glow(m); m.position.set(CRAG.x - bx, CRAG.y + 0.02, CRAG.z + by); m.scale.setScalar(sc); m.rotation.y = ry; scene.add(m); }
      const stone = make.single('slab_0');
      if (stone) { const inst = new THREE.InstancedMesh(stone.geometry, stone.material, STONES.length), d = new THREE.Object3D(); STONES.forEach((st, i) => { d.position.set(st.x, POOL.y + 0.02, st.z); d.rotation.set(0, i * 1.9, 0); d.scale.set(1.25, 1.4, 1.25); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }); inst.userData.noShadow = true; scene.add(inst); }
      // The garden: a round hut with a turf roof and two beds of things coming up.
      const hut = make('garden_hut'); hut.position.set(GARDEN.x, terrainHeight(GARDEN.x, GARDEN.z) - 0.25, GARDEN.z); hut.rotation.y = -2.2; scene.add(hut);
      for (const [dx, dz, ry] of [[-6.5, 4.5, 0.25], [-1.5, 8.2, -0.2]]) { const bed2 = make('garden_bed'); bed2.position.set(GARDEN.x + dx, terrainHeight(GARDEN.x + dx, GARDEN.z + dz) - 0.03, GARDEN.z + dz); bed2.rotation.y = ry; scene.add(bed2); }
    });
  }
  // Whisper Woods: an old hollow tree big enough to walk into, deep among the birches and off the path; fallen
  // trunks, mushrooms that give light, and fireflies that are out by day here. A thicker line of fireflies drifts
  // from the path to the hollow tree, for anyone who wonders where they are going.
  if (FAR) {
    const T = HOLLOW_TREE, face = -T.ry;
    for (let k = 0; k < 14; k++) { const a = face + 0.52 + k * (Math.PI * 2 - 1.04) / 13; colliders.push({ x: T.x + Math.cos(a) * 2.2, z: T.z + Math.sin(a) * 2.2, r: 0.6 }); }
    const wr = mulberry32(3131), spot = (minPath, far) => { for (let k = 0; k < 400; k++) { const a = wr() * 6.283, d = Math.sqrt(wr()) * WOODS.r * 0.95, x = WOODS.x + Math.cos(a) * d, z = WOODS.z + Math.sin(a) * d; if (pathDist(x, z) > minPath && terrainHeight(x, z) > 1 && Math.hypot(x - T.x, z - T.z) > far) return { x, z }; } return null; };
    const logs = [], giants = [], shrooms = [];
    for (let i = 0; i < 11; i++) { const p = spot(2.5, 9); if (!p) continue; const ry = wr() * 6.283; logs.push({ ...p, ry }); for (const s2 of [-2.4, -0.6, 1.2, 3]) colliders.push({ x: p.x + Math.cos(ry) * s2, z: p.z - Math.sin(ry) * s2, r: 0.45 }); }
    for (let i = 0; i < 13; i++) { const p = spot(1.6, 6); if (p) { giants.push({ ...p, ry: wr() * 6, s: 0.7 + wr() * 0.8 }); colliders.push({ x: p.x, z: p.z, r: 0.22 }); } }
    for (let i = 0; i < 34; i++) { const p = spot(0.9, 3.4); if (p) shrooms.push({ ...p, ry: wr() * 6, s: 0.7 + wr() * 0.9 }); }
    loadProps().then((make) => {
      const tree = make && make('hollow_tree'); if (!tree) return;
      const lit = (m) => m.traverse((o) => { if (!o.isMesh) return; const n = o.material.name; if (n === 'g_shroom_cap') { o.material.emissive.set(0x5fe8cf); o.material.emissiveIntensity = 1.6; } if (n === 't_gills') { o.material.emissive.set(0xffc060); o.material.emissiveIntensity = 1.8; o.material.side = THREE.DoubleSide; } if (n === 't_old_bark_b') o.material.color.set(0x63524a); if (n === 't_old_dark') o.material.color.set(0x7a5433); if (/^t_old_(bark|inner|dark)/.test(n)) o.material.side = THREE.DoubleSide; });
      lit(tree); tree.position.set(T.x, terrainHeight(T.x, T.z) - 0.1, T.z); tree.rotation.y = T.ry; tree.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(tree);
      for (const [dx, dz, sc] of [[-0.9, 0.7, 1.1], [0.3, -1.1, 0.8], [-1.0, -0.5, 0.6]]) { const m = make('glow_mushrooms'); lit(m); m.position.set(T.x + dx, terrainHeight(T.x + dx, T.z + dz), T.z + dz); m.scale.setScalar(sc); scene.add(m); }
      for (const p of logs) { const m = make('fallen_trunk'); m.position.set(p.x, terrainHeight(p.x, p.z) - 0.08, p.z); m.rotation.y = p.ry; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(m); }
      for (const p of giants) { const m = make('giant_mushroom'); lit(m); m.position.set(p.x, terrainHeight(p.x, p.z) - 0.05, p.z); m.rotation.y = p.ry; m.scale.setScalar(p.s); m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(m); }
      for (const p of shrooms) { const m = make('glow_mushrooms'); lit(m); m.position.set(p.x, terrainHeight(p.x, p.z), p.z); m.rotation.y = p.ry; m.scale.setScalar(p.s); m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(m); }
    });
    // Fireflies: a scatter through the whole wood, and the line that leads to the tree.
    const NF = 190, base = [], fp = new Float32Array(NF * 3), from = { x: WOODS.x + 2, z: WOODS.z - 1 };
    for (let i = 0; i < NF; i++) {
      if (i < 70) { const k = i / 70, x = from.x + (T.x - from.x) * k + (wr() - 0.5) * 3.2, z = from.z + (T.z - from.z) * k + (wr() - 0.5) * 3.2; base.push([x, terrainHeight(x, z) + 0.7 + wr() * 1.6, z, wr() * 6.28]); }
      else { const p = spot(0, 0) || T; base.push([p.x, terrainHeight(p.x, p.z) + 0.6 + wr() * 2.4, p.z, wr() * 6.28]); }
    }
    const flyMat = new THREE.PointsMaterial({ size: 0.3, color: 0xffe9a0, map: glowTex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    const flies = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fp, 3)), flyMat); flies.frustumCulled = false; scene.add(flies);
    updaters.push((dt, t) => {
      const cam = opts.camera; flies.visible = !cam || Math.hypot(cam.position.x - WOODS.x, cam.position.z - WOODS.z) < WOODS.r + 70;
      if (!flies.visible) return;
      for (let i = 0; i < NF; i++) { const b = base[i]; fp[i * 3] = b[0] + Math.sin(t * 0.5 + b[3]) * 0.8; fp[i * 3 + 1] = b[1] + Math.sin(t * 0.8 + b[3] * 2) * 0.35; fp[i * 3 + 2] = b[2] + Math.cos(t * 0.43 + b[3]) * 0.8; }
      flies.geometry.attributes.position.needsUpdate = true;
      flyMat.opacity = 0.6 + 0.3 * Math.sin(t * 1.7);
    });
  }
  // Lantern Point: the keeper's cottage, half its roof gone, with a carving over the door; and the Lamplighter, a
  // heron who has been mending the tower alone, standing at the foot of her scaffold.
  const cs = Math.cos(COTTAGE.ry), sn = Math.sin(COTTAGE.ry), fromCottage = (lx, lz) => ({ x: COTTAGE.x + lx * cs + lz * sn, z: COTTAGE.z - lx * sn + lz * cs });
  const heron = { x: LIGHTHOUSE.x + 5.6, z: LIGHTHOUSE.z + 3.4, group: null, home: 0 }, cottage = { at: fromCottage, ry: COTTAGE.ry, door: fromCottage(-0.25, 3.4), inside: (x, z) => { const dx = x - COTTAGE.x, dz = z - COTTAGE.z, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; return Math.abs(lx) < 2.7 && Math.abs(lz) < 1.9; } };
  if (FAR) {
    heron.home = Math.atan2(-(POINT.z - heron.z), POINT.x + 6 - heron.x);
    colliders.push({ x: heron.x, z: heron.z, r: 0.6 });
    for (let k = -3; k <= 3; k++) { colliders.push({ ...fromCottage(k * 1.05, -2.3), r: 0.6 }); if (k < -1 || k > 0) colliders.push({ ...fromCottage(k * 1.05, 2.3), r: 0.6 }); }
    for (let k = -1; k <= 1; k++) { colliders.push({ ...fromCottage(-3.2, k * 1.2), r: 0.6 }); colliders.push({ ...fromCottage(3.2, k * 1.2), r: 0.6 }); }
    loadProps().then((make) => {
      const house = make && make('cottage', 'cottage_carving'); if (!house) return;
      const g = new THREE.Group(); g.add(house, make('cottage_carving'));
      // What is cut into the lintel: a stag, and beside him an otter no taller than his knee.
      const c = document.createElement('canvas'); c.width = 520; c.height = 96; const k = c.getContext('2d');
      k.strokeStyle = '#4a3320'; k.lineCap = 'round'; k.lineJoin = 'round';
      const L = (pts, w) => { k.lineWidth = w; k.beginPath(); pts.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))); k.stroke(); };
      L([[170, 52], [226, 50], [236, 28]], 9); for (const x of [174, 188, 214, 226]) L([[x, 52], [x, 82]], 5); k.fillStyle = '#4a3320'; k.beginPath(); k.arc(240, 22, 7, 0, 7); k.fill();
      for (const d of [-1, 1]) { L([[239, 16], [239 + d * 12, 2], [239 + d * 22, 0]], 4); L([[239 + d * 8, 8], [239 + d * 17, 9]], 3); }
      L([[282, 78], [300, 66], [330, 66], [344, 60]], 8); k.beginPath(); k.arc(349, 57, 6, 0, 7); k.fill(); L([[282, 78], [262, 84], [250, 80]], 5); for (const x of [298, 328]) L([[x, 68], [x, 84]], 4);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const cut = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false })); cut.position.set(-0.25, 2.2, 2.69); g.add(cut);
      g.position.set(COTTAGE.x, COTTAGE.y - 0.08, COTTAGE.z); g.rotation.y = COTTAGE.ry; g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(g);
      const birdPup = make.puppet ? make.puppet('heron', -Math.PI / 2) : null, bird = birdPup ? birdPup.group : make('heron'); heron.pup = birdPup; if (bird) { bird.position.set(heron.x, terrainHeight(heron.x, heron.z) - 0.02, heron.z); bird.rotation.y = heron.home; bird.scale.setScalar(1.2); bird.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(bird); heron.group = bird; }
    });
  }
  // The Tide Flats: the sea comes in over the mud and goes out again every sixteen minutes, by the island's shared
  // clock. On the mud lies the wreck; stones lead out to an islet with a bell on it; rock pools are left behind.
  const flats = { wreck: { ...WRECK, ry: 2.2, stern: null }, bell: { x: ISLET.x + 1.2, z: ISLET.z - 0.8, group: null, swing: 0 }, pools: [] };
  if (FAR) {
    const W = flats.wreck, wc = Math.cos(W.ry), ws = Math.sin(W.ry), fromWreck = (lx, lz) => ({ x: W.x + lx * wc + lz * ws, z: W.z - lx * ws + lz * wc });
    W.stern = fromWreck(-5.6, 0.6);
    for (const lx of [-3.2, -1, 1.2, 3.2]) colliders.push({ ...fromWreck(lx, -0.6), r: 1.25 });
    colliders.push({ x: flats.bell.x, z: flats.bell.z, r: 0.35 });
    const pr = mulberry32(4242);
    for (let k = 0; k < 400 && flats.pools.length < 7; k++) { const a = pr() * 6.283, d = 6 + pr() * (FLATS.r * 0.62), x = FLATS.x + Math.cos(a) * d, z = FLATS.z + Math.sin(a) * d; if (terrainHeight(x, z) > TIDE.flat + 0.12 || terrainHeight(x, z) < TIDE.flat - 0.1 || pathDist(x, z) < 3 || Math.hypot(x - W.x, z - W.z) < 9 || flats.pools.some((q) => Math.hypot(q.x - x, q.z - z) < 9)) continue; flats.pools.push({ x, z, ry: pr() * 6, s: 0.8 + pr() * 0.5 }); colliders.push({ x, z, r: 0.4 }); }
    const tideMat = new THREE.MeshStandardMaterial({ color: 0x4f8e90, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.74, flatShading: true });
    const tide = new THREE.Mesh(new THREE.CircleGeometry(105, 28).rotateX(-Math.PI / 2), tideMat); tide.position.set((FLATS.x + ISLET.x) / 2, TIDE.low, (FLATS.z + ISLET.z) / 2); tide.userData.noShadow = true; scene.add(tide);
    skyHooks.push((k) => { tideMat.color.setHex(k.sea); });
    updaters.push((dt, t) => { tide.position.y = tideAt(timeNow()).y + Math.sin(t * 0.7) * 0.02; if (flats.bell.group) { flats.bell.swing *= Math.exp(-dt * 1.1); flats.bell.group.rotation.z = Math.sin(t * 7) * flats.bell.swing; } });
    loadProps().then((make) => {
      const wreck = make && make('wreck', 'wreck_name'); if (!wreck) return;
      const quiet = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; o.material.side = THREE.DoubleSide; } }); return m; };
      const g = new THREE.Group(); g.add(quiet(wreck), quiet(make('wreck_name'))); g.position.set(W.x, terrainHeight(W.x, W.z) - 0.25, W.z); g.rotation.y = W.ry; scene.add(g);
      for (const q of flats.pools) { const m = quiet(make('rock_pool')); m.position.set(q.x, terrainHeight(q.x, q.z) - 0.05, q.z); m.rotation.y = q.ry; m.scale.setScalar(q.s); const w = new THREE.Mesh(new THREE.CircleGeometry(1.15, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5fb0aa, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.6 })); w.position.y = 0.2; m.add(w); scene.add(m); }
      const bell = make('tide_bell', 'tide_bell_bell'); if (bell) { const swing = make('tide_bell_bell'), hang = new THREE.Group(); quiet(bell); quiet(swing); hang.position.set(0.68, 2.42, 0); swing.position.set(-0.68, -2.42, 0); hang.add(swing); bell.add(hang); bell.position.set(flats.bell.x, terrainHeight(flats.bell.x, flats.bell.z) - 0.05, flats.bell.z); bell.rotation.y = 1.0; bell.scale.setScalar(1.15); scene.add(bell); flats.bell.group = hang; }
      const cr2 = mulberry32(99), stones2 = [], bx = ISLET.x - FLAT_EDGE.x, bz = ISLET.z - FLAT_EDGE.z, L = Math.hypot(bx, bz);
      for (let d = -4; d < L - 5; d += 1.45) { const k = d / L, x = FLAT_EDGE.x + bx * k + (cr2() - 0.5) * 1.3, z = FLAT_EDGE.z + bz * k + (cr2() - 0.5) * 1.3; stones2.push({ x, y: terrainHeight(x, z) + 0.02, z, s: 1.0 + cr2() * 0.5, ry: cr2() * 6, n: Math.floor(cr2() * 3) }); }
      for (let n = 0; n < 3; n++) batch(make, 'slab_' + n, stones2.filter((q) => q.n === n));
    });
  }
  // The Far Beach: a cove on the north-west coast that the hills hide. On it, a shelter of driftwood open to the
  // sea and the evening; on a ledge of the cliff nearby, a hot spring.
  if (FAR) {
    const ry = -FARBEACH.a, c2 = Math.cos(ry), s2 = Math.sin(ry), fromShelter = (lx, lz) => ({ x: SHELTER.x + lx * c2 + lz * s2, z: SHELTER.z - lx * s2 + lz * c2 });
    for (const lz of [-2.2, -1.1, 0, 1.1, 2.2]) colliders.push({ ...fromShelter(-1.3, lz), r: 0.6 });
    for (const lz of [-1.2, 0, 1.2]) colliders.push({ ...fromShelter(1.6, lz), r: 0.36 });
    colliders.push({ x: SPRING.x - 2.6, z: SPRING.z - 0.4, r: 1.0 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.25, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fd8cf, emissive: 0x2f6f6a, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.78, flatShading: true }));
    water.position.set(SPRING.x, SPRING.y - 0.14, SPRING.z); water.userData.noShadow = true; scene.add(water);
    const NS = 22, sp = new Float32Array(NS * 3), seed = [...Array(NS)].map(() => [Math.random() * 6.28, Math.random() * 1.9, Math.random()]);
    const steam = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)), new THREE.PointsMaterial({ size: 1.1, color: 0xffffff, map: glowTex, transparent: true, opacity: 0.16, depthWrite: false })); steam.frustumCulled = false; scene.add(steam);
    updaters.push((dt, t) => { for (let i = 0; i < NS; i++) { const [a, r, ph] = seed[i], k = (t * 0.16 + ph) % 1; sp[i * 3] = SPRING.x + Math.cos(a) * r + Math.sin(t * 0.4 + a) * 0.3 + k * 0.8; sp[i * 3 + 1] = SPRING.y + 0.1 + k * 3.2; sp[i * 3 + 2] = SPRING.z + Math.sin(a) * r; } steam.geometry.attributes.position.needsUpdate = true; });
    loadProps().then((make) => {
      const spring = make && make('hot_spring'); if (!spring) return;
      const quiet = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
      quiet(spring).position.set(SPRING.x, SPRING.y - 0.02, SPRING.z); scene.add(spring);
      const sh = quiet(make('drift_shelter')); sh.position.set(SHELTER.x, terrainHeight(SHELTER.x, SHELTER.z) - 0.05, SHELTER.z); sh.rotation.y = ry; scene.add(sh);
      // a few stones up the bank, from the beach to the ledge
      const st = [], n = 14; for (let i = 1; i < n; i++) { const k = i / n, x = lerp(FARBEACH.x + 6, SPRING.x - 4, k) + Math.sin(i * 2.3) * 1.2, z = lerp(FARBEACH.z - 2, SPRING.z + 3, k) + Math.cos(i * 1.7) * 1.2; st.push({ x, y: terrainHeight(x, z) + 0.02, z, s: 0.9 + (i % 3) * 0.15, ry: i * 1.3, n: i % 3 }); }
      for (let k = 0; k < 3; k++) batch(make, 'slab_' + k, st.filter((q) => q.n === k));
    });
  }
  // Hidden places in the open country: the moon pool, the whale, the seat that faces home, the wayfarers' cairn.
  const hidden = { cairnStones: null, moon: null };
  // ---------- chests, and small things to pick up ----------
  // Chests stand in fixed places; each visitor may open each one once. The lid is its own piece, hinged at the back.
  const CHEST_AT = FAR ? {
    landing: [MAPMAKER.x - 10, MAPMAKER.z - 13, 0.6], woods: [WOODS.x + 14, WOODS.z - 19, 2.1], meadow: [HILL.x + 19, HILL.z + 15, 4.2], farbeach: [SHELTER.x - 6, SHELTER.z - 7, 1.0],
    garden: [GARDEN.x - 9.5, GARDEN.z - 3.5, 2.6], cliff: [WAYCAIRN.x + 12, WAYCAIRN.z - 4, 5.5], grotto: [CRAG.x + 1.6, CRAG.z + 2.6, 3.4], cave1: [CAVE.deadend.x + 1.6, CAVE.deadend.z + 1.9, 3.9], cave2: [CAVE.gallery.x - 2.4, CAVE.gallery.z - 2.8, 0.9],
    bones: [BONES.x + 2.5, BONES.z + 1.5, 2.2], cottage: [cottage.door.x * 0 + fromCottage(-1.3, -1.0).x, fromCottage(-1.3, -1.0).z, COTTAGE.ry], islet: [ISLET.x - 3.4, ISLET.z - 1.6, 1.2], summit: [SUMMIT.x + 1.7, SUMMIT.z + 1.3, 3.8],
    trunk: [TRUNK.x - 2.6, TRUNK.z + 2.9, 1.1], ledge: [LEDGE.x - 1.6, LEDGE.z + 1.5, 4.9], cove: [COVE.x + COVE.ox * -2.2, COVE.z + COVE.oz * -2.2, 2.9], ring: [DUSKRING.x, DUSKRING.z, 0.7], sunken: [SUNKEN.x + 1.1, SUNKEN.z - 0.9, 2.3], stack: [STACK.x - 2.2, STACK.z + 2.0, 4.0], gap: [GAP.x, GAP.z, GAP.ry], watch: [WATCH.x + 0.4, WATCH.z + 0.3, WATCH.ry + 3.1], chapel: [CHAPEL.x - Math.sin(CHAPEL.ry) * 3.0 + 1.2, CHAPEL.z - Math.cos(CHAPEL.ry) * 3.0, CHAPEL.ry],
    lake: [CAVE.lake.x + 5.6, CAVE.lake.z - 5.4, 5.2], two: [SEAT.x - 3.5, SEAT.z + 4.5, 2.0], moon: [MOONPOOL.x + 5.4, MOONPOOL.z - 2.6, 4.4], wreck: [WRECK.x - 8.5, WRECK.z + 6.5, 0.5],
  } : { h1: [16.7, -14.0, 2.4], h2: [-20.5, -17.5, 0.7], h3: [-22.5, 13.2, 5.0] };
  const chests = (CHESTS[FAR ? 'far' : 'home'] || []).map((c) => { const [x, z, ry] = CHEST_AT[c.at]; return { ...c, x, z, ry, group: null, lid: null, open: false, swing: 0, cave: FAR && roofedAt(x, z, 1.5) }; });
  for (const c of chests) colliders.push({ x: c.x, z: c.z, r: 0.45 });
  // Things lying about: what kind depends on the sort of ground. They come back a while after being taken.
  const pickups = [];
  if (FAR) {
    const pr = mulberry32(4242), far2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
    const want = { sprig: 26, mushroom: 22, shell: 12, whelk: 8, seaglass: 8, feather: 12, crystal: 16 };
    for (let k = 0; k < 60000 && Object.values(want).some((n) => n > 0); k++) {
      const x = -350 + pr() * 400, z = -170 + pr() * 390, a = Math.atan2(z, x), r = Math.hypot(x, z);
      const inCave = x < -140 && x > -228 && z < -50 && z > -124 && roofedAt(x, z, -0.7);
      if (!inCave && r > shoreR(a) - 4) continue;
      const h = terrainHeight(x, z), area = areaAt(x, z), id = area ? area.id : '';
      const slope = Math.abs(terrainHeight(x + 1.2, z) - h) + Math.abs(terrainHeight(x, z + 1.2) - h);
      if (slope > 0.9) continue;
      let kind = '';
      if (inCave) kind = 'crystal';
      else if (x < -140 && x > -232 && z < -46 && z > -128) continue;      // nothing on the roof of the hill
      else if (id === 'flats' || (h < 1.7 && r > shoreR(a) - 16)) kind = ['shell', 'whelk', 'seaglass'][Math.floor(pr() * 3)];
      else if (id === 'woods' || id === 'valley') kind = 'mushroom';
      else if (h > 17 && pr() < 0.4) kind = 'feather';
      else if (h > 6) kind = 'sprig';
      if (!kind || !(want[kind] > 0) || pickups.some((q) => far2(q, { x, z }) < (inCave ? 16 : 64)) || chests.some((c) => far2(c, { x, z }) < 9)) continue;
      want[kind]--; pickups.push({ kind, x, z, cave: inCave, group: null, there: true, back: 0 });
    }
  }
  loadProps().then((make) => {
    if (!make || !make('chest_plain')) return;
    for (const c of chests) {
      const model = c.kind === 'iron' ? 'chest_iron' : 'chest_plain', g = make(model, model + '_lid'), lid = make(model + '_lid'), hinge = new THREE.Group();
      if (!g || !lid) continue;
      hinge.position.set(0, 0.34, -0.23); lid.position.set(0, -0.34, 0.23); hinge.add(lid); g.add(hinge);      // the lid turns about its back edge
      g.position.set(c.x, (c.at === 'cottage' ? COTTAGE.y : c.at === 'stack' ? STACK.y : terrainHeight(c.x, c.z)) - 0.02, c.z); g.rotation.y = c.ry; g.scale.setScalar(1.2);
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); scene.add(g); c.group = g; c.lid = hinge; hinge.rotation.x = c.open ? -1.9 : 0;
      updaters.push((dt) => { const to = c.open ? -1.9 : 0; if (Math.abs(hinge.rotation.x - to) > 0.002) hinge.rotation.x += (to - hinge.rotation.x) * (1 - Math.exp(-dt * 5)); });
    }
    for (const pk of pickups) {
      const m = make(ITEMS[pk.kind].model); if (!m) continue;
      const g = new THREE.Group(); m.scale.setScalar(pk.kind === 'crystal' ? 1.5 : 1.35); g.add(m);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; if (pk.kind === 'crystal') { o.material.emissive = new THREE.Color(0x3fb6c2); o.material.emissiveIntensity = 0.7; } } });
      g.position.set(pk.x, terrainHeight(pk.x, pk.z) + 0.02, pk.z); g.rotation.y = pk.x * 1.7; g.visible = pk.there; scene.add(g); pk.group = g;
    }
  });
  // Waystones: a lantern on a post in each part of the island. A visitor who has lit one can come back to it from any other.
  const nearPath = (a) => { let best = null, bd = 1e9; for (const path of PATHS) for (const v of path) { const d = Math.hypot(v[0] - a.x, v[1] - a.z); if (d < bd) { bd = d; best = v; } } return best; };
  const ways = FAR ? [{ id: 'landing', name: 'The Landing', x: 13.5, z: 7.5, lit: true }, ...AREAS.filter((a) => a.id !== 'landing').map((a) => { const v = nearPath(a) || [a.x, a.z]; return { id: a.id, name: a.name, x: v[0] + 2.4, z: v[1] + 1.6, lit: false }; })] : [];
  for (const w of ways) { w.group = null; w.glow = []; colliders.push({ x: w.x, z: w.z, r: 0.35 }); }
  const stock = { group: null, kind: '', n: -1 };
  if (FAR) loadProps().then((make) => {
    if (!make || !make('lantern_pole')) return;
    for (const w of ways) {
      const m = make('lantern_pole'); m.position.set(w.x, terrainHeight(w.x, w.z) - 0.03, w.z); m.scale.setScalar(1.25); m.rotation.y = w.x;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; if (o.material.name === 'c_lantern_glow') { o.material = o.material.clone(); w.glow.push(o.material); } } });
      scene.add(m); w.group = m; setWay(w);
    }
    stock.make = make; stock.group = new THREE.Group(); stock.group.position.set(lighthouse.door.x + 3.2, 0, lighthouse.door.z + 4.2); scene.add(stock.group); setStock(stock.kind, stock.want || 0);
  });
  function setWay(w) { for (const g of w.glow) { g.emissive.set(w.lit ? 0xffb45a : 0x000000); g.emissiveIntensity = w.lit ? 2.2 : 0; g.color.set(w.lit ? 0xffd9a0 : 0x4a4640); } }
  // What has been brought for the tower so far, stacked by its door: up to twelve heaps of whatever is being asked for.
  function setStock(kind, share) {
    stock.kind = kind; stock.want = share;
    if (!stock.group || !stock.make) return;
    const n = kind ? Math.max(share > 0 ? 1 : 0, Math.round(share * 12)) : 0;
    if (stock.n === n && stock.shown === kind) return;
    stock.n = n; stock.shown = kind;
    while (stock.group.children.length) stock.group.remove(stock.group.children[0]);
    const model = { stone: 'rubble_pile', timber: 'timber_stack', glass: 'pick_crystal', oil: 'lampseed' }[kind];
    for (let i = 0; i < n; i++) { const m = stock.make(model); if (!m) break; const cx = (i % 4) * 1.5, cz = Math.floor(i / 4) * 1.5; m.position.set(cx, terrainHeight(stock.group.position.x + cx, stock.group.position.z + cz) - 0.03, cz); m.scale.setScalar(kind === 'glass' ? 1.6 : kind === 'oil' ? 0.8 : 0.55); m.rotation.y = i * 1.3; m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); stock.group.add(m); }
  }
  if (FAR) {
    // The lake under the hill: still, black water that gives back whatever light is brought to it.
    const lake = new THREE.Mesh(new THREE.CircleGeometry(CAVE.lake.r - 1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b3d47, roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.86, flatShading: true, emissive: 0x0a2a30, emissiveIntensity: 0.6 }));
    lake.position.set(CAVE.lake.x, CAVE.lake.y, CAVE.lake.z); lake.userData.noShadow = true; scene.add(lake);
  }
  // Where what the tower needs can be had: fallen stone on the point and under the crag, ship's timber on the Far
  // Beach and in the wreck (when the tide is off her), crystal in the round room under the hill, lamp-seed in the valley.
  const sources = FAR ? [
    { kind: 'stone', x: LIGHTHOUSE.x + 9, z: LIGHTHOUSE.z - 9, ry: 0.4 }, { kind: 'stone', x: LIGHTHOUSE.x + 15, z: LIGHTHOUSE.z - 5, ry: 2.1 }, { kind: 'stone', x: SUMMIT.x + 9, z: SUMMIT.z + 9, ry: 1.2 },
    { kind: 'timber', x: SHELTER.x + 5.5, z: SHELTER.z - 3.5, ry: 0.5 }, { kind: 'timber', x: SHELTER.x - 2, z: SHELTER.z + 6, ry: 1.9 }, { kind: 'timber', x: WRECK.x, z: WRECK.z, tide: true, bare: true },
    { kind: 'glass', x: CAVE.pts[2][0] - 3.4, z: CAVE.pts[2][1] + 3.0, cave: true, bare: true }, { kind: 'glass', x: CAVE.pts[2][0] + 3.6, z: CAVE.pts[2][1] + 2.6, cave: true, bare: true },
    { kind: 'oil', x: GARDEN.x - 6.5, z: GARDEN.z + 4.5 }, { kind: 'oil', x: GARDEN.x - 1.5, z: GARDEN.z + 8.2 }, { kind: 'oil', x: GARDEN.x + 4.5, z: GARDEN.z + 5.5 },
  ] : [];
  if (FAR) loadProps().then((make) => {
    if (!make || !make('rubble_pile')) return;
    for (const sc of sources) {
      if (sc.bare) continue;
      if (sc.kind === 'oil') { for (let i = 0; i < 5; i++) { const m = make('lampseed'), a = i * 1.26, r = i ? 0.9 : 0; m.position.set(sc.x + Math.cos(a) * r, terrainHeight(sc.x + Math.cos(a) * r, sc.z + Math.sin(a) * r) - 0.03, sc.z + Math.sin(a) * r); m.rotation.y = i * 2.3; m.scale.setScalar(0.9 + (i % 3) * 0.12); m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); scene.add(m); } continue; }
      const m = make(sc.kind === 'stone' ? 'rubble_pile' : 'timber_stack'); m.position.set(sc.x, terrainHeight(sc.x, sc.z) - 0.05, sc.z); m.rotation.y = sc.ry || 0; if (sc.kind === 'stone') m.scale.setScalar(1.25);
      m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); scene.add(m); colliders.push({ x: sc.x, z: sc.z, r: sc.kind === 'stone' ? 1.2 : 1.3 });
    }
  });
  // The keeper's logbook: six torn pages, each under a pebble where the storm left it (the order is the order of the book).
  const logPages = FAR ? [
    fromCottage(1.3, -0.4), { x: HOLLOW_TREE.x + 0.3, z: HOLLOW_TREE.z - 0.2 }, { x: GARDEN.x + 2.5, z: GARDEN.z + 1.6 },
    { x: CAVE.pts[2][0] + 3.2, z: CAVE.pts[2][1] - 2.6, cave: true }, { x: ISLET.x - 2.6, z: ISLET.z + 1.8 }, { x: SHELTER.x + 1.5, z: SHELTER.z + 1.7 },
  ].map((pg) => ({ ...pg, group: null, there: true })) : [];
  if (FAR) loadProps().then((make) => {
    if (!make || !make('log_page')) return;
    logPages.forEach((pg, i) => {
      const g = new THREE.Group(), m = make('log_page');
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; if (o.material.name === 'lp_paper') { o.material = o.material.clone(); o.material.emissive.set(0xf3e2b4); o.material.emissiveIntensity = pg.cave ? 0.5 : 0.22; o.material.side = THREE.DoubleSide; } } });
      m.scale.setScalar(1.5); g.add(m);
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1c9, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
      glint.scale.setScalar(1.1); glint.position.y = 0.3; g.add(glint);
      g.position.set(pg.x, terrainHeight(pg.x, pg.z) + 0.02, pg.z); g.rotation.y = i * 1.9; g.visible = pg.there; scene.add(g); pg.group = g;
      updaters.push((dt, t) => { glint.material.opacity = 0.28 + 0.14 * Math.sin(t * 2.1 + i); });
    });
  });
  if (FAR) {
    colliders.push({ x: SEAT.x - 0.8, z: SEAT.z, r: 1.1 }, { x: WAYCAIRN.x, z: WAYCAIRN.z, r: 0.9 });
    for (const lx of [-5, -2.5, 0, 2.5, 5]) colliders.push({ x: BONES.x + lx * Math.cos(0.5), z: BONES.z - lx * Math.sin(0.5), r: 0.5 });
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.0, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x24365a, emissive: 0xbfd6ff, emissiveIntensity: 0, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.9, flatShading: true }));
    moon.position.set(MOONPOOL.x, MOONPOOL.y - 0.16, MOONPOOL.z); moon.userData.noShadow = true; scene.add(moon); hidden.moon = moon;
    const NM = 40, mp = new Float32Array(NM * 3), ms = [...Array(NM)].map(() => [Math.random() * 6.28, Math.sqrt(Math.random()) * 2.8, Math.random() * 6.28]);
    const motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mp, 3)), new THREE.PointsMaterial({ size: 0.16, color: 0xdfeaff, map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })); motes.frustumCulled = false; scene.add(motes);
    let dark = 0; skyHooks.push((k) => { dark = k.dark; });
    updaters.push((dt, t) => {
      // By day it is only a dark pool. After dark it holds the sky, and gives a little of it back.
      moon.material.emissiveIntensity = dark * (0.75 + 0.2 * Math.sin(t * 0.8)); motes.material.opacity = dark * 0.9; motes.visible = dark > 0.05;
      if (!motes.visible) return;
      for (let i = 0; i < NM; i++) { const [a, r, ph] = ms[i], k = (t * 0.07 + ph) % 1; mp[i * 3] = MOONPOOL.x + Math.cos(a + t * 0.05) * r; mp[i * 3 + 1] = MOONPOOL.y - 0.1 + k * 2.6; mp[i * 3 + 2] = MOONPOOL.z + Math.sin(a + t * 0.05) * r; }
      motes.geometry.attributes.position.needsUpdate = true;
    });
    loadProps().then((make) => {
      if (!make || !make('moon_pool')) return;
      const quiet = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); return m; };
      const pool = quiet(make('moon_pool')); pool.position.set(MOONPOOL.x, MOONPOOL.y, MOONPOOL.z); scene.add(pool);
      const bones = quiet(make('whale_bones')); bones.position.set(BONES.x, terrainHeight(BONES.x, BONES.z) - 0.1, BONES.z); bones.rotation.y = 0.5; bones.scale.setScalar(1.25); scene.add(bones);
      const seat = quiet(make('stone_seat')); seat.position.set(SEAT.x, terrainHeight(SEAT.x, SEAT.z) - 0.1, SEAT.z); seat.rotation.y = -0.12; scene.add(seat);      // it faces east, a little south: towards Hush Island
      const cairn = quiet(make('cairn')); cairn.position.set(WAYCAIRN.x, terrainHeight(WAYCAIRN.x, WAYCAIRN.z) - 0.1, WAYCAIRN.z); cairn.scale.setScalar(0.8); cairn.traverse((o) => { if (o.isMesh) o.material.side = THREE.DoubleSide; }); scene.add(cairn);
      // The stones visitors have left round its foot: as many as this visitor has laid.
      const peb = make.single('pebble'); if (peb) { const inst = new THREE.InstancedMesh(peb.geometry, peb.material, 60), d = new THREE.Object3D(), r0 = mulberry32(12); for (let i = 0; i < 60; i++) { const a = r0() * 6.283, r = 1.1 + r0() * 1.3; d.position.set(WAYCAIRN.x + Math.cos(a) * r, terrainHeight(WAYCAIRN.x + Math.cos(a) * r, WAYCAIRN.z + Math.sin(a) * r) + 0.04, WAYCAIRN.z + Math.sin(a) * r); d.rotation.set(0, r0() * 6, 0); d.scale.setScalar(1.6 + r0() * 1.6); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); } inst.count = hidden.laid || 0; inst.userData.noShadow = true; scene.add(inst); hidden.cairnStones = inst; }
    });
  }
  // The High Meadow: seven standing stones in a ring, each with a small light carved on the face that looks inward,
  // and on the crag above it the cairn that marks the top of the island.
  const stones = STANDING.map((st, i) => ({ ...st, i, group: null, mark: null, glow: 0, until: 0 }));
  if (FAR) {
    for (const st of stones) colliders.push({ x: st.x, z: st.z, r: 0.75 });
    colliders.push({ x: SUMMIT.x, z: SUMMIT.z, r: 0.9 });
    loadProps().then((make) => {
      if (!make || !make('standing_stone_0')) return;
      for (const st of stones) {
        const name = 'standing_stone_' + (st.i % 3), g = new THREE.Group(), body = make(name, name + '_mark'), mark = make(name + '_mark');
        mark.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: 0xcfe6e2, emissive: 0x9ff0e0, emissiveIntensity: 0.15, roughness: 0.6 }); st.mark = o.material; } });
        g.add(body, mark); g.position.set(st.x, terrainHeight(st.x, st.z) - 0.1, st.z); g.rotation.y = Math.atan2(HILL.x - st.x, HILL.z - st.z) + Math.PI;      // the marked face looks into the ring
        g.scale.setScalar(0.95 + (st.i % 3) * 0.08); g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } }); scene.add(g); st.group = g;
      }
      const cairn = make('cairn'); cairn.position.set(SUMMIT.x, terrainHeight(SUMMIT.x, SUMMIT.z) - 0.1, SUMMIT.z); cairn.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; o.material.side = THREE.DoubleSide; } }); scene.add(cairn);
    });
    updaters.push((dt, t) => { const now = Date.now(); for (const st of stones) { st.glow = lerp(st.glow, st.until > now ? 1 : 0, 1 - Math.exp(-dt * 6)); if (st.mark) st.mark.emissiveIntensity = 0.15 + st.glow * 3.2; } });
  }
  // Under Hollow Hill: the way in and the way out, stone growing from floor and roof, crystals in the round chamber,
  // and glow-worms on the roof all the way through.
  let caveK = 0, lastSky = null;
  let murkK = 0;
  const hermit = { x: 0, z: 0, group: null, home: 0 }, paintings = [];
  const echo = { crystals: [], door: { x: CAVE.door.x, z: CAVE.door.z, group: null, rings: [], open: false, drop: 0, solid: null }, mark: { x: CAVE.pool.x + 0.8, z: CAVE.pool.z + 4.6 } };
  if (FAR) {
    const cr = mulberry32(7117), at = (u) => { let acc = u * CAVE.pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - CAVE.pts[i][0], p[1] - CAVE.pts[i][1]), 0); for (let i = 0; i < CAVE.pts.length - 1; i++) { const L = Math.hypot(CAVE.pts[i + 1][0] - CAVE.pts[i][0], CAVE.pts[i + 1][1] - CAVE.pts[i][1]); if (acc <= L || i === CAVE.pts.length - 2) { const k = Math.min(1, acc / L); return { x: CAVE.pts[i][0] + (CAVE.pts[i + 1][0] - CAVE.pts[i][0]) * k, z: CAVE.pts[i][1] + (CAVE.pts[i + 1][1] - CAVE.pts[i][1]) * k, dx: (CAVE.pts[i + 1][0] - CAVE.pts[i][0]) / L, dz: (CAVE.pts[i + 1][1] - CAVE.pts[i][1]) / L }; } acc -= L; } };
    let uIn = 0, uOut = 1;
    for (let u = 0; u < 0.5; u += 0.01) { const p = at(u); if (caveRoofed(p.x, p.z, 0.5)) { uIn = u; break; } }
    for (let u = 1; u > 0.5; u -= 0.01) { const p = at(u); if (caveRoofed(p.x, p.z, 0.5)) { uOut = u; break; } }
    const inside = (lo, hi) => { for (let k = 0; k < 300; k++) { const x = -230 + cr() * 96, z = -126 + cr() * 78, c = caveAt(x, z); if (c.e > lo && c.e < hi && c.u > uIn + 0.04 && c.u < uOut - 0.04 && caveRoofed(x, z, 0.5)) return { x, z, c }; } return null; };
    // The Hermit sits outside the eastern mouth, to one side of the way in, looking down the path.
    { const p = at(uIn); hermit.x = p.x - p.dx * 6.2 - p.dz * 2.3; hermit.z = p.z - p.dz * 6.2 + p.dx * 2.3; hermit.home = Math.atan2(p.dz, -p.dx) + 0.5; colliders.push({ x: hermit.x, z: hermit.z, r: 0.8 }); }
    // The painted stones: three slabs leaned against the wall of the dark gallery. What is on them is drawn here,
    // in ochre, charcoal and chalk, and can only be seen by lantern light (main.js turns each one up or down).
    const INK = '#231d1b', OCHRE = '#b5562a', CHALK = '#efe6d0';
    const paint = (draw) => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 720; const g = c.getContext('2d'), r = mulberry32(draw.length * 31 + 5);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 5, jy = y + (r() - 0.5) * 5; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); }); g.stroke(); };
      const dot = (x, y, rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); };
      const sea = (y, x0, x1, col = INK) => { const pts = []; for (let x = x0; x <= x1; x += 26) pts.push([x, y + Math.sin(x * 0.05) * 9]); line(pts, col, 6); };
      const tower = (x, y, h, lit, broken) => { line([[x - 18, y], [x - 11, y - h], [x + 11, y - h], [x + 18, y], [x - 18, y]], INK, 7); line([[x - 34, y + 4], [x - 16, y - 10], [x + 16, y - 10], [x + 34, y + 4]], INK, 7); if (broken) { line([[x - 11, y - h], [x - 2, y - h + 16], [x + 5, y - h - 4], [x + 11, y - h + 10]], INK, 6); line([[x + 40, y - 6], [x + 62, y - 14], [x + 70, y]], INK, 6); } else { dot(x, y - h - 14, 12, lit ? OCHRE : INK); if (lit) for (let k = 0; k < 7; k++) { const a = -Math.PI + k * Math.PI / 6; line([[x + Math.cos(a) * 22, y - h - 14 + Math.sin(a) * 22], [x + Math.cos(a) * 44, y - h - 14 + Math.sin(a) * 44]], CHALK, 5); } } };
      const boat = (x, y, s, tilt = 0) => { g.save(); g.translate(x, y); g.rotate(tilt); line([[-40 * s, 0], [-26 * s, 18 * s], [26 * s, 18 * s], [42 * s, -2 * s], [-40 * s, 0]], INK, 6); line([[0, 0], [0, -52 * s]], INK, 5); line([[0, -50 * s], [30 * s, -14 * s], [0, -10 * s]], OCHRE, 6); g.restore(); };
      const stag = (x, y, s) => { line([[x - 26 * s, y - 30 * s], [x + 22 * s, y - 32 * s], [x + 30 * s, y - 52 * s]], INK, 12 * s); for (const lx of [-22, -10, 12, 22]) line([[x + lx * s, y - 30 * s], [x + lx * s, y]], INK, 6 * s); dot(x + 34 * s, y - 58 * s, 9 * s, INK); for (const d of [-1, 1]) { line([[x + 32 * s, y - 64 * s], [x + (32 + d * 16) * s, y - 92 * s], [x + (32 + d * 30) * s, y - 100 * s]], INK, 5 * s); line([[x + (32 + d * 10) * s, y - 80 * s], [x + (32 + d * 22) * s, y - 82 * s]], INK, 4 * s); } };
      draw({ g, line, dot, sea, tower, boat, stag, r });
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    };
    const PAINTED = [
      { id: 'lights', title: 'The first stone', text: 'Seven towers along a sea, each with a light at its head and lines of chalk coming from it. Small boats go between them. Whoever painted it took care over every one.',
        draw: ({ sea, tower, boat }) => { sea(560, 40, 990); sea(620, 80, 950); [[110, 470, 80], [250, 400, 90], [390, 360, 100], [520, 345, 110], [650, 360, 100], [790, 400, 90], [920, 470, 80]].forEach(([x, y, h]) => tower(x, y, h, true)); boat(320, 600, 0.8); boat(700, 610, 0.8); } },
      { id: 'storm', title: 'The second stone', text: 'Rain in hard slanting strokes. The sea stands up in coils. On the right a tower with its top gone and no chalk round it. On the left a boat lying over on its side, and in it something small and long with a tail.',
        draw: ({ line, sea, tower, boat, dot, r }) => { for (let i = 0; i < 46; i++) { const x = 30 + r() * 960, y = 30 + r() * 300; line([[x, y], [x - 26, y + 60]], INK, 4); } for (let i = 0; i < 6; i++) { const x = 90 + i * 150, y = 520 + (i % 2) * 50; line([[x - 60, y + 40], [x - 20, y - 30], [x + 30, y - 46], [x + 60, y - 10], [x + 40, y + 16], [x + 14, y + 4]], INK, 8); } sea(660, 40, 990); tower(840, 430, 130, false, true); boat(260, 470, 1.1, -0.5); line([[236, 430], [262, 442], [290, 436], [312, 452]], OCHRE, 9); dot(232, 428, 9, OCHRE); } },
      { id: 'leaving', title: 'The third stone', text: 'A small boat with one sail, and standing in it an animal with antlers, facing away. Behind it the broken tower. Ahead of it, far to the east, a low island with nothing on it but a fire, and chalk round the fire as there was once round the lights.',
        draw: ({ line, sea, tower, boat, stag, dot }) => { sea(590, 40, 990); sea(650, 60, 960); tower(120, 470, 120, false, true); boat(470, 520, 1.5); stag(452, 512, 1.0); line([[780, 560], [820, 520], [900, 512], [960, 556]], INK, 8); line([[858, 512], [866, 478], [876, 496], [884, 470], [892, 512]], OCHRE, 9); for (let k = 0; k < 6; k++) { const a = -Math.PI + 0.3 + k * 0.5; line([[874 + Math.cos(a) * 46, 490 + Math.sin(a) * 46], [874 + Math.cos(a) * 70, 490 + Math.sin(a) * 70]], CHALK, 5); } } },
      { id: 'west', title: 'The fourth stone', text: 'The paint is still wet. A broken mast lying in the sea, and along it something small and long with a tail, its head up. A bell with a cut rope. Behind, far to the right, the antlered boat going the other way. Ahead, on the left edge of the stone, a row of towers with no chalk round any of them, and past the last a single stroke of white.',
        draw: ({ line, sea, tower, boat, stag, dot }) => { sea(600, 40, 990); sea(655, 70, 960); line([[330, 560], [520, 540]], INK, 12); line([[400, 552], [392, 500]], INK, 6); line([[360, 540], [392, 530], [430, 536], [462, 524]], OCHRE, 10); dot(356, 536, 10, OCHRE); line([[462, 524], [486, 506]], OCHRE, 6); line([[560, 300], [560, 360]], INK, 5); line([[540, 360], [548, 400], [572, 400], [580, 360], [540, 360]], INK, 7); line([[560, 400], [556, 430]], INK, 4); boat(860, 520, 0.8); stag(850, 514, 0.55); [[70, 470, 70], [150, 440, 80], [230, 420, 86]].forEach(([x, y, h]) => tower(x, y, h, false)); line([[30, 380], [30, 330]], CHALK, 9); } },
    ];
    { const A = CAVE.pts[1];
      PAINTED.forEach((pn, i) => { const a = 3.55 + i * 0.78, x = A[0] + Math.cos(a) * 5.3, z = A[1] + Math.sin(a) * 5.3; paintings.push({ ...pn, x, z, ry: Math.atan2(A[0] - x, A[1] - z), mat: null, seen: false }); colliders.push({ x: x - Math.cos(a) * -0.6, z: z - Math.sin(a) * -0.6, r: 1.1 }); }); }
    // The echo chamber's three singing crystals, the stone door they open, and the pool room behind it.
    { const B = CAVE.pts[2]; [1.25, 2.9, 5.0].forEach((a, i) => { const x = B[0] + Math.cos(a) * 5.5, z = B[1] + Math.sin(a) * 5.5; echo.crystals.push({ x, z, group: null, until: 0, glow: 0, i }); colliders.push({ x, z, r: 0.7 }); });
      echo.door.solid = { x: CAVE.door.x, z: CAVE.door.z, r: 2.6 }; colliders.push(echo.door.solid);
      const pw = new THREE.Mesh(new THREE.CircleGeometry(CAVE.pool.r - 1.6, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f7f86, emissive: 0x1f5f6a, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85, flatShading: true }));
      pw.position.set(CAVE.pool.x, caveAt(CAVE.pool.x, CAVE.pool.z).floor + 0.34, CAVE.pool.z); pw.userData.noShadow = true; scene.add(pw);
      colliders.push({ x: echo.mark.x, z: echo.mark.z + 0.7, r: 1.0 }); }
    const ups = [], downs = [], gems = [];
    for (let i = 0; i < 26; i++) { const p = inside(-1.5, -0.3); if (p) { ups.push({ ...p, s: 0.6 + cr() * 0.8, ry: cr() * 6 }); colliders.push({ x: p.x, z: p.z, r: 0.42 }); } }
    for (let i = 0; i < 34; i++) { const p = inside(-9, -0.2); if (p) downs.push({ ...p, s: 0.6 + cr() * 0.9, ry: cr() * 6 }); }
    for (let i = 0; i < 9; i++) { const B = CAVE.pts[2], a = cr() * 6.283, x = B[0] + Math.cos(a) * 6.4, z = B[1] + Math.sin(a) * 6.4; if (caveAt(x, z).e < -0.3) gems.push({ x, z, s: 0.8 + cr() * 0.9, ry: cr() * 6 }); }
    loadProps().then((make) => {
      if (!make || !make('cave_mouth')) return;
      const quiet = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; if (/^k_crystal/.test(o.material.name)) { o.material.emissive.copy(o.material.color); o.material.emissiveIntensity = 1.3; } if (o.material.name === 'c_lantern_glow') { o.material.emissive.set(0xffb45a); o.material.emissiveIntensity = 2.2; } } }); return m; };
      for (const [u, dir] of [[uIn, 1], [uOut, -1]]) { const p = at(u), m = quiet(make('cave_mouth')); m.position.set(p.x - p.dx * dir * 1.2, caveAt(p.x, p.z).floor - 0.3, p.z - p.dz * dir * 1.2); m.rotation.y = Math.atan2(-p.dx * dir, -p.dz * dir); scene.add(m); for (const sx of [-4.6, 4.6]) colliders.push({ x: m.position.x - p.dz * sx, z: m.position.z + p.dx * sx, r: 2.0 }); }
      for (const p of ups) { const m = quiet(make('stalagmites')); m.position.set(p.x, p.c.floor + 0.3, p.z); m.scale.setScalar(p.s); m.rotation.y = p.ry; scene.add(m); }
      for (const p of downs) { const m = quiet(make('stalactites')); m.position.set(p.x, caveAt(p.x, p.z).top + 0.1, p.z); m.scale.setScalar(p.s); m.rotation.y = p.ry; scene.add(m); }
      for (const p of gems) { const m = quiet(make('crystals')); m.position.set(p.x, groundHeight(p.x, p.z) + 0.05, p.z); m.scale.setScalar(p.s); m.rotation.y = p.ry; scene.add(m); }
      for (const c of echo.crystals) { const m = quiet(make('crystals')); m.position.set(c.x, groundHeight(c.x, c.z), c.z); m.scale.setScalar(2.3); m.rotation.y = c.i * 2.1; m.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); }); scene.add(m); c.group = m; }
      { const D = echo.door, B = CAVE.pts[2], g = new THREE.Group(), wheel = quiet(make('echo_door', 'door_ring'));
        g.add(wheel); for (let i = 0; i < 3; i++) { const r = make('door_ring_' + i); if (!r) continue; r.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: 0x4a4652, emissive: 0x8fe6f0, emissiveIntensity: 0, roughness: 0.6 }); D.rings[i] = o.material; } }); g.add(r); }
        g.position.set(D.x, caveAt(D.x, D.z).floor - 0.4, D.z); g.rotation.y = Math.atan2(B[0] - D.x, B[1] - D.z); scene.add(g); D.group = g; D.y0 = g.position.y; if (D.open) { D.drop = 1; g.position.y = D.y0 - 6; } }
      { // the mark by the pool: scratched and pressed into the rock, not painted
        const slab = quiet(make('painted_stone')); slab.position.set(echo.mark.x, caveAt(echo.mark.x, echo.mark.z).floor - 0.1, echo.mark.z + 0.7); slab.rotation.y = Math.PI; slab.scale.setScalar(0.8);
        const tx = paint(({ line, dot, sea }) => { sea(560, 250, 780); line([[400, 470], [430, 510], [600, 510], [640, 462], [400, 470]], INK, 8); line([[515, 468], [515, 360]], INK, 6); line([[515, 362], [580, 440], [515, 448]], INK, 7); for (const [x, y] of [[470, 250], [500, 226], [534, 226], [564, 250]]) dot(x, y, 13, OCHRE); dot(517, 292, 30, OCHRE); line([[640, 300], [730, 300], [706, 280]], CHALK, 6); line([[730, 300], [706, 320]], CHALK, 6); });
        const art = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.1), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.7, depthWrite: false, fog: false, toneMapped: false })); art.position.set(0, 1.3, -0.36); art.rotation.x = -0.3; slab.add(art); scene.add(slab); }
      const hmPup = make.puppet ? make.puppet('hermit', -Math.PI / 2) : null, hm = hmPup ? hmPup.group : make('hermit'); hermit.pup = hmPup; if (hm) { hm.position.set(hermit.x, terrainHeight(hermit.x, hermit.z) - 0.04, hermit.z); hm.rotation.y = hermit.home; hm.scale.setScalar(1.15); quiet(hm); scene.add(hm); hermit.group = hm; }
      for (const pn of paintings) {
        const slab = quiet(make('painted_stone')); if (!slab) break;
        slab.position.set(pn.x, caveAt(pn.x, pn.z).floor - 0.1, pn.z); slab.rotation.y = pn.ry;
        pn.mat = new THREE.MeshBasicMaterial({ map: paint(pn.draw), transparent: true, opacity: 0.04, depthWrite: false, fog: false, toneMapped: false });
        const art = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.1), pn.mat); art.position.set(0, 1.29 + 0.012, -0.4 + 0.04); art.rotation.x = -0.3; slab.add(art);
        scene.add(slab);
      }
      const glow = (m) => m.traverse((o) => { if (o.isMesh && o.material.name === 'g_shroom_cap') { o.material.emissive.set(0x5fe8cf); o.material.emissiveIntensity = 1.6; } });
      for (let i = 0; i < 12; i++) { const p = inside(-1.2, 0.2); if (!p) continue; const m = make('glow_mushrooms'); glow(m); m.position.set(p.x, groundHeight(p.x, p.z), p.z); m.scale.setScalar(0.6 + cr() * 0.6); scene.add(m); }
    });
    const NG = 240, gp = new Float32Array(NG * 3); let n = 0;
    for (let k = 0; k < 4000 && n < NG; k++) { const x = -230 + cr() * 96, z = -126 + cr() * 78, c = caveAt(x, z); if (c.e > -0.2 || !caveRoofed(x, z, 0.3)) continue; gp[n * 3] = x; gp[n * 3 + 1] = c.top - 0.12 - cr() * 0.25; gp[n * 3 + 2] = z; n++; }
    const worms = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(gp.subarray(0, n * 3), 3)), new THREE.PointsMaterial({ size: 0.2, color: 0x8ff5e0, map: glowTex, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    scene.add(worms);
    updaters.push((dt, t) => {
      const now = Date.now(), D = echo.door;
      for (const c of echo.crystals) { const on = c.until > now ? 1 : 0; c.glow = lerp(c.glow, on, 1 - Math.exp(-dt * 4)); if (c.group) { c.group.traverse((o) => { if (o.isMesh && /^k_crystal/.test(o.material.name)) o.material.emissiveIntensity = 1.0 + c.glow * (3.2 + Math.sin(t * 9 + c.i) * 0.8); }); c.group.scale.setScalar(2.3 * (1 + c.glow * 0.05 * Math.sin(t * 11))); } if (D.rings[c.i]) D.rings[c.i].emissiveIntensity = (D.open ? 1 : c.glow) * 2.4; }
      if (D.group) { D.drop = lerp(D.drop, D.open ? 1 : 0, 1 - Math.exp(-dt * 0.9)); D.group.position.y = D.y0 - D.drop * 6; D.group.rotation.z = D.drop * 1.4; }
    });
    updaters.push((dt, t) => { worms.visible = caveK > 0.02; worms.material.opacity = (0.7 + 0.25 * Math.sin(t * 1.3)) * Math.min(1, caveK * 2); });
    // In the cave the day does not reach: the light is turned almost out and the distance is black.
    const black = new THREE.Color(0x05060a);
    skyHooks.push((k) => {
      lastSky = k; if (murkK > 0.001) scene.fog.density = lerp(scene.fog.density, Math.max(scene.fog.density, 0.036), murkK);
      if (caveK <= 0.001) { sky.visible = true; return; }
      hemi.intensity *= lerp(1, 0.13, caveK); moonLight.intensity *= lerp(1, 0.04, caveK); fill.intensity *= lerp(1, 0.1, caveK);
      scene.fog.color.lerp(black, caveK); scene.background.lerp(black, caveK); scene.fog.density = lerp(scene.fog.density, 0.055, caveK);
      sky.visible = caveK < 0.5;
    });
  }
  // The lighthouse on Lantern Point: a broken tower when the first visitors arrive. Its top (the gallery, the lamp
  // room and the roof) is a separate piece, kept out of sight until it has been rebuilt. The tower is the one thing
  // on the island that shows through the mist from far away, so that there is always something to walk towards.
  const lighthouse = { group: null, parts: [], stage: 0, door: { x: LIGHTHOUSE.x + 4.6, z: LIGHTHOUSE.z }, galleryY: LIGHTHOUSE.y - 0.1 + 17.5 };
  if (FAR) {
    colliders.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 3.5 });
    loadProps().then((make) => {
      const m = make && make('lighthouse', 'lighthouse_s'); if (!m) return;
      // The four things that were lost, each put back when enough has been carried up: the wall and gallery, the
      // rail and frame, the glass and roof, and the lamp.
      for (let k = 1; k <= 4; k++) { const part = make('lighthouse_s' + k, 'lighthouse_s2_frame'); if (!part) continue; part.userData.stage = k; part.visible = k <= lighthouse.stage; m.add(part); lighthouse.parts[k] = part; }
      const frame = make('lighthouse_s2_frame'); if (frame) { frame.userData.stage = 2; frame.visible = lighthouse.stage >= 2; m.add(frame); lighthouse.frame = frame; }
      m.traverse((o) => { if (o.isMesh && o.material.name === 'lh_glass') { o.material.transparent = true; o.material.opacity = 0.45; o.material.depthWrite = false; } });
      m.position.set(LIGHTHOUSE.x, LIGHTHOUSE.y - 0.1, LIGHTHOUSE.z);
      const mats = [];
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; o.material.fog = false; mats.push({ m: o.material, base: o.material.color.clone() }); } });
      scene.add(m); lighthouse.group = m;
      updaters.push(() => {
        const cam = opts.camera; if (!cam) return;
        const d = Math.hypot(cam.position.x - LIGHTHOUSE.x, cam.position.z - LIGHTHOUSE.z), dens = scene.fog.density * 0.5, f = (1 - Math.exp(-dens * dens * d * d)) * 0.88;
        for (const k of mats) k.m.color.copy(k.base).lerp(scene.fog.color, f);
      });
    });
  }
  // Left on Hush Island from before: the carved post by the dock, the lamp lens in the sand (and, once a visitor has
  // found it, by the woodpile), and the Keeper's sea chest.
  const relics = { lensSand: null, lensHome: null, found: false };
  if (!FAR) {
    colliders.push({ x: POST.x, z: POST.z, r: 0.3 }, { x: CHEST.x, z: CHEST.z, r: 0.55 });
    loadProps().then((make) => {
      if (!make || !make('carved_post')) return;
      const post = make('carved_post'); post.position.set(POST.x, terrainHeight(POST.x, POST.z) - 0.05, POST.z); post.rotation.y = Math.PI - 0.5; scene.add(post);
      const chest = make('sea_chest'); chest.position.set(CHEST.x, terrainHeight(CHEST.x, CHEST.z), CHEST.z); chest.rotation.y = 2.5; scene.add(chest);
      const glassy = (m) => m.traverse((o) => { if (o.isMesh && /^l_glass/.test(o.material.name)) { o.material.transparent = true; o.material.opacity = 0.8; o.material.roughness = 0.15; o.material.emissive.set(0x3f8f88); o.material.emissiveIntensity = 0.25; } });
      const a = make('lamp_lens'); glassy(a); a.position.set(LENS.x, terrainHeight(LENS.x, LENS.z) - 0.06, LENS.z); a.rotation.y = 1.1; scene.add(a); relics.lensSand = a;
      const b = make('lamp_lens', 'lens_sand'); glassy(b); b.position.set(WOODPILE.x + 1.25, terrainHeight(WOODPILE.x + 1.25, WOODPILE.z - 0.9) + 0.22, WOODPILE.z - 0.9); b.rotation.set(0.5, 2.2, 0); scene.add(b); relics.lensHome = b;
      a.visible = !relics.found; b.visible = relics.found;
    });
  }
  let cellAt = 0;
  let propAt = 0; const propBox = new THREE.Box3(), propSphere = new THREE.Sphere();
  if (FAR) updaters.push(() => {
    const cam = opts.camera; if (!cam) return;
    for (let k = 0; k < 90 && cells.length; k++) { const c = cells[cellAt++ % cells.length]; const cd = Math.hypot(c.x - cam.position.x, c.z - cam.position.z), close = !c.lod || cd < c.near * (0.55 + 0.45 * reach) + c.pad; c.inst.visible = close && cd < c.far * reach + c.pad; if (c.lod) c.lod.visible = !close && cd < c.far * reach + c.pad; }
    // Everything else that stands still and is small (rocks, mushrooms, lanterns, heaps): out of the picture when it
    // is too far off to matter. Done with layers, so that nothing else's say over what is visible is disturbed.
    const kids = scene.children;
    for (let k = 0; k < 220 && kids.length; k++) {
      const o = kids[propAt++ % kids.length]; let u = o.userData.cull;
      if (u === 0) continue;
      if (u === undefined) {
        if (!(o.isGroup || (o.isMesh && !o.isInstancedMesh)) || (o.position.x === 0 && o.position.z === 0)) { o.userData.cull = 0; continue; }
        const r = propBox.setFromObject(o).getBoundingSphere(propSphere).radius;
        if (!(r > 0) || r > 9) { o.userData.cull = 0; continue; }
        u = o.userData.cull = { x: o.position.x, z: o.position.z, far: r < 2.5 ? 100 : 170, off: false };
      }
      if (o.position.x !== u.x || o.position.z !== u.z) { if (u.off) o.traverse((c) => c.layers.set(0)); o.userData.cull = 0; continue; }      // it moves: not ours to hide
      const off = Math.hypot(u.x - cam.position.x, u.z - cam.position.z) > u.far * reach;
      if (off !== u.off) { u.off = off; o.traverse((c) => c.layers.set(off ? 1 : 0)); }
    }
  });
  loadProps().then((make) => {
    if (!make || !FAR) return;
    const at = (kind) => farTrees.map((tr, i) => ({ ...tr, i })).filter((tr) => tr.kind === kind);
    const place = (list, drop) => list.map((tr) => ({ x: tr.x, y: terrainHeight(tr.x, tr.z) - drop, z: tr.z, s: tr.s, ry: tr.ry }));
    // Birches, gold all year, wherever there is shelter; on high or open ground, trees the sea wind has bent, all
    // leaning the same way.
    const all = farTrees.map((tr, i) => ({ ...tr, i }));
    const inValley = (tr) => Math.hypot(tr.x - VALLEY.x, tr.z - VALLEY.z) < VALLEY.r;
    const open = (tr) => !inValley(tr) && (terrainHeight(tr.x, tr.z) > 9 || Math.hypot(tr.x - WOODS.x, tr.z - WOODS.z) > WOODS.r * 1.9);
    const birches = all.filter((tr) => !open(tr)), bent = all.filter(open);
    batch(make, 'birch_a', place(birches.filter((tr) => tr.i % 2 === 0), 0.1)); batch(make, 'birch_b', place(birches.filter((tr) => tr.i % 2 === 1), 0.1));
    batch(make, 'bent_tree', bent.map((tr) => ({ x: tr.x, y: terrainHeight(tr.x, tr.z) - 0.1, z: tr.z, s: tr.s * 1.25, ry: Math.sin(tr.i * 7.3) * 0.35 })));
    // More birches, close together, in Whisper Woods itself.
    const wr = mulberry32(606), wood = [];
    for (let k = 0; k < 20000 && wood.length < 330; k++) {
      const a = wr() * 6.283, d = Math.sqrt(wr()) * WOODS.r, x = WOODS.x + Math.cos(a) * d, z = WOODS.z + Math.sin(a) * d;
      if (pathDist(x, z) < 2.2 || terrainHeight(x, z) < 1 || Math.hypot(x - HOLLOW_TREE.x, z - HOLLOW_TREE.z) < 8 || wood.some((w) => Math.hypot(w.x - x, w.z - z) < 2.6) || farTrees.some((w) => Math.hypot(w.x - x, w.z - z) < 2.2)) continue;
      wood.push({ x, y: terrainHeight(x, z) - 0.1, z, s: 0.8 + wr() * 0.6, ry: wr() * 6 }); colliders.push({ x, z, r: 0.22 });
    }
    batch(make, 'birch_a', wood.filter((_, i) => i % 2 === 0)); batch(make, 'birch_b', wood.filter((_, i) => i % 2 === 1));
    // The old way: paving somebody laid long ago, slab after slab, from the jetty to every part of the island.
    const sr = mulberry32(88), slabs = [];
    for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(-(bz - az), bx - ax);
      for (let d = 0; d < len; d += 1.12) {
        if (sr() < 0.12) continue;      // some are missing
        const k = d / len, off = (sr() - 0.5) * 0.5, x = ax + (bx - ax) * k - Math.sin(-ang) * off * 0, z = az + (bz - az) * k + off;
        if (Math.hypot(x, z) < 5.6 || terrainHeight(x, z) < 0.4) continue;
        slabs.push({ x, y: terrainHeight(x, z) + 0.01, z, s: 0.95 + sr() * 0.35, ry: ang + (sr() - 0.5) * 0.5, n: Math.floor(sr() * 3) });
      }
    }
    for (let n = 0; n < 3; n++) batch(make, 'slab_' + n, slabs.filter((sl) => sl.n === n));
    // Bracken and heather instead of grass and flowers.
    const fr = mulberry32(909), ferns = [], heath = [];
    for (let k = 0; k < 160000 && (ferns.length < 2600 || heath.length < 4200); k++) {
      const a = fr() * 6.283, r = Math.sqrt(fr()) * shoreRadius(a) * 0.98, x = Math.cos(a) * r, z = Math.sin(a) * r, h = terrainHeight(x, z);
      if (h < 0.8 || Math.hypot(x, z) < 11.5 || pathDist(x, z) < 1.7 || (x > 8 && Math.abs(z) < 5)) continue;
      const hea = noise2(x * 0.12 - 7, z * 0.12 + 4);
      if (hea > 0.2 && heath.length < 4200) heath.push({ x, y: h - 0.04, z, s: 0.8 + fr() * 0.9, ry: fr() * 6 });
      else if (hea < 0.12 && ferns.length < 2600 && fr() < 0.6) { const g = fr(); ferns.push({ x, y: h - 0.03, z, s: 0.4 + fr() * 0.45, ry: fr() * 6, tint: [0.62 + g * 0.4, 0.95 + g * 0.1, 0.7 + g * 0.3] }); }
    }
    const fb = batch(make, 'bracken', ferns); if (fb) fb.receiveShadow = false;
    batch(make, 'heather', heath);
    // Rock standing in the sea round the island.
    const sea = [['sea_stack_0', -0.75, 12, 1], ['sea_stack_1', 0.95, 14, 1.1], ['sea_arch', 1.75, 26, 1.2], ['sea_stack_0', 3.05, 24, 1.6], ['sea_stack_1', -3.0, 18, 1.5], ['sea_arch', -2.45, 30, 1.4], ['sea_stack_1', -1.9, 16, 1.3], ['sea_stack_0', -1.45, 22, 1.4], ['sea_stack_0', 2.7, 20, 1.2], ['sea_stack_1', 1.35, 18, 1.0], ['sea_stack_0', -2.2, 40, 1.8], ['sea_stack_1', 2.3, 34, 1.3]];
    for (const [name, a, off, sc] of sea) {
      const r0 = shoreRadius(a) + off, x = Math.cos(a) * r0, z = Math.sin(a) * r0, ry = a * 3.1;
      const m = make(name); if (!m) continue;
      m.position.set(x, -0.3, z); m.rotation.y = ry; m.scale.setScalar(sc); m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noShadow = true; } });
      scene.add(m);
    }
  });
  loadProps().then((make) => {
    if (!make || !make('pine_a') || FAR) return;
    treeList.forEach((tr, i) => {
      const m = make((tr.kind === 'pine' ? 'pine_' : 'leafy_') + (i % 2 ? 'b' : 'a'));
      // Each tree has its own materials, because each fades by itself when it comes between you and the camera.
      const own = new Map();
      m.traverse((o) => { if (o.isMesh) { if (!own.has(o.material)) own.set(o.material, o.material.clone()); o.material = own.get(o.material); } });
      m.scale.setScalar(tr.s);
      while (tr.g.children.length) tr.g.remove(tr.g.children[0]);
      tr.g.add(m);
      tr.canopy.mats = [...own.values()];
      tr.canopy.fade = 1;
    });
    for (const p of palmList) {
      while (p.g.children.length) p.g.remove(p.g.children[0]);
      const trunk = make('palm', 'palm_crown'); trunk.scale.setScalar(p.s); p.g.add(trunk);
      const crown = new THREE.Group(); crown.position.set(-1.45 * p.s, 4.55 * p.s, 0);
      const fronds = make('palm_crown'); fronds.scale.setScalar(p.s);
      fronds.traverse((o) => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
      crown.add(fronds); p.g.add(crown);
      p.top[0] = crown;
    }
  });
  updaters.push((dt, t) => {
    for (const [crown, ph] of palmTops) {
      crown.rotation.z = Math.sin(t * 0.7 + ph) * 0.05;
      crown.rotation.x = Math.cos(t * 0.5 + ph) * 0.04;
    }
  });

  // Rocks.
  {
    const mats = [std(0x7a7f8e), std(0x666b7a), std(0x8a8d98)];
    const rockList = [];
    let n = 0; tries = 0;
    while (n < (FAR ? 260 : 26) && tries++ < (FAR ? 30000 : 2000)) {
      const a = rng() * Math.PI * 2;
      const d = rng() < 0.55 ? 0.9 + rng() * 0.2 : 0.35 + rng() * 0.5;
      const r = d * shoreRadius(a);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (keepClear(x, z) || (x > 22 && Math.abs(z) < 4)) continue;
      const s = rand(0.3, 1.0) * (d > 0.9 ? 1.2 : 1);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mats[n % 3]);
      m.position.set(x, terrainHeight(x, z) + s * 0.25, z);
      m.scale.set(1, rand(0.55, 0.8), rand(0.8, 1.2));
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      if (!FAR) scene.add(m);
      rockList.push({ m, x, z, s, n, sy: m.scale.y, sz: m.scale.z, ry: m.rotation.y });
      if (s > 0.45) colliders.push({ x, z, r: s * 0.85 });
      n++;
    }
    loadProps().then((make) => {
      if (!make || !make('rock_0')) return;
      if (FAR) { for (let k = 0; k < 4; k++) batch(make, 'rock_' + k, rockList.filter((r) => r.n % 4 === k).map((r) => ({ x: r.x, y: terrainHeight(r.x, r.z) - r.s * 0.12, z: r.z, ry: r.ry * 2.1, sx: r.s, sy: r.s * (0.75 + r.sy * 0.5), sz: r.s * r.sz }))); return; }
      for (const r of rockList) {
        const k = make('rock_' + (r.n % 4));
        k.position.set(r.x, terrainHeight(r.x, r.z) - r.s * 0.12, r.z);
        k.scale.set(r.s, r.s * (0.75 + r.sy * 0.5), r.s * r.sz);
        k.rotation.y = r.ry * 2.1;
        scene.remove(r.m); scene.add(k);
      }
    });
  }

  // Grass tufts, as one instanced mesh.
  {
    const blade = new THREE.ConeGeometry(0.09, 0.3, 4);
    blade.scale(1, 1, 0.35);
    blade.translate(0, 0.15, 0);
    const COUNT = FAR ? 0 : 1100;
    const inst = new THREE.InstancedMesh(blade, std(0x5f9a5a, { emissive: 0x1c3a22, flatShading: false }), COUNT);
    const dummy = new THREE.Object3D();
    let n = 0; tries = 0;
    while (n < COUNT && tries++ < 20000) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (FAR ? shoreRadius(a) * 0.97 : 30);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 0.75 || Math.hypot(x, z) < 4.6 || pathAmount(x, z) > 0.35) continue;
      const clump = 1 + Math.floor(rng() * 3);
      for (let c = 0; c < clump && n < COUNT; c++) {
        dummy.position.set(x + rand(-0.12, 0.12), h - 0.03, z + rand(-0.12, 0.12));
        dummy.rotation.set(rand(-0.25, 0.25), rng() * 6, rand(-0.25, 0.25));
        dummy.scale.setScalar(rand(0.6, 1.3));
        dummy.updateMatrix();
        inst.setMatrixAt(n++, dummy.matrix);
      }
    }
    inst.count = n;
    inst.userData.noShadow = true;
    scene.add(inst);
    loadProps().then((make) => {
      const tuft = make && make('grass_tuft');
      if (!tuft) return;
      inst.geometry = tuft.children[0].geometry;
      inst.material.flatShading = true; inst.material.side = THREE.DoubleSide; inst.material.needsUpdate = true;
    });
  }

  // The paths themselves: modelled in Blender to lie on this ground (dirt with ragged edges, stepping stones).
  loadProps().then((make) => {
    const m = make && !FAR && make('paths');      // the far shore's paths are painted on, for now
    if (!m) return;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.userData.noShadow = true; if (/^path_(dirt|edge)/.test(o.material.name)) { o.material.polygonOffset = true; o.material.polygonOffsetFactor = -2; o.material.polygonOffsetUnits = -2; } } });
    scene.add(m);
  });

  // Flowers in the grass, pebbles and starfish along the shore: modelled once, scattered many times.
  loadProps().then((make) => {
    if (!make || !make('flower')) return;
    const r2 = mulberry32(4471), dummy = new THREE.Object3D(), col = new THREE.Color();
    const scatter = (name, spots, tintPart, tints) => {
      const parts = make(name).children;
      for (const part of parts) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, spots.length);
        if (part.material.name === tintPart) { part.material.color.set(0xffffff); }
        spots.forEach((sp, i) => {
          dummy.position.set(sp.x, sp.y, sp.z); dummy.rotation.set(sp.tx || 0, sp.ry, sp.tz || 0); dummy.scale.setScalar(sp.s); dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
          if (part.material.name === tintPart) inst.setColorAt(i, col.setHex(tints[sp.c % tints.length]));
        });
        part.material.side = THREE.DoubleSide;
        inst.userData.noShadow = true; inst.castShadow = false; inst.receiveShadow = false;
        scene.add(inst);
      }
    };
    const flowers = [];
    let tries2 = 0;
    while (flowers.length < (FAR ? 0 : 300) && tries2++ < (FAR ? 24000 : 6000)) {
      const a = r2() * Math.PI * 2, r = 6 + Math.sqrt(r2()) * (FAR ? shoreRadius(a) * 0.9 : 24), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) < 0.95 || pathAmount(x, z) > 0.2 || noise2(x * 0.16 + 40, z * 0.16 - 12) < 0.12) continue;      // in drifts, not everywhere
      const c = Math.floor(r2() * 4), n = 2 + Math.floor(r2() * 4);
      for (let k = 0; k < n; k++) { const fx = x + (r2() - 0.5) * 1.3, fz = z + (r2() - 0.5) * 1.3; flowers.push({ x: fx, y: terrainHeight(fx, fz) - 0.02, z: fz, ry: r2() * 6, tx: (r2() - 0.5) * 0.3, tz: (r2() - 0.5) * 0.3, s: 0.8 + r2() * 0.7, c }); }
    }
    if (flowers.length) scatter('flower', flowers, 'flower_petal', [0xffffff, 0xffd54a, 0xf59ac0, 0xb9a2f2]);
    const pebbles = [], stars = [];
    tries2 = 0;
    while (pebbles.length < (FAR ? 620 : 260) && tries2++ < (FAR ? 14000 : 5000)) {
      const a = r2() * Math.PI * 2, r = shoreRadius(a) * (0.9 + r2() * 0.12), x = Math.cos(a) * r, z = Math.sin(a) * r, h = terrainHeight(x, z);
      if (h < -0.12 || h > 0.42 || (x > 28 && Math.abs(z) < 2)) continue;
      pebbles.push({ x, y: h, z, ry: r2() * 6, s: 0.5 + r2() * r2() * 1.6, c: Math.floor(r2() * 5) });
      if (stars.length < 10 && h > 0 && h < 0.16 && r2() < 0.1) stars.push({ x: x + 0.4, y: terrainHeight(x + 0.4, z) + 0.01, z, ry: r2() * 6, s: 0.8 + r2() * 0.5, c: Math.floor(r2() * 3) });
    }
    scatter('pebble', pebbles, 'pebble', [0x8d8f99, 0xa7a59c, 0x74778a, 0xc2b9a3, 0x9c8f80]);
    if (stars.length) scatter('starfish', stars, 'starfish_a', [0xee8a4e, 0xe26a6a, 0xf0b25a]);
  });

  // Foam where the sea meets the sand: a thin white line that breathes in and out with the swell.
  {
    const SEG = 220, shore = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      let lo = shoreRadius(a) * 0.7, hi = shoreRadius(a) * 1.4;
      for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (terrainHeight(Math.cos(a) * mid, Math.sin(a) * mid) > 0.0) lo = mid; else hi = mid; }
      shore.push(lo);
    }
    const geo = new THREE.BufferGeometry(), pos = new Float32Array((SEG + 1) * 2 * 3), idx = [];
    for (let i = 0; i < SEG; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const foam = new THREE.Mesh(geo, foamMat); foam.userData.noShadow = true; foam.renderOrder = 2; foam.frustumCulled = false; scene.add(foam);
    skyHooks.push((k) => { foamMat.color.setHex(0xffffff).lerp(new THREE.Color(k.hor), 0.25 * k.dark).multiplyScalar(1 - 0.55 * k.dark); });
    updaters.push((dt, t) => {
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2, wash = 0.28 + 0.26 * Math.sin(t * 0.55 + a * 5) + 0.1 * Math.sin(t * 0.9 + a * 13);
        const r0 = shore[i] + wash, w = 0.09 + 0.09 * (0.5 + 0.5 * Math.sin(t * 0.55 + a * 5 + 1.2)), c = Math.cos(a), sn = Math.sin(a);
        pos[i * 6] = c * (r0 - w); pos[i * 6 + 1] = 0.045; pos[i * 6 + 2] = sn * (r0 - w);
        pos[i * 6 + 3] = c * (r0 + w); pos[i * 6 + 4] = 0.045; pos[i * 6 + 5] = sn * (r0 + w);
      }
      geo.attributes.position.needsUpdate = true;
      foamMat.opacity = 0.34 + 0.1 * Math.sin(t * 0.55);
    });
  }

  // Small glowing mushrooms near the trees.
  {
    const capMat = new THREE.MeshBasicMaterial({ color: 0x8ff0e0, toneMapped: false });
    const stemMat = std(0xdfe9e6);
    const shroomList = [];
    for (let i = 0; i < (FAR ? 70 : 26); i++) {
      const [px, pz] = placed[Math.floor(rng() * placed.length)];
      const x = px + rand(-1.2, 1.2), z = pz + rand(-1.2, 1.2);
      const h = terrainHeight(x, z);
      if (h < 0.7) continue;
      const s = rand(0.6, 1.2);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.03 * s, 0.14 * s, 5), stemMat);
      stem.position.set(x, h + 0.06 * s, z);
      scene.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.set(x, h + 0.12 * s, z);
      scene.add(cap);
      shroomList.push({ stem, cap, x, h, z, s, ry: i * 2.3 });
    }
    loadProps().then((make) => {
      if (!make || !make('mushrooms')) return;
      for (const m of shroomList) {
        const k = make('mushrooms'); k.position.set(m.x, m.h - 0.01, m.z); k.scale.setScalar(m.s * 1.1); k.rotation.y = m.ry;
        k.traverse((o) => { o.userData.noShadow = true; if (o.isMesh) { o.castShadow = false; if (o.material.name === 'shroom_glow') { o.material.emissiveIntensity = 2.2; o.material.toneMapped = false; } } });
        scene.remove(m.stem); scene.remove(m.cap); scene.add(k);
      }
    });
  }

  // Fireflies.
  {
    const COUNT = 46;
    const pos = new Float32Array(COUNT * 3);
    const homes = [];
    for (let i = 0; i < COUNT; i++) {
      let x, z, h, guard = 0;
      do {
        const a = rng() * Math.PI * 2, r = 7 + rng() * 19;
        x = Math.cos(a) * r; z = Math.sin(a) * r; h = terrainHeight(x, z);
      } while (h < 0.6 && guard++ < 50);
      homes.push([x, h, z, rng() * 6, 0.3 + rng() * 0.5]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.16, color: 0xd9ff8a, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    let flyShow = 1;
    skyHooks.push((k) => { flyShow = k.dark; pts.visible = k.dark > 0.05; });
    scene.add(pts);
    updaters.push((dt, t) => {
      for (let i = 0; i < COUNT; i++) {
        const [x, h, z, ph, sp] = homes[i];
        pos[i * 3] = x + Math.sin(t * sp + ph) * 1.6 + Math.sin(t * sp * 2.3 + ph) * 0.4;
        pos[i * 3 + 1] = h + 0.9 + Math.sin(t * sp * 1.7 + ph * 2) * 0.5;
        pos[i * 3 + 2] = z + Math.cos(t * sp * 0.8 + ph) * 1.6;
      }
      g.attributes.position.needsUpdate = true;
      m.opacity = (0.75 + 0.25 * Math.sin(t * 2.2)) * flyShow;
    });
  }

  // Blanket on the hilltop.
  {
    const y = terrainHeight(HILL.x, HILL.z);
    const g = new THREE.Group();
    g.position.set(HILL.x, y + 0.03, HILL.z);
    g.rotation.y = 0.4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.9), std(0xb5503f));
    g.add(b);
    for (const z of [-0.6, 0, 0.6]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.055, 0.14), std(0xf0dcb4));
      s.position.z = z;
      g.add(s);
    }
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.42), std(0xf0dcb4));
    pillow.position.set(-0.85, 0.1, 0.3);
    g.add(pillow);
    scene.add(g);
    loadProps().then((make) => { const m = make && make('blanket'); if (!m) return; while (g.children.length) g.remove(g.children[0]); m.position.y = -0.02; g.add(m); });
  }

  // Signpost by the beach.
  {
    const y = terrainHeight(SIGN.x, SIGN.z);
    const g = new THREE.Group();
    g.position.set(SIGN.x, y, SIGN.z);
    g.rotation.y = 0.3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 6), std(0x5a4330));
    post.position.y = 0.9;
    g.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.64, 0.07),
      [std(0x6a4c32), std(0x6a4c32), std(0x6a4c32), std(0x6a4c32),
        new THREE.MeshStandardMaterial({ map: FAR ? makeSignTexture('The Landing', 'the camp is this way') : makeSignTexture('Hush Island', 'the fire is this way'), roughness: 1 }), std(0x6a4c32)],
    );
    board.position.y = 1.5;
    board.position.z = 0.11;
    board.rotation.z = -0.03;
    g.add(board);
    scene.add(g);
    loadProps().then((make) => {
      const m = make && make('signpost');
      if (!m) return;
      g.remove(post); g.remove(board);
      const words = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), board.material[4]);
      words.position.set(0, 1.5, 0.148);
      g.add(m, words);
    });
    colliders.push({ x: SIGN.x, z: SIGN.z, r: 0.22 });
  }

  // Driftwood wall: visitors carve short messages into it.
  const board = makeCarvingBoard();
  {
    const y = terrainHeight(WALL.x, WALL.z);
    const g = new THREE.Group();
    g.position.set(WALL.x, y - 0.08, WALL.z);
    g.rotation.y = WALL.yaw;
    const woods = [std(0x8d7c68, { emissive: 0x1a140e }), std(0x7d6d5a, { emissive: 0x1a140e }), std(0x9a8a74, { emissive: 0x1a140e })];
    const wallRough = [];
    const widths = [0.52, 0.6, 0.5, 0.58, 0.54];
    let x = -widths.reduce((a, b) => a + b, 0) / 2;
    widths.forEach((w, i) => {
      const h = 1.75 + [0.1, 0.32, 0.0, 0.24, 0.12][i];
      const plank = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, h, 0.1), woods[i % 3]);
      plank.position.set(x + w / 2, h / 2, [0, -0.012, 0.008, -0.006, 0.004][i]);
      plank.rotation.z = [0.012, -0.02, 0.008, 0.016, -0.012][i];
      g.add(plank); wallRough.push(plank);
      x += w;
    });
    for (const px of [-1.05, 1.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), std(0x5a4330));
      post.position.set(px, 0.75, -0.13);
      post.rotation.x = -0.2;
      g.add(post); wallRough.push(post);
    }
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(2.62, 1.43),
      new THREE.MeshStandardMaterial({ map: board.tex, emissiveMap: board.tex, emissive: 0xffffff, emissiveIntensity: 0.55, transparent: true, roughness: 1, depthWrite: false }),
    );
    face.position.set(0, 1.0, 0.062);
    face.userData.noShadow = true;
    g.add(face);
    scene.add(g);
    loadProps().then((make) => { const m = make && make('wall'); if (!m) return; for (const r of wallRough) g.remove(r); g.add(m); });
    const tx = Math.cos(WALL.yaw), tz = -Math.sin(WALL.yaw);
    for (const o of [-0.9, 0, 0.9]) colliders.push({ x: WALL.x + tx * o, z: WALL.z + tz * o, r: 0.42 });
  }

  // Bottles: a crate of empties on the beach, one that washes up, one in flight.
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fe0cf, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x2a6a60, emissiveIntensity: 0.6 });
  // Every bottle starts as a few cylinders and becomes the modelled one when that arrives.
  const bottles = [];
  let bottleModel = null;
  loadProps().then((make) => {
    if (!make || !make('bottle')) return;
    bottleModel = (b) => {
      const m = make('bottle');
      m.scale.setScalar(0.74);
      m.traverse((o) => { o.userData.noShadow = true; if (o.isMesh) { o.castShadow = false; if (o.material.name === 'm_glass') o.material = glass; } });
      while (b.children.length) b.remove(b.children[0]);
      b.add(m);
    };
    bottles.forEach(bottleModel);
  });
  function bottleMesh() {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10), glass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.1, 8), glass);
    neck.position.y = 0.15;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.045, 6), std(0xb58a5a));
    cork.position.y = 0.215;
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), new THREE.MeshBasicMaterial({ color: 0xf6ead2, toneMapped: false }));
    b.add(paper, body, neck, cork);
    b.traverse((o) => { o.userData.noShadow = true; });
    bottles.push(b);
    if (bottleModel) bottleModel(b);
    return b;
  }
  {
    const y = terrainHeight(CRATE.x, CRATE.z);
    const g = new THREE.Group();
    g.position.set(CRATE.x, y - 0.03, CRATE.z);
    g.rotation.y = 0.5;
    const wood = std(0x8a6a48, { emissive: 0x1c130c }), dark = std(0x6a4c32);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.38, 0.6), wood);
    box.position.y = 0.19;
    g.add(box);
    const crateRough = [box];
    for (const yy of [0.1, 0.28]) { const slat = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.05, 0.63), dark); slat.position.y = yy; g.add(slat); crateRough.push(slat); }
    for (const [bx, bz] of [[-0.26, -0.13], [0, -0.14], [0.26, -0.12], [-0.13, 0.13], [0.14, 0.14]]) {
      const b = bottleMesh();
      b.position.set(bx, 0.3, bz);
      b.rotation.set((rng() - 0.5) * 0.2, rng() * 6, (rng() - 0.5) * 0.2);
      g.add(b);
    }
    scene.add(g);
    colliders.push({ x: CRATE.x, z: CRATE.z, r: 0.55 });
    loadProps().then((make) => { const m = make && make('crate'); if (!m) return; for (const r of crateRough) g.remove(r); g.add(m); });
  }
  const washed = bottleMesh();
  washed.visible = false;
  washed.rotation.z = 1.25;
  scene.add(washed);
  const washedGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fe0cf, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  washedGlow.visible = false;
  scene.add(washedGlow);
  updaters.push((dt, t) => {
    if (!washed.visible) return;
    const k = 0.5 + 0.5 * Math.sin(t * 2.2);
    washedGlow.scale.setScalar(0.7 + 0.5 * k);
    washedGlow.material.opacity = 0.35 + 0.45 * k;
  });
  const flying = bottleMesh();
  flying.visible = false;
  scene.add(flying);
  let flight = null;
  updaters.push((dt) => {
    if (!flight) return;
    flight.k += dt / 1.0;
    const k = Math.min(1, flight.k);
    flying.position.set(lerp(flight.x, flight.tx, k), lerp(flight.y, 0.05, k) + Math.sin(k * Math.PI) * 2.2, lerp(flight.z, flight.tz, k));
    flying.rotation.x += dt * 10; flying.rotation.z += dt * 4;
    if (k >= 1) {
      flying.visible = false;
      const f = flight; flight = null;
      for (let i = 0; i < 3; i++) setTimeout(() => api.ripple(f.tx, f.tz), i * 260);
      if (f.done) f.done();
    }
  });

  // Marker shown where a tap-to-move is heading.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc978, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  let markerLife = 0;
  updaters.push((dt, t) => {
    markerLife = Math.max(0, markerLife - dt);
    marker.material.opacity = Math.min(0.9, markerLife);
    marker.scale.setScalar(1 + 0.15 * Math.sin(t * 6));
  });

  scene.traverse((o) => {
    if (o.isMesh && !o.userData.noShadow && o.material && !Array.isArray(o.material) && o.material.isMeshStandardMaterial) o.castShadow = true;
  });

  // ---------- the Landing: the camp on the far shore ----------
  // Tents round the fire, supplies, lanterns along the way to the jetty, the board where the map is kept, and the
  // Mapmaker who keeps it. All modelled in Blender; nothing stands here until the models arrive.
  const mapmaker = { x: MAPMAKER.x, z: MAPMAKER.z, group: null, home: 0 };
  let redrawMap = () => {};
  if (FAR) {
    for (const p of LANDING) if (p.r) colliders.push({ x: p.x, z: p.z, r: p.r });
    for (const sx of [-1.25, 1.25]) colliders.push({ x: MAP_BOARD.x + Math.cos(MAP_BOARD.ry) * sx, z: MAP_BOARD.z - Math.sin(MAP_BOARD.ry) * sx, r: 0.3 });
    colliders.push({ x: MAPMAKER.x, z: MAPMAKER.z, r: 0.95 });
    // The map: the coast as far as anyone has drawn it. Only the Landing is filled in so far.
    redrawMap = (st) => drawMap(st); mapmaker.canvas = () => mapCanvas;
    const mapCanvas = document.createElement('canvas'); mapCanvas.width = 1024; mapCanvas.height = 666;
    let mapTex = null;
    // st: { firsts, walked, cards, named, namer }. What anyone has found is on the map; what you have walked yourself is in dark ink.
    let mapState = {};
    const drawMap = (st = mapState) => {
      mapState = st;
      const c = mapCanvas, firsts = st.firsts || {}, walked = st.walked || new Set(), seen = st.cards || new Set();
      const g = c.getContext('2d');
      g.fillStyle = '#f1e3c2'; g.fillRect(0, 0, c.width, c.height);
      const r0 = mulberry32(77);
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(150,120,70,${0.02 + r0() * 0.05})`; g.beginPath(); g.arc(r0() * c.width, r0() * c.height, 4 + r0() * 30, 0, 7); g.fill(); }
      const pts = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < 180; i++) { const a = i / 180 * Math.PI * 2, r = shoreRadius(a), x = Math.cos(a) * r, z = Math.sin(a) * r; pts.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const k = Math.min((c.width - 150) / (x1 - x0), (c.height - 150) / (z1 - z0)), ox = (c.width - (x1 - x0) * k) / 2 - x0 * k, oz = (c.height - (z1 - z0) * k) / 2 - z0 * k + 14;
      const X = (x) => x * k + ox, Z = (z) => z * k + oz;
      g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath();
      g.fillStyle = 'rgba(196,170,118,0.45)'; g.fill();
      g.strokeStyle = '#5b4630'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
      g.strokeStyle = 'rgba(91,70,48,0.35)'; g.lineWidth = 1.5;
      for (const grow of [9, 18]) { g.beginPath(); pts.forEach(([x, z], i) => { const m = 1 + grow / (Math.hypot(x, z) * k + 1); (i ? g.lineTo(X(x * m), Z(z * m)) : g.moveTo(X(x * m), Z(z * m))); }); g.closePath(); g.stroke(); }
      // The one way that is known: from the jetty to the camp. The rest is guessed at, in dots.
      g.setLineDash([3, 9]); g.lineCap = 'round'; g.strokeStyle = 'rgba(91,70,48,0.55)'; g.lineWidth = 3;
      for (const path of PATHS.slice(1)) { g.beginPath(); path.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
      g.setLineDash([]); g.strokeStyle = '#8a4a2c'; g.lineWidth = 4; g.beginPath(); PATHS[0].forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const a of AREAS) {
        if (a.id === 'landing') {
          g.fillStyle = '#c9502f'; g.beginPath(); g.arc(X(0), Z(0), 9, 0, 7); g.fill();
          g.fillStyle = '#3d2e1f'; g.font = 'italic 600 30px Georgia, serif'; g.fillText('The Landing', X(0) - 6, Z(0) + 34);
        } else if (firsts['a-' + a.id] || walked.has(a.id)) {
          const f = firsts['a-' + a.id], mine = walked.has(a.id);
          const [lx, lz] = { meadow: [24, -34], point: [-34, 36], woods: [-6, -26], farbeach: [10, -6] }[a.id] || [0, 0], ax = X(a.x) + lx, az = Z(a.z) + lz;      // nudged so close neighbours do not write over each other
          g.fillStyle = mine ? '#3d2e1f' : 'rgba(61,46,31,0.5)'; g.font = 'italic 600 27px Georgia, serif'; g.fillText(a.name, ax, az - 8);
          if (f) { g.fillStyle = mine ? 'rgba(138,74,44,0.95)' : 'rgba(138,74,44,0.6)'; g.font = 'italic 18px Georgia, serif'; g.fillText('first walked by ' + f.name, ax, az + 17); }
        } else { g.fillStyle = 'rgba(91,70,48,0.6)'; g.font = 'italic 44px Georgia, serif'; g.fillText('?', X(a.x), Z(a.z)); }
      }
      // A small cross for every sight somebody has found.
      g.lineWidth = 3; g.lineCap = 'round';
      for (const id in SIGHT_AT) {
        if (!firsts['s-' + id] && !seen.has(id)) continue;
        const sx = X(SIGHT_AT[id][0]), sz = Z(SIGHT_AT[id][1]);
        g.strokeStyle = seen.has(id) ? '#b23a1c' : 'rgba(178,58,28,0.5)'; g.beginPath(); g.moveTo(sx - 6, sz - 6); g.lineTo(sx + 6, sz + 6); g.moveTo(sx + 6, sz - 6); g.lineTo(sx - 6, sz + 6); g.stroke();
      }
      // Who lives where (once the Mapmaker has heard from all of them), and the hidden places a visitor has been told of or has found.
      if (st.pins) {
        g.textAlign = 'center';
        for (const p of st.pins.spots) { const sx = X(p.x), sz = Z(p.z); g.strokeStyle = p.found ? '#2f6f72' : 'rgba(47,111,114,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx, sz - 8); g.lineTo(sx + 7, sz); g.lineTo(sx, sz + 8); g.lineTo(sx - 7, sz); g.closePath(); g.stroke(); if (p.found) { g.fillStyle = '#2f6f72'; g.font = 'italic 15px Georgia, serif'; g.fillText(p.name, sx, sz + 24); } }
        for (const q of st.pins.peers || []) { const sx = X(q.x), sz = Z(q.z); g.fillStyle = '#2b5fa8'; g.beginPath(); g.arc(sx, sz, 7, 0, 7); g.fill(); g.strokeStyle = '#f4ead2'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#2b5fa8'; g.font = '600 17px Georgia, serif'; g.fillText(q.name, sx, sz - 13); }
        if (st.pins.me) { const sx = X(st.pins.me.x), sz = Z(st.pins.me.z); g.strokeStyle = '#3d2e1f'; g.lineWidth = 3; g.beginPath(); g.arc(sx, sz, 9, 0, 7); g.stroke(); g.fillStyle = '#3d2e1f'; g.font = 'italic 15px Georgia, serif'; g.fillText('you', sx, sz + 24); }
        for (const f of st.pins.folk) { const sx = X(f.x), sz = Z(f.z); g.fillStyle = '#8a4a2c'; g.beginPath(); g.arc(sx, sz, 5, 0, 7); g.fill(); g.font = 'italic 600 16px Georgia, serif'; g.fillText(f.name, sx, sz - 10); }
      }
      g.fillStyle = '#3d2e1f'; g.font = 'italic 600 40px Georgia, serif'; g.textAlign = 'left'; g.fillText(st.named ? 'Lantern Rock' : 'The far shore', 38, 50);
      g.font = 'italic 22px Georgia, serif'; g.fillStyle = 'rgba(61,46,31,0.75)'; g.fillText(st.named && st.namer ? 'named again from the summit by ' + st.namer : 'as far as anyone has walked it', 40, 86);
      g.font = 'italic 18px Georgia, serif'; g.fillText('Dark ink: where you have walked.   \u00d7  a sight somebody has found.', 40, 644);
      // north is up the page (the island's -z)
      g.strokeStyle = '#3d2e1f'; g.lineWidth = 3; g.beginPath(); g.moveTo(950, 110); g.lineTo(950, 44); g.moveTo(938, 62); g.lineTo(950, 44); g.lineTo(962, 62); g.stroke();
      g.textAlign = 'center'; g.font = 'italic 600 24px Georgia, serif'; g.fillStyle = '#3d2e1f'; g.fillText('N', 950, 128);
      if (!mapTex) { mapTex = new THREE.CanvasTexture(c); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 4; }
      mapTex.needsUpdate = true; return mapTex;
    };
    loadProps().then((make) => {
      if (!make || !make('tent')) return;
      for (const p of LANDING) {
        const m = make(p.kind); if (!m) continue;
        m.position.set(p.x, terrainHeight(p.x, p.z) - 0.02, p.z); m.rotation.y = p.ry;
        if (p.tilt) m.rotation.z = p.tilt;
        if (p.kind === 'map_board') {
          const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.3), new THREE.MeshStandardMaterial({ map: drawMap(), roughness: 1, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }));
          sheet.position.set(0, 1.5, 0.047); m.add(sheet);
        }
        if (p.kind === 'lantern_pole') m.traverse((o) => { if (o.isMesh && o.material.name === 'c_lantern_glow') { o.material.emissive.set(0xffb45a); o.material.emissiveIntensity = 2.2; o.material.color.set(0xffd9a0); o.castShadow = false; } });
        scene.add(m);
      }
      const tPup = make.puppet ? make.puppet('mapmaker', -Math.PI / 2) : null, t = tPup ? tPup.group : make('mapmaker'); mapmaker.pup = tPup; if (tPup) tPup.mesh.castShadow = false;
      if (t) { mapmaker.home = Math.atan2(-(2 - MAPMAKER.z), 16 - MAPMAKER.x); t.position.set(MAPMAKER.x, terrainHeight(MAPMAKER.x, MAPMAKER.z), MAPMAKER.z); t.rotation.y = mapmaker.home; t.scale.setScalar(1.25); scene.add(t); mapmaker.group = t; }
    });
  }

  const api = {
    setMap: (st) => redrawMap(st), setStarRush(on) { starRush = !!on; },
    mapmaker, lighthouse, hermit, paintings, echo, stones, heron, cottage, flats,
    ringBell() { flats.bell.swing = 0.5; },
    sources, setLightStage(n) { lighthouse.stage = n; lighthouse.parts.forEach((part, k) => { if (part) part.visible = k <= n; }); if (lighthouse.frame) lighthouse.frame.visible = n >= 2; },
    ways, setWayLit(id, lit) { const w = ways.find((q) => q.id === id); if (w) { w.lit = lit; setWay(w); } }, setStock,
    chests, pickups,
    setChestOpen(id, open, now) { const c = chests.find((q) => q.id === id); if (c) { c.open = open; if (now && c.lid) c.lid.rotation.x = open ? -1.9 : 0; } },
    setPickup(i, there) { const pk = pickups[i]; if (pk) { pk.there = there; if (pk.group) pk.group.visible = there; } },
    logPages, setLogPage(i, there) { const pg = logPages[i]; if (pg) { pg.there = there; if (pg.group) pg.group.visible = there; } },
    setCairn(n) { hidden.laid = Math.min(60, n); if (hidden.cairnStones) hidden.cairnStones.count = hidden.laid; },
    ringStone(i, ms = 900) { if (stones[i]) stones[i].until = Date.now() + ms; },
    ringCrystal(i, ms) { echo.crystals[i].until = Date.now() + ms; },
    setEchoOpen(open) { echo.door.open = open; if (echo.door.solid) echo.door.solid.r = open ? 0 : 2.6; },
    setMurk(k) { if (Math.abs(k - murkK) < 0.004) return; murkK = k; if (lastSky) for (const f of skyHooks) f(lastSky); },
    setGalleryView(on) { for (const part of [lighthouse.frame, lighthouse.parts[3], lighthouse.parts[4]]) if (part) part.visible = !on && part.userData.stage <= lighthouse.stage; },
    setCave(k) { if (Math.abs(k - caveK) < 0.004) return; caveK = k; if (lastSky) for (const f of skyHooks) f(lastSky); },
    setLens(found) { relics.found = found; if (relics.lensSand) { relics.lensSand.visible = !found; relics.lensHome.visible = found; } },
    fireY,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    setFuel(v) { fuel = v; },
    setParty(v) { party = v; },
    setGathering(v) { gathering = !!v; },
    get heat() { return heat; },
    flareUp() { flare = 1; for (let i = 0; i < EMBERS; i++) if (rng() < 0.5) emberData[i].life = 99; },
    tossLog(x, y, z, done) { toss = { x, y, z, k: 0, done }; tossMesh.position.set(x, y, z); tossMesh.visible = true; },
    setShadows(on) { fireLight.castShadow = on; },
    setReach(k, cover = 1) { reach = k; for (const c of cells) if (c.thin) c.inst.count = Math.max(1, Math.round(c.full * cover)); },
    get trees() { return canopies.map((c) => ({ x: c.x, z: c.z, r: c.r, fade: c.fade })); },
    // What is underfoot at a point: 'water', 'sand', 'wood' or 'grass'.
    surface(x, z) {
      if (x >= DOCK.x0 && x <= DOCK.x1 && z >= DOCK.z0 && z <= DOCK.z1 && terrainHeight(x, z) < DOCK.y) return 'wood';
      if (onSlip(x, z)) return 'wood';
      const h = terrainHeight(x, z);
      return h < 0.04 ? 'water' : h < 0.55 ? 'sand' : 'grass';
    },
    setCarvings(list) { board.draw(list); },
    // Show (or clear) the bottle on the beach. kind 'reply' glows amber, a stranger's note glows sea-green.
    setWashedBottle(spot, kind) {
      washed.visible = washedGlow.visible = !!spot;
      if (!spot) return;
      const y = terrainHeight(spot.x, spot.z);
      washed.position.set(spot.x, y + 0.08, spot.z);
      washed.rotation.y = spot.x * 1.7;
      washedGlow.position.set(spot.x, y + 0.2, spot.z);
      washedGlow.material.color.set(kind === 'reply' ? 0xffc978 : 0x8fe0cf);
    },
    throwBottle(x, y, z, yaw, done) {
      flight = { x, y, z, tx: x + Math.sin(yaw) * 9, tz: z + Math.cos(yaw) * 9, k: 0, done };
      flying.position.set(x, y, z);
      flying.visible = true;
    },
    footprint(x, z, yaw, left) {
      const side = left ? 0.1 : -0.1;
      const px = x + Math.cos(yaw) * side, pz = z - Math.sin(yaw) * side;
      const m = prints[printAt++ % prints.length];
      m.position.set(px, terrainHeight(px, pz) + 0.025, pz);
      m.rotation.y = yaw;
      m.userData.life = 0;
      m.visible = true;
    },
    ripple(x, z) {
      const m = rings[ringAt++ % rings.length];
      m.position.set(x, seaHeight(x, z, seaT) + 0.04, z);
      m.userData.life = 0;
      m.visible = true;
    },
    setStargaze(on) { stargazeTarget = on ? 1 : 0; },
    // Height of the sea's surface at a point, right now.
    seaY(x, z) { return seaHeight(x, z, seaT); },
    // Set the look of the hour (see clock.js).
    setSky(k) { for (const f of skyHooks) f(k); },
    showMarker(x, z) { marker.position.set(x, groundHeight(x, z) + 0.06, z); markerLife = 1.4; },
    hideMarker() { markerLife = Math.min(markerLife, 0.25); },
    moonDir: MOON_DIR,
    // Leaves that come between the camera and you turn see-through, so you never lose sight of yourself.
    fadeCanopies(cam, target, dt) {
      const ax = cam.x, ay = cam.y, az = cam.z, bx = target.x - ax, by = target.y - ay, bz = target.z - az;
      const len2 = bx * bx + bz * bz || 1e-6;
      for (const c of canopies) {
        const k = clamp(((c.x - ax) * bx + (c.z - az) * bz) / len2, 0, 1);
        const px = ax + bx * k, pz = az + bz * k, py = ay + by * k;
        const inWay = (Math.hypot(px - c.x, pz - c.z) < c.r * 1.05 && py < c.top + 0.3)
          || (Math.hypot(ax - c.x, az - c.z) < c.r + 1.4 && ay < c.top + 0.5);   // or the camera is brushing the leaves
        const goal = inWay ? 0.1 : 1;
        if (Math.abs(c.fade - goal) < 0.005) continue;
        c.fade = lerp(c.fade, goal, 1 - Math.exp(-dt * 7));
        if (Math.abs(c.fade - goal) < 0.005) c.fade = goal;
        for (const m of c.mats) {
          const see = c.fade < 1;
          if (m.transparent !== see) { m.transparent = see; m.needsUpdate = true; }   // the shader differs for see-through
          m.depthWrite = c.fade > 0.6;
          m.opacity = c.fade;
        }
      }
    },
  };
  return api;
}
