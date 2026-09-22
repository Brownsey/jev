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
import type { Decision, Project, Resolution } from "../src/lib/types";

const project = (overrides: Partial<Project> = {}): Project => ({
  name: "Canal Works Phase 1",
  description: "Conversion of a warehouse into offices",
  address: "14 King Street",
  postcode: "LS1 4DY",
  city: "Leeds",
  country: "UK",
  developer: "Northgate Developments",
  reference: "UK-101",
  ...overrides,
});

const record = (
  id: string,
  overrides: Partial<Project> = {},
): SourceRecord => ({
  id,
  project: project(overrides),
});

const candidate = (id: string, leftId: string, rightId: string): Candidate => ({
  id,
  leftId,
  rightId,
});

const result = (id: string, decision: Decision): Resolution => ({
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

test("five-row mixed smoke preset covers both countries", () => {
  const data = generateCollection(5, 20260922, "Mixed");
  assert.deepEqual(
    new Set(data.records.map(({ project }) => project.country)),
    new Set(["UK", "Germany"]),
  );
});

test("collection generation is deterministic, bounded, locale-aware, and compositionally varied", () => {
  const first = generateCollection(18, 73, "Mixed");
  assert.deepEqual(first, generateCollection(18, 73, "Mixed"));
  assert.equal(first.records.length, 18);
  assert.equal(new Set(first.records.map(({ id }) => id)).size, 18);
  assert.deepEqual(
    new Set(first.records.map(({ project }) => project.country)),
    new Set(["UK", "Germany"]),
  );

  const sizes = Object.values(
    Object.groupBy(Object.values(first.truth), (id) => id),
  ).map((ids) => ids!.length);
  assert.ok(sizes.includes(1));
  assert.ok(sizes.includes(2));
  assert.ok(sizes.includes(3));
  assert.ok(
    first.records.some((left, index) =>
      first.records
        .slice(index + 1)
        .some(
          (right) =>
            first.truth[left.id] !== first.truth[right.id] &&
            left.project.address === right.project.address,
        ),
    ),
  );
  assert.ok(
    first.records.some((left, index) =>
      first.records
        .slice(index + 1)
        .some(
          (right) =>
            first.truth[left.id] !== first.truth[right.id] &&
            left.project.postcode === right.project.postcode &&
            left.project.address !== right.project.address,
        ),
    ),
  );
  for (const { id } of first.records) assert.ok(!id.includes(first.truth[id]));

  assert.equal(generateCollection(5, -2, "UK").records.length, 5);
  assert.equal(generateCollection(499, 2, "Germany").records.length, 499);
  assert.throws(() => generateCollection(0, 1, "Mixed"), /1/);
  assert.throws(() => generateCollection(500, 1, "Mixed"), /499/);
  assert.throws(() => generateCollection(5.5, 1, "Mixed"), /integer/);
  assert.throws(() => generateCollection(5, 1.2, "Mixed"), /seed/i);
});

test("candidate planning blocks on fields, ranks stronger evidence first, and reports the uncapped counts", () => {
  const records = [
    record("opaque-a"),
    record("opaque-b", {
      name: "Canal Works Ph. 1",
      address: "14 King St",
      country: "United Kingdom",
    }),
    record("opaque-c", { name: "Canal Works Phase 2", reference: "UK-102" }),
    record("opaque-d", {
      name: "Elsewhere",
      address: "9 Marktstraße",
      postcode: "10115",
      city: "Berlin",
      country: "Deutschland",
      reference: "DE-9",
    }),
  ];
  const plan = planCandidates(records, 1);
  assert.equal(plan.allPairs, 6);
  assert.equal(plan.eligible, 3);
  assert.equal(plan.candidates.length, 1);
  assert.deepEqual(
    [plan.candidates[0].leftId, plan.candidates[0].rightId],
    ["opaque-a", "opaque-b"],
  );
});

test("candidate selection and pair projection are independent of evaluation truth", () => {
  const collection = generateCollection(18, 91, "Mixed");
  const before = planCandidates(collection.records, 20);
  collection.truth = Object.fromEntries(
    collection.records.map(({ id }, index) => [id, `mutated-${index % 2}`]),
  );
  assert.deepEqual(planCandidates(collection.records, 20), before);

  const pairs = candidatePairs(collection.records, before.candidates);
  assert.deepEqual(
    pairs.map(({ id }) => id),
    before.candidates.map(({ id }) => id),
  );
  assert.ok(
    pairs.every(
      ({ expected, scenario }) =>
        expected === "different" && scenario === "collection candidate",
    ),
  );
  assert.ok(
    pairs.every(
      ({ id }, index) =>
        id ===
        candidatePairs(collection.records, [before.candidates[index]])[0].id,
    ),
  );
});

test("candidate IDs and orientation are stable for canonical record ordering", () => {
  const records = [record("row-z"), record("row-a")];
  const forward = planCandidates(records, 10).candidates[0];
  const reversed = planCandidates([...records].reverse(), 10).candidates[0];
  assert.deepEqual(forward, reversed);
  assert.deepEqual([forward.leftId, forward.rightId], ["row-a", "row-z"]);
  assert.equal(forward.id, "c-row-a-row-z");
  assert.doesNotMatch(forward.id, /match|truth|entity/i);
});

test("transitive match links with a direct contradiction produce one review group", () => {
  const records = [record("a"), record("b"), record("c")];
  const candidates = [
    candidate("ab", "a", "b"),
    candidate("bc", "b", "c"),
    candidate("ac", "a", "c"),
  ];
  const groups = groupRecords(records, candidates, [
    result("ab", "match"),
    result("bc", "match"),
    result("ac", "different"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].recordIds, ["a", "b", "c"]);
  assert.equal(groups[0].status, "review");
  assert.deepEqual(groups[0].conflicts, ["ac"]);
});

test("review and unfinished edges prevent linked or isolated records being presented as resolved", () => {
  const records = [
    record("a"),
    record("b"),
    record("c"),
    record("d"),
    record("e"),
  ];
  const candidates = [
    candidate("ab", "a", "b"),
    candidate("bc", "b", "c"),
    candidate("de", "d", "e"),
  ];
  const reviewed = groupRecords(records, candidates, [
    result("ab", "match"),
    result("bc", "review"),
    result("de", "different"),
  ]);
  assert.deepEqual(
    reviewed.map(({ recordIds, status, conflicts }) => ({
      recordIds,
      status,
      conflicts,
    })),
    [
      { recordIds: ["a", "b"], status: "review", conflicts: ["bc"] },
      { recordIds: ["c"], status: "review", conflicts: ["bc"] },
      { recordIds: ["d"], status: "unlinked", conflicts: [] },
      { recordIds: ["e"], status: "unlinked", conflicts: [] },
    ],
  );

  const pending = groupRecords(records.slice(0, 3), candidates.slice(0, 2), [
    result("ab", "match"),
  ]);
  assert.deepEqual(
    pending.map(({ recordIds, status }) => ({ recordIds, status })),
    [
      { recordIds: ["a", "b"], status: "pending" },
      { recordIds: ["c"], status: "pending" },
    ],
  );
});

test("evaluation uses all true pairs for candidate and group recall, including cap misses", () => {
  const records = [record("a"), record("b"), record("c"), record("d")];
  const collection: Collection = {
    version: 1,
    seed: 1,
    country: "UK",
    records,
    truth: { a: "one", b: "one", c: "one", d: "two" },
  };
  const candidates = [candidate("ab", "a", "b"), candidate("ad", "a", "d")];
  const metrics = evaluateCollection(collection, candidates, [
    result("ab", "match"),
    result("ad", "match"),
    result("missing", "different"),
  ]);
  assert.deepEqual(metrics, {
    trueGroups: 2,
    truePairs: 3,
    candidateRecall: 1 / 3,
    groupPrecision: 1 / 3,
    groupRecall: 1 / 3,
    completed: 2,
  });
});

test("evaluation returns null ratios when their honest denominators are empty", () => {
  const records = [record("a"), record("b")];
  const collection: Collection = {
    version: 1,
    seed: 1,
    country: "UK",
    records,
    truth: { a: "one", b: "two" },
  };
  assert.deepEqual(evaluateCollection(collection, [], []), {
    trueGroups: 2,
    truePairs: 0,
    candidateRecall: null,
    groupPrecision: null,
    groupRecall: null,
    completed: 0,
  });
});
