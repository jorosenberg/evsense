/**
 * Charging network subscription plans
 * Last updated: 2025-01
 * Note: Pricing changes frequently, verify at each network's website before use.
 */
export const CHARGING_SUBSCRIPTIONS = [
  {
    id: 'none',
    name: 'No Subscription',
    monthlyFee: 0,
    l2RatePerKwh: null,
    dcfcRatePerKwh: null,
    notes: 'Pay as you go, rates vary by location',
  },
  {
    id: 'tesla-member',
    name: 'Tesla Supercharger Membership',
    monthlyFee: 12.99,
    l2RatePerKwh: null,
    dcfcRatePerKwh: 0.25,
    payAsYouGoRate: 0.40,
    savings: 'Save ~$0.15/kWh vs. non-member rate',
    url: 'https://www.tesla.com/supercharger',
    networks: ['Tesla Supercharger'],
    notes: 'Non-Tesla vehicles with NACS adapter now eligible. Requires compatible vehicle.',
  },
  {
    id: 'ea-pass-plus',
    name: 'Electrify America Pass+',
    monthlyFee: 4.00,
    l2RatePerKwh: 0.23,
    dcfcRatePerKwh: 0.31,
    payAsYouGoRate: 0.48,
    savings: 'Save ~$0.17/kWh vs. Pass (no subscription)',
    url: 'https://www.electrifyamerica.com/charging-passes',
    networks: ['Electrify America'],
    notes: 'One of the largest non-Tesla DCFC networks. Good highway coverage.',
  },
  {
    id: 'chargepoint-drive',
    name: 'ChargePoint Drive',
    monthlyFee: 4.99,
    l2RatePerKwh: 0.19,
    dcfcRatePerKwh: 0.29,
    url: 'https://www.chargepoint.com',
    networks: ['ChargePoint'],
    notes: 'Large L2 network. Roaming agreements with other networks.',
  },
  {
    id: 'evgo-subscription',
    name: 'EVgo Plus',
    monthlyFee: 7.99,
    l2RatePerKwh: null,
    dcfcRatePerKwh: 0.27,
    url: 'https://www.evgo.com/plan',
    networks: ['EVgo'],
    notes: 'Fast charging focused. Includes free kWh credit monthly.',
  },
  {
    id: 'blink-plus',
    name: 'Blink Plus',
    monthlyFee: 4.99,
    l2RatePerKwh: 0.20,
    dcfcRatePerKwh: 0.35,
    url: 'https://www.blinkcharging.com',
    networks: ['Blink'],
    notes: 'Primarily L2 network. Good residential area coverage.',
  },
]

export function getSubscriptionById(id) {
  return CHARGING_SUBSCRIPTIONS.find((s) => s.id === id) || CHARGING_SUBSCRIPTIONS[0]
}
