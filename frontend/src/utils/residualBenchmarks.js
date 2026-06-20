/**
 * Market residual value benchmarks by vehicle class and lease term.
 * Used by lease calculator subvention warning system.
 * Source: ALG (J.D. Power), market observations — approximate only.
 * Last updated: 2025-01
 */
export const RESIDUAL_BENCHMARKS = {
  sedan_entry_36mo:    { min: 42, typical: 47, max: 52 },
  sedan_entry_24mo:    { min: 48, typical: 53, max: 58 },
  sedan_luxury_36mo:   { min: 46, typical: 51, max: 56 },
  sedan_luxury_24mo:   { min: 52, typical: 57, max: 62 },
  suv_compact_36mo:    { min: 44, typical: 50, max: 56 },
  suv_compact_24mo:    { min: 50, typical: 55, max: 60 },
  suv_midsize_36mo:    { min: 45, typical: 51, max: 57 },
  suv_luxury_36mo:     { min: 47, typical: 52, max: 58 },
  truck_fullsize_36mo: { min: 48, typical: 54, max: 60 },
  van_36mo:            { min: 38, typical: 44, max: 50 },
  // EV-specific adjustments (generally lower due to battery uncertainty)
  ev_entry_36mo:       { min: 38, typical: 44, max: 50 },
  ev_luxury_36mo:      { min: 42, typical: 48, max: 54 },
  ev_truck_36mo:       { min: 44, typical: 50, max: 56 },
}

/**
 * Get residual benchmark for a vehicle.
 * @param {string} bodyStyle - sedan | suv | truck | van
 * @param {boolean} isLuxury - MSRP > $55k
 * @param {number} termMonths
 */
export function getResidualBenchmark(bodyStyle, msrp, termMonths = 36) {
  const isLuxury = msrp > 55000
  const termSuffix = termMonths <= 24 ? '24mo' : '36mo'

  let key
  if (bodyStyle === 'truck') key = `truck_fullsize_${termSuffix}`
  else if (bodyStyle === 'van') key = `van_${termSuffix}`
  else if (bodyStyle === 'sedan') key = `sedan_${isLuxury ? 'luxury' : 'entry'}_${termSuffix}`
  else key = `suv_${isLuxury ? 'luxury' : 'compact'}_${termSuffix}` // suv, crossover, hatchback

  // Blend with EV-specific (EVs tend to have lower residuals)
  const classBenchmark = RESIDUAL_BENCHMARKS[key] || RESIDUAL_BENCHMARKS['suv_compact_36mo']
  const evBenchmark = RESIDUAL_BENCHMARKS[`ev_${isLuxury ? 'luxury' : 'entry'}_36mo`]

  return {
    min: Math.round((classBenchmark.min + evBenchmark.min) / 2),
    typical: Math.round((classBenchmark.typical + evBenchmark.typical) / 2),
    max: Math.round((classBenchmark.max + evBenchmark.max) / 2),
  }
}
