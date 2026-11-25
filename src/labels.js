// Text drawn onto canvases and shown as sprites: name tags, chat bubbles, sky labels.
// Text from other people only ever goes through fillText, never into markup.
import * as THREE from 'three';

const FONT = '"Nunito", "Segoe UI", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function spriteFromCanvas(canvas, worldHeight) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  return sprite;
}

// Name tag: name on the first line, a quieter second line (place and local time).
export function makeNameTag(name, sub, isYou) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const sprite = spriteFromCanvas(canvas, 0.44);
  sprite.userData.draw = (n, s) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 44px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8,14,30,0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(n, 256, 44);
    ctx.fillStyle = isYou ? '#ffc978' : '#f6ead2';
    ctx.fillText(n, 256, 44);
    // The second line may begin with marks (§m muted, §z away, §i it), drawn as small signs before the words.
    const marks = [];
    let text = String(s || '');
    for (let m = /^§([mzi])/.exec(text); m; m = /^§([mzi])/.exec(text)) { marks.push(m[1]); text = text.slice(2); }
    text = text.trim();
    if (text || marks.length) {
      ctx.font = `700 30px ${FONT}`;
      ctx.lineWidth = 6;
      const MW = { m: 40, z: 46, i: 44 }, gap = 10;
      const tw = text ? ctx.measureText(text).width : 0;
      const mw = marks.reduce((a, k) => a + MW[k] + gap, 0) - (text ? 0 : gap);
      let x = 256 - (tw + mw) / 2;
      for (const k of marks) {
        const cx = x + MW[k] / 2, cy = 98;
        ctx.save();
        ctx.strokeStyle = 'rgba(8,14,30,0.85)'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (k === 'm') {
          // A speaker, struck through.
          const body = () => { ctx.beginPath(); ctx.moveTo(cx - 15, cy - 6); ctx.lineTo(cx - 7, cy - 6); ctx.lineTo(cx + 3, cy - 14); ctx.lineTo(cx + 3, cy + 14); ctx.lineTo(cx - 7, cy + 6); ctx.lineTo(cx - 15, cy + 6); ctx.closePath(); };
          body(); ctx.lineWidth = 7; ctx.stroke(); ctx.fillStyle = '#ff8f7a'; ctx.fill();
          const slash = () => { ctx.beginPath(); ctx.moveTo(cx - 16, cy + 15); ctx.lineTo(cx + 16, cy - 15); };
          slash(); ctx.lineWidth = 10; ctx.stroke(); slash(); ctx.lineWidth = 4.5; ctx.strokeStyle = '#ff8f7a'; ctx.stroke();
        } else if (k === 'z') {
          ctx.textAlign = 'center'; ctx.font = `800 italic 30px ${FONT}`; ctx.lineWidth = 6;
          ctx.strokeText('z', cx - 11, cy + 3); ctx.fillStyle = '#a9c8ff'; ctx.fillText('z', cx - 11, cy + 3);
          ctx.font = `800 italic 22px ${FONT}`; ctx.strokeText('z', cx + 5, cy - 6); ctx.fillText('z', cx + 5, cy - 6);
          ctx.font = `800 italic 16px ${FONT}`; ctx.strokeText('z', cx + 17, cy - 14); ctx.fillText('z', cx + 17, cy - 14);
        } else {
          ctx.textAlign = 'center'; ctx.font = `800 30px ${FONT}`; ctx.lineWidth = 6;
          ctx.strokeText('it!', cx, cy); ctx.fillStyle = '#ffb04a'; ctx.fillText('it!', cx, cy);
        }
        ctx.restore();
        x += MW[k] + gap;
      }
      if (text) {
        ctx.textAlign = 'left';
        ctx.strokeText(text, x, 98);
        ctx.fillStyle = 'rgba(214,226,240,0.92)';
        ctx.fillText(text, x, 98);
        ctx.textAlign = 'center';
      }
    }
    sprite.material.map.needsUpdate = true;
  };
  sprite.userData.draw(name, sub);
  sprite.renderOrder = 10;
  return sprite;
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const push = (l) => { if (lines.length < maxLines) lines.push(l); };
  for (let w of words) {
    // Break very long words.
    while (ctx.measureText(w).width > maxWidth) {
      let cut = w.length - 1;
      while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxWidth) cut--;
      if (line) { push(line); line = ''; }
      push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) push(line);
  if (lines.length === maxLines) {
    const used = lines.join(' ').length;
    if (used < text.replace(/\s+/g, ' ').trim().length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

// Chat bubble above an avatar.
export function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 320;
  const sprite = spriteFromCanvas(canvas, 1.3);
  sprite.center.set(0.5, 0);
  sprite.visible = false;
  sprite.renderOrder = 11;
  sprite.userData.setText = (text) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 640, 320);
    ctx.font = `700 40px ${FONT}`;
    const lines = wrapLines(ctx, text, 540, 4);
    const lh = 50;
    const w = Math.max(120, Math.min(600, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56));
    const h = lines.length * lh + 36;
    const x = (640 - w) / 2;
    const y = 320 - 26 - h;
    ctx.fillStyle = 'rgba(250,240,220,0.96)';
    roundRect(ctx, x, y, w, h, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(320 - 16, y + h - 1);
    ctx.lineTo(320, y + h + 22);
    ctx.lineTo(320 + 16, y + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a2238';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 320, y + 18 + lh * (i + 0.5)));
    sprite.material.map.needsUpdate = true;
  };
  return sprite;
}

// Small quiet label, used for constellation names and the sign.
export function makeSkyLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = `700 44px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(214,230,255,0.95)';
  ctx.fillText(text, 256, 48);
  return spriteFromCanvas(canvas, 9);
}

// The marked face of the driftwood wall: the most recent marks visitors have scratched into the wood.
export function makeCarvingBoard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 560;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (list) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 560);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const rows = [];
    const shown = list.slice(0, 5);
    const size = [64, 64, 56, 48, 42, 38][shown.length], lh = Math.round(size * 1.12), nameSize = Math.round(size * 0.62);
    ctx.font = `800 ${size}px ${FONT}`;
    for (const c of shown) {
      const lines = wrapLines(ctx, c.text, 840, shown.length > 3 ? 2 : 3);
      rows.push({ lines, name: c.name, seed: [...c.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) });
    }
    if (!rows.length) rows.push({ lines: ['no marks here yet'], name: '', seed: 3, faint: true });
    const total = rows.reduce((n, r) => n + r.lines.length * lh + (r.name ? nameSize + 6 : 0) + 20, 0);
    let y = Math.max(24, (560 - total) / 2);
    for (const r of rows) {
      const tilt = (((r.seed % 100) / 100) - 0.5) * 0.05, shift = ((r.seed >> 8) % 60) - 30;
      ctx.save();
      ctx.translate(512 + shift, y);
      ctx.rotate(tilt);
      ctx.font = `800 ${size}px ${FONT}`;
      let ly = lh / 2;
      for (const l of r.lines) {
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(38,26,16,0.9)'; ctx.strokeText(l, 0, ly);
        ctx.fillStyle = r.faint ? 'rgba(240,222,190,0.45)' : 'rgba(250,236,208,0.98)'; ctx.fillText(l, 0, ly);
        ly += lh;
      }
      if (r.name) {
        ctx.font = `700 ${nameSize}px ${FONT}`;
        ctx.lineWidth = 5; ctx.strokeText(r.name, 0, ly + 2);
        ctx.fillStyle = 'rgba(255,201,120,0.95)'; ctx.fillText(r.name, 0, ly + 2);
        // A paw print signs each mark.
        const px = -ctx.measureText(r.name).width / 2 - nameSize * 0.75, u = nameSize * 0.2;
        ctx.beginPath();
        ctx.ellipse(px, ly + 2 + u * 0.7, u * 1.15, u * 0.95, 0, 0, Math.PI * 2);
        for (const [dx, dy] of [[-1.35, -0.55], [-0.5, -1.35], [0.5, -1.35], [1.35, -0.55]]) { ctx.moveTo(px + dx * u + u * 0.5, ly + 2 + dy * u); ctx.ellipse(px + dx * u, ly + 2 + dy * u, u * 0.5, u * 0.58, 0, 0, Math.PI * 2); }
        ctx.fill();
        ly += nameSize + 6;
      }
      ctx.restore();
      y += ly + 20 - lh / 2 + (r.name ? 0 : lh / 2);
    }
    tex.needsUpdate = true;
  };
  draw([]);
  return { tex, draw };
}

export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSignTexture(title, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7a5a3c';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = 'rgba(40,24,12,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 20 + i * 26);
    ctx.bezierCurveTo(140, 10 + i * 26, 360, 34 + i * 26, 512, 18 + i * 26);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fbe7c2';
  // Each line is set as large as it can be and still fit the board.
  let size = 74;
  do { ctx.font = `800 ${size}px "Baloo 2", ${FONT}`; size -= 2; } while (size > 30 && ctx.measureText(title).width > 468);
  ctx.fillText(title, 256, 78);
  size = 34;
  do { ctx.font = `700 ${size}px ${FONT}`; size -= 1; } while (size > 18 && ctx.measureText(sub).width > 468);
  ctx.fillStyle = 'rgba(251,231,194,0.85)';
  ctx.fillText(sub, 256, 146);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
