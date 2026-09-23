import type {
  Decision,
  Pair,
  Resolution,
  ResolveRequest,
  ResolveResponse,
} from "./types";
import { buildJevRequest, FIELDS } from "./lab";
import { isJevModel } from "./models";

const choices: Decision[] = ["match", "different", "review"];
const validFields = new Set<string>(FIELDS.map(({ key }) => key));
const isDecision = (value: unknown): value is Decision =>
  typeof value === "string" && choices.includes(value as Decision);
const clamp = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1
    ? value
    : null;

const folded = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const phaseKey = (value: string) =>
  folded(value).replace(
    /\b(?:phase|ph|bauabschnitt|bauabschn|ba)\s*(\d+)\b/g,
    "phase $1",
  );
const addressKey = (value: string) =>
  folded(value)
    .replace(/(?:strasse|str)\b/g, " street")
    .replace(/\b(?:st|street)\b/g, "street")
    .replace(/\s+/g, " ")
    .trim();
const countryKey = (value: string) => {
  const key = folded(value).replace(/\s/g, "");
  if (["uk", "gb", "greatbritain", "unitedkingdom"].includes(key)) return "uk";
  if (["de", "deutschland", "germany"].includes(key)) return "de";
  return key;
};
const cityKey = (value: string) =>
  folded(
    value
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue"),
  );
const fieldKey = (field: ResolveRequest["fields"][number], value: string) => {
  if (field === "address") return addressKey(value);
  if (field === "name" || field === "description") return phaseKey(value);
  if (field === "country") return countryKey(value);
  if (field === "city") return cityKey(value);
  if (field === "postcode") return folded(value).replace(/\s/g, "");
  return folded(value);
};
const phases = (values: string[]) => new Set(
  values.flatMap((value) => [...phaseKey(value).matchAll(/\bphase (\d+)\b/g)].map(match => match[1])),
);
const house = (value: string) => addressKey(value).match(/\b\d+[a-z]?\b/)?.[0];
const withinTwoEdits = (left: string, right: string) => {
  if (Math.abs(left.length - right.length) > 2) return false;
  let previous = new Map<number, number>(
    Array.from({ length: Math.min(2, right.length) + 1 }, (_, index) => [index, index]),
  );
  for (let row = 1; row <= left.length; row++) {
    const current = new Map<number, number>();
    for (let column = Math.max(0, row - 2); column <= Math.min(right.length, row + 2); column++)
      current.set(column, Math.min(
        (current.get(column - 1) ?? Infinity) + 1,
        (previous.get(column) ?? Infinity) + 1,
        (previous.get(column - 1) ?? Infinity) +
          (left[row - 1] === right[column - 1] ? 0 : 1),
      ));
    previous = current;
  }
  return (previous.get(right.length) ?? Infinity) <= 2;
};

const simulatedChoice = (
  pair: Pair,
  fields: ResolveRequest["fields"],
): Decision => {
  const selected = new Set(fields);
  const key = (side: "left" | "right", field: ResolveRequest["fields"][number]) =>
    fieldKey(field, pair[side][field]);
  const both = (field: ResolveRequest["fields"][number]) => {
    const left = key("left", field);
    const right = key("right", field);
    return left && right ? [left, right] : null;
  };
  const conflicts = (field: ResolveRequest["fields"][number]) => {
    const values = selected.has(field) ? both(field) : null;
    return !!values && values[0] !== values[1];
  };

  if (conflicts("reference") || conflicts("country")) return "different";
  const addresses = selected.has("address") ? both("address") : null;
  if (addresses) {
    const leftHouse = house(addresses[0]);
    const rightHouse = house(addresses[1]);
    if (leftHouse && rightHouse && leftHouse !== rightHouse) return "different";
  }
  const phaseFields = fields.filter(
    (field) => field === "name" || field === "description",
  );
  const leftPhases = phases(phaseFields.map((field) => pair.left[field]));
  const rightPhases = phases(phaseFields.map((field) => pair.right[field]));
  if (leftPhases.size > 1 || rightPhases.size > 1) return "review";
  if (leftPhases.size && rightPhases.size && [...leftPhases][0] !== [...rightPhases][0]) return "different";
  if (
    (addresses && addresses[0] !== addresses[1]) ||
    conflicts("postcode") ||
    conflicts("city")
  )
    return "review";

  const reference = selected.has("reference") ? both("reference") : null;
  if (reference && reference[0] === reference[1]) return "match";
  const names = selected.has("name") ? both("name") : null;
  const sameAddress = !!addresses && addresses[0] === addresses[1];
  const similarName =
    !!names &&
    (names[0] === names[1] ||
      (sameAddress &&
        Math.max(names[0].length, names[1].length) >= 6 &&
        withinTwoEdits(names[0], names[1])));
  if (similarName && sameAddress) return "match";
  const postcodes = selected.has("postcode") ? both("postcode") : null;
  if (similarName && postcodes && postcodes[0] === postcodes[1]) return "match";
  return "review";
};

