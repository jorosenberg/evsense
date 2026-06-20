import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { useVehicles } from '../hooks/useVehicles'
import { useVehicleDetail } from '../hooks/useVehicleDetail'
import { calculateTCO } from '../utils/tcoCalculator'
import { getStateFees } from '../utils/stateFeesData'
import { STATE_ELECTRICITY_RATES } from '../utils/chargingCostCalculator'
import { STATE_OPTIONS } from '../utils/stateFeesData'
import { formatCurrency, formatNumber } from '../utils/formatCurrency'
import { vehicleImgSrc } from '../utils/vehicleImage'
import EstimateNotice from '../components/ui/EstimateNotice'
import ElectricityCostChart from '../components/widgets/ElectricityCostChart'

const SPEC_SECTIONS = [
  {
    title: 'Range & Charging',
    rows: [
      { label: 'Range', key: v => v.specs?.range, unit: 'mi', higherIsBetter: true, format: 'number' },
      { label: 'Battery', key: v => v.specs?.batteryKwh, unit: 'kWh', higherIsBetter: true, format: 'decimal1' },
      { label: 'Efficiency', key: v => v.specs?.milesPerKwh, unit: 'mi/kWh', higherIsBetter: true, format: 'decimal1' },
      { label: 'DCFC Speed', key: v => v.specs?.chargingSpeedDcFastKw, unit: 'kW', higherIsBetter: true, format: 'number' },
      { label: 'L2 Speed', key: v => v.specs?.chargingSpeedL2Kw, unit: 'kW', higherIsBetter: true, format: 'decimal1' },
      { label: 'Charge Port', key: v => v.specs?.chargingPort, unit: '', higherIsBetter: null, format: 'string' },
    ],
  },
  {
    title: 'Performance',
    rows: [
      { label: 'Horsepower', key: v => v.specs?.horsepower, unit: 'hp', higherIsBetter: true, format: 'number' },
      { label: 'Torque', key: v => v.specs?.torqueLbFt, unit: 'lb-ft', higherIsBetter: true, format: 'number' },
      { label: '0–60 mph', key: v => v.specs?.zeroToSixty, unit: 's', higherIsBetter: false, format: 'decimal1' },
      { label: 'Top Speed', key: v => v.specs?.topSpeed, unit: 'mph', higherIsBetter: true, format: 'number' },
      { label: 'Drivetrain', key: v => v.specs?.drivetrain, unit: '', higherIsBetter: null, format: 'string' },
    ],
  },
  {
    title: 'Practicality',
    rows: [
      { label: 'Seating', key: v => v.specs?.seatingCapacity, unit: '', higherIsBetter: true, format: 'number' },
      { label: 'Cargo Volume', key: v => v.specs?.cargoVolumeCuFt, unit: 'cu ft', higherIsBetter: true, format: 'decimal1' },
      { label: 'Frunk', key: v => v.specs?.frunkVolumeCuFt, unit: 'cu ft', higherIsBetter: true, format: 'decimal1' },
      { label: 'Towing', key: v => v.specs?.towingCapacityLbs, unit: 'lbs', higherIsBetter: true, format: 'number' },
      { label: 'Ground Clearance', key: v => v.specs?.groundClearanceIn, unit: 'in', higherIsBetter: true, format: 'decimal1' },
      { label: 'Weight', key: v => v.specs?.weightLbs, unit: 'lbs', higherIsBetter: false, format: 'number' },
    ],
  },
  {
    title: 'Warranty',
    rows: [
      { label: 'Vehicle Warranty', key: v => v.specs?.warrantyYears, unit: 'yr', higherIsBetter: true, format: 'number' },
      { label: 'Battery Warranty', key: v => v.specs?.batteryWarrantyYears, unit: 'yr', higherIsBetter: true, format: 'number' },
      { label: 'Battery Warranty Miles', key: v => v.specs?.batteryWarrantyMiles, unit: 'mi', higherIsBetter: true, format: 'number' },
    ],
  },
]

