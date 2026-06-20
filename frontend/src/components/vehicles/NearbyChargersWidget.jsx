/**
 * NearbyChargersWidget — "Find DCFC chargers near you"
 *
 * Shows up to 5 nearby DC Fast Charging stations for a given vehicle,
 * sourced from Open Charge Map (openchargedmap.org).
 *
 * Location can be obtained from:
 *   1. Browser Geolocation API (primary)
 *   2. ZIP code entry → Nominatim geocode (fallback)
 *
 * No mapping library required — stations shown as a card list with
 * distance, connector types, power output, and Google Maps deep-links.
 */
import { useState, useCallback } from 'react'
import { fetchNearbyChargers, geocodeZip, OCM_CONNECTOR_LABELS, isCompatible } from '../../hooks/useNearbyChargers'

// ─── OCM status type IDs ──────────────────────────────────────────────────────
function statusInfo(statusTypeId) {
  if (statusTypeId === 50) return { dot: 'bg-status-green', label: 'Operational' }
  if (statusTypeId === 75) return { dot: 'bg-status-yellow', label: 'Temporarily unavailable' }
  if (statusTypeId === 100) return { dot: 'bg-status-red', label: 'Not operational' }
  return { dot: 'bg-border', label: 'Status unknown' }
}

// ─── Extract unique DCFC connector labels for a station ──────────────────────
function getDcfcConnectors(connections) {
  if (!connections?.length) return []
  const seen = new Set()
  return connections
    .filter(c => c.Level?.IsFastChargeCapable)
    .map(c => OCM_CONNECTOR_LABELS[c.ConnectionTypeID] || c.ConnectionType?.Title || '?')
    .filter(label => {
      if (seen.has(label)) return false
      seen.add(label)
      return true
    })
}

// ─── Max kW across all fast connections ──────────────────────────────────────
function getMaxKw(connections) {
  if (!connections?.length) return null
  const kws = connections
    .filter(c => c.Level?.IsFastChargeCapable && c.PowerKW)
    .map(c => c.PowerKW)
  return kws.length ? Math.max(...kws) : null
}

