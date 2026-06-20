import { useState, useMemo, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useMatcherVehicles } from '../hooks/useMatcherVehicles'
import { useVehicleDetail } from '../hooks/useVehicleDetail'
import { suggestTrim } from '../utils/suggestTrim'
import { useUserPreferencesStore } from '../store/userPreferencesStore'
import { quickTco, estimateFinanceMonthly } from '../utils/quickTco'
import { getLuxuryScore, getLuxuryTier } from '../utils/luxuryScore'
import { formatCurrency } from '../utils/formatCurrency'
import { vehicleImgSrc } from '../utils/vehicleImage'
import { STATE_INCENTIVES, getEffectiveIncentiveAmount } from '../utils/incentivesData'
import { useIncentives, offerForTrim } from '../utils/incentivesByVehicle'
import { useEAOffers } from '../utils/electrifyAmerica'
import { useLeaseCalc, leaseCalcFor } from '../utils/leaseCalcData'
import LeaseCalcEstimate from '../components/ui/LeaseCalcEstimate'
import RefinePanel, { REFINE_DEFAULTS, applyRefinements } from '../components/matcher/RefinePanel'
import IncentiveNotice from '../components/ui/IncentiveNotice'
import EstimateNotice from '../components/ui/EstimateNotice'

// Manufacturer incentives now come from the shared loader in
// utils/incentivesByVehicle.js (NY / ZIP 10005, refreshed monthly), so the
// matcher, Browse cards, and the per-vehicle Calculator all read the same
// offers. useIncentives() returns { vehicleId → normalized incentive record }.

// Sum of new-vehicle rebates/credits for a state, derived from the same data
// the calculator's Incentives & Fees tab uses. Single source of truth — no
// drift between the matcher's estimate and the per-vehicle calculator.
// When vehicleMsrp is provided, MSRP-capped programs (e.g. NY Drive Clean)
// resolve to their effective per-vehicle amount ($500 above the cap instead
// of the full $2,000). When omitted, the headline (uncapped) total is used.
function getMatcherStateRebate(stateCode, vehicleMsrp = null) {
  const list = STATE_INCENTIVES[stateCode] || []
  return list
    .filter(i => i.appliesTo?.includes('new') && (i.type === 'rebate' || i.type === 'tax_credit'))
    .reduce((sum, i) => sum + (
      vehicleMsrp != null ? getEffectiveIncentiveAmount(i, vehicleMsrp) : (i.amount || 0)
    ), 0)
}

// ══════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════

const TOTAL_STAGES = 5

// Best-effort manufacturer homepage per make; falls back to a web search so the
// link always resolves to the maker's official presence.
const MAKER_SITES = {
  Tesla: 'https://www.tesla.com', Hyundai: 'https://www.hyundaiusa.com', Kia: 'https://www.kia.com',
  Ford: 'https://www.ford.com', Chevrolet: 'https://www.chevrolet.com', BMW: 'https://www.bmwusa.com',
  Lucid: 'https://www.lucidmotors.com', Rivian: 'https://rivian.com', Polestar: 'https://www.polestar.com',
  Volkswagen: 'https://www.vw.com', 'Mercedes-Benz': 'https://www.mbusa.com', Mercedes: 'https://www.mbusa.com',
  Toyota: 'https://www.toyota.com', Nissan: 'https://www.nissanusa.com', Audi: 'https://www.audiusa.com',
  Porsche: 'https://www.porsche.com/usa', Genesis: 'https://www.genesis.com', Cadillac: 'https://www.cadillac.com',
  GMC: 'https://www.gmc.com', Subaru: 'https://www.subaru.com', Volvo: 'https://www.volvocars.com',
  Honda: 'https://automobiles.honda.com', Acura: 'https://www.acura.com', Lexus: 'https://www.lexus.com',
  Jaguar: 'https://www.jaguarusa.com', Fisker: 'https://www.fiskerinc.com',
}
function manufacturerUrl(vehicle) {
  return MAKER_SITES[vehicle.make]
    || `https://www.google.com/search?q=${encodeURIComponent(`${vehicle.make} ${vehicle.model} official site`)}`
}

const CARGO_OPTIONS = [
  {
    value: 'solo',
    label: 'Groceries & a Bag',
    sub: 'Light cargo, just the essentials',
    bodyStyles: ['sedan', 'hatchback', 'coupe'],
    icon: '',
    fits: ['Grocery run', 'Backpack', 'Carry-on suitcase', 'Laptop bag', 'Gym bag'],
    wontFit: 'Bikes, strollers, large gear',
    vehicles: 'Compact sedans & hatchbacks',
  },
  {
    value: 'commuter',
    label: 'Stroller & Costco Run',
    sub: 'Family errands, weekend luggage',
    bodyStyles: ['sedan', 'suv'],
    icon: '',
    fits: ['Double stroller', 'Full Costco haul', 'Luggage for 4', 'Car seat + bags', 'Medium dog crate'],
    wontFit: 'Full-size bikes inside, kayaks',
    vehicles: 'Crossover SUVs & mid-size sedans',
  },
  {
    value: 'adventure',
    label: 'Bikes & Camping Gear',
    sub: 'Sports equipment, outdoor gear inside',
    bodyStyles: ['suv', 'van'],
    icon: '',
    fits: ['Full-size bike (inside)', 'Tent + sleeping bags', 'Ski gear', 'Surfboard (on roof)', 'Large dog crate'],
    wontFit: '4×8 plywood, large trailer loads',
    vehicles: 'Mid-size & full-size SUVs',
  },
  {
    value: 'utility',
    label: 'Lumber & Trailers',
    sub: 'Hauling, towing, contractor work',
    bodyStyles: ['truck', 'van', 'suv'],
    icon: '',
    fits: ['4×8 sheet of plywood', 'Tow a trailer / boat', 'ATV or riding mower', 'Tool chests & gear', 'Full couch or furniture'],
    wontFit: 'Nothing — this is the max',
    vehicles: 'Pickup trucks & full-size SUVs',
  },
]

// Body-style preference (Stage 1). Optional — pick one or more shapes to keep
// the results to. Maps onto vehicle.bodyStyle (with minivan folded into van).
const BODY_TYPE_OPTIONS = [
  { value: 'suv',       label: 'SUV',       icon: '' },
  { value: 'sedan',     label: 'Sedan',     icon: '' },
  { value: 'truck',     label: 'Truck',     icon: '' },
  { value: 'van',       label: 'Van',       icon: '' },
  { value: 'hatchback', label: 'Hatchback', icon: '' },
]

// True when a vehicle's body style satisfies the user's body-type preference
// (empty preference matches everything; van also matches minivan).
function bodyTypeMatches(pref, bodyStyle) {
  if (!pref || pref.length === 0) return true
  if (pref.includes(bodyStyle)) return true
  if (pref.includes('van') && bodyStyle === 'minivan') return true
  return false
}

// Minimum EPA range the user needs (Stage 3). 0 = no minimum. Used as a hard
// floor in scoring AND to steer the per-trim recommendation.
const MIN_RANGE_OPTIONS = [
  { value: 0,   label: 'No min' },
  { value: 250, label: '250+ mi' },
  { value: 300, label: '300+ mi' },
  { value: 350, label: '350+ mi' },
]

// Budget tiers differ by pay plan. Cash buyers think in total sticker price;
// finance/lease buyers think in monthly payment. budgetTier.type drives the
// scoring basis in scoreVehicle.
const MSRP_TIERS = [
  { label: 'Under $35k', max: 35000, type: 'total' },
  { label: '$35k–$50k', max: 50000, type: 'total' },
  { label: '$50k–$80k', max: 80000, type: 'total' },
  { label: 'Over $80k', max: 150000, type: 'total' },
]

// All-in monthly TCO tiers (payment + charging + insurance + maintenance +
// fees), calibrated to where vehicles ACTUALLY land. Finance carries a full
// loan payment, so even the cheapest EV is ~$850/mo all-in; lease payments are
// lower, so the lease ladder starts lower. Separate ladders keep every tier
// reachable (the old shared $400/$600 tiers were dead for finance).
const FINANCE_TIERS = [
  { label: 'Under $850/mo',   max: 850,  type: 'monthly' },
  { label: '$850–$1,150/mo',  max: 1150, type: 'monthly' },
  { label: '$1,150–$1,600/mo', max: 1600, type: 'monthly' },
  { label: 'Over $1,600/mo',  max: 2600, type: 'monthly' },
]

const LEASE_TIERS = [
  { label: 'Under $500/mo',    max: 500,  type: 'monthly' },
  { label: '$500–$700/mo',     max: 700,  type: 'monthly' },
  { label: '$700–$1,000/mo',   max: 1000, type: 'monthly' },
  { label: 'Over $1,000/mo',   max: 2200, type: 'monthly' },
]

// How the buyer plans to pay — drives which monthly payment the TCO ranking
// uses. Finance is the default (most common). Cash ranks on operating cost +
// sticker price; Lease ranks on advertised lease payments where available.
const PURCHASE_OPTIONS = [
  { value: 'finance', label: 'Finance', sub: 'Loan / monthly payments', icon: '' },
  { value: 'lease',   label: 'Lease',   sub: 'Lower monthly, return later', icon: '' },
  { value: 'cash',    label: 'Buy Cash', sub: 'Pay in full, no payment', icon: '' },
]

const ROAD_TRIP_OPTIONS = [
  { value: 'rarely', label: 'Rarely', sub: 'A few times a year' },
  { value: 'sometimes', label: 'Sometimes', sub: 'Monthly road trips' },
  { value: 'often', label: 'Often', sub: 'Weekly or more' },
]

const CHARGING_OPTIONS = [
  { value: 'home_l2', label: 'Home Level 2', sub: 'I have (or plan to install) a Level 2 charger at home', icon: '' },
  { value: 'public', label: 'Public Charging', sub: 'I charge primarily at public stations', icon: '' },
  { value: 'workplace', label: 'Workplace', sub: 'My office has EV charging', icon: '' },
]

