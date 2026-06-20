import { useEffect, useState } from 'react'

/**
 * Loads the full EV catalog scraped from ev-database.org.
 * The JSON ships statically with the build (frontend/public/data/ev_database.json).
 *
 * Returns:
 *   catalog       , { source, scraped_at, vehicles[] }
 *   loading, error
 *   findByName(q) , case-insensitive substring search across name field
 *   findById(id)
 */

let _cache = null
let _inflight = null

async function loadCatalog() {
  if (_cache) return _cache
  if (_inflight) return _inflight
  const base = import.meta.env.BASE_URL || '/'
  _inflight = fetch(`${base}data/ev_database.json`)
    .then(r => {
      if (!r.ok) throw new Error(`Catalog fetch failed: ${r.status}`)
      return r.json()
    })
    .then(data => {
      _cache = data
      _inflight = null
      return data
    })
    .catch(err => {
      _inflight = null
      throw err
    })
  return _inflight
}

export function useEvDatabase() {
  const [catalog, setCatalog] = useState(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (_cache) return
    let cancelled = false
    loadCatalog()
      .then(data => {
        if (!cancelled) {
          setCatalog(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  function findByName(query) {
    if (!catalog || !query) return []
    const q = query.toLowerCase().trim()
    if (!q) return []
    return catalog.vehicles.filter(v => v.name.toLowerCase().includes(q)).slice(0, 50)
  }

  function findById(id) {
    if (!catalog || !id) return null
    return catalog.vehicles.find(v => v.id === id) || null
  }

  return { catalog, loading, error, findByName, findById }
}
