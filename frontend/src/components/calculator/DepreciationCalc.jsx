import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrency } from '../../utils/formatCurrency'

export function DepreciationChart({ data, ownershipYears }) {
  if (!data?.curve) return null

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data.curve} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262D3D" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A909B' }} />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#8A909B' }}
          />
          <Tooltip
            formatter={(value) => [formatCurrency(value), 'Vehicle Value']}
            contentStyle={{ fontSize: 12, border: '1px solid #262D3D', borderRadius: 8 }}
          />
          {ownershipYears && (
            <ReferenceLine
              x={`Year ${ownershipYears}`}
              stroke="#2F5BFF"
              strokeDasharray="4 4"
              label={{ value: 'Sell', fontSize: 11, fill: '#2F5BFF', position: 'insideTopRight' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#2F5BFF"
            strokeWidth={2}
            dot={{ r: 4, fill: '#2F5BFF' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="bg-surface-sunken rounded-lg p-3">
          <div className="text-xs text-ink-subtle">Purchase Value</div>
          <div className="font-semibold text-sm">{formatCurrency(data.initialValue)}</div>
        </div>
        <div className="bg-surface-sunken rounded-lg p-3">
          <div className="text-xs text-ink-subtle">Resale Value</div>
          <div className="font-semibold text-sm">{formatCurrency(data.finalValue)}</div>
        </div>
        <div className="bg-surface-sunken rounded-lg p-3">
          <div className="text-xs text-ink-subtle">Total Loss</div>
          <div className="font-semibold text-sm text-status-red">−{formatCurrency(data.totalLoss)}</div>
        </div>
      </div>
    </div>
  )
}
