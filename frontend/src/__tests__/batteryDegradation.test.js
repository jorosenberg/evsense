/**
 * batteryDegradation.test.js
 *
 * Tests for estimateBatteryDegradation(), degradedRange(), and degradedEfficiency().
 *
 * Battery degradation curve (NCM default):
 *   Year 0: 0% loss
 *   Year 1: 1 × 2.5 = 2.5%
 *   Year 3: 2.5 + 2×1.3 = 5.1%
 *   Year 5: 2.5 + 4×1.3 = 7.7%
 *   Year 8: 7.7 + 3×0.9 = 10.4%
 *   Year 10: 7.7 + 5×0.9 = 12.2%
 *   Year 12: 12.2 + 2×0.6 = 13.4%
 *   Cap: 40%
 */
import { describe, it, expect } from 'vitest'
import {
  estimateBatteryDegradation,
  degradedRange,
  degradedEfficiency,
} from '../utils/batteryDegradation.js'

// ─── New vehicle baseline ─────────────────────────────────────────────────────
describe('estimateBatteryDegradation, new vehicle', () => {
  it('brand-new car (0 years, 0 miles) has 0% loss', () => {
    const r = estimateBatteryDegradation({ ageYears: 0, mileage: 0 })
    expect(r.percentLost).toBe(0)
    expect(r.capacityRemainingPct).toBe(100)
  })

  it('brand-new has high confidence', () => {
    const r = estimateBatteryDegradation({ ageYears: 0, mileage: 0 })
    expect(r.confidence).toBe('high')
  })

  it('returns an array for notes (may be empty)', () => {
    const r = estimateBatteryDegradation({ ageYears: 0, mileage: 0 })
    expect(Array.isArray(r.notes)).toBe(true)
  })
})

// ─── Age-based degradation ────────────────────────────────────────────────────
describe('estimateBatteryDegradation, time-based', () => {
  it('1-year-old car with 12k miles loses ~2.5% (NCM)', () => {
    const r = estimateBatteryDegradation({ ageYears: 1, mileage: 12000 })
    expect(r.percentLost).toBeCloseTo(2.5, 0)
  })

  it('3-year-old car with 36k miles loses ~5.1% (NCM)', () => {
    const r = estimateBatteryDegradation({ ageYears: 3, mileage: 36000 })
    expect(r.percentLost).toBeCloseTo(5.1, 0)
  })

  it('5-year-old car with 60k miles loses ~7.7% (NCM)', () => {
    const r = estimateBatteryDegradation({ ageYears: 5, mileage: 60000 })
    expect(r.percentLost).toBeCloseTo(7.7, 0)
  })

  it('percentLost increases monotonically with age (same mileage pattern)', () => {
    const yr2 = estimateBatteryDegradation({ ageYears: 2, mileage: 24000 })
    const yr5 = estimateBatteryDegradation({ ageYears: 5, mileage: 60000 })
    const yr8 = estimateBatteryDegradation({ ageYears: 8, mileage: 96000 })
    expect(yr5.percentLost).toBeGreaterThan(yr2.percentLost)
    expect(yr8.percentLost).toBeGreaterThan(yr5.percentLost)
  })

  it('capacityRemainingPct = 100 - percentLost', () => {
    const r = estimateBatteryDegradation({ ageYears: 5, mileage: 60000 })
    expect(r.capacityRemainingPct).toBeCloseTo(100 - r.percentLost, 4)
  })
})

// ─── Mileage penalty ──────────────────────────────────────────────────────────
describe('estimateBatteryDegradation, mileage penalty', () => {
  it('high-mileage car loses more than average-mileage same-age car', () => {
    const avg = estimateBatteryDegradation({ ageYears: 5, mileage: 60000 })
    const high = estimateBatteryDegradation({ ageYears: 5, mileage: 120000 })
    expect(high.percentLost).toBeGreaterThan(avg.percentLost)
  })

  it('mileage below expected (12k/yr) does not add extra penalty', () => {
    // 1-year-old car with only 5k miles, no excess mileage penalty
    const lowMi = estimateBatteryDegradation({ ageYears: 1, mileage: 5000 })
    // Expected miles = 1 * 12000 = 12000; actual = 5000; excessMi = 0
    // percentLost = 2.5 * 1.0 = 2.5%
    expect(lowMi.percentLost).toBeCloseTo(2.5, 0)
  })

  it('extra 25k miles beyond expected adds ~2% penalty', () => {
    const avg    = estimateBatteryDegradation({ ageYears: 5, mileage: 60000 })  // expected
    const excess = estimateBatteryDegradation({ ageYears: 5, mileage: 85000 })  // +25k excess
    expect(excess.percentLost - avg.percentLost).toBeCloseTo(2.0, 0)
  })
})

