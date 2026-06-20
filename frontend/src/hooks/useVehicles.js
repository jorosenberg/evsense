import { useState, useEffect } from 'react'
import { useFilterStore } from '../store/filterStore'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { useIncentives } from '../utils/incentivesByVehicle'
import { useEAOffers } from '../utils/electrifyAmerica'
import { useLeaseCalc } from '../utils/leaseCalcData'
import { cardCostMetric } from '../utils/cardTco'

let cachedVehicles = null

/**
 * Merge scores (vehicle_scores.json) into each vehicle. Kept generic in the data
 * model so the UI shows a "Score" without naming the provider.
 *   v.expertRating    — overall 0–10 score
 *   v.expertSubscores — { value, storageMax }
 *   v.cargoVolumeCuFt — from storageMax (feeds the Browse cargo slider/sort)
 */
function mergeScores(vehicles, scoreMap) {
  if (!scoreMap) return vehicles
  return vehicles.map((v) => {
    const rec = scoreMap[v.id]
    if (!rec) return v
    // GCC max storage can be liters; convert to cu ft when the value is large.
    const rawCargo = rec.storageMax ?? null
    const cargo = rawCargo == null ? null : (rawCargo > 200 ? Math.round(rawCargo / 28.3168) : rawCargo)
    return {
      ...v,
      expertRating: rec.overall ?? null,
      expertSubscores: { value: rec.value ?? null, storageMax: rec.storageMax ?? null },
      cargoVolumeCuFt: v.cargoVolumeCuFt ?? cargo,
    }
  })
}

/**
 * Merge Edmunds EV Range Test results (tested_specs.json) onto each vehicle:
 *   v.testedRange       — real-world tested range, mi (shown on cards)
 *   v.testedConsumption — kWh/100mi (optional)
 * EPA range stays on v.rangeEpa so the detail page can show both.
 */
function mergeTested(vehicles, testedMap) {
  if (!testedMap) return vehicles
  return vehicles.map((v) => {
    const rec = testedMap[v.id]
    if (!rec) return v
    return {
      ...v,
      testedRange: rec.testedRange ?? null,
      testedConsumption: rec.testedConsumption ?? null,
    }
  })
}

/**
 * Loads vehicles from static vehicles_summary.json (zero Firestore reads) and
 * merges scores when vehicle_scores.json is present.
 * Applies filter/sort from filterStore.
 */
export function useVehicles() {
  const [allVehicles, setAllVehicles] = useState(cachedVehicles || [])
  const [loading, setLoading] = useState(!cachedVehicles)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cachedVehicles) return
    Promise.all([
      fetch('/data/vehicles_summary.json').then((r) => r.json()),
      fetch('/data/vehicle_scores.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/data/tested_specs.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([vehicles, scores, tested]) => {
        let merged = mergeScores(vehicles, scores?.vehicles || null)
        merged = mergeTested(merged, tested?.vehicles || null)
        cachedVehicles = merged
        setAllVehicles(merged)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { allVehicles, loading, error }
}

/**
 * Returns filtered and sorted vehicles based on filterStore state.
 */
export function useFilteredVehicles() {
  const { allVehicles, loading, error } = useVehicles()
  const filters = useFilterStore()
  // Pay-method + cost inputs drive the mode-aware "Price: Low → High" sort, so
  // it orders by total price (cash) or monthly all-in TCO (finance / lease).
  const prefs = useUserPreferencesStore()
  const incMap = useIncentives()
  const eaMap = useEAOffers()
  const leaseMap = useLeaseCalc()

  const filtered = allVehicles.filter((v) => {
    // Condition
    if (filters.condition === 'new' && v.type !== 'new') return false
    if (filters.condition === 'used' && v.type !== 'used') return false
    if (filters.condition === 'coming_soon' && !v.comingSoon) return false
    if (filters.condition !== 'coming_soon' && v.comingSoon) return false

    // Price
    if (v.msrpFrom && v.msrpFrom < filters.priceRange[0]) return false
    if (v.msrpFrom && v.msrpFrom > filters.priceRange[1]) return false

    // Range
    if (v.rangeEpa && v.rangeEpa < filters.minRange) return false

    // Drivetrain
    if (filters.drivetrains.length > 0) {
      const overlap = v.drivetrains?.some((d) => filters.drivetrains.includes(d))
      if (!overlap) return false
    }

    // Charging port
    if (filters.chargingPorts.length > 0 && !filters.chargingPorts.includes(v.chargingPort)) return false

    // Brand
    if (filters.brands.length > 0 && !filters.brands.includes(v.make)) return false

    // Body style
    if (filters.bodyStyles.length > 0 && !filters.bodyStyles.includes(v.bodyStyle)) return false

    // Federal credit
    if (filters.federalCreditOnly && !v.federalCreditEligible) return false

    // Seating
    if (filters.seating.length > 0) {
      const cap = v.seatingCapacity
      const match = filters.seating.some((s) => {
        if (s === '7+') return cap >= 7
        return cap === Number(s)
      })
      if (!match) return false
    }

    // Towing
    if (filters.minTowing > 0 && (v.towingCapacityLbs || 0) < filters.minTowing) return false

    // Horsepower
    if (filters.minHorsepower > 0 && (v.horsepower || 0) < filters.minHorsepower) return false

    // Cargo volume (cu ft) — from curated specs. Vehicles without a known cargo
    // figure pass through (so the slider doesn't empty the grid).
    if (filters.minCargo > 0 && v.cargoVolumeCuFt != null && v.cargoVolumeCuFt < filters.minCargo) return false

    // Efficiency (mi/kWh)
    if (filters.minEfficiency > 0 && (v.milesPerKwh || 0) < filters.minEfficiency) return false

    return true
  })

  // Mode-aware cost metric per vehicle (total price for cash, monthly all-in
  // TCO for finance/lease). Computed once per render — not inside the comparator.
  const costOf = {}
  for (const v of filtered) {
    costOf[v.id] = cardCostMetric(v, {
      prefs,
      incRec: incMap[v.id] || null,
      eaOffer: eaMap[v.id] || null,
      leaseCalcRec: leaseMap[v.id] || null,
    })
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (filters.sort) {
      // "Price: Low → High" / "High → Low" depend on the pay method: cheapest
      // total price (cash) or lowest monthly TCO (finance / lease).
      case 'msrp_asc':   return (costOf[a.id] ?? 9e15) - (costOf[b.id] ?? 9e15)
      case 'msrp_desc':  return (costOf[b.id] ?? 0) - (costOf[a.id] ?? 0)
      case 'range_desc': return (b.rangeEpa || 0) - (a.rangeEpa || 0)
      case 'lease_asc':  return (a.leaseFrom || 999999) - (b.leaseFrom || 999999)
      case 'payment_asc':return (a.financeFrom || 999999) - (b.financeFrom || 999999)
      case 'speed_asc':  return (a.zeroToSixty || 99) - (b.zeroToSixty || 99)
      case 'expert_desc': return (b.expertRating || 0) - (a.expertRating || 0)
      case 'cargo_desc': return (b.cargoVolumeCuFt || 0) - (a.cargoVolumeCuFt || 0)
      case 'efficiency_desc': return (b.milesPerKwh || 0) - (a.milesPerKwh || 0)
      default: return 0
    }
  })

  return { vehicles: sorted, loading, error, total: allVehicles.length }
}

/**
 * Get a single vehicle summary by ID (from static JSON, no Firestore).
 */
export function useVehicleSummary(vehicleId) {
  const { allVehicles, loading } = useVehicles()
  const vehicle = allVehicles.find((v) => v.id === vehicleId) || null
  return { vehicle, loading }
}
