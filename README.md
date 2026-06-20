# EVsense — EV Buyer's Guide

> **Know what your EV will actually cost you.** A transparent electric-vehicle
> cost-of-ownership calculator — no ads, no dealer relationships, no sponsored
> placements.

**Live at:** [evsense.jonahrosenberg.work](https://evsense.jonahrosenberg.work)

EVsense looks past the sticker price and estimates the *real* monthly cost of
owning an EV — payment, charging, incentives, depreciation, maintenance,
insurance, and state fees — so you can compare cars on what they actually cost,
not just what they list for.

> Every number in EVsense is a **close estimate** built from **publicly
> available data**, not a quote. It's a personal portfolio project, not a
> financial tool — always get a binding quote from a dealer.

---

## Contents

- [What it does](#what-it-does)
- [Using the app](#using-the-app)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Data pipeline](#data-pipeline)
- [Deploying](#deploying)
- [Tech stack](#tech-stack)
- [Disclaimer](#disclaimer)

---

## What it does

EVsense rolls every line item of EV ownership into one comparable monthly number:

- **Loan or lease payment** — a detailed lease calculator (standard, one-pay, and
  multiple-security-deposit modes) and financing math.
- **Charging costs** — home, public Level 2, and DC fast charging, priced at your
  state's electricity rate.
- **Buyer programs** — membership, loyalty, conquest, and special-buyer offers
  (military, first responder, recent grad, and more).
- **Incentives** — the federal EV tax credit plus state-level rebates.
- **Depreciation** — projected resale value with a year-by-year curve.
- **Maintenance** — estimated service costs over time.
- **Insurance** — low / average / high estimates.
- **State fees** — registration, title, EV surcharges, and annual EV road-use fees.

All of it is assembled from **public data** and presented as estimates.

---

## Using the app

EVsense is built around a few simple flows:

**Browse** — Scroll every tracked EV as a full-width card showing the estimated
monthly cost, range, and price. Hover a card to reveal its trims and specs, and
pick a trim to update the numbers in place. Filters and sort are tucked away by
default so the list stays clean; open them when you want to narrow by price,
range, body style, or brand.

**Find my EV (Matcher)** — Answer a short wizard (how you'll pay, your monthly
budget, daily driving, charging situation, and what you care about most) and
EVsense scores every vehicle against your answers, then ranks the best matches
with a match percentage and a plain-English reason for each pick. Budget tiers
adapt to how you pay — leasing shows lower monthly bands than financing.

**Compare** — Put vehicles side by side to see the full cost breakdown line by
line.

**Vehicle detail** — Each car has a photo gallery, trim-by-trim specs, a price
history chart, and a full cost calculator you can tune to your situation
(mileage, electricity rate, down payment, term, and incentives).

**Charging cost tools** — Estimate what charging will actually add to your bill
based on your state's rates and how you charge.

Throughout the app, clear notices remind you that the figures are estimates from
public data.

---

## How it works

EVsense is a **static web app backed by static data files** — there's no live
server doing calculations behind the scenes.

```
Data pipeline (runs locally)
   gathers public data  ─►  writes JSON + images into the app's data folder
                              │
Frontend (React, built to static files)
   reads those JSON files  ─►  runs the cost model in your browser
                              │
Static host (CDN)
   serves the built app + data to visitors
```

Two ideas make this work:

1. **The math runs in your browser.** When you adjust mileage, rates, or a trim,
   the cost model recomputes instantly client-side — nothing is sent anywhere.
2. **The data is just files.** The catalog, prices, lease terms, incentives, and
   specs are plain JSON shipped with the app. That keeps it fast, cheap to host,
   versioned in git, and easy to audit.

The cost model combines the purchase/lease math, your state's electricity rate
and fees, applicable incentives, and projected depreciation and maintenance into
a single estimated monthly cost — the figure used to rank and compare vehicles.

---

## Getting started

```bash
git clone <your-repo-url> ev-true-cost-explorer
cd ev-true-cost-explorer/frontend
npm install
npm run dev          # http://localhost:5173
```

No environment variables or accounts required — the dev server reads the data
files committed in `frontend/public/data/` directly.

Common scripts (run from `frontend/`):

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build the production app to `frontend/dist` |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run the unit tests |

For the full setup, data pipeline, and deploy details, see
[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md).

---

## Project structure

```
ev-true-cost-explorer/
├── frontend/                 # React + Vite app (Tailwind dark theme)
│   ├── src/
│   │   ├── pages/            # Route-level screens (Browse, Matcher, Detail, …)
│   │   ├── components/       # Reusable UI (calculator, vehicle cards, filters)
│   │   ├── store/            # App state (preferences, filters, calculator)
│   │   ├── hooks/            # Data-loading hooks
│   │   └── utils/            # Cost model, state data, formatting
│   └── public/data/          # All vehicle data the app reads at runtime (JSON + images)
├── scraper/                  # Python data pipeline (runs locally)
├── terraform/                # Optional infrastructure as code for hosting
└── .github/workflows/        # CI, scheduled data refreshes, and deploy
```

---

## Data pipeline

All vehicle data is **gathered from publicly available sources** by a Python
pipeline that runs locally and writes plain JSON + images into the app's data
folder. Nothing proprietary is used, and the results are committed to the repo so
the dataset is transparent and versioned.

The pipeline pulls together:

- an official, publicly available EV catalog (range, efficiency, drivetrain),
- publicly listed prices, trims, and lease terms,
- public incentive and rebate information,
- public resale/depreciation and maintenance references,
- and vehicle photos from public listings.

Because some sites limit automated access, a few steps run through a normal
browser session rather than headless requests. Scheduled jobs can refresh the
data periodically, but the app itself never scrapes at runtime — it only reads
the committed files.

Full pipeline reference: [scraper/LOCAL_PIPELINE.md](./scraper/LOCAL_PIPELINE.md).

---

## Deploying

The app builds to plain static files, so it can be hosted anywhere static
content is served. The repo includes infrastructure as code and automated
workflows to publish the built app and its data to a CDN-backed static host, plus
a fast path to push only refreshed data without a full rebuild.

See [terraform/README.md](./terraform/README.md) and
[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for the deploy steps and a
cost breakdown (it's designed to run at little to no cost).

---

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Zustand (state), Recharts (charts),
  Framer Motion (animation), and a lightweight three.js scene in the matcher.
- **Data pipeline:** Python, with browser-driven steps for sites that limit
  automation.
- **Hosting:** static build behind a CDN; infrastructure managed with Terraform.

---

## Disclaimer

EVsense is an independent personal project. It is **not affiliated with any
manufacturer, dealer, lender, or charging network**, and it does not accept ads
or sponsorships. All figures are **estimates derived from publicly available
data** and will differ from real-world offers. Always obtain a binding quote
from a dealer. This is not financial, tax, or legal advice.
