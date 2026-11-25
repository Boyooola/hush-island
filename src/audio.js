// All sound is generated in the browser: sea, fire, crickets and a slow music loop.
// The music is timed from the wall clock, so everyone on the island hears the same bar.
import { mulberry32, clamp } from './terrain.js';

const BEAT_MS = 857;            // 70 beats per minute
const BAR_MS = BEAT_MS * 4;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Four-bar loop: Fmaj9, Em7, Dm9, Cmaj9. Each chord lasts two bars.
const CHORDS = [
  { bass: 41, notes: [57, 60, 64, 67] },
  { bass: 40, notes: [55, 59, 62, 67] },
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 36, notes: [52, 55, 59, 62] },
];
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79];

export function createAudio() {
  let ctx = null, master, musicBus, ambBus, waveGain, surfGain, fireGain, cricketGain, rainGain = null;
  let noiseBuf = null;
  let on = true, musicOn = true;
  let timer = null;
  let scheduledTo = 0;
  let crackleAt = 0, cricketAt = 0;

  function makeNoise() {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // brown-ish
      d[i] = last * 3.2;
    }
    return buf;
  }
  function noiseSource() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.loopStart = Math.random() * 2;
    return s;
  }
  function lfo(freq, depth, target) {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    noiseBuf = makeNoise();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 2.5);

    ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.55 : 0;
    const musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 2600;
    musicBus.connect(musicLP).connect(master);
    // Echo for the plucked notes.
    const delay = ctx.createDelay(1.5); delay.delayTime.value = BEAT_MS / 1000 * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.36;
    const wet = ctx.createGain(); wet.gain.value = 0.4;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(musicLP);
    musicBus.echo = delay;

    // Rain: a steady hiss, silent until the weather turns.
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    { const r = noiseSource(); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      r.connect(hp).connect(lp).connect(rainGain).connect(ambBus); r.start(); }

    // Sea: a low swell and a brighter surf, each rising and falling slowly.
    waveGain = ctx.createGain(); waveGain.gain.value = 0.3;
    const w1 = noiseSource(); const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 420;
    const swell = ctx.createGain(); swell.gain.value = 0.55;
    w1.connect(lp1).connect(swell).connect(waveGain).connect(ambBus); w1.start();
    lfo(0.085, 0.35, swell.gain);
    surfGain = ctx.createGain(); surfGain.gain.value = 0.12;
    const w2 = noiseSource(); const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1100; bp2.Q.value = 0.5;
    const surf = ctx.createGain(); surf.gain.value = 0.5;
    w2.connect(bp2).connect(surf).connect(surfGain).connect(ambBus); w2.start();
    lfo(0.11, 0.45, surf.gain);
    lfo(0.07, 300, bp2.frequency);

    // Fire: a steady low roar; crackles are added one by one in tick().
    fireGain = ctx.createGain(); fireGain.gain.value = 0.2; fireGain.connect(ambBus);
    const f1 = noiseSource(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.6;
    const roar = ctx.createGain(); roar.gain.value = 0.5;
    f1.connect(bp).connect(roar).connect(fireGain); f1.start();
    lfo(3.1, 0.12, roar.gain);

    cricketGain = ctx.createGain(); cricketGain.gain.value = 0.05; cricketGain.connect(ambBus);

    scheduledTo = Date.now() + 100;
    timer = setInterval(scheduleMusic, 200);
  }

  function crackle() {
    const t0 = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 3 + Math.random() * 4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900 + Math.random() * 2500;
    const g = ctx.createGain();
    const peak = 0.25 + Math.random() * 0.9;
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02 + Math.random() * 0.05);
    s.connect(hp).connect(g).connect(fireGain);
    s.start(t0, Math.random() * 3, 0.1);
  }

  function cricket() {
    const t0 = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 3900 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    const chirps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chirps; i++) {
      const a = t0 + i * 0.075;
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(0.6, a + 0.012);
      g.gain.linearRampToValueAtTime(0, a + 0.045);
    }
    if (pan) o.connect(g).connect(pan).connect(cricketGain); else o.connect(g).connect(cricketGain);
    o.start(t0);
    o.stop(t0 + chirps * 0.075 + 0.1);
  }

  function tone(type, freq, when, attack, hold, release, peak, dest, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + attack + hold + release + 0.05);
  }

  // Schedule every musical event whose wall-clock time falls in the next stretch.
  function scheduleMusic() {
    if (!ctx || ctx.state !== 'running') { scheduledTo = Date.now() + 100; return; }
    const now = Date.now();
    if (scheduledTo < now) scheduledTo = now;
    const until = now + 700;
    const half = BEAT_MS / 2;
    let slot = Math.ceil(scheduledTo / half);
    for (; slot * half < until; slot++) {
      const wall = slot * half;
      const when = ctx.currentTime + (wall - now) / 1000;
      const beat = Math.floor(slot / 2);
      const bar = Math.floor(beat / 4);
      const inBar = slot % 8;
      const chord = CHORDS[Math.floor(bar / 2) % 4];
      const rng = mulberry32(slot * 7919 + 13);
      if (inBar === 0 && bar % 2 === 0) {
        // Pad: the whole chord, slow in and slow out, for two bars.
        const dur = (BAR_MS * 2) / 1000;
        for (const n of chord.notes) {
          tone('triangle', midi(n), when, 1.4, dur - 2.2, 2.4, 0.03, musicBus, -6);
          tone('sine', midi(n), when, 1.8, dur - 2.6, 2.6, 0.028, musicBus, 7);
        }
        tone('sine', midi(chord.bass), when, 0.5, dur - 1.6, 1.6, 0.11, musicBus);
      }
      if (inBar === 0 || (inBar === 5 && rng() < 0.5)) {
        // Soft bass pulse.
        tone('sine', midi(chord.bass + 12), when, 0.02, 0.1, 0.9, 0.05, musicBus);
      }
      // Sparse plucked melody from a five-note scale.
      const p = inBar % 2 === 0 ? 0.34 : 0.16;
      if (rng() < p) {
        const n = SCALE[Math.floor(rng() * SCALE.length)];
        const g = ctx.createGain(); g.gain.value = 1;
        g.connect(musicBus); g.connect(musicBus.echo);
        tone('triangle', midi(n), when, 0.008, 0.02, 1.3, 0.05, g);
        tone('sine', midi(n + 12), when, 0.008, 0.01, 0.6, 0.014, g);
      }
    }
    scheduledTo = until;
  }

  // Called every frame with where the listener is.
  function tick(dt, info) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const near = clamp(1 / (1 + Math.pow(info.fireDist / 5, 2)), 0, 1);
    const firePower = 0.2 + 0.9 * info.heat;
    fireGain.gain.setTargetAtTime(0.02 + 0.42 * near * firePower, t, 0.2);
    waveGain.gain.setTargetAtTime(0.16 + 0.42 * info.shore, t, 0.4);
    surfGain.gain.setTargetAtTime(0.03 + 0.2 * info.shore, t, 0.4);
    cricketGain.gain.setTargetAtTime(0.012 + 0.035 * (1 - info.shore), t, 0.5);
    crackleAt -= dt;
    if (crackleAt <= 0) {
      crackle();
      crackleAt = (0.03 + Math.random() * 0.28) / Math.max(0.25, firePower);
    }
    cricketAt -= dt;
    if (cricketAt <= 0) {
      cricket();
      cricketAt = 0.5 + Math.random() * 1.6;
    }
  }

  function whoosh() {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const s = noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(1800, t0 + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(1.4, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
    s.connect(bp).connect(g).connect(fireGain);
    s.start(t0); s.stop(t0 + 1.7);
  }

  // One footstep. The surface changes the tone: soft sand, dull grass, hollow wood, wet shallows.
  function step(surface, volume = 1) {
    if (!ctx || ctx.state !== 'running' || volume <= 0.02) return;
    const t0 = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let peak = 0.5, dur = 0.09;
    if (surface === 'sand') { f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 500; f.Q.value = 0.6; s.playbackRate.value = 2.2; peak = 0.5; dur = 0.11; }
    else if (surface === 'wood') { f.type = 'bandpass'; f.frequency.value = 190 + Math.random() * 50; f.Q.value = 4; s.playbackRate.value = 1; peak = 2.2; dur = 0.1; }
    else if (surface === 'water') { f.type = 'bandpass'; f.frequency.value = 800 + Math.random() * 600; f.Q.value = 0.9; s.playbackRate.value = 1.6; peak = 0.9; dur = 0.24; }
    else { f.type = 'lowpass'; f.frequency.value = 700 + Math.random() * 250; s.playbackRate.value = 1.4; peak = 0.75; dur = 0.08; }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak * volume, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f).connect(g).connect(ambBus);
    s.start(t0, Math.random() * 3, dur + 0.05);
  }

  // A soft pop, for a marshmallow catching fire or being eaten.
  function pop(freq = 520) {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 1.8, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.07, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.16);
    o.connect(g).connect(ambBus);
    o.start(t0); o.stop(t0 + 0.2);
  }

  // An animal's call, made from a voiced tone through a mouth-shaped filter. `kind` picks the animal.
  function voice(t0, dur, wave, f0, f1, f2, peak, formant, q = 2, vib = 0, vibHz = 5.5, rough = 0) {
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.35);
    o.frequency.linearRampToValueAtTime(f2, t0 + dur);
    if (vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = vibHz; lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = formant; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.12, dur * 0.25));
    g.gain.setValueAtTime(peak, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0006, t0 + dur);
    if (rough) {
      // A fast flutter in loudness: the rasp in a bleat, a bellow or a bray.
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = rough; lg.gain.value = peak * 0.45;
      l.connect(lg).connect(g.gain);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    o.connect(f).connect(g).connect(ambBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function call(kind, volume = 1) {
    if (!ctx || ctx.state !== 'running' || volume <= 0.02) return;
    const t0 = ctx.currentTime + 0.02, v = 0.38 * volume;
    if (kind === 'moo') voice(t0, 1.4, 'sawtooth', 135, 150, 105, v * 0.42, 480, 1.3, 2, 4);
    else if (kind === 'howl') voice(t0, 2.4, 'triangle', 300, 470, 400, v * 0.4, 520, 1.2, 7, 5);
    else if (kind === 'bark') { voice(t0, 0.16, 'sawtooth', 420, 330, 230, v, 900, 1.5); voice(t0 + 0.34, 0.18, 'sawtooth', 440, 340, 220, v, 900, 1.5); }
    else if (kind === 'yip') for (let i = 0; i < 3; i++) voice(t0 + i * 0.23, 0.13, 'sawtooth', 780, 980, 620, v * 0.8, 1500, 1.5);
    else if (kind === 'bleat') voice(t0, 0.75, 'sawtooth', 430, 470, 400, v * 0.5, 1100, 2, 0, 5, 14);
    else if (kind === 'bellow') voice(t0, 1.7, 'sawtooth', 120, 165, 105, v * 0.36, 420, 1.2, 3, 4, 22);
    else if (kind === 'hum') voice(t0, 1.0, 'sine', 300, 350, 320, v * 0.36, 340, 1, 4, 5);
    else if (kind === 'bray') {
      for (let i = 0; i < 2; i++) { voice(t0 + i * 0.95, 0.4, 'sawtooth', 620, 760, 700, v * 0.3, 1400, 2, 0, 5, 30); voice(t0 + 0.42 + i * 0.95, 0.5, 'sawtooth', 210, 180, 150, v * 0.42, 520, 1.5, 0, 5, 24); }
    }
  }

  // An owl: two soft low notes.
  function hoot(volume = 1) {
    if (!ctx || ctx.state !== 'running' || volume <= 0.02) return;
    const t0 = ctx.currentTime + 0.02;
    voice(t0, 0.32, 'sine', 330, 345, 320, 0.2 * volume, 340, 0.8);
    voice(t0 + 0.5, 0.75, 'sine', 335, 330, 290, 0.2 * volume, 330, 0.8);
  }

  function blip(freq = 660) {
    if (!ctx || ctx.state !== 'running') return;
    tone('sine', freq, ctx.currentTime + 0.01, 0.005, 0.02, 0.18, 0.05, ambBus);
  }

  return {
    start,
    tick,
    whoosh,
    blip,
    step,
    pop,
    call,
    hoot,
    setRain(v) { if (ctx && rainGain) rainGain.gain.setTargetAtTime(0.11 * v, ctx.currentTime, 0.8); },
    setSound(v) {
      on = v;
      if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.15);
    },
    setMusic(v) {
      musicOn = v;
      if (ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.55 : 0, ctx.currentTime, 0.3);
    },
    get soundOn() { return on; },
    get musicOn() { return musicOn; },
    get running() { return !!ctx && ctx.state === 'running'; },
  };
}
