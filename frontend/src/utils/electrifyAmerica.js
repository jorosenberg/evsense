/**
 * electrifyAmerica.js, complimentary Electrify America (EA) charging offers.
 *
 * Some manufacturers bundle complimentary EA fast charging with an EV purchase
 * or lease (e.g. Hyundai/VW 2–3 yrs of 30-min sessions, Kia 1,000 kWh). This
 * module loads /data/electrify_america_offers.json and turns an offer into a
 * monthly charging SAVINGS figure so the benefit flows through the app's cost
 * math (Browse cards, Matcher, Calculator), modeled as free DC fast charging
 * for the benefit period, amortized over the ownership horizon.
 *
 * Terms vary and change often; offers carry `verified` so the UI can caveat.
 */

import { useEffect, useState } from 'react'

let _cache = null
let _inflight = null

export function loadEAOffers() {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = fetch('/data/electrify_america_offers.json')
    .then(r => (r.ok ? r.json() : null))
    .then(d => { _cache = d && d.vehicles ? d : { vehicles: {} }; return _cache })
    .catch(() => { _cache = { vehicles: {} }; return _cache })
  return _inflight
}

/** React hook → { vehicleId → offer }. */
export function useEAOffers() {
  const [map, setMap] = useState({})
  useEffect(() => {
    let alive = true
    loadEAOffers().then(d => { if (alive) setMap(d.vehicles || {}) })
    return () => { alive = false }
  }, [])
  return map
}

export function eaOfferFor(map, vehicleId) {
  return (map && vehicleId && map[vehicleId]) || null
}

/**
 * Monthly charging savings ($/mo) from an EA complimentary-charging offer,
 * amortized over the ownership horizon. The benefit is modeled as free DC fast
 * charging (the EA network is DC fast); home/L2 charging is unaffected.
 *
 * @param {object} args
 * @param {object} args.offer       , an entry from electrify_america_offers.json
 * @param {number} args.annualMiles
 * @param {number} args.milesPerKwh , vehicle efficiency
 * @param {number} args.dcFastSharePct, % of charging done on DC fast (0–100)
 * @param {number} args.dcfcRate    , $/kWh for DC fast charging
 * @param {number} [args.ownershipYears=5]
 * @returns {{ monthly:number, annualDcfcCost:number, freeYears:number, totalFree:number }}
 */
export function eaMonthlyChargingSavings({
  offer, annualMiles, milesPerKwh, dcFastSharePct, dcfcRate, ownershipYears = 5,
}) {
  const zero = { monthly: 0, annualDcfcCost: 0, freeYears: 0, totalFree: 0 }
  if (!offer || !milesPerKwh || !annualMiles || !dcfcRate) return zero
  const dcShare = Math.max(0, Math.min(1, (dcFastSharePct ?? 0) / 100))
  const annualDcfcKwh = (annualMiles / milesPerKwh) * dcShare
  const annualDcfcCost = annualDcfcKwh * dcfcRate
  if (annualDcfcCost <= 0) return zero

  const benefitYears = Math.max(0, Math.min(offer.years || 0, ownershipYears))
  let totalFree
  if (offer.plan === 'kwh' && offer.kwh) {
    const freeKwh = Math.min(offer.kwh, annualDcfcKwh * benefitYears)
    totalFree = freeKwh * dcfcRate
  } else {
    // unlimited_dcfc (default): all DC fast charging is free during the period.
    totalFree = annualDcfcCost * benefitYears
  }
  const monthly = totalFree / (Math.max(1, ownershipYears) * 12)
  return {
    monthly: Math.max(0, monthly),
    annualDcfcCost,
    freeYears: benefitYears,
    totalFree,
  }
}
