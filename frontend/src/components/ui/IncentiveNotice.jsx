/**
 * IncentiveNotice — demo-scope banner.
 *
 * For this demo the only incentives modeled are MANUFACTURER offers (cash / APR /
 * lease), scraped for New York (ZIP 10005). No state purchase rebate is applied.
 * Shown on the Matcher and Browse so the scope is unambiguous.
 */
export default function IncentiveNotice({ className = '' }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-status-yellow/30 bg-status-yellow-bg px-3 py-2 text-[12px] leading-snug text-status-yellow ${className}`}
      role="note"
    >
      <span aria-hidden="true"></span>
      <span>
        <strong>Demo scope:</strong> incentives shown are <strong>manufacturer offers
        for New York (ZIP&nbsp;10005)</strong> — cash, APR, and lease deals refreshed
        monthly. New York is the only state modeled here, and no state purchase
        rebate is applied; payments reflect the manufacturer incentive only.
      </span>
    </div>
  )
}
