/**
 * RefinePanel.jsx, Local-only refinement sliders for the Matcher results.
 *
 * Sits between the "Top matches" heading and the result cards. Adjusting any
 * slider re-filters + re-ranks the existing `matches` array in-memory, no API
 * calls, no re-scoring, sub-millisecond response.
 *
 * Defaults are "off" (no filter applied) so the initial result set matches
 * what the scoring engine produced. Users opt in to narrowing.
 */
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Off-state sentinel values
export const REFINE_DEFAULTS = Object.freeze({
  minRange:        0,        // mi
  maxMonthlyTco:   5000,     // $/mo
  luxuryMin:       0,        // 0–10
  minSeats:        2,
  maxZeroToSixty:  10.0,     // sec
  bodyTypes:       [],       // body-style filter ([] = any)
})

// Body styles the user can filter to (mirrors the Stage-1 preference).
const BODY_TYPES = [
  { value: 'suv',       label: 'SUV' },
  { value: 'sedan',     label: 'Sedan' },
  { value: 'truck',     label: 'Truck' },
  { value: 'van',       label: 'Van' },
  { value: 'hatchback', label: 'Hatchback' },
]

// Luxury tier labels for tick marks
const LUXURY_TICKS = [
  { value: 0,   label: 'Any' },
  { value: 2.5, label: 'Standard+' },
  { value: 4.5, label: 'Premium+' },
  { value: 6.5, label: 'Luxury+' },
  { value: 8.5, label: 'Ultra' },
]

