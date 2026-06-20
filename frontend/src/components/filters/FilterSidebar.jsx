import { useState } from 'react'
import { useFilterStore } from '../../store/filterStore'
import { useVehicles } from '../../hooks/useVehicles'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'

// Monthly payment calculator — the pay-method toggle is wired to the GLOBAL
// purchase mode, so switching lease/finance instantly re-prices every card AND
// re-targets the budget filter at that payment type. Budget applies live.
const FINANCE_DEFAULT_MAX = [0, 2000]
const LEASE_DEFAULT_MAX = [0, 1500]

function PaymentCalculator() {
  const { purchaseMode, setPurchaseMode } = useUserPreferencesStore()
  const filters = useFilterStore()
  // The budget control only deals in finance/lease; a global "cash" mode shows
  // finance here, but clicking a button switches the global mode too.
  const mode = purchaseMode === 'lease' ? 'lease' : 'finance'
  const [maxPayment, setMaxPayment] = useState(800)

  function estMaxMsrp(m, pay) {
    // Finance ≈ $18.50/mo per $1k (6.5% APR, 60mo); lease ≈ $10/mo per $1k.
    return m === 'finance'
      ? Math.round(pay / 0.0185 / 1000) * 1000
      : Math.round(pay / 0.01 / 1000) * 1000
  }
  const maxMsrp = estMaxMsrp(mode, maxPayment)

  // Apply the budget for `m` and reset the OTHER payment type's range so only
  // the active mode filters. Runs live on every mode/slider change.
  function applyBudget(m, pay) {
    if (m === 'lease') {
      filters.setFilter('leasePaymentRange', [0, pay])
      filters.setFilter('monthlyPaymentRange', FINANCE_DEFAULT_MAX)
    } else {
      filters.setFilter('monthlyPaymentRange', [0, pay])
      filters.setFilter('leasePaymentRange', LEASE_DEFAULT_MAX)
    }
    filters.setFilter('priceRange', [filters.priceRange[0], Math.max(estMaxMsrp(m, pay), 25000)])
  }

  function chooseMode(m) {
    setPurchaseMode(m)     // re-prices every card to this pay method
    applyBudget(m, maxPayment)
  }
  function changeMax(pay) {
    setMaxPayment(pay)
    applyBudget(mode, pay)  // filter live
  }
  function clearBudget() {
    filters.setFilter('monthlyPaymentRange', FINANCE_DEFAULT_MAX)
    filters.setFilter('leasePaymentRange', LEASE_DEFAULT_MAX)
    filters.setFilter('priceRange', [filters.priceRange[0], 150000])
  }

  return (
    <div className="border border-border rounded-lg p-3 mb-5 bg-surface-raised">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink">Monthly budget</span>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {['finance', 'lease'].map(m => (
            <button
              key={m}
              onClick={() => chooseMode(m)}
              className={`px-2.5 py-1 capitalize transition-colors ${
                mode === m ? 'bg-brand-blue text-white' : 'bg-surface-sunken text-ink-muted hover:bg-white/[0.06]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-ink-subtle mb-1">
          <span>Up to</span>
          <span className="font-semibold text-ink">${maxPayment.toLocaleString()}/mo</span>
        </div>
        <input
          type="range"
          min={200} max={2000} step={50}
          value={maxPayment}
          onChange={e => changeMax(Number(e.target.value))}
          className="w-full accent-brand-blue"
          aria-label="Maximum monthly payment"
        />
        <div className="flex justify-between text-[10px] text-ink-subtle mt-0.5">
          <span>$200</span><span>$2,000</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-subtle">
        <span>Est. max MSRP: <span className="font-medium text-ink">${maxMsrp.toLocaleString()}</span></span>
        <button onClick={clearBudget} className="text-brand-blue hover:underline">Clear</button>
      </div>
      <p className="text-[10px] text-ink-subtle mt-1">
        Filtering {mode} payments live · cards show {mode} pricing
      </p>
    </div>
  )
}

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
      <button
        className="flex items-center justify-between w-full text-left mb-3"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-ink">{title}</span>
        <svg className={`w-4 h-4 text-ink-subtle transition-transform ${open ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && children}
    </div>
  )
}

function CheckboxGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => onChange(opt.value)}
            className="w-4 h-4 text-brand-blue rounded border-border"
          />
          <span className="text-sm text-ink-muted">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

