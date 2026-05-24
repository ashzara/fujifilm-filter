'use strict';

const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Smoothstep helper
// ---------------------------------------------------------------------------
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Vignette
// Darkens corners, centred ellipse that respects portrait/landscape.
// strength 0–1 (0.55 = moderate film vignette)
// ---------------------------------------------------------------------------
function applyVignette(pixels, width, height, strength = 0.52) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalise to width-space so portrait/landscape are handled the same
      const nx = (x / width  - 0.5) * 2;   // -1..1
      const ny = (y / height - 0.5) * 2;   // -1..1
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Feathered falloff — clear centre, darkens past 0.55
      const fade = smoothstep(0.50, 1.45, dist);
      const v    = 1 - strength * Math.pow(fade, 1.6);

      const i = (y * width + x) * 3;
      pixels[i]     = Math.max(0, Math.round(pixels[i]     * v));
      pixels[i + 1] = Math.max(0, Math.round(pixels[i + 1] * v));
      pixels[i + 2] = Math.max(0, Math.round(pixels[i + 2] * v));
    }
  }
}

// ---------------------------------------------------------------------------
// Halation
// Light from bright areas bleeds outward on real film, adding a warm glow.
// Implementation: blur the image heavily → composite only the highlights back
// with a slight warm (red) tint at low opacity.
// ---------------------------------------------------------------------------
async function applyHalation(pixels, width, height) {
  // Heavily blurred copy — this is the "spread light" layer
  const blurred = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .blur(11)   // sigma 11 = wide glow radius
    .raw()
    .toBuffer();

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const idx = i * 3;
    const br = blurred[idx], bg = blurred[idx + 1], bb = blurred[idx + 2];

    // Luminance of the blurred pixel
    const lum = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;

    // Glow kicks in above lum 155, maxes at 255 → 0–22% additive blend
    if (lum > 155) {
      const t = (lum - 155) / 100; // 0..1
      const strength = t * 0.22;

      // Warm halation: red channel bleeds most (classic film characteristic)
      pixels[idx]     = Math.min(255, Math.round(pixels[idx]     + br * strength * 1.15));
      pixels[idx + 1] = Math.min(255, Math.round(pixels[idx + 1] + bg * strength * 0.85));
      pixels[idx + 2] = Math.min(255, Math.round(pixels[idx + 2] + bb * strength * 0.70));
    }
  }
}

// ---------------------------------------------------------------------------
// Subtle glow blend
// Blends a softened copy over the image at low opacity to remove the harsh
// over-sharpened quality of phone camera JPEGs — not visible as blur,
// just makes it feel less digital.
// ---------------------------------------------------------------------------
async function applyGlowBlend(pixels, width, height, amount = 0.10) {
  const soft = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .blur(2.5)
    .raw()
    .toBuffer();

  const len = width * height * 3;
  for (let i = 0; i < len; i++) {
    pixels[i] = Math.round(pixels[i] * (1 - amount) + soft[i] * amount);
  }
}

// ---------------------------------------------------------------------------
// Radial lens render — combines center brightness boost + edge vignette
// in one pass. Creates the subtle "flashlight / subject spotlight" quality
// common in film: center is slightly more exposed, edges fall off naturally.
// ---------------------------------------------------------------------------
function applyRadialLens(pixels, width, height, boostStrength = 0.10, vigStrength = 0.52) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x / width  - 0.5) * 2;  // -1..1
      const ny = (y / height - 0.5) * 2;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Center boost: Gaussian peak at dist=0, fades to 1.0 by dist≈1
      const boost = 1 + boostStrength * Math.exp(-dist * dist * 2.2);

      // Vignette: kicks in past dist=0.50, darkens corners
      const fade = smoothstep(0.50, 1.45, dist);
      const vig  = 1 - vigStrength * Math.pow(fade, 1.6);

      const scale = boost * Math.max(0, vig);
      const i = (y * width + x) * 3;
      pixels[i]     = Math.min(255, Math.max(0, Math.round(pixels[i]     * scale)));
      pixels[i + 1] = Math.min(255, Math.max(0, Math.round(pixels[i + 1] * scale)));
      pixels[i + 2] = Math.min(255, Math.max(0, Math.round(pixels[i + 2] * scale)));
    }
  }
}

// ---------------------------------------------------------------------------
// Public: run all post-processing in order
// ---------------------------------------------------------------------------
async function postProcess(pixels, width, height, sceneType) {
  // 1. Halation — bright areas glow outward (warm film bleed)
  await applyHalation(pixels, width, height);

  // 2. Subtle glow blend — softens phone-camera sharpness
  await applyGlowBlend(pixels, width, height, 0.10);

  // 3. Radial lens: center brightness boost + vignette in one pass
  //    Flash gets stronger vignette, daylight gets a gentle center lift
  const vigStrength   = sceneType === 'flash' ? 0.65 : 0.54;
  const boostStrength = sceneType === 'lowlight' ? 0.07 : 0.10;
  applyRadialLens(pixels, width, height, boostStrength, vigStrength);

  return pixels;
}

module.exports = { postProcess };