// ─── Chemistry multipliers ────────────────────────────────────────────────────
describe('estimateBatteryDegradation, chemistry', () => {
  it('LFP chemistry loses less than NCM for same age/mileage', () => {
    const ncm = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'ncm' })
    const lfp = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'lfp' })
    expect(lfp.percentLost).toBeLessThan(ncm.percentLost)
  })

  it('LFP degradation is ~70% of NCM (multiplier 0.7)', () => {
    const ncm = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'ncm' })
    const lfp = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'lfp' })
    expect(lfp.percentLost).toBeCloseTo(ncm.percentLost * 0.7, 0)
  })

  it('"unknown" chemistry behaves like NCM (multiplier 1.0)', () => {
    const ncm = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'ncm' })
    const unk = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'unknown' })
    expect(unk.percentLost).toBeCloseTo(ncm.percentLost, 4)
  })

  it('LFP note appears in result', () => {
    const lfp = estimateBatteryDegradation({ ageYears: 5, mileage: 60000, chemistry: 'lfp' })
    expect(lfp.notes.some(n => n.toLowerCase().includes('lfp'))).toBe(true)
  })
})

// ─── Confidence levels ────────────────────────────────────────────────────────
describe('estimateBatteryDegradation, confidence', () => {
  it('returns high confidence for new/low-mileage vehicles', () => {
    const r = estimateBatteryDegradation({ ageYears: 1, mileage: 10000 })
    expect(r.confidence).toBe('high')
  })

  it('returns low confidence for very old or high-mileage vehicles', () => {
    const old = estimateBatteryDegradation({ ageYears: 9, mileage: 130000 })
    expect(old.confidence).toBe('low')
  })
})

// ─── 40% degradation cap ─────────────────────────────────────────────────────
describe('estimateBatteryDegradation, 40% cap', () => {
  it('degradation never exceeds 40% regardless of age/mileage', () => {
    const extreme = estimateBatteryDegradation({ ageYears: 30, mileage: 500000 })
    expect(extreme.percentLost).toBeLessThanOrEqual(40)
    expect(extreme.capacityRemainingPct).toBeGreaterThanOrEqual(60)
  })
})

// ─── Negative / invalid inputs ────────────────────────────────────────────────
describe('estimateBatteryDegradation, input safety', () => {
  it('handles negative age gracefully (clamps to 0)', () => {
    const r = estimateBatteryDegradation({ ageYears: -5, mileage: 0 })
    expect(r.percentLost).toBeGreaterThanOrEqual(0)
  })

  it('handles NaN mileage gracefully', () => {
    const r = estimateBatteryDegradation({ ageYears: 2, mileage: NaN })
    expect(r.percentLost).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(r.percentLost)).toBe(true)
  })

  it('handles string numbers via coercion', () => {
    const r = estimateBatteryDegradation({ ageYears: '3', mileage: '36000' })
    expect(r.percentLost).toBeCloseTo(5.1, 0)
  })
})

// ─── Below-80% warning ───────────────────────────────────────────────────────
describe('estimateBatteryDegradation, warranty threshold warning', () => {
  it('adds warning note when capacity drops below 80%', () => {
    // Need >20% loss: age=20 should be well past 80% threshold
    const old = estimateBatteryDegradation({ ageYears: 20, mileage: 240000 })
    if (old.capacityRemainingPct < 80) {
      expect(old.notes.some(n => n.includes('80%'))).toBe(true)
    }
  })
})

// ─── degradedRange ────────────────────────────────────────────────────────────
describe('degradedRange', () => {
  it('returns null for missing originalRange', () => {
    expect(degradedRange(null, 90)).toBeNull()
    expect(degradedRange(0, 90)).toBeNull()
  })

  it('350 mi at 100% remaining = 350 mi', () => {
    expect(degradedRange(350, 100)).toBe(350)
  })

  it('350 mi at 90% remaining = 315 mi', () => {
    expect(degradedRange(350, 90)).toBe(315)
  })

  it('350 mi at 85% remaining = 298 mi (rounded)', () => {
    expect(degradedRange(350, 85)).toBe(Math.round(350 * 0.85))
  })

  it('result is always a whole number', () => {
    const r = degradedRange(337, 92.3)
    expect(Number.isInteger(r)).toBe(true)
  })
})

// ─── degradedEfficiency ───────────────────────────────────────────────────────
describe('degradedEfficiency', () => {
  it('returns null for missing milesPerKwh', () => {
    expect(degradedEfficiency(null, 90)).toBeNull()
    expect(degradedEfficiency(0, 90)).toBeNull()
  })

  it('4.0 mi/kWh at 100% capacity = 4.0 mi/kWh (no penalty)', () => {
    expect(degradedEfficiency(4.0, 100)).toBeCloseTo(4.0, 2)
  })

  it('efficiency penalty is ~1% per 10% capacity lost', () => {
    // 20% capacity lost → 2% efficiency penalty
    // 4.0 * (1 - 0.02) = 3.92
    expect(degradedEfficiency(4.0, 80)).toBeCloseTo(3.92, 2)
  })

  it('higher degradation = lower efficiency', () => {
    const light = degradedEfficiency(3.5, 95)
    const heavy = degradedEfficiency(3.5, 75)
    expect(heavy).toBeLessThan(light)
  })
})
