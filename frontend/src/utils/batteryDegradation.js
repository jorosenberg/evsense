/**
 * Battery degradation estimator.
 *
 * Based on real-world data aggregated from Recurrent Auto, Geotab, and
 * Tesloop fleet studies (2024):
 *   - Year 1: ~2-3% capacity loss (fast initial drop)
 *   - Years 2-5: ~1-1.5% per year (linear-ish)
 *   - Years 5-10: ~0.7-1% per year (slows considerably)
 *   - Above 100k miles: an extra ~0.5% penalty per 25k mi cycle
 *
 * LFP chemistry is more degradation-resistant than NCM/NCA; NCM packs lose
 * roughly 15% more over the same period. We use an NCM-typical curve as the
 * default and let the caller pass a chemistry hint to tune the floor.
 *
 * Outputs are conservative. Real loss varies with climate, charging habits,
 * and DOD cycling, your mileage may vary (literally).
 */

const NCM_DEFAULT_CHEMISTRY = 'ncm'

/**
 * @param {object} params
 * @param {number} params.ageYears       Vehicle age in years
 * @param {number} params.mileage        Total odometer miles
 * @param {string} [params.chemistry]    'ncm' | 'lfp' | 'unknown' (default 'ncm')
 * @returns {{
 *   percentLost: number,    // 0-100
 *   capacityRemainingPct: number,  // 100 - percentLost
 *   confidence: 'low'|'medium'|'high',
 *   notes: string[]
 * }}
 */
export function estimateBatteryDegradation({ ageYears, mileage, chemistry = NCM_DEFAULT_CHEMISTRY }) {
  const age = Math.max(0, Number(ageYears) || 0)
  const mi = Math.max(0, Number(mileage) || 0)

  // Time-based component
  let timeLoss
  if (age <= 1) timeLoss = age * 2.5
  else if (age <= 5) timeLoss = 2.5 + (age - 1) * 1.3
  else if (age <= 10) timeLoss = 2.5 + 4 * 1.3 + (age - 5) * 0.9
  else timeLoss = 2.5 + 4 * 1.3 + 5 * 0.9 + (age - 10) * 0.6

  // Mileage-based component (extra ~2% per 25k mi above the curve baseline of ~12k/yr)
  const expectedMi = age * 12000
  const excessMi = Math.max(0, mi - expectedMi)
  const mileagePenalty = (excessMi / 25000) * 2.0

  // Chemistry adjustment
  let chemMultiplier = 1.0
  if (chemistry === 'lfp') chemMultiplier = 0.7
  if (chemistry === 'ncm') chemMultiplier = 1.0
  if (chemistry === 'unknown') chemMultiplier = 1.0

  let percentLost = (timeLoss + mileagePenalty) * chemMultiplier
  percentLost = Math.min(percentLost, 40)  // floor at 60% capacity
  percentLost = Math.max(percentLost, 0)

  const capacityRemainingPct = 100 - percentLost

  // Confidence heuristics
  let confidence = 'medium'
  if (age <= 2 && mi <= 25000) confidence = 'high'
  if (age > 8 || mi > 120000) confidence = 'low'

  const notes = []
  if (capacityRemainingPct < 80) {
    notes.push('Below 80%, may approach the manufacturer battery warranty threshold. Check warranty terms before purchase.')
  }
  if (mi > 120000) {
    notes.push('High mileage, request a battery health report (BMS readout) from the seller.')
  }
  if (chemistry === 'lfp') {
    notes.push('LFP chemistry degrades more slowly than NCM/NCA. Estimates are conservative.')
  }

  return {
    percentLost: Number(percentLost.toFixed(1)),
    capacityRemainingPct: Number(capacityRemainingPct.toFixed(1)),
    confidence,
    notes,
  }
}

/**
 * Applies degradation to an EPA range figure.
 */
export function degradedRange(originalRangeMi, capacityRemainingPct) {
  if (!originalRangeMi) return null
  return Math.round((originalRangeMi * capacityRemainingPct) / 100)
}

/**
 * Applies degradation to efficiency (mi/kWh). Degradation typically lowers
 * range by capacity drop but also slightly worsens efficiency due to higher
 * internal resistance (~1% worse efficiency per 10% capacity lost).
 */
export function degradedEfficiency(milesPerKwh, capacityRemainingPct) {
  if (!milesPerKwh) return null
  const lostPct = 100 - capacityRemainingPct
  const efficiencyPenalty = (lostPct / 10) * 0.01    // 1% per 10% lost
  return Number((milesPerKwh * (1 - efficiencyPenalty)).toFixed(2))
}
