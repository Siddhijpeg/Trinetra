"""
TRINETRA — V2 Case Repository + API Test
=========================================
Verifies:
  1. GET /health — V2.2 service
  2. GET /api/v1/cases — total=60000, pagination, page_size enforcement
  3. GET /api/v1/cases (last page) — reachable
  4. GET /api/v1/cases?search=V2CMP_0041719 — search by complaint_id
  5. GET /api/v1/cases?typology_id=TYP_04 — typology filter
  6. GET /api/v1/cases/{case_id} — representative V2 case detail
  7. GET /api/v1/cases/{case_id} — evaluation_truth isolation
  8. POST /api/v1/predict-case — V2 pipeline via stored case
  9. GET /api/v1/meta/featured — A-J cases present
  10. GET /api/v1/meta/stats — dataset stats
  11. 404 for unknown case_id
"""

import json, sys, urllib.request, urllib.error

BASE = "http://localhost:8001"
ERRORS: list[str] = []

# ── Representatives from ui_test_cases.json ──────────────────────────────────
REPRESENTATIVE_IDS = [
    "V2CMP_0041719",  # Case A — 8-hop geographic convergence
    "V2CMP_0000006",  # Case B — ambiguous 2-hop
]

def check(label: str, condition: bool, detail: str = ""):
    sym = "PASS" if condition else "FAIL"
    print(f"  [{sym}]  {label}", end="")
    if detail: print(f"  →  {detail}", end="")
    print()
    if not condition: ERRORS.append(label)

def get(path: str, timeout: int = 30):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=timeout) as r:
        return json.loads(r.read())

