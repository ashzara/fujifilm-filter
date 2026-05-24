'use strict';

const { rgbToLab, labToRgb } = require('./labUtils');

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const highlightW = (L) => smoothstep(55, 88, L);
const shadowW    = (L) => 1 - smoothstep(15, 55, L);
const midtoneW   = (L) => smoothstep(15, 50, L) * (1 - smoothstep(55, 85, L));

// Gentle S-curve in L* — soft contrast, not punchy
function softCurve(L, strength) {
  const x = L / 100;
  return Math.max(0, Math.min(100, (x + strength * 0.18 * x * (1 - x) * (2 * x - 1)) * 100));
}

// Seeded PRNG for deterministic per-pixel grain
function prng(seed) {
  seed = (seed ^ (seed >>> 15)) * 0x9e3779b9 | 0;
  seed = (seed ^ (seed >>> 13)) * 0x6c62272e | 0;
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

// ─── Classic Chrome color science ────────────────────────────────────────────
// a* axis: negative = green/teal, positive = red/magenta
// b* axis: negative = blue/cool,  positive = yellow/warm
//
// Classic Chrome: cool-neutral overall, muted reds, preserved blues.
// The "faded" quality is subtle — lifted blacks but real shadow structure.
// DO NOT stack with an aggressive neutralizer lift (washed look).
// ─────────────────────────────────────────────────────────────────────────────
const CONFIGS = {
  flash: {
    blackLift: 0,  contrast: 0.60,
    hA: -0.5,  hB: -0.8,   // very slight cool in highlights
    mA:  0.4,  mB:  0.3,   // skin warmth only
    sA: -0.4,  sB: -0.8,   // cool grey shadows
    desat: 0.10, warmDesat: 0.07, grain: 7,
  },
  lowlight: {
    blackLift: 4,  contrast: 0.55,
    hA: -0.8,  hB: -1.2,
    mA:  0.3,  mB:  0.2,
    sA: -0.5,  sB: -1.0,
    desat: 0.13, warmDesat: 0.06, grain: 10,
  },
  daylight: {
    blackLift: 5,  contrast: 0.60,  // real shadow structure, not pancake flat
    hA: -0.5,  hB: -0.6,   // sky stays blue — only a whisper of teal at top
    mA:  0.4,  mB:  0.3,
    sA: -0.3,  sB: -0.6,
    desat: 0.09, warmDesat: 0.07, grain: 4,
  },
  overexposed: {
    blackLift: 4,  contrast: 0.58,
    hA: -0.4,  hB: -0.6,
    mA:  0.4,  mB:  0.3,
    sA: -0.4,  sB: -0.7,
    desat: 0.10, warmDesat: 0.07, grain: 5,
  },
};

function applyFilmGrade(pixels, width, height, sceneType, addGrain = true) {
  const total = width * height;
  const c = CONFIGS[sceneType] || CONFIGS.daylight;

  for (let i = 0; i < total; i++) {
    let [L, a, lb] = rgbToLab(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]);

    // 1. Lift black point (faded / matte look)
    L = c.blackLift + L * (100 - c.blackLift) / 100;

    // 2. Soft contrast curve
    L = softCurve(L, c.contrast);

    // 3. Per-zone LAB color shifts
    const hw = highlightW(L), sw = shadowW(L), mw = midtoneW(L);
    a  += c.hA * hw + c.mA * mw + c.sA * sw;
    lb += c.hB * hw + c.mB * mw + c.sB * sw;

    // 4. Selective desaturation
    //    Classic Chrome mutes warm tones (reds, oranges) and preserves cool ones (blues, teals).
    //    warmness = 1 when hue is fully red/orange (positive a*), 0 when green/blue.
    const chroma = Math.sqrt(a * a + lb * lb);
    if (chroma > 0.5) {
      const warmness = Math.max(0, a / chroma); // 0=cool/green → 1=red/warm
      const scale = 1 - c.desat - warmness * c.warmDesat;
      a *= scale; lb *= scale;
    }

    // 5. Back to RGB
    const [nr, ng, nb] = labToRgb(L, a, lb);

    // 6. Luminance grain — heavier in shadows like real film
    if (addGrain && c.grain > 0) {
      const amp = c.grain * (1 + 0.8 * (1 - L / 100));
      const noise = (prng(i * 1664525 + 1013904223) - 0.5) * amp;
      pixels[i * 3]     = Math.max(0, Math.min(255, Math.round(nr + noise)));
      pixels[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(ng + noise * 0.95)));
      pixels[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(nb + noise * 0.90)));
    } else {
      pixels[i * 3] = nr; pixels[i * 3 + 1] = ng; pixels[i * 3 + 2] = nb;
    }
  }

  return pixels;
}

module.exports = { applyFilmGrade };
