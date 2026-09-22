import assert from "node:assert/strict";
import test from "node:test";
import { buildJevRequest, generateDataset, summarize } from "../src/lib/lab";
import type { Pair, ResolveRequest, Resolution } from "../src/lib/types";

test("dataset is deterministic, bounded, and contains both countries", () => {
  const first = generateDataset(24, 17, "Mixed");
  assert.deepEqual(first, generateDataset(24, 17, "Mixed"));
  assert.equal(first.country, "Mixed");
  assert.equal(first.pairs.length, 24);
  assert.equal(new Set(first.pairs.map((pair) => pair.id)).size, 24);
  assert.ok(first.pairs.some((pair) => pair.left.country === "UK"));
  assert.ok(first.pairs.some((pair) => pair.left.country === "Germany"));
  assert.ok(first.pairs.some((pair) => pair.left.country === "Germany" && pair.expected === "match"));
  assert.throws(() => generateDataset(19, 1), /20/);
  assert.throws(() => generateDataset(501, 1), /500/);
});

test("dataset covers varied real-world project types and country positives", () => {
  const pairs = generateDataset(120, 42, "Mixed").pairs;
  assert.ok(new Set(pairs.map((pair) => pair.left.description)).size >= 12);
  assert.ok(pairs.some((pair) => pair.left.description.includes("office conversion")));
  assert.ok(pairs.some((pair) => pair.left.description.includes("Logistik")));
  assert.ok(pairs.some((pair) => pair.left.country === "UK" && pair.expected === "match"));
  assert.ok(pairs.some((pair) => pair.left.country === "Germany" && pair.expected === "match"));
});

test("Jev payload excludes evaluation-only truth and uses pair IDs in instructions", () => {
  const pair = generateDataset(20, 9, "Germany").pairs[0];
  const request: ResolveRequest = { mode: "live", pairs: [pair], prompt: "Compare carefully.", fields: ["name", "address"], threshold: 0.7, model: "typesafe/jev-1.13" };
  const body = JSON.stringify(buildJevRequest(request));
  assert.match(body, new RegExp(pair.id));
  assert.doesNotMatch(body, /"expected"|"scenario"/);
});

test("summary keeps review out of correct outcomes and uses completed denominators", () => {
  const pairs = ["match", "different", "match"].map((expected, index) => ({
    id: `p-${index}`, expected, scenario: "test",
    left: { name: "A", description: "", address: "", postcode: "", city: "", country: "UK", developer: "", reference: "" },
    right: { name: "B", description: "", address: "", postcode: "", city: "", country: "UK", developer: "", reference: "" },
  })) as Pair[];
  const result = (id: string, choice: Resolution["choice"]): Resolution => ({ id, decision: choice, choice, confidence: 0.8, probabilities: { match: 0.8, different: 0.1, review: 0.1 } });
  assert.deepEqual(summarize(pairs, [result("p-0", "match"), result("p-1", "review")]), {
    total: 3, completed: 2, matched: 1, different: 0, review: 1, correct: 1,
    accuracy: 0.5, precision: 1, recall: 1, coverage: 0.5,
  });
});
