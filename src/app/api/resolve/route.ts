import { NextResponse } from "next/server";
import {
  demoResolve,
  liveResolve,
  validateResolveRequest,
} from "../../../lib/jev";

const error = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });
const hosted = () =>
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host");
  const parsedUrl = new URL(request.url);
  const protocol =
    process.env.VERCEL && request.headers.get("x-forwarded-proto") === "https"
      ? "https:"
      : parsedUrl.protocol;
  const expectedOrigin = host ? `${protocol}//${host}` : parsedUrl.origin;
  if ((origin && origin !== expectedOrigin) || site === "cross-site")
    return error("Cross-site requests are not allowed.", 403);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 150000)
    return error("Request is too large.", 400);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = "",
    size = 0,
    input: unknown;
  try {
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150000) {
        await reader.cancel();
        return error("Request is too large.", 400);
      }
      raw += decoder.decode(value, { stream: true });
    }
    input = JSON.parse(raw + decoder.decode());
  } catch {
    return error("Invalid request.", 400);
  } finally {
    reader?.releaseLock();
  }
  const parsed = validateResolveRequest(input);
  if (!parsed) return error("Invalid request.", 400);
  const accessToken = process.env.JEV_ACCESS_TOKEN;
  const started = Date.now();
  if (parsed.mode === "demo")
    return NextResponse.json({
      results: demoResolve(parsed.pairs, parsed.fields, parsed.threshold),
      mode: "demo",
      elapsedMs: Date.now() - started,
      inputTokens: null,
      cost: null,
      model: parsed.model,
    });
  if (
    accessToken &&
    request.headers.get("authorization") !== `Bearer ${accessToken}`
  )
    return error("Authorization required.", 401);
  if (hosted() && !accessToken)
    return error("Live access is not configured.", 503);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return error("Live provider is not configured.", 503);
  try {
    const result = await liveResolve(parsed, apiKey);
    return NextResponse.json({
      ...result,
      mode: "live",
      elapsedMs: Date.now() - started,
    });
  } catch (cause) {
    if (
      cause instanceof DOMException &&
      (cause.name === "AbortError" || cause.name === "TimeoutError")
    )
      return error("Provider timed out.", 504);
    const status = (cause as { status?: number }).status;
    if (status === 401 || status === 402 || status === 403)
      return error("Provider authentication or credit issue.", 502);
    if (status === 429) return error("Provider rate limit reached.", 502);
    return error("Provider returned an invalid response.", 502);
  }
}
