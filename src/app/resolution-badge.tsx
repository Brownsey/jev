"use client";

import type { Resolution } from "../lib/types";

type Status = "resolved" | "review" | "demo" | "pending";

export function resolutionStatus(
  result: Resolution | undefined,
  mode: "demo" | "live",
): Status {
  if (!result) return "pending";
  if (mode === "demo") return "demo";
  return result.decision === "review" ? "review" : "resolved";
}

export function ResolutionBadge({
  result,
  mode,
}: {
  result?: Resolution;
  mode: "demo" | "live";
}) {
  const status = resolutionStatus(result, mode);
  const label =
    status === "pending"
      ? "Not run with Jev"
      : status === "demo"
        ? "Demo only"
        : status === "review"
          ? "Jev: needs review"
          : `Jev: ${result?.decision}`;

  return (
    <span className={`decision ${status} ${status === "resolved" ? result?.decision : ""}`}>
      {label}
    </span>
  );
}
