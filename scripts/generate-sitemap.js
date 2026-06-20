/**
 * generate-sitemap.js
 *
 * Generates sitemap.xml from vehicles_summary.json at build time.
 * Run via: node scripts/generate-sitemap.js
 * Or add to package.json scripts: "sitemap": "node scripts/generate-sitemap.js"
 *
 * Output: frontend/public/sitemap.xml
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env.VITE_BASE_URL || 'https://YOUR_USERNAME.github.io/evsense'

// Static routes always included
const STATIC_ROUTES = [
  { path: '/',                           priority: '1.0', changefreq: 'weekly'  },
  { path: '/browse',                     priority: '0.9', changefreq: 'weekly'  },
  { path: '/compare',                    priority: '0.7', changefreq: 'monthly' },
  { path: '/tools/charging-cost-chart',  priority: '0.7', changefreq: 'monthly' },
  { path: '/about',                      priority: '0.5', changefreq: 'monthly' },
]

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSitemap(vehicles) {
  const today = new Date().toISOString().split('T')[0]

  const staticEntries = STATIC_ROUTES.map(route => `
  <url>
    <loc>${escapeXml(BASE_URL + route.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`).join('')

  // Vehicle detail pages — exclude coming soon (no stable content to index)
  const vehicleEntries = vehicles
    .filter(v => !v.comingSoon && v.id)
    .map(v => {
      const lastmod = v.lastUpdated
        ? v.lastUpdated.split('T')[0]
        : today
      return `
  <url>
    <loc>${escapeXml(`${BASE_URL}/vehicles/${v.id}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
    }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${vehicleEntries}
</urlset>
`
}

// Load vehicles summary
const summaryPath = join(__dirname, '../frontend/public/data/vehicles_summary.json')
let vehicles = []
try {
  vehicles = JSON.parse(readFileSync(summaryPath, 'utf-8'))
  console.log(`Loaded ${vehicles.length} vehicles from vehicles_summary.json`)
} catch (err) {
  console.warn('Could not load vehicles_summary.json — sitemap will only include static routes')
}

const sitemap = buildSitemap(vehicles)
const outputPath = join(__dirname, '../frontend/public/sitemap.xml')
writeFileSync(outputPath, sitemap, 'utf-8')

console.log(`✓ sitemap.xml written to ${outputPath}`)
console.log(`  ${STATIC_ROUTES.length} static routes + ${vehicles.filter(v => !v.comingSoon).length} vehicle pages`)
