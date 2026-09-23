# Entity discovery showcase — iteration 1

Base: `04181ab`. Previous goal turn made progress: reviewed cleanup, committed, and verified production Ready plus 19 hosted browser cases. This iteration closes the missing collection-to-entities journey. Light delivery profile with fullstack-efficient routing. Existing pair lab remains available at `/lab`; `/` becomes the showcase. No new dependencies, shared database or paid model calls without the existing maximum-five-input-row authorization.

## Acceptance criteria

- S1 Generate deterministic fictional UK/Germany collections of individual records, with singles, pairs and triples plus same-site different-phase/nearby-address negatives. Default 18 rows; choices 5, 18, 60, 180, 300; generator hard limit 499. Five rows is a small smoke-test preset, not promised to contain all three group sizes. Input row counts and candidate comparisons are distinct. Opaque record IDs and evaluation truth stay separate. Prove determinism, composition, locale coverage and bounds.
- S2 Candidate selection uses only record fields, never truth. Rank locally with permissive address/reference rules, cap comparisons separately at 20/50/100/250/500 (default 50), show eligible/selected/all-pairs counts before running. Request projection sends existing pairwise API at most 20 comparisons per call, selected fields only, no truth/group labels. No automated paid calls in test suites. Prove truth mutations cannot affect candidate selection or requests.
- S3 Reuse `/api/resolve`, its allowlisted model dropdown, security, and prompt/field guidance. Showcase has simulation/live modes, model dropdown, threshold, prompt and at least one selected field. Live needs configured provider and access token when required. No eager inference. Pending, running, cancelled, partial and failed states are explicit; retry/resume sends only unfinished comparisons while settings changes invalidate prior outcomes. Credentials remain in memory. Mode/model/prompt/threshold/fields/dataset/cap changes clear results. Successful live batches retain actual model versions, usage (unknown remains unknown), latency, and export. Prove with real demo and mocked provider journeys.
- S4 Transform confident match links into proposed groups, show members' full records and direct comparison decisions/probabilities. Flag contradictions (A–B match, B–C match, A–C different) and review edges rather than claiming a verified group. Uncompared records are pending, isolated records are 'No match found', never verified singletons. Distinguish simulation from Jev throughout. Filter groups by size and status; inspect/search raw rows before a run. Prove pairs, triples, negatives, transitive conflicts, partial results, selection and mobile/keyboard flow.
- S5 Offer optional truth reveal and transparent evaluation: true groups, candidate recall (all true pairs denominator, including blocked/capped omissions), resulting group pair precision/recall and comparison completion. Untested pairs are not asserted negatives. Export data, settings, candidates, results, proposed groups, metrics and actual model versions. Persist a compact versioned workspace (generator parameters plus validated settings/results, regenerate deterministic records on load); retain legacy lab workspace separately. Corrupt storage and unavailable storage produce a usable app and visible notice. Prove reload, invalidation, no secret persistence and export content.
- S6 Explain the decision interface accurately: fixed choices and probabilities, review threshold, reusable questions over records. Link official TypeSafe Choice docs and OpenRouter example. A chat LLM can also produce structured outputs; no fabricated speed/cost/accuracy comparison, no simulated score portrayed as Jev performance. Show measured elapsed/token/cost values only for actual runs. Clarify synthetic fixtures are a workflow demonstration, not evidence of superiority. Maintain a distinct visual system: Segoe/Trebuchet display, Segoe body, Consolas data; ink #192b3c, blue #245be8, teal #087c76, cloud #f5f7fa, amber #8b6400. Signature: a visible record collection becoming expandable entity groups. Quiet controls, clear headline, generous grouped content, mobile stacks, visible focus.
- S7 Preserve all pair-lab behavior and 19 existing browser cases at `/lab` (only route expectations change). Typecheck, unit/API, production build, all browser cases with no skips, independent validation and distinct final review. Capture and inspect early/final desktop/mobile renders. Commit/push, inspect exact-commit Vercel build logs and Ready status, then run hosted main journey. No completion claim if environment gates remain unavailable.

## Stable domain contract

`src/lib/collection.ts` owns exported types/functions:

```ts
type SourceRecord = { id: string; project: Project };
type Collection = { version: 1; seed: number; country: Dataset['country']; records: SourceRecord[]; truth: Record<string,string> };
type Candidate = { id: string; leftId: string; rightId: string };
type CandidatePlan = { candidates: Candidate[]; eligible: number; allPairs: number };
type EntityGroup = { id: string; recordIds: string[]; status: 'linked' | 'review' | 'pending' | 'unlinked'; conflicts: string[] };
generateCollection(count:number, seed:number, country:Dataset['country']): Collection;
planCandidates(records:SourceRecord[], limit:number): CandidatePlan;
candidatePairs(records:SourceRecord[], candidates:Candidate[]): Pair[];
groupRecords(records:SourceRecord[], candidates:Candidate[], results:Resolution[]): EntityGroup[];
evaluateCollection(collection:Collection, candidates:Candidate[], results:Resolution[]): { trueGroups:number; truePairs:number; candidateRecall:number|null; groupPrecision:number|null; groupRecall:number|null; completed:number };
```

