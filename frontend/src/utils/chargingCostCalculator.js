/**
 * Charging Cost Calculator
 * Computes monthly and annual EV charging costs across home, L2 public, and DCFC.
 */

// Electricity rates live in their own file so the scraper can update them independently
export { STATE_ELECTRICITY_RATES, getStateElectricityRate, getStateOffPeakRate } from './stateElectricityRates.js'

/**
 * @param {Object} p
 * @param {number} p.annualMiles
 * @param {number} p.milesPerKwh - Vehicle efficiency
 * @param {number} p.homeRateCentsPerKwh
 * @param {number} p.offPeakRateCentsPerKwh - null if not applicable
 * @param {boolean} p.hasOffPeakRate
 * @param {number} p.l2PublicRateDollarsPerKwh - Default $0.22
 * @param {number} p.dcfcRateDollarsPerKwh - Default $0.35
 * @param {Object} p.chargingMixPercent - { home, publicL2, dcFast } summing to 100
 * @param {number} p.subscriptionMonthlyFee - e.g. $12.99 for Supercharger membership
 * @param {number} p.subscriptionRateDiscount - $/kWh saved with membership
 * @returns {Object}
 */
export function calculateChargingCosts({
  annualMiles,
  milesPerKwh,
  homeRateCentsPerKwh = 18,
  offPeakRateCentsPerKwh = null,
  hasOffPeakRate = false,
  l2PublicRateDollarsPerKwh = 0.22,
  dcfcRateDollarsPerKwh = 0.35,
  chargingMixPercent = { home: 80, publicL2: 10, dcFast: 10 },
  subscriptionMonthlyFee = 0,
}) {
  const totalKwhNeeded = annualMiles / milesPerKwh

  const homeKwh = totalKwhNeeded * (chargingMixPercent.home / 100)
  const l2Kwh = totalKwhNeeded * (chargingMixPercent.publicL2 / 100)
  const dcfcKwh = totalKwhNeeded * (chargingMixPercent.dcFast / 100)

  // Use off-peak rate for home if available (80% of home charging at off-peak is common)
  const effectiveHomeRate = hasOffPeakRate && offPeakRateCentsPerKwh
    ? (homeRateCentsPerKwh * 0.2 + offPeakRateCentsPerKwh * 0.8) / 100
    : homeRateCentsPerKwh / 100

  const annualHomeCost = homeKwh * effectiveHomeRate
  const annualL2Cost = l2Kwh * l2PublicRateDollarsPerKwh
  const annualDcfcCost = dcfcKwh * dcfcRateDollarsPerKwh
  const annualSubscriptionCost = subscriptionMonthlyFee * 12

  const annualTotal = annualHomeCost + annualL2Cost + annualDcfcCost + annualSubscriptionCost

  return {
    annualKwh: totalKwhNeeded,
    annualHomeCost,
    annualL2Cost,
    annualDcfcCost,
    annualSubscriptionCost,
    annualTotal,
    monthlyHomeCost: annualHomeCost / 12,
    monthlyL2Cost: annualL2Cost / 12,
    monthlyDcfcCost: annualDcfcCost / 12,
    monthlySubscriptionCost: subscriptionMonthlyFee,
    monthlyTotal: annualTotal / 12,
    costPerMile: annualTotal / annualMiles,
  }
}

/**
 * Cost to drive 1,000 miles at a given electricity rate.
 * Used by the Electricity Cost Comparison Widget.
 */
export function costPer1000Miles(milesPerKwh, rateDollarsPerKwh) {
  return (1000 / milesPerKwh) * rateDollarsPerKwh
}

/**
 * Equivalent gas cost for comparison
 * @param {number} annualMiles
 * @param {number} gasPricePerGallon
 * @param {number} mpg - ICE equivalent mpg
 */
export function calculateGasCost(annualMiles, gasPricePerGallon = 3.5, mpg = 28) {
  const annualGallons = annualMiles / mpg
  const annualCost = annualGallons * gasPricePerGallon
  return {
    annualGallons,
    annualCost,
    monthlyCost: annualCost / 12,
    costPerMile: gasPricePerGallon / mpg,
  }
}
