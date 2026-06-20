/**
 * EstimateNotice, reusable "these are estimates" disclaimer shown across the
 * site wherever costs/figures appear. EVsense is a portfolio project built from
 * public, scraped data; nothing here is a quote, an offer, or financial advice.
 *
 * variant:
 *   'inline' (default), a soft note block to drop into a page
 *   'bar'             , a slim full-width strip
 *   'mini'            , a tiny one-liner for tight spots
 */
export default function EstimateNotice({ variant = 'inline', className = '' }) {
  if (variant === 'mini') {
    return (
      <p className={`text-[11px] text-ink-subtle leading-snug ${className}`}>
        Figures are EVsense estimates from public data, not quotes or financial advice.
      </p>
    )
  }

  if (variant === 'bar') {
    return (
      <div className={`flex items-center justify-center gap-2 text-center px-4 py-2 bg-brand-blue/10 border border-brand-blue/20 rounded-pill text-[12px] text-brand-indigo ${className}`} role="note">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
        <span><span className="font-semibold">Estimates only.</span> Every price, payment &amp; cost is an EVsense estimate from public, scraped data, not a quote or advice.</span>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg border border-border bg-surface-raised/60 px-3 py-2 text-[12px] leading-snug text-ink-subtle ${className}`} role="note">
      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
      <span>
        <span className="font-semibold text-ink-muted">Heads up:</span> every price, payment, and cost shown is a
        close estimate built from public, scraped data, not a quote, an offer, or financial advice.
        Verify with the dealer and manufacturer before buying.
      </span>
    </div>
  )
}
