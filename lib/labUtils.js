'use strict';

// sRGB <-> Linear <-> XYZ (D65) <-> CIELAB

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function rgbToXyz(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750,
    rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041,
  ];
}

const E = 0.008856, K = 7.787;
function labF(t)    { return t > E ? Math.cbrt(t) : K * t + 16 / 116; }
function labFInv(t) { return t > 0.20690 ? t * t * t : (t - 16 / 116) / K; }

function xyzToLab(x, y, z) {
  const fx = labF(x / 0.95047), fy = labF(y), fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  return [
    labFInv(a / 500 + fy) * 0.95047,
    labFInv(fy),
    labFInv(fy - b / 200) * 1.08883,
  ];
}

function xyzToRgb(x, y, z) {
  return [
    linearToSrgb( x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    linearToSrgb(-x * 0.9692660 + y * 1.8760108 + z * 0.0415560),
    linearToSrgb( x * 0.0556434 - y * 0.2040259 + z * 1.0572252),
  ];
}

function rgbToLab(r, g, b) { return xyzToLab(...rgbToXyz(r, g, b)); }
function labToRgb(L, a, b) { return xyzToRgb(...labToXyz(L, a, b)); }

module.exports = { rgbToLab, labToRgb };
