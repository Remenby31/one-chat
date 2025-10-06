const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const iconPath = path.join(__dirname, '../public/icon.png');
const outputPath = path.join(__dirname, '../public/icon.ico');

console.log('Generating icon.ico for Windows...');

pngToIco.default(iconPath)
  .then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log('✓ Created public/icon.ico');
  })
  .catch(err => {
    console.error('Error generating .ico:', err);
    process.exit(1);
  });
