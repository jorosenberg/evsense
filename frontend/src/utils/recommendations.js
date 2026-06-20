/**
 * Recommendations engine.
 *
 * Surfaces 2-5 contextual tips based on the configured vehicle, the user's
 * driving profile, and the calculated TCO. Pure function, no side effects,
 * easy to unit test.
 */

/**
 * @param {Object} ctx
 * @param {Object} ctx.vehicle           Detail vehicle doc (curated) or catalog entry
 * @param {Object} ctx.tco               Result of calculateTCO()
 * @param {Object} ctx.userPrefs
 * @param {boolean} [ctx.isUsed]
 * @param {number} [ctx.batteryCapacityRemainingPct]
 * @returns {Array<{title, body, severity}>}  severity = 'info'|'tip'|'warn'
 */
export function buildRecommendations({ vehicle, tco, userPrefs, isUsed = false, batteryCapacityRemainingPct = null }) {
  const recs = []
  const specs = vehicle.specs || vehicle
  const mix = userPrefs.chargingMixPercent || { home: 80, publicL2: 10, dcFast: 10 }

  // ── Charging mix ────────────────────────────────────────────────────────
  if (mix.dcFast >= 30) {
    recs.push({
      title: 'Heavy DCFC use detected',
      body: `You're charging ${mix.dcFast}% on DC fast chargers. DCFC costs roughly 2–3× home charging and accelerates battery degradation. If you have access to a Level 2 outlet at home or work, dropping DCFC to <15% can save $${Math.round((tco.chargingCosts.annualDcfcCost - tco.chargingCosts.annualDcfcCost * 0.5))}/yr.`,
      severity: 'tip',
    })
  }

  if (!userPrefs.hasHomeCharger && tco.chargingCosts.monthlyTotal > 80) {
    recs.push({
      title: 'Home charging would save you the most',
      body: `Adding a Level 2 home charger (typical install: $400–$1,500 after utility rebates) could cut your monthly charging cost by 50–70%. Most EV owners break even within 2 years.`,
      severity: 'tip',
    })
  }

  // ── Off-peak ────────────────────────────────────────────────────────────
  if (userPrefs.hasHomeCharger && !userPrefs.hasOffPeakRate) {
    recs.push({
      title: 'Ask your utility about a TOU rate',
      body: `Most US utilities offer time-of-use plans that drop overnight rates to 5–12¢/kWh. If yours does, enabling it can shave $20–60/mo off your charging bill, see the Charging tab.`,
      severity: 'tip',
    })
  }

  // ── Lease vs Finance ───────────────────────────────────────────────────
  const leaseOffer = vehicle.trims?.[0]?.leaseOffers?.[0]
  if (leaseOffer?.isSubventioned && tco.mode === 'finance') {
    recs.push({
      title: 'Subsidized lease may beat financing',
      body: `This vehicle has a manufacturer-subvented lease (low money factor). Run the numbers in the Lease tab, for EVs, subvented leases often beat purchasing thanks to the dealer capturing the EV credit and passing it through.`,
      severity: 'tip',
    })
  }

  // ── Efficiency ─────────────────────────────────────────────────────────
  const mpkwh = specs.milesPerKwh || specs.efficiency_mi_per_kwh
  if (mpkwh && mpkwh < 2.8) {
    recs.push({
      title: 'Low efficiency, DCFC trips will cost more',
      body: `This vehicle is ${mpkwh} mi/kWh, below the EV average of ~3.5. On a 200 mi DCFC trip at 45¢/kWh you'll spend roughly $${Math.round((200 / mpkwh) * 0.45)} vs. $${Math.round((200 / 3.5) * 0.45)} for a typical mid-size EV.`,
      severity: 'info',
    })
  }

  // ── Used / degradation ─────────────────────────────────────────────────
  if (isUsed) {
    if (batteryCapacityRemainingPct != null && batteryCapacityRemainingPct < 80) {
      recs.push({
        title: 'Battery may be out of warranty range',
        body: `Estimated remaining capacity is ${batteryCapacityRemainingPct.toFixed(1)}%. Most manufacturers cover replacement only below 70% within the warranty window (typically 8 yr / 100k mi). Confirm warranty status with the seller.`,
        severity: 'warn',
      })
    } else {
      recs.push({
        title: 'Get a battery health report',
        body: `For any used EV purchase, ask the seller for a BMS (battery management system) readout or a Recurrent / Polestar report. Range loss is the single biggest depreciation driver and your best negotiating lever.`,
        severity: 'tip',
      })
    }
    if (!vehicle.federalTaxCredit?.eligibleNew) {
      recs.push({
        title: 'Used EV federal credit may apply',
        body: `A 30% / up to $4,000 federal Used Clean Vehicle Credit is available for qualifying used EVs purchased from a dealer (income caps apply: $75k single / $150k joint, vehicle price ≤ $25k). Verify on irs.gov before counting on it.`,
        severity: 'info',
      })
    }
  }

  // ── Mileage / lease fit ────────────────────────────────────────────────
  if (tco.mode === 'lease' && userPrefs.annualMileage > 15000) {
    recs.push({
      title: 'High mileage, leasing may not be optimal',
      body: `At ${userPrefs.annualMileage.toLocaleString()} mi/yr you'll likely exceed standard 12k/yr lease allowances. Excess-mileage fees (typically 20–30¢/mi) add up fast. Consider financing or negotiating a 15k mi lease.`,
      severity: 'warn',
    })
  }

  // ── Non-US ─────────────────────────────────────────────────────────────
  if (vehicle.sold_in_us === false) {
    recs.push({
      title: 'Vehicle not sold in the US',
      body: `This model is not sold in the United States. Pricing shown is converted from EU listings, actual US import / grey-market pricing varies wildly. Use the custom price field for a realistic estimate.`,
      severity: 'warn',
    })
  }

  // ── Long-haul road tripper ─────────────────────────────────────────────
  const range = specs.range || specs.range_mi
  if (range && range < 220 && userPrefs.annualMileage > 18000) {
    recs.push({
      title: 'Range may not match your usage',
      body: `EPA range is ${range} mi. At ${userPrefs.annualMileage.toLocaleString()} mi/yr including likely road trips, you'll be charging multiple times per long drive. Consider a longer-range trim.`,
      severity: 'warn',
    })
  }

  // Keep it digestible
  return recs.slice(0, 6)
}
