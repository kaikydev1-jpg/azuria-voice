/* GitHub social preview from the existing outlined logo. No fonts or network. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.AZURIA_SHARP_MODULE || 'sharp');

async function main() {
  const brand = path.resolve(__dirname, '../../assets/brand');
  const wordmark = (await fs.readFile(path.join(brand, 'wordmark.svg'), 'utf8'))
    .replace('width="1412" height="256"', 'x="120" y="226" width="1040" height="188"')
    .replace('id="wordmark" fill="#0B1220"', 'id="wordmark" fill="#CBD5E1"');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <title>Azúria Voice</title>
  <rect width="1280" height="640" fill="#0B1220"/>
  ${wordmark}
</svg>\n`;
  await fs.writeFile(path.join(brand, 'social-preview.svg'), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(brand, 'social-preview.png'));
  console.log('Exported GitHub preview: 1280 × 640.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
