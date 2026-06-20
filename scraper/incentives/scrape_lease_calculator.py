"""
scrape_lease_calculator.py — drive the Edmunds Car Lease Calculator in YOUR Chrome.

https://www.edmunds.com/calculators/car-lease.html

For each vehicle (make / model, year 2026) it:
  1. selects Make → Model → Year (2026) → and walks the Style dropdown,
  2. clicks the LOWEST Annual Miles option (10,000) and waits for it to apply
     BEFORE reading anything else,
  3. sets Credit Tier = Excellent,
  4. for BOTH 24- and 36-month terms, reads:
       • Cash Incentives
       • Residual value (%)
       • Taxes and Fees
       • Monthly payment (before/after taxes), MSRP, selling price.

Values are read from the calculator's own serialized state (the `sd` object the
page round-trips for "Share Your Deal" — it contains cashIncentives,
residualValue, taxesAndFees, monthlyPayment(WithTaxes), annualMileage, leaseTerm,
selectedCreditTier, selectedVehicle{styleId,style}), with a DOM-field fallback.

Output → frontend/public/data/lease_calc_by_vehicle.json:
  { "vehicles": { "<id>": { "make","model","year",
      "styles": { "<style label>": {
          "styleId": ...,
          "24": { cashIncentives, residualValue, taxesAndFees, monthlyBeforeTaxes,
                  monthlyAfterTaxes, msrp, sellingPrice, annualMiles, creditTier },
          "36": { ... } } } } } }

────────────────────────────────────────────────────────────────────────────
RUN (uses your real Chrome so Edmunds treats it as human):
  # easiest — the script starts Chrome with a dedicated debug profile:
  python scraper/incentives/scrape_lease_calculator.py --start-chrome
  # or attach to a Chrome you launched with --remote-debugging-port=9222:
  python scraper/incentives/scrape_lease_calculator.py
  # try one vehicle first, and dump the form controls if selection fails:
  python scraper/incentives/scrape_lease_calculator.py --start-chrome --vehicle kia-ev6-2025
  python scraper/incentives/scrape_lease_calculator.py --start-chrome --vehicle kia-ev6-2025 --discover
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import edmunds_incentives as E  # noqa: E402  (summary path, slug helpers)
# Reuse the Chrome attach/launch plumbing from the deals saver.
from save_deals_with_browser import _default_chrome_path, _start_chrome  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright is required:  pip install playwright && python -m playwright install chromium")
    raise

CALC_URL = "https://www.edmunds.com/calculators/car-lease.html"
OUT_PATH = E.DATA_DIR / "lease_calc_by_vehicle.json"
TERMS = (24, 36)
TARGET_MILES = 10000          # lowest annual-miles option
CREDIT_TIER = "Excellent"

# Models the lease calculator simply doesn't have — skip quietly. (Year is
# otherwise auto-fallback: prefer 2026, else the latest year the calculator
# offers, so e.g. Lucid Air / Polestar 3 / ID. Buzz are captured at 2025.)
NOT_IN_CALCULATOR = {
    "polestar-polestar-2-2025",     # discontinued
    "ford-f-150-lightning-2025",    # discontinued
    "lucid-gravity-2025",           # not in the calculator yet
    "rivian-r2-2025",               # not in the calculator yet (approx. from R1S/R1T)
}


# ── value parsing ─────────────────────────────────────────────────────────────
def _num(v):
    if v is None:
        return None
    s = re.sub(r"[^0-9.\-]", "", str(v))
    if s in ("", "-", ".", "-."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ── reading the calculator state ──────────────────────────────────────────────
# The page serializes its whole state into a `sd` param (URL) and/or an inline
# JSON blob. We grab whichever is present; both share the same shape.
_RE_SD_BLOB = re.compile(r'\{"salesPrice".*?"zip":"[^"]*"\}')


def _read_state(page) -> dict | None:
    # 1) sd= in the URL (updates when you interact / share)
    u = page.url or ""
    if "sd=" in u:
        raw = urllib.parse.unquote(u.split("sd=", 1)[1].split("&")[0])
        try:
            return json.loads(raw)
        except Exception:
            pass
    # 2) inline JSON blob in the page
    try:
        m = _RE_SD_BLOB.search(page.content())
        if m:
            return json.loads(m.group(0))
    except Exception:
        pass
    return None


# JS that reads the Edmunds lease-calculator fields straight from their named
# inputs. The page has NO serialized `sd` state blob (confirmed via --discover),
# so these named inputs are the single source of truth:
#   input[name=msrp|salesPrice|cashIncentives|residualValue|taxesAndFees]
#   input[name=leaseTerm]    → 4 radios (24/36/39/48); the CHECKED one is current
#   input[name=moneyFactor]  → the numeric MF input PLUS the credit-tier radios
#                              (Poor/Fair/Good/Excellent) share this name, so we
#                              pick the one whose value is numeric
#   "Equivalent to X% APR"   → text readout near the money factor
_READ_DOM_JS = r"""
() => {
  const val = (sel) => { const e = document.querySelector(sel); return e ? e.value : null; };
  const mfEl = [...document.querySelectorAll('input[name="moneyFactor"]')]
    .find(e => e.value && /^-?[0-9]*\.?[0-9]+$/.test(String(e.value).trim()));
  const termEl = [...document.querySelectorAll('input[name="leaseTerm"]')].find(e => e.checked);
  let apr = null;
  for (const el of document.querySelectorAll('span,div,p,small,strong,li')) {
    const m = (el.textContent || '').match(/Equivalent to\s*([0-9.]+)\s*%\s*APR/i);
    if (m) { apr = m[1]; break; }
  }
  return {
    msrp: val('input[name="msrp"]'),
    sellingBefore: val('input[name="salesPrice"]'),
    cashIncentives: val('input[name="cashIncentives"]'),
    residualValue: val('input[name="residualValue"]'),
    taxesAndFees: val('input[name="taxesAndFees"]'),
    moneyFactor: mfEl ? mfEl.value : null,
    apr: apr,
    leaseTerm: termEl ? termEl.value : null,
    monthlyAfter: null,
    monthlyBefore: null,
  };
}
"""


def _read_values(page) -> dict:
    state = _read_state(page) or {}
    dom = {}
    try:
        dom = page.evaluate(_READ_DOM_JS) or {}
    except Exception:
        pass
    # Residual + money factor are read DOM-FIRST: they change per trim/term, and
    # the serialized `sd` state blob has been observed NOT to update on a term
    # switch (it kept returning a stale 62% default → every 24-mo residual
    # collapsed to 62). The DOM field reflects what's actually displayed for the
    # currently-selected trim+term, so it's the trustworthy source here.
    def _dom_first(dom_key, *state_keys):
        d = _num(dom.get(dom_key))
        if d is not None:
            return d
        for sk in state_keys:
            if state.get(sk) is not None:
                return _num(state.get(sk))
        return None

    return {
        "cashIncentives": _num(state.get("cashIncentives")) if state.get("cashIncentives") is not None else _num(dom.get("cashIncentives")),
        "residualValue": _dom_first("residualValue", "residualValue"),
        "taxesAndFees": _num(state.get("taxesAndFees")) if state.get("taxesAndFees") is not None else _num(dom.get("taxesAndFees")),
        "monthlyBeforeTaxes": _num(state.get("monthlyPayment")) if state.get("monthlyPayment") is not None else _num(dom.get("monthlyBefore")),
        "monthlyAfterTaxes": _num(state.get("monthlyPaymentWithTaxes")) if state.get("monthlyPaymentWithTaxes") is not None else _num(dom.get("monthlyAfter")),
        # Money factor for this term — from the displayed field, then the state.
        # Edmunds shows either a money factor or an interest rate (APR); the
        # loader converts APR -> MF (MF = APR% / 2400).
        "moneyFactor": _dom_first("moneyFactor", "moneyFactor", "mf"),
        "apr": _dom_first("apr", "interestRate", "apr"),
        "msrp": _num(state.get("msrp")) if state.get("msrp") is not None else _num(dom.get("msrp")),
        "sellingPrice": _num(state.get("salesPrice")) if state.get("salesPrice") is not None else _num(dom.get("sellingBefore")),
        "annualMiles": _num(state.get("annualMileage")) or TARGET_MILES,
        "leaseTerm": _dom_first("leaseTerm", "leaseTerm"),
        "creditTier": state.get("selectedCreditTier") or CREDIT_TIER,
        "styleId": (state.get("selectedVehicle") or {}).get("styleId"),
        "styleLabel": (state.get("selectedVehicle") or {}).get("style"),
    }


def _apply_term_and_read(page, term, settle, baseline_residual=None, tries=4):
    """Click the lease-term segment, then wait for Edmunds to RECOMPUTE the
    residual for THIS term before reading it.

    The failure this fixes: when the term flips, Edmunds shows a placeholder
    residual (e.g. 62%) for a moment before recomputing the real per-trim/term
    value. The old logic accepted the first "stable" read — which was that
    placeholder — so every 24-month residual collapsed onto 62%. We now wait for
    the residual to MOVE OFF the value seen right after the click (and off the
    OTHER term's `baseline_residual` when provided) and then hold steady. If it
    never moves and equals the other term's residual, we re-click and retry,
    since identical 24/36 residuals are almost always a stale read.
    """
    best = {}
    for _attempt in range(tries):
        _select_radio(page, "leaseTerm", term)
        page.wait_for_timeout(int(settle * 600))
        first = _read_values(page)
        best = first
        r_initial = first.get("residualValue")
        prev = r_initial
        moved = False
        for _ in range(12):
            page.wait_for_timeout(int(settle * 500))
            vals = _read_values(page)
            best = vals
            cur = vals.get("residualValue")
            lt = vals.get("leaseTerm")
            term_ok = (lt is None) or (int(lt) == int(term))
            if cur is not None:
                if r_initial is not None and cur != r_initial:
                    moved = True
                if baseline_residual is not None and cur != baseline_residual:
                    moved = True
            # Accept once the value is holding steady AND the term matches. For
            # the SECOND term (baseline set) also require that it recomputed off
            # the first term's value, so we don't capture a not-yet-updated read.
            if cur is not None and cur == prev and term_ok and (baseline_residual is None or moved):
                return vals
            prev = cur
        # Never moved off the initial read. If it also equals the other term's
        # residual, it's almost certainly the stale placeholder — re-click and
        # try again. Otherwise accept it (it may be the genuine value).
        if baseline_residual is not None and best.get("residualValue") == baseline_residual:
            page.wait_for_timeout(int(settle * 700))
            continue
        return best
    return best  # best effort after retries


# ── selecting controls (resilient: native <select> → custom dropdown → text) ──
def _norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _best_option(opts, target, label):
    """
    Pick the <option> value that best matches `target` (fuzzy). Handles the
    calculator's quirks: model listed without the make word ("2" for "Polestar
    2"), punctuation/spacing differences ("ID. Buzz"), trademark suffixes, etc.
    """
    nt = _norm(target)
    toks_t = set(re.findall(r"[a-z0-9]+", target.lower()))
    # also try the target with its leading word (the make) dropped, for models
    parts = target.split()
    alt = " ".join(parts[1:]) if len(parts) > 1 else ""
    na = _norm(alt)
    best, best_score = None, -1.0
    for val, txt in opts:
        no = _norm(txt)
        if not no or no.startswith("select"):
            continue
        toks_o = set(re.findall(r"[a-z0-9]+", (txt or "").lower()))
        if no == nt:
            score = 100
        elif na and no == na:
            score = 96
        elif nt and (nt in no or no in nt):
            score = 82
        elif na and (na in no or no in na):
            score = 76
        else:
            inter = len(toks_t & toks_o)
            uni = len(toks_t | toks_o) or 1
            score = 55.0 * inter / uni
        if score > best_score:
            best_score, best = score, val
    return best if best_score >= 55 else None


def _choose_dropdown(page, field, candidates_label, value, timeout=6000) -> bool:
    # 1) native <select> — read its options and fuzzy-pick the best match.
    for lbl in candidates_label:
        try:
            loc = page.get_by_label(lbl, exact=False)
            if loc.count() == 0:
                continue
            opts = loc.first.evaluate(
                "el => el.tagName === 'SELECT' ? [...el.options].map(o => [o.value, o.textContent]) : null"
            )
            if opts:
                val = _best_option(opts, value, lbl)
                if val is not None:
                    loc.first.select_option(value=val, timeout=timeout)
                    return True
                # exact-label attempt as a fallback
                try:
                    loc.first.select_option(label=value, timeout=2500)
                    return True
                except Exception:
                    pass
        except Exception:
            pass
    # 2) custom dropdown: click the trigger, then the matching option.
    triggers = candidates_label + [f"Select {field}", field]
    for t in triggers:
        try:
            page.get_by_text(t, exact=False).first.click(timeout=2500)
            page.wait_for_timeout(400)
            page.get_by_role("option", name=value, exact=False).first.click(timeout=2500)
            return True
        except Exception:
            pass
    # 3) last resort: click an option/element that matches the value.
    try:
        page.get_by_role("option", name=value, exact=False).first.click(timeout=2000)
        return True
    except Exception:
        pass
    return False


def _options_count(page, labels) -> int:
    for lbl in labels:
        try:
            loc = page.get_by_label(lbl, exact=False)
            if loc.count() > 0:
                return loc.first.evaluate("el => el.options ? el.options.length : 0") or 0
        except Exception:
            pass
    return 0


def _dismiss_overlays(page) -> None:
    """Close cookie / email-signup / ad modals that can block clicks mid-run."""
    for sel in ('button[aria-label="Close"]', 'button[aria-label="close"]',
                'button:has-text("No thanks")', 'button:has-text("Close")',
                '[data-tracking-id*="close"]'):
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.click(timeout=1000)
        except Exception:
            pass
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass


def _click_segment(page, value_texts, timeout=4000) -> bool:
    """Click a button/segmented control (Annual Miles, Term, Credit Tier)."""
    for v in value_texts:
        for getter in (
            lambda: page.get_by_role("button", name=v, exact=True),
            lambda: page.get_by_role("radio", name=v, exact=True),
            lambda: page.get_by_text(v, exact=True),
        ):
            try:
                loc = getter()
                if loc.count() > 0:
                    loc.first.click(timeout=timeout)
                    return True
            except Exception:
                pass
    return False


def _select_radio(page, name, value, timeout=4000) -> bool:
    """Select an Edmunds option input by its name + value, e.g.
    input[name="leaseTerm"][value="24"], input[name="annualMileage"][value="10000"],
    or the credit-tier radios which share input[name="moneyFactor"] (Poor/Fair/
    Good/Excellent).

    These are styled radios — the real <input> is visually hidden behind a
    <label>. We must fire a REAL click on the VISIBLE LABEL so the calculator's
    React onChange runs and RECOMPUTES the residual / money factor. Merely
    setting input.checked (or dispatching synthetic events) flips the radio but
    does NOT trigger the recompute — which is why 24/36-mo came out identical.
    """
    base = f'input[name="{name}"][value="{value}"]'

    # Build an ordered list of real-click targets: the wrapping label, the
    # label[for=id], then the input itself (forced) as a last resort.
    candidates = [f'label:has({base})']
    try:
        inp = page.locator(base)
        if inp.count() > 0:
            el_id = inp.first.get_attribute("id")
            if el_id:
                candidates.append(f'label[for="{el_id}"]')
    except Exception:
        pass

    for sel in candidates:
        try:
            loc = page.locator(sel)
            if loc.count() > 0:
                loc.first.scroll_into_view_if_needed(timeout=1500)
                try:
                    loc.first.click(timeout=timeout)
                except Exception:
                    loc.first.click(timeout=timeout, force=True)
                return True
        except Exception:
            pass

    # Force-click the input itself (a genuine click event, unlike checked=true).
    try:
        inp = page.locator(base)
        if inp.count() > 0:
            inp.first.click(timeout=timeout, force=True)
            return True
    except Exception:
        pass

    # Fallback to text/role matching.
    return _click_segment(page, [str(value)])


def _style_options(page) -> list[tuple[str, str]]:
    """[(value, label)] for the Style dropdown (native select preferred)."""
    # native select
    for lbl in ("Style", "Select Style"):
        try:
            loc = page.get_by_label(lbl, exact=False)
            if loc.count() > 0:
                raw = loc.first.evaluate(
                    "el => [...el.options].map(o => [o.value, o.textContent])"
                )
                out = [(v, re.sub(r"\s+", " ", (t or "").strip()))
                       for v, t in raw if t and "select" not in (t or "").lower()]
                if out:
                    return out
        except Exception:
            pass
    # custom dropdown: open it and read the listbox options
    try:
        page.get_by_text("Select Style", exact=False).first.click(timeout=3000)
        page.wait_for_timeout(500)
        raw = page.eval_on_selector_all(
            "[role=option]", "els => els.map(e => [e.getAttribute('data-value')||'', e.textContent])"
        )
        page.keyboard.press("Escape")
        return [("", re.sub(r"\s+", " ", (t or "").strip())) for _v, t in (raw or []) if t]
    except Exception:
        return []


def _discover(page) -> None:
    """Dump the page's interactive controls + the residual / money-factor / term
    fields + the serialized deal state, so the residual & MF selectors can be
    pinned down precisely. Run with:
        python scraper/incentives/scrape_lease_calculator.py --start-chrome \
            --vehicle toyota-bz-2026 --discover
    then share the output.
    """
    info = page.evaluate(r"""
    () => {
      const norm = s => (s||'').replace(/\s+/g,' ').trim();
      const selects = [...document.querySelectorAll('select')].map(s => ({
        name: s.name||s.id||'', label: norm((s.closest('div,section')||{}).textContent||'').slice(0,40),
        options: [...s.options].slice(0,12).map(o => norm(o.textContent)),
      }));
      const buttons = [...document.querySelectorAll('button,[role=button],[role=radio],[role=tab]')]
        .map(b => norm(b.textContent)).filter(Boolean).slice(0,60);
      // EVERY visible input with its name/label AND CURRENT VALUE — this is what
      // pins down the residual %, money factor, and term fields.
      const inputs = [...document.querySelectorAll('input:not([type=hidden])')].map(i => ({
        name: i.name||i.id||'', placeholder: i.placeholder||'', value: i.value,
        label: norm((i.closest('label,div,section,fieldset')||{}).textContent||'').slice(0,60),
      })).slice(0,60);
      // Any element whose text mentions the fields we care about, with the
      // nearest value visible in its block.
      const KEYS = ['residual','money factor',' mf ','apr','interest rate','lease term','term'];
      const mentions = [];
      for (const el of document.querySelectorAll('label,span,div,p,td,th,strong,small,h3,h4')) {
        const t = norm(el.textContent).toLowerCase();
        if (t && t.length < 80 && KEYS.some(k => t.includes(k.trim()))) {
          const blk = norm((el.closest('div,section,tr,li')||el).textContent||'').slice(0,90);
          mentions.push(blk);
        }
      }
      return { selects, buttons, inputs, mentions: [...new Set(mentions)].slice(0,40) };
    }
    """)
    print("=== CONTROLS / INPUTS / FIELD MENTIONS ===")
    print(json.dumps(info, indent=2)[:9000])
    # The serialized deal state ("sd") — shows which keys actually carry the
    # residual / money factor / lease term, and whether they update per term.
    state = _read_state(page)
    print("\n=== SERIALIZED DEAL STATE (sd) keys + values ===")
    if isinstance(state, dict):
        print(json.dumps({k: state[k] for k in sorted(state)}, indent=2, default=str)[:6000])
    else:
        print("(no sd state blob found in URL or page)")


# ── per-vehicle drive ─────────────────────────────────────────────────────────
def _wait_options(page, labels, settle, tries=12) -> bool:
    """Wait until a dependent dropdown has actually populated its options."""
    for _ in range(tries):
        page.wait_for_timeout(int(settle * 300))
        if _options_count(page, labels) > 1:
            return True
    return False


def _select_best_year(page, settle):
    """Select the Year dropdown: prefer 2026, else the latest year offered.
    Returns the chosen year (int) or None if no year is available."""
    for lbl in ("Year (new vehicles)", "Year", "Select Year"):
        try:
            loc = page.get_by_label(lbl, exact=False)
            if loc.count() == 0:
                continue
            opts = loc.first.evaluate(
                "el => el.tagName === 'SELECT' ? [...el.options].map(o => [o.value, o.textContent]) : null"
            )
            if not opts:
                continue
            years = sorted({m.group(0) for _v, t in opts
                            for m in [re.search(r"(?:19|20)\d\d", t or "")] if m}, reverse=True)
            if not years:
                continue
            target = "2026" if "2026" in years else years[0]
            val = _best_option(opts, target, lbl)
            try:
                loc.first.select_option(value=val if val is not None else target, timeout=4000)
            except Exception:
                loc.first.select_option(label=target, timeout=4000)
            return int(target)
        except Exception:
            pass
    return None


def _select_vehicle(page, make_name, model_name, settle):
    """Select make → model → year (2026 pref) → wait for styles. Returns the
    year used (int) on success, or None on failure."""
    if not _choose_dropdown(page, "Make", ["Make", "Select Make"], make_name):
        return None
    _wait_options(page, ["Model", "Select Model"], settle)
    if not _choose_dropdown(page, "Model", ["Model", "Select Model"], model_name):
        return None
    _wait_options(page, ["Year (new vehicles)", "Year", "Select Year"], settle)
    year = _select_best_year(page, settle)
    if not year:
        return None
    if not _wait_options(page, ["Style", "Select Style"], settle):
        return None
    return year


def run(vehicles, page, settle, discover=False) -> dict:
    report = {"vehicles": {}, "errors": [], "skipped": []}

    # Load the calculator ONCE. It's a single page — re-navigating for every
    # vehicle hammers Edmunds and makes the dropdowns stop populating after ~15
    # vehicles. We just change Make→Model→Year→Style on the same loaded page.
    try:
        page.goto(CALC_URL, wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(int(settle * 1000))
        _dismiss_overlays(page)
    except Exception as e:
        print(f"nav error loading calculator: {e}")
        return report

    if discover:
        _discover(page)
        return report

    for i, v in enumerate(vehicles, 1):
        vid = v.get("id", "?")
        make_name = v.get("make", "")
        model_name = v.get("model", "")
        print(f"[{i}/{len(vehicles)}] {vid}: {make_name} {model_name}")
        if vid in NOT_IN_CALCULATOR:
            print("   skipped — not in the lease calculator")
            report["skipped"].append(vid)
            continue

        # Select on the SAME page (no reload). One soft retry: dismiss overlays
        # and re-select. Changing Make resets the dependent dropdowns.
        year = _select_vehicle(page, make_name, model_name, settle)
        if not year:
            _dismiss_overlays(page)
            page.wait_for_timeout(int(settle * 1000))
            year = _select_vehicle(page, make_name, model_name, settle)
        if not year:
            print(f"   could not select {make_name}/{model_name} "
                  f"(not offered, or run --discover to inspect)")
            report["errors"].append(f"{vid}:select")
            continue
        if year != 2026:
            print(f"   note: 2026 not offered — using {year}")

        # Read the Style dropdown, then RE-READ until the list stops growing.
        # Edmunds populates styles asynchronously, so a single read can capture
        # only the first few — the root cause of vehicles missing most trims
        # (e.g. Rivian R1S/R1T, Lucid Air). Keep the longest list we see.
        styles = _style_options(page)
        for _ in range(8):
            page.wait_for_timeout(int(settle * 400))
            again = _style_options(page)
            if len(again) > len(styles):
                styles = again
            elif len(styles) > 1:
                break
        if not styles:
            print("   no styles found in the Style dropdown")
            report["errors"].append(f"{vid}:styles")
            continue
        print(f"   {len(styles)} style(s): {', '.join(l for _, l in styles)}")

        veh_out = {"make": make_name, "model": model_name, "year": year, "styles": {}}
        for sval, slabel in styles:
            # pick this style — retry once (with overlay dismissal) before
            # giving up, so a transient click failure doesn't silently drop a
            # trim from the output.
            if not _choose_dropdown(page, "Style", ["Style", "Select Style"], slabel):
                _dismiss_overlays(page)
                page.wait_for_timeout(int(settle * 600))
                if not _choose_dropdown(page, "Style", ["Style", "Select Style"], slabel):
                    print(f"     · skipped style (couldn't select): {slabel}")
                    report["errors"].append(f"{vid}:style:{slabel}")
                    continue
            page.wait_for_timeout(int(settle * 1000))
            # lowest annual miles (input[name=annualMileage][value=10000])
            _select_radio(page, "annualMileage", str(TARGET_MILES))
            page.wait_for_timeout(int(settle * 1000))
            # excellent credit tier — the tier radios share name="moneyFactor"
            _select_radio(page, "moneyFactor", CREDIT_TIER)
            page.wait_for_timeout(int(settle * 1000))

            style_rec = {"styleId": None}
            # Read 36 mo FIRST (Edmunds' default term, so it's the reliable one),
            # then read 24 mo passing the 36-mo residual as a baseline so the
            # reader can tell when the 24-mo value has actually recomputed (rather
            # than accepting the stale placeholder that equals neither term).
            baseline_residual = None
            for term in (36, 24):
                vals = _apply_term_and_read(page, term, settle, baseline_residual=baseline_residual)
                baseline_residual = vals.get("residualValue")
                style_rec["styleId"] = vals.get("styleId") or style_rec["styleId"] or (sval or None)
                style_rec[str(term)] = {
                    "cashIncentives": vals["cashIncentives"],
                    "residualValue": vals["residualValue"],
                    "taxesAndFees": vals["taxesAndFees"],
                    "moneyFactor": vals.get("moneyFactor"),
                    "apr": vals.get("apr"),
                    "monthlyBeforeTaxes": vals["monthlyBeforeTaxes"],
                    "monthlyAfterTaxes": vals["monthlyAfterTaxes"],
                    "msrp": vals["msrp"],
                    "sellingPrice": vals["sellingPrice"],
                    "annualMiles": vals["annualMiles"],
                    "creditTier": vals["creditTier"],
                    "termConfirmed": vals.get("leaseTerm") is not None and int(vals.get("leaseTerm")) == int(term),
                }
                print(f"     {slabel} · {term}mo: cash={vals['cashIncentives']} "
                      f"residual={vals['residualValue']}% taxes/fees={vals['taxesAndFees']} "
                      f"pmt={vals['monthlyAfterTaxes']} term_ok={style_rec[str(term)]['termConfirmed']}")
            # Sanity flag: identical 24/36 residuals almost always mean the term
            # toggle didn't register — surface it so the run can be re-checked.
            r24 = (style_rec.get('24') or {}).get('residualValue')
            r36 = (style_rec.get('36') or {}).get('residualValue')
            if r24 is not None and r24 == r36:
                print(f"     ⚠ identical 24/36 residual ({r24}%) for {slabel} — term may not have applied")
                report["errors"].append(f"{vid}:residual-tie:{slabel}")
            veh_out["styles"][slabel] = style_rec
        report["vehicles"][vid] = veh_out

    return report


def _merge_and_write(report):
    existing = {"vehicles": {}}
    if OUT_PATH.exists():
        try:
            existing = json.loads(OUT_PATH.read_text("utf-8"))
            existing.setdefault("vehicles", {})
        except Exception:
            existing = {"vehicles": {}}
    existing["vehicles"].update(report["vehicles"])
    existing["lastUpdated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    existing["source"] = "edmunds-lease-calculator"
    existing["note"] = ("Edmunds lease calculator values: lowest annual miles (10k), "
                        "Excellent credit, 24 & 36-month terms.")
    OUT_PATH.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    print(f"\nWrote {len(report['vehicles'])} vehicle(s) → {OUT_PATH}")


def _load_vehicles(vehicle_filter, limit):
    if not E.SUMMARY_IN.exists():
        print(f"Missing {E.SUMMARY_IN}"); return []
    vs = json.loads(E.SUMMARY_IN.read_text("utf-8"))
    if vehicle_filter:
        vs = [v for v in vs if v.get("id") == vehicle_filter]
    if limit:
        vs = vs[:limit]
    return vs


def main():
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="Scrape the Edmunds lease calculator using your own Chrome")
    ap.add_argument("--cdp-url", default="http://localhost:9222")
    ap.add_argument("--start-chrome", action="store_true",
                    help="Launch Chrome (at --chrome-path) with remote debugging + a dedicated profile, then attach")
    ap.add_argument("--chrome-path", default=_default_chrome_path())
    ap.add_argument("--debug-port", type=int, default=9222)
    ap.add_argument("--debug-profile", default=str(here / ".chrome-profile"))
    ap.add_argument("--vehicle", default=None, help="Only this vehicle id")
    ap.add_argument("--max", type=int, default=None, help="Cap number of vehicles")
    ap.add_argument("--settle", type=float, default=1.6, help="Seconds to wait after each change")
    ap.add_argument("--discover", action="store_true",
                    help="Dump the page's controls for the first vehicle and exit (selector tuning)")
    args = ap.parse_args()

    vehicles = _load_vehicles(args.vehicle, args.max)
    if not vehicles:
        print("No vehicles to process."); return

    cdp_url = args.cdp_url
    if args.start_chrome:
        proc = _start_chrome(args.chrome_path, args.debug_port, args.debug_profile)
        if not proc:
            return
        cdp_url = f"http://localhost:{args.debug_port}"
        print("Waiting for Chrome to come up …"); time.sleep(4.0)

    with sync_playwright() as pw:
        print(f"Attaching to Chrome at {cdp_url} …")
        browser = None
        for attempt in range(6):
            try:
                browser = pw.chromium.connect_over_cdp(cdp_url); break
            except Exception as e:
                if args.start_chrome and attempt < 5:
                    time.sleep(2.0); continue
                print(f"Could not attach to Chrome at {cdp_url}: {e}\n"
                      f"Start Chrome with:  \"{args.chrome_path}\" --remote-debugging-port={args.debug_port}\n"
                      f"or re-run with --start-chrome.")
                return
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()
        report = run(vehicles, page, args.settle, discover=args.discover)
        try:
            page.close()
        except Exception:
            pass

    if not args.discover:
        _merge_and_write(report)
        if report["errors"]:
            print(f"Issues: {', '.join(report['errors'])}")
        print("Tip: if selection failed, run once with --discover --vehicle <id> and share the output.")


if __name__ == "__main__":
    main()
