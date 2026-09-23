import Link from "next/link";
import recording from "../data/jev-recording.json";
import RecordedExplorer, { type Capture } from "./recorded-explorer";
import styles from "./recorded-demo.module.css";

export default function RecordedDemo() {
  const capture = recording as Capture;
  return (
    <main className={styles.shell}>
      <a className={styles.skip} href="#dataset">
        Skip to dataset
      </a>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Jev · entity resolution</p>
          <h1>
            {capture.collection.records.length} records. Real Jev results.
          </h1>
          <p>
            Real Jev results, saved so viewing them costs nothing. Explore the
            records first, then inspect proposed groups and every recorded decision.
          </p>
        </div>
        <nav className={styles.actions} aria-label="Recorded demo navigation">
          <span>Recorded Jev run</span>
          <Link href="/experiment">Try your own dataset</Link>
          <Link href="/lab">Open lab</Link>
        </nav>
      </header>
      <RecordedExplorer capture={capture} />
    </main>
  );
}
