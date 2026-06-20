import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * ErrorBoundary
 *
 * Wraps the app to catch any unhandled React render errors.
 * Without this, a single bad Firestore response or malformed vehicle
 * document crashes the entire page to a blank white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * For per-section boundaries (e.g. just around the calculator):
 *   <ErrorBoundary fallback={<p>Calculator unavailable</p>}>
 *     <CostCalculator vehicle={vehicle} />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // In production, log to your error tracking service here:
    // e.g. Sentry.captureException(error, { extra: errorInfo })
    console.error('[EVsense ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Custom fallback if provided (for section-level boundaries)
    if (this.props.fallback) {
      return this.props.fallback
    }

    // Full-page error UI
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-raised px-4">
        <div className="max-w-lg text-center">
          <div className="text-5xl mb-4"></div>
          <h1 className="font-serif text-display-md text-ink mb-3">
            Something went wrong
          </h1>
          <p className="text-ink-muted mb-2 leading-relaxed">
            EVsense encountered an unexpected error. This is usually caused by a
            network hiccup or a temporary data issue — not your fault.
          </p>
          <p className="text-ink-subtle text-sm mb-8">
            Try refreshing the page. If it keeps happening, the vehicle data may
            be temporarily unavailable.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-8">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null })
                window.location.reload()
              }}
              className="btn-primary"
            >
              Reload page
            </button>
            <Link to="/" className="btn-secondary">
              Go home
            </Link>
          </div>

          {/* Error details — only shown in development */}
          {import.meta.env.DEV && this.state.error && (
            <details className="text-left bg-surface-sunken rounded-lg p-4 text-xs font-mono overflow-auto max-h-48">
              <summary className="cursor-pointer text-ink-subtle mb-2 font-sans font-medium">
                Error details (dev only)
              </summary>
              <div className="text-status-red whitespace-pre-wrap">
                {this.state.error.toString()}
              </div>
              {this.state.errorInfo?.componentStack && (
                <div className="text-ink-subtle mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </details>
          )}
        </div>
      </div>
    )
  }
}

/**
 * Lightweight inline error boundary for wrapping individual sections.
 * Shows a subtle fallback instead of the full error page.
 */
export function SectionErrorBoundary({ children, label = 'This section' }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="card p-6 text-center text-sm text-ink-muted border-status-yellow border">
          <span className="text-base"></span>
          <p className="mt-2">{label} couldn't load. Try refreshing the page.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
