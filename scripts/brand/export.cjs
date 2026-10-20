/* Regenerate every brand derivative from the committed native SVG sources.
 * Requires sharp and Python with Pillow. Both are available in the Codex runtime.
 * Overrides: AZURIA_SHARP_MODULE=/absolute/path/to/sharp and AZURIA_PYTHON=python.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sharp = require(process.env.AZURIA_SHARP_MODULE || 'sharp');

const root = path.resolve(__dirname, '../..');
const brand = path.join(root, 'assets/brand');
const icons = path.join(root, 'electron/build/icons');
const read = (name) => fs.readFile(path.join(brand, name), 'utf8');
const render = (svg, file, width, height) => sharp(Buffer.from(svg), { density: 384 })
  .resize(width, height).png().toFile(file);
const monochrome = (svg, color) => svg.replaceAll('#CBD5E1', color)
  .replaceAll('#2563EB', color).replaceAll('#0B1220', color);

async function main() {
  const symbol = await read('symbol.svg');
  const app = await read('app-icon.svg');
  const wordmark = await read('wordmark.svg');
  const recording = await read('recording-indicator.svg');
  for (const [name, color] of [['dark', '#0B1220'], ['light', '#FFFFFF']]) {
    await fs.writeFile(path.join(brand, `symbol-${name}.svg`), monochrome(symbol, color));
    await fs.writeFile(path.join(brand, `wordmark-${name}.svg`), monochrome(wordmark, color));
    await render(monochrome(symbol, color), path.join(brand, `symbol-${name}.png`), 2048, 2048);
  }
  await fs.copyFile(path.join(brand, 'app-icon.svg'), path.join(root, 'electron/public/favicon.svg'));
  await fs.copyFile(path.join(brand, 'symbol.svg'), path.join(root, 'docs/logo.svg'));
  await render(symbol, path.join(brand, 'symbol.png'), 2048, 2048);
  await render(wordmark, path.join(brand, 'wordmark.png'), 3072);
  await render(app, path.join(brand, 'app-icon-1024.png'), 1024, 1024);
  await render(app, path.join(icons, 'icon.png'), 512, 512);
  await render(app, path.join(icons, '32x32.png'), 32, 32);
  await render(recording, path.join(icons, 'tray-recording.png'), 32, 32);
  await render(symbol, path.join(root, 'docs/logo.png'), 512, 512);
  await render(symbol, path.join(root, 'docs/logo-256.png'), 256, 256);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  for (const size of sizes) {
    await render(app, path.join(brand, `app-icon-${size}.png`), size, size);
  }
  const containers = spawnSync(process.env.AZURIA_PYTHON || 'python',
    [path.join(__dirname, 'export-containers.py')], { encoding: 'utf8', shell: false });
  if (containers.status !== 0) throw new Error(containers.stderr || containers.stdout);
  process.stdout.write(containers.stdout);

  const previewBase = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">
    <rect width="1440" height="960" fill="#F8FAFC"/>
    <rect x="720" width="720" height="960" fill="#0B1220"/>
    <text x="56" y="62" font-family="Segoe UI, sans-serif" font-size="22" fill="#475569">Azúria Voice · original vector identity</text>
    <text x="778" y="62" font-family="Segoe UI, sans-serif" font-size="22" fill="#CBD5E1">Silver #CBD5E1 · Blue #2563EB</text>
    <text x="56" y="745" font-family="Segoe UI, sans-serif" font-size="20" fill="#475569">Windows icon sizes (actual pixels)</text>
    <text x="778" y="745" font-family="Segoe UI, sans-serif" font-size="20" fill="#CBD5E1">One color · light and dark</text>
  </svg>`;
  const composite = [];
  async function place(svg, left, top, width, height) {
    const input = await sharp(Buffer.from(svg), { density: 192 }).resize(width, height).png().toBuffer();
    composite.push({ input, left, top });
  }
  await place(symbol, 172, 110, 376, 376);
  await place(symbol, 892, 110, 376, 376);
  await place(wordmark, 52, 528, 616);
  const lightWordmark = wordmark.replace('id="wordmark" fill="#0B1220"', 'id="wordmark" fill="#CBD5E1"');
  await place(lightWordmark, 772, 528, 616);
  let x = 56;
  for (const size of [16, 24, 32, 48, 64, 128]) {
    await place(app, x, 790 + Math.round((128-size)/2), size, size);
    x += size + 24;
  }
  await place(monochrome(symbol, '#0B1220'), 570, 790, 128, 128);
  await place(monochrome(symbol, '#FFFFFF'), 792, 780, 144, 144);
  await place(app, 1020, 760, 176, 176);
  await sharp(Buffer.from(previewBase)).composite(composite).png()
    .toFile(path.join(brand, 'preview.png'));
  console.log('Brand SVG, transparent PNG, platform icons, and preview exported.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
