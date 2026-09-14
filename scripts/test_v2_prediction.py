"""
TRINETRA V2 Fresh-Process Prediction Test
==========================================
Sends a POST /api/v1/predict payload matching the frontend fixture
NCRP-26-81942 and prints a structured verification report.

Run from project root:
  python scripts/test_v2_prediction.py
"""
import json
import urllib.request
import urllib.error
import sys

BASE_URL = "http://localhost:8001"

PAYLOAD = {
    "case_id": "NCRP-26-81942",
    "prediction_time": "2025-06-01T10:15:00",
    "sla_minutes": 45.0,
    "complaint": {
        "complaint_id": "NCRP-26-81942",
        "incident_time": "2025-06-01T10:00:00",
        "available_time": "2025-06-01T10:05:00",
        "amount_inr": 480000.0,
        "typology_id": "TYP_INVESTMENT",
    },
    "hops": [
        {
            "hop_id": "HOP_1",
            "event_time": "2025-06-01T10:05:00",
            "available_time": "2025-06-01T10:10:00",
            "amount": 180000.0,
            "destination_account": "ACC_7821",
        },
        {
            "hop_id": "HOP_2",
            "event_time": "2025-06-01T10:11:00",
            "available_time": "2025-06-01T10:14:00",
            "amount": 150000.0,
            "destination_account": "ACC_3294",
        },
    ],
}

ERRORS = []

def check(label, condition, detail=""):
    sym = "PASS" if condition else "FAIL"
    tag = f"[{sym}]"
    print(f"  {tag}  {label}", end="")
    if detail:
        print(f"  →  {detail}", end="")
    print()
    if not condition:
        ERRORS.append(label)


# ── 1. Health check ──────────────────────────────────────────────────────────
print("=" * 60)
print("STEP 1 — Health Check")
print("=" * 60)
try:
    with urllib.request.urlopen(f"{BASE_URL}/health", timeout=5) as r:
        health = json.loads(r.read())
    print("  Response:", json.dumps(health, indent=4))
    check("status == ok", health.get("status") == "ok")
    check("prediction_service contains V2",
          "V2" in health.get("prediction_service", ""),
          health.get("prediction_service"))
except Exception as e:
    print(f"  ERROR: {e}")
    ERRORS.append("Health check failed")
    sys.exit(1)

# ── 2. Prediction call ───────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 2 — POST /api/v1/predict (NCRP-26-81942, 2 hops)")
print("=" * 60)

try:
    data = json.dumps(PAYLOAD).encode()
    req  = urllib.request.Request(
        f"{BASE_URL}/api/v1/predict",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read().decode())
    check("HTTP 200 received", True)
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"  HTTP ERROR {e.code}: {body}")
    ERRORS.append(f"HTTP {e.code}")
    sys.exit(1)
except Exception as e:
    print(f"  CONNECTION ERROR: {e}")
    ERRORS.append("Prediction call failed")
    sys.exit(1)

# ── 3. Top-level schema ──────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 3 — Top-level response schema")
print("=" * 60)
check("case_id present",     "case_id"          in resp, resp.get("case_id"))
check("geographic present",  "geographic"       in resp)
check("timing present",      "timing"           in resp)
check("decision present",    "decision"         in resp)
check("financial_exposure",  "financial_exposure" in resp)
check("system present",      "system"           in resp)

# ── 4. Geographic ────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 4 — Geographic V2 output")
print("=" * 60)
geo = resp.get("geographic", {})
check("predicted_destination_zone",
      bool(geo.get("predicted_destination_zone")),
      geo.get("predicted_destination_zone"))
cs = geo.get("confidence_score")
check("confidence_score is float", isinstance(cs, (int, float)), str(cs))
check("confidence_score > 0", cs and cs > 0, str(cs))
check("model_version contains V2",
      "V2" in str(geo.get("model_version", "")),
      geo.get("model_version"))
rz = geo.get("ranked_zones", [])
check("ranked_zones non-empty", len(rz) > 0, f"{len(rz)} zones")
if rz:
    z0 = rz[0]
    check("ranked_zones[0] has zone_id", "zone_id" in z0, z0.get("zone_id"))
    check("ranked_zones[0] has lat/lng",
          z0.get("lat") not in (None, 0) or z0.get("lng") not in (None, 0),
          f"lat={z0.get('lat')}, lng={z0.get('lng')}")
    prob = z0.get("probability", -1)
    check("ranked_zones[0].probability is 0-1 float",
          0 < prob <= 1.0, f"{prob:.6f}")
    check("ranked_zones[0] has district/zone_name",
          bool(z0.get("district") or z0.get("zone_name")),
          z0.get("district") or z0.get("zone_name"))
    print()
    print("  Top-3 ranked zones:")
    for z in rz[:3]:
        pct = z.get("probability", 0) * 100
        label = z.get("district") or z.get("zone_name") or z.get("zone_id")
        print(f"    #{z.get('rank')}  {z.get('zone_id'):20s}  {label:30s}  {pct:6.2f}%  lat={z.get('lat'):.4f}, lng={z.get('lng'):.4f}")

