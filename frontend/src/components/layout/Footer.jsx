import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/favicon.png" alt="EVsense" className="w-7 h-7 rounded-[8px] object-contain shrink-0" />
              <span className="font-grotesk text-base font-bold">EVsense</span>
            </div>
            <p className="text-sm text-ink-muted max-w-sm leading-relaxed">
              A personal portfolio project exploring what an EV <em className="not-italic text-brand-indigo font-semibold">actually</em> costs
              to own, beyond the sticker price.
            </p>
            <p className="mt-3 text-xs text-ink-subtle leading-relaxed max-w-sm">
              Vehicle specs, prices and incentives are compiled from public, scraped sources and
              may be incomplete or out of date. Every ownership cost shown is a close estimate,
              not a quote, so treat the numbers as a guide, not financial advice.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">Explore</h3>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li><Link to="/browse" className="hover:text-ink transition-colors">Browse all EVs</Link></li>
              <li><Link to="/compare" className="hover:text-ink transition-colors">Compare vehicles</Link></li>
              <li><Link to="/matcher" className="hover:text-ink transition-colors">Find my EV</Link></li>
              <li><Link to="/tools/charging-cost-chart" className="hover:text-ink transition-colors">Charging cost chart</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">Reference</h3>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>
                <a href="https://www.irs.gov/clean-vehicle-tax-credits" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">
                  IRS EV tax credits ↗
                </a>
              </li>
              <li>
                <a href="https://afdc.energy.gov" target="_blank" rel="noopener noreferrer" className="hover:text-ink transition-colors">
                  DOE AFDC ↗
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs text-ink-subtle">
          <span>© {new Date().getFullYear()} EVsense, a personal portfolio project.</span>
          <span>Built from public data · costs are estimates, not quotes.</span>
        </div>
      </div>
    </footer>
  )
}
