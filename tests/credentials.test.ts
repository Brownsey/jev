import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/config/route";
import { POST } from "../src/app/api/resolve/route";
import { generateDataset } from "../src/lib/lab";

test("provider alias stays server-only and the separate app password authorizes live runs", async (t) => {
  const names = ["VERCEL", "OPENROUTER_API_KEY", "JEV_ACCESS_TOKEN", "JEV_APP_PASSWORD"];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, index) => {
    if (previous[index] === undefined) delete process.env[name];
    else process.env[name] = previous[index];
  }));
  process.env.VERCEL = "1";
  delete process.env.OPENROUTER_API_KEY;
  process.env.JEV_ACCESS_TOKEN = "fake-provider-key";
  process.env.JEV_APP_PASSWORD = "test-app-password";
  assert.deepEqual(await GET().json(), { configured: true, accessRequired: true });
  const request = (password?: string) => new Request("https://demo.test/api/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", ...(password ? { authorization: `Bearer ${password}` } : {}) },
    body: JSON.stringify({ mode: "live", pairs: generateDataset(20, 3).pairs.slice(0, 1), fields: ["name"], prompt: "Resolve", threshold: 0.7, model: "typesafe/jev-1.13" }),
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${process.env.OPENROUTER_API_KEY || "fake-provider-key"}`);
    return Response.json({ model: "typesafe/jev-1.13", usage: { input_tokens: 1 }, answers: { q0: { type: "choice", choice: "match", confidence: 0.8, probabilities: { match: 0.8, different: 0.1, review: 0.1 } } } });
  });
  for (const password of [undefined, "wrong", "fake-provider-key"])
    assert.equal((await POST(request(password))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await POST(request("test-app-password"))).status, 200);
  process.env.OPENROUTER_API_KEY = "canonical-provider-key";
  assert.equal((await POST(request("test-app-password"))).status, 200);
  assert.equal(calls, 2);
  delete process.env.JEV_APP_PASSWORD;
  assert.equal((await POST(request("fake-provider-key"))).status, 503);
});
