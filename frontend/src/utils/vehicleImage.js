/**
 * vehicleImage.js — one place to resolve a vehicle's photo URL.
 *
 * Priority:
 *   1. EDMUNDS_IMG — curated Edmunds range-test thumbnails (matched by model),
 *      copied into /data/edmunds. Consistent studio side-profiles that suit the
 *      dark image discs across Browse / Compare / recommendations.
 *   2. imagesCdnBase — the app's image pipeline (400/800/1200w.webp).
 *   3. raw imageUrl.
 * Returns null when none exist so callers can render a styled placeholder.
 */

// Vehicle id → Edmunds thumbnail in /public/data/edmunds (model-matched).
const EDMUNDS_IMG = {
  'tesla-model3-2026': '/data/edmunds/tesla-model3-2026.avif',
  'tesla-modely-2026': '/data/edmunds/tesla-modely-2026.avif',
  'tesla-models-2026': '/data/edmunds/tesla-models-2026.avif',
  'tesla-modelx-2026': '/data/edmunds/tesla-modelx-2026.avif',
  'tesla-cybertruck-2026': '/data/edmunds/tesla-cybertruck-2026.avif',
  'hyundai-ioniq-5-2026': '/data/edmunds/hyundai-ioniq-5-2026.avif',
  'hyundai-ioniq-6-2026': '/data/edmunds/hyundai-ioniq-6-2026.avif',
  'hyundai-ioniq-9-2026': '/data/edmunds/hyundai-ioniq-9-2026.webp',
  'kia-ev6-2026': '/data/edmunds/kia-ev6-2026.avif',
  'kia-ev9-2026': '/data/edmunds/kia-ev9-2026.avif',
  'ford-mustang-mach-e-2026': '/data/edmunds/ford-mustang-mach-e-2026.avif',
  'ford-f-150-lightning-2026': '/data/edmunds/ford-f-150-lightning-2026.avif',
  'chevrolet-equinox-ev-2026': '/data/edmunds/chevrolet-equinox-ev-2026.avif',
  'chevrolet-blazer-ev-2026': '/data/edmunds/chevrolet-blazer-ev-2026.avif',
  'chevrolet-silverado-ev-2026': '/data/edmunds/chevrolet-silverado-ev-2026.avif',
  'lucid-air-2026': '/data/edmunds/lucid-air-2026.avif',
  'lucid-gravity-2026': '/data/edmunds/lucid-gravity-2026.avif',
  'bmw-i4-2026': '/data/edmunds/bmw-i4-2026.avif',
  'bmw-i5-2026': '/data/edmunds/bmw-i5-2026.avif',
  'bmw-i7-2026': '/data/edmunds/bmw-i7-2026.avif',
  'bmw-ix-2026': '/data/edmunds/bmw-ix-2026.avif',
  'polestar-polestar-2-2026': '/data/edmunds/polestar-polestar-2-2026.avif',
  'polestar-polestar-3-2026': '/data/edmunds/polestar-polestar-3-2026.avif',
  'polestar-polestar-4-2026': '/data/edmunds/polestar-polestar-4-2026.avif',
  'rivian-r1s-2026': '/data/edmunds/rivian-r1s-2026.avif',
  'rivian-r1t-2026': '/data/edmunds/rivian-r1t-2026.avif',
  'volkswagen-id-buzz-2026': '/data/edmunds/volkswagen-id-buzz-2026.avif',
  'volkswagen-id4-2026': '/data/edmunds/volkswagen-id4-2026.avif',
  'mercedes-benz-cla-2026': '/data/edmunds/mercedes-benz-cla-2026.avif',
  'toyota-bz-2026': '/data/edmunds/toyota-bz-2026.webp',
}

/** The curated Edmunds thumbnail for a vehicle, if one exists. */
export function edmundsImg(vehicle) {
  return (vehicle && EDMUNDS_IMG[vehicle.id]) || null
}

export function vehicleImgSrc(vehicle, width = 800) {
  if (!vehicle) return null
  const ed = EDMUNDS_IMG[vehicle.id]
  if (ed) return ed
  if (vehicle.imagesCdnBase) return `${vehicle.imagesCdnBase}/${width}w.webp`
  return vehicle.imageUrl || null
}

export function vehicleImgSrcSet(vehicle) {
  // Edmunds thumbnails are single-resolution; only the pipeline images have a set.
  if (!vehicle || EDMUNDS_IMG[vehicle.id]) return undefined
  if (!vehicle.imagesCdnBase) return undefined
  const b = vehicle.imagesCdnBase
  return `${b}/400w.webp 400w, ${b}/800w.webp 800w, ${b}/1200w.webp 1200w`
}

export function hasVehicleImg(vehicle) {
  return !!(vehicle && (EDMUNDS_IMG[vehicle.id] || vehicle.imagesCdnBase || vehicle.imageUrl))
}
