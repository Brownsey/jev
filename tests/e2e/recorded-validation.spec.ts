import { expect, test, type Locator } from "@playwright/test";
import recording from "../../src/data/jev-recording.json";
import { groupRecords } from "../../src/lib/collection";
import type { Resolution } from "../../src/lib/types";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const fieldLabels = ["Name", "Description", "Address", "Postcode", "City", "Country", "Developer", "Reference"];
const groups = groupRecords(recording.collection.records, recording.candidates, recording.response.results as Resolution[]);
const groupById = new Map(groups.flatMap(group => group.recordIds.map(id => [id, group] as const)));
const records = new Map(recording.collection.records.map(record => [record.id, record]));
const results = new Map(recording.response.results.map(result => [result.id, result]));
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
const money = (value: number | null) => value == null ? "Not reported" : `$${value.toFixed(9)} USD`;
let requests: string[];
let errors: string[];

test.beforeEach(async ({ page }) => {
  requests = [];
  errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/resolve", route => { requests.push(route.request().url()); return route.abort(); });
});
test.afterEach(() => { expect(requests).toEqual([]); expect(errors).toEqual([]); });

async function assertRecord(details: Locator, project: Record<string, string>) {
  await expect(details.locator("dt")).toHaveText(fieldLabels);
  await expect(details.locator("dd")).toHaveText(Object.values(project).map(value => value || "—"));
}