const LIFESTYLE_OPTIONS = [
  {
    value: 'carplay',
    label: 'Apple CarPlay / Android Auto',
    icon: '',
    tooltip: "Tesla vehicles don't support CarPlay or Android Auto — they use Tesla's proprietary OS. Most other EV brands support both.",
  },
  {
    value: 'v2l',
    label: 'Vehicle-to-Load (V2L)',
    icon: '',
    tooltip: 'Bidirectional power: run tools, appliances, or emergency home loads from your car battery. Available on IONIQ 5, EV6, F-150 Lightning, Rivian R1T, Cybertruck.',
  },
  {
    value: 'offroad',
    label: 'Off-Road Capability',
    icon: '',
    tooltip: 'Air suspension, locking differentials, or dedicated terrain modes. Rivian, GMC Hummer EV, Cybertruck, and Subaru Solterra qualify.',
  },
  {
    value: 'ultrafast',
    label: 'Ultra-Fast Charging (<20 min)',
    icon: '',
    tooltip: '800V architecture charges from 10→80% in ~18 minutes. Available on IONIQ 5/6, EV6, EV9, Porsche Taycan, Audi e-tron GT, Lucid Air, Genesis GV60.',
  },
  {
    value: 'phoneKey',
    label: 'Phone-as-Key / App Unlock',
    icon: '',
    tooltip: 'Use your phone as the key — lock, unlock, and start the car from an app (e.g. Tesla app, Hyundai/Kia Digital Key, Ford Phone As A Key).',
  },
  {
    value: 'advDriverAssist',
    label: 'Advanced Driver Assist',
    icon: '',
    tooltip: 'Traffic-aware/adaptive cruise control AND lane centering at minimum. Note: some base trims omit lane centering, so it may require a higher trim.',
  },
  {
    value: 'thirdRow',
    label: 'Third-Row Seating',
    icon: '',
    tooltip: 'Seats 6 or more — a usable third row. Available on the Kia EV9, Hyundai IONIQ 9, Rivian R1S, Tesla Model X, Lucid Gravity, and VW ID.Buzz.',
  },
]

