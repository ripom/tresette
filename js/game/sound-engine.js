// ═══════════════════════════════════════════════════════════════
//  SOUND ENGINE — AudioContext + pre-generated AudioBuffers
// ═══════════════════════════════════════════════════════════════

// Card back image embedded directly in the HTML as a GIF data URI.
// Set CSS variable so card backs can reference it
const ACTIVE_CARD_BACK_IMG = "img/card-back.png";
document.documentElement.style.setProperty('--card-back', 'url("' + ACTIVE_CARD_BACK_IMG + '")');

const CARD_DATA = {
  "bastoni_1": "img/bastoni_1.png",
  "bastoni_10": "img/bastoni_10.png",
  "bastoni_2": "img/bastoni_2.png",
  "bastoni_3": "img/bastoni_3.png",
  "bastoni_4": "img/bastoni_4.png",
  "bastoni_5": "img/bastoni_5.png",
  "bastoni_6": "img/bastoni_6.png",
  "bastoni_7": "img/bastoni_7.png",
  "bastoni_8": "img/bastoni_8.png",
  "bastoni_9": "img/bastoni_9.png",
  "coppe_1": "img/coppe_1.png",
  "coppe_10": "img/coppe_10.png",
  "coppe_2": "img/coppe_2.png",
  "coppe_3": "img/coppe_3.png",
  "coppe_4": "img/coppe_4.png",
  "coppe_5": "img/coppe_5.png",
  "coppe_6": "img/coppe_6.png",
  "coppe_7": "img/coppe_7.png",
  "coppe_8": "img/coppe_8.png",
  "coppe_9": "img/coppe_9.png",
  "denari_1": "img/denari_1.png",
  "denari_10": "img/denari_10.png",
  "denari_2": "img/denari_2.png",
  "denari_3": "img/denari_3.png",
  "denari_4": "img/denari_4.png",
  "denari_5": "img/denari_5.png",
  "denari_6": "img/denari_6.png",
  "denari_7": "img/denari_7.png",
  "denari_8": "img/denari_8.png",
  "denari_9": "img/denari_9.png",
  "spade_1": "img/spade_1.png",
  "spade_10": "img/spade_10.png",
  "spade_2": "img/spade_2.png",
  "spade_3": "img/spade_3.png",
  "spade_4": "img/spade_4.png",
  "spade_5": "img/spade_5.png",
  "spade_6": "img/spade_6.png",
  "spade_7": "img/spade_7.png",
  "spade_8": "img/spade_8.png",
  "spade_9": "img/spade_9.png"
};

const AUDIO_SR = 44100; // CD quality sample rate for richness
let audioCtx = null;
let masterGain = null;
let reverbNode = null;
let audioBuffers = {};
let volumeLevel = 0.6;
let muted = false;

// ─── Improved synthesis helpers for realistic, deep sounds ───
function noise() { return Math.random() * 2 - 1; }

function genEnv(n, attack, decay, sustain, release, sustainLevel) {
  // ADSR envelope, all in samples
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v;
    if (i < attack) v = i / attack;
    else if (i < attack + decay) v = 1 - (1 - sustainLevel) * ((i - attack) / decay);
    else if (i < n - release) v = sustainLevel;
    else v = sustainLevel * (1 - (i - (n - release)) / release);
    out[i] = Math.max(0, v);
  }
  return out;
}

function genSamples(freq, dur, type, vol) {
  const n = Math.floor(AUDIO_SR * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / AUDIO_SR;
    const env = vol * Math.max(0, 1 - t / dur);
    const phase = ((freq * t) % 1 + 1) % 1;
    let w;
    if (type === 'sine') w = Math.sin(2 * Math.PI * freq * t);
    else if (type === 'square') w = phase < 0.5 ? 1 : -1;
    else if (type === 'sawtooth') w = 2 * phase - 1;
    else if (type === 'triangle') w = 4 * Math.abs(phase - 0.5) - 1;
    else w = Math.sin(2 * Math.PI * freq * t);
    out[i] = w * env;
  }
  return out;
}

