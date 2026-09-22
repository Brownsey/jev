import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/resolve/route";
import { DEFAULT_MODEL, generateDataset } from "../src/lib/lab";

const payload = () => ({
  mode: "demo", model: DEFAULT_MODEL,
  pairs: generateDataset(20, 902, "Germany").pairs.slice(0, 1),
  fields: ["name"], prompt: "Compare records.", threshold: 0.7,
  padding: "",
});

const request = (body: ReadableStream<Uint8Array>) => new Request(
  "http://localhost:3000/api/resolve",
  {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-length": "1" },
    body,
    duplex: "half",
  } as RequestInit,
);

test("independent: exact byte limit succeeds and next byte cancels despite understated header", async () => {
  for (const length of [150000, 150001]) {
    const input = payload();
    input.padding = "x".repeat(length - new TextEncoder().encode(JSON.stringify(input)).length);
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    assert.equal(bytes.length, length);
    let offset = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset + 17003));
        offset = Math.min(bytes.length, offset + 17003);
      },
      cancel() { cancelled = true; },
    });
    const response = await POST(request(stream));
    assert.equal(response.status, length === 150000 ? 200 : 400);
    assert.equal(stream.locked, false);
    if (length === 150000) {
      assert.equal((await response.json()).results.length, 1);
      assert.equal(cancelled, false);
    } else {
      assert.deepEqual(await response.json(), { error: "Request is too large." });
      assert.equal(cancelled, true);
    }
  }
});

test("independent: malformed and interrupted streams release locks without exposing errors", async () => {
  for (const interrupted of [false, true]) {
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode('{"mode":'));
        } else if (interrupted) {
          controller.error(new Error("private transport detail"));
        } else {
          controller.close();
        }
      },
    });
    const response = await POST(request(stream));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request." });
    assert.equal(stream.locked, false);
  }
});
