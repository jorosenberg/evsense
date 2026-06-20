/**
 * CostCustomizerPanel.jsx — Live cost controls for the Browse page.
 *
 * Sits in the right rail of the Browse grid. Every control writes straight to
 * the userPreferencesStore, and because each VehicleCard reads those same
 * fields through quickTco, the "/mo all-in" and ¢/mi figures on every card
 * recompute the instant a slider moves — no API calls, no page reload.
 *
 * Mirrors the perfect-car-picker (Matcher) RefinePanel interaction model:
 * collapsible header, slider rows, an active-count badge, and a reset link.
 */
import { useMemo, useState, useCallback } from 'react'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { STATE_OPTIONS } from '../../utils/stateFeesData'
import { STATE_ELECTRICITY_RATES } from '../../utils/stateElectricityRates'
import { detectBrowserLocation } from '../../utils/openChargeMap'

const OCM_API = 'https://api.openchargemap.io/v3/poi/'
const OCM_KEY = import.meta.env.VITE_OCM_API_KEY

/** Round n to the nearest multiple of step, clamped to [min, max]. */
function snapTo5(n) { return Math.round(n / 5) * 5 }

/**
 * Fetch nearby station count for a given levelid (2=L2, 3=DCFC).
 * Works without an API key (rate-limited but functional).
 */
async function countStationsNear(lat, lng, levelId, radiusMi = 20) {
  const params = new URLSearchParams({
    output: 'json',
    countrycode: 'US',
    latitude: String(lat),
    longitude: String(lng),
    distance: String(radiusMi),
    distanceunit: 'Miles',
    maxresults: '50',
    levelid: String(levelId),
    compact: 'true',
    verbose: 'false',
  })
  if (OCM_KEY) params.set('key', OCM_KEY)
  try {
    const r = await fetch(`${OCM_API}?${params.toString()}`)
    if (!r.ok) return 0
    const data = await r.json()
    return Array.isArray(data) ? data.length : 0
  } catch {
    return 0
  }
}

/**
 * Given L2 and DCFC station counts near the user, compute a suggested
 * charging mix that keeps home dominant (≥65%) and splits the public
 * portion proportionally to local station availability.
 */
function suggestMix(l2Count, dcfcCount) {
  const total = l2Count + dcfcCount
  if (total === 0) return { home: 80, publicL2: 10, dcFast: 10 }

  const homeBase = 75            // home charging stays ≥65% in practice
  const publicBudget = 100 - homeBase
  const l2Share  = l2Count  / total
  const dcShare  = dcfcCount / total

  let publicL2 = snapTo5(publicBudget * l2Share)
  let dcFast   = snapTo5(publicBudget * dcShare)

  // Guarantee at least 5% for each type that actually exists nearby
  if (l2Count  > 0 && publicL2 < 5) publicL2 = 5
  if (dcfcCount > 0 && dcFast   < 5) dcFast   = 5

  const home = 100 - publicL2 - dcFast
  return { home, publicL2, dcFast }
}

const PURCHASE_MODES = [
  { value: 'finance', label: 'Finance' },
  { value: 'lease',   label: 'Lease' },
  { value: 'cash',    label: 'Cash' },
]

// National-average public charging rates (¢/kWh). Mirror the $/kWh defaults in
// costPerMile.js (DEFAULT_L2_RATE 0.22, DEFAULT_DCFC_RATE 0.45).
const DEFAULT_L2_CENTS = 22
const DEFAULT_DCFC_CENTS = 45

// Store defaults — used to compute the "N changes" active badge.
const PREF_DEFAULTS = Object.freeze({
  purchaseMode: 'finance',
  leaseTermMonths: 36,
  includeIncentives: true,
  annualMileage: 12000,
  electricityRateCentsPerKwh: null,
  publicL2RateCentsPerKwh: null,
  dcfcRateCentsPerKwh: null,
  chargingSubscriptionMonthlyUsd: 0,
  incentiveOverride: null,
  chargingMix: { home: 80, publicL2: 10, dcFast: 10 },
})

