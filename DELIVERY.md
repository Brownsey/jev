# Jev Resolution Lab — contract v1

UK and Germany construction/planning entity-resolution experiment, built with Next.js App Router/TypeScript and deployed to Vercel. Light profile, token-first fullstack-efficient. No shared persistence required: local browser workspace plus JSON export; credentials never persisted by the browser. Later contract revisions below extend the original acceptance criteria.

## Acceptance criteria
- R1 Generate 20–500 deterministic synthetic project pairs from a seed; include genuine duplicates (abbreviation, paraphrase, omitted fields), hard negatives (neighbouring addresses, different phase/scope), clear negatives. Ground truth and scenario are evaluation-only, never sent to Jev. Distinct records use opaque pair IDs unrelated to truth.
- R2 Browse/search pairs; inspect full fields side-by-side and expected answer. Fields: name, description, address, postcode, city, developer, reference. Synthetic data explicitly labelled.
- R3 Edit resolution instructions, choose conservative/balanced/address-first examples, select compared fields, tune review threshold. Preview exact Jev request shape with no secrets/truth; include implementation examples and field guidance.
- R4 Run bounded batches (maximum 20 pairs per server request) through real Next route, demo or live. Demo is a deterministic field heuristic, clearly labelled, never presented as Jev or benchmark evidence. Live calls ONLY https://openrouter.ai/api/alpha/decisions, model typesafe/jev-1.13 by default. Choice questions: match/different/review with per-option descriptions; refer to pair ID in instructions because question IDs are not visible to Jev. Record state includes selected fields only. No chat completions or generated model explanations.
- R5 Show per-pair probabilities, provider confidence, review state below threshold (selected-option probability), counts, precision/recall/coverage/accuracy with honest denominators, latency and usage when available (unknown is not zero). Cancel stops additional batches, completed results retained; failures visible without fabricating success. Changing dataset/prompt/fields/threshold/model/mode invalidates current results. Retry starts a fresh run.
- R6 Persist non-secret workspace in localStorage with version and validation; reload restores dataset/settings/results. Export dataset and evaluation JSON. Storage errors are nonfatal and visible. No shared database.
- R7 Server validation rejects malformed/big inputs (max 150KB request, 20 pairs, 2,000 chars per field, 8,000 prompt, unique IDs, valid enum/threshold, selected fields nonempty). Reject malformed upstream answers; no fabricated fallback. Missing key 503; invalid input 400; provider auth/credit/rate errors mapped to safe explanatory messages, timeout 504, provider failure 502. Never log key or raw upstream errors. Require same-origin browser POST. Hosted live requests require JEV_ACCESS_TOKEN; no hosted owner-funded unauthenticated proxy. Local browser supplies optional access token in Authorization header, memory only.
- R8 Responsive accessible UI (desktop + 390px), keyboard focus, form labels, loading/error/empty states. Build/type/unit/browser checks; separate backend and UI validation then distinct final review. Live paid inference gap reported if no key.

## Shared contracts
Types in src/lib/types.ts are lead-owned. GET /api/config returns ConfigResponse. POST /api/resolve receives ResolveRequest and returns ResolveResponse or {error:string}. POST Authorization Bearer access-token only when configured; credential comes from server env. POST /api/resolve enforces same origin when Origin present and rejects Sec-Fetch-Site cross-site; hosted live gating uses NODE_ENV=production or VERCEL.

Domain exports from src/lib/lab.ts: FIELDS ({key:ProjectField,label:string}[]), PROMPTS ({id,label,text}[]), DEFAULT_MODEL, generateDataset(count:number, seed:number):Dataset, buildJevRequest(request:ResolveRequest):object, summarize(pairs:Pair[],results:Resolution[]):{total,completed,matched,different,review,correct,accuracy:number|null,precision:number|null,recall:number|null,coverage:number}. Accuracy denominator completed (review not correct), coverage decided/completed, precision TP/predicted-match, recall TP/actual-match among completed. Probabilities are 0–1. Demo excludes truth from decision logic.

