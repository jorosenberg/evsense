/**
 * depreciationCalculator.test.js
 *
 * Tests for buildDepreciationCurve() and calculateDepreciationLoss().
 */
import { describe, it, expect } from 'vitest'
import { buildDepreciationCurve, calculateDepreciationLoss } from '../utils/depreciationCalculator.js'

// ─── Shared fixture ───────────────────────────────────────────────────────────
// Tesla Model 3-like depreciation (iSeeCars / CarEdge data)
const testDepreciation = {
  year1Percent: 18,
  year2Percent: 29,
  year3Percent: 36,
  year5Percent: 47,
}
const MSRP = 45000

// ─── buildDepreciationCurve ───────────────────────────────────────────────────
describe('buildDepreciationCurve', () => {
  it('returns year 0 value equal to MSRP', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    expect(curve[0].value).toBe(MSRP)
    expect(curve[0].percentLost).toBe(0)
    expect(curve[0].dollarLost).toBe(0)
  })

  it('curve length = ownershipYears + 1 (year 0 through ownershipYears)', () => {
    const curve3 = buildDepreciationCurve(MSRP, testDepreciation, 3)
    const curve5 = buildDepreciationCurve(MSRP, testDepreciation, 5)
    expect(curve3).toHaveLength(4)  // years 0, 1, 2, 3
    expect(curve5).toHaveLength(6)  // years 0, 1, 2, 3, 4, 5
  })

  it('year 1 value reflects year1Percent depreciation', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    const yr1 = curve[1]
    // 18% lost → value = 45000 * 0.82 = 36900
    expect(yr1.percentLost).toBe(18)
    expect(yr1.value).toBe(Math.round(MSRP * 0.82))
  })

  it('year 5 value reflects year5Percent depreciation', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    const yr5 = curve[5]
    // 47% lost → value = 45000 * 0.53 = 23850
    expect(yr5.percentLost).toBe(47)
    expect(yr5.value).toBe(Math.round(MSRP * 0.53))
  })

  it('year 4 is interpolated between year 3 and year 5', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    const yr3 = curve[3]
    const yr4 = curve[4]
    const yr5 = curve[5]
    // Year 4 should be between year 3 and year 5 percentages
    expect(yr4.percentLost).toBeGreaterThan(yr3.percentLost)
    expect(yr4.percentLost).toBeLessThan(yr5.percentLost)
    // Midpoint: (36 + 47) / 2 = 41.5
    expect(yr4.percentLost).toBeCloseTo(41.5, 0)
  })

  it('values decrease monotonically over time', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 8)
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].value).toBeLessThanOrEqual(curve[i - 1].value)
    }
  })

  it('uses defaults when depreciationData is null/undefined', () => {
    const curve = buildDepreciationCurve(MSRP, null, 5)
    // Defaults: year1=20%, year2=31%, year3=38%, year5=49%
    expect(curve[1].percentLost).toBe(20)
    expect(curve[5].percentLost).toBe(49)
  })

  it('extrapolates beyond year 5 at 5%/yr', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 8)
    const yr5 = curve[5]
    const yr6 = curve[6]
    const yr8 = curve[8]
    expect(yr6.percentLost).toBeCloseTo(yr5.percentLost + 5, 2)
    expect(yr8.percentLost).toBeCloseTo(yr5.percentLost + 15, 2)
  })

  it('caps depreciation at 95%', () => {
    // 40 years would extrapolate well past 95%
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 10)
    curve.forEach(pt => {
      expect(pt.percentLost).toBeLessThanOrEqual(95)
    })
  })

  it('dollarLost = MSRP * percentLost / 100 (rounded)', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    curve.forEach(pt => {
      expect(pt.dollarLost).toBe(Math.round(MSRP * pt.percentLost / 100))
    })
  })

  it('value + dollarLost = MSRP (within rounding)', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 5)
    curve.forEach(pt => {
      // Due to Math.round, may differ by at most $1
      expect(Math.abs(pt.value + pt.dollarLost - MSRP)).toBeLessThanOrEqual(1)
    })
  })

  it('year labels are correct', () => {
    const curve = buildDepreciationCurve(MSRP, testDepreciation, 3)
    expect(curve[0].label).toBe('Purchase')
    expect(curve[1].label).toBe('Year 1')
    expect(curve[3].label).toBe('Year 3')
  })
})

// ─── calculateDepreciationLoss ────────────────────────────────────────────────
describe('calculateDepreciationLoss', () => {
  it('initialValue = MSRP', () => {
    const r = calculateDepreciationLoss(MSRP, testDepreciation, 5)
    expect(r.initialValue).toBe(MSRP)
  })

  it('finalValue matches curve year-5 value', () => {
    const r = calculateDepreciationLoss(MSRP, testDepreciation, 5)
    // 47% lost → 45000 * 0.53 = 23850
    expect(r.finalValue).toBe(Math.round(MSRP * 0.53))
  })

  it('totalLoss = initialValue − finalValue', () => {
    const r = calculateDepreciationLoss(MSRP, testDepreciation, 5)
    expect(r.totalLoss).toBe(r.initialValue - r.finalValue)
  })

  it('monthlyLoss = totalLoss / (ownershipYears × 12)', () => {
    const r = calculateDepreciationLoss(MSRP, testDepreciation, 5)
    expect(r.monthlyLoss).toBeCloseTo(r.totalLoss / 60, 2)
  })

  it('curve is included in return value', () => {
    const r = calculateDepreciationLoss(MSRP, testDepreciation, 5)
    expect(Array.isArray(r.curve)).toBe(true)
    expect(r.curve.length).toBeGreaterThan(0)
  })

  it('longer ownership period = more total loss', () => {
    const short = calculateDepreciationLoss(MSRP, testDepreciation, 3)
    const long  = calculateDepreciationLoss(MSRP, testDepreciation, 7)
    expect(long.totalLoss).toBeGreaterThan(short.totalLoss)
    expect(long.finalValue).toBeLessThan(short.finalValue)
  })

  it('higher MSRP = proportionally higher dollar loss', () => {
    const small = calculateDepreciationLoss(30000, testDepreciation, 5)
    const large = calculateDepreciationLoss(90000, testDepreciation, 5)
    // Both 47% lost: ratio should be 3:1
    expect(large.totalLoss / small.totalLoss).toBeCloseTo(3, 2)
  })
})
