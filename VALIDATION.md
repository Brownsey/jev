# Validation — 22 September 2026

Local working tree, Next.js 16.3.6 / React 19.3.0 / Node.js 22.22.2. No deployment or cloud resources created.

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
