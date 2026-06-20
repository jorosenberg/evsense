/**
 * EVsense — Firebase Cloud Functions
 *
 * 1. ocmProxy(lat, lng, radius)
 *    Server-side proxy for Open Charge Map. Lets the React app fetch nearby
 *    chargers WITHOUT exposing the OCM API key in the browser. The key is
 *    stored as a Firebase Functions secret (set via `firebase functions:secrets:set OCM_API_KEY`).
 *
 * 2. triggerScrape (optional)
 *    HTTP-callable function that invokes the AWS Lambda scraper. Useful for
 *    triggering a scrape from an admin UI without exposing AWS credentials
 *    to the client.
 *
 * 3. scheduledHealthCheck
 *    Runs daily — pings the scraper /status endpoint and writes the result
 *    to Firestore for the admin dashboard.
 *
 * Deploy: `firebase deploy --only functions`
 */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { defineSecret } = require('firebase-functions/params')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

// ─── Secrets ──────────────────────────────────────────────────────────────────
// Set with: firebase functions:secrets:set OCM_API_KEY
const OCM_API_KEY = defineSecret('OCM_API_KEY')

// Set with: firebase functions:secrets:set AWS_SCRAPER_URL (the API Gateway URL)
const AWS_SCRAPER_URL = defineSecret('AWS_SCRAPER_URL')

// ─── 1. OCM Proxy ─────────────────────────────────────────────────────────────
exports.ocmProxy = onRequest(
  { secrets: [OCM_API_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    const { lat, lng, distance = 25, maxresults = 8 } = req.query

    if (!lat || !lng) {
      res.status(400).json({ error: 'lat and lng required' })
      return
    }

    const url = new URL('https://api.openchargemap.io/v3/poi/')
    url.searchParams.set('output', 'json')
    url.searchParams.set('latitude', lat)
    url.searchParams.set('longitude', lng)
    url.searchParams.set('distance', distance)
    url.searchParams.set('distanceunit', 'Miles')
    url.searchParams.set('maxresults', maxresults)
    url.searchParams.set('levelid', '3') // DCFC only
    url.searchParams.set('compact', 'true')
    url.searchParams.set('verbose', 'false')
    url.searchParams.set('key', OCM_API_KEY.value())

    try {
      const upstream = await fetch(url.toString())
      if (!upstream.ok) throw new Error(`OCM ${upstream.status}`)
      const data = await upstream.json()

      // Aggressive caching — chargers don't change minute-to-minute
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      res.json(data)
    } catch (err) {
      logger.error('OCM proxy error:', err)
      res.status(502).json({ error: 'upstream_failed', detail: err.message })
    }
  }
)

// ─── 2. Trigger AWS Scrape (callable from admin UI) ──────────────────────────
exports.triggerScrape = onCall(
  { secrets: [AWS_SCRAPER_URL], region: 'us-central1' },
  async (request) => {
    // Auth check — only allow signed-in admin users
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in')
    }
    // TODO: add admin check via custom claim:
    //   if (!request.auth.token.admin) throw new HttpsError('permission-denied', 'Admin only')

    const { brand, refreshAll = false, uploadImages = true } = request.data || {}

    try {
      const response = await fetch(AWS_SCRAPER_URL.value(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, refreshAll, uploadImages }),
      })
      const result = await response.json()
      logger.info('Scrape triggered:', result)
      return result
    } catch (err) {
      logger.error('Trigger scrape error:', err)
      throw new HttpsError('internal', `Failed to trigger scrape: ${err.message}`)
    }
  }
)

// ─── 3. Daily health check ───────────────────────────────────────────────────
exports.scheduledHealthCheck = onSchedule(
  {
    schedule: '0 12 * * *',         // 12:00 UTC daily
    timeZone: 'UTC',
    secrets: [AWS_SCRAPER_URL],
    region: 'us-central1',
  },
  async (event) => {
    const statusUrl = AWS_SCRAPER_URL.value().replace('/scrape', '/status')
    try {
      const res = await fetch(statusUrl)
      const status = await res.json()
      await db.collection('health').doc('latest').set({
        ...status,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      logger.info('Health check OK:', status)
    } catch (err) {
      logger.error('Health check failed:', err)
      await db.collection('health').doc('latest').set({
        status: 'error',
        error: err.message,
        checkedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  }
)

// ─── 4. Save user calculation (no auth — saves to anonymous shared link) ─────
exports.saveCalculation = onCall(
  { region: 'us-central1' },
  async (request) => {
    const { vehicleId, calcState, userPrefs, label } = request.data || {}

    if (!vehicleId || !calcState) {
      throw new HttpsError('invalid-argument', 'vehicleId and calcState required')
    }

    // Generate a short ID for the share link
    const shortId = Math.random().toString(36).slice(2, 9)

    await db.collection('savedCalculations').doc(shortId).set({
      vehicleId,
      calcState,
      userPrefs,
      label: label || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // Auto-expire after 90 days (TTL — set up TTL policy on this field)
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })

    return {
      shortId,
      url: `https://evsense.app/s/${shortId}`,
    }
  }
)