export default function ComparePage() {
  const [searchParams] = useSearchParams()
  const { compareVehicleIds, removeFromCompare, clearCompare } = useUserPreferencesStore()
  const { allVehicles } = useVehicles()

  const urlIds = searchParams.get('v')?.split(',').filter(Boolean)
  const activeIds = urlIds?.length ? urlIds : compareVehicleIds

  const [sharedConfig, setSharedConfig] = useState({
    state: 'CA',
    annualMileage: 12000,
    mode: 'finance',
    ownershipYears: 5,
    financeApr: 6.5,
    financeTermMonths: 60,
  })

  // Per-vehicle incentive override (manufacturer/dealer cash, state rebate, etc.)
  // keyed by vehicle id. Folds into each vehicle's TCO so prices compare apples
  // to apples. null/0 = no incentive applied.
  const [incentives, setIncentives] = useState({})
  const setIncentive = (id, amount) =>
    setIncentives(prev => ({ ...prev, [id]: amount }))

  const summaryVehicles = activeIds.map(id => allVehicles.find(v => v.id === id)).filter(Boolean)

  function handleShare() {
    const url = new URL(window.location.href)
    url.searchParams.set('v', activeIds.join(','))
    navigator.clipboard.writeText(url.toString()).then(() => alert('Compare link copied!'))
  }

  return (
    <>
      <Helmet>
        <title>Compare EVs | EVsense: EV Buyer's Guide</title>
        <meta name="description" content="Side-by-side EV comparison with real specs, pricing, and true cost of ownership." />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-serif text-display-md text-ink">Compare <span className="italic text-brand-indigo">EVs</span></h1>
            <p className="text-ink-muted text-sm mt-1">
              Side-by-side specs and true cost of ownership.{' '}
              <span className="text-accent-lime font-semibold bg-accent-lime/[0.14] px-2 py-0.5 rounded-pill text-xs">Lime = best in class</span>
            </p>
          </div>
          <div className="flex gap-2">
            {activeIds.length > 0 && <>
              <button onClick={handleShare} className="btn-secondary text-xs">Share</button>
              <button onClick={clearCompare} className="btn-ghost text-xs text-ink-muted">Clear all</button>
            </>}
          </div>
        </div>

        <EstimateNotice className="mb-6" />

        {activeIds.length === 0 ? (
          <div className="text-center py-20 card">
            <h2 className="font-display text-display-md text-ink mb-2">No vehicles selected</h2>
            <p className="text-ink-muted text-sm mb-6 max-w-sm mx-auto">
              Add vehicles using the <strong>⊕ Compare</strong> button on any vehicle card.
            </p>
            <Link to="/browse" className="btn-primary">Browse EVs</Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Vehicle header */}
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(summaryVehicles.length + (summaryVehicles.length < 3 ? 1 : 0), 4)}, 1fr)` }}>
              {summaryVehicles.map(v => (
                <motion.div key={v.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card overflow-hidden">
                  <div className="relative image-disc h-[170px] grid place-items-center overflow-hidden">
                    <span className="absolute top-3 left-3 z-10 text-[11px] font-semibold text-ink-muted bg-surface-raised/80 px-2.5 py-1 rounded-pill capitalize">{v.bodyStyle}</span>
                    <button onClick={() => removeFromCompare(v.id)} className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-surface-raised/85 grid place-items-center text-ink-muted hover:text-ink hover:scale-110 transition-transform" aria-label="Remove">
                      <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                    </button>
                    {(() => { const src = vehicleImgSrc(v, 800); return src
                      ? <img src={src} alt={`${v.make} ${v.model}`} className="relative z-[1] w-[88%] h-[120px] object-contain" loading="lazy" />
                      : <div className="text-ink-subtle text-xs">No image</div> })()}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs text-ink-subtle">{v.year} {v.make}</div>
                        <div className="font-grotesk font-bold text-ink truncate">{v.model}</div>
                      </div>
                      <Link to={`/vehicles/${v.id}`} className="shrink-0 w-8 h-8 rounded-full bg-brand-blue grid place-items-center hover:scale-105 transition-transform" aria-label="View details">
                        <svg width="13" height="13" viewBox="0 0 16 16"><path d="M3 8h9M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </Link>
                    </div>
                    <div className="text-xl font-semibold text-ink">{formatCurrency(v.msrpFrom)}</div>
                    {incentives[v.id] > 0 && (
                      <div className="text-sm text-status-green font-medium mb-1">
                        {formatCurrency(Math.max(0, (v.msrpFrom || 0) - incentives[v.id]))} after incentive
                      </div>
                    )}
                    {/* Per-vehicle incentive */}
                    <div className="mt-2 mb-3">
                      <label className="section-label block mb-1">Incentive / rebate</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">$</span>
                        <input
                          type="number" step={500} min={0} max={30000}
                          value={incentives[v.id] ?? ''}
                          placeholder="0"
                          onChange={e => setIncentive(v.id, e.target.value === '' ? 0 : Number(e.target.value))}
                          className="input-base pl-6 text-sm py-1.5"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(v.testedRange || v.rangeEpa) && (
                        <span className="badge badge-grey">
                          {v.testedRange || v.rangeEpa} mi{v.testedRange ? ' tested' : ''}
                        </span>
                      )}
                      {v.zeroToSixty && <span className="badge badge-grey">{v.zeroToSixty}s 0-60</span>}
                    </div>
                    <Link to={`/vehicles/${v.id}`} className="btn-secondary w-full justify-center text-xs py-2">Full Details</Link>
                  </div>
                </motion.div>
              ))}
              {summaryVehicles.length < 3 && (
                <div className="card border-dashed flex flex-col items-center justify-center p-6 text-center min-h-[200px] gap-3">
                  <span className="text-3xl text-border">+</span>
                  <p className="text-sm text-ink-muted">Add vehicle</p>
                  <Link to="/browse" className="btn-secondary text-xs">Browse EVs</Link>
                </div>
              )}
            </div>

            {/* Shared calculator config */}
            <div className="card p-5">
              <h2 className="font-semibold text-ink mb-4">Calculator Settings</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="section-label block mb-1.5">State</label>
                  <select value={sharedConfig.state} onChange={e => setSharedConfig(c => ({ ...c, state: e.target.value }))} className="input-base">
                    {STATE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="section-label block mb-1.5">Mode</label>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    {['cash','finance','lease'].map(mode => (
                      <button key={mode} onClick={() => setSharedConfig(c => ({ ...c, mode }))}
                        className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${sharedConfig.mode === mode ? 'bg-brand-blue text-white' : 'bg-surface-raised text-ink-muted hover:bg-surface-sunken'}`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="section-label block mb-1.5">Annual Miles, {sharedConfig.annualMileage.toLocaleString()}</label>
                  <input type="range" min={5000} max={25000} step={1000} value={sharedConfig.annualMileage}
                    onChange={e => setSharedConfig(c => ({ ...c, annualMileage: Number(e.target.value) }))}
                    className="w-full accent-brand-blue mt-2" />
                </div>
                <div>
                  <label className="section-label block mb-1.5">Ownership, {sharedConfig.ownershipYears} yr</label>
                  <input type="range" min={1} max={10} step={1} value={sharedConfig.ownershipYears}
                    onChange={e => setSharedConfig(c => ({ ...c, ownershipYears: Number(e.target.value) }))}
                    className="w-full accent-brand-blue mt-2" />
                </div>
                {sharedConfig.mode === 'finance' && <>
                  <div>
                    <label className="section-label block mb-1.5">APR (%)</label>
                    <input type="number" step={0.25} min={0} max={20} value={sharedConfig.financeApr}
                      onChange={e => setSharedConfig(c => ({ ...c, financeApr: Number(e.target.value) }))}
                      className="input-base" />
                  </div>
                  <div>
                    <label className="section-label block mb-1.5">Term</label>
                    <select value={sharedConfig.financeTermMonths}
                      onChange={e => setSharedConfig(c => ({ ...c, financeTermMonths: Number(e.target.value) }))}
                      className="input-base">
                      {[24,36,48,60,72,84].map(t => <option key={t} value={t}>{t} mo</option>)}
                    </select>
                  </div>
                </>}
              </div>
            </div>

            {/* True cost columns */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-surface-raised">
                <h2 className="font-semibold text-sm text-ink">True Cost of Ownership</h2>
                <p className="text-xs text-ink-subtle">Calculated with shared settings above · All estimates</p>
              </div>
              <div className="grid divide-x divide-border" style={{ gridTemplateColumns: `repeat(${activeIds.length}, 1fr)` }}>
                {activeIds.map(id => <VehicleTCOCell key={id} vehicleId={id} config={sharedConfig} incentive={incentives[id] || 0} />)}
              </div>
            </div>

            {/* Spec table sections */}
            {SPEC_SECTIONS.map(section => (
              <SpecSectionBlock key={section.title} section={section} vehicleIds={activeIds} />
            ))}

            {/* Charging cost chart */}
            <div className="card p-5">
              <h2 className="font-semibold text-ink mb-1">Charging Cost Comparison</h2>
              <p className="text-xs text-ink-subtle mb-4">Cost to drive 1,000 miles at different electricity rates</p>
              <ElectricityCostChart
                vehicles={allVehicles}
                selectedIds={activeIds.filter(id => {
                  const v = allVehicles.find(v => v.id === id)
                  return v?.milesPerKwh && !v?.comingSoon
                })}
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── TCO cell per vehicle ────────────────────────────────────────────────────
function VehicleTCOCell({ vehicleId, config, incentive = 0 }) {
  const { vehicle, loading } = useVehicleDetail(vehicleId)
  const stateData = getStateFees(config.state)
  const electricityRate = STATE_ELECTRICITY_RATES[config.state] ?? 18

  const tco = useMemo(() => {
    if (!vehicle) return null
    const trim = vehicle.trims?.[0]
    return calculateTCO({
      vehicle,
      calcState: {
        selectedTrimIndex: 0,
        mode: config.mode,
        downPayment: null,
        tradeInValue: 0,
        dealerDiscount: 0,
        dealerPrograms: {},
        financeApr: config.financeApr,
        financeTermMonths: config.financeTermMonths,
        leaseMoneyFactor: trim?.leaseOffers?.[0]?.moneyFactor ?? 0.00125,
        leaseResidualPercent: trim?.leaseOffers?.[0]?.residualPercent ?? 50,
        leaseTermMonths: 36,
        leaseMileagePerYear: 10000,
        leaseCapCostReduction: 0,
        leaseRebatesAppliedTo: 'cap',
        leaseAcquisitionFee: trim?.leaseOffers?.[0]?.acquisitionFee ?? 695,
        leaseDispositionFee: 395,
        leaseDocFee: 499,
        leaseIsOnePay: false,
        leaseMsdCount: 0,
        applyFederalCredit: true,
        // User-entered incentive folds straight into the TCO so compared prices
        // reflect each car's real out-the-door cost.
        manualIncentiveOverride: incentive > 0 ? incentive : null,
        insuranceEstimate: 'average',
        maintenanceOverride: null,
      },
      userPrefs: {
        state: config.state,
        annualMileage: config.annualMileage,
        ownershipYears: config.ownershipYears,
        electricityRateCentsPerKwh: electricityRate,
        hasHomeCharger: true,
        homeChargerInstallCostUsd: 1400,
        chargingMixPercent: { home: 80, publicL2: 10, dcFast: 10 },
        downPaymentPercent: 10,
      },
      stateData,
    })
  }, [vehicle, config, stateData, electricityRate, incentive])

  if (loading) return (
    <div className="p-4 space-y-2">
      {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-4 w-full" />)}
    </div>
  )
  if (!vehicle || !tco) return <div className="p-4 text-xs text-ink-subtle">Loading…</div>

  const rows = [
    { label: 'Est. Monthly Total', value: tco.monthlyTotal, big: true },
    { label: config.mode === 'lease' ? 'Lease Payment' : config.mode === 'finance' ? 'Loan Payment' : 'Cash purchase', value: tco.monthlyPayment },
    { label: 'Charging / mo', value: tco.monthlyCharging },
    { label: 'Insurance / mo', value: tco.monthlyInsurance },
    { label: 'Maintenance / mo', value: tco.monthlyMaintenance },
    { label: `${config.ownershipYears}-yr TCO`, value: tco.totalCost },
    { label: 'Depreciation', value: -(tco.depreciationData?.totalLoss || 0), negative: true },
    { label: 'Resale Value', value: tco.projectedResaleValue || 0, positive: true },
  ]

  return (
    <div className="p-4">
      {rows.map(({ label, value, big, positive, negative }) => (
        <div key={label} className={`mb-3 ${big ? 'pb-3 border-b border-border' : ''}`}>
          <div className="text-xs text-ink-subtle">{label}</div>
          <div className={`font-semibold tabular-nums ${big ? 'text-2xl text-brand-blue' : negative ? 'text-sm text-status-red' : positive ? 'text-sm text-status-green' : 'text-sm text-ink'}`}>
            {positive && value > 0 ? '+' : ''}{formatCurrency(Math.abs(value))}{negative && value !== 0 ? ' loss' : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Spec table section ──────────────────────────────────────────────────────
function SpecSectionBlock({ section, vehicleIds }) {
  const [collapsed, setCollapsed] = useState(false)
  const vehicleData = vehicleIds.map(id => {
    const { vehicle } = useVehicleDetail(id)
    return vehicle
  })

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border bg-surface-raised hover:bg-surface-sunken transition-colors text-left">
        <span className="font-semibold text-sm text-ink">{section.title}</span>
        <svg className={`w-4 h-4 text-ink-subtle transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && section.rows.map(row => {
        const values = vehicleData.map(v => v ? row.key(v) : null)
        const numericVals = values.filter(v => typeof v === 'number' && v != null)

        let winnerVal = null
        if (numericVals.length > 1) {
          winnerVal = row.higherIsBetter === true ? Math.max(...numericVals)
            : row.higherIsBetter === false ? Math.min(...numericVals)
            : null
          // Only mark winner if it's unique
          if (numericVals.filter(v => v === winnerVal).length > 1) winnerVal = null
        }

        const allNull = values.every(v => v == null)
        if (allNull) return null

        function fmt(v) {
          if (v == null) return '-'
          if (row.format === 'string') return String(v)
          if (row.format === 'number') return `${formatNumber(v)}${row.unit ? ' ' + row.unit : ''}`
          if (row.format === 'decimal1') return `${Number(v).toFixed(1)}${row.unit ? ' ' + row.unit : ''}`
          return `${v}${row.unit ? ' ' + row.unit : ''}`
        }

        return (
          <div key={row.label} className="grid border-b border-border last:border-0"
            style={{ gridTemplateColumns: `150px repeat(${vehicleIds.length}, 1fr)` }}>
            <div className="px-4 py-2.5 text-xs font-medium text-ink-subtle bg-surface-raised flex items-center border-r border-border">
              {row.label}
            </div>
            {values.map((val, i) => {
              const isWinner = winnerVal != null && val === winnerVal
              return (
                <div key={i} className={`px-4 py-2.5 text-sm tabular-nums flex items-center border-r border-border last:border-0 ${isWinner ? 'bg-accent-lime/[0.14] text-accent-lime font-semibold' : 'text-ink'}`}>
                  {fmt(val)}{isWinner && <span className="ml-1 text-xs">✓</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
