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
// Classic Chrome is a COOL, MUTED film — not warm:
//   Highlights → neutral-white to very slight teal (b* slightly negative)
//   Midtones   → near-neutral, only the faintest warmth for skin (a* ≈ +0.4)
//   Shadows    → cool grey (b* negative, a* slightly negative)
//   Reds/oranges are MUTED, blues/skies are PRESERVED.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIGS = {
  flash: {
    blackLift: 0,  contrast: 0.35,
    //          a*(green↔red)   b*(blue↔yellow)
    hA: -0.8,  hB: -1.5,   // highlights: slight cool-teal, never warm
    mA:  0.4,  mB:  0.3,   // midtones: barely warm (skin only)
    sA: -0.5,  sB: -1.0,   // shadows: cool grey
    desat: 0.16, warmDesat: 0.10, grain: 8,
  },
  lowlight: {
    blackLift: 6,  contrast: 0.40,
    hA: -1.2,  hB: -2.0,   // cooler / more cinematic highlights
    mA:  0.3,  mB:  0.2,
    sA: -0.6,  sB: -1.2,
    desat: 0.20, warmDesat: 0.08, grain: 11,
  },
  daylight: {
    blackLift: 11, contrast: 0.40,
    hA: -0.8,  hB: -1.2,   // keep sky blue — only ever so slightly teal
    mA:  0.5,  mB:  0.4,
    sA: -0.4,  sB: -0.8,
    desat: 0.14, warmDesat: 0.10, grain: 4,
  },
  overexposed: {
    blackLift: 8,  contrast: 0.40,
    hA: -0.6,  hB: -1.0,
    mA:  0.4,  mB:  0.3,
    sA: -0.5,  sB: -0.9,
    desat: 0.15, warmDesat: 0.09, grain: 5,
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