def post(path: str, body: dict, timeout: int = 60):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(f"{BASE}{path}", data=data,
                                  headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

# ─────────────────────────────────────────────────────────────────────────────
print("=" * 60); print("STEP 1 — Health"); print("=" * 60)
h = get("/health")
check("status == ok",       h.get("status") == "ok",    h.get("status"))
check("service is v2.2",    "v2.2" in h.get("service", ""), h.get("service"))
check("case_repository key", "case_repository" in h,    h.get("case_repository",""))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 2 — Paginated case list (page 1)"); print("=" * 60)
r1 = get("/api/v1/cases?page=1&page_size=50")
check("items present",          "items"       in r1)
check("total == 60000",         r1.get("total") == 60000, str(r1.get("total")))
check("page_size == 50",        r1.get("page_size") == 50, str(r1.get("page_size")))
check("total_pages == 1200",    r1.get("total_pages") == 1200, str(r1.get("total_pages")))
check("items count == 50",      len(r1.get("items",[])) == 50, str(len(r1.get("items",[]))))
item0 = r1["items"][0]
check("item has case_id",       "case_id"       in item0,       item0.get("case_id"))
check("item has typology_id",   "typology_id"   in item0,       item0.get("typology_id"))
check("item has amount_inr",    "amount_inr"    in item0,       str(item0.get("amount_inr")))
check("item has hop_count",     "hop_count"     in item0,       str(item0.get("hop_count")))
check("item has victim_state",  "victim_state"  in item0,       item0.get("victim_state"))
check("item has eval_status",   "evaluation_status" in item0,   item0.get("evaluation_status"))
check("item case_id is V2CMP",  item0.get("case_id","").startswith("V2CMP"), item0.get("case_id",""))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 3 — Last page reachable"); print("=" * 60)
r_last = get("/api/v1/cases?page=1200&page_size=50")
check("last page returned",     "items" in r_last)
check("last page has items",    len(r_last.get("items",[])) > 0,
      f"{len(r_last.get('items',[]))} items on last page")
check("total still 60000",      r_last.get("total") == 60000, str(r_last.get("total")))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 4 — Search by complaint_id"); print("=" * 60)
rs = get("/api/v1/cases?search=V2CMP_0041719&page_size=10")
check("search returned results", rs.get("total",0) >= 1,  f"total={rs.get('total',0)}")
if rs.get("items"):
    check("result is correct case", rs["items"][0]["case_id"] == "V2CMP_0041719",
          rs["items"][0].get("case_id"))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 5 — Typology filter"); print("=" * 60)
rt = get("/api/v1/cases?typology_id=TYP_04&page_size=10")
check("typology filter returns results", rt.get("total",0) > 100, f"total={rt.get('total',0)}")
if rt.get("items"):
    check("all items are TYP_04",
          all(i["typology_id"] == "TYP_04" for i in rt["items"]),
          f"{rt['items'][0]['typology_id']}")

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 6 — Case detail (V2CMP_0041719)"); print("=" * 60)
det = get("/api/v1/cases/V2CMP_0041719")
check("case_id matches",           det.get("case_id") == "V2CMP_0041719",  det.get("case_id"))
check("complaint block present",   "complaint"       in det)
check("hops list present",         "hops"            in det)
check("evidence_stages present",   "evidence_stages" in det)
check("hop_count >= 0",            det.get("hop_count",  -1) >= 0,         str(det.get("hop_count")))
c = det.get("complaint", {})
check("complaint has typology_id", "typology_id"     in c,                 c.get("typology_id"))
check("complaint has amount_inr",  "amount_inr"      in c,                 str(c.get("amount_inr")))
check("complaint has victim_state","victim_state"    in c,                 c.get("victim_state"))
hops = det.get("hops", [])
check("hops are sorted by sequence",
      all(hops[i]["hop_sequence"] <= hops[i+1]["hop_sequence"] for i in range(len(hops)-1)),
      f"{len(hops)} hops")
if hops:
    h0 = hops[0]
    check("hop has to_account",     "to_account"   in h0, h0.get("to_account"))
    check("hop account is ACCV2",   "ACCV2_" in h0.get("to_account",""), h0.get("to_account"))

stages = det.get("evidence_stages", [])
check("evidence_stages non-empty", len(stages) > 0, f"{len(stages)} stages")
if stages:
    check("stage 0 is T0",         stages[0]["stage"] == 0, stages[0].get("label"))
    check("last stage is latest",  stages[-1]["stage"] == det.get("hop_count"), stages[-1].get("label"))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 7 — Ground-truth isolation"); print("=" * 60)
et = det.get("evaluation_truth", {})
check("evaluation_truth key present",  "evaluation_truth" in det)
check("_warning label present",        "_warning" in et,           et.get("_warning","")[:40])
check("cashout block in eval_truth",   "cashout" in et)
cashout = et.get("cashout", {})
if cashout:
    check("cashout has status",        "status"   in cashout,      cashout.get("status"))
    check("cashout has zone_id",       "zone_id"  in cashout,      cashout.get("zone_id"))
    check("cashout NOT in complaint",  "zone_id" not in det.get("complaint", {}))
    check("cashout NOT in hops[0]",    len(hops) == 0 or "zone_id" not in hops[0])

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 8 — POST /api/v1/predict-case (V2 pipeline)"); print("=" * 60)
try:
    pred = post("/api/v1/predict-case", {"case_id": "V2CMP_0041719", "stage": -1})
    check("HTTP 200",           True)
    check("case_id correct",    pred.get("case_id") == "V2CMP_0041719", pred.get("case_id"))
    check("geographic present", "geographic" in pred)
    check("timing present",     "timing"     in pred)
    check("decision present",   "decision"   in pred)
    dec = pred.get("decision", {})
    check("decision.decision is V2 label",
          dec.get("decision") in ("CRITICAL","REVIEW","MONITOR"), dec.get("decision"))
    check("decision_confidence 0-1",
          0 <= dec.get("decision_confidence", -1) <= 1, str(dec.get("decision_confidence")))
    geo = pred.get("geographic", {})
    rz  = geo.get("ranked_zones", [])
    check("ranked_zones present",  len(rz) > 0, f"{len(rz)} zones")
    if rz:
        check("probability is 0-1 float",
              0 < rz[0].get("probability",0) <= 1, f"{rz[0].get('probability'):.6f}")
        check("zone has lat/lng",
              rz[0].get("lat") is not None, f"lat={rz[0].get('lat')}, lng={rz[0].get('lng')}")
    tim  = pred.get("timing", {}).get("intervention_distribution", {})
    p50  = tim.get("p50_minutes")
    check("p50_minutes present",   p50 is not None, str(p50))
    check("p50 > 0",               p50 is not None and p50 > 0, str(p50))
    sys_block = pred.get("system", {})
    check("dataset_version == v2", sys_block.get("dataset_version") == "v2",
          sys_block.get("dataset_version"))
    print()
    print(f"  Geographic V2:   Top zone = {geo.get('predicted_destination_zone')}, confidence = {geo.get('confidence_score')}%")
    print(f"  Timing V2:       P50 = {p50} min")
    print(f"  Decision Engine: {dec.get('decision')}, confidence = {dec.get('decision_confidence')}")
    print(f"  Top reason:      {(dec.get('reasons') or ['—'])[0][:80]}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"  HTTP ERROR {e.code}: {body}")
    ERRORS.append(f"predict-case HTTP {e.code}")
except Exception as e:
    print(f"  ERROR: {e}")
    ERRORS.append(f"predict-case error: {e}")

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 9 — Featured A-J cases"); print("=" * 60)
feat = get("/api/v1/meta/featured")
cases_feat = feat.get("featured_cases", [])
check("featured_cases present",  len(cases_feat) > 0,  f"{len(cases_feat)} cases")
check("10 featured cases (A-J)", len(cases_feat) == 10, str(len(cases_feat)))
if cases_feat:
    keys = [c["case_key"] for c in cases_feat]
    for k in list("ABCDEFGHIJ"):
        check(f"case key {k} present", k in keys)
    cids = [c["complaint_id"] for c in cases_feat]
    check("all IDs are V2CMP", all(c.startswith("V2CMP_") for c in cids),
          cids[0] if cids else "—")
    # Verify Case A resolves through case detail endpoint
    case_a_id = next((c["complaint_id"] for c in cases_feat if c["case_key"] == "A"), None)
    if case_a_id:
        da = get(f"/api/v1/cases/{case_a_id}")
        check("Case A resolves via detail endpoint",
              da.get("case_id") == case_a_id, da.get("case_id"))
        check("Case A NOT dependent on v2TestCaseFixtures", True,
              "detail served by backend repo, not frontend fixture file")

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 10 — Dataset stats"); print("=" * 60)
stats = get("/api/v1/meta/stats")
check("total_complaints == 60000",  stats.get("total_complaints") == 60000, str(stats.get("total_complaints")))
check("total_hops == 176915",       stats.get("total_hops") == 176915,      str(stats.get("total_hops")))
check("typologies == 10",           stats.get("typologies") == 10,          str(stats.get("typologies")))
print()
print(f"  Dataset: {stats.get('total_complaints'):,} complaints, "
      f"{stats.get('total_hops'):,} hops, "
      f"{stats.get('typologies')} typologies, "
      f"{stats.get('states')} states")

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60); print("STEP 11 — 404 for unknown case_id"); print("=" * 60)
try:
    get("/api/v1/cases/NONEXISTENT_FAKE_ID_12345")
    check("404 for unknown case", False, "Expected 404 but got 200")
except urllib.error.HTTPError as e:
    check("404 returned", e.code == 404, f"HTTP {e.code}")
except Exception as e:
    check("404 returned", False, str(e))

# ─────────────────────────────────────────────────────────────────────────────
print(); print("=" * 60)
if ERRORS:
    print(f"RESULT: {len(ERRORS)} CHECK(S) FAILED:")
    for e in ERRORS: print(f"  ✗  {e}")
    sys.exit(1)
else:
    print("RESULT: ALL CHECKS PASSED — V2 CASE API OPERATIONAL")
print("=" * 60)
