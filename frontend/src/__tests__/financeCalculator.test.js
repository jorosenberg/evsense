/**
 * financeCalculator.test.js
 *
 * Tests for calculateFinancePayment().
 * All expected values verified by hand / with a TVM calculator.
 */
import { describe, it, expect } from 'vitest'
import { calculateFinancePayment } from '../utils/financeCalculator.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Standard base params for a clean $30,000 vehicle with no extras */
const base = {
  vehiclePrice: 30000,
  downPayment: 0,
  tradeInValue: 0,
  federalCredit: 0,
  stateRebate: 0,
  salesTaxRate: 0,
  docFee: 0,
  registrationFee: 0,
  otherFees: 0,
}

// ─── Basic payment math ───────────────────────────────────────────────────────
describe('calculateFinancePayment, payment math', () => {
  it('returns $500/mo at 0% APR, 60 months, $30k vehicle, no fees', () => {
    const result = calculateFinancePayment({ ...base, apr: 0, termMonths: 60 })
    expect(result.monthlyPayment).toBeCloseTo(500, 2)
  })

  it('returns ~$579.98/mo at 5.99% APR, 60 months, $30k vehicle, no fees', () => {
    // Verified with TVM: PV=30000, n=60, i=0.0599/12 → PMT≈579.98
    const result = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60 })
    expect(result.monthlyPayment).toBeCloseTo(579.98, 0)
  })

  it('returns ~$725/mo at 7.49% APR, 48 months, $30k vehicle, no fees', () => {
    // Verified: PV=30000, n=48, i=0.0749/12 → PMT≈725.23
    const result = calculateFinancePayment({ ...base, apr: 7.49, termMonths: 48 })
    expect(result.monthlyPayment).toBeCloseTo(725.23, 0)
    // total paid > principal
    expect(result.totalPaid).toBeGreaterThan(30000)
  })

  it('amountFinanced is reduced by down payment', () => {
    const noDp = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60 })
    const withDp = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60, downPayment: 5000 })
    expect(withDp.amountFinanced).toBe(noDp.amountFinanced - 5000)
    expect(withDp.monthlyPayment).toBeLessThan(noDp.monthlyPayment)
  })

  it('amountFinanced is reduced by trade-in value', () => {
    const noTrade = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60 })
    const withTrade = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60, tradeInValue: 8000 })
    expect(withTrade.amountFinanced).toBe(noTrade.amountFinanced - 8000)
  })
})

// ─── Incentives ───────────────────────────────────────────────────────────────
describe('calculateFinancePayment, federal credit & state rebate', () => {
  it('$7,500 federal credit reduces amount financed by $7,500', () => {
    const noCredit = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60 })
    const withCredit = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60, federalCredit: 7500 })
    expect(withCredit.amountFinanced).toBe(noCredit.amountFinanced - 7500)
  })

  it('$2,000 state rebate reduces amount financed', () => {
    const noRebate = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60 })
    const withRebate = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 60, stateRebate: 2000 })
    expect(withRebate.amountFinanced).toBe(noRebate.amountFinanced - 2000)
  })

  it('combined credits + large down payment can result in $0 monthly', () => {
    // $30k vehicle, $7500 fed credit, $22500 down → amount financed ≤ 0
    const result = calculateFinancePayment({
      ...base,
      vehiclePrice: 30000,
      downPayment: 22500,
      federalCredit: 7500,
      apr: 5.99,
      termMonths: 60,
    })
    expect(result.monthlyPayment).toBe(0)
    expect(result.amountFinanced).toBe(0)
  })
})

// ─── Fees & taxes ─────────────────────────────────────────────────────────────
describe('calculateFinancePayment, fees and sales tax', () => {
  it('sales tax is calculated on vehicle price + doc fee', () => {
    const result = calculateFinancePayment({
      ...base,
      vehiclePrice: 40000,
      docFee: 500,
      salesTaxRate: 0.08,  // 8%
      apr: 0,
      termMonths: 60,
    })
    // taxableBase = 40000 + 500 = 40500; tax = 40500 * 0.08 = 3240
    expect(result.salesTax).toBeCloseTo(3240, 0)
  })

  it('higher doc fee increases total paid', () => {
    const low = calculateFinancePayment({ ...base, docFee: 100, apr: 5.99, termMonths: 60 })
    const high = calculateFinancePayment({ ...base, docFee: 800, apr: 5.99, termMonths: 60 })
    expect(high.totalPaid).toBeGreaterThan(low.totalPaid)
  })

  it('registration fee is included in amountFinanced', () => {
    const noReg = calculateFinancePayment({ ...base, registrationFee: 0, apr: 0, termMonths: 60 })
    const withReg = calculateFinancePayment({ ...base, registrationFee: 200, apr: 0, termMonths: 60 })
    expect(withReg.amountFinanced - noReg.amountFinanced).toBe(200)
  })
})

// ─── Total interest ───────────────────────────────────────────────────────────
describe('calculateFinancePayment, interest calculations', () => {
  it('totalInterest is 0 at 0% APR', () => {
    const result = calculateFinancePayment({ ...base, apr: 0, termMonths: 60 })
    expect(result.totalInterest).toBeCloseTo(0, 2)
  })

  it('totalInterest increases with higher APR', () => {
    const low = calculateFinancePayment({ ...base, apr: 2.99, termMonths: 60 })
    const high = calculateFinancePayment({ ...base, apr: 9.99, termMonths: 60 })
    expect(high.totalInterest).toBeGreaterThan(low.totalInterest)
  })

  it('totalInterest increases with longer loan term', () => {
    const short = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 36 })
    const long  = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 72 })
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest)
  })

  it('shorter term has higher monthly but less total interest', () => {
    const short = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 36 })
    const long  = calculateFinancePayment({ ...base, apr: 5.99, termMonths: 72 })
    expect(short.monthlyPayment).toBeGreaterThan(long.monthlyPayment)
    expect(short.totalInterest).toBeLessThan(long.totalInterest)
  })
})

// ─── Real-world scenario ──────────────────────────────────────────────────────
describe('calculateFinancePayment, real-world Tesla Model 3 scenario', () => {
  it('$42,990 Model 3, $5k down, $7500 credit, 6.99% APR, 60 months, TX (6.25% tax, $599 doc)', () => {
    const result = calculateFinancePayment({
      vehiclePrice: 42990,
      downPayment: 5000,
      tradeInValue: 0,
      federalCredit: 7500,
      stateRebate: 0,
      salesTaxRate: 0.0625,
      docFee: 599,
      registrationFee: 150,
      otherFees: 50,  // title
      apr: 6.99,
      termMonths: 60,
    })
    // effectivePrice = 42990 - 7500 = 35490
    expect(result.effectivePriceWithCredit).toBe(35490)
    // Monthly should be well under $1,000 with credit applied
    expect(result.monthlyPayment).toBeLessThan(1000)
    expect(result.monthlyPayment).toBeGreaterThan(500)
    // Total interest should be positive
    expect(result.totalInterest).toBeGreaterThan(0)
    // sanity: totalPaid > amountFinanced
    expect(result.totalPaid).toBeGreaterThan(result.amountFinanced)
  })
})
