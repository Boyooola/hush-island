// Builds the island: sky, sea, land, fire, dock, trees and all small life.
import { timeNow } from './now.js';
import * as THREE from 'three';
import {
  mulberry32, clamp, lerp, smoothstep, noise2, terrainHeight, groundHeight, shoreRadius,
  FIRE, HILL, DOCK, WOODPILE, SIGN, WALL, CRATE, LOGS, colliders, onSlip, pathAmount, FAR, LANDING, MAPMAKER, MAP_BOARD, PATHS, AREAS } from './terrain.js';
import { makeGlowTexture, makeSkyLabel, makeSignTexture, makeCarvingBoard } from './labels.js';
import { loadProps } from './props.js';

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
      if (k >= 1) { life = -1; m.opacity = 0; next = t + 14 + rng() * 22; }
    });
  }

  // ---------- land ----------
  // The square of ground that is drawn: all of home, or (coarser, and off-centre) all of the far shore.
  const STEP = FAR ? 1.25 : 1, GX0 = FAR ? -125 : -66, GZ0 = FAR ? -85 : -66, NX = FAR ? 136 : 132, NZ = FAR ? 136 : 132;
  const sand = C(0xd9c692), sandWet = C(0xa89868), deep = C(0x1d4854);
  const grassA = C(0x4f8250), grassB = C(0x3f6f49), grassHi = C(0x67995a), rock = C(0x6f7482);
  {
    const positions = [], colors = [];
    const step = STEP;
    const h = (i, j) => terrainHeight(GX0 + i * step, GZ0 + j * step);
    const tmp = new THREE.Color();
    const faceColor = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      const slope = Math.max(Math.abs(ay - by), Math.abs(by - cy), Math.abs(ay - cy)) / step;
      const n = noise2(mx * 0.35 + 3, mz * 0.35 - 7);
      if (FAR && slope > 0.75 && Math.max(ay, by, cy) > 0.4) {
        tmp.copy(rock).multiplyScalar(0.82 + 0.25 * n);      // a cliff: bare rock from the water up
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
      if (my > 0.45) { const pa = pathAmount(mx, mz); if (pa > 0) tmp.lerp(C(0x94805a), pa * (FAR ? 0.8 : 0.3)); }      // at home, a faint wear under the modelled path
      const v = 0.95 + 0.1 * noise2(mx * 1.7, mz * 1.7);
      for (let k = 0; k < 3; k++) colors.push(tmp.r * v, tmp.g * v, tmp.b * v);
    };
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        const x0 = GX0 + i * step, x1 = x0 + step, z0 = GZ0 + j * step, z1 = z0 + step;
        const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1), h11 = h(i + 1, j + 1);
        if (Math.max(h00, h10, h01, h11) < -4.9) continue;
        positions.push(x0, h00, z0, x0, h01, z1, x1, h10, z0);
        faceColor(x0, h00, z0, x0, h01, z1, x1, h10, z0);
        positions.push(x1, h10, z0, x0, h01, z1, x1, h11, z1);
        faceColor(x1, h10, z0, x0, h01, z1, x1, h11, z1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
    land.receiveShadow = true;
    land.userData.noShadow = true;
    scene.add(land);
  }

  // ---------- sea ----------
  {
    // The grid is packed tight near the island, where waves are seen close up, and loose far out.
    const g = new THREE.PlaneGeometry(2, 2, 150, 150);
    g.rotateX(-Math.PI / 2);
    {
      const q = g.attributes.position.array;
      for (let i = 0; i < q.length; i += 3) {
        q[i] = Math.sign(q[i]) * Math.pow(Math.abs(q[i]), 2) * 450 + (FAR ? -45 : 0);      // packed tight around the middle of the island
        q[i + 2] = Math.sign(q[i + 2]) * Math.pow(Math.abs(q[i + 2]), 2) * 450;
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
    for (const [x, z, s] of FAR ? [[250, 30, 1.0], [150, -250, 0.9], [-280, -210, 0.8], [-330, 120, 1.0], [40, 300, 0.9]] : [[-190, -170, 1.2], [140, -240, 0.9], [-60, -300, 0.7], [260, 40, 1.0], [-250, 110, 0.9]]) {
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
    const ring = make && make('fire_ring', 'fire_extra');
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
        const m = make(i % 2 ? 'seat_log_b' : 'seat_log_a');
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
      const m = make && make('woodpile');
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
    if (FAR) return pathAmount(x, z) > 0.02 || (x > 8 && Math.abs(z) < 4.5) || Math.hypot(x - HILL.x, z - HILL.z) < 13 || Math.hypot(x + 32, z - 42) < 20 || Math.hypot(x - WALL.x, z - WALL.z) < 3;
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
  while (placed.length < (FAR ? 150 : 34) && tries++ < (FAR ? 20000 : 4000)) {
    const a = rng() * Math.PI * 2;
    const d = FAR ? 0.12 + Math.sqrt(rng()) * 0.8 : 0.3 + rng() * 0.48;
    const r = d * shoreRadius(a);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepClear(x, z) || !farEnough(x, z, 3.1)) continue;
    if (terrainHeight(x, z) < 0.75) continue;
    placed.push([x, z]);
    if (rng() < 0.7) pine(x, z, rand(0.85, 1.45)); else leafy(x, z, rand(0.9, 1.3));
  }
  tries = 0;
  let palms = 0;
  while (palms < (FAR ? 20 : 9) && tries++ < 3000) {
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
  const batch = (make, name, spots, skip) => {
    const lump = make.single(name, skip);
    if (!lump || !spots.length) return null;
    const inst = new THREE.InstancedMesh(lump.geometry, lump.material, spots.length), d = new THREE.Object3D();
    spots.forEach((sp, i) => { d.position.set(sp.x, sp.y, sp.z); d.rotation.set(0, sp.ry || 0, 0); d.scale.set(sp.sx || sp.s, sp.sy || sp.s, sp.sz || sp.s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
    // No shadows from the batch: a whole wood drawn again for every light is more than a phone can take.
    inst.castShadow = false; inst.receiveShadow = true; inst.userData.noShadow = true;
    scene.add(inst);
    return inst;
  };
  loadProps().then((make) => {
    if (!make || !FAR) return;
    const at = (kind) => farTrees.map((tr, i) => ({ ...tr, i })).filter((tr) => tr.kind === kind);
    const place = (list, drop) => list.map((tr) => ({ x: tr.x, y: terrainHeight(tr.x, tr.z) - drop, z: tr.z, s: tr.s, ry: tr.ry }));
    batch(make, 'pine_a', place(at('pine').filter((tr) => tr.i % 2 === 0), 0.1)); batch(make, 'pine_b', place(at('pine').filter((tr) => tr.i % 2 === 1), 0.1));
    batch(make, 'leafy_a', place(at('leafy').filter((tr) => tr.i % 2 === 0), 0.1)); batch(make, 'leafy_b', place(at('leafy').filter((tr) => tr.i % 2 === 1), 0.1));
    batch(make, 'palm', place(at('palm'), 0.15));
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
    while (n < (FAR ? 80 : 26) && tries++ < (FAR ? 8000 : 2000)) {
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
    const COUNT = FAR ? 3600 : 1100;
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
    while (flowers.length < (FAR ? 900 : 300) && tries2++ < (FAR ? 24000 : 6000)) {
      const a = r2() * Math.PI * 2, r = 6 + Math.sqrt(r2()) * (FAR ? shoreRadius(a) * 0.9 : 24), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (terrainHeight(x, z) < 0.95 || pathAmount(x, z) > 0.2 || noise2(x * 0.16 + 40, z * 0.16 - 12) < 0.12) continue;      // in drifts, not everywhere
      const c = Math.floor(r2() * 4), n = 2 + Math.floor(r2() * 4);
      for (let k = 0; k < n; k++) { const fx = x + (r2() - 0.5) * 1.3, fz = z + (r2() - 0.5) * 1.3; flowers.push({ x: fx, y: terrainHeight(fx, fz) - 0.02, z: fz, ry: r2() * 6, tx: (r2() - 0.5) * 0.3, tz: (r2() - 0.5) * 0.3, s: 0.8 + r2() * 0.7, c }); }
    }
    scatter('flower', flowers, 'flower_petal', [0xffffff, 0xffd54a, 0xf59ac0, 0xb9a2f2]);
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
  if (FAR) {
    for (const p of LANDING) if (p.r) colliders.push({ x: p.x, z: p.z, r: p.r });
    for (const sx of [-1.25, 1.25]) colliders.push({ x: MAP_BOARD.x + Math.cos(MAP_BOARD.ry) * sx, z: MAP_BOARD.z - Math.sin(MAP_BOARD.ry) * sx, r: 0.3 });
    colliders.push({ x: MAPMAKER.x, z: MAPMAKER.z, r: 0.95 });
    // The map: the coast as far as anyone has drawn it. Only the Landing is filled in so far.
    const drawMap = () => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 666;
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
        } else { g.fillStyle = 'rgba(91,70,48,0.6)'; g.font = 'italic 44px Georgia, serif'; g.fillText('?', X(a.x), Z(a.z)); }
      }
      g.fillStyle = '#3d2e1f'; g.font = 'italic 600 40px Georgia, serif'; g.textAlign = 'left'; g.fillText('The far shore', 38, 50);
      g.font = 'italic 22px Georgia, serif'; g.fillStyle = 'rgba(61,46,31,0.75)'; g.fillText('as far as anyone has walked it', 40, 86);
      // north is up the page (the island's -z)
      g.strokeStyle = '#3d2e1f'; g.lineWidth = 3; g.beginPath(); g.moveTo(950, 110); g.lineTo(950, 44); g.moveTo(938, 62); g.lineTo(950, 44); g.lineTo(962, 62); g.stroke();
      g.textAlign = 'center'; g.font = 'italic 600 24px Georgia, serif'; g.fillStyle = '#3d2e1f'; g.fillText('N', 950, 128);
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
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
      const t = make('mapmaker');
      if (t) { mapmaker.home = Math.atan2(-(2 - MAPMAKER.z), 16 - MAPMAKER.x); t.position.set(MAPMAKER.x, terrainHeight(MAPMAKER.x, MAPMAKER.z), MAPMAKER.z); t.rotation.y = mapmaker.home; t.scale.setScalar(1.25); scene.add(t); mapmaker.group = t; }
    });
  }

  const api = {
    mapmaker,
    fireY,
    update(dt, t) { for (const u of updaters) u(dt, t); },
    setFuel(v) { fuel = v; },
    setParty(v) { party = v; },
    setGathering(v) { gathering = !!v; },
    get heat() { return heat; },
    flareUp() { flare = 1; for (let i = 0; i < EMBERS; i++) if (rng() < 0.5) emberData[i].life = 99; },
    tossLog(x, y, z, done) { toss = { x, y, z, k: 0, done }; tossMesh.position.set(x, y, z); tossMesh.visible = true; },
    setShadows(on) { fireLight.castShadow = on; },
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
