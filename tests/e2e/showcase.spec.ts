import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/experiment");
});

test("runs the ready collection demo and shows honest group evidence", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", {
      name: "Turn records into reviewable entities",
    }),
  ).toBeVisible();
  await expect(page.getByText("18 records", { exact: true })).toBeVisible();
  await expect(
    page.locator("header").getByText("Simulation", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run simulation" }).click();

  await expect(
    page.getByText(/18 records become \d+ proposed groups/),
  ).toBeVisible();
  await expect(
    page.getByText("Simulation metrics", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic UK/Germany data", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/comparison completion/i)).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/Completed \d+\/\d+ comparisons/);
  await page
    .getByRole("button", { name: /Inspect entity/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Record evidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Record evidence" }),
  ).toBeFocused();
  await expect(
    page.getByText(/Match \d+% · Different \d+% · Review \d+%/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: /Inspect entity/ }).first()).toBeFocused();
  await page.getByRole("button", { name: "Reveal truth" }).click();
  await expect(
    page.locator("code").filter({ hasText: /^g-/ }).first(),
  ).toBeVisible();
});

test("invalidates results when an experiment setting changes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(page.getByText(/comparison completion/i)).toBeVisible();
  await page.getByLabel("Review threshold").fill("0.80");
  await expect(page.getByRole("status")).toContainText("Settings changed");
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeVisible();
  await expect(page.getByText("No results yet", { exact: true })).toBeVisible();
});

test("resumes only unfinished live comparisons and keeps the token out of storage", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/config", (route) =>
    route.fulfill({ json: { configured: true, accessRequired: true } }),
  );
  await page.route("**/api/resolve", async (route) => {
    requests++;
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer session-secret");
    const body = request.postDataJSON();
    const results = body.pairs.map((pair: { id: string }) => ({
      id: pair.id,
      decision: "different",
      choice: "different",
      confidence: 0.91,
      probabilities: { match: 0.04, different: 0.91, review: 0.05 },
    }));
    await route.fulfill({
      json: {
        results,
        mode: "live",
        elapsedMs: 12,
        inputTokens: 42,
        cost: 0.001,
        model: "typesafe/jev-1.13-202609",
      },
    });
  });
  await page.reload();
  await page.getByLabel("Mode", { exact: true }).selectOption("live");
  await page.getByLabel("App password").fill("session-secret");
  await page.getByRole("button", { name: "Run live" }).click();
  await expect(page.getByText(/Completed \d+\/\d+ comparisons/)).toBeVisible();
  const afterFirstRun = requests;
  await page.getByRole("button", { name: "Run live" }).click();
  expect(requests).toBe(afterFirstRun);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("jev-collection-showcase:v1"),
    ),
  ).not.toContain("session-secret");
  await expect(page.getByText("typesafe/jev-1.13-202609")).toBeVisible();
});

test("stacks the collection and entity views on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const source = page.getByTestId("source-records");
  const groups = page.getByTestId("entity-groups");
  await expect(source).toBeVisible();
  await expect(groups).toBeVisible();
  const sourceBox = await source.boundingBox();
  const groupsBox = await groups.boundingBox();
  expect(sourceBox && groupsBox && groupsBox.y).toBeGreaterThan(
    sourceBox?.y ?? 0,
  );
});
