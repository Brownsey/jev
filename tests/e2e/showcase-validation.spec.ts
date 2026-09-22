import { expect, test } from "@playwright/test";

test("validation: real demo reloads completed results and export includes truth", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeEnabled();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Completed \d+\/\d+ comparisons/)).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("jev-collection-showcase:v1"));
  expect(stored).toContain('"results"');
  expect(stored).not.toContain('"truth"');
  const resultCount = JSON.parse(stored!).results.length;
  await page.reload();
  await expect(page.getByText(`${resultCount}/${resultCount}`, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download experiment JSON" }).click();
  const exported = JSON.parse(await (await download).createReadStream().then(async stream => { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(chunk); return Buffer.concat(chunks).toString(); }));
  expect(exported.truth).toBeTruthy();
  expect(exported.results).toHaveLength(resultCount);
  await expect(page.getByText("Evaluation truth stays local", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal truth" }).click();
  await expect(page.getByText("Evaluation truth stays local", { exact: false })).toBeVisible();
});

test("validation: corrupt probability sum in an otherwise valid workspace is rejected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/Completed \d+\/\d+ comparisons/)).toBeVisible();
  await page.evaluate(() => { const raw = JSON.parse(localStorage.getItem("jev-collection-showcase:v1")!); raw.results[0].probabilities = { match: .8, different: .8, review: .1 }; localStorage.setItem("jev-collection-showcase:v1", JSON.stringify(raw)); });
  await page.reload();
  await expect(page.getByText("Saved workspace was invalid", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeEnabled();
});

test("validation: keyboard inspection works on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Run simulation" }).click();
  const group = page.getByRole("button", { name: /Inspect entity/ }).first();
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Record evidence" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("validation: cancellation retains a batch and resume sends only unfinished work", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Record count").selectOption("60");
  await page.getByLabel("Comparison cap").selectOption("50");
  let calls = 0; let firstIds: string[] = []; let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/resolve", async route => {
    calls++; const ids: string[] = route.request().postDataJSON().pairs.map((pair: { id: string }) => pair.id);
    if (calls === 1) { firstIds = ids; const response = await route.fetch(); await route.fulfill({ response }); return; }
    if (calls === 2) { await held; await route.abort(); return; }
    if (calls === 3) { await route.fulfill({ status: 502, json: { error: "Controlled failure" } }); return; }
    expect(ids.some(id => firstIds.includes(id))).toBeFalsy(); const response = await route.fetch(); await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByText("20/50", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click(); release();
  await expect(page.getByRole("status")).toContainText("Cancelled. Retained 20/");
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("status")).toContainText("Controlled failure");
  await expect(page.getByText("20/50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByRole("status")).toContainText("Completed 50/50");
});
