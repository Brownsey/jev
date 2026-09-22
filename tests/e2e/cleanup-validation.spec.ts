import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const store = "jev-resolution-lab:v1";

test("independent: real demo survives boundary edits and reload on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const batches: number[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/resolve")) batches.push(request.postDataJSON().pairs.length);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/lab");
  await page.getByLabel("Pair count").fill("40");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).dataset, store);
  await page.getByLabel("Review threshold").fill("-2");
  await expect(page.getByLabel("Review threshold")).toHaveValue("0");
  await page.getByLabel("Review threshold").fill("2");
  await expect(page.getByLabel("Review threshold")).toHaveValue("1");
  for (const name of ["Description", "Address", "Postcode", "City", "Country", "Developer", "Reference"])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Name", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("row")).toHaveCount(41);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).dataset, store)).toEqual(before);
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("40/40", { exact: true })).toBeVisible();
  expect(batches).toEqual([20, 20]);
  await expect(page.getByText(/^Run model:/)).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resolvedModels, store)).toEqual([]);
  await page.locator("summary").filter({ hasText: "Explore dataset" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Demo only: 40", { exact: true })).toBeVisible();
  await page.getByLabel("Resolution status", { exact: true }).selectOption("demo");
  await page.locator("summary").filter({ hasText: "Explore dataset" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/cleanup-validation-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const open = page.getByRole("button", { name: /^Open records/ }).first();
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Dataset record comparison" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/cleanup-validation-mobile.png" });
  await page.reload();
  await expect(page.getByText("40/40", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("independent: actual models from different live batches survive export and reload", async ({ page }) => {
  await page.route("**/api/config", (route) => route.fulfill({ json: { configured: true, accessRequired: false } }));
  let calls = 0;
  await page.route("**/api/resolve", (route) => {
    const input = route.request().postDataJSON();
    const actual = calls++ === 0 ? "typesafe/jev-1.13" : "typesafe/jev-1.14";
    return route.fulfill({ json: {
      mode: "live", model: actual, elapsedMs: 1, inputTokens: 1, cost: null,
      results: input.pairs.map((pair: { id: string }) => ({
        id: pair.id, choice: "different", decision: "different", confidence: 0.9,
        probabilities: { match: 0.05, different: 0.9, review: 0.05 },
      })),
    } });
  });
  await page.goto("/lab");
  await page.getByLabel("Pair count").fill("60");
  await page.getByRole("button", { name: "Generate pairs", exact: true }).click();
  await page.getByLabel("Model", { exact: true }).selectOption("~typesafe/jev-latest");
  await page.getByLabel("Mode", { exact: true }).selectOption("live");
  await page.getByRole("button", { name: "Run live", exact: true }).click();
  await expect(page.getByText("60/60", { exact: true })).toBeVisible();
  expect(calls).toBe(3);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evaluation", exact: true }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(exported.model).toBe("~typesafe/jev-latest");
  expect(exported.resolvedModels).toEqual(["typesafe/jev-1.13", "typesafe/jev-1.14"]);
  await page.reload();
  await expect(page.getByText("60/60", { exact: true })).toBeVisible();
  await expect(page.getByText("Run model: typesafe/jev-1.13, typesafe/jev-1.14", { exact: true })).toBeVisible();
  await page.getByLabel("Review threshold").fill("0.8");
  await expect(page.getByText("0/60", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).resolvedModels, store)).toEqual([]);
});
