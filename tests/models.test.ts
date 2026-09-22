import assert from "node:assert/strict";
import test from "node:test";
import { liveResolve, validateResolveRequest } from "../src/lib/jev";
import { generateDataset } from "../src/lib/lab";
import { GET } from "../src/app/api/config/route";

const request = (model: string) => ({
  mode: "live",
  pairs: generateDataset(20, 1).pairs.slice(0, 1),
  prompt: "Compare projects",
  fields: ["name"],
  threshold: 0.7,
  model,
});

test("only listed Jev models can reach resolution", () => {
  assert.ok(validateResolveRequest(request("typesafe/jev-1.13")));
  assert.ok(validateResolveRequest(request("~typesafe/jev-latest")));
  for (const model of [
    "",
    "some-provider/expensive-model",
    "typesafe/jev-latest",
    "typesafe/jev-invented",
  ]) {
    assert.equal(validateResolveRequest(request(model)), null);
  }
});

test("config exposes readiness only, without credentials or unused model settings", async () => {
  const config = await GET().json();
  assert.deepEqual(Object.keys(config).sort(), [
    "accessRequired",
    "configured",
  ]);
  assert.equal(typeof config.configured, "boolean");
  assert.equal(typeof config.accessRequired, "boolean");
});

test("provider model metadata must fit saved workspace validation", async (t) => {
  for (const model of ["", "x".repeat(201)]) {
    const mock = t.mock.method(globalThis, "fetch", async () =>
      Response.json({
        model,
        usage: { input_tokens: 1 },
        answers: {
          q0: {
            type: "choice",
            choice: "match",
            confidence: 1,
            probabilities: { match: 1, different: 0, review: 0 },
          },
        },
      }),
    );
    await assert.rejects(
      liveResolve(
        validateResolveRequest(request("~typesafe/jev-latest"))!,
        "test",
      ),
      /malformed/,
    );
    mock.mock.restore();
  }
});
