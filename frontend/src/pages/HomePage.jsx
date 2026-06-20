import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useState, useRef, useEffect } from 'react'
import { useVehicles } from '../hooks/useVehicles'
import { vehicleImgSrc } from '../utils/vehicleImage'
import { estimateFinanceMonthly } from '../utils/quickTco'

// Vehicles surfaced in the recommendations dial — each gets a superlative note.
const REC_PICKS = [
  { id: 'hyundai-ioniq-6-2026', tag: 'Best value' },
  { id: 'tesla-model3-2026', tag: 'Best sedan' },
  { id: 'tesla-modely-2026', tag: 'Best SUV' },
  { id: 'kia-ev6-2026', tag: 'Best performance' },
  { id: 'rivian-r1s-2026', tag: 'Best cargo' },
  { id: 'kia-ev9-2026', tag: 'Best 3-row' },
  { id: 'lucid-air-2026', tag: 'Longest range' },
  { id: 'ford-f-150-lightning-2026', tag: 'Best truck' },
  { id: 'chevrolet-equinox-ev-2026', tag: 'Best budget' },
  { id: 'tesla-models-2026', tag: 'Quickest 0–60' },
]

const money = (n) => (n ? `$${Math.round(n).toLocaleString()}` : '—')

function Arrow({ stroke = '#6E8BFF', size = '40%' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path d="M3 8h9M9 4l4 4-4 4" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ActionCard({ to, title, sub, icon, accent }) {
  const lime = accent === 'lime'
  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 px-5 py-4 rounded-[18px] border transition-all duration-200 hover:-translate-x-1.5 ${
        lime
          ? 'bg-accent-lime border-[#bfe53f] shadow-lime'
          : 'bg-transparent border-transparent hover:bg-surface-raised/95 hover:border-border-strong hover:shadow-card-hover'
      }`}
    >
      <div className={`shrink-0 w-12 h-12 rounded-[13px] grid place-items-center ${lime ? 'bg-black/10' : ''}`}
        style={lime ? undefined : { background: icon.bg }}>
        {icon.node}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-grotesk font-semibold text-lg sm:text-xl ${lime ? 'text-[#0C0E14]' : 'text-ink'}`}>{title}</div>
        <div className={`text-sm ${lime ? 'text-[#4f5d1f]' : 'text-ink-subtle'}`}>{sub}</div>
      </div>
      <div className={`shrink-0 w-9 h-9 rounded-full grid place-items-center ${lime ? 'bg-[#0C0E14]' : 'bg-white/[0.06]'}`}>
        <Arrow stroke={lime ? '#CFF44A' : icon.arrow} />
      </div>
    </Link>
  )
}

