import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEvDatabase } from '../../hooks/useEvDatabase'
import { formatCurrency } from '../../utils/formatCurrency'

/**
 * EvDatabaseSearch
 *
 * Lets the user search the full ev-database.org catalog (~1,350 vehicles).
 * Vehicles that are part of our curated /data/vehicles/{id}.json bundle
 * have a "Full data" badge; everything else links to the extended-catalog
 * page where the user can enter a custom purchase price and calculate TCO.
 */
export default function EvDatabaseSearch({ curatedIds = new Set() }) {
  const { catalog, loading, error } = useEvDatabase()
  const [q, setQ] = useState('')
  const [marketFilter, setMarketFilter] = useState('all')   // all | us | non-us
  const [statusFilter, setStatusFilter] = useState('current') // all | current | upcoming | archive

  const results = useMemo(() => {
    if (!catalog) return []
    const query = q.trim().toLowerCase()
    return catalog.vehicles
      .filter(v => {
        if (marketFilter === 'us' && !v.sold_in_us) return false
        if (marketFilter === 'non-us' && v.sold_in_us) return false
        if (statusFilter !== 'all' && v.status !== statusFilter) return false
        if (query && !v.name.toLowerCase().includes(query)) return false
        return true
      })
      .slice(0, 75)
  }, [catalog, q, marketFilter, statusFilter])

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-ink">Extended Catalog</h2>
          <p className="text-xs text-ink-subtle mt-0.5">
            {catalog
              ? `${catalog.count.toLocaleString()} vehicles from ev-database.org · ${catalog.us_count.toLocaleString()} sold in the US`
              : 'Loading catalog…'}
          </p>
        </div>
        <a
          href="https://ev-database.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-blue hover:underline"
        >
          Source: ev-database.org ↗
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="sm:col-span-1">
          <label className="section-label block mb-1.5">Search by name</label>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="e.g. Polestar 3, Renault 5"
            className="input-base"
            aria-label="Search EV catalog"
          />
        </div>
        <div>
          <label className="section-label block mb-1.5">Market</label>
          <select
            value={marketFilter}
            onChange={e => setMarketFilter(e.target.value)}
            className="input-base"
            aria-label="Filter by market"
          >
            <option value="all">All markets</option>
            <option value="us">Sold in US</option>
            <option value="non-us">Non-US only</option>
          </select>
        </div>
        <div>
          <label className="section-label block mb-1.5">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input-base"
            aria-label="Filter by status"
          >
            <option value="current">Current</option>
            <option value="upcoming">Upcoming</option>
            <option value="archive">Discontinued (used)</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="text-sm text-status-red bg-status-red-bg rounded-lg p-3 mb-3">
          Could not load extended catalog: {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-subtle mb-2">
            Showing {results.length.toLocaleString()} of {catalog?.count.toLocaleString()} matching
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map(v => (
              <CatalogResult key={v.id} v={v} curated={curatedIds.has(v.id)} />
            ))}
            {results.length === 0 && (
              <div className="col-span-full text-center py-10 text-sm text-ink-subtle">
                No vehicles match your search. Try a broader query.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CatalogResult({ v }) {
  const linkTo = `/catalog/${v.id}`
  return (
    <Link
      to={linkTo}
      className="block border border-border rounded-lg p-3 hover:border-brand-blue transition-colors bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm text-ink truncate">{v.name}</div>
          <div className="text-xs text-ink-subtle mt-0.5">
            {v.body_shape || 'Unknown body'} · {v.drivetrain || '-'} · {v.year_from || '-'}
            {v.year_to ? `–${v.year_to}` : ''}
          </div>
        </div>
        {!v.sold_in_us && (
          <span className="badge badge-yellow shrink-0 text-[10px] whitespace-nowrap">
            Non-US
          </span>
        )}
        {v.status === 'archive' && (
          <span className="badge badge-grey shrink-0 text-[10px]">Used</span>
        )}
        {v.status === 'upcoming' && (
          <span className="badge badge-blue shrink-0 text-[10px]">Upcoming</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Stat label="Range" value={v.range_mi ? `${v.range_mi} mi` : '-'} />
        <Stat label="Battery" value={v.battery_kwh ? `${v.battery_kwh} kWh` : '-'} />
        <Stat label="Est. MSRP" value={v.msrp_usd_estimate ? formatCurrency(v.msrp_usd_estimate) : '-'} />
      </div>

      {!v.sold_in_us && (
        <div className="text-[11px] text-status-yellow bg-status-yellow-bg rounded p-1.5 mt-2 leading-tight">
          Not sold in the US, pricing converted from EU listings.
        </div>
      )}
    </Link>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-ink-subtle uppercase tracking-wider">{label}</div>
      <div className="text-xs font-semibold text-ink mt-0.5 tabular-nums">{value}</div>
    </div>
  )
}
