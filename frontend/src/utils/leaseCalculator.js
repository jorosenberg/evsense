/**
 * Lease Calculator — LeaseHackr-style
 * Supports: Standard, One-Pay, Multiple Security Deposits (MSD)
 */

/**
 * Standard monthly lease payment
 * @param {Object} p
 */
export function calculateLeasePayment({
  msrp,
  sellingPrice,
  residualPercent,
  moneyFactor,
  termMonths = 36,
  mileagePerYear = 10000,
  capCostReduction = 0, // down payment + rebates applied to cap
  acquisitionFee = 695,
  dispositionFee = 395,
  docFee = 499,
  salesTaxRate = 0,
  leaseCapCostTaxed = false, // state-level: tax full cap cost vs monthly payment
  rebatesAppliedTo = 'cap', // "cap" | "driveoff"
  stateRebate = 0,
  federalCredit = 0,
  msdCount = 0,
  isOnePay = false,
}) {
  // Effective cap cost
  const grossCapCost = sellingPrice + acquisitionFee + docFee
  const rebatesToCap = rebatesAppliedTo === 'cap' ? stateRebate + federalCredit : 0
  const adjustedCapCost = grossCapCost - capCostReduction - rebatesToCap

  const residualValue = msrp * (residualPercent / 100)

  // MSD reduction: each MSD reduces MF by 0.00007
  const msdReduction = msdCount * 0.00007
  const effectiveMoneyFactor = Math.max(0, moneyFactor - msdReduction)

  // Monthly depreciation fee
  const depreciationFee = (adjustedCapCost - residualValue) / termMonths

  // Monthly finance fee
  const financeFee = (adjustedCapCost + residualValue) * effectiveMoneyFactor

  // Base monthly before tax
  const baseMonthly = depreciationFee + financeFee

  // Tax handling
  let monthlyTax = 0
  let upfrontTax = 0
  if (leaseCapCostTaxed) {
    // States like TX, MN, OH: tax the full cap cost at inception
    upfrontTax = sellingPrice * salesTaxRate
  } else {
    // Most states: tax only the monthly payment
    monthlyTax = baseMonthly * salesTaxRate
  }

  const totalMonthly = baseMonthly + monthlyTax

  // Due at signing
  const rebatesToDriveOff = rebatesAppliedTo === 'driveoff' ? stateRebate + federalCredit : 0
  const dueAtSigning =
    totalMonthly + // first month
    acquisitionFee +
    docFee +
    capCostReduction +
    upfrontTax -
    rebatesToDriveOff

  // MSD outlay
  const msdAmount = msdCount > 0 ? msdCount * Math.ceil(totalMonthly / 50) * 50 : 0

  // Totals
  const totalLeaseCost = totalMonthly * termMonths + dueAtSigning - totalMonthly // subtract first month (already in DAS)
  const effectiveMonthly = totalLeaseCost / termMonths

  // Scores
  const percentageRule = (totalMonthly / msrp) * 100 // 1% rule
  const leaseHackrScore = ((totalMonthly * termMonths) / msrp) * 100

  // APR equivalent
  const aprEquivalent = effectiveMoneyFactor * 2400

  // One-pay mode
  let onePay = null
  if (isOnePay) {
    onePay = calculateOnePayLease({
      adjustedCapCost,
      residualValue,
      effectiveMoneyFactor,
      termMonths,
      salesTaxRate,
      leaseCapCostTaxed,
      acquisitionFee,
    })
  }

  // MSD break-even
  const monthlyWithoutMsd =
    baseMonthly +
    ((leaseCapCostTaxed ? 0 : (depreciationFee + (adjustedCapCost + residualValue) * moneyFactor) * salesTaxRate))
  const monthlySavings = monthlyWithoutMsd - totalMonthly
  const msdBreakEven = msdAmount > 0 && monthlySavings > 0
    ? Math.ceil(msdAmount / monthlySavings)
    : null

  return {
    adjustedCapCost,
    residualValue,
    effectiveMoneyFactor,
    aprEquivalent,
    depreciationFee,
    financeFee,
    baseMonthly,
    monthlyTax,
    totalMonthly,
    upfrontTax,
    dueAtSigning: Math.max(0, dueAtSigning),
    msdAmount,
    msdBreakEvenMonths: msdBreakEven,
    totalLeaseCost,
    effectiveMonthly,
    percentageRule,
    leaseHackrScore,
    onePay,
    monthlySavingsFromMsd: monthlySavings > 0 ? monthlySavings : 0,
  }
}

function calculateOnePayLease({
  adjustedCapCost,
  residualValue,
  effectiveMoneyFactor,
  termMonths,
  salesTaxRate,
  leaseCapCostTaxed,
  acquisitionFee,
}) {
  const totalDepreciation = adjustedCapCost - residualValue
  const totalFinanceCharge = (adjustedCapCost + residualValue) * effectiveMoneyFactor * termMonths
  const preeTaxAmount = totalDepreciation + totalFinanceCharge + acquisitionFee
  const tax = leaseCapCostTaxed ? 0 : preeTaxAmount * salesTaxRate
  const totalOnePay = preeTaxAmount + tax

  return {
    totalOnePay,
    effectiveMonthly: totalOnePay / termMonths,
  }
}

/**
 * Money factor to APR conversion
 */
export function mfToApr(mf) {
  return (mf * 2400).toFixed(2)
}

/**
 * APR to money factor
 */
export function aprToMf(apr) {
  return apr / 2400
}

/**
 * LeaseHackr score classification
 */
export function leaseScoreLabel(score) {
  if (score < 0.8) return { label: 'Exceptional', color: 'green' }
  if (score < 1.0) return { label: 'Great', color: 'green' }
  if (score < 1.2) return { label: 'Good', color: 'yellow' }
  if (score < 1.5) return { label: 'Fair', color: 'yellow' }
  return { label: 'Poor', color: 'red' }
}

/**
 * Percentage rule check (1% rule)
 */
export function percentageRuleLabel(pct) {
  if (pct <= 1.0) return { label: '✓ Passes 1% rule', color: 'green' }
  if (pct <= 1.2) return { label: '~ Near 1% rule', color: 'yellow' }
  return { label: '✗ Exceeds 1% rule', color: 'red' }
}
