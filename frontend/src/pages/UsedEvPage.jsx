import { useMemo, useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import CostCalculator from '../components/calculator/CostCalculator'
import { useCalculatorStore } from '../store/calculatorStore'
import EstimateNotice from '../components/ui/EstimateNotice'

// Stable id so the calculator store persists the user's customizations while
// they tweak the used-vehicle basics on this page.
const USED_ID = 'used-ev-custom'

const BODY_STYLES = ['sedan', 'suv', 'truck', 'hatchback', 'van', 'coupe', 'wagon']
const DRIVETRAINS = ['FWD', 'RWD', 'AWD']

// Used EVs have already taken their steepest depreciation hit, so from the
// purchase point forward the curve is gentler than a new car's.
const USED_DEPRECIATION = {
  year1Percent: 12, year2Percent: 21, year3Percent: 29,
  year5Percent: 42, sourceUrl: 'https://www.iseecars.com/',
}

const DEFAULTS = {
  make: 'Used',
  model: 'EV',
  year: new Date().getFullYear() - 3,
  price: 25000,
  rangeEpa: 250,
  batteryKwh: 65,
  milesPerKwh: 3.5,
  bodyStyle: 'suv',
  drivetrain: 'AWD',
  annualInsurance: 1700,
  annualMaintenance: 650,
  dcFastKw: 150,
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="section-label block mb-1.5">
        {label}
        {hint && <span className="ml-1.5 text-ink-subtle font-normal normal-case text-[10px]">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step = 1, prefix, suffix }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">{prefix}</span>}
      <input
        type="number" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`input-base text-sm ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-12' : ''}`}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">{suffix}</span>}
    </div>
  )
}

