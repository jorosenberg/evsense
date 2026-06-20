import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useUserPreferencesStore = create(
  persist(
    (set, get) => ({
      // Location — defaults to New York.
      state: 'NY',
      zip: '10001',                    // US ZIP; drives nearby station lookup + state
      stateDetectionMethod: 'default', // "ip" | "manual" | "default"
      electricityRateCentsPerKwh: null, // null = use state default
      hasOffPeakRate: false,
      offPeakRateCentsPerKwh: null,

      // Charging setup
      hasHomeCharger: true,
      homeChargerType: 'level2', // "level1" | "level2"
      homeChargerInstallCostUsd: 1400,
      chargingMixPercent: {
        home: 80,
        publicL2: 10,
        dcFast: 10,
      },
      // DCFC pricing — overrides the state-derived default when set.
      // Populated by the Open Charge Map popup (or left null to fall back).
      dcfcRateCentsPerKwh: null,        // null = use 45¢ default
      dcfcLocationPromptDismissed: false,
      publicL2RateCentsPerKwh: null,    // null = use 22¢ default
      ocmLocation: null,                // { lat, lng, label } if user opted in
      // Flat monthly charging-network subscription(s) (e.g. EA Pass+, EVgo
      // membership). Added on top of per-kWh charging in browse/quick TCO.
      chargingSubscriptionMonthlyUsd: 0,

      // Financial profile
      annualMileage: 12000,
      ownershipYears: 5,
      filingStatus: 'single',
      annualIncome: null,
      downPaymentPercent: 10,
      preferredTermMonths: 60,

      // How the shopper plans to pay — drives the "/mo all-in" shown on every
      // browse card via quickTco. 'finance' | 'lease' | 'cash'.
      purchaseMode: 'finance',
      // Lease term (months) the shopper wants quotes for. Only meaningful when
      // purchaseMode === 'lease'. Drives the per-card lease estimate + offer term.
      leaseTermMonths: 36,
      // Whether to fold the baked-in manufacturer incentives (cash rebate for
      // cash/finance, lease cash for lease) into the browse prices + monthly TCO.
      // On by default; turn off to see sticker pricing with no incentives.
      includeIncentives: true,
      // Optional flat incentive (manufacturer/dealer cash) the user knows
      // about, subtracted from effective price in browse estimates. null = off.
      incentiveOverride: null,

      // Comparison cart (up to 3)
      compareVehicleIds: [],

      // Actions
      setState: (stateAbbr, method = 'manual') =>
        set({ state: stateAbbr, stateDetectionMethod: method }),

      setZip: (zip, stateAbbr) =>
        set({ zip, ...(stateAbbr ? { state: stateAbbr, stateDetectionMethod: 'manual' } : {}) }),

      setElectricityRate: (rate) => set({ electricityRateCentsPerKwh: rate }),
      setDcfcRate: (rate) => set({ dcfcRateCentsPerKwh: rate }),
      setPublicL2Rate: (rate) => set({ publicL2RateCentsPerKwh: rate }),
      setChargingSubscription: (usdPerMonth) =>
        set({ chargingSubscriptionMonthlyUsd: usdPerMonth || 0 }),

      setChargingMix: (mix) =>
        set((s) => ({ chargingMixPercent: { ...s.chargingMixPercent, ...mix } })),

      setFinancialProfile: (updates) => set(updates),

      setPurchaseMode: (mode) => set({ purchaseMode: mode }),
      setLeaseTermMonths: (months) => set({ leaseTermMonths: months }),
      setIncludeIncentives: (on) => set({ includeIncentives: !!on }),
      setIncentiveOverride: (amount) => set({ incentiveOverride: amount }),

      addToCompare: (vehicleId) => {
        const { compareVehicleIds } = get()
        if (compareVehicleIds.includes(vehicleId)) return
        if (compareVehicleIds.length >= 3) return
        set({ compareVehicleIds: [...compareVehicleIds, vehicleId] })
      },

      removeFromCompare: (vehicleId) =>
        set((s) => ({
          compareVehicleIds: s.compareVehicleIds.filter((id) => id !== vehicleId),
        })),

      clearCompare: () => set({ compareVehicleIds: [] }),

      isInCompare: (vehicleId) => get().compareVehicleIds.includes(vehicleId),
    }),
    {
      name: 'ev-explorer-prefs',
      version: 5,
      migrate: (state, version) => {
        if (version < 2) {
          state = {
            ...state,
            dcfcRateCentsPerKwh: null,
            dcfcLocationPromptDismissed: false,
            publicL2RateCentsPerKwh: null,
            ocmLocation: null,
          }
        }
        if (version < 3) {
          state = { ...state, chargingSubscriptionMonthlyUsd: 0 }
        }
        if (version < 4) {
          state = { ...state, leaseTermMonths: 36, includeIncentives: true }
        }
        if (version < 5) {
          state = { ...state, zip: '10001' }
        }
        return state
      },
    }
  )
)
