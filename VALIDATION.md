# Validation — 22 September 2026

Initial implementation snapshot: local working tree, Next.js 16.3.6 / React 19.3.0 / Node.js 22.22.2. The subsequent user-authorized deployment uses the connected Vercel `jev` project.

Final verification passed with exit code 0: TypeScript, 20 unit/API tests, production build, and 9 Chromium browser tests. These are the checks exposed by `npm run verify`. No tests skipped. Browser tests used the actual Next.js backend for generated demo data; only external provider transport and specific failure timing were controlled.

Independent affected-surface validation covered:

- Deterministic UK, Germany and mixed datasets up to 500 pairs; unique IDs, country-specific positives and negatives, meaningful address and phase differences.
- Provider payload field selection, excluded evaluation labels, correct Decisions URL/body, probability and confidence distinction, malformed provider responses and safe error messages.
- Hosted access-token enforcement, missing key, cross-site rejection, encoded request size, malformed input, authentication/credit/rate/network/timeout errors.
- Two batches resolving 40 pairs, reload restoration, keyboard record selection, JSON exports and invalidation after settings changes.
- Cancel after one completed batch, retained partial results and no third request; configuration locked while running.
- Corrupt and duplicate saved results, browser quota errors and memory-only access tokens.
- Fractional generation inputs show a notice without replacing records; empty API batches are rejected; timing and usage survive reload and export.
- Screenshots personally inspected at 1440px desktop, 1024px tablet and 390px mobile; no page overflow, visible focus and legible record comparisons.

Screenshots are local ignored artifacts in `.artifacts/validation-desktop.png`, `.artifacts/validation-tablet.png`, and `.artifacts/validation-mobile.png`.

A distinct read-only final reviewer accepted the implementation. All three minor findings were corrected, independently regression-tested, and rechecked by that reviewer. No open Critical or Important findings remain.

## Explicit remaining environment gap

No OpenRouter key was supplied. Paid Jev inference has **not** been verified. Adapter contract and error tests use controlled responses based on the official OpenRouter/TypeSafe schema. Demo scores are not Jev accuracy evidence. Set `OPENROUTER_API_KEY` in `.env.local`, restart the app, and run a small live experiment to check account access and current alpha endpoint behaviour.

## Dataset explorer follow-up

Base revision: `bb556969312d78153f848743a1a9230c5a068ca3`. Acceptance criteria D1–D5 are recorded in DELIVERY.md. No provider, authentication or persistence implementation changed.

The two new browser tests first failed because the explorer did not exist. After implementation, an ambiguous empty-state test locator was corrected to target the exact instructional paragraph; no production behavior or assertion was weakened. Both new tests then passed. The nine existing browser journeys, 20 unit/API tests, typecheck and production build passed on the same production-code snapshot.

Explorer checks cover keyboard disclosure, actual country counts and field completeness, full record values, missing descriptions, all-field search, UK/Germany filtering, empty search, pagination bounded to 12 cards for 500 pairs, mobile overflow, selected-record focus, unchanged completed demo evaluation, and reload restoration.

Independent runtime/source validation passed with no Critical or Important findings. At seed 876543, 500 pairs produced UK 252/Germany 248, expected match 125/different 375, four scenarios with 125 pairs each, and 7,937/8,000 provided values. All 16 populated record fields were individually searched; scenario search, pagination/filter/regeneration reset, keyboard focus and unchanged storage passed. Desktop 1440px and mobile 390px screenshots were inspected, with no page errors or horizontal overflow. Evidence is retained under ignored `.artifacts/explorer-review/`.

A distinct final read-only reviewer approved the staged production/test snapshot with no findings. Deployment and hosted browser verification follow the commit through the existing Vercel Git integration.
