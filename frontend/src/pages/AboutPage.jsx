import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About EVsense | EV Buyer's Guide</title>
        <meta
          name="description"
          content="EVsense is a free, open-source EV buyer's guide for understanding the real total cost of owning an electric vehicle."
        />
      </Helmet>

      <div className="relative overflow-hidden animate-screen-in">
        {/* Ambient blobs */}
        <div className="absolute -top-32 -right-24 w-[440px] h-[440px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(47,91,255,.10), transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-28 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(107,92,255,.12), transparent 70%)' }} />

        <div className="relative z-[1] max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-display text-display-md text-ink mb-2">About <span className="italic text-brand-indigo">EVsense</span></h1>
        <p className="text-ink-muted mb-6">A personal portfolio project, why it exists and how it works</p>

        <div className="card p-4 mb-10 text-sm text-ink-muted leading-relaxed">
          EVsense is a <span className="text-ink font-semibold">personal portfolio project</span>, not a commercial
          product. Everything you see is built from <span className="text-ink font-semibold">public, scraped data</span>,
          and every ownership cost is a <span className="text-ink font-semibold">close estimate</span> meant to help you
          reason about the numbers, not a quote, an offer, or financial advice.
        </div>

        <div className="prose prose-sm max-w-none space-y-8">
          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">The Problem</h2>
            <p className="text-ink-muted leading-relaxed">
              Most EV buying guides quote sticker prices. But the real cost of ownership includes
              charging infrastructure, electricity rates (which vary 4x across states), state incentives
              and fees, depreciation, insurance, and maintenance, none of which show up in a headline MSRP.
              At the same time, the tools that <em>do</em> model these costs are buried inside dealer
              websites with obvious conflicts of interest.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">What This Tool Does</h2>
            <p className="text-ink-muted leading-relaxed">
              EVsense gives you a single, honest monthly number that includes everything:
              your loan or lease payment, home charging cost at your state's electricity rate, public
              charging, insurance, maintenance, registration, dealer program savings, and the annual EV road use fee your state
              may levy. It applies your applicable federal and state incentives automatically based on
              your state and the vehicle's eligibility.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">Data Sources</h2>
            <ul className="space-y-2 text-ink-muted">
              {[
                ['Vehicle pricing & specs', 'Manufacturer websites (scraped annually via GitHub Actions + Playwright)'],
                ['EV specs (range, battery, charging)', 'DOE Alternative Fuels Data Center API (free, no key required)'],
                ['VIN & model validation', 'NHTSA vPIC API (free, no key required)'],
                ['Depreciation data', 'iSeeCars historical data'],
                ['Maintenance costs', 'RepairPal'],
                ['State electricity rates', 'EIA (Energy Information Administration) annual averages'],
                ['Federal tax credit eligibility', 'IRS Energy Credits Online, refreshed quarterly via manual workflow'],
                ['State incentives', 'DOE AFDC State Laws & Incentives API'],
                ['State fees & road taxes', 'Compiled from state DMV publications; last verified Jan 2025'],
              ].map(([source, description]) => (
                <li key={source} className="flex gap-2">
                  <span className="font-medium text-ink shrink-0">{source}:</span>
                  <span>{description}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">What This Tool Is Not</h2>
            <ul className="space-y-1.5 text-ink-muted list-disc list-inside">
              <li>Not affiliated with any manufacturer, dealer, or charging network</li>
              <li>Not a source of binding purchase quotes, always get a written quote from a dealer</li>
              <li>Not financial advice, consult a tax professional about federal and state credits</li>
              <li>Not real-time, pricing data is updated annually and may not reflect recent changes</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">Open Source</h2>
            <p className="text-ink-muted leading-relaxed">
              This project is open source. The scraper, frontend, and all data are published on GitHub.
              Pull requests welcome, especially for correcting state fee data, adding new vehicle scrapers,
              or updating incentive information.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-ink text-lg mb-2">A Note on EV Road Fees</h2>
            <p className="text-ink-muted leading-relaxed">
              This tool includes annual EV road use fees in its cost calculations. As of 2025, 31 states
              levy these fees ranging from $50 to $294/year. The stated rationale is to replace gas tax
              revenue that EVs don't generate. Critics, including many EV advocacy organizations, argue
              that some fee amounts are disproportionately high relative to actual road use, and that
              fossil fuel industry lobbying influenced several state legislatures in setting fee levels.
              We present the fees factually and let you draw your own conclusions.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex gap-3">
          <Link to="/browse" className="btn-primary">Browse EVs</Link>
          <Link to="/tools/charging-cost-chart" className="btn-secondary">Charging Cost Chart</Link>
        </div>
        </div>
      </div>
    </>
  )
}
