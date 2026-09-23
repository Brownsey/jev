import { expect, test } from "@playwright/test";
import recording from "../../src/data/jev-recording.json";

test("recorded demo shows actual outcomes without requesting inference", async ({
  page,
}) => {
  const inference: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/resolve")) inference.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "20 records. Real Jev results." }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded Jev run", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "What ran" })
      .getByText(recording.response.model, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: /^Comparison \d+$/ }),
  ).toHaveCount(20);
  for (const [index, result] of recording.response.results
    .slice(0, 20)
    .entries()) {
    const comparison = page.getByRole("article", {
      name: `Comparison ${index + 1}`,
      exact: true,
    });
    await expect(comparison).toContainText(new RegExp(result.decision, "i"));
  }
  await expect(
    page.getByRole("link", { name: "Try your own dataset" }),
  ).toHaveAttribute("href", "/experiment");
  await expect(
    page.getByRole("region", { name: "Recorded run summary" }),
  ).toContainText("$0.004029732 USD");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Every comparison" }),
  ).toBeVisible();
  expect(inference).toEqual([]);
});
