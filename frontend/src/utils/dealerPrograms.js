/**
 * dealerPrograms.js — Manufacturer & third-party discount programs
 *
 * These programs can significantly reduce the effective purchase price of a vehicle
 * but are rarely surfaced upfront. EVsense includes them prominently in the calculator.
 *
 * Types:
 *  - "third_party"  : Costco, Sam's Club, AAA, USAA — negotiated pricing programs
 *  - "loyalty"      : Discount for current/recent owners of the same brand
 *  - "conquest"     : Discount for switching FROM a competitor brand
 *  - "affinity"     : Military, first responder, college grad, employee
 *  - "fleet"        : Business/fleet purchase pricing
 *
 * Amounts are typical ranges — actual amounts vary by model, trim, and region.
 * Always verify with the dealer and the program's official site.
 *
 * Last verified: 2025-01
 */

export const THIRD_PARTY_PROGRAMS = [
  {
    id: 'costco',
    name: 'Costco Auto Program',
    type: 'third_party',
    typicalSavings: { min: 500, max: 2000 },
    description: 'Pre-negotiated pricing below MSRP through Costco\'s dealer network. No haggling — price is set before you walk in.',
    eligibility: 'Costco membership required ($65/year). Savings vary by make and region.',
    url: 'https://www.costcoauto.com',
    supportedBrands: ['Hyundai', 'Kia', 'Volvo', 'Subaru', 'Chevrolet', 'Buick', 'GMC', 'Cadillac', 'Chrysler', 'Dodge', 'Jeep', 'Ram', 'Nissan', 'Infiniti', 'Ford', 'Lincoln'],
    notes: 'Tesla, Rivian, and other direct-sale brands are not eligible (no dealer network). BMW, Mercedes, Audi typically not included. Hyundai/Kia often have strong Costco pricing.',
    isCashOnCap: true, // Applies to selling price, not a separate rebate
  },
  {
    id: 'sams-club',
    name: "Sam's Club Auto Buying Program",
    type: 'third_party',
    typicalSavings: { min: 300, max: 1500 },
    description: "Similar to Costco Auto — pre-negotiated dealer pricing for Sam's Club members.",
    eligibility: "Sam's Club membership required ($50/year).",
    url: 'https://www.samsclub.com/content/auto-buying',
    supportedBrands: ['Chevrolet', 'Buick', 'GMC', 'Cadillac', 'Ford', 'Lincoln', 'Hyundai', 'Kia', 'Nissan'],
    isCashOnCap: true,
  },
  {
    id: 'truecar',
    name: 'TrueCar Certified Dealer Price',
    type: 'third_party',
    typicalSavings: { min: 0, max: 1500 },
    description: 'Shows what others paid and connects you with dealers who agree to a price upfront. Not a guaranteed discount — a pricing transparency tool.',
    eligibility: 'Free to use.',
    url: 'https://www.truecar.com',
    supportedBrands: 'most',
    notes: 'More useful as a market reference than a guaranteed savings program. Savings vs. MSRP vary widely.',
    isCashOnCap: true,
  },
]

