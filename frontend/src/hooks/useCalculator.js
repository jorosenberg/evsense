/**
 * useCalculator.js
 *
 * Convenience hook that binds a vehicle's calculator state to the
 * full TCO calculation in one call.
 *
 * Usage:
 *   const { calc, set, tco, programSavings } = useCalculator(vehicle)
 */
import { useMemo } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { getStateFees } from '../utils/stateFeesData'
import { STATE_ELECTRICITY_RATES } from '../utils/chargingCostCalculator'
import { calculateTCO } from '../utils/tcoCalculator'
import { calculateProgramSavings } from '../utils/dealerPrograms'

export function useCalculator(vehicle) {
  const { getVehicleCalc, setVehicleCalc } = useCalculatorStore()
  const userPrefs = useUserPreferencesStore()

  const calc = getVehicleCalc(vehicle?.id)
  const set = (updates) => vehicle && setVehicleCalc(vehicle.id, updates)

  const stateData = getStateFees(userPrefs.state)
  const electricityRate =
    userPrefs.electricityRateCentsPerKwh ?? STATE_ELECTRICITY_RATES[userPrefs.state] ?? 18

  const programSavings = useMemo(() => {
    if (!vehicle) return 0
    const raw = calculateProgramSavings(calc.dealerPrograms || {}, vehicle.make)
    return calc.dealerPrograms?.manualAmount ?? raw
  }, [vehicle, calc.dealerPrograms])

  const tco = useMemo(() => {
    if (!vehicle) return null
    return calculateTCO({
      vehicle,
      calcState: {
        ...calc,
        dealerDiscount: (calc.dealerDiscount || 0) + programSavings,
      },
      userPrefs: { ...userPrefs, electricityRateCentsPerKwh: electricityRate },
      stateData,
    })
  }, [vehicle, calc, userPrefs, stateData, electricityRate, programSavings])

  return {
    calc,
    set,
    tco,
    programSavings,
    stateData,
    electricityRate,
    userPrefs,
  }
}
