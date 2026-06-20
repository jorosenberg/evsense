import { useParams, Link, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useVehicleDetail } from '../hooks/useVehicleDetail'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { useCalculatorStore } from '../store/calculatorStore'
import { decodeCalcState } from '../utils/calcUrlState'
import { formatCurrency, daysUntil, formatDate, isDataStale } from '../utils/formatCurrency'
import CostCalculator from '../components/calculator/CostCalculator'
import QuickEstimateCard from '../components/calculator/QuickEstimateCard'
import DriveAwayBreakdown from '../components/calculator/DriveAwayBreakdown'
import NearbyChargersWidget from '../components/vehicles/NearbyChargersWidget'
import VehicleColorSwatches from '../components/vehicles/VehicleColorSwatches'
import ImageGallery from '../components/vehicles/ImageGallery'
import GlossaryTip from '../components/ui/GlossaryTip'
import LeaseCalcEstimate from '../components/ui/LeaseCalcEstimate'
import EstimateNotice from '../components/ui/EstimateNotice'
import { useLeaseCalc } from '../utils/leaseCalcData'
import { getSafetyRating, nhtsaLabel, iihsColor } from '../utils/safetyRatings'

export default function VehicleDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { vehicle, loading, error } = useVehicleDetail(id)
  const { addToCompare, removeFromCompare, isInCompare, state: stateCode, setState, setFinancialProfile, setElectricityRate, setChargingMix } = useUserPreferencesStore()
  const setVehicleCalc = useCalculatorStore(s => s.setVehicleCalc)
  // Subscribe to the selected trim so the header (MSRP, range, specs) stays in
  // sync with the calculator's trim picker, change it in either place and both
  // update together.
  const selectedTrimIndex = useCalculatorStore(s => s.vehicles[id]?.selectedTrimIndex ?? 0)
  const leaseCalcRec = useLeaseCalc()[id] || null
  const inCompare = isInCompare(id)
  const [showFullCalc, setShowFullCalc] = useState(false)
  const calcRef = useRef(null)
  const didDecodeUrl = useRef(false)

  // Decode URL params (from a shared link) and pre-populate calculator state.
  // Runs once when the vehicle loads for the first time, not on every re-render.
  useEffect(() => {
    if (!vehicle || didDecodeUrl.current) return
    if (!location.search) return
    didDecodeUrl.current = true

    const { calcUpdates, prefUpdates, hasCalcParams } = decodeCalcState(location.search)

    if (Object.keys(calcUpdates).length) {
      setVehicleCalc(id, calcUpdates)
    }
    if (prefUpdates.state)                  setState(prefUpdates.state, 'manual')
    if (prefUpdates.annualMileage)          setFinancialProfile({ annualMileage: prefUpdates.annualMileage })
    if (prefUpdates.ownershipYears)         setFinancialProfile({ ownershipYears: prefUpdates.ownershipYears })
    if (prefUpdates.electricityRateCentsPerKwh) setElectricityRate(prefUpdates.electricityRateCentsPerKwh)
    if (prefUpdates.chargingMixPercent)     setChargingMix(prefUpdates.chargingMixPercent)

    // Auto-open the full calculator and scroll to it when a shared link is loaded
    if (hasCalcParams) {
      setShowFullCalc(true)
      // Defer scroll until after paint
      requestAnimationFrame(() => {
        calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [vehicle, id, location.search, setVehicleCalc, setState, setFinancialProfile, setElectricityRate, setChargingMix])

  if (loading) return <DetailSkeleton />
  if (error || !vehicle) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="text-4xl mb-3"></div>
      <h2 className="font-semibold text-ink mb-2">Vehicle not found</h2>
      <p className="text-ink-muted mb-4">This vehicle may not be in our database yet.</p>
      <Link to="/browse" className="btn-primary">Browse All EVs</Link>
    </div>
  )

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const stale = isDataStale(vehicle.lastUpdated)
  // Hide trims with no price data (no MSRP). If none are priced, fall back to
  // the full list so the page isn't empty.
  const allTrims = vehicle.trims || []
  const pricedTrims = allTrims.filter((t) => t?.msrp != null && t.msrp > 0)
  const trims = pricedTrims.length ? pricedTrims : allTrims
  const safeTrimIndex = Math.min(selectedTrimIndex, Math.max(0, trims.length - 1))
  const selectedTrim = trims[safeTrimIndex] || trims[0]
  // Per-trim specs override the base specs when present (mock data on a few
  // models). Falls back to the model-level specs for trims without overrides.
  const trimSpecs = { ...(vehicle.specs || {}), ...(selectedTrim?.specs || {}) }
  // Edmunds tested range for the selected trim. When per-trim data exists
  // (testedByTrim), ONLY the trims listed there show a tested range, the model
  // figure is NOT applied to every trim (a tested figure is one specific trim).
  // Vehicles with no per-trim map keep the model-level fallback.
  const testedRangeForTrim = vehicle.testedByTrim
    ? (selectedTrim ? (vehicle.testedByTrim[selectedTrim.name] ?? null) : null)
    : (vehicle.testedRange ?? null)
  const offerExpiry = selectedTrim?.leaseOffers?.[0]?.expiresAt || selectedTrim?.financeOffers?.[0]?.expiresAt
  const days = daysUntil(offerExpiry)
  const safety = getSafetyRating(id)

  return (
    <>
      <Helmet>
        <title>{title} True Cost of Ownership | EVsense: EV Buyer's Guide</title>
        <meta name="description" content={`Real total cost of owning a ${title}. Includes financing, charging costs, state incentives, depreciation, and insurance, all 50 states.`} />
        <meta property="og:title"       content={`${title}, True Cost of Ownership`} />
        <meta property="og:description" content={`Know what a ${title} will actually cost you per month including charging, incentives, and fees.`} />
        <meta property="og:image"       content={vehicle.imageUrl || '/og-image.png'} />
        <meta property="og:type"        content="article" />
      </Helmet>

      {stale && (
        <div className="stale-banner">
          Data may be outdated, last updated {formatDate(vehicle.lastUpdated)}. Verify pricing with the manufacturer.
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <nav className="text-xs text-ink-subtle mb-5">
          <Link to="/" className="hover:text-ink">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/browse" className="hover:text-ink">Browse</Link>
          <span className="mx-1.5">›</span>
          <span className="text-ink">{title}</span>
        </nav>

        <EstimateNotice className="mb-5" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Hero image gallery, branded dark disc stage */}
          <div className="card image-disc overflow-hidden">
            <ImageGallery
              primaryImage={vehicle.imageUrl}
              images={vehicle.imageGallery || []}
              alt={title}
            />
          </div>

          {/* Header info */}
          <div className="flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink-subtle capitalize mb-1">{vehicle.make} · {vehicle.bodyStyle}</p>
                <h1 className="font-serif text-display-md text-ink leading-tight">{title}</h1>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-semibold text-ink">{formatCurrency(selectedTrim?.msrp || vehicle.msrpFrom)}</div>
                <div className="text-xs text-ink-subtle">{trims.length > 1 ? `${selectedTrim?.name} MSRP` : 'Starting MSRP'}</div>
              </div>
            </div>

            {/* Trim selector, drives the MSRP, range, and specs shown below,
                and stays in sync with the calculator's trim picker. */}
            {trims.length > 1 && (
              <div className="mt-4">
                <label className="text-xs font-medium text-ink-muted block mb-1.5">Trim</label>
                <div className="flex flex-wrap gap-2">
                  {trims.map((t, i) => {
                    const tSpecs = { ...(vehicle.specs || {}), ...(t.specs || {}) }
                    const active = i === safeTrimIndex
                    return (
                      <button
                        key={i}
                        onClick={() => setVehicleCalc(id, { selectedTrimIndex: i })}
                        className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                          active
                            ? 'border-brand-blue bg-brand-blue-light'
                            : 'border-border bg-surface-raised hover:border-ink/30'
                        }`}
                      >
                        <div className={`text-sm font-medium ${active ? 'text-brand-blue' : 'text-ink'}`}>{t.name}</div>
                        <div className="text-[11px] text-ink-subtle tabular-nums">
                          {formatCurrency(t.msrp)}
                          {tSpecs.range ? ` · ${tSpecs.range} mi` : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Price change */}
            {selectedTrim?.lastPriceChange && (() => {
              const pc = selectedTrim.lastPriceChange
              const ageDays = (Date.now() - new Date(pc.date)) / (1000 * 60 * 60 * 24)
              if (ageDays > 90) return null
              return (
                <div className={`text-xs mt-2 ${pc.direction === 'decrease' ? 'text-status-green' : 'text-ink-muted'}`}>
                  {pc.direction === 'decrease' ? '▼' : '▲'} Price {pc.direction === 'decrease' ? 'dropped' : 'increased'} {formatCurrency(Math.abs(pc.changeDollars))} on {formatDate(pc.date)}
                </div>
              )
            })()}

            {/* Key badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {vehicle.federalTaxCredit?.eligibleNew && (
                <span className="badge badge-blue">{formatCurrency(vehicle.federalTaxCredit.amount)} federal credit</span>
              )}
              {trimSpecs.range && (
                <span className="badge badge-grey">{trimSpecs.range} mi EPA range</span>
              )}
              {testedRangeForTrim && (
                <span className="badge badge-green" title="Real-world tested range">
                  {testedRangeForTrim} mi tested
                </span>
              )}
              {trimSpecs.chargingPort && (
                <span className="badge badge-grey">{trimSpecs.chargingPort}</span>
              )}
              {/* Offer expiry badge */}
              {offerExpiry && days !== null && (
                days < 0 ? <span className="badge badge-grey">Offer may have expired</span>
                : days <= 3 ? <span className="badge badge-red animate-pulse">Offer expires in {days}d</span>
                : days <= 14 ? <span className="badge badge-yellow">Offer expires in {days}d</span>
                : <span className="badge badge-green">Offer valid · Expires {formatDate(offerExpiry)}</span>
              )}
            </div>

            {/* Spec grid */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                ...(testedRangeForTrim ? [{ label: 'Tested Range', value: `${testedRangeForTrim} mi` }] : []),
                { label: 'EPA Range', value: trimSpecs.range ? `${trimSpecs.range} mi` : '-' },
                { label: '0–60', value: trimSpecs.zeroToSixty ? `${trimSpecs.zeroToSixty}s` : '-' },
                { label: 'Horsepower', value: trimSpecs.horsepower ? `${trimSpecs.horsepower} hp` : '-' },
                { label: 'Battery', value: trimSpecs.batteryKwh ? `${trimSpecs.batteryKwh} kWh` : '-' },
                { label: 'Seating', value: trimSpecs.seatingCapacity ? `${trimSpecs.seatingCapacity} seats` : '-' },
                { label: 'DCFC Speed', value: trimSpecs.chargingSpeedDcFastKw ? `${trimSpecs.chargingSpeedDcFastKw} kW` : '-' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-sunken rounded-lg p-3 text-center">
                  <div className="text-xs text-ink-subtle">{label}</div>
                  <div className="font-semibold text-sm text-ink mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => inCompare ? removeFromCompare(id) : addToCompare(id)}
                className={`btn-secondary flex-1 justify-center ${inCompare ? 'border-brand-blue text-brand-blue' : ''}`}
              >
                {inCompare ? '✓ Added to Compare' : '⊕ Add to Compare'}
              </button>
              {vehicle.manufacturerUrl && (
                <a href={vehicle.manufacturerUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                  Manufacturer ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Color swatches */}
        {selectedTrim?.availableColors?.length > 0 && (
          <div className="mb-8">
            <h3 className="font-semibold text-ink mb-3">Available Colors</h3>
            <VehicleColorSwatches colors={selectedTrim.availableColors} />
          </div>
        )}

        {/* Warranty */}
        {vehicle.specs && (
          <div className="mb-8 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-surface-sunken rounded-lg p-4">
              <div className="text-xs text-ink-subtle mb-1">Vehicle Warranty</div>
              <div className="font-medium">{vehicle.specs.warrantyYears} years</div>
            </div>
            <div className="bg-surface-sunken rounded-lg p-4">
              <div className="text-xs text-ink-subtle mb-1"><GlossaryTip term="battery degradation">Battery Warranty</GlossaryTip></div>
              <div className="font-medium">{vehicle.specs.batteryWarrantyYears} yr / {(vehicle.specs.batteryWarrantyMiles || 0).toLocaleString()} mi</div>
            </div>
            <div className="bg-surface-sunken rounded-lg p-4">
              <div className="text-xs text-ink-subtle mb-1">Charge Port</div>
              <div className="font-medium">
                <GlossaryTip term={vehicle.specs.chargingPort?.toLowerCase()}>{vehicle.specs.chargingPort}</GlossaryTip>
              </div>
            </div>
          </div>
        )}

        {/* Safety ratings */}
        {safety && (
          <div className="mb-8">
            <h2 className="font-serif text-display-md text-ink mb-4">Safety Ratings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* NHTSA */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-ink-subtle font-medium uppercase tracking-wider">NHTSA Overall</p>
                    <p className="text-[10px] text-ink-subtle">U.S. Gov't crash test rating</p>
                  </div>
                  <a href={`https://www.nhtsa.gov/vehicle-safety/5-star-safety-ratings`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-blue hover:underline">nhtsa.gov ↗</a>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className={`text-xl ${s <= (safety.nhtsa?.overall || 0) ? 'text-yellow-400' : 'text-border'}`}>★</span>
                    ))}
                  </div>
                  <span className={`text-sm font-semibold ${nhtsaLabel(safety.nhtsa?.overall)?.color}`}>
                    {safety.nhtsa?.overall}/5 Stars
                  </span>
                </div>
                {safety.nhtsa && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: 'Frontal', val: safety.nhtsa.frontal },
                      { label: 'Side', val: safety.nhtsa.side },
                      { label: 'Rollover', val: safety.nhtsa.rollover },
                    ].map(({ label, val }) => val && (
                      <div key={label} className="text-center bg-surface-sunken rounded-lg p-2">
                        <div className="text-xs text-ink-subtle">{label}</div>
                        <div className="text-sm font-semibold text-ink">{val}★</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IIHS */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-ink-subtle font-medium uppercase tracking-wider">IIHS Rating</p>
                    <p className="text-[10px] text-ink-subtle">Insurance Institute for Highway Safety</p>
                  </div>
                  <a href="https://www.iihs.org/ratings" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-blue hover:underline">iihs.org ↗</a>
                </div>
                {safety.iihs?.overall ? (
                  <>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${iihsColor(safety.iihs.overall)}`}>
                      {safety.iihs.overall === 'TSP+' ? '' : '✓'} IIHS {safety.iihs.overall}
                    </div>
                    <p className="text-xs text-ink-muted mt-2">
                      {safety.iihs.overall === 'TSP+' ? 'Top Safety Pick+, the highest IIHS designation.' : 'Top Safety Pick, meets IIHS safety standards.'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">No IIHS rating available for this model year.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Drive-away price breakdown */}
        <div className="mb-8">
          <h2 className="font-serif text-display-md text-ink mb-4">What You'll Actually Pay</h2>
          <DriveAwayBreakdown vehicle={vehicle} stateAbbr={stateCode} />
        </div>

        {/* Nearby chargers */}
        <div className="mb-8">
          <NearbyChargersWidget vehicle={vehicle} />
        </div>

        {/* Calculator */}
        <div ref={calcRef}>
          <h2 className="font-serif text-display-md text-ink mb-1">True Cost Calculator</h2>
          <p className="text-sm text-ink-subtle mb-4">
            A close estimate built from public data, charging, incentives, depreciation, insurance &amp; fees.
            Not a quote.
          </p>

          {leaseCalcRec && (
            <div className="mb-6">
              <LeaseCalcEstimate rec={leaseCalcRec} trimName={selectedTrim?.name} variant="panel" />
            </div>
          )}

          {/* Mobile: Quick Estimate by default, expand to full */}
          {!showFullCalc ? (
            <>
              <QuickEstimateCard vehicle={vehicle} onExpand={() => setShowFullCalc(true)} />
              {/* On desktop always show full calculator */}
              <div className="hidden md:block">
                <CostCalculator vehicle={vehicle} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 md:hidden">
                <span className="text-sm text-ink-muted">Full Calculator</span>
                <button onClick={() => setShowFullCalc(false)} className="btn-ghost text-xs">
                  ← Back to Quick Estimate
                </button>
              </div>
              <CostCalculator vehicle={vehicle} />
            </>
          )}
        </div>
      </div>
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="skeleton rounded-card aspect-[16/9]" />
        <div className="space-y-3">
          <div className="skeleton h-6 w-1/3" />
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
          </div>
        </div>
      </div>
      <div className="skeleton h-96 rounded-card" />
    </div>
  )
}
