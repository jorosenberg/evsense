/**
 * BottomNav, mobile-only bottom tab bar
 * Visible on screens < md (768px). Each tab shows an icon + label.
 * Tabs: Browse · Find My EV · Compare · EV 101
 *
 * NOTE: App adds pb-16 on mobile to prevent content being hidden beneath this bar.
 */
import { NavLink } from 'react-router-dom'
import { useUserPreferencesStore } from '../../store/userPreferencesStore'

const tabs = [
  {
    to: '/browse',
    label: 'Browse',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-brand-blue' : 'text-ink-subtle'}`} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    to: '/matcher',
    label: 'Find My EV',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-brand-blue' : 'text-ink-subtle'}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 0 : 1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    to: '/compare',
    label: 'Compare',
    icon: (active) => (
      <svg className={`w-5 h-5 ${active ? 'text-brand-blue' : 'text-ink-subtle'}`} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const { compareVehicleIds } = useUserPreferencesStore()
  const compareCount = compareVehicleIds.length

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A0D14]/90 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-3 h-16">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative ${
                isActive ? 'text-brand-blue' : 'text-ink-subtle hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  {tab.icon(isActive)}
                  {/* Compare count badge */}
                  {tab.to === '/compare' && compareCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-brand-blue text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {compareCount}
                    </span>
                  )}
                </div>
                <span>{tab.label}</span>
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-brand-blue rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
