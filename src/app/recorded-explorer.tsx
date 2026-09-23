"use client";

import { useMemo, useState } from "react";
import { groupRecords } from "../lib/collection";
import type { Candidate, Collection } from "../lib/collection";
import { FIELDS } from "../lib/lab";
import type { Decision, Project, ProjectField, ResolveResponse } from "../lib/types";
import styles from "./recorded-demo.module.css";

type Batch = {
  recordedAt: string;
  response: ResolveResponse;
};
export type Capture = {
  recordedAt: string;
  settings: { prompt: string; fields: ProjectField[]; threshold: number };
  collection: Collection;
  candidates: Candidate[];
  response: Batch["response"];
  batches: Batch[];
};
const PAGE_SIZE = 20;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const reported = (value: number | null, format: (amount: number) => string) =>
  value == null ? "Not reported" : format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));

function RecordDetails({ project }: { project: Project }) {
  return (
    <dl className={styles.fields}>
      {FIELDS.map(({ key, label }) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{project[key] || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RecordedExplorer({ capture }: { capture: Capture }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("All");
  const [outcome, setOutcome] = useState("All");
  const [decision, setDecision] = useState<"all" | Decision>("all");
  const [page, setPage] = useState(0);
  const records = useMemo(
    () =>
      new Map(capture.collection.records.map((record) => [record.id, record])),
    [capture.collection.records],
  );
  const results = useMemo(
    () =>
      new Map(capture.response.results.map((result) => [result.id, result])),
    [capture.response.results],
  );
  const groups = useMemo(
    () =>
      groupRecords(
        capture.collection.records,
        capture.candidates,
        capture.response.results,
      ),
    [capture.collection.records, capture.candidates, capture.response.results],
  );
  const groupById = useMemo(
    () =>
      new Map(
        groups.flatMap((group) => group.recordIds.map((id) => [id, group])),
      ),
    [groups],
  );
  const totals = useMemo(
    () =>
      capture.response.results.reduce<Record<Decision, number>>(
        (total, result) => ({
          ...total,
          [result.decision]: total[result.decision] + 1,
        }),
        { match: 0, different: 0, review: 0 },
      ),
    [capture.response.results],
  );
  const composition = useMemo(() => {
    const sizes = Object.values(capture.collection.truth).reduce<
      Record<string, number>
    >((counts, id) => ({ ...counts, [id]: (counts[id] ?? 0) + 1 }), {});
    const bySize = Object.values(sizes).reduce<Record<number, number>>(
      (counts, size) => ({ ...counts, [size]: (counts[size] ?? 0) + 1 }),
      {},
    );
    return [1, 2, 3]
      .map(
        (size) =>
          `${bySize[size] ?? 0} ${size === 1 ? "singletons" : size === 2 ? "pairs" : "triplets"}`,
      )
      .join(", ");
  }, [capture.collection.truth]);
  const filteredRecords = useMemo(
    () =>
      capture.collection.records.filter((record) => {
        const haystack = FIELDS.map(({ key }) => record.project[key])
          .join(" ")
          .toLowerCase();
        const group = groupById.get(record.id);
        const matchesOutcome =
          outcome === "All" ||
          (outcome === "linked" && (group?.recordIds.length ?? 1) > 1) ||
          (outcome === "unlinked" && (group?.recordIds.length ?? 1) === 1) ||
          (outcome === "review" && group?.status === "review") ||
          (outcome === "pending" && group?.status === "pending");
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (country === "All" || record.project.country === country) &&
          matchesOutcome
        );
      }),
    [capture.collection.records, country, groupById, outcome, query],
  );
  const filteredComparisons = useMemo(
    () =>
      capture.candidates.filter(
        (candidate) =>
          decision === "all" ||
          results.get(candidate.id)?.decision === decision,
      ),
    [capture.candidates, decision, results],
  );
  const comparisons = filteredComparisons.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredComparisons.length / PAGE_SIZE),
  );
  const clear = () => {
    setQuery("");
    setCountry("All");
    setOutcome("All");
  };
  const changeDecision = (value: "all" | Decision) => {
    setDecision(value);
    setPage(0);
  };

  return (
    <>
      <section className={styles.summary} aria-label="Recorded run summary">
        <div>
          <b>{capture.collection.records.length}</b>
          <span>fictional records</span>
        </div>
        <div>
          <b>{capture.candidates.length}</b>
          <span>comparisons</span>
        </div>
        <div>
          <b>{totals.match}</b>
          <span>match</span>
        </div>
        <div>
          <b>{totals.different}</b>
          <span>different</span>
        </div>
        <div>
          <b>{totals.review}</b>
          <span>review</span>
        </div>
        <div className={styles.cost}>
          <b>
            {reported(
              capture.response.cost,
              (value) => `$${value.toFixed(9)} USD`,
            )}
          </b>
          <span>total actual cost · replay is free</span>
        </div>
      </section>
      <p className={styles.caveat}>
        Input composition: {composition}. These are synthetic records; shared
        references and easy cross-country negatives mean this is not a
        benchmark.
      </p>

      <section
        className={styles.dataset}
        id="dataset"
        aria-labelledby="dataset-title"
      >
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Input records</p>
          <h2 id="dataset-title">Explore the full dataset</h2>
        </div>
        <div className={styles.filters}>
          <label>
            Search dataset
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            Dataset country
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option>All</option>
              <option>UK</option>
              <option>Germany</option>
            </select>
          </label>
          <label>
            Dataset outcome
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              <option>All</option>
              <option value="linked">Has a match</option>
              <option value="review">Needs review</option>
              <option value="unlinked">No accepted match</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <button type="button" onClick={clear}>
            Clear filters
          </button>
        </div>
        <p className={styles.count}>
          {filteredRecords.length} of {capture.collection.records.length}{" "}
          records
        </p>
        {filteredRecords.length ? (
          <div className={styles.recordGrid}>
            {filteredRecords.map((record) => {
              const group = groupById.get(record.id);
              const linked = (group?.recordIds.length ?? 1) > 1;
              return (
                <details className={styles.record} key={record.id}>
                  <summary>
                    <span>
                      <strong>{record.project.name}</strong>
                      <small>
                        {record.project.address}, {record.project.country}
                      </small>
                    </span>
                    <span className={styles.badges}>
                      <b className={styles[linked ? "linked" : "unlinked"]}>
                        {linked
                          ? `${group!.recordIds.length} linked records`
                          : "No accepted match"}
                      </b>
                      {group?.status === "review" ? (
                        <b className={styles.review}>Needs review</b>
                      ) : null}
                    </span>
                  </summary>
                  <RecordDetails project={record.project} />
                </details>
              );
            })}
          </div>
        ) : (
          <p className={styles.empty}>No records match your filters.</p>
        )}
      </section>

      <section className={styles.entities} aria-labelledby="entities-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Model outcomes</p>
          <h2 id="entities-title">Proposed entity groups</h2>
        </div>
        {groups.some((group) => group.conflicts.length) ? (
          <p className={styles.warning}>
            Review evidence touches{" "}
            {groups.filter((group) => group.conflicts.length).length} proposed
            groups. No automatic merge is final.
          </p>
        ) : null}
        <div className={styles.groupGrid}>
          {groups.map((group, index) => (
            <article className={styles.group} key={group.id}>
              <div className={styles.groupTitle}>
                <span>Proposed entity {index + 1}</span>
                <strong className={styles[group.status]}>
                  {group.status === "unlinked"
                    ? "No match found"
                    : group.status === "review"
                      ? "Needs review"
                      : group.status}
                </strong>
              </div>
              <p>
                {group.recordIds.length} record{group.recordIds.length === 1 ? "" : "s"}
                {group.conflicts.length
                  ? ` · ${group.conflicts.length} ${group.conflicts.length === 1 ? "comparison needs" : "comparisons need"} review`
                  : ""}
              </p>
              {group.recordIds.map((id) => (
                <details key={id}>
                  <summary>
                    {records.get(id)!.project.name}
                    <small>{records.get(id)!.project.address}</small>
                  </summary>
                  <RecordDetails project={records.get(id)!.project} />
                </details>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.comparisons}
        aria-labelledby="comparisons-title"
      >
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Recorded decisions</p>
          <h2 id="comparisons-title">Every comparison</h2>
        </div>
        <label className={styles.decisionFilter}>
          Comparison decision
          <select
            value={decision}
            onChange={(event) =>
              changeDecision(event.target.value as "all" | Decision)
            }
          >
            <option value="all">All</option>
            <option value="match">Match</option>
            <option value="different">Different</option>
            <option value="review">Review</option>
          </select>
        </label>
        <p className={styles.threshold}>
          The recorded {capture.settings.threshold} threshold applies to
          selected-option probability, not provider confidence. Raw choice stays
          visible when a result resolves to review.
        </p>
        <div className={styles.comparisonGrid}>
          {comparisons.map((candidate) => {
            const index = capture.candidates.indexOf(candidate) + 1;
            const result = results.get(candidate.id)!;
            const left = records.get(candidate.leftId)!;
            const right = records.get(candidate.rightId)!;
            return (
              <article
                className={styles.comparison}
                aria-label={`Comparison ${index}`}
                key={candidate.id}
              >
                <header>
                  <span>Comparison {index}</span>
                  <b className={styles[result.decision]}>{result.decision}</b>
                </header>
                <div className={styles.pair}>
                  <div>
                    <strong>{left.project.name}</strong>
                    <small>
                      {left.project.address}, {left.project.city}
                    </small>
                  </div>
                  <span>vs</span>
                  <div>
                    <strong>{right.project.name}</strong>
                    <small>
                      {right.project.address}, {right.project.city}
                    </small>
                  </div>
                </div>
                <dl className={styles.decision}>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{pct(result.confidence)}</dd>
                  </div>
                  <div>
                    <dt>Raw choice</dt>
                    <dd>{result.choice}</dd>
                  </div>
                </dl>
                <div
                  className={styles.probabilities}
                  aria-label="Choice probabilities"
                >
                  {(["match", "different", "review"] as Decision[]).map(
                    (choice) => (
                      <div key={choice}>
                        <span>{choice}</span>
                        <i
                          style={{ width: pct(result.probabilities[choice]) }}
                        />
                        <b>{pct(result.probabilities[choice])}</b>
                      </div>
                    ),
                  )}
                </div>
                <details>
                  <summary>View full records</summary>
                  <div className={styles.records}>
                    <RecordDetails project={left.project} />
                    <RecordDetails project={right.project} />
                  </div>
                </details>
              </article>
            );
          })}
        </div>
        <nav className={styles.pagination} aria-label="Comparison pages">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous comparisons
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount - 1}
            onClick={() => setPage(page + 1)}
          >
            Next comparisons
          </button>
        </nav>
      </section>

      <section className={styles.evidence} aria-labelledby="evidence-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Capture metadata</p>
          <h2 id="evidence-title">What ran</h2>
        </div>
        <dl>
          <div>
            <dt>Recorded</dt>
            <dd>{date(capture.recordedAt)} UTC</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              <code>{capture.response.model}</code>
            </dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>
              {reported(
                capture.response.cost,
                (value) => `$${value.toFixed(9)} USD`,
              )}
            </dd>
          </div>
          <div>
            <dt>Input tokens</dt>
            <dd>
              {reported(capture.response.inputTokens, (value) =>
                value.toLocaleString(),
              )}
            </dd>
          </div>
          <div>
            <dt>Server time (sum)</dt>
            <dd>{capture.response.elapsedMs} ms</dd>
          </div>
        </dl>
        <details>
          <summary>Prompt, selected fields and batch receipts</summary>
          <p className={styles.prompt}>{capture.settings.prompt}</p>
          <p className={styles.fieldList}>
            {capture.settings.fields
              .map((field) => FIELDS.find(({ key }) => key === field)?.label)
              .join(" · ")}
          </p>
          {capture.batches.map((batch, index) => (
            <p className={styles.receipt} key={`${batch.recordedAt}-${index}`}>
              Batch {index + 1}: {batch.response.results.length} comparisons ·{" "}
              {batch.response.model} · {date(batch.recordedAt)} UTC ·{" "}
              {reported(
                batch.response.cost,
                (value) => `$${value.toFixed(9)} USD`,
              )}{" "}
              ·{" "}
              {reported(
                batch.response.inputTokens,
                (value) => `${value} tokens`,
              )}
              {" "}· {batch.response.elapsedMs} ms server time
            </p>
          ))}
        </details>
      </section>
    </>
  );
}
