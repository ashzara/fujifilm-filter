'use strict';

const { rgbToLab, labToRgb } = require('./labUtils');

// ---------------------------------------------------------------------------
// Tonal helpers
// ---------------------------------------------------------------------------

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const highlightW = (L) => smoothstep(58, 90, L);
const shadowW    = (L) => 1 - smoothstep(12, 52, L);
const midtoneW   = (L) => smoothstep(12, 48, L) * (1 - smoothstep(58, 88, L));

function softCurve(L, strength) {
  const x = L / 100;
  return Math.max(0, Math.min(100, (x + strength * 0.18 * x * (1 - x) * (2 * x - 1)) * 100));
}

// ---------------------------------------------------------------------------
// Per-hue chroma table — "muted but not desaturated"
//
// Film doesn't globally desaturate. It renders each hue with its own
// characteristic chroma compression. These are small (3–15%) per-hue pulls
// that collectively give the Fujifilm colour science feel without washing
// anything out. Skin (orange band ~30-55°) is protected.
//
// LCh hue degrees (atan2 of b*,a* converted to 0-360):
//   0°  = red/magenta    90°  = yellow
//   180°= green/cyan     270° = blue
// ---------------------------------------------------------------------------
function getHueChromaScale(hDeg) {
  const d = ((hDeg % 360) + 360) % 360;

  if (d < 25  || d >= 340) return 0.92; // reds/magentas
  if (d < 55)              return 0.97; // red-orange / skin tone  ← barely touched
  if (d < 80)              return 0.93; // oranges / warm yellow
  if (d < 110)             return 0.88; // yellows → yellow-greens
  if (d < 165)             return 0.84; // greens  ← Classic Chrome suppresses these most
  if (d < 205)             return 0.90; // teals / cyans
  if (d < 255)             return 0.97; // blues   ← sky stays rich, barely touched
  if (d < 295)             return 0.92; // blue-violets
  return 0.90;                          // purples
}

// ---------------------------------------------------------------------------
// Seeded PRNG for deterministic per-pixel grain
// ---------------------------------------------------------------------------
function prng(seed) {
  seed = (seed ^ (seed >>> 15)) * 0x9e3779b9 | 0;
  seed = (seed ^ (seed >>> 13)) * 0x6c62272e | 0;
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Scene configs — colour shifts only, no global desat
// The per-hue table above handles the "muted" quality.
// ---------------------------------------------------------------------------
const CONFIGS = {
  flash: {
    blackLift: 0,  contrast: 0.60,
    hA: -0.3, hB: -0.5,   // highlights: whisper of cool
    mA:  0.7, mB:  0.4,   // midtones: warm skin
    sA: -0.4, sB: -0.7,   // shadows: cool grey
    grain: 7,
  },
  lowlight: {
    blackLift: 4,  contrast: 0.55,
    hA: -0.5, hB: -0.9,
    mA:  0.5, mB:  0.3,
    sA: -0.5, sB: -0.9,
    grain: 10,
  },
  daylight: {
    blackLift: 5,  contrast: 0.62,
    hA: -0.3, hB: -0.4,   // sky stays blue, not teal-washed
    mA:  0.7, mB:  0.4,   // skin warmth
    sA: -0.3, sB: -0.5,
    grain: 4,
  },
  overexposed: {
    blackLift: 4,  contrast: 0.58,
    hA: -0.3, hB: -0.4,
    mA:  0.6, mB:  0.3,
    sA: -0.3, sB: -0.6,
    grain: 5,
  },
};

// ---------------------------------------------------------------------------
// Main grade
// ---------------------------------------------------------------------------
function applyFilmGrade(pixels, width, height, sceneType, addGrain = true) {
  const total = width * height;
  const c = CONFIGS[sceneType] || CONFIGS.daylight;
  const TWO_PI = 2 * Math.PI;

  for (let i = 0; i < total; i++) {
    let [L, a, lb] = rgbToLab(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]);

    // 1. Lift black point — grey blacks, never brown
    L = c.blackLift + L * (100 - c.blackLift) / 100;

    // 2. Soft contrast curve (maintains shadow structure)
    L = softCurve(L, c.contrast);

    // 3. Per-zone LAB colour shifts (tonal colour character)
    const hw = highlightW(L), sw = shadowW(L), mw = midtoneW(L);
    a  += c.hA * hw + c.mA * mw + c.sA * sw;
    lb += c.hB * hw + c.mB * mw + c.sB * sw;

    // 4. Per-hue chroma compression — "muted but not desaturated"
    //    Each hue loses a small fixed % of chroma based on the table above.
    //    Hue angle is preserved exactly (no colour shift, just slight quieting).
    //    Skin (~30-55°) is nearly untouched; blues (~210-255°) are nearly untouched.
    //    Greens are the most compressed, matching Classic Chrome's rendering.
    const chroma = Math.sqrt(a * a + lb * lb);
    if (chroma > 1.0) {
      const hRad = Math.atan2(lb, a);
      const hDeg = (hRad * 180 / Math.PI + 360) % 360;
      const scale = getHueChromaScale(hDeg);
      a  *= scale;
      lb *= scale;
    }

    // 5. Back to RGB
    const [nr, ng, nb] = labToRgb(L, a, lb);

    // 6. Luminance grain — heavier in shadows, lighter in highlights
    if (addGrain && c.grain > 0) {
      const amp   = c.grain * (1 + 0.7 * (1 - L / 100));
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
