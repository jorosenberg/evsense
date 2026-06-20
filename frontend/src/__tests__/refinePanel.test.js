/**
 * refinePanel.test.js — Verifies the pure `applyRefinements()` filter logic.
 */
import { describe, it, expect } from 'vitest'
import { applyRefinements, REFINE_DEFAULTS } from '../components/matcher/RefinePanel.jsx'

// ─── Helpers ────────────────────────────────────────────────────────────────
function fakeMatch({ id = 'x', range = 300, tco = 800, lux = 5, seats = 5, zeroToSixty = 6 } = {}) {
  return {
    vehicle: {
      id,
      rangeEpa: range,
      seatingCapacity: seats,
      zeroToSixty,
    },
    tco: { monthlyTco: tco, centsPerMile: 5 },
    luxuryScore: lux,
    score: 0.7,
    pct: 70,
  }
}

const SAMPLE = [
  fakeMatch({ id: 'a', range: 280, tco: 700,  lux: 4, seats: 5, zeroToSixty: 5.5 }),
  fakeMatch({ id: 'b', range: 410, tco: 1400, lux: 8, seats: 7, zeroToSixty: 3.5 }),
  fakeMatch({ id: 'c', range: 150, tco: 600,  lux: 2, seats: 2, zeroToSixty: 9.0 }),
  fakeMatch({ id: 'd', range: 520, tco: 2800, lux: 9.5, seats: 5, zeroToSixty: 2.5 }),
]

describe('applyRefinements', () => {
  it('default refinements pass everything through', () => {
    const out = applyRefinements(SAMPLE, REFINE_DEFAULTS)
    expect(out.map(m => m.vehicle.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('minRange drops vehicles below threshold', () => {
    const out = applyRefinements(SAMPLE, { ...REFINE_DEFAULTS, minRange: 300 })
    expect(out.map(m => m.vehicle.id).sort()).toEqual(['b', 'd'])
  })

  it('maxMonthlyTco caps results to the budget ceiling', () => {
    const out = applyRefinements(SAMPLE, { ...REFINE_DEFAULTS, maxMonthlyTco: 1000 })
    expect(out.map(m => m.vehicle.id).sort()).toEqual(['a', 'c'])
  })

  it('luxuryMin filters out lower-tier vehicles', () => {
    const out = applyRefinements(SAMPLE, { ...REFINE_DEFAULTS, luxuryMin: 6.5 })
    expect(out.map(m => m.vehicle.id).sort()).toEqual(['b', 'd'])
  })

  it('minSeats demands at least N seats', () => {
    const out = applyRefinements(SAMPLE, { ...REFINE_DEFAULTS, minSeats: 7 })
    expect(out.map(m => m.vehicle.id)).toEqual(['b'])
  })

  it('maxZeroToSixty filters out slow vehicles', () => {
    const out = applyRefinements(SAMPLE, { ...REFINE_DEFAULTS, maxZeroToSixty: 4.0 })
    expect(out.map(m => m.vehicle.id).sort()).toEqual(['b', 'd'])
  })

  it('combining multiple filters narrows results', () => {
    const out = applyRefinements(SAMPLE, {
      ...REFINE_DEFAULTS,
      minRange: 350,
      luxuryMin: 7,
      maxMonthlyTco: 2000,
    })
    expect(out.map(m => m.vehicle.id)).toEqual(['b'])
  })

  it('falls back to vehicle.luxuryScoreEstimate when result.luxuryScore is missing', () => {
    const match = {
      vehicle: { id: 'e', rangeEpa: 300, seatingCapacity: 5, zeroToSixty: 5, luxuryScoreEstimate: 8 },
      tco: { monthlyTco: 1000 },
      score: 0.6, pct: 60,
    }
    const out = applyRefinements([match], { ...REFINE_DEFAULTS, luxuryMin: 7 })
    expect(out.length).toBe(1)
  })

  it('returns empty array for invalid input', () => {
    expect(applyRefinements(null, REFINE_DEFAULTS)).toEqual([])
    expect(applyRefinements(undefined, REFINE_DEFAULTS)).toEqual([])
  })

  it('luxuryScore of 0 still passes default (luxuryMin=0)', () => {
    const m = fakeMatch({ id: 'utility', lux: 0 })
    expect(applyRefinements([m], REFINE_DEFAULTS)).toHaveLength(1)
  })
})
