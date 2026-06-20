/**
 * Vehicle safety ratings — NHTSA and IIHS
 * Sources: nhtsa.gov/ratings, iihs.org/ratings
 * Last verified: 2025-2026 model year data
 *
 * NHTSA overall: 1–5 stars
 * IIHS: 'TSP+' | 'TSP' | null (no designation)
 * IIHS frontal: 'Good' | 'Acceptable' | 'Marginal' | 'Poor'
 */

export const SAFETY_RATINGS = {
  'chevrolet-equinox-ev-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'hyundai-ioniq-6-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'hyundai-ioniq-5-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'tesla-model3-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'tesla-modely-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP', frontalSmall: 'Acceptable', frontalModerate: 'Good', side: 'Good' },
  },
  'tesla-modelx-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: null, frontalSmall: null, frontalModerate: 'Good', side: 'Good' },
  },
  'tesla-models-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: null, frontalSmall: null, frontalModerate: 'Good', side: 'Good' },
  },
  'tesla-cybertruck-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: null, frontalSmall: null, frontalModerate: null, side: null },
  },
  'ford-mustang-mach-e-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'ford-f150-lightning-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'kia-ev6-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'kia-ev9-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'rivian-r1t-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: null, frontalSmall: null, frontalModerate: null, side: null },
  },
  'rivian-r1s-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'gmc-hummer-ev-2025': {
    nhtsa: { overall: 4, frontal: 4, side: 5, rollover: 3 },
    iihs: { overall: null, frontalSmall: null, frontalModerate: null, side: null },
  },
  'porsche-taycan-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'audi-etron-gt-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'lucid-air-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'mercedes-eqe-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'mercedes-eqs-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'bmw-i4-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'bmw-ix-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'chevrolet-blazer-ev-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'volkswagen-id4-2026': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'nissan-ariya-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'subaru-solterra-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'toyota-bz4x-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 4 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'genesis-gv60-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'polestar-2-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
  'volvo-ex40-2025': {
    nhtsa: { overall: 5, frontal: 5, side: 5, rollover: 5 },
    iihs: { overall: 'TSP+', frontalSmall: 'Good', frontalModerate: 'Good', side: 'Good' },
  },
}

export function getSafetyRating(vehicleId) {
  return SAFETY_RATINGS[vehicleId] || null
}

/**
 * Returns a short display label + color for NHTSA star rating.
 */
export function nhtsaLabel(stars) {
  if (!stars) return null
  return { stars, label: `${stars} / 5 Stars`, color: stars >= 5 ? 'text-green-600' : stars >= 4 ? 'text-yellow-600' : 'text-red-500' }
}

/**
 * Returns color class for IIHS overall rating.
 */
export function iihsColor(rating) {
  if (rating === 'TSP+') return 'text-green-600 bg-green-50 border-green-200'
  if (rating === 'TSP')  return 'text-blue-600 bg-blue-50 border-blue-200'
  return 'text-ink-muted bg-surface-sunken border-border'
}
