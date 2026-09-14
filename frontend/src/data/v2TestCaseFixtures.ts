// ─── V2 Featured Case Bookmarks (A–J) ────────────────────────────────────────
// These 10 case IDs are bookmarks into the FULL 60,000-case V2 universe.
// They are NOT a separate case dataset — they resolve through GET /api/v1/cases/{id}.
// v2TestCaseFixtures.ts is no longer the data source for the frontend.
// The canonical source is the backend V2 case repository (v2_case_repository.py).
//
// To navigate to a featured case: call setActiveCase(complaint_id) from CaseContext.
// To get the full list: GET /api/v1/meta/featured

export const V2_FEATURED_SCENARIOS: Record<string, string> = {
  A: 'High-confidence geographic convergence — 8-hop chain with strong registry signal',
  B: 'Geographically ambiguous — cross-region transfer, limited registry evidence',
  C: 'Registry recurrence — known mule account with historical sightings',
  D: 'Sparse context — single hop, early complaint, minimal evidence',
  E: 'Short intervention window — high timing urgency, fast cashout',
  F: 'Long intervention window — relaxed timing, extended opportunity',
  G: 'Zero-hop — complaint only, no transaction hops yet observed',
  H: 'Long chain — multi-hop spread across zones',
  I: 'Unresolved / censored — cashout not yet observed at prediction time',
  J: 'Frozen / intervention — known outcome, funds frozen example',
};

// Fetches the actual complaint_ids from backend at runtime.
// Use this instead of hardcoding IDs that may differ across dataset regenerations.
export async function fetchFeaturedCaseIds(
  backendUrl: string = 'http://localhost:8001',
): Promise<Array<{ case_key: string; complaint_id: string }>> {
  const res = await fetch(`${backendUrl}/api/v1/meta/featured`);
  if (!res.ok) throw new Error(`Featured cases API returned HTTP ${res.status}`);
  const data = await res.json();
  return data.featured_cases ?? [];
}
