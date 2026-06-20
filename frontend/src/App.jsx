import { Routes, Route, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import CompareBar from './components/layout/CompareBar'
import BottomNav from './components/layout/BottomNav'
import ErrorBoundary, { SectionErrorBoundary } from './components/ErrorBoundary'
import { useStateDetection } from './hooks/useStateDetection'
import ChargingLocationPopup from './components/calculator/ChargingLocationPopup'

// Code-split every page, each loads as a separate JS chunk
const HomePage             = lazy(() => import('./pages/HomePage'))
const BrowsePage           = lazy(() => import('./pages/BrowsePage'))
const VehicleDetailPage    = lazy(() => import('./pages/VehicleDetailPage'))
const CatalogDetailPage    = lazy(() => import('./pages/CatalogDetailPage'))
const ComparePage          = lazy(() => import('./pages/ComparePage'))
const UsedEvPage           = lazy(() => import('./pages/UsedEvPage'))
const ChargingCostChartPage = lazy(() => import('./pages/ChargingCostChartPage'))
const MatcherPage          = lazy(() => import('./pages/MatcherPage'))
const NotFoundPage         = lazy(() => import('./pages/NotFoundPage'))

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 flex items-center justify-center min-h-[40vh]">
      <div className="text-ink-subtle text-sm animate-pulse">Loading…</div>
    </div>
  )
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

const pageTransition = { duration: 0.2, ease: 'easeOut' }

export default function App() {
  useStateDetection()
  const location = useLocation()

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1 pb-bottom-nav">
          <Suspense fallback={<PageSkeleton />}>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route
                path="/"
                element={
                  <motion.div key="home" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <HomePage />
                  </motion.div>
                }
              />
              <Route
                path="/browse"
                element={
                  <motion.div key="browse" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <BrowsePage />
                  </motion.div>
                }
              />
              <Route
                path="/vehicles/:id"
                element={
                  <motion.div key="detail" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <SectionErrorBoundary label="Vehicle details">
                      <VehicleDetailPage />
                    </SectionErrorBoundary>
                  </motion.div>
                }
              />
              <Route
                path="/catalog/:id"
                element={
                  <motion.div key="catalog" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <SectionErrorBoundary label="Extended catalog">
                      <CatalogDetailPage />
                    </SectionErrorBoundary>
                  </motion.div>
                }
              />
              <Route
                path="/compare"
                element={
                  <motion.div key="compare" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <ComparePage />
                  </motion.div>
                }
              />
              <Route
                path="/used"
                element={
                  <motion.div key="used" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <SectionErrorBoundary label="Used EV calculator">
                      <UsedEvPage />
                    </SectionErrorBoundary>
                  </motion.div>
                }
              />
              <Route
                path="/tools/charging-cost-chart"
                element={
                  <motion.div key="chart" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <ChargingCostChartPage />
                  </motion.div>
                }
              />
              <Route
                path="/matcher"
                element={
                  <motion.div key="matcher" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <MatcherPage />
                  </motion.div>
                }
              />
              <Route
                path="*"
                element={
                  <motion.div key="404" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={pageTransition}>
                    <NotFoundPage />
                  </motion.div>
                }
              />
            </Routes>
          </AnimatePresence>
          </Suspense>
        </main>

        <Footer />
        <CompareBar />
        <BottomNav />
        {/* Location prompt, auto-opens once for new users, modal only (no visible button) */}
        <ChargingLocationPopup hideButton />
      </div>
    </ErrorBoundary>
  )
}
