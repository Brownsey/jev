# Jev Resolution Lab — contract v1

Local UK construction/planning entity-resolution experiment. Empty repository, Next.js App Router/TypeScript, light profile, token-first fullstack-efficient. No deployment requested. No shared persistence required: local browser workspace plus JSON export; credentials never persisted by the browser.

## Acceptance criteria
- R1 Generate 20–500 deterministic synthetic project pairs from a seed; include genuine duplicates (abbreviation, paraphrase, omitted fields), hard negatives (neighbouring addresses, different phase/scope), clear negatives. Ground truth and scenario are evaluation-only, never sent to Jev. Distinct records use opaque pair IDs unrelated to truth.
- R2 Browse/search pairs; inspect full fields side-by-side and expected answer. Fields: name, description, address, postcode, city, developer, reference. Synthetic data explicitly labelled.
- R3 Edit resolution instructions, choose conservative/balanced/address-first examples, select compared fields, tune review threshold. Preview exact Jev request shape with no secrets/truth; include implementation examples and field guidance.
- R4 Run bounded batches (maximum 20 pairs per server request) through real Next route, demo or live. Demo is a deterministic field heuristic, clearly labelled, never presented as Jev or benchmark evidence. Live calls ONLY https://openrouter.ai/api/alpha/decisions, model typesafe/jev-1.13 by default. Choice questions: match/different/review with per-option descriptions; refer to pair ID in instructions because question IDs are not visible to Jev. Record state includes selected fields only. No chat completions or generated model explanations.
- R5 Show per-pair probabilities, provider confidence, review state below threshold (selected-option probability), counts, precision/recall/coverage/accuracy with honest denominators, latency and usage when available (unknown is not zero). Cancel stops additional batches, completed results retained; failures visible without fabricating success. Changing dataset/prompt/fields/threshold/model/mode invalidates current results. Retry starts a fresh run.
- R6 Persist non-secret workspace in localStorage with version and validation; reload restores dataset/settings/results. Export dataset and evaluation JSON. Storage errors are nonfatal and visible. No cloud resources.
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
