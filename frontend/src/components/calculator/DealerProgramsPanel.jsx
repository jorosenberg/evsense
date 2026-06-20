import { useState } from 'react'
import {
  THIRD_PARTY_PROGRAMS,
  BRAND_PROGRAMS,
  AFFINITY_GROUPS,
  getAvailablePrograms,
  calculateProgramSavings,
} from '../../utils/dealerPrograms'
import { formatCurrency } from '../../utils/formatCurrency'

/**
 * DealerProgramsPanel
 *
 * Lets the user select which dealer discount programs apply to their purchase:
 * - Third-party buying programs (Costco, Sam's Club, TrueCar)
 * - Manufacturer loyalty (current brand owner)
 * - Conquest (switching from competitor)
 * - Affinity groups (military, first responder, college grad, etc.)
 * - Manual override if user already knows their exact discount
 *
 * Props:
 *   make         {string}   Vehicle make (e.g. "Hyundai")
 *   programs     {Object}   Current dealerPrograms state from calculatorStore
 *   onChange     {Function} Called with updated programs object
 *   totalSavings {number}   Pre-computed total from calculateProgramSavings()
 */
export default function DealerProgramsPanel({ make, programs, onChange, totalSavings }) {
  const [expanded, setExpanded] = useState(false)
  const { brandPrograms, thirdParty } = getAvailablePrograms(make)

  const isDirectSale = brandPrograms?.notes && !brandPrograms?.loyalty && !brandPrograms?.conquest
  const hasAffinity = brandPrograms?.affinityPrograms?.length > 0
  const hasCostco = thirdParty.some((p) => p.id === 'costco')
  const hasSams = thirdParty.some((p) => p.id === 'sams-club')

  function set(key, value) {
    onChange({ ...programs, [key]: value })
  }

  function setManual(value) {
    const num = value === '' ? null : Number(value)
    onChange({ ...programs, manualAmount: num })
  }

  // Loyalty / conquest are mutually exclusive for most brands
  function setLoyalty(checked) {
    onChange({ ...programs, loyalty: checked, conquest: checked ? false : programs.conquest })
  }
  function setConquest(checked) {
    onChange({ ...programs, conquest: checked, loyalty: checked ? false : programs.loyalty })
  }

  const hasSavings = totalSavings > 0 || programs.manualAmount != null

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-raised hover:bg-surface-sunken transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-base"></span>
          <div>
            <span className="font-semibold text-sm text-ink">Dealer & Buying Programs</span>
            <span className="text-xs text-ink-subtle block">
              Costco, loyalty, conquest, military, college grad & more
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {hasSavings && (
            <span className="badge badge-green font-semibold">
              −{formatCurrency(programs.manualAmount ?? totalSavings)} est.
            </span>
          )}
          <svg
            className={`w-4 h-4 text-ink-subtle transition-transform ${expanded ? '' : '-rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable body */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-5 border-t border-border">

          {/* Direct-sale brands note */}
          {isDirectSale && (
            <div className="bg-surface-sunken rounded-lg p-3 text-sm text-ink-muted">
              <span className="font-medium text-ink">{make}</span> sells directly — no dealer loyalty,
              conquest, or third-party buying programs apply.{' '}
              {brandPrograms.notes}
            </div>
          )}

          {/* ── Third-party buying programs ─────────────────── */}
          {!isDirectSale && (hasCostco || hasSams) && (
            <section>
              <h4 className="section-label mb-3">Third-Party Buying Programs</h4>
              <div className="space-y-3">

                {/* Costco */}
                {hasCostco && (() => {
                  const costco = thirdParty.find((p) => p.id === 'costco')
                  return (
                    <ProgramRow
                      checked={programs.costco}
                      onChange={(v) => set('costco', v)}
                      title="Costco Auto Program"
                      badge={`~${formatCurrency(costco.typicalSavings.min)}–${formatCurrency(costco.typicalSavings.max)}`}
                      badgeColor="green"
                      url={costco.url}
                    >
                      <p>{costco.description}</p>
                      <p className="mt-1 text-ink-subtle">{costco.eligibility}</p>
                      {costco.notes && <p className="mt-1 text-status-yellow bg-status-yellow-bg rounded px-2 py-1">{costco.notes}</p>}
                    </ProgramRow>
                  )
                })()}

                {/* Sam's Club */}
                {hasSams && (() => {
                  const sams = thirdParty.find((p) => p.id === 'sams-club')
                  return (
                    <ProgramRow
                      checked={programs.samsClub}
                      onChange={(v) => set('samsClub', v)}
                      title="Sam's Club Auto Buying Program"
                      badge={`~${formatCurrency(sams.typicalSavings.min)}–${formatCurrency(sams.typicalSavings.max)}`}
                      badgeColor="green"
                      url={sams.url}
                    >
                      <p>{sams.description}</p>
                      <p className="mt-1 text-ink-subtle">{sams.eligibility}</p>
                    </ProgramRow>
                  )
                })()}

                <p className="text-xs text-ink-subtle bg-surface-sunken rounded p-2">
                  ℹThird-party programs and dealer discounts typically cannot both apply to the same deal.
                  Use whichever gets you the lower out-the-door price — Costco pricing is usually the floor
                  before any additional negotiation.
                </p>
              </div>
            </section>
          )}

          {/* ── Loyalty / Conquest ──────────────────────────── */}
          {!isDirectSale && (brandPrograms?.loyalty || brandPrograms?.conquest) && (
            <section>
              <h4 className="section-label mb-3">Loyalty & Conquest Programs</h4>
              <div className="space-y-3">

                {brandPrograms.loyalty && (
                  <ProgramRow
                    checked={programs.loyalty}
                    onChange={setLoyalty}
                    title={brandPrograms.loyalty.name}
                    badge={`~${formatCurrency(brandPrograms.loyalty.typicalAmount)}`}
                    badgeColor="blue"
                    url={brandPrograms.loyalty.url}
                    disabled={programs.conquest}
                    disabledReason="Cannot combine with Conquest"
                  >
                    <p>{brandPrograms.loyalty.description}</p>
                    {brandPrograms.loyalty.stacksWithConquest === false && (
                      <p className="mt-1 text-ink-subtle">Cannot be combined with Conquest bonus.</p>
                    )}
                  </ProgramRow>
                )}

                {brandPrograms.conquest && (
                  <ProgramRow
                    checked={programs.conquest}
                    onChange={setConquest}
                    title={brandPrograms.conquest.name}
                    badge={`~${formatCurrency(brandPrograms.conquest.typicalAmount)}`}
                    badgeColor="blue"
                    url={brandPrograms.conquest.url}
                    disabled={programs.loyalty}
                    disabledReason="Cannot combine with Loyalty"
                  >
                    <p>{brandPrograms.conquest.description}</p>
                    {brandPrograms.conquest.notes && (
                      <p className="mt-1 text-status-yellow bg-status-yellow-bg rounded px-2 py-1">
                        {brandPrograms.conquest.notes}
                      </p>
                    )}
                  </ProgramRow>
                )}
              </div>
            </section>
          )}

          {/* ── Affinity Programs ───────────────────────────── */}
          {!isDirectSale && hasAffinity && (
            <section>
              <h4 className="section-label mb-3">Affinity Programs</h4>
              <p className="text-xs text-ink-subtle mb-3">
                Select if any of these apply to you. Most brands offer only one affinity bonus per deal.
              </p>
              <div className="space-y-2">
                {/* None option */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name={`affinity-${make}`}
                    checked={!programs.affinityGroup}
                    onChange={() => set('affinityGroup', null)}
                    className="w-4 h-4 text-brand-blue"
                  />
                  <span className="text-sm text-ink-muted">None apply to me</span>
                </label>

                {/* Group options — only show groups that at least one program supports */}
                {AFFINITY_GROUPS.filter((group) =>
                  brandPrograms.affinityPrograms.some((p) => p.groups.includes(group.id))
                ).map((group) => {
                  const matchingProgram = brandPrograms.affinityPrograms.find(
                    (p) => p.groups.includes(group.id)
                  )
                  return (
                    <label key={group.id} className="flex items-center justify-between gap-2.5 cursor-pointer group">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name={`affinity-${make}`}
                          checked={programs.affinityGroup === group.id}
                          onChange={() => set('affinityGroup', group.id)}
                          className="w-4 h-4 text-brand-blue"
                        />
                        <span className="text-sm text-ink-muted group-hover:text-ink transition-colors">
                          {group.label}
                        </span>
                      </div>
                      {matchingProgram && (
                        <span className="badge badge-green shrink-0">
                          ~{formatCurrency(matchingProgram.amount)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Manual override ─────────────────────────────── */}
          <section>
            <h4 className="section-label mb-2">Manual Override</h4>
            <p className="text-xs text-ink-subtle mb-2">
              Know your exact program discount from a dealer quote? Enter it here —
              this overrides all checkbox estimates above.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={programs.manualAmount ?? ''}
                  placeholder="e.g. 1500"
                  onChange={(e) => setManual(e.target.value)}
                  className="input-base pl-7"
                  aria-label="Manual program discount amount"
                />
              </div>
              {programs.manualAmount != null && (
                <button
                  onClick={() => setManual('')}
                  className="text-xs text-ink-subtle hover:text-ink transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </section>

          {/* ── Savings summary ─────────────────────────────── */}
          {(hasSavings || programs.manualAmount != null) && (
            <div className="bg-status-green-bg border border-status-green/20 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-status-green font-semibold uppercase tracking-wider">
                  Estimated Program Savings
                </div>
                <div className="text-xs text-ink-subtle mt-0.5">
                  Applied to selling price before tax and financing
                </div>
              </div>
              <div className="text-xl font-semibold text-status-green">
                −{formatCurrency(programs.manualAmount ?? totalSavings)}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-ink-subtle leading-relaxed">
            Program amounts are estimates based on publicly available manufacturer incentive data.
            Actual savings depend on current regional offers, dealer participation, and eligibility
            verification. Always confirm program details with the dealer before signing.
            Programs can be combined with federal tax credits unless noted otherwise.
          </p>

        </div>
      )}
    </div>
  )
}

// ─── Reusable program row ──────────────────────────────────────────────────
function ProgramRow({ checked, onChange, title, badge, badgeColor = 'green', url, disabled, disabledReason, children }) {
  return (
    <div className={`border rounded-lg p-3 transition-colors ${
      checked ? 'border-brand-blue bg-brand-blue-light/40' : 'border-border'
    } ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className="w-4 h-4 mt-0.5 text-brand-blue rounded border-border shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-ink">{title}</span>
            {badge && (
              <span className={`badge badge-${badgeColor} font-semibold`}>{badge}</span>
            )}
            {disabled && (
              <span className="badge badge-grey">{disabledReason}</span>
            )}
          </div>
          <div className="text-xs text-ink-muted mt-1 space-y-0.5">
            {children}
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-blue hover:underline mt-1 block"
              onClick={(e) => e.stopPropagation()}
            >
              Learn more ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
