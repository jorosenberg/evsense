import { useEffect } from 'react'
import { useUserPreferencesStore } from '../store/userPreferencesStore'

/**
 * Detects the user's state via IP geolocation on first visit.
 * Skips detection if state was previously set manually.
 * Runs once per app mount.
 */
export function useStateDetection() {
  const { stateDetectionMethod, setState } = useUserPreferencesStore()

  useEffect(() => {
    // Don't re-detect if user already chose manually
    if (stateDetectionMethod === 'manual') return

    detectState(setState)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

async function detectState(setState) {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=regionCode', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error('ip-api error')
    const { regionCode } = await res.json()
    if (regionCode && regionCode.length === 2 && /^[A-Z]{2}$/.test(regionCode)) {
      setState(regionCode, 'ip')
      return
    }
  } catch {
    // Silently fall through — ip-api may be unavailable or HTTPS required
  }
  // Default to California (largest EV market)
  setState('CA', 'default')
}
