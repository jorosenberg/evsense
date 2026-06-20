/**
 * cardTco.js, single source of truth for a Browse card's lease/finance/cash
 * economics, so the cards AND the Browse "Price: Low → High" sort agree.
 *
 * Key rule for LEASES: the Edmunds lease-CALCULATOR monthly (leaseCalcFor.monthly)
 * already nets the scraped cash incentive and uses the right residual / money
 * factor, so it is the payment basis. We do NOT also subtract the cash via the
 * incentive amortizer, doing both previously zeroed the payment out (e.g. a
 * $15,000 lease cash over 24 mo = $625/mo wiped out a $619 teaser payment,
 * leaving only operating cost). The "Include incentives" toggle adds the cash
 * back when off.
 */
import { quickTco } from './quickTco'
import { offerForTrim } from './incentivesByVehicle'
import { leaseCalcFor } from './leaseCalcData'

/**
 * Resolve all of a card's pricing in one place.
 * @param {object} vehicle  summary vehicle row
 * @param {object} ctx
 * @param {object} ctx.prefs        userPreferencesStore snapshot
 * @param {object|null} ctx.incRec  incentives_by_vehicle record
 * @param {object|null} ctx.eaOffer Electrify America offer
 * @param {object|null} ctx.leaseCalcRec lease_calc record
 */
export function resolveCardEconomics(vehicle, { prefs = {}, incRec = null, eaOffer = null, leaseCalcRec = null } = {}) {
  const mode = prefs.purchaseMode || 'finance'
  const leaseTerm = prefs.leaseTermMonths || 36
  const includeInc = prefs.includeIncentives !== false
  const override = Math.max(prefs.incentiveOverride || 0, 0)

  const offer = offerForTrim(incRec, null, mode, vehicle.msrpFrom, leaseTerm)
  // Lease cash + lease-calc monthly come from the Edmunds lease CALCULATOR data
  // for the selected term (base style on Browse), the same numbers the
  // detail-page lease-basis banner and the lease chip show.
  const leaseCalc = leaseCalcRec ? leaseCalcFor(leaseCalcRec, null, leaseTerm) : null
  const leaseCalcMonthly = leaseCalc?.monthly ?? null
  const leaseCash = leaseCalc?.cashIncentives || 0
  const mfrCash = incRec?.cashRebate || 0
  const conditionalCash = incRec?.conditionalCash || 0
  const leaseCashApplied = includeInc && mode === 'lease' && leaseCash > 0

  // ── Lease payment basis ──────────────────────────────────────────────────
  // The lease-calc monthly already includes the scraped cash. Add it back when
  // incentives are toggled off. Fall back to the NY offer / teaser only when
  // there's no lease-calc data.
  let leasePayment = null
  if (mode === 'lease') {
    if (leaseCalcMonthly != null) {
      leasePayment = includeInc
        ? leaseCalcMonthly
        : Math.round(leaseCalcMonthly + leaseCash / leaseTerm)
    } else {
      leasePayment = offer?.monthlyPayment ?? vehicle.leaseFrom ?? null
    }
  }

  // Incentive amortized into the monthly by quickTco. For LEASE the cash is
  // already inside leasePayment, so only the user's override is passed (no
  // double-count). For cash/finance the manufacturer rebate is amortized here.
  const cardIncentive = mode === 'lease'
    ? override
    : override + (includeInc ? mfrCash : 0)

  let offerVehicle = vehicle
  if (mode === 'lease' && leasePayment != null) {
    offerVehicle = { ...vehicle, leaseFrom: leasePayment }
  } else if (mode === 'finance' && offer?.monthlyPayment) {
    offerVehicle = { ...vehicle, financeFrom: offer.monthlyPayment }
  }

  const tco = quickTco(offerVehicle, {
    stateCode: prefs.state,
    annualMiles: prefs.annualMileage,
    chargingMix: prefs.chargingMixPercent,
    homeRateOverride: prefs.electricityRateCentsPerKwh ?? null,
    dcfcRateOverride: prefs.dcfcRateCentsPerKwh != null ? prefs.dcfcRateCentsPerKwh / 100 : null,
    l2RateOverride: prefs.publicL2RateCentsPerKwh != null ? prefs.publicL2RateCentsPerKwh / 100 : null,
    subscriptionMonthly: prefs.chargingSubscriptionMonthlyUsd || 0,
    mode,
    leaseTermMonths: leaseTerm,
    incentive: cardIncentive,
    eaOffer,
    ownershipYears: prefs.ownershipYears || 5,
  })

  const displayLeaseFrom = mode === 'lease' ? (leasePayment ?? vehicle.leaseFrom) : vehicle.leaseFrom
  const displayFinanceFrom = (mode === 'finance' && offer?.monthlyPayment) ? offer.monthlyPayment : vehicle.financeFrom
  const totalPriceCut = override + (includeInc ? mfrCash : 0)
  const effectivePrice = totalPriceCut > 0 ? Math.max(0, (vehicle.msrpFrom || 0) - totalPriceCut) : null

  return {
    mode, leaseTerm, includeInc, offer, leaseCalc, leaseCalcMonthly,
    leaseCash, mfrCash, conditionalCash, leaseCashApplied,
    displayLeaseFrom, displayFinanceFrom, effectivePrice, tco,
  }
}

/** Monthly all-in TCO for a card/sort. */
export function cardMonthlyTco(vehicle, ctx = {}) {
  return resolveCardEconomics(vehicle, ctx).tco.monthlyTco
}

/**
 * Cost metric for the mode-aware price sort:
 *   cash    → effective total price (lower = cheaper)
 *   finance → monthly all-in TCO
 *   lease   → monthly all-in TCO
 */
export function cardCostMetric(vehicle, ctx = {}) {
  const econ = resolveCardEconomics(vehicle, ctx)
  if (econ.mode === 'cash') {
    return econ.effectivePrice ?? (vehicle.msrpFrom || Number.MAX_SAFE_INTEGER)
  }
  return econ.tco?.monthlyTco || Number.MAX_SAFE_INTEGER
}
