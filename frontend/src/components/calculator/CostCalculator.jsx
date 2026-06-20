import { useState, useEffect } from 'react'
import { buildShareUrl } from '../../utils/calcUrlState'
import { useIncentives, offerForTrim } from '../../utils/incentivesByVehicle'
import { useEAOffers, eaOfferFor, eaMonthlyChargingSavings } from '../../utils/electrifyAmerica'
import { useLeaseCalc, leaseCalcFor, LEASE_ASSUMPTIONS } from '../../utils/leaseCalcData'
import { useCalculatorStore } from '../../store/calculatorStore'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { getStateFees } from '../../utils/stateFeesData'
import { getStateIncentives, getEffectiveIncentiveAmount } from '../../utils/incentivesData'
import { STATE_ELECTRICITY_RATES } from '../../utils/chargingCostCalculator'
import { calculateTCO } from '../../utils/tcoCalculator'
import { calculateLeasePayment, mfToApr, leaseScoreLabel, percentageRuleLabel } from '../../utils/leaseCalculator'
import { formatCurrency, formatPercent, formatMoneyFactor } from '../../utils/formatCurrency'
import { DepreciationChart } from './DepreciationCalc'
import { STATE_OPTIONS } from '../../utils/stateFeesData'
import { calculateProgramSavings } from '../../utils/dealerPrograms'
import DealerProgramsPanel from './DealerProgramsPanel'
import { getResidualBenchmark } from '../../utils/residualBenchmarks'
import { getSmartChargePrograms } from '../../utils/smartChargePrograms'

const TABS = ['Purchase & Incentives', 'Charging', 'Ongoing Costs', 'True Cost Summary']

// Build an Edmunds deals page URL from vehicle data
function buildEdmundsDealsUrl(vehicle) {
  const makeSlug = (vehicle.make || '').toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '')
  const modelSlug = (vehicle.model || '').toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '')
  const year = vehicle.year || new Date().getFullYear()
  return `https://www.edmunds.com/${makeSlug}/${modelSlug}/${year}/deals/`
}

