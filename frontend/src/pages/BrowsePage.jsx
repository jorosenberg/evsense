import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useFilteredVehicles } from '../hooks/useVehicles'
import { useFilterStore } from '../store/filterStore'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import BrowseRow from '../components/vehicles/BrowseRow'
import FilterSidebar from '../components/filters/FilterSidebar'
import EvDatabaseSearch from '../components/vehicles/EvDatabaseSearch'
import CostCustomizerPanel from '../components/vehicles/CostCustomizerPanel'
import IncentiveNotice from '../components/ui/IncentiveNotice'
import EstimateNotice from '../components/ui/EstimateNotice'

const PAGE_SIZE = 12

// Category quick-filters, Recharged-style visual category row
const CATEGORIES = [
  {
    label: 'Sedans',
    value: 'sedan',
    icon: (
      <svg viewBox="0 0 80 40" fill="none" className="w-16 h-8">
        <rect x="8" y="22" width="64" height="12" rx="4" fill="currentColor" opacity=".15"/>
        <path d="M14 22 C18 12 26 10 40 10 C54 10 62 12 66 22" stroke="currentColor" strokeWidth="2.5" fill="none"/>
        <circle cx="20" cy="34" r="5" fill="currentColor" opacity=".4"/>
        <circle cx="60" cy="34" r="5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
  },
  {
    label: 'SUVs',
    value: 'suv',
    icon: (
      <svg viewBox="0 0 80 40" fill="none" className="w-16 h-8">
        <rect x="8" y="18" width="64" height="16" rx="4" fill="currentColor" opacity=".15"/>
        <path d="M14 18 L18 8 L62 8 L66 18" stroke="currentColor" strokeWidth="2.5" fill="none"/>
        <circle cx="20" cy="34" r="5" fill="currentColor" opacity=".4"/>
        <circle cx="60" cy="34" r="5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
  },
  {
    label: 'Trucks',
    value: 'truck',
    icon: (
      <svg viewBox="0 0 80 40" fill="none" className="w-16 h-8">
        <rect x="8" y="18" width="64" height="16" rx="4" fill="currentColor" opacity=".15"/>
        <path d="M14 18 L18 8 L46 8 L46 18" stroke="currentColor" strokeWidth="2.5" fill="none"/>
        <circle cx="20" cy="34" r="5" fill="currentColor" opacity=".4"/>
        <circle cx="60" cy="34" r="5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
  },
  {
    label: 'Vans',
    value: 'van',
    icon: (
      <svg viewBox="0 0 80 40" fill="none" className="w-16 h-8">
        <rect x="8" y="14" width="64" height="20" rx="4" fill="currentColor" opacity=".15"/>
        <path d="M14 14 L14 8 L58 8 L66 14" stroke="currentColor" strokeWidth="2.5" fill="none"/>
        <circle cx="20" cy="34" r="5" fill="currentColor" opacity=".4"/>
        <circle cx="60" cy="34" r="5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
  },
  {
    label: 'All',
    value: null,
    icon: (
      <svg viewBox="0 0 80 40" fill="none" className="w-16 h-8">
        <circle cx="40" cy="20" r="14" stroke="currentColor" strokeWidth="2" opacity=".4"/>
        <path d="M28 20h24M40 8v24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".6"/>
      </svg>
    ),
  },
]

export default function BrowsePage() {
  const { vehicles, loading, total } = useFilteredVehicles()
  const filters = useFilterStore()
  const purchaseMode = useUserPreferencesStore(s => s.purchaseMode)
  // The price sort is pay-method aware: total price for cash, monthly all-in
  // TCO for finance/lease. Label it so the dropdown reflects that.
  const priceSortByMonthly = purchaseMode === 'lease' || purchaseMode === 'finance'
  const priceLowLabel = priceSortByMonthly ? 'Monthly cost: Low → High' : 'Price: Low → High'
  const priceHighLabel = priceSortByMonthly ? 'Monthly cost: High → Low' : 'Price: High → Low'
  const [page, setPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(false)

  const activeFilterCount = filters.getActiveFilterCount()
  const totalPages = Math.ceil(vehicles.length / PAGE_SIZE)
  const paginated = vehicles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function selectCategory(value) {
    // Reset body styles and set the selected one
    if (value === null) {
      filters.setFilter('bodyStyles', [])
    } else {
      filters.setFilter('bodyStyles', [value])
    }
    setPage(1)
  }

  const activeCategory = filters.bodyStyles.length === 1 ? filters.bodyStyles[0] : null

  return (
    <>
      <Helmet>
        <title>Browse EVs, EVsense: EV Buyer's Guide</title>
        <meta name="description" content="Browse all electric vehicles with real pricing, range, and estimated total cost of ownership. Filter by price, range, drivetrain, and more." />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Page header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-display-md text-ink">Browse <span className="italic text-brand-indigo">EVs</span></h1>
            <p className="text-ink-muted text-sm mt-0.5">
              {loading ? 'Loading…' : `${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}`}
              {total > 0 && vehicles.length < total && ` of ${total}`}
              {!loading && ' · costs tuned to how '}
              {!loading && <em className="not-italic text-brand-blue font-semibold">you</em>}
              {!loading && ' drive'}
            </p>
          </div>
          <button
            className="lg:hidden btn-secondary"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M11 20h2" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="badge badge-blue ml-1">{activeFilterCount}</span>
            )}
          </button>
        </div>

        <EstimateNotice className="mb-3" />
        <IncentiveNotice className="mb-5" />

        {/* Customize costs, friendly bar at the top of Browse */}
        <CostCustomizerPanel />

        {/* Filters & sort toggle */}
        <div className="flex items-center justify-between gap-3 mt-6 mb-5 flex-wrap">
          <button
            onClick={() => setFiltersVisible(v => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-pill border text-sm font-semibold transition-all ${
              filtersVisible
                ? 'bg-surface-raised border-border text-ink-muted hover:text-ink hover:border-border-strong'
                : 'bg-accent-lime border-[#bfe53f] text-[#0C0E14] shadow-lime hover:-translate-y-px'
            }`}
          >
            <svg className={`w-4 h-4 transition-transform ${filtersVisible ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M11 20h2" /></svg>
            {filtersVisible ? 'Hide filters & sort' : 'Show filters & sort'}
            {activeFilterCount > 0 && <span className={`badge ${filtersVisible ? 'badge-blue' : 'bg-[#0C0E14] text-accent-lime'}`}>{activeFilterCount}</span>}
          </button>
          <span className="text-sm text-ink-muted">{loading ? '' : `${vehicles.length} result${vehicles.length !== 1 ? 's' : ''}`}</span>
        </div>

        {/* Category quick-filter row */}
        {filtersVisible && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => {
            const isActive = cat.value === null
              ? filters.bodyStyles.length === 0
              : activeCategory === cat.value
            return (
              <button
                key={cat.label}
                onClick={() => selectCategory(cat.value)}
                className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-xl border transition-all shrink-0 ${
                  isActive
                    ? 'border-brand-blue bg-brand-blue/15 text-brand-indigo'
                    : 'border-border bg-surface-raised text-ink-muted hover:border-border-strong hover:text-ink'
                }`}
              >
                {cat.icon}
                <span className="text-xs font-medium">{cat.label}</span>
              </button>
            )
          })}
        </div>
        )}

        <div className={filtersVisible ? "grid lg:grid-cols-[280px_1fr] gap-7 items-start" : ""}>
          {/* Sidebar, desktop */}
          {filtersVisible && (
          <aside className="hidden lg:block">
            <FilterSidebar />
          </aside>
          )}

          {/* Main content */}
          <div className="min-w-0">

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-ink-subtle">Filters:</span>
                {filters.brands.map(b => (
                  <button key={b} onClick={() => filters.toggleArrayFilter('brands', b)}
                    className="badge badge-grey hover:bg-border transition-colors">{b} ✕</button>
                ))}
                {filters.drivetrains.map(d => (
                  <button key={d} onClick={() => filters.toggleArrayFilter('drivetrains', d)}
                    className="badge badge-grey hover:bg-border transition-colors">{d} ✕</button>
                ))}
                {filters.federalCreditOnly && (
                  <button onClick={() => filters.setFilter('federalCreditOnly', false)}
                    className="badge badge-blue hover:bg-brand-blue/10 transition-colors">Tax credit only ✕</button>
                )}
                <button onClick={filters.resetFilters} className="text-xs text-brand-blue hover:underline ml-1">
                  Clear all
                </button>
              </div>
            )}

            {/* Sort bar */}
            {filtersVisible && (
            <div className="flex items-center justify-end gap-2 mb-4">
              <span className="text-sm text-ink-muted">Sort by</span>
              <select
                value={filters.sort}
                onChange={e => filters.setFilter('sort', e.target.value)}
                className="text-sm border border-border rounded-pill px-4 py-2 bg-surface-raised text-ink font-medium focus:outline-none focus:border-brand-blue cursor-pointer"
              >
                <option value="msrp_asc">{priceLowLabel}</option>
                <option value="msrp_desc">{priceHighLabel}</option>
                <option value="range_desc">Range: Most First</option>
                <option value="lease_asc">Lease: Low → High</option>
                <option value="payment_asc">Finance: Low → High</option>
                <option value="speed_asc">0–60: Fastest</option>
                <option value="efficiency_desc">Efficiency: Best First</option>
                <option value="cargo_desc">Cargo: Most First</option>
                <option value="expert_desc">Expert Rating: Highest First</option>
              </select>
            </div>
            )}

            {loading ? (
              <div className="flex flex-col gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton h-[116px] rounded-[20px]" />
                ))}
              </div>
            ) : paginated.length === 0 ? (
              <div className="text-center py-16 card">
                <h3 className="font-semibold text-ink mb-1">No vehicles match</h3>
                <p className="text-ink-muted text-sm mb-4">Try removing some filters.</p>
                <button onClick={filters.resetFilters} className="btn-secondary">Clear filters</button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {paginated.map(vehicle => (
                    <BrowseRow key={vehicle.id} vehicle={vehicle} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                      onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0) }}
                      disabled={page === 1}
                      className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                    >← Prev</button>
                    <span className="text-sm text-ink-muted px-2">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0) }}
                      disabled={page === totalPages}
                      className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                    >Next →</button>
                  </div>
                )}
              </>
            )}

            {/* Extended catalog, search the full ev-database.org dataset */}
            <div className="mt-10">
              <EvDatabaseSearch curatedIds={new Set(vehicles.map(v => v.id))} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface-raised border-l border-border overflow-y-auto p-5 shadow-xl">
            <FilterSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
