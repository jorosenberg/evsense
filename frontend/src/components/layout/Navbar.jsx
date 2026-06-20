import { Link, NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'
import { STATE_OPTIONS } from '../../utils/stateFeesData'
import { usePWAInstall } from '../../hooks/usePWAInstall'

// The EVsense logo mark, app icon (favicon.png).
function LogoMark({ className = 'w-8 h-8' }) {
  return (
    <img
      src="/favicon.png"
      alt="EVsense"
      className={`${className} rounded-[9px] object-contain shrink-0`}
    />
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(false)
  const { state, setState, stateDetectionMethod, compareVehicleIds } = useUserPreferencesStore()
  const { canInstall, promptInstall } = usePWAInstall()

  const navLinks = [
    { to: '/browse', label: 'Browse' },
    { to: '/compare', label: `Compare${compareVehicleIds.length > 0 ? ` (${compareVehicleIds.length})` : ''}` },
    { to: '/used', label: 'Used EV Cost' },
    { to: '/tools/charging-cost-chart', label: 'Charging Cost' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-[#0A0D14]/85 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 text-ink">
            <LogoMark />
            <span className="font-grotesk font-bold text-lg tracking-tight">EVsense</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-sm rounded-pill transition-colors ${
                    isActive
                      ? 'bg-brand-blue/15 text-brand-indigo font-semibold'
                      : 'text-ink-muted hover:text-ink hover:bg-white/[0.06]'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink
              to="/matcher"
              className="ml-2 inline-flex items-center gap-2 px-4 py-2 rounded-pill bg-accent-lime text-[#0C0E14] font-semibold text-sm shadow-lime hover:-translate-y-px transition-transform"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-brand-blue" />
              Find my EV
            </NavLink>
          </nav>

          {/* State selector + mobile toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-ink-muted">
              <select
                value={state}
                onChange={(e) => setState(e.target.value, 'manual')}
                className="text-sm font-medium text-ink bg-transparent border-none outline-none cursor-pointer hover:text-brand-indigo transition-colors"
                aria-label="Select your state"
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-surface-raised text-ink">{s.label}</option>
                ))}
              </select>
              {stateDetectionMethod === 'ip' && (
                <span className="text-xs text-ink-subtle">(auto)</span>
              )}
            </div>

            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/[0.06] text-ink"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                }
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-surface-raised">
          <nav className="px-4 py-3 flex flex-col gap-1">
            <NavLink
              to="/matcher"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2 text-sm rounded-pill bg-accent-lime text-[#0C0E14] font-semibold inline-flex items-center gap-2 w-fit"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-brand-blue" />
              Find my EV
            </NavLink>
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm rounded-lg ${
                    isActive ? 'bg-brand-blue/15 text-brand-indigo font-semibold' : 'text-ink-muted hover:bg-white/[0.06]'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="mt-2 pt-2 border-t border-border">
              <label className="text-xs text-ink-subtle block mb-1">Your state</label>
              <select
                value={state}
                onChange={(e) => { setState(e.target.value, 'manual'); setMobileOpen(false) }}
                className="input-base"
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-surface-raised">{s.label}</option>
                ))}
              </select>
            </div>
          </nav>
        </div>
      )}

      {/* PWA install prompt banner */}
      {canInstall && !installDismissed && (
        <div className="bg-brand-blue/10 border-b border-brand-blue/20 px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-brand-indigo">
            <LogoMark className="w-5 h-5" />
            <span>Add EVsense to your home screen for quick access</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => { await promptInstall() }}
              className="text-xs font-semibold text-brand-indigo hover:underline"
            >
              Install
            </button>
            <button
              onClick={() => setInstallDismissed(true)}
              className="text-xs text-ink-subtle hover:text-ink"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
