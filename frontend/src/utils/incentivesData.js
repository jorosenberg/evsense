/**
 * State EV incentive data, all 50 states + DC
 * Last updated: 2026-05
 *
 * Sources: DOE AFDC State Laws & Incentives, direct state program pages,
 *          NCSL EV legislation tracker, state DMV/DEP websites.
 *
 * Note: State programs change frequently. Always verify with the linked URL.
 * Income caps listed are household (not individual) unless noted.
 */

export const STATE_INCENTIVES = {
  AL: [], // No statewide EV purchase rebate as of 2026

  AK: [], // No statewide EV program

  AZ: [
    {
      name: 'APS / SRP EV Charger Rebate',
      amount: 250,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.aps.com/en/residential/rates-and-programs/electric-vehicles',
      notes: 'Offered by Arizona utilities, not the state. Varies by provider.',
      expiresAt: null,
    },
  ],

  AR: [], // No statewide EV rebate

  CA: [
    {
      name: 'Clean Vehicle Rebate Project (CVRP)',
      amount: 2000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 45000,
      incomeCapHousehold: 135000,
      url: 'https://cleanvehiclerebate.org',
      expiresAt: null,
      notes: 'Income-restricted. Lower-income households may qualify for up to $4,500. Funding availability varies.',
    },
    {
      name: 'Clean Cars 4 All (CC4A)',
      amount: 7500,
      type: 'rebate',
      appliesTo: ['new'],
      incomeCapHousehold: 57450,
      url: 'https://ww2.arb.ca.gov/our-work/programs/clean-cars-4-all',
      expiresAt: null,
      notes: 'Income-qualified only. Must scrap an older vehicle. Up to $12,000 if replacing a diesel vehicle.',
    },
    {
      name: 'EVSE Rebate, PG&E / SCE / SDG&E',
      amount: 500,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.pge.com/en_US/residential/rate-plans/rate-plan-options/electric-vehicle-base-plan',
      expiresAt: null,
      notes: 'Amount varies by utility. Check your specific utility provider.',
    },
  ],

  CO: [
    {
      name: 'Colorado EV Tax Credit',
      amount: 5000,
      type: 'tax_credit',
      appliesTo: ['new'],
      maxMsrp: 80000,
      url: 'https://cdphe.colorado.gov/ev',
      expiresAt: null,
      notes: 'Stackable with federal incentives. Additional income-qualified rebate of $2,500 via Xcel Energy.',
    },
    {
      name: 'Xcel Energy EV Rebate',
      amount: 500,
      type: 'rebate',
      appliesTo: ['new'],
      url: 'https://www.xcelenergy.com/programs_and_rebates/residential_programs_and_rebates/electric_vehicles',
      expiresAt: null,
      notes: 'Xcel Energy customers only.',
    },
  ],

  CT: [
    {
      name: 'CHEAPR, Connecticut Hydrogen and Electric Automobile Purchase Rebate',
      amount: 2250,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      url: 'https://www.ct.gov/deep/cwp/view.asp?a=4405&q=590430',
      expiresAt: null,
      notes: 'Standard rebate. Income-qualified buyers (≤300% FPL) may receive up to $9,500 via CHEAPR Enhanced.',
    },
    {
      name: 'CT Eversource / UI EV Charger Rebate',
      amount: 300,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.eversource.com/content/ct-c/residential/save-money-energy/clean-energy-options/electric-vehicles',
      expiresAt: null,
    },
  ],

  DE: [
    {
      name: 'Delaware Clean Vehicle Rebate Program',
      amount: 2500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      url: 'https://www.dnrec.delaware.gov/energy/Pages/Clean-Vehicle-Rebate.aspx',
      expiresAt: null,
      notes: 'Income-qualified buyers may receive up to $3,500.',
    },
  ],

  FL: [], // No statewide EV rebate as of 2026

  GA: [
    // State EV tax credit was repealed. No statewide rebate.
    {
      name: 'Georgia Power EV Charger Rebate',
      amount: 250,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.georgiapower.com/for-home/electric-vehicles.html',
      expiresAt: null,
      notes: 'Georgia Power customers only.',
    },
  ],

  HI: [
    {
      name: 'Hawaii EV Rebate (Act 200)',
      amount: 2500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 70000,
      url: 'https://energy.hawaii.gov/ev',
      expiresAt: null,
      notes: 'Subject to funding availability. Confirm with Hawaii Energy before purchase.',
    },
  ],

  ID: [], // No statewide EV rebate

  IL: [
    {
      name: 'Illinois EV Rebate (CHARGE Illinois)',
      amount: 4000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 55000,
      url: 'https://www2.illinois.gov/epa/topics/energy/electric-vehicles/Pages/default.aspx',
      expiresAt: null,
      notes: 'Subject to funding availability. Apply within 90 days of purchase.',
    },
    {
      name: 'ComEd EV Charger Rebate',
      amount: 300,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.comed.com/SmartEnergy/MyGreenPower/Pages/ElectricVehicles.aspx',
      expiresAt: null,
      notes: 'ComEd residential customers. Up to $750 for income-qualified.',
    },
  ],

  IN: [], // No statewide EV rebate

  IA: [], // No statewide EV rebate

  KS: [], // No statewide EV rebate

  KY: [], // No statewide EV rebate

  LA: [], // No statewide EV rebate

  ME: [
    {
      name: 'Efficiency Maine EV Rebate',
      amount: 2000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      url: 'https://www.efficiencymaine.com/ev-rebate/',
      expiresAt: null,
      notes: 'Standard rebate. Income-qualified (≤300% FPL) buyers receive up to $4,000. Used EV rebate also available.',
    },
    {
      name: 'Efficiency Maine Used EV Rebate',
      amount: 1000,
      type: 'rebate',
      appliesTo: ['used'],
      maxMsrp: 40000,
      url: 'https://www.efficiencymaine.com/ev-rebate/',
      expiresAt: null,
    },
  ],

  MD: [
    {
      name: 'Maryland Excise Tax Credit for EVs',
      amount: 3000,
      type: 'tax_credit',
      appliesTo: ['new'],
      maxMsrp: 50000,
      url: 'https://mva.maryland.gov/vehicles/Pages/Electric-Vehicle-Tax-Credit.aspx',
      expiresAt: null,
      notes: 'Applied as a credit against Maryland excise tax at time of titling. Stackable with federal incentives.',
    },
  ],

  MA: [
    {
      name: 'MOR-EV Plus Rebate',
      amount: 3500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 55000,
      url: 'https://mor-ev.org',
      expiresAt: null,
      notes: 'Income-qualified applicants may receive an additional $1,500.',
    },
    {
      name: 'MOR-EV Used EV Rebate',
      amount: 1500,
      type: 'rebate',
      appliesTo: ['used'],
      maxMsrp: 40000,
      url: 'https://mor-ev.org',
      expiresAt: null,
    },
  ],

  MI: [
    {
      name: 'DTE / Consumers Energy EV Rebate',
      amount: 500,
      type: 'rebate',
      appliesTo: ['new'],
      url: 'https://www.dteenergy.com/us/en/residential/electric-vehicles',
      expiresAt: null,
      notes: 'Offered by utilities, not the state. DTE Energy residential customers.',
    },
  ],

  MN: [
    {
      name: 'Minnesota EV Rebate (Drive Electric MN)',
      amount: 2500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 55000,
      incomeCapHousehold: 150000,
      url: 'https://mn.gov/pca/topics/transportation/electric-vehicles/',
      expiresAt: null,
      notes: 'Subject to funding availability. Income-qualified buyers (≤400% FPL) may receive up to $4,000.',
    },
  ],

  MS: [], // No statewide EV rebate

  MO: [], // No statewide EV rebate

  MT: [], // No statewide EV rebate

  NE: [], // No statewide EV rebate

  NV: [
    {
      name: 'NV Energy EV Charger Rebate',
      amount: 500,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.nvenergy.com/account-services/energy-saving-programs/residential-programs/electric-vehicles',
      expiresAt: null,
      notes: 'NV Energy residential customers only.',
    },
  ],

  NH: [], // No statewide EV purchase rebate (EV charger rebate via utilities)

  NJ: [
    {
      name: 'Charge Up New Jersey',
      amount: 4000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 45000,
      url: 'https://www.njcleanenergy.com/ev',
      expiresAt: null,
      notes: 'Point-of-sale rebate applied automatically at NJ dealers. Subject to funding.',
    },
    {
      name: 'NJ Sales Tax Exemption on EVs',
      amount: 0,
      type: 'tax_exemption',
      appliesTo: ['new'],
      url: 'https://www.nj.gov/treasury/taxation/index.shtml',
      notes: 'New Jersey exempts EVs from 6.625% state sales tax. Significant savings on most purchases.',
      expiresAt: null,
    },
  ],

  NM: [
    {
      name: 'New Mexico EV Tax Credit',
      amount: 3000,
      type: 'tax_credit',
      appliesTo: ['new'],
      maxMsrp: 55000,
      incomeCapHousehold: 150000,
      url: 'https://www.env.nm.gov/energy-minerals-and-natural-resources-department/',
      expiresAt: null,
      notes: 'Income limits apply. Used EV credit of $2,000 also available.',
    },
    {
      name: 'New Mexico Used EV Tax Credit',
      amount: 2000,
      type: 'tax_credit',
      appliesTo: ['used'],
      maxMsrp: 25000,
      url: 'https://www.env.nm.gov/energy-minerals-and-natural-resources-department/',
      expiresAt: null,
    },
  ],

  NY: [
    {
      name: 'Drive Clean Rebate (NYSERDA)',
      amount: 2000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 42000,
      // NY does not disqualify cars over the cap, it pays a reduced flat
      // rebate of $500 for EVs with MSRP ≥ $42,000 (full $2,000 below).
      reducedAmount: 500,
      url: 'https://driveelectric.ny.gov/rebate',
      notes: 'Vehicles under $42,000 MSRP receive the full $2,000; vehicles at or above $42,000 receive a reduced $500 rebate.',
      expiresAt: null,
    },
    {
      name: 'NYSERDA EVSE Rebate',
      amount: 250,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.nyserda.ny.gov/ev-charger',
      expiresAt: null,
    },
    {
      name: 'Con Edison / National Grid EV Rebate',
      amount: 200,
      type: 'rebate',
      appliesTo: ['new'],
      url: 'https://www.coned.com/en/our-energy-future/electric-vehicles',
      expiresAt: null,
      notes: 'Varies by utility. Additional utility-level incentives may stack.',
    },
  ],

  NC: [], // No statewide EV rebate as of 2026

  ND: [], // No statewide EV rebate

  OH: [], // No statewide EV rebate

  OK: [], // No statewide EV rebate

  OR: [
    {
      name: 'Oregon EV Rebate (DEQ)',
      amount: 2500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      incomeCapHousehold: 100000,
      url: 'https://www.oregon.gov/deq/aq/programs/pages/electric-vehicles.aspx',
      expiresAt: null,
      notes: 'Income-qualified buyers (≤400% FPL) may receive up to $5,000 via Charge Ahead Oregon.',
    },
    {
      name: 'Charge Ahead Oregon (Low Income)',
      amount: 5000,
      type: 'rebate',
      appliesTo: ['new'],
      incomeCapHousehold: 60000,
      url: 'https://www.oregon.gov/deq/aq/programs/pages/electric-vehicles.aspx',
      expiresAt: null,
    },
    {
      name: 'Pacific Power / Portland General Electric EV Charger Rebate',
      amount: 500,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.portlandgeneral.com/residential/products-and-services/electric-vehicles',
      expiresAt: null,
    },
  ],

  PA: [
    {
      name: 'Pennsylvania Alternative Fuel Vehicle Rebate Program',
      amount: 2000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      incomeCapHousehold: 250000,
      url: 'https://www.dep.pa.gov/Business/Air/BAQ/Rebates/Pages/default.aspx',
      expiresAt: null,
      notes: 'Income-qualified buyers (≤200% FPL) may receive up to $3,000.',
    },
  ],

  RI: [
    {
      name: 'Rhode Island EV Rebate (Rhode Island Commerce)',
      amount: 1500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 50000,
      url: 'https://energy.ri.gov/clean-energy-programs/clean-transportation',
      expiresAt: null,
      notes: 'Applied at participating dealers. Used EVs may qualify for $1,000.',
    },
  ],

  SC: [], // No statewide EV rebate

  SD: [], // No statewide EV rebate

  TN: [], // No statewide EV rebate

  TX: [], // Texas removed its LCIP program in 2023. No statewide rebate.

  UT: [
    {
      name: 'Utah New EV Incentive',
      amount: 1500,
      type: 'tax_credit',
      appliesTo: ['new'],
      maxMsrp: 60000,
      url: 'https://evutah.org/incentives/',
      expiresAt: null,
      notes: 'Non-refundable state income tax credit. Must file UT TC-40V form.',
    },
  ],

  VT: [
    {
      name: 'MileageSmart EV Incentive',
      amount: 5000,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 60000,
      url: 'https://www.driveelectricvt.com/',
      expiresAt: null,
      notes: 'Income-qualified buyers may receive up to $7,000 via Drive Electric Vermont.',
    },
    {
      name: 'Vermont Used EV Rebate',
      amount: 2000,
      type: 'rebate',
      appliesTo: ['used'],
      maxMsrp: 40000,
      url: 'https://www.driveelectricvt.com/',
      expiresAt: null,
    },
  ],

  VA: [
    {
      name: 'Virginia EV Rebate (DEQ)',
      amount: 2500,
      type: 'rebate',
      appliesTo: ['new'],
      maxMsrp: 55000,
      incomeCapHousehold: 150000,
      url: 'https://www.deq.virginia.gov/air/mobile-sources/clean-air-choices/electric-vehicles',
      expiresAt: null,
      notes: 'Subject to funding availability. Income-qualified buyers may receive up to $4,500.',
    },
  ],

  WA: [
    {
      name: 'Sales & Use Tax Exemption on New EVs',
      amount: 0,
      type: 'tax_exemption',
      appliesTo: ['new'],
      maxMsrp: 45000,
      url: 'https://dor.wa.gov/taxes-rates/other-taxes/sales-and-use-tax/clean-alternative-fuel-and-plug-in-hybrid-vehicles',
      notes: 'EVs under $45,000 MSRP are fully exempt from WA state sales tax (6.5%). Worth up to $2,925.',
      expiresAt: null,
    },
    {
      name: 'Puget Sound Energy EV Charger Rebate',
      amount: 400,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.pse.com/en/electric-vehicles',
      expiresAt: null,
      notes: 'PSE customers only. Other utilities offer similar programs.',
    },
  ],

  WV: [], // No statewide EV rebate

  WI: [], // No statewide EV rebate; some utility rebates available

  WY: [], // No statewide EV rebate

  DC: [
    {
      name: 'DC Excise Tax Exemption',
      amount: 0,
      type: 'tax_exemption',
      appliesTo: ['new'],
      url: 'https://dmv.dc.gov/service/electric-vehicle-incentives',
      notes: 'DC residents pay no excise tax on EVs (saves 6–8% of vehicle price). Additional EVSE rebates available.',
      expiresAt: null,
    },
    {
      name: 'DC Pepco EV Charger Rebate',
      amount: 500,
      type: 'rebate',
      appliesTo: ['home_charger'],
      url: 'https://www.pepco.com/home/savings/pages/electricvehicles.aspx',
      expiresAt: null,
    },
  ],
}

