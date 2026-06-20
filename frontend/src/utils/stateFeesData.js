/**
 * State fees data, all 50 states + DC
 * Includes: sales tax, registration, title, inspection, EV surcharge,
 * annual EV road fee, and whether the state taxes full cap cost at lease inception.
 *
 * Last verified: 2025-01-01
 * Sources: StateMotorVehicleAdministrators.com, NCSL, NCEL EV fee tracker
 */

export const STATE_FEES = {
  AL: { name: 'Alabama',        salesTaxPercent: 2.0,  registrationFeeUsd: 43,  titleFeeUsd: 18,  inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 200, leaseCapCostTaxed: false },
  AK: { name: 'Alaska',         salesTaxPercent: 0.0,  registrationFeeUsd: 100, titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  AZ: { name: 'Arizona',        salesTaxPercent: 5.6,  registrationFeeUsd: 8,   titleFeeUsd: 4,   inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  AR: { name: 'Arkansas',       salesTaxPercent: 6.5,  registrationFeeUsd: 17,  titleFeeUsd: 10,  inspectionFeeUsd: 12,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 200, leaseCapCostTaxed: false },
  CA: { name: 'California',     salesTaxPercent: 7.25, registrationFeeUsd: 65,  titleFeeUsd: 22,  inspectionFeeUsd: 50,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  CO: { name: 'Colorado',       salesTaxPercent: 2.9,  registrationFeeUsd: 50,  titleFeeUsd: 7,   inspectionFeeUsd: 25,  evSurchargeUsd: 50,  annualEvRoadFeeUsd: 51,  leaseCapCostTaxed: false },
  CT: { name: 'Connecticut',    salesTaxPercent: 6.35, registrationFeeUsd: 120, titleFeeUsd: 25,  inspectionFeeUsd: 20,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  DE: { name: 'Delaware',       salesTaxPercent: 0.0,  registrationFeeUsd: 40,  titleFeeUsd: 35,  inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  FL: { name: 'Florida',        salesTaxPercent: 6.0,  registrationFeeUsd: 70,  titleFeeUsd: 77,  inspectionFeeUsd: 0,   evSurchargeUsd: 135, annualEvRoadFeeUsd: 135, leaseCapCostTaxed: false },
  GA: { name: 'Georgia',        salesTaxPercent: 4.0,  registrationFeeUsd: 20,  titleFeeUsd: 18,  inspectionFeeUsd: 25,  evSurchargeUsd: 214, annualEvRoadFeeUsd: 214, leaseCapCostTaxed: false },
  HI: { name: 'Hawaii',         salesTaxPercent: 4.0,  registrationFeeUsd: 45,  titleFeeUsd: 5,   inspectionFeeUsd: 17,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 50,  leaseCapCostTaxed: false },
  ID: { name: 'Idaho',          salesTaxPercent: 6.0,  registrationFeeUsd: 45,  titleFeeUsd: 14,  inspectionFeeUsd: 0,   evSurchargeUsd: 140, annualEvRoadFeeUsd: 140, leaseCapCostTaxed: false },
  IL: { name: 'Illinois',       salesTaxPercent: 6.25, registrationFeeUsd: 101, titleFeeUsd: 150, inspectionFeeUsd: 0,   evSurchargeUsd: 100, annualEvRoadFeeUsd: 100, leaseCapCostTaxed: true  },
  IN: { name: 'Indiana',        salesTaxPercent: 7.0,  registrationFeeUsd: 21,  titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 150, annualEvRoadFeeUsd: 150, leaseCapCostTaxed: false },
  IA: { name: 'Iowa',           salesTaxPercent: 5.0,  registrationFeeUsd: 55,  titleFeeUsd: 25,  inspectionFeeUsd: 0,   evSurchargeUsd: 130, annualEvRoadFeeUsd: 130, leaseCapCostTaxed: false },
  KS: { name: 'Kansas',         salesTaxPercent: 6.5,  registrationFeeUsd: 42,  titleFeeUsd: 10,  inspectionFeeUsd: 0,   evSurchargeUsd: 100, annualEvRoadFeeUsd: 100, leaseCapCostTaxed: false },
  KY: { name: 'Kentucky',       salesTaxPercent: 6.0,  registrationFeeUsd: 21,  titleFeeUsd: 9,   inspectionFeeUsd: 0,   evSurchargeUsd: 120, annualEvRoadFeeUsd: 120, leaseCapCostTaxed: false },
  LA: { name: 'Louisiana',      salesTaxPercent: 4.45, registrationFeeUsd: 20,  titleFeeUsd: 68,  inspectionFeeUsd: 10,  evSurchargeUsd: 110, annualEvRoadFeeUsd: 110, leaseCapCostTaxed: false },
  ME: { name: 'Maine',          salesTaxPercent: 5.5,  registrationFeeUsd: 35,  titleFeeUsd: 33,  inspectionFeeUsd: 12,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  MD: { name: 'Maryland',       salesTaxPercent: 6.0,  registrationFeeUsd: 135, titleFeeUsd: 100, inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  MA: { name: 'Massachusetts',  salesTaxPercent: 6.25, registrationFeeUsd: 60,  titleFeeUsd: 75,  inspectionFeeUsd: 35,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  MI: { name: 'Michigan',       salesTaxPercent: 6.0,  registrationFeeUsd: 120, titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 140, annualEvRoadFeeUsd: 140, leaseCapCostTaxed: false },
  MN: { name: 'Minnesota',      salesTaxPercent: 6.875,registrationFeeUsd: 80,  titleFeeUsd: 8,   inspectionFeeUsd: 0,   evSurchargeUsd: 75,  annualEvRoadFeeUsd: 75,  leaseCapCostTaxed: true  },
  MS: { name: 'Mississippi',    salesTaxPercent: 5.0,  registrationFeeUsd: 12,  titleFeeUsd: 9,   inspectionFeeUsd: 0,   evSurchargeUsd: 150, annualEvRoadFeeUsd: 150, leaseCapCostTaxed: false },
  MO: { name: 'Missouri',       salesTaxPercent: 4.225,registrationFeeUsd: 51,  titleFeeUsd: 11,  inspectionFeeUsd: 12,  evSurchargeUsd: 135, annualEvRoadFeeUsd: 135, leaseCapCostTaxed: false },
  MT: { name: 'Montana',        salesTaxPercent: 0.0,  registrationFeeUsd: 87,  titleFeeUsd: 10,  inspectionFeeUsd: 0,   evSurchargeUsd: 130, annualEvRoadFeeUsd: 130, leaseCapCostTaxed: false },
  NE: { name: 'Nebraska',       salesTaxPercent: 5.5,  registrationFeeUsd: 15,  titleFeeUsd: 10,  inspectionFeeUsd: 0,   evSurchargeUsd: 75,  annualEvRoadFeeUsd: 75,  leaseCapCostTaxed: false },
  NV: { name: 'Nevada',         salesTaxPercent: 6.85, registrationFeeUsd: 33,  titleFeeUsd: 29,  inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  NH: { name: 'New Hampshire',  salesTaxPercent: 0.0,  registrationFeeUsd: 31,  titleFeeUsd: 25,  inspectionFeeUsd: 12,  evSurchargeUsd: 100, annualEvRoadFeeUsd: 100, leaseCapCostTaxed: false },
  NJ: { name: 'New Jersey',     salesTaxPercent: 6.625,registrationFeeUsd: 84,  titleFeeUsd: 60,  inspectionFeeUsd: 13,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  NM: { name: 'New Mexico',     salesTaxPercent: 4.875,registrationFeeUsd: 27,  titleFeeUsd: 5,   inspectionFeeUsd: 0,   evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  NY: { name: 'New York',       salesTaxPercent: 4.0,  registrationFeeUsd: 140, titleFeeUsd: 50,  inspectionFeeUsd: 21,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  NC: { name: 'North Carolina', salesTaxPercent: 3.0,  registrationFeeUsd: 36,  titleFeeUsd: 56,  inspectionFeeUsd: 30,  evSurchargeUsd: 140, annualEvRoadFeeUsd: 140, leaseCapCostTaxed: false },
  ND: { name: 'North Dakota',   salesTaxPercent: 5.0,  registrationFeeUsd: 49,  titleFeeUsd: 5,   inspectionFeeUsd: 0,   evSurchargeUsd: 100, annualEvRoadFeeUsd: 100, leaseCapCostTaxed: false },
  OH: { name: 'Ohio',           salesTaxPercent: 5.75, registrationFeeUsd: 34,  titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 200, annualEvRoadFeeUsd: 200, leaseCapCostTaxed: true  },
  OK: { name: 'Oklahoma',       salesTaxPercent: 3.25, registrationFeeUsd: 96,  titleFeeUsd: 11,  inspectionFeeUsd: 0,   evSurchargeUsd: 110, annualEvRoadFeeUsd: 110, leaseCapCostTaxed: false },
  OR: { name: 'Oregon',         salesTaxPercent: 0.0,  registrationFeeUsd: 112, titleFeeUsd: 98,  inspectionFeeUsd: 0,   evSurchargeUsd: 115, annualEvRoadFeeUsd: 115, leaseCapCostTaxed: false },
  PA: { name: 'Pennsylvania',   salesTaxPercent: 6.0,  registrationFeeUsd: 38,  titleFeeUsd: 58,  inspectionFeeUsd: 35,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  RI: { name: 'Rhode Island',   salesTaxPercent: 7.0,  registrationFeeUsd: 30,  titleFeeUsd: 52,  inspectionFeeUsd: 40,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  SC: { name: 'South Carolina', salesTaxPercent: 5.0,  registrationFeeUsd: 40,  titleFeeUsd: 15,  inspectionFeeUsd: 10,  evSurchargeUsd: 120, annualEvRoadFeeUsd: 120, leaseCapCostTaxed: false },
  SD: { name: 'South Dakota',   salesTaxPercent: 4.5,  registrationFeeUsd: 50,  titleFeeUsd: 10,  inspectionFeeUsd: 0,   evSurchargeUsd: 50,  annualEvRoadFeeUsd: 50,  leaseCapCostTaxed: false },
  TN: { name: 'Tennessee',      salesTaxPercent: 7.0,  registrationFeeUsd: 26,  titleFeeUsd: 13,  inspectionFeeUsd: 0,   evSurchargeUsd: 100, annualEvRoadFeeUsd: 100, leaseCapCostTaxed: false },
  TX: { name: 'Texas',          salesTaxPercent: 6.25, registrationFeeUsd: 51,  titleFeeUsd: 33,  inspectionFeeUsd: 7,   evSurchargeUsd: 200, annualEvRoadFeeUsd: 200, leaseCapCostTaxed: true  },
  UT: { name: 'Utah',           salesTaxPercent: 4.85, registrationFeeUsd: 44,  titleFeeUsd: 6,   inspectionFeeUsd: 0,   evSurchargeUsd: 130, annualEvRoadFeeUsd: 130, leaseCapCostTaxed: false },
  VT: { name: 'Vermont',        salesTaxPercent: 6.0,  registrationFeeUsd: 76,  titleFeeUsd: 35,  inspectionFeeUsd: 10,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  VA: { name: 'Virginia',       salesTaxPercent: 4.15, registrationFeeUsd: 30,  titleFeeUsd: 15,  inspectionFeeUsd: 16,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
  WA: { name: 'Washington',     salesTaxPercent: 6.5,  registrationFeeUsd: 30,  titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 150, annualEvRoadFeeUsd: 294, leaseCapCostTaxed: false },
  WV: { name: 'West Virginia',  salesTaxPercent: 6.0,  registrationFeeUsd: 30,  titleFeeUsd: 10,  inspectionFeeUsd: 0,   evSurchargeUsd: 200, annualEvRoadFeeUsd: 200, leaseCapCostTaxed: false },
  WI: { name: 'Wisconsin',      salesTaxPercent: 5.0,  registrationFeeUsd: 75,  titleFeeUsd: 164, inspectionFeeUsd: 0,   evSurchargeUsd: 175, annualEvRoadFeeUsd: 175, leaseCapCostTaxed: false },
  WY: { name: 'Wyoming',        salesTaxPercent: 4.0,  registrationFeeUsd: 30,  titleFeeUsd: 15,  inspectionFeeUsd: 0,   evSurchargeUsd: 200, annualEvRoadFeeUsd: 200, leaseCapCostTaxed: false },
  DC: { name: 'Washington DC',  salesTaxPercent: 6.0,  registrationFeeUsd: 72,  titleFeeUsd: 26,  inspectionFeeUsd: 35,  evSurchargeUsd: 0,   annualEvRoadFeeUsd: 0,   leaseCapCostTaxed: false },
}

export function getStateFees(stateAbbr) {
  return STATE_FEES[stateAbbr?.toUpperCase()] || STATE_FEES['CA']
}

export const STATE_OPTIONS = Object.entries(STATE_FEES)
  .map(([abbr, data]) => ({ value: abbr, label: data.name }))
  .sort((a, b) => a.label.localeCompare(b.label))
