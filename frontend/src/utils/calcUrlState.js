/**
 * calcUrlState.js, Encode / decode calculator state as URL search params.
 *
 * Enables sharing a fully configured cost scenario via a URL, e.g.:
 *   /vehicles/tesla-model-3?m=finance&s=CA&apr=5.99&n=60&mi=15000&oy=5
 *
 * Design principles:
 *  - Short key names to keep URLs readable
 *  - Only non-default values are included (minimises URL length)
 *  - Graceful decode: unknown/invalid values are silently ignored
 *  - Round-trips cleanly: encode(decode(params)) → same params
 */

// ─── Short key ↔ semantic name mapping ──────────────────────────────────────
const KEY_MAP = {
  mode:              'm',   // "cash" | "finance" | "lease"
  state:             's',   // state abbreviation, e.g. "TX"
  trimIdx:           'ti',  // selected trim index
  downPayment:       'dp',  // down payment dollars
  apr:               'apr', // APR %
  termMonths:        'n',   // loan term in months
  tradeIn:           'trd', // trade-in value
  dealerDiscount:    'dd',  // additional dealer discount
  moneyFactor:       'mf',  // lease money factor (5-decimal)
  residualPct:       'res', // lease residual %
  leaseTermMonths:   'lt',  // lease term months
  leaseMiles:        'lmi', // lease annual mileage
  capCostReduction:  'ccr', // cap cost reduction
  insurance:         'ins', // "low" | "average" | "high"
  annualMiles:       'mi',  // annual driving miles
  ownershipYears:    'oy',  // ownership period years
  elecRate:          'er',  // home electricity rate ¢/kWh
  homeChargePct:     'hp',  // % home charging
  l2Pct:             'l2',  // % public L2 charging
  dcPct:             'dc',  // % DC fast charging
}

// Reverse map: short → semantic
const REVERSE_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]))

// Default values, we only encode when the value differs from the default
const DEFAULTS = {
  mode:             'finance',
  state:            null,   // null = don't suppress; always encode state
  trimIdx:          0,
  downPayment:      null,   // null = auto-calculated
  apr:              5.99,
  termMonths:       60,
  tradeIn:          0,
  dealerDiscount:   0,
  moneyFactor:      null,
  residualPct:      null,
  leaseTermMonths:  36,
  leaseMiles:       10000,
  capCostReduction: 0,
  insurance:        'average',
  annualMiles:      12000,
  ownershipYears:   5,
  elecRate:         null,
  homeChargePct:    80,
  l2Pct:            10,
  dcPct:            10,
}

/**
 * Encode calculator and user preference state into a URL query string.
 *
 * @param {object} calcState , from calculatorStore.getVehicleCalc(id)
 * @param {object} userPrefs , from userPreferencesStore
 * @returns {string}, query string (without leading "?")
 */
export function encodeCalcState(calcState, userPrefs) {
  const params = new URLSearchParams()

  function addIfChanged(semanticKey, value) {
    const shortKey = KEY_MAP[semanticKey]
    const defaultVal = DEFAULTS[semanticKey]
    if (value === null || value === undefined) return
    // Money factor needs 5 decimal precision; compare as fixed string
    if (semanticKey === 'moneyFactor') {
      if (value !== null) params.set(shortKey, value.toFixed(5))
      return
    }
    if (value !== defaultVal) {
      params.set(shortKey, String(value))
    }
  }

  // Always include these core identifiers
  params.set(KEY_MAP.mode, calcState.mode || 'finance')
  if (userPrefs.state) params.set(KEY_MAP.state, userPrefs.state)

  addIfChanged('trimIdx',          calcState.selectedTrimIndex)
  addIfChanged('downPayment',      calcState.downPayment)
  addIfChanged('apr',              calcState.financeApr)
  addIfChanged('termMonths',       calcState.financeTermMonths)
  addIfChanged('tradeIn',          calcState.tradeInValue)
  addIfChanged('dealerDiscount',   calcState.dealerDiscount)
  addIfChanged('moneyFactor',      calcState.leaseMoneyFactor)
  addIfChanged('residualPct',      calcState.leaseResidualPercent)
  addIfChanged('leaseTermMonths',  calcState.leaseTermMonths)
  addIfChanged('leaseMiles',       calcState.leaseMileagePerYear)
  addIfChanged('capCostReduction', calcState.leaseCapCostReduction)
  addIfChanged('insurance',        calcState.insuranceEstimate)
  addIfChanged('annualMiles',      userPrefs.annualMileage)
  addIfChanged('ownershipYears',   userPrefs.ownershipYears)
  addIfChanged('elecRate',         userPrefs.electricityRateCentsPerKwh)
  addIfChanged('homeChargePct',    userPrefs.chargingMixPercent?.home)
  addIfChanged('l2Pct',            userPrefs.chargingMixPercent?.publicL2)
  addIfChanged('dcPct',            userPrefs.chargingMixPercent?.dcFast)

  return params.toString()
}

