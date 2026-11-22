// Renders public/icons/favicon.svg into the PNG sizes needed by Android/iOS.
// Usage: npm run icons   (needs Playwright + Chromium available)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/favicon.svg', import.meta.url), 'utf8');
const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, round: true },
  { file: 'icon-512.png', size: 512, pad: 0, round: true },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12, round: false },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, round: false },
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const t of targets) {
  let body = svg;
  if (!t.round) body = body.replace(/rx="[\d.]+"/, 'rx="0"'); // square tile for maskable / Apple icons
  const inner = t.size * (1 - t.pad * 2);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.round ? 'transparent' : '#0C1E29'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
     <div style="width:${inner}px;height:${inner}px">${body.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: t.round });
  console.log('wrote', t.file);
}
await browser.close();
