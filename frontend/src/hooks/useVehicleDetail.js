import { useState, useEffect } from 'react'
import { fetchVehicleDetail } from '../firebase'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Fetches full vehicle detail. Loads from the static `/data/vehicles/{id}.json`
 * bundle first (works on GitHub Pages without Firestore), and falls back to
 * Firestore only if a `VITE_FIREBASE_CONFIG` is provided AND the static file
 * is not present.
 *
 * Caches the parsed document in sessionStorage so navigating between Browse
 * and Detail pages does not re-fetch.
 */
export function useVehicleDetail(vehicleId) {
  const [vehicle, setVehicle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!vehicleId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const cacheKey = `vehicle_${vehicleId}`

    // 1) sessionStorage cache
    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL_MS) {
          setVehicle(sanitize(data))
          setLoading(false)
          return
        }
      }
    } catch { /* sessionStorage unavailable, continue */ }

    // Edmunds EV Range Test results (optional). Attach testedRange/consumption.
    async function attachTested(data) {
      try {
        const base = import.meta.env.BASE_URL || '/'
        const r = await fetch(`${base}data/tested_specs.json`)
        if (r.ok) {
          const rec = (await r.json())?.vehicles?.[vehicleId]
          if (rec) {
            data.testedRange = rec.testedRange ?? null
            data.testedConsumption = rec.testedConsumption ?? null
            data.testedByTrim = rec.trims ?? null
          }
        }
      } catch { /* optional */ }
      return data
    }

    function sanitize(data) {
      if (data?.trims) {
        data.trims = data.trims.filter(t => !/prod\.?\s*end/i.test(t?.name || ''))
      }
      return data
    }

    async function load() {
      // 2) Static JSON (preferred for GitHub Pages deploy)
      try {
        const base = import.meta.env.BASE_URL || '/'
        const res = await fetch(`${base}data/vehicles/${vehicleId}.json`)
        if (res.ok) {
          const data = sanitize(await attachTested(await res.json()))
          if (cancelled) return
          setVehicle(data)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }))
          } catch { /* ignore */ }
          setLoading(false)
          return
        }
      } catch {
        // Network error, fall through to Firestore
      }

      // 3) Firestore (only if configured)
      try {
        const data = sanitize(await fetchVehicleDetail(vehicleId))
        if (cancelled) return
        if (data) {
          setVehicle(data)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }))
          } catch { /* ignore */ }
        } else {
          setError('Vehicle not found')
        }
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Failed to load vehicle')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  return { vehicle, loading, error }
}
