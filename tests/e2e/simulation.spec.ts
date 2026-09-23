import { expect, test } from "@playwright/test";

test("default simulation visibly resolves pairs and triples without merging single projects", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run simulation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Completed \d+\/\d+ comparisons/);
  await page.getByLabel("Group status", { exact: true }).selectOption("linked");
  await expect(page.getByRole("button", { name: /Inspect entity/ }).filter({ hasText: "2 records" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Inspect entity/ }).filter({ hasText: "3 records" }).first()).toBeVisible();
  await page.getByLabel("Group status", { exact: true }).selectOption("unlinked");
  await expect(page.getByRole("button", { name: /Inspect entity/ }).filter({ hasText: "1 record" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reveal truth", exact: true }).click();
  await expect(page.getByText("18 records become 9 proposed groups.", { exact: true })).toBeVisible();
  await page.getByLabel("Group status", { exact: true }).selectOption("all");
  await page.getByRole("heading", { name: "Entity groups", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".artifacts/simulation-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Inspect entity/ }).filter({ hasText: "3 records" }).first().click();
  await expect(page.getByRole("region", { name: "Record evidence" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".artifacts/simulation-mobile.png" });
});

for (const view of [
  { path: "/", store: "jev-collection-showcase:v1", run: "Run simulation" },
  { path: "/lab", store: "jev-resolution-lab:v1", run: "Run demo" },
]) {
  test(`old simulation results reset without losing settings in ${view.path}`, async ({ page }) => {
    await page.goto(view.path);
    if (view.path === "/lab") {
      await page.getByLabel("Pair count").fill("20");
      await page.getByRole("button", { name: "Generate pairs" }).click();
    }
    await page.getByRole("button", { name: view.run, exact: true }).click();
    if (view.path === "/") await expect(page.getByRole("status")).toContainText(/Completed \d+\/\d+ comparisons/);
    else await expect(page.getByText("20/20", { exact: true })).toBeVisible();
    const before = await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      delete saved.simulationVersion;
      localStorage.setItem(key, JSON.stringify(saved));
      return saved;
    }, view.store);
    await page.reload();
    await expect(page.getByText("Simulation updated. Run again for refreshed matches.", { exact: true })).toBeVisible();
    const reset = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), view.store);
    expect(reset.results).toEqual([]);
    expect(reset.generator ?? reset.dataset).toEqual(before.generator ?? before.dataset);
    expect(reset.settings ?? reset.fields).toEqual(before.settings ?? before.fields);
    await page.getByRole("button", { name: view.run, exact: true }).click();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).results.length, view.store)).toBe(before.results.length);
    await page.reload();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).results.length, view.store)).toBe(before.results.length);
    // Exercise a controlled live response, then remove only the revision marker.
    await page.route("**/api/config", route => route.fulfill({ json: { configured: true, accessRequired: false } }));
    await page.route("**/api/resolve", route => {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: {
        mode: "live", model: "typesafe/jev-test-version", elapsedMs: 100,
        inputTokens: 50, cost: 0.001,
        results: body.pairs.map((pair: { id: string }) => ({ id: pair.id, decision: "different", choice: "different", confidence: 0.95, probabilities: { match: 0.02, different: 0.95, review: 0.03 } })),
      } });
    });
    await page.reload();
    await page.getByLabel("Mode", { exact: true }).selectOption("live");
    await page.getByRole("button", { name: "Run live", exact: true }).click();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).results.length, view.store)).toBe(before.results.length);
    const live = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), view.store);
    expect(live.actualModels ?? live.resolvedModels).toEqual(["typesafe/jev-test-version"]);
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      delete saved.simulationVersion;
      localStorage.setItem(key, JSON.stringify(saved));
    }, view.store);
    await page.reload();
    await expect(page.getByRole("button", { name: "Run live", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).results.length, view.store)).toBe(before.results.length);
    const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), view.store);
    expect(restored.results).toEqual(live.results);
    expect(restored.actualModels ?? restored.resolvedModels).toEqual(["typesafe/jev-test-version"]);
    expect(restored.usage).toEqual(live.usage);
    expect(restored.elapsedMs ?? restored.elapsed).toBe(live.elapsedMs ?? live.elapsed);
    await expect(page.getByText("Simulation updated. Run again for refreshed matches.", { exact: true })).toHaveCount(0);
  });
}