export const BRAND_PROGRAMS = {
  // Format: brandName → { loyalty, conquest, affinityPrograms }
  Hyundai: {
    loyalty: {
      name: 'Hyundai Loyalty Bonus',
      typicalAmount: 500,
      description: 'Current or recent Hyundai owner (within past 3 years).',
      stacksWithConquest: false,
      url: 'https://www.hyundaiusa.com',
    },
    conquest: {
      name: 'Hyundai Conquest Bonus',
      typicalAmount: 1000,
      description: 'Switching from a non-Hyundai, non-Genesis vehicle.',
      stacksWithLoyalty: false,
      url: 'https://www.hyundaiusa.com',
    },
    affinityPrograms: [
      { id: 'hyundai-military', name: 'Military Appreciation Bonus', amount: 500, groups: ['active_military', 'veteran', 'military_family'] },
      { id: 'hyundai-firstresponder', name: 'First Responder Bonus', amount: 500, groups: ['police', 'firefighter', 'emt', 'nurse', 'doctor'] },
      { id: 'hyundai-college', name: 'College Grad Program', amount: 400, groups: ['college_grad'], notes: 'Must have graduated or will graduate within 6 months.' },
    ],
  },
  Kia: {
    loyalty: {
      name: 'Kia Loyalty Bonus',
      typicalAmount: 500,
      description: 'Current or recent Kia owner.',
      url: 'https://www.kia.com',
    },
    conquest: {
      name: 'Kia Conquest Bonus',
      typicalAmount: 750,
      description: 'Currently own or lease a non-Kia, non-Hyundai vehicle.',
      url: 'https://www.kia.com',
    },
    affinityPrograms: [
      { id: 'kia-military', name: 'Military Appreciation Bonus', amount: 400, groups: ['active_military', 'veteran'] },
      { id: 'kia-firstresponder', name: 'First Responder Bonus', amount: 400, groups: ['police', 'firefighter', 'emt'] },
      { id: 'kia-college', name: 'Kia College Grad Program', amount: 400, groups: ['college_grad'] },
    ],
  },
  Ford: {
    loyalty: {
      name: 'Ford Loyalty Bonus',
      typicalAmount: 1000,
      description: 'Current Ford or Lincoln owner/lessee.',
      url: 'https://www.ford.com',
    },
    conquest: {
      name: 'Ford Conquest Bonus',
      typicalAmount: 1000,
      description: 'Currently own/lease a non-Ford, non-Lincoln vehicle.',
      url: 'https://www.ford.com',
      notes: 'Ford Conquest and Loyalty typically cannot be combined. Ford A/Z Plan employee pricing often supercedes these.',
    },
    affinityPrograms: [
      { id: 'ford-military', name: 'Ford Military Appreciation Program', amount: 500, groups: ['active_military', 'veteran', 'military_family'] },
      { id: 'ford-firstresponder', name: 'Ford First Responder Program', amount: 500, groups: ['police', 'firefighter', 'emt', 'nurse'] },
      { id: 'ford-college', name: 'Ford College Student Purchase Plan', amount: 500, groups: ['college_grad', 'college_student'] },
    ],
  },
  Chevrolet: {
    loyalty: {
      name: 'GM Loyalty Bonus',
      typicalAmount: 1000,
      description: 'Current owner/lessee of a GM vehicle (Chevy, Buick, GMC, Cadillac).',
      url: 'https://www.chevrolet.com',
    },
    conquest: {
      name: 'GM Conquest Bonus',
      typicalAmount: 1500,
      description: 'Currently own/lease a non-GM vehicle.',
      url: 'https://www.chevrolet.com',
    },
    affinityPrograms: [
      { id: 'gm-military', name: 'GM Military Discount', amount: 500, groups: ['active_military', 'veteran', 'military_family'] },
      { id: 'gm-firstresponder', name: 'GM First Responder Discount', amount: 500, groups: ['police', 'firefighter', 'emt'] },
      { id: 'gm-college', name: 'GM College Discount', amount: 500, groups: ['college_grad', 'college_student'] },
    ],
  },
  BMW: {
    loyalty: {
      name: 'BMW Loyalty Offer',
      typicalAmount: 1500,
      description: 'Current BMW or MINI owner/lessee.',
      url: 'https://www.bmwusa.com',
    },
    conquest: {
      name: 'BMW Conquest Credit',
      typicalAmount: 2000,
      description: 'Currently own/lease a competing luxury brand (Mercedes, Audi, Lexus, Cadillac, etc.).',
      url: 'https://www.bmwusa.com',
    },
    affinityPrograms: [
      { id: 'bmw-military', name: 'BMW Military Program', amount: 1000, groups: ['active_military', 'veteran'] },
    ],
  },
  Mercedes: {
    loyalty: {
      name: 'Mercedes-Benz Loyalty Bonus',
      typicalAmount: 1000,
      description: 'Current Mercedes-Benz owner/lessee.',
      url: 'https://www.mbusa.com',
    },
    conquest: {
      name: 'Mercedes-Benz Conquest Offer',
      typicalAmount: 2000,
      description: 'Currently own/lease a competing luxury vehicle.',
      url: 'https://www.mbusa.com',
    },
    affinityPrograms: [
      { id: 'mb-military', name: 'Mercedes Military Program', amount: 1000, groups: ['active_military', 'veteran'] },
    ],
  },
  Volkswagen: {
    loyalty: {
      name: 'VW Loyalty Bonus',
      typicalAmount: 750,
      description: 'Current Volkswagen owner/lessee.',
      url: 'https://www.vw.com',
    },
    conquest: {
      name: 'VW Conquest Bonus',
      typicalAmount: 1000,
      description: 'Currently own/lease a non-VW vehicle.',
      url: 'https://www.vw.com',
    },
    affinityPrograms: [
      { id: 'vw-military', name: 'VW Military Appreciation Bonus', amount: 500, groups: ['active_military', 'veteran'] },
      { id: 'vw-college', name: 'VW College Grad Program', amount: 500, groups: ['college_grad'] },
    ],
  },
  Volvo: {
    loyalty: {
      name: 'Volvo Loyalty Bonus',
      typicalAmount: 1000,
      description: 'Current Volvo owner/lessee.',
      url: 'https://www.volvocars.com/us',
    },
    conquest: {
      name: 'Volvo Conquest Offer',
      typicalAmount: 1500,
      description: 'Currently own/lease a non-Volvo vehicle.',
      url: 'https://www.volvocars.com/us',
    },
    affinityPrograms: [],
  },
  // Direct-sale brands: no dealer network, no traditional loyalty/conquest
  Tesla: {
    notes: 'Tesla sells direct — no dealer loyalty or conquest programs. Referral credits occasionally available through Tesla\'s referral program.',
    loyalty: null,
    conquest: null,
    affinityPrograms: [],
  },
  Rivian: {
    notes: 'Rivian sells direct — no dealer loyalty or conquest programs.',
    loyalty: null,
    conquest: null,
    affinityPrograms: [],
  },
  Lucid: {
    notes: 'Lucid sells direct — no dealer loyalty or conquest programs.',
    loyalty: null,
    conquest: null,
    affinityPrograms: [],
  },
  Polestar: {
    notes: 'Polestar sells online-first — no traditional dealer programs. Occasionally offers trade-in bonuses.',
    loyalty: null,
    conquest: null,
    affinityPrograms: [],
  },
}

