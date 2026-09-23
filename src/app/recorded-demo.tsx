import Link from "next/link";
import recording from "../data/jev-recording.json";
import { groupRecords } from "../lib/collection";
import type { Candidate, Collection } from "../lib/collection";
import { FIELDS } from "../lib/lab";
import type { Decision, Project, ProjectField, Resolution } from "../lib/types";
import styles from "./recorded-demo.module.css";

const capture = recording as {
  recordedAt: string;
  settings: {
    model: string;
    prompt: string;
    fields: ProjectField[];
    threshold: number;
  };
  collection: Collection;
  candidates: Candidate[];
  response: {
    results: Resolution[];
    inputTokens: number;
    cost: number;
    model: string;
    elapsedMs: number;
  };
};

const fieldLabels = new Map(FIELDS.map(({ key, label }) => [key, label]));
const pct = (value: number) => `${Math.round(value * 100)}%`;
const stamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
}).format(new Date(capture.recordedAt));
const records = new Map(
  capture.collection.records.map((record) => [record.id, record]),
);
const results = new Map(
  capture.response.results.map((result) => [result.id, result]),
);
const groups = groupRecords(
  capture.collection.records,
  capture.candidates,
  capture.response.results,
);
const totals = capture.response.results.reduce<Record<Decision, number>>(
  (total, result) => ({
    ...total,
    [result.decision]: total[result.decision] + 1,
  }),
  { match: 0, different: 0, review: 0 },
);

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

export default function RecordedDemo() {
  return (
    <main className={styles.shell}>
      <a className={styles.skip} href="#comparisons">
        Skip to comparisons
      </a>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Jev · entity resolution</p>
          <h1>Five records. Two proposed entities.</h1>
          <p>
            Real Jev results from five UK and German project records. Explore
            what matched, what stayed separate and what needs review. Viewing
            this saved run makes no API calls.
          </p>
        </div>
        <div className={styles.actions}>
          <span>Recorded Jev run</span>
          <Link href="/experiment">Try your own dataset</Link>
          <Link href="/lab">Open lab</Link>
        </div>
      </header>

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
      </section>
      <p className={styles.caveat}>
        Synthetic small example. Shared references and easy cross-country
        negatives make this useful for inspecting a result, not a benchmark.
      </p>

      <section className={styles.entities} aria-labelledby="entities-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Proposed grouping</p>
          <h2 id="entities-title">Two clusters, both need review</h2>
        </div>
        <p className={styles.warning}>
          A review edge touches both clusters. These are proposed groups only;
          no automatic merge is final.
        </p>
        <div className={styles.groupGrid}>
          {groups.map((group, index) => (
            <article className={styles.group} key={group.id}>
              <div className={styles.groupTitle}>
                <span>Proposed entity {index + 1}</span>
                <strong>{group.status}</strong>
              </div>
              <p>
                {group.recordIds.length} records · {group.conflicts.length}{" "}
                comparison{group.conflicts.length === 1 ? "" : "s"} needs review
              </p>
              {group.recordIds.map((id) => {
                const record = records.get(id)!;
                return (
                  <details key={id}>
                    <summary>
                      {record.project.name}{" "}
                      <small>{record.project.address}</small>
                    </summary>
                    <RecordDetails project={record.project} />
                  </details>
                );
              })}
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.comparisons}
        id="comparisons"
        aria-labelledby="comparisons-title"
      >
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Raw decisions</p>
          <h2 id="comparisons-title">Every comparison</h2>
        </div>
        <p className={styles.threshold}>
          The recorded {capture.settings.threshold} threshold applies to the
          selected-option probability, not provider confidence. A selected raw
          choice below it resolves to review; both labels remain visible.
        </p>
        <div className={styles.comparisonGrid}>
          {capture.candidates.map((candidate, index) => {
            const result = results.get(candidate.id)!;
            const left = records.get(candidate.leftId)!;
            const right = records.get(candidate.rightId)!;
            return (
              <article
                className={styles.comparison}
                aria-label={`Comparison ${index + 1}`}
                key={candidate.id}
              >
                <header>
                  <span>Comparison {index + 1}</span>
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
      </section>

      <section className={styles.evidence} aria-labelledby="evidence-title">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Capture metadata</p>
          <h2 id="evidence-title">What ran</h2>
        </div>
        <dl>
          <div>
            <dt>Recorded</dt>
            <dd>{stamp} UTC</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              <code>{capture.response.model}</code>
            </dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>${capture.response.cost.toFixed(9)} USD</dd>
          </div>
          <div>
            <dt>Input tokens</dt>
            <dd>{capture.response.inputTokens.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{capture.response.elapsedMs} ms</dd>
          </div>
        </dl>
        <details>
          <summary>Prompt and selected fields</summary>
          <p className={styles.prompt}>{capture.settings.prompt}</p>
          <p className={styles.fieldList}>
            {capture.settings.fields
              .map((field) => fieldLabels.get(field))
              .join(" · ")}
          </p>
        </details>
      </section>
    </main>
  );
}
