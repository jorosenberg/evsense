import { useEffect, useState } from 'react'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import {
  detectBrowserLocation,
  fetchDcfcStationsNear,
  aggregateDcfcCost,
  ocmConfigured,
} from '../../utils/openChargeMap'

/**
 * ChargingLocationPopup
 *
 * Lets the user opt in to a location-based DCFC cost estimate from Open
 * Charge Map. Supports both browser geolocation and ZIP code entry.
 * When a ZIP is resolved, also updates the user's state for electricity rates.
 *
 * Props:
 *   hideButton , when true, renders only the modal (no trigger button).
 *                 Used by App.jsx to show the prompt on first load.
 *   defaultRate, fallback DCFC rate shown in the unconfigured state.
 */
export default function ChargingLocationPopup({ defaultRate = 45, hideButton = false }) {
  const userPrefs = useUserPreferencesStore()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('idle')   // idle | locating | fetching | done | error
  const [result, setResult] = useState(null)

  const configured = ocmConfigured()

  // Auto-open on first mount if the user has never set a location.
  useEffect(() => {
    if (!userPrefs.dcfcRateCentsPerKwh && !userPrefs.dcfcLocationPromptDismissed) {
      setOpen(true)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function findNearMe() {
    setStatus('locating')
    setResult(null)
    const loc = await detectBrowserLocation()
    if (!loc) {
      setStatus('error')
      return
    }
    await fetchFor(loc.lat, loc.lng, null)
  }

  async function fetchFor(lat, lng, resolvedZip, resolvedState) {
    setStatus('fetching')

    // Persist the ZIP + state immediately so electricity rates update right away.
    if (resolvedZip || resolvedState) {
      userPrefs.setZip(resolvedZip || userPrefs.zip, resolvedState || undefined)
    }

    if (!configured) {
      // No OCM key, still save ZIP/state, then close.
      userPrefs.setFinancialProfile({ dcfcLocationPromptDismissed: true })
      setOpen(false)
      return
    }

    const stations = await fetchDcfcStationsNear({ lat, lng, distanceMi: 25 })
    if (!stations.length) {
      setStatus('done')
      setResult({ stations: [], summary: null })
      return
    }
    const summary = aggregateDcfcCost(stations)
    setResult({ stations, summary })
    setStatus('done')
  }

  function applyResult() {
    if (!result?.summary) return
    userPrefs.setFinancialProfile({
      dcfcRateCentsPerKwh: result.summary.centsPerKwh,
      dcfcLocationPromptDismissed: true,
    })
    setOpen(false)
  }

  function dismiss() {
    userPrefs.setFinancialProfile({ dcfcLocationPromptDismissed: true })
    setOpen(false)
  }

  return (
    <>
      {!hideButton && (
        <button
          onClick={() => { setStatus('idle'); setResult(null); setOpen(true) }}
          className="btn-secondary text-xs"
          type="button"
        >
          Use my location for DCFC pricing
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface-raised rounded-card border border-border shadow-card-hover max-w-md w-full p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-ink">Set your location</h3>
                <p className="text-xs text-ink-subtle mt-0.5">For accurate electricity rates and nearby charging costs</p>
              </div>
              <button onClick={dismiss} className="text-ink-subtle hover:text-ink ml-4" aria-label="Close">✕</button>
            </div>

            {status === 'idle' && (
              <div className="space-y-3">
                <button onClick={findNearMe} className="btn-primary w-full justify-center">
                  Use my browser location
                </button>
                <div className="text-center text-xs text-ink-subtle">or enter a ZIP code</div>
                <ZipLookup
                  defaultZip={userPrefs.zip || '10001'}
                  onSubmit={fetchFor}
                />
                <button onClick={dismiss} className="text-xs text-ink-subtle hover:text-ink w-full text-center pt-1">
                  Skip, use New York defaults
                </button>
              </div>
            )}

            {(status === 'locating' || status === 'fetching') && (
              <div className="py-6 text-center text-sm text-ink-muted">
                {status === 'locating' ? 'Asking for your location…' : 'Fetching nearby DCFC stations…'}
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3">
                <div className="text-sm text-status-red bg-status-red-bg rounded-lg p-3">
                  Couldn't get your location. Try entering a ZIP code instead.
                </div>
                <ZipLookup defaultZip={userPrefs.zip || '10001'} onSubmit={fetchFor} />
              </div>
            )}

            {status === 'done' && result && (
              result.stations.length === 0 ? (
                <div className="space-y-3">
                  <div className="text-sm text-ink-muted bg-surface-sunken rounded-lg p-3">
                    No DCFC stations found within 25 mi. Using state average for charging costs.
                  </div>
                  <button onClick={dismiss} className="btn-secondary w-full justify-center">Continue</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-brand-blue-light rounded-lg p-4">
                    <div className="text-xs text-brand-blue uppercase tracking-wider font-semibold">Median DCFC near you</div>
                    <div className="text-3xl font-semibold text-brand-blue tabular-nums">
                      {result.summary.centsPerKwh}¢
                      <span className="text-base font-normal">/kWh</span>
                    </div>
                    <div className="text-xs text-brand-blue/70 mt-1">
                      From {result.summary.sampleSize} priced of {result.stations.length} stations within 25 mi
                    </div>
                  </div>

                  {result.summary.networks && (
                    <div className="text-xs text-ink-muted">
                      Top networks: {result.summary.networks.map(([n, c]) => `${n} (${c})`).join(', ')}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={applyResult} className="btn-primary flex-1 justify-center">
                      Apply to calculator
                    </button>
                    <button onClick={dismiss} className="btn-ghost">Cancel</button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * ZipLookup, resolves a US ZIP to lat/lng + state via zippopotam.us,
 * then calls onSubmit(lat, lng, zip, stateAbbr).
 */
function ZipLookup({ defaultZip = '', onSubmit }) {
  const [zip, setZip] = useState(defaultZip)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function resolveZip() {
    setError(null)
    setSubmitting(true)
    try {
      const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`)
      if (!r.ok) {
        setError('ZIP not found. Double-check and try again.')
        return
      }
      const data = await r.json()
      const place = data.places?.[0]
      if (!place) {
        setError('No location data for that ZIP.')
        return
      }
      // zippopotam returns "state abbreviation" field
      const stateAbbr = place['state abbreviation'] || null
      onSubmit(Number(place.latitude), Number(place.longitude), zip, stateAbbr)
    } catch {
      setError('Network error, try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <label className="section-label block mb-1.5">US ZIP code</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={zip}
          onChange={e => setZip(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          placeholder="10001"
          className="input-base"
          inputMode="numeric"
          aria-label="ZIP code"
        />
        <button
          onClick={resolveZip}
          disabled={zip.length !== 5 || submitting}
          className="btn-primary px-4 disabled:opacity-50"
        >
          {submitting ? '…' : 'Go'}
        </button>
      </div>
      {error && <div className="text-xs text-status-red mt-1">{error}</div>}
    </div>
  )
}
