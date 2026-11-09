/**
 * 把 assets/icon.svg 渲成多尺寸 PNG 与 Windows ICO。
 *
 * 为什么走 playwright 而不是 resvg/sharp：这两样都要新依赖，而 playwright 是
 * 本机已有（米粒宣传片那套），Chromium 的 SVG 渲染质量也最稳（渐变、圆角、
 * 半透明描边都按 CSS 规范来）。渲染一次 6 个尺寸不到 2 秒。
 *
 * 用法：
 *   node scripts/make-icon.mjs                       # 用 assets/icon.svg，写 assets/
 *   node scripts/make-icon.mjs --svg .tmp/a.svg --out .tmp/icons --no-ico
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// playwright 不在本项目的 dependencies 里（本项目硬约束：dependencies 只有
// react/react-dom，devDependencies 只有 vite 两件）—— 它已经装在隔壁的
// 宣传片工程里，直接借，不重复下 100MB 浏览器。
function loadPlaywright() {
  const roots = [
    process.cwd(),
    'E:/ai项目/mjw-fast/',
    'E:/ai项目/mjw-promo-video/',
  ];
  for (const r of roots) {
    try {
      return createRequire(r)('playwright');
    } catch {}
  }
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {}
  console.error('找不到 playwright：它应该在 E:/ai项目/mjw-fast 或 mjw-promo-video 里');
  process.exit(1);
}
const { chromium } = loadPlaywright();

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const svgPath = opt('svg', 'assets/icon.svg');
const outDir = opt('out', 'assets');
const wantIco = !args.includes('--no-ico');
const SIZES = [256, 128, 64, 48, 32, 16];

if (!fs.existsSync(svgPath)) {
  console.error(`找不到 ${svgPath}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const svg = fs.readFileSync(svgPath, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 256, height: 256 } });
await page.setContent(
  `<!doctype html><meta charset="utf-8">
   <style>html,body{margin:0;background:transparent}
          #w{width:256px;height:256px}#w svg{width:256px;height:256px;display:block}</style>
   <div id="w">${svg}</div>`,
  { waitUntil: 'load' }
);

for (const s of SIZES) {
  const png = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: 256, height: 256 },
    scale: 'css',
  });
  // 用 Chromium 的缩放保证小尺寸也是矢量重采样，而不是先 256 再暴力缩（后者边缘会糊）
  fs.writeFileSync(path.join(outDir, `icon-${s}.png`), png);
  if (s === 256) fs.writeFileSync(path.join(outDir, 'icon.png'), png);
  if (s !== 256) {
    await page.setViewportSize({ width: s, height: s });
    await page.evaluate((n) => {
      const w = document.getElementById('w');
      w.style.width = w.style.height = n + 'px';
      const el = w.querySelector('svg');
      if (el) { el.style.width = n + 'px'; el.style.height = n + 'px'; }
    }, s);
    const small = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s }, scale: 'css' });
    fs.writeFileSync(path.join(outDir, `icon-${s}.png`), small);
    await page.setViewportSize({ width: 256, height: 256 });
    await page.evaluate(() => {
      const w = document.getElementById('w');
      w.style.width = w.style.height = '256px';
      const el = w.querySelector('svg');
      if (el) { el.style.width = el.style.height = '256px'; }
    });
  }
  console.log(`  ✓ icon-${s}.png`);
}
await browser.close();

if (wantIco) {
  // 手写 ICO：Vista 之后接受每个尺寸直接塞 PNG（不转 BMP），
  // 这样不依赖 PIL/sharp，只用 node 自带的 zlib 之外什么也不用（PNG 本就是现成的）。
  const entries = SIZES.map((s) => ({ size: s, png: fs.readFileSync(path.join(outDir, `icon-${s}.png`)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o); // 0 表示 256
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([header, dir, ...entries.map((e) => e.png)]));
  console.log(`  ✓ icon.ico（${SIZES.join(' / ')}）`);
}
