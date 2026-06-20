/**
 * smartChargePrograms.js
 *
 * Utility smart charge programs by state that reward off-peak EV charging.
 * These programs pay EV owners to charge during low-demand hours (typically 10pm–6am).
 *
 * Source: Utility websites, SEPA (Smart Electric Power Alliance) database.
 * Last verified: 2025-01
 *
 * Note: Programs change frequently. Always verify at the utility's website.
 */

export const SMART_CHARGE_PROGRAMS = [
  {
    id: 'con-ed-smart-charge-ny',
    name: 'Con Edison Smart Charge NY',
    state: 'NY',
    utilities: ['Con Edison', 'ConEd'],
    description: 'Earn up to $150/year for charging off-peak (10pm–6am). Free smart charger available for qualifying customers.',
    annualEarnings: { min: 50, max: 150 },
    offPeakHours: '10pm–6am',
    signupUrl: 'https://smartchargeny.com',
    requiresSmartCharger: true,
    freeChargerOffered: true,
  },
  {
    id: 'pge-ev2a',
    name: 'PG&E EV2-A Time-of-Use Rate',
    state: 'CA',
    utilities: ['PG&E', 'Pacific Gas and Electric'],
    description: 'Dedicated EV TOU rate with off-peak charging as low as $0.12/kWh (vs. $0.42+ peak). Best for overnight home charging.',
    offPeakRate: 12.0,
    peakRate: 42.0,
    offPeakHours: '11pm–7am (weekdays), all day weekends',
    signupUrl: 'https://www.pge.com/en_US/residential/rate-plans/rate-plan-options/electric-vehicle-base-plan',
    requiresSmartCharger: false,
  },
  {
    id: 'sce-tou-ev-1',
    name: 'SCE TOU-EV-1',
    state: 'CA',
    utilities: ['SCE', 'Southern California Edison'],
    description: 'EV-specific TOU rate. Off-peak nights and weekends significantly cheaper than peak daytime.',
    offPeakRate: 13.0,
    peakRate: 45.0,
    offPeakHours: '9pm–9am weekdays, all day weekends',
    signupUrl: 'https://www.sce.com/residential/rates/Time-Of-Use-Residential-Rate-Plans',
    requiresSmartCharger: false,
  },
  {
    id: 'sdge-ev-tou',
    name: 'SDG&E EV TOU Rate',
    state: 'CA',
    utilities: ['SDG&E', 'San Diego Gas & Electric'],
    description: 'Super off-peak rate from midnight to 6am. Excellent for overnight charging.',
    offPeakRate: 11.0,
    peakRate: 52.0,
    offPeakHours: 'Midnight–6am (super off-peak)',
    signupUrl: 'https://www.sdge.com/clean-energy/electric-vehicles/ev-rates',
    requiresSmartCharger: false,
  },
  {
    id: 'xcel-ev-accelerate',
    name: 'Xcel Energy EV Accelerate at Home',
    state: 'CO',
    utilities: ['Xcel Energy'],
    description: 'Xcel provides a smart Level 2 charger and charges ~$0.10/kWh for managed overnight charging. Flat monthly fee.',
    offPeakRate: 10.0,
    monthlyFee: 30,
    description: 'Flat $30/month includes smart charger rental and unlimited managed overnight charging.',
    offPeakHours: '9pm–9am',
    signupUrl: 'https://www.xcelenergy.com/ev',
    requiresSmartCharger: true,
    freeChargerOffered: true,
  },
  {
    id: 'pse-ev-advantage',
    name: 'Puget Sound Energy EV Advantage',
    state: 'WA',
    utilities: ['PSE', 'Puget Sound Energy'],
    description: 'Off-peak EV rate of ~$0.07/kWh overnight. Washington hydro power makes this one of the cheapest in the country.',
    offPeakRate: 7.0,
    peakRate: 16.0,
    offPeakHours: '10pm–6am',
    signupUrl: 'https://www.pse.com/en/pages/products-and-services/electric-vehicles',
    requiresSmartCharger: false,
  },
  {
    id: 'duke-ev-advantage',
    name: 'Duke Energy EV Advantage Rate',
    state: 'NC',
    utilities: ['Duke Energy'],
    description: 'Dedicated EV meter with low overnight rates. Duke covers most of the Carolinas.',
    offPeakRate: 9.0,
    offPeakHours: '9pm–9am',
    signupUrl: 'https://www.duke-energy.com/home/products/electric-vehicles',
    requiresSmartCharger: false,
  },
  {
    id: 'comed-hourly-pricing',
    name: 'ComEd Real-Time Pricing',
    state: 'IL',
    utilities: ['ComEd', 'Commonwealth Edison'],
    description: 'Hourly market pricing — can be very cheap overnight (under $0.05/kWh) but variable. Best with a smart charger that auto-schedules.',
    offPeakRate: 5.0, // approximate average overnight
    offPeakHours: 'Variable — typically cheapest 10pm–6am',
    signupUrl: 'https://hourlypricing.comed.com',
    requiresSmartCharger: true,
    variable: true,
  },
  {
    id: 'fpl-ev-rate',
    name: 'FPL EV TOU Rate',
    state: 'FL',
    utilities: ['FPL', 'Florida Power & Light'],
    description: 'EV-specific time-of-use rate with off-peak savings.',
    offPeakRate: 9.0,
    offPeakHours: '11pm–7am',
    signupUrl: 'https://www.fpl.com/clean-energy/electric-vehicles.html',
    requiresSmartCharger: false,
  },
  {
    id: 'georgia-power-evrate',
    name: 'Georgia Power Plug-In Electric Vehicle Rate',
    state: 'GA',
    utilities: ['Georgia Power'],
    description: 'Separate EV meter with off-peak charging savings.',
    offPeakRate: 9.0,
    offPeakHours: '11pm–7am',
    signupUrl: 'https://www.georgiapower.com/home/products-and-services/electric-vehicles',
    requiresSmartCharger: false,
  },
]

/**
 * Get smart charge programs available for a given state.
 */
export function getSmartChargePrograms(stateAbbr) {
  if (!stateAbbr) return []
  return SMART_CHARGE_PROGRAMS.filter(p => p.state === stateAbbr.toUpperCase())
}
