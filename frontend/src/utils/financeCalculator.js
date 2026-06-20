/**
 * Finance Calculator
 * Calculates monthly payment, total interest, and total paid for an auto loan.
 */

/**
 * @param {Object} params
 * @param {number} params.vehiclePrice - Selling price (post-discount, pre-incentive)
 * @param {number} params.downPayment
 * @param {number} params.tradeInValue
 * @param {number} params.federalCredit - Amount applied to price (0 if not applying at signing)
 * @param {number} params.stateRebate - State rebate applied to price
 * @param {number} params.salesTaxRate - As decimal (e.g. 0.08875 for 8.875%)
 * @param {number} params.docFee
 * @param {number} params.registrationFee
 * @param {number} params.otherFees
 * @param {number} params.apr - Annual percentage rate (e.g. 5.99)
 * @param {number} params.termMonths
 * @returns {Object}
 */
export function calculateFinancePayment({
  vehiclePrice,
  downPayment = 0,
  tradeInValue = 0,
  federalCredit = 0,
  stateRebate = 0,
  salesTaxRate = 0,
  docFee = 499,
  registrationFee = 150,
  otherFees = 0,
  apr = 5.99,
  termMonths = 60,
}) {
  const taxableBase = vehiclePrice + docFee
  const salesTax = taxableBase * salesTaxRate
  const totalFees = docFee + registrationFee + salesTax + otherFees

  // Amount financed
  const priceAfterCredits = vehiclePrice - federalCredit - stateRebate
  const amountFinanced = priceAfterCredits + totalFees - downPayment - tradeInValue

  if (amountFinanced <= 0) {
    return {
      monthlyPayment: 0,
      amountFinanced: 0,
      totalInterest: 0,
      totalPaid: 0,
      effectivePriceWithCredit: priceAfterCredits,
      totalFees,
      salesTax,
    }
  }

  const monthlyRate = apr / 100 / 12

  let monthlyPayment
  if (monthlyRate === 0) {
    monthlyPayment = amountFinanced / termMonths
  } else {
    monthlyPayment =
      (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1)
  }

  const totalPaid = monthlyPayment * termMonths + downPayment + tradeInValue
  const totalInterest = totalPaid - amountFinanced - downPayment - tradeInValue

  return {
    monthlyPayment,
    amountFinanced,
    totalInterest,
    totalPaid,
    effectivePriceWithCredit: priceAfterCredits,
    totalFees,
    salesTax,
  }
}
