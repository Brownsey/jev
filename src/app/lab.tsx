"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DatasetExplorer from "./dataset-explorer";
import { ResolutionBadge } from "./resolution-badge";
import { JEV_MODELS, isJevModel } from "../lib/models";
import {
  DEFAULT_MODEL,
  SIMULATION_VERSION,
  FIELDS,
  PROMPTS,
  buildJevRequest,
  generateDataset,
  summarize,
} from "../lib/lab";
import type {
  ConfigResponse,
  Dataset,
  ProjectField,
  ResolveResponse,
  Resolution,
} from "../lib/types";

type Saved = {
  version: 1;
  simulationVersion?: number;
  dataset: Dataset;
  prompt: string;
  fields: ProjectField[];
  threshold: number;
  model: string;
  mode: "demo" | "live";
  results: Resolution[];
  resolvedModels?: string[];
  elapsed?: number | null;
  usage?: { inputTokens: number | null; cost: number | null } | null;
};
const STORE = "jev-resolution-lab:v1";
const defaultFields = FIELDS.map(({ key }) => key);
const initialDataset: Dataset = { seed: 20260922, country: "Mixed", pairs: [] };
const decisions = ["match", "different", "review"] as const;
const nonnegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
function validSaved(value: unknown): value is Saved {
  if (!value || typeof value !== "object") return false;
  const saved = value as Saved;
  const keys = new Set(FIELDS.map((field) => field.key));
  const pairIds = Array.isArray(saved.dataset?.pairs)
    ? new Set(saved.dataset.pairs.map((pair) => pair?.id))
    : null;
  return (
    saved.version === 1 &&
    (saved.elapsed == null || nonnegative(saved.elapsed)) &&
    (saved.usage == null ||
      (typeof saved.usage === "object" &&
        (saved.usage.inputTokens === null ||
          (nonnegative(saved.usage.inputTokens) &&
            Number.isSafeInteger(saved.usage.inputTokens))) &&
        (saved.usage.cost === null || nonnegative(saved.usage.cost)))) &&
    ["UK", "Germany", "Mixed"].includes(saved.dataset?.country) &&
    Number.isSafeInteger(saved.dataset?.seed) &&
    typeof saved.prompt === "string" &&
    saved.prompt.length <= 8000 &&
    Array.isArray(saved.fields) &&
    saved.fields.length > 0 &&
    saved.fields.length <= FIELDS.length &&
    new Set(saved.fields).size === saved.fields.length &&
    saved.fields.every((field) => keys.has(field)) &&
    Number.isFinite(saved.threshold) &&
    saved.threshold >= 0 &&
    saved.threshold <= 1 &&
    typeof saved.model === "string" &&
    saved.model.length <= 200 &&
    ["demo", "live"].includes(saved.mode) &&
    Array.isArray(saved.dataset?.pairs) &&
    saved.dataset.pairs.length <= 500 &&
    pairIds?.size === saved.dataset.pairs.length &&
    saved.dataset.pairs.every(
      (pair) =>
        pair &&
        typeof pair.id === "string" &&
        pair.id.length > 0 &&
        pair.id.length <= 100 &&
        (pair.expected === "match" || pair.expected === "different") &&
        typeof pair.scenario === "string" &&
        FIELDS.every(
          (field) =>
            typeof pair.left?.[field.key] === "string" &&
            typeof pair.right?.[field.key] === "string" &&
            pair.left[field.key].length <= 2000 &&
            pair.right[field.key].length <= 2000,
        ),
    ) &&
    Array.isArray(saved.results) &&
    saved.results.length <= saved.dataset.pairs.length &&
    new Set(saved.results.map((result) => result?.id)).size ===
      saved.results.length &&
    saved.results.every(
      (result) =>
        result &&
        typeof result.id === "string" &&
        pairIds?.has(result.id) &&
        decisions.includes(result.decision) &&
        decisions.includes(result.choice) &&
        Number.isFinite(result.confidence) &&
        result.confidence >= 0 &&
        result.confidence <= 1 &&
        Math.abs(
          decisions.reduce((sum, key) => sum + result.probabilities?.[key], 0) -
            1,
        ) < 0.02 &&
        decisions.every(
          (key) =>
            Number.isFinite(result.probabilities?.[key]) &&
            result.probabilities[key] >= 0 &&
            result.probabilities[key] <= 1,
        ),
    ) &&
    (saved.resolvedModels == null ||
      (Array.isArray(saved.resolvedModels) &&
        saved.resolvedModels.length <= 25 &&
        new Set(saved.resolvedModels).size === saved.resolvedModels.length &&
        saved.resolvedModels.every(
          (model) => typeof model === "string" && model.length > 0 && model.length <= 200,
        )))
  );
}