// ─── Google Maps direction link ───────────────────────────────────────────────
function mapsLink(lat, lng, name) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(name)}`
}

// ─── Single station row ───────────────────────────────────────────────────────
function StationRow({ station, vehiclePort, index }) {
  const info = station.AddressInfo
  const status = statusInfo(station.StatusType?.ID)
  const connectors = getDcfcConnectors(station.Connections)
  const maxKw = getMaxKw(station.Connections)
  const compatible = isCompatible(vehiclePort, station.Connections)
  const distance = info.Distance ? `${info.Distance.toFixed(1)} mi` : null

  return (
    <div className={`flex items-start gap-3 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
      {/* Station number */}
      <div className="shrink-0 w-6 h-6 rounded-full bg-surface-sunken flex items-center justify-center text-xs font-semibold text-ink-muted mt-0.5">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* Name */}
            <p className="font-medium text-sm text-ink leading-tight truncate">
              {info.Title}
            </p>
            {/* Address */}
            <p className="text-xs text-ink-subtle mt-0.5 truncate">
              {[info.AddressLine1, info.Town, info.StateOrProvince].filter(Boolean).join(', ')}
            </p>
          </div>

          {/* Distance + directions */}
          <div className="shrink-0 text-right">
            {distance && (
              <span className="text-xs font-semibold text-ink">{distance}</span>
            )}
            <a
              href={mapsLink(info.Latitude, info.Longitude, info.Title)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-brand-blue hover:underline mt-0.5"
            >
              Directions ↗
            </a>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {/* Status dot */}
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>

          {/* Max power */}
          {maxKw && (
            <span className="badge badge-grey text-[11px]">
              {maxKw} kW
            </span>
          )}

          {/* Connector types */}
          {connectors.map(c => (
            <span
              key={c}
              className={`badge text-[11px] ${
                vehiclePort && isCompatible(vehiclePort, station.Connections)
                  ? 'badge-green'
                  : 'badge-grey'
              }`}
            >
              {c}
            </span>
          ))}

          {/* Number of stalls */}
          {station.NumberOfPoints > 0 && (
            <span className="text-[11px] text-ink-subtle">
              {station.NumberOfPoints} stall{station.NumberOfPoints !== 1 ? 's' : ''}
            </span>
          )}

          {/* Compatibility note */}
          {vehiclePort && !compatible && (
            <span className="text-[11px] text-status-yellow font-medium">Check adapter</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function NearbyChargersWidget({ vehicle }) {
  const vehiclePort = vehicle?.specs?.chargingPort || null

  const [location, setLocation] = useState(null)  // { lat, lng, label }
  const [chargers, setChargers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [zip, setZip] = useState('')
  const [zipLoading, setZipLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const loadChargers = useCallback(async (lat, lng) => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    try {
      const data = await fetchNearbyChargers(lat, lng, { maxResults: 8, radiusMiles: 25 })
      // Sort by distance ascending (OCM returns them sorted already, but let's be explicit)
      const sorted = [...data].sort(
        (a, b) => (a.AddressInfo.Distance || 99) - (b.AddressInfo.Distance || 99)
      )
      setChargers(sorted.slice(0, 5))
    } catch (err) {
      setError('Could not load nearby chargers. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Geolocation handler ──
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords
        setLocation({ lat, lng, label: 'your location' })
        loadChargers(lat, lng)
      },
      (err) => {
        setLoading(false)
        if (err.code === 1) {
          setError('Location access denied. Enter a ZIP code below instead.')
        } else {
          setError('Could not get your location. Try entering a ZIP code.')
        }
      },
      { timeout: 8000 }
    )
  }, [loadChargers])

  // ── ZIP code handler ──
  const handleZip = useCallback(async () => {
    const trimmed = zip.trim()
    if (!/^\d{5}$/.test(trimmed)) {
      setError('Please enter a valid 5-digit US ZIP code.')
      return
    }
    setZipLoading(true)
    setError(null)
    const coords = await geocodeZip(trimmed)
    setZipLoading(false)
    if (!coords) {
      setError(`Could not find ZIP code "${trimmed}". Check and try again.`)
      return
    }
    setLocation({ lat: coords.lat, lng: coords.lng, label: `ZIP ${trimmed}` })
    loadChargers(coords.lat, coords.lng)
  }, [zip, loadChargers])

  const titleStr = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'this EV'

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <h3 className="font-semibold text-ink">Nearby DCFC Charging Stations</h3>
        <p className="text-xs text-ink-muted mt-0.5">
          DC Fast Chargers within 25 miles
          {vehiclePort && ` — filtered for ${vehiclePort} compatible stations`}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Location prompt / controls */}
        {!location && !hasSearched && (
          <div className="text-center py-4">
            <div className="text-2xl mb-2"></div>
            <p className="text-sm text-ink-muted mb-4">
              Find DCFC stations near you for{' '}
              <span className="font-medium text-ink">{titleStr}</span>
            </p>

            <button
              onClick={handleGeolocate}
              disabled={loading}
              className="btn-primary mx-auto mb-3"
            >
              {loading ? 'Getting location…' : 'Use My Location'}
            </button>

            <div className="flex items-center gap-2 max-w-xs mx-auto mt-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-ink-subtle">or enter ZIP</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-2 max-w-xs mx-auto mt-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="12345"
                value={zip}
                onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleZip()}
                className="input-base flex-1 text-center"
              />
              <button
                onClick={handleZip}
                disabled={zipLoading || zip.length !== 5}
                className="btn-secondary px-4"
              >
                {zipLoading ? '…' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {/* Already have location — show refresh controls compactly */}
        {location && (
          <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
            <span>Showing results near <span className="font-medium text-ink">{location.label}</span></span>
            <div className="flex gap-2">
              <button
                onClick={handleGeolocate}
                className="text-brand-blue hover:underline"
              >
                Update location
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-status-red-bg border border-status-red/30 rounded-xl p-3 text-sm text-status-red flex items-start gap-2">
            <span className="shrink-0"></span>
            <div>
              {error}
              {/* If geo failed, still show ZIP input */}
              {!location && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Enter ZIP code"
                    value={zip}
                    onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && handleZip()}
                    className="input-base flex-1 text-center"
                  />
                  <button
                    onClick={handleZip}
                    disabled={zipLoading || zip.length !== 5}
                    className="btn-secondary px-4"
                  >
                    {zipLoading ? '…' : 'Search'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3 py-3">
                <div className="skeleton w-6 h-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="flex gap-1.5">
                    <div className="skeleton h-5 w-16 rounded-full" />
                    <div className="skeleton h-5 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && chargers.length > 0 && (
          <div>
            {chargers.map((station, i) => (
              <StationRow
                key={station.ID}
                station={station}
                vehiclePort={vehiclePort}
                index={i}
              />
            ))}
          </div>
        )}

        {/* No results */}
        {!loading && hasSearched && chargers.length === 0 && !error && (
          <div className="text-center py-6">
            <div className="text-2xl mb-2"></div>
            <p className="text-sm text-ink-muted">
              No DCFC stations found within 25 miles of {location?.label || 'your location'}.
            </p>
            <p className="text-xs text-ink-subtle mt-1">
              Try a different location or check{' '}
              <a
                href="https://openchargemap.org/site/poi"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue hover:underline"
              >
                Open Charge Map ↗
              </a>
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-[11px] text-ink-subtle border-t border-border pt-3">
          Data from{' '}
          <a
            href="https://openchargemap.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Open Charge Map
          </a>{' '}
          · Community-maintained · Verify station availability before traveling.
          {vehiclePort === 'CCS1' && (
            <> NACS stations may be accessible via CCS adapter (sold separately).</>
          )}
        </p>
      </div>
    </div>
  )
}
