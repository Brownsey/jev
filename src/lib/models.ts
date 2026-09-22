// OpenRouter's TypeSafe listing, verified 2026-09-22.
// Jev uses /api/alpha/decisions and is absent from the general chat-model catalog.
export const JEV_MODELS = [
  { id: "typesafe/jev-1.13", label: "Jev 1.13" },
  { id: "~typesafe/jev-latest", label: "Jev Latest (latest version)" },
] as const;

export function isJevModel(value: string): boolean {
  return JEV_MODELS.some(({ id }) => id === value);
}