/**
 * Get state incentives. Returns empty array if no incentives exist.
 */
export function getStateIncentives(stateAbbr) {
  return STATE_INCENTIVES[stateAbbr?.toUpperCase()] || []
}

/**
 * Resolve the dollar amount a single incentive actually pays for a given MSRP.
 *
 * Most programs are flat: pay `amount` while MSRP ≤ maxMsrp, otherwise $0.
 * Some programs (e.g. NY Drive Clean) pay a *reduced* flat amount above the
 * cap instead of disqualifying the vehicle, represented by `reducedAmount`.
 *
 * @returns {number} effective rebate/credit dollars for this vehicle
 */
export function getEffectiveIncentiveAmount(incentive, vehicleMsrp) {
  if (!incentive) return 0
  const base = incentive.amount || 0
  if (incentive.maxMsrp && vehicleMsrp != null && vehicleMsrp >= incentive.maxMsrp) {
    return incentive.reducedAmount ?? 0
  }
  return base
}

/**
 * Calculate total flat-dollar rebate value for a vehicle purchase in a state.
 * Does not include tax_exemption types (those require MSRP * taxRate calculation).
 */
export function getTotalStateRebate(stateAbbr, vehicleMsrp, isNew = true) {
  const incentives = getStateIncentives(stateAbbr)
  return incentives
    .filter((i) => {
      if (!i.appliesTo?.includes(isNew ? 'new' : 'used')) return false
      if (i.type === 'tax_exemption') return false // handled separately via hasSalesTaxExemption()
      return true
    })
    // Use the effective amount so over-cap vehicles still collect any reduced
    // rebate (NY) and fully-disqualified ones contribute $0.
    .reduce((sum, i) => sum + getEffectiveIncentiveAmount(i, vehicleMsrp), 0)
}

