import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/config/route";
import { POST } from "../src/app/api/resolve/route";
import { generateDataset } from "../src/lib/lab";

test("validation: provider fallback never authorizes live and canonical key wins", async (t) => {
  const names = ["VERCEL", "OPENROUTER_API_KEY", "JEV_ACCESS_TOKEN", "JEV_APP_PASSWORD"];
  const before = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => before[i] === undefined ? delete process.env[name] : process.env[name] = before[i]));
  process.env.VERCEL = "1"; process.env.JEV_ACCESS_TOKEN = "synthetic-provider-fallback"; process.env.JEV_APP_PASSWORD = "synthetic-app-password"; delete process.env.OPENROUTER_API_KEY;
  const payload = JSON.stringify({ mode: "live", pairs: generateDataset(20, 8).pairs.slice(0, 1), prompt: "x", fields: ["name"], threshold: .7, model: "typesafe/jev-1.13" });
  const request = (password?: string) => new Request("https://local.test/api/resolve", { method: "POST", headers: { "content-type": "application/json", ...(password ? { authorization: `Bearer ${password}` } : {}) }, body: payload });
  let upstream = 0;
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => { upstream++; assert.equal(new Headers(init?.headers).get("authorization"), "Bearer canonical"); return Response.json({ model: "m", usage: { input_tokens: 1 }, answers: { q0: { type: "choice", choice: "match", confidence: .9, probabilities: { match: .9, different: .05, review: .05 } } } }); });
  assert.deepEqual(await GET().json(), { configured: true, accessRequired: true });
  for (const value of [undefined, "wrong", "synthetic-provider-fallback"]) assert.equal((await POST(request(value))).status, 401);
  assert.equal(upstream, 0);
  process.env.OPENROUTER_API_KEY = "canonical";
  assert.equal((await POST(request("synthetic-app-password"))).status, 200);
  assert.equal(upstream, 1);
  delete process.env.JEV_APP_PASSWORD;
  assert.equal((await POST(request("synthetic-provider-fallback"))).status, 503);
});
