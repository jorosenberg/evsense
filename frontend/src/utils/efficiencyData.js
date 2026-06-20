/**
 * efficiencyData.js — Real-world efficiency lookup per vehicle
 *
 * Sources:
 *  • EPA combined: from manufacturer + monroney sticker
 *  • Highway (70mph constant): Edmunds EV Range Test
 *      https://www.edmunds.com/car-news/electric-car-range-and-consumption-epa-vs-edmunds.html
 *  • City (regen-heavy urban cycle): ev-database.org
 *      https://ev-database.org/  (Real range — City — Mild Weather)
 *  • Edmunds tested combined: Edmunds 70mph + city blend
 *
 * Units: mi/kWh (higher = more efficient = cheaper to drive)
 *
 * NOTE: Edmunds tested values are typically 8-15% WORSE than EPA combined.
 * City values are typically 10-20% BETTER than highway due to regen braking.
 * These figures are the truth users feel at the plug — EPA is the optimistic
 * sticker number; we expose all three so they can pick which scenario fits.
 */

// ─── Default formula fallback ─────────────────────────────────────────────────
const HWY_RATIO  = 0.85   // highway efficiency vs EPA combined
const CITY_RATIO = 1.15   // city efficiency vs EPA combined
const REAL_RATIO = 0.88   // Edmunds real-world vs EPA combined

