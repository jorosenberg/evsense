import { create } from 'zustand'

export const useFilterStore = create((set, get) => ({
  condition: 'new',
  priceRange: [20000, 150000],
  monthlyPaymentRange: [0, 2000],
  leasePaymentRange: [0, 1500],
  drivetrains: [],
  minRange: 0,
  seating: [],
  minCargo: 0,
  minEfficiency: 0,
  minTowing: 0,
  minHorsepower: 0,
  chargingPorts: [],
  brands: [],
  bodyStyles: [],
  federalCreditOnly: false,
  sort: 'msrp_asc',

  // Actions
  setFilter: (key, value) => set({ [key]: value }),

  toggleArrayFilter: (key, value) =>
    set((s) => {
      const current = s[key]
      return {
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      }
    }),

  resetFilters: () =>
    set({
      condition: 'new',
      priceRange: [20000, 150000],
      monthlyPaymentRange: [0, 2000],
      leasePaymentRange: [0, 1500],
      drivetrains: [],
      minRange: 0,
      seating: [],
      minCargo: 0,
      minTowing: 0,
      minHorsepower: 0,
      chargingPorts: [],
      brands: [],
      bodyStyles: [],
      federalCreditOnly: false,
      sort: 'msrp_asc',
    }),

  getActiveFilterCount: () => {
    const s = get()
    let count = 0
    if (s.drivetrains.length) count++
    if (s.seating.length) count++
    if (s.brands.length) count++
    if (s.bodyStyles.length) count++
    if (s.chargingPorts.length) count++
    if (s.minRange > 0) count++
    if (s.minCargo > 0) count++
    if (s.minEfficiency > 0) count++
    if (s.minTowing > 0) count++
    if (s.minHorsepower > 0) count++
    if (s.federalCreditOnly) count++
    return count
  },
}))