/**
 * Estimate sales-tax exemption savings in dollars (if state has one).
 * Returns 0 if no exemption or MSRP is over the cap.
 */
export function getSalesTaxExemptionSavings(stateAbbr, vehicleMsrp, salesTaxRate) {
  const incentives = getStateIncentives(stateAbbr)
  const exemption = incentives.find((i) => i.type === 'tax_exemption' && i.appliesTo?.includes('new'))
  if (!exemption) return 0
  if (exemption.maxMsrp && vehicleMsrp > exemption.maxMsrp) return 0
  return Math.round(vehicleMsrp * (salesTaxRate / 100))
}

/**
 * Check if state has sales tax exemption on EVs (boolean).
 */
export function hasSalesTaxExemption(stateAbbr, vehicleMsrp) {
  const incentives = getStateIncentives(stateAbbr)
  const exemption = incentives.find((i) => i.type === 'tax_exemption' && i.appliesTo?.includes('new'))
  if (!exemption) return false
  if (exemption.maxMsrp && vehicleMsrp > exemption.maxMsrp) return false
  return true
}

/**
 * Get all used-vehicle incentives for a state.
 */
export function getUsedEvIncentives(stateAbbr, vehicleMsrp) {
  return getStateIncentives(stateAbbr).filter(
    (i) => i.appliesTo?.includes('used') && (!i.maxMsrp || vehicleMsrp <= i.maxMsrp)
  )
}
