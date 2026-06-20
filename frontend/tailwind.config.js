/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Brand ──────────────────────────────────────────────
        brand: {
          blue: '#2F5BFF',
          'blue-hover': '#4D72FF',
          'blue-light': '#19223A',   // dark blue tint (was a light tint)
          indigo: '#6E8BFF',         // lighter blue-violet for serif accents
        },
        accent: {
          lime: '#CFF44A',
          'lime-dark': '#AACC2E',
          purple: '#6B5CFF',
          'purple-soft': '#8C7DFF',
        },
        // ── Ink (text) — light on dark ─────────────────────────
        ink: {
          DEFAULT: '#E7EBF3',
          muted: '#9BA3B2',
          subtle: '#8A909B',
        },
        // ── Borders ────────────────────────────────────────────
        border: {
          DEFAULT: '#262D3D',
          strong: '#38415A',
        },
        // ── Surfaces — dark ────────────────────────────────────
        surface: {
          DEFAULT: '#0B0E16',   // page
          raised: '#161A26',    // card
          sunken: '#11151F',    // inset well
          line: '#1C2233',      // image-disc gradient base
        },
        // ── Status (semantic) ──────────────────────────────────
        status: {
          green: '#00C86E',
          'green-bg': '#0E2A1E',
          yellow: '#F5C24A',
          'yellow-bg': '#2A2410',
          red: '#FF6B6B',
          'red-bg': '#2A1414',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        grotesk: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
      fontSize: {
        'display-xl': ['clamp(58px, 5.6vw, 92px)', { lineHeight: '0.99', letterSpacing: '-0.015em' }],
        'display-lg': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        'display-md': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        micro: ['11px', { lineHeight: '1.3' }],
        nano: ['10px', { lineHeight: '1.3' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4)',
        'card-hover': '0 16px 32px rgba(0,0,0,0.45)',
        'card-active': '0 0 0 2px #2F5BFF',
        lime: '0 12px 30px rgba(170,204,46,0.4)',
        glow: '0 10px 26px rgba(47,91,255,0.26)',
      },
      borderRadius: {
        card: '22px',
        pill: '999px',
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg, #2F5BFF, #6B5CFF)',
        'page-grad': 'linear-gradient(180deg, #0B0E16 0%, #0E121C 45%, #090C13 100%)',
      },
      keyframes: {
        evFloat: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        evBlob: {
          '0%,100%': { borderRadius: '46% 54% 60% 40% / 48% 44% 56% 52%' },
          '50%': { borderRadius: '58% 42% 38% 62% / 55% 55% 45% 45%' },
        },
        evDrift1: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(40px,-30px) scale(1.08)' },
          '66%': { transform: 'translate(-26px,24px) scale(.94)' },
        },
        evDrift2: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(-46px,32px) scale(1.12)' },
        },
        evDrift3: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '40%': { transform: 'translate(30px,28px) scale(.9)' },
          '75%': { transform: 'translate(-30px,-22px) scale(1.06)' },
        },
        evPop: {
          '0%': { opacity: '0', transform: 'scale(.92) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        evExpand: {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        evScreenIn: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '.5' },
        },
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        float: 'evFloat 6s ease-in-out infinite',
        blob: 'evBlob 10s ease-in-out infinite',
        drift1: 'evDrift1 18s ease-in-out infinite',
        drift2: 'evDrift2 22s ease-in-out infinite',
        drift3: 'evDrift3 16s ease-in-out infinite',
        pop: 'evPop .6s both',
        expand: 'evExpand .25s cubic-bezier(.2,.8,.2,1) both',
        'screen-in': 'evScreenIn .4s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
