import { expect, test } from "@playwright/test";

const store = "jev-resolution-lab:v1";

test("independent: partial live status filters preserve results and coherent selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/config", route => route.fulfill({ json: { configured: true, accessRequired: false, model: "typesafe/jev-1.13" } }));
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/resolve", async route => {
    calls++;
    if (calls === 2) await gate;
    const input = route.request().postDataJSON();
    await route.fulfill({ json: {
      mode: "live", model: input.model, elapsedMs: 5, inputTokens: 12, cost: null,
      results: input.pairs.map((pair: { id: string }, index: number) => {
        const choice = (["match", "different", "review"] as const)[index % 3];
        return { id: pair.id, choice, decision: choice, confidence: 0.9, probabilities: {
          match: choice === "match" ? 0.9 : 0.05,
          different: choice === "different" ? 0.9 : 0.05,
          review: choice === "review" ? 0.9 : 0.05,
        } };
      }),
    } }).catch(() => {});
  });
  await page.goto("/lab");
  await page.getByLabel("Pair count").fill("60");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await page.getByLabel("Mode", { exact: true }).selectOption("live");
  await page.getByRole("button", { name: "Run live", exact: true }).click();
  await expect(page.getByText("20/60", { exact: true })).toBeVisible();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByLabel("Model", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  release();
  await expect(page.getByText(/Cancelled.*20 completed results/)).toBeVisible();
  await expect(page.getByLabel("Model", { exact: true })).toBeEnabled();
  for (const [row, label] of [[1, "Jev: match"], [2, "Jev: different"], [3, "Jev: needs review"], [21, "Not run with Jev"]] as const)
    await expect(page.getByRole("row").nth(row).getByText(label, { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Explore dataset" }).click();
  for (const label of ["Resolved by Jev: 14", "Needs review: 6", "Not run with Jev: 40", "Demo only: 0"])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  const browser = page.getByRole("region", { name: "Browse dataset pairs" });
  const comparison = page.getByRole("region", { name: "Dataset record comparison" });
  const status = page.getByLabel("Resolution status", { exact: true });
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), store);
  for (const [filter, count] of [["all", 60], ["resolved", 14], ["unresolved", 46], ["review", 6], ["demo", 0]] as const) {
    await status.selectOption(filter);
    await expect(browser.getByText(`${count} of 60 pairs`, { exact: true })).toBeVisible();
  }
  await status.selectOption("unresolved");
  await page.getByRole("button", { name: "Next pairs", exact: true }).click();
  await expect(page.getByText("Page 2 of 4", { exact: true })).toBeVisible();
  await status.selectOption("review");
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(comparison.getByText("Jev: needs review", { exact: true })).toBeVisible();
  const reviewIds = new Set(before.results.filter((row: { decision: string }) => row.decision === "review").map((row: { id: string }) => row.id));
  const germanReviews = before.dataset.pairs.filter((pair: { id: string; left: { country: string } }) => reviewIds.has(pair.id) && pair.left.country === "Germany");
  await page.getByLabel("Filter dataset country").selectOption("Germany");
  await expect(browser.getByText(`${germanReviews.length} of 60 pairs`, { exact: true })).toBeVisible();
  expect(germanReviews.length).toBeGreaterThan(0);
  await page.getByLabel("Search dataset", { exact: true }).fill(germanReviews[0].id);
  await expect(browser.getByText("1 of 60 pairs", { exact: true })).toBeVisible();
  await expect(comparison.getByRole("heading", { level: 3 })).toHaveText(germanReviews[0].id);
  await page.getByLabel("Search dataset", { exact: true }).fill("");
  await page.getByLabel("Filter dataset country").selectOption("All");
  await status.selectOption("all");
  await page.locator("summary").filter({ hasText: "Explore dataset" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/model-validation-desktop.png", fullPage: true });
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), store);
  expect(after.results).toEqual(before.results);
  expect(after.dataset).toEqual(before.dataset);
  expect(calls).toBe(2);
  await page.reload();
  await expect(page.getByText("20/60", { exact: true })).toBeVisible();
});

test("independent: mobile real demo, keyboard model selection and stale-model recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/lab");
  const model = page.getByRole("combobox", { name: "Model", exact: true });
  await model.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(model).toHaveValue("~typesafe/jev-latest");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  const response = page.waitForResponse(response => response.url().endsWith("/api/resolve") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Explore dataset" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Demo only: 20", { exact: true })).toBeVisible();
  const browser = page.getByRole("region", { name: "Browse dataset pairs" });
  for (const [filter, count] of [["unresolved", 20], ["demo", 20], ["resolved", 0], ["review", 0]] as const) {
    await page.getByLabel("Resolution status", { exact: true }).selectOption(filter);
    await expect(browser.getByText(`${count} of 20 pairs`, { exact: true })).toBeVisible();
  }
  await page.getByLabel("Resolution status", { exact: true }).selectOption("demo");
  await expect(browser.getByRole("article").getByText("Demo only", { exact: true })).toHaveCount(12);
  const open = browser.getByRole("button", { name: /^Open records/ }).first();
  await open.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Dataset record comparison" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/model-validation-mobile.png", fullPage: true });
  const before = await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    const original = structuredClone(saved);
    saved.model = "retired/provider-model"; saved.elapsed = 1234; saved.usage = { inputTokens: 100, cost: 0.5 };
    localStorage.setItem(key, JSON.stringify(saved));
    return original;
  }, store);
  await page.reload();
  await expect(model).toHaveValue("typesafe/jev-1.13");
  await expect(page.getByText(/saved model.*reset/i)).toBeVisible();
  await expect(page.getByText("0/20", { exact: true })).toBeVisible();
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), store);
  expect(after.dataset).toEqual(before.dataset);
  expect(after.results).toEqual([]);
  expect(after.elapsed).toBeNull();
  expect(after.usage).toBeNull();
  expect(errors).toEqual([]);
});
