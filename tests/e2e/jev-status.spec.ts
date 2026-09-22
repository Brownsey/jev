import { expect, test } from "@playwright/test";

const store = "jev-resolution-lab:v1";

function result(id: string, decision: "match" | "different" | "review") {
  return {
    id,
    decision,
    choice: decision,
    confidence: decision === "review" ? 0.6 : 0.94,
    probabilities:
      decision === "match"
        ? { match: 0.94, different: 0.03, review: 0.03 }
        : decision === "different"
          ? { match: 0.03, different: 0.94, review: 0.03 }
          : { match: 0.2, different: 0.2, review: 0.6 },
  };
}

async function setup(page: import("@playwright/test").Page) {
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { configured: true, accessRequired: false, model: "typesafe/jev-1.13" } }),
  );
  await page.route("**/api/resolve", async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        mode: body.mode,
        model: body.model,
        elapsedMs: 4,
        inputTokens: null,
        cost: null,
        results: body.pairs.map((pair: { id: string }, index: number) =>
          result(pair.id, (["match", "different", "review"] as const)[index % 3]),
        ),
      },
    });
  });
  await page.goto("/lab");
}

test("model dropdown offers only Jev models and changing it invalidates results", async ({ page }) => {
  await setup(page);
  const model = page.getByLabel("Model");
  await expect(model).toHaveValue("typesafe/jev-1.13");
  await expect(model.locator("option")).toHaveText([
    "Jev 1.13",
    "Jev Latest (latest version)",
  ]);
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await page.getByRole("button", { name: "Run demo" }).click();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  await model.selectOption("~typesafe/jev-latest");
  await expect(page.getByText("Results need rerunning", { exact: true })).toBeVisible();
  await expect(page.getByText("0/20", { exact: true })).toBeVisible();
});

test("explorer separates live final, review, demo and not-run pairs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await page.locator(".settings").getByLabel("Mode", { exact: true }).selectOption("live");
  await page.getByRole("button", { name: "Run live" }).click();
  await page.locator("summary").filter({ hasText: "Explore dataset" }).click();
  const browser = page.getByRole("region", { name: "Browse dataset pairs" });
  await expect(page.getByText("Resolved by Jev: 14", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs review: 6", { exact: true })).toBeVisible();
  await expect(browser.getByText("Jev: match", { exact: true }).first()).toBeVisible();
  await expect(browser.getByText("Jev: needs review", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Resolution status").selectOption("resolved");
  await expect(browser.getByText("14 of 20 pairs", { exact: true })).toBeVisible();
  await expect(browser.getByText("Jev: match", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Resolution status").selectOption("review");
  await expect(browser.getByText("6 of 20 pairs", { exact: true })).toBeVisible();
  await expect(browser.getByText("Jev: needs review", { exact: true })).toHaveCount(6);
  await page.getByLabel("Resolution status").selectOption("unresolved");
  await expect(browser.getByText("6 of 20 pairs", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("demo results remain visibly distinct and unknown saved model clears stale evaluation", async ({ page }) => {
  await setup(page);
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await page.getByRole("button", { name: "Run demo" }).click();
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    saved.model = "not-a-jev-model";
    localStorage.setItem(key, JSON.stringify(saved));
  }, store);
  await page.reload();
  await expect(page.getByLabel("Model")).toHaveValue("typesafe/jev-1.13");
  await expect(page.getByText(/saved model.*reset/i)).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), store);
  expect(saved.results).toEqual([]);
  await page.getByRole("button", { name: "Run demo" }).click();
  await page.locator("summary").filter({ hasText: "Explore dataset" }).click();
  await expect(page.getByRole("region", { name: "Browse dataset pairs" }).locator("article").getByText("Demo only", { exact: true }).first()).toBeVisible();
});
