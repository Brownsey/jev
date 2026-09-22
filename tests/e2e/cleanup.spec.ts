import { expect, test } from "@playwright/test";

const store = "jev-resolution-lab:v1";

async function setup(page: import("@playwright/test").Page) {
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { configured: true, accessRequired: false } }),
  );
  await page.route("**/api/resolve", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        mode: body.mode,
        model: "typesafe/jev-1.12",
        elapsedMs: 4,
        inputTokens: null,
        cost: null,
        results: body.pairs.map((pair: { id: string }) => ({
          id: pair.id,
          decision: "match",
          choice: "match",
          confidence: 0.94,
          probabilities: { match: 0.94, different: 0.03, review: 0.03 },
        })),
      },
    });
  });
  await page.goto("/");
}

test("valid settings preserve generated data and resolved run models", async ({ page }) => {
  await setup(page);
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  const ids = await page.locator(".pair-select code").allTextContents();

  const threshold = page.getByLabel("Review threshold");
  await threshold.fill("2");
  await expect(threshold).toHaveValue("1");
  await threshold.fill("-1");
  await expect(threshold).toHaveValue("0");

  const fields = page.locator(".check input");
  const selectedFields = page.locator(".check input:checked");
  while ((await fields.count()) > 1 && (await selectedFields.count()) > 1)
    await selectedFields.first().click();
  await expect(selectedFields).toHaveCount(1);
  await expect(selectedFields).toBeDisabled();

  await page.locator(".settings").getByLabel("Mode", { exact: true }).selectOption("live");
  await page.getByRole("button", { name: "Run live" }).click();
  await expect(page.getByText("Run model: typesafe/jev-1.12", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evaluation" }).click();
  expect((await download).suggestedFilename()).toBe("jev-evaluation.json");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), store);
  expect(saved.resolvedModels).toEqual(["typesafe/jev-1.12"]);
  await page.reload();
  await expect(page.getByText("Workspace was invalid", { exact: false })).toHaveCount(0);
  await expect(page.locator(".pair-select code")).toHaveText(ids);
  await expect(page.getByText("Run model: typesafe/jev-1.12", { exact: true })).toBeVisible();

  await page.getByLabel("Model").selectOption("~typesafe/jev-latest");
  await expect(page.getByText("Run model: typesafe/jev-1.12", { exact: true })).toHaveCount(0);
});
