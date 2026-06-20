/**
 * LeaseCalcEstimate, shows the Edmunds lease-calculator-based estimate.
 *
 * Driven by scraped residual % + price (see utils/leaseCalcData). The monthly is
 * computed from those, so it's labeled an estimate, with the scrape assumptions
 * (Excellent credit, 10k mi/yr) surfaced.
 *
 * variant:
 *   "chip" , compact pill for Browse / Matcher cards
 *   "panel", full 24 & 36-mo breakdown for the detail page
 */
import { leaseCalcFor, leaseCalcBothTerms } from '../../utils/leaseCalcData'

function fmt(n) {
  return n == null ? '-' : `$${Math.round(n).toLocaleString()}`
}

export default function LeaseCalcEstimate({ rec, trimName = null, term = 36, variant = 'chip' }) {
  if (!rec || !rec.styles) return null

  if (variant === 'panel') {
    const both = leaseCalcBothTerms(rec, trimName)
    const any = both['36'] || both['24']
    if (!any) return null
    return (
      <div className="rounded-xl border border-border bg-surface-sunken p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="font-semibold text-ink text-sm">Lease estimate</h3>
          <span className="text-[11px] text-ink-subtle">Edmunds · {any.assumptions}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['24', '36'].map(t => {
            const e = both[t]
            return (
              <div key={t} className="rounded-lg bg-surface-raised border border-border p-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-subtle mb-1">{t} months</div>
                {e ? (
                  <>
                    <div className="text-lg font-semibold text-ink tabular-nums">
                      {fmt(e.monthly)}<span className="text-xs font-normal text-ink-muted">/mo est.</span>
                    </div>
                    <dl className="mt-2 space-y-0.5 text-[12px] text-ink-muted">
                      <div className="flex justify-between"><dt>Residual</dt><dd className="text-ink">{e.residualValue}%</dd></div>
                      <div className="flex justify-between"><dt>Taxes &amp; fees</dt><dd className="text-ink">{fmt(e.taxesAndFees)}</dd></div>
                      {e.cashIncentives > 0 && (
                        <div className="flex justify-between"><dt>Cash incentive</dt><dd className="text-ink">{fmt(e.cashIncentives)}</dd></div>
                      )}
                    </dl>
                  </>
                ) : <div className="text-sm text-ink-subtle">-</div>}
              </div>
            )
          })}
        </div>
        {!any.matchedTrim && (
          <p className="mt-2 text-[11px] text-ink-subtle">Showing the base trim; pick a trim above to refine.</p>
        )}
      </div>
    )
  }

  // chip
  const e = leaseCalcFor(rec, trimName, term)
  if (!e || e.monthly == null) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brand-blue-light text-brand-blue border border-brand-blue/30 px-2 py-0.5 text-[11px] font-medium cursor-help"
      title={`Edmunds lease estimate (${e.assumptions}, ${e.term} mo): ${e.residualValue}% residual, ${fmt(e.taxesAndFees)} taxes & fees${e.cashIncentives ? `, ${fmt(e.cashIncentives)} cash` : ''}. Monthly computed from residual + price.`}
    >
      ≈ {fmt(e.monthly)}/mo lease · {e.term}mo
    </span>
  )
}