function mixTones(tones) {
  const totalDur = Math.max(...tones.map(t => (t.delay||0) + t.dur)) + 0.05;
  const n = Math.floor(AUDIO_SR * totalDur);
  const out = new Float32Array(n);
  for (const t of tones) {
    if (t.freq <= 0) continue;
    const s = genSamples(t.freq, t.dur, t.type, t.vol);
    const off = Math.floor((t.delay||0) * AUDIO_SR);
    for (let i = 0; i < s.length && off+i < n; i++) out[off+i] += s[i];
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

// Convolution reverb impulse response — creates "room" feel
function createReverbIR(duration, decay) {
  const len = Math.floor(AUDIO_SR * duration);
  const buf = audioCtx.createBuffer(2, len, AUDIO_SR);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// ─── Advanced voice synthesis helpers (used by emote sounds) ───
function _glottal(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.4) return 3*p*(1 - p/0.4);
  if (p < 0.5) return 3*0.4*(1 - (p-0.4)/0.1);
  return 0;
}
function _makeFormant(freq, bw) {
  const r = Math.exp(-Math.PI * bw / AUDIO_SR);
  const c = 2 * r * Math.cos(2 * Math.PI * freq / AUDIO_SR);
  return { r:r, c:c, y1:0, y2:0 };
}
function _filterFormant(f, x) {
  const y = x + f.c * f.y1 - f.r * f.r * f.y2;
  f.y2 = f.y1; f.y1 = y; return y;
}
function _sndRng(seed) { seed[0] = (seed[0] * 16807 + 7) % 2147483647; return (seed[0] / 2147483647) * 2 - 1; }

function _mixSampleLayers(layers) {
  let total = 0;
  for (let i = 0; i < layers.length; i++) total = Math.max(total, layers[i].offset + layers[i].samples.length);
  const out = new Float32Array(total || 1);
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    for (let j = 0; j < layer.samples.length; j++) out[layer.offset + j] += layer.samples[j];
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0.98) for (let i = 0; i < out.length; i++) out[i] /= peak / 0.98;
  return out;
}

function _makeEmoteDing(cfg) {
  const dur = cfg.dur || 0.33;
  const n = Math.floor(AUDIO_SR * dur);
  const out = new Float32Array(n);
  const seed = [cfg.seed || 1];
  const base = cfg.freq || 900;
  const partialA = cfg.partialA || 2.06;
  const partialB = cfg.partialB || 3.22;
  const air = cfg.air || 0.05;
  const bend = cfg.bend || 0.06;
  const sparkle = cfg.sparkle || 2300;
  const warmth = cfg.warmth || 0.15;
  let lp = 0;

  for (let i = 0; i < n; i++) {
    const t = i / AUDIO_SR;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-t * (cfg.decay || 11.5));
    const freq = base * (1 + bend * Math.exp(-t * 16));
    const main = Math.sin(2 * Math.PI * freq * t);
    const overtone1 = Math.sin(2 * Math.PI * freq * partialA * t) * Math.exp(-t * 13);
    const overtone2 = Math.sin(2 * Math.PI * freq * partialB * t) * Math.exp(-t * 18);
    lp += 0.18 * (_sndRng(seed) - lp);
    const hit = lp * air * Math.exp(-t * 42);
    const sheen = Math.sin(2 * Math.PI * sparkle * t) * 0.04 * Math.exp(-t * 24);
    out[i] = (main * 0.80 + overtone1 * 0.28 + overtone2 * 0.14 + hit + sheen + Math.sin(2 * Math.PI * (freq * 0.5) * t) * warmth) * env;
  }

  const d1 = Math.floor(AUDIO_SR * (cfg.ref1 || 0.016));
  const d2 = Math.floor(AUDIO_SR * (cfg.ref2 || 0.031));
  for (let i = d2; i < n; i++) {
    out[i] += out[i - d1] * (cfg.refGain1 || 0.16);
    out[i] += out[i - d2] * (cfg.refGain2 || 0.08);
  }

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = out[i] / peak * (cfg.gain || 0.82);
  return out;
}