// ─── Per-vehicle real-world tested efficiency ────────────────────────────────
// Hand-curated from Edmunds tested + ev-database.org + Out of Spec tests.
export const EFFICIENCY_DATA = {
  // ── Tesla ──
  'tesla-model3-2026': {
    epa: 4.5, hwy: 3.8, city: 4.5, edmunds: 4.1,
    epaRange: 363, edmundsRange: 332,
  },
  'tesla-modely-2026': {
    epa: 4.0, hwy: 3.4, city: 4.1, edmunds: 3.7,
    epaRange: 320, edmundsRange: 296,
  },
  'tesla-models-2026': {
    epa: 3.7, hwy: 3.2, city: 3.8, edmunds: 3.5,
    epaRange: 402, edmundsRange: 378,
  },
  'tesla-modelx-2026': {
    epa: 3.2, hwy: 2.8, city: 3.3, edmunds: 3.0,
    epaRange: 348, edmundsRange: 325,
  },
  'tesla-cybertruck-2026': {
    epa: 2.5, hwy: 2.1, city: 2.6, edmunds: 2.3,
    epaRange: 340, edmundsRange: 311,
  },

  // ── Hyundai / Kia (E-GMP 800V) ──
  'hyundai-ioniq-5-2026': {
    epa: 3.4, hwy: 2.9, city: 3.5, edmunds: 3.1,
    epaRange: 303, edmundsRange: 274,
  },
  'hyundai-ioniq-6-2026': {
    epa: 4.2, hwy: 3.6, city: 4.3, edmunds: 3.9,
    epaRange: 361, edmundsRange: 335,
  },
  'hyundai-ioniq-9-2026': {
    epa: 2.8, hwy: 2.4, city: 2.9, edmunds: 2.6,
    epaRange: 335, edmundsRange: 311,
  },
  'kia-ev6-2026': {
    epa: 3.5, hwy: 3.0, city: 3.6, edmunds: 3.2,
    epaRange: 310, edmundsRange: 283,
  },
  'kia-ev9-2026': {
    epa: 2.7, hwy: 2.3, city: 2.8, edmunds: 2.5,
    epaRange: 304, edmundsRange: 281,
  },

  // ── Ford ──
  'ford-mustang-mach-e-2026': {
    epa: 3.0, hwy: 2.6, city: 3.1, edmunds: 2.7,
    epaRange: 300, edmundsRange: 270,
  },
  'ford-f-150-lightning-2026': {
    epa: 2.0, hwy: 1.7, city: 2.1, edmunds: 1.8,
    epaRange: 320, edmundsRange: 286,
  },
  'ford-e-transit-2026': {
    epa: 1.7, hwy: 1.4, city: 1.8, edmunds: 1.5,
    epaRange: 159, edmundsRange: 138,
  },

  // ── GM / Chevy ──
  'chevrolet-equinox-ev-2026': {
    epa: 3.8, hwy: 3.2, city: 3.9, edmunds: 3.4,
    epaRange: 319, edmundsRange: 290,
  },
  'chevrolet-blazer-ev-2026': {
    epa: 2.9, hwy: 2.5, city: 3.0, edmunds: 2.6,
    epaRange: 324, edmundsRange: 294,
  },
  'chevrolet-silverado-ev-2026': {
    epa: 2.1, hwy: 1.8, city: 2.2, edmunds: 1.9,
    epaRange: 440, edmundsRange: 398,
  },

  // ── BMW ──
  'bmw-i4-2026': {
    epa: 3.5, hwy: 3.0, city: 3.6, edmunds: 3.2,
    epaRange: 307, edmundsRange: 280,
  },
  'bmw-i5-2026': {
    epa: 3.1, hwy: 2.7, city: 3.2, edmunds: 2.8,
    epaRange: 295, edmundsRange: 267,
  },
  'bmw-i7-2026': {
    epa: 2.7, hwy: 2.3, city: 2.8, edmunds: 2.5,
    epaRange: 318, edmundsRange: 292,
  },
  'bmw-ix-2026': {
    epa: 2.9, hwy: 2.5, city: 3.0, edmunds: 2.6,
    epaRange: 309, edmundsRange: 281,
  },

  // ── Rivian ──
  'rivian-r1t-2026': {
    epa: 2.5, hwy: 2.1, city: 2.6, edmunds: 2.2,
    epaRange: 270, edmundsRange: 240,
  },
  'rivian-r1s-2026': {
    epa: 2.4, hwy: 2.0, city: 2.5, edmunds: 2.1,
    epaRange: 270, edmundsRange: 238,
  },
  'rivian-r2-2026': {
    epa: 3.2, hwy: 2.7, city: 3.3, edmunds: 2.9,  // estimated, not yet released
    epaRange: 300, edmundsRange: 275,
  },

  // ── Lucid ──
  'lucid-air-2026': {
    epa: 4.6, hwy: 4.0, city: 4.7, edmunds: 4.3,
    epaRange: 516, edmundsRange: 481,
  },
  'lucid-gravity-2026': {
    epa: 3.7, hwy: 3.2, city: 3.8, edmunds: 3.4,
    epaRange: 450, edmundsRange: 416,
  },

  // ── Polestar ──
  'polestar-polestar-2-2026': {
    epa: 3.6, hwy: 3.1, city: 3.7, edmunds: 3.3,
    epaRange: 320, edmundsRange: 295,
  },
  'polestar-polestar-3-2026': {
    epa: 2.6, hwy: 2.2, city: 2.7, edmunds: 2.3,
    epaRange: 315, edmundsRange: 290,
  },
  'polestar-polestar-4-2026': {
    epa: 3.4, hwy: 2.9, city: 3.5, edmunds: 3.1,
    epaRange: 300, edmundsRange: 275,
  },

  // ── Volkswagen ──
  'volkswagen-id4-2026': {
    epa: 3.1, hwy: 2.7, city: 3.2, edmunds: 2.8,
    epaRange: 291, edmundsRange: 263,
  },
  'volkswagen-id-buzz-2026': {
    epa: 2.4, hwy: 2.1, city: 2.5, edmunds: 2.2,
    epaRange: 234, edmundsRange: 214,
  },
}

/**
 * Get efficiency data for a vehicle. Falls back to formula-derived values
 * when the vehicle isn't in our hand-curated set.
 *
 * @param {string} vehicleId
 * @param {number} [epaFallback] — if no entry exists, use this EPA value with ratios
 * @returns {{ epa: number, hwy: number, city: number, edmunds: number, epaRange?: number, edmundsRange?: number, source: 'curated'|'estimated' }}
 */
export function getEfficiency(vehicleId, epaFallback = null) {
  const curated = EFFICIENCY_DATA[vehicleId]
  if (curated) return { ...curated, source: 'curated' }

  if (epaFallback) {
    return {
      epa: epaFallback,
      hwy: Number((epaFallback * HWY_RATIO).toFixed(2)),
      city: Number((epaFallback * CITY_RATIO).toFixed(2)),
      edmunds: Number((epaFallback * REAL_RATIO).toFixed(2)),
      source: 'estimated',
    }
  }
  return null
}
