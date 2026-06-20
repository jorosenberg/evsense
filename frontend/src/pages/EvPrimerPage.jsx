/**
 * EV Primer — "EV 101: Everything a first-time buyer needs to know"
 * Route: /ev-101
 *
 * Scannable guide structured as expandable sections. No jargon without explanation.
 */
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import GlossaryTip from '../components/ui/GlossaryTip'

const SECTIONS = [
  {
    id: 'cost',
    emoji: '💰',
    title: 'How much does an EV actually cost?',
    summary: 'MSRP is just the starting point. Here\'s what you\'ll really pay — and save.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <p>
          The sticker price of an EV is called the <GlossaryTip term="msrp">MSRP</GlossaryTip>. But what you pay at the dealer is different — it includes:
        </p>
        <ul className="space-y-2">
          {[
            ['Destination & delivery', '$1,095–$2,295 added by the manufacturer, non-negotiable. Every buyer pays the same.'],
            ['Dealer doc fee', '$0–$1,200 depending on the state. Always ask before signing.'],
            ['Sales tax', '0–9% of the vehicle price. Some states (NJ, WA, DC) exempt EVs entirely.'],
            ['Registration & title', '$50–$300+ depending on your state.'],
            ['EV road surcharge', '$50–$300/yr in 30+ states to replace lost gas tax revenue.'],
          ].map(([term, desc]) => (
            <li key={term} className="flex gap-2">
              <span className="text-ink shrink-0">→</span>
              <span><strong className="text-ink">{term}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <div className="bg-status-green-bg border border-status-green/30 rounded-xl p-4">
          <p className="font-semibold text-status-green mb-1">The good news: incentives can save you thousands</p>
          <ul className="space-y-1 text-status-green">
            <li>⚡ Most states offer $1,500–$5,000 in EV rebates or tax credits</li>
            <li>⚡ Some states have sales tax exemptions (WA, NJ, DC, others)</li>
            <li>⚡ Utility companies often give $250–$500 for installing a home charger</li>
            <li>⚡ Programs like Costco Auto can save $500–$2,000 below MSRP</li>
          </ul>
          <p className="mt-2 text-xs text-status-green">Use EVsense to see incentives for your specific state automatically.</p>
        </div>
        <p>
          <strong className="text-ink">Bottom line:</strong> On a $42,000 EV in California, your drive-away price might be $44,500 before any incentives — but after state + utility rebates, it could be $37,000 or less. Always calculate your net price, not the MSRP.
        </p>
      </div>
    ),
  },
  {
    id: 'range',
    emoji: '🔋',
    title: 'What does "EPA range" actually mean?',
    summary: 'The number on the window sticker is optimistic. Here\'s what to expect in real life.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <p>
          <GlossaryTip term="epa range">EPA range</GlossaryTip> is measured on a controlled test cycle — not real-world driving. In practice, most drivers see <strong className="text-ink">80–90% of the EPA number</strong>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Highway at 75+ mph', impact: '−15 to −25%', color: 'red', why: 'Air resistance increases with speed. Highway driving is harder on range than city driving — opposite of gas cars.' },
            { label: 'Cold weather (below 20°F)', impact: '−20 to −40%', color: 'red', why: 'Batteries are less efficient in cold. The heater also drains range. Lithium iron phosphate (LFP) batteries handle cold worse than NCM.' },
            { label: 'City driving', impact: '+5 to +15%', color: 'green', why: 'Regenerative braking recovers energy every time you slow down. EVs often exceed EPA range in stop-and-go traffic.' },
          ].map(({ label, impact, color, why }) => (
            <div key={label} className={`rounded-xl p-3 border ${color === 'green' ? 'border-status-green/30 bg-status-green-bg' : 'border-status-red/30 bg-status-red-bg'}`}>
              <div className={`text-xs font-semibold ${color === 'green' ? 'text-status-green' : 'text-status-red'} mb-1`}>{impact}</div>
              <div className="text-xs font-medium text-ink mb-1">{label}</div>
              <div className={`text-[11px] ${color === 'green' ? 'text-status-green' : 'text-status-red'}`}>{why}</div>
            </div>
          ))}
        </div>
        <p>
          <strong className="text-ink">Rule of thumb:</strong> For comfortable daily use, your target range should be at least 1.5× your daily round-trip commute. For a 60-mile commute, aim for 90+ miles of real-world range — so at least 110 miles EPA.
        </p>
        <p>
          <strong className="text-ink">For road trips:</strong> Most EV owners plan charging stops every 150–200 miles (80% charge). A 300-mile EPA range EV can typically do 2–2.5 hours between 20-minute charging stops on a road trip.
        </p>
      </div>
    ),
  },
  {
    id: 'charging',
    emoji: '⚡',
    title: 'How does charging work?',
    summary: 'There are three levels of charging. 90% of your charging will happen at home.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              level: 'Level 1',
              sub: 'Standard wall outlet (120V)',
              speed: '3–5 miles/hour',
              cost: 'Free (use existing outlet)',
              best: 'PHEVs, very low daily miles',
              note: 'Too slow for most EV owners. A full charge from empty takes 3–4 days.',
              color: 'bg-yellow-50 border-yellow-200',
            },
            {
              level: 'Level 2',
              sub: 'Home or public (240V)',
              speed: '15–30 miles/hour',
              cost: '$400–$1,500 installed at home',
              best: 'Daily home charging (recommended)',
              note: 'Full charge overnight in 4–10 hours. Most EV owners never need public fast charging.',
              color: 'bg-brand-blue/15 border-brand-blue/30',
            },
            {
              level: 'DC Fast Charging',
              sub: 'Supercharger / EA / EVgo (480V+)',
              speed: '100–800+ miles/hour',
              cost: '35–55¢/kWh (~$20–$35 per session)',
              best: 'Road trips, emergencies',
              note: '20–40 min for 80%. Costs 2–3× home charging. Frequent use can accelerate battery degradation.',
              color: 'bg-status-green-bg border-status-green/30',
            },
          ].map(({ level, sub, speed, cost, best, note, color }) => (
            <div key={level} className={`rounded-xl p-4 border ${color}`}>
              <div className="font-semibold text-ink mb-0.5">{level}</div>
              <div className="text-[11px] text-ink-subtle mb-2">{sub}</div>
              <div className="text-xs space-y-1">
                <div><span className="font-medium text-ink">Speed:</span> {speed}</div>
                <div><span className="font-medium text-ink">Cost:</span> {cost}</div>
                <div><span className="font-medium text-ink">Best for:</span> {best}</div>
              </div>
              <p className="text-[11px] text-ink-muted mt-2 border-t border-current/10 pt-2">{note}</p>
            </div>
          ))}
        </div>
        <div className="bg-brand-blue-light border border-brand-blue/20 rounded-xl p-4">
          <p className="text-sm font-semibold text-brand-blue mb-1">💡 The single biggest EV cost tip</p>
          <p className="text-xs text-brand-blue/80">
            If you can charge at home, your fuel cost drops to roughly $0.04–0.07/mile — vs. $0.12–0.18/mile for a gas car.
            Ask your utility about a <GlossaryTip term="tou rate"><span className="text-brand-blue font-medium underline underline-offset-2">time-of-use rate</span></GlossaryTip> — charging overnight (9pm–6am) typically costs 5–10¢/kWh instead of 14–25¢.
            That alone can save $600–$1,200/year.
          </p>
        </div>
        <p>
          <strong className="text-ink">Charging network:</strong> Most 2025 EVs use <GlossaryTip term="nacs">NACS</GlossaryTip> (formerly Tesla's connector), giving access to 20,000+ Superchargers. Older EVs use <GlossaryTip term="ccs1">CCS1</GlossaryTip> — a $200 adapter provides Supercharger access.
        </p>
      </div>
    ),
  },
  {
    id: 'lease-vs-finance',
    emoji: '📄',
    title: 'Should I lease or finance?',
    summary: 'Leasing an EV is often smarter than you think — especially for entry-level models.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <p>
          The right answer depends on your mileage, how long you keep cars, and whether the manufacturer is offering a subsidized lease.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4">
            <h4 className="font-semibold text-ink mb-2">Leasing makes sense when…</h4>
            <ul className="space-y-1.5 text-xs">
              {[
                'You drive under 12,000–15,000 miles/year',
                'You like upgrading every 2–3 years (tech moves fast)',
                'The manufacturer is offering a low money factor (subvented lease)',
                'You\'re not sure EV ownership is right for you yet',
                'Your state doesn\'t allow tax credit stacking on purchases',
                'You want lower monthly payments without a big down payment',
              ].map(s => <li key={s} className="flex gap-1.5"><span className="text-status-green shrink-0">✓</span>{s}</li>)}
            </ul>
          </div>
          <div className="card p-4">
            <h4 className="font-semibold text-ink mb-2">Financing makes sense when…</h4>
            <ul className="space-y-1.5 text-xs">
              {[
                'You drive 15,000+ miles/year (excess mileage fees add up)',
                'You plan to keep the car 5+ years',
                'You want to build equity / eventually own it outright',
                'You want to modify the vehicle (lease restrictions)',
                'You can get 0% or very low APR financing',
                'You want V2L / bidirectional charging (V2H requires ownership)',
              ].map(s => <li key={s} className="flex gap-1.5"><span className="text-brand-blue shrink-0">→</span>{s}</li>)}
            </ul>
          </div>
        </div>
        <div className="bg-status-yellow-bg border border-status-yellow/30 rounded-xl p-4 text-xs text-status-yellow">
          <p className="font-semibold mb-1">⚠ Watch out for these lease gotchas</p>
          <ul className="space-y-1">
            <li>• <strong><GlossaryTip term="acquisition fee">Acquisition fee</GlossaryTip>:</strong> $695–$1,095, rarely negotiable, due at signing</li>
            <li>• <strong><GlossaryTip term="disposition fee">Disposition fee</GlossaryTip>:</strong> $300–$500 when you return the car (waived if you re-lease same brand)</li>
            <li>• <strong>Excess mileage:</strong> 20–30¢/mile over the cap — $600–$900 extra for 3,000 over-miles</li>
            <li>• <strong><GlossaryTip term="cap cost reduction">Cap cost reduction</GlossaryTip>:</strong> Cash you put down on a lease is lost if the car is totaled</li>
          </ul>
        </div>
        <p>
          <strong className="text-ink">Key number to know:</strong> A "good" lease deal follows the 1% rule — monthly payment is ≤1% of MSRP. A $40,000 car should lease for ≤$400/month. If it's higher, ask why or walk away. Use EVsense's lease calculator to check the <GlossaryTip term="money factor">money factor</GlossaryTip> against market rates.
        </p>
      </div>
    ),
  },
  {
    id: 'maintenance',
    emoji: '🔧',
    title: 'What maintenance does an EV need?',
    summary: 'Far less than a gas car. No oil changes, fewer brake jobs, simpler drivetrain.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'No oil changes', icon: '✅', desc: 'EVs have no engine oil. Save $120–$200/yr.' },
            { label: 'No spark plugs', icon: '✅', desc: 'No combustion = no ignition system.' },
            { label: 'Fewer brake jobs', icon: '✅', desc: 'Regenerative braking extends brake life 2–4×.' },
            { label: 'No transmission service', icon: '✅', desc: 'Single-speed motors need no transmission fluid.' },
            { label: 'No timing belt', icon: '✅', desc: 'Another expensive repair eliminated.' },
            { label: 'No catalytic converter', icon: '✅', desc: 'No exhaust system to maintain or replace.' },
          ].map(({ label, icon, desc }) => (
            <div key={label} className="flex gap-2 bg-status-green-bg border border-status-green/30 rounded-lg p-3">
              <span className="text-lg shrink-0">{icon}</span>
              <div>
                <div className="text-xs font-semibold text-status-green">{label}</div>
                <div className="text-[11px] text-status-green mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p><strong className="text-ink">What you still need:</strong> Tire rotation ($60–$80, every 5–7k miles), cabin air filter ($20–$40/yr), windshield wipers, washer fluid. Battery coolant flush every 5 years on some models.</p>
        <p><strong className="text-ink">Average annual maintenance cost:</strong> ~$900 for EV vs. ~$1,500 for a comparable gas car (AAA 2024). Over 5 years, that's $3,000 in savings before counting the cost differences.</p>
        <p>
          <strong className="text-ink">Battery warranty:</strong> All major manufacturers cover <GlossaryTip term="battery degradation">battery degradation</GlossaryTip> below 70% capacity for 8 years / 100,000 miles (required by federal law for EVs sold after 2023).
        </p>
      </div>
    ),
  },
  {
    id: 'depreciation',
    emoji: '📉',
    title: 'How fast do EVs depreciate?',
    summary: 'Faster than ICE cars historically — but the market is stabilizing.',
    content: (
      <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
        <p>
          <GlossaryTip term="depreciation">Depreciation</GlossaryTip> is the single largest cost of vehicle ownership for most people who eventually sell. EVs have historically depreciated faster than gas cars, but the gap is closing.
        </p>
        <div className="card p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left pb-2 text-ink-subtle font-normal">Vehicle</th>
                <th className="text-right pb-2 text-ink-subtle font-normal">3-yr depreciation</th>
                <th className="text-right pb-2 text-ink-subtle font-normal">5-yr depreciation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ['Tesla Model Y', '35%', '50%'],
                ['Tesla Model 3', '38%', '52%'],
                ['Hyundai IONIQ 5', '32%', '47%'],
                ['Kia EV6', '34%', '49%'],
                ['Ford Mustang Mach-E', '42%', '58%'],
                ['Average gas SUV', '40%', '55%'],
              ].map(([car, y3, y5]) => (
                <tr key={car}>
                  <td className="py-1.5 text-ink">{car}</td>
                  <td className="py-1.5 text-right text-ink-muted">{y3}</td>
                  <td className="py-1.5 text-right text-ink-muted">{y5}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-subtle mt-2">Source: iSeeCars, CarEdge depreciation data (2024). Approximate — actual values vary by trim, mileage, and market conditions.</p>
        </div>
        <p><strong className="text-ink">What affects depreciation most:</strong> Range (longer = holds value better), brand reputation, charging network access (NACS helps), and whether a federal tax credit is still available on newer models.</p>
        <p><strong className="text-ink">Leasing eliminates depreciation risk.</strong> If you lease, depreciation is the manufacturer's problem — you just pay for the decline. This is one reason leasing EVs makes financial sense for many buyers.</p>
      </div>
    ),
  },
  {
    id: 'first-steps',
    emoji: '🚦',
    title: 'First-time buyer checklist',
    summary: 'Five things to do before you walk into a dealer.',
    content: (
      <div className="space-y-3 text-sm text-ink-muted leading-relaxed">
        {[
          {
            step: '1',
            title: 'Know your actual budget',
            desc: 'Calculate your drive-away price including all fees, then subtract state incentives. Use EVsense\'s "What you\'ll actually pay" calculator on any vehicle page.',
          },
          {
            step: '2',
            title: 'Verify your incentive eligibility',
            desc: 'State rebates often have income caps and MSRP limits. Check your state\'s program directly before counting on any rebate. EVsense shows links to each program.',
          },
          {
            step: '3',
            title: 'Plan your home charging situation',
            desc: 'If you have a garage or driveway, get a Level 2 charger quote (typical: $400–$800 installed after utility rebates). If you live in an apartment, identify the 3 nearest public chargers.',
          },
          {
            step: '4',
            title: 'Test drive — and drive it on the highway',
            desc: 'Dealerships often demo in a parking lot. Insist on a highway test drive. This is where you\'ll feel the real-world range difference and charging anxiety (or lack thereof).',
          },
          {
            step: '5',
            title: 'Get the money factor in writing on any lease',
            desc: 'Dealers aren\'t required to disclose the money factor. Ask for it explicitly, multiply by 2,400, and compare to the current "buy rate" from third-party sources (Leasehackr, EVsense).',
          },
        ].map(({ step, title, desc }) => (
          <div key={step} className="flex gap-3 p-4 bg-surface-raised border border-border rounded-xl">
            <div className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</div>
            <div>
              <div className="font-semibold text-ink text-sm">{title}</div>
              <div className="text-xs text-ink-muted mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
]

function AccordionSection({ section, isOpen, onToggle }) {
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface-sunken transition-colors"
      >
        <span className="text-2xl shrink-0">{section.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink">{section.title}</div>
          <div className="text-xs text-ink-muted mt-0.5 truncate">{section.summary}</div>
        </div>
        <svg
          className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border pt-4">
              {section.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function EvPrimerPage() {
  const [openId, setOpenId] = useState('cost') // default first open

  function toggle(id) {
    setOpenId(prev => prev === id ? null : id)
  }

  return (
    <>
      <Helmet>
        <title>EV 101: First-Time Buyer's Guide to Electric Vehicles | EVsense</title>
        <meta name="description" content="Everything a first-time EV buyer needs to know — real costs, range explained, charging demystified, lease vs. finance, and a pre-dealer checklist. No jargon." />
      </Helmet>

      <div className="relative overflow-hidden animate-screen-in">
        {/* Ambient blobs */}
        <div className="absolute -top-32 -right-24 w-[460px] h-[460px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(47,91,255,.10), transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-28 w-[420px] h-[420px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(207,244,74,.12), transparent 70%)' }} />

        <div className="relative z-[1] max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-brand-blue/15 text-brand-indigo text-xs font-semibold px-3 py-1 rounded-pill mb-4">
            📖 First-time buyer's guide
          </div>
          <h1 className="font-display text-display-lg text-ink mb-3">EV <span className="italic text-brand-indigo">101</span></h1>
          <p className="text-ink-muted text-lg leading-relaxed">
            Everything a first-time buyer needs to know — in plain English.
            No dealership jargon, no hidden fees, no surprises.
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to="/matcher" className="btn-primary">⚡ Find My EV →</Link>
            <Link to="/browse" className="btn-secondary">Browse All EVs</Link>
          </div>
        </div>

        {/* Reading time */}
        <p className="text-xs text-ink-subtle mb-6 flex items-center gap-1.5">
          <span>⏱</span> About 5 minutes to read · Click any section to expand
        </p>

        {/* Accordion sections */}
        <div className="space-y-3">
          {SECTIONS.map(section => (
            <AccordionSection
              key={section.id}
              section={section}
              isOpen={openId === section.id}
              onToggle={() => toggle(section.id)}
            />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 card p-6 text-center">
          <div className="text-3xl mb-3">🚗</div>
          <h2 className="font-serif text-display-md text-ink mb-2">Ready to find your EV?</h2>
          <p className="text-ink-muted text-sm mb-5">Answer 5 questions and get matched with your top 3 vehicles — with real cost estimates for your state.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/matcher" className="btn-primary px-6 py-3">⚡ Start EV Matcher →</Link>
            <Link to="/browse" className="btn-secondary px-6 py-3">Browse All EVs</Link>
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
