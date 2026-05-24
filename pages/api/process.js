import { processImage } from '../../lib/imageProcessor';
import formidable from 'formidable';
import fs from 'fs';
import os from 'os';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = formidable({ maxFileSize: 25 * 1024 * 1024, uploadDir: os.tmpdir(), keepExtensions: true });

  let files;
  try {
    [, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ error: 'Upload failed', message: err.message });
  }

  const file = Array.isArray(files.image) ? files.image[0] : files.image;
  if (!file) return res.status(400).json({ error: 'No image field in request' });

  try {
    const inputBuffer = fs.readFileSync(file.filepath);
    const { output, sceneType, stats } = await processImage(inputBuffer);
    fs.unlink(file.filepath, () => {});
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Scene-Type', sceneType);
    res.setHeader('X-Scene-Stats', JSON.stringify(stats));
    return res.send(output);
  } catch (err) {
    try { fs.unlinkSync(file.filepath); } catch {}
    console.error('[process]', err);
    return res.status(500).json({ error: 'Processing failed', message: err.message });
  }
}
