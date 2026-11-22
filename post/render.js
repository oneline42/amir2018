// Renders post.html to a 1080×1920 PNG (story / reels size).
// Usage: node render.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('file://' + path.join(__dirname, 'post.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(__dirname, 'khalif-cars-post.png') });
  await browser.close();
  console.log('saved khalif-cars-post.png');
})();
