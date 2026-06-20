/**
 * incentivesByVehicle.js — single source of truth for manufacturer incentives.
 *
 * Loads /data/incentives_by_vehicle.json (produced by the Edmunds incentive
 * scraper, localized to ZIP 10005 / New York) and exposes it to the Browse
 * cards, the per-vehicle Calculator, and the Matcher so all three show the
 * SAME NY offer for a given trim + payment type.
 *
 * DEMO SCOPE: the only region modeled is New York (ZIP 10005). Offers are
 * MANUFACTURER cash / APR / lease deals — no state purchase rebate is applied
 * here (see IncentiveNotice). The scrape is refreshed monthly.
 *
 * Data shape (per vehicle):
 *   {
 *     scraped: true,
 *     scrapedAt: "2026-…",
 *     edmundsUrl: "https://…",
 *     // model-level "best" summary (always present — backward compatible):
 *     cashRebate, financeApr, financeTerm, leaseMonthly, leaseDownPayment, leaseTerm,
 *     // optional per-trim breakdown (preferred when present):
 *     trims: {
 *       "<trim name>": {
 *         cash:    { rebate, netPrice },
 *         finance: { apr, termMonths, rebate, monthlyPayment },
 *         lease:   { monthlyPayment, dueAtSigning, termMonths, milesPerYear }
 *       }
 *     }
 *   }
 *
 * When a trim has no explicit entry, callers fall back to the model-level
 * summary (which is exactly what a ZIP-localized model-level scrape returns).
 */

import { useEffect, useState } from 'react'

// Manufacturer offers change monthly and are region-specific. Past this age we
// stop applying the dollar amounts (an expired offer must not anchor a price or
// ranking); the record is kept with `stale:true` + the Edmunds URL so the UI
// can still link out to verify current deals.
export const INCENTIVE_STALE_DAYS = 45

let _cache = null          // resolved payload, cached for the session
let _inflight = null       // de-dupe concurrent fetches

/** Fetch + cache /data/incentives_by_vehicle.json once per session. */
export function loadIncentives() {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = fetch('/data/incentives_by_vehicle.json')
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      _cache = data && data.vehicles ? data : { vehicles: {} }
      return _cache
    })
    .catch(() => {
      _cache = { vehicles: {} }
      return _cache
    })
  return _inflight
}

function ageDays(scrapedAt) {
  if (!scrapedAt) return Infinity
  const ms = new Date(scrapedAt).getTime()
  return Number.isFinite(ms) ? (Date.now() - ms) / 86_400_000 : Infinity
}

// Targeted / conditional offers — these require qualifying (own a competitor,
// be a student/military/grad, finance through the captive lender, buy a
// charger, etc.) or are a separate state rebate. They must NOT be subtracted
// from the headline "after incentive" price the way broadly-available cash is.
// The scraper sums everything into cashRebate; we re-derive the broad portion.
const CONDITIONAL_CASH_RE =
  /military|first[\s-]*responder|college|grad|student|conquest|loyal|competit|lease|lender|financ|apr|costco|affinity|mobility|charger|recent|returning|state\s*rebate|trade|down\s*payment|disab|uber|rideshare/i

function isBroadCash(label) {
  return !CONDITIONAL_CASH_RE.test(label || '')
}

/** Sum of broadly-available cash items (null if there are no items at all). */
function appliedCash(items) {
  if (!Array.isArray(items) || items.length === 0) return null
  return items.reduce((s, it) => s + (isBroadCash(it.label) ? (it.amount || 0) : 0), 0)
}

/** Sum of targeted/conditional cash items ("up to $X if you qualify"). */
function conditionalCash(items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((s, it) => s + (isBroadCash(it.label) ? 0 : (it.amount || 0)), 0)
}

/** Re-derive { applied, conditional } cash for a vehicle from its trim items. */
function deriveCash(raw) {
  const trims = raw.trims || null
  if (!trims) return { applied: raw.cashRebate || 0, conditional: 0, hasItems: false }
  let best = null, cond = 0, hasItems = false
  for (const t of Object.values(trims)) {
    const items = t?.cash?.items
    if (Array.isArray(items) && items.length) hasItems = true
    const ac = appliedCash(items)
    if (ac != null && (best == null || ac > best)) best = ac
    const cc = conditionalCash(items)
    if (cc > cond) cond = cc
  }
  return {
    applied: best != null ? best : (raw.cashRebate || 0),
    conditional: cond,
    hasItems,
  }
}

/**
 * Normalize one raw vehicle record into a flat, staleness-aware shape. Stale
 * records return zeroed dollar amounts but keep `stale` + `edmundsUrl`.
 */
function normalize(raw) {
  if (!raw || !raw.scraped) return null
  const stale = ageDays(raw.scrapedAt) > INCENTIVE_STALE_DAYS
  const cash = deriveCash(raw)
  return {
    stale,
    edmundsUrl: raw.edmundsUrl || null,
    scrapedAt: raw.scrapedAt || null,
    region: raw.region || 'NY',
    zip: raw.zip || '10005',
    // Headline cash = broadly-available only (targeted offers don't all stack).
    cashRebate: stale ? 0 : cash.applied,
    // Conditional/targeted cash a buyer may additionally qualify for (display).
    conditionalCash: stale ? 0 : cash.conditional,
    financeApr: stale ? null : (raw.financeApr ?? null),
    financeTerm: raw.financeTerm ?? raw.financeTermMonths ?? 60,
    leaseMonthly: stale ? null : (raw.leaseMonthly ?? null),
    leaseDownPayment: raw.leaseDownPayment ?? null,
    leaseTerm: raw.leaseTerm ?? 36,
    // Lease-only cash (e.g. "Limited Term Lease Offer"): shown in a popup,
    // NEVER folded into the all-in total.
    leaseCash: stale ? 0 : (raw.leaseCash || 0),
    trims: stale ? null : (raw.trims || null),
  }
}

