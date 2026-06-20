/**
 * generate-icons.js
 *
 * Generates PNG icons for the PWA manifest from the SVG favicon.
 *
 * Requirements: npm install --save-dev sharp
 * Usage: node scripts/generate-icons.js
 * Output: frontend/public/icons/{icon-180,icon-192,icon-512}.png
 *
 * Run this once after any logo change, then commit the generated PNGs.
 * The generated icons are committed to the repo — not generated at build time —
 * so they're available immediately on GitHub Pages without a build step.
 *
 * If sharp is not available (e.g. CI environment), you can also:
 *   1. Open frontend/public/favicon.svg in a browser
 *   2. Screenshot at 512x512
 *   3. Export as PNG and resize to 192x192 and 180x180 copies
 *   4. Save to frontend/public/icons/
 */

import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = join(__dirname, '../frontend/public/icons')
const SVG_PATH  = join(__dirname, '../frontend/public/favicon.svg')

mkdirSync(ICONS_DIR, { recursive: true })

const SIZES = [
  { name: 'icon-180.png',  size: 180 },  // Apple touch icon
  { name: 'icon-192.png',  size: 192 },  // Standard PWA icon
  { name: 'icon-512.png',  size: 512 },  // Splash / install prompt
]

async function generateIcons() {
  let sharp
  try {
    const mod = await import('sharp')
    sharp = mod.default
  } catch {
    console.error(
      '✗ sharp not installed. Run: npm install --save-dev sharp\n' +
      '  Or generate icons manually from frontend/public/favicon.svg'
    )
    process.exit(1)
  }

  const svgBuffer = readFileSync(SVG_PATH)
  console.log(`Generating PWA icons from ${SVG_PATH}…`)

  for (const { name, size } of SIZES) {
    const outputPath = join(ICONS_DIR, name)
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath)
    console.log(`  ✓ ${name} (${size}×${size})`)
  }

  console.log(`\nIcons written to ${ICONS_DIR}`)
  console.log('Commit these files — they are served as static assets.')
}

generateIcons()
