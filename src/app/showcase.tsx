"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { FIELDS, PROMPTS, DEFAULT_MODEL } from "../lib/lab";
import { JEV_MODELS, isJevModel } from "../lib/models";
import {
  candidatePairs,
  evaluateCollection,
  generateCollection,
  groupRecords,
  planCandidates,
} from "../lib/collection";
import type { Candidate, EntityGroup } from "../lib/collection";
import type {
  ConfigResponse,
  Dataset,
  ProjectField,
  Resolution,
  ResolveResponse,
} from "../lib/types";
import styles from "./showcase.module.css";

type Mode = "demo" | "live";
type RunState =
  "pending" | "running" | "cancelled" | "partial" | "failed" | "complete";
type Usage = { inputTokens: number | null; cost: number | null };
type Saved = {
  version: 1;
  generator: {
    count: number;
    seed: number;
    country: Dataset["country"];
    cap: number;
  };
  settings: {
    mode: Mode;
    model: string;
    threshold: number;
    prompt: string;
    fields: ProjectField[];
  };
  results: Resolution[];
  actualModels: string[];
  elapsedMs: number | null;
  usage: Usage | null;
};

const STORE = "jev-collection-showcase:v1";
const COUNTS = [5, 18, 60, 180, 300];
const CAPS = [20, 50, 100, 250, 500];
const defaultFields = FIELDS.map(({ key }) => key);
const defaultPrompt = PROMPTS[1]?.text ?? PROMPTS[0]?.text ?? "";
const pct = (value: number | null) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;
const money = (value: number | null) =>
  value == null ? "unknown" : `$${value.toFixed(6)}`;

function validResolution(
  value: unknown,
  ids: Set<string>,
): value is Resolution {
  if (!value || typeof value !== "object") return false;
  const item = value as Resolution;
  const choices = ["match", "different", "review"] as const;
  return (
    typeof item.id === "string" &&
    ids.has(item.id) &&
    choices.includes(item.decision) &&
    choices.includes(item.choice) &&
    Number.isFinite(item.confidence) &&
    item.confidence >= 0 &&
    item.confidence <= 1 &&
    choices.every(
      (choice) =>
        Number.isFinite(item.probabilities?.[choice]) &&
        item.probabilities[choice] >= 0 &&
        item.probabilities[choice] <= 1,
    ) &&
    Math.abs(
      choices.reduce((sum, choice) => sum + item.probabilities[choice], 0) - 1,
    ) < 0.02
  );
}

function restore(value: unknown): Saved | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Saved;
  const generator = saved.generator;
  const settings = saved.settings;
  if (
    saved.version !== 1 ||
    !generator ||
    !settings ||
    !COUNTS.includes(generator.count) ||
    !Number.isSafeInteger(generator.seed) ||
    !["UK", "Germany", "Mixed"].includes(generator.country) ||
    !CAPS.includes(generator.cap) ||
    !["demo", "live"].includes(settings.mode) ||
    !isJevModel(settings.model) ||
    !Number.isFinite(settings.threshold) ||
    settings.threshold < 0 ||
    settings.threshold > 1 ||
    typeof settings.prompt !== "string" ||
    settings.prompt.length > 8000 ||
    !Array.isArray(settings.fields) ||
    settings.fields.length < 1 ||
    settings.fields.length > FIELDS.length ||
    new Set(settings.fields).size !== settings.fields.length ||
    !settings.fields.every((field) => FIELDS.some(({ key }) => key === field))
  )
    return null;
  const collection = generateCollection(
    generator.count,
    generator.seed,
    generator.country,
  );
  const ids = new Set(
    planCandidates(collection.records, generator.cap).candidates.map(
      ({ id }) => id,
    ),
  );
  if (
    !Array.isArray(saved.results) ||
    saved.results.length > ids.size ||
    new Set(saved.results.map((result) => result?.id)).size !==
      saved.results.length ||
    !saved.results.every((result) => validResolution(result, ids)) ||
    !Array.isArray(saved.actualModels) ||
    saved.actualModels.length > 25 ||
    !saved.actualModels.every(
      (model) =>
        typeof model === "string" && model.length > 0 && model.length <= 200,
    ) ||
    (saved.elapsedMs !== null &&
      (!Number.isFinite(saved.elapsedMs) || saved.elapsedMs < 0)) ||
    (saved.usage !== null &&
      (!saved.usage ||
        (saved.usage.inputTokens !== null &&
          (!Number.isSafeInteger(saved.usage.inputTokens) ||
            saved.usage.inputTokens < 0)) ||
        (saved.usage.cost !== null &&
          (!Number.isFinite(saved.usage.cost) || saved.usage.cost < 0))))
  )
    return null;
  return saved;
}

