'use strict';

/**
 * Scene-aware auto-neutralization (in-place on a flat RGB Buffer).
 * Step 1: weighted gray-world white balance
 * Step 2: scene-specific tone curve (shadow lift, midtone exposure, highlight rolloff)
 */

function computeGrayWorldScales(pixels, total) {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = 0; i < total; i++) {
    const r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
    // Exclude highly saturated pixels so a dominant colour subject doesn't skew WB
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 0 && (max - min) / max > 0.65) continue;
    sumR += r; sumG += g; sumB += b; count++;
  }
  if (count === 0) return { scaleR: 1, scaleG: 1, scaleB: 1 };
  const meanR = sumR / count, meanG = sumG / count, meanB = sumB / count;
  const target = (meanR + meanG + meanB) / 3;
  const clamp = (s) => Math.max(0.65, Math.min(1.35, s));
  return { scaleR: clamp(target / meanR), scaleG: clamp(target / meanG), scaleB: clamp(target / meanB) };
}

function applyWB(pixels, total, sr, sg, sb) {
  for (let i = 0; i < total; i++) {
    pixels[i * 3]     = Math.min(255, Math.round(pixels[i * 3]     * sr));
    pixels[i * 3 + 1] = Math.min(255, Math.round(pixels[i * 3 + 1] * sg));
    pixels[i * 3 + 2] = Math.min(255, Math.round(pixels[i * 3 + 2] * sb));
  }
}

function buildToneCurve(liftShadows, targetMidtone, highlightCeiling) {
  const lut = new Uint8Array(256);
  const liftN = liftShadows / 255;
  const gamma = Math.log(targetMidtone / 255) / Math.log(128 / 255);
  for (let i = 0; i < 256; i++) {
    const lifted = liftN + (i / 255) * (1 - liftN);
    let out = Math.pow(lifted, gamma);
    const ceil = highlightCeiling / 255;
    if (out > 0.75) {
      const t = (out - 0.75) / 0.25;
      const ts = t * t * (3 - 2 * t); // smoothstep
      out = 0.75 + (ceil - 0.75) * ts;
    } else if (out > ceil) {
      out = ceil;
    }
    lut[i] = Math.max(0, Math.min(255, Math.round(out * 255)));
  }
  return lut;
}

// [liftShadows, targetMidtone, highlightCeiling] per scene
const CURVES = {
  flash:       [  0, 128, 245 ],
  lowlight:    [  8, 100, 240 ],
  daylight:    [ 12, 135, 238 ],
  overexposed: [ 10, 105, 228 ],
};

function neutralize(pixels, width, height, sceneType) {
  const total = width * height;
  const { scaleR, scaleG, scaleB } = computeGrayWorldScales(pixels, total);

  // Flash: half-strength WB to keep the lit-subject look intact
  const blend = sceneType === 'flash' ? 0.5 : 1.0;
  applyWB(pixels, total,
    1 + (scaleR - 1) * blend,
    1 + (scaleG - 1) * blend,
    1 + (scaleB - 1) * blend,
  );

  const [lift, mid, ceil] = CURVES[sceneType] || CURVES.daylight;
  const lut = buildToneCurve(lift, mid, ceil);
  const len = total * 3;
  for (let i = 0; i < len; i++) pixels[i] = lut[pixels[i]];

  return pixels;
}

module.exports = { neutralize };