// Pre-generate sound samples
const RAW_SOUNDS = {
  // ─── Card slapped on table: short sharp THWACK ───
  // A real card slap is ~50-80ms total: instant attack, broadband noise snap,
  // low-frequency table thud, very fast decay. No whoosh, no flutter — just SLAP.
  cardPlay: (() => {
    const dur = 0.08;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    const rng = (seed) => { seed[0] = (seed[0] * 16807 + 7) % 2147483647; return (seed[0] / 2147483647) * 2 - 1; };
    const s1 = [[37]], s2 = [[91]], s3 = [[173]];
    let lp = 0;

    for (let i = 0; i < n; i++) {
      const t = i / AUDIO_SR;
      let sample = 0;

      // Attack: near-instant (<0.3ms)
      const att = Math.min(1.0, i / (AUDIO_SR * 0.0003));

      // 1) Sharp noise snap — the card hitting flat on the surface
      //    Very fast decay (~8ms), full broadband
      const snapEnv = att * Math.exp(-t * 180) * 0.85;
      sample += rng(s1) * snapEnv;

      // 2) Mid-frequency body — the "papery" character of the card
      //    Filtered noise, slightly slower decay
      lp += 0.22 * (rng(s2) - lp);
      const bodyEnv = att * Math.exp(-t * 90) * 0.5;
      sample += lp * bodyEnv;

      // 3) Low table thud — the wood absorbing the hit
      //    A couple of damped sine modes
      const thudEnv = att * Math.exp(-t * 60) * 0.45;
      const thud = Math.sin(2 * Math.PI * 110 * t) * 0.6
                 + Math.sin(2 * Math.PI * 200 * t) * 0.3
                 + Math.sin(2 * Math.PI * 65 * t) * 0.25;
      sample += thud * thudEnv;

      out[i] = sample;
    }

    // Normalize
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0) for (let i = 0; i < n; i++) out[i] = out[i] / peak * 0.92;
    return out;
  })(),

  // ─── Card slide: gentle swoosh with pitch sweep ───
  cardSlide: (() => {
    const dur = 0.1;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    let lp = 0;
    let seed = [55];
    const rng = (s) => { s[0] = (s[0] * 48271 + 3) % 2147483647; return (s[0] / 2147483647) * 2 - 1; };
    for (let i = 0; i < n; i++) {
      const t = i / AUDIO_SR;
      const env = Math.sin(Math.PI * t / dur) * 0.35;
      const cutoff = 0.05 + 0.15 * (t / dur);
      lp += cutoff * (rng(seed) - lp);
      out[i] = lp * env;
    }
    return out;
  })(),

  // ─── Trick won: rich two-note bell chime with overtones ───
  trickWon: (() => {
    const dur = 0.6;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    const notes = [
      {freq: 523.25, start: 0.00, vol: 0.40},
      {freq: 659.25, start: 0.12, vol: 0.38}
    ];
    for (const note of notes) {
      const off = Math.floor(note.start * AUDIO_SR);
      for (let i = 0; i + off < n; i++) {
        const t = i / AUDIO_SR;
        const env = Math.exp(-t * 5) * note.vol;
        const w = Math.sin(2*Math.PI*note.freq*t)
          + 0.5 * Math.sin(2*Math.PI*note.freq*2.02*t) * Math.exp(-t*8)
          + 0.25 * Math.sin(2*Math.PI*note.freq*3.01*t) * Math.exp(-t*12)
          + 0.12 * Math.sin(2*Math.PI*note.freq*4.97*t) * Math.exp(-t*16);
        out[i + off] += w * env;
      }
    }
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    return out;
  })(),

  // ─── Win fanfare: triumphant ascending chord ───
  win: (() => {
    const dur = 1.2;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    const notes = [
      {freq: 261.63, start: 0.00, dur: 0.30, vol: 0.35},
      {freq: 329.63, start: 0.15, dur: 0.30, vol: 0.35},
      {freq: 392.00, start: 0.30, dur: 0.30, vol: 0.35},
      {freq: 523.25, start: 0.45, dur: 0.50, vol: 0.40}
    ];
    for (const note of notes) {
      const off = Math.floor(note.start * AUDIO_SR);
      const len = Math.floor(note.dur * AUDIO_SR);
      for (let i = 0; i < len && i + off < n; i++) {
        const t = i / AUDIO_SR;
        const env = note.vol * Math.sin(Math.PI * t / note.dur);
        const w = Math.sin(2*Math.PI*note.freq*t)
          + 0.4 * Math.sin(2*Math.PI*note.freq*2*t) * Math.exp(-t*4)
          + 0.15 * Math.sin(2*Math.PI*note.freq*3*t) * Math.exp(-t*6);
        out[i + off] += w * env;
      }
    }
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    return out;
  })(),

  // ─── Lose: melancholic descending minor chord ───
  lose: (() => {
    const dur = 1.0;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    const notes = [
      {freq: 392.00, start: 0.00, dur: 0.35, vol: 0.35},
      {freq: 311.13, start: 0.20, dur: 0.35, vol: 0.33},
      {freq: 261.63, start: 0.40, dur: 0.45, vol: 0.35}
    ];
    for (const note of notes) {
      const off = Math.floor(note.start * AUDIO_SR);
      const len = Math.floor(note.dur * AUDIO_SR);
      for (let i = 0; i < len && i + off < n; i++) {
        const t = i / AUDIO_SR;
        const env = note.vol * Math.exp(-t * 3.5);
        const w = Math.sin(2*Math.PI*note.freq*t)
          + 0.3 * Math.sin(2*Math.PI*note.freq*2*t) * Math.exp(-t*5);
        out[i + off] += w * env;
      }
    }
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    return out;
  })(),

  // ─── Start game: bright ascending arpeggio ───
  start: (() => {
    const dur = 0.7;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    const notes = [
      {freq: 329.63, start: 0.00, dur: 0.15, vol: 0.35},
      {freq: 392.00, start: 0.12, dur: 0.15, vol: 0.35},
      {freq: 493.88, start: 0.24, dur: 0.25, vol: 0.40}
    ];
    for (const note of notes) {
      const off = Math.floor(note.start * AUDIO_SR);
      const len = Math.floor(note.dur * AUDIO_SR);
      for (let i = 0; i < len && i + off < n; i++) {
        const t = i / AUDIO_SR;
        const env = note.vol * Math.exp(-t * 4);
        const w = Math.sin(2*Math.PI*note.freq*t)
          + 0.35 * Math.sin(2*Math.PI*note.freq*2*t) * Math.exp(-t*6)
          + 0.15 * Math.sin(2*Math.PI*note.freq*3*t) * Math.exp(-t*10);
        out[i + off] += w * env;
      }
    }
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    return out;
  })(),

  // ─── Scardone: dramatic descending brass/trombone with tremolo ───
  scardone: (() => {
    const dur = 1.0;
    const n = Math.floor(AUDIO_SR * dur);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / AUDIO_SR;
      const freq = 300 * Math.exp(-t * 1.8) + 80;
      const env = Math.min(1, t / 0.02) * Math.exp(-t * 1.5) * 0.55;
      const trem = 1 + 0.15 * Math.sin(2 * Math.PI * 6 * t);
      let w = 0;
      for (let h = 1; h <= 6; h++) w += Math.sin(2 * Math.PI * freq * h * t) / h * Math.exp(-t * h * 0.8);
      const buzzSeed = Math.sin(t * 12345.6789) * 43758.5453;
      const buzz = (buzzSeed - Math.floor(buzzSeed)) * 2 - 1;
      out[i] = (w * 0.7 + buzz * 0.08) * env * trem;
    }
    for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
    return out;
  })(),

  // ─── Emote sounds — short bell dings with soft 3D depth ───
  emoteHappy: _makeEmoteDing({ freq: 930, sparkle: 2550, bend: 0.08, decay: 12.2, refGain1: 0.18, refGain2: 0.09, seed: 11, gain: 0.82 }),
  emoteLaugh: _mixSampleLayers([
    { offset: 0, samples: _makeEmoteDing({ freq: 820, sparkle: 2400, bend: 0.06, decay: 12.0, seed: 21, gain: 0.76 }) },
    { offset: Math.floor(AUDIO_SR * 0.09), samples: _makeEmoteDing({ freq: 980, sparkle: 2600, bend: 0.05, decay: 12.5, seed: 23, gain: 0.64 }) }
  ]),
  emoteSad: _makeEmoteDing({ freq: 620, sparkle: 1650, bend: -0.04, decay: 9.8, ref1: 0.020, ref2: 0.041, refGain1: 0.12, refGain2: 0.06, warmth: 0.22, air: 0.035, seed: 31, gain: 0.78 }),
  emoteThumbsUp: _makeEmoteDing({ freq: 880, sparkle: 2250, bend: 0.04, decay: 11.0, refGain1: 0.14, refGain2: 0.08, warmth: 0.18, seed: 41, gain: 0.80 }),
  emoteThumbsDown: _makeEmoteDing({ freq: 560, sparkle: 1500, bend: -0.06, decay: 9.2, refGain1: 0.11, refGain2: 0.05, warmth: 0.26, air: 0.03, seed: 51, gain: 0.79 }),
  emoteApplause: _mixSampleLayers([
    { offset: 0, samples: _makeEmoteDing({ freq: 860, sparkle: 2300, bend: 0.05, decay: 10.8, seed: 61, gain: 0.64 }) },
    { offset: Math.floor(AUDIO_SR * 0.08), samples: _makeEmoteDing({ freq: 980, sparkle: 2550, bend: 0.04, decay: 11.4, seed: 63, gain: 0.58 }) },
    { offset: Math.floor(AUDIO_SR * 0.16), samples: _makeEmoteDing({ freq: 1120, sparkle: 2750, bend: 0.03, decay: 12.0, seed: 65, gain: 0.52 }) }
  ]),
  emoteBored: _mixSampleLayers([
    { offset: 0, samples: _makeEmoteDing({ freq: 610, sparkle: 1600, bend: -0.05, decay: 9.0, refGain1: 0.10, refGain2: 0.05, warmth: 0.25, air: 0.028, seed: 71, gain: 0.72 }) },
    { offset: Math.floor(AUDIO_SR * 0.11), samples: _makeEmoteDing({ freq: 500, sparkle: 1450, bend: -0.06, decay: 8.4, refGain1: 0.08, refGain2: 0.04, warmth: 0.28, air: 0.025, seed: 73, gain: 0.58 }) }
  ]),
  emoteAngry: _mixSampleLayers([
    { offset: 0, samples: _makeEmoteDing({ freq: 380, sparkle: 1200, bend: -0.10, decay: 7.5, refGain1: 0.20, refGain2: 0.12, warmth: 0.35, air: 0.02, seed: 81, gain: 0.88 }) },
    { offset: Math.floor(AUDIO_SR * 0.06), samples: _makeEmoteDing({ freq: 320, sparkle: 1050, bend: -0.12, decay: 6.8, refGain1: 0.22, refGain2: 0.14, warmth: 0.38, air: 0.018, seed: 83, gain: 0.80 }) }
  ]),
  emoteBye: _mixSampleLayers([
    { offset: 0, samples: _makeEmoteDing({ freq: 780, sparkle: 2100, bend: 0.03, decay: 11.5, refGain1: 0.15, refGain2: 0.08, warmth: 0.15, seed: 91, gain: 0.70 }) },
    { offset: Math.floor(AUDIO_SR * 0.12), samples: _makeEmoteDing({ freq: 660, sparkle: 1900, bend: -0.02, decay: 10.0, refGain1: 0.12, refGain2: 0.06, warmth: 0.18, seed: 93, gain: 0.60 }) }
  ]),
};



