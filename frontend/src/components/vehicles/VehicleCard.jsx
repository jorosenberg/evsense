import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { formatCurrency, daysUntil, isDataStale } from '../../utils/formatCurrency'
import { STATE_ELECTRICITY_RATES } from '../../utils/stateElectricityRates'
import { getSafetyRating } from '../../utils/safetyRatings'
import { useIncentives } from '../../utils/incentivesByVehicle'
import { useEAOffers, eaOfferFor } from '../../utils/electrifyAmerica'
import { useLeaseCalc } from '../../utils/leaseCalcData'
import { resolveCardEconomics } from '../../utils/cardTco'
import LeaseCalcEstimate from '../ui/LeaseCalcEstimate'
import { getLuxuryScore, getLuxuryTier } from '../../utils/luxuryScore'

// ─── Deal quality score ──────────────────────────────────────────────────────
// Adapts Recharged's "Good Deal / Great Deal" concept to new EV context.
// Considers: federal credit eligibility, lease value (1% rule), price drop recency.
function getDealScore(vehicle) {
  let points = 0
  if (vehicle.federalCreditEligible) points += 2
  if (vehicle.leaseFrom && vehicle.msrpFrom) {
    const pct = (vehicle.leaseFrom / vehicle.msrpFrom) * 100
    if (pct <= 1.0) points += 3
    else if (pct <= 1.2) points += 1
  }
  if (vehicle.offerExpiresAt && daysUntil(vehicle.offerExpiresAt) > 0) points += 1

  if (points >= 5) return { label: 'Exceptional Value', color: 'text-status-green bg-status-green-bg' }
  if (points >= 3) return { label: 'Great Deal', color: 'text-status-green bg-status-green-bg' }
  if (points >= 2) return { label: 'Good Value', color: 'text-brand-blue bg-brand-blue-light' }
  return null
}

// ─── Efficiency rating (analogous to Recharged's battery health rating) ──────
function getEfficiencyRating(milesPerKwh) {
  if (!milesPerKwh) return null
  if (milesPerKwh >= 4.5) return { label: 'Efficiency: Excellent', color: 'text-status-green bg-status-green-bg' }
  if (milesPerKwh >= 3.8) return { label: 'Efficiency: Good', color: 'text-brand-blue bg-brand-blue-light' }
  if (milesPerKwh >= 3.0) return { label: 'Efficiency: Average', color: 'text-ink-muted bg-surface-sunken' }
  return { label: 'Efficiency: Below Avg', color: 'text-ink-muted bg-surface-sunken' }
}

// ─── Image carousel ───────────────────────────────────────────────────────────
/**
 * Render a single image. If the vehicle has `imagesCdnBase`, generate an
 * optimized srcSet pointing at /400w.webp /800w.webp /1200w.webp. Otherwise
 * fall back to the raw URL (Wikipedia, manufacturer, etc).
 *
 * The cdnBase is only meaningful for the primary image, gallery images
 * remain as raw URLs for now.
 */
