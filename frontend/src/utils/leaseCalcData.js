/**
 * leaseCalcData.js — Edmunds lease-calculator data (scraped per trim + term).
 *
 * Loads /data/lease_calc_by_vehicle.json (from scrape_lease_calculator.py) which
 * holds, per vehicle → Edmunds style → 24/36-mo term:
 *   residualValue (%), taxesAndFees ($), cashIncentives ($), msrp, sellingPrice,
 *   annualMiles (10k), creditTier ("Excellent").
 *
 * The scraped monthly payment field is unreliable (DOM parsing concatenated
 * numbers), so we IGNORE it and compute the lease payment ourselves from the
 * trustworthy residual % + selling price via the app's lease math.
 *
 * Assumptions baked into the scrape: Excellent credit, 10,000 mi/yr — surfaced
 * in the UI so users know the basis.
 */

import { useEffect, useState } from 'react'
import { calculateLeasePayment } from './leaseCalculator'

// Money factor used to turn the scraped residual into a payment. ~3% APR, a
// reasonable Excellent-tier buy rate. (APR ≈ moneyFactor × 2400.)
const DEFAULT_MF = 0.00125
export const LEASE_ASSUMPTIONS = 'Excellent credit · 10k mi/yr'

let _cache = null
let _inflight = null

export function loadLeaseCalc() {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = fetch('/data/lease_calc_by_vehicle.json')
    .then(r => (r.ok ? r.json() : null))
    .then(d => { _cache = d && d.vehicles ? d : { vehicles: {} }; return _cache })
    .catch(() => { _cache = { vehicles: {} }; return _cache })
  return _inflight
}

export function useLeaseCalc() {
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    loadLeaseCalc().then(d => { if (alive) setMap(d.vehicles || {}) })
    return () => { alive = false }
  }, [])
  return map
}

// ── trim matching ─────────────────────────────────────────────────────────────
function _sig(name) {
  let s = (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  // drop body/format/noise tokens; keep trim level + drivetrain + range words
  s = s.replace(/\b(electric|dd|4dr|2dr|suv|sedan|hatchback|wagon|truck|van|coupe|crew|cab|sb|4wd|with|w|tow|hitch|prod|end)\b/g, ' ')
  const toks = new Set(s.split(/\s+/).filter(Boolean))
  if (toks.has('awd') || toks.has('4motion')) { toks.delete('4motion'); toks.add('awd') }
  else if (!toks.has('fwd') && !toks.has('rwd')) toks.add('rwd')
  return toks
}

function _matchStyle(rec, trimName) {
  const styles = rec?.styles || {}
  const keys = Object.keys(styles)
  if (!keys.length) return null
  if (!trimName) return null
  const t = _sig(trimName)
  let best = null, bestScore = 0
  for (const k of keys) {
    const s = _sig(k)
    const inter = [...t].filter(x => s.has(x)).length
    const uni = new Set([...t, ...s]).size || 1
    const score = inter / uni
    if (score > bestScore) { bestScore = score; best = k }
  }
  return bestScore >= 0.5 ? best : null
}

/** Lowest-MSRP style (a sensible vehicle-level representative for cards). */
function _baseStyleKey(rec) {
  const styles = rec?.styles || {}
  let best = null, bestMsrp = Infinity
  for (const [k, v] of Object.entries(styles)) {
    const m = v?.['36']?.msrp ?? v?.['24']?.msrp ?? Infinity
    if (m < bestMsrp) { bestMsrp = m; best = k }
  }
  return best || Object.keys(styles)[0] || null
}

function _plausibleMonthly(v) {
  return typeof v === 'number' && v > 50 && v < 5000 ? v : null
}

/**
 * Resolve the scraped lease data for a vehicle + (optional) trim + term, and
 * compute a monthly payment from the residual. Returns null if unavailable.
 *
 * @returns {null | {
 *   styleLabel, term, residualValue, taxesAndFees, cashIncentives, msrp,
 *   sellingPrice, monthly, assumptions
 * }}
 */
export function leaseCalcFor(rec, trimName, term = 36) {
  if (!rec || !rec.styles) return null
  const key = _matchStyle(rec, trimName) || _baseStyleKey(rec)
  if (!key) return null
  const style = rec.styles[key]
  // Term-strict: only use the requested term's scraped data. Previously this
  // fell back to the other term (36↔24) when one was missing, which could show
  // a 24-month residual under a "36 months" label. Returning null instead lets
  // callers render "—" for the missing term rather than a mislabeled figure.
  const e = style?.[String(term)]
  if (!e || !e.msrp) return null
  const usedTerm = term

  // Money factor for THIS trim+term, from the scrape (or derived from a scraped
  // APR: MF = APR% / 2400). Null when the scrape didn't capture one — callers
  // then keep their own default rather than being seeded with a placeholder.
  // The payment math still falls back to DEFAULT_MF so the computed monthly is
  // unchanged until real per-term money factors are scraped.
  const scrapedMf = e.moneyFactor != null
    ? e.moneyFactor
    : (e.apr != null ? e.apr / 2400 : null)

  const calc = calculateLeasePayment({
    msrp: e.msrp,
    sellingPrice: e.sellingPrice || e.msrp,
    residualPercent: e.residualValue,
    moneyFactor: scrapedMf ?? DEFAULT_MF,
    termMonths: usedTerm,
    mileagePerYear: e.annualMiles || 10000,
    acquisitionFee: 695,
    docFee: 499,
    salesTaxRate: 0,                 // taxes shown separately (scraped lump sum)
    stateRebate: e.cashIncentives || 0,
    rebatesAppliedTo: 'cap',
  })
  return {
    styleLabel: key,
    matchedTrim: !!_matchStyle(rec, trimName),
    term: usedTerm,
    residualValue: e.residualValue ?? null,
    taxesAndFees: e.taxesAndFees ?? null,
    cashIncentives: e.cashIncentives ?? 0,
    msrp: e.msrp ?? null,
    sellingPrice: e.sellingPrice ?? null,
    moneyFactor: scrapedMf,
    monthly: _plausibleMonthly(Math.round(calc.totalMonthly)),
    assumptions: LEASE_ASSUMPTIONS,
  }
}

/** Both terms (24 & 36) for a trim — used by the detail-page panel. */
export function leaseCalcBothTerms(rec, trimName) {
  return { '24': leaseCalcFor(rec, trimName, 24), '36': leaseCalcFor(rec, trimName, 36) }
}
