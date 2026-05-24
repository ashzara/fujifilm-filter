'use strict';

/**
 * Scene-aware auto-neutralization (in-place on a flat RGB Buffer).
 * Step 1: weighted gray-world white balance — conservative, avoids turning blue scenes sepia
 * Step 2: scene-specific tone curve — barely touches exposure, lets the film grade do the look
 */

function computeGrayWorldScales(pixels, total) {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let i = 0; i < total; i++) {
    const r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
    // Exclude highly saturated pixels (coloured walls, sky, clothing)
    // so they don't skew the neutral estimate
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 0 && (max - min) / max > 0.55) continue;
    sumR += r; sumG += g; sumB += b; count++;
  }
  if (count === 0) return { scaleR: 1, scaleG: 1, scaleB: 1 };

  const meanR = sumR / count, meanG = sumG / count, meanB = sumB / count;
  const target = (meanR + meanG + meanB) / 3;

  // Tight clamp: max ±12% per channel.
  // Previously was ±35% — that's what turned blue-sky shots sepia.
  const clamp = (s) => Math.max(0.88, Math.min(1.12, s));
  return {
    scaleR: clamp(target / meanR),
    scaleG: clamp(target / meanG),
    scaleB: clamp(target / meanB),
  };
}

function applyWB(pixels, total, sr, sg, sb) {
  for (let i = 0; i < total; i++) {
    pixels[i * 3]     = Math.min(255, Math.round(pixels[i * 3]     * sr));
    pixels[i * 3 + 1] = Math.min(255, Math.round(pixels[i * 3 + 1] * sg));
    pixels[i * 3 + 2] = Math.min(255, Math.round(pixels[i * 3 + 2] * sb));
  }
}

function buildToneCurve(liftShadows, targetMidtone, highlightCeiling) {
  const lut   = new Uint8Array(256);
  const liftN = liftShadows / 255;
  const gamma = Math.log(targetMidtone / 255) / Math.log(128 / 255);
  for (let i = 0; i < 256; i++) {
    const lifted = liftN + (i / 255) * (1 - liftN);
    let out = Math.pow(lifted, gamma);
    const ceil = highlightCeiling / 255;
    if (out > 0.75) {
      const t  = (out - 0.75) / 0.25;
      const ts = t * t * (3 - 2 * t);
      out = 0.75 + (ceil - 0.75) * ts;
    } else if (out > ceil) {
      out = ceil;
    }
    lut[i] = Math.max(0, Math.min(255, Math.round(out * 255)));
  }
  return lut;
}

// [liftShadows, targetMidtone, highlightCeiling]
// Neutralizer is intentionally minimal — just corrects obvious WB errors and clips.
// The film grade owns all the aesthetic lifting.
const CURVES = {
  flash:       [  0, 122, 248 ],
  lowlight:    [  2,  98, 243 ],
  daylight:    [  3, 119, 243 ],
  overexposed: [  4, 106, 230 ],
};

function neutralize(pixels, width, height, sceneType) {
  const total = width * height;
  const { scaleR, scaleG, scaleB } = computeGrayWorldScales(pixels, total);

  // Apply WB at 60% blend — cameras already do a decent job.
  // 60% of ±12% = max ±7% actual correction per channel.
  // This is strong enough to fix obvious colour casts but not enough
  // to turn a legitimately blue or cool scene warm/sepia.
  const blend = sceneType === 'flash' ? 0.35 : 0.60;
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