function CardImage({ url, cdnBase, isPrimary, alt }) {
  if (cdnBase && isPrimary) {
    return (
      <img
        src={`${cdnBase}/800w.webp`}
        srcSet={`${cdnBase}/400w.webp 400w, ${cdnBase}/800w.webp 800w, ${cdnBase}/1200w.webp 1200w`}
        sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
        alt={alt}
        className="w-full h-full object-cover transition-opacity duration-200"
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <img
      src={url}
      alt={alt}
      className="w-full h-full object-cover transition-opacity duration-200"
      loading="lazy"
      decoding="async"
    />
  )
}

function CardImageCarousel({ images, cdnBase, alt }) {
  const [idx, setIdx] = useState(0)
  const all = images.filter(Boolean)
  if (!all.length) {
    return (
      <div className="aspect-[4/3] bg-surface-sunken flex items-center justify-center">
        <span className="text-ink-subtle text-sm">No image</span>
      </div>
    )
  }

  function prev(e) {
    e.preventDefault(); e.stopPropagation()
    setIdx(i => (i - 1 + all.length) % all.length)
  }
  function next(e) {
    e.preventDefault(); e.stopPropagation()
    setIdx(i => (i + 1) % all.length)
  }

  return (
    <div className="relative aspect-[4/3] bg-surface-sunken overflow-hidden group/carousel">
      <CardImage
        url={all[idx]}
        cdnBase={cdnBase}
        isPrimary={idx === 0}
        alt={`${alt}, photo ${idx + 1}`}
      />

      {/* Prev / Next, only visible on hover when >1 image */}
      {all.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity"
            aria-label="Previous image"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover/carousel:opacity-100 transition-opacity"
            aria-label="Next image"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {all.slice(0, 6).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.preventDefault(); e.stopPropagation(); setIdx(i) }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/50'}`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
            {all.length > 6 && <span className="text-white/70 text-[10px] leading-none">+{all.length - 6}</span>}
          </div>

          {/* Photo count badge */}
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {idx + 1}/{all.length}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Coming Soon card ─────────────────────────────────────────────────────────
function ComingSoonCard({ vehicle }) {
  return (
    <div className="card relative overflow-hidden">
      <div className="aspect-[4/3] bg-surface-sunken flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2"></div>
          <span className="text-xs text-ink-subtle">Image not yet available</span>
        </div>
      </div>
      <div className="absolute top-3 left-3">
        <span className="badge badge-grey">Coming {vehicle.expectedReleaseYear}</span>
      </div>
      <div className="p-4">
        <p className="text-xs text-ink-subtle mb-1 uppercase tracking-wider">{vehicle.make}</p>
        <h3 className="font-semibold text-ink text-lg leading-tight">{vehicle.model}</h3>
        {vehicle.rangeEpa && (
          <p className="text-sm text-ink-muted mt-2">Est. {vehicle.rangeEpa} mi range</p>
        )}
        <p className="text-xs text-ink-subtle mt-3">Pricing not yet available</p>
      </div>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────
// ─── All-in monthly charging estimate ────────────────────────────────────────
function calcMonthlyCharging(vehicle, stateCode) {
  const rate = (STATE_ELECTRICITY_RATES[stateCode] || 14) / 100 // $/kWh
  const mpkwh = vehicle.milesPerKwh || 3.5
  return Math.round((12000 / mpkwh) * rate / 12) // 12k mi/yr, monthly
}

export default function VehicleCard({ vehicle }) {
  const {
    compareVehicleIds, addToCompare, removeFromCompare, isInCompare,
    state: stateCode, annualMileage, chargingMixPercent, ownershipYears,
    purchaseMode, incentiveOverride, electricityRateCentsPerKwh,
    dcfcRateCentsPerKwh, publicL2RateCentsPerKwh, chargingSubscriptionMonthlyUsd,
    leaseTermMonths, includeIncentives,
  } = useUserPreferencesStore()
  const eaOffer = eaOfferFor(useEAOffers(), vehicle.id)
  const leaseCalcRec = useLeaseCalc()[vehicle.id] || null
  const inCompare = isInCompare(vehicle.id)
  const compareMaxed = compareVehicleIds.length >= 3 && !inCompare
  const stale = isDataStale(vehicle.lastUpdated)
  const safety = getSafetyRating(vehicle.id)
  const monthlyCharging = calcMonthlyCharging(vehicle, stateCode)

  // NY (ZIP 10005) manufacturer offer for the chosen pay plan. Drives the
  // displayed lease/finance payment and the cash net price so Browse matches
  // the Calculator and Matcher. Falls back to the summary values when absent.
  const incMap = useIncentives()
  // All lease/finance/cash economics resolved in one place (shared with the
  // Browse sort) so the headline matches the lease chip and the cash isn't
  // double-counted on leases.
  const econ = resolveCardEconomics(vehicle, {
    prefs: {
      purchaseMode, leaseTermMonths, includeIncentives, incentiveOverride,
      state: stateCode, annualMileage, chargingMixPercent,
      electricityRateCentsPerKwh, dcfcRateCentsPerKwh, publicL2RateCentsPerKwh,
      chargingSubscriptionMonthlyUsd, ownershipYears,
    },
    incRec: incMap[vehicle.id] || null,
    eaOffer,
    leaseCalcRec,
  })
  const {
    mode, leaseTerm, offer, leaseCash, leaseCashApplied, conditionalCash,
    displayLeaseFrom, displayFinanceFrom, effectivePrice, tco,
  } = econ

  // Luxury rating
  const luxuryScore = getLuxuryScore(vehicle.id)
  const luxuryTier  = getLuxuryTier(luxuryScore)

  if (vehicle.comingSoon) return <ComingSoonCard vehicle={vehicle} />

  const dealScore = getDealScore(vehicle)
  const effRating = getEfficiencyRating(vehicle.milesPerKwh)

  // Price drop, from lastPriceChange if we have it in summary
  const hasPriceDrop = vehicle.lastPriceChange?.direction === 'decrease'
    && (Date.now() - new Date(vehicle.lastPriceChange.date)) < 90 * 24 * 60 * 60 * 1000

  // effectivePrice (after-incentive sticker) comes from resolveCardEconomics.

  // Gallery images, use imageGallery array if available, else just primary
  const images = vehicle.imageUrl
    ? [vehicle.imageUrl, ...(vehicle.imageGallery || [])]
    : vehicle.imageGallery || []

  return (
    <div className={`card flex flex-col overflow-hidden transition-shadow duration-150 hover:shadow-card-hover ${stale ? 'opacity-90' : ''}`}>
      {/* Stale warning */}
      {stale && (
        <div className="bg-status-yellow-bg px-3 py-1 text-xs text-status-yellow flex items-center gap-1">
          Data may be outdated
        </div>
      )}

      {/* Image carousel */}
      <Link to={`/vehicles/${vehicle.id}`} className="block">
        <CardImageCarousel
          images={images}
          cdnBase={vehicle.imagesCdnBase || null}
          alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        />
      </Link>

      {/* Card body */}
      <div className="p-4 flex-1 flex flex-col gap-3">

        {/* Row 1: TCO headline + deal score */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-2xl font-bold text-brand-blue leading-none tabular-nums">
                {formatCurrency(tco.monthlyTco)}
              </div>
              <div className="text-xs text-ink-subtle">/mo all-in</div>
            </div>
            <div
              className="text-[11px] text-ink-subtle mt-0.5"
              title={`Payment ${formatCurrency(tco.payment)} + charging ${formatCurrency(tco.charging)} + insurance ${formatCurrency(tco.insurance)} + maint. ${formatCurrency(tco.maintenance)} + fees ${formatCurrency(tco.fees)}`}
            >
              True monthly cost · {tco.mode}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {dealScore && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dealScore.color}`}>
                {dealScore.label}
              </span>
            )}
            {hasPriceDrop && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-status-green bg-status-green-bg">
                ▼ Price dropped
              </span>
            )}
            {luxuryTier && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${luxuryTier.color}`}
                title={`Luxury score: ${luxuryScore}/10, based on premium features`}
              >
                {luxuryTier.label}
              </span>
            )}
          </div>
        </div>

        {/* Row 1b: MSRP + blended & DCFC cost per mile */}
        <div className="flex items-center justify-between gap-2 -mt-1">
          <div className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">{formatCurrency(vehicle.msrpFrom)}</span>
            <span className="ml-1">MSRP</span>
            {effectivePrice && (
              <span className="ml-1.5 text-status-green">
                ({formatCurrency(effectivePrice)} after incentive)
              </span>
            )}
            {conditionalCash > 0 && (
              <span
                className="ml-1.5 text-ink-subtle cursor-help"
                title="Targeted offers you may additionally qualify for (conquest, military, college grad, captive-lender finance, etc.). Not subtracted from the price since they don't apply to everyone."
              >
                +up to {formatCurrency(conditionalCash)} if eligible
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-muted tabular-nums">
            <span
              title={`Blended ¢/mi across your charging mix · ${tco.efficiency.mi_per_kwh.toFixed(1)} mi/kWh`}
            >
              <span className="font-semibold text-ink">{tco.centsPerMile}¢</span>/mi
            </span>
            <span className="text-border/60 select-none">·</span>
            <span
              title={`DC fast charging only · ${tco.fastRateCentsPerKwh}¢/kWh`}
            >
              <span className="font-semibold text-status-yellow">{tco.fastCentsPerMile}¢</span>
              <span className="text-status-yellow/80">/mi </span>
            </span>
          </div>
        </div>

        {/* Row 2: Year / Make / Model */}
        <div>
          <Link to={`/vehicles/${vehicle.id}`}>
            <h3 className="font-semibold text-ink hover:text-brand-blue transition-colors leading-tight">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h3>
          </Link>
          <p className="text-xs text-ink-subtle mt-0.5 capitalize">{vehicle.bodyStyle} · {vehicle.drivetrains?.join(' / ')}</p>
        </div>

        {/* Row 3: Key specs, Recharged-style stat row */}
        <div className="grid grid-cols-3 gap-2 py-3 border-y border-border">
          {[
            vehicle.testedRange
              ? { label: 'Tested Range', value: `${vehicle.testedRange} mi` }
              : { label: 'Range', value: vehicle.rangeEpa ? `up to ${vehicle.rangeEpa} mi` : '-' },
            { label: 'Charging', value: vehicle.chargingPort || '-' },
            { label: 'Seating', value: vehicle.seatingCapacity ? `${vehicle.seatingCapacity}` : '-' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="font-semibold text-sm text-ink">{value}</div>
              <div className="text-[10px] text-ink-subtle uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Row 4: Efficiency rating + offer expiry */}
        <div className="flex flex-wrap gap-1.5">
          {effRating && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${effRating.color}`}>
              {effRating.label}
            </span>
          )}
          {vehicle.federalCreditEligible && (
            <span className="badge badge-grey text-[11px]" title="This vehicle was previously eligible for the $7,500 IRA federal EV tax credit, which was repealed in 2025.">
              Was $7,500 eligible · Credit repealed
            </span>
          )}
          <OfferExpiryChip offerExpiresAt={vehicle.offerExpiresAt} />
        </div>

        {/* Row 5: Payment options (secondary, TCO is the headline).
            Reflects the NY (ZIP 10005) manufacturer offer when present. */}
        {(displayLeaseFrom || displayFinanceFrom) && (
          <div className="flex gap-3 text-xs text-ink-muted">
            {displayLeaseFrom && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-ink">{formatCurrency(displayLeaseFrom)}</span>
                <span className="text-ink-subtle"> lease</span>
                {mode === 'lease' && (offer?.termMonths || leaseTerm) && !offer?.stale && (
                  <span className="text-brand-blue"> · {offer?.termMonths || leaseTerm}mo</span>
                )}
                {leaseCash > 0 && (
                  leaseCashApplied ? (
                    <span
                      className="inline-flex items-center rounded-full bg-status-green-bg text-status-green border border-status-green/30 px-1.5 py-0.5 text-[10px] font-medium cursor-help"
                      title={`Lease cash: ${formatCurrency(leaseCash)} (NY/ZIP 10005) is applied to the cap cost and reflected in the monthly above.`}
                    >
                      −{formatCurrency(leaseCash)} lease cash applied
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-full bg-status-yellow-bg text-status-yellow border border-status-yellow/30 px-1.5 py-0.5 text-[10px] font-medium cursor-help"
                      title={`Lease cash: ${formatCurrency(leaseCash)} available when leasing (NY/ZIP 10005). Turn on "Include incentives" to fold it into the monthly.`}
                    >
                      +{formatCurrency(leaseCash)} lease cash ⓘ
                    </span>
                  )
                )}
              </div>
            )}
            {displayFinanceFrom && (
              <div>
                <span className="font-medium text-ink">{formatCurrency(displayFinanceFrom)}</span>
                <span className="text-ink-subtle"> finance</span>
                {mode === 'finance' && offer?.apr != null && !offer.stale && (
                  <span className="text-brand-blue"> · {offer.apr}% APR</span>
                )}
              </div>
            )}
            <div className="ml-auto text-ink-subtle">
              {formatCurrency(tco.charging)}/mo charging
            </div>
          </div>
        )}

        {/* Edmunds lease estimate (scraped residual/price, computed payment) */}
        {leaseCalcRec && (
          <div className="flex">
            <LeaseCalcEstimate rec={leaseCalcRec} term={leaseTerm} variant="chip" />
          </div>
        )}

        {/* Electrify America complimentary charging */}
        {eaOffer && (
          <div
            className="inline-flex items-center gap-1 self-start rounded-full bg-status-green-bg border border-status-green/30 text-status-green px-2 py-0.5 text-[11px] font-medium cursor-help"
            title={`${eaOffer.provider}: ${eaOffer.summary}. Enroll via ${eaOffer.enroll}. ${tco.eaSavings ? `≈ ${formatCurrency(tco.eaSavings)}/mo of free DC fast charging is reflected in the charging cost above.` : ''} Terms vary, verify current offer.`}
          >
            Free EA charging{eaOffer.years ? ` · ${eaOffer.years} yr${eaOffer.years > 1 ? 's' : ''}` : ''}
            {tco.eaSavings ? <span className="text-status-green"> (−{formatCurrency(tco.eaSavings)}/mo)</span> : null}
          </div>
        )}

        {/* Safety badges */}
        {safety && (
          <div className="flex flex-wrap gap-1.5">
            {safety.nhtsa?.overall && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-status-green-bg border border-status-green/30 text-status-green font-medium">
                ★ NHTSA {safety.nhtsa.overall}/5
              </span>
            )}
            {safety.iihs?.overall && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                safety.iihs.overall === 'TSP+' ? 'bg-status-green-bg border-status-green/30 text-status-green' : 'bg-brand-blue/15 border-brand-blue/30 text-brand-indigo'
              }`}>
                IIHS {safety.iihs.overall}
              </span>
            )}
          </div>
        )}

        {/* Row 6: CTA buttons */}
        <div className="flex gap-2 mt-auto">
          <Link
            to={`/vehicles/${vehicle.id}`}
            className="btn-primary flex-1 justify-center text-sm py-2.5"
          >
            View Details
          </Link>
          <button
            onClick={() => inCompare ? removeFromCompare(vehicle.id) : addToCompare(vehicle.id)}
            disabled={compareMaxed}
            title={compareMaxed ? 'Max 3 vehicles' : inCompare ? 'Remove from compare' : 'Add to compare'}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              inCompare
                ? 'bg-brand-blue/15 text-brand-indigo border-brand-blue'
                : compareMaxed
                  ? 'bg-surface-sunken text-ink-subtle border-border cursor-not-allowed'
                  : 'bg-surface-raised text-ink-muted border-border hover:border-brand-blue hover:text-brand-indigo'
            }`}
          >
            {inCompare ? '✓' : '⊕'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OfferExpiryChip({ offerExpiresAt }) {
  if (!offerExpiresAt) return null
  const days = daysUntil(offerExpiresAt)
  if (days === null || days < 0) return null
  if (days <= 3) return <span className="badge badge-red text-[11px] animate-pulse">Expires in {days}d</span>
  if (days <= 14) return <span className="badge badge-yellow text-[11px]">{days}d left on offer</span>
  return <span className="badge badge-green text-[11px]">Offer valid</span>
}
