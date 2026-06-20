/**
 * leaseCalculator.test.js
 *
 * Tests for calculateLeasePayment(), mfToApr(), aprToMf(),
 * leaseScoreLabel(), and percentageRuleLabel().
 *
 * Monthly payment formula (LeaseHackr-style):
 *   adjustedCapCost = sellingPrice + acqFee + docFee − capCostReduction − rebates
 *   residual = MSRP × residualPercent%
 *   depFee = (adjCap − residual) / termMonths
 *   finFee = (adjCap + residual) × moneyFactor
 *   base   = depFee + finFee
 *   total  = base × (1 + salesTaxRate)   [in most states]
 */
import { describe, it, expect } from 'vitest'
import {
  calculateLeasePayment,
  mfToApr,
  aprToMf,
  leaseScoreLabel,
  percentageRuleLabel,
} from '../utils/leaseCalculator.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Zero-friction base: no tax, no rebates, no MSDs, no one-pay */
const base = {
  msrp: 50000,
  sellingPrice: 48000,
  residualPercent: 50,     // $25,000 residual
  moneyFactor: 0.00125,   // APR equiv ~3.0%
  termMonths: 36,
  mileagePerYear: 10000,
  capCostReduction: 0,
  acquisitionFee: 695,
  dispositionFee: 395,
  docFee: 499,
  salesTaxRate: 0,         // no tax for math clarity
  leaseCapCostTaxed: false,
  rebatesAppliedTo: 'cap',
  stateRebate: 0,
  federalCredit: 0,
  msdCount: 0,
  isOnePay: false,
}

// ─── Core monthly payment ─────────────────────────────────────────────────────
describe('calculateLeasePayment — core monthly math', () => {
  it('produces correct adjustedCapCost', () => {
    const r = calculateLeasePayment(base)
    // grossCapCost = 48000 + 695 + 499 = 49194
    // adjustedCap = 49194 - 0 (no reduction) - 0 (no rebates) = 49194
    expect(r.adjustedCapCost).toBe(49194)
  })

  it('produces correct residualValue', () => {
    const r = calculateLeasePayment(base)
    // residual = 50000 * 0.50 = 25000
    expect(r.residualValue).toBe(25000)
  })

  it('depreciationFee is (adjCap − residual) / termMonths', () => {
    const r = calculateLeasePayment(base)
    // (49194 - 25000) / 36 = 24194 / 36 ≈ 672.06
    expect(r.depreciationFee).toBeCloseTo(672.06, 1)
  })

  it('financeFee is (adjCap + residual) × moneyFactor', () => {
    const r = calculateLeasePayment(base)
    // (49194 + 25000) * 0.00125 = 74194 * 0.00125 = 92.74
    expect(r.financeFee).toBeCloseTo(92.74, 1)
  })

  it('baseMonthly = depFee + finFee', () => {
    const r = calculateLeasePayment(base)
    expect(r.baseMonthly).toBeCloseTo(r.depreciationFee + r.financeFee, 5)
  })

  it('totalMonthly equals baseMonthly with 0% tax', () => {
    const r = calculateLeasePayment(base)
    expect(r.totalMonthly).toBeCloseTo(r.baseMonthly, 5)
  })

  it('sales tax adds to monthly (non-cap-cost-taxed states)', () => {
    const noTax = calculateLeasePayment(base)
    const withTax = calculateLeasePayment({ ...base, salesTaxRate: 0.08 })
    expect(withTax.totalMonthly).toBeCloseTo(noTax.baseMonthly * 1.08, 1)
  })
})

// ─── Selling price vs MSRP discount ──────────────────────────────────────────
describe('calculateLeasePayment — selling price effect', () => {
  it('lower selling price reduces monthly payment', () => {
    const atMsrp = calculateLeasePayment({ ...base, sellingPrice: 50000 })
    const discounted = calculateLeasePayment({ ...base, sellingPrice: 46000 })
    expect(discounted.totalMonthly).toBeLessThan(atMsrp.totalMonthly)
  })

  it('selling price does not affect residual (residual is % of MSRP)', () => {
    const a = calculateLeasePayment({ ...base, sellingPrice: 50000 })
    const b = calculateLeasePayment({ ...base, sellingPrice: 44000 })
    expect(a.residualValue).toBe(b.residualValue)
  })
})

