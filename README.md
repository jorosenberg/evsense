# EVsense — EV Buyer's Guide

> **Know what your EV will actually cost you.** The most transparent EV cost calculator on the internet — no ads, no dealer relationships, no sponsored placements.

**Live at:** [evsense.jonahrosenberg.work](https://evsense.jonahrosenberg.work)

---

## What It Does

EVsense calculates the **real monthly cost** of owning an electric vehicle, including:

- **Loan or lease payment** — with a LeaseHackr-style lease calculator (standard, one-pay, MSD modes)
- **Charging costs** — home + public L2 + DCFC, at your state's electricity rate
- **Dealer & buying programs** — Costco Auto, Sam's Club, loyalty, conquest, military, first responder, college grad, and more
- **Incentives** — federal tax credit (verified quarterly) + state rebates for all 50 states
- **Depreciation** — projected resale value with a year-by-year curve
- **Maintenance** — sourced from RepairPal
- **Insurance** — low/average/high estimates
- **State fees** — registration, title, EV surcharge, and annual EV road use fees

---

## Architecture

EVsense is a **static React SPA backed by static JSON** — no live application server in the request path.

```
Scraper (Python, local only)
  └─► writes JSON + images into frontend/public/data/
        └─► committed + pushed to main
              └─► GitHub Actions builds + deploys to GitHub Pages
```

The scraper runs locally. Data files are committed to the repo. GitHub Actions only builds and deploys — it never runs the scraper.

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/ev-true-cost-explorer.git
cd ev-true-cost-explorer/frontend
npm install
npm run dev   # http://localhost:5173
```

No environment variables required — the dev server reads the committed `public/data/*.json` files directly.

See [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for the full setup, data pipeline, and deploy instructions.

---

## File Structure

```
ev-true-cost-explorer/
├── frontend/                  # React + Vite app (Tailwind dark theme)
│   ├── src/
│   │   ├── pages/             # Route-level components
│   │   ├── components/        # Reusable UI (calculator, vehicles, filters)
│   │   ├── store/             # Zustand state (prefs, filters, calculator)
│   │   ├── hooks/             # Data fetching hooks
│   │   └── utils/             # Calculators, state data, formatting
│   └── public/data/
│       ├── vehicles_summary.json      # Browse grid data
│       ├── matcher_vehicles.json      # Matcher pool
│       ├── vehicles/<id>.json         # Per-vehicle detail + trims
│       ├── incentives_by_vehicle.json # NY-localized offers
│       └── ...
├── scraper/                   # Python data pipeline (runs locally)
│   ├── run_local.py           # Local orchestrator
│   ├── scrapers/              # Catalog sources (EPA fueleconomy.gov authoritative)
│   ├── incentives/            # Edmunds deals, lease calculator, federal/state
│   ├── processors/            # Image fetch, matcher/summary generators, overrides
│   └── overrides/             # Manual overrides (images, vehicle data)
├── terraform/                 # Optional AWS infra (S3 + CloudFront)
└── .github/workflows/
    ├── ci.yml                 # Test + build on PR
    └── deploy.yml             # Auto-deploy to GitHub Pages on push to main
```

---

## Deploying

Push to `main` — `deploy.yml` runs tests, builds with Vite, and deploys to GitHub Pages automatically.

Enable GitHub Pages in **Settings → Pages → Source: GitHub Actions** on first setup.

---

## Legal

Pricing data is sourced from public manufacturer websites and the EPA fueleconomy.gov database. This tool is not affiliated with any manufacturer, dealer, or charging network. Always obtain a binding quote from a dealer. Not financial or tax advice.