/**
 * Decode a URL query string back into calculator and preference updates.
 *
 * @param {string} searchString, e.g. "?m=finance&s=CA&apr=5.99" or from location.search
 * @returns {{ calcUpdates: object, prefUpdates: object, hasCalcParams: boolean }}
 */
export function decodeCalcState(searchString) {
  const params = new URLSearchParams(
    searchString.startsWith('?') ? searchString.slice(1) : searchString
  )

  // Map short keys back to semantic names
  const parsed = {}
  for (const [shortKey, value] of params) {
    const semanticKey = REVERSE_MAP[shortKey]
    if (semanticKey) parsed[semanticKey] = value
  }

  if (!Object.keys(parsed).length) {
    return { calcUpdates: {}, prefUpdates: {}, hasCalcParams: false }
  }

  // ── Calculator state updates ──
  const calcUpdates = {}
  if (parsed.mode)             calcUpdates.mode              = parsed.mode
  if (parsed.trimIdx)          calcUpdates.selectedTrimIndex = Number(parsed.trimIdx)
  if (parsed.downPayment)      calcUpdates.downPayment       = Number(parsed.downPayment)
  if (parsed.apr)              calcUpdates.financeApr        = Number(parsed.apr)
  if (parsed.termMonths)       calcUpdates.financeTermMonths = Number(parsed.termMonths)
  if (parsed.tradeIn)          calcUpdates.tradeInValue      = Number(parsed.tradeIn)
  if (parsed.dealerDiscount)   calcUpdates.dealerDiscount    = Number(parsed.dealerDiscount)
  if (parsed.moneyFactor)      calcUpdates.leaseMoneyFactor  = Number(parsed.moneyFactor)
  if (parsed.residualPct)      calcUpdates.leaseResidualPercent = Number(parsed.residualPct)
  if (parsed.leaseTermMonths)  calcUpdates.leaseTermMonths   = Number(parsed.leaseTermMonths)
  if (parsed.leaseMiles)       calcUpdates.leaseMileagePerYear = Number(parsed.leaseMiles)
  if (parsed.capCostReduction) calcUpdates.leaseCapCostReduction = Number(parsed.capCostReduction)
  if (parsed.insurance)        calcUpdates.insuranceEstimate = parsed.insurance

  // ── User preference updates ──
  const prefUpdates = {}
  if (parsed.state)        prefUpdates.state         = parsed.state
  if (parsed.annualMiles)  prefUpdates.annualMileage  = Number(parsed.annualMiles)
  if (parsed.ownershipYears) prefUpdates.ownershipYears = Number(parsed.ownershipYears)
  if (parsed.elecRate)     prefUpdates.electricityRateCentsPerKwh = Number(parsed.elecRate)

  if (parsed.homeChargePct || parsed.l2Pct || parsed.dcPct) {
    prefUpdates.chargingMixPercent = {
      home:     Number(parsed.homeChargePct ?? 80),
      publicL2: Number(parsed.l2Pct ?? 10),
      dcFast:   Number(parsed.dcPct ?? 10),
    }
  }

  // hasCalcParams is true when meaningful financial params are present
  // (not just mode and state which might be present on normal deep-links)
  const financialKeys = ['downPayment', 'apr', 'termMonths', 'tradeIn', 'moneyFactor',
                          'residualPct', 'annualMiles', 'ownershipYears', 'elecRate']
  const hasCalcParams = financialKeys.some(k => parsed[k])

  return { calcUpdates, prefUpdates, hasCalcParams }
}

/**
 * Build a shareable URL for a vehicle's calculator state.
 *
 * @param {string} vehicleId
 * @param {object} calcState
 * @param {object} userPrefs
 * @returns {string}, full absolute URL
 */
export function buildShareUrl(vehicleId, calcState, userPrefs) {
  const queryString = encodeCalcState(calcState, userPrefs)
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://evsense.app'
  return `${base}/vehicles/${vehicleId}${queryString ? '?' + queryString : ''}`
}
