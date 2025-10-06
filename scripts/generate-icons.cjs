const fs = require('fs');
const path = require('path');
const svg2img = require('svg2img');

const svgPath = path.join(__dirname, '../public/logo-light.svg');
const outputPath = path.join(__dirname, '../public/icon.png');

const svgBuffer = fs.readFileSync(svgPath);

console.log('Converting SVG to PNG...');

svg2img(svgBuffer, { width: 1024, height: 1024 }, (error, buffer) => {
  if (error) {
    console.error('Error converting SVG:', error);
    process.exit(1);
  }

  fs.writeFileSync(outputPath, buffer);
  console.log('✓ Created public/icon.png (1024x1024)');
  console.log('\nelectron-builder will automatically generate:');
  console.log('  - icon.ico for Windows');
  console.log('  - icon.icns for macOS');
  console.log('  - icon.png for Linux');
  console.log('\nRun "npm run build" to generate the platform-specific icons.');
});
