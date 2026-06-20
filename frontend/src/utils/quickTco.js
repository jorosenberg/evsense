/**
 * quickTco.js, Lightweight TCO calculator for card display
 *
 * The full TCO calculator (tcoCalculator.js) needs the entire calculator
 * state, too heavy to instantiate on every card render. This module gives
 * a quick "good enough" monthly TCO using sensible defaults so we can show
 * the all-in monthly cost upfront, prominently, on every vehicle card.
 *
 * Components (monthly):
 *   • Payment      , lease (preferred) or finance estimate (60mo, 6% APR)
 *   • Charging     , blended home/L2/DCFC based on charging mix
 *   • Insurance    , vehicle.insuranceEstimateAnnual or fallback by body class
 *   • Maintenance  , $50/mo (EV average per AAA 2024)
 *   • Reg + road fee, from stateFeesData
 */

import { getCostBreakdown, blendedCostPerMile } from './costPerMile'
import { STATE_FEES } from './stateFeesData'
import { eaMonthlyChargingSavings } from './electrifyAmerica'

// Default monthly estimates (USD), used when no vehicle-specific data
const DEFAULT_INSURANCE_BY_BODY = {
  sedan:     150,
  suv:       160,
  hatchback: 145,
  truck:     180,
  van:       170,
  coupe:     170,
}

const DEFAULT_EV_MAINTENANCE = 50  // AAA 2024: ~$600/yr for EVs
const DEFAULT_ANNUAL_MILES   = 12000
const DEFAULT_MIX            = { home: 80, publicL2: 10, dcFast: 10 }

/**
 * Estimate monthly payment when no lease/finance offer is available.
 * Assumes 10% down, 6% APR, 60 months.
 */
