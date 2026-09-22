import type { Decision, Pair, Resolution, ResolveRequest, ResolveResponse } from "./types";
import { buildJevRequest } from "./lab";
import { isJevModel } from "./models";

const choices: Decision[] = ["match", "different", "review"];
const isDecision = (value: unknown): value is Decision => typeof value === "string" && choices.includes(value as Decision);
const clamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
export const demoResolve = (pairs: Pair[], fields: ResolveRequest["fields"], threshold: number): Resolution[] => pairs.map((pair) => {
  const equal = fields.filter((field) => pair.left[field].trim().toLowerCase() === pair.right[field].trim().toLowerCase()).length;
  const score = fields.length ? equal / fields.length : 0;
  const probabilities = { match: score, different: 1 - score, review: 0 };
  const choice: Decision = score > 0.5 ? "match" : "different";
  const confidence = probabilities[choice]; return { id: pair.id, choice, decision: confidence >= threshold ? choice : "review", confidence, probabilities };
});

export function validateResolveRequest(input: unknown): ResolveRequest | null {
  if (!input || typeof input !== "object") return null; const value = input as Record<string, unknown>;
  if ((value.mode !== "demo" && value.mode !== "live") || typeof value.prompt !== "string" || value.prompt.length > 8000 || typeof value.model !== "string" || value.model.length > 200 || typeof value.threshold !== "number" || value.threshold < 0 || value.threshold > 1 || !Array.isArray(value.fields) || !value.fields.length || !Array.isArray(value.pairs) || !value.pairs.length || value.pairs.length > 20) return null;
  const validFields = new Set(["name", "description", "address", "postcode", "city", "country", "developer", "reference"]);
  if (!isJevModel(value.model as string)) return null;
  if (!value.fields.every((field) => typeof field === "string" && validFields.has(field))) return null;
  const ids = new Set<string>();
  for (const pair of value.pairs) { const p = pair as Pair; if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || !p.left || !p.right) return null; ids.add(p.id); for (const side of [p.left, p.right]) for (const field of validFields) if (typeof side[field as keyof typeof side] !== "string" || side[field as keyof typeof side].length > 2000) return null; }
  return value as ResolveRequest;
}

export async function liveResolve(request: ResolveRequest, apiKey: string): Promise<Omit<ResolveResponse, "mode" | "elapsedMs">> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(new DOMException("Provider timeout", "TimeoutError")), 25000);
  try {
    const response = await fetch("https://openrouter.ai/api/alpha/decisions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(buildJevRequest(request)), signal: controller.signal });
    if (!response.ok) { const error = new Error("provider"); (error as Error & { status?: number }).status = response.status; throw error; }
    const value: unknown = await response.json(); const data = value as { answers?: Record<string, unknown>; usage?: { input_tokens?: unknown; cost?: unknown }; model?: unknown };
    if (!data.answers || typeof data.model !== "string" || !data.usage || typeof data.usage.input_tokens !== "number" || !Number.isInteger(data.usage.input_tokens) || data.usage.input_tokens < 0 || (data.usage.cost !== undefined && (typeof data.usage.cost !== "number" || !Number.isFinite(data.usage.cost) || data.usage.cost < 0))) throw new Error("malformed");
    const inputTokens = data.usage.input_tokens as number;
    const cost = data.usage.cost as number | undefined;
    const results = request.pairs.map((pair, index) => {
      const answer = data.answers![`q${index}`] as { type?: unknown; choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> };
      if (!answer || answer.type !== "choice" || !isDecision(answer.choice) || !answer.probabilities) throw new Error("malformed");
      const probabilities = Object.fromEntries(choices.map((choice) => [choice, clamp(answer.probabilities![choice])])) as Record<Decision, number | null>;
      if (choices.some((choice) => probabilities[choice] === null) || clamp(answer.confidence) === null) throw new Error("malformed");
      const selected = answer.choice as Decision; const normalized = probabilities as Record<Decision, number>;
      if (Math.abs(choices.reduce((sum, choice) => sum + normalized[choice], 0) - 1) > 0.001 || choices.some((choice) => normalized[choice] > normalized[selected] + 0.000001)) throw new Error("malformed");
      const selectedProbability = normalized[selected]; const confidence = answer.confidence as number;
      return { id: pair.id, choice: selected, decision: selectedProbability >= request.threshold ? selected : "review", confidence, probabilities: normalized };
    });
    return { results, inputTokens, cost: cost ?? null, model: data.model };
  } finally { clearTimeout(timer); }
}
