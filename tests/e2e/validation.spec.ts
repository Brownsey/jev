import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const store = "jev-resolution-lab:v1";
test("validation: real backend batches, persists, exports and supports keyboard inspection", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const counts: number[] = []; page.on("request", request => { if (request.url().endsWith("/api/resolve")) counts.push(request.postDataJSON().pairs.length); });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await page.getByLabel("Pair count").fill("40");
  await page.getByLabel("Seed", { exact: true }).fill("4242");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(41);
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("40/40", { exact: true })).toBeVisible();
  expect(counts).toEqual([20, 20]);
  await expect(page.getByText(/not Jev, not benchmark evidence/)).toBeVisible();
  await page.screenshot({ path: ".artifacts/validation-desktop.png", fullPage: true });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), store);
  expect(saved.results).toHaveLength(40);
  await page.reload();
  await expect(page.getByText("40/40", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("4242");
  const rowButton = page.getByRole("row").nth(2).getByRole("button", { name: /^Inspect pair / });
  await rowButton.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Record inspector" }).getByRole("heading", { level: 2 })).toHaveText((await rowButton.getAttribute("aria-label"))!.replace("Inspect pair ", ""));
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evaluation", exact: true }).click();
  const download = await pendingDownload;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.results).toHaveLength(40);
  expect(typeof exported.elapsed).toBe("number");
  expect(exported.usage).toEqual({ inputTokens: null, cost: null });
  expect(JSON.stringify(exported)).toContain(saved.prompt);
  expect(JSON.stringify(exported)).not.toContain("accessToken");
  await page.getByLabel("Review threshold").fill("0.91");
  await expect(page.getByText("0/40", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("validation: fractional generator inputs show actionable validation and retain dataset", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(21);
  const firstId = await page.getByRole("row").nth(1).getByRole("button").getAttribute("aria-label");
  await page.getByLabel("Pair count").fill("20.5");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await expect(page.getByText("Pair count and seed must be whole numbers.", { exact: true })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(21);
  await expect(page.getByRole("row").nth(1).getByRole("button")).toHaveAttribute("aria-label", firstId!);
  await page.getByLabel("Pair count").fill("20");
  await page.getByLabel("Seed", { exact: true }).fill("42.5");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await expect(page.getByText("Pair count and seed must be whole numbers.", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").nth(1).getByRole("button")).toHaveAttribute("aria-label", firstId!);
  expect(errors).toEqual([]);
});

test("validation: cancel retains completed real backend batch and stops more batches", async ({ page }) => {
  let count = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/resolve", async route => {
    count++;
    const response = await route.fetch();
    if (count === 2) await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto("/");
  await page.getByLabel("Pair count").fill("60");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("20/60", { exact: true })).toBeVisible();
  await expect.poll(() => count).toBe(2);
  await expect(page.getByLabel("Resolution instructions")).toBeDisabled();
  await expect(page.getByLabel("Prompt preset")).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Name", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  release();
  await expect(page.getByText(/Cancelled.*20 completed results/)).toBeVisible();
  await expect(page.getByText("20/60", { exact: true })).toBeVisible();
  expect(count).toBe(2);
});

test("validation: token stays in memory and storage failures stay visible", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { configured: false, accessRequired: true, model: "typesafe/jev-1.13" } }));
  await page.goto("/");
  await page.getByLabel("Access token").fill("isolated-validation-access-secret");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("isolated-validation-access-secret");
  await page.reload();
  await expect(page.getByLabel("Access token")).toHaveValue("");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); }; });
  await page.getByLabel("Review threshold").fill("0.89");
  await expect(page.getByText(/Workspace could not be saved/)).toBeVisible();
});

test("validation: malformed saved workspace is nonfatal", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ version: 1, dataset: { seed: 1, country: "Mixed", pairs: [{}] }, fields: ["name"], results: [], prompt: "bad", threshold: .7, mode: "demo", model: "typesafe/jev-1.13" })), store);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "resolution lab", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(81);
  expect(errors).toEqual([]);
});

test("validation: duplicate saved results cannot inflate evaluation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  await page.evaluate(key => { const saved = JSON.parse(localStorage.getItem(key)!); saved.results.push(saved.results[0]); localStorage.setItem(key, JSON.stringify(saved)); }, store);
  await page.reload();
  await expect(page.getByText(/invalid.*not restored/i)).toBeVisible();
  await expect(page.getByText("21/20", { exact: true })).toHaveCount(0);
});

test("validation: Germany mobile view, empty search, labels and no page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("region", { name: "Dataset controls" }).getByLabel("Country", { exact: true }).selectOption("Germany");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/validation-mobile.png", fullPage: true });
  await page.getByLabel("Search pairs").fill("no such construction project 987654");
  await expect(page.getByText("No matching pairs.", { exact: true })).toBeVisible();
  await page.getByLabel("Search pairs").fill("");
  await page.getByRole("button", { name: "Run demo", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Run demo", exact: true })).toBeFocused();
  expect(await page.getByRole("button", { name: "Run demo", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: ".artifacts/validation-tablet.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
