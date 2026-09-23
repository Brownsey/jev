import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/resolve/route";
import { generateDataset, DEFAULT_MODEL } from "../src/lib/lab";
import { validateResolveRequest } from "../src/lib/jev";

const fixture = () => ({
  mode: "demo",
  pairs: generateDataset(20, 73, "Germany").pairs.slice(0, 1),
  fields: ["name", "address"],
  prompt: "Compare these projects",
  model: DEFAULT_MODEL,
  threshold: 0.7,
});
const streamed = (stream: ReadableStream<Uint8Array>) =>
  new Request("http://localhost:3000/api/resolve", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: stream,
    duplex: "half",
  } as RequestInit);

test("comparison fields must be unique and thresholds finite", () => {
  assert.equal(
    validateResolveRequest({ ...fixture(), fields: ["name", "name"] }),
    null,
  );
  assert.equal(validateResolveRequest({ ...fixture(), threshold: NaN }), null);
});

test("streamed UTF-8 preserves German fields across byte boundaries", async () => {
  const input = fixture();
  input.fields = ["reference"];
  // The first multibyte character is in the left reference. A broken streaming
  // decoder corrupts it while the right reference stays intact, preventing a match.
  input.pairs[0].left = {
    name: "Project", description: "", address: "1 Road", postcode: "10115",
    city: "Berlin", country: "Germany", developer: "Build", reference: "GRÜN-123",
  };
  input.pairs[0].right = { ...input.pairs[0].left };
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const split = bytes.findIndex((byte) => byte >= 128) + 1;
  const response = await POST(
    streamed(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, split));
          controller.enqueue(bytes.slice(split));
          controller.close();
        },
      }),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].decision, "match");
});

test("unreadable request streams return a controlled client error", async () => {
  const response = await POST(
    streamed(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("stream disconnected"));
        },
      }),
    ),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request." });
});

test("streamed byte limit counts multibyte characters without content-length", async () => {
  let cancelled = false;
  const response = await POST(
    streamed(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("ü".repeat(75001)));
        },
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(cancelled, true);
});
