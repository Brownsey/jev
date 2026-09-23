import assert from "node:assert/strict";
import test from "node:test";
import { candidatePairs, generateCollection, groupRecords, planCandidates } from "../src/lib/collection";
import { demoResolve } from "../src/lib/jev";
import type { Pair, Project } from "../src/lib/types";

const project = (patch: Partial<Project> = {}): Project => ({ name: "Canal Works Phase 1", description: "New homes phase 1", address: "14 King Street", postcode: "LS1 4DY", city: "Leeds", country: "UK", developer: "Northgate", reference: "UK-1", ...patch });
const pair = (left: Partial<Project>, right: Partial<Project>): Pair => ({ id: "x", left: project(left), right: project(right), expected: "different", scenario: "private fixture" });

test("validation: metadata alone and missing selected values stay review", () => {
  const weak = pair({ name: "", address: "", reference: "" }, { name: "", address: "", reference: "" });
  assert.equal(demoResolve([weak], ["city", "developer"], .72)[0].decision, "review");
  assert.equal(demoResolve([weak], ["name", "address"], .72)[0].decision, "review");
});

test("validation: selected address plus minor name typo matches but phase or house conflict cannot", () => {
  assert.equal(demoResolve([pair({}, { name: "Canal Wroks Ph. 1", address: "14 King St", reference: "" })], ["name", "address"], .72)[0].decision, "match");
  assert.equal(demoResolve([pair({}, { name: "Canal Works Phase 2" })], ["name", "address"], .72)[0].decision, "different");
  assert.equal(demoResolve([pair({}, { address: "16 King St" })], ["name", "address"], .72)[0].decision, "different");
});

test("validation: deselected conflicting metadata and evaluation labels cannot affect output", () => {
  const input = pair({ reference: "a", country: "UK" }, { reference: "b", country: "Germany" });
  const before = demoResolve([input], ["name", "address"], .72);
  assert.deepEqual(demoResolve([{ ...input, expected: "match", scenario: "truth mutation" }], ["name", "address"], .72), before);
});

test("validation: default mixed, UK and Germany collections form only truthful linked groups", () => {
  for (const country of ["Mixed", "UK", "Germany"] as const) {
    const collection = generateCollection(18, 73, country); const candidates = planCandidates(collection.records, 50).candidates;
    const groups = groupRecords(collection.records, candidates, demoResolve(candidatePairs(collection.records, candidates), ["name", "description", "address", "postcode", "city", "country", "developer", "reference"], .72));
    assert.ok(groups.some(group => group.status === "linked" && group.recordIds.length === 2));
    assert.ok(groups.some(group => group.status === "linked" && group.recordIds.length === 3));
    for (const group of groups.filter(group => group.status === "linked")) assert.equal(new Set(group.recordIds.map(id => collection.truth[id])).size, 1);
  }
});