export const AFFINITY_GROUPS = [
  { id: 'active_military', label: 'Active Military' },
  { id: 'veteran', label: 'Veteran' },
  { id: 'military_family', label: 'Military Family Member' },
  { id: 'police', label: 'Law Enforcement' },
  { id: 'firefighter', label: 'Firefighter' },
  { id: 'emt', label: 'EMT / Paramedic' },
  { id: 'nurse', label: 'Nurse / Healthcare Worker' },
  { id: 'doctor', label: 'Physician' },
  { id: 'college_grad', label: 'Recent College Graduate (within 2 years)' },
  { id: 'college_student', label: 'Current College Student' },
]

/**
 * Get all programs available for a given make, returning estimated total savings.
 */
export function getAvailablePrograms(make) {
  const brandPrograms = BRAND_PROGRAMS[make] || {}
  const thirdParty = THIRD_PARTY_PROGRAMS.filter(
    (p) => p.supportedBrands === 'most' || p.supportedBrands?.includes(make)
  )
  return { brandPrograms, thirdParty }
}

/**
 * Calculate total dealer program savings from selected programs.
 * @param {Object} selectedPrograms - { costco: true, loyalty: true, conquest: false, affinity: ['military'] }
 * @param {string} make - Vehicle make
 * @returns {number} Total estimated savings in dollars
 */
export function calculateProgramSavings(selectedPrograms, make) {
  const { brandPrograms, thirdParty } = getAvailablePrograms(make)
  let total = 0

  // Third-party programs
  if (selectedPrograms.costco) {
    const costco = thirdParty.find((p) => p.id === 'costco')
    if (costco) total += (costco.typicalSavings.min + costco.typicalSavings.max) / 2
  }
  if (selectedPrograms.samsClub) {
    const sams = thirdParty.find((p) => p.id === 'sams-club')
    if (sams) total += (sams.typicalSavings.min + sams.typicalSavings.max) / 2
  }

  // Loyalty (mutually exclusive with conquest for most brands)
  if (selectedPrograms.loyalty && brandPrograms.loyalty) {
    total += brandPrograms.loyalty.typicalAmount
  }

  // Conquest
  if (selectedPrograms.conquest && brandPrograms.conquest && !selectedPrograms.loyalty) {
    total += brandPrograms.conquest.typicalAmount
  }

  // Affinity programs
  if (selectedPrograms.affinityGroup && brandPrograms.affinityPrograms?.length > 0) {
    const matchingProgram = brandPrograms.affinityPrograms.find(
      (p) => p.groups.includes(selectedPrograms.affinityGroup)
    )
    if (matchingProgram) total += matchingProgram.amount
  }

  // Manual override always wins
  if (selectedPrograms.manualAmount != null) {
    return selectedPrograms.manualAmount
  }

  return total
}
