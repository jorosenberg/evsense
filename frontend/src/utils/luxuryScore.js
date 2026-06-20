/**
 * luxuryScore.js — Per-vehicle luxury rating + feature list
 *
 * Each curated vehicle has a hand-tuned features array. The luxury score
 * (0-10) is derived from feature weights so adding/removing features stays
 * traceable and the score is reproducible.
 *
 * Tier labels:
 *   9-10  Ultra-luxury    — Maybach-tier interior, every box checked
 *   7-8   Luxury          — Genuine premium materials, full driver-assist
 *   5-6   Premium         — Above-average comfort + good tech
 *   3-4   Standard        — Mainstream EV with expected basics
 *   1-2   Economy / Utility — Stripped or work-oriented
 */

// ─── Feature weights ─────────────────────────────────────────────────────────
// Each feature contributes to the luxury score. Higher weight = more luxe.
export const FEATURE_WEIGHTS = {
  // Comfort & seating
  'massage-seats':         2.0,
  'ventilated-seats':      1.5,
  'heated-seats':          0.7,
  'heated-rear-seats':     0.8,
  'heated-steering-wheel': 0.5,
  'memory-seats':          0.6,
  'reclining-rear-seats':  1.0,
  'four-zone-climate':     0.8,
  'rear-entertainment':    1.2,

  // Suspension & ride
  'air-suspension':        2.0,
  'adaptive-suspension':   1.2,
  'rear-wheel-steering':   1.0,

  // Doors & body
  'soft-close-doors':      1.5,
  'power-doors':           1.2,
  'frameless-doors':       0.8,
  'falcon-wing-doors':     1.5,
  'power-tailgate':        0.5,
  'panoramic-roof':        0.8,
  'electrochromic-roof':   1.0,

  // Interior materials
  'genuine-leather':       1.0,
  'nappa-leather':         1.4,
  'wood-trim':             0.6,
  'metallic-trim':         0.4,
  'ambient-lighting':      0.5,
  'fragrance-system':      1.5,

  // Audio & screens
  'premium-audio':         0.8,
  'concert-audio':         1.4,    // 20+ speakers, e.g. Lucid SS, BMW B&W
  'rear-screen':           1.0,
  'large-center-screen':   0.4,    // 15"+ display
  'hud':                   0.8,
  'ar-navigation':         0.5,

  // Driver assist
  'full-self-driving':     1.5,
  'highway-assist':        0.8,
  'lane-change-assist':    0.6,
  'auto-park':             0.6,
  'summon':                0.8,
  'remote-park-assist':    0.4,
  '360-camera':            0.4,

  // Performance
  'launch-mode':           0.6,
  'track-mode':            0.5,
  'three-motor':           1.0,
  'over-650-hp':           0.8,

  // Off-road / utility
  'air-locker-diffs':      0.6,
  'wading-mode':           0.4,
  'tank-turn':             0.6,
  'gear-tunnel':           0.5,
  'vehicle-to-load':       0.5,
  'vehicle-to-home':       0.7,
  'frunk-power-outlet':    0.3,

  // Tech bonuses
  'ota-updates':           0.4,
  '800v-architecture':     0.6,
  'sentry-mode':           0.3,
  'biometric-login':       0.5,
}

