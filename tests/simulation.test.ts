import assert from "node:assert/strict";
import test from "node:test";
import {
  candidatePairs,
  generateCollection,
  groupRecords,
  planCandidates,
} from "../src/lib/collection";
import { demoResolve } from "../src/lib/jev";
import type { Pair, Project, ProjectField } from "../src/lib/types";

const fields: ProjectField[] = [
  "name",
  "description",
  "address",
  "postcode",
  "city",
  "country",
  "developer",
  "reference",
];

const project = (overrides: Partial<Project> = {}): Project => ({
  name: "Canal Works Phase 1",
  description: "New homes, phase 1",
  address: "14 King Street",
  postcode: "LS1 4DY",
  city: "Leeds",
  country: "UK",
  developer: "Northgate Developments",
  reference: "UK-101",
  ...overrides,
});

const pair = (
  left: Partial<Project>,
  right: Partial<Project>,
  id = "pair",
): Pair => ({
  id,
  left: project(left),
  right: project(right),
  expected: "different",
  scenario: "test fixture",
});

test("default simulation links true pairs and triples without false merges", () => {
  for (const country of ["UK", "Germany", "Mixed"] as const) {
    for (const seed of [1, 73, 20260922]) {
      const collection = generateCollection(18, seed, country);
      const plan = planCandidates(collection.records, 50);
      const pairs = candidatePairs(collection.records, plan.candidates);
      const results = demoResolve(pairs, fields, 0.72);
      const groups = groupRecords(collection.records, plan.candidates, results);

      assert.ok(groups.some(({ status, recordIds }) => status === "linked" && recordIds.length === 2));
      assert.ok(groups.some(({ status, recordIds }) => status === "linked" && recordIds.length === 3));
      assert.ok(groups.some(({ status, recordIds }) => status === "unlinked" && recordIds.length === 1));
      for (const group of groups.filter(({ status }) => status === "linked"))
        assert.equal(new Set(group.recordIds.map((id) => collection.truth[id])).size, 1);
    }
  }
});

test("normalizes UK, German and phase abbreviations", () => {
  const cases = [
    pair(
      {},
      { name: "Canal Works Ph. 1", address: "14 King St" },
      "uk",
    ),
    pair(
      {
        name: "Lindenhof Bauabschnitt 2",
        address: "Invalidenstraße 42",
      },
      { name: "Lindenhof BA 2", address: "Invalidenstr. 42" },
      "de-short",
    ),
    pair(
      {
        name: "Lindenhof Bauabschnitt 2",
        address: "Invalidenstraße 42",
      },
      { name: "Lindenhof Bauabschn. 2", address: "Invalidenstrasse 42" },
      "de-long",
    ),
  ];

  assert.deepEqual(
    demoResolve(cases, ["name", "address"], 0.72).map(({ decision }) => decision),
    ["match", "match", "match"],
  );
});

test("minor name typo at the same address matches without a reference", () => {
  const result = demoResolve(
    [
      pair(
        { name: "Canal Works Phase 1", reference: "" },
        { name: "Canal Wroks Ph. 1", reference: "" },
      ),
    ],
    ["name", "address", "reference"],
    0.72,
  )[0];
  assert.equal(result.decision, "match");
});

test("exact selected name without site or reference evidence requires review", () => {
  const result = demoResolve(
    [pair({ name: "Grünauer Straße" }, { name: "Grünauer Straße" })],
    ["name"],
    0.72,
  )[0];
  assert.equal(result.decision, "review");
});

test("conflicting phases within selected evidence require review regardless of field order", () => {
  const input = pair({}, { description: "New homes phase 2" });
  for (const selected of [fields, [...fields].reverse()]) {
    assert.equal(demoResolve([input], selected, 0.72)[0].decision, "review");
  }
  const multiple = pair({}, { description: "Phase 1 and phase 2" });
  assert.equal(demoResolve([multiple], fields, 0.72)[0].decision, "review");
});

test("a shared reference or name and postcode cannot override a conflicting selected site", () => {
  const cases = [
    pair({}, { address: "14 Queen Street" }, "reference-site-conflict"),
    pair(
      { reference: "" },
      { address: "14 Queen Street", reference: "" },
      "name-postcode-site-conflict",
    ),
  ];
  assert.deepEqual(
    demoResolve(cases, ["name", "address", "postcode", "reference"], 0.72).map(
      ({ decision }) => decision,
    ),
    ["review", "review"],
  );
});

test("selected postcode and city conflicts require review while German transliteration agrees", () => {
  const conflicts = [
    pair({}, { postcode: "BS1 5UH" }, "postcode-conflict"),
    pair({}, { city: "Bristol" }, "city-conflict"),
  ];
  assert.deepEqual(
    demoResolve(conflicts, fields, 0.72).map(({ decision }) => decision),
    ["review", "review"],
  );
  assert.equal(
    demoResolve(
      [pair({ city: "München" }, { city: "Muenchen" })],
      ["name", "address", "city", "reference"],
      0.72,
    )[0].decision,
    "match",
  );
});

test("selected phase and house conflicts stay different when reference is deselected", () => {
  const conflicts = [
    pair({}, { name: "Canal Works Phase 2" }, "phase"),
    pair({}, { address: "16 King St" }, "house"),
  ];
  assert.deepEqual(
    demoResolve(conflicts, ["name", "address"], 0.72).map(({ decision }) => decision),
    ["different", "different"],
  );
});

test("only selected fields affect simulation and truth labels never do", () => {
  const input = pair(
    { reference: "LEFT", country: "UK" },
    { reference: "RIGHT", country: "Germany" },
  );
  const selected = demoResolve([input], ["name", "address"], 0.72);
  const mutated: Pair = {
    ...input,
    expected: "match",
    scenario: "mutated private truth",
  };
  assert.equal(selected[0].decision, "match");
  assert.deepEqual(demoResolve([mutated], ["name", "address"], 0.72), selected);
  assert.equal(demoResolve([input], ["reference"], 0.72)[0].decision, "different");
});

test("missing evidence, shared city/developer, and address alone require review", () => {
  const cases = [
    pair(
      { name: "", address: "", postcode: "", reference: "" },
      { name: "", address: "", postcode: "", reference: "" },
      "missing",
    ),
    pair(
      { name: "Canal Works", address: "14 King Street", reference: "" },
      { name: "Station Yard", address: "7 Temple Quay", reference: "" },
      "shared-weak",
    ),
    pair(
      { name: "", reference: "" },
      { name: "", reference: "" },
      "address-only",
    ),
  ];
  assert.deepEqual(
    demoResolve(cases, ["city", "developer"], 0.72).map(({ decision }) => decision),
    ["review", "review", "review"],
  );
  assert.equal(demoResolve([cases[2]], ["address"], 0.72)[0].decision, "review");
});

test("probabilities are normalized and raw choices do not change with threshold", () => {
  const input = pair({}, { name: "Canal Works Phase 2" });
  const low = demoResolve([input], ["name", "address"], 0)[0];
  const high = demoResolve([input], ["name", "address"], 0.99)[0];
  assert.equal(low.choice, high.choice);
  assert.deepEqual(low.probabilities, high.probabilities);
  assert.ok(
    Math.abs(Object.values(low.probabilities).reduce((sum, value) => sum + value, 0) - 1) < 1e-12,
  );
  assert.equal(low.decision, "different");
  assert.equal(high.decision, "review");
});
