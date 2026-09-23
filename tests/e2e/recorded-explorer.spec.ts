import { expect, test } from "@playwright/test";

test("the recorded demo starts with all 20 inspectable records", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/resolve")) requests.push(request.url());
  });
  await page.goto("/");
  const dataset = page.getByRole("region", {
    name: "Explore the full dataset",
  });
  await expect(dataset).toBeVisible();
  await expect(dataset.locator("details")).toHaveCount(20);
  await dataset.locator("summary").first().click();
  await expect(dataset.locator("details[open] dt")).toHaveCount(8);
  await page
    .getByLabel("Search dataset", { exact: true })
    .fill("no-such-project");
  await expect(
    dataset.getByText("No records match your filters."),
  ).toBeVisible();
  await page.getByLabel("Search dataset", { exact: true }).fill("");
  await expect(dataset.locator("details")).toHaveCount(20);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".artifacts/recorded20-early-desktop.png" });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: ".artifacts/recorded20-early-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(requests).toEqual([]);
});