// Recommendations dial — wide, short, chrome-free cards. The hovered one fans
// forward in 3D and gets a gradient pop; the rest recede and desaturate. The
// superlative note shows on every card; MSRP/range expand on hover.
function RecCard({ vehicle, tag, idx, focusIdx, groupHover, onEnter }) {
  const src = vehicleImgSrc(vehicle, 800)
  const name = `${vehicle.make} ${vehicle.model}`
  const isFocus = idx === focusIdx
  const dist = groupHover ? Math.abs(idx - focusIdx) : 0
  const sign = idx < focusIdx ? -1 : idx > focusIdx ? 1 : 0
  const scale = !groupHover ? 1 : isFocus ? 1.06 : dist === 1 ? 0.84 : 0.74
  const op = !groupHover ? 1 : isFocus ? 1 : dist === 1 ? 0.45 : 0.28
  const gray = !groupHover || isFocus ? 0 : 1
  const rotX = !groupHover ? 0 : isFocus ? 0 : sign * Math.min(dist * 16, 38)
  const tz = !groupHover ? 0 : isFocus ? 70 : -dist * 26
  const monthly = vehicle.msrpFrom ? Math.round(estimateFinanceMonthly(vehicle.msrpFrom)) : null

  return (
    <Link
      to={`/vehicles/${vehicle.id}`}
      onMouseEnter={onEnter}
      // Image + text hug the right by default (dial is right-aligned + card is
      // auto width); on hover the details expand and push image + text left.
      className="flex items-center gap-4 w-full lg:w-auto px-3 py-2.5 rounded-[18px]"
      style={{
        background: isFocus
          ? 'radial-gradient(120% 140% at 100% 50%, rgba(47,91,255,.34), rgba(107,92,255,.18) 55%, transparent 80%)'
          : 'transparent',
        boxShadow: isFocus ? '0 26px 60px rgba(47,91,255,.4)' : 'none',
        transformOrigin: 'right center',
        transform: `perspective(1300px) translateZ(${tz}px) rotateX(${rotX}deg) scale(${scale})`,
        opacity: op,
        filter: `grayscale(${gray})`,
        zIndex: isFocus ? 6 : 1,
        transition: 'transform .46s cubic-bezier(.2,.9,.25,1), opacity .36s ease, filter .36s ease, box-shadow .36s ease, background .36s ease',
      }}
    >
      {/* Photo — fades in saturation + brightness toward the hovered/focused state */}
      <div className="shrink-0 w-[112px] h-12 grid place-items-center overflow-hidden">
        {src
          ? <img src={src} alt={name} loading="lazy"
              className="w-full h-full object-contain transition-[filter] duration-500 ease-out"
              style={{ filter: isFocus
                ? 'saturate(1.08) brightness(1.06) drop-shadow(0 6px 12px rgba(0,0,0,.45))'
                : 'saturate(.8) brightness(.88) drop-shadow(0 6px 12px rgba(0,0,0,.4))' }} />
          : <span className="text-xs text-ink-subtle px-1 text-center">{name}</span>}
      </div>

      {/* Name + superlative tag */}
      <div className="shrink-0 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-grotesk font-semibold text-lg tracking-tight whitespace-nowrap">{name}</span>
          <span className="inline-flex items-center gap-1.5 text-nano font-bold text-brand-indigo bg-brand-blue/15 px-2 py-0.5 rounded-pill whitespace-nowrap">
            <span className="w-1 h-1 rounded-full bg-accent-lime" />{tag}
          </span>
        </div>
        <div className="text-xs text-ink-subtle whitespace-nowrap capitalize">{vehicle.bodyStyle || 'EV'}</div>
      </div>

      {/* Details — slide open on hover (highlighted "from /mo" + MSRP + range + arrow) */}
      <div
        className="flex items-center gap-4 overflow-hidden"
        style={{
          maxWidth: groupHover ? '340px' : '0px',
          opacity: groupHover ? 1 : 0,
          transition: 'max-width .44s cubic-bezier(.2,.85,.25,1), opacity .3s ease',
        }}
      >
        <div className="whitespace-nowrap rounded-lg bg-brand-blue/15 border border-brand-blue/30 px-2.5 py-1">
          <div className="text-nano text-brand-indigo font-bold uppercase tracking-wide">From / mo</div>
          <div className="font-grotesk font-bold text-sm text-brand-indigo">{monthly ? `$${monthly.toLocaleString()}` : '—'}</div>
        </div>
        <div className="whitespace-nowrap">
          <div className="text-nano text-ink-subtle font-bold uppercase tracking-wide">MSRP</div>
          <div className="font-grotesk font-semibold text-sm text-ink-muted">{money(vehicle.msrpFrom)}</div>
        </div>
        <div className="whitespace-nowrap">
          <div className="text-nano text-ink-subtle font-bold uppercase tracking-wide">Range</div>
          <div className="font-grotesk font-semibold text-sm">{vehicle.rangeEpa ? `${vehicle.rangeEpa} mi` : '—'}</div>
        </div>
        <div className="shrink-0 w-9 h-9 rounded-full bg-brand-blue grid place-items-center">
          <Arrow stroke="#fff" size="14" />
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { allVehicles } = useVehicles()
  const [hoverRec, setHoverRec] = useState(null)
  const stageRef = useRef(null)
  const dialRef = useRef(null)

  // Mouse parallax — write normalized offset to CSS vars on the stage so the
  // layers translate via calc() with no React re-renders.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let raf = 0
    const onMove = (e) => {
      const r = stage.getBoundingClientRect()
      const nx = (e.clientX - r.left) / r.width - 0.5
      const ny = (e.clientY - r.top) / r.height - 0.5
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        stage.style.setProperty('--px', nx.toFixed(3))
        stage.style.setProperty('--py', ny.toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf) }
  }, [])

  const recs = REC_PICKS
    .map((p) => ({ ...p, vehicle: allVehicles.find((v) => v.id === p.id) }))
    .filter((r) => r.vehicle)
  const focusIdx = recs.findIndex((r) => r.id === hoverRec)
  const groupHover = focusIdx >= 0
  const evCount = allVehicles.filter((v) => !v.comingSoon).length || 0

  // Hovering a card scrolls the dial so that card centers — so reaching the
  // bottom car scrolls down and pulls the lower picks into view.
  useEffect(() => {
    const el = dialRef.current
    if (!el || focusIdx < 0) return
    const card = el.children[focusIdx]
    if (!card) return
    const target = card.offsetTop - (el.clientHeight - card.offsetHeight) / 2
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [focusIdx])

  const px = (fx, fy = fx) => ({ transform: `translate3d(calc(var(--px,0) * ${fx}px), calc(var(--py,0) * ${fy}px), 0)` })

  return (
    <>
      <Helmet>
        <title>EVsense — Find the EV that actually fits your life</title>
        <meta name="description" content="EVsense shows the real cost of owning an electric vehicle — charging, incentives, depreciation and fees. A portfolio project built from public data." />
      </Helmet>

      <section ref={stageRef} className="relative overflow-hidden min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]" style={{ '--px': 0, '--py': 0 }}>
        {/* Ambient background */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.04) 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }} />
        <div className="absolute top-[-120px] right-[8%] w-[460px] h-[460px] rounded-full animate-drift1 pointer-events-none" style={{ background: 'radial-gradient(circle at 40% 40%, rgba(47,91,255,.16), transparent 70%)' }} />
        <div className="absolute bottom-[-160px] left-[26%] w-[460px] h-[460px] rounded-full animate-drift2 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(207,244,74,.20), transparent 70%)' }} />
        <div className="absolute top-[30%] right-[26%] w-[360px] h-[360px] rounded-full animate-drift3 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(107,92,255,.16), transparent 70%)' }} />

        {/* Blue blob */}
        <div className="hidden lg:block absolute top-1/2 z-[1] pointer-events-none"
          style={{ left: 'clamp(140px, 32vw, 760px)', width: 'clamp(620px, 56vw, 1180px)', height: 'clamp(620px, 56vw, 1180px)', transform: 'translate(-50%, -50%) translate3d(calc(var(--px,0) * -16px), calc(var(--py,0) * -10px), 0)' }}>
          <div className="absolute inset-0 animate-blob"
            style={{ background: 'linear-gradient(145deg, #2F5BFF 0%, #5B7BFF 52%, #6B5CFF 100%)', boxShadow: '0 50px 130px rgba(47,91,255,.4)' }} />
        </div>

        {/* Hero car + floating badges */}
        <div className="hidden lg:block absolute z-[3] pointer-events-none" style={{ bottom: '-8%', left: 'max(-160px, -5vw)', width: 'clamp(760px, 70vw, 1480px)', ...px(20, 12) }}>
          <div className="animate-float relative">
            <img src="/modely.png" alt="Tesla Model Y" className="w-full h-auto block" style={{ filter: 'drop-shadow(0 44px 60px rgba(0,0,0,.6))' }} />
            <div className="absolute" style={{ top: '4%', left: '46%', ...px(30, 18) }}>
              <div className="animate-pop bg-surface-raised border border-border rounded-2xl px-4 py-3 shadow-card-hover" style={{ animationDelay: '.5s' }}>
                <div className="text-nano text-ink-subtle font-bold uppercase tracking-wide mb-0.5">Model Y · cost to own</div>
                <div className="font-grotesk font-bold text-2xl text-ink tracking-tight">$760<span className="text-[13px] text-ink-subtle font-medium">/mo</span></div>
              </div>
            </div>
            <div className="absolute" style={{ top: '40%', left: '12%', ...px(24, 14) }}>
              <div className="animate-pop flex items-center gap-2.5 bg-surface-raised border border-border rounded-pill pl-3 pr-4 py-2.5 shadow-card-hover" style={{ animationDelay: '.7s' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-accent-lime" style={{ boxShadow: '0 0 0 3px rgba(207,244,74,.3)' }} />
                <span className="font-grotesk font-bold text-base text-white">300 mi<span className="text-xs text-ink-muted font-medium"> range</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Widescreen-only filler: "by the numbers" floating stat cluster */}
        <div className="hidden xl:flex flex-col gap-3 absolute z-[4] pointer-events-none" style={{ top: '40%', left: '58%', transform: 'translateY(-50%) translate3d(calc(var(--px,0) * 14px), calc(var(--py,0) * 14px), 0)' }}>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-[6px] h-[6px] rounded-full bg-accent-lime" />
            <span className="text-micro font-bold uppercase tracking-widest text-ink-subtle">By the numbers</span>
          </div>
          {[
            { v: `${evCount}+`, l: 'EVs compared head-to-head', d: '0s' },
            { v: '50', l: 'states — incentives & fees built in', d: '.4s' },
            { v: 'Real $/mo', l: 'true cost to own, not just MSRP', d: '.8s' },
          ].map((s) => (
            <div key={s.l} className="animate-float bg-surface-raised/90 border border-border rounded-2xl px-4 py-3 shadow-card-hover w-[238px]" style={{ animationDelay: s.d }}>
              <div className="font-grotesk font-bold text-xl text-ink leading-none">{s.v}</div>
              <div className="text-xs text-ink-subtle mt-1 leading-snug">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Headline */}
        <div className="relative z-[5] lg:absolute lg:top-[7%] px-6 sm:px-10 pt-10 lg:pt-0 max-w-[600px]" style={px(-8, -5)}>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-surface-raised border border-border text-[12.5px] font-semibold text-brand-indigo mb-5 shadow-card">
            <span className="w-[7px] h-[7px] rounded-full bg-status-green" style={{ boxShadow: '0 0 0 3px rgba(0,200,110,.2)' }} />
            Real ownership costs, not sticker prices
          </div>
          <h1 className="font-display text-white" style={{ fontSize: 'clamp(48px, 5.6vw, 92px)', lineHeight: 0.99, letterSpacing: '-0.015em', textShadow: '0 4px 34px rgba(0,0,0,.55)' }}>
            Find the EV<br />that <span className="italic text-[#C9D6FF]">actually</span><br />fits your{' '}
            <span className="relative whitespace-nowrap italic">
              life
              <span className="absolute left-[-2px] right-[-2px] bottom-1.5 h-4 bg-accent-lime -z-10 rounded" style={{ transform: 'skewX(-9deg)' }} />
            </span>.
          </h1>
        </div>

        {/* Action cards (top-right) */}
        <div className="relative z-[6] lg:absolute lg:top-[clamp(28px,3vw,56px)] lg:right-[clamp(32px,4vw,88px)] mt-8 lg:mt-0 px-6 sm:px-10 lg:px-0 flex flex-col gap-3 lg:gap-[clamp(12px,1vw,20px)] w-full lg:w-[clamp(340px,24vw,560px)]">
          <ActionCard to="/browse" title="Browse" sub="Every EV, side by side"
            icon={{ bg: 'rgba(47,91,255,.18)', arrow: '#6E8BFF', node: (
              <div className="flex flex-col gap-[3px] w-5"><span className="h-[3px] rounded bg-brand-indigo" /><span className="h-[3px] rounded bg-brand-indigo w-[70%]" /><span className="h-[3px] rounded bg-brand-indigo" /></div>
            ) }} />
          <ActionCard to="/compare" title="Compare Cars" sub="Up to 3 head-to-head"
            icon={{ bg: 'rgba(107,92,255,.2)', arrow: '#8C7DFF', node: (
              <div className="flex items-end gap-[3px] pb-3"><span className="w-1.5 h-3 rounded-sm bg-accent-purple-soft" /><span className="w-1.5 h-5 rounded-sm bg-accent-purple-soft" /><span className="w-1.5 h-4 rounded-sm bg-accent-purple-soft" /></div>
            ) }} />
          <ActionCard to="/matcher" title="Find my EV" sub="Answer 5 quick questions" accent="lime"
            icon={{ node: (
              <div className="w-6 h-6 rounded-full border-[2.5px] border-[#0C0E14] relative"><span className="absolute inset-1 rounded-full bg-[#0C0E14]" /></div>
            ) }} />
        </div>

        {/* Recommendations dial (bottom-right) */}
        <div className="relative z-[7] lg:absolute lg:bottom-[clamp(20px,2.4vw,48px)] lg:right-[clamp(24px,3vw,72px)] mt-10 lg:mt-0 px-6 sm:px-10 lg:px-0 pb-10 lg:pb-0 flex flex-col items-stretch lg:items-end gap-3 w-full lg:w-[clamp(720px,48vw,980px)]"
          onMouseLeave={() => setHoverRec(null)}>
          <div className="flex items-center gap-2.5 lg:self-end mr-1.5">
            <span className="text-micro font-bold uppercase tracking-wider text-ink-subtle">Recommendations</span>
            <span className="text-micro text-ink-muted hidden lg:inline">hover to explore · reach the end for more</span>
          </div>
          <div ref={dialRef} className="relative flex flex-col items-stretch lg:items-end gap-2.5 w-full lg:max-h-[372px] lg:overflow-y-auto lg:overflow-x-hidden ev-scroll py-6 pl-12 pr-3" style={{ perspective: '1300px' }}>
            {recs.map((r, i) => (
              <RecCard key={r.id} vehicle={r.vehicle} tag={r.tag} idx={i}
                focusIdx={focusIdx} groupHover={groupHover} onEnter={() => setHoverRec(r.id)} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
