import { Link, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'

export default function NotFoundPage() {
  const { pathname } = useLocation()

  // Detect if it looks like a vehicle URL to give a better hint
  const isVehicleUrl = pathname.startsWith('/vehicles/')
  const vehicleId = isVehicleUrl ? pathname.split('/vehicles/')[1] : null

  return (
    <>
      <Helmet>
        <title>Page Not Found | EVsense: EV Buyer's Guide</title>
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Big 404 */}
          <div className="font-serif text-[8rem] leading-none text-border select-none mb-4">
            404
          </div>

          <h1 className="font-display text-display-md text-ink mb-3">
            Page <span className="italic text-brand-indigo">not found</span>
          </h1>

          {isVehicleUrl ? (
            <p className="text-ink-muted mb-8 leading-relaxed">
              The vehicle <code className="bg-surface-sunken px-1.5 py-0.5 rounded text-sm font-mono">{vehicleId}</code> doesn't
              exist in our database yet, it may be a coming-soon model or a URL typo.
              Check the browse page for all vehicles we currently track.
            </p>
          ) : (
            <p className="text-ink-muted mb-8 leading-relaxed">
              The page <code className="bg-surface-sunken px-1.5 py-0.5 rounded text-sm font-mono">{pathname}</code> doesn't
              exist. It may have moved, or the URL may be incorrect.
            </p>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/browse" className="btn-primary">
              Browse All EVs
            </Link>
            <Link to="/" className="btn-secondary">
              Go Home
            </Link>
            {isVehicleUrl && (
              <Link to="/compare" className="btn-ghost">
                Compare EVs
              </Link>
            )}
          </div>

          {/* Quick links */}
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs text-ink-subtle mb-4 uppercase tracking-wider font-semibold">
              Popular destinations
            </p>
            <div className="flex flex-wrap gap-2 justify-center text-sm">
              {[
                { to: '/browse', label: 'Browse EVs' },
                { to: '/compare', label: 'Compare EVs' },
                { to: '/matcher', label: 'Find my EV' },
                { to: '/tools/charging-cost-chart', label: 'Charging Cost Chart' },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="px-3 py-1.5 bg-surface-sunken hover:bg-border rounded-full text-ink-muted hover:text-ink transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