// Vehicle feature lookup (curated 30-vehicle dataset)
const VEHICLE_FEATURES = {
  'hyundai-ioniq-5-2026':      { ultrafast: true,  v2l: true,  offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'hyundai-ioniq-6-2026':      { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'kia-ev6-2026':              { ultrafast: true,  v2l: true,  offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'kia-ev9-2026':              { ultrafast: true,  v2l: true,  offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'ford-f150-lightning-2025':  { ultrafast: false, v2l: true,  offroad: true,  carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'rivian-r1t-2026':           { ultrafast: false, v2l: true,  offroad: true,  carplay: false, phoneKey: true,  advDriverAssist: true  },
  'rivian-r1s-2026':           { ultrafast: false, v2l: true,  offroad: true,  carplay: false, phoneKey: true,  advDriverAssist: true  },
  'gmc-hummer-ev-2025':        { ultrafast: false, v2l: true,  offroad: true,  carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'tesla-model3-2026':         { ultrafast: false, v2l: false, offroad: false, carplay: false, phoneKey: true,  advDriverAssist: true  },
  'tesla-modely-2026':         { ultrafast: false, v2l: false, offroad: false, carplay: false, phoneKey: true,  advDriverAssist: true  },
  'tesla-modelx-2026':         { ultrafast: false, v2l: false, offroad: false, carplay: false, phoneKey: true,  advDriverAssist: true  },
  'tesla-models-2026':         { ultrafast: false, v2l: false, offroad: false, carplay: false, phoneKey: true,  advDriverAssist: true  },
  'tesla-cybertruck-2026':     { ultrafast: false, v2l: true,  offroad: true,  carplay: false, phoneKey: true,  advDriverAssist: true  },
  'porsche-taycan-2025':       { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'audi-etron-gt-2025':        { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'lucid-air-2026':            { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'mercedes-eqe-2025':         { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'mercedes-eqs-2025':         { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'bmw-i4-2026':               { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'bmw-ix-2026':               { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'chevrolet-equinox-ev-2026': { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'chevrolet-blazer-ev-2026':  { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'ford-mustang-mach-e-2026':  { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'volkswagen-id4-2026':       { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: false, advDriverAssist: true  },
  'nissan-ariya-2025':         { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: false, advDriverAssist: true  },
  'subaru-solterra-2025':      { ultrafast: false, v2l: false, offroad: true,  carplay: true,  phoneKey: false, advDriverAssist: true  },
  'toyota-bz-2026':            { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'mercedes-benz-cla-2026':    { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'genesis-gv60-2025':         { ultrafast: true,  v2l: false, offroad: false, carplay: true,  phoneKey: true,  advDriverAssist: true  },
  'polestar-2-2025':           { ultrafast: false, v2l: false, offroad: false, carplay: false, phoneKey: true,  advDriverAssist: true  },
  'volvo-ex40-2025':           { ultrafast: false, v2l: false, offroad: false, carplay: true,  phoneKey: false, advDriverAssist: true  },
}

// ══════════════════════════════════════════════════════════════════
// Luxury preference (Stage 5 — new)
// ══════════════════════════════════════════════════════════════════
//
// 5 tiers map directly onto the luxuryScore.js getLuxuryTier() output.
// "any" disables S_luxury weighting.
const LUXURY_PREFERENCES = [
  { value: 'any',         label: 'No preference',  sub: 'I care more about value', minScore: 0,   maxScore: 10 },
  { value: 'standard',    label: 'Standard',       sub: 'Comfortable, no frills',   minScore: 0,   maxScore: 4.5 },
  { value: 'premium',     label: 'Premium',        sub: 'Above-average tech & comfort', minScore: 4.5, maxScore: 6.5 },
  { value: 'luxury',      label: 'Luxury',         sub: 'Genuine premium materials',    minScore: 6.5, maxScore: 8.5 },
  { value: 'ultra',       label: 'Ultra-luxury',   sub: 'Every box checked',            minScore: 8.5, maxScore: 10 },
]

// ══════════════════════════════════════════════════════════════════
// Priorities — "what matters most to you?" (Stage 5)
// ══════════════════════════════════════════════════════════════════
//
// Each priority the user picks BOOSTS the weight of one or more scoring
// dimensions, then all weights are renormalized to sum to 1.0. Picking
// nothing leaves the balanced base weights below.
const PRIORITY_OPTIONS = [
  { value: 'cost',        label: 'Lower cost',   icon: '', sub: 'Cheapest to own & run', dims: ['tco', 'efficiency'] },
  { value: 'range',       label: 'More range',   icon: '', sub: 'Go farther per charge',  dims: ['range'] },
  { value: 'performance', label: 'Performance',  icon: '', sub: 'Quick & powerful',       dims: ['performance'] },
  { value: 'storage',     label: 'Storage',      icon: '', sub: 'Max cargo space',        dims: ['storage'] },
  { value: 'luxury',      label: 'Luxury',       icon: '', sub: 'Premium fit & finish',   dims: ['luxury'] },
]

// Balanced base weights across all 9 dimensions (sum = 1.0). Storage and
// performance carry a small base weight so they always nudge the ranking even
// when not explicitly prioritized.
const BASE_WEIGHTS = {
  tco: 0.22, range: 0.18, luxury: 0.11, features: 0.11,
  charging: 0.10, port: 0.08, efficiency: 0.08,
  performance: 0.06, storage: 0.06,
}

// Map each priority → the dimensions it boosts (built from PRIORITY_OPTIONS).
const PRIORITY_DIMS = Object.fromEntries(PRIORITY_OPTIONS.map(p => [p.value, p.dims]))

/**
 * Final weight vector given the user's selected priorities. Each selected
 * priority multiplies its dimension(s) by PRIORITY_BOOST; the result is
 * renormalized so the weights still sum to 1.0. Pure + cheap.
 */
const PRIORITY_BOOST = 3
export function computeWeights(priorities = []) {
  const w = { ...BASE_WEIGHTS }
  for (const p of priorities || []) {
    for (const dim of (PRIORITY_DIMS[p] || [])) w[dim] *= PRIORITY_BOOST
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1
  for (const k in w) w[k] = w[k] / sum
  return w
}

// Typical max cargo (cu ft, seats folded) by body style — fallback when a
// vehicle has no measured storageMax in vehicle_scores.json.
const STORAGE_FALLBACK_BY_BODY = {
  truck: 120, van: 145, suv: 75, wagon: 55, hatchback: 50, sedan: 22, coupe: 15,
}

// ══════════════════════════════════════════════════════════════════
// Scoring Engine
// ══════════════════════════════════════════════════════════════════
//
// Final score = Σ (weightᵢ × Sᵢ) over 9 dimensions, where the weights come
// from computeWeights(answers.priorities). Dimensions: tco, range, luxury,
// features, charging, port, efficiency, performance, storage. The independent
// expert rating is then blended in at a fixed 12%.

function scoreVehicle(vehicle, answers, stateRebate, stateCode, annualMileage, chargingMixPercent, incentivesMap = {}, rateOverrides = {}, eaOffersMap = {}, leaseCalcMap = {}) {
  const { cargo, bodyTypePref, budgetTier, commuteMiles, minRange, roadTrip, firstEV, chargingPrefs, nacsPreferred, lifestyle, luxuryPref, priorities } = answers
  // Lease term the user picked (24 or 36); only meaningful when leasing.
  const leaseTerm = answers.leaseTermMonths || 36
  // Priority-adjusted dimension weights (sum = 1.0).
  const weights = computeWeights(priorities)

  // ── Budget (soft penalty, not hard cutoff) ───────────────────────
  // IRA §30D federal EV credit was repealed in 2025 — no federal subsidy.
  // Subtract manufacturer cash rebates from incentives_by_vehicle.json.
  const incRec = incentivesMap[vehicle.id] || null
  const purchaseMode = answers.purchaseMode || 'finance'
  // NY/ZIP-10005 manufacturer offer for the headline trim + chosen pay plan.
  // For leases, request the user's chosen term (24 / 36) so the offer's
  // monthly payment matches it when the manufacturer publishes both.
  const offer = offerForTrim(incRec, null, purchaseMode, vehicle.msrpFrom, leaseTerm)
  const mfrCashRebate = incRec?.cashRebate || 0
  // Recompute the state rebate against THIS vehicle's MSRP so capped programs
  // (NY Drive Clean: $500 above $42k) don't overstate savings on pricier cars.
  const effStateRebate = getMatcherStateRebate(stateCode, vehicle.msrpFrom)
  const effectiveMsrp = (vehicle.msrpFrom || 0) - (effStateRebate || 0) - mfrCashRebate
  // Budget basis depends on the pay plan: cash compares TOTAL price, while
  // finance/lease compare the MONTHLY all-in payment. budgetTier.type tells us.
  const isMonthlyBudget = budgetTier?.type === 'monthly'
  const budgetMax = budgetTier?.max || (isMonthlyBudget ? 2000 : 150000)
  // Over-budget vehicles still score, just lower; assigned after the monthly TCO
  // is computed below. The RefinePanel handles strict filtering if wanted.
  let budgetPenalty = 1.0

  // ── First-time EV + frequent road trips: range penalty, not cutoff
  const rangeEpa = vehicle.rangeEpa || 0
  const firstEvRoadTripPenalty =
    (firstEV && roadTrip === 'often' && rangeEpa < 310) ? 0.4 : 1.0

  // ── Compute monthly TCO + cost per mile ──────────────────────────
  // Use the SAME purchase mode for every vehicle so the ranking is an
  // apples-to-apples comparison. Previously each vehicle was scored on
  // lease-if-available-else-finance, which mixed payment structures across
  // the result set and skewed the TCO score.
  // When the NY offer carries a real monthly payment (lease) or APR (finance),
  // use it as the payment basis so the ranking reflects the actual deal.
  //
  // Lease payment precedence (highest → lowest):
  //   1. Manufacturer NY offer monthly  — the actual advertised deal
  //   2. Edmunds lease-calc monthly      — residual-based, chosen term, $0-down
  //   3. vehicle.leaseFrom               — teaser "lease from" (often a
  //      high-down/specific-trim special, e.g. Model 3 $329) — last resort
  // (2) keeps the headline Monthly TCO consistent with the "≈ $X/mo lease"
  // chip on the same card, which is also driven by the lease-calc data.
  // Previously the TCO used (3) while the chip used (2), so the all-in TCO
  // could read LOWER than the standalone lease payment — confusing.
  // Both (1) and (2) honor the user's selected 24/36-month term.
  const leaseCalcMonthly = (purchaseMode === 'lease' && !offer?.monthlyPayment)
    ? (leaseCalcFor(leaseCalcMap[vehicle.id], null, leaseTerm)?.monthly ?? null)
    : null
  const offerVehicle = (offer?.monthlyPayment && purchaseMode !== 'cash')
    ? {
        ...vehicle,
        ...(purchaseMode === 'lease'
          ? { leaseFrom: offer.monthlyPayment }
          : { financeFrom: offer.monthlyPayment }),
      }
    : (leaseCalcMonthly != null)
      ? { ...vehicle, leaseFrom: leaseCalcMonthly }
      : vehicle
  const tco = quickTco(offerVehicle, {
    stateCode,
    annualMiles: annualMileage,
    chargingMix: chargingMixPercent,
    mode: purchaseMode,
    homeRateOverride: rateOverrides.homeRateCentsPerKwh ?? null,
    dcfcRateOverride: rateOverrides.dcfcRateCentsPerKwh != null
      ? rateOverrides.dcfcRateCentsPerKwh / 100 : null,
    l2RateOverride: rateOverrides.l2RateCentsPerKwh != null
      ? rateOverrides.l2RateCentsPerKwh / 100 : null,
    eaOffer: eaOffersMap[vehicle.id] || null,
  })

  // ── Budget penalty — compares the basis that matches the pay plan ──
  // GRADED (not cliff) so it never flattens the ordering: every increment over
  // budget shaves the cost score proportionally, down to a 0.4 floor. The old
  // 0.10/0.30 hard caps pinned every over-budget car to the same value, which —
  // under a tight budget — erased the cheaper-car advantage entirely and let
  // pricey luxury cars float to the top on expert rating / storage.
  if (isMonthlyBudget) {
    const over = budgetMax > 0 ? tco.monthlyTco / budgetMax : 1
    budgetPenalty = Math.max(0.40, Math.min(1.0, 1.0 - 0.40 * Math.max(0, over - 1.0)))
  } else {
    const over = budgetMax > 0 ? (effectiveMsrp || 0) / budgetMax : 1
    budgetPenalty = Math.max(0.40, Math.min(1.0, 1.0 - 0.40 * Math.max(0, over - 1.0)))
  }

  // ── S_tco (0–1) ─────────────────────────────────────────────────
  // ABSOLUTE cost scale: a cheaper car ALWAYS scores higher, regardless of how
  // much budget headroom there is. A budget-RELATIVE score saturates to 1.0 for
  // everything comfortably under budget — so "value" stopped preferring the
  // genuinely cheaper car and collapsed onto the same long-range luxury list as
  // "range". Mapping the all-in monthly TCO across its realistic span fixes that:
  //   ~$600/mo (cheap lease) → 1.0 · ~$1,100 → ~0.69 · ~$1,500 → ~0.44 · ≥$2,200 → floor
  const TCO_BEST = 600     // about as cheap as an EV gets, all-in
  const TCO_WORST = 2200   // luxury / large-battery territory
  let S_tco = Math.max(0.05, Math.min(1.0,
    (TCO_WORST - tco.monthlyTco) / (TCO_WORST - TCO_BEST)))
  // Whether it fits YOUR budget is a separate, graded signal (multiplicative so
  // it shaves rather than flattens the ordering). Loose budget → ~1.0, so the
  // absolute scale drives the ranking; tight budget → demotes over-budget cars
  // while keeping cheaper-is-better intact.
  S_tco = S_tco * budgetPenalty

  // ── S_range (0–1) ───────────────────────────────────────────────
  const roadTripTarget = { rarely: 150, sometimes: 220, often: 280 }
  const commuteNeed = Math.max((commuteMiles || 30) * 2 * 1.25, 80)
  const targetRange = Math.max(commuteNeed, roadTripTarget[roadTrip] || 150)
  // Continuous so "max range" actually separates a 440-mi truck from a 320-mi
  // sedan instead of capping both at 1.0 (which made the range priority produce
  // the same ranking as value). `need` = how well it covers the user's required
  // range (dominant); `headroom` = absolute range, still rewarded past the need
  // and saturating ~500 mi. Blend keeps "enough range" the priority while
  // letting genuinely longer-range cars rise under a range-first priority.
  const need = Math.max(0.15, Math.min(1.0, rangeEpa / targetRange))
  const headroom = Math.min(1.0, rangeEpa / 500)
  let S_range = 0.6 * need + 0.4 * headroom
  // First-time EV + frequent road trip with <310mi range still appears but
  // ranks lower — the Stage 3 amber tip banner already warned the user.
  S_range = S_range * firstEvRoadTripPenalty
  // Hard minimum-range floor the user set: a vehicle whose best range is under
  // it is demoted hard (it can still appear, but sinks). rangeEpa is the
  // longest-trim range, so a model qualifies if ANY trim clears the floor — the
  // per-trim recommendation then steers them to a trim that actually meets it.
  if (minRange > 0 && rangeEpa < minRange) S_range = Math.min(S_range, 0.1)

  // ── S_charging (0–1) ────────────────────────────────────────────
  let S_charging = 0.70
  const hasHome   = chargingPrefs?.includes('home_l2')
  const hasPublic = chargingPrefs?.includes('public')
  const hasWork   = chargingPrefs?.includes('workplace')
  const port = vehicle.chargingPort
  if (hasHome)                           S_charging += 0.12
  if (hasPublic && port === 'NACS')      S_charging += 0.12
  if (hasPublic && port === 'CCS1')      S_charging += 0.06
  if (hasWork)                           S_charging += 0.06
  S_charging = Math.min(1.0, S_charging)

  // ── S_port (0–1) ────────────────────────────────────────────────
  let S_port = 0.85
  if (nacsPreferred) {
    if (port === 'NACS')    S_port = 1.0
    else if (port === 'CCS1') S_port = 0.55
    else if (port === 'CHAdeMO') S_port = 0.25
    else S_port = 0.50
  }

  // ── S_features (0–1) ────────────────────────────────────────────
  const featureData = VEHICLE_FEATURES[vehicle.id] || {}
  const selectedLifestyle = lifestyle || []
  const cargoOption = CARGO_OPTIONS.find(c => c.value === cargo)
  const bodyBonus = cargoOption?.bodyStyles?.includes(vehicle.bodyStyle) ? 0.15 : 0

  // `thirdRow` isn't in the curated feature-flag map — derive it from seating
  // capacity (6+ seats ⇒ a usable third row) so we don't have to hand-flag
  // every vehicle. Everything else is a lookup in VEHICLE_FEATURES.
  const hasFeature = f => f === 'thirdRow'
    ? (vehicle.seatingCapacity || 0) >= 6
    : !!featureData[f]

  let featureBase
  if (selectedLifestyle.length === 0) {
    featureBase = 0.85
  } else {
    const matches = selectedLifestyle.filter(hasFeature).length
    featureBase = (matches / selectedLifestyle.length) * 0.85
  }
  const S_features = Math.min(1.0, featureBase + bodyBonus)

  // ── S_luxury (0–1) ──────────────────────────────────────────────
  // For Tier-2 (estimated) vehicles we fall back to the MSRP-derived estimate
  // that matcher_generator.py wrote into the JSON.
  const luxuryScore = getLuxuryScore(vehicle.id)
    ?? vehicle.luxuryScoreEstimate
    ?? 3.5  // unknowns assumed standard
  let S_luxury = 0.85
  if (luxuryPref && luxuryPref !== 'any') {
    const pref = LUXURY_PREFERENCES.find(p => p.value === luxuryPref)
    if (pref) {
      // Distance from target tier center
      const center = (pref.minScore + pref.maxScore) / 2
      const distance = Math.abs(luxuryScore - center)
      if (luxuryScore >= pref.minScore && luxuryScore <= pref.maxScore) S_luxury = 1.0
      else if (distance <= 1.5) S_luxury = 0.70
      else if (distance <= 3.0) S_luxury = 0.40
      else                       S_luxury = 0.10
    }
  }

  // ── S_efficiency (0–1) — reward low ¢/mi ────────────────────────
  // 3¢/mi → 1.0, 6¢/mi → 0.7, 10¢/mi → 0.3, 15¢/mi+ → 0.1
  // Continuous ¢/mi → score (was bucketed, so 2.8¢ and 3.4¢ both scored 1.0).
  // ~2¢/mi → 1.0, 5¢ → 0.70, 10¢ → 0.20, 12¢+ → floor. Small efficiency gaps
  // between two EVs now actually separate them under a "lower cost" priority.
  const cpm = tco.centsPerMile
  let S_efficiency = Math.max(0.10, Math.min(1.0, 1.20 - 0.10 * cpm))

  // ── S_storage (0–1) — max cargo space ───────────────────────────
  // "Max space" = cargo volume with the seats folded (storageMax, cu ft) from
  // vehicle_scores.json, merged onto the vehicle as expertSubscores.storageMax.
  // Fall back to a body-style typical when a vehicle hasn't been measured.
  const storageMax = vehicle.expertSubscores?.storageMax
    ?? STORAGE_FALLBACK_BY_BODY[vehicle.bodyStyle]
    ?? 30
  let S_storage
  if (storageMax >= 110)      S_storage = 1.0
  else if (storageMax >= 85)  S_storage = 0.85
  else if (storageMax >= 60)  S_storage = 0.70
  else if (storageMax >= 40)  S_storage = 0.55
  else if (storageMax >= 28)  S_storage = 0.40
  else                        S_storage = 0.25

  // ── S_performance (0–1) — 0-60 first, horsepower as backstop ─────
  const zeroToSixty = vehicle.zeroToSixty || null
  const hp = vehicle.horsepower || null
  let S_performance
  if (zeroToSixty != null) {
    if (zeroToSixty <= 3.0)      S_performance = 1.0
    else if (zeroToSixty <= 4.0) S_performance = 0.85
    else if (zeroToSixty <= 5.0) S_performance = 0.70
    else if (zeroToSixty <= 6.0) S_performance = 0.55
    else if (zeroToSixty <= 7.5) S_performance = 0.40
    else                         S_performance = 0.25
  } else if (hp != null) {
    if (hp >= 500)      S_performance = 0.85
    else if (hp >= 350) S_performance = 0.65
    else if (hp >= 250) S_performance = 0.45
    else                S_performance = 0.30
  } else {
    S_performance = 0.45  // neutral when neither figure is known (estimated rows)
  }

  // ── Weighted final score (priority-adjusted weights, sum = 1.0) ──
  const personalScore =
    weights.tco         * S_tco +
    weights.range       * S_range +
    weights.features    * S_features +
    weights.charging    * S_charging +
    weights.luxury      * S_luxury +
    weights.port        * S_port +
    weights.efficiency  * S_efficiency +
    weights.performance * S_performance +
    weights.storage     * S_storage

  // Blend in the independent expert rating (0–10 → 0–1) when available, at a
  // modest 12% so it nudges quality without overriding the user's priorities.
  const expertRating = vehicle.expertRating ?? null
  const S_expert = expertRating != null ? expertRating / 10 : null
  let score = S_expert != null
    ? personalScore * 0.88 + S_expert * 0.12
    : personalScore
  // Body-type preference: vehicles outside the chosen shapes are demoted hard
  // (they can still surface if nothing else fits, but they sink below matches).
  const bodyMatch = bodyTypeMatches(bodyTypePref, vehicle.bodyStyle)
  if (!bodyMatch) score *= 0.4
  const pct = Math.round(score * 100)

  return {
    vehicle, score, pct, effectiveMsrp,
    S_tco, S_range, S_charging, S_port, S_features, S_luxury, S_efficiency,
    S_performance, S_storage,
    storageMax, zeroToSixty,
    weights,
    expertRating,
    tco,
    luxuryScore,
    eaOffer: eaOffersMap[vehicle.id] || null,
    conditionalCash: incRec?.conditionalCash || 0,
  }
}

// ══════════════════════════════════════════════════════════════════
// Why-this-match narrative — one short sentence for the #1 result
// ══════════════════════════════════════════════════════════════════
//
// Picks the strongest contributing factors (any S_* ≥ 0.85) and stitches
// them into a single sentence that names the user's stated preference and
// the TCO number. Intentionally short — under ~25 words.
function topMatchNarrative(result, answers) {
  const { vehicle, S_tco, S_range, S_charging, S_port, S_features, S_luxury, S_performance, S_storage, storageMax, zeroToSixty, tco } = result
  const prioritized = answers.priorities || []
  const reasons = []

  if (S_tco       >= 0.85) reasons.push(`fits your budget at ${formatCurrency(tco.monthlyTco)}/mo`)
  if (S_range     >= 0.85) reasons.push(`covers your ${answers.roadTrip === 'often' ? 'frequent road trips' : 'driving range'}`)
  if (S_performance >= 0.85 && prioritized.includes('performance')) reasons.push(zeroToSixty ? `is quick — ${zeroToSixty}s 0–60` : 'delivers the performance you want')
  if (S_storage   >= 0.85 && prioritized.includes('storage')) reasons.push(storageMax ? `hauls ${Math.round(storageMax)} cu ft of cargo` : 'has the cargo room you want')
  if (S_features  >= 0.85 && (answers.lifestyle || []).length > 0) reasons.push('matches your must-have features')
  if (S_charging  >= 0.85) reasons.push('aligns with how you plan to charge')
  if (S_port      >= 0.95 && answers.nacsPreferred) reasons.push('has the NACS port you prefer')
  if (S_luxury    >= 0.85 && answers.luxuryPref && answers.luxuryPref !== 'any') reasons.push(`lands in your ${answers.luxuryPref} tier`)

  // Always lead with the vehicle name; if nothing scored a true standout,
  // fall back to a generic but truthful sentence.
  const lead = `Top pick — the ${vehicle.year} ${vehicle.make} ${vehicle.model}`
  if (reasons.length === 0) {
    return `${lead} scored highest overall on your priorities at ${formatCurrency(tco.monthlyTco)}/mo.`
  }
  const top = reasons.slice(0, 3)
  if (top.length === 1) return `${lead} ${top[0]}.`
  if (top.length === 2) return `${lead} ${top[0]} and ${top[1]}.`
  return `${lead} ${top[0]}, ${top[1]}, and ${top[2]}.`
}

// ══════════════════════════════════════════════════════════════════
// Shared UI components
// ══════════════════════════════════════════════════════════════════

function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
      >
        {children}
      </span>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-ink text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          >
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}

function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-brand-blue' : 'bg-border'}`}
      aria-pressed={on}
    >
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function Stepper({ current, total }) {
  return (
    <div className="flex items-center">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const done = step < current
        const active = step === current
        return (
          <div key={i} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all select-none ${
              done ? 'bg-brand-blue text-white' :
              active ? 'bg-brand-blue text-white ring-4 ring-brand-blue/20' :
              'bg-border text-ink-subtle'
            }`}>
              {done ? '✓' : step}
            </div>
            {i < total - 1 && (
              <div className={`h-0.5 w-10 sm:w-14 transition-all ${done ? 'bg-brand-blue' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function NavButtons({ onBack, onNext, nextLabel = 'Continue →', nextDisabled = false, showBack = true }) {
  return (
    <div className="flex gap-3 mt-8">
      {showBack && (
        <button type="button" onClick={onBack} className="btn-secondary flex-1 py-3">← Back</button>
      )}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="btn-primary flex-1 py-3 disabled:opacity-40 disabled:cursor-not-allowed">
        {nextLabel}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Stage 1 — Cargo size
// ══════════════════════════════════════════════════════════════════

function Stage1({ answers, setAnswer, onNext }) {
  return (
    <div>
      <h2 className="font-serif text-display-md text-ink mb-1">What do you need to fit?</h2>
      <p className="text-ink-muted text-sm mb-6">Pick the biggest thing you'd regularly carry — we'll match you to the right size vehicle.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
        {CARGO_OPTIONS.map(opt => {
          const active = answers.cargo === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswer('cargo', opt.value)}
              className={`text-left p-5 rounded-2xl border-2 transition-all ${
                active
                  ? 'border-brand-blue bg-brand-blue-light'
                  : 'border-border bg-surface-raised hover:border-ink/30 hover:bg-surface-sunken'
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{opt.icon}</span>
                <div>
                  <div className="font-semibold text-ink leading-snug">{opt.label}</div>
                  <div className="text-xs text-ink-muted">{opt.sub}</div>
                </div>
              </div>

              {/* Fits list */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {opt.fits.map(item => (
                  <span
                    key={item}
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      active
                        ? 'border-brand-blue/30 bg-surface-raised/60 text-brand-blue'
                        : 'border-border bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>

              {/* Won't fit note */}
              {opt.wontFit !== 'Nothing — this is the max' && (
                <p className="text-[11px] text-ink-subtle">
                  <span className="opacity-60">Won't quite fit:</span> {opt.wontFit}
                </p>
              )}

              {/* Vehicle type */}
              <p className={`text-[11px] font-medium mt-2 ${active ? 'text-brand-blue' : 'text-ink-subtle'}`}>
                → {opt.vehicles}
              </p>
            </button>
          )
        })}
      </div>

      {/* Body-type preference — optional narrowing on top of cargo size */}
      <div className="mt-5 mb-2">
        <p className="text-sm font-medium text-ink mb-1">Preferred body style <span className="text-ink-subtle font-normal text-xs">(optional)</span></p>
        <p className="text-xs text-ink-muted mb-3">Pick one or more to keep results to those shapes — or leave blank for any.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {BODY_TYPE_OPTIONS.map(opt => {
            const sel = (answers.bodyTypePref || []).includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const cur = answers.bodyTypePref || []
                  setAnswer('bodyTypePref', sel ? cur.filter(b => b !== opt.value) : [...cur, opt.value])
                }}
                className={`px-2 py-2.5 rounded-lg border-2 text-center transition-all ${
                  sel ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-border bg-surface-raised text-ink hover:border-ink/30'
                }`}
              >
                {opt.icon && <div className="text-xl leading-none mb-1">{opt.icon}</div>}
                <div className="font-medium text-xs leading-tight">{opt.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      <NavButtons showBack={false} onNext={onNext} nextDisabled={!answers.cargo} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Stage 2 — Budget & Affordability
// ══════════════════════════════════════════════════════════════════

function Stage2({ answers, setAnswer, onNext, onBack, stateCode, stateRebate }) {
  const [zipInput, setZipInput] = useState('')
  const [zipLoading, setZipLoading] = useState(false)
  const [zipMsg, setZipMsg] = useState(null) // { type: 'ok'|'err', text }

  async function lookupZip() {
    if (zipInput.length !== 5) return
    setZipLoading(true)
    setZipMsg(null)
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zipInput}`)
      if (!res.ok) throw new Error('not found')
      const data = await res.json()
      const st = data.places?.[0]?.['state abbreviation']
      if (st) {
        setAnswer('state', st)
        setZipMsg({ type: 'ok', text: `Detected state: ${st}` })
      }
    } catch {
      setZipMsg({ type: 'err', text: 'ZIP not recognized — using selected state.' })
    } finally {
      setZipLoading(false)
    }
  }

  const totalSubsidy = stateRebate || 0

  return (
    <div>
      <h2 className="font-serif text-display-md text-ink mb-1">What's your budget?</h2>
      <p className="text-ink-muted text-sm mb-6">We'll factor in available incentives to estimate your real out-of-pocket cost.</p>

      {/* ZIP / incentive lookup */}
      <div className="bg-surface-raised border border-border rounded-xl p-4 mb-5">
        <p className="text-sm font-medium text-ink mb-3">Your location (for state incentives)</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={zipInput}
            onChange={e => setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            onKeyDown={e => e.key === 'Enter' && lookupZip()}
            placeholder="ZIP code (optional)"
            className="input-base flex-1"
            maxLength={5}
          />
          <button
            type="button"
            onClick={lookupZip}
            disabled={zipInput.length !== 5 || zipLoading}
            className="btn-secondary shrink-0 disabled:opacity-40"
          >
            {zipLoading ? '…' : 'Look up'}
          </button>
        </div>
        {zipMsg && (
          <p className={`text-xs mt-1.5 ${zipMsg.type === 'ok' ? 'text-status-green' : 'text-status-yellow'}`}>
            {zipMsg.type === 'ok' ? '✓ ' : '⚠ '}{zipMsg.text}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">State:</span>
          <span className="font-semibold text-ink">{stateCode}</span>
          {stateRebate > 0 && (
            <span className="badge badge-blue">+${stateRebate.toLocaleString()} state rebate</span>
          )}
        </div>
        <div className={`mt-2.5 p-3 rounded-lg text-xs ${totalSubsidy > 0 ? 'bg-status-green-bg border border-status-green/30 text-status-green' : 'bg-surface-raised border border-border text-ink-muted'}`}>
          {totalSubsidy > 0 ? (
            <>
              <strong>Est. state incentives: ${totalSubsidy.toLocaleString()}</strong>
              {' '}— state rebate for {stateCode} residents. Manufacturer cash rebates are applied per vehicle in results.
            </>
          ) : (
            <>
              <strong>No state rebate detected for {stateCode}.</strong>
              {' '}Manufacturer cash rebates (e.g. Kia $14,900, Hyundai $15,000) are applied per vehicle in results. The federal §30D credit was repealed in 2025.
            </>
          )}
        </div>
      </div>

      {/* Purchase type — drives the monthly-cost ranking AND the budget tiers */}
      <p className="text-sm font-medium text-ink mb-3">How do you plan to pay?</p>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {PURCHASE_OPTIONS.map(opt => {
          const active = (answers.purchaseMode || 'finance') === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                // Each pay plan has its own budget ladder (cash = sticker price,
                // finance vs lease = different all-in monthly ranges), so any
                // mode change invalidates the prior pick — clear it to re-pick.
                if (opt.value !== (answers.purchaseMode || 'finance')) {
                  setAnswer('budgetTier', null)
                }
                setAnswer('purchaseMode', opt.value)
              }}
              className={`p-3 rounded-xl border-2 transition-all text-center ${
                active
                  ? 'border-brand-blue bg-brand-blue-light'
                  : 'border-border bg-surface-raised hover:border-ink/30'
              }`}
            >
              <div className="text-2xl mb-1">{opt.icon}</div>
              <div className={`font-medium text-sm ${active ? 'text-brand-blue' : 'text-ink'}`}>{opt.label}</div>
              <div className="text-[11px] text-ink-muted leading-tight mt-0.5">{opt.sub}</div>
            </button>
          )
        })}
      </div>

      {/* Lease term — only relevant when leasing. Shorter terms cost more per
          month but keep you in newer cars; the lease payment scales with it. */}
      {answers.purchaseMode === 'lease' && (
        <div className="mb-5">
          <p className="text-sm font-medium text-ink mb-3">Lease term</p>
          <div className="grid grid-cols-2 gap-3">
            {[24, 36].map(term => {
              const active = (answers.leaseTermMonths || 36) === term
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => setAnswer('leaseTermMonths', term)}
                  className={`p-3 rounded-xl border-2 transition-all text-center ${
                    active ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-raised hover:border-ink/30'
                  }`}
                >
                  <div className={`font-medium text-sm ${active ? 'text-brand-blue' : 'text-ink'}`}>{term} months</div>
                  <div className="text-[11px] text-ink-muted leading-tight mt-0.5">
                    {term === 24 ? 'Higher monthly, newer car sooner' : 'Lower monthly, most common'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Budget tiers — total price for cash, monthly payment for finance/lease */}
      <p className="text-sm font-medium text-ink mb-3">
        {(answers.purchaseMode || 'finance') === 'cash'
          ? 'Budget before incentives (total price)'
          : 'Monthly payment budget (all-in)'}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {((answers.purchaseMode || 'finance') === 'cash' ? MSRP_TIERS
          : (answers.purchaseMode === 'lease' ? LEASE_TIERS : FINANCE_TIERS)).map(tier => (
          <button
            key={tier.label}
            type="button"
            onClick={() => setAnswer('budgetTier', tier)}
            className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
              answers.budgetTier?.max === tier.max
                ? 'border-brand-blue bg-brand-blue-light text-brand-blue'
                : 'border-border bg-surface-raised text-ink hover:border-ink/30'
            }`}
          >
            {tier.label}
          </button>
        ))}
      </div>

      {/* Monthly TCO is always shown on the result cards now — the old
          show/hide toggle was tied to the (now-removed) gas-savings pill. */}

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!answers.budgetTier} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Stage 3 — Driving habits & range
// ══════════════════════════════════════════════════════════════════

function Stage3({ answers, setAnswer, onNext, onBack }) {
  const commute = answers.commuteMiles ?? 30
  const showWarning = answers.firstEV && answers.roadTrip === 'often'

  return (
    <div>
      <h2 className="font-serif text-display-md text-ink mb-1">How do you drive?</h2>
      <p className="text-ink-muted text-sm mb-6">Your daily commute and road trip habits shape range requirements.</p>

      {/* Commute slider */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-ink">Daily round-trip commute</label>
          <span className="font-semibold text-brand-blue text-sm">
            {commute >= 100 ? '100+ mi' : `${commute} mi`}
          </span>
        </div>
        <input
          type="range"
          min={0} max={100} step={5}
          value={Math.min(commute, 100)}
          onChange={e => setAnswer('commuteMiles', Number(e.target.value))}
          className="w-full accent-brand-blue"
        />
        <div className="flex justify-between text-xs text-ink-subtle mt-1 select-none">
          <span>0 mi</span><span>50 mi</span><span>100+ mi</span>
        </div>
      </div>

      {/* Road trip frequency */}
      <div className="mb-6">
        <p className="text-sm font-medium text-ink mb-3">Road trips (&gt;150 miles) — how often?</p>
        <div className="grid grid-cols-3 gap-3">
          {ROAD_TRIP_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswer('roadTrip', opt.value)}
              className={`p-3 rounded-xl border-2 transition-all text-center ${
                answers.roadTrip === opt.value
                  ? 'border-brand-blue bg-brand-blue-light'
                  : 'border-border bg-surface-raised hover:border-ink/30'
              }`}
            >
              <div className="font-medium text-sm text-ink">{opt.label}</div>
              <div className="text-xs text-ink-muted mt-0.5">{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Minimum range floor */}
      <div className="mb-6">
        <p className="text-sm font-medium text-ink mb-1">Minimum range you'll accept</p>
        <p className="text-xs text-ink-muted mb-3">A hard floor — vehicles (and trims) under this are pushed down, and we'll recommend a trim that clears it.</p>
        <div className="grid grid-cols-4 gap-2">
          {MIN_RANGE_OPTIONS.map(opt => {
            const active = (answers.minRange || 0) === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnswer('minRange', opt.value)}
                className={`px-2 py-2.5 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                  active ? 'border-brand-blue bg-brand-blue-light text-brand-blue' : 'border-border bg-surface-raised text-ink hover:border-ink/30'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* First EV toggle */}
      <div className="flex items-center justify-between p-4 bg-surface-raised border border-border rounded-xl mb-3">
        <div>
          <p className="text-sm font-medium text-ink">Is this your first EV?</p>
          <p className="text-xs text-ink-muted">Helps us prioritize range confidence</p>
        </div>
        <Toggle on={!!answers.firstEV} onToggle={() => setAnswer('firstEV', !answers.firstEV)} />
      </div>

      {/* Range anxiety warning */}
      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-status-yellow-bg border border-status-yellow/30 rounded-xl p-4 text-sm text-status-yellow"
          >
            <strong>Range tip:</strong> For first-time EV owners who road-trip frequently, we recommend at
            least 310 miles of EPA range — enough to complete most highway trips with one or zero charging stops.
            We'll apply this as a filter to your results.
          </motion.div>
        )}
      </AnimatePresence>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!answers.roadTrip} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Stage 4 — Charging infrastructure
// ══════════════════════════════════════════════════════════════════

function Stage4({ answers, setAnswer, onNext, onBack }) {
  const prefs = answers.chargingPrefs || []

  function toggle(value) {
    setAnswer('chargingPrefs', prefs.includes(value)
      ? prefs.filter(c => c !== value)
      : [...prefs, value]
    )
  }

  return (
    <div>
      <h2 className="font-serif text-display-md text-ink mb-1">How will you charge?</h2>
      <p className="text-ink-muted text-sm mb-6">Select all that apply — your charging situation is the biggest real-world cost driver.</p>

      <div className="space-y-3 mb-5">
        {CHARGING_OPTIONS.map(opt => {
          const active = prefs.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                active ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-raised hover:border-ink/30'
              }`}
            >
              {opt.icon && <span className="text-2xl shrink-0">{opt.icon}</span>}
              <div className="flex-1">
                <div className="font-medium text-sm text-ink">{opt.label}</div>
                <div className="text-xs text-ink-muted">{opt.sub}</div>
              </div>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'border-brand-blue bg-brand-blue' : 'border-border'}`}>
                {active && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* NACS priority */}
      <div className="p-4 bg-surface-raised border border-border rounded-xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">Prioritize NACS connector</p>
            <Tooltip text="NACS (North American Charging Standard) gives native access to Tesla Superchargers — 20,000+ locations in the US. CCS1 vehicles need an adapter (~$200). Most 2025 EVs ship with NACS now.">
              <span className="text-xs text-ink-subtle bg-border rounded-full px-1.5 py-0.5 cursor-help">?</span>
            </Tooltip>
          </div>
          <Toggle on={!!answers.nacsPreferred} onToggle={() => setAnswer('nacsPreferred', !answers.nacsPreferred)} />
        </div>
        {answers.nacsPreferred && (
          <p className="text-xs text-ink-muted mt-2">NACS vehicles score higher in your results. CCS1 adapters cost ~$200 if you change your mind later.</p>
        )}
      </div>

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={prefs.length === 0} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Stage 5 — Lifestyle features
// ══════════════════════════════════════════════════════════════════

function Stage5({ answers, setAnswer, onNext, onBack }) {
  const lifestyle = answers.lifestyle || []
  const luxuryPref = answers.luxuryPref || 'any'
  const priorities = answers.priorities || []

  function toggle(value) {
    setAnswer('lifestyle', lifestyle.includes(value)
      ? lifestyle.filter(l => l !== value)
      : [...lifestyle, value]
    )
  }

  // Cap the number of priorities so the boost stays meaningful (picking
  // everything = prioritizing nothing).
  const MAX_PRIORITIES = 3
  function togglePriority(value) {
    if (priorities.includes(value)) {
      setAnswer('priorities', priorities.filter(p => p !== value))
    } else if (priorities.length < MAX_PRIORITIES) {
      setAnswer('priorities', [...priorities, value])
    }
  }

  return (
    <div>
      <h2 className="font-serif text-display-md text-ink mb-1">Any must-have features?</h2>
      <p className="text-ink-muted text-sm mb-6">Select what matters to you — or skip this step if you don't have specific preferences.</p>

      {/* ── What matters most (priorities) ────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-ink">What matters most?</p>
          <Tooltip text="Pick up to 3. Your choices boost how heavily we weight those factors when ranking — e.g. choosing Performance & Storage pushes quick, roomy vehicles to the top.">
            <span className="text-xs text-ink-subtle bg-border rounded-full px-1.5 py-0.5 cursor-help">?</span>
          </Tooltip>
        </div>
        <p className="text-xs text-ink-muted mb-3">Choose up to {MAX_PRIORITIES} — we'll weight your results toward them.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {PRIORITY_OPTIONS.map(opt => {
            const active = priorities.includes(opt.value)
            const disabled = !active && priorities.length >= MAX_PRIORITIES
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => togglePriority(opt.value)}
                disabled={disabled}
                className={`px-2 py-2.5 rounded-lg border-2 text-center transition-all ${
                  active
                    ? 'border-brand-blue bg-brand-blue-light text-brand-blue'
                    : disabled
                      ? 'border-border bg-surface-sunken text-ink-subtle cursor-not-allowed opacity-50'
                      : 'border-border bg-surface-raised text-ink hover:border-ink/30'
                }`}
              >
                {opt.icon && <div className="text-xl leading-none mb-1">{opt.icon}</div>}
                <div className="font-medium text-xs leading-tight">{opt.label}</div>
                <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">{opt.sub}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Luxury preference ─────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-sm font-medium text-ink">Desired luxury tier</p>
          <Tooltip text="Based on premium features: massage seats, air suspension, concert audio, soft-close doors, ambient lighting, etc. Higher tiers = more amenities = typically higher cost.">
            <span className="text-xs text-ink-subtle bg-border rounded-full px-1.5 py-0.5 cursor-help">?</span>
          </Tooltip>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {LUXURY_PREFERENCES.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswer('luxuryPref', opt.value)}
              className={`px-2 py-2.5 rounded-lg border-2 text-center transition-all ${
                luxuryPref === opt.value
                  ? 'border-brand-blue bg-brand-blue-light text-brand-blue'
                  : 'border-border bg-surface-raised text-ink hover:border-ink/30'
              }`}
            >
              <div className="font-medium text-xs leading-tight">{opt.label}</div>
              <div className="text-[10px] text-ink-muted mt-0.5 leading-tight">{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Feature checklist ─────────────────────────────────────────── */}
      <p className="text-sm font-medium text-ink mb-3">Must-have features</p>
      <div className="space-y-3 mb-2">
        {LIFESTYLE_OPTIONS.map(opt => {
          const active = lifestyle.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                active ? 'border-brand-blue bg-brand-blue-light' : 'border-border bg-surface-raised hover:border-ink/30'
              }`}
            >
              {opt.icon && <span className="text-2xl shrink-0">{opt.icon}</span>}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-ink">{opt.label}</span>
                  <Tooltip text={opt.tooltip}>
                    <span className="text-xs text-ink-subtle bg-border rounded-full px-1.5 py-0.5 cursor-help">?</span>
                  </Tooltip>
                </div>
              </div>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${active ? 'border-brand-blue bg-brand-blue' : 'border-border'}`}>
                {active && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextLabel="Find My EV →"
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Test Drive form (modal content)
// ══════════════════════════════════════════════════════════════════

function TestDriveForm({ vehicle, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', zip: '', notes: '' })
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email.includes('@')) e.email = 'Valid email required'
    if (form.zip.length !== 5) e.zip = '5-digit ZIP required'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    const prev = JSON.parse(localStorage.getItem('evs_test_drive_requests') || '[]')
    prev.push({
      ...form,
      vehicleId: vehicle.id,
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      submittedAt: new Date().toISOString(),
    })
    localStorage.setItem('evs_test_drive_requests', JSON.stringify(prev))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-3">✅</div>
        <h3 className="font-semibold text-ink text-lg mb-1">Request Submitted!</h3>
        <p className="text-sm text-ink-muted mb-1">We'll connect you with local dealers for the</p>
        <p className="font-semibold text-ink mb-4">{vehicle.year} {vehicle.make} {vehicle.model}</p>
        <p className="text-xs text-ink-subtle mb-6">A confirmation was sent to {form.email}</p>
        <button type="button" onClick={onClose} className="btn-secondary">Close</button>
      </div>
    )
  }

  const field = (key, placeholder, type = 'text') => (
    <div>
      <input
        required
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(er => ({ ...er, [key]: '' })) }}
        className={`input-base w-full ${errors[key] ? 'border-status-red' : ''}`}
      />
      {errors[key] && <p className="text-xs text-status-red mt-0.5">{errors[key]}</p>}
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <h3 className="font-semibold text-ink mb-0.5">Schedule a Test Drive</h3>
      <p className="text-sm text-ink-muted mb-4">{vehicle.year} {vehicle.make} {vehicle.model}</p>
      <div className="space-y-3">
        {field('name', 'Your name')}
        {field('email', 'Email address', 'email')}
        {field('zip', 'ZIP code')}
        <textarea
          placeholder="Notes or preferred dates (optional)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="input-base w-full resize-none"
          rows={2}
        />
      </div>
      <div className="flex gap-3 mt-4">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn-primary flex-1">Request Test Drive</button>
      </div>
    </form>
  )
}

// ══════════════════════════════════════════════════════════════════
// Match card
// ══════════════════════════════════════════════════════════════════

function ScoreBar({ label, value, weight, boosted = false }) {
  // `weight` is a 0–1 fraction; render it as a % and flag when the user's
  // priorities have boosted it above the baseline.
  return (
    <div className="flex items-center gap-3 mb-1.5">
      <span className={`text-xs w-16 shrink-0 ${boosted ? 'text-brand-blue font-semibold' : 'text-ink-muted'}`}>
        {label}{boosted ? ' ★' : ''}
      </span>
      <div className="flex-1 bg-surface-sunken rounded-full h-1.5">
        <div className={`rounded-full h-1.5 transition-all ${boosted ? 'bg-brand-blue' : 'bg-brand-blue/70'}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs text-ink-subtle w-8 text-right">{Math.round(value * 100)}%</span>
      <span className={`text-xs w-9 text-right hidden sm:block ${boosted ? 'text-brand-blue font-semibold' : 'text-ink-subtle/60'}`}>
        {Math.round(weight * 100)}%
      </span>
    </div>
  )
}

function MatchCard({ result, rank, narrative, isExpanded, onToggle, onTestDrive, leaseTerm = 36, priorities = [], minRange = 0, purchaseMode = 'finance' }) {
  const { vehicle, pct, effectiveMsrp, S_tco, S_range, S_charging, S_port, S_features, S_luxury, S_efficiency, S_performance, S_storage, storageMax, zeroToSixty, weights, tco, luxuryScore, expertRating, eaOffer, conditionalCash } = result
  const isBest = rank === 1
  const luxuryTier = getLuxuryTier(luxuryScore)
  const leaseCalcRec = useLeaseCalc()[vehicle.id] || null

  // Lazily load the full trim list (cached) and recommend a specific trim for
  // the user's top priority. Only the top few cards mount, so this is a couple
  // of small fetches; missing detail files just yield no suggestion.
  const { vehicle: detail } = useVehicleDetail(vehicle.id)
  const suggestedTrim = useMemo(
    () => suggestTrim(detail, { priorities, minRange }),
    [detail, priorities, minRange]
  )

  // The base TCO (from scoring) is the lowest/base style. Re-cost it for the
  // SUGGESTED trim so the headline reflects the trim we actually recommend —
  // swap the payment (the part that varies by trim) and keep the shared
  // operating costs. Lease uses that trim's lease-calc monthly; finance uses an
  // estimate from the trim MSRP; cash has no payment.
  const trimMonthlyTco = useMemo(() => {
    if (!suggestedTrim || !tco) return null
    const operating = (tco.monthlyTco || 0) - (tco.payment || 0)
    let payment = tco.payment || 0
    if (purchaseMode === 'cash') {
      payment = 0
    } else if (purchaseMode === 'lease' && leaseCalcRec) {
      const lc = leaseCalcFor(leaseCalcRec, suggestedTrim.name, leaseTerm)
      if (lc?.monthly) payment = lc.monthly
    } else if (purchaseMode === 'finance' && suggestedTrim.msrp) {
      payment = Math.round(estimateFinanceMonthly(suggestedTrim.msrp))
    }
    const total = Math.round(operating + payment)
    // Only override when it actually differs from the base headline.
    return total !== Math.round(tco.monthlyTco) ? total : null
  }, [suggestedTrim, tco, purchaseMode, leaseTerm, leaseCalcRec])

  const displayMonthlyTco = trimMonthlyTco ?? tco.monthlyTco

  const {
    state: stateCode, compareVehicleIds, addToCompare, removeFromCompare, isInCompare,
  } = useUserPreferencesStore()
  const inCompare = isInCompare(vehicle.id)
  const compareMaxed = compareVehicleIds.length >= 3 && !inCompare
  const incentiveSearchUrl =
    'https://www.google.com/search?q=' +
    encodeURIComponent(`${vehicle.year} ${vehicle.make} ${vehicle.model} EV tax credit rebate incentives ${stateCode}`)

  const badgeColor = pct >= 80 ? 'bg-status-green' : pct >= 65 ? 'bg-brand-blue' : 'bg-ink-muted'
  const imgSrc = vehicleImgSrc(vehicle, 800)
  const TS = '0 2px 14px rgba(8,10,16,0.95), 0 1px 3px rgba(8,10,16,0.9)'

  return (
    <div className={`group card overflow-hidden relative ${isBest ? 'ring-1 ring-accent-lime' : ''}`}>
      {isBest && <div className="absolute top-0 left-0 bottom-0 w-1.5 z-10" style={{ background: 'linear-gradient(180deg,#CFF44A,#b9e22f)' }} />}

      {/* Hero — Browse-style row: faded photo behind the name + stat row + extras */}
      <div className="relative px-5 sm:px-6 pt-5 pb-5 overflow-hidden">
        {imgSrc && (
          <img
            src={imgSrc}
            alt={`${vehicle.make} ${vehicle.model}`}
            loading="lazy"
            className="pointer-events-none absolute left-4 bottom-0 w-auto max-w-none object-contain h-[150px] opacity-[0.16] group-hover:opacity-100 transition-all duration-500 ease-out drop-shadow-2xl z-0"
          />
        )}
        <div className="relative z-[1]">
          <div className="flex items-center gap-3">
            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[11px] font-semibold text-ink-muted bg-white/[0.06] px-2 py-0.5 rounded-pill capitalize">{vehicle.bodyStyle}</span>
                {isBest && <span className="text-[11px] font-bold text-[#5a7a00] bg-accent-lime/[0.16] px-2 py-0.5 rounded-pill">Top match · #{rank}</span>}
                {!isBest && <span className="text-[11px] text-ink-subtle">Match #{rank}</span>}
                {expertRating != null && <span className="text-[11px] font-semibold text-status-green" title={`Independent expert rating: ${expertRating}/10`}>Expert {expertRating}</span>}
              </div>
              <div className="font-grotesk font-semibold text-[20px] tracking-tight leading-tight" style={{ textShadow: TS }}>{vehicle.year} {vehicle.make} {vehicle.model}</div>
            </div>
            {/* Match % — top right */}
            <div className={`shrink-0 text-white text-center px-3 py-1.5 rounded-pill ${badgeColor}`}>
              <span className="font-grotesk text-sm font-bold">{pct}%</span>
              <span className="text-[10px] opacity-80 ml-1">match</span>
            </div>
            {/* Compare */}
            <button
              onClick={() => inCompare ? removeFromCompare(vehicle.id) : (!compareMaxed && addToCompare(vehicle.id))}
              disabled={compareMaxed}
              className={`shrink-0 hidden sm:inline-flex items-center px-3.5 py-2 rounded-pill text-[12.5px] font-semibold border transition-colors ${
                inCompare ? 'border-brand-blue text-brand-indigo bg-brand-blue/15'
                : compareMaxed ? 'border-border text-ink-subtle cursor-not-allowed'
                : 'border-border text-ink-muted hover:border-brand-blue hover:text-brand-indigo bg-surface-raised/70'
              }`}
            >
              {inCompare ? 'Added' : 'Compare'}
            </button>
          </div>

          {/* Stat row — matches Browse */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3.5">
            <div><div className="text-nano font-bold uppercase tracking-wider text-ink-subtle mb-1">MSRP</div><div className="font-grotesk font-semibold text-lg text-ink-muted leading-none" style={{ textShadow: TS }}>{formatCurrency(vehicle.msrpFrom)}</div></div>
            <div><div className="text-nano font-bold uppercase tracking-wider text-brand-blue mb-1">Mo. TCO{trimMonthlyTco != null ? ' · trim' : ''}</div><div className="font-grotesk font-semibold text-lg text-brand-blue leading-none" style={{ textShadow: TS }}>{formatCurrency(displayMonthlyTco)}<span className="text-[11px] text-ink-subtle font-medium">/mo</span></div></div>
            <div><div className="text-nano font-bold uppercase tracking-wider text-ink-subtle mb-1">Range</div><div className="font-grotesk font-semibold text-lg text-ink-muted leading-none" style={{ textShadow: TS }}>{vehicle.testedRange || vehicle.rangeEpa || '—'} mi</div></div>
            <div><div className="text-nano font-bold uppercase tracking-wider text-ink-subtle mb-1">¢/mile</div><div className="font-grotesk font-semibold text-lg text-ink-muted leading-none" style={{ textShadow: TS }}>{tco.centsPerMile}¢</div></div>
          </div>

          {/* Why-this-match narrative — only on the #1 result */}
          {isBest && narrative && (
            <p className="mt-1.5 text-xs italic text-ink-muted leading-snug">
              {narrative}
            </p>
          )}

          {/* Suggested trim — picked for the user's top priority */}
          {suggestedTrim && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue-light/40 px-2.5 py-1.5">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-brand-blue shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] text-ink leading-snug">
                  <span className="text-ink-subtle">Suggested trim:</span>{' '}
                  <span className="font-semibold">{suggestedTrim.name}</span>
                  {suggestedTrim.msrp ? <span className="text-ink-muted"> · {formatCurrency(suggestedTrim.msrp)}</span> : null}
                </div>
                <div className="text-[10px] text-ink-muted leading-snug">{suggestedTrim.reason}</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-ink-muted">
            <span>{vehicle.testedRange || vehicle.rangeEpa || '—'} mi {vehicle.testedRange ? 'tested' : 'range'}</span>
            <span>{formatCurrency(effectiveMsrp)} after incentives</span>
            {conditionalCash > 0 && (
              <span
                className="text-ink-subtle cursor-help"
                title="Targeted offers you may additionally qualify for (e.g. conquest, military, college grad, captive-lender finance). Not subtracted above since they don't apply to everyone."
              >
                +up to {formatCurrency(conditionalCash)} if you qualify
              </span>
            )}
            {eaOffer && (
              <span
                className="px-1.5 py-0.5 rounded-full border border-status-green/30 bg-status-green-bg text-status-green text-[10px] font-medium"
                title={`${eaOffer.provider}: ${eaOffer.summary}. Enroll via ${eaOffer.enroll}.${tco.eaSavings ? ` ≈ ${formatCurrency(tco.eaSavings)}/mo reflected in charging.` : ''} Terms vary — verify.`}
              >
                Free EA charging{tco.eaSavings ? ` · −${formatCurrency(tco.eaSavings)}/mo` : ''}
              </span>
            )}
            {leaseCalcRec && <LeaseCalcEstimate rec={leaseCalcRec} term={leaseTerm} variant="chip" />}
            {luxuryTier && (
              <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${luxuryTier.color}`}>
                {luxuryTier.label}
              </span>
            )}
            {vehicle.dataQuality === 'estimated' && (
              <span
                className="px-1.5 py-0.5 rounded-full border border-status-yellow/30 bg-status-yellow-bg text-status-yellow text-[10px] font-medium"
                title="Numbers are estimated from MSRP + battery — exact offers not yet scraped"
              >
                ⓘ Estimated
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pt-3 pb-4">
              <p className="text-[10px] font-semibold text-ink-subtle uppercase tracking-wider mb-2.5">
                Score Breakdown
                <span className="ml-1 normal-case font-normal text-ink-subtle/70">· weight shown at right (★ = your priority)</span>
              </p>
              {[
                { key: 'tco',         label: 'TCO',        value: S_tco },
                { key: 'range',       label: 'Range',      value: S_range },
                { key: 'luxury',      label: 'Luxury',     value: S_luxury },
                { key: 'features',    label: 'Features',   value: S_features },
                { key: 'charging',    label: 'Charging',   value: S_charging },
                { key: 'performance', label: 'Performance',value: S_performance },
                { key: 'storage',     label: 'Storage',    value: S_storage },
                { key: 'port',        label: 'Port',       value: S_port },
                { key: 'efficiency',  label: '¢/mile',     value: S_efficiency },
              ]
                .sort((a, b) => (weights?.[b.key] ?? 0) - (weights?.[a.key] ?? 0))
                .map(row => (
                  <ScoreBar
                    key={row.key}
                    label={row.label}
                    value={row.value}
                    weight={weights?.[row.key] ?? 0}
                    boosted={(weights?.[row.key] ?? 0) > (BASE_WEIGHTS[row.key] ?? 0) + 0.001}
                  />
                ))}
              {expertRating != null && (
                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px]">
                  <span className="text-ink-subtle">Independent expert rating (12% of score)</span>
                  <span className="font-semibold text-status-green">{expertRating}/10</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap bg-surface-raised/50">
        <Link to={`/vehicles/${vehicle.id}`} className="btn-secondary text-xs py-1.5 px-3">View Details</Link>
        <a
          href={incentiveSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs py-1.5 px-3"
          title={`Search current incentives for the ${vehicle.make} ${vehicle.model} in ${stateCode}`}
        >
          Search incentives
        </a>
        <a href={manufacturerUrl(vehicle)} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs py-1.5 px-3">
          Manufacturer site ↗
        </a>
        <button type="button" onClick={onToggle} className="text-xs text-ink-subtle hover:text-ink ml-auto transition-colors">
          {isExpanded ? 'Hide breakdown ▲' : 'Score breakdown ▼'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Results view
// ══════════════════════════════════════════════════════════════════

// Result-aware compare fields — operate on the full match result (vehicle + tco + luxuryScore)
const COMPARE_FIELDS = [
  { label: 'Monthly TCO',  key: r => formatCurrency(r.tco.monthlyTco) + '/mo',  emphasis: true },
  { label: 'Cost / mile',  key: r => r.tco.centsPerMile + '¢/mi (blended)',       emphasis: true },
  { label: '⚡ DCFC /mi',  key: r => r.tco.fastCentsPerMile + '¢/mi',            emphasis: false },
  { label: 'Range',        key: r => r.vehicle.rangeEpa       ? `${r.vehicle.rangeEpa} mi` : '—' },
  { label: 'Real-world',   key: r => r.tco.efficiency.mi_per_kwh.toFixed(1) + ' mi/kWh' },
  { label: 'Base MSRP',    key: r => r.vehicle.msrpFrom       ? formatCurrency(r.vehicle.msrpFrom) : '—' },
  { label: 'Luxury tier',  key: r => {
      const t = getLuxuryTier(r.luxuryScore)
      return t ? `${t.label} (${r.luxuryScore}/10)` : '—'
    } },
  { label: 'Charging Port', key: r => r.vehicle.chargingPort  || '—' },
  { label: 'Drivetrain',    key: r => r.vehicle.drivetrains?.join(' / ') || '—' },
  { label: 'Seating',       key: r => r.vehicle.seatingCapacity ? `${r.vehicle.seatingCapacity} seats` : '—' },
  { label: 'Lease From',    key: r => r.vehicle.leaseFrom    ? `$${r.vehicle.leaseFrom}/mo`  : '—' },
  { label: '0–60 mph',      key: r => r.vehicle.zeroToSixty  ? `${r.vehicle.zeroToSixty}s`   : '—' },
]

function Results({ matches, answers, onRestart, refinements, setRefinements }) {
  const [expandedId, setExpandedId] = useState(null)
  const [testDriveVehicle, setTestDriveVehicle] = useState(null)

  // Apply local refinement filters on top of the scored result set
  const refinedMatches = useMemo(
    () => applyRefinements(matches, refinements),
    [matches, refinements]
  )
  const top3 = refinedMatches.slice(0, 3)
  const resetRefinements = () => setRefinements(REFINE_DEFAULTS)

  return (
    <div>
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill text-accent-lime text-xs font-semibold mb-3" style={{ background: 'linear-gradient(135deg, #2F5BFF, #6B5CFF)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent-lime" />Matched to your answers
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display text-display-md text-ink">Your top <span className="italic text-brand-indigo">EVs</span></h2>
          <span className="badge badge-blue">{matches.length} vehicles scored</span>
        </div>
        <p className="text-ink-muted text-sm mt-1">
          {top3.length > 0
            ? `Showing the top ${top3.length}${refinedMatches.length !== matches.length ? ` from ${refinedMatches.length} after filtering` : ''} of ${matches.length} scored vehicles.`
            : 'No vehicles matched your criteria. Try broadening your budget or relaxing the refinement filters.'}
        </p>
        <IncentiveNotice className="mt-3" />
        <EstimateNotice className="mt-3" />
      </div>

      {/* Local refinement sliders — pure post-processing, no API calls */}
      {matches.length > 0 && (
        <RefinePanel
          totalCount={matches.length}
          filteredCount={refinedMatches.length}
          refinements={refinements}
          onChange={partial => setRefinements({ ...refinements, ...partial })}
          onReset={resetRefinements}
        />
      )}

      {top3.length === 0 ? (
        <div className="text-center py-12 card">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="font-semibold text-ink mb-2">No matches found</h3>
          <p className="text-sm text-ink-muted mb-4">Try increasing your budget, relaxing range requirements, or removing lifestyle filters.</p>
          <button type="button" onClick={onRestart} className="btn-secondary">Start Over</button>
        </div>
      ) : (
        <>
          {/* Match cards */}
          <div className="space-y-4 mb-8">
            {top3.map((result, i) => (
              <MatchCard
                key={result.vehicle.id}
                result={result}
                rank={i + 1}
                narrative={i === 0 ? topMatchNarrative(result, answers) : null}
                isExpanded={expandedId === result.vehicle.id}
                onToggle={() => setExpandedId(expandedId === result.vehicle.id ? null : result.vehicle.id)}
                onTestDrive={() => setTestDriveVehicle(result.vehicle)}
                leaseTerm={answers.purchaseMode === 'lease' ? (answers.leaseTermMonths || 36) : 36}
                priorities={answers.priorities || []}
                minRange={answers.minRange || 0}
                purchaseMode={answers.purchaseMode || 'finance'}
              />
            ))}
          </div>

          {/* Side-by-side comparison table */}
          {top3.length > 1 && (
            <div className="card overflow-hidden mb-8">
              <div className="px-4 py-3 border-b border-border bg-surface-raised">
                <h3 className="font-semibold text-ink text-sm">Side-by-Side Comparison</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left text-xs text-ink-subtle font-normal w-28">Spec</th>
                      {top3.map((r, i) => (
                        <th key={r.vehicle.id} className="px-4 py-2 text-left">
                          <div className="text-xs font-semibold text-ink leading-snug">
                            {r.vehicle.make} {r.vehicle.model}
                          </div>
                          {i === 0 && <span className="text-[10px] text-brand-blue">★ Best Match</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_FIELDS.map(field => (
                      <tr
                        key={field.label}
                        className={`border-b border-border/50 hover:bg-surface-sunken ${field.emphasis ? 'bg-brand-blue-light/40' : ''}`}
                      >
                        <td className={`px-4 py-2 text-xs whitespace-nowrap ${field.emphasis ? 'text-brand-blue font-semibold' : 'text-ink-subtle font-medium'}`}>
                          {field.label}
                        </td>
                        {top3.map(r => (
                          <td key={r.vehicle.id} className={`px-4 py-2 text-xs tabular-nums ${field.emphasis ? 'text-brand-blue font-bold' : 'text-ink'}`}>
                            {field.key(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-b border-border/50 hover:bg-surface-sunken">
                      <td className="px-4 py-2 text-xs text-ink-subtle font-medium">Match Score</td>
                      {top3.map(r => (
                        <td key={r.vehicle.id} className="px-4 py-2">
                          <span className={`text-xs font-bold ${r.pct >= 80 ? 'text-status-green' : 'text-brand-blue'}`}>{r.pct}%</span>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-surface-sunken">
                      <td className="px-4 py-2 text-xs text-ink-subtle font-medium">Est. After Incentives</td>
                      {top3.map(r => (
                        <td key={r.vehicle.id} className="px-4 py-2 text-xs text-ink font-medium">
                          ${r.effectiveMsrp > 0 ? r.effectiveMsrp.toLocaleString() : '—'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onRestart} className="btn-secondary">Start Over</button>
            <Link to="/browse" className="btn-secondary">Browse All EVs</Link>
            {top3.length > 1 && (
              <Link to="/compare" className="btn-primary">Full EV Comparison →</Link>
            )}
          </div>
        </>
      )}

      {/* Test drive modal */}
      <AnimatePresence>
        {testDriveVehicle && (
          <motion.div
            key="modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setTestDriveVehicle(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative bg-surface-raised rounded-2xl shadow-2xl p-6 w-full max-w-md"
            >
              <button
                type="button"
                onClick={() => setTestDriveVehicle(null)}
                className="absolute top-4 right-4 text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <TestDriveForm vehicle={testDriveVehicle} onClose={() => setTestDriveVehicle(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════════

const INITIAL_ANSWERS = {
  cargo: null,
  bodyTypePref: [],        // preferred body styles (empty = any)
  budgetTier: null,
  purchaseMode: 'finance', // 'cash' | 'finance' | 'lease' — drives the TCO ranking
  leaseTermMonths: 36,     // 24 | 36 — only used when purchaseMode === 'lease'
  state: null,
  commuteMiles: 30,
  minRange: 0,             // hard minimum EPA range floor (0 = none)
  roadTrip: null,
  firstEV: false,
  chargingPrefs: [],
  nacsPreferred: false,
  lifestyle: [],
  luxuryPref: 'any',
  priorities: [],          // what the user values most (boosts those weights)
}

const slideVariants = {
  enter: dir => ({ x: dir > 0 ? 56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: dir => ({ x: dir > 0 ? -56 : 56, opacity: 0 }),
}

export default function MatcherPage() {
  const [stage, setStage] = useState(1)       // 1–5 wizard, 6 = results
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = backward
  const [answers, setAnswers] = useState(INITIAL_ANSWERS)
  const [refinements, setRefinements] = useState(REFINE_DEFAULTS)
  const { allVehicles, loading, meta } = useMatcherVehicles()
  const incentivesMap = useIncentives()
  const eaOffersMap = useEAOffers()
  const leaseCalcMap = useLeaseCalc()
  const {
    state: storeState,
    annualMileage: storeAnnualMileage,
    chargingMixPercent: storeMix,
    electricityRateCentsPerKwh,
    dcfcRateCentsPerKwh,
    publicL2RateCentsPerKwh,
  } = useUserPreferencesStore()

  const stateCode  = answers.state || storeState || 'TX'
  const stateRebate = getMatcherStateRebate(stateCode)
  const annualMileage = storeAnnualMileage || 12000
  const chargingMixPercent = storeMix || { home: 80, publicL2: 10, dcFast: 10 }
  const rateOverrides = {
    homeRateCentsPerKwh: electricityRateCentsPerKwh,
    dcfcRateCentsPerKwh,
    l2RateCentsPerKwh: publicL2RateCentsPerKwh,
  }

  function setAnswer(key, value) {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  function goNext() {
    setDirection(1)
    setStage(s => s + 1)
  }

  function goBack() {
    setDirection(-1)
    setStage(s => s - 1)
  }

  function restart() {
    setAnswers(INITIAL_ANSWERS)
    setRefinements(REFINE_DEFAULTS)
    setDirection(1)
    setStage(1)
    window.scrollTo(0, 0)
  }

  // When the results screen first appears, pre-apply the wizard's minimum-range
  // and body-type preferences to the refine panel, so the user sees them
  // reflected and can loosen/tighten them with the other "adjustable" filters.
  useEffect(() => {
    if (stage !== TOTAL_STAGES + 1) return
    setRefinements(r => ({
      ...r,
      minRange: answers.minRange || 0,
      bodyTypes: answers.bodyTypePref || [],
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const matches = useMemo(() => {
    if (stage !== TOTAL_STAGES + 1 || allVehicles.length === 0) return []
    return allVehicles
      .map(v => scoreVehicle(v, answers, stateRebate, stateCode, annualMileage, chargingMixPercent, incentivesMap, rateOverrides, eaOffersMap, leaseCalcMap))
      .filter(Boolean)
      .sort((a, b) => {
        const d = b.score - a.score
        // For near-ties, the higher expert rating wins.
        if (Math.abs(d) > 0.005) return d
        return (b.expertRating ?? 0) - (a.expertRating ?? 0)
      })
  }, [stage, allVehicles, answers, stateRebate, stateCode, annualMileage, chargingMixPercent, incentivesMap, eaOffersMap, leaseCalcMap,
      electricityRateCentsPerKwh, dcfcRateCentsPerKwh, publicL2RateCentsPerKwh])

  const stageProps = { answers, setAnswer, onNext: goNext, onBack: goBack }
  const isResults = stage === TOTAL_STAGES + 1
  // Map each question stage to a pose/mode of the low-poly car scene.
  const sceneMode = isResults ? 'results' : (['use', 'budget', 'daily', 'charge', 'priority'][stage - 1] || 'budget')

  return (
    <>
      <Helmet>
        <title>EV Matcher — Find Your Perfect Electric Vehicle | EVsense</title>
        <meta
          name="description"
          content="Answer 5 quick questions and get matched with the best EV for your lifestyle, budget, and driving habits. Includes incentive estimates and real cost analysis."
        />
      </Helmet>

      <div className={`mx-auto px-4 sm:px-6 py-10 ${isResults ? 'max-w-3xl' : 'max-w-6xl'}`}>
        {isResults ? (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key="results" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18, ease: 'easeOut' }}>
              {loading
                ? <div className="text-center py-16"><div className="text-ink-muted text-sm">Matching vehicles…</div></div>
                : <Results matches={matches} answers={answers} onRestart={restart} refinements={refinements} setRefinements={setRefinements} />}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            {/* Left — low-poly 3D car scene that re-poses per question */}
            <div className="relative rounded-[26px] overflow-hidden min-h-[520px] hidden lg:block">
              <div className="absolute -top-12 -left-10 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(47,91,255,.16), transparent 70%)' }} />
              <div className="absolute -bottom-14 -right-8 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(207,244,74,.20), transparent 70%)' }} />
              <ev-car-scene mode={sceneMode} step={String(stage)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              <p className="absolute bottom-3 left-0 right-0 text-center text-[11px] italic text-ink-subtle/70 pointer-events-none select-none px-6">
                sorry for the cheap animation — couldn&apos;t afford real assets
              </p>
            </div>

            {/* Right — progress + question */}
            <div className="flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-ink-subtle mb-3">Step {stage} of {TOTAL_STAGES}</span>
              <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden mb-8">
                <div className="h-full rounded-full bg-brand-blue transition-all duration-300" style={{ width: `${(stage / TOTAL_STAGES) * 100}%` }} />
              </div>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div key={stage} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.18, ease: 'easeOut' }}>
                  {stage === 1 && <Stage1 {...stageProps} />}
                  {stage === 2 && <Stage2 {...stageProps} stateCode={stateCode} stateRebate={stateRebate} />}
                  {stage === 3 && <Stage3 {...stageProps} />}
                  {stage === 4 && <Stage4 {...stageProps} />}
                  {stage === 5 && <Stage5 {...stageProps} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
