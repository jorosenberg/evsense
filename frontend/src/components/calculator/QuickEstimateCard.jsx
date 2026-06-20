import { useState } from 'react'
import { useCalculatorStore } from '../../store/calculatorStore'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { getStateFees } from '../../utils/stateFeesData'
import { STATE_ELECTRICITY_RATES } from '../../utils/chargingCostCalculator'
import { getStateIncentives } from '../../utils/incentivesData'
import { calculateTCO } from '../../utils/tcoCalculator'
import { formatCurrency } from '../../utils/formatCurrency'
import { STATE_OPTIONS } from '../../utils/stateFeesData'

/**
 * QuickEstimateCard
 *
 * Shown by default on mobile (< 768px) on the Vehicle Detail page.
 * Surfaces only the highest-impact inputs with sensible defaults for everything else.
 * A "Full Calculator →" button expands to the full 7-tab CostCalculator.
 *
 * Props:
 *   vehicle   {Object}   Full vehicle document
 *   onExpand  {Function} Called when user taps "Full Calculator →"
 */
export default function QuickEstimateCard({ vehicle, onExpand }) {
  const { getVehicleCalc, setVehicleCalc } = useCalculatorStore()
  const userPrefs = useUserPreferencesStore()
  const calc = getVehicleCalc(vehicle.id)
  const set = (updates) => setVehicleCalc(vehicle.id, updates)

  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const stateData = getStateFees(userPrefs.state)
  const electricityRate = userPrefs.electricityRateCentsPerKwh ?? STATE_ELECTRICITY_RATES[userPrefs.state] ?? 18

  const tco = calculateTCO({
    vehicle,
    calcState: { ...calc, dealerDiscount: calc.dealerDiscount || 0 },
    userPrefs: { ...userPrefs, electricityRateCentsPerKwh: electricityRate },
    stateData,
  })

  const hasFederalCredit = vehicle.federalTaxCredit?.eligibleNew
  const stateRebate = getStateIncentives(userPrefs.state)
    .filter(i => i.appliesTo?.includes('new') && i.type !== 'tax_exemption')
    .reduce((sum, i) => sum + (i.amount || 0), 0)
  const totalIncentives = (calc.applyFederalCredit && hasFederalCredit ? vehicle.federalTaxCredit.amount : 0) + stateRebate

  return (
    <div className="card overflow-hidden border-2 border-brand-blue/20 md:hidden">
      {/* Header */}
      <div className="bg-brand-blue-light px-4 py-3 border-b border-brand-blue/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-blue uppercase tracking-wider">Quick Estimate</span>
          <span className="text-xs text-brand-blue/70">Configure below</span>
        </div>
      </div>

      {/* Big monthly number */}
      <div className="px-4 pt-5 pb-3 text-center border-b border-border">
        <div className="text-xs text-ink-subtle mb-1 uppercase tracking-wider">Est. Monthly Total</div>
        <div className="text-4xl font-semibold text-ink tabular-nums">
          {formatCurrency(tco.monthlyTotal)}
          <span className="text-lg font-normal text-ink-muted">/mo</span>
        </div>
        <div className="text-xs text-ink-subtle mt-1">
          Payment + charging + insurance + maintenance
        </div>

        {/* Monthly breakdown pills */}
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {[
            { label: calc.mode === 'lease' ? 'Lease' : calc.mode === 'finance' ? 'Loan' : 'Cash', value: tco.monthlyPayment },
            { label: 'Charging', value: tco.monthlyCharging },
            { label: 'Insurance', value: tco.monthlyInsurance },
            { label: 'Maint.', value: tco.monthlyMaintenance },
          ].filter(r => r.value > 0).map(({ label, value }) => (
            <div key={label} className="text-center bg-surface-sunken rounded-lg px-3 py-1.5">
              <div className="text-xs text-ink-subtle">{label}</div>
              <div className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick inputs */}
      <div className="px-4 py-4 space-y-4">
        {/* State */}
        <div>
          <label className="section-label block mb-1.5">Your State</label>
          <select
            value={userPrefs.state}
            onChange={e => userPrefs.setState(e.target.value, 'manual')}
            className="input-base"
            aria-label="Select your state"
          >
            {STATE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Mode toggle */}
        <div>
          <label className="section-label block mb-2">Purchase Mode</label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {['finance', 'lease', 'cash'].map(mode => (
              <button
                key={mode}
                onClick={() => set({ mode })}
                className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                  calc.mode === mode ? 'bg-brand-blue text-white' : 'bg-surface-raised text-ink-muted hover:bg-surface-sunken'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Annual mileage */}
        <div>
          <label className="section-label block mb-1.5">
            Annual Mileage — {userPrefs.annualMileage?.toLocaleString()} mi/yr
          </label>
          <input
            type="range" min={5000} max={25000} step={1000}
            value={userPrefs.annualMileage}
            onChange={e => userPrefs.setFinancialProfile({ annualMileage: Number(e.target.value) })}
            className="w-full accent-brand-blue"
            aria-label="Annual mileage"
          />
          <div className="flex justify-between text-xs text-ink-subtle mt-1">
            <span>5k</span><span>15k</span><span>25k</span>
          </div>
        </div>

        {/* Home charging toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-ink">Home charging</span>
            <div className="text-xs text-ink-subtle">Level 2 EVSE installed at home</div>
          </div>
          <button
            role="switch"
            aria-checked={userPrefs.hasHomeCharger}
            onClick={() => userPrefs.setFinancialProfile({ hasHomeCharger: !userPrefs.hasHomeCharger })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              userPrefs.hasHomeCharger ? 'bg-brand-blue' : 'bg-border'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              userPrefs.hasHomeCharger ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </label>

        {/* Federal credit toggle (only if eligible) */}
        {hasFederalCredit && (
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-ink">Apply ${vehicle.federalTaxCredit.amount.toLocaleString()} federal credit</span>
              <div className="text-xs text-ink-subtle">Reduces effective purchase price</div>
            </div>
            <button
              role="switch"
              aria-checked={calc.applyFederalCredit}
              onClick={() => set({ applyFederalCredit: !calc.applyFederalCredit })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                calc.applyFederalCredit ? 'bg-brand-blue' : 'bg-border'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                calc.applyFederalCredit ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>
        )}
      </div>

      {/* Incentives summary */}
      {totalIncentives > 0 && (
        <div className="mx-4 mb-4 bg-status-green-bg border border-status-green/20 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-status-green font-medium">Est. incentives available</span>
          <span className="text-sm font-semibold text-status-green">{formatCurrency(totalIncentives)}</span>
        </div>
      )}

      {/* Expand button */}
      <div className="px-4 pb-4">
        <button
          onClick={onExpand}
          className="w-full btn-primary justify-center py-3 text-sm"
        >
          Full Calculator — 7 tabs →
        </button>
        <p className="text-center text-xs text-ink-subtle mt-2">
          Includes lease calculator, dealer programs, depreciation & more
        </p>
      </div>
    </div>
  )
}