export default function FilterSidebar({ onClose }) {
  const filters = useFilterStore()
  const { allVehicles } = useVehicles()

  // Get unique brands from data
  const brands = [...new Set(allVehicles.map((v) => v.make))].sort()

  return (
    <div className="pb-6">
      {/* Monthly payment calculator — at the top like Recharged */}
      <PaymentCalculator />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-ink">Filter & Sort</h2>
        <div className="flex items-center gap-2">
          {filters.getActiveFilterCount() > 0 && (
            <button onClick={filters.resetFilters} className="text-xs text-brand-blue hover:underline">
              Reset all
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-surface-sunken rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sort */}
      <FilterSection title="Sort By">
        <select
          value={filters.sort}
          onChange={(e) => filters.setFilter('sort', e.target.value)}
          className="input-base"
        >
          <option value="msrp_asc">Price: Low to High</option>
          <option value="msrp_desc">Price: High to Low</option>
          <option value="range_desc">Range: Most First</option>
          <option value="lease_asc">Lease Payment: Low to High</option>
          <option value="payment_asc">Finance Payment: Low to High</option>
          <option value="speed_asc">0–60: Fastest First</option>
        </select>
      </FilterSection>

      {/* Condition */}
      <FilterSection title="Condition">
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'new', label: 'New' },
            { value: 'used', label: 'Used' },
            { value: 'coming_soon', label: 'Coming Soon' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => filters.setFilter('condition', opt.value)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                filters.condition === opt.value
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'bg-surface-raised text-ink-muted border-border hover:border-brand-blue hover:text-brand-indigo'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Price range */}
      <FilterSection title="MSRP Range">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-ink-muted">
            <span>${(filters.priceRange[0] / 1000).toFixed(0)}k</span>
            <span>${(filters.priceRange[1] / 1000).toFixed(0)}k</span>
          </div>
          <input
            type="range"
            min={20000}
            max={150000}
            step={5000}
            value={filters.priceRange[1]}
            onChange={(e) => filters.setFilter('priceRange', [filters.priceRange[0], Number(e.target.value)])}
            className="w-full accent-brand-blue"
            aria-label="Maximum price"
          />
        </div>
      </FilterSection>

      {/* Minimum range */}
      <FilterSection title="Minimum Range (miles)">
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">{filters.minRange > 0 ? `${filters.minRange}+ miles` : 'Any range'}</div>
          <input
            type="range"
            min={0}
            max={500}
            step={25}
            value={filters.minRange}
            onChange={(e) => filters.setFilter('minRange', Number(e.target.value))}
            className="w-full accent-brand-blue"
            aria-label="Minimum range"
          />
        </div>
      </FilterSection>

      {/* Drivetrain */}
      <FilterSection title="Drivetrain">
        <CheckboxGroup
          options={[
            { value: 'RWD', label: 'RWD' },
            { value: 'AWD', label: 'AWD' },
            { value: 'FWD', label: 'FWD' },
          ]}
          value={filters.drivetrains}
          onChange={(v) => filters.toggleArrayFilter('drivetrains', v)}
        />
      </FilterSection>

      {/* Body Style */}
      <FilterSection title="Body Style">
        <CheckboxGroup
          options={[
            { value: 'sedan', label: 'Sedan' },
            { value: 'suv', label: 'SUV / Crossover' },
            { value: 'truck', label: 'Truck' },
            { value: 'van', label: 'Van' },
            { value: 'hatchback', label: 'Hatchback' },
          ]}
          value={filters.bodyStyles}
          onChange={(v) => filters.toggleArrayFilter('bodyStyles', v)}
        />
      </FilterSection>

      {/* Seating */}
      <FilterSection title="Seating" defaultOpen={false}>
        <CheckboxGroup
          options={[
            { value: '2', label: '2 seats' },
            { value: '5', label: '5 seats' },
            { value: '6', label: '6 seats' },
            { value: '7+', label: '7+ seats' },
          ]}
          value={filters.seating}
          onChange={(v) => filters.toggleArrayFilter('seating', v)}
        />
      </FilterSection>

      {/* Charging port */}
      <FilterSection title="Charging Port" defaultOpen={false}>
        <CheckboxGroup
          options={[
            { value: 'NACS', label: 'NACS (Tesla standard)' },
            { value: 'CCS', label: 'CCS' },
          ]}
          value={filters.chargingPorts}
          onChange={(v) => filters.toggleArrayFilter('chargingPorts', v)}
        />
      </FilterSection>

      {/* Brand */}
      <FilterSection title="Brand" defaultOpen={false}>
        <CheckboxGroup
          options={brands.map((b) => ({ value: b, label: b }))}
          value={filters.brands}
          onChange={(v) => filters.toggleArrayFilter('brands', v)}
        />
      </FilterSection>

      {/* Federal credit */}
      <FilterSection title="Incentives" defaultOpen={false}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.federalCreditOnly}
            onChange={(e) => filters.setFilter('federalCreditOnly', e.target.checked)}
            className="w-4 h-4 text-brand-blue rounded"
          />
          <span className="text-sm text-ink-muted">Federal tax credit eligible only</span>
        </label>
      </FilterSection>

      {/* Cargo volume — curated spec (cu ft). */}
      <FilterSection title="Min. Cargo Volume" defaultOpen={false}>
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">
            {filters.minCargo > 0 ? `${filters.minCargo}+ cu ft` : 'Any'}
          </div>
          <input
            type="range" min={0} max={90} step={5}
            value={filters.minCargo}
            onChange={(e) => filters.setFilter('minCargo', Number(e.target.value))}
            className="w-full accent-brand-blue"
            aria-label="Minimum cargo volume"
          />
        </div>
      </FilterSection>

      {/* Efficiency */}
      <FilterSection title="Min. Efficiency" defaultOpen={false}>
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">
            {filters.minEfficiency > 0 ? `${filters.minEfficiency.toFixed(1)}+ mi/kWh` : 'Any'}
          </div>
          <input
            type="range" min={0} max={5} step={0.1}
            value={filters.minEfficiency}
            onChange={(e) => filters.setFilter('minEfficiency', Number(e.target.value))}
            className="w-full accent-brand-blue"
            aria-label="Minimum efficiency"
          />
        </div>
      </FilterSection>

      {/* Towing */}
      <FilterSection title="Min. Towing Capacity" defaultOpen={false}>
        <div className="space-y-2">
          <div className="text-xs text-ink-muted">
            {filters.minTowing > 0 ? `${filters.minTowing.toLocaleString()}+ lbs` : 'Any'}
          </div>
          <input
            type="range" min={0} max={20000} step={1000}
            value={filters.minTowing}
            onChange={(e) => filters.setFilter('minTowing', Number(e.target.value))}
            className="w-full accent-brand-blue"
            aria-label="Minimum towing capacity"
          />
        </div>
      </FilterSection>
    </div>
  )
}
