/**
 * suggestTrim.js — pick ONE specific trim to recommend for a matched vehicle,
 * driven by the user's top priority. Pure function over the detail-JSON
 * `trims` array (see /data/vehicles/{id}.json), so it's easy to unit-test.
 *
 * Priority → which trim wins:
 *   cost        → lowest MSRP
 *   range       → longest range
 *   performance → most horsepower (range as tiebreak)
 *   storage     → base trim (cargo is the same across trims of one model)
 *   luxury/none → "sweet spot": best range among trims at/below the median price
 *
 * Returns null when there's no usable trim data so callers can hide the chip.
 */

// Some trim names are auto-generated like "RWD · 230 mi" — keep them, just
// collapse whitespace. Real names ("Long Range AWD", "Limited RWD") pass through.
function cleanName(name) {
  return (name || '').replace(/\s+/g, ' ').trim() || 'Base'
}

const rangeOf = t => Number(t?.specs?.range ?? 0)
const hpOf = t => Number(t?.specs?.horsepower ?? 0)
const msrpOf = t => (typeof t?.msrp === 'number' && t.msrp > 0 ? t.msrp : null)

/** Best range among trims priced at or below the median MSRP; sensible default. */
function sweetSpot(trims, withMsrp) {
  if (withMsrp.length) {
    const prices = withMsrp.map(msrpOf).sort((a, b) => a - b)
    const median = prices[Math.floor((prices.length - 1) / 2)]
    const affordable = withMsrp.filter(t => msrpOf(t) <= median)
    return (affordable.length ? affordable : withMsrp)
      .slice()
      .sort((a, b) => rangeOf(b) - rangeOf(a))[0]
  }
  // No prices at all — fall back to the longest-range trim.
  return trims.slice().sort((a, b) => rangeOf(b) - rangeOf(a))[0]
}

export function suggestTrim(detail, { priorities = [], minRange = 0 } = {}) {
  const all = (detail?.trims || []).filter(t => t && (t.specs || msrpOf(t) != null))
  if (!all.length) return null

  // Honor the user's minimum-range floor: only recommend trims that clear it.
  // If none do, fall back to the longest-range trim and flag that it's under.
  const qualifying = minRange > 0 ? all.filter(t => rangeOf(t) >= minRange) : all
  const belowFloor = minRange > 0 && qualifying.length === 0
  const trims = belowFloor
    ? all.slice().sort((a, b) => rangeOf(b) - rangeOf(a))
    : qualifying

  const withMsrp = trims.filter(t => msrpOf(t) != null)
  const top = (priorities || [])[0] || null

  let pick, reason
  switch (top) {
    case 'cost':
      pick = (withMsrp.length ? withMsrp : trims)
        .slice()
        .sort((a, b) => (msrpOf(a) ?? Infinity) - (msrpOf(b) ?? Infinity))[0]
      reason = 'lowest price'
      break
    case 'range':
      pick = trims.slice().sort((a, b) => rangeOf(b) - rangeOf(a))[0]
      reason = rangeOf(pick) ? `longest range — ${rangeOf(pick)} mi` : 'longest range'
      break
    case 'performance':
      pick = trims.slice().sort((a, b) => hpOf(b) - hpOf(a) || rangeOf(b) - rangeOf(a))[0]
      reason = hpOf(pick) ? `most power — ${hpOf(pick)} hp` : 'quickest trim'
      break
    case 'storage':
      // Cargo volume is a model-level figure (doesn't change by trim), so the
      // sensible pick is the most affordable trim that still has the space.
      pick = sweetSpot(trims, withMsrp)
      reason = 'best value — cargo is the same across trims'
      break
    case 'luxury':
      pick = sweetSpot(trims, withMsrp)
      reason = 'well-equipped trim'
      break
    default:
      pick = sweetSpot(trims, withMsrp)
      reason = 'best range for the price'
  }
  if (!pick) return null

  // Surface how the pick relates to the range floor, since that's often the
  // deciding factor (e.g. skip a cheaper base trim that falls short).
  const pickRange = rangeOf(pick)
  if (minRange > 0) {
    if (belowFloor) {
      reason = `longest range (${pickRange} mi) — no trim hits your ${minRange} mi min`
    } else if (top !== 'range') {
      reason = `${reason} · ${pickRange} mi clears your ${minRange} mi min`
    }
  }

  return {
    name: cleanName(pick.name),
    drivetrain: pick.drivetrain || null,
    msrp: msrpOf(pick),
    range: pick.specs?.range ?? null,
    hp: pick.specs?.horsepower ?? null,
    reason,
    meetsMinRange: minRange > 0 ? !belowFloor : null,
  }
}