export const demoResolve = (
  pairs: Pair[],
  fields: ResolveRequest["fields"],
  threshold: number,
): Resolution[] =>
  pairs.map((pair) => {
    const choice = simulatedChoice(pair, fields);
    const probabilities =
      choice === "match"
        ? { match: 0.9, different: 0.04, review: 0.06 }
        : choice === "different"
          ? { match: 0.04, different: 0.9, review: 0.06 }
          : { match: 0.15, different: 0.2, review: 0.65 };
    const confidence = probabilities[choice];
    return {
      id: pair.id,
      choice,
      decision:
        choice === "review" || confidence < threshold ? "review" : choice,
      confidence,
      probabilities,
    };
  });

export function validateResolveRequest(input: unknown): ResolveRequest | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (
    (value.mode !== "demo" && value.mode !== "live") ||
    typeof value.prompt !== "string" ||
    value.prompt.length > 8000 ||
    typeof value.model !== "string" ||
    value.model.length > 200 ||
    typeof value.threshold !== "number" ||
    value.threshold < 0 ||
    value.threshold > 1 ||
    !Array.isArray(value.fields) ||
    !value.fields.length ||
    !Array.isArray(value.pairs) ||
    !value.pairs.length ||
    value.pairs.length > 20
  )
    return null;
  if (
    !Number.isFinite(value.threshold) ||
    new Set(value.fields).size !== value.fields.length
  )
    return null;
  if (!isJevModel(value.model as string)) return null;
  if (
    !value.fields.every(
      (field) => typeof field === "string" && validFields.has(field),
    )
  )
    return null;
  const ids = new Set<string>();
  for (const pair of value.pairs) {
    const p = pair as Pair;
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      !p.left ||
      !p.right
    )
      return null;
    ids.add(p.id);
    for (const side of [p.left, p.right])
      for (const field of validFields)
        if (
          typeof side[field as keyof typeof side] !== "string" ||
          side[field as keyof typeof side].length > 2000
        )
          return null;
  }
  return value as ResolveRequest;
}

export async function liveResolve(
  request: ResolveRequest,
  apiKey: string,
): Promise<Omit<ResolveResponse, "mode" | "elapsedMs">> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Provider timeout", "TimeoutError")),
    25000,
  );
  try {
    const response = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildJevRequest(request)),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error("provider");
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    const value: unknown = await response.json();
    const data = value as {
      answers?: Record<string, unknown>;
      usage?: { input_tokens?: unknown; cost?: unknown };
      model?: unknown;
    };
    if (
      !data.answers ||
      typeof data.model !== "string" ||
      !data.model.length ||
      data.model.length > 200 ||
      !data.usage ||
      typeof data.usage.input_tokens !== "number" ||
      !Number.isInteger(data.usage.input_tokens) ||
      data.usage.input_tokens < 0 ||
      (data.usage.cost !== undefined &&
        (typeof data.usage.cost !== "number" ||
          !Number.isFinite(data.usage.cost) ||
          data.usage.cost < 0))
    )
      throw new Error("malformed");
    const inputTokens = data.usage.input_tokens as number;
    const cost = data.usage.cost as number | undefined;
    const results = request.pairs.map((pair, index) => {
      const answer = data.answers![`q${index}`] as {
        type?: unknown;
        choice?: unknown;
        confidence?: unknown;
        probabilities?: Record<string, unknown>;
      };
      if (
        !answer ||
        answer.type !== "choice" ||
        !isDecision(answer.choice) ||
        !answer.probabilities
      )
        throw new Error("malformed");
      const probabilities = Object.fromEntries(
        choices.map((choice) => [choice, clamp(answer.probabilities![choice])]),
      ) as Record<Decision, number | null>;
      if (
        choices.some((choice) => probabilities[choice] === null) ||
        clamp(answer.confidence) === null
      )
        throw new Error("malformed");
      const selected = answer.choice as Decision;
      const normalized = probabilities as Record<Decision, number>;
      if (
        Math.abs(
          choices.reduce((sum, choice) => sum + normalized[choice], 0) - 1,
        ) > 0.001 ||
        choices.some(
          (choice) => normalized[choice] > normalized[selected] + 0.000001,
        )
      )
        throw new Error("malformed");
      const selectedProbability = normalized[selected];
      const confidence = answer.confidence as number;
      return {
        id: pair.id,
        choice: selected,
        decision:
          selectedProbability >= request.threshold ? selected : "review",
        confidence,
        probabilities: normalized,
      };
    });
    return { results, inputTokens, cost: cost ?? null, model: data.model };
  } finally {
    clearTimeout(timer);
  }
}
