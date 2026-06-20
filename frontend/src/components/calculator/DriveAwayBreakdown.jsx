/**
 * DriveAwayBreakdown — "What you'll actually pay at the dealer"
 *
 * Shows a full itemized breakdown from MSRP → drive-away price,
 * including all the fees consumers don't expect until they're at the desk.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GlossaryTip from '../ui/GlossaryTip'
import { formatCurrency } from '../../utils/formatCurrency'
import { STATE_FEES } from '../../utils/stateFeesData'
import { getTotalStateRebate, getSalesTaxExemptionSavings, hasSalesTaxExemption } from '../../utils/incentivesData'

// Typical destination charges by brand (factory → dealer)
const DESTINATION_BY_BRAND = {
  Tesla: 1390, Rivian: 1875, Lucid: 1900,
  Ford: 1595, Chevrolet: 1495, GMC: 1895,
  Hyundai: 1295, Kia: 1295, Genesis: 1095,
  BMW: 995, Mercedes: 1050, Audi: 1095, Porsche: 1350,
  Volkswagen: 1295, Volvo: 1095, Polestar: 1200,
  Nissan: 1095, Subaru: 1295, Toyota: 1095,
}

function getDestinationCharge(make) {
  return DESTINATION_BY_BRAND[make] || 1395
}

// Typical dealer doc fees by state
const DOC_FEE_BY_STATE = {
  AR: 129, AZ: 599, CA: 85, CO: 599, CT: 299, DE: 299,
  FL: 999, GA: 699, HI: 299, ID: 299, IL: 299, IN: 199,
  IA: 135, KS: 299, KY: 199, LA: 299, ME: 299, MD: 499,
  MA: 299, MI: 299, MN: 75, MS: 299, MO: 599, MT: 299,
  NE: 299, NV: 599, NH: 299, NJ: 499, NM: 299, NY: 175,
  NC: 599, ND: 175, OH: 299, OK: 299, OR: 150, PA: 399,
  RI: 299, SC: 225, SD: 175, TN: 599, TX: 599, UT: 299,
  VT: 299, VA: 599, WA: 150, WV: 175, WI: 299, WY: 299,
}

function getDocFee(stateAbbr) {
  return DOC_FEE_BY_STATE[stateAbbr] || 499
}

function LineItem({ label, value, sign = '+', isSubtotal = false, isSavings = false, tooltip = null, dimmed = false }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${isSubtotal ? 'border-t border-border mt-1 pt-2.5' : ''} ${dimmed ? 'opacity-50' : ''}`}>
      <div className="text-sm text-ink-muted flex items-center gap-1 flex-wrap">
        {tooltip ? <GlossaryTip term={tooltip}>{label}</GlossaryTip> : label}
      </div>
      <div className={`text-sm font-medium shrink-0 ${
        isSavings ? 'text-status-green' :
        isSubtotal ? 'text-ink font-semibold' : 'text-ink'
      }`}>
        {isSavings && value > 0 ? '−' : sign !== '+' ? sign + ' ' : '+ '}
        {value > 0 ? formatCurrency(value) : value === 0 ? '—' : formatCurrency(Math.abs(value))}
      </div>
    </div>
  )
}

export default function DriveAwayBreakdown({ vehicle, stateAbbr = 'TX' }) {
  const [open, setOpen] = useState(false)

  const msrp = vehicle.trims?.[0]?.msrp || vehicle.msrpFrom || 0
  const make = vehicle.make || ''
  const stateFees = STATE_FEES[stateAbbr] || {}
  const taxRate = stateFees.salesTaxPercent || 0
  const regFee = stateFees.registrationFeeUsd || 150
  const titleFee = stateFees.titleFeeUsd || 50
  const evSurcharge = stateFees.evSurchargeUsd || 0
  const inspectionFee = stateFees.inspectionFeeUsd || 0

  const destinationCharge = getDestinationCharge(make)
  const docFee = getDocFee(stateAbbr)
  const stateRebate = getTotalStateRebate(stateAbbr, msrp, true)
  const taxExemption = hasSalesTaxExemption(stateAbbr, msrp)
  const taxExemptionSavings = taxExemption ? getSalesTaxExemptionSavings(stateAbbr, msrp, taxRate) : 0

  // Price before tax
  const priceBeforeTax = msrp + destinationCharge + docFee
  // Sales tax applies to different bases in different states — approximate
  const taxBase = taxExemption ? 0 : priceBeforeTax
  const salesTax = Math.round(taxBase * (taxRate / 100))

  const driveAwayGross = msrp + destinationCharge + docFee + salesTax + regFee + titleFee + evSurcharge + (inspectionFee || 0)
  const driveAwayNet = driveAwayGross - stateRebate

  const monthlyFinance = vehicle.financeFrom
  const monthlyLease = vehicle.leaseFrom

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-sunken transition-colors"
      >
        <div>
          <h3 className="font-semibold text-ink text-sm">What you'll actually pay at the dealer</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Drive-away estimate: <span className="font-semibold text-ink">{formatCurrency(driveAwayNet)}</span>
            {stateRebate > 0 && <span className="text-status-green"> (after {formatCurrency(stateRebate)} state rebate)</span>}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-ink-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-border">
              <div className="mt-3 space-y-0">
                <LineItem label="Base MSRP" sign="" value={msrp} tooltip="msrp" />
                <LineItem label={`Destination & delivery (${make})`} value={destinationCharge} tooltip="destination charge" />
                <LineItem label={`Dealer doc fee (${stateAbbr} avg)`} value={docFee} tooltip="doc fee" />

                {taxExemption ? (
                  <LineItem label={`Sales tax (${taxRate}%) — EXEMPT in ${stateAbbr}`} value={0} isSavings dimmed />
                ) : (
                  <LineItem label={`Sales tax (${taxRate}%)`} value={salesTax} />
                )}

                <LineItem label="Registration fee" value={regFee} />
                <LineItem label="Title fee" value={titleFee} />
                {evSurcharge > 0 && <LineItem label={`EV registration surcharge (${stateAbbr})`} value={evSurcharge} tooltip="ev road fee" />}
                {inspectionFee > 0 && <LineItem label="State inspection fee" value={inspectionFee} />}

                <LineItem label="Subtotal" value={driveAwayGross} isSubtotal />

                {stateRebate > 0 && (
                  <LineItem label={`${stateAbbr} state EV rebate`} value={stateRebate} isSavings />
                )}
                {taxExemptionSavings > 0 && (
                  <LineItem label={`Sales tax exemption savings (${stateAbbr})`} value={taxExemptionSavings} isSavings />
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-ink">
                  <div>
                    <span className="font-bold text-ink">Estimated Drive-Away Price</span>
                    <p className="text-xs text-ink-muted">Before federal credit, trade-in, or down payment</p>
                  </div>
                  <span className="font-bold text-xl text-ink">{formatCurrency(driveAwayNet)}</span>
                </div>
              </div>

              {/* Monthly options */}
              {(monthlyFinance || monthlyLease) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {monthlyLease && (
                    <div className="bg-brand-blue-light border border-brand-blue/20 rounded-xl p-3 text-center">
                      <div className="font-bold text-brand-blue text-lg">{formatCurrency(monthlyLease)}<span className="text-sm font-normal">/mo</span></div>
                      <div className="text-xs text-brand-blue/70 mt-0.5">Lease est.</div>
                    </div>
                  )}
                  {monthlyFinance && (
                    <div className="bg-surface-raised border border-border rounded-xl p-3 text-center">
                      <div className="font-bold text-ink text-lg">{formatCurrency(monthlyFinance)}<span className="text-sm font-normal">/mo</span></div>
                      <div className="text-xs text-ink-muted mt-0.5">Finance est.</div>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[11px] text-ink-subtle mt-3">
                Estimates only. Exact fees vary by dealer, trim, and local tax rates.
                Dealer discounts and trade-in value not included. Verify all fees before signing.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
