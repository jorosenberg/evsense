import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useEvDatabase } from '../hooks/useEvDatabase'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { getStateFees, STATE_OPTIONS } from '../utils/stateFeesData'
import { STATE_ELECTRICITY_RATES } from '../utils/chargingCostCalculator'
import { calculateTCO } from '../utils/tcoCalculator'
import {
  estimateBatteryDegradation,
  degradedRange,
  degradedEfficiency,
} from '../utils/batteryDegradation'
import { buildRecommendations } from '../utils/recommendations'
import { formatCurrency, formatNumber } from '../utils/formatCurrency'
import ChargingLocationPopup from '../components/calculator/ChargingLocationPopup'

/**
 * CatalogDetailPage
 *
 * Detail view for the extended ev-database.org catalog. These vehicles don't
 * have curated trim-level pricing, so this page collects:
 *   - A custom purchase price (defaults to currency-converted EU MSRP)
 *   - Current odometer + age (for used cars: drives battery degradation)
 * and produces a full TCO + recommendations using the same calculator engine
 * the curated detail page uses.
 */
export default function CatalogDetailPage() {
  const { id } = useParams()
  const { catalog, loading, findById } = useEvDatabase()
  const userPrefs = useUserPreferencesStore()

  const entry = findById(id)
  const [customPrice, setCustomPrice] = useState('')
  const [mileage, setMileage] = useState('')
  const [vehicleAgeYears, setVehicleAgeYears] = useState('')

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="skeleton h-8 w-1/3 mb-4" />
        <div className="skeleton h-64 rounded-card" />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-3"></div>
        <h2 className="font-semibold text-ink mb-2">Catalog entry not found</h2>
        <p className="text-ink-muted mb-4">This vehicle is not in our extended catalog.</p>
        <Link to="/browse" className="btn-primary">Browse all EVs</Link>
      </div>
    )
  }

  const isUsedTreatment = entry.used_treatment || Number(vehicleAgeYears) >= 3
  const purchasePrice =
    Number(customPrice) || entry.msrp_usd_estimate || 35000

  // Battery degradation (only meaningful when user enters mileage/age)
  const degradation = useMemo(() => {
    if (!mileage && !vehicleAgeYears) return null
    return estimateBatteryDegradation({
      ageYears: Number(vehicleAgeYears) || (entry.year_from ? new Date().getFullYear() - entry.year_from : 0),
      mileage: Number(mileage) || 0,
      chemistry: 'unknown',
    })
  }, [mileage, vehicleAgeYears, entry.year_from])

  const effectiveRange = degradation
    ? degradedRange(entry.range_mi, degradation.capacityRemainingPct)
    : entry.range_mi
  const effectiveEfficiency = degradation
    ? degradedEfficiency(entry.efficiency_mi_per_kwh, degradation.capacityRemainingPct)
    : entry.efficiency_mi_per_kwh

  // Build a synthetic vehicle shape for the TCO calculator
  const syntheticVehicle = useMemo(() => {
    return {
      id: entry.id,
      make: entry.make,
      model: entry.model,
      year: entry.year_from || new Date().getFullYear(),
      bodyStyle: (entry.body_shape || '').toLowerCase().replace(/\s/g, '') || 'suv',
      msrpFrom: purchasePrice,
      sold_in_us: entry.sold_in_us,
      trims: [{
        name: entry.model,
        msrp: purchasePrice,
        drivetrain: entry.drivetrain || 'AWD',
        availableColors: [],
        cashOffers: [],
        financeOffers: [{ apr: 6.99, termMonths: 60, downPayment: 0 }],
        leaseOffers: [],
      }],
      specs: {
        range: effectiveRange,
        batteryKwh: entry.battery_kwh,
        milesPerKwh: effectiveEfficiency || 3.0,
        horsepower: null,
        zeroToSixty: entry.accel_0_60_s,
        topSpeed: null,
        torqueLbFt: null,
        seatingCapacity: entry.seat_count,
        cargoVolumeCuFt: entry.cargo_cu_ft,
        towingCapacityLbs: entry.towing_lbs,
        weightLbs: entry.weight_lbs,
        chargingPort: (entry.plug_type || '').includes('CCS') ? 'CCS' : entry.plug_type || 'CCS',
        chargingSpeedDcFastKw: entry.fast_charge_kw,
        chargingSpeedL2Kw: 11,
        drivetrain: entry.drivetrain,
        warrantyYears: 4,
        batteryWarrantyYears: 8,
        batteryWarrantyMiles: 100000,
      },
      maintenance: {
        averageAnnualCostUsd: isUsedTreatment ? 850 : 600,
        notes: isUsedTreatment
          ? 'Used EV: budget ~40% more for tires, suspension, and battery coolant service.'
          : 'EVs avoid most engine and transmission maintenance.',
      },
      depreciation: isUsedTreatment
        ? { year1Percent: 8, year2Percent: 15, year3Percent: 22, year5Percent: 36 }
        : { year1Percent: 28, year2Percent: 40, year3Percent: 50, year5Percent: 62 },
      insuranceEstimateAnnual: {
        low: Math.round(purchasePrice * 0.022),
        average: Math.round(purchasePrice * 0.031),
        high: Math.round(purchasePrice * 0.044),
        source: 'Estimated at 2.2-4.4% of MSRP (Policygenius 2025 EV avg)',
      },
      federalTaxCredit: { eligibleNew: false, amount: 0 },
    }
  }, [entry, purchasePrice, effectiveRange, effectiveEfficiency, isUsedTreatment])

  const stateData = getStateFees(userPrefs.state)
  const electricityRate = userPrefs.electricityRateCentsPerKwh
    ?? STATE_ELECTRICITY_RATES[userPrefs.state] ?? 18

  const tco = useMemo(() => calculateTCO({
    vehicle: syntheticVehicle,
    calcState: {
      selectedTrimIndex: 0,
      mode: 'finance',
      downPayment: null,
      tradeInValue: 0,
      dealerDiscount: 0,
      financeApr: 6.99,
      financeTermMonths: 60,
      applyFederalCredit: false,
      insuranceEstimate: 'average',
      maintenanceOverride: null,
    },
    userPrefs: { ...userPrefs, electricityRateCentsPerKwh: electricityRate },
    stateData,
  }), [syntheticVehicle, userPrefs, stateData, electricityRate])

  const recs = buildRecommendations({
    vehicle: { ...entry, specs: syntheticVehicle.specs, sold_in_us: entry.sold_in_us },
    tco,
    userPrefs,
    isUsed: isUsedTreatment,
    batteryCapacityRemainingPct: degradation?.capacityRemainingPct ?? null,
  })

  const title = entry.name

  return (
    <>
      <Helmet>
        <title>{title} — True Cost | EVsense</title>
        <meta name="description" content={`Cost of ownership analysis for ${title} using ev-database.org specs.`} />
      </Helmet>

      {!entry.sold_in_us && (
        <div className="stale-banner bg-status-yellow-bg border-b border-status-yellow/30 text-status-yellow">
          {entry.us_market_note}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <nav className="text-xs text-ink-subtle mb-4">
          <Link to="/" className="hover:text-ink">Home</Link>
          <span className="mx-1.5">›</span>
          <Link to="/browse" className="hover:text-ink">Browse</Link>
          <span className="mx-1.5">›</span>
          <span className="text-ink">{title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 card overflow-hidden">
            <div className="aspect-[16/9] bg-surface-sunken">
              {entry.image_url ? (
                <img src={entry.image_url} alt={title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-subtle">No image</div>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {!entry.sold_in_us && <span className="badge badge-yellow">Not sold in US</span>}
              {entry.status === 'archive' && <span className="badge badge-grey">Discontinued — used</span>}
              {entry.status === 'upcoming' && <span className="badge badge-blue">Upcoming</span>}
              {isUsedTreatment && entry.sold_in_us && <span className="badge badge-grey">Used treatment</span>}
            </div>
            <h1 className="font-serif text-display-md text-ink leading-tight">{title}</h1>
            <p className="text-sm text-ink-subtle mt-1">
              {entry.body_shape} · {entry.drivetrain || '—'} · {entry.year_from}
              {entry.year_to ? `–${entry.year_to}` : ''}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Stat label="EPA range" value={effectiveRange ? `${effectiveRange} mi` : '—'} sub={degradation ? 'after degradation' : null} />
              <Stat label="Battery" value={entry.battery_kwh ? `${entry.battery_kwh} kWh` : '—'} />
              <Stat label="Efficiency" value={effectiveEfficiency ? `${effectiveEfficiency} mi/kWh` : '—'} />
              <Stat label="DCFC" value={entry.fast_charge_kw ? `${entry.fast_charge_kw} kW` : '—'} />
              <Stat label="0–60" value={entry.accel_0_60_s ? `${entry.accel_0_60_s} s` : '—'} />
              <Stat label="Seats" value={entry.seat_count || '—'} />
            </div>

            <a
              href={entry.detail_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost mt-4 w-full justify-center text-sm"
            >
              View source on ev-database.org ↗
            </a>
          </div>
        </div>

        {/* Inputs: custom price + mileage */}
        <div className="card p-5 mb-8">
          <h2 className="font-semibold text-ink mb-3">Configure your scenario</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="section-label block mb-1.5">Purchase price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
                <input
                  type="number"
                  value={customPrice}
                  placeholder={entry.msrp_usd_estimate ? formatNumber(entry.msrp_usd_estimate) : '35000'}
                  onChange={e => setCustomPrice(e.target.value)}
                  className="input-base pl-7"
                  min={0}
                />
              </div>
              <p className="text-xs text-ink-subtle mt-1">
                {entry.msrp_usd_estimate
                  ? `Default: ${formatCurrency(entry.msrp_usd_estimate)} (converted from ${Object.values(entry.prices)[0]?.raw || 'EU listing'})`
                  : 'No reference price — enter your own.'}
              </p>
            </div>

            <div>
              <label className="section-label block mb-1.5">Current odometer (mi)</label>
              <input
                type="number"
                value={mileage}
                onChange={e => setMileage(e.target.value)}
                placeholder="0 for new"
                className="input-base"
                min={0}
              />
              <p className="text-xs text-ink-subtle mt-1">
                Drives battery degradation estimate.
              </p>
            </div>

            <div>
              <label className="section-label block mb-1.5">Vehicle age (years)</label>
              <input
                type="number"
                value={vehicleAgeYears}
                onChange={e => setVehicleAgeYears(e.target.value)}
                placeholder={entry.year_from ? String(Math.max(0, new Date().getFullYear() - entry.year_from)) : '0'}
                className="input-base"
                min={0}
              />
              <p className="text-xs text-ink-subtle mt-1">
                {entry.year_from ? `Default: ${Math.max(0, new Date().getFullYear() - entry.year_from)} (from year built)` : 'Default: 0'}
              </p>
            </div>
          </div>

          {/* State + DCFC popup */}
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-end gap-3">
            <div>
              <label className="section-label block mb-1.5">Your state</label>
              <select
                value={userPrefs.state}
                onChange={e => userPrefs.setState(e.target.value, 'manual')}
                className="input-base"
              >
                {STATE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <ChargingLocationPopup defaultRate={userPrefs.dcfcRateCentsPerKwh || 45} />
            {userPrefs.dcfcRateCentsPerKwh && (
              <div className="text-xs text-status-green bg-status-green-bg rounded px-2 py-1">
                Local DCFC rate set: {userPrefs.dcfcRateCentsPerKwh}¢/kWh
              </div>
            )}
          </div>
        </div>

        {/* Degradation breakdown */}
        {degradation && (
          <div className="card p-5 mb-8">
            <h2 className="font-semibold text-ink mb-3">Battery Health Estimate</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BigStat label="Capacity remaining" value={`${degradation.capacityRemainingPct}%`} highlight />
              <BigStat label="Range (degraded)" value={effectiveRange ? `${effectiveRange} mi` : '—'} />
              <BigStat label="Range (new)" value={entry.range_mi ? `${entry.range_mi} mi` : '—'} muted />
              <BigStat label="Confidence" value={degradation.confidence} muted />
            </div>
            {degradation.notes.length > 0 && (
              <ul className="mt-4 space-y-2 text-xs text-ink-muted">
                {degradation.notes.map((n, i) => (
                  <li key={i} className="flex gap-2"><span>•</span><span>{n}</span></li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-subtle mt-3">
              Estimate based on aggregated fleet studies (Recurrent Auto, Geotab). Actual degradation depends on climate, DOD cycling, and DCFC frequency.
            </p>
          </div>
        )}

        {/* TCO Summary */}
        <div className="card p-5 mb-8">
          <h2 className="font-semibold text-ink mb-1">5-Year True Cost</h2>
          <p className="text-xs text-ink-subtle mb-4">
            Assumes financing at 6.99% APR over 60 months, {userPrefs.annualMileage.toLocaleString()} mi/yr, {userPrefs.state} taxes.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Monthly all-in" value={formatCurrency(tco.monthlyTotal)} highlight />
            <BigStat label="Loan payment" value={formatCurrency(tco.monthlyPayment) + '/mo'} />
            <BigStat label="Charging" value={formatCurrency(tco.monthlyCharging) + '/mo'} />
            <BigStat label="Insurance" value={formatCurrency(tco.monthlyInsurance) + '/mo'} />
          </div>
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <Row label="5-yr total cost" value={formatCurrency(tco.totalCost)} />
            <Row label="Total charging" value={formatCurrency(tco.totalCharging)} />
            <Row label="Total interest" value={formatCurrency(tco.financeDetails?.totalInterest || 0)} />
            <Row label="Depreciation loss" value={formatCurrency(tco.depreciationData?.totalLoss || 0)} negative />
            <Row label="Projected resale" value={formatCurrency(tco.projectedResaleValue || 0)} positive />
            <Row label="Net cost after resale" value={formatCurrency(tco.netCostAfterResale || tco.totalCost)} />
          </div>
        </div>

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="card p-5 mb-8">
            <h2 className="font-semibold text-ink mb-3">Recommendations</h2>
            <div className="space-y-3">
              {recs.map((r, i) => (
                <div
                  key={i}
                  className={`border-l-4 pl-4 py-2 ${
                    r.severity === 'warn'
                      ? 'border-status-yellow bg-status-yellow-bg'
                      : r.severity === 'tip'
                      ? 'border-brand-blue bg-brand-blue-light'
                      : 'border-border bg-surface-sunken'
                  }`}
                >
                  <div className="font-semibold text-sm text-ink">{r.title}</div>
                  <div className="text-xs text-ink-muted mt-1 leading-relaxed">{r.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-ink-subtle text-center">
          Catalog data: ev-database.org · Last scraped: {catalog?.scraped_at?.slice(0, 10)} · Estimates only — verify pricing with dealers.
        </p>
      </div>
    </>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-surface-sunken rounded-lg p-2.5">
      <div className="text-[10px] text-ink-subtle uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-ink tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-ink-subtle mt-0.5">{sub}</div>}
    </div>
  )
}

function BigStat({ label, value, highlight = false, muted = false }) {
  return (
    <div className={`rounded-lg p-4 ${highlight ? 'bg-brand-blue-light border border-brand-blue/20' : muted ? 'bg-surface-sunken' : 'bg-surface-raised border border-border'}`}>
      <div className="text-xs text-ink-subtle uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${highlight ? 'text-brand-blue' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function Row({ label, value, negative = false, positive = false }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${negative ? 'text-status-red' : positive ? 'text-status-green' : 'text-ink'}`}>
        {positive && value !== '$0' ? '+' : ''}{value}
      </span>
    </div>
  )
}
