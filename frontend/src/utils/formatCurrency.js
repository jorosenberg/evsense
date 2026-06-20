/**
 * Formatting utilities
 */

export function formatCurrency(amount, opts = {}) {
  const { decimals = 0, compact = false } = opts
  if (amount == null || isNaN(amount)) return '—'

  if (compact && Math.abs(amount) >= 1000) {
    const k = amount / 1000
    return `$${k.toFixed(1)}k`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatNumber(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function formatPercent(n, decimals = 1) {
  if (n == null || isNaN(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

export function formatMoneyFactor(mf) {
  if (mf == null) return '—'
  return mf.toFixed(5)
}

/** Format a date string to "Jan 31, 2025" */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Days until a date */
export function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/** Check if a vehicle's lastUpdated is stale (> 60 days) */
export function isDataStale(lastUpdatedStr) {
  if (!lastUpdatedStr) return false
  const age = Date.now() - new Date(lastUpdatedStr).getTime()
  return age > 60 * 24 * 60 * 60 * 1000
}
