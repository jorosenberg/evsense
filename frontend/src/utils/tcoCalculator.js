/**
 * True Cost of Ownership (TCO) Summary Calculator
 * Aggregates all cost components into a unified monthly/annual/lifetime view.
 */

import { calculateFinancePayment } from './financeCalculator.js'
import { calculateLeasePayment } from './leaseCalculator.js'
import { calculateChargingCosts } from './chargingCostCalculator.js'
import { calculateDepreciationLoss } from './depreciationCalculator.js'

/**
 * Calculate full TCO given vehicle data + user preferences + calculator state.
 *
 * @param {Object} vehicle - Full Firestore vehicle document
 * @param {Object} calcState - From calculatorStore for this vehicle ID
 * @param {Object} userPrefs - From userPreferencesStore
 * @param {Object} stateData - From stateFeesData
 * @returns {Object} - Detailed monthly and lifetime cost breakdown
 */
export function calculateTCO({ vehicle, calcState, userPrefs, stateData }) {
  const trim = vehicle.trims?.[calcState.selectedTrimIndex] || vehicle.trims?.[0] || {}
  // Many detail-JSON trims carry msrp: null (EPA-derived rows), and some detail
  // files have no top-level msrpFrom, which made baseMsrp collapse to 0 and the
  // lease residual (msrp × residual%) show $0. Fall back to the scraped Edmunds
  // lease-calculator MSRP, which the CostCalculator passes through.
  const baseMsrp = trim.msrp || vehicle.msrpFrom || calcState.leaseScrapedMsrp || 0
  // userInputPrice, if the buyer pasted an online listing price, use it as
  // the basis for tax, finance principal, and lease cap cost. Depreciation
  // still uses baseMsrp below since residual curves are anchored to MSRP.
  const msrp = (calcState.userInputPrice != null && calcState.userInputPrice > 0)
    ? calcState.userInputPrice
    : baseMsrp
  const specs = vehicle.specs || {}

  // Sales tax: use per-vehicle override (county add-ons, out-of-state reg, etc.)
  // when present; otherwise fall back to the state's default rate.
  const salesTaxRate = calcState.salesTaxOverride != null
    ? calcState.salesTaxOverride / 100
    : (stateData?.salesTaxPercent || 0) / 100
  const registrationFee = stateData?.registrationFeeUsd || 150
  const titleFee = stateData?.titleFeeUsd || 50
  const evSurcharge = stateData?.evSurchargeUsd || 0
  const annualRoadFee = stateData?.annualEvRoadFee?.amountUsd || 0
  const leaseCapCostTaxed = stateData?.leaseCapCostTaxed || false

  const annualMileage = userPrefs.annualMileage || 12000
  const ownershipYears = userPrefs.ownershipYears || 5

  // Federal credit
  const federalCredit =
    calcState.applyFederalCredit && vehicle.federalTaxCredit?.eligibleNew
      ? vehicle.federalTaxCredit.amount || 0
      : 0

  // State incentives (sum of non-charger rebates)
  const computedStateRebate =
    stateData?.incentives
      ?.filter((i) => i.appliesTo?.includes('new'))
      ?.reduce((sum, i) => sum + (i.amount || 0), 0) || 0

  // Manual override (the user's real number from a quote or current-offers page)
  // wins over our estimates. We fold the whole override into the "state rebate"
  // slot and zero out the federal credit so the total incentives equal exactly
  // what the user entered, no double counting.
  const hasManualOverride =
    calcState.manualIncentiveOverride != null && calcState.manualIncentiveOverride >= 0
  const stateRebate = hasManualOverride ? calcState.manualIncentiveOverride : computedStateRebate
  const federalCreditEffective = hasManualOverride ? 0 : federalCredit

  const sellingPrice = msrp - (calcState.dealerDiscount || 0)
  const downPayment = calcState.downPayment ?? msrp * ((userPrefs.downPaymentPercent || 10) / 100)

  let monthlyPayment = 0
  let financeDetails = null
  let leaseDetails = null

  if (calcState.mode === 'cash') {
    monthlyPayment = 0
    financeDetails = { totalPaid: sellingPrice - federalCreditEffective - stateRebate, totalInterest: 0 }
  } else if (calcState.mode === 'finance') {
    financeDetails = calculateFinancePayment({
      vehiclePrice: sellingPrice,
      downPayment,
      tradeInValue: calcState.tradeInValue || 0,
      federalCredit: federalCreditEffective,
      stateRebate,
      salesTaxRate,
      docFee: calcState.leaseDocFee != null ? calcState.leaseDocFee : 499,
      registrationFee,
      otherFees: titleFee + evSurcharge,
      apr: calcState.financeApr || 5.99,
      termMonths: calcState.financeTermMonths || 60,
    })
    monthlyPayment = financeDetails.monthlyPayment
  } else if (calcState.mode === 'lease') {
    const offerMf = trim.leaseOffers?.[0]?.moneyFactor || 0.00125
    const offerResidual = trim.leaseOffers?.[0]?.residualPercent || 50
    // Residual is always anchored to the vehicle's actual trim MSRP, lease
    // residual % is defined as a percentage of MSRP, so we must use the trim's
    // real MSRP (not the user's discounted price or the Edmunds base-model MSRP,
    // which may be from a different, cheaper trim than the one being leased).
    const leaseMsrp = trim.msrp || calcState.leaseScrapedMsrp || msrp
    // Cap cost uses the user's entered online price when available, that is the
    // actual negotiated selling price that becomes the lease cap cost. Fall back to
    // the Edmunds scraped selling price, then to the MSRP-based selling price.
    const leaseSellingPrice = (calcState.userInputPrice != null && calcState.userInputPrice > 0)
      ? Math.max(0, calcState.userInputPrice - (calcState.dealerDiscount || 0))
      : calcState.leaseScrapedSellingPrice != null
        ? Math.max(0, calcState.leaseScrapedSellingPrice - (calcState.dealerDiscount || 0))
        : sellingPrice
    // Manufacturer EV lease cash (e.g. CLA $5,500) is a lease-only incentive
    // applied to the cap cost. Fold it in as a rebate-to-cap so it lowers the
    // monthly (it isn't money the lessee pays, so it must NOT inflate due-at-
    // signing, hence a rebate, not a cap cost reduction). Added on top of any
    // state/federal rebates already applied to the cap.
    const leaseCashIncentive = calcState.leaseCashIncentive || 0
    leaseDetails = calculateLeasePayment({
      msrp: leaseMsrp,
      sellingPrice: leaseSellingPrice,
      residualPercent: calcState.leaseResidualPercent ?? offerResidual,
      moneyFactor: calcState.leaseMoneyFactor ?? offerMf,
      termMonths: calcState.leaseTermMonths || 36,
      mileagePerYear: calcState.leaseMileagePerYear || 10000,
      capCostReduction: calcState.leaseCapCostReduction || 0,
      acquisitionFee: calcState.leaseAcquisitionFee ?? trim.leaseOffers?.[0]?.acquisitionFee ?? 695,
      dispositionFee: calcState.leaseDispositionFee ?? 395,
      docFee: calcState.leaseDocFee != null ? calcState.leaseDocFee : 499,
      salesTaxRate,
      leaseCapCostTaxed,
      rebatesAppliedTo: calcState.leaseRebatesAppliedTo || 'cap',
      stateRebate: stateRebate + leaseCashIncentive,
      federalCredit: federalCreditEffective,
      msdCount: calcState.leaseMsdCount || 0,
      isOnePay: calcState.leaseIsOnePay || false,
    })
    monthlyPayment = leaseDetails.totalMonthly
  }

  // Charging costs. DCFC rate prefers user-supplied OCM value, then state
  // average, then library default.
  const electricityRate = userPrefs.electricityRateCentsPerKwh
  const milesPerKwh = specs.milesPerKwh || 3.5
  const dcfcRate = userPrefs.dcfcRateCentsPerKwh
    ? userPrefs.dcfcRateCentsPerKwh / 100
    : 0.45
  const l2PublicRate = userPrefs.publicL2RateCentsPerKwh
    ? userPrefs.publicL2RateCentsPerKwh / 100
    : 0.22
  const chargingCosts = calculateChargingCosts({
    annualMiles: annualMileage,
    milesPerKwh,
    homeRateCentsPerKwh: electricityRate,
    hasOffPeakRate: userPrefs.hasOffPeakRate,
    offPeakRateCentsPerKwh: userPrefs.offPeakRateCentsPerKwh,
    chargingMixPercent: userPrefs.chargingMixPercent,
    dcfcRateDollarsPerKwh: dcfcRate,
    l2PublicRateDollarsPerKwh: l2PublicRate,
    subscriptionMonthlyFee: calcState.chargingNetworkSubscription?.monthlyFee || 0,
  })

  // Insurance
  const insurance = vehicle.insuranceEstimateAnnual || { low: 1400, average: 1900, high: 2800 }
  const annualInsurance = insurance[calcState.insuranceEstimate || 'average']

  // Maintenance
  const annualMaintenance =
    calcState.maintenanceOverride ?? vehicle.maintenance?.averageAnnualCostUsd ?? 600

  // Depreciation (only relevant for non-lease)
  // Depreciation curves are anchored to MSRP, using the user's negotiated
  // online price here would understate residual value at year-N.
  const depreciationData = calcState.mode !== 'lease'
    ? calculateDepreciationLoss(baseMsrp, vehicle.depreciation, ownershipYears)
    : null

  // Home charger amortized (one-time cost spread over ownership)
  const chargerOneTime = userPrefs.hasHomeCharger
    ? (userPrefs.homeChargerInstallCostUsd || 1400)
    : 0
  const chargerAmortizedMonthly = chargerOneTime / (ownershipYears * 12)

  // Registration fees (annual)
  const annualRegistrationFees = registrationFee + annualRoadFee
  const monthlyRegistrationFees = annualRegistrationFees / 12

  // Complimentary Electrify America charging (if applicable), a pre-computed
  // monthly DC-fast-charging savings, amortized over ownership. Reduces charging.
  const eaChargingSavingsMonthly = Math.max(0, calcState.eaChargingSavingsMonthly || 0)

  // Monthly totals
  const monthlyCharging = Math.max(0, chargingCosts.monthlyTotal - eaChargingSavingsMonthly)
  const monthlyInsurance = annualInsurance / 12
  const monthlyMaintenance = annualMaintenance / 12
  const monthlyTotal =
    monthlyPayment +
    monthlyCharging +
    monthlyInsurance +
    monthlyMaintenance +
    monthlyRegistrationFees +
    chargerAmortizedMonthly

  // Lifetime totals over ownership period
  const totalPayments = monthlyPayment * (calcState.mode === 'lease' ? calcState.leaseTermMonths || 36 : ownershipYears * 12)
  const totalCharging = Math.max(0, chargingCosts.annualTotal * ownershipYears - eaChargingSavingsMonthly * ownershipYears * 12)
  const totalInsurance = annualInsurance * ownershipYears
  const totalMaintenance = annualMaintenance * ownershipYears
  const totalFees = annualRegistrationFees * ownershipYears + (financeDetails?.totalFees || 0)
  const totalIncentives = federalCreditEffective + stateRebate
  const totalCost = totalPayments + totalCharging + totalInsurance + totalMaintenance + totalFees + chargerOneTime

  return {
    mode: calcState.mode,
    // Monthly breakdown
    monthlyPayment,
    monthlyCharging,
    eaChargingSavingsMonthly,
    monthlyInsurance,
    monthlyMaintenance,
    monthlyRegistrationFees,
    chargerAmortizedMonthly,
    monthlyTotal,
    // Annual
    annualTotal: monthlyTotal * 12,
    // Lifetime
    totalPayments,
    totalCharging,
    totalInsurance,
    totalMaintenance,
    totalFees,
    totalIncentives,
    chargerOneTime,
    totalCost,
    // Detail objects
    financeDetails,
    leaseDetails,
    chargingCosts,
    depreciationData,
    // Resale (for owned vehicles)
    projectedResaleValue: depreciationData?.finalValue || null,
    netCostAfterResale: depreciationData ? totalCost - depreciationData.finalValue : null,
  }
}
