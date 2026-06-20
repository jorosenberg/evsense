import { useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useVehicles } from '../hooks/useVehicles'
import ElectricityCostChart from '../components/widgets/ElectricityCostChart'
import EstimateNotice from '../components/ui/EstimateNotice'

export default function ChargingCostChartPage() {
  const { allVehicles, loading } = useVehicles()
  const [searchParams] = useSearchParams()

  // Support pre-populated vehicle selection via URL params: ?v=id1,id2,id3
  const paramIds = searchParams.get('v')?.split(',').filter(Boolean) || null

  return (
    <>
      <Helmet>
        <title>EV Charging Cost Chart | EVsense: EV Buyer's Guide</title>
        <meta
          name="description"
          content="Compare the cost to drive 1,000 miles in popular electric vehicles at different electricity rates from $0.10 to $0.30/kWh."
        />
      </Helmet>

      <div className="relative overflow-hidden animate-screen-in">
        {/* Ambient blobs */}
        <div className="absolute -top-32 -right-24 w-[460px] h-[460px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(47,91,255,.10), transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-28 w-[420px] h-[420px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(107,92,255,.12), transparent 70%)' }} />

        <div className="relative z-[1] max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-display-md text-ink mb-2">
            Charging cost <span className="italic text-brand-indigo">comparison</span>
          </h1>
          <p className="text-ink-muted leading-relaxed max-w-2xl">
            How much does it cost to drive 1,000 miles in each EV? Select up to 6 vehicles
            and compare across electricity rates from $0.10 to $0.30/kWh. Use the share
            button to copy a link with your current selection.
          </p>
        </div>

        <EstimateNotice className="mb-6" />

        <div className="card p-6">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-8 w-full" />
              <div className="skeleton h-64 w-full" />
            </div>
          ) : (
            <ElectricityCostChart vehicles={allVehicles} selectedIds={paramIds} />
          )}
        </div>

        <div className="mt-6 text-xs text-ink-subtle">
          <strong>Methodology:</strong> Cost = (1,000 ÷ miles per kWh) × electricity rate.
          Uses EPA-rated efficiency figures. Real-world efficiency varies with driving style,
          temperature, and speed. Public charging rates are not included — this chart shows
          home charging cost only for comparability. Figures are close estimates from public data.
        </div>
        </div>
      </div>
    </>
  )
}
