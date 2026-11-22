// Renders scene.html frame by frame and encodes an MP4 with a soft ambient soundtrack.
// Usage: node render.js [fps]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const FPS = Number(process.argv[2] || 30);
const OUT = path.join(__dirname, 'elegant.mp4');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.join(__dirname, 'scene.html') + '?render');
  await page.evaluate(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);

  // Ambient pad: A-major-7 chord of soft sines with slow swells, plus echo.
  const pad = [220, 277.18, 329.63, 415.30, 554.37]
    .map((f, i) => `${(0.11 - i * 0.012).toFixed(3)}*sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${(0.11 + i * 0.03).toFixed(2)}*t))`)
    .join('+');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-t', String(duration), '-i', `aevalsrc=${pad}:s=48000`,
    '-filter_complex',
    `[1:a]aecho=0.8:0.7:420|780:0.35|0.22,lowpass=f=2400,afade=t=in:d=2.5,afade=t=out:st=${duration - 3}:d=3,volume=1.4[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', OUT,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let i = 0; i < frames; i++) {
    const b64 = await page.evaluate(t => {
      window.renderFrame(t);
      return document.getElementById('c').toDataURL('image/jpeg', 0.96).split(',')[1];
    }, i / FPS);
    if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  await browser.close();
  console.log('done →', OUT);
})();