// ─── Per-vehicle feature lists ───────────────────────────────────────────────
// Hand-curated based on each vehicle's actual feature list.
// Sources: manufacturer spec sheets + Edmunds + Car and Driver feature lists.
export const VEHICLE_FEATURES = {
  // ── Ultra-luxury ──
  'lucid-air-2026': [
    'massage-seats', 'ventilated-seats', 'heated-seats', 'heated-rear-seats',
    'heated-steering-wheel', 'memory-seats', 'four-zone-climate', 'air-suspension',
    'soft-close-doors', 'panoramic-roof', 'electrochromic-roof', 'nappa-leather',
    'wood-trim', 'metallic-trim', 'ambient-lighting', 'concert-audio',
    'large-center-screen', 'hud', 'highway-assist', 'lane-change-assist',
    'auto-park', '360-camera', 'launch-mode', 'over-650-hp', '900v-architecture',
    '800v-architecture', 'ota-updates', 'biometric-login',
  ],
  'lucid-gravity-2026': [
    'massage-seats', 'ventilated-seats', 'heated-seats', 'heated-rear-seats',
    'four-zone-climate', 'air-suspension', 'soft-close-doors', 'panoramic-roof',
    'nappa-leather', 'wood-trim', 'ambient-lighting', 'concert-audio',
    'large-center-screen', 'hud', 'highway-assist', '360-camera',
    'over-650-hp', '800v-architecture', 'ota-updates', 'vehicle-to-load',
  ],
  'bmw-i7-2026': [
    'massage-seats', 'ventilated-seats', 'heated-seats', 'heated-rear-seats',
    'heated-steering-wheel', 'memory-seats', 'reclining-rear-seats',
    'four-zone-climate', 'rear-entertainment', 'air-suspension', 'rear-wheel-steering',
    'soft-close-doors', 'power-doors', 'panoramic-roof', 'electrochromic-roof',
    'nappa-leather', 'wood-trim', 'ambient-lighting', 'fragrance-system',
    'concert-audio', 'rear-screen', 'large-center-screen', 'hud',
    'highway-assist', 'lane-change-assist', 'auto-park', '360-camera',
    'biometric-login',
  ],
  'tesla-models-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'memory-seats',
    'air-suspension', 'adaptive-suspension', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'concert-audio', 'rear-screen',
    'large-center-screen', 'full-self-driving', 'highway-assist',
    'lane-change-assist', 'auto-park', 'summon', '360-camera',
    'launch-mode', 'three-motor', 'over-650-hp', 'ota-updates', 'sentry-mode',
  ],
  'tesla-modelx-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'memory-seats',
    'air-suspension', 'falcon-wing-doors', 'power-doors', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'concert-audio',
    'large-center-screen', 'full-self-driving', 'highway-assist',
    'lane-change-assist', 'auto-park', 'summon', '360-camera',
    'launch-mode', 'three-motor', 'ota-updates', 'sentry-mode',
  ],
  'mercedes-eqs-2025': [
    'massage-seats', 'ventilated-seats', 'heated-seats', 'heated-rear-seats',
    'heated-steering-wheel', 'memory-seats', 'four-zone-climate', 'air-suspension',
    'rear-wheel-steering', 'soft-close-doors', 'power-doors', 'panoramic-roof',
    'nappa-leather', 'ambient-lighting', 'fragrance-system', 'concert-audio',
    'large-center-screen', 'hud', 'highway-assist', 'lane-change-assist',
    'auto-park', '360-camera', 'ota-updates',
  ],

  // ── Luxury ──
  'mercedes-eqe-2025': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'heated-steering-wheel',
    'memory-seats', 'four-zone-climate', 'air-suspension', 'rear-wheel-steering',
    'nappa-leather', 'ambient-lighting', 'concert-audio', 'large-center-screen',
    'hud', 'panoramic-roof', 'highway-assist', 'lane-change-assist', 'auto-park',
    '360-camera', 'ota-updates',
  ],
  'bmw-i5-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'heated-steering-wheel',
    'memory-seats', 'four-zone-climate', 'adaptive-suspension', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'hud', 'highway-assist', 'lane-change-assist', 'auto-park', '360-camera',
  ],
  'bmw-ix-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'heated-steering-wheel',
    'memory-seats', 'four-zone-climate', 'adaptive-suspension', 'panoramic-roof',
    'electrochromic-roof', 'genuine-leather', 'wood-trim', 'ambient-lighting',
    'concert-audio', 'large-center-screen', 'hud', 'highway-assist',
    'lane-change-assist', 'auto-park', '360-camera',
  ],
  'polestar-polestar-3-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'memory-seats',
    'air-suspension', 'adaptive-suspension', 'panoramic-roof', 'genuine-leather',
    'ambient-lighting', 'concert-audio', 'large-center-screen', 'hud',
    'highway-assist', 'auto-park', '360-camera', 'ota-updates',
  ],
  'rivian-r1s-2026': [
    'heated-seats', 'heated-rear-seats', 'heated-steering-wheel', 'memory-seats',
    'air-suspension', 'panoramic-roof', 'genuine-leather', 'ambient-lighting',
    'premium-audio', 'large-center-screen', 'highway-assist', 'auto-park',
    '360-camera', 'tank-turn', 'wading-mode', 'air-locker-diffs',
    'gear-tunnel', 'vehicle-to-load', 'vehicle-to-home', 'frunk-power-outlet',
    'launch-mode', 'three-motor', 'over-650-hp', 'ota-updates',
  ],
  'rivian-r1t-2026': [
    'heated-seats', 'heated-rear-seats', 'heated-steering-wheel', 'memory-seats',
    'air-suspension', 'panoramic-roof', 'genuine-leather', 'ambient-lighting',
    'premium-audio', 'large-center-screen', 'highway-assist', '360-camera',
    'tank-turn', 'wading-mode', 'air-locker-diffs', 'gear-tunnel',
    'vehicle-to-load', 'vehicle-to-home', 'frunk-power-outlet',
    'launch-mode', 'three-motor', 'over-650-hp', 'ota-updates',
  ],

  // ── Premium ──
  'mercedes-benz-cla-2026': [
    'heated-seats', 'heated-steering-wheel', 'memory-seats', 'ambient-lighting',
    'genuine-leather', 'large-center-screen', 'premium-audio', 'panoramic-roof',
    'hud', 'highway-assist', 'lane-change-assist', 'auto-park', '360-camera',
    '800v-architecture', 'ota-updates',
  ],
  'bmw-i4-2026': [
    'heated-seats', 'heated-steering-wheel', 'memory-seats', 'adaptive-suspension',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'hud', 'highway-assist', 'auto-park', '360-camera',
  ],
  // NOTE: Tesla upholstery is synthetic (vegan), not genuine leather, and
  // Full Self-Driving is a paid software add-on — neither is standard equipment,
  // so both are excluded here. This keeps the Model 3 a (correct) Premium-tier
  // car rather than over-scoring it into Luxury/Ultra.
  'tesla-model3-2026': [
    'heated-seats', 'heated-rear-seats', 'ventilated-seats', 'memory-seats',
    'panoramic-roof', 'ambient-lighting', 'premium-audio',
    'large-center-screen', 'highway-assist',
    'lane-change-assist', 'auto-park', 'summon', '360-camera',
    'ota-updates', 'sentry-mode',
  ],
  'tesla-modely-2026': [
    'heated-seats', 'heated-rear-seats', 'memory-seats', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'full-self-driving', 'highway-assist', 'lane-change-assist', 'auto-park',
    'summon', '360-camera', 'ota-updates', 'sentry-mode',
  ],
  'polestar-polestar-2-2026': [
    'heated-seats', 'heated-steering-wheel', 'memory-seats', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist', 'auto-park', '360-camera', 'ota-updates',
  ],
  'polestar-polestar-4-2026': [
    'ventilated-seats', 'heated-seats', 'heated-rear-seats', 'memory-seats',
    'adaptive-suspension', 'electrochromic-roof', 'genuine-leather', 'ambient-lighting',
    'concert-audio', 'large-center-screen', 'hud', 'highway-assist',
    'lane-change-assist', 'auto-park', '360-camera',
  ],
  'hyundai-ioniq-6-2026': [
    'heated-seats', 'heated-rear-seats', 'ventilated-seats', 'heated-steering-wheel',
    'memory-seats', 'genuine-leather', 'ambient-lighting', 'premium-audio',
    'large-center-screen', 'hud', 'highway-assist', 'lane-change-assist',
    'auto-park', 'remote-park-assist', '360-camera', 'vehicle-to-load',
    '800v-architecture',
  ],
  'hyundai-ioniq-9-2026': [
    'heated-seats', 'heated-rear-seats', 'ventilated-seats', 'heated-steering-wheel',
    'memory-seats', 'four-zone-climate', 'genuine-leather', 'ambient-lighting',
    'premium-audio', 'large-center-screen', 'hud', 'highway-assist',
    'lane-change-assist', 'auto-park', 'remote-park-assist', '360-camera',
    'vehicle-to-load', '800v-architecture',
  ],
  'kia-ev9-2026': [
    'heated-seats', 'heated-rear-seats', 'ventilated-seats', 'memory-seats',
    'four-zone-climate', 'genuine-leather', 'ambient-lighting', 'premium-audio',
    'large-center-screen', 'hud', 'highway-assist', 'lane-change-assist',
    'auto-park', '360-camera', 'vehicle-to-load', '800v-architecture',
  ],
  'tesla-cybertruck-2026': [
    'heated-seats', 'heated-rear-seats', 'memory-seats', 'air-suspension',
    'rear-wheel-steering', 'panoramic-roof', 'ambient-lighting', 'premium-audio',
    'large-center-screen', 'full-self-driving', 'highway-assist',
    'auto-park', '360-camera', 'vehicle-to-load', 'vehicle-to-home',
    'three-motor', 'over-650-hp', 'ota-updates', 'sentry-mode',
  ],

  // ── Standard ──
  'hyundai-ioniq-5-2026': [
    'heated-seats', 'ventilated-seats', 'heated-steering-wheel', 'memory-seats',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist', 'auto-park', 'remote-park-assist', '360-camera',
    'vehicle-to-load', '800v-architecture',
  ],
  'kia-ev6-2026': [
    'heated-seats', 'ventilated-seats', 'heated-steering-wheel', 'memory-seats',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist', '360-camera', 'vehicle-to-load', '800v-architecture',
  ],
  'ford-mustang-mach-e-2026': [
    'heated-seats', 'heated-steering-wheel', 'memory-seats', 'panoramic-roof',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist', '360-camera', 'ota-updates',
  ],
  'volkswagen-id4-2026': [
    'heated-seats', 'heated-steering-wheel', 'memory-seats', 'panoramic-roof',
    'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist', '360-camera',
  ],
  'chevrolet-equinox-ev-2026': [
    'heated-seats', 'heated-steering-wheel', 'large-center-screen',
    'highway-assist', '360-camera',
  ],
  'chevrolet-blazer-ev-2026': [
    'heated-seats', 'ventilated-seats', 'heated-steering-wheel', 'memory-seats',
    'genuine-leather', 'ambient-lighting', 'large-center-screen', 'hud',
    'highway-assist', '360-camera',
  ],
  'ford-f-150-lightning-2026': [
    'heated-seats', 'ventilated-seats', 'heated-rear-seats', 'memory-seats',
    'panoramic-roof', 'genuine-leather', 'large-center-screen', 'highway-assist',
    '360-camera', 'vehicle-to-load', 'vehicle-to-home', 'frunk-power-outlet',
    'ota-updates',
  ],
  'chevrolet-silverado-ev-2026': [
    'heated-seats', 'heated-steering-wheel', 'large-center-screen',
    'highway-assist', '360-camera', 'vehicle-to-load', 'four-zone-climate',
  ],

  // ── Economy / Utility ──
  'volkswagen-id-buzz-2026': [
    'heated-seats', 'heated-steering-wheel', 'four-zone-climate', 'memory-seats',
    'genuine-leather', 'ambient-lighting', 'premium-audio', 'large-center-screen',
    'highway-assist',
  ],
  'ford-e-transit-2026': [
    'heated-seats',
  ],
  'rivian-r2-2026': [
    'heated-seats', 'heated-rear-seats', 'heated-steering-wheel',
    'panoramic-roof', 'large-center-screen', 'highway-assist', '360-camera',
    'vehicle-to-load', 'frunk-power-outlet', 'ota-updates',
  ],
}