function download(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "jev-collection-experiment.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Showcase() {
  const [count, setCount] = useState(18);
  const [seed, setSeed] = useState(20260922);
  const [country, setCountry] = useState<Dataset["country"]>("Mixed");
  const [cap, setCap] = useState(50);
  const [mode, setMode] = useState<Mode>("demo");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [threshold, setThreshold] = useState(0.72);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [fields, setFields] = useState<ProjectField[]>(defaultFields);
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [results, setResults] = useState<Resolution[]>([]);
  const [actualModels, setActualModels] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [runState, setRunState] = useState<RunState>("pending");
  const [notice, setNotice] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [groupStatus, setGroupStatus] = useState("all");
  const [groupSize, setGroupSize] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [revealTruth, setRevealTruth] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectorOpener = useRef<HTMLButtonElement | null>(null);

  const collection = useMemo(
    () => generateCollection(count, seed, country),
    [count, seed, country],
  );
  const plan = useMemo(
    () => planCandidates(collection.records, cap),
    [collection, cap],
  );
  const pairs = useMemo(
    () => candidatePairs(collection.records, plan.candidates),
    [collection.records, plan.candidates],
  );
  const groups = useMemo(
    () => groupRecords(collection.records, plan.candidates, results),
    [collection.records, plan.candidates, results],
  );
  const metrics = useMemo(
    () => evaluateCollection(collection, plan.candidates, results),
    [collection, plan.candidates, results],
  );
  const byRecord = useMemo(
    () => new Map(collection.records.map((record) => [record.id, record])),
    [collection.records],
  );
  const byResult = useMemo(
    () => new Map(results.map((result) => [result.id, result])),
    [results],
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      const saved = raw ? restore(JSON.parse(raw)) : null;
      if (saved) {
        setCount(saved.generator.count);
        setSeed(saved.generator.seed);
        setCountry(saved.generator.country);
        setCap(saved.generator.cap);
        setMode(saved.settings.mode);
        setModel(saved.settings.model);
        setThreshold(saved.settings.threshold);
        setPrompt(saved.settings.prompt);
        setFields(saved.settings.fields);
        setResults(saved.results);
        setActualModels(saved.actualModels);
        setElapsedMs(saved.elapsedMs);
        setUsage(saved.usage);
        setRunState(saved.results.length ? "partial" : "pending");
      } else if (raw)
        setStorageNotice("Saved workspace was invalid and was not restored.");
    } catch {
      setStorageNotice(
        "Workspace could not be restored. Browser storage may be unavailable.",
      );
    }
    setHydrated(true);
    fetch("/api/config")
      .then(async (response) => (response.ok ? response.json() : null))
      .then(setConfig)
      .catch(() => setNotice("Server configuration is unavailable."));
    return () => {
      runId.current++;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify({
          version: 1,
          generator: { count, seed, country, cap },
          settings: { mode, model, threshold, prompt, fields },
          results,
          actualModels,
          elapsedMs,
          usage,
        } satisfies Saved),
      );
    } catch {
      setStorageNotice(
        "Workspace could not be saved. Export JSON to keep a copy.",
      );
    }
  }, [
    actualModels,
    cap,
    count,
    country,
    elapsedMs,
    fields,
    hydrated,
    mode,
    model,
    prompt,
    results,
    seed,
    threshold,
    usage,
  ]);

  useEffect(() => {
    if (!selectedGroup) return;
    inspectorRef.current?.scrollIntoView({ block: "start" });
    inspectorRef.current?.focus({ preventScroll: true });
  }, [selectedGroup]);

  const invalidate = (
    message = "Settings changed. Previous results were cleared.",
  ) => {
    runId.current++;
    controller.current?.abort();
    setResults([]);
    setActualModels([]);
    setElapsedMs(null);
    setUsage(null);
    setRunState("pending");
    setNotice(message);
    setSelectedGroup(null);
  };
  const change = (update: () => void) => {
    update();
    invalidate();
  };

  async function run() {
    const completed = new Set(results.map(({ id }) => id));
    const unfinished = pairs.filter(({ id }) => !completed.has(id));
    if (!unfinished.length) {
      setRunState("complete");
      setNotice(
        `Completed ${results.length}/${pairs.length} comparisons. Nothing unfinished to send.`,
      );
      return;
    }
    const id = ++runId.current;
    const abort = new AbortController();
    controller.current = abort;
    let collected = [...results];
    let nextElapsed = elapsedMs ?? 0;
    let nextInput = usage?.inputTokens ?? 0;
    let nextCost = usage?.cost ?? 0;
    let unknownInput = usage?.inputTokens === null;
    let unknownCost = usage?.cost === null;
    const versions = new Set(actualModels);
    setRunState("running");
    setNotice(`Running 0/${unfinished.length} unfinished comparisons.`);
    try {
      for (let index = 0; index < unfinished.length; index += 20) {
        const batch = unfinished.slice(index, index + 20);
        const response = await fetch("/api/resolve", {
          method: "POST",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            mode,
            pairs: batch,
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
        if (id !== runId.current || abort.signal.aborted) return;
        collected = [...collected, ...body.results];
        nextElapsed += body.elapsedMs;
        if (body.inputTokens === null) unknownInput = true;
        else nextInput += body.inputTokens;
        if (body.cost === null) unknownCost = true;
        else nextCost += body.cost;
        if (mode === "live" && body.model) versions.add(body.model);
        setResults(collected);
        setElapsedMs(nextElapsed);
        setUsage({
          inputTokens: unknownInput ? null : nextInput,
          cost: unknownCost ? null : nextCost,
        });
        setActualModels([...versions]);
        setNotice(
          `Running ${Math.min(index + batch.length, unfinished.length)}/${unfinished.length} unfinished comparisons.`,
        );
      }
      setRunState("complete");
      setNotice(`Completed ${collected.length}/${pairs.length} comparisons.`);
    } catch (error) {
      if (id !== runId.current) return;
      if (abort.signal.aborted) {
        setRunState(collected.length ? "cancelled" : "pending");
        setNotice(
          `Cancelled. Retained ${collected.length}/${pairs.length} completed comparisons.`,
        );
      } else {
        setRunState(collected.length ? "partial" : "failed");
        setNotice(
          `${error instanceof Error ? error.message : "Resolution failed."} Retained ${collected.length}/${pairs.length} completed comparisons.`,
        );
      }
    } finally {
      if (id === runId.current) controller.current = null;
    }
  }

  const visibleRecords = collection.records.filter(({ id, project }) =>
    `${id} ${Object.values(project).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleGroups = groups.filter(
    (group) =>
      (groupStatus === "all" || group.status === groupStatus) &&
      (groupSize === "all" ||
        (groupSize === "3+"
          ? group.recordIds.length >= 3
          : group.recordIds.length === Number(groupSize))),
  );
  const selected = groups.find(({ id }) => id === selectedGroup) ?? null;
  const liveBlocked =
    mode === "live" &&
    (!config?.configured || Boolean(config?.accessRequired && !token));

  return (
    <main className={styles.shell} id="main-content">
      <a className={styles.skip} href="#experiment">
        Skip to experiment controls
      </a>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Jev · entity discovery</p>
          <h1>Turn records into reviewable entities</h1>
          <p className={styles.intro}>
            Find which project records belong together. Compare names,
            descriptions and addresses, then inspect the evidence behind every
            proposed group.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <strong>Synthetic UK/Germany data</strong>
          <span className={mode === "demo" ? styles.simulation : styles.live}>
            {mode === "demo" ? "Simulation" : "Live Jev"}
          </span>
          <a href="/lab">Open advanced pair lab →</a>
        </div>
      </header>
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      ) : null}
      {storageNotice ? (
        <div className={styles.warning} role="alert">
          {storageNotice}
        </div>
      ) : null}

      <section
        className={styles.controls}
        id="experiment"
        aria-label="Experiment controls"
      >
        <label>
          Records
          <select
            aria-label="Record count"
            disabled={runState === "running"}
            value={count}
            onChange={(event) =>
              change(() => setCount(Number(event.target.value)))
            }
          >
            {COUNTS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <input
            aria-label="Seed"
            disabled={runState === "running"}
            type="number"
            value={seed}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isSafeInteger(value)) change(() => setSeed(value));
            }}
          />
        </label>
        <label>
          Locale
          <select
            aria-label="Country"
            disabled={runState === "running"}
            value={country}
            onChange={(event) =>
              change(() => setCountry(event.target.value as Dataset["country"]))
            }
          >
            <option>Mixed</option>
            <option>UK</option>
            <option>Germany</option>
          </select>
        </label>
        <label>
          Comparison cap
          <select
            aria-label="Comparison cap"
            disabled={runState === "running"}
            value={cap}
            onChange={(event) =>
              change(() => setCap(Number(event.target.value)))
            }
          >
            {CAPS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className={styles.plan} aria-label="Candidate plan">
          <strong>{collection.records.length} records</strong>
          <span>
            {plan.candidates.length} selected · {plan.eligible} eligible ·{" "}
            {plan.allPairs} all pairs
          </span>
        </div>
      </section>

      <section className={styles.settings} aria-label="Decision settings">
        <label>
          Mode
          <select
            aria-label="Mode"
            disabled={runState === "running"}
            value={mode}
            onChange={(event) =>
              change(() => setMode(event.target.value as Mode))
            }
          >
            <option value="demo">Simulation</option>
            <option value="live">Live Jev</option>
          </select>
        </label>
        <label>
          Model
          <select
            aria-label="Model"
            disabled={runState === "running"}
            value={model}
            onChange={(event) => change(() => setModel(event.target.value))}
          >
            {JEV_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review threshold
          <input
            aria-label="Review threshold"
            disabled={runState === "running"}
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value))
                change(() => setThreshold(Math.max(0, Math.min(1, value))));
            }}
          />
        </label>
        {mode === "live" && config?.accessRequired ? (
          <label>
            Access token
            <input
              aria-label="Access token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              placeholder="Kept in memory only"
            />
          </label>
        ) : null}
        <div className={styles.runActions}>
          <button
            className={styles.primary}
            disabled={!hydrated || runState === "running" || liveBlocked}
            onClick={run}
          >
            {runState === "running"
              ? `Running ${results.length}/${pairs.length}`
              : mode === "demo"
                ? "Run simulation"
                : "Run live"}
          </button>
          {runState === "running" ? (
            <button onClick={() => controller.current?.abort()}>Cancel</button>
          ) : null}
        </div>
        {mode === "demo" ? (
          <p className={styles.context}>
            Local simulated decisions. They demonstrate the workflow and are not
            Jev performance evidence.
          </p>
        ) : liveBlocked ? (
          <p className={styles.context}>
            {!config?.configured
              ? "Live provider is not configured."
              : "Enter the access token to run live."}
          </p>
        ) : (
          <p className={styles.context}>
            Live calls start only when you choose Run live. Completed
            comparisons are reused on resume.
          </p>
        )}
      </section>

      <section className={styles.flow} aria-label="Collection to entities">
        <article className={styles.source} data-testid="source-records">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Input · full collection</p>
              <h2>Source records</h2>
            </div>
            <span>
              {visibleRecords.length}/{collection.records.length}
            </span>
          </div>
          <input
            className={styles.search}
            aria-label="Search source records"
            placeholder="Search ID, site, city or reference"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.recordList}>
            {visibleRecords.map(({ id, project }) => (
              <details className={styles.recordCard} key={id}>
                <summary>
                  <code>{id}</code>
                  <span>{project.name}</span>
                  <small>
                    {project.city} · {project.reference}
                  </small>
                </summary>
                <Record project={project} />
              </details>
            ))}
          </div>
        </article>
        <div className={styles.arrow} aria-hidden="true">
          <span>candidate selection</span>
          <b>→</b>
          <small>record fields only</small>
        </div>
        <article className={styles.entities} data-testid="entity-groups">
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Output · proposed structure</p>
              <h2>Entity groups</h2>
            </div>
            <span>{groups.length}</span>
          </div>
          <div className={styles.filters}>
            <label>
              Status
              <select
                aria-label="Group status"
                value={groupStatus}
                onChange={(event) => setGroupStatus(event.target.value)}
              >
                <option value="all">All</option>
                <option value="linked">Linked</option>
                <option value="review">Review</option>
                <option value="pending">Pending</option>
                <option value="unlinked">No match</option>
              </select>
            </label>
            <label>
              Size
              <select
                aria-label="Group size"
                value={groupSize}
                onChange={(event) => setGroupSize(event.target.value)}
              >
                <option value="all">All</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3+">3+</option>
              </select>
            </label>
          </div>
          {results.length ? (
            <p className={styles.groupSummary}>
              {collection.records.length} records become {groups.length}{" "}
              proposed groups.
            </p>
          ) : (
            <p className={styles.empty}>No results yet</p>
          )}
          <div className={styles.groupList}>
            {visibleGroups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                selected={selectedGroup === group.id}
                records={byRecord}
                mode={mode}
                onSelect={(button) => {
                  inspectorOpener.current = button;
                  setSelectedGroup(group.id);
                }}
              />
            ))}
          </div>
        </article>
      </section>

      {selected ? (
        <Evidence
          sectionRef={inspectorRef}
          group={selected}
          records={byRecord}
          candidates={plan.candidates}
          results={byResult}
          mode={mode}
          onClose={() => {
            setSelectedGroup(null);
            inspectorOpener.current?.focus();
          }}
        />
      ) : null}

      <section className={styles.evidenceGrid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Reusable decision interface</p>
          <h2>Question and evidence</h2>
          <label>
            Prompt preset
            <select
              aria-label="Prompt preset"
              disabled={runState === "running"}
              value={
                PROMPTS.find(({ text }) => text === prompt)?.id ?? "custom"
              }
              onChange={(event) => {
                const preset = PROMPTS.find(
                  ({ id }) => id === event.target.value,
                );
                if (preset) change(() => setPrompt(preset.text));
              }}
            >
              <option value="custom" disabled>
                Custom
              </option>
              {PROMPTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            aria-label="Resolution instructions"
            disabled={runState === "running"}
            maxLength={8000}
            value={prompt}
            onChange={(event) => change(() => setPrompt(event.target.value))}
          />
          <fieldset disabled={runState === "running"}>
            <legend>Compared fields · at least one</legend>
            {FIELDS.map(({ key, label }) => (
              <label key={key} className={styles.check}>
                <input
                  type="checkbox"
                  checked={fields.includes(key)}
                  disabled={fields.length === 1 && fields.includes(key)}
                  onChange={() =>
                    change(() =>
                      setFields((current) =>
                        current.includes(key)
                          ? current.filter((field) => field !== key)
                          : [...current, key],
                      ),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className={styles.fine}>
            Each comparison asks one fixed-choice question: match, different, or
            review. The review threshold applies to the selected-option
            probability; confidence remains a separate provider value. A chat
            model can also return structured output—this interface makes a
            reusable decision over many records explicit.
          </p>
          <p className={styles.links}>
            <a
              href="https://docs.typesafe.ai/primitives/choice"
              target="_blank"
              rel="noreferrer"
            >
              TypeSafe Choice docs ↗
            </a>
            <a
              href="https://openrouter.ai/labs/jev/compile"
              target="_blank"
              rel="noreferrer"
            >
              OpenRouter Jev example ↗
            </a>
          </p>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Transparent evaluation</p>
              <h2>
                {mode === "demo" ? "Simulation metrics" : "Live run metrics"}
              </h2>
            </div>
            <button onClick={() => setRevealTruth((value) => !value)}>
              {revealTruth ? "Hide truth" : "Reveal truth"}
            </button>
          </div>
          <div className={styles.metrics}>
            <Metric
              label="Comparison completion"
              value={`${metrics.completed}/${plan.candidates.length}`}
            />
            <Metric
              label="Elapsed"
              value={elapsedMs == null ? "—" : `${elapsedMs} ms`}
            />
            <Metric
              label="Input tokens"
              value={
                mode === "live"
                  ? String(usage?.inputTokens ?? "unknown")
                  : "not measured"
              }
            />
            <Metric
              label="Cost"
              value={
                mode === "live" ? money(usage?.cost ?? null) : "not measured"
              }
            />
          </div>
          {revealTruth ? (
            <Truth collection={collection} metrics={metrics} />
          ) : (
            <p className={styles.fine}>
              Truth is hidden. Untested pairs remain unknown; they are not
              counted as negative decisions.
            </p>
          )}
          {actualModels.length ? (
            <p className={styles.actual}>
              Actual model version{actualModels.length > 1 ? "s" : ""}:{" "}
              {actualModels.join(", ")}
            </p>
          ) : null}
          <button
            className={styles.export}
            onClick={() =>
              download({
                version: 1,
                settings: {
                  count,
                  seed,
                  country,
                  cap,
                  mode,
                  model,
                  threshold,
                  prompt,
                  fields,
                },
                data: collection.records,
                truth: collection.truth,
                candidates: plan.candidates,
                results,
                proposedGroups: groups,
                metrics,
                actualModels,
                elapsedMs,
                usage,
              })
            }
          >
            Download experiment JSON
          </button>
        </article>
      </section>
    </main>
  );
}

function Record({ project }: { project: Record<ProjectField, string> }) {
  return (
    <div className={styles.fields}>
      {FIELDS.map(({ key, label }) => (
        <div key={key}>
          <b>{label}</b>
          <span>{project[key] || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function GroupCard({
  group,
  records,
  selected,
  mode,
  onSelect,
}: {
  group: EntityGroup;
  records: Map<string, { id: string; project: Record<ProjectField, string> }>;
  selected: boolean;
  mode: Mode;
  onSelect: (button: HTMLButtonElement) => void;
}) {
  const names = group.recordIds
    .map((id) => records.get(id)?.project.name)
    .filter(Boolean);
  const label =
    group.status === "unlinked"
      ? "No match found"
      : group.status === "pending"
        ? "Pending comparisons"
        : group.status === "review"
          ? "Needs review"
          : "Proposed link";
  return (
    <button
      className={`${styles.groupCard} ${styles[group.status]} ${selected ? styles.selected : ""}`}
      aria-label={`Inspect entity ${group.id}`}
      aria-pressed={selected}
      onClick={(event) => onSelect(event.currentTarget)}
    >
      <span className={styles.groupTop}>
        <code>{group.id}</code>
        <em>{mode === "demo" ? `Simulation · ${label}` : label}</em>
      </span>
      <strong>
        {group.recordIds.length} record{group.recordIds.length === 1 ? "" : "s"}
      </strong>
      <small>{names.join(" · ")}</small>
      {group.conflicts.length ? (
        <span className={styles.conflict}>
          {group.conflicts.length} comparison
          {group.conflicts.length === 1 ? "" : "s"} to review
        </span>
      ) : null}
    </button>
  );
}

function Evidence({
  sectionRef,
  group,
  records,
  candidates,
  results,
  mode,
  onClose,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  group: EntityGroup;
  records: Map<string, { id: string; project: Record<ProjectField, string> }>;
  candidates: Candidate[];
  results: Map<string, Resolution>;
  mode: Mode;
  onClose: () => void;
}) {
  const members = new Set(group.recordIds);
  const edges = candidates
    .filter(
      ({ leftId, rightId }) => members.has(leftId) || members.has(rightId),
    )
    .map((candidate) => ({ candidate, result: results.get(candidate.id) }));
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={styles.inspector}
      aria-label="Record evidence"
    >
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>
            {group.id} · {group.status} ·{" "}
            {mode === "demo" ? "simulation evidence" : "live Jev evidence"}
          </p>
          <h2>Record evidence</h2>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div className={styles.memberGrid}>
        {group.recordIds.map((id) => {
          const record = records.get(id);
          return record ? (
            <article key={id}>
              <code>{id}</code>
              <h3>{record.project.name}</h3>
              <Record project={record.project} />
            </article>
          ) : null;
        })}
      </div>
      <div className={styles.edges}>
        <h3>Comparisons involving this group</h3>
        {edges.length ? (
          edges.map(({ candidate, result }) => {
            const externalId = members.has(candidate.leftId)
              ? candidate.rightId
              : candidate.leftId;
            const external = !members.has(externalId)
              ? records.get(externalId)?.project.name
              : null;
            return (
              <div key={candidate.id}>
                <code>
                  {candidate.leftId} ↔ {candidate.rightId}
                  {external ? ` · outside group: ${external}` : ""}
                </code>
                {result ? (
                  <>
                    <strong>{result.decision}</strong>
                    <span>
                      {mode === "demo" ? "Simulated" : "Provider"}{" "}
                      selected-option probability{" "}
                      {Math.round(result.probabilities[result.choice] * 100)}%
                    </span>
                    <small>
                      Match {Math.round(result.probabilities.match * 100)}% ·
                      Different{" "}
                      {Math.round(result.probabilities.different * 100)}% ·
                      Review {Math.round(result.probabilities.review * 100)}%
                    </small>
                  </>
                ) : (
                  <>
                    <strong>Untested</strong>
                    <small>This selected candidate remains unknown.</small>
                  </>
                )}
              </div>
            );
          })
        ) : (
          <p>
            No candidate comparison touches this record. It remains pending, not
            a verified singleton.
          </p>
        )}
      </div>
    </section>
  );
}

function Truth({
  collection,
  metrics,
}: {
  collection: ReturnType<typeof generateCollection>;
  metrics: ReturnType<typeof evaluateCollection>;
}) {
  const groups = new Map<string, string[]>();
  for (const record of collection.records) {
    const id = collection.truth[record.id];
    groups.set(id, [...(groups.get(id) ?? []), record.id]);
  }
  return (
    <div className={styles.truth}>
      <p>Evaluation truth stays local and is never included in requests.</p>
      <div className={styles.metrics}>
        <Metric label="True groups" value={String(metrics.trueGroups)} />
        <Metric label="Candidate recall" value={pct(metrics.candidateRecall)} />
        <Metric
          label="Group pair precision"
          value={pct(metrics.groupPrecision)}
        />
        <Metric label="Group pair recall" value={pct(metrics.groupRecall)} />
      </div>
      <div className={styles.truthList}>
        {[...groups].map(([id, members]) => (
          <div key={id}>
            <code>{id}</code>
            <span>{members.join(" · ")}</span>
          </div>
        ))}
      </div>
    </div>
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
