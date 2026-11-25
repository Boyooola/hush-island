// Packs low-poly OBJ models (Quaternius, CC0) into one small file the game loads: assets/sea.json (the fish).
// Usage: node tools/pack_nature.mjs "<folder of .obj/.mtl>" [more folders...]
// Each model becomes flat triangles with a colour per vertex, sitting on the ground (lowest point at y = 0),
// centred on its trunk, with positions stored as 16-bit numbers.
import fs from 'node:fs';
import path from 'node:path';
const out = {};
// The packs' material colours are linear light; they are stored here as ordinary sRGB bytes.
const toByte = (c) => { const x = Math.min(1, Math.max(0, c)); return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255); };
for (const dir of process.argv.slice(2)) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.obj')).sort()) {
    const name = f.replace(/\.obj$/, '').replace(/\s+/g, '');
    const mtl = {}; let cur = null;
    const mpath = path.join(dir, f.replace(/\.obj$/, '.mtl'));
    if (fs.existsSync(mpath)) for (const line of fs.readFileSync(mpath, 'utf8').split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'newmtl') cur = p[1];
      else if (p[0] === 'Kd' && cur) mtl[cur] = p.slice(1, 4).map(Number);
    }
    const v = [], tris = []; let col = [0.6, 0.6, 0.6];
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') v.push(p.slice(1, 4).map(Number));
      else if (p[0] === 'usemtl') col = mtl[p[1]] || col;
      else if (p[0] === 'f') {
        const idx = p.slice(1).map((s) => { const i = parseInt(s, 10); return i < 0 ? v.length + i : i - 1; });
        for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1], col]);
      }
    }
    let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const t of tris) for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[t[k]][a]); max[a] = Math.max(max[a], v[t[k]][a]); }
    // Centre on the base: the middle of whatever touches the ground (the trunk), not of the whole crown.
    const low = tris.flatMap((t) => [0, 1, 2].map((k) => v[t[k]])).filter((q) => q[1] < min[1] + (max[1] - min[1]) * 0.06);
    const cx = low.reduce((a, q) => a + q[0], 0) / low.length, cz = low.reduce((a, q) => a + q[2], 0) / low.length;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1, k16 = 32000 / span;
    const pos = new Int16Array(tris.length * 9), rgb = new Uint8Array(tris.length * 9);
    tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { const q = v[t[k]]; pos.set([Math.round((q[0] - cx) * k16), Math.round((q[1] - min[1]) * k16), Math.round((q[2] - cz) * k16)], i * 9 + k * 3); rgb.set(t[3].map(toByte), i * 9 + k * 3); } });
    out[name] = { n: tris.length, k: +(1 / k16).toPrecision(6), h: +(max[1] - min[1]).toFixed(3), w: +Math.max(max[0] - min[0], max[2] - min[2]).toFixed(3), p: Buffer.from(pos.buffer).toString('base64'), c: Buffer.from(rgb.buffer).toString('base64') };
  }
}
fs.writeFileSync(new URL('../assets/sea.json', import.meta.url), JSON.stringify(out));
for (const [k, m] of Object.entries(out)) console.log(k.padEnd(18), String(m.n).padStart(5), 'tris  h', m.h, ' w', m.w);
console.log(Object.keys(out).length, 'models,', Math.round(fs.statSync(new URL('../assets/sea.json', import.meta.url)).size / 1024), 'KB');