// ─── Rebates & credits ────────────────────────────────────────────────────────
describe('calculateLeasePayment — rebates and federal credit', () => {
  it('state rebate applied to cap reduces adjustedCapCost', () => {
    const noRebate = calculateLeasePayment(base)
    const withRebate = calculateLeasePayment({ ...base, stateRebate: 2000 })
    expect(noRebate.adjustedCapCost - withRebate.adjustedCapCost).toBe(2000)
  })

  it('federal credit applied to cap reduces monthly payment', () => {
    const noCredit = calculateLeasePayment(base)
    const withCredit = calculateLeasePayment({ ...base, federalCredit: 7500 })
    expect(withCredit.totalMonthly).toBeLessThan(noCredit.totalMonthly)
    expect(noCredit.adjustedCapCost - withCredit.adjustedCapCost).toBe(7500)
  })

  it('rebates applied to drive-off do not reduce cap cost', () => {
    const toCap = calculateLeasePayment({ ...base, stateRebate: 2000, rebatesAppliedTo: 'cap' })
    const toDriveOff = calculateLeasePayment({ ...base, stateRebate: 2000, rebatesAppliedTo: 'driveoff' })
    expect(toCap.adjustedCapCost).toBeLessThan(toDriveOff.adjustedCapCost)
    // Monthly will be lower when applied to cap
    expect(toCap.totalMonthly).toBeLessThan(toDriveOff.totalMonthly)
  })
})

// ─── Money factor & MSD ───────────────────────────────────────────────────────
describe('calculateLeasePayment — money factor and MSDs', () => {
  it('lower money factor reduces monthly payment', () => {
    const high = calculateLeasePayment({ ...base, moneyFactor: 0.00200 })
    const low  = calculateLeasePayment({ ...base, moneyFactor: 0.00050 })
    expect(low.totalMonthly).toBeLessThan(high.totalMonthly)
  })

  it('each MSD reduces effective MF by 0.00007', () => {
    const r = calculateLeasePayment({ ...base, msdCount: 3 })
    // effectiveMF = 0.00125 - 3*0.00007 = 0.00125 - 0.00021 = 0.00104
    expect(r.effectiveMoneyFactor).toBeCloseTo(0.00104, 5)
  })

  it('MSDs reduce monthly payment vs no MSDs', () => {
    const noMsd  = calculateLeasePayment(base)
    const withMsd = calculateLeasePayment({ ...base, msdCount: 7 })
    expect(withMsd.totalMonthly).toBeLessThan(noMsd.totalMonthly)
    expect(withMsd.msdAmount).toBeGreaterThan(0)
  })

  it('effective MF cannot go below 0', () => {
    // Extreme MSD count should floor at 0
    const r = calculateLeasePayment({ ...base, msdCount: 20, moneyFactor: 0.00050 })
    expect(r.effectiveMoneyFactor).toBeGreaterThanOrEqual(0)
  })
})

// ─── Cap cost taxed states (TX, MN, OH) ───────────────────────────────────────
describe('calculateLeasePayment — cap cost taxed states', () => {
  it('leaseCapCostTaxed=true charges upfront tax instead of monthly tax', () => {
    const normal = calculateLeasePayment({ ...base, salesTaxRate: 0.0625, leaseCapCostTaxed: false })
    const capTaxed = calculateLeasePayment({ ...base, salesTaxRate: 0.0625, leaseCapCostTaxed: true })

    // In cap-cost-taxed states, monthly tax is 0, upfront tax is substantial
    expect(capTaxed.monthlyTax).toBe(0)
    expect(capTaxed.upfrontTax).toBeGreaterThan(0)

    // Monthly should be lower (tax is moved to upfront)
    expect(capTaxed.totalMonthly).toBeLessThan(normal.totalMonthly)
  })
})