// ─── Tab 1 (merged): Purchase & Incentives ────────────────────────────────
function AcquisitionTab({ vehicle, calc, set, userPrefs, stateData, stateIncentives, tco, effectiveProgramSavings, programSavings, nyOffer, nyCashApplied, offerMode }) {
  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const baseMsrp = trim?.msrp || 0
  const usingUserPrice = calc.userInputPrice != null && calc.userInputPrice > 0
  const msrp = usingUserPrice ? calc.userInputPrice : baseMsrp
  const totalDiscount = (calc.dealerDiscount || 0) + effectiveProgramSavings
  const sellingPrice = msrp - totalDiscount

  const estimatedStateTotal = stateIncentives
    .filter((i) => i.appliesTo?.includes('new') && (i.type === 'rebate' || i.type === 'tax_credit'))
    .reduce((sum, i) => sum + getEffectiveIncentiveAmount(i, msrp), 0)
  const usingManualOverride = calc.manualIncentiveOverride != null && calc.manualIncentiveOverride >= 0

  // Effective sales tax — user override takes precedence over state default
  const stateTaxPercent = stateData?.salesTaxPercent ?? 0
  const effectiveTaxPercent = calc.salesTaxOverride ?? stateTaxPercent
  const usingTaxOverride = calc.salesTaxOverride != null

  const edmundsUrl = buildEdmundsDealsUrl(vehicle)
  const offerLastUpdated = vehicle.offerLastUpdated

  function setPrograms(programs) { set({ dealerPrograms: programs }) }

  return (
    <div className="space-y-6">

      {/* NY (ZIP 10005) manufacturer offer — applied to the numbers below */}
      {nyOffer && !nyOffer.stale && (nyOffer.cashRebate || nyOffer.apr != null || nyOffer.monthlyPayment || nyOffer.leaseCash) && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-light px-3 py-2 text-[12px] leading-snug text-brand-blue">
          <div className="flex items-start gap-2">
            <span aria-hidden="true"></span>
            <span>
              <strong>New York manufacturer offer</strong> (ZIP&nbsp;10005, {trim?.name || 'base trim'}):{' '}
              {offerMode === 'lease'
                ? <>{
                    nyOffer.terms && Object.keys(nyOffer.terms).length
                      ? Object.keys(nyOffer.terms).sort().map((k, i) => (
                          <span key={k}>{i > 0 ? ' · ' : ''}{formatCurrency(nyOffer.terms[k].monthlyPayment)}/mo for {k} mo{nyOffer.terms[k].dueAtSigning ? ` (${formatCurrency(nyOffer.terms[k].dueAtSigning)} down)` : ''}</span>
                        ))
                      : 'no advertised lease payment'
                  }.</>
                : offerMode === 'finance'
                  ? <>{nyOffer.apr != null ? `${nyOffer.apr}% APR for ${nyOffer.termMonths} mo` : 'APR offer'}{nyOffer.cashRebate ? ` + ${formatCurrency(nyOffer.cashRebate)} cash` : ''}{nyCashApplied ? ' — applied below.' : '.'}</>
                  : <>{formatCurrency(nyOffer.cashRebate)} manufacturer cash{nyCashApplied ? ' — applied to the price below.' : ' (your manual override is in use).'}</>}
            </span>
          </div>
          {/* Lease cash — informational popup; NOT applied to any total. */}
          {nyOffer.leaseCash > 0 && (
            <div className="mt-1 ml-6 text-[11px] text-status-yellow">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-status-yellow-bg border border-status-yellow/30 px-1.5 py-0.5 font-medium cursor-help"
                title={`Lease cash of ${formatCurrency(nyOffer.leaseCash)} is available only when leasing through the manufacturer's captive lender. It is shown for reference and is NOT included in the True Cost totals.`}
              >
                +{formatCurrency(nyOffer.leaseCash)} lease cash ⓘ
              </span>{' '}
              <span>shown for reference — not included in totals.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Part 1: Mode, trim, state, trade-in, online price ── */}
      <div className="space-y-4">
        {/* Mode toggle */}
        <div>
          <label className="section-label block mb-2">Purchase Mode</label>
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            {['cash', 'finance', 'lease'].map((mode) => (
              <button
                key={mode}
                onClick={() => set({ mode })}
                className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
                  calc.mode === mode
                    ? 'bg-brand-blue text-white'
                    : 'bg-surface-raised text-ink-muted hover:bg-surface-sunken'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Trim */}
          {vehicle.trims?.length > 1 && (
            <div>
              <label className="section-label block mb-1.5">Trim</label>
              <select
                value={calc.selectedTrimIndex}
                onChange={(e) => set({ selectedTrimIndex: Number(e.target.value) })}
                className="input-base"
              >
                {vehicle.trims.map((t, i) => (
                  <option key={i} value={i}>{t.name} — {formatCurrency(t.msrp)}</option>
                ))}
              </select>
            </div>
          )}

          {/* State */}
          <div>
            <label className="section-label block mb-1.5">Your State</label>
            <select
              value={userPrefs.state}
              onChange={(e) => userPrefs.setState(e.target.value, 'manual')}
              className="input-base"
            >
              {STATE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Trade-in */}
          <div>
            <label className="section-label block mb-1.5">Trade-in Value</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
              <input
                type="number" value={calc.tradeInValue}
                onChange={(e) => set({ tradeInValue: Number(e.target.value) })}
                className="input-base pl-7" min={0} step={500}
              />
            </div>
          </div>

          {/* Online listing price */}
          <div className="sm:col-span-2">
            <label className="section-label block mb-1.5">Your Online Price <span className="text-ink-subtle font-normal">(optional)</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
              <input
                type="number"
                value={calc.userInputPrice ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  set({ userInputPrice: raw === '' ? null : Number(raw) })
                }}
                placeholder={baseMsrp ? baseMsrp.toLocaleString() : 'MSRP'}
                className="input-base pl-7" min={0} step={100}
              />
            </div>
            {usingUserPrice ? (
              <p className="text-xs text-status-green mt-1">Using your online price of {formatCurrency(calc.userInputPrice)} — MSRP is {formatCurrency(baseMsrp)}.</p>
            ) : (
              <p className="text-xs text-ink-subtle mt-1">Found this car listed online for a different price? Paste it here — specs stay the same.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Incentives (directly below online price) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-ink">Incentives</h3>
          <a
            href={edmundsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-blue hover:underline flex items-center gap-1 shrink-0"
          >
            View current offers on Edmunds ↗
          </a>
        </div>

        {/* Manual override — Edmunds link prompts them to look up real numbers */}
        <div className={`rounded-lg border p-4 mb-4 ${usingManualOverride ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-sunken'}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg">✏</span>
            <h4 className="font-semibold text-ink text-sm">Have a real number? Enter it here</h4>
          </div>
          <p className="text-xs text-ink-muted mb-3 leading-relaxed">
            Click <em>View current offers on Edmunds</em> above to see live dealer incentives, then enter your total below.
            Your figure overrides every estimate and drives the True Cost Summary.
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
              <input
                type="number" min={0} step={250}
                value={calc.manualIncentiveOverride ?? ''}
                placeholder={estimatedStateTotal ? estimatedStateTotal.toLocaleString() : '0'}
                onChange={(e) => {
                  const raw = e.target.value
                  set({ manualIncentiveOverride: raw === '' ? null : Math.max(0, Number(raw)) })
                }}
                className="input-base pl-7"
                aria-label="Total incentive override"
              />
            </div>
            {usingManualOverride && (
              <button
                type="button"
                onClick={() => set({ manualIncentiveOverride: null })}
                className="text-xs text-brand-blue hover:underline shrink-0"
              >
                Use estimate instead
              </button>
            )}
          </div>
          <p className={`text-xs mt-1.5 ${usingManualOverride ? 'text-brand-blue' : 'text-ink-subtle'}`}>
            {usingManualOverride
              ? `Using your figure of ${formatCurrency(calc.manualIncentiveOverride)} — the estimates below are ignored in totals.`
              : `Site estimate for ${stateData?.name || 'your state'}: ${formatCurrency(estimatedStateTotal)} (state only — federal credit repealed).`}
          </p>
        </div>

        {/* Federal credit notice */}
        <div className="bg-status-yellow-bg border border-status-yellow/30 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0"></span>
            <div>
              <div className="font-semibold text-status-yellow text-sm">Federal EV Tax Credit Eliminated</div>
              <p className="text-xs text-status-yellow mt-1 leading-relaxed">
                The $7,500 federal EV tax credit (IRA Section 30D) was repealed in 2025.
                No federal credit is currently available for new EV purchases.
              </p>
              <a
                href="https://www.irs.gov/credits-deductions/credits-for-new-clean-vehicles-purchased-in-2023-or-after"
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand-blue hover:underline mt-2 block"
              >
                IRS Clean Vehicle Credits page (verify current status) ↗
              </a>
            </div>
          </div>
        </div>

        {/* State incentives */}
        <div className="mb-4">
          <h4 className="font-medium text-ink text-sm mb-2">State Incentives — {stateData?.name}</h4>
          {stateIncentives.filter((i) => i.appliesTo?.includes('new')).length > 0 ? (
            <div className="space-y-2">
              {stateIncentives.filter((i) => i.appliesTo?.includes('new')).map((incentive, idx) => {
                const overCap = incentive.maxMsrp && msrp >= incentive.maxMsrp
                const eff = getEffectiveIncentiveAmount(incentive, msrp)
                return (
                <div key={idx} className="border border-border rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-medium text-sm text-ink">{incentive.name}</div>
                      {incentive.notes && <p className="text-xs text-ink-muted mt-0.5">{incentive.notes}</p>}
                      {overCap && incentive.reducedAmount != null && (
                        <p className="text-xs text-status-yellow mt-0.5">Reduced to {formatCurrency(incentive.reducedAmount)} — MSRP is at or above the {formatCurrency(incentive.maxMsrp)} cap.</p>
                      )}
                      {overCap && incentive.reducedAmount == null && (
                        <p className="text-xs text-status-red mt-0.5">Not eligible — MSRP exceeds the {formatCurrency(incentive.maxMsrp)} program maximum.</p>
                      )}
                    </div>
                    {eff > 0 && (
                      <span className="badge badge-green shrink-0">{formatCurrency(eff)}</span>
                    )}
                  </div>
                  {incentive.url && (
                    <a href={incentive.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline mt-1 block">
                      Learn more ↗
                    </a>
                  )}
                </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-surface-sunken rounded-lg p-4 text-sm text-ink-muted">
              No state EV rebates found for {stateData?.name}. Programs change frequently — verify with your state energy office.
            </div>
          )}
        </div>

        {/* State fees */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-ink text-sm">State & Registration Fees</h4>
            {usingTaxOverride && (
              <span className="text-[10px] font-medium text-brand-blue bg-brand-blue-light border border-brand-blue/20 rounded-full px-2 py-0.5">
                Custom tax rate
              </span>
            )}
          </div>
          <div className="bg-surface-sunken rounded-lg p-4 space-y-3 text-sm">

            {/* Editable sales-tax row */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-muted shrink-0">Sales Tax</span>
                <div className="flex items-center gap-2">
                  {usingTaxOverride && (
                    <button
                      type="button"
                      onClick={() => set({ salesTaxOverride: null })}
                      className="text-[10px] text-brand-blue hover:underline whitespace-nowrap"
                    >
                      Reset to {stateTaxPercent}%
                    </button>
                  )}
                  <div className="relative w-24">
                    <input
                      type="number"
                      step={0.1} min={0} max={20}
                      value={effectiveTaxPercent}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value)
                        set({ salesTaxOverride: v })
                      }}
                      className={`input-base text-right pr-6 py-1.5 text-sm w-full ${usingTaxOverride ? 'border-brand-blue ring-1 ring-brand-blue/20' : ''}`}
                      aria-label="Sales tax rate"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-subtle pointer-events-none">%</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-ink-subtle mt-0.5">
                <span>
                  {usingTaxOverride
                    ? `Override — ${stateData?.name} default is ${stateTaxPercent}%`
                    : `${stateData?.name} state rate (auto-filled)`}
                </span>
                <span>= {formatCurrency(effectiveTaxPercent / 100 * msrp)}</span>
              </div>
            </div>

            <div className="flex justify-between"><span className="text-ink-muted">Registration Fee</span><span>{formatCurrency(stateData.registrationFeeUsd)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Title Fee</span><span>{formatCurrency(stateData.titleFeeUsd)}</span></div>
            {stateData.inspectionFeeUsd > 0 && <div className="flex justify-between"><span className="text-ink-muted">Inspection Fee</span><span>{formatCurrency(stateData.inspectionFeeUsd)}</span></div>}
            {stateData.evSurchargeUsd > 0 && <div className="flex justify-between"><span className="text-ink-muted">EV Registration Surcharge</span><span>{formatCurrency(stateData.evSurchargeUsd)}</span></div>}
            <div className="flex justify-between items-center">
              <span className="text-ink-muted flex items-center gap-1">
                Annual EV Road Use Fee
                <span title="Most states justify EV road use fees as a replacement for the gas tax, which EVs don't pay. Critics argue some fees are disproportionately high. 31 states levy these fees ranging from $50 to $294/year." className="cursor-help text-xs bg-surface-sunken rounded-full w-4 h-4 flex items-center justify-center border border-border">ℹ</span>
              </span>
              <span>{stateData.annualEvRoadFeeUsd > 0 ? formatCurrency(stateData.annualEvRoadFeeUsd) + '/yr' : 'None'}</span>
            </div>
            {stateData.leaseCapCostTaxed && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-status-yellow bg-status-yellow-bg rounded p-2">
                  {stateData.name} taxes the full capitalized cost of a lease at inception, not just the monthly payment. This can add thousands to lease costs.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Part 2: Discount, mileage, ownership term ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Dealer discount */}
        <div>
          <label className="section-label block mb-1.5">Additional Dealer Discount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number" value={calc.dealerDiscount}
              onChange={(e) => set({ dealerDiscount: Number(e.target.value) })}
              className="input-base pl-7" min={0} step={100}
            />
          </div>
          <p className="text-xs text-ink-subtle mt-1">Any negotiated discount beyond buying programs below</p>
        </div>

        {/* Annual mileage */}
        <div className="sm:col-span-2">
          <label className="section-label block mb-1.5">
            Annual Mileage — {userPrefs.annualMileage?.toLocaleString()} miles/year
          </label>
          <input
            type="range" min={3000} max={25000} step={1000}
            value={userPrefs.annualMileage}
            onChange={(e) => userPrefs.setFinancialProfile({ annualMileage: Number(e.target.value) })}
            className="w-full accent-brand-blue" aria-label="Annual mileage"
          />
          <div className="flex justify-between text-xs text-ink-subtle mt-1">
            <span>3,000</span><span>12,000</span><span>25,000</span>
          </div>
        </div>

        {/* Ownership years — hidden for leases (term is fixed by the lease contract) */}
        {calc.mode !== 'lease' && (
          <div className="sm:col-span-2">
            <label className="section-label block mb-1.5">
              Ownership Period — {userPrefs.ownershipYears} year{userPrefs.ownershipYears !== 1 ? 's' : ''}
            </label>
            <input
              type="range" min={1} max={10} step={1}
              value={userPrefs.ownershipYears}
              onChange={(e) => userPrefs.setFinancialProfile({ ownershipYears: Number(e.target.value) })}
              className="w-full accent-brand-blue" aria-label="Ownership period"
            />
          </div>
        )}
      </div>

      {/* ── Finance / Lease inputs (mode-conditional) ── */}
      {calc.mode !== 'cash' && (
        <div>
          <h3 className="font-semibold text-ink mb-3">
            {calc.mode === 'finance' ? 'Financing Details' : 'Lease Details'}
          </h3>
          {offerLastUpdated && (
            <p className="text-[11px] text-ink-subtle mb-3">
              Offer last refreshed {String(offerLastUpdated).slice(0, 10)}
            </p>
          )}
          {calc.mode === 'finance' && (
            <FinanceInputs calc={calc} set={set} msrp={msrp} userPrefs={userPrefs} stateData={stateData} tco={tco} />
          )}
          {calc.mode === 'lease' && (
            <LeaseInputs calc={calc} set={set} trim={trim} msrp={msrp} vehicle={vehicle} userPrefs={userPrefs} stateData={stateData} tco={tco} />
          )}
        </div>
      )}

      {/* ── Dealer Programs ── */}
      <DealerProgramsPanel
        make={vehicle.make}
        programs={calc.dealerPrograms || {}}
        onChange={setPrograms}
        totalSavings={programSavings}
      />

      {/* ── Price Summary ── */}
      <div className="bg-surface-sunken rounded-lg p-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">
              {usingUserPrice ? `Your Online Price (${trim?.name || 'Base'} specs)` : `MSRP (${trim?.name || 'Base'})`}
            </span>
            <span className="font-medium">{formatCurrency(msrp)}</span>
          </div>
          {usingUserPrice && baseMsrp > 0 && (
            <div className="flex justify-between text-xs text-ink-subtle">
              <span>MSRP for reference</span>
              <span>{formatCurrency(baseMsrp)}</span>
            </div>
          )}
          {effectiveProgramSavings > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted flex items-center gap-1">Buying Program Savings</span>
              <span className="text-status-green font-medium">−{formatCurrency(effectiveProgramSavings)}</span>
            </div>
          )}
          {calc.dealerDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Additional Dealer Discount</span>
              <span className="text-status-green font-medium">−{formatCurrency(calc.dealerDiscount)}</span>
            </div>
          )}
          {calc.tradeInValue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Trade-in Value</span>
              <span className="text-status-green font-medium">−{formatCurrency(calc.tradeInValue)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border mt-2">
            <span>Selling Price</span>
            <span>{formatCurrency(sellingPrice)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-xs text-status-green">
              <span>Total savings off MSRP</span>
              <span>−{formatCurrency(totalDiscount)}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// Live True Cost preview bar — pinned to bottom of the card on tab 0
function LiveCostBar({ tco, mode, ownershipYears, leaseTermMonths = 36 }) {
  const modeLabel = mode === 'finance' ? 'Loan' : mode === 'lease' ? 'Lease' : 'Cash'
  // A lease only runs for its term, so the "total" should cover the lease period
  // (2 yr for 24 mo, 3 yr for 36 mo) — not the 5-year ownership horizon used for
  // cash/finance. Total over the lease = all monthly costs across the term plus
  // the upfront due-at-signing (minus the first month, already in the monthly).
  const isLease = mode === 'lease'
  const leaseMonths = leaseTermMonths || 36
  const periodYears = isLease ? Math.round(leaseMonths / 12) : ownershipYears
  const upfront = Math.max(0, (tco.leaseDetails?.dueAtSigning || 0) - (tco.leaseDetails?.totalMonthly || 0))
  const periodTotal = isLease
    ? Math.round((tco.monthlyTotal || 0) * leaseMonths + upfront)
    : tco.totalCost
  return (
    <div className="border-t border-white/20 bg-brand-blue text-white">
      <div className="flex items-center justify-between px-5 py-3 gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm opacity-80 shrink-0">
          <span></span>
          <span className="font-medium">Live True Cost</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {tco.monthlyPayment > 0 && (
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide opacity-70">{modeLabel} Payment</div>
              <div className="text-lg font-semibold tabular-nums leading-tight">
                {formatCurrency(tco.monthlyPayment)}<span className="text-xs font-normal opacity-70">/mo</span>
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wide opacity-70">Total Monthly Cost</div>
            <div className="text-xl font-bold tabular-nums leading-tight">
              {formatCurrency(tco.monthlyTotal)}<span className="text-sm font-normal opacity-70">/mo</span>
            </div>
          </div>
          <div className="text-center hidden sm:block">
            <div className="text-[10px] uppercase tracking-wide opacity-70">{periodYears}-Year Total</div>
            <div className="text-lg font-semibold tabular-nums leading-tight">{formatCurrency(periodTotal)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CostCalculator({ vehicle }) {
  const [activeTab, setActiveTab] = useState(0)
  const { getVehicleCalc, setVehicleCalc } = useCalculatorStore()
  const userPrefs = useUserPreferencesStore()
  const calc = getVehicleCalc(vehicle.id)

  const set = (updates) => setVehicleCalc(vehicle.id, updates)

  const stateData = getStateFees(userPrefs.state)
  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const msrp = trim?.msrp || vehicle.msrpFrom || 0

  // ── NY (ZIP 10005) manufacturer offer for this trim + pay plan ────────────
  // Single source of truth shared with Browse + Matcher. We auto-apply the
  // manufacturer CASH back (reduces selling price for every mode) and seed the
  // finance APR from the NY offer the first time a trim/mode is selected, while
  // still letting the user edit those fields afterward (guarded by _nyOfferKey).
  const incMap = useIncentives()
  const offerMode = calc.mode === 'lease' ? 'lease' : calc.mode === 'cash' ? 'cash' : 'finance'
  const nyOffer = offerForTrim(incMap[vehicle.id] || null, trim?.name, offerMode, msrp)
  const nyCash = nyOffer?.cashRebate || 0
  const offerKey = `${vehicle.id}:${calc.selectedTrimIndex}:${offerMode}:${nyOffer?.scrapedAt || ''}`

  useEffect(() => {
    if (!nyOffer || calc._nyOfferKey === offerKey) return
    const updates = { _nyOfferKey: offerKey }
    if (offerMode === 'finance' && nyOffer.apr != null) updates.financeApr = nyOffer.apr
    setVehicleCalc(vehicle.id, updates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey])

  // Auto-compute electricity rate from state if not overridden
  const electricityRate = userPrefs.electricityRateCentsPerKwh
    ?? STATE_ELECTRICITY_RATES[userPrefs.state] ?? 18

  const stateIncentives = getStateIncentives(userPrefs.state)

  // Dealer program savings applied to selling price
  const programSavings = calculateProgramSavings(calc.dealerPrograms || {}, vehicle.make)
  const effectiveProgramSavings = calc.dealerPrograms?.manualAmount ?? programSavings

  // Fold the NY manufacturer cash into the selling price (cash back behaves like
  // a dealer discount across cash/finance/lease) unless the user has entered a
  // manual incentive override, which already represents their real out-of-pocket.
  const usingManualOverride = calc.manualIncentiveOverride != null && calc.manualIncentiveOverride >= 0
  const nyCashApplied = usingManualOverride ? 0 : nyCash

  // Edmunds lease-calculator data → seed the residual % for the selected trim +
  // lease term, so the lease math reflects the scraped residual. The user can
  // still edit it; we only re-seed when the trim or term changes.
  const leaseCalcRec = useLeaseCalc()[vehicle.id] || null
  const leaseTermSel = calc.leaseTermMonths || 36
  const scrapedLease = leaseCalcRec ? leaseCalcFor(leaseCalcRec, trim?.name, leaseTermSel) : null
  useEffect(() => {
    if (!scrapedLease || scrapedLease.residualValue == null) return
    const key = `${vehicle.id}:${calc.selectedTrimIndex}:${leaseTermSel}`
    if (calc._leaseCalcKey === key) return
    // Re-seed BOTH the residual and the money factor whenever the trim or lease
    // term changes, so the MF tracks the selected trim/term (it was static
    // before). Scraped MF varies by term; falls back to the default until the
    // lease scraper captures a per-term money factor.
    const seed = { _leaseCalcKey: key, leaseResidualPercent: scrapedLease.residualValue }
    if (scrapedLease.moneyFactor != null) seed.leaseMoneyFactor = scrapedLease.moneyFactor
    setVehicleCalc(vehicle.id, seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id, calc.selectedTrimIndex, leaseTermSel, scrapedLease?.residualValue, scrapedLease?.moneyFactor])

  // Complimentary Electrify America charging → monthly DC-fast-charging savings.
  const eaOffer = eaOfferFor(useEAOffers(), vehicle.id)
  const eaSavings = eaOffer
    ? eaMonthlyChargingSavings({
        offer: eaOffer,
        annualMiles: userPrefs.annualMileage || 12000,
        milesPerKwh: vehicle.specs?.milesPerKwh || trim?.specs?.milesPerKwh || 3.5,
        dcFastSharePct: userPrefs.chargingMixPercent?.dcFast ?? 10,
        dcfcRate: userPrefs.dcfcRateCentsPerKwh ? userPrefs.dcfcRateCentsPerKwh / 100 : 0.45,
        ownershipYears: userPrefs.ownershipYears || 5,
      })
    : { monthly: 0 }

  const tco = calculateTCO({
    vehicle,
    calcState: {
      ...calc,
      dealerDiscount: (calc.dealerDiscount || 0) + effectiveProgramSavings + nyCashApplied,
      eaChargingSavingsMonthly: eaSavings.monthly,
      // Scraped Edmunds MSRP + selling price for the selected trim/term. Used as
      // the price basis (and residual basis) so the lease residual is never $0
      // when the trim's own msrp is missing.
      leaseScrapedMsrp: scrapedLease?.msrp ?? null,
      leaseScrapedSellingPrice: scrapedLease?.sellingPrice ?? null,
      // EV lease cash (lease-only) → applied to the lease cap cost so it lowers
      // the monthly TCO. Prefer the Edmunds lease-CALCULATOR cash for the
      // selected trim+term (the figure shown in the lease-basis banner), which
      // varies per trim — not the flat amount from the older incentives scrape.
      leaseCashIncentive: calc.mode === 'lease'
        ? (scrapedLease?.cashIncentives ?? nyOffer?.leaseCash ?? 0)
        : 0,
    },
    userPrefs: { ...userPrefs, electricityRateCentsPerKwh: electricityRate },
    stateData,
  })

  return (
    <div className="card overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === i
                  ? 'text-brand-blue border-brand-blue'
                  : 'text-ink-muted border-transparent hover:text-ink'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {/* Edmunds lease basis — residual seeded into the lease math below */}
        {calc.mode === 'lease' && scrapedLease && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue-light px-3 py-2 text-[12px] leading-snug text-brand-blue">
            <span aria-hidden="true"></span>
            <span>
              <strong>Edmunds lease basis</strong> ({leaseTermSel} mo, {LEASE_ASSUMPTIONS}):
              {' '}{scrapedLease.residualValue}% residual{scrapedLease.taxesAndFees != null ? `, ${formatCurrency(scrapedLease.taxesAndFees)} taxes & fees` : ''}{scrapedLease.cashIncentives ? `, ${formatCurrency(scrapedLease.cashIncentives)} cash incentive` : ''}. Residual and money factor are applied below; edit either to match your actual quote.
              {scrapedLease.moneyFactor != null && <> The seeded MF ({scrapedLease.moneyFactor.toFixed(5)}, {(scrapedLease.moneyFactor * 2400).toFixed(2)}% APR) is the Edmunds market rate — manufacturer promotional programs often use a much lower MF.</>}
              {nyOffer?.leaseCash > 0 && (
                <> <strong>−{formatCurrency(nyOffer.leaseCash)} lease cash</strong> applied to the cap cost.</>
              )}
            </span>
          </div>
        )}
        {/* Complimentary Electrify America charging — reflected in charging cost */}
        {eaOffer && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-green/30 bg-status-green-bg px-3 py-2 text-[12px] leading-snug text-status-green">
            <span aria-hidden="true"></span>
            <span>
              <strong>{eaOffer.provider} complimentary charging:</strong> {eaOffer.summary}.
              {eaSavings.monthly > 0 && <> About <strong>{formatCurrency(eaSavings.monthly)}/mo</strong> of free DC fast charging is reflected in the charging cost (amortized over {userPrefs.ownershipYears || 5} yrs).</>}
              {' '}Enroll via {eaOffer.enroll}. Terms vary — verify the current offer.
            </span>
          </div>
        )}
        {activeTab === 0 && (
          <AcquisitionTab
            vehicle={vehicle} calc={calc} set={set} userPrefs={userPrefs}
            stateData={stateData} stateIncentives={stateIncentives} tco={tco}
            effectiveProgramSavings={effectiveProgramSavings} programSavings={programSavings}
            nyOffer={nyOffer} nyCashApplied={nyCashApplied} offerMode={offerMode}
          />
        )}
        {activeTab === 1 && <ChargingTab vehicle={vehicle} calc={calc} set={set} userPrefs={userPrefs} electricityRate={electricityRate} tco={tco} state={userPrefs.state} />}
        {activeTab === 2 && <OngoingTab vehicle={vehicle} calc={calc} set={set} tco={tco} />}
        {activeTab === 3 && <SummaryTab tco={tco} vehicle={vehicle} calc={calc} userPrefs={userPrefs} effectiveProgramSavings={effectiveProgramSavings} />}
      </div>

      {/* Live True Cost bar — persists across every tab so the running
          total stays visible while editing charging, ongoing costs, etc. */}
      <LiveCostBar tco={tco} mode={calc.mode} ownershipYears={userPrefs.ownershipYears} leaseTermMonths={calc.leaseTermMonths} />
    </div>
  )
}

// ─── Tab 1: Purchase Setup ─────────────────────────────────────────────────
function PurchaseTab({ vehicle, calc, set, userPrefs, effectiveProgramSavings, programSavings }) {
  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const baseMsrp = trim?.msrp || 0
  // When the buyer provides an online listing price, treat it as the basis
  // for sales tax, finance principal, and lease cap cost. Specs stay tied
  // to the selected trim.
  const usingUserPrice = calc.userInputPrice != null && calc.userInputPrice > 0
  const msrp = usingUserPrice ? calc.userInputPrice : baseMsrp
  const totalDiscount = (calc.dealerDiscount || 0) + effectiveProgramSavings
  const sellingPrice = msrp - totalDiscount

  function setPrograms(programs) {
    set({ dealerPrograms: programs })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Mode toggle */}
        <div className="sm:col-span-2">
          <label className="section-label block mb-2">Purchase Mode</label>
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            {['cash', 'finance', 'lease'].map((mode) => (
              <button
                key={mode}
                onClick={() => set({ mode })}
                className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
                  calc.mode === mode
                    ? 'bg-brand-blue text-white'
                    : 'bg-surface-raised text-ink-muted hover:bg-surface-sunken'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Trim selector */}
        {vehicle.trims?.length > 1 && (
          <div>
            <label className="section-label block mb-1.5">Trim</label>
            <select
              value={calc.selectedTrimIndex}
              onChange={(e) => set({ selectedTrimIndex: Number(e.target.value) })}
              className="input-base"
            >
              {vehicle.trims.map((t, i) => (
                <option key={i} value={i}>
                  {t.name} — {formatCurrency(t.msrp)}{t.specs?.range ? ` · ${t.specs.range} mi` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* State */}
        <div>
          <label className="section-label block mb-1.5">Your State</label>
          <select
            value={userPrefs.state}
            onChange={(e) => userPrefs.setState(e.target.value, 'manual')}
            className="input-base"
          >
            {STATE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Trade-in */}
        <div>
          <label className="section-label block mb-1.5">Trade-in Value</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number"
              value={calc.tradeInValue}
              onChange={(e) => set({ tradeInValue: Number(e.target.value) })}
              className="input-base pl-7"
              min={0}
              step={500}
            />
          </div>
        </div>

        {/* Online listing price (optional override) */}
        <div className="sm:col-span-2">
          <label className="section-label block mb-1.5">Your Online Price (optional)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number"
              value={calc.userInputPrice ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                set({ userInputPrice: raw === '' ? null : Number(raw) })
              }}
              placeholder={baseMsrp ? baseMsrp.toLocaleString() : 'MSRP'}
              className="input-base pl-7"
              min={0}
              step={100}
            />
          </div>
          {usingUserPrice ? (
            <p className="text-xs text-status-green mt-1">
              Using your online price of {formatCurrency(calc.userInputPrice)} — MSRP is {formatCurrency(baseMsrp)}.
            </p>
          ) : (
            <p className="text-xs text-ink-subtle mt-1">
              Found this car listed online for a different price? Paste it here — specs stay the same.
            </p>
          )}
        </div>

        {/* Dealer discount (additional, beyond programs) */}
        <div>
          <label className="section-label block mb-1.5">Additional Dealer Discount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number"
              value={calc.dealerDiscount}
              onChange={(e) => set({ dealerDiscount: Number(e.target.value) })}
              className="input-base pl-7"
              min={0}
              step={100}
            />
          </div>
          <p className="text-xs text-ink-subtle mt-1">Any negotiated discount beyond buying programs below</p>
        </div>

        {/* Annual mileage */}
        <div className="sm:col-span-2">
          <label className="section-label block mb-1.5">
            Annual Mileage — {userPrefs.annualMileage?.toLocaleString()} miles/year
          </label>
          <input
            type="range"
            min={3000} max={25000} step={1000}
            value={userPrefs.annualMileage}
            onChange={(e) => userPrefs.setFinancialProfile({ annualMileage: Number(e.target.value) })}
            className="w-full accent-brand-blue"
            aria-label="Annual mileage"
          />
          <div className="flex justify-between text-xs text-ink-subtle mt-1">
            <span>3,000</span><span>12,000</span><span>25,000</span>
          </div>
        </div>

        {/* Ownership years — hidden for leases (term is fixed by the lease contract) */}
        {calc.mode !== 'lease' && (
          <div className="sm:col-span-2">
            <label className="section-label block mb-1.5">
              Ownership Period — {userPrefs.ownershipYears} year{userPrefs.ownershipYears !== 1 ? 's' : ''}
            </label>
            <input
              type="range"
              min={1} max={10} step={1}
              value={userPrefs.ownershipYears}
              onChange={(e) => userPrefs.setFinancialProfile({ ownershipYears: Number(e.target.value) })}
              className="w-full accent-brand-blue"
              aria-label="Ownership period"
            />
          </div>
        )}
      </div>

      {/* Dealer Programs Panel */}
      <DealerProgramsPanel
        make={vehicle.make}
        programs={calc.dealerPrograms || {}}
        onChange={setPrograms}
        totalSavings={programSavings}
      />

      {/* Price summary */}
      <div className="bg-surface-sunken rounded-lg p-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">
              {usingUserPrice
                ? `Your Online Price (${trim?.name || 'Base'} specs)`
                : `MSRP (${trim?.name || 'Base'})`}
            </span>
            <span className="font-medium">{formatCurrency(msrp)}</span>
          </div>
          {usingUserPrice && baseMsrp > 0 && (
            <div className="flex justify-between text-xs text-ink-subtle">
              <span>MSRP for reference</span>
              <span>{formatCurrency(baseMsrp)}</span>
            </div>
          )}

          {effectiveProgramSavings > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted flex items-center gap-1">
                Buying Program Savings
              </span>
              <span className="text-status-green font-medium">−{formatCurrency(effectiveProgramSavings)}</span>
            </div>
          )}

          {calc.dealerDiscount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Additional Dealer Discount</span>
              <span className="text-status-green font-medium">−{formatCurrency(calc.dealerDiscount)}</span>
            </div>
          )}

          {calc.tradeInValue > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Trade-in Value</span>
              <span className="text-status-green font-medium">−{formatCurrency(calc.tradeInValue)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-border mt-2">
            <span>Selling Price</span>
            <span>{formatCurrency(sellingPrice)}</span>
          </div>

          {totalDiscount > 0 && (
            <div className="flex justify-between text-xs text-status-green">
              <span>Total savings off MSRP</span>
              <span>−{formatCurrency(totalDiscount)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab 2: Finance / Lease ────────────────────────────────────────────────
function FinanceLeaseTab({ vehicle, calc, set, userPrefs, stateData, tco }) {
  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const msrp = trim?.msrp || 0

  // Show when the lease/finance offers were last refreshed by the scraper.
  // Populated by main.py on every run (and by the mid-month leases-only pass).
  const offerLastUpdated = vehicle.offerLastUpdated
  const refreshedNote = offerLastUpdated ? (
    <p className="text-[11px] text-ink-subtle mb-3">
      Offer last refreshed {String(offerLastUpdated).slice(0, 10)}
    </p>
  ) : null

  if (calc.mode === 'cash') {
    return (
      <div className="text-center py-8 text-ink-muted">
        <div className="text-4xl mb-3"></div>
        <p className="font-medium text-ink">Cash Purchase</p>
        <p className="text-sm mt-1">No financing — see the True Cost Summary tab for total costs.</p>
      </div>
    )
  }

  if (calc.mode === 'finance') {
    return <>{refreshedNote}<FinanceInputs calc={calc} set={set} msrp={msrp} userPrefs={userPrefs} stateData={stateData} tco={tco} /></>
  }

  return <>{refreshedNote}<LeaseInputs calc={calc} set={set} trim={trim} msrp={msrp} vehicle={vehicle} userPrefs={userPrefs} stateData={stateData} tco={tco} /></>
}

function FinanceInputs({ calc, set, msrp, userPrefs, stateData, tco }) {
  const downPayment = calc.downPayment ?? Math.round(msrp * (userPrefs.downPaymentPercent / 100))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="section-label block mb-1.5">APR (%)</label>
          <input
            type="number" step={0.25} min={0} max={25}
            value={calc.financeApr}
            onChange={(e) => set({ financeApr: Number(e.target.value) })}
            className="input-base"
          />
        </div>
        <div>
          <label className="section-label block mb-1.5">Loan Term</label>
          <select value={calc.financeTermMonths} onChange={(e) => set({ financeTermMonths: Number(e.target.value) })} className="input-base">
            {[24, 36, 48, 60, 72, 84].map((t) => <option key={t} value={t}>{t} months ({t/12} yr)</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1.5">Down Payment</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number" min={0} step={500}
              value={downPayment}
              onChange={(e) => set({ downPayment: Number(e.target.value) })}
              className="input-base pl-7"
            />
          </div>
        </div>
        <div className="flex items-end">
          <div className="bg-brand-blue-light rounded-lg p-3 w-full">
            <div className="text-xs text-brand-blue font-medium mb-0.5">Monthly Payment</div>
            <div className="text-2xl font-semibold text-brand-blue">
              {formatCurrency(tco.monthlyPayment)}<span className="text-sm font-normal">/mo</span>
            </div>
          </div>
        </div>
      </div>

      {tco.financeDetails && (
        <div className="bg-surface-sunken rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Amount Financed</span><span className="font-medium">{formatCurrency(tco.financeDetails.amountFinanced)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Total Interest</span><span className="font-medium">{formatCurrency(tco.financeDetails.totalInterest)}</span></div>
          <div className="flex justify-between font-semibold border-t border-border pt-2 mt-2"><span>Total Paid</span><span>{formatCurrency(tco.financeDetails.totalPaid)}</span></div>
        </div>
      )}
    </div>
  )
}

function LeaseInputs({ calc, set, trim, msrp, vehicle, userPrefs, stateData, tco }) {
  const offer = trim?.leaseOffers?.[0]
  const mf = calc.leaseMoneyFactor ?? offer?.moneyFactor ?? 0.00125
  const residual = calc.leaseResidualPercent ?? offer?.residualPercent ?? 50
  const ld = tco.leaseDetails

  // Residual benchmark comparison for subvention warning
  const benchmark = getResidualBenchmark(vehicle.bodyStyle, msrp, calc.leaseTermMonths || 36)
  const residualBelowBenchmark = residual < benchmark.min
  const isSubventioned = offer?.isSubventioned

  // Dealer MF markup alert: if user-entered MF is more than 0.0001 above buy-rate
  const buyRateMf = offer?.moneyFactor
  const mfMarkupAlert = buyRateMf && calc.leaseMoneyFactor && (calc.leaseMoneyFactor - buyRateMf) > 0.0001

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="section-label block mb-1.5">Money Factor</label>
          <input
            type="number" step={0.00001} min={0}
            value={mf}
            onChange={(e) => set({ leaseMoneyFactor: Number(e.target.value) })}
            className="input-base font-mono"
          />
          <p className="text-xs text-ink-subtle mt-1">APR equivalent: {mfToApr(mf)}%</p>
        </div>
        <div>
          <label className="section-label block mb-1.5">Residual %</label>
          <input
            type="number" step={0.5} min={20} max={85}
            value={residual}
            onChange={(e) => set({ leaseResidualPercent: Number(e.target.value) })}
            className="input-base"
          />
          <p className="text-xs text-ink-subtle mt-1">Residual value: {formatCurrency(msrp * residual / 100)}</p>
        </div>
        <div>
          <label className="section-label block mb-1.5">Lease Term</label>
          <select value={calc.leaseTermMonths} onChange={(e) => set({ leaseTermMonths: Number(e.target.value) })} className="input-base">
            {[24, 36, 39, 48].map((t) => <option key={t} value={t}>{t} months</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1.5">Annual Mileage</label>
          <select value={calc.leaseMileagePerYear} onChange={(e) => set({ leaseMileagePerYear: Number(e.target.value) })} className="input-base">
            {[7500, 10000, 12000, 15000].map((m) => <option key={m} value={m}>{m.toLocaleString()} mi/yr</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1.5">Cap Cost Reduction (down)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input type="number" min={0} step={500} value={calc.leaseCapCostReduction} onChange={(e) => set({ leaseCapCostReduction: Number(e.target.value) })} className="input-base pl-7" />
          </div>
        </div>
        <div>
          <label className="section-label block mb-1.5">Acquisition Fee</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input type="number" min={0} step={50} value={calc.leaseAcquisitionFee} onChange={(e) => set({ leaseAcquisitionFee: Number(e.target.value) })} className="input-base pl-7" />
          </div>
        </div>
        <div>
          <label className="section-label block mb-1.5">Doc Fee</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input type="number" min={0} step={50} value={calc.leaseDocFee ?? 499} onChange={(e) => set({ leaseDocFee: Number(e.target.value) })} className="input-base pl-7" />
          </div>
        </div>
        <div>
          <label className="section-label block mb-1.5">MSDs (Multiple Security Deposits)</label>
          <input type="number" min={0} max={10} step={1} value={calc.leaseMsdCount} onChange={(e) => set({ leaseMsdCount: Number(e.target.value) })} className="input-base" />
          <p className="text-xs text-ink-subtle mt-1">Each MSD reduces MF by 0.00007 (refundable at lease end)</p>
        </div>
        <div className="flex items-end">
          <div className="bg-brand-blue-light rounded-lg p-3 w-full">
            <div className="text-xs text-brand-blue font-medium mb-0.5">Monthly Payment</div>
            <div className="text-2xl font-semibold text-brand-blue">
              {formatCurrency(tco.monthlyPayment)}<span className="text-sm font-normal">/mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* One-pay toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={calc.leaseIsOnePay} onChange={(e) => set({ leaseIsOnePay: e.target.checked })} className="w-4 h-4 text-brand-blue rounded" />
        <span className="text-sm text-ink-muted">One-Pay Lease (single upfront payment)</span>
      </label>

      {/* Lease summary */}
      {ld && (
        <div className="bg-surface-sunken rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Adjusted Cap Cost</span><span>{formatCurrency(ld.adjustedCapCost)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Residual Value</span><span>{formatCurrency(ld.residualValue)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Depreciation/mo</span><span>{formatCurrency(ld.depreciationFee)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Finance Fee/mo</span><span>{formatCurrency(ld.financeFee)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 mt-1"><span className="text-ink-muted">Total Due at Signing</span><span className="font-semibold">{formatCurrency(ld.dueAtSigning)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total Lease Cost</span><span>{formatCurrency(ld.totalLeaseCost)}</span></div>

          {/* Scoring */}
          <div className="flex gap-3 pt-2 border-t border-border mt-1 flex-wrap">
            {(() => {
              const pct = percentageRuleLabel(ld.percentageRule)
              const ls = leaseScoreLabel(ld.leaseHackrScore)
              return (
                <>
                  <span className={`badge badge-${pct.color}`}>{pct.label}</span>
                  <span className={`badge badge-${ls.color}`}>LeaseHackr Score: {ld.leaseHackrScore.toFixed(1)}% — {ls.label}</span>
                </>
              )
            })()}
          </div>

          {ld.msdAmount > 0 && (
            <div className="bg-brand-blue/15 rounded p-3 text-xs text-brand-indigo mt-2">
              MSD outlay: {formatCurrency(ld.msdAmount)} (refundable) · 
              Monthly savings: {formatCurrency(ld.monthlySavingsFromMsd)} ·
              Break-even: {ld.msdBreakEvenMonths} months
            </div>
          )}

          {/* Dealer MF markup alert */}
          {mfMarkupAlert && (
            <div className="bg-status-yellow-bg border border-status-yellow/30 rounded-lg p-3 text-xs text-status-yellow mt-2">
              <strong>Possible dealer markup:</strong> The money factor you entered ({mf.toFixed(5)}) is
              more than 0.0001 above the advertised buy-rate ({buyRateMf.toFixed(5)}).
              Ask your dealer for the <em>buy-rate money factor</em> — dealers can mark it up and
              keep the spread as profit.
            </div>
          )}

          {/* Subvention warning */}
          {isSubventioned && residualBelowBenchmark && (
            <div className="bg-status-yellow-bg border border-status-yellow/30 rounded-lg p-3 text-xs text-status-yellow mt-2">
              <strong>Subsidized deal alert:</strong> This offer has a manufacturer-subvented
              APR/money factor. Manufacturers often lower the residual to offset the cost of the
              low rate. The residual shown ({residual}%) is below the typical market
              benchmark of {benchmark.min}–{benchmark.max}% for this vehicle class and term.
              A lower residual means you're paying more depreciation per month.
              Run the numbers — the attractive rate may not beat a standard lease with a higher residual.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Incentives & Fees ──────────────────────────────────────────────
function IncentivesTab({ vehicle, calc, set, userPrefs, stateData, stateIncentives }) {
  const credit = vehicle.federalTaxCredit
  const trim = vehicle.trims?.[calc.selectedTrimIndex] || vehicle.trims?.[0]
  const msrp = trim?.msrp || 0

  // Site-estimated total incentives (federal repealed → state rebates only).
  const estimatedStateTotal = stateIncentives
    .filter((i) => i.appliesTo?.includes('new') && (i.type === 'rebate' || i.type === 'tax_credit'))
    .reduce((sum, i) => sum + (i.amount || 0), 0)
  const usingManualOverride =
    calc.manualIncentiveOverride != null && calc.manualIncentiveOverride >= 0

  return (
    <div className="space-y-6">
      {/* Manual override — the user's real number beats our estimates */}
      <div className={`rounded-lg border p-4 ${usingManualOverride ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-sunken'}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-lg">✏</span>
          <h3 className="font-semibold text-ink text-sm">Have a real number? Enter it here</h3>
        </div>
        <p className="text-xs text-ink-muted mb-3 leading-relaxed">
          If you have a dealer quote or a current-offers page, enter your total incentives below.
          Your figure overrides every estimate on this page and drives the True Cost Summary.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number" min={0} step={250}
              value={calc.manualIncentiveOverride ?? ''}
              placeholder={estimatedStateTotal ? estimatedStateTotal.toLocaleString() : '0'}
              onChange={(e) => {
                const raw = e.target.value
                set({ manualIncentiveOverride: raw === '' ? null : Math.max(0, Number(raw)) })
              }}
              className="input-base pl-7"
              aria-label="Total incentive override"
            />
          </div>
          {usingManualOverride && (
            <button
              type="button"
              onClick={() => set({ manualIncentiveOverride: null })}
              className="text-xs text-brand-blue hover:underline shrink-0"
            >
              Use estimate instead
            </button>
          )}
        </div>
        <p className={`text-xs mt-1.5 ${usingManualOverride ? 'text-brand-blue' : 'text-ink-subtle'}`}>
          {usingManualOverride
            ? `Using your figure of ${formatCurrency(calc.manualIncentiveOverride)} — the estimates below are ignored in totals.`
            : `Site estimate for ${stateData?.name || 'your state'}: ${formatCurrency(estimatedStateTotal)} (state only — federal credit repealed).`}
        </p>
      </div>

      {/* Federal credit - eliminated in 2025 */}
      <div>
        <h3 className="font-semibold text-ink mb-3">Federal Tax Credit</h3>
        <div className="bg-status-yellow-bg border border-status-yellow/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0"></span>
            <div>
              <div className="font-semibold text-status-yellow text-sm">Federal EV Tax Credit Eliminated</div>
              <p className="text-xs text-status-yellow mt-1 leading-relaxed">
                The $7,500 federal EV tax credit (IRA Section 30D) was repealed in 2025.
                No federal credit is currently available for new EV purchases.
              </p>
              <a
                href="https://www.irs.gov/credits-deductions/credits-for-new-clean-vehicles-purchased-in-2023-or-after"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-blue hover:underline mt-2 block"
              >
                IRS Clean Vehicle Credits page (verify current status) ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* State incentives */}
      <div>
        <h3 className="font-semibold text-ink mb-3">State Incentives — {stateData?.name}</h3>
        {stateIncentives.length > 0 ? (
          <div className="space-y-2">
            {stateIncentives.filter((i) => i.appliesTo?.includes('new')).map((incentive, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-sm text-ink">{incentive.name}</div>
                    {incentive.notes && <p className="text-xs text-ink-muted mt-0.5">{incentive.notes}</p>}
                    {incentive.maxMsrp && msrp > incentive.maxMsrp && (
                      <p className="text-xs text-status-red mt-0.5">MSRP exceeds program maximum ({formatCurrency(incentive.maxMsrp)})</p>
                    )}
                  </div>
                  {incentive.amount > 0 && (
                    <span className="badge badge-green shrink-0">{formatCurrency(incentive.amount)}</span>
                  )}
                </div>
                {incentive.url && (
                  <a href={incentive.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline mt-1 block">
                    Learn more ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface-sunken rounded-lg p-4 text-sm text-ink-muted">
            No state EV rebates found for {stateData?.name}. State incentive programs change frequently — verify directly with your state energy office.
          </div>
        )}
      </div>

      {/* State fees */}
      <div>
        <h3 className="font-semibold text-ink mb-3">State & Registration Fees</h3>
        <div className="bg-surface-sunken rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Sales Tax ({formatPercent(stateData.salesTaxPercent)})</span><span>{formatCurrency(stateData.salesTaxPercent / 100 * (trim?.msrp || 0))}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Registration Fee</span><span>{formatCurrency(stateData.registrationFeeUsd)}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Title Fee</span><span>{formatCurrency(stateData.titleFeeUsd)}</span></div>
          {stateData.inspectionFeeUsd > 0 && <div className="flex justify-between"><span className="text-ink-muted">Inspection Fee</span><span>{formatCurrency(stateData.inspectionFeeUsd)}</span></div>}
          {stateData.evSurchargeUsd > 0 && <div className="flex justify-between"><span className="text-ink-muted">EV Registration Surcharge</span><span>{formatCurrency(stateData.evSurchargeUsd)}</span></div>}
          <div className="flex justify-between items-center">
            <span className="text-ink-muted flex items-center gap-1">
              Annual EV Road Use Fee
              <span title="Most states justify EV road use fees as a replacement for the gas tax, which EVs don't pay. Critics argue some fees are disproportionately high. 31 states levy these fees ranging from $50 to $294/year." className="cursor-help text-xs bg-surface-sunken rounded-full w-4 h-4 flex items-center justify-center border border-border">ℹ</span>
            </span>
            <span>{stateData.annualEvRoadFeeUsd > 0 ? formatCurrency(stateData.annualEvRoadFeeUsd) + '/yr' : 'None'}</span>
          </div>
          {stateData.leaseCapCostTaxed && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-xs text-status-yellow bg-status-yellow-bg rounded p-2">
                {stateData.name} taxes the full capitalized cost of a lease at inception, not just the monthly payment. This can add thousands to lease costs.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab 4: Charging Costs ─────────────────────────────────────────────────
function ChargingTab({ vehicle, calc, set, userPrefs, electricityRate, tco, state }) {
  const specs = vehicle.specs || {}
  const smartPrograms = getSmartChargePrograms(state)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={userPrefs.hasHomeCharger} onChange={(e) => userPrefs.setFinancialProfile({ hasHomeCharger: e.target.checked })} className="w-4 h-4 text-brand-blue rounded" />
            <span className="text-sm font-medium text-ink">I have (or plan to install) home charging</span>
          </label>
        </div>

        <div>
          <label className="section-label block mb-1.5">Home Electricity Rate</label>
          <div className="relative">
            <input type="number" step={0.5} min={5} max={60} value={electricityRate} onChange={(e) => userPrefs.setElectricityRate(Number(e.target.value))} className="input-base pr-14" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">¢/kWh</span>
          </div>
        </div>

        <div className="flex items-end">
          <div className="bg-surface-sunken rounded-lg p-3 w-full">
            <div className="text-xs text-ink-subtle mb-0.5">Vehicle efficiency</div>
            <div className="font-semibold">{specs.milesPerKwh || '~3.5'} mi/kWh</div>
          </div>
        </div>

        {/* Off-peak rate toggle */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={userPrefs.hasOffPeakRate}
              onChange={e => userPrefs.setFinancialProfile({ hasOffPeakRate: e.target.checked })}
              className="w-4 h-4 text-brand-blue rounded"
            />
            <span className="text-sm font-medium text-ink">I charge at an off-peak TOU rate overnight</span>
          </label>
          {userPrefs.hasOffPeakRate && (
            <div className="relative max-w-xs ml-6">
              <input
                type="number" step={0.5} min={3} max={30}
                value={userPrefs.offPeakRateCentsPerKwh ?? ''}
                placeholder="e.g. 10"
                onChange={e => userPrefs.setFinancialProfile({ offPeakRateCentsPerKwh: Number(e.target.value) })}
                className="input-base pr-14"
                aria-label="Off-peak electricity rate"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-subtle">¢/kWh</span>
            </div>
          )}
        </div>

        {/* Charging mix */}
        <div className="sm:col-span-2">
          <label className="section-label block mb-2">Charging Mix</label>
          <div className="space-y-3">
            {[
              { key: 'home', label: 'Home' },
              { key: 'publicL2', label: 'Public L2' },
              { key: 'dcFast', label: 'DC Fast' },
            ].map(({ key, label }) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-medium">{userPrefs.chargingMixPercent[key]}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={userPrefs.chargingMixPercent[key]}
                  onChange={(e) => userPrefs.setChargingMix({ [key]: Number(e.target.value) })}
                  className="w-full accent-brand-blue"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Smart charge programs */}
      {smartPrograms.length > 0 && (
        <div>
          <h3 className="font-semibold text-ink mb-1">Smart Charge Programs in Your State</h3>
          <p className="text-xs text-ink-subtle mb-3">
            Your utility may pay you to charge off-peak or offer a dedicated low EV rate.
          </p>
          <div className="space-y-2">
            {smartPrograms.map(program => (
              <div key={program.id} className="border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm text-ink">{program.name}</div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      {program.utilities?.join(', ')}
                    </div>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                      {program.description}
                    </p>
                    {program.offPeakHours && (
                      <p className="text-xs text-ink-subtle mt-1">
                        Off-peak hours: {program.offPeakHours}
                      </p>
                    )}
                    {program.freeChargerOffered && (
                      <span className="badge badge-green mt-1.5 inline-flex">Free smart charger available</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {program.offPeakRate && (
                      <div className="text-lg font-semibold text-status-green">
                        {program.offPeakRate}¢
                      </div>
                    )}
                    {program.offPeakRate && (
                      <div className="text-xs text-ink-subtle">off-peak/kWh</div>
                    )}
                    {program.annualEarnings && (
                      <div className="text-sm font-medium text-status-green">
                        +${program.annualEarnings.min}–${program.annualEarnings.max}/yr
                      </div>
                    )}
                  </div>
                </div>
                {program.signupUrl && (
                  <a
                    href={program.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-blue hover:underline mt-2 block"
                  >
                    Sign up / Learn more ↗
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-subtle mt-2">
            Programs and rates change frequently. Verify with your utility before enrolling.
          </p>
        </div>
      )}

      {/* Charging cost summary */}
      <div className="bg-surface-sunken rounded-lg p-4 space-y-2 text-sm">
        <div className="font-semibold text-ink mb-2">Monthly Charging Costs</div>
        <div className="flex justify-between"><span className="text-ink-muted">Home Charging</span><span>{formatCurrency(tco.chargingCosts.monthlyHomeCost)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">Public L2</span><span>{formatCurrency(tco.chargingCosts.monthlyL2Cost)}</span></div>
        <div className="flex justify-between"><span className="text-ink-muted">DC Fast Charging</span><span>{formatCurrency(tco.chargingCosts.monthlyDcfcCost)}</span></div>
        <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
          <span>Total Monthly</span><span>{formatCurrency(tco.chargingCosts.monthlyTotal)}</span>
        </div>
        <div className="flex justify-between text-ink-muted border-t border-border pt-1"><span>Annual Total</span><span>{formatCurrency(tco.chargingCosts.annualTotal)}</span></div>
        <div className="flex justify-between text-ink-muted"><span>Cost per mile</span><span>{(tco.chargingCosts.costPerMile * 100).toFixed(1)}¢</span></div>
      </div>
    </div>
  )
}

// ─── Tab 5: Ongoing Costs ──────────────────────────────────────────────────
function OngoingTab({ vehicle, calc, set, tco }) {
  const maintenance = vehicle.maintenance
  const insurance = vehicle.insuranceEstimateAnnual

  return (
    <div className="space-y-6">
      {/* Insurance */}
      <div>
        <h3 className="font-semibold text-ink mb-3">Insurance</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'low', label: 'Low Estimate', value: insurance?.low },
            { key: 'average', label: 'Average', value: insurance?.average },
            { key: 'high', label: 'High Estimate', value: insurance?.high },
          ].map(({ key, label, value }) => (
            <button
              key={key}
              onClick={() => set({ insuranceEstimate: key })}
              className={`p-3 rounded-lg border text-center transition-colors ${
                calc.insuranceEstimate === key
                  ? 'border-brand-blue bg-brand-blue-light'
                  : 'border-border hover:border-brand-blue'
              }`}
            >
              <div className="text-xs text-ink-subtle mb-0.5">{label}</div>
              <div className="font-semibold text-sm">{formatCurrency(value)}/yr</div>
            </button>
          ))}
        </div>
        {insurance?.source && <p className="text-xs text-ink-subtle mt-2">Source: {insurance.source}</p>}
      </div>

      {/* Maintenance */}
      <div>
        <h3 className="font-semibold text-ink mb-3">Maintenance</h3>
        <div className="bg-surface-sunken rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-ink-muted">Est. Annual Cost</span>
            <span className="font-semibold">{formatCurrency(maintenance?.averageAnnualCostUsd || 600)}/yr</span>
          </div>
          {maintenance?.notes && <p className="text-xs text-ink-muted">{maintenance.notes}</p>}
          {maintenance?.sourceUrl && (
            <a href={maintenance.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-blue hover:underline mt-1 block">
              Source ↗
            </a>
          )}
        </div>
        <div className="mt-3">
          <label className="section-label block mb-1.5">Override Annual Cost</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
            <input
              type="number" min={0} step={50}
              value={calc.maintenanceOverride ?? ''}
              placeholder={(maintenance?.averageAnnualCostUsd || 600).toString()}
              onChange={(e) => set({ maintenanceOverride: e.target.value ? Number(e.target.value) : null })}
              className="input-base pl-7"
            />
          </div>
        </div>
      </div>

      {/* Depreciation chart */}
      {tco.depreciationData && (
        <div>
          <h3 className="font-semibold text-ink mb-3">Depreciation</h3>
          <DepreciationChart data={tco.depreciationData} ownershipYears={5} />
        </div>
      )}
    </div>
  )
}

// ─── Share button ─────────────────────────────────────────────────────────────
function ShareCalcButton({ vehicle, calc, userPrefs }) {
  const [status, setStatus] = useState('idle') // "idle" | "copied" | "error"

  async function handleShare() {
    try {
      const url = buildShareUrl(vehicle.id, calc, userPrefs)
      if (navigator.share && /mobile|android|iphone/i.test(navigator.userAgent)) {
        await navigator.share({
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model} — Cost Estimate`,
          text: `My cost estimate for the ${vehicle.year} ${vehicle.make} ${vehicle.model} on EVsense`,
          url,
        })
        setStatus('copied')
      } else {
        await navigator.clipboard.writeText(url)
        setStatus('copied')
      }
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <button
      onClick={handleShare}
      className={`btn-secondary gap-2 ${status === 'copied' ? 'border-status-green text-status-green' : ''}`}
    >
      {status === 'copied' ? (
        <>✓ Link copied!</>
      ) : status === 'error' ? (
        <>Copy failed — try again</>
      ) : (
        <>Share this calculation</>
      )}
    </button>
  )
}

// ─── Tab 6: True Cost Summary ──────────────────────────────────────────────
function SummaryTab({ tco, vehicle, calc, userPrefs, effectiveProgramSavings }) {
  const rows = [
    { label: calc_mode_label(tco.mode) + ' Payment', monthly: tco.monthlyPayment, annual: tco.monthlyPayment * 12 },
    { label: 'Charging (Home)', monthly: tco.chargingCosts.monthlyHomeCost, annual: tco.chargingCosts.annualHomeCost },
    { label: 'Charging (Public L2)', monthly: tco.chargingCosts.monthlyL2Cost, annual: tco.chargingCosts.annualL2Cost },
    { label: 'Charging (DC Fast)', monthly: tco.chargingCosts.monthlyDcfcCost, annual: tco.chargingCosts.annualDcfcCost },
    { label: 'Insurance', monthly: tco.monthlyInsurance, annual: tco.monthlyInsurance * 12 },
    { label: 'Maintenance', monthly: tco.monthlyMaintenance, annual: tco.monthlyMaintenance * 12 },
    { label: 'Registration & Road Fees', monthly: tco.monthlyRegistrationFees, annual: tco.monthlyRegistrationFees * 12 },
    ...(tco.chargerAmortizedMonthly > 0 ? [{ label: 'Home Charger (amortized)', monthly: tco.chargerAmortizedMonthly, annual: tco.chargerAmortizedMonthly * 12 }] : []),
  ].filter((r) => r.monthly > 0)

  const totalSavings = tco.totalIncentives + (effectiveProgramSavings || 0)

  return (
    <div className="space-y-6">
      {/* Monthly breakdown table */}
      <div>
        <h3 className="font-semibold text-ink mb-3">Monthly Cost Breakdown</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-sunken border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-ink-subtle font-semibold uppercase tracking-wider">Cost Item</th>
                <th className="text-right py-2 px-3 text-xs text-ink-subtle font-semibold uppercase tracking-wider">Monthly</th>
                <th className="text-right py-2 px-3 text-xs text-ink-subtle font-semibold uppercase tracking-wider">Annual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 text-ink-muted">{row.label}</td>
                  <td className="py-2.5 px-3 text-right font-medium text-ink tabular-nums">{formatCurrency(row.monthly)}</td>
                  <td className="py-2.5 px-3 text-right text-ink-muted tabular-nums">{formatCurrency(row.annual)}</td>
                </tr>
              ))}
              <tr className="bg-surface-sunken font-semibold">
                <td className="py-3 px-3 text-ink">Total</td>
                <td className="py-3 px-3 text-right text-brand-blue text-lg tabular-nums">{formatCurrency(tco.monthlyTotal)}</td>
                <td className="py-3 px-3 text-right text-ink tabular-nums">{formatCurrency(tco.annualTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Ownership period summary */}
      <div>
        <h3 className="font-semibold text-ink mb-3">{userPrefs.ownershipYears}-Year Ownership Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Cost of Ownership', value: tco.totalCost, highlight: true },
            { label: 'Total Savings Applied', value: totalSavings, green: true },
            { label: 'Total Depreciation Loss', value: tco.depreciationData?.totalLoss || 0 },
            { label: 'Projected Resale Value', value: tco.projectedResaleValue || 0, green: true },
          ].map((item, i) => (
            <div key={i} className={`rounded-lg p-4 border ${item.highlight ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-sunken'}`}>
              <div className="text-xs text-ink-subtle mb-1">{item.label}</div>
              <div className={`text-xl font-semibold tabular-nums ${item.highlight ? 'text-brand-blue' : item.green ? 'text-status-green' : 'text-ink'}`}>
                {item.green && item.value > 0 ? '+' : ''}{formatCurrency(item.value)}
              </div>
            </div>
          ))}
        </div>

        {/* Savings breakdown */}
        {totalSavings > 0 && (
          <div className="mt-3 border border-status-green/20 bg-status-green-bg rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium text-status-green mb-1.5">Savings breakdown</div>
            {tco.totalIncentives > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Federal + State Incentives</span>
                <span className="text-status-green font-medium">+{formatCurrency(tco.totalIncentives)}</span>
              </div>
            )}
            {effectiveProgramSavings > 0 && (
              <div className="flex justify-between text-ink-muted">
                <span>Buying Program Savings</span>
                <span className="text-status-green font-medium">+{formatCurrency(effectiveProgramSavings)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2 border-t border-border">
        <ShareCalcButton vehicle={vehicle} calc={calc} userPrefs={userPrefs} />
        <p className="text-xs text-ink-subtle">
          Share a link with your exact scenario pre-filled — useful for comparing quotes with a partner or saving for later.
        </p>
      </div>

      <p className="text-xs text-ink-subtle border-t border-border pt-3">
        Pricing data sourced from public manufacturer websites. Dealer program savings are estimates —
        actual amounts depend on current regional offers and dealer participation.
        All calculations are estimates. Last data update: January 2025.
      </p>
    </div>
  )
}

function calc_mode_label(mode) {
  if (mode === 'finance') return 'Loan'
  if (mode === 'lease') return 'Lease'
  return 'Cash'
}
