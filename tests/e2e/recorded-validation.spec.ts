import { expect, test, type Locator } from "@playwright/test";
import recording from "../../src/data/jev-recording.json";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const fieldLabels = ["Name", "Description", "Address", "Postcode", "City", "Country", "Developer", "Reference"];

async function assertRecord(details: Locator, project: Record<string, string>) {
  await expect(details.locator("dt")).toHaveText(fieldLabels);
  await expect(details.locator("dd")).toHaveText(Object.values(project).map(value => value || "—"));
}

test("recording validation: every original choice, decision, confidence and probability is faithful", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/resolve", route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto("/");
  await expect(page.getByRole("article", { name: /^Comparison \d+$/ })).toHaveCount(10);
  const results = new Map(recording.response.results.map(result => [result.id, result]));
  for (const [index, candidate] of recording.candidates.entries()) {
    const result = results.get(candidate.id)!;
    const article = page.getByRole("article", { name: `Comparison ${index + 1}`, exact: true });
    const left = recording.collection.records.find(record => record.id === candidate.leftId)!;
    const right = recording.collection.records.find(record => record.id === candidate.rightId)!;
    await expect(article.locator("header b")).toHaveText(result.decision);
    await expect(article.locator("dl").first().locator("dd")).toHaveText([percent(result.confidence), result.choice]);
    const probabilities = article.locator('[aria-label="Choice probabilities"]');
    await expect(probabilities.locator("span")).toHaveText(["match", "different", "review"]);
    await expect(probabilities.locator("b")).toHaveText([result.probabilities.match, result.probabilities.different, result.probabilities.review].map(percent));
    await article.locator("summary").click();
    await assertRecord(article.locator("details dl").nth(0), left.project);
    await assertRecord(article.locator("details dl").nth(1), right.project);
  }
  const reviewed = page.getByRole("article", { name: "Comparison 2", exact: true });
  await expect(reviewed.locator("header b")).toHaveText("review");
  await expect(reviewed.locator("dl").first().locator("dd")).toHaveText(["49%", "match"]);
  await expect(page.getByText(/threshold applies to the selected-option probability/)).toContainText("0.72");
  await page.reload();
  await expect(page.getByRole("article", { name: /^Comparison \d+$/ })).toHaveCount(10);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(JSON.stringify(recording)).not.toMatch(/sk-or-|Bearer |OPENROUTER_API_KEY|JEV_ACCESS_TOKEN|JEV_APP_PASSWORD|accessToken|authorization/i);
});

test("recording validation: groups, exact metadata and prompt remain inspectable by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const groups = page.getByRole("region", { name: "Two clusters, both need review" }).getByRole("article");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0).locator("details")).toHaveCount(3);
  await expect(groups.nth(1).locator("details")).toHaveCount(2);
  for (const group of await groups.all()) await expect(group.getByText("review", { exact: true })).toBeVisible();
  for (const record of recording.collection.records) {
    const group = groups.nth(record.project.country === "UK" ? 0 : 1);
    const name = new RegExp(`^${record.project.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s`);
    const details = group.locator("details").filter({ has: page.locator("summary").filter({ hasText: name }) });
    const summary = details.locator("summary");
    await summary.focus();
    await expect(summary).toBeFocused();
    expect(await summary.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await assertRecord(details.locator("dl"), record.project);
    await page.keyboard.press("Space");
    await expect(details).not.toHaveAttribute("open", "");
  }
  const evidence = page.getByRole("region", { name: "What ran" });
  await expect(evidence.locator(":scope > dl dd")).toHaveText([
    "23 Sept 2026, 10:22:04 UTC", recording.response.model,
    "$0.000176568 USD", "4,204", "328 ms",
  ]);
  const promptToggle = evidence.locator("summary");
  await promptToggle.focus();
  await page.keyboard.press("Enter");
  await expect(evidence.getByText(recording.settings.prompt, { exact: true })).toBeVisible();
  await expect(evidence.getByText(fieldLabels.join(" · "), { exact: true })).toBeVisible();
  await expect(page.getByText(/Shared references and easy cross-country negatives/)).toBeVisible();
  const skip = page.getByRole("link", { name: "Skip to comparisons", exact: true });
  await expect(skip).not.toBeFocused();
  expect(await skip.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".artifacts/recorded-validation-desktop.png", fullPage: true });
});

test("recording validation: mobile has no overflow with expanded evidence", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: ".artifacts/recorded-validation-mobile.png" });
  const groups = page.getByRole("region", { name: "Two clusters, both need review" });
  await groups.locator("summary").first().click();
  await groups.screenshot({ path: ".artifacts/recorded-validation-mobile-groups.png" });
  const comparison = page.getByRole("article", { name: "Comparison 2", exact: true });
  await comparison.locator("summary").click();
  await comparison.screenshot({ path: ".artifacts/recorded-validation-mobile-evidence.png" });
  await page.getByRole("region", { name: "What ran" }).locator("summary").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(comparison.locator("details dl").nth(1)).toBeVisible();
});

test("recording validation: navigation preserves the existing experiment workspace", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/resolve", route => { requests.push(route.request().url()); return route.abort(); });
  await page.goto("/experiment");
  await expect(page.getByRole("heading", { name: "Turn records into reviewable entities" })).toBeVisible();
  await page.getByLabel("Record count", { exact: true }).selectOption("5");
  await page.getByLabel("Seed", { exact: true }).fill("12345");
  const key = "jev-collection-showcase:v1";
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}").generator?.seed, key)).toBe(12345);
  const saved = await page.evaluate(key => localStorage.getItem(key), key);
  await page.getByRole("link", { name: /View recorded Jev demo/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Five records. Two proposed entities." })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(saved);
  await page.getByRole("link", { name: "Try your own dataset", exact: true }).click();
  await expect(page).toHaveURL(/\/experiment$/);
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("12345");
  await expect(page.getByLabel("Record count", { exact: true })).toHaveValue("5");
  await page.getByRole("link", { name: /View recorded Jev demo/ }).click();
  await page.getByRole("link", { name: "Open lab", exact: true }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole("heading", { name: "resolution lab", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
