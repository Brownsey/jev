import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/resolve/route";
import { buildJevRequest, generateDataset, summarize } from "../src/lib/lab";
import { demoResolve, liveResolve } from "../src/lib/jev";
import type { ResolveRequest, Resolution } from "../src/lib/types";

const input = (overrides: Partial<ResolveRequest> = {}): ResolveRequest => ({ mode: "demo", pairs: generateDataset(20, 123).pairs.slice(0, 1), fields: ["name", "address"], prompt: "Resolve.", threshold: .7, model: "typesafe/jev-1.13", ...overrides });
const request = (body: unknown = input(), headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/resolve", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("validation: seeded UK and Germany data include duplicates and all negative scenarios", () => {
  for (const country of ["UK", "Germany", "Mixed"] as const) {
    const dataset = generateDataset(500, 9876, country);
    assert.deepEqual(dataset, generateDataset(500, 9876, country));
    assert.equal(new Set(dataset.pairs.map(pair => pair.id)).size, 500);
    for (const locale of country === "Mixed" ? ["UK", "Germany"] : [country]) {
      const pairs = dataset.pairs.filter(pair => pair.left.country === locale);
      assert.equal(new Set(pairs.map(pair => pair.scenario)).size, 4);
      assert.ok(pairs.some(pair => pair.expected === "match"));
      assert.ok(pairs.some(pair => pair.expected === "different"));
      assert.ok(pairs.every(pair => pair.right.country === locale));
      if (locale === "Germany") assert.ok(pairs.every(pair => /^\d{5}$/.test(pair.left.postcode)));
      for (const pair of pairs.filter(pair => pair.scenario.includes("neighbouring"))) assert.notEqual(pair.left.address.match(/\d+/)?.[0], pair.right.address.match(/\d+/)?.[0]);
      for (const pair of pairs.filter(pair => pair.expected === "match")) assert.equal(pair.left.reference, pair.right.reference);
    }
  }
});

test("validation: selected fields only, evaluation mutation cannot affect demo", () => {
  const original = input();
  const changed = structuredClone(original);
  changed.pairs[0].expected = original.pairs[0].expected === "match" ? "different" : "match";
  changed.pairs[0].scenario = "private truth marker";
  assert.deepEqual(demoResolve(original.pairs, original.fields, original.threshold), demoResolve(changed.pairs, changed.fields, changed.threshold));
  const payload = buildJevRequest(changed) as { state: { left: object; right: object }[] };
  assert.deepEqual(Object.keys(payload.state[0].left).sort(), ["address", "name"]);
  assert.deepEqual(Object.keys(payload.state[0].right).sort(), ["address", "name"]);
  assert.doesNotMatch(JSON.stringify(payload), /private truth marker|expected|scenario|threshold/);
});

test("validation: metrics use completed truth, reviewed positives reduce recall", () => {
  const pairs = generateDataset(20, 123).pairs.slice(0, 4).map((pair, i) => ({ ...pair, expected: i < 2 ? "match" as const : "different" as const }));
  const results = ["match", "review", "match"].map((decision, i) => ({ id: pairs[i].id, decision, choice: decision, confidence: .8, probabilities: { match: .8, different: .1, review: .1 } })) as Resolution[];
  const actual = summarize(pairs, results);
  assert.equal(actual.completed, 3); assert.equal(actual.correct, 1); assert.equal(actual.accuracy, 1 / 3);
  assert.equal(actual.precision, .5); assert.equal(actual.recall, .5); assert.equal(actual.coverage, 2 / 3);
  assert.equal(summarize(pairs, []).accuracy, null);
});

test("validation: server rejects malformed and oversized requests at boundary", async () => {
  const duplicate = input(); duplicate.pairs.push(duplicate.pairs[0]);
  const oversizedField = input(); oversizedField.pairs[0].left.name = "a".repeat(2001);
  const cases: unknown[] = ["{", null, [], { ...input(), mode: "fake" }, { ...input(), threshold: 1.01 }, { ...input(), fields: [] }, { ...input(), fields: ["expected"] }, { ...input(), prompt: "x".repeat(8001) }, duplicate, oversizedField];
  for (const value of cases) assert.equal((await POST(request(value))).status, 400);
  assert.equal((await POST(request(input(), { "content-length": "150001" }))).status, 400);
  // Real encoded byte count, independent of content-length (UTF-8 uses three bytes per character).
  assert.equal((await POST(request(JSON.stringify({ padding: "€".repeat(50001) })))).status, 400);
});

test("validation: empty resolution batches are rejected", async () => {
  assert.equal((await POST(request(input({ pairs: [] })))).status, 400);
});

