import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { useVehicles } from '../../hooks/useVehicles'

export default function CompareBar() {
  const { compareVehicleIds, removeFromCompare } = useUserPreferencesStore()
  const { allVehicles } = useVehicles()
  const location = useLocation()

  // Don't show on compare page itself
  if (location.pathname === '/compare') return null
  if (compareVehicleIds.length === 0) return null

  const selectedVehicles = compareVehicleIds.map(
    (id) => allVehicles.find((v) => v.id === id)
  ).filter(Boolean)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-raised border-t border-border shadow-lg"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xs font-semibold text-ink-subtle uppercase tracking-wider whitespace-nowrap">
              Comparing
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {selectedVehicles.map((v) => (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="flex items-center gap-1.5 bg-surface-sunken border border-border rounded-full px-3 py-1 text-xs"
                >
                  <span className="font-medium text-ink">{v.year} {v.make} {v.model}</span>
                  <button
                    onClick={() => removeFromCompare(v.id)}
                    className="text-ink-subtle hover:text-ink transition-colors ml-0.5"
                    aria-label={`Remove ${v.make} ${v.model} from comparison`}
                  >
                    ✕
                  </button>
                </motion.div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: 3 - selectedVehicles.length }).map((_, i) => (
                <div key={i} className="border border-dashed border-border rounded-full px-3 py-1 text-xs text-ink-subtle">
                  + Add vehicle
                </div>
              ))}
            </div>
          </div>

          <Link
            to="/compare"
            className="btn-primary whitespace-nowrap shrink-0"
          >
            Compare Now →
          </Link>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
