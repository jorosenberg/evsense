import { useState } from 'react'
import { formatCurrency } from '../../utils/formatCurrency'

/**
 * VehicleColorSwatches
 *
 * Renders a row of color swatches from trim.availableColors.
 * Shows color name + price premium on hover/focus.
 * Clicking a swatch selects it (for future image switching).
 *
 * Props:
 *   colors        {Array}    Array of { name, hexPreview, pricePremium }
 *   onSelect      {Function} Optional: called with selected color object
 *   selectedName  {string}   Optional: currently selected color name
 */
export default function VehicleColorSwatches({ colors = [], onSelect, selectedName }) {
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(selectedName || colors[0]?.name)

  if (!colors.length) return null

  function handleSelect(color) {
    setSelected(color.name)
    onSelect?.(color)
  }

  const activeColor = hovered
    ? colors.find(c => c.name === hovered)
    : colors.find(c => c.name === selected)

  return (
    <div>
      {/* Active color label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-ink">
          {activeColor?.name || 'Select color'}
        </span>
        {activeColor?.pricePremium > 0 && (
          <span className="text-xs text-ink-muted">
            +{formatCurrency(activeColor.pricePremium)}
          </span>
        )}
        {activeColor?.pricePremium === 0 && (
          <span className="text-xs text-ink-subtle">Included</span>
        )}
      </div>

      {/* Swatch row */}
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Available colors">
        {colors.map(color => {
          const isSelected = selected === color.name
          const isLight = isLightColor(color.hexPreview)

          return (
            <button
              key={color.name}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${color.name}${color.pricePremium > 0 ? ` (+${formatCurrency(color.pricePremium)})` : ''}`}
              onClick={() => handleSelect(color)}
              onMouseEnter={() => setHovered(color.name)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(color.name)}
              onBlur={() => setHovered(null)}
              className={`
                relative w-9 h-9 rounded-full transition-all duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2
                ${isSelected
                  ? 'ring-2 ring-brand-blue ring-offset-2 scale-110'
                  : 'ring-1 ring-border hover:ring-2 hover:ring-ink/30 hover:scale-105'
                }
              `}
              style={{ backgroundColor: color.hexPreview }}
            >
              {/* Check mark for selected */}
              {isSelected && (
                <span
                  className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
                    isLight ? 'text-ink' : 'text-white'
                  }`}
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}

              {/* Price premium dot indicator */}
              {color.pricePremium > 0 && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-blue rounded-full border border-white" />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <p className="text-xs text-ink-subtle mt-2">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 bg-brand-blue rounded-full inline-block" />
          Premium color (additional cost)
        </span>
      </p>
    </div>
  )
}

/**
 * Determines if a hex color is "light" (needs dark text/icon on top).
 */
function isLightColor(hex) {
  if (!hex) return true
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Perceived luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}
