/**
 * useMatcherVehicles.js, Loads the expanded vehicle pool for the EV Matcher.
 *
 * Data source:
 *   public/data/matcher_vehicles.json  ← built by scraper/processors/matcher_generator.py
 *
 * Each row has a `dataQuality` field:
 *   - "full"      → curated 30 vehicles, exact lease/finance/feature data
 *   - "estimated" → catalog vehicles, estimated lease/finance/efficiency
 *
 * If matcher_vehicles.json hasn't been built yet, fall back to vehicles_summary.json
 * so the Matcher still works on a fresh clone.
 *
 * Returns the SAME shape as useVehicles() so MatcherPage can drop it in.
 */
import { useEffect, useState } from 'react'

let _cache = null
let _inflight = null

// Exported for unit tests (alongside _resetMatcherCache). Drives the full
// load-with-fallback flow against whatever global.fetch returns.
export async function loadMatcherVehicles() {
  if (_cache) return _cache
  if (_inflight) return _inflight

  const base = import.meta.env.BASE_URL || '/'

  _inflight = fetch(`${base}data/matcher_vehicles.json`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`matcher_vehicles.json: ${r.status}`)
      const payload = await r.json()
      const vehicles = Array.isArray(payload) ? payload : payload.vehicles
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        throw new Error('matcher_vehicles.json was empty')
      }
      return {
        vehicles,
        meta: {
          source:      'matcher_vehicles.json',
          lastUpdated: payload.lastUpdated || null,
          tierCounts:  payload.tierCounts  || null,
          total:       vehicles.length,
        },
      }
    })
    .catch(async () => {
      // Fallback, Matcher should always work, even pre-scrape
      const r = await fetch(`${base}data/vehicles_summary.json`)
      if (!r.ok) throw new Error(`fallback summary: ${r.status}`)
      const vehicles = await r.json()
      return {
        vehicles: vehicles.map(v => ({ ...v, dataQuality: 'full' })),
        meta: {
          source:      'vehicles_summary.json (fallback)',
          lastUpdated: null,
          tierCounts:  { full: vehicles.length, estimated: 0 },
          total:       vehicles.length,
        },
      }
    })
    .then(async result => {
      // Merge scores when available (optional file). Kept generic in the data
      // model (expertRating / expertSubscores), no provider name in the UI.
      try {
        const er = await fetch(`${base}data/vehicle_scores.json`)
        if (er.ok) {
          const scores = await er.json()
          const map = scores?.vehicles || {}
          result.vehicles = result.vehicles.map(v => {
            const rec = map[v.id]
            return rec
              ? { ...v, expertRating: rec.overall ?? null,
                  expertSubscores: { value: rec.value ?? null, storageMax: rec.storageMax ?? null } }
              : v
          })
        }
      } catch { /* vehicle_scores.json optional, ignore */ }
      try {
        const tr = await fetch(`${base}data/tested_specs.json`)
        if (tr.ok) {
          const tmap = (await tr.json())?.vehicles || {}
          result.vehicles = result.vehicles.map(v => {
            const rec = tmap[v.id]
            return rec ? { ...v, testedRange: rec.testedRange ?? null } : v
          })
        }
      } catch { /* tested_specs.json optional, ignore */ }
      _cache = result
      _inflight = null
      return result
    })
    .catch(err => {
      _inflight = null
      throw err
    })

  return _inflight
}

/**
 * Public hook.
 * @returns {{
 *   allVehicles: Array,
 *   loading: boolean,
 *   error: string | null,
 *   meta: { source: string, lastUpdated: string|null, tierCounts: object|null, total: number }
 * }}
 */
export function useMatcherVehicles() {
  const [data, setData]       = useState(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (_cache) {
      setData(_cache)
      setLoading(false)
      return
    }
    let cancelled = false
    loadMatcherVehicles()
      .then(result => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || 'Failed to load matcher vehicles')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return {
    allVehicles: data?.vehicles || [],
    loading,
    error,
    meta: data?.meta || { source: null, lastUpdated: null, tierCounts: null, total: 0 },
  }
}

/** Bust the in-memory cache (useful in tests). */
export function _resetMatcherCache() {
  _cache = null
  _inflight = null
}
