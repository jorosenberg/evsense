import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { costPer1000Miles } from '../../utils/chargingCostCalculator'
import { formatCurrency } from '../../utils/formatCurrency'

const RATES = [0.10, 0.15, 0.20, 0.25, 0.30]
const COLORS = ['#2F5BFF', '#00C86E', '#F59E0B', '#DC2626', '#7C3AED', '#0891B2']

const DEFAULT_VEHICLES = [
  'tesla-model-3-2024',
  'hyundai-ioniq-6-2024',
  'chevrolet-equinox-ev-2024',
  'ford-mustang-mach-e-2024',
  'kia-ev6-2024',
  'rivian-r1t-2024',
]

export default function ElectricityCostChart({ vehicles = [], selectedIds = null }) {
  const eligibleVehicles = vehicles.filter((v) => v.milesPerKwh && !v.comingSoon)

  const [selected, setSelected] = useState(
    selectedIds || DEFAULT_VEHICLES.filter((id) => eligibleVehicles.find((v) => v.id === id))
  )

  const selectedVehicles = selected
    .map((id) => eligibleVehicles.find((v) => v.id === id))
    .filter(Boolean)
    .slice(0, 6)

  const chartData = useMemo(() =>
    RATES.map((rate) => {
      const entry = { rate: `$${rate.toFixed(2)}/kWh` }
      selectedVehicles.forEach((v) => {
        entry[v.id] = Math.round(costPer1000Miles(v.milesPerKwh, rate))
      })
      return entry
    }), [selectedVehicles]
  )

  function toggleVehicle(id) {
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id))
    } else if (selected.length < 6) {
      setSelected([...selected, id])
    }
  }

  function handleShare() {
    const url = new URL(window.location.href)
    url.pathname = '/tools/charging-cost-chart'
    url.searchParams.set('v', selected.join(','))
    navigator.clipboard.writeText(url.toString()).then(() => {
      alert('Chart URL copied to clipboard!')
    })
  }

  if (eligibleVehicles.length === 0) {
    return <div className="text-sm text-ink-muted py-8 text-center">Loading vehicle data…</div>
  }

  return (
    <div>
      {/* Vehicle selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {eligibleVehicles.map((v, i) => {
          const idx = selected.indexOf(v.id)
          const isSelected = idx !== -1
          const color = isSelected ? COLORS[idx] : undefined
          return (
            <button
              key={v.id}
              onClick={() => toggleVehicle(v.id)}
              disabled={!isSelected && selected.length >= 6}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                isSelected
                  ? 'text-white font-medium'
                  : 'border-border text-ink-muted hover:border-brand-blue hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              style={isSelected ? { backgroundColor: color, borderColor: color } : undefined}
            >
              {v.year} {v.make} {v.model}
            </button>
          )
        })}
      </div>

      {selectedVehicles.length === 0 ? (
        <div className="text-sm text-ink-muted text-center py-8">Select at least one vehicle above</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262D3D" vertical={false} />
              <XAxis dataKey="rate" tick={{ fontSize: 11, fill: '#8A909B' }} />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 11, fill: '#8A909B' }}
                label={{ value: 'Cost / 1,000 mi', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#8A909B', dy: 50 }}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = selectedVehicles.find((v) => v.id === name)
                  return [`$${value}`, v ? `${v.year} ${v.make} ${v.model}` : name]
                }}
                contentStyle={{ fontSize: 12, border: '1px solid #262D3D', borderRadius: 8 }}
              />
              <Legend
                formatter={(value) => {
                  const v = selectedVehicles.find((v) => v.id === value)
                  return v ? `${v.year} ${v.make} ${v.model}` : value
                }}
                wrapperStyle={{ fontSize: 11 }}
              />
              {selectedVehicles.map((v, i) => (
                <Bar key={v.id} dataKey={v.id} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Efficiency table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-3 text-ink-subtle font-medium">Vehicle</th>
                  <th className="text-right py-2 px-2 text-ink-subtle font-medium">Efficiency</th>
                  {RATES.map((r) => (
                    <th key={r} className="text-right py-2 px-2 text-ink-subtle font-medium">${r.toFixed(2)}/kWh</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedVehicles.map((v, i) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: COLORS[i] }} />
                      {v.year} {v.make} {v.model}
                    </td>
                    <td className="py-2 px-2 text-right text-ink-muted">{v.milesPerKwh} mi/kWh</td>
                    {RATES.map((r) => (
                      <td key={r} className="py-2 px-2 text-right tabular-nums">
                        {formatCurrency(costPer1000Miles(v.milesPerKwh, r))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-3">
            <button onClick={handleShare} className="btn-ghost text-xs">
              Copy shareable link
            </button>
          </div>
        </>
      )}
    </div>
  )
}
