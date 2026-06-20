/**
 * costPerMile.js, Per-mile driving cost calculations
 *
 * Cost per mile = ($/kWh) / (mi/kWh)
 *
 * Three scenarios are supported:
 *   1. Home charging at state residential rate
 *   2. Public L2 (default $0.22/kWh national average)
 *   3. DCFC, uses OCM-provided pricing if available, else $0.45/kWh average
 *
 * The "blended" calculation weights these by the user's charging mix
 * (default 80/10/10 home/L2/DCFC).
 */

import { STATE_ELECTRICITY_RATES } from './stateElectricityRates'
import { getEfficiency } from './efficiencyData'

// National averages (Sept 2025, EVgo + Electrify America + ChargePoint sampled)
export const DEFAULT_DCFC_RATE  = 0.45  // $/kWh
export const DEFAULT_L2_RATE    = 0.22  // $/kWh

// ─── Single-rate cost per mile ────────────────────────────────────────────────
/**
 * @param {number} milesPerKwh, vehicle efficiency
 * @param {number} ratePerKwh , $/kWh
 * @returns {number} $/mile
 */
export function costPerMile(milesPerKwh, ratePerKwh) {
  if (!milesPerKwh || milesPerKwh <= 0) return 0
  return ratePerKwh / milesPerKwh
}

/**
 * Helper to format cents/mile for display, e.g. 0.034 → "3.4¢"
 */
export function formatCentsPerMile(dollarsPerMile) {
  if (!dollarsPerMile) return '-'
  return `${(dollarsPerMile * 100).toFixed(1)}¢`
}

// ─── Multi-scenario per-mile cost ────────────────────────────────────────────
/**
 * Get cost per mile in three scenarios (home, L2, DCFC) for a given vehicle.
 *
 * @param {object} args
 * @param {string} args.vehicleId
 * @param {number} args.fallbackMilesPerKwh, used when efficiency lookup fails
 * @param {string} [args.stateCode='TX']
 * @param {number} [args.dcfcRateOverride], $/kWh, e.g. from OCM lookup
 * @param {number} [args.homeRateOverride], ¢/kWh user override
 * @param {'hwy'|'city'|'edmunds'|'epa'} [args.scenario='edmunds'], efficiency curve
 */
export function getCostBreakdown({
  vehicleId,
  fallbackMilesPerKwh,
  stateCode = 'TX',
  dcfcRateOverride = null,
  homeRateOverride = null,
  l2RateOverride = null,
  scenario = 'edmunds',
}) {
  const eff = getEfficiency(vehicleId, fallbackMilesPerKwh) || {
    epa: fallbackMilesPerKwh || 3.5,
    hwy: fallbackMilesPerKwh ? fallbackMilesPerKwh * 0.85 : 3.0,
    city: fallbackMilesPerKwh ? fallbackMilesPerKwh * 1.15 : 4.0,
    edmunds: fallbackMilesPerKwh ? fallbackMilesPerKwh * 0.88 : 3.1,
    source: 'estimated',
  }

  const milesPerKwh = eff[scenario] ?? eff.edmunds ?? eff.epa
  const homeRate = (homeRateOverride ?? STATE_ELECTRICITY_RATES[stateCode] ?? 14) / 100
  const dcfcRate = dcfcRateOverride ?? DEFAULT_DCFC_RATE
  const l2Rate   = l2RateOverride ?? DEFAULT_L2_RATE

  return {
    efficiency: {
      mi_per_kwh: milesPerKwh,
      scenario,
      source: eff.source,
      hwy: eff.hwy,
      city: eff.city,
      edmunds: eff.edmunds,
      epa: eff.epa,
    },
    home: {
      ratePerKwh: homeRate,
      costPerMile: costPerMile(milesPerKwh, homeRate),
    },
    l2: {
      ratePerKwh: l2Rate,
      costPerMile: costPerMile(milesPerKwh, l2Rate),
    },
    dcfc: {
      ratePerKwh: dcfcRate,
      costPerMile: costPerMile(milesPerKwh, dcfcRate),
    },
  }
}

/**
 * Blended cost per mile based on the user's charging mix.
 *
 * @param {object} breakdown, from getCostBreakdown()
 * @param {{home: number, publicL2: number, dcFast: number}} mixPercent, sums to 100
 * @returns {number} $/mile blended
 */
export function blendedCostPerMile(breakdown, mixPercent = { home: 80, publicL2: 10, dcFast: 10 }) {
  return (
    (mixPercent.home     / 100) * breakdown.home.costPerMile +
    (mixPercent.publicL2 / 100) * breakdown.l2.costPerMile   +
    (mixPercent.dcFast   / 100) * breakdown.dcfc.costPerMile
  )
}

// ─── Gas comparison ───────────────────────────────────────────────────────────
/**
 * Equivalent cost per mile for a gas car.
 */
export function gasCostPerMile(mpg, pricePerGallon = 3.50) {
  if (!mpg || mpg <= 0) return 0
  return pricePerGallon / mpg
}

/**
 * Percentage savings vs a gas car.
 */
export function savingsVsGas(evCostPerMile, gasCostPerMile) {
  if (!gasCostPerMile) return 0
  return Math.max(0, 1 - evCostPerMile / gasCostPerMile)
}
