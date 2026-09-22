"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FIELDS } from "../lib/lab";
import type { Dataset, Pair, Resolution } from "../lib/types";
import styles from "./dataset-explorer.module.css";

const PAGE_SIZE = 12;

type Status = "resolved" | "review" | "demo" | "pending";

export function resolutionStatus(result: Resolution | undefined, mode: "demo" | "live"): Status {
  if (!result) return "pending";
  if (mode === "demo") return "demo";
  return result.decision === "review" ? "review" : "resolved";
}

function statusLabel(status: Status, result?: Resolution) {
  if (status === "pending") return "Not run with Jev";
  if (status === "demo") return "Demo only";
  if (status === "review") return "Jev: needs review";
  return `Jev: ${result?.decision}`;
}

function StatusBadge({ status, result }: { status: Status; result?: Resolution }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{statusLabel(status, result)}</span>;
}

function readable(value: string) {
  return value.trim() || "Not provided";
}

function Bar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className={styles.barRow}>
      <div className={styles.barLabel}>
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
      <div
        className={styles.barTrack}
        role="progressbar"
        aria-label={`${label}: ${count} of ${total}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <span className={styles.barPercent}>{percent}%</span>
    </div>
  );
}

export default function DatasetExplorer({ dataset, results, mode }: { dataset: Dataset; results: Resolution[]; mode: "demo" | "live" }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<"All" | "UK" | "Germany">("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "resolved" | "unresolved" | "review" | "demo">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const comparisonRef = useRef<HTMLElement>(null);
  const pairs = dataset.pairs;
  const byId = useMemo(() => new Map(results.map((result) => [result.id, result])), [results]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      pairs.filter((pair) => {
        const searchable = [
          pair.id,
          pair.scenario,
          ...FIELDS.flatMap(({ key }) => [pair.left[key], pair.right[key]]),
        ]
          .join(" ")
          .toLowerCase();
        return (
          (country === "All" || pair.left.country === country) &&
          (statusFilter === "all" ||
            (statusFilter === "unresolved"
              ? resolutionStatus(byId.get(pair.id), mode) !== "resolved"
              : resolutionStatus(byId.get(pair.id), mode) === statusFilter)) &&
          searchable.includes(normalizedQuery)
        );
      }),
    [pairs, country, statusFilter, normalizedQuery, byId, mode],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visiblePairs = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selectedPair =
    visiblePairs.find((pair) => pair.id === selected) ??
    visiblePairs[0] ??
    null;
  const overview = useMemo(() => {
    const countryCounts = { UK: 0, Germany: 0 };
    const outcomeCounts = { match: 0, different: 0 };
    const scenarios: Record<string, number> = {};
    let filledFields = 0;
    for (const pair of pairs) {
      countryCounts[pair.left.country as "UK" | "Germany"] += 1;
      outcomeCounts[pair.expected] += 1;
      scenarios[pair.scenario] = (scenarios[pair.scenario] ?? 0) + 1;
      for (const { key } of FIELDS)
        filledFields +=
          Number(Boolean(pair.left[key].trim())) +
          Number(Boolean(pair.right[key].trim()));
    }
    return {
      countryCounts,
      outcomeCounts,
      scenarios,
      filledFields,
      totalFields: pairs.length * FIELDS.length * 2,
    };
  }, [pairs]);
  const counts = useMemo(() => {
    const next = { resolved: 0, review: 0, pending: 0, demo: 0 };
    for (const pair of pairs) next[resolutionStatus(byId.get(pair.id), mode)] += 1;
    return next;
  }, [pairs, byId, mode]);

  useEffect(() => {
    setPage(0);
  }, [query, country, statusFilter, dataset]);

  useEffect(() => {
    if (selected && !visiblePairs.some((pair) => pair.id === selected))
      setSelected(visiblePairs[0]?.id ?? null);
  }, [selected, visiblePairs]);

  function openPair(id: string) {
    setSelected(id);
    requestAnimationFrame(() => {
      comparisonRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      comparisonRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <details className={styles.explorer}>
      <summary>
        Explore dataset{" "}
        {pairs.length
          ? `· ${dataset.country} · ${pairs.length} pairs · seed ${dataset.seed}`
          : "· Generate pairs first"}
      </summary>
      {!pairs.length ? (
        <p className={styles.empty}>
          Generate pairs first to explore this dataset.
        </p>
      ) : (
        <div className={styles.content}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>read-only dataset view</p>
              <h2>Dataset explorer</h2>
            </div>
            <p className={styles.disclaimer}>
              Synthetic records for evaluation only. Expected outcomes are
              dataset labels, not model results.
            </p>
          </header>

          <section className={styles.overview} aria-label="Dataset overview">
            <div className={styles.statPanel}>
              <h3>Country coverage</h3>
              <Bar
                label="UK"
                count={overview.countryCounts.UK}
                total={pairs.length}
              />
              <Bar
                label="Germany"
                count={overview.countryCounts.Germany}
                total={pairs.length}
              />
            </div>
            <div className={styles.statPanel}>
              <h3>Expected answers</h3>
              <Bar
                label="Match"
                count={overview.outcomeCounts.match}
                total={pairs.length}
              />
              <Bar
                label="Different"
                count={overview.outcomeCounts.different}
                total={pairs.length}
              />
            </div>
            <div className={styles.statPanel}>
              <h3>Scenarios</h3>
              {Object.entries(overview.scenarios).map(([scenario, count]) => (
                <Bar
                  key={scenario}
                  label={scenario.replace("synthetic ", "")}
                  count={count}
                  total={pairs.length}
                />
              ))}
            </div>
            <div className={styles.statPanel}>
              <h3>Field completeness</h3>
              <Bar
                label="Provided fields"
                count={overview.filledFields}
                total={overview.totalFields}
              />
              <p className={styles.helper}>
                {overview.filledFields} of {overview.totalFields} values across
                both records and all 8 fields.
              </p>
            </div>
            <div className={styles.statPanel}>
              <h3>Resolution status</h3>
              <p className={styles.statusSummary}>Resolved by Jev: {counts.resolved}</p>
              <p className={styles.statusSummary}>Needs review: {counts.review}</p>
              <p className={styles.statusSummary}>Not run with Jev: {counts.pending}</p>
              <p className={styles.statusSummary}>Demo only: {counts.demo}</p>
            </div>
          </section>

          <section className={styles.browser} aria-label="Browse dataset pairs">
            <div className={styles.filters}>
              <label>
                Search dataset
                <input
                  aria-label="Search dataset"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID, scenario, or any field"
                />
              </label>
              <label>
                Filter dataset country
                <select
                  aria-label="Filter dataset country"
                  value={country}
                  onChange={(event) =>
                    setCountry(event.target.value as "All" | "UK" | "Germany")
                  }
                >
                  <option>All</option>
                  <option>UK</option>
                  <option>Germany</option>
                </select>
              </label>
              <label>
                Resolution status
                <select aria-label="Resolution status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">All pairs</option>
                  <option value="resolved">Resolved by Jev</option>
                  <option value="unresolved">Not resolved by Jev</option>
                  <option value="review">Needs review</option>
                  <option value="demo">Demo only</option>
                </select>
              </label>
              <p aria-live="polite">
                {filtered.length} of {pairs.length} pairs
              </p>
            </div>
            {!filtered.length ? (
              <p className={styles.empty}>
                No pairs match this search, country or resolution status.
              </p>
            ) : (
              <>
                <div className={styles.cards}>
                  {visiblePairs.map((pair) => (
                    <PairCard
                      key={pair.id}
                      pair={pair}
                      result={byId.get(pair.id)}
                      mode={mode}
                      active={selectedPair?.id === pair.id}
                      onOpen={() => openPair(pair.id)}
                    />
                  ))}
                </div>
                <nav
                  className={styles.pagination}
                  aria-label="Dataset pair pages"
                >
                  <button
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                    disabled={currentPage === 0}
                  >
                    Previous pairs
                  </button>
                  <span>
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <button
                    onClick={() =>
                      setPage((value) => Math.min(pageCount - 1, value + 1))
                    }
                    disabled={currentPage >= pageCount - 1}
                  >
                    Next pairs
                  </button>
                </nav>
              </>
            )}
          </section>

          {selectedPair && (
            <Comparison pair={selectedPair} result={byId.get(selectedPair.id)} mode={mode} comparisonRef={comparisonRef} />
          )}
        </div>
      )}
    </details>
  );
}

function PairCard({
  pair,
  result,
  mode,
  active,
  onOpen,
}: {
  pair: Pair;
  result?: Resolution;
  mode: "demo" | "live";
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={styles.card} data-active={active || undefined}>
      <div className={styles.cardTop}>
        <code>{pair.id}</code>
        <span className={`${styles.badge} ${styles[pair.expected]}`}>
          Expected {pair.expected}
        </span>
        <StatusBadge status={resolutionStatus(result, mode)} result={result} />
      </div>
      <strong>
        {readable(pair.left.name)} <span aria-hidden="true">/</span>{" "}
        {readable(pair.right.name)}
      </strong>
      <p>
        {readable(pair.left.address)} · {readable(pair.left.city)}
        <br />
        {readable(pair.right.address)} · {readable(pair.right.city)}
      </p>
      <small>{pair.scenario}</small>
      <button
        aria-label={`Open records ${pair.id}`}
        aria-pressed={active}
        onClick={onOpen}
      >
        Open records
      </button>
    </article>
  );
}

function Comparison({
  pair,
  result,
  mode,
  comparisonRef,
}: {
  pair: Pair;
  result?: Resolution;
  mode: "demo" | "live";
  comparisonRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section
      className={styles.comparison}
      aria-label="Dataset record comparison"
      ref={comparisonRef}
      tabIndex={-1}
    >
      <div className={styles.comparisonHeader}>
        <div>
          <p className={styles.eyebrow}>selected pair</p>
          <h3>
            <code>{pair.id}</code>
          </h3>
        </div>
        <span className={`${styles.badge} ${styles[pair.expected]}`}>
          Expected {pair.expected}
        </span>
        <StatusBadge status={resolutionStatus(result, mode)} result={result} />
      </div>
      <p className={styles.scenario}>{pair.scenario}</p>
      <div className={styles.records}>
        {[pair.left, pair.right].map((record, index) => (
          <article key={index}>
            <h4>{index ? "Right record" : "Left record"}</h4>
            {FIELDS.map(({ key, label }) => (
              <div className={styles.field} key={key}>
                <b>{label}</b>
                <span>{readable(record[key])}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