export default function UsedEvPage() {
  const [form, setForm] = useState(DEFAULTS)
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setVehicleCalc = useCalculatorStore(s => s.setVehicleCalc)

  // Seed the calculator's price basis from the entered used price so the
  // Purchase tab and all downstream math start from the right number.
  useEffect(() => {
    if (form.price > 0) setVehicleCalc(USED_ID, { userInputPrice: Number(form.price) })
  }, [form.price, setVehicleCalc])

  // Build a synthetic vehicle document the existing CostCalculator understands.
  const vehicle = useMemo(() => {
    const price = Number(form.price) || 0
    const ins = Number(form.annualInsurance) || 1700
    return {
      id: USED_ID,
      make: form.make || 'Used',
      model: form.model || 'EV',
      year: Number(form.year) || DEFAULTS.year,
      type: 'used',
      bodyStyle: form.bodyStyle,
      category: form.bodyStyle,
      msrpFrom: price,
      milesPerKwh: Number(form.milesPerKwh) || 3.5,
      rangeEpa: Number(form.rangeEpa) || 0,
      trims: [
        {
          name: 'This vehicle',
          msrp: price,
          destinationFee: 0,
          drivetrain: form.drivetrain,
          specs: {
            range: Number(form.rangeEpa) || 0,
            batteryKwh: Number(form.batteryKwh) || 0,
            milesPerKwh: Number(form.milesPerKwh) || 3.5,
          },
          leaseOffers: [],
          financeOffers: [],
          cashOffers: [],
        },
      ],
      specs: {
        range: Number(form.rangeEpa) || 0,
        batteryKwh: Number(form.batteryKwh) || 0,
        milesPerKwh: Number(form.milesPerKwh) || 3.5,
        seatingCapacity: 5,
        chargingSpeedDcFastKw: Number(form.dcFastKw) || 150,
        chargingPort: 'CCS1',
        drivetrain: form.drivetrain,
      },
      maintenance: { averageAnnualCostUsd: Number(form.annualMaintenance) || 650 },
      insuranceEstimateAnnual: {
        low: Math.round(ins * 0.8),
        average: ins,
        high: Math.round(ins * 1.35),
      },
      depreciation: USED_DEPRECIATION,
      // Used federal credit (IRA §25E) was repealed in 2025 along with §30D.
      federalTaxCredit: { eligibleNew: false, amount: 0 },
    }
  }, [form])

  return (
    <>
      <Helmet>
        <title>Used EV Cost Calculator | EVsense</title>
        <meta name="description" content="Estimate the true cost of owning any used EV. Enter the price and specs, then fully customize financing, charging, insurance, incentives, and more." />
      </Helmet>

      <div className="relative overflow-hidden animate-screen-in">
        {/* Ambient blobs */}
        <div className="absolute -top-32 -right-28 w-[480px] h-[480px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(47,91,255,.10), transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-32 w-[440px] h-[440px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(207,244,74,.12), transparent 70%)' }} />

        <div className="relative z-[1] max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display text-display-md text-ink">Used EV <span className="italic text-brand-indigo">cost calculator</span></h1>
          <p className="text-ink-muted text-sm mt-1 max-w-2xl">
            Shopping a used EV that isn&rsquo;t in our catalog? Enter its price and specs below, then
            use the full calculator on the right to customize financing, charging, insurance,
            incentives, and ongoing costs for a close estimate of your out-the-door cost of ownership.
          </p>
        </div>

        <EstimateNotice className="mb-6" />

        <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
          {/* Vehicle basics */}
          <div className="card p-5 space-y-4 lg:sticky lg:top-4">
            <h2 className="font-semibold text-ink">Vehicle details</h2>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Make">
                <input type="text" value={form.make} onChange={e => setField('make', e.target.value)} className="input-base text-sm" />
              </Field>
              <Field label="Model">
                <input type="text" value={form.model} onChange={e => setField('model', e.target.value)} className="input-base text-sm" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Model year">
                <NumberInput value={form.year} onChange={v => setField('year', v)} min={2010} max={new Date().getFullYear()} />
              </Field>
              <Field label="Used price">
                <NumberInput value={form.price} onChange={v => setField('price', v)} min={0} max={250000} step={500} prefix="$" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="EPA range" hint="mi">
                <NumberInput value={form.rangeEpa} onChange={v => setField('rangeEpa', v)} min={50} max={600} suffix="mi" />
              </Field>
              <Field label="Battery" hint="usable">
                <NumberInput value={form.batteryKwh} onChange={v => setField('batteryKwh', v)} min={20} max={250} suffix="kWh" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Efficiency">
                <NumberInput value={form.milesPerKwh} onChange={v => setField('milesPerKwh', v)} min={1.5} max={6} step={0.1} suffix="mi/kWh" />
              </Field>
              <Field label="DC fast max" hint="kW">
                <NumberInput value={form.dcFastKw} onChange={v => setField('dcFastKw', v)} min={20} max={400} suffix="kW" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Body style">
                <select value={form.bodyStyle} onChange={e => setField('bodyStyle', e.target.value)} className="input-base text-sm capitalize">
                  {BODY_STYLES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Drivetrain">
                <select value={form.drivetrain} onChange={e => setField('drivetrain', e.target.value)} className="input-base text-sm">
                  {DRIVETRAINS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Insurance / yr">
                <NumberInput value={form.annualInsurance} onChange={v => setField('annualInsurance', v)} min={0} max={10000} step={50} prefix="$" />
              </Field>
              <Field label="Maintenance / yr">
                <NumberInput value={form.annualMaintenance} onChange={v => setField('annualMaintenance', v)} min={0} max={5000} step={50} prefix="$" />
              </Field>
            </div>

            <p className="text-[11px] text-ink-subtle border-t border-border pt-3">
              These set the starting point. Fine-tune financing terms, charging mix &amp; rates,
              incentives, and fees in the calculator. Used-EV depreciation is modeled gentler than
              a new car since the steepest drop has already happened.
            </p>
          </div>

          {/* Full calculator */}
          <div>
            <CostCalculator vehicle={vehicle} />
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
