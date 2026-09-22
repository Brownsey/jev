import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/resolve/route";
import { generateDataset } from "../src/lib/lab";
import { liveResolve } from "../src/lib/jev";
import type { ResolveRequest } from "../src/lib/types";

const input = (model: string, mode: "demo" | "live" = "live"): ResolveRequest => ({
  mode, model, pairs: generateDataset(20, 981).pairs.slice(0, 1),
  fields: ["name"], prompt: "Compare projects.", threshold: 0.7,
});

test("model validation: HTTP boundary rejects unknown models before provider transport", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Provider transport must not run"); });
  for (const mode of ["live", "demo"] as const) {
    for (const model of ["typesafe/jev-latest", "typesafe/jev-1.13 ", "~typesafe/jev-latest?provider=other", "other/expensive", ""]) {
      const response = await POST(new Request("http://localhost:3000/api/resolve", {
        method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify(input(model, mode)),
      }));
      assert.equal(response.status, 400, `${mode}: ${model}`);
      assert.deepEqual(await response.json(), { error: "Invalid request." });
    }
  }
  assert.equal(calls, 0);
});

test("model validation: latest alias reaches the decisions adapter unchanged", async (t) => {
  let sent: { model: string } | undefined;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
    sent = JSON.parse(options?.body as string);
    return Response.json({ model: "typesafe/jev-1.13", usage: { input_tokens: 3 }, answers: {
      q0: { type: "choice", choice: "different", confidence: 0.8, probabilities: { match: 0.05, different: 0.9, review: 0.05 } },
    } });
  });
  const response = await liveResolve(input("~typesafe/jev-latest"), "fake-validation-key");
  assert.equal(sent?.model, "~typesafe/jev-latest");
  assert.equal(response.model, "typesafe/jev-1.13");
  assert.equal(response.results[0].decision, "different");
});
