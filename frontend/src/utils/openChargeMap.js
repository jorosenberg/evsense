/**
 * Open Charge Map integration.
 * Docs: https://openchargemap.org/site/develop/api
 *
 * The free OCM API requires an API key. Set VITE_OCM_API_KEY in
 * frontend/.env.local. Without a key, the helpers degrade to returning
 * `null` and the UI falls back to state-average electricity rates.
 *
 * OCM returns charging station POIs with metadata about connectors,
 * networks, and usage cost. Cost data on OCM is user-reported and patchy —
 * we treat it as a sanity check on top of a network-average lookup.
 */

const OCM_API = 'https://api.openchargemap.io/v3/poi/'

/**
 * Average DCFC pricing per kWh for the major US networks (2025 published rates).
 * Used when OCM doesn't report a price for a given station.
 */
const NETWORK_AVG_KWH = {
  'Tesla': 0.40,
  'Tesla Supercharger': 0.40,
  'Electrify America': 0.48,
  'EVgo': 0.49,
  'ChargePoint': 0.42,
  'Blink': 0.45,
  'Shell Recharge': 0.45,
  'FLO': 0.32,
  'EV Connect': 0.40,
  'BP Pulse': 0.45,
  'Volta': 0.35,
  'Greenlots': 0.40,
  'Francis Energy': 0.43,
}
const DEFAULT_DCFC_KWH = 0.45

function apiKey() {
  return import.meta.env.VITE_OCM_API_KEY || null
}

/**
 * Returns true if Open Charge Map is configured (API key present).
 */
export function ocmConfigured() {
  return Boolean(apiKey())
}

/**
 * Browser-side geolocation, returns {lat, lng} or null on rejection.
 */
export function detectBrowserLocation(timeoutMs = 8000) {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    let done = false
    const t = setTimeout(() => {
      if (!done) {
        done = true
        resolve(null)
      }
    }, timeoutMs)

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (done) return
        done = true
        clearTimeout(t)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        if (done) return
        done = true
        clearTimeout(t)
        resolve(null)
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: timeoutMs }
    )
  })
}

/**
 * Fetch DCFC POIs from Open Charge Map within `distanceMi` of (lat, lng).
 *
 * Returns an array of normalized stations:
 *   { id, name, network, connectorCount, distanceMi, costRaw, costPerKwh }
 *
 * Returns [] on misconfiguration or network error.
 */
export async function fetchDcfcStationsNear({ lat, lng, distanceMi = 25, maxResults = 50 }) {
  const key = apiKey()
  if (!key || lat == null || lng == null) return []

  const params = new URLSearchParams({
    output: 'json',
    countrycode: 'US',
    latitude: String(lat),
    longitude: String(lng),
    distance: String(distanceMi),
    distanceunit: 'miles',
    maxresults: String(maxResults),
    levelid: '3',                 // 3 = DC Fast
    verbose: 'false',
    compact: 'true',
    key,
  })

  try {
    const r = await fetch(`${OCM_API}?${params.toString()}`)
    if (!r.ok) return []
    const data = await r.json()
    return data.map(normalizePoi).filter(Boolean)
  } catch {
    return []
  }
}

function normalizePoi(poi) {
  const info = poi.AddressInfo || {}
  const network = poi.OperatorInfo?.Title || poi.DataProvider?.Title || 'Unknown'
  const connectors = poi.Connections || []
  const costRaw = poi.UsageCost || null

  let costPerKwh = parseCostString(costRaw) || NETWORK_AVG_KWH[network] || null

  return {
    id: poi.ID,
    name: info.Title || `${network} Station`,
    network,
    address: [info.AddressLine1, info.Town, info.StateOrProvince].filter(Boolean).join(', '),
    distanceMi: info.Distance ? Number(info.Distance.toFixed(1)) : null,
    connectorCount: connectors.length,
    maxPowerKw: Math.max(0, ...connectors.map(c => Number(c.PowerKW || 0))),
    costRaw,
    costPerKwh,
  }
}

/**
 * Best-effort extraction of dollars-per-kWh from OCM's freeform UsageCost
 * strings like "$0.43/kWh", "0.55 per kWh + $1 session fee", etc.
 */
function parseCostString(s) {
  if (!s) return null
  const m = /\$?(\d+(?:\.\d+)?)\s*(?:\/|per\s*)k?Wh/i.exec(s)
  if (m) return Number(m[1])
  return null
}

/**
 * Aggregate a list of stations into a single representative DCFC ¢/kWh.
 * Uses the median price across stations that have parseable cost data.
 * Falls back to DEFAULT_DCFC_KWH if no priced stations.
 */
export function aggregateDcfcCost(stations) {
  const prices = stations.map(s => s.costPerKwh).filter(p => typeof p === 'number' && p > 0)
  if (prices.length === 0) {
    return {
      centsPerKwh: Math.round(DEFAULT_DCFC_KWH * 100),
      sampleSize: 0,
      method: 'default',
    }
  }
  prices.sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)]
  return {
    centsPerKwh: Math.round(median * 100),
    sampleSize: prices.length,
    method: 'median',
    networks: countByNetwork(stations),
  }
}

function countByNetwork(stations) {
  const c = {}
  for (const s of stations) c[s.network] = (c[s.network] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5)
}
