import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Inline glossary tooltip for EV jargon.
 *
 * Usage:
 *   <GlossaryTip term="money factor" />         , renders underlined term + tooltip
 *   <GlossaryTip term="DCFC" label="DC Fast Charging" /> , custom display label
 *   <GlossaryTip term="TCO">Total Cost of Ownership</GlossaryTip> , children override label
 */

const GLOSSARY = {
  'money factor': {
    short: 'The lease equivalent of an interest rate, expressed as a small decimal (e.g. 0.00125). Multiply by 2,400 to convert to an approximate APR.',
    url: null,
  },
  'mf': {
    short: 'Money Factor, the lease equivalent of an interest rate. Multiply by 2,400 to get an approximate APR.',
    url: null,
  },
  'residual value': {
    short: "The vehicle's predicted value at the end of a lease term, set by the manufacturer. Higher residual = lower monthly payment.",
    url: null,
  },
  'residual': {
    short: "The vehicle's estimated value at lease end, expressed as a percentage of MSRP. A 55% residual on a $40,000 car means the car is predicted to be worth $22,000 in 3 years.",
    url: null,
  },
  'msrp': {
    short: "Manufacturer's Suggested Retail Price, the sticker price before any dealer markups, discounts, or incentives.",
    url: null,
  },
  'apr': {
    short: 'Annual Percentage Rate, the yearly interest rate on a loan. A 6% APR on a $35,000 loan over 60 months costs about $5,600 in total interest.',
    url: null,
  },
  'tco': {
    short: 'Total Cost of Ownership, the full 5-year cost of owning a vehicle including payments, fuel/charging, insurance, maintenance, registration fees, and depreciation.',
    url: null,
  },
  'dcfc': {
    short: 'DC Fast Charging, high-power charging (50–350 kW) that can add 150–200 miles in about 20–40 minutes. Also called Level 3. Typically 2–3× more expensive than home charging.',
    url: null,
  },
  'dc fast charging': {
    short: 'High-power charging (50–350 kW) that can add 150–200 miles in about 20–40 minutes. Typically 2–3× more expensive per mile than charging at home.',
    url: null,
  },
  'level 2': {
    short: 'Level 2 (L2) charging uses a 240V outlet, like a clothes dryer. Adds 15–30 miles per hour. The standard for home charging. A full installation costs $400–$1,500 after utility rebates.',
    url: null,
  },
  'l2': {
    short: 'Level 2 charging (240V), the standard for home EV charging. Adds 15–30 miles per hour. A home charger installation typically costs $400–$1,500.',
    url: null,
  },
  'kwh': {
    short: 'Kilowatt-hour, the unit of energy used to measure battery size and electricity consumption. A 75 kWh battery in a car is roughly equivalent to 2.5 gallons of gas worth of energy. Average home electricity costs 13–16¢ per kWh.',
    url: null,
  },
  'mi/kwh': {
    short: 'Miles per kilowatt-hour, the EV equivalent of MPG. Higher is more efficient. Average EVs get 3.0–4.5 mi/kWh. A 3.5 mi/kWh vehicle costs about $0.05/mile to charge at home (at 16¢/kWh).',
    url: null,
  },
  'miles per kwh': {
    short: 'The EV equivalent of MPG. Higher = more efficient and cheaper to fuel. Most EVs range from 2.8 to 5.0 mi/kWh. Compare with your state electricity rate to estimate your charging cost.',
    url: null,
  },
  'nacs': {
    short: "North American Charging Standard, Tesla's connector, now adopted by most US automakers. Gives native access to 20,000+ Tesla Superchargers. Vehicles with CCS1 connectors need a $200 adapter.",
    url: null,
  },
  'ccs1': {
    short: 'Combined Charging System, the non-Tesla DC fast charging standard used by most non-Tesla EVs until recently. CCS1 vehicles can use a $200 adapter for Tesla Superchargers. Most 2025+ EVs have switched to NACS.',
    url: null,
  },
  'chademo': {
    short: 'An older DC fast charging standard primarily used by Nissan LEAF. Being phased out; limited charger availability compared to NACS and CCS1.',
    url: null,
  },
  'epa range': {
    short: "Range certified by the U.S. Environmental Protection Agency under standardized test conditions. Real-world range is typically 10–20% lower, especially at highway speeds or in cold weather.",
    url: null,
  },
  'acquisition fee': {
    short: 'A one-time lease fee charged by the bank/leasing company, typically $695–$1,095. Usually cannot be negotiated. Sometimes called the "bank fee."',
    url: null,
  },
  'disposition fee': {
    short: 'A fee charged at lease end if you return the vehicle (rather than buying it out), typically $300–$500. Can sometimes be waived if you lease/buy again from the same brand.',
    url: null,
  },
  'cap cost': {
    short: 'Capitalized cost, the "selling price" of a leased vehicle. Reducing the cap cost (via cash down, rebates, or dealer discount) lowers your monthly payment.',
    url: null,
  },
  'cap cost reduction': {
    short: 'Cash, trade-in, or rebates applied upfront on a lease to lower the capitalized cost and reduce monthly payments. Unlike a purchase down payment, this money is lost if the car is stolen or totaled.',
    url: null,
  },
  'msd': {
    short: 'Multiple Security Deposits, an optional lease strategy where prepaying 1–10 extra monthly-payment-sized deposits reduces the money factor (interest rate). Returned at lease end. Not all brands allow it.',
    url: null,
  },
  'one-pay lease': {
    short: 'Paying the full lease cost upfront in one lump sum. Often reduces the effective interest rate significantly and eliminates monthly payment risk. Not ideal if the car is totaled early.',
    url: null,
  },
  'depreciation': {
    short: "The loss in a vehicle's value over time. EVs typically lose 20–30% of their value in year 1. Depreciation is the largest cost of owning a vehicle for most buyers who eventually sell.",
    url: null,
  },
  'v2l': {
    short: 'Vehicle-to-Load, the ability to power household appliances or tools directly from the car battery via an AC outlet (usually 120V/1.9 kW). Available on IONIQ 5, EV6, F-150 Lightning, Rivian R1T, Cybertruck.',
    url: null,
  },
  '800v architecture': {
    short: 'A high-voltage charging system (vs. the standard 400V) that allows much faster DC fast charging, typically 10→80% in 18 minutes. Found in Hyundai IONIQ 5/6, Kia EV6/EV9, Porsche Taycan, Lucid Air, Audi e-tron GT.',
    url: null,
  },
  'doc fee': {
    short: 'Dealer documentation fee, charged to prepare paperwork. Ranges from $0 to $1,200+ depending on state laws. Some states cap this fee; others do not. Always negotiate or shop around.',
    url: null,
  },
  'destination charge': {
    short: "A mandatory fee covering the cost of shipping the vehicle from factory to dealer, set by the manufacturer. Ranges from $1,095 to $2,295. Non-negotiable, every buyer pays the same amount.",
    url: null,
  },
  'ev road fee': {
    short: 'An annual fee charged by many states to EV owners to replace the lost gas tax revenue. Ranges from $50 (South Dakota) to $294/yr (Washington state). See your state DMV for the exact amount.',
    url: null,
  },
  'tou rate': {
    short: 'Time-of-Use rate, a utility pricing plan where electricity is cheaper during off-peak hours (typically 9pm–6am) and more expensive during peak hours. Most EV owners save $20–60/month by charging overnight on a TOU plan.',
    url: null,
  },
  'battery degradation': {
    short: "The gradual loss of a battery's capacity over time, reducing range. Typical degradation: 2–3% per year. Most manufacturers cover battery replacement if capacity falls below 70% within the warranty period (usually 8 years/100k miles).",
    url: null,
  },
  'bms': {
    short: 'Battery Management System, the onboard computer that monitors and controls battery charging, temperature, and state of health. Can be read by a technician to report battery capacity remaining.',
    url: null,
  },
}

export default function GlossaryTip({ term, label, children, placement = 'top' }) {
  const [visible, setVisible] = useState(false)
  const key = term?.toLowerCase()
  const entry = GLOSSARY[key]
  if (!entry) return <>{children || label || term}</>

  const displayText = children || label || term

  const positionClasses = placement === 'bottom'
    ? 'top-full mt-2 bottom-auto'
    : 'bottom-full mb-2 top-auto'

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        className="border-b border-dashed border-ink-subtle cursor-help hover:border-brand-blue hover:text-brand-blue transition-colors"
      >
        {displayText}
      </span>

      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: placement === 'bottom' ? -4 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: placement === 'bottom' ? -4 : 4 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 left-1/2 -translate-x-1/2 ${positionClasses} w-72 bg-ink text-white text-xs rounded-xl px-3.5 py-2.5 shadow-2xl pointer-events-none`}
          >
            <p className="font-semibold mb-1 capitalize">{term}</p>
            <p className="text-white/80 leading-relaxed">{entry.short}</p>
            {placement === 'top'
              ? <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
              : <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-ink" />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
