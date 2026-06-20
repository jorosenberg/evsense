/**
 * stateElectricityRates.js
 *
 * Average residential electricity rates by state (cents/kWh).
 * Source: U.S. Energy Information Administration (EIA)
 * Table: Electric Power Monthly, Table 5.6.A.
 *
 * Updated by: EIA releases updated data annually each spring.
 * To update: visit https://www.eia.gov/electricity/state/ and update values below,
 * or run the EIA rate fetch script (see IMPLEMENTATION_GUIDE.md).
 *
 * Last verified: 2025-01
 */

export const STATE_ELECTRICITY_RATES = {
  AL: 13.0,  // Alabama
  AK: 23.0,  // Alaska, high due to generation costs
  AZ: 13.0,  // Arizona
  AR: 11.0,  // Arkansas
  CA: 27.0,  // California, highest in continental US
  CO: 13.0,  // Colorado
  CT: 25.0,  // Connecticut
  DE: 14.0,  // Delaware
  FL: 13.0,  // Florida
  GA: 12.0,  // Georgia
  HI: 41.0,  // Hawaii, highest in US by far
  ID: 10.0,  // Idaho, hydro power keeps rates low
  IL: 13.0,  // Illinois
  IN: 13.0,  // Indiana
  IA: 12.0,  // Iowa
  KS: 12.0,  // Kansas
  KY: 11.0,  // Kentucky, coal keeps rates low
  LA: 10.0,  // Louisiana
  ME: 20.0,  // Maine
  MD: 15.0,  // Maryland
  MA: 26.0,  // Massachusetts
  MI: 17.0,  // Michigan
  MN: 14.0,  // Minnesota
  MS: 12.0,  // Mississippi
  MO: 11.0,  // Missouri
  MT: 11.0,  // Montana
  NE: 11.0,  // Nebraska
  NV: 12.0,  // Nevada
  NH: 23.0,  // New Hampshire
  NJ: 17.0,  // New Jersey
  NM: 13.0,  // New Mexico
  NY: 22.0,  // New York
  NC: 12.0,  // North Carolina
  ND: 10.0,  // North Dakota
  OH: 13.0,  // Ohio
  OK: 10.0,  // Oklahoma
  OR: 11.0,  // Oregon, hydro
  PA: 15.0,  // Pennsylvania
  RI: 24.0,  // Rhode Island
  SC: 13.0,  // South Carolina
  SD: 12.0,  // South Dakota
  TN: 12.0,  // Tennessee, TVA rates
  TX: 12.0,  // Texas, ERCOT market, can spike
  UT: 10.0,  // Utah
  VT: 20.0,  // Vermont
  VA: 13.0,  // Virginia
  WA: 10.0,  // Washington, hydro, lowest in continental US
  WV: 11.0,  // West Virginia
  WI: 15.0,  // Wisconsin
  WY: 10.0,  // Wyoming
  DC: 14.0,  // Washington DC
}

/**
 * Common off-peak TOU rates where available (cents/kWh).
 * Many utilities offer overnight EV rates, these are representative examples.
 * Users should check their specific utility for actual rates.
 */
export const STATE_OFFPEAK_RATES = {
  CA: 12.0,  // PG&E EV2-A off-peak; SCE TOU-EV-1 off-peak
  NY: 14.0,  // Con Edison Smart Charge NY off-peak
  TX: 8.0,   // Many Texas REPs offer overnight rates as low as $0.06–$0.08
  WA: 7.0,   // Puget Sound Energy EV rates
  OR: 8.0,   // Portland General Electric off-peak
  CO: 10.0,  // Xcel Energy EV rate
  IL: 9.0,   // ComEd Hourly Pricing off-peak average
  GA: 9.0,   // Georgia Power EV TOU
  NC: 9.0,   // Duke Energy EV rate
  FL: 9.0,   // FPL EV TOU
}

/**
 * Get electricity rate for a state. Falls back to national average if unknown.
 * @param {string} stateAbbr
 * @returns {number} Rate in cents per kWh
 */
export function getStateElectricityRate(stateAbbr) {
  return STATE_ELECTRICITY_RATES[stateAbbr?.toUpperCase()] ?? 15.0 // US avg fallback
}

/**
 * Get off-peak rate for a state if known.
 * @param {string} stateAbbr
 * @returns {number|null} Rate in cents per kWh, or null if not available
 */
export function getStateOffPeakRate(stateAbbr) {
  return STATE_OFFPEAK_RATES[stateAbbr?.toUpperCase()] ?? null
}

/** National average (continental US), used as fallback */
export const NATIONAL_AVERAGE_RATE_CENTS = 15.0