function download(name: string, data: unknown) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function probability(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function Page() {
  const [dataset, setDataset] = useState(initialDataset);
  const [country, setCountry] = useState<Dataset["country"]>("Mixed");
  const [count, setCount] = useState(80);
  const [seed, setSeed] = useState(20260922);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    PROMPTS[1]?.text ?? PROMPTS[0]?.text ?? "",
  );
  const [fields, setFields] = useState<ProjectField[]>(defaultFields);
  const [threshold, setThreshold] = useState(0.72);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [results, setResults] = useState<Resolution[]>([]);
  const [resolvedModels, setResolvedModels] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [usage, setUsage] = useState<{
    inputTokens: number | null;
    cost: number | null;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const invalidate = () => {
    controller.current?.abort();
    if (results.length) setNotice("Results need rerunning");
    setResults([]);
    setResolvedModels([]);
    setElapsed(null);
    setUsage(null);
  };
  const chooseDataset = (next: Dataset) => {
    setDataset(next);
    setSelected(next.pairs[0]?.id ?? null);
    invalidate();
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORE) ?? "null",
      ) as Saved | null;
      if (validSaved(saved)) {
        if (saved.mode === "demo" && saved.simulationVersion !== SIMULATION_VERSION && saved.results.length) {
          saved.results = [];
          saved.resolvedModels = [];
          saved.elapsed = null;
          saved.usage = null;
          setNotice("Simulation updated. Run again for refreshed matches.");
        }
        setDataset(saved.dataset);
        setCountry(saved.dataset.country);
        setSeed(saved.dataset.seed);
        setCount(saved.dataset.pairs.length || 80);
        setPrompt(saved.prompt);
        setFields(saved.fields);
        setThreshold(saved.threshold);
        if (isJevModel(saved.model)) {
          setModel(saved.model);
          setResults(saved.results);
          setResolvedModels(saved.resolvedModels ?? []);
          setElapsed(saved.elapsed ?? null);
          setUsage(saved.usage ?? null);
        } else {
          setModel(DEFAULT_MODEL);
          setNotice("Saved model is no longer supported. Results were reset.");
        }
        setMode(saved.mode);
        setSelected(saved.dataset.pairs[0]?.id ?? null);
      } else if (saved)
        setStorageError("Saved workspace was invalid and was not restored.");
    } catch {
      setStorageError(
        "Workspace could not be restored. Your browser storage may be unavailable.",
      );
    }
    setHydrated(true);
    fetch("/api/config")
      .then(async (response) => (response.ok ? response.json() : null))
      .then(setConfig)
      .catch(() => setNotice("Server configuration is unavailable."));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({
          version: 1,
          simulationVersion: SIMULATION_VERSION,
          dataset,
          prompt,
          fields,
          threshold,
          model,
          mode,
          results,
          resolvedModels,
          elapsed,
          usage,
        } satisfies Saved),
      );
    } catch {
      setStorageError(
        "Workspace could not be saved. Continue working; export JSON to keep a copy.",
      );
    }
  }, [
    dataset,
    prompt,
    fields,
    threshold,
    model,
    mode,
    results,
    resolvedModels,
    elapsed,
    usage,
    hydrated,
  ]);

  const filtered = useMemo(
    () =>
      dataset.pairs.filter((pair) =>
        `${pair.id} ${pair.left.name} ${pair.right.name} ${pair.left.address} ${pair.right.address}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [dataset.pairs, query],
  );
  const pair =
    dataset.pairs.find((item) => item.id === selected) ?? filtered[0] ?? null;
  const byId = useMemo(
    () => new Map(results.map((result) => [result.id, result])),
    [results],
  );
  const metrics = useMemo(
    () => summarize(dataset.pairs, results),
    [dataset.pairs, results],
  );
  const preview = useMemo(
    () =>
      buildJevRequest({
        mode,
        pairs: dataset.pairs.slice(0, 1),
        prompt,
        fields,
        threshold,
        model,
      }),
    [mode, dataset.pairs, prompt, fields, threshold, model],
  );

  function generate() {
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(seed)) {
      setNotice("Pair count and seed must be whole numbers.");
      return;
    }
    chooseDataset(generateDataset(count, seed, country));
    setNotice(
      "Synthetic pairs generated. Ground truth is evaluation-only and never sent to Jev.",
    );
  }
  function changeSetting(change: () => void) {
    change();
    invalidate();
  }
  async function run() {
    if (!dataset.pairs.length) {
      setNotice("Generate pairs before running resolution.");
      return;
    }
    setRunning(true);
    setNotice("");
    setResults([]);
    setResolvedModels([]);
    setElapsed(0);
    setUsage(null);
    const abort = new AbortController();
    controller.current = abort;
    const collected: Resolution[] = [];
    const models = new Set<string>();
    let totalElapsed = 0;
    let inputTokens: number | null = 0;
    let cost: number | null = 0;
    try {
      for (let i = 0; i < dataset.pairs.length; i += 20) {
        const response = await fetch("/api/resolve", {
          method: "POST",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            mode,
            pairs: dataset.pairs.slice(i, i + 20),
            prompt,
            fields,
            threshold,
            model,
          }),
        });
        const body = (await response.json()) as
          ResolveResponse | { error: string };
        if (!response.ok || !("results" in body))
          throw new Error(
            "error" in body ? body.error : "Resolution request failed.",
          );
        if (abort.signal.aborted) break;
        collected.push(...body.results);
        if (mode === "live" && body.model && models.size < 25)
          models.add(body.model);
        totalElapsed += body.elapsedMs;
        inputTokens =
          inputTokens === null || body.inputTokens === null
            ? null
            : inputTokens + body.inputTokens;
        cost = cost === null || body.cost === null ? null : cost + body.cost;
        setResults([...collected]);
        setResolvedModels([...models]);
        setElapsed(totalElapsed);
        setUsage({ inputTokens, cost });
      }
      setNotice(`Completed ${collected.length} pairs.`);
    } catch (error) {
      setNotice(
        abort.signal.aborted
          ? `Cancelled. Retained ${collected.length} completed results.`
          : error instanceof Error
            ? error.message
            : "Resolution failed.",
      );
    } finally {
      setRunning(false);
      controller.current = null;
    }
  }

  return (
    <main className="lab-shell" id="main-content">
      <a className="skip-link" href="#dataset-controls">
        Skip to experiment controls
      </a>
      <aside className="rail" aria-label="Lab navigation">
        <div className="mark">j</div>
        <strong>jev</strong>
        <span>
          resolution
          <br />
          lab
        </span>
        <small>
          local research
          <br />
          instrument
        </small>
        <a href="/" style={{ color: "inherit" }}>Showcase</a>
      </aside>
      <section id="pair-queue" className="workspace">
        <a className="skip-link" href="#pair-queue">
          Skip to pair queue
        </a>
        <header className="topline">
          <div>
            <p className="eyebrow">entity resolution / field study</p>
            <h1>resolution lab</h1>
            <p className="subhead">
              Compare project records, inspect evidence, and test a bounded
              decision request.
            </p>
          </div>
          <div className="mode-pill">
            {mode === "demo" ? "Simulated heuristic" : "Live provider"}
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {storageError && (
          <div className="notice" role="alert">
            {storageError}
          </div>
        )}
        <section
          className="controls"
          id="dataset-controls"
          tabIndex={-1}
          aria-label="Dataset controls"
        >
          <label>
            Pairs
            <input
              aria-label="Pair count"
              disabled={running}
              type="number"
              min="20"
              max="500"
              value={count}
              onChange={(event) =>
                setCount(
                  Math.max(20, Math.min(500, Number(event.target.value) || 20)),
                )
              }
            />
          </label>
          <label>
            Seed
            <input
              aria-label="Seed"
              disabled={running}
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            Country
            <select
              aria-label="Country"
              disabled={running}
              value={country}
              onChange={(event) => {
                setCountry(event.target.value as Dataset["country"]);
                invalidate();
              }}
            >
              <option>Mixed</option>
              <option>UK</option>
              <option>Germany</option>
            </select>
          </label>
          <button className="primary" disabled={running} onClick={generate}>
            Generate pairs
          </button>
          <button onClick={() => download("jev-dataset.json", dataset)}>
            Export dataset
          </button>
          <button
            onClick={() =>
              download("jev-evaluation.json", {
                simulationVersion: mode === "demo" ? SIMULATION_VERSION : undefined,
                dataset,
                prompt,
                fields,
                threshold,
                model,
                mode,
                results,
                resolvedModels,
                metrics,
                elapsed,
                usage,
              })
            }
          >
            Export evaluation
          </button>
        </section>
        <DatasetExplorer dataset={dataset} results={results} mode={mode} />
        <section className="settings">
          <div>
            <label>
              Mode
              <select
                aria-label="Mode"
                disabled={running}
                value={mode}
                onChange={(event) =>
                  changeSetting(() =>
                    setMode(event.target.value as "demo" | "live"),
                  )
                }
              >
                <option value="demo">Demo (simulated)</option>
                <option value="live">Live</option>
              </select>
            </label>
            {mode === "demo" && (
              <p className="hint">
                Simulated matching rules: not Jev, not benchmark evidence. Scores are illustrative.
              </p>
            )}
            {mode === "live" && !config?.configured && (
              <p className="hint">
                Live provider is not configured. Add OPENROUTER_API_KEY in Vercel, then redeploy.
              </p>
            )}
          </div>
          <label>
            Model
            <select
              aria-label="Model"
              disabled={running}
              value={model}
              onChange={(event) =>
                changeSetting(() => setModel(event.target.value))
              }
            >
              {JEV_MODELS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Review threshold
            <input
              aria-label="Review threshold"
              disabled={running}
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={threshold}
              onChange={(event) =>
                changeSetting(() => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value))
                    setThreshold(Math.min(1, Math.max(0, value)));
                })
              }
            />
          </label>
          {config?.accessRequired && (
            <label>
              App password
              <input
                aria-label="App password"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="App access password (memory only)"
              />
            </label>
          )}
          <div className="run-actions">
            <button className="primary" disabled={running} onClick={run}>
              {running
                ? `Running ${results.length}/${dataset.pairs.length}`
                : mode === "demo"
                  ? "Run demo"
                  : "Run live"}
            </button>
            {running && (
              <button onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        </section>
        <section className="content-grid">
          <div className="pairs-panel panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">synthetic dataset</p>
                <h2>Pair queue</h2>
              </div>
              <input
                aria-label="Search pairs"
                placeholder="Search records"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Left record</th>
                    <th>Right record</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const result = byId.get(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={pair?.id === item.id ? "active" : ""}
                      >
                        <td>
                          <button
                            className="pair-select"
                            aria-label={`Inspect pair ${item.id}`}
                            aria-pressed={pair?.id === item.id}
                            onClick={() => setSelected(item.id)}
                          >
                            <code>{item.id}</code>
                          </button>
                          <small>{item.left.country}</small>
                        </td>
                        <td>
                          {item.left.name}
                          <small>{item.left.address}</small>
                        </td>
                        <td>
                          {item.right.name}
                          <small>{item.right.address}</small>
                        </td>
                        <td>
                          <ResolutionBadge result={result} mode={mode} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filtered.length && <p className="empty">No matching pairs.</p>}
            </div>
          </div>
          <aside className="inspector panel" aria-label="Record inspector">
            {pair ? (
              <>
                <div className="panel-title">
                  <div>
                    <p className="eyebrow">paired records</p>
                    <h2>
                      <code>{pair.id}</code>
                    </h2>
                  </div>
                  <span className="scenario">{pair.scenario}</span>
                </div>
                <div className="record-head">
                  <span>Record A</span>
                  <div className="probability">
                    <i
                      style={{
                        width: `${(byId.get(pair.id)?.probabilities.match ?? 0) * 100}%`,
                      }}
                    />
                  </div>
                  <span>Record B</span>
                </div>
                <div className="records">
                  {([pair.left, pair.right] as const).map((record, index) => (
                    <article key={index}>
                      <h3>{record.name}</h3>
                      {FIELDS.map((field) => (
                        <div className="field" key={field.key}>
                          <b>{field.label}</b>
                          <span>{record[field.key]}</span>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
                {byId.get(pair.id) ? (
                  <Decision
                    result={byId.get(pair.id)!}
                    threshold={threshold}
                    mode={mode}
                  />
                ) : (
                  <p className="empty">
                    Run resolution to inspect probabilities.
                  </p>
                )}
                <details>
                  <summary>Expected answer · evaluation only</summary>
                  <p>{pair.expected}. Ground truth is never sent to Jev.</p>
                </details>
              </>
            ) : (
              <p className="empty">
                Generate synthetic pairs to inspect a record.
              </p>
            )}
          </aside>
        </section>
        <section className="bottom-grid">
          <div className="panel prompt-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">decision instructions</p>
                <h2>Prompt & fields</h2>
              </div>
              <select
                aria-label="Prompt preset"
                disabled={running}
                onChange={(event) => {
                  const choice = PROMPTS.find(
                    (item) => item.id === event.target.value,
                  );
                  if (choice) changeSetting(() => setPrompt(choice.text));
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Load example
                </option>
                {PROMPTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              aria-label="Resolution instructions"
              disabled={running}
              value={prompt}
              onChange={(event) =>
                changeSetting(() => setPrompt(event.target.value))
              }
              maxLength={8000}
            />
            <fieldset disabled={running}>
              <legend>Compared fields</legend>
              {FIELDS.map((field) => (
                <label className="check" key={field.key}>
                  <input
                    type="checkbox"
                    checked={fields.includes(field.key)}
                    disabled={
                      fields.length === 1 && fields.includes(field.key)
                    }
                    onChange={() =>
                      changeSetting(() =>
                        setFields((current) =>
                          current.includes(field.key)
                            ? current.length === 1
                              ? current
                              : current.filter((key) => key !== field.key)
                            : [...current, field.key],
                        ),
                      )
                    }
                  />
                  {field.label}
                </label>
              ))}
            </fieldset>
            <p className="hint">
              Select at least one field. {" "}
              {mode === "demo"
                ? "Demo compares field similarity only; instructions affect live Jev runs."
                : "Jev evaluates the selected fields using these instructions."}
            </p>
            <details>
              <summary>How to choose fields</summary>
              <p>
                Address, postcode, city and country identify the site.
                Description identifies the work and phase. Reference can confirm
                a planning application; developer and name are supporting
                evidence. A shared address does not prove two projects are the
                same.
              </p>
              <p>
                Try excluding reference to test semantic matching. German
                Straße/Str. and umlaut transliterations, and UK St/Street,
                should remain compatible.
              </p>
            </details>
          </div>
          <div className="panel metrics">
            <p className="eyebrow">run evidence</p>
            <h2>Metrics</h2>
            <p className="outcome-counts">
              {metrics.matched} matches · {metrics.different} different ·{" "}
              {metrics.review} for review
            </p>
            {resolvedModels.length > 0 && (
              <p className="usage">Run model: {resolvedModels.join(", ")}</p>
            )}
            <div className="metric-grid">
              <Metric
                label="Completed"
                value={`${metrics.completed}/${metrics.total}`}
              />
              <Metric
                label="Accuracy"
                value={
                  metrics.accuracy == null ? "—" : probability(metrics.accuracy)
                }
              />
              <Metric
                label="Precision"
                value={
                  metrics.precision == null
                    ? "—"
                    : probability(metrics.precision)
                }
              />
              <Metric
                label="Recall"
                value={
                  metrics.recall == null ? "—" : probability(metrics.recall)
                }
              />
              <Metric
                label="Coverage"
                value={
                  metrics.coverage == null ? "—" : probability(metrics.coverage)
                }
              />
              <Metric
                label="Latency"
                value={elapsed == null ? "—" : `${elapsed} ms`}
              />
            </div>
            <p className="hint">
              Accuracy: correct / completed. Precision: correct matches /
              predicted matches. Recall: correct matches / actual matches among
              completed pairs. Coverage: decided / completed. Review counts as
              unresolved.
            </p>
            <p className="usage">
              Input: {usage?.inputTokens ?? "unknown"} tokens · Cost:{" "}
              {usage?.cost == null ? "unknown" : `$${usage.cost}`}
            </p>
          </div>
          <details className="panel preview">
            <summary>Request preview & implementation guidance</summary>
            <p>
              Only selected record fields are sent. Ground truth, scenario, and
              browser token are excluded.
            </p>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
            <p>
              Send at most 20 pairs per request. Treat malformed upstream
              answers as errors; do not create a fallback decision.
            </p>
          </details>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Decision({
  result,
  threshold,
  mode,
}: {
  result: Resolution;
  threshold: number;
  mode: "demo" | "live";
}) {
  return (
    <div className="decision-detail">
      <strong className={`decision ${result.decision}`}>
        {result.decision}
      </strong>
      <span>
        {mode === "live" ? "Provider confidence" : "Simulated confidence"}{" "}
        {probability(result.confidence)}
      </span>
      <span>
        Original choice: {result.choice} ·{" "}
        {probability(result.probabilities[result.choice])} probability
      </span>
      <span>
        Match {probability(result.probabilities.match)} · Different{" "}
        {probability(result.probabilities.different)} · Review{" "}
        {probability(result.probabilities.review)}
      </span>
      {result.probabilities[result.choice] < threshold && (
        <small>Selected option is below review threshold.</small>
      )}
    </div>
  );
}
