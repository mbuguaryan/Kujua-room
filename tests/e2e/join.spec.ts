import { expect, test } from "@playwright/test";

test.setTimeout(60_000);
test("invalid public URL asks for an invitation", async ({ page }) => {
  await page.goto("/r/mens-conference", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Kujua Room" })).toBeVisible();
  await expect(page.getByText("Invitation required")).toBeVisible();
});
test("invited join screen is accessible", async ({ page }) => {
  await page.goto("/r/mens-conference?invite=abcdefghijklmnopqrstuvwxyz_123456", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join call" })).toBeDisabled();
});