// ─── 1% rule and LeaseHackr score ────────────────────────────────────────────
describe('calculateLeasePayment — 1% rule and LH score', () => {
  it('percentageRule = totalMonthly / MSRP * 100', () => {
    const r = calculateLeasePayment(base)
    expect(r.percentageRule).toBeCloseTo((r.totalMonthly / base.msrp) * 100, 4)
  })

  it('reports correctly when well under 1% rule', () => {
    // Force a cheap lease: very low MF, high residual, deep discount
    const cheap = calculateLeasePayment({
      ...base,
      sellingPrice: 40000,
      residualPercent: 60,
      moneyFactor: 0.00050,
      capCostReduction: 5000,
    })
    expect(cheap.percentageRule).toBeLessThan(1.0)
  })
})

// ─── One-pay lease ────────────────────────────────────────────────────────────
describe('calculateLeasePayment — one-pay lease', () => {
  it('returns onePay object when isOnePay=true', () => {
    const r = calculateLeasePayment({ ...base, isOnePay: true })
    expect(r.onePay).not.toBeNull()
    expect(r.onePay.totalOnePay).toBeGreaterThan(0)
    expect(r.onePay.effectiveMonthly).toBeGreaterThan(0)
  })

  it('one-pay totalOnePay is a reasonable lump-sum (less than paying 37 standard months)', () => {
    // One-pay collapses all 36 payments + fees into a single upfront amount.
    // It should be less than paying 37 standard months (36 monthly + first DAS).
    const standard = calculateLeasePayment(base)
    const onePay = calculateLeasePayment({ ...base, isOnePay: true })
    expect(onePay.onePay.totalOnePay).toBeLessThan(standard.totalMonthly * 37)
  })

  it('onePay is null when isOnePay=false', () => {
    const r = calculateLeasePayment(base)
    expect(r.onePay).toBeNull()
  })
})

// ─── Helper function tests ────────────────────────────────────────────────────
describe('mfToApr', () => {
  it('converts 0.00125 MF to 3.00% APR', () => {
    expect(Number(mfToApr(0.00125))).toBeCloseTo(3.0, 1)
  })
  it('converts 0.00250 MF to 6.00% APR', () => {
    expect(Number(mfToApr(0.00250))).toBeCloseTo(6.0, 1)
  })
})

describe('aprToMf', () => {
  it('converts 3.0% APR to 0.00125 MF', () => {
    expect(aprToMf(3.0)).toBeCloseTo(0.00125, 5)
  })
  it('is the inverse of mfToApr', () => {
    const mf = 0.00180
    expect(aprToMf(Number(mfToApr(mf)))).toBeCloseTo(mf, 5)
  })
})

describe('leaseScoreLabel', () => {
  it('labels score < 0.8 as Exceptional', () => {
    expect(leaseScoreLabel(0.7).label).toBe('Exceptional')
  })
  it('labels score 0.9 as Great', () => {
    expect(leaseScoreLabel(0.9).label).toBe('Great')
  })
  it('labels score 1.1 as Good', () => {
    expect(leaseScoreLabel(1.1).label).toBe('Good')
  })
  it('labels score 1.3 as Fair', () => {
    expect(leaseScoreLabel(1.3).label).toBe('Fair')
  })
  it('labels score ≥ 1.5 as Poor', () => {
    expect(leaseScoreLabel(1.5).label).toBe('Poor')
  })
})

describe('percentageRuleLabel', () => {
  it('passes at exactly 1%', () => {
    expect(percentageRuleLabel(1.0).label).toContain('Passes')
  })
  it('near at 1.1%', () => {
    expect(percentageRuleLabel(1.1).label).toContain('Near')
  })
  it('fails at 1.5%', () => {
    expect(percentageRuleLabel(1.5).label).toContain('Exceeds')
  })
})
