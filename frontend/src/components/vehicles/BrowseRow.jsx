/**
 * BrowseRow, full-width vehicle row.
 *
 * Hover behaviour: the car photo sits faded behind the name by default; on
 * hover it un-fades and lands with its base right on the "specs line" (the top
 * border of the spec drawer), directly below the name + range, both of which
 * carry a heavy text-shadow so they stay readable over the image. The spec
 * drawer also reveals a selectable trim list (name · MSRP · range); picking one
 * updates this card AND persists (shared with the detail page via the
 * calculator store).
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { useCalculatorStore } from '../../store/calculatorStore'
import { useFilterStore } from '../../store/filterStore'
import { useVehicleDetail } from '../../hooks/useVehicleDetail'
import { formatCurrency } from '../../utils/formatCurrency'
import { useIncentives } from '../../utils/incentivesByVehicle'
import { useEAOffers, eaOfferFor } from '../../utils/electrifyAmerica'
import { useLeaseCalc } from '../../utils/leaseCalcData'
import { resolveCardEconomics } from '../../utils/cardTco'
import { vehicleImgSrc } from '../../utils/vehicleImage'

const fmt = (n) => (n || n === 0 ? formatCurrency(n) : '-')
const SHADOW = '0 2px 14px rgba(8,10,16,0.95), 0 1px 3px rgba(8,10,16,0.9)'

function Stat({ label, value, accent, dot, shadow }) {
  return (
    <div className="flex flex-col">
      <div className="h-4 flex items-center gap-1 mb-1.5">
        {dot && <span className="w-1.5 h-1.5 rounded-full bg-brand-blue" />}
        <span className={`text-nano font-bold uppercase tracking-wider ${accent ? 'text-brand-blue' : 'text-ink-subtle'}`}>{label}</span>
      </div>
      <div className={`font-grotesk font-semibold text-lg leading-none ${accent ? 'text-brand-blue' : 'text-ink-muted'}`}
        style={shadow ? { textShadow: SHADOW } : undefined}>{value}</div>
    </div>
  )
}

function SpecCell({ label, value }) {
  return (
    <div>
      <div className="text-nano text-ink-subtle font-bold uppercase tracking-wide mb-1">{label}</div>
      <div className="font-grotesk font-semibold text-sm text-ink">{value}</div>
    </div>
  )
}

export default function BrowseRow({ vehicle }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const {
    compareVehicleIds, addToCompare, removeFromCompare, isInCompare,
    state: stateCode, annualMileage, chargingMixPercent, ownershipYears,
    purchaseMode, incentiveOverride, electricityRateCentsPerKwh,
    dcfcRateCentsPerKwh, publicL2RateCentsPerKwh, chargingSubscriptionMonthlyUsd,
    leaseTermMonths, includeIncentives,
  } = useUserPreferencesStore()
  const eaOffer = eaOfferFor(useEAOffers(), vehicle.id)
  const leaseCalcRec = useLeaseCalc()[vehicle.id] || null
  const incMap = useIncentives()

  // Lazy-load full detail (for the trim list) the first time the row is hovered.
  const { vehicle: detail } = useVehicleDetail(hovered ? vehicle.id : null)
  const trims = (detail?.trims || []).filter(t => t && t.msrp != null && t.msrp > 0)

  // Selected trim persists in the calculator store (shared with the detail page).
  const selectedTrimIndex = useCalculatorStore(s => s.vehicles[vehicle.id]?.selectedTrimIndex ?? 0)
  const setVehicleCalc = useCalculatorStore(s => s.setVehicleCalc)
  const selectedTrim = trims[selectedTrimIndex] || null

  const inCompare = isInCompare(vehicle.id)
  const compareMaxed = compareVehicleIds.length >= 3 && !inCompare

  const minRange = useFilterStore(s => s.minRange)

  // When trim detail loads and a range filter is active, auto-select the
  // lowest trim that meets the minimum range so the card reflects a qualifying trim.
  useEffect(() => {
    if (!minRange || trims.length === 0) return
    const currentRange = trims[selectedTrimIndex]?.specs?.range ?? 0
    if (currentRange < minRange) {
      const qualifyingIdx = trims.findIndex(t => (t.specs?.range ?? 0) >= minRange)
      if (qualifyingIdx >= 0) pickTrim(qualifyingIdx)
    }
  }, [trims.length, minRange]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect the chosen trim in the headline numbers (MSRP / range / TCO).
  const displayMsrp = selectedTrim?.msrp ?? vehicle.msrpFrom
  const displayRange = selectedTrim?.specs?.range ?? vehicle.testedRange ?? vehicle.rangeEpa
  const econVehicle = selectedTrim
    ? { ...vehicle, msrpFrom: selectedTrim.msrp, rangeEpa: selectedTrim.specs?.range ?? vehicle.rangeEpa, milesPerKwh: selectedTrim.specs?.milesPerKwh ?? vehicle.milesPerKwh }
    : vehicle

  const econ = resolveCardEconomics(econVehicle, {
    prefs: {
      purchaseMode, leaseTermMonths, includeIncentives, incentiveOverride,
      state: stateCode, annualMileage, chargingMixPercent,
      electricityRateCentsPerKwh, dcfcRateCentsPerKwh, publicL2RateCentsPerKwh,
      chargingSubscriptionMonthlyUsd, ownershipYears,
    },
    incRec: incMap[vehicle.id] || null,
    eaOffer,
    leaseCalcRec,
  })
  const { tco } = econ

  const src = vehicleImgSrc(vehicle, 800)
  const name = `${vehicle.make} ${vehicle.model}`
  const rating = vehicle.expertRating != null ? Number(vehicle.expertRating).toFixed(1) : null
  const accel = vehicle.zeroToSixty ? `${vehicle.zeroToSixty}s` : '-'
  const tagline = [displayRange ? `${displayRange} mi EPA` : null, vehicle.chargingPort].filter(Boolean).join(' · ')

  const yrs = ownershipYears || 5
  const gasPerMile = 3.5 / 28
  const evPerMile = tco?.costPerMile ?? 0.05
  const savings = Math.max(0, Math.round((annualMileage || 12000) * yrs * (gasPerMile - evPerMile)))

  const open = (e) => { if (e.target.closest('[data-stop]')) return; navigate(`/vehicles/${vehicle.id}`) }
  const pickTrim = (i) => setVehicleCalc(vehicle.id, { selectedTrimIndex: i })

  return (
    <div
      onClick={open}
      onMouseEnter={() => setHovered(true)}
      className="group relative overflow-hidden rounded-[22px] cursor-pointer transition-colors duration-200 hover:bg-surface-raised/60"
    >
      {/* Car photo, anchored to the whole card so on hover it moves + shrinks
          down into the spec drawer's left gutter (it transposes, not fades). */}
      {src && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="pointer-events-none absolute left-3 bottom-0 w-auto max-w-none object-contain
                     h-[150px] opacity-[0.16] transition-all duration-[600ms] ease-[cubic-bezier(.2,.8,.25,1)]
                     group-hover:h-[88px] group-hover:opacity-100 group-hover:left-0 group-hover:bottom-14 drop-shadow-2xl z-0"
        />
      )}

      {/* Main row */}
      <div className="relative px-5 sm:px-7 pt-6 pb-6 min-h-[132px]">
        <div className="relative z-[1] flex items-center gap-4 sm:gap-6">
          {/* Identity */}
          <div className="shrink-0 w-[210px] sm:w-[230px] min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-ink-muted bg-white/[0.06] px-2 py-0.5 rounded-pill capitalize backdrop-blur-sm">{vehicle.bodyStyle}</span>
              {rating && (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ textShadow: SHADOW }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-lime" style={{ boxShadow: '0 0 0 2px rgba(207,244,74,.4)' }} />{rating}
                </span>
              )}
            </div>
            <div className="font-grotesk font-semibold text-[22px] tracking-tight leading-tight" style={{ textShadow: SHADOW }}>{name}</div>
            <div className="text-xs text-ink-subtle mt-1 truncate" style={{ textShadow: SHADOW }}>{tagline}</div>
          </div>

          {/* Stats */}
          <div className="flex-1 hidden md:grid grid-cols-4 gap-3.5 min-w-0">
            <Stat label="MSRP" value={fmt(displayMsrp)} shadow />
            <Stat label="Mo. TCO" value={<>{fmt(tco?.monthlyTco)}<span className="text-[11px] text-ink-subtle font-medium">/mo</span></>} accent dot shadow />
            <Stat label="Range" value={vehicle.rangeEpa ? `up to ${vehicle.rangeEpa} mi` : '-'} shadow />
            <Stat label="0–60" value={accel} shadow />
          </div>

          {/* Actions */}
          <div className="shrink-0 flex items-center gap-2 sm:gap-2.5">
            <button
              data-stop
              onClick={() => inCompare ? removeFromCompare(vehicle.id) : (!compareMaxed && addToCompare(vehicle.id))}
              disabled={compareMaxed}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-[12.5px] font-semibold border transition-colors ${
                inCompare ? 'border-brand-blue text-brand-indigo bg-brand-blue/15'
                : compareMaxed ? 'border-border text-ink-subtle cursor-not-allowed'
                : 'border-border text-ink-muted hover:border-brand-blue hover:text-brand-indigo bg-surface-raised/70'
              }`}
            >
              {inCompare ? 'Added' : 'Compare'}
            </button>
            <div className="w-10 h-10 rounded-full bg-brand-blue grid place-items-center group-hover:scale-105 transition-transform">
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h9M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          </div>
        </div>

        {/* Mobile stat strip */}
        <div className="relative z-[1] md:hidden grid grid-cols-4 gap-2 mt-4">
          <Stat label="MSRP" value={fmt(displayMsrp)} shadow />
          <Stat label="Mo. TCO" value={fmt(tco?.monthlyTco)} accent dot shadow />
          <Stat label="Range" value={vehicle.rangeEpa ? `up to ${vehicle.rangeEpa} mi` : '-'} shadow />
          <Stat label="0–60" value={accel} shadow />
        </div>
      </div>

      {/* Spec drawer, on hover the photo transposes here: small + crisp, left of the details */}
      <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-300 ease-out">
        <div className="overflow-hidden">
          {/* Left gutter (sm+) reserved for the photo that moves + shrinks into place on hover */}
          <div className="border-t border-border px-5 sm:px-7 sm:pl-[180px] py-5">
            <div className="min-w-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <SpecCell label="Power" value={vehicle.horsepower ? `${vehicle.horsepower} hp` : '-'} />
                <SpecCell label="Battery" value={vehicle.batteryKwh ? `${vehicle.batteryKwh} kWh` : '-'} />
                <SpecCell label="Fast charge" value={vehicle.chargingSpeedDcFastKw ? `${vehicle.chargingSpeedDcFastKw} kW` : (vehicle.chargingPort || '-')} />
                <SpecCell label="Drivetrain" value={vehicle.drivetrains?.join(' / ') || '-'} />
                <SpecCell label="Seats" value={vehicle.seatingCapacity || '-'} />
                <SpecCell label="Efficiency" value={vehicle.milesPerKwh ? `${vehicle.milesPerKwh} mi/kWh` : '-'} />
              </div>

              {/* Trims, click to select; choice persists and updates the card */}
              {trims.length > 1 && (
                <div data-stop onClick={(e) => e.stopPropagation()} className="mt-4">
                  <div className="text-nano text-ink-subtle font-bold uppercase tracking-wide mb-2">Trims, tap to set this card</div>
                  <div className="flex flex-wrap gap-2">
                    {trims.map((t, i) => {
                      const active = i === selectedTrimIndex
                      return (
                        <button
                          key={i}
                          onClick={() => pickTrim(i)}
                          className={`inline-flex items-baseline gap-2 px-3 py-1.5 rounded-pill border text-[12px] font-medium transition-colors ${
                            active ? 'border-brand-blue bg-brand-blue/15 text-brand-indigo'
                            : 'border-border text-ink-muted hover:border-brand-blue hover:text-ink'
                          }`}
                        >
                          <span className="font-grotesk font-semibold">{t.name}</span>
                          <span className="text-ink-subtle">{fmt(t.msrp)}</span>
                          {t.specs?.range ? <span className="text-ink-subtle">· {t.specs.range} mi</span> : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(0,200,110,0.12)' }}>
                <span className="text-nano text-status-green font-bold uppercase tracking-wide">{yrs}-yr vs gas</span>
                <span className="font-grotesk font-bold text-[15px] text-status-green">{fmt(savings)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Soft bottom gradient on hover (no border) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: 'linear-gradient(to top, rgba(47,91,255,0.16), rgba(207,244,74,0.05) 45%, transparent)' }} />
    </div>
  )
}
