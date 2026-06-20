/**
 * useNearbyChargers — fetches DCFC stations from Open Charge Map API
 *
 * OCM is a crowd-sourced EVSE database with 550k+ locations worldwide.
 * API docs: https://openchargemap.org/site/develop/api
 *
 * Results are cached in a module-level Map (keyed by rounded lat/lng) so
 * panning or re-renders don't re-fetch the same coordinates.
 */

const OCM_KEY = import.meta.env.VITE_OCM_API_KEY
const CACHE = new Map()

/** Round to 2 decimal places (~1.1 km precision) for cache key */
function cacheKey(lat, lng) {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`
}

/**
 * Geocode a US ZIP code to { lat, lng } using OpenStreetMap Nominatim (no key needed).
 * Returns null on failure.
 */
export async function geocodeZip(zip) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=US&format=json&limit=1`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

/**
 * Fetch nearby DCFC chargers from Open Charge Map.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} opts
 * @param {number} [opts.maxResults=8]
 * @param {number} [opts.radiusMiles=25]
 * @returns {Promise<Array>} Array of OCM POI objects
 */
export async function fetchNearbyChargers(lat, lng, { maxResults = 8, radiusMiles = 25 } = {}) {
  const key = cacheKey(lat, lng)
  if (CACHE.has(key)) return CACHE.get(key)

  const url = new URL('https://api.openchargemap.io/v3/poi/')
  url.searchParams.set('output', 'json')
  url.searchParams.set('maxresults', String(maxResults))
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('distance', String(radiusMiles))
  url.searchParams.set('distanceunit', 'Miles')
  url.searchParams.set('levelid', '3')      // Level 3 = DC Fast Charging only
  url.searchParams.set('compact', 'true')
  url.searchParams.set('verbose', 'false')
  if (OCM_KEY) url.searchParams.set('key', OCM_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OCM API error ${res.status}`)
  const data = await res.json()

  CACHE.set(key, data)
  return data
}

/**
 * OCM connection type ID → short label
 */
export const OCM_CONNECTOR_LABELS = {
  1:  'J1772',
  2:  'CHAdeMO',
  25: 'CCS1',
  27: 'CCS2',
  30: 'NACS',   // Tesla Supercharger (now NACS standard)
  33: 'NACS',   // Tesla Roadster / NACS variant
}

/**
 * Determine compatibility between vehicle's chargingPort and a station's connections.
 * Returns true if the station has a compatible DCFC connector.
 */
export function isCompatible(vehiclePort, connections = []) {
  if (!vehiclePort) return true // unknown — show everything

  const portUpper = vehiclePort.toUpperCase()

  // NACS vehicles (Tesla + adapters) can use NACS stations
  // CCS1 vehicles can use CCS1 stations
  // CHAdeMO vehicles can use CHAdeMO stations
  // NACS vehicles with CCS adapter can use CCS1 too (we show both)

  return connections.some(c => {
    const label = OCM_CONNECTOR_LABELS[c.ConnectionTypeID] || ''
    if (portUpper.includes('NACS') && (label === 'NACS' || label === 'CCS1')) return true
    if (portUpper.includes('CCS') && label === 'CCS1') return true
    if (portUpper.includes('CHADEMO') && label === 'CHAdeMO') return true
    return false
  })
}