export function estimateFinanceMonthly(msrp) {
  if (!msrp) return 0
  const principal = msrp * 0.9
  const r = 0.06 / 12
  const n = 60
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

/**
 * Quick monthly TCO + cost per mile, suitable for card display.
 *
 * @param {object} vehicle, from vehicles_summary.json (or detail page)
 * @param {object} opts
 * @param {string} [opts.stateCode='TX']
 * @param {number} [opts.annualMiles=12000]
 * @param {object} [opts.chargingMix={home:80, publicL2:10, dcFast:10}]
 * @param {number} [opts.homeRateOverride], ¢/kWh
 * @param {number} [opts.dcfcRateOverride], $/kWh (e.g. from OCM)
 * @param {number} [opts.l2RateOverride], $/kWh public Level 2
 * @param {number} [opts.subscriptionMonthly=0], flat charging-network $/mo
 * @param {'lease'|'finance'} [opts.mode='lease'], which payment to use
 * @returns {{
 *   monthlyTco: number,
 *   payment: number,
 *   charging: number,
 *   insurance: number,
 *   maintenance: number,
 *   fees: number,
 *   costPerMile: number,
 *   centsPerMile: number,
 *   mode: 'lease'|'finance'|'cash'
 * }}
 */
export function quickTco(vehicle, opts = {}) {
  const {
    stateCode = 'TX',
    annualMiles = DEFAULT_ANNUAL_MILES,
    chargingMix = DEFAULT_MIX,
    homeRateOverride = null,
    dcfcRateOverride = null,
    l2RateOverride = null,
    subscriptionMonthly = 0,
    mode = 'lease',
    leaseTermMonths = 36,  // term used to amortize a lease incentive into the monthly
    incentive = 0,   // flat rebate/cash the user knows about (reduces payment)
    eaOffer = null,  // Electrify America complimentary-charging offer (optional)
    ownershipYears = 5,
  } = opts

  // ── Payment ──
  // Cash buyers carry no monthly payment, their monthly TCO is operating
  // costs only, so ranking falls to range/efficiency/sticker (the budget
  // penalty in scoreVehicle still penalizes over-budget sticker prices).
  let payment = 0
  let actualMode = mode
  if (mode === 'cash') {
    payment = 0
    actualMode = 'cash'
  } else if (mode === 'lease' && vehicle.leaseFrom) {
    payment = vehicle.leaseFrom
  } else if (vehicle.financeFrom) {
    payment = vehicle.financeFrom
    actualMode = 'finance'
  } else if (vehicle.msrpFrom) {
    payment = estimateFinanceMonthly(vehicle.msrpFrom)
    actualMode = 'finance'
  }

  // Apply a known incentive as a monthly reduction, amortized over the typical
  // term for the chosen mode (lease 36mo, finance 60mo). Cash buyers see the
  // incentive in the price line, not the monthly, so it's skipped here.
  if (incentive > 0 && actualMode !== 'cash') {
    const term = actualMode === 'lease' ? (leaseTermMonths || 36) : 60
    payment = Math.max(0, payment - incentive / term)
  }

  // ── Cost per mile (blended across charging mix) ──
  const breakdown = getCostBreakdown({
    vehicleId: vehicle.id,
    fallbackMilesPerKwh: vehicle.milesPerKwh,
    stateCode,
    dcfcRateOverride,
    homeRateOverride,
    l2RateOverride,
    scenario: 'edmunds',  // real-world is the honest number
  })
  const blended = blendedCostPerMile(breakdown, chargingMix)

  // ── Charging ──
  // Per-kWh energy cost from the blended mix, plus any flat monthly
  // charging-network subscription the user pays (EA Pass+, EVgo, etc.).
  const monthlyMiles = annualMiles / 12
  let charging = blended * monthlyMiles + (subscriptionMonthly || 0)

  // Complimentary Electrify America charging (if the vehicle qualifies) reduces
  // the DC-fast-charging portion for the benefit period, amortized over the
  // ownership horizon. Modeled as free DC fast charging; home/L2 unaffected.
  const eaSavings = eaOffer
    ? eaMonthlyChargingSavings({
        offer: eaOffer,
        annualMiles,
        // breakdown.efficiency is an object, use its numeric mi/kWh.
        milesPerKwh: breakdown.efficiency?.mi_per_kwh || vehicle.milesPerKwh || 3.5,
        dcFastSharePct: chargingMix?.dcFast ?? DEFAULT_MIX.dcFast,
        dcfcRate: breakdown.dcfc.ratePerKwh,
        ownershipYears,
      }).monthly
    : 0
  // Never let a bad input NaN-out the headline cost.
  const eaSavingsSafe = Number.isFinite(eaSavings) ? eaSavings : 0
  charging = Math.max(0, charging - eaSavingsSafe)

  // ── Insurance ──
  const insurance =
    (vehicle.insuranceEstimateAnnual?.average ?? null)
      ? vehicle.insuranceEstimateAnnual.average / 12
      : (DEFAULT_INSURANCE_BY_BODY[vehicle.bodyStyle] ?? 160)

  // ── Maintenance ──
  const maintenance = vehicle.maintenance?.averageAnnualCostUsd
    ? vehicle.maintenance.averageAnnualCostUsd / 12
    : DEFAULT_EV_MAINTENANCE

  // ── Registration + road fees ──
  const stateData = STATE_FEES[stateCode] || {}
  const annualFees = (stateData.registrationFeeUsd || 150) + (stateData.evSurchargeUsd || 0)
  const fees = annualFees / 12

  const monthlyTco = payment + charging + insurance + maintenance + fees

  return {
    monthlyTco: Math.round(monthlyTco),
    payment: Math.round(payment),
    charging: Math.round(charging),
    eaSavings: Math.round(eaSavingsSafe),
    insurance: Math.round(insurance),
    maintenance: Math.round(maintenance),
    fees: Math.round(fees),
    costPerMile: blended,
    centsPerMile: Number((blended * 100).toFixed(1)),
    // Pure DC fast charging cost per mile, useful as a "worst case / road trip" figure.
    // Uses the user's customized DCFC rate if set, otherwise the national average.
    fastCostPerMile: breakdown.dcfc.costPerMile,
    fastCentsPerMile: Number((breakdown.dcfc.costPerMile * 100).toFixed(1)),
    fastRateCentsPerKwh: Math.round(breakdown.dcfc.ratePerKwh * 100),
    mode: actualMode,
    efficiency: breakdown.efficiency,
    chargingBreakdown: breakdown,
  }
}
