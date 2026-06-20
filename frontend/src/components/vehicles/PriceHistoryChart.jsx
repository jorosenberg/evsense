import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '../../utils/formatCurrency'

/**
 * PriceHistoryChart
 *
 * Renders a vehicle's MSRP history over time using the `priceHistory` array
 * from Firestore (populated by price_processor.py on each scrape run).
 *
 * If there's only one data point (first scrape, no history yet), shows
 * a neutral "no history yet" state instead of a flat line.
 *
 * Props:
 *   priceHistory  {Array}  [{ date: ISO string, msrp: number }, ...]
 *   currentMsrp   {number} Current MSRP (for the final reference point)
 *   make          {string}
 *   model         {string}
 */
export default function PriceHistoryChart({ priceHistory = [], currentMsrp, make, model }) {
  const data = useMemo(() => {
    if (!priceHistory.length && !currentMsrp) return []

    const points = [...priceHistory]

    // Ensure current MSRP is always the last point
    if (currentMsrp) {
      const lastEntry = points[points.length - 1]
      if (!lastEntry || lastEntry.msrp !== currentMsrp) {
        points.push({ date: new Date().toISOString(), msrp: currentMsrp })
      }
    }

    return points.map((p, i) => ({
      index: i,
      date: formatChartDate(p.date),
      msrp: p.msrp,
      change: i > 0 ? p.msrp - points[i - 1].msrp : 0,
    }))
  }, [priceHistory, currentMsrp])

  if (data.length < 2) {
    return (
      <div className="border border-border rounded-lg p-5 text-center">
        <div className="text-2xl mb-2"></div>
        <p className="text-sm font-medium text-ink mb-1">Price History</p>
        <p className="text-xs text-ink-muted">
          {data.length === 1
            ? `Current MSRP: ${formatCurrency(data[0].msrp)} — price history will appear after multiple scrape runs.`
            : 'No price history available yet for this vehicle.'}
        </p>
      </div>
    )
  }

  const minMsrp = Math.min(...data.map(d => d.msrp))
  const maxMsrp = Math.max(...data.map(d => d.msrp))
  const priceRange = maxMsrp - minMsrp
  const hasChanged = priceRange > 0

  // Determine if price trended up, down, or flat overall
  const firstPrice = data[0].msrp
  const lastPrice = data[data.length - 1].msrp
  const netChange = lastPrice - firstPrice
  const trendColor = netChange < 0 ? '#00C86E' : netChange > 0 ? '#DC2626' : '#2F5BFF'
  const trendBg    = netChange < 0 ? '#F0FFF4' : netChange > 0 ? '#FEF2F2' : '#EEF4FF'

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="bg-surface-raised border border-border rounded-lg p-3 shadow-card text-xs">
        <div className="font-semibold text-ink mb-1">{d.date}</div>
        <div className="text-ink">{formatCurrency(d.msrp)} MSRP</div>
        {d.change !== 0 && (
          <div className={`mt-0.5 font-medium ${d.change < 0 ? 'text-status-green' : 'text-status-red'}`}>
            {d.change < 0 ? '▼' : '▲'} {formatCurrency(Math.abs(d.change))} from prev.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-raised">
        <div>
          <span className="font-semibold text-sm text-ink">MSRP History</span>
          <span className="text-xs text-ink-subtle ml-2">{make} {model}</span>
        </div>
        {hasChanged && (
          <div
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: trendColor, backgroundColor: trendBg }}
          >
            {netChange < 0 ? '▼' : '▲'}{' '}
            {formatCurrency(Math.abs(netChange))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 5, right: 12, left: 8, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={trendColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#262D3D" vertical={false} />

            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#8A909B' }}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#8A909B' }}
              tickLine={false}
              axisLine={false}
              domain={[
                Math.max(0, minMsrp - priceRange * 0.2),
                maxMsrp + priceRange * 0.2,
              ]}
              width={42}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Reference line at first tracked price */}
            {hasChanged && (
              <ReferenceLine
                y={firstPrice}
                stroke="#262D3D"
                strokeDasharray="4 4"
              />
            )}

            <Area
              type="monotone"
              dataKey="msrp"
              stroke={trendColor}
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={{ r: 4, fill: trendColor, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: trendColor, strokeWidth: 2, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Price change log */}
      {data.filter(d => d.change !== 0).length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="section-label mb-2">Price change log</div>
          <div className="space-y-1">
            {data.filter(d => d.change !== 0).map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-ink-subtle">{d.date}</span>
                <span className={`font-medium ${d.change < 0 ? 'text-status-green' : 'text-status-red'}`}>
                  {d.change < 0 ? '▼' : '▲'} {formatCurrency(Math.abs(d.change))}
                  {' '}→ {formatCurrency(d.msrp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatChartDate(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
