// Renders scene.html (1080x1920) frame by frame and encodes amna.mp4 with a synthesized beat.
// Usage: node render.js [fps]   — needs Playwright + ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = Number(process.argv[2] || 30);
const OUT = path.join(__dirname, 'amna.mp4');
const WAV = path.join(__dirname, '.music.wav');

function music(dur, sr = 44100) {
  const n = Math.floor(dur * sr), L = new Float32Array(n), R = new Float32Array(n);
  const beat = 0.5, roots = [110, 87.31, 130.81, 98];             // A F C G
  const hits = [4.2, 8.4, 11.6, 15.0, 21.6, 27.4, 31.6];           // whooshes on scene changes
  let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let lp = 0, kickPh = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, tb = t % beat, bar = Math.floor(t / 2) % 4, f = roots[bar];
    const end = Math.min(1, (dur - t) / 2.5), start = Math.min(1, t / 0.4);
    const outro = t > 31.6 ? 0.55 : 1;
    // kick
    kickPh += 2 * Math.PI * (45 + 160 * Math.exp(-28 * tb)) / sr;
    let v = 0.85 * Math.sin(kickPh) * Math.exp(-9 * tb) * outro;
    // hats on offbeats
    const th = (t + 0.25) % beat; const nz = rnd();
    v += 0.10 * nz * Math.exp(-70 * th);
    // clap on 2 & 4
    const tc = (t + 0.5) % 1.0; v += 0.16 * rnd() * Math.exp(-28 * tc) * outro;
    // bass (pumping 8ths, zero at boundaries)
    const e8 = Math.pow(Math.sin(Math.PI * (t % 0.25) / 0.25), 2);
    v += 0.22 * Math.sin(2 * Math.PI * f * t) * e8 * outro;
    // pad
    const pe = Math.pow(Math.sin(Math.PI * (t % 2) / 2), 0.6);
    const pad = [2, 2.52, 3, 4].reduce((a, m) => a + Math.sin(2 * Math.PI * f * m * t + m), 0) * 0.035 * pe;
    // whoosh
    let w = 0; for (const h of hits) { const d = t - h + 0.35; if (d > 0 && d < 0.6) w += Math.sin(Math.PI * d / 0.6) ** 2 * 0.5; }
    lp += (Math.min(0.9, 0.05 + w) ) * (nz - lp);
    v += lp * w * 0.9;
    const g = start * end * 0.55;
    L[i] = (v + pad * 1.1) * g; R[i] = (v + pad * 0.9) * g;
  }
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(L[i] * 1.3))) * 32000), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(R[i] * 1.3))) * 32000), 46 + i * 4);
  }
  fs.writeFileSync(WAV, buf);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(__dirname, 'scene.html') + '?render');
  await page.evaluate(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);
  music(duration);

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', WAV,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderFrame(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) process.stdout.write(`frame ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  await browser.close();
  fs.unlinkSync(WAV);
  console.log('done →', OUT);
})();