## Visual direction
Working research instrument, called jev / resolution lab. Cloud-white #F5F7FA canvas, ink #192B3C, blue #245BE8, teal #087C76, muted #66778A, borders #DFE6EE. Rounded geometric display (local/system Trebuchet MS), Segoe UI body, Consolas data. Fixed slim navigation rail/sidebar, broad data workspace, right comparison inspector. Signature: two real project records connected by a compact match-probability bar; use actual outcomes, no decorative graphs. Quiet flat surfaces, small blue actions, generous top heading, high-density legible table. Mobile stacks panes. No motion dependency.

## Ownership / scheduling
Lead owns package/config/dependencies/types/docs, server port 3000 and shared builds. Domain/backend Terra owns src/lib/lab.ts, src/lib/jev.ts, src/app/api/**, tests/domain.test.ts, tests/api.test.ts. UI Terra owns src/app/page.tsx, src/app/layout.tsx, src/app/globals.css, tests/e2e/**, playwright.config.ts. Workers are leaves; no installations, branches, commits, shared build or server without lead. TDD first. Domain contract stable; UI may implement concurrently. High-risk external integration: independent surface validator(s), distinct final reviewer. No claims of live inference without evidence.

## Primary sources checked 2026-09-22
- https://openrouter.ai/labs/jev/compile (official SDK decisions example, batching typed questions)
- https://docs.typesafe.ai/primitives/choice (request/response, probabilities vs confidence, IDs not visible)
- https://openrouter.ai/typesafe (model listing)
Endpoint to confirm from official OpenRouter SDK source before final integration.

## Contract v1.1 — user steering
Cover BOTH UK and Germany; default Mixed. ProjectField also includes country. Dataset adds country: 'UK' | 'Germany' | 'Mixed'. generateDataset(count, seed, country = 'Mixed'). UI country filter/generator selection. German descriptions and addresses include Straße/Str., umlauts, five-digit postcodes, Neubau/Sanierung, Bauabschnitt and different houses. Preserve country distinctions. All other contracts unchanged.

## Deployment follow-up
The user authorized production Vercel deployment and requested CLI verification. Target: `stephen-brownseys-projects/jev`, connected to `Brownsey/jev`. The user will supply the OpenRouter API key and configure a custom domain later. Configure the hosted app access token separately; verify a Ready deployment and a real hosted demo journey without requiring paid model inference.

## Dataset explorer follow-up — contract v1.2
Ordinary substantive UI change: read-only view of the existing active dataset, with no new persistence, API or credential boundary. Lead owns integration/tests; Terra owns the isolated explorer component/styles; one independent combined validation/review gate.

- D1 A keyboard-operable “Explore dataset” disclosure opens a visual overview of the generated dataset. Empty workspace explains that pairs must be generated. Summary shows the actual country, seed and pair count.
- D2 Overview shows actual pair counts by country, expected outcome and scenario, plus field completeness across both records. Clearly label synthetic data and expected outcomes; never imply model results or real project imagery.
- D3 Browse cards containing paired project/address previews; open any card to compare all eight fields from both records, with absent values labelled. Search across all fields and scenarios, filter UK/Germany, paginate in batches of 12, and show a clear no-results state. Changing filters or dataset resets pagination and keeps the selected comparison within visible results.
- D4 Browsing preserves evaluation settings/results and the saved dataset. Reload restores that dataset through existing persistence; explorer disclosure/filter state need not persist. Responsive desktop/mobile layout, keyboard focus and bounded rendering for 500 pairs.
- D5 Prove D1–D4 through browser acceptance tests and independent visual/source review, run existing type/unit/build/browser gates, then deploy and verify the production deployment and browser journey. No paid inference needed for this UI change.

Visual direction: preserve the existing typography and blue/teal palette. A broad clickable dataset summary expands into proportional data bars, compact pair cards and a side-by-side record comparison; stack all panels on mobile. Use real field values, not fabricated maps or photography.

## Revised showcase goal — research captured, implementation pending

The user clarified that datasets must contain individual records forming singletons, duplicate pairs and triples, with fewer than 500 input rows and inexpensive inference. This supersedes preset pair generation as the intended main showcase. The deployed app still uses preset pairs. See DATASET-RESEARCH.md for verified free sources, a 190-row labelled sample option, a 300-row UK/Germany synthetic composition, candidate-comparison budgeting and cluster evaluation requirements.

## Model selection and resolution visibility — contract v1.3

Implement the user's immediate dropdown/status request on the current pair-based lab. Record-level clustering remains the separate pending showcase revision above. Light profile, fullstack-efficient; high-risk gate because model validation and a real paid provider check touch the external integration. UI owner Terra; lead owns model registry/API contracts and paid call; independent affected-surface validation then distinct final read-only review. Preserve the established visual system, use green/amber/neutral/blue status accents plus words.

- M1 Model is a native dropdown containing all Jev options currently listed by OpenRouter: `typesafe/jev-1.13` and `~typesafe/jev-latest` (verified 22 September 2026 at https://openrouter.ai/typesafe and https://openrouter.ai/~typesafe/jev-latest). Shared registry supplies UI options and backend allowlist. Unrecognised request models return 400 before any provider call. Default remains pinned 1.13. No invented or arbitrary model IDs.
- M2 Explorer cards/comparison and pair queue identify actual live results versus demo. Live match/different is resolved by Jev; live review is unresolved and needs review; absent result is not run with Jev; simulated result is demo only. Expected labels remain distinct from predictions. Resolution-status filter offers all/resolved/unresolved/review/demo, with unresolved including all states except live final match/different. Intersect with search/country filters, reset paging and retain coherent visible selection. Counts reflect partial progress. Use text as well as colour.
- M3 Browsing never changes results. Existing result invalidation on model/prompt/fields/threshold/mode/dataset changes remains. Reload restores valid model/results; unsupported saved model falls back to pinned default, clears stale results/usage/time and shows a notice while retaining the dataset. No credentials in browser persistence.
- M4 Verify actual provider use only within the user's maximum five input rows: one paid test request with at most two pairs/four project records, no automatic retry or broader paid suite. All other tests remain demo or mocked. `OPENROUTER_API_KEY` stays server-side; `JEV_ACCESS_TOKEN` remains app access credential. Missing provider setup remains actionable and fails closed.
- M5 Prove dropdown/API rejection, each status/filter state, partial progress, invalidation/reload and mobile/keyboard behavior; run type/unit/build/browser gates; deploy to existing Vercel project and verify Ready plus hosted main journey. Report paid test usage/cost only if returned, and any missing environment gate accurately.

## Final simplification and sense check — contract v1.4

Base `869dc58`. Preserve the existing pairwise app and all R/D/M requirements; dataset-wide entity-group discovery remains the separately documented pending feature. No dependency additions or paid inference. High-risk validation gate because request parsing/validation is reviewed: independent validator followed by distinct final read-only review.

- C1 Remove duplicate resolution-status rendering/rules and identical styles while preserving all status/filter, persistence, selection, keyboard and responsive behavior. Existing browser tests and independent screenshots prove parity.
- C2 Simplify bounded request-body decoding without extra byte-array copies; preserve the 150KB byte cap, correctly decode split UTF-8 chunks and return controlled errors for unreadable/malformed bodies. Reject duplicated comparison fields and invalid thresholds before inference. Regression tests precede behavior fixes; retain auth/cross-site/provider checks.
- C3 Apply only concrete audit findings and useful local simplifications, keep code readable, and retain deterministic generated fixtures. Run the complete existing verification gate with no weakened or skipped cases, inspect staged changes/secrets, commit and push.
- C4 Verify Vercel production Ready for the exact commit and hosted browser journeys. Report known provider-key and entity-grouping limitations accurately; a clean refactor does not prove paid Jev accuracy.
- C5 Resolve audit findings: prevent deselecting the last comparison field and constrain thresholds to 0–1 so normal edits cannot poison saved workspaces; persist/export actual returned model versions per run, including alias resolution; remove the unused `JEV_MODEL` setting and config response's unused model property. Readiness metadata is only `{configured, accessRequired}`. Regression tests must prove dataset retention and run-version provenance through reload/export/invalidation.

Validation on 23 September 2026: `npm run verify` passed typecheck, 31 unit/API tests, production build and all 19 browser tests with no skips. Independent validation also exercised exact request-size boundaries, interrupted streams, two real demo batches with reload, mocked live model-version exports and desktop/mobile keyboard journeys; screenshots inspected at 1440px and 390px. The generator refactor retained identical seeded output. No paid inference was attempted: production reports the provider key is not configured. Production deployment verification follows the commit and push.
