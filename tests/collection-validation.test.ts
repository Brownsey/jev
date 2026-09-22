import assert from "node:assert/strict";
import test from "node:test";
import {
  candidatePairs,
  evaluateCollection,
  generateCollection,
  groupRecords,
  planCandidates,
  type Candidate,
  type Collection,
  type SourceRecord,
} from "../src/lib/collection";
import type { Project, Resolution } from "../src/lib/types";

const project = (overrides: Partial<Project> = {}): Project => ({
  name: "Harbour Phase 1",
  description: "New homes",
  address: "7 Temple Quay",
  postcode: "BS1 5UH",
  city: "Bristol",
  country: "UK",
  developer: "Harbour Build",
  reference: "UK-1",
  ...overrides,
});
const row = (id: string, overrides: Partial<Project> = {}): SourceRecord => ({
  id,
  project: project(overrides),
});
const edge = (id: string, leftId: string, rightId: string): Candidate => ({
  id,
  leftId,
  rightId,
});
const outcome = (id: string, decision: Resolution["decision"]): Resolution => ({
  id,
  decision,
  choice: decision,
  confidence: 0.9,
  probabilities: {
    match: decision === "match" ? 0.9 : 0.05,
    different: decision === "different" ? 0.9 : 0.05,
    review: decision === "review" ? 0.9 : 0.05,
  },
});

test("validation: generation honors country choice, composition and independent bounds", () => {
  for (const [country, expected] of [
    ["UK", "UK"],
    ["Germany", "Germany"],
  ] as const)
    assert.ok(
      generateCollection(18, 11, country).records.every(
        (item) => item.project.country === expected,
      ),
    );
  const mixed = generateCollection(18, 11, "Mixed");
  const sizes = Object.values(
    Object.groupBy(Object.values(mixed.truth), (value) => value),
  ).map((group) => group!.length);
  assert.deepEqual(new Set(sizes), new Set([1, 2, 3]));
  assert.throws(() => generateCollection(500, 11, "Mixed"));
  assert.throws(() => planCandidates(mixed.records, -1));
  assert.equal(planCandidates(mixed.records, 0).candidates.length, 0);
});

test("validation: candidate cap, canonical pairs and API projection do not leak truth", () => {
  const collection = generateCollection(60, 33, "Mixed");
  const plan = planCandidates(collection.records, 20);
  assert.ok(plan.eligible >= plan.candidates.length);
  assert.equal(plan.candidates.length, Math.min(20, plan.eligible));
  const pairs = candidatePairs(collection.records, plan.candidates);
  assert.ok(
    pairs.every(
      (pair) =>
        pair.expected === "different" &&
        pair.scenario === "collection candidate",
    ),
  );
  const before = JSON.stringify({ plan, pairs });
  for (const id of Object.keys(collection.truth)) collection.truth[id] = "one";
  assert.equal(
    JSON.stringify({
      plan: planCandidates(collection.records, 20),
      pairs: candidatePairs(collection.records, plan.candidates),
    }),
    before,
  );
});

test("validation: blocked true pairs remain in recall denominator and unfinished edges stay pending", () => {
  const records = [
    row("a"),
    row("b"),
    row("c"),
    row("d", { address: "9 Temple Quay", reference: "UK-2" }),
  ];
  const collection: Collection = {
    version: 1,
    seed: 1,
    country: "UK",
    records,
    truth: { a: "g", b: "g", c: "g", d: "d" },
  };
  const candidates = [edge("ab", "a", "b")];
  assert.deepEqual(
    evaluateCollection(collection, candidates, [outcome("ab", "match")]),
    {
      trueGroups: 2,
      truePairs: 3,
      candidateRecall: 1 / 3,
      groupPrecision: 1,
      groupRecall: 1 / 3,
      completed: 1,
    },
  );
  assert.deepEqual(
    groupRecords(
      records.slice(0, 3),
      [edge("ab", "a", "b"), edge("bc", "b", "c")],
      [outcome("ab", "match")],
    ).map((group) => [group.recordIds, group.status]),
    [
      [["a", "b"], "pending"],
      [["c"], "pending"],
    ],
  );
});
