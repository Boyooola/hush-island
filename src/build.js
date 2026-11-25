// The keeper's boat: something being built on the west beach, plank by plank, by everyone who visits.
// Driftwood washes up around the island; carried here, each piece becomes part of the hull.
import * as THREE from 'three';
import { shoreRadius, terrainHeight, colliders, smoothstep } from './terrain.js';
import { makeSignTexture, makeGlowTexture } from './labels.js';

export const BOAT_GOAL = 120;
export const SITE_A = 2.62;
export const siteR = shoreRadius(SITE_A) * 0.9;
export const SITE = { x: Math.cos(SITE_A) * siteR, z: Math.sin(SITE_A) * siteR };

export function buildSite(scene) {
  const wood = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, emissive: c, emissiveIntensity: 0.08 });
  const frameMat = wood(0x6a4c32), plankMat = wood(0xb89a6c), paleMat = wood(0xb8a888);
  const box = (w, h, d, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.castShadow = true; return b; };

  const g = new THREE.Group();
  const y0 = terrainHeight(SITE.x, SITE.z);
  g.position.set(SITE.x, y0, SITE.z);
  g.rotation.y = -SITE_A + Math.PI / 2;        // lying along the shore, bow toward the open beach
  scene.add(g);

  // The hull is its own piece, so that it can leave the stocks and sail. At rest it lies exactly where the yard is.
  const hull = new THREE.Group();
  hull.position.copy(g.position); hull.rotation.y = g.rotation.y;
  scene.add(hull);
  const HOME_YAW = g.rotation.y;

  // Stocks and keel.
  for (const x of [-1.5, 0, 1.5]) { const b = box(0.3, 0.3, 1.1, frameMat); b.position.set(x, 0.15, 0); g.add(b); }
  const keel = box(5.2, 0.16, 0.2, frameMat); keel.position.y = 0.38; hull.add(keel);
  for (const s of [-1, 1]) { const post = box(0.16, 1.25, 0.18, frameMat); post.position.set(s * 2.75, 0.85, 0); post.rotation.z = -s * 0.5; hull.add(post); }
  // Ribs: seven stations, widest amidships.
  const DECK = 0.74;        // the floor the crew sits on, above the keel
  const half = (x) => 0.95 * Math.sqrt(Math.max(0.05, 1 - (x / 2.9) ** 2));
  const stations = [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1];
  // Each rib turns at the bilge: out from the keel, then up the side.
  const BILGE = [0.78, 0.26], TOP = [1, 0.95];
  const ribPiece = (x, s, p0, p1) => {
    const w = half(x), dz = (p1[0] - p0[0]) * w, dy = p1[1] - p0[1];
    const rib = box(0.09, Math.hypot(dz, dy) + 0.05, 0.09, frameMat);
    rib.position.set(x, 0.42 + (p0[1] + p1[1]) / 2, s * ((p0[0] + p1[0]) / 2) * w);
    rib.rotation.x = s * Math.atan2(dz, dy);
    hull.add(rib);
  };
  for (const x of stations) for (const s of [-1, 1]) { ribPiece(x, s, [0, 0], BILGE); ribPiece(x, s, BILGE, TOP); }
  // Planks: laid from the keel upward as the count grows. One strake across the bottom, three up each side.
  const planks = [];
  const strakes = [[[0.06, 0.02], BILGE]];
  for (let k = 0; k < 3; k++) strakes.push([[BILGE[0] + (TOP[0] - BILGE[0]) * (k / 3), BILGE[1] + (TOP[1] - BILGE[1]) * (k / 3)], [BILGE[0] + (TOP[0] - BILGE[0]) * ((k + 1) / 3), BILGE[1] + (TOP[1] - BILGE[1]) * ((k + 1) / 3)]]);
  for (const [p0, p1] of strakes) for (let i = 0; i < stations.length - 1; i++) for (const s of [-1, 1]) {
    const x0 = stations[i], x1 = stations[i + 1], xm = (x0 + x1) / 2, wm = half(xm), mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const z0 = half(x0) * mid[0], z1 = half(x1) * mid[0];
    const dz = (p1[0] - p0[0]) * wm, dy = p1[1] - p0[1];
    const p = box(Math.hypot(x1 - x0, z1 - z0) + 0.05, Math.hypot(dz, dy) + 0.02, 0.045, plankMat);
    p.position.set(xm, 0.42 + mid[1], s * ((z0 + z1) / 2 + 0.05));
    p.rotation.order = 'YXZ';
    p.rotation.y = -s * Math.atan2(z1 - z0, x1 - x0);
    p.rotation.x = s * Math.atan2(dz, dy);
    p.visible = false;
    hull.add(p);
    planks.push(p);
  }
  // The yard: a sawhorse, a stack of cut planks, and a sign that keeps count.
  const horse = new THREE.Group();
  const top = box(1.3, 0.1, 0.14, frameMat); top.position.y = 0.6; horse.add(top);
  for (const sx of [-0.5, 0.5]) for (const sz of [-1, 1]) { const leg = box(0.07, 0.68, 0.07, frameMat); leg.position.set(sx, 0.3, sz * 0.16); leg.rotation.x = sz * 0.3; horse.add(leg); }
  horse.position.set(-1.2, 0, 2.3); horse.rotation.y = 0.4; g.add(horse);
  for (let i = 0; i < 5; i++) { const p = box(1.5, 0.06, 0.2, paleMat); p.position.set(1.4 + (i % 2) * 0.08, 0.05 + i * 0.065, 2.2 + (i % 3) * 0.05); p.rotation.y = 0.15 + i * 0.05; g.add(p); }
  const signPost = box(0.1, 1.5, 0.1, frameMat); signPost.position.set(3.4, 0.75, 1.9); g.add(signPost);
  const signMat = new THREE.MeshStandardMaterial({ map: makeSignTexture('Being built', '0 of 120 planks'), roughness: 1, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.56, 0.06), [wood(0x6a4c32), wood(0x6a4c32), wood(0x6a4c32), wood(0x6a4c32), signMat, wood(0x6a4c32)]);
  sign.position.set(3.4, 1.35, 1.96); sign.rotation.y = -0.25; g.add(sign);
  // A lamp on the post so the yard can be found at night.
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture('rgba(255,255,255,1)'), color: 0xffc27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lamp.scale.setScalar(1.5); lamp.position.set(3.4, 1.75, 1.9); g.add(lamp);
  const lampLight = new THREE.PointLight(0xffc27a, 6, 9, 1.8); lampLight.position.set(3.4, 1.7, 2.0); g.add(lampLight);

  // Finished: a mast, a sail on its yard, a floor to sit on and a pennant. Hidden until the last plank is on.
  const rig = new THREE.Group();
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 1, flatShading: true, side: THREE.DoubleSide, emissive: 0xefe6d2, emissiveIntensity: 0.1 });
  const mast = box(0.13, 3.4, 0.13, frameMat); mast.position.set(0.2, 0.42 + 1.7, 0); rig.add(mast);
  const yardArm = box(0.09, 0.09, 2.3, frameMat); yardArm.position.set(0.2, 3.25, 0); rig.add(yardArm);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.6, 3, 2), sailMat);
  { const p = sail.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / 2.1 + 0.5) * Math.PI) * 0.22 * (0.4 + (0.5 - p.getY(i) / 1.6))); sail.geometry.computeVertexNormals(); }
  sail.rotation.y = Math.PI / 2; sail.position.set(0.24, 2.4, 0); sail.castShadow = true; rig.add(sail);
  for (const x of stations.slice(0, -1)) { const xm = x + 0.35, t = box(0.74, 0.05, 2 * half(xm) * 0.8, paleMat); t.position.set(xm, DECK, 0); t.castShadow = false; rig.add(t); }
  const pennant = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.26, 0, 0.62, -0.13, 0], 3)), new THREE.MeshBasicMaterial({ color: 0xff9d4d, side: THREE.DoubleSide }));
  pennant.position.set(0.2, 3.82, 0); rig.add(pennant);
  rig.visible = false; hull.add(rig);

  // Keep walkers out of the hull.
  g.updateMatrixWorld(true);
  for (const x of [-2, -1, 0, 1, 2]) { const v = new THREE.Vector3(x, 0, 0).applyMatrix4(g.matrixWorld); colliders.push({ x: v.x, z: v.z, r: 0.85 }); }
  const dropAt = new THREE.Vector3(0, 0, 2.6).applyMatrix4(g.matrixWorld);

  // Driftwood on the beaches: a handful of places, three of them holding a piece at any time.
  const SPOTS = [];
  for (let i = 0; i < 11; i++) {
    const a = 0.25 + i * 0.571 + (i % 3) * 0.07, r = shoreRadius(a) * (0.93 + (i % 2) * 0.03);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - SITE.x, z - SITE.z) > 9) SPOTS.push({ x, z });
  }
  const pieces = [];
  const glowTex = makeGlowTexture('rgba(255,255,255,1)');
  for (let i = 0; i < 3; i++) {
    const m = box(0.78, 0.07, 0.17, paleMat);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2b0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glint.scale.setScalar(0.7); glint.position.y = 0.25; m.add(glint);
    scene.add(m);
    pieces.push({ m, glint, spot: -1, wait: 0 });
  }
  function place(pc) {
    const used = new Set(pieces.map((p) => p.spot));
    let k = Math.floor(Math.random() * SPOTS.length), guard = 0;
    while (used.has(k) && guard++ < 30) k = (k + 1) % SPOTS.length;
    pc.spot = k;
    const s = SPOTS[k];
    pc.m.position.set(s.x, terrainHeight(s.x, s.z) + 0.05, s.z);
    pc.m.rotation.y = k * 1.3;
    pc.m.visible = true;
  }
  pieces.forEach(place);

  // Places for the crew, bow to stern, and where each steps down onto the sand afterwards.
  const SEATS = [[-0.5, 0.34], [-0.5, -0.34], [-1.3, 0.3], [-1.3, -0.3], [-2.0, 0], [1.1, 0]];      // aft of the mast first, where the sail does not hide them
  const tmp = new THREE.Vector3();
  let shown = -1, away = false;
  return {
    crewMax: SEATS.length,
    heading: Math.atan2(Math.cos(HOME_YAW), -Math.sin(HOME_YAW)),      // the way she points on the stocks, as a walker's yaw
    // Put the hull somewhere on its voyage ({ x, z, hx, hz }: a place and a heading), or back on the stocks (null).
    // seaY gives the height of the water at a point, so that she rides the waves.
    setHull(pose, seaY, t) {
      if (!pose) { if (away) { away = false; hull.position.copy(g.position); hull.rotation.set(0, HOME_YAW, 0); } return; }
      away = true;
      const ground = terrainHeight(pose.x, pose.z), water = seaY(pose.x, pose.z) - 0.36;
      const afloat = smoothstep(0.0, 0.5, water - ground);
      const px = -pose.hz, pz = pose.hx;      // the direction across the boat
      const pitch = Math.atan2(seaY(pose.x + pose.hx * 2.2, pose.z + pose.hz * 2.2) - seaY(pose.x - pose.hx * 2.2, pose.z - pose.hz * 2.2), 4.4);
      const roll = Math.atan2(seaY(pose.x + px * 0.8, pose.z + pz * 0.8) - seaY(pose.x - px * 0.8, pose.z - pz * 0.8), 1.6);
      hull.position.set(pose.x, Math.max(ground, water), pose.z);
      hull.rotation.order = 'YZX';
      hull.rotation.y = Math.atan2(-pose.hz, pose.hx);
      hull.rotation.z = pitch * afloat;
      hull.rotation.x = (roll * 0.8 + Math.sin(t * 0.9) * 0.03) * afloat;
      pennant.rotation.y = Math.sin(t * 5) * 0.25;
    },
    // Where seat i is in the world right now.
    seat(i) {
      const s = SEATS[i % SEATS.length];
      hull.updateMatrixWorld(true);
      tmp.set(s[0], DECK + 0.03, s[1]).applyMatrix4(hull.matrixWorld);
      return { x: tmp.x, y: tmp.y, z: tmp.z };
    },
    ashore(i) { tmp.set(1.6 - (i % SEATS.length) * 0.9, 0, 2.3 + (i % 2) * 0.5).applyMatrix4(g.matrixWorld); return { x: tmp.x, z: tmp.z }; },
    site: { x: dropAt.x, z: dropAt.z },
    update(dt, t) {
      for (const pc of pieces) {
        if (pc.wait > 0) { pc.wait -= dt; if (pc.wait <= 0) place(pc); }
        pc.glint.material.opacity = 0.3 + 0.25 * Math.sin(t * 2 + pc.spot);
      }
    },
    // Index of a piece of driftwood within reach, or -1.
    near(x, z) { return pieces.findIndex((pc) => pc.m.visible && Math.hypot(pc.m.position.x - x, pc.m.position.z - z) < 1.7); },
    take(i) { const pc = pieces[i]; if (!pc || !pc.m.visible) return false; pc.m.visible = false; pc.spot = -1; pc.wait = 30; return true; },
    get pieces() { return pieces.filter((p) => p.m.visible).map((p) => ({ x: p.m.position.x, z: p.m.position.z })); },
    // How far along the boat is.
    setProgress(total) {
      const n = Math.min(planks.length, Math.round((Math.min(total, BOAT_GOAL) / BOAT_GOAL) * planks.length));
      planks.forEach((p, i) => { p.visible = i < n; });
      rig.visible = total >= BOAT_GOAL;
      if (total !== shown) {
        shown = total;
        signMat.map.dispose();
        signMat.map = makeSignTexture(total >= BOAT_GOAL ? 'The boat is built' : 'Being built', total >= BOAT_GOAL ? 'Climb in for a sail' : `${Math.min(total, BOAT_GOAL)} of ${BOAT_GOAL} planks`);
        signMat.needsUpdate = true;
      }
    },
  };
}
