"""
summary_generator.py — Generates vehicles_summary.json from full Firestore vehicle documents.

The summary JSON contains only the fields needed to render the Browse grid,
keeping it small and fast to load. Full vehicle detail is fetched from Firestore
only when a user opens a Vehicle Detail page.
"""

SUMMARY_FIELDS = [
    "id", "make", "model", "year", "type", "category", "bodyStyle",
    "msrpFrom", "rangeEpa", "drivetrains", "federalCreditEligible",
    "federalCreditAmount", "leaseFrom", "financeFrom", "imageUrl",
    "chargingPort", "seatingCapacity", "towingCapacityLbs", "horsepower",
    "zeroToSixty", "milesPerKwh", "comingSoon", "expectedReleaseYear",
    "lastUpdated", "offerExpiresAt",
]


def generate_summary_json(vehicles: list[dict]) -> list[dict]:
    """
    Produce a lean summary list from full Firestore vehicle documents.
    Extracts top-level summary fields and populates derived fields from nested data.
    """
    summaries = []

    for vehicle in vehicles:
        # Skip discontinued vehicles from the browse summary
        if vehicle.get("type") == "discontinued":
            continue

        summary = {}

        # Copy top-level fields
        for field in SUMMARY_FIELDS:
            if field in vehicle:
                summary[field] = vehicle[field]

        # Derive msrpFrom from first trim if not set
        if not summary.get("msrpFrom") and vehicle.get("trims"):
            msrp_values = [t["msrp"] for t in vehicle["trims"] if t.get("msrp")]
            if msrp_values:
                summary["msrpFrom"] = min(msrp_values)

        # Derive rangeEpa from specs if not set
        if not summary.get("rangeEpa") and vehicle.get("specs", {}).get("range"):
            summary["rangeEpa"] = vehicle["specs"]["range"]

        # Derive efficiency from specs
        if not summary.get("milesPerKwh") and vehicle.get("specs", {}).get("milesPerKwh"):
            summary["milesPerKwh"] = vehicle["specs"]["milesPerKwh"]

        # Derive drivetrains from trims if not set
        if not summary.get("drivetrains") and vehicle.get("trims"):
            drivetrains = set()
            for trim in vehicle["trims"]:
                if trim.get("drivetrain"):
                    drivetrains.add(trim["drivetrain"])
            if drivetrains:
                summary["drivetrains"] = sorted(drivetrains)

        # Derive leaseFrom from best lease offer across trims
        if not summary.get("leaseFrom") and vehicle.get("trims"):
            lease_payments = []
            for trim in vehicle["trims"]:
                for offer in trim.get("leaseOffers", []):
                    if offer.get("monthlyPayment"):
                        lease_payments.append(offer["monthlyPayment"])
            if lease_payments:
                summary["leaseFrom"] = min(lease_payments)

        # Derive financeFrom from best finance offer across trims
        if not summary.get("financeFrom") and vehicle.get("trims"):
            finance_payments = []
            for trim in vehicle["trims"]:
                for offer in trim.get("financeOffers", []):
                    # Estimate payment: rough $X/mo per $1k financed at offer APR
                    pass  # Real implementation would calculate actual payment
            # Fallback: use a rough estimate if no explicit financeFrom
            if summary.get("msrpFrom"):
                # Very rough: ~$18/mo per $1k at 6% APR 60mo
                summary["financeFrom"] = round(summary["msrpFrom"] * 0.019)

        # Federal credit info
        ftc = vehicle.get("federalTaxCredit", {})
        if not summary.get("federalCreditEligible"):
            summary["federalCreditEligible"] = ftc.get("eligibleNew", False)
        if not summary.get("federalCreditAmount"):
            summary["federalCreditAmount"] = ftc.get("amount", 0)

        # Offer expiry — use soonest expiry across all trims/offers
        if not summary.get("offerExpiresAt") and vehicle.get("trims"):
            expiries = []
            for trim in vehicle["trims"]:
                for offer_type in ["leaseOffers", "financeOffers"]:
                    for offer in trim.get(offer_type, []):
                        if offer.get("expiresAt"):
                            expiries.append(offer["expiresAt"])
            if expiries:
                summary["offerExpiresAt"] = sorted(expiries)[0]

        summaries.append(summary)

    # Sort by MSRP ascending, coming soon at the end
    summaries.sort(key=lambda v: (v.get("comingSoon", False), v.get("msrpFrom") or 999999))

    return summaries
