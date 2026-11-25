// Tracks: a short trail of prints behind every walking animal, and the prints left by those who were here earlier.
// Each kind of print (paw, hoof) is one instanced mesh, so a whole island of tracks costs two draw calls.
import * as THREE from 'three';

const TRAIL = 360;        // prints in the air at once, per kind; the oldest make way
const LIFE = 40;          // seconds a fresh print lasts
const FADE = 7;           // of which the last few are spent shrinking away
const LEFT = 72;          // prints kept for earlier visitors, per kind

function printTexture(hoof) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  if (hoof) {
    // Two toes side by side, pointed at the front.
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(32 + sx * 3, 54); g.quadraticCurveTo(32 + sx * 22, 50, 32 + sx * 19, 26); g.quadraticCurveTo(32 + sx * 14, 8, 32 + sx * 4, 10); g.closePath(); g.fill();
    }
  } else {
    g.beginPath(); g.ellipse(32, 42, 14, 11, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y] of [[13, 27], [25, 14], [39, 14], [51, 27]]) { g.beginPath(); g.ellipse(x, y, 5.5, 7, 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTraces(scene, groundHeight, surface) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);       // flat on the ground, the top of the picture pointing along -z
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function pool(hoof, size, opacity) {
    const mat = new THREE.MeshBasicMaterial({ map: printTexture(hoof), color: 0x1d150d, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.InstancedMesh(geo, mat, size);
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    for (let i = 0; i < size; i++) mesh.setMatrixAt(i, zero);
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return { mesh, size, next: 0, born: new Float32Array(size).fill(-1e6), spot: new Float32Array(size * 5) };
  }
  const trail = [pool(false, TRAIL, 0.4), pool(true, TRAIL, 0.4)];
  const left = [pool(false, LEFT, 0.55), pool(true, LEFT, 0.55)];
  function place(p, i, x, z, yaw, s, k = 1) {
    pos.set(x, groundHeight(x, z) + 0.03, z);
    q.setFromAxisAngle(up, yaw + Math.PI);
    scl.set(s * k, 1, s * k);
    p.mesh.setMatrixAt(i, m4.compose(pos, q, scl));
    p.mesh.instanceMatrix.needsUpdate = true;
  }
  const marks = new WeakMap();   // avatar -> where it last left a print
  let now = 0, sweepAt = 0, tracks = [];

  return {
    // Call every frame for each animal on its feet. height is the animal's size; hoof picks the print.
    walk(av, height, hoof) {
      let m = marks.get(av);
      if (!m) { m = { x: av.x, z: av.z, side: 1 }; marks.set(av, m); return; }
      const d = Math.hypot(av.x - m.x, av.z - m.z), stride = 0.28 + height * 0.2;
      if (d > 6) { m.x = av.x; m.z = av.z; return; }          // carried somewhere else: no trail across the island
      if (d < stride) return;
      const yaw = Math.atan2(av.x - m.x, av.z - m.z);
      m.x = av.x; m.z = av.z; m.side = -m.side;
      const kind = surface(av.x, av.z);
      if (kind !== 'sand' && kind !== 'grass') return;
      const p = trail[hoof ? 1 : 0], i = p.next, s = 0.1 + height * 0.1, off = (0.07 + height * 0.06) * m.side;
      const x = av.x + Math.cos(yaw) * off, z = av.z - Math.sin(yaw) * off;
      p.next = (p.next + 1) % p.size;
      p.born[i] = now;
      p.spot.set([x, z, yaw, s * (kind === 'grass' ? 0.85 : 1), 0], i * 5);
      place(p, i, x, z, yaw, p.spot[i * 5 + 3]);
    },
    update(t) {
      now = t;
      if (t - sweepAt < 0.25) return;
      sweepAt = t;
      for (const p of trail) {
        for (let i = 0; i < p.size; i++) {
          const age = t - p.born[i];
          if (age < LIFE - FADE || p.born[i] < -1e5) continue;
          if (age >= LIFE) { p.born[i] = -1e6; p.mesh.setMatrixAt(i, zero); p.mesh.instanceMatrix.needsUpdate = true; continue; }
          place(p, i, p.spot[i * 5], p.spot[i * 5 + 1], p.spot[i * 5 + 2], p.spot[i * 5 + 3], (LIFE - age) / FADE);
        }
      }
    },
    // The tracks of earlier visitors: [{x, z, s (species), n (name), at}], with a way to say which species are hoofed.
    setLeft(list, isHoofed, heightOf) {
      for (const p of left) { for (let i = 0; i < p.size; i++) p.mesh.setMatrixAt(i, zero); p.mesh.instanceMatrix.needsUpdate = true; p.next = 0; }
      tracks = [];
      for (const tr of list || []) {
        if (!Number.isFinite(tr.x) || !Number.isFinite(tr.z)) continue;
        const p = left[isHoofed(tr.s) ? 1 : 0], h = heightOf(tr.s), s = 0.11 + h * 0.11;
        // A short wandering line of prints that ends where the animal was last.
        let seed = (Math.abs(Math.round(tr.x * 31 + tr.z * 17 + (tr.at % 9973))) % 9973) + 1;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        let yaw = rnd() * Math.PI * 2, x = tr.x, z = tr.z, laid = 0;
        for (let k = 0; k < 9 && p.next < p.size; k++) {
          const kind = surface(x, z);
          if (kind === 'sand' || kind === 'grass') {
            const side = k % 2 ? 1 : -1, off = (0.07 + h * 0.06) * side;
            place(p, p.next++, x + Math.cos(yaw) * off, z - Math.sin(yaw) * off, yaw + Math.PI, s);
            laid++;
          }
          yaw += (rnd() - 0.5) * 0.7;
          x += Math.sin(yaw) * (0.34 + h * 0.26); z += Math.cos(yaw) * (0.34 + h * 0.26);
        }
        if (laid >= 3) tracks.push(tr);
      }
      return tracks.length;
    },
    // The nearest of those tracks within reach, if any.
    near(x, z, reach = 2.2) {
      let best = null, bd = reach;
      for (const tr of tracks) { const d = Math.hypot(tr.x - x, tr.z - z); if (d < bd) { bd = d; best = tr; } }
      return best;
    },
    get left() { return tracks; },
    get count() { return trail.reduce((a, p) => a + p.born.reduce((n, b) => n + (b > -1e5 ? 1 : 0), 0), 0); },
  };
}