test("recording validation: all 190 comparisons retain exact evidence through pagination and filters", async ({ page }) => {
  await page.goto("/");
  const articles = page.getByRole("article", { name: /^Comparison \d+$/ });
  const previous = page.getByRole("button", { name: "Previous comparisons", exact: true });
  const next = page.getByRole("button", { name: "Next comparisons", exact: true });
  await expect(previous).toBeDisabled();
  for (let offset = 0; offset < recording.candidates.length; offset += 20) {
    const candidates = recording.candidates.slice(offset, offset + 20);
    await expect(articles).toHaveCount(candidates.length);
    await expect(articles.first()).toHaveAttribute("aria-label", `Comparison ${offset + 1}`);
    const evidence = await articles.evaluateAll(elements => elements.map(element => ({
      label: element.getAttribute("aria-label"), decision: element.querySelector("header b")?.textContent,
      choiceAndConfidence: [...element.querySelectorAll(":scope > dl dd")].map(node => node.textContent),
      probabilityLabels: [...element.querySelectorAll('[aria-label="Choice probabilities"] span')].map(node => node.textContent),
      probabilities: [...element.querySelectorAll('[aria-label="Choice probabilities"] b')].map(node => node.textContent),
      records: [...element.querySelectorAll("details dl")].map(dl => ({ labels: [...dl.querySelectorAll("dt")].map(node => node.textContent), values: [...dl.querySelectorAll("dd")].map(node => node.textContent) })),
    })));
    expect(evidence).toEqual(candidates.map((candidate, index) => {
      const result = results.get(candidate.id)!;
      return {
        label: `Comparison ${offset + index + 1}`, decision: result.decision,
        choiceAndConfidence: [percent(result.confidence), result.choice], probabilityLabels: ["match", "different", "review"],
        probabilities: [result.probabilities.match, result.probabilities.different, result.probabilities.review].map(percent),
        records: [candidate.leftId, candidate.rightId].map(id => ({ labels: fieldLabels, values: Object.values(records.get(id)!.project).map(value => value || "—") })),
      };
    }));
    await articles.first().locator("summary").click();
    await expect(articles.first().locator("details dl").nth(1)).toBeVisible();
    if (offset + 20 < recording.candidates.length) await next.click();
  }
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(articles.first()).toHaveAttribute("aria-label", "Comparison 161");
  for (const decision of ["match", "different", "review"]) {
    await page.getByRole("combobox", { name: "Comparison decision", exact: true }).selectOption(decision);
    await expect(previous).toBeDisabled();
    const expected = recording.candidates.flatMap((candidate, index) => results.get(candidate.id)!.decision === decision ? [`Comparison ${index + 1}`] : []);
    const observed: string[] = [];
    for (let offset = 0; offset < expected.length; offset += 20) {
      await expect(articles).toHaveCount(Math.min(20, expected.length - offset));
      const labels = await articles.evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")!));
      expect(labels).toEqual(expected.slice(offset, offset + 20)); observed.push(...labels);
      if (offset + 20 < expected.length) await next.click();
    }
    expect(observed).toEqual(expected); await expect(next).toBeDisabled();
  }
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Comparison decision", exact: true })).toHaveValue("all");
  await expect(articles).toHaveCount(20);
  await expect(articles.first()).toHaveAttribute("aria-label", "Comparison 1");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("recording validation: every dataset field is keyboard accessible and combined filters match records", async ({ page }) => {
  await page.goto("/");
  const dataset = page.getByRole("region", { name: "Explore the full dataset" });
  const details = dataset.locator("details");
  await expect(details).toHaveCount(20);
  for (const [index, record] of recording.collection.records.entries()) {
    const detail = details.nth(index);
    await detail.locator("summary").focus(); await expect(detail.locator("summary")).toBeFocused();
    expect(await detail.locator("summary").evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter"); await expect(detail).toHaveAttribute("open", "");
    await assertRecord(detail.locator("dl"), record.project);
    await page.keyboard.press("Space"); await expect(detail).not.toHaveAttribute("open", "");
  }
  const search = page.getByLabel("Search dataset", { exact: true });
  for (const field of recording.settings.fields as (keyof typeof recording.collection.records[number]["project"])[]) {
    const query = recording.collection.records.find(record => record.project[field])!.project[field];
    await search.fill(query.toUpperCase());
    const expected = recording.collection.records.filter(record => Object.values(record.project).join(" ").toLowerCase().includes(query.toLowerCase()));
    await expect(details.locator("summary strong")).toHaveText(expected.map(record => record.project.name));
    await expect(dataset.getByText(`${expected.length} of 20 records`, { exact: true })).toBeVisible();
  }
  await search.fill("");
  for (const country of ["All", "UK", "Germany"]) {
    await page.getByRole("combobox", { name: "Dataset country", exact: true }).selectOption({ label: country });
    for (const outcome of ["linked", "review", "unlinked", "pending"]) {
      await page.getByRole("combobox", { name: "Dataset outcome", exact: true }).selectOption(outcome);
      const expected = recording.collection.records.filter(record => {
        const group = groupById.get(record.id)!;
        return (country === "All" || record.project.country === country) && (outcome === "linked" ? group.recordIds.length > 1 : outcome === "unlinked" ? group.recordIds.length === 1 : group.status === outcome);
      });
      await expect(details.locator("summary strong")).toHaveText(expected.map(record => record.project.name));
      await expect(dataset.getByText(`${expected.length} of 20 records`, { exact: true })).toBeVisible();
      if (!expected.length) await expect(dataset.getByText("No records match your filters.", { exact: true })).toBeVisible();
    }
  }
  await search.fill("no-such-project-12345"); await expect(details).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue(""); await expect(details).toHaveCount(20);
  await page.getByRole("combobox", { name: "Dataset country", exact: true }).selectOption("Germany"); await search.fill("Berlin");
  await page.reload(); await expect(search).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Dataset country", exact: true })).toHaveValue("All"); await expect(details).toHaveCount(20);
});

test("recording validation: groups and aggregate metadata preserve all batch provenance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/");
  const dataset = page.getByRole("region", { name: "Explore the full dataset" });
  const groupRegion = page.getByRole("region", { name: "Proposed entity groups" });
  expect(await dataset.evaluate(element => Boolean(element.compareDocumentPosition(document.getElementById("entities-title")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const articles = groupRegion.getByRole("article"); await expect(articles).toHaveCount(groups.length);
  for (const [index, group] of groups.entries()) {
    const article = articles.nth(index); await expect(article.locator("details")).toHaveCount(group.recordIds.length);
    await expect(article.getByText(group.status === "review" ? "Needs review" : group.status === "unlinked" ? "No match found" : group.status, { exact: true })).toBeVisible();
    const fullRecords = await article.locator("details dl").evaluateAll(elements => elements.map(element => [...element.querySelectorAll("dd")].map(node => node.textContent)));
    expect(fullRecords).toEqual(group.recordIds.map(id => Object.values(records.get(id)!.project).map(value => value || "—")));
  }
  await expect(page.getByRole("region", { name: "Recorded run summary" }).getByText(money(recording.response.cost), { exact: true })).toBeVisible();
  const evidence = page.getByRole("region", { name: "What ran" });
  await expect(evidence.locator(":scope > dl dd")).toHaveText([`${date(recording.recordedAt)} UTC`, recording.response.model, money(recording.response.cost), recording.response.inputTokens == null ? "Not reported" : recording.response.inputTokens.toLocaleString(), `${recording.response.elapsedMs} ms`]);
  await evidence.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(evidence.getByText(recording.settings.prompt, { exact: true })).toBeVisible();
  await expect(evidence.getByText(fieldLabels.join(" · "), { exact: true })).toBeVisible();
  for (const [index, batch] of recording.batches.entries()) {
    const receipt = evidence.locator("p").filter({ hasText: new RegExp(`^Batch ${index + 1}:`) });
    await expect(receipt).toContainText(`${batch.response.results.length} comparisons`);
    await expect(receipt).toContainText(batch.response.model); await expect(receipt).toContainText(`${date(batch.recordedAt)} UTC`);
    await expect(receipt).toContainText(money(batch.response.cost));
    await expect(receipt).toContainText(batch.response.inputTokens == null ? "Not reported" : `${batch.response.inputTokens} tokens`);
  }
  const skip = page.getByRole("link", { name: "Skip to dataset", exact: true });
  await expect(skip).not.toBeFocused(); expect(await skip.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: ".artifacts/recorded20-validation-desktop.png" });
  await groupRegion.screenshot({ path: ".artifacts/recorded20-validation-groups.png" });
});

test("recording validation: mobile filters, expanded records and comparison pages fit 375 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto("/");
  await expect(page.getByRole("heading", { name: "20 records. Real Jev results." })).toBeVisible();
  await page.screenshot({ path: ".artifacts/recorded20-validation-mobile.png" });
  const dataset = page.getByRole("region", { name: "Explore the full dataset" });
  await page.getByRole("combobox", { name: "Dataset country", exact: true }).selectOption("Germany");
  await dataset.locator("summary").first().click();
  await dataset.locator("details").first().screenshot({ path: ".artifacts/recorded20-validation-mobile-record.png" });
  const comparison = page.getByRole("article", { name: "Comparison 2", exact: true });
  await comparison.locator("summary").click(); await comparison.screenshot({ path: ".artifacts/recorded20-validation-mobile-evidence.png" });
  await page.getByRole("button", { name: "Next comparisons", exact: true }).click();
  await expect(page.getByRole("article", { name: "Comparison 21", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "What ran" }).locator("summary").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("recording validation: navigation preserves the existing experiment workspace", async ({ page }) => {
  await page.goto("/experiment"); await expect(page.getByRole("heading", { name: "Turn records into reviewable entities" })).toBeVisible();
  await page.getByLabel("Record count", { exact: true }).selectOption("5"); await page.getByLabel("Seed", { exact: true }).fill("12345");
  const key = "jev-collection-showcase:v1";
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}").generator?.seed, key)).toBe(12345);
  const saved = await page.evaluate(key => localStorage.getItem(key), key);
  await page.getByRole("link", { name: /View recorded Jev demo/ }).click(); await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("Search dataset", { exact: true }).fill("Berlin"); await page.reload();
  await expect(page.getByRole("heading", { name: "20 records. Real Jev results." })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(saved);
  await page.getByRole("link", { name: "Try your own dataset", exact: true }).click(); await expect(page).toHaveURL(/\/experiment$/);
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("12345"); await expect(page.getByLabel("Record count", { exact: true })).toHaveValue("5");
  await page.getByRole("link", { name: /View recorded Jev demo/ }).click(); await page.getByRole("link", { name: "Open lab", exact: true }).click();
  await expect(page).toHaveURL(/\/lab$/); await expect(page.getByRole("heading", { name: "resolution lab", exact: true })).toBeVisible();
});
