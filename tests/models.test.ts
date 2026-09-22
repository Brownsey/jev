import assert from "node:assert/strict";
import test from "node:test";
import { validateResolveRequest } from "../src/lib/jev";
import { generateDataset, DEFAULT_MODEL } from "../src/lib/lab";
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

test("config never advertises an unsupported default model", async () => {
  const before = process.env.JEV_MODEL;
  try {
    process.env.JEV_MODEL = "unsupported-model";
    assert.equal((await GET().json()).model, DEFAULT_MODEL);
    process.env.JEV_MODEL = "~typesafe/jev-latest";
    assert.equal((await GET().json()).model, "~typesafe/jev-latest");
  } finally {
    if (before === undefined) delete process.env.JEV_MODEL;
    else process.env.JEV_MODEL = before;
  }
});
