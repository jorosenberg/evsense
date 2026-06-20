/**
 * useFilters.js
 *
 * Convenience hook that wraps filterStore to expose
 * derived values (active filter count, filter badge text)
 * and filter application logic alongside store actions.
 */
import { useFilterStore } from '../store/filterStore'
import { useFilteredVehicles } from './useVehicles'

export function useFilters() {
  const store = useFilterStore()
  const { vehicles, loading, total } = useFilteredVehicles()

  // Build human-readable label for each active filter for the chip row
  const activeFilterLabels = []

  if (store.drivetrains.length) {
    activeFilterLabels.push({ key: 'drivetrains', label: store.drivetrains.join(', ') })
  }
  if (store.brands.length) {
    activeFilterLabels.push({ key: 'brands', label: store.brands.join(', ') })
  }
  if (store.bodyStyles.length) {
    activeFilterLabels.push({ key: 'bodyStyles', label: store.bodyStyles.join(', ') })
  }
  if (store.chargingPorts.length) {
    activeFilterLabels.push({ key: 'chargingPorts', label: store.chargingPorts.join(', ') })
  }
  if (store.seating.length) {
    activeFilterLabels.push({ key: 'seating', label: `${store.seating.join('/')} seats` })
  }
  if (store.minRange > 0) {
    activeFilterLabels.push({ key: 'minRange', label: `${store.minRange}+ mi range` })
  }
  if (store.minTowing > 0) {
    activeFilterLabels.push({ key: 'minTowing', label: `${store.minTowing.toLocaleString()}+ lbs towing` })
  }
  if (store.minHorsepower > 0) {
    activeFilterLabels.push({ key: 'minHorsepower', label: `${store.minHorsepower}+ hp` })
  }
  if (store.federalCreditOnly) {
    activeFilterLabels.push({ key: 'federalCreditOnly', label: 'Tax credit eligible' })
  }

  function clearFilter(key) {
    switch (key) {
      case 'drivetrains':   return store.setFilter('drivetrains', [])
      case 'brands':        return store.setFilter('brands', [])
      case 'bodyStyles':    return store.setFilter('bodyStyles', [])
      case 'chargingPorts': return store.setFilter('chargingPorts', [])
      case 'seating':       return store.setFilter('seating', [])
      case 'minRange':      return store.setFilter('minRange', 0)
      case 'minTowing':     return store.setFilter('minTowing', 0)
      case 'minHorsepower': return store.setFilter('minHorsepower', 0)
      case 'federalCreditOnly': return store.setFilter('federalCreditOnly', false)
      default: break
    }
  }

  return {
    ...store,
    vehicles,
    loading,
    total,
    activeFilterLabels,
    clearFilter,
    hasActiveFilters: activeFilterLabels.length > 0,
  }
}
