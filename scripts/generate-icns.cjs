const fs = require('fs');
const path = require('path');
const { createICNS, BILINEAR } = require('png2icons');

const iconPath = path.join(__dirname, '../public/icon.png');
const outputPath = path.join(__dirname, '../public/icon.icns');

console.log('Generating icon.icns for macOS...');

const input = fs.readFileSync(iconPath);

try {
  const icns = createICNS(input, BILINEAR, 0);
  fs.writeFileSync(outputPath, icns);
  console.log('✓ Created public/icon.icns');
} catch (err) {
  console.error('Error generating .icns:', err);
  process.exit(1);
}
