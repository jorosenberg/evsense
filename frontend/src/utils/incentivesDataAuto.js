/**
 * incentivesDataAuto.js — auto-generated state incentive snapshot
 * Last refreshed: 2026-05-29
 * Source: NREL AFDC State Laws & Incentives API
 * Do not hand-edit — regenerate via scraper/incentives/nrel_incentives.py
 */

export const STATE_INCENTIVES_AUTO = {
};

export function getAutoStateIncentives(stateAbbr) {
  return STATE_INCENTIVES_AUTO[stateAbbr?.toUpperCase()] || [];
}