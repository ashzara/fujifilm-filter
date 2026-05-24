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

const CONFIGS = {
  flash: {
    blackLift: 0, contrast: 0.35,
    hA: -2.0, hB:  5.0, mA:  1.5, mB:  2.5, sA: -0.8, sB: -1.5,
    desat: 0.14, coolDesat: 0.12, grain: 8,
  },
  lowlight: {
    blackLift: 6, contrast: 0.45,
    hA: -3.0, hB:  2.0, mA:  0.8, mB:  1.2, sA: -0.8, sB: -1.5,
    desat: 0.20, coolDesat: 0.14, grain: 11,
  },
  daylight: {
    blackLift: 11, contrast: 0.45,
    hA: -2.0, hB:  6.5, mA:  2.0, mB:  3.5, sA: -0.8, sB: -1.5,
    desat: 0.11, coolDesat: 0.10, grain: 4,
  },
  overexposed: {
    blackLift: 8, contrast: 0.45,
    hA: -1.0, hB:  3.0, mA:  1.5, mB:  2.5, sA: -0.8, sB: -1.5,
    desat: 0.14, coolDesat: 0.12, grain: 5,
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

    // 4. Selective desaturation — blues/greens muted more than warm tones
    const chroma = Math.sqrt(a * a + lb * lb);
    if (chroma > 0.5) {
      const coolness = Math.max(0, -a / chroma);
      const scale = 1 - c.desat - coolness * c.coolDesat;
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
