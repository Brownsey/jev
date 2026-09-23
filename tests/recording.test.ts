import assert from "node:assert/strict";
import test from "node:test";
import recording from "../src/data/jev-recording.json";
import { candidatePairs, generateCollection, groupRecords } from "../src/lib/collection";
import { buildJevRequest } from "../src/lib/lab";
import type { Resolution, ResolveRequest } from "../src/lib/types";

test("saved recording includes every unique 20-record pair once, with complete batch receipts", () => {
  assert.equal(recording.version, 2);
  assert.deepEqual(recording.collection, generateCollection(20, 20260922, "Mixed"));
  const truthSizes = new Map<string, number>();
  for (const group of Object.values(recording.collection.truth)) truthSizes.set(group, (truthSizes.get(group) ?? 0) + 1);
  assert.deepEqual([...truthSizes.values()].sort(), [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
  assert.equal(new Set(recording.collection.records.map(record => record.id)).size, 20);
  assert.equal(recording.candidates.length, 190);
  assert.equal(recording.response.results.length, 190);
  const expectedPairs = recording.collection.records.flatMap((left, index) => recording.collection.records.slice(index + 1).map(right => [left.id, right.id].sort().join("|")));
  const actualPairs = recording.candidates.map(candidate => [candidate.leftId, candidate.rightId].sort().join("|"));
  assert.deepEqual(actualPairs.sort(), expectedPairs.sort());
  for (const record of recording.collection.records) assert.equal(recording.candidates.filter(candidate => candidate.leftId === record.id || candidate.rightId === record.id).length, 19);
  assert.equal(new Set(recording.response.results.map(result => result.id)).size, 190);
  assert.deepEqual(recording.response.results.map(result => result.id).sort(), recording.candidates.map(candidate => candidate.id).sort());
  assert.equal(recording.batches.length, 10);
  assert.deepEqual(recording.batches.map(batch => batch.response.results.length), [20, 20, 20, 20, 20, 20, 20, 20, 20, 10]);
  assert.deepEqual(recording.batches.flatMap(batch => batch.response.results), recording.response.results);
  assert.equal(recording.response.mode, "live");
  for (const batch of recording.batches) {
    assert.equal(batch.response.mode, "live");
    assert.ok(Number.isFinite(Date.parse(batch.recordedAt)));
    assert.ok(batch.response.model.startsWith("typesafe/jev-"));
  }
  for (const key of ["cost", "inputTokens", "elapsedMs"] as const) {
    const values = recording.batches.map(batch => batch.response[key]);
    const sum = values.some(value => value == null) ? null : values.reduce((total, value) => total + value!, 0);
    if (sum == null) assert.equal(recording.response[key], null);
    else assert.ok(Math.abs(recording.response[key]! - sum) < 1e-10, `${key} must equal batch total`);
  }
  assert.equal(recording.settings.threshold, 0.9);
  for (const result of recording.response.results) {
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(Object.values(result.probabilities).every(value => value >= 0 && value <= 1));
    assert.ok(Math.abs(Object.values(result.probabilities).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    const selected = result.probabilities[result.choice as keyof typeof result.probabilities];
    assert.equal(result.decision, selected < recording.settings.threshold ? "review" : result.choice);
  }
  assert.doesNotMatch(JSON.stringify(recording), /sk-or-|Bearer |OPENROUTER_API_KEY|JEV_ACCESS_TOKEN|JEV_APP_PASSWORD|accessToken|authorization/i);
});

test("recording request projection excludes truth and proposed groups follow accepted match links", () => {
  const request = { ...recording.settings, mode: "live", pairs: candidatePairs(recording.collection.records, recording.candidates.slice(0, 20)) } as ResolveRequest;
  const projected = JSON.stringify(buildJevRequest(request));
  assert.doesNotMatch(projected, /"(?:truth|expected|scenario|groupId)"/);
  for (const truth of Object.values(recording.collection.truth)) assert.ok(!projected.includes(truth));
  const results = recording.response.results as Resolution[];
  const groups = groupRecords(recording.collection.records, recording.candidates, results);
  const neighbors = new Map(recording.collection.records.map(record => [record.id, new Set<string>()]));
  const byId = new Map(results.map(result => [result.id, result]));
  for (const edge of recording.candidates) if (byId.get(edge.id)!.decision === "match") {
    neighbors.get(edge.leftId)!.add(edge.rightId); neighbors.get(edge.rightId)!.add(edge.leftId);
  }
  for (const group of groups) {
    const reached = new Set([group.recordIds[0]]);
    for (const id of reached) for (const neighbor of neighbors.get(id)!) reached.add(neighbor);
    assert.deepEqual([...reached].sort(), [...group.recordIds].sort());
    const reviewed = recording.candidates.filter(edge => byId.get(edge.id)!.decision === "review" && (reached.has(edge.leftId) || reached.has(edge.rightId)));
    for (const edge of reviewed) assert.ok(group.conflicts.includes(edge.id));
    if (reviewed.length) assert.equal(group.status, "review");
  }
  assert.deepEqual(groups.flatMap(group => group.recordIds).sort(), recording.collection.records.map(record => record.id).sort());
});