/**
 * React hook → map of { vehicleId → normalized incentive record }.
 * Returns {} until the fetch resolves; safe to spread into scoring functions.
 */
export function useIncentives() {
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    loadIncentives().then(data => {
      if (!alive) return
      const out = {}
      for (const [id, raw] of Object.entries(data.vehicles || {})) {
        const rec = normalize(raw)
        if (rec) out[id] = rec
      }
      setMap(out)
    })
    return () => { alive = false }
  }, [])
  return map
}

/** Standard amortized monthly payment. */
export function financeMonthly(principal, apr, termMonths) {
  if (!principal || principal <= 0) return 0
  const n = termMonths || 60
  const r = (apr || 0) / 100 / 12
  if (r <= 0) return principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

/**
 * Resolve the incentive offer for a specific trim + payment mode, preferring an
 * explicit per-trim entry and falling back to the model-level summary. Handles
 * both the v2 shape (lease.terms{24,36} + lease.leaseCash) and the older v1
 * shape (lease.monthlyPayment).
 *
 * IMPORTANT: `leaseCash` is returned for display only (a popup). It is NEVER
 * part of `cashRebate` and callers must not add it to any total. Regular `cash`
 * and `finance` rebates ARE meant to be applied to totals.
 *
 * @returns {null | {
 *   mode:'cash'|'finance'|'lease',
 *   cashRebate:number, apr:number|null, termMonths:number|null,
 *   monthlyPayment:number|null, dueAtSigning:number|null,
 *   terms?:object, leaseCash:number, stale:boolean, edmundsUrl:string|null
 * }}
 */
export function offerForTrim(rec, trimName, mode, msrp = 0, preferredTerm = 36) {
  if (!rec) return null
  const t = (rec.trims && trimName && rec.trims[trimName]) || null

  if (mode === 'cash') {
    // Broadly-available cash only (exclude targeted/conditional offers).
    const rebate = appliedCash(t?.cash?.items) ?? rec.cashRebate ?? 0
    return {
      mode: 'cash',
      cashRebate: rebate,
      apr: null,
      termMonths: 0,
      monthlyPayment: 0,
      netPrice: t?.cash?.netPrice ?? (msrp ? Math.max(0, msrp - rebate) : null),
      dueAtSigning: null,
      leaseCash: 0,
      stale: rec.stale,
      edmundsUrl: rec.edmundsUrl,
    }
  }

  if (mode === 'lease') {
    const lease = t?.lease || null
    // Build a normalized term map from v2 (terms) or v1 (single monthlyPayment).
    let terms = lease?.terms || null
    if (!terms && lease?.monthlyPayment) {
      terms = { [String(lease.termMonths || rec.leaseTerm || 36)]: {
        monthlyPayment: lease.monthlyPayment,
        dueAtSigning: lease.dueAtSigning ?? rec.leaseDownPayment ?? null,
        milesPerYear: lease.milesPerYear ?? 10000,
      } }
    }
    if (!terms && rec.leaseMonthly) {
      terms = { [String(rec.leaseTerm || 36)]: {
        monthlyPayment: rec.leaseMonthly,
        dueAtSigning: rec.leaseDownPayment ?? null,
        milesPerYear: 10000,
      } }
    }
    const leaseCash = lease?.leaseCash ?? rec.leaseCash ?? 0
    if (!terms && !leaseCash) return null
    // Honor the requested term (24/36) when published; otherwise prefer 36,
    // then 24, then whatever exists.
    const want = String(preferredTerm || 36)
    const key = terms
      ? (terms[want] ? want : terms['36'] ? '36' : terms['24'] ? '24' : Object.keys(terms)[0])
      : null
    const chosen = key ? terms[key] : null
    return {
      mode: 'lease',
      cashRebate: 0,
      apr: null,
      termMonths: key ? Number(key) : null,
      monthlyPayment: chosen?.monthlyPayment ?? null,
      dueAtSigning: chosen?.dueAtSigning ?? null,
      milesPerYear: chosen?.milesPerYear ?? 10000,
      terms: terms || {},
      leaseCash,                 // popup only — do NOT add to totals
      stale: rec.stale,
      edmundsUrl: rec.edmundsUrl,
    }
  }

  // finance (default)
  const apr = t?.finance?.apr ?? rec.financeApr ?? null
  const term = t?.finance?.termMonths ?? rec.financeTerm ?? 60
  // Broadly-available cash only (the scraped finance.rebate sums conditionals).
  const rebate = appliedCash(t?.cash?.items) ?? rec.cashRebate ?? 0
  const explicitMonthly = t?.finance?.monthlyPayment ?? null
  if (apr == null && !explicitMonthly && !rebate) return null
  const monthly = explicitMonthly
    ?? (apr != null && msrp ? financeMonthly(msrp * 0.9 - rebate, apr, term) : null)
  return {
    mode: 'finance',
    cashRebate: rebate,
    apr,
    termMonths: term,
    monthlyPayment: monthly,
    dueAtSigning: null,
    leaseCash: 0,
    stale: rec.stale,
    edmundsUrl: rec.edmundsUrl,
  }
}