function Slider({ label, hint, min, max, step, value, onChange, format, isActive }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-ink">
          {label}
          {hint && <span className="ml-1.5 text-ink-subtle text-[10px]">{hint}</span>}
        </label>
        <span className={`text-xs tabular-nums font-semibold ${isActive ? 'text-brand-blue' : 'text-ink-subtle'}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand-blue cursor-pointer"
      />
    </div>
  )
}

// Detection status shape:
//   null                               — not run yet
//   'detecting'                        — in-progress
//   { source:'nearby', l2, dcfc, total } — found stations
//   { source:'default' }               — geolocation denied / API failed
//   { source:'error' }                 — unexpected failure

export default function CostCustomizerPanel() {
  const [open, setOpen] = useState(true)
  const [detectStatus, setDetectStatus] = useState(null)

  const {
    state: stateCode, setState,
    purchaseMode, setPurchaseMode,
    leaseTermMonths, setLeaseTermMonths,
    includeIncentives, setIncludeIncentives,
    annualMileage, setFinancialProfile,
    electricityRateCentsPerKwh, setElectricityRate,
    publicL2RateCentsPerKwh, setPublicL2Rate,
    dcfcRateCentsPerKwh, setDcfcRate,
    chargingSubscriptionMonthlyUsd, setChargingSubscription,
    chargingMixPercent, setChargingMix,
    incentiveOverride, setIncentiveOverride,
  } = useUserPreferencesStore()

  const stateDefaultRate = STATE_ELECTRICITY_RATES[stateCode] ?? 16
  const effectiveRate = electricityRateCentsPerKwh ?? stateDefaultRate
  const effectiveL2Rate = publicL2RateCentsPerKwh ?? DEFAULT_L2_CENTS
  const effectiveDcfcRate = dcfcRateCentsPerKwh ?? DEFAULT_DCFC_CENTS
  const subscription = chargingSubscriptionMonthlyUsd || 0
  const mix = chargingMixPercent || PREF_DEFAULTS.chargingMix
  const mixTotal = (mix.home || 0) + (mix.publicL2 || 0) + (mix.dcFast || 0)

  const detectNearby = useCallback(async () => {
    setDetectStatus('detecting')
    try {
      const loc = await detectBrowserLocation(8000)
      if (!loc) {
        setDetectStatus({ source: 'default' })
        return
      }
      const { lat, lng } = loc
      const [l2, dcfc] = await Promise.all([
        countStationsNear(lat, lng, 2),
        countStationsNear(lat, lng, 3),
      ])
      const suggested = suggestMix(l2, dcfc)
      setChargingMix(suggested)
      setDetectStatus({ source: 'nearby', l2, dcfc, total: l2 + dcfc })
    } catch {
      setDetectStatus({ source: 'error' })
    }
  }, [setChargingMix])

  const activeCount = useMemo(() => {
    let n = 0
    if (purchaseMode !== PREF_DEFAULTS.purchaseMode) n++
    if (purchaseMode === 'lease' && leaseTermMonths !== PREF_DEFAULTS.leaseTermMonths) n++
    if (includeIncentives !== PREF_DEFAULTS.includeIncentives) n++
    if (annualMileage !== PREF_DEFAULTS.annualMileage) n++
    if (electricityRateCentsPerKwh != null) n++
    if (publicL2RateCentsPerKwh != null) n++
    if (dcfcRateCentsPerKwh != null) n++
    if (subscription > 0) n++
    if (incentiveOverride != null && incentiveOverride > 0) n++
    if (
      mix.home !== PREF_DEFAULTS.chargingMix.home ||
      mix.publicL2 !== PREF_DEFAULTS.chargingMix.publicL2 ||
      mix.dcFast !== PREF_DEFAULTS.chargingMix.dcFast
    ) n++
    return n
  }, [purchaseMode, leaseTermMonths, includeIncentives, annualMileage, electricityRateCentsPerKwh,
      publicL2RateCentsPerKwh, dcfcRateCentsPerKwh, subscription, incentiveOverride, mix])

  function resetAll() {
    setPurchaseMode(PREF_DEFAULTS.purchaseMode)
    setLeaseTermMonths(PREF_DEFAULTS.leaseTermMonths)
    setIncludeIncentives(PREF_DEFAULTS.includeIncentives)
    setFinancialProfile({ annualMileage: PREF_DEFAULTS.annualMileage })
    setElectricityRate(null)
    setPublicL2Rate(null)
    setDcfcRate(null)
    setChargingSubscription(0)
    setIncentiveOverride(null)
    setChargingMix({ ...PREF_DEFAULTS.chargingMix })
  }

  return (
    <div className="card overflow-hidden border-border">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          <span className="w-2 h-2 rounded-full bg-accent-lime" />
          <span className="text-sm font-semibold text-ink">Customize your costs</span>
          <span className="hidden sm:inline text-[11px] text-ink-subtle font-normal">— every price updates to how you really drive</span>
          {activeCount > 0 && (
            <span className="text-[11px] font-medium bg-brand-blue text-white rounded-full px-2 py-0.5">
              {activeCount}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-5 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 bg-surface-raised/40">
          <p className="text-[11px] text-ink-subtle col-span-full">
            Adjust these and every card&rsquo;s <span className="font-medium text-ink-muted">/mo all-in</span> updates live.
          </p>

          {/* Purchase mode */}
          <div>
            <label className="text-xs font-medium text-ink block mb-1.5">How are you paying?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PURCHASE_MODES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPurchaseMode(m.value)}
                  className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                    purchaseMode === m.value
                      ? 'border-brand-blue bg-brand-blue/15 text-brand-indigo'
                      : 'border-border bg-surface-raised text-ink-muted hover:border-border-strong hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-ink-subtle mt-1">
              {purchaseMode === 'cash'
                ? 'Cash buyers carry no monthly payment — cards show operating cost only.'
                : purchaseMode === 'lease'
                  ? 'Uses advertised lease offers where available.'
                  : 'Uses advertised finance offers, or a 60-mo / 6% APR estimate.'}
            </p>
          </div>

          {/* Lease term — only when leasing */}
          {purchaseMode === 'lease' && (
            <div>
              <label className="text-xs font-medium text-ink block mb-1.5">Lease term</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[24, 36].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLeaseTermMonths(t)}
                    className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                      (leaseTermMonths || 36) === t
                        ? 'border-brand-blue bg-brand-blue-light text-brand-blue'
                        : 'border-border bg-surface-raised text-ink-muted hover:border-border-strong hover:text-ink'
                    }`}
                  >
                    {t} months
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Include manufacturer incentives */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label className="text-xs font-medium text-ink block">Include incentives</label>
              <p className="text-[10px] text-ink-subtle mt-0.5">
                {purchaseMode === 'lease'
                  ? 'Folds available lease cash into the monthly.'
                  : 'Folds manufacturer cash into the price & monthly.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includeIncentives}
              onClick={() => setIncludeIncentives(!includeIncentives)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${includeIncentives ? 'bg-brand-blue' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${includeIncentives ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* State */}
          <div>
            <label className="text-xs font-medium text-ink block mb-1.5">State</label>
            <select
              value={stateCode}
              onChange={e => setState(e.target.value, 'manual')}
              className="input-base text-sm"
            >
              {STATE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-ink-subtle mt-1">
              Sets local electricity rates &amp; registration fees.
            </p>
          </div>

          {/* Annual mileage */}
          <Slider
            label="Annual mileage"
            min={3000} max={25000} step={1000}
            value={annualMileage}
            onChange={v => setFinancialProfile({ annualMileage: v })}
            format={v => `${(v / 1000).toLocaleString()}k mi`}
            isActive={annualMileage !== PREF_DEFAULTS.annualMileage}
          />

          {/* Electricity rate */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium text-ink">
                Home electricity rate
              </label>
              {electricityRateCentsPerKwh != null && (
                <button
                  type="button"
                  onClick={() => setElectricityRate(null)}
                  className="text-[10px] text-brand-blue hover:underline"
                >
                  Use {stateCode} avg ({stateDefaultRate}¢)
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number" step={0.5} min={5} max={60}
                value={effectiveRate}
                onChange={e => setElectricityRate(Number(e.target.value))}
                className="input-base pr-14 text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">¢/kWh</span>
            </div>
            {electricityRateCentsPerKwh == null && (
              <p className="text-[10px] text-ink-subtle mt-1">
                Using {stateCode} state average ({stateDefaultRate}¢/kWh).
              </p>
            )}
          </div>

          {/* Public L2 rate */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium text-ink">
                Public L2 rate
                <span className="ml-1.5 text-ink-subtle text-[10px]">destination / workplace</span>
              </label>
              {publicL2RateCentsPerKwh != null && (
                <button
                  type="button"
                  onClick={() => setPublicL2Rate(null)}
                  className="text-[10px] text-brand-blue hover:underline"
                >
                  Use {DEFAULT_L2_CENTS}¢ avg
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number" step={1} min={0} max={100}
                value={effectiveL2Rate}
                onChange={e => setPublicL2Rate(Number(e.target.value))}
                className="input-base pr-14 text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">¢/kWh</span>
            </div>
            {publicL2RateCentsPerKwh == null && (
              <p className="text-[10px] text-ink-subtle mt-1">
                Using national average ({DEFAULT_L2_CENTS}¢/kWh).
              </p>
            )}
          </div>

          {/* DC fast-charge rate */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium text-ink">
                DC fast-charge rate
                <span className="ml-1.5 text-ink-subtle text-[10px]">highway / rapid</span>
              </label>
              {dcfcRateCentsPerKwh != null && (
                <button
                  type="button"
                  onClick={() => setDcfcRate(null)}
                  className="text-[10px] text-brand-blue hover:underline"
                >
                  Use {DEFAULT_DCFC_CENTS}¢ avg
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number" step={1} min={0} max={120}
                value={effectiveDcfcRate}
                onChange={e => setDcfcRate(Number(e.target.value))}
                className="input-base pr-14 text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">¢/kWh</span>
            </div>
            {dcfcRateCentsPerKwh == null && (
              <p className="text-[10px] text-ink-subtle mt-1">
                Using national average ({DEFAULT_DCFC_CENTS}¢/kWh).
              </p>
            )}
          </div>

          {/* Charging subscription */}
          <div>
            <label className="text-xs font-medium text-ink block mb-1.5">
              Charging subscription
              <span className="ml-1.5 text-ink-subtle text-[10px]">EA Pass+, EVgo, etc.</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">$</span>
              <input
                type="number" step={1} min={0} max={100}
                value={subscription || ''}
                placeholder="0"
                onChange={e => setChargingSubscription(e.target.value === '' ? 0 : Number(e.target.value))}
                className="input-base pl-7 pr-12 text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">/mo</span>
            </div>
            <p className="text-[10px] text-ink-subtle mt-1">
              Flat monthly membership fee, added to every card&rsquo;s charging cost.
            </p>
          </div>

          {/* Charging mix */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="text-xs font-medium text-ink">Charging mix</label>
              <span className={`text-[10px] tabular-nums ${mixTotal === 100 ? 'text-ink-subtle' : 'text-status-red'}`}>
                {mixTotal}%{mixTotal !== 100 ? ' (needs 100%)' : ''}
              </span>
            </div>

            {/* Detect button row */}
            <div className="flex items-center gap-2 mb-2.5">
              <button
                type="button"
                onClick={detectNearby}
                disabled={detectStatus === 'detecting'}
                className="flex items-center gap-1.5 text-[11px] font-medium text-brand-blue border border-brand-blue/30 bg-brand-blue-light rounded-md px-2.5 py-1 hover:bg-brand-blue/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {detectStatus === 'detecting' ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Detecting…
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Autofill from nearby stations
                  </>
                )}
              </button>
              {detectStatus && detectStatus !== 'detecting' && (
                <button
                  type="button"
                  onClick={() => {
                    setChargingMix({ ...PREF_DEFAULTS.chargingMix })
                    setDetectStatus(null)
                  }}
                  className="text-[10px] text-ink-muted hover:text-ink underline-offset-2 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Attribution line */}
            {detectStatus && detectStatus !== 'detecting' && (
              <div className={`text-[10px] mb-2 flex items-center gap-1 ${
                detectStatus.source === 'nearby' ? 'text-status-green' : 'text-ink-subtle'
              }`}>
                {detectStatus.source === 'nearby' ? (
                  <>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Based on {detectStatus.l2} L2 + {detectStatus.dcfc} DCFC stations within 20 mi
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Using nationwide defaults — location unavailable
                  </>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              {[
                { key: 'home',     label: 'Home Charging',      hint: 'overnight / Level 1–2' },
                { key: 'publicL2', label: 'Slow Public (L2)',    hint: 'destination / workplace' },
                { key: 'dcFast',   label: 'Fast Public (DCFC)', hint: 'highway / rapid charge' },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-ink-muted">
                      {label}
                      <span className="ml-1 text-ink-subtle text-[9px]">{hint}</span>
                    </span>
                    <span className="font-medium tabular-nums">{mix[key] || 0}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={mix[key] || 0}
                    onChange={e => {
                      setChargingMix({ [key]: Number(e.target.value) })
                      setDetectStatus(null)   // clear attribution on manual adjust
                    }}
                    className="w-full accent-brand-blue cursor-pointer"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-ink-subtle mt-1.5">
              Sliders must total 100%. Mix affects the blended ¢/kWh used in cost estimates.
            </p>
          </div>

          {/* Incentive override */}
          <div>
            <label className="text-xs font-medium text-ink block mb-1.5">
              Extra incentive
              <span className="ml-1.5 text-ink-subtle text-[10px]">(manufacturer/dealer cash)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">$</span>
              <input
                type="number" step={500} min={0} max={20000}
                value={incentiveOverride ?? ''}
                placeholder="0"
                onChange={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  setIncentiveOverride(v)
                }}
                className="input-base pl-7 text-sm"
              />
            </div>
            <p className="text-[10px] text-ink-subtle mt-1">
              Subtracted from price &amp; amortized into the monthly payment.
            </p>
          </div>

          {activeCount > 0 && (
            <div className="col-span-full pt-1 flex justify-end">
              <button
                type="button"
                onClick={resetAll}
                className="text-xs text-ink-muted hover:text-brand-blue underline-offset-2 hover:underline"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
