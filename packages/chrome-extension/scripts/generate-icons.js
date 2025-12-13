/**
 * Generate PNG icons for the LocalPGP extension
 * Uses Node.js canvas to create simple lock+key logo icons
 */

const fs = require('fs');
const path = require('path');

// Simple PNG generation without external dependencies
// Creates a basic colored square with emoji-style icon

function createIconDataUrl(size) {
  // Create a simple SVG that can be used as data URL
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Background circle -->
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.47}" fill="#4a90d9"/>
  
  <!-- Lock body -->
  <rect x="${size*0.31}" y="${size*0.45}" width="${size*0.38}" height="${size*0.31}" rx="${size*0.03}" fill="#ffd54f"/>
  
  <!-- Lock shackle -->
  <path d="M${size*0.39} ${size*0.45} V${size*0.35} C${size*0.39} ${size*0.25} ${size*0.5} ${size*0.22} ${size*0.5} ${size*0.22} C${size*0.5} ${size*0.22} ${size*0.61} ${size*0.25} ${size*0.61} ${size*0.35} V${size*0.45}" 
        fill="none" stroke="#ffd54f" stroke-width="${size*0.06}" stroke-linecap="round"/>
  
  <!-- Keyhole -->
  <circle cx="${size*0.5}" cy="${size*0.58}" r="${size*0.05}" fill="#4a90d9"/>
  <rect x="${size*0.48}" y="${size*0.58}" width="${size*0.05}" height="${size*0.11}" fill="#4a90d9"/>
  
  <!-- Key icon (small, bottom right) -->
  <g transform="translate(${size*0.59}, ${size*0.66}) rotate(-45)">
    <circle cx="0" cy="0" r="${size*0.06}" fill="none" stroke="#fff" stroke-width="${size*0.025}"/>
    <line x1="${size*0.06}" y1="0" x2="${size*0.17}" y2="0" stroke="#fff" stroke-width="${size*0.025}"/>
    <line x1="${size*0.14}" y1="0" x2="${size*0.14}" y2="${size*0.04}" stroke="#fff" stroke-width="${size*0.025}"/>
    <line x1="${size*0.17}" y1="0" x2="${size*0.17}" y2="${size*0.04}" stroke="#fff" stroke-width="${size*0.025}"/>
  </g>
</svg>`;
  
  return svg;
}

// Generate icons for different sizes
const sizes = [16, 32, 48, 128];
const chromeIconsDir = path.join(__dirname, '..', 'src', 'icons');
const firefoxIconsDir = path.join(__dirname, '..', '..', 'firefox-extension', 'src', 'icons');

// Ensure directories exist
[chromeIconsDir, firefoxIconsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

sizes.forEach(size => {
  const svg = createIconDataUrl(size);
  
  // Save SVG files (browsers can use SVG icons or we can convert to PNG)
  fs.writeFileSync(path.join(chromeIconsDir, `icon${size}.svg`), svg);
  fs.writeFileSync(path.join(firefoxIconsDir, `icon${size}.svg`), svg);
  
  console.log(`Generated ${size}x${size} icons`);
});

console.log('Icon generation complete!');
console.log('Note: For PNG conversion, use a tool like Inkscape or online converter.');
