/**
 * vehicleFilters.js, Static option definitions for all filter dimensions.
 * These drive the FilterSidebar checkboxes and select menus.
 */

export const SORT_OPTIONS = [
  { value: 'msrp_asc',    label: 'Price: Low to High' },
  { value: 'msrp_desc',   label: 'Price: High to Low' },
  { value: 'range_desc',  label: 'Range: Most First' },
  { value: 'lease_asc',   label: 'Lease: Low to High' },
  { value: 'payment_asc', label: 'Finance: Low to High' },
  { value: 'speed_asc',   label: '0–60: Fastest First' },
]

export const CONDITION_OPTIONS = [
  { value: 'new',          label: 'New' },
  { value: 'used',         label: 'Used' },
  { value: 'coming_soon',  label: 'Coming Soon' },
]

export const DRIVETRAIN_OPTIONS = [
  { value: 'RWD', label: 'RWD, Rear-Wheel Drive' },
  { value: 'AWD', label: 'AWD, All-Wheel Drive' },
  { value: 'FWD', label: 'FWD, Front-Wheel Drive' },
]

export const BODY_STYLE_OPTIONS = [
  { value: 'sedan',     label: 'Sedan' },
  { value: 'suv',       label: 'SUV / Crossover' },
  { value: 'truck',     label: 'Pickup Truck' },
  { value: 'van',       label: 'Van / Minivan' },
  { value: 'hatchback', label: 'Hatchback' },
]

export const SEATING_OPTIONS = [
  { value: '2',  label: '2 seats' },
  { value: '5',  label: '5 seats' },
  { value: '6',  label: '6 seats' },
  { value: '7+', label: '7+ seats' },
]

export const CHARGING_PORT_OPTIONS = [
  { value: 'NACS', label: 'NACS (Tesla standard)' },
  { value: 'CCS',  label: 'CCS (Combined Charging)' },
]

export const PRICE_RANGE_DEFAULT   = [20000, 150000]
export const PRICE_RANGE_MIN       = 20000
export const PRICE_RANGE_MAX       = 150000
export const PRICE_RANGE_STEP      = 5000

export const RANGE_MIN             = 0
export const RANGE_MAX             = 550
export const RANGE_STEP            = 25

export const TOWING_MAX            = 20000
export const TOWING_STEP           = 1000

export const HORSEPOWER_MAX        = 1000
export const HORSEPOWER_STEP       = 50