function samplesToBuffer(samples) {
  const buf = audioCtx.createBuffer(1, samples.length, AUDIO_SR);
  buf.getChannelData(0).set(samples);
  return buf;
}

function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volumeLevel;
    // Create convolution reverb for room depth
    try {
      reverbNode = audioCtx.createConvolver();
      reverbNode.buffer = createReverbIR(1.5, 3.0);
      var reverbGain = audioCtx.createGain();
      reverbGain.gain.value = 0.15; // subtle reverb
      reverbNode.connect(reverbGain);
      reverbGain.connect(audioCtx.destination);
      masterGain.connect(audioCtx.destination); // dry
      masterGain.connect(reverbNode);            // wet (reverb)
    } catch(e) {
      masterGain.connect(audioCtx.destination);
    }
    for (const [name, raw] of Object.entries(RAW_SOUNDS)) {
      audioBuffers[name] = samplesToBuffer(raw);
    }
    audioCtx.resume();
  } catch(e) {}
}

function playBuffer(name) {
  if (!audioCtx || !audioBuffers[name] || muted) return;
  if (game && game.phase === 'done') return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = audioBuffers[name];
    src.connect(masterGain);
    src.start(0);
  } catch(e) {}
}



function setVolume(v) {
  volumeLevel = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = volumeLevel;
  document.getElementById('vol-pct').textContent = Math.round(volumeLevel * 100) + '%';
  document.getElementById('vol-toggle').textContent = volumeLevel === 0 ? '🔇' : '🔊';
  muted = volumeLevel === 0;
}

document.getElementById('vol-slider').addEventListener('input', function() {
  setVolume(this.value / 100);
});
document.getElementById('vol-toggle').addEventListener('click', function() {
  if (muted) {
    document.getElementById('vol-slider').value = 60;
    setVolume(0.6);
  } else {
    document.getElementById('vol-slider').value = 0;
    setVolume(0);
  }
});

function sndCardPlay()  { playBuffer('cardPlay'); }
function sndCardSlide() { playBuffer('cardSlide'); }
function sndTrickWon()  { playBuffer('trickWon'); }
function sndWin()       { playBuffer('win'); }
function sndLose()      { playBuffer('lose'); }
function sndStart()     { playBuffer('start'); }
function sndScardone()  { /* removed */ }

function showScardone() {
  /* removed */
}
