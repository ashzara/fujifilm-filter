'use strict';

const sharp = require('sharp');
const { detectScene }    = require('./sceneDetector');
const { neutralize }     = require('./neutralizer');
const { applyFilmGrade } = require('./filmGrade');

const MAX_DIMENSION = 2048;

/**
 * Full pipeline: decode → resize → detect scene → neutralize → film grade → encode
 * @param {Buffer} inputBuffer
 * @param {{ grain?: boolean }} options
 * @returns {{ output: Buffer, sceneType: string, stats: object }}
 */
async function processImage(inputBuffer, options = {}) {
  const { grain = true } = options;

  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .removeAlpha()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = Buffer.from(data);

  const { sceneType, stats } = detectScene(pixels, width, height);
  neutralize(pixels, width, height, sceneType);
  applyFilmGrade(pixels, width, height, sceneType, grain);

  const output = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return { output, sceneType, stats };
}

module.exports = { processImage };
