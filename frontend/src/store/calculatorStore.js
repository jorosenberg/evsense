import { create } from 'zustand'

const defaultVehicleCalc = {
  selectedTrimIndex: 0,
  mode: 'finance', // "cash" | "finance" | "lease"

  // User-supplied price, when set (> 0), overrides MSRP as the basis for
  // sales tax, finance principal, and lease cap cost. Lets a buyer plug in
  // an online listing price and reuse the site's specs for that vehicle.
  // Depreciation still uses MSRP as the residual-curve anchor.
  userInputPrice: null,

  // Finance
  downPayment: null, // null = auto from userPreferences %
  tradeInValue: 0,
  dealerDiscount: 0,
  financeApr: 5.99,
  financeTermMonths: 60,

  // Lease
  leaseMoneyFactor: null, // null = use scraped offer
  leaseResidualPercent: null,
  leaseTermMonths: 36,
  leaseMileagePerYear: 10000,
  leaseCapCostReduction: 0,
  leaseRebatesAppliedTo: 'cap', // "cap" | "driveoff"
  leaseAcquisitionFee: 695,
  leaseDispositionFee: 395,
  leaseDocFee: 499,
  leaseIsOnePay: false,
  leaseMsdCount: 0,

  // Sales tax override, null = use state default, number = user-supplied %
  // (covers county add-ons, out-of-state registration, dealer negotiated treatment)
  salesTaxOverride: null,

  // Incentives
  applyFederalCredit: true,
  // Manual total-incentive override. When set (>= 0), this exact dollar amount
  // replaces the auto-computed federal + state incentive total in the TCO math.
  // Lets a buyer enter the real figure from a dealer quote or a current-offers
  // page instead of relying on the site's estimates. null = use estimates.
  manualIncentiveOverride: null,

  // Dealer programs
  dealerPrograms: {
    costco: false,
    samsClub: false,
    loyalty: false,
    conquest: false,
    affinityGroup: null,     // e.g. 'active_military', 'college_grad'
    manualAmount: null,      // user-entered override if they know exact amount
  },

  // Ongoing
  insuranceEstimate: 'average', // "low" | "average" | "high"
  maintenanceOverride: null,
  chargingNetworkSubscription: null,
}

export const useCalculatorStore = create((set, get) => ({
  vehicles: {}, // keyed by vehicle ID

  getVehicleCalc: (vehicleId) => {
    return get().vehicles[vehicleId] || { ...defaultVehicleCalc }
  },

  setVehicleCalc: (vehicleId, updates) =>
    set((s) => ({
      vehicles: {
        ...s.vehicles,
        [vehicleId]: {
          ...(s.vehicles[vehicleId] || defaultVehicleCalc),
          ...updates,
        },
      },
    })),

  resetVehicleCalc: (vehicleId) =>
    set((s) => ({
      vehicles: {
        ...s.vehicles,
        [vehicleId]: { ...defaultVehicleCalc },
      },
    })),
}))