test("validation: cross-site browser requests rejected, alternate same host accepted", async () => {
  assert.equal((await POST(request(input(), { origin: "https://attacker.example" }))).status, 403);
  assert.equal((await POST(request(input(), { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await POST(request(input(), { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "sec-fetch-site": "same-origin" }))).status, 200);
});

test("validation: hosted live requires owner token; demo needs no token", async (t) => {
  const before = { VERCEL: process.env.VERCEL, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, JEV_APP_PASSWORD: process.env.JEV_APP_PASSWORD };
  t.after(() => { for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  process.env.VERCEL = "1"; process.env.OPENROUTER_API_KEY = "validation-provider-secret"; delete process.env.JEV_APP_PASSWORD;
  assert.equal((await POST(request(input({ mode: "live" })))).status, 503);
  process.env.JEV_APP_PASSWORD = "validation-owner-secret";
  assert.equal((await POST(request(input()))).status, 200);
  assert.equal((await POST(request(input({ mode: "live" })))).status, 401);
  assert.equal((await POST(request(input({ mode: "live" }), { authorization: "Bearer incorrect" }))).status, 401);
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => { fetchCount++; return new Response("upstream provider-secret", { status: 429 }); });
  const response = await POST(request(input({ mode: "live" }), { authorization: "Bearer validation-owner-secret" }));
  assert.equal(response.status, 502); assert.equal(fetchCount, 1);
  assert.match((await response.json()).error, /rate limit/i);
});

test("validation: live error mapping stays safe for auth, credit, rate, network and timeout", async (t) => {
  const before = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, JEV_APP_PASSWORD: process.env.JEV_APP_PASSWORD };
  t.after(() => { for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  process.env.OPENROUTER_API_KEY = "validation-secret"; process.env.JEV_APP_PASSWORD = "validation-owner";
  for (const status of [401, 402, 403, 429, 500]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => new Response("raw validation-secret", { status }));
    const response = await POST(request(input({ mode: "live" }), { authorization: "Bearer validation-owner" }));
    assert.equal(response.status, 502); assert.doesNotMatch(JSON.stringify(await response.json()), /validation-secret|raw/); mocked.mock.restore();
  }
  for (const [error, status] of [[new TypeError("network validation-secret"), 502], [new DOMException("secret timeout", "TimeoutError"), 504]] as const) {
    const mocked = t.mock.method(globalThis, "fetch", async () => { throw error; });
    const response = await POST(request(input({ mode: "live" }), { authorization: "Bearer validation-owner" }));
    assert.equal(response.status, status); assert.doesNotMatch(JSON.stringify(await response.json()), /validation-secret|secret timeout/); mocked.mock.restore();
  }
});

test("validation: provider confidence remains distinct from review probability", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
    assert.equal(options?.method, "POST");
    const sent = JSON.parse(options?.body as string);
    assert.equal(sent.model, "typesafe/jev-1.13");
    assert.deepEqual(Object.keys(sent.state[0].left).sort(), ["address", "name"]);
    assert.doesNotMatch(options?.body as string, /expected|scenario|fake-validation-key/);
    return Response.json({ model: "typesafe/jev-1.13", usage: { input_tokens: 3 }, answers: { q0: { type: "choice", choice: "match", confidence: .2, probabilities: { match: .9, different: .05, review: .05 } } } });
  });
  const result = await liveResolve(input({ mode: "live" }), "fake-validation-key");
  assert.equal(result.results[0].decision, "match");
  assert.equal(result.results[0].confidence, .2);
  assert.equal(result.cost, null);
});

test("validation: malformed provider answers and usage never become success", async (t) => {
  const valid = { model: "typesafe/jev-1.13", usage: { input_tokens: 3, cost: .01 }, answers: { q0: { type: "choice", choice: "match", confidence: .5, probabilities: { match: .7, different: .2, review: .1 } } } };
  const missing = structuredClone(valid); delete (missing.answers as Record<string, unknown>).q0;
  const badSum = structuredClone(valid); badSum.answers.q0.probabilities.match = .9;
  const badChoice = structuredClone(valid); badChoice.answers.q0.choice = "review";
  const badTokens = structuredClone(valid); badTokens.usage.input_tokens = -1;
  const badCost = structuredClone(valid); badCost.usage.cost = -1;
  for (const [label, payload] of Object.entries({ null: null, missing, badSum, badChoice, badTokens, badCost })) {
    const mocked = t.mock.method(globalThis, "fetch", async () => Response.json(payload));
    await assert.rejects(liveResolve(input({ mode: "live" }), "fake-validation-key"), label);
    mocked.mock.restore();
  }
});
