/**
 * chargingCostCalculator.test.js
 *
 * Tests for calculateChargingCosts(), costPer1000Miles(), and calculateGasCost().
 */
import { describe, it, expect } from 'vitest'
import {
  calculateChargingCosts,
  costPer1000Miles,
  calculateGasCost,
} from '../utils/chargingCostCalculator.js'

// ─── Default mix scenario ─────────────────────────────────────────────────────
describe('calculateChargingCosts — default mix (80/10/10)', () => {
  const result = calculateChargingCosts({
    annualMiles: 12000,
    milesPerKwh: 4.0,
    homeRateCentsPerKwh: 18,
    hasOffPeakRate: false,
    l2PublicRateDollarsPerKwh: 0.22,
    dcfcRateDollarsPerKwh: 0.35,
    chargingMixPercent: { home: 80, publicL2: 10, dcFast: 10 },
    subscriptionMonthlyFee: 0,
  })

  it('annual kWh = annualMiles / milesPerKwh', () => {
    // 12000 / 4.0 = 3000 kWh
    expect(result.annualKwh).toBeCloseTo(3000, 2)
  })

  it('home annual cost = homeKwh * homeRate', () => {
    // homeKwh = 3000 * 0.8 = 2400; cost = 2400 * 0.18 = $432
    expect(result.annualHomeCost).toBeCloseTo(432, 1)
  })

  it('L2 annual cost = l2Kwh * l2Rate', () => {
    // l2Kwh = 3000 * 0.1 = 300; cost = 300 * 0.22 = $66
    expect(result.annualL2Cost).toBeCloseTo(66, 1)
  })

  it('DCFC annual cost = dcfcKwh * dcfcRate', () => {
    // dcfcKwh = 3000 * 0.1 = 300; cost = 300 * 0.35 = $105
    expect(result.annualDcfcCost).toBeCloseTo(105, 1)
  })

  it('annual total = sum of all sources', () => {
    // 432 + 66 + 105 = $603
    expect(result.annualTotal).toBeCloseTo(603, 1)
  })

  it('monthlyTotal = annualTotal / 12', () => {
    expect(result.monthlyTotal).toBeCloseTo(result.annualTotal / 12, 4)
  })

  it('costPerMile = annualTotal / annualMiles', () => {
    expect(result.costPerMile).toBeCloseTo(result.annualTotal / 12000, 5)
  })
})

// ─── All home charging ────────────────────────────────────────────────────────
describe('calculateChargingCosts — 100% home charging', () => {
  it('L2 and DCFC costs are 0 when 100% home', () => {
    const r = calculateChargingCosts({
      annualMiles: 12000,
      milesPerKwh: 3.5,
      homeRateCentsPerKwh: 15,
      hasOffPeakRate: false,
      chargingMixPercent: { home: 100, publicL2: 0, dcFast: 0 },
    })
    expect(r.annualL2Cost).toBe(0)
    expect(r.annualDcfcCost).toBe(0)
    expect(r.annualHomeCost).toBeGreaterThan(0)
  })
})

// ─── Off-peak rate ────────────────────────────────────────────────────────────
describe('calculateChargingCosts — off-peak rate', () => {
  it('off-peak rate reduces home charging cost vs standard rate', () => {
    const standard = calculateChargingCosts({
      annualMiles: 12000,
      milesPerKwh: 4.0,
      homeRateCentsPerKwh: 18,
      hasOffPeakRate: false,
      chargingMixPercent: { home: 80, publicL2: 10, dcFast: 10 },
    })
    const offPeak = calculateChargingCosts({
      annualMiles: 12000,
      milesPerKwh: 4.0,
      homeRateCentsPerKwh: 18,
      hasOffPeakRate: true,
      offPeakRateCentsPerKwh: 9,
      chargingMixPercent: { home: 80, publicL2: 10, dcFast: 10 },
    })
    // Off-peak blended: 18*0.2 + 9*0.8 = 3.6 + 7.2 = 10.8¢/kWh < 18¢
    expect(offPeak.annualHomeCost).toBeLessThan(standard.annualHomeCost)
    expect(offPeak.annualTotal).toBeLessThan(standard.annualTotal)
  })
})

// ─── Charging network subscription ───────────────────────────────────────────
describe('calculateChargingCosts — subscription fee', () => {
  it('$12.99/mo subscription adds $155.88/yr to annual total', () => {
    const noSub = calculateChargingCosts({
      annualMiles: 12000, milesPerKwh: 4, homeRateCentsPerKwh: 18, hasOffPeakRate: false,
    })
    const withSub = calculateChargingCosts({
      annualMiles: 12000, milesPerKwh: 4, homeRateCentsPerKwh: 18, hasOffPeakRate: false,
      subscriptionMonthlyFee: 12.99,
    })
    expect(withSub.annualTotal - noSub.annualTotal).toBeCloseTo(12.99 * 12, 1)
    expect(withSub.annualSubscriptionCost).toBeCloseTo(155.88, 1)
  })
})

// ─── Efficiency sensitivity ───────────────────────────────────────────────────
describe('calculateChargingCosts — efficiency sensitivity', () => {
  it('more efficient vehicle (higher mi/kWh) costs less to charge', () => {
    const lowEff = calculateChargingCosts({ annualMiles: 12000, milesPerKwh: 3.0, homeRateCentsPerKwh: 18, hasOffPeakRate: false })
    const hiEff  = calculateChargingCosts({ annualMiles: 12000, milesPerKwh: 5.0, homeRateCentsPerKwh: 18, hasOffPeakRate: false })
    expect(hiEff.annualTotal).toBeLessThan(lowEff.annualTotal)
  })

  it('doubling milesPerKwh halves annualKwh', () => {
    const a = calculateChargingCosts({ annualMiles: 12000, milesPerKwh: 2.0, homeRateCentsPerKwh: 15, hasOffPeakRate: false })
    const b = calculateChargingCosts({ annualMiles: 12000, milesPerKwh: 4.0, homeRateCentsPerKwh: 15, hasOffPeakRate: false })
    expect(b.annualKwh).toBeCloseTo(a.annualKwh / 2, 2)
  })
})

// ─── costPer1000Miles ─────────────────────────────────────────────────────────
describe('costPer1000Miles', () => {
  it('4 mi/kWh at $0.15/kWh = $37.50 per 1,000 miles', () => {
    expect(costPer1000Miles(4.0, 0.15)).toBeCloseTo(37.5, 1)
  })

  it('3.5 mi/kWh at $0.18/kWh = $51.43 per 1,000 miles', () => {
    expect(costPer1000Miles(3.5, 0.18)).toBeCloseTo(51.43, 1)
  })
})

// ─── calculateGasCost ─────────────────────────────────────────────────────────
describe('calculateGasCost', () => {
  it('12,000 mi at 28 mpg and $3.50/gal = ~$1,500/yr', () => {
    const r = calculateGasCost(12000, 3.50, 28)
    expect(r.annualCost).toBeCloseTo(12000 / 28 * 3.50, 0)
    expect(r.monthlyCost).toBeCloseTo(r.annualCost / 12, 2)
  })

  it('costPerMile = gasPrice / mpg', () => {
    const r = calculateGasCost(12000, 4.00, 25)
    expect(r.costPerMile).toBeCloseTo(4.00 / 25, 4)
  })

  it('higher gas price increases annual cost proportionally', () => {
    const cheap = calculateGasCost(15000, 3.00, 30)
    const pricey = calculateGasCost(15000, 5.00, 30)
    expect(pricey.annualCost / cheap.annualCost).toBeCloseTo(5.0 / 3.0, 4)
  })
})
