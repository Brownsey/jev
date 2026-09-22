import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/resolve/route";
import { generateDataset } from "../src/lib/lab";
import { demoResolve, liveResolve } from "../src/lib/jev";

const body = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  mode: "demo", pairs: generateDataset(20, 3).pairs.slice(0, 1), prompt: "Decide each pair.", fields: ["name", "address"], threshold: 0.7, model: "typesafe/jev-1.13", ...overrides,
});
const request = (value = body(), headers: HeadersInit = { origin: "http://localhost:3000" }) => new Request("http://localhost:3000/api/resolve", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: value });

test("demo route returns normalized results without truth", async () => {
  const response = await POST(request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mode, "demo");
  assert.equal(data.results.length, 1);
  assert.equal(typeof data.results[0].probabilities.match, "number");
});

test("route rejects cross-site and malformed bounded requests", async () => {
  assert.equal((await POST(request(body(), { origin: "https://evil.test" }))).status, 403);
  assert.equal((await POST(request(body({ fields: [] })))).status, 400);
  assert.equal((await POST(request(body({ pairs: Array.from({ length: 21 }, () => generateDataset(20, 4).pairs[0]) })))).status, 400);
});

test("route accepts browser origin using its Host header", async () => {
  const response = await POST(request(body(), { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }));
  assert.equal(response.status, 200);
});

test("live route reports missing provider key", async () => {
  const response = await POST(request(body({ mode: "live" })));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /configured/i);
});

test("live results use selected choice probability for review threshold", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: "typesafe/jev-1.13", usage: { input_tokens: 4, output_tokens: 1 }, answers: { q0: { type: "choice", choice: "match", confidence: 0.2, probabilities: { match: 0.9, different: 0.05, review: 0.05 } } } }));
  try {
    const output = await liveResolve({ mode: "live", pairs: generateDataset(20, 5).pairs.slice(0, 1), prompt: "Decide", fields: ["name"], threshold: 0.7, model: "typesafe/jev-1.13" }, "test");
    assert.equal(output.results[0].decision, "match");
  } finally { globalThis.fetch = originalFetch; }
});

test("demo raw choice and probabilities are threshold-invariant", () => {
  const pair = generateDataset(20, 27).pairs.find((item) => item.scenario === "synthetic clear negative")!;
  const fields = ["name", "address"] as const;
  const low = demoResolve([pair], [...fields], 0)[0];
  const high = demoResolve([pair], [...fields], 0.9)[0];
  assert.equal(low.choice, "different");
  assert.deepEqual(low.probabilities, high.probabilities);
  assert.equal(low.decision, "different");
  assert.equal(high.decision, "different");
});
