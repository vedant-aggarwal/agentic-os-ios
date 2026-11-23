// Stills of the pet for the app to show until its scene has drawn (assets/pet/*.png), one per sadness level.
// Rebuild the scene first (bun build.mjs), then: node posters.cjs [path to playwright-core]
// The framing matches components/Smiley's canvas: the pet's box plus PET_PAD around it, at 100 pt, 3x.
const path = require('path');
const { chromium } = require(process.argv[2] || 'playwright-core');
const S = 100, PAD = { l: 0.34, r: 0.34, t: 0.95, b: 0.2 };
const W = Math.round(S * (1 + PAD.l + PAD.r)), H = Math.round(S * (1 + PAD.t + PAD.b));
const page0 = require('url').pathToFileURL(path.resolve(__dirname, 'dist/index.html')).href;
const out = path.resolve(__dirname, '../assets/pet');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3 });
  for (const sad of [0, 0.3, 0.6, 1]) {
    await page.goto(`${page0}?nopanel&bg=none&still&sad=${sad}&box=${S * PAD.l},${S * PAD.t},${S}`);
    await page.waitForFunction(() => window.petDev);
    await page.evaluate(() => { window.petDev.manual(); window.petDev.run(3000); });
    await page.screenshot({ path: path.join(out, `pet-sad${String(sad).replace('.', '')}.png`), omitBackground: true });
  }
  await browser.close();
  console.log(`posters: ${W}x${H} pt at 3x in ${out}`);
})();