reg_sigs = geo.get("registry_signals", [])
print(f"\n  Registry signals: {len(reg_sigs)} hops inspected")
for s in reg_sigs:
    print(f"    hop={s.get('hop')}  account={s.get('destination_account')}  in_registry={s.get('in_registry')}  sightings={s.get('historical_sightings')}  reliability={s.get('reliability'):.4f}")

# ── 5. Timing ────────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 5 — Timing V2 output")
print("=" * 60)
tim  = resp.get("timing", {})
dist = tim.get("intervention_distribution", {})
p25 = dist.get("p25_minutes")
p50 = dist.get("p50_minutes")
p75 = dist.get("p75_minutes")
check("p25_minutes present", p25 is not None, str(p25))
check("p50_minutes present", p50 is not None, str(p50))
check("p75_minutes present", p75 is not None, str(p75))
check("p25 < p50 < p75", p25 is not None and p50 is not None and p75 is not None and p25 < p50 < p75,
      f"P25={p25}  P50={p50}  P75={p75}")
sc = dist.get("survival_curve", [])
check("survival_curve non-empty", len(sc) > 0, f"{len(sc)} points")
unc = tim.get("uncertainty", {})
check("uncertainty block present", bool(unc), str(unc.get("method", "")))
check("model_version contains v2",
      "v2" in str(tim.get("model_version", "")).lower(),
      tim.get("model_version"))

# ── 6. Decision ──────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 6 — Decision Engine V1 output")
print("=" * 60)
dec = resp.get("decision", {})
decision_val = dec.get("decision")
check("decision field present", bool(decision_val), decision_val)
check("decision is CRITICAL|REVIEW|MONITOR",
      decision_val in ("CRITICAL", "REVIEW", "MONITOR"), decision_val)
dc = dec.get("decision_confidence")
check("decision_confidence is 0-1 float",
      dc is not None and 0 <= dc <= 1, str(dc))
reasons = dec.get("reasons", [])
check("reasons non-empty list", len(reasons) > 0, f"{len(reasons)} reasons")
print()
print("  Decision:", decision_val)
print("  Confidence:", dc)
print("  Reasons:")
for i, r in enumerate(reasons, 1):
    print(f"    {i}. {r}")
gs = dec.get("geographic_summary", {})
check("geographic_summary present", bool(gs), f"geo_strength={gs.get('geo_strength')}")
ts = dec.get("timing_summary", {})
check("timing_summary present", bool(ts), f"urgency={ts.get('urgency')}, sla_viability={ts.get('sla_viability')}")
hp = ts.get("horizon_probs", {})
check("horizon_probs has 15/30/60min keys", bool(hp), str(hp))

# ── 7. Financial ─────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 7 — Financial Exposure")
print("=" * 60)
fin = resp.get("financial_exposure", {})
check("amount_at_risk_inr > 0",
      fin.get("amount_at_risk_inr", 0) > 0,
      f"Rs {fin.get('amount_at_risk_inr', 0):,.0f}")
check("estimated_exposure_inr present",
      "estimated_exposure_inr" in fin,
      str(fin.get("estimated_exposure_inr")))

# ── 8. System block ──────────────────────────────────────────────────────────
print()
print("=" * 60)
print("STEP 8 — System metadata")
print("=" * 60)
sys_block = resp.get("system", {})
check("dataset_version == v2",
      sys_block.get("dataset_version") == "v2",
      sys_block.get("dataset_version"))
mv = sys_block.get("model_versions", {})
check("model_versions.geographic present", bool(mv.get("geographic")), mv.get("geographic"))
check("model_versions.timing present",    bool(mv.get("timing")),    mv.get("timing"))
check("model_versions.decision present",  bool(mv.get("decision")),  mv.get("decision"))

# ── Summary ──────────────────────────────────────────────────────────────────
print()
print("=" * 60)
if ERRORS:
    print(f"RESULT: {len(ERRORS)} CHECK(S) FAILED:")
    for e in ERRORS:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("RESULT: ALL CHECKS PASSED — V2 PIPELINE OPERATIONAL")
print("=" * 60)
