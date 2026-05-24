'use strict';

/**
 * Classifies the shooting condition from a raw RGB pixel buffer.
 * Returns one of: 'flash' | 'lowlight' | 'daylight' | 'overexposed'
 */
function detectScene(pixels, width, height) {
  const total = width * height;
  let sumL = 0, shadowCount = 0, highlightCount = 0;

  for (let i = 0; i < total; i++) {
    const lum = 0.2126 * pixels[i * 3] + 0.7152 * pixels[i * 3 + 1] + 0.0722 * pixels[i * 3 + 2];
    sumL += lum;
    if (lum < 30)  shadowCount++;
    if (lum > 220) highlightCount++;
  }

  const meanL            = sumL / total;
  const shadowFraction   = shadowCount / total;
  const highlightFraction = highlightCount / total;

  // Variance of 32×32 block means — high = flash (dark bg + bright subject)
  const bs = 32;
  const blockMeans = [];
  for (let by = 0; by + bs <= height; by += bs) {
    for (let bx = 0; bx + bs <= width; bx += bs) {
      let s = 0;
      for (let dy = 0; dy < bs; dy++) {
        const row = (by + dy) * width;
        for (let dx = 0; dx < bs; dx++) {
          const idx = (row + bx + dx) * 3;
          s += 0.2126 * pixels[idx] + 0.7152 * pixels[idx + 1] + 0.0722 * pixels[idx + 2];
        }
      }
      blockMeans.push(s / (bs * bs));
    }
  }
  const bmMean = blockMeans.reduce((a, b) => a + b, 0) / blockMeans.length;
  const bmVariance = blockMeans.reduce((s, v) => s + (v - bmMean) ** 2, 0) / blockMeans.length;

  let sceneType;
  if (highlightFraction > 0.15) {
    sceneType = 'overexposed';
  } else if (shadowFraction > 0.28 && highlightFraction > 0.07 && bmVariance > 1800) {
    sceneType = 'flash';
  } else if (meanL < 80 && highlightFraction < 0.04) {
    sceneType = 'lowlight';
  } else {
    sceneType = 'daylight';
  }

  return { sceneType, stats: { meanL, shadowFraction, highlightFraction, bmVariance } };
}

module.exports = { detectScene };
