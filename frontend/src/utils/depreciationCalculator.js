/**
 * Depreciation Calculator
 * Projects vehicle value over time given depreciation percentages.
 */

/**
 * Builds a year-by-year depreciation curve.
 * @param {number} msrp
 * @param {Object} depreciationData - { year1Percent, year2Percent, year3Percent, year5Percent }
 * @param {number} ownershipYears
 * @returns {Array<{ year, value, percentLost, dollarLost }>}
 */
export function buildDepreciationCurve(msrp, depreciationData, ownershipYears = 5) {
  const { year1Percent = 20, year2Percent = 31, year3Percent = 38, year5Percent = 49 } = depreciationData || {}

  // Known data points (cumulative % lost from MSRP)
  const knownPoints = {
    0: 0,
    1: year1Percent,
    2: year2Percent,
    3: year3Percent,
    5: year5Percent,
  }

  // Interpolate missing years via linear interpolation
  function interpolate(year) {
    const years = Object.keys(knownPoints).map(Number).sort((a, b) => a - b)
    for (let i = 0; i < years.length - 1; i++) {
      const y0 = years[i]
      const y1 = years[i + 1]
      if (year >= y0 && year <= y1) {
        const t = (year - y0) / (y1 - y0)
        return knownPoints[y0] + t * (knownPoints[y1] - knownPoints[y0])
      }
    }
    // Extrapolate beyond year 5: assume 5% per year additional depreciation
    const lastKnownYear = Math.max(...years)
    const lastPct = knownPoints[lastKnownYear]
    return lastPct + (year - lastKnownYear) * 5
  }

  const curve = []
  for (let y = 0; y <= Math.min(ownershipYears, 10); y++) {
    const pctLost = Math.min(interpolate(y), 95)
    const value = msrp * (1 - pctLost / 100)
    curve.push({
      year: y,
      label: y === 0 ? 'Purchase' : `Year ${y}`,
      value: Math.round(value),
      percentLost: pctLost,
      dollarLost: Math.round(msrp * pctLost / 100),
    })
  }

  return curve
}

/**
 * Calculates total depreciation for an ownership period.
 */
export function calculateDepreciationLoss(msrp, depreciationData, ownershipYears) {
  const curve = buildDepreciationCurve(msrp, depreciationData, ownershipYears)
  const atOwnership = curve.find((p) => p.year === ownershipYears) || curve[curve.length - 1]
  return {
    initialValue: msrp,
    finalValue: atOwnership.value,
    totalLoss: msrp - atOwnership.value,
    monthlyLoss: (msrp - atOwnership.value) / (ownershipYears * 12),
    percentLost: atOwnership.percentLost,
    curve,
  }
}
