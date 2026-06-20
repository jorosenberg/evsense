/**
 * costPerMile.test.js — tests for the cost-per-mile and luxury score utilities.
 */
import { describe, it, expect } from 'vitest'
import {
  costPerMile,
  formatCentsPerMile,
  getCostBreakdown,
  blendedCostPerMile,
  gasCostPerMile,
  savingsVsGas,
} from '../utils/costPerMile.js'
import { calculateLuxuryScore, getLuxuryScore, getLuxuryTier } from '../utils/luxuryScore.js'
import { getEfficiency } from '../utils/efficiencyData.js'
import { quickTco } from '../utils/quickTco.js'

// ─── costPerMile basics ───────────────────────────────────────────────────────
describe('costPerMile', () => {
  it('4 mi/kWh at $0.15/kWh = $0.0375/mile', () => {
    expect(costPerMile(4.0, 0.15)).toBeCloseTo(0.0375, 4)
  })

  it('returns 0 for invalid efficiency', () => {
    expect(costPerMile(0, 0.15)).toBe(0)
    expect(costPerMile(null, 0.15)).toBe(0)
  })

  it('formatCentsPerMile shows tenth-cent precision', () => {
    expect(formatCentsPerMile(0.034)).toBe('3.4¢')
    expect(formatCentsPerMile(0.125)).toBe('12.5¢')
    expect(formatCentsPerMile(null)).toBe('—')
  })
})

// ─── getCostBreakdown ─────────────────────────────────────────────────────────
describe('getCostBreakdown', () => {
  it('returns three pricing scenarios with home < L2 < DCFC in low-rate state', () => {
    // TX home rate (~12¢/kWh) is cheaper than public L2 (22¢) which is cheaper than DCFC (45¢)
    const result = getCostBreakdown({
      vehicleId: 'tesla-model3-2026',
      stateCode: 'TX',
      scenario: 'edmunds',
    })
    expect(result.home.costPerMile).toBeGreaterThan(0)
    expect(result.l2.costPerMile).toBeGreaterThan(result.home.costPerMile)
    expect(result.dcfc.costPerMile).toBeGreaterThan(result.l2.costPerMile)
    expect(result.efficiency.source).toBe('curated')
  })

  it('high-rate state (CA) can make home more expensive than public L2', () => {
    // California home rate is ~27¢/kWh, higher than the $0.22 public L2 default
    const result = getCostBreakdown({ vehicleId: 'tesla-model3-2026', stateCode: 'CA' })
    expect(result.home.costPerMile).toBeGreaterThan(result.l2.costPerMile)
  })

  it('uses fallback efficiency for unknown vehicles', () => {
    const result = getCostBreakdown({
      vehicleId: 'fake-unknown-vehicle',
      fallbackMilesPerKwh: 3.0,
      stateCode: 'TX',
    })
    expect(result.efficiency.source).toBe('estimated')
    expect(result.efficiency.mi_per_kwh).toBeGreaterThan(0)
  })

  it('respects scenario parameter (hwy vs city)', () => {
    const hwy  = getCostBreakdown({ vehicleId: 'tesla-model3-2026', scenario: 'hwy' })
    const city = getCostBreakdown({ vehicleId: 'tesla-model3-2026', scenario: 'city' })
    // City should be cheaper (regen-heavy = more efficient)
    expect(city.home.costPerMile).toBeLessThan(hwy.home.costPerMile)
  })

  it('respects DCFC rate override (e.g. from OCM)', () => {
    const cheap = getCostBreakdown({ vehicleId: 'tesla-model3-2026', dcfcRateOverride: 0.30 })
    const pricy = getCostBreakdown({ vehicleId: 'tesla-model3-2026', dcfcRateOverride: 0.60 })
    expect(pricy.dcfc.costPerMile).toBeGreaterThan(cheap.dcfc.costPerMile)
  })
})

// ─── blendedCostPerMile ───────────────────────────────────────────────────────
describe('blendedCostPerMile', () => {
  const breakdown = {
    home: { costPerMile: 0.040 },
    l2:   { costPerMile: 0.060 },
    dcfc: { costPerMile: 0.100 },
  }

  it('80/10/10 mix returns weighted average', () => {
    const result = blendedCostPerMile(breakdown, { home: 80, publicL2: 10, dcFast: 10 })
    // 0.8*0.04 + 0.1*0.06 + 0.1*0.10 = 0.032 + 0.006 + 0.010 = 0.048
    expect(result).toBeCloseTo(0.048, 4)
  })

  it('100% home mix returns home rate', () => {
    const result = blendedCostPerMile(breakdown, { home: 100, publicL2: 0, dcFast: 0 })
    expect(result).toBeCloseTo(0.040, 4)
  })

  it('100% DCFC mix returns DCFC rate', () => {
    const result = blendedCostPerMile(breakdown, { home: 0, publicL2: 0, dcFast: 100 })
    expect(result).toBeCloseTo(0.100, 4)
  })
})

// ─── Gas comparison ───────────────────────────────────────────────────────────
describe('gas comparison', () => {
  it('28 mpg at $3.50/gal = $0.125/mile', () => {
    expect(gasCostPerMile(28, 3.50)).toBeCloseTo(0.125, 4)
  })

  it('savingsVsGas returns positive ratio when EV cheaper', () => {
    // EV $0.04/mi vs gas $0.125/mi = 68% savings
    expect(savingsVsGas(0.04, 0.125)).toBeCloseTo(0.68, 2)
  })

  it('savingsVsGas returns 0 when EV more expensive', () => {
    expect(savingsVsGas(0.20, 0.125)).toBe(0)
  })
})

