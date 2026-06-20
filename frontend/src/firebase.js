import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// ─── Config parsing ───────────────────────────────────────────────────────────
//
// Vite's env handling can double-encode JSON in .env.local.
// e.g. VITE_FIREBASE_CONFIG={"apiKey":"..."} arrives as the string:
//   '{"apiKey":"..."}' — one parse needed
// But sometimes Vite wraps it in extra quotes:
//   '"{\\"apiKey\\":\\"...\\"}"' — two parses needed
//
// We try both. The .env.local value should NOT have surrounding quotes:
//   CORRECT:   VITE_FIREBASE_CONFIG={"apiKey":"..."}
//   INCORRECT: VITE_FIREBASE_CONFIG='{"apiKey":"..."}'

function parseFirebaseConfig() {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG
  if (!raw || raw === '{}' || raw === 'undefined') return null

  // Try direct parse
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed?.projectId) return parsed
  } catch { /* fall through */ }

  // Try unquoting then parsing (Vite double-encode case)
  try {
    const unquoted = raw.replace(/^['"]|['"]$/g, '')
    const parsed = JSON.parse(unquoted)
    if (parsed?.projectId) return parsed
  } catch { /* fall through */ }

  console.warn(
    '[Firebase] Could not parse VITE_FIREBASE_CONFIG.\n' +
    'Make sure your .env.local line looks exactly like:\n' +
    'VITE_FIREBASE_CONFIG={"apiKey":"...","projectId":"..."}\n' +
    '(no surrounding single or double quotes around the JSON)'
  )
  return null
}

const firebaseConfig = parseFirebaseConfig()

// ─── App init ─────────────────────────────────────────────────────────────────
// Only initialise if we have a valid config — avoids the "projectId not provided" error.
// Without Firebase, the app still works: Browse page uses static JSON,
// calculator is fully client-side. Only vehicle detail pages need Firestore.

let app = null
let db = null
let storage = null

if (firebaseConfig?.projectId) {
  // Avoid re-initialising in hot-reload (Vite HMR)
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  db = getFirestore(app)
  storage = getStorage(app)
} else {
  if (import.meta.env.DEV) {
    console.info(
      '[Firebase] Running without Firestore — vehicle detail pages will use mock data.\n' +
      'To connect Firebase, add VITE_FIREBASE_CONFIG to frontend/.env.local'
    )
  }
}

export { db, storage }

/**
 * Fetch a vehicle's full detail document from Firestore.
 * Returns null if Firebase is not configured or the document doesn't exist.
 */
export async function fetchVehicleDetail(vehicleId) {
  if (!db) return null
  try {
    const ref = doc(db, 'vehicles', vehicleId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() }
  } catch (e) {
    console.warn('[Firebase] fetchVehicleDetail failed:', e.message)
    return null
  }
}

/**
 * Fetch state data from Firestore.
 */
export async function fetchStateData(stateAbbr) {
  if (!db) return null
  try {
    const ref = doc(db, 'state_data', stateAbbr.toUpperCase())
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return snap.data()
  } catch (e) {
    console.warn('[Firebase] fetchStateData failed:', e.message)
    return null
  }
}