// ─── Score calculator ────────────────────────────────────────────────────────
/**
 * Calculate luxury score (0-10) from a feature list.
 * Score is clamped to 10. The 0-10 scale is normalized against a 20-point
 * baseline — calibrated so flagships (Lucid Air, BMW i7, Model S/X, EQS) reach
 * Ultra (≥8.5) while mainstream EVs land in Premium/Standard. A 14-point
 * baseline saturated the curve (~40% of the fleet scored Ultra), which is why
 * a loaded Model 3 was mislabeled "Ultra-luxury".
 */
const LUXURY_BASELINE = 20

export function calculateLuxuryScore(features = []) {
  const rawScore = features.reduce((sum, feature) => {
    return sum + (FEATURE_WEIGHTS[feature] || 0)
  }, 0)
  // Normalize: LUXURY_BASELINE points = 10/10
  const normalized = (rawScore / LUXURY_BASELINE) * 10
  return Math.min(10, Math.max(0, Math.round(normalized * 10) / 10))
}

/**
 * Get the luxury score for a specific vehicle ID. Returns null if unknown.
 */
export function getLuxuryScore(vehicleId) {
  const features = VEHICLE_FEATURES[vehicleId]
  if (!features) return null
  return calculateLuxuryScore(features)
}

/**
 * Get the human-readable luxury tier label.
 */
export function getLuxuryTier(score) {
  if (score == null) return null
  if (score >= 8.5) return { label: 'Ultra-luxury', color: 'text-purple-700 bg-purple-50 border-purple-200' }
  if (score >= 6.5) return { label: 'Luxury',       color: 'text-indigo-700 bg-indigo-50 border-indigo-200' }
  if (score >= 4.5) return { label: 'Premium',      color: 'text-blue-700 bg-blue-50 border-blue-200' }
  if (score >= 2.5) return { label: 'Standard',     color: 'text-ink-muted bg-surface-sunken border-border' }
  return { label: 'Utility',                         color: 'text-ink-subtle bg-surface-sunken border-border' }
}

/**
 * Get the list of features for a vehicle (for display in matcher/detail page).
 */
export function getVehicleFeatures(vehicleId) {
  return VEHICLE_FEATURES[vehicleId] || []
}

/**
 * Pretty-print a feature key for display.
 */
export function featureLabel(featureKey) {
  return featureKey
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Hud/i, 'HUD')
    .replace(/Ar Navigation/i, 'AR Navigation')
    .replace(/Ota /i, 'OTA ')
}