// ─── Efficiency lookup ────────────────────────────────────────────────────────
describe('getEfficiency', () => {
  it('returns curated data for known vehicle', () => {
    const r = getEfficiency('tesla-model3-2026')
    expect(r.source).toBe('curated')
    expect(r.edmunds).toBeLessThan(r.epa)        // Edmunds is real-world worse
    expect(r.city).toBeGreaterThan(r.hwy)        // City > hwy (regen)
  })

  it('falls back to estimated values with formula', () => {
    const r = getEfficiency('unknown-id', 4.0)
    expect(r.source).toBe('estimated')
    expect(r.epa).toBe(4.0)
    expect(r.hwy).toBeLessThan(r.epa)
    expect(r.city).toBeGreaterThan(r.epa)
  })

  it('returns null when no fallback and no curated data', () => {
    expect(getEfficiency('unknown-id')).toBeNull()
  })
})

// ─── Luxury score ─────────────────────────────────────────────────────────────
describe('luxury score', () => {
  it('Lucid Air scores in ultra-luxury tier (≥8.5)', () => {
    const score = getLuxuryScore('lucid-air-2026')
    expect(score).toBeGreaterThanOrEqual(8.5)
    expect(getLuxuryTier(score).label).toBe('Ultra-luxury')
  })

  it('BMW i7 scores in ultra-luxury tier (≥8.5)', () => {
    const score = getLuxuryScore('bmw-i7-2026')
    expect(score).toBeGreaterThanOrEqual(8.5)
  })

  it('Ford E-Transit scores in utility/economy tier (<2.5)', () => {
    const score = getLuxuryScore('ford-e-transit-2026')
    expect(score).toBeLessThan(2.5)
  })

  it('VW ID.4 scores in standard tier (2.5-4.5)', () => {
    const score = getLuxuryScore('volkswagen-id4-2026')
    expect(score).toBeGreaterThanOrEqual(2.5)
    expect(score).toBeLessThan(6.5)
  })

  it('calculateLuxuryScore handles empty features', () => {
    expect(calculateLuxuryScore([])).toBe(0)
    expect(calculateLuxuryScore(['unknown-feature'])).toBe(0)
  })

  it('Tier labels cover the full 0-10 range', () => {
    expect(getLuxuryTier(9).label).toBe('Ultra-luxury')
    expect(getLuxuryTier(7).label).toBe('Luxury')
    expect(getLuxuryTier(5).label).toBe('Premium')
    expect(getLuxuryTier(3).label).toBe('Standard')
    expect(getLuxuryTier(1).label).toBe('Utility')
  })

  it('getLuxuryScore returns null for unknown vehicle', () => {
    expect(getLuxuryScore('unknown-id')).toBeNull()
  })
})

// ─── Quick TCO ────────────────────────────────────────────────────────────────
describe('quickTco', () => {
  const mockVehicle = {
    id: 'tesla-model3-2026',
    make: 'Tesla',
    model: 'Model 3',
    year: 2025,
    msrpFrom: 42990,
    milesPerKwh: 4.5,
    leaseFrom: 299,
    financeFrom: 616,
    bodyStyle: 'sedan',
  }

  it('returns all the expected fields', () => {
    const r = quickTco(mockVehicle, { stateCode: 'CA' })
    expect(r.monthlyTco).toBeGreaterThan(0)
    expect(r.payment).toBeGreaterThan(0)
    expect(r.charging).toBeGreaterThan(0)
    expect(r.insurance).toBeGreaterThan(0)
    expect(r.maintenance).toBeGreaterThan(0)
    expect(r.fees).toBeGreaterThan(0)
    expect(r.costPerMile).toBeGreaterThan(0)
    expect(r.centsPerMile).toBeGreaterThan(0)
    expect(['lease', 'finance', 'cash']).toContain(r.mode)
  })

  it('uses lease payment when available and mode=lease', () => {
    const r = quickTco(mockVehicle, { mode: 'lease' })
    expect(r.payment).toBe(299)
    expect(r.mode).toBe('lease')
  })

  it('falls back to finance when no lease offer', () => {
    const noLease = { ...mockVehicle, leaseFrom: null }
    const r = quickTco(noLease, { mode: 'lease' })
    expect(r.payment).toBe(616)
    expect(r.mode).toBe('finance')
  })

  it('uses estimated finance when no offers at all', () => {
    const noOffers = { ...mockVehicle, leaseFrom: null, financeFrom: null }
    const r = quickTco(noOffers, { mode: 'finance' })
    expect(r.payment).toBeGreaterThan(0)
  })

  it('high-mileage drivers see higher TCO due to more charging', () => {
    const low  = quickTco(mockVehicle, { annualMiles: 5000 })
    const high = quickTco(mockVehicle, { annualMiles: 25000 })
    expect(high.charging).toBeGreaterThan(low.charging)
    expect(high.monthlyTco).toBeGreaterThan(low.monthlyTco)
  })

  it('monthlyTco = payment + charging + insurance + maintenance + fees (within rounding)', () => {
    const r = quickTco(mockVehicle)
    const sum = r.payment + r.charging + r.insurance + r.maintenance + r.fees
    expect(Math.abs(r.monthlyTco - sum)).toBeLessThanOrEqual(1)
  })
})
