import { expect, test } from "@playwright/test";

test("generates a mixed dataset and resolves it in clearly labelled demo mode", async ({ page }) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "resolution lab" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Dataset controls" }).getByLabel("Country")).toHaveValue("Mixed");

  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  await page.getByRole("button", { name: "Run demo" }).click();

  await expect(page.getByText("Simulated heuristic", { exact: true })).toBeVisible();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
});

test("invalidates prior results when a resolution setting changes", async ({ page }) => {
  await page.goto("/lab");
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await page.getByRole("button", { name: "Run demo" }).click();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();

  await page.getByLabel("Review threshold").fill("0.85");
  await expect(page.getByText("Results need rerunning", { exact: true })).toBeVisible();
});
