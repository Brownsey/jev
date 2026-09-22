import { expect, test } from "@playwright/test";
import type { Dataset } from "../../src/lib/types";

test("explores actual UK and German records without changing the saved evaluation", async ({
  page,
}) => {
  await page.goto("/lab");
  const disclosure = page
    .locator("summary")
    .filter({ hasText: "Explore dataset" });
  await expect(disclosure).toBeVisible();
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Generate pairs first to explore this dataset.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Pair count").fill("20");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await expect(
    page.getByRole("heading", { name: "Dataset explorer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run demo", exact: true }).click();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jev-resolution-lab:v1")!),
  );
  const dataset: Dataset = saved.dataset;
  for (const country of ["UK", "Germany"]) {
    const count = dataset.pairs.filter(
      (pair) => pair.left.country === country,
    ).length;
    await expect(
      page.getByRole("progressbar", {
        name: `${country}: ${count} of 20`,
        exact: true,
      }),
    ).toHaveAttribute("aria-valuenow", String(count));
  }
  const filled = dataset.pairs
    .flatMap((pair) => [
      ...Object.values(pair.left),
      ...Object.values(pair.right),
    ])
    .filter((value) => value.trim()).length;
  await expect(
    page.getByRole("progressbar", {
      name: `Provided fields: ${filled} of 320`,
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", String(filled));
  await expect(disclosure).toContainText("20");
  await expect(disclosure).toContainText(String(dataset.seed));
  await page.getByLabel("Filter dataset country").selectOption("Germany");
  const target = dataset.pairs.find((pair) => pair.left.country === "Germany")!;
  await page
    .getByLabel("Search dataset", { exact: true })
    .fill(target.left.reference);
  await page
    .getByRole("button", { name: `Open records ${target.id}`, exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Dataset record comparison",
  });
  await expect(comparison).toBeFocused();
  for (const record of [target.left, target.right]) {
    for (const value of Object.values(record)) {
      await expect(
        comparison.getByText(value || "Not provided", { exact: true }).first(),
      ).toBeVisible();
    }
  }
  await page
    .getByLabel("Search dataset", { exact: true })
    .fill("no-such-synthetic-project-987654321");
  await expect(page.getByText(/no .*pairs/i).first()).toBeVisible();
  await expect(comparison).toHaveCount(0);
  await page.getByLabel("Search dataset", { exact: true }).fill("");
  await page.getByLabel("Filter dataset country").selectOption("UK");
  await expect(
    page.getByRole("button", { name: /^Open records / }).first(),
  ).toBeVisible();
  await page.getByLabel("Filter dataset country").selectOption("All");
  const incomplete = dataset.pairs.find((pair) => !pair.right.description)!;
  await page.getByLabel("Search dataset", { exact: true }).fill(incomplete.id);
  await page
    .getByRole("button", { name: `Open records ${incomplete.id}`, exact: true })
    .click();
  await expect(
    comparison.getByText("Not provided", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("jev-resolution-lab:v1")!),
      ),
    )
    .toEqual(saved);
  await page.reload();
  await expect(disclosure).toContainText("20");
  await disclosure.click();
  await expect(
    page.getByRole("button", { name: /^Open records / }).first(),
  ).toBeVisible();
});

test("bounds large dataset cards and supports mobile browsing and pagination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await page.getByLabel("Pair count").fill("500");
  await page.getByRole("button", { name: "Generate pairs" }).click();
  await page.locator("summary").filter({ hasText: "Explore dataset" }).click();
  const cards = page.getByRole("button", { name: /^Open records / });
  await expect(cards).toHaveCount(12);
  const first = await cards.first().getAttribute("aria-label");
  await page.getByRole("button", { name: "Next pairs", exact: true }).click();
  await expect(cards.first()).not.toHaveAttribute("aria-label", first!);
  await page
    .getByRole("button", { name: "Previous pairs", exact: true })
    .click();
  await expect(cards.first()).toHaveAttribute("aria-label", first!);
  await page
    .getByLabel("Search dataset", { exact: true })
    .fill("no-such-record");
  await expect(cards).toHaveCount(0);
  await page.getByLabel("Search dataset", { exact: true }).fill("");
  await expect(cards).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