`candidatePairs` must provide the legacy Pair type's evaluation fields with constant placeholders only; existing `buildJevRequest` strips them. Candidate IDs are stable opaque pair IDs based on opaque row IDs, with canonical ordering. Group links never read evaluation truth. Metrics alone may read truth. No paid caching layer: retaining completed outcomes for a fixed experiment provides resume/reuse; configuration changes invalidate the cache.

## Ownership and gates

Lead: contracts, routing/legacy test path changes, metadata/docs, dependencies, server port 3000, builds, aggregate verification, git and deployment. Domain Sol: `src/lib/collection.ts`, `tests/collection.test.ts` (complex clustering correctness). UI Sol: `src/app/showcase.tsx`, `src/app/showcase.module.css`, `tests/e2e/showcase.spec.ts` (coupled run/persistence/selection states). Both write tests before production behavior and are leaves; no shared build/server/dependency/commit actions. Independent validator owns additional validation tests only, then a distinct final read-only reviewer. No credentials in tools/logs.

## Verification before deployment

`npm run verify` passed: type checking, 43 unit/API cases, production build and all 27 browser cases (including the 19 legacy lab cases). Independent validation covers truth separation, conflict handling, real simulation persistence/export, corrupt workspace recovery, mobile keyboard navigation and cancellation/failure/resume without resending finished comparisons. Distinct final review has no open findings; its focus-return finding was fixed with a regression test. Early and final desktop/mobile renders were captured and inspected.

Candidate field normalization is cached per record; no dependencies were added. The five-record mixed preset includes both countries. Existing server integration and authentication are reused. Paid inference was not verified in this iteration. Deployment and hosted checks must be verified against the resulting commit before reporting it live.

## Credential correction

The user subsequently confirmed that the existing sensitive `JEV_ACCESS_TOKEN` holds the provider key. Keep it as a server-only alias for `OPENROUTER_API_KEY` (canonical name takes precedence), and use the separate `JEV_APP_PASSWORD` for live access. Require the app password, reject missing/wrong/provider-key credentials before upstream inference, fail closed when hosted without a password, expose only configuration booleans, and retain memory-only password handling. Prove with route tests, independent security validation, browser checks and at most five source records in a hosted paid smoke run. No provider secret may appear in logs, exports or Git.

## Simulation correction — contract v1

Base `1ff18dc`. The previous heuristic counted equally weighted exact field matches: abbreviations reduced duplicate scores while shared city/developer/postcode inflated distinct-project scores. Review edges then flagged every default group. Existing records already contain UK/German spelling, address and phase variations; keep their stable generator and truth unchanged.

- D1 At the default threshold 0.72 and all fields, the 18-row Mixed showcase must visibly contain confidently linked pairs and triples plus distinct single records, with no false merges against synthetic truth. Prove the same for UK/Germany presets and several seeds using the real simulation API and group builder.
- D2 Score only selected record fields. Normalize common UK/German address/phase abbreviations and minor name spelling differences. Similar names at the same address are positive evidence; conflicting reference, phase, country or house number must prevent false merges. Missing fields, shared developer/city alone, or same address alone require review. Evaluation labels never influence predictions. Simulated scores are illustrative, not calibrated Jev probabilities; simulation does not interpret prompt text.
- D3 Reset only stale simulated results on workspace restore in both views, retaining dataset/settings and explaining the required rerun. Preserve live results. New simulation results survive reload. Add a simulation revision to saved workspaces; no credentials persist.
- D4 Preserve UI and live adapter/authentication. Explain current password behavior accurately: memory-only, checked server-side per live request, no account/session, public demo. No further paid calls. Run unit/API, build and browser gates, independent validation plus distinct final review (high risk due to persistence), inspect desktop/mobile results, commit/push and verify exact-commit Vercel logs and hosted demo at `https://jev.brownsey.co.uk`.

Ownership: simulation worker owns `demoResolve` and its private helpers in `src/lib/jev.ts` plus `tests/simulation.test.ts`; lead owns workspace revision/UI/browser tests/docs/builds/git/deployment. No new dependencies, dataset changes or server lifecycle changes by workers.

Verification: 60 unit/API tests, all 30 browser cases and production build passed. Independent matching/persistence validation and distinct final review approved after fixing contradictory phase evidence and strengthening live-metadata reload checks. Default 18 rows form three linked pairs, three linked triples and three single projects. Desktop/mobile renders were inspected. No paid calls were made for this correction.