function Slider({ label, hint, min, max, step, value, onChange, format, isActive }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-ink">
          {label}
          {hint && <span className="ml-1.5 text-ink-subtle text-[10px]">{hint}</span>}
        </label>
        <span className={`text-xs tabular-nums font-semibold ${isActive ? 'text-brand-blue' : 'text-ink-subtle'}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand-blue cursor-pointer"
      />
    </div>
  )
}

/**
 * @param {object} props
 * @param {number} props.totalCount      - vehicles before filtering
 * @param {number} props.filteredCount   - vehicles after filtering
 * @param {object} props.refinements     - current filter state
 * @param {function} props.onChange      - (partialRefinement) => void
 * @param {function} props.onReset       - () => void
 */
export default function RefinePanel({ totalCount, filteredCount, refinements, onChange, onReset }) {
  const [open, setOpen] = useState(false)

  const activeCount = useMemo(() => {
    let n = 0
    if (refinements.minRange       > REFINE_DEFAULTS.minRange)       n++
    if (refinements.maxMonthlyTco  < REFINE_DEFAULTS.maxMonthlyTco)  n++
    if (refinements.luxuryMin      > REFINE_DEFAULTS.luxuryMin)      n++
    if (refinements.minSeats       > REFINE_DEFAULTS.minSeats)       n++
    if (refinements.maxZeroToSixty < REFINE_DEFAULTS.maxZeroToSixty) n++
    if ((refinements.bodyTypes || []).length > 0)                   n++
    return n
  }, [refinements])

  const filteredOut = totalCount - filteredCount

  return (
    <div className="card overflow-hidden border-border mb-6">
      {/* Header bar, always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-ink">Refine results</span>
          {activeCount > 0 && (
            <span className="text-[11px] font-medium bg-brand-blue text-white rounded-full px-2 py-0.5">
              {activeCount} filter{activeCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-xs text-ink-muted tabular-nums">
          Showing <span className="font-semibold text-ink">{filteredCount}</span>
          <span className="text-ink-subtle"> of {totalCount}</span>
          {filteredOut > 0 && (
            <span className="ml-1.5 text-status-yellow">(−{filteredOut} hidden)</span>
          )}
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-border space-y-4 bg-surface-raised/40">
              {/* Range */}
              <Slider
                label="Min. EPA range"
                hint="(0 = no filter)"
                min={0} max={520} step={10}
                value={refinements.minRange}
                onChange={v => onChange({ minRange: v })}
                format={v => v === 0 ? 'Any' : `${v} mi`}
                isActive={refinements.minRange > 0}
              />

              {/* Body type */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink">Body type</label>
                  <span className={`text-xs tabular-nums font-semibold ${(refinements.bodyTypes || []).length ? 'text-brand-blue' : 'text-ink-subtle'}`}>
                    {(refinements.bodyTypes || []).length ? `${refinements.bodyTypes.length} selected` : 'Any'}
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {BODY_TYPES.map(b => {
                    const sel = (refinements.bodyTypes || []).includes(b.value)
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => {
                          const cur = refinements.bodyTypes || []
                          onChange({ bodyTypes: sel ? cur.filter(x => x !== b.value) : [...cur, b.value] })
                        }}
                        className={`text-[11px] font-medium py-1.5 rounded-lg border transition-colors ${
                          sel ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-border bg-surface-raised text-ink-muted hover:border-ink/30'
                        }`}
                      >
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Max monthly TCO */}
              <Slider
                label="Max all-in $/mo"
                hint="(includes charging, insurance, maint., fees)"
                min={400} max={5000} step={50}
                value={refinements.maxMonthlyTco}
                onChange={v => onChange({ maxMonthlyTco: v })}
                format={v => v >= 5000 ? 'No cap' : `$${v.toLocaleString()}`}
                isActive={refinements.maxMonthlyTco < REFINE_DEFAULTS.maxMonthlyTco}
              />

              {/* Luxury */}
              <div>
                <Slider
                  label="Min. luxury tier"
                  hint="(based on premium features)"
                  min={0} max={10} step={0.5}
                  value={refinements.luxuryMin}
                  onChange={v => onChange({ luxuryMin: v })}
                  format={v => {
                    const tick = [...LUXURY_TICKS].reverse().find(t => v >= t.value)
                    return tick ? tick.label : 'Any'
                  }}
                  isActive={refinements.luxuryMin > 0}
                />
                <div className="flex justify-between text-[9px] text-ink-subtle mt-0.5 px-0.5">
                  {LUXURY_TICKS.map(t => <span key={t.value}>{t.label.replace('+', '')}</span>)}
                </div>
              </div>

              {/* Seats */}
              <Slider
                label="Min. seating"
                min={2} max={8} step={1}
                value={refinements.minSeats}
                onChange={v => onChange({ minSeats: v })}
                format={v => v <= 2 ? 'Any' : `${v}+ seats`}
                isActive={refinements.minSeats > 2}
              />

              {/* 0-60 */}
              <Slider
                label="Max 0–60 mph time"
                hint="(faster = lower number)"
                min={2} max={10} step={0.5}
                value={refinements.maxZeroToSixty}
                onChange={v => onChange({ maxZeroToSixty: v })}
                format={v => v >= 10 ? 'Any' : `${v.toFixed(1)}s`}
                isActive={refinements.maxZeroToSixty < 10}
              />

              {activeCount > 0 && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onReset}
                    className="text-xs text-ink-muted hover:text-brand-blue underline-offset-2 hover:underline"
                  >
                    Reset all filters
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Apply refinements to a scored match array. Pure function, exported so tests
 * (and the page that uses RefinePanel) share one implementation.
 */
export function applyRefinements(matches, refinements) {
  if (!Array.isArray(matches)) return []
  const bodyTypes = refinements.bodyTypes || []
  return matches.filter(r => {
    const v = r.vehicle || {}
    const tco = r.tco || {}
    if ((v.rangeEpa || 0) < refinements.minRange) return false
    if ((tco.monthlyTco || 0) > refinements.maxMonthlyTco) return false
    const lux = r.luxuryScore ?? v.luxuryScoreEstimate ?? 3
    if (lux < refinements.luxuryMin) return false
    if ((v.seatingCapacity || 5) < refinements.minSeats) return false
    if ((v.zeroToSixty || 10) > refinements.maxZeroToSixty) return false
    if (bodyTypes.length > 0) {
      const ok = bodyTypes.includes(v.bodyStyle) || (bodyTypes.includes('van') && v.bodyStyle === 'minivan')
      if (!ok) return false
    }
    return true
  })
}
