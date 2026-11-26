// The island's furniture, modelled in Blender (assets/site/props.glb): the fire ring, the seat logs, the woodpile,
// rocks and so on. Each is a named piece in the one file. The shapes built in code stand in until the file arrives
// (or for good, if it never does), and are swapped for these when it does.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let loading = null;
const baked = new Map();
// Resolves to a maker: make(name, skip) gives a fresh copy of the named piece (or null), with all its small parts
// merged into one mesh per material so that a pile of forty logs costs four draws, not forty.
export function loadProps() {
  if (!loading) loading = new Promise((res) => {
    new GLTFLoader().load('./props.glb', (gltf) => {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const bake = (name, skip) => {
        const key = name + '|' + (skip || '');
        if (baked.has(key)) return baked.get(key);
        const root = scene.getObjectByName(name);
        if (!root) { baked.set(key, null); return null; }
        const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), by = new Map();
        const walk = (o) => {
          if (o !== root && skip && o.name.startsWith(skip)) return;
          if (o.isMesh) {
            const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
            if (!by.has(o.material)) by.set(o.material, []);
            by.get(o.material).push(g);
          }
          o.children.forEach(walk);
        };
        walk(root);
        const parts = [...by.entries()].map(([m, gs]) => { m.flatShading = true; return [mergeGeometries(gs, false), m]; }).filter(([g]) => g);
        baked.set(key, parts);
        return parts;
      };
      // One piece as a single lump of geometry, its colours painted onto the corners: for things that are
      // scattered in their hundreds (a wood of trees) and must cost one draw between them, not one each.
      const lumps = new Map();
      const paint = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      const single = (name, skip) => {
        const key = name + '|' + (skip || '');
        if (lumps.has(key)) return lumps.get(key);
        const parts = bake(name, skip);
        if (!parts || !parts.length) { lumps.set(key, null); return null; }
        const gs = parts.map(([geo, m]) => {
          const g = geo.clone(), n = g.attributes.position.count, col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return g.index ? g.toNonIndexed() : g;
        });
        const out = { geometry: mergeGeometries(gs, false), material: paint };
        lumps.set(key, out);
        return out;
      };
      const make = (name, skip) => {
        const parts = bake(name, skip);
        if (!parts || !parts.length) return null;
        const g = new THREE.Group();
        for (const [geo, m] of parts) { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
        return g;
      };
      make.single = single;
      res(make);
    }, undefined, () => res(null));
  });
  return loading;
}
