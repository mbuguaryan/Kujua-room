import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

function hydrationErrors(page: Page) {
  const errors: string[] = [];
  const blocked =
    /Content Security Policy|React form unexpectedly submitted|Minified React error #412/i;
  page.on("console", (message) => {
    if (blocked.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (blocked.test(error.message)) errors.push(error.message);
  });
  return errors;
}

test("invalid public URL asks for an invitation", async ({ page }) => {
  const errors = hydrationErrors(page);
  await page.goto("/r/mens-conference", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Kujua Room" })).toBeVisible();
  await expect(page.getByText("Invitation required")).toBeVisible();
  expect(errors).toEqual([]);
});
test("invited join screen is accessible", async ({ page }) => {
  const errors = hydrationErrors(page);
  await page.goto("/r/mens-conference?invite=abcdefghijklmnopqrstuvwxyz_123456", { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("Your name");
  await expect(name).toBeVisible();
  await expect(page.getByRole("button", { name: "Join call" })).toBeDisabled();
  await name.fill("Hydration Check");
  await expect(name).toHaveValue("Hydration Check");
  expect(errors).toEqual([]);
});

test("host login hydrates and submits through fetch", async ({ page }) => {
  const errors = hydrationErrors(page);
  let loginStatus: number | undefined;
  await page.route("**/api/auth/host-login", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    loginStatus = 401;
    await route.fulfill({
      status: loginStatus,
      contentType: "application/json",
      body: JSON.stringify({ error: "Incorrect email or password." }),
    });
  });
  await page.goto("/host/login", { waitUntil: "domcontentloaded" });
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await email.fill("host@example.com");
  await password.fill("test-password");
  await expect(email).toHaveValue("host@example.com");
  await expect(password).toHaveValue("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(() => loginStatus).toBe(401);
  await expect(page.locator(".form-error")).toHaveText("Incorrect email or password.");
  expect(errors).toEqual([]);
});
