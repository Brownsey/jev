import { expect, test } from "@playwright/test";
import recording from "../../src/data/jev-recording.json";

test("recorded demo shows every actual outcome without requesting inference", async ({
  page,
}) => {
  const inference: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/resolve")) inference.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Five records. Two proposed entities." }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded Jev run", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(recording.response.model, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: /^Comparison \d+$/ }),
  ).toHaveCount(10);
  for (const [index, result] of recording.response.results.entries()) {
    const comparison = page.getByRole("article", {
      name: `Comparison ${index + 1}`,
      exact: true,
    });
    await expect(comparison).toContainText(new RegExp(result.decision, "i"));
  }
  await expect(
    page.getByRole("link", { name: "Try your own dataset" }),
  ).toHaveAttribute("href", "/experiment");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Every comparison" }),
  ).toBeVisible();
  expect(inference).toEqual([]);
});
